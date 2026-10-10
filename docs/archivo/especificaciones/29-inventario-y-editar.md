# 29 · Panel más corto, Inventario con dos filtros y Editar como el alta (oct 2026)

| | |
|---|---|
| **Para** | Claude Code, en este repositorio. **Cuatro sesiones** (Backend, Frontend-campo, Frontend-panel, Ops) en dos oleadas. |
| **Base** | `develop` en `aaf7b21` (docs/28 hecho). |
| **Origen** | Capturas del desarrollador del Inventario y del diálogo Editar, y una del alta en el móvil como modelo para Editar. Elige la **versión B** del mockup (panel lateral con los cambios marcados). |
| **Mockup** | `docs/mockups-inventario-y-editar.html`, solo la versión B. Si el mockup y este texto no coinciden, manda el texto. |
| **Requisitos** | Cambian FR-20, FR-120, FR-121, FR-122, FR-130 a FR-132 y FR-143 en `docs/01` (congelado). Versión nueva de 01 con "conformidad del desarrollador, oct 2026". |
| **Producción** | Con la siguiente release. Lleva dos migraciones (0037 y 0038). |

## 0. Reparto

### Decisiones del desarrollador

- **DEC-167:** el panel se queda con cinco pestañas. Fuera **Revisiones caducadas** y **Voluntarios**, y todo lo que hacían:
  - la hoja de campo;
  - la actividad de voluntarios;
  - la lista de incidencias y, con ella, "Algo no funciona" en la app;
  - anonimizar desde el panel. El derecho de supresión sigue: pasa a un script del desarrollador (RV-126).
- **DEC-168:** el Inventario filtra solo por **Tipo** y **Estado**, los dos en desplegable. Fuera Revisión, Núcleo y Diámetro.
- **DEC-169:** **Editar** es un panel lateral con mapa, con los controles del alta y los cambios marcados. Jefatura **mueve el punto desde Editar**, sin pasar por la cola; queda en el Registro.
- **DEC-170:** nuevo tipo de enganche **Directo**. El orden es Barcelona · Granada · Directo · Otro.

### Sesiones y oleadas

| Oleada | Sesión | Puntos | `PW_PUERTO` |
|---|---|---|---|
| 1 | **Backend** | RV-120 (0037 + 0038), RV-126 (script de anonimizar) | 4180 |
| 1 | **Frontend-campo** | RV-121 (Directo en la app), RV-125 (fuera "Algo no funciona") | 4182 |
| 1 | **Frontend-panel · subagente** (worktree) | RV-122 (pestañas fuera) | 4183 |
| 2 | **Frontend-panel** | RV-123 (filtros), luego RV-124 (Editar). Empieza cuando 0037, 0038 y RV-121 estén en `develop`. | 4184 |
| 1 y 2 | **Ops** | Documentación, mockup, índice y verificación | 4185 |

### Archivos y dueños

| Archivo | Dueño |
|---|---|
| `supabase/migrations/0037_*.sql`, `0038_*.sql`, `supabase/tests/*`, `scripts/anonimizar.ts` y su test, `package.json` (solo el script `anonimizar`) | Backend |
| `src/tipos/punto.ts`, `src/lib/racores.ts`, `src/lib/ficha.ts`, `src/componentes/operaciones/Campos.tsx`, `src/paginas/Ajustes.tsx`, `src/paginas/Incidencia.tsx`, `src/paginas/RutasDentro.tsx`, `src/lib/panel/exportar.ts` | Frontend-campo |
| `src/paginas/PanelJefatura.tsx`; borrar `Caducadas.tsx`, `HojaDeCampo.tsx`, `Voluntarios.tsx`, `src/lib/panel/voluntarios.ts` y sus tests; `src/componentes/panel/Ajustes.tsx` (solo la fila de Salud) | subagente de panel |
| `src/componentes/panel/Inventario.tsx`, `dialogos.tsx`, el nuevo `EditarPunto.tsx`, `src/lib/panel/inventario.ts` y sus tests | Frontend-panel |
| `src/lib/textos.ts` | cada uno, su bloque. Rebasar justo antes de fusionar. |
| `docs/*`, `docs/mockups/`, `docs/verificacion/inventario-y-editar.md` | Ops |

