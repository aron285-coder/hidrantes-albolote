-- Salud del sistema con las tareas programadas de ahora (docs/22 RV-92, 0031, DEC-132): fn_salud()->'tareas'
-- sale de cron.job y cron.job_run_details en el momento, no de la foto de la vigilancia.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;

select plan(18);

insert into hidrantes.administradores (email, creado_por) values ('salud-vivo@example.com', 'test') on conflict do nothing;
-- Una foto de la vigilancia que ya no es verdad: una tarea que ya no está en cron.job, "bien".
insert into hidrantes.config (clave, valor, actualizado_por)
values ('tareas_programadas', '[{"tarea":"hidrantes_foto_vieja","problema":false}]', 'vigilancia.yml')
on conflict (clave) do update set valor = excluded.valor;

create function pg_temp.como_admin() returns void language sql as $$
  select set_config('request.jwt.claims', '{"role":"authenticated","email":"salud-vivo@example.com","amr":[{"method":"oauth","timestamp":1}],"app_metadata":{"provider":"google","providers":["google"]}}', true);
$$;

-- Ejecuciones de prueba a nombre del dueño de cada tarea. runid a mano: postgres no puede usar
-- cron.runid_seq en el Supabase local (como en ci.yml, RV-38).
create function pg_temp.ejecucion(tarea text, estado text, hace interval, n integer) returns void language sql as $$
  insert into cron.job_run_details (jobid, runid, database, username, command, status, return_message,
                                    start_time, end_time)
  select j.jobid, (select coalesce(max(runid), 0) + 2000000 + n from cron.job_run_details), current_database(),
         j.username, j.command, estado, 'prueba RV-92', now() - hace, now() - hace
  from cron.job j where j.jobname = tarea;
$$;
-- Horaria, fallida hace una hora; diaria, bien hace una hora; diaria, bien pero hace 30 h.
select pg_temp.ejecucion('hidrantes_purgar_intentos', 'failed', interval '1 hour', 1);
select pg_temp.ejecucion('hidrantes_purgar_errores', 'succeeded', interval '1 hour', 2);
select pg_temp.ejecucion('hidrantes_revocar_tokens', 'succeeded', interval '30 hours', 3);

create function pg_temp.tarea(s jsonb, nombre text) returns jsonb language sql as $$
  select t from jsonb_array_elements(s -> 'tareas') t where t ->> 'tarea' = nombre;
$$;

select pg_temp.como_admin();
set local role authenticated;
create temp table salud as select hidrantes.fn_salud() as s;
reset role;

select is((select s ->> 'tareas_origen' from salud), 'en_vivo', 'fn_salud dice que las tareas son de ahora mismo');
select set_eq(
  $$ select t ->> 'tarea' from salud, jsonb_array_elements(s -> 'tareas') t where not (t ->> 'falta')::boolean $$,
  $$ select jobname::text from cron.job where jobname like 'hidrantes\_%' $$,
  'una fila por cada tarea hidrantes_% de cron.job');
select ok((select count(*) >= 7 from cron.job where jobname like 'hidrantes\_%'),
  'y cron.job tiene de verdad las tareas (el set_eq no compara dos listas vacías)');
select ok(not (select s ? 'tareas_medidas_en' from salud), 'en vivo no lleva tareas_medidas_en');
select ok((select (pg_temp.tarea(s, 'hidrantes_purgar_intentos') ->> 'fallo')::boolean
              and (pg_temp.tarea(s, 'hidrantes_purgar_intentos') ->> 'problema')::boolean from salud),
  'una ejecución fallida hace una hora: fallo y problema');
select ok((select (pg_temp.tarea(s, 'hidrantes_purgar_intentos') ->> 'ultima')::timestamptz > now() - interval '2 hours'
             from salud),
  'y su última ejecución es la de hace una hora');
select ok((select not (pg_temp.tarea(s, 'hidrantes_purgar_errores') ->> 'problema')::boolean from salud),
  'una diaria que corrió bien hace una hora no es un problema');
select ok((select (pg_temp.tarea(s, 'hidrantes_revocar_tokens') ->> 'problema')::boolean from salud),
  'una diaria cuya última ejecución es de hace 30 h, sí');
select ok((select (pg_temp.tarea(s, 'hidrantes_foto_vieja') ->> 'falta')::boolean
              and (pg_temp.tarea(s, 'hidrantes_foto_vieja') ->> 'problema')::boolean from salud),
  'una tarea de la última foto que ya no está en cron.job sale como que falta, y es un problema');

-- Solo la llama fn_salud, y es del dueño de las tareas.
select is((select proowner::regrole::text from pg_proc where oid = 'hidrantes.fn_tareas_programadas()'::regprocedure),
  'hidrantes_migrador', 'fn_tareas_programadas es de hidrantes_migrador');
select ok(not has_function_privilege('anon', 'hidrantes.fn_tareas_programadas()', 'execute')
          and not has_function_privilege('authenticated', 'hidrantes.fn_tareas_programadas()', 'execute'),
  'ni anon ni authenticated tienen execute');
set local role anon;
select throws_ok($$ select hidrantes.fn_tareas_programadas() $$, '42501', null, 'anon no ejecuta fn_tareas_programadas');
reset role;
select pg_temp.como_admin();
set local role authenticated;
select throws_ok($$ select hidrantes.fn_tareas_programadas() $$, '42501', null, 'authenticated tampoco');
reset role;

-- fn_salud sigue exigiendo administrador.
select set_config('request.jwt.claims', '', true);
set local role authenticated;
select throws_like($$ select hidrantes.fn_salud() $$, 'NO_AUTORIZADO%', 'fn_salud sin sesión de jefatura: NO_AUTORIZADO');
reset role;
set local role anon;
select throws_ok($$ select hidrantes.fn_salud() $$, '42501', null, 'y anon ni la puede llamar');
reset role;

-- Si pg_cron deja de dar permiso, la foto de la vigilancia, diciendo de cuándo es. (El revoke se
-- deshace con el rollback final.)
revoke select on cron.job_run_details from hidrantes_migrador;
select ok(not has_table_privilege('hidrantes_migrador', 'cron.job_run_details', 'select'),
  'el revoke de la prueba quita de verdad la lectura (si no, lo que sigue no probaría nada)');
select pg_temp.como_admin();
set local role authenticated;
create temp table salud_foto as select hidrantes.fn_salud() as s;
reset role;
select ok((select s ->> 'tareas_origen' = 'vigilancia' and s ->> 'tareas_error' = '42501' from salud_foto),
  'sin permiso en pg_cron: tareas_origen = vigilancia, con el motivo');
select ok((select s -> 'tareas' -> 0 ->> 'tarea' = 'hidrantes_foto_vieja'
              and (s ->> 'tareas_medidas_en')::timestamptz is not null from salud_foto),
  'con la foto de la vigilancia y su fecha en tareas_medidas_en');

select * from finish();
rollback;
