-- docs/35 RV-401 y RV-402 (DEC-199, DEC-201): la entrada con el código (el turno con espera máxima,
-- el tope global que deja entrar a un móvil limpio, los frenados con el código bueno) y lo que el
-- grupo comparte (la mitad para los móviles recién entrados, el espacio de jefatura, cambiar el
-- código sin abrir la entrada y revocar desde una hora). Todo dentro de una transacción que se
-- deshace, salvo la prueba del turno, que usa otras dos sesiones y no deja nada confirmado.
begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
set search_path = extensions, public;

select plan(57);

-- ---------- RV-401: el turno no se espera más de 3 s (va primero: esta sesión aún no lo tiene) ----------

create temp table conexion as
select format('dbname=postgres user=postgres password=postgres host=%s port=%s',
              host(inet_server_addr()), inet_server_port()) as cadena,
       'ip42-turno-' || gen_random_uuid() as prefijo;
select dblink_connect(s, (select cadena from conexion)) from unnest(array['t1', 't2']) s;

-- t1 coge el turno y no termina; t2 lo pide mientras.
select dblink_exec('t1', 'begin');
create temp table r1 as select * from dblink('t1', format($q$select error from hidrantes.fn_verificar_codigo('999997', gen_random_uuid(), %L)$q$,
  (select prefijo from conexion) || '-a')) as t(e text);
select dblink_send_query('t2', format($q$select error from hidrantes.fn_verificar_codigo('999997', gen_random_uuid(), %L)$q$,
  (select prefijo from conexion) || '-b'));
select pg_sleep(4.5);
create temp table turno as select dblink_is_busy('t2') = 0 as termino_solo;
-- Se suelta t1 (en develop, t2 seguía esperando hasta aquí).
select dblink_exec('t1', 'rollback');
create temp table r2 as select * from dblink_get_result('t2', false) as t(e text);
select * from dblink_get_result('t2', false) as t(e text);
create temp table filas_b as select * from dblink('t2', format(
  'select count(*)::int from hidrantes.intentos_codigo where ip_hash = %L',
  (select prefijo from conexion) || '-b')) as t(n int);
select dblink_exec('t2', format('delete from hidrantes.intentos_codigo where ip_hash like %L',
  (select prefijo from conexion) || '%'));
select dblink_disconnect(s) from unnest(array['t1', 't2']) s;

select ok((select termino_solo from turno), 'con el turno ocupado, la segunda no espera más de 3 s');
select is((select e from r2), 'OCUPADO', 'y contesta OCUPADO');
select is((select e from r1), 'CODIGO_INCORRECTO', 'la primera sí tuvo el turno y comparó');
select is((select n from filas_b), 0, 'OCUPADO no cuenta como intento');

select ok((select p.proconfig @> array['lock_timeout=3s'] from pg_proc p
            where p.oid = 'hidrantes.fn_verificar_codigo(text,uuid,text)'::regprocedure),
  'fn_verificar_codigo lleva lock_timeout = 3s');
select ok((select strpos(d, 'crypt(') between 1 and strpos(d, 'pg_advisory_xact_lock') - 1
             from (select pg_get_functiondef('hidrantes.fn_verificar_codigo(text,uuid,text)'::regprocedure) d) x),
  'el bcrypt va antes del turno');

-- ---------- datos de prueba ----------

insert into hidrantes.config (clave, valor, actualizado_por)
values ('codigo_acceso_hash', to_jsonb(extensions.crypt('482917', extensions.gen_salt('bf', 4))), 'test')
on conflict (clave) do update set valor = excluded.valor;
insert into hidrantes.administradores (email, creado_por) values ('jefa42@example.com', 'test') on conflict do nothing;
insert into hidrantes.puntos (id, codigo, tipo, geom, diametro_mm, caudal, foto_path, municipio, fecha_ultima_revision)
values ('00000000-0000-4000-8000-0000000e4201', 'HID-8842', 'hidrante', 'SRID=4326;POINT(-3.6569 37.2308)', 100, 'bueno',
        'fotos/p42-1.jpg', 'albolote', current_date - 30);

