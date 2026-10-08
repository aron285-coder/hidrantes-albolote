-- docs/32 (0041, DEC-182, DEC-183): espacio de fotos y reservas abiertas (RV-220), topes de propuestas
-- y canjes (RV-221), cupo propio de los errores de la app anterior (RV-222), compatibilidad con la app
-- 0.7.0 (RV-223), avisos de jefatura por administrador (RV-225), cerrar sesión (RV-226), pedidos
-- recientes (RV-260), revocar un móvil (RV-262) y la dirección al fusionar (RV-253). Todo dentro de
-- una transacción que se deshace.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;

select plan(84);

-- ---------- datos de prueba ----------

insert into hidrantes.config (clave, valor, actualizado_por)
values ('codigo_acceso_hash', to_jsonb(extensions.crypt('482917', extensions.gen_salt('bf', 4))), 'test')
on conflict (clave) do update set valor = excluded.valor;
insert into hidrantes.administradores (email, creado_por) values
  ('jefa37a@example.com', 'test'), ('jefa37b@example.com', 'test') on conflict do nothing;

insert into hidrantes.puntos (id, codigo, tipo, geom, diametro_mm, caudal, foto_path, municipio, direccion,
                              fecha_ultima_revision)
values
  ('00000000-0000-4000-8000-0000000e3701', 'HID-8771', 'hidrante', 'SRID=4326;POINT(-3.6569 37.2308)', 100, 'bueno',
   'fotos/p37-1.jpg', 'albolote', 'Calle Vieja 37', current_date - 30),
  ('00000000-0000-4000-8000-0000000e3702', 'HID-8772', 'hidrante', 'SRID=4326;POINT(-3.6400 37.2450)', 100, 'bueno',
   'fotos/p37-2.jpg', 'albolote', 'Calle Vieja 38', current_date - 30);

create function pg_temp.jefatura(correo text default 'jefa37a@example.com') returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'role', 'authenticated', 'email', correo, 'amr', jsonb_build_array(jsonb_build_object('method', 'oauth', 'timestamp', 1)),
    'app_metadata', jsonb_build_object('provider', 'google', 'providers', jsonb_build_array('google')))::text, true);
$$;
create function pg_temp.voluntario() returns void language sql as $$
  select set_config('request.jwt.claims', '', true);
$$;
-- Propuesta de un voluntario sin foto ("corregir datos").
create function pg_temp.datos(token text, clave text) returns jsonb language sql as $$
  select hidrantes.fn_proponer(token, clave, 'Ana', 'Ruiz', 'datos', '00000000-0000-4000-8000-0000000e3701',
    '{"descripcion":"x"}', null, null, null, null, null, null, null, null, null);
$$;
-- El mensaje y el detail de un error, unidos con '|'.
create function pg_temp.error_de(sentencia text) returns text language plpgsql as $$
declare
  m text;
  d text;
begin
  execute sentencia;
  return null;
exception when others then
  get stacked diagnostics m = message_text, d = pg_exception_detail;
  return m || '|' || coalesce(d, '');
end $$;

select pg_temp.voluntario();
select set_config('test.ta', (select token from hidrantes.fn_verificar_codigo('482917', 'a3700000-0000-4000-8000-0000000e3701', 'ip-37-a')), true);
select set_config('test.tb', (select token from hidrantes.fn_verificar_codigo('482917', 'b3700000-0000-4000-8000-0000000e3702', 'ip-37-b')), true);
select set_config('test.tc', (select token from hidrantes.fn_verificar_codigo('482917', 'c3700000-0000-4000-8000-0000000e3703', 'ip-37-c')), true);
select set_config('test.td', (select token from hidrantes.fn_verificar_codigo('482917', 'd3700000-0000-4000-8000-0000000e3704', 'ip-37-d')), true);
select set_config('test.te', (select token from hidrantes.fn_verificar_codigo('482917', 'e3700000-0000-4000-8000-0000000e3705', 'ip-37-e')), true);
select set_config('test.tf', (select token from hidrantes.fn_verificar_codigo('482917', 'f3700000-0000-4000-8000-0000000e3706', 'ip-37-f')), true);
-- Aquí no se prueba el tope global (sí más abajo): que no estorbe.
update hidrantes.config set valor = '1000' where clave = 'max_subidas_dia_total';

-- ---------- RV-220: config ----------

select is(hidrantes.fn_config('max_reservas_abiertas', 'null'), '6'::jsonb, 'max_reservas_abiertas = 6');
select is(hidrantes.fn_config('max_bytes_fotos', 'null'), '838860800'::jsonb, 'max_bytes_fotos = 800 MB');
select is(hidrantes.fn_config('max_bytes_bd', 'null'), '419430400'::jsonb, 'max_bytes_bd = 400 MB');

