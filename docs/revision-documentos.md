# Revisión de los documentos de diseño

Hallazgos sobre `yako-requerimientos.md`, `yako-flujo-conversacion.md`,
`yako-arquitectura-nestjs.md`, `yako-schema.sql` y `yako-dtos.ts`.

Cada punto indica si ya está resuelto en el código y dónde verificarlo.

---

## Bloqueantes — impedían cumplir los criterios de aceptación del propio MVP

### B1 · La identidad estaba atada a Telegram

`usuarios.telegram_id bigint unique` hacía imposible que la misma persona entrara por
WhatsApp. Se extrajo `identidades_usuario (canal, canal_user_id, chat_id)`.
Ver [ADR-0001](adr/0001-identidad-multicanal.md) · **Resuelto** en `src/db/schema/identidad.ts`.

### B2 · Scenes de Telegraf como motor de flujo

Encerraba los seis flujos de varios pasos dentro de una abstracción propia de Telegram.
Ver [ADR-0002](adr/0002-motor-conversacional-propio.md) · **Resuelto por diseño**, se
implementa en la Fase 1.

### B3 · La detección de duplicados tenía una condición de carrera

RF-3.5 y el criterio de aceptación #3 dependen de detectar que dos editores cargaron el
mismo gol. Con el patrón `GET` y después `SET` sobre `partido:{id}:evento_reciente:*`,
dos cargas separadas por menos de un segundo leen la clave vacía **las dos** y escriben
**las dos**: el duplicado pasa igual.

La escritura tiene que ser atómica. El diseño proponía hacerlo en Redis con
`SET clave valor NX PX 60000`, pero **se resolvió en Postgres**: un
`pg_advisory_xact_lock` sobre `(partido, tipo, equipo)` tomado dentro de la misma
transacción que la inserción, con la consulta de la ventana de 60 segundos ahí adentro.
El lock se suelta al terminar la transacción, así que el segundo reporte no puede leer la
ventana hasta que el primero ya está escrito.

Se prefirió Postgres porque Redis es opcional en este despliegue —hoy no hay ninguno
configurado— y porque el propio RNF dice que Redis nunca es la única fuente de un dato.
Un lock por clave más una consulta sobre `idx_eventos_dedup` no se nota al volumen de un
partido.

**Resuelto y verificado**: el test `dos cargas simultáneas del mismo gol` corre dos
`registrar()` en paralelo contra Postgres. Con el lock quedan un evento guardado y una
pregunta; quitándolo, se guardan los dos —que es exactamente la carrera descrita acá.

### B4 · El modo post partido no cuadraba el marcador

`CargarResumenPostPartidoDto` recibe marcador (`3-1`) y goleadores (`Jacob 2, Andrés 1`).
Al insertar los goles como eventos, el trigger deja el marcador en `3-0`: **el gol del
rival no tenía dónde registrarse**. Además `eventos.tiempo` y `eventos.minuto_calculado`
eran `NOT NULL` y el modo post partido no captura ni tiempo ni minuto, así que ningún
evento se podía insertar.

Resuelto en el esquema: las dos columnas son nulables, con un check que igual las exige
cuando `origen = 'en_vivo'`. Los goles del rival sin goleador se registran como
`gol / equipo_origen='rival' / jugador_id=null` hasta cuadrar el marcador declarado.
La columna `origen` permite además recargar el resumen de forma idempotente (caso 4c del
flujo, que hoy duplicaría todo lo cargado).
**Resuelto** en `src/db/schema/eventos.ts`.

### B5 · La vista de estadísticas no soportaba temporada

`/stats` y `/tabla` muestran "temporada 2026" y `ConsultarTablaDto` tiene
`temporada?: number`, pero `estadisticas_jugador` agregaba **todo el histórico** sin
join a `partidos.fecha`. Con dos temporadas cargadas, `/stats` daba números incorrectos.

La vista se reescribió con `temporada` derivada del año del partido, y se agregó
`estadisticas_equipo` para `/tabla`.
**Resuelto y verificado**: un jugador con goles en 2025 y 2026 devuelve dos filas
separadas.

---

## Correcciones

