import { pgEnum } from 'drizzle-orm/pg-core';

export const rolEquipoEnum = pgEnum('rol_equipo', ['admin', 'editor', 'viewer']);

export const modoCargaPartidoEnum = pgEnum('modo_carga_partido', ['en_vivo', 'post_partido']);

export const estadoPartidoEnum = pgEnum('estado_partido', ['pendiente', 'en_progreso', 'cerrado']);

export const estadoTiempoEnum = pgEnum('estado_tiempo', ['no_iniciado', 'en_curso', 'finalizado']);

export const tipoEventoEnum = pgEnum('tipo_evento', [
  'gol',
  'autogol',
  'asistencia',
  'tarjeta_amarilla',
  'tarjeta_roja',
  'cambio',
]);

export const equipoOrigenEventoEnum = pgEnum('equipo_origen_evento', ['propio', 'rival']);

/**
 * Canales de mensajeria soportados. Telegram es el unico activo en el MVP;
 * whatsapp queda declarado para que la identidad de usuario no dependa de
 * Telegram y sumar el canal no requiera una migracion de datos.
 */
export const canalMensajeriaEnum = pgEnum('canal_mensajeria', ['telegram', 'whatsapp']);

/**
 * De donde salio un evento. Permite recargar el resumen post partido de forma
 * idempotente: se borran (soft delete) los eventos con origen 'post_partido'
 * antes de reinsertar, sin tocar lo cargado en vivo.
 */
export const origenEventoEnum = pgEnum('origen_evento', ['en_vivo', 'post_partido']);
