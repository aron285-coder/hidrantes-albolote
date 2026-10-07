-- 0039 · Límites de texto, tope de propuestas, tope global de subidas y dispositivo reservado
-- (docs/31 RV-140 a RV-143, DEC-174, DEC-175; 05 §2.6, §2.10, §6, §7.1; 11 §3, §4).
--
-- 1. RV-140: longitud máxima de los textos libres (05 §7.1). Solo para lo nuevo: lo que ya hay no se
--    toca. fn_validar_datos (datos de fn_proponer), fn_aplicar_propuesta (correcciones de fn_aprobar,
--    del lote y del alta directa de jefatura), fn_editar_punto, y el motivo de fn_rechazar,
--    fn_retirar_punto y fn_borrar_punto. Si se pasa: PAYLOAD_INVALIDO(<campo>).
--    De paso (petición de Frontend-panel para RV-162 en #484): en correcciones, la clave direccion con
--    null o vacía deja el punto sin dirección; sin la clave, como antes.
-- 2. RV-141: max_propuestas_dia (60) por dispositivo y día natural de Madrid. Un reintento con la
--    misma clave_local sale antes de contar; jefatura no tiene tope. Mensaje
--    "CUOTA_PROPUESTAS_AGOTADA: maximo=<n> reintentar_en_s=<s>" (el cliente solo lee el message).
--    Editable en Ajustes con fn_guardar_config.
-- 3. RV-142: max_subidas_dia_total (400) entre todos los voluntarios; dias_reserva_subida de 7 a 2
--    (48 h de protección, 24 h para confirmar); fn_reservas_sin_confirmar_lista para la purga.
-- 4. RV-143: fn_verificar_codigo no da token al dispositivo_id técnico de un administrador:
--    DISPOSITIVO_RESERVADO (y marca el intento). Los tokens que ya tuviera ese id se revocan, y
--    fn_validar_token no acepta ninguno (también si la persona se da de alta como administradora
--    después).
--
-- Mismas firmas y mismos permisos (04 §12): create or replace conserva los grant. Cada función que
-- llevaba lock_timeout (0016, 0035, 0038) lo vuelve a declarar, porque create or replace sustituye
-- también sus atributos. La app anterior no manda textos más largos que los nuevos límites (no
-- tenía maxLength, pero nadie escribe 500 caracteres en una descripción) y no llega a 60 propuestas.

-- ---------- 1. límites de texto (RV-140) ----------

create function hidrantes.fn_validar_longitud(campo text, valor text, maximo integer) returns void
language plpgsql immutable set search_path = pg_catalog as $$
begin
  if length(valor) > maximo then
    perform hidrantes.fn_error('PAYLOAD_INVALIDO(' || campo || ')',
                               'Texto demasiado largo: como mucho ' || maximo || ' caracteres');
  end if;
end $$;

revoke all on function hidrantes.fn_validar_longitud(text, text, integer) from public, anon, authenticated;

-- Las claves de 05 §7.1 que traiga un objeto (datos, correcciones o cambios): texto (o null) y no más
-- largo que su límite. Las demás claves no se miran aquí; el tamaño total de datos lo frena
-- fn_validar_datos.
create function hidrantes.fn_validar_longitudes(datos jsonb) returns void
language plpgsql immutable set search_path = pg_catalog as $$
declare
  limites constant jsonb := '{"descripcion": 500, "descripcion_fallo": 500, "direccion": 200,
                              "nota": 1000, "motivo": 1000}';
  k text;
begin
  if datos is null or jsonb_typeof(datos) <> 'object' then
    return;
  end if;
  for k in select jsonb_object_keys(limites) loop
    if datos ? k then
      -- Son textos: un número, un booleano o un objeto acabarían en la columna como su texto JSON.
      if jsonb_typeof(datos -> k) not in ('string', 'null') then
        perform hidrantes.fn_error('PAYLOAD_INVALIDO(' || k || ')', 'Tiene que ser un texto');
      end if;
      perform hidrantes.fn_validar_longitud(k, datos ->> k, (limites ->> k)::int);
    end if;
  end loop;
end $$;

revoke all on function hidrantes.fn_validar_longitudes(jsonb) from public, anon, authenticated;

-- Misma firma que 0005; el cuerpo de 0032 con los límites de §7.1 al principio, y un tope al tamaño
-- total: las claves sin límite propio (diametro_otro, por ejemplo, es un número sin rango en un
-- hidrante) no pueden traer un valor enorme. Lo más largo que cabe de verdad (retirada con motivo de
-- 1.000, o estado con nota y fallo) no llega a 2.000.
create or replace function hidrantes.fn_validar_datos(operacion hidrantes.operacion, datos jsonb) returns void
language plpgsql immutable set search_path = pg_catalog, hidrantes as $$
declare
  tipo text := datos ->> 'tipo';
