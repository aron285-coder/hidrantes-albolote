-- Fase 2 · constraints, registro append-only y códigos (05 §2–§3; 09 Fase 2, criterio de salida).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, hidrantes, public;

select plan(27);

-- Punto válido de partida, para variar un campo cada vez.
create temp table base as
select 'HID-0100'::text as codigo, 'hidrante'::hidrantes.tipo_punto as tipo,
       'SRID=4326;POINT(-3.6569 37.2308)'::geography as geom, 100::smallint as diametro_mm,
       'bueno'::hidrantes.estado_caudal as caudal, null::hidrantes.tipo_racor as racor,
       null::text as descripcion_fallo, 'fotos/x.jpg'::text as foto_path;

create function pg_temp.punto(cambios jsonb) returns void language plpgsql as $$
declare b record;
begin
  select * into b from base;
  insert into hidrantes.puntos (codigo, tipo, geom, diametro_mm, caudal, racor, descripcion_fallo,
                                foto_path, municipio, fecha_ultima_revision, situacion, borrado_en)
  values (coalesce(cambios ->> 'codigo', b.codigo),
          coalesce((cambios ->> 'tipo')::hidrantes.tipo_punto, b.tipo),
          coalesce((cambios ->> 'geom')::geography, b.geom),
          coalesce((cambios ->> 'diametro_mm')::smallint, b.diametro_mm),
          coalesce((cambios ->> 'caudal')::hidrantes.estado_caudal, b.caudal),
          case when cambios ? 'racor' then (cambios ->> 'racor')::hidrantes.tipo_racor else b.racor end,
          case when cambios ? 'descripcion_fallo' then cambios ->> 'descripcion_fallo' else b.descripcion_fallo end,
          case when cambios ? 'foto_path' then cambios ->> 'foto_path' else b.foto_path end,
          'albolote', current_date,
          coalesce((cambios ->> 'situacion')::hidrantes.situacion_punto, 'activo'),
          (cambios ->> 'borrado_en')::timestamptz);
end $$;

-- ---------- puntos: constraints de 05 §2.1 ----------

select lives_ok($$ select pg_temp.punto('{}') $$, 'un punto válido entra');
select throws_ok($$ select pg_temp.punto('{"codigo":"BOC-0101","tipo":"boca_riego","diametro_mm":70,"racor":"granada"}') $$,
  '23514', null, 'boca de riego con diámetro distinto de 45: rechazada');
select throws_ok($$ select pg_temp.punto('{"codigo":"HID-0102","diametro_mm":45}') $$,
  '23514', null, 'hidrante de 45 mm: rechazado');
select lives_ok($$ select pg_temp.punto('{"codigo":"HID-0103","diametro_mm":70}') $$, 'hidrante de 70 mm: válido');
select throws_ok($$ select pg_temp.punto('{"codigo":"HID-0104","racor":"barcelona"}') $$,
  '23514', null, 'hidrante con racor: rechazado (racor solo en bocas, DEC-010)');
select throws_ok($$ select pg_temp.punto('{"codigo":"BOC-0105","tipo":"boca_riego","diametro_mm":45}') $$,
  '23514', null, 'boca de riego sin racor: rechazada');
select lives_ok($$ select pg_temp.punto('{"codigo":"BOC-0106","tipo":"boca_riego","diametro_mm":45,"racor":"otro"}') $$,
  'boca de riego de 45 con racor: válida');
select throws_ok($$ select pg_temp.punto('{"codigo":"HID-0107","caudal":"no_funciona"}') $$,
  '23514', null, 'no funciona sin descripción (NULL): rechazado');
select throws_ok($$ select pg_temp.punto('{"codigo":"HID-0108","caudal":"no_funciona","descripcion_fallo":"   "}') $$,
  '23514', null, 'no funciona con descripción en blanco: rechazado');
select lives_ok($$ select pg_temp.punto('{"codigo":"HID-0109","caudal":"no_funciona","descripcion_fallo":"Tapa soldada"}') $$,
  'no funciona con descripción: válido');
select throws_ok($$ select pg_temp.punto('{"codigo":"HID-0110","foto_path":null}') $$,
  '23502', null, 'punto sin foto: rechazado');
