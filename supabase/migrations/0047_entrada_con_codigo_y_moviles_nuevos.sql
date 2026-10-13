-- 0047 · La entrada con el código y lo que comparte el grupo (docs/35 RV-401 y RV-402; DEC-199,
-- DEC-201; 05 §2.5, §2.10, §6, §8, §11; 11 §3).
--
-- RV-401 (DEC-199):
-- 1. fn_verificar_codigo compara el código (bcrypt) antes de pedir el turno, y el turno se espera
--    como mucho 3 s (lock_timeout): si no llega, error OCUPADO, que no cuenta como intento.
-- 2. Tope global de fallos: 60 por hora (antes 200), en el valor por defecto y en la fila de config.
-- 3. Con el tope global alcanzado, un móvil y su IP agrupada sin ningún fallo en 24 h siguen
--    pudiendo entrar: con el código bueno entra; con uno malo cuenta como fallo y quedan frenados.
-- 4. Frenados con el código bueno: como mucho una fila por móvil y hora (fn_entradas_frenadas_24h ya
--    cuenta móviles distintos).
--
-- RV-402 (DEC-201):
-- 5. Los móviles recién entrados (vistos por primera vez hace menos de 24 h y no con la entrada
--    abierta; nunca los de jefatura) gastan entre todos como mucho la mitad de
--    max_propuestas_dia_total y de max_subidas_dia_total. Se comprueba después del tope del grupo.
--    No se aplica con la entrada abierta. El error es el del tope de siempre con
--    ambito=moviles_nuevos, para que la app anterior lo trate como un tope y espere (04 §12).
-- 6. Espacio de fotos de jefatura: los bytes reales y solo sus reservas abiertas.
-- 7. fn_cambiar_codigo_acceso(nuevo, revocar_dispositivos, abrir_entrada default false): la entrada
--    ya no se abre sola al revocar. Se borra la de dos argumentos (PostgREST no sabría cuál llamar);
--    el panel anterior llama a esta con dos argumentos y cambia el código sin abrir la entrada.
-- 8. fn_contar_desde(desde) y fn_revocar_desde(desde), solo jefatura: los tokens sin revocar
--    emitidos desde esa hora (nunca los de jefatura), como mucho 30 días atrás.
--
-- Compatibilidad (04 §12): mismas firmas salvo fn_cambiar_codigo_acceso, que admite la llamada de
-- dos argumentos. create or replace conserva los grant. Los códigos de error nuevos (OCUPADO,
-- PAYLOAD_INVALIDO(desde)) solo los ven la Function de entrada y las funciones nuevas.

-- ---------- config ----------

update hidrantes.config set valor = '60', actualizado_por = 'migracion' where clave = 'max_intentos_global';

-- ---------- RV-401: la entrada con el código ----------

