-- Fase 3 · RPC de voluntario: código, token, fotos, propuestas (05 §6.1; 11 §3; 09 Fase 3).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;

select plan(39);

-- ---------- datos de prueba ----------

insert into hidrantes.config (clave, valor, actualizado_por)
values ('codigo_acceso_hash', to_jsonb(extensions.crypt('482917', extensions.gen_salt('bf', 4))), 'test')
on conflict (clave) do update set valor = excluded.valor;
insert into hidrantes.puntos (id, codigo, tipo, geom, diametro_mm, caudal, racor, foto_path, municipio, fecha_ultima_revision,
                              actualizado_en)
values
  ('00000000-0000-4000-8000-00000000e001', 'HID-0500', 'hidrante',   'SRID=4326;POINT(-3.6100 37.2150)', 100, 'bueno', null,
   'fotos/p1.jpg', 'albolote', current_date, now() - interval '1 day'),
  ('00000000-0000-4000-8000-00000000e002', 'BOC-0500', 'boca_riego', 'SRID=4326;POINT(-3.6600 37.2400)', 45, 'regular', 'granada',
   'fotos/p2.jpg', 'albolote', current_date, now() - interval '1 day');

-- ---------- canje del código (11 §3) ----------

set local role anon;
select throws_ok($$ select * from hidrantes.fn_verificar_codigo('482917', gen_random_uuid(), 'x') $$,
  '42501', null, 'anon no puede llamar a fn_verificar_codigo (capa 5)');
reset role;
select set_config('request.jwt.claims', '{"role":"authenticated","email":"x@example.com","amr":[{"method":"oauth","timestamp":1}],"app_metadata":{"provider":"google","providers":["google"]}}', true);
set local role authenticated;
select throws_ok($$ select * from hidrantes.fn_verificar_codigo('482917', gen_random_uuid(), 'x') $$,
  '42501', null, 'authenticated tampoco');
reset role;
select set_config('request.jwt.claims', '', true);

set local role service_role;
select is((select error from hidrantes.fn_verificar_codigo('111111', 'aaaaaaaa-0000-4000-8000-000000000001', 'ip-a')),
  'CODIGO_INCORRECTO', 'código erróneo: rechazado');
select is((select count(*)::int from hidrantes.intentos_codigo where dispositivo_id = 'aaaaaaaa-0000-4000-8000-000000000001'
           and not exito), 1, 'el intento fallido queda anotado aunque se rechace');
select is((select error from hidrantes.fn_verificar_codigo('48291', 'aaaaaaaa-0000-4000-8000-000000000001', 'ip-a')),
  'CODIGO_INCORRECTO', 'código de 5 cifras: rechazado');

-- Token de un móvil A y de un móvil B
select set_config('test.token_a',
  (select token from hidrantes.fn_verificar_codigo('482917', 'aaaaaaaa-0000-4000-8000-00000000000a', 'ip-a')), true);
select set_config('test.token_b',
  (select token from hidrantes.fn_verificar_codigo('482917', 'bbbbbbbb-0000-4000-8000-00000000000b', 'ip-b')), true);
select ok(length(current_setting('test.token_a')) >= 40, 'código correcto: el móvil recibe un token de 32 bytes');
select isnt((select token_hash from hidrantes.dispositivos where dispositivo_id = 'aaaaaaaa-0000-4000-8000-00000000000a'),
  current_setting('test.token_a'), 'se guarda el hash del token, no el token');

-- 10 fallos de un mismo móvil: el 11.º intento se bloquea aunque el código sea bueno (FR-33)
select hidrantes.fn_verificar_codigo('000000', 'cccccccc-0000-4000-8000-00000000000c', 'ip-c-' || i) from generate_series(1, 10) i;
select is((select error from hidrantes.fn_verificar_codigo('482917', 'cccccccc-0000-4000-8000-00000000000c', 'ip-c-11')),
  'DEMASIADOS_INTENTOS', '11.º intento del mismo móvil en una hora: bloqueado');
-- 30 fallos desde una IP cambiando de uuid: bloqueada la IP
select hidrantes.fn_verificar_codigo('000000', gen_random_uuid(), 'ip-d') from generate_series(1, 30);
select is((select error from hidrantes.fn_verificar_codigo('482917', gen_random_uuid(), 'ip-d')),
  'DEMASIADOS_INTENTOS', 'misma IP con uuid nuevo en cada intento: bloqueada (capa 2)');
reset role;

-- ---------- token ----------

set local role anon;
select ok(jsonb_typeof(hidrantes.fn_listar_puntos(current_setting('test.token_a')) -> 'puntos') = 'array',
  'con token válido se listan los puntos');
select ok(hidrantes.fn_listar_puntos(current_setting('test.token_a')) ? 'config', 'la lista trae la config del mapa');
select throws_like($$ select hidrantes.fn_listar_puntos('inventado-inventado-inventado') $$,
  'TOKEN_INVALIDO%', 'token inventado: TOKEN_INVALIDO');
