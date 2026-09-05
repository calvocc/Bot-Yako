/**
 * Runner de migraciones. Se ejecuta con `pnpm db:migrate`, fuera del proceso
 * del bot, contra la conexion directa (no el pooler).
 *
 * No usa el migrador de drizzle-orm tal cual (`drizzle-orm/postgres-js/migrator`):
 * ese agrupa TODAS las migraciones pendientes en una unica transaccion
 * (confirmado leyendo `pg-core/dialect.cjs`, sin ninguna opcion para
 * desactivarlo), y Postgres no permite usar un valor de enum recien agregado
 * (`ALTER TYPE ... ADD VALUE`) dentro de esa misma transaccion en que se
 * agrego. Con dos migraciones consecutivas que hacen justo eso -- una agrega
 * valores de enum, la siguiente los usa en una vista (0012/0013) -- una base
 * 100% nueva (un dev que clona el repo, CI, una restauracion) revienta
 * siempre corriendo `db:migrate` una sola vez, no solo en el primer
 * despliegue: para siempre, cada vez que alguien arranca desde cero despues
 * de que las dos ya estan fusionadas.
 *
 * La solucion: reusar `readMigrationFiles` de drizzle-orm (la misma lectura
 * de `meta/_journal.json` + hash de cada archivo que usa su propio
 * migrador, para no reinventar ese parseo) pero aplicar cada migracion
 * pendiente en su PROPIA transaccion en vez de una sola para todas. Mismo
 * criterio de "que falta aplicar" que el migrador de drizzle (comparar
 * contra el `created_at` de la ultima fila de seguimiento, no un chequeo
 * por fila), misma tabla de seguimiento (`drizzle.__drizzle_migrations`),
 * asi que intercambiar este runner por el de drizzle en cualquier momento
 * no rompe nada. Mas lento migracion por migracion (cada una hace su propio
 * commit), irrelevante para el volumen de este proyecto.
 */
import { readMigrationFiles } from 'drizzle-orm/migrator';
import postgres from 'postgres';

const ESQUEMA_MIGRACIONES = 'drizzle';
const TABLA_MIGRACIONES = '__drizzle_migrations';

async function main(): Promise<void> {
  const url = process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL;

  if (!url) {
    throw new Error('Falta DATABASE_MIGRATION_URL o DATABASE_URL');
  }

  const sql = postgres(url, { max: 1, onnotice: () => {} });

  try {
    console.log('Aplicando migraciones...');
    await migrarUnaPorUna(sql);
    console.log('Migraciones aplicadas.');
  } finally {
    await sql.end();
  }
}

async function migrarUnaPorUna(sql: postgres.Sql): Promise<void> {
  const migraciones = readMigrationFiles({ migrationsFolder: './drizzle' });

  await sql`create schema if not exists ${sql(ESQUEMA_MIGRACIONES)}`;
  await sql`
    create table if not exists ${sql(ESQUEMA_MIGRACIONES)}.${sql(TABLA_MIGRACIONES)} (
      id serial primary key,
      hash text not null,
      created_at bigint
    )
  `;

  const [ultima] = await sql<{ created_at: string }[]>`
    select created_at from ${sql(ESQUEMA_MIGRACIONES)}.${sql(TABLA_MIGRACIONES)}
    order by created_at desc
    limit 1
  `;

  let ultimoAplicado = ultima ? Number(ultima.created_at) : null;

  for (const migracion of migraciones) {
    // Mismo chequeo que hace `pg-core/dialect.cjs`: no por fila, contra el
    // ultimo timestamp aplicado. Asume que las migraciones siempre se
    // corren en orden, sin huecos -- la misma asuncion que ya hacia el
    // migrador de drizzle.
    if (ultimoAplicado !== null && ultimoAplicado >= migracion.folderMillis) continue;

    await sql.begin(async (tx) => {
      for (const stmt of migracion.sql) {
        if (stmt.trim().length === 0) continue;
        await tx.unsafe(stmt);
      }

      await tx`
        insert into ${tx(ESQUEMA_MIGRACIONES)}.${tx(TABLA_MIGRACIONES)} ("hash", "created_at")
        values (${migracion.hash}, ${migracion.folderMillis})
      `;
    });

    ultimoAplicado = migracion.folderMillis;
  }
}

main().catch((error: unknown) => {
  console.error('Fallo la migracion:', error);
  process.exit(1);
});
