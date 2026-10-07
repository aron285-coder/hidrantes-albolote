-- docs/31 RV-140 a RV-143 (0039, DEC-174, DEC-175): límites de texto, tope de propuestas al día,
-- tope global de subidas con protección de 48 h, y dispositivo reservado. Más la dirección vacía en
-- las correcciones que pidió Frontend-panel para RV-162. Todo dentro de una transacción que se deshace.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;

select plan(45);

-- ---------- datos de prueba ----------

insert into hidrantes.config (clave, valor, actualizado_por)
values ('codigo_acceso_hash', to_jsonb(extensions.crypt('482917', extensions.gen_salt('bf', 4))), 'test')
on conflict (clave) do update set valor = excluded.valor;
insert into hidrantes.administradores (email, creado_por) values
  ('jefa34@example.com', 'test'), ('antigua34@example.com', 'test') on conflict do nothing;
update hidrantes.administradores set activo = false where email = 'antigua34@example.com';

insert into hidrantes.puntos (id, codigo, tipo, geom, diametro_mm, caudal, foto_path, municipio, direccion,
                              fecha_ultima_revision, actualizado_en)
values
  ('00000000-0000-4000-8000-0000000e3401', 'HID-8701', 'hidrante', 'SRID=4326;POINT(-3.6569 37.2308)', 100, 'bueno',
   'fotos/p34-1.jpg', 'albolote', 'Calle Vieja 1', current_date - 30, now() - interval '5 days'),
  ('00000000-0000-4000-8000-0000000e3402', 'HID-8702', 'hidrante', 'SRID=4326;POINT(-3.6560 37.2310)', 100, 'bueno',
   'fotos/p34-2.jpg', 'albolote', 'Calle Vieja 2', current_date - 30, now() - interval '5 days'),
  ('00000000-0000-4000-8000-0000000e3403', 'HID-8703', 'hidrante', 'SRID=4326;POINT(-3.6550 37.2312)', 100, 'bueno',
   'fotos/p34-3.jpg', 'albolote', 'Calle Vieja 3', current_date - 30, now() - interval '5 days'),
  -- su foto es una reserva nunca confirmada de hace 49 h: está referenciada, la purga no la toca
  ('00000000-0000-4000-8000-0000000e3404', 'HID-8704', 'hidrante', 'SRID=4326;POINT(-3.6540 37.2314)', 100, 'bueno',
   'fotos/s34-49h-punto.jpg', 'albolote', null, current_date - 30, now() - interval '5 days');

select set_config('request.jwt.claims', '', true);
select set_config('test.token_a',
  (select token from hidrantes.fn_verificar_codigo('482917', 'aaaaaaaa-0000-4000-8000-0000000e3401', 'ip-34')), true);
select set_config('test.token_b',
  (select token from hidrantes.fn_verificar_codigo('482917', 'bbbbbbbb-0000-4000-8000-0000000e3402', 'ip-34')), true);

create function pg_temp.jefatura() returns void language sql as $$
  select set_config('request.jwt.claims',
    '{"role":"authenticated","email":"jefa34@example.com","amr":[{"method":"oauth","timestamp":1}],"app_metadata":{"provider":"google","providers":["google"]}}',
    true);
$$;
create function pg_temp.voluntario() returns void language sql as $$
  select set_config('request.jwt.claims', '', true);
$$;
-- Propuesta de un voluntario con el token que se diga y sin foto ("corregir datos").
create function pg_temp.datos(token text, clave text, d jsonb, nombre text default 'Ana') returns jsonb language sql as $$
  select hidrantes.fn_proponer(token, clave, nombre, 'Ruiz', 'datos', '00000000-0000-4000-8000-0000000e3401', d,
    null, null, null, null, null, null, null, null, null);
$$;
-- El detail de un error, para leer reintentar_en_s.
create function pg_temp.detalle(sentencia text) returns text language plpgsql as $$
declare
  d text;
begin
  execute sentencia;
  return null;
exception when others then
  get stacked diagnostics d = pg_exception_detail;
  return d;
end $$;

-- ---------- RV-140: longitudes ----------

select throws_like($$ select pg_temp.datos(current_setting('test.token_a'), 'l34-desc-501', jsonb_build_object('descripcion', repeat('x', 501))) $$,
  'PAYLOAD_INVALIDO(descripcion)%', 'fn_proponer: descripcion de 501 caracteres, rechazada');
