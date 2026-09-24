-- docs/18 RV-36: jefatura se decide por el correo **y** por una sesión de Google. Un usuario de Auth
-- con contraseña y el correo de un administrador no es jefatura. Todo dentro de una transacción que
-- se deshace.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;

select plan(8);

insert into hidrantes.administradores (email, creado_por) values ('jefa.google@example.com', 'test');

-- Con contraseña: amr password y providers ["email"]. Sobre develop daba true.
select set_config('request.jwt.claims',
  '{"role":"authenticated","email":"jefa.google@example.com","amr":[{"method":"password","timestamp":1}],"app_metadata":{"provider":"email","providers":["email"]}}',
  true);
select is(hidrantes.fn_es_admin(), false, 'con contraseña y el correo de un administrador, no es jefatura');
select is(hidrantes.fn_email_jwt(), null, 'y fn_email_jwt no da correo');
select throws_like($$ select hidrantes.fn_exigir_admin() $$, 'NO_AUTORIZADO%', 'fn_exigir_admin lanza NO_AUTORIZADO');

-- Con Google y una sesión de OAuth.
select set_config('request.jwt.claims',
  '{"role":"authenticated","email":"Jefa.Google@example.com","amr":[{"method":"oauth","timestamp":1}],"app_metadata":{"provider":"google","providers":["google"]}}',
  true);
select is(hidrantes.fn_es_admin(), true, 'con Google y amr oauth, es jefatura (sin distinguir mayúsculas)');
select is(hidrantes.fn_exigir_admin(), 'jefa.google@example.com', 'y fn_exigir_admin devuelve el correo');

-- Con Google vinculado pero esta sesión abierta con contraseña: tampoco.
select set_config('request.jwt.claims',
  '{"role":"authenticated","email":"jefa.google@example.com","amr":[{"method":"password","timestamp":1}],"app_metadata":{"provider":"email","providers":["email","google"]}}',
  true);
select is(hidrantes.fn_es_admin(), false, 'con Google vinculado pero la sesión con contraseña, no');

-- Sin amr.
select set_config('request.jwt.claims',
  '{"role":"authenticated","email":"jefa.google@example.com","app_metadata":{"provider":"google","providers":["google"]}}',
  true);
select is(hidrantes.fn_es_admin(), false, 'sin amr, no');

-- Sin providers.
select set_config('request.jwt.claims',
  '{"role":"authenticated","email":"jefa.google@example.com","amr":[{"method":"oauth","timestamp":1}]}', true);
select is(hidrantes.fn_es_admin(), false, 'sin app_metadata.providers, no');

select * from finish();
rollback;
