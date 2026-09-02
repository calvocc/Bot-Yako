# Yako — Documento de requerimientos del proyecto

**Versión:** 1.1
**Tipo de producto:** Bot de mensajería para registro y consulta de estadísticas de fútbol infantil/juvenil, con arquitectura preparada para evolucionar a SaaS multi-academia. Arranca en Telegram; WhatsApp es un canal adicional previsto desde el diseño.
**Documentos complementarios:**
- `yako-flujo-conversacion.md` — los mensajes exactos del bot, mensaje por mensaje.
- `yako-arquitectura.md` — cómo se organiza el backend.
- `revision-documentos.md` — qué se corrigió de la versión 1.0 y por qué.

Este documento define **qué** hay que construir; los otros, **cómo**.

---

## 1. Resumen ejecutivo

Yako es un bot de mensajería que permite a padres, técnicos y administradores de una academia de fútbol infantil registrar en vivo (o después) los eventos de cada partido — goles, asistencias, tarjetas, cambios — y consultar estadísticas acumuladas por jugador y por equipo, sin necesidad de una app aparte.

El sistema se diseña desde el inicio como **multi-tenant**: una academia puede tener varios equipos/categorías, y un mismo usuario, jugador o técnico puede pertenecer a más de un equipo. Esto es intencional: el MVP resuelve el caso de una sola academia, pero la arquitectura no debe requerir reescritura para ofrecerse como SaaS a otras academias más adelante.

Por el mismo motivo se diseña **multicanal**: el MVP opera solo en Telegram, pero ni la identidad del usuario ni los flujos de conversación pueden depender de Telegram. Sumar WhatsApp debe ser escribir un adaptador, no migrar datos ni reescribir flujos.

---

## 2. Objetivo del MVP

Permitir que **cualquier padre o técnico autorizado** de un equipo registre los eventos de un partido desde Telegram — en vivo o después de jugado —, con protección automática contra registros duplicados cuando varias personas cargan al mismo tiempo, y que **cualquier persona del grupo** (sin permisos especiales) pueda consultar estadísticas de jugadores y del equipo en cualquier momento.

---

## 3. Alcance

### 3.1 Incluido en el MVP
- Onboarding de una academia con uno o más equipos.
- Gestión de plantilla (jugadores) por equipo.
- Sistema de invitación por código/link con rol asignado.
- Creación de partidos con formato configurable (cantidad de tiempos y minutos por tiempo).
- Carga de eventos en dos modalidades: en vivo (con cronómetro automático por tiempos) y post partido (resumen reducido).
- Detección automática de posibles duplicados durante la carga en vivo.
- Cierre de partido con generación de resumen compartible.
- Consultas de estadísticas por jugador y por equipo.
- Roles y permisos: Admin, Editor, Viewer.
- Soporte para que un usuario, jugador o técnico pertenezca a más de un equipo.
- Capa de canal que aísla el protocolo de mensajería del resto del sistema (Telegram activo; WhatsApp preparado).

### 3.2 Fuera de alcance del MVP (fases futuras)
- Panel web / dashboard fuera de Telegram.
- Cobros y planes pagos (Stripe u otro proveedor).
- Onboarding self-service para academias externas (multi-tenant comercial).
- Exportación a PDF/Excel de estadísticas de temporada.
- Estadísticas avanzadas (mapas de calor, posesión, etc. — no aplican a fútbol infantil de todos modos).
- Notificaciones automáticas fuera del flujo de comandos (recordatorios, etc.).
- Idiomas distintos al español.
- WhatsApp **operativo** (el canal queda preparado en la arquitectura, pero su implementación es fase posterior).

---

## 4. Glosario

| Término | Definición |
|---|---|
| Academia | Organización dueña de uno o más equipos. Es el tenant del sistema. |
| Equipo | Categoría dentro de una academia (ej. Sub-11 2027). Tiene su propia plantilla, partidos y formato de tiempos. |
| Tiempo | Cada período en que se divide un partido (1er tiempo, 2do tiempo, etc.). La cantidad y duración varían según la categoría. |
| Evento | Un hecho registrado durante un partido: gol, asistencia, tarjeta, cambio. |
| Modo de carga | En vivo o post partido — define qué tan detallada es la captura de eventos de un partido. |
| Editor | Rol con permiso para crear partidos y cargar eventos. |
| Viewer | Rol de solo consulta. |
| Admin | Rol con control total de la academia/equipo (jugadores, invitaciones, permisos, reapertura de partidos). |