select lives_ok($$ select pg_temp.datos(current_setting('test.token_a'), 'l34-desc-500', jsonb_build_object('descripcion', repeat('x', 500))) $$,
  'y de 500, entra');
select throws_like($$ select pg_temp.datos(current_setting('test.token_a'), 'l34-desc-obj',
    jsonb_build_object('descripcion', jsonb_build_object('a', repeat('x', 600)))) $$,
  'PAYLOAD_INVALIDO(descripcion)%', 'un objeto enorme en descripcion tampoco pasa');

insert into hidrantes.subidas (dispositivo_id, foto_path, reservada_en) values
  ('aaaaaaaa-0000-4000-8000-0000000e3401', 'fotos/l34-nota.jpg', now());
select throws_like($$ select hidrantes.fn_proponer(current_setting('test.token_a'), 'l34-nota', 'Ana', 'Ruiz', 'revision',
    '00000000-0000-4000-8000-0000000e3401', jsonb_build_object('nota', repeat('n', 1001)), null, null, null, null, null,
    null, null, null, 'fotos/l34-nota.jpg') $$,
  'PAYLOAD_INVALIDO(nota)%', 'fn_proponer: nota de 1.001 caracteres, rechazada');
select throws_like($$ select hidrantes.fn_proponer(current_setting('test.token_a'), 'l34-fallo', 'Ana', 'Ruiz', 'estado',
    '00000000-0000-4000-8000-0000000e3401', jsonb_build_object('caudal', 'no_funciona', 'descripcion_fallo', repeat('f', 501)),
    null, null, null, null, null, null, null, null, 'fotos/l34-nota.jpg') $$,
  'PAYLOAD_INVALIDO(descripcion_fallo)%', 'fn_proponer: descripcion_fallo de 501, rechazada');
select throws_like($$ select pg_temp.datos(current_setting('test.token_a'), 'l34-nombre', '{"descripcion":"x"}', repeat('a', 61)) $$,
  'PAYLOAD_INVALIDO(autor_nombre)%', 'un nombre de 61 caracteres: PAYLOAD_INVALIDO(autor_nombre)');
select throws_like($$ select pg_temp.datos(current_setting('test.token_a'), 'l34-sin-nombre', '{"descripcion":"x"}', '  ') $$,
  'PAYLOAD_INVALIDO(autor)%', 'sin nombre, como antes: PAYLOAD_INVALIDO(autor)');

-- Jefatura: editar, aprobar con correcciones, rechazar, retirar y borrar.
insert into hidrantes.propuestas (id, punto_id, operacion, datos, autor_nombre, autor_apellido, dispositivo_id,
                                  clave_local, foto_path)
values ('00000000-0000-4000-8000-0000000e3411', '00000000-0000-4000-8000-0000000e3402', 'revision', '{}',
        'Ana', 'Ruiz', 'aaaaaaaa-0000-4000-8000-0000000e3401', 'l34-pend-1', 'fotos/pp34-1.jpg');
select pg_temp.jefatura();
select throws_like($$ select hidrantes.fn_editar_punto('00000000-0000-4000-8000-0000000e3403',
    jsonb_build_object('direccion', repeat('d', 201))) $$,
  'PAYLOAD_INVALIDO(direccion)%', 'fn_editar_punto: dirección de 201, rechazada');
select lives_ok($$ select hidrantes.fn_editar_punto('00000000-0000-4000-8000-0000000e3403',
    jsonb_build_object('direccion', repeat('d', 200))) $$,
  'y de 200, entra');
select throws_like($$ select hidrantes.fn_aprobar('00000000-0000-4000-8000-0000000e3411',
    jsonb_build_object('descripcion', repeat('x', 501))) $$,
  'PAYLOAD_INVALIDO(descripcion)%', 'fn_aprobar: correcciones con descripcion de 501, rechazadas');
select throws_like($$ select hidrantes.fn_rechazar('00000000-0000-4000-8000-0000000e3411', repeat('m', 1001)) $$,
  'PAYLOAD_INVALIDO(motivo)%', 'fn_rechazar: motivo de 1.001, rechazado');
select throws_like($$ select hidrantes.fn_retirar_punto('00000000-0000-4000-8000-0000000e3403', repeat('m', 1001)) $$,
  'PAYLOAD_INVALIDO(motivo)%', 'fn_retirar_punto: motivo de 1.001, rechazado');
