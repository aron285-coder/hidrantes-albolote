-- docs/24 RV-103, DEC-146: segunda foto, la del sitio, obligatoria en alta y en corregir ubicación
-- con la firma nueva de fn_proponer; la firma de antes se queda para la app anterior (04 §12) y su
-- propuesta llega a la cola con la señal sin_foto_sitio. Lo más importante: la purga no borra las
-- fotos del sitio. Todo dentro de una transacción que se deshace.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;

select plan(36);

insert into hidrantes.config (clave, valor, actualizado_por)
values ('codigo_acceso_hash', to_jsonb(extensions.crypt('482917', extensions.gen_salt('bf', 4))), 'test')
on conflict (clave) do update set valor = excluded.valor;
select set_config('test.token',
  (select token from hidrantes.fn_verificar_codigo('482917', 'dddddddd-0000-4000-8000-0000000e3101', 'ip-sitio-a')), true);
select set_config('test.token_b',
  (select token from hidrantes.fn_verificar_codigo('482917', 'dddddddd-0000-4000-8000-0000000e3102', 'ip-sitio-b')), true);
insert into hidrantes.administradores (email, creado_por) values ('sitio@example.com', 'test') on conflict do nothing;

create function pg_temp.foto() returns text language sql as $$
  select hidrantes.fn_reservar_subida(current_setting('test.token'));
$$;

-- Firma nueva (17 parámetros), como voluntario. Devuelve el id de la propuesta.
create function pg_temp.proponer(clave text, op hidrantes.operacion, punto uuid, datos jsonb,
                                 lat double precision, lng double precision, foto text, sitio text)
returns uuid language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  return (hidrantes.fn_proponer(current_setting('test.token'), clave, 'Ana', 'Ruiz', op, punto, datos,
            case when lat is not null then 'gps'::hidrantes.origen_ubicacion end, lat, lng,
            null, null, null, null, null, foto, sitio) ->> 'propuesta_id')::uuid;
end $$;

-- Firma de antes (16 parámetros): la app anterior.
create function pg_temp.proponer_vieja(clave text, op hidrantes.operacion, punto uuid, datos jsonb,
                                       lat double precision, lng double precision, foto text)
returns uuid language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  return (hidrantes.fn_proponer(current_setting('test.token'), clave, 'Ana', 'Ruiz', op, punto, datos,
            case when lat is not null then 'gps'::hidrantes.origen_ubicacion end, lat, lng,
            null, null, null, null, null, foto) ->> 'propuesta_id')::uuid;
end $$;

create function pg_temp.jefatura() returns void language sql as $$
  select set_config('request.jwt.claims',
    '{"role":"authenticated","email":"sitio@example.com","amr":[{"method":"oauth","timestamp":1}],"app_metadata":{"provider":"google","providers":["google"]}}',
    true);
$$;

-- ---------- las dos firmas y sus permisos ----------
select has_function('hidrantes', 'fn_proponer',
  array['text', 'text', 'text', 'text', 'hidrantes.operacion', 'uuid', 'jsonb', 'hidrantes.origen_ubicacion',
        'double precision', 'double precision', 'double precision', 'double precision', 'real',
        'double precision', 'double precision', 'text', 'text'],
  'fn_proponer tiene la firma nueva con foto_sitio_path');
select has_function('hidrantes', 'fn_proponer',
  array['text', 'text', 'text', 'text', 'hidrantes.operacion', 'uuid', 'jsonb', 'hidrantes.origen_ubicacion',
        'double precision', 'double precision', 'double precision', 'double precision', 'real',
        'double precision', 'double precision', 'text'],
  'y la de antes se queda (04 §12)');
select ok(has_function_privilege('anon', 'hidrantes.fn_proponer(text, text, text, text, hidrantes.operacion, uuid, jsonb, hidrantes.origen_ubicacion, double precision, double precision, double precision, double precision, real, double precision, double precision, text, text)', 'execute')
          and has_function_privilege('authenticated', 'hidrantes.fn_proponer(text, text, text, text, hidrantes.operacion, uuid, jsonb, hidrantes.origen_ubicacion, double precision, double precision, double precision, double precision, real, double precision, double precision, text, text)', 'execute'),
  'la firma nueva: execute para anon y authenticated, como la de antes');
