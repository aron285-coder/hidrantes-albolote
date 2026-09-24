# Verificación · Revisión en vivo, sesión Frontend (docs/20)

**Estado: hecho el 24 sep 2026.** Especificación: `docs/20-revision-en-vivo.md`, puntos RV-71, RV-76,
RV-79, RV-80 y la parte Frontend de RV-78. Decisiones: DEC-111, DEC-112 y DEC-113; DEC-114 a 116
quedan sin usar. Coordinación en #332. Ops consolida este registro en `revision-vivo.md`.

## 1. Qué se ha hecho, por punto

| Punto | Issue · PR | Qué | Test de regresión y cómo fallaba sobre `develop` |
|---|---|---|---|
| RV-71 (P0) | #340 · #341, #344 | En línea, teselas sueltas `public/mapabase/t/20260919/{z}/{x}/{y}.pbf` (366, 7,2 MB, sin comprimir) sacadas del PMTiles publicado. `FuenteMapabase` las pide si no hay copia descargada, y si la hay lee el PMTiles de Cache Storage. Caché `CacheFirst` `hidrantes-teselas-<versión>`, que `sw-push.js` limpia. `comprobar-despliegue` mira una tesela y el PMTiles entero (con reintentos desde #344) | e2e `mapa.spec.ts` *sin copia descargada y con un servidor que no sirve rangos, el mapa base se pinta*: 0 teselas pedidas y la capa en blanco. e2e `armazon.spec.ts` *el Service Worker borra las teselas de otras versiones*: la caché vieja seguía. #344: *mientras Pages propaga, reintenta* (no había reintento) |
| RV-76 (P0) | #345 · #346 | Sincronizado y sin puntos: "Todavía no hay ningún punto en el inventario…" y "Añadir un punto", en el mapa y en la lista. El aviso va con los avisos flotantes | e2e `mapa.spec.ts` *inventario vacío ya sincronizado* (decía "Se descargarán en cuanto haya conexión") y *nunca sincronizado*. e2e `accesibilidad.spec.ts` *el aviso de inventario vacío no se solapa con ningún botón del mapa*, en móvil y tableta |
| RV-79 (P1) | #345 · #346 | Por debajo de 1.024 px, el Inventario va en filas de dos líneas (sigue siendo tabla ARIA), el campo de dirección mide al menos 27ch y las pestañas se reparten en dos filas | e2e `anchos.spec.ts` a 768 y 800 px: 12 de 12 direcciones cortadas sobre `develop` |
| RV-78 Frontend (P1) | #345 · #346 | En staging y sin respaldo: "no se respalda: entorno de pruebas" | e2e `panel-ajustes.spec.ts` *en staging, el texto del respaldo no aplica*: decía "todavía ninguno" |
| RV-80 (P1) | #347 · #348 | La porción con sesión se enseña sin `lazy` ni `Suspense`: React 19 dejaba "Cargando…" 300 ms de más | e2e `rendimiento.spec.ts` *con sesión, "Cargando…" no se queda a la vista cuando la porción ya ha llegado*: 342 y 345 ms sobre `develop`, con 250 ms de umbral |

Los cuatro PR de código se fusionaron con el CI entero en verde: `ci-calidad`, las tres partes de
`ci-e2e`, `ci-e2e-rendimiento` y `ci-sql`.

## 2. Medidas

### RV-71 · el mapa base en staging

Diagnóstico del 24-09, 20:06 UTC (DEC-111):

- `curl -sI -H 'Range: bytes=0-99' …/mapabase/albolote.pmtiles` da `200 OK`, `application/octet-stream`, sin `Content-Range` ni `Accept-Ranges`.
- Tras el despliegue, con `Content-Type: application/vnd.pmtiles` y `Cache-Control: no-transform` en `_headers` (paso 1), sigue dando **200 sin `Content-Range`**. La vía de las cabeceras no basta, y las teselas sueltas eran necesarias.

Cabeceras de una tesela en staging:

