-- docs/33 (0044, DEC-190): la entrada del día del lanzamiento (RV-300), el espacio del esquema
-- (RV-301), las reservas liberadas y el móvil nuevo por dispositivo (RV-302), el tope global sin
-- candado (RV-304), fn_registrar_error de la app anterior sin anon (RV-306) y
-- fn_endpoint_tiene_jefatura (RV-323). Todo dentro de una transacción que se deshace.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;

select plan(62);

-- ---------- datos de prueba ----------

insert into hidrantes.config (clave, valor, actualizado_por)
values ('codigo_acceso_hash', to_jsonb(extensions.crypt('482917', extensions.gen_salt('bf', 4))), 'test')
on conflict (clave) do update set valor = excluded.valor;
update hidrantes.config set valor = '1000' where clave = 'max_subidas_dia_total';
insert into hidrantes.administradores (email, creado_por) values ('jefa41@example.com', 'test') on conflict do nothing;
insert into hidrantes.puntos (id, codigo, tipo, geom, diametro_mm, caudal, foto_path, municipio, fecha_ultima_revision)
values ('00000000-0000-4000-8000-0000000e4101', 'HID-8811', 'hidrante', 'SRID=4326;POINT(-3.6569 37.2308)', 100, 'bueno',
        'fotos/p41-1.jpg', 'albolote', current_date - 30);

create function pg_temp.jefatura() returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'role', 'authenticated', 'email', 'jefa41@example.com',
    'amr', jsonb_build_array(jsonb_build_object('method', 'oauth', 'timestamp', 1)),
    'app_metadata', jsonb_build_object('provider', 'google', 'providers', jsonb_build_array('google')))::text, true);
$$;
create function pg_temp.voluntario() returns void language sql as $$
  select set_config('request.jwt.claims', '', true);
$$;
-- "Corregir datos" de un voluntario, con foto opcional.
create function pg_temp.datos(token text, clave text, foto text default null) returns jsonb language sql as $$
  select hidrantes.fn_proponer(token, clave, 'Ana', 'Ruiz', 'datos', '00000000-0000-4000-8000-0000000e4101',
    '{"descripcion":"x"}', null, null, null, null, null, null, null, null, foto);
$$;
-- Diez propuestas de hoy de un móvil, sin pasar por fn_proponer.
create function pg_temp.diez_hoy(d uuid, prefijo text) returns void language sql as $$
  insert into hidrantes.propuestas (punto_id, operacion, datos, autor_nombre, autor_apellido, dispositivo_id, clave_local)
  select '00000000-0000-4000-8000-0000000e4101', 'datos', '{"descripcion":"x"}', 'Eva', 'Sol', d, prefijo || i
  from generate_series(1, 10) i;
$$;
create function pg_temp.canje(codigo text, d uuid, ip text) returns text language sql as $$
  select coalesce(v.token, v.error) from hidrantes.fn_verificar_codigo(codigo, d, ip) v;
$$;
-- El mensaje y el detail de un error, unidos con '|'.
create function pg_temp.error_de(sentencia text) returns text language plpgsql as $$
declare
  m text;
  d text;
begin
  execute sentencia;
  return null;
exception when others then
  get stacked diagnostics m = message_text, d = pg_exception_detail;
  return m || '|' || coalesce(d, '');
end $$;
-- ¿Tiene esta transacción el candado de transacción pg_advisory_xact_lock(hashtext(clave))?
create function pg_temp.con_candado(clave text) returns boolean language sql as $$
  select exists (select 1 from pg_locks l
                  where l.locktype = 'advisory' and l.pid = pg_backend_pid() and l.objsubid = 1
                    and l.objid::bigint = (hashtext(clave)::bigint & 4294967295)
                    and l.classid::bigint = ((hashtext(clave)::bigint >> 32) & 4294967295));
$$;

