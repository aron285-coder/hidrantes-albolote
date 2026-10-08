-- docs/24 RV-101, DEC-144: bocas de riego de 45, 70 u "otra medida" (entera, de 20 a 150 mm), que se
-- aprueba tal cual. Sin diámetro, 45 (la app anterior no lo manda, 04 §12). El hidrante no cambia.
-- Todo dentro de una transacción que se deshace.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;

select plan(32);

insert into hidrantes.config (clave, valor, actualizado_por)
values ('codigo_acceso_hash', to_jsonb(extensions.crypt('482917', extensions.gen_salt('bf', 4))), 'test')
on conflict (clave) do update set valor = excluded.valor;
insert into hidrantes.config (clave, valor, actualizado_por) values ('escala_radios', '[11, 9, 7, 5.5, 5]', 'test')
on conflict (clave) do update set valor = excluded.valor;
select set_config('test.token',
  (select token from hidrantes.fn_verificar_codigo('482917', 'dddddddd-0000-4000-8000-0000000e2901', 'ip-diametro')), true);
-- Tokens de más de 24 h: el tope de un token nuevo (0041, docs/32 RV-221) se prueba en 37.
update hidrantes.dispositivos set emitido_en = now() - interval '2 days' where dispositivo_id in ('dddddddd-0000-4000-8000-0000000e2901');
insert into hidrantes.administradores (email, creado_por) values ('diametro@example.com', 'test') on conflict do nothing;

-- Propuesta de voluntario (sin sesión de jefatura), con su foto reservada. Devuelve el id.
create function pg_temp.proponer(clave text, op hidrantes.operacion, punto uuid, datos jsonb,
                                 lat double precision default null, lng double precision default null)
returns uuid language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  return (hidrantes.fn_proponer(current_setting('test.token'), clave, 'Ana', 'Ruiz', op, punto, datos,
            case when lat is not null then 'gps'::hidrantes.origen_ubicacion end, lat, lng,
            null, null, null, null, null,
            case when op <> 'datos' then hidrantes.fn_reservar_subida(current_setting('test.token')) end)
          ->> 'propuesta_id')::uuid;
end $$;

-- Jefatura aprueba y devuelve el diámetro con el que queda el punto.
create function pg_temp.aprobar(propuesta uuid, correcciones jsonb default null) returns smallint
language plpgsql as $$
declare
  punto uuid;
begin
  perform set_config('request.jwt.claims',
    '{"role":"authenticated","email":"diametro@example.com","amr":[{"method":"oauth","timestamp":1}],"app_metadata":{"provider":"google","providers":["google"]}}',
    true);
  punto := (hidrantes.fn_aprobar(propuesta, correcciones) ->> 'punto_id')::uuid;
  perform set_config('request.jwt.claims', '', true);
  return (select diametro_mm from hidrantes.puntos where id = punto);
end $$;

-- ---------- alta de boca ----------
select is(pg_temp.aprobar(pg_temp.proponer('diam-boca-45', 'alta', null,
  '{"tipo":"boca_riego","diametro_mm":45,"caudal":"bueno","racor":"granada"}', 37.2001, -3.6001)), 45::smallint,
  'boca de 45: aprobada con 45');
select isnt((select correcciones ->> 'punto_id' from hidrantes.propuestas where clave_local = 'diam-boca-45'), null,
  'un alta aprobada sin correcciones guarda el punto creado (Mis propuestas enseña su código)');
select is(pg_temp.aprobar(pg_temp.proponer('diam-boca-70', 'alta', null,
  '{"tipo":"boca_riego","diametro_mm":70,"caudal":"bueno","racor":"granada"}', 37.2011, -3.6011)), 70::smallint,
  'boca de 70: aprobada con 70');
select is(pg_temp.aprobar(pg_temp.proponer('diam-boca-32', 'alta', null,
  '{"tipo":"boca_riego","diametro_otro":32,"caudal":"bueno","racor":"barcelona"}', 37.2021, -3.6021)), 32::smallint,
  'boca con otra medida (32): aprobada tal cual, sin que jefatura la fije');