- `200`, `Content-Type: application/vnd.mapbox-vector-tile`, `Cache-Control: public, max-age=31536000, immutable`.
- Sin `Content-Encoding`, ni siquiera pidiendo gzip o br: Cloudflare no comprime ese tipo.

Primera vista del mapa sin copia descargada. Se midió con Playwright y Chrome contra staging, solo lectura:

- los estáticos vienen de staging;
- la sesión de voluntario y Supabase se simulan en el navegador, así que no llega nada a la base de staging;
- el Service Worker está bloqueado;
- se simulan datos móviles para que el mapa base no se descargue solo;
- se miden 12 s tras cargar.

| | Total | Mapa base | Lienzos del mapa con dibujo | Errores de `pmtiles` |
|---|---|---|---|---|
| Antes (`2dcaf81` + #331) | 393 kB | 0 kB contados: la petición del `.pmtiles` se corta al llegar las cabeceras del 200, y la radio ya ha empezado a bajar 4,4 MB en cada intento | **0 de 12** | **12** |
| Después (`7675e86`, con #341) | 598 kB | **205 kB** (4 teselas de z11) | **12 de 12** | **0** |

La captura de staging (`0f37051`, con #346) enseña calles y nombres. En la misma vista se ven el aviso
de inventario vacío con "Añadir un punto" y la columna de controles libre.

### RV-80 · TR-10

`rendimiento.spec.ts`, móvil emulado y 3G de 03, `--repeat-each=5 --workers=1`, con el mismo umbral de 3 s:

| | Pasadas | Mediana |
|---|---|---|
| Tras RV-71, antes de RV-80 (local) | 2,72 · 2,67 · 2,69 · 2,65 · 2,74 s | 2,69 s |
| Tras RV-80 (local) | 2,44 · 2,45 · 2,42 · 2,42 · 2,45 s | **2,44 s** |
| CI, las 5 ejecuciones antes de RV-80 | 2,50 · 2,61 · 2,50 · 2,60 · 2,85 s | 2,60 s |
| CI del PR de RV-80 (#348) | 2,58 s | — |

- "Cargando…" a la vista, medido cuadro a cuadro: de 342–345 ms a 117–159 ms en local, y 96 ms en CI.
- `npm run presupuesto`: 178,5 kB de JavaScript inicial, igual que antes.

## 3. Suposiciones y límites

- **Sin sesión real en staging.** No había un código de acceso que usar sin credenciales, así que el mapa de staging se comprobó con la sesión y Supabase simulados en el navegador (§2). Queda el paso del checklist de `docs/20` §6 para una persona: *en staging, sin copia descargada, el mapa base se ve en línea, en una ventana privada y con sesión*.
- **El panel a 800 px** se comprobó con los e2e (Supabase simulado). No se miró en staging con sesión de jefatura.
- **Firefox:** el proyecto `panel-firefox` no se puede lanzar en esta máquina, porque falta el navegador de Playwright. Lo pasa el CI.
- **Teselas sin comprimir por el camino:** Cloudflare no comprime `application/vnd.mapbox-vector-tile`. Con `application/x-protobuf` quizá lo haría, pero no se ha probado porque exige desplegar. Queda como mejora posible, sin prisa: la primera vista baja 205 kB del mapa base.
- **El primer despliegue de staging tras #341 salió en rojo** en "Comprobar versión, banda y cabeceras servidas": con la misma versión en `package.json`, la tesela aún salía como la página de la SPA mientras Pages propagaba. El siguiente salió en verde, y #344 añade los reintentos.
- **Archivos de Ops tocados**, con la excepción de `docs/20` §0:
  - `vite.config.ts`: `globPatterns`, `runtimeCaching`, el plugin `teselasPlugin` e `importScripts`;
  - `scripts/comprobar-despliegue.ts`;
  - `docs/04` §8, que pide RV-71 en su paso 6.

  También se tocaron `.gitattributes` (`*.pbf binary`) y `.prettierignore` (`public/mapabase`).
- **Cabecera de versión de `docs/12`:** no se ha subido con DEC-111 a 113, para no pisar la de Ops. Se deja para la consolidación.