-- Jefatura con su sesión de Google. Con la cuenta vinculada (docs/35 RV-400) si la tabla ya lo tiene.
create function pg_temp.jefatura() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object(
    'role', 'authenticated', 'email', 'jefa42@example.com', 'sub', md5('jefa42@example.com')::uuid,
    'amr', jsonb_build_array(jsonb_build_object('method', 'oauth', 'timestamp', 1)),
    'app_metadata', jsonb_build_object('provider', 'google', 'providers', jsonb_build_array('google')))::text, true);
  if exists (select 1 from information_schema.columns
              where table_schema = 'hidrantes' and table_name = 'administradores' and column_name = 'usuario_id') then
    execute $u$update hidrantes.administradores set usuario_id = md5(email)::uuid, vinculado_en = now()
               where usuario_id is null and email = 'jefa42@example.com'$u$;
  end if;
end $$;
create function pg_temp.voluntario() returns void language sql as $$
  select set_config('request.jwt.claims', '', true);
$$;
create function pg_temp.canje(codigo text, d uuid, ip text) returns text language sql as $$
  select coalesce(v.token, v.error) from hidrantes.fn_verificar_codigo(codigo, d, ip) v;
$$;
-- "Corregir datos" de un voluntario.
create function pg_temp.datos(token text, clave text) returns jsonb language sql as $$
  select hidrantes.fn_proponer(token, clave, 'Ana', 'Ruiz', 'datos', '00000000-0000-4000-8000-0000000e4201',
    '{"descripcion":"x"}', null, null, null, null, null, null, null, null, null);
$$;
-- n propuestas de hoy de un móvil, sin pasar por fn_proponer.
create function pg_temp.hoy(d uuid, n integer, prefijo text) returns void language sql as $$
  insert into hidrantes.propuestas (punto_id, operacion, datos, autor_nombre, autor_apellido, dispositivo_id, clave_local)
  select '00000000-0000-4000-8000-0000000e4201', 'datos', '{"descripcion":"x"}', 'Eva', 'Sol', d, prefijo || i
  from generate_series(1, n) i;
$$;
-- El mensaje de un error, o null si no lo hay.
create function pg_temp.error_de(sentencia text) returns text language plpgsql as $$
begin
  execute sentencia;
  return null;
exception when others then
  return sqlerrm;
end $$;

select pg_temp.voluntario();

-- ---------- RV-401: el tope global ----------

select is(hidrantes.fn_config('max_intentos_global', 'null'), '60'::jsonb, 'tope global de fallos: 60 por hora (DEC-199)');

-- 200 fallos en la última hora desde otras IP: el tope global está alcanzado de sobra.
insert into hidrantes.intentos_codigo (dispositivo_id, ip_hash, exito)
select gen_random_uuid(), 'ip42-f-' || i, false from generate_series(1, 200) i;

select ok(pg_temp.canje('482917', 'a4200000-0000-4000-8000-0000000e4201', 'ip42-limpia-1') ~ '^[A-Za-z0-9_-]{20,}$',
  'con el tope global alcanzado, un móvil limpio entra con el código bueno');
select is(pg_temp.canje('111111', 'a4200000-0000-4000-8000-0000000e4202', 'ip42-limpia-2'), 'CODIGO_INCORRECTO',
  'con uno malo, el móvil limpio recibe CODIGO_INCORRECTO');
select is(pg_temp.canje('482917', 'a4200000-0000-4000-8000-0000000e4202', 'ip42-limpia-2'), 'DEMASIADOS_INTENTOS',
  'y ese móvil queda frenado aunque luego ponga el bueno');
select is(pg_temp.canje('482917', 'a4200000-0000-4000-8000-0000000e4203', 'ip42-limpia-2'), 'DEMASIADOS_INTENTOS',
  'y otro móvil desde esa misma IP, también');
insert into hidrantes.intentos_codigo (dispositivo_id, ip_hash, exito, momento)
values ('a4200000-0000-4000-8000-0000000e4204', 'ip42-vieja', false, now() - interval '20 hours');
select is(pg_temp.canje('482917', 'a4200000-0000-4000-8000-0000000e4204', 'ip42-limpia-4'), 'DEMASIADOS_INTENTOS',
  'un móvil con un fallo en las últimas 24 h, frenado');
insert into hidrantes.intentos_codigo (dispositivo_id, ip_hash, exito, momento)
values (gen_random_uuid(), 'ip42-limpia-5', false, now() - interval '20 hours');
select is(pg_temp.canje('482917', 'a4200000-0000-4000-8000-0000000e4205', 'ip42-limpia-5'), 'DEMASIADOS_INTENTOS',
  'un móvil nuevo desde una IP con un fallo en 24 h, frenado');
