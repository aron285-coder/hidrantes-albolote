# Verificación · Paridad de producción con develop (docs/19 bloque P)
| 25 sep 2026, 06:04 UTC | `387c469` (merge commit de #351) | 0.6.3 (`docs/20`) | ninguna nueva: las 29 con su hash | **todo en verde**: árbol igual que el develop fusionado (`6712a63`), commit servido `387c469`, las 29 migraciones, `/api/push` y `/api/geocodificar` con 401, y las versiones de datos. Además, `comprobar-despliegue` vio una tesela del mapa base (MVT) y el `.pmtiles` entero | 36065099327 |

**Estado: hecho el 24 sep 2026.** Especificación: `docs/19-paridad-avisos-y-revision-3.md` §1 (P-01
a P-04) y DEC-096. Cada vez que se repita P-02 se añade aquí una entrada al registro (§2).

## 1. Qué se ha hecho

| P | Issue · PR | Qué |
|---|---|---|
| 01 | #269 · #293, #312, #321 | `npm run comprobar-produccion` y `comprobar-produccion.yml`: lo que la versión necesita en producción, sin valores. La fila «Workers Scripts: Edit» (#312) avisa sin parar el PR (#321) |
| 02 | #270 · #296 | PR `develop → main` con *merge commit*, aprobado por el desarrollador en el PR y en el *environment* `production` |
| 03 | #271 · #294 | `scripts/paridad.ts` tras cada despliegue de producción, y la vigilancia avisa si `main` lleva más de 7 días por detrás. Tras el primer despliegue, las Functions se esperan como el HTML (§3) |
| 04 | #272 · #292 | DEC-096, `CLAUDE.md` §5, 04 §4 y la issue #79 |

## 2. Registro de despliegues de producción

| Fecha | Commit | Versión | Migraciones aplicadas | Paridad | Run |
|---|---|---|---|---|---|
| 24 sep 2026, 16:35 UTC | `42988df` (#296, fusionado con squash: ver abajo) | 0.6.1 | 20, de 0010 a 0029, todas en el primer intento | árbol, commit servido, migraciones con su hash, `/api/push` (401), `version_mapabase = 20260919` y `version_callejero = 20260923`, bien. `/api/geocodificar` dio 405 al comprobar y 401 minutos después (§3) | 36027754885 |

`comprobar-despliegue` dio la versión 0.6.1 y las cabeceras de TR-100 en producción.

## 3. El 405 de `/api/geocodificar` en el primer despliegue

- **Qué pasó:** «Paridad con develop» se paró con «POST /api/geocodificar sin credenciales da 405, no 401».
  - Pages ya servía el HTML del commit nuevo, pero la edge aún respondía con las Functions del despliegue anterior. La versión de la Fase 0 no tenía `/api/geocodificar`, y un POST a una ruta sin Function da 405.
  - **Comprobado a mano a las 16:55 UTC,** con solo lectura y sin credenciales: `POST /api/push` y `POST /api/geocodificar` dan 401 en producción, y la página sirve `<meta name="commit" content="42988df…">`.
- **Arreglo** (#324): `estadoTrasPropagar` repite cada comprobación de las Functions hasta 6 veces cada 10 s, como ya se hacía con el commit servido. El test reproduce 405, 405 y 401.
- **Para cerrar P-03 con el paso en verde** no hace falta desplegar otra vez: el próximo PR `develop → main` lo correrá con el arreglo.

## 3b. #296 se fusionó con squash (P-10, 25 sep 2026)

- **Qué pasó:** `42988df` tiene un solo padre. `main` y `develop` no compartían historia desde la Fase 0, y #351 (`develop → main`) daba conflicto en cada archivo. La paridad de aquel despliegue sí pasó el árbol: sin `HEAD^2`, comparó con origin/develop.
- **Arreglo:** #352 fusionó `main` en `develop` con `-s ours` y con merge commit. El árbol de `42988df` era idéntico al de `4854be9` de develop, así que no se perdió nada. Después, #351 se fusionó con merge commit.
- **Para la próxima vez:** los PR `develop → main` se fusionan con **merge commit** (DEC-096). Si uno se fusiona con squash, se repite #352.

## 4. El Worker de los avisos en producción

Tras el despliegue, producción tiene `/api/push` y el secreto de vigilancia del 24 sep 2026. Antes, el Worker anotaba `hidrantes-albolote.pages.dev · fallo`, por ejemplo a las 14:30:59 UTC.

Con `wrangler tail` a la ejecución programada de las **17:00:59 UTC**: `outcome: ok`, sin ningún aviso anotado. Los dos destinos, producción y staging, respondieron bien.

## 5. Lo que queda

- ~~Ampliar el token de Cloudflare con *Account · Workers Scripts · Edit* (#273).~~ Hecho el 24 sep 2026.
- **Entregar un aviso real en staging**, y anotar la hora (19 §7).
