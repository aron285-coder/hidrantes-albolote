-- 0020 · La lista de fotos que la purga conserva, en una sola fila (docs/18 RV-33).
--
-- fn_fotos_referenciadas() devuelve `setof text` y PostgREST corta cualquier respuesta en
-- max_rows = 1.000 (supabase/config.toml y el valor por defecto de Supabase alojado), también la de
-- una RPC que devuelve un conjunto. Por encima de 1.000 fotos referenciadas la purga de los lunes
-- recibía una lista truncada, en orden arbitrario, y borraba como huérfanas fotos en uso.
--
-- La nueva devuelve un único jsonb con la lista y su total, que max_rows no toca; purgar-fotos.ts
-- comprueba que cuadran. La antigua se queda por compatibilidad con la versión anterior del
-- workflow (04 §12) y deja de usarse: obsoleta desde 0.5.0.

create function hidrantes.fn_fotos_referenciadas_lista() returns jsonb
language sql stable security definer set search_path = pg_catalog, hidrantes as $$
  select jsonb_build_object(
    'fotos', coalesce(jsonb_agg(f.foto_path order by f.foto_path), '[]'::jsonb),
    'total', count(*))
  from (select distinct foto_path from hidrantes.fn_fotos_referenciadas() foto_path
         where foto_path is not null and foto_path <> '') f;
$$;

-- Solo las Pages Functions y los workflows, como la antigua (CLAUDE.md §3, 11 §3).
revoke execute on function hidrantes.fn_fotos_referenciadas_lista() from public, anon, authenticated;
grant execute on function hidrantes.fn_fotos_referenciadas_lista() to service_role;
