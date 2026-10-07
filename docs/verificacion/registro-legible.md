# Verificación · Registro que se lee y el foco dentro de las ventanas del panel (docs/30)

**Estado: hecho en staging (oct 2026).** Producción, con la siguiente release (sin migraciones).
Especificación: `docs/30-registro-legible-y-foco.md`. Una sesión (Frontend-panel), repartida en dos
agentes. El detalle está en el cuerpo de cada PR.

## RV-127 · El Registro dice qué cambió · #478 (DEC-171)

- `detalleLegible` (`src/lib/panel/registro-legible.ts`, función pura) en el cliente, con `antes` y `despues`; Registro (tabla y filas apiladas) e Historial del punto. `v_registro` y la búsqueda no cambian.
- **Pruebas:** 31 unitarios (edición, movimiento, racor desconocido, recorte, vacío, alta, purga, config, booleanos, operación, exportación, fecha sin desfase de huso, privacidad, sin cambios), 3 de componentes y el e2e de Editar → Registro («Estado: … → Malo» y «Movido N m», sin `desplazamiento_m`/`lat`/`lng`). Dos vistas nuevas en `vistas.spec.ts` (`panel-registro`, `panel-historial`) a 412 y 1440 px, claro y oscuro. Fallaban antes.
- **Tras la revisión** (silent-failure-hunter): una purga enseña código, tipo y motivo desde `antes` (antes salía «—»); el `desplazamiento_m` de la base de datos sale siempre; sin cambios visibles, «Sin cambios en los datos» en vez de la lista de claves; situación, booleanos, operación y fotos anidadas con palabras; la fecha de revisión sin desfase de huso. Code-reviewer: una exportación filtrada por revisión caducada perdía el filtro (las claves técnicas solo se ignoran en el primer nivel).
- **Desviaciones:** «Movido N m» al final, como en el ejemplo de la spec; «Motivo» con nombre; claves desconocidas al final, por orden alfabético.
- **Límite conocido** (06 §5): la búsqueda encuentra por nombre de campo, no por los valores que se ven.

## RV-128 · El foco no sale de las ventanas del panel · #482

- `useModal(ref, activo)` (`src/lib/foco-modal.ts`): con una ventana abierta, el resto de `<body>` queda `inert`; pila de ventanas (solo la de encima responde); solo quita el `inert` que puso. En `Dialogo`, `ConfirmarDescartar` y `EditarPunto` salvo al lado de la tabla.
- **Pruebas:** vitest de `foco-modal` (una, dos apiladas, cerrar la de arriba, cerrar todas, `inert` previo respetado) y e2e a 768 px (Tab no llega a la tabla), 1440 px (sí llega), Retirar sobre Editar, 1050 px (al estrecharse, el foco entra en Editar) y «Guardado» sigue anunciándose. axe en las tres situaciones. Fallaban antes los de 768 px, Retirar sobre Editar y el aviso.
- **Desviaciones:** el aviso del panel pasa a un portal propio fuera de la inertización (`contexto.tsx`), para que se vea y se anuncie con una ventana abierta; la vuelta del foco al «Editar» de la fila ahora espera a que Editar se cierre; sin trampa de Tab en JavaScript (el foco pasa por la barra del navegador y vuelve, como un `<dialog>` nativo).
- **Queda, de bajo riesgo** (anotado en el PR): el foco no vuelve tras cerrar Retirar o Borrar, tras «Seguir editando» ni si la fila ha desaparecido; un Historial abierto a 768 px mientras se descarga el código de Editar quedaría debajo; la hoja del QR (`CodigoQR.tsx`) es otra ventana a pantalla completa sin `useModal`.

## RV-129 · Lint sin advertencias · #477

- `MARCA`, `marcaActual` y `quitarEntradaDeEditar` pasan a `src/lib/panel/historial-editar.ts` (con su test). Solo mover código.
- `npm run lint` pasa a `eslint --max-warnings 0 .`, para que las advertencias no vuelvan (fuera de lo pedido, en `package.json`).

## Pendiente del desarrollador (docs/30 §6)

1. En staging: editar un punto (moverlo y cambiar el estado) y mirar la línea en el Registro y en el Historial del punto.
2. Con el teclado: abrir Editar en una ventana estrecha y pasar con Tab; el foco no tiene que salir del panel.
