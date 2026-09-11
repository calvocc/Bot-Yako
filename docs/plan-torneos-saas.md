# Torneos cross-club en Bot-Yako: viabilidad + diseño técnico

**Estado:** propuesta guardada para arrancar más adelante — todavía no se construyó
nada de esto. Es la Fase 4+ del roadmap (ver `yako-requerimientos.md`), evaluada en
detalle para no perderla de foco cuando se decida encararla.

## Contexto

El usuario quiere evaluar llevar Bot-Yako "un nivel más arriba": convertirlo en un SaaS
donde clubes/organizaciones puedan **crear torneos, cobrar por su uso, ver estadísticas
básicas del campeonato** (cómo va, tabla de posiciones), y donde **padres y dueños de
equipo vean cómo anda el torneo, su hijo, su equipo, y los goleadores** — replicando lo
que ya hacen apps comerciales de gestión de torneos. La pregunta concreta: ¿es viable
agregar esto al bot, permitiendo crear competencias/torneos con formato y cantidad de
equipos elegibles, agregar equipos, y que padres/dueños vean el progreso?

Durante el scoping con el usuario se definió el alcance más ambicioso a propósito
(no el incremental):

- **Cross-club desde el arranque**: un organizador arma un torneo e invita equipos de
  OTRAS academias, no solo las propias.
- **Fixture automático desde el arranque**: el bot genera el calendario (fechas/cruces)
  según el formato elegido, no solo agrupa partidos cargados a mano.
- **Equipos totalmente externos**: un club que nunca usó el bot debe poder sumarse solo
  para ese torneo.
- **Aprobación obligatoria del organizador**: ningún resultado cuenta para la tabla o
  los goleadores del torneo sin que el organizador (o alguien de su staff) lo apruebe
  a mano — ni siquiera si ambos equipos coinciden — para que padres o clubes no puedan
  inflar sus propias estadísticas sin control.
- **Monetización explícitamente fuera de este plan**: se diseña la funcionalidad; el
  cobro/planes queda para la Fase 4 ya prevista en `docs/yako-requerimientos.md`.

Este documento es el resultado de: explorar a fondo el código y los docs existentes,
un diseño técnico detallado (con dos rondas de ajuste sobre los puntos de arriba), y
mi propia lectura de viabilidad de negocio.

---

## Veredicto de viabilidad

**Técnica: alta.** El código es chico (~18k LOC), modular (NestJS por dominio) y ya
tiene, reusables tal cual, casi todas las piezas que este feature necesita: el motor
de conversación (`src/conversacion/flow-engine.service.ts`) hace barato agregar
comandos/flujos nuevos; el patrón código+canje de `invitaciones.service.ts` resuelve
"invitar a alguien externo" sin inventar nada; la jerarquía de roles (`roles.ts` +
`cumpleRol`) es directamente reusable para un rol nuevo de torneo; el patrón de vistas
SQL de agregación (`drizzle/0011_estadisticas_por_competencia.sql`) es el molde directo
para la tabla de posiciones y goleadores del torneo. Nada del diseño obliga a tocar
`competencias` ni a romper el modelo de partidos existente (ver diseño más abajo) —
es una expansión aditiva, no una reescritura.

**De producto/negocio: medio-alta, con un riesgo real de alcance.** Esto no es "una
función más" — es el único feature del bot con mecánica de red real: hoy el bot es una
herramienta privada por club (el valor de una academia no depende de que otras
academias también lo usen); un torneo cross-club sí depende de eso, y es exactamente
lo que justifica cobrar como SaaS a un organizador (vender acceso a algo que conecta
equipos, no solo licencia de software por club). Es una oportunidad genuina.

