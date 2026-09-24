-- 0017 · Fusión: se elige también la descripción y, si prevalece la ubicación de la propuesta, se
-- recalculan municipio, núcleo y dirección como al aplicar una corrección de ubicación
-- (docs/17 RV-18, FR-106, 05 §6.2).
--
-- Misma firma (04 §12). create or replace rehace los atributos: lleva el lock_timeout de 0016.
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
    update hidrantes.puntos x set
      racor = case when 'racor' = any (usa_propuesta) then (r.datos ->> 'racor')::hidrantes.tipo_racor else x.racor end,
      caudal = case when 'caudal' = any (usa_propuesta) then (r.datos ->> 'caudal')::hidrantes.estado_caudal else x.caudal end,
      descripcion_fallo = case when 'caudal' = any (usa_propuesta)
                               then nullif(trim(r.datos ->> 'descripcion_fallo'), '') else x.descripcion_fallo end,
      diametro_mm = case when 'diametro_mm' = any (usa_propuesta) and r.datos ? 'diametro_mm'
                         then (r.datos ->> 'diametro_mm')::smallint else x.diametro_mm end,
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
  exception when check_violation or invalid_text_representation then
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