| #   | Dónde                    | Problema                                                                                                                                                                                                                                                              | Estado                                                                                   |
| --- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| C1  | DTOs                     | `@IsEnum(['amarilla','roja'])` es incorrecto: `IsEnum` espera un objeto enum, no un array. Debe ser `@IsIn` o un enum propio.                                                                                                                                         | Fase 4                                                                                   |
| C2  | DTOs                     | `DeshacerEventoDto.comoAdmin` y `CambiarRolDto.ejecutadoPor` son datos de **autorización** viajando en el DTO: si los aporta el cliente, se pueden falsificar. Deben derivarse del contexto.                                                                          | **Resuelto**: el rol se lee siempre del servidor, y se revalida justo antes de escribir. |
| C3  | Arquitectura §2.2        | `resolver-equipo.interceptor.ts` no puede "cortar el flujo y devolver botones" sin lanzar una excepción. Pasa a ser un **paso de flujo reutilizable**.                                                                                                                | **Resuelto** (`pasos-comunes/selector-equipo.ts`)                                        |
| C4  | Esquema                  | Sin tabla de tiempos, el minuto se calculaba con la duración _configurada_: un primer tiempo con adición desfasaba todo el segundo. Además Redis era el único lugar donde vivía el estado del partido, contra lo que dice el propio RNF. Se agregó `partido_tiempos`. | **Resuelto**                                                                             |
| C5  | Esquema / DTOs           | `FinalizarPartidoDto` pide un marcador confirmado y el flujo §6 permite corregirlo, pero no había columnas donde guardarlo. Se agregaron `marcador_*_confirmado`.                                                                                                     | **Resuelto**                                                                             |
| C6  | Arquitectura             | `POST /webhook/telegram` quedaba expuesto a internet sin autenticación: cualquiera podía inyectar updates falsos. Se valida el header `X-Telegram-Bot-Api-Secret-Token`.                                                                                              | Fase 1 (`TELEGRAM_WEBHOOK_SECRET` ya es obligatoria)                                     |
| C7  | Requerimientos vs. flujo | Requerimientos dice "español (Colombia)" pero todo el copy del flujo está en voseo rioplatense ("decime", "sos", "querés", "pegá"). **Decidido**: español de Colombia con "tú".                                                                                       | Se aplica al reescribir el flujo                                                         |
| C8  | Flujo §2-3               | `/equipo nuevo` y `/partido nuevo` no son comandos válidos para el menú de BotFather (no admite espacios): funcionan como texto pero sin autocompletado. Pasan a `/nuevoequipo` y `/nuevopartido`.                                                                    | **Resuelto**                                                                             |
| C9  | Esquema                  | Faltaban `check (marcador >= 0)`, unicidad de dorsal por equipo y validación de que un evento tenga jugador cuando corresponde.                                                                                                                                       | **Resuelto**                                                                             |
| C10 | Esquema                  | RLS desactivado deja las tablas expuestas si se filtra la anon key de Supabase. Se activa RLS sin policies (deny-all para todos menos el backend). Deliberadamente **sin** `FORCE`, que dejaría sin acceso al propio backend.                                         | **Resuelto**                                                                             |
| C11 | Arquitectura §1          | Faltaban del árbol los `*.module.ts`, la validación de entorno, el healthcheck que Railway/Render requieren, las migraciones y los tests.                                                                                                                             | **Resuelto**                                                                             |

### Corrección extra encontrada al implementar el trigger

El trigger `actualizar_marcador_partido()` original solo contemplaba la transición
`eliminado_en: null → not null` (deshacer). No manejaba la inversa, así que **restaurar**
un evento deshecho dejaba el marcador descuadrado para siempre. La versión nueva cubre
las dos direcciones. Verificado: gol → autogol → deshacer → rehacer devuelve el marcador
correcto en los cuatro pasos.

---

## Mejoras de producto propuestas

