-- 0045 · La cuenta de jefatura queda unida a su usuario de Supabase Auth (docs/35 RV-400, DEC-197).
--
-- Hasta ahora fn_es_admin() daba jefatura a una sesión de Google cuyo correo estuviera activo en
-- administradores (0022). Desde aquí, además, la fila tiene que estar vinculada al usuario del JWT
-- (`sub`): la vincula una sola vez /api/vincular-jefatura, que comprueba la identidad de Google de
-- ese usuario en Supabase Auth, con fn_vincular_administrador (solo service_role).
--
-- 1. administradores: usuario_id (unique; null = sin vincular), vinculado_en y vinculado (generada).
-- 2. fn_usuario_jwt(): el `sub` del JWT si es un uuid. No lee auth.*: el dueño del esquema no tiene
--    permisos ahí (DEC-052), y no se piden (es el proyecto compartido con uniformidad).
-- 3. fn_es_admin(): misma firma; exige además usuario_id = fn_usuario_jwt(). fn_exigir_admin, las
--    políticas de RLS (0003) y las ramas de jefatura de las RPC pasan todas por ella.
-- 4. fn_vincular_administrador(usuario, correo): VINCULADO · YA_VINCULADO · OTRA_CUENTA ·
--    NO_ES_ADMINISTRADOR. Registra 'administrador_vinculado' sin el usuario_id.
-- 5. fn_gestionar_administrador: misma firma; al desactivar, tiene que quedar otro administrador
--    activo y vinculado (ULTIMO_ADMINISTRADOR).
--
-- Tras esta migración ninguna fila está vinculada: el panel nuevo (RV-432) llama a la Function al
-- entrar. Con el panel anterior en caché, jefatura ve «sin acceso» hasta actualizar (excepción a la
-- compatibilidad una versión atrás, anotada en DEC-197).

-- ---------- 1. columnas ----------

alter table hidrantes.administradores
  add column if not exists usuario_id uuid,
  add column if not exists vinculado_en timestamptz,
  add column if not exists vinculado boolean generated always as (usuario_id is not null) stored;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'administradores_usuario_id_key'
                    and conrelid = 'hidrantes.administradores'::regclass) then
    alter table hidrantes.administradores add constraint administradores_usuario_id_key unique (usuario_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'administradores_vinculado_check'
                    and conrelid = 'hidrantes.administradores'::regclass) then
    alter table hidrantes.administradores add constraint administradores_vinculado_check
      check ((usuario_id is null) = (vinculado_en is null));
  end if;
end $$;

-- La tabla ya tiene select para authenticated (con RLS de administrador, 0003) y todo para
-- service_role; las columnas nuevas lo heredan. Nadie escribe salvo por RPC.

-- ---------- registro: acción nueva ----------
-- Se añade a lo que haya en el check, sin reescribir la lista: así no se pierde ninguna acción que
-- otra migración de docs/35 añada antes o después.
do $$
declare
  actuales text[];
