-- docs/31 (0040): retirado que sigue retirado (RV-145), pedidos de trabajo (RV-146), purga del alta y
-- sus fotos (RV-147), restos de incidencias y errores por IP (RV-148), cerrar sesión (RV-158), aviso
-- perdido que suma un fallo (RV-144) y fn_novedades sin authenticated (RV-149). Todo dentro de una
-- transacción que se deshace.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;

select plan(47);

insert into hidrantes.config (clave, valor, actualizado_por)
values ('codigo_acceso_hash', to_jsonb(extensions.crypt('482917', extensions.gen_salt('bf', 4))), 'test')
on conflict (clave) do update set valor = excluded.valor;
insert into hidrantes.administradores (email, creado_por) values ('jefa36@example.com', 'test') on conflict do nothing;

create function pg_temp.jefatura() returns void language sql as $$
  select set_config('request.jwt.claims',
    '{"role":"authenticated","email":"jefa36@example.com","amr":[{"method":"oauth","timestamp":1}],"app_metadata":{"provider":"google","providers":["google"]}}',
    true);
$$;
create function pg_temp.voluntario() returns void language sql as $$
  select set_config('request.jwt.claims', '', true);
$$;

insert into hidrantes.puntos (id, codigo, tipo, geom, diametro_mm, caudal, foto_path, municipio, fecha_ultima_revision)
values
  ('00000000-0000-4000-8000-0000000e3601', 'HID-8801', 'hidrante', 'SRID=4326;POINT(-3.6569 37.2308)', 100, 'bueno',
   'fotos/p36-1.jpg', 'albolote', current_date),
  ('00000000-0000-4000-8000-0000000e3602', 'HID-8802', 'hidrante', 'SRID=4326;POINT(-3.6560 37.2310)', 100, 'bueno',
   'fotos/p36-2.jpg', 'albolote', current_date);

-- ---------- RV-145: un retirado no vuelve como activo ----------

select pg_temp.jefatura();
select hidrantes.fn_retirar_punto('00000000-0000-4000-8000-0000000e3601', 'obras');
select hidrantes.fn_borrar_punto('00000000-0000-4000-8000-0000000e3601', 'repetido');
select hidrantes.fn_restaurar_punto('00000000-0000-4000-8000-0000000e3601');
select is((select situacion::text from hidrantes.puntos where id = '00000000-0000-4000-8000-0000000e3601'), 'retirado',
  'retirar, borrar y restaurar deja el punto retirado (sobre develop: activo)');
select is((select borrado_en from hidrantes.puntos where id = '00000000-0000-4000-8000-0000000e3601'), null,
  'y sin fecha de borrado');
select is((select despues ->> 'situacion' from hidrantes.registro
            where punto_id = '00000000-0000-4000-8000-0000000e3601' and accion = 'restauracion' order by id desc limit 1),
  'retirado', 'el registro de la restauración dice a qué situación vuelve');
select hidrantes.fn_borrar_punto('00000000-0000-4000-8000-0000000e3602', 'repetido');
select hidrantes.fn_restaurar_punto('00000000-0000-4000-8000-0000000e3602');
select is((select situacion::text from hidrantes.puntos where id = '00000000-0000-4000-8000-0000000e3602'), 'activo',
  'un activo borrado y restaurado vuelve activo');

-- ---------- RV-146: pedidos de trabajo ----------

select set_config('test.pedido', hidrantes.fn_pedir_trabajo('respaldo') ->> 'pedido_id', true);
select ok(current_setting('test.pedido')::bigint > 0, 'fn_pedir_trabajo devuelve el id del pedido');
select throws_like($$ select hidrantes.fn_pedir_trabajo('respaldo') $$, 'YA_PEDIDO%',
  'un segundo pedido del mismo trabajo, pendiente el primero: YA_PEDIDO');
select throws_like($$ select hidrantes.fn_pedir_trabajo('borrar-todo') $$, 'PAYLOAD_INVALIDO(workflow)%',
  'un trabajo fuera de la lista: PAYLOAD_INVALIDO(workflow)');
select is((select despues ->> 'pedido_id' from hidrantes.registro where accion = 'workflow_lanzado' order by id desc limit 1),
  current_setting('test.pedido'), 'queda en el registro como workflow_lanzado, con el pedido');
select is((select pedido_por from hidrantes.pedidos_trabajo where id = current_setting('test.pedido')::bigint),
  'jefa36@example.com', 'y en el pedido, quién lo pidió');
select pg_temp.voluntario();
select throws_like($$ select hidrantes.fn_pedir_trabajo('respaldo') $$, 'NO_AUTORIZADO%',
  'sin sesión de jefatura: NO_AUTORIZADO');

