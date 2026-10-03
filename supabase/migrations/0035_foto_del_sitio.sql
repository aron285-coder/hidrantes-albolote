-- 0035 · Foto del sitio en alta y en corregir ubicación (docs/24 RV-103, DEC-146, FR-21, FR-41,
-- FR-45, FR-66).
--
-- Una segunda foto, la del sitio, para encontrar el punto ("al lado de la gasolinera"):
--   1. columnas nullables en puntos y propuestas (los puntos de hoy no la tienen y la app anterior
--      no la manda);
--   2. fn_proponer con una firma nueva (un parámetro más al final) que la exige en alta y ubicación;
--      la de antes se queda para la app anterior (04 §12) y su propuesta llega a la cola con la
--      señal sin_foto_sitio. Las dos llaman a fn_proponer_interno, sin execute para nadie;
--   3. la aprobación (una, lote y alta directa de jefatura) y la fusión la copian;
--   4. **fn_fotos_referenciadas (y por ella _lista) la protege**: sin esto, la purga de los lunes
--      borraría todas las fotos del sitio;
--   5. v_puntos_activos (lo que sincroniza el móvil), v_cola_revision y la exportación la traen;
--   6. el tope diario de subidas de fábrica pasa de 40 a 80, porque un alta gasta dos reservas.

-- ---------- 1. columnas ----------
alter table hidrantes.puntos add column foto_sitio_path text
  constraint puntos_foto_sitio check (foto_sitio_path is null or length(trim(foto_sitio_path)) > 0);
alter table hidrantes.propuestas add column foto_sitio_path text;
-- Solo en alta y ubicación, y distinta de la de la conexión. Con foto_path null (corregir datos)
-- la comparación da NULL y el check pasa, pero ahí ya no se admite por la operación.
alter table hidrantes.propuestas add constraint propuestas_foto_sitio check (
  foto_sitio_path is null
  or (operacion in ('alta', 'ubicacion') and length(trim(foto_sitio_path)) > 0 and foto_sitio_path <> foto_path));

