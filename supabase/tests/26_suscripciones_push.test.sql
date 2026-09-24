-- Suscripciones push solo a los servicios de push de los navegadores (docs/19 RV-68, 0029).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;

select plan(9);

create function pg_temp.sus(endpoint text) returns jsonb language sql as $$
  select jsonb_build_object('endpoint', endpoint, 'keys', jsonb_build_object('p256dh', 'p', 'auth', 'a'));
$$;

select lives_ok(format('select hidrantes.fn_validar_suscripcion(%L)', pg_temp.sus('https://fcm.googleapis.com/fcm/send/abc:def')),
  'Chrome y Android (FCM) valen');
select lives_ok(format('select hidrantes.fn_validar_suscripcion(%L)', pg_temp.sus('https://updates.push.services.mozilla.com/wpush/v2/abc')),
  'Firefox vale');
select lives_ok(format('select hidrantes.fn_validar_suscripcion(%L)', pg_temp.sus('https://web.push.apple.com/QABC')),
  'Safari e iOS (web.push.apple.com) valen');
select lives_ok(format('select hidrantes.fn_validar_suscripcion(%L)', pg_temp.sus('https://api.push.apple.com/3/device/abc')),
  'un subdominio de push.apple.com vale');
select lives_ok(format('select hidrantes.fn_validar_suscripcion(%L)', pg_temp.sus('https://wns2-db5p.notify.windows.com/w/?token=abc')),
  'Edge y Windows valen');

select throws_like(format('select hidrantes.fn_validar_suscripcion(%L)', pg_temp.sus('https://push.inventado.example/x')),
  'PAYLOAD_INVALIDO(suscripcion)%', 'un host inventado no vale');
select throws_like(format('select hidrantes.fn_validar_suscripcion(%L)', pg_temp.sus('https://fcm.googleapis.com.malo.example/x')),
  'PAYLOAD_INVALIDO(suscripcion)%', 'un host que solo empieza como FCM no vale');
select throws_like(format('select hidrantes.fn_validar_suscripcion(%L)', pg_temp.sus('https://falsopush.services.mozilla.com/x')),
  'PAYLOAD_INVALIDO(suscripcion)%', 'un host que solo termina parecido al de Firefox no vale');
select throws_like(format('select hidrantes.fn_validar_suscripcion(%L)', pg_temp.sus('http://fcm.googleapis.com/fcm/send/abc')),
  'PAYLOAD_INVALIDO(suscripcion)%', 'sin https no vale');

select * from finish();
rollback;
