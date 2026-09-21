-- 0006 · RPC de jefatura (05 §6.2, §11). Todas empiezan por fn_exigir_admin() y bloquean las
-- filas que tocan (select … for update): nunca "gana el último".

-- ---------- núcleo de la aprobación ----------

-- Nombre de la constraint dentro de un mensaje de check_violation, para el código de error.
create function hidrantes.constraint_name_de(mensaje text) returns text
language sql immutable set search_path = pg_catalog as $$
  select substring(mensaje from 'constraint "([^"]+)"');
$$;

-- Aplica una propuesta pendiente a puntos. La usan fn_aprobar, fn_aprobar_lote y fn_proponer
-- cuando quien propone es jefatura (FR-151). Sin execute para nadie: el permiso se comprueba antes.
create function hidrantes.fn_aplicar_propuesta(
  propuesta_id uuid, correcciones jsonb, confirmar_desactualizada boolean, actor text
) returns jsonb
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes, extensions
set statement_timeout = '10s' as $$
declare
  r hidrantes.propuestas;
  p hidrantes.puntos;
  antes jsonb;
  c jsonb := coalesce(correcciones, '{}'::jsonb);
  m jsonb;  -- datos + correcciones
  zona record;
  nuevo_id uuid;
  tipo_final hidrantes.tipo_punto;
  diametro_final smallint;
  caudal_final hidrantes.estado_caudal;
  accion text;
