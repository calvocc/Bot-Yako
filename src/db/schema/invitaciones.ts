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
import { equipos } from './organizacion';

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
