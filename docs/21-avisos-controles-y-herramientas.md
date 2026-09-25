# 21 · Avisos que no se activan, controles del mapa y herramientas de Claude Code (25 sep 2026)

| | |
|---|---|
| **Para** | Claude Code, en este repositorio. Tres sesiones en paralelo según `docs/trabajo-en-paralelo.md`. |
| **Base** | `develop` en `bcb3257` (0.6.3). Producción en 0.6.3 con la paridad en verde (`docs/20` P-10). |
| **Estado de partida** | typecheck, lint, prettier, 1.788 tests de vitest, build y presupuesto (JS inicial **125,9 kB**, TR-11) en verde. En staging, las teselas ZXY de RV-71 se sirven: `/mapabase/t/20260919/…` responde 200, `application/vnd.mapbox-vector-tile`, `immutable`, 366 teselas. |
| **Origen** | Uso real del desarrollador en un Android con staging instalado (25-09, capturas), la incidencia abierta en staging «Avisos quedan desactivados» (24-09, 0.6.2, `/ajustes`) y una revisión completa del código. |

## 0. Reparto

| Sesión | Puntos | DEC | Migraciones y pgTAP | `PW_PUERTO` |
|---|---|---|---|---|
| **Frontend** | RV-81, RV-82, RV-83, RV-85, RV-87, RV-88 | DEC-122 a 127 | — | 4174 |
| **Backend** | RV-84, RV-86 | DEC-118 a 121 | `0030` y siguientes; pgTAP desde `27` | 4173 |
| **Ops** | SK-01, SK-02, SK-03 y P-11 | DEC-114 a 117 | — | 4175 |

- RV-81 (cliente) y RV-84 (servidor) son la misma avería vista desde los dos lados. Frontend empieza
  por RV-81 **sin esperar** a RV-84: lo primero es que la pantalla diga el motivo.
- Ops abre la issue «Coordinación docs/21» y hace **SK-01 primero**. Así las otras dos sesiones ya
  trabajan con los plugins y los hooks instalados si arrancan después. Si ya habían arrancado, lo
  aprovechan desde su siguiente paquete.
- Registros de cada sesión: `docs/verificacion/avisos-controles-<sesión>.md`. Ops los consolida en
  `avisos-controles.md`.

---

## 1. Frontend

### RV-81 · Activar los avisos falla en silencio · P0

**Qué se vio.** En un Android con staging instalado, en Ajustes → Avisos:

1. Se toca el interruptor, se abre la hoja y se pulsa "Permitir".
2. El interruptor sigue apagado y el texto sigue diciendo "Desactivado".
3. No aparece ningún mensaje.
4. En Salud del sistema, "Errores de la aplicación (7 días)" sigue en **0**.

Llegó además la incidencia «Avisos quedan desactivados».

**Por qué no hay forma de saber el motivo.** Hay cuatro caminos distintos que acaban todos en el
mismo "Desactivado" sin mensaje, lo que rompe UI-05 y UI-06:

| Camino | Dónde |
|---|---|
| El permiso vuelve como `default`. Chrome deja de enseñar la pregunta tras varios rechazos, y en las apps instaladas puede usar la "mensajería silenciosa". | `src/lib/push.ts:43` |
| `pushManager.subscribe` lanza, y `.catch(() => estadoPush())` se lo traga. Es típico de un servicio de push no disponible, de Google Play Services, de los datos en segundo plano restringidos o de una clave VAPID incorrecta. | `push.ts:47`, `src/paginas/Ajustes.tsx:406` |
| La RPC `fn_guardar_suscripcion_push` falla, por token o por `PAYLOAD_INVALIDO`, y se devuelve `'inactivo'` sin más. | `push.ts:48-52` |
| `navigator.serviceWorker.ready` no se resuelve nunca: el botón se queda deshabilitado sin motivo (UI-02). | `push.ts:46` |

Ninguno de los cuatro llama a `anotarError`.

**Comprobado desde fuera.** La clave VAPID pública del build de staging es válida: 87 caracteres
base64url, 65 bytes, empieza por `0x04`. La lista de hosts de 0029 admite `fcm.googleapis.com`.

**Solución.**