**Herramientas, como siempre:** las skills `paquete-rv`, `nueva-migracion` (Backend) y `revisar-pantallas`. Las capturas, a 412 × 915, 768 × 1024 y 1440 × 900, antes y después, en claro y en oscuro. `pr-review-toolkit`, `code-review` y `security-guidance` (Backend) antes de fusionar.

---

## 1. RV-120 · Base de datos: Directo y mover desde Editar · P1 · Backend

### 0037 · `racor_directo.sql`

- `alter type hidrantes.tipo_racor add value 'directo' before 'otro';`
- Va **sola en su migración**: un valor nuevo de enum no se puede usar en la misma transacción. Es lo mismo que se hizo con Barro (0033 / 0034).

### 0038 · `editar_con_ubicacion.sql`

`create or replace function hidrantes.fn_editar_punto(punto_id uuid, cambios jsonb)`, igual que en 0032, con estos cambios:

- **Claves nuevas** `lat` y `lng` en `fn_exigir_claves`.
  - Van **las dos o ninguna**. Si llega solo una: `PAYLOAD_INVALIDO(ubicacion)`.
- **Con `lat` y `lng`:**
  - `geom = st_setsrid(st_makepoint(lng, lat), 4326)::geography`;
  - `municipio` y `nucleo` se recalculan con `fn_municipio_de`, como en la aprobación de una ubicación;
  - el `search_path` incluye `extensions`.
- **Fuera de los límites del `check` de `puntos`:** `PAYLOAD_INVALIDO(ubicacion)`. Fuera de la zona habitual pero dentro de los límites: se acepta (lo avisa la pantalla).
- **Registro:** `fn_registrar(…, 'edicion_admin', …)`, con `antes` y `despues` de `fn_punto_json` (ya llevan `lat`/`lng`). Si se movió, el detalle lleva `desplazamiento_m` (redondeado a 0,1 m), como `fn_aprobar` con `ubicacion` (0006).
- **Desactualizadas:** las propuestas pendientes de ese punto pasan a "desactualizadas" por `actualizado_en`, como con cualquier edición. Comprobar que el trigger lo cubre.
- Los permisos no cambian: solo administradores (`fn_exigir_admin`).

### pgTAP

- Una boca acepta `racor = 'directo'`; un hidrante lo rechaza (`puntos_racor_solo_boca`).
- **Mover un punto:**
  - cambia `geom`;
  - recalcula el núcleo (un punto de Albolote movido a Pretel queda en Pretel);
  - deja `desplazamiento_m` en el registro.
- Solo `lat`: `PAYLOAD_INVALIDO(ubicacion)`. Coordenadas fuera de los límites: `PAYLOAD_INVALIDO(ubicacion)`.
- Sin sesión de administrador: error, como hoy.
- Mover y cambiar el enganche en la misma llamada: una sola entrada en el registro.
- `v_cola_revision` sigue marcando como desactualizada una propuesta anterior al cambio.

---

## 2. RV-121 · Enganche **Directo** en la app · P1 · Frontend-campo

- `Racor` = `'granada' | 'barcelona' | 'directo' | 'otro'`. El texto es `T.formulario.directo` = **"Directo"**.
- **`SelectorRacor`:** cuatro tarjetas en este orden: **Barcelona · Granada · Directo · Otro** (DEC-170).
  - Una fila de cuatro, también a 360 px. Cada tarjeta mide ≥ 44 × 44 px; la foto pasa de 48 a 40 px por debajo de 400 px de ancho.
  - "Directo" lleva su foto de referencia, como Barcelona y Granada.
    - `URL_FOTO_RACOR.directo = '/racores/directo.webp'`, preparada con `scripts/preparar-racores.ts`.
    - Mientras el desarrollador no la ponga, se ve solo el nombre: es el comportamiento que ya existe cuando falta la foto.
- **Dónde se ve:**
  - la ficha;
  - el inventario ("45 mm · enganche Directo");
  - la cola (el campo "Tipo de enganche");
  - las exportaciones (Excel, CSV, GeoJSON) y Mis propuestas.
  - Comprueba con `grep` todos los `nombreRacor` y los `switch` sobre `racor`.
