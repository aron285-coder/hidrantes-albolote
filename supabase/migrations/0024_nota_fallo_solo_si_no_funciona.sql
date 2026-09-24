-- 0024 · Un punto que vuelve a funcionar pierde la nota de fallo (docs/18 RV-42).
--
-- fn_editar_punto conservaba descripcion_fallo al pasar de 'no_funciona' a otro estado, y la ficha
-- la enseñaba siempre: en una emergencia decía "bueno" y a la vez "Fallo: tapa soldada". Es la misma
-- regla que ya aplicaba fn_aplicar_propuesta ("si vuelve a funcionar, la descripción del fallo
-- anterior ya no vale", 0006:85-87, igual en 0023). Misma firma; conserva el lock_timeout y el
-- rechazo de un tipo distinto de 0023.

create or replace function hidrantes.fn_editar_punto(punto_id uuid, cambios jsonb) returns void
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes
set lock_timeout = '5s' as $$
declare
  actor text := hidrantes.fn_exigir_admin();
  p hidrantes.puntos;
  antes jsonb;
  tipo_final hidrantes.tipo_punto;
  caudal_final hidrantes.estado_caudal;
begin
  if cambios is null or jsonb_typeof(cambios) <> 'object' or cambios = '{}'::jsonb then
    perform hidrantes.fn_error('PAYLOAD_INVALIDO(cambios)', 'No has cambiado nada');
  end if;
  perform hidrantes.fn_exigir_claves(cambios, array['tipo', 'diametro_mm', 'caudal', 'racor', 'descripcion_fallo',
                                                    'descripcion', 'direccion']);
  select * into p from hidrantes.puntos x where x.id = punto_id for update;
  if not found or p.situacion <> 'activo' then
    perform hidrantes.fn_error('PUNTO_NO_ACTIVO', 'El punto ya no está activo');
  end if;
  antes := hidrantes.fn_punto_json(p);
  if cambios ? 'tipo' and cambios ->> 'tipo' is distinct from p.tipo::text then
    perform hidrantes.fn_error('TIPO_NO_MODIFICABLE', 'El tipo no se cambia: propón retirarlo y da de alta el correcto');
  end if;
  begin
    tipo_final := coalesce((cambios ->> 'tipo')::hidrantes.tipo_punto, p.tipo);
    caudal_final := coalesce((cambios ->> 'caudal')::hidrantes.estado_caudal, p.caudal);
    update hidrantes.puntos x set
      tipo = tipo_final,
      diametro_mm = case when tipo_final = 'boca_riego' then 45
                         else coalesce((cambios ->> 'diametro_mm')::smallint, x.diametro_mm) end,
      caudal = caudal_final,
      racor = case when tipo_final = 'boca_riego' then coalesce((cambios ->> 'racor')::hidrantes.tipo_racor, x.racor) end,
      -- La nota de fallo solo vale mientras no funciona: si vuelve a funcionar, se borra (RV-42).
      descripcion_fallo = case when caudal_final <> 'no_funciona' then null
                               when cambios ? 'descripcion_fallo' then nullif(trim(cambios ->> 'descripcion_fallo'), '')
                               else x.descripcion_fallo end,
      descripcion = case when cambios ? 'descripcion' then nullif(trim(cambios ->> 'descripcion'), '') else x.descripcion end,
      direccion = case when cambios ? 'direccion' then nullif(trim(cambios ->> 'direccion'), '') else x.direccion end
    where x.id = punto_id
    returning * into p;
  exception when check_violation or invalid_text_representation then
    perform hidrantes.fn_error('PAYLOAD_INVALIDO(' || coalesce(hidrantes.constraint_name_de(sqlerrm), 'cambios') || ')',
                               'El resultado no cumple las reglas del punto');
  end;
  perform hidrantes.fn_registrar(actor, null, true, 'edicion_admin', punto_id, null, antes, hidrantes.fn_punto_json(p));
end $$;

-- Los puntos que ya están así: la nota es un dato derivado que ya no vale, sin pérdida real (el
-- registro conserva el `antes`). El trigger actualiza actualizado_en y los móviles lo reciben.
do $limpieza$
declare n integer;
begin
  update hidrantes.puntos set descripcion_fallo = null
   where caudal <> 'no_funciona' and descripcion_fallo is not null;
  get diagnostics n = row_count;
  raise notice 'notas de fallo borradas de puntos que ya funcionan: %', n;
end
$limpieza$;
