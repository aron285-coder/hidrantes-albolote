-- 0005 · Helpers y RPC de voluntario (05 §6.1, §6.3, §11; 11 §3; DEC-059).
-- Todas SECURITY DEFINER con search_path fijo. Errores: P0001 con 'CODIGO: texto' (05 §8).

-- La revocación de 0001 ("in schema") no bastaba: los privilegios por defecto de un esquema solo
-- añaden, nunca quitan el execute que Postgres da a PUBLIC. Esta sí, para todo lo que cree el rol
-- de migraciones a partir de aquí. El test 02_permisos lo vigila (DEC-059).
alter default privileges revoke execute on functions from public;

-- ---------- helpers ----------

create function hidrantes.fn_error(codigo text, texto text) returns void
language plpgsql set search_path = pg_catalog as $$
begin
  raise exception using errcode = 'P0001', message = codigo || ': ' || texto;
end $$;

-- Correo del JWT de la petición, en minúsculas; null si no hay sesión de Google.
create function hidrantes.fn_email_jwt() returns text
language sql stable set search_path = pg_catalog as $$
  select lower(nullif(nullif(current_setting('request.jwt.claims', true), ''), 'null')::jsonb ->> 'email');
$$;

-- Aborta con NO_AUTORIZADO si quien llama no es administrador activo; devuelve su correo.
create function hidrantes.fn_exigir_admin() returns text
language plpgsql stable security definer set search_path = pg_catalog, hidrantes as $$
begin
  if not hidrantes.fn_es_admin() then
    perform hidrantes.fn_error('NO_AUTORIZADO', 'Solo jefatura puede hacer esto');
  end if;
  return hidrantes.fn_email_jwt();
end $$;

-- Identidad técnica estable de un administrador (DEC-059): la misma en cada sesión, para que sus
-- reservas de foto y sus propuestas casen.
create function hidrantes.fn_dispositivo_admin(email text) returns uuid
language sql immutable set search_path = pg_catalog as $$
  select md5('administrador:' || lower(email))::uuid;
$$;

create function hidrantes.fn_registrar(
  actor text, dispositivo_id uuid, es_admin boolean, accion text,
  punto_id uuid, propuesta_id uuid, antes jsonb, despues jsonb
) returns void
language sql security definer set search_path = pg_catalog, hidrantes as $$
  insert into hidrantes.registro (actor, dispositivo_id, es_admin, accion, punto_id, propuesta_id, antes, despues)
  values (actor, dispositivo_id, es_admin, accion, punto_id, propuesta_id, antes, despues);
$$;

-- Punto en forma de JSON para el registro y las respuestas (sin geom binaria).
create function hidrantes.fn_punto_json(p hidrantes.puntos) returns jsonb
language sql stable set search_path = pg_catalog, hidrantes, extensions as $$
  select (to_jsonb(p) - 'geom')
         || jsonb_build_object('lat', st_y(p.geom::geometry), 'lng', st_x(p.geom::geometry));
$$;

create function hidrantes.fn_punto_geo(lat double precision, lng double precision)
returns extensions.geography
language plpgsql immutable set search_path = pg_catalog, extensions as $$
begin
  if lat is null or lng is null then
    return null;
  end if;
  if lat not between 36.6 and 38.2 or lng not between -4.5 and -2.5 then
    perform hidrantes.fn_error('PAYLOAD_INVALIDO(lat)', 'Coordenadas fuera de la provincia');
  end if;
  return st_setsrid(st_makepoint(lng, lat), 4326)::geography;
end $$;

-- Base64url sin relleno de bytes aleatorios.
create function hidrantes.fn_aleatorio_b64url(n integer) returns text
language sql volatile set search_path = pg_catalog, extensions as $$
  select rtrim(translate(encode(gen_random_bytes(n), 'base64'), E'+/\n', '-_'), '=');
$$;

create function hidrantes.fn_sha256(t text) returns text
language sql immutable set search_path = pg_catalog, extensions as $$
  select encode(digest(t, 'sha256'), 'hex');
$$;

-- ---------- token de dispositivo (05 §6.1) ----------

