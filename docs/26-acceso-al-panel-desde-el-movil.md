# 26 · Jefatura llega al panel desde la app del móvil (5 oct 2026)

| | |
|---|---|
| **Para** | Claude Code, en este repositorio. **Una sola sesión** (Frontend), corta. Se puede hacer a la vez que `docs/25`. |
| **Base** | `develop` actual. Producción según `docs/25` P-15. |
| **Origen** | El desarrollador, con sesión de jefatura (Google) en la app instalada en Android, no encuentra cómo ir a las páginas de jefatura. |
| **Requisitos** | Precisa FR-150 en `docs/01`: "desde la app, jefatura abre el panel con un toque". Versión nueva de 01 con "conformidad del desarrollador, 5 oct 2026". |

## 0. Reparto y convivencia con docs/25

| Sesión | Puntos | DEC | `PW_PUERTO` |
|---|---|---|---|
| **Frontend-acceso** (una sesión nueva o un subagente de Frontend-campo de docs/25) | RV-113 | DEC-164 | 4181 |

- **Archivos de este documento:** `src/paginas/Ajustes.tsx` (Ajustes del voluntario), `src/componentes/BarraSuperior.tsx`, sus tests y un e2e nuevo.
  - Ninguno es de una sesión de `docs/25` (tabla de dueños, `docs/25` §0.5).
  - `src/lib/textos.ts`: solo el bloque `jefatura` y el de `ajustes`. Rebasar justo antes de fusionar.
  - `docs/06`, Apéndice A, y `docs/01`: se los pasa a Ops de `docs/25` por la issue de coordinación, igual que en `docs/25`.
- **Herramientas, como siempre:** skills `paquete-rv` y `revisar-pantallas` (capturas a 412 × 915 antes y después), y `pr-review-toolkit` y `code-review` antes de fusionar.
- **Registro:** `docs/verificacion/acceso-panel-movil.md`.
- **Producción:** va con la siguiente release (`docs/25` P-15, o la que toque). No necesita una release propia.

---

## 1. RV-113 · Desde el móvil no hay forma de llegar al panel de jefatura · P1

### Qué pasa

En el código, hoy:

- **`entrarConGoogle()`** (`src/lib/acceso.ts`) vuelve a `/admin` solo con pantallas de **900 px o más**. En el móvil vuelve a `/`, al mapa, y es a propósito: FR-150.
- **En la app del móvil, ser jefatura solo se nota en dos cosas:**
  - la etiqueta **"Jefatura"** de `BarraSuperior.tsx`, que es un `<span>` y **no se puede tocar**;
  - "Aplicar ahora" en los formularios (FR-151).
- **Ajustes** (`src/paginas/Ajustes.tsx`) enseña "Cuenta de jefatura" con "Cerrar sesión", pero **no** lleva al panel.
- **No hay ningún enlace a `/admin`** en la parte del voluntario. La única forma es teclear la dirección en Chrome. En la app instalada, que no tiene barra de direcciones, no se puede.

La ruta `/admin/*` ya existe dentro de la misma app (`RutasDentro.tsx`), y el panel ya tiene "Ir al mapa" para volver. Solo falta el camino de ida.

### Solución (DEC-164)

**Dos accesos, los dos solo para `acceso.tipo === 'jefatura'`.** El voluntario no ve nada nuevo.

1. **Ajustes → botón "Panel de jefatura".**
   - En la fila "Cuenta de jefatura" que ya existe, debajo del correo, un botón secundario a todo el ancho:
     - **"Panel de jefatura"**, con un icono de panel (de lucide, `LayoutDashboard`);
     - borde y texto `--marino-950`, 44 px de alto como mínimo;
     - lleva a `/admin`, con `navigate`, dentro de la app: no recarga la página ni abre otra pestaña.
   - Es **un botón secundario**, no principal. En Ajustes no hay botón principal (regla de un principal por pantalla, DEC-147).
   - "Cerrar sesión de Google" se queda como está, al lado del correo.
2. **La etiqueta "Jefatura" de la barra superior se puede tocar.**
   - Pasa de `<span>` a `<Link to="/admin">`, con el mismo aspecto: fondo `--oro-600`, texto blanco y negrita.
   - Objetivo táctil de **44 × 44 px** (UI-15): el área que se toca crece con relleno, el dibujo no cambia de tamaño.
   - `aria-label`: **"Abrir el panel de jefatura"**.
   - Un pequeño chevron (`›`) a la derecha del texto, para que se note que se puede tocar. Si no cabe a 360 px con un título largo, el título se acorta con "…" antes que la etiqueta.
