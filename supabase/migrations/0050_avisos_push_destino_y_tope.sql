-- 0050 · Avisos push: comprobaciones del destino y tope por móvil (docs/39 RV-515, DEC-218).
--
-- 1. El destino de una suscripción es `https://` seguido de una autoridad que es solo un host de la lista de servicios
--    de push (FCM, Mozilla, Apple, Windows): sin usuario, contraseña ni puerto. /api/push lo vuelve a comprobar antes
--    de enviar (functions/_lib/destino-push.ts).
-- 2. Como mucho 3 suscripciones por móvil y 3 por correo de jefatura (la nueva sustituye a la más vieja), y temas sin
--    repetir; el del voluntario, solo `resultado_propuesta`.
-- 3. Un móvil que se queda sin ningún token válido se queda sin suscripciones (un disparador: cubre todas las formas de
--    revocar). Un administrador sin acceso, igual, y los avisos de jefatura solo van a administradores activos.
-- 4. Las suscripciones guardadas que no cumplen esto se borran.
--
-- Compatibilidad (04 §12): mismas firmas. El frontend anterior ya manda un solo tema y destinos de la lista.

-- ---------- 1. el destino ----------

create or replace function hidrantes.fn_validar_suscripcion(suscripcion jsonb) returns void
language plpgsql immutable set search_path = pg_catalog as $$
declare
  destino text := coalesce(suscripcion ->> 'endpoint', '');
  -- La autoridad: lo que va entre `https://` y la primera `/`, `?` o `#`. Tiene que ser solo un host.
  autoridad text := lower(substring(destino from '^https://([^/?#]*)'));
begin
  if jsonb_typeof(suscripcion) <> 'object' or autoridad is null
     or autoridad !~ '^[a-z0-9.-]+$'
     or not (autoridad = 'fcm.googleapis.com'
             or autoridad ~ '^([a-z0-9-]+\.)+push\.services\.mozilla\.com$'
             or autoridad = 'web.push.apple.com'
             or autoridad ~ '^([a-z0-9-]+\.)+push\.apple\.com$'
             or autoridad ~ '^([a-z0-9-]+\.)+notify\.windows\.com$')
     or suscripcion #>> '{keys,p256dh}' is null or suscripcion #>> '{keys,auth}' is null
     or length(suscripcion::text) > 2000 then
    perform hidrantes.fn_error('PAYLOAD_INVALIDO(suscripcion)', 'Suscripción no válida');
  end if;
end $$;

-- ---------- 2. guardar, con tope ----------

create or replace function hidrantes.fn_guardar_suscripcion_push(token text, suscripcion jsonb, temas text[]) returns uuid
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes as $$
#variable_conflict use_column
declare
  d uuid := hidrantes.fn_validar_token(token);
  t text[] := coalesce(fn_guardar_suscripcion_push.temas, '{resultado_propuesta}');
  id_s uuid;
begin
  perform hidrantes.fn_validar_suscripcion(fn_guardar_suscripcion_push.suscripcion);
  if t is distinct from array['resultado_propuesta'] then
    perform hidrantes.fn_error('PAYLOAD_INVALIDO(temas)', 'Tema no admitido');
  end if;
  -- Un móvil puede tener varias filas en dispositivos (una por token): el cerrojo es por móvil (05 §11).
  perform pg_advisory_xact_lock(hashtext('suscripciones:' || d::text));
  insert into hidrantes.suscripciones_push (dispositivo_id, suscripcion, temas)
  values (d, fn_guardar_suscripcion_push.suscripcion, t)
  on conflict ((suscripcion ->> 'endpoint'), (dispositivo_id is null))
  do update set dispositivo_id = excluded.dispositivo_id, suscripcion = excluded.suscripcion,
                temas = excluded.temas, fallos = 0, creada_en = now()
  returning id into id_s;
  -- Como mucho 3 por móvil: se quedan las más nuevas.
  delete from hidrantes.suscripciones_push s
   where s.dispositivo_id = d
     and s.id not in (select x.id from hidrantes.suscripciones_push x
                       where x.dispositivo_id = d order by x.creada_en desc, x.id = id_s desc limit 3);
  return id_s;
