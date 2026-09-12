import { Injectable } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { DbService, type EjecutorDb } from '../db/db.service';
import {
  entrenamientoPresentes,
  entrenamientoRecurrenteDias,
  entrenamientos,
  entrenamientosRecurrentes,
  jugadores,
} from '../db/schema';
import { JugadoresService } from '../jugadores/jugadores.service';
import { hoyLocal } from '../partidos/fechas';

export interface Entrenamiento {
  id: string;
  equipoId: string;
  fecha: string;
  recurrenteId: string | null;
}

export interface AsistenciaFecha {
  fecha: string;
  presente: boolean;
}

export interface AsistenciaJugadorDelDia {
  jugadorId: string;
  nombre: string;
  dorsal: number | null;
  presente: boolean;
}

export interface DetalleSesion {
  entrenamiento: Entrenamiento;
  jugadores: AsistenciaJugadorDelDia[];
}

export interface ResumenAsistenciaEquipo {
  totalEntrenamientos: number;
  /** `null` si todavía no hay ningún entrenamiento registrado. */
  promedioAsistencia: number | null;
}

function mapearEntrenamiento(fila: typeof entrenamientos.$inferSelect): Entrenamiento {
  return {
    id: fila.id,
    equipoId: fila.equipoId,
    fecha: fila.fecha,
    recurrenteId: fila.recurrenteId,
  };
}

/**
 * El día de la semana de una fecha `yyyy-mm-dd`, sin pasar por husos horarios
 * -- mismo criterio que `sumarDias` en `partidos/fechas.ts`. 0 = domingo.
 */
function diaSemanaDe(fechaIso: string): number {
  return new Date(`${fechaIso}T00:00:00Z`).getUTCDay();
}

/**
 * Entrenamientos y asistencia (RF nuevo: tomar asistencia por equipo).
 *
 * La recurrencia se resuelve bajo demanda: no hay tarea programada en el
 * bot, así que `asegurarSesionDeHoy` es lo que reemplaza a un cron -- se
 * llama al entrar a `/asistencia`, nunca en segundo plano.
 */
@Injectable()
export class EntrenamientosService {
  constructor(
    private readonly db: DbService,
    private readonly jugadores: JugadoresService,
  ) {}

  /**
   * Crea (o reutiliza, si ya existía) la sesión puntual de esa fecha.
   *
   * `onConflictDoNothing` + relectura, no un `insert` a secas: dos personas
   * confirmando `/nuevoentrenamiento` para el mismo equipo y fecha casi a la
   * vez no deben terminar en un error de restricción única, sino compartir
   * la misma sesión -- mismo criterio que `resolverOCrear` en jugadores.
   */
  async crearPuntual(equipoId: string, fecha: string, creadoPor: string): Promise<Entrenamiento> {
    return this.materializar(equipoId, fecha, creadoPor, null);
  }

  /**
   * Da de alta la regla recurrente (equipo + días de la semana) y, si la
   * fecha ancla ya cae en uno de esos días, materializa de una vez esa
   * primera sesión -- para que `/asistencia` tenga algo que mostrar
   * inmediatamente después de crear la recurrencia, sin esperar a la semana
   * que viene.
   */
  async crearRecurrente(
    equipoId: string,
    diasSemana: readonly number[],
    creadoPor: string,
    fechaAncla: string = hoyLocal(),
  ): Promise<{ recurrenteId: string; entrenamiento: Entrenamiento | null }> {
    return this.db.db.transaction(async (tx) => {
      const [regla] = await tx
        .insert(entrenamientosRecurrentes)
        .values({ equipoId, creadoPor })
        .returning();

      await tx
        .insert(entrenamientoRecurrenteDias)
        .values(diasSemana.map((diaSemana) => ({ recurrenteId: regla.id, diaSemana })));

      const entrenamiento = diasSemana.includes(diaSemanaDe(fechaAncla))
        ? await this.materializar(equipoId, fechaAncla, creadoPor, regla.id, tx)
        : null;

      return { recurrenteId: regla.id, entrenamiento };
    });
  }

