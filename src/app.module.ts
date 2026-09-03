import { Module } from '@nestjs/common';
import { TelegramModule } from './channels/telegram/telegram.module';
import { ConfigModule } from './config/config.module';
import { ConversacionModule } from './conversacion/conversacion.module';
import { HealthModule } from './core/health/health.module';
import { RedisModule } from './core/redis/redis.module';
import { DbModule } from './db/db.module';
import { IdentidadModule } from './identidad/identidad.module';
import { OrganizacionModule } from './organizacion.module';

@Module({
  imports: [
    ConfigModule,
    DbModule,
    RedisModule,
    HealthModule,
    ConversacionModule,
    IdentidadModule,
    OrganizacionModule,
    // Va último a propósito: al arrancar publica el menú de comandos, y para
    // entonces los demás módulos ya registraron los suyos.
    TelegramModule,
  ],
})
export class AppModule {}
