-- Guarda en config.tareas_programadas la lista que da tareas-programadas.sql (TR-54, docs/18 RV-38).
-- La lanza vigilancia.yml con `psql -v valor="$tareas" -f scripts/sql/guardar-tareas.sql`: psql
-- sustituye :'valor' en un archivo, no en -c, que es donde se perdía sin decir nada.
insert into hidrantes.config (clave, valor, actualizado_por)
values ('tareas_programadas', :'valor'::jsonb, 'vigilancia.yml')
on conflict (clave) do update set valor = excluded.valor, actualizado_por = excluded.actualizado_por;
