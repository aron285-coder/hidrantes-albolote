# Trabajo en paralelo con varias sesiones de Claude Code

| | |
|---|---|
| **Para** | Claude Code y el desarrollador, al ejecutar una especificación de cambios grande (`docs/17`, `18`, `19` y las siguientes) |
| **Estado** | vigente desde el 24 sep 2026 (DEC-100) |
| **Por qué** | Las tres últimas especificaciones tardaron horas. En `docs/18`, el trabajo real fue de unas 6 h, más unas 9 h de sesión parada (de 23:34 a 08:51). Además hubo 24 PR en serie, cada uno con unos 10 min de CI: `ci-e2e` tarda de 8 a 10 min y el resto no llega a 4. |
| **Objetivo** | Menos de la mitad del tiempo de reloj por especificación, sin perder ninguna de las garantías: test de regresión por punto, CI verde, documentos al día y producción con aprobación del desarrollador. |

Este documento **no cambia** las reglas de CLAUDE.md §3 ni la definición de terminado. Cambia cómo
se reparte el trabajo. Si una especificación dice otra cosa sobre el reparto, manda la
especificación.

---

## 1. Cuándo se usa

- **Tres sesiones:** una especificación con 8 o más puntos que tocan a la vez base de datos o
  scripts, pantallas y CI o infraestructura.
- **Una sola sesión:** especificaciones pequeñas, o de una sola área. Aplica igualmente §6 (paquetes)
  y §7 (autonomía).

Antes de la primera especificación en paralelo hay que fusionar **PAR-01** (§9), que prepara el CI y
los puertos. Hasta entonces, trabaja con una sola sesión.

---

## 2. Las tres sesiones y lo que es de cada una

Cada sesión es **dueña exclusiva** de sus rutas. Solo el dueño las modifica. Si otra sesión necesita
un cambio ahí, lo pide en la issue de coordinación (§5), y el dueño lo hace en su siguiente paquete
o en un PR pequeño aparte.

| Sesión | Carpeta de trabajo | Es dueña de | Supabase local |
|---|---|---|---|
| **Ops** | `..\hidrantes-ops` | `.github/**`, `workers/**`, `playwright.config.ts`, `vite.config.ts`, `package.json` (scripts), `scripts/arranque.ts`, `scripts/comprobar-*.ts`, `scripts/paridad.ts`, `scripts/workflows.test.ts`, `CLAUDE.md`, `docs/04`, `docs/entornos.md`. **Solo Ops abre PR `develop → main`.** | no |
| **Backend** | `..\hidrantes-backend` | `supabase/**` (migraciones, pgTAP, seed y config), `functions/**`, el resto de `scripts/**`, `e2e/integracion/**`, `docs/05`, `docs/11`, `docs/15` | **sí, es la única** |
| **Frontend** | `..\hidrantes-frontend` | `src/**` (incluido `src/lib/textos.ts`), `e2e/**` salvo `e2e/integracion/**`, `public/**`, `config/cache-fotos.ts`, `docs/06`, `07`, `08`, `01` y `02` (solo con permiso de la especificación, porque están congelados) | no; e2e con Supabase simulado (`simularRpc`) |

### Archivos compartidos, solo añadiendo al final

`docs/12-decisiones.md`, `docs/09` §8, `docs/10`, `docs/INDICE.md`:

- cada sesión solo añade sus filas o entradas;
- nunca reescribe las de otra;
- en un conflicto al rebasar, se conservan las dos partes en orden numérico.

`CHANGELOG.md` y `src/generado/novedades.json` los escribe solo release-please o su script. No se
editan a mano.

---

## 3. Numeración sin choques

1. **Migraciones.** Solo las crea la sesión **Backend**.
   - `migrar.ts` aborta si una migración pendiente es anterior a la última aplicada
     (`planificar()`, "es anterior a la última aplicada"). Por eso **no** se pueden repartir rangos
     entre sesiones: si se fusionara `0035` antes que `0030`, staging rechazaría `0030`.
   - Si Frontend u Ops necesitan SQL, lo piden en la issue de coordinación.
   - Backend toma el siguiente número libre **justo antes de fusionar**. Rebasa sobre `develop` y
     renombra si otro PR suyo entró antes.
   - La comprobación de PAR-01 (§9.4) lo garantiza en CI.
