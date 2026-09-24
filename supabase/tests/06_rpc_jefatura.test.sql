-- Fase 3 · RPC de jefatura: aprobar, corregir, rechazar, fusionar, lote, inventario, ajustes
-- (05 §6.2; FR-106–FR-151; 09 Fase 3, criterio de salida).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;

select plan(45);

-- ---------- datos de prueba ----------

insert into hidrantes.administradores (email, creado_por) values ('jefa@example.com', 'test');
insert into hidrantes.limite_municipal (municipio, geom, version) values
  ('albolote', 'SRID=4326;MULTIPOLYGON(((-3.70 37.20,-3.60 37.20,-3.60 37.30,-3.70 37.30,-3.70 37.20)))', 'test')
on conflict (municipio) do update set geom = excluded.geom;
insert into hidrantes.nucleos (nombre, municipio, geom, version) values
  ('Núcleo test', 'albolote', 'SRID=4326;POINT(-3.6569 37.2308)', 'test')
on conflict (nombre) do nothing;
insert into hidrantes.puntos (id, codigo, tipo, geom, diametro_mm, caudal, racor, foto_path, municipio, nucleo,
                              fecha_ultima_revision, actualizado_en)
values
  ('00000000-0000-4000-8000-00000000f001', 'HID-0600', 'hidrante', 'SRID=4326;POINT(-3.6569 37.2308)', 100, 'bueno', null,
   'fotos/f1.jpg', 'albolote', 'Núcleo test', current_date - 400, now() - interval '5 days'),
  ('00000000-0000-4000-8000-00000000f002', 'HID-0601', 'hidrante', 'SRID=4326;POINT(-3.6500 37.2400)', 70, 'regular', null,
   'fotos/f2.jpg', 'albolote', 'Núcleo test', current_date - 30, now() - interval '5 days'),
  ('00000000-0000-4000-8000-00000000f003', 'BOC-0600', 'boca_riego', 'SRID=4326;POINT(-3.6400 37.2500)', 45, 'bueno', 'granada',
   'fotos/f3.jpg', 'albolote', 'Núcleo test', current_date - 30, now() - interval '5 days');

-- Propuestas de un voluntario (dispositivo V)
create function pg_temp.propuesta(id uuid, punto uuid, op text, datos jsonb, lat float8 default null,
                                  lng float8 default null, creada timestamptz default now() - interval '1 hour',
                                  dir text default null) returns void language sql as $$
  insert into hidrantes.propuestas (id, punto_id, operacion, datos, autor_nombre, autor_apellido, dispositivo_id,
                                    clave_local, origen_ubicacion, geom, foto_path, creada_en, direccion_sugerida)
  values (id, punto, op::hidrantes.operacion, datos, 'Ana', 'Pérez', 'dddddddd-0000-4000-8000-00000000000d',
          'j-' || id, case when lat is not null then 'gps'::hidrantes.origen_ubicacion end,
          case when lat is not null then extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography end,
          'fotos/prop-' || id || '.jpg', creada, dir);
$$;

select pg_temp.propuesta('00000000-0000-4000-8000-0000000a0001', null, 'alta',
  '{"tipo":"hidrante","diametro_mm":100,"caudal":"bueno"}', 37.2350, -3.6550, dir => 'Calle Real 14, Albolote');
select pg_temp.propuesta('00000000-0000-4000-8000-0000000a0002', null, 'alta',
  '{"tipo":"hidrante","diametro_otro":80,"caudal":"bueno"}', 37.2360, -3.6560);
select pg_temp.propuesta('00000000-0000-4000-8000-0000000a0003', '00000000-0000-4000-8000-00000000f001', 'estado',
  '{"caudal":"malo"}');
select pg_temp.propuesta('00000000-0000-4000-8000-0000000a0004', '00000000-0000-4000-8000-00000000f001', 'revision', '{}');
-- desactualizada: creada antes del último cambio del punto
select pg_temp.propuesta('00000000-0000-4000-8000-0000000a0005', '00000000-0000-4000-8000-00000000f002', 'revision', '{}',
  creada => now() - interval '10 days');
select pg_temp.propuesta('00000000-0000-4000-8000-0000000a0006', '00000000-0000-4000-8000-00000000f003', 'datos',
  '{"racor":"barcelona"}');
