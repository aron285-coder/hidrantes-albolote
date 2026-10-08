# 32 · Segunda revisión completa y recorrido de la app en staging (oct 2026)

| | |
|---|---|
| **Para** | Claude Code, en este repositorio. **Cuatro sesiones** (Ops, Backend, Frontend-campo, Frontend-panel) en cuatro oleadas. Cada sesión puede usar subagentes en worktrees (máx. 3) donde lo dice §0.3. |
| **Base** | `develop` en `6d35be9` (docs/31 hecho). |
| **Origen** | Segunda revisión completa del 8 oct 2026. Typecheck, lint, 2.685 tests, build y `npm audit` en verde. Nada bloqueante. |
| **Decisión del desarrollador** | **Se queda un solo respaldo** (el artifact de GitHub). No hay segunda copia, ni en R2 ni en otro sitio (DEC-180). Este documento solo hace que esa copia sea fiable y que se note si falla o desaparece. |
| **El desarrollador** | No hace nada (DEC-176, DEC-177). Lo único que no puede hacer una sesión es volver a iniciar sesión en `gh` o `wrangler` si caducan: entonces lo dice en una línea y sigue con lo demás. |
| **Producción** | Va en 0.7.0. La 0.9.0 sale **primero** (oleada 0). Lo de este documento va en la 0.10.0, al final (oleada 3). |

## 0. Reparto

### 0.1 Oleadas

| Oleada | Sesión | Puntos | DEC |
|---|---|---|---|
| **0** | **Ops** (sola, antes que nada) | RV-200: publicar 0.9.0 y limpiar `GITHUB_DISPATCH_TOKEN` | — |
| **1** | **Ops** | RV-201 a RV-210 | DEC-180, DEC-181 |
| **1** | **Backend** | RV-220 a RV-226 (migración 0041 y Functions) | DEC-182, DEC-183 |
| **1** | **Frontend-campo** | RV-230 a RV-244 | — |
| **1** | **Frontend-panel** | RV-250 a RV-263 | — |
| **2** | **Frontend-campo** y **Frontend-panel** | RV-245 y RV-264, que esperan a 0041 (mensajes de los topes nuevos y push de jefatura por administrador) | — |
| **3** | **Ops** (sola) | RV-270: **recorrido completo de la app en staging, en una ventana visible**, con informe y propuestas de UI. Después RV-271: publicar 0.10.0. | DEC-184 |

### 0.2 Archivos y dueños

| Archivo | Dueño |
|---|---|
| `.github/**`, `scripts/**` (salvo los tests de Backend), `docs/03`, `04`, `09`, `13`, `15`, `entornos.md`, `INDICE.md`, `CLAUDE.md`, `docs/verificacion/*` | Ops |
| `supabase/migrations/0041_*.sql`, `supabase/tests/*`, `functions/**`, `docs/05`, `docs/11` | Backend |
| `src/` salvo `src/componentes/panel/**`, `src/lib/panel/**`, `src/paginas/PanelJefatura.tsx`; `public/sw-push.js`; **`src/lib/push.ts`** (también lo que toca el panel en RV-258: lo hace campo, coordinado) | Frontend-campo |
| `src/componentes/panel/**`, `src/lib/panel/**`, `src/paginas/PanelJefatura.tsx`, `docs/06` | Frontend-panel |
| `src/lib/textos.ts` | Cada sesión, su bloque. Rebasar justo antes de fusionar. |
| `docs/12` | Ops. Las demás le pasan el texto de su DEC. |

### 0.3 Subagentes

- **Ops:**
  - (a) respaldo y vigilancia: RV-201 a RV-203;
  - (b) CI y publicar: RV-204 a RV-207;
  - (c) documentación: RV-208 a RV-210.
- **Backend:**
  - **0041 la escribe la sesión principal**, entera, en serie;
  - un subagente hace las Functions y sus tests (RV-224, RV-226).
- **Frontend-campo:**
  - (1) cola, IndexedDB y sesión: RV-230 a RV-235;
  - (2) avisos, formulario, mapa y accesibilidad: RV-236 a RV-244.
- **Frontend-panel:**
  - (1) Cola y propuesta: RV-250 a RV-255;
  - (2) Inventario, Ajustes, exportar y accesibilidad: RV-256 a RV-263.

**Herramientas, como siempre:** `paquete-rv`, `nueva-migracion` (Backend), `revisar-pantallas` (Frontend), `pr-review-toolkit`, `code-review` y, en Ops y Backend, `security-guidance`. **Un test que falla antes del arreglo** en cada punto con código. **Registro:** `docs/verificacion/segunda-revision.md`, una sección por sesión. **Coordinación:** issue "docs/32 · coordinación".

---

## 1. Ops · oleada 0

### RV-200 · Publicar 0.9.0 ya · P0

Producción sigue en **0.7.0** (el deploy de 0.8.0 se canceló sin aprobar). La 0.9.0 está lista y comprobada en staging (RV-139b, marca `7d4e82c · verde`).

1. `npm run publicar -- --solo-comprobar`, y luego `npm run publicar`.
2. Comprobar en producción `<meta name="version">` = 0.9.0 y las migraciones 0036 a 0040 aplicadas.
3. `paridad-produccion.md` §2: la fila de 0.9.0.
4. **Borrar `GITHUB_DISPATCH_TOKEN`** de los dos proyectos de Pages (`wrangler pages secret delete`). En staging ya no hace falta desde hoy.
5. Quitarlo de:
   - `arranque.ts:416`;
   - `docs/04` §10 (líneas 371 y 378);
   - `docs/15`;
   - `entornos.md:35`.
6. Si la puerta automática rechaza: issue `bloquea-release` con el motivo, y se arregla antes de la oleada 1.

---

## 2. Ops · oleada 1

