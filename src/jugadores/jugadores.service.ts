import { Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { jugadores } from '../db/schema';

export interface Jugador {
  id: string;
  nombre: string;
  dorsal: number | null;
  activo: boolean;
}

export class DorsalOcupadoError extends Error {
  constructor(
    readonly dorsal: number,
    readonly ocupadoPor: string,
  ) {
    super(`El dorsal ${dorsal} ya lo tiene ${ocupadoPor}`);
  }
}

@Injectable()
export class JugadoresService {
  constructor(private readonly db: DbService) {}

  async listar(equipoId: string, incluirInactivos = false): Promise<Jugador[]> {
    const filas = await this.db.db
      .select()
      .from(jugadores)
      .where(eq(jugadores.equipoId, equipoId))
      .orderBy(asc(jugadores.dorsal), asc(jugadores.nombre));

    return filas
      .filter((f) => incluirInactivos || f.activo)
      .map((f) => ({ id: f.id, nombre: f.nombre, dorsal: f.dorsal, activo: f.activo }));
  }

  /**
   * Da de alta un jugador.
   *
   * El dorsal duplicado se comprueba antes de insertar para poder decir *quién*
   * lo tiene: el índice único de la base también lo impide, pero su error no
   * sirve para explicárselo a nadie.
   */
  async crear(equipoId: string, nombre: string, dorsal?: number): Promise<Jugador> {
    if (dorsal !== undefined) {
      const ocupado = (await this.listar(equipoId)).find((j) => j.dorsal === dorsal);

      if (ocupado) throw new DorsalOcupadoError(dorsal, ocupado.nombre);
    }

    const [fila] = await this.db.db
      .insert(jugadores)
      .values({ equipoId, nombre, dorsal: dorsal ?? null })
      .returning();

    return { id: fila.id, nombre: fila.nombre, dorsal: fila.dorsal, activo: fila.activo };
  }

  /**
   * Baja lógica. No se borra la fila porque sus eventos siguen contando para
   * las estadísticas de los partidos ya jugados.
   */
  async desactivar(equipoId: string, jugadorId: string): Promise<boolean> {
    const filas = await this.db.db
      .update(jugadores)
      .set({ activo: false })
      .where(and(eq(jugadores.id, jugadorId), eq(jugadores.equipoId, equipoId)))
      .returning({ id: jugadores.id });

    return filas.length > 0;
  }

  async reactivar(equipoId: string, jugadorId: string): Promise<boolean> {
    const filas = await this.db.db
      .update(jugadores)
      .set({ activo: true })
      .where(and(eq(jugadores.id, jugadorId), eq(jugadores.equipoId, equipoId)))
      .returning({ id: jugadores.id });

    return filas.length > 0;
  }
}

export interface JugadorParseado {
  nombre: string;
  dorsal?: number;
}

/**
 * Interpreta una línea de plantilla: "Jacob, 10", "Jacob 10", "10 Jacob" o
 * solo "Jacob".
 *
 * El formato libre es deliberado: la plantilla se carga desde el teléfono, a
 * veces al borde de la cancha, y exigir una sintaxis exacta ahí es fricción.
 */
export function parsearJugador(linea: string): JugadorParseado | null {
  const limpia = linea.trim().replace(/\s+/g, ' ');

  if (!limpia) return null;

  // "Jacob, 10" o "Jacob 10"
  const alFinal = limpia.match(/^(.+?)[,\s]+(\d{1,2})$/);
  if (alFinal) {
    return { nombre: alFinal[1].trim().replace(/,$/, ''), dorsal: Number(alFinal[2]) };
  }

  // "10 Jacob" o "10, Jacob"
  const alInicio = limpia.match(/^(\d{1,2})[,\s]+(.+)$/);
  if (alInicio) {
    return { nombre: alInicio[2].trim(), dorsal: Number(alInicio[1]) };
  }

  const soloNombre = limpia.replace(/,$/, '').trim();

  return soloNombre ? { nombre: soloNombre } : null;
}

/** Varias líneas de una vez: pegar una lista completa también funciona. */
export function parsearPlantilla(texto: string): JugadorParseado[] {
  return texto
    .split('\n')
    .map((l) => parsearJugador(l))
    .filter((j): j is JugadorParseado => j !== null);
}

export function describirJugador(jugador: Jugador | JugadorParseado): string {
  return jugador.dorsal !== undefined && jugador.dorsal !== null
    ? `${jugador.nombre} #${jugador.dorsal}`
    : jugador.nombre;
}
