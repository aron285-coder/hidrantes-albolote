-- Fase 8 · lo que quedaba sin una sola comprobación en SQL: las RPC del panel que solo se veían de
-- refilón desde el navegador (FR-130–FR-132, FR-160, FR-165, FR-167), la retirada de un punto y la
-- inmutabilidad del registro (11 §6). Cada bloque acaba con "esto no lo hace cualquiera".
begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;

select plan(36);

-- ---------- datos de prueba ----------

insert into hidrantes.administradores (email, creado_por) values ('jefa8@example.com', 'test')
on conflict do nothing;
insert into hidrantes.limite_municipal (municipio, geom, version) values
  ('albolote', 'SRID=4326;MULTIPOLYGON(((-3.70 37.20,-3.60 37.20,-3.60 37.30,-3.70 37.30,-3.70 37.20)))', 'test')
on conflict (municipio) do update set geom = excluded.geom;
insert into hidrantes.nucleos (nombre, municipio, geom, version) values
  ('Núcleo 8', 'albolote', 'SRID=4326;POINT(-3.6569 37.2308)', 'test')
on conflict (nombre) do nothing;

insert into hidrantes.puntos (id, codigo, tipo, geom, diametro_mm, caudal, racor, foto_path, municipio, nucleo,
                              direccion, fecha_ultima_revision)
values
  ('00000000-0000-4000-8000-000000009001', 'HID-0900', 'hidrante', 'SRID=4326;POINT(-3.6569 37.2308)', 100, 'bueno',
   null, 'f8/9a.jpg', 'albolote', 'Núcleo 8', 'Calle Uno 1', current_date - 10),
  ('00000000-0000-4000-8000-000000009002', 'BOC-0900', 'boca_riego', 'SRID=4326;POINT(-3.6500 37.2400)', 45, 'malo',
   'granada', 'f8/9b.jpg', 'albolote', 'Núcleo 8', 'Calle Dos 2', current_date - 400);

-- Dos voluntarios y un administrador que también propone: la actividad no debe contar al segundo.
create function pg_temp.prop(id uuid, disp uuid, nombre text, estado text, creada timestamptz) returns void
language sql as $fn$
  insert into hidrantes.propuestas (id, punto_id, operacion, datos, autor_nombre, autor_apellido, dispositivo_id,
                                    clave_local, foto_path, estado, motivo_rechazo, creada_en, revisada_en)
  values (id, '00000000-0000-4000-8000-000000009001', 'revision', '{}', nombre, 'Apellido', disp,
          'c-' || id, 'f8/p-' || id || '.jpg', estado::hidrantes.estado_moderacion,
          case when estado = 'rechazada' then 'no se ve' end, creada,
          case when estado <> 'pendiente' then creada + interval '1 hour' end);
$fn$;

select pg_temp.prop('00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-0000000000a1',
  'Ana', 'aprobada', now() - interval '2 days');
select pg_temp.prop('00000000-0000-4000-8000-00000000a002', '00000000-0000-4000-8000-0000000000a1',
  'Ana', 'aprobada', now() - interval '3 days');
select pg_temp.prop('00000000-0000-4000-8000-00000000a003', '00000000-0000-4000-8000-0000000000a1',
  'Ana', 'rechazada', now() - interval '4 days');
select pg_temp.prop('00000000-0000-4000-8000-00000000a004', '00000000-0000-4000-8000-0000000000a1',
  'Ana', 'aprobada', now() - interval '8 months');
select pg_temp.prop('00000000-0000-4000-8000-00000000b001', '00000000-0000-4000-8000-0000000000b1',
  'Berta', 'pendiente', now() - interval '1 day');
select pg_temp.prop('00000000-0000-4000-8000-00000000c001', hidrantes.fn_dispositivo_admin('jefa8@example.com'),
  'Jefa', 'aprobada', now() - interval '1 day');

