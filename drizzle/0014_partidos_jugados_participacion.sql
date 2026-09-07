-- ------------------------------------------------------------
-- "Partidos jugados" de estadisticas_jugador (columna partidos_con_evento)
-- solo contaba partidos con al menos un evento individual propio (gol,
-- tarjeta, recuperacion, etc.). Un jugador que jugo un partido cargado post
-- partido sin anotar ni ver tarjeta no sumaba ese partido a sus
-- estadisticas, aunque estuviera marcado como participante en
-- partido_titulares -- ver cargar.flujo.ts, paso "participantes-post", que
-- ahora exige elegir ahi a quienes jugaron antes de poder cargar goleadores
-- y tarjetas.
--
-- Se agrega partidos_jugados: cuenta partidos donde el jugador tuvo un
-- evento propio, entro por cambio, o esta en partido_titulares -- mismo
-- criterio de "quien jugo" que ya usa AlineacionService.participantesDe
-- para el resumen del partido. partidos_con_evento se deja tal cual (mismo
-- calculo de siempre, por si algo fuera de la app ya lo consulta directo);
-- la app (estadisticas.service.ts) pasa a leer la columna nueva.
--
-- Mismo patron que 0009/0013: `create or replace view`, mismas columnas de
-- siempre en el mismo orden, la columna nueva al final -- Postgres no
-- permite insertarla en medio de una vista existente.
-- ------------------------------------------------------------

create or replace view estadisticas_jugador with (security_invoker = true) as
with eventos_validos as (
  select *
  from eventos
  where eliminado_en is null
),
participacion as (
  -- Un renglon por (jugador, partido) en el que participo: evento propio,
  -- entrar por cambio (el `jugador_id` de un evento `cambio` es quien sale,
  -- no quien entra -- ver eventos.jugador_entra_id), o estar en
  -- partido_titulares.
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
  j.id                                                  as jugador_id,
  j.equipo_id,
  j.nombre,
  j.dorsal,
  extract(year from p.fecha)::smallint                  as temporada,
  count(distinct ev.partido_id)                         as partidos_con_evento,
  count(*) filter (where ev.tipo = 'gol')                as goles,
  count(*) filter (where ev.tipo = 'autogol')            as autogoles,
  count(*) filter (where ev.tipo = 'asistencia')         as asistencias,
  count(*) filter (where ev.tipo = 'tarjeta_amarilla')   as amarillas,
  count(*) filter (where ev.tipo = 'tarjeta_roja')       as rojas,
  j.persona_id,
  count(*) filter (where ev.tipo = 'recuperacion')       as recuperaciones,
  count(*) filter (where ev.tipo = 'rechazo')            as rechazos,
  count(*) filter (where ev.tipo = 'regate')             as regates,
  count(*) filter (where ev.tipo = 'tiro_al_arco')       as tiros_al_arco,
  count(*) filter (where ev.tipo = 'falta_recibida')     as faltas_recibidas,
  count(*) filter (where ev.tipo = 'atajada')            as atajadas,
  count(*) filter (where ev.tipo = 'penal_atajado')      as penales_atajados,
  count(distinct part.partido_id)                       as partidos_jugados
from jugadores j
join participacion part
  on part.jugador_id = j.id
join partidos p
  on p.id = part.partido_id
left join eventos_validos ev
  on ev.jugador_id = j.id
  and ev.partido_id = part.partido_id
group by j.id, j.equipo_id, j.nombre, j.dorsal, extract(year from p.fecha), j.persona_id;