select pg_temp.propuesta('00000000-0000-4000-8000-0000000a0007', null, 'alta',
  '{"tipo":"hidrante","diametro_mm":70,"caudal":"malo"}', 37.23082, -3.65692);
select pg_temp.propuesta('00000000-0000-4000-8000-0000000a0008', '00000000-0000-4000-8000-00000000f002', 'ubicacion', '{}',
  37.2401, -3.6500);
select pg_temp.propuesta('00000000-0000-4000-8000-0000000a0009', null, 'alta',
  '{"tipo":"boca_riego","caudal":"bueno","racor":"otro"}', 37.2500, -3.6400);

-- ---------- no administrador ----------

select set_config('request.jwt.claims', '{"role":"authenticated","email":"cualquiera@example.com","amr":[{"method":"oauth","timestamp":1}],"app_metadata":{"provider":"google","providers":["google"]}}', true);
set local role authenticated;
select throws_like($$ select hidrantes.fn_aprobar('00000000-0000-4000-8000-0000000a0001') $$,
  'NO_AUTORIZADO%', 'un no administrador no aprueba');
select throws_like($$ select hidrantes.fn_salud() $$, 'NO_AUTORIZADO%', 'ni ve la salud del sistema');
reset role;

-- ---------- administrador ----------

select set_config('request.jwt.claims', '{"role":"authenticated","email":"jefa@example.com","amr":[{"method":"oauth","timestamp":1}],"app_metadata":{"provider":"google","providers":["google"]}}', true);
set local role authenticated;

-- alta → aprobación → punto visible con dirección (FR-15, FR-24)
select set_config('test.alta', hidrantes.fn_aprobar('00000000-0000-4000-8000-0000000a0001')::text, true);
select matches(current_setting('test.alta')::jsonb ->> 'codigo', '^HID-[0-9]{4}$', 'el alta aprobada recibe código HID-####');
select is((select direccion from hidrantes.v_puntos_activos where codigo = current_setting('test.alta')::jsonb ->> 'codigo'),
  'Calle Real 14, Albolote', 'el punto aprobado sale en el mapa con la dirección deducida');
select is((select nucleo from hidrantes.puntos where codigo = current_setting('test.alta')::jsonb ->> 'codigo'),
  'Núcleo test', 'municipio y núcleo deducidos (FR-14)');
select is((select fecha_ultima_revision from hidrantes.puntos where codigo = current_setting('test.alta')::jsonb ->> 'codigo'),
  current_date, 'fecha de revisión = hoy');
select is((select estado::text from hidrantes.propuestas where id = '00000000-0000-4000-8000-0000000a0001'), 'aprobada',
  'la propuesta queda aprobada');
select is((select revisada_por from hidrantes.propuestas where id = '00000000-0000-4000-8000-0000000a0001'), 'jefa@example.com',
  'con quién la aprobó');
select throws_like($$ select hidrantes.fn_aprobar('00000000-0000-4000-8000-0000000a0001') $$,
  'PROPUESTA_NO_PENDIENTE%', 'aprobarla dos veces: PROPUESTA_NO_PENDIENTE');

-- otra medida sin fijar (FR-17)
select throws_like($$ select hidrantes.fn_aprobar('00000000-0000-4000-8000-0000000a0002') $$,
  'DIAMETRO_SIN_FIJAR%', 'alta con "otra medida" sin corregir: DIAMETRO_SIN_FIJAR');
select lives_ok($$ select hidrantes.fn_aprobar('00000000-0000-4000-8000-0000000a0002', '{"diametro_mm":70}') $$,
  'jefatura fija 70 mm y aprueba');

-- aprobación con correcciones (FR-106)
select lives_ok($$ select hidrantes.fn_aprobar('00000000-0000-4000-8000-0000000a0003',
  '{"caudal":"no_funciona","descripcion_fallo":"Válvula rota"}') $$, 'aprobar con correcciones');
select is((select caudal::text || ' · ' || descripcion_fallo from hidrantes.puntos where codigo = 'HID-0600'),
  'no_funciona · Válvula rota', 'el punto toma el valor corregido');
