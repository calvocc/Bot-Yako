# Yako — Flujo completo de conversación

Especificación de comandos, mensajes y estados para el MVP del bot.

**Idioma del copy:** español de Colombia, tratando de "tú". Toda la interfaz del bot usa
este registro (ver C7 en [revision-documentos.md](revision-documentos.md)).

**Canal:** los diálogos de abajo muestran Telegram, que es el canal del MVP. El flujo es
el mismo en cualquier canal: los botones se declaran una sola vez y cada adaptador decide
cómo mostrarlos. En WhatsApp, un grupo de más de 3 botones se convierte automáticamente
en una lista desplegable (ver [adr/0002](adr/0002-motor-conversacional-propio.md)).

---

## 0. Modelo de organización: Academia → Equipos → Jugadores/Usuarios

Antes de entrar al flujo, el cambio de fondo de esta versión:

- El onboarding crea una **Academia** (el tenant real), no un equipo.
- Dentro de una Academia puede haber **N equipos/categorías** (Sub-9, Sub-11, Sub-13...), cada uno con su propia plantilla, partidos y configuración de tiempos.
- Un **usuario** (papá, DT) puede pertenecer a varios equipos, incluso de academias distintas, con roles distintos en cada uno (ej. Editor en Sub-11, Viewer en Sub-9).
- Un **jugador** o **técnico** también puede estar vinculado a más de un equipo (ej. un DT que dirige dos categorías). Su ficha vive por equipo, pero queda enlazada a un mismo perfil de persona para poder, más adelante, mostrar historial combinado.
- Esto es lo que después permite limitar por plan (cantidad de equipos, de jugadores, de partidos/mes) cuando salga como SaaS — la academia es la unidad de facturación.

En la práctica esto significa que casi cualquier comando que antes asumía "un solo equipo" ahora primero resuelve **a qué equipo se refiere el usuario**, y solo pregunta si hay ambigüedad real (si pertenece a uno solo, no pregunta nada).

---

## 1. Onboarding — `/start`

**Primera vez que alguien escribe al bot (sin cuenta vinculada):**

```
Bot: ¡Hola! Soy Yako ⚽, llevo las estadísticas de tu academia.

Para empezar, dime:
[Ya tengo una invitación]  [Quiero crear una academia nueva]
```

**Si elige "Quiero crear una academia nueva" → se convierte en Admin:**

```
Bot: Perfecto, vas a ser el administrador de la academia.
     ¿Cómo se llama la academia u organización?
User: Ringo Amaya
Bot: Academia "Ringo Amaya" creada ✅ Eres el admin.

     Ahora creemos el primer equipo/categoría.
     ¿Cómo se llama? (ej. Sub-11 2027)
User: Sub-11
Bot: Equipo "Sub-11" creado dentro de Ringo Amaya ✅

     ¿Formato de partido para esta categoría?
     [2 tiempos x 25 min]  [4 tiempos x 12 min]  [Personalizado]
User: [2 tiempos x 25 min]
Bot: Listo. Ahora carga la plantilla del Sub-11:
     Nombre, dorsal
     (uno por línea, o de a uno)
User: Jacob, 10
Bot: Agregado: Jacob (#10) ⚽ ¿Otro? Escribe el siguiente o /listo
User: /listo
Bot: Plantilla lista con 1 jugador.
     Cuando quieras, crea otro equipo con /nuevoequipo
     o invita a los papás con /invitar
```

> El formato de partido (tiempos x minutos) es una plantilla por equipo — cada partido nuevo lo hereda por defecto, pero se puede ajustar caso a caso (ver sección 3).

**Si entra por un link de invitación** (`t.me/YakoBot?start=inv_x7f2a`), el bot salta la
pregunta anterior: toma el código del payload de `/start` y lo canjea directo, mostrando
el mismo mensaje de confirmación de más abajo. Si el código no existe, expiró o ya agotó
sus usos, lo dice y ofrece el menú normal.

**Si elige "Ya tengo una invitación":**

```
Bot: Pega el código de invitación que te compartieron.
User: YAKO-X7F2A
Bot: ¡Listo! Quedaste como Editor en "Ringo Amaya — Sub-11" ✅
     Si más adelante quieres sumarte a otro equipo, usa /unirme con el código.
```

---

## 2. Gestión de equipos, plantillas y permisos

`/equipos` — lista los equipos de la academia (Admin) o los equipos a los que pertenece el usuario (cualquier rol).

`/nuevoequipo` (solo Admin) — crea un equipo adicional dentro de la misma academia. Repite el mismo mini flujo del onboarding: nombre → formato de partido → plantilla.