---

## 5. Actores y roles

| Rol | Puede | No puede |
|---|---|---|
| **Admin** | Todo lo de Editor, más: crear equipos, invitar usuarios, cambiar roles, reabrir partidos cerrados, deshacer eventos de cualquier usuario | — |
| **Editor** | Crear partidos, cargar eventos (en vivo o post partido), deshacer sus propios eventos, todo lo de Viewer | Invitar usuarios, cambiar roles, reabrir partidos, editar plantilla (salvo que además sea Admin) |
| **Viewer** | Consultar estadísticas, tabla de posiciones del equipo, lista de partidos | Cargar eventos, crear partidos, editar plantilla |

Un mismo usuario puede tener **roles distintos en equipos distintos** (ej. Editor en el equipo de su hijo, Viewer en otro que sigue de casualidad).

---

## 6. Modelo de datos (entidades principales)

| Entidad | Campos clave | Notas |
|---|---|---|
| **Academia** | id, nombre, fecha_creacion | Tenant raíz. En el futuro: plan, límites de uso. |
| **Equipo** | id, academia_id, nombre, cantidad_tiempos_default, minutos_por_tiempo_default | Formato de partido por defecto, editable por partido. |
| **Usuario** | id, nombre | Cuenta de una persona. No guarda ningún identificador de canal. |
| **IdentidadUsuario** | usuario_id, canal, canal_user_id, chat_id | Cómo se identifica ese usuario en cada canal. Un usuario puede tener varias (Telegram y WhatsApp) y ser la misma cuenta. |
| **UsuarioEquipo** | usuario_id, equipo_id, rol | Relación muchos-a-muchos con el rol específico por equipo. |
| **Jugador** | id, equipo_id, nombre, dorsal, persona_id (opcional) | `persona_id` permite enlazar al mismo jugador si juega en más de un equipo. |
| **Invitacion** | id, equipo_id, codigo, rol, expira_en, usos_maximos | Códigos de invitación con rol, expiración y cantidad de usos. Multiuso porque el caso real es compartir el link en el grupo de papás. |
| **InvitacionCanje** | invitacion_id, usuario_id, canjeado_en | Quién usó cada invitación. |
| **Partido** | id, equipo_id, rival, fecha, competencia, cantidad_tiempos, minutos_por_tiempo, modo_carga, estado, tiempo_actual, tiempo_estado, tiempo_iniciado_en, iniciado_por, marcador_*_confirmado | `modo_carga`: null/en_vivo/post_partido. `estado`: pendiente/en_progreso/cerrado. El marcador confirmado es el que declara quien cierra el partido, y puede diferir del derivado de los eventos. |
| **PartidoTiempo** | partido_id, numero, iniciado_en, finalizado_en | Duración **real** de cada tiempo. Sin esto, un tiempo con adición desfasa el minuto de todos los siguientes. |
| **Evento** | id, partido_id, tipo, equipo_origen, jugador_id (opcional), minuto_calculado, tiempo, origen, reportado_por, creado_en | `tipo`: gol/asistencia/tarjeta_amarilla/tarjeta_roja/cambio/autogol. El minuto se calcula, no se ingresa. `tiempo` y `minuto_calculado` son nulos cuando `origen = post_partido`, que no captura ninguno de los dos. |

**Reglas derivadas importantes:**
- El minuto de un evento en vivo se calcula como: duración **real** de los tiempos anteriores ya completados (según `PartidoTiempo`, no según el formato configurado) + minutos transcurridos desde `tiempo_iniciado_en`.
- La detección de duplicados compara eventos del mismo `tipo` + `equipo_origen` dentro de una ventana de 60 segundos de diferencia en `creado_en` (configurable por tipo de evento a futuro). Si ambos eventos tienen jugadores identificados y distintos, no se considera duplicado.
- Un partido no puede recibir eventos si `estado = cerrado`, salvo que un Admin lo reabra.

---

## 7. Requerimientos funcionales

