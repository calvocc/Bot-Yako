/**
 * Ventana en la que dos reportes del mismo tipo se consideran sospechosos.
 *
 * Sale de RF-3.5. Es lo bastante corta para no molestar en un partido con
 * muchos goles y lo bastante larga para cubrir a dos papás cargando el mismo
 * gol desde tribunas distintas.
 */
export const VENTANA_DEDUP_MS = 60_000;

/**
 * Con qué se puede distinguir un evento de otro para decidir si preguntar.
 *
 * Un cambio no tiene "el" jugador del evento: tiene a quien sale y a quien
 * entra, y son esos dos —no un solo id— los que hacen que dos sustituciones
 * simultáneas se puedan distinguir sin preguntar. Un discriminador explícito
 * evita mezclar los dos modelos por accidente.
 */
export type EventoComparable =
  | { modo: 'jugador'; jugadorId: string | null }
  | { modo: 'cambio'; sale: string | null; entra: string | null };

/**
 * ¿El evento nuevo puede ser el mismo que uno recién cargado? (M1)
 *
 * La regla del documento comparaba solo tipo y equipo, así que un gol de Jacob
 * y otro de Andrés 40 segundos después disparaban una pregunta que no tenía
 * nada de ambiguo. Con los dos jugadores identificados y distintos, no hay
 * duda posible: son dos goles. Un cambio sigue el mismo principio comparando
 * quién entra: dos sustituciones con entradas distintas no son la misma.
 *
 * Cuando algo no está identificado —"Otro jugador", un gol del rival, o un
 * cambio a medio cargar— sí hay que preguntar: no hay con qué distinguirlos.
 */
export function puedeSerDuplicado(reciente: EventoComparable, nuevo: EventoComparable): boolean {
  if (reciente.modo === 'cambio' && nuevo.modo === 'cambio') {
    if (!reciente.entra || !nuevo.entra) return true;

    return reciente.entra === nuevo.entra;
  }

  if (reciente.modo === 'jugador' && nuevo.modo === 'jugador') {
    if (!reciente.jugadorId || !nuevo.jugadorId) return true;

    return reciente.jugadorId === nuevo.jugadorId;
  }

  // Modos distintos no debería pasar —el lock ya separa por tipo de evento,
  // y el tipo determina el modo—, pero sin nada comparable en común no hay
  // por qué asumir que son la misma cosa.
  return true;
}

/** Cuánto hace, en segundos, para el texto de la advertencia. */
export function segundosDesde(instante: Date, ahora: Date = new Date()): number {
  return Math.max(0, Math.round((ahora.getTime() - instante.getTime()) / 1000));
}
