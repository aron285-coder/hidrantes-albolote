-- docs/29 RV-120, DEC-169, DEC-170: enganche "Directo" (0037) y mover el punto desde Editar (0038).
-- Todo dentro de una transacción que se deshace.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;

select plan(24);

-- ---------- zona de prueba: Albolote con dos núcleos a ~4,8 km ----------
delete from hidrantes.nucleos;
delete from hidrantes.limite_municipal;
insert into hidrantes.limite_municipal (municipio, geom, version) values
  ('albolote', 'SRID=4326;MULTIPOLYGON(((-3.70 37.20,-3.60 37.20,-3.60 37.30,-3.70 37.30,-3.70 37.20)))', 'test');
insert into hidrantes.nucleos (nombre, municipio, geom, version) values
  ('Albolote', 'albolote', 'SRID=4326;POINT(-3.6569 37.2308)', 'test'),
  ('Pretel',   'albolote', 'SRID=4326;POINT(-3.6300 37.2700)', 'test');
insert into hidrantes.administradores (email, creado_por) values ('mover@example.com', 'test') on conflict do nothing;

insert into hidrantes.puntos (id, codigo, tipo, geom, diametro_mm, caudal, racor, foto_path, municipio, nucleo,
                              fecha_ultima_revision, actualizado_en)
values
  ('00000000-0000-4000-8000-0000000e3301', 'HID-8601', 'hidrante', 'SRID=4326;POINT(-3.6569 37.2308)', 100, 'bueno', null,
   'fotos/m1.jpg', 'albolote', 'Albolote', current_date - 30, now() - interval '5 days'),
  ('00000000-0000-4000-8000-0000000e3302', 'BOC-8601', 'boca_riego', 'SRID=4326;POINT(-3.6560 37.2310)', 45, 'bueno', 'granada',
   'fotos/m2.jpg', 'albolote', 'Albolote', current_date - 30, now() - interval '5 days'),
  ('00000000-0000-4000-8000-0000000e3303', 'BOC-8602', 'boca_riego', 'SRID=4326;POINT(-3.6550 37.2312)', 45, 'bueno', 'barcelona',
   'fotos/m3.jpg', 'albolote', 'Albolote', current_date - 30, now() - interval '5 days'),
  ('00000000-0000-4000-8000-0000000e3304', 'HID-8602', 'hidrante', 'SRID=4326;POINT(-3.6540 37.2314)', 70, 'bueno', null,
   'fotos/m4.jpg', 'albolote', 'Albolote', current_date - 30, now() - interval '5 days');

-- Una propuesta pendiente sobre el hidrante, de antes de la edición.
insert into hidrantes.propuestas (id, punto_id, operacion, datos, autor_nombre, autor_apellido, dispositivo_id,
                                  clave_local, foto_path, creada_en)
values ('00000000-0000-4000-8000-0000000e3311', '00000000-0000-4000-8000-0000000e3301', 'estado', '{"caudal":"malo"}',
        'Ana', 'Ruiz', 'dddddddd-0000-4000-8000-0000000e3301', 'mover-estado-01', 'fotos/pm1.jpg',
        now() - interval '1 hour');

create function pg_temp.jefatura() returns void language sql as $$
  select set_config('request.jwt.claims',
    '{"role":"authenticated","email":"mover@example.com","amr":[{"method":"oauth","timestamp":1}],"app_metadata":{"provider":"google","providers":["google"]}}',
    true);
$$;
select pg_temp.jefatura();

-- ---------- 0037 · Directo ----------
select is((select array_agg(e::text order by e) from unnest(enum_range(null::hidrantes.tipo_racor)) e),
  array['granada', 'barcelona', 'directo', 'otro'], 'tipo_racor tiene "directo", delante de otro');
select lives_ok($$ select hidrantes.fn_editar_punto('00000000-0000-4000-8000-0000000e3302', '{"racor":"directo"}') $$,
  'una boca acepta el enganche directo');
select is((select racor::text from hidrantes.puntos where id = '00000000-0000-4000-8000-0000000e3302'), 'directo',
  'y la boca queda con enganche directo');
select throws_like($$
  insert into hidrantes.puntos (codigo, tipo, geom, diametro_mm, caudal, racor, foto_path, municipio, fecha_ultima_revision)
  values ('HID-8699', 'hidrante', 'SRID=4326;POINT(-3.6530 37.2316)', 100, 'bueno', 'directo', 'fotos/m9.jpg', 'albolote',
          current_date) $$,
  '%puntos_racor_solo_boca%', 'un hidrante no lleva enganche, tampoco directo');
select is((select (despues ? 'desplazamiento_m') from hidrantes.registro
            where punto_id = '00000000-0000-4000-8000-0000000e3302' and accion = 'edicion_admin'),
  false, 'una edición sin lat/lng no deja desplazamiento_m');
select is((select st_astext(geom::geometry) from hidrantes.puntos where id = '00000000-0000-4000-8000-0000000e3302'),
  'POINT(-3.656 37.231)', 'y no mueve el punto');

