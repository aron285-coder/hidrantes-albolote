# 31 · Revisión completa: producción protegida, copias fuera de GitHub, release y defectos (oct 2026)

| | |
|---|---|
| **Para** | Claude Code, en este repositorio. **Cuatro sesiones** (Ops, Backend, Frontend-campo, Frontend-panel), en tres oleadas (la tercera, Ops sola: comprobar en staging y publicar). Cada sesión puede usar subagentes en worktrees (máx. 3) donde lo indica §0.3. |
| **Base** | `develop` en `8e1d567` (docs/30 hecho). |
| **Origen** | Revisión completa del 7 oct 2026 (código, base de datos, CI y documentación). Typecheck, lint, 2.333 tests, build y `npm audit` en verde. No hay nada bloqueante en la app; lo más serio está en cómo se protege producción. |
| **Requisitos** | No cambia ningún FR. Se añaden límites (longitud de textos, propuestas al día) que `docs/05` y `docs/11` tienen que recoger. |
| **Producción** | §2 (Ops) va **antes** de la release 0.9.0. El resto va en 0.9.0 si llega a tiempo, o en la siguiente. La release y su aprobación las hacen las sesiones (RV-135, RV-139c, DEC-176). |
| **El desarrollador** | **No hace nada.** Todo lo que antes era "lo hace el desarrollador" lo hacen las sesiones, con las sesiones de `gh` y `wrangler` que ya hay en este PC (`arranque.ts` las usa). §1 explica cómo. |

## 0. Reparto

### 0.1 Sesiones, oleadas y puntos

| Oleada | Sesión | Puntos | DEC | `PW_PUERTO` |
|---|---|---|---|---|
| 1 | **Ops** | RV-130 a RV-139 (seguridad de CI, copias, release, scripts, vigilancia, documentación) | DEC-172, DEC-173 | — |
| 1 | **Backend** | RV-140 a RV-149 (migraciones 0039 y 0040, Pages Functions, pgTAP) | DEC-174, DEC-175 | 4190 |
| 1 | **Frontend-panel** | RV-160 a RV-169 (no dependen de Backend) | — | 4192 |
| 1 | **Frontend-campo** | RV-150 a RV-157 (no dependen de Backend) | — | 4191 |
| 2 | **Frontend-campo** | RV-158 (cerrar sesión revoca el token) y RV-159 (reintento con id nuevo), que esperan a 0040 y a RV-143 | — | 4191 |
| 3 | **Ops** | RV-139b (comprobación en staging que sustituye a las pruebas a mano) y RV-139c (release 0.9.0 y aprobación), cuando todo lo demás esté en `develop` | DEC-176 | 4193 |

### 0.2 Archivos y dueños

| Archivo | Dueño |
|---|---|
| `.github/**` (incluidos `traspaso.yml` y `despachador.yml`), `scripts/restaurar.ts`, `scripts/guarda-produccion.ts`, `scripts/purgar-fotos.ts`, `scripts/arranque.ts`, `scripts/traspasar-secreto.ts`, `scripts/publicar.ts`, `scripts/descargar-respaldo.ts`, `.github/scripts/*`, `dependabot.yml`, `workers/respaldos/**` | Ops |
| `docs/04`, `09`, `13`, `14`, `15`, `entornos.md`, `INDICE.md`, `CLAUDE.md`, `verificacion/paridad-produccion.md`, `docs/01` (solo la línea de conformidad, DEC-177) | Ops |
| `supabase/migrations/0039_*.sql`, `0040_*.sql`, `supabase/tests/*` | Backend |
| `functions/**` (`verificar-codigo`, `push`, `_lib/webpush`, `lanzar-workflow`) | Backend |
| `docs/05` y `docs/11` | Backend |
| `src/` salvo `src/componentes/panel/**`, `src/lib/panel/**`, `src/paginas/PanelJefatura.tsx`; `public/racores/**` | Frontend-campo |
| `public/sw-push.js` | Frontend-campo |
| `src/componentes/panel/**`, `src/lib/panel/**`, `src/paginas/PanelJefatura.tsx` | Frontend-panel |
| `src/lib/textos.ts` | Cada sesión, su bloque. Rebasar justo antes de fusionar. |
| `docs/06` | Frontend-panel. Frontend-campo le pasa sus cambios por la issue de coordinación. |
| `docs/12` (DEC-172 a DEC-175) | Ops. Los demás le pasan el texto. |

### 0.3 Dentro de cada sesión (subagentes)

- **Ops:** tres subagentes en paralelo:
  - (a) secretos y CI: RV-130, RV-131 y RV-132, con el traspaso de clave efímera de §1;
  - (b) copias y restauración: RV-133 (bucket y Worker de solo escritura) y RV-134;
  - (c) documentación y manuales: RV-139.
  - La sesión principal hace RV-135 a RV-138, que tocan los mismos workflows de deploy.
  - **Oleada 3**, la sesión principal sola: RV-139b y después RV-139c. No hay paralelismo: cada paso espera al anterior.
- **Backend:**
  - **0039 y 0040 van en serie:** misma secuencia de números, y 0040 usa una función que añade 0039.
  - Un subagente hace las Pages Functions (RV-143, RV-144, RV-146), que no tocan SQL.
  - Otro hace los pgTAP de permisos (RV-149).
- **Frontend-campo:** un subagente para RV-150 a RV-152 (mapa y formulario) y otro para RV-153 a RV-157 (sesión, cola y accesibilidad).
- **Frontend-panel:** un subagente para RV-160 a RV-163 (Cola y Dialogo) y otro para RV-164 a RV-169 (Inventario, Registro, Ajustes y exportar).

**Herramientas, como siempre:**

- las skills `paquete-rv`, `nueva-migracion` (Backend) y `revisar-pantallas` (Frontend);
- `pr-review-toolkit`, `code-review` y, en Ops y Backend, `security-guidance`, antes de fusionar.

**Un test que falla antes del arreglo**, en cada punto que tenga código.

**Registro:** `docs/verificacion/revision-completa.md`, con una sección por sesión.

**Coordinación:** una issue "docs/31 · coordinación", donde cada sesión anota lo que pasa a otra.

---

## 1. Nada a mano: cómo lo hacen las sesiones

El desarrollador no tiene que hacer nada. Lo que antes eran pasos "en GitHub, Cloudflare o Supabase" lo hacen las sesiones con lo que ya hay en este PC: la sesión de `gh` (propietario del repositorio) y la de `wrangler` (cuenta de Cloudflare), las mismas que usa `scripts/arranque.ts`.

**Reglas para todas las sesiones:**

1. **Ningún secreto se ve nunca.** Ni en el chat, ni en un log, ni en un commit, ni en un archivo del repositorio.
   - Los valores pasan siempre por tubería (`gh secret set … < archivo-temporal`) desde un archivo temporal fuera del repositorio, que se borra en el mismo paso.
2. **Mover un secreto cuyo valor no se conoce** (los de GitHub no se pueden leer): **traspaso con clave efímera**, `scripts/traspasar-secreto.ts`, que escribe Ops en RV-131.
   1. La sesión genera en local un par de claves `age` de un solo uso.
   2. Lanza un workflow de un solo uso (`traspaso.yml`, `workflow_dispatch`, en el environment que tiene el secreto) que cifra el valor con la clave pública y saca **solo el texto cifrado** como artifact de 1 día.
   3. En local: descarga el artifact, descifra, `gh secret set` en el destino.
   4. Al acabar: borra la clave privada, el artifact y la ejecución (`gh api -X DELETE …/runs/{id}`).
   - **Test:** el workflow nunca hace `echo` del valor; un test de `scripts/` comprueba que `traspaso.yml` no tiene ningún `run:` que imprima `secrets.*`.
3. **Si una sesión de `gh` o de `wrangler` ha caducado**, es lo único que no se puede hacer solo: la sesión lo dice en una línea ("hace falta `npx wrangler login`") y sigue con lo demás. No se intenta entrar con contraseñas.
4. **Cada paso se anota** en `docs/verificacion/revision-completa.md`, sin valores.