### RV-201 · El único respaldo: que se note si desaparece (DEC-180) · P0 · (a)

**Qué pasa.** `.github/scripts/revisar-bd.sh:16` solo mira `config.ultimo_respaldo`, no que el artifact siga existiendo. El `GITHUB_TOKEN` del despachador tiene `actions: write` y podría borrar artifacts.

**Qué se hace.**

- **Vigilancia:** la última ejecución correcta de `respaldo.yml` tiene que tener su artifact `respaldo-hidrantes`, con menos de 8 días y tamaño mayor de 0 (API de artifacts). Si no, issue y push a jefatura.
- **Despachador:**
  - el job que lee la base de datos no tiene `actions: write`;
  - solo el paso que lanza el workflow lo tiene, en un job aparte, sin `npm ci`, y que recibe el nombre del workflow ya validado contra la lista;
  - un test de workflows lo comprueba.
- **DEC-180:** un solo respaldo, por decisión del desarrollador, con el riesgo escrito: si se borra la cuenta de GitHub o el artifact, no hay copia. Lo que lo mitiga: la vigilancia de arriba, 90 días de artifacts y que el código de despacho no puede borrar.

### RV-202 · Comprobar que el respaldo cifrado es para la clave correcta · P1 · (a)

**Qué pasa.**

- La prueba de restauración usa el texto **antes** de cifrar (`respaldo.yml:133-139`).
- El destinatario es la primera huella de lo que haya en `GPG_PUBLIC_KEY` (`respaldo.yml:112-118`), sin compararla con la de `15` §2 (`BD378A1E…`).
- Si alguien cambia esa clave, todos los respaldos quedan ilegibles y todo sigue en verde.

**Qué se hace.**

- La huella esperada, fija en el workflow como variable del repositorio `GPG_HUELLA` (la pone la sesión con `gh variable set`).
- Antes de cifrar, `gpg --with-colons --import-options show-only --import` tiene que dar esa huella; si no, el job falla.
- Después de cifrar, `gpg --list-packets` del archivo cifrado tiene que nombrar el keyid de esa huella.
- **Test** del script con una clave equivocada.

### RV-203 · RV-130: autorizar solo el paso que despliega · P1 · (a)

**Qué pasa.** `despliegues-ajenos.sh:30-35` da por autorizado todo el tiempo de una ejecución de `deploy-prod`, de `created_at` a `updated_at`, incluida la espera de aprobación y las ejecuciones rechazadas (`failure`). Con el token de Cloudflare se podría desplegar el commit pendiente durante esa ventana.

**Qué se hace.**

- Usar la API de jobs: solo cuenta la ventana `started_at` y `completed_at` del paso "Desplegar a Cloudflare Pages", con `conclusion: success`, y el mismo commit.
- **Tests:**
  - un despliegue durante la espera de aprobación da alarma;
  - uno durante el paso de despliegue, no;
  - uno de una ejecución rechazada, sí.

### RV-204 · Dependabot: solo una lista de paquetes seguros se fusiona sola · P1 · (b)

**Qué pasa.** `automerge.yml:30` fusiona cualquier `direct:development` de parche. Eso incluye paquetes que van en el bundle o que se ejecutan con los secretos de producción: `workbox-window`, `vite`, `vite-plugin-pwa`, `@tailwindcss/vite`, `wrangler`, `tsx` y `openpgp`. Contradice `dependabot.yml:1-3` y DEC-172.

**Qué se hace.**

- **Lista de permitidos** (`.github/automerge-permitidos.txt`): `eslint*`, `@eslint/*`, `prettier`, `@types/*`, `typescript-eslint`, `globals`, `@playwright/test`, `@axe-core/playwright`, `vitest` y `@vitest/*`.
- Todo lo demás espera a una revisión. **Ojo:** la revisión la puede hacer una sesión de Claude Code con `pr-review-toolkit`, que mira el changelog del paquete. No es el desarrollador.
- **Test** de la lista con un PR de `vite` (no se fusiona) y uno de `@types/node` (sí).

### RV-205 · Publicar: la puerta mira la CI y el deploy de staging, no una línea escrita · P1 · (b)

**Qué pasa.** `publicar.ts:84-151` acepta una línea `commit: … · resultado: verde` en `docs/`, sin comprobar que `deploy-staging.yml` salió bien con ese commit. `CHANGELOG.md` está exento del diff, pero va al bundle (Novedades).

**Qué se hace.**

- **La marca de RV-139b:** además de la línea, `publicar` exige:
  - una ejecución de `deploy-staging.yml` con `conclusion: success` y `head_sha` igual al de la marca;
  - una de `ci.yml` en verde con ese mismo SHA;
  - que staging sirva ese commit (`<meta name="commit">`).
- **Entre la marca y `main`:** solo se admiten cambios en `docs/**`. `CHANGELOG.md` deja de estar exento, salvo las líneas que pone release-please, que se comparan con su PR.
- **`publicar.ts:2`:** el comentario dice "repite lo que hizo la release 0.9.0"; se corrige cuando 0.9.0 ya esté hecha (RV-200).
- **Tests** de cada caso de rechazo.

### RV-206 · Comprobación de compatibilidad contra lo que de verdad sirve producción · P2 · (b)

**Qué pasa.** `compatibilidad.ts:26` compara con `GITHUB_BASE_REF`. En el PR `develop → main` eso es `main`, no lo que sirve producción, que puede ir por detrás.

**Qué se hace.**

- El commit de referencia es el que dice `<meta name="commit">` de producción. Si no se puede leer, el de `main` y un aviso.
- `ci-sql` tiene que ser obligatorio en los PR a `main`: comprobar la protección de rama con `gh api` y ajustarla si hace falta.

