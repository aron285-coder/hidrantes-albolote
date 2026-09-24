-- docs/18 RV-33: la lista de fotos que la purga conserva viene entera aunque pase de 1.000, en una
-- sola fila que max_rows de PostgREST no corta. Todo dentro de una transacción que se deshace.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;

select plan(6);

insert into hidrantes.puntos (codigo, tipo, geom, diametro_mm, caudal, foto_path, municipio, fecha_ultima_revision,
                              descripcion)
select 'HID-' || (7000 + i), 'hidrante',
       ('SRID=4326;POINT(' || (-3.69 + (i % 40) * 0.0015) || ' ' || (37.21 + (i / 40) * 0.0012) || ')')::extensions.geography,
       100, 'bueno', 'rv33/foto-' || i || '.jpg', 'albolote', current_date, '[PRUEBA] RV-33 ' || i
from generate_series(1, 1200) i;

create temp table lista as select hidrantes.fn_fotos_referenciadas_lista() l;

select cmp_ok(((select l from lista) ->> 'total')::int, '>=', 1200,
  'con 1.200 puntos con foto distinta, total cuenta al menos 1.200');
select is(jsonb_array_length((select l from lista) -> 'fotos'), ((select l from lista) ->> 'total')::int,
  'la lista trae tantas fotos como dice total');
select is((select count(*)::int from lista, jsonb_array_elements_text(l -> 'fotos') f where f like 'rv33/%'),
  1200, 'y están las 1.200 de los puntos nuevos');
select is(((select l from lista) ->> 'total')::int,
  (select count(distinct f)::int from hidrantes.fn_fotos_referenciadas() f),
  'lo mismo que la función antigua, sin repetidas');

select ok(not has_function_privilege('anon', 'hidrantes.fn_fotos_referenciadas_lista()', 'execute'),
  'anon no la ejecuta');
select ok(not has_function_privilege('authenticated', 'hidrantes.fn_fotos_referenciadas_lista()', 'execute'),
  'authenticated tampoco: solo service_role');

select * from finish();
rollback;