end $$;

create or replace function hidrantes.fn_guardar_suscripcion_push_admin(suscripcion jsonb, temas text[]) returns uuid
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes as $$
#variable_conflict use_column
declare
  actor text := hidrantes.fn_exigir_admin();
  t text[] := fn_guardar_suscripcion_push_admin.temas;
  id_s uuid;
begin
  perform hidrantes.fn_validar_suscripcion(fn_guardar_suscripcion_push_admin.suscripcion);
  if coalesce(t, '{}') = '{}'
     or not t <@ array['nuevas_propuestas', 'resumen_semanal', 'avisos_tecnicos']
     or cardinality(t) <> (select count(distinct x) from unnest(t) x) then
    perform hidrantes.fn_error('PAYLOAD_INVALIDO(temas)', 'Tema no admitido');
  end if;
  perform pg_advisory_xact_lock(hashtext('suscripciones:' || actor));
  insert into hidrantes.suscripciones_push (email, suscripcion, temas)
  values (actor, fn_guardar_suscripcion_push_admin.suscripcion, t)
  on conflict ((suscripcion ->> 'endpoint'), (dispositivo_id is null))
  do update set email = excluded.email, suscripcion = excluded.suscripcion,
                temas = excluded.temas, fallos = 0, creada_en = now()
  returning id into id_s;
  -- Como mucho 3 por correo: se quedan las más nuevas.
  delete from hidrantes.suscripciones_push s
   where s.email = actor
     and s.id not in (select x.id from hidrantes.suscripciones_push x
                       where x.email = actor order by x.creada_en desc, x.id = id_s desc limit 3);
  return id_s;
end $$;

-- ---------- 3. sin acceso, sin suscripciones ----------

-- Cuando a un móvil no le queda ningún token válido (sin revocado_en), sus suscripciones se borran. Vale para
-- fn_revocar_dispositivo, fn_revocar_desde, el cambio de código revocando, la tarea de tokens sin uso y lo que venga.
create or replace function hidrantes.fn_suscripciones_tras_revocar() returns trigger
language plpgsql security definer set search_path = pg_catalog, hidrantes as $$
begin
  if new.revocado_en is not null and old.revocado_en is null
     and not exists (select 1 from hidrantes.dispositivos d
                      where d.dispositivo_id = new.dispositivo_id and d.revocado_en is null) then
    delete from hidrantes.suscripciones_push s where s.dispositivo_id = new.dispositivo_id;
  end if;
  return null;
end $$;
revoke all on function hidrantes.fn_suscripciones_tras_revocar() from public, anon, authenticated;

drop trigger if exists dispositivos_suscripciones_tras_revocar on hidrantes.dispositivos;
create trigger dispositivos_suscripciones_tras_revocar
  after update of revocado_en on hidrantes.dispositivos
  for each row execute function hidrantes.fn_suscripciones_tras_revocar();

-- Al quitar el acceso a un administrador (fn_gestionar_administrador o cualquier otra vía), sus suscripciones se
-- borran.
create or replace function hidrantes.fn_suscripciones_tras_quitar_acceso() returns trigger
language plpgsql security definer set search_path = pg_catalog, hidrantes as $$
begin
  if old.activo and not new.activo then
    delete from hidrantes.suscripciones_push s where lower(s.email) = lower(new.email);
  end if;
  return null;
end $$;
revoke all on function hidrantes.fn_suscripciones_tras_quitar_acceso() from public, anon, authenticated;

drop trigger if exists administradores_suscripciones_tras_quitar_acceso on hidrantes.administradores;
create trigger administradores_suscripciones_tras_quitar_acceso
  after update of activo on hidrantes.administradores
  for each row execute function hidrantes.fn_suscripciones_tras_quitar_acceso();

