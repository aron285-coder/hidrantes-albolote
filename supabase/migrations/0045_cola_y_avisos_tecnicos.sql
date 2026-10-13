-- 0045 · La Cola solo marca desactualizado lo que cambió de verdad (docs/35 RV-403) y avisos técnicos a
-- jefatura (docs/35 RV-404, DEC-202).
--
-- RV-403. Añadir un núcleo actualizaba todos los puntos activos del municipio, y renombrarlo, los de
-- ese núcleo. El trigger subía actualizado_en y la Cola comparaba actualizado_en > creada_en: cada
-- propuesta pendiente del municipio salía «desactualizada».
--   1. puntos.datos_cambiados_en: la pone el trigger nuevo puntos_datos_cambiados_en cuando cambia algo
--      que no sea nucleo, municipio ni una marca de tiempo. Se rellena con actualizado_en sin disparar
--      puntos_actualizado_en (si no, todos los móviles volverían a bajar todos los puntos).
--   2. fn_anadir_nucleo (misma firma) solo toca los puntos cuyo núcleo cambia.
--   3. v_cola_revision y fn_aplicar_propuesta (su última versión es la de 0039) comparan con
--      datos_cambiados_en. La vista gana punto_datos_cambiados_en al final (04 §12).
--   actualizado_en sigue subiendo con todo: la sincronización de los móviles lo necesita.
--
-- RV-404. Tema de push avisos_tecnicos para jefatura (las suscripciones que ya hay lo reciben) y
-- fn_encolar_aviso_tecnico, solo para service_role: una notificación por suscripción de jefatura de
-- un administrador activo con el tema; como mucho una por clave cada 24 h (intentos_codigo, una por
-- hora), con la fila de la clave en avisos_tecnicos bloqueada (for update). Sin nombres ni correos;
-- los textos fijos, aquí, como los de los demás avisos de jefatura. /api/push la envía como las demás.

-- =====================================================================================
-- RV-403
-- =====================================================================================

alter table hidrantes.puntos add column if not exists datos_cambiados_en timestamptz;

-- Sin disparar puntos_actualizado_en: el relleno no es un cambio del punto.
alter table hidrantes.puntos disable trigger puntos_actualizado_en;
update hidrantes.puntos set datos_cambiados_en = actualizado_en where datos_cambiados_en is null;
alter table hidrantes.puntos enable trigger puntos_actualizado_en;

alter table hidrantes.puntos alter column datos_cambiados_en set not null;

-- Al crear el punto, la que traiga o, si no, su actualizado_en (sin default en la columna: así el
-- seed y las pruebas que crean puntos "de hace días" no dejan sus propuestas desactualizadas).
-- Al actualizarlo, sube con cualquier cambio salvo núcleo, municipio y marcas de tiempo; si no cambia
-- nada de eso, se queda la de antes, también si el update intenta fijarla a mano.
create or replace function hidrantes.tg_datos_cambiados_en() returns trigger
language plpgsql set search_path = pg_catalog as $$
declare
  fuera constant text[] := array['nucleo', 'municipio', 'creado_en', 'actualizado_en', 'datos_cambiados_en'];
begin
  if tg_op = 'INSERT' then
    new.datos_cambiados_en := coalesce(new.datos_cambiados_en, new.actualizado_en, now());
  elsif (to_jsonb(new) - fuera) is distinct from (to_jsonb(old) - fuera) then
    new.datos_cambiados_en := now();
  else
    new.datos_cambiados_en := old.datos_cambiados_en;
  end if;
  return new;
end $$;

revoke all on function hidrantes.tg_datos_cambiados_en() from public, anon, authenticated;

drop trigger if exists puntos_datos_cambiados_en on hidrantes.puntos;
create trigger puntos_datos_cambiados_en before insert or update on hidrantes.puntos
  for each row execute function hidrantes.tg_datos_cambiados_en();

-- El punto en el Registro (antes y despues): la marca nueva es técnica, como actualizado_en, y no
-- debe salir como un campo cambiado en el panel de hoy ni en el anterior. Misma firma que 0005.
create or replace function hidrantes.fn_punto_json(p hidrantes.puntos) returns jsonb
language sql stable set search_path = pg_catalog, hidrantes, extensions as $$
  select (to_jsonb(p) - 'geom' - 'datos_cambiados_en')
         || jsonb_build_object('lat', st_y(p.geom::geometry), 'lng', st_x(p.geom::geometry));
