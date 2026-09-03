import type { MensajeEntrante, RespuestaBot } from '../channels/channel.types';

/**
 * Datos que un flujo va acumulando entre pasos (el nombre del equipo que se
 * está creando, el partido elegido, etc.). Se serializa a JSON, así que solo
 * admite valores serializables.
 */
export type DatosFlujo = Record<string, unknown>;

export interface ContextoFlujo {
  mensaje: MensajeEntrante;
  datos: DatosFlujo;
  /** Usuario ya resuelto. Ausente mientras la cuenta no existe (onboarding). */
  usuarioId?: string;
}

/** A dónde va el flujo después de procesar la respuesta del usuario. */
export type Transicion =
  | { tipo: 'ir'; pasoId: string; datos?: DatosFlujo }
  /**
   * La respuesta no sirvió, o el paso admite varias entradas seguidas: se
   * queda en el paso y explica. `datos` permite acumular entre repeticiones,
   * como al cargar la plantilla de a varios jugadores.
   */
  | { tipo: 'repetir'; respuesta: RespuestaBot; datos?: DatosFlujo }
  | { tipo: 'finalizar'; respuesta?: RespuestaBot };

/**
 * Lo que produce un paso al entrar: o manda un mensaje y espera, o resuelve
 * solo y sigue de largo sin escribir nada.
 *
 * La segunda forma es la que permite que el selector de equipo no moleste al
 * usuario que pertenece a un solo equipo (RF-7.2): decide y cede el turno.
 */
export type Entrada = { respuesta: RespuestaBot } | { transicion: Transicion };

export interface Paso {
  readonly id: string;
  /** Se ejecuta al llegar al paso. */
  entrar(ctx: ContextoFlujo): Promise<Entrada>;
  /**
   * Procesa lo que contestó el usuario. Si el paso no lo define, es
   * informativo y el flujo termina ahí.
   */
  recibir?(ctx: ContextoFlujo): Promise<Transicion>;
}

export interface Flujo {
  readonly id: string;
  readonly pasoInicial: string;
  readonly pasos: readonly Paso[];
}

/** Estado persistido de una conversación en curso. */
export interface EstadoSesion {
  flujoId: string;
  pasoId: string;
  datos: DatosFlujo;
  actualizadoEn: string;
}

/**
 * Lee un dato del flujo como texto.
 *
 * `datos` se serializa a JSON, así que su contenido es `unknown` al releerlo.
 * Sin este estrechamiento, un `String(...)` sobre un valor inesperado
 * imprimiría "[object Object]" en medio de un mensaje al usuario.
 */
export function leerTexto(datos: DatosFlujo, clave: string, porDefecto = ''): string {
  const valor = datos[clave];

  if (typeof valor === 'string') return valor;
  if (typeof valor === 'number') return String(valor);

  return porDefecto;
}

/** Lee un dato del flujo como número, con respaldo si no lo es. */
export function leerNumero(datos: DatosFlujo, clave: string, porDefecto = 0): number {
  const valor = datos[clave];
  const numero = typeof valor === 'number' ? valor : Number(valor);

  return Number.isFinite(numero) ? numero : porDefecto;
}

export function construirRespuesta(
  texto: string,
  opciones: Omit<RespuestaBot, 'texto'> = {},
): RespuestaBot {
  return { texto, ...opciones };
}
