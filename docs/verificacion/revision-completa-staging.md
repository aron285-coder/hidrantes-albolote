# Verificación · RV-139b: la comprobación en staging (docs/31)

> **Nota (10 oct 2026, `docs/34` RV-359, DEC-195):** en Git solo quedan las capturas que este informe enlaza. Las demás se quitaron de `HEAD`; siguen en el historial, por ejemplo en `9a15d27` (`git show 9a15d27:<ruta>`).

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

Primera comprobación completa: `7d4e82c8d3ea4444841b7f7e5286f7a7166f63f3`, en verde.

## Repetición con 1790560 (8 oct 2026)

Después de #536 y #537 (tests e2e), con «Desplegar staging» en verde para el commit actual de
`develop` (run 37747282708). Mismo método: cadena por el traspaso de clave efímera, token de prueba
creado en la base (nadie teclea el código), jefatura con claims de administrador.

| Recorrido | Resultado |
|---|---|
| Cercanos (móvil y escritorio), alta Directo con dos fotos sin conexión y con conexión, Mis propuestas (móvil y escritorio), revisión de HID-9001 | ok (capturas renovadas en `docs/capturas/staging-31/`) |
| Jefatura: aprobar el alta (BOC-0005), rechazar la revisión con «prueba», `fn_editar_punto` 6 m y enganche; `detalleLegible` da «Enganche: Directo → Granada · Movido 6 m» | ok |
| SW de staging muestra la notificación de un push | ok. La primera vez se pasó de tiempo, justo tras el despliegue, mientras se instalaba la versión nueva del SW y el push se entregaba al registro anterior; repetida 3 veces seguidas, 3 en verde |
| `npm run anonimizar -- --entorno staging` del dispositivo de prueba | ok: 4 filas, «voluntario dado de baja» |
| Limpieza | ok: 0 propuestas pendientes y 0 incidencias abiertas; token revocado, cadena borrada |

Repetición con `1790560a66a23f361f632e5b689c257876ae92db`: en verde.

## Repetición con 1117c8d, la de la release (8 oct 2026)

Después de #539 y #542 (migración 0041), con «Desplegar staging» en verde para el commit actual de
`develop` (run 37749352903) y `0041_espacio_topes_y_compatibilidad.sql` anotada en
`hidrantes.migraciones_aplicadas` de staging. El método es el mismo.

| Recorrido | Resultado |
|---|---|
| Cercanos (móvil y escritorio), alta Directo con dos fotos sin conexión y con conexión, Mis propuestas (móvil y escritorio), revisión de HID-9001 | ok (capturas renovadas) |
| Jefatura: aprobar el alta (BOC-0006), rechazar la revisión con «prueba», `fn_editar_punto` 6 m y enganche; `detalleLegible` da «Enganche: Directo → Granada · Movido 6 m» | ok |
| SW de staging muestra la notificación de un push | ok |
| `npm run anonimizar -- --entorno staging` del dispositivo de prueba | ok: 4 filas, «voluntario dado de baja» |
| Limpieza | ok: 0 propuestas pendientes y 0 incidencias abiertas; token revocado, cadena borrada |

Repetición con `1117c8d2e86e4e1c8160d16e3eaba4480167934f` (release 0.9.0): en verde.

## Release 0.10.0 (9 oct 2026)

Con todo docs/32 y #566 (0043: `/api/geocodificar` y `/api/push` validan el token, arreglo de #561).
«Desplegar staging» en verde con el commit actual de `develop` (run 37893324635), y
`0043_validar_token_para_functions.sql` anotada en `hidrantes.migraciones_aplicadas` de staging.

**Método (RV-208, sin archivo temporal).** Un solo proceso trae `SUPABASE_DB_URL` de staging con
el traspaso de clave efímera y la tiene **solo en memoria**. Por disco pasa únicamente el sobre
cifrado, como en `scripts/traspasar-secreto.ts`. A los procesos hijos les llega por su entorno:
`psql` la recibe como variables `PG*` (como `entornoPg`), con el SQL por stdin, y `anonimizar` como
`SUPABASE_DB_URL`. Nunca va en un archivo, en un argumento ni en la salida. El token de prueba se
crea en la base y llega a Playwright también por el entorno; nadie teclea el código.

