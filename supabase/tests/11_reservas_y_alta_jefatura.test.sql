-- Reservas de subida que la purga podría haber borrado, alta de jefatura con correo largo y
-- atributos de fn_proponer (docs/17 RV-07, RV-19 y RV-17 para esta función).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;

select plan(12);

insert into hidrantes.config (clave, valor, actualizado_por)
values ('codigo_acceso_hash', to_jsonb(extensions.crypt('482917', extensions.gen_salt('bf', 4))), 'test')
on conflict (clave) do update set valor = excluded.valor;
insert into hidrantes.puntos (id, codigo, tipo, geom, diametro_mm, caudal, foto_path, municipio, fecha_ultima_revision)
values ('00000000-0000-4000-8000-0000000b0001', 'HID-0901', 'hidrante', 'SRID=4326;POINT(-3.6100 37.2150)', 100, 'bueno',
        'fotos/r1.jpg', 'albolote', current_date);

select set_config('test.token',
  (select token from hidrantes.fn_verificar_codigo('482917', 'eeeeeeee-0000-4000-8000-0000000000e1', 'ip-reservas')), true);
select set_config('test.disp', hidrantes.fn_validar_token(current_setting('test.token'))::text, true);

create function pg_temp.reserva(ruta text, hace interval) returns void language sql as $$
  insert into hidrantes.subidas (dispositivo_id, foto_path, reservada_en)
  values (current_setting('test.disp')::uuid, ruta, now() - hace);
$$;
create function pg_temp.revision(clave text, ruta text) returns jsonb language sql as $$
  select hidrantes.fn_proponer(current_setting('test.token'), clave, 'Ana', 'Ruiz', 'revision',
    '00000000-0000-4000-8000-0000000b0001', '{}', null, null, null, null, null, null, null, null, ruta);
$$;

-- ---------- RV-07: reservas viejas ----------

select pg_temp.reserva('fotos/vieja.jpg', interval '6 days 1 hour');
select pg_temp.reserva('fotos/reciente.jpg', interval '5 days');
select pg_temp.reserva('fotos/ocho.jpg', interval '8 days');

select throws_like($$ select pg_temp.revision('clave-reserva-vieja', 'fotos/vieja.jpg') $$, 'FOTO_NO_RESERVADA%',
  'fn_proponer rechaza una reserva sin confirmar de hace 6 días y 1 hora con FOTO_NO_RESERVADA');
select is(pg_temp.revision('clave-reserva-reciente', 'fotos/reciente.jpg') ->> 'estado', 'pendiente',
  'fn_proponer acepta una reserva sin confirmar de hace 5 días');

-- La de hace 6 días (sin confirmar) y la de 8, frente a la purga de fotos.
select pg_temp.reserva('fotos/seis.jpg', interval '6 days');
select ok('fotos/seis.jpg' in (select hidrantes.fn_fotos_referenciadas()),
  'fn_fotos_referenciadas incluye una reserva de hace 6 días');
select ok('fotos/ocho.jpg' not in (select hidrantes.fn_fotos_referenciadas()),
  'fn_fotos_referenciadas excluye una de hace 8');
select is(hidrantes.fn_config('dias_reserva_subida', 'null'), '7'::jsonb, 'la ventana es config: 7 días');

select is((select count(*)::int from cron.job where jobname = 'hidrantes_purgar_subidas' and schedule = '57 3 * * *'), 1,
  'la tarea hidrantes_purgar_subidas existe y corre a las 03:57');
select ok((select command from cron.job where jobname = 'hidrantes_purgar_subidas') ~ 'delete from hidrantes\.subidas where reservada_en < now\(\) - interval ''30 days''',
  'y solo borra las reservas de más de 30 días');

-- ---------- RV-19: alta de jefatura con un correo de 70 caracteres ----------

select set_config('test.correo', repeat('j', 58) || '@example.com', true);
insert into hidrantes.administradores (email, creado_por) values (current_setting('test.correo'), 'test');
insert into hidrantes.subidas (dispositivo_id, foto_path)
values (hidrantes.fn_dispositivo_admin(current_setting('test.correo')), 'fotos/admin-largo.jpg');
select set_config('request.jwt.claims',
  jsonb_build_object('role', 'authenticated', 'email', current_setting('test.correo'), 'amr', '[{"method":"oauth","timestamp":1}]'::jsonb, 'app_metadata', '{"provider":"google","providers":["google"]}'::jsonb)::text, true);
set local role authenticated;
select is(length(current_setting('test.correo')), 70, 'el correo de prueba tiene 70 caracteres');
select is(hidrantes.fn_proponer(null, 'admin-clave-larga', 'Jefatura', current_setting('test.correo'), 'estado',
    '00000000-0000-4000-8000-0000000b0001', '{"caudal":"regular"}', null, null, null, null, null, null, null, null,
    'fotos/admin-largo.jpg') ->> 'aplicada',
  'true', 'una propuesta de admin con un correo de 70 caracteres entra (los autor_* se ignoran)');
reset role;
select is((select autor_apellido from hidrantes.propuestas where clave_local = 'admin-clave-larga'),
  left(current_setting('test.correo'), 60), 'y guarda autor_apellido de 60');

-- ---------- RV-17: fn_proponer con lock_timeout y sin statement_timeout ----------

select ok((select 'lock_timeout=5s' = any (proconfig) from pg_proc where proname = 'fn_proponer'),
  'fn_proponer tiene lock_timeout=5s');
select ok((select not exists (select 1 from unnest(proconfig) c where c like 'statement_timeout=%')
           from pg_proc where proname = 'fn_proponer'),
  'y ya no statement_timeout, que como atributo no hacía nada');

select * from finish();
rollback;
