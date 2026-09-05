-- ------------------------------------------------------------
-- Los 7 tipos de evento nuevos (migracion 0012: recuperacion, rechazo,
-- regate, tiro_al_arco, falta_recibida, atajada, penal_atajado) suman a
-- `estadisticas_jugador` con el mismo patron de 0009: `create or replace
-- view`, mismas columnas de siempre en el mismo orden, 7 columnas nuevas
-- al final (Postgres no permite insertarlas en medio). Mismo `group by` de
-- siempre -- no cambia el nivel de agregacion, solo se agregan mas
-- `count(*) filter (...)`.
--
-- Tiene que aplicarse en una corrida de `db:migrate` separada de la 0012
-- que agrega los valores del enum: Postgres no permite usar un valor de
-- enum recien agregado dentro de la misma transaccion en que se agrego, y
-- el migrador de drizzle-orm aplica todas las migraciones pendientes en una
-- sola transaccion.
-- ------------------------------------------------------------

create or replace view estadisticas_jugador with (security_invoker = true) as
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
  count(*) filter (where e.tipo = 'tarjeta_roja')       as rojas,
  j.persona_id,
  count(*) filter (where e.tipo = 'recuperacion')       as recuperaciones,
  count(*) filter (where e.tipo = 'rechazo')            as rechazos,
  count(*) filter (where e.tipo = 'regate')             as regates,
  count(*) filter (where e.tipo = 'tiro_al_arco')       as tiros_al_arco,
  count(*) filter (where e.tipo = 'falta_recibida')     as faltas_recibidas,
  count(*) filter (where e.tipo = 'atajada')            as atajadas,
  count(*) filter (where e.tipo = 'penal_atajado')      as penales_atajados
from jugadores j
join eventos e
  on e.jugador_id = j.id
  and e.eliminado_en is null
join partidos p
  on p.id = e.partido_id
group by j.id, j.equipo_id, j.nombre, j.dorsal, extract(year from p.fecha), j.persona_id;
