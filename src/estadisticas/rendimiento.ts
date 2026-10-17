import type { RendimientoPartido } from '../resumen/resumen.service';

/** Promedio de nota de un jugador en la temporada (0–10, ver `puntaje.ts`). */
export interface PromedioJugador {
  promedio: number;
  partidos: number;
}

/** Goles en contra de un arquero en la temporada, y en cuántos partidos atajó. */
export interface ArqueroTemporada {
  golesRecibidos: number;
  partidos: number;
}

export interface RendimientoTemporada {
  promedios: Map<string, PromedioJugador>;
  arqueros: Map<string, ArqueroTemporada>;
}

/**
 * Junta el rendimiento partido por partido en el de la temporada.
 *
 * Puro y sin base de datos: el promedio es la media simple de la nota de
 * cada partido en que el jugador tuvo nota (jugó o tuvo algún evento), y
 * los goles recibidos se suman por arquero con los partidos en que figuró.
 */
export function rendimientoDeTemporada(
  partidos: readonly RendimientoPartido[],
): RendimientoTemporada {
  const sumas = new Map<string, { suma: number; partidos: number }>();
  const arqueros = new Map<string, ArqueroTemporada>();

  for (const partido of partidos) {
    for (const nota of partido.notas) {
      const acumulado = sumas.get(nota.jugadorId) ?? { suma: 0, partidos: 0 };
      acumulado.suma += nota.nota;
      acumulado.partidos += 1;
      sumas.set(nota.jugadorId, acumulado);
    }

    for (const [jugadorId, goles] of partido.golesRecibidos) {
      const acumulado = arqueros.get(jugadorId) ?? { golesRecibidos: 0, partidos: 0 };
      acumulado.golesRecibidos += goles;
      acumulado.partidos += 1;
      arqueros.set(jugadorId, acumulado);
    }
  }

  const promedios = new Map<string, PromedioJugador>();

  for (const [jugadorId, { suma, partidos: jugados }] of sumas) {
    promedios.set(jugadorId, { promedio: suma / jugados, partidos: jugados });
  }

  return { promedios, arqueros };
}

/** Un renglón del listado de rendimiento: la ficha de la temporada más su promedio. */
export interface FilaRendimiento {
  jugadorId: string;
  nombre: string;
  dorsal: number | null;
  esArquero: boolean;
  /** `null` si todavía no tiene nota en ningún partido cerrado. */
  promedio: number | null;
  partidosConNota: number;
  partidosJugados: number;
  goles: number;
  asistencias: number;
  amarillas: number;
  rojas: number;
  atajadas: number;
  penalesAtajados: number;
  recuperaciones: number;
  /** Solo para quien atajó algún partido; `null` en el resto. */
  golesRecibidos: number | null;
  partidosAtajados: number;
}

export interface Destacados {
  goleador: FilaRendimiento | null;
  mejorPromedio: FilaRendimiento | null;
  peorPromedio: FilaRendimiento | null;
  masAmonestado: FilaRendimiento | null;
  arqueros: FilaRendimiento[];
}

/**
 * Los destacados de la temporada. Empates: menor dorsal (sin dorsal al
 * final) y después nombre, como el goleador de `/tabla`. El peor promedio
 * solo se informa si hay al menos dos jugadores con nota —con uno solo
 * sería la misma persona que el mejor—, y el más amonestado solo si alguien
 * vio tarjeta.
 */
export function destacados(filas: readonly FilaRendimiento[]): Destacados {
  const conNota = filas.filter((f) => f.promedio !== null);
  const porPromedio = [...conNota].sort(
    (a, b) => (b.promedio ?? 0) - (a.promedio ?? 0) || desempate(a, b),
  );

  const goleador =
    [...filas].filter((f) => f.goles > 0).sort((a, b) => b.goles - a.goles || desempate(a, b))[0] ??
    null;

  const masAmonestado =
    [...filas]
      .filter((f) => f.amarillas + f.rojas > 0)
      .sort(
        (a, b) =>
          b.amarillas + b.rojas - (a.amarillas + a.rojas) || b.rojas - a.rojas || desempate(a, b),
      )[0] ?? null;

  const arqueros = filas
    .filter((f) => f.golesRecibidos !== null)
    .sort((a, b) => b.partidosAtajados - a.partidosAtajados || desempate(a, b));

  return {
    goleador,
    mejorPromedio: porPromedio[0] ?? null,
    peorPromedio: porPromedio.length >= 2 ? porPromedio[porPromedio.length - 1] : null,
    masAmonestado,
    arqueros,
  };
}

/** Listado: de mayor a menor promedio; quienes no tienen nota, al final. */
export function ordenarPorPromedio(filas: readonly FilaRendimiento[]): FilaRendimiento[] {
  return [...filas].sort((a, b) => {
    if (a.promedio === null) return b.promedio === null ? desempate(a, b) : 1;
    if (b.promedio === null) return -1;

    return b.promedio - a.promedio || desempate(a, b);
  });
}

function desempate(a: FilaRendimiento, b: FilaRendimiento): number {
  if (a.dorsal !== b.dorsal) {
    if (a.dorsal === null) return 1;
    if (b.dorsal === null) return -1;

    return a.dorsal - b.dorsal;
  }

  return a.nombre.localeCompare(b.nombre, 'es');
}