create function hidrantes.fn_validar_token(token text) returns uuid
language plpgsql security definer set search_path = pg_catalog, hidrantes as $$
declare
  d hidrantes.dispositivos;
  caducidad integer := (hidrantes.fn_config('dias_caducidad_token', '365') #>> '{}')::int;
begin
  if token is null or length(token) < 20 then
    perform hidrantes.fn_error('TOKEN_INVALIDO', 'Acceso no válido');
  end if;
  select * into d from hidrantes.dispositivos where token_hash = hidrantes.fn_sha256(token);
  if not found then
    perform hidrantes.fn_error('TOKEN_INVALIDO', 'Acceso no válido');
  end if;
  if d.revocado_en is not null then
    perform hidrantes.fn_error('TOKEN_REVOCADO', 'El acceso de este móvil se ha revocado');
  end if;
  if d.ultimo_uso < now() - make_interval(days => caducidad) then
    perform hidrantes.fn_error('TOKEN_CADUCADO', 'El acceso de este móvil ha caducado');
  end if;
  -- Uso reciente: se anota como mucho una vez por hora para no escribir en cada lectura.
  if d.ultimo_uso < now() - interval '1 hour' then
    update hidrantes.dispositivos set ultimo_uso = now() where id = d.id;
  end if;
  return d.dispositivo_id;
end $$;

-- Canje del código por un token (FR-30–FR-33, 11 §3). Solo service_role, desde /api/verificar-codigo.
-- Devuelve el error como dato en lugar de lanzarlo: una excepción desharía la anotación del
-- intento y el límite no contaría nunca (DEC-059).
create function hidrantes.fn_verificar_codigo(codigo text, dispositivo_id uuid, ip_hash text)
returns table (token text, caduca_en timestamptz, error text)
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes, extensions as $$
declare
  hash_guardado text := hidrantes.fn_config('codigo_acceso_hash', 'null') #>> '{}';
  -- Hash de relleno: si no hay código configurado se compara igual, para no ir más rápido.
  hash_comparar text := coalesce(hash_guardado, '$2a$10$T2CrJzJ.jvwByYIdKCVGJuV9fgfGpbsMwlear973cpAtdy3VfD6/G');
  fallos_dispositivo integer;
  fallos_ip integer;
  fallos_global integer;
  correcto boolean;
  nuevo text;
  caducidad integer := (hidrantes.fn_config('dias_caducidad_token', '365') #>> '{}')::int;
begin
  -- Cuenta y anota en la misma transacción (05 §11); solo cuentan los fallos.
  select count(*) filter (where i.dispositivo_id = fn_verificar_codigo.dispositivo_id),
         count(*) filter (where i.ip_hash = fn_verificar_codigo.ip_hash),
         count(*)
    into fallos_dispositivo, fallos_ip, fallos_global
    from hidrantes.intentos_codigo i
   where i.momento > now() - interval '1 hour' and not i.exito;

  if fallos_dispositivo >= (hidrantes.fn_config('max_intentos_dispositivo', '10') #>> '{}')::int
     or fallos_ip >= (hidrantes.fn_config('max_intentos_ip', '30') #>> '{}')::int
     or fallos_global >= (hidrantes.fn_config('max_intentos_global', '200') #>> '{}')::int then
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

-- ---------- lectura del mapa (05 §10) ----------

create function hidrantes.fn_listar_puntos(token text, desde timestamptz default null) returns jsonb
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes as $$
declare
  ahora timestamptz := now();
begin
  perform hidrantes.fn_validar_token(token);
  return jsonb_build_object(
    'puntos', coalesce((
      select jsonb_agg(to_jsonb(v) order by v.codigo)
      from hidrantes.v_puntos_activos v
      where desde is null or v.actualizado_en > desde
    ), '[]'::jsonb),
    'bajas', case when desde is null then '[]'::jsonb else coalesce((
      select jsonb_agg(p.id)
      from hidrantes.puntos p
      where p.situacion <> 'activo' and p.actualizado_en > desde
    ), '[]'::jsonb) end,
    -- 60 s de solape: una escritura que aún no había confirmado al leer entra en la siguiente
    -- sincronización (el cliente reemplaza por id, así que repetir no duplica).
    'sincronizado_en', ahora - interval '60 seconds',
    'config', jsonb_build_object(
      'meses_revision',    hidrantes.fn_config('meses_revision', '12'),
      'radio_duplicado_m', hidrantes.fn_config('radio_duplicado_m', '25'),
      'escala_radios',     hidrantes.fn_config('escala_radios', '[11, 9, 7, 5.5, 5]'),
      'version_zona',      hidrantes.fn_config('version_zona', 'null'),
      'version_mapabase',  hidrantes.fn_config('version_mapabase', 'null')
    )
  );
end $$;

-- Ficha sin historial ni autores (FR-27, FR-66).
create function hidrantes.fn_ficha_punto(token text, punto_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes as $$
declare
  r jsonb;
begin
  perform hidrantes.fn_validar_token(token);
  select to_jsonb(v) into r from hidrantes.v_puntos_activos v where v.id = punto_id;
  if r is null then
    perform hidrantes.fn_error('PUNTO_NO_ENCONTRADO', 'Ese punto no existe o ya no está activo');
  end if;
  return r;
end $$;

-- ---------- fotos (FR-38, TR-45) ----------

-- Reserva común: cuenta y reserva bajo un bloqueo por dispositivo, para que dos peticiones a la
-- vez no pasen las dos el tope (05 §11). Sin execute para nadie.
create function hidrantes.fn_reservar_subida_para(d uuid) returns text
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes as $$
declare
  ruta text;
begin
  perform pg_advisory_xact_lock(hashtext('subidas:' || d::text));
  if (select count(*) from hidrantes.subidas s
       where s.dispositivo_id = d and s.reservada_en > now() - interval '1 day')
     >= (hidrantes.fn_config('max_subidas_dispositivo_dia', '40') #>> '{}')::int then
    perform hidrantes.fn_error('CUOTA_SUBIDAS_AGOTADA', 'Has llegado al máximo de fotos de hoy');
  end if;
  ruta := 'fotos/' || gen_random_uuid() || '.jpg';
  insert into hidrantes.subidas (dispositivo_id, foto_path) values (d, ruta);
  return ruta;
end $$;

-- Voluntario: solo service_role, desde /api/url-subida (FR-38, TR-45).
create function hidrantes.fn_reservar_subida(token text) returns text
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes as $$
begin
  return hidrantes.fn_reservar_subida_para(hidrantes.fn_validar_token(token));
end $$;

-- Jefatura desde el móvil (FR-151): con su sesión de Google y su dispositivo técnico (DEC-059).
create function hidrantes.fn_reservar_subida_admin() returns text
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes as $$
begin
  return hidrantes.fn_reservar_subida_para(hidrantes.fn_dispositivo_admin(hidrantes.fn_exigir_admin()));
end $$;

-- ---------- propuestas (FR-40–FR-49, 05 §7) ----------

create function hidrantes.fn_exigir_claves(datos jsonb, permitidas text[]) returns void
language plpgsql immutable set search_path = pg_catalog as $$
declare
  k text;
begin
  for k in select jsonb_object_keys(datos) loop
    if not k = any (permitidas) then
      perform hidrantes.fn_error('PAYLOAD_INVALIDO(' || k || ')', 'Campo no admitido');
    end if;
  end loop;
end $$;

create function hidrantes.fn_texto_obligatorio(datos jsonb, clave text) returns text
language plpgsql immutable set search_path = pg_catalog as $$
declare
  v text := nullif(trim(datos ->> clave), '');
begin
  if v is null then
    perform hidrantes.fn_error('PAYLOAD_INVALIDO(' || clave || ')', 'Falta un dato obligatorio');
  end if;
  return v;
end $$;

-- Valida datos de alta/estado/datos contra los enums y las reglas de 05 §2.1.
create function hidrantes.fn_validar_datos(operacion hidrantes.operacion, datos jsonb) returns void
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
    else
      if datos ? 'racor' then
        perform hidrantes.fn_error('PAYLOAD_INVALIDO(racor)', 'Los hidrantes no llevan racor');
      end if;
      if datos ? 'diametro_otro' then
        if datos ? 'diametro_mm' or jsonb_typeof(datos -> 'diametro_otro') <> 'number' then
          perform hidrantes.fn_error('PAYLOAD_INVALIDO(diametro_otro)', 'Otra medida no válida');
        end if;
      elsif coalesce(datos ->> 'diametro_mm', '') not in ('70', '100') then
        perform hidrantes.fn_error('PAYLOAD_INVALIDO(diametro_mm)', 'El diámetro es 70 o 100');
      end if;
    end if;
  when 'revision', 'ubicacion' then
    perform hidrantes.fn_exigir_claves(datos, array['nota']);
  when 'estado' then
    perform hidrantes.fn_exigir_claves(datos, array['caudal', 'descripcion_fallo', 'nota']);
    perform hidrantes.fn_texto_obligatorio(datos, 'caudal');
  when 'datos' then
    perform hidrantes.fn_exigir_claves(datos, array['tipo', 'diametro_mm', 'racor', 'descripcion']);
    if datos = '{}'::jsonb then
      perform hidrantes.fn_error('PAYLOAD_INVALIDO(datos)', 'No has cambiado nada');
    end if;
    if datos ? 'diametro_mm' and datos ->> 'diametro_mm' not in ('45', '70', '100') then
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

-- Aviso a jefatura de propuestas nuevas, como mucho uno por hora y suscripción (FR-164).
create function hidrantes.fn_avisar_jefatura() returns void
language sql security definer set search_path = pg_catalog, hidrantes as $$
  insert into hidrantes.notificaciones (suscripcion_id, titulo, cuerpo, url)
  select s.id, 'Propuestas nuevas', 'Hay propuestas pendientes de revisar.', '/admin'
  from hidrantes.suscripciones_push s
  where s.email is not null and 'nuevas_propuestas' = any (s.temas)
    and not exists (
      select 1 from hidrantes.notificaciones n
      where n.suscripcion_id = s.id and n.titulo = 'Propuestas nuevas' and n.creada_en > now() - interval '1 hour'
    );
$$;

-- Resultado de una propuesta a su autor, sin nombres (FR-27, FR-163).
create function hidrantes.fn_avisar_autor(dispositivo uuid, aprobada boolean, codigo text) returns void
language sql security definer set search_path = pg_catalog, hidrantes as $$
  insert into hidrantes.notificaciones (suscripcion_id, titulo, cuerpo, url)
  select s.id,
         case when aprobada then 'Propuesta aprobada' else 'Propuesta rechazada' end,
         case when aprobada then 'Jefatura ha aprobado tu propuesta' else 'Jefatura ha rechazado tu propuesta' end
           || coalesce(' de ' || codigo, '') || '.',
         '/mis-propuestas'
  from hidrantes.suscripciones_push s
  where s.dispositivo_id = dispositivo and 'resultado_propuesta' = any (s.temas);
$$;

create function hidrantes.fn_proponer(
  token text, clave_local text, autor_nombre text, autor_apellido text,
  operacion hidrantes.operacion, punto_id uuid, datos jsonb,
  origen hidrantes.origen_ubicacion, lat double precision, lng double precision,
  gps_lat double precision, gps_lng double precision, precision_gps_m real,
  exif_lat double precision, exif_lng double precision,
  foto_path text
) returns jsonb
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes, extensions
set statement_timeout = '10s' as $$
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
     where s.foto_path = fn_proponer.foto_path and s.dispositivo_id = d;
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

-- Solo las del propio móvil; nunca quién decidió (FR-27, FR-91).
create function hidrantes.fn_mis_propuestas(token text) returns setof jsonb
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes as $$
declare
  d uuid := hidrantes.fn_validar_token(token);
begin
  return query
  select jsonb_build_object(
    'id', r.id, 'clave_local', r.clave_local, 'operacion', r.operacion, 'punto_id', r.punto_id,
    'codigo', coalesce(p.codigo, f.codigo), 'datos', r.datos, 'estado', r.estado,
    'motivo_rechazo', r.motivo_rechazo, 'correcciones', r.correcciones - 'punto_id',
    'creada_en', r.creada_en, 'revisada_en', r.revisada_en)
  from hidrantes.propuestas r
  left join hidrantes.puntos p on p.id = r.punto_id
  left join hidrantes.puntos f on f.id = (r.correcciones ->> 'punto_id')::uuid
  where r.dispositivo_id = d
  order by r.creada_en desc;
end $$;

create function hidrantes.fn_retirar_propuesta(token text, propuesta_id uuid) returns void
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes as $$
declare
  d uuid := hidrantes.fn_validar_token(token);
  r hidrantes.propuestas;
begin
  select * into r from hidrantes.propuestas x where x.id = propuesta_id for update;
  if not found or r.dispositivo_id <> d then
    perform hidrantes.fn_error('PROPUESTA_AJENA', 'Esa propuesta no es de este móvil');
  end if;
  if r.estado <> 'pendiente' then
    perform hidrantes.fn_error('PROPUESTA_NO_PENDIENTE', 'La propuesta ya no está pendiente');
  end if;
  update hidrantes.propuestas set estado = 'retirada_por_autor' where id = propuesta_id;
  perform hidrantes.fn_registrar(r.autor_nombre || ' ' || r.autor_apellido, d, false, 'propuesta_retirada_autor',
    r.punto_id, propuesta_id, null, null);
end $$;

-- ---------- incidencias, push, errores ----------

create function hidrantes.fn_reportar_incidencia(token text, descripcion text, version_app text, ruta text) returns uuid
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes as $$
declare
  d uuid := hidrantes.fn_validar_token(token);
  nuevo uuid;
begin
  if coalesce(trim(descripcion), '') = '' or length(descripcion) > 2000 then
    perform hidrantes.fn_error('PAYLOAD_INVALIDO(descripcion)', 'Describe el problema (máximo 2.000 caracteres)');
  end if;
  perform pg_advisory_xact_lock(hashtext('incidencias:' || d::text));
  if (select count(*) from hidrantes.incidencias_app i where i.dispositivo_id = d and i.momento > now() - interval '1 day')
     >= (hidrantes.fn_config('max_incidencias_dispositivo_dia', '5') #>> '{}')::int then
    perform hidrantes.fn_error('CUOTA_INCIDENCIAS_AGOTADA', 'Ya has enviado varios avisos hoy');
  end if;
  insert into hidrantes.incidencias_app (dispositivo_id, descripcion, version_app, ruta)
  values (d, trim(descripcion), left(version_app, 50), left(ruta, 200))
  returning id into nuevo;
  return nuevo;
end $$;

create function hidrantes.fn_validar_suscripcion(suscripcion jsonb) returns void
language plpgsql immutable set search_path = pg_catalog as $$
begin
  if jsonb_typeof(suscripcion) <> 'object' or coalesce(suscripcion ->> 'endpoint', '') !~ '^https://'
     or suscripcion #>> '{keys,p256dh}' is null or suscripcion #>> '{keys,auth}' is null
     or length(suscripcion::text) > 2000 then
    perform hidrantes.fn_error('PAYLOAD_INVALIDO(suscripcion)', 'Suscripción no válida');
  end if;
end $$;

create function hidrantes.fn_guardar_suscripcion_push(token text, suscripcion jsonb, temas text[]) returns uuid
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes as $$
declare
  d uuid := hidrantes.fn_validar_token(token);
  id_s uuid;
begin
  perform hidrantes.fn_validar_suscripcion(suscripcion);
  if not coalesce(temas, '{}') <@ array['resultado_propuesta'] then
    perform hidrantes.fn_error('PAYLOAD_INVALIDO(temas)', 'Tema no admitido');
  end if;
  insert into hidrantes.suscripciones_push (dispositivo_id, suscripcion, temas)
  values (d, suscripcion, coalesce(temas, '{resultado_propuesta}'))
  on conflict ((suscripcion ->> 'endpoint'))
  do update set dispositivo_id = excluded.dispositivo_id, email = null, suscripcion = excluded.suscripcion,
                temas = excluded.temas, fallos = 0
  returning id into id_s;
  return id_s;
end $$;

create function hidrantes.fn_borrar_suscripcion_push(token text) returns void
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes as $$
declare
  d uuid := hidrantes.fn_validar_token(token);
begin
  delete from hidrantes.suscripciones_push where dispositivo_id = d;
end $$;

-- Única RPC anónima sin token (TR-90). Nunca falla hacia el cliente: un error al registrar un
-- error no debe romper nada.
create function hidrantes.fn_registrar_error(dispositivo_id uuid, mensaje text, pila text, ruta text, agente text)
returns void
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes as $$
begin
  if (select count(*) from hidrantes.errores_cliente e where e.momento > now() - interval '1 day')
       >= (hidrantes.fn_config('max_errores_global_dia', '2000') #>> '{}')::int
     or (dispositivo_id is not null and (select count(*) from hidrantes.errores_cliente e
          where e.dispositivo_id = fn_registrar_error.dispositivo_id and e.momento > now() - interval '1 day') >= 100) then
    return;
  end if;
  insert into hidrantes.errores_cliente (dispositivo_id, mensaje, pila, ruta, agente)
  values (dispositivo_id, left(mensaje, 1000), left(pila, 4096), left(ruta, 200), left(agente, 300));
exception when others then
  return;
end $$;