1. `activarPush()` devuelve `{ estado: EstadoPush, motivo?: MotivoPush }`, con
   `MotivoPush = 'permiso_no_concedido' | 'permiso_bloqueado' | 'sin_servicio_push' | 'sin_service_worker' | 'clave_distinta' | \`servidor:${string}\``.
   - `requestPermission()` → `default` da `permiso_no_concedido`, y `denied` da el estado
     `denegado`, como hoy.
   - `navigator.serviceWorker.ready` va con un límite de 10 s (`conLimite` de `src/lib/red.ts`). Si
     vence, da `sin_service_worker`.
   - **Suscripción existente con otra clave.** Si `getSubscription()` devuelve una suscripción cuyo
     `options.applicationServerKey` no coincide con `VITE_VAPID_PUBLIC_KEY`, se llama a
     `unsubscribe()` y se vuelve a suscribir. Si falla, da `clave_distinta`.
   - Si `subscribe()` lanza, da `sin_servicio_push`, y el nombre y el mensaje del error van a
     `anotarError(e, 'push:subscribe')`. **Nunca** se registra el endpoint.
   - Si la RPC falla, da `servidor:<código>` y también `anotarError`, con el código y sin datos.
2. **La hoja no se cierra si algo falla.** Enseña el motivo con un texto por motivo (textos nuevos en
   `textos.ts` y el Apéndice A) y lo que puede hacer el voluntario. Textos propuestos:
   - `permiso_no_concedido`: "El móvil no ha dejado preguntar. Abre los ajustes de notificaciones de
     la aplicación, actívalas y vuelve a intentarlo." con el botón "Reintentar".
   - `sin_servicio_push`: "Este móvil no puede recibir avisos ahora (servicio de avisos no
     disponible). Comprueba que tiene conexión y los servicios de Google actualizados."
   - `servidor:*`: el texto de `textoError(codigo)`, con "Reintentar".
   - `sin_service_worker`: "La aplicación aún se está preparando. Ciérrala del todo, ábrela y vuelve
     a intentarlo."
3. El interruptor no se queda deshabilitado: `ocupado` vuelve siempre a `false` en un `finally`.
4. **Resincronizar la suscripción.** Mientras `push` está activo en el móvil, tras cada sincronización
   buena (`comprobarAcceso`) se vuelve a llamar a `fn_guardar_suscripcion_push` con la suscripción
   actual, como mucho una vez cada 24 h (marca en `almacen`). Así se recupera una fila que el servidor
   borró (RV-84).
5. **`public/sw-push.js`:** manejador de `pushsubscriptionchange`. Se vuelve a suscribir con la misma
   clave y se deja la suscripción nueva en IndexedDB (clave `push_pendiente`). La app la envía al
   abrirse; el SW no tiene el token.

**Tests.**

- `src/lib/push.test.ts`, con `Notification`, `serviceWorker` y `PushManager` simulados, un caso por
  camino:
  - `default` → `permiso_no_concedido`;
  - `subscribe` que lanza → `sin_servicio_push` y `anotarError` llamado, sin endpoint en el mensaje;
  - RPC con `PAYLOAD_INVALIDO(suscripcion)` → `servidor:PAYLOAD_INVALIDO(suscripcion)`;
  - `ready` que no resuelve → `sin_service_worker` a los 10 s. El límite es inyectable en el test: no
    se finge el reloj de la red;
  - clave distinta → `unsubscribe` y nueva suscripción;
  - todo bien → `activo`.
- E2e `ajustes-avisos.spec.ts` (nuevo), proyecto móvil:
  - Con `context.grantPermissions(['notifications'])`. Chromium sin servicio de push hace fallar a
    `subscribe`: la hoja enseña el texto de `sin_servicio_push` y no se cierra. Sobre `develop` se
    cierra en silencio.
  - Con `pushManager.subscribe` sustituido por `addInitScript`, que devuelve una suscripción
    realista de FCM, y `fn_guardar_suscripcion_push` simulado bien: el interruptor queda activado.
- Integración (`e2e/integracion`, sesión Backend si hace falta la pila): la misma suscripción realista
  de FCM contra la RPC real entra y crea la fila.

**Paso manual del desarrollador (2 min) cuando esté en staging:**

1. Repetir la activación en el mismo Android.
2. Si falla, anotar el texto que sale y mirar en Salud del sistema el error nuevo en "Errores de la
   aplicación".
