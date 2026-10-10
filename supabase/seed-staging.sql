-- Seed de staging (05 §12). SOLO staging: deploy-prod.yml aborta si lo menciona (04 §4).
-- Idempotente (on conflict do nothing): nunca pisa lo que ya exista, incluido un código de acceso
-- real generado para el piloto. Todo es ficticio: puntos con prefijo [PRUEBA], códigos 9xxx para
-- que se distingan de los reales, correos de example.com, autores inventados.
--
-- 12 puntos con las 12 combinaciones diámetro × caudal (06 §4.2), repartidos por los núcleos;
-- tres con revisión caducada, uno retirado y uno en la papelera; dos con foto del sitio (docs/34
-- RV-354). 6 propuestas pendientes, una por
-- operación, con un posible duplicado y una desactualizada.
--
-- Las fotos `fotos/prueba-*.jpg` las sube después scripts/fotos-seed-staging.ts (deploy-staging.yml),
-- que comprueba que cada una responde 200 (docs/33 RV-340). Al final, las bocas duplicadas de RV-139b,
-- retiradas.

\set ON_ERROR_STOP on
begin;

-- ---------- puntos ----------

insert into hidrantes.puntos
  (id, codigo, tipo, geom, diametro_mm, caudal, racor, descripcion_fallo, descripcion, foto_path,
   municipio, nucleo, situacion, fecha_ultima_revision, borrado_en, creado_en, actualizado_en)
values
  ('5eed0000-0000-4000-8000-000000000001', 'HID-9001', 'hidrante',   'SRID=4326;POINT(-3.656900 37.230800)', 100, 'bueno',       null,        null,                              '[PRUEBA] Junto al ayuntamiento', 'fotos/prueba-hid-9001.jpg', 'albolote',  'Albolote',                'activo',   current_date - 30,  null, now() - interval '7 days', now() - interval '7 days'),
  ('5eed0000-0000-4000-8000-000000000002', 'HID-9002', 'hidrante',   'SRID=4326;POINT(-3.650100 37.229600)', 100, 'regular',     null,        null,                              '[PRUEBA] Esquina del mercado',   'fotos/prueba-hid-9002.jpg', 'albolote',  'Barrio Seco',             'activo',   current_date - 60,  null, now() - interval '7 days', now() - interval '1 day'),
  ('5eed0000-0000-4000-8000-000000000003', 'HID-9003', 'hidrante',   'SRID=4326;POINT(-3.648900 37.248700)', 100, 'malo',        null,        null,                              '[PRUEBA] Frente a la escuela',   'fotos/prueba-hid-9003.jpg', 'albolote',  'Cortijo del Aire',        'activo',   current_date - 430, null, now() - interval '7 days', now() - interval '7 days'),
  ('5eed0000-0000-4000-8000-000000000004', 'HID-9004', 'hidrante',   'SRID=4326;POINT(-3.655800 37.256800)', 100, 'no_funciona', null,        '[PRUEBA] Tapa soldada, no abre',  '[PRUEBA] Plaza',                 'fotos/prueba-hid-9004.jpg', 'albolote',  'El Chaparral',            'activo',   current_date - 90,  null, now() - interval '7 days', now() - interval '7 days'),
  ('5eed0000-0000-4000-8000-000000000005', 'HID-9005', 'hidrante',   'SRID=4326;POINT(-3.669400 37.245700)',  70, 'bueno',       null,        null,                              '[PRUEBA] Entrada del polígono',  'fotos/prueba-hid-9005.jpg', 'albolote',  'Pretel',                  'activo',   current_date - 15,  null, now() - interval '7 days', now() - interval '7 days'),
  ('5eed0000-0000-4000-8000-000000000006', 'HID-9006', 'hidrante',   'SRID=4326;POINT(-3.648800 37.224500)',  70, 'regular',     null,        null,                              '[PRUEBA] Calle principal',       'fotos/prueba-hid-9006.jpg', 'albolote',  'La Farfana',              'activo',   current_date - 500, null, now() - interval '7 days', now() - interval '7 days'),
  ('5eed0000-0000-4000-8000-000000000007', 'HID-9007', 'hidrante',   'SRID=4326;POINT(-3.675000 37.237500)',  70, 'malo',        null,        null,                              '[PRUEBA] Rotonda',               'fotos/prueba-hid-9007.jpg', 'albolote',  'Urbanización Buenavista', 'activo',   current_date - 45,  null, now() - interval '7 days', now() - interval '7 days'),
  ('5eed0000-0000-4000-8000-000000000008', 'HID-9008', 'hidrante',   'SRID=4326;POINT(-3.673700 37.242300)',  70, 'no_funciona', null,        '[PRUEBA] Arqueta inundada',       '[PRUEBA] Retirado por obras',    'fotos/prueba-hid-9008.jpg', 'albolote',  'Urbanización El Torreón', 'retirado', current_date - 200, null, now() - interval '7 days', now() - interval '7 days'),
  ('5eed0000-0000-4000-8000-000000000009', 'BOC-9001', 'boca_riego', 'SRID=4326;POINT(-3.618400 37.273500)',  45, 'bueno',       'granada',   null,                              '[PRUEBA] Plaza de la iglesia',   'fotos/prueba-boc-9001.jpg', 'calicasas', 'Calicasas',               'activo',   current_date - 20,  null, now() - interval '7 days', now() - interval '7 days'),
  ('5eed0000-0000-4000-8000-000000000010', 'BOC-9002', 'boca_riego', 'SRID=4326;POINT(-3.669300 37.285600)',  45, 'regular',     'barcelona', null,                              '[PRUEBA] Aparcamiento',          'fotos/prueba-boc-9002.jpg', 'albolote',  'Parque del Cubillas',     'activo',   current_date - 400, null, now() - interval '7 days', now() - interval '7 days'),
  ('5eed0000-0000-4000-8000-000000000011', 'BOC-9003', 'boca_riego', 'SRID=4326;POINT(-3.657300 37.230400)',  45, 'malo',        'otro',      null,                              '[PRUEBA] En la papelera',        'fotos/prueba-boc-9003.jpg', 'albolote',  'Albolote',                'borrado',  current_date - 100, now() - interval '3 days', now() - interval '7 days', now() - interval '7 days'),
  ('5eed0000-0000-4000-8000-000000000012', 'BOC-9004', 'boca_riego', 'SRID=4326;POINT(-3.618900 37.273100)',  45, 'no_funciona', 'granada',   '[PRUEBA] Sin presión',            '[PRUEBA] Lavadero',              'fotos/prueba-boc-9004.jpg', 'calicasas', 'Calicasas',               'activo',   current_date - 10,  null, now() - interval '7 days', now() - interval '7 days')
