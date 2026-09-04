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
| [Despliegue](docs/despliegue.md) | Railway, Supabase, Upstash y variables de entorno |

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

`GET /health` responde el estado de Postgres y Redis. Redis es opcional: sin `REDIS_URL`
el servicio arranca igual y se reporta `redis: "no_configurado"` con `estado: "ok"`, porque
no tenerlo es una decisión y no una avería. `degradado` queda para cuando hay un Redis
configurado que deja de responder — ahí el bot sigue funcionando contra Postgres.

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

Desplegado en `https://yako-bot-production.up.railway.app`.

| Fase | Estado |
|---|---|
| 0 · Fundaciones: scaffold, esquema, migraciones, health, CI | ✅ |
| 1 · Capa de canal y motor conversacional | ✅ |
| 2 · Identidad, organización y permisos | ✅ |
| 3 · Partidos y carga en vivo | pendiente |
| 4 · Cierre, post partido y estadísticas | pendiente |
| 5 · WhatsApp | pendiente |