select pg_temp.voluntario();
-- Un veterano: entró hace tres días, se le revocó el token y vuelve a entrar hoy.
insert into hidrantes.dispositivos (dispositivo_id, token_hash, emitido_en, revocado_en)
values ('a4100000-0000-4000-8000-0000000e4101', 'hash-viejo-41', now() - interval '3 days', now() - interval '1 day');
select set_config('test.tv', pg_temp.canje('482917', 'a4100000-0000-4000-8000-0000000e4101', 'ip-41-v'), true);
-- Un móvil nuevo de verdad.
select set_config('test.tn', pg_temp.canje('482917', 'b4100000-0000-4000-8000-0000000e4102', 'ip-41-n'), true);

-- ---------- RV-302: móvil nuevo por dispositivo, no por token ----------

select pg_temp.diez_hoy('a4100000-0000-4000-8000-0000000e4101', 'v41-');
select lives_ok($$ select pg_temp.datos(current_setting('test.tv'), 'v41-la-11') $$,
  'un veterano que vuelve a entrar no es "token nuevo": la 11.ª del día entra (sobre develop: CUOTA_PROPUESTAS_AGOTADA)');
select pg_temp.diez_hoy('b4100000-0000-4000-8000-0000000e4102', 'n41-');
select throws_like($$ select pg_temp.datos(current_setting('test.tn'), 'n41-la-11') $$,
  'CUOTA_PROPUESTAS_AGOTADA: maximo=10 % ambito=token_nuevo', 'un móvil visto por primera vez hoy sigue con 10');
delete from hidrantes.propuestas where clave_local like 'n41-%';

-- ---------- RV-304: el tope global sin candado ----------

select lives_ok($$ select pg_temp.datos(current_setting('test.tn'), 'n41-candado') $$, 'una propuesta de voluntario');
select ok(pg_temp.con_candado('propuestas:b4100000-0000-4000-8000-0000000e4102'),
  'la propuesta tiene el candado de su móvil (la comprobación de candados funciona)');
select ok(not pg_temp.con_candado('propuestas:global'),
  'y no el de todo el grupo: dos propuestas de móviles distintos no se esperan (sobre develop: lo tenía hasta el final)');
update hidrantes.config set valor = to_jsonb(hidrantes.fn_propuestas_hoy()) where clave = 'max_propuestas_dia_total';
select throws_like($$ select pg_temp.datos(current_setting('test.tn'), 'n41-grupo') $$,
  'CUOTA_PROPUESTAS_AGOTADA: % ambito=grupo', 'el tope global sigue frenando');
update hidrantes.config set valor = '600' where clave = 'max_propuestas_dia_total';

-- ---------- RV-301: el espacio del esquema ----------

select ok(hidrantes.fn_bytes_esquema() > 0 and hidrantes.fn_bytes_esquema() < pg_database_size(current_database()),
  'fn_bytes_esquema mide el esquema hidrantes, menos que toda la base de datos');
select ok(pg_database_size(current_database()) > hidrantes.fn_bytes_esquema() + 1048576,
  'la base de datos local ocupa más que el esquema más 1 MB (condición de la prueba siguiente)');
update hidrantes.config set valor = to_jsonb(hidrantes.fn_bytes_esquema() + 1048576) where clave = 'max_bytes_bd';
select lives_ok($$ select pg_temp.datos(current_setting('test.tn'), 'n41-espacio-ok') $$,
  'con la base de datos por encima de max_bytes_bd pero el esquema por debajo, entra (sobre develop: SIN_ESPACIO)');
update hidrantes.config set valor = '1' where clave = 'max_bytes_bd';
select set_config('test.se', pg_temp.error_de($$ select pg_temp.datos(current_setting('test.tn'), 'n41-espacio-no') $$), true);
select ok(current_setting('test.se') ~ '^SIN_ESPACIO: maximo=1 reintentar_en_s=3600\|'
          and split_part(current_setting('test.se'), '|', 2)::jsonb ->> 'reintentar_en_s' = '3600',
  'con el esquema por encima: SIN_ESPACIO con maximo y reintentar_en_s = 3600 (sobre develop: sin números)');