### RV-207 · CI: el paso de instalar navegadores de Playwright no se cuelga · P2 · (b)

- Caché de los navegadores de Playwright (`actions/cache` con la versión de `@playwright/test` en la clave).
- `timeout-minutes: 8` en ese paso, y un reintento.
- Que no pueda gastar los 90 minutos de espera de `publicar`.

### RV-208 · Traspaso de secretos: titular configurable y secretos largos · P2 · (c)

- El actor fijo `aron285-coder` (`traspaso.yml:45,71`) pasa a la variable del repositorio `PROPIETARIO`. Lo mismo en `REPO` y `PROPIETARIO` de `scripts/`: una sola constante, en `scripts/lib/comun.ts`, que se lee de `git remote`.
- **Secretos largos:** RSA-OAEP no pasa de 446 bytes. Se cambia a un cifrado híbrido: RSA cifra una clave AES-256-GCM de un solo uso, y AES cifra el valor. Así sirve también para `GPG_PUBLIC_KEY`.
- **RV-139b** (`revision-completa-staging.md`, "Cómo") escribió la cadena de staging en un archivo temporal. Se cambia a tubería y se corrige el texto.
- **Tests** con un secreto de 4 KB.

### RV-209 · Las instrucciones de reparación no deshacen DEC-172 · P1 · (c)

**Qué pasa.** `respaldo.yml:62-76` y `purgar-fotos.yml:54-60`, cuando faltan secretos, dicen que se haga `gh secret set` **de repositorio**. `purgar-fotos` llama secreto a `SUPABASE_URL_PROD`, que es una variable.

**Qué se hace.**

- Los mensajes dicen: `npm run traspasar-secreto` o `gh secret set … --env prod-tareas`.
- **Test** de workflows: ningún mensaje sugiere `gh secret set` sin `--env`.

### RV-210 · Documentación al día · P2 · (c)

- **`docs/03` TR-92:** decía "aprobación manual"; ahora es la puerta automática (DEC-176).
- **`docs/04`:**
  - §4, líneas 135 y 147: la puerta automática, igual que TR-92;
  - §9: la fila de `despachador.yml`; vigilancia **dos veces al día**; "regenerar" va por pedido;
  - §10, línea 361: los secretos están en `staging`, `production`, `prod-tareas`, el repositorio (solo `GPG_PUBLIC_KEY` y lo no sensible) y el Worker;
  - §10, línea 365: purga y respaldo leen de `prod-tareas`;
  - §10, líneas 367 y 373: `GPG_PUBLIC_KEY`, una sola vez.
- **`docs/09`:**
  - línea 38: "dos clics" ya no;
  - §8, línea 552: docs/31 hecho y docs/32 en curso.
- **`docs/15:49`:** `--rotar cloudflare`, no `CLOUDFLARE_API_TOKEN`.
- **`CLAUDE.md` §7:** el environment `prod-tareas`.
- **`docs/13:6`:** "versión 0.9 (cinco pestañas)".
- **`INDICE.md:42`:** "producción con 0.9.0" solo cuando sea verdad, y la fila 32.
- **`docs/12`:**
  - DEC-180: un solo respaldo, por decisión del desarrollador;
  - DEC-181: Dependabot con lista de permitidos;
  - DEC-182 y DEC-183, con el texto de Backend;
  - DEC-184: el recorrido en staging después de cada documento grande.

---

## 3. Backend · oleada 1 (migración 0041)

### RV-220 · Fotos: el tope cuenta espacio, no solo número · P0

**Qué pasa.** El tope global (`0039:702-711`, 400 al día) cuenta reservas. 400 × 5 MB son 2 GB al día, y Storage es de 1 GB, compartido con uniformidad. Además, cinco tokens baratos llenan las 400 en minutos con reservas que nunca se suben, y entonces nadie del grupo puede mandar fotos durante 24 h (`0039:704-710`).

**Qué se hace (DEC-182).**

1. **Espacio:** `fn_reservar_subida` lee lo que ocupa el bucket, con `sum((metadata->>'size')::bigint)` de `storage.objects` para `hidrantes-fotos`, y le suma 5 MB por cada reserva abierta.
   - Si pasa de `max_bytes_fotos` (por defecto **800 MB**, en `config` y en Ajustes): `SIN_ESPACIO_FOTOS`.
   - Vigilancia avisa al llegar al 70 %.
2. **Reservas abiertas por dispositivo:** como mucho **6** reservas sin confirmar a la vez (`max_reservas_abiertas`). La 7.ª da `RESERVAS_ABIERTAS`, hasta que se confirmen o caduquen.
3. **Tope global:**
   - baja a **150 al día** (`max_subidas_dia_total`);
   - cuenta **solo las confirmadas** más las abiertas de menos de 2 h;
   - una reserva abierta de más de 2 h deja de contar, aunque siga protegida hasta 48 h para la purga.
   - Así, reservar sin subir no bloquea al grupo.
4. **Revocar un dispositivo libera sus reservas abiertas:** dejan de contar.
5. **La purga de reservas nunca confirmadas de más de 48 h:**
   - **cada día**, no solo los lunes;
   - con una tarea de pg_cron que solo borra filas de `subidas`, y el workflow de purga diario solo para esa clase de objeto;
   - el freno del 10 % sigue para lo demás.
   - Lo coordina Ops en `purgar-fotos.yml`.
6. **Salud del sistema:** espacio usado de fotos (MB y %), y los 5 dispositivos con más reservas en 24 h (solo los 8 primeros caracteres del id) para que jefatura pueda revocarlos. El panel lo enseña en RV-262.
7. **pgTAP** de cada caso.

### RV-221 · Propuestas: el tope no se esquiva sacando tokens nuevos · P0

