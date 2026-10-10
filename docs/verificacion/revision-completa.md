# Verificación · Revisión completa: producción protegida, release y defectos (docs/31)

**Estado:** todo el código en `develop` y en staging (8 oct 2026). La comprobación en staging
(RV-139b) está en `revision-completa-staging.md`, y la release 0.9.0 en `paridad-produccion.md`.
La segunda copia en R2 (RV-133) queda **aplazada** por decisión del desarrollador (DEC-173).
Especificación: `docs/archivo/especificaciones/31-revision-completa.md`. Cuatro sesiones con subagentes, coordinadas en #484.
El detalle de cada punto (pruebas, revisión, desviaciones) está en el cuerpo de su PR.

## Ops

| Punto | PR | Qué |
|---|---|---|
| RV-130 | #518 | La vigilancia detecta despliegues del proyecto de producción que no vienen de `deploy-prod` (issue y push); staging con nombre de proyecto fijo; `ENTORNO` en las Functions de los dos proyectos (DEC-172) |
| RV-131 | #493, #511 | Environment `prod-tareas` (solo `develop`); secretos movidos con `npm run traspasar-secreto` sin ver ningún valor; cada tarea comprobada desde ahí **antes** de borrar los del repositorio; ningún `*_PROD` en el repositorio |
| RV-132 | #486 | Actions de terceros fijadas por SHA; Dependabot con 7 días de espera y fusión automática solo de parches de desarrollo, comprobando el autor del PR |
| RV-133 | — | **Aplazado (DEC-173).** Código listo en `fase-9/ops-rv133`; R2 pide medio de pago |
| RV-134 | #510 | Guarda de entorno compartida (`produccion` = `prod`); copia previa cifrada antes de restaurar; prueba semanal de restauración en un Postgres desechable (run 37683933380). #439 cerrada |
| RV-135 | #485, #506 | `main` reconciliada con `develop` (`-s ours`, merge commit); comprobación en `ci-calidad` para los PR a `main` (DEC-176) |
| RV-136 | #494, #529 | Deploy de producción fallido o cancelado → issue; guarda de `VITE_*`, anon key y variables de las Functions (`SAL_IP`) |
| RV-137 | #507, #526 | `despachador.yml` lanza lo que pide el panel, sin token de GitHub en Pages |
| RV-138 | #502 | Las consultas de la vigilancia que fallan, fallan; `mantener-activo` cierra su issue |
| RV-139 | #488 y este cierre | Spec en el repo; 09, índice, CLAUDE.md; conformidad en una línea (DEC-177); manuales 13 y 14 en borrador; Fase 9 ordenada (#76–#79, #81, #84, #85 con `organizacion`) |
| RV-142 (purga) | #521 | El freno del 10 % no cuenta las reservas nunca confirmadas de más de 48 h |
| RV-139c | — | `npm run publicar` y la release 0.9.0: ver `paridad-produccion.md` |

- **Hallazgo:** producción seguía en **0.7.0**, no en 0.8.0: el despliegue de 0.8.0 esperó aprobación y se canceló el 4 oct. La 0.9.0 lleva todo desde 0.8.0, con las migraciones 0036 a 0040.
- **Desviaciones:** traspaso con RSA-OAEP en lugar de `age` (no está ni en el PC ni en el runner); la comprobación de `main` compara árboles en lugar de exigir ancestro (con merge commit nunca lo es); la guarda acepta claves `sb_publishable_…`.

## Backend

| Punto | PR | Qué |
|---|---|---|
| RV-140 a RV-143 (SQL) | #498 · `0039` | Límites de texto; 60 propuestas al día; 400 subidas al día entre todos y reservas protegidas 48 h; `DISPOSITIVO_RESERVADO` (DEC-174, DEC-175). También la dirección vacía en las correcciones (RV-162) |
| RV-145 a RV-148, RV-158 (SQL) | #508 · `0040` | Retirado sigue retirado; `pedidos_trabajo`; purga del alta y sus fotos; `fn_reportar_incidencia` sin `anon`; tope de errores por IP; `fn_cerrar_sesion`; `fn_novedades` sin `authenticated` |
| RV-149 | #499 | pgTAP con la lista exacta de funciones de `authenticated` y `NO_AUTORIZADO` sin sesión de administrador. Encontró `fn_novedades` abierta |
| RV-143, RV-144, RV-146 | #492, #489, #491 | Functions: 409 `DISPOSITIVO_RESERVADO`; push con fallo de red que se reintenta (y claves VAPID rotas que ya no borran suscripciones); `lanzar-workflow` sin token de GitHub |
| — | #519, #525 | `guardada` en `/api/direccion`; `POST /api/error` con el hash de la IP |

- pgTAP 34 (permisos), 35 (49 casos) y 36 (51 casos), cada uno en rojo sin su migración. `npm run compatibilidad` en verde en ci-sql.
- **Para más adelante:** quitar `anon` de la `fn_registrar_error` de 5 argumentos cuando no quede la app anterior; contar un fallo cuando un aviso llega a `SIN_RESPUESTA`.

## Frontend-campo

| Punto | PR | Qué |
|---|---|---|
| RV-150 a RV-152 | #501 | Selector de pin con mapa base sin conexión; Enviar no espera a la cola; el formulario no salta al mapa |
| RV-153 | #490 | Al cerrar sesión no quedan las propuestas del anterior |
| RV-154, RV-156 | #500 | Mensajes de los topes; cola atómica y una reserva por foto |
| RV-155 | #487 | `src/lib/limites.ts` y `maxLength` |
| RV-157 | #509, #515, #528 | Fotos grandes sin cerrar la pestaña, «Repetir» con su estado, avisos con formulario abierto, lector de pantalla, 44 px, pin gris sin colocar |
| RV-157b | #503 | Dibujo de Directo (DEC-178) |
| RV-158, RV-159 | #523, #517 | Cerrar sesión revoca el token; reintento con id nuevo |
| — | #522, #524 | Estado de la pantalla de resultado al día; errores por `/api/error` |

## Frontend-panel

| Punto | PR | Qué |
|---|---|---|
| RV-160 a RV-163 | #505, #527 | Diálogos sin robar el foco y foco de vuelta; Cola que no salta; aprobar sin correcciones falsas; historial de la Cola en el móvil |
| RV-164, RV-166, RV-168 (CSV) | #495 | Dirección de la celda; Registro desde otra página; CSV sin fórmulas |
| RV-165 | #504 | Editar al día |
| RV-167 | #512, #520 | Radios, push de jefatura sin matar el del voluntario, cargas con Reintentar, botones de staging |
| RV-168, RV-169 | #514, #513, #527 | `maxLength`; `--fila-elegida` en oscuro forzado |
| — | #516 | `docs/06` v1.24 |

## Lo que queda

- **Ops, tras 0.9.0 en producción:** borrar `GITHUB_DISPATCH_TOKEN` de los dos proyectos de Pages y actualizar `docs/04` §10, `docs/15` y `arranque.ts`.
- **Canario de Ubuntu 26:** si la pasada del 14 oct sale en verde, el PR que pasa los trabajos a `ubuntu-26.04` (DEC-128).
- **CI:** el paso de instalar navegadores de Playwright se queda a veces 20 min y se cancela (espejo de Ubuntu lento); hizo falta relanzar varios PR.
- **RV-133:** aplazado (DEC-173).
