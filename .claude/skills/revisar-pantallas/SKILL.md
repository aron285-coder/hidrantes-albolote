---
name: revisar-pantallas
description: Revisar a ojo las pantallas de la app y del panel antes de fusionar un cambio visible. Úsala en cualquier PR que toque src/** o estilos, y cuando se pida una revisión visual de staging.
---

# Revisar pantallas

1. Ejecuta `npx playwright test e2e/vistas.spec.ts` con tu `PW_PUERTO` (docs/21 RV-88). Genera
   capturas a 412 × 915 (Android) y 1280 × 800, en claro y en oscuro.
   - Las capturas quedan en `test-results/vistas-*/*.png` y en el informe. En un PR que toca
     `src/**`, el trabajo `ci-vistas` las sube como artefacto `vistas`, que se guarda 90 días
     (`gh run download <id> -n vistas`). No se commitean (DEC-195).
   - Si tocas una pantalla que no está en el spec, añádela a `VISTAS`.
2. **Mira cada captura** (léela como imagen) y comprueba:
   - los controles del mapa alineados al borde derecho y nada tapado por la ficha, los avisos o la
     leyenda;
   - "Cercanos" abajo a la derecha, encima del "+", sin solaparse;
   - ningún texto cortado a mitad de palabra ("— pen");
   - listas con estado vacío y textos útiles;
   - en el móvil, al menos tres candidatos de "Cercanos" visibles sin desplazarse.
3. Si hay acceso a staging, repite lo mismo con Playwright contra staging, **solo para leer**: nunca
   aprobar, enviar ni cambiar datos.
4. Adjunta dos o tres capturas representativas al PR y escribe qué has comprobado. En Git solo entra
   una imagen que enlaza un documento de `docs/` (DEC-195); `scripts/enlaces-docs.test.ts` lo comprueba.
5. Si algo no cuadra, arréglalo en el mismo PR antes de fusionar.

## Recorridos en staging (DEC-184, DEC-195)

- El juego completo de capturas va a `recorridos/AAAA-MM-DD/`, que Git ignora. Nunca a `docs/` entero.
- El informe `docs/verificacion/recorrido-staging-AAAA-MM-DD.md` enlaza solo las capturas que comenta, y solo
  esas se copian a `docs/verificacion/recorrido/AAAA-MM-DD/`. Una imagen sin enlace hace fallar
  `scripts/enlaces-docs.test.ts`.
- Hasta el piloto (DEC-193), lo que se vea y no sea un defecto va como issue `tras-piloto`, no como propuesta.