-- ---------- 0038 · mover desde Editar ----------
select is((select desactualizada from hidrantes.v_cola_revision where id = '00000000-0000-4000-8000-0000000e3311'),
  false, 'antes de editar, la propuesta pendiente no está desactualizada');

select lives_ok($$ select hidrantes.fn_editar_punto('00000000-0000-4000-8000-0000000e3301',
                                                    '{"lat":37.2700,"lng":-3.6300,"caudal":"regular"}') $$,
  'jefatura mueve el hidrante desde Editar');
select is((select st_astext(geom::geometry) from hidrantes.puntos where id = '00000000-0000-4000-8000-0000000e3301'),
  'POINT(-3.63 37.27)', 'el punto tiene la ubicación nueva');
select is((select municipio::text || ' · ' || nucleo from hidrantes.puntos where id = '00000000-0000-4000-8000-0000000e3301'),
  'albolote · Pretel', 'un punto de Albolote movido a Pretel queda en Pretel');
select is((select caudal::text from hidrantes.puntos where id = '00000000-0000-4000-8000-0000000e3301'), 'regular',
  'y en la misma llamada se guardan los demás cambios');
select is((select (despues ->> 'desplazamiento_m')::numeric from hidrantes.registro
            where punto_id = '00000000-0000-4000-8000-0000000e3301' and accion = 'edicion_admin'),
  (select round(st_distance('SRID=4326;POINT(-3.6569 37.2308)'::geography,
                            'SRID=4326;POINT(-3.6300 37.2700)'::geography)::numeric, 1)),
  'el registro deja desplazamiento_m, redondeado a 0,1 m');
select ok((select (despues ->> 'desplazamiento_m')::numeric between 4000 and 6000 from hidrantes.registro
            where punto_id = '00000000-0000-4000-8000-0000000e3301' and accion = 'edicion_admin'),
  'el desplazamiento está en metros (unos 4,9 km)');
select is((select (antes ->> 'lat')::numeric || ' · ' || (despues ->> 'lat')::numeric from hidrantes.registro
            where punto_id = '00000000-0000-4000-8000-0000000e3301' and accion = 'edicion_admin'),
  '37.2308 · 37.27', 'antes y despues llevan la posición vieja y la nueva');
select is((select desactualizada from hidrantes.v_cola_revision where id = '00000000-0000-4000-8000-0000000e3311'),
  true, 'v_cola_revision marca desactualizada la propuesta anterior al cambio');

-- Mover y cambiar el enganche en la misma llamada: una sola entrada.
select lives_ok($$ select hidrantes.fn_editar_punto('00000000-0000-4000-8000-0000000e3303',
                                                    '{"lat":37.2320,"lng":-3.6545,"racor":"directo"}') $$,
  'mover una boca y cambiarle el enganche a la vez');
select is((select count(*)::int from hidrantes.registro
            where punto_id = '00000000-0000-4000-8000-0000000e3303' and accion = 'edicion_admin'),
  1, 'mover y cambiar el enganche deja una sola entrada en el registro');
select is((select (despues ->> 'racor') || ' · ' || (despues ? 'desplazamiento_m')::text from hidrantes.registro
            where punto_id = '00000000-0000-4000-8000-0000000e3303' and accion = 'edicion_admin'),
  'directo · true', 'esa entrada lleva el enganche nuevo y el desplazamiento');

-- Fuera de la zona habitual pero dentro de los límites: se acepta.
select lives_ok($$ select hidrantes.fn_editar_punto('00000000-0000-4000-8000-0000000e3304',
                                                    '{"lat":37.5,"lng":-3.0}') $$,
  'fuera de la zona habitual pero dentro de los límites: se acepta');
select is((select municipio::text || ' · ' || coalesce(nucleo, '-') from hidrantes.puntos
            where id = '00000000-0000-4000-8000-0000000e3304'),
  'fuera_de_zona · -', 'y queda fuera de zona, sin núcleo');

-- Errores.
select throws_like($$ select hidrantes.fn_editar_punto('00000000-0000-4000-8000-0000000e3302', '{"lat":37.2315}') $$,
  'PAYLOAD_INVALIDO(ubicacion)%', 'solo lat: PAYLOAD_INVALIDO(ubicacion)');
select throws_like($$ select hidrantes.fn_editar_punto('00000000-0000-4000-8000-0000000e3302',
                                                       '{"lat":40.1,"lng":-3.6}') $$,
  'PAYLOAD_INVALIDO(ubicacion)%', 'coordenadas fuera de los límites: PAYLOAD_INVALIDO(ubicacion)');
select throws_like($$ select hidrantes.fn_editar_punto('00000000-0000-4000-8000-0000000e3302',
                                                       '{"lat":"norte","lng":-3.6}') $$,
  'PAYLOAD_INVALIDO(ubicacion)%', 'una coordenada que no es número: PAYLOAD_INVALIDO(ubicacion)');

select set_config('request.jwt.claims', '', true);
select throws_like($$ select hidrantes.fn_editar_punto('00000000-0000-4000-8000-0000000e3302',
                                                       '{"lat":37.2315,"lng":-3.6555}') $$,
  'NO_AUTORIZADO%', 'sin sesión de administrador no se mueve nada');

select * from finish();
rollback;
