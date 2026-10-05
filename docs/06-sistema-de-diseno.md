# 06 · Sistema de diseño y simbología — Mapa de hidrantes

| | |
|---|---|
| **Estado** | Congelado. Cambia con conformidad de jefatura y nueva versión. La escala de radios es la excepción: es un parámetro (`config.escala_radios`, FR-142) y se afina en campo sin tocar este documento; aquí constan los valores iniciales. |
| **Versión** | 1.21 — oct 2026 (`docs/28`, conformidad del desarrollador): detalle de la cola sin señales y sin subtítulo en el alta (§5, RV-115); tokens `--ambar-texto`, `--rojo-texto` y `--verde-texto` y tintes del panel oscuro (§2, RV-117); Voluntarios y Registro en tarjetas en el móvil (RV-116). Todo DEC-166. v1.20 — 5 de octubre de 2026 (`docs/27`, conformidad del desarrollador): la hoja de Cercanos con un botón por fila y los avisos de posición en el subtítulo (§4.7, Apéndice A; RV-114, DEC-165). v1.19 — 5 de octubre de 2026 (`docs/26`, conformidad del desarrollador): la etiqueta Jefatura de la barra superior es un enlace al panel con objetivo táctil de 44 px y texto marino (§5); "Panel de jefatura" en Ajustes y "Abrir el panel de jefatura" (Apéndice A; RV-113, DEC-164). v1.18 — 4 de octubre de 2026 (`docs/25`, conformidad del desarrollador): ficha con banda de estado (§5, RV-108, DEC-156); coordenadas con su sistema y la nota de la banda S (Apéndice A, RV-109, DEC-157); cola de revisión con mapa, datos completos y fotos (§5, Apéndice A, RV-110, DEC-158 y DEC-159); lista sin dirección (Apéndice A, RV-106); «Tipo de enganche» (Apéndice A, RV-112, DEC-163); enlaces a los mockups de docs/25 (§5, RV-111, DEC-162). v1.17 — 4 de octubre de 2026 (`docs/25`, conformidad del desarrollador): "sin revisar" pasa a un anillo exterior de 8 rayas y el borde queda continuo (§1, §2.4, §4.3, §4.5, §4.6, Apéndice A; RV-107, DEC-155). v1.16 — 4 de octubre de 2026 (`docs/25`, conformidad del desarrollador): colores de estado RAL, regular en amarillo con borde propio en el marcador (§2.2, §2.4, §4.3, §4.5, §4.6; RV-105, DEC-154). v1.15 — 3 de octubre de 2026 (`docs/24`, conformidad del desarrollador): dos fotos, Conexión y Sitio (§5, Apéndice A; RV-103, DEC-150). v1.14 — 3 de octubre de 2026 (`docs/24`, conformidad del desarrollador): estado Barro, marrón y tachado (§2.2, §4.3, §4.5, Apéndice A; RV-102, DEC-149). v1.13 — 3 de octubre de 2026 (`docs/24`, conformidad del desarrollador): bocas de 45, 70 u otra medida en los formularios (Apéndice A, RV-101, DEC-148). v1.12 — 3 de octubre de 2026 (`docs/24`, conformidad del desarrollador): fotos de referencia del racor (§5, RV-104). v1.11 — 3 de octubre de 2026 (`docs/24`, conformidad del desarrollador): menos texto en las pantallas de campo (§8, Apéndice A, RV-99); un primario por pantalla (§5, DEC-147, RV-100). v1.10 — 3 de octubre de 2026 (`docs/24`, conformidad del desarrollador): un estado de caudal que la app no conoce se dibuja como No funciona (§4.3, RV-102a). v1.9 — 23 de septiembre de 2026: §4.7, marcas de trabajo del incidente y la medición, sin colores nuevos (DEC-089); los textos de las funciones de mapa para emergencias se añaden al Apéndice A con cada función (GM-01 a GM-06). v1.8 — 22 de septiembre de 2026: el texto del aviso se oscurece para llegar a 4,5:1 sobre el fondo del aviso (DEC-081). v1.7: el estado regular pasa a naranja (DEC-076). v1.6: tope de zoom del mapa en §4.4 (DEC-075). v1.5: aviso de almacenamiento en Salud del sistema (DEC-073). v1.4: textos de la Fase 6 en el Apéndice A (DEC-063). v1.3: textos de la Fase 5 en el Apéndice A y el anillo de selección en oscuro (DEC-062). v1.2: textos de la Fase 4 (DEC-060). v1.1 — 17 de septiembre de 2026. Añade §10 (reglas de interfaz numeradas `UI-nn`) y el Apéndice A (textos exactos), tras revisar la especificación de la app de uniformidad (DEC-047). |
| **Propietario de** | colores, tipografía, espaciado, componentes y, sobre todo, la **especificación de la simbología del marcador**. La app del voluntario, el panel y el mapa base la aplican de forma idéntica. |
| **Complemento** | `06-sistema-de-diseno.html`: la misma especificación renderizada (muestras, las 12 combinaciones dibujadas por la fórmula, componentes, modo oscuro). |

---

## 1. Principios

1. **La información de estado viaja por dos canales como mínimo.** Forma para el tipo, color para el
   estado, tamaño para lo aprovechable, tachado para "no funciona", anillo de rayas para "sin revisar". Nada
   depende solo del color (TR-30).
2. **Legible en la calle.** A pleno sol, con guantes, deprisa: contraste alto, objetivos táctiles de
   44 px, texto de 16 px o más en el móvil, una acción principal por pantalla.
3. **Operativo, no decorativo.** Sin animaciones de adorno; solo movimiento que responde a una
   acción (abrir, confirmar, enviar). El modo oscuro existe porque de noche una pantalla blanca ciega.
4. **Una voz.** Español, frases cortas, verbos en infinitivo en botones ("Enviar para revisión"),
   sin mayúsculas de título en etiquetas, sin jerga técnica ("URL firmada" no aparece nunca en la
   interfaz).

---

## 2. Color

### 2.1 Tokens de interfaz (modo claro)

| Token | Hex | Uso |
|---|---|---|
| `--marino-950` | `#0E1B30` | barras superiores, títulos, botón primario del panel |
| `--marino-800` | `#152A4A` | acentos de callout |
| `--marino-700` | `#1D3A63` | enlaces, etiqueta "Ubicación", posición GPS |
| `--marino-600` | `#28517F` | halo de posición GPS, límite de zona (con opacidad .5) |
| `--naranja-600` | `#C94F16` | **acción primaria del voluntario** (Entrar, Enviar, botón +), pin arrastrable, badge de pendientes |
| `--naranja-500` | `#E97136` | icono del escudo |
| `--naranja-100` | `#FBE2D2` | fondo de badges naranja |
| `--oro-600` | `#B08A2E` | borde de avisos (duplicado, fuera de zona), etiqueta "Jefatura" |
| `--oro-100` | `#F3E6C4` | fondo de avisos |
| `--fondo` | `#F1F3EE` | fondo de pantalla |
| `--papel` | `#FFFFFF` | tarjetas, fichas, campos |
| `--linea` | `#D8DBD2` | bordes y separadores |
| `--texto` | `#1B2430` | texto principal |
| `--texto-suave` | `#5A6472` | texto secundario, etiquetas de campo |

El naranja de acción bajó de `#DD5A1F` a `#C94F16` el 20 sep 2026: con texto blanco encima se
quedaba en 3,78:1 y TR-31 pide 4,5:1. Cuando el naranja es **texto sobre una superficie** se usa
`--naranja-texto`: `#BE4811` en claro (4,56:1 sobre `--fondo`) y `#F0A070` en oscuro (DEC-072).
Igual con el ámbar, el rojo y el verde cuando son **texto o borde sobre `--papel` o `--fondo`** (DEC-166, `docs/28` RV-117): `--ambar-texto`, `--rojo-texto` y `--verde-texto` son `--ambar-700`, `--rojo-700` y `--verde-600` en claro, y `#E8B54A`, `#F28B82` y `#5FC48E` en oscuro, con ≥ 4,5:1 sobre las dos superficies (lo mide `accesibilidad.test.ts`). Sobre `--ambar-100`, `--oro-100` o `--rojo-100`, que no cambian en oscuro, se siguen usando los `-700`.

### 2.2 Tokens de estado (los cinco niveles de caudal)

Se usan **idénticos** en marcador, chip, leyenda y panel; no se retocan por contexto.

Son los colores de seguridad de ISO 3864 (UNE-EN ISO 7010) en RAL, los mismos que la escala de
caudal de NFPA 291: verde, amarillo y rojo (DEC-154).

| Estado | Relleno | Fondo del chip | Texto del chip | Borde del marcador (claro / oscuro) |
|---|---|---|---|---|
| bueno | `--verde-600` `#237E51` (RAL 6032) | `--verde-100` `#DCEEE1` | `--verde-700` `#1E6B45` | `--borde-marcador` blanco / blanco |
| regular | `--amarillo-500` `#F9A900` (RAL 1003) | `--amarillo-100` `#FFF1C2` | `--amarillo-800` `#6B4E00` | `--borde-marcador-regular` `#563E00` / `#111826` |
| malo | `--rojo-700` `#9B2423` (RAL 3001) | `--rojo-100` `#FBE0DB` | `--rojo-700` `#9B2423` | `--borde-marcador` blanco / blanco |
| barro | `--marron-600` `#806460` | `--marron-100` `#EFE3D6` | `--marron-700` `#5A4632` | `--borde-marcador` blanco / blanco |
| no funciona | `--gris-700` `#40453D` | `--gris-100` `#E5E4DC` | `#40453D` | `--borde-marcador` blanco / blanco |

Para **texto sobre `--verde-100`** (las etiquetas "bueno", "alta" y "resuelta") se usa
`--verde-700`: el `--verde-600` sobre ese fondo se queda en 4,16:1 y TR-31 pide 4,5:1.
El relleno del marcador sigue siendo el `--verde-600` de §4.2 (DEC-072). El RAL 6032 es `#237F52`;
se usa un punto más oscuro, `#237E51`, porque el otro se queda en 2,97:1 sobre el agua y los árboles
del mapa claro, donde el borde blanco no ayuda (DEC-154).

**Regular es amarillo RAL 1003** desde el 4 oct 2026 (DEC-154, que sustituye a DEC-076): el naranja
`#A85300` se parecía al rojo de "malo", también con daltonismo. El amarillo y el rojo se separan
además por su claridad (4,0:1), así que no dependen del tono. A cambio, el amarillo pide dos cosas:

- **Texto oscuro encima.** Donde el amarillo es fondo (el chip, la banda de la ficha), el texto va en
  `--marino-950` (8,79:1) o `--amarillo-800`, **nunca en blanco** (1,96:1).