3. Con eso queda identificado el caso. Anótalo en DEC-122.

### RV-82 · Los controles del mapa: "Cercanos" ensancha la columna y empuja los botones al centro · P0

**Qué se vio** (captura en Android):

- El botón "Cercanos" lleva texto y es mucho más ancho que los demás.
- La columna de la derecha (`src/paginas/Mapa.tsx:505-547`) es `flex flex-col` sin ancho fijo, así
  que toma el ancho del hijo más ancho (≈ 110 px).
- Los botones de 44 px (`Control`, `:51-67`) quedan pegados al borde **izquierdo** de esa columna,
  hacia el centro del mapa.
- Con la leyenda abierta abajo a la izquierda y el "+" abajo a la derecha, el mapa útil se queda en la
  mitad.
- **En tableta y ordenador, además**, la ficha (`right-16`, `:590`, `MARGEN_FICHA_PX`, `:75-76`)
  supone una columna de 44 px y tapa Capas, Medir, Mi posición y el zoom.

**Solución** (DEC-123). Se sigue el patrón de las apps de mapas: herramientas arriba a la derecha y
las acciones principales abajo, al alcance del pulgar.

1. **Columna de la derecha solo con iconos:**
   - `items-end` y ancho fijo de 44 px, pegada al borde con 8 px de margen (`right-2`);
   - contiene Capas, Medir y Mi posición (iconos de 44 × 44 con `aria-label` y `title`), y el zoom
     "+/−" en **una sola pieza** vertical de 44 × 88 con separador;
   - el zoom se mantiene: es la alternativa de un solo dedo al pellizco (WCAG 2.5.1).
2. **"Cercanos" pasa abajo a la derecha, como botón extendido, encima del "+":**
   - icono `Crosshair` y texto "Cercanos" visible, así que se cumple 06 §4.7, que pide texto visible
     en el móvil;
   - 48 px de alto, fondo `--marino-950` y texto blanco;
   - 12 px de separación vertical con el "+" (UI-13);
   - así queda al alcance del pulgar y deja de estorbar a la columna.
   - En escritorio (≥ 900 px) va en el mismo sitio, con la lista lateral a la izquierda.
3. **La leyenda se pliega:**
   - por defecto es una ficha "Leyenda" de 44 px abajo a la izquierda, que al tocarla se despliega
     como hoy y se cierra con la X o tocando fuera;
   - el primer uso (primer arranque tras instalar) la enseña desplegada una vez;
   - el estado se recuerda en `almacen`.
4. **Una sola fuente de medidas.** Una constante `CONTROLES` en `src/lib/disposicion-mapa.ts` (nuevo)
   con el ancho de la columna, los márgenes y la altura de la zona de botones de abajo. La usan la
   ficha (`right-*`), los avisos flotantes (`docs/19` RV-59), el `fitBounds` del incidente (`docs/19`
   RV-60) y `MARGEN_FICHA_PX`. Nada vuelve a calcular a mano.
5. **06 §5** ("Controles del mapa"): escribe la disposición nueva y deja resuelto el tamaño del "+".
   Hoy la documentación dice 44 px y el código usa 56 (`size-14`): queda en 56 px, el extendido de
   "Cercanos" en 48 y los iconos en 44. Actualiza también §4.7. Las líneas 223-224 siguen valiendo.
   Actualiza el prototipo 07 en la misma pantalla (CLAUDE.md §2: el documento manda).

**Alternativa descartada**, anotada en DEC-123: "Cercanos" dentro de la barra de búsqueda, como botón
a su derecha. Ocupa menos, pero queda arriba, lejos del pulgar, y compite con el teclado al buscar.

**Tests.**

- `anchos.spec.ts`, a 390, 412 (Pixel 7), 768 y 1280 px:
  - todos los botones de la columna tienen el mismo borde derecho (±1 px) y está a ≤ 12 px del borde
    del mapa;
  - la columna mide ≤ 48 px de ancho;
  - "Cercanos" queda abajo a la derecha, encima del "+", sin solaparse con él ni con la atribución;
  - en 768 y 1280, con la ficha abierta, ninguna caja de la columna se cruza con la de la ficha.
    Sobre `develop` falla.
- `accesibilidad.spec.ts`: medidas de 44 px y separación de 8 px con la disposición nueva, y la ficha
  "Leyenda" con nombre accesible.