select throws_like($$ select hidrantes.fn_borrar_punto('00000000-0000-4000-8000-0000000e3403', repeat('m', 1001)) $$,
  'PAYLOAD_INVALIDO(motivo)%', 'fn_borrar_punto: motivo de 1.001, rechazado');
select lives_ok($$ select hidrantes.fn_rechazar('00000000-0000-4000-8000-0000000e3411', repeat('m', 1000)) $$,
  'un motivo de 1.000 sí');

-- ---------- RV-162: la dirección vacía en las correcciones ----------

insert into hidrantes.propuestas (id, punto_id, operacion, datos, autor_nombre, autor_apellido, dispositivo_id,
                                  clave_local, foto_path, geom, origen_ubicacion, direccion_sugerida)
values
  ('00000000-0000-4000-8000-0000000e3421', null, 'alta', '{"tipo":"hidrante","diametro_mm":100,"caudal":"bueno"}',
   'Ana', 'Ruiz', 'aaaaaaaa-0000-4000-8000-0000000e3401', 'd34-alta', 'fotos/pa34.jpg',
   'SRID=4326;POINT(-3.6450 37.2400)', 'gps', 'Calle Sugerida 9'),
  ('00000000-0000-4000-8000-0000000e3422', '00000000-0000-4000-8000-0000000e3401', 'revision', '{}',
   'Ana', 'Ruiz', 'aaaaaaaa-0000-4000-8000-0000000e3401', 'd34-rev-null', 'fotos/pr34-1.jpg', null, null, null),
  ('00000000-0000-4000-8000-0000000e3423', '00000000-0000-4000-8000-0000000e3402', 'revision', '{}',
   'Ana', 'Ruiz', 'aaaaaaaa-0000-4000-8000-0000000e3401', 'd34-rev-sin', 'fotos/pr34-2.jpg', null, null, null);

select set_config('test.alta', hidrantes.fn_aprobar('00000000-0000-4000-8000-0000000e3421', '{"direccion": null}') ->> 'punto_id', true);
select is((select direccion from hidrantes.puntos where id = current_setting('test.alta')::uuid), null,
  'alta aprobada con {direccion: null}: sin dirección, aunque hubiera una sugerida');
select is((select correcciones ? 'direccion' from hidrantes.propuestas where id = '00000000-0000-4000-8000-0000000e3421'), true,
  'y queda como corrección');
select hidrantes.fn_aprobar('00000000-0000-4000-8000-0000000e3422', '{"direccion": ""}');
select is((select direccion from hidrantes.puntos where id = '00000000-0000-4000-8000-0000000e3401'), null,
  'revisión aprobada con dirección vacía: la quita');
select hidrantes.fn_aprobar('00000000-0000-4000-8000-0000000e3423');
select is((select direccion from hidrantes.puntos where id = '00000000-0000-4000-8000-0000000e3402'), 'Calle Vieja 2',
  'sin la clave, se queda la que tenía');

-- ---------- RV-141: 60 propuestas al día por dispositivo ----------

select pg_temp.voluntario();
-- 59 de hoy y 5 de ayer (en Madrid) del dispositivo B.
insert into hidrantes.propuestas (punto_id, operacion, datos, autor_nombre, autor_apellido, dispositivo_id, clave_local, creada_en)
select '00000000-0000-4000-8000-0000000e3401', 'datos', '{"descripcion":"x"}', 'Bea', 'Gil',
       'bbbbbbbb-0000-4000-8000-0000000e3402', 'c34-hoy-' || i, now()
from generate_series(1, 59) i;
insert into hidrantes.propuestas (punto_id, operacion, datos, autor_nombre, autor_apellido, dispositivo_id, clave_local, creada_en)
select '00000000-0000-4000-8000-0000000e3401', 'datos', '{"descripcion":"x"}', 'Bea', 'Gil',
       'bbbbbbbb-0000-4000-8000-0000000e3402', 'c34-ayer-' || i,
       (date_trunc('day', now() at time zone 'Europe/Madrid') at time zone 'Europe/Madrid') - interval '1 minute'
from generate_series(1, 5) i;

select set_config('test.p60', pg_temp.datos(current_setting('test.token_b'), 'c34-la-60', '{"descripcion":"y"}') ->> 'propuesta_id', true);
select isnt(current_setting('test.p60'), '', 'la 60.ª del día entra (las de ayer no cuentan)');
select throws_like($$ select pg_temp.datos(current_setting('test.token_b'), 'c34-la-61', '{"descripcion":"z"}') $$,
  'CUOTA_PROPUESTAS_AGOTADA%', 'la 61.ª: CUOTA_PROPUESTAS_AGOTADA');
