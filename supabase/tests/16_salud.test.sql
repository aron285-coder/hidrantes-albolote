-- Salud del sistema (FR-143, docs/17 RV-22): tamaño de la base de datos y de nuestro esquema, y la
-- lista de tareas programadas (en vivo desde 0031, RV-92; el detalle, en 28_salud_tareas_en_vivo).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;

select plan(3);

insert into hidrantes.administradores (email, creado_por) values ('salud@example.com', 'test') on conflict do nothing;
select set_config('request.jwt.claims', '{"role":"authenticated","email":"salud@example.com","amr":[{"method":"oauth","timestamp":1}],"app_metadata":{"provider":"google","providers":["google"]}}', true);
insert into hidrantes.config (clave, valor, actualizado_por)
values ('tareas_programadas', '[{"tarea":"hidrantes_purgar_errores","problema":false}]', 'vigilancia.yml')
on conflict (clave) do update set valor = excluded.valor;

set local role authenticated;
select ok((hidrantes.fn_salud() ->> 'bd_bytes')::bigint > 0, 'fn_salud devuelve bd_bytes > 0');
select ok((hidrantes.fn_salud() ->> 'esquema_bytes')::bigint > 0, 'y esquema_bytes > 0');
select is(jsonb_typeof(hidrantes.fn_salud() -> 'tareas'), 'array',
  'y la lista de tareas (en vivo desde 0031: ver 28_salud_tareas_en_vivo)');
reset role;

select * from finish();
rollback;