update hidrantes.config set valor = '419430400' where clave = 'max_bytes_bd';

select ok(hidrantes.fn_espacio() ?& array['esquema_bytes', 'bd_bytes', 'max_bytes_bd_total', 'aviso_total', 'bd_desglose'],
  'fn_espacio da el esquema, el total con su tope y el desglose');
select is((hidrantes.fn_espacio() ->> 'max_bytes_bd_total')::bigint, 524288000::bigint, 'el total, contra 500 MB');
select is((hidrantes.fn_espacio() -> 'bd_desglose' ->> 'hidrantes')::bigint, hidrantes.fn_bytes_esquema(),
  'el desglose da lo de hidrantes');
select ok((hidrantes.fn_espacio() -> 'bd_desglose') ?& array['cron', 'net', 'resto'], 'y lo de pg_cron, pg_net y el resto');
select is((hidrantes.fn_espacio() ->> 'bd_bytes')::bigint, pg_database_size(current_database()),
  'bd_bytes sigue siendo toda la base de datos (la vigilancia anterior lo lee)');

-- La tarea que borra el historial de pg_cron de las tareas de hidrantes.
select ok(exists (select 1 from cron.job where jobname = 'hidrantes_purgar_registros_cron'),
  'la tarea hidrantes_purgar_registros_cron existe');
select cron.schedule('ajena_41', '0 0 1 1 *', 'select 1');
create function pg_temp.ejecucion(tarea text, hace interval, n integer) returns void language sql as $$
  insert into cron.job_run_details (jobid, runid, database, username, command, status, return_message,
                                    start_time, end_time)
  select j.jobid, (select coalesce(max(runid), 0) + 4100000 + n from cron.job_run_details), current_database(),
         j.username, j.command, 'succeeded', 'prueba 41', now() - hace, now() - hace
  from cron.job j where j.jobname = tarea;
$$;
select pg_temp.ejecucion('hidrantes_purgar_intentos', interval '11 days', 1);
select pg_temp.ejecucion('hidrantes_purgar_intentos', interval '9 days', 2);
select pg_temp.ejecucion('ajena_41', interval '11 days', 3);
select ok(hidrantes.fn_purgar_registros_cron() >= 1, 'fn_purgar_registros_cron borra algo');
select is((select count(*)::int from cron.job_run_details d join cron.job j using (jobid)
            where j.jobname = 'hidrantes_purgar_intentos' and d.return_message = 'prueba 41'), 1,
  'de las de hidrantes, la de hace 11 días sí y la de hace 9 no');
select is((select count(*)::int from cron.job_run_details d join cron.job j using (jobid)
            where j.jobname = 'ajena_41' and d.return_message = 'prueba 41'), 1,
  'las de otras tareas no se tocan');

-- ---------- RV-302: reservas liberadas ----------

select set_config('test.r' || i, hidrantes.fn_reservar_subida_para('b4100000-0000-4000-8000-0000000e4102'), true)
from generate_series(1, 6) i;
select throws_like($$ select hidrantes.fn_reservar_subida_para('b4100000-0000-4000-8000-0000000e4102') $$,
  'RESERVAS_ABIERTAS:%', 'con 6 reservas abiertas, la 7.ª no');
select set_config('test.abiertas', (hidrantes.fn_espacio_fotos()).abiertas::text, true);
select is(hidrantes.fn_liberar_reservas(current_setting('test.tn'),
            array[current_setting('test.r1'), current_setting('test.r2'), 'fotos/de-otro.jpg']), 2,
  'fn_liberar_reservas libera las dos del móvil y no cuenta la ruta ajena');
select is(hidrantes.fn_liberar_reservas(current_setting('test.tn'), array[current_setting('test.r1')]), 0,
  'liberar otra vez no hace nada');
select is((hidrantes.fn_espacio_fotos()).abiertas, current_setting('test.abiertas')::int - 2,
  'las liberadas dejan de contar como abiertas en el espacio');
