-- docs/36 (0048; DEC-206, DEC-207, DEC-208):
--   RV-450: la jefatura solo vale con un JWT emitido después de la unión, y fn_desvincular_administrador
--           (solo service_role) deshace la unión y lo anota.
--   RV-451: un intento ya frenado no hace bcrypt, y un fallo del aviso técnico no impide entrar.
--   RV-452: fn_editar_punto con la versión que abrió el panel no pisa el cambio de otro.
-- Todo dentro de una transacción que se deshace.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;

select plan(46);

-- Solo las filas de esta prueba cuentan como administradores activos.
update hidrantes.administradores set activo = false;
insert into hidrantes.administradores (email, creado_por) values ('union36@example.com', 'test');

-- Una sesión de Google de jefatura, con el iat que se le pase (null: sin iat).
create function pg_temp.sesion(sub uuid, correo text, iat jsonb) returns void language sql as $$
  select set_config('request.jwt.claims', (jsonb_build_object(
    'role', 'authenticated', 'sub', sub, 'email', correo,
    'amr', jsonb_build_array(jsonb_build_object('method', 'oauth', 'timestamp', 1)),
    'app_metadata', jsonb_build_object('provider', 'google', 'providers', jsonb_build_array('google')))
    || case when iat is null then '{}'::jsonb else jsonb_build_object('iat', iat) end)::text, true);
$$;
-- ¿Es jefatura con ese iat? Con el rol de quien llama desde el panel.
create function pg_temp.es_admin(iat jsonb) returns boolean language plpgsql as $$
declare
  r boolean;
begin
  perform pg_temp.sesion('aaaaaaaa-0000-4000-8000-000000036450', 'union36@example.com', iat);
  set local role authenticated;
  r := hidrantes.fn_es_admin();
  reset role;
  return r;
end $$;
create function pg_temp.ahora_s(desfase integer) returns jsonb language sql as $$
  select to_jsonb(floor(extract(epoch from now()))::bigint + desfase);
$$;

-- =====================================================================================
-- RV-450
-- =====================================================================================

select ok(not has_function_privilege('anon', 'hidrantes.fn_desvincular_administrador(text)', 'execute'),
  'anon no ejecuta fn_desvincular_administrador');
select ok(not has_function_privilege('authenticated', 'hidrantes.fn_desvincular_administrador(text)', 'execute'),
  'authenticated no ejecuta fn_desvincular_administrador');
select ok(has_function_privilege('service_role', 'hidrantes.fn_desvincular_administrador(text)', 'execute'),
  'service_role ejecuta fn_desvincular_administrador');

set local role service_role;
select is(hidrantes.fn_vincular_administrador('aaaaaaaa-0000-4000-8000-000000036450', 'union36@example.com'),
  'VINCULADO', 'la fila se une (vinculado_en = ahora)');
reset role;

select is(pg_temp.es_admin(pg_temp.ahora_s(-3600)), false, 'un JWT emitido antes de la unión no es jefatura');
select is(pg_temp.es_admin(pg_temp.ahora_s(-1)), false, 'tampoco uno de un segundo antes');
select is(pg_temp.es_admin(pg_temp.ahora_s(0)), true, 'uno emitido en el mismo segundo de la unión, sí');
select is(pg_temp.es_admin(pg_temp.ahora_s(120)), true, 'uno emitido después de la unión, sí');
select is(pg_temp.es_admin('"9999999999"'::jsonb), false, 'un iat que no es un número no es jefatura');
select is(pg_temp.es_admin('null'::jsonb), false, 'un iat nulo no es jefatura');
select is(pg_temp.es_admin('1e300'::jsonb), false, 'un iat desmesurado no es jefatura, y no rompe la consulta');
select is(pg_temp.es_admin(null), true,
  'sin iat (claims montados a mano con acceso directo a la base de datos) no se compara');

