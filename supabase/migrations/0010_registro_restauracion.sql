-- El registro admite una acción más: la restauración de un respaldo (15 §5.3). La escribe
-- scripts/restaurar.ts dentro de la misma transacción que restaura el esquema, para que quede
-- constancia de que alguien lo hizo y de qué archivo salió (11 §6).
alter table hidrantes.registro drop constraint registro_accion_check;
alter table hidrantes.registro add constraint registro_accion_check check (accion in (
  'propuesta_creada', 'propuesta_retirada_autor', 'aprobacion', 'aprobacion_con_correcciones',
  'rechazo', 'fusion', 'edicion_admin', 'retirada', 'borrado', 'restauracion', 'purga_papelera',
  'codigo_cambiado', 'dispositivos_revocados', 'administrador_alta', 'administrador_baja',
  'config_cambiada', 'incidencia_resuelta', 'anonimizacion', 'exportacion', 'workflow_lanzado',
  'nucleo_guardado', 'restauracion_respaldo'
));
