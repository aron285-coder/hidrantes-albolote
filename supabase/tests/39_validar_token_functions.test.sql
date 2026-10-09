-- 0043 (#561, docs/32 RV-270 D1): /api/push y /api/geocodificar comprueban el token del voluntario
-- con fn_validar_token y service_role. Que service_role pueda, que anon y authenticated sigan sin poder,
-- y que fn_listar_puntos no se haya abierto a service_role.
-- Todo dentro de una transacción que se deshace.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;

select plan(9);

insert into hidrantes.config (clave, valor, actualizado_por)
values ('codigo_acceso_hash', to_jsonb(extensions.crypt('482917', extensions.gen_salt('bf', 4))), 'test')
on conflict (clave) do update set valor = excluded.valor;
select set_config('request.jwt.claims', '', true);
select set_config('test.token',
  (select token from hidrantes.fn_verificar_codigo('482917', 'a3900000-0000-4000-8000-0000000e3901', 'ip-39-a')), true);

-- ---------- permisos ----------

select ok(has_function_privilege('service_role', 'hidrantes.fn_validar_token(text)', 'execute'),
  'service_role ejecuta fn_validar_token (la llaman /api/push y /api/geocodificar)');
select ok(not has_function_privilege('anon', 'hidrantes.fn_validar_token(text)', 'execute'),
  'anon sigue sin ejecutar fn_validar_token');
select ok(not has_function_privilege('authenticated', 'hidrantes.fn_validar_token(text)', 'execute'),
  'authenticated sigue sin ejecutar fn_validar_token');
select ok(not has_function_privilege('service_role', 'hidrantes.fn_listar_puntos(text, timestamptz)', 'execute'),
  'fn_listar_puntos no se abre a service_role: las Functions no la necesitan');

-- ---------- como las Functions: rol service_role ----------

set local role service_role;
select is(hidrantes.fn_validar_token(current_setting('test.token')), 'a3900000-0000-4000-8000-0000000e3901'::uuid,
  'service_role valida un token real y obtiene su dispositivo');
select throws_like($$ select hidrantes.fn_validar_token('inventado-inventado-inventado') $$,
  'TOKEN_INVALIDO%', 'un token inventado: TOKEN_INVALIDO (la Function contesta 401)');
reset role;

update hidrantes.dispositivos set revocado_en = now() where dispositivo_id = 'a3900000-0000-4000-8000-0000000e3901';
set local role service_role;
select throws_like($$ select hidrantes.fn_validar_token(current_setting('test.token')) $$,
  'TOKEN_REVOCADO%', 'un token revocado: TOKEN_REVOCADO');
reset role;

-- ---------- anon, como antes ----------

set local role anon;
select throws_ok($$ select hidrantes.fn_validar_token(current_setting('test.token')) $$, '42501', null,
  'anon no puede llamarla directamente');
reset role;
set local role authenticated;
select throws_ok($$ select hidrantes.fn_validar_token(current_setting('test.token')) $$, '42501', null,
  'authenticated tampoco');
reset role;

select * from finish();
rollback;
