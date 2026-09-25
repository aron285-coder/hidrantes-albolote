# 22 · Lo pendiente de docs/21 y el mantenimiento que falta (25 sep 2026)

| | |
|---|---|
| **Para** | Claude Code, en este repositorio. Tres sesiones en paralelo según `docs/trabajo-en-paralelo.md`. |
| **Base** | `develop` en `082d7c4`. Producción en 0.6.3 con la paridad en verde. |
| **Estado de partida** | typecheck y lint en verde, 1.801 tests de vitest (90 archivos), 28 casos de `probar-hooks.ts`, `npm audit` sin vulnerabilidades. CI y los despliegues de staging, en verde desde #349. |
| **Qué cubre** | (1) todo lo que queda abierto de `docs/21`; (2) lo nuevo de la revisión del 25-09: código, CI, workflows programados, Salud del sistema en staging y en producción. |
| **Sustituye** | La issue «Coordinación docs/21» (#354) se cierra al abrir «Coordinación docs/22»: las casillas que quedan pasan a la nueva. |

## 0. Reparto

| Sesión | Puntos | DEC | Migraciones y pgTAP | `PW_PUERTO` |
|---|---|---|---|---|
| **Frontend** | de `docs/21`: RV-81, RV-82, RV-83, RV-85, RV-87, RV-88 · nuevo: RV-92 (pantalla) | de `docs/21`: DEC-122 a 127 · nuevo: DEC-136 a 139 | — | 4174 |
| **Backend** | de `docs/21`: RV-84, RV-86 · nuevo: RV-92 (SQL) | de `docs/21`: DEC-118 a 121 · nuevo: DEC-132 a 135 | `0030` y siguientes; pgTAP desde `27` | 4173 |
| **Ops** | RV-89, RV-90, RV-91, RV-93, RV-94 y P-12 | DEC-128 a 131 | — | 4175 |

**Orden:**

1. **Frontend** empieza ya por **RV-81** y **RV-82** (P0 de `docs/21`). Son lo que el desarrollador
   vio fallar en su Android, y siguen en staging y en producción.
2. **Backend** empieza por **RV-84**; **RV-92** va detrás.
3. **Ops** empieza por **RV-89**, que tiene fecha límite: **19 de octubre**.
4. **P-12** va al final, cuando estén fusionados RV-81, RV-82, RV-84 y RV-92.

**Registros:** cada sesión escribe en `docs/verificacion/pendientes-<sesión>.md`, y Ops los consolida
en `docs/verificacion/pendientes.md`. Ops añade además la fila de `docs/22` en `docs/INDICE.md` y
cambia la de `docs/21` a "sustituida por 22 para lo pendiente".

---

## 1. Lo que queda de docs/21

**Se hace tal cual está en `docs/21`**, con sus mismos números, DEC y tests. No se copia aquí para
que no haya dos versiones del mismo punto. Lo que cambia respecto a `docs/21` es solo lo de la
columna "Ajuste".

| Punto | Sesión | Prio | Dónde | Ajuste |
|---|---|---|---|---|
| RV-81 · activar los avisos falla en silencio | Frontend | P0 | `docs/21` §1 | ninguno |
| RV-82 · controles del mapa y "Cercanos" | Frontend | P0 | `docs/21` §1 | La captura a 412 × 915 del PR se hace con la skill `revisar-pantallas` (ya está en el repo). |
| RV-83 · tocar un aviso lleva a "Mis propuestas" | Frontend | P1 | `docs/21` §1 | ninguno |
| RV-85 · aviso del mapa base tras una versión nueva | Frontend | P2 | `docs/21` §1 | ninguno |
| RV-87 · documentación que no coincide | Frontend | P2 | `docs/21` §1 | ninguno |
| RV-88 · capturas en cada PR de pantallas | Frontend | P2 | `docs/21` §1 | Al fusionarlo, quita de `.claude/skills/revisar-pantallas/SKILL.md` el paso "si `e2e/vistas.spec.ts` aún no existe". |
| RV-84 · el servidor pierde suscripciones buenas | Backend | P1 | `docs/21` §2 | ninguno |
| RV-86 · integración real de la suscripción | Backend | P1 | `docs/21` §2 | ninguno |
| P-11 · producción al día | Ops | — | `docs/21` §3 | Lo sustituye **P-12** de este documento. No se hace dos veces. |

Cada sesión usa en cada paquete la skill `paquete-rv`, y `pr-review-toolkit` y `code-review` antes de
`gh pr merge --auto`.

---

## 2. Ops

### RV-89 · `ubuntu-latest` pasa a Ubuntu 26 el 19 de octubre · P1 · antes del 19-10

**Qué se vio.** Cada ejecución de Actions avisa: *"The ubuntu-latest label will migrate to Ubuntu 26
beginning October 19, 2026"*.

**Por qué importa.** Los 21 trabajos de `.github/workflows/` usan `ubuntu-latest`. La acción
`.github/actions/preparar` instala `postgresql-client-17` con el script de PGDG
(`apt.postgresql.org.sh`), y en una versión de Ubuntu recién salida el repositorio de PGDG puede no
tener todavía paquetes. Si ese paso falla, fallan a la vez:

- `ci-sql`
- el respaldo semanal
- la vigilancia diaria, que además no podría abrir su issue
- la purga de fotos

Es decir, todo lo que avisa cuando algo va mal, justo cuando más falta hace.

**Solución.**

1. **Fija los 21 trabajos en `runs-on: ubuntu-24.04`.** Nada de `ubuntu-latest` en ningún archivo de
   `.github/workflows/`.
2. **Añade un workflow canario** nuevo, `.github/workflows/canario-ubuntu.yml`, con un trabajo
   `canario-ubuntu-26` en `runs-on: ubuntu-26.04`, `workflow_dispatch` y una programación semanal
   (miércoles 05:13 UTC). No va en `mantenimiento.yml`: ese lo despacha jefatura con una entrada
   obligatoria. Hace lo mismo que el
   camino crítico, sin tocar ninguna base de datos:
   - `./.github/actions/preparar` con `psql: 'true'`
   - `psql --version`, `pg_dump --version` y `jq --version`
   - `npm run typecheck && npm test`

   Si falla, abre o comenta la issue «Canario Ubuntu 26 en rojo» con la etiqueta `vigilancia`. Si
   pasa, la cierra.
3. **Añade `canario-ubuntu.yml` a `WORKFLOWS`** en `vigilancia.yml` (los dos sitios) y en
   `mantener-activo.yml`, con el límite de 8 días de los semanales en el `case` de la vigilancia.
4. **Cuándo pasar a Ubuntu 26.** Cuando el canario lleve dos semanas en verde, se pasa todo a
   `ubuntu-26.04` en un PR aparte (no en este) y el canario se retira. Anótalo en DEC-128.
5. **Documentación.** Anota en `docs/15` §4 qué hacer si el canario está en rojo: nada urgente,
   porque los trabajos de verdad siguen en 24.04. Anota también la fecha de fin de soporte de
   `ubuntu-24.04` en Actions, sacada de `actions/runner-images`, y cítala.

**Tests** (en `scripts/workflows.test.ts`):

- Ningún `runs-on` de `.github/workflows/*.yml` es `ubuntu-latest`.
- Todos son `ubuntu-24.04`, salvo `canario-ubuntu-26`.
- `canario-ubuntu.yml` existe, su trabajo usa `ubuntu-26.04` y llama a `preparar` con `psql: 'true'`.
- La lista `WORKFLOWS` de `vigilancia.yml` y la de `mantener-activo.yml` coinciden (el test que ya
  existe) e incluyen `canario-ubuntu.yml`.

**Comprobación.** Lanza el canario a mano (`gh workflow run canario-ubuntu.yml`) y anota el resultado
en el registro de Ops. Si **ya** falla, no es un fallo del PR: es justo lo que queremos saber antes
del 19-10. Anótalo y abre la issue.

### RV-90 · Los tests dejan `tareas-*.json` sueltos en la raíz del repositorio · P2

**Qué se vio.** Después de `npm test` quedan `tareas-produccion.json` y `tareas-staging.json` sin
seguimiento en la raíz. Un `git add -A` los metería en un PR, y el hook de SK-02 no los bloquea.

**Causa.** `.github/scripts/revisar-bd.sh` escribe `tareas-$entorno.json` en el directorio actual, y
`scripts/workflows.test.ts` («revisar_bd…») lo ejecuta con `cwd: raiz`.

**Solución.**

1. **En `revisar-bd.sh`, el archivo va a un directorio temporal:**
   `tareas_json="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/tareas-$entorno.json"`. Usa esa variable en las tres
   líneas que hoy escriben o leen `tareas-$entorno.json`.
2. **En el test**, pasa `RUNNER_TEMP: dir` (el `mkdtempSync` que ya existe) en el `env` de
   `spawnSync`.
3. **Red de seguridad:** añade `tareas-*.json` a `.gitignore`.
4. **En `ci-calidad`**, justo después de `npm test`, un paso que falle si los tests han dejado algo:

   ```yaml
   - name: Los tests no dejan archivos sueltos
     run: |
       sucio=$(git status --porcelain --untracked-files=all)
       if [ -n "$sucio" ]; then echo "::error::Los tests han dejado archivos: $sucio"; exit 1; fi
   ```

**Tests:**

- En `workflows.test.ts`, tras `correr('produccion', BIEN)`, `existsSync(path.join(raiz,
  'tareas-produccion.json'))` es `false`, y el archivo sí existe en el directorio temporal.
- Comprueba que el nuevo paso de CI falla: crea un archivo suelto en una rama de prueba y mira que el
  paso se pone en rojo. Anótalo en el registro y borra la rama.

### RV-91 · Tres huecos en los hooks de SK-02 · P2

Comprobados a mano el 25-09 contra `develop`:

| Caso | Hoy | Debe |
|---|---|---|
| `git push --force origin HEAD` estando en `develop` | pasa (exit 0) | bloquear |
| `cp x.sql supabase/migrations/0001_esquema.sql` (migración ya fusionada) | pasa (exit 0) | bloquear |
| `console.log(` escrito en `public/sw-push.js` o en `workers/**` | pasa | bloquear |

**Solución.**

1. **`sin-force-push.mjs`.** El destino `HEAD`, `@` o un refspec sin nombre de rama se resuelve con
   `git rev-parse --abbrev-ref HEAD` antes de compararlo con `PROTEGIDAS`. Lo mismo para
   `HEAD:refs/heads/main` y `+HEAD`.
2. **`migraciones-aplicadas.mjs`.**
   - Añade a la lista de órdenes que escriben: `cp`, `copy`, `Copy-Item`, `tee`, `install`, `dd`.
   - Añade también `git checkout … -- <ruta>`, `git restore <ruta>` y `git mv`.
   - Para `cp`, `copy`, `Copy-Item` e `install`, el destino es el **último** argumento que no es una
     opción. Bloquea solo si es una migración ya fusionada.
3. **`sin-console-log.mjs`.** `CODIGO` pasa a `/(^|\/)(src|functions|workers|public)\/.*\.(t|j)sx?$/`.
   Hoy no hay ningún `console.log` en `workers/**` ni en `public/**` (comprobado el 25-09), así que no
   rompe nada. `public/mapabase/**` no tiene JS.

**Tests:** en `scripts/probar-hooks.ts`, un caso que bloquea y otro que deja pasar por cada fila de la
tabla:

- `git push --force origin HEAD` en una rama `fase-x/prueba` deja pasar.
- `cp` a una migración nueva que no está en `develop` deja pasar.
- `console.error(` en `workers/` deja pasar.

Todos los casos existentes siguen en verde.

### RV-93 · La vigilancia llega cinco horas tarde · P2

**Qué se vio.** La vigilancia está programada a las 07:41 UTC y GitHub la lanza hacia las 13:00 UTC
(ejecuciones #3, #4, #5 y #7). Durante esas horas:

- Salud del sistema enseña la vigilancia del día anterior.
- La issue #342 sigue abierta horas después del arreglo (#343).

**Solución.**

1. **Dos pasadas al día:** `cron: '41 7 * * *'` y `cron: '41 19 * * *'`. En un repositorio público no
   cuesta minutos (TR-53). El límite de "días sin ejecutarse" de la propia vigilancia no cambia.
2. **En `docs/15` §4:** "GitHub puede retrasar la vigilancia varias horas. Una vigilancia de hace
   menos de 14 h es normal; más de 26 h, no."
3. **Salud del sistema** marca "Última vigilancia" en naranja a partir de 26 h. Hoy no distingue.
   Esto lo hace Frontend dentro de RV-92, con el umbral en `src/lib/panel/ajustes.ts`.
4. **Issue #342:** si la pasada programada del 25-09 no la cierra sola, averigua por qué antes de
   seguir con este punto.

**Test:** en `workflows.test.ts`, `vigilancia.yml` tiene exactamente esas dos líneas `cron`.

### RV-94 · "Almacenamiento usado: sin dato" hasta la primera purga · P2

**Qué se vio.**

- En producción, Salud del sistema dice "Almacenamiento usado: sin dato".
- `purgar-fotos.yml` **no se ha ejecutado nunca**. La primera vez será el lunes 28-09 a las 04:43 UTC,
  y borrará de verdad.
- El paso "Anotar el espacio…" tiene `if: ${{ !inputs.ensayo }}`, así que un ensayo no anota el
  tamaño aunque lo ha medido.

**Solución.**

1. **El ensayo también anota `storage_bytes`.** Con `--ensayo`, el script ya da
   `bytes_restantes = bytesDe(enBucket)`, que es el tamaño real del bucket. Quita la condición del
   paso y anota `actualizado_por = 'purgar-fotos.yml (ensayo)'` cuando sea un ensayo.
2. **Guarda de primera ejecución.** Si `config.ultima_purga_fotos` no existe, la ejecución
   **programada** hace ensayo, aunque no se haya pedido. Escribe en el resumen la lista de lo que
   borraría y abre la issue «Primera purga de fotos: revisa el ensayo» (etiqueta `vigilancia`). Una
   ejecución a mano sin `ensayo`, o la programada de la semana siguiente, ya borra.
3. **Cada pasada que borra de verdad** escribe `config.ultima_purga_fotos` con `to_jsonb(now())`.
   Anótalo en DEC-129.

**Tests:**

- En `workflows.test.ts`, el paso de anotar no tiene `if: … !inputs.ensayo`.
- En `workflows.test.ts`, existe la guarda de primera ejecución y lee `ultima_purga_fotos`.
- `scripts/probar-purga.ts` cubre el caso "primera vez, programada → ensayo".

**Comprobación.** Tras fusionar, lanza `gh workflow run purgar-fotos.yml -f ensayo=true`. Anota en el
registro cuántas fotos hay, cuántas borraría y que Salud del sistema ya enseña el tamaño.

### P-12 · Producción al día al cerrar

Igual que `docs/20` P-10: release, PR `develop → main` con merge commit, las dos aprobaciones del
desarrollador y la paridad en verde. Anótalo en `paridad-produccion.md`. Además:

- Comprueba que el **respaldo programado del domingo 27-09** ha corrido: "Último respaldo" de hace
  menos de 8 días en Salud del sistema de producción, y una ejecución `schedule` en `respaldo.yml`.
  Si no ha corrido, lo primero es arreglar eso.
- Comprueba que la **purga del lunes 28-09** ha dejado su issue de primera ejecución (RV-94) o un
  resultado revisado.

---

## 3. Backend y Frontend: RV-92

### RV-92 · Salud del sistema enseña las tareas programadas de la última vigilancia, no las de ahora · P1

**Qué se vio.** El 25-09 a las 09:30 UTC, en Salud del sistema de producción:

- `purgar_intentos`, que corre **cada hora**, decía "hace 13 h · bien".
- `purgar_subidas` decía "todavía sin ejecutar", aunque le tocaba a las 03:57 UTC.

La causa: `fn_salud()` devuelve `config.tareas_programadas`, que es la foto que tomó la vigilancia la
noche anterior (`guardar-tareas.sql`). Jefatura lee "hace 13 h" y cree que algo no funciona, o lee
"bien" de algo que ya ha fallado.

**Backend.**

1. **Nueva función** `hidrantes.fn_tareas_programadas()`, en la siguiente migración libre:
   - `returns jsonb`, `security definer`, `set search_path = pg_catalog, hidrantes, cron`.
   - Su dueño es `hidrantes_migrador`, el mismo rol que es dueño de las tareas y puede leer
     `cron.job` y `cron.job_run_details` (ver el comentario de `scripts/sql/tareas-programadas.sql`).
   - Hace la misma consulta que `tareas-programadas.sql` (`ultima`, `fallo`, `problema`) **sin**
     `falta`: la lista de esperadas la sigue mirando la vigilancia.
   - `revoke all … from public`. Sin `grant` a `anon` ni a `authenticated`: solo la llama `fn_salud`.
2. **`fn_salud()` con la misma firma** (`create or replace`, 04 §12):
   - `'tareas'` sale de `fn_tareas_programadas()`.
   - Añade `'tareas_origen': 'en_vivo'`.
   - Si la llamada falla (`exception when insufficient_privilege or undefined_table`), devuelve la foto
     de `config.tareas_programadas` con `'tareas_origen': 'vigilancia'` y
     `'tareas_medidas_en': <actualizado_en de esa fila de config>`.
3. **La vigilancia no cambia:** sigue guardando la foto, que es la red de seguridad si `pg_cron` deja
   de dar permisos. Anota la decisión en DEC-132.
4. **`docs/05`** (§ de `fn_salud`) se actualiza **antes** que el SQL. Usa la skill `nueva-migracion`.

**pgTAP** (`supabase/tests/NN_salud_tareas_en_vivo.test.sql`):

- `fn_salud()->'tareas'` tiene una fila por cada tarea `hidrantes_%` de `cron.job`, y
  `tareas_origen = 'en_vivo'`.
- Insertar una fila falsa en `cron.job_run_details` con `status = 'failed'` para una tarea →
  `fallo = true` y `problema = true`.
- `anon` y `authenticated` no pueden ejecutar `fn_tareas_programadas()` (`throws_ok … 42501`).
- `fn_salud()` sigue exigiendo administrador.
- `npm run compatibilidad` en verde.

**Frontend** (después de que Backend fusione; no requiere cambiar la firma):

1. **En la tarjeta "Tareas programadas" del panel, debajo del título:**
   - "Ahora mismo", si `tareas_origen = 'en_vivo'`.
   - "Según la vigilancia de hace 13 h", si viene de la vigilancia, con `tareas_medidas_en` en
     relativo.

   Los textos van en `src/lib/textos.ts` y en el Apéndice A de `docs/06`.
2. **"Última vigilancia"** en tono de aviso (el naranja de `docs/06` §2) si pasa de 26 h (RV-93). El
   umbral va en `src/lib/panel/ajustes.ts` como constante exportada.
3. **Tests:**
   - Vitest de `Ajustes.tsx` con los dos orígenes y con una vigilancia de 27 h.
   - Un caso en `e2e/panel-ajustes.spec.ts` con el mock de `fn_salud` devolviendo `tareas_origen: 'vigilancia'`.
   - Captura con `revisar-pantallas`.

---

## 4. Lo que hace el desarrollador (no Claude Code)

Solo lo puede hacer quien tiene acceso a GitHub y a los dispositivos:

1. **Antes del lunes 28-09:** Actions → «Purgar fotos» → *Run workflow* con **ensayo** marcado. Así la
   primera pasada automática no es la primera vez que corre. Si RV-94 se fusiona antes, basta con
   mirar la issue que abra.
2. **Lunes 28-09:** Salud del sistema de producción: "Último respaldo" debe decir 27 sep. Si no, avisa
   a la sesión Ops.
3. **Tras RV-81 en staging:** repetir en el Android la activación de los avisos y anotar qué dice la
   hoja. Si dice `permiso_bloqueado`: Ajustes de Android → Aplicaciones → la PWA → Notificaciones.
4. **Antes del piloto (F9.2, #77), limpiar staging** para que los voluntarios no vean una cola llena:
   - Cerrar la incidencia abierta.
   - Resolver las 8 propuestas de prueba pendientes (de 5 a 8 días). "Rechazar" con motivo "prueba"
     basta.
5. **P-12:** las dos aprobaciones de producción.

---

## 5. Checklist final

- [ ] RV-81: en el Android del desarrollador, activar los avisos funciona o dice exactamente por qué
      no.
- [ ] RV-82: captura a 412 × 915 en el PR, con los controles alineados al borde y "Cercanos" abajo a
      la derecha.
- [ ] RV-83, RV-85, RV-87 y RV-88 fusionados, con su test.
- [ ] RV-84 y RV-86: pgTAP e integración en verde.
- [ ] Una notificación real llega al Android tras aprobar una propuesta suya en staging.
- [ ] RV-89: ningún `ubuntu-latest`; el canario de Ubuntu 26 ha corrido al menos una vez, **antes
      del 19-10**.
- [ ] RV-90: `npm test` no deja archivos; el paso de CI lo comprueba.
- [ ] RV-91: los tres huecos, bloqueados y con test.
- [ ] RV-92: Salud del sistema de producción enseña `purgar_intentos` de hace menos de 1 h, con
      "Ahora mismo".
- [ ] RV-93: dos pasadas de vigilancia al día; #342 cerrada.
- [ ] RV-94: "Almacenamiento usado" con dato en producción; la primera purga, revisada.
- [ ] P-12: producción en la versión nueva, con la paridad en verde; respaldo del 27-09 comprobado.
