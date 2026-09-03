-- ============================================================
-- Yako — Esquema de base de datos (PostgreSQL / Supabase)
-- Ver yako-requerimientos.md sección 6 para el modelo conceptual.
--
-- Nota sobre RLS: como todo el acceso pasa por el backend en NestJS
-- (usando la service role key de Supabase), estas tablas pueden
-- quedar con Row Level Security desactivado. Si más adelante se
-- expone Supabase directamente a un panel web con auth de usuario
-- final, ahí sí conviene activar RLS con policies basadas en
-- usuarios_equipos.
-- ============================================================

create extension if not exists pgcrypto;

-- ============================================================
-- ENUMS
-- ============================================================

create type rol_equipo as enum ('admin', 'editor', 'viewer');

create type modo_carga_partido as enum ('en_vivo', 'post_partido');

create type estado_partido as enum ('pendiente', 'en_progreso', 'cerrado');

create type estado_tiempo as enum ('no_iniciado', 'en_curso', 'finalizado');

create type tipo_evento as enum (
  'gol',
  'autogol',
  'asistencia',
  'tarjeta_amarilla',
  'tarjeta_roja',
  'cambio'
);

create type equipo_origen_evento as enum ('propio', 'rival');

-- ============================================================
-- ACADEMIAS Y EQUIPOS
-- ============================================================

create table academias (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null,
  creado_en     timestamptz not null default now()
);

create table equipos (
  id                          uuid primary key default gen_random_uuid(),
  academia_id                 uuid not null references academias(id) on delete cascade,
  nombre                      text not null,
  cantidad_tiempos_default    smallint not null default 2 check (cantidad_tiempos_default > 0),
  minutos_por_tiempo_default  smallint not null default 25 check (minutos_por_tiempo_default > 0),
  creado_en                   timestamptz not null default now(),
  unique (academia_id, nombre)
);

create index idx_equipos_academia on equipos(academia_id);

-- ============================================================
-- PERSONAS (opcional — enlaza un mismo individuo entre equipos)
-- ============================================================

create table personas (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null,
  creado_en     timestamptz not null default now()
);

-- ============================================================
-- USUARIOS (cuentas de Telegram) Y MEMBRESÍA POR EQUIPO
-- ============================================================

create table usuarios (
  id            uuid primary key default gen_random_uuid(),
  telegram_id   bigint not null unique,
  nombre        text not null,
  creado_en     timestamptz not null default now()
);

create table usuarios_equipos (
  usuario_id    uuid not null references usuarios(id) on delete cascade,
  equipo_id     uuid not null references equipos(id) on delete cascade,
  rol           rol_equipo not null,
  creado_en     timestamptz not null default now(),
  primary key (usuario_id, equipo_id)
);

create index idx_usuarios_equipos_equipo on usuarios_equipos(equipo_id, rol);

-- ============================================================
-- JUGADORES
-- ============================================================

create table jugadores (
  id            uuid primary key default gen_random_uuid(),
  equipo_id     uuid not null references equipos(id) on delete cascade,
  persona_id    uuid references personas(id),
  nombre        text not null,
  dorsal        smallint,
  activo        boolean not null default true,
  creado_en     timestamptz not null default now()
);

create index idx_jugadores_equipo on jugadores(equipo_id) where activo;

-- ============================================================
-- INVITACIONES
-- ============================================================

create table invitaciones (
  id            uuid primary key default gen_random_uuid(),
  equipo_id     uuid not null references equipos(id) on delete cascade,
  codigo        text not null unique,
  rol           rol_equipo not null,
  creado_por    uuid not null references usuarios(id),
  expira_en     timestamptz not null,
  usado_por     uuid references usuarios(id),
  usado_en      timestamptz,
  creado_en     timestamptz not null default now()
);

create index idx_invitaciones_codigo on invitaciones(codigo);

-- ============================================================
-- PARTIDOS
-- ============================================================

create table partidos (
  id                    uuid primary key default gen_random_uuid(),
  equipo_id             uuid not null references equipos(id) on delete cascade,
  rival                 text not null,
  fecha                 date not null,
  competencia           text,

  cantidad_tiempos      smallint not null check (cantidad_tiempos > 0),
  minutos_por_tiempo    smallint not null check (minutos_por_tiempo > 0),

  modo_carga            modo_carga_partido,
  estado                estado_partido not null default 'pendiente',

  tiempo_actual         smallint not null default 0 check (tiempo_actual >= 0),
  tiempo_estado         estado_tiempo not null default 'no_iniciado',
  tiempo_iniciado_en    timestamptz,

  marcador_propio       smallint not null default 0,
  marcador_rival        smallint not null default 0,

  iniciado_por          uuid references usuarios(id),
  creado_por            uuid not null references usuarios(id),
  creado_en             timestamptz not null default now(),
  cerrado_en            timestamptz
);

