# Verificación · Revisión de sep 2026 · bloque P2

**Estado: hecho el 23 sep 2026.** Especificación: `docs/17-cambios-revision-2026-09.md` (RV-27 a
RV-32). Los bloques P0 y P1 están en `revision-p0.md` y `revision-p1.md`. Faltaba este registro: lo
pidió la segunda revisión (`docs/18` RV-51).

## 1. Qué se ha hecho

| RV | Issue · PR | Qué | Tests que lo prueban |
|---|---|---|---|
| 27 | #184 · #213 | Las pruebas de rendimiento (`@rendimiento`) corren aparte y de una en una en `ci-e2e` | paso "E2e de rendimiento, un worker" de `ci.yml` |
| 28 | #185 · #217 | El panel también en Firefox (`panel-firefox`) y la disposición en 390, 768 y 1.280 px, con aserciones de layout (FR-70) | `e2e/anchos.spec.ts`; proyecto `panel-firefox` en `ci-e2e` |
| 29 | #186 · #218 | axe con WCAG 2.2 (`target-size`) y `geometria()`: 44 × 44 px y 8 px entre controles en el móvil; 12 px entre la acción destructiva y la afirmativa en todas las pantallas | `e2e/accesibilidad.spec.ts` |
| 30 | #187 · #216 | Los tests que faltaban: TR-90 (techos de errores), TR-60 (1.000 puntos, 20.000 propuestas, 100.000 filas de registro), FR-55, FR-65 y el recorrido de controles del panel (AC-140) | `18_techos_y_carga.test.sql`; e2e `operaciones.spec.ts`, `mapa.spec.ts` y `controles.spec.ts` |
| 31 | #188 · #215 | La regla ESLint de textos mira también los `.ts` y las palabras sueltas | `scripts/eslint.test.ts` |
| 32 | #189 · #214 | La documentación dice lo que está probado; sin correos fuera de los dominios de ejemplo | `scripts/docs.test.ts` |

## 2. Cómo se comprobó

CI completa en verde en cada PR antes de fusionar. En local, los e2e tocados con Chrome.

## 3. Qué quedó para la segunda revisión

La segunda revisión (`docs/18` RV-50) encontró tres restos:
- `geometria()` no cubría todas las pantallas del panel ni corría en escritorio;
- la regla ESLint daba falsos positivos en atributos no visibles;
- `probar-restauracion.ts` confirmaba también por la entrada.

Se tratan allí.
