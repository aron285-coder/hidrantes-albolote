# Verificación · Segunda revisión completa y recorrido (docs/32)

**Estado:** oleadas 0, 1 y 2 hechas el 8 oct 2026: todo el código en `develop` y en staging; la
0.9.0, en producción. La oleada 3 (recorrido RV-270 y release 0.10.0, RV-271) se registra aparte.
Especificación: `docs/archivo/especificaciones/32-segunda-revision-y-recorrido.md`. Cuatro sesiones con subagentes,
coordinadas en #535. El detalle de cada punto (pruebas, revisión, desviaciones) está en el cuerpo de
su PR; aquí va el resumen. Todo test de un punto con código **falló antes del arreglo** salvo donde se
dice lo contrario.

## Oleada 0 · Ops (RV-200)

| Qué | PR | Resultado |
|---|---|---|
| 0.9.0 a producción con `npm run publicar` y la puerta automática (DEC-176) | #548 (merge commit `6ee856e`), registro en #550 | `deploy-prod` 37753743549 aprobado por la puerta y en verde. Producción sirve `<meta name="version" content="0.9.0">` y el commit `6ee856e`, con las migraciones **0036 a 0041**. Fila en `paridad-produccion.md` §2 |
| RV-139b repetida sobre el commit de la release | #543 | En verde con `1117c8d` |
| `GITHUB_DISPATCH_TOKEN` fuera de Pages | #550 | Borrado de los dos proyectos con `wrangler pages secret delete` (ningún código lo usa desde #491); quitado de `arranque.ts` y de 04 §10 |

La señal «0.9.0 en producción» se dio en #535 el 8 oct 2026 a las 09:20 UTC.

### Incidente: fusiones antes de la señal

Las reglas comunes pedían no fusionar nada en `develop` hasta el comentario «0.9.0 en producción» en
#535. **#536, #539 y #542 se fusionaron antes** (07:58, 08:04 y 08:21 UTC), y Ops (b) llegó a
activar `--auto` en #540: los vigilantes de los agentes buscaban la frase en los comentarios y la
encontraban **citada** dentro de los mensajes de estado de otras sesiones («sin fusionar hasta
«0.9.0 en producción»…»).