select is(pg_temp.aprobar(pg_temp.proponer('diam-boca-sin', 'alta', null,
  '{"tipo":"boca_riego","caudal":"bueno","racor":"granada"}', 37.2031, -3.6031)), 45::smallint,
  'boca sin diámetro (app anterior): 45');
select throws_like($$ select pg_temp.proponer('diam-boca-200', 'alta', null,
  '{"tipo":"boca_riego","diametro_otro":200,"caudal":"bueno","racor":"granada"}', 37.2041, -3.6041) $$,
  'PAYLOAD_INVALIDO(diametro_otro)%', 'boca con 200 mm: PAYLOAD_INVALIDO(diametro_otro)');
select throws_like($$ select pg_temp.proponer('diam-boca-dec', 'alta', null,
  '{"tipo":"boca_riego","diametro_otro":32.5,"caudal":"bueno","racor":"granada"}', 37.2041, -3.6041) $$,
  'PAYLOAD_INVALIDO(diametro_otro)%', 'boca con 32,5 mm: la otra medida es un número entero');
select throws_like($$ select pg_temp.proponer('diam-boca-100', 'alta', null,
  '{"tipo":"boca_riego","diametro_mm":100,"caudal":"bueno","racor":"granada"}', 37.2041, -3.6041) $$,
  'PAYLOAD_INVALIDO(diametro_mm)%', 'boca con diametro_mm 100: los botones de boca son 45 y 70');
select throws_like($$ select pg_temp.proponer('diam-boca-dos', 'alta', null,
  '{"tipo":"boca_riego","diametro_mm":70,"diametro_otro":32,"caudal":"bueno","racor":"granada"}', 37.2041, -3.6041) $$,
  'PAYLOAD_INVALIDO(diametro_otro)%', 'boca con las dos medidas a la vez: rechazada');

-- ---------- el hidrante no cambia ----------
select throws_like($$ select pg_temp.proponer('diam-hid-45', 'alta', null,
  '{"tipo":"hidrante","diametro_mm":45,"caudal":"bueno"}', 37.2051, -3.6051) $$,
  'PAYLOAD_INVALIDO(diametro_mm)%', 'hidrante con 45: sigue rechazado');
select set_config('test.hid_otro', pg_temp.proponer('diam-hid-otro', 'alta', null,
  '{"tipo":"hidrante","diametro_otro":80,"caudal":"bueno"}', 37.2061, -3.6061)::text, true);
select throws_like($$ select pg_temp.aprobar(current_setting('test.hid_otro')::uuid) $$,
  'DIAMETRO_SIN_FIJAR%', 'hidrante con otra medida: jefatura la fija antes de aprobar (FR-17)');
select is(pg_temp.aprobar(current_setting('test.hid_otro')::uuid, '{"diametro_mm":100}'), 100::smallint,
  'y fijada a 100, se aprueba');

-- ---------- el diámetro de una boca se conserva y se corrige ----------
select set_config('test.boca70', (select (correcciones ->> 'punto_id') from hidrantes.propuestas
                                    where clave_local = 'diam-boca-70'), true);
select is(pg_temp.aprobar(pg_temp.proponer('diam-rev-70', 'revision', current_setting('test.boca70')::uuid, '{}')),
  70::smallint, 'una revisión de una boca de 70 no la devuelve a 45');
select is(pg_temp.aprobar(pg_temp.proponer('diam-est-70', 'estado', current_setting('test.boca70')::uuid,
  '{"caudal":"regular"}')), 70::smallint, 'un cambio de estado tampoco');
select is(pg_temp.aprobar(pg_temp.proponer('diam-datos-90', 'datos', current_setting('test.boca70')::uuid,
  '{"diametro_otro":90}')), 90::smallint, 'corregir datos de una boca con otra medida (90): aprobada tal cual');
select is(pg_temp.aprobar(pg_temp.proponer('diam-datos-45', 'datos', current_setting('test.boca70')::uuid,
  '{"diametro_mm":45}')), 45::smallint, 'corregir datos de una boca a 45');
select set_config('test.hid100', (select (correcciones ->> 'punto_id') from hidrantes.propuestas
                                    where clave_local = 'diam-hid-otro'), true);
