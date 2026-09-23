-- Tests que faltaban (docs/17 RV-30): el techo diario de errores del cliente (TR-90) y una carga
-- del tamaño previsto con tiempos holgados (TR-60), para detectar un índice perdido. Todo dentro de
-- una transacción que se deshace.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;

select plan(7);

-- ---------- TR-90: techos de errores_cliente ----------

insert into hidrantes.errores_cliente (dispositivo_id, mensaje, momento)
select 'aaaaaaaa-0000-4000-8000-0000000e0001', 'x', now() - interval '1 hour' from generate_series(1, 100);
select hidrantes.fn_registrar_error('aaaaaaaa-0000-4000-8000-0000000e0001', 'uno más', null, '/', 'test');
select is((select count(*)::int from hidrantes.errores_cliente where dispositivo_id = 'aaaaaaaa-0000-4000-8000-0000000e0001'),
  100, 'con 100 errores de un dispositivo en 24 h, el siguiente de ese dispositivo no entra');
select hidrantes.fn_registrar_error('bbbbbbbb-0000-4000-8000-0000000e0002', 'otro móvil', repeat('p', 5000), '/', 'test');
select is((select count(*)::int from hidrantes.errores_cliente where dispositivo_id = 'bbbbbbbb-0000-4000-8000-0000000e0002'),
  1, 'y uno de otro dispositivo sí');
select is((select length(pila) from hidrantes.errores_cliente where dispositivo_id = 'bbbbbbbb-0000-4000-8000-0000000e0002'),
  4096, 'la pila se trunca a 4.096 caracteres');

update hidrantes.config set valor = to_jsonb((select count(*)::int + 0 from hidrantes.errores_cliente
                                              where momento > now() - interval '1 day'))
 where clave = 'max_errores_global_dia';
select hidrantes.fn_registrar_error('cccccccc-0000-4000-8000-0000000e0003', 'por encima del techo global', null, '/', 'test');
select is((select count(*)::int from hidrantes.errores_cliente where dispositivo_id = 'cccccccc-0000-4000-8000-0000000e0003'),
  0, 'con el techo global alcanzado, ninguno más entra');

-- ---------- TR-60: 1.000 puntos, 20.000 propuestas y 100.000 filas de registro ----------

insert into hidrantes.config (clave, valor, actualizado_por)
values ('codigo_acceso_hash', to_jsonb(extensions.crypt('482917', extensions.gen_salt('bf', 4))), 'test')
on conflict (clave) do update set valor = excluded.valor;
select set_config('test.token',
  (select token from hidrantes.fn_verificar_codigo('482917', 'dddddddd-0000-4000-8000-0000000e0004', 'ip-carga')), true);

insert into hidrantes.puntos (codigo, tipo, geom, diametro_mm, caudal, foto_path, municipio, fecha_ultima_revision,
                              descripcion)
select 'HID-' || (6000 + i), 'hidrante',
       ('SRID=4326;POINT(' || (-3.69 + (i % 50) * 0.0015) || ' ' || (37.21 + (i / 50) * 0.0012) || ')')::extensions.geography,
       case when i % 2 = 0 then 100 else 70 end, 'bueno', 'fotos/carga-' || i || '.jpg', 'albolote',
       current_date - (i % 500), '[PRUEBA] carga ' || i
from generate_series(0, 999) i;

insert into hidrantes.propuestas (punto_id, operacion, datos, autor_nombre, autor_apellido, dispositivo_id, clave_local,
                                  foto_path, estado, creada_en)
select p.id, 'revision', '{}', 'Carga', 'Prueba', gen_random_uuid(), 'carga-' || g.i, 'fotos/c-' || g.i || '.jpg',
       case when g.i % 20 = 0 then 'pendiente' else 'aprobada' end::hidrantes.estado_moderacion,
       now() - make_interval(hours => g.i % 5000)
from generate_series(1, 20000) g(i)
join lateral (select id from hidrantes.puntos where codigo = 'HID-' || (6000 + g.i % 1000)) p on true;

insert into hidrantes.registro (actor, es_admin, accion, momento)
select 'carga', true, 'aprobacion', now() - make_interval(mins => i) from generate_series(1, 100000) i;
analyze hidrantes.puntos;
analyze hidrantes.propuestas;
analyze hidrantes.registro;

create temp table tiempos (que text, ms numeric);
create function pg_temp.medir(que text, consulta text) returns void language plpgsql as $$
declare inicio timestamptz := clock_timestamp();
begin
  execute consulta;
  insert into tiempos values (que, extract(epoch from clock_timestamp() - inicio) * 1000);
end $$;
select pg_temp.medir('listar', format('select hidrantes.fn_listar_puntos(%L, null)', current_setting('test.token')));
select pg_temp.medir('cola', 'select count(*) from (select * from hidrantes.v_cola_revision) c');
select pg_temp.medir('registro', 'select count(*) from (select * from hidrantes.v_registro order by momento desc limit 50) r');
select diag(que || ': ' || round(ms) || ' ms') from tiempos;

select ok((select ms from tiempos where que = 'listar') < 1500, 'fn_listar_puntos(token, null) con 1.000 puntos < 1.500 ms');
select ok((select ms from tiempos where que = 'cola') < 1000, 'v_cola_revision con 20.000 propuestas (5 % pendientes) < 1.000 ms');
select ok((select ms from tiempos where que = 'registro') < 200, 'las 50 últimas de v_registro con 100.000 filas < 200 ms');

select * from finish();
rollback;
