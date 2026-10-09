-- docs/33 RV-340: después de probar-seed-duplicados.sql y de cargar el seed dos veces, las cuatro
-- bocas de la lista están retiradas con motivo «prueba», cada una con una sola entrada en el Registro
-- (la segunda carga no hace nada), y BOC-0008, fuera de la lista, sigue activa. Falla con un error si
-- no es así.

\set ON_ERROR_STOP on
do $$
declare
  retiradas int;
  entradas int;
  otra text;
begin
  select count(*) into retiradas
    from hidrantes.puntos
   where codigo in ('BOC-0003', 'BOC-0004', 'BOC-0005', 'BOC-0006') and situacion = 'retirado';
  select count(*) into entradas
    from hidrantes.registro r
    join hidrantes.puntos p on p.id = r.punto_id
   where p.codigo in ('BOC-0003', 'BOC-0004', 'BOC-0005', 'BOC-0006')
     and r.accion = 'retirada' and r.es_admin and r.despues ->> 'motivo' = 'prueba';
  select situacion::text into otra from hidrantes.puntos where codigo = 'BOC-0008';
  raise notice 'retiradas: %, entradas en el Registro: %, BOC-0008: %', retiradas, entradas, otra;
  if retiradas <> 4 or entradas <> 4 or otra is distinct from 'activo' then
    raise exception 'RV-340: se esperaban 4 bocas retiradas con 4 entradas «prueba» y BOC-0008 activa';
  end if;
end $$;