-- ---------- 2. fn_proponer ----------
-- Cuerpo común: el de 0032 más la foto del sitio. exigir_foto_sitio = true con la firma nueva.
create function hidrantes.fn_proponer_interno(
  token text, clave_local text, autor_nombre text, autor_apellido text,
  operacion hidrantes.operacion, punto_id uuid, datos jsonb,
  origen hidrantes.origen_ubicacion, lat double precision, lng double precision,
  gps_lat double precision, gps_lng double precision, precision_gps_m real,
  exif_lat double precision, exif_lng double precision,
  foto_path text, foto_sitio_path text, exigir_foto_sitio boolean
) returns jsonb
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes, extensions
set lock_timeout = '5s' as $$
#variable_conflict use_variable
declare
  admin_email text := case when hidrantes.fn_es_admin() then hidrantes.fn_email_jwt() end;
  d uuid;
  existente hidrantes.propuestas;
  p hidrantes.puntos;
  nueva_geom geography := hidrantes.fn_punto_geo(lat, lng);
  gps geography := hidrantes.fn_punto_geo(gps_lat, gps_lng);
  exif geography := hidrantes.fn_punto_geo(exif_lat, exif_lng);
  dup_id uuid;
  dup_m double precision;
  nuevo_id uuid;
  datos_ok jsonb := coalesce(datos, '{}'::jsonb);
  resultado jsonb;
  dias_reserva integer := (hidrantes.fn_config('dias_reserva_subida', '7') #>> '{}')::int;
begin
  -- Identidad: administrador con sesión de Google o voluntario con token (FR-151).
  d := case when admin_email is not null then hidrantes.fn_dispositivo_admin(admin_email)
            else hidrantes.fn_validar_token(token) end;

  if clave_local is null or length(clave_local) not between 8 and 100 then
    perform hidrantes.fn_error('PAYLOAD_INVALIDO(clave_local)', 'Marca de envío no válida');
  end if;

  -- Idempotencia (FR-49): un reintento devuelve la propuesta ya creada.
  select * into existente from hidrantes.propuestas r where r.clave_local = fn_proponer_interno.clave_local;
  if found then
    if existente.dispositivo_id <> d then
      perform hidrantes.fn_error('PAYLOAD_INVALIDO(clave_local)', 'Marca de envío no válida');
    end if;
    return jsonb_build_object('propuesta_id', existente.id, 'estado', existente.estado,
      'aplicada', existente.estado = 'aprobada',
      'codigo', (select codigo from hidrantes.puntos where id = coalesce(existente.punto_id,
                   (existente.correcciones ->> 'punto_id')::uuid)));
  end if;

  -- Jefatura (RV-19): su identidad es la sesión, no lo que mande el móvil. El registro ya usa
  -- admin_email como actor.
  if admin_email is not null then
    autor_nombre := 'Jefatura';
    autor_apellido := left(admin_email, 60);
  end if;

  if jsonb_typeof(datos_ok) <> 'object' then
    perform hidrantes.fn_error('PAYLOAD_INVALIDO(datos)', 'Datos no válidos');
  end if;
  if coalesce(trim(autor_nombre), '') = '' or coalesce(trim(autor_apellido), '') = ''
     or length(autor_nombre) > 60 or length(autor_apellido) > 60 then
    perform hidrantes.fn_error('PAYLOAD_INVALIDO(autor)', 'Faltan nombre y apellido');
  end if;
  perform hidrantes.fn_validar_datos(operacion, datos_ok);

  -- Punto afectado
  if operacion = 'alta' then
    if punto_id is not null then
      perform hidrantes.fn_error('PAYLOAD_INVALIDO(punto_id)', 'Un alta no lleva punto');
    end if;
  else
    select * into p from hidrantes.puntos x where x.id = punto_id;
    if not found or p.situacion <> 'activo' then
      perform hidrantes.fn_error('PUNTO_NO_ACTIVO', 'El punto ya no está activo');
    end if;
    -- El tipo no cambia una vez creado (DEC-090). El frontend anterior manda el tipo actual en
    -- "corregir datos": igual al del punto, entra (04 §12).
    if datos_ok ? 'tipo' and datos_ok ->> 'tipo' is distinct from p.tipo::text then
      perform hidrantes.fn_error('TIPO_NO_MODIFICABLE', 'El tipo no se cambia: propón retirarlo y da de alta el correcto');
    end if;
    -- El diámetro de "corregir datos", con las reglas del tipo del punto (DEC-144).
    if operacion = 'datos' then
      perform hidrantes.fn_validar_diametro(p.tipo::text, datos_ok, false);
    end if;
  end if;

  -- Ubicación
  if operacion in ('alta', 'ubicacion') and (nueva_geom is null or origen is null) then
    perform hidrantes.fn_error('PAYLOAD_INVALIDO(ubicacion)', 'Falta la ubicación');
  end if;
  if operacion not in ('alta', 'ubicacion') then
    nueva_geom := null;
  end if;

  -- Foto: obligatoria salvo en "corregir datos"; siempre reservada por este dispositivo.
  if foto_path is null and operacion <> 'datos' then
    perform hidrantes.fn_error('FOTO_OBLIGATORIA', 'Falta la foto');
  end if;
  if foto_path is not null then
    update hidrantes.subidas s set confirmada_en = coalesce(s.confirmada_en, now())
     where s.foto_path = fn_proponer_interno.foto_path and s.dispositivo_id = d
       -- Una reserva sin confirmar de más de dias_reserva - 1 días pudo perder su archivo en la purga:
       -- se pide otra subida (RV-07). Nunca menos de un día: con dias_reserva_subida = 1 se rechazaban
       -- todas y la cola reintentaba sin fin (RV-48).
       and (s.confirmada_en is not null
            or s.reservada_en > now() - make_interval(days => greatest(dias_reserva - 1, 1)));
    if not found then
      perform hidrantes.fn_error('FOTO_NO_RESERVADA', 'La foto no se subió desde este móvil');
    end if;
  end if;

  -- Foto del sitio (DEC-146): con la firma nueva, obligatoria en alta y ubicación; en ninguna otra
  -- operación se admite. Distinta de la de la conexión y reservada por este dispositivo, como ella.
  if exigir_foto_sitio and operacion in ('alta', 'ubicacion') and foto_sitio_path is null then
    perform hidrantes.fn_error('FOTO_SITIO_OBLIGATORIA', 'Falta la foto del sitio');
  end if;
  if foto_sitio_path is not null then
    if operacion not in ('alta', 'ubicacion') then
      perform hidrantes.fn_error('PAYLOAD_INVALIDO(foto_sitio_path)', 'Esta operación no lleva foto del sitio');
    end if;
    if foto_sitio_path = foto_path then
      perform hidrantes.fn_error('PAYLOAD_INVALIDO(foto_sitio_path)', 'La foto del sitio es otra foto');
    end if;
    update hidrantes.subidas s set confirmada_en = coalesce(s.confirmada_en, now())
     where s.foto_path = fn_proponer_interno.foto_sitio_path and s.dispositivo_id = d
       and (s.confirmada_en is not null
            or s.reservada_en > now() - make_interval(days => greatest(dias_reserva - 1, 1)));
    if not found then
      perform hidrantes.fn_error('FOTO_NO_RESERVADA', 'La foto del sitio no se subió desde este móvil');
    end if;
  end if;

  -- Posible duplicado: el punto activo más cercano del mismo tipo (FR-51).
  if operacion = 'alta' then
    select x.id, st_distance(x.geom, nueva_geom) into dup_id, dup_m
      from hidrantes.puntos x
     where x.situacion = 'activo' and x.tipo = (datos_ok ->> 'tipo')::hidrantes.tipo_punto
       and st_dwithin(x.geom, nueva_geom, (hidrantes.fn_config('radio_duplicado_m', '25') #>> '{}')::double precision)
     order by x.geom <-> nueva_geom
     limit 1;
  end if;

  insert into hidrantes.propuestas as r
    (punto_id, operacion, datos, autor_nombre, autor_apellido, dispositivo_id, clave_local, origen_ubicacion,
     geom, gps_geom, precision_gps_m, exif_geom, distancia_gps_m, duplicado_de, distancia_duplicado_m, foto_path,
     foto_sitio_path)
  values
    (fn_proponer_interno.punto_id, operacion, datos_ok, trim(autor_nombre), trim(autor_apellido), d, fn_proponer_interno.clave_local,
     case when nueva_geom is not null then origen end, nueva_geom, gps, precision_gps_m, exif,
     case when nueva_geom is not null and gps is not null then st_distance(nueva_geom, gps) end,
     dup_id, dup_m, fn_proponer_interno.foto_path, fn_proponer_interno.foto_sitio_path)
  on conflict on constraint propuestas_clave_local_key do nothing
  returning r.id into nuevo_id;

  if nuevo_id is null then
    -- Otro envío con la misma marca entró a la vez (05 §11): se devuelve ese.
    return hidrantes.fn_proponer_interno(token, clave_local, autor_nombre, autor_apellido, operacion, punto_id, datos,
      origen, lat, lng, gps_lat, gps_lng, precision_gps_m, exif_lat, exif_lng, foto_path, foto_sitio_path, exigir_foto_sitio);
  end if;

  perform hidrantes.fn_registrar(coalesce(admin_email, trim(autor_nombre) || ' ' || trim(autor_apellido)),
    case when admin_email is null then d end, admin_email is not null, 'propuesta_creada',
    fn_proponer_interno.punto_id, nuevo_id, null, jsonb_build_object('operacion', operacion, 'datos', datos_ok));

  -- Jefatura aplica al momento (FR-151).
  if admin_email is not null then
    resultado := hidrantes.fn_aplicar_propuesta(nuevo_id, null, true, admin_email);
    return jsonb_build_object('propuesta_id', nuevo_id, 'estado', 'aprobada', 'aplicada', true,
                              'codigo', resultado ->> 'codigo');
  end if;

  perform hidrantes.fn_avisar_jefatura();
  return jsonb_build_object('propuesta_id', nuevo_id, 'estado', 'pendiente', 'aplicada', false,
                            'codigo', p.codigo);
end $$;

revoke all on function hidrantes.fn_proponer_interno(text, text, text, text, hidrantes.operacion, uuid, jsonb,
  hidrantes.origen_ubicacion, double precision, double precision, double precision, double precision, real,
  double precision, double precision, text, text, boolean) from public, anon, authenticated;

-- Firma nueva: la de la app que ya sabe de la foto del sitio. Sin default en el último parámetro, para
-- que una llamada con 16 argumentos no sea ambigua.
create function hidrantes.fn_proponer(
  token text, clave_local text, autor_nombre text, autor_apellido text,
  operacion hidrantes.operacion, punto_id uuid, datos jsonb,
  origen hidrantes.origen_ubicacion, lat double precision, lng double precision,
  gps_lat double precision, gps_lng double precision, precision_gps_m real,
  exif_lat double precision, exif_lng double precision,
  foto_path text, foto_sitio_path text
) returns jsonb
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes, extensions
set lock_timeout = '5s' as $$
begin
  return hidrantes.fn_proponer_interno(token, clave_local, autor_nombre, autor_apellido, operacion, punto_id, datos,
    origen, lat, lng, gps_lat, gps_lng, precision_gps_m, exif_lat, exif_lng, foto_path, foto_sitio_path, true);
end $$;

revoke all on function hidrantes.fn_proponer(text, text, text, text, hidrantes.operacion, uuid, jsonb,
  hidrantes.origen_ubicacion, double precision, double precision, double precision, double precision, real,
  double precision, double precision, text, text) from public;
-- Como la de antes (0007): anon con su token y authenticated, porque jefatura usa la misma app (FR-150).
grant execute on function hidrantes.fn_proponer(text, text, text, text, hidrantes.operacion, uuid, jsonb,
  hidrantes.origen_ubicacion, double precision, double precision, double precision, double precision, real,
  double precision, double precision, text, text) to anon, authenticated;

-- Firma de antes, misma firma y mismos permisos: la llama la app anterior hasta que se actualice.
-- Alta y ubicación entran sin foto del sitio y la cola lo señala (sin_foto_sitio).
create or replace function hidrantes.fn_proponer(
  token text, clave_local text, autor_nombre text, autor_apellido text,
  operacion hidrantes.operacion, punto_id uuid, datos jsonb,
  origen hidrantes.origen_ubicacion, lat double precision, lng double precision,
  gps_lat double precision, gps_lng double precision, precision_gps_m real,
  exif_lat double precision, exif_lng double precision,
  foto_path text
) returns jsonb
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes, extensions
set lock_timeout = '5s' as $$
begin
  return hidrantes.fn_proponer_interno(token, clave_local, autor_nombre, autor_apellido, operacion, punto_id, datos,
    origen, lat, lng, gps_lat, gps_lng, precision_gps_m, exif_lat, exif_lng, foto_path, null, false);
end $$;

-- ---------- 3. aprobación y fusión ----------
-- Igual que 0034 más la foto del sitio: el alta la copia; en las demás, la de la propuesta si trae una
-- (solo puede traerla una ubicación) y si no, la que tenía.
create or replace function hidrantes.fn_aplicar_propuesta(
  propuesta_id uuid, correcciones jsonb, confirmar_desactualizada boolean, actor text
) returns jsonb
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes, extensions
set lock_timeout = '5s' as $$
declare
  r hidrantes.propuestas;
  p hidrantes.puntos;
  antes jsonb;
  c jsonb := coalesce(correcciones, '{}'::jsonb);
  m jsonb;  -- datos + correcciones
  zona record;
  nuevo_id uuid;
  tipo_final hidrantes.tipo_punto;
  diametro_final smallint;
  caudal_final hidrantes.estado_caudal;
  accion text;
begin
  select * into r from hidrantes.propuestas x where x.id = propuesta_id for update;
  if not found or r.estado <> 'pendiente' then
    perform hidrantes.fn_error('PROPUESTA_NO_PENDIENTE', 'La propuesta ya no está pendiente');
  end if;
  if jsonb_typeof(c) <> 'object' then
    perform hidrantes.fn_error('PAYLOAD_INVALIDO(correcciones)', 'Correcciones no válidas');
  end if;
  perform hidrantes.fn_exigir_claves(c, array['tipo', 'diametro_mm', 'caudal', 'racor', 'descripcion_fallo',
                                              'descripcion', 'direccion']);
  m := r.datos || c;

  if r.punto_id is not null then
    select * into p from hidrantes.puntos x where x.id = r.punto_id for update;
    if not found or p.situacion <> 'activo' then
      perform hidrantes.fn_error('PUNTO_NO_ACTIVO', 'El punto ya no está activo');
    end if;
    if p.actualizado_en > r.creada_en and not coalesce(confirmar_desactualizada, false) then
      perform hidrantes.fn_error('PROPUESTA_DESACTUALIZADA', 'El punto cambió después de enviarse la propuesta');
    end if;
    antes := hidrantes.fn_punto_json(p);
    -- Fuera de un alta el tipo no cambia, ni por lo propuesto ni por las correcciones (DEC-090).
    -- Una propuesta pendiente de antes que lo cambie se omite en el lote con este código.
    if r.operacion <> 'alta' and m ? 'tipo' and m ->> 'tipo' is distinct from p.tipo::text then
      perform hidrantes.fn_error('TIPO_NO_MODIFICABLE', 'El tipo no se cambia: propón retirarlo y da de alta el correcto');
    end if;
  end if;

  begin
    case r.operacion
    when 'alta' then
      tipo_final := (m ->> 'tipo')::hidrantes.tipo_punto;
      -- Una boca con otra medida se aprueba tal cual; sin diámetro, 45 (DEC-144). Un hidrante con
      -- otra medida necesita que jefatura fije 70 o 100 (FR-17).
      diametro_final := case when tipo_final = 'boca_riego'
                             then coalesce((m ->> 'diametro_mm')::smallint,
                                           ((m ->> 'diametro_otro')::numeric)::smallint, 45)
                             else (m ->> 'diametro_mm')::smallint end;
      if diametro_final is null then
        perform hidrantes.fn_error('DIAMETRO_SIN_FIJAR', 'Fija 70 o 100 mm antes de aprobar');
      end if;
      select * into zona from hidrantes.fn_municipio_de(r.geom);
      insert into hidrantes.puntos (codigo, tipo, geom, diametro_mm, caudal, racor, descripcion_fallo, descripcion,
                                    direccion, foto_path, foto_sitio_path, municipio, nucleo, fecha_ultima_revision)
      values (hidrantes.fn_siguiente_codigo(tipo_final), tipo_final, r.geom, diametro_final,
              (m ->> 'caudal')::hidrantes.estado_caudal,
              case when tipo_final = 'boca_riego' then (m ->> 'racor')::hidrantes.tipo_racor end,
              -- la nota de fallo solo vale con no_funciona (RV-42); con barro o cualquier otro, nada
              case when m ->> 'caudal' = 'no_funciona' then nullif(trim(m ->> 'descripcion_fallo'), '') end,
              nullif(trim(m ->> 'descripcion'), ''),
              coalesce(nullif(trim(c ->> 'direccion'), ''), r.direccion_sugerida),
              r.foto_path, r.foto_sitio_path, zona.municipio, zona.nucleo, current_date)
      returning * into p;

    when 'revision', 'estado', 'datos', 'ubicacion' then
      tipo_final := coalesce((m ->> 'tipo')::hidrantes.tipo_punto, p.tipo);
      -- El diámetro que ya tenía, salvo que la propuesta o jefatura lo corrijan; también en bocas.
      diametro_final := coalesce((m ->> 'diametro_mm')::smallint,
                                 case when tipo_final = 'boca_riego'
                                      then ((m ->> 'diametro_otro')::numeric)::smallint end,
                                 p.diametro_mm);
      caudal_final := coalesce((m ->> 'caudal')::hidrantes.estado_caudal, p.caudal);
      -- zona siempre asignada (el record no admite leer campos antes); solo se usa en 'ubicacion'
      select * into zona from hidrantes.fn_municipio_de(coalesce(r.geom, p.geom));
      update hidrantes.puntos x set
        tipo = tipo_final,
        diametro_mm = diametro_final,
        caudal = caudal_final,
        racor = case when tipo_final = 'boca_riego' then coalesce((m ->> 'racor')::hidrantes.tipo_racor, x.racor) end,
        -- si vuelve a funcionar, la descripción del fallo anterior ya no vale
        descripcion_fallo = case when caudal_final = 'no_funciona'
                                 then coalesce(nullif(trim(m ->> 'descripcion_fallo'), ''), x.descripcion_fallo) end,
        descripcion = case when m ? 'descripcion' then nullif(trim(m ->> 'descripcion'), '') else x.descripcion end,
        geom = case when r.operacion = 'ubicacion' then r.geom else x.geom end,
        municipio = case when r.operacion = 'ubicacion' then zona.municipio else x.municipio end,
        nucleo = case when r.operacion = 'ubicacion' then zona.nucleo else x.nucleo end,
        direccion = coalesce(nullif(trim(c ->> 'direccion'), ''),
                             case when r.operacion = 'ubicacion' then r.direccion_sugerida end, x.direccion),
        foto_path = coalesce(r.foto_path, x.foto_path),
        -- solo una ubicación puede traerla: la sustituye; sin ella (app anterior), se queda la que había
        foto_sitio_path = coalesce(r.foto_sitio_path, x.foto_sitio_path),
        -- corregir datos es un error de registro, no una visita: no renueva la revisión (FR-44)
        fecha_ultima_revision = case when r.operacion = 'datos' then x.fecha_ultima_revision else current_date end
      where x.id = p.id
      returning * into p;

    when 'retirada' then
      update hidrantes.puntos x set situacion = 'retirado' where x.id = p.id returning * into p;
    end case;
  exception
    -- numeric_value_out_of_range: un diámetro enorme no llega crudo al cliente ni tumba el lote.
    when check_violation or not_null_violation or invalid_text_representation or numeric_value_out_of_range then
      perform hidrantes.fn_error('PAYLOAD_INVALIDO(' || coalesce(hidrantes.constraint_name_de(sqlerrm), 'datos') || ')',
                                 'El resultado no cumple las reglas del punto');
  end;

  accion := case when c = '{}'::jsonb then 'aprobacion' else 'aprobacion_con_correcciones' end;
  -- nullif(c, '{}') || … daba NULL en un alta sin correcciones (|| con NULL es NULL) y se perdía el
  -- punto creado: Mis propuestas no enseñaba su código (DEC-144, punto 9).
  update hidrantes.propuestas x
     set estado = 'aprobada',
         correcciones = nullif(c || case when r.operacion = 'alta' then jsonb_build_object('punto_id', p.id)
                                         else '{}'::jsonb end, '{}'::jsonb),
         revisada_por = actor, revisada_en = now()
   where x.id = r.id;

  perform hidrantes.fn_registrar(actor, null, true, accion, p.id, r.id, antes,
    hidrantes.fn_punto_json(p) || case when r.operacion = 'ubicacion' and antes is not null
      then jsonb_build_object('desplazamiento_m', round(st_distance(r.geom, st_setsrid(st_makepoint(
             (antes ->> 'lng')::float8, (antes ->> 'lat')::float8), 4326)::geography)::numeric, 1))
      else '{}'::jsonb end);
  if r.dispositivo_id <> hidrantes.fn_dispositivo_admin(actor) then
    perform hidrantes.fn_avisar_autor(r.dispositivo_id, true, p.codigo);
  end if;
  return jsonb_build_object('punto_id', p.id, 'codigo', p.codigo);
end $$;

-- Igual que 0034 más la foto del sitio de la propuesta, si la trae, como la de la conexión.
create or replace function hidrantes.fn_fusionar_con_existente(propuesta_id uuid, punto_id uuid, prevalece jsonb default '{}')
returns jsonb
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes, extensions
set lock_timeout = '5s' as $$
declare
  actor text := hidrantes.fn_exigir_admin();
  r hidrantes.propuestas;
  p hidrantes.puntos;
  antes jsonb;
  usa_propuesta text[];
  k text;
  zona record;
  diametro_propuesta smallint;
begin
  select * into r from hidrantes.propuestas x where x.id = propuesta_id for update;
  if not found or r.estado <> 'pendiente' then
    perform hidrantes.fn_error('PROPUESTA_NO_PENDIENTE', 'La propuesta ya no está pendiente');
  end if;
  if r.operacion <> 'alta' then
    perform hidrantes.fn_error('PROPUESTA_NO_ALTA', 'Solo se fusiona un alta');
  end if;
  select * into p from hidrantes.puntos x where x.id = punto_id for update;
  if not found or p.situacion <> 'activo' then
    perform hidrantes.fn_error('PUNTO_NO_ACTIVO', 'El punto ya no está activo');
  end if;
  if p.tipo::text <> r.datos ->> 'tipo' then
    perform hidrantes.fn_error('TIPO_DISTINTO', 'Solo se fusionan puntos del mismo tipo');
  end if;
  perform hidrantes.fn_exigir_claves(coalesce(prevalece, '{}'), array['racor', 'caudal', 'diametro_mm', 'descripcion', 'ubicacion']);
  for k in select key from jsonb_each_text(coalesce(prevalece, '{}')) where value = 'propuesta' loop
    usa_propuesta := usa_propuesta || k;
  end loop;
  antes := hidrantes.fn_punto_json(p);
  -- Con la ubicación de la propuesta, el punto se muda: municipio y núcleo salen del sitio nuevo,
  -- como en fn_aplicar_propuesta con una corrección de ubicación (RV-18).
  -- Siempre asignado: un record sin asignar no se puede ni nombrar en el update.
  select * into zona from hidrantes.fn_municipio_de(
    case when 'ubicacion' = any (usa_propuesta) then r.geom else p.geom end);

  begin
    -- El diámetro de la propuesta, con las reglas del alta: una boca, el que trae o 45; un hidrante
    -- con otra medida no tiene diámetro que copiar, y no se ignora en silencio lo que pidió jefatura.
    if 'diametro_mm' = any (usa_propuesta) then
      diametro_propuesta := case when p.tipo = 'boca_riego'
                                 then coalesce((r.datos ->> 'diametro_mm')::smallint,
                                               ((r.datos ->> 'diametro_otro')::numeric)::smallint, 45)
                                 else (r.datos ->> 'diametro_mm')::smallint end;
      if diametro_propuesta is null then
        perform hidrantes.fn_error('DIAMETRO_SIN_FIJAR', 'La propuesta no trae 70 ni 100: deja el diámetro del punto');
      end if;
    end if;
    update hidrantes.puntos x set
      racor = case when 'racor' = any (usa_propuesta) then (r.datos ->> 'racor')::hidrantes.tipo_racor else x.racor end,
      caudal = case when 'caudal' = any (usa_propuesta) then (r.datos ->> 'caudal')::hidrantes.estado_caudal else x.caudal end,
      descripcion_fallo = case when 'caudal' = any (usa_propuesta)
                               then case when r.datos ->> 'caudal' = 'no_funciona'
                                         then nullif(trim(r.datos ->> 'descripcion_fallo'), '') end
                               else x.descripcion_fallo end,
      diametro_mm = coalesce(diametro_propuesta, x.diametro_mm),
      descripcion = case when 'descripcion' = any (usa_propuesta)
                         then nullif(trim(r.datos ->> 'descripcion'), '') else x.descripcion end,
      geom = case when 'ubicacion' = any (usa_propuesta) then r.geom else x.geom end,
      municipio = case when 'ubicacion' = any (usa_propuesta) then zona.municipio else x.municipio end,
      nucleo = case when 'ubicacion' = any (usa_propuesta) then zona.nucleo else x.nucleo end,
      -- Igual que fn_aplicar_propuesta: la dirección sugerida para el sitio nuevo, y si no la hay,
      -- se conserva la que tenía.
      direccion = case when 'ubicacion' = any (usa_propuesta)
                       then coalesce(r.direccion_sugerida, x.direccion) else x.direccion end,
      foto_path = r.foto_path,
      foto_sitio_path = coalesce(r.foto_sitio_path, x.foto_sitio_path),
      fecha_ultima_revision = current_date
    where x.id = p.id
    returning * into p;
  exception when check_violation or invalid_text_representation or numeric_value_out_of_range then
    perform hidrantes.fn_error('PAYLOAD_INVALIDO(fusion)', 'El resultado no cumple las reglas del punto');
  end;

  update hidrantes.propuestas x set estado = 'aprobada',
         correcciones = jsonb_build_object('punto_id', p.id, 'fusionada_con', p.codigo),
         revisada_por = actor, revisada_en = now()
   where x.id = r.id;
  perform hidrantes.fn_registrar(actor, null, true, 'fusion', p.id, r.id, antes, hidrantes.fn_punto_json(p));
  perform hidrantes.fn_avisar_autor(r.dispositivo_id, true, p.codigo);
  return jsonb_build_object('punto_id', p.id, 'codigo', p.codigo);
end $$;

-- ---------- 4. la purga no borra las fotos del sitio ----------
-- Misma firma y mismas reglas que 0026, más foto_sitio_path de puntos y de propuestas pendientes o
-- aprobadas. fn_fotos_referenciadas_lista() (0020) la lee, así que también queda cubierta.
create or replace function hidrantes.fn_fotos_referenciadas() returns setof text
language sql stable security definer set search_path = pg_catalog, hidrantes as $$
  select foto_path from hidrantes.puntos
  union
  select foto_sitio_path from hidrantes.puntos where foto_sitio_path is not null
  union
  select foto_path from hidrantes.propuestas where foto_path is not null and estado in ('pendiente', 'aprobada')
  union
  select foto_sitio_path from hidrantes.propuestas
   where foto_sitio_path is not null and estado in ('pendiente', 'aprobada')
  union
  select foto_path from hidrantes.subidas
   -- Al menos dos días, para que fn_proponer (que acepta dias - 1, y como mínimo 1) nunca confirme
   -- una reserva cuyo archivo ya se purgó (RV-48).
   where reservada_en > now() - make_interval(days => greatest((hidrantes.fn_config('dias_reserva_subida', '7') #>> '{}')::int, 2));
$$;

-- ---------- 5. vistas y exportación ----------
-- Las columnas nuevas van al final: create or replace view no admite reordenar las que ya existen.
create or replace view hidrantes.v_puntos_activos with (security_invoker = true) as
select
  p.id, p.codigo, p.tipo, p.diametro_mm, p.caudal, p.racor, p.descripcion_fallo, p.descripcion,
  p.direccion, p.foto_path, p.municipio, p.nucleo, p.fecha_ultima_revision, p.actualizado_en,
  extensions.st_y(p.geom::extensions.geometry) as lat,
  extensions.st_x(p.geom::extensions.geometry) as lng,
  hidrantes.fn_radio_px(p.diametro_mm, p.caudal) as radio_px,
  p.fecha_ultima_revision
    < (current_date - make_interval(months => (hidrantes.fn_config('meses_revision', '12') #>> '{}')::int))::date
    as revision_caducada,
  -- nueva en 0035
  p.foto_sitio_path
from hidrantes.puntos p
where p.situacion = 'activo';

create or replace view hidrantes.v_cola_revision with (security_invoker = true) as
select
  r.id, r.operacion, r.estado, r.creada_en, r.autor_nombre, r.autor_apellido, r.dispositivo_id,
  r.punto_id, p.codigo, p.tipo as tipo_actual, r.datos, r.foto_path, p.foto_path as foto_path_actual,
  r.direccion_sugerida, p.direccion as direccion_actual,
  extensions.st_y(r.geom::extensions.geometry) as lat,
  extensions.st_x(r.geom::extensions.geometry) as lng,
  (select jsonb_object_agg(k, to_jsonb(p) -> k)
     from jsonb_object_keys(r.datos) k
    where to_jsonb(p) ? k) as antes,
  r.datos as despues,
  r.origen_ubicacion, r.precision_gps_m, r.distancia_gps_m,
  case when r.exif_geom is not null and r.geom is not null
       then extensions.st_distance(r.exif_geom, r.geom) end as distancia_exif_m,
  case when r.geom is not null
       then (select m.municipio = 'fuera_de_zona' from hidrantes.fn_municipio_de(r.geom) m) end as fuera_de_zona,
  case when p.id is not null
       then (extract(year from age(current_date, p.fecha_ultima_revision)) * 12
             + extract(month from age(current_date, p.fecha_ultima_revision)))::int end as meses_desde_revision,
  r.duplicado_de, r.distancia_duplicado_m, d.codigo as codigo_duplicado,
  (r.datos ? 'diametro_otro') as otra_medida,
  coalesce(p.actualizado_en > r.creada_en, false) as desactualizada,
  case when p.id is not null then p.nucleo
       when r.geom is not null then (select m.nucleo from hidrantes.fn_municipio_de(r.geom) m) end as nucleo,
  p.actualizado_en as punto_actualizado_en,
  -- nuevas en 0035: las dos fotos del sitio y la señal de la app anterior
  r.foto_sitio_path,
  p.foto_sitio_path as foto_sitio_path_actual,
  (r.operacion in ('alta', 'ubicacion') and r.foto_sitio_path is null) as sin_foto_sitio
from hidrantes.propuestas r
left join hidrantes.puntos p on p.id = r.punto_id
left join hidrantes.puntos d on d.id = r.duplicado_de
where r.estado = 'pendiente';

-- Igual que 0006 más las dos fotos, para la columna foto_sitio de la exportación (FR-160). Claves
-- nuevas en el objeto: el panel anterior elige sus columnas y no las ve.
create or replace function hidrantes.fn_exportar_inventario(filtros jsonb default '{}') returns jsonb
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes as $$
declare
  actor text := hidrantes.fn_exigir_admin();
  f jsonb := coalesce(filtros, '{}');
  filas jsonb;
begin
  perform hidrantes.fn_exigir_claves(f, array['tipo', 'caudal', 'nucleo', 'diametro_mm', 'revision_caducada']);
  select coalesce(jsonb_agg(jsonb_build_object(
           'codigo', v.codigo, 'tipo', v.tipo, 'diametro_mm', v.diametro_mm, 'caudal', v.caudal, 'racor', v.racor,
           'direccion', v.direccion, 'nucleo', v.nucleo, 'municipio', v.municipio,
           'fecha_ultima_revision', v.fecha_ultima_revision, 'lat', v.lat, 'lng', v.lng,
           'foto_path', v.foto_path, 'foto_sitio_path', v.foto_sitio_path) order by v.codigo), '[]')
    into filas
    from hidrantes.v_puntos_activos v
   where (not f ? 'tipo' or v.tipo::text = f ->> 'tipo')
     and (not f ? 'caudal' or v.caudal::text = f ->> 'caudal')
     and (not f ? 'nucleo' or v.nucleo = f ->> 'nucleo')
     and (not f ? 'diametro_mm' or v.diametro_mm::text = f ->> 'diametro_mm')
     and (not f ? 'revision_caducada' or v.revision_caducada = (f ->> 'revision_caducada')::boolean);
  perform hidrantes.fn_registrar(actor, null, true, 'exportacion', null, null, null,
                                 jsonb_build_object('filtros', f, 'filas', jsonb_array_length(filas)));
  return filas;
end $$;

-- ---------- 6. tope diario de subidas ----------
-- Cuenta reservas, y un alta o una ubicación gastan dos. Se dobla solo si sigue en el valor de
-- fábrica: si jefatura lo cambió en Ajustes, se respeta.
do $tope$
declare n integer;
begin
  update hidrantes.config set valor = '80'::jsonb, actualizado_por = 'migracion'
   where clave = 'max_subidas_dispositivo_dia' and valor = '40'::jsonb and actualizado_por = 'migracion';
  get diagnostics n = row_count;
  raise notice 'max_subidas_dispositivo_dia de 40 a 80: %', case when n = 1 then 'sí' else 'no (jefatura lo había cambiado)' end;
end
$tope$;

-- El respaldo, por si la fila faltara, también es 80. Misma firma que 0005.
create or replace function hidrantes.fn_reservar_subida_para(d uuid) returns text
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes as $$
declare
  ruta text;
begin
  perform pg_advisory_xact_lock(hashtext('subidas:' || d::text));
  if (select count(*) from hidrantes.subidas s
       where s.dispositivo_id = d and s.reservada_en > now() - interval '1 day')
     >= (hidrantes.fn_config('max_subidas_dispositivo_dia', '80') #>> '{}')::int then
    perform hidrantes.fn_error('CUOTA_SUBIDAS_AGOTADA', 'Has llegado al máximo de fotos de hoy');
  end if;
  ruta := 'fotos/' || gen_random_uuid() || '.jpg';
  insert into hidrantes.subidas (dispositivo_id, foto_path) values (d, ruta);
  return ruta;
end $$;
