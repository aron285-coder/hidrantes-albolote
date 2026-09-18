-- 0001 · Esquema base: enums, secuencias, tablas, constraints, índices y triggers (05 §1–§3).
-- Se aplica como hidrantes_migrador (DEC-052). PostGIS y pg_cron los instala arranque-bd.sql.

-- Ninguna función nace ejecutable por PUBLIC: cada RPC concede su execute de forma explícita
-- (05 §5). Sin esto, Postgres da execute a PUBLIC por defecto y anon podría llamarlas.
alter default privileges in schema hidrantes revoke execute on functions from public;
alter default privileges in schema hidrantes revoke all on tables from public;
alter default privileges in schema hidrantes revoke all on sequences from public;

-- ---------- 1. Enums ----------

create type hidrantes.tipo_punto        as enum ('hidrante', 'boca_riego');
create type hidrantes.estado_caudal     as enum ('bueno', 'regular', 'malo', 'no_funciona');
create type hidrantes.tipo_racor        as enum ('granada', 'barcelona', 'otro');
create type hidrantes.operacion         as enum ('alta', 'revision', 'estado', 'datos', 'ubicacion', 'retirada');
create type hidrantes.estado_moderacion as enum ('pendiente', 'aprobada', 'rechazada', 'retirada_por_autor');
create type hidrantes.situacion_punto   as enum ('activo', 'retirado', 'borrado');
create type hidrantes.origen_ubicacion  as enum ('gps', 'manual');
create type hidrantes.municipio         as enum ('albolote', 'calicasas', 'fuera_de_zona');
create type hidrantes.estado_incidencia as enum ('abierta', 'resuelta');

-- ---------- 3. Secuencias ----------

create sequence hidrantes.seq_codigo_hidrante as integer minvalue 1 maxvalue 9999;
create sequence hidrantes.seq_codigo_boca     as integer minvalue 1 maxvalue 9999;

-- ---------- 2.1 puntos ----------

create table hidrantes.puntos (
  id                    uuid primary key default gen_random_uuid(),
  codigo                text not null unique check (codigo ~ '^(HID|BOC)-[0-9]{4}$'),
  tipo                  hidrantes.tipo_punto not null,
  geom                  extensions.geography(Point, 4326) not null,
  diametro_mm           smallint not null,
  caudal                hidrantes.estado_caudal not null,
  racor                 hidrantes.tipo_racor,
  descripcion_fallo     text,
  descripcion           text,
  direccion             text,
  foto_path             text not null check (length(trim(foto_path)) > 0),
  municipio             hidrantes.municipio not null,
  nucleo                text,
  situacion             hidrantes.situacion_punto not null default 'activo',
  fecha_ultima_revision date not null,
  creado_en             timestamptz not null default now(),
  actualizado_en        timestamptz not null default now(),
  borrado_en            timestamptz,
  constraint puntos_diametro_boca    check (tipo <> 'boca_riego' or diametro_mm = 45),
  constraint puntos_diametro_hidrante check (tipo <> 'hidrante' or diametro_mm in (70, 100)),
  constraint puntos_racor_solo_boca  check ((tipo = 'boca_riego') = (racor is not null)),
  -- coalesce: un check que da NULL se considera cumplido; sin él, NULL colaría (DEC-058)
  constraint puntos_fallo_descrito   check (caudal <> 'no_funciona' or coalesce(length(trim(descripcion_fallo)), 0) > 0),
  -- defensa contra coordenadas corruptas
  constraint puntos_coordenadas      check (
    extensions.st_x(geom::extensions.geometry) between -4.5 and -2.5
    and extensions.st_y(geom::extensions.geometry) between 36.6 and 38.2
  ),
  constraint puntos_borrado_fechado  check ((situacion = 'borrado') = (borrado_en is not null))
);

create index puntos_geom_idx           on hidrantes.puntos using gist (geom);
create index puntos_actualizado_en_idx on hidrantes.puntos (actualizado_en);
create index puntos_situacion_idx      on hidrantes.puntos (situacion);
create index puntos_revision_idx       on hidrantes.puntos (fecha_ultima_revision);

-- ---------- 2.2 propuestas ----------

