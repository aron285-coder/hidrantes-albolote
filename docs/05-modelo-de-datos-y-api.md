# 05 · Modelo de datos y contrato de API — Mapa de hidrantes

| | |
|---|---|
| **Estado** | Congelado. Cambia con conformidad de jefatura (si afecta a datos que ve) y nueva versión; todo cambio arrastra una entrada en 12 y una migración nueva. |
| **Versión** | 1.4 — 20 de septiembre de 2026. v1.1 añadió push, exportación y las Functions nuevas; v1.2 añade §12 (concurrencia y aislamiento en las escrituras), tras la revisión de la app de uniformidad (DEC-048); v1.3 ajusta lo aprendido al construir la Fase 2 (DEC-058) y la Fase 3 (DEC-059); v1.4 añade a `v_cola_revision` el núcleo y la fecha del punto que necesita el panel (DEC-065, migración 0008). |
| **Propietario de** | **campos, tipos, constraints, índices, vistas, políticas RLS, firmas de las RPC y contrato HTTP de las Pages Functions.** El documento más consultado durante la construcción; 04 y 09 lo citan, no lo repiten. |
| **No contiene** | la motivación de las decisiones (→ 04, 12) ni las reglas funcionales (→ 01, citadas por `FR-nn`). |

Convenciones: esquema **`hidrantes`** para todo; identificadores en español, `snake_case`; `uuid`
como clave primaria salvo donde se indica; tiempos en `timestamptz` (UTC). Los tipos son los de
Postgres 15 con PostGIS.

---

## 1. Enums

```sql
create type hidrantes.tipo_punto        as enum ('hidrante', 'boca_riego');
create type hidrantes.estado_caudal     as enum ('bueno', 'regular', 'malo', 'no_funciona');  -- "No funciona" en la UI
create type hidrantes.tipo_racor        as enum ('granada', 'barcelona', 'otro');
create type hidrantes.operacion         as enum ('alta', 'revision', 'estado', 'datos', 'ubicacion', 'retirada');
create type hidrantes.estado_moderacion as enum ('pendiente', 'aprobada', 'rechazada', 'retirada_por_autor');
create type hidrantes.situacion_punto   as enum ('activo', 'retirado', 'borrado');
create type hidrantes.origen_ubicacion  as enum ('gps', 'manual');
create type hidrantes.municipio         as enum ('albolote', 'calicasas', 'fuera_de_zona');
create type hidrantes.estado_incidencia as enum ('abierta', 'resuelta');
```

`diametro_mm` es `smallint` con constraint, no enum (FR-16). Añadir un valor de enum es una
migración de una línea; renombrar uno exige dos pasos (04 §12).

---

## 2. Tablas

### 2.1 `puntos` — estado actual aprobado (FR-10–FR-25)

| Columna | Tipo | Nulo | Notas |
|---|---|---|---|
| `id` | `uuid` | no | PK, `gen_random_uuid()` |
| `codigo` | `text` | no | `HID-####` / `BOC-####`, único, de `fn_siguiente_codigo` |
| `tipo` | `tipo_punto` | no | |
| `geom` | `geography(Point,4326)` | no | |
| `diametro_mm` | `smallint` | no | 45 / 70 / 100 |
| `caudal` | `estado_caudal` | no | |
| `racor` | `tipo_racor` | sí | solo bocas de riego |
| `descripcion_fallo` | `text` | sí | obligatoria si `caudal = 'no_funciona'` |
| `descripcion` | `text` | sí | libre; el seed usa prefijo `[PRUEBA]` |
| `direccion` | `text` | sí | deducida al revisar, corregible (FR-15) |
| `foto_path` | `text` | no | ruta en el bucket, `fotos/<uuid>.jpg` |
| `municipio` | `municipio` | no | deducido |
| `nucleo` | `text` | sí | deducido; `null` si fuera de zona |
| `situacion` | `situacion_punto` | no | default `activo` |
| `fecha_ultima_revision` | `date` | no | |
| `creado_en` | `timestamptz` | no | default `now()` |
| `actualizado_en` | `timestamptz` | no | trigger `before update` |
| `borrado_en` | `timestamptz` | sí | fijado al pasar a `borrado` |

Constraints:

```sql
check (tipo <> 'boca_riego' or diametro_mm = 45)
check (tipo <> 'hidrante'   or diametro_mm in (70, 100))
check ((tipo = 'boca_riego') = (racor is not null))
check (caudal <> 'no_funciona' or coalesce(length(trim(descripcion_fallo)), 0) > 0)  -- sin coalesce, NULL pasaría
check (st_x(geom::geometry) between -4.5 and -2.5 and st_y(geom::geometry) between 36.6 and 38.2)  -- defensa contra coordenadas corruptas
check ((situacion = 'borrado') = (borrado_en is not null))
```

Índices: `unique (codigo)`, `gist (geom)`, `btree (actualizado_en)`, `btree (situacion)`,
`btree (fecha_ultima_revision)`.

### 2.2 `propuestas` — cola de moderación (FR-26, FR-40–FR-49)