select lives_ok($$ select hidrantes.fn_reservar_subida_para('b4100000-0000-4000-8000-0000000e4102') $$,
  'y el móvil puede reservar otra (sobre develop: RESERVAS_ABIERTAS hasta 2 h)');
select throws_like($$ select pg_temp.datos(current_setting('test.tn'), 'n41-liberada', current_setting('test.r1')) $$,
  'FOTO_NO_RESERVADA%', 'una reserva liberada ya no se confirma');
select lives_ok($$ select pg_temp.datos(current_setting('test.tn'), 'n41-con-foto', current_setting('test.r3')) $$,
  'una sin liberar, sí');
select is(hidrantes.fn_liberar_reservas(current_setting('test.tn'), array[current_setting('test.r3')]), 0,
  'una confirmada no se libera');
select is(hidrantes.fn_liberar_reservas(current_setting('test.tv'), array[current_setting('test.r4')]), 0,
  'otro móvil no libera las reservas de este');
select throws_like($$ select hidrantes.fn_liberar_reservas(current_setting('test.tn'), '{}') $$,
  'PAYLOAD_INVALIDO(rutas)%', 'sin rutas: PAYLOAD_INVALIDO(rutas)');
select throws_like($$ select hidrantes.fn_liberar_reservas('token-que-no-existe-0000000', array['fotos/x.jpg']) $$,
  'TOKEN_INVALIDO%', 'sin token válido: TOKEN_INVALIDO');

-- ---------- RV-323: fn_endpoint_tiene_jefatura ----------

insert into hidrantes.suscripciones_push (dispositivo_id, email, suscripcion, temas) values
  ('b4100000-0000-4000-8000-0000000e4102', null,
   '{"endpoint":"https://fcm.googleapis.com/fcm/send/compartido41","keys":{"p256dh":"p","auth":"a"}}', '{resultado_propuesta}'),
  (null, 'jefa41@example.com',
   '{"endpoint":"https://fcm.googleapis.com/fcm/send/compartido41","keys":{"p256dh":"p","auth":"a"}}', '{propuesta_nueva}'),
  ('b4100000-0000-4000-8000-0000000e4102', null,
   '{"endpoint":"https://fcm.googleapis.com/fcm/send/solo41","keys":{"p256dh":"p","auth":"a"}}', '{resultado_propuesta}');
select is(hidrantes.fn_endpoint_tiene_jefatura(current_setting('test.tn'), 'https://fcm.googleapis.com/fcm/send/compartido41'),
  true, 'un endpoint con fila de jefatura: sí');
select is(hidrantes.fn_endpoint_tiene_jefatura(current_setting('test.tn'), 'https://fcm.googleapis.com/fcm/send/solo41'),
  false, 'uno solo de voluntario: no');
select throws_like($$ select hidrantes.fn_endpoint_tiene_jefatura('token-que-no-existe-0000000', 'https://x') $$,
  'TOKEN_INVALIDO%', 'sin token válido: TOKEN_INVALIDO');
select throws_like($$ select hidrantes.fn_endpoint_tiene_jefatura(current_setting('test.tn'), ' ') $$,
  'PAYLOAD_INVALIDO(endpoint)%', 'sin endpoint: PAYLOAD_INVALIDO(endpoint)');

-- ---------- RV-306: la fn_registrar_error de la app anterior, sin anon ----------

select ok(not has_function_privilege('anon', 'hidrantes.fn_registrar_error(uuid,text,text,text,text)', 'execute')
          and not has_function_privilege('authenticated', 'hidrantes.fn_registrar_error(uuid,text,text,text,text)', 'execute'),
  'la fn_registrar_error de 5 argumentos ya no es de anon ni de authenticated (#472; sobre develop: sí)');

-- ---------- RV-300: Ajustes ----------