- **Compatibilidad:** una versión vieja de la app no ofrece Directo, pero puede leer un punto que lo tenga. La ficha vieja tiene que enseñar algo con sentido y no romperse: comprueba qué devuelve `nombreRacor` con un valor desconocido. Si hace falta, el caso por defecto es "Otro".
- **Tests:**
  - `racor.test.tsx`: cuatro opciones en el orden fijado; elegir Directo envía `racor: 'directo'`.
  - e2e de alta de una boca con Directo, a 360 y 412 px, sin desplazamiento a lo ancho.
  - axe del formulario.

## 3. RV-125 · Fuera "Algo no funciona" · P2 · Frontend-campo

La lista de incidencias se va del panel (RV-122), así que lo que mandan los voluntarios ya no lo leería nadie.

- **Quitar** el botón "Algo no funciona" de Ajustes (`src/paginas/Ajustes.tsx`) y la ruta `/incidencia`, que pasa a redirigir a `/ajustes`. Borrar `Incidencia.tsx`, sus textos y sus tests.
- **No se borra nada en la base de datos:** la tabla `incidencias_app` y sus RPC se quedan. Una versión vieja de la app aún puede mandar una incidencia; se guarda y nadie la lee.
- Abre una issue "Limpiar incidencias_app (DEC-167)" para borrarlas cuando no quede ninguna versión vieja (04 §12).
- Los errores automáticos (`errores_cliente`) **no** cambian: siguen en Salud del sistema.

---

## 4. RV-122 · Pestañas: de siete a cinco · P1 · subagente de panel

- **Pestañas:** Cola de revisión · Inventario · Registro · Papelera · Ajustes.
- **Fuera** `Caducadas`, `HojaDeCampo` y `Voluntarios`, sus rutas, `lib/panel/voluntarios.ts`, textos (`panelCaducadas`, `panelVoluntarios`) y tests.
  - Antes de borrar algo de `lib/panel/inventario.ts` (por ejemplo `caducadasPorNucleo`), mira si lo usa otra cosa.
- **Rutas viejas:** `/admin/caducadas` y `/admin/voluntarios` redirigen a `/admin/inventario` (`<Navigate replace>`), por si alguien las tiene guardadas.
- **Badge:** el de incidencias (el "2" de Voluntarios) desaparece; no se pasa a otra pestaña.
- **Salud del sistema** (Ajustes del panel): fuera la fila "Incidencias abiertas". Si la RPC de salud sigue devolviendo el campo, se ignora; no hace falta tocar la base de datos.
- **Lo que sigue igual:**
  - el parámetro "meses entre revisiones";
  - el rojo de "hace 1 año" en la tabla;
  - el anillo de sin revisar del mapa;
  - el resumen semanal por push (FR-164), si está activo.
- **Tests:**
  - el panel enseña exactamente cinco pestañas;
  - las dos rutas viejas redirigen;
  - en Salud no aparece "Incidencias";
  - axe del panel;
  - a 412 px las cinco pestañas caben o se desplazan dentro de su fila, sin desplazar la página a lo ancho.

---

## 5. RV-123 · Inventario: Tipo y Estado en desplegables · P1 · Frontend-panel

- **Dos desplegables**, con la etiqueta encima ("Tipo", "Estado") y 44 px de alto:
  - **Tipo:** Todos · Hidrantes · Bocas de riego.
  - **Estado:** Todos · Bueno · Regular · Malo · Barro · No funciona, con el número de puntos de cada uno según el filtro de tipo ("Regular · 3").
  - Son `<select>` nativos, accesibles y con el selector propio del móvil. El punto de color del mockup no cabe en un `<option>` nativo; **no** se hace un desplegable propio por eso.
  - **Filtro activo:** borde de 2 px `--marino-950` y texto en negrita. Al lado, el enlace **"Quitar filtros"**.
- **Fuera:** los chips de Tipo, Estado y Revisión, y los `<select>` de Núcleo y Diámetro. Se quitan también `sin_revisar`, `nucleo` y `diametro` de `FiltrosInventario`, `filtrosExportacion` y `nucleosDe` si nada más los usa.
  - Núcleo, Diámetro y Última revisión siguen siendo **columnas que se pueden ordenar**.
