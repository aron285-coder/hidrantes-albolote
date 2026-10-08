-- docs/31 RV-149: qué ejecuta `authenticated` y qué pasa si lo intenta alguien que no es jefatura.
-- 02_permisos fija la lista de anon; esta fija la de authenticated. Una RPC nueva SECURITY DEFINER
-- concedida a authenticated sin fn_exigir_admin hace fallar este archivo en CI: primero porque no
-- está en la lista, y después porque el bucle la llama sin sesión de administrador.
-- Todo dentro de una transacción que se deshace.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;

select plan(11);

-- Las que authenticated puede ejecutar sin ser jefatura, por firma (una sobrecarga nueva de un
-- nombre exento no se cuela), y por qué no lanzan NO_AUTORIZADO:
--  · fn_es_admin: es la pregunta misma; las políticas de RLS la evalúan con el rol de quien consulta.
--  · fn_config, fn_radio_px, fn_municipio_de: ayudantes de las vistas security_invoker (0003,
--    DEC-058). Son SECURITY INVOKER: leen con la RLS de quien llama, y config sale vacía para un
--    no administrador (se comprueba abajo).
--  · las RPC de voluntario: también las tiene anon (02_permisos), porque jefatura usa la misma app
--    (FR-150). No las protege la sesión sino el token del dispositivo (05_rpc_voluntario y
--    13_codigo_acceso prueban el token). fn_registrar_error no pide token: es la telemetría de
--    errores, abierta y con tope diario (05 §6.1).
--  · fn_novedades (obsoleta, sin fn_exigir_admin) ya no se concede desde 0040 (RV-149);
--    fn_cerrar_sesion (0040, RV-158) es de voluntario, con token. fn_reportar_incidencia se quitó en
--    0040 y vuelve en 0041 (docs/32 RV-223) como sumidero SECURITY INVOKER que no toca nada, para la
--    app 0.7.0; se quita con #472.
create temp table exentas (firma text primary key, motivo text not null);
insert into exentas values
  ('hidrantes.fn_es_admin()', 'ayudante de RLS'),
  ('hidrantes.fn_config(text,jsonb)', 'ayudante de vistas'),
  ('hidrantes.fn_radio_px(smallint,hidrantes.estado_caudal)', 'ayudante de vistas'),
  ('hidrantes.fn_municipio_de(geography)', 'ayudante de vistas'),
  ('hidrantes.fn_listar_puntos(text,timestamp with time zone)', 'voluntario, con token'),
  ('hidrantes.fn_ficha_punto(text,uuid)', 'voluntario, con token'),
  ('hidrantes.fn_proponer(text,text,text,text,hidrantes.operacion,uuid,jsonb,hidrantes.origen_ubicacion,double precision,double precision,double precision,double precision,real,double precision,double precision,text)',
   'voluntario, con token (firma anterior a 0035)'),
  ('hidrantes.fn_proponer(text,text,text,text,hidrantes.operacion,uuid,jsonb,hidrantes.origen_ubicacion,double precision,double precision,double precision,double precision,real,double precision,double precision,text,text)',
   'voluntario, con token'),
  ('hidrantes.fn_mis_propuestas(text)', 'voluntario, con token'),
  ('hidrantes.fn_retirar_propuesta(text,uuid)', 'voluntario, con token'),
  ('hidrantes.fn_cerrar_sesion(text)', 'voluntario, con token (0040, RV-158)'),
  ('hidrantes.fn_guardar_suscripcion_push(text,jsonb,text[])', 'voluntario, con token'),
  ('hidrantes.fn_borrar_suscripcion_push(text)', 'voluntario, con token'),
  ('hidrantes.fn_registrar_error(uuid,text,text,text,text)', 'telemetría de errores, con tope diario'),
  ('hidrantes.fn_reportar_incidencia(text,text,text,text)', 'sumidero para la app 0.7.0 (0041, RV-223)');

