-- Preparación de la base de datos para el esquema hidrantes (DEC-052).
--
-- Se ejecuta como `postgres`, UNA vez por entorno, desde `scripts/arranque.ts`
-- (y desde `scripts/migrar.ts --local` contra el Supabase local). Idempotente.
-- Es lo único que necesita privilegios que el rol de migraciones no tiene:
-- extensiones, creación del rol y permisos fuera del esquema hidrantes.
--
-- Requiere la variable psql `clave` con la contraseña de hidrantes_migrador:
--   \set clave '...'

\set ON_ERROR_STOP on

-- Extensiones de toda la instancia (04 §5: primero en dev, después en prod).
-- Solo si no existen: en Supabase, volver a lanzar create extension ejecuta sus scripts
-- posteriores, que revocan permisos y fallan si ya se concedieron a otros roles.
select 'create extension postgis with schema extensions'
where not exists (select 1 from pg_extension where extname = 'postgis')
\gexec
select 'create extension pg_cron'
where not exists (select 1 from pg_extension where extname = 'pg_cron')
\gexec
-- Rol de migraciones: propietario de hidrantes, sin privilegios en public.
select format('create role hidrantes_migrador login password %L', :'clave')
where not exists (select 1 from pg_roles where rolname = 'hidrantes_migrador')
\gexec
select format('alter role hidrantes_migrador login password %L', :'clave')
\gexec

-- En Supabase `postgres` no es superusuario: para darle a hidrantes_migrador la propiedad del
-- esquema necesita ser miembro de ese rol (lo puede hacer porque lo ha creado).
select format('grant hidrantes_migrador to %I', current_user)
where not pg_has_role(current_user, 'hidrantes_migrador', 'SET')
\gexec

alter role hidrantes_migrador set search_path = hidrantes, extensions;
alter role hidrantes_migrador set statement_timeout = '5min';

create schema if not exists hidrantes authorization hidrantes_migrador;
alter schema hidrantes owner to hidrantes_migrador;
grant usage on schema hidrantes to anon, authenticated, service_role;

-- Lo que las migraciones y las RPC necesitan fuera de hidrantes.
grant usage on schema extensions to hidrantes_migrador;
grant usage on schema cron to hidrantes_migrador;
grant execute on all functions in schema cron to hidrantes_migrador;
grant select on cron.job, cron.job_run_details to hidrantes_migrador;

-- No se concede nada en el esquema auth (propiedad de supabase_auth_admin; postgres no puede).
-- Las RPC leen el JWT con current_setting('request.jwt.claims', true), que no lo necesita.

-- El historial de migraciones (hidrantes.migraciones_aplicadas) lo crea migrar.ts ya como
-- hidrantes_migrador, para que el propietario sea ese rol.

-- Comprobación: el rol no puede tocar public.
do $$
begin
  if has_schema_privilege('hidrantes_migrador', 'public', 'CREATE') then
    raise exception 'hidrantes_migrador no debe poder crear objetos en public';
  end if;
end $$;