| Columna | Tipo | Nulo | Notas |
|---|---|---|---|
| `id` | `uuid` | no | PK |
| `punto_id` | `uuid` | sí | FK `puntos`; `null` si `operacion = 'alta'` |
| `operacion` | `operacion` | no | |
| `datos` | `jsonb` | no | solo los campos que cambian; forma en §7 |
| `autor_nombre` | `text` | no | |
| `autor_apellido` | `text` | no | |
| `dispositivo_id` | `uuid` | no | del móvil; para un administrador, `fn_dispositivo_admin(email)`: el mismo en cada sesión (DEC-059) |
| `clave_local` | `text` | no | idempotencia; **único** |
| `origen_ubicacion` | `origen_ubicacion` | sí | en alta y ubicación |
| `geom` | `geography(Point,4326)` | sí | pin final |
| `gps_geom` | `geography(Point,4326)` | sí | lectura GPS del móvil |
| `precision_gps_m` | `real` | sí | `accuracy` de la API de geolocalización |
| `exif_geom` | `geography(Point,4326)` | sí | coordenadas EXIF de la foto, si las tenía |
| `distancia_gps_m` | `real` | sí | calculada en `fn_proponer` |
| `duplicado_de` | `uuid` | sí | punto activo del mismo tipo a < `radio_duplicado_m`, si lo hay |
| `distancia_duplicado_m` | `real` | sí | |
| `direccion_sugerida` | `text` | sí | la escribe `/api/direccion` |
| `foto_path` | `text` | sí | obligatoria salvo en `retirada`… no: también en retirada (FR-46); `null` solo en `datos` si no se cambió la foto |
| `estado` | `estado_moderacion` | no | default `pendiente` |
| `motivo_rechazo` | `text` | sí | obligatorio si `rechazada` |
| `correcciones` | `jsonb` | sí | lo que jefatura cambió al aprobar |
| `revisada_por` | `text` | sí | email del administrador |
| `revisada_en` | `timestamptz` | sí | |
| `creada_en` | `timestamptz` | no | default `now()` |

Constraints:

```sql
check ((operacion = 'alta') = (punto_id is null))
check (estado <> 'rechazada' or coalesce(length(trim(motivo_rechazo)), 0) > 0)
check (operacion not in ('alta','revision','estado','ubicacion','retirada') or foto_path is not null)
check (operacion not in ('alta','ubicacion') or (geom is not null and origen_ubicacion is not null))
```

Índices: `unique (clave_local)`, `btree (dispositivo_id)`, `btree (estado, creada_en)`,
`btree (punto_id)`.

### 2.3 `registro` — auditoría *append-only* (FR-123)

| Columna | Tipo | Nulo | Notas |
|---|---|---|---|
| `id` | `bigint` | no | PK, identity |
| `momento` | `timestamptz` | no | default `now()` |
| `actor` | `text` | no | "Nombre Apellido" o email |
| `dispositivo_id` | `uuid` | sí | `null` si administrador |
| `es_admin` | `boolean` | no | |
| `accion` | `text` | no | vocabulario en §8 |
| `punto_id` | `uuid` | sí | |
| `propuesta_id` | `uuid` | sí | |
| `antes` | `jsonb` | sí | |
| `despues` | `jsonb` | sí | |

Sin `update` ni `delete` para ningún rol, con política **y** trigger `before update or delete` que
lanza excepción (dos capas: una política mal escrita es un error silencioso; un trigger no).
Única excepción: `fn_anonimizar_autor` puede reescribir `actor` (y nada más) activando
`hidrantes.anonimizando = 'on'` en su transacción (11 §7, DEC-058).

### 2.4 `dispositivos` — credenciales de móvil (FR-31, FR-35)

| Columna | Tipo | Nulo | Notas |
|---|---|---|---|
| `id` | `uuid` | no | PK |
| `dispositivo_id` | `uuid` | no | el que genera el móvil |
| `token_hash` | `text` | no | SHA-256 del token de 32 bytes; **único** |
| `emitido_en` | `timestamptz` | no | |
| `ultimo_uso` | `timestamptz` | no | |
| `revocado_en` | `timestamptz` | sí | |

Un `dispositivo_id` puede tener varios tokens en el tiempo (revocación y nuevo canje).

### 2.5 `intentos_codigo` — control de fuerza bruta (FR-33)

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `bigint` identity | |
| `dispositivo_id` | `uuid` | |
| `ip_hash` | `text` | `sha256(SAL_IP + ip)`, calculado en la Pages Function |
| `momento` | `timestamptz` | |
| `exito` | `boolean` | |

Índices sobre `(dispositivo_id, momento)`, `(ip_hash, momento)`, `(momento)`. Purga > 24 h por `pg_cron`.

### 2.6 `subidas` — reservas de foto (FR-38)

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `uuid` | PK |
| `dispositivo_id` | `uuid` | |
| `foto_path` | `text` | único |
| `reservada_en` | `timestamptz` | |
| `confirmada_en` | `timestamptz` | fijada por `fn_proponer` al usarla |

### 2.7 `incidencias_app` (FR-92, FR-132)

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `uuid` | PK |
| `momento` | `timestamptz` | |
| `dispositivo_id` | `uuid` | |
| `descripcion` | `text` | ≤ 2.000 caracteres |
| `version_app` | `text` | |
| `ruta` | `text` | pantalla |
| `estado` | `estado_incidencia` | default `abierta` |
| `resuelta_por` | `text` | email |
| `resuelta_en` | `timestamptz` | |

