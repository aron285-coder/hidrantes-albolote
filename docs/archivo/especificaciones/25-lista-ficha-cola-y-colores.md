# 25 · Lista sin dirección, ficha con banda de estado, cola con mapa y datos completos, y regular en amarillo (4 oct 2026)

| | |
|---|---|
| **Para** | Claude Code, en este repositorio. Tres sesiones en paralelo según `docs/trabajo-en-paralelo.md`. |
| **Base** | `develop` en `49278aa` (0.8.0). Producción en 0.7.0 con la paridad en verde (`docs/24` P-14). |
| **Origen** | Decisiones del desarrollador del 4 oct 2026 sobre mockups HTML. Los mockups definitivos son la referencia visual de este documento (§0.2). |
| **Requisitos** | Cambia `docs/01` (congelado): FR-20, FR-41, FR-44, FR-60, FR-66, FR-68, FR-72, FR-75 y FR-102 a FR-105. Versión nueva de 01 con "conformidad del desarrollador, 4 oct 2026". Cambia `docs/06` §2.2, §4.3, §4.5 y §5. |

## 0. Reparto, mockups y orden

### 0.1 Reparto: cuatro sesiones

Frontend se parte en dos sesiones, porque es casi todo el trabajo. Campo (app del voluntario) y Panel (jefatura) apenas comparten archivos.

| Sesión | Puntos | DEC | Migraciones y pgTAP | `PW_PUERTO` |
|---|---|---|---|---|
| **Frontend-campo** | RV-105, RV-106, RV-107, RV-108, RV-109, RV-112 | DEC-154 a 157 y DEC-163 | — | 4174 |
| **Frontend-panel** | RV-110 (pantalla) | DEC-158 y 159 | — | 4176 |
| **Backend** | RV-110 (SQL) | DEC-160 y 161 | `0036` y siguientes; pgTAP desde `32` | 4173 |
| **Ops** | RV-111, P-15 | DEC-162 | — | 4175 |

Los subagentes de cada sesión (§0.5) usan los puertos 4177 a 4180, uno cada uno, y nunca el de otra sesión.

### 0.2 Mockups de referencia

Están en `docs/`, sin seguimiento en git; los pone en el repositorio Ops en RV-111. Cuando un mockup y este texto no coinciden, **manda este texto**: los mockups son dibujos, no medidas exactas.

| Archivo | Qué vale de él |
|---|---|
| `docs/mockups-lista-y-ficha.html` | **§1, "Propuesta · elegida"**: la lista sin dirección. §3 son los colores RAL, pero el de regular cambió a amarillo después: manda `mockups-ficha-banda.html`. §2 de este archivo está superado. |
| `docs/mockups-ficha-banda.html` | **Todo**: la ficha con banda en móvil, tableta y ordenador, las coordenadas con su sistema y los colores (regular en amarillo). |
| `docs/mockups-cola-opcion-a.html` | **Todo**: la cola de revisión con el mapa arriba, los datos completos y las fotos, en ordenador, tableta y móvil. |
| `docs/mockups-cola-con-mapa.html`, `docs/mockups-cola-opcion-b.html` | **Descartados.** No se usan; Ops no los añade al repositorio (RV-111). |

### 0.3 Orden

El reparto en oleadas, con lo que se hace en paralelo, está en §0.5. En resumen:

1. **RV-105 (colores) va primero dentro de Frontend-campo.** Cambia tokens que usan todas las pantallas, y así las capturas de los demás PR salen ya con los colores buenos.
2. **Backend, Frontend-panel y Ops arrancan a la vez que RV-105.** No dependen de él para empezar.
3. La pantalla de RV-110 se **fusiona** después de la migración 0036 y de RV-105. No espera a RV-109 (§0.5).
4. **P-15**, al final, con todo dentro.

### 0.4 Coordinación y herramientas

- **Coordinación:** issue «Coordinación docs/25». Registros en `docs/verificacion/lista-ficha-cola-<sesión>.md`; Ops consolida en `lista-ficha-cola.md` y añade la fila de 25 en `docs/INDICE.md`.
- **En cada paquete:** las skills `paquete-rv` y `revisar-pantallas`, esta última con capturas antes y después a 412 × 915, 820 × 1180 y 1440 × 900, en claro y en oscuro. Para cada migración, la skill `nueva-migracion`. Antes de fusionar, `pr-review-toolkit` y `code-review`.

### 0.5 Trabajo en paralelo: sesiones, subagentes y oleadas

**El objetivo:** que nada espere sin necesidad. Cada sesión puede lanzar **subagentes** (herramienta Agent de Claude Code con `isolation: "worktree"`). Cada subagente trabaja en su propia copia del repositorio y su propia rama, y abre su propio PR. La sesión que lo lanza revisa el PR (`pr-review-toolkit`, `code-review`) y lo fusiona: un subagente nunca fusiona.

