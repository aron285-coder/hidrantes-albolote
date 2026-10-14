-- 0048 · La unión de la cuenta de jefatura, el coste de un intento frenado y la edición con versión
-- (docs/36 RV-450, RV-451 y RV-452; DEC-206, DEC-207, DEC-208; 05 §2.5, §2.9, §4, §6, §8, §11; 11).
--
-- RV-450 (DEC-206):
-- 1. fn_es_admin(): misma firma; además, si el JWT trae `iat`, tiene que ser igual o posterior a
--    vinculado_en (al segundo). Un token emitido antes de la unión no da jefatura, aunque sea del mismo
--    usuario. Un `iat` que no es un número, o null, no da jefatura. Sin `iat` no se compara: todo JWT
--    que firma Supabase Auth lo lleva, y solo lo omiten los claims que montan a mano los scripts y las
--    pruebas con acceso directo a la base de datos.
-- 2. fn_desvincular_administrador(correo) returns boolean, solo service_role: deshace la unión
--    (usuario_id y vinculado_en a null) y lo anota en el Registro como 'administrador_desvinculado', sin
--    ids. La usan /api/vincular-jefatura (si no puede cerrar las demás sesiones) y la revisión de las
--    uniones (RV-463).
--
-- RV-451 (DEC-207):
-- 3. fn_verificar_codigo: misma firma. Antes del bcrypt, una lectura sin turno de los fallos de la
--    última hora de ese móvil y de esa IP agrupada y, si tienen algún fallo en 24 h, del tope global.
--    Si alguno ya está pasado, DEMASIADOS_INTENTOS sin bcrypt y sin esperar el turno. Si no, todo
--    sigue como en 0047: bcrypt, turno y el recuento de verdad bajo el turno.
-- 4. El aviso técnico (fn_encolar_aviso_tecnico) va en su propio bloque: si falla, la entrada sigue.
--
-- RV-452 (DEC-208):
-- 5. fn_editar_punto(punto_id, cambios, version timestamptz default null): se borra la de dos
--    argumentos (con las dos, PostgREST no sabría a cuál llamar) y la nueva lleva sus permisos. Con
--    `version`, bajo el bloqueo de la fila, si puntos.datos_cambiados_en es posterior (al milisegundo)
--    → PUNTO_CAMBIADO y no se toca nada. Sin ella, como hasta ahora: el panel anterior la llama con dos.
-- 6. v_puntos_activos gana datos_cambiados_en al final, para que el panel sepa qué versión ha abierto.
--    fn_listar_puntos y fn_ficha_punto la quitan: al móvil del voluntario no le hace falta.
--
-- Compatibilidad (04 §12): mismas firmas salvo fn_editar_punto, que admite la llamada de dos
-- argumentos; create or replace conserva los grant. Los códigos nuevos (PUNTO_CAMBIADO) solo salen si
-- se manda `version`, y eso solo lo hace el panel nuevo.

-- =====================================================================================
-- RV-450
-- =====================================================================================

-- ---------- registro: acción nueva ----------
-- Se añade a lo que haya en el check, sin reescribir la lista (como en 0046).
do $$
declare
  actuales text[];
