# 36 · Lo que encontró la revisión tras `docs/35` (oct 2026)

> **Archivada el 14 oct 2026 (RV-483).** Todo lo de este documento está en producción con 0.14.0. Lo que se hizo, PR a PR, en `verificacion/revision-36.md`. Migración `0048`; DEC-205 a DEC-208. Desviaciones: el tope de la Function de entrada responde `503 OCUPADO` con `Retry-After` (no `429`), para no bloquear una hora a un grupo que entra desde la misma wifi; las seis casillas del código aceptan hasta 18 caracteres para poder repartir lo insertado; la vigilancia programada desune desde #715 y a mano solo informa por defecto.

| | |
|---|---|
| **Para** | Claude Code, en este repositorio. **Tres sesiones** (Backend, Frontend y Ops) en tres oleadas. |
| **Base** | `develop` en `349442d`. Producción en **0.13.0**. La siguiente migración es la `0048` y la siguiente decisión, DEC-205. |
| **Origen** | La revisión completa del 14 oct 2026, hecha después de cerrar `docs/35`. El desarrollador ha elegido los **ocho hallazgos medios, M1 a M8**. |
| **Congelación** | Es una segunda excepción a DEC-193: DEC-205 (§1). La especificación de después del piloto pasa a ser **`docs/37`**. |
| **Divulgación** | M1 y M2 describen fallos de seguridad sin arreglar, y el repositorio es público. Valen las mismas reglas que en `docs/35` §0.4 (§0.4 de este documento). |
| **El desarrollador** | No hace nada (DEC-176, DEC-177). |
| **Requisitos** | Cambia 05: la firma de `fn_editar_punto`, una RPC nueva, la Function y `fn_es_admin`. Cambian 03 (el tope de intentos por IP en la Function), 06 (Apéndice A) y 11. Los FR no cambian. |

## 0. Reparto

### 0.1 Decisiones del desarrollador

Los números se toman **justo antes de fusionar**. Si alguno ya está usado, se pasa al siguiente libre.

| DEC | Qué | Punto |
|---|---|---|
| **DEC-205** | `docs/36` es la segunda excepción a DEC-193. La de después del piloto pasa a ser `docs/37`. | RV-480 |
| **DEC-206** | Unir una cuenta de jefatura exige que **todas** las identidades del usuario lleven el correo del administrador, cierra las demás sesiones de ese usuario, y la jefatura solo vale con un JWT emitido después de la unión. Matiza DEC-197. | RV-450 |
| **DEC-207** | Un intento con el código **no cuesta un bcrypt si ya está frenado**, y la Function pone su propio tope por IP. Matiza DEC-199. | RV-451 |
| **DEC-208** | Editar un punto en el panel lleva la versión que se abrió: si otro lo ha cambiado entretanto, no se pisa. | RV-452, RV-471 |
| — | Matiza DEC-198: tampoco corre código de dependencias en un trabajo con **permiso de escritura**. | RV-460 |

### 0.2 Sesiones, oleadas y puntos

| Oleada | Sesión | Puntos | `PW_PUERTO` |
|---|---|---|---|
| 0 | **Ops** | RV-445: puesta en marcha (§0.5) | — |
| 1 | **Backend** | RV-450 (M1), RV-451 (M2) y RV-452 (M7, la parte de SQL) | 4450 |
| 1 | **Ops** | RV-460 (M3), RV-461 (M4) y RV-462 (M5) | 4460 |
| 1 | **Frontend** | RV-470 (M6) y RV-472 (M8) | 4470 |
| 2 | **Frontend** | RV-471 (M7, la parte del panel), cuando RV-452 esté en `develop`. También el refresco de sesión de RV-450 (§2, punto 4), cuando esté en `develop`. | 4470 |
| 2 | **Ops** | RV-463: la revisión de las uniones existentes (la parte de Ops de RV-450), cuando RV-450 esté en `develop` | 4460 |
| 3 | **Ops** | RV-480 (DEC en 12 y documentación), RV-481 (RV-139b), RV-482 (recorrido corto) y RV-483 (publicar **0.14.0** y archivar) | 4460 |

