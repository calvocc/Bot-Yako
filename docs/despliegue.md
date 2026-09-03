# Despliegue

Yako corre como un servicio Node en **Railway**, con Postgres en **Supabase** y Redis en **Upstash**.

| Recurso | Dónde |
|---|---|
| Servicio | Railway · proyecto `3r-connect-crm-api` · servicio `yako-bot` |
| URL pública | `https://yako-bot-production.up.railway.app` |
| Base de datos | Supabase · proyecto `yako` (`hooyfaxknoetfmweazmy`, región `us-east-1`) |
| Redis | Upstash (pendiente de crear) |

> El servicio quedó dentro de un proyecto llamado `3r-connect-crm-api` porque el plan gratuito de
> Railway no permitía crear uno nuevo, y ese proyecto estaba vacío. Conviene renombrarlo a `yako-bot`
> desde el panel.

```
Telegram ──webhook──▶ Railway (servicio yako-bot) ──▶ Supabase (Postgres)
                                                  └──▶ Upstash (Redis, opcional)
```

Railway sigue la rama `main`: cada merge dispara un despliegue.

---

## Variables de entorno

| Variable | Obligatoria | De dónde sale |
|---|:---:|---|
| `NODE_ENV` | — | `production` |
| `PORT` | — | La inyecta Railway |
| `DATABASE_URL` | ✅ | Supabase → Settings → Database → Connection string → **Transaction pooler** (puerto 6543) |
| `DATABASE_MIGRATION_URL` | ✅ | La misma pantalla → **Direct connection** (puerto 5432) |
| `TELEGRAM_BOT_TOKEN` | ✅ | BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | ✅ | Cadena aleatoria: `openssl rand -hex 32` |
| `TELEGRAM_WEBHOOK_URL` | — | El dominio público de Railway |
| `REDIS_URL` | — | Upstash → la URL `rediss://…` |

Las cuatro obligatorias se validan al arrancar: si falta alguna, el proceso no levanta y el log dice
cuál. Es deliberado — es preferible un despliegue que falla claro a un bot a medio configurar
respondiéndole mal a la gente en mitad de un partido.

### Por qué dos URLs de base de datos

La aplicación se conecta por el **pooler en modo transaction**, que aguanta muchas conexiones cortas
pero no soporta prepared statements (por eso el cliente usa `prepare: false`). Las **migraciones**
necesitan la conexión directa, porque ejecutan DDL en una sola sesión larga.

### Redis es opcional a propósito

Sin `REDIS_URL` el bot arranca igual y `/health` responde `degradado`. Redis acelera el partido en
vivo (caché de sesión, ventana de duplicados, locks) pero no es fuente de verdad: todo tiene respaldo
en Postgres. Exigirlo solo lograría que una caída de la caché tumbara el bot.

---

## Pasos que quedan pendientes

Lo demás ya está configurado; falta cargar los secretos y un ajuste en GitHub.

1. **Revocar el token de Telegram.** En BotFather, `/revoke` sobre el bot. Invalida el token viejo
   —que se compartió por chat y hay que dar por comprometido— y entrega uno nuevo.
2. **Contraseña de la base.** Supabase → Settings → Database. Si no la tienes, *Reset database
   password*. La cadena de conexión trae `[YOUR-PASSWORD]`: hay que reemplazarlo por esa contraseña.
3. **Crear el Redis en Upstash** (opcional; se puede dejar para después).
4. **Cargar las variables en Railway** (servicio `yako-bot` → Variables):
   `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` (genéralo con `openssl rand -hex 32`),
   `DATABASE_URL`, `DATABASE_MIGRATION_URL` y, si lo creaste, `REDIS_URL`.
   Al guardar, el servicio redespliega solo.
5. **Rama por defecto en GitHub.** Settings → General → Default branch: cambiar a `main`. Después se
   puede borrar `claude/football-stats-bot-i95v3b`, cuyos commits ya viven en las ramas de fase.
