-- docs/40 RV-532 (0052): ninguna suscripción sobrevive a la revocación, tampoco en concurrencia.
-- Las sesiones se abren con dblink, fuera de esta transacción (como 04_concurrencia_y_tareas): lo que escriben se
-- confirma de verdad, así que se borra al acabar.
--  1. Una sesión revoca el último token de un móvil y, antes de confirmar, otra guarda una suscripción con ese token:
--     tras confirmar las dos, el móvil no tiene ninguna.
--  2. Dos tokens del mismo móvil revocados en dos sesiones a la vez: no queda ninguna.
begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
set search_path = extensions, public;

select plan(4);

select dblink_connect(s, format('dbname=postgres user=postgres password=postgres host=%s port=%s',
       host(inet_server_addr()), inet_server_port()))
from unnest(array['s0', 's1', 's2']) s;

-- Datos, confirmados (s0 sin transacción): el uso reciente evita que fn_validar_token escriba ultimo_uso.
select dblink_exec('s0', $$
  insert into hidrantes.dispositivos (dispositivo_id, token_hash, ultimo_uso) values
    ('00000000-0000-4000-8000-0000000053a1', hidrantes.fn_sha256('token-rv532-uno-de-prueba'), now()),
    ('00000000-0000-4000-8000-0000000053b1', hidrantes.fn_sha256('token-rv532-dos-a-de-prueba'), now()),
    ('00000000-0000-4000-8000-0000000053b1', hidrantes.fn_sha256('token-rv532-dos-b-de-prueba'), now());
  insert into hidrantes.suscripciones_push (dispositivo_id, suscripcion, temas) values
    ('00000000-0000-4000-8000-0000000053b1',
     '{"endpoint": "https://fcm.googleapis.com/fcm/send/rv532-b", "keys": {"p256dh": "p", "auth": "a"}}',
     '{resultado_propuesta}');
$$);

-- ---------- 1. revocar mientras se guarda ----------

select dblink_exec('s1', 'begin');
select dblink_exec('s1', $$
  update hidrantes.dispositivos set revocado_en = now()
   where token_hash = hidrantes.fn_sha256('token-rv532-uno-de-prueba') $$);
-- s2 guarda con el token aún válido para ella (s1 no ha confirmado): espera al cerrojo del móvil.
select dblink_send_query('s2', $$
  select hidrantes.fn_guardar_suscripcion_push('token-rv532-uno-de-prueba',
    '{"endpoint": "https://fcm.googleapis.com/fcm/send/rv532-a", "keys": {"p256dh": "p", "auth": "a"}}',
    '{resultado_propuesta}') $$);
select pg_sleep(0.5);
select dblink_exec('s1', 'commit');
-- El resultado de s2 (un error de token, con el arreglo) no hace fallar este archivo.
select * from dblink_get_result('s2', false) as t(id uuid);
select * from dblink_get_result('s2', false) as t(id uuid);

select is((select count(*)::int from hidrantes.suscripciones_push
            where dispositivo_id = '00000000-0000-4000-8000-0000000053a1'), 0,
  'revocado mientras se guardaba una suscripción: el móvil no tiene ninguna');
select is((select count(*)::int from hidrantes.dispositivos
            where dispositivo_id = '00000000-0000-4000-8000-0000000053a1' and revocado_en is null), 0,
  'y el token quedó revocado');

-- ---------- 2. dos tokens del mismo móvil, a la vez ----------

select dblink_exec('s1', 'begin');
select dblink_exec('s1', $$
  update hidrantes.dispositivos set revocado_en = now()
   where token_hash = hidrantes.fn_sha256('token-rv532-dos-a-de-prueba') $$);
select dblink_exec('s2', 'begin');
select dblink_send_query('s2', $$
  update hidrantes.dispositivos set revocado_en = now()
   where token_hash = hidrantes.fn_sha256('token-rv532-dos-b-de-prueba') $$);
select pg_sleep(0.5);
select dblink_exec('s1', 'commit');
select * from dblink_get_result('s2', false) as t(r text);
select * from dblink_get_result('s2', false) as t(r text);
select dblink_exec('s2', 'commit');

select is((select count(*)::int from hidrantes.dispositivos
            where dispositivo_id = '00000000-0000-4000-8000-0000000053b1' and revocado_en is null), 0,
  'los dos tokens del móvil, revocados');
select is((select count(*)::int from hidrantes.suscripciones_push
            where dispositivo_id = '00000000-0000-4000-8000-0000000053b1'), 0,
  'dos revocaciones a la vez: no queda ninguna suscripción');

-- ---------- limpieza ----------

select dblink_exec('s0', $$
  delete from hidrantes.suscripciones_push
   where dispositivo_id in ('00000000-0000-4000-8000-0000000053a1', '00000000-0000-4000-8000-0000000053b1');
  delete from hidrantes.dispositivos
   where dispositivo_id in ('00000000-0000-4000-8000-0000000053a1', '00000000-0000-4000-8000-0000000053b1');
$$);
select dblink_disconnect(s) from unnest(array['s0', 's1', 's2']) s;

select * from finish();
rollback;
