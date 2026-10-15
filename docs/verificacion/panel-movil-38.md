# Verificación · `docs/38` (el panel en el móvil)

Registro de lo que ha entrado de `docs/38`, PR a PR: qué entró, el test que falló antes y el número del PR.
`docs/38` es la tercera excepción a la congelación (DEC-212): solo interfaz, sin migraciones, RPC, Functions ni
workflows. Una sola sesión, en el orden de §0.2.

| Punto | Issue |
|---|---|
| RV-500 · puesta en marcha | #780 |
| RV-501 · los documentos primero | #781 |
| RV-502 · piezas comunes | #782 |
| RV-503 · navegación del móvil | #783 |
| RV-504 · el botón de filtros y su hoja | #784 |
| RV-505 · Cola de revisión | #785 |
| RV-506 · Inventario | #786 |
| RV-507 · Registro (cierra #758) | #787 |
| RV-508 · Papelera | #788 |
| RV-509 · Ajustes (cierra #753) | #789 |
| RV-510 · anchos, toques de 44 px (cierra #754) y vistas | #790 |
| RV-511 · manual 13, capturas, 10 e índice | #791 |
| RV-512 · cierre | #792 |

## Registro

- **RV-500:** la especificación y los cinco mockups `docs/mockups/38-panel-*.html` en Git (solo datos de los e2e);
  los dos borradores superados, borrados. DEC-212 a DEC-215 en 12, con sus filas en el índice y `docs/39` como la de
  después del piloto en DEC-193, DEC-196, DEC-205 y DEC-209; DEC-168, DEC-171 y DEC-192 matizadas. CLAUDE.md §2,
  §5 y §8; las skills `paquete-rv` y `revisar-pantallas`; 09 §8. Solo documentación.
- **RV-501:** 01 1.16, 02 1.13, 06 1.34 y 10 1.8, aprobadas al pedir el cambio: FR-100, FR-120, FL-21, FL-23 y
  FL-24; en 06, los tintes gris y azul, las filas del panel de §5 (y tres nuevas), UI-11, UI-12, UI-15, UI-17,
  UI-18 y UI-19 y los literales nuevos del Apéndice A (solo se añaden); la nota de 08; AC-90 y AC-169. Solo
  documentación (#794).
- **RV-502:** `--tinte-gris` y `--tinte-azul` (claro y oscuro, ≥ 4,5:1) y las operaciones Revisión, Datos y
  Ubicación con ellos; `PANEL_TABLETA`, `PANEL_PC` y `PANEL_GRANDE`, y la tabla del Inventario desde 1.100 px;
  `cuando` y `Fecha` (UI-12); `EtiquetaEstado`, `EtiquetaAcceso`, `EtiquetaPedido` y `EtiquetaPequena`;
  `MenuBoton` (portal, arriba si no cabe, motivos dentro del menú) y `BotonMas`, con `MenuExportar` encima sin
  cambiar lo que hace (sus e2e, sin tocar, en verde); `irAPestana`, `buscarEnPanel`, `abrirFiltros` y
  `elegirFiltro` en `e2e/ayudas.ts`. Tests que fallaban antes: `tintes.test.ts` (11), `formato.test.ts` y
  `piezas.test.tsx`.
  - Al pasar la tabla a 1.100 px, la tabla y Editar con velo cambian en el mismo corte: la fila con el foco
    desaparece y el foco queda en `<body>`. `useModal` lo mete ahora también en Editar en ese caso (el e2e de
    `inventario-editar.spec.ts` que estrecha a 1.050 px lo comprueba).
