-- 0002 · Helpers y vistas security_invoker (05 §4, §6.3; 06 §4).
-- Las vistas se evalúan con los permisos de quien consulta: sin política en la tabla base no
-- devuelven nada (0003). Las RPC SECURITY DEFINER las leen como propietario.

-- ---------- Helpers ----------

-- ¿El JWT de la petición es de un administrador activo? (05 §6.3, FR-37)
-- Lee el JWT de PostgREST sin depender del esquema auth (DEC-055.8).
create function hidrantes.fn_es_admin() returns boolean
language sql stable security definer set search_path = pg_catalog, hidrantes as $$
  select exists (
    select 1
    from hidrantes.administradores a
    where a.activo
      and a.email = lower(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
  );
$$;

-- Las políticas de RLS la evalúan con el rol de quien consulta: authenticated necesita execute.
grant execute on function hidrantes.fn_es_admin() to authenticated;

-- Valor de config con respaldo por defecto (0004 carga los valores iniciales).
create function hidrantes.fn_config(clave text, por_defecto jsonb) returns jsonb
language sql stable set search_path = pg_catalog, hidrantes as $$
  select coalesce((select c.valor from hidrantes.config c where c.clave = fn_config.clave), por_defecto);
$$;

-- Radio del marcador según 06 §4.1, con los radios de config.escala_radios.
create function hidrantes.fn_radio_px(diametro_mm smallint, caudal hidrantes.estado_caudal) returns numeric
language sql stable set search_path = pg_catalog, hidrantes as $$
  with p as (
    select (case diametro_mm when 100 then 3 when 70 then 2 when 45 then 1 else 0 end)
         * (case caudal when 'bueno' then 1.0 when 'regular' then 0.66 when 'malo' then 0.33 else 0 end)
           as puntuacion,
           hidrantes.fn_config('escala_radios', '[11, 9, 7, 5.5, 5]') as r
  )
  select ((p.r ->> case
            when p.puntuacion >= 3.0 then 0
            when p.puntuacion >= 1.9 then 1
            when p.puntuacion >= 0.9 then 2
            when p.puntuacion > 0    then 3
            else 4
          end))::numeric
  from p;
$$;

-- Municipio y núcleo de una coordenada (05 §6.3, DEC-057). "Fuera de zona" = a más de
-- buffer_zona_m de todo término; en el margen, el término más cercano. Núcleo: el más cercano
-- del municipio a menos de 1.500 m; si no hay, 'diseminado'.
create function hidrantes.fn_municipio_de(punto extensions.geography)
returns table (municipio hidrantes.municipio, nucleo text)
language sql stable set search_path = pg_catalog, hidrantes, extensions as $$
  with margen as (
    select (hidrantes.fn_config('buffer_zona_m', '400') #>> '{}')::double precision as m
  ),
  termino as (
    select l.municipio
    from hidrantes.limite_municipal l, margen
    where st_dwithin(l.geom, punto, margen.m)
    order by st_distance(l.geom, punto), l.municipio
    limit 1
  )
  select coalesce(t.municipio, 'fuera_de_zona'::hidrantes.municipio),
         case when t.municipio is null then null
              else coalesce((
                select n.nombre
                from hidrantes.nucleos n
                where n.municipio = t.municipio and st_dwithin(n.geom, punto, 1500)
                order by st_distance(n.geom, punto), n.nombre
                limit 1
              ), 'diseminado')
         end
  from (select 1) uno
  left join termino t on true;
$$;

-- ---------- Vistas ----------

-- Lo que ve el mapa (FR-60–FR-66). Sin columnas de autor (FR-27): puntos no las tiene.
-- La URL pública de la foto la compone el cliente con foto_path (DEC-058).
create view hidrantes.v_puntos_activos with (security_invoker = true) as
select
  p.id, p.codigo, p.tipo, p.diametro_mm, p.caudal, p.racor, p.descripcion_fallo, p.descripcion,
  p.direccion, p.foto_path, p.municipio, p.nucleo, p.fecha_ultima_revision, p.actualizado_en,
  extensions.st_y(p.geom::extensions.geometry) as lat,
  extensions.st_x(p.geom::extensions.geometry) as lng,
  hidrantes.fn_radio_px(p.diametro_mm, p.caudal) as radio_px,
  p.fecha_ultima_revision
    < (current_date - make_interval(months => (hidrantes.fn_config('meses_revision', '12') #>> '{}')::int))::date
    as revision_caducada
from hidrantes.puntos p
where p.situacion = 'activo';

-- Cola de revisión (FR-100–FR-110): diff y señales de fiabilidad (FR-104).
create view hidrantes.v_cola_revision with (security_invoker = true) as
select
  r.id, r.operacion, r.estado, r.creada_en, r.autor_nombre, r.autor_apellido, r.dispositivo_id,
  r.punto_id, p.codigo, p.tipo as tipo_actual, r.datos, r.foto_path, p.foto_path as foto_path_actual,
  r.direccion_sugerida, p.direccion as direccion_actual,
  extensions.st_y(r.geom::extensions.geometry) as lat,
  extensions.st_x(r.geom::extensions.geometry) as lng,
  -- diff: lo que la propuesta cambia, frente al estado actual del punto
  (select jsonb_object_agg(k, to_jsonb(p) -> k)
     from jsonb_object_keys(r.datos) k
    where to_jsonb(p) ? k) as antes,
  r.datos as despues,
  -- señales
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
  coalesce(p.actualizado_en > r.creada_en, false) as desactualizada
from hidrantes.propuestas r
left join hidrantes.puntos p on p.id = r.punto_id
left join hidrantes.puntos d on d.id = r.duplicado_de
where r.estado = 'pendiente';

-- Revisiones caducadas por núcleo (FR-120–FR-122, hoja de campo).
create view hidrantes.v_revisiones_caducadas with (security_invoker = true) as
select v.id, v.codigo, v.tipo, v.diametro_mm, v.caudal, v.direccion, v.lat, v.lng,
       v.municipio, coalesce(v.nucleo, 'diseminado') as nucleo, v.fecha_ultima_revision
from hidrantes.v_puntos_activos v
where v.revision_caducada;

-- Registro legible (FR-123).
create view hidrantes.v_registro with (security_invoker = true) as
select
  g.id, g.momento, g.actor, g.es_admin, g.accion, g.punto_id, g.propuesta_id, p.codigo,
  concat_ws(' · ', g.accion, p.codigo,
    (select string_agg(k, ', ' order by k) from jsonb_object_keys(coalesce(g.despues, '{}'::jsonb)) k)
  ) as resumen,
  g.antes, g.despues
from hidrantes.registro g
left join hidrantes.puntos p on p.id = g.punto_id;