-- El cuerpo de 0044 con el bcrypt antes del turno, el turno con espera máxima, el tope global que deja
-- pasar a un móvil limpio y los frenados con el código bueno de uno en uno por móvil y hora.
create or replace function hidrantes.fn_verificar_codigo(codigo text, dispositivo_id uuid, ip_hash text)
returns table (token text, caduca_en timestamptz, error text)
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes, extensions
set lock_timeout = '3s' as $$
declare
  hash_guardado text := hidrantes.fn_config('codigo_acceso_hash', 'null') #>> '{}';
  -- Hash de relleno: si no hay código configurado se compara igual, para no ir más rápido.
  hash_comparar text := coalesce(hash_guardado, '$2a$10$T2CrJzJ.jvwByYIdKCVGJuV9fgfGpbsMwlear973cpAtdy3VfD6/G');
  fallos_dispositivo integer;
  fallos_ip integer;
  fallos_global integer;
  fallos_24h integer;
  altas_ip integer;
  altas_global integer;
  tope_alcanzado text;
  correcto boolean;
  nuevo text;
  intento bigint;
  caducidad integer := (hidrantes.fn_config('dias_caducidad_token', '365') #>> '{}')::int;
  abierta boolean;
  tope_altas_ip integer := (hidrantes.fn_config('max_altas_ip_dia', '20') #>> '{}')::int;
  tope_altas_hora integer := (hidrantes.fn_config('max_altas_global_hora', '40') #>> '{}')::int;
begin
  -- bcrypt siempre y antes del turno: tiempo constante con código bueno, malo o mal formado (TR-42),
  -- y el turno solo dura lo que tardan la cuenta y la anotación.
  correcto := crypt(coalesce(codigo, ''), hash_comparar) = hash_comparar
              and hash_guardado is not null
              and coalesce(codigo, '') ~ '^[0-9]{6}$';

  -- Un canje cada vez: la cuenta y la anotación van bajo el mismo bloqueo, así que peticiones en
  -- paralelo no pasan el tope (RV-14, 05 §11). Sin el turno en 3 s, OCUPADO: no cuenta como intento.
  begin
    perform pg_advisory_xact_lock(hashtext('hidrantes:intentos_codigo'));
  exception when lock_not_available then
    return query select null::text, null::timestamptz, 'OCUPADO'::text;
    return;
  end;

  abierta := hidrantes.fn_entrada_abierta_hasta() is not null;
  if abierta then
    tope_altas_ip := greatest(tope_altas_ip, 200);
    tope_altas_hora := greatest(tope_altas_hora, 200);
  end if;

  -- Fallos de la última hora (sin contar los ya bloqueados), fallos de 24 h de este móvil o de su IP
  -- agrupada, y canjes buenos.
  select count(*) filter (where i.momento > now() - interval '1 hour' and not i.exito and not i.bloqueado
                            and i.dispositivo_id = fn_verificar_codigo.dispositivo_id),
         count(*) filter (where i.momento > now() - interval '1 hour' and not i.exito and not i.bloqueado
                            and i.ip_hash = fn_verificar_codigo.ip_hash),
         count(*) filter (where i.momento > now() - interval '1 hour' and not i.exito and not i.bloqueado),
         count(*) filter (where not i.exito and not i.bloqueado
                            and (i.dispositivo_id = fn_verificar_codigo.dispositivo_id
                                 or i.ip_hash = fn_verificar_codigo.ip_hash)),
         count(*) filter (where i.exito and i.ip_hash = fn_verificar_codigo.ip_hash),
         count(*) filter (where i.exito and i.momento > now() - interval '1 hour')
    into fallos_dispositivo, fallos_ip, fallos_global, fallos_24h, altas_ip, altas_global
    from hidrantes.intentos_codigo i
   where i.momento > now() - interval '24 hours';

  -- El tope global solo frena a quien tiene algún fallo en 24 h (en el móvil o en su IP agrupada): un
  -- voluntario que escribe bien el código entra aunque alguien esté probando códigos (DEC-199).
  tope_alcanzado := case
    when fallos_dispositivo >= (hidrantes.fn_config('max_intentos_dispositivo', '10') #>> '{}')::int then 'dispositivo'
    when fallos_ip >= (hidrantes.fn_config('max_intentos_ip', '30') #>> '{}')::int then 'ip'
    when fallos_global >= (hidrantes.fn_config('max_intentos_global', '60') #>> '{}')::int and fallos_24h > 0 then 'global'
    when altas_ip >= tope_altas_ip then 'altas_ip'
    when altas_global >= tope_altas_hora then 'altas_global'
  end;
  if tope_alcanzado is not null then
    -- Solo con un tope de canjes buenos se anota si el código era el bueno (0044); con los de fallos,
    -- no. La respuesta es la misma con código bueno o malo (DEMASIADOS_INTENTOS).
    if tope_alcanzado not in ('altas_ip', 'altas_global') then
      correcto := false;
    end if;
    -- Anotado para Salud del sistema y la vigilancia; no cuenta como fallo. Con el código bueno, una
    -- fila por móvil y hora (cuenta voluntarios frenados, no intentos); si no, una por IP, tope y
    -- minuto: una inundación bajo el turno no hace crecer la tabla (RV-48).
    if (correcto and not exists (select 1 from hidrantes.intentos_codigo i
                                  where i.bloqueado and i.codigo_correcto
                                    and i.dispositivo_id = fn_verificar_codigo.dispositivo_id
                                    and i.momento > now() - interval '1 hour'))
       or (not correcto and not exists (select 1 from hidrantes.intentos_codigo i
                                         where i.bloqueado and i.ip_hash = fn_verificar_codigo.ip_hash
                                           and i.tope = tope_alcanzado
                                           and i.momento > now() - interval '1 minute')) then
      insert into hidrantes.intentos_codigo (dispositivo_id, ip_hash, exito, bloqueado, tope, codigo_correcto)
      values (fn_verificar_codigo.dispositivo_id, fn_verificar_codigo.ip_hash, false, true, tope_alcanzado,
              case when tope_alcanzado in ('altas_ip', 'altas_global') then correcto end);
    end if;
    return query select null::text, null::timestamptz, 'DEMASIADOS_INTENTOS'::text;
    return;
  end if;

  insert into hidrantes.intentos_codigo (dispositivo_id, ip_hash, exito)
  values (fn_verificar_codigo.dispositivo_id, fn_verificar_codigo.ip_hash, correcto)
  returning id into intento;

  if not correcto then
    return query select null::text, null::timestamptz, 'CODIGO_INCORRECTO'::text;
    return;
  end if;

  if hidrantes.fn_es_dispositivo_admin(fn_verificar_codigo.dispositivo_id) then
    update hidrantes.intentos_codigo i set tope = 'dispositivo_reservado' where i.id = intento;
    return query select null::text, null::timestamptz, 'DISPOSITIVO_RESERVADO'::text;
    return;
  end if;

  nuevo := hidrantes.fn_aleatorio_b64url(32);
  insert into hidrantes.dispositivos (dispositivo_id, token_hash, en_entrada_abierta)
  values (fn_verificar_codigo.dispositivo_id, hidrantes.fn_sha256(nuevo), abierta);
  return query select nuevo, now() + make_interval(days => caducidad), null::text;
end $$;

-- ---------- RV-402: los móviles recién entrados ----------

-- Los móviles vistos por primera vez hace menos de 24 h (el primer token de ese dispositivo_id,
-- revocado o no, como en 0044) que no entraron con la entrada abierta. Nunca los de jefatura.
create function hidrantes.fn_moviles_nuevos() returns table (dispositivo_id uuid, nuevo_hasta timestamptz)
language sql stable security definer set search_path = pg_catalog, hidrantes as $$
  select x.dispositivo_id, min(x.emitido_en) + interval '24 hours'
    from hidrantes.dispositivos x
   where x.dispositivo_id in (select y.dispositivo_id from hidrantes.dispositivos y
                               where y.emitido_en > now() - interval '24 hours')
   group by x.dispositivo_id
  having min(x.emitido_en) > now() - interval '24 hours'
     and not bool_or(x.en_entrada_abierta)
     and not hidrantes.fn_es_dispositivo_admin(x.dispositivo_id);
$$;

create index if not exists dispositivos_emitido_en_idx on hidrantes.dispositivos (emitido_en);

-- El cuerpo de 0044 con el tope de los móviles nuevos después del del grupo (RV-402) y el espacio de
-- jefatura (sus bytes reales y solo sus reservas abiertas).
create or replace function hidrantes.fn_reservar_subida_para(d uuid) returns text
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes as $$
declare
  ruta text;
  es_admin boolean := hidrantes.fn_es_dispositivo_admin(d);
  tope integer;
  hechas integer;
  abiertas_d integer;
  mas_antigua timestamptz;
  espacio record;
  max_fotos bigint;
  nuevo_hasta timestamptz;
begin
  perform pg_advisory_xact_lock(hashtext('subidas:' || d::text));
  tope := (hidrantes.fn_config('max_subidas_dispositivo_dia', '80') #>> '{}')::int;
  select count(*)::int, min(s.reservada_en) into hechas, mas_antigua
    from hidrantes.subidas s
   where s.dispositivo_id = d and s.reservada_en > now() - interval '1 day';
  if hechas >= tope then
    perform hidrantes.fn_error_tope('CUOTA_SUBIDAS_AGOTADA', tope,
      ceil(extract(epoch from mas_antigua + interval '1 day' - now()))::int, 'dispositivo');
  end if;
  if not es_admin then
    -- Reservas abiertas de este móvil (el token ya se ha validado: no está liberado).
    tope := (hidrantes.fn_config('max_reservas_abiertas', '6') #>> '{}')::int;
    select count(*)::int, min(s.reservada_en) into abiertas_d, mas_antigua
      from hidrantes.subidas s
     where s.dispositivo_id = d and s.confirmada_en is null and s.liberada_en is null
       and s.reservada_en > now() - interval '2 hours';
    if abiertas_d >= tope then
      perform hidrantes.fn_error_tope('RESERVAS_ABIERTAS', tope,
        ceil(extract(epoch from mas_antigua + interval '2 hours' - now()))::int);
    end if;
    perform pg_advisory_xact_lock(hashtext('subidas:global'));
    tope := (hidrantes.fn_config('max_subidas_dia_total', '150') #>> '{}')::int;
    if hidrantes.fn_subidas_contadas() >= tope then
      -- La primera de las que cuentan (las mismas que fn_subidas_contadas) que deja de contar.
      select min(case when s.confirmada_en is not null then s.reservada_en + interval '1 day'
                      else s.reservada_en + interval '2 hours' end)
        into mas_antigua
        from hidrantes.subidas s
       where s.reservada_en > now() - interval '1 day'
         and not hidrantes.fn_es_dispositivo_admin(s.dispositivo_id)
         and (s.confirmada_en is not null
              or (s.reservada_en > now() - interval '2 hours' and s.liberada_en is null
                  and not hidrantes.fn_dispositivo_liberado(s.dispositivo_id)));
      perform hidrantes.fn_error_tope('CUOTA_SUBIDAS_AGOTADA', tope,
        coalesce(ceil(extract(epoch from mas_antigua - now()))::int, 3600), 'grupo');
    end if;
    -- Móviles nuevos (RV-402): entre todos, como mucho la mitad del grupo. No con la entrada abierta.
    -- Se espera a que este móvil deje de ser nuevo. Bajo el mismo bloqueo global que el tope del grupo.
    select n.nuevo_hasta into nuevo_hasta from hidrantes.fn_moviles_nuevos() n where n.dispositivo_id = d;
    if nuevo_hasta is not null and hidrantes.fn_entrada_abierta_hasta() is null then
      tope := greatest(tope / 2, 1);
      if (select count(*) from hidrantes.subidas s
            join hidrantes.fn_moviles_nuevos() n on n.dispositivo_id = s.dispositivo_id
           where s.reservada_en > now() - interval '1 day'
             and (s.confirmada_en is not null
                  or (s.reservada_en > now() - interval '2 hours' and s.liberada_en is null
                      and not hidrantes.fn_dispositivo_liberado(s.dispositivo_id)))) >= tope then
        perform hidrantes.fn_error_tope('CUOTA_SUBIDAS_AGOTADA', tope,
          ceil(extract(epoch from nuevo_hasta - now()))::int, 'moviles_nuevos');
      end if;
    end if;
  end if;
  -- Espacio: lo que hay, 5 MB por reserva abierta sin archivo y 5 MB de esta. Para un voluntario, las
  -- reservas abiertas de todos; para jefatura, solo las suyas (RV-402: los móviles de los voluntarios
  -- no le quitan el sitio).
  max_fotos := (hidrantes.fn_config('max_bytes_fotos', '838860800') #>> '{}')::bigint;
  select * into espacio from hidrantes.fn_espacio_fotos();
  if es_admin then
    select count(*)::int into abiertas_d
      from hidrantes.subidas s
     where s.dispositivo_id = d and s.confirmada_en is null and s.liberada_en is null
       and s.reservada_en > now() - interval '2 hours';
  else
    abiertas_d := espacio.abiertas;
  end if;
  if espacio.bytes + (abiertas_d + 1)::bigint * 5242880 > max_fotos then
    perform hidrantes.fn_error_tope('SIN_ESPACIO_FOTOS', max_fotos, 3600);
  end if;
  ruta := 'fotos/' || gen_random_uuid() || '.jpg';
  insert into hidrantes.subidas (dispositivo_id, foto_path) values (d, ruta);
  return ruta;
end $$;

-- El cuerpo de 0044 con el tope de los móviles nuevos después del del grupo (RV-402).
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
  primera timestamptz;
  con_entrada_abierta boolean;
  espera integer;
  max_bd bigint;
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

  -- Foto: obligatoria salvo en "corregir datos"; siempre reservada por este dispositivo y sin liberar.
  if foto_path is null and operacion <> 'datos' then
    perform hidrantes.fn_error('FOTO_OBLIGATORIA', 'Falta la foto');
  end if;
  if foto_path is not null then
    update hidrantes.subidas s set confirmada_en = coalesce(s.confirmada_en, now())
     where s.foto_path = fn_proponer_interno.foto_path and s.dispositivo_id = d
       and s.liberada_en is null
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
       and s.liberada_en is null
       and (s.confirmada_en is not null
            or s.reservada_en > now() - make_interval(days => greatest(dias_reserva - 1, 1)));
    if not found then
      perform hidrantes.fn_error('FOTO_NO_RESERVADA', 'La foto del sitio no se subió desde este móvil');
    end if;
  end if;

  -- Topes diarios (RV-141, DEC-174; RV-221, DEC-183; RV-402, DEC-201). Jefatura no tiene. Bajo un
  -- bloqueo por dispositivo: dos envíos a la vez no pasan los dos la última plaza (05 §11). Un
  -- reintento con la misma clave_local ya ha salido arriba, así que no cuenta.
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
    -- Móvil nuevo (RV-221, RV-302): sus primeras 24 h desde la primera vez que se vio (el primer token
    -- de ese dispositivo_id, revocado o no), max_propuestas_token_nuevo. Un veterano que vuelve a
    -- entrar no es nuevo. Tampoco quien entró con la entrada abierta (RV-300). Se espera a lo que
    -- llegue antes, la medianoche de Madrid o las 24 h.
    select min(x.emitido_en), bool_or(x.en_entrada_abierta) into primera, con_entrada_abierta
      from hidrantes.dispositivos x where x.dispositivo_id = d;
    if primera > now() - interval '24 hours' and not coalesce(con_entrada_abierta, false) then
      tope_propuestas := (hidrantes.fn_config('max_propuestas_token_nuevo', '10') #>> '{}')::int;
      if hechas >= tope_propuestas then
        espera := greatest(ceil(extract(epoch from least(manana_madrid, primera + interval '24 hours') - now()))::int, 1);
        raise exception using errcode = 'P0001',
          message = format('CUOTA_PROPUESTAS_AGOTADA: maximo=%s reintentar_en_s=%s ambito=token_nuevo',
                           tope_propuestas, espera),
          detail = jsonb_build_object('maximo', tope_propuestas, 'reintentar_en_s', espera,
                                      'ambito', 'token_nuevo')::text;
      end if;
    end if;
    -- Tope global entre todos los voluntarios (RV-221), sin candado (RV-304): el candado de toda la
    -- transacción ponía en fila a todos los voluntarios. Sin él, propuestas que lleguen a la vez
    -- pueden pasar el tope en tantas como sean; es un freno contra abusos de 600 al día, no un cupo.
    tope_propuestas := (hidrantes.fn_config('max_propuestas_dia_total', '600') #>> '{}')::int;
    if hidrantes.fn_propuestas_hoy() >= tope_propuestas then
      espera := ceil(extract(epoch from manana_madrid - now()))::int;
      raise exception using errcode = 'P0001',
        message = format('CUOTA_PROPUESTAS_AGOTADA: maximo=%s reintentar_en_s=%s ambito=grupo', tope_propuestas, espera),
        detail = jsonb_build_object('maximo', tope_propuestas, 'reintentar_en_s', espera, 'ambito', 'grupo')::text;
    end if;
    -- Móviles nuevos entre todos (RV-402, DEC-201): como mucho la mitad del tope del grupo, para que
    -- quien tenga el código no gaste con móviles recién entrados lo de todos. No con la entrada
    -- abierta (el día del lanzamiento todos son nuevos). Mismo recuento sin candado que el del grupo.
    -- Se espera a lo que llegue antes, la medianoche de Madrid o que este móvil deje de ser nuevo.
    if primera > now() - interval '24 hours' and not coalesce(con_entrada_abierta, false)
       and hidrantes.fn_entrada_abierta_hasta() is null then
      tope_propuestas := greatest(tope_propuestas / 2, 1);
      if (select count(*) from hidrantes.propuestas x
            join hidrantes.fn_moviles_nuevos() n on n.dispositivo_id = x.dispositivo_id
           where x.creada_en >= hoy_madrid) >= tope_propuestas then
        perform hidrantes.fn_error_tope('CUOTA_PROPUESTAS_AGOTADA', tope_propuestas,
          ceil(extract(epoch from least(manana_madrid, primera + interval '24 hours') - now()))::int,
          'moviles_nuevos');
      end if;
    end if;
    -- Espacio (RV-301): lo que ocupa el esquema hidrantes, no toda la base de datos. Hora de espera
    -- fija: el espacio se libera cuando jefatura actúa, no a una hora cierta.
    max_bd := (hidrantes.fn_config('max_bytes_bd', '419430400') #>> '{}')::bigint;
    if hidrantes.fn_bytes_esquema() > max_bd then
      perform hidrantes.fn_error_tope('SIN_ESPACIO', max_bd, 3600);
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

-- ---------- RV-402: cambiar el código sin abrir la entrada ----------

-- La de dos argumentos se borra: con las dos, PostgREST no sabría a cuál llamar con dos argumentos.
-- La nueva admite esa misma llamada (abrir_entrada = false) y lleva sus permisos (abajo).
drop function hidrantes.fn_cambiar_codigo_acceso(text, boolean);

-- El cuerpo de 0044, pero la entrada solo se abre si se pide (DEC-201: ante una filtración, que es
-- cuando se revoca a todos, no se relajan los topes sin querer). Con "revocar todos" y abrir_entrada,
-- 24 h como antes; abrir_entrada sin revocar también la abre (motivo codigo_nuevo).
create function hidrantes.fn_cambiar_codigo_acceso(nuevo text, revocar_dispositivos boolean,
                                                   abrir_entrada boolean default false) returns void
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes, extensions
set lock_timeout = '5s' as $$
declare
  actor text := hidrantes.fn_exigir_admin();
  revocados integer;
  hasta timestamptz;
  revocar boolean := coalesce(revocar_dispositivos, false);
  abrir boolean := coalesce(abrir_entrada, false);
begin
  if coalesce(nuevo, '') !~ '^[0-9]{6}$' then
    perform hidrantes.fn_error('CODIGO_FORMATO', 'El código son 6 cifras');
  end if;
  insert into hidrantes.config (clave, valor, actualizado_por) values
    ('codigo_acceso_hash', to_jsonb(crypt(nuevo, gen_salt('bf', 10))), actor),
    ('codigo_acceso', to_jsonb(nuevo), actor),
    ('codigo_acceso_cambiado_en', to_jsonb(now()), actor),
    ('codigo_acceso_cambiado_por', to_jsonb(actor), actor)
  on conflict (clave) do update set valor = excluded.valor, actualizado_por = excluded.actualizado_por;
  -- El código nunca va al registro: solo el hecho (11).
  perform hidrantes.fn_registrar(actor, null, true, 'codigo_cambiado', null, null, null,
                                 jsonb_build_object('revocar_dispositivos', revocar, 'abrir_entrada', abrir));
  if revocar then
    with objetivo as (
      select x.id from hidrantes.dispositivos x where x.revocado_en is null for update
    )
    update hidrantes.dispositivos x set revocado_en = now() from objetivo o where x.id = o.id;
    get diagnostics revocados = row_count;
    perform hidrantes.fn_registrar(actor, null, true, 'dispositivos_revocados', null, null, null,
                                   jsonb_build_object('dispositivos', revocados));
  end if;
  if abrir then
    perform 1 from hidrantes.config c where c.clave = 'entrada_abierta_hasta' for update;
    -- Si ya estaba abierta más tiempo, no se acorta.
    hasta := greatest(now() + interval '24 hours', hidrantes.fn_entrada_abierta_hasta());
    perform hidrantes.fn_poner_entrada(hasta, actor);
    perform hidrantes.fn_registrar(actor, null, true, 'entrada_abierta', null, null, null,
      jsonb_build_object('hasta', hasta, 'horas', 24,
                         'motivo', case when revocar then 'codigo_nuevo_revocando' else 'codigo_nuevo' end));
  end if;
end $$;

-- ---------- RV-402: revocar desde una hora ----------

-- La hora desde la que se cuenta o se revoca: no más de 30 días atrás (ni null).
create function hidrantes.fn_validar_desde(desde timestamptz) returns void
language plpgsql stable set search_path = pg_catalog, hidrantes as $$
begin
  if desde is null or desde < now() - interval '30 days' then
    perform hidrantes.fn_error('PAYLOAD_INVALIDO(desde)', 'Como mucho 30 días atrás');
  end if;
end $$;

-- Cuántos tokens sin revocar se han emitido desde esa hora (los de jefatura no tienen). Para que el
-- panel diga "Se revocarán N móviles" antes de confirmar.
create function hidrantes.fn_contar_desde(desde timestamptz) returns integer
language plpgsql stable security definer set search_path = pg_catalog, hidrantes as $$
#variable_conflict use_variable
declare
  actor text := hidrantes.fn_exigir_admin();
begin
  perform hidrantes.fn_validar_desde(desde);
  return (select count(*)::int from hidrantes.dispositivos x
           where x.revocado_en is null and x.emitido_en >= desde
             and not hidrantes.fn_es_dispositivo_admin(x.dispositivo_id));
end $$;

-- Revoca esos tokens (ante una filtración del código, los que han entrado desde entonces). Bloqueo por
-- fila (05 §11). Al registro el número y la hora, sin dispositivos.
create function hidrantes.fn_revocar_desde(desde timestamptz) returns integer
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes
set lock_timeout = '5s' as $$
#variable_conflict use_variable
declare
  actor text := hidrantes.fn_exigir_admin();
  n integer;
begin
  perform hidrantes.fn_validar_desde(desde);
  with objetivo as (
    select x.id from hidrantes.dispositivos x
     where x.revocado_en is null and x.emitido_en >= desde
       and not hidrantes.fn_es_dispositivo_admin(x.dispositivo_id)
     for update
  )
  update hidrantes.dispositivos x set revocado_en = now() from objetivo o where x.id = o.id;
  get diagnostics n = row_count;
  perform hidrantes.fn_registrar(actor, null, true, 'dispositivos_revocados', null, null, null,
                                 jsonb_build_object('dispositivos', n, 'desde', desde));
  return n;
end $$;

-- ---------- permisos ----------

revoke all on function hidrantes.fn_moviles_nuevos() from public, anon, authenticated;
revoke all on function hidrantes.fn_validar_desde(timestamptz) from public, anon, authenticated;

revoke all on function hidrantes.fn_cambiar_codigo_acceso(text, boolean, boolean) from public, anon, authenticated;
grant execute on function hidrantes.fn_cambiar_codigo_acceso(text, boolean, boolean) to authenticated;
revoke all on function hidrantes.fn_contar_desde(timestamptz) from public, anon, authenticated;
grant execute on function hidrantes.fn_contar_desde(timestamptz) to authenticated;
revoke all on function hidrantes.fn_revocar_desde(timestamptz) from public, anon, authenticated;
grant execute on function hidrantes.fn_revocar_desde(timestamptz) to authenticated;