select is((select correcciones ->> 'caudal' from hidrantes.propuestas where id = '00000000-0000-4000-8000-0000000a0003'),
  'no_funciona', 'la corrección queda guardada para el autor (FR-91)');
select ok(exists (select 1 from hidrantes.registro where propuesta_id = '00000000-0000-4000-8000-0000000a0003'
                    and accion = 'aprobacion_con_correcciones'), 'registro: aprobacion_con_correcciones');
select throws_like($$ select hidrantes.fn_aprobar('00000000-0000-4000-8000-0000000a0004', '{"caudal":"no_funciona","descripcion_fallo":""}') $$,
  'PROPUESTA_DESACTUALIZADA%', 'tras cambiar el punto, otra propuesta sobre él queda desactualizada (FR-108)');

-- corrección que rompería las reglas del punto
select throws_like($$ select hidrantes.fn_aprobar('00000000-0000-4000-8000-0000000a0006', '{"racor":"inventado"}') $$,
  'PAYLOAD_INVALIDO%', 'corrección con un valor fuera de la lista: rechazada');

-- rechazo (FR-106)
select throws_like($$ select hidrantes.fn_rechazar('00000000-0000-4000-8000-0000000a0006', '   ') $$,
  'MOTIVO_OBLIGATORIO%', 'rechazo sin motivo: rechazado');
select lives_ok($$ select hidrantes.fn_rechazar('00000000-0000-4000-8000-0000000a0006', 'El racor de la foto es Granada') $$,
  'rechazo con motivo');
select is((select motivo_rechazo from hidrantes.propuestas where id = '00000000-0000-4000-8000-0000000a0006'),
  'El racor de la foto es Granada', 'el motivo queda para el autor');

-- lote con una desactualizada: aprueba las demás (FR-107)
select results_eq(
  $$ select propuesta_id, resultado, coalesce(motivo, '') from hidrantes.fn_aprobar_lote(array[
       '00000000-0000-4000-8000-0000000a0005', '00000000-0000-4000-8000-0000000a0008']::uuid[]) order by 1 $$,
  $$ values ('00000000-0000-4000-8000-0000000a0005'::uuid, 'omitida', 'PROPUESTA_DESACTUALIZADA'),
            ('00000000-0000-4000-8000-0000000a0008'::uuid, 'aprobada', '') $$,
  'fn_aprobar_lote con una desactualizada aprueba las demás e indica cuál y por qué');
select ok((select desplazamiento from (select (despues ->> 'desplazamiento_m')::numeric as desplazamiento
           from hidrantes.registro where propuesta_id = '00000000-0000-4000-8000-0000000a0008') d) between 10 and 13,
  'corregir ubicación guarda el desplazamiento (~11 m, FR-45)');
select lives_ok($$ select hidrantes.fn_aprobar('00000000-0000-4000-8000-0000000a0005', null, true) $$,
  'la desactualizada se aprueba con confirmación expresa');

-- fusión (FR-51, FR-106)
select throws_like($$ select hidrantes.fn_fusionar_con_existente('00000000-0000-4000-8000-0000000a0009',
  '00000000-0000-4000-8000-00000000f002') $$, 'TIPO_DISTINTO%', 'no se fusiona una boca con un hidrante');
select lives_ok($$ select hidrantes.fn_fusionar_con_existente('00000000-0000-4000-8000-0000000a0007',
  '00000000-0000-4000-8000-00000000f001', '{"caudal":"propuesta"}') $$, 'fusionar un alta con el existente');
select is((select caudal::text || ' · ' || foto_path from hidrantes.puntos where codigo = 'HID-0600'),
  'malo · fotos/prop-00000000-0000-4000-8000-0000000a0007.jpg',
  'en la fusión prevalece lo elegido y la foto es la de la propuesta');

-- inventario (FR-120, FR-124)
select lives_ok($$ select hidrantes.fn_editar_punto('00000000-0000-4000-8000-00000000f003', '{"direccion":"Plaza 1"}') $$,
  'editar la dirección desde el inventario');
select throws_like($$ select hidrantes.fn_editar_punto('00000000-0000-4000-8000-00000000f003', '{"geom":"x"}') $$,
  'PAYLOAD_INVALIDO(geom)%', 'editar un campo no editable: rechazado');
