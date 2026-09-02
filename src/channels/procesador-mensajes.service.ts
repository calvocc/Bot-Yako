import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../core/redis/redis.service';
import { Router } from '../conversacion/router.service';
import type { ChannelAdapter } from './channel-adapter.interface';
import { ChannelRegistry } from './channel.registry';
import { claveReferencia, type Canal, type MensajeEntrante } from './channel.types';

/** Cuánto se recuerda un update ya procesado, para descartar reentregas. */
const TTL_DEDUP_UPDATE_SEGUNDOS = 300;

/**
 * Une la capa de canal con el motor conversacional.
 *
 * Es el único punto donde se cruzan: recibe un mensaje ya normalizado, deja que
 * el router decida qué responder, y devuelve la respuesta por el mismo canal
 * por el que llegó.
 */
@Injectable()
export class ProcesadorMensajes {
  private readonly logger = new Logger(ProcesadorMensajes.name);

  constructor(
    private readonly canales: ChannelRegistry,
    private readonly router: Router,
    private readonly redis: RedisService,
  ) {}

  async procesar(mensaje: MensajeEntrante, updateId?: number): Promise<void> {
    const adaptador = this.canales.obtener(mensaje.canal);

    try {
      if (updateId !== undefined && (await this.yaProcesado(mensaje.canal, updateId))) {
        this.logger.debug(`Update ${updateId} ya procesado, se descarta`);
        return;
      }

      // Antes que nada, para que el botón deje de girar.
      if (mensaje.acuseId) {
        await adaptador.acusarRecibo(mensaje.acuseId);
      }

      const respuesta = await this.router.resolver(mensaje);

      if (respuesta) {
        await adaptador.enviar({ canal: mensaje.canal, chatId: mensaje.chatId }, respuesta);
      }
    } catch (error) {
      // El webhook ya respondió 200, así que este es el último lugar donde el
      // error puede registrarse. Y el usuario merece saber que algo falló en
      // vez de quedarse mirando el chat.
      this.logger.error(
        `Error procesando mensaje de ${claveReferencia(mensaje)}`,
        error instanceof Error ? error.stack : String(error),
      );

      await this.avisarDelError(adaptador, mensaje);
    }
  }

  /**
   * Telegram reentrega un update si no recibe 200 a tiempo. Sin este chequeo,
   * una reentrega registraría el mismo gol dos veces.
   *
   * La reserva se hace con `SET NX`, que decide y escribe en una sola
   * operación: dos entregas simultáneas del mismo update no pueden pasar
   * ambas. Si Redis no está disponible se deja pasar, y queda como respaldo el
   * chequeo de duplicados del dominio.
   */
  private async yaProcesado(canal: Canal, updateId: number): Promise<boolean> {
    if (!this.redis.disponible) return false;

    const reservado = await this.redis.intentar((redis) =>
      redis.set(`update:${canal}:${updateId}`, '1', 'EX', TTL_DEDUP_UPDATE_SEGUNDOS, 'NX'),
    );

    // 'OK' = la reserva es nuestra, es la primera vez. null = ya estaba (o
    // Redis se cayó entre medio, en cuyo caso reprocesar es lo seguro).
    return reservado === null && this.redis.disponible;
  }

  private async avisarDelError(adaptador: ChannelAdapter, mensaje: MensajeEntrante): Promise<void> {
    try {
      await adaptador.enviar(
        { canal: mensaje.canal, chatId: mensaje.chatId },
        { texto: 'Se me complicó procesar eso. Inténtalo de nuevo en un momento.' },
      );
    } catch {
      // Si tampoco se puede avisar, ya quedó el error en el log.
    }
  }
}