**Qué pasa.** El tope de 60 es por dispositivo (`0039:614-631`), y se sacan hasta 150 tokens por IP y día (`0039:829`). Son unas 9.000 propuestas al día por IP; la base de datos es de 500 MB y está compartida.

**Qué se hace (DEC-183).**

1. **Canjes:** `max_altas_ip_dia` baja de 150 a **20** (son 65 voluntarios), y `max_altas_global_hora` de 150 a **40**.
2. **Token nuevo:** durante sus primeras 24 h, **10** propuestas al día. Después, 60.
3. **Tope global:** **600** propuestas al día entre todos los voluntarios (`max_propuestas_dia_total`). Los administradores no cuentan.
4. **Espacio de la base de datos:** si `pg_database_size(current_database())` pasa de `max_bytes_bd` (por defecto **400 MB**), `fn_proponer` devuelve `SIN_ESPACIO` y vigilancia abre issue al 70 %.
5. **pgTAP** de cada uno.

### RV-222 · Errores del cliente: que no se pueda llenar el cupo de todos · P2

**Qué pasa.** 100 al día por /64, y la función vieja de 5 argumentos (abierta a `anon` para la app 0.7.0) suma 500 más sin IP. Así se llega a 2.000 y se pierden los errores reales (`0040:284-301`).

**Qué se hace.**

- La función de 5 argumentos tiene **su propio cupo**: 200 al día en total y 10 por dispositivo. No consume el cupo de la nueva.
- Se le quita `anon` en la **siguiente** release después de que 0.9.0 lleve una semana en producción. Se anota en #472.

### RV-223 · Compatibilidad con la app 0.7.0 que sigue en los móviles · P1

Tras publicar 0.9.0, los móviles con la PWA 0.7.0 en caché siguen llamando a cosas que 0040 quitó.

- **`fn_reportar_incidencia`:** se le devuelve `execute` a `anon`, pero como sumidero. Acepta, **no guarda nada** y devuelve ok. La app vieja no enseña un error engañoso. Se quita con #472.
- **`fn_salud`:** vuelve a devolver `incidencias_abiertas: 0` para el panel viejo, que si no enseña "undefined".
- **`CUOTA_PROPUESTAS_AGOTADA`** en la cola de 0.7.0: se trata como error desconocido. Se acepta: solo pasa con más de 60 al día. Se anota en 05.
- **pgTAP:** la función vieja responde ok sin escribir.

### RV-224 · `/api/lanzar-workflow`: lo que pasa en staging lo dice la respuesta · P2 · subagente

- En staging, regenerar zona y mapa base devuelven `{ pedido: true, staging: true }`. El panel dice "En staging no se lanza: queda anotado" (RV-260).
- **Test.**

### RV-225 · Push de jefatura por administrador · P1

**Qué pasa.** `fn_borrar_suscripcion_push_admin` (`0040:411-420`) borra cualquier fila de administrador con ese endpoint, también la de otro administrador en el mismo navegador.

**Qué se hace.**

- Borra solo la fila del administrador que llama (`email = fn_email_jwt()`).
- `fn_suscripcion_push_admin(endpoint)` devuelve los temas de **ese** administrador en ese endpoint. El panel deja de fiarse de `localStorage` (RV-264).
- **pgTAP** con dos administradores.

### RV-226 · Cerrar sesión: no hace falta borrar la suscripción dos veces · P2 · subagente

`fn_cerrar_sesion` ya borra la suscripción del dispositivo. Comprobar que también borra la de **voluntario** de ese endpoint y **no** las de jefatura de ese endpoint (RV-234 y RV-258 dependen de esto). Test.

---

## 4. Frontend-campo · oleada 1

### RV-230 · Recargar por versión nueva no pierde lo que solo está en memoria · P1 · (1)

**Qué pasa.** `AvisoVersion.tsx:44`, `pwa.ts:17` y `Ajustes.tsx:226` solo preguntan en `/proponer`. Si IndexedDB falló, hay propuestas "sin guardar" que se pierden al recargar desde el mapa.

**Qué se hace.**

- Antes de recargar, desde cualquier sitio, se mira si hay elementos **solo en memoria**. Si los hay:
  - no se recarga;
  - se avisa: "Hay N propuestas que no se han podido guardar en el móvil. Espera a que se envíen antes de actualizar";
  - "Actualizar igualmente" pide confirmación.
- **Test.**

### RV-231 · IndexedDB se vuelve a abrir si se cae · P1 · (1)

**Qué pasa.** `bd.ts:18-31` solo reinicia `abierta` si falla al abrir. En iOS, tras mucho tiempo en segundo plano, aparece "Connection to Indexed Database server lost", y todo falla hasta reiniciar la app.

**Qué se hace.**

- `onclose` y `onversionchange` ponen `abierta = null`.
- Ante un error de conexión perdida en una transacción, se reabre **una vez** y se repite.
- Lo que estaba solo en memoria se intenta guardar en cuanto vuelve.
- **Tests** con fake-indexeddb cerrando la conexión.

### RV-232 · La cola se para con un tope · P1 · (1)

**Qué pasa.**

- Con `CUOTA_PROPUESTAS_AGOTADA`, el bucle (`cola.ts:495-505`) sigue con las demás y sube sus fotos.
- `CUOTA_SUBIDAS_AGOTADA` no pone `en_espera`, y `reintentarCola` pone `proximo` a 0 en cada `online` (`cola.ts:493,570`), así que se salta la hora de espera.

**Qué se hace.**

- Con `CUOTA_PROPUESTAS_AGOTADA`, `CUOTA_SUBIDAS_AGOTADA`, `SIN_ESPACIO_FOTOS`, `SIN_ESPACIO` o `RESERVAS_ABIERTAS`, **la pasada se para**. Toda la cola queda `en_espera` hasta la hora que diga el servidor.
- `reintentarCola` **no** toca lo que está `en_espera` por un tope.
- **Test:** 10 altas en cola, la primera da tope, y no se pide ninguna reserva más.