### 0.3 Archivos

| Archivo | Dueño |
|---|---|
| `supabase/**` (salvo el seed), `functions/**`, `e2e/integracion/**`, `docs/05`, `docs/11` | Backend |
| `src/**`, `e2e/**` salvo `e2e/integracion/**`, `docs/06` | Frontend |
| `.github/**`, `scripts/**`, `supabase/seed-staging.sql`, `CLAUDE.md`, el resto de `docs/` | Ops |

Sin subagentes: es un lote pequeño.

**Herramientas, como siempre:** `paquete-rv`, `nueva-migracion`, `revisar-pantallas`, `pr-review-toolkit`, `code-review` y, en Backend y Ops, `security-guidance`.

- Un test que falla antes del arreglo en cada punto.
- **Registro:** `docs/verificacion/revision-36.md`, con redacción neutra.

### 0.4 Divulgación

1. **Este archivo no entra en Git hasta RV-483.** Está en `.git/info/exclude` de la copia local. Las sesiones lo leen por su ruta absoluta: `C:\Proteccion civil\hidrantes-albolote\docs\36-revision-tras-35.md`.
2. **Issues, PR, commits y registro, con títulos neutros** («docs/36 · RV-450»). Dicen qué cambia, no cómo se aprovechaba.
3. Nunca en ningún sitio: el código de acceso, correos, nombres ni secretos.

### 0.5 RV-445 · Puesta en marcha (Ops)

- **Issues:** una por paquete, con título neutro. RV-450 y RV-451 llevan **`bloquea-release`**.
- **Coordinación:** una issue de coordinación.
- **`.git/info/exclude`:** comprobar que incluye este archivo.

---

## 1. DEC-205 (RV-480)

Para `docs/12`, tal cual:

> ### DEC-205 · `docs/36`: lo que encontró la revisión tras `docs/35`, segunda excepción a DEC-193
> - **Fecha:** 14 oct 2026 (desarrollador) · **Estado:** vigente (`docs/36`).
> - **Contexto:** la revisión completa del 14 oct 2026, hecha con `docs/35` ya en producción, confirmó lo de
>   `docs/35` y encontró ocho hallazgos medios. Dos son de seguridad: la unión de la cuenta de jefatura y el
>   coste de los intentos con el código. Los otros seis son de CI, del respaldo de staging, de la entrada con el
>   código y del panel.
> - **Decisión:**
>   1. `docs/36` entra como excepción a DEC-193, y solo con lo que contiene. Los dos de seguridad van como
>      `bloquea-release`.
>   2. La especificación de después del piloto pasa a ser **`docs/37`** y parte de `docs/verificacion/piloto.md`.
>      Donde DEC-193 y DEC-196 dicen `docs/36`, léase `docs/37`.
>   3. Los hallazgos bajos de esa revisión van como issues `tras-piloto`.
> - **Afecta a:** DEC-193, DEC-196, CLAUDE.md §5 y 09 §8.

---

## 2. RV-450 · Unir la cuenta de jefatura sin que se cuele otra (M1, DEC-206) · P0 · `bloquea-release`

**Qué pasa.**

- `/api/vincular-jefatura` (`functions/api/vincular-jefatura.ts:48-61`, `:127`) acepta a un usuario que tenga **varias** identidades. Le basta con que una sea de Google y lleve, verificado, el correo de un administrador (`vincular-jefatura.test.ts:263` lo da por bueno).
- Supabase Auth **une automáticamente** las identidades con el mismo correo verificado. Así se cuela alguien:
  1. Entra con su Google y cambia el correo de **su** usuario U al de un administrador nuevo. Para eso el administrador tiene que pulsar la confirmación, igual que en S1.
  2. El administrador entra por primera vez con Google. Supabase une **su** identidad a U.
  3. El panel llama a la Function, que une la fila a U.
  4. La sesión del atacante es también de U: al refrescarla, `fn_es_admin()` da verdadero.

**Solución.**

