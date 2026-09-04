import { relations, sql } from 'drizzle-orm';
import { pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { academias } from './organizacion';
import { usuarios } from './identidad';

/**
 * Torneos y ligas que juega una academia.
 *
 * Vive a nivel academia, no equipo: dos categorías que juegan el mismo
 * torneo (Sub-9 y Sub-11 en la misma Liga del Atlántico) lo comparten en vez
 * de crear cada una la suya. Antes era texto libre por partido, así que
 * "Liga" y "liga " —escritas por dos papás distintos— quedaban como cosas
 * separadas; el índice único de abajo, sobre el nombre recortado y en
 * minúsculas, es lo que ahora lo impide.
 */
export const competencias = pgTable(
  'competencias',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    academiaId: uuid('academia_id')
      .notNull()
      .references(() => academias.id, { onDelete: 'cascade' }),
    nombre: text('nombre').notNull(),
    creadoPor: uuid('creado_por')
      .notNull()
      .references(() => usuarios.id),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('competencias_academia_nombre_key').on(t.academiaId, sql`lower(trim(${t.nombre}))`),
  ],
);

export const competenciasRelations = relations(competencias, ({ one }) => ({
  academia: one(academias, { fields: [competencias.academiaId], references: [academias.id] }),
}));