-- fn_desvincular_administrador
set local role service_role;
select is(hidrantes.fn_desvincular_administrador(' Union36@Example.com '), true, 'una fila unida se desune: true');
select is(hidrantes.fn_desvincular_administrador('union36@example.com'), false, 'otra vez: ya no lo está, false');
select is(hidrantes.fn_desvincular_administrador('nadie36@example.com'), false, 'un correo que no está: false');
select throws_like($$ select hidrantes.fn_desvincular_administrador(' ') $$, 'PAYLOAD_INVALIDO%',
  'sin correo: PAYLOAD_INVALIDO');
reset role;
select ok((select usuario_id is null and vinculado_en is null and activo
             from hidrantes.administradores where email = 'union36@example.com'),
  'la fila sigue activa, sin usuario_id ni vinculado_en');
select is((select count(*)::int from hidrantes.registro
            where accion = 'administrador_desvinculado' and actor = 'union36@example.com'
              and despues = '{"email": "union36@example.com"}'::jsonb and punto_id is null),
  1, 'una sola entrada administrador_desvinculado en el Registro, sin ids');
select is(pg_temp.es_admin(pg_temp.ahora_s(120)), false, 'desunida, ni con un JWT nuevo es jefatura');

-- =====================================================================================
-- RV-451
-- =====================================================================================

-- Los topes de fallos, con sus valores de siempre, y un código con bcrypt caro: así se nota si se hace.
insert into hidrantes.config (clave, valor, actualizado_por) values
  ('max_intentos_dispositivo', '10', 'test'), ('max_intentos_ip', '30', 'test'), ('max_intentos_global', '60', 'test'),
  ('codigo_acceso_hash', to_jsonb(extensions.crypt('482917', extensions.gen_salt('bf', 12))), 'test')
on conflict (clave) do update set valor = excluded.valor;

-- Lo que contesta fn_verificar_codigo y cuánto tarda, en milisegundos.
create function pg_temp.medir(codigo text, d uuid, ip text) returns table (resultado text, ms numeric)
language plpgsql as $$
declare
  t0 timestamptz := clock_timestamp();
  r text;
begin
  select coalesce(v.token, v.error) into r from hidrantes.fn_verificar_codigo(codigo, d, ip) v;
  return query select r, extract(epoch from clock_timestamp() - t0) * 1000;
end $$;

-- Un móvil con 10 fallos en la última hora, otro limpio.
insert into hidrantes.intentos_codigo (dispositivo_id, ip_hash, exito)
select 'f3600000-0000-4000-8000-000000036451', 'ip36-movil-' || i, false from generate_series(1, 10) i;
create temp table libre as select * from pg_temp.medir('111111', 'f3600000-0000-4000-8000-000000036452', 'ip36-libre');
create temp table frenado as select * from pg_temp.medir('111111', 'f3600000-0000-4000-8000-000000036451', 'ip36-frenado');

select is((select resultado from libre), 'CODIGO_INCORRECTO', 'un móvil limpio con un código malo: CODIGO_INCORRECTO');
select cmp_ok((select ms from libre), '>', 50::numeric, 'y tarda lo que tarda el bcrypt (más de 50 ms)');
select is((select resultado from frenado), 'DEMASIADOS_INTENTOS', 'un móvil por encima de su tope: DEMASIADOS_INTENTOS');
select cmp_ok((select ms from frenado), '<', 50::numeric, 'sin bcrypt: menos de 50 ms');
select is((select count(*)::int from hidrantes.intentos_codigo
            where ip_hash = 'ip36-frenado' and bloqueado and tope = 'dispositivo' and not exito),
  1, 'el frenado se anota como siempre, sin contar como fallo');
select pg_temp.medir('111111', 'f3600000-0000-4000-8000-000000036451', 'ip36-frenado') from generate_series(1, 5);
select is((select count(*)::int from hidrantes.intentos_codigo where ip_hash = 'ip36-frenado'),
  1, 'seis frenados seguidos: una sola fila en el minuto');

