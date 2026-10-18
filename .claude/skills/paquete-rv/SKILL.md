---
name: paquete-rv
description: Ciclo completo de un paquete de puntos RV/GM de una especificación docs/NN de este repositorio, desde la rama hasta la fusión automática. Úsala al empezar cualquier paquete de una especificación de cambios.
---

# Paquete RV

> **Hasta el piloto (DEC-193)** no hay especificaciones nuevas, salvo las excepciones que diga CLAUDE.md §5 (hoy, `docs/41`, DEC-228). Un arreglo suelto (`bloquea-release` o `piloto`)
> sigue los mismos pasos sin issue de coordinación: el paso 1 es leer la issue, y en el 10 basta con `Closes #N`.

1. Lee en la especificación los puntos del paquete y los documentos que citan. Comprueba en la issue
   «Coordinación docs/NN» que sus dependencias ya están en `develop`; si no, pasa a otro paquete.
2. `git switch -c fase-N/<sesión>-<paquete> origin/develop`.
3. Por cada punto: escribe **primero** el test de regresión y comprueba que **falla** sobre
   `develop`. Anota el nombre del test.
4. Arregla. Actualiza antes los documentos propietarios (05 antes que el código; textos en
   `src/lib/textos.ts` y en el Apéndice A de 06; decisiones en 12 con los números de tu sesión).
5. Pruebas locales: `npx vitest related <archivos>`, `npx playwright test <specs>` con tu
   `PW_PUERTO`, y `npm run test:sql` si eres Backend. Una vez antes del PR:
   `npm run typecheck && npm run lint && npm test`.
   - En Windows, `npm.cmd` y `npx.cmd` si PowerShell bloquea `npm.ps1`. Los e2e en local con
     `PW_CANAL=chrome` si el Chromium de Playwright no arranca.
6. Si el paquete toca pantallas, usa la skill `revisar-pantallas`.
7. Revisión: `pr-review-toolkit` y luego `code-review`. Resuelve o explica cada hallazgo.
8. PR a `develop` con la plantilla: por cada punto, su test y "falló antes del arreglo: sí".
   El título del PR (con `--squash`, el del commit) de un `feat`/`fix` es una frase para un voluntario o para jefatura,
   **sin** códigos; el código, en el cuerpo: `gh pr merge --auto --squash --body "Refs: docs/NN RV-nnn"` (DEC-225).
   Un arreglo de seguridad: su texto completo entra cuando producción sirve el arreglo; el PR enlaza el `deploy-prod`
   en verde y la salida de `comprobar-produccion` (DEC-226).
   `gh pr merge --auto --squash`. No esperes al CI: empieza el siguiente paquete.
9. Si el CI falla, arréglalo en esa rama antes de otra cosa.
10. Al fusionar, marca la casilla en la issue de coordinación con una línea: qué entró y qué PR.
    En la descripción del PR, `Closes #N` (en inglés: es la palabra clave de GitHub). Las casillas de
    la issue de coordinación se marcan a mano.
11. Si con este paquete se cierra la especificación (verificación escrita y release en producción), en ese PR:
    `git mv docs/NN-*.md docs/archivo/especificaciones/` y su fila en la tabla de `docs/INDICE.md` (DEC-195).
    `scripts/enlaces-docs.test.ts` dirá si queda algún enlace roto.
