-- Sincronización del móvil (05 §10, docs/17 RV-06): las bajas de puntos ya purgados y la época de
-- los datos.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;

select plan(6);

-- docs/18 RV-34: la época existe desde la migración. Con null en todos los móviles, la primera
-- restauración pasaba de null a un valor y la regla "la primera época no fuerza nada" la ignoraba.
select isnt(hidrantes.fn_config('epoca_datos', 'null') #>> '{}', null, 'epoca_datos existe y no es null tras migrar');

insert into hidrantes.config (clave, valor, actualizado_por)
values ('codigo_acceso_hash', to_jsonb(extensions.crypt('482917', extensions.gen_salt('bf', 4))), 'test')
on conflict (clave) do update set valor = excluded.valor;
select set_config('test.token',
  (select token from hidrantes.fn_verificar_codigo('482917', 'dddddddd-0000-4000-8000-0000000000d1', 'ip-sinc')), true);

-- Un punto borrado hace 31 días (fuera del plazo de la papelera) y otro borrado ayer.
insert into hidrantes.puntos (id, codigo, tipo, geom, diametro_mm, caudal, foto_path, municipio, fecha_ultima_revision,
                              situacion, borrado_en)
values
  ('00000000-0000-4000-8000-0000000a0001', 'HID-0801', 'hidrante', 'SRID=4326;POINT(-3.6100 37.2150)', 100, 'bueno',
   'fotos/s1.jpg', 'albolote', current_date, 'borrado', now() - interval '31 days'),
  ('00000000-0000-4000-8000-0000000a0002', 'HID-0802', 'hidrante', 'SRID=4326;POINT(-3.6110 37.2160)', 70, 'bueno',
   'fotos/s2.jpg', 'albolote', current_date, 'borrado', now() - interval '1 day');

select ok(hidrantes.fn_purgar_papelera_interna('test') >= 1, 'la purga borra el punto de hace 31 días');
select is((select count(*)::int from hidrantes.puntos where id = '00000000-0000-4000-8000-0000000a0001'), 0,
  'la fila ya no existe');

select set_config('test.listado',
  hidrantes.fn_listar_puntos(current_setting('test.token'), now() - interval '40 days')::text, true);

select ok(current_setting('test.listado')::jsonb -> 'bajas' ? '00000000-0000-4000-8000-0000000a0001',
  'un móvil que no sincronizó entre el borrado y la purga recibe la baja del punto purgado');
select is(
  (select count(*)::int from jsonb_array_elements_text(current_setting('test.listado')::jsonb -> 'bajas') e),
  (select count(distinct e)::int from jsonb_array_elements_text(current_setting('test.listado')::jsonb -> 'bajas') e),
  'bajas no repite ids');
select ok(current_setting('test.listado')::jsonb -> 'config' ? 'epoca_datos', 'config trae epoca_datos');

select * from finish();
rollback;
