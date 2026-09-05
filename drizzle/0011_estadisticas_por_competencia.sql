-- ============================================================
-- Vistas de estadisticas desglosadas por competencia.
--
-- estadisticas_jugador/estadisticas_equipo (migracion 0001) agrupan solo
-- por temporada: se crearon antes de que existiera `competencias`
-- (migracion 0005) y nunca se actualizaron. No se tocan -- /stats <nombre>
-- y el bloque agregado de /tabla siguen necesitando el acumulado de toda
-- la temporada tal cual esta hoy. Estas vistas nuevas son aditivas, solo
-- para el desglose por campeonato de /tabla.
-- ============================================================

create view estadisticas_equipo_competencia with (security_invoker = true) as
with partidos_resueltos as (
  select
    p.equipo_id,
    extract(year from p.fecha)::smallint as temporada,
    p.competencia_id,
    coalesce(p.marcador_propio_confirmado, p.marcador_propio) as goles_favor,
    coalesce(p.marcador_rival_confirmado, p.marcador_rival) as goles_contra
  from partidos p
  where p.estado = 'cerrado'
)
select
  pr.equipo_id,
  pr.temporada,
  pr.competencia_id,
  c.nombre as competencia_nombre,
  count(*) as partidos_jugados,
  count(*) filter (where pr.goles_favor > pr.goles_contra) as ganados,
  count(*) filter (where pr.goles_favor = pr.goles_contra) as empatados,
  count(*) filter (where pr.goles_favor < pr.goles_contra) as perdidos,
  coalesce(sum(pr.goles_favor), 0) as goles_favor,
  coalesce(sum(pr.goles_contra), 0) as goles_contra
from partidos_resueltos pr
left join competencias c on c.id = pr.competencia_id
group by pr.equipo_id, pr.temporada, pr.competencia_id, c.nombre;
--> statement-breakpoint
-- Mismo criterio que estadisticas_jugador (migracion 0001), con
-- competencia_id sumado a la agrupacion. Solo trae goles: es lo unico que
-- necesita el goleador del desglose por campeonato.
--
-- A diferencia de estadisticas_jugador, esta SI filtra partidos cerrados:
-- el goleador de un campeonato se muestra junto al "partidos jugados" de
-- estadisticas_equipo_competencia (que ya cuenta solo cerrados), y sin este
-- filtro un gol de un partido todavia abierto podria aparecer sin que el
-- conteo de partidos de al lado lo respalde.
create view estadisticas_jugador_competencia with (security_invoker = true) as
select
  j.id as jugador_id,
  j.equipo_id,
  j.nombre,
  j.dorsal,
  extract(year from p.fecha)::smallint as temporada,
  p.competencia_id,
  count(*) filter (where e.tipo = 'gol') as goles
from jugadores j
join eventos e on e.jugador_id = j.id and e.eliminado_en is null
join partidos p on p.id = e.partido_id and p.estado = 'cerrado'
group by j.id, j.equipo_id, j.nombre, j.dorsal, extract(year from p.fecha), p.competencia_id;
