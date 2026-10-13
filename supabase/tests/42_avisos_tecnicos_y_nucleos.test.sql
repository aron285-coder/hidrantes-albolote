-- docs/35 (0045): RV-403, añadir o renombrar un núcleo no deja las propuestas de la Cola
-- desactualizadas (puntos.datos_cambiados_en), y RV-404, avisos técnicos a jefatura
-- (fn_encolar_aviso_tecnico y el tema avisos_tecnicos, DEC-202). Todo dentro de una transacción
-- que se deshace.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;

select plan(45);

create function pg_temp.jefatura() returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'role', 'authenticated', 'email', 'jefa42@example.com',
    'amr', jsonb_build_array(jsonb_build_object('method', 'oauth', 'timestamp', 1)),
    'app_metadata', jsonb_build_object('provider', 'google', 'providers', jsonb_build_array('google')))::text, true);
$$;
create function pg_temp.sin_sesion() returns void language sql as $$
  select set_config('request.jwt.claims', '', true);
$$;
create function pg_temp.desactualizada(id uuid) returns boolean language sql as $$
  select v.desactualizada from hidrantes.v_cola_revision v where v.id = $1;
$$;
-- Llama a fn_encolar_aviso_tecnico como service_role (como las Pages Functions) y devuelve lo que da.
create function pg_temp.aviso(clave text, titulo text default null, cuerpo text default null) returns boolean
language plpgsql as $$
declare
  r boolean;
begin
  set local role service_role;
  r := hidrantes.fn_encolar_aviso_tecnico(clave, titulo, cuerpo);
  reset role;
  return r;
end $$;
create function pg_temp.avisos_de(s uuid) returns bigint language sql as $$
  select count(*) from hidrantes.notificaciones n where n.suscripcion_id = s;
$$;

insert into hidrantes.administradores (email, creado_por) values ('jefa42@example.com', 'test') on conflict do nothing;
insert into hidrantes.administradores (email, activo, creado_por) values ('baja42@example.com', false, 'test')
on conflict (email) do update set activo = false;

-- =====================================================================================
-- RV-403 · núcleos y propuestas desactualizadas
-- =====================================================================================

select has_column('hidrantes', 'puntos', 'datos_cambiados_en', 'puntos tiene datos_cambiados_en');
select col_not_null('hidrantes', 'puntos', 'datos_cambiados_en', 'datos_cambiados_en no admite null');
select has_column('hidrantes', 'v_cola_revision', 'punto_datos_cambiados_en',
  'la cola dice cuándo cambiaron los datos del punto');

delete from hidrantes.nucleos;
delete from hidrantes.limite_municipal;
insert into hidrantes.limite_municipal (municipio, geom, version) values
  ('albolote', 'SRID=4326;MULTIPOLYGON(((-3.66 37.23,-3.65 37.23,-3.65 37.24,-3.66 37.24,-3.66 37.23)))', 'test');
insert into hidrantes.nucleos (nombre, municipio, geom, version) values
  ('Centro', 'albolote', 'SRID=4326;POINT(-3.655 37.235)', 'test');

-- P1, al norte (pasará al núcleo nuevo); P2, al sur (se queda en Centro). Los dos sin tocar hace dos días.
insert into hidrantes.puntos (id, codigo, tipo, geom, diametro_mm, caudal, foto_path, municipio, nucleo,
                              fecha_ultima_revision, actualizado_en, datos_cambiados_en)
values ('00000000-0000-4000-8000-0000000042a1', 'HID-0421', 'hidrante', 'SRID=4326;POINT(-3.6535 37.2385)', 70,
        'bueno', 'fotos/42-1.jpg', 'albolote', 'Centro', current_date - 30,
        now() - interval '2 days', now() - interval '2 days'),
       ('00000000-0000-4000-8000-0000000042a2', 'HID-0422', 'hidrante', 'SRID=4326;POINT(-3.6585 37.2315)', 70,
        'bueno', 'fotos/42-2.jpg', 'albolote', 'Centro', current_date - 30,
        now() - interval '2 days', now() - interval '2 days');
-- Propuestas pendientes de hace una hora: A y B sobre P1, C sobre P2.
insert into hidrantes.propuestas (id, punto_id, operacion, datos, autor_nombre, autor_apellido, dispositivo_id,
                                  clave_local, foto_path, creada_en)
values ('00000000-0000-4000-8000-0000000042b1', '00000000-0000-4000-8000-0000000042a1', 'revision', '{}',
        'A', 'B', gen_random_uuid(), 'p42-a', 'fotos/42-a.jpg', now() - interval '1 hour'),
       ('00000000-0000-4000-8000-0000000042b2', '00000000-0000-4000-8000-0000000042a1', 'estado',
        '{"caudal": "regular"}', 'A', 'B', gen_random_uuid(), 'p42-b', null, now() - interval '1 hour'),
       ('00000000-0000-4000-8000-0000000042b3', '00000000-0000-4000-8000-0000000042a2', 'revision', '{}',
        'A', 'B', gen_random_uuid(), 'p42-c', 'fotos/42-c.jpg', now() - interval '1 hour');

