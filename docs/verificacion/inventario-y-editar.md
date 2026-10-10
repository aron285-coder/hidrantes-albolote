# Verificación · Panel más corto, Inventario con dos filtros y Editar como el alta (docs/29)

**Estado: hecho en staging (oct 2026).** Producción, con la siguiente release (lleva 0037 y 0038).
Especificación: `docs/archivo/especificaciones/29-inventario-y-editar.md`. Cuatro sesiones (Backend, Frontend-campo,
Frontend-panel con un subagente, y Ops), coordinadas en #464. El detalle de cada punto está en el
cuerpo de su PR.

## 1. Qué se ha hecho

| Punto | PR | Qué | DEC |
|---|---|---|---|
| RV-120 | #467 · `0037`, `0038` | `tipo_racor` con `directo`; `fn_editar_punto` acepta `lat`/`lng` (las dos o ninguna), recalcula municipio y núcleo y deja `desplazamiento_m` en `edicion_admin` | DEC-169, DEC-170 |
| RV-121 | #469 | Enganche **Directo**: Barcelona · Granada · Directo · Otro en una fila, también a 360 px | DEC-170 |
| RV-122 | #470 | Panel con cinco pestañas; `/admin/caducadas` y `/admin/voluntarios` llevan al Inventario; Salud sin incidencias | DEC-167 |
| RV-123 | #471 | Inventario con Tipo y Estado en `<select>`, «Quitar filtros» y «Exportar ▾» | DEC-168 |
| RV-124 | #474 | Editar en panel lateral con el mapa y los controles del alta, cambios marcados, mover el punto | DEC-169 |
| RV-125 | #473 | Fuera «Algo no funciona»; `/incidencia` lleva a Ajustes. Limpieza de `incidencias_app` en #472 | DEC-167 |
| RV-126 | #468 | `npm run anonimizar` (`--buscar`, `--dispositivo … --admin …`, confirmación `ANONIMIZAR`) | DEC-167 |

- **Migraciones:** 0037 y 0038, con pgTAP 33 (28 casos; falló antes de la migración, run 37272591656). `npm run compatibilidad` en verde en ci-sql.
- **Requisitos:** `docs/01` v1.12 (FR-20, FR-120, FR-131 y FR-143; retirados FR-92, FR-121, FR-122, FR-130 y FR-132), `docs/02` v1.9, `docs/05` (en #467 y #468), `docs/06` v1.22, `docs/10` (AC retirados y AC-168 a AC-171), `docs/11` §6.4 y `docs/15` §5.10 (#468), `docs/12` DEC-167 a DEC-170. Prototipos 07 y 08 al día en un PR aparte.
- **Pruebas:** cada PR de código con su test que falla antes, la CI completa en verde y la revisión de `pr-review-toolkit` (code-reviewer, silent-failure-hunter y, en el panel, pr-test-analyzer). Hallazgos altos resueltos en el mismo PR.

## 2. Lo que la especificación no esperaba

- **Editar se comía «Directo».** El diálogo viejo solo conocía tres enganches: una boca Directo se abría como Barcelona y se sobrescribía al guardar. Lo arregla RV-124, que usa `ORDEN_RACORES`; un test impide otra lista propia. La corrección de la cola (`DetallePropuesta`) también se pasó a `ORDEN_RACORES` en #469.
- **Editar, en la revisión** (#474): mientras guarda no se cierra ni cambia de punto, y al terminar solo cierra si sigue abierto el mismo; salir del Inventario o cerrar la pestaña con cambios pregunta; Esc en Retirar, Borrar o Historial no cierra Editar, y retirar o borrar el punto que se edita lo cierra; la entrada de historial va a todos los anchos.
- **Rendimiento:** Editar va en su propio trozo de carga diferida; dentro del Inventario, el arranque con sesión (RV-80) pasaba de ~185 a ~290 ms y fallaba la CI.
- **La misma posición no es un movimiento** (±0,1 m en 0038): así un panel que siempre manda `lat`/`lng` no llena el Registro de movimientos de 0 m. La pantalla, además, solo los manda desde 0,5 m.
- **`npm run anonimizar`:** `--buscar` también pide `--admin` (la vista de actividad exige sesión de administrador) y acepta `--entorno local`. Se hace pasar por el administrador con `set_config('request.jwt.claims', …, true)` dentro de una sola transacción; no da permisos de más, porque el rol del script ya es dueño del esquema.
- **Textos de push** que mandaban a «Algo no funciona»: ahora terminan en «si sigue igual, díselo a jefatura».

## 3. Pendiente

1. **Desarrollador (docs/29 §10):**
   - La foto de Directo: `npx tsx scripts/preparar-racores.ts <carpeta> directo`.
   - En staging: editar un punto en el ordenador, moverlo unos metros y cambiar el enganche, y mirar el Registro; en el Android, editar a pantalla completa y comprobar que «atrás» cierra el panel.
   - `npm run anonimizar` en staging con un dispositivo de prueba.
   - ~~La conformidad de jefatura sobre `docs/01` v1.12.~~ Ya no es un paso pendiente: basta la del desarrollador (DEC-177).
   - Las aprobaciones de producción.
2. **El Registro enseña los nombres de los campos de una edición** («… desplazamiento_m, …»), no «movido N m»: `v_registro` lista las claves de `despues`. **Hecho en docs/30** (RV-127, #478): el Registro y el Historial dicen qué cambió, con palabras.
3. **`incidencias_app`:** se limpia cuando no quede ninguna versión vieja de la app (#472).