**Como mucho 3 subagentes a la vez por sesión.** Con más, la CI hace cola y se pierde lo que se gana.

#### Archivos con dueño

Dos agentes que tocan el mismo archivo a la vez se pisan al rebasar. Cada archivo "caliente" tiene **un solo dueño en cada oleada**:

| Archivo | Dueño | Los demás |
|---|---|---|
| `src/index.css`, `src/lib/simbologia.ts`, `MarcadorSvg.tsx`, `Leyenda.tsx`, `accesibilidad.test.ts` | RV-105, y después RV-107 (en este orden, el mismo agente) | no los tocan |
| `src/lib/coordenadas.ts`, `Coordenadas.tsx`, `src/lib/compartir.ts`, `QueHayAqui.tsx` | RV-109 | importan, no cambian |
| `Ficha.tsx`, `src/lib/ficha.ts` | RV-108 y RV-112 (la misma sesión) | — |
| `Proponer.tsx`, `Campos.tsx`, `src/lib/racores.ts` | RV-112 | — |
| `ListaPuntos.tsx` | RV-106 | — |
| `DetallePropuesta.tsx`, `MinimapaPropuesta.tsx`, `ColaRevision.tsx`, `src/lib/panel/cola.ts` | RV-110 (pantalla) | — |
| `supabase/migrations/`, `supabase/tests/` | Backend | — |
| `src/lib/textos.ts` | **todos**, cada uno solo en el bloque de su pantalla | **rebasar justo antes de fusionar**; un conflicto aquí se resuelve juntando las dos partes |
| `docs/06` | cada uno solo en su apartado (§2.2 y §4 RV-105/107, §5 ficha RV-108, §5 panel RV-110, Apéndice A el suyo) | igual que `textos.ts` |
| `docs/01`, `docs/INDICE.md`, `docs/verificacion/` (consolidado) | **Ops**, al final | los demás le pasan sus cambios por la issue de coordinación; donde un punto de §1 dice "actualiza `docs/01`", lo pide a Ops en vez de hacerlo |

#### Oleadas

| Oleada | Empieza cuando… | En paralelo |
|---|---|---|
| **1** | ya | **Frontend-campo:** RV-105 (la sesión misma, sin subagente: es corto y bloquea al resto de su sesión).<br>**Backend:** 0036 y su pgTAP.<br>**Frontend-panel:** RV-110, construido contra un *fixture* con las columnas nuevas de §1 RV-110 (el contrato está escrito), sin fusionar todavía.<br>**Ops:** RV-111. |
| **2** | RV-105 está en `develop` | **Frontend-campo**, tres subagentes:<br>· A, **RV-106** (lista)<br>· B, **RV-107** (marcador sin revisar; dueño de `simbologia.ts` desde ahora)<br>· C, **RV-109** (coordenadas)<br>La sesión hace **RV-108** (ficha) y **RV-112** (tipo de enganche) ella misma, en el mismo paquete o seguidos, porque los dos tocan `src/lib/ficha.ts`. Usa las etiquetas nuevas de coordenadas de RV-109: si C aún no ha fusionado, se escriben con el texto final y se rebasa. |
| **3** | 0036 **y** RV-105 están en `develop` | **Frontend-panel** rebasa y fusiona RV-110 (pantalla). Si RV-109 ya está, usa sus etiquetas; si no, cambia solo los textos al rebasar, sin esperar. |
| **4** | todo lo anterior en `develop` | **Ops:** `docs/01` versión nueva, consolidado de registros y **P-15**. |

**Lo que sigue siendo secuencial, y por qué:**

- **RV-105 antes que RV-107:** los dos cambian el trazo del marcador en `simbologia.ts`.
- **0036 antes de fusionar la pantalla de RV-110:** sin la migración, staging enseñaría el detalle vacío.
- **P-15 al final:** una sola release con todo.

#### Instrucciones para lanzar un subagente

Copiables. La sesión las adapta al punto:

```
Agent(
  description: "RV-106 lista sin dirección",
  isolation: "worktree",
  prompt: "Eres un subagente de la sesión Frontend-campo de docs/25. Haz SOLO RV-106 (§1 de
  docs/25), con la skill paquete-rv. Rama fase-9/fe-rv106-lista desde origin/develop.
  PW_PUERTO=4177. Archivos tuyos: ListaPuntos.tsx, su test, y el bloque de la lista en
  src/lib/textos.ts y en el Apéndice A de docs/06. No toques ningún otro archivo de la tabla
  de dueños de §0.5. Usa la skill revisar-pantallas (capturas a 412 y 1440 px). Abre el PR con
  la plantilla y NO lo fusiones. Devuélveme el número del PR, los tests que añadiste y
  cualquier cosa que no hayas podido hacer."
)
```

