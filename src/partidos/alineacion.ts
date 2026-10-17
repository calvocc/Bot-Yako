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
  /** Minuto real del cambio; `null` si no hay reloj (post partido). */
  minuto: number | null;
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

/**
 * Minutos jugados por cada jugador, para el bono de cierre de `puntaje.ts`
 * (valla invicta / goles recibidos exige ≥60% de los minutos a un
 * arquero/defensa).
 *
 * Arranca a cada titular en el minuto 0 y abre/cierra un intervalo por cada
 * cambio, en el mismo orden en que se cargaron los cambios (el orden de
 * `cambiosDe`, no un reordenamiento por minuto) — mismo criterio que
 * `derivarEnCancha`. Soporta reentradas: alguien que sale y vuelve a entrar
 * suma los dos tramos por separado.
 *
 * Un cambio sin minuto (post partido, sin reloj) se trata como ocurrido en
 * `minutoFinal` — aproximación documentada, no hay mejor dato posible sin
 * reloj real.
 */
export function calcularMinutosJugados(
  minutoFinal: number,
  titulares: readonly string[],
  cambios: readonly CambioJugado[],
): Map<string, number> {
  const desde = new Map<string, number>();
  const acumulado = new Map<string, number>();

  for (const jugadorId of titulares) desde.set(jugadorId, 0);

  const cerrar = (jugadorId: string, hasta: number): void => {
    const inicio = desde.get(jugadorId);

    if (inicio === undefined) return;

    acumulado.set(jugadorId, (acumulado.get(jugadorId) ?? 0) + Math.max(0, hasta - inicio));
    desde.delete(jugadorId);
  };

  for (const cambio of cambios) {
    const minuto = cambio.minuto ?? minutoFinal;

    cerrar(cambio.sale, minuto);
    desde.set(cambio.entra, minuto);
  }

  // Quien seguía en cancha al final: cierra el tramo contra `minutoFinal`.
  for (const [jugadorId, inicio] of desde) {
    acumulado.set(jugadorId, (acumulado.get(jugadorId) ?? 0) + Math.max(0, minutoFinal - inicio));
  }

  return acumulado;
}

/**
 * Goles en contra atribuidos a cada arquero que jugó el partido, para el
 * rendimiento de la temporada de `/tabla`.
 *
 * Con un solo arquero todo el marcador rival es suyo. Con varios, cada gol
 * en contra con minuto va a quien estaba en cancha en ese minuto (titular +
 * cambios con minuto hasta ahí, mismo criterio que `derivarEnCancha`); lo
 * que no se puede ubicar —un gol sin minuto, o la diferencia con un marcador
 * confirmado a mano en post partido— va al arquero titular (o al primero).
 * Nunca se reparte más que `totalEnContra`.
 */
export function golesRecibidosPorArquero(
  arqueros: readonly string[],
  titulares: readonly string[],
  cambios: readonly CambioJugado[],
  minutosGolesEnContra: readonly (number | null)[],
  totalEnContra: number,
): Map<string, number> {
  const recibidos = new Map<string, number>(arqueros.map((id) => [id, 0]));

  if (arqueros.length === 0) return recibidos;

  const principal = arqueros.find((id) => titulares.includes(id)) ?? arqueros[0];
  let asignados = 0;

  if (arqueros.length > 1) {
    for (const minuto of minutosGolesEnContra) {
      if (minuto === null || asignados >= totalEnContra) continue;

      const enCancha = derivarEnCancha(
        titulares,
        cambios.filter((c) => c.minuto !== null && c.minuto <= minuto),
      );
      const arquero = arqueros.find((id) => enCancha.has(id));

      if (!arquero) continue;

      recibidos.set(arquero, (recibidos.get(arquero) ?? 0) + 1);
      asignados += 1;
    }
  }

  recibidos.set(
    principal,
    (recibidos.get(principal) ?? 0) + Math.max(0, totalEnContra - asignados),
  );

  return recibidos;
}
