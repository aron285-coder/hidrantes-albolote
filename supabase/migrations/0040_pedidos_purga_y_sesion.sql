-- 0040 · Restaurar sin resucitar, pedidos de trabajo, purga del alta, restos de incidencias, errores
-- por IP, cerrar sesión y avisos sin respuesta (docs/31 RV-144 a RV-148 y RV-158; 05 §2.7, §2.8, §2.13,
-- §2.15, §6; 11).
--
-- 1. RV-145: fn_restaurar_punto devuelve la situación de antes del borrado (la lleva el registro en
--    'antes'): un retirado vuelve retirado, no activo.
-- 2. RV-146: tabla pedidos_trabajo y fn_pedir_trabajo (administradores), fn_pedidos_pendientes y
--    fn_marcar_pedido (service_role). El panel deja de lanzar workflows con un token de GitHub.
-- 3. RV-147: purgar un punto de la papelera borra también la propuesta de alta (o de alta fusionada)
--    que lo creó o lo tocó: sus fotos dejan de estar referenciadas y el nombre del autor se va.
-- 4. RV-148: fn_reportar_incidencia sin execute para nadie; fn_salud sin incidencias_abiertas (y con
--    el tope global de subidas de 0039 en topes_globales_24h); fn_registrar_error con ip_hash (solo
--    service_role, desde /api/error) y tope por IP; la de 5 argumentos sigue para la app anterior con
--    un tope propio para lo que llega sin IP.
-- 5. RV-158: fn_cerrar_sesion(token) revoca el token y borra las suscripciones push de su dispositivo.
-- 6. RV-144: un aviso que se da por perdido (SIN_RESPUESTA) suma un fallo a su suscripción.
-- 7. RV-167 (petición de Frontend-panel): fn_borrar_suscripcion_push_admin(endpoint) borra solo la
--    suscripción de jefatura de ese navegador.
-- 8. RV-149: fn_novedades (obsoleta, sin fn_exigir_admin) deja de estar concedida a authenticated.
-- 9. RV-130 (petición de Ops): config.revertir_despliegue_ajeno = false.
--
-- Compatibilidad (04 §12): mismas firmas en todo lo que ya existía; fn_registrar_error gana una firma
-- nueva y la antigua se queda. Lo que la app anterior pierde no rompe nada: fn_reportar_incidencia ya
-- no la llama ninguna versión publicada desde docs/29, y una que lo hiciera recibe un error que trata
-- como cualquier fallo; incidencias_abiertas no la pinta el panel.

-- ---------- 1. restaurar sin resucitar (RV-145) ----------

-- Misma firma que 0006, con el lock_timeout de 0016. La situación de antes del borrado está en el
-- 'antes' del último registro 'borrado' de ese punto (fn_borrar_punto lo escribe desde 0006). Sin
-- registro (no debería pasar) o con algo raro, 'activo', como hasta ahora.
create or replace function hidrantes.fn_restaurar_punto(punto_id uuid) returns void
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes
set lock_timeout = '5s' as $$
declare
  actor text := hidrantes.fn_exigir_admin();
  p hidrantes.puntos;
  vuelve text;
