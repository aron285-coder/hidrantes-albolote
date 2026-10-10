# 30 · Registro que se lee y el foco dentro de las ventanas del panel (oct 2026)

| | |
|---|---|
| **Para** | Claude Code, en este repositorio. **Una sola sesión** (Frontend-panel), corta. |
| **Base** | `develop` en `f6ac647` (docs/29 hecho). |
| **Origen** | La revisión de docs/29 (registro `docs/verificacion/inventario-y-editar.md` §3.2, más dos hallazgos de la revisión). |
| **Requisitos** | No cambian los FR. FR-123 ya pide un registro "qué cambió"; esto lo cumple de verdad. |
| **Base de datos** | **Nada.** Ni migración ni cambios en `v_registro`. |
| **Producción** | Con la siguiente release. |

## 0. Reparto

| Sesión | Puntos | DEC | `PW_PUERTO` |
|---|---|---|---|
| **Frontend-panel** | RV-127, RV-128, RV-129, y la documentación | DEC-171 | 4186 |

**Archivos:**

- un archivo nuevo, `src/lib/panel/registro-legible.ts`, y su test;
- `src/componentes/panel/Registro.tsx`, `dialogos.tsx` (Historial), `Dialogo.tsx`, `EditarPunto.tsx` y `descartar.tsx`;
- un archivo nuevo, `src/lib/foco-modal.ts`, y su test;
- el bloque `panelRegistro` de `src/lib/textos.ts`;
- `docs/06` y `docs/12`.

**Herramientas, como siempre:** las skills `paquete-rv` y `revisar-pantallas` (capturas a 412 y 1440 px, en claro y en oscuro), y `pr-review-toolkit` y `code-review` antes de fusionar.

**Registro:** `docs/verificacion/registro-legible.md`.

---

## 1. RV-127 · El Registro dice qué cambió, con palabras · P1

### Qué pasa

`v_registro.resumen` (0002) es "acción · código · **todas las claves de `despues`**".

- En una edición de jefatura, `despues` es el punto entero (`fn_punto_json`), así que la columna Detalle dice algo como `edicion_admin · BOC-0001 · actualizado_en, caudal, codigo, descripcion, …, desplazamiento_m, …`.
- Se ve que algo cambió, pero **no qué** ni de qué a qué.
- La acción y el código salen repetidos: ya tienen su columna.
- El Historial de un punto (Inventario → Historial) ni siquiera enseña ese detalle.

### Solución (DEC-171)

El detalle se calcula **en el cliente**, con `antes` y `despues`, que `v_registro` ya devuelve. La vista y la búsqueda del servidor no cambian.

**`detalleLegible(e: EntradaRegistro): string`**, en `src/lib/panel/registro-legible.ts`. Es una función pura.

1. **Con `antes` y `despues` (los dos objetos):** solo las claves cuyo valor cambia, en este orden y con estos nombres:

   | Clave | Se lee | Valor |
   |---|---|---|
   | `lat`/`lng` | **Movido N m** (no "antes → después") | `despues.desplazamiento_m` si está; si no, la distancia entre las dos posiciones (`metros`). Por debajo de 0,5 m, nada. |
   | `caudal` | Estado | `nombreCaudal` |
   | `racor` | Enganche | `nombreRacor` |
   | `diametro_mm` | Diámetro | `T.formato.mm` |
   | `tipo` | Tipo | `nombreTipo` |
   | `descripcion_fallo` | Fallo | texto |
   | `direccion` | Dirección | texto |
   | `descripcion` | Descripción | texto |
   | `nucleo` | Núcleo | texto |
   | `fecha_ultima_revision` | Última revisión | `fechaCorta` |
   | `foto_path` | Foto | "cambiada" (sin la ruta) |
   | `foto_sitio_path` | Foto del sitio | "cambiada" |
   | `situacion` | Situación | texto |
   | `codigo` | Código | texto |

   - **Formato:** "Estado: No funciona → Regular · Enganche: Granada → Directo · Movido 6,2 m".
   - Un texto se recorta a 60 caracteres con "…".
   - Un valor vacío o nulo se lee "—".