on conflict do nothing;

-- ---------- foto del sitio en dos puntos (docs/34 RV-354) ----------
-- Para ver en staging la ficha con sus dos variantes reales: una foto (conexión) y dos (conexión y
-- sitio). Un update y no el insert, para que llegue también a un staging ya sembrado; solo si el punto
-- no tiene ya una (idempotente, y no pisa la de una aprobación). HID-9003 y BOC-9004 no tienen
-- propuestas pendientes en el seed: tocar `actualizado_en` no vuelve ninguna desactualizada.
update hidrantes.puntos set foto_sitio_path = 'fotos/prueba-sitio-hid-9003.jpg'
 where id = '5eed0000-0000-4000-8000-000000000003' and foto_sitio_path is null;
update hidrantes.puntos set foto_sitio_path = 'fotos/prueba-sitio-boc-9004.jpg'
 where id = '5eed0000-0000-4000-8000-000000000012' and foto_sitio_path is null;

-- ---------- propuestas pendientes (una por operación) ----------

insert into hidrantes.propuestas
  (id, punto_id, operacion, datos, autor_nombre, autor_apellido, dispositivo_id, clave_local,
   origen_ubicacion, geom, gps_geom, precision_gps_m, distancia_gps_m, duplicado_de, distancia_duplicado_m,
   foto_path, creada_en)
values
  -- alta a ~8 m de HID-9001, del mismo tipo: posible duplicado (FR-51)
  ('5eed0000-0000-4000-8000-0000000000a1', null, 'alta',
   '{"tipo": "hidrante", "diametro_mm": 100, "caudal": "bueno", "descripcion": "[PRUEBA] Alta duplicada"}',
   'Prueba', 'Uno', '5eed0000-0000-4000-8000-00000000d001', 'seed-staging-alta',
   'gps', 'SRID=4326;POINT(-3.656950 37.230860)', 'SRID=4326;POINT(-3.656960 37.230870)', 6, 1.4,
   '5eed0000-0000-4000-8000-000000000001', 8, 'fotos/prueba-propuesta-a1.jpg', now() - interval '1 hour'),
  -- revisión "sigue igual"
  ('5eed0000-0000-4000-8000-0000000000a2', '5eed0000-0000-4000-8000-000000000005', 'revision',
   '{}', 'Prueba', 'Dos', '5eed0000-0000-4000-8000-00000000d002', 'seed-staging-revision',
   null, null, null, null, null, null, null, 'fotos/prueba-propuesta-a2.jpg', now() - interval '2 hours'),
  -- actualizar estado, creada antes del último cambio del punto: desactualizada
  ('5eed0000-0000-4000-8000-0000000000a3', '5eed0000-0000-4000-8000-000000000002', 'estado',
   '{"caudal": "malo", "nota": "[PRUEBA] Sale muy poca agua"}', 'Prueba', 'Uno',
   '5eed0000-0000-4000-8000-00000000d001', 'seed-staging-estado',
   null, null, null, null, null, null, null, 'fotos/prueba-propuesta-a3.jpg', now() - interval '2 days'),
  -- corregir datos (sin foto nueva)
  ('5eed0000-0000-4000-8000-0000000000a4', '5eed0000-0000-4000-8000-000000000009', 'datos',
   '{"racor": "barcelona"}', 'Prueba', 'Tres', '5eed0000-0000-4000-8000-00000000d003', 'seed-staging-datos',
   null, null, null, null, null, null, null, null, now() - interval '3 hours'),
  -- corregir ubicación, ~12 m al norte
  ('5eed0000-0000-4000-8000-0000000000a5', '5eed0000-0000-4000-8000-000000000007', 'ubicacion',
   '{"nota": "[PRUEBA] Está al otro lado de la rotonda"}', 'Prueba', 'Dos',
   '5eed0000-0000-4000-8000-00000000d002', 'seed-staging-ubicacion',
   'manual', 'SRID=4326;POINT(-3.675000 37.237610)', 'SRID=4326;POINT(-3.675020 37.237600)', 9, 2.0,
   null, null, 'fotos/prueba-propuesta-a5.jpg', now() - interval '4 hours'),
  -- proponer retirada
  ('5eed0000-0000-4000-8000-0000000000a6', '5eed0000-0000-4000-8000-000000000010', 'retirada',
   '{"motivo_rapido": "obras", "motivo": "[PRUEBA] Han levantado la acera"}', 'Prueba', 'Tres',
   '5eed0000-0000-4000-8000-00000000d003', 'seed-staging-retirada',
   null, null, null, null, null, null, null, 'fotos/prueba-propuesta-a6.jpg', now() - interval '5 hours')