- **Exportar ▾:** un solo botón secundario que abre un menú con Excel, CSV y GeoJSON.
  - Es un `button` con `aria-haspopup="menu"` y `aria-expanded`, y el menú con `role="menu"`.
  - Se mueve con las flechas, cierra con Esc y al tocar fuera, y devuelve el foco al botón.
  - Exporta lo filtrado, como hoy.
- **Tabla / Mapa** no cambia.
- **Disposición:**
  - **≥ 1100 px:** una fila, con Tipo y Estado a la izquierda y Exportar y Tabla/Mapa a la derecha.
  - **Tableta:** la misma fila.
  - **Móvil:** Tipo y Estado lado a lado; debajo, "Quitar filtros", Exportar y Tabla/Mapa.
- **Recordar el filtro:** si hoy se guarda en la URL o en `localStorage`, se sigue guardando, sin los filtros quitados. Un filtro viejo guardado (`nucleo=…`) se ignora sin error.
- **Tests:**
  - filtrar por tipo y estado;
  - "Quitar filtros";
  - los números del desplegable de Estado;
  - exportar respeta el filtro;
  - el menú de Exportar con el teclado;
  - axe;
  - a 412 px, sin desplazamiento a lo ancho.

---

## 6. RV-124 · Editar: panel lateral con mapa y los cambios marcados · P1 · Frontend-panel, después de RV-123

Sustituye a `DialogoEditar`. El componente nuevo es `src/componentes/panel/EditarPunto.tsx`. Reutiliza **las mismas piezas que el alta**: `Campo`, `Segmentado`, `SelectorRacor` y `PildorasCaudal` de `operaciones/Campos.tsx`, y `SelectorPin`. No hace copias propias.

### Cómo se abre

| Ancho | Forma |
|---|---|
| **≥ 1100 px** | Panel de **540 px** a la derecha, por encima de la tabla y **sin velo**: la tabla se sigue viendo y desplazando, con la fila marcada. |
| **768–1099 px** | Panel de **500 px** a la derecha, con un velo ligero (`rgba(14,27,48,.25)`). Se cierra tocando fuera. |
| **< 768 px** | **Pantalla completa.** El "atrás" de Android cierra el panel y no sale del panel de jefatura: se usa una entrada de historial. |

En todos:

- `role="dialog"` con `aria-labelledby` en el título.
- Esc y la X cierran.
- El foco entra en el primer control y, al cerrar, vuelve al "Editar" de la fila.
- **Con cambios sin guardar**, cerrar pregunta antes: **"¿Descartar N cambios?"**, con "Descartar" y "Seguir editando".
- En el ordenador, tocar "Editar" en otra fila:
  - sin cambios, cambia de punto;
  - con cambios, hace la misma pregunta.

### Qué lleva, de arriba abajo

1. **Banda del estado actual**, como la de la ficha (`bandaDe`):
   - el código en JetBrains Mono;
   - "Editar";
   - a la derecha, el nombre del estado y la X.
   - Enseña el estado **guardado**, no el que se está eligiendo.
2. **Ubicación:**
   - `SelectorPin` con el pin en la posición del punto y `original` = la posición guardada, a todo el ancho del panel; 230 px de alto en el ordenador y la tableta y 200 px en el móvil.
   - Debajo, **"Toca el mapa para ajustar el pin"**.
   - El botón de "mi posición" sale como en el alta.
   - **Si se mueve:** la posición de antes queda en gris, unida a la nueva con una línea discontinua y **"antes · N m"**. Es lo que ya dibuja `SelectorPin` con `original`: compruébalo y, si falta el texto de los metros, añádelo.
   - **Fuera de la zona habitual:** el aviso de siempre (`avisosFormulario.fueraDeZona`, con el texto de jefatura: "Esto queda fuera de la zona habitual"). Se puede guardar.
3. **Tipo de elemento:** el `Segmentado` del alta, **bloqueado**.
   - El tipo guardado se ve elegido, con un candado, y el otro apagado.
   - Debajo, "El tipo no se cambia: retíralo y da de alta el correcto." (el texto de hoy).
