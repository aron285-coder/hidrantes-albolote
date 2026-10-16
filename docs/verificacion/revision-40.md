# Registro de `docs/40` · Revisión tras `docs/39`

Una línea por PR: qué entró, el test que falló antes (o «sin test: documentación») y el número del PR.

- **RV-528:** puesta en marcha. 12 v1.70 (DEC-224 a DEC-226, sus filas del índice y `docs/41` en DEC-193, DEC-196, DEC-205,
  DEC-209, DEC-212 y DEC-216); CLAUDE.md §5 (`docs/40` como excepción, `docs/41` la de después del piloto, DEC-225 en los
  commits y DEC-226); skill `paquete-rv`; 09 §8; INDICE; `docs/40-revision-tras-39.md` entra en Git; issues de los puntos y
  las 6 `tras-piloto` de §0.4 (#878 a #887 y #888 a #893). Sin test: documentación. (#894)
- **RV-529:** Novedades enseña lo de 0.17.0. `limpiar()` quita también «(docs/NN RV-nnn, DEC-nnn)»; `propuestas`, `estilo` y
  `textos` pasan a ámbitos de usuario (los internos desde 0.10.0, en un comentario con su motivo); las líneas de 0.17.0 del
  CHANGELOG, sin «(docs/39 RV-5xx)»; `src/generado/novedades.json` regenerado (tres líneas de 0.17.0). Tests que fallaban
  antes: los tres nuevos de `scripts/generar-novedades.test.ts`, uno con el CHANGELOG real (cada línea de ámbito de
  usuario de la última versión vale para Novedades: el tope de 3 líneas y 2 por ámbito decide cuáles salen). 10 v1.10,
  AC-192. (#895)
- **RV-530:** `arranque --rotar db` guarda la cadena nueva del migrador en los secretos de GitHub (la del entorno y la de las
  tareas) y la enseña en cuanto la clave funciona, antes de la pregunta de PostGIS, de Pages y del Worker
  (`guardarCadenaMigrador`, y el bucle por entorno en `arrancarEntorno`); si el Worker rechaza después, el mensaje dice que
  la clave ya está cambiada y guardada; el recuadro dice «staging» o «producción»; sin terminal, nombra PowerShell y
  `winpty`. Tests que fallaban antes: los cinco nuevos o cambiados de `scripts/arranque.test.ts` (el orden, el Worker que
  rechaza, la etiqueta y `motivoSinTerminal`). 15 v1.10 (§2 y §5.3); CLAUDE.md §6. (#897)
- **RV-531:** los avisos de fallo no escriben en la base que la guarda ha rechazado: en `respaldo.yml` (los dos trabajos),
  `purgar-fotos.yml` y `deploy-prod.yml`, la guarda con `id` (en `deploy-prod`, `guarda-produccion` y un
  `comprobar-cadena` nuevo antes de migrar) y el aviso técnico con `steps.<guarda>.outcome == 'success'`;
  `comprobar-cadena --url` comprueba la URL de la API (`https://<ref>.supabase.co`) y `purgar-fotos.yml` la usa para
  `SUPABASE_URL_PROD`. Tests que fallaban antes: los siete nuevos de `scripts/workflows.test.ts` (la guarda con id y sin
  `if:`, y todo paso tras un fallo que usa la base depende de ella) y los de `comprobar-cadena --url`. 04 v1.11 (§9). (#898)
- **RV-532:** migración `0052`: el disparador de la revocación toma el cerrojo por móvil antes de mirar si quedan tokens
  válidos, y `fn_guardar_suscripcion_push` vuelve a comprobar el token tras tomarlo; `acceso-restaurado.ts` inserta los
  tokens vigentes antes de revocar el resto; `destino-push.ts`, `https://` sin `/i` (como la base). Tests que fallaban
  antes: pgTAP `50_suscripciones_concurrencia` (4, con `dblink`: revocar mientras se guarda y dos tokens a la vez, los
  dos dejaban una suscripción), `scripts/lib/acceso-restaurado.test.ts` (el orden) y `destino-push.test.ts`
  (`HTTPS://` rechaza). 05 v1.8 (§2.12), 12 v1.71 (DEC-218).
  Revisión: tras el cerrojo, la comprobación del token solo lee (`fn_validar_token` anota `ultimo_uso`, y escribir en
  `dispositivos` después del cerrojo podría cruzarse con una revocación); tercer caso pgTAP con un token viejo y una
  revocación de todo el móvil (6 en total). Sin `0052`, los casos 1 y 4 fallaban en CI; con ella, en verde. (#899)
- **RV-533:** el título del detalle de un alta aprobada dice su código (`codigoCola`, también en los textos de
  «Aprobada …»). Por qué pasaba el e2e: la fixture `APROBADAS` copiaba `RECHAZADAS[0]` con `...delPunto(P0)`, y el detalle
  sacaba el código de ese `punto` (la vista de verdad no lo trae para un alta). Con `delPunto(undefined)` y sin el `skip`
  del móvil, el e2e de `panel-cola.spec.ts` («buscar el código del punto creado…») falla antes en `escritorio` y en `movil`
  y pasa después; `panel-firefox` corre en CI (en local no arranca). Toda `panel-cola` en verde (121). (#900)
- **RV-534:** los flecos de RV-520 y RV-521. Con el acceso caducado, la pantalla de resultado no ofrece «Ver mis
  propuestas»; la cola olvida el token rechazado cuando una comprobación de acceso acaba sin `TOKEN_*`
  (`olvidarTokenRechazado`, desde `comprobarAcceso`); el aviso rojo de la barra con `role="status"`; el e2e de jefatura
  cuenta 0 peticiones a `fn_mis_propuestas`; DEC-221 punto 3 y FR-35, al recargar con el acceso caducado. Tests que
  fallaban antes: el nuevo de `cola.test.ts`, el de `acceso.test.ts` y el de `formulario-revocado.spec.ts` (el de
  jefatura ya daba 0: queda de guarda). 01 v1.21, 12 v1.72 (DEC-221).
  Revisión: olvidar el token podía volver a lanzar la lus (acceso sin servidor ↔ cola con `TOKEN_*`): el mismo token,
  otra vez rechazado tras olvidarlo, pide la comprobación tras una pausa (`PAUSA_COMPROBACION_MS`, 30 s), una sola vez;
  test nuevo en `cola.test.ts` que la reproduce (4 comprobaciones antes, 1 después). `role="status"`, con su test en
  `BarraEstado.test.tsx`. (#901)
- **RV-535:** Registro, Papelera y Ajustes cumplen los 44 px en el móvil. `accesibilidad.spec.ts` mide con
  `{ movil: !!isMobile }`, baja pantalla a pantalla y abre un diálogo de Ajustes. Lo que fallaba: «Reintentar» de
  `ErrorReintentar` (36 px, en Ajustes) y la ✕ de `Dialogo` (36 px, #843); ahora 44 px por debajo de 1.100 px. Tests que
  fallaban antes: el de `accesibilidad.spec.ts` en `movil` (los dos, cada uno sin su arreglo). #843 cerrada. (#902)
- **RV-536:** registros y documentos al día. Las bocas de prueba, comprobadas de verdad en staging (solo lectura: 11
  filas, todas `retirado`; 0 `[PRUEBA] RV-139b` activas), en `revision-39.md` (RV-514) y aquí; paridad, la hora de 0.16.1
  (09:17 UTC, la de `completed_at` de 38877552580) y que el texto completo de DEC-218 (#861, 09:34 UTC) llegó a `develop`
  **después** del despliegue; `revision-39.md`, la línea de #857 y el test que falló antes en RV-526; 05 v1.9 (`vigilar_respaldo`),
  12 v1.73 (DEC-113 punto 3), 03 v1.12 (TR-30) y 06 v1.39 (la cabecera de 1.35, punto por punto); los números de PR de
  este registro. Sin test: documentación.
