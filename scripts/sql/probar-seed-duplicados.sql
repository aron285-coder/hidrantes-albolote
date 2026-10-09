-- docs/33 RV-340: prueba del bloque del seed de staging que retira las cuatro bocas duplicadas de
-- RV-139b. Solo en la CI (ci-sql), contra el Supabase local efímero. Crea las cuatro bocas como las
-- dejó RV-139b (activas, el 8 oct 2026, en el mismo sitio) y una quinta, BOC-0008, en el mismo sitio
-- pero fuera de la lista, que no se debe tocar. Después la CI carga el seed dos veces y comprueba
-- con verificar-seed-duplicados.sql.

\set ON_ERROR_STOP on
begin;
insert into hidrantes.puntos
  (id, codigo, tipo, geom, diametro_mm, caudal, racor, descripcion, foto_path, municipio, nucleo, situacion,
   fecha_ultima_revision, creado_en, actualizado_en)
select ('5eed0000-0000-4000-8000-0000000d0' || lpad(n::text, 3, '0'))::uuid,
       'BOC-' || lpad(n::text, 4, '0'), 'boca_riego',
       'SRID=4326;POINT(-3.660000 37.240000)', 45, 'bueno', 'directo', '[PRUEBA] RV-139b', 'fotos/prueba-rv139b.jpg',
       'albolote', 'Albolote', 'activo', date '2026-10-08',
       timestamptz '2026-10-08 10:00+00', timestamptz '2026-10-08 10:00+00'
  from unnest(array[3, 4, 5, 6, 8]) n;
commit;
