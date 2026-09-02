import { timingSafeEqual } from 'node:crypto';
import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import type { Update } from 'telegraf/types';
import { TypedConfigService } from '../../config/config.service';
import { ProcesadorMensajes } from '../procesador-mensajes.service';
import { idDeUpdate, mapearUpdate } from './telegram.mapper';

const HEADER_SECRETO = 'x-telegram-bot-api-secret-token';

@Controller('webhook/telegram')
export class TelegramController {
  private readonly logger = new Logger(TelegramController.name);
  private readonly secreto: Buffer;

  constructor(
    config: TypedConfigService,
    private readonly procesador: ProcesadorMensajes,
  ) {
    this.secreto = Buffer.from(config.get('TELEGRAM_WEBHOOK_SECRET'), 'utf8');
  }

  /**
   * Webhook de Telegram.
   *
   * Responde 200 de inmediato y procesa aparte, por dos motivos: Telegram
   * reintenta cuando la respuesta tarda o falla, y un reintento significaría
   * registrar el mismo gol dos veces — justo lo que el bot existe para evitar.
   * Perder un update es preferible a duplicarlo.
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  recibir(@Body() update: Update, @Headers(HEADER_SECRETO) secretoRecibido?: string): { ok: true } {
    this.verificarSecreto(secretoRecibido);

    const mensaje = mapearUpdate(update);

    if (mensaje) {
      void this.procesador.procesar(mensaje, idDeUpdate(update));
    }

    return { ok: true };
  }

  /**
   * Sin esto el endpoint queda abierto a internet y cualquiera puede inyectar
   * updates falsos: crear partidos, cargar goles, hacerse pasar por otro papá.
   */
  private verificarSecreto(recibido?: string): void {
    if (!recibido) {
      throw new UnauthorizedException();
    }

    const buffer = Buffer.from(recibido, 'utf8');

    // La comparación es de tiempo constante para no filtrar el secreto byte a
    // byte; el chequeo de largo va antes porque timingSafeEqual lo exige.
    if (buffer.length !== this.secreto.length || !timingSafeEqual(buffer, this.secreto)) {
      this.logger.warn('Se rechazó un webhook con secreto inválido');
      throw new UnauthorizedException();
    }
  }
}
