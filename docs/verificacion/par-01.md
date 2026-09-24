# Verificación · PAR-01 · CI y puertos para trabajar en paralelo

**Estado: hecho el 24 sep 2026.** Especificación: `docs/trabajo-en-paralelo.md` §9 (DEC-100). Issue #329.

## 1. Qué se ha hecho

| § | PR | Qué |
|---|---|---|
| 9.1 | #330 | `PW_PUERTO` en `playwright.config.ts` y `VITE_PUERTO` en `vite.config.ts`. `armazon.spec.ts` y `acceso.spec.ts` usan `baseURL` en vez de `127.0.0.1:4173` |
| 9.2 | #330 | Trabajo `cambios` (`.github/scripts/hay-codigo.sh`). `ci-e2e-parte` ×3 con `--fully-parallel --shard`, y `ci-e2e-rendimiento`. Navegadores en caché (`.github/actions/navegadores`). Agregador `ci-e2e` con `if: always()`. `ci-sql` y los e2e, saltados en PR solo de documentación |
| 9.3 | #330 | `scripts/workflows.test.ts`: checks obligatorios, agregador, matriz y `--shard`, caché, puerto y `hay_codigo` |
| 9.4 | #330 | `scripts/comprobar-migraciones-nuevas.ts` en `ci-calidad` (solo en `pull_request`), con sus tests |
| 9.5 | #330 | CLAUDE.md §5, `docs/INDICE.md`, 04 §11 y DEC-100 |
| 9.6 | #331 | Segundo PR, solo de `docs/` (`docs/20`). `cambios` dio `codigo=false`, `ci-sql`, `ci-e2e-parte` y `ci-e2e-rendimiento` salieron *skipped*, `ci-e2e` pasó, y GitHub dio el PR como `CLEAN`: se fusionó con la protección de ramas de siempre |

## 2. Duración (API de Actions, reloj de la ejecución, mediana de 5)

| | Antes | Después |
|---|---|---|
| PR de código | **9,3 min**: 36045833106 (10,4), 36036260391 (9,5), 36031847438 (8,1), 36026742896 (8,4), 36025545913 (9,3) | **4,9 min** (291 s): #330 (291 s), #334 (265 s), #336 (330 s), #338 (348 s), #339 (262 s) |
| PR solo de documentación | **8,7 min**: 36035011454 (9,6), 36025689562 (8,3), 36023054633 (8,6), 36016352745 (9,6), 35999307655 (8,7) | **1,1 min** (63 s): run 36052047703 de #331 y cuatro repeticiones (58, 74, 75, 63 y 55 s) |

Los dos objetivos se cumplen: ≤ 5 min con código y ≤ 2 min solo con documentación.

- **Las partes de e2e:** con el reparto por archivo, en el primer intento de #330 una parte tardó 5,5 min y las otras dos 3,7. Con `--fully-parallel`, las tres tardan unos 3,8 min.
- **El margen con código es pequeño** (291 s frente a 300), y dos de las cinco pasan de 5 min (#336 y #338). Si se pierde, lo siguiente es una cuarta parte de e2e.

## 3. Suposiciones

- «Comprobarlo en el propio PR con un commit que solo toque `docs/`» (9.2.5) no se puede hacer: `cambios` mira todo el PR, y el de PAR-01 toca código. La prueba es #331 (DEC-100).
- DEC-099 ya lo había tomado #327. Este documento es DEC-100, y los rangos de §3 se corrieron uno.