- **Mismo patrón para los demás:** RV-107 con `PW_PUERTO=4178` y rama `fase-9/fe-rv107-marcador`; RV-109 con `PW_PUERTO=4179` y rama `fase-9/fe-rv109-coordenadas`.
- **Si un subagente se para** (un test que no entiende, un archivo que no es suyo), la sesión lo resuelve y no lanza otro para lo mismo.

#### Para ganar tiempo en la CI

- Los PR de solo `docs/` no lanzan e2e ni SQL (PAR-01): **los cambios de documentación van en PR aparte** cuando no acompañan a código.
- En local, cada agente corre **solo** sus tests (`npx vitest related <archivos>`, `npx playwright test <specs>`). La suite completa la corre la CI.
- **No esperar a la CI:** `gh pr merge --auto --squash` y seguir con lo siguiente (skill `paquete-rv`, paso 8).

#### Arranque de las cuatro sesiones

| Sesión | Frase de arranque |
|---|---|
| Frontend-campo | "Lee docs/25. Eres la sesión Frontend-campo: haz RV-105 y, cuando esté en develop, lanza los subagentes de la oleada 2 según §0.5 y haz tú RV-108 y RV-112." |
| Frontend-panel | "Lee docs/25. Eres la sesión Frontend-panel: haz RV-110 (pantalla) según §0.5; fusiona en la oleada 3." |
| Backend | "Lee docs/25. Eres la sesión Backend: haz RV-110 (SQL), migración 0036 y su pgTAP." |
| Ops | "Lee docs/25. Eres la sesión Ops: haz RV-111 ya y la oleada 4 (docs/01, consolidado y P-15) al final." |

---

## 1. Frontend (campo y panel)

### RV-105 · Colores de estado RAL, con regular en amarillo · P0 (va primero)

**Decisión (DEC-154).** Los estados usan los colores de seguridad de ISO 3864 (UNE-EN ISO 7010), los mismos que la escala de caudal de NFPA 291 (verde, naranja o amarillo, rojo). Regular pasa de naranja a **amarillo**: el naranja se parecía al rojo de "malo", y además con daltonismo. El amarillo y el rojo se distinguen también por su claridad (4,0:1), así que no dependen del tono.

**Tokens nuevos** (`src/index.css`, modo claro y oscuro, y `docs/06` §2.2):

| Estado | Relleno | Fondo del chip | Texto del chip | Borde del marcador, mapa claro | Borde del marcador, mapa oscuro |
|---|---|---|---|---|---|
| bueno | `--verde-600` **`#237F52`** (RAL 6032) | `#DCEEE1` | `#1E6B45` | blanco | `#111826` |
| regular | **`--amarillo-500` `#F9A900`** (RAL 1003) | `--amarillo-100` `#FFF1C2` | `--amarillo-800` `#6B4E00` | **`--amarillo-borde` `#5C4300`** | `#111826` |
| malo | `--rojo-700` **`#9B2423`** (RAL 3001) | `#FBE0DB` | `#9B2423` | blanco | `#111826` |
| no funciona | `--gris-700` (sin cambio) | sin cambio | sin cambio | blanco | `#111826` |
| barro | `--marron-600` (sin cambio, DEC-149) | sin cambio | sin cambio | blanco | `#111826` |

**Qué hay que hacer:**

1. **Quitar** `--naranja-estado-600/700/100`. Busca con `grep -rn "naranja-estado" src docs` y cambia cada uso por los `--amarillo-*`. **No** toques `--naranja-600`: es el naranja de las acciones (botón +, Enviar) y no cambia.
2. **Borde oscuro solo para el amarillo en el mapa claro.** Sobre el fondo del mapa claro (`#EFECE3`), el amarillo se queda en 1,66:1 y TR-31 pide 3:1: el borde `#5C4300` (7,87:1) da el contraste. Hoy `simbologia.ts` pone `stroke="var(--borde-marcador)"` para todos. Añade un borde por estado: `--borde-marcador-regular`, que es `#5C4300` en claro y el `--borde-marcador` de siempre en oscuro. Aplícalo en el mapa, la lista, la ficha, la leyenda, el panel y el minimapa: es el mismo dibujo en todos (06 §4).
3. **Texto oscuro sobre el amarillo.** Donde el amarillo es fondo (el chip, y la banda de la ficha en RV-108), el texto va en `--marino-950` o `--amarillo-800`, nunca en blanco (1,96:1).
4. **El amarillo de estado no es el de aviso.** `--oro-*` (duplicado, fuera de zona, propuesta pendiente) se queda como está: es más apagado y se usa como borde y fondo de avisos, no como relleno.
5. **Mapa base propio:** si algún estilo del mapa base usa el antiguo naranja de estado, cámbialo. El mapa base no debería usar colores de caudal (DEC-089); compruébalo.
6. **Documentación:** `docs/06` §2.2, la tabla y el párrafo de DEC-076 (añadir que DEC-154 lo sustituye), §4.3 (el borde del amarillo) y §4.5 (la leyenda), y el Apéndice A si algún texto habla de "naranja".

