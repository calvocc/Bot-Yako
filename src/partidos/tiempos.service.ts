import { Injectable } from '@nestjs/common';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { DbService, type EjecutorDb } from '../db/db.service';
import { partidoTiempos, partidos, usuarios } from '../db/schema';
import { calcularMinuto, type Minuto, type TiempoJugado } from './minuto';
import { mapearPartido, type Partido } from './partido.mapper';

/** En qué punto del partido está la carga: qué tiempo corre y en qué minuto. */
export interface ContextoDeCarga {
  partido: Partido;
  /** Tiempo al que se imputan los eventos. Nunca menor que 1. */
  tiempo: number;
  minuto: Minuto;
  /** Los tiempos del formato ya se jugaron todos: no hay reloj corriendo. */
  sinReloj: boolean;
}

export type ResultadoInicio =
  | { tipo: 'iniciado'; partido: Partido }
  | { tipo: 'ya_en_vivo'; partido: Partido }
  | { tipo: 'cerrado'; partido: Partido }
  | { tipo: 'no_existe' };

export type ResultadoTiempo =
  /** Hay un tiempo corriendo. `recienIniciado` distingue si lo arrancó esta llamada. */
  | { tipo: 'en_curso'; partido: Partido; recienIniciado: boolean }
  /** Se jugaron todos los tiempos del formato; se puede seguir cargando sin reloj. */
  | { tipo: 'sin_tiempos'; partido: Partido }
  | { tipo: 'cerrado'; partido: Partido }
  | { tipo: 'no_existe' };

export type ResultadoFinTiempo =
  | { tipo: 'finalizado'; partido: Partido; numero: number; esUltimo: boolean }
  | { tipo: 'ya_finalizado'; partido: Partido; porQuien: string | null }
  | { tipo: 'no_iniciado'; partido: Partido }
  | { tipo: 'cerrado'; partido: Partido }
  | { tipo: 'no_existe' };

/**
 * Los tiempos del partido y el minuto que se deriva de ellos.
 *
 * Toda transición de tiempo se hace bajo un `select ... for update` sobre la
 * fila del partido. Es lo que hace que dos personas tocando "Finalizar tiempo"
 * a la vez no cierren el tiempo dos veces ni lo cierren y lo reabran: la
 * segunda espera, relee el estado ya cambiado y responde "ya lo finalizó
 * Carlos". Sin lock, ambas leerían `en_curso` y ambas escribirían.
 */
@Injectable()
export class TiemposService {
  constructor(private readonly db: DbService) {}

  /** Pasa el partido a modo en vivo y arranca el Tiempo 1, todo junto. */
  async iniciarEnVivo(partidoId: string, usuarioId: string): Promise<ResultadoInicio> {
    return this.db.db.transaction(async (tx) => {
      const partido = await this.bloquear(tx, partidoId);

      if (!partido) return { tipo: 'no_existe' as const };
      if (partido.estado === 'cerrado') return { tipo: 'cerrado' as const, partido };

      if (partido.tiempoEstado !== 'no_iniciado' || partido.modoCarga === 'en_vivo') {
        return { tipo: 'ya_en_vivo' as const, partido };
      }

      const ahora = new Date();

      await tx.insert(partidoTiempos).values({
        partidoId,
        numero: 1,
        iniciadoEn: ahora,
        iniciadoPor: usuarioId,
      });

      const [fila] = await tx
        .update(partidos)
        .set({
          modoCarga: 'en_vivo',
          estado: 'en_progreso',
          iniciadoPor: partido.iniciadoPor ?? usuarioId,
          tiempoActual: 1,
          tiempoEstado: 'en_curso',
          tiempoIniciadoEn: ahora,
        })
        .where(eq(partidos.id, partidoId))
        .returning();

      return { tipo: 'iniciado' as const, partido: mapearPartido(fila) };
    });
  }

  /**
   * Garantiza que haya un tiempo corriendo antes de cargar un evento (RF-3.8).
   *
   * Si el tiempo anterior está finalizado, arranca el siguiente en ese mismo
   * momento: durante un partido nadie se acuerda de tocar "Iniciar Tiempo 2"
   * antes de cargar el gol que acaba de pasar.
   */
  async asegurarTiempoEnCurso(partidoId: string, usuarioId: string): Promise<ResultadoTiempo> {
    return this.db.db.transaction(async (tx) => {
      const partido = await this.bloquear(tx, partidoId);

      if (!partido) return { tipo: 'no_existe' as const };
      if (partido.estado === 'cerrado') return { tipo: 'cerrado' as const, partido };

      if (partido.tiempoEstado === 'en_curso') {
        return { tipo: 'en_curso' as const, partido, recienIniciado: false };
      }

      const siguiente = partido.tiempoEstado === 'no_iniciado' ? 1 : partido.tiempoActual + 1;

      if (siguiente > partido.cantidadTiempos) {
        return { tipo: 'sin_tiempos' as const, partido };
      }

      const ahora = new Date();

      await tx.insert(partidoTiempos).values({
        partidoId,
        numero: siguiente,
        iniciadoEn: ahora,
        iniciadoPor: usuarioId,
      });

      const [fila] = await tx
        .update(partidos)
        .set({
          modoCarga: partido.modoCarga ?? 'en_vivo',
          estado: 'en_progreso',
          iniciadoPor: partido.iniciadoPor ?? usuarioId,
          tiempoActual: siguiente,
          tiempoEstado: 'en_curso',
          tiempoIniciadoEn: ahora,
        })
        .where(eq(partidos.id, partidoId))
        .returning();

      return { tipo: 'en_curso' as const, partido: mapearPartido(fila), recienIniciado: true };
    });
  }

