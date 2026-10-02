# Despliegue

Yako corre como un servicio Node en **Dokploy**, con Postgres en **Supabase** y sin Redis.

| Recurso       | Dónde                                                                   |
| ------------- | ----------------------------------------------------------------------- |
| Servicio      | Dokploy (`dokploy.togoapp.co`) · aplicación `yako-bot`                  |
| URL pública   | `https://yako-bot-f1c8ea-204-168-171-148.sslip.io`                      |
| Base de datos | Supabase · proyecto `yako` (`hooyfaxknoetfmweazmy`, región `us-east-1`) |
| Redis         | Sin configurar — el bot funciona sin él (`redis: "no_configurado"`)     |

```
Telegram ──webhook──▶ Dokploy (app yako-bot) ──▶ Supabase (Postgres)
```

Dokploy sigue la rama `main` del repo (`customGitBranch: main`, `autoDeploy` ante
`push`): cada merge dispara un despliegue solo, que construye la imagen con el
`Dockerfile` y la levanta.

## Releases

1. Mergear a `main` (el despliegue es automático).
2. Crear el tag anotado y la GitHub Release: `git tag -a vX.Y.Z && git push origin vX.Y.Z`
   y `gh release create vX.Y.Z`.
3. `/health` reporta la versión de `package.json` (o `APP_VERSION` si está definida),
   así que el bump de versión va en el mismo cambio: tag y `package.json` no pueden
   divergir sin que `/health` mienta.

---

## Variables de entorno

| Variable                  | Obligatoria | De dónde sale                                                                             |
| ------------------------- | :---------: | ----------------------------------------------------------------------------------------- |
| `NODE_ENV`                |      —      | `production`                                                                              |
| `PORT`                    |      —      | El contenedor escucha 3000; Dokploy publica el dominio hacia ese puerto                   |
| `APP_VERSION`             |      —      | Opcional: si se define, `/health` la reporta en vez de la de `package.json`               |
| `DATABASE_URL`            |     ✅      | Supabase → Settings → Database → Connection string → **Transaction pooler** (puerto 6543) |
| `DATABASE_MIGRATION_URL`  |     ✅      | La misma pantalla → **Direct connection** (puerto 5432)                                   |
| `TELEGRAM_BOT_TOKEN`      |     ✅      | BotFather                                                                                 |
| `TELEGRAM_WEBHOOK_SECRET` |     ✅      | Cadena aleatoria: `openssl rand -hex 32`                                                  |
| `TELEGRAM_WEBHOOK_URL`    |      —      | El dominio público de Dokploy                                                             |
| `REDIS_URL`               |      —      | Upstash → la URL `rediss://…`                                                             |

Las cuatro obligatorias se validan al arrancar: si falta alguna, el proceso no levanta y el log dice
cuál. Es deliberado — es preferible un despliegue que falla claro a un bot a medio configurar
respondiéndole mal a la gente en mitad de un partido.

### Por qué dos URLs, y por qué las dos van por el pooler

La aplicación usa el **pooler en modo transaction** (puerto 6543), que aguanta muchas conexiones
cortas pero no soporta prepared statements — por eso el cliente va con `prepare: false`. Las
**migraciones** usan el **pooler en modo session** (puerto 5432), que sí mantiene una sesión larga
para ejecutar DDL.

> **No uses la conexión directa (`db.<ref>.supabase.co`).** En el plan gratuito de Supabase ese host
> resuelve **solo a IPv6**, y desde Dokploy no es alcanzable: el despliegue se queda ~40 segundos
> intentando conectar y falla por timeout. El pooler sí tiene IPv4.
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
configurado que deja de responder. No haberlo configurado es una decisión, no una avería — y marcarla
como tal convertía el estado normal del servicio en una alarma permanente.

---

## Estado

El servicio está **desplegado y funcionando**. El arranque deja esta traza:

```
Aplicando migraciones... → Migraciones aplicadas.
Mapped {/health, GET} · Mapped {/webhook/telegram, POST}
Webhook registrado en https://yako-bot-f1c8ea-204-168-171-148.sslip.io
Yako escuchando en el puerto 3000
```

### Pendientes

1. **Rotar las credenciales.** El token del bot y la contraseña de la base se compartieron por chat
   durante la puesta en marcha, así que hay que darlos por comprometidos: `/revoke` en BotFather y
   _Reset database password_ en Supabase. Después se actualizan en Dokploy → Applications →
   `yako-bot` → Environment.
2. **Redis** (opcional, y hoy no aporta gran cosa). Ahorra una consulta a Postgres por
   toque de botón, de las ~25-30 que hace cargar un gol; el peso real está en la latencia de región,
   no en la caché. Revisarlo si algún día hace falta pub/sub para sincronizar paneles, rate limiting,
   o si crece la carga.
3. **Rama por defecto en GitHub.** Ya es `main`. Todavía se puede borrar
   `claude/football-stats-bot-i95v3b`, cuyos commits ya viven en las ramas de fase.

---

## Puesta en marcha

### 1. Supabase

Proyecto creado y migraciones aplicadas. Para obtener las cadenas de conexión:
**Settings → Database → Connection string**, y copiar las dos variantes de la tabla de arriba.

Al copiarlas hay que reemplazar `[YOUR-PASSWORD]` por la contraseña de la base de datos.

### 2. Upstash (Redis)

1. Crear cuenta en [upstash.com](https://upstash.com) y una base **Redis** nueva.
2. Región `us-east-1`, para que quede cerca de Dokploy y Supabase.
3. Copiar la URL que empieza con `rediss://` (con doble `s`: es la que usa TLS).

El plan gratuito da 256 MB y 500.000 comandos al mes. Yako consume muy poco: solo trabaja durante los
partidos, y son unos pocos comandos por evento.

### 3. Dokploy

La aplicación `yako-bot` ya está creada y conectada al repositorio (rama `main`, despliegue
automático ante `push`). Los secretos viven en **Applications → `yako-bot` → Environment**;
al guardarlos, Dokploy redespliega solo.

### 4. Webhook de Telegram

No hay que hacer nada a mano: al arrancar, el bot registra el webhook contra
`TELEGRAM_WEBHOOK_URL` pasando el `TELEGRAM_WEBHOOK_SECRET`. En el log aparece
`Webhook registrado en …`.

Para comprobarlo desde fuera:

```bash
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```

Debe mostrar la URL pública y `pending_update_count` en 0, sin `last_error_message`.

---

## Comprobar que quedó bien

```bash
curl https://yako-bot-f1c8ea-204-168-171-148.sslip.io/health
```

- `{"estado":"ok", "redis":"no_configurado"}` — lo normal hoy: no hay Redis y no hace falta.
- `{"estado":"ok", "redis":"ok"}` — hay Redis y responde.
- `{"estado":"degradado", "redis":"caido"}` — hay `REDIS_URL` pero no responde. El bot funciona
  contra Postgres; conviene revisarlo, pero no es una caída.
- `{"postgres":"caido"}` — esto sí es grave: revisar `DATABASE_URL`.

Y la prueba de verdad: escribirle `/ayuda` al bot en Telegram.

---

## Migraciones

Corren **al arrancar** cada despliegue, con el `CMD` del `Dockerfile`
(`pnpm db:migrate && node dist/main`). Si una migración falla, el contenedor no levanta y la
versión anterior sigue sirviendo.

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
  BotFather. Invalida el viejo en el acto y entrega uno nuevo, que se actualiza en Dokploy →
  Applications → `yako-bot` → Environment.
- **RLS activo en todas las tablas**, sin policies: el backend accede como dueño de las tablas, y
  cualquier otra credencial que se filtre no lee nada.
