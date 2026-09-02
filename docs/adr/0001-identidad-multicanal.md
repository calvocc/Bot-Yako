# ADR-0001 — La identidad de usuario no depende del canal

**Estado:** aceptada · **Fecha:** 2026-09-02

## Contexto

El esquema original identificaba al usuario con `usuarios.telegram_id bigint unique`.
El producto arranca en Telegram, pero se pidió explícitamente dejar abierto WhatsApp.

Con la identidad atada a Telegram, sumar WhatsApp obliga a migrar la tabla de usuarios
cuando ya hay datos reales de una academia en producción: el momento más caro para
hacerlo.

## Decisión

`usuarios` no guarda ningún identificador de canal. Las credenciales de canal viven en
`identidades_usuario`, con clave primaria `(canal, canal_user_id)`:

| Columna | Telegram | WhatsApp |
|---|---|---|
| `canal` | `telegram` | `whatsapp` |
| `canal_user_id` | user id como texto | número en E.164 |
| `chat_id` | chat id | número destino |

Una misma fila de `usuarios` puede tener N identidades. Un papá que hoy usa Telegram y
mañana escribe por WhatsApp queda vinculado a la misma cuenta, con sus mismos equipos y
roles, sin tocar el esquema.

`canal_user_id` es `text`, no `bigint`: los ids de Telegram entran en `bigint` pero un
número de teléfono no, y `text` sirve a los dos sin conversión.

## Consecuencias

- Resolver un usuario cuesta un join más. Irrelevante: es una lectura por mensaje,
  indexada por clave primaria.
- El estado conversacional se indexa por `(canal, canalUserId)`, no por `telegram_id`.
- Sumar un tercer canal (SMS, web) no requiere cambios de esquema.