begin
  select * into r from hidrantes.propuestas x where x.id = propuesta_id for update;
  if not found or r.estado <> 'pendiente' then
    perform hidrantes.fn_error('PROPUESTA_NO_PENDIENTE', 'La propuesta ya no está pendiente');
  end if;
  if jsonb_typeof(c) <> 'object' then
    perform hidrantes.fn_error('PAYLOAD_INVALIDO(correcciones)', 'Correcciones no válidas');
  end if;
  perform hidrantes.fn_exigir_claves(c, array['tipo', 'diametro_mm', 'caudal', 'racor', 'descripcion_fallo',
                                              'descripcion', 'direccion']);
  m := r.datos || c;

  if r.punto_id is not null then
    select * into p from hidrantes.puntos x where x.id = r.punto_id for update;
    if not found or p.situacion <> 'activo' then
      perform hidrantes.fn_error('PUNTO_NO_ACTIVO', 'El punto ya no está activo');
    end if;
    if p.actualizado_en > r.creada_en and not coalesce(confirmar_desactualizada, false) then
      perform hidrantes.fn_error('PROPUESTA_DESACTUALIZADA', 'El punto cambió después de enviarse la propuesta');
    end if;
    antes := hidrantes.fn_punto_json(p);
  end if;

  begin
    case r.operacion
    when 'alta' then
      tipo_final := (m ->> 'tipo')::hidrantes.tipo_punto;
      diametro_final := case when tipo_final = 'boca_riego' then 45 else (m ->> 'diametro_mm')::smallint end;
      if diametro_final is null then
        perform hidrantes.fn_error('DIAMETRO_SIN_FIJAR', 'Fija 70 o 100 mm antes de aprobar');
      end if;
      select * into zona from hidrantes.fn_municipio_de(r.geom);
      insert into hidrantes.puntos (codigo, tipo, geom, diametro_mm, caudal, racor, descripcion_fallo, descripcion,
                                    direccion, foto_path, municipio, nucleo, fecha_ultima_revision)
      values (hidrantes.fn_siguiente_codigo(tipo_final), tipo_final, r.geom, diametro_final,
              (m ->> 'caudal')::hidrantes.estado_caudal,
              case when tipo_final = 'boca_riego' then (m ->> 'racor')::hidrantes.tipo_racor end,
              nullif(trim(m ->> 'descripcion_fallo'), ''), nullif(trim(m ->> 'descripcion'), ''),
              coalesce(nullif(trim(c ->> 'direccion'), ''), r.direccion_sugerida),
              r.foto_path, zona.municipio, zona.nucleo, current_date)
      returning * into p;

    when 'revision', 'estado', 'datos', 'ubicacion' then
      tipo_final := coalesce((m ->> 'tipo')::hidrantes.tipo_punto, p.tipo);
      diametro_final := case when tipo_final = 'boca_riego' then 45
                             else coalesce((m ->> 'diametro_mm')::smallint, p.diametro_mm) end;
      caudal_final := coalesce((m ->> 'caudal')::hidrantes.estado_caudal, p.caudal);
      -- zona siempre asignada (el record no admite leer campos antes); solo se usa en 'ubicacion'
      select * into zona from hidrantes.fn_municipio_de(coalesce(r.geom, p.geom));
      update hidrantes.puntos x set
        tipo = tipo_final,
        diametro_mm = diametro_final,
        caudal = caudal_final,
        racor = case when tipo_final = 'boca_riego' then coalesce((m ->> 'racor')::hidrantes.tipo_racor, x.racor) end,
        -- si vuelve a funcionar, la descripción del fallo anterior ya no vale
        descripcion_fallo = case when caudal_final = 'no_funciona'
                                 then coalesce(nullif(trim(m ->> 'descripcion_fallo'), ''), x.descripcion_fallo) end,
        descripcion = case when m ? 'descripcion' then nullif(trim(m ->> 'descripcion'), '') else x.descripcion end,
        geom = case when r.operacion = 'ubicacion' then r.geom else x.geom end,
        municipio = case when r.operacion = 'ubicacion' then zona.municipio else x.municipio end,
        nucleo = case when r.operacion = 'ubicacion' then zona.nucleo else x.nucleo end,
        direccion = coalesce(nullif(trim(c ->> 'direccion'), ''),
                             case when r.operacion = 'ubicacion' then r.direccion_sugerida end, x.direccion),
        foto_path = coalesce(r.foto_path, x.foto_path),
        -- corregir datos es un error de registro, no una visita: no renueva la revisión (FR-44)
        fecha_ultima_revision = case when r.operacion = 'datos' then x.fecha_ultima_revision else current_date end
      where x.id = p.id
      returning * into p;

    when 'retirada' then
      update hidrantes.puntos x set situacion = 'retirado' where x.id = p.id returning * into p;
    end case;
  exception
    when check_violation or not_null_violation or invalid_text_representation then
      perform hidrantes.fn_error('PAYLOAD_INVALIDO(' || coalesce(hidrantes.constraint_name_de(sqlerrm), 'datos') || ')',
                                 'El resultado no cumple las reglas del punto');
  end;

  accion := case when c = '{}'::jsonb then 'aprobacion' else 'aprobacion_con_correcciones' end;
  update hidrantes.propuestas x
     set estado = 'aprobada', correcciones = nullif(c, '{}'::jsonb)
                 || case when r.operacion = 'alta' then jsonb_build_object('punto_id', p.id) else '{}'::jsonb end,
         revisada_por = actor, revisada_en = now()
   where x.id = r.id;

  perform hidrantes.fn_registrar(actor, null, true, accion, p.id, r.id, antes,
    hidrantes.fn_punto_json(p) || case when r.operacion = 'ubicacion' and antes is not null
      then jsonb_build_object('desplazamiento_m', round(st_distance(r.geom, st_setsrid(st_makepoint(
             (antes ->> 'lng')::float8, (antes ->> 'lat')::float8), 4326)::geography)::numeric, 1))
      else '{}'::jsonb end);
  if r.dispositivo_id <> hidrantes.fn_dispositivo_admin(actor) then
    perform hidrantes.fn_avisar_autor(r.dispositivo_id, true, p.codigo);
  end if;
  return jsonb_build_object('punto_id', p.id, 'codigo', p.codigo);
end $$;

-- ---------- moderación (FR-106–FR-108) ----------