1. **En la Function, antes de llamar a la RPC.** Se une solo si se cumple todo esto:
   - **Todas** las identidades del usuario tienen en `identity_data` un correo verificado (`email_verified === true`) igual, en minúsculas, al de la identidad de Google.
   - `user.email` (en minúsculas) es ese mismo correo.
   - Hay al menos una identidad de Google.

   Si no se cumple: 403 `CUENTA_MEZCLADA`. Se anota en `errores_cliente` sin correos ni ids y **no se une**.

   Un administrador que entró antes a uniformidad con correo y contraseña sí pasa, porque su identidad `email` lleva el mismo correo.
2. **Cerrar las demás sesiones.** Al recibir `VINCULADO`, la Function llama a `POST {SUPABASE_URL}/auth/v1/logout?scope=others` con el JWT de esa sesión. Así se cierran las demás sesiones de ese usuario.
   - Si esa llamada falla, la unión se deshace con `fn_desvincular_administrador` (punto 3) y se devuelve 503. No queda una unión con sesiones ajenas vivas.
   - **Efecto aceptado:** el administrador tiene que volver a entrar, una sola vez, en sus otros dispositivos, también en la app de uniformidad si usa el mismo usuario. Va en DEC-206 y en 13.
3. **En la base de datos** (migración `0048`):
   - **`fn_es_admin()`** exige además que el `iat` del JWT sea posterior o igual a `vinculado_en`. Un token emitido antes de la unión no da jefatura, aunque sea del mismo usuario.
   - **`fn_desvincular_administrador(correo text) returns boolean`**, solo para `service_role`:
     - pone `usuario_id` y `vinculado_en` a null;
     - deja la acción `administrador_desvinculado` en el Registro, sin ids.
4. **En el panel** (`src/lib/acceso.ts`, oleada 2, Frontend):
   - con `VINCULADO`, `supabase.auth.refreshSession()` y después se vuelve a comprobar, para que el JWT nuevo lleve un `iat` posterior;
   - `CUENTA_MEZCLADA` va al «No autorizado» de siempre, con su texto: «Esta cuenta tiene otra identidad unida. Pide a otro administrador que te quite y te devuelva el acceso, y entra con una cuenta de Google propia».
   - **Además, del panel (finding 7):** el resultado «unida» no se guarda en la caché de `vinculo`. Solo se guardan `sin_acceso` y `sin_comprobar`.
5. **Las uniones que ya existen** se revisan en RV-463 (Ops).

**Tests.**

- **Vitest de la Function:**
  - el caso del ataque, con dos identidades de Google de correos distintos → `CUENTA_MEZCLADA`;
  - `user.email` distinto → `CUENTA_MEZCLADA`;
  - una identidad `email` con el mismo correo más una de Google → une;
  - tras unir, se llama a `logout?scope=others`;
  - si ese logout falla, se desune y se devuelve 503.
- **pgTAP:**
  - un JWT unido con `iat` anterior a `vinculado_en` → no es jefatura; con uno posterior → sí;
  - `fn_desvincular_administrador`: solo la ejecuta `service_role`, y deja su entrada en el Registro.
- **Vitest de `acceso.ts`:**
  - el refresco de sesión antes de volver a comprobar;
  - `CUENTA_MEZCLADA`;
  - sin caché de «unida».

**Documentación:** 05 (la Function, `fn_es_admin` y la RPC nueva) y 11 (jefatura).

### RV-463 · Revisar las uniones que ya existen (Ops, oleada 2)

- **Script `scripts/revisar-uniones.ts`**, solo con módulos de Node (DEC-198):
  - para cada `usuario_id` unido de `administradores`, `GET {SUPABASE_URL}/auth/v1/admin/users/{id}` con la service role;
  - **solo esos ids**: no se lee ningún otro usuario del proyecto compartido;
  - aplica la regla del punto 1. Si no la cumple, `fn_desvincular_administrador` y un problema para la vigilancia («una cuenta de jefatura se ha desunido: que vuelva a entrar»), con aviso técnico.
- **Cuándo:** en la vigilancia, en producción (`prod-tareas`) y en staging. Una vez al día basta.
- **Ahora:** una ejecución a mano tras fusionar. El resultado va al registro, sin correos.
- **Test:** con usuarios simulados, una unión limpia se queda y una mezclada se desune.

