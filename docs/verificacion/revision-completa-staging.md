# Verificación · RV-139b: la comprobación en staging (docs/31)

Sustituye a las pruebas a mano ("en el Android, probar…"). Una sesión con Playwright y el Chrome del
PC, **contra staging de verdad** (`https://hidrantes-albolote-staging.pages.dev`, no los mocks),
con un Pixel 7 emulado (412 × 915) y en escritorio (1280 × 800). 8 oct 2026.

Staging estaba desplegado con el commit probado: el último «Desplegar staging» en verde
(run 37699097295) lleva el mismo SHA que `origin/develop`.

## Resultado

| Recorrido | Cómo | Resultado | Captura (`docs/capturas/staging-31/`) |
|---|---|---|---|
| Cercanos | Móvil y escritorio: se ve la hoja, las tres primeras filas caben sin desplazar, «Cómo llegar» de la primera fila lleva a Google Maps | ok | `01-cercanos-movil.png`, `01-cercanos-escritorio.png` |
| Alta de una boca con enganche Directo | Móvil: boca, 45 mm, Directo, Bueno, foto de la conexión y foto del sitio, **sin conexión** («Guardar · se enviará con cobertura» → «Guardado en el móvil», «1 sin enviar»); con conexión se envía sola. En la base: pendiente, `racor = directo`, en `v_cola_revision` con las dos fotos distintas | ok | `02-alta-formulario-movil.png`, `03-alta-guardada-sin-conexion-movil.png` |
| Mis propuestas | Móvil y escritorio: el alta sale como «Alta · nuevo · Pendiente» | ok | `04-mis-propuestas-movil.png`, `04-mis-propuestas-escritorio.png` |
| Revisión de un punto existente | Móvil: HID-9001 → «Proponer un cambio» → «Sigue igual» → foto → «Enviado para revisión»; en la base, pendiente | ok | `05-revision-enviada-movil.png` |
| Jefatura: aprobar | En la base de staging, con claims de administrador dentro de la transacción: `fn_aprobar` del alta del recorrido (sale BOC-0004); la revisión, `fn_rechazar` con motivo «prueba» | ok | — |
| Jefatura: editar, mover y cambiar enganche | `fn_editar_punto` con `lat` + 6 m y `racor = granada`: una entrada `edicion_admin` con `es_admin`, `desplazamiento_m = 6`. `detalleLegible` (`src/lib/panel/registro-legible.ts`) sobre esa fila de `v_registro`: **«Enganche: Directo → Granada · Movido 6 m»** | ok | — |
| Panel (Cola, Editar, Registro, foco) con mocks | `e2e/panel-*`, `e2e/jefatura-movil`, `e2e/ajustes-avisos` en móvil y escritorio: 147 pasan, 25 se saltan por proyecto. Cuatro se pasaron de tiempo en la primera tanda (PC cargado) y pasan repetidos de uno en uno | ok | — |
| Push: Worker de avisos | Staging no tiene ninguna suscripción ni notificación (`suscripciones_push` y `notificaciones` vacías): no hay ningún envío del que comprobar el `201`. Nada pendiente ni con error. El Worker `hidrantes-avisos` está desplegado (cron cada 5 min, staging en `DESTINOS`) | ok · sin datos | — |
| Push: service worker | El SW de staging recibe un push (entregado con `ServiceWorker.deliverPushMessage` del protocolo de depuración de Chrome) y **muestra la notificación** (`getNotifications()` la devuelve con su título). Además, `e2e/operaciones` «un aviso con el formulario a medias…» y `src/lib/sw-push.test.ts` en verde | ok | — |
| `npm run anonimizar -- --entorno staging` | Primero falló: aborta siempre con `--entorno staging/prod` (#532, `bloquea-release`). Arreglado en #533. Después, los dos dispositivos de prueba del recorrido («Prueba Tres»): 4 filas cada uno; sus propuestas y entradas del registro quedan «voluntario dado de baja» | ok (tras #533) | — |
| Limpieza de staging | Con claims de administrador: las 7 propuestas de prueba pendientes (6 del seed y un alta de desarrollo) rechazadas con motivo «prueba»; las 2 incidencias abiertas de staging cerradas (`fn_resolver_incidencia`). Quedan 0 pendientes y 0 incidencias abiertas. #77 **no** se cierra: es el piloto de la agrupación (etiqueta `organizacion`); comentario dejado en ella | ok | — |

## Cómo, sin ver ningún secreto

- **Cadena de staging.** `SUPABASE_DB_URL` del environment `staging`, traída con el traspaso de
  clave efímera de §1 (las mismas funciones que `scripts/traspasar-secreto.ts`, que solo copia a
  otro secreto de GitHub). Ejecución del workflow y artefacto borrados. Nunca se imprimió.
  *Corrección (docs/32 RV-208):* esta vez la cadena descifrada se escribió en un archivo temporal
  fuera del repositorio, borrado al acabar. Eso no se repite: la próxima comprobación la descifra en
  memoria y la pasa **por tubería** al proceso que la usa (stdin, o el entorno del proceso hijo con
  `entornoPg` para `psql`), como `traspasar-secreto` se la pasa a `gh secret set`; nunca a un
  archivo, a un argumento ni a la salida.
- **Entrada como voluntario.** El código de acceso de staging solo está como hash bcrypt: no se
  puede canjear sin teclearlo. Se hizo lo mismo que el final de `fn_verificar_codigo`: un token
  aleatorio cuyo sha256 se guarda en `hidrantes.dispositivos` para un dispositivo nuevo, comprobado
  con `fn_validar_token`, y puesto en el almacenamiento local del contexto de Playwright
  (`hidrantes.token`, `hidrantes.dispositivo_id`, la firma ficticia «Prueba Tres» y
  `primer_uso_visto`). Nadie tecleó ni leyó el código. Al acabar, el token se revocó
  (`revocado_en`).
- **Jefatura.** La entrada con Google no se automatiza. Los pasos de jefatura se hicieron en la base
  con `request.jwt.claims` de un administrador activo, locales a la transacción, como
  `scripts/anonimizar.ts`. El correo se leyó de la base dentro de la consulta y no sale en ningún log.
- **Capturas.** Sin códigos ni datos personales: solo puntos `[PRUEBA]` y el nombre ficticio.

## Desviaciones

- **Fotos.** No existe `e2e/fixtures`: las dos fotos se generan en el navegador (JPEG de 1200 × 900),
  como en `e2e/integracion/fase6.spec.ts`.
- **«Cómo llegar» en el móvil.** En Android el enlace es `geo:` (lo abre la app de Google Maps), como
  dice `src/lib/ficha.ts`; la URL web de Google Maps es la del escritorio. Se comprueban los dos.
- **Enganche.** El alta es Directo, así que la edición va de Directo a Granada (la especificación
  ponía «Granada → Directo»).
- **`detalleLegible` con `tsx`** no arranca (`import.meta.env` no existe fuera de Vite): se ejecutó
  con `vite-node`.
- **e2e del panel «contra el build de staging».** El config no lo permite: los mocks interceptan
  `supabase.invalid` y el build de staging apunta a su Supabase real. Se corrieron contra el build
  local del mismo commit.
- **Push con suscripción real.** Chrome automatizado no tiene servicio de push (la app lo dice: «servicio
  de avisos no disponible»), así que no se puede crear una suscripción de verdad. El `201` del Worker
  queda sin datos; se comprueban el SW de staging y que no hay nada pendiente ni con error.
- **Dos ejecuciones.** La primera tanda (commit `9b2db1f`) se paró en #532. Los recorridos se
  repitieron enteros con el commit de abajo, ya con el arreglo desplegado, y los dos dispositivos de
  prueba se anonimizaron.
- **Seed.** Dos propuestas del seed (`5eed0000-…`) ya llevaban «Prueba Tres» como autor ficticio: no
  son de este recorrido y no se han tocado.

commit: 7d4e82c8d3ea4444841b7f7e5286f7a7166f63f3 · resultado: verde
