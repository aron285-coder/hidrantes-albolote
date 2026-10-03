-- 0034 · Uso del estado "barro" (docs/24 RV-102, DEC-145, FR-18, FR-61).
--
-- Va después de 0033 (el valor del enum) y, en develop, después de RV-102a: un móvil con la app
-- anterior en caché tiene que poder dibujar un estado que no conoce antes de que el servidor
-- devuelva "barro" (docs/24 §0).
--
-- Repaso de cada comparación de caudal con 'no_funciona' (grep en supabase/migrations):
--   - puntos_fallo_descrito (0001): no cambia; solo "no funciona" exige descripción.
--   - fn_validar_datos (0032): la descripción del fallo solo es obligatoria con no_funciona; "barro"
--     ya entra en alta y estado por el cast al enum (0033), sin descripción.
--   - fn_aplicar_propuesta y fn_editar_punto: la nota de fallo solo vale con no_funciona (RV-42);
--     con "barro" se borra, como con cualquier otro estado. En el alta y en la fusión se guardaba
--     la que llegara, fuera cual fuera el estado: ahora siguen la misma regla.
--   - fn_radio_px: factor de caudal 0 (tamaño mínimo), como no_funciona; ya salía por el "else 0",
--     y se escribe explícito.
--   - Cercanos (FR-74) se calcula en el móvil y solo lista bueno y regular: no hay consulta en SQL.
-- Mismas firmas; las funciones que bloquean filas conservan su lock_timeout.

-- ---------- aprobación ----------
-- Igual que 0032 salvo la nota de fallo del alta: solo con no_funciona.
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
              -- la nota de fallo solo vale con no_funciona (RV-42); con barro o cualquier otro, nada
              case when m ->> 'caudal' = 'no_funciona' then nullif(trim(m ->> 'descripcion_fallo'), '') end,
              nullif(trim(m ->> 'descripcion'), ''),
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

-- ---------- fusión ----------
-- Igual que 0032 salvo la nota de fallo de la propuesta: solo con no_funciona.
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

-- ---------- tamaño del marcador (06 §4, FR-61) ----------
-- "barro" no se puede usar: tamaño mínimo, como no_funciona.
create or replace function hidrantes.fn_radio_px(diametro_mm smallint, caudal hidrantes.estado_caudal) returns numeric
language sql stable set search_path = pg_catalog, hidrantes as $$
  with p as (
    select (case when diametro_mm is null then 0
                 when diametro_mm <= 45 then 1
                 when diametro_mm <= 70 then 2
                 else 3 end)
         * (case caudal when 'bueno' then 1.0 when 'regular' then 0.66 when 'malo' then 0.33
                        when 'barro' then 0 when 'no_funciona' then 0 else 0 end)
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

