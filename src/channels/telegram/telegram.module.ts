import { Logger, Module, type OnModuleInit } from '@nestjs/common';
import { TypedConfigService } from '../../config/config.service';
import { ConversacionModule } from '../../conversacion/conversacion.module';
import { comandosDisponibles } from '../../conversacion/comandos';
import { Router } from '../../conversacion/router.service';
import { ChannelRegistry } from '../channel.registry';
import { ProcesadorMensajes } from '../procesador-mensajes.service';
import { TelegramAdapter } from './telegram.adapter';
import { TelegramController } from './telegram.controller';

@Module({
  imports: [ConversacionModule],
  controllers: [TelegramController],
  providers: [TelegramAdapter, ChannelRegistry, ProcesadorMensajes],
  exports: [TelegramAdapter, ChannelRegistry],
})
export class TelegramModule implements OnModuleInit {
  private readonly logger = new Logger(TelegramModule.name);

  constructor(
    private readonly adaptador: TelegramAdapter,
    private readonly registro: ChannelRegistry,
    private readonly config: TypedConfigService,
    private readonly router: Router,
  ) {}

  async onModuleInit(): Promise<void> {
    this.registro.registrar(this.adaptador);

    await this.publicarMenuDeComandos();
    await this.registrarWebhook();
  }

  /**
   * Publica en el menú de Telegram solo los comandos que el router tiene
   * registrados. Anunciar el catálogo completo haría que el menú ofreciera
   * comandos de fases que todavía no existen.
   */
  private async publicarMenuDeComandos(): Promise<void> {
    const disponibles = comandosDisponibles(this.router.comandosRegistrados);

    try {
      await this.adaptador.telegraf.telegram.setMyCommands(
        disponibles.map((comando) => ({
          command: comando.nombre,
          description: comando.descripcion,
        })),
      );

      this.logger.log(`Menú publicado con ${disponibles.length} comando(s)`);
    } catch (error) {
      // Que no se pueda publicar el menú no justifica no arrancar el bot.
      this.logger.warn(
        `No se pudo publicar el menú de comandos: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async registrarWebhook(): Promise<void> {
    const url = this.config.get('TELEGRAM_WEBHOOK_URL');

    if (!url) {
      this.logger.warn(
        'TELEGRAM_WEBHOOK_URL no está definida: el webhook no se registra. ' +
          'En desarrollo, expón el puerto con un túnel y define esa variable.',
      );
      return;
    }

    try {
      await this.adaptador.telegraf.telegram.setWebhook(
        `${url.replace(/\/$/, '')}/webhook/telegram`,
        {
          secret_token: this.config.get('TELEGRAM_WEBHOOK_SECRET'),
          allowed_updates: ['message', 'callback_query'],
        },
      );

      this.logger.log(`Webhook registrado en ${url}`);
    } catch (error) {
      this.logger.error(
        `No se pudo registrar el webhook: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
