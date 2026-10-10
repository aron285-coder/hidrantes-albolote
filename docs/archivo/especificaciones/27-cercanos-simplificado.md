# 27 · "Cercanos" más simple: un botón por fila (5 oct 2026)

| | |
|---|---|
| **Para** | Claude Code, en este repositorio. **Una sola sesión** (Frontend), corta. Puede ir a la vez que `docs/26`: no tocan los mismos archivos. |
| **Base** | `develop` en `71f23da` (docs/25 entero, oleada 4 incluida). |
| **Origen** | Captura del desarrollador en un Android (5-10), con lo que sobra tachado a mano, y su elección del mockup **A · Un botón por fila**. |
| **Mockup** | `docs/mockups-cercanos.html`, versión **A** (la B y la C se descartan). Si el mockup y este texto no coinciden, manda el texto. |
| **Requisitos** | Cambia FR-74 en `docs/01` (congelado). Versión nueva de 01 con "conformidad del desarrollador, 5 oct 2026". |

## 0. Reparto

| Sesión | Puntos | DEC | `PW_PUERTO` |
|---|---|---|---|
| **Frontend** | RV-114 | DEC-165 | 4174 |

**Archivos:**

- `src/componentes/mapa/PanelCercanos.tsx` y su test
- `src/lib/incidente.ts`, solo si sobra algo que ya no se usa
- el bloque `incidente` de `src/lib/textos.ts`
- `e2e/incidente.spec.ts`
- el apartado de Cercanos en `docs/06` (§4.7 y el Apéndice A)
- `docs/01` FR-74, que se cambia en el mismo PR porque es una sola sesión

**Herramientas, como siempre:** las skills `paquete-rv` y `revisar-pantallas` (capturas a 412 × 915 y a 1440 × 900, antes y después, en claro y en oscuro), y `pr-review-toolkit` y `code-review` antes de fusionar.

**Registro:** `docs/verificacion/cercanos-simple.md`.

**Mockup:** se pasa a `docs/mockups/27-cercanos.html`, dejando solo la versión A. Las versiones B y C se quitan de la copia, y el original se borra de `docs/`.

---

## 1. RV-114 · Cercanos: quitar todo lo que no hace falta en un servicio · P1

### Qué se quita (lo tachado en la captura)

| Hoy | Dónde | Qué pasa |
|---|---|---|
| "Desde tu posición · ±21 m · hace 3 min" bajo el título | `header`, la variable `desde` | **Fuera** cuando el origen es el GPS y está bien. Ver "Cuándo sí se avisa". |
| "El más cercano, HID-9001 a 8 m, no funciona" (y los avisos de malo y barro) | `aviso` / `textoMasCercano` | **Fuera.** Un punto que no funciona tampoco sale en la lista, que solo enseña los utilizables. |
| Recuadro amarillo "Posición de hace 3 min" | `posicionVieja` | **Fuera como recuadro.** Pasa a una línea; ver "Cuándo sí se avisa". |
| "≥ 14 tramos" en cada fila | `T.incidente.fila(…, tramos)` | **Fuera de la fila.** Los tramos siguen en la herramienta **Medir** (FR-76). |
| "revisado hace N" en cada fila | `T.mapa.revisado(...)` | **Fuera de la fila.** Está en la ficha. |
| El tipo en texto ("hidrante 100 mm") | `nombreTipo` en la fila | **Fuera.** La forma del marcador ya dice el tipo, y "Solo hidrantes" lo filtra. |
| Botón **Medir tendido** en cada fila | `alMedir` | **Fuera de la fila.** Medir sigue en la barra del mapa y en "¿Qué hay aquí?". |
| Botón **"Compartir el incidente"** | `BotonCompartir` al final | **Fuera.** Compartir una ubicación sigue en "¿Qué hay aquí?" y en la ficha. |
| "Datos de hace 3 min" al pie | `guardadoEn` | **Fuera.** La barra de estado de arriba ya dice "Sincronizado hace N". |

### Cómo queda (mockup A)