| Recorrido | Resultado |
|---|---|
| Cercanos (móvil y escritorio), alta Directo con dos fotos sin conexión y con conexión, Mis propuestas (móvil y escritorio), revisión de HID-9001 | ok |
| **Nuevo:** buscar «Calle Real 10» enseña el grupo «Direcciones» (CartoCiudad · IGN, «Calle Real, 10, Albolote») y no «Vuelve a entrar con el código…» (móvil y escritorio) | ok · `06-buscar-direccion-movil.png`, `06-buscar-direccion-escritorio.png` |
| **Nuevo:** `POST /api/push` con el token del dispositivo de prueba: ni 401 ni 5xx | ok |
| SW de staging muestra la notificación de un push | ok |
| Jefatura por BD: aprobar el alta (BOC-0007), rechazar la revisión con «prueba», `fn_editar_punto` 6 m y enganche; `detalleLegible` da «Enganche: Directo → Granada · Movido 6 m» | ok |
| `npm run anonimizar -- --entorno staging` del dispositivo de prueba | ok: 2 propuestas y 2 entradas del registro, «voluntario dado de baja» |
| Limpieza | ok: nada pendiente del recorrido (lo que quedara, rechazado con «prueba»), 0 pendientes, 0 incidencias abiertas, token revocado; la cadena no salió de la memoria |

commit: aba87542a65cedfca72d274f7cf136a286715a0a · resultado: verde

## Release 0.10.1 (9 oct 2026)

