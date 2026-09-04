import { Injectable } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { competencias, partidos } from '../db/schema';

export interface Competencia {
  id: string;
  nombre: string;
}

/** Cuántas se ofrecen como botones antes de pasar a "Ver más". */
export const COMPETENCIAS_POR_PAGINA = 8;

@Injectable()
export class CompetenciasService {
  constructor(private readonly db: DbService) {}

  /**
   * Competencias de la academia, de la que se jugó más recientemente para
   * atrás.
   *
   * Es a nivel academia y no equipo: dos categorías que juegan el mismo
   * torneo lo comparten. La fecha de "más reciente" sale de los partidos
   * que la usaron, no de cuándo se creó la fila: lo que importa para
   * ofrecerla primero es qué tan vigente está, no cuándo alguien la escribió
   * por primera vez.
   */
  async deLaAcademia(
    academiaId: string,
    limite = COMPETENCIAS_POR_PAGINA * 3,
  ): Promise<Competencia[]> {
    const filas = await this.db.db
      .select({
        id: competencias.id,
        nombre: competencias.nombre,
        ultima: sql<string | null>`max(${partidos.fecha})`,
      })
      .from(competencias)
      .leftJoin(partidos, eq(partidos.competenciaId, competencias.id))
      .where(eq(competencias.academiaId, academiaId))
      .groupBy(competencias.id, competencias.nombre)
      .orderBy(desc(sql`max(${partidos.fecha})`), desc(competencias.creadoEn))
      .limit(limite);

    return filas.map((f) => ({ id: f.id, nombre: f.nombre }));
  }

  /**
   * Encuentra la competencia por nombre (sin importar mayúsculas ni espacios
   * de más) o la crea.
   *
   * Es lo que evita que "Torneo DBS" y "DBS" —escritas por dos papás en dos
   * partidos distintos— queden como cosas separadas: el índice único hace de
   * árbitro, así que un choque de inserción concurrente resuelve solo hacia
   * la misma fila en vez de fallar. Mismo patrón que `EquiposService.crear`
   * (buscar antes) e `IdentidadService.crear` (dejar que el índice decida la
   * carrera), pero acá el desenlace de la carrera es "reusar", no "rechazar".
   */
  async obtenerOCrear(academiaId: string, nombre: string, usuarioId: string): Promise<Competencia> {
    const normalizado = nombre.trim();
    const existente = await this.buscarPorNombre(academiaId, normalizado);

    if (existente) return existente;

    // Sin `target`: Drizzle solo acepta columnas ahí, y el índice único de
    // esta tabla es sobre una expresión (`lower(trim(nombre))`), no sobre una
    // columna. Sin target, Postgres aplica el DO NOTHING ante cualquier
    // conflicto — y esta tabla no tiene otro, así que es exactamente lo que
    // hace falta.
    const [fila] = await this.db.db
      .insert(competencias)
      .values({ academiaId, nombre: normalizado, creadoPor: usuarioId })
      .onConflictDoNothing()
      .returning({ id: competencias.id, nombre: competencias.nombre });

    // Sin fila devuelta: alguien más la creó entre el `buscarPorNombre` y
    // este insert. Se relee en vez de fallar.
    if (fila) return fila;

    const ganadora = await this.buscarPorNombre(academiaId, normalizado);

    if (!ganadora) {
      throw new Error(`No se pudo crear ni encontrar la competencia "${normalizado}"`);
    }

    return ganadora;
  }

  private async buscarPorNombre(academiaId: string, nombre: string): Promise<Competencia | null> {
    const [fila] = await this.db.db
      .select({ id: competencias.id, nombre: competencias.nombre })
      .from(competencias)
      .where(
        and(
          eq(competencias.academiaId, academiaId),
          sql`lower(trim(${competencias.nombre})) = lower(trim(${nombre}))`,
        ),
      )
      .limit(1);

    return fila ?? null;
  }
}
