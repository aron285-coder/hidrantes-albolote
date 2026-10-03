-- 0032 · Bocas de riego de 45, 70 u otra medida (docs/24 RV-101, DEC-144, FR-16, FR-17).
--
-- Hasta aquí una boca era siempre 45 mm: la restricción lo exigía y la aprobación de cualquier
-- operación, y fn_editar_punto, le ponían 45. Ahora:
--   - una boca admite 45, 70 u "otra medida" entera de 20 a 150, que se aprueba tal cual (no hay
--     DIAMETRO_SIN_FIJAR en bocas); sin diámetro, 45, porque la app anterior no lo manda (04 §12);
--   - aprobar otra operación, editar y fusionar conservan el diámetro de la boca;
--   - "corregir datos" valida el diámetro contra el tipo del punto;
--   - fn_radio_px da factor por tramos (≤ 45 → 1, ≤ 70 → 2, > 70 → 3).
-- El hidrante no cambia. Mismas firmas; las funciones que bloquean filas conservan su lock_timeout.

-- ---------- restricción ----------
-- Las filas de hoy son todas 45 y la cumplen.
alter table hidrantes.puntos drop constraint puntos_diametro_boca;
alter table hidrantes.puntos add constraint puntos_diametro_boca
  check (tipo <> 'boca_riego' or diametro_mm between 20 and 150);

-- ---------- validación del diámetro ----------
-- Común al alta (tipo de los datos) y a "corregir datos" (tipo del punto). En un alta de hidrante el
-- diámetro es obligatorio; en una boca y en "corregir datos", no.
create function hidrantes.fn_validar_diametro(tipo text, datos jsonb, es_alta boolean) returns void
language plpgsql immutable set search_path = pg_catalog, hidrantes as $$
declare
  otro jsonb := datos -> 'diametro_otro';
