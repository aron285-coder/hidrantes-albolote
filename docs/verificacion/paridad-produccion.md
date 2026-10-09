# Verificación · Paridad de producción con develop (docs/19 bloque P)

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
| 25 sep 2026, 06:04 UTC | `387c469` (merge commit de #351) | 0.6.3 (`docs/20`) | ninguna nueva: las 29 con su hash | **todo en verde**: árbol igual que el develop fusionado (`6712a63`), commit servido `387c469`, las 29 migraciones, `/api/push` y `/api/geocodificar` con 401, y las versiones de datos. Además, `comprobar-despliegue` vio una tesela del mapa base (MVT) y el `.pmtiles` entero | 36065099327 |
| 25 sep 2026, 15:18 UTC | `880b6e7` (merge commit de #390) | 0.6.4 (`docs/21` y `docs/22`) | 2: `0030_suscripciones_por_duenio` y `0031_salud_tareas_en_vivo` | **todo en verde**: árbol igual que el develop fusionado (`dfa1a64`), commit servido `880b6e7`, las 31 migraciones, las Functions y las versiones de datos | 36141770642 |
| 25 sep 2026, 20:28 UTC | `b7145b4` (merge commit de #403) | 0.6.5 (`docs/23`) | ninguna nueva: las 31 con su hash | **todo en verde**: árbol igual que el develop fusionado (`65c6143`), commit servido `b7145b4`, migraciones, Functions y versiones de datos. El código servido lleva Novedades con su número: `0.6.5 · Las novedades enseñan lo último de cada versión…`, y dos de la `0.6.4` sobre los avisos (RV-95) | 36184349766 |
| 4 oct 2026, 06:36 UTC | `c378291` (merge commit de #434) | 0.7.0 (`docs/24`) | 4, en orden y cada una en su transacción: `0032_diametro_bocas`, `0033_estado_barro`, `0034_estado_barro_uso` y `0035_foto_del_sitio` | **todo en verde**: árbol igual que el develop fusionado (`7864e87`), commit servido `c378291`, las 35 migraciones, las Functions y las versiones de datos. Después, una purga en ensayo (run 37183337683): 0 fotos en el bucket, nada que borrar, y `fn_fotos_referenciadas_lista` responde con 0035 | 37155680542 |
| 4 oct 2026, 07:02 UTC | `fb310b5` (#438, **fusionado con squash**: ver §3c) | 0.8.0 (los racores Granada y Barcelona) | **ninguna: no se desplegó.** La ejecución esperó la aprobación del *environment* `production` y se canceló a las 11:49 UTC sin aprobar | sin paridad: producción siguió en 0.7.0 (`c378291`), comprobado el 7 oct con `<meta name="commit">` y `<meta name="version">` | 37184600515 (cancelada) |
| 8 oct 2026, 09:13 UTC | `6ee856e` (merge commit de #548) | 0.9.0 (`docs/25` a `docs/32`; lleva también lo de 0.8.0, que no llegó a desplegarse) | 6: `0036` a `0041`, por `deploy-prod` | **todo en verde**: `npm run publicar` (DEC-176) aprobó con la puerta automática (CI de `main`, RV-139b en verde con `1117c8d` y después solo documentación y versión, `comprobar-produccion --completo` y ninguna `bloquea-release`); `deploy-prod` con la paridad y `comprobar-produccion` después; producción sirve `0.9.0` y el commit `6ee856e` | 37753743549 |
| 9 oct 2026, 07:11 UTC | `436f25a` (merge commit de #568) | 0.10.0 (`docs/32` entero y el arreglo de #561) | 2: `0042` y `0043` | **todo en verde**: `npm run publicar` (DEC-176) con la puerta automática (CI de `main`; RV-139b en verde con `aba8754`, CI, deploy de staging y lo que sirve staging; `comprobar-produccion --completo`; ninguna `bloquea-release`). La primera pasada la rechazó la puerta (#569): la CI del push de `aba8754` había fallado al instalar los navegadores (arreglado en #570); relanzada en verde, se relanzó el deploy. Producción sirve `0.10.0` y el commit `436f25a` | 37895425813 |
| 9 oct 2026, 10:02 UTC | `71abc6b` (merge commit de #588) | 0.10.1 (arreglos de #562, #563 y #564; `publicar` reintenta la fusión, #573) | ninguna | **todo en verde**: `npm run publicar` aprobó con la puerta automática (CI de `main`, RV-139b en verde con `ad105f0` y después solo documentación y versión, `comprobar-produccion --completo`, ninguna `bloquea-release`); producción sirve `0.10.1` y el commit `71abc6b`. La CI del PR de versión falló antes una vez en la instalación de navegadores (espejo de Ubuntu) y se relanzó | 37913915437 |

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

## 3c. 0.8.0 se fusionó con squash y no llegó a producción (docs/31 RV-135, 7 oct 2026)

- **Qué pasó:** #438 se fusionó con squash, como #296: `fb310b5` tiene un solo padre. `main` dejó de estar en la historia de `develop` (merge-base `7864e87`, 0.7.0). Además, su `deploy-prod` se canceló esperando la aprobación: producción sigue en 0.7.0.
- **Arreglo:** #485 fusionó `main` en `develop` con `-s ours` y con merge commit. El árbol de `fb310b5` era idéntico al de `49278aa` de `develop`, así que no se perdió nada.
- **Para que no vuelva a pasar:** `ci-calidad`, en los PR a `main`, falla si `main` tiene cambios fuera de la historia de la rama (`.github/scripts/main-en-la-rama.sh`). No exige que la punta de `main` sea ancestro: con merge commit no lo es, pero su árbol es el del merge-base. Y vigilancia avisa si el último `deploy-prod` no terminó bien, también si se canceló (RV-136).
- **0.9.0** llevará a producción lo de 0.8.0 y lo de después, con 0036 en adelante (RV-139c).

## 4. El Worker de los avisos en producción

Tras el despliegue, producción tiene `/api/push` y el secreto de vigilancia del 24 sep 2026. Antes, el Worker anotaba `hidrantes-albolote.pages.dev · fallo`, por ejemplo a las 14:30:59 UTC.

Con `wrangler tail` a la ejecución programada de las **17:00:59 UTC**: `outcome: ok`, sin ningún aviso anotado. Los dos destinos, producción y staging, respondieron bien.

## 5. Lo que queda

- ~~Ampliar el token de Cloudflare con *Account · Workers Scripts · Edit* (#273).~~ Hecho el 24 sep 2026.
- **Entregar un aviso real en staging**, y anotar la hora (19 §7).