set local role service_role;
select ok(hidrantes.fn_pedidos_pendientes() @> jsonb_build_array(jsonb_build_object('id', current_setting('test.pedido')::bigint,
                                                                                     'workflow', 'respaldo')),
  'fn_pedidos_pendientes lo trae');
select lives_ok($$ select hidrantes.fn_marcar_pedido(current_setting('test.pedido')::bigint, 'lanzado') $$,
  'fn_marcar_pedido lo marca como lanzado');
select throws_like($$ select hidrantes.fn_marcar_pedido(current_setting('test.pedido')::bigint, 'error: GitHub 422') $$,
  'PEDIDO_NO_PENDIENTE%', 'marcarlo otra vez: PEDIDO_NO_PENDIENTE');
select throws_like($$ select hidrantes.fn_marcar_pedido(current_setting('test.pedido')::bigint, '  ') $$,
  'PAYLOAD_INVALIDO(resultado)%', 'sin resultado: PAYLOAD_INVALIDO(resultado)');
select ok(not hidrantes.fn_pedidos_pendientes() @> jsonb_build_array(jsonb_build_object('id', current_setting('test.pedido')::bigint)),
  'ya no está pendiente');
reset role;
select pg_temp.jefatura();
select set_config('test.pedido2', hidrantes.fn_pedir_trabajo('respaldo') ->> 'pedido_id', true);
select isnt(current_setting('test.pedido2'), current_setting('test.pedido'), 'y se puede volver a pedir');
select pg_temp.voluntario();
set local role service_role;
select hidrantes.fn_marcar_pedido(current_setting('test.pedido2')::bigint, 'error: GitHub 422');
reset role;
select is((select resultado from hidrantes.pedidos_trabajo where id = current_setting('test.pedido2')::bigint),
  'error: GitHub 422', 'un despacho fallido queda marcado con su motivo');

set local role anon;
select throws_ok($$ select hidrantes.fn_pedir_trabajo('respaldo') $$, '42501', null, 'anon no ejecuta fn_pedir_trabajo');
select throws_ok($$ select * from hidrantes.pedidos_trabajo $$, '42501', null, 'ni lee pedidos_trabajo');
reset role;
set local role authenticated;
select throws_ok($$ select hidrantes.fn_pedidos_pendientes() $$, '42501', null, 'authenticated no ejecuta fn_pedidos_pendientes');
select throws_ok($$ select hidrantes.fn_marcar_pedido(1, 'lanzado') $$, '42501', null, 'ni fn_marcar_pedido');
reset role;

-- ---------- RV-147: la purga se lleva el alta y sus fotos ----------

insert into hidrantes.propuestas (id, operacion, datos, autor_nombre, autor_apellido, dispositivo_id, clave_local,
                                  foto_path, foto_sitio_path, geom, origen_ubicacion)
values
  ('00000000-0000-4000-8000-0000000e3611', 'alta', '{"tipo":"hidrante","diametro_mm":100,"caudal":"bueno"}', 'Ana', 'Ruiz',
   'aaaaaaaa-0000-4000-8000-0000000e3601', 'purga36-alta', 'fotos/alta36.jpg', 'fotos/alta36-sitio.jpg',
   'SRID=4326;POINT(-3.6450 37.2400)', 'gps'),
  ('00000000-0000-4000-8000-0000000e3612', 'alta', '{"tipo":"hidrante","diametro_mm":100,"caudal":"bueno"}', 'Bea', 'Gil',
   'bbbbbbbb-0000-4000-8000-0000000e3602', 'purga36-fusion', 'fotos/fusion36.jpg', 'fotos/fusion36-sitio.jpg',
   'SRID=4326;POINT(-3.6450 37.2400)', 'gps'),
  ('00000000-0000-4000-8000-0000000e3613', 'alta', '{"tipo":"hidrante","diametro_mm":100,"caudal":"bueno"}', 'Ciro', 'Paz',
   'cccccccc-0000-4000-8000-0000000e3603', 'purga36-otra', 'fotos/otra36.jpg', null,
   'SRID=4326;POINT(-3.6400 37.2450)', 'gps');