- **Borde propio en el marcador** (`--borde-marcador-regular`, §4.3). Sobre el fondo del mapa claro
  el amarillo se queda en 1,66:1: lo separa un borde `#563E00` (8,53:1 sobre el fondo, 3,10:1 sobre
  los rótulos, 5,13:1 contra el relleno). Es el `#5C4300` de los mockups un punto más oscuro, porque
  aquel se quedaba en 2,87:1 sobre los rótulos. En el mapa oscuro manda el relleno (de 4,56:1 sobre
  las calles a 7,84:1 sobre el fondo) y el borde es `#111826`: uno blanco no se separaría del
  amarillo. Sobre los rótulos del mapa oscuro (`#7E8A99`) el relleno se queda en 1,79:1, y ahí lo
  separa ese borde oscuro (5,06:1).

El amarillo de estado **no es el de aviso**: `--oro-*` y `--ambar-*` (duplicado, fuera de zona,
propuesta pendiente) se quedan como están, más apagados, como borde y fondo de avisos.

**Barro** (`docs/24` RV-102, DEC-145 y DEC-149): el `#6B4423` propuesto se confundía con `--rojo-700` con
protanopía (ΔE2000 1,1). El relleno `#806460` queda a ΔE2000 ≥ 15 de Regular y de Malo con visión
normal, protanopía y deuteranopía simuladas (Machado 2009), y a ≥ 3:1 sobre todas las superficies del
mapa claro; sobre el oscuro vale el borde blanco, como para `--gris-700`. El texto del chip es el
marrón oscuro (7,1:1 sobre `--marron-100`). Lo mide `src/lib/accesibilidad.test.ts`.

Historia: el regular fue ámbar `#8A6408` hasta el 21 sep 2026, cuando pasó a naranja `#A85300`
porque el ámbar se leía marrón mostaza en el móvil a pleno sol (DEC-076); el 4 oct 2026 pasó al
amarillo RAL 1003 (DEC-154), que es mucho más claro. El `--ambar-*` sigue existiendo para lo que es **aviso** (señales de fiabilidad, diferencias,
propuesta pendiente): eso no es caudal. Como aviso es **texto**, y el texto del aviso va sobre
`--oro-100`: ahí el `#8A6408` de antes se quedaba en 4,33:1 y TR-31 pide 4,5:1, así que
`--ambar-700` es `#7F5C07` desde el 22 sep 2026 (4,93:1 sobre el oro; DEC-081). De relleno de
marcador le bastaba con 3:1 y por eso nadie lo había medido como texto.

Contraste sobre cualquier superficie del mapa claro y oscuro (§2.3): el relleno o su borde llegan a
3:1, y el relleno se separa de su borde a 3:1 (TR-31). Lo mide `src/lib/accesibilidad.test.ts` con
los tokens leídos de `src/index.css`.

### 2.3 Colores del mapa base propio

| Elemento | Claro | Oscuro |
|---|---|---|
| Fondo | `#EFECE3` | `#1B2536` |
| Manzanas / edificios | `#E2DED3` | `#25314A` |
| Calles | `#FFFFFF` | `#3B4A64` |
| Zonas verdes | `#D3E0C6` / árboles `#BACFA8` | `#233A2E` / `#2E4A38` |
| Agua | `#B9CBD6` | `#2C4358` |
| Rótulos de calle | `#8A9090` | `#7E8A99` |
| Límite de zona | `#28517F` discontinuo `9 7`, opacidad .45 | `#7FA3D6` discontinuo, opacidad .55 |

Las capas en línea (OSM, PNOA, Catastro) no se recolorean.

### 2.4 Modo oscuro (interfaz)

| Token | Oscuro |
|---|---|
| fondo de pantalla | `#111826` |
| barra superior | `#0A111E` |
| tarjetas | `#1A2333` |
| bordes | `#2A3547` |
| texto | `#E6EAF0` |
| texto secundario | `#9AA8BE` |
| controles flotantes del mapa | `rgba(20,29,45,.94)` |
| badge pendientes | fondo `#3A2A1E`, texto `#F0A070` |
| anillo del marcador seleccionado (`--anillo-seleccion`) | `#E6EAF0` (el `--marino-950` de claro no se ve sobre el mapa oscuro; DEC-062) |
| anillo de "sin revisar" (`--anillo-sin-revisar`) | `#C9CFD8` (en claro es `--texto-suave`; §4.3, DEC-155) |

Los rellenos de estado y el naranja de acción **no cambian**, y el **borde del marcador sigue
blanco** (`--borde-marcador`): es lo que lo separa del mapa. La excepción es el amarillo de regular,
cuyo borde (`--borde-marcador-regular`) pasa a `#111826`, porque allí ya lo separa su relleno (§2.2,
DEC-154). Un borde oscuro sobre el mapa oscuro se
queda en 1,16:1 y el marcador se pierde; con el blanco, el borde contra el mapa da 13,6:1 y el
relleno contra el borde, entre 5,0:1 y 9,8:1 (TR-31, medido en `src/lib/accesibilidad.test.ts`;
DEC-072).

---

## 3. Tipografía

| Rol | Familia | Pesos | Uso |
|---|---|---|---|
| Títulos y barras | **Barlow Condensed** | 600, 700 | barra de la app (16 px), títulos de sección, cabeceras de tarjeta en el panel |
| Texto | **Source Sans 3** | 400, 500, 600, 700 | todo lo demás; móvil ≥ 16 px cuerpo, 12,5–13 px secundario; panel 12,5–14,5 px |
| Códigos y datos | **JetBrains Mono** | 500 | `HID-0147`, coordenadas, código de acceso (17 px, espaciado 3 px) |

Reserva: `sans-serif` del sistema. Las fuentes se sirven **desde el propio despliegue**, no desde
Google Fonts, para que carguen sin conexión y no cambien la maquetación (TR-01).

Escala móvil: 22 / 17 / 16 / 13 / 11 px. Escala panel: 17 / 15 / 13 / 12,5 / 11 px. Interlineado
1,6 en párrafos, 1,2 en títulos.

---

## 4. Simbología del marcador (implementar exactamente así)

### 4.1 Fórmula

```
capacidad  = {100: 3, 70: 2, 45: 1}[diametro_mm]
factor     = {bueno: 1.0, regular: 0.66, malo: 0.33, no_funciona: 0}[caudal]
puntuacion = capacidad × factor

radio_px = R1  si puntuacion ≥ 3.0      // 100 · bueno
           R2  si puntuacion ≥ 1.9      // 100 · regular, 70 · bueno
           R3  si puntuacion ≥ 0.9      // 100 · malo, 70 · regular, 45 · bueno
           R4  si puntuacion > 0        // 70 · malo, 45 · regular, 45 · malo
           R5  si puntuacion = 0        // no funciona (cualquier diámetro)

escala_radios inicial = [R1, R2, R3, R4, R5] = [11, 9, 7, 5.5, 5]
```

El cálculo vive en la vista `v_puntos_activos` (05 §4) con los radios leídos de `config`; el
cliente no lo reimplementa. Los tests unitarios cubren las 12 combinaciones.

### 4.2 Las doce combinaciones

| Diámetro | bueno | regular | malo | no funciona |
|---|---|---|---|---|
| **100 mm** (hidrante) | R1 · 11 px | R2 · 9 px | R3 · 7 px | R5 · 5 px |
| **70 mm** (hidrante) | R2 · 9 px | R3 · 7 px | R4 · 5,5 px | R5 · 5 px |
| **45 mm** (boca de riego) | R3 · 7 px | R4 · 5,5 px | R4 · 5,5 px | R5 · 5 px |

### 4.3 Forma, borde y variantes

| Atributo | Especificación |
|---|---|
| Hidrante | círculo, `r = radio_px` |
| Boca de riego | cuadrado de lado `2 × radio_px`, esquinas `rx = 3` (a 5,5 px, `rx = 2.5`; a 5 px, `rx = 2`) |
| Borde | `--borde-marcador`, blanco en claro y en oscuro (DEC-072), 2,5 px (2 px si `radio_px ≤ 5.5`). **Regular** lleva `--borde-marcador-regular`: `#563E00` en claro y `#111826` en oscuro (§2.2, DEC-154). Es el mismo dibujo en el mapa, la lista, la ficha, la leyenda, el panel y el minimapa |
| Relleno | color de estado (§2.2) |
| Barro | tamaño mínimo y la misma línea blanca cruzada que No funciona, **sin** atenuar: el tachado dice "no se puede usar" y el color marrón dice por qué (FR-61, WCAG 1.4.1) |
| No funciona | opacidad **0,5** + línea blanca cruzada de 2 px de esquina inferior izquierda a superior derecha, largo `2 × radio_px` |
| Estado desconocido | un `caudal` que esta versión de la app no conoce (el servidor añadió uno nuevo y el móvil aún no se ha actualizado) se dibuja **como No funciona**: color `--gris-700`, radio mínimo, opacidad 0,5 y tachado. La ficha dice "Estado desconocido · actualiza la aplicación" y la lista lo cuenta con No funciona (`docs/24` RV-102a) |
| Sin revisar > `meses_revision` | **anillo exterior discontinuo** de 1,5 px, `--anillo-sin-revisar` (`--texto-suave` en claro, `#C9CFD8` en oscuro), separado 2,5 px de la cara exterior del borde; el borde sigue **continuo** y el marcador mantiene tamaño y color. Las rayas se calculan para que salgan **8** sea cual sea el tamaño: `dash = gap = perímetro / 16`. En la boca, un cuadrado concéntrico (esquina `rx` del marcador + lo que se separa) con el perímetro del cuadrado redondeado. Si además está seleccionado, el anillo de selección va 2 px por fuera de este. En un lienzo pequeño (lista, leyenda, ficha) el dibujo se escala lo justo para que el anillo no se recorte, igual para un punto revisado que para uno sin revisar del mismo radio (DEC-155) |
| Seleccionado | anillo exterior `--marino-950` de 2 px a 3 px del borde (en oscuro, `--anillo-seleccion` de §2.4) |
| Propuesto (solo panel) | pin naranja `--naranja-600` con punto blanco; el punto existente en comparación, con opacidad .8 |
| Posición del usuario | punto `--marino-600` r 4,5 con borde blanco 1,5 y halo del mismo color con opacidad .16 cuyo radio representa la precisión GPS |
| Objetivo táctil | **≥ 44 × 44 px** alrededor de cada marcador, independiente del radio dibujado |

### 4.4 Declutter por zoom

| Zoom | Se dibujan |
|---|---|
| z ≤ 13 | solo `radio_px ≥ 9` (R1, R2) |
| 14 ≤ z ≤ 15 | `radio_px ≥ 7` (R1–R3) |
| z ≥ 16 | todos |

Sin agrupación en racimos: destruiría la semántica del tamaño (FR-64).

**Hasta dónde se acerca:** z10 a **z21**, en el mapa del voluntario y en el del alta. Ninguna capa
tiene teselas tan abajo, así que cada una declara hasta dónde llegan las suyas (OSM z19, PNOA z20) y
se amplía la última; el Catastro es WMS y dibuja a cualquier escala. Si una capa declarara menos
zoom que el mapa, Leaflet la quitaría entera al pasar de su tope y la pantalla se quedaría en blanco
(DEC-075).