### RF-1 · Onboarding y gestión de organización
- RF-1.1 El sistema debe permitir crear una academia nueva, asignando automáticamente rol de Admin a quien la crea.
- RF-1.2 El sistema debe permitir crear uno o más equipos dentro de una academia, cada uno con su propio formato de tiempos por defecto.
- RF-1.3 El sistema debe permitir cargar la plantilla de jugadores de un equipo (nombre + dorsal como mínimo).
- RF-1.4 El sistema debe permitir generar códigos de invitación por equipo con un rol asignado (Viewer o Editor) y fecha de expiración.
- RF-1.5 El sistema debe permitir a un usuario unirse a un equipo adicional ingresando un código de invitación válido, sin perder su membresía en equipos anteriores.
- RF-1.6 El sistema debe permitir a un Admin cambiar el rol de un usuario dentro de un equipo.

### RF-2 · Gestión de partidos
- RF-2.1 El sistema debe permitir crear un partido indicando rival, fecha y competencia.
- RF-2.2 El sistema debe permitir definir o heredar el formato del partido (cantidad de tiempos y minutos por tiempo) al crearlo.
- RF-2.3 El sistema debe listar los partidos de un equipo junto con su estado (pendiente, en vivo, cerrado).

### RF-3 · Carga de eventos en vivo
- RF-3.1 El sistema debe permitir iniciar la carga en vivo de un partido, lo cual arranca el Tiempo 1 automáticamente.
- RF-3.2 Si un partido ya está en modo en vivo, cualquier otro usuario autorizado que intente cargar eventos debe entrar directo al panel de carga, sin repetir la pregunta de modo.
- RF-3.3 El sistema debe calcular el minuto de cada evento automáticamente, sin solicitarlo al usuario.
- RF-3.4 El sistema debe permitir registrar goles, asistencias, tarjetas amarillas/rojas, cambios y autogoles, indicando equipo y jugador cuando aplique.
- RF-3.5 Antes de guardar un evento, el sistema debe verificar si existe un evento del mismo tipo y equipo registrado en los últimos 60 segundos. Si no existe, se guarda automáticamente. Si existe, debe solicitar confirmación explícita mostrando el evento previo (quién lo cargó y hace cuánto). La verificación debe ser **atómica**: dos cargas simultáneas no pueden pasar ambas el chequeo.
- RF-3.5b Si el evento previo y el nuevo tienen jugadores identificados y distintos, no se considera duplicado y se guarda sin preguntar.
- RF-3.6 El sistema debe permitir finalizar el tiempo actual de forma independiente a finalizar el partido, solicitando confirmación.
- RF-3.7 Al finalizar un tiempo que no es el último del formato configurado, el sistema debe ofrecer iniciar el siguiente tiempo.
- RF-3.8 Si se intenta cargar un evento mientras el tiempo actual está finalizado y el siguiente no se inició explícitamente, el sistema debe iniciar el siguiente tiempo automáticamente antes de registrar el evento.
- RF-3.9 Al finalizar el último tiempo del formato configurado, el sistema debe invitar a cerrar el partido en lugar de ofrecer un tiempo adicional.
- RF-3.10 El sistema debe permitir deshacer el último evento cargado por el propio usuario. Los Admin deben poder deshacer eventos de cualquier usuario.

### RF-4 · Carga post partido
- RF-4.1 El sistema debe ofrecer un flujo reducido para partidos ya finalizados: marcador final, goleadores (sin minuto) y tarjetas (sin minuto).
- RF-4.2 Si un partido ya tiene datos cargados en modo post partido (parcial o completo), el sistema debe mostrar el resumen actual antes de permitir agregar o corregir información.

### RF-5 · Cierre de partido y resumen
- RF-5.1 El sistema debe permitir finalizar un partido, solicitando confirmación del marcador final.
- RF-5.2 Al finalizar, el sistema debe generar automáticamente un resumen del partido (marcador, goleadores con minuto, tarjetas, jugador destacado) listo para compartir.
- RF-5.3 Un partido finalizado no debe aceptar más eventos salvo reapertura explícita por un Admin.

### RF-6 · Consultas y estadísticas
- RF-6.1 El sistema debe permitir consultar estadísticas acumuladas de un jugador (partidos jugados, goles, asistencias, tarjetas).
- RF-6.2 El sistema debe permitir consultar un resumen del equipo en la temporada (partidos jugados, resultados, goles a favor, goleador).
- RF-6.3 Estas consultas deben estar disponibles para cualquier rol, incluyendo Viewer.

