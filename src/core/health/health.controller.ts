import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { DbService } from '../../db/db.service';
import { RedisService } from '../redis/redis.service';

type EstadoSalud = {
  estado: 'ok' | 'degradado';
  postgres: 'ok' | 'caido';
  redis: 'ok' | 'caido';
  version: string;
  tiempoActivoSegundos: number;
};

/**
 * Healthcheck para Railway/Render.
 *
 * Postgres caido es fatal; Redis caido solo degrada (M3), asi que el endpoint
 * sigue respondiendo 200 y el balanceador no saca el servicio de rotacion por
 * una caida de cache.
 */
@Controller('health')
export class HealthController {
  constructor(
    private readonly db: DbService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async check(): Promise<EstadoSalud> {
    const [postgresOk, redisOk] = await Promise.all([this.db.ping(), this.redis.ping()]);

    return {
      estado: postgresOk && redisOk ? 'ok' : 'degradado',
      postgres: postgresOk ? 'ok' : 'caido',
      redis: redisOk ? 'ok' : 'caido',
      version: process.env.npm_package_version ?? '0.0.0',
      tiempoActivoSegundos: Math.round(process.uptime()),
    };
  }
}