---

## 3. RV-451 · Un intento frenado no cuesta un bcrypt (M2, DEC-207) · P1 · `bloquea-release`

**Qué pasa.**

- Desde `0047` (líneas 63-67), **todo** intento hace el bcrypt (coste 10) antes de mirar nada, también el que ya está frenado por el móvil, la IP o el tope global. Y lo hace fuera del turno, en paralelo.
- `functions/api/verificar-codigo.ts:37-51` no tiene `dentroDelLimite`, y `exigirMismoOrigen` no frena a `curl`.
- **Resultado:** una avalancha desde IP ya frenadas pone a la base de datos a hacer bcrypt sin parar. Esa base es el proyecto **compartido con uniformidad**. Los voluntarios de verdad reciben `OCUPADO` o se quedan esperando.

**Solución.**

1. **Function:** `dentroDelLimite('codigo:' + ipAgrupada, ahora, 10)` (10 por minuto y por IP agrupada). Si se pasa, 429 `DEMASIADOS_INTENTOS` **sin** llamar a la base. Se mantiene la duración mínima de la respuesta.
   - Va a 03, con la nota de que el tope es por instancia del Worker y que el límite de verdad sigue en la base.
2. **SQL** (migración `0048`): `fn_verificar_codigo` hace primero una **lectura sin turno** de los fallos de la última hora de ese móvil y de esa IP, y del tope global con `fallos_24h > 0`. Si cualquiera ya está pasado, devuelve `DEMASIADOS_INTENTOS` **sin bcrypt**.
   - Si no hay tope, todo sigue como en `0047`: bcrypt, turno y recuento de verdad bajo el turno.
   - La lectura previa solo sirve para ahorrar trabajo; la decisión la sigue tomando el recuento con turno.
   - **Tiempo:** la duración mínima de la Function (`DURACION_MINIMA_MS`) ya iguala el tiempo de respuesta. Comprobar que cubre el caso sin bcrypt.
3. **Índices:** comprobar que la lectura previa usa `intentos_ip_idx` e `intentos_dispositivo_idx` (`explain`, en el test).
4. **De paso (finding 7 del backend):** la llamada a `fn_encolar_aviso_tecnico` dentro de `fn_verificar_codigo` va en un bloque con `exception when others`. Un fallo del aviso no tumba una entrada.

**Tests.**

- **pgTAP:**
  - un móvil por encima de su tope → `DEMASIADOS_INTENTOS`, sin pasar por `crypt`. Se comprueba con un contador en una tabla temporal de prueba o con `pg_stat_user_functions` sobre un envoltorio. Si no se puede medir así, con el tiempo: menos de 50 ms frente a más de 50 ms;
  - el móvil limpio de DEC-199 sigue entrando con el tope global alcanzado;
  - un fallo de `fn_encolar_aviso_tecnico` no impide entrar.
- **Vitest de la Function:**
  - el undécimo intento en un minuto desde la misma IP agrupada recibe 429 sin llamar a la RPC;
  - de otra IP, pasa.

**Documentación:** 03, 05 y 11 §3.

---

## 4. RV-452 y RV-471 · Editar no pisa el cambio de otro (M7, DEC-208) · P2

**Qué pasa.** `fn_editar_punto(punto_id, cambios)` (`0039:262`) no mira ninguna versión.

1. El administrador A abre Editar.
2. Entretanto, B cambia el Estado, o se aprueba una propuesta de ese punto en la Cola.
3. A guarda y pisa lo de B sin aviso.

El aviso «otro administrador» de RV-165 solo sale si A ya ha vuelto a sincronizar, y eso casi nunca pasa a tiempo. La Cola sí lo tiene resuelto, con `datos_cambiados_en`.

**Solución (RV-452, Backend, migración `0048`):**

- **Firma nueva:** `fn_editar_punto(punto_id uuid, cambios jsonb, version timestamptz default null)`.
  - Se borra la de dos argumentos, como se hizo con `fn_cambiar_codigo_acceso`, y se conservan los permisos.
  - El panel anterior, sin `version`, sigue funcionando como hoy (una versión atrás).
