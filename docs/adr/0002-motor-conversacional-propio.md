# ADR-0002 — Motor conversacional propio en vez de Scenes de Telegraf

**Estado:** aceptada · **Fecha:** 2026-09-02

## Contexto

El documento de arquitectura proponía implementar los flujos de varios pasos
(`/start`, `/partido nuevo`, `/plantilla`, la carga de un evento) como Scenes/Wizards
de Telegraf, con el paso actual persistido en Redis.

Las Scenes son una abstracción de Telegraf. WhatsApp no tiene equivalente: migrar
después significa reescribir los seis flujos, que es donde vive la mayor parte de la
lógica de producto.

## Decisión

Telegraf queda reducido a **transporte**: recibir updates y llamar a la Bot API. No se
usan Scenes, ni el middleware de `session()`, ni sus guards sobre pasos de flujo.

Sobre él van tres capas:

1. **`channels/`** — traduce entre el protocolo del canal y un modelo neutral
   (`MensajeEntrante`, `RespuestaBot`, `Boton`).
2. **`conversacion/`** — máquina de estados propia. Un flujo es una lista de pasos; el
   estado vive en Redis con respaldo en Postgres.
3. **Servicios de dominio** — no saben qué es un canal ni un botón.

## Alternativa descartada

Scenes ahora y reescritura después. Se descartó porque el costo de la reescritura crece
con cada flujo agregado, mientras que el costo de esta capa se paga una sola vez y al
principio.

## Consecuencias

- Costo inicial: hay que escribir el motor de flujos en vez de usar el de Telegraf.
- Beneficio inmediato, independiente de WhatsApp: con un `FakeChannelAdapter` que captura
  las `RespuestaBot`, se puede testear una conversación completa sin red ni bot real.
  El criterio de aceptación #3 (dos editores cargando el mismo gol en simultáneo) es
  testeable de forma determinista, cosa que con Scenes es muy difícil.
- Los botones se declaran una vez y cada adaptador decide cómo renderizarlos: Telegram
  usa inline keyboard; WhatsApp usa *reply buttons* hasta 3 y convierte automáticamente
  a *interactive list* cuando hay más. Así el panel en vivo de 8 botones no se degrada
  en Telegram ni queda inutilizable en WhatsApp.