- `mapa.spec.ts`: la leyenda plegada se despliega y se cierra; el primer uso la enseña desplegada.
- Captura visual en el PR, a 412 × 915, con el mapa, el incidente abierto y la ficha abierta. La sube
  `testInfo.attach`; no se compara, es para revisarla una persona.

### RV-83 · Tocar un aviso no lleva a "Mis propuestas" · P1

**Problema.** `public/sw-push.js`, en `notificationclick`:

- usa `clients.matchAll({ includeUncontrolled: true })` y `v.navigate(url)` sobre una ventana que el
  SW no controla. Tras la primera instalación es lo normal, porque no hay `clientsClaim`;
- `navigate()` rechaza, y la promesa no se espera, así que la app recibe el foco pero no cambia de
  pantalla.

**Solución.** Se navega solo si la ventana es de este origen y el SW la controla. Si no:
`clients.openWindow(url)`. Todo dentro de `event.waitUntil`.

**Test.** Unitario de `sw-push.js` con `self`, `clients` y `WindowClient` simulados. Carga el archivo
con `vm` en vitest:

- con una ventana controlada → `navigate`;
- sin ella → `openWindow`;
- `waitUntil` recibe la promesa.

### RV-85 · El mapa sin conexión de quien nunca descargó el PMTiles · P2

**Problema.** Quien va con datos móviles y nunca descargó el PMTiles solo tiene, sin cobertura, lo que
quedó en `hidrantes-teselas-<versión>`. Cada versión nueva del mapa base borra esa caché al activarse
el SW (`docs/20` RV-71), y hasta volver a verlo en línea se queda sin fondo.

**Solución.**

- Cuando se borra la caché de la versión anterior, el aviso "El mapa base no está en el móvil"
  (`docs/19` RV-10) se muestra también a quien tenía teselas sueltas.
- Documéntalo en 04 §8 y en DEC-124.

**Test.** E2e: con una caché `hidrantes-teselas-<vieja>` y el SW nuevo, el aviso sale.

### RV-87 · Documentación que no coincide con el código · P2

- **06 §5:** tamaño del "+" (lo resuelve RV-82). Revisa el comentario de `Mapa.tsx:574`.
- **Tiempo de entrega de los avisos:**
  - `docs/05` §9 y `functions/api/push.ts:3` (el comentario) aún hablan de `avisos.yml` cada 15
    minutos; hoy es el Worker cada 5 (DEC-097);
  - `grep -rn "15 minutos" docs src functions scripts`, y corrige lo que sea de avisos.

### RV-88 · Revisión visual con Playwright en cada PR de pantallas · P2 · con SK-03

La disposición de RV-82 solo se vio en un móvil real: los tests medían cajas sueltas, no el conjunto.

**Solución.**

- Un spec `e2e/vistas.spec.ts` genera capturas a 412 × 915 y 1280 × 800 de: mapa, mapa con incidente,
  mapa con ficha, lista, Ajustes, cola del panel e inventario del panel. Usa datos simulados (10
  puntos del seed) y las adjunta al informe.
- Un job `ci-vistas` (no obligatorio) las sube como artefacto en los PR que tocan `src/**`.
- La skill `revisar-pantallas` de SK-03 explica cómo revisarlas antes de pedir la fusión.

---

## 2. Backend

### RV-84 · El servidor pierde suscripciones buenas y dos dueños se quitan el mismo endpoint · P1

**Problema.**

1. **Fallos pasajeros cuentan como definitivos.**
   - `fn_resultado_notificacion` suma un fallo con **cualquier** error y borra la suscripción al
     tercero (`0014:61`), también con un 5xx o un 429 pasajero de FCM.
   - El móvil sigue con `push=true` y enseña "Activado", pero ya no recibe nada.
   - RV-81 punto 4 lo recupera en el cliente. Aquí se evita la causa.
2. **Voluntario y jefatura en el mismo navegador comparten endpoint.**
   - `fn_guardar_suscripcion_push` hace `on conflict … set email = null` (0005:559), y la versión de
     administrador hace lo contrario (0006:579).
   - El último que activa se queda la fila, y el otro deja de recibir sin saberlo.

**Solución** (migración `0030`, misma firma de las tres funciones):