### RV-233 · Mensajes de la espera por tope · P2 · (1)

- **Mis propuestas:** "En espera: el grupo ha llegado al máximo de fotos de hoy. Se enviará a las HH:MM", y el equivalente para cada tope.
- **`BarraEstado.tsx:34,57`:** no dice "Lleva más de 24 h esperando cobertura" si lo que espera es un tope.

### RV-234 · Cerrar sesión, rápido y una sola vez · P1 · (1)

**Qué pasa.** Con push activo, `desactivarPush` va antes de la revocación y puede tardar 10 s + 30 s (`acceso.ts:270-273`). Además, el botón no tiene estado de ocupado.

**Qué se hace.**

- Se quita la llamada a `fn_borrar_suscripcion_push`: lo hace `fn_cerrar_sesion` (RV-226).
- La suscripción del navegador **solo** se da de baja si no hay temas de jefatura activos en ese navegador (RV-258).
- Todo el cierre tiene un máximo de **6 s**.
- El botón dice "Cerrando sesión…" y está deshabilitado. Un segundo toque no repite nada.
- **Test.**

### RV-235 · La descarga del mapa base no se queda colgada · P1 · (1)

**Qué pasa.** `mapabase.ts:128-139`: si `lector.read()` se para, "Descargando… N %" no se acaba nunca y no se puede reintentar.

**Qué se hace.**

- Si en 30 s no llega ningún trozo, se aborta (`AbortController`).
- Mensaje: "La descarga se ha parado. Reintentar".
- Se libera el bloqueo y se borra lo parcial.
- **Test** con un stream que se para.

### RV-236 · Lo que anuncia el lector de pantalla durante la descarga · P2 · (2)

`Mapa.tsx:673-681`: el porcentaje sale del `role="status"`. Solo se anuncian el inicio, el 50 %, el final y los errores.

### RV-237 · Las hojas de abajo son ventanas de verdad · P2 · (2)

**Qué pasa.** `Hoja.tsx:20-45` declara `aria-modal`, pero el foco no entra, no se queda dentro y lo de detrás no queda `inert`. Afecta a Cerrar sesión, Descartar, Retirar y el aviso de recargar.

**Qué se hace.**

- Usar `useModal` (`src/lib/foco-modal.ts`, el del panel).
- El foco entra al abrir y vuelve al cerrar.
- **Test.**

### RV-238 · Avisos de arriba sin taparse · P2 · (2)

`AvisoNovedades.tsx:20-24` y `AvisoVersion.tsx:45` van en el mismo sitio y con el mismo `z-index`.

- Un contenedor común de avisos que los apila (versión arriba y novedades debajo) sin tapar el buscador del mapa: el mapa baja su margen superior mientras hay avisos.
- Captura a 360 px con los dos a la vez.

### RV-239 · Volver atrás desde un formulario a medias pregunta · P1 · (2)

**Qué pasa.** La flecha de volver (`Proponer.tsx:195`) y el "atrás" de Android tiran el formulario y las fotos sin preguntar.

**Qué se hace.**

- Con algo rellenado o alguna foto: "¿Salir sin enviar? Se perderá lo que llevas, fotos incluidas", con "Salir" y "Seguir".
- Para el "atrás" de Android se usa una entrada de historial propia, como Editar en el panel.
- **Test e2e** en el proyecto `movil`.

### RV-240 · La pantalla de resultado no es un formulario · P2 · (2)

`aviso-formulario.ts:6` y `sw-push.js:106` tratan toda `/proponer` como formulario a medias.

- Después de enviar, la URL pasa a `/proponer/hecho`, o hay un estado que lo marca.
- Recargar o abrir una notificación desde ahí no pregunta.
- **Test.**

### RV-241 · Mis propuestas dice cuando no ha podido cargar · P2 · (2)

`MisPropuestas.tsx:87-90,188`:

- **Sin lista guardada y la carga falla:** "No se han podido cargar tus propuestas. Reintentar", no "Todavía no has propuesto nada".
- **Con lista guardada y un error del servidor:** "Lista guardada: no se ha podido actualizar".

### RV-242 · Entrar: mensajes para cada error · P2 · (2)

`Entrada.tsx:16-28`: cada código conocido tiene su texto, y uno desconocido dice "No se ha podido entrar (código X). Inténtalo más tarde" en lugar de "Sin conexión":

- `DISPOSITIVO_RESERVADO` (si se repite);
- `CUOTA_*`;
- `TOKEN_*`;
- `DEMASIADOS_INTENTOS`, con la hora.

### RV-243 · Mapa del pin: atribución, aviso sin mapa base y "N sin enviar" · P2 · (2)

- **`SelectorPin.tsx:66`:** atribución compacta (OSM y PNOA), como en el mapa principal.
- **Sin conexión y sin mapa base descargado:** aviso encima del mapa del pin, "Sin conexión y sin mapa descargado: el pin se coloca sobre el contorno de la zona. Descarga el mapa en Ajustes".
- **"N sin enviar"** (`BarraEstado`): los 44 px se tapan 8 px por la cabecera fija. Hay que bajar el enlace o subir su `z-index` para que los 44 px se puedan tocar enteros. **Test** con `elementFromPoint` en los cuatro bordes.

### RV-244 · Fotos enormes en navegadores sin redimensionado al decodificar · P3 · (2)

**Qué pasa.** Si `createImageBitmap` no admite `resizeWidth`, se decodifica a tamaño completo.

**Qué se hace.**