insert into hidrantes.intentos_codigo (dispositivo_id, ip_hash, exito, momento)
values ('a4200000-0000-4000-8000-0000000e4206', 'ip42-limpia-6', false, now() - interval '25 hours');
select ok(pg_temp.canje('482917', 'a4200000-0000-4000-8000-0000000e4206', 'ip42-limpia-6') ~ '^[A-Za-z0-9_-]{20,}$',
  'un fallo de hace más de 24 h ya no cuenta: ese móvil entra con el código bueno');
select ok(exists (select 1 from hidrantes.intentos_codigo where tope = 'global' and bloqueado
                    and dispositivo_id = 'a4200000-0000-4000-8000-0000000e4204'),
  'el frenado por el tope global se anota como hasta ahora');

delete from hidrantes.intentos_codigo where ip_hash like 'ip42-f-%';

-- ---------- RV-401: frenados con el código bueno, una fila por móvil y hora ----------

select set_config('test.frenadas', hidrantes.fn_entradas_frenadas_24h()::text, true);
insert into hidrantes.intentos_codigo (dispositivo_id, ip_hash, exito, momento)
select gen_random_uuid(), 'ip42-altas', true, now() - interval '3 hours' from generate_series(1, 20);
select is(pg_temp.canje('482917', 'b4200000-0000-4000-8000-0000000e4201', 'ip42-altas'), 'DEMASIADOS_INTENTOS',
  'con el tope de entradas de la IP, el código bueno no entra');
select is(pg_temp.canje('482917', 'b4200000-0000-4000-8000-0000000e4201', 'ip42-altas'), 'DEMASIADOS_INTENTOS',
  'ni la segunda vez');
select pg_temp.canje('482917', 'b4200000-0000-4000-8000-0000000e4201', 'ip42-altas') from generate_series(1, 5);
select is((select count(*)::int from hidrantes.intentos_codigo
            where dispositivo_id = 'b4200000-0000-4000-8000-0000000e4201' and bloqueado and codigo_correcto), 1,
  'siete intentos frenados con el código bueno del mismo móvil: una sola fila en la hora');
select is(pg_temp.canje('482917', 'b4200000-0000-4000-8000-0000000e4202', 'ip42-altas'), 'DEMASIADOS_INTENTOS',
  'otro móvil frenado en la misma IP');
select is(hidrantes.fn_entradas_frenadas_24h() - current_setting('test.frenadas')::int, 2,
  'fn_entradas_frenadas_24h cuenta móviles distintos: dos más');

-- ---------- RV-402: los móviles nuevos no gastan más de la mitad del grupo ----------

-- Un veterano (visto hace tres días) y tres móviles nuevos, cada uno desde su IP.
insert into hidrantes.dispositivos (dispositivo_id, token_hash, emitido_en, revocado_en)
values ('c4200000-0000-4000-8000-0000000e4200', 'hash-viejo-42', now() - interval '3 days', now() - interval '1 day');
select set_config('test.tv', pg_temp.canje('482917', 'c4200000-0000-4000-8000-0000000e4200', 'ip42-v'), true);
select set_config('test.ta', pg_temp.canje('482917', 'c4200000-0000-4000-8000-0000000e4201', 'ip42-a'), true);
select set_config('test.tb', pg_temp.canje('482917', 'c4200000-0000-4000-8000-0000000e4202', 'ip42-b'), true);
select set_config('test.tc', pg_temp.canje('482917', 'c4200000-0000-4000-8000-0000000e4203', 'ip42-c'), true);
select ok(current_setting('test.tc') ~ '^[A-Za-z0-9_-]{20,}$', 'los cuatro móviles tienen token');
select ok(exists (select 1 from hidrantes.fn_moviles_nuevos() where dispositivo_id = 'c4200000-0000-4000-8000-0000000e4203')
          and not exists (select 1 from hidrantes.fn_moviles_nuevos() where dispositivo_id = 'c4200000-0000-4000-8000-0000000e4200'),
  'fn_moviles_nuevos: el recién entrado sí, el veterano no');
insert into hidrantes.dispositivos (dispositivo_id, token_hash, en_entrada_abierta)
values ('e4200000-0000-4000-8000-0000000e4200', 'hash-entrada-abierta-42', true);
select ok(not exists (select 1 from hidrantes.fn_moviles_nuevos() where dispositivo_id = 'e4200000-0000-4000-8000-0000000e4200'),
  'un móvil que entró con la entrada abierta no cuenta como nuevo, aunque la entrada ya esté cerrada');