### 2.8 `errores_cliente` (TR-90)

`id bigint identity`, `momento timestamptz`, `dispositivo_id uuid`, `mensaje text`,
`pila text` (≤ 4 kB, truncada), `ruta text`, `agente text`. Borrado > 90 días por `pg_cron`.

### 2.9 `administradores` (FR-37, FR-141)

| Columna | Tipo | Notas |
|---|---|---|
| `email` | `text` | PK, en minúsculas |
| `activo` | `boolean` | default `true` |
| `creado_en` | `timestamptz` | |
| `creado_por` | `text` | email o `'migracion'` |

El propietario **no** va en una migración (repositorio público, DEC-053): lo da de alta
`scripts/asegurar-propietario.ts` en cada despliegue, desde el secreto `PROPIETARIO_EMAIL`, si no existe.

### 2.10 `config` — clave/valor (FR-142)

`clave text` PK, `valor jsonb`, `actualizado_en`, `actualizado_por`.

| Clave | Default | Uso |
|---|---|---|
| `codigo_acceso_hash` | (generado) | bcrypt del código (`crypt` de pgcrypto); con él se verifica |
| `codigo_acceso` | (generado) | el código en claro, solo legible por administradores, para verlo en Ajustes (FR-140, DEC-059) |
| `codigo_acceso_cambiado_en` | | |
| `codigo_acceso_cambiado_por` | | |
| `meses_revision` | `12` | FR-61, FR-121 |
| `radio_duplicado_m` | `25` | FR-51 |
| `buffer_zona_m` | `400` | FR-53 (informativo; el GeoJSON ya lleva el margen) |
| `dias_papelera` | `30` | FR-124 |
| `max_intentos_dispositivo` | `10` | por hora |
| `max_intentos_ip` | `30` | por hora |
| `max_intentos_global` | `200` | por hora |
| `dias_caducidad_token` | `365` | |
| `max_subidas_dispositivo_dia` | `40` | |
| `max_incidencias_dispositivo_dia` | `5` | |
| `max_errores_global_dia` | `2000` | |
| `escala_radios` | `[11, 9, 7, 5.5, 5]` | 06 §4 |
| `version_zona` | | fecha de `datos/meta.json` |
| `version_mapabase` | | ídem |
| `ultimo_respaldo` | | lo escribe el workflow |

`SAL_IP` **no** está aquí: vive en las variables de la Pages Function.

### 2.11 `limite_municipal`, `nucleos` — geometrías de la zona

`limite_municipal(municipio municipio PK, geom geography(MultiPolygon,4326), version text)`;
`nucleos(nombre text PK, municipio municipio, geom geography(Point,4326), version text)`.
Las carga `scripts/cargar-zona.ts` con `upsert`; no van por migración.

### 2.12 `suscripciones_push` (FR-163–164)

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `uuid` | PK |
| `dispositivo_id` | `uuid` | voluntario; `null` si es administrador |
| `email` | `text` | administrador; `null` si es voluntario |
| `suscripcion` | `jsonb` | `endpoint`, `keys.p256dh`, `keys.auth` |
| `temas` | `text[]` | `{resultado_propuesta}` para voluntarios; `{nuevas_propuestas, resumen_semanal}` para administradores |
| `creada_en`, `ultimo_envio`, `fallos` | | tres fallos seguidos → se borra |

### 2.13 `notificaciones` — cola de envío

`id bigint identity`, `suscripcion_id uuid`, `titulo text`, `cuerpo text` (sin nombres de personas, FR-27), `url text`,
`creada_en`, `enviada_en`, `error text`. Las escriben `fn_aprobar`, `fn_rechazar`, `fn_fusionar_con_existente`
(resultado al autor) y `fn_proponer` (aviso a administradores, agrupado por hora). Las envía
`/api/push`; se purgan a los 30 días por `pg_cron`.

### 2.14 `migraciones_aplicadas`

`archivo text PK, hash text, aplicada_en timestamptz`. Historial propio de `migrar.ts`; nunca se usa
`supabase db push` (04 §5).

---

## 3. Secuencias y códigos

`seq_codigo_hidrante`, `seq_codigo_boca`. `fn_siguiente_codigo(tipo)` devuelve
`'HID-' || lpad(nextval(...)::text, 4, '0')` o `'BOC-…'`. Nunca `max(codigo)+1`.
`promover-piloto.ts` avanza las secuencias con `setval` por encima del máximo importado.

---

## 4. Vistas (`security_invoker = true`)

