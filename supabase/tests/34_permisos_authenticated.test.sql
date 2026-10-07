-- docs/31 RV-149: qué ejecuta `authenticated` y qué pasa si lo intenta alguien que no es jefatura.
-- 02_permisos fija la lista de anon; esta fija la de authenticated. Una RPC nueva SECURITY DEFINER
-- concedida a authenticated sin fn_exigir_admin hace fallar este archivo en CI: primero porque no
-- está en la lista, y después porque el bucle la llama sin sesión de administrador.
-- Todo dentro de una transacción que se deshace.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;

select plan(9);

-- Las que authenticated puede ejecutar sin ser jefatura, y por qué no lanzan NO_AUTORIZADO:
--  · fn_es_admin: es la pregunta misma; las políticas de RLS la evalúan con el rol de quien consulta.
--  · fn_config, fn_radio_px, fn_municipio_de: ayudantes de las vistas security_invoker (0003,
--    DEC-058). Son SECURITY INVOKER: leen con la RLS de quien llama, y config, límites y núcleos
--    salen vacíos para un no administrador (se comprueba abajo).
--  · las nueve RPC de voluntario: también las concede a anon (02_permisos), porque jefatura usa la
--    misma app (FR-150). No las protege la sesión sino el token del dispositivo.
--  · fn_novedades: OBSOLETA desde 0.5.0 (05, DEC-087), sin uso. SECURITY DEFINER sin
--    fn_exigir_admin: da config.novedades, lo mismo que sale del build. Avisado en #484 para
--    quitarle el permiso en una migración; cuando llegue, sale de aquí y de la lista.
create temp table exentas (nombre text primary key, motivo text not null);
insert into exentas values
  ('fn_es_admin', 'ayudante de RLS'),
  ('fn_config', 'ayudante de vistas'),
  ('fn_radio_px', 'ayudante de vistas'),
  ('fn_municipio_de', 'ayudante de vistas'),
  ('fn_listar_puntos', 'voluntario, con token'),
  ('fn_ficha_punto', 'voluntario, con token'),
  ('fn_proponer', 'voluntario, con token'),
  ('fn_mis_propuestas', 'voluntario, con token'),
  ('fn_retirar_propuesta', 'voluntario, con token'),
  ('fn_reportar_incidencia', 'voluntario, con token'),
  ('fn_guardar_suscripcion_push', 'voluntario, con token'),
  ('fn_borrar_suscripcion_push', 'voluntario, con token'),
  ('fn_registrar_error', 'voluntario, con token'),
  ('fn_novedades', 'obsoleta, solo novedades públicas (#484)');

-- ---------- la lista exacta ----------

select set_eq(
  $$ select distinct p.proname::text from pg_proc p where p.pronamespace = 'hidrantes'::regnamespace
       and has_function_privilege('authenticated', p.oid, 'execute') $$,
  array[
    -- ayudantes (0003)
    'fn_es_admin', 'fn_config', 'fn_radio_px', 'fn_municipio_de',
    -- voluntario (0007; fn_proponer con sus dos firmas desde 0035)
    'fn_listar_puntos', 'fn_ficha_punto', 'fn_proponer', 'fn_mis_propuestas', 'fn_retirar_propuesta',
    'fn_reportar_incidencia', 'fn_guardar_suscripcion_push', 'fn_borrar_suscripcion_push', 'fn_registrar_error',
    -- jefatura (0007 y 0009): cada una empieza por fn_exigir_admin
    'fn_aprobar', 'fn_aprobar_lote', 'fn_rechazar', 'fn_fusionar_con_existente',
    'fn_editar_punto', 'fn_retirar_punto', 'fn_borrar_punto', 'fn_restaurar_punto', 'fn_purgar_papelera',
    'fn_cambiar_codigo_acceso', 'fn_gestionar_administrador', 'fn_guardar_config',
    'fn_resolver_incidencia', 'fn_actividad_voluntarios', 'fn_anonimizar_autor', 'fn_historial_punto',
    'fn_salud', 'fn_exportar_inventario', 'fn_guardar_suscripcion_push_admin', 'fn_novedades',
    'fn_guardar_direccion_sugerida', 'fn_registrar_workflow', 'fn_reservar_subida_admin',
    'fn_renombrar_nucleo', 'fn_anadir_nucleo'
  ],
  'authenticated ejecuta exactamente los ayudantes, las RPC de voluntario y las de jefatura (05 §6)'
);

select is(
  (select coalesce(array_agg(p.proname::text order by p.proname), '{}') from pg_proc p
    where p.pronamespace = 'hidrantes'::regnamespace and p.prosecdef
      and has_function_privilege('authenticated', p.oid, 'execute')
      and p.proname in ('fn_config', 'fn_radio_px', 'fn_municipio_de')),
  '{}'::text[], 'los ayudantes de las vistas son SECURITY INVOKER: leen con la RLS de quien llama'
);

-- ---------- el bucle: cada RPC de jefatura, sin sesión de administrador ----------

