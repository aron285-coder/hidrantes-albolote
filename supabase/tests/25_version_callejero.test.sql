-- docs/18 GM-04: Salud del sistema enseña la versión del callejero que anota cada despliegue
-- (FR-73, FR-143). Todo dentro de una transacción que se deshace.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;

select plan(3);

insert into hidrantes.administradores (email, creado_por) values ('callejero@example.com', 'test') on conflict do nothing;
select set_config('request.jwt.claims', '{"role":"authenticated","email":"callejero@example.com","amr":[{"method":"oauth","timestamp":1}],"app_metadata":{"provider":"google","providers":["google"]}}', true);

delete from hidrantes.config where clave = 'version_callejero';
set local role authenticated;
select ok(hidrantes.fn_salud() ? 'version_callejero', 'fn_salud trae version_callejero');
select is(hidrantes.fn_salud() -> 'version_callejero', 'null'::jsonb, 'sin despliegue, null');
reset role;

insert into hidrantes.config (clave, valor, actualizado_por) values ('version_callejero', to_jsonb('20260923'::text), 'despliegue');
set local role authenticated;
select is(hidrantes.fn_salud() ->> 'version_callejero', '20260923', 'con la que anotó el despliegue');
reset role;

select * from finish();
rollback;