$$;

-- El cuerpo de 0009 con un cambio: solo los puntos cuyo núcleo cambia. Con lock_timeout, como las
-- demás RPC que escriben puntos (05 §11).
create or replace function hidrantes.fn_anadir_nucleo(nombre text, lat double precision, lng double precision) returns void
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes, extensions
set lock_timeout = '5s' as $$
declare
  actor text := hidrantes.fn_exigir_admin();
  limpio text := trim(nombre);
  punto extensions.geography;
  zona record;
begin
  if length(limpio) between 2 and 60 is not true then
    perform hidrantes.fn_error('PAYLOAD_INVALIDO(nombre)', 'El nombre tiene entre 2 y 60 caracteres');
  end if;
  if lat is null or lng is null or lat not between 36.6 and 38.2 or lng not between -4.5 and -2.5 then
    perform hidrantes.fn_error('PAYLOAD_INVALIDO(posicion)', 'Coloca el núcleo dentro de la zona');
  end if;
  if exists (select 1 from hidrantes.nucleos x where x.nombre = limpio) then
    perform hidrantes.fn_error('PAYLOAD_INVALIDO(nombre)', 'Ya hay un núcleo con ese nombre');
  end if;
  punto := st_setsrid(st_makepoint(lng, lat), 4326)::geography;
  select * into zona from hidrantes.fn_municipio_de(punto);
  if zona.municipio = 'fuera_de_zona' then
    perform hidrantes.fn_error('PAYLOAD_INVALIDO(posicion)', 'Ese punto queda fuera de la zona de cobertura');
  end if;
  insert into hidrantes.nucleos (nombre, municipio, geom, version, manual)
  values (limpio, zona.municipio, punto, 'manual', true);
  -- Los puntos activos que ahora caen más cerca del núcleo nuevo pasan a él; los demás no se tocan.
  with nuevos as (
    select q.id, m.nucleo
      from hidrantes.puntos q
      cross join lateral hidrantes.fn_municipio_de(q.geom) m
     where q.situacion <> 'borrado' and q.municipio = zona.municipio
  )
  update hidrantes.puntos p set nucleo = n.nucleo
    from nuevos n
   where p.id = n.id and p.nucleo is distinct from n.nucleo;
  perform hidrantes.fn_registrar(actor, null, true, 'nucleo_guardado', null, null, null,
                                 jsonb_build_object('nombre', limpio, 'municipio', zona.municipio));
end $$;

-- La de 0036 con desactualizada sobre datos_cambiados_en y una columna más al final.
create or replace view hidrantes.v_cola_revision with (security_invoker = true) as
select
  r.id, r.operacion, r.estado, r.creada_en, r.autor_nombre, r.autor_apellido, r.dispositivo_id,
  r.punto_id, p.codigo, p.tipo as tipo_actual, r.datos, r.foto_path, p.foto_path as foto_path_actual,
  r.direccion_sugerida, p.direccion as direccion_actual,
  extensions.st_y(r.geom::extensions.geometry) as lat,
  extensions.st_x(r.geom::extensions.geometry) as lng,
  (select jsonb_object_agg(k, to_jsonb(p) -> k)
     from jsonb_object_keys(r.datos) k
    where to_jsonb(p) ? k) as antes,
  r.datos as despues,
  r.origen_ubicacion, r.precision_gps_m, r.distancia_gps_m,
  case when r.exif_geom is not null and r.geom is not null
       then extensions.st_distance(r.exif_geom, r.geom) end as distancia_exif_m,
  case when r.geom is not null
       then (select m.municipio = 'fuera_de_zona' from hidrantes.fn_municipio_de(r.geom) m) end as fuera_de_zona,
  case when p.id is not null
       then (extract(year from age(current_date, p.fecha_ultima_revision)) * 12
             + extract(month from age(current_date, p.fecha_ultima_revision)))::int end as meses_desde_revision,
  r.duplicado_de, r.distancia_duplicado_m, d.codigo as codigo_duplicado,
  (r.datos ? 'diametro_otro') as otra_medida,
  coalesce(p.datos_cambiados_en > r.creada_en, false) as desactualizada,
  case when p.id is not null then p.nucleo
       when r.geom is not null then (select m.nucleo from hidrantes.fn_municipio_de(r.geom) m) end as nucleo,
  p.actualizado_en as punto_actualizado_en,
  r.foto_sitio_path,
  p.foto_sitio_path as foto_sitio_path_actual,
  (r.operacion in ('alta', 'ubicacion') and r.foto_sitio_path is null) as sin_foto_sitio,
  case when p.id is not null then jsonb_build_object(
    'codigo', p.codigo, 'tipo', p.tipo, 'diametro_mm', p.diametro_mm, 'caudal', p.caudal,
    'racor', p.racor, 'descripcion', p.descripcion, 'descripcion_fallo', p.descripcion_fallo,
    'direccion', p.direccion, 'nucleo', p.nucleo, 'fecha_ultima_revision', p.fecha_ultima_revision,
    'foto_path', p.foto_path, 'foto_sitio_path', p.foto_sitio_path,
    'situacion', p.situacion, 'borrado_en', p.borrado_en) end as punto,
  extensions.st_y(p.geom::extensions.geometry) as punto_lat,
  extensions.st_x(p.geom::extensions.geometry) as punto_lng,
  -- nueva en 0045: lo que decide desactualizada
  p.datos_cambiados_en as punto_datos_cambiados_en