select ok(has_function_privilege('anon',
  'hidrantes.fn_proponer(text, text, text, text, hidrantes.operacion, uuid, jsonb, hidrantes.origen_ubicacion, double precision, double precision, double precision, double precision, real, double precision, double precision, text)',
  'execute'), 'la de antes sigue con execute para anon');
select ok(not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'hidrantes' and p.proname = 'fn_proponer_interno'
       and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))),
  'el núcleo común no lo ejecutan anon ni authenticated');

-- ---------- firma nueva: obligatoria en alta y ubicación, y solo ahí ----------
insert into hidrantes.puntos (id, codigo, tipo, geom, diametro_mm, caudal, foto_path, foto_sitio_path, municipio,
                              fecha_ultima_revision)
values ('00000000-0000-4000-8000-0000000e3151', 'HID-8601', 'hidrante', 'SRID=4326;POINT(-3.6301 37.2301)', 100,
        'bueno', 'fotos/s-conexion.jpg', 'fotos/s-sitio.jpg', 'albolote', current_date);

select throws_like($$ select pg_temp.proponer('sitio-alta-sin', 'alta', null,
  '{"tipo":"hidrante","diametro_mm":100,"caudal":"bueno"}', 37.2311, -3.6311, pg_temp.foto(), null) $$,
  'FOTO_SITIO_OBLIGATORIA%', 'alta con la firma nueva sin foto del sitio: FOTO_SITIO_OBLIGATORIA');
select throws_like($$ select pg_temp.proponer('sitio-ubic-sin', 'ubicacion', '00000000-0000-4000-8000-0000000e3151',
  '{}', 37.2302, -3.6302, pg_temp.foto(), null) $$,
  'FOTO_SITIO_OBLIGATORIA%', 'corregir ubicación sin foto del sitio: FOTO_SITIO_OBLIGATORIA');
select throws_like($$ select pg_temp.proponer('sitio-rev', 'revision', '00000000-0000-4000-8000-0000000e3151',
  '{}', null, null, pg_temp.foto(), pg_temp.foto()) $$,
  'PAYLOAD_INVALIDO(foto_sitio_path)%', 'revisión con foto del sitio: PAYLOAD_INVALIDO(foto_sitio_path)');
select throws_like($$ select pg_temp.proponer('sitio-est', 'estado', '00000000-0000-4000-8000-0000000e3151',
  '{"caudal":"malo"}', null, null, pg_temp.foto(), pg_temp.foto()) $$,
  'PAYLOAD_INVALIDO(foto_sitio_path)%', 'cambio de estado con foto del sitio: PAYLOAD_INVALIDO(foto_sitio_path)');
select set_config('test.misma', pg_temp.foto(), true);
select throws_like($$ select pg_temp.proponer('sitio-misma', 'alta', null,
  '{"tipo":"hidrante","diametro_mm":100,"caudal":"bueno"}', 37.2311, -3.6311,
  current_setting('test.misma'), current_setting('test.misma')) $$,
  'PAYLOAD_INVALIDO(foto_sitio_path)%', 'la foto del sitio no puede ser la misma que la de la conexión');
select set_config('test.ajena', hidrantes.fn_reservar_subida(current_setting('test.token_b')), true);
select throws_like($$ select pg_temp.proponer('sitio-ajena', 'alta', null,
  '{"tipo":"hidrante","diametro_mm":100,"caudal":"bueno"}', 37.2311, -3.6311, pg_temp.foto(), current_setting('test.ajena')) $$,
  'FOTO_NO_RESERVADA%', 'una foto del sitio reservada por otro móvil: FOTO_NO_RESERVADA');

-- ---------- alta con las dos ----------
select set_config('test.sitio1', pg_temp.foto(), true);
select set_config('test.alta', pg_temp.proponer('sitio-alta-01', 'alta', null,
  '{"tipo":"hidrante","diametro_mm":100,"caudal":"bueno"}', 37.2321, -3.6321, pg_temp.foto(),
  current_setting('test.sitio1'))::text, true);
