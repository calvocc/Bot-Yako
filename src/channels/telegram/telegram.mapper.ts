import type { Update } from 'telegraf/types';
import type { MensajeEntrante } from '../channel.types';

/**
 * Traduce un update de Telegram al modelo neutral.
 *
 * Devuelve `null` para lo que el bot no maneja (ediciones, mensajes de canal,
 * entradas a grupos). Es el único archivo, junto al adaptador, que conoce la
 * forma de los datos de Telegram.
 */
export function mapearUpdate(update: Update): MensajeEntrante | null {
  if ('callback_query' in update) {
    const consulta = update.callback_query;
    const mensaje = 'message' in consulta ? consulta.message : undefined;

    if (!mensaje || !('data' in consulta)) return null;

    return {
      canal: 'telegram',
      canalUserId: String(consulta.from.id),
      chatId: String(mensaje.chat.id),
      nombre: nombreDe(consulta.from),
      seleccionId: consulta.data,
      mensajeOrigenId: String(mensaje.message_id),
      acuseId: consulta.id,
      recibidoEn: new Date(),
    };
  }

  if ('message' in update) {
    const mensaje = update.message;

    if (!('text' in mensaje) || !mensaje.from) return null;

    return {
      canal: 'telegram',
      canalUserId: String(mensaje.from.id),
      chatId: String(mensaje.chat.id),
      nombre: nombreDe(mensaje.from),
      texto: mensaje.text,
      // Sin `mensajeOrigenId` a proposito: el campo significa "el mensaje que
      // traia el boton", y un mensaje escrito por el usuario no trae ninguno.
      // Poniendo su propio id, quien quisiera editar el panel intentaria editar
      // el mensaje del usuario —que Telegram rechaza— y terminaria publicando
      // un panel duplicado.
      recibidoEn: new Date(mensaje.date * 1000),
    };
  }

  return null;
}

function nombreDe(usuario: { first_name: string; last_name?: string }): string {
  return [usuario.first_name, usuario.last_name].filter(Boolean).join(' ').trim();
}

/** Id del update, para descartar reentregas. */
export function idDeUpdate(update: Update): number {
  return update.update_id;
}
