-- 0025 · Diez minutos de solape en la sincronización incremental (docs/18 RV-45).
--
-- `sincronizado_en` era now() - 60 s, y `actualizado_en` es la hora de **inicio** de la transacción
-- que escribe. Un fn_aprobar_lote de 50 propuestas con esperas de bloqueo de hasta 5 s cada una
-- (lock_timeout, 0016) puede confirmar más de 60 s después de empezar: sus cambios llevan un
-- actualizado_en anterior al sello que ya recibió un móvil, y la incremental se los saltaba hasta la
-- completa semanal. Diez minutos cubren un lote de 50 × 5 s (algo más de 4 min) con margen; el coste
-- es repetir los puntos cambiados en los últimos 10 minutos, que el cliente reemplaza por id.
--
-- Misma firma y mismo resultado salvo el sello (04 §12).
create or replace function hidrantes.fn_listar_puntos(token text, desde timestamptz default null) returns jsonb
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
      'epoca_datos',       hidrantes.fn_config('epoca_datos', 'null')
    )
  );
end $$;
