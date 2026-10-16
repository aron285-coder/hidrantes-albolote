-- 0051 · La base de datos vigila que las tareas sigan vivas (docs/39 RV-517, DEC-220).
--
-- El respaldo, la vigilancia diaria y el despachador corren en GitHub Actions; si GitHub los para (60 días sin actividad
-- en el repositorio, por ejemplo), nadie se entera hasta mirar Salud. Una tarea pg_cron diaria manda el aviso técnico
-- `tareas_paradas` a jefatura si la vigilancia lleva más de 36 h sin pasar o el respaldo más de 9 días (este, solo con
-- config.vigilar_respaldo a true, que es lo de por defecto). Como mucho uno cada 24 h (fn_encolar_aviso_tecnico).
-- El Worker de avisos lo entrega sin GitHub.

-- ---------- 1. la clave nueva ----------

alter table hidrantes.avisos_tecnicos drop constraint if exists avisos_tecnicos_clave_check;
alter table hidrantes.avisos_tecnicos add constraint avisos_tecnicos_clave_check
  check (clave in ('vigilancia', 'respaldo', 'despliegue', 'intentos_codigo', 'tareas_paradas'));

-- ---------- 2. su texto fijo ----------
-- El cuerpo de 0045 con una clave más. Misma firma y mismos permisos.
create or replace function hidrantes.fn_encolar_aviso_tecnico(clave text, titulo text, cuerpo text,
                                                               url text default '/admin/ajustes') returns boolean
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes
set lock_timeout = '5s' as $$
declare
  texto_fijo text;
  t text := nullif(trim(fn_encolar_aviso_tecnico.titulo), '');
  c text := nullif(trim(fn_encolar_aviso_tecnico.cuerpo), '');
  u text := coalesce(nullif(trim(fn_encolar_aviso_tecnico.url), ''), '/admin/ajustes');
  plazo interval;
  ultimo timestamptz;
  n integer;
begin
  -- Los textos fijos de cada clave (06, Apéndice A).
  texto_fijo := case fn_encolar_aviso_tecnico.clave
    when 'vigilancia' then 'La comprobación diaria ha encontrado un problema. El desarrollador ya tiene el aviso. Mira Salud del sistema.'
    when 'respaldo' then 'El respaldo de esta semana ha fallado.'
    when 'despliegue' then 'La última actualización no se ha podido instalar entera.'
    when 'intentos_codigo' then 'Alguien está probando códigos de acceso. Si se repite, cambia el código en Ajustes.'
    when 'tareas_paradas' then 'Las tareas automáticas (comprobación diaria o respaldo) llevan días sin hacerse. Avisa al desarrollador.'
  end;
  if texto_fijo is null then
    perform hidrantes.fn_error('PAYLOAD_INVALIDO(clave)', 'Clave de aviso no admitida');
  end if;
  if length(t) > 80 then
    perform hidrantes.fn_error('PAYLOAD_INVALIDO(titulo)', 'El título tiene como mucho 80 caracteres');
  end if;
  if length(c) > 300 then
    perform hidrantes.fn_error('PAYLOAD_INVALIDO(cuerpo)', 'El texto tiene como mucho 300 caracteres');
  end if;
  -- Solo una ruta de la propia app.
  if u !~ '^/[A-Za-z0-9_-][A-Za-z0-9/_?=&.-]*$' or length(u) > 200 then
    perform hidrantes.fn_error('PAYLOAD_INVALIDO(url)', 'La dirección es una ruta de la app');
  end if;
  plazo := case when fn_encolar_aviso_tecnico.clave = 'intentos_codigo' then interval '1 hour'
                else interval '24 hours' end;

  -- La fila de la clave, bloqueada: dos llamadas a la vez no encolan dos veces.
  insert into hidrantes.avisos_tecnicos (clave, ultimo_en)
  values (fn_encolar_aviso_tecnico.clave, null)
  on conflict do nothing;
  select a.ultimo_en into ultimo
    from hidrantes.avisos_tecnicos a
   where a.clave = fn_encolar_aviso_tecnico.clave
     for update;
  if ultimo is not null and ultimo > now() - plazo then
    return false;
  end if;

  -- Solo jefatura (fila sin dispositivo) de un administrador activo, con el tema. Ninguna de voluntario.
  insert into hidrantes.notificaciones (suscripcion_id, titulo, cuerpo, url)
  select s.id, coalesce(t, 'Aviso técnico'), coalesce(c, texto_fijo), u
    from hidrantes.suscripciones_push s
    join hidrantes.administradores a on a.email = s.email and a.activo
   where s.dispositivo_id is null and 'avisos_tecnicos' = any (s.temas);
  get diagnostics n = row_count;
  if n = 0 then
    -- Sin nadie a quien avisar no cuenta como emitido: el siguiente intento vuelve a probar.
    return false;
  end if;
  update hidrantes.avisos_tecnicos a set ultimo_en = now() where a.clave = fn_encolar_aviso_tecnico.clave;
  return true;
end $$;

-- ---------- 3. la comprobación ----------

-- Devuelve si ha encolado el aviso. La ejecuta pg_cron como hidrantes_migrador (dueño de las tareas, 0004).
create or replace function hidrantes.fn_vigilar_tareas() returns boolean
language plpgsql volatile security definer set search_path = pg_catalog, hidrantes as $$
declare
  vigilancia timestamptz;
  respaldo timestamptz;
  mirar_respaldo boolean := true;
begin
  begin
    mirar_respaldo := coalesce((hidrantes.fn_config('vigilar_respaldo', 'true') #>> '{}')::boolean, true);
  exception when others then
    mirar_respaldo := true;   -- un valor que no se puede leer: se vigila, que es lo de por defecto
  end;
  begin
    vigilancia := (hidrantes.fn_config('ultima_vigilancia', 'null') #>> '{}')::timestamptz;
  exception when others then
    vigilancia := null;   -- un valor que no se puede leer cuenta como que falta
  end;
  begin
    respaldo := (hidrantes.fn_config('ultimo_respaldo', 'null') #>> '{}')::timestamptz;
  exception when others then
    respaldo := null;
  end;
  if vigilancia is null or vigilancia < now() - interval '36 hours'
     or (mirar_respaldo and (respaldo is null or respaldo < now() - interval '9 days')) then
    return hidrantes.fn_encolar_aviso_tecnico('tareas_paradas', null, null, '/admin/ajustes');
  end if;
  return false;
end $$;
revoke all on function hidrantes.fn_vigilar_tareas() from public, anon, authenticated;

-- ---------- 4. la tarea ----------

select cron.schedule('hidrantes_vigilar_tareas', '0 8 * * *', $$select hidrantes.fn_vigilar_tareas()$$);
