# 28 · Cola sin señales y lo pendiente de 25, 26 y 27 (oct 2026)

| | |
|---|---|
| **Para** | Claude Code, en este repositorio. **Dos sesiones** (Panel y Ops) y un subagente de Panel. |
| **Base** | `develop` en `0095e9a` (docs/25, 26 y 27 hechos, en staging). |
| **Origen** | Dos capturas del desarrollador en un Android (detalle de la cola, un **alta** y una **revisión**), con lo que sobra tachado a mano. Además, lo que quedó abierto en los registros de 25, 26 y 27. |
| **Requisitos** | Cambia FR-104 en `docs/01` (congelado). Versión nueva de 01 con "conformidad del desarrollador, oct 2026". |
| **Producción** | Va en la release que esté abierta (#445, 0.9.0) si se fusiona antes de aprobarla; si no, en la siguiente. |

## 0. Reparto

| Sesión | Puntos | DEC | `PW_PUERTO` |
|---|---|---|---|
| **Panel** | RV-115, después RV-117 (los dos tocan `DetallePropuesta.tsx`: en serie) | DEC-166 | 4175 |
| **Panel · subagente** (worktree) | RV-116 | — | 4176 |
| **Ops** | RV-118, RV-119, documentación, mockup, índice | — | 4177 |

**Archivos y dueños:**

| Archivo | Dueño |
|---|---|
| `src/componentes/panel/DetallePropuesta.tsx`, `src/lib/panel/cola.ts`, `src/componentes/panel/ColaRevision.tsx` y sus tests | Panel |
| `src/index.css` (tokens nuevos de RV-117), `src/lib/accesibilidad.test.ts` | Panel |
| `src/componentes/panel/Voluntarios.tsx` (y, si hace falta, `Registro.tsx`, `Papelera.tsx`) y sus tests | subagente |
| `src/lib/textos.ts` | Panel: bloque `panelCola`; subagente: `panelVoluntarios`. Rebasar justo antes de fusionar. |
| `e2e/anchos.spec.ts`, `src/lib/simbologia.ts` y su test | Ops |
| `docs/01`, `02`, `05`, `06`, `10`, `12`, `INDICE.md`, `docs/mockups/25-cola.html`, registros | Ops |

**Herramientas, como siempre:** skills `paquete-rv` y `revisar-pantallas` (capturas a 412 × 915, 768 × 1024 y 1440 × 900, antes y después, en claro y en oscuro), y `pr-review-toolkit` y `code-review` antes de fusionar.

**Registro:** `docs/verificacion/cola-sin-senales.md` (una sección por sesión).

---

## 1. RV-115 · Detalle de la cola: fuera las señales y la línea del alta · P1

### Qué se quita (lo tachado en las capturas)

| Hoy | Dónde | Qué pasa |
|---|---|---|
| La fila de chips bajo "Propuesto por…": `⚠ Pin puesto a mano · a N del GPS del móvil`, `⚠ La foto se hizo a N del pin`, `✓ Con foto`, `⚠ sin foto del sitio`, `✓ Revisión anterior: hace 1 mes`, y las demás de `senales()` | `DetallePropuesta.tsx`, el `<ul aria-label="Señales de fiabilidad">` | **Fuera, en las seis operaciones.** |
| En un alta, "**3 datos del voluntario** · los demás los deduce el sistema" bajo "Datos del punto" | `DatosDelPunto`, el `<small>` | **Fuera.** En un alta queda solo el título "Datos del punto". |

**Se queda igual** (no está tachado):

- en una revisión, corrección o ubicación, "**1 cambio** · el resto se queda igual";
- las filas que cambian, con fondo cálido, banda y "CAMBIA" (también en un alta);
- "Propuesto por … · hace N (fecha) · núcleo", el mapa con su leyenda, las fotos y los botones.

### Dónde sigue estando lo que decían los chips (DEC-166)

Nada que haga falta para decidir se pierde: ya está en otro sitio del detalle.

| Chip | Dónde se ve ahora |
|---|---|
| Origen GPS o pin a mano, y su precisión | Fila "Origen de la ubicación" de "Datos del punto" (`origenGps` / `origenManual`). |
| Revisión anterior | Fila "Última revisión". |
| Con foto / sin foto del sitio | Sección "Fotos". |
| Fuera de zona | "Propuesto por … · Fuera de zona" en la cabecera. |
| Posible duplicado | El bloque de comparación, "Fusionar con …" y el círculo del mapa. |
| Diámetro "otra medida" | El texto encima de los botones (`fijaDiametro`) y la fila "Diámetro". |
| Desactualizada | El aviso rojo encima de los botones y "Confirmar y aprobar". |

**Lo que deja de verse:** la distancia del pin a mano al GPS del móvil y la distancia de la foto al pin. Es decisión del desarrollador. Los datos siguen en `v_cola_revision` (no hay migración) por si un día vuelven.

### El ⚠ de la lista de la cola

Hoy `tieneAviso()` usa `senales()`. Si no se toca, la lista pone ⚠ por cosas que el detalle ya no enseña (pin a mano, foto lejos, GPS impreciso, sin foto del sitio), y jefatura busca un aviso que no está.

**Cambio:** el ⚠ solo sale por lo que el detalle sí enseña como aviso:

```ts
export const tieneAviso = (p: PropuestaPanel) =>
  p.desactualizada || bloqueoPorMedida(p) !== null || !!p.duplicado_de || !!p.fuera_de_zona;
```

### Código que sobra

- `senales()`, `Senal`, `GPS_IMPRECISO_M` y `FOTO_LEJOS_M` de `src/lib/panel/cola.ts`, y la variable `lasSenales` de `DetallePropuesta.tsx`.
- En `textos.ts`, bloque `panelCola`, **se borran si nada más las usa** (compruébalo con `grep`): `senales`, `senalGps`, `senalManual`, `senalManualLejos`, `senalGpsImpreciso`, `senalFotoLejos`, `senalRevisionAnterior`, `esteMes`, `senalDuplicado`, `senalOtraMedida`, `senalOtraMedidaBoca`, `senalSinFotoSitio`, `senalDesactualizada`, `conFoto`, `datosVoluntario` y `restoDeducido`. `senalAviso` ("con avisos") **se queda**: es el `aria-label` del ⚠ de la lista.
- El Apéndice A de `docs/06`, a la par.
- `DatosDelPunto` deja de necesitar la prop `alta` si solo la usaba el subtítulo.

### Tests

- **Vitest de `DetallePropuesta`** (`detalle-propuesta.test.tsx`), en alta, revisión y ubicación:
  - no hay ninguna lista con nombre "Señales de fiabilidad";
  - no aparece "Con foto", "La foto se hizo", "Pin puesto a mano ·", "Revisión anterior" ni "sin foto del sitio";
  - en un alta, el título es "Datos del punto" y **no** sale "datos del voluntario" ni "deduce el sistema";
  - en una revisión sigue saliendo "1 cambio · el resto se queda igual";
  - la fila "Origen de la ubicación" sigue con "GPS · ±N m" o "Pin puesto a mano".
- **`cola.test.ts`**: `tieneAviso` es verdadero con desactualizada, otra medida de hidrante, duplicado o fuera de zona, y **falso** con solo pin a mano, foto lejos, GPS impreciso o sin foto del sitio.
- **`cola-ficha.test.ts`** y **`foto-sitio.test.ts`**: quitar o cambiar lo que comprobaba las señales.
- **axe** del detalle en claro y oscuro; **capturas** de un alta y una revisión a 412 y 1440 px.

---

## 2. RV-116 · Voluntarios en el móvil (#454) · P2 · subagente

**Qué pasa** (registro de docs/26): a 412 px, en la pestaña Voluntarios, la tabla se desplaza dentro de su caja: "Última" sale cortada y "Acciones" / "Anonimizar…" quedan fuera, a la derecha.

**Solución:** por debajo de `md`, las dos tablas de `Voluntarios.tsx` pasan a **filas apiladas, como Inventario**: una tarjeta por voluntario con el nombre arriba, los datos debajo en líneas de etiqueta y valor, y "Anonimizar…" a todo el ancho al final, como botón secundario destructivo (44 px). En `md` y más, la tabla de hoy, sin cambios.

**Además:** abrir **Registro** y **Papelera con filas** (datos simulados) a 412 px, que en docs/26 solo se vieron vacías. Si alguna tiene el mismo problema, se arregla igual en este punto. Si no, se anota en el registro.

**Tests:**

- e2e a 412 × 915 (proyecto `movil`): en Voluntarios, Registro y Papelera con filas, `scrollWidth <= clientWidth` en la página y en cada contenedor de tabla, y "Anonimizar…" visible y tocable sin desplazar a lo ancho;
- axe de las tres pestañas en el móvil;
- capturas antes y después.

Cierra #454 en el PR.

---

## 3. RV-117 · Contraste en el panel oscuro · P2 · Panel, después de RV-115

**Qué pasa** (registro de docs/25): en oscuro, la tabla de comparación de duplicados y los botones **Fusionar con …** (`text-ambar-700`) y **Rechazar…** (`text-rojo-700`) se leen mal: `--ambar-700` y `--rojo-700` no cambian en oscuro y quedan oscuros sobre fondo oscuro.

**Solución**, como ya se hizo con `--naranja-texto`:

- Tokens nuevos **`--ambar-texto`** y **`--rojo-texto`** en `src/index.css`: en claro, iguales a `--ambar-700` y `--rojo-700`; en oscuro, un tono claro que llegue a **≥ 4,5:1** sobre `--papel` y `--fondo` (los dos bloques de oscuro: `prefers-color-scheme` y `[data-theme="dark"]`).
- Fusionar y Rechazar usan los tokens nuevos en texto y borde. El borde de Fusionar sigue en `--oro-600` si llega a 3:1; si no, `--ambar-texto`.
- La tabla de comparación: cabeceras y valores con `--texto` / `--texto-suave`, y lo que difiere marcado con `--ambar-texto`, no con `--ambar-700`.
- Buscar con `grep` otros `text-ambar-700` y `text-rojo-700` del panel que se vean sobre fondo oscuro, y cambiarlos igual. Los chips de aviso con fondo `--ambar-100` no cambian.

**Tests:** en `accesibilidad.test.ts`, los dos tokens nuevos con ≥ 4,5:1 sobre `--papel` y `--fondo`, en claro y en oscuro. axe del detalle con duplicado, en oscuro. Capturas en oscuro antes y después.

---

## 4. RV-118 · Test inestable `anchos.spec.ts:273` · P2 · Ops

**Qué pasa** (registro de docs/26): "360 px: la rejilla de estados…", proyecto `escritorio`, falla 2 de cada 3 veces también en `develop`.

**Solución:** encontrar la causa (lo normal: medir antes de que termine de cargar una fuente o una transición; o el proyecto `escritorio` redimensionado a 360 px). Arreglarla esperando a lo que haga falta (`document.fonts.ready`, un `expect.poll`, o pasar el caso al proyecto `movil`), **sin** subir los reintentos ni marcarlo `fixme`. Comprobar con `--repeat-each=20` en local y anotarlo en el registro.

---

## 5. RV-119 · Tope de tamaño de los marcadores · P3 · Ops

**Qué pasa** (registro de docs/25): la escala de radios de los marcadores (`simbologia.ts`, R1 a R5 y el anillo de sin revisar) no tiene tope superior.

**Qué se hace:**

1. Comprobar en qué caso crece sin límite (zoom alto, `tamano` grande, el anillo y la selección sumados).
2. Si pasa en la app, poner un tope (el lienzo del R5 seleccionado y sin revisar de hoy), con un test en `simbologia.test.ts`.
3. Si no puede pasar con los valores reales, anotarlo en el registro con la razón y cerrar el punto sin tocar código.

---

## 6. Documentación (Ops)

- **`docs/01` FR-104** pasa a decir: "El detalle de cada propuesta enseña el origen de la ubicación y su precisión, la última revisión, las fotos, el núcleo o *fuera de zona*, el posible duplicado, el diámetro *otra medida* pendiente y si el punto cambió después de la propuesta. La lista de la cola marca con ⚠ las propuestas desactualizadas, con duplicado, fuera de zona o con un diámetro por fijar."
- **`docs/02`** (flujo de jefatura, paso 2): "señales de fiabilidad (FR-104)" → "los datos del punto, con su origen (FR-104)".
- **`docs/05`** `v_cola_revision`: sin cambios en la vista; añadir que `distancia_gps_m`, `distancia_exif_m` y `sin_foto_sitio` ya no se enseñan (DEC-166).
- **`docs/06`**:
  - §5 "Panel: detalle de la cola": quitar "y las señales debajo" y el texto del alta.
  - Quitar la fila "Panel: señales".
  - Añadir los tokens `--ambar-texto` y `--rojo-texto`.
  - Actualizar el Apéndice A.
- **`docs/10`** AC-70: "Antes tachado, después en verde; origen de la ubicación en Datos del punto; sin chips de señales".
- **`docs/12`**: DEC-166 (las señales salen del detalle; el ⚠ de la lista solo por lo que el detalle enseña).
- **`docs/mockups/25-cola.html`**: quitar los chips de señales y la línea "N datos del voluntario · …" de las tres vistas.
- **Registros:**
  - `docs/verificacion/acceso-panel-movil.md`: la prueba en el Android hecha por el desarrollador ("Jefatura" abre el panel).
  - `INDICE.md`: la fila 28; 26 sin "falta la prueba en el Android".

---

## 7. Checklist

- [ ] Detalle de la cola, en las seis operaciones: sin chips de señales.
- [ ] En un alta: sin "N datos del voluntario · los demás los deduce el sistema".
- [ ] Origen, última revisión, fotos, duplicado, otra medida y desactualizada se siguen viendo donde dice la tabla de RV-115.
- [ ] El ⚠ de la lista solo por desactualizada, duplicado, fuera de zona o diámetro por fijar.
- [ ] Voluntarios (y Registro y Papelera con filas) se usan a 412 px sin desplazar a lo ancho; #454 cerrada.
- [ ] Fusionar, Rechazar y la comparación de duplicados con ≥ 4,5:1 en oscuro.
- [ ] `anchos.spec.ts:273` estable (20 de 20).
- [ ] Tope de los marcadores puesto, o descartado con la razón en el registro.
- [ ] `docs/01` FR-104, `02`, `05`, `06`, `10`, `12`, mockup e índice al día.
- [ ] Tests, e2e y axe en verde; CI y staging en verde.

## 8. Lo que hace el desarrollador

1. En staging, en el Android: abrir un alta y una revisión de la cola y comprobar que se ve como en las capturas, sin lo tachado.
2. Probar Cercanos (docs/27): se lee de un vistazo y "Cómo llegar" abre Google Maps.
3. Mirar el amarillo de "regular" en el móvil a pleno sol (docs/25 §4.1).
4. La conformidad de jefatura, por escrito, sobre `docs/01` v1.8 a v1.10 y la versión nueva de FR-104.
5. P-15: las dos aprobaciones de producción (release #445 y el PR `develop` → `main`).
6. Las fotos propias de los racores (Barcelona y Granada), pendientes desde docs/24, cuando las tenga.
