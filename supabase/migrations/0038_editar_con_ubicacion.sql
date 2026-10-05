-- 0038 · Mover el punto desde Editar (docs/29 RV-120, DEC-169, FR-120).
--
-- fn_editar_punto, igual que en 0032 (su última versión), con dos claves nuevas: lat y lng.
--   - Van las dos o ninguna; una sola, un valor que no es número o fuera de los límites del check
--     puntos_coordenadas → PAYLOAD_INVALIDO(ubicacion). Se valida aquí, antes del update, para que
--     el código sea "ubicacion" y no el nombre de la constraint.
--   - Fuera de la zona habitual pero dentro de esos límites se acepta: municipio 'fuera_de_zona',
--     como al aprobar una ubicación (lo avisa la pantalla).
--   - Con lat y lng: geom nueva y municipio y núcleo de fn_municipio_de, como fn_aplicar_propuesta
--     con 'ubicacion'. Por eso el search_path lleva extensions.
--   - La misma posición que ya tiene (a 0,1 m) no es un movimiento: el panel puede mandarla
--     aunque no se haya tocado el pin, y no debe dejar un desplazamiento de 0 m en el registro.
--   - Registro: una sola entrada 'edicion_admin' por llamada, aunque cambien varias cosas; si se
--     movió, despues lleva desplazamiento_m redondeado a 0,1 m, como fn_aprobar con 'ubicacion'.
--   - Desactualizadas: el update dispara puntos_actualizado_en (0001), que pone actualizado_en =
--     now(); v_cola_revision marca desactualizada toda pendiente creada antes (0036). No hace falta
--     nada más; lo comprueba el pgTAP 33.
-- Misma firma (04 §12): la versión anterior del panel no manda lat/lng y sigue funcionando igual.
-- Mismos permisos: solo administradores (fn_exigir_admin); el grant de 0007 se conserva con
-- create or replace.

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
