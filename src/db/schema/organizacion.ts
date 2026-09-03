import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const academias = pgTable('academias', {
  id: uuid('id').primaryKey().defaultRandom(),
  nombre: text('nombre').notNull(),
  creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
});

export const equipos = pgTable(
  'equipos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    academiaId: uuid('academia_id')
      .notNull()
      .references(() => academias.id, { onDelete: 'cascade' }),
    nombre: text('nombre').notNull(),
    cantidadTiemposDefault: smallint('cantidad_tiempos_default').notNull().default(2),
    minutosPorTiempoDefault: smallint('minutos_por_tiempo_default').notNull().default(25),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('equipos_academia_nombre_key').on(t.academiaId, t.nombre),
    index('idx_equipos_academia').on(t.academiaId),
    check('equipos_cantidad_tiempos_check', sql`${t.cantidadTiemposDefault} between 1 and 6`),
    check('equipos_minutos_por_tiempo_check', sql`${t.minutosPorTiempoDefault} between 1 and 60`),
  ],
);

/**
 * Enlaza a un mismo individuo entre equipos (un jugador que sube de categoria,
 * un DT que dirige dos). La ficha sigue viviendo por equipo en `jugadores`.
 */
export const personas = pgTable('personas', {
  id: uuid('id').primaryKey().defaultRandom(),
  nombre: text('nombre').notNull(),
  creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
});

export const jugadores = pgTable(
  'jugadores',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    equipoId: uuid('equipo_id')
      .notNull()
      .references(() => equipos.id, { onDelete: 'cascade' }),
    personaId: uuid('persona_id').references(() => personas.id),
    nombre: text('nombre').notNull(),
    dorsal: smallint('dorsal'),
    activo: boolean('activo').notNull().default(true),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_jugadores_equipo')
      .on(t.equipoId)
      .where(sql`activo`),
    // C9: dos jugadores activos del mismo equipo no pueden compartir dorsal.
    uniqueIndex('jugadores_equipo_dorsal_key')
      .on(t.equipoId, t.dorsal)
      .where(sql`activo and dorsal is not null`),
    check('jugadores_dorsal_check', sql`${t.dorsal} is null or ${t.dorsal} between 0 and 99`),
  ],
);

export const academiasRelations = relations(academias, ({ many }) => ({
  equipos: many(equipos),
}));

export const equiposRelations = relations(equipos, ({ one, many }) => ({
  academia: one(academias, { fields: [equipos.academiaId], references: [academias.id] }),
  jugadores: many(jugadores),
}));

export const jugadoresRelations = relations(jugadores, ({ one }) => ({
  equipo: one(equipos, { fields: [jugadores.equipoId], references: [equipos.id] }),
  persona: one(personas, { fields: [jugadores.personaId], references: [personas.id] }),
}));