create index idx_partidos_equipo_estado on partidos(equipo_id, estado);
create index idx_partidos_equipo_fecha on partidos(equipo_id, fecha desc);

-- ============================================================
-- EVENTOS
-- ============================================================

create table eventos (
  id                uuid primary key default gen_random_uuid(),
  partido_id        uuid not null references partidos(id) on delete cascade,
  tipo              tipo_evento not null,
  equipo_origen     equipo_origen_evento not null,
  jugador_id        uuid references jugadores(id),

  tiempo            smallint not null,
  minuto_calculado  smallint not null,

  reportado_por     uuid not null references usuarios(id),
  creado_en         timestamptz not null default now(),

  -- soft delete: /deshacer no borra la fila, la marca eliminada
  -- (mantiene auditoría de quién cargó y quién deshizo)
  eliminado_en      timestamptz,
  eliminado_por     uuid references usuarios(id)
);

-- Índice clave para el chequeo de duplicados (Redis es la primera
-- línea de defensa, pero este índice sostiene la misma consulta
-- como respaldo o para auditoría posterior).
create index idx_eventos_dedup
  on eventos(partido_id, tipo, equipo_origen, creado_en)
  where eliminado_en is null;

create index idx_eventos_partido on eventos(partido_id) where eliminado_en is null;
create index idx_eventos_jugador on eventos(jugador_id) where eliminado_en is null;

-- ============================================================
-- TRIGGER: mantener marcador_propio / marcador_rival en partidos
-- sincronizado con los goles y autogoles registrados en eventos.
-- ============================================================

create or replace function actualizar_marcador_partido()
returns trigger as $$
declare
  v_partido_id uuid;
  v_delta smallint;
  v_equipo_que_suma equipo_origen_evento;
begin
  -- Determina sobre qué fila trabajar según el tipo de operación
  if tg_op = 'INSERT' then
    if new.tipo not in ('gol', 'autogol') or new.eliminado_en is not null then
      return new;
    end if;
    v_partido_id := new.partido_id;
    v_delta := 1;
    -- un gol suma para el equipo_origen; un autogol suma para el rival
    v_equipo_que_suma := case when new.tipo = 'gol' then new.equipo_origen
                               when new.equipo_origen = 'propio' then 'rival'::equipo_origen_evento
                               else 'propio'::equipo_origen_evento end;

  elsif tg_op = 'UPDATE' and old.eliminado_en is null and new.eliminado_en is not null then
    -- se acaba de deshacer un evento que ya sumaba al marcador
    if new.tipo not in ('gol', 'autogol') then
      return new;
    end if;
    v_partido_id := new.partido_id;
    v_delta := -1;
    v_equipo_que_suma := case when new.tipo = 'gol' then new.equipo_origen
                               when new.equipo_origen = 'propio' then 'rival'::equipo_origen_evento
                               else 'propio'::equipo_origen_evento end;
  else
    return new;
  end if;

  if v_equipo_que_suma = 'propio' then
    update partidos set marcador_propio = marcador_propio + v_delta where id = v_partido_id;
  else
    update partidos set marcador_rival = marcador_rival + v_delta where id = v_partido_id;
  end if;

  return new;
end;
$$ language plpgsql;

create trigger trg_actualizar_marcador_insert
  after insert on eventos
  for each row execute function actualizar_marcador_partido();

create trigger trg_actualizar_marcador_deshacer
  after update of eliminado_en on eventos
  for each row execute function actualizar_marcador_partido();

-- ============================================================
-- VISTA DE APOYO: estadísticas acumuladas por jugador
-- (usada por /stats — evita recalcular en la aplicación)
-- ============================================================

create view estadisticas_jugador as
select
  j.id as jugador_id,
  j.equipo_id,
  j.nombre,
  j.dorsal,
  -- Nota: cuenta partidos donde el jugador tiene al menos un evento
  -- registrado. No es lo mismo que "partidos convocado" — eso
  -- requeriría una tabla de convocatoria/asistencia que no está en
  -- el alcance del MVP.
  count(distinct e.partido_id) as partidos_con_evento,
  count(*) filter (where e.tipo = 'gol')               as goles,
  count(*) filter (where e.tipo = 'asistencia')         as asistencias,
  count(*) filter (where e.tipo = 'tarjeta_amarilla')   as amarillas,
  count(*) filter (where e.tipo = 'tarjeta_roja')       as rojas
from jugadores j
left join eventos e
  on e.jugador_id = j.id
  and e.eliminado_en is null
group by j.id, j.equipo_id, j.nombre, j.dorsal;