El riesgo: el alcance elegido (cross-club + fixture automático + aprobación humana +
equipos externos, todo desde el arranque) es la versión más grande posible de este
feature, construida sin validar todavía con un torneo real si el canal conversacional
(texto + botones, sin panel web) alcanza para que un organizador administre un torneo
completo — algo que hoy el bot nunca hizo (toda su UX fue pensada para "cargar MI
partido", no para "administrar un cruce de 8 equipos ajenos"). Mi recomendación
(sección de fases más abajo) es construir primero un recorte real y chico (liga simple)
y correr un torneo de verdad con él antes de invertir en las fases más grandes
(brackets, grupos), no porque el resto no valga la pena sino porque es la forma más
barata de descubrir si falta un panel web antes de construir dos fases más de bot.

---

## Qué existe hoy (relevante para este diseño)

- **`competencias`** (`src/db/schema/competencias.ts`) es una etiqueta plana por
  academia (`{id, academiaId, nombre}`), sin fixture, formato, equipos inscriptos ni
  estado. La usa `/stats` y `/tabla` para desglosar las stats de un equipo por
  campeonato — pero es "mis stats en este torneo", nunca una tabla de posiciones
  cruzada entre equipos.
- **`partidos`** (`src/db/schema/partidos.ts`): `equipoId` (FK real) + `rival`
  (**texto libre**, sin FK) — hoy no existe ningún vínculo entre "mi equipo" y "el
  equipo rival" como entidades del sistema. `marcadorPropioConfirmado`/
  `marcadorRivalConfirmado` existen, pero son el marcador que confirma **quien cierra
  ESE partido puntual** (una sola fila, una sola academia) — no sirven para reconciliar
  dos versiones de un mismo partido, y no se tocan en este diseño.
- **Multi-tenancy ya usable**: `academias` (1) → `equipos` (N) ya soporta multi-equipo
  por club; `usuarios_equipos` (rol admin/editor/viewer) + `usuarios_jugadores`
  (vínculo padre↔hijo, acceso derivado en runtime) ya resuelven permisos por equipo.
  No hay nada por encima de `academia` (ni "organización paga varias academias" ni
  ninguna capa de billing) — confirmado, cero código de planes/Stripe/facturación
  hoy; `academia` es la futura unidad de facturación prevista en los docs.
- **Onboarding actual** (`onboarding.flujo.ts`): cualquiera crea una academia con un
  nombre (sin verificación) y de ahí un equipo, quedando admin automático
  (`EquiposService.crear` asigna el rol en la misma transacción). Esto **ya resuelve**
  el caso "equipo que nunca usó el bot": no hace falta ningún concepto especial de
  "equipo invitado liviano", alcanza con el onboarding + canjear el código del torneo.
- **Solo Telegram está conectado**; WhatsApp no. Toda interacción es conversacional
  (texto + botones limitados), sin superficie web — relevante para el riesgo de
  producto de arriba.

---

## Diseño técnico

### Modelo de datos

`competencias` **no se toca**. Todo lo cross-club vive en tablas nuevas.

- **`torneos`**: `nombre`, `formato` (`liga` | `eliminacion_directa` | `grupos_eliminacion`),
  `cantidadEquipos`, `idaYVuelta`, `fechaInicio`, `estado`
  (`inscripcion` → `fixture_generado` → `en_curso` → `finalizado`/`cancelado`),
  `academiaOrganizadoraId` (FK `academias`, `RESTRICT` — no cascade, a propósito: borrar
  la academia anfitriona no debe arrastrar en cascada el historial de otras academias),
  `creadoPor`.
- **`torneo_equipos`** (inscripción): `torneoId`, `equipoId`, `estado`
  (`confirmado`/`retirado`/`descalificado`), `grupo` (si aplica), `sembrado`. Único
  `(torneoId, equipoId)`.
- **`torneo_invitaciones` / `..._canjes`**: mismo molde que `invitaciones`/
  `invitaciones_canjes` (código `YAKO-XXXXXX`), pero el canje inscribe un **equipo
  entero** (elegido entre los que administra quien canjea) en vez de vincular un
  usuario a un rol — un caso con postcondición distinta al de `InvitacionesService`,
  por eso es una tabla espejo y no una extensión del servicio existente. El cupo real
  se valida contando `torneo_equipos` confirmados contra `cantidadEquipos` al momento
  del canje (no un contador fijo en la invitación).
  - Un campo `proposito` (`'equipo' | 'staff'`) distingue si el código inscribe un
    equipo o suma a alguien como staff del torneo (ver roles) — mismo mecanismo de
    código+canje para ambos casos, sin una cuarta tabla.
- **`torneo_partidos`** (el cruce compartido — pieza central): `torneoId`, `ronda`,
  `etiquetaRonda`, `grupo`, `equipoLocalId`/`equipoVisitanteId` (nullable: en un
  bracket, rondas futuras no conocen los equipos todavía), `avanzaDesdeLocalId`/
  `avanzaDesdeVisitanteId` (apuntan al cruce anterior cuyo ganador ocupa este slot),
  `avanzaDeGrupoLocal`/`posicionGrupoLocal` (equivalente para "1ro del Grupo A"),
  `fechaProgramada`, `estado` (`pendiente_equipos` → `programado` →
  `listo_para_aprobar`/`en_disputa` → `confirmado`/`walkover`), `golesLocalOficial`/
  `golesVisitanteOficial`, `resolucion`, `aprobadoPor`/`aprobadoEn`. Un CHECK
  garantiza a nivel de base que **nada llega a `confirmado`/`walkover` sin
  `aprobadoPor` no nulo** — ninguna publicación automática es posible, ni por bug.
- **`usuarios_torneos`**: `torneoId`, `usuarioId`, `rol` (`staff`|`organizador`),
  mismo patrón jerárquico que `usuarios_equipos`/`roles.ts`. `'organizador'` sigue
  siendo **100% derivado** (`esAdminDeAcademia(usuarioId, academiaOrganizadoraId)`,
  ya existe) — esta tabla en la práctica solo guarda filas `'staff'`, gente que el
  organizador suma únicamente para aprobar resultados (no puede invitar equipos,
  generar fixture ni cancelar el torneo). Se suma vía el mismo código de invitación
  de arriba (`proposito='staff'`), consistente con cómo se invita a todo lo demás en
  el bot.
- **Cambios en `partidos`** (mínimos, todo nullable): `+torneoPartidoId`
  (FK `torneo_partidos`), `+equipoRivalId` (FK `equipos`, nullable). `rival` (texto)
  **no cambia** — sigue siendo el nombre legible, y ahora además, cuando se conoce,
  se guarda el id real. Índice único parcial `(torneoPartidoId, equipoId)` evita que
  una misma academia duplique su fila para un mismo cruce.

Cada academia participante sigue creando **su propia fila `partidos`** para el cruce,
con el mismo flujo de carga (en vivo/post partido) que ya existe — cero cambio de
comportamiento para "cargar mi partido", solo dos campos nuevos opcionales.

### Fixture automático

- **Liga (v1, Fase A)**: método del círculo clásico para round-robin; sin
  dependencias entre cruces, se generan todos de una con `equipoLocalId`/
  `equipoVisitanteId` ya poblados. Ida y vuelta = repetir invirtiendo local/visitante.
- **Eliminación directa (Fase B)**: tamaño de cuadro = potencia de 2 más cercana;
  byes asignados a los mejores `sembrado` (v1: orden de inscripción); un bye no
  genera fila, el equipo pasa directo al slot de la ronda siguiente. Rondas futuras
  se pre-crean en `pendiente_equipos` con punteros `avanzaDesde*Id`, y se completan
  solas cuando el cruce alimentador llega a `confirmado`.
- **Grupos + eliminación (Fase C)**: mismo generador de liga, una vez por grupo;
  al confirmarse todos los cruces de un grupo se calculan posiciones (Pts→Dif→GF) y
  se resuelven los slots de bracket que dependían de ellas. El esquema de arriba ya
  contempla esto (`avanzaDeGrupo*`) sin necesitar otra migración después.
- **Empates en fase eliminatoria**: v1 no modela penales — exige un resultado
  decisivo manual del organizador o un walkover.

### Reconciliación y aprobación obligatoria

Cuando una academia cierra su partido (flujo actual, sin cambios), un gancho liviano
(nuevo `GanchoCierrePartidoRegistry`, mismo patrón que ya usa el repo para desacoplar
módulos — `TorneosModule` importa `PartidosModule`, nunca al revés) dispara la
reconciliación:

1. Solo un lado cerró → sin cambios (`programado`).
2. Ambos cerraron y **coinciden** → `listo_para_aprobar` (¡no `confirmado`!). Un
   marcador que coincide es más rápido de aprobar, pero **igual necesita un toque
   humano** — este es el punto central del requisito de integridad del usuario.
3. Ambos cerraron y **no coinciden** → `en_disputa`.
4. `/torneoresolver` (rol mínimo `staff`) atiende ambas colas: un tap aprueba lo que
   ya coincide; una disputa se resuelve eligiendo una versión, cargando un valor
   distinto, o declarando walkover — el organizador/staff siempre tiene la última
   palabra, puede pisar lo que cargó cualquiera de los dos equipos.
5. El avance de fixture (completar el siguiente cruce del bracket) se dispara
   **solo** al llegar a `confirmado` — nunca antes.

Las vistas de tabla y goleadores del torneo (`estadisticas_torneo_equipo`,
`estadisticas_jugador_torneo`, mismo molde que `drizzle/0011_estadisticas_por_competencia.sql`)
solo cuentan `torneo_partidos.estado IN ('confirmado','walkover')` — por el CHECK de
arriba, eso implica siempre aprobación humana. No queda ningún camino de
autopublicación, ni para el resultado ni para los goleadores (el join de goleadores
exige explícitamente el `torneo_partido` confirmado, no solo el partido cerrado del
lado de una academia).

### Quién ve qué

Cualquier usuario con acceso viewer+ (incluyendo el acceso derivado de padre/tutor
vía `usuarios_jugadores`, ya existente) a **cualquier** equipo inscripto y confirmado
en un torneo puede ver la tabla, el fixture y los goleadores completos de ese torneo
— cruzando a propósito el aislamiento por academia de hoy, porque esos datos son
públicos entre participantes de un mismo campeonato. Eso no da acceso a nada más del
equipo rival (su plantilla, sus permisos, sus otros partidos) — la única puerta nueva
es esa consulta torneo-scoped.

### Superficie conversacional

Nuevo módulo `TorneosModule` (mismo estilo que `PartidosModule`), comandos nuevos:
`/torneocrear` (wizard: nombre → formato → cantidad de equipos → ida y vuelta → fecha),
`/torneounirse <código>` (canjea, elige cuál de tus equipos inscribe si administrás
más de uno), `/torneo` (hub: tabla / fixture / goleadores / cargar mi partido, y si
sos organizador: invitar / generar fixture / resolver disputas), `/torneoresolver`,
`/torneostaff` (sumar staff). Reusa pasos ya existentes (`pasoSelectorEquipo`,
paginación) y el mecanismo de "saltar a un paso posterior con datos precargados" que
`reabrir.flujo.ts` ya usa hoy para no duplicar el flujo de carga de partido.

**Único cambio en código existente**: `PartidosService.crear()`/`NuevoPartido` ganan
dos campos opcionales (`torneoPartidoId?`, `equipoRivalId?`), igual que
`competenciaId` ya es opcional ahí hoy.

---

## Fases de entrega (dentro del alcance ya decidido)

**Fase A — Liga cross-club de punta a punta.** Todo el schema de una sola vez
(incluidas columnas de bracket/grupos aunque no se usen aún, para no migrar de nuevo
después). Solo formato `liga`. Alta de torneo, invitación y canje de equipos (propios
o completamente nuevos vía onboarding), carga de partidos igual que hoy, gancho de
reconciliación con aprobación obligatoria (`listo_para_aprobar`/`en_disputa`,
`/torneoresolver`), vistas de tabla/goleadores, `/torneo` de lectura con el control de
acceso cross-equipo. Esto solo ya cubre el caso más común (liga local entre academias)
de punta a punta, con integridad de datos garantizada.

**Fase B — Eliminación directa + notificaciones.** Bracket con byes y avance
automático tras aprobación. Recordatorios proactivos (cruce sin cargar, resultado
esperando aprobación hace X días) — sin auto-aprobar nunca, solo avisar.

**Fase C — Grupos + eliminación híbrida, y equipos que abandonan a mitad de torneo**
(walkover automático a los partidos futuros de un equipo retirado; siembra manual).

**Fase D (fuera de este plan) — Monetización.** Nada en este diseño asume gratuidad:
`academiaOrganizadoraId` sigue apuntando a la futura unidad de facturación ya prevista
en el roadmap (`docs/yako-requerimientos.md`, Fase 4); un límite futuro ("torneos
activos por plan") se puede chequear dentro de `TorneosService.crear()` sin rediseño.

**Recomendación mía, no solo de ingeniería**: antes de arrancar la Fase B, correr un
torneo real (chico, 2-4 academias) con lo construido en Fase A. Es la forma más barata
de descubrir si el canal conversacional alcanza para un organizador real, o si hace
falta algo más (aunque sea un resumen semanal en texto plano vía WhatsApp/Telegram)
antes de invertir en brackets y grupos.

---

## Riesgos y mitigaciones

1. **Una academia no carga a tiempo / abandona.** El organizador puede resolver
   igual (una sola versión disponible, o walkover) vía `/torneoresolver` — nunca
   bloquea el resto del fixture.
2. **Dos academias no coinciden nunca.** Queda `en_disputa`, visible como "sin
   confirmar" en la tabla (nunca se finge un resultado) — el organizador resuelve
   unilateralmente, siempre hay salida.
3. **El organizador/staff es ahora el cuello de botella obligatorio de todo el
   torneo** (consecuencia directa de que no hay autopublicación, ni por acuerdo entre
   partes ni por plazo vencido). Mitigación v1, confirmada con el usuario: solo un
   aviso/recordatorio a organizador y staff cuando hay cruces esperando hace X días
   — nunca una transición automática de estado. La tabla debe mostrar de forma
   visible cuántos cruces siguen sin aprobar, para que nadie confunda "sin aprobar"
   con "no hubo partido".
4. **Un solo organizador (admin único de la academia anfitriona) desaparece.**
   Cualquier otro admin de esa misma academia ya cuenta como organizador (rol
   derivado) — alcanza con que la academia tenga más de un admin. No hay respaldo
   fuera de la academia organizadora en v1.
5. **Goleadores incompletos** si una academia carga sin detalle de eventos (modo
   post-partido sin goleadores). Riesgo heredado de hoy, se corrige con un aviso
   explícito en la respuesta, no con un fix de datos.
6. **Concurrencia** (dos cierres casi simultáneos reconciliando el mismo cruce).
   Mitigado con `select ... for update` sobre `torneo_partidos`, mismo patrón que
   `PartidosService.cerrar()` ya usa.
7. **Doble carga por la misma academia.** Bloqueado a nivel de base por el índice
   único parcial `(torneoPartidoId, equipoId)`.
8. **Cero impacto en lo existente.** Todas las columnas nuevas son nullable, todas
   las tablas son nuevas; ningún constraint/default de `partidos` o `competencias`
   cambia — el flujo de carga de partidos propios (sin torneo) queda exactamente
   igual.

---

## Archivos críticos (para cuando se decida construir)

- `src/db/schema/torneos.ts` (nuevo) — `torneos`, `torneo_equipos`,
  `torneo_invitaciones(+canjes)`, `torneo_partidos`, `usuarios_torneos`.
- `src/db/schema/partidos.ts` — agrega `torneoPartidoId`/`equipoRivalId` + índice
  único parcial.
- `src/db/schema/enums.ts` — enums nuevos (`formato_torneo`, `estado_torneo`,
  `estado_torneo_partido`, `resolucion_torneo_partido`, `rol_torneo`).
- `src/partidos/partidos.service.ts` — único cambio en código existente (dos campos
  opcionales).
- `src/eventos/cargar.flujo.ts` — punto de enganche del gancho de cierre.
- `drizzle/0011_estadisticas_por_competencia.sql` — patrón de referencia directo
  para las vistas nuevas de tabla/goleadores.
- `src/identidad/membresias.service.ts` y `src/identidad/roles.ts` —
  `esAdminDeAcademia`/`rolEn`/`cumpleRol`, base del rol de organizador/staff, sin
  cambios.
- `src/invitaciones/invitaciones.service.ts` — patrón de código+canje a espejar en
  el servicio nuevo de invitaciones de torneo.
- `src/partidos.module.ts` — plantilla de wiring para `src/torneos.module.ts`.
- Nuevo bajo `src/torneos/`: `torneos.service.ts`, `fixture-liga.ts`,
  `fixture-eliminacion.ts`, `torneo-invitaciones.service.ts`,
  `torneo-reconciliacion.service.ts`, `torneo-consulta.service.ts`,
  `torneo-crear.flujo.ts`, `torneo-unirse.flujo.ts`, `torneo.flujo.ts`,
  `torneo-cargar.flujo.ts`, `torneo-resolver.flujo.ts`, `torneos.handler.ts`.

---

## Cómo validar esto

**Antes de escribir código:** validar con un organizador real (el propio usuario u
otro club) si el flujo puramente conversacional alcanza para administrar un torneo
— es un riesgo de producto, no de código, y no se resuelve escribiendo más diseño.

**Al construir la Fase A:**
- Unit tests para `fixture-liga.ts` (round-robin con N par/impar, con y sin ida y
  vuelta) — mismo patrón que specs puras ya existentes en el repo (`fechas.spec.ts`,
  `minuto.spec.ts`).
- Unit tests para `torneo-reconciliacion.service.ts`: un solo lado cerrado, ambos
  coinciden (→ `listo_para_aprobar`, nunca `confirmado` sin toque humano), ambos no
  coinciden (→ `en_disputa`), concurrencia de dos cierres simultáneos.
- Un e2e conversacional (siguiendo el patrón de `test/carga-conversacion.e2e-spec.ts`)
  que arme un torneo de 4 equipos de 2 academias distintas (una de ellas creada desde
  cero vía onboarding), canjee invitaciones, cargue ambos lados de un cruce, y
  verifique que la tabla **no** se actualiza hasta que un staff aprueba.
- Migraciones Drizzle nuevas corriendo limpio, `npx jest`, `tsc --noEmit` y `eslint`
  sin errores — mismo checklist que cualquier cambio en este repo.
- Piloto real: correr un torneo chico de punta a punta antes de decidir invertir en
  la Fase B.
