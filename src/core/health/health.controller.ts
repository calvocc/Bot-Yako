import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
 * Healthcheck para Dokploy.
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
      version: versionDeApp(),
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

/**
 * Versión que reporta `/health`.
 *
 * `npm_package_version` solo existe cuando el proceso lo lanza npm/pnpm; en
 * Docker (`node dist/main`) nunca está, y por eso producción reportaba
 * `0.0.0`. El orden es: `APP_VERSION` (permite fijarla por despliegue sin
 * tocar código), la `version` de `package.json` —que viaja en la imagen
 * porque el Dockerfile la copia— y `0.0.0` como último recurso.
 */
export function versionDeApp(): string {
  if (process.env.APP_VERSION) return process.env.APP_VERSION;

  try {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
      version?: unknown;
    };

    if (typeof pkg.version === 'string' && pkg.version) return pkg.version;
  } catch {
    // Sin package.json legible no hay nada que leer: último recurso abajo.
  }

  return '0.0.0';
}
