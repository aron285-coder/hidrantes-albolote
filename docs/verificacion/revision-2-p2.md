# Verificación · Segunda revisión (23 sep 2026) · bloque C (P2, calidad)

**Estado: hecho el 24 sep 2026.** Especificación: `docs/18-cambios-revision-2-y-mapa.md` §3
(RV-49 a RV-51). Los bloques A, B y D están en `revision-2-p0.md`, `revision-2-p1.md` y
`mapa-emergencias.md`.

## 1. Qué se ha hecho

| RV | Issue · PR | Qué | Cómo se vio fallar antes |
|---|---|---|---|
| 49 | #235 · #268 | Las esperas que fallaban con cuatro workers, sin subir timeouts globales. **panel-ajustes:** la llamada se lee con `expect.poll`. **mapa y medir:** el marcador se mide cuando el mapa ha dejado de volver a pintarlo. **operaciones:** una prueba por operación, y el toque al mapa del selector se repite hasta que el pin se mueve. **instalar-y-posicion:** el fix del GPS lo manda el test. **controles:** los nombres se leen de una vez; la carga de cada pantalla tiene 15 s; solo el recorrido del inventario lleva `test.slow()`. **accesibilidad:** una prueba por pantalla de emergencias | `--repeat-each=5 --workers=4` en un runner de GitHub sobre `develop`: 1 fallo (el recorrido del inventario, por tiempo). En este equipo, dos tandas con 12 y 37 fallos, todos esperas o timeouts |
| 50 | #236 · #267 | La regla de textos: el patrón de tres palabras nunca había funcionado (`'\S'` en una cadena normal) y ahora va con `String.raw`. Lo que no es texto de interfaz, fuera con su motivo (DEC-095). `MODULOS_SIN_UI` con lista explícita. La geometría en las siete pantallas del panel y la variante por la clase. `probar-restauracion` ya no confirma por la entrada | `eslint.test.ts` con el `eslint.config.js` de `develop`: 3 rojos de 11 |
| 51 | #237 · #261 | `revision-p1.md`, `revision-p2.md` y 09 §8 al día; AC-140 con sus omisiones reales | revisión de los documentos |

- **Decisiones:** DEC-095.
- **Migraciones:** ninguna.

## 2. Criterio de salida (18 §6)

> `npm run e2e` en verde; con `--repeat-each=5 --workers=4`, sin fallos (RV-49).

**Resultado:** cumplido, en un runner de GitHub (`ubuntu-latest`, 4 núcleos) con
`npx playwright test --project=movil --project=escritorio --grep-invert @rendimiento --repeat-each=5 --workers=4 --retries=0`:

| Código | Resultado |
|---|---|
| `develop` antes de RV-49 (rama desechable `prueba/rv-49-estres-develop`, run 35986054406) | 1 fallido, 1.524 pasados, 195 omitidos, 27,2 min |
| RV-49 (rama desechable `prueba/rv-49-estres`, run 35986051286) | **0 fallidos**, 1.605 pasados, 195 omitidos, 28,0 min |

Los omitidos son los que no tocan a cada proyecto (el panel en el móvil, los recorridos de la app en
escritorio). Hay más pasados con RV-49 porque la prueba de las cinco operaciones y la de las pantallas
de emergencias se partieron en varias.

## 3. Cómo reproducirlo

```
npx playwright test --project=movil --project=escritorio --grep-invert @rendimiento --repeat-each=5 --workers=4 --retries=0
npx vitest run scripts/eslint.test.ts
```

## 4. Suposiciones tomadas

- **Dónde se mide RV-49:** en un runner de GitHub y no en este equipo.
  - Aquí la misma tanda tardó 56 min una vez y 1,9 h otra.
  - En la segunda, hasta una sola auditoría de axe pasaba del minuto: el equipo iba ahogado, y los fallos eran de la máquina, no de las pruebas.
  - El runner es lo que usa la CI y da el mismo tiempo cada vez.
- **`test.slow()` en el recorrido del inventario:**
  - son unos sesenta controles, y cada uno recarga la pantalla, así que tarda unos 50 s a solas;
  - no es un timeout global, y la alternativa sería dejar de comprobar controles.
- **Las dos pruebas que se partieron** comprueban lo mismo que antes, una operación o una pantalla por prueba.

## 5. Lo que queda abierto

Nada de este bloque. Con A, B, C y D hechos, lo que queda de `docs/18` es §5, que espera una
decisión del desarrollador.