select pg_temp.jefatura();
select lives_ok($$ select hidrantes.fn_guardar_config('{"max_altas_ip_dia": 30, "max_altas_global_hora": 60}') $$,
  'los dos topes de entrada se cambian desde Ajustes (sobre develop: CONFIG_INVALIDA)');
select is(hidrantes.fn_config('max_altas_ip_dia', 'null'), '30'::jsonb, 'y quedan en config');
select ok(exists (select 1 from hidrantes.registro where accion = 'config_cambiada' and despues ? 'max_altas_ip_dia'),
  'y en el registro');
select throws_like($$ select hidrantes.fn_guardar_config('{"max_altas_ip_dia": 4}') $$,
  'CONFIG_INVALIDA(max_altas_ip_dia)%', 'max_altas_ip_dia por debajo de 5: rechazado');
select throws_like($$ select hidrantes.fn_guardar_config('{"max_altas_global_hora": 501}') $$,
  'CONFIG_INVALIDA(max_altas_global_hora)%', 'max_altas_global_hora por encima de 500: rechazado');
select throws_like($$ select hidrantes.fn_guardar_config('{"entrada_abierta_hasta": "2099-01-01T00:00:00Z"}') $$,
  'CONFIG_INVALIDA(entrada_abierta_hasta)%', 'la entrada no se abre desde la lista de parámetros');
update hidrantes.config set valor = '20' where clave = 'max_altas_ip_dia';
update hidrantes.config set valor = '40' where clave = 'max_altas_global_hora';

-- ---------- RV-300: con la entrada cerrada ----------

select pg_temp.voluntario();
insert into hidrantes.intentos_codigo (dispositivo_id, ip_hash, exito, momento)
select gen_random_uuid(), 'ip-41-altas', true, now() - interval '3 hours' from generate_series(1, 19);
select ok(pg_temp.canje('482917', gen_random_uuid(), 'ip-41-altas') <> 'DEMASIADOS_INTENTOS',
  'con la entrada cerrada, la 20.ª entrada desde una IP pasa');
select is(pg_temp.canje('482917', 'c4100000-0000-4000-8000-0000000e4103', 'ip-41-altas'), 'DEMASIADOS_INTENTOS',
  'y la 21.ª no');
select is(pg_temp.canje('111111', 'd4100000-0000-4000-8000-0000000e4104', 'ip-41-altas'), 'DEMASIADOS_INTENTOS',
  'con un código malo, la misma respuesta: el tope no sirve para probar códigos');
select pg_temp.jefatura();
select is((hidrantes.fn_salud() ->> 'entradas_frenadas_24h')::int, 1,
  'Salud cuenta un móvil frenado con el código bueno (el del código malo no)');
select is(hidrantes.fn_salud() -> 'entrada_abierta_hasta', 'null'::jsonb, 'y la entrada, cerrada');

-- ---------- RV-300: abrir la entrada ----------

select throws_like($$ select hidrantes.fn_abrir_entrada(73) $$, 'PAYLOAD_INVALIDO(horas)%', 'más de 72 horas: no');
select ok(hidrantes.fn_abrir_entrada() between now() + interval '23 hours 59 minutes' and now() + interval '24 hours 1 minute',
  'fn_abrir_entrada la abre 24 h por defecto');
select ok(exists (select 1 from hidrantes.registro where accion = 'entrada_abierta' and actor = 'jefa41@example.com'
                    and despues ->> 'motivo' = 'jefatura' and despues ? 'hasta'),
  'queda en el registro, con quién y hasta cuándo');
select ok((hidrantes.fn_salud() ->> 'entrada_abierta_hasta')::timestamptz > now(), 'Salud dice hasta cuándo');
select pg_temp.voluntario();
select ok(pg_temp.canje('482917', 'c4100000-0000-4000-8000-0000000e4103', 'ip-41-altas') <> 'DEMASIADOS_INTENTOS',
  'con la entrada abierta, el que estaba frenado entra');
