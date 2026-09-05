import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';

export interface EstadisticaJugador {
  jugadorId: string;
  equipoId: string;
  /** Fichas de la misma persona en otros equipos comparten este id. `null` si nunca se vinculó. */
  personaId: string | null;
  nombre: string;
  dorsal: number | null;
  temporada: number;
  partidosConEvento: number;
  goles: number;
  autogoles: number;
  asistencias: number;
  amarillas: number;
  rojas: number;
}

export interface EstadisticaEquipo {
  equipoId: string;
  temporada: number;
  partidosJugados: number;
  ganados: number;
  empatados: number;
  perdidos: number;
  golesFavor: number;
  golesContra: number;
}

export interface Goleador {
  nombre: string;
  dorsal: number | null;
  goles: number;
}

/** El año de la fecha de un partido es la temporada (mismo criterio de las vistas). */
export function temporadaActual(ahora: Date = new Date()): number {
  return ahora.getFullYear();
}

/**
 * `/stats` y `/tabla` (RF-6), contra las vistas `estadisticas_jugador` y
 * `estadisticas_equipo` (migración de Fase 3, sin usar hasta ahora).
 *
 * No hay `pgView()` de Drizzle para vistas que no definió el propio schema
 * de TypeScript, así que se consultan con SQL crudo y se mapean a mano, como
 * `partido.mapper.ts` hace con las tablas. `count(*)`/`sum(...)` vuelven
 * `bigint` desde Postgres; `Number(...)` alcanza de sobra para lo que cabe en
 * una temporada de fútbol infantil.
 */
@Injectable()
export class EstadisticasService {
  constructor(private readonly db: DbService) {}

  /**
   * Jugadores de ese equipo cuyo nombre contiene lo buscado (sin distinguir
   * mayúsculas ni acentos exactos). A diferencia de `resolverOCrear` —exacto
   * a propósito para no fusionar personas al cargar en vivo— acá el objetivo
   * es lo contrario: que "Jacob" encuentre a "Jacob Restrepo".
   */
  async deJugador(
    equipoId: string,
    nombreBuscado: string,
    temporada: number = temporadaActual(),
  ): Promise<EstadisticaJugador[]> {
    const filas = await this.db.db.execute<Record<string, unknown>>(sql`
      select *
      from estadisticas_jugador
      where equipo_id = ${equipoId}
        and temporada = ${temporada}
        and nombre ilike ${`%${nombreBuscado}%`}
      order by nombre
    `);

    return filas.map(mapearEstadisticaJugador);
  }

  async deEquipo(
    equipoId: string,
    temporada: number = temporadaActual(),
  ): Promise<EstadisticaEquipo | null> {
    const [fila] = await this.db.db.execute<Record<string, unknown>>(sql`
      select *
      from estadisticas_equipo
      where equipo_id = ${equipoId} and temporada = ${temporada}
      limit 1
    `);

    return fila ? mapearEstadisticaEquipo(fila) : null;
  }

  /** El goleador de la temporada, para el renglón de `/tabla`. Empata por menor dorsal. */
  async goleadorDe(
    equipoId: string,
    temporada: number = temporadaActual(),
  ): Promise<Goleador | null> {
    const [fila] = await this.db.db.execute<Record<string, unknown>>(sql`
      select nombre, dorsal, goles
      from estadisticas_jugador
      where equipo_id = ${equipoId} and temporada = ${temporada} and goles > 0
      order by goles desc, dorsal asc nulls last
      limit 1
    `);

    if (!fila) return null;

    return {
      nombre: String(fila.nombre),
      dorsal: fila.dorsal === null ? null : Number(fila.dorsal),
      goles: Number(fila.goles),
    };
  }
}

function mapearEstadisticaJugador(fila: Record<string, unknown>): EstadisticaJugador {
  return {
    jugadorId: String(fila.jugador_id),
    equipoId: String(fila.equipo_id),
    personaId: fila.persona_id as string | null,
    nombre: String(fila.nombre),
    dorsal: fila.dorsal === null ? null : Number(fila.dorsal),
    temporada: Number(fila.temporada),
    partidosConEvento: Number(fila.partidos_con_evento),
    goles: Number(fila.goles),
    autogoles: Number(fila.autogoles),
    asistencias: Number(fila.asistencias),
    amarillas: Number(fila.amarillas),
    rojas: Number(fila.rojas),
  };
}

function mapearEstadisticaEquipo(fila: Record<string, unknown>): EstadisticaEquipo {
  return {
    equipoId: String(fila.equipo_id),
    temporada: Number(fila.temporada),
    partidosJugados: Number(fila.partidos_jugados),
    ganados: Number(fila.ganados),
    empatados: Number(fila.empatados),
    perdidos: Number(fila.perdidos),
    golesFavor: Number(fila.goles_favor),
    golesContra: Number(fila.goles_contra),
  };
}
