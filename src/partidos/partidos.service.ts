import { Injectable } from '@nestjs/common';
import { and, desc, eq, getTableColumns, gte, ne } from 'drizzle-orm';
import { DbService, type EjecutorDb } from '../db/db.service';
import type { FormatoPartido } from '../equipos/equipos.service';
import { competencias, partidos, usuarios } from '../db/schema';
import { hoyLocal, sumarDias } from './fechas';
import { mapearPartido, type Partido } from './partido.mapper';
import { TiemposService } from './tiempos.service';

export interface NuevoPartido {
  equipoId: string;
  rival: string;
  /** `yyyy-mm-dd`. */
  fecha: string;
  competenciaId?: string | null;
  formato: FormatoPartido;
  creadoPor: string;
}

export interface MarcadorConfirmado {
  propio: number;
  rival: number;
}

export type ResultadoCierre =
  | { tipo: 'cerrado'; partido: Partido }
  | { tipo: 'ya_cerrado'; partido: Partido; porQuien: string | null }
  | { tipo: 'no_existe' };

export type ResultadoReapertura =
  | { tipo: 'reabierto'; partido: Partido }
  | { tipo: 'no_estaba_cerrado'; partido: Partido }
  | { tipo: 'no_existe' };

/** Cuántos partidos se listan por defecto: lo que cabe en una pantalla. */
export const PARTIDOS_POR_LISTA = 10;

@Injectable()
export class PartidosService {
  constructor(
    private readonly db: DbService,
    private readonly tiempos: TiemposService,
  ) {}

  async crear(datos: NuevoPartido): Promise<Partido> {
    const [fila] = await this.db.db
      .insert(partidos)
      .values({
        equipoId: datos.equipoId,
        rival: datos.rival,
        fecha: datos.fecha,
        competenciaId: datos.competenciaId ?? null,
        cantidadTiempos: datos.formato.cantidadTiempos,
        minutosPorTiempo: datos.formato.minutosPorTiempo,
        creadoPor: datos.creadoPor,
      })
      .returning({ id: partidos.id });

    // Se relee con el join en vez de mapear el `.returning()` crudo: así
    // `competenciaNombre` sale resuelto igual que en cualquier otra lectura,
    // sin duplicar la lógica del join en dos sitios.
    const creado = await this.obtener(fila.id);

    if (!creado) throw new Error(`El partido ${fila.id} desapareció justo después de crearlo`);

    return creado;
  }

  async obtener(partidoId: string, tx?: EjecutorDb): Promise<Partido | null> {
    const [fila] = await this.consulta(tx).where(eq(partidos.id, partidoId)).limit(1);

    return fila ? mapearPartido(fila, fila.competenciaNombre) : null;
  }

  /**
   * Partidos a los que todavía se les puede cargar algo.
   *
   * Se limita a ayer y hoy: sin esto, un partido de hace semanas que alguien
   * dejó con un tiempo abierto (el bot se cayó, nadie tocó "Finalizar")
   * seguía ofreciéndose en /cargar para siempre, y su minuto crecía sin freno
   * hasta reventar el `smallint` de `minuto_calculado`.
   */
  async abiertosDe(equipoId: string, limite = PARTIDOS_POR_LISTA): Promise<Partido[]> {
    const filas = await this.consulta()
      .where(
        and(
          eq(partidos.equipoId, equipoId),
          ne(partidos.estado, 'cerrado'),
          gte(partidos.fecha, sumarDias(hoyLocal(), -1)),
        ),
      )
      .orderBy(desc(partidos.fecha), desc(partidos.creadoEn))
      .limit(limite);

    return filas.map((f) => mapearPartido(f, f.competenciaNombre));
  }

  async recientesDe(equipoId: string, limite = PARTIDOS_POR_LISTA): Promise<Partido[]> {
    const filas = await this.consulta()
      .where(eq(partidos.equipoId, equipoId))
      .orderBy(desc(partidos.fecha), desc(partidos.creadoEn))
      .limit(limite);

    return filas.map((f) => mapearPartido(f, f.competenciaNombre));
  }

  /**
   * Partidos cerrados del equipo, para /reabrir.
   *
   * El filtro va en la query y no después en memoria: filtrar los últimos N
   * `recientesDe` por `estado === 'cerrado'` deja afuera partidos cerrados
   * que sí existen cuando los N más recientes están todos abiertos, y dice
   * "no tiene partidos cerrados" siendo falso.
   */
  async cerradosDe(equipoId: string, limite = 30): Promise<Partido[]> {
    const filas = await this.consulta()
      .where(and(eq(partidos.equipoId, equipoId), eq(partidos.estado, 'cerrado')))
      .orderBy(desc(partidos.fecha), desc(partidos.creadoEn))
      .limit(limite);

    return filas.map((f) => mapearPartido(f, f.competenciaNombre));
  }