create function hidrantes.fn_aprobar(propuesta_id uuid, correcciones jsonb default null,
                                     confirmar_desactualizada boolean default false) returns jsonb
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes as $$
begin
  return hidrantes.fn_aplicar_propuesta(propuesta_id, correcciones, confirmar_desactualizada, hidrantes.fn_exigir_admin());
end $$;

-- Cada una en su propio savepoint, en orden de id (sin interbloqueos): una que falle no tumba
-- el lote (FR-107, 05 §11).
create function hidrantes.fn_aprobar_lote(propuesta_ids uuid[])
returns table (propuesta_id uuid, resultado text, motivo text)
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes as $$
declare
  actor text := hidrantes.fn_exigir_admin();
  id_p uuid;
begin
  for id_p in select distinct unnest(propuesta_ids) order by 1 loop
    begin
      perform hidrantes.fn_aplicar_propuesta(id_p, null, false, actor);
      propuesta_id := id_p; resultado := 'aprobada'; motivo := null;
    exception when raise_exception then
      propuesta_id := id_p; resultado := 'omitida'; motivo := split_part(sqlerrm, ':', 1);
    end;
    return next;
  end loop;
end $$;

create function hidrantes.fn_rechazar(propuesta_id uuid, motivo text) returns void
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes as $$
declare
  actor text := hidrantes.fn_exigir_admin();
  r hidrantes.propuestas;
begin
  if coalesce(trim(motivo), '') = '' then
    perform hidrantes.fn_error('MOTIVO_OBLIGATORIO', 'Sin motivo no se puede rechazar');
  end if;
  select * into r from hidrantes.propuestas x where x.id = propuesta_id for update;
  if not found or r.estado <> 'pendiente' then
    perform hidrantes.fn_error('PROPUESTA_NO_PENDIENTE', 'La propuesta ya no está pendiente');
  end if;
  update hidrantes.propuestas x set estado = 'rechazada', motivo_rechazo = trim(motivo),
         revisada_por = actor, revisada_en = now()
   where x.id = propuesta_id;
  perform hidrantes.fn_registrar(actor, null, true, 'rechazo', r.punto_id, r.id, null,
                                 jsonb_build_object('motivo', trim(motivo)));
  perform hidrantes.fn_avisar_autor(r.dispositivo_id, false,
                                    (select codigo from hidrantes.puntos where id = r.punto_id));
end $$;

-- Fusiona un alta con un punto existente del mismo tipo (FR-51, FR-106). Por defecto prevalece lo
-- existente, salvo foto y fecha de revisión, que son las de la propuesta.
create function hidrantes.fn_fusionar_con_existente(propuesta_id uuid, punto_id uuid, prevalece jsonb default '{}')
returns jsonb
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes, extensions as $$
declare
  actor text := hidrantes.fn_exigir_admin();
  r hidrantes.propuestas;
  p hidrantes.puntos;
  antes jsonb;
  usa_propuesta text[];
  k text;
