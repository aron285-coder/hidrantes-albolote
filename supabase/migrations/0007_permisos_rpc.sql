-- 0007 · Funciones de service_role y permisos de ejecución de las RPC (05 §5, §6; 11 §3).
-- Punto de partida de 0001: ninguna función es ejecutable por PUBLIC. Aquí se concede lo justo.

-- ---------- solo service_role ----------

-- Fotos que la purga no debe borrar nunca (04 §7): las de puntos, las de propuestas pendientes o
-- aprobadas y las reservadas hace menos de 24 h.
create function hidrantes.fn_fotos_referenciadas() returns setof text
language sql stable security definer set search_path = pg_catalog, hidrantes as $$
  select foto_path from hidrantes.puntos
  union
  select foto_path from hidrantes.propuestas where foto_path is not null and estado in ('pendiente', 'aprobada')
  union
  select foto_path from hidrantes.subidas where reservada_en > now() - interval '24 hours';
$$;

-- /api/push reclama notificaciones pendientes: cada una la envía una sola llamada aunque haya dos a
-- la vez (skip locked), y se marca enviada antes de salir de la transacción (idempotente, 05 §9).
create function hidrantes.fn_reclamar_notificaciones(limite integer default 100)
returns table (id bigint, titulo text, cuerpo text, url text, suscripcion_id uuid, suscripcion jsonb)
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes as $$
begin
  return query
  with reclamadas as (
    select n.id from hidrantes.notificaciones n
    where n.enviada_en is null and n.error is null
    order by n.creada_en
    limit greatest(least(coalesce(limite, 100), 500), 1)
    for update skip locked
  )
  update hidrantes.notificaciones n set enviada_en = now()
  from reclamadas c, hidrantes.suscripciones_push s
  where n.id = c.id and s.id = n.suscripcion_id
  returning n.id, n.titulo, n.cuerpo, n.url, s.id, s.suscripcion;
end $$;

-- Resultado de un envío: un fallo queda anotado; tres seguidos o un 404/410 borran la suscripción.
create function hidrantes.fn_resultado_notificacion(notificacion_id bigint, ok boolean, error text,
                                                    suscripcion_caducada boolean default false) returns void
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes as $$
declare
  s uuid;
begin
  select n.suscripcion_id into s from hidrantes.notificaciones n where n.id = notificacion_id;
  if ok then
    update hidrantes.suscripciones_push set ultimo_envio = now(), fallos = 0 where id = s;
    return;
  end if;
  update hidrantes.notificaciones set error = left(fn_resultado_notificacion.error, 500) where id = notificacion_id;
  update hidrantes.suscripciones_push set fallos = fallos + 1 where id = s;
  delete from hidrantes.suscripciones_push where id = s and (suscripcion_caducada or fallos >= 3);
end $$;

-- ---------- execute ----------

-- Punto de partida explícito también aquí: nadie ejecuta nada salvo lo que se concede debajo.
revoke execute on all functions in schema hidrantes from public, anon, authenticated;

-- Helpers que usan las vistas security_invoker y las políticas (0003, DEC-058).
grant execute on function
  hidrantes.fn_es_admin(),
  hidrantes.fn_config(text, jsonb),
  hidrantes.fn_radio_px(smallint, hidrantes.estado_caudal),
  hidrantes.fn_municipio_de(extensions.geography)
to authenticated;

-- Voluntario: anon con su token. authenticated también, porque jefatura usa la misma app (FR-150).
grant execute on function
  hidrantes.fn_listar_puntos(text, timestamptz),
  hidrantes.fn_ficha_punto(text, uuid),
  hidrantes.fn_proponer(text, text, text, text, hidrantes.operacion, uuid, jsonb, hidrantes.origen_ubicacion,
                        double precision, double precision, double precision, double precision, real,
                        double precision, double precision, text),
  hidrantes.fn_mis_propuestas(text),
  hidrantes.fn_retirar_propuesta(text, uuid),
  hidrantes.fn_reportar_incidencia(text, text, text, text),
  hidrantes.fn_guardar_suscripcion_push(text, jsonb, text[]),
  hidrantes.fn_borrar_suscripcion_push(text),
  hidrantes.fn_registrar_error(uuid, text, text, text, text)
to anon, authenticated;

-- Jefatura: solo authenticated; cada una vuelve a comprobar fn_es_admin().
grant execute on function
  hidrantes.fn_aprobar(uuid, jsonb, boolean),
  hidrantes.fn_aprobar_lote(uuid[]),
  hidrantes.fn_rechazar(uuid, text),
  hidrantes.fn_fusionar_con_existente(uuid, uuid, jsonb),
  hidrantes.fn_editar_punto(uuid, jsonb),
  hidrantes.fn_retirar_punto(uuid, text),
  hidrantes.fn_borrar_punto(uuid, text),
  hidrantes.fn_restaurar_punto(uuid),
  hidrantes.fn_purgar_papelera(),
  hidrantes.fn_cambiar_codigo_acceso(text, boolean),
  hidrantes.fn_gestionar_administrador(text, boolean),
  hidrantes.fn_guardar_config(jsonb),
  hidrantes.fn_resolver_incidencia(uuid),
  hidrantes.fn_actividad_voluntarios(integer),
  hidrantes.fn_anonimizar_autor(uuid),
  hidrantes.fn_historial_punto(uuid),
  hidrantes.fn_salud(),
  hidrantes.fn_exportar_inventario(jsonb),
  hidrantes.fn_guardar_suscripcion_push_admin(jsonb, text[]),
  hidrantes.fn_novedades(),
  hidrantes.fn_guardar_direccion_sugerida(uuid, text),
  hidrantes.fn_registrar_workflow(text),
  hidrantes.fn_reservar_subida_admin()
to authenticated;

-- Solo las Pages Functions y los workflows (11 §3, capa 5): ni anon ni authenticated.
grant execute on function
  hidrantes.fn_verificar_codigo(text, uuid, text),
  hidrantes.fn_reservar_subida(text),
  hidrantes.fn_fotos_referenciadas(),
  hidrantes.fn_reclamar_notificaciones(integer),
  hidrantes.fn_resultado_notificacion(bigint, boolean, text, boolean)
to service_role;

-- La Function /api/direccion comprueba el JWT llamando a fn_es_admin (ya concedida en 0003).