  async finalizarTiempo(partidoId: string, usuarioId: string): Promise<ResultadoFinTiempo> {
    return this.db.db.transaction(async (tx) => {
      const partido = await this.bloquear(tx, partidoId);

      if (!partido) return { tipo: 'no_existe' as const };
      if (partido.estado === 'cerrado') return { tipo: 'cerrado' as const, partido };
      if (partido.tiempoEstado === 'no_iniciado') return { tipo: 'no_iniciado' as const, partido };

      if (partido.tiempoEstado === 'finalizado') {
        return {
          tipo: 'ya_finalizado' as const,
          partido,
          porQuien: await this.quienFinalizo(tx, partidoId, partido.tiempoActual),
        };
      }

      const ahora = new Date();

      await tx
        .update(partidoTiempos)
        .set({ finalizadoEn: ahora, finalizadoPor: usuarioId })
        .where(
          and(
            eq(partidoTiempos.partidoId, partidoId),
            eq(partidoTiempos.numero, partido.tiempoActual),
            isNull(partidoTiempos.finalizadoEn),
          ),
        );

      const [fila] = await tx
        .update(partidos)
        .set({ tiempoEstado: 'finalizado' })
        .where(eq(partidos.id, partidoId))
        .returning();

      return {
        tipo: 'finalizado' as const,
        partido: mapearPartido(fila),
        numero: partido.tiempoActual,
        esUltimo: partido.tiempoActual >= partido.cantidadTiempos,
      };
    });
  }

  /** Cierra el tiempo abierto, si lo hay. Lo usa el cierre del partido. */
  async cerrarTiempoAbierto(tx: EjecutorDb, partidoId: string, usuarioId: string): Promise<void> {
    await tx
      .update(partidoTiempos)
      .set({ finalizadoEn: new Date(), finalizadoPor: usuarioId })
      .where(and(eq(partidoTiempos.partidoId, partidoId), isNull(partidoTiempos.finalizadoEn)));
  }

  async tiemposDe(partidoId: string, tx?: EjecutorDb): Promise<TiempoJugado[]> {
    return (tx ?? this.db.db)
      .select({
        numero: partidoTiempos.numero,
        iniciadoEn: partidoTiempos.iniciadoEn,
        finalizadoEn: partidoTiempos.finalizadoEn,
      })
      .from(partidoTiempos)
      .where(eq(partidoTiempos.partidoId, partidoId))
      .orderBy(asc(partidoTiempos.numero));
  }

  /**
   * Dónde imputar un evento que se carga ahora.
   *
   * Con todos los tiempos jugados —o en un partido reabierto— no hay reloj
   * corriendo, pero se sigue pudiendo cargar: el evento va al último tiempo,
   * con el minuto final acumulado. Es la única forma de completar lo que faltó
   * sin inventar un tiempo que nadie jugó.
   */
  async contextoDeCarga(
    partido: Partido,
    tx?: EjecutorDb,
    ahora: Date = new Date(),
  ): Promise<ContextoDeCarga> {
    const tiempos = await this.tiemposDe(partido.id, tx);

    return {
      partido,
      tiempo: Math.max(1, Math.min(partido.tiempoActual, partido.cantidadTiempos)),
      minuto: calcularMinuto(tiempos, partido, ahora),
      sinReloj: partido.tiempoEstado !== 'en_curso',
    };
  }

  private async bloquear(tx: EjecutorDb, partidoId: string): Promise<Partido | null> {
    const [fila] = await tx
      .select()
      .from(partidos)
      .where(eq(partidos.id, partidoId))
      .for('update')
      .limit(1);

    return fila ? mapearPartido(fila) : null;
  }

  private async quienFinalizo(
    tx: EjecutorDb,
    partidoId: string,
    numero: number,
  ): Promise<string | null> {
    const [fila] = await tx
      .select({ nombre: usuarios.nombre })
      .from(partidoTiempos)
      .leftJoin(usuarios, eq(usuarios.id, partidoTiempos.finalizadoPor))
      .where(and(eq(partidoTiempos.partidoId, partidoId), eq(partidoTiempos.numero, numero)))
      .limit(1);

    return fila?.nombre ?? null;
  }
}
