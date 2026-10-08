-- 0041 · Espacio de fotos y de la base de datos, topes que no se esquivan con tokens nuevos,
-- compatibilidad con la app 0.7.0 y avisos de jefatura por administrador (docs/32 RV-220 a RV-226,
-- RV-253, RV-260 y RV-262; DEC-182, DEC-183; 05 §2.6, §2.7, §2.8, §2.10, §2.12, §6, §8; 11 §3, §4).
--
-- 1. RV-220 (DEC-182): fn_reservar_subida cuenta espacio y reservas abiertas. Reserva abierta = sin
--    confirmar, de menos de 2 h (lo que dura la URL firmada) y de un dispositivo no liberado (revocar
--    libera). Como mucho max_reservas_abiertas (6) por dispositivo: RESERVAS_ABIERTAS. El tope global
--    baja a 150 y cuenta solo confirmadas + abiertas. SIN_ESPACIO_FOTOS si el bucket más 5 MB por
--    reserva abierta pasa de max_bytes_fotos (800 MB). pg_cron borra cada día las filas de reservas
--    nunca confirmadas de más de 48 h cuyo archivo ya no está. Salud enseña el espacio y los 5 móviles
--    con más reservas; fn_revocar_dispositivo revoca uno.
-- 2. RV-221 (DEC-183): max_altas_ip_dia 150 → 20, max_altas_global_hora 150 → 40; un token de menos de
--    24 h, 10 propuestas al día; 600 al día entre todos los voluntarios; SIN_ESPACIO si la base de datos
--    pasa de max_bytes_bd (400 MB). fn_espacio para la vigilancia (aviso al 70 %).
-- 3. RV-222: la fn_registrar_error de 5 argumentos tiene su propio cupo (200 al día, 10 por
--    dispositivo) y no gasta el de /api/error.
-- 4. RV-223: fn_reportar_incidencia vuelve a anon y authenticated como sumidero; fn_salud vuelve a
--    traer incidencias_abiertas: 0.
-- 5. RV-225: fn_borrar_suscripcion_push_admin solo borra la fila del administrador que llama;
--    fn_suscripcion_push_admin(endpoint) nueva.
-- 6. RV-226: fn_cerrar_sesion ya borra solo las filas de voluntario de su dispositivo; no cambia
--    (pgTAP 37).
-- 7. RV-260: fn_pedidos_recientes para Ajustes → Mantenimiento.
-- 8. RV-253: fn_fusionar_con_existente acepta prevalece.direccion con la dirección editada.
-- 9. Lista blanca de Ajustes con las claves nuevas.
--
-- Compatibilidad (04 §12): mismas firmas en todo lo que ya existía; create or replace conserva los
-- grant. Las que llevaban lock_timeout lo vuelven a declarar. Las funciones nuevas nacen sin execute
-- para PUBLIC (0001) y se conceden aquí. La app 0.9.0 trata los códigos nuevos como DESCONOCIDO
-- (reintenta y a los cinco seguidos lo marca fallo) y lee maximo y reintentar_en_s de
-- CUOTA_PROPUESTAS_AGOTADA aunque detrás vaya ambito=…; la 0.10.0 los traduce (RV-245).

-- ---------- config ----------

insert into hidrantes.config (clave, valor, actualizado_por) values
  ('max_reservas_abiertas', '6', 'migracion'),
  ('max_bytes_fotos', '838860800', 'migracion'),
  ('max_bytes_bd', '419430400', 'migracion'),
  ('max_propuestas_token_nuevo', '10', 'migracion'),
  ('max_propuestas_dia_total', '600', 'migracion'),
  ('max_errores_app_anterior_dia', '200', 'migracion')
on conflict (clave) do nothing;

-- Está en la lista blanca de Ajustes: solo se baja si nadie la ha cambiado (como 0035 con las subidas
-- por dispositivo).
update hidrantes.config set valor = '150', actualizado_por = 'migracion'
 where clave = 'max_subidas_dia_total' and valor = '400'::jsonb;

-- No están en la lista blanca: nadie las ha cambiado desde Ajustes. Se fijan.
insert into hidrantes.config (clave, valor, actualizado_por) values
  ('max_altas_ip_dia', '20', 'migracion'),
  ('max_altas_global_hora', '40', 'migracion')
on conflict (clave) do update set valor = excluded.valor, actualizado_por = excluded.actualizado_por;

-- Igual que 0039 con las claves nuevas en la lista blanca de Ajustes (FR-142). Los bytes van en bytes.
create or replace function hidrantes.fn_guardar_config(cambios jsonb) returns void
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes
set lock_timeout = '5s' as $$
declare
  actor text := hidrantes.fn_exigir_admin();
  k text;
  v jsonb;
  rangos constant jsonb := '{
    "meses_revision": [1, 60], "radio_duplicado_m": [1, 500], "dias_papelera": [1, 365],
    "buffer_zona_m": [0, 5000], "max_subidas_dispositivo_dia": [1, 500],
    "metros_tramo_manguera": [10, 30], "max_propuestas_dia": [1, 500],
    "max_subidas_dia_total": [1, 5000], "max_reservas_abiertas": [1, 50],
    "max_bytes_fotos": [104857600, 1073741824], "max_bytes_bd": [104857600, 524288000],
    "max_propuestas_token_nuevo": [1, 500], "max_propuestas_dia_total": [1, 5000]}';
  antes jsonb;