select ok((pg_temp.detalle($$ select pg_temp.datos(current_setting('test.token_b'), 'c34-la-61', '{"descripcion":"z"}') $$)::jsonb
           ->> 'reintentar_en_s')::int between 1 and 90000,
  'con reintentar_en_s hasta la medianoche de Madrid en details');
select is(pg_temp.datos(current_setting('test.token_b'), 'c34-la-60', '{"descripcion":"y"}') ->> 'propuesta_id',
  current_setting('test.p60'), 'un reintento de la 60.ª con su clave_local no cuenta: devuelve la misma');
select lives_ok($$ select pg_temp.datos(current_setting('test.token_a'), 'c34-otro', '{"descripcion":"y"}') $$,
  'el tope es por dispositivo: otro móvil sigue');

-- Jefatura no tiene tope: 70 suyas de hoy y una más.
insert into hidrantes.propuestas (punto_id, operacion, datos, autor_nombre, autor_apellido, dispositivo_id, clave_local)
select '00000000-0000-4000-8000-0000000e3402', 'datos', '{"descripcion":"x"}', 'Jefatura', 'jefa34@example.com',
       hidrantes.fn_dispositivo_admin('jefa34@example.com'), 'c34-jefa-' || i
from generate_series(1, 70) i;
select pg_temp.jefatura();
select is(hidrantes.fn_proponer(null, 'c34-jefa-71', 'x', 'y', 'datos', '00000000-0000-4000-8000-0000000e3402',
    '{"descripcion":"jefa"}', null, null, null, null, null, null, null, null, null) ->> 'aplicada',
  'true', 'jefatura no tiene tope de propuestas');

select lives_ok($$ select hidrantes.fn_guardar_config('{"max_propuestas_dia": 100, "max_subidas_dia_total": 800}') $$,
  'Ajustes guarda max_propuestas_dia y max_subidas_dia_total');
select throws_like($$ select hidrantes.fn_guardar_config('{"max_propuestas_dia": 0}') $$,
  'CONFIG_INVALIDA(max_propuestas_dia)%', 'max_propuestas_dia fuera de rango: rechazado');

-- ---------- RV-142: tope global y 48 h ----------

select pg_temp.voluntario();
select is(hidrantes.fn_config('dias_reserva_subida', 'null'), '2'::jsonb, 'dias_reserva_subida = 2 (48 h)');
select is(hidrantes.fn_config('max_subidas_dia_total', 'null'), '800'::jsonb, 'max_subidas_dia_total en config');

insert into hidrantes.subidas (dispositivo_id, foto_path, reservada_en, confirmada_en) values
  ('aaaaaaaa-0000-4000-8000-0000000e3401', 'fotos/s34-23h.jpg', now() - interval '23 hours', null),
  ('aaaaaaaa-0000-4000-8000-0000000e3401', 'fotos/s34-25h.jpg', now() - interval '25 hours', null),
  ('aaaaaaaa-0000-4000-8000-0000000e3401', 'fotos/s34-47h.jpg', now() - interval '47 hours', null),
  ('aaaaaaaa-0000-4000-8000-0000000e3401', 'fotos/s34-49h.jpg', now() - interval '49 hours', null),
  ('aaaaaaaa-0000-4000-8000-0000000e3401', 'fotos/s34-49h-conf.jpg', now() - interval '49 hours', now() - interval '48 hours'),
  ('aaaaaaaa-0000-4000-8000-0000000e3401', 'fotos/s34-49h-punto.jpg', now() - interval '49 hours', null);

select throws_like($$ select hidrantes.fn_proponer(current_setting('test.token_a'), 'r34-res-25h', 'Ana', 'Ruiz', 'revision',
    '00000000-0000-4000-8000-0000000e3403', '{}', null, null, null, null, null, null, null, null, 'fotos/s34-25h.jpg') $$,
  'FOTO_NO_RESERVADA%', 'una reserva sin confirmar de hace 25 h ya no se acepta');
select is(hidrantes.fn_proponer(current_setting('test.token_a'), 'r34-res-23h', 'Ana', 'Ruiz', 'revision',
    '00000000-0000-4000-8000-0000000e3403', '{}', null, null, null, null, null, null, null, null, 'fotos/s34-23h.jpg') ->> 'estado',
  'pendiente', 'una de hace 23 h, sí');
