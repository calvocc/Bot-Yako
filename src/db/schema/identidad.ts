import { relations } from 'drizzle-orm';
import { index, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { canalMensajeriaEnum, rolEquipoEnum } from './enums';
import { equipos } from './organizacion';

/**
 * Persona con cuenta en el bot. No guarda ningun identificador de canal:
 * eso vive en `identidades_usuario`, de modo que la misma cuenta pueda
 * entrar por Telegram hoy y por WhatsApp manana sin migrar datos.
 */
export const usuarios = pgTable('usuarios', {
  id: uuid('id').primaryKey().defaultRandom(),
  nombre: text('nombre').notNull(),
  creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
});

export const identidadesUsuario = pgTable(
  'identidades_usuario',
  {
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    canal: canalMensajeriaEnum('canal').notNull(),
    /** Telegram: el user id como texto. WhatsApp: el numero en formato E.164. */
    canalUserId: text('canal_user_id').notNull(),
    /** Destino al que se le envian mensajes en ese canal. */
    chatId: text('chat_id'),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.canal, t.canalUserId] }),
    index('idx_identidades_usuario').on(t.usuarioId),
  ],
);

export const usuariosEquipos = pgTable(
  'usuarios_equipos',
  {
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    equipoId: uuid('equipo_id')
      .notNull()
      .references(() => equipos.id, { onDelete: 'cascade' }),
    rol: rolEquipoEnum('rol').notNull(),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.usuarioId, t.equipoId] }),
    index('idx_usuarios_equipos_equipo').on(t.equipoId, t.rol),
  ],
);

export const usuariosRelations = relations(usuarios, ({ many }) => ({
  identidades: many(identidadesUsuario),
  membresias: many(usuariosEquipos),
}));

export const identidadesUsuarioRelations = relations(identidadesUsuario, ({ one }) => ({
  usuario: one(usuarios, { fields: [identidadesUsuario.usuarioId], references: [usuarios.id] }),
}));

export const usuariosEquiposRelations = relations(usuariosEquipos, ({ one }) => ({
  usuario: one(usuarios, { fields: [usuariosEquipos.usuarioId], references: [usuarios.id] }),
  equipo: one(equipos, { fields: [usuariosEquipos.equipoId], references: [equipos.id] }),
}));
