import { relations, sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { competencias } from './competencias';
import { estadoPartidoEnum, estadoTiempoEnum, modoCargaPartidoEnum } from './enums';
import { usuarios } from './identidad';
import { equipos } from './organizacion';

export const partidos = pgTable(
  'partidos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    equipoId: uuid('equipo_id')
      .notNull()
      .references(() => equipos.id, { onDelete: 'cascade' }),
    rival: text('rival').notNull(),
    fecha: date('fecha').notNull(),
    /** Nula = "sin competencia", una elección válida (amistoso suelto). */
    competenciaId: uuid('competencia_id').references(() => competencias.id),

    cantidadTiempos: smallint('cantidad_tiempos').notNull(),
    minutosPorTiempo: smallint('minutos_por_tiempo').notNull(),

    modoCarga: modoCargaPartidoEnum('modo_carga'),
    estado: estadoPartidoEnum('estado').notNull().default('pendiente'),

    tiempoActual: smallint('tiempo_actual').notNull().default(0),
    tiempoEstado: estadoTiempoEnum('tiempo_estado').notNull().default('no_iniciado'),
    tiempoIniciadoEn: timestamp('tiempo_iniciado_en', { withTimezone: true }),

    /** Derivado de los eventos por el trigger `trg_actualizar_marcador_*`. */
    marcadorPropio: smallint('marcador_propio').notNull().default(0),
    marcadorRival: smallint('marcador_rival').notNull().default(0),

    /**
     * C5: marcador que confirmo quien cerro el partido. Puede diferir del
     * derivado si faltaron eventos por cargar; el resumen muestra este.
     */
    marcadorPropioConfirmado: smallint('marcador_propio_confirmado'),
    marcadorRivalConfirmado: smallint('marcador_rival_confirmado'),

    iniciadoPor: uuid('iniciado_por').references(() => usuarios.id),
    creadoPor: uuid('creado_por')
      .notNull()
      .references(() => usuarios.id),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
    cerradoEn: timestamp('cerrado_en', { withTimezone: true }),
    cerradoPor: uuid('cerrado_por').references(() => usuarios.id),
  },
  (t) => [
    index('idx_partidos_equipo_estado').on(t.equipoId, t.estado),
    index('idx_partidos_equipo_fecha').on(t.equipoId, t.fecha.desc()),
    check('partidos_cantidad_tiempos_check', sql`${t.cantidadTiempos} between 1 and 6`),
    check('partidos_minutos_por_tiempo_check', sql`${t.minutosPorTiempo} between 1 and 60`),
    check('partidos_tiempo_actual_check', sql`${t.tiempoActual} >= 0`),
    // C9: el trigger de marcador resta al deshacer; el check evita que un
    // desfase silencioso deje el marcador en negativo.
    check('partidos_marcador_propio_check', sql`${t.marcadorPropio} >= 0`),
    check('partidos_marcador_rival_check', sql`${t.marcadorRival} >= 0`),
  ],
);

/**
 * C4: un registro por tiempo jugado, con inicio y fin reales.
 *
 * Sin esta tabla el minuto de los tiempos posteriores se calcula con la
 * duracion *configurada* del formato, asi que un primer tiempo con adicion
 * desfasa todo lo que sigue. Ademas es lo que permite reconstruir el estado
 * de un partido en vivo si Redis se vacia.
 */
export const partidoTiempos = pgTable(
  'partido_tiempos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    partidoId: uuid('partido_id')
      .notNull()
      .references(() => partidos.id, { onDelete: 'cascade' }),
    numero: smallint('numero').notNull(),
    iniciadoEn: timestamp('iniciado_en', { withTimezone: true }).notNull(),
    finalizadoEn: timestamp('finalizado_en', { withTimezone: true }),
    iniciadoPor: uuid('iniciado_por').references(() => usuarios.id),
    finalizadoPor: uuid('finalizado_por').references(() => usuarios.id),
  },
  (t) => [
    unique('partido_tiempos_partido_numero_key').on(t.partidoId, t.numero),
    check('partido_tiempos_numero_check', sql`${t.numero} >= 1`),
  ],
);

export const partidosRelations = relations(partidos, ({ one, many }) => ({
  equipo: one(equipos, { fields: [partidos.equipoId], references: [equipos.id] }),
  competencia: one(competencias, {
    fields: [partidos.competenciaId],
    references: [competencias.id],
  }),
  tiempos: many(partidoTiempos),
}));

export const partidoTiemposRelations = relations(partidoTiempos, ({ one }) => ({
  partido: one(partidos, { fields: [partidoTiempos.partidoId], references: [partidos.id] }),
}));