begin
  select * into r from hidrantes.propuestas x where x.id = propuesta_id for update;
  if not found or r.estado <> 'pendiente' then
    perform hidrantes.fn_error('PROPUESTA_NO_PENDIENTE', 'La propuesta ya no está pendiente');
  end if;
  if r.operacion <> 'alta' then
    perform hidrantes.fn_error('PROPUESTA_NO_ALTA', 'Solo se fusiona un alta');
  end if;
  select * into p from hidrantes.puntos x where x.id = punto_id for update;
  if not found or p.situacion <> 'activo' then
    perform hidrantes.fn_error('PUNTO_NO_ACTIVO', 'El punto ya no está activo');
  end if;
  if p.tipo::text <> r.datos ->> 'tipo' then
    perform hidrantes.fn_error('TIPO_DISTINTO', 'Solo se fusionan puntos del mismo tipo');
  end if;
  perform hidrantes.fn_exigir_claves(coalesce(prevalece, '{}'), array['racor', 'caudal', 'diametro_mm', 'ubicacion']);
  for k in select key from jsonb_each_text(coalesce(prevalece, '{}')) where value = 'propuesta' loop
    usa_propuesta := usa_propuesta || k;
  end loop;
  antes := hidrantes.fn_punto_json(p);

  begin
    update hidrantes.puntos x set
      racor = case when 'racor' = any (usa_propuesta) then (r.datos ->> 'racor')::hidrantes.tipo_racor else x.racor end,
      caudal = case when 'caudal' = any (usa_propuesta) then (r.datos ->> 'caudal')::hidrantes.estado_caudal else x.caudal end,
      descripcion_fallo = case when 'caudal' = any (usa_propuesta)
                               then nullif(trim(r.datos ->> 'descripcion_fallo'), '') else x.descripcion_fallo end,
      diametro_mm = case when 'diametro_mm' = any (usa_propuesta) and r.datos ? 'diametro_mm'
                         then (r.datos ->> 'diametro_mm')::smallint else x.diametro_mm end,
      geom = case when 'ubicacion' = any (usa_propuesta) then r.geom else x.geom end,
      foto_path = r.foto_path,
      fecha_ultima_revision = current_date
    where x.id = p.id
    returning * into p;
  exception when check_violation or invalid_text_representation then
    perform hidrantes.fn_error('PAYLOAD_INVALIDO(fusion)', 'El resultado no cumple las reglas del punto');
  end;

  update hidrantes.propuestas x set estado = 'aprobada',
         correcciones = jsonb_build_object('punto_id', p.id, 'fusionada_con', p.codigo),
         revisada_por = actor, revisada_en = now()
   where x.id = r.id;
  perform hidrantes.fn_registrar(actor, null, true, 'fusion', p.id, r.id, antes, hidrantes.fn_punto_json(p));
  perform hidrantes.fn_avisar_autor(r.dispositivo_id, true, p.codigo);
  return jsonb_build_object('punto_id', p.id, 'codigo', p.codigo);
end $$;

-- ---------- inventario (FR-120, FR-124) ----------

create function hidrantes.fn_editar_punto(punto_id uuid, cambios jsonb) returns void
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes as $$
declare
  actor text := hidrantes.fn_exigir_admin();
  p hidrantes.puntos;
  antes jsonb;
  tipo_final hidrantes.tipo_punto;
begin
  if cambios is null or jsonb_typeof(cambios) <> 'object' or cambios = '{}'::jsonb then
    perform hidrantes.fn_error('PAYLOAD_INVALIDO(cambios)', 'No has cambiado nada');
  end if;
  perform hidrantes.fn_exigir_claves(cambios, array['tipo', 'diametro_mm', 'caudal', 'racor', 'descripcion_fallo',
                                                    'descripcion', 'direccion']);
  select * into p from hidrantes.puntos x where x.id = punto_id for update;
  if not found or p.situacion <> 'activo' then
    perform hidrantes.fn_error('PUNTO_NO_ACTIVO', 'El punto ya no está activo');
  end if;
  antes := hidrantes.fn_punto_json(p);
  begin
    tipo_final := coalesce((cambios ->> 'tipo')::hidrantes.tipo_punto, p.tipo);
    update hidrantes.puntos x set
      tipo = tipo_final,
      diametro_mm = case when tipo_final = 'boca_riego' then 45
                         else coalesce((cambios ->> 'diametro_mm')::smallint, x.diametro_mm) end,
      caudal = coalesce((cambios ->> 'caudal')::hidrantes.estado_caudal, x.caudal),
      racor = case when tipo_final = 'boca_riego' then coalesce((cambios ->> 'racor')::hidrantes.tipo_racor, x.racor) end,
      descripcion_fallo = case when cambios ? 'descripcion_fallo' then nullif(trim(cambios ->> 'descripcion_fallo'), '')
                               else x.descripcion_fallo end,
      descripcion = case when cambios ? 'descripcion' then nullif(trim(cambios ->> 'descripcion'), '') else x.descripcion end,
      direccion = case when cambios ? 'direccion' then nullif(trim(cambios ->> 'direccion'), '') else x.direccion end
    where x.id = punto_id
    returning * into p;
  exception when check_violation or invalid_text_representation then
    perform hidrantes.fn_error('PAYLOAD_INVALIDO(' || coalesce(hidrantes.constraint_name_de(sqlerrm), 'cambios') || ')',
                               'El resultado no cumple las reglas del punto');
  end;
  perform hidrantes.fn_registrar(actor, null, true, 'edicion_admin', punto_id, null, antes, hidrantes.fn_punto_json(p));