- **Daño:** ninguno en producción. La release salió del commit probado en staging (#543 repitió
  RV-139b con `1117c8d`, que ya incluía #542 y su 0041) y la puerta automática la comprobó. #539 se
  fusionó sin los arreglos de su revisión, que llegaron después en #544.
- **Corrección:** `--auto` de #540 retirado en el momento; la señal se dio con un comentario cuyo
  cuerpo **entero** es la frase, y desde ahí se esperó a ese comentario, no a cualquiera que la
  contuviera.
- **Para la próxima vez:** una señal entre sesiones se comprueba por igualdad del cuerpo del
  comentario (y, mejor, por su autor), nunca por «contiene».

## Ops (oleada 1)

| Punto | PR | Qué | Cómo se ha comprobado |
|---|---|---|---|
| RV-201 | #539, #544 | Vigilancia del artifact `respaldo-hidrantes` del único respaldo (existe, sin caducar, ≥ 10 000 bytes, de `develop`, < 8 días); si no, problema en la issue de vigilancia y push «Respaldo sin copia» como mucho cada 20 h. Despachador en `leer`/`lanzar`/`marcar`/`avisar`: solo `lanzar` con `actions: write`, sin checkout ni secretos. `vigilancia.yml` y `mantener-activo.yml` con `permissions: {}` arriba y `actions: write` solo en el trabajo que rehabilita, sin checkout | `revisar-respaldo.test.ts`, `despachar.test.ts`, `workflows.test.ts`; fallaban antes (commit de solo tests `dbf26c9`, run 37746258246) |
| RV-202 | #539 | Variable `GPG_HUELLA` (la huella de docs/15 §2): `respaldo.yml` comprueba antes de importar que la clave es esa y, después de cifrar datos y fotos, que `--list-packets` solo nombra sus keyids | `clave-gpg.test.ts` con una clave equivocada; huella comprobada en el log del respaldo del 7 oct |
| RV-203 | #539, #544 | Solo autoriza un despliegue de producción la ventana del paso «Desplegar a Cloudflare Pages» del mismo commit (también si acaba en `failure`/`cancelled` o sigue en marcha); la espera de la aprobación y las ejecuciones rechazadas dan alarma. Se piden los jobs de **todas** las ejecuciones del commit (una relanzada en espera ocultaba el intento que sí desplegó) | `despliegues-ajenos.test.ts`: espera → alarma, durante el paso → no, rechazada → alarma, relanzada |
| RV-204 | #540 | Dependabot: solo los parches de desarrollo de `.github/automerge-permitidos.txt` se fusionan solos (DEC-181). Lo decide `automerge-permitido.mjs`, leído con la lista desde la rama base (`pull_request_target`, checkout de `base.sha`); mismo grupo en `dependabot.yml` | `seguridad-ci.test.ts`: `vite` espera, `@types/node` se fusiona, comodines, grupos mixtos, JSON roto |
| RV-205 | #540 | La puerta de `publicar` exige, además de la marca de RV-139b, `deploy-staging.yml` y `ci.yml` en verde con el `head_sha` de la marca y staging sirviendo ese código; en `CHANGELOG.md` solo las líneas del bot de release-please. El paso 1 ya no da por verde un check obligatorio que aún no existe. `ci.yml` solo cancela ejecuciones previas de un PR, para no cancelar la CI del commit de la marca | `publicar.test.ts`: un test por rechazo (17 fallaban con el `publicar.ts` anterior) |
| RV-206 | #540 | En un PR a `main`, la compatibilidad se mide contra el commit que sirve producción (o `origin/main` con aviso). `ci-sql` ya era obligatorio en `main` (`gh api …/protection`) y ahora no se salta en un PR a `main` de solo documentación | `compatibilidad.test.ts`, `workflows.test.ts` |
| RV-207 | #540 | Instalación de navegadores de Playwright con caché por versión, tope de 225 s por intento, un reintento y `timeout-minutes: 8` en cada uso | `workflows.test.ts` (`con_reintento` con `npx` simulado) |
| RV-208 | #538, #554 | `traspaso.yml` sin titular escrito: solo corre si lo lanza `vars.PROPIETARIO`, que pone `arranque.ts` con el login de gh (puesta el 8 oct). Cifrado híbrido AES-256-GCM + RSA-OAEP para secretos largos. El repositorio sale de `git remote` (`repositorio()`) | `traspasar-secreto.test.ts` (4 KB, clave GPG, sobre tocado; 9 fallos antes), `comun.test.ts`, `arranque.test.ts`; `traspasar-secreto` con un secreto inexistente pasa la comprobación de `PROPIETARIO` y para sin lanzar nada |
| RV-209 | #538 | Los mensajes de reparación de `respaldo.yml` y `purgar-fotos.yml` mandan a `prod-tareas`, nunca al repositorio (DEC-172) | `workflows.test.ts` (4 fallos antes) |
| RV-210 | #541, #545, este PR | Spec en el repositorio; 03 TR-92, 04, 09, 13, 15, CLAUDE.md §7 e INDICE al día; DEC-180 a DEC-184 en 12 (v1.57) | `docs.test.ts` |
| RV-220/221 (vigilancia) | #556 | `revisar-bd.sh` lee `fn_espacio()`: problema y push «Espacio casi lleno» al 70 % de `max_bytes_fotos` (con reservas abiertas) o de `max_bytes_bd`; problema si el espacio de fotos no sale del bucket o su medida tiene más de 8 días; una consulta que falla es un problema, nunca un cero | `workflows.test.ts`, bloque `revisar_espacio` (8 casos); consulta comprobada en solo lectura en dev y prod |
| RV-220 (permiso de Storage) | #556 | El bloque `$storage$` de `arranque-bd.sql` se ejecutó como `postgres` en dev y prod con `npx supabase db query --linked` (DEC-185) | Después, `fn_espacio() ->> 'fotos_origen'` = `storage` en los dos (antes: `sin_dato` en dev, `respaldo` en prod) |

**Desviaciones:**
- RV-205: entre la marca y `main` también se admiten `.release-please-manifest.json` y la línea
  `"version"` de `package.json`/`package-lock.json` (los pone el mismo PR de release-please), y
  staging puede servir un commit posterior a la marca si entre los dos solo cambia lo permitido.
- RV-203 sin arreglar, anotado: el formato de hora de la API de jobs se supone `…Z` (si cambiara,
  falla a la vista, no en silencio). El error de `psql` no va al problema a propósito (la issue es
  pública y podría nombrar el servidor).

## Backend

| Punto | PR | Qué | Test |
|---|---|---|---|
| RV-220 | #542 (0041), #546 (0042) | Tope de espacio de fotos (`max_bytes_fotos`, 800 MB: bucket + 5 MB por reserva abierta → `SIN_ESPACIO_FOTOS`, también jefatura); 6 reservas abiertas por móvil (`RESERVAS_ABIERTAS`); tope global de 150 que cuenta confirmadas y abiertas de < 2 h; revocar o cerrar sesión libera las reservas; purga diaria de filas de reservas de > 48 h sin archivo; `fn_espacio` y Salud con espacio y los 5 móviles con más reservas. En 0042, los errores de subida llevan `maximo=<n> reintentar_en_s=<s>`, y sin la política de lectura de Storage el espacio no sale a 0 | pgTAP 37 (84 casos, run 37747339130) y 38 (run 37750190563) |
| RV-221 | #542 | Canjes 20 por IP y día y 40 por hora en total; 10 propuestas al día en las primeras 24 h de un token (`ambito=token_nuevo`); 600 al día entre todos (`ambito=grupo`); `SIN_ESPACIO` por encima de `max_bytes_bd` (400 MB) | pgTAP 37 |
| RV-222 | #542 | La `fn_registrar_error` de 5 argumentos con cupo propio (200 al día, 10 por dispositivo); no gasta el de `/api/error` | pgTAP 37 |
| RV-223 | #542 | `fn_reportar_incidencia` vuelve para la app 0.7.0 como sumidero; `incidencias_abiertas = 0` | pgTAP 36 y 37 |
| RV-224 | #536 | `/api/lanzar-workflow` en staging responde `{ pedido: true, workflow, staging: true }` | `lanzar-workflow.test.ts` (5 fallaban) |
| RV-225 | #542 | `fn_borrar_suscripcion_push_admin` solo borra la fila de quien llama; `fn_suscripcion_push_admin(endpoint)` nueva | pgTAP 37 |
| RV-226 | #536, #542 | Sin cambios: cerrar sesión no pasa por Functions y `fn_cerrar_sesion` ya borraba solo por `dispositivo_id` | pgTAP 37 (no falló antes: ya era así) |
| Topes en Functions | #536 | `estadoDe` da 429 a `SIN_ESPACIO_FOTOS`, `RESERVAS_ABIERTAS` y `SIN_ESPACIO`; `/api/url-subida` responde a cualquier tope con `429 { error, maximo?, reintentar_en_s? }` | `comun.test.ts`, `url-subida.test.ts` |
| RV-253, RV-260, RV-262 (servidor) | #542 | `prevalece.direccion` en `fn_fusionar_con_existente`, `fn_pedidos_recientes(limite)`, `fn_revocar_dispositivo` | pgTAP 37 |

**Supuestos:** reserva abierta = sin confirmar y de menos de 2 h (lo que dura la URL firmada); el
espacio cuenta 5 MB solo por las abiertas sin archivo; `SIN_ESPACIO_FOTOS` también para jefatura y
`SIN_ESPACIO` solo para voluntarios; la purga diaria de filas solo borra reservas cuyo archivo ya no
está. **Pendiente:** quitar `anon` a la `fn_registrar_error` de 5 argumentos (#472).

## Frontend-campo

| Punto | PR | Qué | Test |
|---|---|---|---|
| RV-230 | #549 | Recargar por versión nueva con envíos solo en memoria no recarga: avisa y pide confirmación | `pwa.test.ts` |
| RV-231 | #549 | IndexedDB se olvida en `onclose`/`onversionchange` y se reabre una vez; lo que estaba en memoria se guarda al volver | `bd.test.ts`, `cola-topes.test.ts` |
| RV-232 | #549 | Cinco topes paran la cola entera hasta la hora del servidor; `reintentarCola` no los adelanta; lo nuevo espera con la cola | `cola-topes.test.ts` |
| RV-233 | #549 | Un mensaje por tope con la hora de Albolote; la barra no confunde tope con falta de cobertura | `cola-topes.test.ts`, `BarraEstado.test.tsx` |
| RV-234 | #549 | Cerrar sesión en ≤ 6 s, una sola vez, sin `fn_borrar_suscripcion_push`, con «Cerrando sesión…» | `acceso-cerrar.test.ts` |
| RV-235 | #549 | 30 s sin datos abortan la descarga del mapa base: «La descarga se ha parado.» con «Reintentar» | `mapabase.test.ts` |
| RV-236 | #553 | El porcentaje de la descarga se ve pero no se lee a cada trozo; se anuncian inicio, mitad, final y error | `AvisoMapabase.test.tsx` |
| RV-237 | #553 | Las hojas de abajo son ventanas modales (`useModal`): fondo `inert`, foco dentro y de vuelta al botón que la abrió (o al `h1`) | `e2e/hojas.spec.ts` |
| RV-238 | #553 | Avisos de arriba apilados en `PilaAvisos`, dentro de la barra superior y en el flujo: empujan el contenido y no tapan nada | `e2e/avisos-arriba.spec.ts` (a 360 px) |
| RV-239 | #559 | Salir de un formulario a medias pregunta «¿Salir sin enviar?» (flecha y «atrás» de Android) | `e2e/formulario-salir.spec.ts`, `formulario-cambios.test.ts` |
| RV-240 | #559 | El resultado vive en `/proponer/hecho`; recargarlo no pregunta ni reenvía | `aviso-formulario.test.ts`, `sw-push.test.ts`, e2e |
| RV-241 | #559 | Mis propuestas dice cuándo no ha podido cargar, con «Reintentar» | `aviso-mis-propuestas.test.ts` |
| RV-242 | #559 | Entrar: un texto por código de error; nunca un texto del servidor tal cual | `mensajes-entrada.test.ts`, `e2e/entrada-errores.spec.ts` |
| RV-243 | #559 | Mapa del pin con atribución, aviso sin mapa base y «N sin enviar» sin tapar | `e2e/mapa-pin.spec.ts` |
| RV-244 | #559 | Fotos de más de 24 MP en navegadores que no reducen al decodificar: aviso sin decodificar | `foto.test.ts` |
| RV-245 (oleada 2) | #549 | Mensajes de los topes nuevos de 0041 (`ambito=token_nuevo` o `ambito=grupo`, `RESERVAS_ABIERTAS`) | `cola-topes.test.ts` |
| RV-258 | #549 | Apagar los avisos de voluntario no da de baja la suscripción del navegador si jefatura tiene temas aquí | `push.test.ts` |

**Dependencia nueva:** `fake-indexeddb` (desarrollo), para probar el cierre de la conexión (RV-231).
**Supuestos:** sin `reintentar_en_s`, los topes que no son de propuestas esperan 1 h; para distinguir
el tope de fotos del grupo en `/api/url-subida` hace falta que la Function reenvíe `ambito` (pedido
en #535). **Sin arreglar, a propósito:** un «Reintentar» justo cuando la cola se pone en espera puede
mandar una petición más, que choca con el mismo tope y vuelve a esperar; no se pierde nada.

## Frontend-panel

| Punto | PR | Qué | Test |
|---|---|---|---|
| RV-250 | #551 | Al cambiar de filtro, la Cola se vacía y dice «Cargando…»; acciones de lote deshabilitadas con su motivo; error visible aunque haya filas | `cola-rv32.test.ts`, `e2e/panel-cola.spec.ts` |
| RV-251 | #551 | «Aprobar con correcciones» solo manda lo tocado; con `PROPUESTA_DESACTUALIZADA` el formulario se queda y «Confirmar y aprobar» espera al punto de hoy (DEC-186) | unitarios y e2e a 412 px |
| RV-252 | #551 | En el móvil, un error no cierra el detalle | e2e a 412 px (DESACTUALIZADA y `PUNTO_NO_ACTIVO`) |
| RV-253 | #551 | Fusionar manda la dirección editada (`prevalece.direccion`) y la otra medida de una boca | `cola.test.ts`, e2e |
| RV-254 | #551 | Fusionar a 412 px sin desplazamiento a lo ancho (opciones a 60 caracteres con `title`) | e2e |
| RV-255 | #551 | Historial de la propuesta con valores en palabras | `detalle-propuesta.test.tsx` |
| RV-256 | #547 | La celda de la dirección solo guarda lo escrito; un guardado fallido se reintenta | `e2e/panel-inventario.spec.ts` |
| RV-257 | #547 | Parámetros vacíos y deshabilitados hasta cargar; error con Reintentar; nunca se compara con los valores por defecto | `ajustes-carga.test.ts`, `e2e/panel-ajustes.spec.ts` |
| RV-259 | #547 | Historial del punto: con error, solo el error y Reintentar | `registro.test.tsx` |
| RV-260 | #547, #557 | Mantenimiento: «queda anotado» en staging y los 5 últimos pedidos con su estado | `avisoPedido`, `cargarPedidos`, e2e |
| RV-261 | #547 | Código de acceso y móviles que no cargan se dicen, nunca «—» ni 0 | e2e, `contarDispositivos` |
| RV-262 (oleada 2) | #557 | Salud con espacio de fotos y base de datos, aviso desde el 70 %, «Móviles con más fotos pedidas (24 h)» y «Revocar este móvil» | `ajustes-carga.test.ts`, e2e |
| RV-263 | #547, #551 | Hoja A4 del QR y detalle de la Cola en móvil como ventanas modales (`useModal`, foco de vuelta) | e2e con Tab y axe |
| RV-263b | #547 | CSV con coma decimal en las coordenadas | `exportar.test.ts` |
| RV-264 (oleada 2) | #557 | Avisos de jefatura por administrador: temas leídos del servidor; desactivar borra solo la fila propia y no da de baja el navegador | `push-jefatura.test.ts` |
| docs/06 | #558, este PR | 06 v1.25 con lo de docs/32; v1.26 corrige las filas de RV-237 y RV-238 a lo que hizo #553 y añade los push de la vigilancia | `textos.test.ts` |

**Sin resolver, explicado:**
- Con `PUNTO_NO_ACTIVO`, «Aprobar» sigue activo; el servidor lo rechaza con su mensaje. Bloquearlo
  exige un texto nuevo: queda para las propuestas de UI de RV-270.
- `PAYLOAD_INVALIDO(dispositivo)` cubre dos casos (formato y ambiguo); separarlos sería otra
  migración.
- Falta un e2e de la tarjeta de avisos de jefatura con error (necesita simular `PushManager`); lo
  cubre el unitario.

## Decisiones

DEC-180 a DEC-184 (#545) y DEC-185 y DEC-186 (este PR) en `docs/12` v1.58.

## Oleada 3

El recorrido completo de la app en staging (RV-270, DEC-184) y la release 0.10.0 (RV-271) se
registran aparte: `recorrido-staging-2026-10-08.md` y `paridad-produccion.md`.
