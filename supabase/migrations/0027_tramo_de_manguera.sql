-- 0027 · Longitud del tramo de manguera (FR-142, FR-74, FR-76; docs/18 GM-01).
--
-- Un parámetro nuevo en config, con 20 m por defecto, que viaja a los móviles en la config de
-- fn_listar_puntos (aditivo: el frontend anterior ignora la clave) y que jefatura cambia desde
-- Ajustes con fn_guardar_config, entre 10 y 30 m, como los demás parámetros. Mismas firmas (04 §12);
-- fn_guardar_config conserva el lock_timeout de 0016.

insert into hidrantes.config (clave, valor, actualizado_por) values ('metros_tramo_manguera', '20', 'migracion')
on conflict (clave) do nothing;

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
      'epoca_datos',       hidrantes.fn_config('epoca_datos', 'null'),
      'metros_tramo_manguera', hidrantes.fn_config('metros_tramo_manguera', '20')
    )
  );
end $$;

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
    "metros_tramo_manguera": [10, 30]}';
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
