-- ============================================================
-- Trigger de marcador, vistas de estadisticas y RLS.
--
-- Corresponde a lo que en yako-schema.sql estaba escrito a mano y no puede
-- expresarse en el esquema de Drizzle.
-- ============================================================

-- ------------------------------------------------------------
-- Marcador derivado de los eventos.
--
-- Cambios respecto del original:
--  * se ignoran los eventos ya eliminados en el INSERT;
--  * el UPDATE cubre las dos direcciones: deshacer (resta) y rehacer (suma),
--    porque /reabrir puede restaurar un evento previamente deshecho;
--  * el calculo de "que equipo suma" se hace explicito en vez de apoyarse en
--    un CASE con ramas de condiciones mezcladas.
-- ------------------------------------------------------------

create or replace function equipo_que_suma(
  p_tipo tipo_evento,
  p_equipo_origen equipo_origen_evento
) returns equipo_origen_evento as $$
begin
  -- Un gol suma para quien lo marco; un autogol suma para el rival de quien lo marco.
  if p_tipo = 'gol' then
    return p_equipo_origen;
  end if;

  return case when p_equipo_origen = 'propio' then 'rival'::equipo_origen_evento
              else 'propio'::equipo_origen_evento end;
end;
$$ language plpgsql immutable;

create or replace function actualizar_marcador_partido()
returns trigger as $$
declare
  v_delta smallint;
  v_equipo equipo_origen_evento;
begin
  if new.tipo not in ('gol', 'autogol') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Un evento insertado ya eliminado (no deberia pasar) no mueve el marcador.
    if new.eliminado_en is not null then
      return new;
    end if;
    v_delta := 1;

  elsif tg_op = 'UPDATE' then
    if old.eliminado_en is null and new.eliminado_en is not null then
      v_delta := -1;                       -- se deshizo
    elsif old.eliminado_en is not null and new.eliminado_en is null then
      v_delta := 1;                        -- se restauro
    else
      return new;                          -- el soft delete no cambio
    end if;

  else
    return new;
  end if;

  v_equipo := equipo_que_suma(new.tipo, new.equipo_origen);

  if v_equipo = 'propio' then
    update partidos set marcador_propio = marcador_propio + v_delta where id = new.partido_id;
  else
    update partidos set marcador_rival = marcador_rival + v_delta where id = new.partido_id;
  end if;

  return new;
end;
$$ language plpgsql;

create trigger trg_actualizar_marcador_insert
  after insert on eventos
  for each row execute function actualizar_marcador_partido();
--> statement-breakpoint

create trigger trg_actualizar_marcador_deshacer
  after update of eliminado_en on eventos
  for each row execute function actualizar_marcador_partido();
--> statement-breakpoint

-- ------------------------------------------------------------
-- B5: estadisticas por jugador Y temporada.
--
-- La vista original agregaba todo el historico, asi que /stats no podia
-- responder "temporada 2026". La temporada se deriva del ano del partido.
-- Los eventos de partidos aun no cerrados tambien cuentan: durante un partido
-- en vivo /stats debe reflejar lo que va ocurriendo.
-- ------------------------------------------------------------

create view estadisticas_jugador with (security_invoker = true) as
select
  j.id                                                  as jugador_id,
  j.equipo_id,
  j.nombre,
  j.dorsal,
  extract(year from p.fecha)::smallint                  as temporada,
  count(distinct e.partido_id)                          as partidos_con_evento,
  count(*) filter (where e.tipo = 'gol')                as goles,
  count(*) filter (where e.tipo = 'autogol')            as autogoles,
  count(*) filter (where e.tipo = 'asistencia')         as asistencias,
  count(*) filter (where e.tipo = 'tarjeta_amarilla')   as amarillas,
  count(*) filter (where e.tipo = 'tarjeta_roja')       as rojas
from jugadores j
join eventos e
  on e.jugador_id = j.id
  and e.eliminado_en is null
join partidos p
  on p.id = e.partido_id
group by j.id, j.equipo_id, j.nombre, j.dorsal, extract(year from p.fecha);
--> statement-breakpoint

-- ------------------------------------------------------------
-- Resumen de equipo por temporada, para /tabla.
--
-- El resultado usa el marcador confirmado al cerrar cuando existe y cae al
-- derivado de eventos cuando no, de modo que un partido cerrado con marcador
-- corregido a mano cuente como lo declaro quien lo cerro.
-- ------------------------------------------------------------

create view estadisticas_equipo with (security_invoker = true) as
with partidos_resueltos as (
  select
    p.equipo_id,
    extract(year from p.fecha)::smallint as temporada,
    coalesce(p.marcador_propio_confirmado, p.marcador_propio) as goles_favor,
    coalesce(p.marcador_rival_confirmado, p.marcador_rival)   as goles_contra
  from partidos p
  where p.estado = 'cerrado'
)
select
  equipo_id,
  temporada,
  count(*)                                                   as partidos_jugados,
  count(*) filter (where goles_favor > goles_contra)          as ganados,
  count(*) filter (where goles_favor = goles_contra)          as empatados,
  count(*) filter (where goles_favor < goles_contra)          as perdidos,
  coalesce(sum(goles_favor), 0)                               as goles_favor,
  coalesce(sum(goles_contra), 0)                              as goles_contra
from partidos_resueltos
group by equipo_id, temporada;
--> statement-breakpoint

-- ------------------------------------------------------------
-- C10: RLS activado con deny-all en todas las tablas.
--
-- Todo el acceso pasa por el backend con una conexion de servicio, que es
-- dueña de las tablas y por lo tanto no queda sujeta a las policies.
-- Activar RLS sin definir ninguna policy deja a los roles anon/authenticated
-- sin acceso: si alguna vez se filtra la anon key de Supabase, no expone nada.
--
-- Deliberadamente NO se usa FORCE ROW LEVEL SECURITY: eso alcanzaria tambien
-- al dueño de la tabla y, sin policies, dejaria al propio backend sin acceso.
-- ------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'academias', 'equipos', 'personas', 'jugadores',
    'usuarios', 'identidades_usuario', 'usuarios_equipos',
    'invitaciones', 'invitaciones_canjes',
    'partidos', 'partido_tiempos', 'eventos'
  ] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;
