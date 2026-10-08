-- docs/24 RV-102, DEC-145: estado "Barro" (sale agua con barro). No se puede usar: tamaño mínimo
-- del marcador, como "no funciona", pero sin descripción del fallo obligatoria. Cercanos (FR-74) se
-- calcula en el móvil y solo lista bueno y regular: su test es de vitest (incidente.test.ts).
-- Todo dentro de una transacción que se deshace.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;

select plan(15);

insert into hidrantes.config (clave, valor, actualizado_por)
values ('codigo_acceso_hash', to_jsonb(extensions.crypt('482917', extensions.gen_salt('bf', 4))), 'test')
on conflict (clave) do update set valor = excluded.valor;
insert into hidrantes.config (clave, valor, actualizado_por) values ('escala_radios', '[11, 9, 7, 5.5, 5]', 'test')
on conflict (clave) do update set valor = excluded.valor;
select set_config('test.token',
  (select token from hidrantes.fn_verificar_codigo('482917', 'dddddddd-0000-4000-8000-0000000e3001', 'ip-barro')), true);
-- Tokens de más de 24 h: el tope de un token nuevo (0041, docs/32 RV-221) se prueba en 37.
update hidrantes.dispositivos set emitido_en = now() - interval '2 days' where dispositivo_id in ('dddddddd-0000-4000-8000-0000000e3001');
insert into hidrantes.administradores (email, creado_por) values ('barro@example.com', 'test') on conflict do nothing;

create function pg_temp.proponer(clave text, op hidrantes.operacion, punto uuid, datos jsonb,
                                 lat double precision default null, lng double precision default null)
returns uuid language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  return (hidrantes.fn_proponer(current_setting('test.token'), clave, 'Ana', 'Ruiz', op, punto, datos,
            case when lat is not null then 'gps'::hidrantes.origen_ubicacion end, lat, lng,
            null, null, null, null, null, hidrantes.fn_reservar_subida(current_setting('test.token')))
          ->> 'propuesta_id')::uuid;
end $$;

create function pg_temp.jefatura() returns void language sql as $$
  select set_config('request.jwt.claims',
    '{"role":"authenticated","email":"barro@example.com","amr":[{"method":"oauth","timestamp":1}],"app_metadata":{"provider":"google","providers":["google"]}}',
    true);
$$;

-- ---------- el valor ----------
select is((select array_agg(e::text order by e) from unnest(enum_range(null::hidrantes.estado_caudal)) e),
  array['bueno', 'regular', 'malo', 'no_funciona', 'barro'], 'estado_caudal tiene "barro", después de no_funciona');

-- ---------- alta y estado sin descripción ----------
select set_config('test.alta', pg_temp.proponer('barro-alta-01', 'alta', null,
  '{"tipo":"hidrante","diametro_mm":100,"caudal":"barro"}', 37.2101, -3.6101)::text, true);
select is((select estado::text from hidrantes.propuestas where id = current_setting('test.alta')::uuid), 'pendiente',
  'alta con barro sin descripción del fallo: aceptada');
select pg_temp.jefatura();
select set_config('test.punto', hidrantes.fn_aprobar(current_setting('test.alta')::uuid) ->> 'punto_id', true);
select is((select caudal::text from hidrantes.puntos where id = current_setting('test.punto')::uuid), 'barro',
  'y aprobada, el punto queda en barro');

select set_config('test.estado', pg_temp.proponer('barro-estado-01', 'estado', current_setting('test.punto')::uuid,
  '{"caudal":"barro"}')::text, true);
select is((select estado::text from hidrantes.propuestas where id = current_setting('test.estado')::uuid), 'pendiente',
  'cambio de estado a barro sin descripción: aceptado');

-- La nota de fallo solo vale con "no funciona" (RV-42): barro no la lleva.
select set_config('test.alta2', pg_temp.proponer('barro-alta-02', 'alta', null,
  '{"tipo":"boca_riego","caudal":"barro","racor":"granada","descripcion_fallo":"Sale marrón"}', 37.2111, -3.6111)::text, true);
select pg_temp.jefatura();
select set_config('test.punto2', hidrantes.fn_aprobar(current_setting('test.alta2')::uuid) ->> 'punto_id', true);
select is((select p.caudal::text || '|' || coalesce(p.descripcion_fallo, '-') from hidrantes.puntos p
            where p.id = current_setting('test.punto2')::uuid),
  'barro|-', 'un alta en barro no guarda nota de fallo, como cualquier estado que no es no funciona');
select set_config('test.alta3', pg_temp.proponer('barro-alta-03', 'alta', null,
  '{"tipo":"hidrante","diametro_mm":70,"caudal":"no_funciona","descripcion_fallo":"Tapa soldada"}', 37.2141, -3.6141)::text, true);
select pg_temp.jefatura();
select set_config('test.punto3', hidrantes.fn_aprobar(current_setting('test.alta3')::uuid) ->> 'punto_id', true);
select is((select p.caudal::text || '|' || coalesce(p.descripcion_fallo, '-') from hidrantes.puntos p
            where p.id = current_setting('test.punto3')::uuid),
  'no_funciona|Tapa soldada', 'un alta en no funciona sí guarda su nota de fallo');

