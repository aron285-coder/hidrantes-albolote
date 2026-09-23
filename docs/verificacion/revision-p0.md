# Verificación · Revisión de sep 2026 · bloque P0

**Estado: hecho el 23 sep 2026**, salvo un paso manual del desarrollador (§3). Especificación:
`docs/17-cambios-revision-2026-09.md`. Cada RV tiene su issue (#158–#189) y su PR a `develop`; en
cada uno, el test de regresión se escribió primero y se vio fallar sobre `develop` antes del arreglo
(17 §0.4). Los de SQL, con un commit solo de tests y CI lanzada sobre esa rama: en este equipo Docker
Desktop no arranca, así que pgTAP se ejecuta en `ci-sql`, que es donde tiene que pasar de todos modos.

## 1. Qué se ha hecho

| RV | Issue · PR | Qué | Tests que lo prueban (rojos antes del arreglo) |
|---|---|---|---|
| 11 | #168 · #190 | `mantener-workflows` en `mantener-activo.yml`; `vigilancia.yml` comprueba que cada workflow programado está activo y ha corrido a tiempo, y los rehabilita (DEC-085) | `scripts/workflows.test.ts` |
| 01 | #158 · #191 | la cola da otra vuelta si se pidió durante la anterior; límites de tiempo en reserva (20 s), PUT (120 s) y supabase-js (30 s) con `src/lib/red.ts` | `cola.test.ts` (encolar durante un envío, reintentar durante un envío, PUT colgado), `red.test.ts`, e2e `operaciones.spec.ts` · corrección enviada mientras sube otra foto |
| 02 | #159 · #191 | `encolar` dice si llegó a IndexedDB; "Sin guardar en el móvil" con "Reintentar ahora"; `navigator.storage.persist()` y "Guardado protegido" en Ajustes | `cola.test.ts` (persistida false/true), e2e · sin IndexedDB avisa de no cerrar |
| 03 | #160 · #194 | `DESCONOCIDO` (solo de cliente) en vez de `ERROR_INTERNO`; 401/403/42501 → `NO_AUTORIZADO`; se reintenta y a los cinco seguidos es fallo; "Reintentar" en Mis propuestas | `api.test.ts`, `cola.test.ts` (desconocido, cinco seguidos, `reintentarFallido`, `DIAMETRO_SIN_FIJAR`), e2e `cola-atascada.spec.ts` |
| 04 | #161 · #194 | reintentar la cola al volver a entrar o pasar a jefatura; generación de la cola al cerrar sesión | `cola.test.ts` · cerrar sesión durante la subida, `acceso.test.ts` · volver a entrar |
| 05 | #162 · #192 | el móvil deriva `revision_caducada` y `radio_px` con la `config` recibida (`src/lib/derivar.ts`, DEC-082) | `derivar.test.ts`, `puntos.test.ts` (incremental vacía, escala, arranque sin red, cambio de día), paridad con el servidor en `e2e/integracion/fase5.spec.ts`, e2e `mapa.spec.ts` con `page.clock` |
| 06 | #163 · #195 | `bajas` con los purgados de la papelera; `config.epoca_datos` que `restaurar.ts` cambia; completa si cambia la época o cada 7 días (0012, DEC-083) | `10_sincronizacion.test.sql`, `puntos.test.ts`, `restaurar.test.ts` |
| 07 + 19 | #164, #176 · #196 | `dias_reserva_subida` = 7 frente a la purga; `hidrantes_purgar_subidas`; `fn_proponer` ignora `autor_*` de jefatura y jefatura no ofrece "otra medida"; `fn_proponer` con `lock_timeout` (0013, DEC-084) | `11_reservas_y_alta_jefatura.test.sql`, e2e · jefatura sin "otra medida" |
| 08 | #165 · #197 | reclamar no es enviar; `/api/push` en lotes de 20 con `sin_anotar` y `quedan`; `avisos.yml` cada 15 min; `VIGILANCIA_SECRETO`; el panel y el móvil piden el envío al momento (0014, DEC-088) | `12_avisos.test.sql` (con dblink), `push.test.ts`, `panel/cola.test.ts`, `cola.test.ts`, `workflows.test.ts`, `probar-functions.ts` |
| 09 | #166 · #198 | solo el permiso denegado para el GPS; timeout de 60 s; posición antigua con halo atenuado | `posicion.test.ts`, e2e `instalar-y-posicion.spec.ts` |
| 10 | #167 · #199 | el mapa avisa si falta el mapa base, con red y sin ella, con botón y progreso; descarga al volver la red o pasar a wifi; ofrece la versión nueva | `mapabase.test.ts`, e2e `mapa.spec.ts` (dos casos), `controles.spec.ts` |
| 12 | #169 · #200 | fotos con `crossOrigin="anonymous"`; caché solo de 200 y `purgeOnQuotaError` (`config/cache-fotos.ts`) | `config/cache-fotos.test.ts`, e2e `mapa.spec.ts` · foto en modo cors |

Migraciones nuevas: **0012**, **0013**, **0014**, todas con las mismas firmas y comprobadas por
`npm run compatibilidad` en `ci-sql`. Decisiones: DEC-082 a DEC-085 y DEC-088 (DEC-086 y DEC-087 se
reservan para RV-14 y RV-20, como propone 17).

## 2. Cómo se comprobó

- CI completa (`ci-calidad`, `ci-sql`, `ci-e2e`) en verde en cada PR antes de fusionar, y staging
  desplegado solo tras cada fusión (`deploy-staging.yml` en verde, migraciones incluidas).
- En local, antes de cada PR: `typecheck`, `lint`, `prettier`, vitest completo (1.241 al cerrar el
  bloque) y los e2e del área tocada con Chrome (`PW_CANAL=chrome`). El único rojo local recurrente
  es `rendimiento.spec.ts` con cuatro *workers*, que es RV-27 (P2).
- Staging se ha comprobado solo hasta la entrada: los cambios visibles (avisos del mapa base,
  "Sin guardar en el móvil", "Reintentar") exigen el código del grupo, que no tengo. Se ven en el
  piloto.

## 3. Qué queda

- **Paso manual del desarrollador (≈ 5 minutos, una vez):** `npm run arranque -- --rotar vigilancia`.
  Crea `VIGILANCIA_SECRETO` en los dos proyectos de Pages y `VIGILANCIA_SECRETO_{PROD,STAGING}` en el
  repositorio. Hasta entonces `avisos.yml` termina con un aviso amarillo, no en rojo (96 correos al
  día no ayudan a nadie), y los avisos salen igualmente al moderar y al sincronizar.
- Tras ese paso: ver `avisos.yml` en verde en staging con un aviso real entregado (checklist de 17
  §13).
- RV-12: comprobar sobre una foto **real** de staging que Storage devuelve
  `access-control-allow-origin` (la pasarela lo devuelve en la respuesta de un objeto inexistente;
  no había ninguna foto real accesible sin credenciales).
- RV-11: la documentación de GitHub confirma la regla de 60 días pero no dice expresamente que
  habilitar por API reinicie el contador (DEC-085). La vigilancia avisa si un workflow se desactiva.
- Después: el piloto (#77) y el bloque P1 (RV-13 a RV-26).

## 4. Suposiciones tomadas

- RV-05: "hoy" es la fecha local del móvil; puede diferir un día de la del servidor alrededor de
  medianoche (DEC-082).
- RV-06: un móvil sin fecha de la última completa (instalado antes de este cambio) empieza a contar
  la semana con la siguiente sincronización, para no forzar a todos a la vez.
- RV-08: un aviso cuyo resultado no se pudo anotar puede llegar dos veces; se prefiere a perderlo.
- RV-09: 06 no tiene token de "atenuado"; el halo de una posición antigua usa la mitad de opacidad.
