# Verificación · Revisión en vivo (docs/20) · sesión Ops

**Estado: hecho el 24 sep 2026.** Especificación: `docs/20-revision-en-vivo.md`, puntos de Ops. Coordinación: #332. El registro de Frontend está en `revision-vivo-frontend.md`, y los dos se juntan en `revision-vivo.md`.

## 1. Qué se ha hecho

| RV | Issue · PR | Qué | Cómo se vio fallar antes |
|---|---|---|---|
| 72 | #333 · #334 | `arranque --solo-faltantes` lee el repositorio, el Worker y las dos Pages antes de escribir. `wrangler secret list` tiene tres salidas: la lista, el Worker no existe (código 10007) o un error, que para con «no se cambia nada». Un secreto de vigilancia nuevo va primero al Worker, también en `--rotar vigilancia`; si el Worker no lo acepta, no se toca Pages ni el repositorio | `arranque.test.ts`: con `wrangler secret list` fallando, el `nombresSecretosWorker` de `develop` daba `[]` y `planFaltantes` rotaba los secretos de vigilancia |
| 73 | #333 · #334, #339 | `comprobar-produccion` sale con 2 si algo imprescindible queda sin comprobar, y con `--parcial` sale con 0 y lo dice. `--completo` hace la mitad local, lanza `comprobar-produccion.yml` (`--parcial --json`, filas como artefacto), espera y une las dos. **#339:** el primer `--completo` real salía con 2, porque cada mitad nombra distinto las filas de un grupo | `comprobar-produccion.test.ts`: «lo que no se puede consultar» daba 0 sobre `develop`. #339: el caso real (runs 36054446446 y 36054774518) daba 2, y ahora da 0 |
| 74 | #335 · #336 | `deploy-staging.yml` despliega el Worker en cada push, sin mirar el diff, con `VERSION_CODIGO` = último commit de `workers/`. La vigilancia la lee de `…/settings` y la compara con `develop` | `workflows.test.ts`, dos tests rojos con los workflows de `develop` |
| 75 | #333 · #334 | `paridad.ts` solo compara con `HEAD^2` si está en `origin/develop` (`merge-base --is-ancestor`); si no, con `origin/develop` | `paridad.test.ts` con un repositorio git de verdad: un hotfix con merge commit se comparaba consigo mismo |
| 77 | #337 · #338 | Novedades: un solo patrón para los códigos (`[A-Z]{1,4}-\d{1,3}`, `F\d+(\.\d+)?`), que se quitan entre paréntesis y descartan la línea si van sueltos, y una lista de términos técnicos que descartan la entrada. `novedades.json` regenerado | `generar-novedades.test.ts`, cuatro tests rojos sobre `develop`: «(GM-04)», «(XY-12)», «Worker de Cloudflare» y la lista |
| 78 (Ops) | #335 · #336, #343 | La vigilancia mira staging (avisos sin salir y tareas de `pg_cron`) y anota allí su última vigilancia; el respaldo, solo en producción. **#343:** en su propio trabajo, con `environment: staging` y su `SUPABASE_DB_URL`, y sin el SIGPIPE que cortaba el paso | `workflows.test.ts`. Además, en vivo: la vigilancia del run 36055437810 «no terminó» (exit 141, `SUPABASE_DB_URL_STAGING` vacío) |

- **Decisiones:** DEC-101 (RV-77), DEC-102 (RV-72, RV-73, RV-75), DEC-103 (RV-74 y RV-78) y DEC-104, que sustituye el punto 3 de DEC-103.
- **Migraciones:** ninguna.

## 2. Comprobado en vivo

- **Worker con su versión** (RV-74): el despliegue de staging de #336 puso `VERSION_CODIGO` (versión `cf5d8a37`). La vigilancia la leyó: `bdf3eee`, el último commit de `workers/`, y no dio problema.
- **Vigilancia de staging** (RV-78): en el run 36057792654 terminan los tres trabajos, y el de staging va en verde, sin errores de `psql`.
- **Lo único que la vigilancia encontró** (#342) es de producción. Es `hidrantes_purgar_subidas`, que entró con la migración de las 16:29 y corre por primera vez a las 03:57 UTC, como esperaba `docs/20` §5. La vigilancia programada del 25 sep tiene que cerrar #342 sola.
- **`comprobar-produccion -- --completo`** (RV-73), antes de P-10: salida 0. Solo quedan `VITE_MAPABASE_URL` (opcional, sin R2) y `db_max_rows` (opcional, pide el token de gestión de Supabase).

## 3. Suposiciones

- **`SUPABASE_DB_URL_STAGING` no existe como secreto del repositorio.** `docs/20` RV-78 decía que sí. En vez de crear un secreto más con la misma contraseña, staging se mira con el `SUPABASE_DB_URL` de su environment (DEC-104).
- **`vigilancia_ok` de staging** dice si responde lo de staging, no el resultado global (DEC-104).
- **RV-77:** una carretera escrita como «A-92» descartaría la línea. Hoy no hay ninguna (DEC-101).
- **P-10 se hace una vez, al final**, con todo `docs/20`, porque así lo pidió el desarrollador («primero staging, luego producción»). `docs/20` §1 pedía hacerlo antes y repetirlo al final.
