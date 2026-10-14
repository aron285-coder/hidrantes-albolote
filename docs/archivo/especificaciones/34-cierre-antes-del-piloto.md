# 34 · Cierre antes del piloto: lo pendiente del recorrido, fotos de los enganches y documentación (oct 2026)

| | |
|---|---|
| **Para** | Claude Code, en este repositorio. **Una sola sesión, en orden** (§0.2). Es un lote pequeño: repartirlo en sesiones paralelas costaría más en coordinación que lo que ahorra. |
| **Base** | `develop` en `9a15d27`. Producción en **0.11.1** desde el 9 oct 2026. |
| **Origen** | Recorrido RV-344 (`docs/verificacion/recorrido-staging-2026-10-09.md`, §3 y §4): el desarrollador elige N1, N3, N4, N6, N8 y N10. Más las fotos propias de los enganches (§3) y la limpieza de la documentación (§4). |
| **El desarrollador** | Ha aportado las tres fotos de §3 (están en `racores-fuentes/`, junto a este archivo). No hace nada más (DEC-176, DEC-177). |
| **Requisitos** | Cambian el Apéndice A de `docs/06` (plurales, buscador, novedades), `docs/06` §2.4 (tintes en oscuro) y §5 (fotos de los enganches). FR-20 no cambia de texto. Versión nueva de 06 «aprobada por el desarrollador al pedir el cambio» (DEC-177). |
| **Lo que no es** | Una revisión nueva. Este documento cierra lo que queda del recorrido y **es la última especificación antes del piloto** (DEC-193, §1). |

## 0. Reparto

### 0.1 Decisiones del desarrollador

