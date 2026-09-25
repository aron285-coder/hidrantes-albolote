-- Suscripciones push que no se pierden (docs/21 RV-84, 0030, DEC-118, DEC-119):
-- · voluntario y jefatura en el mismo navegador comparten endpoint, y cada uno conserva su fila;
-- · un fallo pasajero (5xx) no borra; solo la caducidad (404/410) borra al momento, y los demás
--   fallos, con 10 seguidos y sin un envío bueno en los últimos 7 días.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;

select plan(16);

-- ---------- datos de prueba ----------

insert into hidrantes.administradores (email, creado_por) values
  ('jefa-avisos@example.com', 'test'), ('otra-jefa-avisos@example.com', 'test');
insert into hidrantes.dispositivos (dispositivo_id, token_hash) values
  ('00000000-0000-4000-8000-00000000d271', hidrantes.fn_sha256('token-de-prueba-rv84-dispositivo-uno')),
  ('00000000-0000-4000-8000-00000000d272', hidrantes.fn_sha256('token-de-prueba-rv84-dispositivo-dos'));

create function pg_temp.sus(endpoint text) returns jsonb language sql as $$
  select jsonb_build_object('endpoint', endpoint, 'keys', jsonb_build_object('p256dh', 'p', 'auth', 'a'));
$$;

create function pg_temp.como_admin(email text) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'role', 'authenticated', 'email', email,
    'amr', jsonb_build_array(jsonb_build_object('method', 'oauth', 'timestamp', 1)),
    'app_metadata', jsonb_build_object('provider', 'google', 'providers', jsonb_build_array('google')))::text, true);
$$;

-- Un aviso para la suscripción y su resultado, como lo anota /api/push.
create function pg_temp.resultado(s uuid, ok boolean, caducada boolean default false) returns void
language plpgsql as $$
declare
  n bigint;
begin
  insert into hidrantes.notificaciones (suscripcion_id, titulo, cuerpo) values (s, 'Propuesta aprobada', 'x')
  returning id into n;
  perform hidrantes.fn_resultado_notificacion(n, ok, case when ok then null else 'HTTP 503' end, caducada);
end $$;

create function pg_temp.existe(s uuid) returns boolean language sql as $$
  select exists (select 1 from hidrantes.suscripciones_push where id = s);
$$;

-- ---------- un endpoint, dos dueños ----------

select set_config('test.vol', hidrantes.fn_guardar_suscripcion_push('token-de-prueba-rv84-dispositivo-uno',
  pg_temp.sus('https://fcm.googleapis.com/fcm/send/rv84-compartido'), null)::text, true);
select pg_temp.como_admin('jefa-avisos@example.com');
select set_config('test.adm', hidrantes.fn_guardar_suscripcion_push_admin(
  pg_temp.sus('https://fcm.googleapis.com/fcm/send/rv84-compartido'), array['nuevas_propuestas'])::text, true);
select set_config('request.jwt.claims', '', true);

select is((select count(*)::int from hidrantes.suscripciones_push
           where suscripcion ->> 'endpoint' = 'https://fcm.googleapis.com/fcm/send/rv84-compartido'), 2,
  'el mismo endpoint guardado por un voluntario y por jefatura da dos filas');
select is((select dispositivo_id from hidrantes.suscripciones_push where id = current_setting('test.vol')::uuid),
  '00000000-0000-4000-8000-00000000d271'::uuid, 'la del voluntario sigue siendo suya');
select is((select email from hidrantes.suscripciones_push where id = current_setting('test.adm')::uuid),
  'jefa-avisos@example.com', 'y la de jefatura, de jefatura');

-- Volver a activar en el mismo navegador actualiza su fila, no crea otra.
select is(hidrantes.fn_guardar_suscripcion_push('token-de-prueba-rv84-dispositivo-uno',
  pg_temp.sus('https://fcm.googleapis.com/fcm/send/rv84-compartido'), null), current_setting('test.vol')::uuid,
  'el voluntario que vuelve a activar reutiliza su fila');
select is((select count(*)::int from hidrantes.suscripciones_push
           where suscripcion ->> 'endpoint' = 'https://fcm.googleapis.com/fcm/send/rv84-compartido'), 2,
  'y siguen siendo dos');