-- ---------- RV-220: reservas abiertas por dispositivo ----------

select lives_ok($$ select hidrantes.fn_reservar_subida(current_setting('test.ta')) from generate_series(1, 6) $$,
  'seis reservas abiertas a la vez entran');
select set_config('test.e7', pg_temp.error_de($$ select hidrantes.fn_reservar_subida(current_setting('test.ta')) $$), true);
select ok(current_setting('test.e7') ~ '^RESERVAS_ABIERTAS: maximo=6 reintentar_en_s=[0-9]+\|'
          and substring(current_setting('test.e7') from 'reintentar_en_s=([0-9]+)')::int between 1 and 7200,
  'la séptima: RESERVAS_ABIERTAS, con maximo=6 y la espera hasta que la más antigua cumpla 2 h (sobre develop: entraba)');
select is((split_part(current_setting('test.e7'), '|', 2)::jsonb ->> 'maximo')::int, 6, 'y el detail, lo mismo en JSON');
update hidrantes.subidas set confirmada_en = now()
 where foto_path = (select foto_path from hidrantes.subidas where dispositivo_id = 'a3700000-0000-4000-8000-0000000e3701'
                     order by foto_path limit 1);
select lives_ok($$ select hidrantes.fn_reservar_subida(current_setting('test.ta')) $$,
  'una reserva confirmada deja de estar abierta: entra otra');
update hidrantes.subidas set reservada_en = now() - interval '3 hours'
 where foto_path = (select foto_path from hidrantes.subidas where dispositivo_id = 'a3700000-0000-4000-8000-0000000e3701'
                       and confirmada_en is null order by foto_path limit 1);
select lives_ok($$ select hidrantes.fn_reservar_subida(current_setting('test.ta')) $$,
  'una sin confirmar de más de 2 h tampoco cuenta como abierta');

-- ---------- RV-220: el tope global cuenta confirmadas y abiertas ----------

select set_config('test.c0', hidrantes.fn_subidas_contadas()::text, true);
insert into hidrantes.subidas (dispositivo_id, foto_path, reservada_en)
select 'b3700000-0000-4000-8000-0000000e3702', 'fotos/b37-viejo-' || i || '.jpg', now() - interval '3 hours'
from generate_series(1, 10) i;
select is(hidrantes.fn_subidas_contadas(), current_setting('test.c0')::int,
  'diez reservas sin subir de hace 3 h no cuentan en el tope global');
insert into hidrantes.subidas (dispositivo_id, foto_path, reservada_en, confirmada_en) values
  ('b3700000-0000-4000-8000-0000000e3702', 'fotos/b37-conf-1.jpg', now() - interval '3 hours', now()),
  ('b3700000-0000-4000-8000-0000000e3702', 'fotos/b37-conf-2.jpg', now() - interval '20 hours', now() - interval '19 hours'),
  ('b3700000-0000-4000-8000-0000000e3702', 'fotos/b37-abierta.jpg', now(), null);
select is(hidrantes.fn_subidas_contadas(), current_setting('test.c0')::int + 3, 'las confirmadas y las abiertas, sí');
insert into hidrantes.subidas (dispositivo_id, foto_path)
select hidrantes.fn_dispositivo_admin('jefa37a@example.com'), 'fotos/j37-' || i || '.jpg' from generate_series(1, 3) i;
select is(hidrantes.fn_subidas_contadas(), current_setting('test.c0')::int + 3, 'las de jefatura no cuentan');

-- ---------- RV-220 y RV-262: revocar un móvil libera sus reservas ----------

insert into hidrantes.subidas (dispositivo_id, foto_path)
select 'c3700000-0000-4000-8000-0000000e3703', 'fotos/c37-' || i || '.jpg' from generate_series(1, 3) i;
select set_config('test.c1', hidrantes.fn_subidas_contadas()::text, true);
select pg_temp.jefatura();
select is(hidrantes.fn_revocar_dispositivo('C3700000'), 1, 'fn_revocar_dispositivo revoca el token del móvil con esos 8 caracteres');
select pg_temp.voluntario();
select is(hidrantes.fn_subidas_contadas(), current_setting('test.c1')::int - 3,
  'y sus tres reservas abiertas dejan de contar en el tope global');
select throws_like($$ select hidrantes.fn_listar_puntos(current_setting('test.tc')) $$, 'TOKEN_REVOCADO%',
  'su token ya no vale');
select is((select despues ->> 'dispositivo' from hidrantes.registro where accion = 'dispositivos_revocados'
            order by id desc limit 1), 'c3700000', 'queda en el registro, con 8 caracteres del id');

