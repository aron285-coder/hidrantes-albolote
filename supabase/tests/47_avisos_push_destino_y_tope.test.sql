-- docs/39 RV-515 (0050, DEC-218): avisos push, comprobaciones del destino y tope por móvil.
-- · el destino es https:// y una autoridad que es solo un host de la lista (sin usuario, contraseña ni puerto);
-- · como mucho 3 suscripciones por móvil y por correo de jefatura, con un solo tema el voluntario y sin repetidos;
-- · un móvil sin ningún token válido, y un administrador sin acceso, se quedan sin suscripciones;
-- · los avisos de jefatura van solo a administradores activos.
-- Todo dentro de una transacción que se deshace.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;

select plan(29);

-- ---------- datos de prueba ----------

insert into hidrantes.administradores (email, creado_por) values
  ('jefa-rv515@example.com', 'test'), ('otra-jefa-rv515@example.com', 'test')
on conflict do nothing;
update hidrantes.administradores set usuario_id = md5(email)::uuid, vinculado_en = now()
 where email in ('jefa-rv515@example.com', 'otra-jefa-rv515@example.com');
insert into hidrantes.dispositivos (dispositivo_id, token_hash) values
  ('00000000-0000-4000-8000-0000000051a1', hidrantes.fn_sha256('token-rv515-movil-uno')),
  ('00000000-0000-4000-8000-0000000051a2', hidrantes.fn_sha256('token-rv515-movil-dos')),
  -- El móvil tres tiene dos tokens: revocar uno no le quita las suscripciones.
  ('00000000-0000-4000-8000-0000000051a3', hidrantes.fn_sha256('token-rv515-movil-tres-a')),
  ('00000000-0000-4000-8000-0000000051a3', hidrantes.fn_sha256('token-rv515-movil-tres-b'));

create function pg_temp.sus(endpoint text) returns jsonb language sql as $$
  select jsonb_build_object('endpoint', endpoint, 'keys', jsonb_build_object('p256dh', 'p', 'auth', 'a'));
$$;
create function pg_temp.como_admin(email text) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'role', 'authenticated', 'sub', md5(lower(email))::uuid, 'email', email,
    'amr', jsonb_build_array(jsonb_build_object('method', 'oauth', 'timestamp', 1)),
    'app_metadata', jsonb_build_object('provider', 'google', 'providers', jsonb_build_array('google')))::text, true);
$$;
create function pg_temp.de_movil(d text) returns int language sql as $$
  select count(*)::int from hidrantes.suscripciones_push where dispositivo_id = d::uuid;
$$;
create function pg_temp.de_correo(e text) returns int language sql as $$
  select count(*)::int from hidrantes.suscripciones_push where email = e;
$$;

-- ---------- 1. el destino ----------

select throws_ok($$select hidrantes.fn_validar_suscripcion(pg_temp.sus('https://usuario@fcm.googleapis.com/fcm/send/x'))$$,
  'P0001', 'PAYLOAD_INVALIDO(suscripcion): Suscripción no válida', 'un destino con usuario se rechaza');
select throws_ok($$select hidrantes.fn_validar_suscripcion(pg_temp.sus('https://u:clave@fcm.googleapis.com/fcm/send/x'))$$,
  'P0001', 'PAYLOAD_INVALIDO(suscripcion): Suscripción no válida', 'uno con usuario y contraseña, también');
select throws_ok($$select hidrantes.fn_validar_suscripcion(pg_temp.sus('https://fcm.googleapis.com:8443/fcm/send/x'))$$,
  'P0001', 'PAYLOAD_INVALIDO(suscripcion): Suscripción no válida', 'uno con puerto, también');
select throws_ok($$select hidrantes.fn_validar_suscripcion(pg_temp.sus('https://push.example.org/x'))$$,
  'P0001', 'PAYLOAD_INVALIDO(suscripcion): Suscripción no válida', 'uno con un host fuera de la lista, también');
select throws_ok($$select hidrantes.fn_validar_suscripcion(pg_temp.sus('https://fcm.googleapis.com.example.org/x'))$$,
  'P0001', 'PAYLOAD_INVALIDO(suscripcion): Suscripción no válida', 'uno que solo empieza como uno de la lista, también');
select lives_ok($$select hidrantes.fn_validar_suscripcion(pg_temp.sus('https://fcm.googleapis.com/fcm/send/abc:def'))$$,
  'uno de la lista, bien (los «:» del camino no cuentan)');
select lives_ok($$select hidrantes.fn_validar_suscripcion(pg_temp.sus('https://updates.push.services.mozilla.com/wpush/v2/x'))$$,
  'Mozilla, bien');
select lives_ok($$select hidrantes.fn_validar_suscripcion(pg_temp.sus('https://web.push.apple.com/x'))$$, 'Apple, bien');

-- ---------- 2. tope y temas ----------

