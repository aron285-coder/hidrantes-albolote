# 17 · Especificación de cambios tras la revisión del 23 sep 2026

| | |
|---|---|
| **Para** | Claude Code, en este repositorio (`aron285-coder/hidrantes-albolote`) |
| **Base** | `develop` en `fac61de` (v0.4.0) |
| **Origen** | Revisión completa: checks automáticos, trazabilidad de 01/03/10/11 y revisión de código |
| **Estado de partida** | typecheck, lint, prettier, 1.147 tests de vitest, build, presupuesto y 185 e2e en verde; CI de `develop` en verde |
| **Prioridades** | **P0** antes del piloto (F9.2, issue #77) · **P1** antes de producción (F9.4, issue #79) · **P2** calidad y documentación |

Este documento no crea requisitos. Cada cambio corrige una desviación respecto de 01, 03, 05 o 10, o
un fallo que rompe FR-84 ("nada se pierde ni se duplica"), FR-168 o TR-07. Donde un cambio toca un
contrato o un documento propietario, se dice cuál actualizar. Lo que sí sería un requisito nuevo está
en §12 y **no se implementa** sin una decisión confirmada del desarrollador.

---

## 0. Cómo trabajar con este documento

1. **Lee CLAUDE.md entero primero.** Todas sus prohibiciones (§3) siguen vigentes. En particular:
   migraciones solo hacia adelante con `scripts/migrar.ts`, nada en `public`, ninguna escritura
   directa desde el frontend, textos solo en `src/lib/textos.ts` y en el Apéndice A de 06.
2. **Una issue por cada `RV-nn`**, en el milestone "Fase 9", con el `task-shaper`. El título es
   `RV-nn · <título>` y el cuerpo enlaza la sección de este documento. Puedes agrupar en una sola
   issue y PR los RV que este documento marca como "mismo PR".
3. **Rama `fase-9/rv-nn-nombre-corto`** desde `develop` y PR a `develop` con la plantilla rellena.
   El orden es el de §11.
4. **Tests primero.** En cada bug escribe primero el test de regresión y comprueba que **falla**
   sobre `develop`. Solo después aplica el arreglo y comprueba que pasa. Anota en el PR, en
   "Cómo lo he comprobado", el nombre del test y que ha fallado antes del arreglo. Sin ese test la
   issue no está terminada.
5. **Migraciones:** cada PR que toque SQL añade el siguiente número libre (`0012_…`, `0013_…`) en el
   momento de abrirlo. Nunca edites `0001`–`0011`. Para cambiar el cuerpo de una función existente
   usa `create or replace function` con **la misma firma**, y para cambiar solo un atributo usa
   `alter function … set/reset`. Cada migración debe ser compatible con el frontend de la versión
   anterior (04 §12, TR-107). `npm run compatibilidad` tiene que seguir en verde.
6. **Contratos:** antes de cambiar una tabla, columna, RPC o Function, actualiza 05 en el mismo PR
   (05 manda). Un texto nuevo de interfaz va a `textos.ts` **y** al Apéndice A de 06. Una decisión
   nueva va a 12 como entrada `DEC-082` y siguientes; aquí se proponen, y las marcadas como "bajo
   riesgo" puedes anotarlas y seguir (CLAUDE.md §5.3).
7. **Definición de terminado de cada RV:** los tests nombrados existen y pasan, CI está en verde, los
   documentos citados están actualizados y staging se ha comprobado con Playwright si el cambio se ve.
8. **Al terminar el bloque P0**, escribe `docs/verificacion/revision-p0.md` con qué RV se han hecho,
   qué tests los prueban y qué queda. Ídem para P1. Actualiza 09 §8. Añade este documento a
   `docs/INDICE.md` en el primer PR.

### Mapa de prioridades

| RV | Título | Prio | Toca |
|---|---|---|---|
| 01 | La cola deja paradas las propuestas añadidas durante un envío; sin timeouts de red | P0 | `src/lib/cola.ts`, `src/lib/supabase.ts` |
| 02 | Un fallo de IndexedDB es invisible: "guardado en el móvil" sin estarlo | P0 | `cola.ts`, `Proponer.tsx` |
| 03 | Errores desconocidos tratados como permanentes y sin forma de reintentar | P0 | `api.ts`, `cola.ts`, `MisPropuestas.tsx` |
| 04 | La cola no arranca al volver a entrar; cerrar sesión durante una subida resucita el envío | P0 | `cola.ts`, `acceso.ts` |
| 05 | "Sin revisar" y el tamaño del marcador se quedan viejos en el móvil (FR-61, FR-142) | P0 | `puntos.ts`, nuevo `src/lib/derivar.ts` |
| 06 | Puntos purgados de la papelera o datos restaurados no llegan a los móviles | P0 | SQL `fn_listar_puntos`, `puntos.ts`, `restaurar.ts` |
| 07 | Una propuesta puede aprobarse con una foto que la purga ya borró | P0 | SQL `fn_proponer`, `fn_fotos_referenciadas`, pg_cron |
| 08 | Los avisos push no salen solos y se pierden en lotes grandes (FR-163, FR-164) | P0 | SQL, `functions/api/push.ts`, `arranque.ts`, workflow nuevo, cliente |
| 09 | Un timeout del GPS apaga el seguimiento para siempre | P0 | `src/lib/posicion.ts` |
| 10 | El mapa base puede faltar sin aviso hasta que se pierde la cobertura (FR-81) | P0 | `mapabase.ts`, `Mapa.tsx` |
| 11 | GitHub desactiva los workflows programados tras 60 días sin actividad | P0 | `.github/workflows/mantener-activo.yml`, `vigilancia.yml` |
| 12 | Fotos en caché como respuestas opacas: agotan la cuota del origen | P0 | `vite.config.ts`, `Ficha.tsx` |
| 13 | `restaurar.ts` falla sobre un esquema existente | P1 | `scripts/restaurar.ts`, `ci.yml` |
| 14 | Código de acceso: bloqueo por inundación, IPv6 rotando y altas ilimitadas | P1 | SQL, `functions/api/verificar-codigo.ts`, `vigilancia.yml` |
| 15 | La sincronización de jefatura se corta en 1.000 puntos | P1 | `puntos.ts` |
| 16 | Jefatura sin servidor al arrancar acaba en la pantalla de entrada | P1 | `acceso.ts` |
| 17 | Moderación: `statement_timeout` sin efecto; un bloqueo tumba el lote entero | P1 | SQL |
| 18 | Fusión: no se elige la descripción y no se recalcula municipio, núcleo ni dirección (FR-106) | P1 | SQL `fn_fusionar_con_existente`, panel |
| 19 | Alta de jefatura con "otra medida" o correo largo se reintenta para siempre (FR-151) | P1 | `Proponer.tsx`, SQL `fn_proponer`, `cola.ts` |
| 20 | Novedades vacías en el panel y ausentes en la app (FR-167, AC-127) | P1 | script nuevo, build, Ajustes app y panel |
| 21 | Salud del sistema no conoce la versión del mapa base (FR-143) | P1 | `deploy-*.yml`, script |
| 22 | Salud: sin tamaño de la base de datos ni última ejecución de las tareas (TR-53, TR-54) | P1 | SQL `fn_salud`, `vigilancia.yml`, panel |
| 23 | Mis propuestas: retirar falla en silencio; correcciones con nombres de columna | P1 | `MisPropuestas.tsx` |
| 24 | Lista, Inventario y exportación se desvían de FR-68, FR-120 y FR-160 | P1 | `ListaPuntos.tsx`, `Inventario.tsx`, `exportar.ts` |
| 25 | Nominatim: User-Agent sin contacto y sin caché por coordenadas | P1 | `functions/_lib/nominatim.ts`, `functions/api/direccion.ts` |
| 26 | El trigger de anonimización acepta cualquier valor de `actor` | P1 | SQL |
| 27 | Los tests de rendimiento fallan al correr en paralelo | P2 | `playwright.config.ts`, `ci.yml` |
| 28 | Panel sin Firefox (TR-21) ni comprobación en tres anchos (TR-25) | P2 | Playwright, CI |
| 29 | Tamaño táctil sin medir: axe con reglas WCAG 2.1 (TR-32, TR-113) | P2 | `e2e/accesibilidad.spec.ts` |
| 30 | Tests que faltan: TR-41 (200/h), TR-90, TR-60, FR-55, FR-65, FR-70, AC-140 panel | P2 | pgTAP, e2e |
| 31 | La regla ESLint de textos deja pasar `.ts` y literales cortos | P2 | `eslint.config.js` |
| 32 | La documentación afirma más de lo probado; 05 va por detrás del SQL | P2 | docs |

---

## 1. Cola de envíos del móvil (FR-82–FR-84)

### RV-01 · La cola deja paradas las propuestas añadidas durante un envío; sin timeouts de red · P0

**Problema.**

- `procesarCola()` (`src/lib/cola.ts:218-257`) recorre una copia `[...items]` hecha al empezar. Una
  llamada mientras corre devuelve la misma promesa, sin ninguna vuelta más.
- Al terminar, `programar()` (`cola.ts:209-215`) solo pone temporizador a los envíos con
  `proximo > ahora`. Un envío nuevo tiene `proximo: 0` (`cola.ts:112`), así que no se programa.
- **Escenario:** la propuesta A está subiendo su foto con 3G lento y el voluntario envía la
  propuesta B. B no entra en la copia y nadie la vuelve a mirar hasta un evento `online`, un
  reintento por caída del servidor o un reinicio de la app.
  - `Proponer.tsx:122-127` hace `await procesarCola()`, recibe la promesa de la vuelta de A y enseña
    "guardado en el móvil" aunque haya cobertura.
  - "Reintentar" (`reintentarCola`) durante una vuelta tampoco sirve.
- Ningún `fetch` lleva timeout (`cola.ts:147`, `cola.ts:162`, las RPC de supabase-js). Con señal
  débil una vuelta puede colgarse minutos y bloquear toda la cola.

**Solución.**

1. En `cola.ts`, añade una bandera de módulo `otraVuelta = false`.
2. `procesarCola()`:
   - Si ya hay una vuelta en curso, pone `otraVuelta = true` y devuelve la **misma** promesa.
   - Esa promesa no se resuelve hasta terminar todas las vueltas pedidas, incluida la que se pidió
     durante la anterior. Así `await procesarCola()` en `Proponer` espera también a la propuesta
     recién encolada.
3. Mueve el cuerpo actual del `for` a `async function unaVuelta(c: Credencial): Promise<'seguir' | 'parar'>`:
   - Devuelve `'parar'` en los casos `TOKEN_*` y `SIN_SERVIDOR`, que hoy hacen `return` y `break`.
   - En cualquier otro caso devuelve `'seguir'`.
4. Nuevo cuerpo de la promesa (conserva el `await Promise.resolve()` inicial y su comentario):

   ```ts
   do {
     otraVuelta = false;
     if (typeof navigator !== 'undefined' && navigator.onLine === false) break;
     const c = await credencial();
     if (!c) break;
     if ((await unaVuelta(c)) === 'parar') break;
   } while (otraVuelta);
   ```

   `otraVuelta` se pone a `false` al principio de cada vuelta, así que no hay bucle infinito: solo
   se repite si alguien llamó durante la vuelta.
5. `finally` sin cambios: `procesando = null; programar();`.
6. **Timeouts.** Crea `src/lib/red.ts` con:

   ```ts
   export function conLimite(ms: number, senal?: AbortSignal): AbortSignal
   ```

   Usa `AbortSignal.timeout` y `AbortSignal.any` cuando existan, y si no, un `AbortController` con
   `setTimeout`. Hay que cubrir Safari 16. Aplícalo así:

   | Llamada | Límite |
   |---|---|
   | `POST /api/url-subida` | 20 s |
   | `PUT` de la foto | 120 s (5 MB en 3G ≈ 30 s, con margen) |
   | Todas las RPC | 30 s, en el `fetch` global del cliente de supabase-js (`createClient(url, clave, { global: { fetch } })` en `src/lib/supabase.ts`); respeta la `signal` que ya traiga la petición |

   Un aborto por timeout se trata como `SIN_SERVIDOR`, que ya es el caso del `catch`.

**Tests** (en `src/lib/cola.test.ts`, con `colaEnMemoria` y `_usarAlmacenCola`):

- `encola durante un envío en curso y sale en la misma llamada`:
  1. Simula `fetch` de `/api/url-subida` con una promesa que no se resuelve hasta que el test la
     suelta.
  2. Encola A (con foto) y, mientras A espera, encola B (sin foto, operación `datos`).
  3. Suelta la promesa y espera `procesarCola()`.
  4. Espera `colaActual()` vacía y `fn_proponer` llamado dos veces, primero A y después B.
  5. Sobre `develop` falla: B se queda en la cola.
- `reintentarCola durante un envío en curso reintenta también lo que esperaba retroceso`.
- `sin servidor, la vuelta extra no reintenta en bucle`: con `fn_proponer` devolviendo
  `SIN_SERVIDOR`, una llamada durante la vuelta produce como mucho **una** vuelta más, y después
  queda un temporizador de retroceso.
- `un PUT que no responde se corta y se reintenta`: `fetch` del PUT que nunca resuelve más un
  límite de prueba inyectable. El envío pasa a `intentos: 1` con `proximo > 0`. Para esto
  `conLimite` acepta un `ms` sobreescribible en tests; no uses relojes falsos para la red.
- `red.test.ts`: `conLimite` aborta a su tiempo y respeta una señal externa ya abortada.

**E2e** (`e2e/cola-atascada.spec.ts` o `e2e/operaciones.spec.ts`):

1. Simula `/api/url-subida` con 3 s de retraso.
2. Envía una revisión con foto y, antes de 3 s, una corrección de datos de otro punto.
3. Tras soltar el retraso, ambas desaparecen de "Mis propuestas · pendientes de enviar" sin
   recargar ni cambiar la red.

**Aceptación:** FR-84 y FL-03–FL-08 sin pasos de red manuales. No se toca el contrato.

### RV-02 · Un fallo de IndexedDB es invisible: "guardado en el móvil" sin estarlo · P0

**Problema.**

- `guardar()` (`cola.ts:83-90`) se traga el error de `bd().guardar`, así que `encolar()` nunca lanza.
- El error de guardado de `Proponer.tsx:128-131` no puede aparecer, y la pantalla dice "guardado en
  el móvil" con la propuesta solo en memoria. Si la app se cierra, se pierden la propuesta y su foto.
- Además nadie llama a `navigator.storage.persist()`, así que el navegador puede desalojar la cola
  (TR-07).

**Solución.**

1. Cambia la firma a `encolar(…): Promise<{ persistida: boolean }>`. Dentro:
   - Publica en memoria como hoy.
   - Intenta `bd().guardar(item)`. Si falla, `anotarError(e, 'cola')` y `persistida = false`.
   - Nunca lanza por IndexedDB. Sin IndexedDB (navegación privada) hay que poder enviar igual con
     cobertura.
2. `guardar()` interno, usado por reintentos, `foto_path` y `fallo`: sigue sin lanzar, pero hace
   `anotarError` una vez por sesión (bandera) para que el problema llegue a `errores_cliente`.
3. `Proponer.enviar()`, tras `await procesarCola()`:
   - Si el envío sigue en la cola **y** `persistida === false`, muestra un resultado nuevo
     `'solo_en_memoria'` con el texto propuesto "No se ha podido guardar en el móvil. No cierres la
     aplicación hasta que se envíe." y el botón "Reintentar ahora" (`reintentarCola`).
   - Si ya se envió, el resultado normal (`enviado` o `aplicado`).
   - Añade el texto al Apéndice A.
4. En `iniciarCola()`, llama una vez a `navigator.storage?.persist?.()` sin esperar el resultado,
   dentro de `try`. Guarda en `almacen` (`hidrantes.almacen_persistente`) el valor de
   `navigator.storage.persisted()` para enseñarlo en Ajustes → almacenamiento (una línea "Guardado
   protegido: sí / no", texto nuevo).

**Tests:**

- `cola.test.ts` · `encolar informa persistida=false si IndexedDB falla y sigue enviando`: un
  almacén cuyo `guardar` lanza. `encolar` resuelve `{ persistida: false }`, el envío sale con
  `fn_proponer` simulado y `anotarError` se llama.
- `cola.test.ts` · `encolar informa persistida=true con IndexedDB sano`.
- E2e `operaciones.spec.ts` · `sin IndexedDB avisa de no cerrar la aplicación`:
  1. `page.addInitScript` que sustituye `indexedDB.open` por una función que falla.
  2. `fn_proponer` cae (servidor caído).
  3. Se ve el texto del paso 3.
  4. Sobre `develop` se ve "guardado en el móvil", así que falla.

### RV-03 · Errores desconocidos tratados como permanentes y sin forma de reintentar · P0

**Problema.**

- `codigoDeError()` (`src/lib/api.ts:13-16`) convierte cualquier mensaje sin prefijo `CODIGO:` en
  `ERROR_INTERNO`.
- `ERROR_INTERNO` está en `PERMANENTES` (`cola.ts:34-41`).
- Un 401 por JWT caducado de jefatura, un `PGRST202` durante un despliegue o un 409 o 429 marcan el
  envío como `fallo` para siempre. Ni la vuelta ni `reintentarCola` (`cola.ts:265`) tocan los
  fallidos, y al voluntario solo le queda "Descartar".

**Solución.**

1. `api.ts`: `codigoDeError` devuelve `DESCONOCIDO` en vez de `ERROR_INTERNO` cuando no hay prefijo.
   - Añade también el mapeo `status === 401 || status === 403 || code === '42501'` →
     `NO_AUTORIZADO`, como ya hace `functions/_lib/comun.ts:103`.
   - Busca todos los usos de `ERROR_INTERNO` en `src/` y ajústalos para que el comportamiento
     visible no cambie fuera de la cola.
   - `textoError()` trata `DESCONOCIDO` igual que el genérico de hoy.
2. `cola.ts`:
   - `PERMANENTES` queda en `PAYLOAD_INVALIDO`, `FOTO_OBLIGATORIA`, `PUNTO_NO_ENCONTRADO`,
     `PUNTO_NO_ACTIVO` y `DIAMETRO_SIN_FIJAR` (este último, de RV-19).
   - `NO_AUTORIZADO` deja de ser permanente para jefatura: sin sesión válida se reintenta con
     retroceso y `comprobarAcceso` lo resuelve. Para el voluntario los `TOKEN_*` ya van aparte.
   - `DESCONOCIDO` y `ERROR_INTERNO` se reintentan con retroceso. Tras **5 intentos** seguidos con
     un código no transitorio se marca `fallo` con ese código. Así no se insiste para siempre y el
     envío sigue siendo recuperable a mano.
3. Nueva `reintentarFallido(clave)` en `cola.ts`: quita `fallo`, pone `intentos: 0, proximo: 0` y
   llama a `procesarCola()`.
4. `MisPropuestas.tsx`: en las tarjetas con `fallo`, añade el botón "Reintentar" (texto nuevo) junto
   a "Descartar", con ≥ 12 px de separación (UI-13) y confirmación solo en "Descartar", como hoy.
5. Actualiza 05 §8 con `DESCONOCIDO` como código **solo de cliente**; no sale de ninguna RPC.

**Tests:**

- `api.test.ts`: los mensajes `PGRST202…` y `JWT expired` dan `DESCONOCIDO`, y un status 401 da
  `NO_AUTORIZADO`.
- `cola.test.ts` · `un error desconocido se reintenta y no marca fallo`: primer `fn_proponer` con
  `{ message: 'PGRST202 …' }` y el segundo bien. La cola queda vacía.
- `cola.test.ts` · `cinco desconocidos seguidos marcan fallo`.
- `cola.test.ts` · `reintentarFallido vuelve a enviar un envío fallido`.
- E2e `cola-atascada.spec.ts` · `un envío fallido se puede reintentar desde Mis propuestas`.

### RV-04 · La cola no arranca al volver a entrar; cerrar sesión durante una subida resucita el envío · P0 · mismo PR que RV-03

**Problema A.**

- Un `TOKEN_*` corta la vuelta sin temporizador (`cola.ts:234-238`).
- `entrarConCodigo()` (`src/lib/acceso.ts:122-131`) solo llama a `sincronizar`.
- Lo encolado espera a un `online` o a reiniciar la app.

**Problema B.**

- `vaciarCola()` (`cola.ts:122-129`) vacía la cola mientras `subirFoto()` está en vuelo.
- Al volver, `guardar({...item, foto_path})` (`cola.ts:174`) reescribe el envío en memoria y en
  IndexedDB, y `enviarUno` lo envía con el token viejo.
- Si falla, se queda en el móvil y sale más tarde firmado por quien entre después. Eso contradice el
  aviso de cierre de sesión (FL-12) y FR-27.

**Solución.**

1. `entrarConCodigo`, tras `guardarSesion(...)`: `void reintentarCola()`. Haz lo mismo en
   `comprobarAcceso` cuando pasa a `jefatura`.
2. **Generación de la cola:** `let generacion = 0`.
   - `vaciarCola()` hace `generacion++` **antes** de publicar la cola vacía.
   - `procesarCola`/`unaVuelta` capturan `const gen = generacion` al empezar.
   - `enviarUno` recibe `gen`, y `subirFoto` y `guardar` reciben un `gen` opcional: si
     `gen !== generacion` no escriben nada y devuelven `{ ok: false, codigo: 'COLA_VACIADA' }`.
   - `unaVuelta` devuelve `'parar'` con ese código.
3. `subirFoto`, además, solo guarda `foto_path` si el envío sigue existiendo en `items`, en vez de
   dar por hecho que está.

**Tests:**

- `cola.test.ts` · `cerrar sesión durante la subida no resucita el envío`: PUT retenido, luego
  `vaciarCola()`, luego se suelta el PUT. `colaActual()` vacía, el almacén vacío y `fn_proponer`
  **no** llamado.
- `acceso.test.ts` · `al volver a entrar con el código se reintenta la cola`: espía sobre
  `reintentarCola`.

---

## 2. Sincronización y datos en el móvil

### RV-05 · "Sin revisar" y el tamaño del marcador se quedan viejos en el móvil (FR-61, FR-142) · P0

**Problema.**

- `v_puntos_activos` calcula `revision_caducada` y `radio_px` en la lectura (`0002_vistas.sql:87-90`).
- Tras la primera sincronización el móvil solo recibe filas con `actualizado_en > desde`
  (`0005:170`), así que un punto que cruza los 12 meses sin cambiar nunca se ve discontinuo ni sale
  en el filtro "sin revisar".
- `fn_listar_puntos` devuelve `config` (`0005:180-186`) y `puntos.ts` la ignora (`Listado`, líneas
  14-18). 05 §10 dice que el móvil la aplica, y FR-142 dice "los móviles los aplican en su siguiente
  sincronización".

**Solución.** El móvil deriva los dos campos de los datos del punto y de la `config` recibida, igual
que hace la vista.

1. Crea `src/lib/derivar.ts`:

   ```ts
   export interface ConfigMovil { meses_revision: number; escala_radios: [number, number, number, number, number]; }
   export const CONFIG_POR_DEFECTO: ConfigMovil = { meses_revision: 12, escala_radios: [11, 9, 7, 5.5, 5] };
   /** Réplica exacta de hidrantes.fn_radio_px (0002_vistas.sql:29-45). */
   export function radioPx(diametro_mm: number, caudal: Caudal, escala: ConfigMovil['escala_radios']): number;
   /** Réplica de `fecha_ultima_revision < current_date - make_interval(months => meses)`. */
   export function revisionCaducada(fecha: string, meses: number, hoy?: Date): boolean;
   export function derivar(p: Punto, c: ConfigMovil, hoy?: Date): Punto;
   export function leerConfig(bruta: unknown): ConfigMovil | null; // valida tipos; null si no sirve
   ```

   - **Puntuación de `radioPx`:** diámetro 100 = 3, 70 = 2, 45 = 1, otro = 0. Se multiplica por el
     factor de caudal: bueno 1, regular 0,66, malo 0,33, no funciona 0.
   - **Índice de la escala por umbral:** ≥ 3,0 → 0; ≥ 1,9 → 1; ≥ 0,9 → 2; > 0 → 3; si no, 4.
   - **Resta de meses:** Postgres ajusta al último día del mes (31-mar − 1 mes = 28 o 29-feb).
     Replícalo. `hoy` es la fecha local del móvil (`Europe/Madrid`); escribe en el comentario que
     puede diferir un día del servidor alrededor de medianoche, y que eso es aceptable.
2. En `puntos.ts`:
   - Añade `config?: unknown` a `Listado`.
   - En `sincronizar()`, `const cfg = leerConfig(listado.config) ?? configGuardada ?? CONFIG_POR_DEFECTO`.
     Guárdala en meta (`bd().escribirMeta('config', cfg)`) y en memoria.
   - Aplica `derivar(p, cfg)` a **todos** los puntos resultantes de `aplicarListado`, no solo a los
     recibidos, antes de guardarlos y publicarlos.
   - Aplica `derivar` también en `cargarGuardados()`, con la config de meta.
   - Añade un `rederivarSiCambiaElDia()` que se llama en `visibilitychange` visible: si la fecha
     local cambió desde la última derivación, vuelve a derivar sin red.
   - Jefatura (`leerComoJefatura`) lee la vista completa cada vez, así que sus valores ya son
     frescos. Sin `config` en la respuesta, **no** se re-deriva.
3. `v_puntos_activos` no cambia: sigue siendo la fuente del panel y de la exportación.

**Tests:**

- `src/lib/derivar.test.ts`, tabla con al menos estos casos:
  - Las 15 combinaciones de diámetro {45, 70, 100} × caudal {bueno, regular, malo, no_funciona}
    con la escala por defecto y con una escala distinta.
  - Fechas: `hoy` = 2026-03-31 con meses=1 frente a 2026-02-28 (no caducada), 2026-02-27
    (caducada) y año bisiesto 2028-03-31 frente a 2028-02-29.
  - El límite exacto: `fecha == hoy − meses` no está caducada, porque la comparación es estricta.
  - `leerConfig` con basura devuelve null.
- `puntos.test.ts` · `una sincronización incremental vacía marca caducado un punto que cruzó el umbral`:
  1. Estado guardado con un punto de `fecha_ultima_revision` = hoy − 13 meses y
     `revision_caducada: false`.
  2. `fn_listar_puntos` devuelve `puntos: []` y `config.meses_revision: 12`.
  3. Tras `sincronizar`, el punto tiene `revision_caducada: true`. Sobre `develop` falla.
- `puntos.test.ts` · `cambiar escala_radios cambia el radio de puntos no modificados`.
- `puntos.test.ts` · `al arrancar sin red se re-deriva con la config guardada`.
- **Paridad con el servidor** en `e2e/integracion/fase5.spec.ts`, o un spec nuevo de integración:
  con la pila real y el seed, llama a `fn_listar_puntos` y comprueba que para **cada** punto
  `radioPx(...) === radio_px` y `revisionCaducada(...) === revision_caducada`. Elige un momento del
  día sin riesgo de medianoche o fija `hoy` a la fecha del servidor.
- E2e `mapa.spec.ts` · `un punto que cruza los 12 meses se ve sin revisar sin cambios en el servidor`:
  1. Primera sincronización completa con un punto revisado hace 11 meses y 29 días.
  2. Avanza el reloj de la página con `page.clock` (aquí el reloj es del navegador, no de la red) dos
     días y fuerza `visibilitychange`.
  3. El filtro "Sin revisar" de la Lista lo muestra.

**Documentos:** 05 §10, una frase: "el móvil deriva `revision_caducada` y `radio_px` con la `config`
recibida". DEC-082 (bajo riesgo).

### RV-06 · Puntos purgados de la papelera o datos restaurados no llegan a los móviles · P0

**Problema A.**

- `bajas` (`0005:172-176`) solo lista puntos que **todavía existen** con `situacion <> 'activo'`.
- `fn_purgar_papelera_interna` (`0006:337-349`) borra la fila a los 30 días.
- Un móvil que no sincronizó entre el borrado y la purga no recibe nunca la baja y sigue enseñando
  ese hidrante. Con voluntarios que abren la app una vez al mes es realista.

**Problema B.**

- Tras `npm run restaurar` los puntos vuelven a un estado anterior, con `actualizado_en` antiguos.
- Los móviles con un sello más reciente no reciben lo restaurado ni las bajas de lo que el respaldo
  no tenía.

**Solución.**

1. **Migración:** `create or replace function hidrantes.fn_listar_puntos(token text, desde timestamptz default null)`
   con la misma firma. Cambios:
   - `bajas` = unión **distinta** de:
     - lo de hoy;
     - `select r.punto_id from hidrantes.registro r where r.accion = 'purga_papelera' and r.momento > desde and r.punto_id is not null`.
       Usa `registro_momento_idx`.
   - `config` añade `'epoca_datos', hidrantes.fn_config('epoca_datos', 'null')`.
2. **`restaurar.ts`:** dentro de la misma transacción, después del volcado, hace un upsert en
   `config` de `epoca_datos = to_jsonb(gen_random_uuid()::text)` con
   `actualizado_por = 'restaurar.ts'`.
3. **Cliente (`puntos.ts`):**
   - Guarda `epoca_datos` en meta.
   - Si llega una `epoca_datos` distinta de la guardada, y la guardada no es null, repite **en la
     misma llamada** una sincronización completa (`desde: null`, `vaciar=true`).
   - Además, fuerza una sincronización completa si la última completa (meta nueva `completo_en`)
     tiene más de **7 días**. Es la red de seguridad para cualquier otra deriva, y cuesta una lectura
     de unos 1.000 puntos por semana y móvil. Anótalo en DEC-083.
4. 05 §10: documenta `bajas` (incluye purgados) y `epoca_datos`.

**Tests:**

- pgTAP en `05_rpc_voluntario.test.sql`, o `10_sincronizacion.test.sql` nuevo:
  - Un punto borrado a papelera con `borrado_en = now() - 31 days`, luego
    `fn_purgar_papelera_interna('test')`. `fn_listar_puntos(token, now() - interval '40 days')`
    tiene su id en `bajas`. Sobre `develop` falla.
  - `bajas` no repite ids.
  - `config ? 'epoca_datos'`.
- `puntos.test.ts`:
  - `una época de datos distinta fuerza la sincronización completa`: dos llamadas, la segunda con
    `desde: null`, y el almacén reemplazado.
  - `siete días sin completa fuerzan una completa`.
  - `la primera época (null → valor) no fuerza nada`.
- `scripts/restaurar.test.ts`: `sqlRestauracion()` contiene el upsert de `epoca_datos` después del
  volcado y antes de `commit`.

---

## 3. Fotos y almacenamiento

### RV-07 · Una propuesta puede aprobarse con una foto que la purga ya borró · P0

**Problema.**

- `fn_fotos_referenciadas` (`0007:8-15`) solo protege las reservas de menos de 24 h.
- `fn_proponer` (`0005:426-432`) acepta cualquier reserva del mismo dispositivo, sea de cuándo sea.
- **Escenario:**
  1. La foto se sube y `fn_proponer` falla por falta de cobertura.
  2. El móvil pasa más de 24 h sin red.
  3. La purga semanal (`purgar-fotos.yml`, lunes 04:43) borra el archivo.
  4. El reintento de `fn_proponer` **tiene éxito**.
  5. Jefatura aprueba y el punto se queda con un `foto_path` que no existe, aunque la foto es
     obligatoria.
- Además, `subidas` crece sin límite.

**Solución.**

1. **Migración:**
   - `insert into hidrantes.config (clave, valor) values ('dias_reserva_subida', '7') on conflict do nothing`.
   - `create or replace function hidrantes.fn_fotos_referenciadas()` (misma firma): la tercera rama
     pasa a `reservada_en > now() - make_interval(days => dias_reserva_subida)`.
   - `create or replace function hidrantes.fn_proponer(...)` con la **firma exacta** actual (copia
     la cabecera de `0005:349-357`). El `update … subidas` añade:

     ```sql
     and (s.confirmada_en is not null
          or s.reservada_en > now() - make_interval(days => dias_reserva_subida - 1))
     ```

     Así una reserva sin confirmar de más de 6 días da `FOTO_NO_RESERVADA`, un día antes de que la
     purga pueda borrarla. El cliente ya vuelve a subir la foto con ese código (`cola.ts:192-195`),
     porque el `Blob` sigue en la cola.
   - Tarea pg_cron `hidrantes_purgar_subidas` a las `57 3 * * *`:
     `delete from hidrantes.subidas where reservada_en < now() - interval '30 days'`.
     La idempotencia de `fn_proponer` va por `clave_local`, antes de mirar la foto (`0005:382-391`),
     así que borrar reservas viejas no rompe los reintentos.
2. Actualiza 04 §7 (ventana de 24 h → `dias_reserva_subida`, 7 días), 05 §2.6 y §2.10 (clave
   nueva) y la tabla de tareas programadas. DEC-084.
3. Mientras sigas con la firma de `fn_proponer`, aprovecha para RV-17 (atributos) y RV-19 (autor de
   jefatura) en el mismo PR, o coordina el orden.

**Tests (pgTAP):**

- `fn_proponer rechaza una reserva sin confirmar de hace 6 días y 1 hora con FOTO_NO_RESERVADA`.
  Sobre `develop` acepta.
- `fn_proponer acepta una reserva sin confirmar de hace 5 días`.
- `fn_fotos_referenciadas incluye una reserva de hace 6 días y excluye una de hace 8`.
- `la tarea hidrantes_purgar_subidas existe` (`cron.job`) y su SQL borra solo las de más de 30 días.
- `cola.test.ts` (ya cubierto en parte): tras `FOTO_NO_RESERVADA` el siguiente intento vuelve a
  pedir `/api/url-subida`. Comprueba que existe; si no, añádelo.

### RV-12 · Fotos en caché como respuestas opacas: agotan la cuota del origen · P0

**Problema.**

- `<img src={url}>` en `Ficha.tsx:36` no lleva `crossOrigin`, así que Workbox guarda respuestas
  opacas (`cacheableResponse: { statuses: [0, 200] }`, `vite.config.ts:85`).
- Chrome cuenta cada respuesta opaca como unos 7 MB de cuota. Con `maxEntries: 800` pueden ser
  varios GB contados. La cuota del origen se comparte con IndexedDB (puntos y cola) y con el mapa
  base, así que un fallo de escritura por cuota llega a RV-02.

**Solución.**

1. Verifica primero, contra un objeto real de staging, que Storage responde con CORS:
   `curl -sI -H 'Origin: https://hidrantes-albolote-staging.pages.dev' <url pública de una foto>`
   debe traer `access-control-allow-origin`. Anota el resultado en el PR.
   - Si **no** lo trae, para y escribe en la issue: la alternativa es cachear por la API de Storage
     y requiere decisión.
2. `Ficha.tsx`: `crossOrigin="anonymous"` en el `<img>` y en cualquier otro `<img>` de fotos de
   Storage. Revisa también `DetallePropuesta.tsx` y `MinimapaPropuesta.tsx`.
3. `vite.config.ts`, `runtimeCaching` de fotos:
   - `cacheableResponse: { statuses: [200] }`;
   - `expiration: { maxEntries: 800, maxAgeSeconds: 180 * 24 * 3600, purgeOnQuotaError: true }`.
4. La CSP (`config/cabeceras.ts`) no cambia; comprueba que `img-src` ya permite el origen de
   Storage.

**Tests:**

- `src/lib/pwa.test.ts`, o uno nuevo sobre la config exportada: la regla de fotos solo acepta 200 y
  tiene `purgeOnQuotaError`. Si `vite.config.ts` no exporta la regla, extráela a
  `config/cache-fotos.ts` e impórtala en ambos sitios.
- E2e `mapa.spec.ts` · `la foto de la ficha se pide en modo cors`: con `page.route` sobre la URL de
  la foto, `route.request().headers()['sec-fetch-mode'] === 'cors'` y la respuesta simulada lleva
  `access-control-allow-origin: *`.

---

## 4. Avisos push (FR-163, FR-164)

### RV-08 · Los avisos push no salen solos y se pierden en lotes grandes · P0

**Problema A: nada los envía a tiempo.**

- 05 §9 y DEC-068 dicen que una tarea diaria envía los avisos pendientes. No existe:
  `vigilancia.yml` no llama a `/api/push` y `VIGILANCIA_SECRETO` no se crea en ningún sitio
  (`functions/api/push.ts:25-26` lo espera).
- Hoy solo se envía cuando un voluntario termina una sincronización (`acceso.ts:112`,
  `pedirEnvioPush`) o cuando jefatura abre el panel (`push-jefatura.ts:65-69`).
- Aprobar o rechazar en el panel no envía nada, y el resumen semanal del lunes
  (`0009:118`) espera a que alguien abra la app.

**Problema B: se pierden.**

- `/api/push` reclama hasta **100** avisos (`push.ts:45`) y los marca `enviada_en` **antes** de
  enviarlos (`0007:19-35`).
- Cada aviso gasta 2 peticiones de salida (el push más `fn_resultado_notificacion`). El plan
  gratuito de Workers/Pages Functions permite **50 por invocación**.
- A partir del aviso 24 o 25 `fetch` lanza. `rpc()` se traga el fallo de `fn_resultado`, y esos
  avisos quedan como enviados sin haber salido. Un `fn_aprobar_lote` de 30 propuestas lo provoca.

**Solución.**

1. **Migración:**

   ```sql
   alter table hidrantes.notificaciones
     add column reclamada_en timestamptz,
     add column intentos smallint not null default 0;
   ```

   - `create or replace function hidrantes.fn_reclamar_notificaciones(limite integer default 100)`,
     misma firma para que la Function anterior siga valiendo (04 §12):
     - Candidatas: `enviada_en is null and error is null and (reclamada_en is null or reclamada_en < now() - interval '15 minutes')`.
     - Límite efectivo `greatest(least(coalesce(limite, 20), 50), 1)`.
     - Pone `reclamada_en = now(), intentos = intentos + 1`, y **no** `enviada_en`.
     - Las que llegan a `intentos > 3` se marcan `error = 'SIN_RESPUESTA'` y no se devuelven.
   - `create or replace function hidrantes.fn_resultado_notificacion(...)` (misma firma): con
     `ok = true`, además de lo de hoy, `update notificaciones set enviada_en = now() where id = notificacion_id`.
   - Ajusta el índice parcial: `create index … on notificaciones (creada_en) where enviada_en is null and error is null`
     y borra el viejo si sobra (es un índice, no una migración aplicada).
   - La consulta de `vigilancia.yml` ("más de dos horas sin salir") sigue siendo válida.
   - **Compatibilidad:** la Function antigua llama a `fn_resultado` por cada aviso, así que durante
     el despliegue también marca `enviada_en`. Explícalo en el PR.
2. **`functions/api/push.ts`:**
   - Reclama con `limite: 20`: 20 × 2 + 2 = 42 < 50 peticiones.
   - Si `fn_resultado_notificacion` falla, cuenta `sin_anotar++`. El aviso queda reclamado y saldrá
     otra vez a los 15 minutos. Un duplicado es preferible a una pérdida; dilo en un comentario.
   - Responde `{ enviadas, fallidas, sin_anotar, quedan: pendientes.length === 20 }`.
3. **Workflow nuevo `.github/workflows/avisos.yml`:**
   - `schedule: '*/15 * * * *'`, `workflow_dispatch`, `concurrency: avisos`, sin `environment`
     (DEC-071: `production` pediría aprobación en cada ejecución).
   - Matriz `[PROD, STAGING]`. Llama `POST https://<app>/api/push` con cabecera `X-Vigilancia` desde
     el secreto de repositorio `VIGILANCIA_SECRETO_<ENTORNO>`.
   - Repite mientras `quedan === true`, como mucho 10 veces.
   - Con un 5xx, reintenta una vez. Con un 401/503 persistente, escribe en `$GITHUB_STEP_SUMMARY` y
     sale en rojo; la vigilancia diaria ya abre una issue por avisos atascados.
   - En un repositorio público los minutos de Actions no cuentan (coste 0 €, TR-53).
4. **`scripts/arranque.ts`:**
   - Genera `VIGILANCIA_SECRETO` (32 bytes, base64url) por entorno si falta.
   - Lo sube como secreto cifrado de Pages (mismo mecanismo que `VAPID_PRIVATE_KEY`) **y** como
     secreto de repositorio `VIGILANCIA_SECRETO_PROD` o `_STAGING` con `gh secret set`.
   - Añade `vigilancia` a los valores de `--rotar`.
   - Actualiza la tabla de secretos que imprime (`arranque.ts:560-563`), 04 y `docs/entornos.md`.
   - Esto requiere que el desarrollador ejecute `npm run arranque -- --rotar vigilancia` una vez por
     entorno. Añádelo como paso con el tiempo estimado (2 min) en la issue y en 15.
5. **Cliente:**
   - Panel: tras cada `fn_aprobar`, `fn_aprobar_con_correcciones`, `fn_rechazar`,
     `fn_fusionar_con_existente` y `fn_aprobar_lote` con éxito, `void pedirEnvioComoJefatura()`.
     Hazlo en `refrescar()` de `src/lib/panel/cola.ts` o en cada acción, sin duplicar llamadas en un
     lote.
   - App: en `enviarUno`, tras un `fn_proponer` bueno, `pedirEnvioPush(token)` (voluntario) o
     `pedirEnvioComoJefatura()` (jefatura), para que "nueva propuesta" salga al momento. Como mucho
     una llamada por vuelta de cola.
6. 05 §2.13 (columnas), §9 (`/api/push` y su respuesta), 04 (workflow y secreto), DEC-068
   (actualiza: ya no es diaria sino cada 15 min).

**Tests:**

- pgTAP en `06_rpc_jefatura.test.sql` o `10_…`:
  - `reclamar no marca enviada_en`.
  - `una reclamada hace 16 min se vuelve a reclamar; una de hace 5 min no`.
  - `al cuarto intento queda error = SIN_RESPUESTA`.
  - `resultado ok marca enviada_en`.
  - `el límite se acota a 50`.
  - Concurrencia con dblink (patrón de `07_concurrencia_rpc.test.sql`): dos sesiones reclaman a la
    vez sin repetir ids.
- `functions/api/push.test.ts`:
  - `reclama 20 y responde quedan=true cuando llegan 20`.
  - `si fn_resultado falla cuenta sin_anotar y no lanza`.
  - `no hace más de 50 fetch por invocación con 20 avisos`: cuenta las llamadas al `fetch` simulado.
- `src/lib/panel/cola.test.ts`: `aprobar pide el envío de avisos una vez`; `un lote pide el envío una sola vez`.
- `cola.test.ts`: `un fn_proponer bueno pide el envío de avisos`.
- `scripts/probar-functions.ts`: `POST /api/push` con `X-Vigilancia` correcto → 200 (con VAPID de
  prueba en local) o 503 `NO_CONFIGURADO`, nunca 401. Con cabecera incorrecta → 401.
- Un test de la sintaxis del workflow: `scripts/*.test.ts` que lee `avisos.yml` y comprueba el cron,
  la matriz y que no declara `environment`. Sigue el patrón de otros tests de workflows si existen.

---

## 5. Posición y mapa base

### RV-09 · Un timeout del GPS apaga el seguimiento para siempre · P0

**Problema.**

- En `src/lib/posicion.ts:47-51`, cualquier error de `watchPosition` (también `TIMEOUT` y
  `POSITION_UNAVAILABLE`) hace `clearWatch` y fija `no_disponible`.
- 30 s (`timeout: 30_000`) es lo que tarda a veces el primer fix en la calle. Con un solo timeout el
  alta se queda sin GPS: `gps_*` null, `origen` manual, y el formulario pide mover el pin.

**Solución.**

- Solo `PERMISSION_DENIED` hace `clearWatch` y fija `denegada`.
- Con `TIMEOUT` o `POSITION_UNAVAILABLE`:
  - si ya había una posición buena, **se mantiene** `tipo: 'ok'` con la última posición y se marca
    `antigua: true`;
  - si no la había, se fija `no_disponible`, pero la vigilancia **sigue activa**, y el siguiente fix
    pasa a `ok`.
- Añade `antigua?: boolean` a la posición. Si la posición tiene más de 60 s, el halo de precisión se
  pinta atenuado (06 §4; si no hay token, usa la opacidad existente de "atenuado" y anótalo).
- Sube `timeout` a 60 s. `maximumAge` sigue en 15 s.

**Tests** (`posicion.test.ts`; créalo si no existe, con `navigator.geolocation` simulado):

- `un TIMEOUT sin fix previo deja no_disponible y no llama a clearWatch`.
- `un fix posterior al TIMEOUT pasa a ok`. Sobre `develop` falla.
- `un TIMEOUT con fix previo mantiene ok con antigua=true`.
- `PERMISSION_DENIED para la vigilancia`.
- E2e `instalar-y-posicion.spec.ts` · `el alta recupera el GPS tras un primer timeout`, con
  `context.setGeolocation` después de simular un error inicial (inyecta el error con
  `addInitScript` que envuelve `watchPosition`).

### RV-10 · El mapa base puede faltar sin aviso hasta que se pierde la cobertura (FR-81) · P0

**Problema.**

- La descarga automática solo corre al arrancar y solo con wifi (`mapabase.ts:100-119`). En Android
  con datos, `connection.type === 'cellular'` la bloquea.
- El mapa solo avisa de que falta el mapa base cuando **ya** no hay red (`Mapa.tsx:91-96`).
- Una versión nueva solo se ofrece dentro de Ajustes.
- FR-81 pide: "Si falta, el mapa lo avisa al arrancar" y "la aplicación ofrece descargarla".

**Solución.**

1. `mapabase.ts`:
   - `iniciarMapabase()` registra, además, escuchas de `online` y de `navigator.connection` `change`
     (si existe). Si `!estado.descargado && conexionPermiteDescarga()`, descarga.
   - Añade una guarda para no lanzar dos descargas a la vez.
   - Quita las escuchas tras la descarga.
2. `Mapa.tsx`:
   - Con `!mapabase.descargado`, **aviso siempre**, con o sin red, no bloqueante. Hay dos variantes
     (textos nuevos, Apéndice A):
     - con red: "El mapa base no está en el móvil: sin cobertura el fondo quedará vacío." con el
       botón "Descargar (4,4 MB)", cuyo tamaño sale de `BYTES_MAPABASE` y `T.formato`;
     - sin red: el `T.mapa.mapaNoDescargado` de hoy.
   - Mientras descarga, el botón se sustituye por el progreso (`estado.progreso`). No lo dejes como
     botón deshabilitado sin motivo (UI-02).
   - Con `hayVersionNuevaMapabase()`, aviso con el botón "Descargar versión nueva", ocultable durante
     la sesión.
   - El aviso de capa sin cobertura sigue teniendo prioridad sobre estos dos.
3. No cambies la política de no descargar sin preguntar con datos móviles: el botón es la pregunta.

**Tests:**

- `src/lib/mapabase.test.ts` (nuevo):
  - `descarga al volver la red si falta y la conexión lo permite`.
  - `no lanza dos descargas a la vez`.
  - `con datos móviles no descarga solo`.
- E2e `mapa.spec.ts` / `degradacion.spec.ts`:
  - `con red y sin mapa base, el mapa lo avisa y el botón lo descarga`: `page.route` sobre el
    `.pmtiles` y comprobación del progreso y de la desaparición del aviso.
  - `con una versión nueva en el despliegue, el mapa la ofrece`: `localStorage` con
    `hidrantes.mapabase` de una versión antigua.
- `controles.spec.ts`: los botones nuevos entran en el recorrido de controles (AC-140).

---

## 6. Operación sin que nadie mire

### RV-11 · GitHub desactiva los workflows programados tras 60 días sin actividad · P0

**Problema.**

- En repositorios públicos, GitHub desactiva los workflows con `schedule` cuando el repositorio pasa
  60 días sin actividad.
- Cuando el desarrollo termine se pararían:
  - `mantener-activo.yml`, y con él Supabase se pausa a los ~7 días, lo que tumba **también la app
    de uniformidad** (DEC-054);
  - `respaldo.yml`;
  - `vigilancia.yml`;
  - `purgar-fotos.yml`;
  - `avisos.yml` (RV-08).
- Nadie avisaría, porque la vigilancia también se para. El único freno actual es la fusión
  automática de Dependabot, que no está garantizada.

**Solución.**

1. Confirma la regla en la documentación de GitHub Actions ("Disabling and enabling workflows") y
   cita el enlace en DEC-085.
2. En `mantener-activo.yml`, añade un job `mantener-workflows`:
   - `permissions: actions: write`.
   - Para cada workflow programado del repositorio (lista **explícita** en el propio YAML):
     `gh api -X PUT repos/${{ github.repository }}/actions/workflows/<archivo>.yml/enable`.
   - Habilitar un workflow por API reinicia el contador de inactividad; es lo que hacen las acciones
     de keepalive sin commits. Comprueba en la documentación que sigue siendo así; si no, la
     alternativa es un commit vacío mensual a una rama `mantenimiento/latido`, que requiere DEC.
   - Ejecuta también `mantener-workflows` desde `vigilancia.yml` (paso final), así que ambos se
     rehabilitan mutuamente.
3. En `vigilancia.yml`, nueva comprobación: para cada workflow programado,
   `gh api repos/…/actions/workflows/<archivo>/runs?per_page=1` → si la última ejecución programada
   tiene más de 2 días (8 para `respaldo.yml` y `purgar-fotos.yml`, que son semanales), añade un
   problema. `permissions` pasa a `actions: read`, además de lo que ya tiene.
4. Actualiza 15 §4 con una línea: qué hacer si GitHub avisa por correo de un workflow desactivado.

**Tests:** `scripts/workflows.test.ts` (nuevo) lee los YAML con el parser que ya use el repo, o con
un `yaml` de `devDependencies` si ya está (**no** añadas una dependencia; si no hay parser, usa
expresiones regulares acotadas). Comprueba que:

- todo workflow con `schedule:` aparece en la lista de `mantener-workflows`;
- `vigilancia.yml` lo comprueba.

Así un workflow programado nuevo sin keepalive rompe CI.

### RV-13 · `restaurar.ts` falla sobre un esquema existente · P1

**Problema A.**

- `LIMPIAR_ESQUEMA` (`scripts/restaurar.ts:50-69`) borra vistas, tablas, rutinas y enums, pero no
  las secuencias sueltas `seq_codigo_hidrante` y `seq_codigo_boca` (`0001:24-25`), que no pertenecen
  a ninguna columna.
- El volcado (`pg_dump --schema=hidrantes`, `respaldo.yml:119`) hace `CREATE SEQUENCE`, falla con
  "already exists" y se deshace la transacción entera.
- El caso normal de 15 §5.3 (datos dañados con el esquema vivo) **no se puede restaurar**. El ensayo
  de la Fase 8 fue "sobre una base vacía" y `restaurar.test.ts` solo mira cadenas.

**Problema B.**

- El `insert` de auditoría `'restauracion_respaldo'` (`restaurar.ts:99-101`) viola el `check` de
  `registro.accion` con cualquier volcado anterior a `0010`, y deshace todo.

**Solución.**

1. En `LIMPIAR_ESQUEMA`, antes de los tipos, añade un bucle sobre
   `pg_class c join pg_namespace n … where n.nspname = 'hidrantes' and c.relkind = 'S'` →
   `drop sequence if exists hidrantes.%I cascade`.
2. Sustituye el `insert` por un bloque `do`:
   - Si `pg_get_constraintdef` de la restricción `check` de `registro.accion` contiene
     `'restauracion_respaldo'`, inserta.
   - Si no, `raise notice 'volcado anterior a 0010: se anota tras migrar'`.
   - Tras el `commit` de la restauración, el script ejecuta `npm run migrar` contra la misma URL
     (reutiliza la función de `migrar.ts`, no un `spawn` a npm si se puede importar) y **después**
     inserta la fila de auditoría.
   - Informa de las migraciones aplicadas.
3. Añade la opción `--confirmar RESTAURAR`, admitida **solo** con `--entorno local`, para poder
   automatizarlo en CI sin pregunta interactiva. Con otro entorno aborta.
4. Incluye el upsert de `epoca_datos` de RV-06.

**Tests:**

- `restaurar.test.ts` (cadenas):
  - `LIMPIAR_ESQUEMA` borra secuencias;
  - la auditoría va en un bloque condicional;
  - `--confirmar` sin `--entorno local` aborta.
- **Integración en CI (`ci.yml`, job `ci-sql`), paso nuevo tras `test:sql`:**
  1. `pg_dump --schema=hidrantes --no-owner` de la base local con el seed a `/tmp/volcado.sql`.
  2. Guarda los conteos de `puntos`, `propuestas` y `registro`, y `last_value` de las dos secuencias.
  3. Modifica datos (borra 3 puntos, inserta 1).
  4. `npm run restaurar -- --entorno local --archivo /tmp/volcado.sql --confirmar RESTAURAR`.
  5. Comprueba que los conteos vuelven a los guardados (registro +1 por la auditoría), que las
     secuencias dan el siguiente código esperado y que `fn_listar_puntos` responde con la anon key.
  6. **Volcado antiguo simulado:** con `sed`, quita `'restauracion_respaldo', ` de la definición del
     `check` en una copia del volcado y quita las filas de `migraciones_aplicadas` de `0010` y `0011`.
     Restaura y comprueba que termina bien y que después existe la fila de auditoría.

   Sobre `develop`, el paso 4 falla, así que es el test de regresión. Escríbelo como
   `scripts/probar-restauracion.ts` para poder ejecutarlo también en local.
- Actualiza 15 §5.3 y `docs/verificacion/fase-8.md` (TR-51: "ensayado sobre base vacía **y** sobre
  esquema con datos, en CI").

---

## 7. Acceso y seguridad

### RV-14 · Código de acceso: bloqueo por inundación, IPv6 rotando y altas ilimitadas · P1

**Problema.**

- El `dispositivo_id` lo elige el cliente. La IP (`functions/api/verificar-codigo.ts:28-32`) se
  hashea entera, así que con IPv6 un atacante rota direcciones dentro de su /64 y el límite por IP
  no sirve. Queda el tope global de 200 fallos por hora (`0005:126-137`). Con él:
  - 200 fallos por hora dejan sin poder entrar a los voluntarios con móvil nuevo, indefinidamente,
    y nadie se entera;
  - al mismo ritmo, los 10⁶ códigos se recorren en unos 208 días.
- La cuenta y la anotación no van bajo bloqueo, así que peticiones en paralelo superan el tope.
- Los canjes **buenos** no tienen límite. Quien tenga el código puede crear dispositivos sin fin y
  saltarse las cuotas por dispositivo (40 fotos de 5 MB al día → llenar el 1 GB de Storage).

**Solución.**

1. **Function:**
   - Normaliza la IP antes del hash:
     - IPv6 → sus primeros 64 bits (los cuatro primeros grupos tras expandir `::`);
     - IPv4 → tal cual;
     - IPv4 mapeada (`::ffff:a.b.c.d`) → la IPv4.
   - Exporta `normalizarIp(ip: string): string` y úsala en `verificar-codigo.ts` y en cualquier otro
     sitio que hashee la IP.
   - Documenta en 11 §3 que el límite "por IP" es por /64 en IPv6.
2. **Migración:** `create or replace function hidrantes.fn_verificar_codigo(codigo text, dispositivo_id uuid, ip_hash text)`
   con la misma firma. Añade:
   - `perform pg_advisory_xact_lock(hashtext('hidrantes:intentos_codigo'))` como primera sentencia.
     Serializa los canjes, que son pocos: unos 65 voluntarios.
   - **Tope de canjes buenos.** Claves de config nuevas `max_altas_ip_dia` (**150**) y
     `max_altas_global_hora` (**150**).
     - Si `count(*) filter (where exito)` en 24 h desde esa IP es ≥ `max_altas_ip_dia`, o en 1 h en
       total es ≥ `max_altas_global_hora`, se devuelve `DEMASIADOS_INTENTOS` **sin** crear
       dispositivo.
     - Los valores cubren la sesión presencial de F9.9 (65 personas en la misma wifi) con margen.
       Explícalo en un comentario y en DEC-086.
   - Los fallos siguen como hoy (10, 30 y 200).
3. **Alarma:**
   - `fn_salud` añade `intentos_fallidos_24h` y `topes_alcanzados_24h`. Cada vez que se devuelve
     `DEMASIADOS_INTENTOS` se anota una fila en `intentos_codigo` con `exito = false` y una nueva
     columna `bloqueado boolean default false`. Añádela en la misma migración y ajusta 05 §2.5.
   - `vigilancia.yml` añade un problema si `intentos_fallidos_24h > 300` o si
     `topes_alcanzados_24h > 0` por el tope **global**, con el texto "posible ataque al código de
     acceso: cambia el código (15 §…)".
   - El panel, en Salud del sistema, enseña ambas cifras.
4. El bloqueo por inundación del tope global sigue siendo posible en teoría. La defensa completa
   (Cloudflare Turnstile o una regla de rate limiting) está en §12 porque requiere decisión.

**Tests:**

- `functions/api/verificar-codigo.test.ts`:
  - `normalizarIp`: `2001:db8:1:2:3:4:5:6` y `2001:db8:1:2::9` dan el mismo resultado,
    `::ffff:192.0.2.1` da `192.0.2.1` y una IPv4 queda intacta;
  - `dos IPv6 del mismo /64 comparten ip_hash`.
- pgTAP en `05_rpc_voluntario.test.sql`:
  - **TR-41 (hoy sin test):** con 200 fallos globales en la última hora (insertados directamente),
    un intento nuevo desde otro dispositivo e IP da `DEMASIADOS_INTENTOS`.
  - `150 canjes buenos desde una IP en 24 h bloquean el 151.º sin crear dispositivo`.
  - `un tope alcanzado se anota con bloqueado = true`.
  - Concurrencia con dblink: con 199 fallos, dos sesiones intentan a la vez y **solo una** llega a
    comparar. La otra espera el bloqueo y ve 200. Sobre `develop` pasan las dos.
- `scripts/intrusion.ts`: añade el caso "30 fallos desde IPv6 distintas del mismo /64 → 429" si la
  pila local permite fijar `CF-Connecting-IP`; si no, déjalo en el test de la Function.

### RV-26 · El trigger de anonimización acepta cualquier valor de `actor` · P1

**Problema.** `tg_registro_inmutable` (`0001:288-301`) deja reescribir `actor` a **cualquier** texto
si la sesión activa `hidrantes.anonimizando`. Solo los roles propietarios tienen UPDATE, pero la
segunda capa debería limitar el valor.

**Solución.**

- Migración: `create or replace function hidrantes.tg_registro_inmutable()`, que añade la condición
  `new.actor = 'voluntario dado de baja'`, el literal exacto que escribe `fn_anonimizar_autor`
  (`0006:504`).

**Tests (pgTAP):**

- `con anonimizando=on, cambiar actor a otro texto falla con REGISTRO_INMUTABLE`.
- `fn_anonimizar_autor sigue funcionando`, que ya tiene test: debe seguir en verde.

### RV-25 · Nominatim: User-Agent sin contacto y sin caché por coordenadas · P1

**Problema.**

- `functions/_lib/nominatim.ts` usa `hidrantes-albolote/1.0` como User-Agent si falta
  `NOMINATIM_USER_AGENT`, y la política de Nominatim exige un contacto.
- El límite de 1 petición por segundo es por instancia.
- Sin `propuesta_id` no se guarda nada (`functions/api/direccion.ts:40`).

**Solución.**

- Sin `NOMINATIM_USER_AGENT`, `/api/direccion` responde `503 NO_CONFIGURADO` en vez de usar el
  valor por defecto. `arranque.ts` ya lo pide; comprueba que queda obligatorio y que incluye una URL
  de contacto: la del repositorio vale, **no** un correo (DEC-053).
- Caché de Cloudflare (`caches.default`) por clave `direccion:<lat redondeada a 4 decimales>,<lng a 4>`
  durante 30 días, antes de llamar a Nominatim. 4 decimales son unos 11 m, suficiente para una
  calle.

**Tests** (`direccion.test.ts`, `nominatim.test.ts`):

- `sin User-Agent configurado responde 503 y no llama a fetch`.
- `dos peticiones a coordenadas que redondean igual hacen una sola llamada a Nominatim`, con
  `caches.default` simulado.

---

## 8. Panel de jefatura y alta de jefatura

### RV-15 · La sincronización de jefatura se corta en 1.000 puntos · P1

**Problema.**

- `leerComoJefatura()` (`src/lib/puntos.ts:112-121`) hace `select('*')` sin `range`.
- PostgREST limita a `max_rows = 1000` (`supabase/config.toml:18`; en Supabase alojado el valor por
  defecto también es 1000). Es una sustitución completa, así que el almacén se queda en silencio con
  los primeros 1.000 por código.
- TR-60 pide ≥ 1.000 puntos. Inventario, caducadas, la cola y el mapa del panel leen de ese almacén.

**Solución.**

```ts
const PAGINA = 1000;
const todos: Punto[] = [];
for (let desde = 0; ; desde += PAGINA) {
  const { data, error, status } = await cliente.from('v_puntos_activos').select('*')
    .order('codigo').range(desde, desde + PAGINA - 1);
  if (error) { anotarServidor(!!status && status < 500); return { ok: false, codigo: 'SERVIDOR_NO_DISPONIBLE' }; }
  todos.push(...(data as Punto[]));
  if (data.length < PAGINA) break;
}
```

- `codigo` es único, así que el orden es estable. Un error a mitad no reemplaza nada: se devuelve
  error y el almacén sigue como estaba.
- Revisa **cualquier otro** `.from(...).select(...)` del panel (`src/lib/panel/*.ts`) que pueda
  pasar de 1.000 filas. Si lo hay, aplica el mismo patrón o justifica en el PR por qué no puede
  pasar.

**Tests:**

- `puntos.test.ts` · `jefatura lee por páginas hasta tener todo`: cliente simulado que devuelve
  1000 + 1000 + 5 filas según `range` → 2.005 puntos. Sobre `develop`, 1.000.
- `puntos.test.ts` · `un error en la segunda página no reemplaza el almacén`.
- `e2e/integracion/fase7.spec.ts` (o nuevo): inserta 1.050 puntos `[PRUEBA]` en la base local por
  SQL en `beforeAll` (psql, como otros tests de integración) y el Inventario del panel enseña 1.050
  (más los del seed).

### RV-16 · Jefatura sin servidor al arrancar acaba en la pantalla de entrada · P1

**Problema.**

- Si `fn_es_admin` devuelve `SIN_SERVIDOR` con el estado en `comprobando` (`src/lib/acceso.ts:89-97`),
  se fija `sinGoogle()`, que sin sesión de voluntario es `fuera`.
- Jefatura pierde el mapa y los puntos guardados justo cuando no hay servidor, lo que contradice
  FR-168 ("sigue mostrando los datos guardados").

**Solución.**

1. Cuando `fn_es_admin` devuelve `true`, guarda en `almacen` `hidrantes.jefatura_confirmada` =
   `{ correo, confirmado_en }`.
2. En `comprobarAcceso`, si hay `data.session` y `r.codigo === SIN_SERVIDOR` y la confirmación
   guardada es del mismo correo, fija `{ tipo: 'jefatura', correo }` sin sincronizar. El aviso de
   degradación ya lo pinta `conexion`.
3. Si `getSession()` no da sesión pero el navegador está sin red (`navigator.onLine === false`) y
   hay confirmación guardada **y** `hayGoogle()`, aplica el mismo modo solo lectura.
   - Las escrituras irán a la cola, cuya `credencial()` devuelve null sin sesión: la cola espera y
     se envía al volver la sesión.
   - El servidor sigue aplicando RLS, así que no hay escalada.
4. Borra la confirmación en `salirDeGoogle`, cuando `fn_es_admin` devuelve `false` y en
   `volverAEntrada`.

**Tests** (`acceso.test.ts`):

- `jefatura confirmada sigue como jefatura si el servidor no responde`. Sobre `develop` queda en
  `fuera`.
- `un correo distinto no hereda la confirmación`.
- `fn_es_admin=false borra la confirmación`.
- E2e `degradacion.spec.ts` · `el panel sin servidor enseña los datos guardados`: `conGoogle`, una
  primera carga con servidor y una segunda con `simularRpc({})`.

### RV-17 · Moderación: `statement_timeout` sin efecto; un bloqueo tumba el lote entero · P1

**Problema.**

- `set statement_timeout = '10s'` como atributo de `fn_aplicar_propuesta` (`0006:18`) y de
  `fn_proponer` (`0005:357`) no reprograma el temporizador de la sentencia en curso: en la práctica
  no hace nada. Solo lo llevan 2 de las funciones de escritura.
- Una espera de bloqueo larga o un interbloqueo llega como error sin código.
- `fn_aprobar_lote` (`0006:145-153`) solo captura `raise_exception`, así que un interbloqueo en una
  propuesta aborta **todo** el lote.

**Solución.**

1. **Migración:**
   - `alter function hidrantes.fn_aplicar_propuesta(uuid, jsonb, boolean, text) reset statement_timeout;`
     y `… set lock_timeout = '5s';`.
   - Lo mismo para `fn_proponer` (firma completa) y para las demás RPC de escritura de 05 §11 que
     bloquean fila (`fn_fusionar_con_existente`, `fn_rechazar`, `fn_retirar_propuesta`,
     `fn_editar_punto`, etc.): **solo** `set lock_timeout = '5s'`.
   - `create or replace function hidrantes.fn_aprobar_lote(propuesta_ids uuid[])` (misma firma):
     el `exception` pasa a `when raise_exception then … when lock_not_available or deadlock_detected then propuesta_id := id_p; resultado := 'omitida'; motivo := 'PUNTO_OCUPADO';`.
2. 05 §8: código `PUNTO_OCUPADO` ("otra persona está cambiando este punto; inténtalo en unos
   segundos"). 05 §11: `lock_timeout` en lugar de `statement_timeout`.
3. En `textos.ts` y el Apéndice A, el texto de `PUNTO_OCUPADO`. `textoError` lo mapea.
4. En la app, un 55P03 en `fn_proponer` llega como error HTTP 5xx de PostgREST y la cola lo
   reintenta como `SIN_SERVIDOR`. Comprueba el status real en la integración y anótalo.

**Tests** (pgTAP con dblink, patrón de `07_concurrencia_rpc.test.sql`):

- `aprobar un lote con una propuesta cuyo punto está bloqueado por otra sesión omite esa con PUNTO_OCUPADO y aprueba las demás`:
  1. `s1` hace `begin; select … for update` del punto.
  2. `s2` lanza `fn_aprobar_lote` de 3 propuestas.
  3. Se espera ≈ 5 s y resultado `omitida/PUNTO_OCUPADO` para una y `aprobada` para dos.
  4. Sobre `develop`, `s2` espera indefinidamente o falla entera. Pon `statement_timeout` de sesión
     de 20 s en `s2` para que el test no se cuelgue.
- `fn_aplicar_propuesta tiene lock_timeout=5s y no statement_timeout` (consulta a `pg_proc.proconfig`).

### RV-18 · Fusión: no se elige la descripción y no se recalcula municipio, núcleo ni dirección (FR-106) · P1

**Problema.**

- `fn_fusionar_con_existente` solo admite `racor`, `caudal`, `diametro_mm` y `ubicacion` en
  `prevalece` (`0006:205`). FR-106 dice "cada campo que difiere", y `descripcion` difiere a menudo.
- Con `ubicacion = 'propuesta'` cambia `geom`, pero `municipio`, `nucleo` y `direccion` se quedan con
  los del punto viejo (`0006:212-221`). `fn_aplicar_propuesta` sí los recalcula.

**Solución.**

1. **Migración:** `create or replace function hidrantes.fn_fusionar_con_existente(propuesta_id uuid, punto_id uuid, prevalece jsonb default '{}')`
   con la misma firma.
   - Añade `'descripcion'` a las claves permitidas.
   - En el `update`, `descripcion = case when 'descripcion' = any(usa_propuesta) then nullif(trim(r.datos ->> 'descripcion'), '') else x.descripcion end`.
   - Con `'ubicacion' = any(usa_propuesta)`:
     - `select * into zona from hidrantes.fn_municipio_de(r.geom)`, y luego
       `municipio = zona.municipio, nucleo = zona.nucleo`;
     - `direccion = coalesce(r.direccion_sugerida, null)`. Si es null, el panel pide la dirección
       como en un alta (FL-21). Comprueba cómo lo hace `fn_aplicar_propuesta` y **haz lo mismo**.
2. Panel: `src/lib/panel/cola.ts` (`CampoFusion`) y `DetallePropuesta.tsx` ofrecen "Descripción"
   cuando difiere. Texto nuevo si hace falta.
3. 05 §6.2: la lista de claves de `prevalece`.

**Tests:**

- pgTAP en `06_rpc_jefatura.test.sql`:
  - `fusionar con descripcion=propuesta copia la descripción`;
  - `fusionar con ubicacion=propuesta a un punto de Calicasas cambia municipio y núcleo`. Usa
    coordenadas del seed de cada término. Sobre `develop` falla.
- `panel/cola.test.ts`: `camposQueDifieren incluye descripcion`, o el nombre real de la función.
- E2e `panel-cola.spec.ts`: la fusión enseña y envía `descripcion`.

### RV-19 · Alta de jefatura con "otra medida" o correo largo se reintenta para siempre (FR-151) · P1 · mismo PR que RV-07 si se toca `fn_proponer`

**Problema.**

- Jefatura aplica al momento (FR-151). Si elige "otra medida" en un hidrante, `fn_aplicar_propuesta`
  lanza `DIAMETRO_SIN_FIJAR` (`0006:59-61`), que no está en `PERMANENTES` → reintento infinito.
- Además, `Proponer.tsx:116-119` manda el correo de jefatura como `autor_apellido`, y `fn_proponer`
  rechaza más de 60 caracteres (`0005:396-398`) con `PAYLOAD_INVALIDO(autor)`: un fallo permanente
  sin explicación útil.

**Solución.**

1. `Proponer.tsx`: si `jefatura`, no ofrecer `['otro', …]` en el diámetro del alta. Jefatura fija
   70 o 100, que es lo que la moderación le pediría de todos modos.
2. `cola.ts`: `DIAMETRO_SIN_FIJAR` en `PERMANENTES`, como defensa.
3. **Migración** (en la misma `create or replace` de `fn_proponer` que RV-07): si
   `admin_email is not null`, **ignora** los `autor_*` recibidos y usa `autor_nombre := 'Jefatura'`,
   `autor_apellido := left(admin_email, 60)`, antes de validar. El registro ya usa `admin_email`
   como actor (`0005:461`).
4. `Proponer.tsx`: para jefatura manda `autor` fijo `{ nombre: 'Jefatura', apellido: 'Jefatura' }`
   (el servidor lo sustituye). Así el correo no viaja en `autor_*`. El literal va en `textos.ts`.

**Tests:**

- pgTAP: `un alta de admin con un correo de 70 caracteres entra y guarda autor_apellido de 60`.
  Simula el JWT como hagan los tests existentes de jefatura en `06_rpc_jefatura.test.sql`.
- `cola.test.ts`: `DIAMETRO_SIN_FIJAR marca fallo y no reintenta`.
- E2e `operaciones.spec.ts`: `jefatura no ve "otra medida" en un alta`.

### RV-23 · Mis propuestas: retirar falla en silencio; correcciones con nombres de columna · P1

**Problema.**

- En `MisPropuestas.tsx:185-189` se ignora el resultado de `retirarPropuesta`. Si jefatura ya
  decidió o no hay red, el diálogo se cierra sin decir nada (UI-05).
- `textoCorrecciones` (`MisPropuestas.tsx:33-38`) pinta claves y valores de la base de datos
  ("diametro mm: 70 · racor: granada"). Es texto de interfaz fuera de `textos.ts` (UI-20, UI-21).

**Solución.**

1. `const r = await retirarPropuesta(id)`:
   - si `!r.ok`, se mantiene el diálogo abierto y se muestra `textoError(r.codigo)` dentro de él;
   - `PROPUESTA_NO_PENDIENTE` tiene su texto propio en el Apéndice A: "Jefatura ya la ha revisado".
   - Tras el error se refresca `cargarMisPropuestas()`.
2. Mueve `ETIQUETA_CAMPO`, `etiquetaCampo` y la función que da el texto de un valor (en
   `src/lib/panel/cola.ts:199-210` y cercanas) a `src/lib/campos.ts` compartido, sin nombres ni
   correos. Úsalo en ambos sitios: "Diámetro: 70 mm · Racor: Granada".

**Tests:**

- `mis-propuestas.test.ts` o un test del componente: `textoCorrecciones` da etiquetas y valores
  legibles.
- `campos.test.ts`: cada clave de 05 §7 tiene etiqueta.
- E2e `operaciones.spec.ts`:
  - `retirar una propuesta ya revisada lo dice`: `fn_retirar_propuesta` simulado con
    `PROPUESTA_NO_PENDIENTE`. Sobre `develop` el diálogo se cierra sin texto.
  - `las correcciones se leen en español`.

### RV-24 · Lista, Inventario y exportación se desvían de FR-68, FR-120 y FR-160 · P1

**Problema y solución, por punto:**

1. **FR-68 (la fila enseña "última revisión").** `ListaPuntos.tsx:123-124` solo la enseña cuando
   está caducada.
   - Solución: en todas las filas, ` · ${T.lista.revisado(hace(p.fecha_ultima_revision))}` (texto
     nuevo, p. ej. "revisado hace 3 meses").
   - Cuando está caducada, se mantiene `T.mapa.sinRevisar` en rojo en lugar del texto normal.
   - Respeta la notación canónica (UI-10–UI-16) y que la fila siga en una línea truncada.
2. **FR-120 (filtros por tipo **y** estado, combinables).** `Inventario.tsx` mezcla tipo y estado en
   un único grupo de chips (`FILTROS`), y el único estado es "no funciona".
   - Solución: tres controles independientes.
     - **Tipo:** todos · hidrantes · bocas de riego.
     - **Estado:** todos · bueno · regular · malo · no funciona.
     - **Revisión:** todas · sin revisar.
     - Se mantienen núcleo y diámetro.
   - `FiltrosInventario` en `src/lib/panel/inventario.ts` pasa de `filtro` a `tipo`, `caudal` y
     `sin_revisar`.
   - `filtrar()` se adapta. Si la Lista del móvil reutiliza `filtrar` con los chips de FR-68, se
     mantiene su comportamiento: crea una función aparte para el panel en vez de romper la del móvil.
3. **FR-160 (la exportación usa los filtros activos).** `exportarCon` (`Inventario.tsx:82-92`) no
   pasa la búsqueda.
   - Solución: `exportar(formato, filtros, idsVisibles?)`.
     - Si hay búsqueda, filtra las filas devueltas por `pedirInventario` a los ids de la tabla en
       pantalla antes de `descargar`.
     - El recuento devuelto es el del archivo.
     - Si el RPC de exportación registra los filtros (mira `pedirInventario` y su RPC), añade
       `busqueda` al registro solo si su `jsonb` lo admite. Si hay que tocar la RPC, hazlo en una
       migración y en 05.

**Tests:**

- `inventario.test.ts`:
  - `tipo y estado se combinan` (bocas + malo);
  - `sin revisar se combina con tipo`.
- `exportar.test.ts`: `con búsqueda exporta solo las filas visibles`.
- E2e:
  - `panel-inventario.spec.ts` · `filtrar hidrantes regulares y exportar CSV da solo esas filas`,
    que lee el archivo descargado;
  - `mapa.spec.ts` · `cada fila de la lista enseña la última revisión`.

---

## 9. Datos que el panel da por hechos

### RV-20 · Novedades vacías en el panel y ausentes en la app (FR-167, AC-127) · P1

**Problema.**

- 05 dice que CI carga el CHANGELOG en `config.novedades`, y nada lo hace:
  `docs/verificacion/fase-0.md:80` lo aplazó.
- El panel siempre dice "Todavía no hay novedades publicadas", y `e2e/panel-ajustes.spec.ts`
  simula la RPC, así que no lo ve.
- FR-167 y AC-127 piden novedades en Ajustes "al actualizarse la aplicación". `fn_novedades` solo
  la ejecuta `authenticated` (`0007:103`), así que el voluntario no puede leerla.

**Solución** (DEC-087; reduce piezas, así que es de bajo riesgo): las novedades salen del build, no
de la base de datos.

1. `scripts/generar-novedades.ts`:
   - Lee `CHANGELOG.md` (formato de release-please, secciones `## [x.y.z](…) (fecha)`,
     `### Novedades`, `### Correcciones`).
   - Toma las **tres** últimas entradas de "Novedades" y, si no llegan a tres, completa con
     "Correcciones", recorriendo versiones hacia atrás.
   - Quita el ámbito en negrita (`**mapa:**`), los enlaces a PR y commit y los identificadores
     técnicos entre paréntesis como `(F9.7)` o `(DEC-076)`.
   - Pone en mayúscula la primera letra.
   - Escribe `src/generado/novedades.json`: `{ version, fecha, lineas: string[] }`.
   - Añade `src/generado/` al `.prettierignore` si hace falta y **commitéalo**, porque el build de
     CI no debe depender de un paso extra.
2. `package.json`: `"prebuild": "tsx scripts/generar-novedades.ts"`. En CI, un paso que falla si
   `src/generado/novedades.json` difiere de lo que genera el script (`git diff --exit-code`).
3. Release-please actualiza `CHANGELOG.md` en su PR. Añade al workflow `release-please.yml` un paso
   que, en la rama del PR de versión, ejecute el generador y haga commit del JSON. Si eso complica
   el flujo de DEC-079, basta con que `prebuild` lo regenere y que el paso de CI compare contra
   `develop` después del merge: elige la opción más simple que funcione y documéntala.
4. **App:** Ajustes del voluntario (`src/paginas/Ajustes.tsx`), sección "Novedades" (07 la dibuja)
   con la versión y las tres líneas. Si `version` es distinta de la última vista (`almacen`), se
   marca como nueva hasta abrir Ajustes.
5. **Panel:** `cargarNovedades()` (`src/lib/panel/ajustes.ts:234`) devuelve el JSON local, sin RPC.
   `fn_novedades` se queda en la base de datos **sin uso** (04 §12, compatible hacia atrás).
   Márcala en 05 como "obsoleta desde vX; se retira en la siguiente versión mayor".
6. Estas líneas vienen de commits en español escritos por el desarrollo. Revisa en el PR que las
   tres actuales se entienden para un voluntario; si no, el arreglo es escribir mejor los `feat:`,
   no filtrar aquí.

**Tests:**

- `scripts/generar-novedades.test.ts` con un CHANGELOG de muestra:
  - tres líneas limpias, sin `**`, sin enlaces y sin `(F9.7)`;
  - completa con correcciones si faltan novedades;
  - CHANGELOG vacío → `lineas: []`.
- E2e:
  - `controles.spec.ts` o `mapa.spec.ts` · `Ajustes enseña tres novedades de la versión instalada`
    (AC-127);
  - `panel-ajustes.spec.ts` · `las novedades del panel no dependen de la RPC`: quita el simulado de
    `fn_novedades`, así que sobre `develop` enseña "Todavía no hay…".

### RV-21 · Salud del sistema no conoce la versión del mapa base (FR-143) · P1

**Problema.** `fn_salud` lee `config.version_mapabase` (`0011:16`), y nada la escribe. La versión
solo vive en `datos/mapabase.json`. `version_zona` sí la escribe `cargar-zona.ts:42`.

**Solución.**

- `scripts/cargar-version-mapabase.ts` lee `datos/mapabase.json` y hace un upsert en `config` de
  `version_mapabase` con `actualizado_por = 'despliegue'`. Sigue el patrón de `cargar-zona.ts`
  (`--local` y `SUPABASE_DB_URL`).
- En `deploy-staging.yml` y `deploy-prod.yml`, ejecútalo **después** de `wrangler pages deploy` y
  de `comprobar-despliegue`, nunca antes: la versión se anuncia cuando el archivo ya se sirve.
- `package.json`: `"cargar-version-mapabase"`.

**Tests:**

- `scripts/cargar-version-mapabase.test.ts`: genera el SQL esperado a partir de un JSON de muestra y
  escapa comillas.
- En `ci-sql`, ejecútalo con `--local` y comprueba con `psql` que `fn_config('version_mapabase')`
  es la de `datos/mapabase.json`.

### RV-22 · Salud: sin tamaño de la base de datos ni última ejecución de las tareas (TR-53, TR-54) · P1

**Problema.**

- Solo se vigila `storage_bytes`. Nada mide la base de datos de 500 MB, que se comparte con
  uniformidad.
- `fn_salud` y `vigilancia.yml` no miran `cron.job_run_details`, así que una purga que falla (IPs de
  intentos a 24 h, errores, tokens: RGPD) pasa desapercibida. TR-54 pide "última ejecución visible".

**Solución.**

1. **Migración:** `create or replace function hidrantes.fn_salud()` (misma firma). Añade:
   - `'bd_bytes', pg_database_size(current_database())`;
   - `'esquema_bytes'`: suma de `pg_total_relation_size` de las tablas de `hidrantes`;
   - `'tareas', hidrantes.fn_config('tareas_programadas', 'null')`.
2. **`vigilancia.yml`:**
   - Nueva comprobación con `psql`:

     ```sql
     select j.jobname, max(d.start_time), bool_or(d.status = 'failed')
     from cron.job j left join cron.job_run_details d using (jobid)
     where j.jobname like 'hidrantes_%' and (d.start_time > now() - interval '8 days' or d.start_time is null)
     group by 1
     ```

   - Problema si alguna tarea diaria no corrió en 26 h, la semanal en 8 días, o si hay `failed`.
   - Escribe el resultado como `jsonb` en `config.tareas_programadas`, igual que hace hoy con
     `ultima_vigilancia`.
   - Problema también si `bd_bytes > 400 MB` (80 % de 500 MB).
   - **Permisos:** comprueba primero en local si el rol de `SUPABASE_DB_URL_PROD` puede leer
     `cron.job_run_details`. Si no, `arranque.ts` (que usa la cadena de `postgres`) concede
     `select on cron.job, cron.job_run_details to hidrantes_migrador`. Documenta cuál de los dos
     caminos aplica y anótalo en 04.
3. **Panel, Salud del sistema:**
   - "Base de datos: 38 MB de 500 MB";
   - la lista de tareas con última ejecución y resultado.
   - Textos nuevos. Usa la barra o aviso de almacenamiento de DEC-073 como modelo.
4. La transferencia de 5 GB/mes no se puede leer por SQL: queda documentada como estimación en 04,
   como hoy.

**Tests:**

- pgTAP: `fn_salud devuelve bd_bytes > 0 y esquema_bytes > 0`.
- E2e `panel-ajustes.spec.ts`: Salud enseña base de datos y tareas, con el `fn_salud` simulado.
- Un test del SQL de vigilancia: extrae la consulta a `scripts/sql/tareas-programadas.sql`, que el
  workflow lee con `psql -f`. En `ci-sql` ejecútala contra la base local y comprueba que devuelve
  las 6 tareas `hidrantes_%` (7 con la de RV-07).

---

## 10. Calidad de tests y CI

### RV-27 · Los tests de rendimiento fallan al correr en paralelo · P2

**Problema.** Con 4 workers, `rendimiento.spec.ts` (TR-10, TR-13, TR-16) y un caso de
`operaciones.spec.ts` fallaron por tiempo en la revisión. Con `--workers=1` pasaron todos. Miden
tiempos y compiten por CPU.

**Solución.**

- Etiqueta los tests de `rendimiento.spec.ts` con `@rendimiento` (`test.describe('… @rendimiento', …)`
  o `tag`).
- `package.json`:
  - `"e2e": "playwright test --grep-invert @rendimiento && playwright test --grep @rendimiento --workers=1"`;
  - `e2e:rapido` sin los de rendimiento.
- En CI, lo mismo en dos pasos del job `ci-e2e`.
- El caso de `operaciones.spec.ts:146` que falló: revisa su espera. Si depende de un tiempo fijo,
  cámbialo por `expect.poll` o `toBeVisible` con el timeout por defecto.

**Tests:** ejecuta `npx playwright test --repeat-each=3 --workers=4 --grep-invert @rendimiento` en
local y anota en el PR que no hay fallos.

### RV-28 · Panel sin Firefox (TR-21) ni comprobación en tres anchos (TR-25) · P2

**Solución.**

1. `playwright.config.ts`: proyecto `panel-firefox` con `devices['Desktop Firefox']`,
   `testMatch: /panel-.*\.spec\.ts/`. En CI, `npx playwright install --with-deps chromium firefox`.
   Si algún test depende de APIs solo de Chromium (CDP para el 3G), márcalo `test.skip(browserName !== 'chromium')`
   con el motivo.
2. `e2e/anchos.spec.ts`: a 390, 768 y 1280 px de ancho comprueba con aserciones de layout, no con
   capturas comparadas:
   - el mapa a pantalla completa en 390;
   - los botones laterales en 768 (TR-25);
   - la lista lateral y la ficha flotante que no tapa el plano en 1280 (FR-70: `boundingBox` de la
     ficha frente al del mapa).
   - Guarda capturas como adjunto del informe (`testInfo.attach`) para revisión humana. Esto cubre
     también FR-70, hoy sin test (`controles.spec.ts:171-172` dice que lo cubre `armazon.spec`, y no
     lo hace).

### RV-29 · Tamaño táctil sin medir: axe con reglas WCAG 2.1 (TR-32, TR-113) · P2

**Problema.** `e2e/accesibilidad.spec.ts:16` usa las etiquetas WCAG 2.1, y la regla `target-size`
de axe es WCAG 2.2. Solo `simbologia.test.ts:82` mira los 44 px. `fase-8.md:57` atribuye TR-32 a
axe.

**Solución.**

- Añade `'wcag22aa'` a las etiquetas de axe.
- Añade una prueba geométrica propia en `e2e/accesibilidad.spec.ts`, en cada pantalla de la app y
  del panel:
  - todo `button`, `a[href]`, `[role=button]`, `[role=radio]`, `input` y marcador visible mide
    ≥ 44 × 44 px (`boundingBox`, contando el área táctil ampliada si existe);
  - entre controles vecinos hay ≥ 8 px;
  - entre una acción afirmativa y una destructiva hay ≥ 12 px (UI-13). Identifícalas por
    `variante="destructivo"`: añade `data-variante` al botón si hace falta.
- Si aparecen incumplimientos reales, corrígelos en el mismo PR y lístalos.

### RV-30 · Tests que faltan: TR-41 (200/h), TR-90, TR-60, FR-55, FR-65, FR-70, AC-140 panel · P2

Cada punto es un test nuevo que hoy no existe:

- **TR-41 (200/h global):** cubierto en RV-14.
- **TR-90 (techo diario de errores):** `fn_registrar_error` (`0005:575-589`) tiene dos techos, 100
  por dispositivo al día y `max_errores_global_dia` (2000) en total. Test pgTAP:
  - con 100 errores de un dispositivo en las últimas 24 h, el siguiente de ese dispositivo no inserta
    fila y uno de otro dispositivo sí;
  - con `max_errores_global_dia` puesto a 5 en la transacción y 5 errores, ninguno más entra;
  - `pila` se trunca a 4.096 caracteres, que es lo que ya hay; mantenlo.
- **TR-60 (carga):** `supabase/tests/11_carga.test.sql`.
  - Inserta con `generate_series` 1.000 puntos, 20.000 propuestas (5 % pendientes) y 100.000 filas
    de registro.
  - Mide con `clock_timestamp()`: `fn_listar_puntos(token, null)` < 1.500 ms, `select * from v_cola_revision`
    < 1.000 ms, `select * from v_registro order by momento desc limit 50` < 200 ms.
  - Los umbrales son holgados, para detectar un índice perdido y no para medir finamente.
  - Todo dentro de `begin … rollback`.
- **FR-55:** e2e `operaciones.spec.ts` · `un alta fuera de la zona avisa y deja continuar`: pin
  fuera del polígono de `zona.ts`, se ve el aviso y la propuesta se envía.
- **FR-65:** e2e `mapa.spec.ts` · `el botón de centrar lleva a la posición y dibuja el halo`:
  `setGeolocation`, pulsar y comprobar que el centro del mapa cambia y que existe el círculo de
  precisión.
- **FR-70:** RV-28.
- **AC-140 panel:** extiende `e2e/controles.spec.ts` a las pantallas del panel (Cola, Inventario,
  Caducadas, Registro, Voluntarios, Papelera, Ajustes) con el mismo criterio: cada control cambia la
  pantalla, abre un diálogo o saca un aviso.
  - Excluye con lista explícita y motivo los controles cuyo efecto sea descargar un archivo; en
    esos, espera el evento `download`.

### RV-31 · La regla ESLint de textos deja pasar `.ts` y literales cortos · P2

**Problema.** `eslint.config.js:8,32` solo mira `src/**/*.tsx` y deja pasar literales de una o dos
palabras sin acento. `MisPropuestas.tsx:33-38` (RV-23) es justo lo que no detecta.

**Solución.**

- Amplía la regla a `src/**/*.ts`. Excluye `src/lib/textos.ts`, `*.test.ts`, `src/generado/**` y
  los módulos sin UI (`api.ts`, `bd.ts`, …) con lista explícita.
- Detecta también plantillas (`TemplateLiteral`) con texto en español entre expresiones.
- Añade un test de la regla (`eslint.test.ts` con `ESLint.lintText`):
  - un `.tsx` con `<p>Guardado</p>` da error;
  - `T.x` no;
  - un `.ts` de UI con una plantilla en español da error.
- Corrige lo que salga.

### RV-32 · La documentación afirma más de lo probado; 05 va por detrás del SQL · P2

Correcciones concretas, en un PR solo de documentación:

1. `docs/verificacion/fase-8.md`:
   - **Línea 44:** "ficha 2,56 s (TR-14 < 3 s)" → no existe test de ficha y TR-14 es la
     sincronización de 1.000 puntos. Quita la cifra o apúntala a su test real.
   - **Línea 52:** "AC-01 a AC-08 en integración real" → precisa que el Google real (AC-06 y AC-07)
     está simulado (`fase-4.md:39-40`) y que la instalación Android (AC-08) no se automatiza.
   - **Línea 57:** TR-32 no lo cubre axe, sino RV-29. Actualízalo cuando RV-29 esté hecho.
   - **Línea 61:** "marcha atrás ya probada" → `revertir.ts` no tiene ensayo registrado. Pon
     "pendiente de ensayo (§12)".
   - **Líneas 3 y 48:** "El criterio de salida se cumple entero" frente a la vigilancia ⏳. Una de
     las dos cambia, según el estado real a la fecha del PR (mira las ejecuciones de `vigilancia.yml`).
2. `docs/10-matriz-aceptacion.md`:
   - **AC-115 (línea 158):** quita "2,56 s la ficha" y actualiza los kB de JS inicial al valor
     actual de `npm run presupuesto` (214,8 kB en `fac61de`).
   - **AC-140 (línea 185):** el ✓ solo aplica a la app; queda en ⏳ hasta RV-30. Además, la fila
     tiene una columna de más (`UI-01, UI-02, TR-110` repetido): corrige la tabla.
   - **AC-111, AC-113, AC-142, AC-143 y AC-146:** tienen tests reales y no están marcados. Márcalos
     con fecha y test.
3. `docs/03-requisitos-tecnicos.md`, TR-105: dice SheetJS y el código usa fflate (DEC-067). 03 está
   congelado: añade una nota "(→ DEC-067)" en vez de reescribir la fila, si 00 §2 lo permite; si
   no, déjalo en 12.
4. `docs/05-modelo-de-datos-y-api.md`:
   - §6.2 añade `fn_renombrar_nucleo`, `fn_anadir_nucleo` y `fn_encolar_resumen_semanal` (`0009`);
   - §8 añade la acción `restauracion_respaldo` (`0010`);
   - `fn_salud` añade `ultima_vigilancia` y `vigilancia_ok` (`0011`), más lo de RV-14 y RV-22;
   - §11: `fn_reservar_subida` usa un bloqueo consultivo por dispositivo, no una única sentencia.
5. `docs/07-mockups-app.html:677`: un correo real de Gmail con nombre y apellido en un repositorio público. Cámbialo por
   `persona@example.org` y el nombre por uno genérico ("Otra cuenta"). Busca más con
   `rg -n '@(gmail|hotmail|yahoo|outlook)\.' docs src e2e`.
6. `docs/09-plan-implementacion.md` §8: registra la revisión y los RV como trabajo de la Fase 9.

**Test:** `scripts/docs.test.ts` (nuevo), para que no vuelva a pasar:

- ningún archivo de `docs/`, `src/` o `e2e/` contiene direcciones de correo fuera de los dominios
  `example.org`, `example.com` y `albolote-pc.es` (este último solo si es el genérico de los
  mockups);
- toda función `create function hidrantes.fn_*` de `supabase/migrations` que tenga `grant execute`
  en `0007`, o en otra migración, aparece mencionada en 05.

---

## 11. Orden de ejecución

1. **P0, en este orden** (cada línea es un PR):
   1. RV-11 (keepalive; pequeño y protege todo lo demás);
   2. RV-01 + RV-02;
   3. RV-03 + RV-04;
   4. RV-05;
   5. RV-06;
   6. RV-07 + RV-19 (misma `create or replace` de `fn_proponer`, junto con los atributos de RV-17
      para esa función);
   7. RV-08;
   8. RV-09;
   9. RV-10;
   10. RV-12.
2. Escribe `docs/verificacion/revision-p0.md` y pide al desarrollador el paso manual de RV-08
   (`npm run arranque -- --rotar vigilancia` en staging y prod, unos 5 min). Después, piloto (#77).
3. **P1**, en este orden:
   1. RV-13;
   2. RV-14;
   3. RV-15 + RV-16;
   4. RV-17 (resto de funciones);
   5. RV-18;
   6. RV-20;
   7. RV-21 + RV-22;
   8. RV-23 + RV-24;
   9. RV-25 + RV-26.
   Luego `docs/verificacion/revision-p1.md`, antes de pedir el PR `develop → main` (#79).
4. **P2** en cualquier orden, sin bloquear producción salvo RV-32 (documentación honesta antes de
   que jefatura firme 10).

Después de cada PR: CI en verde, staging desplegado y, si el cambio se ve, comprobación en staging
con Playwright (CLAUDE.md §5.6). No encadenes un PR sobre otro sin merge. Las migraciones van en
orden.

---

## 12. Fuera de alcance: requiere decisión del desarrollador

No lo implementes. Si lo ves necesario, abre una issue de tipo *decisión* con el `task-shaper`,
opciones y recomendación, y espera respuesta.

| Tema | Por qué hace falta decidir | Recomendación para la issue |
|---|---|---|
| `fecha_ultima_revision` = fecha de la visita, no de la aprobación (05:381) | Cambia la semántica de G1: hoy el retraso de moderación rejuvenece los puntos | Guardar `revisada_en_campo` (momento del envío) y usarla en la aprobación |
| Deshacer una retirada desde el panel | Hoy `fn_restaurar_punto` solo restaura desde la papelera (`0006:314-330`) y los retirados no se listan | Filtro "retirados" en Inventario con "Restaurar", registrado |
| Cloudflare Turnstile o regla de rate limiting ante `/api/verificar-codigo` | Nuevo servicio o configuración en Cloudflare (gratuito, pero cambia 11 y la entrada) | Turnstile invisible solo cuando `fallos_global > 50` en la hora |
| Código de acceso de más de 6 dígitos | Cambia FR-31 y la comunicación a 65 personas | 8 dígitos si se confirma un ataque (RV-14 lo detecta) |
| Ensayo real de marcha atrás (TR-52) | Toca el proyecto de Pages de staging; conviene que el desarrollador lo presencie | `revertir.ts` a la versión anterior en staging, medir y volver |
| Lighthouse sobre el mapa y no sobre la entrada (TR-103) | Exige un token de dispositivo de staging como secreto de CI | Token dedicado creado por `arranque.ts`, revocable |
| Pruebas en iPhone, en Android real y a la luz del día (TR-20, TR-22–24, TR-33) | Manual por naturaleza | Checklist en el piloto (#77) |
| Mapas de fuente (`sourcemap: true`) en producción | Bajo riesgo con el repositorio público; solo aumenta el despliegue | Dejar como está |

---

## 13. Checklist final (pégalo en `docs/verificacion/revision-p1.md`)

- [ ] Cada RV P0 y P1 tiene su issue cerrada, su PR fusionado y el test de regresión que falló
      antes del arreglo.
- [ ] `npm run typecheck && npm run lint && npm run formato:comprobar && npm test && npm run build && npm run presupuesto` en verde.
- [ ] `npm run e2e` en verde dos veces seguidas (RV-27).
- [ ] `ci-sql` en verde, con la restauración sobre un esquema con datos (RV-13).
- [ ] `npm run compatibilidad` en verde tras cada migración (TR-107).
- [ ] 05, 06 (Apéndice A), 04, 11, 12 (DEC-082 a DEC-087 o las que salgan), 15 y 10 actualizados.
- [ ] `avisos.yml` ha corrido en staging al menos una vez con un aviso real entregado (anota la
      fecha).
- [ ] `vigilancia.yml` enseña tareas, tamaño de la base de datos y workflows vivos.
- [ ] Nada de nombres, correos ni secretos en issues, PR ni commits (DEC-053).
