import type { Jugador } from '../jugadores/jugadores.service';
import type { RendimientoPartido } from '../resumen/resumen.service';

/**
 * Un renglón del listado de rendimiento de `/tabla`: lo que el jugador hizo
 * en los partidos cerrados de la temporada, más su promedio.
 */
export interface FilaRendimiento {
  jugadorId: string;
  nombre: string;
  dorsal: number | null;
  /** Media de la nota (0–10) por partido; `null` si todavía no jugó ninguno. */
  promedio: number | null;
  partidos: number;
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

/**
 * Junta el rendimiento partido por partido en el de la temporada.
 *
 * Todo sale de los mismos partidos (los cerrados de la temporada, con la
 * nota del resumen): goles, tarjetas y promedio no pueden contar partidos
 * distintos —un partido en curso no suma goles que el promedio no ve—.
 * Puro y sin base de datos.
 *
 * El listado trae a toda la plantilla activa y, además, a quien ya no está
 * en ella pero jugó esta temporada: nadie que sumó queda afuera.
 */
export function rendimientoDeTemporada(
  plantilla: readonly Jugador[],
  partidos: readonly RendimientoPartido[],
): FilaRendimiento[] {
  const filas = new Map<string, FilaRendimiento & { sumaNotas: number }>();

  const asegurar = (jugador: { jugadorId: string; nombre: string; dorsal: number | null }) => {
    const existente = filas.get(jugador.jugadorId);

    if (existente) return existente;

    const nueva = {
      ...jugador,
      promedio: null,
      partidos: 0,
      goles: 0,
      asistencias: 0,
      amarillas: 0,
      rojas: 0,
      atajadas: 0,
      penalesAtajados: 0,
      recuperaciones: 0,
      golesRecibidos: null,
      partidosAtajados: 0,
      sumaNotas: 0,
    };

    filas.set(jugador.jugadorId, nueva);

    return nueva;
  };

  for (const jugador of plantilla) {
    if (jugador.activo) {
      asegurar({ jugadorId: jugador.id, nombre: jugador.nombre, dorsal: jugador.dorsal ?? null });
    }
  }

  for (const partido of partidos) {
    for (const nota of partido.notas) {
      const fila = asegurar(nota);

      fila.sumaNotas += nota.nota;
      fila.partidos += 1;
      fila.goles += nota.goles;
      fila.asistencias += nota.asistencias;
      fila.amarillas += nota.amarillas;
      fila.rojas += nota.rojas;
      fila.atajadas += nota.atajadas;
      fila.penalesAtajados += nota.penalesAtajados;
      fila.recuperaciones += nota.recuperaciones;
    }

    for (const [jugadorId, goles] of partido.golesRecibidos) {
      const fila = filas.get(jugadorId);

      if (!fila) continue;

      fila.golesRecibidos = (fila.golesRecibidos ?? 0) + goles;
      fila.partidosAtajados += 1;
    }
  }

  return [...filas.values()].map(({ sumaNotas, ...fila }) => ({
    ...fila,
    promedio: fila.partidos > 0 ? sumaNotas / fila.partidos : null,
  }));
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