### 4.5 Leyenda

Plegable (§5, DEC-123): la primera vez y cuando se despliega, en el mapa (móvil: esquina inferior izquierda, dos columnas, 7,5–8 px; escritorio:
igual con 9–10 px). Contenido fijo y en este orden:

1. ● Hidrante · ■ Boca de riego (forma)
2. Regular · Malo · Barro · No funciona (color; "bueno" ya va implícito en la primera fila con relleno verde). Cada muestra lleva el borde de su estado (§4.3): la de Regular, amarillo con el borde oscuro
3. Sin revisar (anillo exterior de rayas, DEC-155)
4. Línea final: "Más grande = más agua aprovechable"

### 4.6 Ejemplos de lectura

- Círculo grande verde: hidrante de 100 mm que funciona bien. El mejor recurso de la zona.
- Cuadrado pequeño amarillo: boca de riego que da menos de lo que podría.
- Punto gris pequeño tachado: no se pudo usar; hay que comunicarlo, pero no compite visualmente.
- Cualquiera con un anillo de rayas alrededor: el dato es el último conocido, pero tiene más de un año.

### 4.7 Marcas de trabajo (incidente, medición y "¿Qué hay aquí?")

Sin colores nuevos: los de caudal significan estado y no se usan para otra cosa (DEC-089). Todas van
por encima de los marcadores y no se guardan.

| Marca | Claro | Oscuro (§2.4) |
|---|---|---|
| **Incidente** | diana de 32 px (icono `Crosshair` de lucide) en `--marino-950` sobre un círculo `--papel` con borde de 2 px `--marino-950` | diana y borde `--anillo-seleccion` (`#E6EAF0`) sobre círculo de tarjeta `#1A2333` |
| **Líneas del incidente a cada candidato** | discontinuas de 2 px `--marino-600` | discontinuas de 2 px `--anillo-seleccion` con opacidad .7 |
| **Medición** | línea continua de 3 px `--marino-950`; vértices de 10 px `--papel` con borde `--marino-950`; etiqueta de distancia en `font-datos`, a 14 px de la línea en perpendicular al tramo, sobre `--papel` al 85 % con radio 4 (docs/19 RV-67) | línea y bordes `--anillo-seleccion`; vértices de tarjeta `#1A2333` |
| **"¿Qué hay aquí?"** (pin soltado) | icono `MapPin` de lucide en `--marino-950` | `--anillo-seleccion` |
| **Calle resaltada** (resultado de búsqueda) | línea de 4 px `--marino-600` durante la sesión | `--anillo-seleccion` con opacidad .7 |

Los controles que las abren (*Cercanos*, botón extendido con texto abajo a la derecha; *Medir*, icono de la columna de la derecha; la hoja de *¿Qué hay aquí?*) siguen §5 y §9: ≥ 44 px,
texto visible en móvil y ningún control muerto (UI-01, UI-02).

**La hoja de *Cercanos*** (FR-74, docs/27 RV-114, DEC-165; mockup en [`mockups/27-cercanos.html`](mockups/27-cercanos.html)) enseña solo lo que hace falta en un servicio:

- **Cabecera:** *Cercanos* en `--font-titulo` (Barlow Condensed) de 22 px y, en la misma línea, el subtítulo en 13 px `--texto-suave`: "· en línea recta" (con un punto marcado a mano, "· desde el punto marcado · en línea recta"). A la derecha, el chevron de ampliar o reducir (solo en la hoja del móvil y la tableta) y la X.
- **Avisos, solo cuando importan y en la misma línea del subtítulo**, sin recuadros: la posición vieja ("· posición de hace 5 min") o la poco precisa ("· posición poco precisa (±80 m)", más de 50 m, con el enlace *Marcar en el mapa* al lado, de 44 px de alto). Van en `--naranja-texto` y seminegrita, y el subtítulo pasa a `role="status"`. Uno solo a la vez: si la posición es vieja y además poco precisa, gana el de poco precisa, que lleva acción.
- ***Solo hidrantes***: un chip (`--radius-chip`, borde `--linea`, 14 px) con su casilla, alineado a la izquierda; sigue siendo un `role="switch"` con 44 px de área táctil.
- **Cada fila**, en tarjeta: el marcador (`MarcadorSvg`, 26 px); el código en `--font-datos` de 17 px y, debajo, "100 mm · Regular" en 13,5 px `--texto-suave`; a la derecha del texto, la distancia en `--font-datos` de 18 px y, debajo, el rumbo en 12,5 px `--texto-suave`; al final, **un solo botón, *Cómo llegar***: 44 × 44 px, fondo `--marino-950`, icono de navegación blanco y borde de 1,5 px `--texto` (en oscuro separa el botón de la tarjeta). Tocar el resto de la fila abre la ficha. La distancia va en `--texto`, no en `--marino-950`: el marino no se lee sobre la tarjeta oscura (§2.4), y en claro son casi el mismo color.
- **Nada más:** ni tramos ni *Medir tendido* (siguen en *Medir*, FR-76), ni la fecha de revisión ni el tipo en palabras (la forma del marcador lo dice), ni "El más cercano…", ni *Compartir el incidente* (compartir sigue en la ficha y en *¿Qué hay aquí?*), ni "Datos de hace N" (lo dice la barra de estado). En ordenador, la columna enseña lo mismo y en el mismo orden.

---

## 5. Componentes

Mockups de `docs/25` (referencia visual; si no coinciden con este documento, manda el documento): la lista en [`mockups/25-lista.html`](mockups/25-lista.html) (solo §1), la ficha con banda de estado y los colores en [`mockups/25-ficha.html`](mockups/25-ficha.html), y la cola de revisión en [`mockups/25-cola.html`](mockups/25-cola.html).

