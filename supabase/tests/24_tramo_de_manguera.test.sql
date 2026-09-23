-- docs/18 GM-01: el tramo de manguera en config, en la de los móviles y en Ajustes (FR-142). Todo
-- dentro de una transacción que se deshace.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;

select plan(5);

insert into hidrantes.config (clave, valor, actualizado_por)
values ('codigo_acceso_hash', to_jsonb(extensions.crypt('482917', extensions.gen_salt('bf', 4))), 'test')
on conflict (clave) do update set valor = excluded.valor;
select set_config('test.token',
  (select token from hidrantes.fn_verificar_codigo('482917', 'dddddddd-0000-4000-8000-0000000e4901', 'ip-tramo')), true);

select is(hidrantes.fn_config('metros_tramo_manguera', 'null'), '20'::jsonb, 'la migración siembra 20 m');
select is(hidrantes.fn_listar_puntos(current_setting('test.token'), now()) -> 'config' -> 'metros_tramo_manguera',
  '20'::jsonb, 'fn_listar_puntos lo manda en config');

insert into hidrantes.administradores (email, creado_por) values ('tramo@example.com', 'test') on conflict do nothing;
select set_config('request.jwt.claims',
  '{"role":"authenticated","email":"tramo@example.com","amr":[{"method":"oauth","timestamp":1}],"app_metadata":{"provider":"google","providers":["google"]}}',
  true);
set local role authenticated;
select throws_like($$ select hidrantes.fn_guardar_config('{"metros_tramo_manguera": 5}') $$, 'CONFIG_INVALIDA%',
  'fn_guardar_config rechaza 5');
select throws_like($$ select hidrantes.fn_guardar_config('{"metros_tramo_manguera": 40}') $$, 'CONFIG_INVALIDA%',
  'y 40');
select lives_ok($$ select hidrantes.fn_guardar_config('{"metros_tramo_manguera": 25}') $$, 'y acepta 25');
reset role;

select * from finish();
rollback;