insert into hidrantes.dispositivos (dispositivo_id, token_hash) values
  ('abcd3700-0000-4000-8000-000000000001', hidrantes.fn_sha256('token-37-ambiguo-uno-xxxxxxxxxx')),
  ('abcd3700-0000-4000-8000-000000000002', hidrantes.fn_sha256('token-37-ambiguo-dos-xxxxxxxxxx'));
select pg_temp.jefatura();
select throws_like($$ select hidrantes.fn_revocar_dispositivo('abcd3700') $$, 'PAYLOAD_INVALIDO(dispositivo)%',
  'dos móviles que empiezan igual: PAYLOAD_INVALIDO(dispositivo), no revoca ninguno');
select is(hidrantes.fn_revocar_dispositivo('abcd3700-0000-4000-8000-000000000001'), 1, 'con más caracteres, solo ese');
select is((select count(*)::int from hidrantes.dispositivos where dispositivo_id = 'abcd3700-0000-4000-8000-000000000002'
            and revocado_en is null), 1, 'y el otro sigue');
select throws_like($$ select hidrantes.fn_revocar_dispositivo('0f0f0f0f') $$, 'DISPOSITIVO_NO_ENCONTRADO%',
  'un id que no es de nadie: DISPOSITIVO_NO_ENCONTRADO');
select throws_like($$ select hidrantes.fn_revocar_dispositivo('abcd') $$, 'PAYLOAD_INVALIDO(dispositivo)%',
  'menos de 8 caracteres: PAYLOAD_INVALIDO(dispositivo)');
select throws_like($$ select hidrantes.fn_revocar_dispositivo('abcd37%_') $$, 'PAYLOAD_INVALIDO(dispositivo)%',
  'comodines: PAYLOAD_INVALIDO(dispositivo)');
select pg_temp.voluntario();

-- ---------- RV-220: tope global lleno, y reservar sin subir no bloquea al grupo ----------

update hidrantes.config set valor = to_jsonb(hidrantes.fn_subidas_contadas()) where clave = 'max_subidas_dia_total';
select throws_like($$ select hidrantes.fn_reservar_subida(current_setting('test.td')) $$, 'CUOTA_SUBIDAS_AGOTADA%',
  'con el tope global lleno de confirmadas y abiertas: CUOTA_SUBIDAS_AGOTADA');
update hidrantes.config set valor = to_jsonb(hidrantes.fn_subidas_contadas() + 1) where clave = 'max_subidas_dia_total';
insert into hidrantes.subidas (dispositivo_id, foto_path, reservada_en)
select 'b3700000-0000-4000-8000-0000000e3702', 'fotos/b37-sin-subir-' || i || '.jpg', now() - interval '3 hours'
from generate_series(1, 200) i;
select lives_ok($$ select hidrantes.fn_reservar_subida(current_setting('test.td')) $$,
  'doscientas reservas sin subir de hace 3 h no bloquean al grupo (sobre develop: CUOTA_SUBIDAS_AGOTADA)');
update hidrantes.config set valor = '1000' where clave = 'max_subidas_dia_total';

-- ---------- RV-220: espacio ----------

select set_config('test.esp', hidrantes.fn_espacio()::text, true);
select is(current_setting('test.esp')::jsonb ->> 'fotos_origen', 'storage',
  'fn_espacio lee el bucket en storage.objects (la política de arranque-bd.sql)');
insert into storage.objects (bucket_id, name, metadata)
values ('hidrantes-fotos-dev', 'fotos/t37-objeto.jpg', '{"size": 123456}');
select is((hidrantes.fn_espacio() ->> 'fotos_bytes')::bigint, (current_setting('test.esp')::jsonb ->> 'fotos_bytes')::bigint + 123456,
  'y suma el tamaño de cada archivo');
select set_config('test.foto_d', hidrantes.fn_reservar_subida(current_setting('test.td')), true);
select set_config('test.ab', hidrantes.fn_espacio() ->> 'reservas_abiertas', true);
insert into storage.objects (bucket_id, name, metadata)
values ('hidrantes-fotos-dev', current_setting('test.foto_d'), '{"size": 1000}');
select is((hidrantes.fn_espacio() ->> 'reservas_abiertas')::int, current_setting('test.ab')::int - 1,
  'una reserva abierta con su archivo ya subido no suma otra vez 5 MB');

update hidrantes.config
   set valor = to_jsonb((hidrantes.fn_espacio() ->> 'fotos_bytes')::bigint
                        + ((hidrantes.fn_espacio() ->> 'reservas_abiertas')::bigint + 1) * 5242880 - 1)
 where clave = 'max_bytes_fotos';
select throws_like($$ select hidrantes.fn_reservar_subida(current_setting('test.td')) $$, 'SIN_ESPACIO_FOTOS%',
  'sin sitio para 5 MB más: SIN_ESPACIO_FOTOS (sobre develop: entraba)');
