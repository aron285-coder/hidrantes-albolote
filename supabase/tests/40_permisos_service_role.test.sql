-- docs/33 RV-305 (seguimiento de D1, #561): service_role puede ejecutar cada RPC que las Pages
-- Functions y los scripts llaman sin JWT de usuario. D1 pasó porque /api/push llamaba a
-- fn_listar_puntos con service_role y nadie comprobaba ese permiso.
--
-- La lista la saca scripts/rpc-de-servicio.ts de functions/** y scripts/**; scripts/rpc-de-servicio.test.ts
-- falla si esta lista o el plan no coinciden con lo que encuentra. Para añadir una RPC: una fila más
-- aquí y plan + 1.
--
-- `argumentos`: con sobrecargas, basta con que service_role ejecute una; si es nulo, cualquiera.
-- fn_registrar_error tiene dos: la de cinco argumentos es la del navegador y la de seis (ip_hash, 0040)
-- la de service_role, que es la que llaman /api/error, /api/direccion y validarToken.
-- Todo dentro de una transacción que se deshace.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;

select plan(12);

with rpc_de_servicio(nombre, argumentos) as (values
  ('fn_aplazar_notificaciones', null::int),
  ('fn_fotos_referenciadas', null),
  ('fn_fotos_referenciadas_lista', null),
  ('fn_marcar_pedido', null),
  ('fn_pedidos_pendientes', null),
  ('fn_reclamar_notificaciones', null),
  ('fn_registrar_error', 6),
  ('fn_reservar_subida', null),
  ('fn_reservas_sin_confirmar_lista', null),
  ('fn_resultado_notificacion', null),
  ('fn_validar_token', null),
  ('fn_verificar_codigo', null)
) select ok(
    exists (
      select 1
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hidrantes'
         and p.proname = r.nombre
         and (r.argumentos is null or p.pronargs = r.argumentos)
         and has_function_privilege('service_role', p.oid, 'execute')
    ),
    format('service_role ejecuta hidrantes.%s%s', r.nombre,
           coalesce(format(' (la de %s argumentos)', r.argumentos), ''))
  )
  from rpc_de_servicio r
 order by r.nombre;

select * from finish();
rollback;