| Antes (lo hacía el desarrollador) | Ahora |
|---|---|
| D1 · tokens de Cloudflare por proyecto | **No existe** ese permiso: el permiso de Pages de Cloudflare es de toda la cuenta, no por proyecto. Se cambia por una **vigilancia** que detecta cualquier despliegue de producción que no venga de `deploy-prod` (RV-130). |
| D2 · environment `prod-tareas` y mover los secretos | La sesión de Ops crea el environment con `gh api` y mueve los secretos con el traspaso de clave efímera (RV-131). |
| D3 · bucket R2 y su token | La sesión crea el bucket con `wrangler` y despliega un Worker de **solo escritura** con su binding. No hace falta ningún token de R2 (RV-133). |
| D4 · reducir `GITHUB_DISPATCH_TOKEN` | Desaparece: el panel ya no lanza workflows con un token; deja un pedido en la base de datos y un workflow programado lo recoge (RV-146). El secreto se borra de los dos proyectos de Pages. |
| D5 · release y aprobación de producción | Lo hacen las sesiones (RV-135 y RV-139c), con una puerta automática en lugar de la humana (DEC-176). |

---

## 2. Ops (oleada 1)

### RV-130 · Cualquier despliegue de producción que no venga de `deploy-prod` se detecta · P0 · subagente (a)

**Qué pasa.** El token de Cloudflare es el mismo en `staging` y `production` (`comprobar-produccion.yml:3-5`, `vigilancia.yml:31-33`). `deploy-staging.yml:66-70`, que corre en cada fusión a `develop` sin aprobación, tiene un token que podría desplegar el proyecto de Pages de producción.

**Por qué no se separa el token:** en Cloudflare el permiso "Pages: Edit" es de toda la cuenta; no se puede limitar a un proyecto. La sesión lo comprueba en la documentación de Cloudflare y lo anota en `entornos.md` con el enlace. Separar de verdad exigiría otra cuenta de Cloudflare, que no compensa.

**Qué se hace.**

1. **Detección:** `vigilancia.yml`, dos veces al día:
   - lista los despliegues de producción del proyecto de Pages (API de Cloudflare, con el token de solo lectura del job);
   - cada despliegue tiene que corresponder a una ejecución correcta de `deploy-prod.yml` con el mismo commit;
   - si alguno no corresponde: issue "despliegue de producción no autorizado", con el id del despliegue, y una notificación push a jefatura.
2. **Reversión:** el mismo paso, con `--revertir`, vuelve a promover el último despliegue bueno (`wrangler pages deployment …`). Por defecto **no** revierte solo: abre la issue. Que revierta solo es una opción en `config` (`revertir_despliegue_ajeno`), apagada.
3. **El job de staging:** `deploy-staging.yml` despliega con `--project-name` fijo de staging, y un test de workflows falla si un job del environment `staging` nombra el proyecto de producción.
4. **Variable `ENTORNO`** (`staging` | `produccion`) en los dos proyectos de Pages, que la ponen los `deploy-*.yml` (la usa RV-146), y `VITE_ENTORNO` en el build (la usa RV-167).
5. **Tests:** la comprobación de vigilancia con una lista simulada de despliegues: uno de `deploy-prod` pasa, uno sin ejecución correspondiente abre la issue.

### RV-131 · Las tareas de producción sin secretos al alcance de cualquier rama · P0 · subagente (a)

**Qué pasa.** `respaldo.yml:44-45`, `purgar-fotos.yml:69-72`, `vigilancia.yml:131` y `comprobar-produccion.yml:30` leen `SUPABASE_DB_URL_PROD` (dueño del esquema) y `SUPABASE_SERVICE_ROLE_KEY_PROD` del **repositorio**. Cualquier workflow de cualquier rama que llegue a `origin` puede leerlos, sin aprobación, incluidas las ramas de las sesiones de Claude Code.

**Qué se hace (DEC-172). Todo con `gh`, sin pasos a mano.**

1. **Crear el environment `prod-tareas`** con `gh api -X PUT repos/…/environments/prod-tareas`, sin revisores, y política de ramas **solo `develop`** (`deployment-branch-policies`). Se añade a `arranque.ts` para que un arranque nuevo lo cree igual.
2. **Mover los secretos** con `scripts/traspasar-secreto.ts` (§1): `SUPABASE_DB_URL_PROD`, `SUPABASE_SERVICE_ROLE_KEY_PROD`, `VIGILANCIA_SECRETO_PROD` y los que use cualquier job de tareas de producción.
3. **Comprobar** que cada workflow afectado funciona desde `prod-tareas`: lanzarlo una vez (`workflow_dispatch`) y esperar a que termine bien. **Después**, borrar los secretos del nivel del repositorio con `gh secret delete`.
4. **Workflows:** cada job que usa un secreto de producción declara `environment: prod-tareas`. `deploy-prod.yml` sigue en `production`. En `respaldo.yml` y `purgar-fotos.yml`, cambiar el comentario "Sin environment: production a propósito".
5. **Test:** ningún `secrets.*_PROD` fuera de un job con `environment: prod-tareas` o `production`.
6. **`entornos.md`** y la tabla de secretos de `arranque.ts` (línea ~622), al día.

### RV-132 · Dependencias y actions: que nada llegue a producción sin una persona · P0 · subagente (a)

**Qué pasa.**

- `automerge.yml:18` fusiona solo los PR de Dependabot de patch y minor, y comprueba `github.actor` (línea 13) en lugar del autor del PR.
- `dependabot.yml` no tiene `cooldown`.
- Las actions van fijadas por etiqueta, no por SHA. Entre ellas `treosh/lighthouse-ci-action@v12` (`deploy-staging.yml:118`), que corre en el job con el token de Cloudflare, y `googleapis/release-please-action@v5`, con `contents:write`.
- `respaldo.yml:153` y `purgar-fotos.yml:79` hacen `npm ci` y ejecutan scripts con la clave de producción.

**Qué se hace.**

1. **`dependabot.yml`:** `cooldown` de **7 días** para npm y para actions (`default-days: 7`).
2. **`automerge.yml`:**
   - comprueba `github.event.pull_request.user.login == 'dependabot[bot]'`;
   - fusiona solo `patch` de dependencias de desarrollo;
   - los `minor` y todo lo de producción quedan para revisión humana.
3. **Todas las actions de terceros fijadas por SHA**, con la etiqueta en un comentario (`uses: x/y@<sha> # v12.3.0`). Dependabot las sigue actualizando igual.
4. **`.github/actions/preparar/action.yml:14`:** `setup-node@v4` pasa a la versión actual, fijada por SHA.
5. **`GITHUB_DISPATCH_TOKEN`:** desaparece con RV-146; Ops lo borra de los dos proyectos de Pages con `wrangler pages secret delete` cuando RV-146 esté en producción.
6. **Test:** la comprobación de workflows falla con un `uses:` de terceros sin SHA de 40 caracteres.

### RV-133 · Una segunda copia del respaldo, fuera de GitHub · P0 · subagente (b)

**Qué pasa.** La única copia es un artifact de GitHub de 90 días (`respaldo.yml:136-141`). Un token con `actions:write` puede borrar artifacts, ejecuciones y workflows, y perder la cuenta personal de GitHub se lo lleva todo.

**Qué se hace (DEC-173). Todo con `wrangler` desde este PC, sin tokens nuevos.**

1. **Bucket:** `npx wrangler r2 bucket create hidrantes-respaldos`, y una regla de ciclo de vida que borra a los 400 días (`wrangler r2 bucket lifecycle add`).
2. **Worker `hidrantes-respaldos`** (`workers/respaldos/`), con un binding al bucket y **solo** un endpoint:
   - `PUT /bd/AAAA-MM-DD.sql.gpg` y `PUT /fotos/AAAA-MM.tar.gpg`, con subida por partes (multipart de R2, trozos de 50 MB) para las fotos;
   - autenticado con un secreto largo y aleatorio (`RESPALDO_SUBIDA_SECRETO`) que la sesión genera, pone en el Worker con `wrangler secret put` y en `prod-tareas` con `gh secret set`, siempre por tubería;
   - **no lista, no lee y no borra nada**, y no sobrescribe un objeto que ya existe (`onlyIf`). Quien robe el secreto solo puede añadir archivos, nunca quitar copias;
   - `GET /estado` con el secreto devuelve solo la fecha y el tamaño del último objeto de cada tipo (para vigilancia);
   - lo despliega la sesión con `wrangler deploy` y después `deploy-staging.yml` como el de avisos.