`/plantilla` — ver o editar jugadores de un equipo (solo Admin/Editor edita).
- Si el usuario pertenece a un solo equipo, entra directo.
- Si pertenece a varios, primero pregunta a cuál:
```
Bot: Perteneces a más de un equipo. ¿Cuál?
     [Ringo Amaya — Sub-11]  [Ringo Amaya — Sub-9]
```

`/invitar` (solo Admin):
```
Bot: ¿Para qué equipo es esta invitación?
     [Sub-11]  [Sub-9]
User: [Sub-11]
Bot: Elige el rol para la invitación:
     [Viewer — solo consulta]  [Editor — puede cargar eventos]
User: [Editor]
Bot: Código de invitación (Sub-11, Editor, expira en 7 días):
     YAKO-X7F2A
     También puedes compartir el link: t.me/YakoBot?start=inv_x7f2a
```

`/unirme [código]` — para sumarse a un equipo adicional sin repetir todo el onboarding (útil si un papá ya usa Yako en otro equipo/academia).

`/permisos` (solo Admin) — cambia el rol de un usuario existente en un equipo.

---

## 3. Crear un partido — `/nuevopartido`

Si el usuario tiene más de un equipo, primero resuelve el equipo (igual que en `/plantilla`).

```
Bot: Vamos a crear un partido. ¿Contra quién juegan?
User: Deportivo Norte
Bot: ¿Fecha? (hoy / dd-mm)
User: hoy
Bot: ¿Competencia?
     [Liga del Atlántico]  [Torneo relámpago]  [Amistoso]  [Otro]
User: [Liga del Atlántico]
Bot: ¿Formato del partido? (el del Sub-11 es 2 tiempos x 25 min)
     [Usar el de siempre]  [Cambiar para este partido]
User: [Usar el de siempre]
Bot: Partido creado ✅
     Ringo Amaya Sub-11 vs Deportivo Norte — Liga del Atlántico — hoy
     Formato: 2 tiempos x 25 min
     Estado: pendiente de cargar eventos
```

Si elige "Cambiar para este partido", se repite la pregunta de tiempos/minutos como en el onboarding (útil para torneos relámpago con formato reducido).

---

## 4. Cargar eventos — `/cargar`

Punto de entrada único, sin importar si es en vivo o post partido. Si el usuario pertenece a más de un equipo, primero resuelve cuál (como en las secciones anteriores).

```
Bot: ¿A qué partido le quieres cargar eventos?
     [vs Deportivo Norte — hoy]
     [vs Barranquilla FC — 25/08]
User: [vs Deportivo Norte — hoy]
```

El bot revisa el estado del partido (`modo_carga`, `estado`) y bifurca:

### 4a. Partido sin modo definido (`modo_carga = null`)

```
Bot: ¿Vas a cargar en vivo o es post partido?
     [🔴 En vivo — el partido está jugándose]
     [📝 Post partido — ya terminó]
```

### 4b. Partido ya en modo "en vivo" (otro papá ya lo inició)

El bot **no vuelve a preguntar** — entra directo a la carga en vivo, en el tiempo que esté activo en ese momento:

```
Bot: Este partido ya está en vivo (lo inició Carlos hace 12 min).
     Tiempo 1 en curso, min ~14.
     Entrando a modo carga en vivo ⚡
     [ver sección 5]
```

### 4c. Partido ya en modo "post partido" (con datos parciales)

Antes de dejar cargar, muestra lo que ya existe:

```
Bot: Este partido ya tiene datos cargados por Carlos:
     3-1 · Goles: Jacob (2), Andrés (1) · Amarilla: Andrés

     ¿Quieres completar o corregir algo?
     [Agregar más]  [Corregir marcador]  [No, está bien así]
```

### 4d. Partido cerrado (`estado = cerrado`)

```
Bot: Este partido ya está cerrado y con resumen enviado.
     Si necesitas corregir algo, pídele al admin que lo reabra con /reabrir.
```

---

## 5. Modo en vivo ⚡ (con tiempos y minuto automático)

Al elegir "En vivo" (o entrar porque ya estaba activo), el bot fija `modo_carga = en_vivo`, `estado = en_progreso`, `iniciado_por = usuario actual`, arranca el **Tiempo 1** (`tiempo_actual = 1`, `tiempo_iniciado_en = ahora`), y muestra el panel de carga rápida:

