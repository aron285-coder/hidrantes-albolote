-- docs/35 RV-411: prueba de scripts/sql/codigo-staging.sql. Solo en la CI (ci-sql), contra el Supabase
-- local efímero, después del seed con el código de pruebas. Con `-v paso=…`:
--   antes      un móvil activo, para ver que se revoca;
--   cambiado   el código es el de `-v codigo`, puesto por el despliegue, sin móviles activos y con un
--              solo «codigo_cambiado» (la segunda pasada no hace nada);
--   jefatura   simula que jefatura pone el suyo desde Ajustes;
--   intacto    el de jefatura sigue igual tras otra pasada;
--   deshacer   vuelve a dejar el código de pruebas para los pasos siguientes de la CI.
-- Los códigos de esta prueba son de la CI, no el de staging.

\set ON_ERROR_STOP on
select set_config('prueba.codigo', :'codigo', false) is not null as codigo_pasado \gset

\if :{?paso}
\else
  do $$ begin raise exception 'probar-codigo-staging.sql: falta -v paso'; end $$;
\endif

select :'paso' = 'antes' as es_antes, :'paso' = 'cambiado' as es_cambiado,
       :'paso' = 'jefatura' as es_jefatura, :'paso' = 'intacto' as es_intacto,
       :'paso' = 'deshacer' as es_deshacer \gset

\if :es_antes
insert into hidrantes.dispositivos (dispositivo_id, token_hash)
values ('5eed0000-0000-4000-8000-0000000c0de1', 'prueba-rv411-' || gen_random_uuid());
\elif :es_cambiado
do $$
declare
  hash text := (select valor #>> '{}' from hidrantes.config where clave = 'codigo_acceso_hash');
begin
  if extensions.crypt(current_setting('prueba.codigo'), hash) <> hash then
    raise exception 'RV-411: el código de staging no se ha puesto';
  end if;
  if extensions.crypt('000000', hash) = hash then
    raise exception 'RV-411: sigue el código de pruebas';
  end if;
  if (select valor #>> '{}' from hidrantes.config where clave = 'codigo_acceso_cambiado_por') <> 'despliegue-staging' then
    raise exception 'RV-411: el cambio no consta como del despliegue';
  end if;
  if exists (select 1 from hidrantes.dispositivos where revocado_en is null) then
    raise exception 'RV-411: quedan móviles sin revocar';
  end if;
  if (select count(*) from hidrantes.registro where actor = 'despliegue-staging' and accion = 'codigo_cambiado') <> 1 then
    raise exception 'RV-411: la segunda pasada ha vuelto a cambiar el código';
  end if;
  if exists (select 1 from hidrantes.administradores where creado_por = 'seed' and activo) then
    raise exception 'RV-411: hay administradores del seed activos';
  end if;
end $$;
\elif :es_jefatura
update hidrantes.config set valor = to_jsonb(extensions.crypt(current_setting('prueba.codigo'), extensions.gen_salt('bf', 4)))
 where clave = 'codigo_acceso_hash';
update hidrantes.config set valor = '"jefatura.ci@example.com"' where clave = 'codigo_acceso_cambiado_por';
\elif :es_intacto
do $$
declare
  hash text := (select valor #>> '{}' from hidrantes.config where clave = 'codigo_acceso_hash');
begin
  if extensions.crypt(current_setting('prueba.codigo'), hash) <> hash then
    raise exception 'RV-411: el despliegue ha pisado el código de jefatura';
  end if;
end $$;
\elif :es_deshacer
update hidrantes.config set valor = to_jsonb(extensions.crypt(current_setting('prueba.codigo'), extensions.gen_salt('bf', 4)))
 where clave = 'codigo_acceso_hash';
update hidrantes.config set valor = '"seed"' where clave = 'codigo_acceso_cambiado_por';
delete from hidrantes.config where clave = 'codigo_acceso';
\else
  do $$ begin raise exception 'probar-codigo-staging.sql: paso desconocido'; end $$;
\endif