begin
  if cambios is null or jsonb_typeof(cambios) <> 'object' or cambios = '{}'::jsonb then
    perform hidrantes.fn_error('PAYLOAD_INVALIDO(cambios)', 'No has cambiado nada');
  end if;
  for k, v in select key, value from jsonb_each(cambios) loop
    if k = 'escala_radios' then
      if jsonb_typeof(v) <> 'array' or jsonb_array_length(v) <> 5
         or exists (select 1 from jsonb_array_elements(v) x where jsonb_typeof(x) <> 'number'
                      or x::text::numeric not between 2 and 30) then
        perform hidrantes.fn_error('CONFIG_INVALIDA(' || k || ')', 'Cinco radios entre 2 y 30');
      end if;
    elsif rangos ? k then
      if jsonb_typeof(v) <> 'number' or v::text::numeric <> trunc(v::text::numeric)
         or v::text::numeric not between (rangos -> k ->> 0)::numeric and (rangos -> k ->> 1)::numeric then
        perform hidrantes.fn_error('CONFIG_INVALIDA(' || k || ')', 'Valor fuera de rango');
      end if;
    else
      perform hidrantes.fn_error('CONFIG_INVALIDA(' || k || ')', 'Parámetro no modificable');
    end if;
  end loop;
  perform 1 from hidrantes.config c where c.clave in (select jsonb_object_keys(cambios)) for update;
  select jsonb_object_agg(c.clave, c.valor) into antes
    from hidrantes.config c where c.clave in (select jsonb_object_keys(cambios));
  insert into hidrantes.config (clave, valor, actualizado_por)
  select key, value, actor from jsonb_each(cambios)
  on conflict (clave) do update set valor = excluded.valor, actualizado_por = excluded.actualizado_por;
  perform hidrantes.fn_registrar(actor, null, true, 'config_cambiada', null, null, antes, cambios);
end $$;

-- ---------- 1. fotos: espacio y reservas abiertas (RV-220) ----------