| Vista | Contenido |
|---|---|
| `v_puntos_activos` | `puntos` con `situacion = 'activo'` más `radio_px` (06 §4, calculado con `config.escala_radios`), `revision_caducada boolean` (`fecha_ultima_revision < current_date - meses_revision`), `lat`, `lng`, `foto_path`. La URL pública de la foto la compone el cliente con la URL de Supabase y el bucket del entorno (DEC-058). Es lo que ve el mapa. **Sin columnas de autor** — `puntos` no las tiene; los nombres solo existen en `propuestas` y `registro`, que `anon` no puede leer (FR-27). |
| `v_cola_revision` | propuestas con `estado = 'pendiente'` más el punto afectado, el diff (`antes`/`despues` calculados), y señales: `origen_ubicacion`, `precision_gps_m`, `distancia_gps_m`, `distancia_exif_m`, `fuera_de_zona`, `meses_desde_revision`, `duplicado_de` + `distancia_duplicado_m`, `otra_medida boolean`, `desactualizada boolean` (`puntos.actualizado_en > propuestas.creada_en`), `nucleo` (el del punto o, en un alta, el deducido del pin) y `punto_actualizado_en` (DEC-065). |
| `v_revisiones_caducadas` | puntos activos con `revision_caducada`, con `direccion` o coordenadas, agrupables por `nucleo`. |
| `v_registro` | `registro` legible: `momento`, `actor`, `accion`, `codigo` del punto, resumen. |

Como llevan `security_invoker`, se evalúan con los permisos de quien consulta: sin política en la
tabla base, la vista no devuelve nada. Cada RPC se prueba con el rol previsto (pgTAP).

---

## 5. Permisos y RLS

| Rol | Tablas y vistas | RPC |
|---|---|---|
| `anon` | **ningún** acceso directo | `execute` sobre las RPC de voluntario (§6.1) salvo `fn_verificar_codigo` y `fn_reservar_subida` |
| `authenticated` | `select` sobre tablas base **condicionado a `fn_es_admin()`** (política por tabla) | `execute` sobre RPC de voluntario y de administrador; las de administrador vuelven a comprobar `fn_es_admin()` |
| `service_role` | todo | `fn_verificar_codigo`, `fn_reservar_subida`, `fn_fotos_referenciadas`, más las anteriores |

Reglas: RLS activado en todas las tablas y cada una con al menos una política (un `enable row level
security` sin políticas bloquea todo, incluidas las RPC mal declaradas); `registro` sin `update` ni
`delete`; `fn_verificar_codigo` **revocado** para `anon` y `authenticated` (test pgTAP: *permission
denied*).

Storage (bucket `hidrantes-fotos`): sin políticas de `insert`/`update`/`delete`/`list` para `anon` ni
`authenticated`; `select` público; límite 5 MB; `allowed_mime_types = {image/jpeg, image/webp}`.
No hace falta ninguna política sobre `storage.objects`: la lectura va por el bucket público y la
subida por URL firmada de `service_role` (DEC-055).

Los helpers que usan las vistas (`fn_es_admin`, `fn_config`, `fn_radio_px`, `fn_municipio_de`)
tienen `execute` para `authenticated`: las vistas son `security_invoker` y las políticas se evalúan
con el rol de quien consulta. Toda otra función nace sin `execute` para `PUBLIC` (privilegios por
defecto de 0001).

---

## 6. Funciones RPC

Todas `SECURITY DEFINER`, `set search_path = pg_catalog, hidrantes, extensions` (PostGIS y pgcrypto
viven en `extensions`; `public` es de uniformidad), en `language plpgsql`. Los errores
se lanzan con `raise exception using errcode = 'P0001', message = '<código>: <texto en español>'`
(vocabulario en §8). Las RPC de voluntario empiezan por `fn_validar_token(token)`; las de
administrador por `fn_es_admin()`.

### 6.1 Voluntario

```sql
-- Solo service_role (la llama /api/verificar-codigo). Tiempo de respuesta constante.
fn_verificar_codigo(codigo text, dispositivo_id uuid, ip_hash text)
  returns table (token text, caduca_en timestamptz, error text)
  -- error en la columna, no lanzado: una excepción desharía la anotación del intento (DEC-059).
  -- error: CODIGO_INCORRECTO · DEMASIADOS_INTENTOS (dispositivo | ip | global). Solo cuentan los fallos.

-- Helper: devuelve el dispositivo_id, actualiza ultimo_uso.
fn_validar_token(token text) returns uuid
  -- errores: TOKEN_INVALIDO · TOKEN_REVOCADO · TOKEN_CADUCADO

fn_listar_puntos(token text, desde timestamptz default null)
  returns jsonb  -- { puntos: v_puntos_activos[], bajas: uuid[], sincronizado_en, config: {meses_revision, radio_duplicado_m, escala_radios, version_zona, version_mapabase} }

fn_ficha_punto(token text, punto_id uuid) returns jsonb
  -- sin historial ni autores. error: PUNTO_NO_ENCONTRADO

-- Solo service_role (la llama /api/url-subida).
fn_reservar_subida(token text) returns text  -- foto_path
  -- errores: CUOTA_SUBIDAS_AGOTADA
-- Jefatura desde el móvil (authenticated + fn_es_admin): misma cuota, su dispositivo técnico.
fn_reservar_subida_admin() returns text

fn_proponer(
  token text, clave_local text, autor_nombre text, autor_apellido text,
  operacion operacion, punto_id uuid, datos jsonb,
  origen origen_ubicacion, lat double precision, lng double precision,
  gps_lat double precision, gps_lng double precision, precision_gps_m real,
  exif_lat double precision, exif_lng double precision,
  foto_path text
) returns jsonb  -- { propuesta_id, estado, aplicada boolean, codigo }
  -- idempotente por clave_local: si existe, devuelve la existente sin crear otra.
  -- si quien llama es authenticated + fn_es_admin(): aplica vía fn_aprobar y devuelve aplicada = true.
  -- errores: PAYLOAD_INVALIDO(<campo>) · FOTO_OBLIGATORIA · FOTO_NO_RESERVADA · PUNTO_NO_ACTIVO

fn_mis_propuestas(token text) returns setof jsonb
  -- solo las del dispositivo del token; estado, motivo_rechazo, correcciones, revisada_en.
  -- NUNCA revisada_por ni ningún autor: quien decidió se muestra como "jefatura" (FR-27).

fn_retirar_propuesta(token text, propuesta_id uuid) returns void
  -- errores: PROPUESTA_NO_PENDIENTE · PROPUESTA_AJENA

fn_reportar_incidencia(token text, descripcion text, version_app text, ruta text) returns uuid
  -- errores: CUOTA_INCIDENCIAS_AGOTADA

fn_guardar_suscripcion_push(token text, suscripcion jsonb, temas text[]) returns uuid
fn_borrar_suscripcion_push(token text) returns void

-- Única RPC anónima sin token.
fn_registrar_error(dispositivo_id uuid, mensaje text, pila text, ruta text, agente text) returns void
  -- pila truncada a 4 kB; techo diario de 100 por dispositivo y max_errores_global_dia en total;
  -- nunca lanza error al cliente.
```