Con los arreglos de los defectos D2, D3 y D4 del recorrido (#576, #574, #575 y #577) y la fusión con
reintento de `npm run publicar` (#573). Sin migraciones nuevas: la última en staging sigue siendo
`0043_validar_token_para_functions.sql`. «Desplegar staging» en verde con el commit de abajo. Mismo
método que en 0.10.0 (RV-208: la cadena solo en memoria; traspaso 37910115092, borrado).

| Recorrido | Resultado |
|---|---|
| Cercanos, alta Directo con dos fotos sin conexión y con conexión, Mis propuestas, revisión, buscar «Calle Real 10», `POST /api/push`, SW de staging con un push | ok |
| **Nuevo (#562):** a 1440 × 900, en el mapa y en `/lista`, la página mide la ventana y `scrollTo(0, 10000)` no la mueve | ok · `07-alto-pagina-mapa-escritorio.png`, `07-alto-pagina-lista-escritorio.png` |
| Jefatura por BD: aprobar el alta (BOC-0008), `fn_editar_punto` 6 m y enganche; `detalleLegible` da «Enganche: Directo → Granada · Movido 6 m» | ok |
| `npm run anonimizar -- --entorno staging` del dispositivo de prueba | ok: 2 propuestas y 2 entradas del registro, «voluntario dado de baja» |
| Limpieza | ok: 0 pendientes, 0 incidencias abiertas, token revocado |

D3 y D4 son de pantalla con datos simulados (la Cola necesita entrar con Google): los cubren sus e2e
en la CI de `develop`.

commit: ad105f0f8f1a2dd229ff2f25120aef401201d6b6 · resultado: verde

## Release 0.11.0 (9 oct 2026, docs/33 RV-343)

Con todo docs/33: la migración `0044_entrada_abierta_espacio_y_reservas.sql` (anotada en staging), las
Functions y las mejoras U1 a U15. «Desplegar staging» en verde con el commit de abajo. Mismo método que
en 0.10.0 (RV-208: la cadena solo en memoria; traspaso 37961020054, borrado). La espera de la píldora
«al día · N» sustituye a la de la franja «Sincronizado…» (U2, RV-311).

| Recorrido | Resultado |
|---|---|
| Cercanos, alta Directo con dos fotos sin conexión y con conexión, Mis propuestas, revisión, buscar «Calle Real 10», `POST /api/push`, SW de staging con un push, la página del escritorio que no se desplaza | ok |
| Jefatura por BD: aprobar el alta (BOC-0009), `fn_editar_punto` 6 m y enganche; `detalleLegible` da «Enganche: Directo → Granada · Movido 6 m» | ok |
| **Nuevo (RV-343):** 25 canjes desde una misma IP con la entrada **cerrada**: entran 20 y del 21.º al 25.º `DEMASIADOS_INTENTOS`; con la entrada **abierta** (`fn_abrir_entrada(24)` como jefatura), entran los 25 desde otra IP; `fn_cerrar_entrada` la deja cerrada. Todo en una transacción que se deshace: el código de prueba es desechable (no el real) y no queda nada en staging | ok |
| `npm run anonimizar -- --entorno staging` del dispositivo de prueba | ok: 2 propuestas y 2 entradas del registro, «voluntario dado de baja» |
| Limpieza | ok: 0 pendientes de prueba, 0 incidencias abiertas, token revocado |

Los canjes van directos a `fn_verificar_codigo` en la base (no por `/api/verificar-codigo`, que pide el
código real); el hash de la IP es el mismo valor que la Function le pasaría. Las capturas de
`docs/capturas/staging-31/` se han renovado con la interfaz de docs/33.

commit: 9f6d7ccdb9ac21d3b3411bc3116546db85f73030 · resultado: verde

## Release 0.11.1 (9 oct 2026)

Con el arreglo de #625 (#628: en el ordenador, Mis propuestas lleva la barra de arriba). Sin migraciones
nuevas: la última en staging sigue siendo `0044`. «Desplegar staging» y CI en verde con el commit de
abajo. Mismo método (traspaso 37972589137, borrado).

| Recorrido | Resultado |
|---|---|
| Los recorridos de 0.11.0 (voluntario, jefatura por BD, `detalleLegible`, anonimizar) y los 25 canjes de RV-343 (20 y el 21.º frenado con la entrada cerrada; 25 con la entrada abierta; todo deshecho) | ok (BOC-0010) |
| **Nuevo (#625):** a 1440 × 900, en Mis propuestas la barra de arriba enseña «Mapa» y «Mis propuestas» marcada como actual | ok · `08-mis-propuestas-navegacion-escritorio.png` |
| Limpieza | ok: 0 pendientes, 0 incidencias abiertas, token revocado |

commit: 52b7050e4cc3cebf6a75baa11b5ea58a2216f3a6 · resultado: verde

### Repetición con 6ca7b23 (9 oct 2026)

Tras el marcador de `52b7050` entraron dos cambios que no son solo documentación: #632 (Novedades con
los ámbitos de docs/33 y el e2e del escritorio que ya no da por hecho el punto de novedades; el PR de
versión 0.11.1, #630, fallaba por eso) y #633 (las bibliotecas de los navegadores, desde una caché en la
CI). Repetida la comprobación entera con el commit de abajo: recorridos de voluntario (13 en verde, con la
barra de arriba en Mis propuestas), jefatura por BD (BOC-0011), los 25 canjes (20 y el 21.º frenado con la
entrada cerrada; 25 con la entrada abierta; deshecho), `detalleLegible`, anonimizar y limpieza (0
pendientes, 0 incidencias abiertas). Traspaso 37983045924, borrado.

commit: 6ca7b23d8135317c22f8580f8c18aa14b084a7e2 · resultado: verde

### Release 0.12.0 con 8f7359d (10 oct 2026, `docs/34` RV-362)

Con todo `docs/34` (RV-350 a RV-361) en `develop`, con «Desplegar staging» y CI en verde para ese commit y
con `0044_entrada_abierta_espacio_y_reservas.sql` como última migración de staging. El método es el mismo:
la cadena va por el traspaso, solo en memoria; el token de prueba se crea en la base; jefatura usa claims
de administrador.

| Recorrido | Resultado |
|---|---|
| Voluntario contra staging (Cercanos, alta Directo con dos fotos sin y con conexión, Mis propuestas, revisión de HID-9001, «Calle Real 10», `/api/push`, alto de página y navegación de escritorio) | 13 en verde (7 saltados por proyecto) |
| Jefatura por BD: aprobar el alta (BOC-0012), rechazar la revisión con «prueba», `fn_editar_punto` 6 m y enganche | ok; `detalleLegible` da «Directo → Granada · Movido 6 m» |
| 25 canjes desde una IP | cerrada: 20 ok y del 21.º al 25.º `DEMASIADOS_INTENTOS`; abierta: 25 ok; cerrada otra vez; todo deshecho |
| Recorrido corto de lo cambiado (RV-350 a RV-356), 412, 360 y 1440 px, en claro y en oscuro | 30 en verde: [`recorrido-staging-2026-10-10.md`](recorrido-staging-2026-10-10.md) |
| `npm run anonimizar -- --entorno staging` del dispositivo de prueba | ok: 2 propuestas y 2 entradas del registro, «voluntario dado de baja» |
| Limpieza | ok: 0 pendientes y 0 incidencias abiertas; token revocado; traspaso 38043294133, borrado |

commit: 8f7359d2ecb80b41c0addd5c4a709c92fe8c0d36 · resultado: verde
