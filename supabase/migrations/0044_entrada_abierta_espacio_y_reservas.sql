-- 0044 · La entrada del día del lanzamiento, el espacio que se mide en lo nuestro, reservas que se
-- liberan y el candado global más fino (docs/33 RV-300 a RV-306 y RV-323; DEC-190; 05 §2.4–§2.6,
-- §2.10, §6, §8, §11; 11 §3, §4).
--
-- 1. RV-300 (DEC-190): max_altas_ip_dia (5–500) y max_altas_global_hora (10–500) entran en la lista
--    blanca de Ajustes. config.entrada_abierta_hasta (timestamptz o null): mientras sea futuro, el
--    tope de canjes buenos por IP y el de por hora pasan a 200 (o al configurado, si es mayor); los
--    topes de fallos no cambian. Los tokens que se emiten con la entrada abierta no tienen el límite
--    de "token nuevo". fn_abrir_entrada(horas) y fn_cerrar_entrada(), solo jefatura, con su entrada en
--    el registro (entrada_abierta, entrada_cerrada). fn_cambiar_codigo_acceso con "revocar todos" la
--    abre 24 h en la misma transacción. Se cierra sola: la comprobación es entrada_abierta_hasta >
--    now(). fn_verificar_codigo, cuando solo frena un tope de canjes buenos, comprueba el código y
--    anota si era bueno (intentos_codigo.codigo_correcto): fn_salud cuenta entradas_frenadas_24h (los
--    móviles con el código bueno que no han podido entrar) y devuelve entrada_abierta_hasta.
-- 2. RV-301: SIN_ESPACIO compara max_bytes_bd con lo que ocupa el esquema hidrantes, no toda la base
--    de datos (uniformidad, auth, pg_cron, pg_net), y lleva maximo y reintentar_en_s (1 h) como los
--    demás topes. fn_espacio da además el esquema, el total con su tope de 500 MB y el desglose para
--    la vigilancia (aviso al 80 % del total). pg_cron borra cada día el historial de las tareas de
--    hidrantes de más de 10 días.
-- 3. RV-302: fn_liberar_reservas(token, rutas) marca como liberadas las reservas sin confirmar de ese
--    móvil (subidas.liberada_en): dejan de contar como abiertas y ya no se pueden confirmar. "Token
--    nuevo" se mide por la primera vez que se vio el móvil (el min(emitido_en) de sus tokens), no por
--    el token con el que se llama.
-- 4. RV-304: fn_proponer_interno ya no coge el candado propuestas:global hasta el final de la
--    transacción: el tope global es un recuento sin candado (como mucho se pasa en tantas como
--    propuestas lleguen a la vez, frente a 600 al día).
-- 5. RV-306: la fn_registrar_error de 5 argumentos deja de ser de anon y de authenticated (#472). La
--    app la usaba solo si /api/error no existía.
-- 6. RV-323: fn_endpoint_tiene_jefatura(token, endpoint), para que la app no dé de baja en el
--    navegador una suscripción que también usa jefatura.
--
-- Compatibilidad (04 §12): mismas firmas en todo lo que ya existía; create or replace conserva los
-- grant. Las que llevaban lock_timeout lo vuelven a declarar. SIN_ESPACIO mantiene el prefijo (la app
-- 0.10 mira el prefijo). fn_salud y fn_espacio solo ganan claves; fn_salud.bd_pct pasa a medir el
-- esquema contra max_bytes_bd, que es lo que frena. La app anterior no llama a ninguna función nueva.

-- ---------- columnas y config ----------

alter table hidrantes.intentos_codigo add column codigo_correcto boolean;
alter table hidrantes.dispositivos add column en_entrada_abierta boolean not null default false;
alter table hidrantes.subidas add column liberada_en timestamptz;

insert into hidrantes.config (clave, valor, actualizado_por) values
  ('entrada_abierta_hasta', 'null', 'migracion')
on conflict (clave) do nothing;

alter table hidrantes.registro drop constraint registro_accion_check;
alter table hidrantes.registro add constraint registro_accion_check check (accion in (
  'propuesta_creada', 'propuesta_retirada_autor', 'aprobacion', 'aprobacion_con_correcciones',
  'rechazo', 'fusion', 'edicion_admin', 'retirada', 'borrado', 'restauracion', 'purga_papelera',
  'codigo_cambiado', 'dispositivos_revocados', 'administrador_alta', 'administrador_baja',
  'config_cambiada', 'incidencia_resuelta', 'anonimizacion', 'exportacion', 'workflow_lanzado',
  'nucleo_guardado', 'restauracion_respaldo', 'entrada_abierta', 'entrada_cerrada'
));

-- ---------- 1. la entrada del día del lanzamiento (RV-300) ----------

-- Hasta cuándo está abierta, o null si está cerrada (también si la hora ya pasó).
create function hidrantes.fn_entrada_abierta_hasta() returns timestamptz
language plpgsql stable security definer set search_path = pg_catalog, hidrantes as $$
declare
  v jsonb := hidrantes.fn_config('entrada_abierta_hasta', 'null');
  hasta timestamptz;
begin
  if jsonb_typeof(v) <> 'string' then
    return null;
  end if;
  hasta := (v #>> '{}')::timestamptz;
  return case when hasta > now() then hasta end;
exception when invalid_datetime_format or datetime_field_overflow then
  -- Un valor que no es una fecha (nadie lo escribe así: no está en la lista blanca) es "cerrada", y
  -- queda en el log de Postgres.
  raise warning 'fn_entrada_abierta_hasta: valor no válido en config.entrada_abierta_hasta';
  return null;
end $$;

-- Abre la entrada con un bloqueo de su fila de config. La usan fn_abrir_entrada y fn_cambiar_codigo_acceso.
create function hidrantes.fn_poner_entrada(hasta timestamptz, actor text) returns void
language sql volatile security definer set search_path = pg_catalog, hidrantes as $$
  insert into hidrantes.config (clave, valor, actualizado_por)
  values ('entrada_abierta_hasta', coalesce(to_jsonb(hasta), 'null'::jsonb), actor)
  on conflict (clave) do update set valor = excluded.valor, actualizado_por = excluded.actualizado_por;
$$;

create function hidrantes.fn_abrir_entrada(horas integer default 24) returns timestamptz
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes
set lock_timeout = '5s' as $$
#variable_conflict use_variable
declare
  actor text := hidrantes.fn_exigir_admin();
  hasta timestamptz;
begin
  if horas is null or horas not between 1 and 72 then
    perform hidrantes.fn_error('PAYLOAD_INVALIDO(horas)', 'Entre 1 y 72 horas');
  end if;
  perform 1 from hidrantes.config c where c.clave = 'entrada_abierta_hasta' for update;
  hasta := now() + make_interval(hours => horas);
  perform hidrantes.fn_poner_entrada(hasta, actor);
  perform hidrantes.fn_registrar(actor, null, true, 'entrada_abierta', null, null, null,
    jsonb_build_object('hasta', hasta, 'horas', horas, 'motivo', 'jefatura'));
  return hasta;
end $$;

create function hidrantes.fn_cerrar_entrada() returns void
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes
set lock_timeout = '5s' as $$
declare
  actor text := hidrantes.fn_exigir_admin();
  antes timestamptz;
begin
  perform 1 from hidrantes.config c where c.clave = 'entrada_abierta_hasta' for update;
  antes := hidrantes.fn_entrada_abierta_hasta();
  perform hidrantes.fn_poner_entrada(null, actor);
  -- Cerrar una entrada ya cerrada no cambia nada: no se anota.
  if antes is not null then
    perform hidrantes.fn_registrar(actor, null, true, 'entrada_cerrada', null, null,
      jsonb_build_object('hasta', antes), null);
  end if;
end $$;

-- Misma firma que 0006. Con "revocar todos", la entrada se abre 24 h en la misma transacción (los ~65
-- vuelven a entrar a la vez desde la misma wifi); sin revocar, no: los móviles que estaban siguen.
create or replace function hidrantes.fn_cambiar_codigo_acceso(nuevo text, revocar_dispositivos boolean) returns void
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes, extensions
set lock_timeout = '5s' as $$
declare
  actor text := hidrantes.fn_exigir_admin();
  revocados integer;
  hasta timestamptz;
begin
  if coalesce(nuevo, '') !~ '^[0-9]{6}$' then
    perform hidrantes.fn_error('CODIGO_FORMATO', 'El código son 6 cifras');
  end if;
  insert into hidrantes.config (clave, valor, actualizado_por) values
    ('codigo_acceso_hash', to_jsonb(crypt(nuevo, gen_salt('bf', 10))), actor),
    ('codigo_acceso', to_jsonb(nuevo), actor),
    ('codigo_acceso_cambiado_en', to_jsonb(now()), actor),
    ('codigo_acceso_cambiado_por', to_jsonb(actor), actor)
  on conflict (clave) do update set valor = excluded.valor, actualizado_por = excluded.actualizado_por;
  -- El código nunca va al registro: solo el hecho (11).
  perform hidrantes.fn_registrar(actor, null, true, 'codigo_cambiado', null, null, null,
                                 jsonb_build_object('revocar_dispositivos', coalesce(revocar_dispositivos, false)));
  if coalesce(revocar_dispositivos, false) then
    update hidrantes.dispositivos set revocado_en = now() where revocado_en is null;
    get diagnostics revocados = row_count;
    perform hidrantes.fn_registrar(actor, null, true, 'dispositivos_revocados', null, null, null,
                                   jsonb_build_object('dispositivos', revocados));
    perform 1 from hidrantes.config c where c.clave = 'entrada_abierta_hasta' for update;
    -- Si ya estaba abierta más tiempo, no se acorta.
    hasta := greatest(now() + interval '24 hours', hidrantes.fn_entrada_abierta_hasta());
    perform hidrantes.fn_poner_entrada(hasta, actor);
    perform hidrantes.fn_registrar(actor, null, true, 'entrada_abierta', null, null, null,
      jsonb_build_object('hasta', hasta, 'horas', 24, 'motivo', 'codigo_nuevo_revocando'));
  end if;
end $$;

-- El cuerpo de 0039 con la entrada abierta y el código comprobado cuando solo frena un tope de canjes
-- buenos. Los topes de fallos (dispositivo, IP, global) van primero y no cambian: con ellos no se
-- comprueba el código, como siempre. Con un tope de canjes buenos, sí: si era el bueno, el intento
-- frenado se anota con codigo_correcto = true (siempre, sin el filtro de una fila por minuto: solo
-- llega quien sabe el código) y cuenta en entradas_frenadas_24h. La respuesta es la misma con código
-- bueno o malo (DEMASIADOS_INTENTOS): el tope no sirve para probar códigos.
create or replace function hidrantes.fn_verificar_codigo(codigo text, dispositivo_id uuid, ip_hash text)
returns table (token text, caduca_en timestamptz, error text)
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes, extensions as $$
declare
  hash_guardado text := hidrantes.fn_config('codigo_acceso_hash', 'null') #>> '{}';
  -- Hash de relleno: si no hay código configurado se compara igual, para no ir más rápido.
  hash_comparar text := coalesce(hash_guardado, '$2a$10$T2CrJzJ.jvwByYIdKCVGJuV9fgfGpbsMwlear973cpAtdy3VfD6/G');
  fallos_dispositivo integer;
  fallos_ip integer;
  fallos_global integer;
  altas_ip integer;
  altas_global integer;
  tope_alcanzado text;
  correcto boolean := false;
  nuevo text;
  intento bigint;
  caducidad integer := (hidrantes.fn_config('dias_caducidad_token', '365') #>> '{}')::int;
  abierta boolean;
  tope_altas_ip integer := (hidrantes.fn_config('max_altas_ip_dia', '20') #>> '{}')::int;
  tope_altas_hora integer := (hidrantes.fn_config('max_altas_global_hora', '40') #>> '{}')::int;
begin
  -- Un canje cada vez: la cuenta y la anotación van bajo el mismo bloqueo, así que peticiones en
  -- paralelo no pasan el tope (RV-14, 05 §11). Primera sentencia a propósito.
  perform pg_advisory_xact_lock(hashtext('hidrantes:intentos_codigo'));

  abierta := hidrantes.fn_entrada_abierta_hasta() is not null;
  if abierta then
    tope_altas_ip := greatest(tope_altas_ip, 200);
    tope_altas_hora := greatest(tope_altas_hora, 200);
  end if;

  -- Fallos de la última hora (sin contar los ya bloqueados) y canjes buenos.
  select count(*) filter (where i.momento > now() - interval '1 hour' and not i.exito and not i.bloqueado
                            and i.dispositivo_id = fn_verificar_codigo.dispositivo_id),
         count(*) filter (where i.momento > now() - interval '1 hour' and not i.exito and not i.bloqueado
                            and i.ip_hash = fn_verificar_codigo.ip_hash),
         count(*) filter (where i.momento > now() - interval '1 hour' and not i.exito and not i.bloqueado),
         count(*) filter (where i.exito and i.ip_hash = fn_verificar_codigo.ip_hash),
         count(*) filter (where i.exito and i.momento > now() - interval '1 hour')
    into fallos_dispositivo, fallos_ip, fallos_global, altas_ip, altas_global
    from hidrantes.intentos_codigo i
   where i.momento > now() - interval '24 hours';

  tope_alcanzado := case
    when fallos_dispositivo >= (hidrantes.fn_config('max_intentos_dispositivo', '10') #>> '{}')::int then 'dispositivo'
    when fallos_ip >= (hidrantes.fn_config('max_intentos_ip', '30') #>> '{}')::int then 'ip'
    when fallos_global >= (hidrantes.fn_config('max_intentos_global', '200') #>> '{}')::int then 'global'
    when altas_ip >= tope_altas_ip then 'altas_ip'
    when altas_global >= tope_altas_hora then 'altas_global'
  end;
  if tope_alcanzado is not null then
    if tope_alcanzado in ('altas_ip', 'altas_global') then
      -- bcrypt como en un canje normal: mismo tiempo con código bueno o malo (TR-42).
      correcto := crypt(coalesce(codigo, ''), hash_comparar) = hash_comparar
                  and hash_guardado is not null
                  and coalesce(codigo, '') ~ '^[0-9]{6}$';
    end if;
    -- Anotado para Salud del sistema y la vigilancia; no cuenta como fallo. Una fila por IP y tope
    -- y minuto como mucho: una inundación bajo el bloqueo global no hace crecer la tabla (RV-48).
    -- Las de código bueno, siempre (cada una es un voluntario que no ha podido entrar).
    if correcto or not exists (select 1 from hidrantes.intentos_codigo i
                    where i.bloqueado and i.ip_hash = fn_verificar_codigo.ip_hash and i.tope = tope_alcanzado
                      and i.momento > now() - interval '1 minute') then
      insert into hidrantes.intentos_codigo (dispositivo_id, ip_hash, exito, bloqueado, tope, codigo_correcto)
      values (fn_verificar_codigo.dispositivo_id, fn_verificar_codigo.ip_hash, false, true, tope_alcanzado,
              case when tope_alcanzado in ('altas_ip', 'altas_global') then correcto end);
    end if;
    return query select null::text, null::timestamptz, 'DEMASIADOS_INTENTOS'::text;
    return;
  end if;

  -- bcrypt siempre, con código bien o mal formado: tiempo constante (TR-42).
  correcto := crypt(coalesce(codigo, ''), hash_comparar) = hash_comparar
              and hash_guardado is not null
              and coalesce(codigo, '') ~ '^[0-9]{6}$';

  insert into hidrantes.intentos_codigo (dispositivo_id, ip_hash, exito)
  values (fn_verificar_codigo.dispositivo_id, fn_verificar_codigo.ip_hash, correcto)
  returning id into intento;

  if not correcto then
    return query select null::text, null::timestamptz, 'CODIGO_INCORRECTO'::text;
    return;
  end if;

  if hidrantes.fn_es_dispositivo_admin(fn_verificar_codigo.dispositivo_id) then
    update hidrantes.intentos_codigo i set tope = 'dispositivo_reservado' where i.id = intento;
    return query select null::text, null::timestamptz, 'DISPOSITIVO_RESERVADO'::text;
    return;
  end if;

  nuevo := hidrantes.fn_aleatorio_b64url(32);
  insert into hidrantes.dispositivos (dispositivo_id, token_hash, en_entrada_abierta)
  values (fn_verificar_codigo.dispositivo_id, hidrantes.fn_sha256(nuevo), abierta);
  return query select nuevo, now() + make_interval(days => caducidad), null::text;
end $$;

-- Los móviles con el código bueno frenados por un tope de canjes buenos en 24 h (Salud, vigilancia).
create function hidrantes.fn_entradas_frenadas_24h() returns integer
language sql stable security definer set search_path = pg_catalog, hidrantes as $$
  select count(distinct coalesce(i.dispositivo_id::text, i.ip_hash))::int
    from hidrantes.intentos_codigo i
   where i.momento > now() - interval '24 hours' and i.bloqueado and i.codigo_correcto
     and i.tope in ('altas_ip', 'altas_global');
$$;

-- Igual que 0041 con max_altas_ip_dia (5–500) y max_altas_global_hora (10–500) en la lista blanca.
-- entrada_abierta_hasta no está: se abre y se cierra con sus funciones, que lo anotan.
create or replace function hidrantes.fn_guardar_config(cambios jsonb) returns void
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes
set lock_timeout = '5s' as $$
declare
  actor text := hidrantes.fn_exigir_admin();
  k text;
  v jsonb;
  rangos constant jsonb := '{
    "meses_revision": [1, 60], "radio_duplicado_m": [1, 500], "dias_papelera": [1, 365],
    "buffer_zona_m": [0, 5000], "max_subidas_dispositivo_dia": [1, 500],
    "metros_tramo_manguera": [10, 30], "max_propuestas_dia": [1, 500],
    "max_subidas_dia_total": [1, 5000], "max_reservas_abiertas": [1, 50],
    "max_bytes_fotos": [104857600, 1073741824], "max_bytes_bd": [104857600, 524288000],
    "max_propuestas_token_nuevo": [1, 500], "max_propuestas_dia_total": [1, 5000],
    "max_altas_ip_dia": [5, 500], "max_altas_global_hora": [10, 500]}';
  antes jsonb;
begin
  if cambios is null or jsonb_typeof(cambios) <> 'object' or cambios = '{}'::jsonb then
    perform hidrantes.fn_error('PAYLOAD_INVALIDO(cambios)', 'No has cambiado nada');
  end if;
  for k, v in select key, value from jsonb_each(cambios) loop
    if k = 'escala_radios' then
      if jsonb_typeof(v) <> 'array' or jsonb_array_length(v) <> 5
         or exists (select 1 from jsonb_array_elements(v) x where jsonb_typeof(x) <> 'number'
                      or x::text::numeric not between 2 and 30) then
        perform hidrantes.fn_error('CONFIG_INVALIDA(' || k || ')', 'Cinco radios entre 2 y 30');
      end if;
    elsif rangos ? k then
      if jsonb_typeof(v) <> 'number' or v::text::numeric <> trunc(v::text::numeric)
         or v::text::numeric not between (rangos -> k ->> 0)::numeric and (rangos -> k ->> 1)::numeric then
        perform hidrantes.fn_error('CONFIG_INVALIDA(' || k || ')', 'Valor fuera de rango');
      end if;
    else
      perform hidrantes.fn_error('CONFIG_INVALIDA(' || k || ')', 'Parámetro no modificable');
    end if;
  end loop;
  perform 1 from hidrantes.config c where c.clave in (select jsonb_object_keys(cambios)) for update;
  select jsonb_object_agg(c.clave, c.valor) into antes
    from hidrantes.config c where c.clave in (select jsonb_object_keys(cambios));
  insert into hidrantes.config (clave, valor, actualizado_por)
  select key, value, actor from jsonb_each(cambios)
  on conflict (clave) do update set valor = excluded.valor, actualizado_por = excluded.actualizado_por;
  perform hidrantes.fn_registrar(actor, null, true, 'config_cambiada', null, null, antes, cambios);
end $$;

-- ---------- 2. espacio: el esquema y el total (RV-301) ----------

-- Lo que ocupa el esquema hidrantes: tablas y vistas materializadas con sus índices y TOAST.
create function hidrantes.fn_bytes_esquema() returns bigint
language sql stable security definer set search_path = pg_catalog as $$
  select coalesce(sum(pg_total_relation_size(c.oid)), 0)::bigint
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'hidrantes' and c.relkind in ('r', 'm', 'p');
$$;

-- Lo que ocupa una tabla de otro esquema por su nombre, sin necesitar permiso sobre ella; 0 si no está.
create function hidrantes.fn_bytes_tabla(esquema text, tabla text) returns bigint
language sql stable security definer set search_path = pg_catalog as $$
  select coalesce(sum(pg_total_relation_size(c.oid)), 0)::bigint
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = esquema and c.relname = tabla;
$$;

-- Misma firma que 0042 más el esquema, el total con su tope (500 MB, el del plan gratuito) y su aviso
-- (80 %), y el desglose. bd_bytes sigue siendo el total, como antes.
create or replace function hidrantes.fn_espacio() returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, hidrantes as $$
declare
  f record;
  total bigint := pg_database_size(current_database());
  esquema bigint := hidrantes.fn_bytes_esquema();
  cron_b bigint := hidrantes.fn_bytes_tabla('cron', 'job_run_details');
  net_b bigint := hidrantes.fn_bytes_tabla('net', '_http_response');
begin
  select * into f from hidrantes.fn_espacio_fotos();
  return jsonb_build_object(
    'fotos_bytes', f.bytes,
    'fotos_origen', f.origen,
    'fotos_medidos_en', case when f.origen = 'storage' then to_jsonb(now())
                             else (select to_jsonb(c.actualizado_en) from hidrantes.config c
                                    where c.clave = 'storage_bytes') end,
    'reservas_abiertas', f.abiertas,
    'fotos_reservado_bytes', f.abiertas::bigint * 5242880,
    'max_bytes_fotos', (hidrantes.fn_config('max_bytes_fotos', '838860800') #>> '{}')::bigint,
    'bd_bytes', total,
    'esquema_bytes', esquema,
    'max_bytes_bd', (hidrantes.fn_config('max_bytes_bd', '419430400') #>> '{}')::bigint,
    'aviso', 0.7,
    'max_bytes_bd_total', 524288000,
    'aviso_total', 0.8,
    'bd_desglose', jsonb_build_object(
      'hidrantes', esquema,
      'cron', cron_b,
      'net', net_b,
      'resto', greatest(total - esquema - cron_b - net_b, 0)),
    -- ¿Puede la tarea diaria borrar el historial de pg_cron? (fn_purgar_registros_cron)
    'cron_purga', case when hidrantes.fn_cron_purga_con_permiso() then 'ok' else 'sin_permiso' end);
end $$;

-- El historial de pg_cron de las tareas de hidrantes de más de 10 días. La spec pedía 7; con 7, la
-- comprobación de Salud y de la vigilancia (fallos en 8 días; "el sistema lleva más de 8 días") se
-- quedaría sin historial que mirar. Solo las nuestras (jobname hidrantes_%; además, la RLS de
-- pg_cron solo deja ver las del dueño). Borrar necesita `grant delete on cron.job_run_details to
-- hidrantes_migrador` (arranque-bd.sql desde 0044): una base arrancada antes no lo tiene. Entonces
-- devuelve -1 sin fallar (la tarea no sale en rojo cada día) y fn_espacio lo dice en cron_purga =
-- 'sin_permiso', que la vigilancia enseña.
create function hidrantes.fn_cron_purga_con_permiso() returns boolean
language sql stable security definer set search_path = pg_catalog as $$
  select coalesce((select has_table_privilege(c.oid, 'DELETE')
                     from pg_class c join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'cron' and c.relname = 'job_run_details'), false);
$$;

create function hidrantes.fn_purgar_registros_cron() returns integer
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes, cron as $$
declare
  n integer;
begin
  if not hidrantes.fn_cron_purga_con_permiso() then
    raise warning 'fn_purgar_registros_cron: falta grant delete on cron.job_run_details (arranque-bd.sql)';
    return -1;
  end if;
  delete from cron.job_run_details d
   using cron.job j
   where d.jobid = j.jobid and j.jobname like 'hidrantes\_%'
     and d.start_time < now() - interval '10 days';
  get diagnostics n = row_count;
  return n;
end $$;

select cron.schedule('hidrantes_purgar_registros_cron', '17 4 * * *', $$select hidrantes.fn_purgar_registros_cron()$$);

-- ---------- 3. reservas liberadas (RV-302) ----------

-- Las de 0041 sin las liberadas: una reserva liberada ya no cuenta como abierta.
create or replace function hidrantes.fn_subidas_contadas() returns integer
language sql stable security definer set search_path = pg_catalog, hidrantes as $$
  select count(*)::int from hidrantes.subidas s
   where s.reservada_en > now() - interval '1 day'
     and not hidrantes.fn_es_dispositivo_admin(s.dispositivo_id)
     and (s.confirmada_en is not null
          or (s.reservada_en > now() - interval '2 hours' and s.liberada_en is null
              and not hidrantes.fn_dispositivo_liberado(s.dispositivo_id)));
$$;

-- Misma firma que 0042; las reservas abiertas, sin las liberadas.
create or replace function hidrantes.fn_espacio_fotos(out bytes bigint, out origen text, out abiertas integer)
language plpgsql stable security definer set search_path = pg_catalog, hidrantes as $$
begin
  begin
    if not exists (select 1 from pg_policies p where p.schemaname = 'storage' and p.tablename = 'objects'
                     and p.policyname = 'hidrantes_migrador_mide_fotos') then
      raise exception using errcode = 'insufficient_privilege',
        message = 'falta la política hidrantes_migrador_mide_fotos en storage.objects';
    end if;
    select coalesce(sum(case when o.metadata ->> 'size' ~ '^[0-9]{1,18}$' then (o.metadata ->> 'size')::bigint
                             else 5242880 end), 0)
      into bytes
      from storage.objects o
     where o.bucket_id in ('hidrantes-fotos', 'hidrantes-fotos-dev');
    select count(*)::int into abiertas
      from hidrantes.subidas s
     where s.confirmada_en is null and s.liberada_en is null and s.reservada_en > now() - interval '2 hours'
       and not hidrantes.fn_dispositivo_liberado(s.dispositivo_id)
       and not exists (select 1 from storage.objects o
                        where o.bucket_id in ('hidrantes-fotos', 'hidrantes-fotos-dev') and o.name = s.foto_path);
    origen := 'storage';
  exception when insufficient_privilege or undefined_table or invalid_schema_name then
    bytes := case when jsonb_typeof(hidrantes.fn_config('storage_bytes', 'null')) = 'number'
                  then (hidrantes.fn_config('storage_bytes', 'null') #>> '{}')::numeric::bigint end;
    origen := case when bytes is null then 'sin_dato' else 'respaldo' end;
    bytes := coalesce(bytes, 0);
    select count(*)::int into abiertas
      from hidrantes.subidas s
     where s.confirmada_en is null and s.liberada_en is null and s.reservada_en > now() - interval '2 hours'
       and not hidrantes.fn_dispositivo_liberado(s.dispositivo_id);
  end;
end $$;

-- El cuerpo de 0042 sin las reservas liberadas en las abiertas del móvil ni en las del grupo.
create or replace function hidrantes.fn_reservar_subida_para(d uuid) returns text
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes as $$
declare
  ruta text;
  es_admin boolean := hidrantes.fn_es_dispositivo_admin(d);
  tope integer;
  hechas integer;
  abiertas_d integer;
  mas_antigua timestamptz;
  espacio record;
  max_fotos bigint;
begin
  perform pg_advisory_xact_lock(hashtext('subidas:' || d::text));
  tope := (hidrantes.fn_config('max_subidas_dispositivo_dia', '80') #>> '{}')::int;
  select count(*)::int, min(s.reservada_en) into hechas, mas_antigua
    from hidrantes.subidas s
   where s.dispositivo_id = d and s.reservada_en > now() - interval '1 day';
  if hechas >= tope then
    perform hidrantes.fn_error_tope('CUOTA_SUBIDAS_AGOTADA', tope,
      ceil(extract(epoch from mas_antigua + interval '1 day' - now()))::int, 'dispositivo');
  end if;
  if not es_admin then
    -- Reservas abiertas de este móvil (el token ya se ha validado: no está liberado).
    tope := (hidrantes.fn_config('max_reservas_abiertas', '6') #>> '{}')::int;
    select count(*)::int, min(s.reservada_en) into abiertas_d, mas_antigua
      from hidrantes.subidas s
     where s.dispositivo_id = d and s.confirmada_en is null and s.liberada_en is null
       and s.reservada_en > now() - interval '2 hours';
    if abiertas_d >= tope then
      perform hidrantes.fn_error_tope('RESERVAS_ABIERTAS', tope,
        ceil(extract(epoch from mas_antigua + interval '2 hours' - now()))::int);
    end if;
    perform pg_advisory_xact_lock(hashtext('subidas:global'));
    tope := (hidrantes.fn_config('max_subidas_dia_total', '150') #>> '{}')::int;
    if hidrantes.fn_subidas_contadas() >= tope then
      -- La primera de las que cuentan (las mismas que fn_subidas_contadas) que deja de contar.
      select min(case when s.confirmada_en is not null then s.reservada_en + interval '1 day'
                      else s.reservada_en + interval '2 hours' end)
        into mas_antigua
        from hidrantes.subidas s
       where s.reservada_en > now() - interval '1 day'
         and not hidrantes.fn_es_dispositivo_admin(s.dispositivo_id)
         and (s.confirmada_en is not null
              or (s.reservada_en > now() - interval '2 hours' and s.liberada_en is null
                  and not hidrantes.fn_dispositivo_liberado(s.dispositivo_id)));
      perform hidrantes.fn_error_tope('CUOTA_SUBIDAS_AGOTADA', tope,
        coalesce(ceil(extract(epoch from mas_antigua - now()))::int, 3600), 'grupo');
    end if;
  end if;
  -- Espacio: lo que hay, 5 MB por reserva abierta sin archivo y 5 MB de esta. Para todos.
  max_fotos := (hidrantes.fn_config('max_bytes_fotos', '838860800') #>> '{}')::bigint;
  select * into espacio from hidrantes.fn_espacio_fotos();
  if espacio.bytes + (espacio.abiertas + 1)::bigint * 5242880 > max_fotos then
    perform hidrantes.fn_error_tope('SIN_ESPACIO_FOTOS', max_fotos, 3600);
  end if;
  ruta := 'fotos/' || gen_random_uuid() || '.jpg';
  insert into hidrantes.subidas (dispositivo_id, foto_path) values (d, ruta);
  return ruta;
end $$;

-- La app la llama cuando una propuesta pasa a fallo definitivo (RV-328): sus fotos ya no se van a
-- confirmar. Solo las reservas sin confirmar de este móvil; las demás rutas se ignoran sin decir de
-- quién son. Devuelve cuántas ha liberado (0 en un reintento). Bloqueo por fila (05 §11).
create function hidrantes.fn_liberar_reservas(token text, rutas text[]) returns integer
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes
set lock_timeout = '5s' as $$
#variable_conflict use_variable
declare
  d uuid := hidrantes.fn_validar_token(token);
  n integer;
begin
  if rutas is null or cardinality(rutas) not between 1 and 20 then
    perform hidrantes.fn_error('PAYLOAD_INVALIDO(rutas)', 'Entre 1 y 20 fotos');
  end if;
  with objetivo as (
    select s.id from hidrantes.subidas s
     where s.dispositivo_id = d and s.foto_path = any (rutas)
       and s.confirmada_en is null and s.liberada_en is null
     for update
  )
  update hidrantes.subidas s set liberada_en = now()
    from objetivo o where s.id = o.id;
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------- 4. propuestas: token nuevo por móvil, candado global fuera, espacio del esquema ----------
-- El cuerpo de 0041 con tres cambios: el token nuevo se mide por la primera vez que se vio el móvil y
-- no cuenta si entró con la entrada abierta (RV-300, RV-302); el tope global se cuenta sin candado
-- (RV-304); SIN_ESPACIO mira el esquema y lleva maximo y reintentar_en_s (RV-301). Y una reserva
-- liberada ya no se confirma (RV-302).
create or replace function hidrantes.fn_proponer_interno(
  token text, clave_local text, autor_nombre text, autor_apellido text,
  operacion hidrantes.operacion, punto_id uuid, datos jsonb,
  origen hidrantes.origen_ubicacion, lat double precision, lng double precision,
  gps_lat double precision, gps_lng double precision, precision_gps_m real,
  exif_lat double precision, exif_lng double precision,
  foto_path text, foto_sitio_path text, exigir_foto_sitio boolean
) returns jsonb
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes, extensions
set lock_timeout = '5s' as $$
#variable_conflict use_variable
declare
  admin_email text := case when hidrantes.fn_es_admin() then hidrantes.fn_email_jwt() end;
  d uuid;
  existente hidrantes.propuestas;
  p hidrantes.puntos;
  nueva_geom geography := hidrantes.fn_punto_geo(lat, lng);
  gps geography := hidrantes.fn_punto_geo(gps_lat, gps_lng);
  exif geography := hidrantes.fn_punto_geo(exif_lat, exif_lng);
  dup_id uuid;
  dup_m double precision;
  nuevo_id uuid;
  datos_ok jsonb := coalesce(datos, '{}'::jsonb);
  resultado jsonb;
  dias_reserva integer := (hidrantes.fn_config('dias_reserva_subida', '2') #>> '{}')::int;
  -- El día de la cuota es el natural de Albolote, no el de UTC.
  hoy_madrid timestamptz := date_trunc('day', now() at time zone 'Europe/Madrid') at time zone 'Europe/Madrid';
  manana_madrid timestamptz := (date_trunc('day', now() at time zone 'Europe/Madrid') + interval '1 day')
                               at time zone 'Europe/Madrid';
  tope_propuestas integer;
  hechas integer;
  primera timestamptz;
  con_entrada_abierta boolean;
  espera integer;
  max_bd bigint;
begin
  -- Identidad: administrador con sesión de Google o voluntario con token (FR-151).
  d := case when admin_email is not null then hidrantes.fn_dispositivo_admin(admin_email)
            else hidrantes.fn_validar_token(token) end;

  if clave_local is null or length(clave_local) not between 8 and 100 then
    perform hidrantes.fn_error('PAYLOAD_INVALIDO(clave_local)', 'Marca de envío no válida');
  end if;

  -- Idempotencia (FR-49): un reintento devuelve la propuesta ya creada.
  select * into existente from hidrantes.propuestas r where r.clave_local = fn_proponer_interno.clave_local;
  if found then
    if existente.dispositivo_id <> d then
      perform hidrantes.fn_error('PAYLOAD_INVALIDO(clave_local)', 'Marca de envío no válida');
    end if;
    return jsonb_build_object('propuesta_id', existente.id, 'estado', existente.estado,
      'aplicada', existente.estado = 'aprobada',
      'codigo', (select codigo from hidrantes.puntos where id = coalesce(existente.punto_id,
                   (existente.correcciones ->> 'punto_id')::uuid)));
  end if;

  -- Jefatura (RV-19): su identidad es la sesión, no lo que mande el móvil. El registro ya usa
  -- admin_email como actor.
  if admin_email is not null then
    autor_nombre := 'Jefatura';
    autor_apellido := left(admin_email, 60);
  end if;

  if jsonb_typeof(datos_ok) <> 'object' then
    perform hidrantes.fn_error('PAYLOAD_INVALIDO(datos)', 'Datos no válidos');
  end if;
  if coalesce(trim(autor_nombre), '') = '' or coalesce(trim(autor_apellido), '') = '' then
    perform hidrantes.fn_error('PAYLOAD_INVALIDO(autor)', 'Faltan nombre y apellido');
  end if;
  perform hidrantes.fn_validar_longitud('autor_nombre', autor_nombre, 60);
  perform hidrantes.fn_validar_longitud('autor_apellido', autor_apellido, 60);
  perform hidrantes.fn_validar_datos(operacion, datos_ok);

  -- Punto afectado
  if operacion = 'alta' then
    if punto_id is not null then
      perform hidrantes.fn_error('PAYLOAD_INVALIDO(punto_id)', 'Un alta no lleva punto');
    end if;
  else
    select * into p from hidrantes.puntos x where x.id = punto_id;
    if not found or p.situacion <> 'activo' then
      perform hidrantes.fn_error('PUNTO_NO_ACTIVO', 'El punto ya no está activo');
    end if;
    -- El tipo no cambia una vez creado (DEC-090). El frontend anterior manda el tipo actual en
    -- "corregir datos": igual al del punto, entra (04 §12).
    if datos_ok ? 'tipo' and datos_ok ->> 'tipo' is distinct from p.tipo::text then
      perform hidrantes.fn_error('TIPO_NO_MODIFICABLE', 'El tipo no se cambia: propón retirarlo y da de alta el correcto');
    end if;
    -- El diámetro de "corregir datos", con las reglas del tipo del punto (DEC-144).
    if operacion = 'datos' then
      perform hidrantes.fn_validar_diametro(p.tipo::text, datos_ok, false);
    end if;
  end if;

  -- Ubicación
  if operacion in ('alta', 'ubicacion') and (nueva_geom is null or origen is null) then
    perform hidrantes.fn_error('PAYLOAD_INVALIDO(ubicacion)', 'Falta la ubicación');
  end if;
  if operacion not in ('alta', 'ubicacion') then
    nueva_geom := null;
  end if;

  -- Foto: obligatoria salvo en "corregir datos"; siempre reservada por este dispositivo y sin liberar.
  if foto_path is null and operacion <> 'datos' then
    perform hidrantes.fn_error('FOTO_OBLIGATORIA', 'Falta la foto');
  end if;
  if foto_path is not null then
    update hidrantes.subidas s set confirmada_en = coalesce(s.confirmada_en, now())
     where s.foto_path = fn_proponer_interno.foto_path and s.dispositivo_id = d
       and s.liberada_en is null
       -- Una reserva sin confirmar de más de dias_reserva - 1 días pudo perder su archivo en la purga:
       -- se pide otra subida (RV-07). Nunca menos de un día: con dias_reserva_subida = 1 se rechazaban
       -- todas y la cola reintentaba sin fin (RV-48).
       and (s.confirmada_en is not null
            or s.reservada_en > now() - make_interval(days => greatest(dias_reserva - 1, 1)));
    if not found then
      perform hidrantes.fn_error('FOTO_NO_RESERVADA', 'La foto no se subió desde este móvil');
    end if;
  end if;

  -- Foto del sitio (DEC-146): con la firma nueva, obligatoria en alta y ubicación; en ninguna otra
  -- operación se admite. Distinta de la de la conexión y reservada por este dispositivo, como ella.
  if exigir_foto_sitio and operacion in ('alta', 'ubicacion') and foto_sitio_path is null then
    perform hidrantes.fn_error('FOTO_SITIO_OBLIGATORIA', 'Falta la foto del sitio');
  end if;
  if foto_sitio_path is not null then
    if operacion not in ('alta', 'ubicacion') then
      perform hidrantes.fn_error('PAYLOAD_INVALIDO(foto_sitio_path)', 'Esta operación no lleva foto del sitio');
    end if;
    if foto_sitio_path = foto_path then
      perform hidrantes.fn_error('PAYLOAD_INVALIDO(foto_sitio_path)', 'La foto del sitio es otra foto');
    end if;
    update hidrantes.subidas s set confirmada_en = coalesce(s.confirmada_en, now())
     where s.foto_path = fn_proponer_interno.foto_sitio_path and s.dispositivo_id = d
       and s.liberada_en is null
       and (s.confirmada_en is not null
            or s.reservada_en > now() - make_interval(days => greatest(dias_reserva - 1, 1)));
    if not found then
      perform hidrantes.fn_error('FOTO_NO_RESERVADA', 'La foto del sitio no se subió desde este móvil');
    end if;
  end if;

  -- Topes diarios (RV-141, DEC-174; RV-221, DEC-183). Jefatura no tiene. Bajo un bloqueo por
  -- dispositivo: dos envíos a la vez no pasan los dos la última plaza (05 §11). Un reintento con la
  -- misma clave_local ya ha salido arriba, así que no cuenta.
  -- El cliente solo ve el message: los números van en el texto, como pidió Frontend-campo en #484
  -- ("CUOTA_PROPUESTAS_AGOTADA: maximo=60 reintentar_en_s=12345"), y repetidos en detail.
  if admin_email is null then
    perform pg_advisory_xact_lock(hashtext('propuestas:' || d::text));
    -- Un envío con la misma clave_local que entró mientras se esperaba el bloqueo es un reintento: se
    -- devuelve ese, no un "máximo de hoy" de una propuesta que sí existe.
    if exists (select 1 from hidrantes.propuestas x where x.clave_local = fn_proponer_interno.clave_local) then
      return hidrantes.fn_proponer_interno(token, clave_local, autor_nombre, autor_apellido, operacion, punto_id, datos,
        origen, lat, lng, gps_lat, gps_lng, precision_gps_m, exif_lat, exif_lng, foto_path, foto_sitio_path, exigir_foto_sitio);
    end if;
    tope_propuestas := (hidrantes.fn_config('max_propuestas_dia', '60') #>> '{}')::int;
    select count(*)::int into hechas from hidrantes.propuestas x
     where x.dispositivo_id = d and x.creada_en >= hoy_madrid;
    if hechas >= tope_propuestas then
      raise exception using errcode = 'P0001',
        message = format('CUOTA_PROPUESTAS_AGOTADA: maximo=%s reintentar_en_s=%s', tope_propuestas,
                         ceil(extract(epoch from manana_madrid - now()))::int),
        detail = jsonb_build_object('maximo', tope_propuestas,
                   'reintentar_en_s', ceil(extract(epoch from manana_madrid - now()))::int)::text;
    end if;
    -- Móvil nuevo (RV-221, RV-302): sus primeras 24 h desde la primera vez que se vio (el primer token
    -- de ese dispositivo_id, revocado o no), max_propuestas_token_nuevo. Un veterano que vuelve a
    -- entrar no es nuevo. Tampoco quien entró con la entrada abierta (RV-300). Se espera a lo que
    -- llegue antes, la medianoche de Madrid o las 24 h.
    select min(x.emitido_en), bool_or(x.en_entrada_abierta) into primera, con_entrada_abierta
      from hidrantes.dispositivos x where x.dispositivo_id = d;
    if primera > now() - interval '24 hours' and not coalesce(con_entrada_abierta, false) then
      tope_propuestas := (hidrantes.fn_config('max_propuestas_token_nuevo', '10') #>> '{}')::int;
      if hechas >= tope_propuestas then
        espera := greatest(ceil(extract(epoch from least(manana_madrid, primera + interval '24 hours') - now()))::int, 1);
        raise exception using errcode = 'P0001',
          message = format('CUOTA_PROPUESTAS_AGOTADA: maximo=%s reintentar_en_s=%s ambito=token_nuevo',
                           tope_propuestas, espera),
          detail = jsonb_build_object('maximo', tope_propuestas, 'reintentar_en_s', espera,
                                      'ambito', 'token_nuevo')::text;
      end if;
    end if;
    -- Tope global entre todos los voluntarios (RV-221), sin candado (RV-304): el candado de toda la
    -- transacción ponía en fila a todos los voluntarios. Sin él, propuestas que lleguen a la vez
    -- pueden pasar el tope en tantas como sean; es un freno contra abusos de 600 al día, no un cupo.
    tope_propuestas := (hidrantes.fn_config('max_propuestas_dia_total', '600') #>> '{}')::int;
    if hidrantes.fn_propuestas_hoy() >= tope_propuestas then
      espera := ceil(extract(epoch from manana_madrid - now()))::int;
      raise exception using errcode = 'P0001',
        message = format('CUOTA_PROPUESTAS_AGOTADA: maximo=%s reintentar_en_s=%s ambito=grupo', tope_propuestas, espera),
        detail = jsonb_build_object('maximo', tope_propuestas, 'reintentar_en_s', espera, 'ambito', 'grupo')::text;
    end if;
    -- Espacio (RV-301): lo que ocupa el esquema hidrantes, no toda la base de datos. Hora de espera
    -- fija: el espacio se libera cuando jefatura actúa, no a una hora cierta.
    max_bd := (hidrantes.fn_config('max_bytes_bd', '419430400') #>> '{}')::bigint;
    if hidrantes.fn_bytes_esquema() > max_bd then
      perform hidrantes.fn_error_tope('SIN_ESPACIO', max_bd, 3600);
    end if;
  end if;

  -- Posible duplicado: el punto activo más cercano del mismo tipo (FR-51).
  if operacion = 'alta' then
    select x.id, st_distance(x.geom, nueva_geom) into dup_id, dup_m
      from hidrantes.puntos x
     where x.situacion = 'activo' and x.tipo = (datos_ok ->> 'tipo')::hidrantes.tipo_punto
       and st_dwithin(x.geom, nueva_geom, (hidrantes.fn_config('radio_duplicado_m', '25') #>> '{}')::double precision)
     order by x.geom <-> nueva_geom
     limit 1;
  end if;

  insert into hidrantes.propuestas as r
    (punto_id, operacion, datos, autor_nombre, autor_apellido, dispositivo_id, clave_local, origen_ubicacion,
     geom, gps_geom, precision_gps_m, exif_geom, distancia_gps_m, duplicado_de, distancia_duplicado_m, foto_path,
     foto_sitio_path)
  values
    (fn_proponer_interno.punto_id, operacion, datos_ok, trim(autor_nombre), trim(autor_apellido), d, fn_proponer_interno.clave_local,
     case when nueva_geom is not null then origen end, nueva_geom, gps, precision_gps_m, exif,
     case when nueva_geom is not null and gps is not null then st_distance(nueva_geom, gps) end,
     dup_id, dup_m, fn_proponer_interno.foto_path, fn_proponer_interno.foto_sitio_path)
  on conflict on constraint propuestas_clave_local_key do nothing
  returning r.id into nuevo_id;

  if nuevo_id is null then
    -- Otro envío con la misma marca entró a la vez (05 §11): se devuelve ese.
    return hidrantes.fn_proponer_interno(token, clave_local, autor_nombre, autor_apellido, operacion, punto_id, datos,
      origen, lat, lng, gps_lat, gps_lng, precision_gps_m, exif_lat, exif_lng, foto_path, foto_sitio_path, exigir_foto_sitio);
  end if;

  perform hidrantes.fn_registrar(coalesce(admin_email, trim(autor_nombre) || ' ' || trim(autor_apellido)),
    case when admin_email is null then d end, admin_email is not null, 'propuesta_creada',
    fn_proponer_interno.punto_id, nuevo_id, null, jsonb_build_object('operacion', operacion, 'datos', datos_ok));

  -- Jefatura aplica al momento (FR-151).
  if admin_email is not null then
    resultado := hidrantes.fn_aplicar_propuesta(nuevo_id, null, true, admin_email);
    return jsonb_build_object('propuesta_id', nuevo_id, 'estado', 'aprobada', 'aplicada', true,
                              'codigo', resultado ->> 'codigo');
  end if;

  perform hidrantes.fn_avisar_jefatura();
  return jsonb_build_object('propuesta_id', nuevo_id, 'estado', 'pendiente', 'aplicada', false,
                            'codigo', p.codigo);
end $$;

-- ---------- 5. Salud ----------

-- Misma firma y claves que 0041, más entradas_frenadas_24h y entrada_abierta_hasta (RV-300), el total
-- de la base de datos con su tope (RV-301) y las reservas liberadas fuera de las abiertas (RV-302).
-- bd_pct pasa a medir el esquema contra max_bytes_bd, que es lo que frena las propuestas.
create or replace function hidrantes.fn_salud() returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, hidrantes as $$
declare
  tareas jsonb;
  origen jsonb;
  subidas_24h integer;
  propuestas_hoy integer;
  espacio record;
  max_fotos bigint := (hidrantes.fn_config('max_bytes_fotos', '838860800') #>> '{}')::bigint;
  max_bd bigint := (hidrantes.fn_config('max_bytes_bd', '419430400') #>> '{}')::bigint;
  bd bigint := pg_database_size(current_database());
  esquema bigint := hidrantes.fn_bytes_esquema();
begin
  perform hidrantes.fn_exigir_admin();
  -- Las mismas que cuenta el tope global de fn_reservar_subida_para.
  subidas_24h := hidrantes.fn_subidas_contadas();
  propuestas_hoy := hidrantes.fn_propuestas_hoy();
  select * into espacio from hidrantes.fn_espacio_fotos();
  begin
    tareas := hidrantes.fn_tareas_programadas();
    origen := jsonb_build_object('tareas_origen', 'en_vivo');
  exception when insufficient_privilege or undefined_table or invalid_schema_name or undefined_function then
    -- Sin acceso a pg_cron: la foto de la vigilancia, diciendo de cuándo es.
    tareas := hidrantes.fn_config('tareas_programadas', 'null');
    origen := jsonb_build_object(
      'tareas_origen', 'vigilancia',
      'tareas_error', sqlstate,
      'tareas_medidas_en', (select to_jsonb(c.actualizado_en) from hidrantes.config c where c.clave = 'tareas_programadas'));
  end;
  return jsonb_build_object(
    'pendientes_14d', (select count(*) from hidrantes.propuestas where estado = 'pendiente'
                         and creada_en < now() - interval '14 days'),
    -- El panel de 0.7.0 la pinta; desde 0040 no hay incidencias (RV-223, se quita con #472).
    'incidencias_abiertas', 0,
    'errores_7d', (select count(*) from hidrantes.errores_cliente where momento > now() - interval '7 days'),
    'sin_direccion', (select count(*) from hidrantes.puntos where situacion = 'activo' and direccion is null),
    'ultimo_respaldo', hidrantes.fn_config('ultimo_respaldo', 'null'),
    'storage_bytes', hidrantes.fn_config('storage_bytes', 'null'),
    'version_zona', hidrantes.fn_config('version_zona', 'null'),
    'version_mapabase', hidrantes.fn_config('version_mapabase', 'null'),
    'version_callejero', hidrantes.fn_config('version_callejero', 'null'),
    'ultima_vigilancia', hidrantes.fn_config('ultima_vigilancia', 'null'),
    'vigilancia_ok', hidrantes.fn_config('vigilancia_ok', 'null'),
    'dispositivos_activos', (select count(*) from hidrantes.dispositivos where revocado_en is null
                               and ultimo_uso > now() - interval '90 days'),
    'intentos_fallidos_24h', (select count(*) from hidrantes.intentos_codigo
                                where momento > now() - interval '24 hours' and not exito and not bloqueado),
    'topes_alcanzados_24h', (select count(*) from hidrantes.intentos_codigo
                               where momento > now() - interval '24 hours' and bloqueado),
    -- Los del código para todo el grupo, más uno por cada tope global (subidas, propuestas) lleno ahora.
    'topes_globales_24h', (select count(*) from hidrantes.intentos_codigo
                             where momento > now() - interval '24 hours' and bloqueado
                               and tope in ('global', 'altas_global'))
                          + case when subidas_24h >= (hidrantes.fn_config('max_subidas_dia_total', '150') #>> '{}')::int
                                 then 1 else 0 end
                          + case when propuestas_hoy >= (hidrantes.fn_config('max_propuestas_dia_total', '600') #>> '{}')::int
                                 then 1 else 0 end,
    -- Móviles con el código bueno que un tope de canjes buenos no ha dejado entrar (RV-300).
    'entradas_frenadas_24h', hidrantes.fn_entradas_frenadas_24h(),
    -- Hasta cuándo está abierta la entrada para todos; null si está cerrada (RV-300).
    'entrada_abierta_hasta', to_jsonb(hidrantes.fn_entrada_abierta_hasta()),
    'subidas_24h', subidas_24h,
    'propuestas_hoy', propuestas_hoy,
    'max_propuestas_dia_total', (hidrantes.fn_config('max_propuestas_dia_total', '600') #>> '{}')::int,
    -- Canjes con el código bueno y el dispositivo_id de un administrador (0039, RV-143).
    'dispositivos_reservados_24h', (select count(*) from hidrantes.intentos_codigo
                                     where momento > now() - interval '24 hours' and tope = 'dispositivo_reservado'),
    -- Espacio de fotos (RV-220): el bucket, y el porcentaje contando 5 MB por reserva abierta.
    'fotos_bytes', espacio.bytes,
    'fotos_origen', espacio.origen,
    'reservas_abiertas', espacio.abiertas,
    'max_bytes_fotos', max_fotos,
    'fotos_pct', round((espacio.bytes + espacio.abiertas::bigint * 5242880) * 100.0 / greatest(max_fotos, 1), 1),
    -- Los 5 móviles de voluntario con más reservas en 24 h, con 8 caracteres de su id (RV-220, RV-262).
    'reservas_dispositivos_24h', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'dispositivo', left(t.dispositivo_id::text, 8), 'reservas', t.reservas, 'abiertas', t.abiertas,
               'revocado', hidrantes.fn_dispositivo_liberado(t.dispositivo_id))
             order by t.reservas desc, t.dispositivo_id), '[]'::jsonb)
      from (select s.dispositivo_id, count(*)::int as reservas,
                   (count(*) filter (where s.confirmada_en is null and s.liberada_en is null
                                       and s.reservada_en > now() - interval '2 hours'))::int as abiertas
              from hidrantes.subidas s
             where s.reservada_en > now() - interval '1 day' and not hidrantes.fn_es_dispositivo_admin(s.dispositivo_id)
             group by s.dispositivo_id
             order by 2 desc, 1
             limit 5) t),
    -- El tope (max_bytes_bd) mide el esquema (RV-301); bd_bytes es toda la base de datos (también
    -- uniformidad), con el tope del plan (500 MB).
    'bd_bytes', bd,
    'max_bytes_bd', max_bd,
    'esquema_bytes', esquema,
    'bd_pct', round(esquema * 100.0 / greatest(max_bd, 1), 1),
    'max_bytes_bd_total', 524288000,
    'bd_total_pct', round(bd * 100.0 / 524288000, 1),
    'tareas', tareas
  ) || origen;
end $$;

-- ---------- 6. avisos de jefatura en el mismo navegador (RV-323) ----------

-- ¿Tiene ese endpoint alguna fila de administrador? Solo sí o no, sin de quién ni de qué. Para que
-- la app, al apagar los avisos del voluntario, no dé de baja en el navegador una suscripción que
-- también usa jefatura (aunque su sesión del panel esté cerrada). Volatile: fn_validar_token anota
-- ultimo_uso.
create function hidrantes.fn_endpoint_tiene_jefatura(token text, endpoint text) returns boolean
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes as $$
#variable_conflict use_variable
begin
  perform hidrantes.fn_validar_token(token);
  if coalesce(trim(endpoint), '') = '' or length(endpoint) > 2000 then
    perform hidrantes.fn_error('PAYLOAD_INVALIDO(endpoint)', 'Falta el endpoint');
  end if;
  return exists (select 1 from hidrantes.suscripciones_push s
                  where s.dispositivo_id is null and s.suscripcion ->> 'endpoint' = endpoint);
end $$;

-- ---------- permisos ----------

revoke all on function hidrantes.fn_entrada_abierta_hasta() from public, anon, authenticated;
revoke all on function hidrantes.fn_poner_entrada(timestamptz, text) from public, anon, authenticated;
revoke all on function hidrantes.fn_entradas_frenadas_24h() from public, anon, authenticated;
revoke all on function hidrantes.fn_bytes_esquema() from public, anon, authenticated;
revoke all on function hidrantes.fn_bytes_tabla(text, text) from public, anon, authenticated;
revoke all on function hidrantes.fn_purgar_registros_cron() from public, anon, authenticated;
revoke all on function hidrantes.fn_cron_purga_con_permiso() from public, anon, authenticated;

revoke all on function hidrantes.fn_abrir_entrada(integer) from public, anon, authenticated;
grant execute on function hidrantes.fn_abrir_entrada(integer) to authenticated;
revoke all on function hidrantes.fn_cerrar_entrada() from public, anon, authenticated;
grant execute on function hidrantes.fn_cerrar_entrada() to authenticated;

revoke all on function hidrantes.fn_liberar_reservas(text, text[]) from public;
grant execute on function hidrantes.fn_liberar_reservas(text, text[]) to anon, authenticated;
revoke all on function hidrantes.fn_endpoint_tiene_jefatura(text, text) from public;
grant execute on function hidrantes.fn_endpoint_tiene_jefatura(text, text) to anon, authenticated;

-- RV-306 (#472): la firma de 0005 ya no es de nadie más que de su dueño. /api/error usa la de seis
-- argumentos con service_role (0040).
revoke execute on function hidrantes.fn_registrar_error(uuid, text, text, text, text) from anon, authenticated;