**Tests:**

- `accesibilidad.test.ts` mide con los tokens nuevos leídos del CSS:
  - relleno ≥ 3:1 sobre los dos fondos de mapa, o, si no llega (el amarillo en claro), su borde ≥ 3:1;
  - texto del chip ≥ 4,5:1 sobre su fondo;
  - `--marino-950` sobre `--amarillo-500` ≥ 4,5:1;
  - diferencia de luminancia entre amarillo y rojo ≥ 3:1.
- `simbologia.test.ts`: un punto regular lleva el trazo `--borde-marcador-regular`; los demás, `--borde-marcador`.
- Captura del mapa con los cinco estados, en claro y en oscuro.

**Comprobación de campo (anótala en el registro):** el desarrollador mira el amarillo en un móvil a pleno sol. En septiembre, el ámbar oscuro de antes se leía marrón mostaza (DEC-076); el RAL 1003 es mucho más claro y no debería pasar.

### RV-106 · La lista sin dirección y con la distancia · P1

**Mockup:** `mockups-lista-y-ficha.html` §1, "Propuesta · elegida".

1. **`ListaPuntos.tsx`, segunda línea:** quita `{p.direccion ?? T.ficha.sinDireccion} ·`. Queda `<estado> · revisado hace N`. La dirección solo se ve en la ficha.
2. **A la derecha, la distancia** ("120 m", "0,9 km"), con el mismo formato que Cercanos. Solo hay distancia si hay posición; sin posición, no se enseña nada (ni "—"). En el panel del ordenador también.
3. **"Sin revisar"** deja el rojo, que en esta app significa *malo*, y pasa a `--naranja-texto` (`#BE4811`, 4,56:1), el texto de aviso de 06 §2.1. El texto pasa de "Sin revisar · hace 1 año" a **"sin revisar desde hace 1 año"**, y la línea no se corta a 360 px; si no cabe, se acorta la fecha, no la palabra.
4. **La búsqueda sigue encontrando por dirección** (FR-69): que no se vea en la fila no quiere decir que no se busque.

**Tests:**

- Vitest de `ListaPuntos`: la fila no contiene "sin dirección" ni la calle; contiene la distancia cuando hay posición y no la contiene cuando no hay.
- `busqueda.spec.ts`: buscar por una calle sigue encontrando el punto.
- Captura a 360 px.

### RV-107 · El borde "sin revisar" en puntos pequeños parece una rueda dentada · P2

**Qué se vio** (captura del 4-10, lista): un marcador pequeño con borde discontinuo (`stroke-dasharray="3 2.5"` sobre un radio de 5 a 7 px) se ve como un engranaje. No se lee como "borde discontinuo".

**Solución (DEC-155):**

- El borde del marcador vuelve a ser **continuo** siempre.
- "Sin revisar" pasa a un **anillo exterior discontinuo** fino: 1,5 px, `--texto-suave` en claro y `#C9CFD8` en oscuro, separado 2,5 px del borde. El patrón de rayas se calcula para que salgan **8 rayas** alrededor, sea cual sea el tamaño: `dash = gap = perímetro / 16`.
- Mismo dibujo en el cuadrado de la boca (perímetro del cuadrado).
- Se actualizan `docs/06` §4.3 y la leyenda §4.5.
- El objetivo táctil de 44 px no cambia.

**Tests:**

- `simbologia.test.ts`: con `revision_caducada`, el trazo principal no lleva `stroke-dasharray`, el anillo sí, y su dash es perímetro / 16 para los radios R1 a R5.
- Captura de la lista y del mapa con puntos sin revisar de los cinco tamaños.

### RV-108 · Ficha de un punto: banda de estado arriba y ficha compacta · P1

**Mockup:** `mockups-ficha-banda.html`, en móvil (regular), tableta (bueno) y ordenador (malo). DEC-156.

**Estructura, de arriba abajo:**

1. **Banda del color del estado, a todo el ancho de la ficha:**
   - el estado en mayúsculas, en Barlow Condensed 700 de 24 px ("BUENO", "REGULAR", "MALO", "BARRO", "NO FUNCIONA");
   - debajo, en 13 px, "revisado hace N · fecha";
   - la X de cerrar, a la derecha;
   - en el móvil, la banda es la cabecera de la hoja y lleva el asa;
   - texto **blanco** sobre verde, rojo, gris y marrón, y **`--marino-950`** sobre amarillo;
   - el contraste lo mide un test, ≥ 4,5:1 en todos;
   - si el punto está sin revisar, la línea dice "sin revisar desde hace 1 año".
2. **Código y núcleo** en una línea: el código en JetBrains Mono de 21 px y el núcleo a la derecha, en texto suave.
3. **Foto**:
   - la conexión y el sitio (docs/24), deslizando, con la etiqueta "Conexión · 1/2";
   - 150 px de alto en el móvil y 170 px en tableta y ordenador;
   - sin foto, el hueco gris de hoy se quita y no se enseña nada.
