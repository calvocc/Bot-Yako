# ADR-0004 · La detección de duplicados vive en Postgres, no en Redis

**Estado**: aceptada · Fase 3

## Contexto

RF-3.5 y el criterio de aceptación #3 piden que dos papás cargando el mismo gol desde
tribunas distintas no lo dupliquen. El diseño original leía la ventana de 60 segundos y
después escribía, lo que deja una carrera abierta (hallazgo B3): dos cargas separadas por
menos de un segundo leen la ventana vacía las dos y escriben las dos.

La corrección propuesta era hacer la reserva atómica en Redis, con
`SET clave valor NX PX 60000`.

Al llegar a la implementación, el despliegue real no tiene Redis: `REDIS_URL` no está
configurada y el bot corre degradado a propósito (M3). Además el propio RNF de
disponibilidad dice que **Redis nunca es el único lugar donde vive un dato** — y una
garantía de no duplicar goles es un dato.

## Decisión

La comprobación de duplicados y la inserción del evento ocurren dentro de **una sola
transacción de Postgres**, protegida por `pg_advisory_xact_lock` sobre la clave
`(partido, tipo, equipo)`:

```sql
select pg_advisory_xact_lock(hashtextextended('evento:<partido>:<tipo>:<equipo>', 0));
-- consulta de la ventana de 60s sobre idx_eventos_dedup
-- insert del evento
```

El lock se libera solo al terminar la transacción, así que el segundo reporte no puede
leer la ventana hasta que el primero ya está escrito.

Los locks de tiempo siguen el mismo criterio, con `select ... for update` sobre la fila
del partido: dos personas tocando "Finalizar tiempo" a la vez se serializan, y la segunda
lee el estado ya cambiado y responde "ya lo finalizó Carlos".

Redis queda como lo que dice el RNF: una caché que acelera (sesiones, descarte de
reentregas del webhook), nunca la fuente de una garantía.

## Consecuencias

- El chequeo funciona sin Redis, que es la configuración actual de producción.
- Cuesta una consulta indexada y un lock por evento cargado. Al volumen de un partido
  —decenas de eventos en noventa minutos— es despreciable.
- `hashtextextended` es un hash de 64 bits: dos claves distintas podrían colisionar. El
  peor caso es que dos cargas sin relación se serialicen por un instante; nunca un dato
  incorrecto.
- El orden de locks es consistente y no puede formar un ciclo: quien toma el advisory lock
  después pide la fila del partido (vía el trigger de marcador), y quien toma la fila del
  partido no pide el advisory lock.
- Es verificable de verdad, que es lo que faltaba: el test de concurrencia corre dos
  `registrar()` en paralelo contra Postgres real y falla si se quita el lock.