-- Llama a cada función que authenticated ejecuta y no está exenta, con null en cada argumento, y
-- devuelve el error. Una función que vuelve sin error, o que falla por otra cosa antes de
-- comprobar la sesión, sale en la lista. SECURITY INVOKER: corre con el rol de quien la llama.
create function pg_temp.sin_jefatura()
returns table (funcion text, resultado text) language plpgsql as $$
declare
  f record;
  argumentos text;
begin
  for f in
    select p.oid, p.proname, p.proisstrict, p.proargtypes::oid[] as tipos
      from pg_proc p
     where p.pronamespace = 'hidrantes'::regnamespace
       and has_function_privilege('authenticated', p.oid, 'execute')
       and p.proname not in (select e.nombre from exentas e)
     order by p.oid::regprocedure::text
  loop
    funcion := f.oid::regprocedure::text;
    if f.proisstrict then
      -- Con null, una función STRICT ni se ejecuta: no se puede probar así. Que salga en la lista.
      resultado := 'STRICT: no se puede probar con null';
      return next;
      continue;
    end if;
    select coalesce(string_agg(format('null::%s', format_type(t.tipo, null)), ', ' order by t.n), '')
      into argumentos
      from unnest(f.tipos) with ordinality as t(tipo, n);
    begin
      execute format('select hidrantes.%I(%s)', f.proname, argumentos);
      resultado := 'sin error';
    exception when others then
      resultado := sqlerrm;
    end;
    return next;
  end loop;
end $$;
grant execute on function pg_temp.sin_jefatura() to authenticated;
grant select on exentas to authenticated;

insert into hidrantes.administradores (email, creado_por) values ('jefa@example.com', 'test');

-- 1) Un usuario de Google que no es administrador.
select set_config('request.jwt.claims',
  '{"email":"voluntario@example.com","role":"authenticated","amr":[{"method":"oauth","timestamp":1}],"app_metadata":{"provider":"google","providers":["google"]}}',
  true);
set local role authenticated;
create temp table r_google as select * from pg_temp.sin_jefatura();
select is(
  (select coalesce(array_agg(funcion || ' → ' || resultado order by funcion), '{}') from r_google
    where resultado not like 'NO_AUTORIZADO%'),
  '{}'::text[], 'Google sin ser administrador: cada RPC de jefatura devuelve NO_AUTORIZADO'
);
-- Sin un bucle vacío que pase solo: las de la lista de la spec están todas dentro.
select is(
  (select coalesce(array_agg(n order by n), '{}') from unnest(array[
     'fn_cambiar_codigo_acceso', 'fn_gestionar_administrador', 'fn_guardar_config',
     'fn_purgar_papelera', 'fn_borrar_punto', 'fn_restaurar_punto',
     'fn_renombrar_nucleo', 'fn_anadir_nucleo',
     'fn_guardar_direccion_sugerida', 'fn_reservar_subida_admin', 'fn_registrar_workflow',
     'fn_fusionar_con_existente', 'fn_rechazar', 'fn_aprobar_lote']) n
    where not exists (select 1 from r_google r where r.funcion like 'hidrantes.' || n || '(%'
                                                 or r.funcion like n || '(%')),
  '{}'::text[], 'el bucle prueba las catorce RPC que no tenían prueba negativa (docs/31 RV-149)'
);
select cmp_ok((select count(*)::int from r_google), '>=', 25, 'y prueba todas las de jefatura, no un puñado');
-- Los ayudantes exentos no dan nada a quien no es jefatura.
select is(hidrantes.fn_es_admin(), false, 'fn_es_admin: false para un no administrador');
select is((select count(*)::int from hidrantes.config), 0, 'y config sale vacía: fn_config solo da su valor por defecto');
reset role;

-- 2) El correo de un administrador, pero con contraseña (no Google, docs/18 RV-36).
select set_config('request.jwt.claims',
  '{"email":"jefa@example.com","role":"authenticated","amr":[{"method":"password","timestamp":1}],"app_metadata":{"provider":"email","providers":["email"]}}',
  true);
set local role authenticated;
create temp table r_clave as select * from pg_temp.sin_jefatura();
select is(
  (select coalesce(array_agg(funcion || ' → ' || resultado order by funcion), '{}') from r_clave
    where resultado not like 'NO_AUTORIZADO%'),
  '{}'::text[], 'con el correo de jefatura pero sin Google: también NO_AUTORIZADO en todas'
);
reset role;

-- 3) Sin JWT.
select set_config('request.jwt.claims', '', true);
set local role authenticated;
create temp table r_vacio as select * from pg_temp.sin_jefatura();
select is(
  (select coalesce(array_agg(funcion || ' → ' || resultado order by funcion), '{}') from r_vacio
    where resultado not like 'NO_AUTORIZADO%'),
  '{}'::text[], 'sin JWT: también NO_AUTORIZADO en todas'
);
reset role;

select * from finish();
rollback;
