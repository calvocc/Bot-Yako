# Yako — Arquitectura

Cómo se organiza el backend. Complementa `yako-requerimientos.md` (qué hay que construir)
y `yako-flujo-conversacion.md` (cómo se ve la conversación).

Las decisiones de fondo están razonadas en [`adr/`](adr/).

---

## 1. Las tres capas

El bot arranca en Telegram y debe poder sumar WhatsApp sin reescribir la lógica de
producto. Eso se consigue con una separación estricta en tres capas:

```
Telegram webhook ─┐                            ┌─ TelegramAdapter
                  ├─→ MensajeEntrante ─→ Router ─→ FlowEngine ─→ Servicios de dominio
WhatsApp webhook ─┘                            └─ RespuestaBot ─→ Adaptador del canal
```

1. **`channels/`** — lo único que sabe qué es Telegram o WhatsApp. Traduce el protocolo
   del canal a un modelo neutral y de vuelta.
2. **`conversacion/`** — la máquina de estados de los flujos de varios pasos. Sabe de
   pasos y botones, no de canales.
3. **Servicios de dominio** — partidos, eventos, equipos. No saben que existe un chat.

La regla que mantiene esto honesto: **ningún archivo fuera de `channels/` importa
Telegraf**. Si aparece un `import { Telegraf }` en `partidos/`, la capa se rompió.

### 1.1 El modelo neutral

```ts
type Canal = 'telegram' | 'whatsapp';

type MensajeEntrante = {
  canal: Canal;
  canalUserId: string;      // telegram id como texto | número E.164
  chatId: string;
  nombre: string;
  texto?: string;           // texto libre o comando
  seleccionId?: string;     // id del botón pulsado
  mensajeOrigenId?: string;
};

type Boton = { id: string; texto: string };   // texto ≤ 20 caracteres

type RespuestaBot = {
  texto: string;
  botones?: Boton[];        // el adaptador decide cómo renderizarlos
  editarMensajeId?: string; // actualizar en el sitio en vez de mandar otro mensaje
};
```

Los flujos declaran botones sin pensar en el canal. Cada adaptador resuelve lo suyo:

| | Telegram | WhatsApp (Cloud API) |
|---|---|---|
| Botones | inline keyboard, filas de 2–3 | hasta 3 → *reply buttons*; **más de 3 → *interactive list* automáticamente** |
| `editarMensajeId` | `editMessageText`: el panel en vivo se actualiza en el sitio | no existe por API → se reenvía el panel |
| Identidad | user id | número en E.164 |
| Comandos | `/cargar` | sin comandos: menú y texto libre |
| Envío proactivo | libre | fuera de la ventana de 24h, solo plantillas aprobadas |

La conversión automática de botones a lista es lo que permite que el panel en vivo tenga
8 botones sin degradar la experiencia en Telegram ni quedar inutilizable en WhatsApp.

---

## 2. Árbol de módulos

```
src/
├── config/                    # validación de entorno; el proceso no arranca si falta algo
├── db/
│   ├── schema/                # esquema Drizzle: fuente de verdad de tipos y migraciones
│   ├── db.service.ts          # pool de Postgres + instancia Drizzle
│   └── migrate.ts             # runner de migraciones (pnpm db:migrate)
├── core/
│   ├── redis/                 # cliente compartido, con degradación a Postgres
│   └── health/                # GET /health para el healthcheck del hosting
│
├── channels/
│   ├── channel.types.ts       # MensajeEntrante, RespuestaBot, Boton
│   ├── channel-adapter.interface.ts
│   ├── telegram/              # controller (valida el secret token), mapper, adapter
│   ├── whatsapp/              # Fase 5
│   └── testing/               # FakeChannelAdapter: captura respuestas, sin red
│
├── conversacion/
│   ├── flow.types.ts          # Flujo, Paso, ContextoFlujo
│   ├── flow-engine.service.ts
│   ├── router.service.ts      # comando | selección → flujo o handler de un paso
│   ├── sesion.store.ts        # sesion:{canal}:{canalUserId}
│   └── pasos-comunes/         # selector-equipo, confirmación
│
├── identidad/                 # usuarios, identidades por canal, membresías, RolGuard
├── academias/ · equipos/ · jugadores/ · invitaciones/
├── partidos/                  # partidos.service, tiempos.service
├── eventos/                   # registrar, dedup, deshacer
├── post-partido/
├── estadisticas/
└── resumen/
```

