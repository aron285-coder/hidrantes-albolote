# Verificación · docs/25 · sesión Frontend-panel (RV-110, pantalla)

Registro de la sesión Frontend-panel de `docs/25`. Ops lo consolida en `lista-ficha-cola.md`.

## RV-110 · Cola de revisión: mapa arriba, datos completos y fotos, a todo el ancho

**Decisiones:** DEC-158 (la pantalla) y DEC-159 (de dónde salen los datos, el radio del círculo de
duplicado y los mapitas). Construido contra el contrato de 0036 (DEC-160): `punto`, `punto_lat` y
`punto_lng` en `v_cola_revision`, y el historial leído de `v_historial_revision`.

| Prueba | Qué comprueba | Falló antes del arreglo |
|---|---|---|
| `src/lib/panel/cola-ficha.test.ts` · `fichaCompleta` | corregir datos: todos los campos, solo el diámetro cambia y va primero; boca con tipo de enganche; fallo solo en «no funciona»; alta con los datos del voluntario marcados y código/revisión «se fija(n) al aprobar»; ubicación con coordenadas y dirección de antes → después; revisión y retirada; sin la columna `punto`, los datos del inventario | sí (no existía) |
| `cola-ficha.test.ts` · `planMapa` | hay mapa en las seis operaciones; ubicación en Satélite con las dos posiciones y la flecha; alta con el círculo de duplicado; sin posición, sin centro | sí |
| `cola-ficha.test.ts` · `fotosDe` | alta: conexión y sitio; ubicación: la actual delante de las dos nuevas; sin nuevas: las actuales | sí |
| `cola-ficha.test.ts` · historial y situación | `v_historial_revision` con pin y punto; decidida, sin «antes» del punto de hoy; punto en la papelera dicho arriba | sí |
| `src/componentes/panel/detalle-propuesta.test.tsx` | los cuatro casos de la especificación (datos con «Cambia» solo en el diámetro, «se asigna al aprobar», tres fotos en una ubicación, «no trae nuevas»), mapa en las seis operaciones, botones fijos con «Corregir», historial sin botones; `MinimapaPropuesta` en Satélite/Mapa, leyenda y «sin posición» | sí |
| `e2e/panel-cola.spec.ts` · «a 1440 px el detalle ocupa todo el ancho…» | lista de 340 px, detalle hasta el borde, mapa = ancho del detalle (±2 px) y 300 px de alto, botones a la vista antes y después de desplazar | sí |
| `e2e/panel-cola.spec.ts` · «a 820 / 412 px … dos pantallas» | mapitas en la lista, detalle a pantalla completa, mapa de 280/200 px, «Corregir» en el móvil, sin desborde, «‹» y «atrás» vuelven, barra de abajo para aprobar en bloque | sí |
| `e2e/panel-cola.spec.ts` · «una ubicación: satélite…» | se abre en Satélite, foto actual + dos nuevas, conmutador y «Abrir en grande» con Escape | sí |
| `e2e/panel-tableta.spec.ts` | a 768 px, dos pantallas, foco en «‹» | sí (antes se apilaban) |

**Capturas:** `e2e/panel-cola.spec.ts` · «captura de la cola» a 412 × 915, 820 × 1180 y 1440 × 900,
en claro y en oscuro (adjuntas al informe de Playwright). Antes y después mirados a ojo.

**Suposiciones (anotadas en DEC-159):** el radio del círculo sale de `config.radio_duplicado_m`
(25 m si no se puede leer); «tocar una foto la amplía» abre la foto entera en otra pestaña; en el
historial el «antes» solo sale si lo trae la propuesta. Los cambios de `docs/01` (FR-102 a FR-105) se
pasan a Ops en la issue de coordinación.