### RF-7 · Multi-equipo y multicanal
- RF-7.1 El sistema debe permitir que un mismo usuario pertenezca a más de un equipo, con un rol independiente en cada uno.
- RF-7.2 Cualquier comando cuyo alcance dependa del equipo (crear partido, cargar eventos, consultar estadísticas, ver plantilla) debe resolver automáticamente el equipo si el usuario pertenece a uno solo, y debe preguntar cuál si pertenece a varios.
- RF-7.3 Un jugador debe poder estar vinculado a más de un equipo dentro de la misma academia.
- RF-7.4 La identidad de un usuario no debe depender del canal de mensajería: la misma cuenta debe poder tener una identidad de Telegram y una de WhatsApp, conservando sus equipos y roles.
- RF-7.5 La lógica de negocio y los flujos de conversación no deben contener código específico de un canal. Cada canal se implementa como un adaptador que traduce entre su protocolo y un modelo de mensaje/botón común.
- RF-7.6 Un flujo que ofrece más de tres opciones debe seguir siendo usable en canales que limitan la cantidad de botones por mensaje, sin degradar la experiencia en los que no lo hacen.

---

## 8. Requerimientos no funcionales

| Categoría | Requerimiento |
|---|---|
| **Multi-tenancy** | El modelo de datos debe aislar la información por academia desde el día uno, aunque el MVP opere con una sola academia activa. |
| **Concurrencia** | El sistema debe manejar correctamente que varios usuarios carguen eventos al mismo partido de forma simultánea, sin pérdida de datos ni bloqueos. Las acciones de finalización (tiempo/partido) deben usar un lock de corta duración (Redis) para que solo la primera confirmación aplique. El chequeo de duplicados debe ser una operación atómica, no una lectura seguida de una escritura. |
| **Latencia** | Las respuestas del bot a acciones interactivas (botones) deben sentirse instantáneas durante un partido en vivo (objetivo: <2s). |
| **Disponibilidad** | El bot debe operar vía webhook (no polling) para reducir latencia y facilitar escalamiento. Una caída de Redis debe degradar el rendimiento, no interrumpir el servicio: el sistema debe seguir operando contra Postgres. |
| **Integridad de datos** | Toda escritura de eventos debe registrar quién y cuándo la hizo, para permitir auditoría, deshacer y resolución de conflictos. |
| **Seguridad de acceso** | Las acciones de carga y administración deben validar el rol del usuario en el equipo correspondiente antes de ejecutarse, resolviéndolo siempre en el servidor y nunca a partir de datos incluidos en el mensaje. Los códigos de invitación deben expirar. El endpoint de webhook debe autenticar que la petición viene efectivamente de la plataforma de mensajería. |
| **Extensibilidad** | El modelo de datos y la lógica de negocio no deben requerir cambios estructurales para soportar planes pagos, límites por plan, un canal de mensajería adicional, o un panel web en fases futuras. |
| **Idioma** | Todo el copy del bot en español de Colombia, tratando de "tú", sin necesidad de internacionalización en el MVP. |
| **Verificabilidad** | Debe ser posible ejecutar una conversación completa en pruebas automatizadas sin depender de la API de la plataforma de mensajería. |

---

## 9. Stack tecnológico

| Componente | Tecnología | Motivo |
|---|---|---|
| Backend del bot | NestJS (Node.js/TypeScript) | Estructura modular por dominio (partidos, eventos, equipos, auth), fácil de testear y de escalar a un panel web con el mismo backend más adelante |
| Integración con Telegram | Webhook + `telegraf` como transporte | Evita polling, reduce latencia. Telegraf se usa solo para hablar con la Bot API; los flujos de conversación no dependen de él (ver `adr/0002`) |
| Integración con WhatsApp (preparada) | WhatsApp Cloud API | Segundo adaptador de canal. No se implementa en el MVP, pero la arquitectura lo contempla |
| Base de datos | PostgreSQL (Supabase) | Persistencia de todo el modelo de datos de la sección 6; fuente de verdad |
| Acceso a datos | Drizzle ORM sobre `postgres.js` | Esquema TypeScript como fuente de verdad, migraciones versionadas y queries verificadas en compilación (ver `adr/0003`) |
| Caché / velocidad en vivo | Redis | Estado en tiempo real del partido y detección de duplicados sin golpear Postgres en cada evento (ver 9.1) |
| Hosting del bot | Railway o Render | Despliegue simple de un proceso NestJS persistente con webhook |
| Panel web (fase futura) | Next.js en Vercel | Solo cuando se necesite ver histórico fuera del chat |
| Cobros (fase futura) | Stripe | Estándar de mercado para SaaS |