3. **`respaldo.yml`:** tras cifrar, sube **el mismo archivo cifrado** al Worker y comprueba que el tamaño coincide. Si falla, el job falla y abre la issue de siempre. Nunca se descifra en CI. El artifact de GitHub se queda: dos sitios.
4. **Vigilancia:** con `/estado`, "el respaldo más reciente en R2 tiene menos de 8 días".
5. **Descargar una copia** para restaurar: `npm run descargar-respaldo -- --fecha …`, con la sesión de `wrangler` (`wrangler r2 object get`), en local. Documentado en `docs/15` §5.
6. **Tests:** del Worker (no lista, no borra, no sobrescribe, sin secreto 401) y de `respaldo.yml` (el paso de subida no imprime el secreto).
7. **Primera copia:** la sesión lanza `respaldo.yml` a mano una vez y comprueba que el objeto está en R2.

### RV-134 · Restaurar: guardas, copia de seguridad previa y lo que no entra en el respaldo · P1 · subagente (b)

**Qué pasa.**

- `restaurar.ts:303-309` solo compara el ref si `REFS[entorno]` existe, y las claves son `staging` y `prod`. Con `--entorno produccion` (como lo escriben `anonimizar.ts:63` y `revertir.ts:169`) **no hay comprobación de proyecto**.
- `LIMPIAR_ESQUEMA` vacía el esquema sin guardar antes lo que hay.
- La comprobación semanal solo mira que el archivo pese más de 10 KB (`respaldo.yml:130`).

**Qué se hace.**

1. **Entornos:** `restaurar.ts`, `revertir.ts`, `anonimizar.ts` y `migrar.ts` aceptan exactamente `local`, `staging` y `prod`, con `produccion` como alias de `prod`. Cualquier otro valor aborta.
   - Una función compartida en `scripts/lib/comun.ts`, con su test: `--entorno produccion` con una cadena de staging tiene que abortar.
2. **Copia previa:** antes de `LIMPIAR_ESQUEMA`, `restaurar.ts` hace un `pg_dump --schema=hidrantes` del estado actual a un archivo cifrado **fuera del repositorio**, y dice dónde lo deja. Si falla, no sigue.
3. **Comprobar de verdad el respaldo semanal:** en el mismo job, restaurar el dump **todavía sin cifrar** en un Postgres de servicio (`services: postgres`), con el mismo `restaurar.ts --entorno local`, y comparar cuántos puntos hay con producción.
4. **`docs/15` §5.3:** un apartado "se ha perdido el proyecto de Supabase", con:
   - lo que el respaldo **no** lleva: tareas de pg_cron, roles, administradores de Auth y políticas de Storage;
   - cómo rehacerlo: `arranque.ts` + migraciones + restaurar.
   - Anotar también que las fotos se respaldan una vez al mes, así que se pueden perder hasta unas 5 semanas de fotos.

### RV-135 · Reconciliar `main` con `develop` antes de 0.9.0 · P0 · sesión principal

**Qué pasa.**

