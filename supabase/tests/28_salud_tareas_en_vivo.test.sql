-- Salud del sistema con las tareas programadas de ahora (docs/22 RV-92, DEC-132): fn_salud()->'tareas'
-- sale de cron.job y cron.job_run_details en el momento, no de la foto de la vigilancia.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;

select plan(11);

insert into hidrantes.administradores (email, creado_por) values ('salud-vivo@example.com', 'test') on conflict do nothing;
-- Una foto de la vigilancia que ya no es verdad: la tarea horaria "bien" y nada más.
insert into hidrantes.config (clave, valor, actualizado_por)
values ('tareas_programadas', '[{"tarea":"hidrantes_foto_vieja","problema":false}]', 'vigilancia.yml')
on conflict (clave) do update set valor = excluded.valor;

create function pg_temp.como_admin() returns void language sql as $$
  select set_config('request.jwt.claims', '{"role":"authenticated","email":"salud-vivo@example.com","amr":[{"method":"oauth","timestamp":1}],"app_metadata":{"provider":"google","providers":["google"]}}', true);
$$;

-- Una ejecución fallida de hace una hora de purgar_intentos, a nombre del dueño de las tareas.
-- runid a mano: postgres no puede usar cron.runid_seq en el Supabase local (como en ci.yml, RV-38).
insert into cron.job_run_details (jobid, runid, database, username, command, status, return_message,
                                  start_time, end_time)
select j.jobid, (select coalesce(max(runid), 0) + 2000000 from cron.job_run_details), current_database(),
       j.username, j.command, 'failed', 'prueba RV-92', now() - interval '1 hour', now() - interval '1 hour'
from cron.job j where j.jobname = 'hidrantes_purgar_intentos';

select pg_temp.como_admin();
set local role authenticated;
create temp table salud as select hidrantes.fn_salud() as s;
reset role;

select is((select s ->> 'tareas_origen' from salud), 'en_vivo', 'fn_salud dice que las tareas son de ahora mismo');
select set_eq(
  $$ select t ->> 'tarea' from salud, jsonb_array_elements(s -> 'tareas') t $$,
  $$ select jobname::text from cron.job where jobname like 'hidrantes\_%' $$,
  'una fila por cada tarea hidrantes_% de cron.job, y no la de la foto');
select ok(not (select s ? 'tareas_medidas_en' from salud), 'en vivo no lleva tareas_medidas_en');
select ok((select (t ->> 'fallo')::boolean and (t ->> 'problema')::boolean
             from salud, jsonb_array_elements(s -> 'tareas') t where t ->> 'tarea' = 'hidrantes_purgar_intentos'),
  'una ejecución fallida hace una hora: fallo y problema');
select ok((select (t ->> 'ultima')::timestamptz > now() - interval '2 hours'
             from salud, jsonb_array_elements(s -> 'tareas') t where t ->> 'tarea' = 'hidrantes_purgar_intentos'),
  'y su última ejecución es la de hace una hora, no la de la foto');

-- Solo la llama fn_salud.
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
select pg_temp.como_admin();
set local role authenticated;
create temp table salud_foto as select hidrantes.fn_salud() as s;
reset role;
select is((select s ->> 'tareas_origen' from salud_foto), 'vigilancia', 'sin permiso en pg_cron: tareas_origen = vigilancia');
select ok((select s -> 'tareas' -> 0 ->> 'tarea' = 'hidrantes_foto_vieja'
              and (s ->> 'tareas_medidas_en')::timestamptz is not null from salud_foto),
  'con la foto de la vigilancia y su fecha en tareas_medidas_en');

select * from finish();
rollback;