4. **Datos fijos**, en una rejilla de dos columnas: tipo y diámetro; en bocas, además, racor y dirección; en hidrantes, la dirección a todo el ancho.
   - La revisión **no** se repite aquí: ya está en la banda.
   - En un punto que no funciona, la descripción del fallo va a todo el ancho, debajo de la rejilla.
   - La descripción libre (FR-22), si la hay, va también debajo.
5. **Botones:**
   - **Cómo llegar** es el único botón principal (`--marino-950`, blanco), con **Compartir** como botón de icono de 46 px a su lado (con `aria-label`);
   - debajo, **Proponer un cambio**, en blanco con borde `--naranja-600` y texto `--naranja-texto`;
   - así se cumple la regla de un solo botón principal (DEC-147).
6. **Coordenadas en los dos sistemas** (RV-109).
7. "Datos sincronizados hace N", en texto suave y centrado.

**Por tamaño:**

- **Móvil:** la hoja sube desde abajo, como hoy; a media altura se ven la banda, el código y la foto.
- **Tableta:** ficha flotante de 360 px, a la izquierda de la columna de controles, que termina por encima de los botones de abajo (06 §5, sin cambios).
- **Ordenador:** la ficha flotante de 370 px, a la derecha de la lista lateral (330 px); el mapa se centra en el punto.

**Lo que se quita:** la fila de chips (tipo, diámetro, racor y estado) y las tarjetas sueltas de "Dirección" y "Última revisión" (ahora están en la banda y en la rejilla).

**Tests:**

- Vitest de `Ficha.tsx`:
  - la banda tiene la clase del estado y el texto en mayúsculas;
  - en regular, el texto de la banda es `--marino-950`;
  - la rejilla tiene racor solo en bocas;
  - "Cómo llegar" es el único botón con el estilo principal;
  - "Compartir" tiene `aria-label`;
  - sin foto, no hay hueco.
- e2e `mapa.spec.ts`: abrir un punto de cada estado y comprobar el texto de la banda.
- Accesibilidad (axe) de la ficha abierta.
- Capturas con `revisar-pantallas` en los tres tamaños y los dos modos.

### RV-109 · Coordenadas con su sistema · P1

**Decisión (DEC-157):** cada coordenada lleva el nombre de su sistema, en la ficha, en "¿Qué hay aquí?", en la cola del panel y en lo que se comparte.

| Línea | Texto de la etiqueta (`textos.ts`) | Formato |
|---|---|---|
| 1 | **"WGS84 · grados decimales"** (antes "Decimal") | `37.273500, -3.618400`, 6 decimales |
| 2 | **"ETRS89 · UTM huso 30N"** (antes "UTM ETRS89 · huso 30") | `30S 445175 4125393` |

- Cada línea con su botón de copiar, como hoy (`Coordenadas.tsx`).
- **Compartir** (FR-75): el texto incluye las dos líneas, con el nombre del sistema delante.
- `docs/01` FR-72 y FR-75, y el Apéndice A de 06.
- Comprueba en `src/lib` que la conversión a UTM usa ETRS89 / huso 30 y que el sufijo "S" es la **banda de latitud** de MGRS, no "sur". Para Albolote (37° N) es correcto: la banda S va de 32° a 40° N. Pon una nota en `docs/06` para que nadie lo lea como "sur".

**Tests:**

- Vitest de `Coordenadas`: las etiquetas nuevas.
- `compartir.test.ts`: el texto lleva "WGS84" y "ETRS89 · UTM huso 30N".
- `coordenadas.test.ts`: un caso conocido (la plaza de Albolote) convierte a la UTM que da el visor del IGN, con ±1 m de margen.

### RV-112 · Bocas de riego: "Tipo de enganche", no "racor" · P1

**Decisión del desarrollador (4 oct 2026, DEC-163):** en una boca de riego el campo no se llama "Racor", sino **"Tipo de enganche"**, y sus opciones son **Barcelona**, **Granada** u **Otro**. Cambia solo lo que se ve; los datos no.

**Textos de pantalla** (`src/lib/textos.ts` y el Apéndice A de `docs/06`):

