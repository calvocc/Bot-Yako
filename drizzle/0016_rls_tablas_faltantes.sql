-- ============================================================
-- RLS deny-all en las tablas que quedaron fuera de 0001.
--
-- `competencias`, `partido_titulares`, `invitaciones_jugador`,
-- `invitaciones_jugador_canjes` y `usuarios_jugadores` se crearon en
-- migraciones posteriores a 0001 (C10) y nunca recibieron el mismo
-- `enable row level security` -- el advisor de seguridad de Supabase las
-- marcaba como "RLS Disabled in Public": expuestas via PostgREST a
-- anon/authenticated sin ninguna restriccion.
--
-- Mismo criterio que 0001: el backend accede por conexion directa (dueña de
-- las tablas), asi que RLS sin policies no le afecta -- solo cierra el
-- acceso publico via PostgREST. Deliberadamente sin FORCE ROW LEVEL
-- SECURITY, por la misma razon que ahi.
-- ============================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'competencias', 'partido_titulares',
    'invitaciones_jugador', 'invitaciones_jugador_canjes',
    'usuarios_jugadores'
  ] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;