select pg_temp.jefatura();
select throws_like($$ select hidrantes.fn_reservar_subida_admin() $$, 'SIN_ESPACIO_FOTOS%',
  'también para jefatura: es espacio físico');
select pg_temp.voluntario();
update hidrantes.config
   set valor = to_jsonb((hidrantes.fn_espacio() ->> 'fotos_bytes')::bigint
                        + ((hidrantes.fn_espacio() ->> 'reservas_abiertas')::bigint + 1) * 5242880)
 where clave = 'max_bytes_fotos';
select lives_ok($$ select hidrantes.fn_reservar_subida(current_setting('test.td')) $$, 'con sitio justo para una, entra');
update hidrantes.config set valor = '838860800' where clave = 'max_bytes_fotos';

-- ---------- RV-220: purga diaria de filas de reservas ----------

insert into hidrantes.subidas (dispositivo_id, foto_path, reservada_en, confirmada_en) values
  ('b3700000-0000-4000-8000-0000000e3702', 'fotos/p37-49h-sin.jpg', now() - interval '49 hours', null),
  ('b3700000-0000-4000-8000-0000000e3702', 'fotos/p37-49h-con.jpg', now() - interval '49 hours', null),
  ('b3700000-0000-4000-8000-0000000e3702', 'fotos/p37-47h.jpg', now() - interval '47 hours', null),
  ('b3700000-0000-4000-8000-0000000e3702', 'fotos/p37-49h-conf.jpg', now() - interval '49 hours', now() - interval '48 hours'),
  ('b3700000-0000-4000-8000-0000000e3702', 'fotos/p37-31d.jpg', now() - interval '31 days', now() - interval '31 days');
insert into storage.objects (bucket_id, name, metadata)
values ('hidrantes-fotos-dev', 'fotos/p37-49h-con.jpg', '{"size": 2000}');
select ok(hidrantes.fn_purgar_subidas() >= 2, 'fn_purgar_subidas borra filas');
select is((select array_agg(foto_path order by foto_path) from hidrantes.subidas where foto_path like 'fotos/p37-%'),
  array['fotos/p37-47h.jpg', 'fotos/p37-49h-con.jpg', 'fotos/p37-49h-conf.jpg'],
  'se lleva la nunca confirmada de más de 48 h sin archivo y la de 31 días; deja la que aún tiene archivo, la de 47 h y la confirmada');

-- ---------- RV-220, RV-223: Salud ----------

select pg_temp.jefatura();
select set_config('test.salud', hidrantes.fn_salud()::text, true);
select pg_temp.voluntario();
select is(current_setting('test.salud')::jsonb -> 'incidencias_abiertas', '0'::jsonb,
  'fn_salud vuelve a traer incidencias_abiertas: 0 para el panel de 0.7.0 (RV-223)');
select ok(current_setting('test.salud')::jsonb ?& array['fotos_bytes', 'fotos_origen', 'reservas_abiertas', 'max_bytes_fotos',
            'fotos_pct', 'max_bytes_bd', 'bd_pct', 'bd_bytes', 'propuestas_hoy', 'max_propuestas_dia_total',
            'reservas_dispositivos_24h', 'subidas_24h'],
  'y el espacio de fotos y de la base de datos, las propuestas de hoy y los móviles con más reservas');
select is(current_setting('test.salud')::jsonb -> 'reservas_dispositivos_24h' -> 0 ->> 'dispositivo', 'b3700000',
  'el móvil con más reservas en 24 h sale el primero, con 8 caracteres de su id');
select ok(jsonb_array_length(current_setting('test.salud')::jsonb -> 'reservas_dispositivos_24h') between 1 and 5
          and not exists (select 1 from jsonb_array_elements(current_setting('test.salud')::jsonb -> 'reservas_dispositivos_24h') x
                           where length(x ->> 'dispositivo') <> 8),
  'como mucho 5, todos con 8 caracteres');
select is(current_setting('test.salud')::jsonb -> 'reservas_dispositivos_24h' -> 0 -> 'reservas',
  to_jsonb((select count(*)::int from hidrantes.subidas where dispositivo_id = 'b3700000-0000-4000-8000-0000000e3702'
             and reservada_en > now() - interval '1 day')),
  'con sus reservas de 24 h');
select is((current_setting('test.salud')::jsonb ->> 'subidas_24h')::int, hidrantes.fn_subidas_contadas(),
  'subidas_24h cuenta como el tope global nuevo');

