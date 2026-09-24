-- 0014 · Reclamar un aviso push no es enviarlo (docs/17 RV-08, FR-163, FR-164).
--
-- fn_reclamar_notificaciones marcaba enviada_en antes de enviar. Con más de ~24 avisos en una
-- invocación, la Function se quedaba sin peticiones de salida (50 en el plan gratuito), fetch
-- lanzaba, y esos avisos quedaban como enviados sin haber salido. Ahora reclamar solo anota
-- reclamada_en e intentos; enviada_en lo pone fn_resultado_notificacion con ok = true. Lo reclamado
-- que nadie anota vuelve a salir a los 15 minutos, y al cuarto intento queda como SIN_RESPUESTA.
--
-- Compatibilidad (04 §12): mismas firmas. La Function anterior pide 100 y ahora recibe 50 como
-- mucho; como llama a fn_resultado_notificacion por cada aviso, también marca enviada_en.

alter table hidrantes.notificaciones
  add column reclamada_en timestamptz,
  add column intentos smallint not null default 0;

-- Las pendientes de verdad: ni enviadas ni dadas por perdidas.
drop index if exists hidrantes.notificaciones_pendientes_idx;
create index notificaciones_pendientes_idx on hidrantes.notificaciones (creada_en)
  where enviada_en is null and error is null;

create or replace function hidrantes.fn_reclamar_notificaciones(limite integer default 100)
returns table (id bigint, titulo text, cuerpo text, url text, suscripcion_id uuid, suscripcion jsonb)
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes as $$
begin
  -- Tres intentos reclamados sin resultado anotado: se da por perdido en vez de insistir siempre.
  update hidrantes.notificaciones n set error = 'SIN_RESPUESTA'
   where n.enviada_en is null and n.error is null and n.intentos >= 3
     and n.reclamada_en < now() - interval '15 minutes';

  return query
  with reclamadas as (
    select n.id from hidrantes.notificaciones n
    where n.enviada_en is null and n.error is null
      and (n.reclamada_en is null or n.reclamada_en < now() - interval '15 minutes')
    order by n.creada_en
    limit greatest(least(coalesce(limite, 20), 50), 1)
    for update skip locked
  )
  update hidrantes.notificaciones n set reclamada_en = now(), intentos = n.intentos + 1
  from reclamadas c, hidrantes.suscripciones_push s
  where n.id = c.id and s.id = n.suscripcion_id
  returning n.id, n.titulo, n.cuerpo, n.url, s.id, s.suscripcion;
end $$;

-- Resultado de un envío: bueno, queda enviado; un fallo queda anotado; tres seguidos o un 404/410
-- borran la suscripción.
create or replace function hidrantes.fn_resultado_notificacion(notificacion_id bigint, ok boolean, error text,
                                                               suscripcion_caducada boolean default false) returns void
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes as $$
declare
  s uuid;
begin
  select n.suscripcion_id into s from hidrantes.notificaciones n where n.id = notificacion_id;
  if ok then
    update hidrantes.notificaciones set enviada_en = coalesce(enviada_en, now()) where id = notificacion_id;
    update hidrantes.suscripciones_push set ultimo_envio = now(), fallos = 0 where id = s;
    return;
  end if;
  update hidrantes.notificaciones set error = left(fn_resultado_notificacion.error, 500) where id = notificacion_id;
  update hidrantes.suscripciones_push set fallos = fallos + 1 where id = s;
  delete from hidrantes.suscripciones_push where id = s and (suscripcion_caducada or fallos >= 3);
end $$;
