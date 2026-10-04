# Verificación · Cercanos más simple (`docs/27` RV-114, DEC-165)

| | |
|---|---|
| **Fecha** | 5 oct 2026 |
| **Sesión** | Frontend (`PW_PUERTO=4174`), rama `fase-9/fe-rv114-cercanos` |
| **Alcance** | RV-114: la hoja de *Cercanos* con un botón por fila y los avisos de posición en el subtítulo |

## Qué se ha comprobado

| Caso | Cómo | Resultado |
|---|---|---|
| La fila da código, "100 mm · Regular", distancia y rumbo; sin tramos, revisión, tipo en texto ni *Medir* | vitest `PanelCercanos.test.tsx` › "da código, «diámetro · estado», distancia y rumbo, y nada más" | ✓ (falló sobre `develop`) |
| Un solo botón por fila, *Cómo llegar*, con `aria-label` y `title`, que apunta a `enlaceComoLlegar(punto)` | vitest › "un solo botón por fila"; e2e `incidente.spec.ts` › "cada fila tiene un solo botón…" (href `geo:` en Android y Google Maps en ordenador, 44 × 44 px) | ✓ (falló sobre `develop`) |
| Tocar la fila abre la ficha | vitest › "tocar la fila abre la ficha de ese punto"; e2e › "tocar una fila abre la ficha sin cerrar el incidente" | ✓ |
| Sin *Compartir el incidente*, "Datos de hace N" ni "El más cercano…" | vitest › "sin «Compartir el incidente»…"; e2e › "el que no funciona no sale ni se avisa de él…" | ✓ (falló sobre `develop`) |
| GPS al día: el subtítulo es solo "· en línea recta", sin `role="status"` | vitest; e2e › "sin red: cinco que funcionan…" | ✓ (falló sobre `develop`) |
| Posición vieja: "· en línea recta · posición de hace 5 min", en `--naranja-texto`, sin recuadro (`bg-oro-100` no aparece), con `role="status"` | vitest; e2e › "tras recargar con gps=…&momento de hace 5 min…" | ✓ (falló sobre `develop`) |
| Poco precisa: "· posición poco precisa (±80 m)" y *Marcar en el mapa* llama a `alMarcarEnMapa`; vieja y poco precisa a la vez → solo poco precisa | vitest (dos casos); e2e › "precisión de 800 m avisa y ofrece marcar en el mapa" | ✓ (falló sobre `develop`) |
| Origen marcado: "· desde el punto marcado · en línea recta" | vitest; e2e (tres casos con `?incidente=` sin GPS) | ✓ (falló sobre `develop`) |
| *Solo hidrantes* es un chip `role="switch"` que llama a `alCambiarSoloHidrantes` | vitest; e2e › "«Solo hidrantes» cambia la lista" | ✓ |
| A 412 × 915, con la hoja a media altura, las tres primeras filas enteras sin desplazar, con ±8 m y con ±80 m (el aviso más largo) | e2e › "a 412 × 915, tres candidatos se ven enteros sin desplazar" | ✓ |
| axe (WCAG 2.2 AA) sobre la hoja abierta con aviso, en claro y en oscuro | e2e › "axe sobre la hoja abierta con aviso…"; además `accesibilidad.spec.ts` › "incidente" (axe y geometría de 44 px / 8 px) | ✓ |
| Textos quitados no vuelven; los nuevos coinciden con el Apéndice A | `textos.test.ts` › "textos quitados de Cercanos (docs/27 RV-114)" y TR-112 | ✓ |
| Medir sigue usando la longitud del tramo de la config (jefatura, 25 m) | e2e › "jefatura con tramos de 25 m los ve en la medición desde el sitio del incidente" (sustituye al que pasaba por la fila) | ✓ (×4 sin fallos) |

Locales: `npm run typecheck`, `npm run lint`, `prettier --check`, `npm test` (2211 tests) y
`playwright test incidente medir controles accesibilidad vistas` (187 pasan, 43 omitidos por perfil),
con `PW_CANAL=chrome`.

## Capturas (revisar-pantallas)

Antes y después a 412 × 915 (perfil móvil) y 1440 × 900, en claro y en oscuro, con posición normal
(±8 m), vieja (hace 5 min) y poco precisa (±80 m): 24 capturas, miradas una a una, fuera del
repositorio. Lo comprobado:

- Antes, en el móvil, el aviso del más cercano y el recuadro de posición vieja dejaban la tercera fila
  cortada; después caben tres filas enteras y empieza la cuarta, también con el aviso de poco precisa.
- El aviso va en la línea del subtítulo y no se parte a mitad ("(±80" / "m)" en la columna de
  ordenador se arregló con `whitespace-nowrap`).
- En oscuro, la distancia se lee (va en `--texto`) y *Cómo llegar* se separa de la tarjeta por su
  borde.
- Los controles del mapa, "Cercanos" y la leyenda no cambian; la diana y las líneas a los candidatos,
  igual.

## Suposiciones y desviaciones

- La distancia va en `--texto` y no en `--marino-950`: el marino no cambia en oscuro y no se lee
  sobre la tarjeta (DEC-165 §5). *Cómo llegar* lleva un borde de 1,5 px `--texto` por lo mismo.
- `T.incidente.fila` desaparece y nace `T.incidente.detalle` ("100 mm · Regular"); la distancia y el
  rumbo se pintan con `distancia()` y `rumboCorto()` (DEC-165 §4).
- Además de lo que lista `docs/27`, se borran `T.medir.tendido` (solo lo usaba la fila),
  `masCercanoQueNoFunciona`, `textoMasCercano` y los tramos de `Candidato`, con sus tests; y el e2e
  de `medir.spec.ts` "Medir tendido desde el incidente", que probaba una función que ya no existe.
- `Mapa.tsx` deja de pasar `aviso`, `guardadoEn`, `momento` y `alMedir` a la hoja.
- 10 AC-152 y AC-154 se corrigen para que no pidan tramos, aviso del más cercano ni *Medir tendido*
  desde la fila.
- El mockup A no entra en este PR: lo pasa Ops a `docs/mockups/27-cercanos.html` (06 §4.7 ya lo enlaza).

## Pendiente

- Desarrollador (docs/27 §3): probar en staging en el Android que se lee de un vistazo y que
  *Cómo llegar* abre Google Maps; la conformidad de jefatura sobre FR-74 v1.10.