select ok((select confirmada_en is not null from hidrantes.subidas where foto_path = current_setting('test.sitio1')),
  'la reserva de la foto del sitio queda confirmada');
select is((select foto_sitio_path || '|' || sin_foto_sitio::text from hidrantes.v_cola_revision
            where id = current_setting('test.alta')::uuid),
  current_setting('test.sitio1') || '|false', 'la cola trae la foto del sitio, sin la señal');
select ok(current_setting('test.sitio1') in (select hidrantes.fn_fotos_referenciadas()),
  'la foto del sitio de una propuesta pendiente está entre las referenciadas');
select is(pg_temp.proponer('sitio-alta-01', 'alta', null, '{"tipo":"hidrante","diametro_mm":100,"caudal":"bueno"}',
  37.2321, -3.6321, 'fotos/otra.jpg', 'fotos/otra-sitio.jpg'), current_setting('test.alta')::uuid,
  'un reenvío con la misma clave_local por la firma nueva devuelve la misma propuesta');
select pg_temp.jefatura();
select set_config('test.punto', hidrantes.fn_aprobar(current_setting('test.alta')::uuid) ->> 'punto_id', true);
select is((select (foto_path is not null and foto_path <> foto_sitio_path)::text || '|' || foto_sitio_path
             from hidrantes.puntos where id = current_setting('test.punto')::uuid),
  'true|' || current_setting('test.sitio1'), 'aprobada: el punto tiene las dos fotos');
select is((select foto_sitio_path from hidrantes.v_puntos_activos where id = current_setting('test.punto')::uuid),
  current_setting('test.sitio1'), 'v_puntos_activos (lo que sincroniza el móvil) trae la foto del sitio');
select is(hidrantes.fn_ficha_punto(current_setting('test.token'), current_setting('test.punto')::uuid) ->> 'foto_sitio_path',
  current_setting('test.sitio1'), 'la ficha también');

-- ---------- la purga no la borra ----------
select ok(current_setting('test.sitio1') in (select hidrantes.fn_fotos_referenciadas()),
  'fn_fotos_referenciadas() contiene la foto del sitio de un punto');
select ok((hidrantes.fn_fotos_referenciadas_lista() -> 'fotos') ? 'fotos/s-sitio.jpg',
  'y fn_fotos_referenciadas_lista() también: la purga de los lunes no la borra');
-- Aunque la reserva ya sea vieja: lo que protege es el punto, no la reserva.
update hidrantes.subidas set reservada_en = now() - interval '60 days' where foto_path = current_setting('test.sitio1');
select ok((hidrantes.fn_fotos_referenciadas_lista() -> 'fotos') ? current_setting('test.sitio1'),
  'con la reserva caducada, la protege el punto');

-- Sin reserva que la proteja: solo la propuesta. Pendiente y aprobada, sí; rechazada, no.
insert into hidrantes.propuestas (id, operacion, datos, autor_nombre, autor_apellido, dispositivo_id, clave_local,
                                  origen_ubicacion, geom, foto_path, foto_sitio_path, estado, motivo_rechazo)
values ('00000000-0000-4000-8000-0000000e3171', 'alta', '{"tipo":"hidrante","diametro_mm":100,"caudal":"bueno"}',
        'Ana', 'Ruiz', gen_random_uuid(), 'sitio-purga-01', 'gps', 'SRID=4326;POINT(-3.6401 37.2401)',
        'fotos/p-pend.jpg', 'fotos/p-pend-sitio.jpg', 'pendiente', null),
       ('00000000-0000-4000-8000-0000000e3172', 'alta', '{"tipo":"hidrante","diametro_mm":100,"caudal":"bueno"}',
        'Ana', 'Ruiz', gen_random_uuid(), 'sitio-purga-02', 'gps', 'SRID=4326;POINT(-3.6411 37.2411)',
        'fotos/p-rech.jpg', 'fotos/p-rech-sitio.jpg', 'rechazada', 'Repetida'),
       ('00000000-0000-4000-8000-0000000e3173', 'alta', '{"tipo":"hidrante","diametro_mm":100,"caudal":"bueno"}',
        'Ana', 'Ruiz', gen_random_uuid(), 'sitio-purga-03', 'gps', 'SRID=4326;POINT(-3.6421 37.2421)',
        'fotos/p-apro.jpg', 'fotos/p-apro-sitio.jpg', 'aprobada', null);