begin
  select array_agg(m[1] order by o)
    into actuales
    from pg_constraint c,
         regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''', 'g') with ordinality as t(m, o)
   where c.conname = 'registro_accion_check' and c.conrelid = 'hidrantes.registro'::regclass;
  if actuales is null then
    raise exception 'registro_accion_check no encontrado';
  end if;
  if not ('administrador_desvinculado' = any (actuales)) then
    alter table hidrantes.registro drop constraint registro_accion_check;
    execute format('alter table hidrantes.registro add constraint registro_accion_check check (accion in (%s))',
                   (select string_agg(quote_literal(a), ', ') from unnest(actuales || 'administrador_desvinculado'::text) a));
  end if;
end $$;

-- ---------- 1. fn_es_admin ----------
-- El cuerpo de 0046 con la condición del iat. `iat` son segundos enteros (RFC 7519): se compara con
-- vinculado_en truncado al segundo, para que un token emitido en el mismo segundo de la unión valga.
create or replace function hidrantes.fn_es_admin() returns boolean
language sql stable security definer set search_path = pg_catalog, hidrantes as $$
  select exists (
    select 1
    from hidrantes.administradores a
    cross join (
      select nullif(nullif(current_setting('request.jwt.claims', true), ''), 'null')::jsonb -> 'iat' as iat
    ) c
    where a.activo
      and a.email = hidrantes.fn_email_jwt()
      and a.usuario_id = hidrantes.fn_usuario_jwt()
      -- case y no and/or: así se evalúa en este orden y un iat desmesurado no llega a to_timestamp.
      and case
            when c.iat is null then true
            when jsonb_typeof(c.iat) <> 'number' then false
            when (c.iat #>> '{}')::numeric not between 0 and 32503680000 then false  -- hasta el año 3000
            else to_timestamp((c.iat #>> '{}')::double precision) >= date_trunc('second', a.vinculado_en)
          end
  );
$$;

-- ---------- 2. fn_desvincular_administrador ----------
create or replace function hidrantes.fn_desvincular_administrador(correo text) returns boolean
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes
set lock_timeout = '5s' as $$
declare
  e text := lower(trim(correo));
  fila hidrantes.administradores%rowtype;
begin
  if e is null or e = '' then
    perform hidrantes.fn_error('PAYLOAD_INVALIDO', 'Falta el correo');
  end if;
  -- Bloqueo por fila (05 §11), como fn_vincular_administrador.
  select * into fila from hidrantes.administradores a where a.email = e for update;
  if not found or fila.usuario_id is null then
    return false;
  end if;
  update hidrantes.administradores a set usuario_id = null, vinculado_en = null where a.email = e;
  perform hidrantes.fn_registrar(e, null, true, 'administrador_desvinculado', null, null, null,
                                 jsonb_build_object('email', e));
  return true;
end $$;

revoke all on function hidrantes.fn_desvincular_administrador(text) from public, anon, authenticated;
grant execute on function hidrantes.fn_desvincular_administrador(text) to service_role;

-- =====================================================================================
-- RV-451
-- =====================================================================================

-- El cuerpo de 0047 con la lectura previa antes del bcrypt y el aviso técnico en su propio bloque.
create or replace function hidrantes.fn_verificar_codigo(codigo text, dispositivo_id uuid, ip_hash text)
returns table (token text, caduca_en timestamptz, error text)
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes, extensions
set lock_timeout = '3s' as $$
declare
  hash_guardado text := hidrantes.fn_config('codigo_acceso_hash', 'null') #>> '{}';
  -- Hash de relleno: si no hay código configurado se compara igual, para no ir más rápido.
  hash_comparar text := coalesce(hash_guardado, '$2a$10$T2CrJzJ.jvwByYIdKCVGJuV9fgfGpbsMwlear973cpAtdy3VfD6/G');
  tope_dispositivo integer := (hidrantes.fn_config('max_intentos_dispositivo', '10') #>> '{}')::int;
  tope_ip integer := (hidrantes.fn_config('max_intentos_ip', '30') #>> '{}')::int;
  tope_global integer := (hidrantes.fn_config('max_intentos_global', '60') #>> '{}')::int;
  previo_dispositivo_hora integer;
  previo_dispositivo_24h integer;
  previo_ip_hora integer;
  previo_ip_24h integer;
  previo_tope text;
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
  -- docs/36 RV-451: lectura previa, sin turno, de los topes de fallos. Solo ahorra trabajo: si ya está
  -- frenado, no se gasta un bcrypt ni se espera el turno. Si no lo está, decide el recuento de abajo,
  -- bajo el turno. Cada consulta va por su índice: intentos_dispositivo_idx (dispositivo_id, momento),
  -- intentos_ip_idx (ip_hash, momento) e intentos_momento_idx.
  select count(*) filter (where i.momento > now() - interval '1 hour'), count(*)
    into previo_dispositivo_hora, previo_dispositivo_24h
    from hidrantes.intentos_codigo i
   where i.dispositivo_id = fn_verificar_codigo.dispositivo_id
     and i.momento > now() - interval '24 hours'
     and not i.exito and not i.bloqueado;
  select count(*) filter (where i.momento > now() - interval '1 hour'), count(*)
    into previo_ip_hora, previo_ip_24h
    from hidrantes.intentos_codigo i
   where i.ip_hash = fn_verificar_codigo.ip_hash
     and i.momento > now() - interval '24 hours'
     and not i.exito and not i.bloqueado;
  previo_tope := case
    when previo_dispositivo_hora >= tope_dispositivo then 'dispositivo'
    when previo_ip_hora >= tope_ip then 'ip'
    -- El tope global solo frena a quien tiene algún fallo en 24 h (DEC-199): solo entonces se cuenta.
    when previo_dispositivo_24h + previo_ip_24h > 0
         and (select count(*) from hidrantes.intentos_codigo i
               where i.momento > now() - interval '1 hour' and not i.exito and not i.bloqueado) >= tope_global
      then 'global'
  end;
  if previo_tope is not null then
    if previo_tope = 'global' then
      begin
        perform hidrantes.fn_encolar_aviso_tecnico('intentos_codigo', null, null);
      exception when others then
        raise warning 'fn_verificar_codigo: aviso técnico sin encolar (%)', sqlstate;
      end;
    end if;
    -- La misma anotación que abajo (una fila por IP, tope y minuto), solo si el turno está libre en
    -- ese momento: sin esperarlo, y sin escribir dos a la vez. No cuenta como fallo.
    if pg_try_advisory_xact_lock(hashtext('hidrantes:intentos_codigo'))
       and not exists (select 1 from hidrantes.intentos_codigo i
                        where i.bloqueado and i.ip_hash = fn_verificar_codigo.ip_hash
                          and i.tope = previo_tope
                          and i.momento > now() - interval '1 minute') then
      insert into hidrantes.intentos_codigo (dispositivo_id, ip_hash, exito, bloqueado, tope)
      values (fn_verificar_codigo.dispositivo_id, fn_verificar_codigo.ip_hash, false, true, previo_tope);
    end if;
    return query select null::text, null::timestamptz, 'DEMASIADOS_INTENTOS'::text;
    return;
  end if;

  -- bcrypt antes del turno: tiempo constante con código bueno, malo o mal formado (TR-42; la
  -- duración mínima de la Function cubre también el caso frenado de arriba), y el turno solo dura lo
  -- que tardan la cuenta y la anotación.
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

  -- Tope global alcanzado: aviso técnico a jefatura (RV-404, DEC-202). Una vez por hora como mucho:
  -- lo controla fn_encolar_aviso_tecnico, que solo encola filas (ninguna petición de red aquí). En su
  -- propio bloque (docs/36 RV-451): si el aviso falla, la entrada sigue.
  if fallos_global >= tope_global then
    begin
      perform hidrantes.fn_encolar_aviso_tecnico('intentos_codigo', null, null);
    exception when others then
      raise warning 'fn_verificar_codigo: aviso técnico sin encolar (%)', sqlstate;
    end;
  end if;

  -- El tope global solo frena a quien tiene algún fallo en 24 h (en el móvil o en su IP agrupada): un
  -- voluntario que escribe bien el código entra aunque alguien esté probando códigos (DEC-199).
  tope_alcanzado := case
    when fallos_dispositivo >= tope_dispositivo then 'dispositivo'
    when fallos_ip >= tope_ip then 'ip'
    when fallos_global >= tope_global and fallos_24h > 0 then 'global'
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

-- =====================================================================================
-- RV-452
-- =====================================================================================

-- ---------- 6. v_puntos_activos ----------
-- La de 0035 con datos_cambiados_en al final (una columna nueva al final: 04 §12).
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
  p.foto_sitio_path,
  -- nueva en 0048 (docs/36 RV-452): la versión que abre Editar en el panel
  p.datos_cambiados_en
from hidrantes.puntos p
where p.situacion = 'activo';

-- El cuerpo de 0027 sin datos_cambiados_en en cada punto: es una marca del panel, no del móvil.
create or replace function hidrantes.fn_listar_puntos(token text, desde timestamptz default null) returns jsonb
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes as $$
declare
  ahora timestamptz := now();
begin
  perform hidrantes.fn_validar_token(token);
  return jsonb_build_object(
    'puntos', coalesce((
      select jsonb_agg(to_jsonb(v) - 'datos_cambiados_en' order by v.codigo)
      from hidrantes.v_puntos_activos v
      where desde is null or v.actualizado_en > desde
    ), '[]'::jsonb),
    'bajas', case when desde is null then '[]'::jsonb else coalesce((
      select jsonb_agg(b.id order by b.id)
      from (
        select p.id
        from hidrantes.puntos p
        where p.situacion <> 'activo' and p.actualizado_en > desde
        union -- sin repetidos
        select r.punto_id
        from hidrantes.registro r -- registro_momento_idx
        where r.accion = 'purga_papelera' and r.momento > desde and r.punto_id is not null
      ) b
    ), '[]'::jsonb) end,
    -- 10 min de solape: una escritura que aún no había confirmado al leer entra en la siguiente
    -- sincronización (el cliente reemplaza por id, así que repetir no duplica).
    'sincronizado_en', ahora - interval '10 minutes',
    'config', jsonb_build_object(
      'meses_revision',    hidrantes.fn_config('meses_revision', '12'),
      'radio_duplicado_m', hidrantes.fn_config('radio_duplicado_m', '25'),
      'escala_radios',     hidrantes.fn_config('escala_radios', '[11, 9, 7, 5.5, 5]'),
      'version_zona',      hidrantes.fn_config('version_zona', 'null'),
      'version_mapabase',  hidrantes.fn_config('version_mapabase', 'null'),
      'epoca_datos',       hidrantes.fn_config('epoca_datos', 'null'),
      'metros_tramo_manguera', hidrantes.fn_config('metros_tramo_manguera', '20')
    )
  );
end $$;

-- El cuerpo de 0005, igual: sin datos_cambiados_en.
create or replace function hidrantes.fn_ficha_punto(token text, punto_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes as $$
declare
  r jsonb;
begin
  perform hidrantes.fn_validar_token(token);
  select to_jsonb(v) - 'datos_cambiados_en' into r from hidrantes.v_puntos_activos v where v.id = punto_id;
  if r is null then
    perform hidrantes.fn_error('PUNTO_NO_ENCONTRADO', 'Ese punto no existe o ya no está activo');
  end if;
  return r;
end $$;

-- ---------- 5. fn_editar_punto con versión ----------

drop function if exists hidrantes.fn_editar_punto(uuid, jsonb);

-- El cuerpo de 0039 con la comparación de la versión bajo el bloqueo de la fila.
create or replace function hidrantes.fn_editar_punto(punto_id uuid, cambios jsonb,
                                                     version timestamptz default null) returns void
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes, extensions
set lock_timeout = '5s' as $$
declare
  actor text := hidrantes.fn_exigir_admin();
  p hidrantes.puntos;
  antes jsonb;
  tipo_final hidrantes.tipo_punto;
  caudal_final hidrantes.estado_caudal;
  mueve boolean;
  lat_nueva double precision;
  lng_nueva double precision;
  geom_antes extensions.geography;
  geom_nueva extensions.geography;
  municipio_nuevo hidrantes.municipio;
  nucleo_nuevo text;
begin
  if cambios is null or jsonb_typeof(cambios) <> 'object' or cambios = '{}'::jsonb then
    perform hidrantes.fn_error('PAYLOAD_INVALIDO(cambios)', 'No has cambiado nada');
  end if;
  perform hidrantes.fn_exigir_claves(cambios, array['tipo', 'diametro_mm', 'caudal', 'racor', 'descripcion_fallo',
                                                    'descripcion', 'direccion', 'lat', 'lng']);
  perform hidrantes.fn_validar_longitudes(cambios);
  if (cambios ? 'lat') <> (cambios ? 'lng') then
    perform hidrantes.fn_error('PAYLOAD_INVALIDO(ubicacion)', 'Faltan coordenadas: van la latitud y la longitud');
  end if;
  mueve := cambios ? 'lat';
  if mueve then
    begin
      lat_nueva := (cambios ->> 'lat')::double precision;
      lng_nueva := (cambios ->> 'lng')::double precision;
    exception when invalid_text_representation or numeric_value_out_of_range then
      perform hidrantes.fn_error('PAYLOAD_INVALIDO(ubicacion)', 'Las coordenadas no son válidas');
    end;
    if lat_nueva is null or lng_nueva is null then
      perform hidrantes.fn_error('PAYLOAD_INVALIDO(ubicacion)', 'Faltan coordenadas: van la latitud y la longitud');
    end if;
    -- Los límites de puntos_coordenadas (0001). Postgres ordena NaN por encima de todo número, y
    -- ±Infinity quedan fuera: los tres se rechazan aquí.
    if lat_nueva not between 36.6 and 38.2 or lng_nueva not between -4.5 and -2.5 then
      perform hidrantes.fn_error('PAYLOAD_INVALIDO(ubicacion)', 'Coordenadas fuera de la provincia');
    end if;
    geom_nueva := st_setsrid(st_makepoint(lng_nueva, lat_nueva), 4326)::geography;
    select m.municipio, m.nucleo into municipio_nuevo, nucleo_nuevo from hidrantes.fn_municipio_de(geom_nueva) m;
  end if;

  select * into p from hidrantes.puntos x where x.id = punto_id for update;
  if not found or p.situacion <> 'activo' then
    perform hidrantes.fn_error('PUNTO_NO_ACTIVO', 'El punto ya no está activo');
  end if;
  -- docs/36 RV-452 (DEC-208): con la versión que abrió el panel, no se pisa un cambio de otro. Al
  -- milisegundo: es la precisión con la que la guarda el navegador. datos_cambiados_en y no
  -- actualizado_en, que sube también con el núcleo (RV-403).
  if fn_editar_punto.version is not null
     and date_trunc('milliseconds', p.datos_cambiados_en) > date_trunc('milliseconds', fn_editar_punto.version) then
    perform hidrantes.fn_error('PUNTO_CAMBIADO', 'Otro administrador ha cambiado este punto mientras lo editabas');
  end if;
  antes := hidrantes.fn_punto_json(p);
  geom_antes := p.geom;
  -- El panel puede mandar la posición aunque no se haya tocado el pin: si no cambia (a 0,1 m), no
  -- es un movimiento; ni geom, ni municipio, ni núcleo, ni desplazamiento_m en el registro.
  if mueve and round(st_distance(geom_antes, geom_nueva)::numeric, 1) = 0 then
    mueve := false;
  end if;
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
      direccion = case when cambios ? 'direccion' then nullif(trim(cambios ->> 'direccion'), '') else x.direccion end,
      geom = case when mueve then geom_nueva else x.geom end,
      municipio = case when mueve then municipio_nuevo else x.municipio end,
      nucleo = case when mueve then nucleo_nuevo else x.nucleo end
    where x.id = punto_id
    returning * into p;
  exception when check_violation or invalid_text_representation or numeric_value_out_of_range then
    perform hidrantes.fn_error('PAYLOAD_INVALIDO(' || coalesce(hidrantes.constraint_name_de(sqlerrm), 'cambios') || ')',
                               'El resultado no cumple las reglas del punto');
  end;
  perform hidrantes.fn_registrar(actor, null, true, 'edicion_admin', punto_id, null, antes,
    hidrantes.fn_punto_json(p) || case when mueve
      then jsonb_build_object('desplazamiento_m', round(st_distance(geom_antes, geom_nueva)::numeric, 1))
      else '{}'::jsonb end);
end $$;

revoke all on function hidrantes.fn_editar_punto(uuid, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function hidrantes.fn_editar_punto(uuid, jsonb, timestamptz) to authenticated;
