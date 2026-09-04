/**
 * Quién sigue en cancha, derivado de la titular y los cambios — nunca
 * guardado aparte.
 *
 * Mismo principio que el marcador (que el trigger deriva de `eventos` en vez
 * de mantenerse como un contador aparte que se pueda desincronizar): una
 * segunda fuente de verdad para "quién está jugando" tarde o temprano se
 * desalinea de los eventos que en realidad pasaron.
 */

export interface CambioJugado {
  /** Quien sale. */
  sale: string;
  /** Quien entra. */
  entra: string;
}

/**
 * Arranca de la titular y aplica los cambios en el orden en que se cargaron.
 *
 * Puro y sin base de datos a propósito: es la pieza que más vale la pena
 * probar con encadenamientos (A sale, entra B; después B sale, entra C) sin
 * pagar el costo de una transacción real por cada caso.
 */
export function derivarEnCancha(
  titulares: readonly string[],
  cambios: readonly CambioJugado[],
): Set<string> {
  const enCancha = new Set(titulares);

  for (const cambio of cambios) {
    enCancha.delete(cambio.sale);
    enCancha.add(cambio.entra);
  }

  return enCancha;
}