- 0.8.0 se fusionó en `main` como **squash** (#438, `fb310b5`), contra DEC-096 (`12-decisiones.md:1418`).
- `main` ya no es ancestro de `develop` (merge-base `7864e87` = 0.7.0), así que el próximo PR `develop → main` chocará en `CHANGELOG.md` y `package.json`.
- Producción va en 0.8.0 y `develop` va 38 commits por delante, con 0036 a 0038.
- Vigilancia abrirá "producción va por detrás" hacia el 11–12 oct.

**Qué se hace.**

1. Un PR a `develop` con `git merge -s ours origin/main`, como en #352. Así `main` vuelve a ser ancestro sin cambiar nada de `develop`.
   - En la descripción, la explicación y el enlace a DEC-096.
2. **`release-please.yml`:** comprobar que después el PR de release 0.9.0 sale limpio. Si release-please ya tiene la rama abierta, regenerarla.
3. **`paridad-produccion.md` §2:** las filas que faltan de 0.8.0 y, cuando se haga, de 0.9.0.
4. **Una comprobación nueva en `ci.yml`**, solo en PR a `main`: falla si `main` no es ancestro de la rama. Evita repetir el squash.
5. **El PR de reconciliación lo fusiona la propia sesión** cuando la CI está en verde (es un PR a `develop`). La release y la aprobación van en RV-139c.

### RV-136 · Un deploy de producción que falla avisa, y el entorno del frontend se comprueba · P1 · sesión principal

**Qué pasa.**

- En `deploy-prod.yml:42-86` el orden es migrar, desplegar y comprobar la paridad. Si la paridad falla, producción ya ha cambiado y nadie se entera: no se abre issue, y vigilancia no mira el último deploy.
- `guarda-produccion.ts:25-37` no comprueba `VITE_SUPABASE_URL` ni `VITE_SUPABASE_ANON_KEY` (`deploy-prod.yml:58-64`).

**Qué se hace.**

- **`deploy-prod.yml`:**
  - un paso `if: failure()` que abre (o reabre) la issue "deploy de producción fallido", con el paso que falló;
  - antes de migrar, el guarda comprueba que `VITE_SUPABASE_URL` tiene el ref de producción y que la anon key es de ese proyecto. El ref va dentro del JWT, así que no hace falta llamar a nada.
- **`vigilancia.yml`:** si la última ejecución de `deploy-prod` terminó mal, abre o mantiene la issue.
- **Tests** de `guarda-produccion` con una URL de staging en `VITE_SUPABASE_URL`.

### RV-137 · El panel de staging no lanza trabajos de producción · P1 · Backend lo hace en RV-146; Ops, la documentación

Ver RV-146. Ops crea `despachador.yml` (environment `prod-tareas`, cron cada 15 min y `workflow_dispatch`) que lee los pedidos con `fn_pedidos_pendientes` y lanza el workflow que toca con su `GITHUB_TOKEN` (`actions: write` en ese workflow), y marca el pedido como lanzado. Actualiza `entornos.md` y `docs/15`: qué botones del panel piden qué, que tardan hasta 15 min en empezar, y que en staging no piden nada de producción.

### RV-138 · Vigilancia sin huecos · P2 · sesión principal

- **`.github/scripts/revisar-bd.sh`:** el `|| echo 0` de la cola de push oculta un fallo de la consulta. Si falla, el paso falla.
- **`mantener-activo.yml:42-53`:** abre issues pero nunca las cierra. Que cierre la suya cuando vuelve a ir bien, como vigilancia.
- **Canario de Ubuntu 26:** después del 14 oct, si cumple el criterio de dos semanas, el PR que pasa los jobs a `ubuntu-26.04` (DEC-128).

### RV-139 · La documentación, al día · P2 · subagente (c)

- **`09-plan-implementacion.md`:**
  - línea 398, "Incidencias en la pestaña Voluntarios": fuera (DEC-167);
  - §8, fila Fase 9 (línea 544): docs/25 a docs/31, y RV-97 (la GitHub App) como **cancelado** por DEC-153.
- **`INDICE.md`:**
  - línea 3: la fecha del estado;
  - línea 9: "01–08 congelado", aclarando que se versionan (01 va por v1.12);
  - línea 45: `archivo/` no existe, así que se quita o se crea con los dos documentos originales de la raíz de `docs/`;
  - la fila 31.
- **`CLAUDE.md:4`:** el número de documentos real.
- **Conformidad de jefatura:**
  - `01-requisitos-funcionales.md:6` dice que v1.10 está pendiente, pero `verificacion/lista-ficha-cola.md` y `cola-sin-senales.md` dicen que se obtuvo para v1.8 a v1.11, y `cercanos-simple.md` la deja pendiente.
  - Unificarlo en `01` (una sola línea: "conformidad de jefatura hasta v1.x, fecha") y quitar lo contradictorio de los registros.
- **`docs/12`:** DEC-172 (environment `prod-tareas`), DEC-173 (copia en R2 con un Worker de solo escritura), DEC-174 y DEC-175 con el texto de Backend, DEC-176 (la release la aprueba una puerta automática), DEC-177 (conformidad de los requisitos: basta la del desarrollador, ya dada al pedir el cambio) y DEC-178 (los dibujos de los enganches son la referencia definitiva).
- **Conformidad de jefatura (DEC-177):** deja de ser un paso pendiente. `01` dice en una sola línea "versión aprobada por el desarrollador al pedir el cambio; jefatura recibe la versión nueva con la release". Se quita "pendiente de conformidad" de todos los registros.
- **Manuales 13 y 14:** primer borrador completo de `13-manual-jefatura.md` y `14-manual-voluntario.md`, con capturas de `revisar-pantallas` de staging, en castellano llano. Se marcan "borrador, se revisa tras el piloto".
- **Fase 9 (#76–#85):** las issues que son trabajo de software se cierran con el PR que las hace. Las que son de la agrupación (sesión de validación, piloto, sesión presencial, contactos de `15` §10, traspaso a la cuenta institucional) se etiquetan `organizacion` y salen del plan de desarrollo (`09` §8). No son trabajo de esta app.

### RV-139b · La comprobación en staging que sustituía a las pruebas a mano · P1 · Ops, oleada 3

Antes: "en el Android, probar…". Ahora lo hace una sesión con Playwright **contra staging de verdad**, no contra los mocks del e2e, con un móvil emulado (Pixel 7, 412 × 915) y en escritorio.

- **Entrada como voluntario** con el código de staging, que la sesión lee de su sitio actual (nunca en el chat ni en el log).
- **Recorridos:**
  - Cercanos: se ve, tres filas sin desplazar, "Cómo llegar" lleva a una URL de Google Maps;
  - alta de una boca con enganche Directo, con dos fotos de prueba de `e2e/fixtures`, en modo avión y luego con conexión: llega a la cola;
  - Mis propuestas la enseña;
  - una revisión de un punto existente.
- **Lo de jefatura** (Cola, Editar con mover, Registro e Historial, foco con Tab): el panel exige Google y **no se automatiza la entrada con Google**. Se comprueba con:
  - los e2e del panel (con mocks) contra el build de staging;
  - y directamente en la base de datos de staging, con claims de administrador dentro de una transacción, como hace `scripts/anonimizar.ts`: aprobar la propuesta del recorrido anterior, editar el punto moviéndolo 6 m y cambiando el enganche con `fn_editar_punto`, y comprobar que `v_registro` y `detalleLegible` dan "Movido 6 m · Enganche: Granada → Directo".
- **Push:** la entrega a un móvil real no se puede automatizar. El criterio pasa a ser que, en staging, el Worker de avisos recibe `201` del servicio de push para las suscripciones que existan (`fn_resultado_notificacion`), y que el e2e del service worker muestra la notificación. DEC-122 se actualiza.
- **`npm run anonimizar`** en staging, con el dispositivo del recorrido de prueba (nombre ficticio "Prueba Tres"), con la cadena de staging traspasada con la clave efímera de §1 y borrada al acabar.
- **Limpieza de staging (#77):** con el mismo método de claims, cerrar la incidencia de staging y rechazar las 8 propuestas de prueba, con motivo "prueba". Se cierra #77.
- **Resultado:** una tabla en el registro con cada recorrido, ok o fallo y la captura. Si algo falla, **no se sigue a RV-139c** y se abre la issue.

### RV-139c · Release 0.9.0 y producción, sin pasos a mano · P0 · Ops, oleada 3 (DEC-176)

Solo si RV-139b está todo en verde.

1. **El PR de release-please (0.9.0):** la sesión hace el push vacío que lanza la CI (DEC-079 / DEC-153) con su sesión de `gh`, espera la CI en verde y lo fusiona.
2. **`develop → main`:** abre el PR, espera la CI y lo fusiona **con merge commit** (la comprobación de RV-135 lo exige).
3. **La puerta automática (DEC-176).** La aprobación del environment `production` la da la sesión con `gh api …/pending_deployments` (state `approved`), **solo si**:
   - la CI de `main` está en verde;
   - RV-139b está en verde con el mismo commit;
   - `npm run comprobar-produccion` dice que producción tiene lo que la versión necesita;
   - no hay ninguna issue abierta con la etiqueta `bloquea-release`.
   - Si algo falla, rechaza el despliegue con el motivo y abre la issue.
4. **Después:** comprobar la paridad (`deploy-prod` ya lo hace), anotar 0.8.0 y 0.9.0 en `paridad-produccion.md` §2, y cerrar la issue de vigilancia de "producción va por detrás" si se abrió.
5. **Para siguientes releases:** `scripts/publicar.ts` (`npm run publicar`) hace estos mismos pasos, para que cualquier sesión los repita igual. `docs/04` §12 y `CLAUDE.md` lo explican.

**Lo que cambia (DEC-176):** el revisor humano del environment `production` se queda configurado, pero la aprobación la da la sesión con la sesión de `gh` del propietario cuando la puerta automática está en verde. Es más rápido y no depende de nadie, pero quien puede usar esa sesión de `gh` puede publicar en producción: es la contrapartida aceptada por el desarrollador.

---

## 3. Backend (oleada 1)

### RV-140 · Límites de longitud en todos los textos libres · P1 · 0039

**Qué pasa.** `fn_validar_datos` (la última, en `0032_diametro_bocas.sql:62-110`) no limita la longitud de `descripcion`, `descripcion_fallo`, `nota` ni `motivo`. Con un token se puede mandar una propuesta de 1 MB. La base de datos (500 MB) se comparte con uniformidad.

**Qué se hace (DEC-174).** Límites en el servidor, en `fn_validar_datos` y en las RPC de jefatura que aceptan texto:

| Campo | Máx. |
|---|---|
| `descripcion`, `descripcion_fallo` | 500 |
| `direccion` | 200 |
| `nota`, `motivo` (propuesta, retirada, rechazo, borrado) | 1.000 |
| `autor_nombre`, `autor_apellido` | 60 |

- Si se pasa: `PAYLOAD_INVALIDO(<campo>)`.
- Lo que ya hay en la base de datos no se toca: los límites son solo para lo nuevo.
- `fn_editar_punto`, `fn_aprobar` (correcciones), `fn_rechazar` y `fn_retirar_punto` aplican los mismos límites.
- **Frontend-campo y Frontend-panel** ponen el mismo `maxLength` en cada campo (RV-155, RV-168). Las constantes van en `src/lib/limites.ts`, que crea Frontend-campo.

### RV-141 · Un tope de propuestas al día por dispositivo · P1 · 0039

**Qué pasa.** `fn_proponer_interno` (`0035:28-199`) no tiene cuota. "Corregir datos" no lleva foto, y `fn_proponer` va directo a PostgREST con la clave anon: ningún límite de Pages Functions lo para.

**Qué se hace.**

- Parámetro nuevo en `config`: `max_propuestas_dia`, por defecto **60** por dispositivo y día. Es configurable en Ajustes del panel (FR-142), igual que el tope de subidas.
- Si se pasa: `CUOTA_PROPUESTAS_AGOTADA`, con `reintentar_en_s` hasta medianoche.
- **No cuenta** un reintento con la misma `clave_local` (el servidor ya devuelve la existente).
- **Los administradores no tienen tope.**
- **Frontend-campo:** el mensaje (RV-154).
- **pgTAP:** la 61.ª falla, la misma `clave_local` no cuenta y un admin no tiene tope.

### RV-142 · Storage: el tope por dispositivo no basta · P1 · 0039

**Qué pasa.**

- Un token reserva 80 subidas de 5 MB al día, que son 400 MB (`0035:583-597`).
- Cada canje del código crea un dispositivo nuevo con su cuota, con un máximo de 150 canjes por IP y día (`0026:196-207`).
- Dos o tres dispositivos llenan el GB gratuito, que comparte uniformidad.
- Las reservas sin confirmar se protegen 7 días (`0035:485-488`), y la purga (`scripts/purgar-fotos.ts:69-73`) aborta si tendría que borrar más de max(50, 10 %).

**Qué se hace.**

- **Tope global:** `max_subidas_dia_total`, por defecto **400** reservas al día entre todos. Al llegar: `CUOTA_SUBIDAS_AGOTADA` para todos los voluntarios (los admins no cuentan). Vigilancia lo avisa a través de `topes_globales_24h`, que ya existe.
- **Reservas sin confirmar:** la protección baja de 7 días a **48 h**. El cliente reintenta mucho antes.
- **Purga:** el freno del 10 % no cuenta las reservas **nunca confirmadas** de más de 48 h, que son basura segura. El freno sigue para las fotos que sí estuvieron referenciadas. Lo cambia Ops en `scripts/purgar-fotos.ts`; Backend le pasa la consulta.
- **pgTAP** del tope global y de la protección de 48 h.

### RV-143 · Nadie se hace pasar por un administrador con su `dispositivo_id` · P1 · 0039 + `functions/api/verificar-codigo.ts`

**Qué pasa.**

- `/api/verificar-codigo` acepta cualquier UUID como `dispositivo_id` (`functions/api/verificar-codigo.ts:36-43`).
- El del administrador es `md5('administrador:'||email)::uuid` (`0005:35-38`), que se calcula sabiendo su correo.
- Con ese id, un voluntario:
  - comparte y agota la cuota de subidas del admin;
  - ve sus propuestas en `fn_mis_propuestas`;
  - queda fuera de la actividad y de las notificaciones;
  - no se puede anonimizar, porque `anonimizar.ts:241` aborta con `de_administrador`.

**Qué se hace (DEC-175).**

- `fn_verificar_codigo` rechaza un `dispositivo_id` que coincida con `fn_dispositivo_admin(email)` de **cualquier** fila de `administradores`, activa o no. Devuelve `DISPOSITIVO_RESERVADO`, sin decir de quién es.
- La función de Pages lo pasa como `409 DISPOSITIVO_RESERVADO`.
- **Frontend-campo (RV-159):** el cliente genera un id nuevo y repite el canje una sola vez.
- **pgTAP:** el id de un admin, rechazado; uno normal, aceptado.

### RV-144 · Un fallo de red al mandar un push se reintenta · P1 · `functions/`

**Qué pasa.**

- `enviar` (`functions/_lib/webpush.ts:186-188`) captura toda excepción y devuelve `{ ok: false, error }`, así que el `catch` de "no se sabe si salió" de `push.ts:68-72` no se ejecuta nunca.
- `fn_resultado_notificacion` guarda `error` (`0030:115`), y `fn_reclamar_notificaciones` solo reclama filas con `error is null` (`0014:33`).
- Un corte de conexión o de DNS pierde el aviso para siempre, contra RV-08 ("un duplicado es preferible a una pérdida").

**Qué se hace.**

- `enviar` distingue tres casos:
  - **respuesta HTTP:** `ok` o `error` con estado, como hoy;
  - **excepción de red o tiempo agotado:** `{ ok: false, transitorio: true }`;
  - **404/410:** `caducada`, como hoy.
- **`push.ts`:** con `transitorio`, no guarda el error. Deja la fila para que se reclame en la siguiente pasada, como hacía el `catch` y con el mismo límite de intentos. **No** suma al contador de fallos de la suscripción.
- **Tests:**
  - `webpush.test.ts:187` pasa a esperar `transitorio`;
  - `push.test.ts`: un fallo transitorio se reintenta y uno con 500 no.

### RV-145 · Un punto retirado no vuelve como activo · P2 · 0040

**Qué pasa.** `fn_borrar_punto` acepta un punto `retirado` (`0006:306`), y `fn_restaurar_punto` siempre pone `situacion = 'activo'` (`0006:327`). Hoy el panel no lo permite, pero la RPC sí.

**Qué se hace.**

- `fn_borrar_punto` guarda la `situacion` de antes (el registro ya la lleva en `antes`).
- `fn_restaurar_punto` la devuelve: un retirado vuelve como retirado.
- **pgTAP:** retirar, borrar y restaurar deja el punto `retirado`.

### RV-146 · El panel ya no lanza workflows con un token de GitHub · P1 · 0040 + `functions/api/lanzar-workflow.ts`

**Qué pasa.**

- `lanzar-workflow.ts:22-24` despacha siempre al repo en `develop`, y `purgar-fotos.yml` y `respaldo.yml` trabajan solo contra producción. Un administrador de **staging** que pulsa "Purgar fotos" purga el bucket de **producción**.
- Para despachar, los dos proyectos de Pages guardan `GITHUB_DISPATCH_TOKEN`, que también puede borrar artifacts (los respaldos), ejecuciones y workflows.

**Qué se hace.**

1. **0040:** tabla `pedidos_trabajo` (`id`, `workflow`, `pedido_por`, `pedido_en`, `lanzado_en`, `resultado`) y:
   - `fn_pedir_trabajo(workflow)`, solo administradores, con la misma lista de workflows de hoy y como mucho un pedido pendiente por workflow;
   - `fn_pedidos_pendientes()` y `fn_marcar_pedido(id, resultado)`, solo `service_role`.
   - Queda en el registro como hoy (`workflow_lanzado`).
2. **`/api/lanzar-workflow`** deja de llamar a GitHub:
   - en **producción** (`ENTORNO=produccion`, RV-130), llama a `fn_pedir_trabajo` y devuelve `{ pedido: true }`;
   - en **staging**, `purgar-fotos` y `respaldo` devuelven `409 SOLO_EN_PRODUCCION`, y los demás se piden en la base de datos de staging, que nadie despacha (se anota).
   - Se quita todo uso de `GITHUB_DISPATCH_TOKEN`.
3. **`despachador.yml`** lo hace Ops (RV-137).
4. **Frontend-panel** (RV-167): "Pedido. Empezará en unos minutos" en lugar de "Lanzado", y los botones de staging deshabilitados.
5. **Tests:** de la función con los dos `ENTORNO`, y pgTAP de las tres funciones nuevas (permisos incluidos).

### RV-147 · Las fotos y el nombre de la propuesta de alta se purgan con su punto · P2 · 0040

**Qué pasa.** `fn_purgar_papelera_interna` borra solo las propuestas con `punto_id = p.id` (`0006:343-345`). La propuesta que creó el punto (un alta, o un alta fusionada) tiene `punto_id` nulo y sigue `aprobada`. `fn_fotos_referenciadas` (`0035:480-483`) mantiene sus dos fotos en el bucket público para siempre, y el nombre del autor también se queda.

**Qué se hace.**

- Al purgar un punto, también se borran:
  - las propuestas de alta cuyo registro de aprobación o de fusión apunta a ese punto (la relación está en `registro`: `accion in ('aprobacion','aprobacion_con_correcciones','fusion')`, `punto_id`, `propuesta_id`);
  - si la relación no es fiable, una columna nueva `propuestas.punto_creado_id`, rellenada para el pasado con el registro.
- Sus fotos dejan de estar referenciadas y caen en la purga siguiente.
- **pgTAP:** dar de alta, aprobar, borrar y purgar no deja ni la propuesta ni sus fotos referenciadas.

### RV-148 · Restos de "Algo no funciona", y los errores del cliente · P2 · 0040

- **`fn_reportar_incidencia`:** en `0007:76` sigue concedida a `anon` y escribe en `incidencias_app`. Nadie la lee desde docs/29.
  - Se le quita el permiso a `anon`.
  - La app actual ya no la llama. Una versión vieja recibe un error y lo trata como cualquier fallo: comprobar en `src/` antiguo que no rompe.
  - La tabla se queda hasta #472.
- **`fn_salud`** (`0031:244`): fuera `incidencias_abiertas`. Frontend-panel quita el campo del tipo (RV-169).
- **`fn_registrar_error`** (`0005:579-583`):
  - **Problema:** el tope global de 2.000 al día se agota rotando `dispositivo_id`, y desde ahí se pierden los errores reales del día.
  - **Solución:** además del tope global, un tope por `ip_hash` (100 al día). La función de Pages ya tiene la IP: si el error no pasa por Pages, que pase.
  - **pgTAP** del tope por IP.

### RV-149 · pgTAP: permisos de `authenticated` y las RPC de jefatura · P1 · subagente

**Qué pasa.**

- `02_permisos` fija la lista de funciones de `anon`, pero no la de `authenticated`. Una RPC nueva SECURITY DEFINER concedida a `authenticated` sin `fn_exigir_admin` pasaría la CI.
- Sin prueba negativa (`NO_AUTORIZADO`):
  - `fn_cambiar_codigo_acceso`, `fn_gestionar_administrador`, `fn_guardar_config`;
  - `fn_purgar_papelera`, `fn_borrar_punto`, `fn_restaurar_punto`;
  - `fn_renombrar_nucleo`, `fn_anadir_nucleo`;
  - `fn_guardar_direccion_sugerida` (sin ningún test), `fn_reservar_subida_admin`, `fn_registrar_workflow`;
  - `fn_fusionar_con_existente`, `fn_rechazar`, `fn_aprobar_lote`.

**Qué se hace.**

- Un test que fija **la lista exacta** de funciones ejecutables por `authenticated`.
- Para cada una, que **sin sesión de administrador** devuelve `NO_AUTORIZADO`. Mejor un bucle sobre la lista que 15 tests a mano.

### Cerrar sesión revoca el token (RV-158, la parte de servidor) · P2 · 0040

`cerrarSesion` (`src/lib/sesion.ts:62-76`) solo borra lo local. Un token copiado sigue valiendo hasta 365 días, y su suscripción push también.

- RPC nueva `fn_cerrar_sesion()` para el token que la llama (anon): revoca el token y borra la suscripción push de ese dispositivo.
- Va en la lista de `anon` del test de permisos (RV-149).

---

## 4. Frontend-campo (oleada 1, salvo RV-158 y RV-159)

### RV-150 · Sin cobertura, el mapa del formulario no se queda gris · P1 · subagente 1

**Qué pasa.** `SelectorPin.tsx:99` llama a `capasDe(capaGuardada() === 'satelite' ? 'satelite' : 'base', modo)` sin `baseDebajo`. El mapa principal sí lo pasa (`Mapa.tsx:397`). Con Satélite elegido y sin cobertura, poner el pin de un alta o de "corregir ubicación" se hace sobre un mapa gris. Además, el selector no cambia de capa al cambiar la conexión.

**Qué se hace.**

- Las mismas capas que el mapa principal, con `baseDebajo`.
- Al pasar a sin conexión, cambia al mapa base descargado. Usar el mismo estado de conexión que el mapa.
- **e2e:** offline y con Satélite guardado, el selector enseña teselas del mapa base.

### RV-151 · Enviar no espera a la cola · P1 · subagente 1

**Qué pasa.** `Proponer.tsx:142-148`: `enviar()` hace `await procesarCola()` aunque `encolar` ya ha guardado. Con señal débil, un alta puede tardar minutos en "Enviando…": 20 s de reserva, 2 × 120 s de fotos y 30 s de RPC, más lo que ya hubiera en cola. El voluntario se cansa y la vuelve a rellenar, y sale un duplicado de verdad, con otra `clave_local`.

**Qué se hace.**

- En cuanto `encolar` resuelve, la pantalla de resultado: "Guardada. Se enviará en cuanto haya conexión" o "Enviada", según cómo esté la cola.
- `procesarCola()` se lanza sin esperar.
- Con el texto de jefatura: "Aplicar ahora" pasa a "Guardar en el móvil" si no hay conexión (`Proponer.tsx:160`).
- **Tests:** con la red parada, la pantalla de resultado sale en menos de 1 s; el mensaje dice "guardada en el móvil".

### RV-152 · Volver al formulario después de la cámara, y un punto que desaparece · P2 · subagente 1

**Qué pasa.** `Proponer.tsx:61-64` manda a `/` si `!punto`, sin mirar `usePuntos().cargado`. Si Android descarta la pestaña mientras está la cámara abierta, al recargar en `/proponer/revision?p=…` se vuelve al mapa. Lo mismo pasa a mitad del formulario si una sincronización retira el punto, y se pierden las fotos.

**Qué se hace.**

- **Mientras no hayan cargado los puntos:** "Cargando…".
- **Si el punto ya no existe:** un aviso en el formulario, "Este punto ya no está en el mapa: lo han retirado o borrado". No se redirige. Las fotos ya hechas se pierden, pero con explicación.

### RV-153 · Al cerrar sesión no quedan las propuestas del anterior · P1 · subagente 2

**Qué pasa.**

- `src/lib/mis-propuestas.ts:30`: `lista` y `novedades` se cargan una vez, al importar el módulo.
- `cerrarSesion` (`acceso.ts:339-346`) borra la clave guardada, pero no esas variables.
- En un móvil compartido, B ve Mis propuestas, el resumen de Ajustes y los avisos de A (códigos y motivos de rechazo), sin conexión indefinidamente.
- `marcarVistas()` (`MisPropuestas.tsx:88`) se ejecuta aunque la carga haya fallado.

**Qué se hace.**

- `olvidarMisPropuestas()`, que vacía las variables y avisa a los suscriptores. La llama `cerrarSesion`, con la misma generación que ya usan `cola` y `puntos`.
- `marcarVistas()` solo después de una carga buena.
- **Tests:** cerrar sesión y entrar con otro deja la lista vacía; con la carga fallida no se marca nada.

### RV-154 · Los mensajes de los topes nuevos · P2 · subagente 2

- **`CUOTA_PROPUESTAS_AGOTADA`** (RV-141): en la cola, "Has llegado al máximo de propuestas de hoy (60). Se enviará mañana". Se reintenta a la hora que diga `reintentar_en_s`, sin contar como error permanente.
- **`CUOTA_SUBIDAS_AGOTADA` por el tope global** (RV-142): el mismo tratamiento que ya tiene.

### RV-155 · `maxLength` en todos los textos · P2 · subagente 2

- `src/lib/limites.ts`, con las constantes de RV-140, exportadas para el panel.
- `maxLength` en Proponer, la retirada, Ajustes (nombre y apellido) y el resto de campos de texto del lado del voluntario.
- **Test:** cada campo de texto libre del formulario tiene `maxLength` y coincide con `limites.ts`.

### RV-156 · La cola: reintentar sin escribir una copia vieja y sin gastar reservas · P2 · subagente 2

**Qué pasa.**

- **`reintentarCola`** (`cola.ts:435-438`) recorre el array viejo y guarda `{...i, proximo: 0}` sin volver a leer el elemento. Si una pasada en curso lo ha cambiado o enviado, puede resucitar un enviado o borrar un `foto_path` recién guardado. El evento `online` lo lanza dos veces (`cola.ts:460` y `conexion.ts:23`).
- **Cada reintento de subida pide una reserva nueva** (`cola.ts:233-262`). Con horas de señal mala puede agotar las 80 al día.

**Qué se hace.**

- `reintentarCola` hace un solo update atómico en IndexedDB por elemento: lee, cambia `proximo` y escribe, en la misma transacción.
- Una sola escucha de `online`.
- **La reserva se reutiliza** mientras la URL firmada no haya caducado: guardar `reserva` y `caduca_en` en el elemento. Solo se pide otra si ha caducado o si el servidor dice `FOTO_NO_RESERVADA`.
- **Tests:**
  - un reintento durante una pasada no resucita un enviado;
  - tres fallos de subida seguidos usan una sola reserva.

### RV-157 · Fotos, avisos y accesibilidad · P2 · subagente 2

1. **Memoria:**
   - **Problema:** `foto.ts:324-332` decodifica la foto a resolución completa. Con 50 o 108 MP en un Android medio puede cerrar la pestaña.
   - **Solución:** usar `createImageBitmap(archivo, { resizeWidth, resizeHeight, resizeQuality: 'high' })`, con lo que ya hay como alternativa.
   - Y `imagen.close()` en un `finally`.
2. **"Repetir" una foto** (`Campos.tsx:201-221`):
   - mientras se prepara la nueva, "Preparando foto…" y Enviar deshabilitado;
   - si falla, se vuelve a la anterior **con** el mensaje de error, no debajo de una foto que parece buena.
3. **Tocar una notificación con un formulario a medias** (`public/sw-push.js:114`, `AvisoVersion.tsx:13`):
   - si hay una ventana en `/proponer`, no se navega: se manda un `postMessage`, y la app enseña un aviso con "Ver" que pregunta antes de salir;
   - igual con "recargar" para una versión nueva, desde un formulario: preguntar.
4. **El lector de pantalla:**
   - la lista de puntos deja de ser `aria-live` (`ListaPuntos.tsx:145`); solo se anuncia el número de resultados al filtrar;
   - la barra de estado (`BarraEstado.tsx:28`) no lleva `role="status"` sobre el "hace N min", solo sobre los cambios de estado (sin conexión o sincronizado);
   - el orden por distancia solo se recalcula si la posición se ha movido más de 10 m.
5. **"N sin enviar"** (`BarraEstado.tsx:33-38`): objetivo táctil de 44 px (UI-15), sin que cambie cómo se ve.
6. **Pin con GPS viejo** (`SelectorPin.tsx:107`): en un alta, con la posición `antigua`, el marcador se pinta con el estilo de "sin colocar" (gris y discontinuo), para que cuadre con "Mueve el pin".
7. **Tiempo máximo del canje del código** (`api.ts:153-159`): `verificarCodigo` usa `fetchConLimite`, con 20 s, como el resto.

**Tests** de cada punto; axe de la lista y de la barra.

### RV-157b · El dibujo de Directo · P2 · subagente 1

- `public/racores/directo.webp`, **dibujado** con el mismo estilo que `granada.webp` y `barcelona.webp`: trazo `--marino-700` sobre gris azulado claro, mismo tamaño y márgenes. Muestra una salida roscada directa sin pieza de enganche.
- Se hace con un SVG fuente en `public/racores/fuentes/directo.svg` y `scripts/preparar-racores.ts` (que ya convierte a webp).
- Los dibujos son la referencia definitiva (DEC-178): no se esperan fotos.
- **Test:** `racores.spec.ts` con las tres imágenes presentes; precache incluido.

### RV-158 · Cerrar sesión revoca el token · P2 · oleada 2 (cuando 0040 esté en `develop`)

- `cerrarSesion` llama a `fn_cerrar_sesion()` antes de borrar lo local, con un tiempo máximo de 5 s.
- Si no hay conexión o falla, se cierra la sesión igual (lo local manda) y se anota en `errores_cliente`.
- **Test:** la llamada se hace; sin red, la sesión se cierra igual.

### RV-159 · `DISPOSITIVO_RESERVADO` · P2 · oleada 2 (cuando RV-143 esté en `develop`)

- Con `409 DISPOSITIVO_RESERVADO`, `sesion.ts` genera un `dispositivo_id` nuevo y repite el canje **una vez**. Si vuelve a fallar, el error genérico.
- **Test** con la respuesta simulada.

---

## 5. Frontend-panel (oleada 1)

### RV-160 · Los diálogos no roban el foco cada minuto · P1 · subagente 1

**Qué pasa.**

- `Dialogo.tsx:25-32` vuelve a hacer `caja.current?.focus()` cada vez que cambia `alCerrar`.
- Todos los llamadores pasan una flecha nueva: `Inventario.tsx:631,643`, `Papelera.tsx:280`, `Ajustes.tsx:147,400`.
- Los contadores se refrescan cada 60 s (`PanelJefatura.tsx:46-55`), y la sincronización de puntos también re-renderiza.
- Escribiendo un motivo en Retirar o Borrar, o un núcleo nuevo, el foco salta a la caja y lo que se teclea se pierde.

**Qué se hace.**

- El foco inicial, **solo al montar** (efecto con `[]`).
- `alCerrar` se lee por ref, como ya hace `EditarPunto`.
- **Al cerrar, el foco vuelve** al elemento que tenía el foco al abrir. Hoy se va a `<body>`. Afecta a Retirar, Borrar, Historial, Purgar, Código y Núcleo.
- **Test:** con el diálogo abierto y un re-render del padre, el foco sigue en el campo; al cerrar, vuelve al botón.

### RV-161 · La Cola no cambia de propuesta sola · P1 · subagente 1

**Qué pasa.** En pantalla ancha, `ColaRevision.tsx:102` abre `visibles[0]` sin escribir `?p=`. La cola va de más nueva a más vieja (`cola.ts:93`). Si llega una propuesta nueva mientras jefatura corrige o rechaza la primera sin haberla tocado en la lista, el detalle salta a la nueva y se pierde el formulario. "Aprobar" puede ir a la equivocada.

**Qué se hace.**

- La propuesta abierta se fija por **id** en el estado al primer render (y en `?p=` con `replace`). Solo cambia si jefatura toca otra, si se resuelve la abierta (pasa a la siguiente, como hoy) o si desaparece.
- Una propuesta nueva sale en la lista con su marca, sin mover el detalle.
- **Test:** con el detalle abierto en la primera y un refresco que trae una nueva, el detalle sigue en la misma y el formulario sigue escrito.

### RV-162 · Aprobar no se registra "con correcciones" si nadie ha corregido · P1 · subagente 1

**Qué pasa.** `conDireccion` (`cola.ts:692-695`) añade la dirección siempre que difiere de `p.direccion_sugerida`.

- **Caso 1** (`DetallePropuesta.tsx:69,81,120`): la dirección deducida se guarda en el servidor, pero el `direccion_sugerida` del cliente sigue a `null` hasta recargar. Un "Aprobar" normal manda `{direccion}` y queda como `aprobacion_con_correcciones`.
- **Caso 2** (`DetallePropuesta.tsx:612`): el formulario de corregir rellena la dirección actual en revisiones y cambios de estado, así que toda aprobación corregida lleva "Dirección → C/ …".
- **Caso 3:** vaciar el campo de dirección se ignora sin decir nada.

**Qué se hace.**

- Se compara con lo que **se enseñó al abrir** (la sugerida ya guardada, o la del punto), no con el `direccion_sugerida` del momento.
- Solo se manda `direccion` si jefatura la ha tocado.
- Vaciarla manda `null`, y el servidor la quita.
- **Tests de los tres casos.**

### RV-163 · Cola en el móvil: historial y "Rechazar seleccionadas" · P2 · subagente 1

- **"‹"** (`ColaRevision.tsx:336`) y **después de una acción** (`:148`): hacer `history.back()` si la entrada de arriba es la de `?p=`, en lugar de `replace`. Si no, "atrás" deja una entrada duplicada por cada propuesta revisada.
- **"Rechazar seleccionadas"** (`:187`, en la barra fija de abajo): el formulario sale arriba (`:263`) sin desplazar ni mover el foco. Al abrirlo, `scrollIntoView` y el foco en el motivo.
- **e2e** a 412 px de los dos.

### RV-164 · La dirección de la celda no deshace cambios más nuevos · P1 · subagente 2

**Qué pasa.** `Inventario.tsx:358-368` usa un input no controlado. Una vez tocado, deja de reflejar los cambios, y el `blur` (`:308-313`) guarda lo que enseña. Editar la dirección en la celda y después en Editar, o que otro admin la cambie, hace que pasar por la celda con Tab vuelva a escribir la vieja.

**Qué se hace.**

- Controlado, con `key={p.id + p.direccion}`, de modo que se reinicia cuando cambia el dato.
- En el `blur`, **solo** guarda si el texto difiere del valor actual del punto.
- **Test** de los dos casos.

### RV-165 · Editar con el punto al día · P2 · subagente 2

**Qué pasa.** `editando` (`Inventario.tsx:257,270`) es una foto fija. Si otro admin cambia el estado mientras está abierto Editar, "antes" y la comparación usan lo viejo.

**Qué se hace.**

- Si el punto de `puntos` con el mismo id cambia (por `actualizado_en`):
  - **sin cambios sin guardar:** Editar se actualiza sin cerrarse;
  - **con cambios:** aviso en el panel, "Otro administrador ha cambiado este punto", con "Ver lo nuevo", que descarta lo propio tras confirmar.
- **Test** de los dos caminos.

### RV-166 · Registro: buscar desde otra página · P1 · subagente 2

**Qué pasa.** `Registro.tsx:28` no vuelve a la página 0 al cambiar `busqueda`. Desde la página 4, una búsqueda pide una página fuera de rango y el servidor da error. `useCarga` deja las filas viejas y `:58` solo enseña errores si no hay filas, así que se ven filas sin filtrar como si fueran el resultado.

**Qué se hace.**

- `setN(0)` al cambiar la búsqueda o la acción, como hace Inventario.
- Un error con filas visibles se dice igual, con un aviso encima.
- **Test.**

### RV-167 · Ajustes: radios del marcador, push de jefatura, cargas y botones de staging · P2 · subagente 2

1. **"Radios del marcador"** (`Ajustes.tsx:301-311`):
   - **Problema:** se re-formatea en cada tecla, así que no se puede escribir "5,5" ni añadir un quinto valor.
   - **Solución:** texto libre mientras se escribe y validación en el `blur` y al guardar, con mensaje si no son cinco números crecientes.
2. **Push de jefatura** (`push-jefatura.ts:48-51`):
   - **Problema:** desactivar los dos temas hace `unsubscribe()` de la **única** suscripción del navegador, y también mata las del voluntario en ese navegador (0030 admite que la compartan). El voluntario sigue viendo "Activado".
   - **Solución:** sin temas, se borra **solo** la fila de jefatura en el servidor (RPC existente o una de Backend, a pedir en la coordinación), y no se toca la suscripción del navegador si el voluntario la tiene activa.
   - Además, `serviceWorker.ready` con un tiempo máximo y `subscribe()` con `catch`. En `Ajustes.tsx:649-656`, un `try/finally` que reactive las casillas y un mensaje de error.
3. **"Cargando…" para siempre** en Administradores y Núcleos (`Ajustes.tsx:212,393`): con error, el mensaje y "Reintentar".
4. **Trabajos pedidos** (RV-146): el mensaje pasa a "Pedido. Empezará en unos minutos". **En staging**, "Purgar fotos" y "Lanzar respaldo" deshabilitados, con "Solo en producción", según `VITE_ENTORNO` (RV-130).

### RV-168 · `maxLength` en el panel y CSV sin fórmulas · P2 · subagente 2

- `maxLength` de `src/lib/limites.ts` (RV-155) en:
  - Editar;
  - Corregir y rechazar (motivo);
  - Retirar y Borrar;
  - "Rechazar seleccionadas";
  - la dirección de la celda.
- **CSV** (`exportar.ts:88`): una celda que empieza por `=`, `+`, `-`, `@`, tabulador o retorno lleva delante un apóstrofo (`'`). El `.xlsx` ya va bien.
- **Test** con "=HYPERLINK(…)".

### RV-169 · Restos y modo oscuro · P3 · subagente 2

- **Fila elegida de la Cola en oscuro** (`ColaRevision.tsx:397`):
  - **Problema:** usa `dark:bg-white/5`, que solo sigue al sistema. Con el tema forzado a "oscuro" sobre un sistema claro queda a ~1,1:1.
  - **Solución:** un token (`--fila-elegida`) definido en los dos bloques de oscuro, o la variante `dark` de Tailwind atada a `data-tema`. Buscar otros `dark:` con el mismo problema.
- **Quitar `incidencias_abiertas`** del tipo de Salud (`src/lib/panel/ajustes.ts:179`), con RV-148.
- **axe** en oscuro forzado sobre sistema claro.

---

## 6. Checklist

**Ops**

- [ ] Cualquier despliegue de producción que no venga de `deploy-prod` se detecta.
- [ ] Ningún secreto de producción a nivel del repositorio (`prod-tareas`, movidos sin verse).
- [ ] Actions fijadas por SHA, y Dependabot con cooldown y sin auto-fusión de minor ni de producción.
- [ ] Respaldo en R2 a través del Worker de solo escritura, comprobado, y vigilancia lo mira.
- [ ] `restaurar` con guarda para `produccion`, copia previa y prueba semanal de restauración.
- [ ] `main` es ancestro de `develop`, y hay una comprobación en CI.
- [ ] Un deploy de producción fallido abre issue, y el guarda mira `VITE_*`.
- [ ] `despachador.yml` y `GITHUB_DISPATCH_TOKEN` borrado de Pages.
- [ ] Documentación, manuales en borrador y Fase 9 ordenada.
- [ ] RV-139b en verde en staging y 0.9.0 en producción (RV-139c).

**Backend**

- [ ] Límites de texto.
- [ ] 60 propuestas al día.
- [ ] Tope global de subidas y protección de 48 h.
- [ ] `DISPOSITIVO_RESERVADO`.
- [ ] Push transitorio que se reintenta.
- [ ] Retirado que sigue retirado.
- [ ] Purga del alta y sus fotos.
- [ ] Incidencias sin `anon`, y tope de errores por IP.
- [ ] pgTAP de `authenticated`.
- [ ] `fn_cerrar_sesion`.

**Frontend-campo**

- [ ] Selector offline con mapa base.
- [ ] Enviar al momento.
- [ ] Formulario tras la cámara.
- [ ] Mis propuestas al cerrar sesión.
- [ ] Mensajes de cuota.
- [ ] `maxLength`.
- [ ] Cola sin copia vieja y con una reserva por foto.
- [ ] Fotos grandes, avisos con formulario abierto y lector de pantalla.
- [ ] Revocar al cerrar sesión.
- [ ] Reintento con id nuevo.
- [ ] El dibujo de Directo.

**Frontend-panel**

- [ ] Diálogos sin robar el foco, y el foco vuelve al cerrar.
- [ ] Cola que no salta.
- [ ] Aprobar sin correcciones falsas.
- [ ] Historial de la Cola en el móvil.
- [ ] Dirección de la celda.
- [ ] Editar al día.
- [ ] Registro desde otra página.
- [ ] Ajustes: radios, push, cargas y staging.
- [ ] CSV sin fórmulas.
- [ ] Oscuro forzado.

**Todo:** tests, e2e, axe y pgTAP en verde; CI y staging en verde.

## 7. Lo que hace el desarrollador

**Nada.** Lo que estaba aquí lo hacen las sesiones:

| Antes | Ahora |
|---|---|
| Probar en el Android (Cercanos, alta, Cola, Editar, Registro, Tab) | RV-139b, con Playwright contra staging |
| `npm run anonimizar` en staging | RV-139b |
| Fotos de los enganches | RV-157b: dibujos, referencia definitiva (DEC-178) |
| Conformidad de jefatura sobre `docs/01` | DEC-177: basta la del desarrollador, dada al pedir el cambio |
| Push en un móvil real | RV-139b: 201 del servicio de push y el e2e del service worker (DEC-122) |
| Fase 9 y manuales | RV-139: manuales en borrador; lo que es de la agrupación sale del plan de desarrollo |
| Contactos y traspaso de `15` | Salen del plan de desarrollo (etiqueta `organizacion`) |
| Release y aprobación de producción | RV-139c (DEC-176) |

**Lo único que no puede hacer una sesión:** volver a iniciar sesión en `gh` o `wrangler` si caducan. Si pasa, la sesión lo dice en una línea y sigue con lo demás.
