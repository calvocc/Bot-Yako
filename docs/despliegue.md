# Despliegue

Yako corre como un contenedor Docker en un **VPS propio administrado con Dokploy**, con Postgres
en **Supabase** y Redis en **Upstash**.

| Recurso | Dónde |
|---|---|
| Servicio | Dokploy · aplicación `yako-bot` (comparte VPS con otros proyectos) |
| URL pública | El dominio que se asigne en Dokploy (ver más abajo) |
| Base de datos | Supabase · proyecto `yako` (`hooyfaxknoetfmweazmy`, región `us-east-1`) |
| Redis | Upstash (pendiente de crear — el bot funciona sin él) |

```
Telegram ──webhook──▶ Dokploy/VPS (contenedor yako-bot) ──▶ Supabase (Postgres)
                                                        └──▶ Upstash (Redis, opcional)
```

Dokploy sigue la rama `main`: cada push a esa rama dispara un rebuild y redeploy del contenedor.

> Migrado desde Railway (plan gratuito agotado). Supabase y Upstash no cambian: solo cambia dónde
> corre el proceso Node.

---

## Cómo se construye la imagen

El repo trae un `Dockerfile` multi-stage (build con `pnpm build`, runtime solo con dependencias de
producción) y `docker/entrypoint.sh`, que:

1. Corre las migraciones (`tsx src/db/migrate.ts`) contra `DATABASE_MIGRATION_URL`.
2. Si fallan, el contenedor termina con código distinto de cero y Dokploy no promueve el
   despliegue — la versión anterior sigue sirviendo. Es el mismo comportamiento que el
   pre-deploy command de Railway, pero implementado dentro del contenedor porque Dokploy no tiene
   un paso equivalente separado del arranque.
3. Si migran bien, arranca `node dist/main`.

`docker-compose.yml` en la raíz **no** se usa para producción: es solo Postgres y Redis para
desarrollo local (`docker compose up -d` + `pnpm start:dev` fuera de Docker).

---

## Variables de entorno

Las mismas que antes; nada cambió a nivel de aplicación.

| Variable | Obligatoria | De dónde sale |
|---|:---:|---|
| `NODE_ENV` | — | `production` |
| `PORT` | — | `3000` (el que expone el `Dockerfile`; coincidir con el puerto configurado en Dokploy) |
| `DATABASE_URL` | ✅ | Supabase → Settings → Database → Connection string → **Transaction pooler** (puerto 6543) |
| `DATABASE_MIGRATION_URL` | ✅ | La misma pantalla → **Direct connection** (puerto 5432) |
| `TELEGRAM_BOT_TOKEN` | ✅ | BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | ✅ | Cadena aleatoria: `openssl rand -hex 32` |
| `TELEGRAM_WEBHOOK_URL` | — | El dominio público que se configure en Dokploy |
| `REDIS_URL` | — | Upstash → la URL `rediss://…` |

Las cuatro obligatorias se validan al arrancar: si falta alguna, el proceso no levanta y el log dice
cuál.

### Por qué dos URLs, y por qué las dos van por el pooler

La aplicación usa el **pooler en modo transaction** (puerto 6543), que aguanta muchas conexiones
cortas pero no soporta prepared statements — por eso el cliente va con `prepare: false`. Las
**migraciones** usan el **pooler en modo session** (puerto 5432), que sí mantiene una sesión larga
para ejecutar DDL.

> **No uses la conexión directa (`db.<ref>.supabase.co`).** En el plan gratuito de Supabase ese host
> resuelve **solo a IPv6**. Si el VPS de Dokploy no tiene salida IPv6, el despliegue se cuelga
> intentando conectar y falla por timeout — usa siempre el pooler, que tiene IPv4.
>
> Ambas URLs usan el host `aws-0-us-east-1.pooler.supabase.com` y el usuario
> `postgres.<ref-del-proyecto>`. Si el host no es el correcto, el error es explícito:
> `tenant/user postgres.<ref> not found`. La cadena buena está siempre en
> Settings → Database → Connection string.

### Redis es opcional a propósito

Sin `REDIS_URL` el bot arranca igual y `/health` responde `redis: "no_configurado"` con
`estado: "ok"`. Redis acelera la lectura de sesión y descarta reentregas del webhook, pero no es
fuente de verdad: la detección de goles duplicados vive en Postgres desde la Fase 3
([ADR-0004](adr/0004-dedup-atomico-en-postgres.md)) y el estado conversacional se escribe siempre en
Postgres. Exigirlo solo lograría que una caída de la caché tumbara el bot.

`degradado` está reservado para cuando algo que **esperábamos** que funcione no funciona: un Redis
configurado que deja de responder. No haberlo configurado es una decisión, no una avería.

---

## Puesta en marcha en Dokploy

Asumiendo que Dokploy ya está corriendo en el VPS (como con los otros proyectos):

### 1. Crear la aplicación

1. En el panel de Dokploy, **Create Application** (puede ir en un proyecto propio o en uno que
   agrupe varios bots, como se prefiera organizar).