select pg_temp.jefatura();
select hidrantes.fn_anadir_nucleo('Barrio Norte', 37.2388, -3.6532);

select is((select nucleo from hidrantes.puntos where codigo = 'HID-0421'), 'Barrio Norte',
  'el punto más cerca del núcleo nuevo pasa a él');
select ok((select actualizado_en = now() from hidrantes.puntos where codigo = 'HID-0421'),
  'su actualizado_en sube: los móviles traen el núcleo nuevo');
select ok((select actualizado_en < now() - interval '1 day' from hidrantes.puntos where codigo = 'HID-0422'),
  'añadir un núcleo no toca los puntos cuyo núcleo no cambia');
select is(pg_temp.desactualizada('00000000-0000-4000-8000-0000000042b1'), false,
  'añadir un núcleo no deja desactualizada la propuesta del punto que cambia de núcleo');
select is(pg_temp.desactualizada('00000000-0000-4000-8000-0000000042b3'), false,
  'ni la de un punto del mismo municipio que no cambia');

select hidrantes.fn_renombrar_nucleo('Centro', 'Centro viejo');
select is((select nucleo from hidrantes.puntos where codigo = 'HID-0422'), 'Centro viejo',
  'renombrar arrastra el núcleo de sus puntos');
select is(pg_temp.desactualizada('00000000-0000-4000-8000-0000000042b3'), false,
  'renombrar un núcleo no deja desactualizada la propuesta');

-- Un cambio de núcleo o municipio a mano tampoco; poner datos_cambiados_en a mano no cuela.
update hidrantes.puntos set nucleo = 'Otro', municipio = 'albolote', datos_cambiados_en = now() - interval '9 days'
 where codigo = 'HID-0422';
select ok((select datos_cambiados_en = now() - interval '2 days' from hidrantes.puntos where codigo = 'HID-0422'),
  'cambiar solo el núcleo o el municipio no mueve datos_cambiados_en, ni se puede fijar a mano');

-- Aprobar A sin confirmar: el punto solo cambió de núcleo.
select lives_ok($$ select hidrantes.fn_aprobar('00000000-0000-4000-8000-0000000042b1') $$,
  'una propuesta cuyo punto solo cambió de núcleo se aprueba sin confirmar');
select ok((select datos_cambiados_en = now() from hidrantes.puntos where codigo = 'HID-0421'),
  'aprobar una revisión cambia los datos del punto');
select is(pg_temp.desactualizada('00000000-0000-4000-8000-0000000042b2'), true,
  'con los datos del punto cambiados, la otra propuesta sí sale desactualizada');
select throws_like($$ select hidrantes.fn_aprobar('00000000-0000-4000-8000-0000000042b2') $$,
  'PROPUESTA_DESACTUALIZADA%', 'y aprobarla pide confirmación');

-- Corregir el estado del punto de C → C sí sale desactualizada.
select hidrantes.fn_editar_punto('00000000-0000-4000-8000-0000000042a2',
  '{"caudal": "no_funciona", "descripcion_fallo": "no abre"}');
select is(pg_temp.desactualizada('00000000-0000-4000-8000-0000000042b3'), true,
  'corregir el estado del punto deja desactualizada su propuesta');
select ok((select punto_datos_cambiados_en = now() from hidrantes.v_cola_revision
            where id = '00000000-0000-4000-8000-0000000042b3'),
  'punto_datos_cambiados_en dice cuándo cambiaron sus datos');
select pg_temp.sin_sesion();

-- =====================================================================================
-- RV-404 · avisos técnicos a jefatura
-- =====================================================================================

select has_function('hidrantes', 'fn_encolar_aviso_tecnico', array['text', 'text', 'text', 'text'],
  'existe fn_encolar_aviso_tecnico(clave, titulo, cuerpo, url)');
select ok(has_function_privilege('service_role', 'hidrantes.fn_encolar_aviso_tecnico(text, text, text, text)', 'execute'),
  'service_role puede ejecutarla');
select ok(not has_function_privilege('anon', 'hidrantes.fn_encolar_aviso_tecnico(text, text, text, text)', 'execute'),
  'anon no');
select ok(not has_function_privilege('authenticated', 'hidrantes.fn_encolar_aviso_tecnico(text, text, text, text)', 'execute'),
  'authenticated no');
select ok((select p.proacl is not null
                  and not exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0)
             from pg_proc p where p.oid = 'hidrantes.fn_encolar_aviso_tecnico(text, text, text, text)'::regprocedure),
  'public no');
select ok(not has_table_privilege('anon', 'hidrantes.avisos_tecnicos', 'select')
          and not has_table_privilege('authenticated', 'hidrantes.avisos_tecnicos', 'select'),
  'la tabla de últimas emisiones no la leen anon ni authenticated');
select is((select relrowsecurity from pg_class where oid = 'hidrantes.avisos_tecnicos'::regclass), true,
  'la tabla tiene RLS');

-- Sin ninguna suscripción con el tema: no encola ni cuenta como emitido.
update hidrantes.suscripciones_push set temas = array_remove(temas, 'avisos_tecnicos');
delete from hidrantes.avisos_tecnicos;
select is(pg_temp.aviso('vigilancia'), false, 'sin suscripciones con el tema, devuelve false');
select ok(not exists (select 1 from hidrantes.avisos_tecnicos where clave = 'vigilancia'),
  'y no cuenta como emitido');