| Dónde | Hoy | Pasa a |
|---|---|---|
| Etiqueta del campo en el formulario (`formulario.racor`) | "Racor · compara con lo que ves" | **"Tipo de enganche"** (sin ayuda: las fotos de referencia ya comparan, regla de docs/24) |
| Botones del formulario (`formulario.barcelona`, `.granada`, `.otro`) | "Granada" · "Barcelona" · "Otro" | **"Barcelona" · "Granada" · "Otro"**, en este orden. La foto de referencia de RV-104 (docs/24) sigue encima del texto. |
| Aviso de formulario (`avisosFormulario.eligeRacor`) | "Elige el racor" | **"Elige el tipo de enganche"** |
| Ficha, rejilla de datos (RV-108) | "Racor · Granada" | **"Tipo de enganche · Granada"** |
| Ficha, texto corto (`ficha.racor`) | "Racor Granada" | **"Enganche Granada"** |
| Proponer un cambio (`corregirDatosDetalle`) | "Diámetro, racor o descripción mal anotados" | **"Diámetro, tipo de enganche o descripción mal anotados"** |
| Panel: cola y diff (`panelCola.campoRacor`) | "Racor" | **"Tipo de enganche"**, con valores "Barcelona", "Granada" y "Otro" |
| Panel: inventario, hoja de campo e historial | " · Granada" | " · enganche Granada" |
| Exportación (FR-160), cabecera de la columna en CSV y XLSX | `racor` | **`tipo_enganche`**, con valores "Barcelona", "Granada" y "Otro". En GeoJSON, la propiedad también pasa a `tipo_enganche`. |
| Compartir (FR-75), si lleva el racor | "racor Granada" | "enganche Granada" |

`nombreRacor()` en `src/lib/ficha.ts` sigue devolviendo "Barcelona", "Granada" u "Otro", y todas las pantallas lo usan: ficha, lista, panel, hoja de campo, exportación y compartir. Nadie escribe el nombre a mano. Lo que cambia es la etiqueta que va delante.

**Lo que NO cambia (a propósito):**

- **Datos:** la columna `racor`, el enum `hidrantes.tipo_racor` (`granada`, `barcelona`, `otro`), los payloads de `fn_proponer`, los tipos de TypeScript y los nombres de las claves en `textos.ts` (`racor`, `campoRacor`, `eligeRacor`…).
  - Cambiar nombres internos obligaría a una migración y a romper la compatibilidad con la app anterior (04 §12), y solo cambia lo que se lee.
  - Mantener las claves también evita conflictos con las otras sesiones, que importan esos textos.
- **Archivos de las fotos de referencia:** `public/racores/granada.webp` y `barcelona.webp` se quedan como están.
- **`docs/05`:** una línea que diga que en pantalla `racor` se llama "tipo de enganche".
- **Los mockups:** si dicen "Racor", manda este texto.

**Documentación:**

- `docs/01` FR-20, FR-41, FR-44 y FR-66: "el **tipo de enganche** de la boca de riego: Barcelona, Granada u otro". Se lo pasa a Ops para la oleada 4 (§0.5).
- `docs/02`, en los pasos del alta.
- `docs/06`, Apéndice A.

**Tests:**

- `textos.test.ts`: ningún texto **visible** de `textos.ts` contiene la palabra "racor" o "Racor" (las claves sí pueden).
- Vitest del formulario:
  - para una boca, la etiqueta es "Tipo de enganche";
  - los botones son "Barcelona", "Granada" y "Otro", en ese orden;
  - el aviso es "Elige el tipo de enganche";
  - para un hidrante no aparece.
- Vitest de `Ficha`: la rejilla dice "Tipo de enganche" y el valor "Granada".
- `exportar.test.ts`: la cabecera es `tipo_enganche`.
- e2e `operaciones.spec.ts`: alta de una boca eligiendo "Barcelona", y en la ficha se lee "Tipo de enganche · Barcelona".
- `npm run compatibilidad`: el payload sigue mandando `racor: 'barcelona'`.
- Captura del formulario de la boca a 360 px.

### RV-110 · Cola de revisión: mapa arriba, datos completos y fotos, a todo el ancho · P1

**Mockup:** `mockups-cola-opcion-a.html`, en ordenador (corregir ubicación), tableta (alta con posible duplicado) y móvil (la cola y corregir datos). DEC-158.

**Orden del detalle, igual en las seis operaciones:**

1. **Título** ("HID-9007 · Corregir ubicación" / "Alta · hidrante nuevo") y, al lado, autor, antigüedad, fecha y núcleo. Debajo, las **señales** (FR-104), como hoy.
2. **Mapa, a todo el ancho del detalle:**
   - Alto: **300 px** en el ordenador y **280 px** en tableta; en el móvil, **200 px** de borde a borde y fijo arriba.
   - Va en **todas** las operaciones. Hoy solo sale en las que tienen ubicación (FR-103), y una de "Datos" no tiene mapa.
   - El punto, con un anillo `--marino-950`; los puntos de alrededor, atenuados (opacidad 0,55).
   - **Alta:** la propuesta en `--naranja-600` con punto blanco, el círculo de duplicado de 25 m (`radio_duplicado` de config) discontinuo en `--oro-600` y el código del punto que choca.
   - **Ubicación:** la posición de ahora en gris y la propuesta en naranja, unidas por una flecha discontinua con los metros.
   - Conmutador **Mapa / Satélite**: las ubicaciones se abren en Satélite y el resto en Mapa. Zoom +/−, y un enlace **"Abrir en grande"** que abre el mapa a pantalla completa.
   - Debajo del mapa, una leyenda de una línea con lo que se ve.
   - Se reutiliza `MinimapaPropuesta.tsx`, que pasa a ser el mapa del detalle.
