-- Fase 2 · permisos y RLS (05 §5): anon no ve nada, authenticated solo si es administrador,
-- nadie escribe directamente, Storage cerrado a anon (09 Fase 2, criterio de salida).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;

select plan(30);

-- ---------- estructura ----------

select is(
  (select count(*)::int from pg_tables where schemaname = 'hidrantes' and not rowsecurity), 0,
  'RLS activado en todas las tablas de hidrantes'
);
select is(
  (select count(*)::int from pg_tables t where schemaname = 'hidrantes'
     and not exists (select 1 from pg_policies p where p.schemaname = 'hidrantes' and p.tablename = t.tablename)), 0,
  'toda tabla tiene al menos una política (05 §5)'
);
select is(
  (select count(*)::int from pg_policies where schemaname = 'hidrantes' and cmd <> 'SELECT'), 0,
  'ninguna política de escritura: toda escritura irá por RPC'
);
select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema = 'hidrantes' and grantee in ('anon', 'PUBLIC')), 0,
  'anon y PUBLIC sin ningún privilegio sobre tablas ni vistas'
);
select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema = 'hidrantes' and grantee = 'authenticated' and privilege_type <> 'SELECT'), 0,
  'authenticated solo con select'
);
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'hidrantes' and c.relkind = 'v'
      and not coalesce('security_invoker=true' = any (c.reloptions), false)), 0,
  'todas las vistas son security_invoker'
);

-- ---------- datos de prueba ----------

insert into hidrantes.administradores (email, creado_por) values
  ('admin@example.com', 'test'), ('antiguo@example.com', 'test');
update hidrantes.administradores set activo = false where email = 'antiguo@example.com';
insert into hidrantes.puntos (id, codigo, tipo, geom, diametro_mm, caudal, foto_path, municipio, fecha_ultima_revision)
values ('00000000-0000-4000-8000-000000000001', 'HID-0200', 'hidrante', 'SRID=4326;POINT(-3.6569 37.2308)',
        100, 'bueno', 'fotos/x.jpg', 'albolote', current_date - 800);
insert into hidrantes.propuestas (punto_id, operacion, autor_nombre, autor_apellido, dispositivo_id, clave_local, foto_path)
values ('00000000-0000-4000-8000-000000000001', 'revision', 'Ana', 'Pérez', gen_random_uuid(), 'perm-1', 'fotos/y.jpg');
insert into hidrantes.registro (actor, es_admin, accion, punto_id)
values ('Ana Pérez', false, 'propuesta_creada', '00000000-0000-4000-8000-000000000001');

-- ---------- anon ----------

set local role anon;
select throws_ok($$ select * from hidrantes.puntos $$, '42501', null, 'anon: puntos → permission denied');
select throws_ok($$ select * from hidrantes.propuestas $$, '42501', null, 'anon: propuestas (con nombres) → permission denied');
select throws_ok($$ select * from hidrantes.v_puntos_activos $$, '42501', null, 'anon: v_puntos_activos → permission denied');
select throws_ok($$ select * from hidrantes.registro $$, '42501', null, 'anon: registro → permission denied');
select throws_ok($$ select hidrantes.fn_siguiente_codigo('hidrante') $$, '42501', null, 'anon: fn_siguiente_codigo → permission denied');
select throws_ok($$ select hidrantes.fn_es_admin() $$, '42501', null, 'anon: fn_es_admin → permission denied');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('hidrantes-fotos-dev', 'fotos/intruso.jpg') $$,
  '42501', null, 'anon: insert en Storage rechazado (solo URL firmada, 04 §7)'
);
reset role;

-- ---------- authenticated sin ser administrador ----------

select set_config('request.jwt.claims', '{"email":"voluntario@example.com","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from hidrantes.puntos), 0, 'no administrador: puntos vacío');
select is((select count(*)::int from hidrantes.propuestas), 0, 'no administrador: propuestas vacío');
select is((select count(*)::int from hidrantes.v_puntos_activos), 0, 'no administrador: v_puntos_activos vacío');
select is((select count(*)::int from hidrantes.v_cola_revision), 0, 'no administrador: v_cola_revision vacío');
select throws_ok($$ select hidrantes.fn_siguiente_codigo('hidrante') $$, '42501', null, 'authenticated: fn_siguiente_codigo → permission denied');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('hidrantes-fotos-dev', 'fotos/intruso.jpg') $$,
  '42501', null, 'authenticated: insert en Storage rechazado'
);
reset role;

-- administrador desactivado
select set_config('request.jwt.claims', '{"email":"antiguo@example.com","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from hidrantes.puntos), 0, 'administrador desactivado: no ve nada');
reset role;

-- ---------- administrador activo (mayúsculas en el JWT: se compara en minúsculas) ----------

select set_config('request.jwt.claims', '{"email":"Admin@Example.com","role":"authenticated"}', true);
set local role authenticated;
select ok(hidrantes.fn_es_admin(), 'fn_es_admin() reconoce al administrador activo');
select ok((select count(*) from hidrantes.puntos where codigo = 'HID-0200') = 1, 'administrador: ve puntos');
select ok((select count(*) from hidrantes.v_puntos_activos where codigo = 'HID-0200') = 1, 'administrador: ve v_puntos_activos');
select ok((select count(*) from hidrantes.v_cola_revision where codigo = 'HID-0200') = 1, 'administrador: ve v_cola_revision');
select ok((select count(*) from hidrantes.v_revisiones_caducadas where codigo = 'HID-0200') = 1, 'administrador: ve v_revisiones_caducadas');
select ok((select count(*) from hidrantes.v_registro where codigo = 'HID-0200') = 1, 'administrador: ve v_registro');
select throws_ok(
  $$ update hidrantes.puntos set caudal = 'malo' where codigo = 'HID-0200' $$,
  '42501', null, 'administrador: update directo rechazado (solo por RPC)'
);
select throws_ok(
  $$ insert into hidrantes.administradores (email, creado_por) values ('otro@example.com', 'x') $$,
  '42501', null, 'administrador: insert directo en administradores rechazado'
);
reset role;

-- ---------- service_role ----------

set local role service_role;
select ok((select count(*) from hidrantes.puntos) >= 1, 'service_role: lee todo');
select throws_ok($$ update hidrantes.registro set actor = 'x' $$, '42501', null, 'service_role: no reescribe el registro');
reset role;

select * from finish();
rollback;
