# Verificación · Lo pendiente y el mantenimiento (docs/22) · sesión Ops

**Estado: hecho el 25 sep 2026**, salvo P-12 (§3). Especificación: `docs/22-pendientes-y-mantenimiento.md`, puntos de Ops. Coordinación: #362, que sustituye a #354. Los registros de Frontend y Backend están en `pendientes-frontend.md` y `pendientes-backend.md`, y los tres se juntan en `pendientes.md`.

## 1. Qué se ha hecho

| RV | Issue · PR | Qué | Cómo se vio fallar antes |
|---|---|---|---|
| 89 | #364 · #365 | Los 21 trabajos de Actions, de `ubuntu-latest` a `ubuntu-24.04`. `canario-ubuntu.yml` (miércoles 05:13 UTC y a mano) hace el camino crítico en `ubuntu-26.04` y abre o cierra «Canario Ubuntu 26 en rojo». Está en las listas `WORKFLOWS`, con el límite de 8 días. 15 §4 y DEC-128 | `workflows.test.ts`: 5 tests rojos con los workflows de `develop` |
| 90 | #369 · #370 | `revisar-bd.sh` escribe `tareas-$entorno.json` en `RUNNER_TEMP`. `tareas-*.json` en `.gitignore`. `ci-calidad` falla si `npm test` deja archivos | `workflows.test.ts`: el JSON quedaba en la raíz. En vivo, en una rama de prueba con un test que deja `suelto-rv90.txt`, `ci-calidad` se puso en rojo en «Los tests no dejan archivos sueltos» (run 36125625135). Rama borrada |
| 91 | #366 · #367 | `sin-force-push` resuelve `HEAD`/`@`/refspec sin rama. `migraciones-aplicadas` cubre `cp`, `copy`, `Copy-Item`, `install` (destino = último argumento), `tee`, `dd of=`, `git checkout -- ruta` y `git restore`. `sin-console-log` cubre también `workers/**` y `public/**` | `probar-hooks.ts`: 8 de los 14 casos nuevos fallan con los hooks de `develop`. Hoy son 42 casos |
| 93 | #369 · #370 | La vigilancia corre a las 07:41 y a las 19:41 UTC. 15 §4: menos de 14 h es normal, más de 26 h no | `workflows.test.ts` (una sola línea `cron` sobre `develop`) |
| 94 | #369 · #370 | El ensayo de la purga anota `storage_bytes` (`purgar-fotos.yml (ensayo)`). La primera pasada **programada**, sin `config.ultima_purga_fotos`, hace ensayo y abre «Primera purga de fotos: revisa el ensayo». Una pasada que borra anota `ultima_purga_fotos`. DEC-129 | `workflows.test.ts` (`if: !inputs.ensayo`) y `purgar-fotos.test.ts` (`modoDePurga`). `probar-purga.ts` en `ci-sql`: primera vez programada → ensayo; a mano → borra; tras anotar → borra |

- **Decisiones:** DEC-128 (RV-89) y DEC-129 (RV-94). DEC-130 y DEC-131 quedan sin usar.
- **Migraciones:** ninguna.

## 2. Comprobado en vivo

- **Canario de Ubuntu 26** (run 36124034908, imagen `ubuntu-26.04` 20260920.143.1): **en verde**, antes del 19-10.
  - `psql` y `pg_dump` 17.11 (`17.11-1.pgdg26.04+2`): PGDG ya publica paquetes para 26.04.
  - `jq-1.8.1`, typecheck y tests.
  - Si sigue en verde dos semanas, todo pasa a `ubuntu-26.04` en un PR aparte (DEC-128).
- **Purga en ensayo** (run 36125628694, `gh workflow run purgar-fotos.yml -f ensayo=true`): 0 fotos en el bucket de producción, 0 referenciadas y 0 que borraría. Producción arranca vacía (DEC-051). `storage_bytes = 0` queda anotado con «(ensayo)». Pero la pantalla trataba 0 como «sin dato» (`s.storage_bytes ? …`). Lo arregló Frontend en #387, que ahora usa `!= null`.
- **#342** (RV-93, punto 4): la vigilancia programada del 25-09 (run 36138075138, lanzada por GitHub hacia las 13:00 UTC en vez de a las 07:41) fue bien y **cerró #342 sola**. `purgar_subidas` ya tenía su primera ejecución.

## 3. Pendiente

- **P-12**, cuando estén fusionados RV-81, RV-82, RV-84 y RV-92.
- **El respaldo del domingo 27-09** y **la purga del lunes 28-09** (P-12) se comprueban después de esas fechas. La primera purga programada hará ensayo y abrirá su issue (DEC-129), también con el bucket vacío.
