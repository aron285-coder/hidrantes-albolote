-- 0026 · Límites y defensas pequeñas (docs/18 RV-48). Mismas firmas (04 §12).
--
-- 1. dias_reserva_subida = 1 rechazaba todas las reservas (dias - 1 = 0) y la cola reintentaba sin
--    fin: fn_proponer acepta como mínimo un día y la purga protege como mínimo dos.
-- 3. Cada petición bloqueada insertaba una fila en intentos_codigo bajo el bloqueo global: una
--    inundación la hacía crecer. Ahora, una por IP, tope y minuto.
-- 4. fn_renombrar_nucleo bloquea filas sin lock_timeout (el resto lo lleva desde 0016).
-- (2 y 5 son de las Pages Functions: normalizarIp y la clave de caché de /api/direccion.)

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

create or replace function hidrantes.fn_fotos_referenciadas() returns setof text
language sql stable security definer set search_path = pg_catalog, hidrantes as $$
  select foto_path from hidrantes.puntos
  union
  select foto_path from hidrantes.propuestas where foto_path is not null and estado in ('pendiente', 'aprobada')
  union
  select foto_path from hidrantes.subidas
   -- Al menos dos días, para que fn_proponer (que acepta dias - 1, y como mínimo 1) nunca confirme
   -- una reserva cuyo archivo ya se purgó (RV-48).
   where reservada_en > now() - make_interval(days => greatest((hidrantes.fn_config('dias_reserva_subida', '7') #>> '{}')::int, 2));
$$;

create or replace function hidrantes.fn_verificar_codigo(codigo text, dispositivo_id uuid, ip_hash text)
returns table (token text, caduca_en timestamptz, error text)
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes, extensions as $$
declare
  hash_guardado text := hidrantes.fn_config('codigo_acceso_hash', 'null') #>> '{}';
  -- Hash de relleno: si no hay código configurado se compara igual, para no ir más rápido.
  hash_comparar text := coalesce(hash_guardado, '$2a$10$T2CrJzJ.jvwByYIdKCVGJuV9fgfGpbsMwlear973cpAtdy3VfD6/G');
  fallos_dispositivo integer;
  fallos_ip integer;
  fallos_global integer;
  altas_ip integer;
  altas_global integer;
  tope_alcanzado text;
  correcto boolean;
  nuevo text;
  caducidad integer := (hidrantes.fn_config('dias_caducidad_token', '365') #>> '{}')::int;
begin
  -- Un canje cada vez: la cuenta y la anotación van bajo el mismo bloqueo, así que peticiones en
  -- paralelo no pasan el tope (RV-14, 05 §11). Primera sentencia a propósito.
  perform pg_advisory_xact_lock(hashtext('hidrantes:intentos_codigo'));

  -- Fallos de la última hora (sin contar los ya bloqueados) y canjes buenos.
  select count(*) filter (where i.momento > now() - interval '1 hour' and not i.exito and not i.bloqueado
                            and i.dispositivo_id = fn_verificar_codigo.dispositivo_id),
         count(*) filter (where i.momento > now() - interval '1 hour' and not i.exito and not i.bloqueado
                            and i.ip_hash = fn_verificar_codigo.ip_hash),
         count(*) filter (where i.momento > now() - interval '1 hour' and not i.exito and not i.bloqueado),
         count(*) filter (where i.exito and i.ip_hash = fn_verificar_codigo.ip_hash),
         count(*) filter (where i.exito and i.momento > now() - interval '1 hour')
    into fallos_dispositivo, fallos_ip, fallos_global, altas_ip, altas_global
    from hidrantes.intentos_codigo i
   where i.momento > now() - interval '24 hours';

  tope_alcanzado := case
    when fallos_dispositivo >= (hidrantes.fn_config('max_intentos_dispositivo', '10') #>> '{}')::int then 'dispositivo'
    when fallos_ip >= (hidrantes.fn_config('max_intentos_ip', '30') #>> '{}')::int then 'ip'
    when fallos_global >= (hidrantes.fn_config('max_intentos_global', '200') #>> '{}')::int then 'global'
    when altas_ip >= (hidrantes.fn_config('max_altas_ip_dia', '150') #>> '{}')::int then 'altas_ip'
    when altas_global >= (hidrantes.fn_config('max_altas_global_hora', '150') #>> '{}')::int then 'altas_global'
  end;
  if tope_alcanzado is not null then
    -- Anotado para Salud del sistema y la vigilancia; no cuenta como fallo. Una fila por IP y tope
    -- y minuto como mucho: una inundación bajo el bloqueo global no hace crecer la tabla (RV-48).
    if not exists (select 1 from hidrantes.intentos_codigo i
                    where i.bloqueado and i.ip_hash = fn_verificar_codigo.ip_hash and i.tope = tope_alcanzado
                      and i.momento > now() - interval '1 minute') then
      insert into hidrantes.intentos_codigo (dispositivo_id, ip_hash, exito, bloqueado, tope)
      values (fn_verificar_codigo.dispositivo_id, fn_verificar_codigo.ip_hash, false, true, tope_alcanzado);
    end if;
    return query select null::text, null::timestamptz, 'DEMASIADOS_INTENTOS'::text;
    return;
  end if;

  -- bcrypt siempre, con código bien o mal formado: tiempo constante (TR-42).
  correcto := crypt(coalesce(codigo, ''), hash_comparar) = hash_comparar
              and hash_guardado is not null
              and coalesce(codigo, '') ~ '^[0-9]{6}$';

  insert into hidrantes.intentos_codigo (dispositivo_id, ip_hash, exito)
  values (fn_verificar_codigo.dispositivo_id, fn_verificar_codigo.ip_hash, correcto);

  if not correcto then
    return query select null::text, null::timestamptz, 'CODIGO_INCORRECTO'::text;
    return;
  end if;

  nuevo := hidrantes.fn_aleatorio_b64url(32);
  insert into hidrantes.dispositivos (dispositivo_id, token_hash) values (fn_verificar_codigo.dispositivo_id, hidrantes.fn_sha256(nuevo));
  return query select nuevo, now() + make_interval(days => caducidad), null::text;
end $$;

alter function hidrantes.fn_renombrar_nucleo(text, text) set lock_timeout = '5s';