select throws_ok($$select hidrantes.fn_guardar_suscripcion_push('token-rv515-movil-uno',
    pg_temp.sus('https://fcm.googleapis.com/fcm/send/rv515-t'), array['resultado_propuesta', 'resultado_propuesta'])$$,
  'P0001', 'PAYLOAD_INVALIDO(temas): Tema no admitido', 'un tema repetido se rechaza');
select throws_ok($$select hidrantes.fn_guardar_suscripcion_push('token-rv515-movil-uno',
    pg_temp.sus('https://fcm.googleapis.com/fcm/send/rv515-t'), array['resultado_propuesta', 'nuevas_propuestas'])$$,
  'P0001', 'PAYLOAD_INVALIDO(temas): Tema no admitido', 'dos temas, también');

select set_config('test.s1', hidrantes.fn_guardar_suscripcion_push('token-rv515-movil-uno',
  pg_temp.sus('https://fcm.googleapis.com/fcm/send/rv515-1'), array['resultado_propuesta'])::text, true);
update hidrantes.suscripciones_push set creada_en = now() - interval '3 hours' where id = current_setting('test.s1')::uuid;
select set_config('test.s2', hidrantes.fn_guardar_suscripcion_push('token-rv515-movil-uno',
  pg_temp.sus('https://fcm.googleapis.com/fcm/send/rv515-2'), null)::text, true);
update hidrantes.suscripciones_push set creada_en = now() - interval '2 hours' where id = current_setting('test.s2')::uuid;
select set_config('test.s3', hidrantes.fn_guardar_suscripcion_push('token-rv515-movil-uno',
  pg_temp.sus('https://fcm.googleapis.com/fcm/send/rv515-3'), null)::text, true);
update hidrantes.suscripciones_push set creada_en = now() - interval '1 hour' where id = current_setting('test.s3')::uuid;
select is(pg_temp.de_movil('00000000-0000-4000-8000-0000000051a1'), 3, 'tres suscripciones de un móvil, bien');
select set_config('test.s4', hidrantes.fn_guardar_suscripcion_push('token-rv515-movil-uno',
  pg_temp.sus('https://fcm.googleapis.com/fcm/send/rv515-4'), null)::text, true);
select is(pg_temp.de_movil('00000000-0000-4000-8000-0000000051a1'), 3, 'la cuarta deja tres');
select ok(not exists (select 1 from hidrantes.suscripciones_push where id = current_setting('test.s1')::uuid),
  'la que se va es la más vieja');
select ok(exists (select 1 from hidrantes.suscripciones_push where id = current_setting('test.s4')::uuid),
  'y la nueva se queda');

select pg_temp.como_admin('jefa-rv515@example.com');
select throws_ok($$select hidrantes.fn_guardar_suscripcion_push_admin(
    pg_temp.sus('https://fcm.googleapis.com/fcm/send/rv515-a'), array['nuevas_propuestas', 'nuevas_propuestas'])$$,
  'P0001', 'PAYLOAD_INVALIDO(temas): Tema no admitido', 'jefatura: un tema repetido se rechaza');
select hidrantes.fn_guardar_suscripcion_push_admin(pg_temp.sus('https://fcm.googleapis.com/fcm/send/rv515-a' || i),
  array['nuevas_propuestas', 'resumen_semanal']) from generate_series(1, 4) i;
select is(pg_temp.de_correo('jefa-rv515@example.com'), 3, 'jefatura: como mucho tres por correo');
select set_config('request.jwt.claims', '', true);

-- ---------- 3. sin acceso, sin suscripciones ----------

select hidrantes.fn_guardar_suscripcion_push('token-rv515-movil-dos', pg_temp.sus('https://fcm.googleapis.com/fcm/send/rv515-d'), null);
select hidrantes.fn_guardar_suscripcion_push('token-rv515-movil-tres-a', pg_temp.sus('https://fcm.googleapis.com/fcm/send/rv515-t3'), null);

-- La tarea de los tokens sin uso hace un update de revocado_en, como fn_revocar_dispositivo y fn_revocar_desde.
update hidrantes.dispositivos set revocado_en = now() where dispositivo_id = '00000000-0000-4000-8000-0000000051a2';
select is(pg_temp.de_movil('00000000-0000-4000-8000-0000000051a2'), 0, 'un móvil sin ningún token válido se queda sin suscripciones');
update hidrantes.dispositivos set revocado_en = now() where token_hash = hidrantes.fn_sha256('token-rv515-movil-tres-a');
select is(pg_temp.de_movil('00000000-0000-4000-8000-0000000051a3'), 1, 'un móvil con otro token válido conserva las suyas');