-- Liberado: no es el dispositivo técnico de un administrador y no le queda ningún token sin revocar.
-- Sus reservas abiertas ya no cuentan (revocar libera, 05 §2.6).
create function hidrantes.fn_dispositivo_liberado(d uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, hidrantes as $$
  select not hidrantes.fn_es_dispositivo_admin(d)
     and not exists (select 1 from hidrantes.dispositivos x where x.dispositivo_id = d and x.revocado_en is null);
$$;

-- Las reservas de voluntarios de las últimas 24 h que cuentan en max_subidas_dia_total: las
-- confirmadas y las abiertas. Una sin confirmar de más de 2 h ya no puede subir nada.
create function hidrantes.fn_subidas_contadas() returns integer
language sql stable security definer set search_path = pg_catalog, hidrantes as $$
  select count(*)::int from hidrantes.subidas s
   where s.reservada_en > now() - interval '1 day'
     and not hidrantes.fn_es_dispositivo_admin(s.dispositivo_id)
     and (s.confirmada_en is not null
          or (s.reservada_en > now() - interval '2 hours' and not hidrantes.fn_dispositivo_liberado(s.dispositivo_id)));
$$;

-- Lo que ocupa el bucket de fotos y las reservas abiertas que aún no tienen archivo en él (de
-- cualquiera, también de jefatura: es espacio físico). Lee storage.objects con la política de
-- arranque-bd.sql; sin ella, el último storage_bytes que se midió (purga o respaldo).
create function hidrantes.fn_espacio_fotos(out bytes bigint, out origen text, out abiertas integer)
language plpgsql stable security definer set search_path = pg_catalog, hidrantes as $$
begin
  begin
    select coalesce(sum(case when o.metadata ->> 'size' ~ '^[0-9]{1,18}$' then (o.metadata ->> 'size')::bigint end), 0)
      into bytes
      from storage.objects o
     where o.bucket_id in ('hidrantes-fotos', 'hidrantes-fotos-dev');
    select count(*)::int into abiertas
      from hidrantes.subidas s
     where s.confirmada_en is null and s.reservada_en > now() - interval '2 hours'
       and not hidrantes.fn_dispositivo_liberado(s.dispositivo_id)
       and not exists (select 1 from storage.objects o
                        where o.bucket_id in ('hidrantes-fotos', 'hidrantes-fotos-dev') and o.name = s.foto_path);
    origen := 'storage';
  exception when insufficient_privilege or undefined_table or invalid_schema_name then
    bytes := case when jsonb_typeof(hidrantes.fn_config('storage_bytes', 'null')) = 'number'
                  then (hidrantes.fn_config('storage_bytes', 'null') #>> '{}')::numeric::bigint end;
    origen := case when bytes is null then 'sin_dato' else 'respaldo' end;
    bytes := coalesce(bytes, 0);
    select count(*)::int into abiertas
      from hidrantes.subidas s
     where s.confirmada_en is null and s.reservada_en > now() - interval '2 hours'
       and not hidrantes.fn_dispositivo_liberado(s.dispositivo_id);
  end;
end $$;

-- Las propuestas de voluntarios del día natural de Madrid (el tope global, RV-221).
create function hidrantes.fn_propuestas_hoy() returns integer
language sql stable security definer set search_path = pg_catalog, hidrantes as $$
  select count(*)::int from hidrantes.propuestas x
   where x.creada_en >= date_trunc('day', now() at time zone 'Europe/Madrid') at time zone 'Europe/Madrid'
     and not hidrantes.fn_es_dispositivo_admin(x.dispositivo_id);
$$;

create index if not exists propuestas_creada_en_idx on hidrantes.propuestas (creada_en);

-- Para la vigilancia (aviso al 70 %) y para Salud: los dos espacios con sus topes.
create function hidrantes.fn_espacio() returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, hidrantes as $$
declare
  f record;
begin
  select * into f from hidrantes.fn_espacio_fotos();
  return jsonb_build_object(
    'fotos_bytes', f.bytes,
    'fotos_origen', f.origen,
    'reservas_abiertas', f.abiertas,
    'fotos_reservado_bytes', f.abiertas::bigint * 5242880,
    'max_bytes_fotos', (hidrantes.fn_config('max_bytes_fotos', '838860800') #>> '{}')::bigint,
    'bd_bytes', pg_database_size(current_database()),
    'max_bytes_bd', (hidrantes.fn_config('max_bytes_bd', '419430400') #>> '{}')::bigint,
    'aviso', 0.7);
end $$;

-- Misma firma que 0005; el cuerpo de 0039 con las reglas de 05 §2.6 desde 0041. Bloqueos siempre en el
-- mismo orden (dispositivo y después global): sin interbloqueos.
create or replace function hidrantes.fn_reservar_subida_para(d uuid) returns text
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes as $$
declare
  ruta text;
  es_admin boolean := hidrantes.fn_es_dispositivo_admin(d);
  tope integer;
  abiertas_d integer;
  mas_antigua timestamptz;
  espera integer;
  espacio record;
begin
  perform pg_advisory_xact_lock(hashtext('subidas:' || d::text));
  if (select count(*) from hidrantes.subidas s
       where s.dispositivo_id = d and s.reservada_en > now() - interval '1 day')
     >= (hidrantes.fn_config('max_subidas_dispositivo_dia', '80') #>> '{}')::int then
    perform hidrantes.fn_error('CUOTA_SUBIDAS_AGOTADA', 'Has llegado al máximo de fotos de hoy');
  end if;
  if not es_admin then
    -- Reservas abiertas de este móvil (el token ya se ha validado: no está liberado).
    tope := (hidrantes.fn_config('max_reservas_abiertas', '6') #>> '{}')::int;
    select count(*)::int, min(s.reservada_en) into abiertas_d, mas_antigua
      from hidrantes.subidas s
     where s.dispositivo_id = d and s.confirmada_en is null and s.reservada_en > now() - interval '2 hours';
    if abiertas_d >= tope then
      espera := greatest(ceil(extract(epoch from mas_antigua + interval '2 hours' - now()))::int, 1);
      raise exception using errcode = 'P0001',
        message = format('RESERVAS_ABIERTAS: maximo=%s reintentar_en_s=%s', tope, espera),
        detail = jsonb_build_object('maximo', tope, 'reintentar_en_s', espera)::text;
    end if;
    perform pg_advisory_xact_lock(hashtext('subidas:global'));
    if hidrantes.fn_subidas_contadas() >= (hidrantes.fn_config('max_subidas_dia_total', '150') #>> '{}')::int then
      perform hidrantes.fn_error('CUOTA_SUBIDAS_AGOTADA', 'Hoy se ha llegado al máximo de fotos de todo el grupo');
    end if;
  end if;
  -- Espacio: lo que hay, 5 MB por reserva abierta sin archivo y 5 MB de esta. Para todos.
  select * into espacio from hidrantes.fn_espacio_fotos();
  if espacio.bytes + (espacio.abiertas + 1)::bigint * 5242880
     > (hidrantes.fn_config('max_bytes_fotos', '838860800') #>> '{}')::bigint then
    perform hidrantes.fn_error('SIN_ESPACIO_FOTOS', 'No queda espacio para fotos; avisa a jefatura');
  end if;
  ruta := 'fotos/' || gen_random_uuid() || '.jpg';
  insert into hidrantes.subidas (dispositivo_id, foto_path) values (d, ruta);
  return ruta;
end $$;

-- La tarea diaria de subidas (hidrantes_purgar_subidas, 0013): las de más de 30 días, como antes, y
-- las nunca confirmadas de más de 48 h cuyo archivo ya no está en el bucket (nunca se subió, o la
-- purga de fotos de cada día ya lo borró). Solo filas: los archivos los borra el workflow de purga.
-- Sin lectura de storage.objects, solo las de más de 7 días, y queda un aviso en el log de Postgres;
-- Salud lo enseña con fotos_origen.
create function hidrantes.fn_purgar_subidas() returns integer
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes as $$
declare
  n integer;
  m integer;
begin
  delete from hidrantes.subidas s where s.reservada_en < now() - interval '30 days';
  get diagnostics n = row_count;
  begin
    delete from hidrantes.subidas s
     where s.confirmada_en is null and s.reservada_en < now() - interval '48 hours'
       and not exists (select 1 from storage.objects o
                        where o.bucket_id in ('hidrantes-fotos', 'hidrantes-fotos-dev') and o.name = s.foto_path);
    get diagnostics m = row_count;
  exception when insufficient_privilege or undefined_table or invalid_schema_name then
    raise warning 'fn_purgar_subidas: sin lectura de storage.objects (%), solo las de más de 7 días', sqlstate;
    delete from hidrantes.subidas s
     where s.confirmada_en is null and s.reservada_en < now() - interval '7 days';
    get diagnostics m = row_count;
  end;
  return n + m;
end $$;

-- Mismo nombre: cron.schedule actualiza la tarea (0004). Sigue habiendo las mismas siete.
select cron.schedule('hidrantes_purgar_subidas', '57 3 * * *', $$select hidrantes.fn_purgar_subidas()$$);

-- Revocar un móvil desde Salud (RV-262): el que se enseña con los 8 primeros caracteres de su id.
create function hidrantes.fn_revocar_dispositivo(dispositivo text) returns integer
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes
set lock_timeout = '5s' as $$
declare
  actor text := hidrantes.fn_exigir_admin();
  prefijo text := lower(trim(dispositivo));
  ids uuid[];
  n integer;
begin
  if prefijo is null or prefijo !~ '^[0-9a-f][0-9a-f-]{7,35}$' then
    perform hidrantes.fn_error('PAYLOAD_INVALIDO(dispositivo)', 'Hacen falta al menos los 8 primeros caracteres');
  end if;
  select array_agg(distinct x.dispositivo_id) into ids
    from hidrantes.dispositivos x where x.dispositivo_id::text like prefijo || '%';
  if ids is null then
    perform hidrantes.fn_error('DISPOSITIVO_NO_ENCONTRADO', 'No hay ningún móvil con ese identificador');
  end if;
  if cardinality(ids) > 1 then
    perform hidrantes.fn_error('PAYLOAD_INVALIDO(dispositivo)', 'Hay más de un móvil que empieza así');
  end if;
  update hidrantes.dispositivos x set revocado_en = now() where x.dispositivo_id = ids[1] and x.revocado_en is null;
  get diagnostics n = row_count;
  perform hidrantes.fn_registrar(actor, null, true, 'dispositivos_revocados', null, null, null,
    jsonb_build_object('dispositivos', n, 'dispositivo', left(ids[1]::text, 8)));
  return n;
end $$;

revoke all on function hidrantes.fn_dispositivo_liberado(uuid) from public, anon, authenticated;
revoke all on function hidrantes.fn_subidas_contadas() from public, anon, authenticated;
revoke all on function hidrantes.fn_espacio_fotos() from public, anon, authenticated;
revoke all on function hidrantes.fn_propuestas_hoy() from public, anon, authenticated;
revoke all on function hidrantes.fn_purgar_subidas() from public, anon, authenticated;
revoke all on function hidrantes.fn_espacio() from public, anon, authenticated;
grant execute on function hidrantes.fn_espacio() to service_role;
revoke all on function hidrantes.fn_revocar_dispositivo(text) from public, anon, authenticated;
grant execute on function hidrantes.fn_revocar_dispositivo(text) to authenticated;

-- ---------- 2. propuestas (RV-221) ----------
-- El cuerpo de 0039 con tres topes más, solo para voluntarios, después del del dispositivo: el del
-- token nuevo, el global (bajo un bloqueo global tomado después del del dispositivo) y el espacio de
-- la base de datos.
create or replace function hidrantes.fn_proponer_interno(
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
  dias_reserva integer := (hidrantes.fn_config('dias_reserva_subida', '2') #>> '{}')::int;
  -- El día de la cuota es el natural de Albolote, no el de UTC.
  hoy_madrid timestamptz := date_trunc('day', now() at time zone 'Europe/Madrid') at time zone 'Europe/Madrid';
  manana_madrid timestamptz := (date_trunc('day', now() at time zone 'Europe/Madrid') + interval '1 day')
                               at time zone 'Europe/Madrid';
  tope_propuestas integer;
  hechas integer;
  emitido timestamptz;
  espera integer;
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
  if coalesce(trim(autor_nombre), '') = '' or coalesce(trim(autor_apellido), '') = '' then
    perform hidrantes.fn_error('PAYLOAD_INVALIDO(autor)', 'Faltan nombre y apellido');
  end if;
  perform hidrantes.fn_validar_longitud('autor_nombre', autor_nombre, 60);
  perform hidrantes.fn_validar_longitud('autor_apellido', autor_apellido, 60);
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

  -- Topes diarios (RV-141, DEC-174; RV-221, DEC-183). Jefatura no tiene. Bajo un bloqueo por
  -- dispositivo: dos envíos a la vez no pasan los dos la última plaza (05 §11). Un reintento con la
  -- misma clave_local ya ha salido arriba, así que no cuenta.
  -- El cliente solo ve el message: los números van en el texto, como pidió Frontend-campo en #484
  -- ("CUOTA_PROPUESTAS_AGOTADA: maximo=60 reintentar_en_s=12345"), y repetidos en detail.
  if admin_email is null then
    perform pg_advisory_xact_lock(hashtext('propuestas:' || d::text));
    -- Un envío con la misma clave_local que entró mientras se esperaba el bloqueo es un reintento: se
    -- devuelve ese, no un "máximo de hoy" de una propuesta que sí existe.
    if exists (select 1 from hidrantes.propuestas x where x.clave_local = fn_proponer_interno.clave_local) then
      return hidrantes.fn_proponer_interno(token, clave_local, autor_nombre, autor_apellido, operacion, punto_id, datos,
        origen, lat, lng, gps_lat, gps_lng, precision_gps_m, exif_lat, exif_lng, foto_path, foto_sitio_path, exigir_foto_sitio);
    end if;
    tope_propuestas := (hidrantes.fn_config('max_propuestas_dia', '60') #>> '{}')::int;
    select count(*)::int into hechas from hidrantes.propuestas x
     where x.dispositivo_id = d and x.creada_en >= hoy_madrid;
    if hechas >= tope_propuestas then
      raise exception using errcode = 'P0001',
        message = format('CUOTA_PROPUESTAS_AGOTADA: maximo=%s reintentar_en_s=%s', tope_propuestas,
                         ceil(extract(epoch from manana_madrid - now()))::int),
        detail = jsonb_build_object('maximo', tope_propuestas,
                   'reintentar_en_s', ceil(extract(epoch from manana_madrid - now()))::int)::text;
    end if;
    -- Token nuevo (RV-221): sus primeras 24 h, max_propuestas_token_nuevo. Se espera a lo que llegue
    -- antes, la medianoche de Madrid o las 24 h del token.
    select x.emitido_en into emitido from hidrantes.dispositivos x where x.token_hash = hidrantes.fn_sha256(token);
    if emitido > now() - interval '24 hours' then
      tope_propuestas := (hidrantes.fn_config('max_propuestas_token_nuevo', '10') #>> '{}')::int;
      if hechas >= tope_propuestas then
        espera := greatest(ceil(extract(epoch from least(manana_madrid, emitido + interval '24 hours') - now()))::int, 1);
        raise exception using errcode = 'P0001',
          message = format('CUOTA_PROPUESTAS_AGOTADA: maximo=%s reintentar_en_s=%s ambito=token_nuevo',
                           tope_propuestas, espera),
          detail = jsonb_build_object('maximo', tope_propuestas, 'reintentar_en_s', espera,
                                      'ambito', 'token_nuevo')::text;
      end if;
    end if;
    -- Tope global entre todos los voluntarios (RV-221).
    perform pg_advisory_xact_lock(hashtext('propuestas:global'));
    tope_propuestas := (hidrantes.fn_config('max_propuestas_dia_total', '600') #>> '{}')::int;
    if hidrantes.fn_propuestas_hoy() >= tope_propuestas then
      espera := ceil(extract(epoch from manana_madrid - now()))::int;
      raise exception using errcode = 'P0001',
        message = format('CUOTA_PROPUESTAS_AGOTADA: maximo=%s reintentar_en_s=%s ambito=grupo', tope_propuestas, espera),
        detail = jsonb_build_object('maximo', tope_propuestas, 'reintentar_en_s', espera, 'ambito', 'grupo')::text;
    end if;
    -- Espacio de la base de datos (RV-221): 500 MB compartidos con uniformidad.
    if pg_database_size(current_database()) > (hidrantes.fn_config('max_bytes_bd', '419430400') #>> '{}')::bigint then
      perform hidrantes.fn_error('SIN_ESPACIO', 'La base de datos está llena; avisa a jefatura');
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

-- ---------- 3. errores de la app anterior con su propio cupo (RV-222) ----------

alter table hidrantes.errores_cliente add column app_anterior boolean not null default false;
create index errores_app_anterior_idx on hidrantes.errores_cliente (momento) where app_anterior;

-- Misma firma que 0040 (la de /api/error). El techo global y el de sin IP ya no cuentan lo que entra
-- por la función vieja: no gasta este cupo.
create or replace function hidrantes.fn_registrar_error(dispositivo_id uuid, mensaje text, pila text, ruta text, agente text,
                                                        ip_hash text)
returns void
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes as $$
#variable_conflict use_variable
declare
  -- Lo mismo que se guarda: vacío es "sin IP", y nunca más de 128 caracteres.
  ip text := left(nullif(trim(ip_hash), ''), 128);
begin
  if (select count(*) from hidrantes.errores_cliente e where e.momento > now() - interval '1 day' and not e.app_anterior)
       >= (hidrantes.fn_config('max_errores_global_dia', '2000') #>> '{}')::int
     or (dispositivo_id is not null and (select count(*) from hidrantes.errores_cliente e
          where e.dispositivo_id = dispositivo_id and e.momento > now() - interval '1 day') >= 100) then
    return;
  end if;
  -- Dos ramas, para que la de la IP use errores_ip_idx.
  if ip is null then
    if (select count(*) from hidrantes.errores_cliente e
         where e.ip_hash is null and not e.app_anterior and e.momento > now() - interval '1 day')
       >= (hidrantes.fn_config('max_errores_sin_ip_dia', '500') #>> '{}')::int then
      return;
    end if;
  elsif (select count(*) from hidrantes.errores_cliente e
          where e.ip_hash = ip and e.momento > now() - interval '1 day')
        >= (hidrantes.fn_config('max_errores_ip_dia', '100') #>> '{}')::int then
    return;
  end if;
  insert into hidrantes.errores_cliente (dispositivo_id, mensaje, pila, ruta, agente, ip_hash)
  values (dispositivo_id, left(mensaje, 1000), left(pila, 4096), left(ruta, 200), left(agente, 300), ip);
exception when others then
  -- Nunca falla hacia el cliente, pero queda en el log de Postgres: si esto se rompe, errores_7d
  -- diría 0 y parecería que todo va bien.
  raise warning 'fn_registrar_error: % %', sqlstate, sqlerrm;
  return;
end $$;

-- Firma de 0005 (la app anterior, con la clave anon). Su propio cupo: max_errores_app_anterior_dia de
-- las suyas al día y 10 por dispositivo (contando todas las de ese dispositivo), y el techo global de
-- siempre. Lo que entra va con app_anterior = true. Se le quita anon con #472.
create or replace function hidrantes.fn_registrar_error(dispositivo_id uuid, mensaje text, pila text, ruta text, agente text)
returns void
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes as $$
#variable_conflict use_variable
begin
  if (select count(*) from hidrantes.errores_cliente e where e.momento > now() - interval '1 day')
       >= (hidrantes.fn_config('max_errores_global_dia', '2000') #>> '{}')::int
     or (select count(*) from hidrantes.errores_cliente e where e.app_anterior and e.momento > now() - interval '1 day')
       >= (hidrantes.fn_config('max_errores_app_anterior_dia', '200') #>> '{}')::int
     or (dispositivo_id is not null and (select count(*) from hidrantes.errores_cliente e
          where e.dispositivo_id = dispositivo_id and e.momento > now() - interval '1 day') >= 10) then
    return;
  end if;
  insert into hidrantes.errores_cliente (dispositivo_id, mensaje, pila, ruta, agente, ip_hash, app_anterior)
  values (dispositivo_id, left(mensaje, 1000), left(pila, 4096), left(ruta, 200), left(agente, 300), null, true);
exception when others then
  raise warning 'fn_registrar_error (app anterior): % %', sqlstate, sqlerrm;
  return;
end $$;

-- ---------- 4. compatibilidad con la app 0.7.0 (RV-223) ----------

-- Sumidero: la app 0.7.0 aún tiene "Algo no funciona". Acepta, no guarda nada y devuelve un id, para
-- que no enseñe un error engañoso. Sin tabla que tocar: SECURITY INVOKER. Se quita con #472.
create or replace function hidrantes.fn_reportar_incidencia(token text, descripcion text, version_app text, ruta text)
returns uuid
language sql volatile security invoker set search_path = pg_catalog as $$
  select gen_random_uuid();
$$;

grant execute on function hidrantes.fn_reportar_incidencia(text, text, text, text) to anon, authenticated;

-- Misma firma y claves que 0040, más incidencias_abiertas: 0 (RV-223) y el espacio, las reservas y
-- las propuestas de 0041 (RV-220, RV-221).
create or replace function hidrantes.fn_salud() returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, hidrantes as $$
declare
  tareas jsonb;
  origen jsonb;
  subidas_24h integer;
  propuestas_hoy integer;
  espacio record;
  max_fotos bigint := (hidrantes.fn_config('max_bytes_fotos', '838860800') #>> '{}')::bigint;
  max_bd bigint := (hidrantes.fn_config('max_bytes_bd', '419430400') #>> '{}')::bigint;
  bd bigint := pg_database_size(current_database());
begin
  perform hidrantes.fn_exigir_admin();
  -- Las mismas que cuenta el tope global de fn_reservar_subida_para (0041).
  subidas_24h := hidrantes.fn_subidas_contadas();
  propuestas_hoy := hidrantes.fn_propuestas_hoy();
  select * into espacio from hidrantes.fn_espacio_fotos();
  begin
    tareas := hidrantes.fn_tareas_programadas();
    origen := jsonb_build_object('tareas_origen', 'en_vivo');
  exception when insufficient_privilege or undefined_table or invalid_schema_name or undefined_function then
    -- Sin acceso a pg_cron: la foto de la vigilancia, diciendo de cuándo es.
    tareas := hidrantes.fn_config('tareas_programadas', 'null');
    origen := jsonb_build_object(
      'tareas_origen', 'vigilancia',
      'tareas_error', sqlstate,
      'tareas_medidas_en', (select to_jsonb(c.actualizado_en) from hidrantes.config c where c.clave = 'tareas_programadas'));
  end;
  return jsonb_build_object(
    'pendientes_14d', (select count(*) from hidrantes.propuestas where estado = 'pendiente'
                         and creada_en < now() - interval '14 days'),
    -- El panel de 0.7.0 la pinta; desde 0040 no hay incidencias (RV-223, se quita con #472).
    'incidencias_abiertas', 0,
    'errores_7d', (select count(*) from hidrantes.errores_cliente where momento > now() - interval '7 days'),
    'sin_direccion', (select count(*) from hidrantes.puntos where situacion = 'activo' and direccion is null),
    'ultimo_respaldo', hidrantes.fn_config('ultimo_respaldo', 'null'),
    'storage_bytes', hidrantes.fn_config('storage_bytes', 'null'),
    'version_zona', hidrantes.fn_config('version_zona', 'null'),
    'version_mapabase', hidrantes.fn_config('version_mapabase', 'null'),
    'version_callejero', hidrantes.fn_config('version_callejero', 'null'),
    'ultima_vigilancia', hidrantes.fn_config('ultima_vigilancia', 'null'),
    'vigilancia_ok', hidrantes.fn_config('vigilancia_ok', 'null'),
    'dispositivos_activos', (select count(*) from hidrantes.dispositivos where revocado_en is null
                               and ultimo_uso > now() - interval '90 days'),
    'intentos_fallidos_24h', (select count(*) from hidrantes.intentos_codigo
                                where momento > now() - interval '24 hours' and not exito and not bloqueado),
    'topes_alcanzados_24h', (select count(*) from hidrantes.intentos_codigo
                               where momento > now() - interval '24 hours' and bloqueado),
    -- Los del código para todo el grupo, más uno por cada tope global (subidas, propuestas) lleno ahora.
    'topes_globales_24h', (select count(*) from hidrantes.intentos_codigo
                             where momento > now() - interval '24 hours' and bloqueado
                               and tope in ('global', 'altas_global'))
                          + case when subidas_24h >= (hidrantes.fn_config('max_subidas_dia_total', '150') #>> '{}')::int
                                 then 1 else 0 end
                          + case when propuestas_hoy >= (hidrantes.fn_config('max_propuestas_dia_total', '600') #>> '{}')::int
                                 then 1 else 0 end,
    'subidas_24h', subidas_24h,
    'propuestas_hoy', propuestas_hoy,
    'max_propuestas_dia_total', (hidrantes.fn_config('max_propuestas_dia_total', '600') #>> '{}')::int,
    -- Canjes con el código bueno y el dispositivo_id de un administrador (0039, RV-143).
    'dispositivos_reservados_24h', (select count(*) from hidrantes.intentos_codigo
                                     where momento > now() - interval '24 hours' and tope = 'dispositivo_reservado'),
    -- Espacio de fotos (RV-220): el bucket, y el porcentaje contando 5 MB por reserva abierta.
    'fotos_bytes', espacio.bytes,
    'fotos_origen', espacio.origen,
    'reservas_abiertas', espacio.abiertas,
    'max_bytes_fotos', max_fotos,
    'fotos_pct', round((espacio.bytes + espacio.abiertas::bigint * 5242880) * 100.0 / greatest(max_fotos, 1), 1),
    -- Los 5 móviles de voluntario con más reservas en 24 h, con 8 caracteres de su id (RV-220, RV-262).
    'reservas_dispositivos_24h', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'dispositivo', left(t.dispositivo_id::text, 8), 'reservas', t.reservas, 'abiertas', t.abiertas,
               'revocado', hidrantes.fn_dispositivo_liberado(t.dispositivo_id))
             order by t.reservas desc, t.dispositivo_id), '[]'::jsonb)
      from (select s.dispositivo_id, count(*)::int as reservas,
                   (count(*) filter (where s.confirmada_en is null
                                       and s.reservada_en > now() - interval '2 hours'))::int as abiertas
              from hidrantes.subidas s
             where s.reservada_en > now() - interval '1 day' and not hidrantes.fn_es_dispositivo_admin(s.dispositivo_id)
             group by s.dispositivo_id
             order by 2 desc, 1
             limit 5) t),
    -- Toda la base de datos (también uniformidad) y solo lo nuestro (RV-22); el tope de 0041 (RV-221).
    'bd_bytes', bd,
    'max_bytes_bd', max_bd,
    'bd_pct', round(bd * 100.0 / greatest(max_bd, 1), 1),
    'esquema_bytes', (select coalesce(sum(pg_total_relation_size(c.oid)), 0)
                        from pg_class c join pg_namespace n on n.oid = c.relnamespace
                       where n.nspname = 'hidrantes' and c.relkind in ('r', 'm')),
    'tareas', tareas
  ) || origen;
end $$;

-- ---------- 5. avisos de jefatura por administrador (RV-225) ----------

-- Igual que 0040, pero solo la fila del administrador que llama: la de otro administrador en el mismo
-- navegador (el último que activó los avisos se queda la fila, 0030) no se toca.
create or replace function hidrantes.fn_borrar_suscripcion_push_admin(endpoint text) returns void
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes as $$
#variable_conflict use_variable
declare
  actor text := hidrantes.fn_exigir_admin();
begin
  if coalesce(trim(endpoint), '') = '' then
    perform hidrantes.fn_error('PAYLOAD_INVALIDO(endpoint)', 'Falta el endpoint');
  end if;
  delete from hidrantes.suscripciones_push s
   where s.dispositivo_id is null and s.email = actor and s.suscripcion ->> 'endpoint' = endpoint;
end $$;

-- ¿Tiene el administrador que llama avisos en este navegador, y de qué? Solo su fila.
create function hidrantes.fn_suscripcion_push_admin(endpoint text) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, hidrantes as $$
#variable_conflict use_variable
declare
  actor text := hidrantes.fn_exigir_admin();
  t text[];
begin
  if coalesce(trim(endpoint), '') = '' then
    perform hidrantes.fn_error('PAYLOAD_INVALIDO(endpoint)', 'Falta el endpoint');
  end if;
  select s.temas into t from hidrantes.suscripciones_push s
   where s.dispositivo_id is null and s.email = actor and s.suscripcion ->> 'endpoint' = endpoint;
  return jsonb_build_object('suscrita', found, 'temas', to_jsonb(coalesce(t, '{}'::text[])));
end $$;

revoke all on function hidrantes.fn_suscripcion_push_admin(text) from public, anon, authenticated;
grant execute on function hidrantes.fn_suscripcion_push_admin(text) to authenticated;

-- ---------- 7. pedidos recientes (RV-260) ----------

create function hidrantes.fn_pedidos_recientes(limite integer default 5) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, hidrantes as $$
#variable_conflict use_variable
declare
  n integer := least(greatest(coalesce(limite, 5), 1), 20);
  r jsonb;
begin
  perform hidrantes.fn_exigir_admin();
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', t.id, 'workflow', t.workflow, 'pedido_en', t.pedido_en, 'lanzado_en', t.lanzado_en,
           'estado', case when t.lanzado_en is null then 'pedido'
                          when t.resultado like 'error: %' then 'error'
                          else 'lanzado' end,
           'resultado', t.resultado)
         order by t.pedido_en desc, t.id desc), '[]'::jsonb)
    into r
    from (select * from hidrantes.pedidos_trabajo x order by x.pedido_en desc, x.id desc limit n) t;
  return r;
end $$;

revoke all on function hidrantes.fn_pedidos_recientes(integer) from public, anon, authenticated;
grant execute on function hidrantes.fn_pedidos_recientes(integer) to authenticated;

-- ---------- 8. fusionar con la dirección editada (RV-253) ----------

-- Igual que 0035 más prevalece.direccion: el texto que jefatura editó en el detalle (null, vacío o en
-- blanco: sin dirección). Manda sobre lo que diga "ubicacion"; sin la clave, como antes.
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
  pv jsonb := coalesce(prevalece, '{}'::jsonb);
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
  perform hidrantes.fn_exigir_claves(pv, array['racor', 'caudal', 'diametro_mm', 'descripcion', 'ubicacion', 'direccion']);
  -- La dirección es un texto (o null) de como mucho 200 caracteres (05 §7.1).
  if pv ? 'direccion' then
    perform hidrantes.fn_validar_longitudes(jsonb_build_object('direccion', pv -> 'direccion'));
  end if;
  for k in select key from jsonb_each_text(pv) where key <> 'direccion' and value = 'propuesta' loop
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
      -- La que editó jefatura, si la manda (RV-253). Si no, igual que fn_aplicar_propuesta: la
      -- sugerida para el sitio nuevo, y si no la hay, se conserva la que tenía.
      direccion = case when pv ? 'direccion' then nullif(trim(pv ->> 'direccion'), '')
                       when 'ubicacion' = any (usa_propuesta) then coalesce(r.direccion_sugerida, x.direccion)
                       else x.direccion end,
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
