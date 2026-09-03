# Despliegue

Yako corre como un servicio Node en **Railway**, con Postgres en **Supabase** y Redis en **Upstash**.

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