```
Bot: Partido en vivo — Ringo Amaya Sub-11 vs Deportivo Norte
     Tiempo 1 · min 0 · Marcador: 0-0

     [⚽ Gol]  [🅰️ Asistencia]  [🟨 Tarjeta]  [🟥 Roja]  [🔄 Cambio]
     [⏸️ Finalizar tiempo]  [📋 Ver resumen]  [🏁 Finalizar partido]
```

**Ya no se pregunta el minuto.** Se calcula solo: minutos de los tiempos anteriores ya completados (según el formato configurado) + minutos transcurridos desde que arrancó el tiempo actual.

**Ejemplo — cargar un gol:**

```
User: [⚽ Gol]
Bot: ¿De qué equipo?
     [Ringo Amaya]  [Deportivo Norte]
User: [Ringo Amaya]
Bot: ¿Quién anotó?
     [Jacob #10]  [Andrés #7]  [Otro jugador...]
User: [Jacob #10]
```

**Chequeo de duplicados (automático, invisible si no hay coincidencia):**

*Caso sin coincidencia (primer reporte):*
```
Bot: ⚽ ¡Gol! Jacob #10, min 23 (Tiempo 1). Marcador: 1-0
     (lo registraste tú)
```

*Caso con coincidencia (otro ya lo cargó hace <60s):*
```
Bot: ⚠️ Hace 40 segundos, Carlos ya registró:
     Gol de Jacob, min 23

     ¿Tu reporte es un gol distinto o es el mismo que ya se cargó?
     [Es otro gol]  [Ya estaba registrado]
```
- `[Es otro gol]` → se agrega como evento aparte, marcador se actualiza.
- `[Ya estaba registrado]` → no se guarda nada.

El mismo patrón (busca evento del mismo tipo + mismo equipo en los últimos 60s) aplica a tarjetas y cambios.

> **Refinamiento (M1):** si el evento reciente y el nuevo tienen jugadores identificados y
> **distintos**, el bot guarda sin preguntar. Si Jacob marcó y Andrés marca 40 segundos
> después, no hay nada ambiguo que confirmar. La pregunta aparece solo cuando el jugador
> coincide o cuando alguno de los dos eventos no tiene jugador identificado.

### 5a. Finalizar un tiempo

```
User: [⏸️ Finalizar tiempo]
Bot: ¿Confirmas que finalizó el Tiempo 1? (min ~25)
     [Sí, finalizó]  [No, todavía no]
User: [Sí, finalizó]
Bot: Tiempo 1 finalizado ⏸️ Marcador: 1-0
     Cuando estén listos:
     [▶️ Iniciar Tiempo 2]
```

Mientras el tiempo está finalizado y el siguiente no arrancó, los botones de eventos (`Gol`, `Tarjeta`, etc.) siguen disponibles — si alguien los toca sin haber apretado "Iniciar Tiempo 2", el bot **arranca el siguiente tiempo automáticamente** en ese momento y sigue con la carga del evento:

```
User: [⚽ Gol]
Bot: ▶️ Se inició el Tiempo 2 automáticamente.
     ¿De qué equipo?
     ...
```

Si el tiempo que se finaliza es el último del formato configurado (ej. Tiempo 2 de 2, o Tiempo 4 de 4), el bot no ofrece "Iniciar tiempo siguiente" — invita directamente a cerrar el partido:

```
Bot: Tiempo 2 finalizado (era el último). Marcador: 2-1
     [🏁 Finalizar partido]  [Esperar]
```

### 5b. Deshacer el último evento propio

```
User: /deshacer
Bot: Se eliminó: Gol de Jacob, min 23 (lo cargaste tú hace 1 min)
```
> `/deshacer` solo borra eventos cargados por el mismo usuario, salvo que sea Admin (que puede deshacer cualquiera).

---

## 6. Cerrar el partido — `[🏁 Finalizar partido]` o `/finalizar`

```
User: [🏁 Finalizar partido]
Bot: ¿Confirmas el marcador final? 2-1
     [Sí, finalizar]  [No, falta algo]
User: [Sí, finalizar]
Bot: Partido cerrado ✅ Generando resumen...
```

**Resumen automático (se genera y se puede reenviar al grupo de papás):**

```
🏆 Ringo Amaya Sub-11  2 - 1  Deportivo Norte
Liga del Atlántico

⚽ Goles: Jacob '23, Jacob '41
🟨 Amarillas: Andrés '35

MVP del partido: Jacob (2 goles)

     [Compartir al grupo]  [Editar]
```

---

## 7. Modo post partido 📝 (reducido)

Al elegir "Post partido" (o entrar porque el modo ya era ese):