-- Propuestas. Lo que ya hubiera hoy (el seed) cuenta: el tope del grupo se pone a 2 × (lo de hoy +
-- 20), y los móviles nuevos llenan justo su mitad (A lo que falte, B cuatro).
select set_config('test.mitad', (hidrantes.fn_propuestas_hoy() + 20)::text, true);
update hidrantes.config set valor = to_jsonb(2 * current_setting('test.mitad')::int) where clave = 'max_propuestas_dia_total';
select pg_temp.hoy('c4200000-0000-4000-8000-0000000e4201',
  current_setting('test.mitad')::int - 4 - (select count(*)::int from hidrantes.propuestas x
    join hidrantes.fn_moviles_nuevos() n on n.dispositivo_id = x.dispositivo_id
   where x.creada_en >= date_trunc('day', now() at time zone 'Europe/Madrid') at time zone 'Europe/Madrid'), 'a42-');
select pg_temp.hoy('c4200000-0000-4000-8000-0000000e4202', 4, 'b42-');
select is(pg_temp.error_de($$ select pg_temp.datos(current_setting('test.tc'), 'c42-prop-1') $$),
  format('CUOTA_PROPUESTAS_AGOTADA: maximo=%s reintentar_en_s=%s ambito=moviles_nuevos', current_setting('test.mitad'),
    greatest(ceil(extract(epoch from least(
      (date_trunc('day', now() at time zone 'Europe/Madrid') + interval '1 day') at time zone 'Europe/Madrid',
      (select min(emitido_en) from hidrantes.dispositivos where dispositivo_id = 'c4200000-0000-4000-8000-0000000e4203')
        + interval '24 hours') - now()))::int, 1)),
  'con la mitad del grupo gastada por móviles nuevos, otro móvil nuevo espera (ambito=moviles_nuevos)');
update hidrantes.config set valor = to_jsonb(hidrantes.fn_propuestas_hoy()) where clave = 'max_propuestas_dia_total';
select ok(pg_temp.error_de($$ select pg_temp.datos(current_setting('test.tc'), 'c42-prop-g') $$) like '% ambito=grupo',
  'con el grupo lleno, el mensaje es el del grupo (va antes)');
update hidrantes.config set valor = to_jsonb(2 * current_setting('test.mitad')::int) where clave = 'max_propuestas_dia_total';
select lives_ok($$ select pg_temp.datos(current_setting('test.tv'), 'v42-prop-1') $$,
  'un veterano sigue enviando: el grupo no ha llegado a su tope');
update hidrantes.config set valor = to_jsonb(now() + interval '1 hour') where clave = 'entrada_abierta_hasta';
select lives_ok($$ select pg_temp.datos(current_setting('test.tc'), 'c42-prop-2') $$,
  'con la entrada abierta, los móviles nuevos no tienen ese tope');
update hidrantes.config set valor = 'null' where clave = 'entrada_abierta_hasta';
update hidrantes.config set valor = '600' where clave = 'max_propuestas_dia_total';

-- Fotos, igual: el grupo a 2 × (lo que cuenta ya + 20) y los nuevos llenan su mitad.
select set_config('test.mitad_f', (hidrantes.fn_subidas_contadas() + 20)::text, true);
update hidrantes.config set valor = to_jsonb(2 * current_setting('test.mitad_f')::int) where clave = 'max_subidas_dia_total';
update hidrantes.config set valor = '1073741824' where clave = 'max_bytes_fotos';
update hidrantes.config set valor = '1000' where clave in ('max_reservas_abiertas', 'max_subidas_dispositivo_dia');
select hidrantes.fn_reservar_subida_para('c4200000-0000-4000-8000-0000000e4201')
  from generate_series(1, current_setting('test.mitad_f')::int - 4 - (select count(*)::int from hidrantes.subidas s
    join hidrantes.fn_moviles_nuevos() n on n.dispositivo_id = s.dispositivo_id
   where s.reservada_en > now() - interval '1 day'
     and (s.confirmada_en is not null or (s.reservada_en > now() - interval '2 hours' and s.liberada_en is null
                                          and not hidrantes.fn_dispositivo_liberado(s.dispositivo_id)))));