begin
  if datos ? 'diametro_mm' and datos ? 'diametro_otro' then
    perform hidrantes.fn_error('PAYLOAD_INVALIDO(diametro_otro)', 'Indica una sola medida');
  end if;
  if tipo = 'boca_riego' then
    if otro is not null then
      -- Dos pasos: OR en SQL no garantiza el orden, y un texto no se puede convertir a número.
      if jsonb_typeof(otro) <> 'number' then
        perform hidrantes.fn_error('PAYLOAD_INVALIDO(diametro_otro)', 'La medida de una boca es un número entero de 20 a 150 mm');
      end if;
      if (otro #>> '{}')::numeric <> trunc((otro #>> '{}')::numeric)
         or (otro #>> '{}')::numeric not between 20 and 150 then
        perform hidrantes.fn_error('PAYLOAD_INVALIDO(diametro_otro)', 'La medida de una boca es un número entero de 20 a 150 mm');
      end if;
    -- coalesce: con un null explícito, "not in" da NULL y no se rechazaría.
    elsif datos ? 'diametro_mm' and coalesce(datos ->> 'diametro_mm', '') not in ('45', '70') then
      perform hidrantes.fn_error('PAYLOAD_INVALIDO(diametro_mm)', 'El diámetro de una boca es 45 o 70');
    end if;
  else
    if otro is not null then
      if not es_alta then
        -- Un hidrante con otra medida solo entra como alta, que jefatura fija antes de aprobar (FR-17).
        perform hidrantes.fn_error('PAYLOAD_INVALIDO(diametro_otro)', 'El diámetro de un hidrante es 70 o 100');
      end if;
      if jsonb_typeof(otro) <> 'number' then
        perform hidrantes.fn_error('PAYLOAD_INVALIDO(diametro_otro)', 'Otra medida no válida');
      end if;
    elsif (es_alta or datos ? 'diametro_mm') and coalesce(datos ->> 'diametro_mm', '') not in ('70', '100') then
      perform hidrantes.fn_error('PAYLOAD_INVALIDO(diametro_mm)', 'El diámetro es 70 o 100');
    end if;
  end if;
end $$;

revoke all on function hidrantes.fn_validar_diametro(text, jsonb, boolean) from public, anon, authenticated;

-- Misma firma que 0005. Solo cambia el diámetro: alta con fn_validar_diametro, y "corregir datos"
-- admite diametro_otro (el tipo del punto lo comprueba fn_proponer).
create or replace function hidrantes.fn_validar_datos(operacion hidrantes.operacion, datos jsonb) returns void
language plpgsql immutable set search_path = pg_catalog, hidrantes as $$
declare
  tipo text := datos ->> 'tipo';
begin
  begin
    perform (datos ->> 'tipo')::hidrantes.tipo_punto, (datos ->> 'caudal')::hidrantes.estado_caudal,
            (datos ->> 'racor')::hidrantes.tipo_racor;
  exception when invalid_text_representation then
    perform hidrantes.fn_error('PAYLOAD_INVALIDO(valor)', 'Valor fuera de la lista');
  end;

  case operacion
  when 'alta' then
    perform hidrantes.fn_exigir_claves(datos, array['tipo', 'diametro_mm', 'diametro_otro', 'caudal', 'racor',
                                                    'descripcion_fallo', 'descripcion']);
    perform hidrantes.fn_texto_obligatorio(datos, 'tipo');
    perform hidrantes.fn_texto_obligatorio(datos, 'caudal');
    if tipo = 'boca_riego' then
      perform hidrantes.fn_texto_obligatorio(datos, 'racor');
    elsif datos ? 'racor' then
      perform hidrantes.fn_error('PAYLOAD_INVALIDO(racor)', 'Los hidrantes no llevan racor');
    end if;
    perform hidrantes.fn_validar_diametro(tipo, datos, true);
  when 'revision', 'ubicacion' then
    perform hidrantes.fn_exigir_claves(datos, array['nota']);
  when 'estado' then
    perform hidrantes.fn_exigir_claves(datos, array['caudal', 'descripcion_fallo', 'nota']);
    perform hidrantes.fn_texto_obligatorio(datos, 'caudal');
  when 'datos' then
    perform hidrantes.fn_exigir_claves(datos, array['tipo', 'diametro_mm', 'diametro_otro', 'racor', 'descripcion']);
    if datos = '{}'::jsonb then
      perform hidrantes.fn_error('PAYLOAD_INVALIDO(datos)', 'No has cambiado nada');
    end if;
    if datos ? 'diametro_mm' and coalesce(datos ->> 'diametro_mm', '') not in ('45', '70', '100') then
      perform hidrantes.fn_error('PAYLOAD_INVALIDO(diametro_mm)', 'Diámetro no válido');
    end if;
  when 'retirada' then
    perform hidrantes.fn_exigir_claves(datos, array['motivo_rapido', 'motivo']);
    if coalesce(datos ->> 'motivo_rapido', '') not in ('obras', 'asfaltado', 'sustituido', 'otro') then
      perform hidrantes.fn_error('PAYLOAD_INVALIDO(motivo_rapido)', 'Elige un motivo');
    end if;
    perform hidrantes.fn_texto_obligatorio(datos, 'motivo');
  end case;

  if datos ->> 'caudal' = 'no_funciona' then
    perform hidrantes.fn_texto_obligatorio(datos, 'descripcion_fallo');
  end if;
end $$;

-- ---------- fn_proponer ----------
-- Igual que 0026, más la comprobación del diámetro de "corregir datos" contra el tipo del punto.
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
  select * into existente from hidrantes.propuestas r where r.clave_local = fn_proponer.clave_local;
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
     where s.foto_path = fn_proponer.foto_path and s.dispositivo_id = d
       -- Una reserva sin confirmar de más de dias_reserva - 1 días pudo perder su archivo en la purga:
       -- se pide otra subida (RV-07). Nunca menos de un día: con dias_reserva_subida = 1 se rechazaban
       -- todas y la cola reintentaba sin fin (RV-48).
       and (s.confirmada_en is not null
            or s.reservada_en > now() - make_interval(days => greatest(dias_reserva - 1, 1)));
    if not found then
      perform hidrantes.fn_error('FOTO_NO_RESERVADA', 'La foto no se subió desde este móvil');
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
     geom, gps_geom, precision_gps_m, exif_geom, distancia_gps_m, duplicado_de, distancia_duplicado_m, foto_path)
  values
    (fn_proponer.punto_id, operacion, datos_ok, trim(autor_nombre), trim(autor_apellido), d, fn_proponer.clave_local,
     case when nueva_geom is not null then origen end, nueva_geom, gps, precision_gps_m, exif,
     case when nueva_geom is not null and gps is not null then st_distance(nueva_geom, gps) end,
     dup_id, dup_m, fn_proponer.foto_path)
  on conflict on constraint propuestas_clave_local_key do nothing
  returning r.id into nuevo_id;

  if nuevo_id is null then
    -- Otro envío con la misma marca entró a la vez (05 §11): se devuelve ese.
    return hidrantes.fn_proponer(token, clave_local, autor_nombre, autor_apellido, operacion, punto_id, datos,
      origen, lat, lng, gps_lat, gps_lng, precision_gps_m, exif_lat, exif_lng, foto_path);
  end if;

  perform hidrantes.fn_registrar(coalesce(admin_email, trim(autor_nombre) || ' ' || trim(autor_apellido)),
    case when admin_email is null then d end, admin_email is not null, 'propuesta_creada',
    fn_proponer.punto_id, nuevo_id, null, jsonb_build_object('operacion', operacion, 'datos', datos_ok));

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

-- ---------- aprobación ----------
-- Igual que 0023 salvo el diámetro de las bocas: en un alta, coalesce(diametro_mm, diametro_otro, 45);
-- en las demás operaciones, el que traiga la propuesta o el que ya tenía (antes, siempre 45).
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
                                    direccion, foto_path, municipio, nucleo, fecha_ultima_revision)
      values (hidrantes.fn_siguiente_codigo(tipo_final), tipo_final, r.geom, diametro_final,
              (m ->> 'caudal')::hidrantes.estado_caudal,
              case when tipo_final = 'boca_riego' then (m ->> 'racor')::hidrantes.tipo_racor end,
              nullif(trim(m ->> 'descripcion_fallo'), ''), nullif(trim(m ->> 'descripcion'), ''),
              coalesce(nullif(trim(c ->> 'direccion'), ''), r.direccion_sugerida),
              r.foto_path, zona.municipio, zona.nucleo, current_date)
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

