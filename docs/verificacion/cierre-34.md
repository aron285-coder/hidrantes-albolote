# Verificación · Cierre antes del piloto (docs/34)

**Estado:** hecho el 10 oct 2026, en staging y en producción (0.12.0, `184808f`). Especificación:
[`docs/34`](../archivo/especificaciones/34-cierre-antes-del-piloto.md). Una sola sesión, un PR por punto. Cada
test de un punto con código **falló antes del arreglo**. Desde aquí rige la congelación hasta el piloto (DEC-193).

## Puntos

| Punto | PR | Qué | Test |
|---|---|---|---|
| — | #637 | `docs/34` en el repositorio | — |
| RV-350 | #638 | `plural()` y el singular de cada contador; Apéndice A con las dos formas | `textos.test.ts` › «plurales (docs/34 RV-350)»: 0, 1 y 2, cada función con `n = 1` y cada singular contra el Apéndice A |
| RV-351 | #639 | `buscarAyuda` «Código, calle o dirección…» como `placeholder`; el `aria-label` sigue con el texto largo | `e2e/buscador.spec.ts` › «el texto de ayuda del buscador cabe», a 360 × 800 y 1440 × 900 |
| RV-352 | #640 | Con el punto inactivo, el aviso antes que el minimapa y «Rechazar: el punto ya no existe» en su propia fila por debajo de 1.100 px | `e2e/panel-cola.spec.ts` › «punto que ya no existe, en el móvil» |
| RV-353 | #642 | El punto de novedades `aria-hidden`; el enlace se llama «Ajustes, hay novedades» | `e2e/mapa.spec.ts` (AC-127) y `e2e/escritorio.spec.ts` |
| RV-354 | #643 | HID-9003 y BOC-9004 con foto del sitio en el seed de staging; comentario en la rama «Sin foto»; nota en `docs/33` | `scripts/fotos-seed-staging.test.ts` |
| RV-355 | #644 | Parejas `--tinte-*` y `--tinte-*-texto` (también para amarillo y marrón) y 42 usos migrados; borde en oscuro | `src/lib/tintes.test.ts`; `e2e/panel-ajustes.spec.ts` › «en oscuro…» con axe |
| RV-356 | #645 | Fotos propias de los enganches; dibujos en `docs/archivo/racores-dibujos/`; DEC-194 | `scripts/racores-publicos.test.ts`; `e2e/racores.spec.ts` |
| RV-357 | #646 | DEC-193 y DEC-195; línea en CLAUDE.md §5; etiqueta `tras-piloto` | — |
| RV-358 | #648, entró con #649 | `docs/17` a `docs/33` en `docs/archivo/especificaciones/`; tabla en INDICE; regla en 00 §2 | `scripts/enlaces-docs.test.ts` (enlaces) |
| RV-359 | #649 | Quitadas de `HEAD` 178 imágenes sin enlace (13,4 MB); artefacto `vistas` de 90 días; `recorridos/` ignorado | `scripts/enlaces-docs.test.ts` (imágenes) |
| RV-360, RV-361 | #650 | Sin recuentos escritos a mano; la fase 9 en cinco líneas y su historial en `docs/archivo/historial-fase-9.md` | — |
| RV-362 | #652, #653 y este | RV-139b y recorrido corto en verde con `8f7359d`; 0.12.0 en producción; `docs/34` al archivo | [`recorrido-staging-2026-10-10.md`](recorrido-staging-2026-10-10.md), [`revision-completa-staging.md`](revision-completa-staging.md) |

Cada PR con código pasó por `pr-review-toolkit` y `code-review`. Hallazgos: dos en RV-350 («sincronizado» en
singular y la comprobación del singular contra el Apéndice A), arreglados en el mismo PR; ninguno en RV-355.

## Criterio de salida

- [x] 0.12.0 en producción: `npm run publicar` con la puerta en verde, que sirve `0.12.0` y `184808f` (deploy 38048920192; fila en `paridad-produccion.md`).
- [x] El test de enlaces en CI: `scripts/enlaces-docs.test.ts` corre con `npm test`.
- [x] `docs/` en la raíz con solo lo vigente: 00–16, INDICE, `entornos.md`, `trabajo-en-paralelo.md`, `notas-para-14-ios.md` y `mockups/`. `docs/34` pasa al archivo en este PR.
- [x] La fila de la fase 9 dice, en cinco líneas, que lo que queda es el piloto.

## Desviaciones

- **RV-353:** `aria-label` en el enlace en lugar de un `sr-only` detrás del texto: con `sr-only`, Chrome calculaba «Ajustes , hay novedades».
- **RV-355:** también `amarillo` (chip de regular) y `marron` (chip de barro), que 34 pedía comprobar y se veían claros en oscuro. El texto rojo y ámbar sobre `--papel` pasa a `--rojo-texto` y `--ambar-texto` (iguales en claro).
- **RV-356:** los textos alternativos no cambian: eran `alt=""` y nunca dijeron «dibujo». Las fotos llevan un manifiesto C2PA de procedencia sin datos personales; los `.webp` de la app, ningún metadato.
- **RV-358:** #649 se fusionó antes que #648 y lo llevaba dentro; #648 se cerró sin diferencia con `develop`.
- **RV-359:** el juego completo de un recorrido no se sube como artefacto: no hay orquestador en un workflow (el recorrido es una sesión en el PC, DEC-184), y subirlo obligaría a empujarlo a este repositorio público. Se queda en `recorridos/`, fuera de Git.

## Suposiciones

- Una especificación con trabajo pendiente **de una persona** (la GitHub App de RV-97, la prueba en el Android de 26 y 27) cuenta como cerrada: ese trabajo sigue en su issue, no en la especificación.
- `docs/32` estaba cerrada: su verificación remite la oleada 3 a `recorrido-staging-2026-10-08.md` y a la 0.10.0 en producción.

## Lo que queda, con issue (`tras-piloto`, DEC-193)

- #647: el contraste del resultado del envío en Proponer, en oscuro.
- #651: las altas de cada RV-139b se apilan en el mismo sitio de staging (BOC-0007 a BOC-0012).
