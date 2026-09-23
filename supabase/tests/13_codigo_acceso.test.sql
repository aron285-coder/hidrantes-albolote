-- Canje del código de acceso (TR-41, 11 §3, docs/17 RV-14): el tope global de fallos, el tope de
-- canjes buenos, la anotación de los topes y la cuenta bajo bloqueo con dos sesiones a la vez.
begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
set search_path = extensions, public;

select plan(9);

insert into hidrantes.config (clave, valor, actualizado_por)
values ('codigo_acceso_hash', to_jsonb(extensions.crypt('482917', extensions.gen_salt('bf', 4))), 'test')
on conflict (clave) do update set valor = excluded.valor;

select is(hidrantes.fn_config('max_altas_ip_dia', 'null'), '150'::jsonb, 'tope de canjes buenos por IP y día: 150');
select is(hidrantes.fn_config('max_altas_global_hora', 'null'), '150'::jsonb, 'tope de canjes buenos por hora: 150');

-- ---------- dos sesiones a la vez con 199 fallos (dblink) ----------
-- Va primero: fn_verificar_codigo toma un bloqueo consultivo hasta el final de la transacción, y si
-- esta sesión lo tuviera ya, las otras dos esperarían a un rollback que no llega. Las otras sesiones
-- solo ven lo confirmado.

create temp table conexion as
select format('dbname=postgres user=postgres password=postgres host=%s port=%s',
              host(inet_server_addr()), inet_server_port()) as cadena,
       'ip-conc-' || gen_random_uuid() as prefijo;
select dblink_connect(s, (select cadena from conexion)) from unnest(array['c0', 'c1', 'c2']) s;

-- Hasta 199 fallos confirmados en la última hora (contando los que ya hubiera).
select dblink_exec('c0', format($f$
  insert into hidrantes.intentos_codigo (dispositivo_id, ip_hash, exito)
  select gen_random_uuid(), %1$L || i, false
  from generate_series(1, greatest(0, 199 - (select count(*) from hidrantes.intentos_codigo
                                          where momento > now() - interval '1 hour' and not exito and not bloqueado))) i;
$f$, (select prefijo from conexion)));

select diag('fallos confirmados antes: ' || (select x from dblink('c0',
  'select count(*)::text from hidrantes.intentos_codigo where momento > now() - interval ''1 hour'' and not exito and not bloqueado') as t(x text)));
select dblink_exec('c1', 'begin');
create temp table r1 as select * from dblink('c1', format($q$select error from hidrantes.fn_verificar_codigo('000000', gen_random_uuid(), %L)$q$,
  (select prefijo from conexion) || '-a')) as t(e text);
select dblink_send_query('c2', format($q$select error from hidrantes.fn_verificar_codigo('000000', gen_random_uuid(), %L)$q$,
  (select prefijo from conexion) || '-b'));
select pg_sleep(0.5);
select dblink_exec('c1', 'commit');
create temp table r2 as select * from dblink_get_result('c2', false) as t(e text);
select diag('c1: ' || coalesce((select string_agg(coalesce(e, 'NULL'), ',') from r1), 'sin filas') || ' · c2: ' ||
  coalesce((select string_agg(coalesce(e, 'NULL'), ',') from r2), 'sin filas') || ' · error c2: ' ||
  coalesce(dblink_error_message('c2'), '-'));
select * from dblink_get_result('c2', false) as t(e text);

select is((select e from r2), 'DEMASIADOS_INTENTOS',
  'con 199 fallos, dos a la vez: la segunda espera al bloqueo, ve 200 y no llega a comparar');
select is((select count(*)::int from dblink('c0', format(
  'select 1 from hidrantes.intentos_codigo where ip_hash like %L and not bloqueado and not exito',
  (select prefijo from conexion) || '-%')) as t(x int)), 1, 'solo una de las dos cuenta como intento comparado');

select dblink_exec('c0', format('delete from hidrantes.intentos_codigo where ip_hash like %L',
  (select prefijo from conexion) || '%'));
select dblink_disconnect(s) from unnest(array['c0', 'c1', 'c2']) s;

-- ---------- 150 canjes buenos desde una IP en 24 h ----------

insert into hidrantes.intentos_codigo (dispositivo_id, ip_hash, exito, momento)
select gen_random_uuid(), 'ip-altas', true, now() - interval '3 hours' from generate_series(1, 150);
select set_config('test.dispositivos', (select count(*)::text from hidrantes.dispositivos), true);
select is((select error from hidrantes.fn_verificar_codigo('482917', gen_random_uuid(), 'ip-altas')), 'DEMASIADOS_INTENTOS',
  '150 canjes buenos desde una IP en 24 h bloquean el 151.º');
select is((select count(*)::text from hidrantes.dispositivos), current_setting('test.dispositivos'),
  'y no se crea dispositivo');
select ok(exists (select 1 from hidrantes.intentos_codigo where ip_hash = 'ip-altas' and bloqueado),
  'un tope alcanzado se anota con bloqueado = true');
select ok((select not exito from hidrantes.intentos_codigo where ip_hash = 'ip-altas' and bloqueado limit 1),
  'y como intento no conseguido');

-- ---------- TR-41: 200 fallos en la última hora, en total ----------

insert into hidrantes.intentos_codigo (dispositivo_id, ip_hash, exito)
select gen_random_uuid(), 'ip-fallo-' || i, false from generate_series(1, 200) i;
select is((select error from hidrantes.fn_verificar_codigo('482917', gen_random_uuid(), 'ip-nueva-tr41')),
  'DEMASIADOS_INTENTOS', 'TR-41: con 200 fallos en la última hora, un móvil y una IP nuevos tampoco entran');

select * from finish();
rollback;