begin
  if length(datos::text) > 4000 then
    perform hidrantes.fn_error('PAYLOAD_INVALIDO(datos)', 'Demasiados datos');
  end if;
  perform hidrantes.fn_validar_longitudes(datos);
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

-- El cuerpo de 0035 con dos cambios: los límites de §7.1 en las correcciones, y la clave direccion
-- con null o vacía, que ahora quita la dirección (RV-162). Sin la clave, igual que antes.
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
  perform hidrantes.fn_validar_longitudes(c);
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
              -- con la clave, lo que diga jefatura (null o vacía: sin dirección); sin ella, la sugerida
              case when c ? 'direccion' then nullif(trim(c ->> 'direccion'), '') else r.direccion_sugerida end,
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
        direccion = case when c ? 'direccion' then nullif(trim(c ->> 'direccion'), '')
                         else coalesce(case when r.operacion = 'ubicacion' then r.direccion_sugerida end, x.direccion) end,
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

-- El cuerpo de 0038 con los límites de §7.1 en cambios.
create or replace function hidrantes.fn_editar_punto(punto_id uuid, cambios jsonb) returns void
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

-- Las tres de 0006 con el motivo de como mucho 1.000 caracteres, y el lock_timeout de 0016.
create or replace function hidrantes.fn_rechazar(propuesta_id uuid, motivo text) returns void
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes
set lock_timeout = '5s' as $$
declare
  actor text := hidrantes.fn_exigir_admin();
  r hidrantes.propuestas;
begin
  if coalesce(trim(motivo), '') = '' then
    perform hidrantes.fn_error('MOTIVO_OBLIGATORIO', 'Sin motivo no se puede rechazar');
  end if;
  perform hidrantes.fn_validar_longitud('motivo', motivo, 1000);
  select * into r from hidrantes.propuestas x where x.id = propuesta_id for update;
  if not found or r.estado <> 'pendiente' then
    perform hidrantes.fn_error('PROPUESTA_NO_PENDIENTE', 'La propuesta ya no está pendiente');
  end if;
  update hidrantes.propuestas x set estado = 'rechazada', motivo_rechazo = trim(motivo),
         revisada_por = actor, revisada_en = now()
   where x.id = propuesta_id;
  perform hidrantes.fn_registrar(actor, null, true, 'rechazo', r.punto_id, r.id, null,
                                 jsonb_build_object('motivo', trim(motivo)));
  perform hidrantes.fn_avisar_autor(r.dispositivo_id, false,
                                    (select codigo from hidrantes.puntos where id = r.punto_id));
end $$;

create or replace function hidrantes.fn_retirar_punto(punto_id uuid, motivo text) returns void
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes
set lock_timeout = '5s' as $$
declare
  actor text := hidrantes.fn_exigir_admin();
  p hidrantes.puntos;
begin
  if coalesce(trim(motivo), '') = '' then
    perform hidrantes.fn_error('MOTIVO_OBLIGATORIO', 'Indica el motivo');
  end if;
  perform hidrantes.fn_validar_longitud('motivo', motivo, 1000);
  select * into p from hidrantes.puntos x where x.id = punto_id for update;
  if not found or p.situacion <> 'activo' then
    perform hidrantes.fn_error('PUNTO_NO_ACTIVO', 'El punto ya no está activo');
  end if;
  update hidrantes.puntos x set situacion = 'retirado' where x.id = punto_id;
  perform hidrantes.fn_registrar(actor, null, true, 'retirada', punto_id, null, hidrantes.fn_punto_json(p),
                                 jsonb_build_object('situacion', 'retirado', 'motivo', trim(motivo)));
end $$;

create or replace function hidrantes.fn_borrar_punto(punto_id uuid, motivo text) returns void
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes
set lock_timeout = '5s' as $$
declare
  actor text := hidrantes.fn_exigir_admin();
  p hidrantes.puntos;