- Leer las dimensiones de la cabecera JPEG o HEIC sin decodificar.
- Si pasan de 24 MP y no hay redimensionado, "Esta foto es demasiado grande para este móvil: cambia la cámara a 12 MP o menos", en vez de arriesgarse a que se cierre la pestaña.
- **Test** con una cabecera de 50 MP.

## 5. Frontend-campo · oleada 2

### RV-245 · Mensajes de los topes nuevos de 0041 · P1

Textos y comportamiento en la cola (RV-232) y en Mis propuestas (RV-233) para `SIN_ESPACIO_FOTOS`, `RESERVAS_ABIERTAS` y `SIN_ESPACIO`, y el tope de los tokens nuevos. Cuando 0041 esté en `develop`.

---

## 6. Frontend-panel · oleada 1

### RV-250 · Cola: al cambiar de filtro no quedan las filas del anterior · P1 · (1)

**Qué pasa.** `ColaRevision.tsx:84-93,393-398`; `useCarga` (`hooks/carga.ts:40`) conserva las filas al cambiar la entrada.

- De Pendientes a Aprobadas, salen las pendientes como "solo lectura". En el ordenador se abre una con Aprobar activo.
- Al volver, salen aprobadas con casillas, y una aprobación en lote manda ids ya resueltos.

**Qué se hace.**

- `useCarga` con una opción `vaciarAlCambiar`: al cambiar la entrada, lista vacía y "Cargando…".
- Las acciones se deshabilitan mientras carga.
- Un error se enseña aunque hubiera filas.
- **Tests.**

### RV-251 · "Aprobar con correcciones" solo manda lo que se ha corregido · P1 · (1)

**Qué pasa.** `DetallePropuesta.tsx:626-639`: el formulario `v` se congela al abrir, pero `propuesto` se recalcula al sincronizar. Tras un `DESACTUALIZADA`, "Guardar y aprobar" manda como correcciones los valores viejos. Además, `valoresPropuestos` usa solo el punto del inventario, no `p.punto`.

**Qué se hace.**

- Las correcciones son **solo los campos que jefatura ha tocado**, comparados con lo que vio al abrir.
- Con `DESACTUALIZADA`:
  - el formulario se queda abierto;
  - aviso "El punto ha cambiado: revisa los datos";
  - los campos no tocados se ponen al día;
  - "Confirmar y aprobar".
- Base de los valores: `p.punto` (0036), y si falta, el inventario.
- **Tests.**

### RV-252 · En el móvil, `DESACTUALIZADA` no cierra el detalle · P1 · (1)

`DetallePropuesta.tsx:125` → `ColaRevision.tsx:167-171`. Solo vuelve a la cola cuando la acción ha terminado de verdad (aprobada, rechazada, fusionada). Con un error, el detalle se queda con lo escrito. Test e2e a 412 px.

### RV-253 · Fusionar: la dirección editada y la otra medida · P2 · (1)

- `DetallePropuesta.tsx:180,228-238`: la dirección que jefatura editó en el detalle se manda a `fn_fusionar_con_existente` (como `prevalece.direccion`, o una clave nueva si Backend la añade en 0041; coordinarlo).
- `diferenciasFusion` incluye el `diametro_otro` de una boca.
- **Tests.**

### RV-254 · Fusionar a 412 px · P2 · (1)

`DetallePropuesta.tsx:848-858`: un `<select>` con una descripción de 500 caracteres desborda. Las opciones se recortan a 60 caracteres con "…" y el texto entero va en `title`. Sin desplazamiento a lo ancho a 412 px.

### RV-255 · Historial de la propuesta con valores en palabras · P2 · (1)

`DetallePropuesta.tsx:587-589` usa `String(v)`. Se usa `valorDe`/`textoCambios` (lo de `registro-legible.ts`): "Dirección → —", "Enganche → Barcelona", "Diámetro → 70 mm".

### RV-256 · La dirección de la celda solo se guarda si se ha escrito · P1 · (2)

`Inventario.tsx:244-259,350-356`: con el foco sin escribir y una sincronización que trae otra dirección, el `blur` escribe la vieja. Se guarda **solo** si `valor !== base`, siendo `base` lo que había al entrar en la celda. Si mientras tanto ha cambiado el dato, se enseña lo nuevo. Test.

### RV-257 · Parámetros: no se edita hasta que carguen · P1 · (2)

`Ajustes.tsx:316-324`:

- Mientras carga, los campos se deshabilitan con "Cargando…".
- Con error: el mensaje y "Reintentar".
- `cambiosParametros` compara con lo cargado de verdad, nunca con los valores por defecto.
- **Test:** editar antes de cargar no manda los valores por defecto.

### RV-258 · Push: apagar los avisos de voluntario no apaga los de jefatura · P1 · lo hace **Frontend-campo** (dueño de `push.ts`)

`desactivarPush` (`push.ts:176`), también desde cerrar sesión (`acceso.ts:272`), da de baja la suscripción compartida.

- Si en ese navegador hay temas de jefatura activos (preguntándolo al servidor, RV-225), no se da de baja la suscripción del navegador: solo se borra la fila de voluntario.
- **Test.**

### RV-259 · Diálogos: error y vacío a la vez · P3 · (2)

`dialogos.tsx:158-165`: con error, solo el error y "Reintentar".

### RV-260 · Mantenimiento: lo que se pide y lo que pasa · P2 · (2)

**Qué pasa.** El resultado del despachador solo queda en `pedidos_trabajo`, que no enseña nadie. El Registro dice "Mantenimiento lanzado" cuando solo se pidió (`textos.ts:850`). En staging, "Empezará en unos minutos" es falso (`textos.ts:981`).

**Qué se hace.**

- **Ajustes → Mantenimiento:** los últimos 5 pedidos con su estado (pedido, lanzado, error y el texto), con un RPC de lectura que da Backend (`fn_pedidos_recientes`, coordinar en 0041).
- **Registro:** "Mantenimiento pedido".
- **En staging:** "En staging no se lanza: queda anotado" (RV-224).