2. **Source**: conectar el repositorio `calvocc/bot-yako`, rama `main`.
3. **Build type**: `Dockerfile` (usa el `Dockerfile` de la raíz del repo, no hace falta configurar
   nada más — no usa Nixpacks ni buildpacks).
4. **Puerto del contenedor**: `3000` (el que expone el `Dockerfile`).

### 2. Variables de entorno

Cargar en la sección **Environment** las mismas variables de la tabla de arriba, con los valores de
Supabase y BotFather. `TELEGRAM_WEBHOOK_URL` se completa después de asignar el dominio (paso
siguiente).

### 3. Dominio

En **Domains**, agregar el dominio o subdominio para este bot (ej. `yako-bot.tudominio.com`) y
dejar que Dokploy emita el certificado TLS (Let's Encrypt vía Traefik, automático). Apuntar el
DNS del subdominio al VPS si todavía no lo está.

Con el dominio ya activo, volver a **Environment** y setear `TELEGRAM_WEBHOOK_URL` con esa URL
completa (`https://yako-bot.tudominio.com`), y redeploy.

### 4. Health check

Configurar el health check de Dokploy contra `GET /health` (el `Dockerfile` ya trae un
`HEALTHCHECK` de Docker equivalente, pero Dokploy puede usar el suyo propio para las alertas del
panel).

### 5. Deploy

Disparar el primer deploy manual desde el panel. El log del contenedor debe mostrar:

```
Aplicando migraciones... → Migraciones aplicadas.
Mapped {/health, GET} · Mapped {/webhook/telegram, POST}
Webhook registrado en https://<tu-dominio>
Yako escuchando en el puerto 3000
```

A partir de ahí, cada push a `main` dispara un rebuild automático (configurable en **Deployments →
Auto Deploy** dentro de Dokploy).

### 6. Supabase y Upstash

No cambian. Si es la primera vez que se configuran, ver las notas originales:

- **Supabase**: proyecto y migraciones ya existen. Las cadenas de conexión están en
  Settings → Database → Connection string (reemplazar `[YOUR-PASSWORD]` por la contraseña real).
- **Upstash**: crear cuenta en [upstash.com](https://upstash.com), base Redis nueva, región
  `us-east-1`, copiar la URL `rediss://…`. El plan gratuito (256 MB, 500.000 comandos/mes) sobra
  para este bot.

### 7. Webhook de Telegram

No hay que hacer nada a mano: al arrancar, el bot registra el webhook contra
`TELEGRAM_WEBHOOK_URL` pasando el `TELEGRAM_WEBHOOK_SECRET`. En el log aparece
`Webhook registrado en …`.

Para comprobarlo desde fuera:

```bash
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```

Debe mostrar el dominio de Dokploy y `pending_update_count` en 0, sin `last_error_message`.

### 8. Dar de baja Railway

Una vez confirmado que el bot responde bien desde Dokploy (`/health` y `/ayuda` en Telegram),
eliminar el servicio viejo en Railway para no dejarlo huérfano con secretos vivos.

---

## Comprobar que quedó bien

```bash
curl https://<tu-dominio>/health
```

- `{"estado":"ok", "redis":"no_configurado"}` — lo normal hoy: no hay Redis y no hace falta.
- `{"estado":"ok", "redis":"ok"}` — hay Redis y responde.
- `{"estado":"degradado", "redis":"caido"}` — hay `REDIS_URL` pero no responde. El bot funciona
  contra Postgres; conviene revisarlo, pero no es una caída.
- `{"postgres":"caido"}` — esto sí es grave: revisar `DATABASE_URL`.

Y la prueba de verdad: escribirle `/ayuda` al bot en Telegram.

---

## Migraciones

Corren **dentro del contenedor, antes de arrancar el servidor** (`docker/entrypoint.sh`). Si una
migración falla, el contenedor no llega a levantar `node dist/main` y Dokploy no promueve el
despliegue — la versión anterior sigue corriendo.

> El esquema inicial se aplicó directamente sobre Supabase, así que las cuatro primeras migraciones
> quedaron registradas a mano en `drizzle.__drizzle_migrations`. De ahí en adelante el flujo es el
> normal: el runner aplica solo lo pendiente (ver el comentario en `src/db/migrate.ts` sobre por qué
> no se usa el migrador estándar de drizzle-orm).

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
  BotFather. Invalida el viejo en el acto y entrega uno nuevo, que se actualiza en Dokploy →
  Environment.
- **RLS activo en todas las tablas**, sin policies: el backend accede como dueño de las tablas, y
  cualquier otra credencial que se filtre no lee nada.
- **Rotar las credenciales compartidas durante la puesta en marcha original** sigue pendiente: el
  token del bot y la contraseña de la base se compartieron por chat, así que hay que darlos por
  comprometidos (`/revoke` en BotFather, *Reset database password* en Supabase) y actualizar los
  valores en Dokploy.
