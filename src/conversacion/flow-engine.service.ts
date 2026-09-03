import { Injectable, Logger } from '@nestjs/common';
import type { MensajeEntrante, RespuestaBot } from '../channels/channel.types';
import { FlowRegistry } from './flow-registry.service';
import type { ContextoFlujo, DatosFlujo, Entrada, Transicion } from './flow.types';

/** Qué hizo el motor con un mensaje: lo atendió (con o sin respuesta) o no había flujo. */
export type ResultadoFlujo =
  { manejado: true; respuesta: RespuestaBot | null } | { manejado: false };
import { SesionStore } from './sesion.store';

/**
 * Tope de saltos encadenados sin intervención del usuario.
 *
 * Un paso puede resolverse solo y ceder el turno al siguiente (así el selector
 * de equipo no pregunta cuando no hay ambigüedad). Si una cadena de esas se
 * cierra sobre sí misma, este tope corta en vez de colgar el proceso.
 */
const MAX_SALTOS_AUTOMATICOS = 10;

@Injectable()
export class FlowEngine {
  private readonly logger = new Logger(FlowEngine.name);

  constructor(
    private readonly registro: FlowRegistry,
    private readonly sesiones: SesionStore,
  ) {}

  /** Arranca un flujo desde su paso inicial. */
  async iniciar(
    mensaje: MensajeEntrante,
    flujoId: string,
    datosIniciales: DatosFlujo = {},
    usuarioId?: string,
  ): Promise<RespuestaBot | null> {
    const flujo = this.registro.obtener(flujoId);

    if (!flujo) {
      throw new Error(`Flujo desconocido: "${flujoId}"`);
    }

    return this.entrarEn(mensaje, flujoId, flujo.pasoInicial, datosIniciales, usuarioId);
  }

  /**
   * Entrega un mensaje al flujo en curso.
   *
   * Distingue "no había flujo" de "el flujo lo atendió y no hay nada que
   * decir". Confundirlos hacía que terminar un flujo en silencio se
   * respondiera con "ese botón ya no está disponible": es la misma clase de
   * ambigüedad que el `null` de Redis, un valor con dos significados.
   */
  async continuar(mensaje: MensajeEntrante, usuarioId?: string): Promise<ResultadoFlujo> {
    const ref = { canal: mensaje.canal, canalUserId: mensaje.canalUserId };
    const sesion = await this.sesiones.leer(ref);

    if (!sesion) return { manejado: false };

    const paso = this.registro.obtenerPaso(sesion.flujoId, sesion.pasoId);

    if (!paso) {
      // El flujo cambió de forma entre despliegues y la sesión quedó apuntando
      // a un paso que ya no existe. Se descarta en vez de fallar en cada
      // mensaje que mande el usuario.
      this.logger.warn(
        `Sesión apuntaba a ${sesion.flujoId}/${sesion.pasoId}, que ya no existe. Se descarta.`,
      );
      await this.sesiones.borrar(ref);
      return { manejado: false };
    }

    const ctx: ContextoFlujo = { mensaje, datos: sesion.datos, usuarioId };

    if (!paso.recibir) {
      // Paso informativo: no espera respuesta, el flujo termina acá.
      await this.sesiones.borrar(ref);
      return { manejado: true, respuesta: null };
    }

    const transicion = await paso.recibir(ctx);
    const respuesta = await this.aplicar(
      mensaje,
      sesion.flujoId,
      sesion.pasoId,
      ctx.datos,
      transicion,
      usuarioId,
    );

    return { manejado: true, respuesta };
  }

  /** ¿El usuario tiene una conversación abierta? */
  async tieneFlujoActivo(mensaje: MensajeEntrante): Promise<boolean> {
    const sesion = await this.sesiones.leer({
      canal: mensaje.canal,
      canalUserId: mensaje.canalUserId,
    });

    return sesion !== null;
  }

  async abandonar(mensaje: MensajeEntrante): Promise<void> {
    await this.sesiones.borrar({ canal: mensaje.canal, canalUserId: mensaje.canalUserId });
  }

  private async aplicar(
    mensaje: MensajeEntrante,
    flujoId: string,
    pasoActualId: string,
    datos: DatosFlujo,
    transicion: Transicion,
    usuarioId?: string,
  ): Promise<RespuestaBot | null> {
    const ref = { canal: mensaje.canal, canalUserId: mensaje.canalUserId };

    switch (transicion.tipo) {
      case 'repetir': {
        // Se conserva el paso y se acumulan los datos nuevos sobre los previos.
        const acumulados = { ...datos, ...transicion.datos };
        await this.sesiones.guardar(ref, { flujoId, pasoId: pasoActualId, datos: acumulados });
        return transicion.respuesta;
      }

      case 'finalizar':
        await this.sesiones.borrar(ref);
        return transicion.respuesta ?? null;

      case 'ir':
        return this.entrarEn(
          mensaje,
          flujoId,
          transicion.pasoId,
          { ...datos, ...transicion.datos },
          usuarioId,
        );
    }
  }

  /**
   * Entra a un paso y sigue avanzando mientras los pasos se resuelvan solos,
   * hasta que alguno pida un mensaje al usuario o el flujo termine.
   */
  private async entrarEn(
    mensaje: MensajeEntrante,
    flujoId: string,
    pasoInicialId: string,
    datosIniciales: DatosFlujo,
    usuarioId?: string,
  ): Promise<RespuestaBot | null> {
    const ref = { canal: mensaje.canal, canalUserId: mensaje.canalUserId };
    let pasoId = pasoInicialId;
    let datos = datosIniciales;

    for (let salto = 0; salto < MAX_SALTOS_AUTOMATICOS; salto++) {
      const paso = this.registro.obtenerPaso(flujoId, pasoId);

      if (!paso) {
        throw new Error(`El flujo "${flujoId}" no tiene el paso "${pasoId}"`);
      }

      const ctx: ContextoFlujo = { mensaje, datos, usuarioId };
      const entrada: Entrada = await paso.entrar(ctx);
      datos = ctx.datos;

      if ('respuesta' in entrada) {
        // El paso espera al usuario: se persiste y se responde.
        await this.sesiones.guardar(ref, { flujoId, pasoId, datos });
        return entrada.respuesta;
      }

      const { transicion } = entrada;

      if (transicion.tipo === 'finalizar') {
        await this.sesiones.borrar(ref);
        return transicion.respuesta ?? null;
      }

      if (transicion.tipo === 'repetir') {
        await this.sesiones.guardar(ref, {
          flujoId,
          pasoId,
          datos: { ...datos, ...transicion.datos },
        });
        return transicion.respuesta;
      }

      datos = { ...datos, ...transicion.datos };
      pasoId = transicion.pasoId;
    }

    await this.sesiones.borrar(ref);
    throw new Error(
      `El flujo "${flujoId}" encadenó más de ${MAX_SALTOS_AUTOMATICOS} saltos automáticos ` +
        `desde "${pasoInicialId}". Probablemente haya un ciclo entre pasos.`,
    );
  }
}
