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

Se resuelve con una escritura atómica: `SET clave valor NX PX 60000`. Quien recibe `OK`
es el primero y guarda; quien recibe `nil` hace `GET` y pregunta.
**Pendiente**, se implementa en la Fase 3.

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

| # | Dónde | Problema | Estado |
|---|---|---|---|
| C1 | DTOs | `@IsEnum(['amarilla','roja'])` es incorrecto: `IsEnum` espera un objeto enum, no un array. Debe ser `@IsIn` o un enum propio. | Fase 4 |
| C2 | DTOs | `DeshacerEventoDto.comoAdmin` y `CambiarRolDto.ejecutadoPor` son datos de **autorización** viajando en el DTO: si los aporta el cliente, se pueden falsificar. Deben derivarse del contexto. | Fase 2-3 |
| C3 | Arquitectura §2.2 | `resolver-equipo.interceptor.ts` no puede "cortar el flujo y devolver botones" sin lanzar una excepción. Pasa a ser un **paso de flujo reutilizable**. | Fase 2 |
| C4 | Esquema | Sin tabla de tiempos, el minuto se calculaba con la duración *configurada*: un primer tiempo con adición desfasaba todo el segundo. Además Redis era el único lugar donde vivía el estado del partido, contra lo que dice el propio RNF. Se agregó `partido_tiempos`. | **Resuelto** |
| C5 | Esquema / DTOs | `FinalizarPartidoDto` pide un marcador confirmado y el flujo §6 permite corregirlo, pero no había columnas donde guardarlo. Se agregaron `marcador_*_confirmado`. | **Resuelto** |
| C6 | Arquitectura | `POST /webhook/telegram` quedaba expuesto a internet sin autenticación: cualquiera podía inyectar updates falsos. Se valida el header `X-Telegram-Bot-Api-Secret-Token`. | Fase 1 (`TELEGRAM_WEBHOOK_SECRET` ya es obligatoria) |
| C7 | Requerimientos vs. flujo | Requerimientos dice "español (Colombia)" pero todo el copy del flujo está en voseo rioplatense ("decime", "sos", "querés", "pegá"). **Decidido**: español de Colombia con "tú". | Se aplica al reescribir el flujo |
| C8 | Flujo §2-3 | `/equipo nuevo` y `/partido nuevo` no son comandos válidos para el menú de BotFather (no admite espacios): funcionan como texto pero sin autocompletado. Pasan a `/nuevoequipo` y `/nuevopartido`. | Fase 2-3 |
| C9 | Esquema | Faltaban `check (marcador >= 0)`, unicidad de dorsal por equipo y validación de que un evento tenga jugador cuando corresponde. | **Resuelto** |
| C10 | Esquema | RLS desactivado deja las tablas expuestas si se filtra la anon key de Supabase. Se activa RLS sin policies (deny-all para todos menos el backend). Deliberadamente **sin** `FORCE`, que dejaría sin acceso al propio backend. | **Resuelto** |
| C11 | Arquitectura §1 | Faltaban del árbol los `*.module.ts`, la validación de entorno, el healthcheck que Railway/Render requieren, las migraciones y los tests. | **Resuelto** |

### Corrección extra encontrada al implementar el trigger

El trigger `actualizar_marcador_partido()` original solo contemplaba la transición
`eliminado_en: null → not null` (deshacer). No manejaba la inversa, así que **restaurar**
un evento deshecho dejaba el marcador descuadrado para siempre. La versión nueva cubre
las dos direcciones. Verificado: gol → autogol → deshacer → rehacer devuelve el marcador
correcto en los cuatro pasos.

---

## Mejoras de producto propuestas

| # | Propuesta | Estado |
|---|---|---|
| M1 | RF-3.5 compara solo `tipo + equipo_origen`. Si Jacob marca y Andrés marca 40s después, el bot pregunta sin motivo. **Decidido**: si ambos eventos tienen jugador identificado y son distintos, se guarda sin preguntar. | Fase 3 |
| M2 | Los códigos de invitación eran de un solo uso, pero el caso real es mandar el link al grupo de papás. Se agregó `usos_maximos` + tabla de canjes. | **Resuelto** en el esquema |
| M3 | Si Redis se caía, el bot moría. Ahora arranca igual y degrada a Postgres. | **Resuelto y verificado**: sin Redis, `/health` responde `degradado` y el proceso sigue vivo. |
| M4 | "MVP del partido" no tenía regla definida. **Decidido**: sistema de puntos por evento (ver abajo). | Fase 4 |
| M5 | El deep link `t.me/YakoBot?start=inv_x7f2a` se menciona en el flujo pero el manejo de `/start <payload>` no está especificado. | Fase 2 |

---

## MVP del partido: cómo se calcula (M4)

Cada evento suma o resta puntos al jugador, y el que más acumula en el partido es el MVP.
Un sistema de puntos, en vez de "el que más goles hizo", reconoce al que asistió tres
veces sin marcar.

| Evento | Puntos |
|---|---:|
| Gol | +3 |
| Asistencia | +2 |
| Tarjeta amarilla | −1 |
| Tarjeta roja | −3 |
| Autogol | −3 |
| Cambio | 0 |

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
