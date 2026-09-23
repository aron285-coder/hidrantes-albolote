-- docs/18 RV-42: un punto que vuelve a funcionar pierde la nota de fallo. Todo dentro de una
-- transacción que se deshace.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;

select plan(3);

insert into hidrantes.administradores (email, creado_por) values ('fallo@example.com', 'test') on conflict do nothing;
select set_config('request.jwt.claims',
  '{"role":"authenticated","email":"fallo@example.com","amr":[{"method":"oauth","timestamp":1}],"app_metadata":{"provider":"google","providers":["google"]}}',
  true);
insert into hidrantes.puntos (id, codigo, tipo, geom, diametro_mm, caudal, descripcion_fallo, foto_path, municipio,
                              fecha_ultima_revision)
values ('00000000-0000-4000-8000-0000000e4401', 'HID-8401', 'hidrante', 'SRID=4326;POINT(-3.6581 37.2321)', 100,
        'no_funciona', 'Tapa soldada', 'fotos/n.jpg', 'albolote', current_date);

set local role authenticated;
select lives_ok($$ select hidrantes.fn_editar_punto('00000000-0000-4000-8000-0000000e4401', '{"caudal":"bueno"}') $$,
  'jefatura lo pasa de no funciona a bueno');
reset role;
select is((select descripcion_fallo from hidrantes.puntos where id = '00000000-0000-4000-8000-0000000e4401'), null,
  'y la nota de fallo se borra');

set local role authenticated;
select hidrantes.fn_editar_punto('00000000-0000-4000-8000-0000000e4401',
  '{"caudal":"no_funciona","descripcion_fallo":"Sin presión"}');
reset role;
select is((select descripcion_fallo from hidrantes.puntos where id = '00000000-0000-4000-8000-0000000e4401'),
  'Sin presión', 'si vuelve a no funcionar, lleva la nota nueva');

select * from finish();
rollback;
