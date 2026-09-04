-- ------------------------------------------------------------
-- Estadisticas de una persona sumadas a traves de todos los equipos en los
-- que juega, para /stats cuando un jugador tiene ficha en mas de un equipo
-- de la misma academia.
--
-- `jugadores.persona_id` ya existia en el esquema (para enlazar la misma
-- persona entre equipos) pero nunca se usaba en ningun lado del codigo. Esta
-- vista es la primera consumidora real: agrupa por
-- `coalesce(persona_id, id)`, asi que un jugador sin vinculo (la inmensa
-- mayoria hoy) sigue viendose como su propia persona de un solo equipo, sin
-- ningun cambio de comportamiento.
--
-- Ademas se amplia `estadisticas_jugador` (create or replace, misma
-- definicion de siempre mas la columna `persona_id`) para que la app pueda
-- detectar, entre filas ya traidas por equipo, cuales comparten persona y
-- sumarlas en memoria sin una consulta cruzada nueva. Sin coalesce aqui a
-- proposito: la app necesita distinguir "tiene vinculo" de "no tiene", no
-- solo un id para agrupar. `persona_id` va al final de la lista de columnas
-- porque `create or replace view` en Postgres solo permite agregar columnas
-- nuevas al final, no insertarlas en medio de las existentes.
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
  j.persona_id
from jugadores j
join eventos e
  on e.jugador_id = j.id
  and e.eliminado_en is null
join partidos p
  on p.id = e.partido_id
group by j.id, j.equipo_id, j.nombre, j.dorsal, extract(year from p.fecha), j.persona_id;

create view estadisticas_persona with (security_invoker = true) as
select
  coalesce(j.persona_id, j.id)                          as persona_id,
  min(j.nombre)                                          as nombre,
  extract(year from p.fecha)::smallint                  as temporada,
  count(distinct j.equipo_id)                           as equipos,
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
group by coalesce(j.persona_id, j.id), extract(year from p.fecha);
