-- 0012 · Las bajas llegan también cuando el punto ya se purgó, y el móvil sabe si los datos se
-- restauraron (docs/17 RV-06, DEC-083).
--
-- `bajas` solo listaba puntos que todavía existen con situacion <> 'activo'; a los 30 días la purga
-- de la papelera borra la fila, y un móvil que no sincronizó entre el borrado y la purga seguía
-- enseñando ese hidrante para siempre. La purga deja su huella en el registro (accion =
-- 'purga_papelera', punto_id), que es inmutable: de ahí salen ahora también.
--
-- `epoca_datos` la cambia restaurar.ts en cada restauración: al verla distinta, el móvil repite una
-- sincronización completa, porque lo restaurado vuelve con actualizado_en antiguos que la
-- incremental no recogería.
--
-- Misma firma: compatible con el frontend anterior, que ignora la clave nueva de config (04 §12).
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
    -- 60 s de solape: una escritura que aún no había confirmado al leer entra en la siguiente
    -- sincronización (el cliente reemplaza por id, así que repetir no duplica).
    'sincronizado_en', ahora - interval '60 seconds',
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
