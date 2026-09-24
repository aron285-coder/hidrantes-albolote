-- 0009 · Núcleos gestionables desde Ajustes (FR-166) y resumen semanal de jefatura (FR-164).
-- DEC-068.

-- El registro gana una acción: renombrar o añadir un núcleo (05 §8).
alter table hidrantes.registro drop constraint registro_accion_check;
alter table hidrantes.registro add constraint registro_accion_check check (accion in (
  'propuesta_creada', 'propuesta_retirada_autor', 'aprobacion', 'aprobacion_con_correcciones',
  'rechazo', 'fusion', 'edicion_admin', 'retirada', 'borrado', 'restauracion', 'purga_papelera',
  'codigo_cambiado', 'dispositivos_revocados', 'administrador_alta', 'administrador_baja',
  'config_cambiada', 'incidencia_resuelta', 'anonimizacion', 'exportacion', 'workflow_lanzado',
  'nucleo_guardado'
));

-- ---------- núcleos ----------

-- Nombre que trajo OpenStreetMap, para que cargar-zona.ts no resucite el que jefatura renombró.
alter table hidrantes.nucleos add column if not exists nombre_osm text;
-- Un núcleo añadido a mano no viene de ninguna versión de la zona.
alter table hidrantes.nucleos add column if not exists manual boolean not null default false;

-- Renombrar un núcleo: arrastra los puntos que lo tienen y recuerda el nombre de origen.
create function hidrantes.fn_renombrar_nucleo(nombre_actual text, nombre_nuevo text) returns void
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes as $$
declare
  actor text := hidrantes.fn_exigir_admin();
  nuevo text := trim(nombre_nuevo);
  n hidrantes.nucleos;
begin
  if length(nuevo) between 2 and 60 is not true then
    perform hidrantes.fn_error('PAYLOAD_INVALIDO(nombre)', 'El nombre tiene entre 2 y 60 caracteres');
  end if;
  select * into n from hidrantes.nucleos x where x.nombre = nombre_actual for update;
  if not found then
    perform hidrantes.fn_error('PAYLOAD_INVALIDO(nucleo)', 'Ese núcleo no existe');
  end if;
  if nuevo = nombre_actual then
    return;
  end if;
  if exists (select 1 from hidrantes.nucleos x where x.nombre = nuevo) then
    perform hidrantes.fn_error('PAYLOAD_INVALIDO(nombre)', 'Ya hay un núcleo con ese nombre');
  end if;
  update hidrantes.nucleos x
     set nombre = nuevo, nombre_osm = case when x.manual then null else coalesce(x.nombre_osm, x.nombre) end
   where x.nombre = nombre_actual;
  update hidrantes.puntos p set nucleo = nuevo where p.nucleo = nombre_actual;
  perform hidrantes.fn_registrar(actor, null, true, 'nucleo_guardado', null, null,
                                 jsonb_build_object('nombre', nombre_actual),
                                 jsonb_build_object('nombre', nuevo));
end $$;

-- Añadir el núcleo que la fuente pública no trae (FR-166). Necesita dónde está: el municipio y el
-- núcleo de cada punto se deducen por cercanía (05 §6.3), así que un núcleo sin geometría no serviría.
create function hidrantes.fn_anadir_nucleo(nombre text, lat double precision, lng double precision) returns void
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes, extensions as $$
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
  -- Los puntos activos que ahora caen más cerca del núcleo nuevo pasan a él.
  update hidrantes.puntos p
     set nucleo = (select m.nucleo from hidrantes.fn_municipio_de(p.geom) m)
   where p.situacion <> 'borrado' and p.municipio = zona.municipio;
  perform hidrantes.fn_registrar(actor, null, true, 'nucleo_guardado', null, null, null,
                                 jsonb_build_object('nombre', limpio, 'municipio', zona.municipio));
end $$;

grant execute on function hidrantes.fn_renombrar_nucleo(text, text) to authenticated;
grant execute on function hidrantes.fn_anadir_nucleo(text, double precision, double precision) to authenticated;

-- ---------- resumen semanal para jefatura (FR-164) ----------

-- Un aviso por suscripción con lo que hay pendiente: caducadas y propuestas antiguas. Sin nombres
-- de personas (FR-27). Lo encola pg_cron los lunes; lo envía /api/push en la siguiente llamada.
create function hidrantes.fn_encolar_resumen_semanal() returns integer
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
  where s.email is not null and 'resumen_semanal' = any (s.temas);
  get diagnostics n = row_count;
  return n;
end $$;

select cron.schedule('hidrantes_resumen_semanal', '5 6 * * 1', $$select hidrantes.fn_encolar_resumen_semanal()$$);