end $$;

create function hidrantes.fn_retirar_punto(punto_id uuid, motivo text) returns void
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes as $$
declare
  actor text := hidrantes.fn_exigir_admin();
  p hidrantes.puntos;
begin
  if coalesce(trim(motivo), '') = '' then
    perform hidrantes.fn_error('MOTIVO_OBLIGATORIO', 'Indica el motivo');
  end if;
  select * into p from hidrantes.puntos x where x.id = punto_id for update;
  if not found or p.situacion <> 'activo' then
    perform hidrantes.fn_error('PUNTO_NO_ACTIVO', 'El punto ya no está activo');
  end if;
  update hidrantes.puntos x set situacion = 'retirado' where x.id = punto_id;
  perform hidrantes.fn_registrar(actor, null, true, 'retirada', punto_id, null, hidrantes.fn_punto_json(p),
                                 jsonb_build_object('situacion', 'retirado', 'motivo', trim(motivo)));
end $$;

create function hidrantes.fn_borrar_punto(punto_id uuid, motivo text) returns void
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes as $$
declare
  actor text := hidrantes.fn_exigir_admin();
  p hidrantes.puntos;
begin
  if coalesce(trim(motivo), '') = '' then
    perform hidrantes.fn_error('MOTIVO_OBLIGATORIO', 'Indica el motivo');
  end if;
  select * into p from hidrantes.puntos x where x.id = punto_id for update;
  if not found or p.situacion = 'borrado' then
    perform hidrantes.fn_error('PUNTO_NO_ACTIVO', 'El punto ya está en la papelera');
  end if;
  update hidrantes.puntos x set situacion = 'borrado', borrado_en = now() where x.id = punto_id;
  perform hidrantes.fn_registrar(actor, null, true, 'borrado', punto_id, null, hidrantes.fn_punto_json(p),
                                 jsonb_build_object('situacion', 'borrado', 'motivo', trim(motivo)));
end $$;

create function hidrantes.fn_restaurar_punto(punto_id uuid) returns void
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes as $$
declare
  actor text := hidrantes.fn_exigir_admin();
  p hidrantes.puntos;