set local role service_role;
select lives_ok($$ select hidrantes.fn_espacio() $$, 'service_role ejecuta fn_espacio (vigilancia)');
reset role;
set local role anon;
select throws_ok($$ select hidrantes.fn_espacio() $$, '42501', null, 'anon no ejecuta fn_espacio');
select throws_ok($$ select hidrantes.fn_suscripcion_push_admin('x') $$, '42501', null, 'ni fn_suscripcion_push_admin');
select throws_ok($$ select hidrantes.fn_pedidos_recientes() $$, '42501', null, 'ni fn_pedidos_recientes');
select throws_ok($$ select hidrantes.fn_revocar_dispositivo('abcd3700') $$, '42501', null, 'ni fn_revocar_dispositivo');
reset role;
set local role authenticated;
select throws_ok($$ select hidrantes.fn_espacio() $$, '42501', null, 'authenticated no ejecuta fn_espacio');
reset role;

-- ---------- RV-221: token nuevo ----------

insert into hidrantes.propuestas (punto_id, operacion, datos, autor_nombre, autor_apellido, dispositivo_id, clave_local)
select '00000000-0000-4000-8000-0000000e3701', 'datos', '{"descripcion":"x"}', 'Eva', 'Sol',
       'e3700000-0000-4000-8000-0000000e3705', 'n37-' || i
from generate_series(1, 10) i;
select set_config('test.en', pg_temp.error_de($$ select pg_temp.datos(current_setting('test.te'), 'n37-la-11') $$), true);
select ok(current_setting('test.en') ~ '^CUOTA_PROPUESTAS_AGOTADA: maximo=10 reintentar_en_s=[0-9]+ ambito=token_nuevo\|'
          and split_part(current_setting('test.en'), '|', 2)::jsonb ->> 'ambito' = 'token_nuevo',
  'un token de menos de 24 h: la 11.ª del día, CUOTA_PROPUESTAS_AGOTADA con maximo=10 y ambito=token_nuevo (sobre develop: entraba)');
select ok(substring(current_setting('test.en') from 'reintentar_en_s=([0-9]+)')::int between 1 and 86400,
  'y espera como mucho a que el token cumpla 24 h');
update hidrantes.dispositivos set emitido_en = now() - interval '25 hours'
 where dispositivo_id = 'e3700000-0000-4000-8000-0000000e3705';
select lives_ok($$ select pg_temp.datos(current_setting('test.te'), 'n37-la-11') $$,
  'pasadas las 24 h del token, el tope vuelve a ser el de siempre');

-- ---------- RV-221: tope global de propuestas ----------

select set_config('test.ph', hidrantes.fn_propuestas_hoy()::text, true);
insert into hidrantes.propuestas (punto_id, operacion, datos, autor_nombre, autor_apellido, dispositivo_id, clave_local)
select '00000000-0000-4000-8000-0000000e3701', 'datos', '{"descripcion":"x"}', 'Jefatura', 'jefa37a@example.com',
       hidrantes.fn_dispositivo_admin('jefa37a@example.com'), 'j37-' || i
from generate_series(1, 5) i;
select is(hidrantes.fn_propuestas_hoy(), current_setting('test.ph')::int, 'las de jefatura no cuentan en el tope global');
update hidrantes.config set valor = to_jsonb(hidrantes.fn_propuestas_hoy()) where clave = 'max_propuestas_dia_total';
select set_config('test.eg', pg_temp.error_de($$ select pg_temp.datos(current_setting('test.te'), 'n37-grupo') $$), true);
select ok(current_setting('test.eg') ~ ('^CUOTA_PROPUESTAS_AGOTADA: maximo=' || hidrantes.fn_propuestas_hoy()
                                        || ' reintentar_en_s=[0-9]+ ambito=grupo\|'),
  'con el tope global lleno: CUOTA_PROPUESTAS_AGOTADA con ambito=grupo (sobre develop: entraba)');
select pg_temp.jefatura();
select is(hidrantes.fn_proponer(null, 'n37-jefa-global', 'x', 'y', 'datos', '00000000-0000-4000-8000-0000000e3701',
    '{"descripcion":"jefa"}', null, null, null, null, null, null, null, null, null) ->> 'aplicada',
  'true', 'jefatura no tiene tope global');
select pg_temp.voluntario();
update hidrantes.config set valor = '600' where clave = 'max_propuestas_dia_total';

-- ---------- RV-221: espacio de la base de datos ----------

update hidrantes.config set valor = '1' where clave = 'max_bytes_bd';
select throws_like($$ select pg_temp.datos(current_setting('test.te'), 'n37-sin-espacio') $$, 'SIN_ESPACIO: %',
  'con la base de datos por encima de max_bytes_bd: SIN_ESPACIO (sobre develop: entraba)');
update hidrantes.config set valor = '419430400' where clave = 'max_bytes_bd';
select lives_ok($$ select pg_temp.datos(current_setting('test.te'), 'n37-sin-espacio') $$, 'y por debajo, entra');

-- ---------- RV-222: errores de la app anterior ----------

