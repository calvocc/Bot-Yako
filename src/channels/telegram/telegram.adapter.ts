import { Injectable, Logger } from '@nestjs/common';
import { Telegraf } from 'telegraf';
import { TypedConfigService } from '../../config/config.service';
import type { ChannelAdapter } from '../channel-adapter.interface';
import type {
  Boton,
  Canal,
  ComandoDeMenu,
  DestinoMensaje,
  MensajeEnviado,
  RespuestaBot,
} from '../channel.types';
import { LIMITE_BYTES_ID_BOTON } from '../channel.types';

/**
 * Telegram rechaza una edición cuyo resultado sería idéntico al mensaje actual.
 * Se detecta por el texto de la descripción, que es lo único que la Bot API
 * ofrece para distinguirlo: el código es 400 para muchos otros motivos.
 */
function esContenidoSinCambios(error: unknown): boolean {
  const descripcion =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'description' in error
        ? String(error.description)
        : '';

  return descripcion.includes('message is not modified');
}

/**
 * Largo máximo del texto de un mensaje en la Bot API. `String.length` cuenta
 * unidades UTF-16, igual que Telegram, así que un emoji ocupa lo mismo en
 * los dos lados.
 */
export const LIMITE_CARACTERES_MENSAJE = 4096;

/**
 * Parte un texto largo en trozos que Telegram acepta, cortando entre líneas
 * para no dejar un renglón a la mitad. Solo una línea que por sí sola no
 * entra se corta a la fuerza.
 */
export function partirTexto(texto: string, limite = LIMITE_CARACTERES_MENSAJE): string[] {
  if (texto.length <= limite) return [texto];

  const trozos: string[] = [];
  let actual = '';

  for (const linea of texto.split('\n')) {
    const candidato = actual ? `${actual}\n${linea}` : linea;

    if (candidato.length <= limite) {
      actual = candidato;
      continue;
    }

    if (actual) trozos.push(actual);

    let resto = linea;

    while (resto.length > limite) {
      trozos.push(resto.slice(0, limite));
      resto = resto.slice(limite);
    }

    actual = resto;
  }

  if (actual) trozos.push(actual);

  return trozos;
}

/** Botones por fila en el teclado. Dos entran cómodos en un teléfono. */
const BOTONES_POR_FILA = 2;
/** Con rótulos largos conviene una sola columna. */
const LARGO_ROTULO_ANCHO = 14;

@Injectable()
export class TelegramAdapter implements ChannelAdapter {
  readonly canal: Canal = 'telegram';

  private readonly logger = new Logger(TelegramAdapter.name);
  private readonly bot: Telegraf;

  constructor(config: TypedConfigService) {
    this.bot = new Telegraf(config.get('TELEGRAM_BOT_TOKEN'));
  }

  /** Acceso al cliente, para registrar el webhook y el menú de comandos. */
  get telegraf(): Telegraf {
    return this.bot;
  }

  async enviar(destino: DestinoMensaje, respuesta: RespuestaBot): Promise<MensajeEnviado> {
    const teclado = this.construirTeclado(respuesta.botones);
    const trozos = partirTexto(respuesta.texto);

    // Un texto que no entra en un solo mensaje no se puede editar en el
    // sitio: se manda nuevo, en varios mensajes.
    if (respuesta.editarMensajeId && trozos.length === 1) {
      try {
        await this.bot.telegram.editMessageText(
          destino.chatId,
          Number(respuesta.editarMensajeId),
          undefined,
          respuesta.texto,
          teclado,
        );

        return { mensajeId: respuesta.editarMensajeId };
      } catch (error) {
        // Telegram responde 400 cuando el contenido es idéntico. Eso no es un
        // fallo: el mensaje ya dice lo que queríamos. Reenviarlo publicaría un
        // panel duplicado, justo lo que la edición en el sitio evita.
        if (esContenidoSinCambios(error)) {
          return { mensajeId: respuesta.editarMensajeId };
        }

        // El resto —mensaje viejo, borrado, sin permisos— sí justifica mandar
        // uno nuevo antes que perder la respuesta.
        this.logger.debug(
          `No se pudo editar el mensaje ${respuesta.editarMensajeId}, se envía uno nuevo: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    // Los trozos van en orden y los botones solo en el último, que es el
    // que queda abajo, a mano, y el que se edita después.
    let ultimoId = 0;

    for (const [i, trozo] of trozos.entries()) {
      const enviado = await this.bot.telegram.sendMessage(
        destino.chatId,
        trozo,
        i === trozos.length - 1 ? teclado : undefined,
      );

      ultimoId = enviado.message_id;
    }

    return { mensajeId: String(ultimoId) };
  }

  /**
   * Telegram muestra un reloj girando en el botón hasta recibir esto. Se llama
   * apenas llega el toque, antes del trabajo real, para que la interfaz se
   * sienta instantánea durante un partido.
   */
  async acusarRecibo(acuseId: string, texto?: string): Promise<void> {
    try {
      await this.bot.telegram.answerCbQuery(acuseId, texto);
    } catch (error) {
      // Un acuse vencido no debe abortar el manejo del evento en sí.
      this.logger.debug(
        `No se pudo acusar recibo de ${acuseId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Menú "/" por chat (RF: cada quien ve solo lo que puede hacer). En un chat
   * privado `chat_id` es el propio usuario, así que alcanza con el scope
   * `chat` -- no hace falta `chat_member`, pensado para diferenciar miembros
   * dentro de un mismo grupo.
   */
  async actualizarMenu(destino: DestinoMensaje, comandos: readonly ComandoDeMenu[]): Promise<void> {
    try {
      await this.bot.telegram.setMyCommands(
        comandos.map((comando) => ({ command: comando.nombre, description: comando.descripcion })),
        { scope: { type: 'chat', chat_id: destino.chatId } },
      );
    } catch (error) {
      // Un menú desactualizado no es motivo para que la respuesta real falle.
      this.logger.debug(
        `No se pudo actualizar el menú de ${destino.chatId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private construirTeclado(botones?: Boton[]) {
    // Un teclado vacío también sirve para quitar los botones de un mensaje que
    // se está editando, así que no hace falta un caso aparte.
    if (!botones?.length) {
      return { reply_markup: { inline_keyboard: [] } };
    }

    for (const boton of botones) {
      const bytes = Buffer.byteLength(boton.id, 'utf8');

      if (bytes > LIMITE_BYTES_ID_BOTON) {
        // Telegram trunca en silencio, lo que produce botones que no hacen
        // nada. Preferimos enterarnos acá.
        throw new Error(
          `El id de botón "${boton.id}" ocupa ${bytes} bytes y Telegram admite ` +
            `${LIMITE_BYTES_ID_BOTON}. Usa un id corto y guarda el detalle en los datos del flujo.`,
        );
      }
    }

    const unaColumna = botones.some((boton) => boton.texto.length > LARGO_ROTULO_ANCHO);
    const porFila = unaColumna ? 1 : BOTONES_POR_FILA;
    const filas: { text: string; callback_data: string }[][] = [];

    for (let i = 0; i < botones.length; i += porFila) {
      filas.push(
        botones.slice(i, i + porFila).map((boton) => ({
          text: boton.texto,
          callback_data: boton.id,
        })),
      );
    }

    return { reply_markup: { inline_keyboard: filas } };
  }
}