No existe RPC de voluntario para "puntos cercanos": el duplicado se calcula en `fn_proponer` y solo
lo ve jefatura (FR-52).

### 6.2 Jefatura

```sql
fn_aprobar(propuesta_id uuid, correcciones jsonb default null, confirmar_desactualizada boolean default false)
  returns jsonb  -- { punto_id, codigo }
  -- aplica a puntos (crea o actualiza) fusionando correcciones; deduce municipio/nucleo;
  -- guarda direccion (correcciones.direccion ?? direccion_sugerida ?? null);
  -- fecha_ultima_revision = current_date; foto_path del punto = el de la propuesta (no se copia);
  -- errores: PROPUESTA_NO_PENDIENTE · PUNTO_NO_ACTIVO · PROPUESTA_DESACTUALIZADA (salvo confirmar) ·
  --          DIAMETRO_SIN_FIJAR (alta con "otra medida" sin correcciones.diametro_mm) · PAYLOAD_INVALIDO

fn_aprobar_lote(propuesta_ids uuid[])
  returns table (propuesta_id uuid, resultado text, motivo text)
  -- cada una en su propia transacción (savepoint); resultado 'aprobada' | 'omitida'; motivo = código de error.

fn_rechazar(propuesta_id uuid, motivo text) returns void
  -- errores: MOTIVO_OBLIGATORIO · PROPUESTA_NO_PENDIENTE

fn_fusionar_con_existente(propuesta_id uuid, punto_id uuid, prevalece jsonb default '{}')
  returns jsonb  -- { punto_id, codigo }
  -- prevalece: { "racor": "propuesta"|"existente", "caudal": …, "diametro_mm": …, "ubicacion": … }
  -- por defecto prevalece lo existente salvo foto y fecha de revisión, que son los de la propuesta.
  -- errores: TIPO_DISTINTO · PUNTO_NO_ACTIVO · PROPUESTA_NO_ALTA

fn_editar_punto(punto_id uuid, cambios jsonb) returns void
  -- edición directa de administrador (FR-151 desde el inventario); registro es_admin = true.

fn_retirar_punto(punto_id uuid, motivo text) returns void
fn_borrar_punto(punto_id uuid, motivo text) returns void        -- situacion = 'borrado', borrado_en = now()
fn_restaurar_punto(punto_id uuid) returns void                  -- error: FUERA_DE_PLAZO_PAPELERA
fn_purgar_papelera() returns integer                            -- también la llama pg_cron

fn_cambiar_codigo_acceso(nuevo text, revocar_dispositivos boolean) returns void
  -- errores: CODIGO_FORMATO (6 dígitos)
fn_gestionar_administrador(email text, activo boolean) returns void
  -- error: ULTIMO_ADMINISTRADOR
fn_guardar_config(cambios jsonb) returns void
  -- solo claves de la lista blanca de §2.10; valida tipos y rangos. error: CONFIG_INVALIDA(<clave>)
fn_resolver_incidencia(incidencia_id uuid) returns void
fn_actividad_voluntarios(meses integer)
  returns table (autor text, dispositivo_id uuid, propuestas int, aprobadas int, rechazadas int, tasa numeric, ultima timestamptz)
fn_anonimizar_autor(dispositivo_id uuid) returns integer      -- filas afectadas
fn_historial_punto(punto_id uuid) returns setof v_registro
fn_salud() returns jsonb
  -- { pendientes_14d, incidencias_abiertas, errores_7d, sin_direccion, ultimo_respaldo, storage_bytes,
  --   version_zona, version_mapabase, dispositivos_activos }
fn_exportar_inventario(filtros jsonb default '{}') returns jsonb   -- datos planos; el panel genera xlsx/csv/geojson en el navegador (TR-105) y registra 'exportacion'
fn_guardar_suscripcion_push_admin(suscripcion jsonb, temas text[]) returns uuid
fn_novedades() returns jsonb                                    -- últimas entradas del CHANGELOG cargadas en config por CI (FR-167)
fn_guardar_direccion_sugerida(propuesta_id uuid, direccion text) returns void   -- la usa /api/direccion con el JWT
fn_registrar_workflow(workflow text) returns void               -- la usa /api/lanzar-workflow ('workflow_lanzado')

-- Solo service_role (la llama el workflow de purga).
fn_fotos_referenciadas() returns setof text
-- Solo service_role (la llama /api/push): reclama avisos pendientes con skip locked y los marca
-- enviados en la misma transacción; después se anota el resultado de cada uno.
fn_reclamar_notificaciones(limite integer default 100)
  returns table (id bigint, titulo text, cuerpo text, url text, suscripcion_id uuid, suscripcion jsonb)
fn_resultado_notificacion(notificacion_id bigint, ok boolean, error text, suscripcion_caducada boolean default false)
  returns void   -- tres fallos seguidos o un 404/410 borran la suscripción
```

