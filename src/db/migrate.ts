/**
 * Runner de migraciones. Se ejecuta con `pnpm db:migrate`, fuera del proceso
 * del bot, contra la conexion directa (no el pooler).
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

async function main(): Promise<void> {
  const url = process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL;

  if (!url) {
    throw new Error('Falta DATABASE_MIGRATION_URL o DATABASE_URL');
  }

  const cliente = postgres(url, { max: 1, onnotice: () => {} });

  try {
    console.log('Aplicando migraciones...');
    await migrate(drizzle(cliente), { migrationsFolder: './drizzle' });
    console.log('Migraciones aplicadas.');
  } finally {
    await cliente.end();
  }
}

main().catch((error: unknown) => {
  console.error('Fallo la migracion:', error);
  process.exit(1);
});
