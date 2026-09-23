-- Esperas de bloqueo en la moderación (docs/17 RV-17, 05 §11): un punto bloqueado por otra sesión
-- no deja el lote colgado ni lo tumba entero; la que no consigue su punto se omite con PUNTO_OCUPADO.
begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
set search_path = extensions, public;

select plan(5);

select ok((select 'lock_timeout=5s' = any (proconfig) from pg_proc where proname = 'fn_aplicar_propuesta'),
  'fn_aplicar_propuesta tiene lock_timeout=5s');
select ok((select not exists (select 1 from unnest(proconfig) c where c like 'statement_timeout=%')
           from pg_proc where proname = 'fn_aplicar_propuesta'),
  'y no statement_timeout');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'hidrantes'
             and p.proname in ('fn_rechazar', 'fn_fusionar_con_existente', 'fn_editar_punto', 'fn_retirar_punto',
                               'fn_borrar_punto', 'fn_restaurar_punto', 'fn_gestionar_administrador',
                               'fn_guardar_config', 'fn_retirar_propuesta', 'fn_proponer')
             and 'lock_timeout=5s' = any (p.proconfig)), 10,
  'las RPC de escritura que bloquean filas esperan como mucho 5 s');

-- ---------- lote con un punto bloqueado por otra sesión ----------

create temp table conexion as
select format('dbname=postgres user=postgres password=postgres host=%s port=%s',
              host(inet_server_addr()), inet_server_port()) as cadena,
       array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid()] as puntos,
       array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid()] as propuestas;
select dblink_connect(s, (select cadena from conexion)) from unnest(array['b0', 'b1', 'b2']) s;

select dblink_exec('b0', format($f$
  insert into hidrantes.administradores (email, creado_por) values ('bloqueos@example.com', 'test') on conflict do nothing;
  insert into hidrantes.puntos (id, codigo, tipo, geom, diametro_mm, caudal, foto_path, municipio, fecha_ultima_revision)
  select p, 'HID-' || (8100 + i), 'hidrante', 'SRID=4326;POINT(-3.6300 37.2600)', 100, 'bueno', 'fotos/b.jpg', 'albolote',
         current_date - 30
  from unnest(%1$L::uuid[]) with ordinality as t(p, i);
  insert into hidrantes.propuestas (id, punto_id, operacion, datos, autor_nombre, autor_apellido, dispositivo_id,
                                    clave_local, foto_path, creada_en)
  select r, p, 'revision', '{}', 'Ana', 'Pérez', gen_random_uuid(), 'b-' || r, 'fotos/b-' || r || '.jpg',
         now() - interval '1 hour'
  from unnest(%2$L::uuid[], %1$L::uuid[]) as t(r, p);
$f$, (select puntos from conexion), (select propuestas from conexion)));

-- b1 bloquea el primer punto y no suelta.
select dblink_exec('b1', 'begin');
select dblink_exec('b1', format('select 1 from hidrantes.puntos where id = %L for update', (select puntos[1] from conexion)));

-- b2 aprueba las tres en lote; un statement_timeout de sesión para que el test nunca se cuelgue.
select dblink_exec('b2', 'begin');
select dblink_exec('b2', $$set local statement_timeout = '20s'$$);
select x from dblink('b2',
  $$select set_config('request.jwt.claims', '{"role":"authenticated","email":"bloqueos@example.com"}', true)$$) as t(x text);
create temp table lote as
select * from dblink('b2', format('select propuesta_id, resultado, motivo from hidrantes.fn_aprobar_lote(%L::uuid[])',
  (select propuestas from conexion))) as t(propuesta_id uuid, resultado text, motivo text);
select dblink_exec('b2', 'commit');
select dblink_exec('b1', 'rollback');

select is((select motivo from lote where propuesta_id = (select propuestas[1] from conexion)), 'PUNTO_OCUPADO',
  'la propuesta cuyo punto está bloqueado se omite con PUNTO_OCUPADO');
select is((select count(*)::int from lote where resultado = 'aprobada'), 2, 'y las otras dos se aprueban');

select dblink_exec('b0', format($f$
  delete from hidrantes.propuestas where id = any (%2$L::uuid[]);
  delete from hidrantes.puntos where id = any (%1$L::uuid[]);
$f$, (select puntos from conexion), (select propuestas from conexion)));
select dblink_disconnect(s) from unnest(array['b0', 'b1', 'b2']) s;

select * from finish();
rollback;