select hidrantes.fn_reservar_subida_para('c4200000-0000-4000-8000-0000000e4202') from generate_series(1, 4);
select ok(pg_temp.error_de($$ select hidrantes.fn_reservar_subida_para('c4200000-0000-4000-8000-0000000e4203') $$)
            ~ ('^CUOTA_SUBIDAS_AGOTADA: maximo=' || current_setting('test.mitad_f') || ' reintentar_en_s=[0-9]+ ambito=moviles_nuevos$'),
  'con la mitad de las fotos del grupo gastada por móviles nuevos, otro móvil nuevo espera (ambito=moviles_nuevos)');
select lives_ok($$ select hidrantes.fn_reservar_subida_para('c4200000-0000-4000-8000-0000000e4200') $$,
  'un veterano sigue subiendo');
update hidrantes.config set valor = to_jsonb(now() + interval '1 hour') where clave = 'entrada_abierta_hasta';
select lives_ok($$ select hidrantes.fn_reservar_subida_para('c4200000-0000-4000-8000-0000000e4203') $$,
  'con la entrada abierta, tampoco en las fotos');
update hidrantes.config set valor = 'null' where clave = 'entrada_abierta_hasta';
select lives_ok($$ select hidrantes.fn_reservar_subida_para(hidrantes.fn_dispositivo_admin('jefa42@example.com')) $$,
  'jefatura no tiene el tope de los móviles nuevos');
update hidrantes.config set valor = '100000' where clave = 'max_subidas_dia_total';

-- ---------- RV-402: el espacio de jefatura ----------

-- Lo justo para que no quepa una foto más contando las reservas de todos (hay más de una abierta).
create temp table esp as select * from hidrantes.fn_espacio_fotos();
select ok((select abiertas from esp) >= 2, 'hay reservas de voluntarios abiertas (condición de la prueba)');
update hidrantes.config set valor = to_jsonb((select bytes + (abiertas::bigint + 1) * 5242880 - 1 from esp))
 where clave = 'max_bytes_fotos';
select ok(pg_temp.error_de($$ select hidrantes.fn_reservar_subida_para('c4200000-0000-4000-8000-0000000e4200') $$)
            like 'SIN_ESPACIO_FOTOS:%',
  'un voluntario: las reservas de todos cuentan, SIN_ESPACIO_FOTOS');
select lives_ok($$ select hidrantes.fn_reservar_subida_para(hidrantes.fn_dispositivo_admin('jefa42@example.com')) $$,
  'jefatura: cuentan los bytes reales y solo sus reservas abiertas');
update hidrantes.config set valor = to_jsonb((select bytes + 5242880 from esp)) where clave = 'max_bytes_fotos';
select ok(pg_temp.error_de($$ select hidrantes.fn_reservar_subida_para(hidrantes.fn_dispositivo_admin('jefa42@example.com')) $$)
            like 'SIN_ESPACIO_FOTOS:%',
  'y con sus propias reservas abiertas llenando el espacio, también a jefatura le dice SIN_ESPACIO_FOTOS');
update hidrantes.config set valor = '838860800' where clave = 'max_bytes_fotos';

-- ---------- RV-402: revocar desde una hora ----------

-- Un token emitido hace dos días que sigue vivo: no entra en "desde hace una hora".
insert into hidrantes.dispositivos (dispositivo_id, token_hash, emitido_en)
values ('d4200000-0000-4000-8000-0000000e4200', 'hash-dos-dias-42', now() - interval '2 days');
select set_config('test.desde', (now() - interval '1 hour')::text, true);
select set_config('test.esperados', (select count(*)::text from hidrantes.dispositivos x
   where x.revocado_en is null and x.emitido_en >= current_setting('test.desde')::timestamptz
     and not hidrantes.fn_es_dispositivo_admin(x.dispositivo_id)), true);

select ok(has_function_privilege('authenticated', 'hidrantes.fn_contar_desde(timestamptz)', 'execute')
          and has_function_privilege('authenticated', 'hidrantes.fn_revocar_desde(timestamptz)', 'execute'),
  'fn_contar_desde y fn_revocar_desde son del panel (authenticated)');
select ok(not has_function_privilege('anon', 'hidrantes.fn_contar_desde(timestamptz)', 'execute')
          and not has_function_privilege('anon', 'hidrantes.fn_revocar_desde(timestamptz)', 'execute'),
  'y no de anon');
select throws_like($$ select hidrantes.fn_contar_desde(now() - interval '1 hour') $$, 'NO_AUTORIZADO%',
  'contar sin sesión de jefatura: NO_AUTORIZADO');
