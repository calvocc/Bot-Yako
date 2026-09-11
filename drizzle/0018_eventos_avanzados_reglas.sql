-- ============================================================
-- Reglas para los tipos de evento nuevos (migracion 0017: gol_penal,
-- gol_tiro_libre, tiro_afuera, pase, falta_cometida).
--
-- Separada de 0017 por el mismo motivo que separa 0012 de 0013: Postgres no
-- permite usar un valor de enum recien agregado (ALTER TYPE ... ADD VALUE)
-- dentro de la misma transaccion en que se agrego, y cada migracion corre en
-- su propia transaccion (`src/db/migrate.ts`).
--
-- `gol_penal`/`gol_tiro_libre` son goles a todos los efectos de abajo: mueven
-- el marcador igual que `gol` (a favor de quien lo marco, a diferencia de
-- `autogol`), no exigen jugador identificado si los marca el rival (mismo
-- check que ya eximia a `gol`/`autogol`), y cuentan en el conteo de "goles"
-- de las vistas de estadisticas -- todo lo que ya distinguia entre gol/
-- autogol necesitaba enterarse de estos dos tambien.
-- `tiro_afuera`/`pase`/`falta_cometida` no mueven el marcador ni cambian
-- ninguna regla: solo sirven para puntaje.ts (fuera de la base), asi que no
-- necesitan tocar nada de este archivo.
-- ============================================================

alter table "eventos" drop constraint "eventos_jugador_requerido_check";
--> statement-breakpoint
alter table "eventos" add constraint "eventos_jugador_requerido_check"
  check (equipo_origen = 'rival' or tipo in ('gol', 'autogol', 'gol_penal', 'gol_tiro_libre') or jugador_id is not null);
--> statement-breakpoint

create or replace function equipo_que_suma(
  p_tipo tipo_evento,
  p_equipo_origen equipo_origen_evento
) returns equipo_origen_evento as $$
begin
  -- Un gol (de juego, penal o tiro libre) suma para quien lo marco; un
  -- autogol suma para el rival de quien lo marco.
  if p_tipo in ('gol', 'gol_penal', 'gol_tiro_libre') then
    return p_equipo_origen;
  end if;

  return case when p_equipo_origen = 'propio' then 'rival'::equipo_origen_evento
              else 'propio'::equipo_origen_evento end;
end;
$$ language plpgsql immutable;
--> statement-breakpoint

create or replace function actualizar_marcador_partido()
returns trigger as $$
declare
  v_delta smallint;
  v_equipo equipo_origen_evento;
begin
  if new.tipo not in ('gol', 'autogol', 'gol_penal', 'gol_tiro_libre') then
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
--> statement-breakpoint

-- `estadisticas_jugador` (0001, ampliada en 0009/0013/0014): mismas columnas,
-- mismo CTE de participacion y mismo `group by` de siempre -- 0014 le sumo
-- `partidos_jugados` al final y cambio el join a la vista para incluir a
-- quien jugo sin eventos propios, así que esta migracion parte de esa
-- version (no de la de 0013) y solo amplia el filtro de "goles" para que un
-- gol de penal o de tiro libre cuente igual que uno de juego.
create or replace view estadisticas_jugador with (security_invoker = true) as
with eventos_validos as (
  select *
  from eventos
  where eliminado_en is null
),
participacion as (
  select jugador_id, partido_id
  from eventos_validos
  where jugador_id is not null
  union
  select jugador_entra_id as jugador_id, partido_id
  from eventos_validos
  where tipo = 'cambio' and jugador_entra_id is not null
  union
  select jugador_id, partido_id
  from partido_titulares
)
select
  j.id                                                            as jugador_id,
  j.equipo_id,
  j.nombre,
  j.dorsal,
  extract(year from p.fecha)::smallint                            as temporada,
  count(distinct ev.partido_id)                                   as partidos_con_evento,
  count(*) filter (where ev.tipo in ('gol', 'gol_penal', 'gol_tiro_libre')) as goles,
  count(*) filter (where ev.tipo = 'autogol')                     as autogoles,
  count(*) filter (where ev.tipo = 'asistencia')                  as asistencias,
  count(*) filter (where ev.tipo = 'tarjeta_amarilla')            as amarillas,
  count(*) filter (where ev.tipo = 'tarjeta_roja')                as rojas,
  j.persona_id,
  count(*) filter (where ev.tipo = 'recuperacion')                as recuperaciones,
  count(*) filter (where ev.tipo = 'rechazo')                     as rechazos,
  count(*) filter (where ev.tipo = 'regate')                      as regates,
  count(*) filter (where ev.tipo = 'tiro_al_arco')                as tiros_al_arco,
  count(*) filter (where ev.tipo = 'falta_recibida')              as faltas_recibidas,
  count(*) filter (where ev.tipo = 'atajada')                     as atajadas,
  count(*) filter (where ev.tipo = 'penal_atajado')               as penales_atajados,
  count(distinct part.partido_id)                                 as partidos_jugados
from jugadores j
join participacion part
  on part.jugador_id = j.id
join partidos p
  on p.id = part.partido_id
left join eventos_validos ev
  on ev.jugador_id = j.id
  and ev.partido_id = part.partido_id
group by j.id, j.equipo_id, j.nombre, j.dorsal, extract(year from p.fecha), j.persona_id;
--> statement-breakpoint

-- `estadisticas_jugador_competencia` (0011): mismo ajuste, solo en "goles".
create or replace view estadisticas_jugador_competencia with (security_invoker = true) as
select
  j.id as jugador_id,
  j.equipo_id,
  j.nombre,
  j.dorsal,
  extract(year from p.fecha)::smallint as temporada,
  p.competencia_id,
  count(*) filter (where e.tipo in ('gol', 'gol_penal', 'gol_tiro_libre')) as goles
from jugadores j
join eventos e on e.jugador_id = j.id and e.eliminado_en is null
join partidos p on p.id = e.partido_id and p.estado = 'cerrado'
group by j.id, j.equipo_id, j.nombre, j.dorsal, extract(year from p.fecha), p.competencia_id;