-- Una IP por encima de su tope, con un móvil nuevo cada vez.
insert into hidrantes.intentos_codigo (dispositivo_id, ip_hash, exito)
select gen_random_uuid(), 'ip36-ip', false from generate_series(1, 30);
create temp table frenado_ip as select * from pg_temp.medir('482917', gen_random_uuid(), 'ip36-ip');
select is((select resultado from frenado_ip), 'DEMASIADOS_INTENTOS', 'una IP por encima de su tope, aun con el código bueno');
select cmp_ok((select ms from frenado_ip), '<', 50::numeric, 'también sin bcrypt');

-- La lectura previa va por los índices (con un recorrido secuencial prohibido, para que la tabla
-- pequeña de la prueba no lo esconda). Son las mismas consultas que las de fn_verificar_codigo.
create function pg_temp.plan(q text) returns text language plpgsql as $$
declare
  linea text;
  todo text := '';
begin
  for linea in execute 'explain ' || q loop
    todo := todo || linea || E'\n';
  end loop;
  return todo;
end $$;
set local enable_seqscan = off;
select ok(pg_temp.plan($q$
  select count(*) filter (where i.momento > now() - interval '1 hour'), count(*)
    from hidrantes.intentos_codigo i
   where i.dispositivo_id = 'f3600000-0000-4000-8000-000000036451'
     and i.momento > now() - interval '24 hours' and not i.exito and not i.bloqueado $q$) ~ 'intentos_dispositivo_idx',
  'la lectura previa del móvil usa intentos_dispositivo_idx');
select ok(pg_temp.plan($q$
  select count(*) filter (where i.momento > now() - interval '1 hour'), count(*)
    from hidrantes.intentos_codigo i
   where i.ip_hash = 'ip36-ip'
     and i.momento > now() - interval '24 hours' and not i.exito and not i.bloqueado $q$) ~ 'intentos_ip_idx',
  'la lectura previa de la IP usa intentos_ip_idx');
reset enable_seqscan;

-- El tope global alcanzado y el aviso técnico sin poder encolarse (su tabla, apartada un momento).
delete from hidrantes.intentos_codigo where ip_hash like 'ip36-%';
insert into hidrantes.intentos_codigo (dispositivo_id, ip_hash, exito)
select gen_random_uuid(), 'ip36-global-' || i, false from generate_series(1, 60) i;
alter table hidrantes.avisos_tecnicos rename to avisos_tecnicos_apartada36;
select ok((select resultado from pg_temp.medir('482917', 'f3600000-0000-4000-8000-000000036453', 'ip36-limpia'))
          ~ '^[A-Za-z0-9_-]{20,}$',
  'con el tope global alcanzado y el aviso técnico fallando, el móvil limpio de DEC-199 entra');
insert into hidrantes.intentos_codigo (dispositivo_id, ip_hash, exito, momento)
values ('f3600000-0000-4000-8000-000000036454', 'ip36-vieja', false, now() - interval '20 hours');
create temp table frenado_global as
  select * from pg_temp.medir('482917', 'f3600000-0000-4000-8000-000000036454', 'ip36-otra');
select is((select resultado from frenado_global), 'DEMASIADOS_INTENTOS',
  'un móvil con un fallo en 24 h, frenado por el tope global aunque el aviso falle');
select cmp_ok((select ms from frenado_global), '<', 50::numeric, 'y sin bcrypt');
select ok(exists (select 1 from hidrantes.errores_cliente
                   where ip_hash = 'sql:verificar_codigo' and mensaje like 'fn_verificar_codigo: aviso técnico sin encolar%'),
  'el aviso que falla queda anotado en errores_cliente');
alter table hidrantes.avisos_tecnicos_apartada36 rename to avisos_tecnicos;
delete from hidrantes.intentos_codigo where ip_hash like 'ip36-%';

-- =====================================================================================
-- RV-452
-- =====================================================================================

insert into hidrantes.puntos (id, codigo, tipo, geom, diametro_mm, caudal, foto_path, municipio,
                              fecha_ultima_revision, datos_cambiados_en)