-- Otro token de voluntario en el mismo navegador es el mismo navegador con un acceso nuevo: se queda
-- la fila del voluntario (un navegador solo tiene un token), sin tocar la de jefatura.
select is(hidrantes.fn_guardar_suscripcion_push('token-de-prueba-rv84-dispositivo-dos',
  pg_temp.sus('https://fcm.googleapis.com/fcm/send/rv84-compartido'), null), current_setting('test.vol')::uuid,
  'un token de voluntario nuevo en el mismo navegador se queda la fila de voluntario');
select is((select dispositivo_id from hidrantes.suscripciones_push where id = current_setting('test.vol')::uuid),
  '00000000-0000-4000-8000-00000000d272'::uuid, 'con el dispositivo nuevo');
select pg_temp.como_admin('otra-jefa-avisos@example.com');
select is(hidrantes.fn_guardar_suscripcion_push_admin(
  pg_temp.sus('https://fcm.googleapis.com/fcm/send/rv84-compartido'), array['nuevas_propuestas']),
  current_setting('test.adm')::uuid, 'otra administradora en el mismo navegador se queda la fila de jefatura');
select set_config('request.jwt.claims', '', true);
select is((select count(*)::int from hidrantes.suscripciones_push
           where suscripcion ->> 'endpoint' = 'https://fcm.googleapis.com/fcm/send/rv84-compartido'), 2,
  'y siguen siendo dos: una de voluntario y una de jefatura');

select ok(not exists (select 1 from pg_indexes where schemaname = 'hidrantes' and indexname = 'suscripciones_endpoint_idx'),
  'el índice único solo por endpoint ya no existe');

-- ---------- fallos pasajeros y caducidad ----------

insert into hidrantes.suscripciones_push (id, dispositivo_id, suscripcion, temas, ultimo_envio) values
  ('00000000-0000-4000-8000-0000000c2701', '00000000-0000-4000-8000-00000000d271',
   pg_temp.sus('https://fcm.googleapis.com/fcm/send/rv84-vieja'), '{resultado_propuesta}', now() - interval '8 days'),
  ('00000000-0000-4000-8000-0000000c2702', '00000000-0000-4000-8000-00000000d271',
   pg_temp.sus('https://fcm.googleapis.com/fcm/send/rv84-reciente'), '{resultado_propuesta}', now() - interval '1 day'),
  ('00000000-0000-4000-8000-0000000c2703', '00000000-0000-4000-8000-00000000d271',
   pg_temp.sus('https://fcm.googleapis.com/fcm/send/rv84-caducada'), '{resultado_propuesta}', now()),
  ('00000000-0000-4000-8000-0000000c2704', '00000000-0000-4000-8000-00000000d271',
   pg_temp.sus('https://fcm.googleapis.com/fcm/send/rv84-nunca'), '{resultado_propuesta}', null);

select pg_temp.resultado('00000000-0000-4000-8000-0000000c2701', false) from generate_series(1, 9);
select ok(pg_temp.existe('00000000-0000-4000-8000-0000000c2701'),
  'nueve errores 5xx seguidos no borran la suscripción');
select pg_temp.resultado('00000000-0000-4000-8000-0000000c2701', false);
select ok(not pg_temp.existe('00000000-0000-4000-8000-0000000c2701'),
  'el décimo, sin un envío bueno desde hace 8 días, sí');

select pg_temp.resultado('00000000-0000-4000-8000-0000000c2702', false) from generate_series(1, 12);
select ok(pg_temp.existe('00000000-0000-4000-8000-0000000c2702'),
  'doce errores con un envío bueno de ayer no la borran');

select pg_temp.resultado('00000000-0000-4000-8000-0000000c2704', false) from generate_series(1, 10);
select ok(not pg_temp.existe('00000000-0000-4000-8000-0000000c2704'),
  'diez errores en una que nunca recibió nada, sí');

select pg_temp.resultado('00000000-0000-4000-8000-0000000c2703', false, true);
select ok(not pg_temp.existe('00000000-0000-4000-8000-0000000c2703'),
  'un 404/410 (caducada) borra al primer aviso');

-- Un envío bueno pone los fallos a cero.
select pg_temp.resultado('00000000-0000-4000-8000-0000000c2702', true);
select is((select fallos from hidrantes.suscripciones_push where id = '00000000-0000-4000-8000-0000000c2702'),
  0::smallint, 'un envío bueno deja los fallos a cero');

select * from finish();
rollback;
