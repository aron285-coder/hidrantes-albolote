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
-- `falta` (docs/19 RV-56): una tarea de scripts/sql/tareas-esperadas.txt que no está en cron.job. Es
-- un problema, y con todas faltando (una lista vacía tras restaurar en un proyecto nuevo) también.
-- La lista llega en la variable de psql `esperadas`, separada por comas:
--   psql -v esperadas="$(paste -sd, scripts/sql/tareas-esperadas.txt)" -f scripts/sql/tareas-programadas.sql
-- Sin ella no se espera ninguna (como antes).
--
-- hidrantes_migrador es el dueño de las tareas y pg_cron le deja ver las suyas en cron.job y
-- cron.job_run_details, así que no hace falta ningún permiso más (04 §9).
\if :{?esperadas}
\else
\set esperadas ''
\endif
with esperadas as (
  select trim(e) as tarea from unnest(string_to_array(:'esperadas', ',')) e where trim(e) <> ''
),
tareas as (
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
),
filas as (
  select tarea, ultima, fallo, false as falta,
         fallo
         or (ultima is null and (not semanal or sistema.rodado))
         or ultima < now() - case when semanal then interval '8 days' else interval '26 hours' end as problema
  from tareas, sistema
  union all
  select e.tarea, null, false, true, true
  from esperadas e
  where not exists (select 1 from tareas t where t.tarea = e.tarea)
)
select coalesce(jsonb_agg(jsonb_build_object(
         'tarea', tarea,
         'ultima', ultima,
         'fallo', fallo,
         'falta', falta,
         'problema', problema
       ) order by tarea), '[]'::jsonb)
from filas;
