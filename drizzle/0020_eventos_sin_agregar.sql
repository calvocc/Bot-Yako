-- ------------------------------------------------------------
-- Tipos de evento que se cargan pero no se agregaban por jugador
-- (migracion 0017: tiro_afuera, pase, falta_cometida). Se suman a
-- `estadisticas_jugador` con el mismo patron de 0013/0018: `create or
-- replace view`, mismas columnas en el mismo orden, 3 columnas nuevas al
-- final (Postgres no permite insertarlas en medio). Mismo CTE de
-- participacion y mismo `group by` -- no cambia el nivel de agregacion.
-- ------------------------------------------------------------

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
  count(distinct part.partido_id)                                 as partidos_jugados,
  count(*) filter (where ev.tipo = 'tiro_afuera')                 as tiros_afuera,
  count(*) filter (where ev.tipo = 'pase')                        as pases,
  count(*) filter (where ev.tipo = 'falta_cometida')              as faltas_cometidas
from jugadores j
join participacion part
  on part.jugador_id = j.id
join partidos p
  on p.id = part.partido_id
left join eventos_validos ev
  on ev.jugador_id = j.id
  and ev.partido_id = part.partido_id
group by j.id, j.equipo_id, j.nombre, j.dorsal, extract(year from p.fecha), j.persona_id;