begin
  if coalesce(trim(motivo), '') = '' then
    perform hidrantes.fn_error('MOTIVO_OBLIGATORIO', 'Indica el motivo');
  end if;
  perform hidrantes.fn_validar_longitud('motivo', motivo, 1000);
  select * into p from hidrantes.puntos x where x.id = punto_id for update;
  if not found or p.situacion = 'borrado' then
    perform hidrantes.fn_error('PUNTO_NO_ACTIVO', 'El punto ya está en la papelera');
  end if;
  update hidrantes.puntos x set situacion = 'borrado', borrado_en = now() where x.id = punto_id;
  perform hidrantes.fn_registrar(actor, null, true, 'borrado', punto_id, null, hidrantes.fn_punto_json(p),
                                 jsonb_build_object('situacion', 'borrado', 'motivo', trim(motivo)));
end $$;

-- ---------- 2 y 3. topes nuevos en config (RV-141, RV-142) ----------

insert into hidrantes.config (clave, valor, actualizado_por) values
  ('max_propuestas_dia', '60', 'migracion'),
  ('max_subidas_dia_total', '400', 'migracion')
on conflict (clave) do nothing;

-- 48 h de protección y 24 h para confirmar (fn_proponer acepta dias - 1). No está en la lista blanca
-- de Ajustes, así que nadie la ha cambiado: se fija sin mirar el valor anterior (y se crea si faltara).
insert into hidrantes.config (clave, valor, actualizado_por) values ('dias_reserva_subida', '2', 'migracion')
on conflict (clave) do update set valor = excluded.valor, actualizado_por = excluded.actualizado_por;

-- Igual que 0027 con los dos topes nuevos en la lista blanca de Ajustes (FR-142).
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
    "max_subidas_dia_total": [1, 5000]}';
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