-- Registro de ese voluntario, como lo deja fn_proponer, y uno de jefatura sobre el mismo punto.
insert into hidrantes.registro (actor, dispositivo_id, es_admin, accion, punto_id, propuesta_id) values
  ('Ana Apellido', '00000000-0000-4000-8000-0000000000a1', false, 'propuesta_creada',
   '00000000-0000-4000-8000-000000009001', '00000000-0000-4000-8000-00000000a001'),
  ('jefa8@example.com', null, true, 'aprobacion', '00000000-0000-4000-8000-000000009001',
   '00000000-0000-4000-8000-00000000a001'),
  ('Ana Apellido', '00000000-0000-4000-8000-0000000000a1', false, 'propuesta_creada',
   '00000000-0000-4000-8000-000000009002', '00000000-0000-4000-8000-00000000a002');

-- Una incidencia abierta, como la deja la app (la escribe el service_role, no jefatura).
insert into hidrantes.incidencias_app (id, dispositivo_id, descripcion)
values ('00000000-0000-4000-8000-00000000e001', '00000000-0000-4000-8000-0000000000a1', 'La foto no sube');

-- El identificador técnico del administrador se calcula ahora: fn_dispositivo_admin es interna y
-- authenticated no la puede llamar (05 §7).
select set_config('test.disp_admin', hidrantes.fn_dispositivo_admin('jefa8@example.com')::text, true);

-- ---------- quien no es jefatura no pasa de aquí (05 §6.2) ----------

select set_config('request.jwt.claims', '{"role":"authenticated","email":"cualquiera@example.com"}', true);
set local role authenticated;
select throws_like($$ select hidrantes.fn_actividad_voluntarios(3) $$, 'NO_AUTORIZADO%',
  'la actividad de los voluntarios no la ve cualquiera');
select throws_like($$ select hidrantes.fn_anonimizar_autor('00000000-0000-4000-8000-0000000000a1') $$,
  'NO_AUTORIZADO%', 'ni se anonimiza a nadie');
select throws_like($$ select hidrantes.fn_exportar_inventario('{}') $$, 'NO_AUTORIZADO%',
  'ni se exporta el inventario');
select throws_like($$ select hidrantes.fn_historial_punto('00000000-0000-4000-8000-000000009001') $$,
  'NO_AUTORIZADO%', 'ni se lee el historial de un punto');
select throws_like($$ select hidrantes.fn_retirar_punto('00000000-0000-4000-8000-000000009002', 'porque sí') $$,
  'NO_AUTORIZADO%', 'ni se retira un punto');
select throws_like($$ select hidrantes.fn_resolver_incidencia(gen_random_uuid()) $$, 'NO_AUTORIZADO%',
  'ni se cierra una incidencia');
reset role;

-- ---------- jefatura ----------

select set_config('request.jwt.claims', '{"role":"authenticated","email":"jefa8@example.com"}', true);
set local role authenticated;

-- Actividad (FR-130)
select is((select propuestas from hidrantes.fn_actividad_voluntarios(3)
            where dispositivo_id = '00000000-0000-4000-8000-0000000000a1'), 3,
  'a 3 meses se cuentan las tres recientes, no la de hace ocho meses');
select is((select propuestas from hidrantes.fn_actividad_voluntarios(12)
            where dispositivo_id = '00000000-0000-4000-8000-0000000000a1'), 4,
  'a 12 meses se cuentan las cuatro');
select is((select tasa from hidrantes.fn_actividad_voluntarios(3)
            where dispositivo_id = '00000000-0000-4000-8000-0000000000a1'), 0.67,
  'la tasa es aprobadas entre resueltas, con dos decimales');
select is((select tasa from hidrantes.fn_actividad_voluntarios(3)
            where dispositivo_id = '00000000-0000-4000-8000-0000000000b1'), null::numeric,
  'sin nada resuelto todavía, la tasa no se inventa');
select is((select count(*) from hidrantes.fn_actividad_voluntarios(3)
            where dispositivo_id = current_setting('test.disp_admin')::uuid), 0::bigint,
  'jefatura no se cuenta a sí misma como voluntaria');