4. **Diámetro de la salida mayor:** el `Segmentado` del alta.
   - Hidrante: 70 · 100.
   - Boca: 45 · 70 · Otra medida, que abre el campo de número como en el alta.
5. **Tipo de enganche** (solo bocas): `SelectorRacor`, con las cuatro opciones (RV-121).
6. **Caudal / estado:** `PildorasCaudal`, con cada estado en su color.
7. **Descripción del fallo · obligatoria:** solo con **No funciona**, como hoy (0024).
8. **Dirección** y **Descripción (opcional)**, campos de texto.
   - Si el pin se ha movido más de 25 m, debajo de Dirección sale en texto suave: **"Has movido el punto N m: revisa la dirección."** La dirección no cambia sola.
9. **Pie fijo:**
   - a la izquierda, **"N cambios · ubicación, enganche"**, o "No has cambiado nada";
   - a la derecha, **Cancelar** (secundario) y **Guardar cambios** (principal);
   - Guardar está deshabilitado sin cambios o si falta algo obligatorio (`faltaEnEdicion`), y entonces dice qué falta, como hoy.

### Los cambios marcados

Igual que en la cola (06 §5, "Panel: detalle de la cola"):

- Cada campo distinto de lo guardado lleva fondo cálido, banda `--naranja-600` de 4 px a la izquierda, "· cambia" en la etiqueta y debajo **"antes: …"** tachado en `--rojo-texto`.
- **La ubicación** cuenta como cambio si se mueve **≥ 0,5 m**.
- Si un campo vuelve a como estaba, deja de estar marcado y deja de contar.
- El recuento y la lista del pie salen de la misma función (`cambiosDe`, ampliada con la ubicación). Tiene su test.

### Guardar

- `editarPunto(id, cambios)`, con `lat` y `lng` **solo si se ha movido**.
- **Bien:** el aviso de hoy ("Guardado BOC-0001") y el panel se cierra. La fila se actualiza (núcleo incluido) al recargar los puntos.
- **Error:** el mensaje de `textoError` y el panel sigue abierto con lo escrito.
- **Sin conexión:** como hoy en el panel.

### Lo que no cambia

- Retirar, Historial y Borrar siguen en sus diálogos.
- La dirección editable en la celda de la tabla se queda.
- Los voluntarios siguen moviendo un punto con "Corregir ubicación", por la cola.

### Tests

- **Vitest de `EditarPunto`:**
  - abre con los valores guardados y "No has cambiado nada";
  - cambiar el enganche a Directo marca el campo, con "antes: Granada", y el pie dice "1 cambio";
  - volver a Granada lo desmarca;
  - el tipo no se puede cambiar;
  - el fallo solo aparece con No funciona;
  - mover el pin marca la ubicación y envía `lat`/`lng`;
  - sin mover, no se envían;
  - más de 25 m saca el aviso de la dirección;
  - cerrar con cambios pregunta.
- **e2e `inventario-editar.spec.ts`:**
  - a 1440 px, el panel lateral con la tabla visible;
  - a 768 px, el velo, y tocar fuera con cambios pregunta;
  - a 412 px, pantalla completa, y `goBack()` cierra el panel;
  - flujo completo: mover el pin y cambiar el estado → Guardar → en el Registro aparece una entrada `edicion_admin` con el desplazamiento.
- **axe** del panel abierto en claro y oscuro, a los tres anchos.
- **Capturas** antes y después a los tres anchos.

---

## 7. RV-126 · Anonimizar sin panel: un script del desarrollador · P1 · Backend

El RGPD obliga a atender el derecho de supresión aunque el botón se vaya (`docs/11`).

- `scripts/anonimizar.ts`, con `npm run anonimizar`. Se conecta como `scripts/migrar.ts`, al entorno que se le diga (`--entorno staging|produccion`, con la misma guarda de producción que ya existe).
- **`--buscar "texto"`:** lista los dispositivos cuyo autor coincide, con `dispositivo_id`, nombre, número de propuestas y última actividad. Usa la vista de actividad que ya existe: **no se borra** aunque se vaya la pestaña.
- **`--dispositivo <uuid> --admin <correo>`:**
  - enseña cuántas filas va a cambiar;
  - pide que se escriba `ANONIMIZAR`;
  - llama a `fn_anonimizar_autor` como ese administrador, para que el registro diga quién lo hizo. Por ejemplo, poniendo `request.jwt.claims` en la transacción; elige la forma segura que encaje con `fn_exigir_admin`;
  - el correo tiene que ser de un administrador activo.