6. **Apuntar Railway a `main`.** El servicio está siguiendo `fase-1-canal-y-motor` para poder validar
   el pipeline antes del merge. Una vez mergeados los PR, hay que cambiarlo a `main` en
   Settings → Source.

---

## Puesta en marcha

### 1. Supabase

Proyecto creado y migraciones aplicadas. Para obtener las cadenas de conexión:
**Settings → Database → Connection string**, y copiar las dos variantes de la tabla de arriba.

Al copiarlas hay que reemplazar `[YOUR-PASSWORD]` por la contraseña de la base de datos.

### 2. Upstash (Redis)

1. Crear cuenta en [upstash.com](https://upstash.com) y una base **Redis** nueva.
2. Región `us-east-1`, para que quede cerca de Railway y Supabase.
3. Copiar la URL que empieza con `rediss://` (con doble `s`: es la que usa TLS).

El plan gratuito da 256 MB y 500.000 comandos al mes. Yako consume muy poco: solo trabaja durante los
partidos, y son unos pocos comandos por evento.

### 3. Railway

El proyecto y el servicio ya están creados y conectados al repositorio. Falta cargar los secretos:
**Variables** en el servicio, y pegar los valores de la tabla.

El servicio redespliega solo al guardar las variables.

### 4. Webhook de Telegram

No hay que hacer nada a mano: al arrancar, el bot registra el webhook contra
`TELEGRAM_WEBHOOK_URL` pasando el `TELEGRAM_WEBHOOK_SECRET`. En el log aparece
`Webhook registrado en …`.

Para comprobarlo desde fuera:

```bash
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```

Debe mostrar la URL de Railway y `pending_update_count` en 0, sin `last_error_message`.

---

## Comprobar que quedó bien

```bash
curl https://<dominio-railway>/health
```

- `{"estado":"ok"}` — Postgres y Redis responden.
- `{"estado":"degradado", "redis":"caido"}` — falta `REDIS_URL` o Upstash no responde. El bot
  funciona; conviene revisarlo pero no es una caída.
- `{"postgres":"caido"}` — esto sí es grave: revisar `DATABASE_URL`.

Y la prueba de verdad: escribirle `/ayuda` al bot en Telegram.

---

## Migraciones

Corren **antes** de cada despliegue, con el comando pre-deploy `pnpm db:migrate`. Si una migración
falla, Railway no promueve la versión nueva y la anterior sigue sirviendo.

> El esquema inicial se aplicó directamente sobre Supabase, así que las cuatro migraciones quedaron
> registradas a mano en `drizzle.__drizzle_migrations`. Sin ese registro, el primer `db:migrate`
> intentaría crear todo de nuevo y fallaría. De aquí en adelante el flujo es el normal: Drizzle
> aplica solo lo pendiente.

Al cambiar el esquema en `src/db/schema/`:

```bash
pnpm db:generate     # genera el SQL a partir del esquema
pnpm db:check        # confirma que esquema y migraciones no divergieron
```

Hay que revisar el SQL generado antes de commitearlo, sobre todo si toca datos existentes.

---

## Seguridad

- **Ningún secreto va al repositorio.** `.env` está en `.gitignore`; lo versionado es `.env.example`,
  solo con los nombres.
- **El webhook está autenticado.** Valida el header `X-Telegram-Bot-Api-Secret-Token` con comparación
  de tiempo constante y responde 401 si no coincide. Sin esto cualquiera podría inyectar mensajes
  falsos y cargar goles haciéndose pasar por otra persona.
- **Si un token se expone** (por ejemplo, al pegarlo en un chat), hay que revocarlo con `/revoke` en
  BotFather. Invalida el viejo en el acto y entrega uno nuevo, que se actualiza en Railway.
- **RLS activo en todas las tablas**, sin policies: el backend accede como dueño de las tablas, y
  cualquier otra credencial que se filtre no lee nada.