select throws_like($$ select hidrantes.fn_borrar_punto('00000000-0000-4000-8000-00000000f003', '') $$,
  'MOTIVO_OBLIGATORIO%', 'borrar sin motivo: rechazado');
select lives_ok($$ select hidrantes.fn_borrar_punto('00000000-0000-4000-8000-00000000f003', 'Registro duplicado') $$,
  'borrar a la papelera');
select is((select count(*)::int from hidrantes.v_puntos_activos where codigo = 'BOC-0600'), 0, 'en la papelera no sale en el mapa');
select lives_ok($$ select hidrantes.fn_restaurar_punto('00000000-0000-4000-8000-00000000f003') $$, 'restaurar desde la papelera');
reset role;
update hidrantes.puntos set situacion = 'borrado', borrado_en = now() - interval '40 days' where codigo = 'BOC-0600';
set local role authenticated;
select throws_like($$ select hidrantes.fn_restaurar_punto('00000000-0000-4000-8000-00000000f003') $$,
  'FUERA_DE_PLAZO_PAPELERA%', 'pasados 30 días no se restaura');
select is(hidrantes.fn_purgar_papelera(), 1, 'la purga borra lo que pasó el plazo');

-- jefatura desde el móvil: fn_proponer aplica al momento, sin cola (FR-151)
reset role;
insert into hidrantes.subidas (dispositivo_id, foto_path)
values (hidrantes.fn_dispositivo_admin('jefa@example.com'), 'fotos/admin-1.jpg');
set local role authenticated;
select is(hidrantes.fn_proponer(null, 'admin-clave-1', 'Jefa', 'Test', 'estado', '00000000-0000-4000-8000-00000000f002',
    '{"caudal":"bueno"}', null, null, null, null, null, null, null, null, 'fotos/admin-1.jpg') ->> 'aplicada',
  'true', 'jefatura que propone: se aplica al momento');
select is((select caudal::text from hidrantes.puntos where codigo = 'HID-0601'), 'bueno', 'el cambio ya está en el punto');
select ok(exists (select 1 from hidrantes.registro where es_admin and actor = 'jefa@example.com' and accion = 'propuesta_creada'),
  'queda en el registro como acción de administrador');

-- código de acceso (FR-34, FR-140)
select throws_like($$ select hidrantes.fn_cambiar_codigo_acceso('12ab56', false) $$, 'CODIGO_FORMATO%', 'código con letras: rechazado');
reset role;
insert into hidrantes.dispositivos (dispositivo_id, token_hash) values (gen_random_uuid(), 'h1'), (gen_random_uuid(), 'h2');
set local role authenticated;
select lives_ok($$ select hidrantes.fn_cambiar_codigo_acceso('654321', true) $$, 'cambiar el código revocando dispositivos');
reset role;
select is((select count(*)::int from hidrantes.dispositivos where revocado_en is null), 0,
  'fn_cambiar_codigo_acceso(…, true) revoca todos los tokens');
select ok(not exists (select 1 from hidrantes.registro where despues::text like '%654321%'), 'el código nunca va al registro');
set local role authenticated;

-- administradores y parámetros (FR-141, FR-142)
reset role;
-- que jefa sea la única activa, haya o no seed de staging
update hidrantes.administradores set activo = false where email <> 'jefa@example.com';
set local role authenticated;
select throws_like($$ select hidrantes.fn_gestionar_administrador('jefa@example.com', false) $$,
  'ULTIMO_ADMINISTRADOR%', 'no se desactiva al último administrador activo');
select throws_like($$ select hidrantes.fn_guardar_config('{"meses_revision": 0}') $$,
  'CONFIG_INVALIDA(meses_revision)%', 'parámetro fuera de rango: rechazado');
select throws_like($$ select hidrantes.fn_guardar_config('{"codigo_acceso_hash": "x"}') $$,
  'CONFIG_INVALIDA(codigo_acceso_hash)%', 'parámetro que no está en la lista blanca: rechazado');
select lives_ok($$ select hidrantes.fn_guardar_config('{"meses_revision": 18, "escala_radios": [12, 10, 8, 6, 5]}') $$,
  'guardar parámetros válidos');
reset role;

select * from finish();
rollback;