select ok((hidrantes.fn_fotos_referenciadas_lista() -> 'fotos') ? 'fotos/p-pend-sitio.jpg'
          and 'fotos/p-pend-sitio.jpg' in (select hidrantes.fn_fotos_referenciadas()),
  'la foto del sitio de una propuesta pendiente, sin reserva, la protege la propuesta');
select ok((hidrantes.fn_fotos_referenciadas_lista() -> 'fotos') ? 'fotos/p-apro-sitio.jpg',
  'y la de una aprobada, también');
select ok(not ((hidrantes.fn_fotos_referenciadas_lista() -> 'fotos') ? 'fotos/p-rech-sitio.jpg'),
  'la de una propuesta rechazada, sin reserva ni punto, no se protege (la purga puede borrarla)');

-- ---------- firma de antes ----------
select set_config('test.vieja', pg_temp.proponer_vieja('sitio-vieja-01', 'alta', null,
  '{"tipo":"hidrante","diametro_mm":70,"caudal":"bueno"}', 37.2331, -3.6331, pg_temp.foto())::text, true);
select is((select estado::text || '|' || sin_foto_sitio::text from hidrantes.v_cola_revision
            where id = current_setting('test.vieja')::uuid),
  'pendiente|true', 'la firma de antes sin foto del sitio: aceptada y con la señal sin_foto_sitio');
select set_config('test.rev', pg_temp.proponer_vieja('sitio-vieja-rev', 'revision',
  '00000000-0000-4000-8000-0000000e3151', '{}', null, null, pg_temp.foto())::text, true);
select is((select sin_foto_sitio from hidrantes.v_cola_revision where id = current_setting('test.rev')::uuid),
  false, 'una revisión no la lleva, y no se señala');

-- ---------- ubicación ----------
select set_config('test.sitio2', pg_temp.foto(), true);
select set_config('test.ubic', pg_temp.proponer('sitio-ubic-01', 'ubicacion', '00000000-0000-4000-8000-0000000e3151',
  '{}', 37.2303, -3.6303, pg_temp.foto(), current_setting('test.sitio2'))::text, true);
select pg_temp.jefatura();
select hidrantes.fn_aprobar(current_setting('test.ubic')::uuid, null, true);
select is((select foto_sitio_path from hidrantes.puntos where id = '00000000-0000-4000-8000-0000000e3151'),
  current_setting('test.sitio2'), 'ubicación aprobada: la foto del sitio se sustituye');
select set_config('test.estado', pg_temp.proponer_vieja('sitio-estado-01', 'estado', '00000000-0000-4000-8000-0000000e3151',
  '{"caudal":"regular"}', null, null, pg_temp.foto())::text, true);
select pg_temp.jefatura();
select hidrantes.fn_aprobar(current_setting('test.estado')::uuid, null, true);
select is((select foto_sitio_path from hidrantes.puntos where id = '00000000-0000-4000-8000-0000000e3151'),
  current_setting('test.sitio2'), 'un cambio de estado aprobado no toca la foto del sitio');
select set_config('test.ubic2', pg_temp.proponer_vieja('sitio-ubic-02', 'ubicacion', '00000000-0000-4000-8000-0000000e3151',
  '{}', 37.2304, -3.6304, pg_temp.foto())::text, true);
select is((select sin_foto_sitio from hidrantes.v_cola_revision where id = current_setting('test.ubic2')::uuid), true,
  'una ubicación de la app anterior llega con la señal sin_foto_sitio');