select pg_temp.jefatura();
select set_config('test.creado', hidrantes.fn_aprobar('00000000-0000-4000-8000-0000000e3611') ->> 'punto_id', true);
select hidrantes.fn_fusionar_con_existente('00000000-0000-4000-8000-0000000e3612', current_setting('test.creado')::uuid);
select hidrantes.fn_aprobar('00000000-0000-4000-8000-0000000e3613');
select hidrantes.fn_borrar_punto(current_setting('test.creado')::uuid, 'repetido');
update hidrantes.puntos set borrado_en = now() - interval '40 days' where id = current_setting('test.creado')::uuid;
select ok(hidrantes.fn_purgar_papelera_interna('test') >= 1, 'la purga se lleva el punto');
select is((select count(*)::int from hidrantes.propuestas
            where id in ('00000000-0000-4000-8000-0000000e3611', '00000000-0000-4000-8000-0000000e3612')), 0,
  'y también el alta que lo creó y la que se fusionó con él (sobre develop: se quedaban)');
select ok(not exists (select 1 from hidrantes.fn_fotos_referenciadas() f
                       where f in ('fotos/alta36.jpg', 'fotos/alta36-sitio.jpg', 'fotos/fusion36.jpg',
                                   'fotos/fusion36-sitio.jpg')),
  'sus fotos dejan de estar referenciadas');
select is((select count(*)::int from hidrantes.propuestas where id = '00000000-0000-4000-8000-0000000e3613'), 1,
  'el alta de otro punto se queda');
select ok('fotos/otra36.jpg' in (select hidrantes.fn_fotos_referenciadas()), 'con su foto');

-- ---------- RV-148: incidencias, salud y errores ----------

select pg_temp.voluntario();
set local role anon;
select throws_ok($$ select hidrantes.fn_reportar_incidencia('x', 'y', 'z', 'w') $$, '42501', null,
  'anon ya no ejecuta fn_reportar_incidencia');
reset role;
set local role authenticated;
select throws_ok($$ select hidrantes.fn_reportar_incidencia('x', 'y', 'z', 'w') $$, '42501', null,
  'authenticated tampoco');
select throws_ok($$ select hidrantes.fn_novedades() $$, '42501', null,
  'ni fn_novedades, obsoleta y sin fn_exigir_admin (RV-149)');
reset role;

select pg_temp.jefatura();
select ok(not hidrantes.fn_salud() ? 'incidencias_abiertas', 'fn_salud ya no trae incidencias_abiertas');
select ok(hidrantes.fn_salud() ? 'subidas_24h', 'y trae subidas_24h');
insert into hidrantes.subidas (dispositivo_id, foto_path) values
  ('aaaaaaaa-0000-4000-8000-0000000e3601', 'fotos/s36-1.jpg'), ('aaaaaaaa-0000-4000-8000-0000000e3601', 'fotos/s36-2.jpg');
update hidrantes.config set valor = to_jsonb((hidrantes.fn_salud() ->> 'subidas_24h')::int + 1) where clave = 'max_subidas_dia_total';
select set_config('test.topes', hidrantes.fn_salud() ->> 'topes_globales_24h', true);
update hidrantes.config set valor = to_jsonb((hidrantes.fn_salud() ->> 'subidas_24h')::int) where clave = 'max_subidas_dia_total';
select is((hidrantes.fn_salud() ->> 'topes_globales_24h')::int, current_setting('test.topes')::int + 1,
  'con el tope global de subidas lleno, topes_globales_24h suma uno');
select pg_temp.voluntario();

-- errores: 100 de una IP ya hoy; 500 sin IP ya hoy.
insert into hidrantes.errores_cliente (mensaje, ip_hash) select 'e', 'ip36-llena' from generate_series(1, 100);
insert into hidrantes.errores_cliente (mensaje, ip_hash) select 'e', null from generate_series(1, 500);
set local role service_role;
select hidrantes.fn_registrar_error(null, 'otro más', null, '/', 'x', 'ip36-llena');
select hidrantes.fn_registrar_error(null, 'de otra IP', null, '/', 'x', 'ip36-libre');
reset role;
select is((select count(*)::int from hidrantes.errores_cliente where ip_hash = 'ip36-llena'), 100,
  'una IP con 100 errores hoy no anota más (sobre develop: la firma con ip_hash no existe)');
select is((select count(*)::int from hidrantes.errores_cliente where ip_hash = 'ip36-libre'), 1, 'otra IP sí');
set local role anon;
select hidrantes.fn_registrar_error(gen_random_uuid(), 'sin IP', null, '/', 'x');
select throws_ok($$ select hidrantes.fn_registrar_error(null, 'x', null, '/', 'x', 'ip36-falsa') $$, '42501', null,
  'anon no ejecuta la firma con ip_hash');
reset role;
select is((select count(*)::int from hidrantes.errores_cliente where ip_hash is null and momento > now() - interval '1 day'
              and mensaje = 'sin IP'), 0,
  'por la firma anterior, con 500 sin IP hoy, no entra ninguno más aunque cambie de dispositivo_id');