insert into hidrantes.errores_cliente (dispositivo_id, mensaje)
select 'a3700000-0000-4000-8000-00000000e222', 'e' from generate_series(1, 10);
set local role anon;
select hidrantes.fn_registrar_error('a3700000-0000-4000-8000-00000000e222', 'el 11.º', null, '/', 'x');
select hidrantes.fn_registrar_error('b3700000-0000-4000-8000-00000000e222', 'otro móvil', null, '/', 'x');
reset role;
select is((select count(*)::int from hidrantes.errores_cliente where dispositivo_id = 'a3700000-0000-4000-8000-00000000e222'), 10,
  'por la firma anterior, como mucho 10 al día por dispositivo (sobre develop: 100)');
select is((select app_anterior from hidrantes.errores_cliente where dispositivo_id = 'b3700000-0000-4000-8000-00000000e222'), true,
  'otro móvil sí entra, marcado como de la app anterior');
insert into hidrantes.errores_cliente (mensaje, app_anterior) select 'v', true from generate_series(1, 200);
set local role anon;
select hidrantes.fn_registrar_error('c3700000-0000-4000-8000-00000000e222', 'por encima de 200', null, '/', 'x');
reset role;
select is((select count(*)::int from hidrantes.errores_cliente where dispositivo_id = 'c3700000-0000-4000-8000-00000000e222'), 0,
  'con 200 de la app anterior hoy, no entra ninguno más por ella');
update hidrantes.config
   set valor = to_jsonb((select count(*)::int + 1 from hidrantes.errores_cliente
                          where momento > now() - interval '1 day' and not app_anterior))
 where clave = 'max_errores_global_dia';
set local role service_role;
select hidrantes.fn_registrar_error(null, 'nueva', null, '/', 'x', 'ip-37-err');
reset role;
select is((select count(*)::int from hidrantes.errores_cliente where ip_hash = 'ip-37-err'), 1,
  'y /api/error sigue entrando: las de la app anterior no gastan su techo global (sobre develop: no entraba)');

-- ---------- RV-223: fn_reportar_incidencia como sumidero ----------

select set_config('test.inc', (select count(*)::text from hidrantes.incidencias_app), true);
set local role anon;
select ok(hidrantes.fn_reportar_incidencia('token-de-la-app-070-que-no-existe', 'algo falla', '0.7.0', '/mapa') is not null,
  'anon llama a fn_reportar_incidencia y recibe un id, como espera la app 0.7.0 (sobre develop: 42501)');
reset role;
select is((select count(*)::text from hidrantes.incidencias_app), current_setting('test.inc'), 'y no se guarda nada');

-- ---------- RV-225: avisos de jefatura por administrador ----------

select pg_temp.jefatura('jefa37a@example.com');
select hidrantes.fn_guardar_suscripcion_push_admin(
  '{"endpoint":"https://fcm.googleapis.com/fcm/send/c37","keys":{"p256dh":"p","auth":"a"}}', '{nuevas_propuestas}');
select is(hidrantes.fn_suscripcion_push_admin('https://fcm.googleapis.com/fcm/send/c37'),
  '{"suscrita": true, "temas": ["nuevas_propuestas"]}'::jsonb, 'fn_suscripcion_push_admin: los temas de quien llama');
select pg_temp.jefatura('jefa37b@example.com');
select hidrantes.fn_guardar_suscripcion_push_admin(
  '{"endpoint":"https://fcm.googleapis.com/fcm/send/c37","keys":{"p256dh":"p","auth":"a"}}', '{nuevas_propuestas,resumen_semanal}');
select pg_temp.jefatura('jefa37a@example.com');
select is(hidrantes.fn_suscripcion_push_admin('https://fcm.googleapis.com/fcm/send/c37') -> 'suscrita', 'false'::jsonb,
  'otro administrador activó los avisos en el mismo navegador: para el primero, ya no está suscrito');
select hidrantes.fn_borrar_suscripcion_push_admin('https://fcm.googleapis.com/fcm/send/c37');
select is((select count(*)::int from hidrantes.suscripciones_push
            where email = 'jefa37b@example.com' and suscripcion ->> 'endpoint' = 'https://fcm.googleapis.com/fcm/send/c37'), 1,
  'y al apagar los suyos no borra los del otro (sobre develop: los borraba)');
select pg_temp.jefatura('jefa37b@example.com');
select is(hidrantes.fn_suscripcion_push_admin('https://fcm.googleapis.com/fcm/send/c37'),
  '{"suscrita": true, "temas": ["nuevas_propuestas", "resumen_semanal"]}'::jsonb, 'el segundo ve los suyos');
select hidrantes.fn_borrar_suscripcion_push_admin('https://fcm.googleapis.com/fcm/send/c37');
select is((select count(*)::int from hidrantes.suscripciones_push
            where suscripcion ->> 'endpoint' = 'https://fcm.googleapis.com/fcm/send/c37'), 0, 'y él sí borra su fila');