select is((select count(*)::int from generate_series(1, 65) i
            where pg_temp.canje('482917', gen_random_uuid(), 'ip-41-wifi') <> 'DEMASIADOS_INTENTOS'), 65,
  'entran 65 desde la misma wifi, y más de 40 en la misma hora');
select set_config('test.tw', pg_temp.canje('482917', 'e4100000-0000-4000-8000-0000000e4105', 'ip-41-wifi'), true);
select ok((select bool_and(en_entrada_abierta) from hidrantes.dispositivos where dispositivo_id = 'e4100000-0000-4000-8000-0000000e4105'),
  'su token queda marcado como de la entrada abierta');
select pg_temp.diez_hoy('e4100000-0000-4000-8000-0000000e4105', 'w41-');
select lives_ok($$ select pg_temp.datos(current_setting('test.tw'), 'w41-la-11') $$,
  'un token de la entrada abierta tiene el tope normal (60), no el de token nuevo (10)');
-- Los fallos frenan igual: 10 códigos malos desde un móvil y el bueno ya no entra.
select pg_temp.canje('000000', 'f4100000-0000-4000-8000-0000000e4106', 'ip-41-mal') from generate_series(1, 10);
select is(pg_temp.canje('482917', 'f4100000-0000-4000-8000-0000000e4106', 'ip-41-mal'), 'DEMASIADOS_INTENTOS',
  'con la entrada abierta, los fallos de código siguen frenando igual');

-- ---------- RV-300: cerrar, y se cierra sola ----------

select pg_temp.jefatura();
select lives_ok($$ select hidrantes.fn_cerrar_entrada() $$, 'fn_cerrar_entrada');
select ok(exists (select 1 from hidrantes.registro where accion = 'entrada_cerrada' and antes ? 'hasta'),
  'queda en el registro');
select is(hidrantes.fn_salud() -> 'entrada_abierta_hasta', 'null'::jsonb, 'y Salud la da por cerrada');
select pg_temp.voluntario();
select is(pg_temp.canje('482917', gen_random_uuid(), 'ip-41-wifi'), 'DEMASIADOS_INTENTOS', 'cerrada, la wifi vuelve a 20');
select pg_temp.jefatura();
select hidrantes.fn_abrir_entrada(1);
update hidrantes.config set valor = to_jsonb(now() - interval '1 minute') where clave = 'entrada_abierta_hasta';
select pg_temp.voluntario();
select is(pg_temp.canje('482917', gen_random_uuid(), 'ip-41-wifi'), 'DEMASIADOS_INTENTOS',
  'pasada la hora, se cierra sola: vuelve a 20');

-- ---------- RV-300: sin sesión de administrador ----------

select throws_like($$ select hidrantes.fn_abrir_entrada(24) $$, 'NO_AUTORIZADO%', 'abrir sin sesión de jefatura: NO_AUTORIZADO');
select throws_like($$ select hidrantes.fn_cerrar_entrada() $$, 'NO_AUTORIZADO%', 'cerrar sin sesión de jefatura: NO_AUTORIZADO');

-- ---------- RV-300: un código nuevo (al final: revoca todos los móviles) ----------

select pg_temp.jefatura();
select hidrantes.fn_cerrar_entrada();
select hidrantes.fn_cambiar_codigo_acceso('123456', false);
select is(hidrantes.fn_salud() -> 'entrada_abierta_hasta', 'null'::jsonb, 'un código nuevo sin revocar no abre la entrada');
select hidrantes.fn_cambiar_codigo_acceso('654321', true);
select ok((hidrantes.fn_salud() ->> 'entrada_abierta_hasta')::timestamptz
            between now() + interval '23 hours 59 minutes' and now() + interval '24 hours 1 minute',
  'un código nuevo revocando todos la abre 24 h (sobre develop: no)');
select ok(exists (select 1 from hidrantes.registro where accion = 'entrada_abierta'
                    and despues ->> 'motivo' = 'codigo_nuevo_revocando'),
  'y lo dice en el registro');

select * from finish();
rollback;
