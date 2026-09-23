-- Tareas de pg_cron de hidrantes con su última ejecución (TR-54, docs/17 RV-22). La lee
-- vigilancia.yml con `psql -f` y guarda el resultado en config.tareas_programadas, que Salud del
-- sistema enseña. Una fila jsonb con la lista.
--
-- `problema`: falló en los últimos 8 días, o la última ejecución es más vieja de lo que toca (26 h
-- las diarias y horarias, 8 días las semanales). Una semanal que aún no ha corrido nunca no es
-- problema (puede faltar una semana desde que se creó); una diaria sin ninguna ejecución, sí.
--
-- hidrantes_migrador es el dueño de las tareas y pg_cron le deja ver las suyas en cron.job y
-- cron.job_run_details, así que no hace falta ningún permiso más (04 §9).
with tareas as (
  select j.jobname as tarea,
         j.schedule,
         split_part(j.schedule, ' ', 5) <> '*' as semanal,
         max(d.start_time) as ultima,
         coalesce(bool_or(d.status = 'failed'), false) as fallo
  from cron.job j
  left join cron.job_run_details d on d.jobid = j.jobid and d.start_time > now() - interval '8 days'
  where j.jobname like 'hidrantes\_%'
  group by j.jobname, j.schedule
)
select coalesce(jsonb_agg(jsonb_build_object(
         'tarea', tarea,
         'ultima', ultima,
         'fallo', fallo,
         'problema', fallo
                     or (ultima is null and not semanal)
                     or ultima < now() - case when semanal then interval '8 days' else interval '26 hours' end
       ) order by tarea), '[]'::jsonb)
from tareas;