select throws_like($$ select hidrantes.fn_suscripcion_push_admin('  ') $$, 'PAYLOAD_INVALIDO(endpoint)%',
  'sin endpoint: PAYLOAD_INVALIDO(endpoint)');
select pg_temp.voluntario();

-- ---------- RV-226: cerrar sesión ----------

insert into hidrantes.suscripciones_push (dispositivo_id, email, suscripcion, temas) values
  ('f3700000-0000-4000-8000-0000000e3706', null,
   '{"endpoint":"https://fcm.googleapis.com/fcm/send/s37","keys":{"p256dh":"p","auth":"a"}}', '{resultado_propuesta}'),
  (null, 'jefa37a@example.com',
   '{"endpoint":"https://fcm.googleapis.com/fcm/send/s37","keys":{"p256dh":"p","auth":"a"}}', '{nuevas_propuestas}');
select hidrantes.fn_reservar_subida(current_setting('test.tf'));
select set_config('test.c2', hidrantes.fn_subidas_contadas()::text, true);
set local role anon;
select hidrantes.fn_cerrar_sesion(current_setting('test.tf'));
reset role;
select is((select count(*)::int from hidrantes.suscripciones_push
            where suscripcion ->> 'endpoint' = 'https://fcm.googleapis.com/fcm/send/s37' and dispositivo_id is not null), 0,
  'cerrar sesión borra la suscripción de voluntario de ese navegador');
select is((select count(*)::int from hidrantes.suscripciones_push
            where suscripcion ->> 'endpoint' = 'https://fcm.googleapis.com/fcm/send/s37' and dispositivo_id is null), 1,
  'y no la de jefatura del mismo navegador');
select is(hidrantes.fn_subidas_contadas(), current_setting('test.c2')::int - 1,
  'y su reserva abierta deja de contar en el tope global');

-- ---------- RV-260: pedidos recientes ----------

insert into hidrantes.pedidos_trabajo (workflow, pedido_por, pedido_en, lanzado_en, resultado) values
  ('respaldo', 'jefa37a@example.com', now() - interval '6 hours', now() - interval '6 hours', 'lanzado'),
  ('purgar-fotos', 'jefa37a@example.com', now() - interval '5 hours', now() - interval '5 hours', 'error: GitHub 422'),
  ('regenerar-zona', 'jefa37a@example.com', now() - interval '4 hours', null, null),
  ('respaldo', 'jefa37a@example.com', now() - interval '3 hours', now() - interval '3 hours', 'lanzado'),
  ('respaldo', 'jefa37a@example.com', now() - interval '2 hours', now() - interval '2 hours', 'lanzado'),
  ('respaldo', 'jefa37a@example.com', now() - interval '1 hour', now() - interval '1 hour', 'lanzado');
select pg_temp.jefatura();
select set_config('test.pr', hidrantes.fn_pedidos_recientes()::text, true);
select is(jsonb_array_length(current_setting('test.pr')::jsonb), 5, 'fn_pedidos_recientes: los 5 últimos');
select is(current_setting('test.pr')::jsonb -> 3 ->> 'estado', 'pedido', 'uno sin despachar sale como pedido');
select is((current_setting('test.pr')::jsonb -> 4) - 'id' - 'pedido_en' - 'lanzado_en',
  '{"workflow": "purgar-fotos", "estado": "error", "resultado": "error: GitHub 422"}'::jsonb,
  'del más nuevo al más antiguo, y un error con su texto');
select ok(not (current_setting('test.pr')::jsonb -> 0 ? 'pedido_por'), 'sin el correo de quien lo pidió');
select is(jsonb_array_length(hidrantes.fn_pedidos_recientes(2)), 2, 'con limite, los que se pidan');
select pg_temp.voluntario();

-- ---------- RV-253: fusionar con la dirección editada ----------

insert into hidrantes.propuestas (id, operacion, datos, autor_nombre, autor_apellido, dispositivo_id, clave_local,
                                  foto_path, geom, origen_ubicacion, direccion_sugerida)
select ('00000000-0000-4000-8000-0000000e37f' || i)::uuid, 'alta', '{"tipo":"hidrante","diametro_mm":100,"caudal":"bueno"}',
       'Ana', 'Ruiz', 'b3700000-0000-4000-8000-0000000e3702', 'f37-' || i, 'fotos/f37-' || i || '.jpg',
       'SRID=4326;POINT(-3.6401 37.2451)', 'gps', 'Calle Sugerida ' || i
from generate_series(1, 4) i;
select pg_temp.jefatura();
select hidrantes.fn_fusionar_con_existente('00000000-0000-4000-8000-0000000e37f1', '00000000-0000-4000-8000-0000000e3702',
  '{"direccion": "  Calle Editada 3 "}');