- **Sin `--dispositivo`, no cambia nada.**
- **Privacidad:** el script no escribe nombres en ningún archivo ni en CI. Solo se ejecuta en local.
- **Tests:** vitest del análisis de argumentos, de la guarda de producción y de "sin confirmación no se hace nada". pgTAP de `fn_anonimizar_autor` ya existe: comprueba que sigue en verde.
- **`docs/11`** §"Supresión": el procedimiento nuevo, paso a paso, en lugar de "Voluntarios → Anonimizar…".

---

## 8. Documentación (Ops)

- **`docs/01`:**
  - **FR-20:** "Barcelona, Granada, Directo u otro".
  - **FR-120:** "filtros por tipo y estado"; la edición, en un panel lateral con el mapa del alta, donde jefatura puede mover el punto (DEC-169).
  - **FR-121 y FR-122:** *retirados (DEC-167)*. No se borran: se marcan, como se hizo con otros FR retirados.
  - **FR-125:** sin cambios. **FR-130 y FR-132:** retirados.
  - **FR-131:** "La anonimización la hace el desarrollador con `npm run anonimizar` (11)".
  - **FR-92** ("Algo no funciona"): retirado.
  - **FR-143:** sin "incidencias abiertas".
- **`docs/02`:** los flujos de caducadas (FL-25), de voluntarios y de "Algo no funciona", retirados; el flujo de editar, con el panel lateral.
- **`docs/05`:**
  - `tipo_racor` con `directo`;
  - `fn_editar_punto` con `lat`/`lng`;
  - `incidencias_app` en desuso, pendiente de limpiar.
- **`docs/06`:**
  - §5: "Panel: Editar (panel lateral)" y los desplegables del Inventario;
  - fuera las pestañas y piezas retiradas;
  - Apéndice A: textos nuevos y retirados.
- **`docs/10`:** retirar los AC de caducadas, hoja de campo, voluntarios e incidencias, y añadir los de Directo, filtros y Editar con mover.
- **`docs/11`:** el procedimiento de supresión (RV-126).
- **`docs/12`:** DEC-167 a DEC-170.
- **Mockup:** `docs/mockups-inventario-y-editar.html` pasa a `docs/mockups/29-inventario-y-editar.html` y se borra el original de `docs/`.
- **`INDICE.md`:** fila 29.
- **Registro:** `docs/verificacion/inventario-y-editar.md`.

---

## 9. Checklist

- [ ] 0037 y 0038 en staging; pgTAP en verde.
- [ ] Directo en el alta, la ficha, el inventario, la cola y las exportaciones.
- [ ] Panel con cinco pestañas; las rutas viejas redirigen; "Algo no funciona" fuera de la app.
- [ ] Inventario con Tipo y Estado en desplegables, "Quitar filtros" y Exportar ▾.
- [ ] Editar en panel lateral (ordenador), con velo (tableta) y a pantalla completa (móvil); mapa arriba; cambios marcados; mover el pin queda en el Registro.
- [ ] `npm run anonimizar` probado en staging con un dispositivo de prueba.
- [ ] Documentación, mockup e índice al día.
- [ ] Tests, e2e y axe en verde; CI y staging en verde.

## 10. Lo que hace el desarrollador

1. **La foto de Directo:** ponerla en `public/racores/directo.webp` con `scripts/preparar-racores.ts`. Hasta entonces sale solo el nombre.
2. **En staging:**
   - en el ordenador, editar un punto, moverlo unos metros y cambiar el enganche, y comprobar la entrada del Registro;
   - en el Android, editar desde el panel a pantalla completa y comprobar que "atrás" cierra el panel.
3. **Probar `npm run anonimizar`** en staging con un dispositivo de prueba.
4. **La conformidad de jefatura** sobre los cambios de `docs/01` (FR retirados, Directo, Editar con mover). Basta un sí por escrito.
5. **Las aprobaciones de producción** en la release.
