import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { DbService } from '../../db/db.service';
import { RedisService } from '../redis/redis.service';

/**
 * Estado de una dependencia.
 *
 * `no_configurado` no es un caso raro: Redis es opcional por diseño (M3), y sin
 * este valor "decidimos no tener Redis" y "Redis se cayó" se reportan igual.
 */
type EstadoDependencia = 'ok' | 'caido' | 'no_configurado';

type EstadoSalud = {
  estado: 'ok' | 'degradado';
  postgres: 'ok' | 'caido';
  redis: EstadoDependencia;
  version: string;
  tiempoActivoSegundos: number;
};

/**
 * Healthcheck para Railway/Render.
 *
 * Postgres caido es fatal; Redis caido solo degrada, asi que el endpoint sigue
 * respondiendo 200 y el balanceador no saca el servicio de rotacion por una
 * caida de cache.
 *
 * `degradado` esta reservado para cuando algo que esperabamos que funcione no
 * funciona. Un Redis que nunca se configuro no degrada nada: marcarlo asi
 * convertia el estado normal del servicio en una alarma, y una alarma que suena
 * siempre entrena a ignorarla justo para el dia que importa.
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
    const [postgresOk, redis] = await Promise.all([this.db.ping(), this.estadoDeRedis()]);

    return {
      estado: postgresOk && redis !== 'caido' ? 'ok' : 'degradado',
      postgres: postgresOk ? 'ok' : 'caido',
      redis,
      version: process.env.npm_package_version ?? '0.0.0',
      tiempoActivoSegundos: Math.round(process.uptime()),
    };
  }

  private async estadoDeRedis(): Promise<EstadoDependencia> {
    // Sin cliente no hay a quien preguntarle: el PING seria un no-op y decir
    // "caido" seria falso.
    if (!this.redis.configurado) return 'no_configurado';

    return (await this.redis.ping()) ? 'ok' : 'caido';
  }
}