from hidrantes.propuestas r
left join hidrantes.puntos p on p.id = r.punto_id
left join hidrantes.puntos d on d.id = r.duplicado_de
where r.estado = 'pendiente';

-- El cuerpo de 0039 con un cambio: compara datos_cambiados_en, no actualizado_en.
create or replace function hidrantes.fn_aplicar_propuesta(
  propuesta_id uuid, correcciones jsonb, confirmar_desactualizada boolean, actor text
) returns jsonb
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes, extensions
set lock_timeout = '5s' as $$
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
  perform hidrantes.fn_validar_longitudes(c);
  m := r.datos || c;

  if r.punto_id is not null then
    select * into p from hidrantes.puntos x where x.id = r.punto_id for update;
    if not found or p.situacion <> 'activo' then
      perform hidrantes.fn_error('PUNTO_NO_ACTIVO', 'El punto ya no está activo');
    end if;
    if p.datos_cambiados_en > r.creada_en and not coalesce(confirmar_desactualizada, false) then
      perform hidrantes.fn_error('PROPUESTA_DESACTUALIZADA', 'El punto cambió después de enviarse la propuesta');
    end if;
    antes := hidrantes.fn_punto_json(p);
    -- Fuera de un alta el tipo no cambia, ni por lo propuesto ni por las correcciones (DEC-090).
    -- Una propuesta pendiente de antes que lo cambie se omite en el lote con este código.
    if r.operacion <> 'alta' and m ? 'tipo' and m ->> 'tipo' is distinct from p.tipo::text then
      perform hidrantes.fn_error('TIPO_NO_MODIFICABLE', 'El tipo no se cambia: propón retirarlo y da de alta el correcto');
    end if;
  end if;

  begin
    case r.operacion
    when 'alta' then
      tipo_final := (m ->> 'tipo')::hidrantes.tipo_punto;
      -- Una boca con otra medida se aprueba tal cual; sin diámetro, 45 (DEC-144). Un hidrante con
      -- otra medida necesita que jefatura fije 70 o 100 (FR-17).
      diametro_final := case when tipo_final = 'boca_riego'
                             then coalesce((m ->> 'diametro_mm')::smallint,
                                           ((m ->> 'diametro_otro')::numeric)::smallint, 45)
                             else (m ->> 'diametro_mm')::smallint end;
      if diametro_final is null then
        perform hidrantes.fn_error('DIAMETRO_SIN_FIJAR', 'Fija 70 o 100 mm antes de aprobar');
      end if;
      select * into zona from hidrantes.fn_municipio_de(r.geom);
      insert into hidrantes.puntos (codigo, tipo, geom, diametro_mm, caudal, racor, descripcion_fallo, descripcion,
                                    direccion, foto_path, foto_sitio_path, municipio, nucleo, fecha_ultima_revision)
      values (hidrantes.fn_siguiente_codigo(tipo_final), tipo_final, r.geom, diametro_final,
              (m ->> 'caudal')::hidrantes.estado_caudal,
              case when tipo_final = 'boca_riego' then (m ->> 'racor')::hidrantes.tipo_racor end,
              -- la nota de fallo solo vale con no_funciona (RV-42); con barro o cualquier otro, nada
              case when m ->> 'caudal' = 'no_funciona' then nullif(trim(m ->> 'descripcion_fallo'), '') end,
              nullif(trim(m ->> 'descripcion'), ''),
              -- con la clave, lo que diga jefatura (null o vacía: sin dirección); sin ella, la sugerida
              case when c ? 'direccion' then nullif(trim(c ->> 'direccion'), '') else r.direccion_sugerida end,
              r.foto_path, r.foto_sitio_path, zona.municipio, zona.nucleo, current_date)
      returning * into p;

    when 'revision', 'estado', 'datos', 'ubicacion' then
      tipo_final := coalesce((m ->> 'tipo')::hidrantes.tipo_punto, p.tipo);
      -- El diámetro que ya tenía, salvo que la propuesta o jefatura lo corrijan; también en bocas.
      diametro_final := coalesce((m ->> 'diametro_mm')::smallint,
                                 case when tipo_final = 'boca_riego'
                                      then ((m ->> 'diametro_otro')::numeric)::smallint end,
                                 p.diametro_mm);
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
        direccion = case when c ? 'direccion' then nullif(trim(c ->> 'direccion'), '')
                         else coalesce(case when r.operacion = 'ubicacion' then r.direccion_sugerida end, x.direccion) end,
        foto_path = coalesce(r.foto_path, x.foto_path),
        -- solo una ubicación puede traerla: la sustituye; sin ella (app anterior), se queda la que había
        foto_sitio_path = coalesce(r.foto_sitio_path, x.foto_sitio_path),
        -- corregir datos es un error de registro, no una visita: no renueva la revisión (FR-44)
        fecha_ultima_revision = case when r.operacion = 'datos' then x.fecha_ultima_revision else current_date end
      where x.id = p.id
      returning * into p;

    when 'retirada' then
      update hidrantes.puntos x set situacion = 'retirado' where x.id = p.id returning * into p;
    end case;
  exception
    -- numeric_value_out_of_range: un diámetro enorme no llega crudo al cliente ni tumba el lote.
    when check_violation or not_null_violation or invalid_text_representation or numeric_value_out_of_range then
      perform hidrantes.fn_error('PAYLOAD_INVALIDO(' || coalesce(hidrantes.constraint_name_de(sqlerrm), 'datos') || ')',
                                 'El resultado no cumple las reglas del punto');
  end;

  accion := case when c = '{}'::jsonb then 'aprobacion' else 'aprobacion_con_correcciones' end;
  -- nullif(c, '{}') || … daba NULL en un alta sin correcciones (|| con NULL es NULL) y se perdía el
  -- punto creado: Mis propuestas no enseñaba su código (DEC-144, punto 9).
  update hidrantes.propuestas x
     set estado = 'aprobada',
         correcciones = nullif(c || case when r.operacion = 'alta' then jsonb_build_object('punto_id', p.id)
                                         else '{}'::jsonb end, '{}'::jsonb),
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

