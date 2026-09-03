import { Injectable, Logger } from '@nestjs/common';
import type { MensajeEntrante, RespuestaBot } from '../channels/channel.types';
import { parsearComando, PREFIJO_BOTON_COMANDO } from './comandos';
import { FlowEngine } from './flow-engine.service';

/** Salida de emergencia de cualquier flujo. La atiende el router, no un handler. */
const COMANDO_CANCELAR = 'cancelar';

/** Qué hace un comando: responder de una, o abrir un flujo de varios pasos. */
export type ManejadorComando =
  | { tipo: 'respuesta'; ejecutar: (ctx: ContextoComando) => Promise<RespuestaBot> }
  | { tipo: 'flujo'; flujoId: string };

export interface ContextoComando {
  mensaje: MensajeEntrante;
  argumento?: string;
}

/**
 * Decide qué hacer con cada mensaje entrante.
 *
 * El orden importa: un comando siempre gana sobre el flujo en curso, para que
 * nadie quede atrapado en una conversación a medias. `/cancelar` existe por lo
 * mismo.
 */
@Injectable()
export class Router {
  private readonly logger = new Logger(Router.name);
  private readonly manejadores = new Map<string, ManejadorComando>();

  constructor(private readonly motor: FlowEngine) {}

  registrarComando(nombre: string, manejador: ManejadorComando): void {
    const clave = nombre.toLowerCase();

    if (this.manejadores.has(clave)) {
      throw new Error(`El comando "/${clave}" ya estaba registrado`);
    }

    this.manejadores.set(clave, manejador);
  }

  get comandosRegistrados(): string[] {
    // 'cancelar' no pasa por registrarComando —lo atiende el propio router—
    // pero existe, así que tiene que aparecer en el menú y en /ayuda.
    return [COMANDO_CANCELAR, ...this.manejadores.keys()];
  }

  async resolver(mensaje: MensajeEntrante, usuarioId?: string): Promise<RespuestaBot | null> {
    const comando = parsearComando(mensaje) ?? this.comandoDesdeBoton(mensaje);

    if (comando) {
      if (comando.nombre === COMANDO_CANCELAR) {
        return this.cancelar(mensaje);
      }

      const manejador = this.manejadores.get(comando.nombre);

      if (!manejador) {
        return this.comandoDesconocido(comando.nombre);
      }

      // Un comando nuevo descarta la conversación anterior: es una decisión
      // explícita del usuario de cambiar de tema.
      await this.motor.abandonar(mensaje);

      if (manejador.tipo === 'flujo') {
        return this.motor.iniciar(mensaje, manejador.flujoId, {}, usuarioId);
      }

      return manejador.ejecutar({ mensaje, argumento: comando.argumento });
    }

    const enFlujo = await this.motor.continuar(mensaje, usuarioId);

    if (enFlujo !== null) return enFlujo;

    return this.sinContexto(mensaje);
  }

  /**
   * Un botón puede disparar un comando (`cmd:ayuda`). Se resuelve antes que el
   * flujo en curso, igual que si el usuario lo hubiera escrito.
   */
  private comandoDesdeBoton(
    mensaje: MensajeEntrante,
  ): { nombre: string; argumento?: string } | null {
    const seleccion = mensaje.seleccionId;

    if (!seleccion?.startsWith(PREFIJO_BOTON_COMANDO)) return null;

    const resto = seleccion.slice(PREFIJO_BOTON_COMANDO.length);
    const [nombre, ...argumento] = resto.split(':');

    if (!nombre) return null;

    const arg = argumento.join(':').trim();

    return arg
      ? { nombre: nombre.toLowerCase(), argumento: arg }
      : { nombre: nombre.toLowerCase() };
  }

  private async cancelar(mensaje: MensajeEntrante): Promise<RespuestaBot> {
    const habia = await this.motor.tieneFlujoActivo(mensaje);
    await this.motor.abandonar(mensaje);

    return {
      texto: habia
        ? 'Listo, cancelé lo que estábamos haciendo. Escribe /ayuda si quieres ver las opciones.'
        : 'No había nada en curso. Escribe /ayuda si quieres ver las opciones.',
    };
  }

  private comandoDesconocido(nombre: string): RespuestaBot {
    this.logger.debug(`Comando no registrado: /${nombre}`);

    return {
      texto: `No conozco el comando /${nombre}.`,
      botones: [{ id: 'cmd:ayuda', texto: 'Ver qué puedo hacer' }],
    };
  }

  private sinContexto(mensaje: MensajeEntrante): RespuestaBot {
    // Llegó un botón de un mensaje viejo, o texto suelto sin conversación
    // abierta. Se orienta al usuario en vez de ignorarlo en silencio.
    if (mensaje.seleccionId) {
      return {
        texto: 'Ese botón ya no está disponible; seguramente es de un mensaje anterior.',
        botones: [{ id: 'cmd:ayuda', texto: 'Ver qué puedo hacer' }],
      };
    }

    return {
      texto: 'No estoy seguro de qué necesitas.',
      botones: [{ id: 'cmd:ayuda', texto: 'Ver qué puedo hacer' }],
    };
  }
}
