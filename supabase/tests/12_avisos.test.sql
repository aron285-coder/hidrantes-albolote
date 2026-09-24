-- Avisos push (FR-163, FR-164, docs/17 RV-08): reclamar no es enviar. Un aviso reclamado que nadie
-- anota vuelve a salir a los 15 minutos; al cuarto intento queda como SIN_RESPUESTA.
begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
set search_path = extensions, public;

select plan(10);

insert into hidrantes.suscripciones_push (id, email, suscripcion, temas)
values ('00000000-0000-4000-8000-0000000c0001', 'avisos@example.com', '{"endpoint":"https://push.example.net/a"}', '{}');

create function pg_temp.aviso(titulo text) returns bigint language sql as $$
  insert into hidrantes.notificaciones (suscripcion_id, titulo, cuerpo)
  values ('00000000-0000-4000-8000-0000000c0001', titulo, 'x') returning id;
$$;

select set_config('test.a', pg_temp.aviso('a')::text, true);
select hidrantes.fn_reclamar_notificaciones(10);

select ok((select enviada_en is null and reclamada_en is not null and intentos = 1
           from hidrantes.notificaciones where id = current_setting('test.a')::bigint),
  'reclamar no marca enviada_en: solo reclamada_en e intentos');
select is((select count(*)::int from hidrantes.fn_reclamar_notificaciones(10)), 0,
  'una reclamada hace un momento no se vuelve a reclamar');

update hidrantes.notificaciones set reclamada_en = now() - interval '16 minutes' where id = current_setting('test.a')::bigint;
select is((select array_agg(id) from hidrantes.fn_reclamar_notificaciones(10)), array[current_setting('test.a')::bigint],
  'una reclamada hace 16 min se vuelve a reclamar');
update hidrantes.notificaciones set reclamada_en = now() - interval '5 minutes' where id = current_setting('test.a')::bigint;
select is((select count(*)::int from hidrantes.fn_reclamar_notificaciones(10)), 0, 'una de hace 5 min no');

-- Tercer intento y, al llegar el cuarto, se da por perdida.
update hidrantes.notificaciones set reclamada_en = now() - interval '16 minutes' where id = current_setting('test.a')::bigint;
select hidrantes.fn_reclamar_notificaciones(10);
update hidrantes.notificaciones set reclamada_en = now() - interval '16 minutes' where id = current_setting('test.a')::bigint;
select is((select count(*)::int from hidrantes.fn_reclamar_notificaciones(10)), 0, 'al cuarto intento no se devuelve');
select is((select error from hidrantes.notificaciones where id = current_setting('test.a')::bigint), 'SIN_RESPUESTA',
  'al cuarto intento queda error = SIN_RESPUESTA');

-- Resultado bueno: ahora sí, enviada.
select set_config('test.b', pg_temp.aviso('b')::text, true);
select hidrantes.fn_reclamar_notificaciones(10);
select hidrantes.fn_resultado_notificacion(current_setting('test.b')::bigint, true, null, false);
select ok((select enviada_en is not null from hidrantes.notificaciones where id = current_setting('test.b')::bigint),
  'resultado ok marca enviada_en');

-- El límite se acota a 50 (el plan gratuito de Workers permite 50 peticiones por invocación).
select pg_temp.aviso('l' || i) from generate_series(1, 60) i;
select is((select count(*)::int from hidrantes.fn_reclamar_notificaciones(500)), 50, 'el límite se acota a 50');

-- ---------- dos sesiones reclamando a la vez (patrón de 07_concurrencia_rpc) ----------

create temp table conexion as
select format('dbname=postgres user=postgres password=postgres host=%s port=%s',
              host(inet_server_addr()), inet_server_port()) as cadena,
       gen_random_uuid() as suscripcion;
select dblink_connect(s, (select cadena from conexion)) from unnest(array['a0', 'a1', 'a2']) s;
select dblink_exec('a0', format($f$
  insert into hidrantes.suscripciones_push (id, email, suscripcion, temas)
  values (%1$L, 'concurrencia-avisos@example.com', '{"endpoint":"https://push.example.net/c"}', '{}');
  insert into hidrantes.notificaciones (suscripcion_id, titulo, cuerpo)
  select %1$L, 'c' || i, 'x' from generate_series(1, 10) i;
$f$, (select suscripcion from conexion)));

select dblink_exec(s, 'begin') from unnest(array['a1', 'a2']) s;
create temp table r1 as select * from dblink('a1', format(
  'select id from hidrantes.fn_reclamar_notificaciones(6) r join hidrantes.notificaciones n using (id) where n.suscripcion_id = %L',
  (select suscripcion from conexion))) as t(id bigint);
create temp table r2 as select * from dblink('a2', format(
  'select id from hidrantes.fn_reclamar_notificaciones(50) r join hidrantes.notificaciones n using (id) where n.suscripcion_id = %L',
  (select suscripcion from conexion))) as t(id bigint);
select dblink_exec(s, 'commit') from unnest(array['a1', 'a2']) s;

select is((select count(*)::int from r1 join r2 using (id)), 0, 'dos sesiones reclaman a la vez sin repetir ids');
select is((select count(*)::int from (select id from r1 union select id from r2) u), 10, 'y entre las dos salen todas');

select dblink_exec('a0', format('delete from hidrantes.suscripciones_push where id = %L', (select suscripcion from conexion)));
select dblink_disconnect(s) from unnest(array['a0', 'a1', 'a2']) s;

select * from finish();
rollback;