-- ---------- edición directa de jefatura ----------
-- Igual que 0024 salvo el diámetro: ya no pone 45 a toda boca; la restricción valida el resultado.
create or replace function hidrantes.fn_editar_punto(punto_id uuid, cambios jsonb) returns void
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes
set lock_timeout = '5s' as $$
declare
  actor text := hidrantes.fn_exigir_admin();
  p hidrantes.puntos;
  antes jsonb;
  tipo_final hidrantes.tipo_punto;
  caudal_final hidrantes.estado_caudal;
begin
  if cambios is null or jsonb_typeof(cambios) <> 'object' or cambios = '{}'::jsonb then
    perform hidrantes.fn_error('PAYLOAD_INVALIDO(cambios)', 'No has cambiado nada');
  end if;
  perform hidrantes.fn_exigir_claves(cambios, array['tipo', 'diametro_mm', 'caudal', 'racor', 'descripcion_fallo',
                                                    'descripcion', 'direccion']);
  select * into p from hidrantes.puntos x where x.id = punto_id for update;
  if not found or p.situacion <> 'activo' then
    perform hidrantes.fn_error('PUNTO_NO_ACTIVO', 'El punto ya no está activo');
  end if;
  antes := hidrantes.fn_punto_json(p);
  if cambios ? 'tipo' and cambios ->> 'tipo' is distinct from p.tipo::text then
    perform hidrantes.fn_error('TIPO_NO_MODIFICABLE', 'El tipo no se cambia: propón retirarlo y da de alta el correcto');
  end if;
  begin
    tipo_final := coalesce((cambios ->> 'tipo')::hidrantes.tipo_punto, p.tipo);
    caudal_final := coalesce((cambios ->> 'caudal')::hidrantes.estado_caudal, p.caudal);
    update hidrantes.puntos x set
      tipo = tipo_final,
      diametro_mm = coalesce((cambios ->> 'diametro_mm')::smallint, x.diametro_mm),
      caudal = caudal_final,
      racor = case when tipo_final = 'boca_riego' then coalesce((cambios ->> 'racor')::hidrantes.tipo_racor, x.racor) end,
      -- La nota de fallo solo vale mientras no funciona: si vuelve a funcionar, se borra (RV-42).
      descripcion_fallo = case when caudal_final <> 'no_funciona' then null
                               when cambios ? 'descripcion_fallo' then nullif(trim(cambios ->> 'descripcion_fallo'), '')
                               else x.descripcion_fallo end,
      descripcion = case when cambios ? 'descripcion' then nullif(trim(cambios ->> 'descripcion'), '') else x.descripcion end,
      direccion = case when cambios ? 'direccion' then nullif(trim(cambios ->> 'direccion'), '') else x.direccion end
    where x.id = punto_id
    returning * into p;
  exception when check_violation or invalid_text_representation or numeric_value_out_of_range then
    perform hidrantes.fn_error('PAYLOAD_INVALIDO(' || coalesce(hidrantes.constraint_name_de(sqlerrm), 'cambios') || ')',
                               'El resultado no cumple las reglas del punto');
  end;
  perform hidrantes.fn_registrar(actor, null, true, 'edicion_admin', punto_id, null, antes, hidrantes.fn_punto_json(p));
