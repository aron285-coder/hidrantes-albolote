-- 0015 · Código de acceso: cuenta bajo bloqueo, tope de canjes buenos y topes anotados
-- (docs/17 RV-14, TR-41, 11 §3, DEC-086).
--
-- - La cuenta de intentos y la anotación iban sin bloqueo: peticiones en paralelo pasaban el tope.
--   Ahora un bloqueo consultivo serializa los canjes, que son pocos (unos 65 voluntarios).
-- - Los canjes **buenos** no tenían límite: quien tuviera el código podía crear dispositivos sin fin
--   y saltarse las cuotas por dispositivo (40 fotos de 5 MB al día). Topes de 150 por IP y día y 150
--   por hora en total: cubren con margen la sesión presencial de F9.9, 65 personas en la misma wifi.
-- - Cada DEMASIADOS_INTENTOS se anota (bloqueado = true, y qué tope) para Salud del sistema y la
--   vigilancia. Esas filas no cuentan como fallos: si contaran, reintentar alargaría el bloqueo.
--
-- Misma firma: compatible con la Function anterior (04 §12).

alter table hidrantes.intentos_codigo
  add column bloqueado boolean not null default false,
  add column tope text check (tope in ('dispositivo', 'ip', 'global', 'altas_ip', 'altas_global'));

insert into hidrantes.config (clave, valor, actualizado_por) values
  ('max_altas_ip_dia',      '150', 'migracion'),
  ('max_altas_global_hora', '150', 'migracion')
on conflict (clave) do nothing;

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
    -- Anotado para Salud del sistema y la vigilancia; no cuenta como fallo.
    insert into hidrantes.intentos_codigo (dispositivo_id, ip_hash, exito, bloqueado, tope)
    values (fn_verificar_codigo.dispositivo_id, fn_verificar_codigo.ip_hash, false, true, tope_alcanzado);
    return query select null::text, null::timestamptz, 'DEMASIADOS_INTENTOS'::text;
    return;
  end if;

  -- bcrypt siempre, con código bien o mal formado: tiempo constante (TR-42).
  correcto := crypt(coalesce(codigo, ''), hash_comparar) = hash_comparar
              and hash_guardado is not null
              and coalesce(codigo, '') ~ '^[0-9]{6}$';

  insert into hidrantes.intentos_codigo (dispositivo_id, ip_hash, exito)
  values (fn_verificar_codigo.dispositivo_id, fn_verificar_codigo.ip_hash, correcto);

  if not correcto then
    return query select null::text, null::timestamptz, 'CODIGO_INCORRECTO'::text;
    return;
  end if;

  nuevo := hidrantes.fn_aleatorio_b64url(32);
  insert into hidrantes.dispositivos (dispositivo_id, token_hash) values (fn_verificar_codigo.dispositivo_id, hidrantes.fn_sha256(nuevo));
  return query select nuevo, now() + make_interval(days => caducidad), null::text;
end $$;

-- Salud del sistema (FR-143) con los intentos del código de las últimas 24 h (RV-14): fallos y
-- topes alcanzados, y cuántos de estos por un tope de todo el grupo (posible ataque).
create or replace function hidrantes.fn_salud() returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, hidrantes as $$
begin
  perform hidrantes.fn_exigir_admin();
  return jsonb_build_object(
    'pendientes_14d', (select count(*) from hidrantes.propuestas where estado = 'pendiente'
                         and creada_en < now() - interval '14 days'),
    'incidencias_abiertas', (select count(*) from hidrantes.incidencias_app where estado = 'abierta'),
    'errores_7d', (select count(*) from hidrantes.errores_cliente where momento > now() - interval '7 days'),
    'sin_direccion', (select count(*) from hidrantes.puntos where situacion = 'activo' and direccion is null),
    'ultimo_respaldo', hidrantes.fn_config('ultimo_respaldo', 'null'),
    'storage_bytes', hidrantes.fn_config('storage_bytes', 'null'),
    'version_zona', hidrantes.fn_config('version_zona', 'null'),
    'version_mapabase', hidrantes.fn_config('version_mapabase', 'null'),
    'ultima_vigilancia', hidrantes.fn_config('ultima_vigilancia', 'null'),
    'vigilancia_ok', hidrantes.fn_config('vigilancia_ok', 'null'),
    'dispositivos_activos', (select count(*) from hidrantes.dispositivos where revocado_en is null
                               and ultimo_uso > now() - interval '90 days'),
    'intentos_fallidos_24h', (select count(*) from hidrantes.intentos_codigo
                                where momento > now() - interval '24 hours' and not exito and not bloqueado),
    'topes_alcanzados_24h', (select count(*) from hidrantes.intentos_codigo
                               where momento > now() - interval '24 hours' and bloqueado),
    'topes_globales_24h', (select count(*) from hidrantes.intentos_codigo
                             where momento > now() - interval '24 hours' and bloqueado
                               and tope in ('global', 'altas_global'))
  );
end $$;
