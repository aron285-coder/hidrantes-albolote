---
name: revisar-pantallas
description: Revisar a ojo las pantallas de la app y del panel antes de fusionar un cambio visible. Úsala en cualquier PR que toque src/** o estilos, y cuando se pida una revisión visual de staging.
---

# Revisar pantallas

1. Ejecuta `npx playwright test e2e/vistas.spec.ts` con tu `PW_PUERTO` (docs/21 RV-88). Genera
   capturas a 412 × 915 (Android) y 1280 × 800, en claro y en oscuro.
   - Si `e2e/vistas.spec.ts` aún no existe (llega con RV-88), saca las mismas capturas con
     `page.screenshot` desde los specs de la pantalla tocada, con los datos simulados de
     `e2e/ayudas.ts`.
2. **Mira cada captura** (léela como imagen) y comprueba:
   - los controles del mapa alineados al borde derecho y nada tapado por la ficha, los avisos o la
     leyenda;
   - "Cercanos" abajo a la derecha, encima del "+", sin solaparse;
   - ningún texto cortado a mitad de palabra ("— pen");
   - listas con estado vacío y textos útiles;
   - en el móvil, al menos tres candidatos de "Cercanos" visibles sin desplazarse.
3. Si hay acceso a staging, repite lo mismo con Playwright contra staging, **solo para leer**: nunca
   aprobar, enviar ni cambiar datos.
4. Adjunta dos o tres capturas representativas al PR y escribe qué has comprobado.
5. Si algo no cuadra, arréglalo en el mismo PR antes de fusionar.
