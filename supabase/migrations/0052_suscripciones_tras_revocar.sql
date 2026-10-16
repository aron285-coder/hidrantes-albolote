-- 0052 · Avisos push: ninguna suscripción sobrevive a la revocación, tampoco en concurrencia (docs/40 RV-532, DEC-218).
--
-- 1. El disparador de la revocación toma el cerrojo por móvil (el mismo que fn_guardar_suscripcion_push, 05 §11)
--    antes de mirar si al móvil le queda algún token válido. Con READ COMMITTED, la consulta que sigue al cerrojo ve lo
--    que otra transacción confirmó mientras esperaba: dos tokens del mismo móvil revocados a la vez ya no se ven el uno
--    al otro aún válidos.
-- 2. fn_guardar_suscripcion_push vuelve a comprobar el token **después** de tomar el cerrojo, solo leyendo: si la
--    revocación se confirmó entre la primera comprobación y el cerrojo, ahora falla con TOKEN_REVOCADO y no inserta
--    nada. Lo que escribe en dispositivos (ultimo_uso) va antes del cerrojo, como el disparador, que lo toma después de
--    las filas: el orden es siempre filas → cerrojo, y no hay cruce.
--
-- Compatibilidad (04 §12): mismas firmas y mismos errores.

create or replace function hidrantes.fn_suscripciones_tras_revocar() returns trigger
language plpgsql security definer set search_path = pg_catalog, hidrantes as $$
begin
  if new.revocado_en is not null and old.revocado_en is null then
    perform pg_advisory_xact_lock(hashtext('suscripciones:' || new.dispositivo_id::text));
    if not exists (select 1 from hidrantes.dispositivos d
                    where d.dispositivo_id = new.dispositivo_id and d.revocado_en is null) then
      delete from hidrantes.suscripciones_push s where s.dispositivo_id = new.dispositivo_id;
    end if;
  end if;
  return null;
end $$;
revoke all on function hidrantes.fn_suscripciones_tras_revocar() from public, anon, authenticated;

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
  -- docs/40 RV-532: el token, otra vez, ya con el cerrojo: una revocación confirmada mientras se esperaba no deja
  -- entrar la suscripción. Solo leyendo: tras el cerrojo nada escribe en dispositivos (fn_validar_token anota
  -- ultimo_uso), o una revocación con la fila tomada y esperando a este cerrojo se cruzaría con esta transacción.
  if not exists (select 1 from hidrantes.dispositivos x
                  where x.token_hash = hidrantes.fn_sha256(token) and x.revocado_en is null) then
    perform hidrantes.fn_error('TOKEN_REVOCADO', 'El acceso de este móvil se ha revocado');
  end if;
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