| Componente | Especificación |
|---|---|
| **Barra superior** (móvil) | `--marino-950`, 16 px Barlow 600, título a la izquierda, acción a la derecha en círculo 22 px `rgba(255,255,255,.16)`. Etiqueta **Jefatura**: `--oro-600`, 9 px, radio 4, texto `--marino-950` en negrita (el blanco sobre `--oro-600` se queda en 3,2:1) con un chevron `›` detrás; es un **enlace al panel** (`/admin`, nombre accesible "Abrir el panel de jefatura") con un objetivo táctil de 44 × 44 px que crece con relleno, sin agrandar la etiqueta. Si no cabe, se acorta el título con "…", nunca la etiqueta. En los formularios de las operaciones la etiqueta no es un enlace, para no perder lo escrito (RV-113, DEC-164). |
| **Barra de estado** (móvil) | debajo de la barra: "Sincronizado hace N min" y badge "N sin enviar" (`--naranja-100`/`--naranja-600`). Sin cobertura: banda `--gris-700` con texto blanco 9,5 px. |
| **Botón primario** | `--naranja-600`, blanco, 600, 13 px, alto ≥ 44 px, radio 9. Deshabilitado: `--linea` con `--texto-suave` **y una línea debajo que dice por qué** ("Falta la foto para poder enviar"). |
| **Un primario por pantalla** | Una pantalla o una hoja tiene **como mucho un botón primario**, arriba del grupo de acciones, y es la acción más usada. No se inventa un primario donde no hay una acción clara (en la ficha es *Cómo llegar*, `docs/25` RV-108). En *¿Qué hay aquí?* es *Añadir un punto aquí*, el mismo naranja del + del mapa: un color dice "añadir" en toda la app (DEC-147). |
| **Botón secundario** | blanco, borde 1,5 px `--marino-950`, texto `--marino-950`. |
| **Botón destructivo** | `--rojo-700` relleno (confirmar retirada / rechazo / cambio de código). |
| **Segmentado** (`.seg`) | opciones iguales, borde `--linea`, activa `--marino-950` con blanco. Para tipo y diámetro. |
| **Píldoras de estado** (`.pillrow`) | una por nivel; la activa usa fondo y texto de su color de estado y borde del relleno. |
| **Campo** | blanco, borde `--linea`, radio 7, 12–16 px; etiqueta encima 11 px 600 `--texto-suave`; pista debajo 9,5 px. Campo obligatorio no cumplido: borde del color del estado que lo exige (`--naranja-600` para la foto). |
| **Chips** (`.chip`) | radio 999, 3 × 11 px, 13 px 600, punto de 8 px; colores de §2.2; neutro `#EDEEE8`/`--texto-suave`; azul `#DCE6F2`/`--marino-700` para "Ubicación"/"Revisión". |
| **Etiquetas de operación** (panel) | alta verde, revisión azul, estado ámbar, datos gris, ubicación gris, retirada rojo; 9,5 px 700, radio 4. |
| **Tarjeta** (`.card-mini`) | blanco, borde `--linea`, radio 9, 9 × 10 px. |
| **Hoja inferior** (`.sheet`) | radio 16 arriba, asa de 34 × 4 px, sombra `0 -6px 20px rgba(14,27,48,.22)`, sobre un velo `rgba(14,27,48,.38)`. Filas de 44 px con icono 26 px, título 11,5 px y descripción 9,5 px. |
| **Aviso** (`.warn-callout`) | `--oro-100` fondo, borde `--oro-600`, texto `--ambar-700` (`#7F5C07`, DEC-081), ⚠ delante. Nunca bloquea. |
| **Toast** | `--verde-600`, blanco, radio 9, arriba bajo la barra, con cierre; para "tu propuesta se aprobó". |
| **Dos fotos** (alta y corregir ubicación, `docs/24` RV-103) | dos huecos iguales lado a lado, cada uno con una sola palabra: **Conexión** y **Sitio**; vacío, botón de borde `--naranja-600` con la cámara y la palabra; hecho, fondo `--verde-100` con "Sitio · N kB" y "repetir". En la ficha, la de la conexión; si hay foto del sitio, debajo dos botones de 44 px con un punto y su palabra para pasar de una a otra (también deslizando). En el panel, las dos lado a lado, cada una con su palabra. |
| **Foto** | en la ficha, 150 px de alto en el móvil y 170 px en tableta y ordenador, a todo el ancho y recortada (`object-cover`); con las dos fotos, etiqueta "Conexión · 1/2" abajo-izquierda sobre `rgba(14,27,48,.78)`. Sin foto no se enseña nada; si la hay y no carga, se dice con palabras. Placeholder mientras carga: degradado gris-azulado. |
| **Ficha de un punto** (`docs/25` RV-108, DEC-156) | De arriba abajo: (1) **banda** del color del estado a todo el ancho, con el estado en mayúsculas en Barlow Condensed 700 de 24 px, debajo "revisado hace N · fecha" en 13 px ("sin revisar desde hace N" si toca revisarlo) y la X de cerrar a la derecha. El texto es blanco sobre verde, rojo, gris y marrón, y `--marino-950` sobre el amarillo; un test mide ≥ 4,5:1 en todos. (2) Código en JetBrains Mono de 21 px y, en texto suave, el núcleo y "a N m de ti". (3) Foto. (4) **Rejilla** de dos columnas con línea de 1 px: Tipo y Diámetro; en bocas, además, Tipo de enganche y Dirección; en hidrantes, la Dirección a todo el ancho. Debajo, a todo el ancho, el fallo (solo en No funciona) y la descripción libre. (5) **Cómo llegar**, el único primario (`--marino-950`, blanco, 46 px), con **Compartir** como botón de icono de 46 px con `aria-label`; debajo, **Proponer un cambio** en `--papel` con borde `--naranja-600` y texto `--naranja-texto`. (6) Coordenadas en los dos sistemas (RV-109). (7) "Datos sincronizados hace N", suave y centrado. Sin chips ni tarjetas sueltas de dirección o revisión: la revisión solo está en la banda. **Móvil:** la ficha sigue siendo una pantalla propia (como hoy), y su barra lleva el código y la flecha de volver; por eso la banda va sin X y el código no se repite a la vista (UI-16). **Tableta y ordenador:** ficha flotante (`ANCHO_FICHA`), con la banda como cabecera redondeada. |
| **Tipo de enganche de referencia** | en una boca de riego el campo se llama «Tipo de enganche» (el dato es `racor`, DEC-163); tres tarjetas iguales en este orden: Barcelona, Granada y Otro; Barcelona y Granada con su foto real de 48 × 48 px encima del nombre (`alt=""`: el nombre ya va en el botón) y «Otro» sin foto; la elegida con borde `--marino-950` doble. Tocar la foto elige, sin ampliar. Las fotos (`public/racores/*.webp`, 160 × 160, ≤ 25 kB) las pone el desarrollador y las prepara `scripts/preparar-racores.ts`; entran en el precache. Sin la foto, la tarjeta se ve solo con el nombre, nunca con un icono roto (`docs/24` RV-104). |
| **Minimapa de los formularios** | 336 px de alto, pin arrastrable y botón "Mi posición" arriba a la derecha; no se recentra solo (DEC-066). |
| **Controles del mapa** | blancos, radio 7–9, sombra `0 1px 5px rgba(0,0,0,.18)`. Patrón de las apps de mapas (DEC-123): herramientas arriba a la derecha y acciones principales abajo, al alcance del pulgar. **Búsqueda** arriba, ancho completo. **Columna de la derecha**, solo iconos: 44 px de ancho fijo, pegada al borde con 8 px de margen (`right-2`), con los botones alineados a su borde derecho; de arriba abajo, Capas, Medir y Mi posición (44 × 44, con `aria-label` y `title`) y el zoom "+/−" en **una sola pieza** vertical de 44 × 88 con separador (alternativa de un dedo al pellizco, WCAG 2.5.1). **Abajo a la derecha**: "Cercanos" como botón extendido (icono `Crosshair` y texto visible, 48 px de alto, `--marino-950` con texto blanco) encima del **botón + de nuevo punto**, flotante de **56 px** `--naranja-600`, con 12 px entre los dos (UI-15); igual en ordenador, con la lista lateral a la izquierda. **Leyenda** abajo a la izquierda, plegada en una ficha "Leyenda" de 44 px: al tocarla se despliega (§4.5) y se cierra con la X o tocando fuera; el primer uso la enseña desplegada una vez y después se recuerda cómo la dejó el voluntario. Atribución abajo a la derecha, 6,5 px, sin que la toquen los botones. La ficha flotante (tableta y ordenador) va a la izquierda de la columna y termina por encima de los botones de abajo: no tapa ningún control. Las medidas viven en `src/lib/disposicion-mapa.ts` (`CONTROLES`): las usan la ficha, los avisos flotantes y el encuadre del incidente. Resultados de la búsqueda (FR-73): en grupos, por este orden, *Coordenadas*, *Puntos*, *Calles y lugares* (© OpenStreetMap) y *Direcciones* (CartoCiudad · IGN), cada fila de ≥ 52 px; mientras están abiertos en el móvil y la tableta, la columna de la derecha se oculta, porque la lista la taparía a medias. |
| **Navegación inferior** | 50 px, blanco, tres destinos (Mapa · Lista · Ajustes), activo `--marino-950` 700. |
| **Panel: pestañas** | fondo `#F5F6F2`, activa blanca con borde inferior 2 px `--naranja-600`, badge naranja para pendientes y gris para totales. Sin salto de línea; scroll horizontal si no cabe. |
| **Panel: tablas** (`.desktop-table`) | 12 px, cabecera Barlow 11 px `--texto-suave` con borde inferior 2 px `--marino-950`, celdas 6 × 10 px, códigos y Ø sin salto de línea, cabeceras ordenables con ▲▼. |
| **Panel: diff** | dentro de "Datos del punto" (abajo): valor anterior tachado `--rojo-700` opacidad .75 → nuevo `--verde-600` 600. |
| **Panel: detalle de la cola** (DEC-158) | igual en las seis operaciones, de arriba abajo y a todo el ancho del detalle: título (Barlow 22 px) con autor, antigüedad, fecha y núcleo (sin chips de señales, DEC-166); **mapa** de 300 px (≥ 1.100 px), 280 (tableta) y 200 de borde a borde y fijo arriba (móvil), con el punto rodeado de un anillo `--anillo-seleccion`, los de alrededor a opacidad 0,55, el pin propuesto `--naranja-600` con punto blanco, el círculo de duplicado discontinuo `--oro-600` con el código del que choca, y en una ubicación la posición de ahora en gris unida a la propuesta por una flecha discontinua con los metros; Mapa / Satélite arriba a la derecha (Satélite en las ubicaciones), zoom abajo a la derecha, "Abrir en grande" abajo a la izquierda y una leyenda de una línea debajo. **Datos del punto**: título Barlow 17 px con "N cambios · el resto se queda igual" (en un alta, solo el título); rejilla de dos columnas (una en el móvil) separadas por 1 px `--linea`, etiqueta a la izquierda y valor a la derecha; lo que cambia va primero, con fondo cálido (`#FFF8EC` en claro), banda `--naranja-600` de 4 px a la izquierda y "Cambia" en `--naranja-texto` 10,5 px mayúsculas bajo la etiqueta (y "N cambios" también en `--naranja-texto`); el antes tachado en `--rojo-texto`, sin transparencia; el estado con su chip; código y coordenadas en JetBrains Mono. **Fotos** lado a lado, 200 px (ordenador), 220 (tableta), 110 (móvil), etiqueta abajo a la izquierda sobre `rgba(14,27,48,.8)`, o `--naranja-600` si es nueva frente a la actual. **Botones** fijos abajo sobre `--papel` con borde superior; por debajo de 1.100 px, repartidos a lo ancho, y en el móvil "Corregir" en lugar de "Aprobar con correcciones". **Sin chips de señales** (DEC-166): con núcleo y fuera de zona, la cabecera dice "[núcleo] · Fuera de zona"; si el duplicado no está en el inventario cargado, un recuadro `--oro-100`/`--oro-600` con "Posible duplicado de [código] · a [distancia]…" donde iría la comparación; "Fotos" lleva "llegó sin foto del sitio (versión anterior de la app)" en pequeño si toca; el aviso de desactualizada se repite encima de Corregir y Fusionar. En oscuro, la tabla de comparación y la caja de Fusionar usan un tinte `color-mix` de `--oro-600` sobre `--papel` (en vez de `--ambar-100`), para que el texto `--ambar-texto` se lea. El contenedor del mapa es `role="group"` (lleva controles de zoom dentro). |
| **Panel: cola en tableta y móvil** (DEC-158) | por debajo de 1.100 px, la cola y el detalle son dos pantallas: el detalle ocupa la pantalla con una barra `--marino-950` con "‹" y el título. Cada fila de la cola lleva un mapita de 62 × 48 px, radio 6, con el mapa base propio y el punto (naranja si es propuesto, marino si existe). Abajo, una barra `--marino-950` dice "Toca una para revisarla" o, con propuestas marcadas, aprueba o rechaza en bloque. |
| **Panel: hoja de campo** | una página por núcleo, tabla en blanco y negro con casilla vacía para anotar; al imprimir solo se ve la hoja (FR-122, DEC-067). |
| **Panel: acciones** | Aprobar `--verde-600` relleno; Aprobar con correcciones borde `--marino-950`; Fusionar borde `--oro-600` texto `--ambar-700`; Rechazar borde `--rojo-700`; Confirmar y aprobar (desactualizada) `--rojo-700` relleno. |

---

## 6. Espaciado y radios

Base 4 px. Márgenes de pantalla móvil 12 px; separación entre tarjetas 8 px; entre campo y etiqueta
4 px; entre bloques de formulario 10 px. Radios: campos 7, tarjetas 9, botones 9, hoja 16, pantalla
del teléfono 20, controles del mapa 7–9, chips 999.

---

## 7. Iconografía

Sin librería de iconos en la versión 1: emojis del sistema en los mockups (🗺️ 📋 ⚙️ 📷 🔍) se
sustituyen en la aplicación por **Lucide** (trazo 1,75 px, 20 px en móvil, 16 px en panel), un solo
estilo. Los seis iconos de operación: `check` (sigue igual), `activity` (actualizar estado),
`pencil` (corregir datos), `crosshair` (corregir ubicación), `x` (proponer retirada), `plus` (alta).

---

## 8. Voz y textos

- Español, tuteo al voluntario ("Arrastra el pin", "Tu alta se aprobó"), tono neutro en el panel.
- Botones: verbo + objeto, en infinitivo, sentence case: "Enviar para revisión", "Aprobar con
  correcciones", "Generar uno nuevo". El botón conserva el nombre en todo el flujo: "Aplicar ahora"
  produce "Aplicado".
- Errores: qué pasó y qué hacer, sin disculpas ni códigos internos: "Falta la foto para poder
  enviar", "Espera una hora antes de volver a intentarlo".
- Vacíos: una invitación a actuar: "No queda ninguna propuesta pendiente. Buen trabajo."
- Fechas relativas con la absoluta al lado: "20 ago 2026 · hace 1 mes".
- Nunca "defecto": el cuarto nivel se llama **No funciona** en toda la interfaz (DEC en 12).
- Términos fijos del glosario de 00 §6.
- **Pantallas de campo** (`docs/24` RV-99): enseñan **solo** lo que el voluntario necesita para decidir
  o lo que evita un error que de verdad se comete. Las definiciones van a la sesión presencial y a la
  ayuda (FR-94), no debajo de los campos. Un campo nuevo tiene que servir a jefatura para aprobar o a
  quien acude a un incendio; si no, no se añade. Lo que ya dice la banda de conexión de arriba no se
  repite al pie del formulario.

---

## 9. Reglas de interfaz (`UI-nn`)

Reglas verificables, no gustos. Se citan por su identificador en las issues y en la definición de
terminado; los casos de aceptación AC-140 a AC-146 las comprueban.

### 9.1 Nada muerto, nada mudo