select throws_like($$ select pg_temp.proponer('diam-datos-hid', 'datos', current_setting('test.hid100')::uuid,
  '{"diametro_otro":90}') $$,
  'PAYLOAD_INVALIDO(diametro_otro)%', 'corregir datos de un hidrante con otra medida: rechazado');

-- Edición directa de jefatura (FR-151): cambiar el racor no toca el diámetro.
select set_config('request.jwt.claims',
  '{"role":"authenticated","email":"diametro@example.com","amr":[{"method":"oauth","timestamp":1}],"app_metadata":{"provider":"google","providers":["google"]}}',
  true);
select hidrantes.fn_editar_punto(current_setting('test.boca70')::uuid, '{"diametro_mm":70}');
select hidrantes.fn_editar_punto(current_setting('test.boca70')::uuid, '{"racor":"barcelona"}');
select is((select diametro_mm from hidrantes.puntos where id = current_setting('test.boca70')::uuid), 70::smallint,
  'fn_editar_punto conserva los 70 de una boca al cambiarle el racor');

select throws_like($$ select hidrantes.fn_editar_punto(current_setting('test.boca70')::uuid, '{"diametro_mm":151}') $$,
  'PAYLOAD_INVALIDO(puntos_diametro_boca)%', 'fn_editar_punto con una boca de 151: PAYLOAD_INVALIDO, no un error crudo');
select throws_like($$ select hidrantes.fn_editar_punto(current_setting('test.boca70')::uuid, '{"diametro_mm":"99999"}') $$,
  'PAYLOAD_INVALIDO%', 'fn_editar_punto con un número enorme: PAYLOAD_INVALIDO');

-- ---------- más casos de corregir datos y del alta ----------
select throws_like($$ select pg_temp.proponer('diam-datos-h45', 'datos', current_setting('test.hid100')::uuid,
  '{"diametro_mm":45}') $$,
  'PAYLOAD_INVALIDO(diametro_mm)%', 'corregir datos de un hidrante a 45: rechazado al proponer');
select throws_like($$ select pg_temp.proponer('diam-datos-txt', 'datos', current_setting('test.boca70')::uuid,
  '{"diametro_otro":"32"}') $$,
  'PAYLOAD_INVALIDO(diametro_otro)%', 'una otra medida en texto: rechazada');
select throws_like($$ select pg_temp.proponer('diam-boca-null', 'alta', null,
  '{"tipo":"boca_riego","diametro_mm":null,"caudal":"bueno","racor":"granada"}', 37.2071, -3.6071) $$,
  'PAYLOAD_INVALIDO(diametro_mm)%', 'un diametro_mm null explícito: rechazado');
select is(pg_temp.aprobar(pg_temp.proponer('diam-boca-corr', 'alta', null,
  '{"tipo":"boca_riego","diametro_otro":32,"caudal":"bueno","racor":"granada"}', 37.2081, -3.6081),
  '{"diametro_mm":70}'), 70::smallint, 'la corrección de jefatura gana a la otra medida propuesta');

-- Una pendiente de antes de 0032 con un número que no cabe: el lote la omite con su código y sigue.
insert into hidrantes.propuestas (id, operacion, datos, autor_nombre, autor_apellido, dispositivo_id, clave_local,
                                  origen_ubicacion, geom, foto_path)
values ('00000000-0000-4000-8000-0000000e2911', 'alta', '{"tipo":"boca_riego","diametro_otro":1e6,"caudal":"bueno","racor":"granada"}',
        'Ana', 'Ruiz', gen_random_uuid(), 'diam-vieja-enorme', 'gps', 'SRID=4326;POINT(-3.6091 37.2091)', 'fotos/v.jpg');
select set_config('request.jwt.claims',
  '{"role":"authenticated","email":"diametro@example.com","amr":[{"method":"oauth","timestamp":1}],"app_metadata":{"provider":"google","providers":["google"]}}',
  true);
select is((select resultado || ':' || motivo from hidrantes.fn_aprobar_lote(array['00000000-0000-4000-8000-0000000e2911'::uuid])),
  'omitida:PAYLOAD_INVALIDO(datos)', 'una otra medida enorme de antes: el lote la omite con PAYLOAD_INVALIDO');