-- Fusión eligiendo el estado de la propuesta: la nota sigue la misma regla.
insert into hidrantes.puntos (id, codigo, tipo, geom, diametro_mm, caudal, descripcion_fallo, foto_path, municipio,
                              fecha_ultima_revision)
values ('00000000-0000-4000-8000-0000000e3011', 'HID-8511', 'hidrante', 'SRID=4326;POINT(-3.6151 37.2151)', 100,
        'no_funciona', 'Válvula rota', 'fotos/b1.jpg', 'albolote', current_date),
       ('00000000-0000-4000-8000-0000000e3012', 'HID-8512', 'hidrante', 'SRID=4326;POINT(-3.6161 37.2161)', 100,
        'bueno', null, 'fotos/b2.jpg', 'albolote', current_date);
insert into hidrantes.propuestas (id, operacion, datos, autor_nombre, autor_apellido, dispositivo_id, clave_local,
                                  origen_ubicacion, geom, foto_path)
values ('00000000-0000-4000-8000-0000000e3021', 'alta',
        '{"tipo":"hidrante","diametro_mm":100,"caudal":"barro","descripcion_fallo":"Sale marrón"}',
        'Ana', 'Ruiz', gen_random_uuid(), 'barro-fusion-01', 'gps', 'SRID=4326;POINT(-3.6151 37.2151)', 'fotos/b3.jpg'),
       ('00000000-0000-4000-8000-0000000e3022', 'alta',
        '{"tipo":"hidrante","diametro_mm":100,"caudal":"no_funciona","descripcion_fallo":"Tapa soldada"}',
        'Ana', 'Ruiz', gen_random_uuid(), 'barro-fusion-02', 'gps', 'SRID=4326;POINT(-3.6161 37.2161)', 'fotos/b4.jpg');
select hidrantes.fn_fusionar_con_existente('00000000-0000-4000-8000-0000000e3021', '00000000-0000-4000-8000-0000000e3011',
  '{"caudal":"propuesta"}');
select hidrantes.fn_fusionar_con_existente('00000000-0000-4000-8000-0000000e3022', '00000000-0000-4000-8000-0000000e3012',
  '{"caudal":"propuesta"}');
select is((select caudal::text || '|' || coalesce(descripcion_fallo, '-') from hidrantes.puntos
            where id = '00000000-0000-4000-8000-0000000e3011'),
  'barro|-', 'fusión con el estado de una propuesta en barro: la nota de fallo anterior se borra');
select is((select caudal::text || '|' || coalesce(descripcion_fallo, '-') from hidrantes.puntos
            where id = '00000000-0000-4000-8000-0000000e3012'),
  'no_funciona|Tapa soldada', 'fusión con una propuesta en no funciona: se queda su nota');

insert into hidrantes.puntos (id, codigo, tipo, geom, diametro_mm, caudal, descripcion_fallo, foto_path, municipio,
                              fecha_ultima_revision)
values ('00000000-0000-4000-8000-0000000e3001', 'HID-8501', 'hidrante', 'SRID=4326;POINT(-3.6121 37.2121)', 70,
        'no_funciona', 'Tapa soldada', 'fotos/b.jpg', 'albolote', current_date);
select hidrantes.fn_editar_punto('00000000-0000-4000-8000-0000000e3001', '{"caudal":"barro"}');
select is((select caudal::text || '|' || coalesce(descripcion_fallo, '-') from hidrantes.puntos
            where id = '00000000-0000-4000-8000-0000000e3001'),
  'barro|-', 'jefatura lo pasa de no funciona a barro y la nota de fallo se borra');

-- ---------- restricción ----------
select lives_ok($$ insert into hidrantes.puntos (codigo, tipo, geom, diametro_mm, caudal, foto_path, municipio,
                                                  fecha_ultima_revision)
                    values ('HID-8502', 'hidrante', 'SRID=4326;POINT(-3.6131 37.2131)', 100, 'barro', 'fotos/c.jpg',
                            'albolote', current_date) $$,
  'puntos_fallo_descrito no cambia: un punto en barro sin descripción entra');

-- ---------- tamaño del marcador: el mínimo, como no funciona ----------
select is(hidrantes.fn_radio_px(100::smallint, 'barro'), 5::numeric, 'fn_radio_px(100, barro) = el mínimo');
select is(hidrantes.fn_radio_px(45::smallint, 'barro'), 5::numeric, 'fn_radio_px(45, barro) = el mínimo');
select is(hidrantes.fn_radio_px(70::smallint, 'barro'), 5::numeric, 'fn_radio_px(70, barro) = el mínimo');
select is((select radio_px from hidrantes.v_puntos_activos where codigo = 'HID-8502'), 5::numeric,
  'y v_puntos_activos lo dibuja al mínimo');

-- ---------- lo que no cambia ----------
select throws_like($$ select pg_temp.proponer('barro-nf-01', 'estado', current_setting('test.punto')::uuid,
  '{"caudal":"no_funciona"}') $$,
  'PAYLOAD_INVALIDO(descripcion_fallo)%', 'no funciona sigue exigiendo la descripción del fallo (FR-19)');

select * from finish();
rollback;
