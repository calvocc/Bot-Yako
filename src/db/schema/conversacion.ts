import { index, jsonb, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { canalMensajeriaEnum } from './enums';

/**
 * Respaldo durable del estado conversacional.
 *
 * Redis es la primera lectura porque es la que esta en el camino caliente de
 * cada boton durante un partido. Pero si Redis se cae a mitad del alta de una
 * plantilla, el usuario no puede perder el flujo: por eso cada paso se escribe
 * tambien aca (RNF de disponibilidad, y "Redis nunca es el unico lugar donde
 * vive un dato").
 *
 * No referencia a `usuarios`: el estado existe desde el primer mensaje, cuando
 * todavia no hay cuenta creada.
 */
export const sesionesConversacion = pgTable(
  'sesiones_conversacion',
  {
    canal: canalMensajeriaEnum('canal').notNull(),
    canalUserId: text('canal_user_id').notNull(),
    flujoId: text('flujo_id').notNull(),
    pasoId: text('paso_id').notNull(),
    datos: jsonb('datos').notNull().default({}),
    expiraEn: timestamp('expira_en', { withTimezone: true }).notNull(),
    actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.canal, t.canalUserId] }),
    // Sostiene la limpieza periodica de sesiones vencidas.
    index('idx_sesiones_expiracion').on(t.expiraEn),
  ],
);