-- =====================================================================================
-- RV-404
-- =====================================================================================

-- Última emisión de cada clave (null: nunca). Solo la escribe fn_encolar_aviso_tecnico.
create table if not exists hidrantes.avisos_tecnicos (
  clave     text primary key check (clave in ('vigilancia', 'respaldo', 'despliegue', 'intentos_codigo')),
  ultimo_en timestamptz
);
alter table hidrantes.avisos_tecnicos enable row level security;
-- Toda tabla tiene al menos una política (05 §5); esta no deja ver nada, como migraciones_aplicadas.
drop policy if exists avisos_tecnicos_sin_acceso on hidrantes.avisos_tecnicos;
create policy avisos_tecnicos_sin_acceso on hidrantes.avisos_tecnicos for select to authenticated using (false);
revoke all on hidrantes.avisos_tecnicos from public, anon, authenticated;
grant all on hidrantes.avisos_tecnicos to service_role;

-- Las suscripciones de jefatura que ya existen reciben el tema activado.
update hidrantes.suscripciones_push s
   set temas = s.temas || array['avisos_tecnicos']
 where s.dispositivo_id is null and not ('avisos_tecnicos' = any (s.temas));

-- El cuerpo de 0030 con un tema más admitido. Misma firma y mismos permisos.
create or replace function hidrantes.fn_guardar_suscripcion_push_admin(suscripcion jsonb, temas text[]) returns uuid
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes as $$
#variable_conflict use_column
declare
  actor text := hidrantes.fn_exigir_admin();
  id_s uuid;