values ('00000000-0000-4000-8000-000000036452', 'HID-8836', 'hidrante', 'SRID=4326;POINT(-3.6569 37.2308)', 100,
        'bueno', 'fotos/p36-1.jpg', 'albolote', current_date - 30, '2026-01-01 10:00:00.123456+00');

select has_column('hidrantes', 'v_puntos_activos', 'datos_cambiados_en',
  'v_puntos_activos trae datos_cambiados_en para el panel');
select hasnt_function('hidrantes', 'fn_editar_punto', array['uuid', 'jsonb'],
  'la firma de dos argumentos ya no existe');
select ok(has_function_privilege('authenticated', 'hidrantes.fn_editar_punto(uuid, jsonb, timestamptz)', 'execute')
          and not has_function_privilege('anon', 'hidrantes.fn_editar_punto(uuid, jsonb, timestamptz)', 'execute'),
  'la nueva la ejecuta authenticated, no anon');

-- El móvil del voluntario no la recibe.
create temp table token36 as
  select resultado as t from pg_temp.medir('482917', 'f3600000-0000-4000-8000-000000036455', 'ip36-token');
select ok(not (hidrantes.fn_ficha_punto((select t from token36), '00000000-0000-4000-8000-000000036452')
               ? 'datos_cambiados_en'),
  'fn_ficha_punto no la trae');
select ok(not exists (select 1 from jsonb_array_elements(hidrantes.fn_listar_puntos((select t from token36)) -> 'puntos') e
                       where e ? 'datos_cambiados_en'),
  'fn_listar_puntos no la trae');

-- Jefatura, unida de nuevo y con un JWT de después.
set local role service_role;
select hidrantes.fn_vincular_administrador('aaaaaaaa-0000-4000-8000-000000036450', 'union36@example.com');
reset role;
select pg_temp.sesion('aaaaaaaa-0000-4000-8000-000000036450', 'union36@example.com', pg_temp.ahora_s(60));
set local role authenticated;
-- Lo que lee el panel, como lo guarda el navegador (al milisegundo).
select set_config('test.version', (
  select to_char((v.datos_cambiados_en) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    from hidrantes.v_puntos_activos v where v.id = '00000000-0000-4000-8000-000000036452'), true);
select is(current_setting('test.version'), '2026-01-01T10:00:00.123Z', 'el panel lee la versión del punto');
select throws_like($$ select hidrantes.fn_editar_punto('00000000-0000-4000-8000-000000036452', '{"caudal":"malo"}',
                                                      '2025-12-31T00:00:00Z') $$,
  'PUNTO_CAMBIADO%', 'con una versión anterior a la del punto: PUNTO_CAMBIADO');
select is((select caudal::text from hidrantes.puntos where id = '00000000-0000-4000-8000-000000036452'), 'bueno',
  'y no se toca nada');
select lives_ok($$ select hidrantes.fn_editar_punto('00000000-0000-4000-8000-000000036452', '{"caudal":"regular"}',
                                                   current_setting('test.version')::timestamptz) $$,
  'con la versión que abrió (al milisegundo): guarda');
select throws_like($$ select hidrantes.fn_editar_punto('00000000-0000-4000-8000-000000036452', '{"caudal":"malo"}',
                                                      current_setting('test.version')::timestamptz) $$,
  'PUNTO_CAMBIADO%', 'otra vez con esa versión, ya cambiada por ese guardado: PUNTO_CAMBIADO');
select lives_ok($$ select hidrantes.fn_editar_punto('00000000-0000-4000-8000-000000036452', '{"caudal":"malo"}') $$,
  'sin versión (el panel anterior): guarda como siempre');
select lives_ok($$ select hidrantes.fn_editar_punto(punto_id => '00000000-0000-4000-8000-000000036452',
                                                   cambios => '{"caudal":"regular"}', version => null) $$,
  'con la versión nula: también');
reset role;
select is((select caudal::text from hidrantes.puntos where id = '00000000-0000-4000-8000-000000036452'), 'regular',
  'los guardados que valían han entrado');

select * from finish();
rollback;
