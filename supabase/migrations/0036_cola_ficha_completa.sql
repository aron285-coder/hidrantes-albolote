-- 0036 · La cola trae el punto entero y su posición, y el historial tiene su vista (docs/25 RV-110,
-- DEC-160, FR-103, FR-109).
--
-- El detalle nuevo de la cola enseña todos los datos del punto, no solo los que cambian, y un mapa
-- en las seis operaciones:
--   1. v_cola_revision: tres columnas nuevas AL FINAL (create or replace view no deja otra cosa, y
--      así el panel anterior, que pide select('*'), no ve nada roto; 04 §12):
--        punto      jsonb con una lista CERRADA de claves (nunca to_jsonb(p): una columna nueva de
--                   puntos no aparece sola, y nada de FR-27 se cuela);
--        punto_lat, punto_lng  la posición actual del punto.
--      En un alta, las tres null: no hay punto (punto_id es null también después de aprobarla).
--   2. v_historial_revision (nueva): lo decidido, con las mismas tres columnas, para el detalle en
--      solo lectura. Sin antes ni señales: el punto de hoy ya no es el de entonces.
-- La UTM no viaja: la calcula el cliente (RV-109).

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
  case when p.id is not null then p.nucleo
       when r.geom is not null then (select m.nucleo from hidrantes.fn_municipio_de(r.geom) m) end as nucleo,
  p.actualizado_en as punto_actualizado_en,
  -- 0035: las dos fotos del sitio y la señal de la app anterior
  r.foto_sitio_path,
  p.foto_sitio_path as foto_sitio_path_actual,
  (r.operacion in ('alta', 'ubicacion') and r.foto_sitio_path is null) as sin_foto_sitio,
  -- nuevas en 0036: el punto entero y su posición
  case when p.id is not null then jsonb_build_object(
    'codigo', p.codigo, 'tipo', p.tipo, 'diametro_mm', p.diametro_mm, 'caudal', p.caudal,
    'racor', p.racor, 'descripcion', p.descripcion, 'descripcion_fallo', p.descripcion_fallo,
    'direccion', p.direccion, 'nucleo', p.nucleo, 'fecha_ultima_revision', p.fecha_ultima_revision,
    'foto_path', p.foto_path, 'foto_sitio_path', p.foto_sitio_path) end as punto,
  extensions.st_y(p.geom::extensions.geometry) as punto_lat,
  extensions.st_x(p.geom::extensions.geometry) as punto_lng
from hidrantes.propuestas r
left join hidrantes.puntos p on p.id = r.punto_id
left join hidrantes.puntos d on d.id = r.duplicado_de
where r.estado = 'pendiente';

create or replace view hidrantes.v_historial_revision with (security_invoker = true) as
select
  r.id, r.operacion, r.estado, r.creada_en, r.autor_nombre, r.autor_apellido,
  r.punto_id, p.codigo, r.datos, r.foto_path, r.foto_sitio_path,
  r.direccion_sugerida, p.direccion as direccion_actual,
  extensions.st_y(r.geom::extensions.geometry) as lat,
  extensions.st_x(r.geom::extensions.geometry) as lng,
  r.origen_ubicacion, r.precision_gps_m,
  case when p.id is not null then p.nucleo
       when r.geom is not null then (select m.nucleo from hidrantes.fn_municipio_de(r.geom) m) end as nucleo,
  r.motivo_rechazo, r.correcciones, r.revisada_por, r.revisada_en,
  -- las mismas que v_cola_revision (0036)
  case when p.id is not null then jsonb_build_object(
    'codigo', p.codigo, 'tipo', p.tipo, 'diametro_mm', p.diametro_mm, 'caudal', p.caudal,
    'racor', p.racor, 'descripcion', p.descripcion, 'descripcion_fallo', p.descripcion_fallo,
    'direccion', p.direccion, 'nucleo', p.nucleo, 'fecha_ultima_revision', p.fecha_ultima_revision,
    'foto_path', p.foto_path, 'foto_sitio_path', p.foto_sitio_path) end as punto,
  extensions.st_y(p.geom::extensions.geometry) as punto_lat,
  extensions.st_x(p.geom::extensions.geometry) as punto_lng
from hidrantes.propuestas r
left join hidrantes.puntos p on p.id = r.punto_id
where r.estado <> 'pendiente';

-- Privilegios explícitos (05 §5, docs/19 RV-70): lo mismo que el resto de vistas. La fila la filtra
-- la política de propuestas y puntos (fn_es_admin), porque la vista es security_invoker.
revoke all on hidrantes.v_historial_revision from public, anon;
grant select on hidrantes.v_historial_revision to authenticated, service_role;
