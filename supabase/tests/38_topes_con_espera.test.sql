-- 0042 (docs/32 RV-220, #535): los errores de fn_reservar_subida dicen hasta cuándo esperar
-- ('CODIGO: maximo=<n> reintentar_en_s=<s>'), y la medida del espacio no se queda en 0 sin avisar.
-- Todo dentro de una transacción que se deshace.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;

select plan(10);

insert into hidrantes.config (clave, valor, actualizado_por)
values ('codigo_acceso_hash', to_jsonb(extensions.crypt('482917', extensions.gen_salt('bf', 4))), 'test')
on conflict (clave) do update set valor = excluded.valor;
select set_config('request.jwt.claims', '', true);
select set_config('test.ta', (select token from hidrantes.fn_verificar_codigo('482917', 'a3800000-0000-4000-8000-0000000e3801', 'ip-38-a')), true);
select set_config('test.tb', (select token from hidrantes.fn_verificar_codigo('482917', 'b3800000-0000-4000-8000-0000000e3802', 'ip-38-b')), true);
update hidrantes.config set valor = '1000' where clave = 'max_subidas_dia_total';

-- El mensaje y el detail de un error, unidos con '|'.
create function pg_temp.error_de(sentencia text) returns text language plpgsql as $$
declare
  m text;
  d text;
begin
  execute sentencia;
  return null;
exception when others then
  get stacked diagnostics m = message_text, d = pg_exception_detail;
  return m || '|' || coalesce(d, '');
end $$;

-- ---------- la cuota del móvil ----------

insert into hidrantes.subidas (dispositivo_id, foto_path, reservada_en)
select 'a3800000-0000-4000-8000-0000000e3801', 'fotos/a38-' || i || '.jpg', now() - interval '3 hours'
from generate_series(1, (hidrantes.fn_config('max_subidas_dispositivo_dia', '80') #>> '{}')::int) i;
select set_config('test.e1', coalesce(pg_temp.error_de($$ select hidrantes.fn_reservar_subida(current_setting('test.ta')) $$), ''), true);
select ok(current_setting('test.e1') ~ ('^CUOTA_SUBIDAS_AGOTADA: maximo=' || (hidrantes.fn_config('max_subidas_dispositivo_dia', '80') #>> '{}')
                                        || ' reintentar_en_s=[0-9]+ ambito=dispositivo\|'),
  'la cuota del móvil: CUOTA_SUBIDAS_AGOTADA con maximo, reintentar_en_s y ambito=dispositivo (sobre 0041: sin números)');
select is(substring(current_setting('test.e1') from 'reintentar_en_s=([0-9]+)')::int, 21 * 3600,
  'y espera a que su reserva más antigua de las últimas 24 h cumpla 24 h');
select is(split_part(current_setting('test.e1'), '|', 2)::jsonb ->> 'ambito', 'dispositivo', 'el detail lleva lo mismo en JSON');

-- ---------- la cuota del grupo ----------

insert into hidrantes.subidas (dispositivo_id, foto_path, reservada_en, confirmada_en)
values ('b3800000-0000-4000-8000-0000000e3802', 'fotos/b38-conf.jpg', now() - interval '20 hours', now() - interval '20 hours');
update hidrantes.config set valor = to_jsonb(hidrantes.fn_subidas_contadas()) where clave = 'max_subidas_dia_total';
select set_config('test.e2', coalesce(pg_temp.error_de($$ select hidrantes.fn_reservar_subida(current_setting('test.tb')) $$), ''), true);
select ok(current_setting('test.e2') ~ '^CUOTA_SUBIDAS_AGOTADA: maximo=[0-9]+ reintentar_en_s=[0-9]+ ambito=grupo\|',
  'la cuota del grupo: CUOTA_SUBIDAS_AGOTADA con ambito=grupo');
select ok(substring(current_setting('test.e2') from 'reintentar_en_s=([0-9]+)')::int between 1 and 4 * 3600,
  'y espera a que la primera que cuenta deje de contar (aquí, la confirmada de hace 20 h)');
update hidrantes.config set valor = '1000' where clave = 'max_subidas_dia_total';

-- ---------- sin espacio ----------

update hidrantes.config set valor = '1' where clave = 'max_bytes_fotos';
select is(coalesce(pg_temp.error_de($$ select hidrantes.fn_reservar_subida(current_setting('test.tb')) $$), ''),
  'SIN_ESPACIO_FOTOS: maximo=1 reintentar_en_s=3600|{"maximo": 1, "reintentar_en_s": 3600}',
  'SIN_ESPACIO_FOTOS con maximo (bytes) y una hora de espera');
update hidrantes.config set valor = '838860800' where clave = 'max_bytes_fotos';

-- ---------- la medida del espacio ----------

select set_config('test.b0', hidrantes.fn_espacio() ->> 'fotos_bytes', true);
insert into storage.objects (bucket_id, name, metadata) values ('hidrantes-fotos-dev', 'fotos/t38-sin-tamano.jpg', '{}');
select is((hidrantes.fn_espacio() ->> 'fotos_bytes')::bigint, current_setting('test.b0')::bigint + 5242880,
  'un archivo sin tamaño legible cuenta como 5 MB, no como 0');
select ok(hidrantes.fn_espacio() ->> 'fotos_medidos_en' is not null, 'fn_espacio dice de cuándo es la medida');

insert into hidrantes.config (clave, valor, actualizado_por) values ('storage_bytes', '12345', 'test')
on conflict (clave) do update set valor = excluded.valor;
drop policy hidrantes_migrador_mide_fotos on storage.objects;
select is(hidrantes.fn_espacio() - 'fotos_medidos_en' - 'reservas_abiertas' - 'fotos_reservado_bytes' - 'bd_bytes'
            - 'max_bytes_fotos' - 'max_bytes_bd' - 'aviso',
  '{"fotos_bytes": 12345, "fotos_origen": "respaldo"}'::jsonb,
  'sin la política, el bucket no sale "vacío": se usa config.storage_bytes y fotos_origen lo dice');
select ok(hidrantes.fn_espacio() ->> 'fotos_medidos_en' is not null, 'con la fecha de esa medida');

select * from finish();
rollback;
