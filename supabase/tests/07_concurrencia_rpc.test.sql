-- Fase 3 · concurrencia de las RPC (05 §11, TR-114): dos sesiones reales con dblink.
-- Los datos se confirman en una tercera sesión (s0), porque las otras dos no ven esta transacción.
begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
set search_path = extensions, public;

select plan(6);

create temp table conexion as
select format('dbname=postgres user=postgres password=postgres host=%s port=%s',
              host(inet_server_addr()), inet_server_port()) as cadena,
       gen_random_uuid() as punto, gen_random_uuid() as propuesta, gen_random_uuid() as dispositivo,
       'token-concurrencia-' || gen_random_uuid() as token, 'clave-conc-' || gen_random_uuid() as clave;

select dblink_connect(s, (select cadena from conexion)) from unnest(array['s0', 's1', 's2']) s;

-- Datos confirmados: un administrador, un punto con una revisión pendiente y un móvil con token.
select dblink_exec('s0', format($f$
  insert into hidrantes.administradores (email, creado_por) values ('conc@example.com', 'test') on conflict do nothing;
  insert into hidrantes.puntos (id, codigo, tipo, geom, diametro_mm, caudal, foto_path, municipio, fecha_ultima_revision,
                                actualizado_en)
  values (%1$L, hidrantes.fn_siguiente_codigo('hidrante'), 'hidrante', 'SRID=4326;POINT(-3.6300 37.2600)', 100, 'bueno',
          'fotos/c.jpg', 'albolote', current_date, now() - interval '1 day');
  insert into hidrantes.propuestas (id, punto_id, operacion, datos, autor_nombre, autor_apellido, dispositivo_id,
                                    clave_local, foto_path, creada_en)
  values (%2$L, %1$L, 'revision', '{}', 'Ana', 'Pérez', %3$L, 'c-' || %2$L, 'fotos/c2.jpg', now() - interval '1 hour');
  insert into hidrantes.dispositivos (dispositivo_id, token_hash) values (%3$L, hidrantes.fn_sha256(%4$L));
  insert into hidrantes.subidas (dispositivo_id, foto_path) values (%3$L, 'fotos/conc-' || %3$L || '.jpg');
  insert into hidrantes.subidas (dispositivo_id, foto_path, reservada_en)
  select %3$L, 'fotos/relleno-' || %3$L || '-' || i || '.jpg', now() from generate_series(2, 39) i;
$f$, (select punto from conexion), (select propuesta from conexion), (select dispositivo from conexion),
     (select token from conexion)));

-- ---------- dos fn_aprobar sobre la misma propuesta ----------

select dblink_exec(s, 'begin') from unnest(array['s1', 's2']) s;
select x from unnest(array['s1', 's2']) s, dblink(s,
  $$select set_config('request.jwt.claims', '{"role":"authenticated","email":"conc@example.com"}', true)$$) as t(x text);
select * from dblink('s1', format('select hidrantes.fn_aprobar(%L)::text', (select propuesta from conexion))) as t(r text);
select dblink_send_query('s2', format('select hidrantes.fn_aprobar(%L)::text', (select propuesta from conexion)));
select dblink_exec('s1', 'commit');
create temp table r_aprobar as select * from dblink_get_result('s2', false) as t(r text);
create temp table e_aprobar as select dblink_error_message('s2') as e;
-- vaciar el resultado asíncrono antes del siguiente comando
select * from dblink_get_result('s2', false) as t(r text);
select dblink_exec('s2', 'rollback');

select is((select count(*)::int from dblink('s0', format(
  'select 1 from hidrantes.propuestas where id = %L and estado = ''aprobada''', (select propuesta from conexion))) as t(x int)),
  1, 'dos aprobaciones simultáneas: la primera aprueba');
select matches((select e from e_aprobar), 'PROPUESTA_NO_PENDIENTE',
  'la segunda espera al bloqueo y falla con PROPUESTA_NO_PENDIENTE (nunca "gana el último")');
select is((select count(*)::int from dblink('s0', format(
  'select 1 from hidrantes.registro where propuesta_id = %L and accion = ''aprobacion''', (select propuesta from conexion))) as t(x int)),
  1, 'y solo una deja rastro de aprobación en el registro');

-- ---------- dos fn_proponer con la misma clave_local ----------

select dblink_exec(s, 'begin') from unnest(array['s1', 's2']) s;
create temp table llamada as
select format($f$select hidrantes.fn_proponer(%L, %L, 'Ana', 'Pérez', 'revision', %L, '{}', null, null, null,
  null, null, null, null, null, %L) ->> 'propuesta_id'$f$,
  (select token from conexion), (select clave from conexion), (select punto from conexion),
  'fotos/conc-' || (select dispositivo from conexion) || '.jpg') as sql;
-- el punto se aprobó arriba: una revisión nueva sobre él es válida
create temp table p1 as select * from dblink('s1', (select sql from llamada)) as t(id text);
select dblink_send_query('s2', (select sql from llamada));
select dblink_exec('s1', 'commit');
create temp table p2 as select * from dblink_get_result('s2') as t(id text);
select * from dblink_get_result('s2') as t(id text);
select dblink_exec('s2', 'commit');

select is((select count(*)::int from dblink('s0', format(
  'select 1 from hidrantes.propuestas where clave_local = %L', (select clave from conexion))) as t(x int)),
  1, 'dos envíos simultáneos con la misma clave_local: una sola propuesta');
select is((select id from p2), (select id from p1), 'y los dos reciben la misma propuesta');

-- ---------- reservas 40 y 41 a la vez ----------

select dblink_exec(s, 'begin') from unnest(array['s1', 's2']) s;
select * from dblink('s1', format('select hidrantes.fn_reservar_subida(%L)', (select token from conexion))) as t(r text);
select dblink_send_query('s2', format('select hidrantes.fn_reservar_subida(%L)', (select token from conexion)));
select dblink_exec('s1', 'commit');
create temp table r41 as select * from dblink_get_result('s2', false) as t(r text);
create temp table e41 as select dblink_error_message('s2') as e;
select * from dblink_get_result('s2', false) as t(r text);
select dblink_exec('s2', 'rollback');
select matches((select e from e41), 'CUOTA_SUBIDAS_AGOTADA',
  'reservas 40 y 41 simultáneas: una pasa y la otra choca con la cuota');

-- Limpieza de lo confirmado (el registro es append-only y se queda; en CI la base es efímera).
select dblink_exec('s0', format($f$
  delete from hidrantes.propuestas where punto_id = %1$L;
  delete from hidrantes.puntos where id = %1$L;
  delete from hidrantes.subidas where dispositivo_id = %2$L;
  delete from hidrantes.dispositivos where dispositivo_id = %2$L;
  delete from hidrantes.administradores where email = 'conc@example.com';
$f$, (select punto from conexion), (select dispositivo from conexion)));
select dblink_disconnect(s) from unnest(array['s0', 's1', 's2']) s;
select * from finish();
rollback;