| ID | Regla |
|---|---|
| UI-01 | **Ningún control muerto.** Todo elemento sobre el que se pueda pulsar lleva a una pantalla, abre un diálogo, cambia un estado visible o produce un aviso. Si algo aún no existe, no se dibuja. |
| UI-02 | **Ningún botón deshabilitado sin explicación.** Debajo, en 9,5–11 px, dice qué falta ("Falta la foto para poder enviar", "Elige el estado"). |
| UI-03 | **Toda lista tiene estado vacío** con una frase útil y, si procede, la acción que lo resuelve ("No queda ninguna propuesta pendiente. Buen trabajo."). Nunca una tabla vacía sin texto. |
| UI-04 | **Todo fallo se ve.** Una acción que no funciona muestra qué pasó y qué hacer, en español y sin códigos internos (05 §8 los traduce). Nunca un fallo silencioso. |
| UI-05 | **Toda acción con efecto muestra confirmación**: aviso breve ("Aprobada HID-0147"), cambio inmediato de la pantalla, o ambos. |
| UI-06 | **Toda acción destructiva pide confirmación** explícita, con el efecto escrito (qué se borra, a cuántos afecta, si es reversible y durante cuánto tiempo). |

### 9.2 Legibilidad y separación (defectos que ya se han visto)

| ID | Regla |
|---|---|
| UI-10 | **Nada de texto pegado.** Nunca `HID-0147C/ Real 14` ni `100 mmBueno`: los datos compuestos se separan con ` · ` (espacio, punto medio, espacio) o van en líneas distintas. |
| UI-11 | **Notación canónica de los datos compuestos**, siempre igual: punto `HID-0147 · Hidrante 100 mm`; estado y revisión `Bueno · revisado hace 1 mes`; boca de riego `BOC-0088 · 45 mm · enganche Granada`; propuesta en la cola `Autor · hace 2 h · C/ Real 14 · Albolote`; sin dato, `sin dirección` en `--texto-suave`, nunca un hueco. |
| UI-12 | **Fechas** siempre relativas con la absoluta disponible (`hace 1 mes`, con `20 ago 2026` en el detalle). **Distancias** en metros hasta 999 y en km con un decimal después. |
| UI-13 | **Los códigos internos no se muestran al voluntario** salvo el del propio punto (`HID-####`, que es su nombre). Identificadores de dispositivo, de propuesta y de foto no aparecen en la app; en el panel, solo donde sirven. |
| UI-14 | **Acciones destructivas separadas** de las afirmativas: ≥ 12 px entre "Aprobar" y "Rechazar…", entre "+" y "×"; nunca contiguas ni del mismo color. |
| UI-15 | **Objetivos táctiles ≥ 44 × 44 px** en móvil, con ≥ 8 px entre controles adyacentes, aunque el elemento dibujado sea menor (marcadores del mapa). Única excepción: los botones de una **pieza unida**, como el zoom "+/−" del mapa (§5, DEC-123), que van juntos con un separador. |
| UI-16 | **Un dato, un lugar en la pantalla.** El mismo valor no se repite en dos sitios de la misma vista (el código ya está en la cabecera: no se repite en la ficha). |

### 9.3 Textos

| ID | Regla |
|---|---|
| UI-20 | **Todos los textos de interfaz viven en un único módulo** `src/lib/textos.ts` (objeto `T`), agrupados por pantalla. Ningún literal suelto en un componente. Facilita revisarlos de una vez y traducirlos si algún día hace falta. Lo vigila una regla de ESLint; el marcado, las columnas de PostgREST y los mensajes de `Error` no son texto de interfaz (DEC-095). |
| UI-21 | **Los textos del Apéndice A se usan literalmente.** Donde no haya texto fijado, se escribe español natural coherente con el resto y se añade al apéndice en el mismo PR. |
| UI-22 | **Nunca jerga técnica en la interfaz**: ni "RPC", ni "token", ni "URL firmada", ni "RLS", ni nombres de tabla. El voluntario lee "acceso", "aviso", "foto". |

---

## 10. Accesibilidad

- Contraste ≥ 4,5:1 en texto, ≥ 3:1 en elementos gráficos (TR-31).
- Foco visible: anillo 2 px `--marino-700` con desplazamiento 2 px, en claro y oscuro.
- `prefers-reduced-motion`: sin transiciones.
- Cada marcador tiene nombre accesible: "HID-0147, hidrante 100 mm, bueno, revisado hace 1 mes".
- Los cuatro estados llevan texto siempre que hay espacio (chip); el color nunca va solo.

---

---

## Apéndice A — Textos exactos (español)

Se usan tal cual (UI-21). Entre corchetes, lo que se sustituye por un valor.

**Navegación y cabeceras.** `Mapa` · `Lista` · `Ajustes` · `Puntos de agua` · `Mis propuestas` ·
`Nuevo punto` · `Jefatura` · `Protección Civil Albolote` · `Hidrantes` (nombre corto de la app
instalada) · `ENTORNO DE PRUEBAS` (banda de staging, 04 §4).

**Entrada.** `Código de acceso del grupo` · `Nombre` · `Apellido` · `Entrar` ·
`Solo se pide una vez: este móvil recordará tu acceso y tu nombre.` ·
`¿Eres de jefatura? Entrar con Google` · `Aviso legal y privacidad` · `Código incorrecto` ·
`Demasiados intentos. Espera una hora antes de volver a intentarlo.` · `No autorizado` ·
`Tu cuenta de Google no está en la lista de administradores de hidrantes. Pide a jefatura que la añada desde Ajustes del panel.` ·
`Sin acceso` · `Volver` · `Cifra [1] de 6` · `El código son 6 cifras` ·
`Escribe tu nombre y apellido` · `Entrando…` ·
`Sin conexión con el servidor. Inténtalo de nuevo en un momento.` ·
`Otra persona está cambiando este punto; inténtalo en unos segundos.` ·
`El tipo de un punto no se cambia: retíralo y da de alta el correcto.` ·
`El acceso de este móvil ya no vale. Vuelve a escribir el código del grupo; tu nombre se conserva.` ·
`Comprobando tu cuenta…` · `Aviso legal y privacidad · v[0.1.0]` · `Aviso legal`.

**Primer uso** (FR-94). `Cuanto más grande, más agua da` ·
`Círculo = hidrante, cuadrado = boca de riego. El color dice el estado; el tamaño, lo aprovechable que es. Un anillo de rayas alrededor significa que nadie lo ha revisado en más de un año.` ·
`Añadir un punto son cuatro toques` ·
`Pulsa +, ajusta el pin, elige tipo y estado, haz la foto. Sin cobertura también: se enviará solo cuando vuelva la señal.` ·
`Malo: se probó y sale débil.` · `No funciona: no se pudo usar (tapa, válvula, arqueta).` (debajo, una línea cada una; docs/24 RV-99) ·
`Todo pasa por jefatura` ·
`Lo que propongas no aparece en el mapa hasta que jefatura lo apruebe. Te avisaremos del resultado, y si algo se rechaza, del motivo.` ·
`Siguiente` · `Empezar` · `Saltar` · `Pantalla [1] de 3`.

**Aviso legal** (literal de 11 §7, que es su propietario). `Mapa de hidrantes — aviso legal y privacidad` ·
`Esta aplicación la usa la Agrupación de Voluntarios de Protección Civil de Albolote para mantener el inventario de hidrantes y bocas de riego del término municipal y de Calicasas.` ·
`Qué guardamos de ti.` ·
`Tu nombre y apellido, para saber quién aportó cada dato, y un identificador aleatorio de tu móvil, para reconocer tus propias propuestas. No guardamos tu teléfono, correo, DNI ni dirección. Tu nombre solo lo ve la jefatura; nunca otros voluntarios.` ·
`Ubicación y fotos.` ·
`Al proponer un punto se guarda la posición del punto y, como referencia para jefatura, la de tu móvil en ese momento. Las fotos se guardan sin metadatos. No fotografíes personas ni matrículas: el objeto de la foto es el hidrante.` ·
`Cuánto tiempo.` ·
`El historial de cambios se conserva mientras exista el inventario, porque es el registro de quién hizo qué. Si dejas la agrupación y quieres que tu nombre desaparezca, pídelo a jefatura: lo sustituimos por "voluntario dado de baja" conservando los datos del hidrante.` ·
`Tus derechos.` ·
`Puedes pedir a jefatura ver, corregir o anonimizar lo que consta de ti. La responsable del tratamiento es la agrupación, representada por su jefatura.` ·
`Datos externos.` ·
`Para deducir direcciones se consulta OpenStreetMap con las coordenadas del hidrante, nunca con datos tuyos. Mapa base y direcciones © OpenStreetMap contributors.`

**Mapa y lista.** `Buscar código, calle, dirección o coordenadas…` · `Capas` · `Mapa base propio` ·
`Calle (OSM)` · `Satélite (PNOA)` · `Catastro` · `© OpenStreetMap contributors` ·
`PNOA © Instituto Geográfico Nacional` · `© Dirección General del Catastro` ·
`© OpenStreetMap contributors · Protomaps` (atribuciones de las capas) · `necesita cobertura` · `Mi posición` ·
`Sincronizado [hace N min]` · `Sin cobertura · datos de [hace N min]` ·
`Sin conexión con el servidor` · `[N] sin enviar` · `Todos` · `Hidrantes` · `Bocas` ·
`No utilizable` · `Sin revisar` · `Más grande = más agua aprovechable` ·
`Nada coincide con ese filtro.` · `revisado [hace 3 meses]` · `sin revisar` + `desde [hace 1 año]` = "sin revisar desde hace 1 año" (en `--naranja-texto`; si no cabe, se acorta la fecha, nunca `sin revisar`) (segunda línea de cada fila de la Lista, sin la dirección; a la derecha solo la distancia, y solo si hay posición: FR-68, docs/25 RV-106) ·
`desde ti` · `desde el incidente` (solo para el lector de pantalla, detrás de la distancia de cada fila) · `Sin cobertura` · `Reintentar` ·
`[12] puntos` · `Sincronizando…` ·
`Todavía no hay puntos guardados en este móvil. Se descargarán en cuanto haya conexión.` (nunca sincronizado) ·
`Todavía no hay ningún punto en el inventario. Mantén pulsado el mapa donde haya uno para darlo de alta.` · `Añadir un punto` (sincronizado y sin ningún punto, en el mapa y en la lista, RV-76) ·
`Mapa base no descargado. Sin cobertura solo se ven los puntos. Descárgalo en Ajustes cuando tengas wifi.` ·
`El mapa base no está en el móvil: sin cobertura el fondo quedará vacío.` · `Descargar ([4,4] MB)` ·
`Descargar versión nueva` · `Ocultar aviso` (avisos del mapa base en el propio mapa, FR-81) ·
`La capa "[Satélite (PNOA)]" necesita cobertura. Los puntos siguen; cambia al mapa base.` ·
`Sin cobertura: se ve el mapa base propio en lugar de «[Calle (OSM)]»` (con el mapa base en el móvil, RV-58) ·
`Nada coincide con esa búsqueda.` · `Borrar búsqueda` · `Buscando tu posición…` ·
`Sin permiso de ubicación: actívalo en los ajustes del móvil para centrar el mapa en ti.` ·
`No se puede obtener tu posición ahora mismo.` · `Leyenda` · `Cerrar la leyenda` · `Zoom` · `Acercar` · `Alejar` ·
`funciona sin cobertura` · `solo en línea` · `Orden` · `Filtrar` · `distancia` · `código` · `estado` · `GPS ±[9] m`.