-- Las de jefatura: cada una empieza por fn_exigir_admin.
create temp table jefatura (nombre text primary key);
insert into jefatura values
  -- 0007
  ('fn_aprobar'), ('fn_aprobar_lote'), ('fn_rechazar'), ('fn_fusionar_con_existente'),
  ('fn_editar_punto'), ('fn_retirar_punto'), ('fn_borrar_punto'), ('fn_restaurar_punto'), ('fn_purgar_papelera'),
  ('fn_cambiar_codigo_acceso'), ('fn_gestionar_administrador'), ('fn_guardar_config'),
  ('fn_resolver_incidencia'), ('fn_actividad_voluntarios'), ('fn_anonimizar_autor'), ('fn_historial_punto'),
  ('fn_salud'), ('fn_exportar_inventario'), ('fn_guardar_suscripcion_push_admin'),
  ('fn_guardar_direccion_sugerida'), ('fn_registrar_workflow'), ('fn_reservar_subida_admin'),
  -- 0009
  ('fn_renombrar_nucleo'), ('fn_anadir_nucleo'),
  -- 0040 (docs/31 RV-146, RV-167)
  ('fn_pedir_trabajo'), ('fn_borrar_suscripcion_push_admin'),
  -- 0041 (docs/32 RV-225, RV-260, RV-262)
  ('fn_suscripcion_push_admin'), ('fn_pedidos_recientes'), ('fn_revocar_dispositivo');

-- ---------- la lista exacta ----------

select set_eq(
  $$ select distinct p.proname::text from pg_proc p where p.pronamespace = 'hidrantes'::regnamespace
       and has_function_privilege('authenticated', p.oid, 'execute') $$,
  $$ select split_part(regexp_replace(firma, '^hidrantes\.', ''), '(', 1) from exentas
     union select nombre from jefatura $$,
  'authenticated ejecuta exactamente los ayudantes, las RPC de voluntario y las de jefatura (05 §6)'
);
select set_eq(
  $$ select p.oid::regprocedure::text from pg_proc p where p.pronamespace = 'hidrantes'::regnamespace
       and has_function_privilege('authenticated', p.oid, 'execute')
       and p.proname::text not in (select nombre from jefatura) $$,
  $$ select firma from exentas $$,
  'las exentas, firma a firma: ninguna sobrecarga nueva de un nombre exento'
);
select is(
  (select coalesce(array_agg(p.proname::text order by p.proname), '{}') from pg_proc p
    where p.pronamespace = 'hidrantes'::regnamespace and p.prosecdef
      and has_function_privilege('authenticated', p.oid, 'execute')
      and p.proname in ('fn_config', 'fn_radio_px', 'fn_municipio_de')),
  '{}'::text[], 'los ayudantes de las vistas son SECURITY INVOKER: leen con la RLS de quien llama'
);

-- ---------- el bucle: cada RPC de jefatura, con y sin sesión de administrador ----------

-- Llama a cada función que authenticated ejecuta y no está exenta, con null en cada argumento, y
-- devuelve el código y el mensaje del error. Una función que vuelve sin error, o que falla por
-- otra cosa antes de comprobar la sesión, sale distinta de «P0001 NO_AUTORIZADO».
-- SECURITY INVOKER: corre con el rol de quien la llama.
create function pg_temp.probar_jefatura()
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
       and p.oid::regprocedure::text not in (select e.firma from exentas e)
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
      resultado := sqlstate || ' ' || sqlerrm;
    end;
    return next;
  end loop;
end $$;
grant execute on function pg_temp.probar_jefatura() to authenticated;
grant select on exentas, jefatura to authenticated;

-- «P0001 NO_AUTORIZADO: …», lo que lanza fn_exigir_admin (0005), y nada más.
create function pg_temp.es_no_autorizado(resultado text) returns boolean language sql immutable as $$
  select split_part(resultado, ':', 1) = 'P0001 NO_AUTORIZADO'
$$;
grant execute on function pg_temp.es_no_autorizado(text) to authenticated;

insert into hidrantes.administradores (email, creado_por) values ('jefa@example.com', 'test');

-- 1) Un usuario de Google que no es administrador.
select set_config('request.jwt.claims',
  '{"email":"voluntario@example.com","role":"authenticated","amr":[{"method":"oauth","timestamp":1}],"app_metadata":{"provider":"google","providers":["google"]}}',
  true);
