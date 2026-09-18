-- 0004 · Valores iniciales de config y tareas programadas con pg_cron (05 §2.10, 04 §9).
-- El administrador propietario NO va aquí: el repositorio es público (DEC-053). Lo da de alta
-- scripts/asegurar-propietario.ts en cada despliegue, desde un secreto.

insert into hidrantes.config (clave, valor, actualizado_por) values
  ('meses_revision',                  '12',                    'migracion'),
  ('radio_duplicado_m',               '25',                    'migracion'),
  ('buffer_zona_m',                   '400',                   'migracion'),
  ('dias_papelera',                   '30',                    'migracion'),
  ('max_intentos_dispositivo',        '10',                    'migracion'),
  ('max_intentos_ip',                 '30',                    'migracion'),
  ('max_intentos_global',             '200',                   'migracion'),
  ('dias_caducidad_token',            '365',                   'migracion'),
  ('max_subidas_dispositivo_dia',     '40',                    'migracion'),
  ('max_incidencias_dispositivo_dia', '5',                     'migracion'),
  ('max_errores_global_dia',          '2000',                  'migracion'),
  ('escala_radios',                   '[11, 9, 7, 5.5, 5]',    'migracion')
on conflict (clave) do nothing;

-- ---------- pg_cron (04 §9) ----------
-- Los trabajos corren como hidrantes_migrador (su propietario) y llevan prefijo "hidrantes_" para no
-- confundirse con los de la app de uniformidad. cron.schedule con el mismo nombre actualiza el trabajo.
-- La purga de la papelera llega con fn_purgar_papelera (Fase 3): escribe en registro.

select cron.schedule('hidrantes_purgar_intentos', '7 * * * *',
  $$delete from hidrantes.intentos_codigo where momento < now() - interval '24 hours'$$);

select cron.schedule('hidrantes_purgar_errores', '17 3 * * *',
  $$delete from hidrantes.errores_cliente where momento < now() - interval '90 days'$$);

select cron.schedule('hidrantes_revocar_tokens', '27 3 * * *',
  $$update hidrantes.dispositivos set revocado_en = now()
    where revocado_en is null
      and ultimo_uso < now() - make_interval(days => (hidrantes.fn_config('dias_caducidad_token', '365') #>> '{}')::int)$$);

select cron.schedule('hidrantes_purgar_notificaciones', '37 3 * * *',
  $$delete from hidrantes.notificaciones where creada_en < now() - interval '30 days'$$);
