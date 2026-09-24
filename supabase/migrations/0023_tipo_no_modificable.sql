-- 0023 · El tipo de un punto no se cambia (docs/18 RV-41, DEC-090).
--
-- "Corregir datos", fn_editar_punto y las correcciones de fn_aplicar_propuesta admitían `tipo`, y
-- `codigo` no cambia: una boca de riego podía quedarse como HID-0123. Rompía FR-10, y el radio
-- del marcador y el prefijo del código se deducen del tipo. Ahora, fuera de un alta, un tipo
-- distinto del actual da TIPO_NO_MODIFICABLE. Un tipo igual al actual se acepta: el frontend
-- anterior lo manda siempre en "corregir datos" (04 §12). En un alta sí se corrige: aún no hay código.
--
-- Mismas firmas. fn_aplicar_propuesta y fn_editar_punto conservan el lock_timeout de 0016 (lo
-- declaran de nuevo: create or replace sustituye los atributos). fn_aprobar_lote ya omite con su
-- código cualquier raise_exception de una propuesta.


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
       -- se pide otra subida (RV-07).
       and (s.confirmada_en is not null or s.reservada_en > now() - make_interval(days => dias_reserva - 1));
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
      diametro_final := case when tipo_final = 'boca_riego' then 45 else (m ->> 'diametro_mm')::smallint end;
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
      diametro_final := case when tipo_final = 'boca_riego' then 45
                             else coalesce((m ->> 'diametro_mm')::smallint, p.diametro_mm) end;
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
    when check_violation or not_null_violation or invalid_text_representation then
      perform hidrantes.fn_error('PAYLOAD_INVALIDO(' || coalesce(hidrantes.constraint_name_de(sqlerrm), 'datos') || ')',
                                 'El resultado no cumple las reglas del punto');
  end;

  accion := case when c = '{}'::jsonb then 'aprobacion' else 'aprobacion_con_correcciones' end;
  update hidrantes.propuestas x
     set estado = 'aprobada', correcciones = nullif(c, '{}'::jsonb)
                 || case when r.operacion = 'alta' then jsonb_build_object('punto_id', p.id) else '{}'::jsonb end,
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

create or replace function hidrantes.fn_editar_punto(punto_id uuid, cambios jsonb) returns void
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes
set lock_timeout = '5s' as $$
declare
  actor text := hidrantes.fn_exigir_admin();
  p hidrantes.puntos;
  antes jsonb;
  tipo_final hidrantes.tipo_punto;
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
    update hidrantes.puntos x set
      tipo = tipo_final,
      diametro_mm = case when tipo_final = 'boca_riego' then 45
                         else coalesce((cambios ->> 'diametro_mm')::smallint, x.diametro_mm) end,
      caudal = coalesce((cambios ->> 'caudal')::hidrantes.estado_caudal, x.caudal),
      racor = case when tipo_final = 'boca_riego' then coalesce((cambios ->> 'racor')::hidrantes.tipo_racor, x.racor) end,
      descripcion_fallo = case when cambios ? 'descripcion_fallo' then nullif(trim(cambios ->> 'descripcion_fallo'), '')
                               else x.descripcion_fallo end,
      descripcion = case when cambios ? 'descripcion' then nullif(trim(cambios ->> 'descripcion'), '') else x.descripcion end,
      direccion = case when cambios ? 'direccion' then nullif(trim(cambios ->> 'direccion'), '') else x.direccion end
    where x.id = punto_id
    returning * into p;
  exception when check_violation or invalid_text_representation then
    perform hidrantes.fn_error('PAYLOAD_INVALIDO(' || coalesce(hidrantes.constraint_name_de(sqlerrm), 'cambios') || ')',
                               'El resultado no cumple las reglas del punto');
  end;
  perform hidrantes.fn_registrar(actor, null, true, 'edicion_admin', punto_id, null, antes, hidrantes.fn_punto_json(p));
end $$;

-- Propuestas pendientes que cambiarían el tipo: no se tocan solas; jefatura las rechaza con motivo.
do $aviso$
declare n integer;
begin
  select count(*) into n
    from hidrantes.propuestas r join hidrantes.puntos p on p.id = r.punto_id
   where r.estado = 'pendiente' and r.operacion <> 'alta'
     and r.datos ? 'tipo' and r.datos ->> 'tipo' is distinct from p.tipo::text;
  raise notice 'propuestas pendientes que cambian el tipo (se rechazan a mano): %', n;
end
$aviso$;
