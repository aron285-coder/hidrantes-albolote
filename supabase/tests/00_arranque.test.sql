-- Preparación de la base de datos (DEC-052): rol de migraciones y extensiones.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;

select plan(7);

select has_extension('postgis', 'PostGIS instalado');
select has_extension('pg_cron', 'pg_cron instalado');
select has_role('hidrantes_migrador', 'existe el rol de migraciones');
select is(
  (select pg_get_userbyid(nspowner) from pg_namespace where nspname = 'hidrantes')::text,
  'hidrantes_migrador',
  'hidrantes_migrador es propietario del esquema hidrantes'
);
select ok(
  not has_schema_privilege('hidrantes_migrador', 'public', 'CREATE'),
  'hidrantes_migrador no puede crear objetos en public'
);
select has_table('hidrantes', 'migraciones_aplicadas', 'existe el historial propio de migraciones');
select ok(
  not exists (select 1 from pg_tables where schemaname = 'public' and tableowner = 'hidrantes_migrador'),
  'hidrantes_migrador no es propietario de nada en public'
);

select * from finish();
rollback;