  /**
   * El reemplazo del cron que no existe: si hoy no tiene sesión todavía pero
   * cae en un día de alguna regla recurrente activa de ese equipo, la crea.
   * Idempotente -- se puede llamar en cada `/asistencia` sin duplicar nada.
   */
  async asegurarSesionDeHoy(
    equipoId: string,
    usuarioId: string,
    hoy: string = hoyLocal(),
  ): Promise<Entrenamiento | null> {
    const [existente] = await this.db.db
      .select()
      .from(entrenamientos)
      .where(and(eq(entrenamientos.equipoId, equipoId), eq(entrenamientos.fecha, hoy)))
      .limit(1);

    if (existente) return mapearEntrenamiento(existente);

    const [regla] = await this.db.db
      .select({ id: entrenamientosRecurrentes.id })
      .from(entrenamientosRecurrentes)
      .innerJoin(
        entrenamientoRecurrenteDias,
        eq(entrenamientoRecurrenteDias.recurrenteId, entrenamientosRecurrentes.id),
      )
      .where(
        and(
          eq(entrenamientosRecurrentes.equipoId, equipoId),
          eq(entrenamientosRecurrentes.activo, true),
          eq(entrenamientoRecurrenteDias.diaSemana, diaSemanaDe(hoy)),
        ),
      )
      .limit(1);

    if (!regla) return null;

    return this.materializar(equipoId, hoy, usuarioId, regla.id);
  }

  /** Sesiones de un equipo sin asistencia tomada todavía, más recientes primero. */
  async pendientesDeAsistencia(equipoId: string): Promise<Entrenamiento[]> {
    const filas = await this.db.db
      .select()
      .from(entrenamientos)
      .where(
        and(
          eq(entrenamientos.equipoId, equipoId),
          sql`not exists (
            select 1 from ${entrenamientoPresentes}
            where ${entrenamientoPresentes.entrenamientoId} = ${entrenamientos.id}
          )`,
        ),
      )
      .orderBy(desc(entrenamientos.fecha));

    return filas.map(mapearEntrenamiento);
  }

  /**
   * Guarda quiénes asistieron, reemplazando lo que hubiera -- mismo criterio
   * que `AlineacionService.guardarTitulares`: sin esto, dos confirmaciones
   * para el mismo entrenamiento (o corregir la propia) sumarían en vez de
   * reemplazar. A diferencia de esa, acá una lista vacía es un resultado
   * válido ("nadie vino"), así que también se guarda -- nunca se corta antes.
   */
  async guardarPresentes(
    entrenamientoId: string,
    usuarioId: string,
    jugadorIds: readonly string[],
  ): Promise<void> {
    const valores = jugadorIds.map((jugadorId) => ({
      entrenamientoId,
      jugadorId,
      creadoPor: usuarioId,
    }));

    await this.db.db.transaction(async (tx) => {
      await tx
        .delete(entrenamientoPresentes)
        .where(eq(entrenamientoPresentes.entrenamientoId, entrenamientoId));

      if (valores.length > 0) {
        await tx.insert(entrenamientoPresentes).values(valores);
      }
    });
  }