create table hidrantes.propuestas (
  id                    uuid primary key default gen_random_uuid(),
  punto_id              uuid references hidrantes.puntos (id),
  operacion             hidrantes.operacion not null,
  datos                 jsonb not null default '{}'::jsonb check (jsonb_typeof(datos) = 'object'),
  autor_nombre          text not null,
  autor_apellido        text not null,
  dispositivo_id        uuid not null,
  clave_local           text not null unique,
  origen_ubicacion      hidrantes.origen_ubicacion,
  geom                  extensions.geography(Point, 4326),
  gps_geom              extensions.geography(Point, 4326),
  precision_gps_m       real,
  exif_geom             extensions.geography(Point, 4326),
  distancia_gps_m       real,
  duplicado_de          uuid references hidrantes.puntos (id),
  distancia_duplicado_m real,
  direccion_sugerida    text,
  foto_path             text,
  estado                hidrantes.estado_moderacion not null default 'pendiente',
  motivo_rechazo        text,
  correcciones          jsonb check (correcciones is null or jsonb_typeof(correcciones) = 'object'),
  revisada_por          text,
  revisada_en           timestamptz,
  creada_en             timestamptz not null default now(),
  constraint propuestas_alta_sin_punto check ((operacion = 'alta') = (punto_id is null)),
  constraint propuestas_rechazo_motivado check (estado <> 'rechazada' or coalesce(length(trim(motivo_rechazo)), 0) > 0),
  constraint propuestas_foto check (
    operacion not in ('alta', 'revision', 'estado', 'ubicacion', 'retirada') or foto_path is not null
  ),
  constraint propuestas_ubicacion check (
    operacion not in ('alta', 'ubicacion') or (geom is not null and origen_ubicacion is not null)
  )
);

create index propuestas_dispositivo_idx on hidrantes.propuestas (dispositivo_id);
create index propuestas_estado_idx      on hidrantes.propuestas (estado, creada_en);
create index propuestas_punto_idx       on hidrantes.propuestas (punto_id);
create index propuestas_duplicado_idx   on hidrantes.propuestas (duplicado_de);

-- ---------- 2.3 registro (append-only) ----------

create table hidrantes.registro (
  id             bigint generated always as identity primary key,
  momento        timestamptz not null default now(),
  actor          text not null,
  dispositivo_id uuid,
  es_admin       boolean not null,
  accion         text not null check (accion in (
    'propuesta_creada', 'propuesta_retirada_autor', 'aprobacion', 'aprobacion_con_correcciones',
    'rechazo', 'fusion', 'edicion_admin', 'retirada', 'borrado', 'restauracion', 'purga_papelera',
    'codigo_cambiado', 'dispositivos_revocados', 'administrador_alta', 'administrador_baja',
    'config_cambiada', 'incidencia_resuelta', 'anonimizacion', 'exportacion', 'workflow_lanzado'
  )),
  punto_id       uuid,
  propuesta_id   uuid,
  antes          jsonb,
  despues        jsonb
);

create index registro_momento_idx on hidrantes.registro (momento);
create index registro_punto_idx   on hidrantes.registro (punto_id);
create index registro_dispositivo_idx on hidrantes.registro (dispositivo_id);

-- ---------- 2.4 dispositivos ----------

create table hidrantes.dispositivos (
  id             uuid primary key default gen_random_uuid(),
  dispositivo_id uuid not null,
  token_hash     text not null unique,
  emitido_en     timestamptz not null default now(),
  ultimo_uso     timestamptz not null default now(),
  revocado_en    timestamptz
);

create index dispositivos_dispositivo_idx on hidrantes.dispositivos (dispositivo_id);

-- ---------- 2.5 intentos_codigo ----------

create table hidrantes.intentos_codigo (
  id             bigint generated always as identity primary key,
  dispositivo_id uuid,
  ip_hash        text,
  momento        timestamptz not null default now(),
  exito          boolean not null
);

create index intentos_dispositivo_idx on hidrantes.intentos_codigo (dispositivo_id, momento);
create index intentos_ip_idx          on hidrantes.intentos_codigo (ip_hash, momento);
create index intentos_momento_idx     on hidrantes.intentos_codigo (momento);

-- ---------- 2.6 subidas ----------

create table hidrantes.subidas (
  id             uuid primary key default gen_random_uuid(),
  dispositivo_id uuid not null,
  foto_path      text not null unique,
  reservada_en   timestamptz not null default now(),
  confirmada_en  timestamptz
);

create index subidas_dispositivo_idx on hidrantes.subidas (dispositivo_id, reservada_en);

-- ---------- 2.7 incidencias_app ----------

create table hidrantes.incidencias_app (
  id             uuid primary key default gen_random_uuid(),
  momento        timestamptz not null default now(),
  dispositivo_id uuid not null,
  descripcion    text not null check (length(descripcion) between 1 and 2000),
  version_app    text,
  ruta           text,
  estado         hidrantes.estado_incidencia not null default 'abierta',
  resuelta_por   text,
  resuelta_en    timestamptz,
  constraint incidencias_resuelta check ((estado = 'resuelta') = (resuelta_en is not null))
);

create index incidencias_estado_idx on hidrantes.incidencias_app (estado, momento);
create index incidencias_dispositivo_idx on hidrantes.incidencias_app (dispositivo_id, momento);

