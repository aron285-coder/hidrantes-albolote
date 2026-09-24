# Verificación · Revisión sobre staging y producción en vivo (docs/20)

**Estado: hecho en staging el 24 sep 2026; producción, con P-10 (§3).** Especificación:
`docs/20-revision-en-vivo.md`. Es la primera especificación en paralelo (`docs/trabajo-en-paralelo.md`,
DEC-100), con dos sesiones coordinadas en #332. Los registros de cada sesión:
`revision-vivo-ops.md` y `revision-vivo-frontend.md`. La preparación del CI está en `par-01.md`.

## 1. Qué se ha hecho

| RV | Sesión | PR | Prioridad |
|---|---|---|---|
| 71 · mapa base en línea con teselas sueltas | Frontend | #341, #344 | P0 |
| 72 · `--solo-faltantes` no rota por un fallo al leer | Ops | #334 | P0 |
| 76 · inventario vacío ya sincronizado | Frontend | #346 | P0 |
| 73 · `comprobar-produccion` sale con 2 sin la otra mitad | Ops | #334, #339 | P1 |
| 74 · el Worker en cada push, con su versión vigilada | Ops | #336 | P1 |
| 78 · Salud del sistema en staging | Ops y Frontend | #336, #343 · #346 | P1 |
| 79 · inventario y pestañas a ~800 px | Frontend | #346 | P1 |
| 80 · margen de TR-10 | Frontend | #348 | P1 |
| 75 · paridad solo con un merge que está en develop | Ops | #334 | P2 |
| 77 · Novedades sin códigos ni términos técnicos | Ops | #338 | P2 |

- Cada punto tiene su test de regresión, que fallaba sobre `develop`. Cada registro de sesión dice cómo.
- **Decisiones:** DEC-100 (PAR-01), DEC-101 a DEC-104 (Ops) y DEC-111 a DEC-113 (Frontend). DEC-114 a 116 quedan sin usar.
- **Migraciones:** ninguna.

## 2. Checklist de docs/20 §6

- [ ] **P-10**, con producción en la versión de esta especificación y el job de `deploy-prod.yml` entero en verde. Va en §3 y en `paridad-produccion.md`.
- [x] **RV-71 en staging, sin copia descargada.** Una tesela da 200 con `application/vnd.mapbox-vector-tile` e `immutable`. La primera vista del mapa pinta 12 de 12 lienzos con 205 kB de teselas, sin errores de `pmtiles` (antes, 0 de 12 y 12 errores).
  - **Queda para una persona:** mirarlo en una ventana privada con una sesión real. La medida se hizo con la sesión y Supabase simulados en el navegador, contra los estáticos de staging.
- [x] **Todos los RV con su test de regresión.**
- [ ] **Tras el domingo 28-09 y el lunes 29-09**, en Salud de producción: «Último respaldo» con esa fecha, «Almacenamiento usado» con cifra y `purgar_subidas` en «Tareas programadas». `purgar_subidas` debería verse ya el 25-09: su primera ejecución es a las 03:57 UTC, y la vigilancia de las 07:41 tiene que cerrar #342 sola.
- [ ] **Paso manual del desarrollador (5 min), pendiente desde `docs/19` §7:** un aviso real en un móvil con staging instalado, en menos de 10 minutos.

## 3. P-10 · producción al día

Se hace una sola vez, al final y con todo `docs/20`: así lo pidió el desarrollador («primero staging, luego producción»). `docs/20` §1 pedía hacerlo antes y repetirlo al final. El registro está en `paridad-produccion.md`.

## 4. Lo que se aprendió de trabajar en paralelo

- **Duración:** seis PR de Ops (#334, #336, #338, #339 y #343, de código, y este) y cinco de Frontend, en 1 h 35 min de reloj (del primer PR, #334, a las 20:19 UTC, al registro de Frontend, #349, a las 21:35). Mediana de CI: 4,9 min con código y 1,1 min solo con documentación (`par-01.md`).
- **Conflictos:** solo en `docs/12` (entradas y el índice), como preveía §2. Se resolvieron conservando las dos partes.
- **Lo que la especificación daba por hecho y no era:** que `SUPABASE_DB_URL_STAGING` existía (DEC-104), y que `_headers` bastaría para que Pages sirviera rangos (DEC-111). En los dos casos se comprobó en vivo antes de seguir.
