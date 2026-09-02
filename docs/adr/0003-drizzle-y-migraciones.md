# ADR-0003 — Drizzle ORM y SQL a mano donde hace falta

**Estado:** aceptada · **Fecha:** 2026-09-02

## Contexto

El diseño original planteaba acceso vía `supabase-js` con la service role key y SQL
escrito a mano, con el esquema versionado como un `.sql` suelto.

## Decisión

Se accede a Postgres directamente con **Drizzle ORM** sobre `postgres.js`. El esquema
TypeScript en `src/db/schema/` es la fuente de verdad y `drizzle-kit` genera las
migraciones a partir de él.

Lo que no se puede expresar en el esquema de Drizzle se escribe como SQL a mano dentro
de una migración (`drizzle/0001_trigger_marcador_vistas_rls.sql`): el trigger de
marcador, las vistas de estadísticas y la activación de RLS.

Supabase sigue siendo el Postgres administrado; lo que se descarta es su cliente HTTP,
no el servicio.

## Consecuencias

- Las queries se verifican en tiempo de compilación y los tipos de fila se derivan del
  esquema: no hay tipos escritos a mano que se desactualicen.
- `pnpm db:check` en CI falla si el esquema y las migraciones divergen.
- La app se conecta por el pooler de Supabase (puerto 6543) con `prepare: false`, porque
  el modo *transaction* no soporta prepared statements. Las migraciones usan la conexión
  directa (`DATABASE_MIGRATION_URL`).
- Si más adelante hay un panel web que consulte Supabase directamente con auth de usuario
  final, habrá que escribir policies de RLS reales; hoy las tablas tienen RLS activo sin
  policies, que es deny-all para cualquiera que no sea el backend.