select pg_temp.como_admin('jefa-rv515@example.com');
select is(hidrantes.fn_revocar_dispositivo('00000000-0000-4000-8000-0000000051a1'), 1, 'fn_revocar_dispositivo revoca');
select is(pg_temp.de_movil('00000000-0000-4000-8000-0000000051a1'), 0, 'y el móvil se queda sin suscripciones');
update hidrantes.dispositivos set revocado_en = null where dispositivo_id = '00000000-0000-4000-8000-0000000051a1';
select hidrantes.fn_guardar_suscripcion_push('token-rv515-movil-uno', pg_temp.sus('https://fcm.googleapis.com/fcm/send/rv515-r'), null);
select hidrantes.fn_revocar_desde(now() - interval '1 day');
select is(pg_temp.de_movil('00000000-0000-4000-8000-0000000051a1'), 0, 'fn_revocar_desde, también');
update hidrantes.dispositivos set revocado_en = null where dispositivo_id = '00000000-0000-4000-8000-0000000051a1';
select hidrantes.fn_guardar_suscripcion_push('token-rv515-movil-uno', pg_temp.sus('https://fcm.googleapis.com/fcm/send/rv515-c'), null);
select hidrantes.fn_cambiar_codigo_acceso('482917', true, false);
select is(pg_temp.de_movil('00000000-0000-4000-8000-0000000051a1'), 0, 'cambiar el código revocando, también');

-- Jefatura: quitar el acceso borra sus suscripciones.
select hidrantes.fn_guardar_suscripcion_push_admin(pg_temp.sus('https://fcm.googleapis.com/fcm/send/rv515-j'), array['nuevas_propuestas']);
select pg_temp.como_admin('otra-jefa-rv515@example.com');
select hidrantes.fn_guardar_suscripcion_push_admin(pg_temp.sus('https://fcm.googleapis.com/fcm/send/rv515-o'),
  array['nuevas_propuestas', 'resumen_semanal']);
select pg_temp.como_admin('jefa-rv515@example.com');
select hidrantes.fn_gestionar_administrador('otra-jefa-rv515@example.com', false);
select is(pg_temp.de_correo('otra-jefa-rv515@example.com'), 0, 'quitar el acceso a un administrador borra sus suscripciones');
select set_config('request.jwt.claims', '', true);

-- ---------- 4. los avisos de jefatura, solo a activos ----------

-- Un administrador sin acceso con una suscripción (de antes de 0050): no recibe nada.
insert into hidrantes.suscripciones_push (id, email, suscripcion, temas) values
  ('00000000-0000-4000-8000-0000000051f1', 'otra-jefa-rv515@example.com',
   pg_temp.sus('https://fcm.googleapis.com/fcm/send/rv515-vieja'), array['nuevas_propuestas', 'resumen_semanal']);
delete from hidrantes.notificaciones;
select hidrantes.fn_avisar_jefatura();
select is((select count(*)::int from hidrantes.notificaciones where suscripcion_id = '00000000-0000-4000-8000-0000000051f1'), 0,
  'nuevas_propuestas: nada a un administrador sin acceso');
select ok((select count(*) from hidrantes.notificaciones n join hidrantes.suscripciones_push s on s.id = n.suscripcion_id
           where s.email = 'jefa-rv515@example.com') > 0, 'y sí a uno activo');
with p as (insert into hidrantes.puntos (codigo, tipo, geom, diametro_mm, caudal, municipio, nucleo, descripcion)
  values (hidrantes.fn_siguiente_codigo('hidrante'), 'hidrante', 'SRID=4326;POINT(-3.656 37.231)', 70, 'bueno',
          'albolote', 'Albolote', '[PRUEBA] rv515') returning id)
insert into hidrantes.propuestas (punto_id, operacion, datos, autor_nombre, autor_apellido, dispositivo_id, clave_local)
select id, 'revision', '{}', 'Prueba', 'RV515', gen_random_uuid(), 'rv515-resumen' from p;
delete from hidrantes.notificaciones;
select hidrantes.fn_encolar_resumen_semanal();
select is((select count(*)::int from hidrantes.notificaciones where suscripcion_id = '00000000-0000-4000-8000-0000000051f1'), 0,
  'resumen semanal: nada a un administrador sin acceso');
select ok((select count(*) from hidrantes.notificaciones n join hidrantes.suscripciones_push s on s.id = n.suscripcion_id
           where s.email = 'jefa-rv515@example.com' and n.titulo = 'Resumen semanal') > 0, 'y sí a uno activo');

-- ---------- permisos de las funciones nuevas ----------

select ok(not has_function_privilege('anon', 'hidrantes.fn_suscripciones_tras_revocar()', 'execute'),
  'anon no ejecuta la función del disparador de revocar');
select ok(not has_function_privilege('authenticated', 'hidrantes.fn_suscripciones_tras_quitar_acceso()', 'execute'),
  'authenticated no ejecuta la del disparador de quitar el acceso');

select * from finish();
rollback;