begin
  select * into p from hidrantes.puntos x where x.id = punto_id for update;
  if not found or p.situacion <> 'borrado' then
    perform hidrantes.fn_error('PUNTO_NO_ACTIVO', 'El punto no está en la papelera');
  end if;
  if p.borrado_en < now() - make_interval(days => (hidrantes.fn_config('dias_papelera', '30') #>> '{}')::int) then
    perform hidrantes.fn_error('FUERA_DE_PLAZO_PAPELERA', 'Ha pasado el plazo de la papelera');
  end if;
  update hidrantes.puntos x set situacion = 'activo', borrado_en = null where x.id = punto_id;
  perform hidrantes.fn_registrar(actor, null, true, 'restauracion', punto_id, null, null,
                                 jsonb_build_object('situacion', 'activo'));
end $$;

-- Purga definitiva de la papelera. La programa pg_cron (sin sesión) y la puede lanzar jefatura.
create function hidrantes.fn_purgar_papelera_interna(actor text) returns integer
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
    delete from hidrantes.propuestas where punto_id = p.id;
    delete from hidrantes.puntos where id = p.id;
    perform hidrantes.fn_registrar(actor, null, true, 'purga_papelera', p.id, null, hidrantes.fn_punto_json(p), null);
    n := n + 1;
  end loop;
  return n;
end $$;

create function hidrantes.fn_purgar_papelera() returns integer
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes as $$
begin
  return hidrantes.fn_purgar_papelera_interna(hidrantes.fn_exigir_admin());
end $$;

select cron.schedule('hidrantes_purgar_papelera', '47 3 * * *',
  $$select hidrantes.fn_purgar_papelera_interna('tarea programada')$$);

-- ---------- ajustes (FR-140–FR-142) ----------

create function hidrantes.fn_cambiar_codigo_acceso(nuevo text, revocar_dispositivos boolean) returns void
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes, extensions as $$
declare
  actor text := hidrantes.fn_exigir_admin();
  revocados integer;
begin
  if coalesce(nuevo, '') !~ '^[0-9]{6}$' then
    perform hidrantes.fn_error('CODIGO_FORMATO', 'El código son 6 cifras');
  end if;
  insert into hidrantes.config (clave, valor, actualizado_por) values
    ('codigo_acceso_hash', to_jsonb(crypt(nuevo, gen_salt('bf', 10))), actor),
    ('codigo_acceso', to_jsonb(nuevo), actor),
    ('codigo_acceso_cambiado_en', to_jsonb(now()), actor),
    ('codigo_acceso_cambiado_por', to_jsonb(actor), actor)
  on conflict (clave) do update set valor = excluded.valor, actualizado_por = excluded.actualizado_por;
  -- El código nunca va al registro: solo el hecho (11).
  perform hidrantes.fn_registrar(actor, null, true, 'codigo_cambiado', null, null, null,
                                 jsonb_build_object('revocar_dispositivos', coalesce(revocar_dispositivos, false)));
  if coalesce(revocar_dispositivos, false) then
    update hidrantes.dispositivos set revocado_en = now() where revocado_en is null;
    get diagnostics revocados = row_count;
    perform hidrantes.fn_registrar(actor, null, true, 'dispositivos_revocados', null, null, null,
                                   jsonb_build_object('dispositivos', revocados));
  end if;
end $$;

create function hidrantes.fn_gestionar_administrador(email text, activo boolean) returns void
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes as $$
declare
  actor text := hidrantes.fn_exigir_admin();
  e text := lower(trim(email));
  activos integer;
begin
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    perform hidrantes.fn_error('PAYLOAD_INVALIDO(email)', 'Correo no válido');
  end if;
  -- Bloquea a todos los activos: la regla del último se comprueba dentro de la transacción (05 §11).
  perform 1 from hidrantes.administradores a where a.activo for update;
  if not activo then
    select count(*) into activos from hidrantes.administradores a where a.activo and a.email <> e;
    if activos = 0 then
      perform hidrantes.fn_error('ULTIMO_ADMINISTRADOR', 'No se puede desactivar al último administrador activo');
    end if;
  end if;
  insert into hidrantes.administradores (email, activo, creado_por) values (e, activo, actor)
  on conflict on constraint administradores_pkey do update set activo = excluded.activo;
  perform hidrantes.fn_registrar(actor, null, true,
    case when activo then 'administrador_alta' else 'administrador_baja' end, null, null, null,
    jsonb_build_object('email', e));
end $$;

-- Solo los parámetros de FR-142, con tipos y rangos (05 §6.2).
create function hidrantes.fn_guardar_config(cambios jsonb) returns void
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes as $$
declare
  actor text := hidrantes.fn_exigir_admin();
  k text;
  v jsonb;
  rangos constant jsonb := '{
    "meses_revision": [1, 60], "radio_duplicado_m": [1, 500], "dias_papelera": [1, 365],
    "buffer_zona_m": [0, 5000], "max_subidas_dispositivo_dia": [1, 500]}';
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

-- ---------- voluntarios e incidencias (FR-130–FR-132) ----------

create function hidrantes.fn_resolver_incidencia(incidencia_id uuid) returns void
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes as $$
declare
  actor text := hidrantes.fn_exigir_admin();
begin
  update hidrantes.incidencias_app i set estado = 'resuelta', resuelta_por = actor, resuelta_en = now()
   where i.id = incidencia_id and i.estado = 'abierta';
  if not found then
    perform hidrantes.fn_error('PAYLOAD_INVALIDO(incidencia_id)', 'La incidencia no existe o ya está resuelta');
  end if;
  perform hidrantes.fn_registrar(actor, null, true, 'incidencia_resuelta', null, null, null,
                                 jsonb_build_object('incidencia_id', incidencia_id));
end $$;

create function hidrantes.fn_actividad_voluntarios(meses integer)
returns table (autor text, dispositivo_id uuid, propuestas int, aprobadas int, rechazadas int, tasa numeric,
               ultima timestamptz)
language plpgsql stable security definer set search_path = pg_catalog, hidrantes as $$
begin
  perform hidrantes.fn_exigir_admin();
  return query
  select (array_agg(r.autor_nombre || ' ' || r.autor_apellido order by r.creada_en desc))[1],
         r.dispositivo_id,
         count(*)::int,
         count(*) filter (where r.estado = 'aprobada')::int,
         count(*) filter (where r.estado = 'rechazada')::int,
         round(count(*) filter (where r.estado = 'aprobada')::numeric
               / nullif(count(*) filter (where r.estado in ('aprobada', 'rechazada')), 0), 2),
         max(r.creada_en)
  from hidrantes.propuestas r
  where r.creada_en > now() - make_interval(months => greatest(coalesce(meses, 12), 1))
    and r.dispositivo_id not in (select hidrantes.fn_dispositivo_admin(a.email) from hidrantes.administradores a)
  group by r.dispositivo_id
  order by count(*) desc;
end $$;

-- Supresión por dispositivo, nunca por nombre (FR-131, 11 §7).
create function hidrantes.fn_anonimizar_autor(dispositivo_id uuid) returns integer
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes as $$
declare
  actor text := hidrantes.fn_exigir_admin();
  n_propuestas integer;
  n_registro integer;
begin
  update hidrantes.propuestas r set autor_nombre = 'voluntario dado de baja', autor_apellido = ''
   where r.dispositivo_id = fn_anonimizar_autor.dispositivo_id;
  get diagnostics n_propuestas = row_count;
  perform set_config('hidrantes.anonimizando', 'on', true);
  update hidrantes.registro g set actor = 'voluntario dado de baja'
   where g.dispositivo_id = fn_anonimizar_autor.dispositivo_id and not g.es_admin;
  get diagnostics n_registro = row_count;
  perform set_config('hidrantes.anonimizando', 'off', true);
  perform hidrantes.fn_registrar(actor, null, true, 'anonimizacion', null, null, null,
    jsonb_build_object('dispositivo_id', dispositivo_id, 'propuestas', n_propuestas, 'registro', n_registro));
  return n_propuestas + n_registro;
end $$;

-- ---------- consultas del panel ----------

create function hidrantes.fn_historial_punto(punto_id uuid) returns setof hidrantes.v_registro
language plpgsql stable security definer set search_path = pg_catalog, hidrantes as $$
begin
  perform hidrantes.fn_exigir_admin();
  return query select * from hidrantes.v_registro v where v.punto_id = fn_historial_punto.punto_id order by v.momento;
end $$;

create function hidrantes.fn_salud() returns jsonb
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
    -- El tamaño del bucket lo anota el workflow de respaldo (Fase 8): la base de datos no lo ve.
    'storage_bytes', hidrantes.fn_config('storage_bytes', 'null'),
    'version_zona', hidrantes.fn_config('version_zona', 'null'),
    'version_mapabase', hidrantes.fn_config('version_mapabase', 'null'),
    'dispositivos_activos', (select count(*) from hidrantes.dispositivos where revocado_en is null
                               and ultimo_uso > now() - interval '90 days')
  );