2. **Decisiones (`DEC-nnn`).** Cada especificación reparte rangos por sesión en su §0. Si no lo hace:
   - Ops: las 6 primeras libres;
   - Backend: las 6 siguientes;
   - Frontend: las 6 siguientes.

   Un número sin usar se queda sin usar; no hace falta que la serie sea continua. Tras `docs/19`, la
   última es **DEC-099** (la pantalla de entrada sin el mapa), así que para la próxima especificación
   sería: Ops **DEC-100 a 105** (DEC-100 es este documento), Backend **DEC-106 a 111** y Frontend
   **DEC-112 a 117**.
3. **Tests pgTAP (`supabase/tests/NN_*.test.sql`).** Solo Backend, siguiente número libre (hoy 27).
4. **Textos de interfaz.** Solo Frontend toca `textos.ts` y el Apéndice A. Si Backend u Ops necesitan
   un texto nuevo, Frontend lo añade (§5).

---

## 4. Puesta en marcha (una vez por especificación)

Desde `C:\Proteccion civil\hidrantes-albolote`, en PowerShell:

```powershell
git fetch origin
git worktree add ..\hidrantes-ops      --detach origin/develop
git worktree add ..\hidrantes-backend  --detach origin/develop
git worktree add ..\hidrantes-frontend --detach origin/develop
Copy-Item .env.local, .dev.vars ..\hidrantes-backend\   # solo Backend usa la pila local
foreach ($d in 'ops','backend','frontend') { Push-Location ..\hidrantes-$d; npm ci; Pop-Location }
```

- **`--detach`**: `develop` ya está abierta en la carpeta principal y Git no deja abrir la misma rama
  dos veces. Cada paquete crea su propia rama con
  `git switch -c fase-N/<ops|be|fe>-<paquete> origin/develop`.
- **Puertos por sesión** (necesita PAR-01):

  | Sesión | `PW_PUERTO` (vite preview de los e2e) | Vite dev | Otros |
  |---|---|---|---|
  | Backend | 4173 | 5173 | Supabase 55420–55429, Pages Functions 8788 |
  | Frontend | 4174 | 5174 | — |
  | Ops | 4175 | 5175 | `wrangler dev` del Worker en 8787 |

  Sin puertos distintos, `reuseExistingServer` haría que los e2e de una sesión probaran el build de
  otra. Pasaría **sin error**.
- Al terminar la especificación: `git worktree remove ..\hidrantes-<sesión>` para cada una.
  `.env.local` y `.dev.vars` de las copias se borran con la carpeta.

**Frase de arranque para cada sesión** (el desarrollador la pega en una Claude Code distinta, abierta
en su carpeta):

> Lee CLAUDE.md, `docs/trabajo-en-paralelo.md` y `docs/NN-….md`. Eres la sesión **Ops** (o
> **Backend**, o **Frontend**). Usa `PW_PUERTO=4175` (4173 o 4174). Ejecuta solo los paquetes de tu
> sesión, en el orden de la especificación. Coordínate por la issue «Coordinación docs/NN». No hagas
> preguntas intermedias: decide lo de bajo riesgo, anótalo en 12 con tus números y sigue.

---

## 5. Coordinación entre sesiones

Las sesiones no comparten memoria. La única fuente común es **una issue de GitHub por
especificación**, «Coordinación docs/NN», que abre la sesión Ops al empezar. Contiene:

- una lista de casillas con todos los paquetes (§6), cada uno con su sesión y sus dependencias;
- las peticiones entre sesiones ("Backend → Frontend: texto para `PUNTO_OCUPADO`"), cada una como una
  casilla más.

Cada sesión:

- **antes de empezar un paquete** con dependencias, comprueba en la issue y con
  `gh pr list --state merged --search "<paquete>"` que lo que necesita ya está en `develop`. Si no,
  pasa a otro paquete suyo sin dependencias, y **no espera** sin hacer nada;
- **al fusionar** un paquete, marca su casilla y comenta una línea: qué entró, qué PR y si deja algo
  pedido a otra sesión. La issue del paquete se cierra sola si el PR dice `Closes #N` (en inglés: es
  la palabra clave de GitHub, DEC-141). Las casillas de la issue de coordinación se marcan a mano;
- **al acabar todo lo suyo**, escribe su registro `docs/verificacion/<especificación>-<sesión>.md` y
  lo comenta en la issue.

**Ops**, además:

- hace las sincronizaciones con producción (PR `develop → main`) en los puntos que marque la
  especificación, y siempre al final;
- consolida los tres registros en el de la especificación;
- cierra la issue de coordinación a mano, con un comentario: no la cierra ningún PR.

---

## 6. Paquetes: menos PR, las mismas garantías

- Un **paquete** agrupa de 3 a 6 puntos (`RV-nn`) de la misma sesión y de la misma zona del código,
  en **una issue y un PR**.
- Cada punto sigue necesitando su test de regresión, que falla sobre `develop` antes del arreglo. El
  PR los enumera por punto.
- La especificación propone los paquetes. Si no lo hace, cada sesión agrupa sus puntos por
  prioridad (primero los P0) y por archivo.
- **Fusión automática:** abre el PR y ejecuta `gh pr merge --auto --squash`. No esperes al CI:
  empieza el siguiente paquete.
- Si el CI falla, arréglalo en esa misma rama antes de seguir con otra cosa.
- Si `develop` avanzó y hay conflicto, rebasa: `git rebase origin/develop` y
  `git push --force-with-lease` **solo en tu rama** (CLAUDE.md §6).
- **Pruebas locales durante el paquete:**
  - `npx vitest related <archivos tocados>`;
  - `npx playwright test <specs tocados>`;
  - `npm run test:sql`, solo en Backend.

  Una vez antes de abrir el PR, `npm run typecheck && npm run lint && npm test`. La batería completa
  la pasa el CI.

---

## 7. Autonomía, sin horas perdidas

- **Sin preguntas intermedias:**
  - lo de bajo riesgo se decide y se anota en 12 con los números de la sesión;
  - lo que exige al desarrollador (aprobaciones, un permiso de un token) se escribe en la issue de
    coordinación con el paso exacto y su tiempo, y **se sigue con otro paquete**;
  - las preguntas de verdad se juntan en **un solo comentario** al final de cada sesión.
- **Permisos de la herramienta:** el desarrollador arranca cada sesión en un modo que no pida
  confirmación por cada comando. Las garantías están en el CI, la protección de ramas y la aprobación
  del environment `production`, no en pulsar "sí" cien veces.
- **Si una sesión se para** (límite de uso, error de la herramienta), al retomarla lee la issue de
  coordinación y `git status` de su carpeta, y sigue donde lo dejó. No empieza de nuevo.

---

## 8. Producción

Solo **Ops** abre el PR `develop → main` (DEC-096). Lo hace cuando las tres sesiones han marcado en
la issue que su bloque P0 está fusionado, y otra vez al final. Backend y Frontend nunca tocan `main`.

---

## 9. PAR-01 · Preparar el CI y los puertos · un PR de la sesión Ops, antes de trabajar en paralelo

### 9.1 Puertos configurables

`playwright.config.ts`:

- `const PUERTO = Number(process.env.PW_PUERTO ?? 4173)`;
- úsalo en `baseURL`, en el `--port` del `webServer.command` y en `webServer.url`.

`vite.config.ts` (`server.port`): `Number(process.env.VITE_PUERTO ?? 5173)`.

Test en `scripts/workflows.test.ts`, o uno nuevo: `playwright.config.ts` no contiene el literal
`4173` fuera de ese valor por defecto.

