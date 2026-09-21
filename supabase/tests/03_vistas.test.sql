-- Fase 2 · vistas y helpers: simbología (06 §4), revisión caducada, señales de la cola (FR-104),
-- municipio y núcleo con el margen de 400 m (DEC-057).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;

select plan(26);

-- ---------- fn_radio_px: las 12 combinaciones de 06 §4.2 ----------

select is(hidrantes.fn_radio_px(d::smallint, c::hidrantes.estado_caudal), r::numeric,
          format('radio %s mm · %s = %s px', d, c, r))
from (values
  (100, 'bueno', 11), (100, 'regular', 9), (100, 'malo', 7), (100, 'no_funciona', 5),
  ( 70, 'bueno',  9), ( 70, 'regular', 7), ( 70, 'malo', 5.5), ( 70, 'no_funciona', 5),
  ( 45, 'bueno',  7), ( 45, 'regular', 5.5), ( 45, 'malo', 5.5), ( 45, 'no_funciona', 5)
) as t(d, c, r);

update hidrantes.config set valor = '[14, 12, 9, 7, 6]' where clave = 'escala_radios';
select is(hidrantes.fn_radio_px(100::smallint, 'bueno'), 14::numeric, 'los radios salen de config.escala_radios');
update hidrantes.config set valor = '[11, 9, 7, 5.5, 5]' where clave = 'escala_radios';

-- ---------- zona de prueba: dos cuadrados de ~1,1 km y un núcleo ----------

delete from hidrantes.nucleos;
delete from hidrantes.limite_municipal;
insert into hidrantes.limite_municipal (municipio, geom, version) values
  ('albolote',  'SRID=4326;MULTIPOLYGON(((-3.66 37.23,-3.65 37.23,-3.65 37.24,-3.66 37.24,-3.66 37.23)))', 'test'),
  ('calicasas', 'SRID=4326;MULTIPOLYGON(((-3.62 37.27,-3.61 37.27,-3.61 37.28,-3.62 37.28,-3.62 37.27)))', 'test');
insert into hidrantes.nucleos (nombre, municipio, geom, version) values
  ('Centro', 'albolote', 'SRID=4326;POINT(-3.655 37.235)', 'test');

select results_eq(
  $$ select municipio::text, nucleo from hidrantes.fn_municipio_de('SRID=4326;POINT(-3.655 37.236)') $$,
  $$ values ('albolote', 'Centro') $$, 'dentro del término y cerca del núcleo');
select results_eq(
  -- 1° de longitud ≈ 88,7 km a esta latitud: 0,0034° ≈ 300 m al oeste del término
  $$ select municipio::text from hidrantes.fn_municipio_de('SRID=4326;POINT(-3.6634 37.235)') $$,
  $$ values ('albolote') $$, 'a 300 m fuera del término: dentro del margen, municipio más cercano');
select results_eq(
  $$ select municipio::text, nucleo from hidrantes.fn_municipio_de('SRID=4326;POINT(-3.668 37.235)') $$,
  $$ values ('fuera_de_zona', null::text) $$, 'a 700 m: fuera de zona, sin núcleo');
select results_eq(
  $$ select municipio::text, nucleo from hidrantes.fn_municipio_de('SRID=4326;POINT(-3.615 37.275)') $$,
  $$ values ('calicasas', 'diseminado') $$, 'sin núcleo a menos de 1.500 m: diseminado');

-- ---------- v_puntos_activos y v_cola_revision ----------

insert into hidrantes.puntos (id, codigo, tipo, geom, diametro_mm, caudal, foto_path, municipio, fecha_ultima_revision,
                              situacion, borrado_en, actualizado_en)
values
  ('00000000-0000-4000-8000-0000000000b1', 'HID-0300', 'hidrante', 'SRID=4326;POINT(-3.655 37.236)', 70, 'regular',
   'fotos/a.jpg', 'albolote', current_date - 400, 'activo', null, now() - interval '1 hour'),
  ('00000000-0000-4000-8000-0000000000b2', 'HID-0301', 'hidrante', 'SRID=4326;POINT(-3.656 37.236)', 70, 'bueno',
   'fotos/b.jpg', 'albolote', current_date, 'borrado', now(), now());

select is((select radio_px from hidrantes.v_puntos_activos where codigo = 'HID-0300'), 7::numeric,
  'v_puntos_activos calcula radio_px');
select ok((select revision_caducada from hidrantes.v_puntos_activos where codigo = 'HID-0300'),
  'revisión de hace 400 días: caducada con meses_revision = 12');
select is((select count(*)::int from hidrantes.v_puntos_activos where codigo = 'HID-0301'), 0,
  'los puntos en la papelera no salen en el mapa');
select is((select round(lat::numeric, 3) from hidrantes.v_puntos_activos where codigo = 'HID-0300'), 37.236,
  'v_puntos_activos expone lat');

insert into hidrantes.propuestas (id, punto_id, operacion, datos, autor_nombre, autor_apellido, dispositivo_id,
                                  clave_local, foto_path, creada_en)
values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000b1', 'estado',
        '{"caudal": "malo"}', 'A', 'B', gen_random_uuid(), 'vista-1', 'fotos/c.jpg', now() - interval '2 hours');
insert into hidrantes.propuestas (id, operacion, datos, autor_nombre, autor_apellido, dispositivo_id, clave_local,
                                  foto_path, origen_ubicacion, geom, duplicado_de, distancia_duplicado_m)
values ('00000000-0000-4000-8000-0000000000c2', 'alta', '{"tipo": "hidrante", "diametro_otro": 80, "caudal": "bueno"}',
        'A', 'B', gen_random_uuid(), 'vista-2', 'fotos/d.jpg', 'gps', 'SRID=4326;POINT(-3.668 37.235)',
        '00000000-0000-4000-8000-0000000000b1', 8);

select is((select antes from hidrantes.v_cola_revision where id = '00000000-0000-4000-8000-0000000000c1'),
  '{"caudal": "regular"}'::jsonb, 'la cola muestra el antes del campo que cambia');
select ok((select desactualizada from hidrantes.v_cola_revision where id = '00000000-0000-4000-8000-0000000000c1'),
  'propuesta anterior al último cambio del punto: desactualizada');
select ok((select otra_medida from hidrantes.v_cola_revision where id = '00000000-0000-4000-8000-0000000000c2'),
  'alta con diametro_otro: otra_medida');
select ok((select fuera_de_zona from hidrantes.v_cola_revision where id = '00000000-0000-4000-8000-0000000000c2'),
  'alta a 700 m del término: señal de fuera de zona');
select is((select codigo_duplicado from hidrantes.v_cola_revision where id = '00000000-0000-4000-8000-0000000000c2'),
  'HID-0300', 'la cola nombra el posible duplicado');

select * from finish();
rollback;
