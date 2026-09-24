# 18 · Segunda revisión (23 sep 2026) y funciones de mapa para emergencias

| | |
|---|---|
| **Para** | Claude Code, en este repositorio (`aron285-coder/hidrantes-albolote`) |
| **Base** | `develop` en `6497ddb`, con `docs/17` ya aplicado (RV-01 a RV-32) |
| **Origen** | Segunda revisión completa: checks, verificación de RV-01 a RV-32 y revisión independiente de todo el código. Incluye además una propuesta de funciones "como Google Maps", **aprobada por el desarrollador el 23 sep 2026** con tres decisiones (§0.3). |
| **Estado de partida** | typecheck, lint, prettier, 1.313 tests de vitest, build, presupuesto (219,0 kB) y 230 e2e en verde; CI de `develop` en verde |
| **Bloques** | **A** errores P0 (antes del piloto, #77) · **B** errores P1 (antes de producción, #79) · **C** calidad P2 · **D** funciones nuevas de mapa (GM-00 a GM-06) |

---

## 0. Cómo trabajar con este documento

### 0.1 Reglas

Son las mismas que en `docs/17` §0 y siguen vigentes:

- Lee CLAUDE.md entero.
- Una issue por cada `RV-nn` o `GM-nn` (con el `task-shaper`, milestone "Fase 9"), rama
  `fase-9/rv-nn-…` o `fase-9/gm-nn-…`, y un PR a `develop` con la plantilla rellena.
- **Test de regresión primero.** Debe **fallar** sobre `develop`, y el PR lo dice.
- Migraciones solo hacia adelante. Toma el siguiente número libre (`0020_…`, `0021_…`) al abrir el
  PR, con `create or replace` y **la misma firma**, o `alter function`. `npm run compatibilidad`
  debe seguir en verde (04 §12, TR-107).
- 05 se actualiza antes que el código. Los textos nuevos van a `src/lib/textos.ts` **y** al
  Apéndice A de 06. Las decisiones nuevas van a 12 empezando por **DEC-089**.
- Sin dependencias nuevas salvo que este documento lo diga. Ninguna de las funciones del bloque D
  necesita una.

### 0.2 Definición de terminado

Una RV o GM está terminada cuando se cumplen las cuatro condiciones:

1. Los tests nombrados existen y pasan.
2. CI está en verde.
3. Los documentos citados están al día.
4. Si el cambio se ve, has comprobado staging con Playwright.

Al cerrar cada bloque, escribe su registro:

| Bloque | Registro |
|---|---|
| A | `docs/verificacion/revision-2-p0.md` |
| B | `docs/verificacion/revision-2-p1.md` |
| C | `docs/verificacion/revision-2-p2.md` |
| D | `docs/verificacion/mapa-emergencias.md` |

Cada registro dice qué tests prueban cada punto y qué falta. Actualiza también 09 §8. Añade este
documento a `docs/INDICE.md` en el primer PR.

### 0.3 Decisiones del desarrollador (23 sep 2026), que este documento ya aplica

1. **El tipo de un punto no se puede cambiar.** Si un hidrante está registrado como boca de riego o
   al revés, se propone retirarlo y se da de alta el correcto. El código se queda siempre coherente
   con su prefijo (FR-10). Implementación: RV-41.
2. **Entran las funciones 1 a 4 de la propuesta:**
   - modo incidente con los puntos más cercanos que funcionan;
   - búsqueda de calles, lugares, direcciones y coordenadas;
   - compartir y coordenadas UTM;
   - medir distancia en tramos de manguera.

   La brújula, recibir ubicaciones compartidas, Street View y las rondas guardadas quedan fuera
   (§9).
3. **Para los números de portal se usa el geocodificador de CartoCiudad (IGN/CNIG),** gratuito y sin
   cuenta, siempre a través de una Pages Function nuestra y con caché. Las calles funcionan sin
   conexión a partir de un callejero propio generado desde OSM. Cumple DEC-037, porque no exige
   cuenta ni tiene coste.

01, 02 y 16 están **congelados**: cambian solo con conformidad de jefatura y nueva versión. Las
funciones del bloque D entran en 01 v1.3, marcadas "pendiente de conformidad de jefatura en la
validación F9.1 (#76)". GM-00 hace ese cambio documental antes que el código.

### 0.4 Orden

1. **Bloque A**, en el orden de §1. Primero RV-33, que es crítico.
2. **Bloque B.**
3. **Bloque D** (GM-00 → GM-01 → GM-02 + GM-05 → GM-03 → GM-06 → GM-04). No bloquea el piloto.
   Lo que esté fusionado antes de empezar #77 entra en el piloto, para que jefatura lo valide con uso
   real.
4. **Bloque C**, en paralelo cuando convenga.

---

## 1. Bloque A · Errores P0 (antes del piloto)

### RV-33 · La purga semanal borra fotos en uso en cuanto hay más de 1.000 referenciadas · P0 · crítico

**Problema.**

- `scripts/purgar-fotos.ts:67` pide la lista de fotos que hay que conservar a
  `fn_fotos_referenciadas()` a través de PostgREST.
- La función devuelve `setof text` (`0013:25`), y PostgREST corta **cualquier** respuesta, también
  la de una RPC que devuelve un conjunto, en `max_rows = 1000`. Ese es el valor de
  `supabase/config.toml:18` y el valor por defecto de Supabase alojado.
- Por encima de 1.000 fotos referenciadas llega una lista truncada y en orden arbitrario (es una
  `union`). El resto cuenta como huérfano y se borra cada lunes a las 04:43 sin que nadie lo vea.
- Son muchas fotos: TR-60 prevé ≥ 1.000 puntos y ≥ 20.000 propuestas, y cada propuesta aprobada
  conserva su foto.
- `motivoParaNoBorrar()` (`purgar-fotos.ts:39-45`) solo detecta una lista **vacía**.

**Solución.**

1. **Migración.** Añade una función nueva, `hidrantes.fn_fotos_referenciadas_lista() returns jsonb`.
   - Hace lo mismo que `fn_fotos_referenciadas()` y devuelve `jsonb_build_object('fotos', jsonb_agg(distinct foto_path), 'total', count(distinct foto_path))`.
   - Es **una sola fila**, así que `max_rows` no la toca.
   - `security definer`, `search_path = pg_catalog, hidrantes`, y `execute` solo para
     `service_role`, igual que la otra (CLAUDE.md §3).
   - La antigua se queda (compatibilidad) pero deja de usarse. Anótalo en 05 como "obsoleta desde
     vX".
2. **`purgar-fotos.ts`:**
   - `referenciadas()` llama a la nueva y comprueba que `fotos.length === total`. Si no coinciden,
     aborta.
   - **Dos redes de seguridad más en `motivoParaNoBorrar`:**
     - abortar si `referenciadas.length` es exactamente 1.000 o un múltiplo de `max_rows` (síntoma
       de truncado);
     - abortar si una pasada borraría más de `max(50, 10 %)` del bucket, salvo con `--forzar`.
       `purgar-fotos.yml` **nunca** pasa `--forzar`; solo se usa a mano, tras un `--ensayo`
       revisado.
   - Antes de borrar, vuelve a pedir la lista y excluye cualquier ruta que aparezca en la segunda
     lectura. Así una propuesta confirmada entre medias no pierde su foto.
3. **`respaldo-fotos.ts` y `restaurar-fotos.ts`:** revisa que no dependan de ninguna RPC que
   devuelva un conjunto. Si lo hacen, aplica el mismo patrón.
4. **Revisión general.** Busca en `scripts/`, `functions/` y `src/` cualquier otra llamada a una RPC
   `returns setof` o `returns table` por PostgREST que pueda pasar de 1.000 filas. Pásala a `jsonb`
   o pagínala, y enuméralas en el PR.

**Tests.**

- pgTAP (`19_fotos_referenciadas.test.sql`):
  - Con 1.200 puntos con `foto_path` distinto, `fn_fotos_referenciadas_lista()` devuelve `total = 1200`
    y un `jsonb_array_length` de 1.200.
  - `anon` y `authenticated` no tienen `execute` sobre ella.
- `purgar-fotos.test.ts`:
  - Con 1.000 referenciadas exactas y 1.500 en el bucket, aborta sin borrar.
  - Si `total` no coincide con la longitud, aborta.
  - Si borraría el 40 % del bucket, aborta. Con `--forzar`, no.
  - Una ruta que aparece en la segunda lectura no se borra.
- **Integración en `ci-sql`:** siembra 1.100 puntos `[PRUEBA]` con foto por SQL. Contra la PostgREST
  local, `referenciadas()` devuelve 1.100 o más. Sobre `develop` devolvería 1.000: es el test de
  regresión.

### RV-34 · La primera restauración no llega a los móviles y los códigos se reutilizan · P0

**Problema A.**

- Ninguna migración siembra `epoca_datos`: solo se lee (`0012:47`).
- Todos los móviles guardan `null`. Tras la primera restauración ven el paso de `null` a un valor, y
  la regla "la primera época no fuerza nada" (`src/lib/puntos.ts:126-127`) evita la sincronización
  completa.

**Problema B.**

- El volcado restaura `seq_codigo_hidrante` y `seq_codigo_boca` con el valor de la fecha del
  respaldo.
- Los códigos dados después del respaldo, que ya se perdieron, **vuelven a darse** a otros puntos.
  Los voluntarios pueden tenerlos apuntados en campo, y FR-10 dice "nunca reutilizado".

**Solución.**

1. **Migración:**
   `insert into hidrantes.config (clave, valor, actualizado_por) values ('epoca_datos', to_jsonb(gen_random_uuid()::text), 'migracion') on conflict (clave) do nothing;`
2. **`restaurar.ts`:**
   - **Antes** de restaurar, lee con `psql` el `last_value` de las dos secuencias, si existen.
   - **Después** de restaurar y de migrar, ejecuta `setval(seq, greatest(last_value_restaurado, last_value_previo, max(código en puntos)))`
     para cada secuencia. Usa el mismo patrón que `promover-piloto.ts:101-106`: extráelo a una
     función común, `sqlSecuenciasAlMenos(hid, boc)`.
   - Informa en el log de los valores.
3. 15 §5.3: una línea explica que los códigos no retroceden nunca.

**Tests.**

- pgTAP: `epoca_datos` existe y no es null tras migrar.
- `restaurar.test.ts`: `sqlSecuenciasAlMenos(57, 12)` genera `greatest` con esos valores.
- `scripts/probar-restauracion.ts`:
  1. Tras hacer el volcado, crea 3 altas nuevas (`HID-…` siguientes).
  2. Restaura.
  3. Comprueba que la siguiente alta recibe un número **mayor** que el de la última de esas tres.
  4. Sobre `develop` recibe el número de la primera de ellas, así que falla.
- `puntos.test.ts`: con la época sembrada guardada en el móvil, una época distinta fuerza la
  sincronización completa. Ya existe; comprueba que sigue en verde.

### RV-35 · Una restauración devuelve credenciales viejas: código, dispositivos y administradores · P0

**Problema.**

- 15 §5.3, paso 1: antes de restaurar, jefatura genera un código nuevo y revoca todos los
  dispositivos.
- El volcado trae de vuelta `config.codigo_acceso_hash`, las filas de `dispositivos` sin revocar y
  `administradores` tal como estaban en el respaldo.
- Resultado:
  - el código nuevo comunicado al grupo deja de valer;
  - el viejo, quizá filtrado, vuelve a valer;
  - los móviles revocados vuelven a entrar;
  - un administrador dado de baja después del respaldo vuelve a estar activo.
- Además, 15 afirma que las propuestas perdidas "se reenviarán solas". Es falso: las ya enviadas
  salieron de la cola del móvil.

**Solución.**

1. **`restaurar.ts`:** el estado de acceso **actual** manda sobre el restaurado.
   - **Antes de restaurar**, con el esquema vivo, lee en memoria (no a disco) tres cosas:
     - `select valor from config where clave = 'codigo_acceso_hash'`;
     - `select jsonb_agg(d) from (select dispositivo_id, token_hash, emitido_en, ultimo_uso, revocado_en from hidrantes.dispositivos) d`;
     - `select jsonb_agg(a) from (select email, activo, creado_en, creado_por from hidrantes.administradores) a`.
   - **Después de restaurar y migrar**, en una transacción aparte (`sqlReponerAcceso(actual)`):
     - `codigo_acceso_hash` pasa a ser el actual;
     - **dispositivos:**
       - todo `token_hash` restaurado que no esté activo ahora se marca `revocado_en = now()`;
       - los que están activos ahora y faltan en lo restaurado se insertan con
         `on conflict (token_hash) do update set revocado_en = excluded.revocado_en`;
     - **administradores:** se hace un upsert con `activo` según el estado actual, y los
       restaurados que ahora no existen quedan `activo = false`.
   - Todo usa solo las columnas de `0001`, que no han cambiado.
   - Si el esquema no existía antes (base vacía), no hay nada que reponer: el log lo dice.
   - El guion temporal que lleva estos datos va en el directorio temporal del sistema (RV-37), con
     permisos 0600, y se borra en `finally`.
2. **15 §5.3:**
   - Corrige lo de "se reenviarán solas": lo enviado después del respaldo se pierde. Jefatura avisa
     al grupo con la fecha del respaldo para que repitan lo que hicieron desde entonces.
   - Añade que la restauración conserva el código y las revocaciones actuales.

**Tests.** En `scripts/probar-restauracion.ts`, amplía el escenario:

1. Haz el volcado.
2. Cambia el código (`fn_cambiar_codigo_acceso` con revocación) y da de baja un administrador.
3. Restaura.
4. Comprueba estas cuatro cosas:
   - el hash del código es el nuevo;
   - `fn_validar_token` con un token de antes del cambio da `TOKEN_REVOCADO`;
   - el administrador dado de baja sigue `activo = false`;
   - un dispositivo creado **después** del volcado y activo sigue funcionando.

Sobre `develop` falla. Añade también unit tests de `sqlReponerAcceso` en `restaurar.test.ts` (forma
del SQL, escapes y caso sin datos).

### RV-36 · Jefatura se decide solo por el correo del JWT · P0

**Problema.**

- `fn_es_admin()` (`0002:9-17`) y `fn_email_jwt()` aceptan a cualquier usuario de Supabase Auth del
  proyecto cuyo JWT traiga un `email` que esté en `administradores`.
- El proyecto se comparte con la app de uniformidad. Si ese proyecto permite registrarse con correo
  y contraseña sin confirmación, alguien puede darse de alta con el correo de un administrador que
  aún no ha entrado nunca con Google y obtener jefatura completa. El `supabase/config.toml` local lo
  permite (líneas 218-225); el alojado no lo sabemos.

**Solución.**

1. **Migración:** `create or replace function hidrantes.fn_es_admin()` (misma firma) y
   `hidrantes.fn_email_jwt()`. Exigen, además del correo:
   - `claims -> 'app_metadata' -> 'providers' ? 'google'`. `app_metadata` lo escribe solo el
     servidor.
   - que la sesión actual sea de OAuth: `exists (select 1 from jsonb_array_elements(coalesce(claims -> 'amr', '[]')) x where x ->> 'method' = 'oauth')`.
     `amr` refleja cómo se abrió **esta** sesión; una sesión con contraseña trae `password`.

   `fn_email_jwt()` devuelve null si no se cumple. Así `fn_exigir_admin`, `fn_proponer` (rama de
   jefatura) y el resto quedan cubiertos de una vez.
2. **Comprueba en local** el formato real de `amr` y `app_metadata` de una sesión de Google de
   Supabase:
   - lo ves en el JWT que usa `e2e/integracion`;
   - si es distinto, ajusta la condición y anótalo en DEC-089.
3. **`scripts/comprobar-auth.ts`** (nuevo):
   - Con el token de la Management API que ya usa `arranque.ts`, lee
     `GET /v1/projects/{ref}/config/auth` de staging y prod.
   - Informa de `disable_signup`, `external_email_enabled` y `mailer_autoconfirm`.
   - **No cambia nada**: el proyecto es también de uniformidad (CLAUDE.md §6). Si el registro por
     correo está abierto sin confirmación, lo dice en la issue con el riesgo, que ya queda cubierto
     por el punto 1, y la recomendación para el responsable de uniformidad.
   - `vigilancia.yml` **no** lo ejecuta, porque necesitaría un token de Management en CI.
4. Actualiza 11 §3 (cómo se reconoce a jefatura) y 05 §6.3.

**Tests.**

- pgTAP (`20_jefatura_google.test.sql`), con `set local request.jwt.claims`:
  - con correo de administrador, `amr` password y `providers ["email"]` → `fn_es_admin() = false`
    y `fn_exigir_admin()` lanza `NO_AUTORIZADO`. Sobre `develop` da `true`;
  - con `amr` oauth y `providers ["google"]` → `true`;
  - sin `amr` → `false`.
- **Actualiza los ayudantes que fabrican claims** en `supabase/tests/*.sql`, `e2e/ayudas.ts`
  (`conGoogle`) y `e2e/integracion/*` para que incluyan `amr` y `app_metadata`. Todos los tests de
  jefatura existentes tienen que seguir en verde **sin** tocar su lógica.

### RV-37 · Un respaldo descifrado puede acabar en el repositorio público · P0

**Problema.**

- 15 §5.3 descifra con `gpg --decrypt … > hidrantes.sql` en el directorio de trabajo, que es la raíz
  del repo.
- `restaurar.ts:~222` escribe `restauracion.tmp.sql` en la raíz. Se queda ahí si el proceso muere
  antes del `finally`.
- Ni `.gitignore` (solo `*.sql.gpg`) ni `scripts/detectar-secretos.ts` los cubren, y el flujo
  documentado usa `git add -A`.
- El volcado lleva en claro nombres de voluntarios, correos y el hash del código.

**Solución.**

1. **`.gitignore`:** añade `/*.sql`, `restauracion*.sql`, `hidrantes-*.sql` y `/respaldos/`.
   `supabase/**/*.sql` sigue versionado.
2. **`restaurar.ts`:**
   - El guion temporal va a `fs.mkdtempSync(path.join(os.tmpdir(), 'hidrantes-'))`.
   - Aborta si `--archivo` está dentro del repositorio y Git **no** lo ignora
     (`git check-ignore -q <ruta>`).
3. **`detectar-secretos.ts`** (lo ejecuta el hook `pre-commit`): bloquea cualquier archivo que
   contenga `-- PostgreSQL database dump` o `COPY hidrantes.`, salvo en `supabase/`.
4. **15 §5.3:** descifra a un directorio fuera del repo (`%TEMP%` en Windows, `/tmp` en Linux) y
   borra el `.sql` al terminar.

**Tests.**

- `detectar-secretos.test.ts`: un archivo con la cabecera de `pg_dump` se bloquea, y uno bajo
  `supabase/migrations` no.
- `restaurar.test.ts`: `--archivo ./hidrantes.sql`, no ignorado, aborta. El guion temporal no queda
  bajo `RAIZ`.
- Un test que comprueba que `git check-ignore` ignora `hidrantes.sql` en la raíz, ejecutado en CI.

### RV-38 · Vigilancia y avisos: fallos que se ocultan solos · P0

Son cinco defectos, y todos van en el mismo PR.

1. **Las tareas programadas no se guardan nunca** (`vigilancia.yml:92`).
   - `psql … -v valor="$tareas" -c "… :'valor'::jsonb …"` no funciona: psql **no** sustituye
     variables en `-c`. Da `syntax error at or near ":"`, y `|| true` lo oculta.
   - Salud del sistema no enseña nunca las tareas (TR-54).
   - Solución: pasa la sentencia por stdin (`psql … -v valor="$tareas" <<'SQL' … SQL`) o con `-f`
     sobre un archivo de `scripts/sql/`. Quita `|| true`: un fallo aquí es un problema más que se
     anota.
2. **Una tarea semanal que deja de correr no se detecta** (`scripts/sql/tareas-programadas.sql`).
   - El `left join` solo mira 8 días. Una semanal con su última ejecución hace 20 días da
     `ultima = null` y "semanal sin ejecuciones" no es problema.
   - Solución:
     - `ultima` = `max(start_time)` sobre **todo** el historial;
     - `fallo` sigue limitado a 8 días;
     - "semanal sin ninguna ejecución" es problema si el sistema lleva más de 8 días corriendo
       tareas (`(select min(start_time) from cron.job_run_details) < now() - interval '8 days'`).
3. **La issue no se abre si falla la rehabilitación de workflows** (`vigilancia.yml:167-178`).
   Solución: `continue-on-error: true` en "Rehabilitar…" e `if: always()` en "Abrir o cerrar la
   issue".
4. **`avisos.yml` no reintenta los fallos de red.**
   - `curl -w '%{http_code}' … || echo 000` da `000000` si la red falla, y la rama de reintento no
     casa.
   - Solución: `codigo=$(curl … -w '%{http_code}' … || true); codigo=${codigo:-000}; codigo=${codigo: -3}`.
5. **Un secreto de Pages nuevo no vale hasta el siguiente despliegue.**
   - Pages aplica los secretos solo a despliegues nuevos, y el secreto del repo vale al momento.
   - Tras `arranque -- --rotar vigilancia`, `avisos.yml` recibe 401 cada 15 minutos hasta que
     alguien despliega.
   - Solución:
     - `arranque.ts`, tras cambiar un secreto de Pages en **staging**, lanza
       `gh workflow run "Desplegar staging" --ref develop`;
     - en **prod** no puede (`production` exige aprobación), así que imprime el paso exacto;
     - `avisos.yml` trata un 401 como `::warning::` más una línea en el resumen, y **no** como
       fallo del workflow. La vigilancia diaria ya salta si hay avisos atascados más de dos horas;
     - añade el paso a 15 §2 y a `docs/entornos.md`.

**Tests.**

- `scripts/workflows.test.ts`:
  - ningún `run:` usa `-v` con `-c` y `:'…'` en la misma línea (regex);
  - el paso de la issue de `vigilancia.yml` tiene `if: always()`;
  - `avisos.yml` no contiene `|| echo 000`.
- `ci-sql`:
  - ejecuta el comando real que guarda las tareas (extraído a `scripts/sql/guardar-tareas.sql` o a
    un script) contra la base local y comprueba `fn_config('tareas_programadas')` no null;
  - inserta en `cron.job_run_details` una ejecución de `hidrantes_resumen_semanal` de hace 20 días
    y ninguna posterior, y comprueba `problema = true` para esa tarea.

  Sobre `develop` fallan las dos.
- Un test del cálculo del código HTTP: extráelo a una función de shell en
  `.github/scripts/codigo-http.sh` y pruébala con `bats`, o con un script de Node, sin dependencias
  nuevas.

### RV-39 · Cola: tres cabos sueltos de RV-01 a RV-04 · P0

1. **Un `'parar'` por `COLA_VACIADA` se come la vuelta pedida** (`cola.ts:334`).
   - Escenario:
     1. Cerrar sesión durante un PUT lento.
     2. Volver a entrar y enviar una propuesta nueva.
     3. La vuelta vieja devuelve `'parar'` y el `do/while` rompe.
     4. `finally` apaga `otraVuelta`.
     5. La propuesta nueva (`proximo: 0`) se queda sin temporizador.
   - Es RV-01 que vuelve por otro camino.
   - Solución: `unaVuelta` devuelve `'seguir' | 'parar' | 'reiniciar'`. `COLA_VACIADA` da
     `'reiniciar'`, que **continúa** el bucle si `otraVuelta` está puesta y rompe si no.
     `SIN_SERVIDOR` y `TOKEN_*` siguen dando `'parar'`.
2. **`reintentarCola` y `reintentarFallido` no respetan la generación** (`cola.ts:359, 368`).
   - Pueden reescribir envíos viejos tras `vaciarCola()`.
   - Solución: capturan `const gen = generacion` al empezar y pasan `gen` a `guardar`, que no
     escribe si `gen !== generacion`. Es lo que pedía `docs/17` RV-04 paso 2.
3. **"Solo en memoria" no cambia tras un reintento bueno** (`Proponer.tsx:458-466`).
   - Solución: en el `.finally` de "Reintentar ahora", recalcula como en `enviar()`:
     - si ya no está en la cola, pasa a `enviado` o `aplicado`;
     - si sigue y ahora quedó persistida, pasa a `guardado`.
   - `encolar` devuelve `persistida`. Para el reintento, expón `estaPersistida(clave)` desde la cola,
     o vuelve a intentar `bd().guardar` en `reintentarCola` y guarda el resultado.

**Tests** (`cola.test.ts`):

- `tras cerrar sesión durante un PUT, lo encolado después sale sin esperar a la red`.
- `reintentarCola tras vaciarCola no resucita nada`.
- `reintentarFallido tras vaciarCola no resucita nada`.
- E2e `operaciones.spec.ts`: `tras "Reintentar ahora" con éxito la pantalla dice enviado`. Hazlo con
  IndexedDB roto y `fn_proponer` primero caído y después bueno.

### RV-40 · Una posición GPS vieja se envía como si fuera actual · P0

**Problema.**

- Tras un timeout se mantiene `tipo: 'ok'` con `antigua: true` (`posicion.ts:70`).
- `Proponer.tsx:81-103` usa esa posición para colocar el pin del alta y para `gps_*` y
  `precision_gps_m`.
- Jefatura ve "GPS ±9 m" para un sitio del que el voluntario quizá ya se ha ido.

**Solución.**

- En `Proponer`:
  - si `esAntigua(gps)` (`posicion.ts:19`), **no** coloques el pin del alta con ella;
  - envía `gps_lat`, `gps_lng` y `precision_gps_m` a null;
  - muestra el texto nuevo "La posición no está al día: coloca el pin a mano o espera a que el GPS
    responda".
- Cuando vuelve un fix fresco, el pin se coloca solo si el voluntario no lo movió, como hoy.
- El mapa sigue enseñando la posición vieja atenuada, que es correcto.

**Tests.**

- Test de componente o e2e (`instalar-y-posicion.spec.ts`), en dos pasos:
  1. Un fix, luego un TIMEOUT y 61 s después (`page.clock`): se abre el alta. El pin no está puesto,
     el texto se ve y la propuesta enviada lleva `gps_lat: null`.
  2. Llega un fix nuevo: el pin se coloca.
- Sobre `develop`, el pin se coloca con la posición vieja.

### RV-41 · El tipo de un punto no se puede cambiar (decisión §0.3.1) · P0

**Problema.**

- La operación "corregir datos" (`0005:302`), `fn_editar_punto` (`0006:250-260`) y las correcciones
  de `fn_aplicar_propuesta` (`0006:39`) admiten `tipo`.
- `codigo` no cambia, así que una boca de riego puede quedarse como `HID-0123`. Rompe FR-10, y el
  tipo se deduce del código por radio.

**Solución.**

1. **Migración** (`create or replace`, mismas firmas):
   - **`fn_validar_datos`** para `operacion = 'datos'`: acepta `tipo` **solo si es igual** al tipo
     actual del punto. Así el frontend anterior, que lo envía siempre, sigue valiendo (04 §12). Si
     es distinto, `fn_error('TIPO_NO_MODIFICABLE', 'El tipo no se cambia: propón retirarlo y da de alta el correcto')`.
     Si la validación no tiene acceso al punto, haz la comprobación en `fn_proponer`, donde ya se
     carga `p`.
   - **`fn_editar_punto`:** igual. Un `tipo` distinto del actual da `TIPO_NO_MODIFICABLE`.
   - **`fn_aplicar_propuesta`:** en operaciones que no sean `alta`, un `tipo` en correcciones o en
     `datos` distinto del actual da `TIPO_NO_MODIFICABLE`. En `alta` sí se corrige: aún no hay
     código.
   - `fn_aprobar_lote` ya omite con motivo cualquier `raise_exception`, así que no cambia.
   - La migración informa (`raise notice`) de cuántas propuestas pendientes cambian el tipo. Jefatura
     las rechaza con motivo; no se tocan solas.
2. **App:**
   - En "corregir datos" desaparece el selector de tipo. En su lugar va el texto nuevo "¿El tipo está
     mal? Propón retirarlo y da de alta el correcto", con un enlace a "Proponer retirada" de ese
     punto.
   - `argumentos()` deja de enviar `tipo` en `datos`, o lo envía igual al actual.
3. **Panel:**
   - Inventario → editar, y "Aprobar con correcciones" de una propuesta que no sea alta: sin selector
     de tipo.
   - El diálogo de corrección de un alta sí lo conserva.
4. **Cola:** `TIPO_NO_MODIFICABLE` en `PERMANENTES` (`cola.ts`).
5. **Documentos:**
   - 01 v1.3: FR-11 añade "El tipo de un punto no cambia una vez creado; se corrige retirándolo y dando
     de alta el correcto (DEC-090)". Es parte de GM-00, o va en este PR si GM-00 no ha llegado.
   - 05 §7 (claves de `datos`) y §8 (código nuevo).
   - 02 FL de corregir datos.
   - Apéndice A.

**Tests.**

- pgTAP:
  - `fn_proponer` con `datos` y tipo distinto da `TIPO_NO_MODIFICABLE`; con el mismo tipo, entra;
  - `fn_editar_punto` con tipo distinto da `TIPO_NO_MODIFICABLE`;
  - `fn_aplicar_propuesta` de un alta con corrección de tipo, entra;
  - `fn_aprobar_lote` con una propuesta pendiente antigua que cambia tipo la omite con
    `TIPO_NO_MODIFICABLE`.
- `cola.test.ts`: `TIPO_NO_MODIFICABLE` es permanente.
- E2e: `corregir datos no ofrece cambiar el tipo y enlaza a retirar`, y
  `panel-inventario: editar no ofrece el tipo`.
- `npm run compatibilidad`: el frontend anterior sigue enviando "corregir datos" con el tipo actual y
  entra.

### RV-42 · Un punto que vuelve a funcionar conserva la nota de fallo · P0

**Problema.**

- `fn_editar_punto` conserva `descripcion_fallo` al cambiar el caudal a otro valor distinto de
  `no_funciona` (`0006:265-266`), e `inventario.ts:240` solo lo envía con `no_funciona`.
- `Ficha.tsx:107` la enseña siempre.
- En una emergencia la ficha dice "bueno" y a la vez muestra la nota de fallo.

**Solución.**

- **Migración:** en `fn_editar_punto`, `descripcion_fallo = case when caudal_final = 'no_funciona' then … else null end`.
  Es la misma regla que ya aplica `fn_aplicar_propuesta`: compruébalo y cita la línea.
- Limpieza de datos existentes, en la misma migración:
  `update hidrantes.puntos set descripcion_fallo = null where caudal <> 'no_funciona' and descripcion_fallo is not null`.
  Informa del recuento con `raise notice`. Es una corrección de datos derivados sin pérdida real,
  porque el registro conserva el `antes`. El trigger actualiza `actualizado_en` y los móviles lo
  reciben.
- `Ficha.tsx`: la nota solo se enseña si `caudal === 'no_funciona'`.

**Tests.**

- pgTAP: `fn_editar_punto` de `no_funciona` a `bueno` deja `descripcion_fallo` a null.
- E2e `mapa.spec.ts`: `un punto bueno con descripcion_fallo antigua no la enseña`.

### RV-43 · Fotos vistas antes de la actualización dejan de cargar · P0

**Problema.**

- La caché sigue llamándose `hidrantes-fotos` (`config/cache-fotos.ts:9`) y conserva las respuestas
  opacas de la versión anterior.
- `CacheFirst` las devuelve a una petición CORS, y el navegador lo trata como un error de red.
- Afecta a los móviles que ya tenían la app: hoy, staging y los probadores.

**Solución.**

- `cacheName: 'hidrantes-fotos-v2'`.
- En `public/sw-push.js`, que ya importa el SW generado:
  `self.addEventListener('activate', (e) => e.waitUntil(caches.delete('hidrantes-fotos')))`.
- Comenta en el código que el nombre se versiona cuando cambia el modo de petición.

**Tests.**

- `pwa.test.ts`: el nombre de la caché termina en `-v2`.
- E2e `armazon.spec.ts`:
  1. Crea en la página una caché `hidrantes-fotos` con una entrada.
  2. Registra el SW y espera a que se active.
  3. Comprueba que `caches.has('hidrantes-fotos') === false`.

---

## 2. Bloque B · Errores P1 (antes de producción)

### RV-44 · Jefatura re-deriva sus puntos con la configuración por defecto · P1

**Problema.**

- Jefatura nunca guarda `config`, porque lee la vista.
- Aun así, `cargarGuardados()` (`puntos.ts:88`) y `rederivarSiCambiaElDia()` (`:176-178`) re-derivan
  sus puntos con `CONFIG_POR_DEFECTO`.
- Con `meses_revision` o `escala_radios` distintos del valor por defecto, jefatura ve "sin revisar" y
  tamaños incorrectos tras arrancar sin servidor.

**Solución.**

- `config` queda en `null` si no hay configuración guardada. `derivarTodos()` no hace nada con `null`.
- Jefatura conserva los valores de la vista tal como llegaron.

**Tests** (`puntos.test.ts`):

- `sin config guardada (jefatura) cargarGuardados no cambia radio_px ni revision_caducada`.
- `rederivarSiCambiaElDia sin config no hace nada`.

### RV-45 · Sincronización: solape corto y cierre de sesión durante una sincronización · P1

**Problema A.**

- `sincronizado_en = ahora - 60 s` (`0012:40`), y `actualizado_en` es la hora de **inicio** de la
  transacción.
- Un `fn_aprobar_lote` con esperas de bloqueo de hasta 5 s por propuesta puede confirmar más de
  60 s después de empezar. Las incrementales se saltan esos cambios hasta la completa semanal.

**Problema B.**

- Una `sincronizar()` en curso cuando se llama a `cerrarSesionVoluntario()` vuelve a escribir puntos
  y sello tras `borrarPuntos()`. Contradice FL-12.

**Solución.**

- **Migración:** `create or replace function hidrantes.fn_listar_puntos` (misma firma) con solape de
  **10 minutos**. El coste es mínimo: se repiten los puntos cambiados en los últimos 10 minutos.
  Explica en el comentario por qué 10: un lote de 50 × 5 s cabe con margen.
- **`puntos.ts`:** añade un contador `generacion` que incrementa `borrarPuntos()`. `sincronizar`
  captura la generación al empezar y descarta el resultado, sin escribir en IndexedDB ni publicar, si
  ha cambiado.

**Tests.**

- pgTAP: `sincronizado_en` es `now() - 10 min`, con tolerancia de 1 s.
- `puntos.test.ts`: `cerrar sesión durante una sincronización no deja puntos`, con `rpc` retenido,
  `borrarPuntos()` y luego soltar.

### RV-46 · Promover el piloto: códigos en conflicto y puntos que no llegan a los móviles · P1

**Problema.**

- `promover-piloto.ts:56-71` usa `on conflict do nothing` sin objetivo. Un punto de staging cuyo
  código ya exista en producción con otro `id` se descarta en silencio.
- Los puntos se insertan con su `actualizado_en` antiguo y la época no cambia. Los móviles
  incrementales no los ven hasta la completa semanal.

**Solución.**

- Antes de escribir, consulta en producción los códigos del guion que ya existan con otro `id`. Si
  hay alguno, **aborta** con la lista. La resolución es humana.
- `on conflict (id) do nothing`.
- En el insert, `actualizado_en = now()`.
- Al final de la transacción, época nueva (`EPOCA_NUEVA` de `restaurar.ts`, compartida).

**Tests** (`promover-piloto.test.ts`):

- `un código existente con otro id aborta y lo nombra`.
- `el guion fija actualizado_en = now()`.
- `el guion incluye la época nueva`.

### RV-47 · Las novedades que ve el voluntario son texto de desarrollo · P1

**Problema.**

- `src/generado/novedades.json` enseña hoy "Scripts/capturas.ts deja las pantallas listas para 13 y
  14" y similares.
- El e2e exige **exactamente** tres líneas, lo que lo hace frágil.

**Solución.**

1. **`scripts/generar-novedades.ts`:**
   - Solo toma entradas cuyo ámbito esté en una lista explícita de ámbitos de cara al usuario:
     `mapa, lista, ficha, alta, operaciones, cola, envios, ajustes, avisos, panel, cola-revision, inventario, fotos, posicion, mapabase, diseño, accesibilidad, busqueda, incidente, medir, compartir`.
     Documenta la lista en el propio script y en 12 (DEC-091).
   - Descarta las que mencionen rutas de archivo (`/\w+\.(ts|tsx|yml|sql|md)\b/`) o identificadores
     como `RV-nn`, `F9.x`, `TR-nn` o `FR-nn`.
   - Corta a 140 caracteres por línea.
   - Si tras filtrar no queda ninguna, `lineas: []`, y Ajustes enseña el texto vacío que ya existe.
2. **CLAUDE.md §5.5:** añade una frase: "La descripción de un `feat:` o `fix:` con ámbito de usuario
   se escribe para un voluntario: qué cambia para él, sin nombres de archivos ni códigos internos.
   Sale tal cual en Novedades (FR-167)."
3. El e2e pasa a "entre 1 y 3 líneas, y ninguna contiene `/` ni `.ts`".

**Tests** (`generar-novedades.test.ts`):

- `excluye ámbitos no listados`.
- `excluye líneas con rutas o códigos internos`.
- `corta a 140`.
- `sin entradas válidas, lineas vacía`.

### RV-48 · Límites y defensas pequeñas · P1 · un solo PR

1. **`dias_reserva_subida` = 1 rechaza todas las reservas** (`0013`, `dias - 1`), y la cola reintenta
   sin fin. Solución: `greatest(dias - 1, 1)` en `fn_proponer`, y la purga protege
   `greatest(dias, 2)`. Test pgTAP con el valor puesto a 1.
2. **`normalizarIp` acepta basura** (`functions/_lib/comun.ts:55`):
   - `1::2::3` se acepta;
   - `::ffff:c000:201` (IPv4 mapeada en hexadecimal) cae en el mismo /64 que `::1`.

   Solución:
   - más de un `::` o más de 8 grupos → se trata como `'invalida'`, un cubo propio que no se mezcla
     con nadie;
   - la forma hexadecimal mapeada se convierte a IPv4.

   Tests en `verificar-codigo.test.ts`.
3. **Una inundación hace crecer `intentos_codigo`** (`0015:42,65`). Cada petición bloqueada inserta
   una fila bajo el bloqueo global. Solución: no insertar la fila `bloqueado = true` si ya hay una del
   mismo `ip_hash` y el mismo tope en el último minuto. Test pgTAP: 100 intentos bloqueados en un
   minuto dejan como mucho una fila por tope.
4. **`fn_renombrar_nucleo`** bloquea filas sin `lock_timeout`. Solución:
   `alter function … set lock_timeout = '5s'`. Test con `proconfig`.
5. **La clave de la caché de `/api/direccion` usa un host ajeno** (`direccion.ts:45`,
   `cache.hidrantes-albolote.invalid`). La Cache API de Cloudflare puede ignorar claves de otro
   origen. Solución: construir la clave con `new URL(request.url).origin + '/__cache/direccion?…'`.
   Test: la clave empieza por el origen de la petición.

---

## 3. Bloque C · Calidad (P2)

### RV-49 · Tres e2e que fallan al correr en paralelo · P2

**Problema.** Con 4 workers fallaron en la revisión, y pasan con `--workers=1`:

- `e2e/operaciones.spec.ts:146` (ya fallaba en la primera revisión);
- `e2e/mapa.spec.ts:319`;
- `e2e/panel-ajustes.spec.ts:197`.

**Solución.**

- Localiza la espera frágil de cada uno (un `waitForTimeout`, un conteo que depende del orden de
  respuestas simuladas, una animación) y sustitúyela por `expect(...).toBeVisible()` o
  `expect.poll`.
- No subas timeouts globales.

**Test.** `npx playwright test --project=movil --project=escritorio --grep-invert @rendimiento --repeat-each=5 --workers=4`
sin fallos. Pega el resumen en el PR.

### RV-50 · Restos de RV-29, RV-31 y RV-13 · P2

1. **Accesibilidad (RV-29).**
   - La medida geométrica debe cubrir **todas** las pantallas del panel: Cola, Inventario, Caducadas,
     Registro, Voluntarios, Papelera y Ajustes. Hoy cubre Cola e Inventario.
   - Debe correr también en escritorio, no solo en móvil.
   - La separación de 12 px debe reconocer la variante destructiva también por la clase del botón
     cuando falte `data-variante`. Mejor: añade `data-variante` en `Boton` siempre.
   - El comentario de cabecera de `accesibilidad.spec.ts` debe decir WCAG 2.2.
2. **ESLint (RV-31).**
   - `JSXExpressionContainer > Literal` da falsos positivos en atributos no visibles
     (`className={'x'}`, `type={'button'}`). Excluye los literales cuyo padre sea un `JSXAttribute`
     que no esté en la lista de atributos visibles (`aria-label`, `title`, `alt`, `placeholder`).
   - Rellena `MODULOS_SIN_UI` con la lista explícita que pedía `docs/17`.
   - Tests en `scripts/eslint.test.ts`.
3. **`probar-restauracion.ts:69` (RV-13).** Además de `--confirmar`, pasa `RESTAURAR` por stdin, así
   que la prueba pasaría aunque `--confirmar` se ignorase. Solución: quítalo del stdin.

### RV-51 · Documentación que va por detrás · P2

- `docs/verificacion/revision-p1.md:56` y 09 §8 dicen que RV-28 a RV-31 están pendientes, y ya están
  fusionados. Corrígelo y crea `docs/verificacion/revision-p2.md`, que no existe.
- **AC-140 (10):** dice que solo se omiten "Salir" e "Ir al mapa", pero el recorrido omite también
  `cerrarSesionGoogle`. Lista las omisiones reales con su motivo.
- **AC-140:** el recorrido del panel usa una cola vacía, así que "Aprobar", "Rechazar" y "Fusionar"
  nunca se pulsan. Siembra una propuesta en ese test y pulsa las tres, o déjalo escrito en 10 como
  parcial.

---

## 4. Bloque D · Funciones de mapa para emergencias (aprobadas, §0.3.2)

### Resumen

El objetivo es G2: "tiempo desde abrir la app hasta ver el punto más cercano que funciona < 15 s,
sin cobertura" (01 §A). Hoy se consigue a mano, ordenando la lista por distancia. Estas funciones
convierten las fortalezas de la app (datos propios, sin conexión, estado real del hidrante) en las
acciones que Google Maps hace bien: "cerca de aquí", "buscar", "compartir", "¿qué hay aquí?" y
"medir distancia".

**Nada de esto calcula rutas.** "Cómo llegar" (FR-161) sigue abriendo la app de mapas del móvil, y
16 §2 no cambia.

| ID | Qué | Sin cobertura | Depende de |
|---|---|---|---|
| GM-00 | Documentos: FR, FL, TR, contratos, simbología, textos, decisiones | — | — |
| GM-01 | Base: coordenadas (decimal, GMS, UTM ETRS89 30N), geometría, parámetro de tramo | sí | GM-00 |
| GM-02 | Pulsación larga → "¿Qué hay aquí?" con acciones | sí | GM-01 |
| GM-03 | Modo incidente: los más cercanos que funcionan | sí | GM-01, GM-02 |
| GM-04 | Búsqueda de calles, lugares, direcciones y coordenadas | calles, lugares y coordenadas sí; números de portal no | GM-01 |
| GM-05 | Compartir y coordenadas | sí (Web Share o portapapeles) | GM-01 |
| GM-06 | Medir distancia y tramos de manguera | sí | GM-01 |

### Principios para todo el bloque

- **Privacidad (11).** El punto de incidente, la medición y la posición **nunca** salen del móvil
  (DEC-062 §8) y no se guardan en IndexedDB ni en la base de datos.
  - El incidente puede ir en la URL (`?incidente=`) y en `sessionStorage` para sobrevivir a una
    recarga.
  - Lo único que sale es el texto de búsqueda de un número de portal, hacia nuestra Function y de
    ahí a CartoCiudad. No se registra ni se guarda en claro.
- **Simbología (06).** Sin colores nuevos: los de caudal significan estado y no se usan para otra
  cosa. El incidente y la medición usan `--marino-950`, `--marino-600` y `--papel` (GM-00 define la
  forma).
- **UI (06 §9).** Ningún control muerto:
  - "Cercanos" sin GPS explica qué hacer (UI-02, UI-04);
  - las listas tienen estado vacío (UI-03): "Ningún punto que funcione a menos de 2 km";
  - todo texto va en el Apéndice A;
  - objetivos de ≥ 44 px.
- **Rendimiento.** Nada del bloque añade más de 10 kB comprimidos al JS inicial (TR-11: hoy
  219 kB de 300). El callejero se carga aparte (GM-04).
- **Sin dependencias nuevas.** UTM, rumbo y distancia a segmento son unas decenas de líneas propias,
  con tests contra vectores de referencia.

### GM-00 · Documentos primero · P1 · un PR solo de documentación

**01 → v1.3.** Estado: "pendiente de conformidad de jefatura en F9.1 (#76); aprobada por el
desarrollador el 23 sep 2026 (DEC-089)". Cambios:

- **FR-11**, al final: "El tipo no cambia una vez creado; se corrige retirando el punto y dando de
  alta el correcto (DEC-090)".
- **FR-50:** la pulsación larga ya no abre el alta directamente. Abre "¿Qué hay aquí?" (FR-72), cuya
  primera acción de alta está a un toque. Sustituye en parte a DEC-077.
- **FR-69**, añadido: "…y por calle, lugar, dirección con número y coordenadas (FR-73)".
- **FR-142:** añade a los parámetros "la longitud del tramo de manguera (20 m por defecto)".
- **Nuevos, en §5**, a continuación de FR-71:

| ID | Requisito |
|---|---|
| FR-72 | **"¿Qué hay aquí?"** Al mantener pulsado el mapa (o clic derecho), se abre una hoja con las coordenadas de ese sitio (decimal y UTM ETRS89 huso 30), la calle más cercana si se conoce y cuatro acciones: *Cercanos desde aquí*, *Medir desde aquí*, *Compartir esta ubicación* y *Añadir un punto aquí*. Funciona sin cobertura. |
| FR-73 | **Búsqueda de calles, lugares, direcciones y coordenadas.** La búsqueda encuentra, además de puntos, calles y lugares con nombre de Albolote y Calicasas **sin cobertura**, y con cobertura también el número de portal. Acepta coordenadas en decimal, grados-minutos-segundos y UTM, y enlaces de Google Maps o Apple Plans que las contengan. Elegir un resultado centra el mapa y ofrece *Cercanos desde aquí*. Los resultados de calles citan su fuente. |
| FR-74 | **Modo incidente: los más cercanos que funcionan.** Desde un botón del mapa (con la posición del GPS), desde FR-72 o desde un resultado de FR-73, la aplicación marca un punto de incidente y lista los cinco puntos activos más cercanos cuyo estado es *bueno* o *regular*. Cada fila da código, tipo y diámetro, estado, distancia en línea recta, rumbo (N, NE…) y tramos de manguera mínimos, con *Cómo llegar* y *Medir tendido*. Un conmutador limita a hidrantes. Funciona sin cobertura, el incidente no sale del móvil, y *atrás* lo cierra. |
| FR-75 | **Compartir y coordenadas.** La ficha, FR-72 y FR-74 permiten compartir con el menú del móvil (o copiar, donde no lo haya) un texto con código, tipo, diámetro y estado si es un punto, dirección, coordenadas en decimal y UTM ETRS89 huso 30, y un enlace de Google Maps a esas coordenadas. La ficha enseña las coordenadas en los dos formatos, con botón de copiar. Nunca se incluyen nombres (FR-27). |
| FR-76 | **Medir distancia.** Una herramienta de medición sobre el mapa suma tramos entre los puntos que se tocan (y se imanta a los marcadores cercanos), y enseña la distancia total y el número de tramos de manguera que hacen falta según FR-142. Deshacer el último punto, borrar y terminar. Funciona sin cobertura. |

**02:** flujos nuevos FL-35 a FL-38, siguiendo el formato de los existentes:

- FL-35: incidente con GPS, sin cobertura;
- FL-36: incidente desde una calle buscada;
- FL-37: compartir un hidrante con bomberos por WhatsApp;
- FL-38: medir el tendido desde un hidrante.

Cada uno con sus pasos y la variante sin cobertura.

**03:** TR nuevos.

| ID | Requisito |
|---|---|
| TR-116 | Calcular los cercanos sobre 1.000 puntos tarda **< 50 ms** en un móvil medio. Se mide en vitest, en Node, con umbral de 20 ms, y en e2e con CPU ×4. |
| TR-117 | El callejero ocupa ≤ 200 kB sin comprimir, se precachea en el Service Worker y no forma parte del JS inicial. |
| TR-118 | `/api/geocodificar` responde en ≤ 5 s o devuelve `SIN_SERVIDOR`. Con él caído, la búsqueda sigue funcionando para calles, lugares y coordenadas. |
| TR-119 | La conversión a UTM tiene un error ≤ 1 m frente a PROJ (EPSG:4258 → EPSG:25830) en la zona. |

Añade CartoCiudad a §8 (dependencias externas y sus condiciones).

**05:**

- `POST /api/geocodificar` (§9, contrato en GM-04);
- clave de config `metros_tramo_manguera`, entero de 10 a 30, por defecto 20;
- su inclusión en la `config` de `fn_listar_puntos`.

**06:**

- §4.7 nuevo, "Marcas de trabajo":
  - **incidente:** diana de 32 px (icono `Crosshair` de lucide) en `--marino-950` sobre un círculo
    `--papel` con borde de 2 px `--marino-950`, por encima de los marcadores;
  - **líneas del incidente a cada candidato:** discontinuas de 2 px `--marino-600`;
  - **medición:** línea continua de 3 px `--marino-950` con vértices de 10 px `--papel` y borde
    `--marino-950`, y la etiqueta de distancia en `font-datos`.

  En oscuro, los equivalentes de §2.4.
- Apéndice A: todos los textos del bloque.

**10:** AC-150 a AC-156, uno por FR nuevo, más el de G2 (GM-03) y el de TR-119.

**11:** privacidad de incidente, medición y búsqueda (principios de arriba).

**12:**

- **DEC-089:** funciones de emergencia, con las alternativas descartadas: rutas propias (16), APIs de
  Google (clave, facturación y términos que prohíben el uso sin conexión), brújula, Share Target,
  Street View y rondas guardadas (§9).
- **DEC-090:** el tipo no se cambia.
- **DEC-091:** ámbitos de novedades (RV-47).
- **DEC-092:** CartoCiudad a través de una Function, con licencia y atribución (verifícalas en
  cartociudad.es y cítalas).
- **DEC-093:** callejero desde OSM (ODbL).

**16:** la fila "Rutas calculadas dentro de la app" se mantiene. Añade a §2.1 que el modo incidente
cubre "lo más cercano que funciona" sin rutas.

**Test.** `scripts/docs.test.ts` debe seguir en verde. Amplíalo para exigir que cada FR de 01 tenga
al menos un AC en 10 que lo cite.

### GM-01 · Base común: coordenadas, geometría y tramo de manguera · P1

**`src/lib/coordenadas.ts`** (nuevo):

```ts
export interface LatLng { lat: number; lng: number }
export interface Utm { huso: 30; x: number; y: number }            // ETRS89 / UTM 30N (EPSG:25830)
export function aUtm(p: LatLng): Utm;                              // Transversa de Mercator, GRS80
export function desdeUtm(u: { x: number; y: number }, huso?: 30): LatLng;
export function formatoDecimal(p: LatLng): string;                // "37.230500, -3.656000"
export function formatoUtm(u: Utm): string;                       // "30S 441808 4120645" (redondeo a metro)
export function formatoGms(p: LatLng): string;                    // "37°13′49.8″N 3°39′21.6″O"
export function interpretar(texto: string): (LatLng & { oesteSupuesto?: string }) | null; // ver GM-04 y docs/19 RV-69
export function enlaceGoogleMaps(p: LatLng): string;              // https://www.google.com/maps/search/?api=1&query=lat,lng
```

- ETRS89 y WGS84 se tratan como iguales: la diferencia es menor de 1 m y los GPS dan WGS84.
- Implementa la serie estándar de la transversa de Mercator con k0 = 0,9996, falso este 500.000 y
  GRS80, a = 6378137, f = 1/298.257222101.
- Letra de banda "S" para 32° a 40° N.
- Fuera de la zona (lng fuera de −6..0), `aUtm` lanza. No debería pasar en esta app; si pasa, el
  llamador no enseña UTM.

**`src/lib/geometria.ts`** (nuevo):

- `metros()`: se mueve aquí desde `puntos.ts`, y `puntos.ts` la reexporta para no romper imports.
- `rumbo(a, b): number`: grados 0–360 desde el norte.
- `rumboCorto(grados): 'N'|'NE'|'E'|'SE'|'S'|'SO'|'O'|'NO'`.
- `distanciaASegmento(p, a, b)` y `distanciaALinea(p, linea)`: en metros, con proyección
  equirectangular local, suficiente a escala municipal.
- `longitudLinea(puntos)`.
- `tramos(metros, largo): number`: `Math.ceil(metros / largo)`, y 0 si `metros` = 0.

**Config.**

- **Migración:**
  - `insert … ('metros_tramo_manguera', '20')`;
  - `fn_listar_puntos` la añade a `config` (misma firma, aditivo);
  - `fn_guardar_config` valida un entero de 10 a 30 (mira cómo valida hoy los demás parámetros y
    usa el mismo mecanismo).
- `derivar.ts` / `leerConfig`: lee `metros_tramo_manguera`, con 20 por defecto.
- Jefatura: la lee de su pantalla de parámetros, y `src/lib/panel/ajustes.ts` la muestra y edita
  (FR-142).

**Tests.**

- `coordenadas.test.ts`, con los vectores de referencia calculados con PROJ (pyproj,
  EPSG:4258 → EPSG:25830). Tolerancia ≤ 1 m (TR-119):

  | lat | lng | X | Y |
  |---|---|---|---|
  | 37.2305 | −3.6560 | 441808.02 | 4120644.54 |
  | 37.2560 | −3.6570 | 441738.94 | 4123474.12 |
  | 37.2000 | −3.7000 | 437879.84 | 4117288.83 |
  | 37.3500 | −3.6100 | 445974.11 | 4133874.64 |

  y la inversa: (441000, 4120000) → (37.224640, −3.665057).
- Ida y vuelta de `aUtm` → `desdeUtm` < 0,01 m. `formatoGms` para 37.2305 da `37°13′49.8″N`.
- `geometria.test.ts`:
  - `rumbo` de un punto a otro exactamente al norte, al este y al suroeste;
  - `rumboCorto(22)` → N, `rumboCorto(23)` → NE;
  - `distanciaASegmento` con el punto proyectado dentro y fuera del segmento;
  - `tramos(0,20)=0`, `tramos(1,20)=1`, `tramos(40,20)=2`, `tramos(41,20)=3`.
- pgTAP: `metros_tramo_manguera` en `config` de `fn_listar_puntos`, y `fn_guardar_config` rechaza 5
  y 40.
- `derivar.test.ts`: `leerConfig` sin la clave → 20.

### GM-02 · "¿Qué hay aquí?" con la pulsación larga · P1 · mismo PR que GM-05

**Hoy.** La pulsación larga (`MapaLeaflet.tsx:83-110`, `pulsacion-larga.ts`, DEC-077) lleva
directamente a `/proponer/alta?lat=&lng=`.

**Cambio.** La pulsación larga, o el clic derecho, sobre el mapa (no sobre un marcador) hace dos
cosas:

1. Pone una marca temporal: el marcador por defecto de "pin soltado", con el icono `MapPin` de lucide
   en `--marino-950`.
2. Abre una **hoja inferior** (el patrón de hoja o diálogo que ya use la ficha; en escritorio, panel
   flotante como la ficha, FR-70) con:
   - **Cabecera:** coordenadas en decimal y UTM (GM-01), cada una con botón de copiar, y la calle más
     cercana si el callejero de GM-04 está cargado y hay una a menos de 60 m
     (`distanciaALinea`). Si no, nada.
   - **Acciones, en este orden:**
     1. **Cercanos desde aquí** → GM-03 con ese origen.
     2. **Medir desde aquí** → GM-06 con ese primer vértice.
     3. **Compartir esta ubicación** → GM-05.
     4. **Añadir un punto aquí** → `/proponer/alta?lat=&lng=`, que es el comportamiento de hoy.
   - **Cerrar:** quita la marca. *Atrás* también la cierra (estado en la URL `?aqui=lat,lng`, igual
     que `?p=`).

**Tests.**

- E2e `mapa.spec.ts`:
  - `mantener pulsado abre ¿Qué hay aquí? con coordenadas UTM`: comprueba el texto con un vector de
    GM-01;
  - `Añadir un punto aquí lleva al alta con esas coordenadas`. Adapta el test actual de pulsación
    larga, que hoy espera el alta directa, y di en el PR que cambia por FR-50 v1.3;
  - `atrás cierra la hoja`;
  - `sobre un marcador sigue abriendo la ficha`: el test actual debe seguir en verde.
- `controles.spec.ts` y `accesibilidad.spec.ts` incluyen la hoja: axe y medidas.

### GM-03 · Modo incidente: los más cercanos que funcionan · P1

**Lógica** (`src/lib/incidente.ts`, nuevo):

```ts
export interface Candidato { punto: Punto; metros: number; rumbo: number; tramos: number }
export function cercanos(puntos: Punto[], origen: LatLng,
  o: { soloHidrantes: boolean; n?: number; maxMetros?: number; metrosTramo: number }): Candidato[];
```

- **Filtro:** `caudal in ('bueno', 'regular')` y, si `soloHidrantes`, `tipo === 'hidrante'`.
- **Orden:** por `metros` ascendente. Si la diferencia es menor de 10 m, desempata el de mayor
  `radio_px`, que es el más aprovechable (06 §4).
- `n` es 5 y `maxMetros` 2.000, sin config: si hace falta, se decide después.
- Aparte, `masCercanoQueNoFunciona(…)`, para avisar ("el más cercano, HID-0012 a 40 m, no funciona")
  y evitar que alguien vaya a él por costumbre.

**Entrada.**

- **Botón "Cercanos"** en el mapa, junto a "centrar en mí": icono `Crosshair`, texto visible en
  móvil y ≥ 44 px.
  - Con GPS `ok` y no antigua (RV-40), el origen es la posición.
  - Con posición antigua, el origen es esa posición y un aviso dice "posición de hace N min".
  - Sin posición, se abre la misma hoja con el texto "Sin posición: mantén pulsado el mapa donde está
    el incidente o busca la calle", el campo de búsqueda enfocado y **ningún** botón inerte.
- Desde GM-02 y desde un resultado de GM-04, con ese origen.
- **URL:** `/?incidente=lat,lng` (6 decimales). *Atrás* cierra el modo. Una recarga lo mantiene.

**Pantalla.**

- **Mapa:**
  - la diana del incidente (06 §4.7);
  - líneas discontinuas a los candidatos;
  - encuadre para que se vean el incidente y los tres primeros (`fitBounds` con margen);
  - los demás marcadores siguen visibles, sin atenuar.
- **Hoja o panel "Cercanos":**
  - Cabecera: "Desde tu posición" o "Desde el punto marcado"; el conmutador "Solo hidrantes"; y
    "distancias en línea recta".
  - **Filas**, como mucho 5:
    - `MarcadorSvg`;
    - `código · tipo diámetro · estado`;
    - `140 m · NE · ≥ 8 tramos`, en notación canónica con ` · `;
    - acciones *Cómo llegar* (`enlaceComoLlegar`, FR-161) y *Medir tendido* (GM-06 con la recta
      incidente → punto, que el voluntario puede ajustar).
    - Tocar la fila abre la ficha sin cerrar el incidente.
  - **Estado vacío:** "Ningún punto que funcione a menos de 2 km del incidente", con el botón "Ver
    todos en la lista" (lista ordenada por distancia desde el incidente).
  - **Aviso**, si procede: el más cercano no funciona.
  - Pie: "Datos de hace N min" (FR-168), porque sin cobertura importa.
- **Lista:** con incidente activo, "ordenar por distancia" ordena desde el incidente y no desde el
  GPS, y la cabecera lo dice.

**Tests.**

- `incidente.test.ts`:
  - excluye `malo` y `no_funciona`;
  - `soloHidrantes` excluye bocas;
  - orden por distancia y desempate por `radio_px` a menos de 10 m;
  - `maxMetros` corta;
  - los tramos usan `metrosTramo`;
  - `masCercanoQueNoFunciona`;
  - **rendimiento (TR-116):** 1.000 puntos aleatorios en la zona, mediana de 20 ejecuciones < 20 ms
    en Node.
- E2e `incidente.spec.ts` (nuevo, con `setGeolocation` y 30 puntos simulados de estados mezclados):
  - **sin red** (`context.setOffline(true)` tras la primera carga), pulsar "Cercanos": 5 filas, todas
    bueno o regular, en orden de distancia correcto y con la distancia esperada ±1 m;
  - "Solo hidrantes" cambia la lista;
  - el aviso del más cercano que no funciona aparece;
  - sin posición, la hoja explica y enfoca la búsqueda;
  - *atrás* cierra y la URL vuelve a `/`;
  - recargar con `?incidente=` restaura.
  - **G2 (AC):** con puntos guardados y sin red, desde `page.goto('/')` hasta ver la primera fila de
    "Cercanos" con un toque: < 3 s en el perfil móvil. Márcalo `@rendimiento`.
- `accesibilidad.spec.ts` y `controles.spec.ts` con el modo incidente abierto.

### GM-04 · Búsqueda de calles, lugares, direcciones y coordenadas · P1

**A. Callejero sin conexión** (`scripts/generar-callejero.ts`, nuevo, `npm run callejero`)

- **Fuente:** OSM vía Overpass, con los mismos servidores y el mismo `User-Agent` que
  `generar-zona.ts:33-37`. Se ejecuta **a mano o en el workflow de regenerar** (FR-165), nunca en el
  build de CI.
- **Consulta**, dentro del recuadro de `datos/zona-cobertura.geojson`:
  - `way[highway][name]`, sin `highway=footway|path|steps|cycleway` salvo que tengan nombre de calle
    (`name` empieza por un tipo de vía);
  - `node[place][name]`;
  - `way/relation[landuse=industrial][name]`;
  - `nwr[amenity~"^(school|kindergarten|college|hospital|clinic|doctors|townhall|police|fire_station|social_facility|community_centre)$"][name]`;
  - `nwr[leisure~"^(park|sports_centre|stadium)$"][name]`.
- **Proceso:**
  - Une los tramos con el mismo nombre y municipio.
  - Simplifica con `@turf/simplify` (ya en `devDependencies`) a unos 3 m.
  - Asigna el municipio con `limite-municipal.geojson` (punto medio de la geometría).
  - Descarta lo que caiga fuera de la zona.
  - Coordenadas redondeadas a 5 decimales.
- **Salida:** `public/callejero.json`:

  ```json
  {
    "version": "AAAAMMDD",
    "fuente": "© colaboradores de OpenStreetMap (ODbL)",
    "entradas": [
      { "n": "Calle Real", "t": "calle", "m": "albolote", "g": [[[lng, lat], …], …] },
      { "n": "Polígono Juncaril", "t": "lugar", "m": "albolote", "c": [lng, lat] }
    ]
  }
  ```

  - `g` es una multilínea para calles.
  - `c` es un punto, o el centroide, para lugares y equipamientos.
  - También escribe `datos/callejero.json` con `version` y `entradas`, para Salud del sistema.
- **Tamaño:** ≤ 200 kB sin comprimir (TR-117). El script falla si lo supera.
- **Precacheo:** `vite.config.ts` → `workbox.additionalManifestEntries` con `/callejero.json` y su
  revisión (hash del archivo), o `json` en `globPatterns` limitado a ese archivo. Nada más de
  `public/` debe entrar por error.
- **Carga:** `src/lib/callejero.ts` hace `fetch('/callejero.json')` la primera vez que se usa la
  búsqueda o GM-02. Lo guarda en memoria y **no** va en el JS inicial.
- **Regenerar desde Ajustes (FR-165):**
  - el workflow que regenera zona y mapa base (`mantenimiento.yml` o el que corresponda) regenera
    también el callejero y abre el PR igual que hoy;
  - `cargar-version-mapabase.ts` o un equivalente anota `version_callejero` en config tras desplegar,
    y Salud del sistema la enseña.

**B. Interpretar coordenadas y enlaces** (`coordenadas.interpretar`, GM-01)

| Entrada | Resultado |
|---|---|
| Decimal: `37.2305, -3.656` · `37,2305 -3,656` (coma decimal española si hay espacio entre los dos números) · `37.2305N 3.656W` · `3.656O` | coordenadas |
| GMS: `37°13'49.8"N 3°39'21.6"W`, con `O` u `W` y con ′ ″ tipográficas | coordenadas |
| UTM: `30S 441808 4120645` · `441808 4120645` · `X 441808 Y 4120645`; solo si cae dentro de la zona con 5 km de margen | coordenadas |
| Enlaces: `google.com/maps/@lat,lng,…`, `…/maps/place/…/@lat,lng…`, `…?q=lat,lng`, `…?query=lat,lng`, `…!3dLAT!4dLNG`, `maps.apple.com/?ll=lat,lng` o `q=`, `geo:lat,lng` | coordenadas |
| Enlaces cortos `maps.app.goo.gl/…` | `null`, y el texto "Abre el enlace en el navegador y copia las coordenadas". No se resuelven: exigiría ir a Google desde el servidor. |
| Cualquier coordenada fuera de la zona con 5 km de margen | se acepta, pero con el aviso de fuera de zona que ya existe (FR-55) |

**C. Números de portal: `POST /api/geocodificar`** (Pages Function nueva)

- **Petición:**
  - cuerpo `{ token?: string, q: string }`;
  - o `Authorization: Bearer <jwt>` de jefatura.
  - Autorización igual que `functions/api/push.ts:autorizado` (token de voluntario válido o
    administrador). **Nunca anónimo**: no es un proxy abierto.
- **Validación:** `q` de 3 a 120 caracteres después de `trim`. Si no, `400 PAYLOAD_INVALIDO`.
- **Llamada:**
  - `GET https://www.cartociudad.es/geocoder/api/geocoder/candidates?q=<q>&limit=10&no_process=municipio,provincia,comunidad autonoma,expendeduria,punto_recarga_electrica,ngbe,carretera`
    con `AbortSignal.timeout(5000)` (TR-118) y el `User-Agent` de `NOMINATIM_USER_AGENT`;
  - si un candidato `portal` o `callejero` no trae `lat`/`lng`,
    `find?id=<id>&type=<type>&portal=<portalNumber>`.
  - **Antes de escribir código**, comprueba los parámetros y la forma de respuesta contra la
    documentación oficial (`github.com/IDEESpain/Cartociudad`) y con una llamada real desde local.
    Cita lo comprobado en DEC-092.
- **Filtro:** solo resultados dentro del recuadro de la zona de cobertura con 2 km de margen. La
  Function no importa GeoJSON: un recuadro constante, generado desde `datos/meta.json` si está ahí.
- **Respuesta 200:**

  ```json
  { "resultados": [
      { "etiqueta": "Calle Real, 12, Albolote",
        "tipo": "portal|calle|lugar",
        "lat": 37.2,
        "lng": -3.6,
        "municipio": "albolote" }
    ],
    "fuente": "CartoCiudad (IGN/CNIG)" }
  ```

  Como mucho 5.
- **Errores:**
  - CartoCiudad caído o fuera de tiempo → `503 SIN_SERVIDOR`;
  - sin autorización → `401`.
- **Caché:** `caches.default`, 30 días. La clave es
  `new URL(request.url).origin + '/__cache/geocodificar?q=' + sha256(normalizar(q))`, sin el texto en
  claro (11).
- **Privacidad:** no se registra `q` ni en logs ni en `errores_cliente`.
- **CSP:** no cambia, porque el navegador solo habla con nuestro origen.
- 05 §9 y 04 (Functions).

**D. La búsqueda en la interfaz** (la búsqueda existente del mapa y de la lista, FR-69)

- **Orden de resultados:**
  1. si `interpretar(texto)` da coordenadas, un único resultado "Coordenadas …" arriba;
  2. **Puntos** (lo de hoy, `buscar()`);
  3. **Calles y lugares** del callejero, que funcionan sin cobertura;
  4. **Direcciones**, solo si el texto lleva un número (`/\b\d{1,4}\s*[a-zA-Z]?\s*$/` o `, 12`) y hay
     conexión.
- **Normalización del callejero:**
  - sin tildes ni mayúsculas;
  - tipos de vía opcionales y abreviados (`c/`, `calle`, `avda`, `av.`, `avenida`, `pza`, `plaza`,
    `ctra`, `carretera`, `cmno`, `camino`, `urb`, `urbanización`);
  - coincidencia por palabras, igual que `buscar()`;
  - como mucho 8 resultados;
  - desempate por municipio igual al del centro del mapa.
- **Direcciones:**
  - se piden con retardo de 400 ms tras la última tecla y como mucho una petición a la vez (se
    cancela la anterior);
  - sin conexión, o con `SIN_SERVIDOR`, se muestra "Los números de portal necesitan cobertura: te
    enseño la calle" y el resultado de la calle.
- **Elegir un resultado:**
  - un **punto** abre su ficha, como hoy;
  - una **calle** encuadra la calle, la resalta con una línea `--marino-600` de 4 px durante la
    sesión y abre GM-02 en el punto de la calle más cercano al centro del mapa;
  - un **lugar**, una **dirección** o unas **coordenadas** centran el mapa a z18 y abren GM-02 ahí.

  Desde GM-02, *Cercanos desde aquí* lleva a GM-03 con un toque.
- **Atribución:** los resultados de calles llevan "© OpenStreetMap" y los de direcciones "CartoCiudad
  · IGN", en el propio grupo de resultados.

**Tests.**

- `generar-callejero.test.ts`, con un JSON de Overpass de ejemplo en `scripts/fixtures/`:
  - une tramos del mismo nombre;
  - asigna el municipio;
  - descarta lo que queda fuera de la zona;
  - falla por encima de 200 kB.
- `callejero.test.ts`:
  - "c/ real", "calle real" y "CALLE REAL" encuentran "Calle Real";
  - "avda andalucia" encuentra "Avenida de Andalucía";
  - como mucho 8 resultados;
  - desempate por municipio.
- `coordenadas.test.ts` (interpretar):
  - todas las filas de la tabla B, con al menos 12 casos;
  - enlaces cortos → `null`;
  - UTM fuera de la zona → `null`;
  - coma decimal.
- `functions/api/geocodificar.test.ts`, con `fetch` simulado:
  - sin token → 401;
  - `q` corta → 400;
  - filtra fuera del recuadro;
  - usa `find` cuando falta `lat`;
  - un timeout da 503;
  - la segunda petición igual sale de la caché, que se simula;
  - la clave de caché no contiene el texto;
  - como mucho 5 resultados.
- `scripts/probar-functions.ts`: `/api/geocodificar` sin token → 401.
- E2e `busqueda.spec.ts` (nuevo):
  - **sin red:** "calle real" enseña la calle; al elegirla, la resalta y abre "¿Qué hay aquí?";
  - pegar `https://www.google.com/maps/@37.2305,-3.656,17z` enseña "Coordenadas" arriba;
  - con red y `/api/geocodificar` simulado, "calle real 12" enseña la dirección, y al elegirla
    centra el mapa;
  - con `/api/geocodificar` en 503, sale el texto de cobertura y la calle.
- `rendimiento.spec.ts`: el JS inicial sigue ≤ 300 kB (ya lo mide `presupuesto`) y `callejero.json`
  no se pide al arrancar, solo al abrir la búsqueda.

### GM-05 · Compartir y coordenadas · P1 · mismo PR que GM-02

**`src/lib/compartir.ts`** (nuevo):

```ts
export function textoPunto(p: Punto): string;
export function textoUbicacion(l: LatLng, calle?: string | null): string;
export async function compartir(titulo: string, texto: string): Promise<'compartido' | 'copiado' | 'cancelado' | 'fallo'>;
```

- **Texto de un punto**, todo desde `textos.ts`:

  ```
  HID-0123 · hidrante 100 mm · bueno
  Calle Real 5, Albolote
  37.230500, -3.656000 · UTM 30S 441808 4120645 (ETRS89)
  https://www.google.com/maps/search/?api=1&query=37.230500,-3.656000
  ```

  Nunca incluye nombres ni la descripción libre (FR-27, y la descripción la escriben voluntarios).
  **No** incluye el enlace a nuestra app: quien lo recibe (bomberos, 112) no tiene acceso.
- **`compartir()`:**
  - si existe `navigator.share`, lo usa;
  - si el usuario cancela (`AbortError`), devuelve `cancelado` y no avisa;
  - si no hay `share`, `navigator.clipboard.writeText` y un aviso "Copiado";
  - si tampoco se puede, `fallo` y un aviso con el texto seleccionable, sin fallo silencioso (UI-05).
- **Ficha:**
  - bloque "Coordenadas" con decimal y UTM, cada uno con botón de copiar;
  - botón "Compartir" junto a "Cómo llegar";
  - con ≥ 12 px de separación de cualquier acción destructiva (UI-13).
- **GM-02** ("Compartir esta ubicación") y **GM-03** (en cada fila, a través de la ficha, y en la
  cabecera "Compartir el incidente", con `textoUbicacion`).

**Tests.**

- `compartir.test.ts`:
  - `textoPunto` da el formato exacto de arriba para un punto de prueba, con el UTM del primer
    vector de GM-01;
  - no contiene la descripción;
  - `compartir` usa `share`, cae al portapapeles, trata `AbortError` como cancelado y devuelve
    `fallo` sin portapapeles.
- E2e:
  - `la ficha enseña UTM y copia`, con permisos de portapapeles en Chromium;
  - `compartir llama a navigator.share con el texto`, sustituyendo `navigator.share` con
    `addInitScript` y comprobando el argumento;
  - `sin navigator.share, copia y avisa`.

### GM-06 · Medir distancia y tramos de manguera · P1

**Herramienta** (`src/componentes/mapa/Medicion.tsx` y `src/lib/medicion.ts`):

- **Entrar:** desde GM-02 ("Medir desde aquí"), desde una fila de GM-03 ("Medir tendido", que
  precarga incidente → punto) y desde un botón "Medir" en el menú de herramientas del mapa (donde
  están las capas).
- **Mientras está activa:**
  - un toque o clic en el mapa añade un vértice y **no** abre fichas;
  - si el toque cae a ≤ 44 px de un marcador, el vértice se imanta a su posición exacta;
  - la pulsación larga no abre GM-02.
- **Barra inferior fija:**
  - `186 m · 10 tramos de 20 m`, en notación canónica, con `aria-live="polite"`;
  - botones "Deshacer", "Borrar" y "Terminar", con "Borrar" separado ≥ 12 px de "Terminar";
  - con 0 o 1 vértices, "Deshacer" no se oculta: se deshabilita con su motivo escrito (UI-02).
- Cada tramo lleva su etiqueta de distancia si mide más de 30 m.
- **Salir:** "Terminar" o *atrás* (estado `?medir=1` en la URL). La medición no se guarda.

**Tests.**

- `medicion.test.ts`:
  - la suma de tramos coincide con `longitudLinea`;
  - el imán elige el marcador más cercano dentro del radio y ninguno fuera;
  - deshacer y borrar;
  - los tramos usan la config.
- E2e `medir.spec.ts`:
  - entrar desde GM-02, tocar dos puntos a una distancia conocida (dos marcadores simulados a 100 m)
    y leer `100 m · 5 tramos de 20 m`, con el imán;
  - tocar el mapa no abre fichas mientras mide;
  - *atrás* sale;
  - "Medir tendido" desde el incidente trae la recta precargada.
- `accesibilidad.spec.ts` y `controles.spec.ts` con la barra de medición.

---

## 5. Fuera de alcance: requiere decisión

No lo implementes. Si hace falta, abre una issue de tipo *decisión*.

| Tema | Por qué | Nota |
|---|---|---|
| Brújula y rumbo en el punto azul | Descartado el 23 sep 2026: en iOS pide permiso de orientación y es poco fiable cerca de vehículos | Revisar tras el piloto |
| Recibir ubicaciones compartidas (Share Target) | Descartado el 23 sep 2026: solo Android instalado | Revisar tras el piloto |
| Street View en la ficha | Descartado el 23 sep 2026 | Es un enlace externo si se pide |
| Rondas de revisión guardadas | Descartado el 23 sep 2026: "sin revisar" más orden por distancia lo cubre | — |
| Resolver enlaces cortos de Google Maps en el servidor | Exigiría seguir redirecciones a Google desde la Function | Solo si el piloto demuestra que se usan mucho |
| Duplicados entre altas pendientes (FR-51 solo mira puntos activos) | Cambia FR-51 | Recomendación: comparar también con altas pendientes del mismo tipo en el radio |
| `fecha_ultima_revision` = fecha de la visita | Sigue pendiente de `docs/17` §12 | — |
| Deshacer una retirada desde el panel | Sigue pendiente de `docs/17` §12 | — |
| Turnstile o código más largo | Sigue pendiente de `docs/17` §12 | RV-14 detecta el ataque |

---

## 6. Checklist final

- [ ] Bloques A y B: cada RV con su issue cerrada, su PR fusionado y el test de regresión que falló
      antes del arreglo.
- [ ] `npm run typecheck && npm run lint && npm run formato:comprobar && npm test && npm run build && npm run presupuesto`
      en verde.
- [ ] `npm run e2e` en verde; con `--repeat-each=5 --workers=4`, sin fallos (RV-49).
- [ ] `ci-sql` en verde:
  - [ ] purga con más de 1.000 fotos (RV-33);
  - [ ] restauración con credenciales y secuencias (RV-34, RV-35);
  - [ ] tareas guardadas (RV-38).
- [ ] `npm run compatibilidad` en verde tras cada migración.
- [ ] `scripts/comprobar-auth.ts` ejecutado contra staging y prod, con el resultado en la issue
      (RV-36).
- [ ] Bloque D:
  - [ ] 01 v1.3, 02, 03, 05, 06, 10, 11, 12 y 16 al día (GM-00);
  - [ ] AC de G2 en verde;
  - [ ] el callejero generado y precacheado;
  - [ ] `/api/geocodificar` probado contra CartoCiudad real desde local una vez (anota la fecha).
- [ ] Nada de nombres, correos ni secretos en issues, PR ni commits (DEC-053).
