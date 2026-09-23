# Verificación · Segunda revisión (23 sep 2026) · bloque A (P0)

**Estado: hecho el 23 sep 2026.** Especificación: `docs/18-cambios-revision-2-y-mapa.md` §1. Cada
RV tiene su issue (#219–#229) y su PR a `develop`.

El test de regresión de cada una se vio fallar sobre `develop` antes del arreglo (18 §0.1):
- **Vitest y e2e:** con los archivos de `develop` puestos en su sitio, en local.
- **pgTAP y `probar-restauracion.ts`:** en una rama desechable (`prueba/rv-34-35-regresion`, ya borrada) con los tests nuevos sobre el código de `develop`, lanzando `ci-sql` (runs 35903489718 y 35904574023). Docker Desktop no arranca en este equipo.

## 1. Qué se ha hecho

| RV | Issue · PR | Qué | Tests que lo prueban (rojos antes del arreglo) |
|---|---|---|---|
| 33 | #219 · #245 | `fn_fotos_referenciadas_lista` en una sola fila jsonb con su total (0020). La purga comprueba que cuadran y se planta ante un múltiplo exacto de 1.000 o una pasada de más de max(50, 10 %) del bucket (`--forzar` solo a mano). Vuelve a preguntar antes de borrar | `purgar-fotos.test.ts` (10 rojos); `19_fotos_referenciadas.test.sql`; `scripts/probar-purga.ts` en `ci-sql`, donde la RPC antigua devuelve 1.000 y la nueva 1.117 |
| 34 | #220 · #246 | `epoca_datos` sembrada (0021). Las secuencias HID y BOC no retroceden al restaurar (`sqlSecuenciasAlMenos`, común con `promover-piloto`) | `probar-restauracion.ts` (sobre develop, "recibe 1; la última dada fue 3"); `restaurar.test.ts`; `10_sincronizacion` |
| 35 | #221 · #252 | El código de acceso, las revocaciones y los administradores de **ahora** se reponen tras restaurar, sin archivo en disco. 15 §5.3 deja de decir que lo enviado se reenvía solo | `probar-restauracion.ts` (sobre develop, cuatro fallos: hash viejo, token no revocado, administrador reactivado, móvil nuevo invalidado); `restaurar.test.ts` |
| 36 | #222 · #247 | Jefatura exige `app_metadata.providers ? 'google'` y `amr` con `oauth` (0022, DEC-094). Claims de pgTAP, e2e e integración con Google. `comprobar-auth.ts`. La compatibilidad firma como de Google el arnés anterior | `20_jefatura_google.test.sql` (sobre develop, 6 de 8 fallan); `e2e/integracion/jefatura-google.spec.ts` contra la pila real; `comprobar-auth.test.ts`; `compatibilidad.test.ts` |
| 37 | #223 · #257 | `.gitignore` ignora `/*.sql`, `restauracion*.sql`, `hidrantes-*.sql` y `/respaldos/`. El pre-commit bloquea volcados. `restaurar.ts` escribe en el temporal del sistema y rechaza un `--archivo` no ignorado dentro del repositorio | `detectar-secretos.test.ts`; `restaurar.test.ts` (incluye `git check-ignore` real) |
| 38 | #224 · #248 | Las tareas se guardan con `-f` y el fallo se anota. La última ejecución se busca en todo el historial. La issue se abre aunque falle la rehabilitación. `codigo_http` en `avisos.yml`, que trata el 401 como aviso. `arranque` vuelve a desplegar staging | `workflows.test.ts` (8 rojos); `arranque.test.ts`; paso de `ci-sql` con una semanal de hace 20 días y el guardado real |
| 39 | #225 · #249 | `unaVuelta` devuelve `'reiniciar'`. Los reintentos respetan la generación. `estaPersistida` y la pantalla recalculada tras "Reintentar ahora" | `cola.test.ts` (4 rojos); e2e `operaciones.spec.ts` · tras "Reintentar ahora" dice enviado |
| 40 | #226 · #250 | Una posición GPS que no está al día no coloca el pin ni viaja como `gps_*`, y lo dice | e2e `instalar-y-posicion.spec.ts` (2 rojos con el `Proponer.tsx` de develop) |
| 41 | #227 · #251 | El tipo no se cambia fuera de un alta (0023, DEC-090). La app enlaza a *Proponer retirada*. El panel solo ofrece el tipo en un alta. `TIPO_NO_MODIFICABLE` es permanente en la cola | `21_tipo_no_modificable.test.sql`; `cola.test.ts`; `propuestas.test.ts` e `inventario.test.ts`; e2e `operaciones.spec.ts` y `panel-inventario.spec.ts` |
| 42 | #228 · #256 | `fn_editar_punto` borra la nota de fallo cuando el punto vuelve a funcionar, y limpia los que ya estaban así (0024). La ficha solo la enseña si no funciona | `22_nota_fallo.test.sql`; e2e `mapa.spec.ts` (rojo con el `Ficha.tsx` de develop) |
| 43 | #229 · #253 | Caché `hidrantes-fotos-v2`; el SW borra la antigua al activarse | `config/cache-fotos.test.ts`; e2e `armazon.spec.ts` (rojo con el `sw-push.js` de develop) |

- **Migraciones nuevas:** 0020 a 0024. Todas con las mismas firmas y comprobadas por `npm run compatibilidad` en `ci-sql`. Las que vuelven a crear `fn_aplicar_propuesta`, `fn_editar_punto` y `fn_proponer` declaran de nuevo su `lock_timeout`.
- **Decisiones:** DEC-090 y DEC-094.

## 2. Cómo se comprobó

- CI completa (`ci-calidad`, `ci-sql`, `ci-e2e`) en verde en cada PR antes de fusionar.
- Staging se desplegó solo tras cada fusión.
- En local, antes de cada PR:
  - typecheck, lint, prettier y vitest completo;
  - los e2e del área tocada con Chrome (`PW_CANAL=chrome`).
- **`comprobar-auth` ejecutado el 23 sep 2026** contra staging y prod, con el endpoint público `/auth/v1/settings`:
  - resultado: `disable_signup=false · email=true · mailer_autoconfirm=false`;
  - riesgo medio, ya cubierto por 0022;
  - la recomendación para el responsable de uniformidad está en #222.

## 3. Qué queda

- **Avisos de producción:** `VIGILANCIA_SECRETO` se rotó el 23 sep 2026. Staging lo aplica con cada despliegue, y producción en su siguiente despliegue (PR `develop → main`, #79). Hasta entonces `avisos.yml` deja un aviso por el 401 de PROD, sin fallar (RV-38).
- **La primera restauración real** (15 §5.3) ya repone el acceso y respeta los códigos. Se ensaya en CI en cada cambio; el ensayo anual sobre staging sigue en 15 §8.
- **Recomendación a uniformidad** (#222): cerrar el registro por correo en el proyecto de Supabase si su app no lo necesita. Aquí ya no hace falta, porque 0022 lo cubre.

## 4. Suposiciones tomadas

- **RV-33:** una lista de exactamente un múltiplo de 1.000 bloquea la purga aunque sea legítima. La semana siguiente el número habrá cambiado. `--forzar` solo salta el tope del 10 %, no este.
- **RV-35:** se reponen todas las claves `codigo_acceso%` (hash, código en claro, quién y cuándo), no solo el hash: si no, el panel enseñaría un código que ya no vale.
- **RV-36:**
  - `amr` de Google con `method: 'oauth'`, que es el `models.OAuth` de GoTrue.
  - El Supabase local firma con ES256 y acepta HS256 con el secreto JWT: así se simula una sesión de Google en la integración.
  - El formato real de una sesión con contraseña se registra en el log del test.
- **RV-37:** una línea que *empieza* por la cabecera de `pg_dump` o por `COPY hidrantes.` es un volcado. Citarla en un documento no bloquea el commit.
- **RV-41:** `corregirDatosDetalle` pasa a "Diámetro, racor o descripción mal anotados".
