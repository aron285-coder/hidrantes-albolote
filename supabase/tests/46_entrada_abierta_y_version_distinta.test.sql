-- docs/37 (0049; DEC-211):
--   RV-491: service_role, y nadie más, ejecuta fn_entrada_abierta_hasta() (la pregunta /api/verificar-codigo).
--   RV-492: fn_editar_punto rechaza cualquier versión distinta de la guardada, también una posterior.
-- Todo dentro de una transacción que se deshace.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;

select plan(9);

-- ---------- RV-491 ----------

select ok(has_function_privilege('service_role', 'hidrantes.fn_entrada_abierta_hasta()', 'execute'),
  'service_role ejecuta fn_entrada_abierta_hasta');
select ok(not has_function_privilege('anon', 'hidrantes.fn_entrada_abierta_hasta()', 'execute')
          and not has_function_privilege('authenticated', 'hidrantes.fn_entrada_abierta_hasta()', 'execute'),
  'ni anon ni authenticated');

update hidrantes.config set valor = to_jsonb(now() + interval '2 hours') where clave = 'entrada_abierta_hasta';
insert into hidrantes.config (clave, valor)
  select 'entrada_abierta_hasta', to_jsonb(now() + interval '2 hours')
   where not exists (select 1 from hidrantes.config where clave = 'entrada_abierta_hasta');
set local role service_role;
select ok(hidrantes.fn_entrada_abierta_hasta() > now(), 'con la service role, dice hasta cuándo está abierta');
reset role;

-- ---------- RV-492 ----------

-- Solo las filas de esta prueba cuentan como administradores activos.
update hidrantes.administradores set activo = false;
insert into hidrantes.administradores (email, creado_por) values ('version37@example.com', 'test');

-- Una sesión de Google de jefatura emitida ahora (después de la unión).
create function pg_temp.sesion() returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'role', 'authenticated', 'sub', 'aaaaaaaa-0000-4000-8000-000000037492', 'email', 'version37@example.com',
    'iat', floor(extract(epoch from now()))::bigint + 60,
    'amr', jsonb_build_array(jsonb_build_object('method', 'oauth', 'timestamp', 1)),
    'app_metadata', jsonb_build_object('provider', 'google', 'providers', jsonb_build_array('google')))::text, true);
$$;

-- La marca guardada es la de un cambio C que empezó antes que otro B pero terminó después: queda
-- anterior a la versión de B, que es la que tiene en la mano quien abrió el punto después de B.
insert into hidrantes.puntos (id, codigo, tipo, geom, diametro_mm, caudal, foto_path, municipio,
                              fecha_ultima_revision, datos_cambiados_en)
values ('00000000-0000-4000-8000-000000037492', 'HID-8837', 'hidrante', 'SRID=4326;POINT(-3.6569 37.2308)', 100,
        'bueno', 'fotos/p37-1.jpg', 'albolote', current_date - 30, '2026-01-01 10:00:00.123456+00');

set local role service_role;
select hidrantes.fn_vincular_administrador('aaaaaaaa-0000-4000-8000-000000037492', 'version37@example.com');
reset role;
select pg_temp.sesion();
set local role authenticated;

select throws_like($$ select hidrantes.fn_editar_punto('00000000-0000-4000-8000-000000037492', '{"caudal":"malo"}',
                                                      '2026-01-01T10:00:05.000Z') $$,
  'PUNTO_CAMBIADO%', 'con una versión posterior a la guardada (el caso C/B): PUNTO_CAMBIADO');
select throws_like($$ select hidrantes.fn_editar_punto('00000000-0000-4000-8000-000000037492', '{"caudal":"malo"}',
                                                      '2026-01-01T10:00:00.124Z') $$,
  'PUNTO_CAMBIADO%', 'con un milisegundo de más: PUNTO_CAMBIADO');
select throws_like($$ select hidrantes.fn_editar_punto('00000000-0000-4000-8000-000000037492', '{"caudal":"malo"}',
                                                      '2025-12-31T00:00:00Z') $$,
  'PUNTO_CAMBIADO%', 'con una anterior, como antes: PUNTO_CAMBIADO');
select is((select caudal::text from hidrantes.puntos where id = '00000000-0000-4000-8000-000000037492'), 'bueno',
  'y no se toca nada');
select lives_ok($$ select hidrantes.fn_editar_punto('00000000-0000-4000-8000-000000037492', '{"caudal":"regular"}',
                                                   '2026-01-01T10:00:00.123Z') $$,
  'con la misma versión, al milisegundo (como la guarda el navegador): guarda');
select lives_ok($$ select hidrantes.fn_editar_punto('00000000-0000-4000-8000-000000037492', '{"caudal":"malo"}') $$,
  'sin versión (el panel anterior): guarda como siempre');
reset role;

select * from finish();
rollback;
