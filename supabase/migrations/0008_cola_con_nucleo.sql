-- 0008 · La cola de revisión nombra el núcleo de cada propuesta (FR-101, DEC-065).
-- Para un punto existente, el suyo; para un alta, el que se deduce del pin. Las columnas nuevas van
-- al final: create or replace view no admite reordenar las que ya existen (04 §12).

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
  coalesce(p.actualizado_en > r.creada_en, false) as desactualizada,
  -- nuevas en 0008
  case when p.id is not null then p.nucleo
       when r.geom is not null then (select m.nucleo from hidrantes.fn_municipio_de(r.geom) m) end as nucleo,
  p.actualizado_en as punto_actualizado_en
from hidrantes.propuestas r
left join hidrantes.puntos p on p.id = r.punto_id
left join hidrantes.puntos d on d.id = r.duplicado_de
where r.estado = 'pendiente';