begin
  select * into p from hidrantes.puntos x where x.id = punto_id for update;
  if not found or p.situacion <> 'borrado' then
    perform hidrantes.fn_error('PUNTO_NO_ACTIVO', 'El punto no está en la papelera');
  end if;
  if p.borrado_en < now() - make_interval(days => (hidrantes.fn_config('dias_papelera', '30') #>> '{}')::int) then
    perform hidrantes.fn_error('FUERA_DE_PLAZO_PAPELERA', 'Ha pasado el plazo de la papelera');
  end if;
  select r.antes ->> 'situacion' into vuelve
    from hidrantes.registro r
   where r.punto_id = fn_restaurar_punto.punto_id and r.accion = 'borrado'
   order by r.id desc
   limit 1;
  -- Sin dato fiable, 'activo' como antes de 0040 (un retirado no se puede reactivar desde el panel,
  -- así que 'retirado' por defecto dejaría el punto atrapado), y el registro dice que fue deducido.
  if vuelve is null or vuelve not in ('activo', 'retirado') then
    vuelve := null;
  end if;
  update hidrantes.puntos x set situacion = coalesce(vuelve, 'activo')::hidrantes.situacion_punto, borrado_en = null
   where x.id = punto_id;
  perform hidrantes.fn_registrar(actor, null, true, 'restauracion', punto_id, null, null,
    jsonb_build_object('situacion', coalesce(vuelve, 'activo'))
    || case when vuelve is null then '{"situacion_deducida": true}'::jsonb else '{}'::jsonb end);
end $$;

-- ---------- 2. pedidos de trabajo (RV-146) ----------

create table hidrantes.pedidos_trabajo (
  id          bigint generated always as identity primary key,
  workflow    text not null
              check (workflow in ('purgar-fotos', 'regenerar-zona', 'regenerar-mapabase', 'respaldo')),
  pedido_por  text not null,
  pedido_en   timestamptz not null default now(),
  lanzado_en  timestamptz,
  -- 'lanzado', o 'error: <motivo>' (contrato de despachador.yml en #484)
  resultado   text check (length(resultado) between 1 and 500),
  constraint pedidos_trabajo_marcado check ((lanzado_en is null) = (resultado is null))
);

-- Como mucho un pedido pendiente por trabajo.
create unique index pedidos_trabajo_pendiente_idx on hidrantes.pedidos_trabajo (workflow) where lanzado_en is null;

-- Permisos y RLS como el resto (0003): lectura solo para administradores; escribe solo por RPC;
-- service_role todo.
alter table hidrantes.pedidos_trabajo enable row level security;
create policy pedidos_trabajo_lectura_admin on hidrantes.pedidos_trabajo
  for select to authenticated using ((select hidrantes.fn_es_admin()));
revoke all on hidrantes.pedidos_trabajo from public, anon, authenticated;
grant select on hidrantes.pedidos_trabajo to authenticated;
grant all on hidrantes.pedidos_trabajo to service_role;
grant usage, select on sequence hidrantes.pedidos_trabajo_id_seq to service_role;

-- La llama /api/lanzar-workflow con el JWT del administrador. Deja constancia como hasta ahora
-- ('workflow_lanzado'), con el id del pedido.
-- El parámetro se llama como la columna (es el nombre que manda la Function): en el cuerpo, el nombre
-- suelto es la columna (también en on conflict) y el parámetro va calificado, como en 0030.
-- Un pedido pendiente de más de 24 h no bloquea: nadie lo despachó (staging, donde no hay
-- despachador, o un despachador parado). Se cierra con 'error: caducado' y entra el nuevo; así el
-- botón no se queda en YA_PEDIDO para siempre.
create function hidrantes.fn_pedir_trabajo(workflow text) returns jsonb
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes
set lock_timeout = '5s' as $$
#variable_conflict use_column
declare
  actor text := hidrantes.fn_exigir_admin();
  nuevo hidrantes.pedidos_trabajo;
begin
  if fn_pedir_trabajo.workflow is null
     or fn_pedir_trabajo.workflow not in ('purgar-fotos', 'regenerar-zona', 'regenerar-mapabase', 'respaldo') then
    perform hidrantes.fn_error('PAYLOAD_INVALIDO(workflow)', 'Trabajo no admitido');
  end if;
  update hidrantes.pedidos_trabajo t set lanzado_en = now(), resultado = 'error: caducado'
   where t.workflow = fn_pedir_trabajo.workflow and t.lanzado_en is null
     and t.pedido_en < now() - interval '24 hours';
  insert into hidrantes.pedidos_trabajo as t (workflow, pedido_por) values (fn_pedir_trabajo.workflow, actor)
  on conflict (workflow) where lanzado_en is null do nothing
  returning t.* into nuevo;
  if nuevo.id is null then
    perform hidrantes.fn_error('YA_PEDIDO', 'Ya hay un pedido de ese trabajo esperando');
  end if;
  perform hidrantes.fn_registrar(actor, null, true, 'workflow_lanzado', null, null, null,
                                 jsonb_build_object('workflow', nuevo.workflow, 'pedido_id', nuevo.id));
  return jsonb_build_object('pedido_id', nuevo.id, 'workflow', nuevo.workflow, 'pedido_en', nuevo.pedido_en);
end $$;

revoke all on function hidrantes.fn_pedir_trabajo(text) from public, anon, authenticated;
grant execute on function hidrantes.fn_pedir_trabajo(text) to authenticated;

-- Para despachador.yml: los pendientes, del más antiguo al más nuevo, como un array JSON de
-- {id, workflow, pedido_en} (una sola fila: PostgREST lo devuelve tal cual, sin max_rows).
create function hidrantes.fn_pedidos_pendientes() returns jsonb
language sql stable security definer set search_path = pg_catalog, hidrantes as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'workflow', t.workflow, 'pedido_en', t.pedido_en)
                            order by t.pedido_en, t.id), '[]'::jsonb)
  from hidrantes.pedidos_trabajo t
  where t.lanzado_en is null;