1. **Cabecera:** **"Cercanos"** (Barlow Condensed, como los títulos) y, en la misma línea, en texto suave, **"· en línea recta"**.
   - A la derecha, el chevron de ampliar o reducir la hoja (solo en el móvil y la tableta, sin cambios) y la **X**.
2. **"Solo hidrantes"** pasa de una fila con interruptor a un **chip pequeño** con casilla, alineado a la izquierda. Sigue siendo un interruptor accesible (`role="switch"`, `aria-checked`), con 44 px de alto de área táctil.
3. **Lista: una fila por punto**, en tarjeta como hoy:
   - **A la izquierda:** el marcador (`MarcadorSvg`, 24 a 30 px, con los colores de docs/25).
   - **En el centro, dos líneas:**
     - el **código** en JetBrains Mono de 17 px;
     - debajo, **"100 mm · Regular"** en 13,5 px de texto suave: diámetro y estado, nada más.
   - **A la derecha del texto, dos líneas alineadas a la derecha:**
     - la **distancia** en JetBrains Mono de 18 px, `--marino-950` ("264 m", "1,2 km");
     - debajo, el **rumbo** en 12,5 px ("N", "SE").
   - **Al final, un solo botón: Cómo llegar.** Es el **principal**: icono de navegación, 44 × 44 px, fondo `--marino-950` e icono blanco. Lleva `aria-label` y `title` "Cómo llegar".
   - **Tocar el resto de la fila** abre la ficha del punto, como hoy (`alElegir`).
4. **Pie de la hoja:** nada. Ni compartir ni la fecha de los datos.

### Cuándo sí se avisa (decisión del desarrollador, DEC-165)

Antes, el origen y la antigüedad de la posición se decían siempre, en una línea y un recuadro. Ahora **solo se dicen cuando importan**, y siempre en la **misma línea del subtítulo**, sin recuadros:

| Situación | Subtítulo |
|---|---|
| GPS al día y preciso | "· en línea recta" (nada más) |
| Posición vieja (`posicionVieja !== null`, con la regla que ya hay, `esAntigua`) | "· en línea recta · **posición de hace 5 min**" (lo último, en `--naranja-texto`) |
| Posición poco precisa (`precision > PRECISION_POCA_M`, 50 m) | "· en línea recta · **posición poco precisa (±80 m)**" (en `--naranja-texto`) y, al lado, el enlace **"Marcar en el mapa"** (`alMarcarEnMapa`, el que ya existe) |
| El origen es un punto marcado a mano | "· desde el punto marcado · en línea recta" |
| Sin posición, o buscándola | como hoy: el mensaje "Sin posición…" o "Buscando tu posición…", que es lo único que se enseña |
| Ningún punto utilizable en 2 km | como hoy: "Ningún punto que funcione a menos de 2 km" y "Ver todos en la lista" |

**Reglas:**

- **Un solo aviso a la vez.** Si la posición es vieja y además poco precisa, sale el de poco precisa, que lleva acción.
- El subtítulo es un `role="status"` cuando lleva aviso, para que el lector de pantalla lo anuncie.
- **Por qué no se quita del todo:** una posición vieja o imprecisa hace que las distancias estén mal, y en un incendio eso cuenta. Pero solo ocupa sitio cuando pasa.

### Ordenador (la columna de la izquierda)

Mismo contenido y mismo orden. La fila tiene más sitio, pero **no** se añade nada: ni el tipo, ni los tramos, ni la revisión.

### Textos (`src/lib/textos.ts`, bloque `incidente`, y Apéndice A de `docs/06`)

| Clave | Cambio |
|---|---|
| `lineaRecta` | "en línea recta" (va detrás de "Cercanos ·") |
| `fila` | Pasa a dos piezas que se pintan por separado: `distancia` y `rumbo`. Se quita el parámetro de tramos. |
| `tramos`, `compartirIncidente`, `datos`, `desdeTuPosicion`, `precision`, `masCercanoNoFunciona`, `masCercanoMalo`, `masCercanoBarro` | **Se borran** si nada más las usa (búscalas con `grep`). Si las usa otra pantalla (Medir, compartir), se quedan. |
| `posicionDe` | "posición de hace N" (en minúscula, va dentro del subtítulo) |
| `pocoPrecisa` | "posición poco precisa (±N m)" (sin la segunda frase: el enlace "Marcar en el mapa" ya lo dice) |
| `desdePuntoMarcado` | "desde el punto marcado" (en minúscula) |

