-- ------------------------------------------------------------
-- `jugadores.persona_id` ya existia en el esquema (para enlazar la misma
-- persona entre equipos) pero nunca se usaba en ningun lado del codigo. Esta
-- migracion la conecta: `estadisticas_jugador` gana la columna (create or
-- replace, misma definicion de siempre mas `persona_id`) para que la app
-- pueda detectar, entre filas ya traidas por equipo, cuales comparten
-- persona y sumarlas en memoria (`EstadisticasHandler.totalesPorPersona`) sin
-- una consulta cruzada nueva. Sin coalesce aqui a proposito: la app necesita
-- distinguir "tiene vinculo" de "no tiene", no solo un id para agrupar.
-- `persona_id` va al final de la lista de columnas porque `create or replace
-- view` en Postgres solo permite agregar columnas nuevas al final, no
-- insertarlas en medio de las existentes.
--
-- (Una version anterior de esta migracion tambien creaba una vista aparte
-- `estadisticas_persona` que agregaba a nivel de base de datos. Se saco:
-- ningun consumidor la usaba, la suma en memoria de arriba es la unica que
-- se ejercita — dos implementaciones de la misma cuenta es peor que una.)
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