  /**
   * Toda la plantilla de un equipo en una fecha, marcada presente/ausente --
   * la planilla completa que pide `/asistencias <fecha>`. `null` si ese
   * equipo no tuvo entrenamiento ese día.
   */
  async detalleDeSesion(equipoId: string, fecha: string): Promise<DetalleSesion | null> {
    const [fila] = await this.db.db
      .select()
      .from(entrenamientos)
      .where(and(eq(entrenamientos.equipoId, equipoId), eq(entrenamientos.fecha, fecha)))
      .limit(1);

    if (!fila) return null;

    const entrenamiento = mapearEntrenamiento(fila);

    const [plantilla, presentes] = await Promise.all([
      this.jugadores.listar(equipoId),
      this.db.db
        .select({ jugadorId: entrenamientoPresentes.jugadorId })
        .from(entrenamientoPresentes)
        .where(eq(entrenamientoPresentes.entrenamientoId, entrenamiento.id)),
    ]);

    const presentesIds = new Set(presentes.map((p) => p.jugadorId));

    return {
      entrenamiento,
      jugadores: plantilla.map((j) => ({
        jugadorId: j.id,
        nombre: j.nombre,
        dorsal: j.dorsal,
        presente: presentesIds.has(j.id),
      })),
    };
  }

  /**
   * Fechas de entrenamiento de un equipo, con si ese jugador puntual estuvo
   * presente en cada una -- lo que arma `/asistencias <nombre>`.
   */
  async asistenciaDeJugador(equipoId: string, jugadorId: string): Promise<AsistenciaFecha[]> {
    const filas = await this.db.db
      .select({
        fecha: entrenamientos.fecha,
        presenteId: entrenamientoPresentes.id,
      })
      .from(entrenamientos)
      .leftJoin(
        entrenamientoPresentes,
        and(
          eq(entrenamientoPresentes.entrenamientoId, entrenamientos.id),
          eq(entrenamientoPresentes.jugadorId, jugadorId),
        ),
      )
      .where(eq(entrenamientos.equipoId, equipoId))
      .orderBy(desc(entrenamientos.fecha));

    return filas.map((f) => ({ fecha: f.fecha, presente: f.presenteId !== null }));
  }

  /** Cuántos entrenamientos lleva un equipo y su % de asistencia promedio, para `/asistencias` sin argumento. */
  async resumenDeEquipo(equipoId: string): Promise<ResumenAsistenciaEquipo> {
    const [{ total } = { total: 0 }] = await this.db.db
      .select({ total: sql<number>`count(*)::int` })
      .from(entrenamientos)
      .where(eq(entrenamientos.equipoId, equipoId));

    if (total === 0) return { totalEntrenamientos: 0, promedioAsistencia: null };

    const [[{ total: totalPresentes } = { total: 0 }], [{ total: totalJugadores } = { total: 0 }]] =
      await Promise.all([
        this.db.db
          .select({ total: sql<number>`count(*)::int` })
          .from(entrenamientoPresentes)
          .innerJoin(entrenamientos, eq(entrenamientos.id, entrenamientoPresentes.entrenamientoId))
          .where(eq(entrenamientos.equipoId, equipoId)),
        this.db.db
          .select({ total: sql<number>`count(*)::int` })
          .from(jugadores)
          .where(and(eq(jugadores.equipoId, equipoId), eq(jugadores.activo, true))),
      ]);

    const posible = total * totalJugadores;

    return {
      totalEntrenamientos: total,
      promedioAsistencia: posible > 0 ? Math.round((totalPresentes / posible) * 100) : null,
    };
  }

  /**
   * Inserta la sesión si no existía (`onConflictDoNothing` sobre
   * `entrenamientos_equipo_fecha_key`) y devuelve la fila resultante, sea la
   * recién creada o la que ya hubiera para ese equipo y fecha.
   */
  private async materializar(
    equipoId: string,
    fecha: string,
    creadoPor: string,
    recurrenteId: string | null,
    tx?: EjecutorDb,
  ): Promise<Entrenamiento> {
    const ejecutor = tx ?? this.db.db;

    await ejecutor
      .insert(entrenamientos)
      .values({ equipoId, fecha, recurrenteId, creadoPor })
      .onConflictDoNothing();

    const [fila] = await ejecutor
      .select()
      .from(entrenamientos)
      .where(and(eq(entrenamientos.equipoId, equipoId), eq(entrenamientos.fecha, fecha)))
      .limit(1);

    return mapearEntrenamiento(fila);
  }
}