3. **"Datos del punto": todos los datos, no solo los cambios.**
   - **Encima**, un resumen de una línea: "**3 cambios** · el resto se queda igual". En un alta: "**4 datos del voluntario** · los demás los deduce el sistema".
   - **Campos, siempre:**
     - código, tipo, diámetro, estado (con su chip), racor (en bocas), descripción y descripción del fallo (si no funciona);
     - dirección (editable, FR-105) y núcleo;
     - coordenadas en WGS84 y en UTM ETRS89 huso 30N (RV-109), cada una en su campo;
     - última revisión, origen de la ubicación con su precisión, y quién propuso.
   - **Lo que cambia va primero**, con fondo `#FFF8EC`, una banda `--naranja-600` de 4 px a la izquierda, la etiqueta "CAMBIA" debajo del nombre del campo y `antes → después` (el antes tachado en `--rojo-700`, el después en `--verde-600`, como el diff de hoy, 06 §5).
   - El resto, sin marcar, en el mismo orden de la lista de campos.
   - **En un alta**, se marcan solo los datos que pone el voluntario (tipo, diámetro, estado, racor, descripciones). Los que deduce el sistema (coordenadas, dirección, núcleo) van sin marcar; el código dice "se asigna al aprobar" y la última revisión, "se fija al aprobar".
   - **Columnas:** **dos** en ordenador y tableta (etiqueta y valor en cada columna) y **una** en el móvil. Todo a todo el ancho del detalle.
4. **Fotos, a todo el ancho**, lado a lado:
   - **Alta:** conexión y sitio.
   - **Ubicación y estado:** la **foto actual del punto** y las dos nuevas, marcadas "Nueva · conexión" y "Nueva · sitio" con la etiqueta en `--naranja-600`. Así se ve si es el mismo hidrante.
   - **Sin fotos nuevas** (datos, o la app anterior): las actuales del punto, con "no trae nuevas" en el título del bloque.
   - Alto: 200 px en el ordenador, 220 px en tableta y 110 px en el móvil. Tocar una foto la amplía.
5. **Botones fijos abajo del detalle**, aunque el contenido se desplace: **Aprobar** (verde), **Aprobar con correcciones** y **Rechazar…** (borde rojo).
   - En tableta, repartidos a lo ancho.
   - En el móvil, los tres a lo ancho, y "Aprobar con correcciones" se acorta a **"Corregir"** (el `aria-label` sigue siendo el largo).

**Disposición:**

- **Ordenador (≥ 1100 px):** la lista de la cola a la izquierda, **340 px fijos**, y el detalle ocupa **todo el resto de la pantalla**. Nada del detalle va en columnas laterales: mapa, datos y fotos a todo el ancho del detalle. Hoy el detalle deja la mitad de la pantalla vacía.
- **Tableta y móvil (< 1100 px):** la cola y el detalle son dos pantallas. Se toca una propuesta y el detalle ocupa toda la pantalla, con "‹" para volver.
  - En la lista, cada fila lleva un **mapita de 62 × 48 px** con el punto, dibujado siempre con el mapa base propio (sin red).
  - Con propuestas marcadas, aparece abajo una barra para aprobar en bloque (FR-107).
- **El historial (aprobadas, rechazadas, retiradas)** usa el mismo detalle en solo lectura, sin botones.

**Backend** (migración `0036_cola_ficha_completa.sql`, DEC-160):

1. **`v_cola_revision`** (`create or replace view`, columnas nuevas **al final**, sin tocar las que hay):
   - `punto jsonb`: la fila actual del punto con los campos que enseña el detalle (codigo, tipo, diametro_mm, caudal, racor, descripcion, descripcion_fallo, direccion, nucleo, fecha_ultima_revision, foto_path, foto_sitio_path). Nunca autores ni nada de FR-27.
   - `punto_lat` y `punto_lng`: la posición actual del punto, para el mapa de las operaciones sin ubicación y para la "posición de ahora" de una ubicación.
   - `utm_actual` y `utm_propuesta` **no** van aquí: la UTM la calcula el cliente con la misma función que la ficha (RV-109).
2. **Puntos de alrededor:** el panel ya los tiene en memoria (inventario). Si `MinimapaPropuesta` no los tiene en todas las operaciones, se toman de lo cargado. **No** hace falta una RPC nueva; si resultara necesaria, va con su DEC.
3. **Historial:** la vista o la RPC del historial lleva las mismas columnas nuevas.
4. **`docs/05`** (tabla de vistas), antes que el SQL.

**pgTAP** (`32_cola_ficha_completa.test.sql`):

