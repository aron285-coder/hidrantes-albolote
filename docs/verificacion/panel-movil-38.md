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
- **RV-503:** por debajo de 768 px, sin fila de pestañas: la cabecera dice la pestaña (`h1`, con «Panel de jefatura
  ·» solo para el lector), la lupa abre la búsqueda en la cabecera (✕ la borra y la cierra; con algo escrito se
  queda abierta) y ☰ lleva el correo, las cinco pestañas con su icono y su número, «Ir al mapa» y «Cerrar sesión»;
  desde otra pestaña, con pendientes, el punto naranja y «Menú, hay propuestas pendientes». Desde 768, las cinco en
  una fila sin desplazamiento. Test nuevo `panel-navegacion.spec.ts` (fallaba antes: no había ☰ con pestañas ni
  lupa); adaptados `panel-pestanas`, `jefatura-movil`, `acceso`, `panel-poca-pantalla` (la cabecera compacta con el
  buscador, a 780 px: a 720 ya es la del móvil), `panel-cola` y `panel-inventario` (con `buscarEnPanel`).
- **RV-504:** `Filtros` (`src/componentes/panel/Filtros.tsx`): el botón con `SlidersHorizontal`, el resumen (parte en dos
  líneas, nunca «…») y ▾, «Filtros: …» como nombre y la marca de activo; por debajo de 768 px, dentro de la `Hoja`
  de siempre (sin cambiarla) con su cabecera y ✕; desde 768, una ventana no modal de 400 px alineada con el borde del
  botón que quede dentro de la pantalla (Esc, fuera y Tab la cierran); cruzar 768 px la cierra; grupos como
  `radiogroup` con chips de 44 px (o filas con círculo, `forma: 'lista'`), se aplica al tocar; pie con «Quitar
  filtros» (solo activo) y «Listo». Test que fallaba antes: `filtros.test.tsx` (el archivo no existía). Sus e2e van
  con la Cola, que la estrena (RV-505).
- **RV-505:** la Cola con el botón de filtros («Filtrar la cola»: Estado, Operación con sus etiquetas y Núcleo; «Pendientes
  · Alta · Albolote»; marcado si algo no es lo de por defecto); fuera los cuatro botones de estado, los tres
  desplegables y «Filtrar:». Cada fila en tres líneas (operación, código o «nuevo», ⚠ y cuándo; dirección o «sin
  dirección» · núcleo; autor), sin «…», con la casilla en una etiqueta de 44 × 44; en el historial, un alta aprobada
  enseña el código del punto que creó (`codigoCola`). Lote solo con algo marcado: abajo por debajo de 1.100 px («N
  seleccionadas» encima en el móvil; en la tableta, solo los botones) y arriba desde 1.100; fuera «Toca una para
  revisarla». La lista, 360 px (380 desde 1.600). Tests que fallaban antes: `cola.test.ts` (`lineasCola`,
  `codigoCola`) y los e2e nuevos de `panel-cola.spec.ts` (hoja modal a 412 con Quitar filtros y el foco en «Listo»,
  ventana a 1280 y Tab fuera, cruce de 768 px, lote a 412, 820 y 1280, sin «…», el código del alta aprobada).
  - A 720 × 450 las filas de tres líneas dejaban 3 propuestas; se bajó el alto de la fila (sin relleno arriba y
    abajo, interlineado ajustado) y vuelven a verse 4, como pide 06 §5.
- **RV-506:** el Inventario con el botón de filtros («Filtrar y ordenar» por debajo de 1.100 px: Tipo, Estado con sus
  etiquetas y su número —Barro incluido— y Ordenar por las siete columnas con ▲ / ▼; «Filtrar» en el PC, que ordena por
  las cabeceras); fuera los dos desplegables y «Quitar filtros» de la barra. Por debajo de 1.100 px, una lista de filas de
  tres líneas (código, tipo · diámetro; estado, dirección · núcleo; «Revisado:» y la fecha) sin fila de cabeceras: tocar
  la fila abre Editar, la dirección se escribe en su celda y «⋯» lleva Historial, Retirar y Borrar; desde 1.100, la tabla,
  con «Editar» y «⋯» y una sola fecha en la revisión. En el móvil, Exportar es un botón de icono con el motivo dentro del
  menú. «＋ Añadir dirección» con borde discontinuo. Pie: «N puntos con este filtro / esta búsqueda», solo con filtro o
  búsqueda (fuera «Mostrando»). Páginas y Tabla/Mapa de 44 px por debajo de 1.100. El chip de «No funciona» usa
  `tinte-gris` solo en el panel (`EtiquetaEstado`; en oscuro se quedaba claro); la app del voluntario no cambia. Tests que fallaban antes: los e2e nuevos «Inventario por anchos» de
  `panel-inventario.spec.ts`; adaptados con `filasInventario` y `accionInventario` los de `panel-inventario`,
  `panel-dialogo` (el foco vuelve al «⋯»), `inventario-editar`, `panel-marcadores`, `vistas`, `controles`, `degradacion`,
  `panel-pestanas` e `integracion/fase7` y `fase8`.
- **RV-507:** el Registro con el botón de filtros («Todas las acciones» / la acción elegida, en una lista de una sola
  elección); el desplegable y su botón de quitar, fuera. Por debajo de 1.100 px, una lista de tres líneas (la acción y
  el código, solo si hay punto; el detalle entero, partiendo donde haga falta; quién y cuándo) y ya no `filas-apiladas`;
  desde 1.100, la tabla (1.500 px como mucho desde 1.600). Tu propia entrada dice «Tú» y no tu correo; la etiqueta
  «Jefatura» va en azul; la fecha con `Fecha` («hace…» y la exacta en el `title`). El detalle ya no se corta a 120
  caracteres y nombra los ajustes y los trabajos de Mantenimiento como en Ajustes (#758): `NOMBRE_PARAMETRO` y
  `NOMBRE_TRABAJO` pasan a `src/lib/panel/ajustes.ts`; una clave desconocida sale tal cual. Tests que fallaban antes:
  `registro-legible.test.ts` (texto entero, nombres de ajustes y trabajos), `registro.test.tsx` («Tú», sin «Punto —»,
  el resumen del botón) y el e2e «Registro por anchos» de `panel-movil.spec.ts` (412, 820, 1280 y 1920); adaptados los
  del Registro de `panel-inventario.spec.ts` con `filasRegistro` y `filtrarPor`.
- **RV-508:** la Papelera. «Purgar lo caducado…» en rojo (borde y texto `--rojo-texto`, que es `--rojo-700` en claro y
  el rojo claro de 06 §2 en oscuro, donde `--rojo-700` no llegaba a 4,5:1), de 44 px por debajo de 1.100 y en la barra de
  arriba, lejos de los «Restaurar»; con la papelera vacía, deshabilitado y descrito por «La papelera está vacía.»
  (`aria-describedby`). Por debajo de 1.100 px, una lista: el código y «Restaurar» (44 px); tipo · diámetro; «Borrado
  [`Fecha`] · quedan N días», con «queda 1 día» en rojo y negrita. Desde 1.100, la tabla de antes con `Fecha`, de 900 px
  como mucho. Tests que fallaban antes: el e2e «Papelera por anchos» de `panel-movil.spec.ts` (412, 820, 1280 con el
  diálogo de purgar, y vacía); adaptado el de 768 px, que ahora es lista.