reset role;
update hidrantes.dispositivos set revocado_en = now() where dispositivo_id = 'bbbbbbbb-0000-4000-8000-00000000000b';
set local role anon;
select throws_like($$ select hidrantes.fn_listar_puntos(current_setting('test.token_b')) $$,
  'TOKEN_REVOCADO%', 'token revocado: rechazado');
reset role;
update hidrantes.dispositivos set revocado_en = null, ultimo_uso = now() - interval '400 days'
 where dispositivo_id = 'bbbbbbbb-0000-4000-8000-00000000000b';
set local role anon;
select throws_like($$ select hidrantes.fn_listar_puntos(current_setting('test.token_b')) $$,
  'TOKEN_CADUCADO%', 'token sin uso 400 días: caducado (TR-43)');
reset role;
update hidrantes.dispositivos set ultimo_uso = now() where dispositivo_id = 'bbbbbbbb-0000-4000-8000-00000000000b';

set local role anon;
select is(jsonb_array_length(hidrantes.fn_listar_puntos(current_setting('test.token_a'), now() + interval '1 day') -> 'puntos'),
  0, 'sincronización incremental: nada nuevo desde el futuro');
select ok(not (hidrantes.fn_ficha_punto(current_setting('test.token_a'), '00000000-0000-4000-8000-00000000e001')
               ?| array['autor_nombre', 'autor_apellido', 'revisada_por']),
  'la ficha no trae autores (FR-27)');
select throws_like($$ select hidrantes.fn_ficha_punto(current_setting('test.token_a'), gen_random_uuid()) $$,
  'PUNTO_NO_ENCONTRADO%', 'ficha de un punto inexistente');

-- ---------- fotos ----------

select throws_ok($$ select hidrantes.fn_reservar_subida(current_setting('test.token_a')) $$,
  '42501', null, 'anon no reserva subidas directamente (solo la Function)');
reset role;

set local role service_role;
select set_config('test.foto_a', hidrantes.fn_reservar_subida(current_setting('test.token_a')), true);
select set_config('test.foto_b', hidrantes.fn_reservar_subida(current_setting('test.token_b')), true);
select matches(current_setting('test.foto_a'), '^fotos/[0-9a-f-]{36}\.jpg$', 'el servidor asigna el nombre de la foto');
select hidrantes.fn_reservar_subida(current_setting('test.token_a')) from generate_series(2, 40);
select throws_like($$ select hidrantes.fn_reservar_subida(current_setting('test.token_a')) $$,
  'CUOTA_SUBIDAS_AGOTADA%', 'la reserva 41 del día: rechazada (TR-45)');
reset role;

-- ---------- propuestas ----------

set local role anon;
create temp table llamada (sql text);
select throws_like($$ select hidrantes.fn_proponer(current_setting('test.token_a'), 'clave-sin-foto', 'Ana', 'Pérez', 'alta',
    null, '{"tipo":"hidrante","diametro_mm":100,"caudal":"bueno"}', 'gps', 37.2152, -3.6102, null, null, null, null, null, null) $$,
  'FOTO_OBLIGATORIA%', 'alta sin foto: FOTO_OBLIGATORIA');
select throws_like($$ select hidrantes.fn_proponer(current_setting('test.token_a'), 'clave-foto-ajena', 'Ana', 'Pérez', 'alta',
    null, '{"tipo":"hidrante","diametro_mm":100,"caudal":"bueno"}', 'gps', 37.2152, -3.6102, null, null, null, null, null,
    current_setting('test.foto_b')) $$,
  'FOTO_NO_RESERVADA%', 'foto reservada por otro móvil: rechazada');
select throws_like($$ select hidrantes.fn_proponer(current_setting('test.token_a'), 'clave-racor', 'Ana', 'Pérez', 'alta',
    null, '{"tipo":"hidrante","diametro_mm":100,"caudal":"bueno","racor":"granada"}', 'gps', 37.2152, -3.6102,
    null, null, null, null, null, current_setting('test.foto_a')) $$,
  'PAYLOAD_INVALIDO(racor)%', 'hidrante con racor: PAYLOAD_INVALIDO(racor)');
select throws_like($$ select hidrantes.fn_proponer(current_setting('test.token_a'), 'clave-extra', 'Ana', 'Pérez', 'revision',
    '00000000-0000-4000-8000-00000000e001', '{"caudal":"malo"}', null, null, null,
    null, null, null, null, null, current_setting('test.foto_a')) $$,
  'PAYLOAD_INVALIDO(caudal)%', 'revisión con campos que no son suyos: rechazada');
select throws_like($$ select hidrantes.fn_proponer(current_setting('test.token_a'), 'clave-fallo', 'Ana', 'Pérez', 'estado',
    '00000000-0000-4000-8000-00000000e001', '{"caudal":"no_funciona"}', null, null, null,
    null, null, null, null, null, current_setting('test.foto_a')) $$,
  'PAYLOAD_INVALIDO(descripcion_fallo)%', 'no funciona sin descripción: rechazado (FR-19)');

