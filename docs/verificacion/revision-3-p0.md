# Verificación · Tercera revisión (24 sep 2026) · bloque A (P0, errores)

**Estado: hecho el 24 sep 2026.** Especificación: `docs/19-paridad-avisos-y-revision-3.md` §2
(RV-52 a RV-59). La paridad de producción (bloque P) va en `paridad-produccion.md`, y los bloques B y
C en `revision-3-p1.md` y `revision-3-p2.md`.

## 1. Qué se ha hecho

| RV | Issue · PR | Qué | Cómo se vio fallar antes |
|---|---|---|---|
| 52 | #273 · #295, #305 | Los avisos push los despacha un Cloudflare Worker, `hidrantes-avisos`, con cron `*/5 * * * *`, uno para los dos entornos (DEC-097). `avisos.yml` queda solo a mano. La vigilancia baja a 30 min el umbral de avisos sin salir y comprueba el cron del Worker. `arranque --solo-faltantes` pone sus secretos. **#305:** el token de Cloudflare de los *environments* solo tenía permiso de Pages. Staging se despliega igual y el paso lo avisa, la vigilancia lo cuenta como problema, y `--solo-faltantes` despliega el Worker con la sesión de `wrangler login` | sobre `develop` no había Worker: los tests de `workers/avisos/src/index.test.ts` y los de `workflows.test.ts` (cron, despliegue y vigilancia) no tenían qué probar. #305: `workflows.test.ts` «con un token sin permiso de Workers» rojo sobre `develop` |
| 53 | #274 · #297 | Un error de psql en Actions ya no enseña la fila con los nombres. `errorSeguro()` quita DETAIL, CONTEXT, QUERY y «Failing row contains», y psql va con `VERBOSITY=terse` en CI. Todos los scripts pasan sus errores por él | `comun.test.ts` y `promover-piloto.test.ts` rojos sobre `develop` |
| 54 | #275 · #298 | "Cercanos": el desempate por radio es una sola pasada entre vecinos a menos de 10 m. El aviso de "el más cercano no funciona" compara con la distancia mínima | 2 de los 3 tests nuevos de `incidente.test.ts` rojos. El tercero ya pasaba (se anotó en el PR) |
| 55 | #276 · #299 | Restaurar repone el acceso de ahora y las secuencias **en la misma transacción** que el volcado. Si no puede leer el acceso, no restaura. Lo que falle después termina con las acciones manuales. SIGINT/SIGTERM borran la carpeta temporal | `probar-restauracion`, escenario 3, con `9999_falla.sql` |
| 56 | #277 · #306 | La vigilancia solo cierra su issue con `HAY == 'no'`; sin resultado dice «no terminó». «Comprobar» no hace `npm ci` (`preparar` con `npm: 'false'`). Las tareas de pg_cron se comparan con `scripts/sql/tareas-esperadas.txt`, generada de las migraciones: una que falta es un problema y en Salud del sistema sale «no está programada» | 3 tests de `workflows.test.ts` rojos con `vigilancia.yml` y `preparar` de `develop`. ci-sql: una tarea borrada con `cron.unschedule` sale con `falta` y `problema` |
| 57 | #278 · #301 | Jefatura conserva `?incidente=`, `?p=` y `?aqui=` al recargar: solo se quitan los parámetros de OAuth, una vez | e2e `incidente.spec.ts` (RV-57) rojo sobre `develop`: la URL quedaba en `/` |
| 58 | #279 · #302 | Sin cobertura, con "Calle" o "Satélite" elegida y el mapa base en el móvil, el mapa base propio se pinta debajo, y lo avisa (DEC-098, 01 FR-63 v1.4) | e2e `degradacion.spec.ts` (RV-58) rojo sobre `develop`: ni aviso ni teselas del mapa base |
| 59 | #280 · #304 | "Cercanos" con GPS: `gps=<momento>,<precisión>` en la URL. La cabecera es «Desde tu posición · ±12 m · hace 2 min». Con más de 50 m sale un aviso y «Marcar en el mapa»; con más de 60 s, la posición de cuándo es. Con el GPS en frío, «Buscando…» sin teclado, y la lista sale sola con el primer fix. Los avisos flotantes ya no tapan los botones | los 6 tests nuevos rojos sobre `develop`; el de disposición, con «el aviso tapa "Capas"» |

- **Decisiones:** DEC-097 (con la nota del token sin permiso de Workers) y DEC-098.
- **Migraciones:** ninguna. La 0029 sigue libre.

## 2. El Worker `hidrantes-avisos`

- **Desplegado el 24 sep 2026 a las 14:21 UTC**, versión `3311da0c`, con `npm run arranque -- --solo-faltantes` (sesión de `wrangler login`).
  - El primer `deploy-staging` (run 36011457440) no pudo: el token de los *environments* solo tiene permiso de Pages.
  - Los secretos `VIGILANCIA_SECRETO_PROD` y `VIGILANCIA_SECRETO_STAGING` se generaron nuevos y se pusieron en Pages, en el repositorio y en el Worker. Staging se volvió a desplegar solo.
- **Cron comprobado** con `wrangler tail`:
  - ejecución programada de las **14:30:59 UTC**, `outcome: ok`, 612 ms, sin excepciones;
  - staging respondió sin aviso;
  - producción anotó `hidrantes-albolote.pages.dev · fallo`, que es lo esperado: producción aún no tiene `/api/push` ni el secreto nuevo. Se arregla con P-02 (#296).
- **Pendiente:**
  - **Un aviso real entregado en staging.** Hace falta un móvil suscrito y una moderación en staging, y eso lo hace el desarrollador o jefatura. En menos de 5 minutos debe llegar el aviso.
  - **Ampliar el token de Cloudflare** con *Account · Workers Scripts · Edit*. Son 2 minutos en el panel (15 §2, comentario en #273). Hasta entonces, la vigilancia diaria abre su issue con «sin permiso (HTTP 403)».

## 3. Suposiciones

- **El token de Cloudflare es el mismo en los dos *environments*.** `arranque.ts` pone uno solo, y por eso el trabajo `worker` de la vigilancia usa el de `staging` (DEC-097).
- **En RV-58, «sin cobertura» para pintar el mapa base debajo es `conexion !== 'bien'`**, como dice 19, y también cuenta «sin servidor». El aviso sale solo con `sin_cobertura`: sin servidor, las teselas en línea siguen llegando y tapan el mapa base.
- **En RV-59, `gps=1` de la versión anterior se sigue leyendo** como GPS sin datos (04 §12).

## 4. Cómo reproducirlo

```
npx vitest run workers scripts/workflows.test.ts scripts/generar-tareas-esperadas.test.ts src/lib/incidente.test.ts src/lib/capas.test.ts src/lib/acceso.test.ts
npx playwright test e2e/incidente.spec.ts e2e/degradacion.spec.ts e2e/accesibilidad.spec.ts
npx wrangler tail hidrantes-avisos --format json      # una ejecución cada 5 minutos
```