---

## 3. Patrones clave

### 3.1 Resolución de equipo (RF-7.2)

Casi todo comando depende de un equipo. Si el usuario pertenece a uno solo, se resuelve
sin preguntar; si pertenece a varios, hay que preguntar.

Esto **no** es un interceptor. Un interceptor de Nest no puede cortar el flujo y devolver
botones sin lanzar una excepción, y usar excepciones para control de flujo normal
oscurece el código. Es un **paso de flujo reutilizable**: `pasos-comunes/selector-equipo`
se antepone a cualquier flujo que lo necesite y, si no hay ambigüedad, se resuelve solo
y cede el turno al paso siguiente sin mandar ningún mensaje.

### 3.2 Roles

`RolGuard` compara el rol del usuario **en el equipo ya resuelto** contra el mínimo que
declara el handler. La tabla de la sección 5 de los requerimientos se traduce uno a uno.

El rol se lee siempre del servidor, nunca de datos que vengan del mensaje: un flag como
`comoAdmin` viajando en un DTO es falsificable.

### 3.3 Ciclo de vida de un evento en vivo

`eventos.service` orquesta:

1. Valida rol y que el partido no esté cerrado.
2. Si el tiempo actual está `finalizado`, inicia el siguiente antes de seguir (RF-3.8).
3. Calcula el minuto sobre las duraciones **reales** de `partido_tiempos`, no sobre las
   configuradas: un tiempo con adición no debe desfasar los siguientes.
4. Chequea duplicados (3.4).
5. El trigger de Postgres actualiza el marcador. El servicio no lo recalcula a mano.

### 3.4 Detección de duplicados sin condición de carrera

El chequeo es una **escritura atómica**, no un `GET` seguido de `SET`:

```
SET partido:{id}:evento_reciente:{tipo}:{equipo} <payload> NX PX 60000
```

- Devuelve `OK` → no había nada reciente: es el primer reporte, se guarda.
- Devuelve `nil` → ya hay uno: se hace `GET` y se pide confirmación.

Con el patrón `GET`-luego-`SET`, dos cargas separadas por menos de un segundo leen la
clave vacía las dos y el duplicado se cuela igual — que es justamente el caso que el
criterio de aceptación #3 exige detectar.

Refinamiento (M1): si el evento reciente y el nuevo tienen **jugadores identificados y
distintos**, se guarda sin preguntar. Preguntar cuando Jacob marcó y Andrés marcó 40
segundos después es fricción sin información.

### 3.5 Finalización con lock

Finalizar tiempo y finalizar partido pasan por un lock corto (`SET NX PX 5000`). El
segundo usuario recibe "ya fue finalizado por Carlos" sin tocar la base.

### 3.6 Redis acelera, no es fuente de verdad

Redis guarda el estado del partido en vivo, la ventana de duplicados, los locks y la
sesión conversacional. Todo eso tiene respaldo en Postgres:

- el estado del partido se reconstruye desde `partidos` + `partido_tiempos`;
- el dedup cae al índice `idx_eventos_dedup`;
- los locks caen a advisory locks de Postgres.

Si Redis se cae, el bot arranca igual y sigue funcionando más lento. No se cae un partido
por una caída de cache.

---

## 4. Comando → módulo

| Comando / acción | Módulo |
|---|---|
| `/start`, `/nuevoequipo` | `equipos` |
| `/unirme`, `/invitar` | `invitaciones` |
| `/plantilla` | `jugadores` |
| `/permisos` | `identidad` |
| `/nuevopartido`, `/finalizar`, `/reabrir` | `partidos` |
| `/cargar` (en vivo) | `eventos` + `partidos/tiempos.service` |
| `/cargar` (post partido) | `post-partido` |
| `/deshacer` | `eventos` |
| `/stats`, `/tabla`, `/partidos` | `estadisticas` |

---

## 5. Qué no va en este backend por ahora

- **No hay AuthModule con JWT propio.** La identidad la da el canal de mensajería. Cuando
  exista el panel web habrá que agregarlo, y ahí `identidades_usuario` es el punto natural
  para colgar una identidad de tipo "email + contraseña".
- **No hay capa de planes ni billing.** Cuando exista, entra como un `PlanesModule` que
  consulta límites antes de que se cree un equipo, un jugador o un partido. La academia ya
  es la unidad de facturación en el modelo de datos.
