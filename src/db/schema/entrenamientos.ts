import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  pgTable,
  smallint,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { usuarios } from './identidad';
import { equipos, jugadores } from './organizacion';

/**
 * Regla "este equipo entrena tales días de la semana". No tiene fecha propia
 * -- las fechas concretas viven en `entrenamientos`, que se materializa bajo
 * demanda (no hay tarea programada en el bot): cuando alguien corre
 * `/asistencia`, si hoy cae en uno de los `entrenamiento_recurrente_dias` de
 * una regla activa y todavía no existe la sesión de hoy, se crea sola. Mismo
 * criterio "resolver o crear" que ya usa `JugadoresService.resolverOCrear`.
 */
export const entrenamientosRecurrentes = pgTable('entrenamientos_recurrentes', {
  id: uuid('id').primaryKey().defaultRandom(),
  equipoId: uuid('equipo_id')
    .notNull()
    .references(() => equipos.id, { onDelete: 'cascade' }),
  // Permite "apagar" la recurrencia a futuro sin borrar el historial de
  // sesiones ya creadas por ella.
  activo: boolean('activo').notNull().default(true),
  creadoPor: uuid('creado_por')
    .notNull()
    .references(() => usuarios.id),
  creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
});

export const entrenamientoRecurrenteDias = pgTable(
  'entrenamiento_recurrente_dias',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    recurrenteId: uuid('recurrente_id')
      .notNull()
      .references(() => entrenamientosRecurrentes.id, { onDelete: 'cascade' }),
    // 0 = domingo … 6 = sábado (Date.getUTCDay() sobre la fecha, sin hora).
    diaSemana: smallint('dia_semana').notNull(),
  },
  (t) => [
    unique('entrenamiento_recurrente_dias_key').on(t.recurrenteId, t.diaSemana),
    check('entrenamiento_recurrente_dias_check', sql`${t.diaSemana} between 0 and 6`),
  ],
);

/**
 * Una sesión concreta de entrenamiento, con fecha real. Sale de
 * `/nuevoentrenamiento` (puntual, `recurrenteId` null) o se materializa sola
 * a partir de una regla recurrente cuando llega el día.
 */
export const entrenamientos = pgTable(
  'entrenamientos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    equipoId: uuid('equipo_id')
      .notNull()
      .references(() => equipos.id, { onDelete: 'cascade' }),
    fecha: date('fecha').notNull(),
    recurrenteId: uuid('recurrente_id').references(() => entrenamientosRecurrentes.id, {
      onDelete: 'set null',
    }),
    creadoPor: uuid('creado_por')
      .notNull()
      .references(() => usuarios.id),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Una sesión por equipo y día: mantiene idempotente la materialización
    // bajo demanda (dos personas disparando la misma regla el mismo día no
    // duplican la fila) y es la base de `/asistencias <fecha>`.
    unique('entrenamientos_equipo_fecha_key').on(t.equipoId, t.fecha),
    index('idx_entrenamientos_equipo_fecha').on(t.equipoId, t.fecha.desc()),
  ],
);

/**
 * Espejo de `partido_titulares`: solo se guarda a quien asistió, quien no
 * tiene fila acá queda ausente implícitamente. `AsistenciaFlujo` reemplaza
 * (no suma) el contenido completo en cada confirmación, igual que
 * `AlineacionService.guardarTitulares`.
 */
export const entrenamientoPresentes = pgTable(
  'entrenamiento_presentes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrenamientoId: uuid('entrenamiento_id')
      .notNull()
      .references(() => entrenamientos.id, { onDelete: 'cascade' }),
    jugadorId: uuid('jugador_id')
      .notNull()
      .references(() => jugadores.id, { onDelete: 'cascade' }),
    creadoPor: uuid('creado_por')
      .notNull()
      .references(() => usuarios.id),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('entrenamiento_presentes_key').on(t.entrenamientoId, t.jugadorId)],
);

export const entrenamientosRecurrentesRelations = relations(
  entrenamientosRecurrentes,
  ({ one, many }) => ({
    equipo: one(equipos, {
      fields: [entrenamientosRecurrentes.equipoId],
      references: [equipos.id],
    }),
    dias: many(entrenamientoRecurrenteDias),
    sesiones: many(entrenamientos),
  }),
);

export const entrenamientoRecurrenteDiasRelations = relations(
  entrenamientoRecurrenteDias,
  ({ one }) => ({
    recurrente: one(entrenamientosRecurrentes, {
      fields: [entrenamientoRecurrenteDias.recurrenteId],
      references: [entrenamientosRecurrentes.id],
    }),
  }),
);

export const entrenamientosRelations = relations(entrenamientos, ({ one, many }) => ({
  equipo: one(equipos, { fields: [entrenamientos.equipoId], references: [equipos.id] }),
  recurrente: one(entrenamientosRecurrentes, {
    fields: [entrenamientos.recurrenteId],
    references: [entrenamientosRecurrentes.id],
  }),
  presentes: many(entrenamientoPresentes),
}));

export const entrenamientoPresentesRelations = relations(entrenamientoPresentes, ({ one }) => ({
  entrenamiento: one(entrenamientos, {
    fields: [entrenamientoPresentes.entrenamientoId],
    references: [entrenamientos.id],
  }),
  jugador: one(jugadores, {
    fields: [entrenamientoPresentes.jugadorId],
    references: [jugadores.id],
  }),
}));
