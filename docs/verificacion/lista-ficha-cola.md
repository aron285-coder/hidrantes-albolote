# Verificación · Lista sin dirección, ficha con banda, cola con mapa, regular en amarillo y «tipo de enganche» (docs/25)

**Estado: hecho el 4 oct 2026 en staging.** Producción, con P-15 (`paridad-produccion.md`).
Especificación: `docs/25-lista-ficha-cola-y-colores.md`. Cuatro sesiones (Frontend-campo con sus
subagentes, Frontend-panel, Backend y Ops), coordinadas en #440. El registro detallado de la pantalla
de la cola es `lista-ficha-cola-panel.md`; el del resto está en cada PR.

## 1. Qué se ha hecho

| Punto | PR | Qué | DEC |
|---|---|---|---|
| RV-105 | #444 | Colores RAL: regular en amarillo (`#F9A900`), con borde propio en el marcador; sin `naranja-estado` | DEC-154 (sustituye a DEC-076) |
| RV-106 | #446 | La lista sin dirección y con la distancia a la derecha; «sin revisar desde hace N» en naranja de aviso | — |
| RV-107 | #448 | «Sin revisar» es un anillo exterior de 8 rayas; el borde del marcador queda continuo | DEC-155 |
| RV-108 | #449 | Ficha con la banda del estado arriba, rejilla de datos y *Cómo llegar* como única acción principal | DEC-156 |
| RV-109 | #447 | «WGS84 · grados decimales» y «ETRS89 · UTM huso 30N» en la ficha, «¿Qué hay aquí?», la cola y Compartir | DEC-157 |
| RV-110 (SQL) | #442 · `0036` | `v_cola_revision` con `punto`, `punto_lat`, `punto_lng`; vista nueva `v_historial_revision` | DEC-160 |
| RV-110 (pantalla) | #450 | Cola con mapa en las seis operaciones, todos los datos con lo que cambia primero, fotos y botones fijos | DEC-158, DEC-159 |
| RV-111 | #441 | Los tres mockups definitivos en `docs/mockups/`, sin nombres de personas | DEC-162 |
| RV-112 | #443 | «Tipo de enganche» (Barcelona, Granada, Otro) en lugar de «racor»; los datos no cambian | DEC-163 |

- **Migración:** 0036, con pgTAP 32 (29 casos, falló en develop antes del cambio: run 37194885058). `npm run compatibilidad` en verde en ci-sql.
- **Requisitos:** `docs/01` v1.8 (FR-20, FR-41, FR-44, FR-60 a FR-62, FR-66, FR-68, FR-72, FR-75, FR-102, FR-103, FR-105), con conformidad del desarrollador del 4-10. `docs/02` v1.6, `docs/06` v1.16 a v1.18, `docs/10` (AC-14, AC-15, AC-104), `docs/12` v1.47 a v1.50.
- **Pruebas:** cada PR de código lleva su test que falla antes del arreglo (skill `paquete-rv`) y la CI completa en verde. Revisados con `pr-review-toolkit` (code-reviewer y silent-failure-hunter); los hallazgos de confianza alta, resueltos en el mismo PR.

## 2. Lo que la especificación no esperaba

- **Tres valores de color distintos de la tabla de RV-105**, para pasar las comprobaciones TR-31 que ya había sobre todas las superficies del mapa (DEC-154):
  - borde del amarillo en el mapa claro `#563E00` (no `#5C4300`, 2,87:1 sobre los rótulos);
  - verde `#237E51` (no `#237F52`, 2,97:1 sobre el agua y los árboles);
  - en el mapa oscuro solo regular lleva el borde `#111826`; los demás siguen con borde blanco (DEC-072).
- **Exportación:** en CSV y XLSX la columna se titula «Tipo de enganche», en palabras como las demás; en GeoJSON la propiedad es `tipo_enganche` (DEC-163).
- **Ficha en el móvil:** sigue siendo una página completa con su barra, como hoy, y no una hoja que sube; la banda no lleva X ni asa ahí. La ficha flotante mide 360 px también en el ordenador (DEC-156).
- **`punto` lleva dos claves más** (`situacion`, `borrado_en`), para que una propuesta sobre un punto retirado o en la papelera no parezca de un punto activo. El cliente decide si es alta por `operacion`, nunca por `punto` nulo (DEC-160).
- **El historial de un alta aprobada no enlaza al punto creado** (`punto` y `codigo` nulos): documentado en 05 y DEC-160.
- **Lista:** en R1 y R2 el marcador se ve algo más pequeño que antes, porque antes se salía del lienzo de 24 px y el anillo necesita sitio (DEC-155).
- **Rojo antiguo escrito a mano** en `SelectorPin.tsx` y `MinimapaPropuesta.tsx`: cambiado por el token.

## 3. Pendiente

1. **Desarrollador:** mirar el amarillo en un móvil a pleno sol antes de P-15 (docs/25 §4.1).
2. **Desarrollador:** conformidad de jefatura sobre `docs/01` v1.8 (color de regular, ficha nueva, cola nueva y «Tipo de enganche»). Basta un sí por escrito.
3. **P-15:** las dos aprobaciones de producción.
4. **Conocido y fuera de alcance:** en el panel oscuro, la tabla de comparación de duplicados y los botones Fusionar/Rechazar tienen poco contraste (ya pasaba antes de docs/25); la escala de radios no tiene tope superior.
