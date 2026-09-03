import { Injectable } from '@nestjs/common';
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { DbService, type EjecutorDb } from '../db/db.service';
import { eventos, jugadores, partidos, usuarios } from '../db/schema';
import { mapearPartido, type Partido } from '../partidos/partido.mapper';
import { TiemposService } from '../partidos/tiempos.service';
import { puedeSerDuplicado, VENTANA_DEDUP_MS } from './dedup';
import type { EquipoOrigen, TipoEvento } from './evento.tipos';

export interface SolicitudEvento {
  partidoId: string;
  tipo: TipoEvento;
  equipoOrigen: EquipoOrigen;
  jugadorId?: string | null;
  reportadoPor: string;
  /** Salta el chequeo de duplicados: el usuario ya dijo que es otro evento. */
  forzar?: boolean;
}

export interface EventoCargado {
  id: string;
  tipo: TipoEvento;
  equipoOrigen: EquipoOrigen;
  jugadorId: string | null;
  jugadorNombre: string | null;
  jugadorDorsal: number | null;
  tiempo: number | null;
  minutoCalculado: number | null;
  reportadoPor: string;
  reportanteNombre: string | null;
  creadoEn: Date;
}

export interface Marcador {
  propio: number;
  rival: number;
}

export type ResultadoRegistro =
  | { tipo: 'registrado'; evento: EventoCargado; partido: Partido; marcador: Marcador }
  | { tipo: 'posible_duplicado'; reciente: EventoCargado }
  | { tipo: 'partido_cerrado'; partido: Partido }
  | { tipo: 'no_existe' };

export type ResultadoDeshacer =
  | { tipo: 'deshecho'; evento: EventoCargado; marcador: Marcador }
  | { tipo: 'sin_eventos' }
  /** Hay eventos, pero el último no es suyo y no es admin. */
  | { tipo: 'ajeno'; evento: EventoCargado }
  | { tipo: 'partido_cerrado' }
  | { tipo: 'no_existe' };

/**
 * Carga de eventos con detección de duplicados atómica (B3).
 *
 * El diseño original leía la ventana de 60 segundos y después escribía. Dos
 * editores cargando el mismo gol con menos de un segundo de diferencia leían
 * ambos una ventana vacía y ambos escribían: el duplicado que la comprobación
 * existe para evitar entraba igual.
 *
 * Acá la comprobación y la inserción viven dentro de la misma transacción,
 * bajo un `pg_advisory_xact_lock` sobre (partido, tipo, equipo). El lock se
 * suelta solo al terminar la transacción, así que el segundo reporte no puede
 * leer la ventana hasta que el primero ya está escrito.
 *
 * Se hace en Postgres y no en Redis a propósito: Redis es opcional en este
 * despliegue y el propio RNF dice que nunca es la única fuente de un dato. Un
 * lock por clave más una consulta sobre `idx_eventos_dedup` cuesta casi nada al
 * volumen de un partido, y no deja la garantía colgando de una caché.
 */
@Injectable()
export class EventosService {
  constructor(
    private readonly db: DbService,
    private readonly tiempos: TiemposService,
  ) {}

  async registrar(solicitud: SolicitudEvento): Promise<ResultadoRegistro> {
    return this.db.db.transaction(async (tx) => {
      await this.tomarLock(tx, solicitud);

      const partido = await this.leerPartido(tx, solicitud.partidoId);

      if (!partido) return { tipo: 'no_existe' as const };
      if (partido.estado === 'cerrado') return { tipo: 'partido_cerrado' as const, partido };

      if (!solicitud.forzar) {
        const reciente = await this.eventoReciente(tx, solicitud);

        if (reciente && puedeSerDuplicado(reciente, { jugadorId: solicitud.jugadorId ?? null })) {
          return { tipo: 'posible_duplicado' as const, reciente };
        }
      }

      const contexto = await this.tiempos.contextoDeCarga(partido, tx);

      const [fila] = await tx
        .insert(eventos)
        .values({
          partidoId: partido.id,
          tipo: solicitud.tipo,
          equipoOrigen: solicitud.equipoOrigen,
          jugadorId: solicitud.jugadorId ?? null,
          tiempo: contexto.tiempo,
          minutoCalculado: contexto.minuto.minuto,
          origen: 'en_vivo',
          reportadoPor: solicitud.reportadoPor,
        })
        .returning({ id: eventos.id });

      // El marcador lo mueve el trigger, así que se relee después de insertar
      // en vez de calcularlo acá: dos fuentes del mismo número terminan
      // divergiendo.
      const [actualizado] = await tx
        .select()
        .from(partidos)
        .where(eq(partidos.id, partido.id))
        .limit(1);

      const evento = await this.detalleDe(tx, fila.id);

      if (!evento) throw new Error(`El evento ${fila.id} desapareció tras insertarlo`);

      return {
        tipo: 'registrado' as const,
        evento,
        partido: mapearPartido(actualizado),
        marcador: {
          propio: actualizado.marcadorPropio,
          rival: actualizado.marcadorRival,
        },
      };
    });
  }

