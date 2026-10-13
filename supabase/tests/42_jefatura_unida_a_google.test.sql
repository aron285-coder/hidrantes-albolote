-- docs/35 RV-400 (DEC-197): jefatura exige, además de la sesión de Google con el correo de un
-- administrador activo, que la fila esté vinculada al usuario del JWT (`sub`). La vincula
-- fn_vincular_administrador, solo para service_role.
-- Todo dentro de una transacción que se deshace.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;

select plan(22);

-- Solo las filas de esta prueba cuentan para la regla del último administrador.
update hidrantes.administradores set activo = false;
insert into hidrantes.administradores (email, creado_por) values
  ('vinc@example.com', 'test'), ('otra.vinc@example.com', 'test');

create function pg_temp.sesion(sub text, correo text) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'role', 'authenticated', 'sub', sub, 'email', correo,
    'amr', jsonb_build_array(jsonb_build_object('method', 'oauth', 'timestamp', 1)),
    'app_metadata', jsonb_build_object('provider', 'google', 'providers', jsonb_build_array('google')))::text, true);
$$;

-- ---------- permisos ----------

select ok(not has_function_privilege('anon', 'hidrantes.fn_vincular_administrador(uuid, text)', 'execute'),
  'anon no ejecuta fn_vincular_administrador');
select ok(not has_function_privilege('authenticated', 'hidrantes.fn_vincular_administrador(uuid, text)', 'execute'),
  'authenticated no ejecuta fn_vincular_administrador');
select ok(has_function_privilege('service_role', 'hidrantes.fn_vincular_administrador(uuid, text)', 'execute'),
  'service_role ejecuta fn_vincular_administrador');
select ok(not has_function_privilege('anon', 'hidrantes.fn_usuario_jwt()', 'execute')
          and not has_function_privilege('authenticated', 'hidrantes.fn_usuario_jwt()', 'execute'),
  'fn_usuario_jwt es interna');

-- ---------- sin vincular, no es jefatura ----------

select pg_temp.sesion('aaaaaaaa-0000-4000-8000-00000000a400', 'vinc@example.com');
set local role authenticated;
select is(hidrantes.fn_es_admin(), false, 'Google y el correo de un administrador, sin vincular: no es jefatura');
select is((select count(*)::int from hidrantes.administradores), 0, 'sin vincular: RLS no deja ver administradores');
reset role;

-- ---------- las cuatro respuestas ----------

set local role service_role;
select is(hidrantes.fn_vincular_administrador('aaaaaaaa-0000-4000-8000-00000000a400', ' Vinc@Example.com '),
  'VINCULADO', 'fila activa y sin vincular: VINCULADO');
select is(hidrantes.fn_vincular_administrador('aaaaaaaa-0000-4000-8000-00000000a400', 'vinc@example.com'),
  'YA_VINCULADO', 'mismo usuario otra vez: YA_VINCULADO');
select is(hidrantes.fn_vincular_administrador('bbbbbbbb-0000-4000-8000-00000000a400', 'vinc@example.com'),
  'OTRA_CUENTA', 'otro usuario con el mismo correo: OTRA_CUENTA');
select is(hidrantes.fn_vincular_administrador('aaaaaaaa-0000-4000-8000-00000000a400', 'otra.vinc@example.com'),
  'OTRA_CUENTA', 'un usuario ya vinculado no se vincula a una segunda fila');
select is(hidrantes.fn_vincular_administrador('cccccccc-0000-4000-8000-00000000a400', 'nadie@example.com'),
  'NO_ES_ADMINISTRADOR', 'correo que no está: NO_ES_ADMINISTRADOR');
select throws_like($$ select hidrantes.fn_vincular_administrador(null, 'vinc@example.com') $$,
  'PAYLOAD_INVALIDO%', 'sin usuario: PAYLOAD_INVALIDO');
reset role;

select is((select usuario_id from hidrantes.administradores where email = 'vinc@example.com'),
  'aaaaaaaa-0000-4000-8000-00000000a400'::uuid, 'la fila queda unida a ese usuario');
select ok((select vinculado and vinculado_en is not null from hidrantes.administradores where email = 'vinc@example.com'),
  'vinculado y vinculado_en');
select is((select count(*)::int from hidrantes.registro
            where accion = 'administrador_vinculado' and actor = 'vinc@example.com'
              and despues = '{"email": "vinc@example.com"}'::jsonb),
  1, 'un solo registro administrador_vinculado, sin el usuario');

update hidrantes.administradores set activo = false where email = 'otra.vinc@example.com';
set local role service_role;
select is(hidrantes.fn_vincular_administrador('dddddddd-0000-4000-8000-00000000a400', 'otra.vinc@example.com'),
  'NO_ES_ADMINISTRADOR', 'una fila inactiva no se vincula');
reset role;
update hidrantes.administradores set activo = true where email = 'otra.vinc@example.com';

-- ---------- vinculado: sí; otro usuario con el mismo correo: no ----------

select pg_temp.sesion('aaaaaaaa-0000-4000-8000-00000000a400', 'vinc@example.com');
set local role authenticated;
select is(hidrantes.fn_es_admin(), true, 'vinculado al mismo usuario: es jefatura');
reset role;

select pg_temp.sesion('bbbbbbbb-0000-4000-8000-00000000a400', 'vinc@example.com');
set local role authenticated;
select is(hidrantes.fn_es_admin(), false, 'otro usuario con el correo del administrador: no es jefatura');
select throws_like($$ select hidrantes.fn_cerrar_entrada() $$, 'NO_AUTORIZADO%',
  'y las RPC de jefatura le dicen NO_AUTORIZADO');
reset role;

select pg_temp.sesion('no-es-un-uuid', 'vinc@example.com');
set local role authenticated;
select is(hidrantes.fn_es_admin(), false, 'un sub que no es uuid: no es jefatura');
reset role;

-- ---------- el último administrador activo y vinculado ----------
-- otra.vinc está activa pero sin vincular: no cuenta.

select pg_temp.sesion('aaaaaaaa-0000-4000-8000-00000000a400', 'vinc@example.com');
set local role authenticated;
select throws_like($$ select hidrantes.fn_gestionar_administrador('vinc@example.com', false) $$,
  'ULTIMO_ADMINISTRADOR%', 'el último activo y vinculado no se quita el acceso, aunque haya otro sin vincular');
reset role;

set local role service_role;
select hidrantes.fn_vincular_administrador('eeeeeeee-0000-4000-8000-00000000a400', 'otra.vinc@example.com');
reset role;
select pg_temp.sesion('aaaaaaaa-0000-4000-8000-00000000a400', 'vinc@example.com');
set local role authenticated;
select lives_ok($$ select hidrantes.fn_gestionar_administrador('vinc@example.com', false) $$,
  'con otro vinculado, sí');
reset role;

select * from finish();
rollback;