begin
  perform hidrantes.fn_validar_suscripcion(fn_guardar_suscripcion_push_admin.suscripcion);
  if coalesce(fn_guardar_suscripcion_push_admin.temas, '{}') = '{}'
     or not fn_guardar_suscripcion_push_admin.temas <@ array['nuevas_propuestas', 'resumen_semanal', 'avisos_tecnicos'] then
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

-- Aviso técnico a jefatura (DEC-202). Devuelve si ha encolado al menos una notificación. Sin
-- peticiones de red: la envía /api/push en su siguiente vuelta.
create or replace function hidrantes.fn_encolar_aviso_tecnico(clave text, titulo text, cuerpo text,
                                                               url text default '/admin/ajustes') returns boolean
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes
set lock_timeout = '5s' as $$
declare
  texto_fijo text;
  t text := nullif(trim(fn_encolar_aviso_tecnico.titulo), '');
  c text := nullif(trim(fn_encolar_aviso_tecnico.cuerpo), '');
  u text := coalesce(nullif(trim(fn_encolar_aviso_tecnico.url), ''), '/admin/ajustes');
  plazo interval;
  ultimo timestamptz;
  n integer;
begin
  -- Los textos fijos de cada clave (06, Apéndice A).
  texto_fijo := case fn_encolar_aviso_tecnico.clave
    when 'vigilancia' then 'La comprobación diaria ha encontrado un problema. El desarrollador ya tiene el aviso. Mira Salud del sistema.'
    when 'respaldo' then 'El respaldo de esta semana ha fallado.'
    when 'despliegue' then 'La última actualización no se ha podido instalar entera.'
    when 'intentos_codigo' then 'Alguien está probando códigos de acceso. Si se repite, cambia el código en Ajustes.'
  end;
  if texto_fijo is null then
    perform hidrantes.fn_error('PAYLOAD_INVALIDO(clave)', 'Clave de aviso no admitida');
  end if;
  if length(t) > 80 then
    perform hidrantes.fn_error('PAYLOAD_INVALIDO(titulo)', 'El título tiene como mucho 80 caracteres');
  end if;
  if length(c) > 300 then
    perform hidrantes.fn_error('PAYLOAD_INVALIDO(cuerpo)', 'El texto tiene como mucho 300 caracteres');
  end if;
  -- Solo una ruta de la propia app.
  if u !~ '^/[A-Za-z0-9_-][A-Za-z0-9/_?=&.-]*$' or length(u) > 200 then
    perform hidrantes.fn_error('PAYLOAD_INVALIDO(url)', 'La dirección es una ruta de la app');
  end if;
  plazo := case when fn_encolar_aviso_tecnico.clave = 'intentos_codigo' then interval '1 hour'
                else interval '24 hours' end;

  -- La fila de la clave, bloqueada: dos llamadas a la vez no encolan dos veces.
  insert into hidrantes.avisos_tecnicos (clave, ultimo_en)
  values (fn_encolar_aviso_tecnico.clave, null)
  on conflict do nothing;
  select a.ultimo_en into ultimo
    from hidrantes.avisos_tecnicos a
   where a.clave = fn_encolar_aviso_tecnico.clave
     for update;
  if ultimo is not null and ultimo > now() - plazo then
    return false;
  end if;

  -- Solo jefatura (fila sin dispositivo) de un administrador activo, con el tema. Ninguna de voluntario.
  insert into hidrantes.notificaciones (suscripcion_id, titulo, cuerpo, url)
  select s.id, coalesce(t, 'Aviso técnico'), coalesce(c, texto_fijo), u
    from hidrantes.suscripciones_push s
    join hidrantes.administradores a on a.email = s.email and a.activo
   where s.dispositivo_id is null and 'avisos_tecnicos' = any (s.temas);
  get diagnostics n = row_count;
  if n = 0 then
    -- Sin nadie a quien avisar no cuenta como emitido: el siguiente intento vuelve a probar.
    return false;
  end if;
  update hidrantes.avisos_tecnicos a set ultimo_en = now() where a.clave = fn_encolar_aviso_tecnico.clave;
  return true;
end $$;

revoke all on function hidrantes.fn_encolar_aviso_tecnico(text, text, text, text) from public, anon, authenticated;
grant execute on function hidrantes.fn_encolar_aviso_tecnico(text, text, text, text) to service_role;