  /**
   * Deshace el último evento del partido (RF-3.7).
   *
   * Un editor solo puede deshacer lo suyo; un admin, cualquiera. El `where`
   * incluye `eliminado_en is null`, así que dos /deshacer simultáneos no
   * pueden restar dos veces el mismo gol: el segundo no actualiza ninguna fila.
   */
  async deshacerUltimo(
    partidoId: string,
    usuarioId: string,
    esAdmin: boolean,
  ): Promise<ResultadoDeshacer> {
    return this.db.db.transaction(async (tx) => {
      const partido = await this.leerPartido(tx, partidoId);

      if (!partido) return { tipo: 'no_existe' as const };
      if (partido.estado === 'cerrado') return { tipo: 'partido_cerrado' as const };

      const [ultimo] = await tx
        .select({ id: eventos.id, reportadoPor: eventos.reportadoPor })
        .from(eventos)
        .where(and(eq(eventos.partidoId, partidoId), isNull(eventos.eliminadoEn)))
        .orderBy(desc(eventos.creadoEn), desc(eventos.id))
        .limit(1);

      if (!ultimo) return { tipo: 'sin_eventos' as const };

      const detalle = await this.detalleDe(tx, ultimo.id);

      if (!detalle) return { tipo: 'sin_eventos' as const };

      if (!esAdmin && ultimo.reportadoPor !== usuarioId) {
        return { tipo: 'ajeno' as const, evento: detalle };
      }

      const borradas = await tx
        .update(eventos)
        .set({ eliminadoEn: new Date(), eliminadoPor: usuarioId })
        .where(and(eq(eventos.id, ultimo.id), isNull(eventos.eliminadoEn)))
        .returning({ id: eventos.id });

      // Alguien más lo deshizo entre la lectura y la escritura.
      if (borradas.length === 0) return { tipo: 'sin_eventos' as const };

      const [actualizado] = await tx
        .select({
          marcadorPropio: partidos.marcadorPropio,
          marcadorRival: partidos.marcadorRival,
        })
        .from(partidos)
        .where(eq(partidos.id, partidoId))
        .limit(1);

      return {
        tipo: 'deshecho' as const,
        evento: detalle,
        marcador: { propio: actualizado.marcadorPropio, rival: actualizado.marcadorRival },
      };
    });
  }

  /** Eventos vigentes del partido, en orden cronológico. Es la base del resumen. */
  async delPartido(partidoId: string, tx?: EjecutorDb): Promise<EventoCargado[]> {
    return this.consulta(tx ?? this.db.db)
      .where(and(eq(eventos.partidoId, partidoId), isNull(eventos.eliminadoEn)))
      .orderBy(eventos.creadoEn);
  }

  /**
   * Reserva la clave (partido, tipo, equipo) hasta el fin de la transacción.
   *
   * `hashtextextended` la vuelve el bigint que espera el advisory lock. Es un
   * hash, así que dos claves distintas podrían colisionar: el peor caso es que
   * dos cargas sin relación se serialicen por un instante, no un dato
   * incorrecto.
   */
  private async tomarLock(tx: EjecutorDb, solicitud: SolicitudEvento): Promise<void> {
    const clave = `evento:${solicitud.partidoId}:${solicitud.tipo}:${solicitud.equipoOrigen}`;

    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${clave}, 0))`);
  }

  private async eventoReciente(
    tx: EjecutorDb,
    solicitud: SolicitudEvento,
    ahora: Date = new Date(),
  ): Promise<EventoCargado | null> {
    const desde = new Date(ahora.getTime() - VENTANA_DEDUP_MS);

    const [reciente] = await this.consulta(tx)
      .where(
        and(
          eq(eventos.partidoId, solicitud.partidoId),
          eq(eventos.tipo, solicitud.tipo),
          eq(eventos.equipoOrigen, solicitud.equipoOrigen),
          isNull(eventos.eliminadoEn),
          gt(eventos.creadoEn, desde),
        ),
      )
      .orderBy(desc(eventos.creadoEn))
      .limit(1);

    return reciente ?? null;
  }

  private async detalleDe(tx: EjecutorDb, eventoId: string): Promise<EventoCargado | null> {
    const [fila] = await this.consulta(tx).where(eq(eventos.id, eventoId)).limit(1);

    return fila ?? null;
  }

  private consulta(tx: EjecutorDb) {
    return tx
      .select({
        id: eventos.id,
        tipo: eventos.tipo,
        equipoOrigen: eventos.equipoOrigen,
        jugadorId: eventos.jugadorId,
        jugadorNombre: jugadores.nombre,
        jugadorDorsal: jugadores.dorsal,
        tiempo: eventos.tiempo,
        minutoCalculado: eventos.minutoCalculado,
        reportadoPor: eventos.reportadoPor,
        reportanteNombre: usuarios.nombre,
        creadoEn: eventos.creadoEn,
      })
      .from(eventos)
      .leftJoin(jugadores, eq(jugadores.id, eventos.jugadorId))
      .leftJoin(usuarios, eq(usuarios.id, eventos.reportadoPor));
  }

  private async leerPartido(tx: EjecutorDb, partidoId: string): Promise<Partido | null> {
    const [fila] = await tx.select().from(partidos).where(eq(partidos.id, partidoId)).limit(1);

    return fila ? mapearPartido(fila) : null;
  }
}