1. `fn_resultado_notificacion`:
   - solo `suscripcion_caducada = true` (la Function lo pone con 404 o 410) **borra**;
   - otros errores suman `fallos`, y se borra solo con `fallos >= 10` **y** `ultimo_envio` de hace
     más de 7 días, o nunca;
   - 05 §9 y DEC-118.
2. **Dueños:** el mismo endpoint puede tener **una fila por dueño**.
   - El índice único pasa de `(suscripcion->>'endpoint')` a
     `(suscripcion->>'endpoint', coalesce(dispositivo_id::text, email))`: índice nuevo y borrado del
     viejo, sin editar 0001.
   - `on conflict` usa el índice nuevo.
   - `/api/push` no cambia: cada notificación ya va a una `suscripcion_id`.
   - Compatibilidad con el frontend anterior: las RPC mantienen la firma.
3. `functions/api/push.ts`:
   - comprueba que marca `suscripcion_caducada` solo con 404 y 410;
   - con un 429 respeta `Retry-After`: deja la notificación reclamada para el siguiente minuto del
     Worker, sin sumar fallo.

**Tests.**

- pgTAP (`27_suscripciones_duenios.test.sql`):
  - el mismo endpoint guardado por un voluntario y por un administrador da dos filas, y ninguna pierde
    su dueño. Sobre `develop` queda una;
  - un error 5xx no borra; diez seguidos con `ultimo_envio` de hace 8 días, sí;
  - 404 borra al primero.
- `functions/api/push.test.ts`:
  - 429 con `Retry-After` → sin fallo y la notificación sigue pendiente;
  - 410 → `suscripcion_caducada: true`.

### RV-86 · Integración real de la suscripción · P1 · con RV-81

`e2e/integracion/avisos.spec.ts`, contra la pila local:

1. Una suscripción con forma real de FCM: endpoint `https://fcm.googleapis.com/fcm/send/…` de 152
   caracteres y claves de longitudes reales.
2. `fn_guardar_suscripcion_push` con un token de dispositivo de prueba crea la fila.
3. `fn_encolar` o la acción que genera un aviso crea la notificación.
4. `/api/push` con `X-Vigilancia` local la reclama, e intenta enviarla a un servidor de push falso
   levantado en el test. Apunta la Function a él con una variable solo de local (`PUSH_ENDPOINT_PRUEBAS`)
   que sustituye el host. **Nunca** en producción: `guarda-produccion.ts` lo comprueba.
5. El envío llega con cabeceras VAPID válidas: `aud`, `exp` y la firma verificada con la clave
   pública.

Así queda probado de punta a punta todo menos el servicio de push real.

---

## 3. Ops: herramientas para Claude Code y producción

Estas herramientas se instalan **en el propio repositorio**, así que cualquier sesión nueva de
Claude Code (Ops, Backend o Frontend, hoy o dentro de un año) las tiene sin hacer nada a mano.

| Qué | Tipo | Dónde queda |
|---|---|---|
| `pr-review-toolkit` | plugin oficial de Anthropic | `.claude/settings.json` |
| `code-review` | plugin oficial de Anthropic | `.claude/settings.json` |
| `security-guidance` | plugin oficial de Anthropic | `.claude/settings.json` |
| `paquete-rv` | skill propia | `.claude/skills/paquete-rv/SKILL.md` |
| `nueva-migracion` | skill propia | `.claude/skills/nueva-migracion/SKILL.md` |
| `revisar-pantallas` | skill propia | `.claude/skills/revisar-pantallas/SKILL.md` |

### SK-01 · Instalar los tres plugins oficiales · primero, un PR

Los tres plugins están en el marketplace oficial `anthropics/claude-code`, en la carpeta
`plugins/`.

1. **Añade el marketplace e instala los plugins**, desde la raíz del repositorio y en una sesión de
   Claude Code:

   ```
   /plugin marketplace add anthropics/claude-code
   /plugin install pr-review-toolkit
   /plugin install code-review
   /plugin install security-guidance
   ```

   - Si el nombre del marketplace que muestra `/plugin marketplace list` no es el que esperan los
     comandos, usa la forma `nombre-plugin@nombre-marketplace`.
   - Anota en DEC-114 los comandos exactos que funcionaron y la versión de cada plugin.
