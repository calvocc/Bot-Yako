import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from './env.schema';

/**
 * ConfigService tipado: `config.get('PORT')` devuelve number, no
 * `string | undefined`.
 *
 * Vive aparte de config.module.ts a proposito: `ConfigModule.forRoot()` valida
 * el entorno al evaluarse, asi que importar el modulo solo para tomar el tipo
 * del servicio haria fallar cualquier test sin un .env completo.
 */
@Injectable()
export class TypedConfigService {
  constructor(private readonly config: ConfigService) {}

  get<K extends keyof Env>(clave: K): Env[K] {
    return this.config.get(clave as string) as Env[K];
  }

  get esProduccion(): boolean {
    return this.get('NODE_ENV') === 'production';
  }
}