```
Bot: Cargando datos post partido — solo lo esencial.

     ¿Marcador final? (ej. 3-1)
User: 3-1
Bot: ¿Quién anotó? Escríbelo así: Jacob 2, Andrés 1
User: Jacob 2, Andrés 1
Bot: ¿Hubo tarjetas? (nombre + color, o /ninguna)
User: Andrés amarilla
Bot: Listo, resumen cargado:
     3-1 · Goles: Jacob (2), Andrés (1) · Amarilla: Andrés
     [Confirmar]  [Corregir algo]
User: [Confirmar]
Bot: Guardado ✅ ¿Quieres compartir el resumen al grupo?
     [Compartir]  [No, gracias]
```

No pide minuto ni tiempos ni asistencias — si alguien quiere agregar ese detalle después, puede hacerlo con `/cargar` de nuevo (vuelve al caso 4c: le muestra el resumen actual antes de dejarlo tocar algo).

---

## 8. Consultas — no requieren permieres especiales (Viewer puede usarlas)

Si el usuario pertenece a más de un equipo, cada uno de estos comandos primero pregunta a cuál se refiere (igual que en `/cargar`), salvo que pertenezca a uno solo.

`/stats [jugador]`
```
User: /stats Jacob
Bot: 📊 Jacob #10 — Ringo Amaya Sub-11 · temporada 2026
     Partidos jugados: 8
     Goles: 6  ·  Asistencias: 2  ·  Amarillas: 1
```

`/tabla`
```
Bot: 📋 Ringo Amaya Sub-11 — temporada 2026
     8 partidos · 5 ganados · 2 empates · 1 perdido
     Goles a favor: 22 · Goleador: Jacob (6)
```

`/partidos` — lista los últimos partidos del equipo y su estado (pendiente / en vivo / cerrado).

---

## 9. Caeres borde importantes

| Situación | Comportamiento |
|---|---|
| Un Viewer intenta `/cargar` | "No tienes permiso para cargar eventos. Pídele al admin que te dé rol de Editor." |
| Se intenta cargar evento a un partido de otro equipo | No aparece en la lista de `/cargar` — el bot solo muestra partidos del equipo elegido. |
| Dos personas tocan `[🏁 Finalizar]` casi al mismo tiempo | Solo la primera confirmación cierra el partido; la segunda ve "Este partido ya fue finalizado por Carlos." |
| Dos personas tocan `[⏸️ Finalizar tiempo]` casi al mismo tiempo | Solo la primera confirmación cierra el tiempo; la segunda ve "El Tiempo 1 ya fue finalizado por Carlos." |
| Se carga un evento y el tiempo actual estaba finalizado | El bot arranca el siguiente tiempo automáticamente antes de guardar el evento (ver 5a). |
| Admin quiere reabrir un partido cerrado | `/reabrir` (solo Admin) → vuelve a `estado = en_progreso` en el último tiempo jugado, mantiene todos los eventos ya cargados. |
| Se carga un evento sin seleccionar jugador (ej. gol en propia meta del rival) | Opción `[Autogol]` dentro del selector de "¿Quién anotó?" |
| El usuario pertenece a un solo equipo | Ningún comando pregunta "¿cuál equipo?" — se resuelve solo. |

---

## Resumen de comandos

| Comando | Rol mínimo | Qué hace |
|---|---|---|
| `/start` | — | Onboarding / crear academia / vincular cuenta con código |
| `/unirme [código]` | — | Sumarse a un equipo adicional |
| `/equipos` | Viewer | Listar equipos de la academia / a los que pertenece |
| `/nuevoequipo` | Admin | Crear un equipo/categoría nuevo dentro de la academia |
| `/plantilla` | Viewer (ver) / Admin-Editor (editar) | Ver o editar jugadores de un equipo |
| `/invitar` | Admin | Generar código/link de invitación con equipo y rol |
| `/permisos` | Admin | Cambiar rol de un usuario en un equipo |
| `/nuevopartido` | Editor | Crear partido (con formato de tiempos) |
| `/partidos` | Viewer | Listar partidos y su estado |
| `/cargar` | Editor | Entrar al flujo de carga (en vivo o post partido) |
| `/finalizar` | Editor | Cerrar partido en vivo y generar resumen |
| `/reabrir` | Admin | Reabrir un partido cerrado |
| `/deshacer` | Editor (propio) / Admin (cualquiera) | Eliminar el último evento |
| `/stats [jugador]` | Viewer | Estadísticas acumuladas |
| `/tabla` | Viewer | Resumen del equipo en la temporada |
| `/ayuda` | — | Lista de comandos |