begin
  select array_agg(m[1] order by o)
    into actuales
    from pg_constraint c,
         regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''', 'g') with ordinality as t(m, o)
   where c.conname = 'registro_accion_check' and c.conrelid = 'hidrantes.registro'::regclass;
  if actuales is null then
    raise exception 'registro_accion_check no encontrado';
  end if;
  if not ('administrador_vinculado' = any (actuales)) then
    alter table hidrantes.registro drop constraint registro_accion_check;
    execute format('alter table hidrantes.registro add constraint registro_accion_check check (accion in (%s))',
                   (select string_agg(quote_literal(a), ', ') from unnest(actuales || 'administrador_vinculado'::text) a));
  end if;
end $$;

-- ---------- 2. fn_usuario_jwt ----------

create or replace function hidrantes.fn_usuario_jwt() returns uuid
language sql stable set search_path = pg_catalog as $$
  select case
    when c.s ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then c.s::uuid
  end
  from (select nullif(nullif(current_setting('request.jwt.claims', true), ''), 'null')::jsonb ->> 'sub' as s) c;
$$;

revoke all on function hidrantes.fn_usuario_jwt() from public, anon, authenticated;

-- ---------- 3. fn_es_admin ----------

create or replace function hidrantes.fn_es_admin() returns boolean
language sql stable security definer set search_path = pg_catalog, hidrantes as $$
  select exists (
    select 1
    from hidrantes.administradores a
    where a.activo
      and a.email = hidrantes.fn_email_jwt()
      and a.usuario_id = hidrantes.fn_usuario_jwt()
  );
$$;

-- ---------- 4. fn_vincular_administrador ----------

create or replace function hidrantes.fn_vincular_administrador(usuario uuid, correo text) returns text
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes
set lock_timeout = '5s' as $$
declare
  e text := lower(trim(correo));
  fila hidrantes.administradores%rowtype;
begin
  if usuario is null or e is null or e = '' then
    perform hidrantes.fn_error('PAYLOAD_INVALIDO', 'Faltan el usuario o el correo');
  end if;
  -- Bloqueo por fila (05 §11): dos entradas a la vez del mismo administrador no vinculan dos veces.
  select * into fila from hidrantes.administradores a where a.email = e and a.activo for update;
  if not found then
    return 'NO_ES_ADMINISTRADOR';
  end if;
  if fila.usuario_id = usuario then
    return 'YA_VINCULADO';
  end if;
  if fila.usuario_id is not null then
    return 'OTRA_CUENTA';
  end if;
  -- Ese usuario ya está unido a otra fila (su correo de Google cambió): no se une a dos.
  if exists (select 1 from hidrantes.administradores a where a.usuario_id = usuario) then
    return 'OTRA_CUENTA';
  end if;
  update hidrantes.administradores a set usuario_id = usuario, vinculado_en = now() where a.email = e;
  perform hidrantes.fn_registrar(e, null, true, 'administrador_vinculado', null, null, null,
                                 jsonb_build_object('email', e));
  return 'VINCULADO';
end $$;

revoke all on function hidrantes.fn_vincular_administrador(uuid, text) from public, anon, authenticated;
grant execute on function hidrantes.fn_vincular_administrador(uuid, text) to service_role;

-- ---------- 5. fn_gestionar_administrador ----------
-- El cuerpo de 0006 con una sola diferencia: cuentan los otros activos **y vinculados**. Quien llama
-- ya es uno (fn_exigir_admin), así que solo salta cuando alguien se quita el acceso a sí mismo y no
-- queda otro que pueda entrar.

create or replace function hidrantes.fn_gestionar_administrador(email text, activo boolean) returns void
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes
set lock_timeout = '5s' as $$  -- el de 0016: create or replace sustituye los set de la función
declare
  actor text := hidrantes.fn_exigir_admin();
  e text := lower(trim(email));
  activos integer;
begin
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    perform hidrantes.fn_error('PAYLOAD_INVALIDO(email)', 'Correo no válido');
  end if;
  -- Bloquea a todos los activos: la regla del último se comprueba dentro de la transacción (05 §11).
  perform 1 from hidrantes.administradores a where a.activo for update;
  if not activo then
    select count(*) into activos
      from hidrantes.administradores a
     where a.activo and a.usuario_id is not null and a.email <> e;
    if activos = 0 then
      perform hidrantes.fn_error('ULTIMO_ADMINISTRADOR', 'Tiene que quedar al menos un administrador con acceso');
    end if;
  end if;
  insert into hidrantes.administradores (email, activo, creado_por) values (e, activo, actor)
  on conflict on constraint administradores_pkey do update set activo = excluded.activo;
  perform hidrantes.fn_registrar(actor, null, true,
    case when activo then 'administrador_alta' else 'administrador_baja' end, null, null, null,
    jsonb_build_object('email', e));
end $$;