select pg_temp.jefatura();
select hidrantes.fn_aprobar(current_setting('test.ubic2')::uuid, null, true);
select is((select foto_sitio_path from hidrantes.puntos where id = '00000000-0000-4000-8000-0000000e3151'),
  current_setting('test.sitio2'), 'una ubicación de la app anterior, sin foto del sitio, no borra la que había');

-- ---------- lote, jefatura y fusión ----------
select set_config('test.sitio3', pg_temp.foto(), true);
select set_config('test.alta_lote', pg_temp.proponer('sitio-lote-01', 'alta', null,
  '{"tipo":"hidrante","diametro_mm":70,"caudal":"bueno"}', 37.2351, -3.6351, pg_temp.foto(),
  current_setting('test.sitio3'))::text, true);
select pg_temp.jefatura();
select hidrantes.fn_aprobar_lote(array[current_setting('test.alta_lote')::uuid]);
select is((select p.foto_sitio_path from hidrantes.puntos p join hidrantes.propuestas r
             on p.id = (r.correcciones ->> 'punto_id')::uuid where r.id = current_setting('test.alta_lote')::uuid),
  current_setting('test.sitio3'), 'aprobada en lote: el punto también la tiene');
select pg_temp.jefatura();
select set_config('test.foto_admin', hidrantes.fn_reservar_subida_admin(), true);
select set_config('test.sitio_admin', hidrantes.fn_reservar_subida_admin(), true);
select set_config('test.alta_admin', (hidrantes.fn_proponer(null, 'sitio-admin-01', 'x', 'x', 'alta', null,
  '{"tipo":"hidrante","diametro_mm":100,"caudal":"bueno"}', 'gps', 37.2341, -3.6341, null, null, null, null, null,
  current_setting('test.foto_admin'), current_setting('test.sitio_admin')) ->> 'codigo'), true);
select is((select foto_sitio_path from hidrantes.puntos where codigo = current_setting('test.alta_admin')),
  current_setting('test.sitio_admin'), 'el alta directa de jefatura (FR-151) guarda la foto del sitio');

insert into hidrantes.propuestas (id, operacion, datos, autor_nombre, autor_apellido, dispositivo_id, clave_local,
                                  origen_ubicacion, geom, foto_path, foto_sitio_path)
values ('00000000-0000-4000-8000-0000000e3161', 'alta', '{"tipo":"hidrante","diametro_mm":100,"caudal":"bueno"}',
        'Ana', 'Ruiz', gen_random_uuid(), 'sitio-fusion-01', 'gps', 'SRID=4326;POINT(-3.6302 37.2302)',
        'fotos/s-fusion.jpg', 'fotos/s-fusion-sitio.jpg');
select hidrantes.fn_fusionar_con_existente('00000000-0000-4000-8000-0000000e3161', '00000000-0000-4000-8000-0000000e3151');
select is((select foto_sitio_path from hidrantes.puntos where id = '00000000-0000-4000-8000-0000000e3151'),
  'fotos/s-fusion-sitio.jpg', 'la fusión se queda con la foto del sitio de la propuesta, como con la de la conexión');

select ok((hidrantes.fn_exportar_inventario('{}') -> 0) ? 'foto_sitio_path',
  'la exportación trae la foto del sitio (FR-160)');

-- ---------- restricciones y tope de subidas ----------
select throws_ok($$ insert into hidrantes.propuestas (punto_id, operacion, datos, autor_nombre, autor_apellido,
                                                      dispositivo_id, clave_local, foto_path, foto_sitio_path)
                    values ('00000000-0000-4000-8000-0000000e3151', 'revision', '{}', 'Ana', 'Ruiz', gen_random_uuid(),
                            'sitio-check-01', 'fotos/c1.jpg', 'fotos/c2.jpg') $$,
  '23514', null, 'una revisión no puede guardar foto del sitio (restricción)');
select is(hidrantes.fn_config('max_subidas_dispositivo_dia', '0') #>> '{}', '80',
  'el tope diario de subidas de fábrica pasa de 40 a 80: un alta gasta dos');

select * from finish();
rollback;
