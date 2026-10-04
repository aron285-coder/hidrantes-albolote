-- docs/25 RV-110, DEC-160: la cola trae el punto entero (punto jsonb) y su posición (punto_lat,
-- punto_lng), al final y sin tocar las columnas de antes (04 §12); un alta, sin punto; nunca autores
-- ni correos (FR-27). El historial (v_historial_revision) lleva lo mismo. Solo administradores.
-- Todo dentro de una transacción que se deshace.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;

select plan(25);

insert into hidrantes.administradores (email, creado_por) values ('cola-ficha@example.com', 'test') on conflict do nothing;

create function pg_temp.como(email text) returns void language sql as $$
  select set_config('request.jwt.claims',
    format('{"role":"authenticated","email":"%s","amr":[{"method":"oauth","timestamp":1}],"app_metadata":{"provider":"google","providers":["google"]}}', email),
    true);
$$;

-- ---------- forma: las de antes en su sitio y las tres nuevas al final ----------
select is(
  (select array_agg(column_name::text order by ordinal_position)
     from information_schema.columns where table_schema = 'hidrantes' and table_name = 'v_cola_revision'),
  array['id', 'operacion', 'estado', 'creada_en', 'autor_nombre', 'autor_apellido', 'dispositivo_id', 'punto_id',
        'codigo', 'tipo_actual', 'datos', 'foto_path', 'foto_path_actual', 'direccion_sugerida', 'direccion_actual',
        'lat', 'lng', 'antes', 'despues', 'origen_ubicacion', 'precision_gps_m', 'distancia_gps_m', 'distancia_exif_m',
        'fuera_de_zona', 'meses_desde_revision', 'duplicado_de', 'distancia_duplicado_m', 'codigo_duplicado',
        'otra_medida', 'desactualizada', 'nucleo', 'punto_actualizado_en', 'foto_sitio_path',
        'foto_sitio_path_actual', 'sin_foto_sitio', 'punto', 'punto_lat', 'punto_lng'],
  'v_cola_revision: las 35 columnas de 0035 en su orden y punto, punto_lat, punto_lng al final');
select col_type_is('hidrantes', 'v_cola_revision', 'punto', 'jsonb', 'punto es jsonb');
select col_type_is('hidrantes', 'v_cola_revision', 'punto_lat', 'double precision', 'punto_lat es double precision');
select col_type_is('hidrantes', 'v_cola_revision', 'punto_lng', 'double precision', 'punto_lng es double precision');
select has_view('hidrantes', 'v_historial_revision', 'existe v_historial_revision');
select ok((select 'security_invoker=true' = any(c.reloptions) from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'hidrantes' and c.relname = 'v_historial_revision'),
  'v_historial_revision es security_invoker: la filtra la RLS de quien consulta');
select is(
  (select array_agg(column_name::text order by ordinal_position)
     from information_schema.columns where table_schema = 'hidrantes' and table_name = 'v_historial_revision'
      and column_name in ('punto', 'punto_lat', 'punto_lng')),
  array['punto', 'punto_lat', 'punto_lng'], 'el historial lleva las mismas tres columnas');

-- ---------- datos de prueba ----------
-- Una boca de riego con todos los campos (racor, descripciones, foto del sitio) y un hidrante.
insert into hidrantes.puntos (id, codigo, tipo, geom, diametro_mm, caudal, racor, descripcion, descripcion_fallo,
                              direccion, foto_path, foto_sitio_path, municipio, nucleo, fecha_ultima_revision)
values ('00000000-0000-4000-8000-0000000e3601', 'BOC-8601', 'boca_riego', 'SRID=4326;POINT(-3.6512 37.2345)', 45,
        'no_funciona', 'granada', 'Junto al quiosco', 'No abre la llave', 'Calle Real 3', 'fotos/f-con.jpg',
        'fotos/f-sitio.jpg', 'albolote', 'Centro', date '2026-03-15'),
       ('00000000-0000-4000-8000-0000000e3602', 'HID-8602', 'hidrante', 'SRID=4326;POINT(-3.6522 37.2355)', 100,
        'bueno', null, null, null, null, 'fotos/f-hid.jpg', null, 'albolote', 'Centro', current_date);

