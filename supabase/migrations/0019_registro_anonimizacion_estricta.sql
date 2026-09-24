-- 0019 · La excepción del registro de solo añadir admite un único valor de `actor`: el que escribe
-- fn_anonimizar_autor (docs/17 RV-26, 11 §7). Antes, con hidrantes.anonimizando activo, se podía
-- reescribir `actor` a cualquier texto; solo los roles propietarios tienen UPDATE, pero la segunda
-- capa también debe limitar el valor. Misma firma: el trigger sigue apuntando a esta función.
create or replace function hidrantes.tg_registro_inmutable() returns trigger
language plpgsql set search_path = pg_catalog as $$
begin
  if tg_op = 'UPDATE'
     and coalesce(current_setting('hidrantes.anonimizando', true), '') = 'on'
     and new.actor = 'voluntario dado de baja'
     and (new.id, new.momento, new.dispositivo_id, new.es_admin, new.accion, new.punto_id,
          new.propuesta_id, new.antes, new.despues)
         is not distinct from
         (old.id, old.momento, old.dispositivo_id, old.es_admin, old.accion, old.punto_id,
          old.propuesta_id, old.antes, old.despues)
  then
    return new;
  end if;
  raise exception using errcode = 'P0001', message = 'REGISTRO_INMUTABLE: el registro no se modifica ni se borra';
end $$;