2. **Déjalos declarados a nivel de proyecto** en `.claude/settings.json`: el marketplace en
   `extraKnownMarketplaces` y los tres plugins en `enabledPlugins`. Así Claude Code los ofrece al
   abrir el repositorio.
   - Comprueba en la documentación de Claude Code (`code.claude.com/docs`, "plugins" y "settings") el
     nombre exacto de esas claves en la versión instalada, y cítalo en DEC-114.
   - Solo se versiona `.claude/settings.json`. Si `.claude/` está en `.gitignore`, añade las
     excepciones `!.claude/settings.json` y `!.claude/skills/`. Nunca se versionan
     `.claude/settings.local.json` ni credenciales.
3. **Cuándo se usa cada uno.** Añade estas filas a la tabla de CLAUDE.md §8:

   | Plugin | Úsalo cuando |
   |---|---|
   | `pr-review-toolkit` | antes de `gh pr merge --auto` de cualquier PR de código. Sobre todo con sus agentes de fallos silenciosos (RV-81 es un caso de manual), de cobertura de tests y de manejo de errores. |
   | `code-review` | en cada PR de código, después de `pr-review-toolkit`. Los hallazgos de confianza alta se arreglan en el mismo PR; los demás se anotan en el PR con su motivo. |
   | `security-guidance` | siempre activo. Si avisa al tocar `functions/**`, RLS, `grant`, CSP, secretos o `scripts/arranque.ts`, el aviso se contesta en el PR. |

4. **CLAUDE.md §5.5.** Una línea más en la definición de terminado del PR: "Revisado con
   `pr-review-toolkit` y `code-review`; los hallazgos, resueltos o explicados en el PR."

**Comprobación:**

- Una sesión nueva de Claude Code abierta en una copia limpia del repositorio (`git worktree add`)
  lista los tres plugins con `/plugin`, sin instalar nada.
- Anota el resultado en el registro de Ops.
- **Test:** `scripts/herramientas.test.ts` (nuevo) comprueba que `.claude/settings.json` existe, es
  JSON válido, nombra el marketplace y los tres plugins, y no contiene nada con forma de secreto
  (reutiliza los patrones de `detectar-secretos.ts`).

### SK-02 · Las prohibiciones de CLAUDE.md §3 como hooks

Hooks `PreToolUse` escritos en `.claude/settings.json`, sin plugin adicional. Cada uno llama a un
script pequeño en `.claude/hooks/`, en Node y sin dependencias, que **bloquea** la acción con el
mensaje de la regla, en español:

| Acción bloqueada | Regla |
|---|---|
| `supabase db push` | CLAUDE.md §3 |
| editar o borrar un archivo que ya existe en `supabase/migrations/` (solo se crean nuevos) | CLAUDE.md §3 |
| `git push --force` (o `-f`) a `develop` o `main` | CLAUDE.md §6 |
| escribir `console.log(` en `src/**` o `functions/**` | CLAUDE.md §3 |
| `git add` de `.env*`, `.dev.vars`, `*.sql` en la raíz o `*.pmtiles` fuera de `public/mapabase/` | CLAUDE.md §3, `docs/18` RV-37 |

- En CLAUDE.md §3 añade una línea: "Estas reglas las hace cumplir también `.claude/settings.json`
  (hooks)."
- Anota la decisión en DEC-115.
- **Test:** `scripts/probar-hooks.ts` ejecuta cada script de `.claude/hooks/` con una entrada simulada
  en el formato JSON que Claude Code pasa a los hooks. Comprueba que bloquea el caso prohibido (código
  de salida de bloqueo) y deja pasar el permitido. Añádelo a `ci-calidad`.

### SK-03 · Instalar las tres skills propias del proyecto

Crea estas tres carpetas con su `SKILL.md`, **con este contenido como punto de partida**. Ajústalo a
los nombres reales de scripts y specs si alguno difiere, pero sin quitar pasos. El `name` y la
`description` del encabezado son los que Claude Code usa para decidir cuándo cargar cada skill: que
digan cuándo usarla.

**`.claude/skills/paquete-rv/SKILL.md`**