> **Coordenadas con su sistema (DEC-157).** Cada coordenada lleva delante el nombre de su sistema, en
> la ficha, en *¿Qué hay aquí?*, en la cola del panel y en lo que se comparte: `WGS84 · grados decimales`
> (6 decimales, lo que da el GPS) y `ETRS89 · UTM huso 30N` (EPSG:25830, redondeada a metro). En
> `30S 441808 4120645`, la **S es la banda de latitud de MGRS** (de 32° a 40° N; Albolote está a 37° N),
> **no "sur"**: el huso es el 30 **norte**, y por eso la etiqueta dice `30N`.

**Funciones de mapa para emergencias** (FR-72 a FR-76, DEC-089, DEC-157). `Coordenadas` · `WGS84 · grados decimales` ·
`ETRS89 · UTM huso 30N` · `Copiar [WGS84 · grados decimales]` · `Copiado` ·
`No se ha podido copiar: mantén pulsado el texto para copiarlo` · `¿Qué hay aquí?` ·
`Cercanos desde aquí` · `Compartir esta ubicación` · `Añadir un punto aquí` · `Compartir` · `Ubicación` ·
`[HID-0123] · [hidrante] [100 mm] · [bueno]` · `[sistema]: [coordenadas]`, una línea por sistema: `WGS84 · grados decimales: [37.230500, -3.656000]` y, debajo, `ETRS89 · UTM huso 30N: [30S 441808 4120645]` ·
`Copiado: pégalo donde quieras` · `No se ha podido compartir ni copiar: mantén pulsado el texto para copiarlo` ·
`Cercanos` · `Incidente` ·
el subtítulo de Cercanos va en minúscula detrás del título y solo avisa cuando importa (§4.7, DEC-165):
`en línea recta` (`Cercanos · en línea recta`) · `desde el punto marcado` (`Cercanos · desde el punto marcado · en línea recta`) ·
`posición de [hace 5 min]` (`Cercanos · en línea recta · posición de hace 5 min`) ·
`posición poco precisa (±[80] m)`, con el enlace `Marcar en el mapa` al lado, que cierra la hoja y deja encima del mapa `Mantén pulsado el mapa donde está el incidente` hasta que se marca ·
`Solo hidrantes` (chip) · `[100 mm] · [Regular]` (la segunda línea de cada fila; la distancia, `[264 m]`, y el rumbo, `[N]`, van aparte a la derecha) ·
`Sin posición: mantén pulsado el mapa donde está el incidente o busca la calle` ·
`Buscando tu posición… (puedes marcar el incidente en el mapa)` ·
`Ningún punto que funcione a menos de 2 km del incidente` · `Ver todos en la lista` ·
`Distancias desde el incidente` · `Cerrar el incidente` · `Ver más cercanos` · `Ver más mapa` (las dos alturas de la hoja, RV-61) · `Volver a la lista` · `Volver a Cercanos` (la columna en ordenador, RV-60) · `Medir` · `Medir distancia` · `Medir desde aquí` ·
`Toca el mapa para poner los puntos del tendido` · `[186 m] · [10] tramos de [20] m` ·
`[40 m] · 1 tramo de [20] m` · `Deshacer` · `Borrar` · `Terminar` · `Para deshacer hacen falta dos puntos` ·
`Aún no hay puntos: toca el mapa` · `Coordenadas [37.230500, -3.656000]` · `Fuera de la zona habitual` ·
`Se ha tomado [3.656] como Oeste` (longitud sin signo, RV-69) · `Abre el enlace en el navegador y copia las coordenadas` · `Puntos` · `Calles y lugares` · `Direcciones` ·
`© OpenStreetMap` · `CartoCiudad · IGN` · `Buscando la dirección…` ·
`Ninguna dirección con ese número en Albolote ni Calicasas` ·
`Los números de portal necesitan cobertura: te enseño la calle` · `Vuelve a entrar con el código para buscar números de portal` (401, RV-63) · `Albolote` · `Calicasas` (búsqueda, FR-73).

**Ficha.** `Dirección` · `sin dirección` · `revisado [hace 2 meses] · [4 ago 2026]` · `sin revisar desde [hace 1 año]` · `Tipo` · `Diámetro` · `Tipo de enganche` · `a [80 m] de ti` · `[Conexión] · [1]/[2]` (banda y rejilla, RV-108) ·
`Proponer un cambio` · `Cómo llegar` · `Datos de [hace N min] · sin cobertura` · `ampliar` · `Cerrar` ·
`Punto no encontrado.` · `Datos sincronizados [hace N min]` · `Fallo:` · `Enganche [Granada]` ·
`Foto no disponible sin cobertura` · `No se ha podido cargar la foto` · `Sin foto` · `[HID-0147] · [Sitio]` (texto alternativo, RV-103) · `Estado desconocido · actualiza la aplicación` (RV-102a).

**Operaciones.** `¿Qué ha cambiado en [HID-0147]?` · `Sigue igual` ·
`Solo actualiza la fecha de revisión. Foto y listo.` · `Actualizar estado` ·
`El caudal ha cambiado o ya no funciona` · `Corregir datos` ·
`Diámetro, tipo de enganche o descripción mal anotados` ·
`¿El tipo está mal? Propón retirarlo y da de alta el correcto` · `Corregir ubicación` · `El pin está desplazado` ·
`Proponer retirada` · `Ya no existe. Pide un motivo breve` · `Alta` · `Revisión` · `Estado` · `Datos` ·
`Ubicación` · `Retirada` · `Consta como [Bueno] · revisado [hace 1 mes]` · `Caudal / estado ahora` ·
`Confirmas que el punto sigue exactamente igual. Solo cambia la fecha de última revisión.` ·
`Solo jefatura puede confirmar la retirada. Hasta entonces el punto sigue en el mapa de todos, y en el histórico quedará siempre que aquí hubo un punto.` ·
`Entraste con Google: el cambio se aplica al momento y consta en el registro como acción tuya. No pasa por la cola.` ·
`Toca el mapa donde está realmente. La posición anterior queda registrada.` ·
`Sin posición GPS: toca el mapa donde está el punto.` · `±[9] m · a [12 m] del pin` · `Qué impide usarlo` ·
`Ej.: sale menos fuerza que en mayo` · `Qué has encontrado en el sitio` ·
`Medida en mm (jefatura la comprobará)` · `Medida en mm, de 20 a 150` · `Preparando la foto…` · `No se pudo leer la foto. Prueba otra vez.` ·
`Enviando…` · `Se enviará sola cuando haya conexión.` · `El cambio ya está en el mapa de todos.` ·
`No se pudo guardar en el móvil. Inténtalo otra vez.`.

**Formularios.** `Tipo de elemento` · `Hidrante` · `Boca de riego` ·
`Diámetro de la salida mayor` · `45 mm` · `70 mm` · `100 mm` · `Otra medida` ·
`Tipo de enganche` · `Barcelona` · `Granada` ·
`Otro` · `Caudal / estado` · `Bueno` · `Regular` · `Malo` · `Barro` · `No funciona` ·
`Descripción del fallo · obligatoria` · `Foto` · `Foto de hoy` · `Foto del sitio` · `Conexión` · `Sitio` · `Hacer foto · [Sitio] · obligatoria` · `repetir · [Sitio]` · `[Sitio] · [150] kB` ·
`Hacer foto · obligatoria` · `Foto añadida · [230] kB` · `repetir` · `Descripción (opcional)` ·
`Referencia de calle, acceso…` · `Nota (opcional)` · `Desplazamiento` · `Tu GPS` ·
`¿Por qué ya no existe?` · `Obras` · `Asfaltado` · `Sustituido` · `Otro` ·
`Cuéntalo brevemente · obligatorio`.

**Avisos del formulario.** `Falta la foto para poder enviar` · `Falta la foto del sitio` · `Elige el estado` ·
`Describe el fallo` · `Elige el tipo` · `Elige el diámetro` · `Indica la medida` ·
`Elige el tipo de enganche` · `Mueve el pin al sitio correcto` · `No has cambiado nada` · `Elige un motivo` ·
`Explica brevemente qué has visto` ·
`⚠ Esto queda fuera de la zona habitual. Puedes continuar; jefatura lo verá señalado.` ·
`Toca el mapa para ajustar el pin` ·
`La posición no está al día: coloca el pin a mano o espera a que el GPS responda`.

**Envío.** `Enviar para revisión` · `Enviar propuesta de retirada` · `Aplicar ahora` ·
`Guardar · se enviará con cobertura` · `Guardar · se enviará al volver el servidor` ·
`Enviado para revisión` · `Guardado en el móvil` · `Aplicado` · `Volver al mapa` ·
`Ver mis propuestas` · `Sin guardar en el móvil` ·
`No se ha podido guardar en el móvil. No cierres la aplicación hasta que se envíe.` · `Reintentar ahora` ·
`Jefatura lo revisará. Te avisaremos del resultado al abrir la aplicación.`.

**Mis propuestas.** `Pendiente` · `Aprobada` · `Rechazada` · `Retirada por ti` · `Sin enviar` ·
`Retirar` · `Motivo: [texto]` · `con correcciones: [texto]` ·
`⚠ Lleva más de 24 h esperando cobertura. Se enviará sola al tener señal.` ·
`Todavía no has propuesto nada. Desde la ficha de un punto o con el botón + del mapa.` ·
`[3] enviadas · [1] sin enviar` · `nuevo` · `Descartar` · `Jefatura ya la ha revisado` · `No se ha podido retirar. Inténtalo de nuevo.` · `¿Descartar este envío?` ·
`No se ha podido enviar y ya no se enviará. No se puede deshacer.` · `¿Retirar esta propuesta?` ·
`Jefatura ya no la verá. No se puede deshacer.` · `Aprobada [HID-0147]` · `Rechazada [HID-0147]` ·
`El punto ya no está activo: no se ha enviado.` · `Faltan datos o no son válidos: no se ha enviado.` ·
`Falta la foto: no se ha enviado.` · `Falta la foto del sitio: no se ha enviado.` ·
`El tipo de un punto no se cambia: propón retirarlo y da de alta el correcto.` · `No se ha podido enviar.` ·
`Sin conexión: esta es la última lista guardada.`

