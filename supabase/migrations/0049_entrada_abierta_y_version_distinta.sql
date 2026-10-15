-- docs/37 (DEC-211; RV-491, RV-492). Solo hacia delante.
--   1. RV-491: /api/verificar-codigo pregunta con la service role si la entrada está abierta, para dejar
--      pasar más intentos por minuto y por IP agrupada (DEC-211). fn_entrada_abierta_hasta() solo la
--      ejecutaba quien la llamaba desde dentro (security definer): execute para service_role y nadie más.
--   2. RV-492: fn_editar_punto rechaza con PUNTO_CAMBIADO cualquier versión distinta de la guardada (al
--      milisegundo), no solo una anterior. Misma firma.
-- La Cola (fn_aplicar_propuesta, 0045) compara datos_cambiados_en > creada_en de la propuesta: es otra
-- cosa (¿ha cambiado el punto después de proponer?) y se queda como está.

-- ---------- 1. la entrada abierta, para la Function (RV-491) ----------

grant execute on function hidrantes.fn_entrada_abierta_hasta() to service_role;

-- ---------- 2. fn_editar_punto: la versión, distinta (RV-492) ----------

-- El cuerpo de 0048 con la comparación cambiada.
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
  -- docs/37 RV-492: distinta, no solo más nueva. now() es la hora en que empezó la transacción, no la de
  -- su commit: un cambio que empezó antes y terminó después de otro deja una marca anterior, y con «>»
  -- se pisaría.
  if fn_editar_punto.version is not null
     and date_trunc('milliseconds', p.datos_cambiados_en)
         is distinct from date_trunc('milliseconds', fn_editar_punto.version) then
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
