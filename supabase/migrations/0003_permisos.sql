-- 0003 · Permisos y RLS (05 §5).
--   anon           → ningún acceso directo a tablas ni vistas (solo RPC de voluntario, Fase 3)
--   authenticated  → select condicionado a fn_es_admin(); nunca escribe directamente
--   service_role   → todo (workflows de respaldo, purga y promoción)
-- Toda tabla con RLS activado y al menos una política (05 §5).

-- Punto de partida explícito: nadie tiene nada.
revoke all on all tables    in schema hidrantes from public, anon, authenticated;
revoke all on all sequences in schema hidrantes from public, anon, authenticated;
revoke all on all functions in schema hidrantes from public, anon, authenticated;

-- Las vistas usan estos helpers con los permisos de quien consulta (security_invoker). Solo
-- devuelven lo que RLS deja ver, que para authenticated es nada salvo que sea administrador.
grant execute on function hidrantes.fn_es_admin() to authenticated;
grant execute on function hidrantes.fn_config(text, jsonb) to authenticated;
grant execute on function hidrantes.fn_radio_px(smallint, hidrantes.estado_caudal) to authenticated;
grant execute on function hidrantes.fn_municipio_de(extensions.geography) to authenticated;

-- Lectura para el panel; la fila la filtra la política.
grant select on all tables in schema hidrantes to authenticated;
revoke select on hidrantes.migraciones_aplicadas from authenticated;

-- service_role: todo menos reescribir el registro (el trigger lo impediría de todos modos).
grant all on all tables    in schema hidrantes to service_role;
grant all on all sequences in schema hidrantes to service_role;
revoke update, delete, truncate on hidrantes.registro from service_role;

-- ---------- RLS ----------

do $$
declare
  t text;
begin
  foreach t in array array[
    'puntos', 'propuestas', 'registro', 'dispositivos', 'intentos_codigo', 'subidas',
    'incidencias_app', 'errores_cliente', 'administradores', 'config', 'limite_municipal',
    'nucleos', 'suscripciones_push', 'notificaciones', 'migraciones_aplicadas'
  ] loop
    execute format('alter table hidrantes.%I enable row level security', t);
  end loop;
end $$;

-- Lectura solo para administradores (una política por tabla; (select …) se evalúa una vez).
do $$
declare
  t text;
begin
  foreach t in array array[
    'puntos', 'propuestas', 'registro', 'dispositivos', 'intentos_codigo', 'subidas',
    'incidencias_app', 'errores_cliente', 'administradores', 'config', 'limite_municipal',
    'nucleos', 'suscripciones_push', 'notificaciones'
  ] loop
    execute format(
      'create policy %I on hidrantes.%I for select to authenticated using ((select hidrantes.fn_es_admin()))',
      t || '_lectura_admin', t
    );
  end loop;
end $$;

-- Historial de migraciones: solo lo toca su propietario (hidrantes_migrador), que no pasa por RLS.
create policy migraciones_sin_acceso on hidrantes.migraciones_aplicadas for select to authenticated using (false);

-- Registro: ninguna política de update/delete para nadie; el trigger de 0001 es la segunda capa.
comment on table hidrantes.registro is
  'Auditoría append-only (05 §2.3). Sin políticas de update/delete; trigger registro_inmutable.';