set local role authenticated;
create temp table r_google as select * from pg_temp.probar_jefatura();
select is(
  (select coalesce(array_agg(funcion || ' → ' || resultado order by funcion), '{}') from r_google
    where not pg_temp.es_no_autorizado(resultado)),
  '{}'::text[], 'Google sin ser administrador: cada RPC de jefatura devuelve NO_AUTORIZADO'
);
-- Sin un bucle vacío que pase solo: prueba exactamente las de jefatura.
select set_eq(
  $$ select distinct split_part(regexp_replace(funcion, '^hidrantes\.', ''), '(', 1) from r_google $$,
  $$ select nombre from jefatura $$,
  'y prueba exactamente las RPC de jefatura, todas'
);
-- Las catorce que no tenían prueba negativa (docs/31 RV-149) están dentro.
select is(
  (select coalesce(array_agg(n order by n), '{}') from unnest(array[
     'fn_cambiar_codigo_acceso', 'fn_gestionar_administrador', 'fn_guardar_config',
     'fn_purgar_papelera', 'fn_borrar_punto', 'fn_restaurar_punto',
     'fn_renombrar_nucleo', 'fn_anadir_nucleo',
     'fn_guardar_direccion_sugerida', 'fn_reservar_subida_admin', 'fn_registrar_workflow',
     'fn_fusionar_con_existente', 'fn_rechazar', 'fn_aprobar_lote']) n
    where not exists (select 1 from r_google r
                       where split_part(regexp_replace(r.funcion, '^hidrantes\.', ''), '(', 1) = n)),
  '{}'::text[], 'entre ellas, las catorce que no tenían prueba negativa (docs/31 RV-149)'
);
-- Los ayudantes exentos no dan nada a quien no es jefatura.
select is(hidrantes.fn_es_admin(), false, 'fn_es_admin: false para un no administrador');
select is((select count(*)::int from hidrantes.config), 0, 'y config sale vacía: fn_config solo da su valor por defecto');
reset role;

-- 2) El correo de un administrador, pero con contraseña (no Google, docs/18 RV-36).
select set_config('request.jwt.claims',
  '{"email":"jefa@example.com","role":"authenticated","amr":[{"method":"password","timestamp":1}],"app_metadata":{"provider":"email","providers":["email"]}}',
  true);
set local role authenticated;
create temp table r_clave as select * from pg_temp.probar_jefatura();
select is(
  (select coalesce(array_agg(funcion || ' → ' || resultado order by funcion), '{}') from r_clave
    where not pg_temp.es_no_autorizado(resultado)),
  '{}'::text[], 'con el correo de jefatura pero sin Google: también NO_AUTORIZADO en todas'
);
reset role;

-- 3) Sin JWT.
select set_config('request.jwt.claims', '', true);
set local role authenticated;
create temp table r_vacio as select * from pg_temp.probar_jefatura();
select is(
  (select coalesce(array_agg(funcion || ' → ' || resultado order by funcion), '{}') from r_vacio
    where not pg_temp.es_no_autorizado(resultado)),
  '{}'::text[], 'sin JWT: también NO_AUTORIZADO en todas'
);
reset role;

-- 4) Control: con sesión de jefatura (Google), ninguna lanza NO_AUTORIZADO. Así el rechazo de
-- arriba depende de la sesión, no de que la función lo lance siempre. Con null en los argumentos
-- pueden fallar por otra cosa; lo que hagan se deshace con el rollback.
select set_config('request.jwt.claims',
  '{"email":"jefa@example.com","role":"authenticated","amr":[{"method":"oauth","timestamp":1}],"app_metadata":{"provider":"google","providers":["google"]}}',
  true);
set local role authenticated;
create temp table r_jefa as select * from pg_temp.probar_jefatura();
select is(
  (select coalesce(array_agg(funcion order by funcion), '{}') from r_jefa
    where pg_temp.es_no_autorizado(resultado)),
  '{}'::text[], 'control: con sesión de jefatura, ninguna devuelve NO_AUTORIZADO'
);
reset role;

select * from finish();
rollback;
