-- 0042 · Los topes de fotos dicen hasta cuándo esperar, y la medida del espacio no se queda en 0 sin
-- avisar (docs/32 RV-220, petición de la subagente de Functions en #535; revisión de #542).
--
-- 1. fn_reservar_subida: CUOTA_SUBIDAS_AGOTADA y SIN_ESPACIO_FOTOS con el mismo formato que
--    RESERVAS_ABIERTAS y CUOTA_PROPUESTAS_AGOTADA: 'CODIGO: maximo=<n> reintentar_en_s=<s>' (más
--    ' ambito=dispositivo|grupo' en la cuota), y lo mismo en JSON en detail. /api/url-subida saca de
--    ahí los números para que la cola espere en vez de fallar. Mismo código al principio: la app
--    0.9.0, que mira el prefijo, no cambia.
--      · del móvil (max_subidas_dispositivo_dia): hasta que su reserva más antigua de las últimas 24 h
--        cumpla 24 h;
--      · del grupo (max_subidas_dia_total): hasta que la primera de las que cuentan deje de contar (una
--        confirmada a las 24 h de reservarse; una abierta, a las 2 h);
--      · SIN_ESPACIO_FOTOS: maximo en bytes (max_bytes_fotos) y reintentar_en_s = 3600 (el espacio se
--        libera con la purga o cuando jefatura actúa; no hay hora cierta).
-- 2. fn_espacio_fotos: sin la política hidrantes_migrador_mide_fotos, la RLS de storage.objects daría
--    0 filas sin error (un bucket "vacío" que quitaría el tope): se trata como sin permiso. Un archivo
--    sin tamaño legible cuenta como 5 MB (el máximo del bucket), no como 0.
-- 3. fn_espacio: fotos_medidos_en, de cuándo es la medida (now() si viene del bucket; si no, el
--    actualizado_en de config.storage_bytes), para que la vigilancia vea una medida vieja.
--
-- Mismas firmas (04 §12): create or replace conserva los grant.

-- Lanza un error de tope con los números en el message y en detail.
create function hidrantes.fn_error_tope(codigo text, maximo bigint, espera integer, ambito text default null)
returns void
language plpgsql immutable set search_path = pg_catalog as $$
begin
  raise exception using errcode = 'P0001',
    message = format('%s: maximo=%s reintentar_en_s=%s', codigo, maximo, greatest(espera, 1))
              || coalesce(' ambito=' || ambito, ''),
    detail = jsonb_strip_nulls(jsonb_build_object('maximo', maximo, 'reintentar_en_s', greatest(espera, 1),
                                                  'ambito', ambito))::text;
end $$;

revoke all on function hidrantes.fn_error_tope(text, bigint, integer, text) from public, anon, authenticated;

-- El cuerpo de 0041 con los números en cada error.
create or replace function hidrantes.fn_reservar_subida_para(d uuid) returns text
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes as $$
declare
  ruta text;
  es_admin boolean := hidrantes.fn_es_dispositivo_admin(d);
  tope integer;
  hechas integer;
  abiertas_d integer;
  mas_antigua timestamptz;
  espacio record;
  max_fotos bigint;
begin
  perform pg_advisory_xact_lock(hashtext('subidas:' || d::text));
  tope := (hidrantes.fn_config('max_subidas_dispositivo_dia', '80') #>> '{}')::int;
  select count(*)::int, min(s.reservada_en) into hechas, mas_antigua
    from hidrantes.subidas s
   where s.dispositivo_id = d and s.reservada_en > now() - interval '1 day';
  if hechas >= tope then
    perform hidrantes.fn_error_tope('CUOTA_SUBIDAS_AGOTADA', tope,
      ceil(extract(epoch from mas_antigua + interval '1 day' - now()))::int, 'dispositivo');
  end if;
  if not es_admin then
    -- Reservas abiertas de este móvil (el token ya se ha validado: no está liberado).
    tope := (hidrantes.fn_config('max_reservas_abiertas', '6') #>> '{}')::int;
    select count(*)::int, min(s.reservada_en) into abiertas_d, mas_antigua
      from hidrantes.subidas s
     where s.dispositivo_id = d and s.confirmada_en is null and s.reservada_en > now() - interval '2 hours';
    if abiertas_d >= tope then
      perform hidrantes.fn_error_tope('RESERVAS_ABIERTAS', tope,
        ceil(extract(epoch from mas_antigua + interval '2 hours' - now()))::int);
    end if;
    perform pg_advisory_xact_lock(hashtext('subidas:global'));
    tope := (hidrantes.fn_config('max_subidas_dia_total', '150') #>> '{}')::int;
    if hidrantes.fn_subidas_contadas() >= tope then
      -- La primera de las que cuentan (las mismas que fn_subidas_contadas) que deja de contar.
      select min(case when s.confirmada_en is not null then s.reservada_en + interval '1 day'
                      else s.reservada_en + interval '2 hours' end)
        into mas_antigua
        from hidrantes.subidas s
       where s.reservada_en > now() - interval '1 day'
         and not hidrantes.fn_es_dispositivo_admin(s.dispositivo_id)
         and (s.confirmada_en is not null
              or (s.reservada_en > now() - interval '2 hours' and not hidrantes.fn_dispositivo_liberado(s.dispositivo_id)));
      perform hidrantes.fn_error_tope('CUOTA_SUBIDAS_AGOTADA', tope,
        coalesce(ceil(extract(epoch from mas_antigua - now()))::int, 3600), 'grupo');
    end if;
  end if;
  -- Espacio: lo que hay, 5 MB por reserva abierta sin archivo y 5 MB de esta. Para todos.
  max_fotos := (hidrantes.fn_config('max_bytes_fotos', '838860800') #>> '{}')::bigint;
  select * into espacio from hidrantes.fn_espacio_fotos();
  if espacio.bytes + (espacio.abiertas + 1)::bigint * 5242880 > max_fotos then
    perform hidrantes.fn_error_tope('SIN_ESPACIO_FOTOS', max_fotos, 3600);
  end if;
  ruta := 'fotos/' || gen_random_uuid() || '.jpg';
  insert into hidrantes.subidas (dispositivo_id, foto_path) values (d, ruta);
  return ruta;
end $$;

-- Misma firma que 0041; sin la política se trata como sin permiso, y un tamaño ilegible son 5 MB.
create or replace function hidrantes.fn_espacio_fotos(out bytes bigint, out origen text, out abiertas integer)
language plpgsql stable security definer set search_path = pg_catalog, hidrantes as $$
begin
  begin
    if not exists (select 1 from pg_policies p where p.schemaname = 'storage' and p.tablename = 'objects'
                     and p.policyname = 'hidrantes_migrador_mide_fotos') then
      raise exception using errcode = 'insufficient_privilege',
        message = 'falta la política hidrantes_migrador_mide_fotos en storage.objects';
    end if;
    select coalesce(sum(case when o.metadata ->> 'size' ~ '^[0-9]{1,18}$' then (o.metadata ->> 'size')::bigint
                             else 5242880 end), 0)
      into bytes
      from storage.objects o
     where o.bucket_id in ('hidrantes-fotos', 'hidrantes-fotos-dev');
    select count(*)::int into abiertas
      from hidrantes.subidas s
     where s.confirmada_en is null and s.reservada_en > now() - interval '2 hours'
       and not hidrantes.fn_dispositivo_liberado(s.dispositivo_id)
       and not exists (select 1 from storage.objects o
                        where o.bucket_id in ('hidrantes-fotos', 'hidrantes-fotos-dev') and o.name = s.foto_path);
    origen := 'storage';
  exception when insufficient_privilege or undefined_table or invalid_schema_name then
    bytes := case when jsonb_typeof(hidrantes.fn_config('storage_bytes', 'null')) = 'number'
                  then (hidrantes.fn_config('storage_bytes', 'null') #>> '{}')::numeric::bigint end;
    origen := case when bytes is null then 'sin_dato' else 'respaldo' end;
    bytes := coalesce(bytes, 0);
    select count(*)::int into abiertas
      from hidrantes.subidas s
     where s.confirmada_en is null and s.reservada_en > now() - interval '2 hours'
       and not hidrantes.fn_dispositivo_liberado(s.dispositivo_id);
  end;
end $$;

-- Misma firma que 0041 más fotos_medidos_en.
create or replace function hidrantes.fn_espacio() returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, hidrantes as $$
declare
  f record;
begin
  select * into f from hidrantes.fn_espacio_fotos();
  return jsonb_build_object(
    'fotos_bytes', f.bytes,
    'fotos_origen', f.origen,
    'fotos_medidos_en', case when f.origen = 'storage' then to_jsonb(now())
                             else (select to_jsonb(c.actualizado_en) from hidrantes.config c
                                    where c.clave = 'storage_bytes') end,
    'reservas_abiertas', f.abiertas,
    'fotos_reservado_bytes', f.abiertas::bigint * 5242880,
    'max_bytes_fotos', (hidrantes.fn_config('max_bytes_fotos', '838860800') #>> '{}')::bigint,
    'bd_bytes', pg_database_size(current_database()),
    'max_bytes_bd', (hidrantes.fn_config('max_bytes_bd', '419430400') #>> '{}')::bigint,
    'aviso', 0.7);
end $$;
