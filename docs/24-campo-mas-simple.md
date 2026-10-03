# 24 · Pantallas de campo más simples, "Barro", 70 mm en bocas, dos fotos y fotos del racor (3 oct 2026)

| | |
|---|---|
| **Para** | Claude Code, en este repositorio. Tres sesiones en paralelo según `docs/trabajo-en-paralelo.md`. |
| **Base** | `develop` en `503a83a`. Producción en 0.6.5 con la paridad en verde (`docs/23` P-13). |
| **Origen** | Uso real del desarrollador en un Android con staging (3-10, capturas tachadas a mano) y sus decisiones en la conversación del 3-10. |
| **Requisitos** | Cambia `docs/01` (congelado): FR-16, FR-17, FR-18, FR-20, FR-21, FR-41, FR-45, FR-61, FR-66, FR-68 y FR-72. Versión nueva de 01 con "conformidad del desarrollador, 3 oct 2026". La de jefatura la recoge el desarrollador (§5). |

## 0. Reparto y orden

| Sesión | Puntos | DEC | Migraciones y pgTAP | `PW_PUERTO` |
|---|---|---|---|---|
| **Backend** | RV-101 (SQL), RV-102 (SQL), RV-103 (SQL) | DEC-144 a 146 | `0032` y siguientes; pgTAP desde `29` | 4173 |
| **Frontend** | RV-99, RV-100, RV-104 y la parte de pantalla de RV-101 a RV-103 | DEC-147 a 150 | — | 4174 |
| **Ops** | P-14 y el registro | DEC-151 | — | 4175 |

**Orden. Importa, porque hay datos nuevos que una app vieja no entiende:**

1. Frontend empieza ya por **RV-99**, **RV-100**, **RV-104** y **RV-102a**. Ninguno necesita el
   servidor.
2. Backend empieza por **RV-101** y luego **RV-102**, y después **RV-103**. Cada uno en su PR, con su
   migración.
3. La parte de pantalla de RV-101, RV-102 y RV-103 se fusiona **después** de la migración de Backend
   correspondiente en `develop`. Si no, staging envía datos que el servidor rechaza.
4. **P-14**, al final, con todo dentro.

**Coordinación:** issue «Coordinación docs/24». Registros en `docs/verificacion/campo-<sesión>.md`;
Ops consolida en `campo.md` y añade la fila de 24 en `docs/INDICE.md`.

**Herramientas en cada paquete:**

- la skill `paquete-rv`;
- la skill `nueva-migracion` en cada migración;
- `revisar-pantallas` en cada PR de pantallas, con capturas a 412 × 915 **antes y después**;
- `pr-review-toolkit` y `code-review` antes de fusionar.

**Regla general de este documento (va a `docs/06` §8 con RV-99):**

> La pantalla de campo enseña **solo** lo que el voluntario necesita para decidir o lo que evita un
> error que de verdad se comete. Las definiciones van a la sesión presencial y a la ayuda (FR-94), no
> debajo de los campos. Un campo nuevo tiene que servir a jefatura para aprobar o a quien acude a un
> incendio. Si no, no se añade.

---

## 1. Frontend

### RV-99 · Menos texto en las pantallas de campo · P1

Quitar exactamente esto. Las claves están en `src/lib/textos.ts`; cada quitado sale también del
Apéndice A de `docs/06`:

| Pantalla | Se quita | Clave | Se queda |
|---|---|---|---|
| "¿Qué hay aquí?" (`QueHayAqui.tsx`) | el título visible "¿Qué hay aquí?" | `aqui.titulo` | como `aria-label` de la hoja (sigue siendo un diálogo con nombre, WCAG 4.1.2) |
| "¿Qué hay aquí?" | la línea "Junto a …" | `aqui.junto` en pantalla | **sigue** en el texto de *Compartir* (`textoUbicacion`), que sí lo necesita |
| Nuevo punto / Corregir ubicación | "· el círculo azul es tu GPS (±N m)" | `avisosFormulario.ajustaPin` | "Toca el mapa para ajustar el pin" (la clave pasa a no tener parámetro) |
| Diámetro | "La salida, no la tubería. Si hay varias, marca la mayor" | `formulario.diametroAyuda` | solo la etiqueta "Diámetro de la salida mayor" |
| Caudal / estado | "Malo = probado y sale débil. No funciona = …" | `formulario.caudalAyuda` | solo los botones |
| Pie del formulario | la segunda copia de "Sin conexión con el servidor · seguimos con los datos guardados…" y de "Sin cobertura · …" | `envio.avisoSinServidor`, `envio.avisoSinCobertura` en `Proponer.tsx` | la banda de arriba, que ya lo dice. El botón de envío sigue diciendo "Guardar · se enviará…" |