```markdown
---
name: paquete-rv
description: Ciclo completo de un paquete de puntos RV/GM de una especificación docs/NN de este repositorio, desde la rama hasta la fusión automática. Úsala al empezar cualquier paquete de una especificación de cambios.
---

# Paquete RV

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
6. Si el paquete toca pantallas, usa la skill `revisar-pantallas`.
7. Revisión: `pr-review-toolkit` y luego `code-review`. Resuelve o explica cada hallazgo.
8. PR a `develop` con la plantilla: por cada punto, su test y "falló antes del arreglo: sí".
   `gh pr merge --auto --squash`. No esperes al CI: empieza el siguiente paquete.
9. Si el CI falla, arréglalo en esa rama antes de otra cosa.
10. Al fusionar, marca la casilla en la issue de coordinación con una línea: qué entró y qué PR.
```

**`.claude/skills/nueva-migracion/SKILL.md`**

```markdown
---
name: nueva-migracion
description: Crear una migración SQL del esquema hidrantes sin romper staging ni producción. Úsala siempre que haya que cambiar una tabla, función, vista, permiso o tarea pg_cron.
---

# Nueva migración

1. Solo la sesión Backend crea migraciones (docs/trabajo-en-paralelo.md §3). Si no eres Backend,
   pídela en la issue de coordinación.
2. Actualiza `docs/05` **antes** que el SQL.
3. Nunca edites ni borres una migración existente. Nunca `supabase db push`.
4. Para cambiar una función: `create or replace` con **la misma firma**, o `alter function … set/reset`.
   Firma nueva = función nueva, y la antigua se queda (compatibilidad con la versión anterior del
   frontend, 04 §12).
5. Toda tabla nueva lleva en la misma migración sus `grant` explícitos para `service_role` (y para
   `authenticated` o `anon` solo si 05 §5 lo dice) y su RLS. Toda función nueva, `revoke` de
   `public` y `grant` solo a quien la necesita. Escrituras con bloqueo por fila (05 §11).
6. pgTAP en `supabase/tests/NN_*.test.sql` (siguiente número libre): el comportamiento y los permisos.
7. `npm run migrar -- --local` dos veces (idempotencia), `npm run test:sql`, `npm run compatibilidad`.
8. **Justo antes de fusionar**, rebasa sobre `develop` y comprueba que tu número es el siguiente al
   último de `develop`. Si no, renómbralo. CI lo comprueba (`comprobar-migraciones-nuevas`).
```

**`.claude/skills/revisar-pantallas/SKILL.md`**

```markdown
---
name: revisar-pantallas
description: Revisar a ojo las pantallas de la app y del panel antes de fusionar un cambio visible. Úsala en cualquier PR que toque src/** o estilos, y cuando se pida una revisión visual de staging.
---

# Revisar pantallas

1. Ejecuta `npx playwright test e2e/vistas.spec.ts` con tu `PW_PUERTO` (docs/21 RV-88). Genera
   capturas a 412 × 915 (Android) y 1280 × 800, en claro y en oscuro.
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
```

- En CLAUDE.md §8 añade las tres skills a la tabla, con cuándo usarlas.
- Anota la decisión en DEC-116.
- **Test:** `scripts/herramientas.test.ts` comprueba también que las tres carpetas existen y que cada
  `SKILL.md` tiene encabezado con `name` y `description`.
- **Comprobación:** en una sesión nueva, las tres skills aparecen en la lista de skills disponibles.
  Anótalo en el registro de Ops.

### P-11 · Producción al día al cerrar

Igual que `docs/20` P-10: release, PR `develop → main` con merge commit, las dos aprobaciones del
desarrollador, y la paridad en verde. Anótalo en `paridad-produccion.md`.

---

## 4. Checklist final

- [ ] RV-81: en el Android del desarrollador, activar los avisos funciona o dice exactamente por qué
      no.
- [ ] RV-82: captura a 412 × 915 en el PR, con los controles alineados al borde y "Cercanos" abajo a
      la derecha.
- [ ] RV-84 y RV-86: pgTAP e integración en verde.
- [ ] Una notificación real llega al Android tras aprobar una propuesta suya en staging (pendiente
      desde `docs/19` §7).
- [ ] SK-01 a SK-03: una sesión nueva de Claude Code ve `pr-review-toolkit`, `code-review`,
      `security-guidance`, los hooks y las skills `paquete-rv`, `nueva-migracion` y
      `revisar-pantallas`, sin instalar nada.
- [ ] P-11: producción en la versión nueva, con la paridad en verde.
