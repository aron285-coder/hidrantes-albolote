# Verificación · Tercera revisión (24 sep 2026) · bloque B (P1, errores)

**Estado: hecho el 24 sep 2026.** Especificación: `docs/19-paridad-avisos-y-revision-3.md` §3
(RV-60 a RV-67). El bloque A está en `revision-3-p0.md` y el C en `revision-3-p2.md`.

## 1. Qué se ha hecho

| RV | Issue · PR | Qué | Cómo se vio fallar antes |
|---|---|---|---|
| 60 | #281 · #319 | En ordenador, "Cercanos" ocupa la columna de la lista, con «Volver a la lista» y «Volver a Cercanos». En tableta es una hoja abajo que, con la ficha abierta, se queda a su izquierda. El encuadre del incidente descuenta la hoja y la ficha, y se rehace al abrir o cerrar la ficha. Con un incidente abierto, elegir un punto no recentra el mapa | `anchos.spec.ts` a 768, 1024 y 1280 px, con el código anterior: «Cercanos y la ficha no se cortan» rojo a 768 y 1024; a 1280, un candidato tapado |
| 61 | #282 · #314 | En el móvil, filas compactas: dos líneas, con la última revisión, y dos botones de icono de 44 px. La hoja tiene dos alturas, 55 % y 90 %, con asa y botón, y se recuerda en la sesión. El aviso del más cercano ocupa una línea | `incidente.spec.ts` (móvil): «la tercera fila termina por encima de la barra» rojo sobre `develop` |
| 62 | #283 · #311 | Un solo "atrás" tras ver una ficha desde Cercanos. La lista ordena desde el incidente de la URL y lo dice. El tramo de jefatura se carga al pasar a jefatura y se vuelve a pintar. Elegir un resultado olvida "Sin posición". La vista no se guarda con `?incidente`, `?aqui` o `?medir` | cuatro e2e y `vista.test.ts` rojos sobre `develop`. La del tramo de jefatura pasaba también antes, por un repintado posterior, y queda de guarda |
| 63 | #284 · #309 | `/api/geocodificar`: un `find` que falla no tira los demás. Un 401 dice «Vuelve a entrar con el código…». Tope de 30 búsquedas por minuto y token (`429`). `x-hidrantes-cache: hit/miss` en esta Function y en `/api/direccion`, comprobado tras cada despliegue de staging | 4 tests de `geocodificar.test.ts`, 2 de `direccion.test.ts` y la e2e del 401 rojos sobre `develop` |
| 64 | #285 · #308 | `restaurar.ts` compara `psql --version` con la cabecera del volcado y con `\restrict`; si psql es más antiguo, se para antes de tocar nada | `restaurar.test.ts` (RV-64) rojo sobre `develop` |
| 65 | #286 · #303 | La lectura completa de jefatura pagina por clave (`gt('codigo', último)`) | `puntos.test.ts`: se perdía `HID-01000` sobre `develop` |
| 66 | #287 · #307 | La promoción del piloto deja las secuencias de producción al menos en el `last_value` de staging | `promover-piloto.test.ts` (RV-66) rojo sobre `develop` |
| 67 | #288 · #318 | La etiqueta de cada tramo de la medición va a 14 px de la línea, en perpendicular, sobre `--papel` al 85 % | `medir.spec.ts`: 0,2 px de la etiqueta a la línea sobre `develop` |

- **Decisiones:** ninguna nueva. DEC-092 anota la caché y el tope por token (RV-63).
- **Migraciones:** ninguna.

## 2. La caché de las Functions en `*.pages.dev` (RV-63)

**Comprobado en el despliegue de staging del 24 sep 2026 a las 15:15 UTC** (run 36018379754):
- **`/api/geocodificar`:** «la segunda petición igual sale de la caché».
- **`/api/direccion`:** lo mismo.

La Cache API **sí** guarda en `*.pages.dev`. El tope por token queda como segunda defensa frente a un bucle de cliente.

El mismo run dejó el aviso de #312: «El token de Cloudflare no tiene permiso de Workers (HTTP 403)». Staging se desplegó igual. Falta el paso del desarrollador en #273.

## 3. Suposiciones

- **Tableta con la ficha abierta (RV-60):** en lugar de bajar la ficha, la hoja deja libres los 432 px de la derecha: 360 de ficha, 64 de borde y 8 de aire. A 768 px la hoja queda de 336 px, y las filas compactas de RV-61 caben.
- **«Volver a la lista» en ordenador** no cierra el incidente: enseña la lista, que ordena desde él (RV-62), con «Volver a Cercanos» encima.
- **Sin posición o buscándola, en ordenador,** el aviso de Cercanos va encima de la lista, para que el buscador que se enfoca siga ahí (RV-59).