select is((select direccion from hidrantes.puntos where id = '00000000-0000-4000-8000-0000000e3702'), 'Calle Editada 3',
  'fusionar con prevalece.direccion: el punto queda con la dirección editada (sobre develop: PAYLOAD_INVALIDO)');
select hidrantes.fn_fusionar_con_existente('00000000-0000-4000-8000-0000000e37f2', '00000000-0000-4000-8000-0000000e3702',
  '{"direccion": null, "ubicacion": "propuesta"}');
select is((select direccion from hidrantes.puntos where id = '00000000-0000-4000-8000-0000000e3702'), null,
  'con null, sin dirección, aunque la ubicación de la propuesta traiga una sugerida');
select throws_like($$ select hidrantes.fn_fusionar_con_existente('00000000-0000-4000-8000-0000000e37f3',
    '00000000-0000-4000-8000-0000000e3702', jsonb_build_object('direccion', repeat('d', 201))) $$,
  'PAYLOAD_INVALIDO(direccion)%', 'una dirección de 201 caracteres: PAYLOAD_INVALIDO(direccion)');
select throws_like($$ select hidrantes.fn_fusionar_con_existente('00000000-0000-4000-8000-0000000e37f3',
    '00000000-0000-4000-8000-0000000e3702', '{"direccion": 12}') $$,
  'PAYLOAD_INVALIDO(direccion)%', 'una dirección que no es texto: PAYLOAD_INVALIDO(direccion)');
select hidrantes.fn_fusionar_con_existente('00000000-0000-4000-8000-0000000e37f3', '00000000-0000-4000-8000-0000000e3702',
  '{"ubicacion": "propuesta"}');
select is((select direccion from hidrantes.puntos where id = '00000000-0000-4000-8000-0000000e3702'), 'Calle Sugerida 3',
  'sin la clave, como antes: la sugerida de la ubicación de la propuesta');
select pg_temp.voluntario();

-- ---------- Ajustes: la lista blanca con las claves nuevas ----------

select pg_temp.jefatura();
select lives_ok($$ select hidrantes.fn_guardar_config('{"max_reservas_abiertas": 8, "max_bytes_fotos": 734003200,
    "max_bytes_bd": 314572800, "max_propuestas_token_nuevo": 12, "max_propuestas_dia_total": 700}') $$,
  'Ajustes guarda las claves nuevas de 0041');
select is(hidrantes.fn_config('max_bytes_fotos', 'null'), '734003200'::jsonb, 'y quedan en config');
select throws_like($$ select hidrantes.fn_guardar_config('{"max_bytes_fotos": 2147483648}') $$,
  'CONFIG_INVALIDA(max_bytes_fotos)%', 'max_bytes_fotos por encima de 1 GB: rechazado');
select throws_like($$ select hidrantes.fn_guardar_config('{"max_reservas_abiertas": 0}') $$,
  'CONFIG_INVALIDA(max_reservas_abiertas)%', 'max_reservas_abiertas a 0: rechazado');
select throws_like($$ select hidrantes.fn_guardar_config('{"max_altas_ip_dia": 100}') $$,
  'CONFIG_INVALIDA(max_altas_ip_dia)%', 'max_altas_ip_dia no se cambia desde Ajustes');
select pg_temp.voluntario();

-- ---------- RV-221: canjes (al final: llenan los topes del código) ----------

insert into hidrantes.intentos_codigo (dispositivo_id, ip_hash, exito, momento)
select gen_random_uuid(), 'ip-37-altas', true, now() - interval '3 hours' from generate_series(1, 19);
select ok((select token from hidrantes.fn_verificar_codigo('482917', gen_random_uuid(), 'ip-37-altas')) is not null,
  'con 19 canjes buenos desde una IP en 24 h, el 20.º entra');
select is((select error from hidrantes.fn_verificar_codigo('482917', gen_random_uuid(), 'ip-37-altas')), 'DEMASIADOS_INTENTOS',
  'el 21.º no (sobre develop: hasta 150)');
insert into hidrantes.intentos_codigo (dispositivo_id, ip_hash, exito, momento)
select gen_random_uuid(), 'ip-37-hora-' || i, true, now() - interval '10 minutes'
from generate_series(1, 40 - (select count(*)::int from hidrantes.intentos_codigo
                               where exito and momento > now() - interval '1 hour')) i;
select is((select error from hidrantes.fn_verificar_codigo('482917', gen_random_uuid(), 'ip-37-nueva')), 'DEMASIADOS_INTENTOS',
  'con 40 canjes buenos en la última hora, uno más desde otra IP tampoco (sobre develop: hasta 150)');

select * from finish();
rollback;
