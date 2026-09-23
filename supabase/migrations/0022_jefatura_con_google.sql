-- 0022 · Jefatura solo con una sesión de Google (docs/18 RV-36, DEC-094).
--
-- fn_es_admin() y fn_email_jwt() aceptaban a cualquier usuario de Supabase Auth cuyo JWT trajera un
-- `email` de `administradores`. El proyecto de Supabase es también el de la app de uniformidad: si
-- permite registrarse con correo y contraseña sin confirmación, alguien podía darse de alta con el
-- correo de un administrador que aún no hubiera entrado con Google y tener jefatura completa.
--
-- Ahora, además del correo:
--   · `app_metadata.providers` contiene 'google'. app_metadata solo lo escribe el servidor de Auth.
--   · la sesión actual es de OAuth: alguna entrada de `amr` con method = 'oauth'. `amr` dice cómo se
--     abrió **esta** sesión; una con contraseña trae 'password' aunque el usuario tenga Google.
--
-- fn_email_jwt() devuelve null si no se cumple: fn_exigir_admin, la rama de jefatura de
-- fn_proponer, las políticas de RLS y las Functions (que preguntan a fn_es_admin) quedan cubiertas a
-- la vez. Mismas firmas (04 §12).

create or replace function hidrantes.fn_email_jwt() returns text
language sql stable set search_path = pg_catalog as $$
  select case
    when coalesce(c.j -> 'app_metadata' -> 'providers', '[]'::jsonb) ? 'google'
     and exists (select 1
                   from jsonb_array_elements(case when jsonb_typeof(c.j -> 'amr') = 'array' then c.j -> 'amr'
                                                  else '[]'::jsonb end) x
                  where x ->> 'method' = 'oauth')
    then lower(c.j ->> 'email')
  end
  from (select nullif(nullif(current_setting('request.jwt.claims', true), ''), 'null')::jsonb as j) c;
$$;

create or replace function hidrantes.fn_es_admin() returns boolean
language sql stable security definer set search_path = pg_catalog, hidrantes as $$
  select exists (
    select 1
    from hidrantes.administradores a
    where a.activo
      and a.email = hidrantes.fn_email_jwt()
  );
$$;
