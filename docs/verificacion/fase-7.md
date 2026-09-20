# Verificación · Fase 7 · Panel de jefatura

**Estado: terminada el 20 sep 2026.** El criterio de salida se cumple entero contra la pila local
real en CI (§2). Queda pendiente, fuera del criterio, el `GITHUB_DISPATCH_TOKEN` que solo puede crear
el desarrollador, y con él la prueba de punta a punta de Mantenimiento (§6).

## 1. Qué se ha construido

Siete pestañas en `/admin`, cargadas fuera del JavaScript inicial (TR-11), con búsqueda global en la
cabecera (FR-145), contador de pendientes (FR-110) y aviso de servidor no disponible (FR-168):

- **Cola de revisión** (FR-101–FR-109): filtros por estado, operación y núcleo; casillas con
  aprobación y rechazo en bloque; detalle con minimapa, dirección deducida editable, diff campo a
  campo, señales de fiabilidad, foto y las cuatro acciones; confirmación expresa si la propuesta está
  desactualizada; historial en solo lectura. Decisiones en DEC-065.
- **Inventario** (FR-120, FR-160): tabla o mapa, filtros, orden, páginas de 50, dirección editable en
  la celda, editar / retirar / borrar / historial y exportación a Excel, CSV y GeoJSON.
- **Revisiones caducadas** (FR-121, FR-122) con hoja de campo imprimible por núcleo.
- **Registro** (FR-123) paginado en el servidor y en solo lectura; **Papelera** (FR-124) con los días
  que quedan, restaurar y purga de lo caducado. Decisiones en DEC-067.
- **Voluntarios** (FR-130–FR-132): actividad a 3 y 12 meses, anonimización por dispositivo e
  incidencias con "Marcar resuelta".
- **Ajustes** (FR-140–FR-145, FR-162–FR-167): código de acceso, administradores, parámetros, núcleos
  gestionables, salud del sistema, descarga JSON, mantenimiento, avisos push de jefatura, código QR
  imprimible y novedades. Decisiones en DEC-068.

En la base de datos: migración **0008** (la cola sabe el núcleo y cuándo cambió el punto) y **0009**
(`fn_renombrar_nucleo`, `fn_anadir_nucleo`, resumen semanal encolado por `pg_cron`, acción
`nucleo_guardado`).

## 2. Criterio de salida (copiado de 09)

> aprobar 20 revisiones en bloque en menos de 30 segundos y verlas en `registro`; detectar y fusionar
> un duplicado introducido a propósito a 8 m; una propuesta desactualizada exige confirmación; el
> formulario de correcciones guarda `correcciones` y el autor lo ve en Mis propuestas.

**Resultado:** cumplido. `e2e/integracion/fase7.spec.ts` en ci-sql, contra `wrangler pages dev` y
Supabase local:

| Parte | Cómo | Resultado |
|---|---|---|
| 20 revisiones en bloque en < 30 s, y en el registro | 20 puntos con su revisión pendiente; se marcan todas y se aprueban de una vez; se mide el tiempo hasta el aviso y se cuentan en `propuestas`, en `registro` y la fecha de revisión de los 20 puntos | ✅ (unos 2 s) |
| Duplicado a 8 m detectado y fusionado | Punto en un rincón sin vecinos y alta del voluntario a 8 m: `fn_proponer` marca el duplicado; jefatura compara, elige qué prevalece y fusiona. No se crea punto nuevo, el existente queda revisado hoy y la propuesta guarda `fusionada_con` | ✅ |
| Propuesta desactualizada | El punto cambia después de enviarse: el detalle lo avisa, el botón normal no está y solo queda *Confirmar y aprobar* | ✅ |
| Correcciones guardadas y visibles para el autor | Se aprueba con correcciones desde el panel: `propuestas.correcciones` las guarda, el registro anota `aprobacion_con_correcciones` y en el móvil del autor aparece "con correcciones" | ✅ |

## 3. Casos de 10 ejecutados

Cubiertos por los e2e del panel contra un Supabase simulado, en móvil y escritorio:
`panel-cola.spec.ts` (9), `panel-inventario.spec.ts` (7), `panel-ajustes.spec.ts` (5) y
`panel-tableta.spec.ts` (2, tableta y teclado, TR-35). Unitarios de `src/lib/panel`: cola, inventario,
exportación (incluido que el `.xlsx` es un zip con las partes que Excel espera) y ajustes. pgTAP:
`08_panel.test.sql` con el núcleo de la cola, los núcleos gestionables y el resumen semanal.

Reglas de 06 §9 comprobadas en las pantallas nuevas: UI-01 (no se dibuja lo que aún no existe),
UI-02 (motivo escrito bajo cada botón deshabilitado), UI-03 (estados vacíos), UI-04 (todo fallo se ve
traducido, incluido "servidor no disponible" y "no configurado"), UI-05 (aviso tras cada acción),
UI-06 (confirmación con el efecto escrito en retirar, borrar, purgar, anonimizar y cambiar el
código), UI-11, UI-14 y UI-20/21 (textos en `textos.ts` y en el Apéndice A de 06).

## 4. Cómo reproducirlo

```
npm test
PW_CANAL=msedge npm run e2e
npm run test:sql
npm run build && npm run functions:dev &
INTEGRACION=1 PW_CANAL=msedge npm run e2e
```

## 5. Suposiciones tomadas

DEC-065 (de dónde salen los datos de la cola, umbrales de las señales, qué del prototipo 08 no se
construye), DEC-066 (minimapa de los formularios), DEC-067 (inventario, registro, papelera y
exportación; `.xlsx` propio con fflate) y DEC-068 (núcleos, resumen semanal, QR y mantenimiento).

## 6. Lo que queda abierto

- **`GITHUB_DISPATCH_TOKEN`**: lo crea el desarrollador (un token *fine-grained* no se puede crear
  por API), con el permiso único `Actions: Read and write` sobre este repositorio, y se guarda como
  secreto de Pages en staging y producción. Hasta entonces, Mantenimiento responde "Esta acción aún no
  está configurada en el servidor" y `mantenimiento.yml` solo se puede lanzar a mano desde GitHub.
  El endpoint pasó de `repository_dispatch` a `workflow_dispatch` para que ese permiso bastara
  (DEC-069).
- **Purga de fotos huérfanas y respaldo** (FR-144, FR-165): sus workflows son de la Fase 8; los
  botones no se dibujan hasta que existan.
- **Sugerencias de correos de la app de uniformidad** (FR-141): se leen si el esquema `public` lo
  permite con la sesión de jefatura; en staging está por comprobar con un administrador real.
- **Avisos push de jefatura de punta a punta** (FR-164): igual que los del voluntario, pendiente de
  probarlo en un móvil real cuando staging sea accesible (DEC-061).
- Validación de jefatura sobre el panel real: Fase 9.
