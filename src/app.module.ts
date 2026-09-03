import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { HealthModule } from './core/health/health.module';
import { RedisModule } from './core/redis/redis.module';
import { DbModule } from './db/db.module';

@Module({
  imports: [ConfigModule, DbModule, RedisModule, HealthModule],
})
export class AppModule {}