### RV-261 · Ajustes sin errores silenciosos · P2 · (2)

- **El código de acceso no carga:** "No se ha podido leer el código. Reintentar" en vez de "—" (`Ajustes.tsx:127`).
- **`contarDispositivos` falla:** devuelve error en vez de 0 (`ajustes.ts:53-56`). La ventana de revocar dice "No se sabe cuántos móviles se desconectarán" y deja seguir.

### RV-262 · Salud: espacio y reservas · P2 · oleada 2 (cuando 0041 esté)

En Salud del sistema:

- espacio de fotos usado (MB y %) y espacio de la base de datos;
- los dispositivos con más reservas en 24 h (RV-220), con "Revocar este móvil", que usa la revocación por dispositivo ya existente o una que dé Backend.

### RV-263 · Accesibilidad de las capas a pantalla completa · P2 · (2)

- **Detalle de la propuesta en móvil y tableta** (`ColaRevision.tsx:347-360`): `useModal`, y el foco vuelve a la fila al cerrar.
- **`HojaQR`** (`CodigoQR.tsx:32-63`): `role="dialog"`, `aria-modal`, foco dentro y `useModal`.
- **Historial de la Cola en el móvil:** si la propuesta abierta se resuelve en otro sitio, se reemplaza la entrada en vez de duplicarla.
- **axe y Tab** en las dos capas.

### RV-263b · CSV con coordenadas que Excel en español lee como números · P3 · (2)

`exportar.ts:92-95`: con `;` como separador, las coordenadas se escriben con coma decimal (`37,2308`). El GeoJSON y el `.xlsx` no cambian. Test.

## 7. Frontend-panel · oleada 2

### RV-264 · Push de jefatura por administrador · P1

- **Los temas se leen del servidor** (`fn_suscripcion_push_admin`, RV-225), no de `localStorage`. Si se guardan en `localStorage`, es con la clave del hash del correo, y se borran al cerrar sesión de jefatura.
- **Desactivar los temas** borra solo la fila de ese administrador.
- **Test** con dos administradores en el mismo navegador.

---

## 8. Ops · oleada 3

### RV-270 · Recorrido completo de la app en staging, en una ventana visible (DEC-184) · P0

Cuando **todo** lo anterior esté en `develop` y desplegado en staging, una sesión de Claude Code **abre una ventana de navegador visible en este PC** y prueba la app entera, como lo haría una persona. No es un test automático más: es mirar, tocar y opinar.

**Cómo:**

- Playwright con Chromium, `headless: false` y `slowMo` de ~250 ms, para que se vea en pantalla lo que hace. La ventana se queda abierta durante todo el recorrido.
- **Dos tamaños:**
  - móvil emulado (Pixel 7, 412 × 915, táctil);
  - ordenador (1440 × 900).
- En cada pantalla: modo **claro** y **oscuro**, y una pasada con la ventana a 360 px.
- **Contra staging real** (`hidrantes-albolote-staging.pages.dev`), como voluntario, con el código de staging que la sesión lee de su sitio. Nunca en el chat ni en el informe.
- **El panel de jefatura:** la entrada con Google **no se automatiza** y no se escriben credenciales.
  - El panel se recorre en el build de staging servido en local (`npm run preview` con el modo de staging) y con el mismo servidor simulado de los e2e (`e2e/`), con datos realistas.
  - Lo que hace falta de verdad en la base de datos de staging se comprueba como en RV-139b, con claims de administrador en una transacción.
- **Capturas** de cada pantalla y de cada problema, en `docs/verificacion/recorrido/AAAA-MM-DD/`, solo con datos de prueba (`[PRUEBA]`, nombres ficticios). Nada personal; el repositorio es público.

**Qué recorre (como mínimo):**

1. **Primera vez:** bienvenida, entrada con el código, nombre y apellido, permiso de ubicación (concedido y denegado).
2. **Mapa:**
   - marcadores de cada estado (con el anillo de sin revisar);
   - capas Mapa y Satélite;
   - buscar por código y por calle;
   - "¿Qué hay aquí?";
   - Medir;
   - Cercanos;
   - leyenda;
   - zoom.
3. **Ficha:** banda de estado, datos, coordenadas, "Cómo llegar", compartir y proponer un cambio.
4. **Las seis operaciones** (alta, revisión, estado, datos, ubicación, retirada):
   - con y sin conexión (modo avión de Playwright);
   - con fotos (`e2e/fixtures`);
   - enganche Directo;
   - otra medida;
   - Barro;
   - volver atrás a mitad.
5. **Cola sin enviar:**
   - reintentar;
   - Mis propuestas;
   - novedades;
   - el aviso de versión nueva (se fuerza con un service worker nuevo de staging, o se simula).
6. **Ajustes:** mapa base (descargar y cancelar), push (activar y desactivar), tema, nombre y cerrar sesión.
7. **Lista** de puntos: filtros, orden y búsqueda.
8. **Panel:**
   - las cinco pestañas;
   - Cola: filtros, aprobar, corregir, rechazar, fusionar y en lote;
   - Inventario: filtros, Exportar, Editar con mover y Directo, Retirar, Borrar e Historial;
   - Registro y Papelera;
   - Ajustes: código, administradores, núcleos, parámetros, Salud, Mantenimiento y avisos.
9. **Accesibilidad:** solo con teclado (Tab, Esc, flechas) en el panel; axe en cada pantalla; y con el zoom del navegador al 200 %.

**Qué mira en cada pantalla:**

