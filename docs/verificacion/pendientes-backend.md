# Verificación · Lo pendiente de docs/21 y el mantenimiento (docs/22) · sesión Backend

**Estado: hecho el 25 sep 2026.** Especificación: `docs/22-pendientes-y-mantenimiento.md`, puntos de
Backend (RV-84 y RV-86, escritos en `docs/21` §2, y la parte SQL de RV-92). Coordinación: #362. Ops
junta este registro con los de Frontend y Ops en `pendientes.md`.

## 1. Qué se ha hecho

| RV | Issue · PR | Qué | Cómo se vio fallar antes |
|---|---|---|---|
| 84 | #363 · #368 | Migración **0030**. Índice único por endpoint y tipo de dueño (`suscripciones_endpoint_duenio_idx`): una fila de voluntario y una de jefatura por navegador. `fn_resultado_notificacion`: solo 404/410 borran al momento; otro error, con 10 fallos seguidos y ningún envío bueno en 7 días. `/api/push`: con un 429, ni fallo ni error; el aviso y los demás del lote para ese servicio se aplazan con la RPC nueva `fn_aplazar_notificaciones` (solo `service_role`), que respeta `Retry-After` y devuelve el intento; la respuesta añade `aplazadas`. **Además:** `fn_guardar_suscripcion_push` y `fn_guardar_suscripcion_push_admin` fallaban **siempre** en la base real con `42702 column reference "suscripcion" is ambiguous`; 0030 las arregla con la misma firma | run 36123706351: ci-sql, `27_suscripciones_duenios.test.sql` paraba en la primera llamada a `fn_guardar_suscripcion_push` con el 42702; ci-calidad, 8 casos de `push.test.ts` y `webpush.test.ts` en rojo |
| 92 (SQL) | #372 · #375 | Migración **0031**. `fn_tareas_programadas()` (dueño `hidrantes_migrador`, sin `execute` para `anon` ni `authenticated`) y `fn_salud()` con la misma firma: `tareas` en vivo y `tareas_origen = 'en_vivo'`; sin permiso en pg_cron, la foto de la vigilancia con `tareas_origen = 'vigilancia'`, `tareas_medidas_en` y `tareas_error`. Una tarea de la última foto que ya no está en `cron.job` sale con `falta` y `problema` | run 36126025380: ci-sql, `28_salud_tareas_en_vivo.test.sql` con 8 de 11 casos en rojo (sin la función ni `tareas_origen`) |
| 86 | #373 · #377 | `e2e/integracion/avisos.spec.ts`: suscripción con forma de FCM (152 caracteres, claves de 65 y 16 bytes) guardada por PostgREST con un token canjeado, aviso creado por un rechazo de jefatura, `/api/push` con `X-Vigilancia` local hacia un servidor de push falso, y la cabecera VAPID comprobada (`aud`, `exp`, `sub`, firma ES256). `PUSH_ENDPOINT_PRUEBAS` solo actúa con Supabase local; `guarda-produccion.ts` la bloquea en el entorno, en `deploy-prod.yml` y en `arranque.ts` | run 36127347511: ci-sql, el spec fallaba (sin la sustitución el envío iba a FCM de verdad y la suscripción se borraba); ci-calidad, los casos nuevos de `push.test.ts` y `guarda-produccion.test.ts` |

- **Decisiones:** DEC-118 (fallos y 429), DEC-119 (una fila por tipo de dueño y el 42702), DEC-120 (integración de los avisos), DEC-132 (tareas en vivo). Sin usar: DEC-121, DEC-133 a DEC-135.
- **Migraciones:** 0030 y 0031. Las dos aplicadas en staging por `deploy-staging.yml` (runs de `e881436` y `597af31`, en verde).
- **pgTAP:** `27_suscripciones_duenios.test.sql` (31 casos) y `28_salud_tareas_en_vivo.test.sql` (18 casos). `16_salud.test.sql` ya no depende del orden alfabético de las tareas.
- **Compatibilidad (TR-107):** `npm run compatibilidad` en verde en ci-sql de #368 y #375.
- **Revisión:** en los tres PR, `silent-failure-hunter`, `pr-test-analyzer` y `code-review`. Lo que cambió por la revisión está en cada PR (entre otras cosas, `fn_aplazar_notificaciones` en #368 y las tareas desaparecidas en #375).

## 2. Suposiciones

- **RV-84, índice por tipo de dueño** en vez de `coalesce(dispositivo_id::text, email)`: un navegador solo tiene un token de voluntario, así que otro `dispositivo_id` en el mismo endpoint es un acceso nuevo del mismo navegador, y dos administradores en el mismo ordenador recibirían avisos repetidos (DEC-119).
- **RV-84, 429:** `docs/21` pedía dejar el aviso reclamado. Así, cada 429 gastaba un intento, también en los avisos que ni se intentaban, y tres seguidos los perdían. Por eso la RPC nueva (DEC-118).
- **RV-84, 5xx:** un 5xx sigue dejando **ese aviso** con error, como antes; lo que ya no pasa es que se pierda la suscripción. Reintentar los 5xx queda fuera (DEC-118).
- **RV-92:** en vivo, la única «falta» que se ve es la de una tarea que estaba en la última foto de la vigilancia; la lista de esperadas la sigue comparando solo la vigilancia (DEC-132). La pérdida de permiso en pg_cron se prueba reemplazando la función dentro de la transacción: un `revoke` no quita la lectura en el Supabase local.
- **RV-86:** el spec levanta su propio `wrangler pages dev` en :8789 con `--binding`, para no tocar `.dev.vars`, `package.json` ni `ci.yml` (de Ops). La guarda solo ve lo que ve el runner; la barrera de verdad es que la variable solo actúa con `SUPABASE_URL` local (DEC-120).

## 3. Lo que queda para otros

- **Frontend (RV-81):** del lado del servidor, activar los avisos nunca había funcionado (42702). Desde 0030 guarda de verdad; conviene repetir en el Android la activación sobre staging (docs/22 §4, paso 3).
- **Frontend (RV-92, pantalla):** ya puede leer `tareas_origen` y `tareas_medidas_en` (comentado en #362).
- **Ops (P-12):** 0030 y 0031 van en la próxima subida a producción.
