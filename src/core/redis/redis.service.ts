import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { TypedConfigService } from '../../config/config.service';

/**
 * Desenlace de una operación contra Redis. `ok: false` significa que Redis no
 * respondió; nunca que el valor sea nulo.
 */
export type ResultadoRedis<T> = { ok: true; valor: T } | { ok: false };

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
  private readonly cliente: Redis | null;
  private conectado = false;

  constructor(config: TypedConfigService) {
    const url = config.get('REDIS_URL');

    if (!url) {
      this.cliente = null;
      this.logger.warn('REDIS_URL no está definida: se opera contra Postgres únicamente');
      return;
    }

    this.cliente = new Redis(url, {
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
      lazyConnect: true,
      retryStrategy: (intentos) => Math.min(intentos * 200, 5_000),
    });

    this.cliente.on('ready', () => {
      this.conectado = true;
      this.logger.log('Redis conectado');
    });
    // 'close' es imprescindible: con un retryStrategy que siempre reintenta,
    // 'end' no llega nunca, y un cierre limpio del servidor no emite 'error'.
    // Sin escucharlo, `disponible` seguiría diciendo true mientras todos los
    // comandos rechazan, porque enableOfflineQueue está apagado.
    this.cliente.on('close', () => {
      this.conectado = false;
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
    if (!this.cliente) return;

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
    if (!this.cliente) {
      throw new Error('Redis no está configurado; usa `intentar` para el camino con respaldo');
    }

    return this.cliente;
  }

  /**
   * Ejecuta una operacion contra Redis distinguiendo dos desenlaces que no son
   * lo mismo: que el comando corriera y devolviera `null`, o que Redis fallara.
   *
   * Confundirlos es peligroso. El chequeo de reentregas usa `SET NX`, donde
   * `null` significa "ya existía" — si un error de red se leyera como `null`,
   * se descartaría un mensaje legítimo del usuario.
   */
  async ejecutar<T>(operacion: (redis: Redis) => Promise<T>): Promise<ResultadoRedis<T>> {
    if (!this.cliente || !this.conectado) return { ok: false };

    try {
      return { ok: true, valor: await operacion(this.cliente) };
    } catch (error) {
      this.logger.warn(
        `Operacion Redis fallida, se usa respaldo: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { ok: false };
    }
  }

  /**
   * Variante simple para cuando "no había valor" y "falló" llevan al mismo
   * camino de respaldo: ambos devuelven `null`.
   */
  async intentar<T>(operacion: (redis: Redis) => Promise<T>): Promise<T | null> {
    const resultado = await this.ejecutar(operacion);
    return resultado.ok ? resultado.valor : null;
  }

  async ping(): Promise<boolean> {
    const resultado = await this.intentar((redis) => redis.ping());
    return resultado === 'PONG';
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.cliente) return;

    try {
      // `quit` espera a que se vacien los comandos pendientes; si la conexion
      // ya estaba caida lanza, y ahi cortamos por lo sano.
      await this.cliente.quit();
    } catch {
      this.cliente.disconnect();
    }
  }
}
