# Verificación · Novedades y limpieza (docs/23) · sesión Ops

**Estado: hecho el 25 sep 2026.** Especificación: `docs/23-novedades-y-limpieza.md`, puntos de Ops. Coordinación: #393.

| RV | Issue · PR | Qué | Cómo se vio fallar antes |
|---|---|---|---|
| 96 | #394 · #395 | La plantilla de PR empieza con `Closes #`, con un comentario que explica por qué va en inglés. Lo mismo en la skill `paquete-rv`, en CLAUDE.md §5 y en `docs/trabajo-en-paralelo.md` §5 (DEC-141) | `herramientas.test.ts` (la plantilla decía «Cierra #»). **En vivo:** #394 se cerró sola al fusionar #395 (`stateReason: COMPLETED`), y #398 de Frontend también |
| 97 | #396 · #397 | `release-please.yml` saca un token de la GitHub App del proyecto (`actions/create-github-app-token@v2`) si existe `RELEASE_APP_ID`. Sin ella, reserva con `GITHUB_TOKEN` y el empujón de DEC-079. Pasos exactos en 15 §2, DEC-079 marcada y DEC-140 | `workflows.test.ts`: 3 tests rojos con el workflow de `develop` |

**Issues cerradas** (RV-96, punto 4):
- **#326** (Lighthouse de staging en 0,84). La arregló #327. Hubo un 0,84 aislado más, el 24-09 a las 21:35 UTC, sobre `0eec436`, un commit de documentación. Desde entonces, 26 despliegues de staging seguidos en verde. `docs/23` decía «en verde desde el 24-09», y no era del todo así.
- Las demás abiertas son F9.x (#76–#85), tareas de personas, y no se cierran.

**Pendiente:**
- **RV-97, del desarrollador:** crear la App y guardar `RELEASE_APP_ID` y `RELEASE_APP_KEY` (15 §2, unos 10 minutos). Hasta entonces, cada release sigue necesitando el empujón, y #396 sigue abierta.
- **La comprobación de RV-97** es la primera release con la App: PR de versión con checks y sin runs «expired». Si al cerrar P-13 la App aún no existe: «pendiente del desarrollador».
