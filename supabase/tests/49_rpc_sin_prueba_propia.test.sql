-- docs/39 RV-526: las dos RPC que solo salían en las listas de permisos, llamadas de verdad.
-- · fn_guardar_direccion_sugerida: solo jefatura; guarda en una propuesta pendiente (recortada, '' → null, 300 como
--   mucho) y no toca otras ni las ya decididas.
-- · fn_borrar_suscripcion_push: con un token válido borra solo las suscripciones de ese móvil.
-- Todo dentro de una transacción que se deshace.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;

select plan(12);

insert into hidrantes.administradores (email, creado_por) values ('jefa-rv526@example.com', 'test') on conflict do nothing;
update hidrantes.administradores set usuario_id = md5(email)::uuid, vinculado_en = now() where email = 'jefa-rv526@example.com';

create function pg_temp.como_admin(email text) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'role', 'authenticated', 'sub', md5(lower(email))::uuid, 'email', email,
    'amr', jsonb_build_array(jsonb_build_object('method', 'oauth', 'timestamp', 1)),
    'app_metadata', jsonb_build_object('provider', 'google', 'providers', jsonb_build_array('google')))::text, true);
$$;

-- Un punto y tres propuestas: dos pendientes y una aprobada.
insert into hidrantes.puntos (id, codigo, tipo, geom, diametro_mm, caudal, foto_path, municipio, fecha_ultima_revision)
values ('00000000-0000-4000-8000-0000000052a1', 'HID-8526', 'hidrante', 'SRID=4326;POINT(-3.656 37.231)', 70, 'bueno',
        'fotos/rv526.jpg', 'albolote', current_date - 30);
insert into hidrantes.propuestas (id, punto_id, operacion, datos, autor_nombre, autor_apellido, dispositivo_id,
                                  clave_local, foto_path, estado)
values
  ('00000000-0000-4000-8000-0000000052b1', '00000000-0000-4000-8000-0000000052a1', 'revision', '{}', 'Prueba', 'Uno',
   gen_random_uuid(), 'rv526-1', 'fotos/r1.jpg', 'pendiente'),
  ('00000000-0000-4000-8000-0000000052b2', '00000000-0000-4000-8000-0000000052a1', 'revision', '{}', 'Prueba', 'Dos',
   gen_random_uuid(), 'rv526-2', 'fotos/r2.jpg', 'pendiente'),
  ('00000000-0000-4000-8000-0000000052b3', '00000000-0000-4000-8000-0000000052a1', 'revision', '{}', 'Prueba', 'Tres',
   gen_random_uuid(), 'rv526-3', 'fotos/r3.jpg', 'aprobada');

create function pg_temp.direccion(p text) returns text language sql as $$
  select r.direccion_sugerida from hidrantes.propuestas r where r.id = p::uuid;
$$;

-- ---------- fn_guardar_direccion_sugerida ----------

select set_config('request.jwt.claims', '', true);
select throws_like($$select hidrantes.fn_guardar_direccion_sugerida('00000000-0000-4000-8000-0000000052b1', 'Calle Real 1')$$,
  'NO_AUTORIZADO%', 'sin ser jefatura, no');

select pg_temp.como_admin('jefa-rv526@example.com');
select lives_ok($$select hidrantes.fn_guardar_direccion_sugerida('00000000-0000-4000-8000-0000000052b1', '  Calle Real 1  ')$$,
  'jefatura la guarda');
select is(pg_temp.direccion('00000000-0000-4000-8000-0000000052b1'), 'Calle Real 1', 'recortada');
select is(pg_temp.direccion('00000000-0000-4000-8000-0000000052b2'), null, 'la otra propuesta no se toca');
select hidrantes.fn_guardar_direccion_sugerida('00000000-0000-4000-8000-0000000052b1', '   ');
select is(pg_temp.direccion('00000000-0000-4000-8000-0000000052b1'), null, 'en blanco se queda sin dirección');
select hidrantes.fn_guardar_direccion_sugerida('00000000-0000-4000-8000-0000000052b1', repeat('x', 400));
select is(length(pg_temp.direccion('00000000-0000-4000-8000-0000000052b1')), 300, 'como mucho 300 caracteres');
select hidrantes.fn_guardar_direccion_sugerida('00000000-0000-4000-8000-0000000052b3', 'Calle Nueva 2');
select is(pg_temp.direccion('00000000-0000-4000-8000-0000000052b3'), null, 'una propuesta ya decidida no cambia');
select set_config('request.jwt.claims', '', true);

-- ---------- fn_borrar_suscripcion_push ----------

insert into hidrantes.dispositivos (dispositivo_id, token_hash) values
  ('00000000-0000-4000-8000-0000000052c1', hidrantes.fn_sha256('token-rv526-uno-de-prueba')),
  ('00000000-0000-4000-8000-0000000052c2', hidrantes.fn_sha256('token-rv526-dos-de-prueba'));
insert into hidrantes.suscripciones_push (dispositivo_id, email, suscripcion, temas) values
  ('00000000-0000-4000-8000-0000000052c1', null,
   '{"endpoint": "https://fcm.googleapis.com/fcm/send/rv526-1", "keys": {"p256dh": "p", "auth": "a"}}', '{resultado_propuesta}'),
  ('00000000-0000-4000-8000-0000000052c2', null,
   '{"endpoint": "https://fcm.googleapis.com/fcm/send/rv526-2", "keys": {"p256dh": "p", "auth": "a"}}', '{resultado_propuesta}'),
  (null, 'jefa-rv526@example.com',
   '{"endpoint": "https://fcm.googleapis.com/fcm/send/rv526-3", "keys": {"p256dh": "p", "auth": "a"}}', '{nuevas_propuestas}');

select throws_like($$select hidrantes.fn_borrar_suscripcion_push('token-que-no-existe-rv526')$$,
  'TOKEN_INVALIDO%', 'con un token que no vale, error');
select lives_ok($$select hidrantes.fn_borrar_suscripcion_push('token-rv526-uno-de-prueba')$$, 'con su token, bien');
select is((select count(*)::int from hidrantes.suscripciones_push where dispositivo_id = '00000000-0000-4000-8000-0000000052c1'),
  0, 'borra las de ese móvil');
select is((select count(*)::int from hidrantes.suscripciones_push where dispositivo_id = '00000000-0000-4000-8000-0000000052c2'),
  1, 'las de otro móvil se quedan');
select is((select count(*)::int from hidrantes.suscripciones_push where email = 'jefa-rv526@example.com'), 1,
  'y las de jefatura, también');

select * from finish();
rollback;