### 9.2 `ci-e2e` en tres partes

Hoy es un solo job de 8 a 10 min.

1. **Job `cambios`** (menos de 20 s): calcula si el PR toca código con
   `git diff --name-only origin/${{ github.base_ref }}...HEAD`. Da `codigo=false` si **todo** lo
   cambiado está bajo `docs/` o es `*.md` fuera de `src/`, y `codigo=true` en otro caso. En `push` a
   `develop` o `main`, siempre `codigo=true`.
2. **Job `ci-e2e-parte`:**
   - `needs: cambios`, `if: needs.cambios.outputs.codigo == 'true'`;
   - `strategy.matrix.parte: [1, 2, 3]`, `fail-fast: false`;
   - `npx playwright test --grep-invert @rendimiento --shard=${{ matrix.parte }}/3`.
   - **Caché de navegadores:** `actions/cache` sobre `~/.cache/ms-playwright`, con la versión de
     `@playwright/test` de `package-lock.json` como clave. Con acierto,
     `npx playwright install-deps chromium firefox`; sin acierto, `install --with-deps`.
   - Sube `playwright-report-${{ matrix.parte }}` si falla.
3. **Job `ci-e2e-rendimiento`:** mismo `if`,
   `npx playwright test --grep @rendimiento --workers=1`, igual que hoy.
4. **Job agregador `ci-e2e`**, que **conserva el nombre del check obligatorio**
   (`arranque.ts:43`, `CHECKS_OBLIGATORIOS`), así que la protección de ramas no cambia:
   - `needs: [cambios, ci-e2e-parte, ci-e2e-rendimiento]` e `if: always()`;
   - falla si algún `needs.*.result` es `failure` o `cancelled`;
   - acepta `success` y `skipped`.
5. **`ci-sql`:** con el mismo `if` que las partes. GitHub cuenta un job saltado por su `if` como
   correcto para los checks obligatorios. Compruébalo en el propio PR con un commit que solo toque
   `docs/`, y anótalo en DEC-100.
6. **`ci-calidad`** corre siempre, porque es rápido.

**Objetivo medible**, anotado en DEC-100 con la duración antes y después (API de Actions, mediana de
5 ejecuciones):

- PR de código: ≤ 5 min de reloj;
- PR solo de documentación: ≤ 2 min.

### 9.3 Test de los workflows

En `scripts/workflows.test.ts`:

- los nombres de job que coinciden con `CHECKS_OBLIGATORIOS` existen en `ci.yml`;
- el agregador `ci-e2e` tiene `if: always()` y `needs` a las partes;
- la matriz tiene 3 partes y cada una usa `--shard`.

### 9.4 Migraciones que llegan en orden

Script nuevo `scripts/comprobar-migraciones-nuevas.ts`, que se ejecuta en `ci-calidad` solo en
`pull_request`:

- Toma las migraciones **añadidas** por el PR:
  `git diff --name-only --diff-filter=A origin/${{ github.base_ref }}...HEAD -- supabase/migrations`.
- Falla si alguna tiene un número menor o igual que la mayor de la rama base, con el mensaje
  "renumera a NNNN: develop ya tiene hasta MMMM".
- Falla si el PR **modifica o borra** una migración existente (`--diff-filter=MD`). Es la regla de
  CLAUDE.md §3, ahora comprobada en CI.

Tests en `scripts/comprobar-migraciones-nuevas.test.ts`, con listas simuladas:

- una nueva mayor pasa;
- una nueva menor o igual falla;
- una modificada falla;
- un PR sin migraciones pasa.

### 9.5 CLAUDE.md §5

Añade, al final del punto 5, esta frase: "Especificaciones grandes: tres sesiones en paralelo según
`docs/trabajo-en-paralelo.md` (DEC-100)." Añade este documento a `docs/INDICE.md`.

### 9.6 Terminado cuando

- CI en verde en el propio PR, y en un segundo PR solo de `docs/` que salta e2e y SQL y aun así se
  puede fusionar.
- La duración medida está en DEC-100.
