-- Fase 7 · lo que el panel necesita de la base de datos: núcleo en la cola (DEC-065).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;

select plan(11);

delete from hidrantes.nucleos;
delete from hidrantes.limite_municipal;
insert into hidrantes.limite_municipal (municipio, geom, version) values
  ('albolote', 'SRID=4326;MULTIPOLYGON(((-3.66 37.23,-3.65 37.23,-3.65 37.24,-3.66 37.24,-3.66 37.23)))', 'test');
insert into hidrantes.nucleos (nombre, municipio, geom, version) values
  ('Centro', 'albolote', 'SRID=4326;POINT(-3.655 37.235)', 'test');

insert into hidrantes.puntos (id, codigo, tipo, geom, diametro_mm, caudal, foto_path, municipio, nucleo,
                              fecha_ultima_revision)
values ('00000000-0000-4000-8000-0000000008b1', 'HID-0800', 'hidrante', 'SRID=4326;POINT(-3.655 37.236)', 70,
        'bueno', 'fotos/a.jpg', 'albolote', 'El Chaparral', current_date);
insert into hidrantes.propuestas (id, punto_id, operacion, datos, autor_nombre, autor_apellido, dispositivo_id,
                                  clave_local, foto_path)
values ('00000000-0000-4000-8000-0000000008c1', '00000000-0000-4000-8000-0000000008b1', 'revision', '{}',
        'A', 'B', gen_random_uuid(), 'panel-1', 'fotos/c.jpg');
insert into hidrantes.propuestas (id, operacion, datos, autor_nombre, autor_apellido, dispositivo_id, clave_local,
                                  foto_path, origen_ubicacion, geom)
values ('00000000-0000-4000-8000-0000000008c2', 'alta', '{"tipo": "hidrante", "diametro_mm": 70, "caudal": "bueno"}',
        'A', 'B', gen_random_uuid(), 'panel-2', 'fotos/d.jpg', 'gps', 'SRID=4326;POINT(-3.655 37.2355)'),
       ('00000000-0000-4000-8000-0000000008c3', 'alta', '{"tipo": "hidrante", "diametro_mm": 70, "caudal": "bueno"}',
        'A', 'B', gen_random_uuid(), 'panel-3', 'fotos/e.jpg', 'gps', 'SRID=4326;POINT(-3.70 37.235)');

select is((select nucleo from hidrantes.v_cola_revision where id = '00000000-0000-4000-8000-0000000008c1'),
  'El Chaparral', 'punto existente: el núcleo del punto');
select is((select nucleo from hidrantes.v_cola_revision where id = '00000000-0000-4000-8000-0000000008c2'),
  'Centro', 'alta: el núcleo deducido del pin');
select is((select nucleo from hidrantes.v_cola_revision where id = '00000000-0000-4000-8000-0000000008c3'),
  null, 'alta fuera de zona: sin núcleo');
select ok((select punto_actualizado_en is not null from hidrantes.v_cola_revision
            where id = '00000000-0000-4000-8000-0000000008c1'),
  'la cola dice cuándo cambió el punto (aviso de desactualizada)');


-- ---------- núcleos gestionables (FR-166, DEC-068) ----------

set local role postgres;
insert into hidrantes.administradores (email, creado_por) values ('panel@example.com', 'test') on conflict do nothing;
set local request.jwt.claims = '{"email": "panel@example.com"}';

select hidrantes.fn_renombrar_nucleo('Centro', 'Centro histórico');
select is((select nucleo from hidrantes.puntos where codigo = 'HID-0800'), 'El Chaparral',
  'renombrar no toca los puntos de otro núcleo');
select is((select nombre_osm from hidrantes.nucleos where nombre = 'Centro histórico'), 'Centro',
  'el núcleo renombrado recuerda el nombre de OpenStreetMap');
select throws_ok($$ select hidrantes.fn_renombrar_nucleo('Centro histórico', 'x') $$, 'P0001',
  'PAYLOAD_INVALIDO(nombre): El nombre tiene entre 2 y 60 caracteres', 'nombre demasiado corto');

select hidrantes.fn_anadir_nucleo('Nuevo Barrio', 37.2355, -3.6545);
select is((select municipio::text from hidrantes.nucleos where nombre = 'Nuevo Barrio'), 'albolote',
  'el núcleo nuevo deduce su municipio');
select throws_ok($$ select hidrantes.fn_anadir_nucleo('Lejos', 37.9, -4.4) $$, 'P0001',
  'PAYLOAD_INVALIDO(posicion): Ese punto queda fuera de la zona de cobertura', 'no se añade fuera de la zona');

-- ---------- resumen semanal (FR-164) ----------

insert into hidrantes.suscripciones_push (email, suscripcion, temas)
values ('panel@example.com', '{"endpoint": "https://push.example/x", "keys": {"p256dh": "a", "auth": "b"}}',
        array['resumen_semanal']);
select is(hidrantes.fn_encolar_resumen_semanal(), 1, 'el resumen semanal encola un aviso por suscripción');
select ok((select cuerpo not like '%@%' from hidrantes.notificaciones where titulo = 'Resumen semanal'),
  'el resumen no lleva correos ni nombres (FR-27)');

select * from finish();
rollback;