- **Con `version`:** bajo el bloqueo de la fila, si `datos_cambiados_en > version` → error `PUNTO_CAMBIADO` y no se toca nada. No se usa `actualizado_en`, que también cambia con el núcleo (RV-403).
- **Lo que carga el panel:** incluye `datos_cambiados_en`. Comprobar la vista o la RPC del Inventario, y que `fn_punto_json` lo sigue quitando donde no hace falta.
- **pgTAP:**
  - con una `version` vieja → `PUNTO_CAMBIADO`;
  - con la actual → guarda;
  - sin ella → guarda.

**Solución (RV-471, Frontend, oleada 2):**

- `EditarPunto` envía la `datos_cambiados_en` del punto que se abrió.
- Con `PUNTO_CAMBIADO`, aviso en la ventana: «Otro administrador ha cambiado este punto mientras lo editabas. Mira lo nuevo antes de guardar.», con el botón **Ver lo nuevo**.
  - **Ver lo nuevo** recarga el punto y conserva lo escrito en los campos que el otro no ha tocado. En los que sí ha tocado, sale el valor nuevo marcado.
  - Lo que se perdería nunca se pierde en silencio (UI-06).
- **Textos:** en `textos.ts` y en el Apéndice A.
- **e2e (con `simularRpc`):** guardar recibe `PUNTO_CAMBIADO` → el aviso sale → **Ver lo nuevo** → guardar otra vez funciona.

---

## 5. Ops (oleada 1)

### RV-460 · Mantenimiento sin código de dependencias con permiso de escritura (M3) · P1

**Qué pasa.**

- `mantenimiento.yml` (líneas 16-18 y 29-44) tiene `contents: write` y `pull-requests: write`, y su `checkout` guarda las credenciales.
- Además hace `npm ci` completo y `npm run zona`, `mapabase` y `callejero` (con `tsx` y las dependencias de desarrollo).
- Cualquier dependencia puede leer el token y empujar ramas o abrir PR. Y `git add -A` sube lo que ella haya escrito.

**Solución: dos trabajos.**

1. **`generar`:**
   - `contents: read`, `checkout` con `persist-credentials: false`;
   - `npm ci`, `npm rebuild esbuild workerd --ignore-scripts=false` y los `npm run` de hoy;
   - sube como artefacto **solo** los archivos de una lista cerrada (los que hoy puede cambiar: `datos/…`, `public/…`; sacarla del propio workflow y de los scripts).
2. **`publicar`:**
   - `contents: write` y `pull-requests: write`, **sin** `node_modules` ni Node;
   - `checkout` de `develop` y descarga del artefacto;
   - copia **solo** las rutas de la lista y rechaza cualquier otra que traiga;
   - commit y PR como hoy.

**Mismo patrón, menor:** `canario-ubuntu.yml:18-43` tiene `issues: write` y hace `npm test`. Pasa a un trabajo de prueba de solo lectura y otro, sin dependencias, que abre la issue.

**Test (`scripts/workflows.test.ts`):** ningún trabajo con permiso de escritura (salvo `GITHUB_TOKEN` de solo lectura) ejecuta `npm`, `npx` ni `tsx`. Sale de la lista de excepciones de `workflows.test.ts:1551`.

### RV-461 · Un respaldo de staging que se corta también avisa (M4) · P2

**Qué pasa.**

- `respaldo-staging` (`respaldo.yml:302`) tiene `continue-on-error: true` y `timeout-minutes: 30`.
- Si se corta por tiempo (el de las fotos del mes es el candidato), el trabajo queda **cancelado**, no fallido. Los pasos de aviso (`if: failure()`, 445 y 464) no corren.
- `revisar_bd staging` (`.github/scripts/revisar-bd.sh:14`) no mira la edad de `ultimo_respaldo`, aunque el respaldo de staging sí la escribe (`respaldo.yml:437`).
- Staging guarda los datos reales del piloto (DEC-203).

**Solución.**