select throws_ok($$ select pg_temp.punto('{"codigo":"HID-0111","foto_path":""}') $$,
  '23514', null, 'punto con foto vacía: rechazado');
select throws_ok($$ select pg_temp.punto('{"codigo":"HID-0112","geom":"SRID=4326;POINT(2.17 41.38)"}') $$,
  '23514', null, 'coordenadas fuera de Granada: rechazadas');
select throws_ok($$ select pg_temp.punto('{"codigo":"HID-0113","situacion":"borrado"}') $$,
  '23514', null, 'borrado sin borrado_en: rechazado');
select throws_ok($$ select pg_temp.punto('{"codigo":"HID-0100"}') $$,
  '23505', null, 'código repetido: rechazado');

-- ---------- propuestas: constraints de 05 §2.2 ----------

select throws_ok($$
  insert into hidrantes.propuestas (punto_id, operacion, autor_nombre, autor_apellido, dispositivo_id, clave_local, foto_path)
  select id, 'alta', 'A', 'B', gen_random_uuid(), 'p1', 'fotos/a.jpg' from hidrantes.puntos where codigo = 'HID-0100'
$$, '23514', null, 'alta con punto_id: rechazada');
select throws_ok($$
  insert into hidrantes.propuestas (punto_id, operacion, autor_nombre, autor_apellido, dispositivo_id, clave_local)
  select id, 'revision', 'A', 'B', gen_random_uuid(), 'p2' from hidrantes.puntos where codigo = 'HID-0100'
$$, '23514', null, 'revisión sin foto: rechazada');
select throws_ok($$
  insert into hidrantes.propuestas (operacion, autor_nombre, autor_apellido, dispositivo_id, clave_local, foto_path)
  values ('alta', 'A', 'B', gen_random_uuid(), 'p3', 'fotos/a.jpg')
$$, '23514', null, 'alta sin ubicación: rechazada');
select throws_ok($$
  insert into hidrantes.propuestas (punto_id, operacion, autor_nombre, autor_apellido, dispositivo_id, clave_local, estado)
  select id, 'datos', 'A', 'B', gen_random_uuid(), 'p4', 'rechazada' from hidrantes.puntos where codigo = 'HID-0100'
$$, '23514', null, 'rechazada sin motivo: rechazada');
select throws_ok($$
  insert into hidrantes.propuestas (punto_id, operacion, autor_nombre, autor_apellido, dispositivo_id, clave_local)
  select id, 'datos', 'A', 'B', gen_random_uuid(), 'repetida' from hidrantes.puntos where codigo in ('HID-0100', 'HID-0103')
$$, '23505', null, 'misma clave_local dos veces: una sola propuesta');

-- ---------- registro append-only (05 §2.3) ----------

insert into hidrantes.registro (actor, es_admin, accion) values ('Ana Pérez', false, 'propuesta_creada');
select throws_ok($$ update hidrantes.registro set accion = 'rechazo' $$, 'P0001', null, 'registro: update rechazado');
select throws_ok($$ delete from hidrantes.registro $$, 'P0001', null, 'registro: delete rechazado');
select throws_ok($$ truncate hidrantes.registro $$, 'P0001', null, 'registro: truncate rechazado');

set local hidrantes.anonimizando = 'on';
select lives_ok($$ update hidrantes.registro set actor = 'voluntario dado de baja' where actor = 'Ana Pérez' $$,
  'anonimización: solo el actor, con la marca de la RPC (11 §7)');
select throws_ok($$ update hidrantes.registro set accion = 'rechazo', actor = 'x' $$,
  'P0001', null, 'anonimización: cualquier otro campo sigue bloqueado');
reset hidrantes.anonimizando;

-- ---------- códigos (05 §3) ----------

select matches(hidrantes.fn_siguiente_codigo('hidrante'), '^HID-[0-9]{4}$', 'código de hidrante HID-####');
select matches(hidrantes.fn_siguiente_codigo('boca_riego'), '^BOC-[0-9]{4}$', 'código de boca BOC-####');

select * from finish();
rollback;
