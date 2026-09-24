-- 0028 · Salud del sistema enseña la versión del callejero sin conexión (FR-73, FR-143, docs/18 GM-04):
-- la anota cada despliegue en config.version_callejero, como la del mapa base (RV-21). Misma firma.
create or replace function hidrantes.fn_salud() returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, hidrantes as $$
begin
  perform hidrantes.fn_exigir_admin();
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
    'tareas', hidrantes.fn_config('tareas_programadas', 'null')
  );
end $$;