- Los dos pasos de aviso con `if: failure() || cancelled()`.
- `timeout-minutes` del trabajo de staging, igual que el de producción.
- `revisar_bd staging` mira `ultimo_respaldo` como producción: más de 8 días es un problema («staging: el último respaldo tiene N días»).

**Test (`workflows.test.ts`):**

- las condiciones de los dos pasos;
- `revisar_bd staging` con un respaldo de 9 días da el problema.

### RV-462 · El retraso de producción cuenta lo que de verdad va a producción (M5) · P2

**Qué pasa.** `PRODUCCION_RUTAS` (`.github/scripts/produccion-atrasada.sh:17`):

- **no cuenta:**
  - `config/`, que `vite.config.ts:8-12` usa para `_headers`, la CSP y las cachés del SW;
  - `datos/`, que `deploy-prod.yml` carga en la base;
  - `CHANGELOG.md`, cuyas Novedades van en el bundle;
- **cuenta de más:** `workers/`. El Worker se despliega desde `develop` en cada despliegue de staging (`deploy-staging.yml:179-197`), así que un cambio que solo toca `workers/` pone la vigilancia en rojo a los 7 días sin que haya nada que publicar.

**Solución.**

- Añadir `config`, `datos` y `CHANGELOG.md`, y quitar `workers`.
- Comentario con el porqué de cada ruta.
- Test en `produccion-atrasada.test.ts` con un commit de cada caso.

---

## 6. Frontend

### RV-470 · El código pegado o autocompletado entra entero (M6) · P1

**Qué pasa.**

- Cada casilla del código hace `onChange={(e) => poner(i, e.target.value.slice(-1))}` con `maxLength={2}` (`src/paginas/Entrada.tsx:106-110`).
- `onPaste` solo salta con «Pegar» del menú. Otras dos vías meten el texto **sin** evento de pegar:
  - el botón del portapapeles de Gboard, con el código copiado de WhatsApp;
  - la sugerencia de iOS «De Mensajes», a la que invita `autoComplete="one-time-code"` en la primera casilla.
- En los dos casos el navegador corta a 2 caracteres y `slice(-1)` deja 1: «482915» se queda en un «8».
- El voluntario ve un código mal puesto, sin saber por qué. Justo el día del lanzamiento.

**Solución.**

- En `onChange`, si el valor trae más de una cifra, `poner(i, valor)`. Esa función ya reparte las cifras entre las casillas. Si trae una, como hoy.
- `maxLength`: 6 en la primera casilla y 2 en las demás.
- Con seis cifras ya repartidas, el foco va al nombre (o al botón, si el nombre ya está).

**Tests.**

- **e2e:** `fill('482915')` en la primera casilla → las seis llenas. Lo mismo con `keyboard.insertText` en la primera y en la tercera (desde la tercera se reparte hasta la sexta).
- **vitest:** una cifra sigue funcionando igual, y borrar también.

### RV-472 · El Registro dice todo con palabras y en hora local (M8) · P2

**Qué pasa.**

- **Acciones sin nombre.** `NOMBRE_ACCION` (`src/lib/panel/inventario.ts:135-157`) no tiene `entrada_abierta`, `entrada_cerrada`, `nucleo_guardado` ni `restauracion_respaldo`, y el servidor sí las escribe (`0044:99,116,152`; `0045:104`; `0047:583`). Salen con su clave y no se pueden elegir en el filtro.
- **Campos crudos y horas en UTC.** El detalle (`registro-legible.ts:163,201`) enseña:
  - `desde: 2026-10-13T22:00:00+00:00 · dispositivos: 3`, en UTC, dos horas desplazado de lo que jefatura escribió;
  - `abrir_entrada: no · revocar_dispositivos: sí`;
  - `hasta: …+00:00 · horas: 24 · motivo: codigo_nuevo_revocando`.
- **Acción nueva:** `administrador_desvinculado` llega con RV-450.

**Solución.**

