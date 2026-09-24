# 19 · Producción al día, avisos con un Worker y tercera revisión (24 sep 2026)

| | |
|---|---|
| **Para** | Claude Code, en este repositorio (`aron285-coder/hidrantes-albolote`) |
| **Base** | `develop` en `631040c`, con `docs/17` y `docs/18` ya aplicados |
| **Situación** | `main` (producción) sigue en `2b2a541`, del 18 sep 2026: la versión de prueba de la Fase 0. Va **145 commits** por detrás de `develop`. `avisos.yml` falla en PROD en cada ejecución, y GitHub solo ejecuta su cron `*/15` cada 3 o 5 horas. |
| **Estado de partida** | typecheck, lint, prettier, 1.573 tests de vitest, build, presupuesto (229,4 kB) y 329 e2e en verde; CI de `develop` en verde |
| **Bloques** | **P** paridad de producción (primero) · **A** errores P0 · **B** errores P1 · **C** P2 |

---

## 0. Cómo trabajar con este documento

### 0.1 Reglas

Son las mismas que en `docs/17` §0 y `docs/18` §0:

- Una issue por `RV-nn` o `P-nn` (con el `task-shaper`, milestone "Fase 9"), rama `fase-9/…` y PR a
  `develop` con la plantilla.
- **Test de regresión primero:** debe fallar sobre `develop` y el PR lo dice.
- Migraciones solo hacia adelante: siguiente número libre `0029_…`, `create or replace` o
  `alter function` con la misma firma.
- 05 se actualiza antes que el código. Los textos nuevos van a `textos.ts` y al Apéndice A.
- Las decisiones nuevas van a 12 empezando en **DEC-096**.

Registros de verificación:

| Bloque | Archivo |
|---|---|
| P | `docs/verificacion/paridad-produccion.md` |
| A | `docs/verificacion/revision-3-p0.md` |
| B | `docs/verificacion/revision-3-p1.md` |
| C | `docs/verificacion/revision-3-p2.md` |

Actualiza también 09 §8 y añade este documento a `docs/INDICE.md`.

### 0.2 Decisiones del desarrollador (24 sep 2026)

