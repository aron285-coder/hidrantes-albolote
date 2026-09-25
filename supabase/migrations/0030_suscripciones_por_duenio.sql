-- 0030 · Suscripciones push que no se pierden (docs/21 RV-84, DEC-118, DEC-119).
--
-- 1. Fallos pasajeros. fn_resultado_notificacion borraba la suscripción al tercer error de
--    cualquier tipo, también con un 5xx pasajero del servicio de push: el móvil seguía diciendo
--    "Activado" y no recibía nada. Ahora solo la caducidad (404/410, suscripcion_caducada) borra al
--    momento; los demás errores suman un fallo y se borra solo con 10 seguidos y ningún envío bueno
--    en los últimos 7 días (o nunca). Un 429 ni llega aquí: /api/push lo deja reclamado.
-- 2. Dos dueños, un endpoint. El índice único era solo por endpoint, y fn_guardar_suscripcion_push
--    y su versión de administrador se quitaban la fila: voluntario y jefatura en el mismo navegador,
--    el último que activaba se la quedaba. Ahora el único es por endpoint y tipo de dueño: una fila
--    de voluntario y una de jefatura como mucho por navegador.
--
-- 0. Además, las dos funciones de guardar fallaban siempre: en `on conflict ((suscripcion ->>
--    'endpoint'))` el parámetro `suscripcion` y la columna del mismo nombre chocaban ("column
--    reference suscripcion is ambiguous", 42702). Ningún test las llamaba. Ahora el cuerpo lleva
--    `#variable_conflict use_column` y los parámetros van calificados con el nombre de la función.
--    No se renombran: PostgREST las llama por nombre de parámetro.
--
-- Compatibilidad (04 §12): mismas firmas de las tres funciones. El frontend anterior las llama igual
-- y /api/push no cambia de contrato (cada aviso ya va a una suscripcion_id).

-- ---------- índice único por endpoint y tipo de dueño ----------

-- Las filas que hay ya cumplen el nuevo (el viejo era más estricto), así que se crea sin conflictos.
create unique index if not exists suscripciones_endpoint_duenio_idx
  on hidrantes.suscripciones_push ((suscripcion ->> 'endpoint'), (dispositivo_id is null));
drop index if exists hidrantes.suscripciones_endpoint_idx;

-- ---------- guardar: cada tipo de dueño, su fila ----------

create or replace function hidrantes.fn_guardar_suscripcion_push(token text, suscripcion jsonb, temas text[]) returns uuid
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes as $$
#variable_conflict use_column
declare
  d uuid := hidrantes.fn_validar_token(token);
  id_s uuid;
begin
  perform hidrantes.fn_validar_suscripcion(fn_guardar_suscripcion_push.suscripcion);
  if not coalesce(fn_guardar_suscripcion_push.temas, '{}') <@ array['resultado_propuesta'] then
    perform hidrantes.fn_error('PAYLOAD_INVALIDO(temas)', 'Tema no admitido');
  end if;
  insert into hidrantes.suscripciones_push (dispositivo_id, suscripcion, temas)
  values (d, fn_guardar_suscripcion_push.suscripcion,
          coalesce(fn_guardar_suscripcion_push.temas, '{resultado_propuesta}'))
  on conflict ((suscripcion ->> 'endpoint'), (dispositivo_id is null))
  do update set dispositivo_id = excluded.dispositivo_id, suscripcion = excluded.suscripcion,
                temas = excluded.temas, fallos = 0
  returning id into id_s;
  return id_s;
end $$;

create or replace function hidrantes.fn_guardar_suscripcion_push_admin(suscripcion jsonb, temas text[]) returns uuid
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes as $$
#variable_conflict use_column
declare
  actor text := hidrantes.fn_exigir_admin();
  id_s uuid;
begin
  perform hidrantes.fn_validar_suscripcion(fn_guardar_suscripcion_push_admin.suscripcion);
  if coalesce(fn_guardar_suscripcion_push_admin.temas, '{}') = '{}'
     or not fn_guardar_suscripcion_push_admin.temas <@ array['nuevas_propuestas', 'resumen_semanal'] then
    perform hidrantes.fn_error('PAYLOAD_INVALIDO(temas)', 'Tema no admitido');
  end if;
  insert into hidrantes.suscripciones_push (email, suscripcion, temas)
  values (actor, fn_guardar_suscripcion_push_admin.suscripcion, fn_guardar_suscripcion_push_admin.temas)
  on conflict ((suscripcion ->> 'endpoint'), (dispositivo_id is null))
  do update set email = excluded.email, suscripcion = excluded.suscripcion,
                temas = excluded.temas, fallos = 0
  returning id into id_s;
  return id_s;
end $$;

-- ---------- resultado: solo la caducidad borra al momento ----------

create or replace function hidrantes.fn_resultado_notificacion(notificacion_id bigint, ok boolean, error text,
                                                               suscripcion_caducada boolean default false) returns void
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes as $$
declare
  s uuid;
  f smallint;
  ultimo timestamptz;
begin
  select n.suscripcion_id into s from hidrantes.notificaciones n where n.id = notificacion_id;
  if ok then
    update hidrantes.notificaciones set enviada_en = coalesce(enviada_en, now()) where id = notificacion_id;
    update hidrantes.suscripciones_push set ultimo_envio = now(), fallos = 0 where id = s;
    return;
  end if;
  update hidrantes.notificaciones set error = left(fn_resultado_notificacion.error, 500) where id = notificacion_id;
  if suscripcion_caducada then
    delete from hidrantes.suscripciones_push where id = s;
    return;
  end if;
  -- El update bloquea la fila: dos resultados a la vez no se pisan la cuenta (05 §11).
  update hidrantes.suscripciones_push set fallos = least(fallos + 1, 32767)
   where id = s
  returning fallos, ultimo_envio into f, ultimo;
  if f >= 10 and (ultimo is null or ultimo < now() - interval '7 days') then
    delete from hidrantes.suscripciones_push where id = s;
  end if;
end $$;

-- create or replace conserva los permisos, pero se repiten por si alguna base los perdió.
revoke all on function hidrantes.fn_guardar_suscripcion_push(text, jsonb, text[]) from public;
revoke all on function hidrantes.fn_guardar_suscripcion_push_admin(jsonb, text[]) from public;
revoke all on function hidrantes.fn_resultado_notificacion(bigint, boolean, text, boolean) from public;