- **Acciones:** las cinco en `NOMBRE_ACCION` y en el filtro, con sus textos.
- **Campos con nombre** en `T.panelRegistro.campos`: `desde`, `hasta`, `dispositivos`, `abrir_entrada`, `revocar_dispositivos` y `horas`.
- **Los valores de `motivo`** con palabras.
- **Fechas:** en `detalleLegible`, cualquier valor que sea una marca de tiempo ISO se enseña con `fechaCorta` y la hora local.
- **Una clave desconocida** se sigue enseñando tal cual (RV-127 regla 3). La lista de conocidas crece.
- **Test** comprobando que todas las acciones están cubiertas: un test que saca de las migraciones (`grep` de `fn_registrar(..., '<accion>'`) la lista de acciones y comprueba que todas están en `NOMBRE_ACCION`. Así una acción nueva no vuelve a salir cruda.
- **Más tests:** vitest de `detalleLegible` con `dispositivos_revocados`, `codigo_cambiado` y `entrada_abierta`, en zona `Europe/Madrid`.

---

## 7. Cierre (Ops, oleada 3)

- **RV-480 · Decisiones y documentación:**
  - DEC-205 a DEC-208 en 12, con el matiz a DEC-198;
  - en DEC-193 y DEC-196, `docs/37`;
  - CLAUDE.md §5: «salvo `docs/35` y `docs/36`, DEC-196 y DEC-205»;
  - 09 §8;
  - 13: tras unir la cuenta, hay que volver a entrar en los otros dispositivos; y `CUENTA_MEZCLADA`;
  - 15: qué hacer si la vigilancia desune una cuenta.
- **RV-481:** RV-139b sobre el commit final de `develop`.
- **RV-482 · Recorrido corto** con `revisar-pantallas`:
  - la entrada con el código pegado y con `insertText`;
  - Editar con `PUNTO_CAMBIADO` (simulado);
  - el Registro con las acciones nuevas y las horas locales;
  - el panel tras unir la cuenta (simulado).
- **RV-483 · Publicar 0.14.0** con `npm run publicar -- --solo-comprobar` y después `npm run publicar`.
  - Este documento pasa a `docs/archivo/especificaciones/36-revision-tras-35.md`, con su fila en `INDICE.md`, y sale de `.git/info/exclude`.
  - Los hallazgos bajos de la revisión del 14 oct, como issues `tras-piloto` con título neutro.

## 8. Checklist

- [ ] **M1:** una cuenta con otra identidad unida no queda unida a jefatura. Tras unir, las demás sesiones se cierran y un token anterior no da jefatura. Las uniones existentes, revisadas.
- [ ] **M2:** un intento ya frenado no hace bcrypt. La Function corta a partir de 10 por minuto por IP agrupada.
- [ ] **M3:** ningún trabajo con permiso de escritura ejecuta código de dependencias.
- [ ] **M4:** un respaldo de staging cortado o viejo avisa.
- [ ] **M5:** el retraso de producción cuenta `config/`, `datos/` y `CHANGELOG.md`, y no `workers/`.
- [ ] **M6:** el código pegado o autocompletado entra entero.
- [ ] **M7:** Editar no pisa un cambio de otro.
- [ ] **M8:** el Registro no enseña ninguna clave cruda ni ninguna hora UTC.
- [ ] Tests, e2e y axe en verde. CI y staging en verde. RV-139b en verde. 0.14.0 en producción.
- [ ] Este documento, archivado. Nada publicado antes de tiempo (§0.4).

## 9. Fuera de este documento

- **H1** de la misma revisión: que `dist/_worker.js` pueda sustituir a las Functions. No está en M1–M8.
- **Los hallazgos bajos:** issues `tras-piloto` (RV-483).
- **Lo que hace falta para el piloto y no puede hacer Claude Code:**
  - dar de alta a jefatura en staging (el desarrollador);
  - el código del piloto y los avisos técnicos (jefatura);
  - la validación #76;
  - el iPhone y el marcador a pleno sol;
  - el sobre.

## 10. Lo que hace el desarrollador

Nada. Después de 0.14.0:

- quien ya era administrador y entra al panel por primera vez tras la unión tiene que volver a entrar en sus otros dispositivos, una sola vez;
- si la vigilancia desune una cuenta, avisa con un aviso técnico.