end $$;

-- Datos planos para exportar en el navegador (FR-160, TR-105); deja constancia en el registro.
create function hidrantes.fn_exportar_inventario(filtros jsonb default '{}') returns jsonb
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes as $$
declare
  actor text := hidrantes.fn_exigir_admin();
  f jsonb := coalesce(filtros, '{}');
  filas jsonb;
begin
  perform hidrantes.fn_exigir_claves(f, array['tipo', 'caudal', 'nucleo', 'diametro_mm', 'revision_caducada']);
  select coalesce(jsonb_agg(jsonb_build_object(
           'codigo', v.codigo, 'tipo', v.tipo, 'diametro_mm', v.diametro_mm, 'caudal', v.caudal, 'racor', v.racor,
           'direccion', v.direccion, 'nucleo', v.nucleo, 'municipio', v.municipio,
           'fecha_ultima_revision', v.fecha_ultima_revision, 'lat', v.lat, 'lng', v.lng) order by v.codigo), '[]')
    into filas
    from hidrantes.v_puntos_activos v
   where (not f ? 'tipo' or v.tipo::text = f ->> 'tipo')
     and (not f ? 'caudal' or v.caudal::text = f ->> 'caudal')
     and (not f ? 'nucleo' or v.nucleo = f ->> 'nucleo')
     and (not f ? 'diametro_mm' or v.diametro_mm::text = f ->> 'diametro_mm')
     and (not f ? 'revision_caducada' or v.revision_caducada = (f ->> 'revision_caducada')::boolean);
  perform hidrantes.fn_registrar(actor, null, true, 'exportacion', null, null, null,
                                 jsonb_build_object('filtros', f, 'filas', jsonb_array_length(filas)));
  return filas;