insert into hidrantes.propuestas (id, punto_id, operacion, datos, autor_nombre, autor_apellido, dispositivo_id,
                                  clave_local, origen_ubicacion, geom, foto_path, foto_sitio_path, estado,
                                  motivo_rechazo, revisada_por, revisada_en)
values
  -- pendientes
  ('00000000-0000-4000-8000-0000000e3611', '00000000-0000-4000-8000-0000000e3601', 'datos', '{"diametro_mm": 70}',
   'Ana', 'Ruiz', gen_random_uuid(), 'cola-ficha-datos', null, null, null, null, 'pendiente', null, null, null),
  ('00000000-0000-4000-8000-0000000e3612', null, 'alta', '{"tipo":"hidrante","diametro_mm":100,"caudal":"bueno"}',
   'Ana', 'Ruiz', gen_random_uuid(), 'cola-ficha-alta', 'gps', 'SRID=4326;POINT(-3.6532 37.2365)',
   'fotos/a-con.jpg', 'fotos/a-sitio.jpg', 'pendiente', null, null, null),
  ('00000000-0000-4000-8000-0000000e3613', '00000000-0000-4000-8000-0000000e3602', 'ubicacion', '{}',
   'Ana', 'Ruiz', gen_random_uuid(), 'cola-ficha-ubic', 'gps', 'SRID=4326;POINT(-3.6524 37.2357)',
   'fotos/u-con.jpg', 'fotos/u-sitio.jpg', 'pendiente', null, null, null),
  -- decididas
  ('00000000-0000-4000-8000-0000000e3621', '00000000-0000-4000-8000-0000000e3601', 'estado', '{"caudal": "malo"}',
   'Ana', 'Ruiz', gen_random_uuid(), 'cola-ficha-rech', null, null, 'fotos/r.jpg', null, 'rechazada',
   'Foto movida', 'cola-ficha@example.com', now()),
  ('00000000-0000-4000-8000-0000000e3622', null, 'alta', '{"tipo":"hidrante","diametro_mm":70,"caudal":"bueno"}',
   'Ana', 'Ruiz', gen_random_uuid(), 'cola-ficha-alta-apr', 'manual', 'SRID=4326;POINT(-3.6542 37.2375)',
   'fotos/a2-con.jpg', 'fotos/a2-sitio.jpg', 'aprobada', null, 'cola-ficha@example.com', now());

-- ---------- como administrador ----------
select pg_temp.como('cola-ficha@example.com');
set local role authenticated;

select is((select punto from hidrantes.v_cola_revision where id = '00000000-0000-4000-8000-0000000e3611'),
  jsonb_build_object('codigo', 'BOC-8601', 'tipo', 'boca_riego', 'diametro_mm', 45, 'caudal', 'no_funciona',
    'racor', 'granada', 'descripcion', 'Junto al quiosco', 'descripcion_fallo', 'No abre la llave',
    'direccion', 'Calle Real 3', 'nucleo', 'Centro', 'fecha_ultima_revision', '2026-03-15',
    'foto_path', 'fotos/f-con.jpg', 'foto_sitio_path', 'fotos/f-sitio.jpg'),
  'una propuesta de datos trae punto con los doce campos y sus valores de hoy');
select is((select round(punto_lat::numeric, 6) || ',' || round(punto_lng::numeric, 6)
             from hidrantes.v_cola_revision where id = '00000000-0000-4000-8000-0000000e3611'),
  '37.234500,-3.651200', 'punto_lat y punto_lng son la geometría del punto');
select ok((select lat is null and lng is null from hidrantes.v_cola_revision
            where id = '00000000-0000-4000-8000-0000000e3611'),
  'lat y lng siguen siendo el pin de la propuesta (null en datos): no cambian de significado');
