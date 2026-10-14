-- El código de acceso de staging (docs/35 RV-411, DEC-200). Lo ejecuta deploy-staging.yml después del
-- seed, con el secreto CODIGO_STAGING del environment staging:
--
--   psql -X -q -v ON_ERROR_STOP=1 -v codigo="$CODIGO_STAGING" -f scripts/sql/codigo-staging.sql "$BD"
--
-- El código no se escribe en el repositorio ni en la salida. Solo cambia el de la base si es el de
-- pruebas de la CI o uno que puso el propio seed o este script (CODIGO_STAGING regenerado). Uno que haya
-- puesto jefatura desde Ajustes (el del piloto) no se toca nunca. Al cambiarlo revoca los móviles de
-- staging, como «Cambiar código» con «revocar todos», pero sin abrir la entrada (DEC-201).
-- Idempotente: con el código ya puesto no hace nada.

\set ON_ERROR_STOP on

\if :{?codigo}
\else
  do $$ begin raise exception 'codigo-staging.sql: falta el código (psql -v codigo=<seis cifras>)'; end $$;
\endif
select :'codigo' ~ '^[0-9]{6}$' as codigo_valido \gset
\if :codigo_valido
\else
  do $$ begin raise exception 'codigo-staging.sql: el código de acceso son seis cifras'; end $$;
\endif
-- Al bloque de abajo, por un ajuste de esta sesión: dentro de `do $$ … $$` psql no sustituye variables.
select set_config('hidrantes.codigo_staging', :'codigo', false) is not null as codigo_pasado \gset

begin;

do $$
declare
  actor constant text := 'despliegue-staging';
  nuevo constant text := current_setting('hidrantes.codigo_staging');
  hash text;
  por text;
  revocados integer;
begin
  -- Bloqueo de la fila (05 §11): ni Ajustes ni otro despliegue lo cambian a la vez.
  select c.valor #>> '{}' into hash from hidrantes.config c where c.clave = 'codigo_acceso_hash' for update;
  if hash is null then
    raise exception 'codigo-staging.sql: no hay codigo_acceso_hash; se carga antes supabase/seed-staging.sql';
  end if;
  if extensions.crypt(nuevo, hash) = hash then
    raise notice 'Código de staging: ya está puesto';
    return;
  end if;
  select c.valor #>> '{}' into por from hidrantes.config c where c.clave = 'codigo_acceso_cambiado_por';
  if extensions.crypt('000000', hash) <> hash and coalesce(por, '') not in ('seed', actor) then
    raise notice 'Código de staging: lo ha puesto jefatura; no se toca';
    return;
  end if;

  insert into hidrantes.config (clave, valor, actualizado_por) values
    ('codigo_acceso_hash', to_jsonb(extensions.crypt(nuevo, extensions.gen_salt('bf', 10))), actor),
    ('codigo_acceso', to_jsonb(nuevo), actor),
    ('codigo_acceso_cambiado_en', to_jsonb(now()), actor),
    ('codigo_acceso_cambiado_por', to_jsonb(actor), actor)
  on conflict (clave) do update set valor = excluded.valor, actualizado_por = excluded.actualizado_por;
  -- El código nunca va al registro: solo el hecho (11).
  perform hidrantes.fn_registrar(actor, null, true, 'codigo_cambiado', null, null, null,
                                 jsonb_build_object('revocar_dispositivos', true));
  update hidrantes.dispositivos set revocado_en = now() where revocado_en is null;
  get diagnostics revocados = row_count;
  perform hidrantes.fn_registrar(actor, null, true, 'dispositivos_revocados', null, null, null,
                                 jsonb_build_object('dispositivos', revocados));
  raise notice 'Código de staging: cambiado; % móviles revocados', revocados;
end $$;

commit;
