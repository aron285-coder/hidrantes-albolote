-- Fusión de un alta con un punto existente (FR-106, docs/17 RV-18): la descripción también se elige,
-- y si prevalece la ubicación de la propuesta, municipio y núcleo se recalculan.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;

select plan(5);

insert into hidrantes.administradores (email, creado_por) values ('fusion@example.com', 'test') on conflict do nothing;
select set_config('request.jwt.claims', '{"role":"authenticated","email":"fusion@example.com","amr":[{"method":"oauth","timestamp":1}],"app_metadata":{"provider":"google","providers":["google"]}}', true);

-- Un hidrante en Albolote y dos altas: una igual de sitio con otra descripción, otra con el pin en
-- Calicasas (las coordenadas del seed de BOC-9001).
insert into hidrantes.puntos (id, codigo, tipo, geom, diametro_mm, caudal, foto_path, municipio, nucleo,
                              fecha_ultima_revision, descripcion, direccion)
values ('00000000-0000-4000-8000-0000000d0001', 'HID-8201', 'hidrante', 'SRID=4326;POINT(-3.6569 37.2308)', 100,
        'bueno', 'fotos/f.jpg', 'albolote', 'Albolote', current_date - 30, 'Descripción vieja', 'Calle Vieja 1');
insert into hidrantes.propuestas (id, operacion, datos, autor_nombre, autor_apellido, dispositivo_id, clave_local,
                                  origen_ubicacion, geom, foto_path, direccion_sugerida)
values
  ('00000000-0000-4000-8000-0000000d0101', 'alta',
   '{"tipo":"hidrante","diametro_mm":100,"caudal":"bueno","descripcion":"Junto a la farmacia"}', 'Ana', 'Pérez',
   gen_random_uuid(), 'fusion-1', 'gps', 'SRID=4326;POINT(-3.6569 37.2308)', 'fotos/fa.jpg', null),
  ('00000000-0000-4000-8000-0000000d0102', 'alta',
   '{"tipo":"hidrante","diametro_mm":100,"caudal":"bueno"}', 'Ana', 'Pérez',
   gen_random_uuid(), 'fusion-2', 'gps', 'SRID=4326;POINT(-3.618400 37.273500)', 'fotos/fb.jpg', 'Plaza de la Iglesia');

set local role authenticated;
select lives_ok($$ select hidrantes.fn_fusionar_con_existente('00000000-0000-4000-8000-0000000d0101',
  '00000000-0000-4000-8000-0000000d0001', '{"descripcion":"propuesta"}') $$, 'se puede elegir la descripción');
reset role;
select is((select descripcion from hidrantes.puntos where id = '00000000-0000-4000-8000-0000000d0001'),
  'Junto a la farmacia', 'fusionar con descripcion=propuesta copia la descripción');

set local role authenticated;
select hidrantes.fn_fusionar_con_existente('00000000-0000-4000-8000-0000000d0102',
  '00000000-0000-4000-8000-0000000d0001', '{"ubicacion":"propuesta"}');
reset role;
select is((select municipio::text from hidrantes.puntos where id = '00000000-0000-4000-8000-0000000d0001'),
  'calicasas', 'fusionar con ubicacion=propuesta a un punto de Calicasas cambia el municipio');
select isnt((select nucleo from hidrantes.puntos where id = '00000000-0000-4000-8000-0000000d0001'),
  'Albolote', 'y el núcleo');
select is((select direccion from hidrantes.puntos where id = '00000000-0000-4000-8000-0000000d0001'),
  'Plaza de la Iglesia', 'y la dirección es la sugerida para el sitio nuevo');

select * from finish();
rollback;
