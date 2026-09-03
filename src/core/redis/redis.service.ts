import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { TypedConfigService } from '../../config/config.service';

/**
 * Cliente Redis compartido.
 *
 * M3 (degradacion elegante): Redis acelera el partido en vivo pero no es
 * fuente de verdad. Si se cae, `disponible` pasa a false y los servicios que
 * dependen de el (dedup, locks, estado) caen a Postgres en vez de tumbar el
 * bot en medio de un partido.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly cliente: Redis;
  private conectado = false;

  constructor(config: TypedConfigService) {
    this.cliente = new Redis(config.get('REDIS_URL'), {
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
      lazyConnect: true,
      retryStrategy: (intentos) => Math.min(intentos * 200, 5_000),
    });

    this.cliente.on('ready', () => {
      this.conectado = true;
      this.logger.log('Redis conectado');
    });
    this.cliente.on('end', () => {
      this.conectado = false;
    });
    this.cliente.on('error', (error: Error) => {
      this.conectado = false;
      this.logger.warn(`Redis no disponible: ${error.message}`);
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.cliente.connect();
    } catch {
      // Ya quedo registrado por el handler de 'error'. Arrancamos igual:
      // los consumidores usan el camino de respaldo en Postgres.
      this.logger.warn('Arrancando sin Redis; se usara el respaldo en Postgres');
    }
  }

  get disponible(): boolean {
    return this.conectado;
  }

  /** Acceso directo al cliente. Usar solo tras comprobar `disponible`. */
  get raw(): Redis {
    return this.cliente;
  }

  /**
   * Ejecuta una operacion contra Redis y devuelve `null` si no esta
   * disponible, para que el llamador decida el respaldo sin try/catch.
   */
  async intentar<T>(operacion: (redis: Redis) => Promise<T>): Promise<T | null> {
    if (!this.conectado) return null;
    try {
      return await operacion(this.cliente);
    } catch (error) {
      this.logger.warn(
        `Operacion Redis fallida, se usa respaldo: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  async ping(): Promise<boolean> {
    const resultado = await this.intentar((redis) => redis.ping());
    return resultado === 'PONG';
  }

  async onModuleDestroy(): Promise<void> {
    try {
      // `quit` espera a que se vacien los comandos pendientes; si la conexion
      // ya estaba caida lanza, y ahi cortamos por lo sano.
      await this.cliente.quit();
    } catch {
      this.cliente.disconnect();
    }
  }
}