- Una propuesta de `datos` trae `punto` con todos los campos y `punto_lat`/`punto_lng` iguales a la geometría del punto.
- Un `alta` trae `punto` nulo.
- `punto` no contiene `autor_*` ni correos.
- Solo un administrador puede leer la vista, como hoy.
- `npm run compatibilidad` en verde: el panel anterior no se rompe con columnas de más.

**Tests de pantalla:**

- Vitest de `DetallePropuesta`:
  - con una propuesta de datos, se ven todos los campos y solo el diámetro lleva "CAMBIA";
  - en un alta, el código dice "se asigna al aprobar";
  - en una ubicación, hay tres fotos y la primera dice "Foto actual del punto";
  - sin fotos nuevas, "no trae nuevas".
- Vitest de `MinimapaPropuesta`: en las seis operaciones hay mapa. Una ubicación se abre en Satélite y dibuja las dos posiciones y la flecha; un alta, el círculo de duplicado.
- e2e `panel-cola.spec.ts`:
  - a 1440 px, el detalle ocupa el ancho entero (el mapa mide igual que el detalle, ±2 px) y los botones están a la vista sin desplazar;
  - a 820 px y a 412 px, la cola y el detalle son dos pantallas, y "‹" vuelve a la cola.
- `panel-tableta.spec.ts`, al día.
- Capturas en los tres tamaños.

---

## 2. Ops

### RV-111 · Los mockups definitivos, dentro del repositorio · P2

1. **Al repositorio, en `docs/mockups/`:**

   | De | A |
   |---|---|
   | `docs/mockups-lista-y-ficha.html` | `docs/mockups/25-lista.html` |
   | `docs/mockups-ficha-banda.html` | `docs/mockups/25-ficha.html` |
   | `docs/mockups-cola-opcion-a.html` | `docs/mockups/25-cola.html` |

   - En `25-lista.html`, marca §2 y §3 como "superado: ver 25-ficha.html".
   - Comprueba con `detectar-secretos` que no llevan nada que no deba ser público. Son dibujos con datos de prueba ("Aron Ten", "Prueba Uno"…): cambia "Aron Ten" por "Voluntario de prueba" (FR-27, repositorio público).
2. **Los descartados** (`mockups-cola-con-mapa.html` y `mockups-cola-opcion-b.html`) **no** van al repositorio. Pide al desarrollador que los borre de su carpeta, o muévelos a una carpeta fuera del repositorio.
3. En `docs/06` §5 y en `docs/INDICE.md`, un enlace a cada mockup nuevo.

### P-15 · Producción al día al cerrar

Como `docs/24` P-14:

- Release, PR `develop → main` con merge commit, las dos aprobaciones del desarrollador y la paridad en verde.
- La migración 0036 en producción, con `npm run compatibilidad` contra la versión anterior.
- Anótalo en `paridad-produccion.md`, junto con una captura de la ficha en producción con un punto de cada estado.

---

## 3. Checklist final

- [ ] RV-105: regular en amarillo RAL 1003 en el mapa, la lista, la ficha, la leyenda y el panel, con el borde oscuro en el mapa claro; no queda ningún `naranja-estado`; los tests de contraste en verde.
- [ ] RV-106: la lista sin dirección y con la distancia; "sin revisar" en naranja de texto; la búsqueda por calle sigue funcionando.
- [ ] RV-107: ningún marcador sin revisar parece un engranaje; anillo exterior con 8 rayas.
- [ ] RV-108: la ficha con banda de estado arriba en móvil, tableta y ordenador; un solo botón principal.
- [ ] RV-109: "WGS84 · grados decimales" y "ETRS89 · UTM huso 30N" en la ficha, en "¿Qué hay aquí?", en la cola y al compartir.
- [ ] RV-110: en las seis operaciones, mapa arriba, todos los datos con lo que cambia marcado, fotos y botones fijos; en el ordenador, todo a todo el ancho del detalle.
- [ ] RV-112: en ninguna pantalla, exportación ni texto compartido se lee "racor": el campo es "Tipo de enganche", con Barcelona, Granada u Otro. Los datos y la API no cambian.
- [ ] RV-111: los tres mockups definitivos en `docs/mockups/`, sin nombres reales.
- [ ] `docs/01` en versión nueva; 05 y 06 al día.
- [ ] P-15: producción en la versión nueva, con la paridad en verde.

## 4. Lo que hace el desarrollador (no Claude Code)

1. **El amarillo a pleno sol:** mirar el mapa en el móvil, en la calle y a mediodía, antes de P-15. Si se lee mal, se ajusta el tono antes de pasar a producción.
2. **La conformidad de jefatura** sobre los cambios de 01: el color de regular, la ficha nueva, la cola nueva y "Tipo de enganche" en lugar de "Racor". Basta un sí por escrito, que se anota en la versión de 01.
3. **Borrar** de su carpeta `docs/` los dos mockups descartados, si Ops no los ha movido.
4. **P-15:** las dos aprobaciones de producción.
