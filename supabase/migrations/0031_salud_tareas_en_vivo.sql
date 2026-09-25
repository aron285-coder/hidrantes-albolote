-- 0031 · Salud del sistema con las tareas programadas de ahora, no las de la última vigilancia
-- (docs/22 RV-92, DEC-132).
--
-- fn_salud devolvía en 'tareas' config.tareas_programadas: la foto que tomó la vigilancia la noche
-- anterior (guardar-tareas.sql). Jefatura leía "hace 13 h" de una tarea que corre cada hora, o
-- "bien" de una que ya había fallado. Ahora 'tareas' sale de cron.job y cron.job_run_details en el
-- momento, con la misma consulta que scripts/sql/tareas-programadas.sql (ultima, fallo, problema) y
-- sin la lista de esperadas, que sigue mirando la vigilancia. Lo que sí hace: una tarea que estaba en
-- la última foto de la vigilancia y ya no está en cron.job (o no se ve, p. ej. recreada con otro
-- dueño) sale con falta = true y problema = true. Así una lista vacía o incompleta no pasa por "bien".
--
-- fn_tareas_programadas es de hidrantes_migrador (quien aplica las migraciones), el dueño de las
-- tareas: pg_cron le deja ver las suyas y arranque-bd.sql le da select en las dos tablas. Si aun así
-- falla (pg_cron quita el permiso, o no está), fn_salud devuelve la foto de la vigilancia y lo dice
-- con 'tareas_origen' = 'vigilancia' y 'tareas_medidas_en'.
--
-- Compatibilidad (04 §12): fn_salud mantiene la firma; 'tareas' tiene la misma forma que la foto
-- ({ tarea, ultima, fallo, falta, problema }) y las claves nuevas se ignoran en el panel anterior.

-- plpgsql y no sql: el cuerpo se resuelve al llamarla, así que la migración no falla en una base
-- sin pg_cron (fn_salud recoge el error y usa la foto).
create function hidrantes.fn_tareas_programadas() returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, hidrantes, cron as $$
begin
  return (
    with tareas as (
      select j.jobname as tarea,
             split_part(j.schedule, ' ', 5) <> '*' as semanal,
             (select max(d.start_time) from cron.job_run_details d where d.jobid = j.jobid) as ultima,
             exists (select 1 from cron.job_run_details d
                      where d.jobid = j.jobid and d.status = 'failed'
                        and d.start_time > now() - interval '8 days') as fallo
      from cron.job j
      where j.jobname like 'hidrantes\_%'
    ),
    sistema as (
      select coalesce((select min(start_time) from cron.job_run_details) < now() - interval '8 days', false) as rodado
    ),
    -- Las que conocía la última foto de la vigilancia.
    conocidas as (
      select distinct e ->> 'tarea' as tarea
      from hidrantes.config c,
           jsonb_array_elements(case when jsonb_typeof(c.valor) = 'array' then c.valor else '[]'::jsonb end) e
      where c.clave = 'tareas_programadas' and e ->> 'tarea' like 'hidrantes\_%'
    ),
    filas as (
      select t.tarea, t.ultima, t.fallo, false as falta,
             t.fallo
             or (t.ultima is null and (not t.semanal or s.rodado))
             or coalesce(t.ultima < now() - case when t.semanal then interval '8 days'
                                                  else interval '26 hours' end, false) as problema
      from tareas t, sistema s
      union all
      select k.tarea, null, false, true, true
      from conocidas k
      where not exists (select 1 from tareas t where t.tarea = k.tarea)
    )
    select coalesce(jsonb_agg(jsonb_build_object(
             'tarea', f.tarea, 'ultima', f.ultima, 'fallo', f.fallo, 'falta', f.falta, 'problema', f.problema
           ) order by f.tarea), '[]'::jsonb)
    from filas f
  );
end $$;

revoke all on function hidrantes.fn_tareas_programadas() from public, anon, authenticated;

-- Misma firma y mismas claves que 0028, más tareas_origen y (solo con la foto) tareas_medidas_en.
create or replace function hidrantes.fn_salud() returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, hidrantes as $$
declare
  tareas jsonb;
  origen jsonb;
begin
  perform hidrantes.fn_exigir_admin();
  begin
    tareas := hidrantes.fn_tareas_programadas();
    origen := jsonb_build_object('tareas_origen', 'en_vivo');
  exception when insufficient_privilege or undefined_table or invalid_schema_name or undefined_function then
    -- Sin acceso a pg_cron: la foto de la vigilancia, diciendo de cuándo es.
    tareas := hidrantes.fn_config('tareas_programadas', 'null');
    origen := jsonb_build_object(
      'tareas_origen', 'vigilancia',
      'tareas_error', sqlstate,
      'tareas_medidas_en', (select to_jsonb(c.actualizado_en) from hidrantes.config c where c.clave = 'tareas_programadas'));
  end;
  return jsonb_build_object(
    'pendientes_14d', (select count(*) from hidrantes.propuestas where estado = 'pendiente'
                         and creada_en < now() - interval '14 days'),
    'incidencias_abiertas', (select count(*) from hidrantes.incidencias_app where estado = 'abierta'),
    'errores_7d', (select count(*) from hidrantes.errores_cliente where momento > now() - interval '7 days'),
    'sin_direccion', (select count(*) from hidrantes.puntos where situacion = 'activo' and direccion is null),
    'ultimo_respaldo', hidrantes.fn_config('ultimo_respaldo', 'null'),
    'storage_bytes', hidrantes.fn_config('storage_bytes', 'null'),
    'version_zona', hidrantes.fn_config('version_zona', 'null'),
    'version_mapabase', hidrantes.fn_config('version_mapabase', 'null'),
    'version_callejero', hidrantes.fn_config('version_callejero', 'null'),
    'ultima_vigilancia', hidrantes.fn_config('ultima_vigilancia', 'null'),
    'vigilancia_ok', hidrantes.fn_config('vigilancia_ok', 'null'),
    'dispositivos_activos', (select count(*) from hidrantes.dispositivos where revocado_en is null
                               and ultimo_uso > now() - interval '90 days'),
    'intentos_fallidos_24h', (select count(*) from hidrantes.intentos_codigo
                                where momento > now() - interval '24 hours' and not exito and not bloqueado),
    'topes_alcanzados_24h', (select count(*) from hidrantes.intentos_codigo
                               where momento > now() - interval '24 hours' and bloqueado),
    'topes_globales_24h', (select count(*) from hidrantes.intentos_codigo
                             where momento > now() - interval '24 hours' and bloqueado
                               and tope in ('global', 'altas_global')),
    -- Toda la base de datos (también uniformidad) y solo lo nuestro (RV-22).
    'bd_bytes', pg_database_size(current_database()),
    'esquema_bytes', (select coalesce(sum(pg_total_relation_size(c.oid)), 0)
                        from pg_class c join pg_namespace n on n.oid = c.relnamespace
                       where n.nspname = 'hidrantes' and c.relkind in ('r', 'm')),
    'tareas', tareas
  ) || origen;
end $$;

revoke all on function hidrantes.fn_salud() from public, anon;