- que se ve bien: nada cortado, nada solapado, nada que desborde, alineaciones, márgenes y contraste;
- que se entiende sin explicación: textos claros, en castellano llano, sin jerga;
- que cada botón hace lo que dice, y que no hay controles muertos, estados vacíos sin texto ni errores silenciosos (06 §9);
- que es coherente con `docs/06`: colores, tipografía, un solo botón principal por pantalla y objetivos táctiles de 44 px;
- velocidad percibida: lo que tarda en abrir, cargar y enviar (con `performance.now()` en los pasos clave);
- la consola: errores y avisos de JavaScript.

**Qué entrega: `docs/verificacion/recorrido-staging-AAAA-MM-DD.md`**, con:

1. **Resumen** en 5 líneas: cómo está la app y lo más importante.
2. **Tabla de recorridos:** pantalla, tamaño, modo, ok o problema, y captura.
3. **Defectos encontrados:** cada uno con pasos para reproducirlo, lo esperado y lo que pasa, la captura y la gravedad (alta, media o baja). Cada uno de gravedad alta o media **abre una issue** (sin datos personales).
4. **Revisión visual:** por pantalla, lo que está bien y lo que no (espaciado, jerarquía, contraste, alineación, consistencia entre pantallas, modo oscuro), con capturas marcadas (un recuadro rojo dibujado sobre la captura).
5. **Propuestas de mejora de la UI:** cada una con:
   - qué cambiar;
   - por qué (para el voluntario en la calle o para jefatura);
   - antes y, si ayuda, un boceto rápido en HTML en `docs/verificacion/recorrido/AAAA-MM-DD/propuestas.html`;
   - beneficio, esfuerzo (S, M, L) y prioridad.

   Como mucho 15, ordenadas por prioridad. Son **propuestas**: **no se implementan** en este documento; el desarrollador elige cuáles van a un docs/33.
6. **Velocidad:** los tiempos medidos y si alguno se sale de `docs/03` (TR).
7. **Consola:** los errores de JavaScript vistos.

**Reglas:**

- El recorrido **no cambia código**. Si encuentra un defecto de gravedad alta, lo anota, abre la issue con la etiqueta `bloquea-release` y sigue el recorrido.
- No escribe datos personales, ni el código de acceso, en el informe, en las capturas ni en las issues.
- Al acabar, deja staging como estaba: rechaza con motivo "prueba" las propuestas que haya creado, y borra lo que haya dado de alta.

### RV-271 · Publicar 0.10.0 · P0

Solo si RV-270 no ha abierto ninguna issue `bloquea-release`:

1. `npm run publicar` (con la puerta de RV-205).
2. La fila en `paridad-produccion.md`.
3. Si hay alguna `bloquea-release`: no se publica. Se arregla en un PR, se repite la parte del recorrido afectada y se vuelve a intentar.

---

## 9. Checklist

- [ ] **Oleada 0:** 0.9.0 en producción y `GITHUB_DISPATCH_TOKEN` borrado.
- [ ] **Ops:**
  - [ ] el único respaldo vigilado (existe, es reciente, tiene la clave correcta);
  - [ ] el despachador sin `actions: write` donde no hace falta;
  - [ ] RV-130 con la ventana del paso de despliegue;
  - [ ] Dependabot con lista de permitidos;
  - [ ] `publicar` mira la CI y el deploy de staging;
  - [ ] compatibilidad contra lo que sirve producción;
  - [ ] la instalación de Playwright no se cuelga;
  - [ ] traspaso híbrido y titular configurable;
  - [ ] mensajes de reparación correctos;
  - [ ] documentación al día y DEC-180 a DEC-184.
- [ ] **Backend:**
  - [ ] espacio de fotos;
  - [ ] reservas abiertas y tope global que no bloquea al grupo;
  - [ ] purga diaria de reservas;
  - [ ] canjes y tokens nuevos limitados;
  - [ ] tope global de propuestas y espacio de la base de datos;
  - [ ] cupo propio de la función de errores vieja;
  - [ ] compatibilidad con 0.7.0;
  - [ ] push de jefatura por administrador;
  - [ ] pedidos recientes;
  - [ ] pgTAP de todo.
- [ ] **Frontend-campo:**
  - [ ] recargar sin perder;
  - [ ] IndexedDB que se reabre;
  - [ ] cola que se para con un tope;
  - [ ] cerrar sesión rápido;
  - [ ] descarga que no se cuelga;
  - [ ] hojas modales;
  - [ ] avisos apilados;
  - [ ] atrás que pregunta;
  - [ ] resultado que no es formulario;
  - [ ] Mis propuestas y Entrada con sus errores;
  - [ ] mapa del pin;
  - [ ] fotos enormes;
  - [ ] topes nuevos.
- [ ] **Frontend-panel:**
  - [ ] Cola sin filas del filtro anterior;
  - [ ] correcciones solo de lo tocado;
  - [ ] `DESACTUALIZADA` sin cerrar;
  - [ ] Fusionar;
  - [ ] historial en palabras;
  - [ ] celda de dirección;
  - [ ] parámetros;
  - [ ] push por administrador;
  - [ ] mantenimiento con resultados;
  - [ ] Ajustes sin silencios;
  - [ ] Salud con espacio;
  - [ ] capas accesibles;
  - [ ] CSV con coma decimal.
- [ ] **Oleada 3:**
  - [ ] recorrido completo en staging con su informe y sus propuestas de UI;
  - [ ] 0.10.0 en producción si no hay bloqueos.
- [ ] Tests, e2e, axe y pgTAP en verde; CI y staging en verde.

## 10. Lo que hace el desarrollador

**Nada**, salvo dos cosas que no puede hacer nadie más:

- elegir, cuando lea el informe de RV-270, qué propuestas de UI van a un docs/33;
- volver a iniciar sesión en `gh` o `wrangler` si una sesión le avisa de que han caducado.
