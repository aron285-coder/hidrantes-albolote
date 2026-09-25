# Registro de la sesión Frontend · docs/22 (25 sep 2026)

Puntos de `docs/21` §1 (RV-81, RV-82, RV-83, RV-85, RV-87, RV-88) y la parte de pantalla de RV-92
(`docs/22` §3). Coordinación en #362. Decisiones: DEC-122 a DEC-126 (DEC-127 sin usar) y DEC-136 y
DEC-137 (DEC-138 y DEC-139 sin usar). Cada paquete se revisó con `pr-review-toolkit` y `code-review`
antes de fusionar. Los hallazgos de confianza alta se arreglaron en el mismo PR; el resto está
explicado en su PR.

| Punto | Issue | PR | CI |
|---|---|---|---|
| RV-81 · activar los avisos dice el motivo | #371 | #376 | verde |
| RV-82 · controles del mapa y «Cercanos» | #380 | #381 | verde |
| RV-83, RV-85 y RV-87, más DEC-136 | #382 | #383 | verde |
| RV-88 · capturas en cada PR de pantallas | #384 | #385 | verde (`ci-vistas` subió 24 PNG) |
| RV-92 (pantalla), con RV-93 punto 3 y la petición de Ops de RV-94 | #386 | #387 | verde |

## RV-81 · Activar los avisos falla en silencio (#376, DEC-122 y DEC-136)

- **Cómo falló antes:** `src/lib/push.test.ts` (21 casos, uno por camino de la spec, más
  resincronización y marca del SW) falla entero con el `push.ts` de `develop`. De los tres casos de
  `e2e/ajustes-avisos.spec.ts`, fallan dos: el de sin servicio de push (la hoja se cerraba en
  silencio) y el del servidor que no guarda.
