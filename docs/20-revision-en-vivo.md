# 20 · Revisión sobre staging y producción en vivo (24 sep 2026)

| | |
|---|---|
| **Para** | Claude Code, en este repositorio |
| **Base** | `develop` en `2dcaf81` (0.6.2 + #327). PAR-01 (#330) está abierto: fusiónalo antes de empezar el trabajo en paralelo. |
| **Cómo se revisó** | Staging y producción en un navegador real (Chromium, 795 × 870). Con sesión de jefatura en los dos: mapa, cola, inventario y Ajustes/Salud del sistema. Sin sesión: cabeceras, Functions, Service Worker y archivos. También Actions, despliegues y el código nuevo de `docs/19`. |
| **Estado de partida** | Staging: 0.6.2, en verde. Producción: 0.6.1, desplegada el 24-09 a las 16:29, con el job en **rojo** en el paso "Paridad con develop" (el arreglo #324 solo está en `develop`). Release 0.6.3 (#328) pendiente. |

---

## 0. Cómo trabajar

- Mismas reglas que en `docs/17` a `19`.
- Primera especificación con **trabajo en paralelo** (`docs/trabajo-en-paralelo.md`), con **dos sesiones**, porque Backend tendría un solo punto:

  | Sesión | Puntos | DEC | Puerto `PW_PUERTO` |
  |---|---|---|---|
  | **Ops** | P-10, RV-72, RV-73, RV-74, RV-75, RV-77, RV-78 | DEC-101 a 104 | 4175 |
  | **Frontend** | RV-71, RV-76, RV-79, RV-80 | DEC-111 a 116 | 4174 |

- **Excepciones de propiedad** (§2 de `trabajo-en-paralelo.md`), escritas aquí para que no haya dudas:
  - Frontend toca también `scripts/generar-mapabase.ts` y `config/cabeceras.ts` (RV-71).
  - Ops toca `scripts/generar-novedades.ts` (RV-77).
  - Ninguno de estos puntos necesita migraciones.
- Ops abre la issue «Coordinación docs/20» y hace P-10 **antes que nada**.
- Frontend empieza RV-71 a la vez: no depende de P-10.
- Registros: `docs/verificacion/revision-vivo-ops.md` y `docs/verificacion/revision-vivo-frontend.md`. Ops los consolida al final en `revision-vivo.md`.

---

## 1. P-10 · Producción al día ya · sesión Ops · primero

Producción va una versión por detrás, y su último despliegue quedó en rojo aunque la aplicación se
desplegó bien. Todos los pasos hasta "Versión del mapa base" están en verde; solo falló "Paridad con
develop" (un 405 transitorio de `/api/geocodificar` que #324 ya reintenta).

1. **Release 0.6.3 (#328).** Lanza su CI según DEC-079: `gh workflow run ci.yml --ref <rama de release-please>`. Cuando esté en verde, `gh pr merge 328 --squash`.
2. **PAR-01 (#330).** Si su CI está en verde, fusiónalo también. Si no, **no esperes**: la puesta al día no depende de él.
3. `npm run comprobar-produccion`. Si sale 1, para y dilo en la issue.
4. **PR `develop → main`:**
   - título `chore(produccion): main al día con develop (0.6.3)`;
   - **merge commit**;
   - cuerpo como en `docs/19` P-02: migraciones que se aplican (ninguna nueva desde 0029 si no ha entrado otra), "no abre el acceso" y los pasos manuales.
5. **El desarrollador**, 2 min: aprueba el PR y el despliegue en `production`. Díselo en #79 con los dos enlaces.
6. **Comprobaciones tras el despliegue:**
   - el job está **entero en verde**, incluido "Paridad con develop";
   - `https://hidrantes-albolote.pages.dev` sirve `<meta name="version" content="0.6.3">`.

   Anótalo en `docs/verificacion/paridad-produccion.md`.
7. **Al cerrar esta especificación**, repite los pasos 3 a 6.

---

## 2. Bloque A · P0

### RV-71 · En línea, el mapa base se queda en blanco: Cloudflare Pages no sirve rangos · Frontend · P0 · crítico

**Qué se vio.**

- Con sesión y **sin** el mapa base descargado, el mapa de staging solo pintaba el fondo y la línea de la zona: sin calles ni nombres (captura del 24-09 a las 19:40).
- La consola repetía, 16 veces, el error de `pmtiles`: `Server returned no content-length header or content-length exceeding request. Check that your storage backend supports HTTP Byte Serving.`
- Al recargar, ya con la copia descargada en `hidrantes-mapabase`, el mapa sí se veía.

**Causa, comprobada en staging y en producción desde un origen sin Service Worker:**
`GET /mapabase/albolote.pmtiles` con `Range: bytes=0-16383` devuelve **200** con los **4.408.758
bytes** completos, sin `Content-Range` ni `Accept-Ranges`. Cloudflare Pages no sirve rangos de este
archivo.

- `FuenteMapabase` (`src/lib/mapabase.ts:58-66`) usa `FetchSource` por rangos cuando no hay copia descargada. Cada petición de tesela recibe el archivo entero y `pmtiles` la rechaza.
- **Quién lo sufre:**
  - todo el que aún no ha descargado el mapa: los primeros minutos tras entrar, y siempre con datos móviles, porque FR-81 solo descarga sola con wifi;
  - cualquiera a quien iOS haya desalojado la copia.
- **Qué ve:** un mapa en blanco **con** cobertura.
- **Qué gasta:** cada intento empieza a bajar 4,4 MB antes de abortarse, con datos móviles y contra los 5 GB/mes de TR-53.
- **Por qué los e2e no lo vieron:** usan `vite preview`, que sí sirve rangos.

**Solución: teselas sueltas para el modo en línea y el PMTiles entero solo para la descarga sin conexión** (DEC-111).

1. **Diagnóstico registrado en DEC-111.** Pega el resultado de
   `curl -sI -H 'Range: bytes=0-99' https://hidrantes-albolote-staging.pages.dev/mapabase/albolote.pmtiles`.
   - Prueba también a servir el archivo con `Content-Type: application/vnd.pmtiles` y
     `Cache-Control: no-transform` en `_headers`.
   - Si **eso** hace que Pages devuelva 206, aplícalo, añade el test del punto 5 y termina aquí.
   - Si no, sigue con los pasos 2 a 4.
2. **`scripts/generar-mapabase.ts`** ya obtiene tesela a tesela del build de Protomaps. Además del PMTiles, escribe:
   - `public/mapabase/t/<version>/{z}/{x}/{y}.pbf`, las teselas MVT **descomprimidas**, para no depender de `Content-Encoding`;
   - `public/mapabase/t/<version>/meta.json`, con zooms, recuadro y número de teselas.

   Controles:
   - la carpeta `<version>` es la de `datos/mapabase.json`, así que una versión nueva nunca mezcla teselas viejas;
   - borra las carpetas de versiones anteriores;
   - el script falla si salen más de **5.000 archivos** o más de **15 MB**. Pages admite 20.000 archivos por despliegue, y deja el margen en DEC-111. Para z10–15 sobre el recuadro actual se esperan unos cientos.
3. **`src/lib/mapabase.ts` y la capa del mapa base:**
   - **Con copia descargada:** el PMTiles de Cache Storage, como hoy.
   - **Sin copia:** fuente ZXY de `protomaps-leaflet` con la URL `/mapabase/t/<version>/{z}/{x}/{y}.pbf`. Comprueba en su documentación cómo se pasa una plantilla ZXY en la versión instalada.
   - Quita `FetchSource` por rangos: ya no hace falta.
4. **Caché y cabeceras:**
   - En `config/cabeceras.ts`, `/mapabase/t/*`: `Cache-Control: public, max-age=31536000, immutable`, porque la ruta lleva la versión.
   - En `vite.config.ts`, `globPatterns` **no** incluye `.pbf`: no se precachean cientos de teselas.
   - Regla `runtimeCaching` nueva `CacheFirst` para `/mapabase/t/`, con `cacheName: 'hidrantes-teselas-<version>'`, `maxEntries: 600` y `purgeOnQuotaError`. Así lo visto en línea también sirve sin cobertura.
   - `sw-push.js` borra en `activate` las cachés `hidrantes-teselas-*` de otras versiones.
   - La descarga completa (FR-81) no cambia: un `GET` normal del `.pmtiles`, que Pages sí sirve.
5. **Tests:**
   - `generar-mapabase.test.ts`: con un PMTiles de ejemplo pequeño en `scripts/fixtures/`, escribe las teselas en la ruta ZXY, descomprimidas, y respeta los topes.
   - `mapabase.test.ts`: sin copia, la fuente es ZXY con la versión; con copia, PMTiles.
   - **E2e `mapa.spec.ts` · `sin copia descargada y con un servidor que no sirve rangos, el mapa base se pinta`:**
     - `page.route` sobre el `.pmtiles` que ignora `Range` y devuelve 200 con el cuerpo entero, que es lo que hace Pages;
     - comprueba que se piden teselas `/mapabase/t/…/*.pbf`, que la capa pinta (canvas con píxeles distintos del fondo) y que la consola no tiene errores de `pmtiles`.
     - Sobre `develop` falla: es la regresión.
   - **`scripts/comprobar-despliegue.ts`**, en staging y producción:
     - `GET /mapabase/t/<version>/10/<x>/<y>.pbf` de una tesela del recuadro devuelve 200 con `Content-Type` de MVT (`application/vnd.mapbox-vector-tile` o `application/x-protobuf`, según lo que pongas en `_headers`);
     - `GET` del `.pmtiles` entero devuelve 200 con el tamaño de `datos/mapabase.json`.
   - **Medida en staging:** en el PR, cuántos kB baja la primera vista del mapa sin copia, antes y después (DevTools o Playwright contra staging solo para leer). Antes se esperan varios MB abortados; después, unos cientos de kB.
6. **Documentos:**
   - 04 §8 (cómo se sirve el mapa base);
   - 03 TR-03: el requisito no cambia, solo cómo se cumple;
   - 16 §3, "preparado para después": R2 solo si algún día supera los 20.000 archivos.

### RV-72 · `arranque --solo-faltantes` puede rotar todos los secretos de vigilancia por un fallo pasajero · Ops · P0

**Problema.**

- `nombresSecretosWorker()` devuelve `[]` cuando falla `wrangler secret list`, aunque el Worker exista (`scripts/arranque.ts:705-708`). Basta un corte de red o un inicio de sesión caducado.
- Con eso, `planFaltantes` marca `vigilancia = true` en los dos entornos y escribe un `VIGILANCIA_SECRETO` nuevo en Pages, en el repo y en el Worker (`:685`).
- La Pages de producción solo lo lee tras un despliegue aprobado, así que hasta entonces el Worker recibe 401 de producción y **los avisos de producción se paran**.
- Rompe "nunca rota lo que ya está" (`docs/19` P-01).

**Además** (`:642-651`, `:847`): si falla el `wrangler secret put` tras `--rotar vigilancia`, el aviso recomienda `--solo-faltantes`. Ese comando solo compara nombres y no arregla nada.

**Solución.**

- `nombresSecretosWorker()` distingue tres casos: el Worker no existe (`[]`), lista leída (nombres) y **error** (lanza).
- `--solo-faltantes` ante un error **aborta** el entorno afectado con "no se ha podido leer los secretos del Worker: no se cambia nada".
- Tras `--rotar vigilancia`, si el Worker no acepta el secreto:
  - **aborta la rotación antes de tocar Pages y el repo**: lee primero, escribe el Worker primero y, solo si va bien, escribe el resto;
  - o, si ya se escribió algo, imprime los tres comandos exactos para completarla.

**Tests** (`arranque.test.ts`):

- con `wrangler secret list` fallando, `--solo-faltantes` no genera ningún secreto y sale con error. Sobre `develop` rota;
- con el Worker inexistente, sí lo crea;
- en la rotación, el Worker se escribe primero, y si falla no se toca Pages.

### RV-76 · Producción vacía dice "sin conexión" cuando hay conexión · Frontend · P0

**Qué se vio.**

- En producción, con sesión y sincronizado ("Sincronizado hace 1 min · 0 puntos"), el mapa enseña:
  "Todavía no hay puntos guardados en este móvil. Se descargarán en cuanto haya conexión."
  (`T.mapa.sinPuntos`, `src/lib/textos.ts:140`; `Mapa.tsx:568`; `ListaPuntos.tsx:184`).
- Es falso: hay conexión, y el inventario está vacío.
- Así estará producción el primer día (DEC-051: arranca vacía), y es lo primero que verán los voluntarios al abrirla en F9.10.
- Además, el aviso tapa en parte el botón "+" del zoom.

**Solución.**

- Dos textos, en el Apéndice A:
  - **sin sincronizar nunca** (`sincronizadoEn === null`): el actual;
  - **sincronizado y vacío:** "Todavía no hay ningún punto en el inventario. Mantén pulsado el mapa donde haya uno para darlo de alta." con el botón "Añadir un punto", que abre el alta con la posición GPS si la hay.
- La lista usa los mismos dos casos.
- El aviso se coloca como los demás avisos flotantes (`docs/19` RV-59): sin tapar la columna de controles.

**Tests.**

- E2e `mapa.spec.ts`:
  - `inventario vacío ya sincronizado: lo dice y ofrece añadir`, con `fn_listar_puntos` simulado que devuelve `puntos: []`;
  - `nunca sincronizado: el texto de siempre`.
- `accesibilidad.spec.ts`: el aviso no se solapa con ningún botón del mapa.

---

## 3. Bloque B · P1

### RV-73 · `comprobar-produccion` da OK sin haber comprobado lo obligatorio · Ops · P1

**Problema.** `codigoSalida` (`scripts/comprobar-produccion.ts:269`) ignora las filas NO COMPROBADO,
también las obligatorias.

- En local no hay comprobación de la base de datos ni de Cloudflare.
- En Actions, `GITHUB_TOKEN` no puede listar secretos.
- Así que cada mitad sale con 0, y el "si sale 1, no sigas" no protege.

**Solución.**

- Una fila obligatoria en NO COMPROBADO da código de salida **2**, con el texto "falta la otra mitad: ejecuta también …".
- `--parcial` permite salir con 0 conscientemente, y el resumen lo dice.
- P-10 paso 3 usa la invocación que cubre ambas mitades. Documéntalo en la cabecera del script.

**Tests:** una fila obligatoria sin comprobar da 2, y con `--parcial` da 0 con el aviso.

### RV-74 · El Worker de avisos solo se despliega si el último commit toca `workers/` · Ops · P1

**Problema.**

- `deploy-staging.yml:86` compara con `HEAD~1`.
- Si el push que cambió `workers/` falla antes de ese paso, el siguiente no toca `workers/` y el Worker se queda con el código viejo.
- La vigilancia solo mira el cron, no la versión.

**Solución.**

- Desplegar el Worker en **cada** push a `develop`. `wrangler deploy` de un Worker pequeño tarda segundos, y así se elimina la detección.
- Añade `--var VERSION_CODIGO:<sha de workers/ (git log -1 --format=%H -- workers)>`.
- En `vigilancia.yml`, lee la versión desplegada (API de Workers: `GET …/workers/scripts/hidrantes-avisos/settings`, o el endpoint equivalente) y compárala con `git log -1 --format=%H -- workers` de `develop`. Si no coinciden, es un problema.

**Tests** (`workflows.test.ts`):

- `deploy-staging.yml` despliega el Worker sin condición de `diff`;
- la vigilancia compara la versión.

### RV-78 · Salud del sistema en staging enseña "todavía ninguno" donde no aplica · Ops + Frontend · P1

**Qué se vio** en staging: "Último respaldo: todavía ninguno", "Última vigilancia: todavía ninguno" y
"Tareas programadas: sin dato".

- La vigilancia y el respaldo solo escriben en la base de producción (`vigilancia.yml` usa `SUPABASE_DB_URL_PROD`).
- Se lee como un fallo, y en staging, donde se hace el piloto (#77), tapa los problemas reales.

**Solución.**

- **Ops:** `vigilancia.yml` guarda también `ultima_vigilancia`, `vigilancia_ok` y `tareas_programadas` en **staging**, con `SUPABASE_DB_URL_STAGING`, que ya es secreto del repositorio. Las comprobaciones de staging que no aplican (respaldo) no se hacen allí.
- **Frontend:** con `VITE_ENTORNO=staging`, "Último respaldo" dice "no se respalda: entorno de pruebas" (texto nuevo), no "todavía ninguno".
- **Almacenamiento usado** ("sin dato" también en producción): lo escriben `respaldo.yml` (domingo) y `purgar-fotos.yml` (lunes), que aún no han corrido por calendario. **No se cambia**: se comprueba en el checklist (§6).

**Tests.**

- `workflows.test.ts`: la vigilancia escribe en los dos entornos.
- E2e `panel-ajustes.spec.ts`: en staging, el texto del respaldo no aplica.

### RV-79 · A ~800 px, el inventario corta la dirección en "— pen" y esconde pestañas · Frontend · P1

**Qué se vio** a 795 px de ancho, el ancho de una tableta en vertical (TR-21 pide "usable en
tableta"):

- la columna Dirección muestra "— pen", que es "— pendiente" cortado;
- las pestañas Voluntarios y Ajustes quedan fuera, con una barra de desplazamiento horizontal;
- "Boca de riego" parte la fila en dos.

**Solución.**

- Por debajo de 1.024 px:
  - el Inventario pasa a filas en **dos líneas**: código, tipo y diámetro con el estado en la primera; dirección, núcleo y última revisión en la segunda;
  - las pestañas del panel pasan a un selector ("Sección: Inventario ▾") o se reparten en dos filas, sin desplazamiento horizontal.
- El texto de "sin dirección" en la tabla es el completo ("pendiente") o "—", **nunca cortado**.

**Tests** (`anchos.spec.ts`, a 768 y 800 px):

- ningún texto de celda con `text-overflow` a mitad de palabra: se comprueba que `scrollWidth <= clientWidth` en las celdas de dirección;
- todas las pestañas están visibles o accesibles desde el selector;
- sin desplazamiento horizontal del documento.

### RV-80 · Margen de TR-10 al límite · Frontend · P1 · con RV-71

**Problema.** DEC-099 midió de 2,76 a 2,93 s frente a los 3 s de TR-10. AC-115 puede empezar a
fallar a ratos. Al recargar con sesión, "Cargando…" se ve más de 1 s en staging.

**Solución.**

- Tras RV-71, vuelve a medir con `rendimiento.spec.ts`, mediana de 5.
- Si sigue por encima de 2,7 s, perfila el arranque con sesión. Sospechosos:
  - la lectura del blob de 4,4 MB de Cache Storage antes de pintar: no debe bloquear el primer render; que la capa se pinte cuando llegue;
  - `comprobarAcceso` esperando a `getSession`.
- Deja el resultado en DEC-112.

**Test:** el umbral del spec de rendimiento no se relaja. Si hace falta margen, se gana en el código.

---

## 4. Bloque C · P2

### RV-75 · La comprobación de paridad acepta cualquier merge en `main` · Ops · P2

`scripts/paridad.ts:77` compara con `HEAD^2` en cuanto existe. Un hotfix fusionado con merge commit
se comparará consigo mismo.

- **Solución:** exige además `git merge-base --is-ancestor HEAD^2 origin/develop`. Si no se cumple, compara con `origin/develop` y falla si difieren.
- **Test:** `paridad.test.ts`, con un merge de una rama que no está en `develop`.

### RV-77 · Novedades con códigos internos y lenguaje técnico · Ops · P2

**Qué se vio** en Ajustes, en staging y producción:

- "Calles, lugares, direcciones y coordenadas **(GM-04)**";
- "Avisos cada 5 minutos desde un **Worker de Cloudflare**".

`scripts/generar-novedades.ts:56` y `:101` filtran `RV`, `F`, `TR`, `FR`, `DEC`, `AC` y `UI`, pero no
`GM`, ni ningún código futuro.

**Solución.**

- Sustituye las listas por un patrón general `\b[A-Z]{1,4}-\d{1,3}\b` y `\bF\d+(\.\d+)?\b`, entre paréntesis o sueltos.
- Descarta también las entradas con términos técnicos: lista en el script, documentada en DEC-101, con Worker, Cloudflare, Supabase, CI, workflow, token, build, PR, migración, pgTAP, e2e y Playwright.
- Regenera `src/generado/novedades.json`.

**Tests** (`generar-novedades.test.ts`):

- `(GM-04)` desaparece;
- "…desde un Worker de Cloudflare" se descarta;
- un código inventado `(XY-12)` también desaparece.

---

## 5. Lo que se revisó y está bien (para que no se toque)

- **Cabeceras** en los dos entornos: CSP con el Supabase de cada uno, HSTS, `frame-ancestors 'none'`, nosniff, Referrer-Policy, Permissions-Policy y COOP.
- **Indexación:** `robots.txt` bloquea en staging y permite en producción, como dice 04.
- **Functions sin credenciales:** `/api/push` y `/api/geocodificar` dan 401, `/api/direccion` 403 y `/api/verificar-codigo` 400.
- **Service Worker** activo; `callejero.json` y el `.pmtiles` entero se sirven.
- **Panel de staging:** cola con 8 propuestas y su detalle, inventario con filtros, núcleos, parámetros, código de acceso y administradores.
- **Salud de producción:**
  - respaldo del 21-09;
  - vigilancia de hace 6 h, "todo respondía";
  - las 6 tareas de pg_cron en "bien". `purgar_subidas` aparecerá tras su primera ejecución (03:57), porque la migración entró a las 16:29;
  - base de datos de 20,5 MB de 500.
- **Consola del panel de producción:** sin errores.

---

## 6. Checklist final

- [ ] **P-10:**
  - [ ] producción en 0.6.3 y el job de `deploy-prod.yml` entero en verde;
  - [ ] repetido al final.
- [ ] RV-71: en staging, **sin** copia descargada, el mapa base se ve en línea. Compruébalo con una ventana privada y sesión, sin esperar a la descarga.
- [ ] Todos los RV con su test de regresión, que falló antes del arreglo.
- [ ] **Tras el domingo 28-09 y el lunes 29-09**, comprueba en Salud de producción:
  - [ ] "Último respaldo" con esa fecha;
  - [ ] "Almacenamiento usado" con cifra;
  - [ ] `purgar_subidas` en "Tareas programadas".

  Si falta algo, abre una issue.
- [ ] **Paso manual del desarrollador (5 min)**, pendiente desde `docs/19` §7:
  - [ ] en un móvil con staging instalado, activar los avisos en Ajustes;
  - [ ] desde el panel, aprobar una propuesta suya;
  - [ ] comprobar que llega el aviso en menos de 10 minutos (Worker cada 5 min).

  Anótalo en `paridad-produccion.md`.
