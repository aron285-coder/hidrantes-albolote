# Verificación · Novedades y limpieza, sesión Frontend (docs/23)

**Estado: hecho el 25 sep 2026.** Especificación: `docs/23-novedades-y-limpieza.md`, puntos RV-95 y
RV-98. Decisiones: DEC-142 y DEC-143. Coordinación en #393. Ops consolida este registro en
`novedades-limpieza.md`.

## 1. Qué se ha hecho, por punto

Los dos puntos van en un solo paquete: issue #398, PR #399 (squash `74c30e7`). La issue se cerró sola
al fusionar, con `Closes #398`.

| Punto | Qué | Test de regresión y cómo fallaba sobre `develop` |
|---|---|---|
| RV-95 (P1) | `novedadesDe()` recorre versión a versión, de la más reciente hacia atrás; dentro de cada una, primero novedades y luego correcciones, como mucho dos líneas por ámbito (`MAX_POR_AMBITO`), y para en tres. El JSON guarda `lineas: { version, texto }[]`; `version` y `fecha` de arriba siguen siendo la última release. `normalizarNovedades()` lee también el formato antiguo `string[]`, con la versión de arriba. La app y el panel enseñan cada línea como `[versión] · [texto]`. "Nuevo" y el punto de la pestaña, solo si la última versión trae alguna línea propia (hallazgo de la revisión). FR-167 en 01 (v1.5), Apéndice A de 06 | vitest `scripts/generar-novedades.test.ts` › *el caso de la 0.6.4: tres líneas de la 0.6.4 y ninguna de la 0.6.0*: sobre `develop` salían las tres de la 0.6.0 y sin número por línea (14 de 19 en rojo con el código de `develop`). `src/lib/panel/ajustes.test.ts` › *cada línea lleva su propio número* y *el formato antiguo (string[]) también se lee*. `src/lib/novedades.test.ts` › *una versión que solo trajo cambios internos no se marca*: daba `true`. e2e `panel-ajustes.spec.ts` y `mapa.spec.ts`: cada `li` es exactamente `[versión] · [texto]` |
| RV-98 (P2) | Con `ENTORNO === 'staging'` y `storage_bytes` a `null`, «Almacenamiento usado · no se mide en pruebas», como «Último respaldo». Con un número, el número; en producción y local, `null` sigue siendo «sin dato». `textoAlmacenamiento(bytes, entorno)` | vitest `src/lib/panel/ajustes.test.ts` › *en staging, sin dato de almacenamiento dice "no se mide en pruebas"; con dato, el dato*: decía «sin dato». e2e `panel-ajustes.spec.ts` › *en staging, el almacenamiento sin dato dice que no se mide en pruebas (RV-98)* |

El PR se fusionó con el CI entero en verde.

## 2. Qué he comprobado

- **Local:** `tsc -b`, `prettier --check .`, eslint de los archivos tocados, `vitest run` (1.901 en
  verde) y los e2e de `panel-ajustes`, `mapa` y `vistas` en `movil` y `escritorio` con Chrome
  (`PW_PUERTO=4174`). `panel-firefox` no arranca en esta máquina; lo cubre CI.
- **Capturas** (`revisar-pantallas`): se añadió `panel-ajustes` a `VISTAS` de `e2e/vistas.spec.ts`,
  con Salud del sistema como en staging. Revisadas Ajustes de la app a 412 px en claro y en oscuro, y
  el panel a 1280 px. En la primera captura, el número de versión de la app salía demasiado grande;
  se rebajó a 13 px y color suave en el mismo PR.
- **Staging, tras el despliegue (`Desplegar staging` en verde, 25-09 ~19:53 UTC), solo leyendo:** el
  código servido lleva `version: "0.6.4"` con `lineas: [{version: "0.6.4", texto: "Activar los avisos
  dice qué ha fallado y cómo arreglarlo"}, {… "Los avisos se activan de verdad…"}, {… "En el ordenador
  el mapa cabe en la pantalla…"}]`, la función que lee el formato antiguo y el texto «no se mide en
  pruebas». La pantalla no la he abierto en staging: la app pide el código de acceso y el panel una
  cuenta de Google, y no tengo ninguna de las dos.

## 3. Suposiciones y decisiones

- **`src/generado/novedades.json` no se ha tocado** (`docs/23` §0). Sigue en el formato antiguo y en la
  0.6.2; el typecheck pasa gracias a la compatibilidad, y `prebuild` lo regenera en cada build.
- **Dos por ámbito** cuenta solo las líneas que entran (tras los filtros y los duplicados), y es de cada
  versión. Con el CHANGELOG de hoy, la tercera línea es la primera de `mapa`, no la tercera de `avisos`.
- **Un duplicado** en dos versiones sale una vez, con la versión más reciente.
- **`src/componentes/AvisoNovedades.tsx`**, que `docs/23` nombra, no lee este JSON: es el aviso del
  resultado de las propuestas (FR-90). No cambia (DEC-142 punto 8). Conviene corregir esa mención en
  `docs/23` si se reutiliza.
- **En `local`**, el almacenamiento sin dato sigue diciendo «sin dato», como «Último respaldo».
- Si el CHANGELOG tiene versiones y no sale ninguna línea, el script lo avisa en el registro del build.

## 4. Lo que queda para Ops

- **P-13:** comprobar en producción que Novedades enseña las líneas de la versión nueva, cada una con
  su número.
- Añadir DEC-142 y DEC-143 a la cabecera de versión de `docs/12`.