### 9.1 Rol específico de Redis

Redis no reemplaza a Postgres como fuente de verdad — lo acelera en las tres operaciones que ocurren muchas veces por minuto durante un partido en vivo:

| Uso | Clave (patrón) | Contenido | TTL |
|---|---|---|---|
| Estado del tiempo actual | `partido:{id}:estado` | `tiempo_actual`, `tiempo_estado`, `tiempo_iniciado_en`, marcador | Mientras el partido está en vivo (se limpia al cerrar) |
| Detección de duplicados | `partido:{id}:evento_reciente:{tipo}:{equipo}` | último evento de ese tipo/equipo (jugador, quién lo cargó, cuándo). Se escribe con `SET NX PX 60000`, de modo que el chequeo y la reserva sean una sola operación atómica | 60 segundos |
| Bloqueo de finalización | `lock:partido:{id}:finalizar_tiempo` / `lock:partido:{id}:finalizar` | lock simple (`SET NX PX 5000`) | 5 segundos |
| Estado conversacional | `sesion:{canal}:{canal_user_id}` | en qué paso del flujo está un usuario (ej. "esperando confirmación de duplicado") | Duración de la interacción |

El bloqueo de finalización es lo que resuelve de forma limpia el caso borde de dos personas tocando "Finalizar tiempo" o "Finalizar partido" casi al mismo tiempo (sección 10): la primera petición toma el lock, procesa y confirma; la segunda lo encuentra tomado y responde con "ya fue finalizado por Carlos" sin necesidad de una transacción de base de datos más pesada.

Cada escritura relevante en Redis se persiste también en Postgres — Redis nunca es el único lugar donde vive un dato. Concretamente: el estado del partido se reconstruye desde `partidos` + `PartidoTiempo`, el chequeo de duplicados cae al índice `idx_eventos_dedup`, y los locks caen a advisory locks de Postgres. Por eso una caída de Redis degrada el rendimiento pero no interrumpe un partido en curso.

---

## 10. Casos borde a contemplar (ver detalle completo en el documento de flujo)

- Un Viewer intenta cargar eventos → mensaje de permiso denegado.
- Dos personas finalizan el mismo tiempo o el mismo partido casi simultáneamente → solo la primera confirmación aplica.
- Se intenta cargar un evento a un partido con el tiempo finalizado → se inicia el siguiente tiempo automáticamente.
- Un Admin reabre un partido cerrado → conserva todos los eventos previamente cargados.
- Un usuario pertenece a un solo equipo → el sistema nunca le pregunta "¿cuál equipo?".
- Gol en propia meta → opción de autogol en el selector de jugador.

---

## 11. Roadmap sugerido

**Fase 1 — MVP (este documento):** una academia, N equipos, flujo completo en Telegram descrito arriba.

**Fase 2 — WhatsApp:** segundo adaptador de canal sobre WhatsApp Cloud API. No requiere tocar flujos ni modelo de datos.

**Fase 3 — Consolidación:** panel web de solo lectura para ver histórico y temporadas completas; exportación básica a Excel/PDF.

**Fase 4 — SaaS:** onboarding self-service para academias externas, planes con límites (equipos, jugadores, partidos/mes), cobros con Stripe, resúmenes con marca de la academia.

---

## 12. Criterios de aceptación del MVP

El MVP se considera funcional cuando:

1. Un Admin puede crear una academia, un equipo, cargar su plantilla e invitar a otros usuarios con roles distintos.
2. Un Editor puede crear un partido, cargarlo en vivo con cálculo automático de minuto por tiempo, y cerrarlo generando un resumen.
3. Dos Editores cargando al mismo partido en simultáneo no pueden duplicar un mismo evento sin que el sistema lo detecte y pida confirmación.
4. Un Viewer puede consultar estadísticas de jugador y de equipo sin tener permisos de carga.
5. Un usuario que pertenece a dos equipos ve resuelta automáticamente la ambigüedad cuando corresponde, y se le pregunta solo cuando es necesario.
6. La suite de pruebas ejecuta los cinco puntos anteriores como conversaciones completas, sin depender de la API de Telegram.
7. Ningún módulo fuera de la capa de canal importa código específico de Telegram.