- **Qué comprobé:**
  - la hoja se queda abierta con el texto del motivo y «Reintentar», y el interruptor no se queda
    deshabilitado;
  - los fallos van a `anotarError` sin endpoint ni claves;
  - la resincronización es como mucho una vez al día (una por hora si el SW dejó marca) y no
    vuelve a guardar si el voluntario apaga los avisos a la vez;
  - `pushsubscriptionchange` está probado en `config/sw-push.test.ts` (#383);
  - la captura a 412 × 915 de la hoja.
- **En staging**, solo lectura: el SW publicado tiene `pushsubscriptionchange` y el bundle trae
  los textos nuevos. Sin la línea «Referencia para jefatura», que se quitó en #383.
- **Hallazgos de paso:**
  - el interruptor medía 48 × 28 px. Ahora tiene 44 px de objetivo táctil (UI-15);
  - el build de los e2e no llevaba `VITE_VAPID_PUBLIC_KEY`, así que en Ajustes no salía la sección
    de avisos. Añadí la clave pública de prueba del RFC 8291 en `playwright.config.ts` (archivo de
    Ops, avisado en #362);
  - el Chromium sin interfaz del CI da el permiso por denegado, así que el spec lo fija con
    `addInitScript`.
- **Suposición:** cada motivo tiene un texto distinto, así que el texto basta para identificar el
  caso. Según UI-13, el código interno no se enseña al voluntario (DEC-136, que sustituye esa línea
  de DEC-122).
- **Pendiente del desarrollador (2 min, `docs/22` §4.3):**
  1. En su Android con staging, Ajustes → Avisos → activar.
  2. Anotar en DEC-122 el **texto** que enseñe la hoja, o que quedó activado.
  3. Mirar en Salud del sistema si hay un error nuevo `push:*`.

  Mientras 0030 (#363, Backend) no esté en staging, lo esperable es «El servidor no ha guardado la
  suscripción». Si sale el texto de avisos bloqueados: Ajustes de Android → Aplicaciones → la PWA
  → Notificaciones.

## RV-82 · Controles del mapa y «Cercanos» (#381, DEC-123)

- **Cómo falló antes:** `e2e/anchos.spec.ts` «N px: la columna de controles va pegada al borde…»
  falla en los cuatro anchos (390, 412, 768 y 1280) con «Capas: a ≤ 12 px del borde»: había 59 px.
  El caso de la leyenda de `e2e/mapa.spec.ts` también falla.
- **Qué comprobé:**
  - columna de 44 px, con el mismo borde derecho (±1 px) a ≤ 12 px del mapa;
  - zoom de 44 × 88, «Cercanos» de 48 px exactamente 12 px por encima del «+» de 56, sin tocar la
    atribución;
  - en 768 y 1280, ni la ficha ni «¿Qué hay aquí?» tapan un control;
  - la leyenda se pliega y se despliega, el foco sigue al control y el estado se recuerda;
  - 44 px y 8 px en `accesibilidad.spec.ts`;
  - capturas a 412 × 915 del mapa, del incidente (tres candidatos y medio a la vista) y de la ficha.
- **Documentos:** 06 §4.5, §4.7, §5, UI-15 (la pieza unida es su única excepción) y Apéndice A. El
  prototipo 07 tiene la misma disposición y lo abrí con Playwright sin errores.
- **Cambios de tests existentes, con su motivo:** en `accesibilidad.spec.ts`, en diagonal cuenta el
  mayor de los dos huecos. En `instalar-y-posicion.spec.ts`, «Cerrar» va con `exact: true`.

## RV-83 · Tocar un aviso lleva a «Mis propuestas» (#383, DEC-125)

- **Cómo falló antes:** `config/sw-push.test.ts` (carga el SW con `vm`). Con el `sw-push.js` de
  `develop` fallan 3 de los 4 casos de RV-83: navegaba una ventana no controlada y no esperaba
  `navigate()`.
- **Qué comprobé:**
  - con una ventana controlada, foco y `navigate`;
  - sin ella, `openWindow`;
  - si `navigate` falla, `openWindow` una vez;
  - si el foco falla, no abre una segunda ventana;
  - si `openWindow` falla, `waitUntil` no queda rechazado.
- **Suposición:** el SW no puede anotar errores, porque no tiene token. Si no se abre ninguna
  ventana, el resultado sigue en «Mis propuestas».

## RV-85 · Aviso del mapa base tras una versión nueva (#383, DEC-124)

- **Cómo falló antes: no falló.** El aviso ya dependía solo de que el PMTiles no estuviera
  descargado. `e2e/mapabase-version.spec.ts` es un test de protección y lo digo así en el PR.
- **Qué comprobé:** con datos móviles simulados (sin descarga automática) y una caché
  `hidrantes-teselas-19990101`, un SW instalado de cero la borra, y el aviso sale con cobertura
  («El mapa base no está en el móvil») y sin ella («Mapa base no descargado…»).
- **Pendiente para Ops:** la línea de 04 §8, pedida en #362.

## RV-87 · Documentación que no coincide (#381 y #383)

- **Hecho:**
  - el «+» de 06 §5 queda en 56 px, y el comentario de `Mapa.tsx` que decía 44 px desaparece (#381);
  - los comentarios de `src/lib/cola.ts` y `src/lib/panel/cola.ts` ya no hablan de
    «avisos.yml cada 15 minutos» (#383).
- **Pedido a otras sesiones en #362:**
  - Backend: `functions/api/push.ts:3`;
  - Ops: `scripts/arranque.ts:503` y `:556`.

  Las menciones de «15 minutos» que tratan del reintento de un aviso reclamado son correctas y no
  se tocan. `docs/05` §9 ya estaba al día.
- **Test:** no aplica (comentarios y documentos).

## RV-88 · Capturas en cada PR de pantallas (#385, DEC-126)

- **Qué comprobé:**
  - `e2e/vistas.spec.ts` saca 24 capturas: siete pantallas a 412 × 915 y 1280 × 800, en claro y en
    oscuro (el panel no se saca en el móvil);
  - `ci-vistas` (`ubuntu-24.04`, no obligatorio, solo en PR que tocan `src/**`) subió el artefacto
    `vistas` con 24 PNG en el propio PR. Lo descargué y lo miré;
  - la skill `revisar-pantallas` ya no tiene el paso provisional.
- **Lo que encontró:** a 1280 × 800 el mapa medía unos 917 px, porque la lista lateral marcaba la
  altura de la fila. «Cercanos», el «+» y la leyenda quedaban por debajo de la pantalla. Ahora
  `anchos.spec.ts` exige que la página no sea más alta que la pantalla, y ese caso falla con el
  `Mapa.tsx` de antes.
- **Pendiente:** el marcador de posición del buscador de la lista lateral se corta a 320 px. Ya
  pasaba antes; queda anotado en DEC-126.
- **Pendiente para Ops:** confirmar que `ci-vistas` no está entre los checks obligatorios.

## RV-92 · Salud del sistema, parte de pantalla (#387, DEC-137)

- Empezado después de que Backend fusionara #375 (0031).
- **Cómo falló antes:** los dos casos nuevos de `e2e/panel-ajustes.spec.ts` fallan con el
  `Ajustes.tsx` de `develop`. El vitest de `src/lib/panel/ajustes.ts` falla porque las funciones no
  existían.
- **Qué comprobé:**
  - «Ahora mismo» con `en_vivo`;
  - «Según la vigilancia de hace 13 h» con la foto;
  - «Según la última vigilancia» con una base sin 0031, como producción hasta P-12;
  - «Última vigilancia» en `--naranja-texto` y con «lleva más de un día sin pasar» desde 26 h
    justas (`VIGILANCIA_ATRASADA_H`);
  - el SQLSTATE no se enseña;
  - `storage_bytes: 0` sale como «0,0 MB» (petición de Ops para RV-94);
  - la captura de la tarjeta.
- **Suposición:** docs/22 pedía un vitest de `Ajustes.tsx`, pero vitest corre sin DOM. La lógica va
  en funciones puras con su vitest, y la pantalla, en e2e; no añado jsdom.

## En staging, solo lectura

Tras el despliegue de `98eff1e` (#387):

- el bundle publicado tiene la leyenda plegable, el zoom en pieza unida y «Según la vigilancia de»;
- ya no tiene «Referencia para jefatura»;
- `sw-push.js` trae el `notificationclick` nuevo.

No entré con el código de acceso ni con Google para ver las pantallas: sería identificarse. Las
capturas de `ci-vistas` son del mismo build.
