/**
 * Ventana en la que dos reportes del mismo tipo se consideran sospechosos.
 *
 * Sale de RF-3.5. Es lo bastante corta para no molestar en un partido con
 * muchos goles y lo bastante larga para cubrir a dos papás cargando el mismo
 * gol desde tribunas distintas.
 */
export const VENTANA_DEDUP_MS = 60_000;

export interface EventoComparable {
  jugadorId: string | null;
}

/**
 * ¿El evento nuevo puede ser el mismo que uno recién cargado? (M1)
 *
 * La regla del documento comparaba solo tipo y equipo, así que un gol de Jacob
 * y otro de Andrés 40 segundos después disparaban una pregunta que no tenía
 * nada de ambiguo. Con los dos jugadores identificados y distintos, no hay
 * duda posible: son dos goles.
 *
 * Cuando alguno de los dos no tiene jugador —"Otro jugador", o un gol del
 * rival— sí hay que preguntar: no hay con qué distinguirlos.
 */
export function puedeSerDuplicado(reciente: EventoComparable, nuevo: EventoComparable): boolean {
  if (!reciente.jugadorId || !nuevo.jugadorId) return true;

  return reciente.jugadorId === nuevo.jugadorId;
}

/** Cuánto hace, en segundos, para el texto de la advertencia. */
export function segundosDesde(instante: Date, ahora: Date = new Date()): number {
  return Math.max(0, Math.round((ahora.getTime() - instante.getTime()) / 1000));
}