-- ---------- RV-158: cerrar sesión ----------

select set_config('test.token',
  (select token from hidrantes.fn_verificar_codigo('482917', 'dddddddd-0000-4000-8000-0000000e3604', 'ip-36')), true);
insert into hidrantes.suscripciones_push (dispositivo_id, suscripcion, temas)
values ('dddddddd-0000-4000-8000-0000000e3604', '{"endpoint":"https://fcm.googleapis.com/fcm/send/c36","keys":{"p256dh":"p","auth":"a"}}',
        '{resultado_propuesta}');
set local role anon;
select lives_ok($$ select hidrantes.fn_cerrar_sesion(current_setting('test.token')) $$, 'anon cierra su sesión');
select throws_like($$ select hidrantes.fn_listar_puntos(current_setting('test.token')) $$, 'TOKEN_REVOCADO%',
  'y el token deja de valer');
select lives_ok($$ select hidrantes.fn_cerrar_sesion(current_setting('test.token')) $$, 'cerrarla dos veces no falla');
select lives_ok($$ select hidrantes.fn_cerrar_sesion('un-token-que-no-existe-en-ningun-sitio') $$,
  'ni con un token desconocido');
reset role;
select is((select count(*)::int from hidrantes.suscripciones_push where dispositivo_id = 'dddddddd-0000-4000-8000-0000000e3604'), 0,
  'y su suscripción push se borra');

-- ---------- RV-144: un aviso perdido suma un fallo ----------

insert into hidrantes.suscripciones_push (id, email, suscripcion, temas, fallos, ultimo_envio) values
  ('00000000-0000-4000-8000-0000000e3621', 'jefa36@example.com', '{"endpoint":"https://push.example.net/36a"}', '{}', 9, null),
  ('00000000-0000-4000-8000-0000000e3622', 'jefa36@example.com', '{"endpoint":"https://push.example.net/36b"}', '{}', 0, now());
insert into hidrantes.notificaciones (suscripcion_id, titulo, cuerpo, intentos, reclamada_en) values
  ('00000000-0000-4000-8000-0000000e3621', 'a', 'x', 3, now() - interval '16 minutes'),
  ('00000000-0000-4000-8000-0000000e3622', 'b', 'x', 3, now() - interval '16 minutes');
select count(*) from hidrantes.fn_reclamar_notificaciones(10);
select is((select fallos::int from hidrantes.suscripciones_push where id = '00000000-0000-4000-8000-0000000e3622'), 1,
  'un aviso dado por perdido suma un fallo a su suscripción');
select is((select count(*)::int from hidrantes.suscripciones_push where id = '00000000-0000-4000-8000-0000000e3621'), 0,
  'y con 10 fallos y ningún envío bueno, la suscripción se borra (regla de 0030)');

-- ---------- RV-167: apagar los avisos de jefatura sin tocar los del voluntario ----------

insert into hidrantes.suscripciones_push (dispositivo_id, email, suscripcion, temas) values
  (null, 'jefa36@example.com', '{"endpoint":"https://fcm.googleapis.com/fcm/send/compartido36"}', '{nuevas_propuestas}'),
  ('eeeeeeee-0000-4000-8000-0000000e3605', null, '{"endpoint":"https://fcm.googleapis.com/fcm/send/compartido36"}',
   '{resultado_propuesta}');
select pg_temp.jefatura();
select hidrantes.fn_borrar_suscripcion_push_admin('https://fcm.googleapis.com/fcm/send/compartido36');
select is((select array_agg(coalesce(dispositivo_id::text, 'jefatura')) from hidrantes.suscripciones_push
            where suscripcion ->> 'endpoint' = 'https://fcm.googleapis.com/fcm/send/compartido36'),
  array['eeeeeeee-0000-4000-8000-0000000e3605'],
  'fn_borrar_suscripcion_push_admin borra la de jefatura y deja la del voluntario del mismo navegador');
select lives_ok($$ select hidrantes.fn_borrar_suscripcion_push_admin('https://fcm.googleapis.com/fcm/send/compartido36') $$,
  'sin fila de jefatura, no hace nada');
select throws_like($$ select hidrantes.fn_borrar_suscripcion_push_admin('  ') $$, 'PAYLOAD_INVALIDO(endpoint)%',
  'sin endpoint: PAYLOAD_INVALIDO(endpoint)');
select ok(hidrantes.fn_salud() ? 'dispositivos_reservados_24h', 'fn_salud cuenta los canjes con id de jefatura');
select pg_temp.voluntario();

select * from finish();
rollback;
