-- 0016 · Las RPC que bloquean filas esperan un bloqueo como mucho 5 s, y un bloqueo en una
-- propuesta no tumba el lote entero (docs/17 RV-17, 05 §11).
--
-- `set statement_timeout` como atributo de una función no reprograma el temporizador de la
-- sentencia en curso: no hacía nada. Y fn_aprobar_lote solo capturaba raise_exception, así que una
-- espera de bloqueo larga o un interbloqueo en una propuesta abortaba todo el lote sin código.
-- Ahora lock_timeout de 5 s en todas las RPC de escritura que bloquean filas; en el lote, la que no
-- consigue su punto se omite con PUNTO_OCUPADO y siguen las demás. fn_proponer ya lo lleva (0013).
--
-- Solo atributos y el cuerpo de fn_aprobar_lote, con las mismas firmas (04 §12).

alter function hidrantes.fn_aplicar_propuesta(uuid, jsonb, boolean, text) reset statement_timeout;
alter function hidrantes.fn_aplicar_propuesta(uuid, jsonb, boolean, text) set lock_timeout = '5s';
alter function hidrantes.fn_rechazar(uuid, text) set lock_timeout = '5s';
alter function hidrantes.fn_fusionar_con_existente(uuid, uuid, jsonb) set lock_timeout = '5s';
alter function hidrantes.fn_editar_punto(uuid, jsonb) set lock_timeout = '5s';
alter function hidrantes.fn_retirar_punto(uuid, text) set lock_timeout = '5s';
alter function hidrantes.fn_borrar_punto(uuid, text) set lock_timeout = '5s';
alter function hidrantes.fn_restaurar_punto(uuid) set lock_timeout = '5s';
alter function hidrantes.fn_gestionar_administrador(text, boolean) set lock_timeout = '5s';
alter function hidrantes.fn_guardar_config(jsonb) set lock_timeout = '5s';
alter function hidrantes.fn_retirar_propuesta(text, uuid) set lock_timeout = '5s';

-- Cada una en su propio savepoint, en orden de id (sin interbloqueos): una que falle no tumba el
-- lote (FR-107, 05 §11). Una que no consigue el bloqueo de su punto en 5 s, o que cae en un
-- interbloqueo, se omite con PUNTO_OCUPADO (RV-17).
create or replace function hidrantes.fn_aprobar_lote(propuesta_ids uuid[])
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
    exception
      when raise_exception then
        propuesta_id := id_p; resultado := 'omitida'; motivo := split_part(sqlerrm, ':', 1);
      when lock_not_available or deadlock_detected then
        propuesta_id := id_p; resultado := 'omitida'; motivo := 'PUNTO_OCUPADO';
    end;
    return next;
  end loop;
end $$;
