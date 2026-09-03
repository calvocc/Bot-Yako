-- Fija el search_path de las funciones del trigger de marcador.
--
-- Sin esto, el search_path lo decide quien invoca la función: alguien que pueda
-- crear objetos en un esquema que aparezca antes que `public` podría suplantar
-- un tipo o una tabla y alterar cómo se calcula el marcador. Es exactamente lo
-- que reporta el advisor de Supabase (`function_search_path_mutable`).
--
-- Se fija a `public, pg_temp` porque ambas funciones referencian tipos y tablas
-- de `public` sin calificar.

alter function equipo_que_suma(tipo_evento, equipo_origen_evento)
  set search_path = public, pg_temp;
--> statement-breakpoint

alter function actualizar_marcador_partido()
  set search_path = public, pg_temp;
