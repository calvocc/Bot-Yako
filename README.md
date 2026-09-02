# Yako ⚽

Bot para llevar las estadísticas de una academia de fútbol infantil: goles, asistencias,
tarjetas y cambios, cargados en vivo desde el borde de la cancha o después del partido,
y consultables por cualquiera del grupo.

Funciona en **Telegram**. La arquitectura contempla **WhatsApp** como segundo canal sin
reescribir la lógica de producto (ver [ADR-0002](docs/adr/0002-motor-conversacional-propio.md)).

## Documentación

| Documento | Qué contiene |
|---|---|
| [Requerimientos](docs/yako-requerimientos.md) | Qué hay que construir |
| [Flujo de conversación](docs/yako-flujo-conversacion.md) | Los mensajes exactos del bot |
| [Arquitectura](docs/yako-arquitectura.md) | Cómo se organiza el backend |
| [Revisión de documentos](docs/revision-documentos.md) | Qué se corrigió del diseño original y por qué |
| [ADRs](docs/adr/) | Las decisiones de fondo, razonadas |

## Stack

NestJS · TypeScript · PostgreSQL (Supabase) con Drizzle ORM · Redis · Telegraf como
transporte.

## Desarrollo

```bash
pnpm install
cp .env.example .env          # completar TELEGRAM_BOT_TOKEN y TELEGRAM_WEBHOOK_SECRET
docker compose up -d          # Postgres y Redis locales
pnpm db:migrate
pnpm start:dev
```

`GET /health` responde el estado de Postgres y Redis. Si Redis no está disponible el
servicio arranca igual, en modo degradado: Redis acelera el partido en vivo pero no es
fuente de verdad.

### Comandos

| Comando | Qué hace |
|---|---|
| `pnpm start:dev` | Levanta el bot con recarga en caliente |
| `pnpm test` | Pruebas unitarias |
| `pnpm test:e2e` | Conversaciones completas contra un adaptador de canal falso |
| `pnpm lint` · `pnpm format` | Estilo |
| `pnpm db:generate` | Genera una migración a partir del esquema Drizzle |
| `pnpm db:migrate` | Aplica las migraciones pendientes |
| `pnpm db:check` | Verifica que esquema y migraciones no divergieron |

### Base de datos

El esquema vive en `src/db/schema/` y es la fuente de verdad: las migraciones se generan
desde ahí. Lo que no se puede expresar en Drizzle — el trigger que mantiene el marcador,
las vistas de estadísticas, la activación de RLS — se escribe a mano dentro de una
migración.

Después de cambiar el esquema: `pnpm db:generate` y revisar el SQL generado antes de
commitearlo.

## Estado

| Fase | Estado |
|---|---|
| 0 · Fundaciones: scaffold, esquema, migraciones, health, CI | ✅ |
| 1 · Capa de canal y motor conversacional | pendiente |
| 2 · Identidad, organización y permisos | pendiente |
| 3 · Partidos y carga en vivo | pendiente |
| 4 · Cierre, post partido y estadísticas | pendiente |
| 5 · WhatsApp | pendiente |
