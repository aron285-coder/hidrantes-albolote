-- docs/18 RV-41, DEC-090: el tipo de un punto no se cambia una vez creado. Se corrige retirándolo y
-- dando de alta el correcto. En un alta sí se corrige: aún no hay código. Todo dentro de una
-- transacción que se deshace.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;

select plan(7);

insert into hidrantes.config (clave, valor, actualizado_por)
values ('codigo_acceso_hash', to_jsonb(extensions.crypt('482917', extensions.gen_salt('bf', 4))), 'test')
on conflict (clave) do update set valor = excluded.valor;
select set_config('test.token',
  (select token from hidrantes.fn_verificar_codigo('482917', 'dddddddd-0000-4000-8000-0000000e0041', 'ip-tipo')), true);
insert into hidrantes.administradores (email, creado_por) values ('tipo@example.com', 'test') on conflict do nothing;

insert into hidrantes.puntos (id, codigo, tipo, geom, diametro_mm, caudal, foto_path, municipio, fecha_ultima_revision)
values ('00000000-0000-4000-8000-0000000e4101', 'HID-8301', 'hidrante', 'SRID=4326;POINT(-3.6571 37.2311)', 100,
        'bueno', 'fotos/t.jpg', 'albolote', current_date);

-- ---------- voluntario: corregir datos ----------
select set_config('request.jwt.claims', '', true);
select throws_like($$
  select hidrantes.fn_proponer(current_setting('test.token'), 'tipo-0001-distinto', 'Ana', 'Ruiz', 'datos',
    '00000000-0000-4000-8000-0000000e4101', '{"tipo":"boca_riego","racor":"granada"}',
    null, null, null, null, null, null, null, null, null) $$,
  'TIPO_NO_MODIFICABLE%', 'corregir datos con un tipo distinto da TIPO_NO_MODIFICABLE');
select lives_ok($$
  select hidrantes.fn_proponer(current_setting('test.token'), 'tipo-0002-igual', 'Ana', 'Ruiz', 'datos',
    '00000000-0000-4000-8000-0000000e4101', '{"tipo":"hidrante","diametro_mm":70}',
    null, null, null, null, null, null, null, null, null) $$,
  'con el mismo tipo entra (el frontend anterior lo manda siempre, 04 §12)');

-- ---------- jefatura ----------
select set_config('request.jwt.claims',
  '{"role":"authenticated","email":"tipo@example.com","amr":[{"method":"oauth","timestamp":1}],"app_metadata":{"provider":"google","providers":["google"]}}',
  true);
set local role authenticated;
select throws_like($$ select hidrantes.fn_editar_punto('00000000-0000-4000-8000-0000000e4101',
  '{"tipo":"boca_riego","racor":"granada"}') $$,
  'TIPO_NO_MODIFICABLE%', 'fn_editar_punto con un tipo distinto da TIPO_NO_MODIFICABLE');
reset role;

-- Un alta sí se corrige de tipo al aprobar: el código sale del tipo final.
insert into hidrantes.propuestas (id, operacion, datos, autor_nombre, autor_apellido, dispositivo_id, clave_local,
                                  origen_ubicacion, geom, foto_path)
values ('00000000-0000-4000-8000-0000000e4201', 'alta', '{"tipo":"hidrante","diametro_mm":100,"caudal":"bueno"}',
        'Ana', 'Ruiz', gen_random_uuid(), 'tipo-alta-01', 'gps', 'SRID=4326;POINT(-3.6600 37.2400)', 'fotos/ta.jpg');
set local role authenticated;
select lives_ok($$ select hidrantes.fn_aprobar('00000000-0000-4000-8000-0000000e4201',
  '{"tipo":"boca_riego","racor":"granada"}') $$, 'aprobar un alta corrigiendo el tipo, entra');
reset role;
select matches((select p.codigo from hidrantes.puntos p join hidrantes.propuestas r on (r.correcciones ->> 'punto_id')::uuid = p.id
                 where r.id = '00000000-0000-4000-8000-0000000e4201'),
  '^BOC-', 'y el punto nace como boca de riego, con su código BOC');

-- Una propuesta pendiente de antes de 0023 que cambia el tipo: el lote la omite con el código.
insert into hidrantes.propuestas (id, punto_id, operacion, datos, autor_nombre, autor_apellido, dispositivo_id,
                                  clave_local)
values ('00000000-0000-4000-8000-0000000e4301', '00000000-0000-4000-8000-0000000e4101', 'datos',
        '{"tipo":"boca_riego","racor":"barcelona"}', 'Ana', 'Ruiz', gen_random_uuid(), 'tipo-vieja-01');
set local role authenticated;
select is((select resultado || ':' || motivo from hidrantes.fn_aprobar_lote(array['00000000-0000-4000-8000-0000000e4301'::uuid])),
  'omitida:TIPO_NO_MODIFICABLE', 'fn_aprobar_lote omite una pendiente antigua que cambia el tipo');
reset role;
select is((select tipo::text from hidrantes.puntos where id = '00000000-0000-4000-8000-0000000e4101'), 'hidrante',
  'y el punto sigue siendo un hidrante');

select * from finish();
rollback;
