import { Module } from '@nestjs/common';
import { TelegramModule } from './channels/telegram/telegram.module';
import { ConfigModule } from './config/config.module';
import { ConversacionModule } from './conversacion/conversacion.module';
import { HealthModule } from './core/health/health.module';
import { RedisModule } from './core/redis/redis.module';
import { DbModule } from './db/db.module';

@Module({
  imports: [ConfigModule, DbModule, RedisModule, HealthModule, ConversacionModule, TelegramModule],
})
export class AppModule {}