-- Historial de un punto (FR-120)
select is((select count(*) from hidrantes.fn_historial_punto('00000000-0000-4000-8000-000000009001')), 2::bigint,
  'el historial trae solo lo de ese punto');

-- Incidencias (FR-132)
select hidrantes.fn_resolver_incidencia('00000000-0000-4000-8000-00000000e001');
select is((select resuelta_por from hidrantes.incidencias_app where id = '00000000-0000-4000-8000-00000000e001'),
  'jefa8@example.com', 'la incidencia resuelta guarda quién la cerró');
select throws_like($$ select hidrantes.fn_resolver_incidencia('00000000-0000-4000-8000-00000000e001') $$,
  'PAYLOAD_INVALIDO(incidencia_id)%', 'resolver dos veces la misma no cuela');

-- Exportación (FR-160)
select set_config('test.export', hidrantes.fn_exportar_inventario('{}')::text, true);
select is((select count(*) from jsonb_array_elements(current_setting('test.export')::jsonb) e
            where e ->> 'nucleo' = 'Núcleo 8'), 2::bigint,
  'la exportación trae los puntos activos');
select is((select count(*) from jsonb_array_elements(current_setting('test.export')::jsonb) e
            where e ? 'autor_nombre' or e ? 'dispositivo_id'), 0::bigint,
  'la exportación no lleva a nadie dentro (FR-27)');
select is(jsonb_array_length(hidrantes.fn_exportar_inventario('{"nucleo": "Núcleo 8", "tipo": "boca_riego"}')), 1,
  'los filtros filtran');
select throws_like($$ select hidrantes.fn_exportar_inventario('{"color": "rojo"}') $$, 'PAYLOAD_INVALIDO(color)%',
  'un filtro que no existe se rechaza, no se ignora');
select is((select count(*) from hidrantes.registro where accion = 'exportacion'), 2::bigint,
  'cada exportación que sale adelante deja constancia en el registro (11 §6)');

-- Mantenimiento (FR-165)
select hidrantes.fn_registrar_workflow('regenerar-zona');
select is((select despues ->> 'workflow' from hidrantes.registro where accion = 'workflow_lanzado'),
  'regenerar-zona', 'lanzar un trabajo queda registrado con su nombre');

-- Novedades (FR-167)
select is(hidrantes.fn_novedades(), '[]'::jsonb, 'sin novedades cargadas, una lista vacía');

-- Retirada de un punto (FR-120)
select throws_like($$ select hidrantes.fn_retirar_punto('00000000-0000-4000-8000-000000009002', '  ') $$,
  'MOTIVO_OBLIGATORIO%', 'retirar sin motivo no se puede');
select hidrantes.fn_retirar_punto('00000000-0000-4000-8000-000000009002', 'Ya no existe: obra nueva');
select is((select situacion::text from hidrantes.puntos where id = '00000000-0000-4000-8000-000000009002'),
  'retirado', 'el punto queda retirado, no borrado');
select throws_like($$ select hidrantes.fn_retirar_punto('00000000-0000-4000-8000-000000009002', 'otra vez') $$,
  'PUNTO_NO_ACTIVO%', 'y no se retira dos veces');

-- Anonimización (FR-131, 11 §7)
select is(hidrantes.fn_anonimizar_autor('00000000-0000-4000-8000-0000000000a1'), 6,
  'devuelve cuántas filas ha tapado, entre propuestas y registro');
select is((select count(*) from hidrantes.propuestas
            where dispositivo_id = '00000000-0000-4000-8000-0000000000a1' and autor_nombre = 'Ana'), 0::bigint,
  'ninguna propuesta suya conserva el nombre');
select is((select count(distinct actor) from hidrantes.registro
            where dispositivo_id = '00000000-0000-4000-8000-0000000000a1'), 1::bigint,
  'y en el registro queda un solo actor: "voluntario dado de baja"');
select is((select actor from hidrantes.registro
              where accion = 'aprobacion' and punto_id = '00000000-0000-4000-8000-000000009001'),
  'jefa8@example.com', 'lo que hizo jefatura sobre ese punto no se toca');