2. **Se ignoran siempre**, porque no le dicen nada a jefatura:
   - `id`, `actualizado_en`, `creado_en`, `municipio` (se ve en Núcleo) y `desplazamiento_m` (ya está en "Movido");
   - cualquier `*_id`, entre ellas `dispositivo_id`, que nunca se enseña;
   - `revision_caducada`, `borrado_en` y `borrado_por`.
3. **Una clave que no está en la tabla** y no se ignora: se enseña con su nombre tal cual. Así no se pierde nada si una versión nueva de la base de datos añade una.
4. **Solo `despues`** (un alta, una restauración): un resumen del punto, "Boca de riego · 45 mm · Bueno · Barrio Seco". Si no es un punto (no tiene `codigo` ni `tipo`), las claves con su valor, con el mismo formato.
5. **Solo `antes`** (un borrado): "—", más el motivo si `despues` o el registro lo traen.
6. **Nada que enseñar** (sin cambios visibles, o sin `antes` ni `despues`): `e.resumen` **sin** el "acción · código" del principio. Si tampoco queda nada, "—".
7. **Nunca** aparece un nombre de voluntario sacado de `antes`/`despues` en una acción que no sea de un punto. Las claves `autor_nombre`, `autor_apellido` y `actor` se ignoran (el actor ya tiene su columna).

**Dónde se usa:**

- **Registro:** la columna Detalle, en la tabla y en las filas apiladas del móvil.
- **Historial del punto** (`DialogoHistorial`): una segunda línea por entrada, en texto suave, con el mismo detalle.

**Búsqueda:** sigue siendo la del servidor (`resumen.ilike`), que busca por nombre de campo. No se busca por los valores que se ven. Anótalo en `docs/06` como límite conocido.

### Tests (`registro-legible.test.ts`)

- **Edición de jefatura con el punto entero en `antes` y `despues`:**
  - solo salen Estado y Enganche, con nombres y valores en palabras, sin `actualizado_en` ni `codigo`;
  - con `desplazamiento_m: 6.2`, sale "Movido 6,2 m" y no "lat"/"lng";
  - sin `desplazamiento_m` pero con lat/lng distintos, se calcula;
  - con menos de 0,5 m, no sale.
- **Racor desconocido:** se lee "Otro".
- **Textos:** uno largo se recorta; vacío o nulo se lee "—".
- **Alta (solo `despues`):** el resumen del punto.
- **`config_cambiada`:** la clave con su valor.
- **Privacidad:** `dispositivo_id`, `autor_nombre` y `actor` nunca aparecen.
- **Sin nada:** `resumen` sin el prefijo.
- **Vitest de `Registro` y de `DialogoHistorial`:** el detalle legible en la tabla, en las filas apiladas y en el Historial.
- **e2e:** el de `inventario-editar.spec.ts` que ya mira el Registro tras mover un punto pasa a comprobar "Movido" y el estado nuevo con palabras.

---

## 2. RV-128 · El foco no se escapa de las ventanas del panel · P2

### Qué pasa

`Dialogo` (Retirar, Borrar, Historial…), `ConfirmarDescartar` y `EditarPunto` en las formas `velo` y `completa` son `aria-modal`. Pero con **Tab** el foco sale de la ventana y va a la tabla de detrás, que no se ve o está tapada.

- El lector de pantalla puede leer lo de detrás.
- En el móvil, con Editar a pantalla completa, el foco se pierde detrás.
- Ya pasaba antes de docs/29 con `Dialogo`. No es nuevo, pero ahora hay más ventanas.

### Solución

`src/lib/foco-modal.ts`, con un hook **`useModal(ref, activo = true)`**:

- **Al montarse:** pone el atributo **`inert`** en todos los hijos de `document.body` menos el suyo. Así entran `#raiz` y los portales de detrás (por ejemplo Editar cuando sale Retirar encima).
- **Al desmontarse:** se lo quita.
- **Pila:** si hay varias ventanas, solo la de arriba queda viva. Al cerrar la de arriba, vuelve a estar viva la anterior y **solo** esa.
- **No toca** elementos que ya tenían `inert` antes de abrir: no les quita un `inert` que no puso.
- **El foco:** el foco inicial y la vuelta del foco siguen como están en cada componente.

**Dónde:**

- **`Dialogo` y `ConfirmarDescartar`:** siempre.
- **`EditarPunto`:** solo con `forma !== 'lateral'`. En el ordenador, al lado de la tabla, Editar **no** es modal (`aria-modal=false`) y la tabla tiene que seguir viva, que es lo que pidió DEC-169.
- **Al cambiar de forma** (girar la tableta o cambiar el tamaño de la ventana) se activa o se desactiva sin cerrar.

### Tests

- **Vitest de `foco-modal`:**
  - con una ventana, `#raiz` queda `inert` y la ventana no;
  - con dos apiladas, la de abajo queda `inert`;
  - al cerrar la de arriba, la de abajo vuelve y `#raiz` sigue `inert`;
  - al cerrar todas no queda ningún `inert`;
  - un elemento que ya era `inert` lo sigue siendo.
- **e2e:**
  - a 768 px, con Editar abierto, Tab desde el último control vuelve al primero del panel y nunca llega a la tabla;
  - a 1440 px, con Editar al lado, Tab **sí** llega a la tabla;
  - con Retirar abierto encima de Editar (768 px), Tab no sale de Retirar, y al cerrarlo Editar vuelve a responder.
- **axe** de las tres situaciones.

---

## 3. RV-129 · Las dos advertencias de lint de `descartar.tsx` · P3

- `react-refresh/only-export-components` en `descartar.tsx` (líneas 73 y 79): exporta `MARCA`, `marcaActual` y `quitarEntradaDeEditar` junto al componente.
- Se pasan a un archivo nuevo, `src/lib/panel/historial-editar.ts`. Se ajustan las importaciones de `Inventario.tsx` y `EditarPunto.tsx`.
- Es solo mover código: no cambia el comportamiento.
- `npm run lint` sin advertencias.

---

## 4. Documentación

- **`docs/06`:**
  - §5, en "Panel: registro": el detalle legible, con la tabla de nombres de RV-127 y el límite de la búsqueda;
  - §5, en "Diálogos": las ventanas modales dejan el resto `inert`, y Editar al lado de la tabla no es modal;
  - Apéndice A: textos nuevos ("Movido N m", los nombres de campo, "cambiada").
- **`docs/12`:** DEC-171 (el detalle del registro se calcula en el cliente a partir de `antes`/`despues`; la vista no cambia).
- **`docs/verificacion/inventario-y-editar.md` §3.2:** "hecho en docs/30".
- **`INDICE.md`:** fila 30.

## 5. Checklist

- [ ] Registro e Historial dicen "Estado: No funciona → Regular · Enganche: Granada → Directo · Movido 6,2 m" en una edición, sin claves técnicas.
- [ ] Ningún `dispositivo_id` ni nombre sacado de `antes`/`despues` en el detalle.
- [ ] Tab no sale de ninguna ventana modal del panel; con Editar al lado de la tabla (≥ 1100 px), sí.
- [ ] `npm run lint` sin advertencias.
- [ ] Tests, e2e y axe en verde; CI y staging en verde.

## 6. Lo que hace el desarrollador

1. **En staging:** editar un punto (moverlo y cambiar el estado) y mirar la línea en Registro y en el Historial del punto.
2. **Con el teclado:** abrir Editar en una ventana estrecha y pasar con Tab; el foco no tiene que salir del panel.