  /** Columnas propias del partido más el nombre de su competencia, si tiene. */
  private consulta(tx?: EjecutorDb) {
    return (tx ?? this.db.db)
      .select({ ...getTableColumns(partidos), competenciaNombre: competencias.nombre })
      .from(partidos)
      .leftJoin(competencias, eq(partidos.competenciaId, competencias.id));
  }

  /**
   * Cierra el partido con el marcador que confirmó quien lo cerró (C5).
   *
   * El lock hace que dos confirmaciones simultáneas no cierren dos veces con
   * marcadores distintos: la segunda ve el partido ya cerrado y lo dice, en
   * vez de pisar en silencio lo que guardó la primera.
   */
  async cerrar(
    partidoId: string,
    usuarioId: string,
    marcador: MarcadorConfirmado,
  ): Promise<ResultadoCierre> {
    return this.db.db.transaction(async (tx) => {
      const [bloqueada] = await tx
        .select()
        .from(partidos)
        .where(eq(partidos.id, partidoId))
        .for('update')
        .limit(1);

      if (!bloqueada) return { tipo: 'no_existe' as const };

      const partido = mapearPartido(bloqueada);

      if (partido.estado === 'cerrado') {
        return {
          tipo: 'ya_cerrado' as const,
          partido,
          porQuien: await this.nombreDe(partido.cerradoPor, tx),
        };
      }

      // Un tiempo que quedó corriendo se cierra con el partido; si no, el
      // minuto seguiría creciendo para siempre sobre un partido terminado.
      await this.tiempos.cerrarTiempoAbierto(tx, partidoId, usuarioId);

      await tx
        .update(partidos)
        .set({
          estado: 'cerrado',
          tiempoEstado: 'finalizado',
          cerradoEn: new Date(),
          cerradoPor: usuarioId,
          marcadorPropioConfirmado: marcador.propio,
          marcadorRivalConfirmado: marcador.rival,
        })
        .where(eq(partidos.id, partidoId));

      // Con join: el resumen que se genera justo después de cerrar necesita
      // el nombre de la competencia, y `update...returning()` no lo trae.
      const [fila] = await this.consulta(tx).where(eq(partidos.id, partidoId)).limit(1);

      return { tipo: 'cerrado' as const, partido: mapearPartido(fila, fila.competenciaNombre) };
    });
  }

  /**
   * Reabre un partido cerrado para corregirlo.
   *
   * Se borra el marcador confirmado a propósito: quedó fijado sobre datos que
   * están por cambiar, y dejarlo haría que el resumen siguiera mostrando el
   * viejo mientras los eventos dicen otra cosa. Se vuelve a confirmar al
   * cerrar de nuevo.
   */
  async reabrir(partidoId: string): Promise<ResultadoReapertura> {
    return this.db.db.transaction(async (tx) => {
      const [bloqueada] = await tx
        .select()
        .from(partidos)
        .where(eq(partidos.id, partidoId))
        .for('update')
        .limit(1);

      if (!bloqueada) return { tipo: 'no_existe' as const };

      const partido = mapearPartido(bloqueada);

      if (partido.estado !== 'cerrado') {
        return { tipo: 'no_estaba_cerrado' as const, partido };
      }

      await tx
        .update(partidos)
        .set({
          estado: 'en_progreso',
          cerradoEn: null,
          cerradoPor: null,
          marcadorPropioConfirmado: null,
          marcadorRivalConfirmado: null,
        })
        .where(eq(partidos.id, partidoId));

      const [fila] = await this.consulta(tx).where(eq(partidos.id, partidoId)).limit(1);

      return { tipo: 'reabierto' as const, partido: mapearPartido(fila, fila.competenciaNombre) };
    });
  }

  /** Nombre para mostrar de quien hizo algo: "lo inició Carlos". */
  async nombreDe(usuarioId: string | null, tx?: EjecutorDb): Promise<string | null> {
    if (!usuarioId) return null;

    const [fila] = await (tx ?? this.db.db)
      .select({ nombre: usuarios.nombre })
      .from(usuarios)
      .where(eq(usuarios.id, usuarioId))
      .limit(1);

    return fila?.nombre ?? null;
  }
}
