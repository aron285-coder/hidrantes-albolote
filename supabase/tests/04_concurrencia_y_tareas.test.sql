-- Fase 2 · dos altas concurrentes obtienen códigos distintos (05 §11), config inicial y
-- tareas de pg_cron (04 §9). Las dos sesiones se abren con dblink, fuera de esta transacción.
begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
set search_path = extensions, public;

select plan(5);

-- Dos sesiones con su propia transacción abierta, pidiendo código a la vez.
-- Por la IP del servidor (no localhost): dblink exige que la contraseña se use de verdad.
select dblink_connect(s, format('dbname=postgres user=postgres password=postgres host=%s port=%s',
       host(inet_server_addr()), inet_server_port()))
from unnest(array['s1', 's2']) s;
select dblink_exec('s1', 'begin');
select dblink_exec('s2', 'begin');
create temp table codigos as
select c from dblink('s1', $$ select hidrantes.fn_siguiente_codigo('hidrante') $$) as t(c text)
union all
select c from dblink('s2', $$ select hidrantes.fn_siguiente_codigo('hidrante') $$) as t(c text);
select dblink_exec('s1', 'rollback');
select dblink_exec('s2', 'rollback');
select dblink_disconnect('s1');
select dblink_disconnect('s2');

select is((select count(distinct c)::int from codigos), 2,
  'dos altas simultáneas en sesiones distintas: dos códigos distintos');

-- ---------- config inicial (05 §2.10) ----------

select is(
  (select count(*)::int from hidrantes.config where clave in (
    'meses_revision', 'radio_duplicado_m', 'buffer_zona_m', 'dias_papelera', 'max_intentos_dispositivo',
    'max_intentos_ip', 'max_intentos_global', 'dias_caducidad_token', 'max_subidas_dispositivo_dia',
    'max_incidencias_dispositivo_dia', 'max_errores_global_dia', 'escala_radios')),
  12, 'config con los 12 valores iniciales');
select is(hidrantes.fn_config('buffer_zona_m', 'null'), '400'::jsonb, 'buffer_zona_m = 400 (FR-53)');

-- ---------- pg_cron ----------

select set_eq(
  $$ select jobname from cron.job where jobname like 'hidrantes\_%' $$,
  array['hidrantes_purgar_intentos', 'hidrantes_purgar_errores', 'hidrantes_revocar_tokens',
        'hidrantes_purgar_notificaciones', 'hidrantes_purgar_papelera', 'hidrantes_resumen_semanal'],
  'las seis tareas de 04 §9 programadas');
select is(
  (select count(*)::int from cron.job where jobname like 'hidrantes\_%' and username <> 'hidrantes_migrador'), 0,
  'las tareas corren como hidrantes_migrador, no como postgres');

select * from finish();
rollback;