1. **Producción tiene siempre la versión completa de staging.**
   - Desde hoy, `main` se pone al día con `develop` al cerrar cada bloque de este documento y, en
     adelante, al cerrar cada bloque de trabajo.
   - Poner producción al día **no abre el acceso**: el código de acceso real se comunica en F9.10
     (#85), después del piloto y de la validación de jefatura (#76, #77).
   - Esto sustituye la regla de CLAUDE.md §5 "no lo pidas hasta que la Fase 9 lo diga" y cambia el
     sentido de F9.4 (#79): de "primer despliegue a producción" pasa a "abrir producción a la
     agrupación".
   - Se anota como **DEC-096**, junto con los cambios en CLAUDE.md, 04 §4, 09 y #79 (P-04).
2. **Los avisos push los despacha un Cloudflare Worker con Cron Trigger**, no GitHub Actions ni la
   base de datos. Se anota como **DEC-097**, que sustituye la cadencia de DEC-088.
   - **Por qué un Worker:** el cron de GitHub es de mejor esfuerzo. `avisos.yml`, programado cada
     15 min, ha corrido a las 16:16, 19:45, 22:45, 01:09, 06:10 y 11:48.
   - Un Worker en el plan gratuito da 5 Cron Triggers por cuenta, 100.000 peticiones al día y 50
     subpeticiones externas por invocación. Usa la cuenta de Cloudflare que ya existe: sin cuenta
     nueva ni coste (DEC-037).
   - **Descartado:** `pg_cron` con `pg_net`. Exigiría activar una extensión en la base de datos que
     se comparte con uniformidad y guardar el secreto en esa base.

### 0.3 Orden

Bloque **P** (P-01 a P-04), luego **A** (RV-52 primero) y después **B**. El bloque **C** puede ir
en paralelo. Al cerrar A y al cerrar B, vuelve a hacer P-02 y P-03: un PR `develop → main` y su
verificación. Producción no debe quedar nunca más de un bloque por detrás.

---

## 1. Bloque P · Producción con la versión completa de staging

### P-01 · Comprobar que producción tiene todo lo que la versión actual necesita · antes del PR

`main` es del 18 sep. Desde entonces han aparecido secretos, variables y pasos de despliegue nuevos.
Antes de proponer el PR, comprueba **sin cambiar nada** que producción los tiene. Si falta algo, lo
completas con `scripts/arranque.ts`, que ya sabe hacerlo, o le dices al desarrollador el paso exacto
y el tiempo que le cuesta.

1. **`scripts/comprobar-produccion.ts`** (nuevo, `npm run comprobar-produccion`). Solo lectura:
   - **Environment `production` de GitHub.** Existen los secretos y variables que usa hoy
     `deploy-prod.yml`, sin leer su valor (`gh api repos/{repo}/environments/production/secrets` y
     `/variables`):
     - `SUPABASE_URL`, `SUPABASE_DB_URL`, `PROPIETARIO_EMAIL`, `CLOUDFLARE_API_TOKEN`,
       `CLOUDFLARE_ACCOUNT_ID`;
     - `VITE_ENTORNO`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_MAPABASE_URL`,
       `VITE_VAPID_PUBLIC_KEY`, `SUPABASE_PROJECT_REF`, `PAGES_PROYECTO`.
   - **Secretos del proyecto de Pages `hidrantes-albolote`.** Lista los nombres con
     `wrangler pages secret list --project-name hidrantes-albolote`:
     - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SAL_IP`, `NOMINATIM_USER_AGENT`;
     - `VAPID_PRIVATE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT`, `VIGILANCIA_SECRETO`.
   - **Secretos del repositorio** (lista de `arranque.ts:581`): `SUPABASE_DB_URL_PROD`,
     `SUPABASE_SERVICE_ROLE_KEY_PROD`, `VIGILANCIA_SECRETO_PROD` y `GPG_PUBLIC_KEY`.
   - **Base de datos de producción** (cadena de `hidrantes_migrador`, solo `select`):
     - qué migraciones de `supabase/migrations` faltan en `hidrantes.migraciones_aplicadas`;
     - si el esquema `hidrantes` está en los esquemas expuestos de la Data API (Management API,
       `GET /v1/projects/{ref}/postgrest`, campo `db_schema`);
     - el `db_max_rows` configurado.
   - **Token de Cloudflare:** que tiene los permisos que va a necesitar P-02 y RV-52. Verifícalo con
     `GET /user/tokens/verify` y una llamada de solo lectura a
     `GET /accounts/{id}/workers/scripts`. Hacen falta Pages: Edit y **Workers Scripts: Edit**.
   - **Salida:** tabla OK o FALTA. Termina con código 1 si falta algo imprescindible para desplegar.
   - **Nunca imprime valores**, solo nombres (DEC-053).
2. **Si falta algo:**
   - Secretos o variables que `arranque.ts` sabe poner: ejecuta
     `npm run arranque -- --entorno prod --solo-faltantes`. Añade esa opción si no existe. Nunca
     rota lo que ya está, porque cambiar las claves VAPID dejaría sin avisos a los suscritos
     (`arranque.ts:79`).
   - Si el token de Cloudflare no tiene Workers Scripts: Edit, **para** y escribe en #79 el paso
     exacto para el desarrollador: "Cloudflare → My Profile → API Tokens → editar el token →
     añadir Account · Workers Scripts · Edit" (2 minutos). Actualiza el secreto si cambia.
   - Si `db_max_rows` no es 1000, anótalo en 04. La paginación de RV-15 y RV-33 lo da por hecho.

**Tests:** `scripts/comprobar-produccion.test.ts`, con respuestas de `gh`, `wrangler` y `psql`
simuladas.

- Faltan un secreto de Pages y una migración: la tabla lo dice y el código de salida es 1.
- Con todo presente, el código de salida es 0.
- La salida nunca contiene valores (se inyectan valores centinela y se comprueba que no aparecen).

### P-02 · Poner `main` al día con `develop` · requiere las dos aprobaciones del desarrollador

1. **Versión 0.5.0 antes que nada.** El PR de release-please #193 lleva `autorelease: pending` y el
   CI en `action_required`.
   - Desbloquéalo como dice DEC-079: `gh workflow run ci.yml --ref <rama de release-please>`.
   - Cuando esté en verde, fusiónalo en `develop`.
   - `develop` queda en 0.5.0 con su `CHANGELOG` y sus novedades generadas.
2. Ejecuta `npm run comprobar-produccion` (P-01). Si sale 1, no sigas.
3. **Abre el PR `develop → main`:**
   - Título: `chore(produccion): main al día con develop (0.5.0)`.
   - Cuerpo:
     - enlace a DEC-096;
     - la lista de migraciones que se aplicarán en producción, de la salida de P-01;
     - la frase "no abre el acceso: el código real se comunica en F9.10";
     - la lista de pasos manuales pendientes, si los hay.
   - El PR se fusiona con un **merge commit**, no con squash, para que `main` y `develop` compartan
     historia y P-03 pueda comparar los árboles.
4. **El desarrollador**, 2 minutos en total:
   - aprueba el PR;
   - aprueba el despliegue en el environment `production`.

   Díselo en #79 con los dos enlaces. Nadie más puede hacerlo, y es uno de los pasos previstos en
   CLAUDE.md §1.
5. `deploy-prod.yml` hace el resto:
   - guarda, `migrar` y `asegurar-propietario`;
   - `cargar-zona`, build y despliegue;
   - `comprobar-despliegue` y `cargar-version-mapabase`.

   **No** carga el seed de pruebas; la guarda lo impide.

### P-03 · Verificar que producción es la versión de staging · tras cada P-02

Añade a `deploy-prod.yml`, tras "Comprobar versión y cabeceras", un paso **"Paridad con develop"**
que ejecuta `scripts/paridad.ts` (nuevo). El paso falla el despliegue si algo no coincide.

- `git diff --quiet origin/develop HEAD`: `main` tiene el mismo árbol que `develop` en ese momento.
  Si `develop` avanzó durante el PR, compara con el commit fusionado.
- **Frontend:** la versión que sirve `https://hidrantes-albolote.pages.dev` coincide con el
  `commit-hash` desplegado. `comprobar-despliegue` ya lee la versión servida; reutilízalo.
- **Base de datos:** `migraciones_aplicadas` de producción contiene todas las de
  `supabase/migrations`, con el mismo hash.
- **Functions:** `POST /api/push` sin credenciales devuelve 401, y `POST /api/geocodificar` sin
  credenciales devuelve 401. Esto prueba que existen las Functions de la versión actual; son
  peticiones de solo lectura sin efectos.
- `config.version_mapabase` y `config.version_callejero` en producción coinciden con
  `datos/mapabase.json` y `datos/callejero.json`.

**En `vigilancia.yml`:** comprobación diaria nueva, "producción al día".

- Si `main` va por detrás de `develop` en más de 0 commits que no sean de documentación
  (`git log main..develop -- . ':!docs'`) desde hace **más de 7 días**, es un problema.
- La issue dice cuántos commits, desde cuándo y el paso P-02.

**Tests:**

- `scripts/paridad.test.ts`: detecta una migración que falta, un hash distinto y una versión servida
  distinta.
- `scripts/workflows.test.ts`:
  - `deploy-prod.yml` tiene el paso de paridad **después** del despliegue;
  - `vigilancia.yml` hace la comprobación de producción al día.
- Registro en `docs/verificacion/paridad-produccion.md`: fecha, commit, migraciones aplicadas y
  resultado de `paridad.ts`.

### P-04 · Documentar la nueva regla · mismo PR que la primera P-02, o antes

- **CLAUDE.md §5**, último párrafo, queda así:

  > "Producción solo por PR `develop → main` con aprobación del desarrollador en el *environment*
  > `production`. Al cerrar cada bloque de trabajo, abre ese PR para que producción tenga la versión
  > completa de staging (DEC-096). Poner producción al día no abre el acceso: el código real se
  > comunica en F9.10."

- **04 §4:** el mismo cambio.
- **09:** en la Fase 9, F9.4 pasa a llamarse "Abrir producción a la agrupación", después de F9.1 y
  F9.2.
- **Issue #79:** actualiza el título y el cuerpo con `gh issue edit`.
- **12:** DEC-096, con lo que sustituye de DEC-056 y de CLAUDE.md.

---

## 2. Bloque A · Errores P0

### RV-52 · Los avisos push salen cada 5 minutos desde un Cloudflare Worker · P0

**Problema.**

- `avisos.yml` (cron `*/15`) corre cada 3 a 5 horas porque el cron de GitHub es de mejor esfuerzo.
- Además, la tarea PROD falla desde el 23-09 19:45, porque producción no tiene aún la versión
  actual (lo arregla el bloque P).
- Hoy los avisos solo llegan a tiempo si alguien sincroniza o modera.

**Solución.**

1. **`workers/avisos/`** (nuevo), con su `wrangler.toml` y su `tsconfig`:
   - `name = "hidrantes-avisos"`, `main = "src/index.ts"`, `compatibility_date` igual que el resto
     del repo;
   - `[triggers] crons = ["*/5 * * * *"]`;
   - `[vars] DESTINOS = "https://hidrantes-albolote.pages.dev,https://hidrantes-albolote-staging.pages.dev"`;
   - secretos `VIGILANCIA_SECRETO_PROD` y `VIGILANCIA_SECRETO_STAGING`, que **no** van en el toml.
2. **`workers/avisos/src/index.ts`:**

   ```ts
   export default {
     async scheduled(_evento, env, ctx) { ctx.waitUntil(despachar(env)); },
     async fetch() { return new Response('Not found', { status: 404 }); }, // sin superficie HTTP
   };
   export async function despachar(env, fetchFn = fetch): Promise<Resumen[]>;
   ```

   - Para cada destino llama `POST {destino}/api/push` con `X-Vigilancia: <secreto de ese destino>`
     y `AbortSignal.timeout(25_000)`.
   - Repite mientras la respuesta traiga `quedan === true`, como mucho 10 veces por destino. Son 20
     subpeticiones, por debajo de las 50 del plan gratuito.
   - Un 401 o 404 de un destino se anota con `console.warn`, **sin datos**, y se pasa al siguiente.
     Un destino que aún no tiene la versión no debe parar al otro.
   - Nunca lanza fuera de `despachar`.
   - Los tiempos de `fetch` no cuentan como CPU. El trabajo de CPU, parsear JSON pequeño, queda muy
     por debajo de los 10 ms. Anótalo en DEC-097.
3. **Despliegue:**
   - `deploy-staging.yml`: un paso nuevo tras el despliegue de Pages, solo si cambió `workers/**`
     (`git diff --name-only HEAD~1` o `dorny/paths-filter`; sin acción nueva de terceros si se puede
     hacer con `git`). Ejecuta `npx wrangler deploy --config workers/avisos/wrangler.toml` con el
     token de Cloudflare del environment `staging`.
   - Es un único Worker para los dos entornos. Se despliega desde `develop` porque su código es igual
     para ambos y no toca datos. Anótalo en DEC-097.
4. **`scripts/arranque.ts`:**
   - `--rotar vigilancia` y la primera instalación también hacen
     `wrangler secret put VIGILANCIA_SECRETO_PROD` y `…_STAGING` en el Worker, con los mismos valores
     que en Pages y en los secretos del repo.
   - `--solo-faltantes` (P-01) los pone si faltan.
   - Actualiza la tabla de secretos (`arranque.ts:581-582`), 04 y `docs/entornos.md`.
5. **`avisos.yml`:**
   - Quita `schedule` y deja solo `workflow_dispatch` como envío manual de emergencia.
   - Quítalo de la lista de workflows programados de `mantener-activo.yml` y `vigilancia.yml`, y de
     `scripts/workflows.test.ts`.
6. **`vigilancia.yml`:**
   - El umbral de "avisos sin salir" baja de 2 h a **30 min**.
   - Comprobación nueva: el Worker existe y tiene su cron. Se hace con
     `GET /accounts/{id}/workers/scripts/hidrantes-avisos/schedules` y el token de solo lectura, o
     con el mismo token si no hay otro. Si falta, es un problema.
7. Actualiza 05 §9, 04 (el Worker, su despliegue y sus secretos), 15 §2 (rotar el secreto también en
   el Worker) y 03 §8 (Cloudflare Workers en dependencias).

**Tests:**

- `workers/avisos/src/index.test.ts` (vitest), con `fetchFn` simulado:
  - repite mientras `quedan` y para en 10;
  - un 401 en PROD no impide STAGING;
  - un timeout se anota y sigue;
  - envía la cabecera `X-Vigilancia` con el secreto de cada destino;
  - nunca más de 20 llamadas;
  - `fetch()` devuelve 404.
- `scripts/workflows.test.ts`:
  - `avisos.yml` no tiene `schedule`;
  - `deploy-staging.yml` despliega el Worker;
  - `wrangler.toml` tiene el cron `*/5 * * * *`.
- Integración en `ci-sql`:
  - arranca el Worker en local con `npx wrangler dev --test-scheduled --config workers/avisos/wrangler.toml`,
    con `DESTINOS` apuntando al `wrangler pages dev` de :8788 y el secreto local;
  - lanza `curl "http://127.0.0.1:8787/__scheduled?cron=*/5+*+*+*+*"`;
  - con una notificación pendiente en la base local (VAPID de prueba), queda `enviada_en` o `error`
    anotado, y no pendiente.
- `tsconfig`: añade `workers/**` al typecheck (`tsc -b`) y a ESLint.

### RV-53 · Una promoción fallida publica nombres de voluntarios en los logs de Actions · P0

**Problema.**

- Si falla, `promover-piloto.ts:289-290` imprime el error completo de psql.
- En una violación de `check` o `not null`, Postgres añade `DETAIL: Failing row contains (…)`, con
  `autor_nombre`, `autor_apellido` y `revisada_por` de la fila.
- `promover-piloto.yml` corre en Actions de un repositorio público. Lo mismo vale para cualquier
  script que imprima errores de psql en CI: `migrar.ts` con una migración de datos, `restaurar.ts`,
  `purgar-fotos.ts`.

**Solución.**

1. **`scripts/lib/comun.ts`:**
   - `psql()` añade `-v VERBOSITY=terse` **siempre que `process.env.CI` esté definido**, y además
     cuando se pase `{ terse: true }`.
   - Función nueva `errorSeguro(texto)`: quita las líneas `DETAIL:`, `CONTEXT:` y `QUERY:` y
     cualquier `Failing row contains (…)`, y deja el SQLSTATE y el mensaje principal.
   - Todos los `abortar(…r.error…)` de los scripts que corren en Actions pasan por `errorSeguro`.
     Búscalos con `rg "r\.error|\.error \|\|" scripts`.
2. **`promover-piloto.ts`:** en local sigue imprimiendo el error completo solo si se pasa
   `--detalle`. Con `CI`, nunca.

**Tests:**

- `comun.test.ts`:
  - `errorSeguro` quita un `DETAIL: Failing row contains (…, Ana, Pérez, …)` real de Postgres y
    deja el mensaje principal;
  - con `CI=1`, `psql()` lleva `VERBOSITY=terse`.
- `promover-piloto.test.ts`: un fallo simulado con `DETAIL` no escribe nombres en stdout ni stderr.
- `scripts/docs.test.ts` o uno nuevo: ningún `abortar(` de `scripts/*.ts` que corra en un workflow
  concatena un error de psql sin `errorSeguro`, comprobado con un regex.

### RV-54 · "Cercanos" puede poner primero un punto más lejano · P0

**Problema.** El comparador de `src/lib/incidente.ts:51-55` no es transitivo:

- A, a 0 m y radio 5;
- B, a 9 m y radio 9;
- C, a 18 m y radio 11.

Con esos tres, el resultado depende del orden de entrada (`C B A` o `A C B`). También el aviso "el
más cercano no funciona" se compara contra ese primero equivocado.

**Solución.**

1. Ordena **solo por distancia**.
2. Después, **una pasada** de desempate entre vecinos: recorre de izquierda a derecha y, si el
   siguiente está a menos de `EMPATE_M` del **actual** y tiene mayor `radio_px`, intercámbialos una
   sola vez y avanza dos posiciones.
   - Así un punto nunca adelanta a otro que está más de 10 m más cerca.
   - El resultado es determinista.
3. `masCercanoQueNoFunciona` se compara con la **distancia mínima** de los candidatos, no con el
   primero de la lista.

**Tests** (`incidente.test.ts`):

- `el resultado no depende del orden de entrada`: el caso A/B/C con las 6 permutaciones da siempre
  la misma lista, con A o B primero y C nunca primero.
- `ningún candidato adelanta a otro más de 10 m más cercano`: 1.000 casos aleatorios con semilla
  fija.
- `el aviso usa la distancia mínima`.
- Los tests existentes siguen en verde.

### RV-55 · Una restauración que falla tras la primera transacción deja credenciales viejas · P0

**Problema.**

- En `restaurar.ts:306-330`, el volcado hace `commit` y después, **fuera** de esa transacción, se
  ejecutan en este orden: las migraciones, las secuencias y la reposición del acceso.
- Si falla una migración o el `setval`, el script aborta. Vuelven a valer el código viejo, los
  móviles revocados y los administradores dados de baja, y los códigos pueden repetirse.
- La foto del acceso actual solo está en memoria, así que repetir la restauración no lo arregla.
- El mensaje de `:320-321` ("el esquema no existía") también sale cuando lo que falló fue la lectura.

**Solución.**

1. Mete `sqlSecuenciasAlMenos(previas…)` y `sqlReponerAcceso(acceso)` **dentro** de
   `sqlRestauracion`, después del volcado y de `EPOCA_NUEVA` y antes de `commit`. Solo usan columnas
   de `0001` (`docs/18` RV-35), así que valen con cualquier volcado.
2. **Después** de migrar, vuelve a ejecutar `sqlSecuenciasAlMenos`, que es idempotente, por si una
   migración cambió algo, y una **comprobación**:
   - el hash del código es el de antes;
   - los tokens revocados siguen revocados;
   - los administradores tienen el mismo `activo`.

   Si no coincide, `abortar` con el texto de las tres acciones manuales: código nuevo con "Revocar
   todos los dispositivos", revisar Administradores y avisar al grupo.
3. Envuelve **todo** lo que va tras el `commit` en `try/finally`. Si algo falla, el último mensaje
   siempre es ese texto de acciones manuales.
4. Distingue "no había esquema" de "no se pudo leer el acceso": en el segundo caso, **aborta antes
   de restaurar**.
5. **Señales:** con `process.on('SIGINT' | 'SIGTERM')`, borra el directorio temporal del volcado
   (`docs/18` RV-37) y sale con 130.

**Tests:**

- `restaurar.test.ts`:
  - `sqlRestauracion` contiene la reposición del acceso y las secuencias antes de `commit`;
  - si falla la lectura del acceso, aborta sin restaurar.
- `scripts/probar-restauracion.ts`, escenario nuevo:
  1. `MIGRACIONES_DIR` apunta a una copia de `supabase/migrations` con una migración `9999_falla.sql`
     que hace `select 1/0`. Añade esa variable a `migrar.ts`, **solo** con `--entorno local`.
  2. Restaura: el script termina con error y el texto de acciones manuales.
  3. Aun así, el código viejo **no** vale, el administrador dado de baja sigue inactivo y la
     siguiente alta no repite código.

  Sobre `develop` falla.

### RV-56 · La vigilancia puede cerrar su alarma sin haber comprobado nada · P0

**Problema.**

- En `vigilancia.yml:176-186`, con `if: always()`, si "Comprobar" no llega a escribir `hay`,
  `HAY` queda vacío y el paso cierra la issue abierta con "todo responde". Pasa con un timeout, un
  `preparar` roto o un `npm ci` que falla.
- Una lista de tareas de pg_cron vacía (`[]`) tampoco es problema, cuando debería serlo, por ejemplo
  tras restaurar en un proyecto nuevo.

**Solución.**

- El paso de la issue:
  - abre o comenta si `HAY != 'no'`, con el texto "la vigilancia no terminó" cuando `HAY` está
    vacío;
  - solo cierra con `HAY == 'no'`.
- "Comprobar" no depende de `npm ci`: el job usa `preparar` con una entrada nueva, `npm: 'false'`,
  que solo instala psql. Solo necesita bash, psql, gh y jq.
- La comprobación de tareas exige la lista esperada de nombres `hidrantes_*`, sacada de las
  migraciones con `rg "cron.schedule\('(hidrantes_[a-z_]+)'"`.
  - Genérala en `scripts/sql/tareas-esperadas.txt` con un script.
  - Un test comprueba que está al día.
  - Falta una tarea, o sale `[]`: es un problema.

**Tests:**

- `workflows.test.ts`:
  - la issue solo se cierra con `HAY` igual a `no`;
  - "Comprobar" no ejecuta `npm ci`.
- `tareas-esperadas.test.ts`: la lista coincide con las migraciones.
- `ci-sql`: con una tarea borrada (`cron.unschedule`) la consulta la marca como problema.

### RV-57 · Jefatura pierde `?incidente=`, `?p=` y `?aqui=` al recargar · P0

**Problema.**

- `limpiarDireccion()` (`src/lib/acceso.ts:86-88`) borra **todos** los parámetros siempre que hay
  sesión de Google.
- Se ejecuta al arrancar y en cada reintento de FR-168, y lo hace con `history.replaceState` a
  espaldas de React Router.

**Solución.**

- Quita solo los parámetros de la vuelta de OAuth: `code`, `state`, `error`, `error_code` y
  `error_description`.
- Hazlo solo si alguno está presente, conservando el resto y el `hash`.
- Hazlo **una sola vez**, al arrancar (bandera de módulo), y no en cada `comprobarAcceso`.

**Tests:**

- `acceso.test.ts`:
  - `?incidente=…&code=x` → `?incidente=…`;
  - `?p=…` sin `code` no cambia;
  - una segunda llamada no hace nada.
- E2e `degradacion.spec.ts` o `incidente.spec.ts`: jefatura (`conGoogle`) recarga `/?incidente=…` y
  el modo incidente sigue abierto. Sobre `develop` falla.

### RV-58 · Sin cobertura, una capa en línea deja el mapa sin fondo · P0

**Problema.**

- Si el voluntario tenía elegida la capa de calle (OSM) o el satélite (PNOA), al perder la
  cobertura el mapa se queda en blanco con los marcadores y un aviso
  (`src/componentes/mapa/capas-leaflet.ts:21-22`).
- En una emergencia sin señal, eso deja sin calles.

**Solución.**

- Mientras `conexion !== 'bien'` y la capa elegida es solo en línea, se pinta **debajo** el mapa
  base propio, si está descargado. Encima va la capa en línea, que mostrará lo que tenga en caché
  del navegador o nada.
- El aviso pasa a ser "Sin cobertura: se ve el mapa base propio en lugar de «Calle»" (texto nuevo).
- La elección del usuario no se cambia: al volver la cobertura, todo queda como estaba.
- Catastro ya pinta el base debajo; generaliza ese mecanismo.
- FR-63 no cambia de sentido. Añade la frase a 01 v1.4, pendiente de jefatura como las de v1.3, y
  cita DEC-098.

**Tests:**

- `capas.test.ts`: con capa `osm` y sin conexión, las capas que se pintan son `base` + `osm`; con
  conexión, solo `osm`.
- E2e `degradacion.spec.ts`:
  1. Elige "Calle".
  2. Pasa a offline con `setOffline(true)` y con las teselas de OSM abortadas con `route`.
  3. Hay teselas del mapa base en el DOM (`canvas` de protomaps) y el aviso nuevo se ve.

  Sobre `develop` no hay mapa base, así que falla.

### RV-59 · "Cercanos" con GPS: precisión invisible, posición vieja mal avisada y "Sin posición" mientras busca · P0

**Problema** (confirmado en capturas de Pixel 7):

- Una posición de ±800 m (wifi o antena) se usa igual que una de ±8 m, y no se enseña.
- El aviso de "posición vieja" (`Mapa.tsx:443`) mira la posición GPS **actual**, no la que se usó
  como origen. Tras recargar no aparece.
- Con el GPS en frío salen a la vez "Buscando tu posición…" y "Sin posición: mantén pulsado…". Se
  enfoca el buscador, y el teclado tapa la explicación.
- El aviso "Buscando tu posición…" se monta sobre el botón de capas.

**Solución.**

1. **Origen con metadatos en la URL:** `?incidente=lat,lng&gps=<momento_ms>,<precision_m>`. Solo se
   añade cuando el origen es el GPS. La cabecera se calcula con eso:
   - "Desde tu posición · ±12 m · hace 2 min" (textos nuevos);
   - con precisión > 50 m, aviso "Posición poco precisa (±N m): si sabes dónde es, mantén pulsado el
     mapa" con el botón "Marcar en el mapa", que cierra la hoja y deja el mapa listo para la
     pulsación larga;
   - con más de 60 s de antigüedad, "posición de hace N min", comparando con el momento de la URL.
2. **GPS en frío:**
   - Si `estadoPos.tipo === 'buscando'`, la hoja dice "Buscando tu posición… (puedes marcar el
     incidente en el mapa)", **sin** enfocar el buscador.
   - En cuanto llega el primer fix, abre el incidente con ese origen sin otro toque.
   - "Sin posición" solo sale con `denegada` o `no_disponible`, y **entonces** se enfoca el
     buscador.
3. **Disposición:** los avisos flotantes del mapa no tapan los controles.
   - Colócalos debajo del buscador con un ancho que deje libre la columna de botones (`right` igual
     al ancho de la columna más 8 px).
   - O apílalos en la columna. Mide con `boundingBox` en el test.

**Tests:**

- E2e `incidente.spec.ts`:
  - `precisión de 800 m avisa y ofrece marcar en el mapa`;
  - `tras recargar con gps=…&momento de hace 5 min se ve "hace 5 min"`, con `page.clock`;
  - `GPS en frío: primero "Buscando…", sin foco en el buscador; al llegar el fix, sale la lista sola`;
  - `denegado: "Sin posición" y foco en el buscador`.
- `accesibilidad.spec.ts`: ningún aviso flotante se solapa con un botón del mapa (intersección de
  cajas igual a 0), en móvil y en tableta.

---

## 3. Bloque B · Errores P1

### RV-60 · En tableta y ordenador, "Cercanos" tapa la ficha y a los candidatos · P1

**Problema.** El panel mide 360 px, va arriba a la izquierda y tiene el mismo `z-index` que la
ficha (`right-16`, 360 px). A 900 px se solapan unos 212 px. El `fitBounds` del incidente
(`MapaLeaflet.tsx:321`) solo deja 56 px a la izquierda.

**Solución.**

- **Desde 900 px (FR-70):** "Cercanos" ocupa la **columna lateral** en lugar de la lista mientras el
  incidente está abierto, con un botón "Volver a la lista". Así no flota sobre el plano.
- **Entre 600 y 900 px:** hoja inferior como en el móvil.
- `fitBounds` recibe el relleno real de lo que tapa el mapa: `paddingTopLeft` según la columna o la
  hoja, y `paddingBottomRight` según la ficha abierta.

**Tests:** `anchos.spec.ts`, a 768, 1024 y 1280 px con incidente y ficha abiertos:

- las cajas de "Cercanos" y de la ficha no se cortan;
- el marcador del incidente y los tres primeros candidatos quedan dentro de la zona visible del
  mapa, sin cruzarse con la caja de ningún panel.

### RV-61 · En el móvil, "Cercanos" solo enseña un candidato sin desplazarse · P1

**Problema.** En Pixel 7, con el aviso "el más cercano no funciona" presente, solo se ve una fila.
Cada fila tiene dos botones anchos (unos 110 px) y la hoja llega al 40 % de la altura.

**Solución.**

- **Fila compacta:**
  - primera línea: marcador, `código · tipo diámetro · estado`;
  - segunda línea: `80 m · N · ≥ 4 tramos · revisado hace 3 meses` (se añade la última revisión,
    que antes faltaba);
  - a la derecha, dos **botones de icono** de 44 × 44 px ("Cómo llegar" y "Medir tendido"), con
    `aria-label` y 8 px de separación (UI-13, TR-113).
- **Hoja:**
  - con asa y dos alturas, 55 % por defecto y 90 % arrastrando;
  - la altura se recuerda en `sessionStorage`;
  - el aviso "el más cercano no funciona" pasa a una línea dentro de la cabecera.
- **Objetivo:** con el aviso presente, **tres** candidatos visibles sin desplazarse en Pixel 7.

**Tests:**

- E2e `incidente.spec.ts` (proyecto móvil): la caja de la tercera fila termina por encima de la
  barra de navegación.
- `accesibilidad.spec.ts`: los botones de icono miden ≥ 44 px y tienen nombre accesible.
- `controles.spec.ts`: los incluye.

### RV-62 · Atrás, lista y tramo de jefatura: cabos sueltos del modo incidente · P1 · un PR

1. **Atrás dos veces.** Estando en `?incidente`, tocar una fila abre la ficha (push). Al cerrarla con
   la X (`Mapa.tsx:144-147`, replace) quedan dos entradas iguales. Solución: al cerrar una ficha
   abierta desde "Cercanos", `navigate(-1)` si la entrada anterior es ese mismo incidente
   (`location.state.desdeIncidente`). E2e: cerrar la ficha con la X y pulsar atrás **una** vez cierra
   el incidente.
2. **La lista dice "desde ti" mientras ordena desde el incidente** (`ListaPuntos.tsx:160`). En
   escritorio, además, conserva el origen del incidente tras cerrarlo, y `incidenteRecordado()` se
   lee antes de que el efecto lo escriba. Solución:
   - el origen de la lista sale de la URL (`?incidente`) por el mismo hook que usa el mapa, no de un
     valor recordado;
   - la columna dice "desde el incidente" o "desde ti".

   Test de componente y e2e en escritorio.
3. **El tramo de manguera de jefatura.** `cargarTramoJefatura` solo se ejecuta al abrir un incidente
   y no vuelve a pintar. Medir nunca lo carga. Solución: cárgalo al pasar a `jefatura` en
   `comprobarAcceso` y publícalo en el mismo almacén que la config del voluntario, para que se
   vuelva a pintar. Test: jefatura con `metros_tramo_manguera = 25` ve "≥ 4 tramos" para 80 m en el
   primer incidente y en la medición.
4. **Tras elegir un resultado de búsqueda, cerrar `?aqui` vuelve a enseñar "Sin posición".** Hay que
   reiniciar `sinPosicion` al elegir cualquier resultado. Test e2e.
5. **La vista del mapa guardada en `localStorage` tras encuadrar un incidente** guarda dónde fue,
   más allá de la sesión (11 §6.1). Solución: no guardar la vista mientras `?incidente`, `?aqui` o
   `?medir` estén activos. Test unitario del guardado.

### RV-63 · `/api/geocodificar`: fallos parciales, 401 mal explicado y caché sin comprobar · P1

1. **Un `find` que falla tira todo** (`functions/api/geocodificar.ts:112`). Solución: `try/catch`
   por candidato, `continue`, y 503 solo si **no** queda ningún resultado. Test.
2. **Un 401 enseña "Los números de portal necesitan cobertura".** Solución: con 401, "Vuelve a
   entrar con el código para buscar números de portal", y la calle sin conexión igualmente. E2e con
   la Function simulada en 401.
3. **La caché de `caches.default` puede no funcionar en `*.pages.dev`.** Solución:
   - la Function añade `x-hidrantes-cache: hit|miss` a la respuesta;
   - `comprobar-despliegue` (staging) hace dos peticiones iguales con el token de vigilancia, si la
     Function lo acepta; si no, con un token de dispositivo de CI creado por `arranque` y revocable;
   - espera `hit` en la segunda. Si no llega, anótalo en DEC-092 y documenta que la protección real
     es el tope por token del punto 4.

   Haz lo mismo en `/api/direccion`.
4. **Sin límite por token.** Solución: en la propia Function, un contador en memoria del aislado
   limita cada token a 30 búsquedas por minuto. No es global, pero frena un bucle de cliente. Por
   encima, `429 DEMASIADOS_INTENTOS`. Test.

### RV-64 · Restaurar con un psql anterior a 17.6 · P1

**Problema.** `pg_dump` 17.6 o posterior escribe `\restrict` y `\unrestrict` en los volcados en
texto plano. Un psql local más antiguo los rechaza y `ON_ERROR_STOP` aborta. CI usa el psql más
reciente y no lo ve.

**Solución.** `restaurar.ts`:

- lee `psql --version`;
- si es menor que la versión que escribió el volcado (cabecera `-- Dumped by pg_dump version X`) o
  menor que 17.6 con un volcado que contiene `\restrict`, aborta con la instrucción de instalar
  psql 17.6 o posterior;
- documéntalo en 15 §5.3.

**Tests** (`restaurar.test.ts`):

- versión 16.4 con `\restrict` → aborta con el texto;
- 17.6 → sigue.

### RV-65 · La lectura completa de jefatura puede saltarse un punto · P1

**Problema.** Por encima de 1.000 puntos, la paginación por desplazamiento (`src/lib/puntos.ts:238-250`)
se salta una fila si alguien retira un punto entre dos páginas.

**Solución.** Paginación por clave: `.order('codigo').gt('codigo', ultimo).limit(1000)` hasta que
llegue una página corta.

**Test** (`puntos.test.ts`): el cliente simulado quita una fila entre la página 1 y la 2, y no se
pierde ningún punto que siga activo.

### RV-66 · La promoción del piloto puede reutilizar códigos · P1

**Problema.** `promover-piloto.ts:~101-106` fija las secuencias de producción con el mayor código
**activo** promovido. Los códigos de puntos del piloto retirados en staging por encima de ese valor
se vuelven a dar.

**Solución.** Lee `last_value` de las dos secuencias de **staging** y úsalo como mínimo en
`sqlSecuenciasAlMenos` (`docs/18` RV-34).

**Test:** el guion lleva `greatest(…, <last_value de staging>)`.

### RV-67 · La medición: la etiqueta se lee mal sobre la línea · P1

**Problema** (captura de Pixel 7): "59 m" va centrado sobre la línea y la línea lo tacha.

**Solución.**

- La etiqueta se desplaza 14 px en perpendicular al tramo.
- Lleva un fondo `--papel` con 85 % de opacidad, radio 4 y `font-datos`.
- En oscuro, el equivalente de 06 §2.4.
- Añádelo a 06 §4.7.

**Test:** e2e con `boundingBox`: la caja de la etiqueta no corta la línea del tramo, comprobado con
la distancia del centro de la caja a la recta.

---

## 4. Bloque C · P2

### RV-68 · Defensas pequeñas · P2 · un PR

1. **Mapa base descargado sin validar** (`src/lib/mapabase.ts:88`). Antes de guardar, comprueba que
   los 7 primeros bytes son `PMTiles`, la versión 3 del encabezado y que el tamaño está a ±1 % de
   `BYTES_MAPABASE`. Si no, `fallo: true` y no se guarda. Test.
2. **Suscripciones push a cualquier host `https://`** (`0005:539`). En una migración, la validación
   de `fn_guardar_suscripcion_push` y de `_admin` admite solo `fcm.googleapis.com`,
   `*.push.services.mozilla.com`, `web.push.apple.com`, `*.push.apple.com` y
   `*.notify.windows.com`. Test pgTAP con uno válido y otro inventado.
3. **Purga de fotos con un número redondo.** El aviso de "múltiplo de 1.000" (`purgar-fotos.ts:59`)
   solo se aplica si falta `total`. Con `total === fotos.length` ya está comprobado. Test.
4. **Novedades.** El filtro de rutas y códigos se aplica **antes** del corte a 140 caracteres. Test.
5. **`comprobar-auth.ts`** informa también de `security_manual_linking_enabled`. Si está activo, lo
   señala como riesgo para RV-36 en la issue. Test con respuesta simulada.

### RV-69 · El intérprete de coordenadas: formatos que se usan en campo · P2

`coordenadas.interpretar` debe aceptar también:

| Entrada | Nota |
|---|---|
| `37,2305, -3,656` | coma decimal y coma de separación, si hay espacio tras la coma separadora |
| `37°13.830'N 3°39.360'W` | grados y minutos decimales, que usan GPS de mano y bomberos |
| `…/maps/search/37.2305,+-3.656` | Google `search` con `+` |
| `Mi ubicación: 37.2305, -3.656` | texto delante |
| `37.2305 3.656` (longitud sin signo) | si al invertir el signo cae dentro de la zona, se usa la negativa y se avisa "Se ha tomado 3.656 como Oeste" (texto nuevo) |

**Tests** (`coordenadas.test.ts`):

- cada fila de la tabla;
- `Calle Real 12` y `HID-0012` siguen dando `null`.

---

## 5. Aviso de Supabase del 30 de octubre (grants de tablas nuevas en `public`)

**No afecta a esta aplicación. Solo hay que dejarlo escrito y protegido con un test.**

**Por qué no afecta:**

- Todas las tablas de la app están en el esquema `hidrantes`, no en `public` (CLAUDE.md §3).
- Sus permisos son explícitos (`0003_permisos.sql`: `revoke` de todo y `grant` a medida), así que
  no dependen de los grants automáticos que Supabase deja de dar.
- La app solo **lee** una tabla de `public`, `public.app_users` (`src/lib/panel/ajustes.ts:77`).
  Ya existe y conserva sus grants.
- Las migraciones de la app no usan `supabase db reset`: van por `migrar.ts` sobre `supabase start`.

**Lo que hay que hacer (RV-70, P2, un PR pequeño):**

1. **04 §5:** "Desde el 30 oct 2026 Supabase no concede acceso a la Data API a tablas nuevas de
   `public`. No nos afecta: `hidrantes` tiene permisos explícitos. Toda tabla nueva de `hidrantes`
   lleva en su migración los `grant` que necesite (05 §5)." Añade la línea al checklist de la
   plantilla de PR.
2. **pgTAP en `02_permisos.test.sql`:** cada tabla de `hidrantes` tiene, para `service_role`, los
   privilegios que 05 §5 le asigna. Si mañana se crea una tabla sin sus `grant`, el test falla en CI
   antes de llegar a producción.

**A quien sí puede afectar:** a la **app de uniformidad**, que usa el esquema `public` del mismo
proyecto. Sus tablas actuales siguen igual. Cualquier tabla nueva que cree desde el 30 de octubre
necesita los `grant` en su propia migración. No toques ese repositorio (CLAUDE.md §6): menciónalo al
desarrollador en el resumen del bloque P para que avise a quien lo mantenga.

---

## 6. Fuera de alcance: requiere decisión

| Tema | Nota |
|---|---|
| Abrir producción a los voluntarios | F9.10 (#85), tras #76 y #77. Este documento solo pone producción al día (DEC-096). |
| Despachar avisos también desde la base (`pg_net`) | Descartado en DEC-097; se revisa solo si el Worker falla en la práctica |
| Los pendientes de `docs/17` §12 y `docs/18` §5 | Siguen igual |

---

## 7. Checklist final

- [ ] **Bloque P**, hecho tras cerrar P, A y B:
  - [ ] `npm run comprobar-produccion` sale 0;
  - [ ] `main` tiene el mismo árbol que `develop`;
  - [ ] el paso de paridad de `deploy-prod.yml` está en verde;
  - [ ] el registro `paridad-produccion.md` tiene fecha y commit.
- [ ] **El Worker `hidrantes-avisos`:**
  - [ ] desplegado, con su cron `*/5`;
  - [ ] con un aviso real entregado en staging (anota la hora);
  - [ ] `avisos.yml` sin `schedule`.
- [ ] Cada RV de A y B con su issue cerrada, su PR fusionado y el test de regresión que falló antes
      del arreglo.
- [ ] `npm run typecheck && npm run lint && npm run formato:comprobar && npm test && npm run build && npm run presupuesto`
      en verde, incluido `workers/`.
- [ ] `npm run e2e` en verde, y en verde con `--repeat-each=3 --workers=4`.
- [ ] `ci-sql` en verde: la restauración con una migración que falla (RV-55) y el cron local del
      Worker (RV-52).
- [ ] 04, 05, 06, 12 (DEC-096 a DEC-098), 15, CLAUDE.md §5 y la issue #79 al día.
- [ ] Nada de nombres, correos ni secretos en issues, PR, commits ni logs de Actions (DEC-053,
      RV-53).