end $$;

-- ---------- fusión ----------
-- Igual que 0017 salvo el diámetro de la propuesta: en una boca puede venir como diametro_otro o no
-- venir (45); en un hidrante con otra medida, DIAMETRO_SIN_FIJAR en vez de ignorar la elección.
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
                               then nullif(trim(r.datos ->> 'descripcion_fallo'), '') else x.descripcion_fallo end,
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

-- ---------- tamaño del marcador (06 §4) ----------
-- Factor de diámetro por tramos: con otras medidas en bocas, "else 0" las dejaba al tamaño mínimo
-- aunque funcionen. Mismo criterio que 06 §4: más diámetro, más agua aprovechable.
create or replace function hidrantes.fn_radio_px(diametro_mm smallint, caudal hidrantes.estado_caudal) returns numeric
language sql stable set search_path = pg_catalog, hidrantes as $$
  with p as (
    select (case when diametro_mm is null then 0
                 when diametro_mm <= 45 then 1
                 when diametro_mm <= 70 then 2
                 else 3 end)
         * (case caudal when 'bueno' then 1.0 when 'regular' then 0.66 when 'malo' then 0.33 else 0 end)
           as puntuacion,
           hidrantes.fn_config('escala_radios', '[11, 9, 7, 5.5, 5]') as r
  )
  select ((p.r ->> case
            when p.puntuacion >= 3.0 then 0
            when p.puntuacion >= 1.9 then 1
            when p.puntuacion >= 0.9 then 2
            when p.puntuacion > 0    then 3
            else 4
          end))::numeric
  from p;
$$;

-- ---------- altas ya aprobadas sin el punto en correcciones ----------
-- Las aprobadas sin correcciones antes de 0032 se quedaron con correcciones = NULL. El registro sabe
-- qué punto creó cada una: se completa para que Mis propuestas enseñe su código.
do $completar$
declare n integer;
begin
  update hidrantes.propuestas r
     set correcciones = coalesce(r.correcciones, '{}'::jsonb) || jsonb_build_object('punto_id', g.punto_id)
    from hidrantes.registro g
   where r.operacion = 'alta' and r.estado = 'aprobada' and r.correcciones is null
     and g.propuesta_id = r.id and g.accion in ('aprobacion', 'aprobacion_con_correcciones')
     and g.punto_id is not null;
  get diagnostics n = row_count;
  raise notice 'altas aprobadas con el punto recuperado del registro: %', n;
  select count(*) into n from hidrantes.propuestas
   where operacion = 'alta' and estado = 'aprobada' and correcciones is null;
  if n > 0 then
    raise warning 'altas aprobadas que siguen sin punto (sin fila en registro): %', n;
  end if;
end
$completar$;