**Ajustes del voluntario.** `Firma de tus propuestas` · `Cambiar` · `Mapa sin cobertura` ·
`Descargado · [12] MB · [jul 2026]` · `No descargado` · `Descargar` · `Actualizar` ·
`Puntos guardados` · `Sincronizar` · `Capa por defecto` · `Modo oscuro` · `Según el móvil` ·
`Avisarme cuando jefatura resuelva mis propuestas` · `Algo no funciona en la aplicación` ·
`Avisar a jefatura` · `Cómo se usa (3 pantallas)` · `Cerrar sesión en este móvil` ·
`Se borran tu acceso, tu nombre y los puntos guardados.` · `hay una versión nueva, recargar` ·
`novedades` · `Cuenta de jefatura` · `Sesión de Google · [correo]` · `Cerrar la sesión de Google` ·
`Panel de jefatura` (botón de la cuenta de jefatura, RV-113) · `Ver` · `Siempre` · `Nunca` · `Guardar` · `Cancelar` · `Pantalla` · `Ayuda` ·
`¿Cerrar sesión en este móvil?` · `Cerrar sesión` · `Versión [0.1.0]` · `Descargando… [40] %` ·
`No descargado · el mapa no tendrá calles sin cobertura` · `Hay una versión nueva del mapa` ·
`No se pudo descargar. Inténtalo de nuevo con wifi.` · `[438] · sincronizado [hace 5 min]` ·
`Todavía sin sincronizar` · `Novedades` · `Nuevo` · `Todavía no hay novedades publicadas.` (en Ajustes de la app, FR-167; cada línea, `[0.6.4] · [texto]` con la versión que la trajo, DEC-142) · `Avisos` · `Tienes [2] envíos sin mandar: se perderán.` · `Guardado protegido` · `sí` · `no` (el navegador
ha concedido, o no, no desalojar lo guardado; TR-07).

**Algo no funciona** (FR-92). `Para problemas de la aplicación. Si lo que quieres es cambiar un hidrante, hazlo desde su ficha.` ·
`Qué ha pasado` · `Ej.: al hacer la foto la app se cierra…` ·
`Se enviará con la versión ([0.1.0]) y la pantalla en la que estabas. Lo verá jefatura en su panel.` ·
`Describe el problema` · `Aviso enviado a jefatura` · `Ya has enviado varios avisos hoy. Inténtalo mañana.`.

**Instalar la aplicación.** `Instalar la aplicación` · `Instalar` ·
`Instala la aplicación en la pantalla de inicio: se abre más rápido y funciona sin cobertura.` ·
`Instalada en este móvil` · `En iPhone: Compartir → Añadir a pantalla de inicio.` ·
`En el menú del navegador: Añadir a pantalla de inicio (o Instalar aplicación).`

**Avisos push** (FR-163). `Avisos de jefatura` ·
`Recibirás una notificación cuando una propuesta tuya se apruebe o se rechace. Nada más: ni de otros voluntarios ni publicidad. En iPhone solo funciona si la aplicación está instalada en la pantalla de inicio. El móvil te pedirá permiso ahora.` ·
`Permitir avisos` · `Ahora no` · `Activado en este móvil` · `Desactivado · también verás el resultado al abrir la app` ·
`Avisos bloqueados en el móvil: actívalos en sus ajustes.` ·
`En iPhone, primero añade la aplicación a la pantalla de inicio (Compartir → Añadir a pantalla de inicio).`
Si activarlos falla, la hoja no se cierra y dice por qué (docs/21 RV-81, DEC-122): `Reintentar` · `Cerrar` ·
`El móvil no ha dejado preguntar. Abre los ajustes de notificaciones de la aplicación, actívalas y vuelve a intentarlo.` ·
`Los avisos de esta aplicación están bloqueados en el móvil. En Android: Ajustes → Aplicaciones → esta aplicación → Notificaciones. Actívalas y vuelve aquí.` ·
`Este móvil no puede recibir avisos ahora (servicio de avisos no disponible). Comprueba que tiene conexión y los servicios de Google actualizados.` ·
`La aplicación aún se está preparando. Ciérrala del todo, ábrela y vuelve a intentarlo.` ·
`No se ha podido renovar la suscripción de avisos de este móvil. Vuelve a intentarlo; si sigue igual, avísalo desde «Algo no funciona en la aplicación», aquí en Ajustes.` ·
`Sin conexión con el servidor. Vuelve a intentarlo cuando tengas cobertura.` ·
`El servidor no ha guardado la suscripción. Vuelve a intentarlo; si sigue igual, avísalo desde «Algo no funciona en la aplicación», aquí en Ajustes.`

**Fallos y jefatura.** `Algo ha fallado en esta pantalla` ·
`Queda anotado para jefatura. Lo que tenías guardado sigue en el móvil.` · `Panel de jefatura` ·
`Ir al mapa` · `Abrir el panel de jefatura` (nombre accesible de la etiqueta *Jefatura* de la barra, RV-113).

**Tiempos** (UI-12). `hace un momento` · `hace [5] min` · `hace [3] h` · `hace 1 día` · `hace [2] días` · `hace 1 mes` ·
`hace [3] meses` · `hace 1 año` · `hace [2] años` · `[100] mm`.

**Panel: cola.** `Cola de revisión` · `Inventario` · `Revisiones caducadas` · `Registro` ·
`Papelera` · `Voluntarios` · `Ajustes` · `Buscar código, calle o voluntario…` ·
`Pendientes` · `Aprobadas` · `Rechazadas` · `Retiradas por el autor` ·
`Ninguna seleccionada` · `[N] seleccionadas` · `Aprobar seleccionadas` ·
`Rechazar seleccionadas…` · `todas las operaciones` · `todos los núcleos` · `Aprobar` ·
`Aprobar con correcciones` · `Guardar y aprobar` · `Rechazar…` · `Confirmar rechazo` ·
`Fusionar con [BOC-0088]` · `Confirmar y aprobar` · `Cancelar` ·
`Motivo del rechazo (obligatorio, lo verá quien lo propuso)` ·
`Sin motivo no se puede rechazar.` ·
`El diff está calculado sobre un estado que ya no existe: el punto cambió [ayer]. Se pide confirmación expresa en lugar del botón normal.` ·
`Posible duplicado: compara antes de decidir. En ámbar, lo que difiere.` ·
`Posible duplicado de [codigo] · a [distancia]. No está en el inventario cargado: no se puede comparar ni fusionar.` ·
`No queda ninguna propuesta pendiente. Buen trabajo.` · `deducida · editable` · `del punto`.

**Panel: detalle de la cola (docs/25 RV-110, DEC-158).** `Datos del punto` · `1 cambio` ·
`[n] cambios` · `el resto se queda igual` ·
`Cambia` · `Código` · `Núcleo` · `Última revisión` ·
`Origen de la ubicación` · `Propuesto por` · `se asigna al aprobar` · `se fija al aprobar` ·
`GPS · ±[4] m` · `Pin puesto a mano` · `la que ya tiene el punto` · `—` · `Fotos` ·
`la actual del punto y las nuevas de la propuesta` · `no trae nuevas` ·
`llegó sin foto del sitio (versión anterior de la app)` ·
`Ni la propuesta ni el punto tienen fotos.` · `No se ha podido cargar esta foto` · `conexión` · `sitio` · `Foto actual del punto` ·
`Nueva · [conexión]` · `Foto actual · [sitio]` · `[Nueva · sitio] · toca para ampliar` · `Mapa` ·
`Satélite` · `Capa del mapa` · `Abrir en grande` · `Cerrar el mapa grande` · `posición de ahora` ·
`propuesta` · `el punto` · `puntos de alrededor` · `radio de duplicado · [25] m` ·
`Sin posición: el punto no está entre los activos del inventario (puede estar retirado o en la papelera).` ·
`Volver a la cola` · `Corregir` · `Toca una para revisarla`.

**Panel: resto.** `Editar` · `Retirar` · `Borrar` · `Historial` · `Restaurar` ·
`Borrar definitivamente…` · `Vaciar la papelera…` · `Marcar resuelta` · `Anonimizar…` ·
`Hoja de campo por núcleo` · `Exportar` · `Excel` · `CSV` · `GeoJSON` ·
`Descargar inventario (JSON)` · `Purgar fotos huérfanas` · `Generar uno nuevo` ·
`Revocar todos los dispositivos` · `Guardar cambios` · `Añadir` ·
`Regenerar zona de cobertura` · `Regenerar mapa base` · `Respaldo ahora` ·
`Salud del sistema` · `Mostrando [10] de [438] puntos` ·
`No se puede desactivar al último administrador activo.` ·
`— pendiente, escribe aquí`.

**Panel: cola, detalle y errores (Fase 7, DEC-065).** `Fuera de zona` · `sin núcleo` · `ninguno` ·
`Tipo` · `Diámetro` · `Tipo de enganche` · `Fallo` · `Descripción` · `Nota` · `Situación` · `Motivo` · `Activo` ·
`Retirado` · `[valor] · sin cambios` · `Otra medida: [mm] mm` ·
`Fija el diámetro en 70 o 100 mm para poder aprobar.` ·
`la del pin propuesto (a [distancia])` · `la de [codigo] (existente)` · `desactualizada` ·
`el punto ya no está activo` · `diámetro sin fijar` · `ya estaba resuelta` · `datos no válidos` · `cambia el tipo, que no se puede cambiar: recházala` ·
`[n] aprobadas, cada una con su entrada en el Registro.` · `Quedan pendientes: [lista].` ·
`[n] rechazadas. Cada autor verá el motivo.` · `Rechazar [n] propuestas con un motivo común` ·
`Motivo que verán los autores` · `Ej.: la foto es del hidrante de al lado, HID-0087` ·
`No menciones a otros voluntarios: el autor lo leerá tal cual.` · `Propuesto por [autor] · [hace] ·
[nucleo]` · `Seleccionar [nombre]` · `Seleccionar todas` · `Historial: solo lectura` · `Filtrar:` ·
`Filtrar por operación` · `Filtrar por núcleo` · `Estado de las propuestas` ·
`Selecciona una propuesta de la lista.` · `Todavía no hay propuestas en este estado.` ·
`Nada coincide con "[texto]".` · `No queda ninguna propuesta pendiente con ese filtro.` ·
`Cargando…` · `Foto del voluntario · toca para ampliar` · `Esta propuesta no trae foto nueva.` ·
`Corrige lo que haga falta y aprueba en un paso. Lo cambiado queda en el registro y lo ve el autor.` ·
`[codigo] conserva su código, recibe la foto nueva y queda revisado hoy. Para cada campo que difiere, elige qué prevalece.` ·
`Fusionar` · `Propuesta` · `[codigo] existente · a [distancia]` · `[valor] (existente)` ·
`[valor] (propuesta)` · `Aprobada [codigo]. Consta en el registro; el autor lo verá en su móvil.` ·
`Aprobada con correcciones [codigo].` · `Rechazada. El autor verá el motivo en su móvil.` ·
`Fusionada con [codigo]: no se ha creado un punto nuevo y queda revisado hoy.` ·
`✓ Aprobada por [quien] · [cuando]` · `✕ Rechazada por [quien] · [cuando]` ·
`↩ Retirada por el autor · [cuando]` · `Motivo: "[texto]"` · `Con correcciones: [texto]` ·
`Fusionada con [codigo]. No se creó un punto nuevo.` · `Código asignado: [codigo]` ·
`Consta en el Registro. Solo lectura.` · `Pin propuesto y puntos aprobados alrededor` ·
`con avisos` · `Hidrantes Albolote · Panel de jefatura` ·
`Direcciones deducidas con Nominatim · © OpenStreetMap contributors` · `datos de [hace]` ·
`Esta propuesta ya no está pendiente: otra persona la ha resuelto. La lista se ha actualizado.` ·
`El punto ya no está activo.` ·
`El punto cambió mientras revisabas: vuelve a mirar el detalle y confirma.` ·
`Sin motivo no se puede continuar.` · `Solo se fusionan puntos del mismo tipo.` ·
`Solo se puede fusionar un alta.` ·
`El resultado no cumple las reglas del punto: revisa los valores.` · `Falta la foto del sitio.` ·
`Ha pasado el plazo de la papelera: ya no se puede restaurar.` · `El código son 6 cifras.` ·
`Algún valor está fuera de rango: revisa los parámetros.` ·
`Tu cuenta ya no tiene acceso de administrador.` ·
`Esta acción aún no está configurada en el servidor.` ·
`No se ha podido completar. Inténtalo de nuevo.`.

