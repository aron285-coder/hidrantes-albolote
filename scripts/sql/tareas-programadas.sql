-- Tareas de pg_cron de hidrantes con su última ejecución (TR-54, docs/17 RV-22). La lee
-- vigilancia.yml con `psql -f` y la guarda con guardar-tareas.sql en config.tareas_programadas, que
-- Salud del sistema enseña. Una fila jsonb con la lista.
--
-- `ultima` es la ejecución más reciente de **todo** el historial; `fallo`, si falló en los últimos
-- 8 días (docs/18 RV-38: con el historial limitado a 8 días, una semanal que dejó de correr hace 20
-- días daba ultima = null y no contaba como problema).
--
-- `problema`: falló en los últimos 8 días, o la última ejecución es más vieja de lo que toca (26 h
-- las diarias y horarias, 8 días las semanales), o no ha corrido nunca: una diaria, siempre; una
-- semanal, si el sistema lleva más de 8 días ejecutando tareas (antes aún puede faltarle su día).
--
-- hidrantes_migrador es el dueño de las tareas y pg_cron le deja ver las suyas en cron.job y
-- cron.job_run_details, así que no hace falta ningún permiso más (04 §9).
with tareas as (
  select j.jobname as tarea,
         j.schedule,
         split_part(j.schedule, ' ', 5) <> '*' as semanal,
         (select max(d.start_time) from cron.job_run_details d where d.jobid = j.jobid) as ultima,
         exists (select 1 from cron.job_run_details d
                  where d.jobid = j.jobid and d.status = 'failed' and d.start_time > now() - interval '8 days') as fallo
  from cron.job j
  where j.jobname like 'hidrantes\_%'
),
sistema as (
  select coalesce((select min(start_time) from cron.job_run_details) < now() - interval '8 days', false) as rodado
)
select coalesce(jsonb_agg(jsonb_build_object(
         'tarea', tarea,
         'ultima', ultima,
         'fallo', fallo,
         'problema', fallo
                     or (ultima is null and (not semanal or sistema.rodado))
                     or ultima < now() - case when semanal then interval '8 days' else interval '26 hours' end
       ) order by tarea), '[]'::jsonb)
from tareas, sistema;