end $$;

create function hidrantes.fn_guardar_suscripcion_push_admin(suscripcion jsonb, temas text[]) returns uuid
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes as $$
declare
  actor text := hidrantes.fn_exigir_admin();
  id_s uuid;
begin
  perform hidrantes.fn_validar_suscripcion(suscripcion);
  if coalesce(temas, '{}') = '{}' or not temas <@ array['nuevas_propuestas', 'resumen_semanal'] then
    perform hidrantes.fn_error('PAYLOAD_INVALIDO(temas)', 'Tema no admitido');
  end if;
  insert into hidrantes.suscripciones_push (email, suscripcion, temas) values (actor, suscripcion, temas)
  on conflict ((suscripcion ->> 'endpoint'))
  do update set email = excluded.email, dispositivo_id = null, suscripcion = excluded.suscripcion,
                temas = excluded.temas, fallos = 0
  returning id into id_s;
  return id_s;
end $$;

-- Últimas entradas del CHANGELOG; las carga CI en config.novedades (FR-167).
create function hidrantes.fn_novedades() returns jsonb
language sql stable security definer set search_path = pg_catalog, hidrantes as $$
  select hidrantes.fn_config('novedades', '[]');
$$;

-- Dirección que devuelve Nominatim, guardada en la propuesta por /api/direccion (FR-15, FR-105).
create function hidrantes.fn_guardar_direccion_sugerida(propuesta_id uuid, direccion text) returns void
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes as $$
begin
  perform hidrantes.fn_exigir_admin();
  update hidrantes.propuestas r set direccion_sugerida = left(nullif(trim(direccion), ''), 300)
   where r.id = propuesta_id and r.estado = 'pendiente';
end $$;

-- Deja constancia de un workflow lanzado desde Ajustes (FR-144, FR-165).
create function hidrantes.fn_registrar_workflow(workflow text) returns void
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes as $$
begin
  perform hidrantes.fn_registrar(hidrantes.fn_exigir_admin(), null, true, 'workflow_lanzado', null, null, null,
                                 jsonb_build_object('workflow', workflow));
end $$;