-- Los avisos de jefatura, solo a administradores activos (como fn_encolar_aviso_tecnico, 0045).
create or replace function hidrantes.fn_avisar_jefatura() returns void
language sql security definer set search_path = pg_catalog, hidrantes as $$
  insert into hidrantes.notificaciones (suscripcion_id, titulo, cuerpo, url)
  select s.id, 'Propuestas nuevas', 'Hay propuestas pendientes de revisar.', '/admin'
  from hidrantes.suscripciones_push s
  join hidrantes.administradores a on a.email = lower(s.email) and a.activo
  where s.email is not null and 'nuevas_propuestas' = any (s.temas)
    and not exists (
      select 1 from hidrantes.notificaciones n
      where n.suscripcion_id = s.id and n.titulo = 'Propuestas nuevas' and n.creada_en > now() - interval '1 hour'
    );
$$;

create or replace function hidrantes.fn_encolar_resumen_semanal() returns integer
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes as $$
declare
  caducadas integer;
  antiguas integer;
  pendientes integer;
  n integer := 0;
begin
  select count(*) into caducadas from hidrantes.v_puntos_activos v where v.revision_caducada;
  select count(*) into pendientes from hidrantes.propuestas where estado = 'pendiente';
  select count(*) into antiguas from hidrantes.propuestas
   where estado = 'pendiente' and creada_en < now() - interval '14 days';
  if caducadas = 0 and pendientes = 0 then
    return 0;
  end if;
  insert into hidrantes.notificaciones (suscripcion_id, titulo, cuerpo, url)
  select s.id, 'Resumen semanal',
         pendientes || ' propuestas pendientes (' || antiguas || ' de más de 14 días) · '
           || caducadas || ' puntos sin revisar.',
         '/admin'
  from hidrantes.suscripciones_push s
  join hidrantes.administradores a on a.email = lower(s.email) and a.activo
  where s.email is not null and 'resumen_semanal' = any (s.temas);
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------- 4. las que ya hay ----------

-- Las que no cumplen el destino de arriba.
delete from hidrantes.suscripciones_push s
 where lower(coalesce(substring(s.suscripcion ->> 'endpoint' from '^https://([^/?#]*)'), '')) !~ '^[a-z0-9.-]+$'
    or not (lower(substring(s.suscripcion ->> 'endpoint' from '^https://([^/?#]*)')) = 'fcm.googleapis.com'
            or lower(substring(s.suscripcion ->> 'endpoint' from '^https://([^/?#]*)')) ~ '^([a-z0-9-]+\.)+push\.services\.mozilla\.com$'
            or lower(substring(s.suscripcion ->> 'endpoint' from '^https://([^/?#]*)')) = 'web.push.apple.com'
            or lower(substring(s.suscripcion ->> 'endpoint' from '^https://([^/?#]*)')) ~ '^([a-z0-9-]+\.)+push\.apple\.com$'
            or lower(substring(s.suscripcion ->> 'endpoint' from '^https://([^/?#]*)')) ~ '^([a-z0-9-]+\.)+notify\.windows\.com$');

-- Las de móviles sin ningún token válido, y las de administradores sin acceso.
delete from hidrantes.suscripciones_push s
 where s.dispositivo_id is not null
   and not exists (select 1 from hidrantes.dispositivos d where d.dispositivo_id = s.dispositivo_id and d.revocado_en is null);
delete from hidrantes.suscripciones_push s
 where s.email is not null
   and not exists (select 1 from hidrantes.administradores a where a.email = lower(s.email) and a.activo);

-- Como mucho 3 por móvil y 3 por correo, las más nuevas.
delete from hidrantes.suscripciones_push s
 where s.id in (select x.id from (
   select id, row_number() over (partition by coalesce(dispositivo_id::text, lower(email)) order by creada_en desc, id) as n
     from hidrantes.suscripciones_push) x
  where x.n > 3);