**Se quedan a propósito:**

- el aviso "fuera de la zona habitual" (cambia lo que ve jefatura);
- "· obligatoria" en la foto;
- el texto bajo un botón deshabilitado que dice por qué no se puede enviar (06 §5, UI-05).

**Las definiciones de Malo y No funciona (FR-18) no se pierden:**

- Pasan a la segunda pantalla de primer uso (FR-94), una línea cada una.
- Van también a la guía de la sesión presencial (`docs/02` o donde esté el guion de F9.9, #84).

**Tests:**

- `src/lib/textos.test.ts`, o uno nuevo: las claves quitadas ya no existen, para que no vuelvan por
  descuido.
- Vitest de `QueHayAqui`: la hoja tiene `aria-label` "¿Qué hay aquí?" y ningún texto "Junto a"
  visible.
- `textoUbicacion` sigue llevando la calle.
- e2e `operaciones.spec.ts`: en el formulario de alta no aparece "La salida, no la tubería" ni
  "Malo =".
- Captura a 412 × 915 de "¿Qué hay aquí?" y de "Nuevo punto", antes y después.

### RV-100 · La acción principal arriba y en color · P1

1. **"¿Qué hay aquí?"**:
   - "Añadir un punto aquí" pasa a ser **la primera** acción, como **botón primario**: `--naranja-600`,
     texto blanco, el mismo color que el botón + del mapa. Así un mismo color dice "añadir" en toda la
     app.
   - Debajo, en el estilo de botón secundario que tienen hoy: Cercanos desde aquí, Medir desde aquí y
     Compartir esta ubicación.
2. **Regla nueva en `docs/06` §5 (DEC-147):** una pantalla o hoja tiene **como mucho un botón
   primario**, arriba del grupo de acciones.
   - Repasa con esa regla la ficha y "Proponer un cambio".
   - Si en alguna hay más de un primario, o el primario no es el más usado, corrígelo y anótalo en el
     registro con la captura.
   - No se inventan primarios donde no hay una acción clara.

**Tests:**

- Vitest de `QueHayAqui`: el primer botón es "Añadir un punto aquí" y lleva la clase del primario.
- Test de `docs/06` §5 o del componente: como mucho un primario por hoja, en `QueHayAqui` y `Ficha`.
- Captura a 412 × 915.

### RV-104 · Fotos de referencia del racor (FR-20, que ya lo pedía) · P1

FR-20 ya dice "con fotos de referencia junto al campo", y nunca se hizo.

1. **Archivos:**
   - `public/racores/granada.webp` y `public/racores/barcelona.webp`.
   - 160 × 160 px, ≤ 25 kB cada una.
   - Las **pone el desarrollador** (§5): fotos propias, nunca imágenes sacadas de internet (derechos;
     el repositorio es público).
2. **Script `scripts/preparar-racores.ts`:** toma las fotos originales de una carpeta que se le pasa,
   las recorta en cuadrado al centro, las reduce y las escribe en `public/racores/`. Usa la misma
   herramienta de imagen que `generar-iconos.ts`, sin dependencias nuevas.
3. **Pantalla:**
   - Cada botón Granada y Barcelona del formulario enseña su foto: 48 × 48 px encima del nombre, con
     `alt=""`, porque el nombre ya va en el botón. "Otro" no lleva foto.
   - Tocar la foto selecciona igual que tocar el botón: no hay ampliación ni ventana aparte.
   - El botón crece en alto lo justo, y la fila de tres sigue cabiendo a 360 px.
4. **Sin cobertura:** las dos imágenes entran en el precache del Service Worker (`vite.config.ts`).
5. **Si falta la imagen** (antes de que el desarrollador la ponga), el botón se ve como hoy, solo
   texto, sin icono roto. Se comprueba con `onError` o mirando el manifiesto de precache.
6. **Presupuesto:** las imágenes no cuentan en el JS inicial. Si `npm run presupuesto` mide el
   precache, súbelo con DEC-148 y di cuánto.

**Tests:**

- Vitest del componente de racor: sin imagen no hay `<img>` roto; con imagen, hay `<img>` dentro del
  botón y el `aria-pressed` del botón no cambia.
- Test de `scripts/preparar-racores.ts` con una imagen de prueba: salida de 160 × 160 y ≤ 25 kB.
- e2e: con la red cortada tras la primera carga, la imagen del racor se ve.

---

## 2. Backend y Frontend

### RV-101 · Bocas de riego de 70 mm y "otra medida" · P1

**Qué se pide.** Hoy una boca de riego es siempre 45 mm (FR-16; `puntos_diametro_boca` exige
`diametro_mm = 45`). Hay bocas de 70 mm y alguna de otra medida.

**Decisión (DEC-144):**

- Bocas: **45 · 70 · Otra medida** con un campo numérico. A diferencia del hidrante (FR-17), una
  "otra medida" de boca **sí se puede aprobar tal cual**. Es lo que hay en la calle, y una boca no
  tiene norma que la limite a 45 o 70.
- El hidrante no cambia (70 · 100 · otra medida que jefatura fija).

**Backend** (migración `0032_diametro_bocas.sql`):

1. **Restricción:**
   `puntos_diametro_boca check (tipo <> 'boca_riego' or diametro_mm between 20 and 150)`.
   Las filas que hay (todas 45) la cumplen.
2. **`fn_proponer`** (misma firma, `create or replace`):
   - Para `boca_riego`, acepta `diametro_mm` en (45, 70) **o** `diametro_otro`, número entero entre 20
     y 150. Fuera de eso: `PAYLOAD_INVALIDO(diametro_otro)`.
   - **Sin `diametro_mm` ni `diametro_otro` → 45**, para que la app anterior, que no lo manda, siga
     funcionando (04 §12).
   - El alta guarda `diametro_mm = coalesce(diametro_mm, diametro_otro)`.
3. **`datos` (corregir datos)** acepta el mismo diámetro en bocas.
4. **`fn_radio_px`:** hoy `else 0` para lo que no es 45, 70 o 100. Pasa a:
   ≤ 45 → 1, ≤ 70 → 2, > 70 → 3. Mismo criterio que el tamaño = "más agua aprovechable" de 06 §4.
5. **`v_cola_revision`:** `otra_medida` sigue marcando la señal, pero en una boca no bloquea la
   aprobación. `DIAMETRO_SIN_FIJAR` solo aplica a hidrantes.
6. **`docs/05`** (§ de `fn_proponer` y la tabla de `datos`) y **`docs/01`** FR-16 y FR-17, antes que
   el SQL.

**pgTAP** (`29_diametro_bocas.test.sql`):

- alta de boca con 45, con 70 y con `diametro_otro = 32` → aprobada con ese diámetro;
- con 200 → `PAYLOAD_INVALIDO`;
- sin diámetro → 45;
- hidrante con 45 → sigue rechazado;
- `fn_radio_px(32)`, `(45)`, `(70)` y `(90)` dan los factores de arriba.

**Frontend** (después de 0032):

- En `Proponer.tsx`, para boca: los mismos tres botones que el hidrante (45 · 70 · Otra medida), con
  el campo numérico al elegir Otra medida, en mm.
- El formulario de corregir datos, igual.
- Ficha, lista e inventario enseñan el número tal cual ("32 mm").
- La exportación (FR-160) no cambia de formato.

**Tests:**

- `propuestas.test.ts`: payload con 70 y con `diametro_otro`, y el aviso "Indica la medida" si el
  campo está vacío.
- e2e de alta de boca con 70.
- `npm run compatibilidad` en verde: la app anterior manda una boca sin diámetro y entra con 45.

### RV-102 · Estado "Barro": sale agua con barro · P1

**Decisiones del desarrollador (3-10, DEC-145):**

- "Barro" **no** cuenta como utilizable. Cercanos (FR-74) solo lista *bueno* y *regular*, así que ya
  lo excluye: no hay que tocar la consulta, solo comprobarlo con un test.
- **No** exige descripción.

**RV-102a · Frontend primero, sin servidor: un estado desconocido no rompe la app.**

Hoy un `caudal` que la app no conoce rompe el dibujo. `COLOR_CAUDAL[x]` y `FACTOR_CAUDAL[x]` dan
`undefined`, y el radio sale NaN. Esto tiene que estar **en producción antes** de que el servidor
pueda devolver "barro", porque los móviles con la versión anterior en caché tardan en actualizarse.

- Un `caudal` desconocido se dibuja como *no funciona*: tamaño mínimo, tachado y gris. En la ficha se
  lee "Estado desconocido · actualiza la aplicación". Va en `src/lib/simbologia.ts`, `derivar.ts` y
  `ficha.ts`.
- `anotarError` una vez por sesión, sin datos del punto.
- **Test:** `simbologia.test.ts` y `derivar.test.ts` con `caudal: 'otro_valor'` no dan NaN ni
  `undefined`.

**Backend:**

1. **`0033_estado_barro.sql`:** solo `alter type hidrantes.estado_caudal add value 'barro' after
   'no_funciona';`.
   - En su propio archivo, porque un valor nuevo de un enum no se puede usar en la misma
     transacción en que se añade.
   - Comprueba que `scripts/migrar.ts` aplica cada archivo en su transacción. Si no, documenta cómo
     se aplica.
2. **`0034_estado_barro_uso.sql`:**
   - `fn_radio_px` da factor 0 a `barro` (tamaño mínimo, como no funciona).
   - `fn_proponer` acepta `barro` en `alta` y `estado`, sin `descripcion_fallo`.
   - La restricción `puntos_fallo_descrito` no cambia (solo afecta a `no_funciona`).
   - Repasa todas las funciones y vistas que comparan `caudal`: `grep -n "no_funciona"
     supabase/migrations`. Decide en cada una si `barro` va con `no_funciona` y anótalo en el PR.
3. **`docs/05`** y **`docs/01`** FR-18 ("cinco niveles"), FR-61 y FR-68, antes que el SQL.

**pgTAP** (`30_estado_barro.test.sql`):

- alta con `barro` sin descripción → aceptada;
- `fn_radio_px(…, 'barro')` = el mínimo;
- un punto `barro` no sale en la consulta de cercanos, si existe en SQL. Si Cercanos se calcula en el
  móvil, el test va en vitest.

**Frontend** (después de 0034):

1. **Botón "Barro"** en Caudal / estado. La rejilla pasa a 2 + 3 (Bueno · Regular / Malo · Barro ·
   No funciona), con los botones a 44 px de alto mínimo a 360 px. Si no cabe, 2 + 2 + 1 con "Barro"
   solo en la última fila. Elige con la captura y anótalo en DEC-149.
2. **Símbolo** (06 §2.2 y §4):
   - Relleno **marrón** `--marron-700`, propuesta `#6B4423`.
   - Fondo del chip `--marron-100`, propuesta `#EFE3D6`; texto del chip `--marron-700`.
   - **Tamaño mínimo y tachado**, como *no funciona*: el tachado dice "no se puede usar" y el color
     dice por qué. Así el significado no depende solo del color (WCAG 1.4.1).
   - **Contraste:** el texto del chip llega a 4,5:1 y el relleno a 3:1 sobre el mapa claro. Sobre el
     oscuro vale el borde blanco, como para `--gris-700` (06 §2.2).
   - **Que se distinga:** marrón frente a `--naranja-estado-600` (regular) y `--rojo-700` (malo), con
     simulación de deuteranopía y protanopía. Pon una diferencia mínima medible en el test (por
     ejemplo, ΔE2000 ≥ 15). Si `#6B4423` no llega, ajústalo y anota el valor final en DEC-149.
3. **Leyenda** (06 §4.5): una fila más, "Barro".
4. **Filtro de la lista** (FR-68): "No funciona" pasa a **"No utilizable"** y recoge *no funciona* y
   *barro*. Lo que importa en campo es "no sirve", no por qué. Texto en `textos.ts` y en el Apéndice A.
5. **Ficha y panel:** el chip "Barro". En el diff del panel, el valor nuevo. En el inventario, el
   filtro por estado tiene "Barro".

**Tests:**

- `accesibilidad.test.ts`: los tokens marrones con los contrastes de arriba y la distancia de color
  frente a regular y malo.
- `simbologia.test.ts`: barro con tamaño mínimo y tachado.
- `puntos.test.ts`: el filtro "No utilizable" incluye barro.
- `incidente.test.ts`: Cercanos no lista barro.
- e2e: alta con Barro y su marcador en la captura.

### RV-103 · Dos fotos al dar de alta y al corregir la ubicación · P1

**Qué se pide.** Foto 1, **la conexión** (la que hay hoy). Foto 2, **el sitio**: una referencia para
encontrarlo, por ejemplo "el hidrante al lado de la gasolinera".

**Decisión del desarrollador (3-10):** la foto del sitio es obligatoria en **alta** y en **corregir
ubicación**. No se pide en las demás operaciones.

**Backend** (migración `0035_foto_del_sitio.sql`, DEC-146):

1. **Columnas:** `puntos.foto_sitio_path text` y `propuestas.foto_sitio_path text`, las dos
   **nullables**: los puntos de hoy no la tienen y las propuestas de la app anterior tampoco la
   traerán.
2. **`fn_proponer`:** **firma nueva** con un parámetro más al final, `foto_sitio_path text`.
   - La de hoy **se queda** (04 §12): la sigue llamando la app anterior hasta que se actualice.
     PostgREST elige por los nombres de los parámetros.
   - **En la nueva**, `foto_sitio_path` es obligatoria si `operacion in ('alta', 'ubicacion')`
     (`FOTO_SITIO_OBLIGATORIA`) y no se admite en las demás (`PAYLOAD_INVALIDO(foto_sitio_path)`).
   - Misma validación de reserva que `foto_path`: tiene que estar reservada por el mismo dispositivo,
     con `FOTO_NO_RESERVADA` si no. Tampoco puede ser la misma ruta que `foto_path`.
   - **La de hoy** sigue aceptando alta y ubicación sin foto del sitio. La propuesta llega con la
     señal nueva `sin_foto_sitio` en `v_cola_revision`.
3. **`fn_aprobar_lote` y la aprobación de una sola:**
   - En **alta**, `puntos.foto_sitio_path = propuestas.foto_sitio_path`.
   - En **ubicación**, la sustituye si la propuesta trae una.
   - En las demás, no se toca.
   - La alta directa de jefatura (FR-151) igual.
4. **`fn_fotos_referenciadas` (y su `_lista`) incluye `foto_sitio_path`** de puntos y de propuestas
   pendientes o aprobadas. **Esto es lo más importante del punto:** sin ello, la purga de los lunes
   borraría todas las fotos del sitio.
5. **Vistas:**
   - `v_puntos_activos` (y lo que sincroniza al móvil) incluye `foto_sitio_path`.
   - `v_cola_revision` incluye `foto_sitio_path` y la señal `sin_foto_sitio`.
6. **Tope diario de subidas** (FR-38, "Fotos por móvil y día"): cuenta reservas, así que un alta gasta
   dos.
   - Sube el valor por defecto al doble en la misma migración, solo si es el de fábrica.
   - Si jefatura lo cambió, no se toca.
   - Dilo en el PR.
7. **`docs/05`**, **`docs/01`** FR-21, FR-41, FR-45 y FR-66, y **`docs/04`** §7 (cálculo del
   almacenamiento), antes que el SQL.

**pgTAP** (`31_foto_del_sitio.test.sql`):

- alta con la firma nueva sin foto del sitio → `FOTO_SITIO_OBLIGATORIA`;
- con las dos → aprobada, y el punto tiene las dos;
- revisión con `foto_sitio_path` → `PAYLOAD_INVALIDO`;
- la firma vieja sin foto del sitio → aceptada y con `sin_foto_sitio`;
- `fn_fotos_referenciadas()` contiene la foto del sitio;
- ubicación aprobada → `foto_sitio_path` sustituida;
- permisos: las dos firmas solo para `anon` y `authenticated` como hoy;
- `npm run compatibilidad` en verde.

**Frontend** (después de 0035):

1. **Formulario de alta y de corregir ubicación:**
   - En "Foto" hay **dos huecos** lado a lado, cada uno con una sola palabra: **"Conexión"** y
     **"Sitio"**. Los dos obligatorios. Botón deshabilitado con la línea "Falta la foto del sitio"
     (UI-05).
   - Revisión, estado, datos y retirada siguen con una foto.
2. **Procesado** (`src/lib/foto.ts`): la foto del sitio con **1280 px** de lado mayor y objetivo
   ≈ 150 kB. Se ve un entorno, no un detalle. La de la conexión no cambia (TR-15).
3. **Cola sin cobertura** (`src/lib/cola.ts`):
   - El elemento guarda `foto_sitio: Blob | null` y `foto_sitio_path: string | null`.
   - Se suben las dos, cada una con su reserva por `/api/url-subida`, antes de `fn_proponer`.
   - `FOTO_NO_RESERVADA` se resuelve subiendo otra vez **la que falte**.
   - **Migración de IndexedDB:** los elementos ya en cola, sin el campo, se leen con `null` y se
     envían con la firma vieja si son alta o ubicación. Nada en cola se pierde por actualizar.
4. **Ficha (FR-66):**
   - La foto de la conexión, como hoy. Si hay foto del sitio, se pasa a ella deslizando o con dos
     puntos debajo, cada una con su palabra.
   - Las dos se cargan solo al abrir la ficha, como hoy.
5. **Panel:** la cola y el detalle enseñan las dos fotos lado a lado; con `sin_foto_sitio`, la señal
   "sin foto del sitio". El inventario no cambia.
6. **Exportación (FR-160):** columna `foto_sitio` con su URL, al lado de `foto`.

**Almacenamiento (TR-53, para el registro):** con 600 puntos, 600 × (250 + 150) kB ≈ 240 MB. La
cuenta va en `docs/04` §7, y el aviso de Salud del sistema al 80 % no cambia.

**Tests:**

- `cola.test.ts`:
  - alta con dos fotos → dos reservas, dos PUT y una llamada con los dos paths;
  - elemento viejo sin `foto_sitio` → firma vieja;
  - `FOTO_NO_RESERVADA` solo de la del sitio → se sube solo esa.
- `foto.test.ts`: la del sitio sale con 1280 px.
- `propuestas.test.ts`: alta sin la foto del sitio → "Falta la foto del sitio".
- e2e:
  - alta con las dos fotos (los e2e ya simulan la cámara);
  - la ficha enseña las dos;
  - corregir ubicación las pide;
  - revisión no.
- e2e de integración (`e2e/integracion`): la propuesta llega a la cola del panel con las dos fotos.

---

## 3. Ops

### P-14 · Producción al día al cerrar

Como `docs/23` P-13: release, PR `develop → main` con merge commit, las dos aprobaciones del
desarrollador y la paridad en verde. Además:

- Las migraciones 0032 a 0035 se aplican en producción **en orden**. RV-102a tiene que estar en
  producción **antes** que 0034, como dice §0. Si van en la misma release, vale, porque el enum solo
  aparece en datos aprobados después del despliegue. Compruébalo con `npm run compatibilidad` contra
  la versión anterior y anótalo.
- Comprueba en producción que una purga en ensayo (`gh workflow run purgar-fotos.yml -f
  ensayo=true`) **no** propone borrar ninguna foto del sitio. Anótalo.
- Comprueba que las imágenes de los racores están en el precache de producción, si el desarrollador
  ya las ha puesto.

---

## 4. Checklist final

- [ ] RV-99: ninguno de los textos de la tabla aparece; capturas antes y después en el PR.
- [ ] RV-100: "Añadir un punto aquí" arriba y en naranja; como mucho un primario por hoja.
- [ ] RV-104: Granada y Barcelona con su foto, también sin cobertura; sin imagen, el botón se ve bien.
- [ ] RV-101: una boca de 70 y una de 32 mm se dan de alta y se aprueban; la app anterior sigue
      dando 45.
- [ ] RV-102a en producción antes de 0034; RV-102: "Barro" marrón y tachado, fuera de Cercanos, en
      "No utilizable".
- [ ] RV-103: alta y ubicación piden las dos fotos; la ficha y el panel las enseñan; la purga no
      toca las fotos del sitio; la cola vieja no pierde nada.
- [ ] `docs/01` en versión nueva; 05, 06 y 04 al día.
- [ ] P-14: producción en la versión nueva, con la paridad en verde.

---

## 5. Lo que hace el desarrollador (no Claude Code)

1. **Fotos de los racores:** una foto propia de un racor Granada y otra de uno Barcelona, de frente,
   con fondo liso.
   - Pásalas a la sesión Frontend (o déjalas en una carpeta fuera del repositorio): ella las prepara
     con `scripts/preparar-racores.ts`.
   - Nunca imágenes de internet.
2. **Conformidad de jefatura** sobre los cambios de 01:
   - "Barro" como quinto estado;
   - 70 mm y otra medida en bocas;
   - la foto del sitio obligatoria en alta y en corregir ubicación.

   Basta un sí por escrito, que se anota en la versión de 01.
3. **Sesión presencial (F9.9, #84):** explicar Malo, Barro y No funciona con una frase cada uno, ya
   que dejan de estar en la pantalla.
4. **P-14:** las dos aprobaciones de producción.