**Panel: inventario, caducadas, registro y papelera (Fase 7, DEC-067).** `Bocas de riego` ·
`Quitar filtros` · `[Regular] · [3]` (opciones del desplegable Estado, docs/29 RV-123) · `Vista` · `Tabla` · `Código` · `Núcleo` · `Municipio` · `Última revisión` ·
`Acciones` · `Latitud` · `Longitud` · `Albolote` · `Calicasas` · `enganche [Granada]` · `Ordenar por [columna]` ·
`Dirección de [codigo]` · `pulsa una columna para ordenar ·
la dirección se edita en la propia celda` · `Páginas` · `No hay puntos con esos filtros.` ·
`Guardado [codigo].` · `[codigo] retirado. Sigue en el histórico.` · `[codigo] está en la papelera.` ·
`El punto existió y ya no está: desaparece del mapa y se conserva en el histórico.` ·
`El registro nunca debió existir: va a la papelera y se puede restaurar mientras esté en plazo.` ·
`Motivo (obligatorio, queda en el registro)` ·
`Exportadas [n] filas. La exportación consta en el Registro.` ·
`[n] puntos sin revisar desde hace más de los meses configurados` · `de [n] puntos del núcleo` ·
`Ver puntos` · `Hoja` · `Hoja de campo de todos los núcleos` · `Imprimir` · `Hoja de campo ·
[nucleo]` · `[n] puntos por revisar · impresa el [fecha]` · `Dirección o coordenadas` ·
`Último estado conocido` · `Anotar revisión` · `revisado [hace] ([fecha])` ·
`La hoja se abre para imprimir: una página por núcleo, con una casilla en blanco para anotar.` ·
`No hay revisiones caducadas. Todo al día.` · `Filtrar por acción` · `todas las acciones` ·
`[n] entradas` · `no se puede editar ni borrar` · `Momento` · `Actor` · `Acción` · `Punto` ·
`Detalle` · `[n] entradas por página` · `Todavía no hay entradas con ese filtro.` ·
`Propuesta retirada por su autor` · `Aprobación` · `Aprobación con correcciones` · `Rechazo` ·
`Fusión` · `Edición directa` · `Borrado` · `Restauración` · `Purga de la papelera` ·
`Código de acceso cambiado` · `Dispositivos revocados` · `Administrador añadido` ·
`Administrador desactivado` · `Parámetros cambiados` · `Incidencia resuelta` · `Anonimización` ·
`Exportación` · `Mantenimiento lanzado` ·
`Los borrados se conservan [dias] días y después se purgan.` · `Purgar lo caducado…` ·
`Purgar ahora` ·
`Se borran definitivamente, con sus propuestas y sus fotos, los puntos que llevan más de [dias] días en la papelera. No se puede deshacer.` ·
`[n] puntos purgados.` · `[codigo] restaurado: vuelve al mapa.` · `Borrado` · `quedan [dias] días` ·
`La papelera está vacía.`.

**Panel: voluntarios y ajustes (Fase 7, DEC-068).** `Actividad de los últimos` · `[n] meses` ·
`Solo visible aquí. No es un ranking público.` · `Voluntario` · `Propuestas` · `Tasa` · `Última` ·
`[n] %` · `sin resolver todavía` · `conviene explicarle mejor el formulario` ·
`Nadie ha propuesto nada en este periodo.` ·
`Las propuestas y el registro de [autor] pasarán a nombre de "voluntario dado de baja". Los datos de los hidrantes se conservan. No se puede deshacer.` ·
`Anonimizar` · `Anonimizado: [n] filas actualizadas.` · `Incidencias de la aplicación` ·
`lo que llega desde "Algo no funciona"` · `[n] abiertas` ·
`No hay incidencias. Nadie ha avisado de nada.` · `Cuándo` · `Versión · pantalla` · `abierta` ·
`resuelta` · `[quien] · [cuando]` · `Incidencia marcada como resuelta.` · `Código de acceso` ·
`Cambiado por última vez el [fecha] por [quien]. [moviles] móviles registrados.` ·
`Sin cambios desde el arranque. [moviles] móviles registrados.` · `ver` · `ocultar` ·
`Sin revocar: quien ya entró sigue trabajando y solo los móviles nuevos necesitan el código nuevo.` ·
`Revocando: todos vuelven a teclearlo. Es lo que se usa si el código se ha filtrado.` ·
`Se pondrá en vigor un código nuevo. Los móviles que ya tienen acceso siguen funcionando.` ·
`Se pondrá en vigor un código nuevo y [moviles] móviles tendrán que volver a escribirlo al abrir la aplicación. Sus nombres se conservan.` ·
`Generar y poner en vigor` · `Código nuevo en vigor: [codigo]. Comunícalo al grupo.` ·
`Acceso de administradores` · `Lista propia de hidrantes, independiente de la app de uniformidad.` ·
`añadido el [fecha] por [quien]` · `Acceso de [correo]` · `activo` · `sin acceso` ·
`correo@albolote-pc.es` · `Sugerencias de la app de uniformidad:` ·
`[correo] ya puede entrar en el panel.` · `[correo] se queda sin acceso al panel.` · `Parámetros` ·
`Los móviles los aplican en su próxima sincronización.` · `Meses entre revisiones` ·
`Radio de duplicado (m)` · `Días de papelera` · `Margen de la zona (m)` · `Fotos por móvil y día` · `Tramo de manguera (m)` ·
`Radios de marcador (px)` · `"[campo]" está fuera de rango.` · `Parámetros guardados.` · `Núcleos` ·
`Deducidos de OpenStreetMap. Se puede renombrar uno o añadir el que falte.` · `añadido a mano` ·
`Renombrar` · `Nombre de [nucleo]` · `Añadir un núcleo` · `Nombre del núcleo` ·
`Toca el mapa en el centro del núcleo: de ahí sale el municipio y a qué núcleo pertenece cada punto.` ·
`Centro del núcleo` · `Escribe el nombre del núcleo` · `Toca el mapa para situarlo` ·
`Núcleo "[nombre]" añadido.` · `"[antes]" ahora se llama "[ahora]".` ·
`Propuestas pendientes de más de 14 días` · `Incidencias abiertas` ·
`Errores de la aplicación (7 días)` · `Puntos sin dirección deducida` · `Último respaldo` ·
`Última vigilancia` · `todo respondía` · `con avisos: mira las issues` ·
`Almacenamiento usado` ·
`Las fotos ocupan el [96] % del gigabyte gratuito. Purga la papelera y las fotos huérfanas antes de que se llene: mientras esté lleno, la aplicación no admite fotos nuevas.` (banda de aviso desde el 90 %, DEC-073) ·
`Zona de cobertura · mapa base` · `Callejero sin conexión` · `Móviles con acceso` · `Códigos de acceso fallidos (24 h)` · `Base de datos` · `[38] MB de [500] MB` · `Tareas programadas` ·
`[hace 2 h] · bien` · `[hace 2 días] · falló o va con retraso` · `todavía sin ejecutar` · `no está programada` (tarea de pg_cron que falta, RV-56) · debajo del título, `Ahora mismo` · `Según la vigilancia de [hace 13 h]` · `Según la última vigilancia` (docs/22 RV-92) · `lleva más de un día sin pasar` (última vigilancia de más de 26 h, en tono de aviso, RV-93) ·
`Entradas bloqueadas por demasiados intentos (24 h)` · `[3] · de todo el grupo: [0]` · `todavía ninguno` · `no se respalda: entorno de pruebas` (Último respaldo en staging, RV-78) · `no se mide en pruebas` (Almacenamiento usado en staging sin dato, docs/23 RV-98, DEC-143) ·
`sin dato` · `Inventario descargado: [n] puntos.` · `Mantenimiento` ·
`Se ejecutan fuera de la aplicación y tardan unos minutos. El resultado aparece en Salud del sistema y en el Registro.` ·
`"[nombre]" lanzado. Tarda unos minutos.` · `Avisos para jefatura` ·
`Notificaciones en este navegador. Opcionales y apagadas por defecto.` ·
`Nuevas propuestas pendientes` · `agrupadas: como mucho una por hora` · `Resumen semanal` ·
`los lunes: revisiones caducadas y pendientes antiguas` ·
`Este navegador tiene los avisos bloqueados. Actívalos en la configuración del sitio.` ·
`En iPhone hay que instalar la aplicación en la pantalla de inicio para recibir avisos.` ·
`Este navegador no admite avisos.` · `No se han podido activar los avisos.` · `Código QR del enlace` ·
`Para la sede y las reuniones: quien lo escanea abre la aplicación.` · `Imprimir A4` ·
`Escanea para instalar` ·
`Mapa de hidrantes y bocas de riego. Entra con el código de acceso que te haya dado jefatura.` ·
`Novedades` · `Lo que cambió en las últimas versiones.` · `Todavía no hay novedades publicadas.` · cada línea, `[0.6.4] · [texto]` con la versión que la trajo (docs/23 RV-95, DEC-142).

**Tono.** Tuteo al voluntario, neutro en el panel. Botones en infinitivo. Sin exclamaciones salvo
en el estado vacío de la cola. Nunca "defecto": es `No funciona`.

---

## Trazabilidad

| Sección | Origen |
|---|---|
| 2, 3, 5, 6 | CSS de `requisitos-hidrantes.html` v6.1 (variables `:root`, mockups §7, panel §8) |
| 4 | plan v2.1 Fase 5 "Regla de simbología"; `requisitos-hidrantes.html` §6.2 |
| 2.3–2.4 | mockup de modo oscuro (v6.1 §7.2) y Fase 5 |
| 8 | plan v2.1 revisión 2.1 ("No funciona") |
| 9, Apéndice A | revisión de la especificación de uniformidad (§5, §6, §10.10, §16, Apéndice B), 17 sep 2026 · DEC-047 |