### 6.3 Helpers internos (sin `execute` público)

```sql
fn_municipio_de(geom geography) returns table (municipio municipio, nucleo text)
  -- cruce con limite_municipal; nucleo por proximidad (tope 1.500 m; si no, 'diseminado'); fuera: ('fuera_de_zona', null)
  -- "fuera" = a más de config.buffer_zona_m de todo límite (st_dwithin), igual que zona-cobertura.geojson
  -- del móvil; en el margen, el municipio del límite más cercano (DEC-057)
fn_siguiente_codigo(tipo tipo_punto) returns text
fn_config(clave text, por_defecto jsonb) returns jsonb   -- valor de config con respaldo
fn_es_admin() returns boolean       -- email del JWT presente y activo en administradores
fn_radio_px(diametro_mm smallint, caudal estado_caudal) returns numeric   -- 06 §4
fn_registrar(actor text, dispositivo_id uuid, es_admin boolean, accion text, punto_id uuid, propuesta_id uuid, antes jsonb, despues jsonb)
fn_error(codigo text, texto text)            -- lanza P0001 'CODIGO: texto'
fn_email_jwt() returns text                  -- correo del JWT, en minúsculas
fn_exigir_admin() returns text               -- NO_AUTORIZADO si no es administrador; devuelve su correo
fn_dispositivo_admin(email text) returns uuid -- md5 del correo: identidad técnica estable de un administrador
fn_aplicar_propuesta(propuesta_id uuid, correcciones jsonb, confirmar_desactualizada boolean, actor text) returns jsonb
                                             -- núcleo de fn_aprobar, fn_aprobar_lote y fn_proponer de jefatura
fn_purgar_papelera_interna(actor text) returns integer   -- la llama pg_cron cada noche y fn_purgar_papelera
```

---

## 7. Forma de `datos` y `correcciones` por operación

| Operación | `datos` (solo lo que cambia) | Obligatorio además |
|---|---|---|
| `alta` | `{ tipo, diametro_mm?, diametro_otro?, caudal, racor?, descripcion_fallo?, descripcion? }` | `geom`, `origen`, `foto_path`. Si `tipo = 'boca_riego'`: `racor`, y `diametro_mm` se fija a 45. Si `diametro_otro` viene, `diametro_mm` es `null` y la propuesta queda marcada `otra_medida`. |
| `revision` | `{}` (o `{ nota? }`) | `foto_path` |
| `estado` | `{ caudal, descripcion_fallo?, nota? }` | `foto_path` |
| `datos` | subconjunto de `{ tipo, diametro_mm, racor, descripcion }` | — |
| `ubicacion` | `{ nota? }` | `geom`, `origen`, `foto_path`; el servidor calcula `desplazamiento_m` contra `puntos.geom` |
| `retirada` | `{ motivo_rapido: 'obras'|'asfaltado'|'sustituido'|'otro', motivo: text }` | `foto_path` |

`correcciones` (en `fn_aprobar`) admite cualquiera de: `tipo, diametro_mm, caudal, racor,
descripcion_fallo, descripcion, direccion`. Las mismas constraints de `puntos` se validan sobre el
resultado fusionado antes de escribir.

---

## 8. Vocabulario de `registro.accion` y códigos de error

`accion` ∈ `propuesta_creada`, `propuesta_retirada_autor`, `aprobacion`, `aprobacion_con_correcciones`,
`rechazo`, `fusion`, `edicion_admin`, `retirada`, `borrado`, `restauracion`, `purga_papelera`,
`codigo_cambiado`, `dispositivos_revocados`, `administrador_alta`, `administrador_baja`,
`config_cambiada`, `incidencia_resuelta`, `anonimizacion`, `exportacion`, `workflow_lanzado`, `nucleo_guardado` (DEC-068).

