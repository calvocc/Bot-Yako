/**
 * Cálculo del minuto de partido sobre duraciones reales (C4).
 *
 * El documento original calculaba el minuto sumando la duración *configurada*
 * de los tiempos anteriores. Un primer tiempo con 6 minutos de adición dejaba
 * todo el segundo tiempo corrido: un gol al 5' del segundo tiempo se guardaba
 * como min 30 cuando en realidad iba 36. Por eso `partido_tiempos` registra
 * cuándo arrancó y cuándo terminó cada tiempo de verdad.
 */

export interface TiempoJugado {
  numero: number;
  iniciadoEn: Date;
  finalizadoEn: Date | null;
}

export interface Minuto {
  /** Minuto acumulado real del partido. Es el que se guarda en el evento. */
  minuto: number;
  /**
   * Minutos que el tiempo en curso lleva por encima de lo configurado. Solo
   * afecta cómo se muestra; el minuto guardado no cambia.
   */
  adicion: number;
}

const MS_POR_MINUTO = 60_000;

export interface FormatoTiempos {
  minutosPorTiempo: number;
}

/**
 * Suma lo que duraron los tiempos ya cerrados más lo que lleva el actual.
 *
 * Un tiempo abierto que no sea el último de la lista se considera cerrado en
 * el arranque del siguiente: es lo que pasa si el bot se cae entre el fin de
 * un tiempo y el inicio del otro, y contar ese hueco falsearía el minuto.
 */
export function calcularMinuto(
  tiempos: readonly TiempoJugado[],
  formato: FormatoTiempos,
  ahora: Date = new Date(),
): Minuto {
  const ordenados = [...tiempos].sort((a, b) => a.numero - b.numero);

  let acumuladoMs = 0;
  let enCursoMs = 0;

  for (const [indice, tiempo] of ordenados.entries()) {
    const siguiente = ordenados[indice + 1];
    const fin = tiempo.finalizadoEn ?? siguiente?.iniciadoEn ?? null;

    if (fin) {
      acumuladoMs += Math.max(0, fin.getTime() - tiempo.iniciadoEn.getTime());
      continue;
    }

    enCursoMs = Math.max(0, ahora.getTime() - tiempo.iniciadoEn.getTime());
  }

  const enCursoMin = Math.floor(enCursoMs / MS_POR_MINUTO);
  const adicion = Math.max(0, enCursoMin - formato.minutosPorTiempo);

  return {
    minuto: Math.floor(acumuladoMs / MS_POR_MINUTO) + enCursoMin,
    adicion,
  };
}

/**
 * Rótulo futbolístico del minuto: `25+3` cuando el tiempo se pasó de lo
 * configurado.
 *
 * Solo cambia el texto. El evento guarda el minuto corrido —28 en ese
 * ejemplo—, porque una estadística que miente para verse bien no sirve.
 */
export function describirMinuto({ minuto, adicion }: Minuto): string {
  return adicion > 0 ? `${minuto - adicion}+${adicion}` : String(minuto);
}
