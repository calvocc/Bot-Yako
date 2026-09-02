import { Injectable, Logger } from '@nestjs/common';
import { Telegraf } from 'telegraf';
import { TypedConfigService } from '../../config/config.service';
import type { ChannelAdapter } from '../channel-adapter.interface';
import type { Boton, Canal, DestinoMensaje, MensajeEnviado, RespuestaBot } from '../channel.types';
import { LIMITE_BYTES_ID_BOTON } from '../channel.types';

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

    if (respuesta.editarMensajeId) {
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
        // Telegram rechaza la edición si el contenido es idéntico, y falla si
        // el mensaje es viejo o fue borrado. Ninguno de esos casos justifica
        // perder la respuesta: se manda uno nuevo.
        this.logger.debug(
          `No se pudo editar el mensaje ${respuesta.editarMensajeId}, se envía uno nuevo: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    const enviado = await this.bot.telegram.sendMessage(destino.chatId, respuesta.texto, teclado);

    return { mensajeId: String(enviado.message_id) };
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