Códigos de error (prefijo del `message`): `CODIGO_INCORRECTO`, `DEMASIADOS_INTENTOS`,
`TOKEN_INVALIDO`, `TOKEN_REVOCADO`, `TOKEN_CADUCADO`, `PAYLOAD_INVALIDO`, `FOTO_OBLIGATORIA`,
`FOTO_NO_RESERVADA`, `CUOTA_SUBIDAS_AGOTADA`, `CUOTA_INCIDENCIAS_AGOTADA`, `PUNTO_NO_ENCONTRADO`,
`PUNTO_NO_ACTIVO`, `PROPUESTA_NO_PENDIENTE`, `PROPUESTA_AJENA`, `PROPUESTA_DESACTUALIZADA`,
`DIAMETRO_SIN_FIJAR`, `MOTIVO_OBLIGATORIO`, `TIPO_DISTINTO`, `PROPUESTA_NO_ALTA`,
`FUERA_DE_PLAZO_PAPELERA`, `CODIGO_FORMATO`, `ULTIMO_ADMINISTRADOR`, `CONFIG_INVALIDA`,
`NO_AUTORIZADO`. El cliente traduce cada código a un texto en español (TR-36); ningún error de
Postgres llega crudo.

---

## 9. Pages Functions — contrato HTTP

Todas en `functions/api/`, JSON, mismo dominio que el frontend. Errores: `{ error: <código>, mensaje }`
con el estado HTTP indicado.

### `POST /api/verificar-codigo`

```json
→ { "codigo": "482917", "dispositivo_id": "uuid" }
← 200 { "token": "base64url(32 bytes)", "caduca_en": "2027-09-17T…" }
← 401 { "error": "CODIGO_INCORRECTO" }
← 429 { "error": "DEMASIADOS_INTENTOS", "reintentar_en_s": 3600 }
```
Lee `CF-Connecting-IP`, calcula `ip_hash`, llama a `fn_verificar_codigo` con `service_role`.
Respuesta en tiempo constante: ninguna tarda menos de 800 ms, acierte o falle (TR-42).

### `POST /api/url-subida`

```json
→ { "token": "…" }            (voluntario)   ·   cabecera Authorization con el JWT (jefatura, DEC-059)
← 200 { "foto_path": "fotos/3f9c….jpg", "url": "https://…/object/upload/sign/…", "caduca_en_s": 7200 }
← 401 { "error": "TOKEN_INVALIDO" } · 429 { "error": "CUOTA_SUBIDAS_AGOTADA" }
```
El móvil hace `PUT` del blob a `url` con `Content-Type: image/jpeg|image/webp`. El bucket se deduce del
dominio: `hidrantes-fotos` solo en `hidrantes-albolote.pages.dev`; staging, previsualizaciones y local,
`hidrantes-fotos-dev`.

### `GET /api/direccion?lat=&lng=&propuesta_id=`

Cabecera `Authorization: Bearer <JWT de Supabase>`; la Function reenvía el JWT a `fn_es_admin()`.

```json
← 200 { "direccion": "Calle Real 14, Albolote", "fuente": "nominatim", "cacheada": false }
← 200 { "direccion": null, "fuente": "nominatim", "motivo": "sin_respuesta" }   // nunca bloquea
← 403 { "error": "NO_AUTORIZADO" }
```
Nominatim `reverse`, `zoom=18`, `User-Agent = NOMINATIM_USER_AGENT`, cola en memoria a 1 req/s;
escribe `propuestas.direccion_sugerida`.

### `POST /api/lanzar-workflow`

Cabecera `Authorization` de administrador. `→ { "workflow": "purgar-fotos" | "regenerar-zona" | "regenerar-mapabase" | "respaldo" }`;
cualquier otro valor → `400`. Despacha el workflow que atiende ese trabajo con **`workflow_dispatch`**
(`POST /repos/…/actions/workflows/{archivo}/dispatches`, `{ "ref": "develop", "inputs": { "trabajo": "…" } }`)
y `GITHUB_DISPATCH_TOKEN`, que así solo necesita `actions:write` (DEC-069). `← 202 { "lanzada": true, "workflow": "…" }`.
Sin `GITHUB_DISPATCH_TOKEN`, o si el trabajo aún no tiene workflow (`purgar-fotos` y `respaldo` llegan
en la Fase 8) → `503 { "error": "NO_CONFIGURADO" }`, sin llamar a GitHub.

### `POST /api/push`

`→ { "token": "…" }` (voluntario) o cabecera de administrador, o cabecera `X-Vigilancia` con el
secreto del trabajo diario. Lee `notificaciones` sin `enviada_en`, envía cada una con Web Push
(VAPID), marca `enviada_en` o `error`, borra suscripciones con tres fallos. `← 200 { "enviadas": n, "fallidas": m }`.
Idempotente: dos llamadas seguidas no envían dos veces. Necesita `VAPID_PUBLIC_KEY` además de la
privada (WebCrypto no deduce una de otra); sin ellas → `503 NO_CONFIGURADO`. Cifrado RFC 8291 y firma
RFC 8292 con WebCrypto, sin dependencias.

---

## 10. Contrato de sincronización del cliente

- Primera carga: `fn_listar_puntos(token)` sin `desde` → todos los puntos activos + `config`.
- Siguientes: `fn_listar_puntos(token, desde = sincronizado_en anterior)` → solo puntos con
  `actualizado_en > desde` y `bajas`: ids que pasaron a `retirado` o `borrado` desde entonces **y**
  los purgados de la papelera desde entonces (sacados de `registro`, `accion = 'purga_papelera'`),
  sin repetidos (0012). El cliente reemplaza por `id` y elimina las bajas.