-- ---------- 2.8 errores_cliente ----------

create table hidrantes.errores_cliente (
  id             bigint generated always as identity primary key,
  momento        timestamptz not null default now(),
  dispositivo_id uuid,
  mensaje        text,
  pila           text check (pila is null or length(pila) <= 4096),
  ruta           text,
  agente         text
);

create index errores_momento_idx on hidrantes.errores_cliente (momento);
create index errores_dispositivo_idx on hidrantes.errores_cliente (dispositivo_id, momento);

-- ---------- 2.9 administradores ----------

create table hidrantes.administradores (
  email      text primary key check (email = lower(email) and email like '%@%'),
  activo     boolean not null default true,
  creado_en  timestamptz not null default now(),
  creado_por text not null
);

-- ---------- 2.10 config ----------

create table hidrantes.config (
  clave           text primary key,
  valor           jsonb not null,
  actualizado_en  timestamptz not null default now(),
  actualizado_por text
);

-- ---------- 2.11 geometrías de la zona (las carga cargar-zona.ts) ----------

create table hidrantes.limite_municipal (
  municipio hidrantes.municipio primary key check (municipio <> 'fuera_de_zona'),
  geom      extensions.geography(MultiPolygon, 4326) not null,
  version   text not null
);

create table hidrantes.nucleos (
  nombre    text primary key,
  municipio hidrantes.municipio not null check (municipio <> 'fuera_de_zona'),
  geom      extensions.geography(Point, 4326) not null,
  version   text not null
);

create index limite_geom_idx  on hidrantes.limite_municipal using gist (geom);
create index nucleos_geom_idx on hidrantes.nucleos using gist (geom);

-- ---------- 2.12 suscripciones_push ----------

create table hidrantes.suscripciones_push (
  id             uuid primary key default gen_random_uuid(),
  dispositivo_id uuid,
  email          text,
  suscripcion    jsonb not null check (suscripcion ? 'endpoint'),
  temas          text[] not null default '{}',
  creada_en      timestamptz not null default now(),
  ultimo_envio   timestamptz,
  fallos         smallint not null default 0,
  constraint suscripciones_duenio check ((dispositivo_id is null) <> (email is null))
);

create unique index suscripciones_endpoint_idx on hidrantes.suscripciones_push ((suscripcion ->> 'endpoint'));

-- ---------- 2.13 notificaciones ----------

create table hidrantes.notificaciones (
  id             bigint generated always as identity primary key,
  suscripcion_id uuid not null references hidrantes.suscripciones_push (id) on delete cascade,
  titulo         text not null,
  cuerpo         text not null,
  url            text,
  creada_en      timestamptz not null default now(),
  enviada_en     timestamptz,
  error          text
);

create index notificaciones_pendientes_idx on hidrantes.notificaciones (creada_en) where enviada_en is null;
create index notificaciones_suscripcion_idx on hidrantes.notificaciones (suscripcion_id);

-- ---------- Triggers ----------

create function hidrantes.tg_actualizado_en() returns trigger
language plpgsql set search_path = pg_catalog as $$
begin
  new.actualizado_en := now();
  return new;
end $$;

create trigger puntos_actualizado_en before update on hidrantes.puntos
  for each row execute function hidrantes.tg_actualizado_en();
create trigger config_actualizado_en before update on hidrantes.config
  for each row execute function hidrantes.tg_actualizado_en();

-- registro es append-only (05 §2.3): segunda capa además de no conceder update/delete.
-- Única excepción: fn_anonimizar_autor (11 §7) puede reescribir `actor` y nada más, y solo si
-- activa hidrantes.anonimizando en su propia transacción.
create function hidrantes.tg_registro_inmutable() returns trigger
language plpgsql set search_path = pg_catalog as $$
begin
  if tg_op = 'UPDATE'
     and coalesce(current_setting('hidrantes.anonimizando', true), '') = 'on'
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

create trigger registro_inmutable before update or delete on hidrantes.registro
  for each row execute function hidrantes.tg_registro_inmutable();
create trigger registro_sin_truncate before truncate on hidrantes.registro
  for each statement execute function hidrantes.tg_registro_inmutable();

-- ---------- Códigos estables (05 §3) ----------

create function hidrantes.fn_siguiente_codigo(tipo hidrantes.tipo_punto) returns text
language sql volatile set search_path = pg_catalog, hidrantes as $$
  select case tipo
    when 'hidrante'   then 'HID-' || lpad(nextval('hidrantes.seq_codigo_hidrante')::text, 4, '0')
    when 'boca_riego' then 'BOC-' || lpad(nextval('hidrantes.seq_codigo_boca')::text, 4, '0')
  end;
$$;