-- s1: jefatura con el tema · s2: jefatura sin el tema · s3: administrador inactivo con el tema ·
-- s4: voluntario con el tema puesto a mano.
insert into hidrantes.suscripciones_push (id, email, dispositivo_id, suscripcion, temas) values
  ('00000000-0000-4000-8000-0000000042c1', 'jefa42@example.com', null,
   '{"endpoint": "https://fcm.googleapis.com/fcm/send/rv404-1", "keys": {"p256dh": "p", "auth": "a"}}',
   array['nuevas_propuestas', 'avisos_tecnicos']),
  ('00000000-0000-4000-8000-0000000042c2', 'jefa42@example.com', null,
   '{"endpoint": "https://fcm.googleapis.com/fcm/send/rv404-2", "keys": {"p256dh": "p", "auth": "a"}}',
   array['nuevas_propuestas']),
  ('00000000-0000-4000-8000-0000000042c3', 'baja42@example.com', null,
   '{"endpoint": "https://fcm.googleapis.com/fcm/send/rv404-3", "keys": {"p256dh": "p", "auth": "a"}}',
   array['avisos_tecnicos']),
  ('00000000-0000-4000-8000-0000000042c4', null, '00000000-0000-4000-8000-0000000042d4',
   '{"endpoint": "https://fcm.googleapis.com/fcm/send/rv404-4", "keys": {"p256dh": "p", "auth": "a"}}',
   array['resultado_propuesta', 'avisos_tecnicos']);

select is(pg_temp.aviso('respaldo'), true, 'encola el aviso y devuelve true');
select is(pg_temp.avisos_de('00000000-0000-4000-8000-0000000042c1'), 1::bigint,
  'una notificación para la suscripción de jefatura con el tema');
select is((select n.cuerpo from hidrantes.notificaciones n
            where n.suscripcion_id = '00000000-0000-4000-8000-0000000042c1'),
  'El respaldo de esta semana ha fallado.', 'con el texto fijo de la clave');
select is((select n.url from hidrantes.notificaciones n
            where n.suscripcion_id = '00000000-0000-4000-8000-0000000042c1'),
  '/admin/ajustes', 'y lleva a Ajustes, donde está Salud del sistema');
select is(pg_temp.avisos_de('00000000-0000-4000-8000-0000000042c2'), 0::bigint,
  'ninguna para jefatura sin el tema');
select is(pg_temp.avisos_de('00000000-0000-4000-8000-0000000042c3'), 0::bigint,
  'ninguna para un administrador inactivo');
select is(pg_temp.avisos_de('00000000-0000-4000-8000-0000000042c4'), 0::bigint,
  'ninguna de voluntario');

select is(pg_temp.aviso('respaldo'), false, 'la misma clave dentro de 24 h no vuelve a encolar');
select is(pg_temp.avisos_de('00000000-0000-4000-8000-0000000042c1'), 1::bigint, 'sigue habiendo una');
select is(pg_temp.aviso('despliegue'), true, 'otra clave sí');
update hidrantes.avisos_tecnicos set ultimo_en = now() - interval '23 hours' where clave = 'respaldo';
select is(pg_temp.aviso('respaldo'), false, 'a las 23 h, todavía no');
update hidrantes.avisos_tecnicos set ultimo_en = now() - interval '25 hours' where clave = 'respaldo';
select is(pg_temp.aviso('respaldo'), true, 'pasadas 24 h, otra vez');

select is(pg_temp.aviso('intentos_codigo'), true, 'intentos_codigo encola');
select is(pg_temp.aviso('intentos_codigo'), false, 'y no repite dentro de la hora');
update hidrantes.avisos_tecnicos set ultimo_en = now() - interval '61 minutes' where clave = 'intentos_codigo';
select is(pg_temp.aviso('intentos_codigo'), true, 'pasada una hora, otra vez');

select is(pg_temp.aviso('vigilancia', 'Prueba', 'Texto de prueba'), true, 'con título y cuerpo propios');
select is((select n.titulo from hidrantes.notificaciones n
            where n.suscripcion_id = '00000000-0000-4000-8000-0000000042c1' and n.cuerpo = 'Texto de prueba'),
  'Prueba', 'usa los que recibe');
select throws_like($$ select hidrantes.fn_encolar_aviso_tecnico('otra_cosa', null, null) $$,
  'PAYLOAD_INVALIDO(clave)%', 'una clave desconocida no se admite');

-- El panel puede activar el tema; un voluntario no.
select pg_temp.jefatura();
select lives_ok($$ select hidrantes.fn_guardar_suscripcion_push_admin(
  '{"endpoint": "https://fcm.googleapis.com/fcm/send/rv404-5", "keys": {"p256dh": "p", "auth": "a"}}'::jsonb,
  array['avisos_tecnicos']) $$, 'jefatura puede activar los avisos técnicos');
select pg_temp.sin_sesion();

select * from finish();
rollback;
