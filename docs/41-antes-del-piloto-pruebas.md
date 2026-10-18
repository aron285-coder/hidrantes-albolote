# 41 · Antes del piloto: los límites de las fotos vigilados, `rpc()` sin 500 y los huecos de las pruebas (oct 2026)

| | |
|---|---|
| **Para** | Claude Code, en este repositorio. **Una sola sesión, en orden** (§0.2). |
| **Base** | `develop` en `9ea6ffd`. Producción en **0.18.0**. La siguiente migración es la `0053` (esta especificación no necesita ninguna), la siguiente decisión DEC-228, el siguiente punto RV-538 y el siguiente caso de 10, AC-193. |
| **Origen** | La revisión del 18 oct 2026 de la app entera, con la seguridad y la cobertura de las pruebas: tres hallazgos de seguridad bajos (S1 a S3) y seis huecos de pruebas (T1 a T6). Ninguno alto. |
| **Versión** | **1, del 18 oct 2026.** |
| **Congelación** | **Sexta excepción a DEC-193** (DEC-228). Solo lo que dice este documento. La especificación de después del piloto pasa a ser **`docs/42`**. |
| **Divulgación** | Nada de lo que describe se puede aprovechar desde fuera (§0.5): DEC-226 no aplica, y este documento entra en Git en RV-538. |
| **El desarrollador** | Arranca la sesión. Aprueba los cambios de 03, 04, 05, 10, 11 y 15 al pedir esta especificación (DEC-177). Aprueba en el PR de RV-543 la dependencia nueva `@vitest/coverage-v8`. **No empieza el piloto (#77) hasta que RV-547 esté cerrado**; #858 y #76 sí pueden ir en paralelo. |

## 0. Reparto

### 0.1 Decisiones

| DEC | Qué |
|---|---|
| **DEC-228** | **`docs/41`, sexta excepción a DEC-193.** La de después del piloto pasa a `docs/42`. |
| **DEC-229** | **Una foto que no es una imagen se detecta y se avisa, no se borra sola.** La vigilancia mira los primeros bytes de las fotos subidas en las últimas 48 h. |
| **DEC-230** | **La cobertura de las pruebas unitarias se mide en CI, y su umbral solo sube.** Bajarlo exige una decisión. |

Texto en §1 (RV-538).

### 0.2 Orden

Un PR por punto, en este orden, y una issue por punto. El flujo es el de siempre (skill `paquete-rv`): el test que falla antes, `pr-review-toolkit`, `code-review`, `revisar-pantallas` en los PR que tocan `src/`, CI en verde y `gh pr merge --auto --squash`.

| # | Punto | Qué | Hallazgo | Severidad |
|---|---|---|---|---|
| 1 | **RV-538** | Puesta en marcha: DEC-228 a DEC-230, CLAUDE.md, skill, 09 §8 e issues | — | — |
| 2 | **RV-539** | `rpc()` de las Functions: un 2xx ilegible es «sin servidor», no un 500 | S3 | baja |
| 3 | **RV-540** | Los límites del bucket de fotos, en una sola constante y vigilados cada día | S1 | baja-media |
| 4 | **RV-541** | Una URL firmada no deja subir más de 5 MB ni otra cosa que JPEG o WebP: prueba de integración | T4 | media |
| 5 | **RV-542** | Las fotos que no son una imagen, detectadas (DEC-229) | S2 | baja |
| 6 | **RV-543** | La cobertura de vitest, medida y con umbral (DEC-230) | T1 | media |
| 7 | **RV-544** | Los datos simulados de los e2e, comparados con la base de verdad | T2 | media |
| 8 | **RV-545** | La revocación de punta a punta, contra la pila real | T3 | media |
| 9 | **RV-546** | `revertir`: el despliegue vigente de verdad, con test y ensayado (#847) | T6 | media |
| 10 | **RV-547** | 10 dice qué casos se comprueban solos, y un test lo mantiene | T5 | baja |
| 11 | **RV-548** | Cierre: RV-139b, publicar y archivar | — | — |

**Una sola sesión**, por el mismo motivo que `docs/40` §0.2: son pocos puntos y se cruzan entre áreas.

**Versiones:** cada PR que toque 01–06 o 10–15 sube en uno la versión de ese documento y lo anota en su cabecera, aunque otro PR de esta especificación ya la haya subido.

**Registro:** `docs/verificacion/revision-41.md`, una línea por PR: qué entró, el test que falló antes (o «sin test: documentación») y el número del PR.

**Commits (DEC-225):** el título de un `feat`/`fix` es una frase para un voluntario o para jefatura, sin códigos; el código va en el cuerpo (`Refs: docs/41 RV-5xx`). Casi todo lo de aquí no lo ve nadie: `fix(servidor)`, `test`, `ci`, `chore` o `docs`.

### 0.3 Reglas

Todas las de `docs/40` §0.3: CLAUDE.md §3; textos en `textos.ts` y en el Apéndice A de 06 a la vez; Vitest sin DOM; los e2e se construyen como staging. Además:

- **Ninguna prueba contra dev ni contra prod.** Las de integración, contra la pila local (`INTEGRACION=1`, trabajo `sql` de `ci.yml`). Solo hay dos excepciones de solo lectura, que van en la vigilancia y no en los tests: RV-540 (la configuración del bucket) y RV-542 (los primeros bytes de las fotos). El ensayo de RV-546, en staging y solo con el frontend.
- **RV-139b no escribe en los datos del piloto** (DEC-217).
- **Dependencias nuevas:** solo `@vitest/coverage-v8` (RV-543), con su línea en el PR.

### 0.4 Lo que se queda fuera

- **El formulario a medias (`src/hooks/formulario-a-medias.ts`).** La revisión lo dio como «sin test», pero el hook solo se ocupa del «atrás» de Android, y lo cubre `e2e/formulario-salir.spec.ts`. No hay hueco.
- **WebKit / iPhone (#850), las esperas fijas (#849), las funciones internas en pgTAP (#852), los bordes de la vigilancia y de los avisos (#892) y `textos.test` (#851, #890)** siguen siendo `tras-piloto`. La prueba en un iPhone de verdad es de la agrupación, en #76.
- **La cobertura de los e2e.** RV-543 mide solo vitest.

### 0.5 Divulgación

- **S1:** falta una vigilancia, no hay un fallo. Hoy los límites están puestos y funcionan.
- **S2:** para subir algo que no es una imagen hace falta el código de acceso. Lo subido no pasa de 5 MB, se sirve con el tipo JPEG o WebP declarado y `nosniff`, y solo cuenta si jefatura aprueba la propuesta que lo lleva.
- **S3:** es robustez. Un fallo de Supabase sale como 500 en vez de 503.

Nada de esto se aprovecha desde fuera, y por eso este documento entra en Git entero en RV-538.

---

## 1. RV-538 · Puesta en marcha

- **Este archivo**, a `docs/41-antes-del-piloto-pruebas.md`.
- **12:** DEC-228 a DEC-230 con este texto y sus filas del índice. Donde DEC-193, DEC-196, DEC-205, DEC-209, DEC-212, DEC-216 y DEC-224 dicen que la de después del piloto es `docs/41`: «desde DEC-228, `docs/42`».

  > **DEC-228 · `docs/41`: los límites de las fotos, `rpc()` y los huecos de las pruebas, sexta excepción a DEC-193**
  > - **Fecha:** 18 oct 2026 (desarrollador) · **Estado:** vigente (`docs/41`).
  > - **Contexto:** la revisión del 18 oct encontró tres hallazgos de seguridad bajos y que las pruebas no ven algunas cosas que importan en el piloto: los límites del bucket, la revocación de punta a punta, que los datos simulados de los e2e se parezcan a los de verdad, y `revertir`, que es la marcha atrás si el piloto sale mal.
  > - **Decisión:** 1. `docs/41` entra como excepción a DEC-193, solo con lo que contiene. 2. La de después del piloto pasa a ser **`docs/42`**. 3. El piloto (#77) empieza con `docs/41` cerrada.
  > - **Afecta a:** DEC-193, DEC-196, DEC-205, DEC-209, DEC-212, DEC-216, DEC-224, CLAUDE.md §5, 09 §8.

  > **DEC-229 · Una foto que no es una imagen se detecta y se avisa, no se borra sola**
  > - **Fecha:** 18 oct 2026 · **Estado:** vigente (`docs/41` RV-542).
  > - **Contexto:** la subida va directa del móvil a Storage con una URL firmada, y nadie ve los bytes. El bucket solo mira el `Content-Type` que declara quien sube. La app siempre manda una imagen recomprimida, así que algo que no sea JPEG ni WebP solo puede venir de alguien con el código y un cliente hecho a mano.
  > - **Decisión:** 1. La vigilancia diaria lee los primeros 16 bytes de cada foto confirmada en las últimas 48 h (petición con `Range` a la URL pública, sin claves). 2. Si no son JPEG (`FF D8 FF`) ni WebP (`RIFF…WEBP`), es un problema de la vigilancia y un aviso técnico a jefatura, con el código del punto o los 8 primeros caracteres de la propuesta. 3. No se borra nada: lo decide jefatura (rechaza la propuesta o retira la foto); la purga se lleva después lo que quede sin referencia.
  > - **Descartado:** comprobar en `fn_proponer` o al aprobar (la base no tiene los bytes, y una petición de red dentro de la transacción está prohibida); borrar sola (una falsa alarma borraría una foto buena de un punto).
  > - **Afecta a:** 04 §7, 11 §4, 15, `vigilancia.yml`.

  > **DEC-230 · La cobertura de las pruebas unitarias se mide en CI, y su umbral solo sube**
  > - **Fecha:** 18 oct 2026 · **Estado:** vigente (`docs/41` RV-543).
  > - **Contexto:** hasta ahora no se medía. Qué tenía pruebas se sabía mirando nombres de archivo.
  > - **Decisión:** 1. `vitest run --coverage` con `@vitest/coverage-v8` en el trabajo `calidad`, sobre `src/lib`, `src/hooks`, `functions`, `workers`, `scripts/lib` y `config`. 2. Umbrales globales de líneas y ramas, y por carpeta en `functions/` y `src/lib/`: la medida de RV-543 redondeada hacia abajo al entero, menos 1 punto. 3. Un PR que sube la cobertura puede subir el umbral; bajarlo pide una DEC. 4. El informe va como artefacto y, en el resumen del trabajo, como una tabla.
  > - **Afecta a:** 04 §11, 09 §6, `vitest.config.ts`, `ci.yml`, plantilla del PR.

- **CLAUDE.md §5:** `docs/41` como excepción (DEC-228); «`docs/42`, la de después del piloto». §6: `npm test -- --coverage`.
- **Skill `paquete-rv`:** la nota de arriba, «hoy, `docs/41`, DEC-228».
- **09 §8:** `docs/41` (DEC-228) en curso, con su registro; «la siguiente es `docs/42`»; «el piloto empieza con `docs/41` cerrada».
- **Issues:** una por punto, con título neutro. **#847** se cierra con RV-546 (se quita `tras-piloto` y se enlaza esta especificación).

---

## 2. RV-539 · `rpc()`: un 2xx ilegible es «sin servidor» · S3 · baja

**Qué pasa.** En `functions/_lib/comun.ts`, `rpc()`:

- con `r.ok`, hace `JSON.parse(texto)` sin proteger (`:193`). Un 200 con un cuerpo que no es JSON (una página de mantenimiento, un proxy, un cuerpo cortado) lanza una excepción, y la Function devuelve el 500 genérico de Cloudflare;
- `await r.text()` (`:192`) también puede lanzar si la conexión se corta a mitad del cuerpo, y está fuera del `try`.

`vincular-jefatura.ts` lo esquiva con su propio `try` (`:143`, `:215`, y el comentario «El ayudante de comun.ts no captura…»). Las otras 13 llamadas no lo hacen.

**Solución.**

1. `r.text()` y `JSON.parse` dentro de un `try`. Si cualquiera de los dos falla, `{ ok: false, codigo: 'SERVIDOR_NO_DISPONIBLE', estado: 503 }`. Es lo mismo que hoy con un fallo de red: el móvil reintenta y no pierde el código ni la cola.
2. **Escrituras:** que un 2xx ilegible pase a 503 no duplica nada. `fn_proponer` es idempotente por `clave_local` (FR-49), y un canje repetido de `fn_verificar_codigo` da otro token, no un error. Escribe en un comentario por qué es seguro.
3. `vincular-jefatura.ts`: fuera los `try` que ya sobran, y sus comentarios. El comportamiento no cambia: 503 en vez de 500, y `anotar()` igual.

**Tests** (`functions/_lib/comun.test.ts`, con `fetch` simulado):

- un 200 con `<html>` → `ok: false`, `SERVIDOR_NO_DISPONIBLE`, 503 (hoy lanza);
- un 200 cuyo `text()` rechaza → lo mismo;
- un 200 vacío → `ok: true, datos: null`, como hoy;
- en `push.test.ts` o `url-subida.test.ts`, la Function entera con ese 200 → 503 con el cuerpo de error de siempre.

**Documentación:** 05 §9, una línea: «un 2xx que no se puede leer cuenta como servidor no disponible».

---

## 3. RV-540 · Los límites del bucket, en una constante y vigilados · S1 · baja-media

**Qué pasa.**

- Los límites del bucket de fotos están escritos en dos sitios sin nada que los una: `asegurarBucket` (`scripts/lib/servicios.ts:105-109`, `public: true`, 5 MB, `image/jpeg` e `image/webp`) y `supabase/sql/local-storage.sql:3-5`. `asegurarBucket` no tiene test.
- Se ponen solo al lanzar `arranque` (`scripts/arranque.ts:411`). Después nadie los mira: ni `comprobar-produccion` ni la vigilancia. El proyecto de Supabase es el de uniformidad, y un cambio en el panel de Supabase (otro tamaño, otro tipo, `public` quitado) borraría la protección sin que nadie se enterara. Si quitan `public`, además, dejan de verse las fotos sin conexión.

**Solución.**

1. **Una constante:** `CONFIG_BUCKET_FOTOS` (en `scripts/lib/servicios.ts` o en un módulo propio sin dependencias), con `public`, `file_size_limit` y `allowed_mime_types`. La usa `asegurarBucket`.
2. **Vigilancia:** un paso nuevo en los dos trabajos de `vigilancia.yml`, «Revisar el bucket de fotos», con la service role **solo en ese paso**, como «Revisar las uniones de jefatura» (`:99-111`, `:180-192`). Script `.github/scripts/revisar-bucket.sh`: `GET $SUPABASE_URL/storage/v1/bucket/<bucket>` y comparación con los valores esperados. Si no coinciden, o si el bucket no responde: problema de la vigilancia (`bucket de fotos: file_size_limit distinto`, con el nombre del campo, nunca la clave) y aviso técnico a jefatura (`avisos-tecnicos.sh`). `continue-on-error: true` y su resultado en el resumen, como `uniones`.
3. **Reponerlo por CLI:** comprueba si `npm run arranque` sin `--rotar` vuelve a llamar a `asegurarBucket` sin tocar nada más. Si es así, se escribe en 15. Si no, una opción `--solo-bucket` que llama solo a `asegurarBucket` en el entorno pedido. En los dos casos, el procedimiento va en 15 («La vigilancia dice que el bucket de fotos ha cambiado»).

**Tests:**

- vitest de `asegurarBucket` (con `fetch` simulado): si el bucket no existe, `POST` con exactamente `CONFIG_BUCKET_FOTOS`; si existe, `PUT` con lo mismo;
- vitest: `supabase/sql/local-storage.sql` tiene los mismos tres valores que `CONFIG_BUCKET_FOTOS` (leyendo el SQL);
- vitest: los valores esperados de `revisar-bucket.sh` son los de `CONFIG_BUCKET_FOTOS`;
- `scripts/revisar-bucket.test.ts`, como `revisar-uniones.test.ts`: con una respuesta buena, sin problemas; con 10 MB, con `image/png` añadido, con `public: false` y con un 500, un problema cada uno, y ninguno lleva la clave;
- `scripts/workflows.test.ts`: la service role de ese paso no está en ningún otro paso del trabajo.

**Documentación:** 04 §7 (quién vigila los límites); 15 (el procedimiento); 11 §4, una línea; 11 §9, el riesgo «configuración del bucket cambiada desde el panel de Supabase», mitigado.

---

## 4. RV-541 · Una URL firmada no deja pasar más de 5 MB ni otra cosa que JPEG o WebP · T4 · media

**Qué pasa.** La prueba 7 de `npm run intrusion` comprueba que no se sube **sin** URL firmada (`scripts/intrusion.ts:235-241`). Lo que nadie prueba es que **con** una URL firmada el bucket se niegue a lo demasiado grande y a otro tipo. Toda la protección de las fotos descansa en esos dos límites.

**Solución.** Una prueba de integración nueva, `e2e/integracion/subida-limites.spec.ts`, contra la pila local como `token-functions.spec.ts`. No es una novena prueba de intrusión: «las 8 pruebas» salen en TR-40, AC-110, 11 §5 y CLAUDE.md, y no se renumera.

1. Canje del código del seed por `/api/verificar-codigo`, y token.
2. `/api/url-subida` → URL firmada.
3. `PUT` de un JPEG pequeño válido → se acepta (es el control).
4. Otra URL firmada y `PUT` de 5 MB + 1 byte con `image/jpeg` → rechazo (4xx). Lo que se compruebe es el código que da hoy la Storage local; anótalo en el test.
5. Otra URL firmada y `PUT` con `Content-Type: text/html` → rechazo (4xx).
6. Al acabar, `fn_liberar_reservas` con las reservas sin usar, para que no estorben a otras pruebas.

**Test que falla antes:** el mismo spec con `local-storage.sql` sin límites (`file_size_limit null`) da 200 en los pasos 4 y 5. Hazlo una vez a mano y anótalo en el registro; no queda en Git.

**Documentación:** 11 §5, una línea en la checklist («los límites del bucket, comprobados con URL firmada: `subida-limites.spec.ts`»); 10 AC-113, en la columna de RV-547.

---

## 5. RV-542 · Las fotos que no son una imagen, detectadas (DEC-229) · S2 · baja

**Qué pasa.** Ver DEC-229. Una foto se sirve con el tipo declarado y `nosniff`, así que no se ejecuta. Pero el bucket guarda lo que se le mande, y jefatura vería en la cola una foto rota sin saber por qué.

**Solución.**

1. `.github/scripts/revisar-fotos.sh`, en los dos trabajos de `vigilancia.yml`, después de «Comprobar».
   - Toma con `psql "$BD"` las rutas de las fotos confirmadas en las últimas 48 h: `hidrantes.subidas` con `confirmada_en`, unida a la propuesta o al punto para tener el código. Como mucho 200 por pasada, y si hay más, «revisadas las 200 más nuevas».
   - Para cada una, `curl -r 0-15` a la URL pública (`/storage/v1/object/public/<bucket>/<ruta>`), sin claves.
   - JPEG: `ff d8 ff`. WebP: `52 49 46 46 ?? ?? ?? ?? 57 45 42 50`. Lo demás, «no es una imagen».
2. Si hay alguna: un problema de la vigilancia y un aviso técnico a jefatura, `Foto que no es una imagen: HID-0123 (propuesta 1a2b3c4d)`. Nunca la ruta entera ni el nombre del autor (FR-27).
3. Una foto que no se puede leer (404 o red) no es «no es una imagen»: va aparte, como «sin comprobar», y no avisa a jefatura.
4. **Nada se borra** (DEC-229).
5. Texto del aviso técnico en `textos.ts` y en el Apéndice A de 06, si el aviso se enseña en la app. Si solo va por push, en el mismo sitio que los demás avisos técnicos (`avisos-tecnicos.sh`).

**Tests:** `scripts/revisar-fotos.test.ts`, como `revisar-uniones.test.ts`, con `psql` y `curl` simulados: un JPEG y un WebP pasan; `<html>`, un PNG y 16 bytes de ceros son «no es una imagen»; un 404 es «sin comprobar»; más de 200 lo dice; ninguna salida lleva la ruta entera. `workflows.test.ts`: el paso no tiene secretos de Storage.

**Documentación:** 04 §7; 11 §4, una línea (la foto se mira después de subirla, DEC-229); 13, qué hacer si llega el aviso (rechazar la propuesta, o retirar la foto en Editar).

---

## 6. RV-543 · La cobertura de vitest, medida y con umbral (DEC-230) · T1 · media

**Qué pasa.** `vitest.config.ts` no tiene `coverage` y `ci.yml:83` lanza `npm test` sin `--coverage`. Nadie sabe qué parte de `src/lib`, `functions` o `scripts/lib` se ejecuta en las pruebas. La revisión del 18 oct lo dedujo de los nombres de archivo: 75 de 224 archivos sin test directo, 38 de ellos componentes que cubren los e2e.

**Solución.**

1. Dependencia de desarrollo `@vitest/coverage-v8`, en la versión que corresponde a `vitest` (`package.json:107`). Línea en el PR: «medir la cobertura (DEC-230); de Vitest, sin cuenta ni servicio externo; sin scripts de instalación (DEC-198)». Ya está en `automerge-permitidos.txt` (`@vitest/*`).
2. `vitest.config.ts`:
   - `coverage.provider: 'v8'`, `include` las carpetas de DEC-230 y `exclude` los `*.test.*` y `src/generado/**`;
   - `reporter: ['text-summary', 'json-summary', 'html']`.
3. **Medir primero**, en el PR, sin umbral. Después, umbrales con la regla de DEC-230: globales (líneas y ramas) y por carpeta para `functions/**` y `src/lib/**`. Los números medidos, en el registro.
4. `ci.yml`, trabajo `calidad`: `npm test -- --coverage`; el `json-summary` como tabla en `$GITHUB_STEP_SUMMARY`; el `html` como artefacto (7 días).
5. **La lista de lo que queda por debajo del 50 % de líneas**, de mayor a menor tamaño, en el registro. No se arregla aquí: lo que importe para el piloto se dice en RV-548; lo demás va como **una** issue `tras-piloto` con la lista.

**Tests:** `scripts/workflows.test.ts`: `calidad` lanza vitest con `--coverage`; `vitest.config.ts` tiene umbrales (no `0`).

**Documentación:** 04 §11 (el informe y dónde se ve); 09 §6, definición de terminado: «sin bajar el umbral de cobertura»; la plantilla del PR, la misma casilla.

---

## 7. RV-544 · Los datos simulados de los e2e, comparados con la base de verdad · T2 · media

**Qué pasa.** 33 de los 55 e2e simulan Supabase con `page.route` y datos escritos a mano (`e2e/puntos.ts`, `e2e/panel-simulado.ts`, y otros en cada spec). Nada comprueba que esos datos tengan la forma de lo que devuelve la base. En `docs/40` RV-533, un dato simulado (`APROBADAS` con el `punto` de otra propuesta) escondió un fallo real durante una release entera. Las que más se simulan son `fn_es_admin` (25), `fn_editar_punto` (18), `fn_exportar_inventario` y `fn_aprobar` (12), `fn_proponer` y `fn_listar_puntos` (10), y las vistas `v_cola_revision`, `v_puntos_activos` y `v_registro`.

**Solución.** Una prueba de integración, `e2e/integracion/contrato-simulado.spec.ts`, contra la pila local con el seed:

1. **Vistas y tablas simuladas** (`v_cola_revision`, `v_puntos_activos`, `v_registro`, y `propuestas`, `puntos`, `config`, `administradores` y `nucleos` donde `simularTablas` las da): las columnas, de `information_schema.columns` con `psql`, frente a las claves de cada objeto de `COLA`, `PUNTOS`, `REGISTRO` y `PANEL_COMPLETO`. **Las dos direcciones:** ninguna clave inventada en el dato simulado y ninguna columna que falte. Si una falta a propósito, se dice en una lista de excepciones del propio test, con su motivo.
2. **RPC de lectura** (`fn_listar_puntos` con un token de verdad, `fn_mis_propuestas`, `fn_salud`, `fn_historial_punto`, `fn_exportar_inventario` con la sesión de jefatura de `sesion-google.ts`): se llaman de verdad y se comparan las claves (y si es lista u objeto) con las del simulado de la misma función. Si un simulado está repetido en varios specs, primero se lleva a `e2e/puntos.ts` o a `e2e/panel-simulado.ts`, para comparar una sola vez.
3. **RPC de escritura** (`fn_proponer`, `fn_aprobar`, `fn_editar_punto`, `fn_rechazar`): la forma de la respuesta buena y la de un error conocido (`P0001` con «CODIGO: texto»), frente a lo que devuelven los simulados.
4. **Tipos, solo lo que se rompe:** `null` frente a valor, número frente a texto en las columnas numéricas, y que los enum simulados (`operacion`, `estado_caudal`, `racor`) existan en la base.

**Test que falla antes:** quita una columna de `COLA` o añade una inventada; la prueba lo dice con el nombre. Anótalo en el registro.

**Documentación:** 09 §6: «un dato simulado nuevo, en `puntos.ts` o `panel-simulado.ts`, y en el contrato».

---

## 8. RV-545 · La revocación de punta a punta, contra la pila real · T3 · media

**Qué pasa.** Cambiar el código revocando los móviles es la respuesta de 15 a un código filtrado, y en el piloto se usará al menos una vez (el código del piloto no es el de producción). Hoy está probado por partes: pgTAP (`fn_cambiar_codigo_acceso`, `fn_revocar_desde`, el disparador de `0052`) y e2e con el servidor simulado (`formulario-revocado.spec.ts`, `acceso.spec.ts:127`). Nada lo prueba de la app a la base y vuelta.

**Solución.** `e2e/integracion/revocacion.spec.ts`, contra la pila local:

1. Un voluntario entra con el código del seed (`000000`), con nombre y apellido.
2. Empieza un alta y rellena el tipo, el estado y la posición, sin enviar.
3. Jefatura (`sesion-google.ts`), por RPC de verdad: `fn_cambiar_codigo_acceso` a otro código, revocando todos los móviles.
4. El móvil, en su siguiente petición, vuelve a la entrada con el nombre puesto y **sin** perder el alta a medias (DEC-221).
5. Entra con el código nuevo y el alta se envía.
6. En la base: el token viejo, revocado; una sola propuesta con esa `clave_local`; la suscripción push, si la había, borrada (DEC-218); en el `registro`, el cambio de código sin el código en claro.
7. Con el token viejo, `/api/url-subida` y `/api/push` → 401.

**Documentación:** 10 AC-102 y AC-190, en la columna de RV-547.

---

## 9. RV-546 · `revertir`: el despliegue vigente de verdad, con test y ensayado (#847) · T6 · media

**Qué pasa.** `scripts/revertir.ts` es la marcha atrás de 15 si una versión sale mal en el piloto, y:

- toma por vigente el despliegue más nuevo (`:29-45`: `despliegues[0]` con la flecha, y `despliegues[1]` como destino). Después de una marcha atrás, lo vigente ya no es lo más nuevo: una segunda ejecución enseña la flecha en el despliegue malo, propone volver al que ya se sirve y dice «Ese despliegue ya es el actual» con el que no lo es;
- no tiene test;
- nunca se ha ensayado (TR-52 pide el ensayo).

**Solución.**

1. Lo vigente, del proyecto: `canonical_deployment` de `GET /accounts/{cuenta}/pages/projects/{nombre}`. Se añade a `Cloudflare.proyecto()` (`scripts/lib/servicios.ts:160-166`); `.github/scripts/despliegues-ajenos.sh` ya lo lee así (su test, `scripts/despliegues-ajenos.test.ts:299`). Si la respuesta no lo trae, se aborta: no se adivina.
2. La flecha, en el vigente. El destino por defecto es el despliegue de producción anterior al vigente por `created_on`, no `despliegues[1]`.
3. La lógica, en una función pura (`elegirDestino(despliegues, vigente, pedido?)`) con su test.
4. Al acabar, `revertir` lee la versión servida (el `<meta>` de versión, como `comprobar-despliegue`) y dice qué versión y qué commit se sirven ahora.

**Tests** (`scripts/revertir.test.ts`): sin marcha atrás previa (el vigente es el más nuevo); después de una (el vigente es el segundo, y el destino el tercero); con `--despliegue` igual al vigente → aborta; con un id que no existe → aborta; sin `canonical_deployment` → aborta; solo los de `environment === 'production'`.

**Ensayo, en staging, antes del piloto** (solo el frontend; la base no se toca, DEC-217):

1. `npm run revertir -- --entorno staging --listar`.
2. `npm run revertir -- --entorno staging`: vuelve al anterior. Comprueba con Playwright que staging sirve esa versión.
3. `npm run revertir -- --entorno staging --despliegue <el que era vigente>`: vuelve al de antes. Comprueba otra vez.
4. Tiempos y resultado en `docs/verificacion/revision-41.md` y en 15, en el procedimiento («ensayado el …»). TR-52 queda cumplido.

Necesita `CLOUDFLARE_API_TOKEN`. Si la sesión no lo tiene, el ensayo lo hace el desarrollador (unos 10 minutos) con el procedimiento de 15, y el registro lo dice. **#847** se cierra con este PR.

---

## 10. RV-547 · 10 dice qué casos se comprueban solos · T5 · baja

**Qué pasa.** Solo 4 de los 169 casos de 10 se nombran en alguna prueba. Las pruebas citan `FR-nn` (88 de 112), no `AC-nn`. Antes de la validación (#76) y del piloto, nadie puede decir qué casos ya están comprobados en cada CI y cuáles solo se comprueban en la calle.

**Solución.**

1. **En las pruebas:** cada test que comprueba un caso entero lleva su `AC-nn` en el título (Playwright: `test('… @AC-12', …)` o en `tag`) o en un comentario `// AC-12` encima del `test`/`it`. Solo si comprueba el resultado esperado de 10 entero; si es una parte, no.
2. **En 10:** una columna nueva, «Automático», con el archivo (solo el nombre) de las pruebas que lo comprueban, o vacía. La cabecera dice que esa columna no quita el recorrido en la calle: lo que una prueba ve en Chromium no es un móvil al sol.
3. **Un test que lo mantiene** (`scripts/matriz-aceptacion.test.ts`): cada archivo de la columna existe y nombra ese `AC-nn`; cada `AC-nn` nombrado en una prueba tiene ese archivo en su fila.
4. **El resumen**, en la cabecera de 10 y en el registro: cuántos casos son automáticos, por sección.

**Documentación:** 10 v1.11; 09 §6: «una prueba nueva que comprueba un caso de 10 lleva su `AC-nn`».

---

## 11. RV-548 · Cierre

- **RV-139b** sobre el commit final, con DEC-217.
- **Publicar** con `npm run publicar -- --solo-comprobar` y `npm run publicar`: **0.18.1** si solo entran `fix`, `test`, `ci` y `chore`; si no, lo que diga release-please.
- **Después de publicar:** la primera vigilancia de producción con «Revisar el bucket de fotos» y «Revisar las fotos» en verde (enlace a la ejecución en el registro).
- **Lo que importa para el piloto de la lista de RV-543**, si hay algo, en una línea en 09 §8 («Queda»); lo demás, en su issue `tras-piloto`.
- **Archivar:** `git mv` a `docs/archivo/especificaciones/`, su fila en `INDICE.md`, y en `paquete-rv` y CLAUDE.md «sin excepción abierta».
- **#77:** un comentario de que el piloto ya puede empezar (DEC-228).

## 12. Checklist

- [ ] `rpc()` no da nunca un 500 por un 2xx ilegible; `vincular-jefatura` sin `try` de sobra.
- [ ] Los límites del bucket, en una constante, con test, y la vigilancia los mira cada día en los dos entornos; el procedimiento para reponerlos, en 15.
- [ ] Una URL firmada no deja subir más de 5 MB ni `text/html`, probado contra la pila local.
- [ ] La vigilancia detecta una foto que no es una imagen y avisa sin borrar nada (DEC-229).
- [ ] La cobertura de vitest se mide en CI, con umbrales; los números, en el registro (DEC-230).
- [ ] Los datos simulados de los e2e se comparan con la base local, en las dos direcciones.
- [ ] La revocación, probada de la app a la base y vuelta, sin perder el alta a medias.
- [ ] `revertir` usa el despliegue vigente de verdad, tiene test y está ensayado en staging; #847 cerrada.
- [ ] 10 dice qué casos son automáticos, y un test lo mantiene.
- [ ] La issue por punto; publicado; este documento archivado; #77 avisada.

## 13. Fuera

- Lo de §0.4: después del piloto.
- Lo que hacen personas: #858, #76 a #85.