3. **Volver:** el panel ya tiene "Ir al mapa" (`PanelJefatura.tsx`). No cambia.
   - Comprueba que el botón "atrás" de Android, desde `/admin`, vuelve a la pantalla de antes (mapa o Ajustes) y no saca de la app.
4. **Sin conexión con el servidor:** los dos accesos siguen funcionando. Navegan al panel, y el panel ya enseña su propio aviso de servidor (`AvisoServidor`). No se deshabilitan: la cola guardada puede seguir siendo útil.
5. **Lo que NO se cambia:**
   - Al entrar con Google en el móvil, se sigue volviendo al **mapa**, no al panel. En la calle, lo primero es el mapa (FR-150).
   - El panel en pantallas pequeñas: lo que haga falta lo trae `docs/25` RV-110 (la cola en el móvil).
   - **Comprobación sí:** abre cada pestaña del panel a 412 px y haz una captura. Si alguna pestaña no se puede usar en el móvil (algo cortado, desplazamiento a lo ancho), **no lo arregles aquí**: anótalo en el registro y abre una issue con la captura. Irá en el siguiente documento.

### Textos (`src/lib/textos.ts`, Apéndice A de `docs/06`)

| Clave | Texto |
|---|---|
| `ajustes.irAlPanel` (nueva) | "Panel de jefatura" |
| `jefatura.abrirPanel` (nueva) | "Abrir el panel de jefatura" (el `aria-label` de la etiqueta) |
| `navegacion.jefatura` | "Jefatura" (sin cambios) |

### Documentación

- `docs/01` FR-150, añadir: "Desde la app, jefatura abre el panel con un toque: la etiqueta 'Jefatura' de la barra o 'Panel de jefatura' en Ajustes." Se lo pasa a Ops.
- `docs/02`, en el flujo de jefatura (§ "Actor: administrador"), añadir este camino desde el móvil.
- `docs/06` §5, en "Barra superior": la etiqueta Jefatura es un enlace, con un objetivo táctil de 44 px.

### Tests

- **Vitest de `BarraSuperior`:**
  - con `jefatura`, la etiqueta es un enlace a `/admin`, con `aria-label` "Abrir el panel de jefatura";
  - sin `jefatura`, no hay enlace;
  - el área del enlace mide como mínimo 44 × 44 px (`getBoundingClientRect` en el test de componente, o comprobando las clases de tamaño).
- **Vitest de `Ajustes`:**
  - con acceso de jefatura, se ve el botón "Panel de jefatura" y lleva a `/admin`;
  - con acceso de voluntario, no se ve.
- **e2e nuevo `e2e/jefatura-movil.spec.ts`** (412 × 915, sesión de jefatura simulada como en `panel-ajustes.spec.ts`):
  1. En el mapa, tocar "Jefatura" en la barra abre el panel (`/admin/cola`, con la pestaña "Cola de revisión" visible).
  2. "Ir al mapa" vuelve a `/`.
  3. Ajustes → "Panel de jefatura" abre el panel.
  4. `page.goBack()` desde el panel vuelve a Ajustes, no fuera de la app.
  5. Con sesión de voluntario, ni la etiqueta ni el botón están.
- **Accesibilidad (axe)** de la barra y de Ajustes, con sesión de jefatura.
- **Capturas** a 412 × 915 de la barra con la etiqueta, de Ajustes con el botón y de cada pestaña del panel (para la comprobación del punto 5).

---

## 2. Checklist

- [ ] En la app instalada en Android, con sesión de jefatura: tocar "Jefatura" en la barra abre el panel.
- [ ] Ajustes → "Panel de jefatura" abre el panel.
- [ ] "Ir al mapa" y el botón "atrás" vuelven a la app.
- [ ] Un voluntario no ve ni la etiqueta como enlace ni el botón.
- [ ] Tests de componente, e2e y axe en verde.
- [ ] Capturas de las pestañas del panel a 412 px en el registro; issue abierta si alguna no se puede usar.
- [ ] `docs/01` FR-150, `docs/02` y `docs/06` al día (vía Ops).

## 3. Lo que hace el desarrollador

1. Cuando esté en staging: en el Android, con la app instalada y la sesión de Google, tocar "Jefatura" y comprobar que abre el panel. Anotarlo en el registro.
2. Las dos aprobaciones de producción, en la release en la que vaya.
