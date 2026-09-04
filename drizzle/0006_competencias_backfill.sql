-- Backfill de competencias/0005: crea una fila en `competencias` por cada
-- valor distinto (recortado y en minusculas) que ya existia como texto libre
-- en `partidos.competencia`, agrupado por academia. "Liga" y "liga " quedan
-- fundidas en la misma fila via el indice unico de `competencias`.
--
-- El nombre que se guarda es el de la primera vez que se escribio esa
-- competencia (por fecha de creacion del partido); `creado_por` toma el autor
-- de ese primer partido, que es la atribucion mas honesta disponible: el
-- modelo anterior no tenia un "quien creo la competencia" real.
with normalizadas as (
  select
    e.academia_id,
    lower(trim(p.competencia)) as clave,
    p.competencia as nombre,
    p.creado_por,
    p.creado_en,
    row_number() over (
      partition by e.academia_id, lower(trim(p.competencia))
      order by p.creado_en asc
    ) as orden
  from partidos p
  join equipos e on e.id = p.equipo_id
  where p.competencia is not null and trim(p.competencia) <> ''
),
insertadas as (
  insert into competencias (academia_id, nombre, creado_por)
  select academia_id, trim(nombre), creado_por
  from normalizadas
  where orden = 1
  returning id, academia_id, lower(trim(nombre)) as clave
)
update partidos p
set competencia_id = i.id
from equipos e, insertadas i
where e.id = p.equipo_id
  and e.academia_id = i.academia_id
  and lower(trim(p.competencia)) = i.clave;