select ok('fotos/s34-47h.jpg' in (select hidrantes.fn_fotos_referenciadas()),
  'la purga protege una reserva sin confirmar de hace 47 h');
select ok('fotos/s34-49h.jpg' not in (select hidrantes.fn_fotos_referenciadas()),
  'y no una de hace 49 h');

set local role service_role;
select set_config('test.basura', hidrantes.fn_reservas_sin_confirmar_lista()::text, true);
reset role;
select ok(current_setting('test.basura')::jsonb -> 'fotos' ? 'fotos/s34-49h.jpg',
  'fn_reservas_sin_confirmar_lista trae la nunca confirmada de hace 49 h');
select ok(not (current_setting('test.basura')::jsonb -> 'fotos' ?| array['fotos/s34-49h-conf.jpg', 'fotos/s34-47h.jpg',
                                                                       'fotos/s34-49h-punto.jpg']),
  'y no la confirmada, ni la de 47 h, ni la que usa un punto');
select is((current_setting('test.basura')::jsonb ->> 'total')::int,
          jsonb_array_length(current_setting('test.basura')::jsonb -> 'fotos'), 'total cuadra con la lista');
set local role anon;
select throws_ok($$ select hidrantes.fn_reservas_sin_confirmar_lista() $$, '42501', null,
  'anon no ejecuta fn_reservas_sin_confirmar_lista');
reset role;
set local role authenticated;
select throws_ok($$ select hidrantes.fn_reservas_sin_confirmar_lista() $$, '42501', null, 'authenticated tampoco');
reset role;

-- Tope global: 5 reservas de jefatura de hoy que no cuentan, y el tope justo en lo que hay + 1.
insert into hidrantes.subidas (dispositivo_id, foto_path)
select hidrantes.fn_dispositivo_admin('jefa34@example.com'), 'fotos/g34-jefa-' || i || '.jpg' from generate_series(1, 5) i;
update hidrantes.config set valor = to_jsonb(1 + (
  select count(*) from hidrantes.subidas s where s.reservada_en > now() - interval '1 day'
     and not exists (select 1 from hidrantes.administradores a
                      where hidrantes.fn_dispositivo_admin(a.email) = s.dispositivo_id)))
 where clave = 'max_subidas_dia_total';
set local role service_role;
select lives_ok($$ select hidrantes.fn_reservar_subida(current_setting('test.token_b')) $$,
  'las reservas de jefatura no cuentan en el tope global: queda una plaza');
select throws_like($$ select hidrantes.fn_reservar_subida(current_setting('test.token_a')) $$,
  'CUOTA_SUBIDAS_AGOTADA%', 'con el tope global lleno, CUOTA_SUBIDAS_AGOTADA para cualquier voluntario');
reset role;
select pg_temp.jefatura();
select lives_ok($$ select hidrantes.fn_reservar_subida_admin() $$, 'jefatura sigue pudiendo reservar');
select pg_temp.voluntario();

-- ---------- RV-143: dispositivo reservado ----------

select is((select error from hidrantes.fn_verificar_codigo('482917', hidrantes.fn_dispositivo_admin('jefa34@example.com'), 'ip-34r')),
  'DISPOSITIVO_RESERVADO', 'el dispositivo_id de un administrador activo: DISPOSITIVO_RESERVADO');
select is((select error from hidrantes.fn_verificar_codigo('482917', hidrantes.fn_dispositivo_admin('antigua34@example.com'), 'ip-34r')),
  'DISPOSITIVO_RESERVADO', 'también el de uno desactivado');
select is((select count(*)::int from hidrantes.dispositivos
            where dispositivo_id in (hidrantes.fn_dispositivo_admin('jefa34@example.com'),
                                     hidrantes.fn_dispositivo_admin('antigua34@example.com'))), 0,
  'y no se emite ningún token');
select is((select error from hidrantes.fn_verificar_codigo('000000', hidrantes.fn_dispositivo_admin('jefa34@example.com'), 'ip-34r')),
  'CODIGO_INCORRECTO', 'sin el código bueno no dice nada del dispositivo');
select ok((select token is not null and error is null
             from hidrantes.fn_verificar_codigo('482917', 'cccccccc-0000-4000-8000-0000000e3403', 'ip-34r')),
  'un dispositivo_id normal recibe su token');

select * from finish();
rollback;