-- Datos en una zona sin puntos del seed de staging, para no depender de él.
-- Alta a ~5 m del hidrante HID-0500: posible duplicado del mismo tipo
select set_config('test.alta', hidrantes.fn_proponer(current_setting('test.token_a'), 'clave-alta-1', 'Ana', 'Pérez', 'alta',
    null, '{"tipo":"hidrante","diametro_mm":100,"caudal":"bueno"}', 'gps', 37.21504, -3.61002, 37.2151, -3.6100, 5, null, null,
    current_setting('test.foto_a'))::text, true);
select is(current_setting('test.alta')::jsonb ->> 'estado', 'pendiente', 'alta válida: pendiente de jefatura');
select is(hidrantes.fn_proponer(current_setting('test.token_a'), 'clave-alta-1', 'Ana', 'Pérez', 'alta',
    null, '{"tipo":"hidrante","diametro_mm":100,"caudal":"bueno"}', 'gps', 37.21504, -3.61002, 37.2151, -3.6100, 5, null, null,
    current_setting('test.foto_a')) ->> 'propuesta_id',
  current_setting('test.alta')::jsonb ->> 'propuesta_id', 'reenvío con la misma clave_local: devuelve la misma propuesta');
reset role;
select is((select count(*)::int from hidrantes.propuestas where clave_local = 'clave-alta-1'), 1,
  'clave_local repetida: una sola propuesta (FR-49)');
select is((select duplicado_de from hidrantes.propuestas where clave_local = 'clave-alta-1'),
  '00000000-0000-4000-8000-00000000e001'::uuid, 'alta junto a un hidrante: marcada como posible duplicado');
select ok((select distancia_gps_m < 10 from hidrantes.propuestas where clave_local = 'clave-alta-1'),
  'se calcula la distancia entre el pin y el GPS (FR-13)');

-- Una boca de riego en el mismo sitio no es duplicado de un hidrante (FR-51)
set local role service_role;
select set_config('test.foto_c', hidrantes.fn_reservar_subida(current_setting('test.token_b')), true);
reset role;
set local role anon;
select hidrantes.fn_proponer(current_setting('test.token_b'), 'clave-boca-1', 'Luis', 'Gómez', 'alta',
    null, '{"tipo":"boca_riego","caudal":"bueno","racor":"barcelona"}', 'manual', 37.21504, -3.61002, null, null, null,
    null, null, current_setting('test.foto_c'));
reset role;
select is((select duplicado_de from hidrantes.propuestas where clave_local = 'clave-boca-1'), null::uuid,
  'duplicado solo del mismo tipo: una boca junto a un hidrante no lo es');

-- Mis propuestas: solo las propias, sin quién decidió
set local role anon;
select is((select count(*)::int from hidrantes.fn_mis_propuestas(current_setting('test.token_a'))), 1,
  'el móvil A ve su propuesta');
select is((select count(*)::int from hidrantes.fn_mis_propuestas(current_setting('test.token_b')) x
            where x ->> 'clave_local' = 'clave-alta-1'), 0,
  'fn_mis_propuestas con otro token no devuelve nada ajeno');
select ok(not exists (select 1 from hidrantes.fn_mis_propuestas(current_setting('test.token_a')) x
                      where x ? 'revisada_por' or x ? 'autor_nombre'),
  'Mis propuestas nunca trae quién decidió (FR-27)');

-- Retirar: solo las propias y solo pendientes (FR-48)
select throws_like($$ select hidrantes.fn_retirar_propuesta(current_setting('test.token_b'),
    (current_setting('test.alta')::jsonb ->> 'propuesta_id')::uuid) $$,
  'PROPUESTA_AJENA%', 'retirar la propuesta de otro móvil: PROPUESTA_AJENA');
select lives_ok($$ select hidrantes.fn_retirar_propuesta(current_setting('test.token_a'),
    (current_setting('test.alta')::jsonb ->> 'propuesta_id')::uuid) $$, 'retirar la propia pendiente');
select throws_like($$ select hidrantes.fn_retirar_propuesta(current_setting('test.token_a'),
    (current_setting('test.alta')::jsonb ->> 'propuesta_id')::uuid) $$,
  'PROPUESTA_NO_PENDIENTE%', 'retirarla otra vez: ya no está pendiente');

-- Errores del cliente: nunca falla hacia el cliente
select lives_ok($$ select hidrantes.fn_registrar_error(null, repeat('x', 5000), repeat('y', 10000), '/mapa', 'test') $$,
  'fn_registrar_error acepta y recorta sin fallar');

-- Jefatura no es cosa de anon
select throws_ok($$ select hidrantes.fn_aprobar(gen_random_uuid()) $$, '42501', null, 'anon no puede aprobar');
reset role;

select * from finish();
rollback;