| #   | Propuesta                                                                                                                                                                                                               | Estado                                                                                        |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| M1  | RF-3.5 compara solo `tipo + equipo_origen`. Si Jacob marca y Andrés marca 40s después, el bot pregunta sin motivo. **Decidido**: si ambos eventos tienen jugador identificado y son distintos, se guarda sin preguntar. | **Resuelto**: `puedeSerDuplicado` en `src/eventos/dedup.ts`.                                  |
| M2  | Los códigos de invitación eran de un solo uso, pero el caso real es mandar el link al grupo de papás. Se agregó `usos_maximos` + tabla de canjes.                                                                       | **Resuelto**: `/invitar` ofrece "una persona" o "todo el grupo".                              |
| M3  | Si Redis se caía, el bot moría. Ahora arranca igual y degrada a Postgres.                                                                                                                                               | **Resuelto y verificado**: sin Redis, `/health` responde `degradado` y el proceso sigue vivo. |
| M4  | "MVP del partido" no tenía regla definida. **Decidido**: sistema de puntos por evento (ver abajo).                                                                                                                      | Fase 4                                                                                        |
| M5  | El deep link `t.me/YakoBot?start=inv_x7f2a` se menciona en el flujo pero el manejo de `/start <payload>` no está especificado.                                                                                          | **Resuelto**: `/start inv_XXXXXX` canjea directo.                                             |

---

## MVP del partido: cómo se calcula (M4)

Cada evento suma o resta puntos al jugador, y el que más acumula en el partido es el MVP.
Un sistema de puntos, en vez de "el que más goles hizo", reconoce al que asistió tres
veces sin marcar.

| Evento           | Puntos |
| ---------------- | -----: |
| Gol              |     +3 |
| Asistencia       |     +2 |
| Tarjeta amarilla |     −1 |
| Tarjeta roja     |     −3 |
| Autogol          |     −3 |
| Cambio           |      0 |

Reglas:

- Solo entran jugadores del equipo propio.
- Para ser MVP hay que tener **al menos un evento positivo**: si en un partido solo hubo
  tarjetas, no se elige MVP en vez de premiar al menos amonestado.
- Empate en puntos: gana más goles, después más asistencias, después menor dorsal.
- En modo post partido se calcula igual, con los eventos que se hayan cargado.

La escala vive en un solo lugar del código (`src/eventos/puntaje.ts`) para poder ajustarla
sin tocar la lógica. Si más adelante conviene que cada academia use la suya, pasa a ser
una columna de `academias` sin cambiar nada más.

---

## Decisiones cerradas

- **M1** — jugadores distintos e identificados: no se pregunta.
- **M4** — MVP por sistema de puntos, según la tabla de arriba.
- **C8** — los comandos pasan a `/nuevoequipo` y `/nuevopartido`.

## Agregado durante la implementación

- **`/cancelar`** — no estaba en el diseño original, pero con flujos de varios pasos hace
  falta una salida: sin él, un usuario que se arrepiente a mitad del alta de la plantilla
  queda atrapado hasta que vence la sesión. Además, cualquier comando interrumpe el flujo
  en curso por el mismo motivo.

- **Bitácora del partido** — cada evento deja además su propia línea en el chat
  (`⚽ Gol de Jacob #10, min 23 — 1-0`), aparte de actualizar el panel. El panel se edita
  en el sitio, así que sin esto el chat no guardaría rastro de lo que pasó y no habría
  nada que reenviar al grupo de papás hasta el final del partido.

- **Alta de jugador en la cancha** — al elegir "Otro jugador" se puede escribir un nombre
  que no está en la plantilla, y queda dado de alta. Aparece un chico que nadie cargó y el
  gol no puede esperar a que alguien edite la plantilla. Si el nombre ya existe —aunque
  esté dado de baja— se reutiliza en vez de duplicarlo.

- **Cargar sin reloj** — con todos los tiempos del formato ya jugados, o en un partido
  reabierto, no hay tiempo en curso pero se sigue pudiendo cargar: el evento va al último
  tiempo con el minuto final acumulado. Sin esto, reabrir un partido no serviría de nada,
  porque no se le podría agregar lo que faltaba.

- **`eventos.jugador_id` en cascada** — la referencia no tenía regla de borrado, así que
  eliminar una academia entera fallaba o no según el orden en que Postgres resolviera las
  cascadas de equipos y partidos. `set null` no servía: dejaría una tarjeta sin jugador,
  que el check de `eventos` rechaza. Migración `0004`.

- **`mensajeOrigenId` solo en los botones** — el mapper de Telegram se lo ponía también a
  los mensajes escritos, con el id del propio mensaje del usuario. El panel del partido lo
  usa para editarse en el sitio, así que al escribir intentaba editar el mensaje del
  usuario —Telegram lo rechaza— y publicaba un panel duplicado. El campo significa "el
  mensaje que traía el botón", y un texto no viene de ninguno.