Si `textoMasCercano` y el campo `aviso` del estado se quedan sin uso, se borran también de `src/lib/incidente.ts` y de `Mapa.tsx`, con sus tests.

### Documentación

- **`docs/01` FR-74**, la fila pasa a decir: "Cada fila da código, diámetro y estado, distancia en línea recta y rumbo, con *Cómo llegar*. Tocar la fila abre la ficha. Si la posición es vieja o poco precisa, el subtítulo lo dice."
  - Se quitan de FR-74 "tramos de manguera mínimos" y "*Medir tendido*" en la fila.
  - FR-76 (Medir) **no cambia**: los tramos siguen allí.
- **`docs/06` §4.7** y el Apéndice A: la fila nueva y los avisos en el subtítulo.
- **`docs/02`**, en el flujo de incidente, si describe los tramos o el compartir.

### Tests

- **Vitest de `PanelCercanos`:**
  - **Fila:** contiene el código, "100 mm · Regular", la distancia y el rumbo; **no** contiene "tramo", "revisado", "hidrante" ni el botón Medir.
  - **Botones:** hay exactamente un enlace "Cómo llegar" por fila, que apunta a `enlaceComoLlegar(punto)`, y no hay ningún botón "Compartir el incidente".
  - **Subtítulo:** con GPS al día, el subtítulo es solo "en línea recta".
  - **Posición vieja:** sale "posición de hace N" en el subtítulo y **no** hay recuadro (`bg-oro-100` no aparece).
  - **Poco precisa:** sale "posición poco precisa (±80 m)" y el enlace "Marcar en el mapa" llama a `alMarcarEnMapa`; con la posición vieja y poco precisa a la vez, solo sale el de poco precisa.
  - **Origen marcado:** sale "desde el punto marcado".
  - **Solo hidrantes:** el chip es un `role="switch"`, y cambiarlo llama a `alCambiarSoloHidrantes`.
  - **Sin aviso:** ya no sale "El más cercano…".
- **e2e `incidente.spec.ts`**, a 412 × 915:
  - Abrir Cercanos con tres candidatos; los **tres** se ven enteros sin desplazar, con la hoja a media altura.
  - Tocar una fila abre la ficha.
  - "Cómo llegar" abre el enlace de mapas.
  - No hay "Compartir el incidente".
- **Accesibilidad (axe)** de la hoja abierta, en claro y en oscuro.
- **Capturas** antes y después, a 412 y 1440 px, con una posición normal, una vieja y una poco precisa.

---

## 2. Checklist

- [ ] La hoja de Cercanos enseña solo: título "Cercanos · en línea recta", el chip "Solo hidrantes" y filas con marcador, código, "diámetro · estado", distancia, rumbo y Cómo llegar.
- [ ] Nada de tramos, revisión, tipo en texto, Medir, "El más cercano…", "Compartir el incidente" ni "Datos de hace N".
- [ ] Posición vieja o poco precisa: una línea en el subtítulo, en naranja de texto, sin recuadro; poco precisa con "Marcar en el mapa".
- [ ] En el móvil caben tres puntos sin desplazar, con la hoja a media altura.
- [ ] `docs/01` FR-74, `docs/06` y el mockup en `docs/mockups/27-cercanos.html`.
- [ ] Tests, e2e y axe en verde.

## 3. Lo que hace el desarrollador

1. En staging, en el Android: abrir Cercanos en la calle y comprobar que se lee de un vistazo y que "Cómo llegar" abre Google Maps.
2. La conformidad de jefatura sobre el cambio de FR-74. Basta un sí por escrito.
3. Las aprobaciones de producción, en la release en la que vaya.