on conflict do nothing;

-- ---------- config: código 000000 solo si no hay ya uno (p. ej. el del piloto) ----------

insert into hidrantes.config (clave, valor, actualizado_por) values
  ('codigo_acceso_hash',         to_jsonb(extensions.crypt('000000', extensions.gen_salt('bf', 10))), 'seed'),
  ('codigo_acceso_cambiado_en',  to_jsonb(now()),                                                    'seed'),
  ('codigo_acceso_cambiado_por', '"seed"',                                                            'seed')
on conflict (clave) do nothing;

-- ---------- administradores de prueba (el propietario lo añade asegurar-propietario.ts) ----------

insert into hidrantes.administradores (email, creado_por) values
  ('jefatura.prueba@example.com', 'seed'),
  ('panel.prueba@example.com',    'seed')
on conflict (email) do nothing;

-- ---------- las cuatro bocas duplicadas de RV-139b, retiradas (docs/33 RV-340, D12) ----------
-- BOC-0003 a BOC-0006 son altas de prueba que RV-139b aprobó en el mismo sitio (8 oct 2026): cuatro
-- marcadores encima unos de otros. Se retiran como lo haría jefatura, con fn_retirar_punto (queda en el
-- Registro) y con los claims de un administrador activo **locales a esta transacción**
-- (set_config(…, true)), como en RV-139b: el de prueba si está activo y, si no, otro activo (el
-- propietario lo está siempre, asegurar-propietario.ts). Si ninguno pasa fn_es_admin, falla: el seed se
-- deshace y el despliegue lo dice, en vez de dejar las bocas sin aviso. Solo si siguen activas, son
-- bocas, se crearon antes del 10 oct 2026 y tienen otra de las cuatro a menos de 15 m: si staging se
-- rehace y esos códigos son otros puntos, no se toca nada. Idempotente: retiradas, ya no están activas.
do $$
declare
  p record;
  n int := 0;
  admin text;
begin
  if not exists (select 1 from hidrantes.puntos where codigo in ('BOC-0003', 'BOC-0004', 'BOC-0005', 'BOC-0006')
                                                  and situacion = 'activo') then
    return;
  end if;
  select a.email into admin
    from hidrantes.administradores a
   where a.activo
   order by a.email = 'jefatura.prueba@example.com' desc, a.email
   limit 1;
  perform set_config('request.jwt.claims', jsonb_build_object(
    'role', 'authenticated', 'email', admin,
    'amr', jsonb_build_array(jsonb_build_object('method', 'oauth', 'timestamp', extract(epoch from now())::bigint)),
    'app_metadata', jsonb_build_object('provider', 'google', 'providers', jsonb_build_array('google')))::text, true);
  if admin is null or not hidrantes.fn_es_admin() then
    raise exception 'RV-340: ningún administrador activo pasa fn_es_admin(); revisa hidrantes.administradores y fn_email_jwt';
  end if;
  for p in
    select x.id, x.codigo
      from hidrantes.puntos x
     where x.codigo in ('BOC-0003', 'BOC-0004', 'BOC-0005', 'BOC-0006')
       and x.tipo = 'boca_riego'
       and x.situacion = 'activo'
       and x.creado_en < '2026-10-10'
       and exists (select 1 from hidrantes.puntos y
                    where y.codigo in ('BOC-0003', 'BOC-0004', 'BOC-0005', 'BOC-0006')
                      and y.id <> x.id
                      and extensions.st_dwithin(x.geom, y.geom, 15))
     order by x.codigo
  loop
    perform hidrantes.fn_retirar_punto(p.id, 'prueba');
    n := n + 1;
  end loop;
  raise notice 'RV-340: % bocas duplicadas de RV-139b retiradas', n;
end $$;

commit;