-- ---------- fusión ----------
insert into hidrantes.puntos (id, codigo, tipo, geom, diametro_mm, caudal, racor, foto_path, municipio, fecha_ultima_revision)
values ('00000000-0000-4000-8000-0000000e2921', 'BOC-8292', 'boca_riego', 'SRID=4326;POINT(-3.6201 37.2201)', 45, 'bueno',
        'granada', 'fotos/f1.jpg', 'albolote', current_date),
       ('00000000-0000-4000-8000-0000000e2922', 'HID-8293', 'hidrante', 'SRID=4326;POINT(-3.6211 37.2211)', 70, 'bueno',
        null, 'fotos/f2.jpg', 'albolote', current_date);
insert into hidrantes.propuestas (id, operacion, datos, autor_nombre, autor_apellido, dispositivo_id, clave_local,
                                  origen_ubicacion, geom, foto_path)
values ('00000000-0000-4000-8000-0000000e2931', 'alta', '{"tipo":"boca_riego","diametro_otro":32,"caudal":"bueno","racor":"granada"}',
        'Ana', 'Ruiz', gen_random_uuid(), 'diam-fusion-boca', 'gps', 'SRID=4326;POINT(-3.6201 37.2201)', 'fotos/f3.jpg'),
       ('00000000-0000-4000-8000-0000000e2932', 'alta', '{"tipo":"hidrante","diametro_otro":80,"caudal":"bueno"}',
        'Ana', 'Ruiz', gen_random_uuid(), 'diam-fusion-hid', 'gps', 'SRID=4326;POINT(-3.6211 37.2211)', 'fotos/f4.jpg');
select hidrantes.fn_fusionar_con_existente('00000000-0000-4000-8000-0000000e2931', '00000000-0000-4000-8000-0000000e2921',
  '{"diametro_mm":"propuesta"}');
select is((select diametro_mm from hidrantes.puntos where id = '00000000-0000-4000-8000-0000000e2921'), 32::smallint,
  'fusión con el diámetro de la propuesta: la otra medida de la boca (32)');
select throws_like($$ select hidrantes.fn_fusionar_con_existente('00000000-0000-4000-8000-0000000e2932',
  '00000000-0000-4000-8000-0000000e2922', '{"diametro_mm":"propuesta"}') $$,
  'DIAMETRO_SIN_FIJAR%', 'fusión de un hidrante con otra medida eligiendo su diámetro: DIAMETRO_SIN_FIJAR, no se ignora');

-- ---------- las altas aprobadas de antes ----------
select is((select count(*)::int from hidrantes.propuestas r
            where r.operacion = 'alta' and r.estado = 'aprobada' and r.correcciones is null
              and exists (select 1 from hidrantes.registro g where g.propuesta_id = r.id
                             and g.accion in ('aprobacion', 'aprobacion_con_correcciones') and g.punto_id is not null)),
  0, 'ninguna alta aprobada se queda sin su punto en correcciones si el registro lo sabe');

-- ---------- restricción y tamaño del marcador ----------
select throws_ok($$ insert into hidrantes.puntos (codigo, tipo, geom, diametro_mm, caudal, racor, foto_path, municipio,
                                                  fecha_ultima_revision)
                    values ('BOC-8291', 'boca_riego', 'SRID=4326;POINT(-3.6 37.2)', 151, 'bueno', 'granada', 'fotos/x.jpg',
                            'albolote', current_date) $$,
  '23514', null, 'puntos_diametro_boca: una boca de más de 150 mm no cabe');
-- escala_radios por defecto [11, 9, 7, 5.5, 5]: factor 1 → 7, 2 → 9, 3 → 11.
select is(hidrantes.fn_radio_px(32::smallint, 'bueno'), 7::numeric, 'fn_radio_px: 32 mm cuenta como 45 (factor 1)');
select is(hidrantes.fn_radio_px(70::smallint, 'bueno'), 9::numeric, 'fn_radio_px: 70 mm, factor 2');
select is(hidrantes.fn_radio_px(90::smallint, 'bueno'), 11::numeric, 'fn_radio_px: 90 mm cuenta como 100 (factor 3)');

select * from finish();
rollback;