$$;

-- El despachador, después de despachar o de no poder: 'lanzado' o 'error: <motivo>'. Marcado, ya no
-- sale en fn_pedidos_pendientes (un error no se reintenta solo: jefatura lo vuelve a pedir). Uno ya
-- marcado, o que no existe, no se toca: PEDIDO_NO_PENDIENTE. Los nombres de los parámetros son los
-- que manda despachador.yml ({ "id", "resultado" }, #484).
create function hidrantes.fn_marcar_pedido(id bigint, resultado text) returns void
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes
set lock_timeout = '5s' as $$
#variable_conflict use_variable
declare
  t hidrantes.pedidos_trabajo;
begin
  if resultado is null or length(resultado) > 500
     or not (trim(resultado) = 'lanzado' or trim(resultado) like 'error: %') then
    perform hidrantes.fn_error('PAYLOAD_INVALIDO(resultado)', 'El resultado es lanzado o error: <motivo>');
  end if;
  select * into t from hidrantes.pedidos_trabajo x where x.id = fn_marcar_pedido.id for update;
  if not found or t.lanzado_en is not null then
    perform hidrantes.fn_error('PEDIDO_NO_PENDIENTE', 'Ese pedido ya no está pendiente');
  end if;
  update hidrantes.pedidos_trabajo x set lanzado_en = now(), resultado = trim(fn_marcar_pedido.resultado)
   where x.id = fn_marcar_pedido.id;
end $$;

revoke all on function hidrantes.fn_pedidos_pendientes() from public, anon, authenticated;
revoke all on function hidrantes.fn_marcar_pedido(bigint, text) from public, anon, authenticated;
grant execute on function hidrantes.fn_pedidos_pendientes() to service_role;
grant execute on function hidrantes.fn_marcar_pedido(bigint, text) to service_role;

-- ---------- 3. la purga se lleva el alta que creó el punto (RV-147) ----------

-- Misma firma que 0006. Además de las propuestas con punto_id, las de alta que crearon el punto o se
-- fusionaron con él. La relación está dos veces: en propuestas.correcciones.punto_id (fn_aplicar_propuesta
-- y la fusión lo escriben desde 0006) y en el registro de su aprobación o fusión. Se miran las dos: el
-- registro no se puede editar y correcciones sí lo podría tocar una migración; con una basta.
create or replace function hidrantes.fn_purgar_papelera_interna(actor text) returns integer
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes as $$
declare
  p hidrantes.puntos;
  n integer := 0;
begin
  for p in select * from hidrantes.puntos
            where situacion = 'borrado'
              and borrado_en < now() - make_interval(days => (hidrantes.fn_config('dias_papelera', '30') #>> '{}')::int)
            for update skip locked loop
    update hidrantes.propuestas set duplicado_de = null where duplicado_de = p.id;
    delete from hidrantes.propuestas x
     where x.punto_id = p.id
        or (x.operacion = 'alta' and x.correcciones ->> 'punto_id' = p.id::text)
        or (x.operacion = 'alta' and x.id in (
              select r.propuesta_id from hidrantes.registro r
               where r.punto_id = p.id and r.propuesta_id is not null
                 and r.accion in ('aprobacion', 'aprobacion_con_correcciones', 'fusion')));
    delete from hidrantes.puntos where id = p.id;
    perform hidrantes.fn_registrar(actor, null, true, 'purga_papelera', p.id, null, hidrantes.fn_punto_json(p), null);
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------- 4. restos de "Algo no funciona" y errores del cliente (RV-148) ----------

revoke execute on function hidrantes.fn_reportar_incidencia(text, text, text, text) from anon, authenticated;

-- Misma firma y claves que 0031 menos incidencias_abiertas. topes_globales_24h cuenta además el
-- tope global de subidas (0039) si ahora mismo está lleno: la vigilancia lo avisa por ahí. Y
-- subidas_24h, las reservas de voluntarios de las últimas 24 h, para ver lo cerca que está.
create or replace function hidrantes.fn_salud() returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, hidrantes as $$
declare
  tareas jsonb;
  origen jsonb;
  subidas_24h integer;
begin
  perform hidrantes.fn_exigir_admin();
  -- Las mismas que cuenta el tope global de fn_reservar_subida_para (0039).
  select count(*) into subidas_24h from hidrantes.subidas s
   where s.reservada_en > now() - interval '1 day' and not hidrantes.fn_es_dispositivo_admin(s.dispositivo_id);
  begin
    tareas := hidrantes.fn_tareas_programadas();
    origen := jsonb_build_object('tareas_origen', 'en_vivo');
  exception when insufficient_privilege or undefined_table or invalid_schema_name or undefined_function then
    -- Sin acceso a pg_cron: la foto de la vigilancia, diciendo de cuándo es.
    tareas := hidrantes.fn_config('tareas_programadas', 'null');
    origen := jsonb_build_object(
      'tareas_origen', 'vigilancia',
      'tareas_error', sqlstate,
      'tareas_medidas_en', (select to_jsonb(c.actualizado_en) from hidrantes.config c where c.clave = 'tareas_programadas'));
  end;
  return jsonb_build_object(
    'pendientes_14d', (select count(*) from hidrantes.propuestas where estado = 'pendiente'
                         and creada_en < now() - interval '14 days'),
    'errores_7d', (select count(*) from hidrantes.errores_cliente where momento > now() - interval '7 days'),
    'sin_direccion', (select count(*) from hidrantes.puntos where situacion = 'activo' and direccion is null),
    'ultimo_respaldo', hidrantes.fn_config('ultimo_respaldo', 'null'),
    'storage_bytes', hidrantes.fn_config('storage_bytes', 'null'),
    'version_zona', hidrantes.fn_config('version_zona', 'null'),
    'version_mapabase', hidrantes.fn_config('version_mapabase', 'null'),
    'version_callejero', hidrantes.fn_config('version_callejero', 'null'),
    'ultima_vigilancia', hidrantes.fn_config('ultima_vigilancia', 'null'),
    'vigilancia_ok', hidrantes.fn_config('vigilancia_ok', 'null'),
    'dispositivos_activos', (select count(*) from hidrantes.dispositivos where revocado_en is null
                               and ultimo_uso > now() - interval '90 days'),
    'intentos_fallidos_24h', (select count(*) from hidrantes.intentos_codigo
                                where momento > now() - interval '24 hours' and not exito and not bloqueado),
    'topes_alcanzados_24h', (select count(*) from hidrantes.intentos_codigo
                               where momento > now() - interval '24 hours' and bloqueado),
    -- Los del código para todo el grupo, más uno si el tope global de subidas está lleno ahora.
    'topes_globales_24h', (select count(*) from hidrantes.intentos_codigo
                             where momento > now() - interval '24 hours' and bloqueado
                               and tope in ('global', 'altas_global'))
                          + case when subidas_24h >= (hidrantes.fn_config('max_subidas_dia_total', '400') #>> '{}')::int
                                 then 1 else 0 end,
    'subidas_24h', subidas_24h,
    -- Canjes con el código bueno y el dispositivo_id de un administrador (0039, RV-143).
    'dispositivos_reservados_24h', (select count(*) from hidrantes.intentos_codigo
                                     where momento > now() - interval '24 hours' and tope = 'dispositivo_reservado'),
    -- Toda la base de datos (también uniformidad) y solo lo nuestro (RV-22).
    'bd_bytes', pg_database_size(current_database()),
    'esquema_bytes', (select coalesce(sum(pg_total_relation_size(c.oid)), 0)
                        from pg_class c join pg_namespace n on n.oid = c.relnamespace
                       where n.nspname = 'hidrantes' and c.relkind in ('r', 'm')),
    'tareas', tareas
  ) || origen;
end $$;

revoke all on function hidrantes.fn_salud() from public, anon;

-- errores_cliente con ip_hash (05 §2.8).
alter table hidrantes.errores_cliente add column ip_hash text;
create index errores_ip_idx on hidrantes.errores_cliente (ip_hash, momento);

insert into hidrantes.config (clave, valor, actualizado_por) values
  ('max_errores_ip_dia', '100', 'migracion'),
  ('max_errores_sin_ip_dia', '500', 'migracion')
on conflict (clave) do nothing;

-- Firma nueva: la llama /api/error con service_role y el ip_hash de CF-Connecting-IP. Topes: el global,
-- 100 por dispositivo y max_errores_ip_dia por IP. Nunca falla hacia el cliente, como la de 0005.
create function hidrantes.fn_registrar_error(dispositivo_id uuid, mensaje text, pila text, ruta text, agente text,
                                             ip_hash text)
returns void
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes as $$
#variable_conflict use_variable
declare
  -- Lo mismo que se guarda: vacío es "sin IP", y nunca más de 128 caracteres.
  ip text := left(nullif(trim(ip_hash), ''), 128);
begin
  if (select count(*) from hidrantes.errores_cliente e where e.momento > now() - interval '1 day')
       >= (hidrantes.fn_config('max_errores_global_dia', '2000') #>> '{}')::int
     or (dispositivo_id is not null and (select count(*) from hidrantes.errores_cliente e
          where e.dispositivo_id = dispositivo_id and e.momento > now() - interval '1 day') >= 100) then
    return;
  end if;
  -- Dos ramas, para que la de la IP use errores_ip_idx.
  if ip is null then
    if (select count(*) from hidrantes.errores_cliente e
         where e.ip_hash is null and e.momento > now() - interval '1 day')
       >= (hidrantes.fn_config('max_errores_sin_ip_dia', '500') #>> '{}')::int then
      return;
    end if;
  elsif (select count(*) from hidrantes.errores_cliente e
          where e.ip_hash = ip and e.momento > now() - interval '1 day')
        >= (hidrantes.fn_config('max_errores_ip_dia', '100') #>> '{}')::int then
    return;
  end if;
  insert into hidrantes.errores_cliente (dispositivo_id, mensaje, pila, ruta, agente, ip_hash)
  values (dispositivo_id, left(mensaje, 1000), left(pila, 4096), left(ruta, 200), left(agente, 300), ip);
exception when others then
  -- Nunca falla hacia el cliente, pero queda en el log de Postgres: si esto se rompe, errores_7d
  -- diría 0 y parecería que todo va bien.
  raise warning 'fn_registrar_error: % %', sqlstate, sqlerrm;
  return;
end $$;

revoke all on function hidrantes.fn_registrar_error(uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function hidrantes.fn_registrar_error(uuid, text, text, text, text, text) to service_role;

-- Firma de 0005 (la app anterior la llama con la clave anon): misma regla, sin IP. Lo que llega sin
-- ip_hash tiene su propio tope (max_errores_sin_ip_dia): quien rote dispositivo_id llena ese cupo, no
-- el global, y los errores que pasan por /api/error siguen entrando.
create or replace function hidrantes.fn_registrar_error(dispositivo_id uuid, mensaje text, pila text, ruta text, agente text)
returns void
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes as $$
begin
  perform hidrantes.fn_registrar_error(dispositivo_id, mensaje, pila, ruta, agente, null::text);
end $$;

-- ---------- 5. cerrar sesión revoca el token (RV-158) ----------

-- Para el token que la llama: lo revoca y borra las suscripciones push de su dispositivo. No dice si
-- el token existía: un token desconocido, ya revocado o mal formado no hace nada y no falla, para
-- que cerrar sesión en el móvil nunca se quede a medias por la respuesta del servidor.
create function hidrantes.fn_cerrar_sesion(token text) returns void
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes as $$
#variable_conflict use_variable
declare
  d uuid;
begin
  if token is null or length(token) < 20 then
    return;
  end if;
  select x.dispositivo_id into d from hidrantes.dispositivos x where x.token_hash = hidrantes.fn_sha256(token);
  if d is null then
    return;
  end if;
  -- Todos los tokens de ese móvil, no solo este: un canje anterior del mismo dispositivo_id tampoco
  -- debe seguir valiendo cuando la persona cierra sesión.
  update hidrantes.dispositivos x set revocado_en = now() where x.dispositivo_id = d and x.revocado_en is null;
  delete from hidrantes.suscripciones_push s where s.dispositivo_id = d;
end $$;

revoke all on function hidrantes.fn_cerrar_sesion(text) from public;
-- Como las demás de voluntario (0007): anon con su token y authenticated, porque jefatura usa la
-- misma app y su cliente va con JWT (FR-150).
grant execute on function hidrantes.fn_cerrar_sesion(text) to anon, authenticated;

-- ---------- 6. un aviso perdido suma un fallo (RV-144) ----------

-- Misma firma que 0007 y el cuerpo de 0014. Desde RV-144, /api/push no anota los fallos de red: el
-- aviso se vuelve a reclamar y, al darse por perdido, nada sumaba fallos a una suscripción cuyo
-- servicio no contesta nunca. Ahora cada aviso perdido suma uno, y se aplica la regla de borrado de
-- fn_resultado_notificacion (0030): 10 fallos y ningún envío bueno en 7 días (o nunca).
create or replace function hidrantes.fn_reclamar_notificaciones(limite integer default 100)
returns table (id bigint, titulo text, cuerpo text, url text, suscripcion_id uuid, suscripcion jsonb)
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes as $$
declare
  tocadas uuid[];
begin
  -- Tres intentos reclamados sin resultado anotado: se da por perdido en vez de insistir siempre. Dos
  -- llamadas a la vez no cuentan dos veces el mismo aviso: la segunda espera a la fila y, al entrar, ya
  -- tiene error y no cumple el where.
  with perdidas as (
    update hidrantes.notificaciones n set error = 'SIN_RESPUESTA'
     where n.enviada_en is null and n.error is null and n.intentos >= 3
       and n.reclamada_en < now() - interval '15 minutes'
    returning n.suscripcion_id
  ), sumadas as (
    update hidrantes.suscripciones_push s set fallos = least(s.fallos + c.n, 32767)
      from (select p.suscripcion_id, count(*)::int as n from perdidas p group by 1) c
     where s.id = c.suscripcion_id
    returning s.id
  )
  select array_agg(x.id) into tocadas from sumadas x;

  -- Solo se borra si /api/push está funcionando (algún aviso enviado en las últimas 24 h): un aviso
  -- perdido porque nuestra Function estaba caída no es culpa de la suscripción, y sin esta guarda unas
  -- horas de fallo borrarían casi todas (la mayoría no recibe nada en 7 días). El fallo sí se suma.
  if tocadas is not null
     and exists (select 1 from hidrantes.notificaciones n where n.enviada_en > now() - interval '1 day') then
    delete from hidrantes.suscripciones_push s
     where s.id = any (tocadas) and s.fallos >= 10
       and (s.ultimo_envio is null or s.ultimo_envio < now() - interval '7 days');
  end if;

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

-- ---------- 7. apagar los avisos de jefatura sin tocar los del voluntario (RV-167) ----------
-- Petición de Frontend-panel en #484. En un navegador puede haber una fila de voluntario y otra de
-- jefatura con el mismo endpoint (0030). Apagar los avisos de jefatura borra solo la suya; la del
-- voluntario no se toca nunca. Sin fila, no hace nada. Las notificaciones pendientes de esa
-- suscripción se van con ella (on delete cascade, como al caducar).
create function hidrantes.fn_borrar_suscripcion_push_admin(endpoint text) returns void
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes as $$
#variable_conflict use_variable
begin
  perform hidrantes.fn_exigir_admin();
  if coalesce(trim(endpoint), '') = '' then
    perform hidrantes.fn_error('PAYLOAD_INVALIDO(endpoint)', 'Falta el endpoint');
  end if;
  delete from hidrantes.suscripciones_push s
   where s.dispositivo_id is null and s.suscripcion ->> 'endpoint' = endpoint;
end $$;

revoke all on function hidrantes.fn_borrar_suscripcion_push_admin(text) from public, anon, authenticated;
grant execute on function hidrantes.fn_borrar_suscripcion_push_admin(text) to authenticated;

-- ---------- 9. revertir_despliegue_ajeno (petición de Ops para RV-130) ----------
-- La vigilancia, al ver un despliegue de producción que no viene de deploy-prod, abre una issue; con
-- esta opción a true además vuelve a promover el último bueno. Apagada; no está en la lista blanca de
-- Ajustes (se cambia por SQL, a propósito).
insert into hidrantes.config (clave, valor, actualizado_por) values ('revertir_despliegue_ajeno', 'false', 'migracion')
on conflict (clave) do nothing;

-- ---------- 8. fn_novedades (RV-149) ----------
-- Obsoleta desde 0.5.0 y sin fn_exigir_admin: cualquiera con sesión leía config.novedades. Ningún
-- frontend publicado la llama (DEC-087).
revoke execute on function hidrantes.fn_novedades() from authenticated;
