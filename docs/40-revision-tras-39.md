# 40 · Antes del piloto: Novedades, la rotación del migrador y lo que dejó a medias `docs/39` (oct 2026)

| | |
|---|---|
| **Para** | Claude Code, en este repositorio. **Una sola sesión, en orden** (§0.2). |
| **Base** | `develop` en `83a1817`. Producción en **0.17.0**. La siguiente migración es la `0052`, la siguiente decisión DEC-224, el siguiente punto RV-528 y el siguiente caso de 10, AC-192. |
| **Origen** | La revisión del 16 oct 2026 por la tarde, con `docs/39` ya en producción: ocho hallazgos medios y unos pocos bajos baratos. |
| **Versión** | **1, del 16 oct 2026.** |
| **Congelación** | **Quinta excepción a DEC-193** (DEC-224). Solo lo que dice este documento. La especificación de después del piloto pasa a ser **`docs/41`**. |
| **Divulgación** | Nada de lo que describe se puede aprovechar desde fuera: este documento entra en Git en RV-528. |
| **El desarrollador** | Arranca la sesión. Aprueba los cambios de 03, 04, 05, 06 y 15 al pedir esta especificación (DEC-177). **No lanza `arranque --rotar db` (#858) hasta que RV-530 esté en `develop`.** |

## 0. Reparto

### 0.1 Decisiones

| DEC | Qué |
|---|---|
| **DEC-224** | **`docs/40`, quinta excepción a DEC-193.** La de después del piloto pasa a `docs/41`. |
| **DEC-225** | **Los códigos internos van en el cuerpo del commit, no en el título.** El título de un `feat`/`fix` es lo que sale en Novedades. |
| **DEC-226** | **El texto completo de un fallo de seguridad entra en Git cuando producción sirve el arreglo**, comprobado (versión y commit servidos), no cuando se publica la release. |

Texto en §1 (RV-528).

### 0.2 Orden

Un PR por punto, en este orden; una issue por punto. Flujo de siempre (skill `paquete-rv`): el test que falla antes, `pr-review-toolkit`, `code-review`, `revisar-pantallas` en los que tocan `src/`, CI verde, `gh pr merge --auto --squash`.

| # | Punto | Qué | Severidad |
|---|---|---|---|
| 1 | **RV-528** | Puesta en marcha: DEC-224 a DEC-226, CLAUDE.md, skill, 09 §8, issues | — |
| 2 | **RV-529** | Novedades enseña lo de 0.17.0 y lo que venga (DEC-225) | media |
| 3 | **RV-530** | `arranque --rotar db`: la cadena, a salvo antes de nada que pueda abortar | media |
| 4 | **RV-531** | Los avisos de fallo no escriben en la base que la guarda acaba de rechazar | media |
| 5 | **RV-532** | Avisos push: una suscripción no sobrevive a la revocación (migración `0052`) | media |
| 6 | **RV-533** | El título del detalle de un alta aprobada, con su código | media |
| 7 | **RV-534** | El acceso caducado y los envíos con error: los flecos de RV-520 y RV-521 | baja |
| 8 | **RV-535** | El panel en el móvil: la geometría de los toques en Registro, Papelera y Ajustes | media |
| 9 | **RV-536** | Registros y documentos al día | media |
| 10 | **RV-537** | Cierre: RV-139b, **0.18.0** y archivar | — |

**Una sola sesión**, por el mismo motivo que `docs/39` §0.3: pocos puntos, cruzados entre áreas.

**Versiones:** cada PR que toque 01–06, 10–15 sube la versión de ese documento en uno y lo anota en su cabecera, aunque otro PR de esta especificación ya la haya subido.

**Registro:** `docs/verificacion/revision-40.md`, una línea por PR: qué entró, el test que falló antes (o «sin test: documentación») y el número del PR.

**Commits (DEC-225):** desde RV-528, el título de un `feat`/`fix` es una frase para un voluntario o para jefatura, **sin** `(docs/40 RV-5xx)`; el código va en el cuerpo (`Refs: docs/40 RV-529`). Lo que no ve nadie, `chore`, `test`, `docs` o `ci`.

### 0.3 Reglas

Las de `docs/39` §0.4, todas: CLAUDE.md §3; textos en `textos.ts` y en el Apéndice A de 06 a la vez; tokens de modo oscuro; toques de 44 px por debajo de 1.100 px en el panel; sin dependencias nuevas; Vitest sin DOM; los e2e se construyen como staging.

### 0.4 Lo que se queda fuera (issues `tras-piloto`)

Una issue por línea, título neutro, etiqueta `tras-piloto` (RV-528):

1. La guarda de proyecto en `vigilancia.yml`, `comprobar-produccion.yml` y `promover-piloto.yml`.
2. El foco al cerrar Editar abierto desde el mapa, en navegadores que no enfocan al hacer clic (`Inventario.tsx:576`: el origen queda en `<body>`).
3. La comprobación inversa de `textos.test.ts` se salta los literales de una sola palabra y casa en las dos direcciones.
4. Los tests de RV-516 (`arranque.test.ts:390-439`) no simulan `arranque` entero como pedía `docs/39` §4.
5. pgTAP de los bordes: 35 h y 8 días sin aviso, `vigilar_respaldo = false` con la vigilancia vieja, un administrador inactivo; push: subdominios de `windows.com` y `apple.com`, `temas = '{}'`, la limpieza de `0050`, y un test que corra `/api/push` con `PUSH_ENDPOINT_PRUEBAS` puesto.
6. Al recargar con el acceso caducado, la app abre el formulario vacío con el aviso en vez de la entrada (se acepta; RV-534 lo escribe en DEC-221).

---

## 1. RV-528 · Puesta en marcha

- **Este archivo** a `docs/40-revision-tras-39.md`.
- **12:** DEC-224 a DEC-226 con este texto y sus filas del índice. En DEC-193, DEC-196, DEC-205, DEC-209, DEC-212 y DEC-216, donde dicen que la de después del piloto es `docs/40`: «desde DEC-224, `docs/41`».

  > **DEC-224 · `docs/40`: lo que encontró la revisión tras `docs/39`, quinta excepción a DEC-193**
  > - **Fecha:** 16 oct 2026 (desarrollador) · **Estado:** vigente (`docs/40`).
  > - **Contexto:** la revisión de la tarde del 16 oct encontró que Novedades no enseña nada de 0.17.0, que `arranque --rotar db` puede cambiar la clave del migrador y abortar sin enseñarla, y algunos puntos de `docs/39` a medias.
  > - **Decisión:** 1. `docs/40` entra como excepción a DEC-193, solo con lo que contiene. 2. La de después del piloto pasa a ser **`docs/41`**. 3. Los bajos que no entran, como issues `tras-piloto`.
  > - **Afecta a:** DEC-193, DEC-196, DEC-205, DEC-209, DEC-212, DEC-216, CLAUDE.md §5, 09 §8.

  > **DEC-225 · Los códigos internos van en el cuerpo del commit, no en el título**
  > - **Fecha:** 16 oct 2026 · **Estado:** vigente (`docs/40` RV-529). Matiza DEC-091 y CLAUDE.md §5.5.
  > - **Contexto:** release-please copia el título del commit al CHANGELOG, y `generar-novedades.ts` descarta toda línea con un código interno. Los títulos de `docs/39` acababan en «(docs/39 RV-5xx)», y 0.17.0 no salió en Novedades.
  > - **Decisión:** 1. El título de un `feat`/`fix` no lleva códigos; van en el cuerpo (`Refs: docs/NN RV-nnn`). 2. Aun así, `limpiar()` quita también un paréntesis final con `docs/NN` y códigos. 3. Un test comprueba con el CHANGELOG real que cada `feat`/`fix` de ámbito de usuario de la última versión sale en Novedades.
  > - **Afecta a:** CLAUDE.md §5, skill `paquete-rv`, `scripts/generar-novedades.ts`, FR-167.

  > **DEC-226 · El texto completo de un fallo de seguridad entra en Git cuando producción sirve el arreglo**
  > - **Fecha:** 16 oct 2026 · **Estado:** vigente (`docs/40` RV-528). Matiza la regla de divulgación de `docs/39` §0.7.
  > - **Contexto:** en `docs/39`, el texto completo de DEC-218 se escribió antes de que 0.16.1 estuviera en producción y se fusionó en cuanto se publicó; no se puede saber si llegó a `develop` antes que el despliegue (la hora del registro de paridad no cuadra).
  > - **Decisión:** el PR que añade el texto completo enlaza la ejecución de `deploy-prod` terminada en verde y pega la salida de `npm run comprobar-produccion` con la versión y el commit servidos, y solo entonces se fusiona. La rama con ese texto no se sube antes.
  > - **Afecta a:** CLAUDE.md §5, skill `paquete-rv`, 11.

- **CLAUDE.md §5:** `docs/39` y `docs/40` como excepciones (DEC-216 y DEC-224), «`docs/41`, la de después del piloto»; una línea con DEC-225 (en el punto 5, donde habla de los commits) y otra con DEC-226.
- **Skill `paquete-rv`:** la nota de arriba, «hoy, `docs/40`, DEC-224»; el paso del commit, con DEC-225; el de un arreglo de seguridad, con DEC-226.
- **09 §8:** `docs/39` en producción con 0.17.0; `docs/40` (DEC-224) en curso, con su registro; «la siguiente es `docs/41`».
- **Issues:** una por punto, título neutro; las 6 de §0.4, con `tras-piloto`.

---

## 2. RV-529 · Novedades enseña lo de 0.17.0 (DEC-225) · media

**Qué pasa.** Ejecutando hoy `generar-novedades.ts`, `src/generado/novedades.json` dice 0.17.0 pero sus líneas son de 0.16.1 y 0.16.0:

- las líneas de 0.17.0 (`CHANGELOG.md:8-17`) acaban en «(docs/39 RV-5xx)»; `limpiar()` (`scripts/generar-novedades.ts:151`) solo quita paréntesis que llevan **solo** códigos, y `docs/39` no lo es; después `TECNICA` (`:106`) ve el código y descarta la línea;
- `propuestas` (RV-520 y RV-521) no está en `AMBITOS_USUARIO` (`:46-77`).

**Solución.**

1. `limpiar()`: el paréntesis de códigos admite también `docs/\d+` («(docs/39 RV-517)», «(docs/39 RV-516, DEC-219)»).
2. `AMBITOS_USUARIO` con `propuestas`. Revisa los demás ámbitos de `feat`/`fix` usados desde 0.10.0 (`git log --format=%s`) y añade los que sean de usuario; los que no, en un comentario con su motivo.
3. **CHANGELOG 0.17.0:** las líneas sin «(docs/39 RV-5xx)», a mano, para que las vea quien abra la app antes de 0.18.0 (el CHANGELOG es de release-please, pero editar líneas de una versión ya publicada no le afecta).
4. Regenera `src/generado/novedades.json`.

**Tests:**

- `generar-novedades.test.ts`: «(docs/39 RV-517)» y «(docs/40 RV-529, DEC-225)» se quitan; una línea con `propuestas` sale.
- **Uno nuevo con el CHANGELOG real:** cada `feat`/`fix` de la última versión con ámbito de usuario aparece en las Novedades generadas (falla hoy con 0.17.0).
- **10, AC-192:** «Tras una versión con novedades para voluntarios, Novedades enseña sus líneas, sin códigos».

---

## 3. RV-530 · `arranque --rotar db`: la cadena, a salvo antes de nada que pueda abortar · media

**Qué pasa.** En `scripts/arranque.ts`:

- `prepararSupabase` (`:366-385`) cambia la clave de `hidrantes_migrador` en la base;
- los secretos de GitHub y la cadena en pantalla llegan después, en `resto()` (`:1215-1220`), tras `prepararPages` y `vigilanciaEnOrden`;
- si el Worker rechaza el secreto de la vigilancia (`:875-879`), `arranque` aborta diciendo «todo sigue como estaba»: la clave **ya** ha cambiado, los secretos tienen la vieja (la CI deja de conectar) y la nueva no se ha enseñado nunca.
- Además, `motivoSinTerminal` (`:572-575`) usa `process.stdout.isTTY`, que en Git Bash (mintty) es `false`: CLAUDE.md §6 recomienda Git Bash, y ahí `--rotar db` se niega diciendo «pide una terminal».

**Solución.**

1. Justo después de `esperarConexion` y `migrar.ts` (`:383-385`), **antes** de cualquier otra cosa que pueda abortar: fijar los secretos que llevan la cadena del migrador de ese entorno (los de `secretosGithub` que la usan, en `staging`/`production` y en `prod-tareas`) y enseñarla con `ensenarCadenaMigrador`. `resto()` deja de hacerlo.
2. La pregunta de PostGIS de dev (`:388-393`) va **después** de enseñar la cadena.
3. El texto de `vigilanciaEnOrden` deja de decir «todo sigue como estaba» si en esa ejecución se ha rotado la base: «La clave del migrador ya está cambiada y guardada en GitHub; Pages y el repositorio no se han tocado. Repite el mismo comando.»
4. `motivoSinTerminal`: el texto dice «Usa PowerShell o Windows Terminal; en Git Bash, `winpty npm run arranque -- --rotar db`». Lo mismo en 15 §5.3 y en la issue #858.
5. **Etiqueta:** el recuadro dice «staging» o «producción» (no `e.clave`, que es `production`), como 15 §2.

**Tests** (vitest de `arranque`, con lo externo simulado como hoy):

- con `--rotar db` y el Worker que rechaza: los secretos de la cadena se han fijado y la cadena se ha enseñado antes del aborto, y el mensaje no dice «todo sigue como estaba»;
- el orden: `fijarSecreto` de la cadena y `ensenarCadenaMigrador` van antes de `prepararPages`;
- `motivoSinTerminal` nombra PowerShell y `winpty`.

**Documentación:** 15 §5.3 y §2 (PowerShell); CLAUDE.md §6 («en Git Bash, los comandos que preguntan algo, con `winpty`»); comentario en #858: «ya se puede lanzar».

---

## 4. RV-531 · Los avisos de fallo no escriben en la base que la guarda acaba de rechazar · media

**Qué pasa.** Si `comprobar-cadena` para un trabajo porque la cadena es de otro proyecto, los pasos «Aviso técnico a jefatura» (`respaldo.yml:288-294` y `:478-484`, `deploy-prod.yml:178-186`) corren igual (`if: failure()`) y hacen `psql "$BD"` con esa misma cadena: un aviso de producción acaba en la base de staging. En `deploy-prod.yml`, igual si falla `guarda-produccion`.

`purgar-fotos.yml` comprueba la cadena, pero no `SUPABASE_URL_PROD`, que es la que usan la lista de fotos y el borrado (`purgar-fotos.ts:164`, `:325-339`).

**Solución.**

1. El paso de la guarda (`comprobar-cadena`, y en `deploy-prod` también `guarda-produccion`) con `id`; los pasos que usan la base después de un fallo añaden `&& steps.<id>.outcome == 'success'` a su `if:`.
2. `comprobar-cadena.ts` acepta también `--url <variable>` y comprueba que la URL de la API es `https://<REFS[entorno]>.supabase.co`; `purgar-fotos.yml` la usa para `SUPABASE_URL_PROD`.

**Tests** (`scripts/workflows.test.ts`):

- en cada trabajo con la guarda, todo paso posterior que lleve `BD`, `SUPABASE_DB_URL*` o `SUPABASE_URL*` y tenga `failure()`, `always()` o `cancelled()` en su `if:` depende de `steps.<guarda>.outcome == 'success'`;
- el paso de la guarda no tiene `if:` ni `continue-on-error`;
- vitest de `comprobar-cadena --url`: el ref de staging con `--entorno prod` → error, sin la URL entera en el mensaje.

**Documentación:** 04 §9, las filas de `respaldo.yml` y `purgar-fotos.yml` con la guarda (el changelog de 04 v1.9 decía §9 y no se hizo).

---

## 5. RV-532 · Avisos push: una suscripción no sobrevive a la revocación · media · migración `0052`

**Qué pasa.**

- `fn_guardar_suscripcion_push` (`0050:38-…`) comprueba el token antes de tomar el cerrojo, y el disparador `fn_suscripciones_tras_revocar` (`0050:99-108`) no toma ninguno: si la revocación se confirma entre la comprobación y el `insert`, el disparador no encuentra nada que borrar y el `insert` entra. El móvil queda sin token válido y con una suscripción.
- Dos tokens del mismo móvil revocados en transacciones distintas a la vez: con READ COMMITTED, cada `not exists` ve el otro token aún válido y ninguno borra.
- `scripts/lib/acceso-restaurado.ts:74-79` revoca primero e inserta después los tokens vigentes: el disparador borra en medio las suscripciones de móviles cuyo token válido es posterior al volcado (se rehacen solas, pero no hace falta).
- `functions/_lib/destino-push.ts:8` acepta `HTTPS://` en mayúsculas; la base no (`0050:21`). No se puede aprovechar, pero el comentario dice «la misma regla».

**Solución (migración `0052`).**

1. `fn_suscripciones_tras_revocar`: `pg_advisory_xact_lock(hashtext('suscripciones:' || new.dispositivo_id::text))` antes del `not exists`.
2. `fn_guardar_suscripcion_push`: toma ese cerrojo **antes** de comprobar que el móvil tiene un token válido (o lo vuelve a comprobar tras tomarlo), y solo entonces inserta.
3. `acceso-restaurado.ts`: primero inserta los tokens vigentes, después revoca el resto.
4. `destino-push.ts`: `^https:\/\/` sin `/i`; el test de `HTTPS://FCM.GOOGLEAPIS.COM` pasa a «rechaza».

**Tests:**

- pgTAP de concurrencia (como `04_concurrencia_y_tareas`, con `dblink`): una sesión revoca el último token con el cerrojo tomado y otra guarda una suscripción → tras confirmar las dos, el móvil no tiene ninguna; dos tokens del mismo móvil revocados en dos sesiones → ninguna.
- vitest de `acceso-restaurado`: el orden insertar → revocar.
- `destino-push.test.ts`: mayúsculas → rechaza.

**Documentación:** 05 §2.12 (el cerrojo); DEC-218 «Afecta a» con `0052`.

---

## 6. RV-533 · El título del detalle de un alta aprobada, con su código · media

**Qué pasa.** `docs/39` RV-522 cambió el `aria-label` (`ColaRevision.tsx:405`, `:436`), pero el título visible sigue en `DetallePropuesta.tsx:220`: `${p.codigo ?? T.panelCola.nuevo} · …`, y lo pintan los dos `<h2>` (`:238`, `:245`). Con el fixture `APROBADAS` (`e2e/panel-cola.spec.ts:192-201`, `codigo: null`) eso es «nuevo · Alta». El e2e de `:1713-1722` espera un `heading` que empiece por el código, y el registro dice que pasó.

**Solución.**

1. **Primero, averiguar por qué pasa** el e2e de `:1713` (¿se salta en todos los proyectos? ¿el `heading` que encuentra es otro?) y dejarlo de forma que falle con el código de hoy. Si algún proyecto de Playwright no corre en CI, decirlo en el registro.
2. `titulo` con `codigoCola(p, puntos)` (`puntos` ya es una propiedad); `aprobada(...)` en `:216`, igual.
3. **Test:** el e2e de `:1713` a 1280 y a 412 (a pantalla completa, el `<h2>` de `:238`).

---

## 7. RV-534 · El acceso caducado y los envíos con error: los flecos · baja

1. **«Ver mis propuestas» con el acceso caducado** (`src/paginas/Proponer.tsx:728`): lleva a la entrada pasando por Mis propuestas, que llama a `fn_mis_propuestas` con el token revocado. Con `accesoCaducado`, ese botón no sale: solo «Volver al mapa» (que lleva a la entrada).
2. **La cola pregunta una sola vez por token** (`src/lib/cola.ts:419`, `:620-621`): si la comprobación de acceso que sigue a un `TOKEN_*` falla por otra causa (`SIN_SERVIDOR`), la cola se queda parada con ese token hasta un cambio de visibilidad o de conexión. `tokenRechazado` se pone a `null` cuando una `comprobarAcceso` termina sin `TOKEN_*`.
3. **El aviso rojo de la barra** (`src/componentes/mapa/BarraEstado.tsx:195-200`) con `role="status"`.
4. **Jefatura no pide la lista del servidor:** el e2e de jefatura (`e2e/envios-con-error.spec.ts`) cuenta las peticiones a `fn_mis_propuestas` y espera 0.
5. **DEC-221 y FR-35:** «Si la app se recarga con el acceso caducado, el formulario se abre vacío con el aviso; lo que no se guardó, se pierde (RV-152)». Es lo que hace hoy; se escribe.

**Tests:** vitest de `cola` (tras un `SIN_SERVIDOR`, el siguiente `TOKEN_*` vuelve a pedir la comprobación); e2e de RV-520 (con el acceso caducado, la pantalla de resultado no tiene «Ver mis propuestas»); el punto 4.

---

## 8. RV-535 · El panel en el móvil: la geometría de los toques · media

**Qué pasa.** `e2e/accesibilidad.spec.ts:353` llama a `geometria(..., { movil: false })` en Registro, Papelera y Ajustes: a 412 px no se comprueban los 44 px ni la separación de 8 px (UI-15). `docs/39` RV-526 lo dejó a medias.

**Solución.** `{ movil: !!isMobile }`. Lo que falle, se arregla. La ✕ de `Dialogo` (36 px, `docs/39` §0.6 punto 18): a 44 px por debajo de 1.100 px y se cierra su issue.

**Test:** el mismo e2e, que hoy falla con `movil: true`.

---

## 9. RV-536 · Registros y documentos al día · media

**Registros:**

1. **Las bocas de prueba retiradas, de verdad comprobado.** La consulta de `docs/39` RV-514 usaba `CONDICION_PUNTOS`, que deja fuera `[PRUEBA]` (`promover-piloto.ts:34-35`): habría dado 0 sin retirar nada (el fallo estaba en la especificación). En staging, solo lectura:
   - `select codigo, situacion from hidrantes.puntos where codigo between 'BOC-0007' and 'BOC-0017' order by codigo` → 11 filas, todas `retirado`;
   - `select count(*) from hidrantes.puntos where situacion = 'activo' and descripcion like '[PRUEBA] RV-139b%'` → 0.

   Los dos resultados, en `revision-39.md` (RV-514) y en el registro de `docs/40`.
2. **Paridad:** la fila de 0.16.1 en `docs/verificacion/paridad-produccion.md:35` dice «10:40 UTC», que no puede ser (el merge a `main` es de las 09:00:56 UTC). La hora buena, la de `completed_at` de la ejecución 38877552580 (`gh api`). Y una nota: la hora de fusión de #861 (09:34 UTC), para que quede escrito si el texto completo de DEC-218 llegó antes o después.
3. **`revision-39.md`:** la línea de #857 (RV-139b de 0.16.1) y, en RV-526, el test que falló antes.

**Documentos:**

4. **05**, la tabla de `config`: la fila `vigilar_respaldo` (`true`, booleano JSON, DEC-220, no está en la lista de Ajustes).
5. **12**, DEC-113 punto 3 (`:1968` y siguientes): «sustituido por DEC-203 y `docs/39` RV-522: staging se respalda y Salud lo vigila».
6. **03 TR-30** (`:60`): «forma, tamaño, dibujo (B, aspa) y borde».
7. **06:** en la cabecera de 1.35, RV-517, RV-520 y RV-521 por separado (no subieron versión en su PR).

---

## 10. RV-537 · Cierre

- **RV-139b** sobre el commit final, con DEC-217.
- **Publicar** con `npm run publicar -- --solo-comprobar` y `npm run publicar`: **0.18.0**.
  - Que Novedades de producción enseña líneas de 0.18.0 o 0.17.0 (abrir la app con Playwright).
- **Archivar** con `git mv` a `docs/archivo/especificaciones/` y su fila en `INDICE.md`; `paquete-rv` y CLAUDE.md, «sin excepción abierta».
- **#858:** un comentario de que `arranque --rotar db` ya se puede lanzar (RV-530).

## 11. Checklist

- [ ] Novedades enseña lo de la última versión; los títulos de commit, sin códigos.
- [ ] `arranque --rotar db` guarda y enseña la cadena antes de nada que pueda abortar; funciona en PowerShell y con `winpty` en Git Bash.
- [ ] Ningún aviso de fallo escribe en una base que la guarda ha rechazado; `purgar-fotos` comprueba también la URL.
- [ ] Ninguna suscripción sobrevive a la revocación, tampoco en concurrencia (`0052`).
- [ ] El detalle de un alta aprobada dice su código, y el e2e falla sin el arreglo.
- [ ] Los flecos del acceso caducado y de los envíos con error, hechos.
- [ ] Registro, Papelera y Ajustes cumplen los 44 px en el móvil.
- [ ] Las bocas de prueba, comprobadas de verdad; paridad y registros, al día; 03, 05, 06 y 12, también.
- [ ] Las 6 issues `tras-piloto`.
- [ ] 0.18.0 en producción; este documento, archivado.

## 12. Fuera

- Lo de §0.4: después del piloto.
- Lo que hacen personas: #858 (después de RV-530), #76 a #85.