select is((select despues ->> 'propuestas' from hidrantes.registro where accion = 'anonimizacion'), '4',
  'la propia anonimización queda registrada con el recuento');

reset role;

-- ---------- lo que solo tocan las Pages Functions con la clave de servicio (05 §7) ----------

-- Avisos push: reclamar es idempotente (un aviso no se manda dos veces) y el resultado limpia las
-- suscripciones muertas. Es lo que sostiene que /api/push se pueda llamar de más sin hacer daño.
insert into hidrantes.suscripciones_push (id, dispositivo_id, suscripcion, temas) values
  ('00000000-0000-4000-8000-000000000051', '00000000-0000-4000-8000-0000000000b1',
   '{"endpoint": "https://push.example/s1"}', '{}'),
  ('00000000-0000-4000-8000-000000000052', '00000000-0000-4000-8000-0000000000b1',
   '{"endpoint": "https://push.example/s2"}', '{}');
insert into hidrantes.notificaciones (suscripcion_id, titulo, cuerpo) values
  ('00000000-0000-4000-8000-000000000051', 'Propuesta aprobada', 'HID-0900'),
  ('00000000-0000-4000-8000-000000000052', 'Propuesta aprobada', 'BOC-0900');

select is((select count(*) from hidrantes.fn_reclamar_notificaciones(100)), 2::bigint,
  'se reclaman los avisos pendientes con su suscripción');
select is((select count(*) from hidrantes.fn_reclamar_notificaciones(100)), 0::bigint,
  'una segunda llamada no vuelve a mandar lo mismo (/api/push es idempotente)');

select hidrantes.fn_resultado_notificacion(
  (select min(id) from hidrantes.notificaciones), true, null);
select is((select fallos from hidrantes.suscripciones_push where id = '00000000-0000-4000-8000-000000000051'), 0::smallint,
  'un envío correcto deja la suscripción a cero fallos');

select hidrantes.fn_resultado_notificacion(
  (select max(id) from hidrantes.notificaciones), false, 'gone', true);
select is((select count(*) from hidrantes.suscripciones_push where id = '00000000-0000-4000-8000-000000000052'), 0::bigint,
  'una suscripción caducada se borra en cuanto el navegador lo dice (FR-80)');

-- Purga de fotos huérfanas (FR-144): la lista de fotos en uso es la que decide qué se borra del
-- bucket, así que no puede olvidarse de ninguna.
insert into hidrantes.subidas (dispositivo_id, foto_path, reservada_en) values
  ('00000000-0000-4000-8000-0000000000b1', 'f8/reciente.jpg', now() - interval '1 hour'),
  ('00000000-0000-4000-8000-0000000000b1', 'f8/vieja.jpg', now() - interval '3 days');

select set_eq(
  $$ select f from hidrantes.fn_fotos_referenciadas() f where f like 'f8/%' $$,
  $$ values ('f8/9a.jpg'), ('f8/9b.jpg'), ('f8/p-00000000-0000-4000-8000-00000000a001.jpg'),
            ('f8/p-00000000-0000-4000-8000-00000000a002.jpg'), ('f8/p-00000000-0000-4000-8000-00000000a004.jpg'), ('f8/p-00000000-0000-4000-8000-00000000b001.jpg'),
            ('f8/p-00000000-0000-4000-8000-00000000c001.jpg'), ('f8/reciente.jpg') $$,
  'en uso: las de los puntos, las de propuestas vivas y las reservas de menos de 24 h; la rechazada y la reserva vieja, no'
);

-- ---------- el registro no se reescribe (11 §6) ----------

select throws_like($$ update hidrantes.registro set accion = 'aprobacion' where accion = 'exportacion' $$,
  'REGISTRO_INMUTABLE%', 'el registro no se modifica');
select throws_like($$ delete from hidrantes.registro where accion = 'exportacion' $$,
  'REGISTRO_INMUTABLE%', 'ni se borra');

select * from finish();
rollback;