| DEC | Qué |
|---|---|
| **DEC-193** | **Congelación hasta el piloto.** `docs/34` es la última especificación antes del piloto (#77). No se escribe `docs/35` hasta que haya datos del piloto. Texto completo en §1. |
| **DEC-194** | **Fotos propias de los enganches.** Las tres fotos del desarrollador sustituyen a los dibujos de `public/racores/`, que tenían **Barcelona y Directo al revés**. Los tipos llevan los nombres que usa la agrupación. Sustituye a DEC-178. §3. |
| **DEC-195** | **Reglas de la documentación.** Las especificaciones cerradas van a `docs/archivo/`; en Git solo las imágenes que un documento enlaza; ningún recuento escrito a mano. §4. |

### 0.2 Orden de trabajo

Una sesión, un PR por punto, en este orden (los primeros son los que más se ven el día del lanzamiento):

| # | Punto | Qué | Origen |
|---|---|---|---|
| 1 | **RV-350** | Plurales | N1, B1 |
| 2 | **RV-351** | Texto del buscador | N4, B4 |
| 3 | **RV-352** | Panel en el móvil: punto que ya no existe | N3, B2 |
| 4 | **RV-353** | Nombre accesible de Ajustes con novedades | N6, B5 |
| 5 | **RV-354** | Seed de staging con foto del sitio | N8 (reformulado) |
| 6 | **RV-355** | Tintes en modo oscuro | N10 (reformulado) |
| 7 | **RV-356** | Fotos de los enganches | §3 |
| 8 | **RV-357** | DEC-193 a DEC-195 en `docs/12` | §1 |
| 9 | **RV-358** a **RV-361** | Limpieza de la documentación | §4 |
| 10 | **RV-362** | RV-139b sobre el commit final y publicar **0.12.0** | — |

Cada PR, con el flujo de siempre (CLAUDE.md §5): test que falla antes, `pr-review-toolkit`, `code-review`, CI verde.
RV-350 a RV-356 tocan `src/` o `public/`: la skill `revisar-pantallas` con capturas a 412 × 915 y 1280 × 800,
en claro y en oscuro.

### 0.3 Dos propuestas del recorrido que **no** se pueden hacer como estaban escritas

Se comprobó contra el código antes de escribir esta especificación:

- **N8 decía «un punto `[PRUEBA]` sin foto en el seed».** No se puede: `puntos.foto_path` es `not null` desde
  `0001_esquema.sql:40`, así que la base rechaza ese punto. La rama «Sin foto» de la foto de la conexión en
  `Ficha.tsx` es inalcanzable con el esquema actual. RV-340 (`docs/33`) daba por posible `foto_path = null` y
  tampoco lo era. RV-354 lo reformula.
- **N10 estaba marcado como esfuerzo S.** No lo es: los fondos `--verde-100`, `--ambar-100`, `--oro-100` y
  `--rojo-100` se usan en **41** sitios de `src/`, y en **38** llevan encima un texto 600/700. Oscurecer solo el
  fondo dejaría esos 38 textos oscuros sobre fondo oscuro. RV-355 cambia las parejas fondo/texto juntas (M).

## 1. DEC-193 · Congelación hasta el piloto (RV-357)

Para `docs/12`, tal cual:

> ### DEC-193 · `docs/34` es la última especificación antes del piloto
> - **Fecha:** 10 oct 2026 (desarrollador) · **Estado:** vigente (`docs/34`).
> - **Contexto:** entre el 23 sep y el 9 oct hubo diecisiete especificaciones de revisión (`docs/17` a `docs/33`),
>   todas sobre staging con datos de prueba. El recorrido RV-344 ya no encontró ningún defecto alto, y los bajos
>   eran plurales y textos recortados. La aplicación no la ha usado todavía ningún voluntario: la validación con
>   jefatura (#76) y el piloto (#77) siguen pendientes. Otra revisión sobre staging ya no enseña lo que enseñaría
>   una semana de uso real.
> - **Decisión:** después de `docs/34` no se escribe `docs/35` hasta que el piloto (#77) haya terminado y su
>   resultado esté en `docs/verificacion/piloto.md`. Hasta entonces solo entran en `develop`:
>   1. arreglos de una issue `bloquea-release`;
>   2. lo que salga de la validación con jefatura (#76) o del piloto (#77, #78), cada uno con su issue;
>   3. mantenimiento que no cambia lo que ve nadie (dependencias, CI, tareas programadas).
>
>   Una mejora que se le ocurra a Claude Code o al desarrollador mientras tanto se anota como issue con la
>   etiqueta `tras-piloto` y no se implementa.
> - **Fin de la congelación:** cuando exista `docs/verificacion/piloto.md`. `docs/35` parte de lo que diga ese
>   archivo y de las issues `tras-piloto`, en ese orden.
> - **Descartado:** seguir con revisiones sobre staging hasta el piloto (rendimiento cada vez menor); congelar
>   también los arreglos de defectos (un defecto que aparezca en la validación tiene que poder arreglarse).
> - **Afecta a:** 09 §8 (fase 9); CLAUDE.md §5 (una línea: «hasta el piloto, DEC-193»).

**RV-357** también añade la etiqueta `tras-piloto` en GitHub (`gh label create`) y la línea de CLAUDE.md §5.

## 2. Lo pendiente del recorrido

### RV-350 · Plurales (N1, B1) · P1

Con un solo elemento, los contadores dicen «1 enviadas», «1 móviles registrados». El día del lanzamiento habrá
muchos «1».

- **`src/lib/textos.ts`:** una función `plural(n: number, uno: string, varios: string): string` que devuelve
  `` `${n} ${n === 1 ? uno : varios}` ``. Cero va en plural («0 enviadas»).
- **Dónde aplicarla** (líneas en `9a15d27`; comprobar todas las de `` `${n} …s` `` y `` `${n} …es` `` con
  `grep`, no solo estas): 159 `nPuntos`, 325 tramos de manguera, 500 `resumen` de Mis propuestas, 535 propuestas
  al día, 601 `puntosGuardadosLinea`, 611 `perderasEnvios`, 691 y 698 propuestas sin guardar, 743 `seleccionadas`,
  809 `loteAprobadas`, 811 `loteRechazadas`, 812 `rechazarVarias`, 937 `exportado`, 971 `entradas`, 1037
  `purgados`, 1047 y 1048 `móviles registrados`, 1062 móviles que vuelven a escribir el código, 1102
  `nPuntos`, 1150 móviles frenados por el tope, 1165 `inventarioDescargado`, 1181 `reservasDetalle`, 1279
  `mostrando`.
- **Las dos que ya lo hacen a mano** (859 `cambios`, 959 `descartarN`) pasan a `plural`.
- **Los de tiempo** (720 `haceDias`, 722 `haceMeses`, 724 `haceAnos`): comprobar en `src/lib/tiempo*` si `n = 1`
  llega aquí o lo resuelve antes («ayer», «hace un mes»). Si llega, `plural`.
- **Donde el número viene como `Parametro`** (`string | number`), el contador pasa a `number`. Si algún
  llamante pasa un texto ya formateado, se formatea dentro.
- **Frases con concordancia más allá del sustantivo** («Las 3 propuestas … se perderán», «1 móvil … tendrá que
  volver a escribirlo»): las dos formas enteras, no solo el sustantivo.
- **`docs/06` Apéndice A:** las dos formas de cada texto, para que TR-112 (`textos.test.ts`) siga en verde.
- **Test:** unitario de `plural` con 0, 1 y 2; y uno por cada función cambiada con `n = 1`.

### RV-351 · Texto del buscador (N4, B4) · P2

«Buscar código, calle, dirección o coordenadas…» se corta a 360 px y en la columna del ordenador.

- **`textos.ts:120`:** `T.mapa.buscar` hoy sirve a la vez de `placeholder` y de `aria-label`, en los dos buscadores
  (`src/paginas/Mapa.tsx:507-508` y `src/componentes/mapa/ListaPuntos.tsx:90-91`). Se separa en dos:
  - `buscarAyuda` (el `placeholder`) → `'Código, calle o dirección…'`;
  - `buscar` (el `aria-label`) se queda con el texto largo: un lector de pantalla no tiene problema de ancho, y así
    sigue diciendo que se aceptan coordenadas.
- Las coordenadas se siguen aceptando: no cambia la búsqueda, solo el texto de ayuda. Los tests que buscan el campo
  por su nombre accesible no cambian.
- **Test (e2e):** a 360 × 800 y en la columna de 1440 × 900, el ancho del texto de ayuda (medido con
  `canvas.measureText` y la fuente calculada del campo) cabe en el ancho interior del campo.

### RV-352 · Panel en el móvil: punto que ya no existe (N3, B2, U15) · P2

A 412 px, el aviso rojo queda debajo del minimapa y «Rechazar: el punto ya no existe» se parte en tres líneas.

- **`DetallePropuesta.tsx`:** con el punto inactivo (`bloqueado`) y por debajo de `md`, el aviso rojo va **antes**
  que el minimapa en el orden visual (hoy el minimapa lleva `max-md:order-first`). El minimapa sigue fijo arriba al
  desplazar; el aviso no.
- **Barra de acciones** con `bloqueado` y por debajo de 1100 px: «Rechazar: el punto ya no existe» ocupa **toda
  la fila**; *Aprobar* y *Corregir* (deshabilitados, con su motivo escrito) van en una segunda fila. Sin `bloqueado`,
  la barra no cambia.
- **Test** en `e2e/panel-cola.spec.ts`: a 412 × 915, con una propuesta sobre un punto retirado, el borde superior
  del aviso queda por encima del minimapa y el botón de rechazar mide como mucho 48 px de alto (una línea). A
  1440 × 900 la barra queda como estaba.

### RV-353 · Ajustes con novedades: nombre accesible (N6, B5) · P2

El enlace a Ajustes con el punto de novedades se lee «Novedades Ajustes»: el punto lleva `aria-label` y va delante.

- **`NavegacionArriba.tsx`:** el punto pasa a `aria-hidden`, y después del texto visible va un `sr-only` con
  `', hay novedades'`. El nombre queda «Ajustes, hay novedades».
- **Lo mismo en la barra de abajo del móvil:** `src/paginas/Armazon.tsx:93` lleva el mismo punto con el mismo
  `aria-label`. Son los dos únicos usos en `9a15d27`; comprobar con `grep seccionNovedades` que no hay más.
- **`textos.ts` y Apéndice A:** el texto nuevo.
- **Test:** `getByRole('link', { name: 'Ajustes, hay novedades' })` con novedades sin ver, y
  `{ name: 'Ajustes' }` exacto sin ellas.

### RV-354 · Staging con foto del sitio (N8 reformulado) · P3

Lo que se quería ver en staging era la ficha en sus variantes reales. Con el esquema actual, las variantes que
existen son: una foto (conexión) y dos fotos (conexión y sitio). En staging solo hay de la primera: ningún punto
del seed lleva `foto_sitio_path`.

- **`supabase/seed-staging.sql`:** **dos** puntos `[PRUEBA]` con `foto_sitio_path`, cuya foto se sube en el paso de
  seed como las de RV-340 (generada o de `e2e/fixtures`, sin datos personales).
- **`Ficha.tsx`:** la rama «Sin foto» de la foto de la conexión **se queda**, porque el tipo es `string | null` y una
  caché antigua del móvil podría traer un `null`. Un comentario dice por qué existe y que con el esquema actual no
  se alcanza.
- **`docs/06` §5:** la ficha sin foto se ve en el caso «si falla» (la foto no carga), no por puntos sin foto.
  Corregir también la frase de RV-340 en `docs/33` que daba `foto_path = null` por posible (una nota al pie,
  como la de su cabecera; no se reescribe el documento).
- **Test:** el de RV-340 (cada `foto_path` responde 200) se amplía a `foto_sitio_path`.

### RV-355 · Tintes en modo oscuro (N10 reformulado) · P2

En oscuro, las cajas de aviso y los chips de estado son las únicas superficies claras de la pantalla
(«Entrada abierta», «Todo bien», «Necesita atención», las diferencias de la Cola). Hay que cambiar el fondo y el
texto a la vez.

- **`src/index.css`:** cuatro parejas de tokens de superficie, con valor en claro y en oscuro (en los dos bloques de
  oscuro: el de `prefers-color-scheme` y el de `data-tema='oscuro'`):

  | Pareja | Claro (como hoy) | Oscuro (propuesta) | Contraste en oscuro |
  |---|---|---|---|
  | `--tinte-verde` / `--tinte-verde-texto` | `#dceee1` / `#1e6b45` | `#16301f` / `#5fc48e` | 6,62:1 |
  | `--tinte-ambar` / `--tinte-ambar-texto` | `#fbedcb` / `#7f5c07` | `#352a0e` / `#e8b54a` | 7,48:1 |
  | `--tinte-oro` / `--tinte-oro-texto` | `#f3e6c4` / `#7f5c07` | `#33290f` / `#e8b54a` | 7,60:1 |
  | `--tinte-rojo` / `--tinte-rojo-texto` | `#fbe0db` / `#9b2423` | `#3a1c1b` / `#f28b82` | 6,46:1 |

  En claro, el contraste no cambia (5,35 · 5,26 · 4,93 · 6,29:1).
- **Los fondos oscuros apenas se separan de `--papel`** (1,02–1,12:1). Toda caja con tinte lleva borde en oscuro:
  el que ya tiene (`border-oro-600` y similares) o uno de 1 px del color de su texto al 40 %.
- **Los 41 usos de `bg-{verde,ambar,oro,rojo}-100`** en `src/` pasan a `bg-tinte-*`, y su texto a `text-tinte-*-texto`.
  Los `-100` y los `600/700` siguen existiendo para lo demás (rellenos de marcador, bordes).
- **`--amarillo-100` / `--amarillo-800`** (chip de «regular») y `--marron-100`: comprobar si se ven claros en oscuro;
  si sí, la misma pareja.
- **`docs/06` §2.4:** las cuatro parejas.
- **Test:** axe en oscuro (ya está en CI) en las pantallas con estas cajas: Ajustes del panel (Entrada abierta y
  Salud), la Cola con diferencias, la ficha. Más un unitario que recorra las parejas y compruebe ≥ 4,5:1 en los dos
  modos, para que un cambio futuro de valor no lo rompa en silencio.

## 3. Fotos de los enganches (RV-356) · P1

### 3.1 Qué son

Tres fotos propias del desarrollador de las **columnas** de la agrupación, recortadas al extremo que engancha en
la boca de riego, que es lo que distingue un tipo de otro. Están junto a este archivo, en `racores-fuentes/`:

| Archivo | Enganche | Lo que se ve |
|---|---|---|
| `barcelona.jpg` | Barcelona | Columna roja con un manguito ancho en el extremo y **rosca por dentro**: se enrosca sobre la salida de la boca |
| `granada.jpg` | Granada | Columna con maneta en T, manguito ancho y la **llave cuadrada** que sale por debajo para abrir la válvula de la boca |
| `directo.jpg` | Directo | Columna galvanizada con un **racor de garras** en el extremo, que engancha directamente en la boca |

720 × 720 px, JPEG, **sin metadatos** (se comprobó: los originales no llevaban EXIF ni ubicación). Sin personas,
matrículas ni nada que identifique el sitio: solo la pieza sobre asfalto. Pueden ir al repositorio público.

**La correspondencia la ha confirmado el desarrollador** (10 oct 2026). No coincide con lo que dibujaban los
esquemas de DEC-152 y DEC-178, que tenían **Barcelona y Directo al revés**: el de Barcelona era «una cara redonda con
dos garras» y el de Directo «una salida roscada». Por eso:

- **Mandan los nombres de la agrupación, no los de la norma.** Que el racor de garras se llame «Barcelona» en la
  UNE 23400 no cambia que en Albolote esa columna se llame *Directo*. Nadie debe «corregir» esto después volviendo a
  la norma; DEC-194 lo deja escrito.
- **Los dos dibujos se archivan**, no se reutilizan: un dibujo con la forma cambiada induce a error aunque esté bien
  hecho.
- **Los datos ya guardados no cambian.** El valor de `racor` en `puntos` y `propuestas` es lo que eligió cada
  voluntario. Producción no está abierta todavía (F9.10), así que en producción no hay datos reales que revisar; en
  staging son de prueba.

### 3.2 Qué hacer

1. Copiar los tres JPEG a `public/racores/fuentes/` (fuera de la precarga del Service Worker desde siempre:
   `globIgnores` de `vite.config.ts`).
2. **Archivar los dibujos** en `docs/archivo/racores-dibujos/` con `git mv`: `public/racores/fuentes/directo.svg`
   (si se queda en `fuentes/`, `preparar-racores.ts` para con «Hay más de una foto de directo») y los tres `.webp`
   actuales de `public/racores/` antes de regenerarlos, con un `LEEME.md` de dos líneas: son los esquemas de DEC-152 y
   DEC-178 y tenían Barcelona y Directo intercambiados (DEC-194). Así no se pierden, pero nadie los toma por buenos.
3. `npx tsx scripts/preparar-racores.ts public/racores/fuentes`. Los JPEG ya son cuadrados y centrados en el
   enganche, así que el recorte al centro del script no quita nada que importe. Comprobar que cada `.webp` sale de
   160 × 160 y ≤ 25 kB.
4. **Mirar los tres `.webp` a 160 px**, en claro y en oscuro, en el formulario de alta y en *Corregir datos*: que se
   distingan entre sí a ese tamaño. Si no, recortar más cerca del extremo (en `fuentes/`, no en el script).
5. **Textos alternativos:** si hoy dicen «dibujo» o «esquema», pasan a «Foto del enganche Barcelona» (y Granada,
   Directo), en `textos.ts` y en el Apéndice A.
6. **`docs/12`:** DEC-194 (abajo); DEC-178 pasa a «sustituida por DEC-194». **`docs/06` §5:** fotos, no dibujos.
7. **`docs/capturas/`:** si alguna de las capturas de `scripts/capturas.ts` enseña la fila del enganche, se rehace.

**Test:** el unitario de `preparar-racores` que ya existe, más uno que compruebe que `public/racores/` tiene
exactamente `barcelona.webp`, `granada.webp` y `directo.webp`, y `fuentes/` exactamente un original por tipo.

> ### DEC-194 · Fotos propias de los enganches
> - **Fecha:** 10 oct 2026 (desarrollador) · **Estado:** vigente (`docs/34` RV-356). Sustituye a DEC-178.
> - **Contexto:** DEC-178 dejó los dibujos como referencia definitiva porque las fotos no llegaban, y previó que, si
>   llegaban, entrarían por el mismo script. Han llegado, y al ponerlas al lado se ve que **los esquemas tenían
>   Barcelona y Directo intercambiados**: dibujaban Barcelona con garras y Directo como una rosca. En la agrupación es
>   al revés.
> - **Decisión:**
>   1. Las tres fotos del desarrollador, recortadas al extremo que engancha en la boca, sustituyen a los dibujos en
>      `public/racores/`. Los originales, en `public/racores/fuentes/`; los dibujos, en `docs/archivo/racores-dibujos/`.
>   2. **Los tipos de enganche llevan los nombres que usa la agrupación:** *Barcelona* es la columna con manguito y
>      rosca por dentro; *Granada*, la de la llave cuadrada que abre la válvula; *Directo*, la del racor de garras. No
>      se ajustan a lo que diga la UNE 23400 sobre el nombre del racor de garras (esa norma sigue mandando en los
>      hidrantes, DEC-010).
> - **Descartado:** dejar los dibujos corrigiendo solo los nombres de los archivos (un esquema enseña la forma, y la
>   forma era la equivocada); cambiar los datos ya guardados (los eligió cada voluntario mirando la boca, no el
>   dibujo, y producción aún no está abierta).
> - **Afecta a:** 01 FR-20 (sin cambio de texto); 06 §5 y Apéndice A (textos alternativos); DEC-152 y DEC-178 (pasan
>   a «sustituida por DEC-194», con una línea que diga que los esquemas tenían dos tipos al revés).

## 4. Documentación (RV-358 a RV-361)

`docs/` pesa 25 MB y tiene más de 200.000 palabras. Dos cosas lo hacen cada vez más difícil de mantener:
las especificaciones de cambios (`docs/17` a `docs/34`) conviven con los documentos propietarios (`00` a `16`), y cada
recorrido añade más de cien imágenes a un repositorio **público**, donde se quedan para siempre en el historial.

> ### DEC-195 · Reglas de la documentación
> - **Fecha:** 10 oct 2026 (desarrollador) · **Estado:** vigente (`docs/34` RV-358 a RV-361).
> - **Decisión:**
>   1. **`docs/` en la raíz solo guarda lo vigente:** los documentos propietarios `00`–`16`, `INDICE.md`,
>      `entornos.md`, `trabajo-en-paralelo.md` y la especificación **en curso**. Una especificación cerrada (con su
>      archivo de verificación y su release publicada) pasa a `docs/archivo/especificaciones/` en el PR que la
>      cierra.
>   2. **En Git, solo las imágenes que enlaza algún documento** de `docs/` (o que usa `scripts/capturas.ts` para 13 y
>      14). Un recorrido completo se guarda como artefacto del workflow, con 90 días, y su informe enlaza solo las
>      capturas que comenta.
>   3. **Ningún recuento ni versión escrita a mano fuera de su documento:** «son 32 documentos», «01 va por la v1.12».
>      Se remite al documento («la versión que diga la cabecera de 01»).
>   4. **El historial de Git no se reescribe** para quitar lo que ya entró. Es público, puede haber copias, y lo que
>      se ahorra no compensa romper los clones.
> - **Afecta a:** 00 §2; CLAUDE.md; INDICE.md; 09 §8; la skill `revisar-pantallas` y el orquestador de recorridos.

### RV-358 · Especificaciones cerradas al archivo · P2

- **Cuáles:** de `docs/17` a `docs/33`, las que tienen su verificación cerrada en `docs/verificacion/` y su release en
  producción. Comprobarlo una por una. `docs/32` figura «en curso» en 09 §8: si su verificación
  (`segunda-revision.md`) dice que está cerrada, se corrige 09 y se archiva; si no, se queda y se dice por qué en el PR.
  `docs/34` se archiva al cerrar RV-362.
- **Cómo:** `git mv docs/NN-*.md docs/archivo/especificaciones/` (con `git mv`, para que `git log --follow` siga).
  Lo mismo para sus mockups de `docs/mockups/` que no enlace ningún documento vigente.
- **Enlaces:** los relativos que apunten a un archivo movido (`](24-…`, `](../24-…`, `docs/24-…`) se corrigen. Las
  menciones como identificador («`docs/24` RV-104» en `docs/12`) **no** se tocan: siguen siendo el nombre del
  documento.
- **`INDICE.md`:** una tabla «Especificaciones archivadas» con número, título, fechas y ruta, para que un
  identificador como `docs/24` se encuentre en un paso.
- **Test:** un unitario (`vitest`, sin dependencias nuevas) que recorre los `.md` y `.html` de `docs/` y de la raíz,
  resuelve cada enlace relativo y falla si alguno no existe. Va a CI, para que el próximo archivo no rompa nada sin
  avisar.

### RV-359 · Imágenes en Git · P2

- **Quitar de `HEAD`** (`git rm`) las imágenes de `docs/` que no enlaza ningún documento ni usa
  `scripts/capturas.ts`. Empezando por `docs/verificacion/recorrido/2026-10-08/` y `2026-10-09/` (11,2 MB): se
  quedan solo las que enlaza su informe. Lo mismo en `docs/capturas/mejoras-33`, `staging-31` y `vistas`. Antes de
  borrar, listar en el PR qué se quita y qué se queda, con el peso de cada carpeta.
- **Para adelante:** el orquestador de recorridos y la skill `revisar-pantallas` escriben el juego completo en una
  carpeta ignorada por Git, lo suben como artefacto del workflow (90 días), y el informe copia a `docs/` solo las que
  comenta.
- **Test:** el unitario de RV-358 comprueba también lo contrario: cada imagen de `docs/` la enlaza algún documento.
- **No** se reescribe el historial (DEC-195.4).

### RV-360 · Recuentos y versiones escritas a mano · P3

- **CLAUDE.md, línea 4:** «son 32 documentos numerados (00 a 31)» → «los documentos numerados que lista
  `docs/INDICE.md`».
- **`INDICE.md`:** «01 va por la v1.12» (01 está en la v1.13) y «Estado al 8 de octubre» → sin versión ni fecha
  escrita; remite a la cabecera de cada documento.
- **Buscar el resto** con `grep` (`documentos`, `va por la v`, `Estado al`) en `docs/00`, `INDICE.md`, CLAUDE.md y las
  skills de `.claude/skills/`.

### RV-361 · 09 §8, fase 9 · P2

La fila de la fase 9 es una sola celda de unos 6.000 caracteres: la historia de las revisiones `docs/17` a `docs/33`.
Nadie la puede leer para saber en qué punto está la fase.

- **El texto actual, sin cambios,** a `docs/archivo/historial-fase-9.md`.
- **La celda nueva**, de cinco líneas como mucho: el software está terminado; producción en la versión que diga
  `CHANGELOG.md`; congelado hasta el piloto (DEC-193); lo que queda, con sus issues: validación con jefatura (#76),
  piloto (#77, #78), abrir producción (#79), correos de jefatura (#81), sesión presencial (#84), comunicar el código
  (#85), prueba en un iPhone (F4) y los cinco tamaños a la luz del día (F5); enlace al historial.

## 5. Cierre (RV-362)

Lo de siempre (`docs/33` RV-343 y RV-345):

1. RV-139b sobre el commit final de `develop`, en verde.
2. **Recorrido corto** solo de lo cambiado (RV-350 a RV-356), en staging, a 412 × 915, 360 × 800 y 1440 × 900, en claro
   y en oscuro. Con las reglas de RV-359: el juego completo como artefacto, en `docs/` solo las que comenta el informe.
   **Sin propuestas nuevas en el informe** (DEC-193): lo que se vea va como issue `tras-piloto`.
3. `npm run publicar` → **0.12.0**.
4. `docs/verificacion/cierre-34.md` y `docs/34` al archivo (DEC-195.1).

**Criterio de salida:** 0.12.0 en producción; el test de enlaces en CI; `docs/` en la raíz con solo lo vigente; y la
fila de la fase 9 que diga, en cinco líneas, que lo que queda es el piloto.
