import { Injectable, Logger } from '@nestjs/common';
import type { MensajeEntrante, RespuestaBot } from '../channels/channel.types';
import { textos as textosComunes } from '../textos/comunes';
import { textos } from '../textos/router';
import { esComandoDeFlujo, parsearComando, PREFIJO_BOTON_COMANDO } from './comandos';
import { FlowEngine } from './flow-engine.service';
import type { DatosFlujo } from './flow.types';

/** Salida de emergencia de cualquier flujo. La atiende el router, no un handler. */
const COMANDO_CANCELAR = 'cancelar';

/**
 * Permite que un handler simple decida, ya con los datos en la mano, que en
 * realidad hace falta abrir un flujo. Es lo que hace que `/unirme CODIGO`
 * responda de una y `/unirme` a secas pregunte el código.
 */
export interface DelegarAFlujo {
  tipo: 'delegar';
  flujoId: string;
  datos?: DatosFlujo;
}

/** Qué hace un comando: responder de una, o abrir un flujo de varios pasos. */
export type ManejadorComando =
  | {
      tipo: 'respuesta';
      ejecutar: (ctx: ContextoComando, usuarioId?: string) => Promise<RespuestaBot | DelegarAFlujo>;
    }
  | {
      tipo: 'flujo';
      flujoId: string;
      /** Datos con los que arranca el flujo, derivados del comando. */
      datosIniciales?: (ctx: ContextoComando) => DatosFlujo;
    };

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

      // Palabras que le pertenecen al flujo en curso (/listo y compañía) se le
      // entregan a él; fuera de un flujo no significan nada.
      if (esComandoDeFlujo(comando.nombre) && (await this.motor.tieneFlujoActivo(mensaje))) {
        const enFlujo = await this.motor.continuar(mensaje, usuarioId);

        if (enFlujo.manejado) return enFlujo.respuesta;
      }

      const manejador = this.manejadores.get(comando.nombre);

      if (!manejador) {
        return this.comandoDesconocido(comando.nombre);
      }

      // Un comando nuevo descarta la conversación anterior: es una decisión
      // explícita del usuario de cambiar de tema.
      await this.motor.abandonar(mensaje);

      const contexto: ContextoComando = { mensaje, argumento: comando.argumento };

      if (manejador.tipo === 'flujo') {
        return this.motor.iniciar(
          mensaje,
          manejador.flujoId,
          manejador.datosIniciales?.(contexto) ?? {},
          usuarioId,
        );
      }

      const resultado = await manejador.ejecutar(contexto, usuarioId);

      if (esDelegacion(resultado)) {
        return this.motor.iniciar(mensaje, resultado.flujoId, resultado.datos ?? {}, usuarioId);
      }

      return resultado;
    }

    const enFlujo = await this.motor.continuar(mensaje, usuarioId);

    // Solo si de verdad no había flujo se orienta al usuario; un flujo que
    // terminó sin nada que decir no es un botón caducado.
    if (enFlujo.manejado) return enFlujo.respuesta;

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

    return { texto: habia ? textos.canceladoConFlujo() : textos.canceladoSinFlujo() };
  }

  private comandoDesconocido(nombre: string): RespuestaBot {
    this.logger.debug(`Comando no registrado: /${nombre}`);

    return {
      texto: textos.comandoDesconocido(nombre),
      botones: [textosComunes.botonAyuda()],
    };
  }

  private sinContexto(mensaje: MensajeEntrante): RespuestaBot {
    // Llegó un botón de un mensaje viejo, o texto suelto sin conversación
    // abierta. Se orienta al usuario en vez de ignorarlo en silencio.
    if (mensaje.seleccionId) {
      return { texto: textos.botonViejo(), botones: [textosComunes.botonAyuda()] };
    }

    return { texto: textos.sinContexto(), botones: [textosComunes.botonAyuda()] };
  }
}

function esDelegacion(valor: RespuestaBot | DelegarAFlujo): valor is DelegarAFlujo {
  return 'tipo' in valor && valor.tipo === 'delegar';
}