- `config.epoca_datos` (texto o `null`) la cambia `restaurar.ts` en cada restauración. Si el móvil
  la recibe distinta de la que tenía guardada (y la guardada no era `null`), repite en la misma
  llamada una sincronización completa. Además hace una completa si la última tiene más de 7 días
  (DEC-083).
- El cliente guarda `sincronizado_en` del servidor, no su propio reloj. El servidor lo devuelve con 60 s
  de solape (`now() − 60 s`): una escritura que aún no había confirmado entra en la siguiente
  sincronización; repetir un punto no duplica, porque el cliente reemplaza por `id`.
- La cola local guarda por propuesta: `clave_local` (uuid v4), payload de `fn_proponer`, blob de la
  foto, `creada_en` local, intentos. Envío: `url-subida` → `PUT` → `fn_proponer`. Si `fn_proponer`
  devuelve la propuesta existente (misma `clave_local`), se considera enviada.
- `config` recibida se aplica en el cliente (radios, meses de revisión) en la siguiente carga del mapa:
  el móvil deriva `revision_caducada` y `radio_px` con la `config` recibida, en **todos** los puntos
  guardados y no solo en los recibidos, al sincronizar, al arrancar sin red (con la última `config`
  guardada) y al volver a la app si cambió el día (DEC-082). `v_puntos_activos` sigue siendo la fuente
  del panel y de la exportación.

---

## 11. Concurrencia y aislamiento

Dos administradores revisando a la vez, o uno con dos pestañas, son el caso normal, no el raro. La
app de uniformidad lo resuelve con un bloqueo global de escritura; en Postgres se hace más fino y
sin ese cuello de botella:

| Situación | Regla |
|---|---|
| Aprobar, rechazar, fusionar, editar, retirar, borrar o restaurar | La RPC empieza con `select … from propuestas where id = $1 for update` y, si toca un punto, `select … from puntos where id = $2 for update`. Cualquier segunda transacción sobre las mismas filas espera y, al entrar, ve el estado ya cambiado y falla con `PROPUESTA_NO_PENDIENTE` o `PUNTO_NO_ACTIVO`. Nunca "gana el último". |
| `fn_aprobar_lote` | Ordena los ids antes de bloquear (evita interbloqueos) y procesa cada propuesta en su propio *savepoint*: una que falle no tumba el lote. |
| Asignación de código | `nextval` sobre la secuencia, fuera de cualquier lectura de `max(codigo)`. Dos altas simultáneas obtienen códigos distintos por construcción. |
| `fn_proponer` | `insert … on conflict (clave_local) do nothing returning …`; si no devuelve fila, lee la existente. Dos envíos simultáneos del mismo móvil crean una sola propuesta. |
| `fn_reservar_subida` | Cuenta y reserva en la misma sentencia (`insert … select … where (select count(*) …) < cuota`), para que dos peticiones a la vez no pasen las dos el tope. |
| `fn_verificar_codigo` | El recuento de intentos y la inserción van en la misma transacción; el índice sobre `(dispositivo_id, momento)` la hace barata. |
| `fn_guardar_config`, `fn_gestionar_administrador` | `for update` sobre las filas afectadas; la regla del último administrador activo se comprueba **dentro** de la transacción. |
| Escrituras largas | Ninguna RPC hace peticiones de red: Nominatim y GitHub se llaman desde las *Pages Functions*, nunca con una transacción abierta. |
| Tiempo máximo | `statement_timeout` de 10 s en las RPC de escritura; un bloqueo que no avanza falla con mensaje, no deja la interfaz colgada. |

Tests obligatorios (pgTAP, dos sesiones): dos `fn_aprobar` simultáneos sobre la misma propuesta →
uno aprueba, el otro falla con `PROPUESTA_NO_PENDIENTE`; dos `fn_proponer` con la misma
`clave_local` → una sola fila; dos altas simultáneas → códigos distintos; reserva de subida
número 40 y 41 en paralelo → una pasa y otra falla.

---

## 12. Seed de staging (`supabase/seed-staging.sql`)

Idempotente (`on conflict do nothing`), con códigos `HID-9xxx`/`BOC-9xxx` para distinguirlos de los reales: 12 puntos `[PRUEBA]` repartidos por los núcleos con las 12
combinaciones diámetro × caudal, tres con revisión caducada, uno retirado, uno en papelera; 6
propuestas pendientes de cada operación con al menos un duplicado y una desactualizada; `config` con
código `000000` (bcrypt de pgcrypto); `administradores` con dos correos de prueba de `example.com`
(el propietario llega por `asegurar-propietario.ts`, DEC-053). Nunca pisa un código
real generado para el piloto.

---

## Trazabilidad

| Sección | Origen (plan v2.1) |
|---|---|
| 1–3 | Fase 2 "Enums", "Tablas", "Secuencias" |
| 4–5 | Fase 2 "Vistas", "RLS", "Storage" |
| 6–8 | Fase 3 "Voluntario", "Jefatura", "Helpers", casos límite |
| 9 | Fase 3 "Pages Functions"; Fase 2 "Protección del código", "Storage" |
| 10 | Fase 5 (caché e incremental), Fase 6 (cola offline) |
| 11 | revisión 17 sep 2026 (DEC-048), inspirado en el `LockService` de la app de uniformidad |
| 12 | Fase 2 "Seed" |
