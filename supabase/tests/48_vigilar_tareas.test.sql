-- docs/39 RV-517 (0051, DEC-220): la base de datos vigila que las tareas sigan vivas. fn_vigilar_tareas manda el aviso
-- técnico `tareas_paradas` si la vigilancia lleva más de 36 h sin pasar o el respaldo más de 9 días (este, solo con
-- vigilar_respaldo a true), como mucho uno cada 24 h. Todo dentro de una transacción que se deshace.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;

select plan(12);

insert into hidrantes.administradores (email, creado_por) values ('jefa-rv517@example.com', 'test') on conflict do nothing;
insert into hidrantes.suscripciones_push (id, email, suscripcion, temas) values
  ('00000000-0000-4000-8000-0000000051b1', 'jefa-rv517@example.com',
   '{"endpoint": "https://fcm.googleapis.com/fcm/send/rv517", "keys": {"p256dh": "p", "auth": "a"}}', array['avisos_tecnicos']);

create function pg_temp.poner(clave text, valor jsonb) returns void language sql as $$
  insert into hidrantes.config (clave, valor) values (clave, valor)
  on conflict (clave) do update set valor = excluded.valor;
$$;
create function pg_temp.hace(i interval) returns jsonb language sql as $$ select to_jsonb(now() - i) $$;
create function pg_temp.avisos() returns int language sql as $$
  select count(*)::int from hidrantes.notificaciones
   where suscripcion_id = '00000000-0000-4000-8000-0000000051b1'
     and cuerpo like 'Las tareas automáticas%';
$$;
create function pg_temp.olvidar() returns void language sql as $$
  delete from hidrantes.avisos_tecnicos where clave = 'tareas_paradas';
  delete from hidrantes.notificaciones where suscripcion_id = '00000000-0000-4000-8000-0000000051b1';
$$;

select pg_temp.olvidar();
delete from hidrantes.config where clave = 'vigilar_respaldo';

-- Las dos al día: nada.
select pg_temp.poner('ultima_vigilancia', pg_temp.hace('2 hours'));
select pg_temp.poner('ultimo_respaldo', pg_temp.hace('2 days'));
select is(hidrantes.fn_vigilar_tareas(), false, 'con la vigilancia y el respaldo al día, nada');
select is(pg_temp.avisos(), 0, 'ninguna notificación');

-- La vigilancia de hace 37 h: un aviso.
select pg_temp.poner('ultima_vigilancia', pg_temp.hace('37 hours'));
select is(hidrantes.fn_vigilar_tareas(), true, 'la vigilancia de hace 37 h: aviso');
select is(pg_temp.avisos(), 1, 'una notificación tareas_paradas a la administradora activa suscrita');
select is(hidrantes.fn_vigilar_tareas(), false, 'otra llamada seguida no vuelve a avisar');
select is(pg_temp.avisos(), 1, 'sigue habiendo una');

-- Sin vigilancia anotada nunca, también.
select pg_temp.olvidar();
delete from hidrantes.config where clave = 'ultima_vigilancia';
select is(hidrantes.fn_vigilar_tareas(), true, 'sin ultima_vigilancia: aviso');

-- El respaldo viejo, solo si vigilar_respaldo está a true (por defecto).
select pg_temp.olvidar();
select pg_temp.poner('ultima_vigilancia', pg_temp.hace('1 hour'));
select pg_temp.poner('ultimo_respaldo', pg_temp.hace('10 days'));
select is(hidrantes.fn_vigilar_tareas(), true, 'el respaldo de hace 10 días, con vigilar_respaldo por defecto: aviso');
select pg_temp.olvidar();
select pg_temp.poner('vigilar_respaldo', 'false');
select is(hidrantes.fn_vigilar_tareas(), false, 'con vigilar_respaldo a false, el respaldo viejo no avisa');

-- La tarea y los permisos.
select is((select schedule from cron.job where jobname = 'hidrantes_vigilar_tareas'), '0 8 * * *',
  'la tarea hidrantes_vigilar_tareas, a las 08:00 UTC');
select ok(not has_function_privilege('anon', 'hidrantes.fn_vigilar_tareas()', 'execute'), 'anon no la ejecuta');
select ok(not has_function_privilege('authenticated', 'hidrantes.fn_vigilar_tareas()', 'execute'),
  'authenticated tampoco');

select * from finish();
rollback;
