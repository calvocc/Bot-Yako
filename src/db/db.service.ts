import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { TypedConfigService } from '../config/config.service';
import * as schema from './schema';

export type YakoDatabase = PostgresJsDatabase<typeof schema>;

/**
 * La base o una transacción en curso.
 *
 * Permite que un servicio participe de una transacción abierta por otro, en vez
 * de abrir la suya y perder la atomicidad entre ambos.
 */
export type EjecutorDb = YakoDatabase | Parameters<Parameters<YakoDatabase['transaction']>[0]>[0];

@Injectable()
export class DbService implements OnModuleDestroy {
  private readonly logger = new Logger(DbService.name);
  private readonly cliente: postgres.Sql;

  /** Instancia de Drizzle. Es el unico punto de acceso a Postgres. */
  readonly db: YakoDatabase;

  constructor(config: TypedConfigService) {
    this.cliente = postgres(config.get('DATABASE_URL'), {
      max: config.esProduccion ? 10 : 5,
      idle_timeout: 20,
      connect_timeout: 10,
      // Supabase sirve la app por el pooler en modo transaction, que no
      // soporta prepared statements.
      prepare: false,
    });

    this.db = drizzle(this.cliente, { schema, casing: 'snake_case' });
  }

  /** Chequeo de vida usado por `GET /health`. */
  async ping(): Promise<boolean> {
    try {
      await this.cliente`select 1`;
      return true;
    } catch (error) {
      this.logger.error('Postgres no responde', error instanceof Error ? error.stack : error);
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.cliente.end({ timeout: 5 });
  }
}