-- ---------- 2. tope de propuestas (RV-141) ----------
-- El cuerpo de 0035 con dos cambios: el tope diario, después de la idempotencia y de todas las
-- comprobaciones y justo antes de insertar; y el nombre o apellido de más de 60 con su campo.
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

  -- Tope diario por dispositivo (RV-141, DEC-174). Jefatura no tiene. Bajo un bloqueo por
  -- dispositivo: dos envíos a la vez no pasan los dos la última plaza (05 §11). Un reintento con la
  -- misma clave_local ya ha salido arriba, así que no cuenta.
  -- El cliente solo ve el message: los dos números van en el texto, como pidió Frontend-campo en
  -- #484 ("CUOTA_PROPUESTAS_AGOTADA: maximo=60 reintentar_en_s=12345"), y repetidos en detail.
  if admin_email is null then
    perform pg_advisory_xact_lock(hashtext('propuestas:' || d::text));
    -- Un envío con la misma clave_local que entró mientras se esperaba el bloqueo es un reintento: se
    -- devuelve ese, no un "máximo de hoy" de una propuesta que sí existe.
    if exists (select 1 from hidrantes.propuestas x where x.clave_local = fn_proponer_interno.clave_local) then
      return hidrantes.fn_proponer_interno(token, clave_local, autor_nombre, autor_apellido, operacion, punto_id, datos,
        origen, lat, lng, gps_lat, gps_lng, precision_gps_m, exif_lat, exif_lng, foto_path, foto_sitio_path, exigir_foto_sitio);
    end if;
    tope_propuestas := (hidrantes.fn_config('max_propuestas_dia', '60') #>> '{}')::int;
    if (select count(*) from hidrantes.propuestas x
         where x.dispositivo_id = d and x.creada_en >= hoy_madrid) >= tope_propuestas then
      raise exception using errcode = 'P0001',
        message = format('CUOTA_PROPUESTAS_AGOTADA: maximo=%s reintentar_en_s=%s', tope_propuestas,
                         ceil(extract(epoch from manana_madrid - now()))::int),
        detail = jsonb_build_object('maximo', tope_propuestas,
                   'reintentar_en_s', ceil(extract(epoch from manana_madrid - now()))::int)::text;
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

-- ---------- 3. tope global de subidas (RV-142) ----------

-- ¿Es d el dispositivo técnico de un administrador (de cualquier fila, activa o no)? 05 §6.3.
create function hidrantes.fn_es_dispositivo_admin(d uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, hidrantes as $$
  select exists (select 1 from hidrantes.administradores a where hidrantes.fn_dispositivo_admin(a.email) = d);
$$;

revoke all on function hidrantes.fn_es_dispositivo_admin(uuid) from public, anon, authenticated;

create index if not exists subidas_reservada_en_idx on hidrantes.subidas (reservada_en);

-- Misma firma que 0005; el cuerpo de 0035 más el tope global. Los administradores ni cuentan ni se
-- paran. Bloqueos siempre en el mismo orden (dispositivo y después global): sin interbloqueos.
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
  if not hidrantes.fn_es_dispositivo_admin(d) then
    perform pg_advisory_xact_lock(hashtext('subidas:global'));
    if (select count(*) from hidrantes.subidas s
         where s.reservada_en > now() - interval '1 day'
           and not exists (select 1 from hidrantes.administradores a
                            where hidrantes.fn_dispositivo_admin(a.email) = s.dispositivo_id))
       >= (hidrantes.fn_config('max_subidas_dia_total', '400') #>> '{}')::int then
      perform hidrantes.fn_error('CUOTA_SUBIDAS_AGOTADA', 'Hoy se ha llegado al máximo de fotos de todo el grupo');
    end if;
  end if;
  ruta := 'fotos/' || gen_random_uuid() || '.jpg';
  insert into hidrantes.subidas (dispositivo_id, foto_path) values (d, ruta);
  return ruta;
end $$;

-- Para purgar-fotos.ts (RV-142): las reservas nunca confirmadas de más de 48 h que nada referencia.
-- Son basura segura: la purga las borra sin contarlas en su freno del 10 %, que sigue para las fotos
-- que sí estuvieron referenciadas. Una sola fila jsonb, como fn_fotos_referenciadas_lista (0020).
create function hidrantes.fn_reservas_sin_confirmar_lista() returns jsonb
language sql stable security definer set search_path = pg_catalog, hidrantes as $$
  select jsonb_build_object(
    'fotos', coalesce(jsonb_agg(f.foto_path order by f.foto_path), '[]'::jsonb),
    'total', count(*))
  from (select distinct s.foto_path from hidrantes.subidas s
         where s.confirmada_en is null and s.reservada_en < now() - interval '48 hours'
           and s.foto_path not in (select jsonb_array_elements_text(hidrantes.fn_fotos_referenciadas_lista() -> 'fotos'))) f;
$$;

-- Solo service_role, como la de las referenciadas (CLAUDE.md §3, 11 §3).
revoke all on function hidrantes.fn_reservas_sin_confirmar_lista() from public, anon, authenticated;
grant execute on function hidrantes.fn_reservas_sin_confirmar_lista() to service_role;

-- ---------- 4. dispositivo reservado (RV-143) ----------

-- Los tokens que ya se hubieran canjeado con el dispositivo_id de un administrador dejan de valer, y
-- fn_validar_token no acepta ninguno más: también cubre a un administrador que se dé de alta después
-- de que alguien canjeara con su id. Sin esto, ese token seguiría compartiendo la cuota de fotos del
-- administrador, viendo sus propuestas y saltándose el tope global.
update hidrantes.dispositivos set revocado_en = now()
 where revocado_en is null and hidrantes.fn_es_dispositivo_admin(dispositivo_id);

-- Misma firma que 0005; el cuerpo de entonces más la comprobación del dispositivo reservado.
create or replace function hidrantes.fn_validar_token(token text) returns uuid
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
  if d.revocado_en is not null or hidrantes.fn_es_dispositivo_admin(d.dispositivo_id) then
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

-- El intento con un dispositivo reservado queda marcado (tope = 'dispositivo_reservado'), para que se
-- vea en Salud del sistema y no pase por un canje bueno cualquiera.
do $tope$
declare
  nombre text;
begin
  select c.conname into nombre from pg_constraint c
   where c.conrelid = 'hidrantes.intentos_codigo'::regclass and c.contype = 'c'
     and pg_get_constraintdef(c.oid) like '%tope%';
  if nombre is not null then
    execute format('alter table hidrantes.intentos_codigo drop constraint %I', nombre);
  end if;
end
$tope$;
alter table hidrantes.intentos_codigo add constraint intentos_codigo_tope_check
  check (tope in ('dispositivo', 'ip', 'global', 'altas_ip', 'altas_global', 'dispositivo_reservado'));
-- El cuerpo de 0026 más una comprobación con el código ya bueno: el dispositivo_id técnico de un
-- administrador (fn_dispositivo_admin de cualquier fila de administradores, activa o no) no recibe
-- token. DISPOSITIVO_RESERVADO, sin decir de quién es. Solo con el código bueno, para que sin él no
-- sirva para saber qué correos son de jefatura; el intento ya está anotado como canje bueno, así que
-- cuenta en max_altas_ip_dia y max_altas_global_hora.
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
  intento bigint;
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
  insert into hidrantes.dispositivos (dispositivo_id, token_hash) values (fn_verificar_codigo.dispositivo_id, hidrantes.fn_sha256(nuevo));
  return query select nuevo, now() + make_interval(days => caducidad), null::text;
end $$;