select throws_like($$ select hidrantes.fn_revocar_desde(now() - interval '1 hour') $$, 'NO_AUTORIZADO%',
  'revocar sin sesión de jefatura: NO_AUTORIZADO');

select pg_temp.jefatura();
select ok(current_setting('test.esperados')::int >= 4, 'hay al menos cuatro tokens de la última hora (condición)');
select is(hidrantes.fn_contar_desde(current_setting('test.desde')::timestamptz), current_setting('test.esperados')::int,
  'fn_contar_desde cuenta los tokens sin revocar emitidos desde esa hora');
select throws_like($$ select hidrantes.fn_contar_desde(now() - interval '31 days') $$, 'PAYLOAD_INVALIDO(desde)%',
  'más de 30 días atrás: PAYLOAD_INVALIDO(desde)');
select throws_like($$ select hidrantes.fn_revocar_desde(null) $$, 'PAYLOAD_INVALIDO(desde)%',
  'sin hora: PAYLOAD_INVALIDO(desde)');
select throws_like($$ select hidrantes.fn_revocar_desde(now() + interval '1 hour') $$, 'PAYLOAD_INVALIDO(desde)%',
  'una hora futura: PAYLOAD_INVALIDO(desde) (no revoca 0 en silencio)');
select is(hidrantes.fn_revocar_desde(current_setting('test.desde')::timestamptz), current_setting('test.esperados')::int,
  'fn_revocar_desde revoca esos mismos y dice cuántos');
select is(hidrantes.fn_contar_desde(current_setting('test.desde')::timestamptz), 0, 'después ya no queda ninguno');
select ok((select revocado_en is null from hidrantes.dispositivos where token_hash = 'hash-dos-dias-42'),
  'el token de hace dos días sigue vivo');
select ok(exists (select 1 from hidrantes.registro r
                   where r.accion = 'dispositivos_revocados' and r.dispositivo_id is null
                     and (r.despues ->> 'dispositivos')::int = current_setting('test.esperados')::int
                     and (r.despues ->> 'desde')::timestamptz = current_setting('test.desde')::timestamptz),
  'queda en el registro con el número y la hora, sin dispositivos');

-- ---------- RV-402: cambiar el código ya no abre la entrada sola (al final: revoca todos) ----------

select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'hidrantes' and p.proname = 'fn_cambiar_codigo_acceso'), 1,
  'una sola fn_cambiar_codigo_acceso: PostgREST sabe cuál llamar');
select ok(has_function_privilege('authenticated', 'hidrantes.fn_cambiar_codigo_acceso(text,boolean,boolean)', 'execute')
          and not has_function_privilege('anon', 'hidrantes.fn_cambiar_codigo_acceso(text,boolean,boolean)', 'execute'),
  'la de tres argumentos es del panel, como la anterior');
select lives_ok($$ select hidrantes.fn_cambiar_codigo_acceso(nuevo => '123456', revocar_dispositivos => true) $$,
  'el panel anterior la llama con dos argumentos y funciona');
select is(hidrantes.fn_entrada_abierta_hasta(), null, 'y revocando todos ya no abre la entrada');
select ok(exists (select 1 from hidrantes.registro where accion = 'codigo_cambiado'
                    and despues = '{"revocar_dispositivos": true, "abrir_entrada": false}'::jsonb)
          and not exists (select 1 from hidrantes.registro where accion = 'entrada_abierta'
                            and despues ->> 'motivo' like 'codigo_nuevo%'),
  'el registro dice que no se pidió abrirla, y no hay entrada abierta');
select is((select count(*)::int from hidrantes.dispositivos where revocado_en is null
            and not hidrantes.fn_es_dispositivo_admin(dispositivo_id)), 0, 'pero sí revoca todos');
select lives_ok($$ select hidrantes.fn_cambiar_codigo_acceso('654321', true, true) $$,
  'con abrir_entrada = true');
select ok(hidrantes.fn_entrada_abierta_hasta() between now() + interval '23 hours 59 minutes' and now() + interval '24 hours 1 minute',
  'la entrada se abre 24 h');
select ok(exists (select 1 from hidrantes.registro where accion = 'codigo_cambiado'
                    and (despues ->> 'abrir_entrada')::boolean),
  'y el registro dice que se pidió abrirla');

select * from finish();
rollback;
