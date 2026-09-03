import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { RedisService } from '../core/redis/redis.service';
import { RESOLVEDOR_USUARIO, type ResolvedorUsuario } from '../conversacion/resolvedor-usuario';
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
    @Optional()
    @Inject(RESOLVEDOR_USUARIO)
    private readonly resolvedor?: ResolvedorUsuario,
  ) {}

  async procesar(mensaje: MensajeEntrante, updateId?: number): Promise<void> {
    // Resolver el adaptador va dentro del try: si el canal no tiene uno
    // registrado, `obtener` lanza, y fuera del try eso sería un rechazo sin
    // capturar que en Node termina el proceso.
    let adaptador: ChannelAdapter | undefined;

    try {
      adaptador = this.canales.obtener(mensaje.canal);

      if (updateId !== undefined && (await this.yaProcesado(mensaje.canal, updateId))) {
        this.logger.debug(`Update ${updateId} ya procesado, se descarta`);
        return;
      }

      // Antes que nada, para que el botón deje de girar.
      if (mensaje.acuseId) {
        await adaptador.acusarRecibo(mensaje.acuseId);
      }

      // Se resuelve antes de enrutar para que cualquier flujo pueda dar por
      // hecho que hay un usuario, sin repetir el alta en cada uno.
      const usuarioId = await this.resolvedor?.resolverUsuario(mensaje);

      const respuesta = await this.router.resolver(mensaje, usuarioId);

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

      if (adaptador) {
        await this.avisarDelError(adaptador, mensaje);
      }
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
    const resultado = await this.redis.ejecutar((redis) =>
      redis.set(`update:${canal}:${updateId}`, '1', 'EX', TTL_DEDUP_UPDATE_SEGUNDOS, 'NX'),
    );

    // Si Redis no respondió, se deja pasar. Descartar por un fallo de la caché
    // dejaría al usuario sin respuesta y sin rastro visible; procesar de más,
    // en cambio, lo cubre el chequeo de duplicados del dominio.
    if (!resultado.ok) return false;

    // Con el comando ejecutado, `null` sí es inequívoco: la clave ya existía.
    return resultado.valor === null;
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
