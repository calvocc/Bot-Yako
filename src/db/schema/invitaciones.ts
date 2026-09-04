import { relations, sql } from 'drizzle-orm';
import {
  check,
  index,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { rolEquipoEnum } from './enums';
import { usuarios } from './identidad';
import { equipos, jugadores } from './organizacion';

/**
 * M2: el caso real es compartir un link en el grupo de papas, asi que una
 * invitacion admite N canjes. `usosMaximos = 1` reproduce el comportamiento
 * de un codigo personal.
 */
export const invitaciones = pgTable(
  'invitaciones',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    equipoId: uuid('equipo_id')
      .notNull()
      .references(() => equipos.id, { onDelete: 'cascade' }),
    codigo: text('codigo').notNull().unique(),
    rol: rolEquipoEnum('rol').notNull(),
    usosMaximos: smallint('usos_maximos').notNull().default(1),
    creadoPor: uuid('creado_por')
      .notNull()
      .references(() => usuarios.id),
    expiraEn: timestamp('expira_en', { withTimezone: true }).notNull(),
    revocadaEn: timestamp('revocada_en', { withTimezone: true }),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_invitaciones_codigo').on(t.codigo),
    index('idx_invitaciones_equipo').on(t.equipoId),
    check('invitaciones_usos_maximos_check', sql`${t.usosMaximos} between 1 and 100`),
  ],
);

export const invitacionesCanjes = pgTable(
  'invitaciones_canjes',
  {
    invitacionId: uuid('invitacion_id')
      .notNull()
      .references(() => invitaciones.id, { onDelete: 'cascade' }),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    canjeadoEn: timestamp('canjeado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.invitacionId, t.usuarioId] })],
);

export const invitacionesRelations = relations(invitaciones, ({ one, many }) => ({
  equipo: one(equipos, { fields: [invitaciones.equipoId], references: [equipos.id] }),
  canjes: many(invitacionesCanjes),
}));

export const invitacionesCanjesRelations = relations(invitacionesCanjes, ({ one }) => ({
  invitacion: one(invitaciones, {
    fields: [invitacionesCanjes.invitacionId],
    references: [invitaciones.id],
  }),
  usuario: one(usuarios, { fields: [invitacionesCanjes.usuarioId], references: [usuarios.id] }),
}));

/**
 * Igual que `invitaciones`, pero para vincular a un papá/tutor con un
 * jugador puntual en vez de darlo de alta en un equipo — sin columna de
 * rol, mismo motivo que `usuarios_jugadores`.
 */
export const invitacionesJugador = pgTable(
  'invitaciones_jugador',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jugadorId: uuid('jugador_id')
      .notNull()
      .references(() => jugadores.id, { onDelete: 'cascade' }),
    codigo: text('codigo').notNull().unique(),
    usosMaximos: smallint('usos_maximos').notNull().default(1),
    creadoPor: uuid('creado_por')
      .notNull()
      .references(() => usuarios.id),
    expiraEn: timestamp('expira_en', { withTimezone: true }).notNull(),
    revocadaEn: timestamp('revocada_en', { withTimezone: true }),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_invitaciones_jugador_codigo').on(t.codigo),
    index('idx_invitaciones_jugador_jugador').on(t.jugadorId),
    check('invitaciones_jugador_usos_maximos_check', sql`${t.usosMaximos} between 1 and 100`),
  ],
);

export const invitacionesJugadorCanjes = pgTable(
  'invitaciones_jugador_canjes',
  {
    invitacionId: uuid('invitacion_id')
      .notNull()
      .references(() => invitacionesJugador.id, { onDelete: 'cascade' }),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    canjeadoEn: timestamp('canjeado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.invitacionId, t.usuarioId] })],
);

export const invitacionesJugadorRelations = relations(invitacionesJugador, ({ one, many }) => ({
  jugador: one(jugadores, { fields: [invitacionesJugador.jugadorId], references: [jugadores.id] }),
  canjes: many(invitacionesJugadorCanjes),
}));

export const invitacionesJugadorCanjesRelations = relations(
  invitacionesJugadorCanjes,
  ({ one }) => ({
    invitacion: one(invitacionesJugador, {
      fields: [invitacionesJugadorCanjes.invitacionId],
      references: [invitacionesJugador.id],
    }),
    usuario: one(usuarios, {
      fields: [invitacionesJugadorCanjes.usuarioId],
      references: [usuarios.id],
    }),
  }),
);
