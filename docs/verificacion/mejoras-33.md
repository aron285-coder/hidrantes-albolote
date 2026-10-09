# Verificación · Mejoras elegidas, defectos y la entrada del lanzamiento (docs/33)

**Estado:** en curso (oct 2026). Especificación: `docs/33-mejoras-y-defectos.md`; mockups:
`docs/mockups/33-mejoras.html`. Cuatro sesiones (Backend, Frontend-campo, Frontend-panel, Ops) en tres
oleadas, coordinadas en #580. Decisiones: DEC-190, DEC-191 y DEC-192 (en la especificación figuran como
DEC-187 a DEC-189). El detalle de cada punto (pruebas, revisión, desviaciones) está en el cuerpo de su PR;
aquí va el resumen. Todo test de un punto con código **falló antes del arreglo** salvo donde se dice lo
contrario.

La señal para fusionar en `develop` («0.10.1 en producción», comentario de cuerpo entero en #580) se dio el 9 oct 2026 a las 10:05 UTC. Ops la esperó comprobando la igualdad del cuerpo entero, no «contiene».

## Backend (oleada 1, migración 0044)

| Punto | PR | Qué | Cómo se ha comprobado |
|---|---|---|---|
| RV-300 | | La entrada del día del lanzamiento | |
| RV-301 | | El tope de espacio mide lo nuestro | |
| RV-302 | | Reservas que se liberan y «token nuevo» por móvil | |
| RV-303 | | `ambito`: tu tope o el del grupo | |
| RV-304 | | Endurecimiento | |
| RV-305 | | Test de permisos de `service_role` | |
| RV-306 | | Errores que hoy pasan sin aviso | |

## Frontend-campo (oleadas 1 y 2)

| Punto | PR | Qué | Capturas antes/después y comparación con el mockup |
|---|---|---|---|
| RV-310 a RV-321 | | U1 a U12 | |
| RV-322 a RV-328 | | N1 a N3, N5, N6, hueco del alta, reservas liberadas | |
| RV-329 | | Mensajes con `ambito` | |

## Frontend-panel (oleadas 1 y 2)

| Punto | PR | Qué | Capturas antes/después y comparación con el mockup |
|---|---|---|---|
| RV-330 a RV-337 | | U13 a U15, D4, D13, D14, N4, marcadores, `docs/06` | |
| RV-338 | | La entrada del lanzamiento en Ajustes | |

## Ops (oleada 1)

| Punto | PR | Qué | Cómo se ha comprobado |
|---|---|---|---|
| — | #581 | `docs/33` (con una nota arriba sobre DEC-190 a DEC-192 y D2 a D4), `docs/mockups/33-mejoras.html`, fila 33 de `INDICE.md`, DEC-190 a DEC-192 y este registro | Solo documentación; copias idénticas a los originales (`cmp`) más la nota. DEC-190 recoge además los detalles de 0044 del contrato de Backend en #580 |
| RV-340 | #590, #597 | `npm run fotos-seed` en «Desplegar staging»: sube las fotos `fotos/prueba-*.jpg` que falten (generadas en Chromium, «[PRUEBA]», sin datos personales) y falla si alguna no da 200. El seed retira como jefatura, con motivo «prueba», BOC-0003 a BOC-0006; si ningún administrador puede, falla (#597, de la revisión) | **Antes:** `fotos-seed --solo-comprobar`, 17 de 17 con 400. **Después:** «Desplegar staging» 37915650407 (`9d9373a`): «4 bocas duplicadas de RV-139b retiradas» y las 17 fotos subidas; `--solo-comprobar` en local: 17 de 17 con 200. `fotos-seed-staging.test.ts` (fallaba antes); paso de ci-sql con las cuatro bocas y una quinta que no se toca |
| RV-341 | #583 | `GPG_HUELLA` pasa de variable del repositorio a constante `env:` de `respaldo.yml`; cambiarla exige un PR | `clave-gpg.test.ts`: no hay `vars.GPG_HUELLA` y la constante es la huella de `docs/entornos.md` y de `docs/15` §2 (los dos tests fallaban antes). La variable del repositorio queda sin uso |
| RV-342 | #PR_342 | `docs/01` v1.13 (FR-33, FR-34, FR-91, FR-140, FR-142, FR-143), `03` TR-41, `09` (F9.10), `13` (la entrada, parámetros, Salud), `14` (Mis propuestas, capas), `15` §5.4 y el lanzamiento | Con lo que de verdad hacen 0044 (#592), #593 (Mis propuestas) y los PR del panel y de campo, leídos en #580 y en sus cuerpos |

## Ops (oleada 3)

| Punto | PR | Qué | Cómo se ha comprobado |
|---|---|---|---|
| RV-343 | | RV-139b sobre el commit nuevo, con 25 canjes desde una IP | |
| RV-344 | | Recorrido corto de lo cambiado | |
| RV-345 | | 0.11.0 en producción | |

## Desviaciones de la especificación

- Las decisiones de §0.1 se numeran DEC-190 a DEC-192 (DEC-187 a DEC-189 ya existían).
- D2, D3 y D4 ya estaban arreglados en `develop` (#576, #574, #575 y #577): RV-321, RV-316 y RV-330
  parten de ahí.

## Lo que queda abierto

<!-- Qué y en qué issue. -->
