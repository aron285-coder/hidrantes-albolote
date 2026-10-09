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
| RV-300 | #592 (`0044`) | La entrada del día del lanzamiento: los dos topes en Ajustes (5–500 y 10–500), `fn_abrir_entrada` (máx. 72 h) y `fn_cerrar_entrada`, se abre sola 24 h al cambiar el código revocando; con la entrada abierta, topes `greatest(valor, 200)`; Salud con `entradas_frenadas_24h` y `entrada_abierta_hasta`; vigilancia con > 5 frenadas | pgTAP 41 (68 casos, todos los de la spec); el grant de `cron.job_run_details` dado en dev y prod (DEC-185) |
| RV-301 | #592 | El tope de la base mide el esquema `hidrantes`; el total del proyecto solo avisa (80 % de 500 MB, con desglose); tarea diaria que borra el historial de pg_cron de hidrantes (10 días, no 7); `SIN_ESPACIO` con `reintentar_en_s` | pgTAP 41, 05 y 37; vigilancia en `workflows.test.ts`. El Storage de todo el proyecto no se vigila (DEC-190) |
| RV-302 | #592 | `fn_liberar_reservas(rutas)`; «token nuevo» por la primera vez que se vio el `dispositivo_id` | pgTAP 41 y 02 (el veterano recibía `CUOTA_PROPUESTAS_AGOTADA`) |
| RV-303 | #589 | `ambito` (`dispositivo`, `grupo`, `token_nuevo`) en el 429 de `/api/url-subida` | Tests de `url-subida` |
| RV-304 | #589, #592 | `/api/push`: 30 llamadas por token y hora; el tope global de propuestas sin candado de toda la transacción | Tests de `/api/push`; pgTAP 34 y 41 |
| RV-305 | #589 | `scripts/rpc-de-servicio.ts` y pgTAP 40: cada RPC llamada con `service_role` tiene `execute`; la CI falla si el pgTAP no coincide con lo que encuentra el script | Habría detectado D1 (#561) |
| RV-306 | #592, #595 | `fn_registrar_error` de 5 argumentos sin `anon` ni `authenticated` (antes de la semana prevista: el acceso real no está abierto); la app manda los errores solo por `/api/error`. Contar el fallo en `SIN_RESPUESTA` ya lo hacía 0040 | pgTAP 34; `errores.test.ts` |

## Frontend-campo (oleadas 1 y 2)

| Punto | PR | Qué | Capturas antes/después y comparación con el mockup |
|---|---|---|---|
| RV-310 a RV-321 | #601 (U1), #607 (U2, N3), #610 (U3, D5), #614 (U4), #605 y #609 (U5), #593 y #609 (U6), #603 y #609 (U7, D3, D8, D9), #615 (U8, D11), #616 (U9, D7), #617 (U10), #606 (U11), #619 (U12, D6a, D6b) | U1 a U12 | Capturas antes/después a 412 y 1440 px, claro y oscuro, en cada PR (`docs/capturas/mejoras-33/`), comparadas con el mockup; las desviaciones, en DEC-192 |
| RV-322 a RV-328 | #603 (N1), #587 (N2), #607 (N3), #585 (N5, N6: 26 MP), RV-327 (ver abajo), #586 (reservas liberadas) | N1 a N3, N5, N6, hueco del alta, reservas liberadas | e2e y unitarios en cada PR |
| RV-329 | #582 | «Has llegado a tu máximo…» / «El grupo ha llegado al máximo…» en la cola y en Mis propuestas | Unitarios |

## Frontend-panel (oleadas 1 y 2)

| Punto | PR | Qué | Capturas antes/después y comparación con el mockup |
|---|---|---|---|
| RV-330 a RV-337 | #591 (U15, D4), #604 y #608 (U14), #599 (D13, N4), #600 (D14), #598 (U13), #612 y #618 (marcadores, cortes de 800 y 1100 px, `docs/06` v1.28) | U13 a U15, D4, D13, D14, N4, marcadores, `docs/06` | Capturas antes/después en cada PR; a 720 × 450 se ven 4 propuestas (antes 2) |
| RV-338 | #611 | Sección «Entrada» en Ajustes → Código de acceso; aviso al revocar; los dos topes en Parámetros; «Entradas frenadas por el tope (24 h)» en Salud | 8 de 9 e2e fallaban antes; `salud.test.ts`, `ajustes.test.ts` |

## Ops (oleada 1)

| Punto | PR | Qué | Cómo se ha comprobado |
|---|---|---|---|
| — | #581 | `docs/33` (con una nota arriba sobre DEC-190 a DEC-192 y D2 a D4), `docs/mockups/33-mejoras.html`, fila 33 de `INDICE.md`, DEC-190 a DEC-192 y este registro | Solo documentación; copias idénticas a los originales (`cmp`) más la nota. DEC-190 recoge además los detalles de 0044 del contrato de Backend en #580 |
| RV-340 | #590, #597 | `npm run fotos-seed` en «Desplegar staging»: sube las fotos `fotos/prueba-*.jpg` que falten (generadas en Chromium, «[PRUEBA]», sin datos personales) y falla si alguna no da 200. El seed retira como jefatura, con motivo «prueba», BOC-0003 a BOC-0006; si ningún administrador puede, falla (#597, de la revisión) | **Antes:** `fotos-seed --solo-comprobar`, 17 de 17 con 400. **Después:** «Desplegar staging» 37915650407 (`9d9373a`): «4 bocas duplicadas de RV-139b retiradas» y las 17 fotos subidas; `--solo-comprobar` en local: 17 de 17 con 200. `fotos-seed-staging.test.ts` (fallaba antes); paso de ci-sql con las cuatro bocas y una quinta que no se toca |
| RV-341 | #583 | `GPG_HUELLA` pasa de variable del repositorio a constante `env:` de `respaldo.yml`; cambiarla exige un PR | `clave-gpg.test.ts`: no hay `vars.GPG_HUELLA` y la constante es la huella de `docs/entornos.md` y de `docs/15` §2 (los dos tests fallaban antes). La variable del repositorio queda sin uso |
| RV-342 | #602 | `docs/01` v1.13 (FR-33, FR-34, FR-91, FR-140, FR-142, FR-143), `03` TR-41, `09` (F9.10), `13` (la entrada, parámetros, Salud), `14` (Mis propuestas, capas), `15` §5.4 y el lanzamiento | Con lo que de verdad hacen 0044 (#592), #593 (Mis propuestas) y los PR del panel y de campo, leídos en #580 y en sus cuerpos |

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