select is((select diametro_mm from hidrantes.v_cola_revision c, jsonb_to_record(c.antes) as a(diametro_mm int)
            where c.id = '00000000-0000-4000-8000-0000000e3611'), 45, 'antes sigue igual que en 0035');

select ok((select punto is null and punto_lat is null and punto_lng is null from hidrantes.v_cola_revision
            where id = '00000000-0000-4000-8000-0000000e3612'), 'un alta trae punto, punto_lat y punto_lng nulos');
select ok((select lat is not null from hidrantes.v_cola_revision where id = '00000000-0000-4000-8000-0000000e3612'),
  'y el alta conserva su pin en lat/lng');

select is((select round(punto_lat::numeric, 4) || ',' || round(punto_lng::numeric, 4) || '|'
                  || round(lat::numeric, 4) || ',' || round(lng::numeric, 4)
             from hidrantes.v_cola_revision where id = '00000000-0000-4000-8000-0000000e3613'),
  '37.2355,-3.6522|37.2357,-3.6524', 'una ubicación trae la posición de ahora (punto_*) y la propuesta (lat/lng)');
select ok((select punto ? 'racor' and jsonb_typeof(punto -> 'racor') = 'null' from hidrantes.v_cola_revision
            where id = '00000000-0000-4000-8000-0000000e3613'),
  'un hidrante: racor va con la clave y valor null; el objeto tiene siempre las mismas doce claves');

-- FR-27: ninguna clave de autor, de dispositivo ni de revisor, y ningún correo.
select is((select count(*)::int from hidrantes.v_cola_revision c, jsonb_object_keys(c.punto) k
            where k ~ '^(autor|dispositivo|revisad|creado_por|actualizado_por|email)'), 0,
  'punto no contiene autores, dispositivo ni revisor (FR-27)');
select is((select count(*)::int from hidrantes.v_cola_revision where punto::text like '%@%'), 0,
  'punto no contiene ningún correo');
select is((select array_agg(k order by k) from (select distinct jsonb_object_keys(punto) k
             from hidrantes.v_cola_revision where punto is not null) s),
  array['caudal', 'codigo', 'descripcion', 'descripcion_fallo', 'diametro_mm', 'direccion', 'fecha_ultima_revision',
        'foto_path', 'foto_sitio_path', 'nucleo', 'racor', 'tipo'],
  'las claves de punto son exactamente las doce del contrato');

-- historial
select is((select count(*)::int from hidrantes.v_historial_revision
            where id in ('00000000-0000-4000-8000-0000000e3611', '00000000-0000-4000-8000-0000000e3612',
                         '00000000-0000-4000-8000-0000000e3613')), 0,
  'el historial no trae pendientes');
select is((select (punto ->> 'codigo') || '|' || round(punto_lat::numeric, 4) || '|' || motivo_rechazo || '|' || codigo
             from hidrantes.v_historial_revision where id = '00000000-0000-4000-8000-0000000e3621'),
  'BOC-8601|37.2345|Foto movida|BOC-8601', 'una rechazada trae el punto, su posición y el motivo');
select ok((select punto is null and punto_lat is null and punto_lng is null and lat is not null
             from hidrantes.v_historial_revision where id = '00000000-0000-4000-8000-0000000e3622'),
  'un alta aprobada: sin punto (punto_id sigue null) y con su pin');
reset role;

-- ---------- quién puede leer ----------
select pg_temp.como('voluntario-ficha@example.com');
set local role authenticated;
select is((select count(*)::int from hidrantes.v_cola_revision), 0, 'no administrador: v_cola_revision vacía');
select is((select count(*)::int from hidrantes.v_historial_revision), 0, 'no administrador: v_historial_revision vacía');
reset role;

set local role anon;
select throws_ok($$ select * from hidrantes.v_historial_revision $$, '42501', null,
  'anon: v_historial_revision → permission denied');
reset role;

set local role service_role;
select ok((select count(*) from hidrantes.v_historial_revision where id = '00000000-0000-4000-8000-0000000e3621') = 1,
  'service_role lee v_historial_revision (05 §5)');
reset role;

select * from finish();
rollback;
