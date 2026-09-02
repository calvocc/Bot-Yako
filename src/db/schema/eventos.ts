import { relations, sql } from 'drizzle-orm';
import { check, index, pgTable, smallint, timestamp, uuid } from 'drizzle-orm/pg-core';
import { equipoOrigenEventoEnum, origenEventoEnum, tipoEventoEnum } from './enums';
import { usuarios } from './identidad';
import { jugadores } from './organizacion';
import { partidos } from './partidos';

export const eventos = pgTable(
  'eventos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    partidoId: uuid('partido_id')
      .notNull()
      .references(() => partidos.id, { onDelete: 'cascade' }),
    tipo: tipoEventoEnum('tipo').notNull(),
    equipoOrigen: equipoOrigenEventoEnum('equipo_origen').notNull(),
    jugadorId: uuid('jugador_id').references(() => jugadores.id),

    /**
     * B4: nulos en modo post partido, que no captura ni tiempo ni minuto.
     * El check obliga a que en vivo siempre vengan ambos.
     */
    tiempo: smallint('tiempo'),
    minutoCalculado: smallint('minuto_calculado'),

    origen: origenEventoEnum('origen').notNull().default('en_vivo'),

    reportadoPor: uuid('reportado_por')
      .notNull()
      .references(() => usuarios.id),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),

    // Soft delete: /deshacer marca la fila, no la borra, para conservar
    // la auditoria de quien cargo y quien deshizo.
    eliminadoEn: timestamp('eliminado_en', { withTimezone: true }),
    eliminadoPor: uuid('eliminado_por').references(() => usuarios.id),
  },
  (t) => [
    // Respaldo del dedup de Redis y soporte de la auditoria posterior.
    index('idx_eventos_dedup')
      .on(t.partidoId, t.tipo, t.equipoOrigen, t.creadoEn)
      .where(sql`eliminado_en is null`),
    index('idx_eventos_partido')
      .on(t.partidoId)
      .where(sql`eliminado_en is null`),
    index('idx_eventos_jugador')
      .on(t.jugadorId)
      .where(sql`eliminado_en is null`),
    index('idx_eventos_partido_origen')
      .on(t.partidoId, t.origen)
      .where(sql`eliminado_en is null`),
    check(
      'eventos_tiempo_en_vivo_check',
      sql`(origen = 'post_partido') or (tiempo is not null and minuto_calculado is not null)`,
    ),
    check('eventos_tiempo_check', sql`${t.tiempo} is null or ${t.tiempo} >= 1`),
    check('eventos_minuto_check', sql`${t.minutoCalculado} is null or ${t.minutoCalculado} >= 0`),
    // Un autogol siempre necesita saber de que lado se marco; un gol propio
    // sin jugador identificado se permite (el rival anota y no hay ficha).
    check(
      'eventos_jugador_requerido_check',
      sql`equipo_origen = 'rival' or tipo in ('gol', 'autogol') or jugador_id is not null`,
    ),
  ],
);

export const eventosRelations = relations(eventos, ({ one }) => ({
  partido: one(partidos, { fields: [eventos.partidoId], references: [partidos.id] }),
  jugador: one(jugadores, { fields: [eventos.jugadorId], references: [jugadores.id] }),
  reportante: one(usuarios, { fields: [eventos.reportadoPor], references: [usuarios.id] }),
}));
