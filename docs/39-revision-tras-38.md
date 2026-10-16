# 39 · Antes del piloto: los datos del piloto, los avisos push, restaurar, las fotos del Inventario y «Hidrantes test» (oct 2026)

| | |
|---|---|
| **Para** | Claude Code, en este repositorio. **Una sola sesión, en orden** (§0.3). |
| **Base** | `develop` en `b4e2ae2`. Producción en **0.16.0**. La siguiente migración es la `0050`, la siguiente decisión DEC-216, el siguiente punto RV-513 y el siguiente caso de 10, AC-185. |
| **Origen** | La revisión completa del 16 oct 2026, hecha con `docs/38` ya en producción (seguridad, app del voluntario, panel, CI y operación, documentos y tests), con lo alto y lo medio que encontró, más dos peticiones del desarrollador: las fotos de cada punto en el Inventario y el nombre «Hidrantes test» para la app de staging. |
| **Versión** | **1, del 16 oct 2026.** Antes de empezar, comprueba que tu copia tiene §0.7 (divulgación) y §0.6 con 27 líneas. |
| **Congelación** | **Cuarta excepción a DEC-193** (DEC-216): el desarrollador decide que esto no espera al piloto. Solo lo que dice este documento. La especificación de después del piloto pasa a ser **`docs/40`**. |
| **Divulgación** | RV-515 cierra una forma de abusar de los avisos push que hoy funciona en producción. **Este documento no entra en Git hasta que 0.16.1 esté en producción** (§0.7). |
| **El desarrollador** | Arranca la sesión y hace lo que solo puede hacer una persona (RV-519). Aprueba los cambios de 01, 02, 03, 04, 05, 06 y 15 al pedir esta especificación (DEC-177). |

## 0. Reparto

### 0.1 Decisiones

| DEC | Qué |
|---|---|
| **DEC-216** | **`docs/39`, cuarta excepción a DEC-193.** La de después del piloto pasa a `docs/40`. |
| **DEC-217** | **RV-139b no escribe en los datos del piloto.** Desde ahora y hasta `promover-piloto`, la comprobación en staging lee; lo que escribe va en una transacción que se deshace, salvo un móvil de prueba que se revoca al acabar. |
| **DEC-218** | **Avisos push** (el texto completo se escribe tras 0.16.1, §0.7). |
| **DEC-219** | **La cadena del migrador, en el sobre.** `arranque` la enseña una vez al crearla o rotarla, para guardarla con la clave del respaldo; `restaurar` ya no depende de un secreto que nadie puede leer. |
| **DEC-220** | **La base de datos vigila que las tareas sigan vivas.** Una tarea `pg_cron` diaria manda un aviso técnico si la comprobación diaria lleva más de 36 h sin pasar o el respaldo más de 9 días: no depende de GitHub. |
| **DEC-221** | **Lo escrito en el móvil no se pierde al revocar el acceso, y lo que falla al enviarse se ve.** Un formulario abierto sigue abierto y se guarda en el móvil; la entrada sale después. Un envío con error pone «N con error» en rojo, y jefatura también ve su cola. |
| **DEC-222** | **Fotos en el Inventario.** Editar enseña las fotos del punto (conexión y sitio), en solo lectura; en el mapa del Inventario, tocar un punto abre Editar. Sin miniaturas en la lista. |
| **DEC-223** | **La app de staging se llama «Hidrantes test».** En el nombre de la app instalada, la pestaña del navegador y la cabecera del panel. Producción sigue siendo «Hidrantes». |

El texto de cada una, en §1 (RV-513), salvo el de DEC-218 (§0.7).

### 0.2 Orden

Un PR por punto, en este orden. Una issue por punto (§1).

| # | Punto | Qué | Severidad |
|---|---|---|---|
| 1 | **RV-513** | Puesta en marcha: DEC-216, DEC-217 y DEC-219 a DEC-223, CLAUDE.md, skills, 09 §8 y las issues (también los bajos de §0.6) | — |
| 2 | **RV-514** | RV-139b no escribe en los datos del piloto, y fuera las bocas de prueba de staging (DEC-217) | media |
| 3 | **RV-515** | Avisos push (DEC-218, migración `0050`) y **publicar 0.16.1 en cuanto entre** | media |
| 4 | **RV-516** | La cadena del migrador, en el sobre (DEC-219) | alta |
| 5 | **RV-517** | La base de datos vigila las tareas (DEC-220, migración `0051`) | media |
| 6 | **RV-518** | Los despliegues y las tareas comprueban el proyecto de la base | media |
| 7 | **RV-519** | La clave del respaldo y la cadena del migrador, en la agrupación | media |
| 8 | **RV-520** | El formulario no se pierde al revocar el acceso (DEC-221) | media |
| 9 | **RV-521** | Los envíos con error, a la vista (DEC-221) | media |
| 10 | **RV-522** | Panel: el filtro en oscuro, el código del alta aprobada y el respaldo de staging en Salud | media |
| 11 | **RV-523** | Fotos en el Inventario (DEC-222) | petición |
| 12 | **RV-524** | «Hidrantes test» (DEC-223) | petición |
| 13 | **RV-525** | Documentación: manuales, 10, 01–03, 06 y CLAUDE.md al día con la app | media |
| 14 | **RV-526** | Tests: el panel también en el móvil, y las dos RPC sin pgTAP | media |
| 15 | **RV-527** | Cierre: RV-139b, publicar **0.17.0** y archivar | — |

Cada PR, con el flujo de siempre (skill `paquete-rv`): el test que falla antes, `pr-review-toolkit`, `code-review`, `revisar-pantallas` en los que tocan `src/`, y CI verde. `gh pr merge --auto --squash` y al siguiente.

**RV-514 va antes que RV-515** porque publicar 0.16.1 pide RV-139b, y RV-139b tiene que hacerse ya sin escribir en los datos del piloto.

**Las dos migraciones**, `0050` (RV-515) y `0051` (RV-517), con la skill `nueva-migracion`, cada una en su PR y en ese orden.

**Versiones de los documentos congelados:** cada PR que toque 01, 02, 03, 04, 05, 06 o 15 sube su versión en uno y lo anota en la cabecera, como siempre; si dos PR tocan el mismo, cada uno sube la suya. Los manuales (13, 14), 10 y 12, igual.

**Registro:** `docs/verificacion/revision-39.md`, una línea por PR: qué entró, el test que falló antes y el número del PR. Para RV-515, hasta §0.7, solo «avisos push: comprobaciones del destino y tope por móvil».

### 0.3 Por qué una sola sesión

`docs/trabajo-en-paralelo.md` §1 pediría tres sesiones (base de datos, pantallas y CI). Aquí son pocos puntos por área y cruzados entre ellas (RV-515: migración y Function; RV-517: migración, textos y documentos; RV-516 y RV-518: scripts y workflows). Una sola sesión los hace sin issue de coordinación ni choques, y el desarrollador solo arranca una. CLAUDE.md §5: «el reparto exacto lo fija cada especificación».

### 0.4 Reglas de toda la especificación

- **Las reglas de CLAUDE.md §3, todas.** Migraciones solo hacia adelante y con `migrar.ts`; nada en el esquema `public`; RPC `SECURITY DEFINER` con `search_path` fijo; bloqueo donde se escribe.
- **Textos** en `textos.ts` y en el Apéndice A de 06 a la vez (UI-20, UI-21; `textos.test.ts`).
- **Modo oscuro** con los tokens de siempre; toques de 44 px por debajo de 1.100 px en el panel (UI-15).
- **Sin dependencias nuevas.** Vitest corre en Node sin DOM: lo que necesita pulsar o enfocar va en Playwright.
- **Novedades (FR-167):** cada `feat`/`fix` con ámbito de usuario, para un voluntario o para jefatura, sin códigos internos. Lo que solo se ve en staging (RV-524) va como `chore`, para no salir en las Novedades de producción.
- **Los e2e se construyen como staging** (`playwright.config.ts:58`, `VITE_ENTORNO: 'staging'`): lo que cambie en staging (RV-522, RV-524) cambia en los e2e.

### 0.5 Lo que se queda fuera

- **Los bajos** de la revisión del 16 oct: issues `tras-piloto` (§0.6). No se implementan aquí.
- **Lo que ya está en una issue `tras-piloto`** (#741 a #770 y las anteriores), salvo #651 (RV-514).
- **Miniaturas en la lista del Inventario** y cambiar fotos desde Editar (DEC-222).
- **La dirección de staging** (`hidrantes-albolote-staging.pages.dev`) y el proyecto de Cloudflare (DEC-223).

### 0.6 Los bajos, como issues `tras-piloto`

Una issue por línea, con título neutro y la etiqueta `tras-piloto` (RV-513). No se implementan.

**Servidor:**

1. La consulta de la entrada abierta en `functions/api/verificar-codigo.ts` (`:59`) no tiene tiempo máximo; con la base lenta, todos esperan a la misma.
2. `OTRA_CUENTA` tiene un solo texto para dos casos (`0046:113` y `:117`); cuando la cuenta de Google ya está unida a **otro** correo de jefatura, el texto manda hacer algo que no sirve.
3. `comprobar-dist.sh` escribe nombres de archivo sin escapar en `::error::` (`:41`, `:46`, `:49`, `:67`).

**App del voluntario:**

4. «Retirar» en Mis propuestas no dice que está trabajando y puede dar «Jefatura ya la ha revisado» al reintentar (`MisPropuestas.tsx:282-296`, `:230`).
5. La fecha de la última revisión, con horas («revisado hace 14 h») en `Ficha.tsx`, `ListaPuntos.tsx` y `Proponer.tsx`: es una fecha sin hora.
6. La Lista dice «Orden: distancia» y ordena por código si no hay posición (`ListaPuntos.tsx:58`, `puntos.ts:345-352`).
7. Con el almacenamiento del navegador bloqueado, la entrada vuelve una y otra vez a la bienvenida (`almacen.ts:132-138`, `acceso.ts:340`).
8. iPhone: el desplegable del orden de la Lista (13 px) hace zoom.
9. iPhone: la entrada no dice que primero hay que añadir la app a la pantalla de inicio.
10. Una sincronización en vuelo de la sesión anterior se reutiliza tras volver a entrar (`puntos.ts:149`).

**Panel:**

11. Cualquier desplazamiento de la página cierra un «⋯» o Exportar (`MenuBoton.tsx:110-116`), y cuatro e2e esperan dos frames para evitarlo.
12. A 360–412 px, el botón de filtros del Inventario llega a cuatro líneas (`Inventario.tsx:460-462`).
13. «quedan 0 días» en la Papelera no va en rojo (`Papelera.tsx:65`).
14. Con Editar abierto al lado, la tabla del Inventario se desplaza a lo ancho entre 1.100 y ~1.450 px.
15. El «⋯» de un administrador se deshabilita sin motivo mientras guarda (`Ajustes.tsx:582`, `:587`).
16. `panel-navegacion.spec.ts:81` («escribir filtra la lista») pasa aunque la lista no se pinte.
17. `PANEL_GRANDE` sin usar y `useColaYDetalle` repetido.
18. La ✕ de `Dialogo` mide 36 px por debajo de 1.100 px (UI-15).

**CI y operación:**

19. El respaldo de producción no avisa si el trabajo se cancela (`respaldo.yml:260`, `:282`: solo `failure()`), y el Postgres de la prueba de restauración arranca antes del respaldo.
20. «Regenerar zona / mapa base» abre un PR que nunca pasa la CI (`mantenimiento.yml:197-228`, como DEC-079).
21. La vigilancia vuelve a activar un workflow parado a mano (`vigilancia.yml:437-444`, `mantener-activo.yml:129-138`).
22. `revertir.ts` toma el despliegue más nuevo por el vigente (`:29-45`), y revertir no se ha ensayado (TR-52).
23. Nadie comprueba que exista el respaldo mensual de fotos (`revisar-respaldo.sh:18`).

**Tests:**

24. Esperas fijas que hacen de «no ha pasado nada» (`controles.spec.ts:174-185`, `entrada-errores.spec.ts:119`, `:135`, `acceso.spec.ts:431`, `:446` y otras).
25. Sin WebKit en Playwright: la foto en un iPhone de verdad (`createImageBitmap` con orientación) no se ha probado nunca (`fase-6.md:54`).
26. `textos.test.ts` no comprueba la sección del Apéndice A de cada texto ni los singulares fuera de `SINGULARES`.
27. Las funciones internas `fn_bytes_tabla`, `fn_cron_purga_con_permiso`, `fn_error_tope` y `fn_poner_entrada`, solo cubiertas de lado en pgTAP.

### 0.7 Divulgación (RV-515)

El repositorio es público (DEC-053) y producción sigue con 0.16.0 hasta que se publique el arreglo. Hasta que **0.16.1 esté en producción**:

- **Este documento**, en `.git/info/exclude` (RV-513). Entra en Git en el primer PR después de 0.16.1 (el de RV-516).
- **DEC-218** se escribe en 12 en RV-513 con un texto neutro: «**DEC-218 · Avisos push: comprobaciones del destino y tope por móvil** · vigente (`docs/39` RV-515, migración `0050`). El texto completo, tras 0.16.1». El texto completo (abajo) se pone en el PR de RV-516.
- **La issue, el PR, el commit, el registro y Novedades** de RV-515: «avisos push: comprobaciones del destino y tope por móvil». El `fix(avisos)` para Novedades: «Los avisos del móvil se guardan mejor y se limpian al quitar el acceso».
- **Los tests y la migración** no dicen cómo se abusaba: nombres neutros («un destino que no es solo un host de la lista se rechaza»), datos de prueba variados (con puerto, con `@`, con un host fuera de la lista) y comentarios que digan qué se exige, no qué se podía hacer.
- **0.16.1 se publica en cuanto RV-515 esté en `develop`**: `npm run publicar -- --solo-comprobar`, RV-139b con la regla de DEC-217 (RV-514 ya en `develop`) y `npm run publicar`. No se espera al resto.

Texto completo de **DEC-218** (para el PR de RV-516):

> **DEC-218 · Avisos push: comprobaciones del destino y tope por móvil**
> - **Fecha:** 16 oct 2026 · **Estado:** vigente (`docs/39` RV-515, migración `0050`, en producción con 0.16.1). Matiza RV-68 (lista de servicios de push).
> - **Contexto:** `fn_validar_suscripcion` sacaba el host con `^https://([^/:?#]+)`, que se para en el primer `:`: un destino con usuario o puerto delante del host de verdad pasaba la lista, y `/api/push` enviaba a otro sitio. Con un token de voluntario se podían guardar suscripciones sin límite, con temas repetidos. Las de un móvil revocado o de un administrador sin acceso seguían recibiendo avisos.
> - **Decisión:** 1. el destino es `https://` y una autoridad que es solo un host de la lista (sin usuario, contraseña ni puerto), comprobado en la base y otra vez en `/api/push` antes de enviar; 2. como mucho 3 suscripciones por móvil (la cuarta sustituye a la más vieja) y un tema; 3. cuando un móvil se queda sin ningún token válido, sus suscripciones se borran; al quitar el acceso a un administrador, las suyas; 4. los avisos de jefatura, solo a administradores activos.
> - **Afecta a:** 05 §2.12, §6.1 y §6.3; 11.

---

## 1. RV-513 · Puesta en marcha

- **Este archivo** a `docs/39-revision-tras-38.md` y su nombre en `.git/info/exclude` (§0.7).
- **12:** DEC-216, DEC-217, DEC-218 (neutro, §0.7) y DEC-219 a DEC-223, con este texto, y sus filas en «Índice por documento afectado». En DEC-193, DEC-196, DEC-205, DEC-209 y DEC-212, donde dicen que la de después del piloto es `docs/39`: «desde DEC-216, `docs/40`».

  > **DEC-216 · `docs/39`: lo que encontró la revisión tras `docs/38`, cuarta excepción a DEC-193**
  > - **Fecha:** 16 oct 2026 (desarrollador) · **Estado:** vigente (`docs/39`).
  > - **Contexto:** la revisión completa del 16 oct 2026 encontró un fallo alto (restaurar un respaldo se para en el paso 4) y varios medios en la operación, los avisos push, la app y los documentos que el piloto va a usar. El desarrollador pidió, además, las fotos en el Inventario y otro nombre para la app de staging.
  > - **Decisión:** 1. `docs/39` entra como excepción a DEC-193, solo con lo que contiene. 2. La de después del piloto pasa a ser **`docs/40`**; donde DEC-193, DEC-196, DEC-205, DEC-209 y DEC-212 dicen `docs/39`, léase `docs/40`. 3. Los bajos, como issues `tras-piloto`.
  > - **Afecta a:** DEC-193, DEC-196, DEC-205, DEC-209, DEC-212, CLAUDE.md §5 y 09 §8.

  > **DEC-217 · RV-139b no escribe en los datos del piloto**
  > - **Fecha:** 16 oct 2026 (desarrollador) · **Estado:** vigente (`docs/39` RV-514). Matiza DEC-184 y el «cómo» de `docs/verificacion/revision-completa-staging.md`.
  > - **Contexto:** durante el piloto los datos reales están en staging (DEC-203), y la puerta de `publicar` pide RV-139b en cada release. RV-139b aprobaba una boca de prueba en cada pasada (quedan BOC-0007 a BOC-0017 en el mismo sitio) y su «limpieza» llegó a rechazar todas las propuestas pendientes.
  > - **Decisión:** desde `docs/39` y hasta `promover-piloto`, RV-139b en staging:
  >   1. lee: el commit servido, las pantallas, las vistas y las RPC de lectura;
  >   2. recorre la app como voluntario con **un móvil de prueba** («Prueba RV-139b»), creado al empezar y **revocado al acabar**, sin enviar nada;
  >   3. lo que tenga que escribir (una revisión de un punto `[PRUEBA]` del seed, aprobarla, editar, abrir y cerrar la entrada) lo hace dentro de **una transacción que termina en `rollback`**, comprobando el resultado antes de deshacerla. Nunca un alta (gastaría un número de código, que no vuelve con el `rollback`);
  >   4. nunca sube fotos, ni rechaza, aprueba, edita, retira o anonimiza nada que quede; no abre ni cierra la entrada de verdad, no cambia el código, no revoca otros móviles y no prueba los canjes del código (escriben intentos y pueden mandar el aviso «alguien está probando códigos»; se prueban en local);
  >   5. el marcador de `revision-completa-staging.md` (04 §12) no cambia.
  > - **Descartado:** parar las releases durante el piloto (los arreglos del piloto tienen que poder salir); escribir y «limpiar» después (la limpieza toca datos de personas).
  > - **Afecta a:** DEC-184, 04 §12, `docs/verificacion/revision-completa-staging.md`, CLAUDE.md §5.

  > **DEC-219 · La cadena del migrador, en el sobre**
  > - **Fecha:** 16 oct 2026 · **Estado:** vigente (`docs/39` RV-516 y RV-519).
  > - **Contexto:** `restaurar` necesita la cadena de `hidrantes_migrador`. `arranque` crea su clave al azar y solo la guarda en los secretos de GitHub, que no se pueden leer. 15 §2 da por hecho que está en el sobre, y no puede estarlo: en un desastre, el paso 4 de 15 §5.3 no tendría con qué seguir.
  > - **Decisión:** 1. `arranque`, al crear o rotar la clave del migrador (`--rotar db`), enseña la cadena **una vez**, como enseña la clave privada del respaldo, para guardarla en el gestor o el sobre de la agrupación (15 §2). 2. Antes del piloto, una rotación (`--rotar db` de staging y de prod) la deja en el sobre (RV-519). 3. Si un día el sobre no la tiene, la salida es otra rotación, que pide la contraseña de `postgres` del proyecto.
  > - **Descartado:** guardar en el sobre la contraseña de `postgres` (el proyecto es de la app de uniformidad: esa contraseña abre también el esquema `public` y la puede cambiar quien lleva uniformidad); que `restaurar` cambie la clave del migrador él solo (necesitaría un administrador de GitHub en mitad de un desastre, y si falla a medias deja la CI sin clave).
  > - **Afecta a:** 15 §2, §5.3 y §9; 04 §5; 11.

  > **DEC-220 · La base de datos vigila que las tareas sigan vivas**
  > - **Fecha:** 16 oct 2026 · **Estado:** vigente (`docs/39` RV-517, migración `0051`). Complementa DEC-085 y DEC-202.
  > - **Contexto:** el respaldo, la vigilancia y el despachador corren en GitHub Actions. Si GitHub los para (por ejemplo, 60 días sin actividad en el repositorio, después del piloto), nadie se entera hasta mirar Salud.
  > - **Decisión:** una tarea `pg_cron` diaria, `hidrantes_vigilar_tareas` (08:00 UTC), manda el aviso técnico `tareas_paradas` a jefatura si `ultima_vigilancia` tiene más de 36 h o `ultimo_respaldo` más de 9 días, como mucho uno cada 24 h. El respaldo solo se mira con `config.vigilar_respaldo` a `true` (lo es por defecto; el PR que apague el respaldo de staging tras `promover-piloto` la pone a `false` allí). El Worker lo entrega sin GitHub.
  > - **Afecta a:** 04 §9; 05 (tareas y avisos técnicos); 06 Apéndice A; 15 §4; `scripts/sql/tareas-esperadas.txt`.

  > **DEC-221 · Lo escrito en el móvil no se pierde al revocar el acceso, y lo que falla al enviarse se ve**
  > - **Fecha:** 16 oct 2026 · **Estado:** vigente (`docs/39` RV-520 y RV-521).
  > - **Contexto:** al revocar jefatura los móviles (la respuesta a un código filtrado: todos a la vez), la app saltaba a la entrada aunque hubiera un formulario a medias, y se perdía. Y un envío que fallaba para siempre en segundo plano solo dejaba «1 sin enviar», sin color ni aviso; en el móvil de jefatura, ni siquiera había dónde verlo.
  > - **Decisión:** 1. Con un formulario de operación abierto, la app no salta a la entrada: dice que el acceso ya no vale, deja guardar en el móvil, enseña que se ha guardado y salta después; lo guardado se envía al volver a entrar, como cualquier envío en cola. 2. Con algún envío con error, «N con error» en rojo y un aviso que lleva a Mis propuestas; jefatura ve en Mis propuestas la parte de su cola.
  > - **Afecta a:** FR-35, FR-82, FR-83; 02 FL-01, FL-09, FL-10 y FL-28; 06 §5 (estado de la sincronización) y Apéndice A; 14.

  > **DEC-222 · Fotos en el Inventario**
  > - **Fecha:** 16 oct 2026 (desarrollador) · **Estado:** vigente (`docs/39` RV-523).
  > - **Contexto:** jefatura no veía las fotos de un punto desde el Inventario; solo en la cola, y solo las de una propuesta.
  > - **Decisión:** Editar enseña, en solo lectura, la foto de la conexión y la del sitio, debajo de la banda; tocarlas las amplía. En el mapa del Inventario, tocar un punto abre Editar. Sin miniaturas en la lista.
  > - **Descartado:** una miniatura por fila (Supabase solo hace versiones pequeñas en un plan de pago: se bajaría la foto entera de cada punto, unos 10 MB por página en el móvil).
  > - **Afecta a:** FR-120, 06 §5 (Panel: Editar), 13 §5.

  > **DEC-223 · La app de staging se llama «Hidrantes test»**
  > - **Fecha:** 16 oct 2026 (desarrollador) · **Estado:** vigente (`docs/39` RV-524).
  > - **Contexto:** en un móvil con las dos apps instaladas, las dos se llaman «Hidrantes».
  > - **Decisión:** en staging, el nombre corto de la app (el de la pantalla de inicio) es «Hidrantes test», y con él el `<title>`, el nombre del manifiesto, el de iPhone y el título de la cabecera del panel. Producción sigue con «Hidrantes». La dirección de staging no cambia.
  > - **Afecta a:** 04 §4, 06 Apéndice A, `docs/entornos.md`.

- **CLAUDE.md §5:** «salvo `docs/35`, `docs/36`, `docs/38` y `docs/39` (DEC-196, DEC-205, DEC-212 y DEC-216)… `docs/40`, la de después del piloto». Y una línea: «**RV-139b no escribe en los datos del piloto** (DEC-217): lee; lo que escribe, en una transacción que se deshace; un solo móvil de prueba, revocado al acabar».
- **Skills:** la nota de arriba de `.claude/skills/paquete-rv/SKILL.md`, con `docs/39` como excepción abierta.
- **09 §8**, fase 9: `docs/39` (DEC-216), con su registro; «la siguiente especificación es `docs/40`».
- **Issues:** una por punto, con título neutro y enlace a su sección; la de RV-515, como dice §0.7. Las 27 de §0.6, con `tras-piloto`.

---

## 2. RV-514 · RV-139b no escribe en los datos del piloto, y fuera las bocas de prueba (DEC-217) · media

**Qué pasa.**

- La puerta de `publicar` (04 §12) pide una RV-139b en verde en cada release, y durante el piloto staging guarda los datos reales (DEC-203).
- RV-139b (`docs/verificacion/revision-completa-staging.md`) crea un móvil directamente en `dispositivos` (`:44-49`), aprueba una boca de prueba en cada pasada, canjea el código 25 veces por HTTP (`:262`) y «limpia» después. En staging quedan **BOC-0007 a BOC-0017** activas en el mismo sitio (#651 dice 0007–0012). La primera pasada rechazó, como «limpieza», todas las propuestas pendientes.

**Solución.**

1. **El «cómo» de RV-139b**, al principio de `revision-completa-staging.md`, en una sección «Desde `docs/39` (DEC-217): sin escribir en los datos del piloto», con lo que se puede y lo que no, tal como lo dice DEC-217, y estos detalles:
   - el móvil de prueba se llama «Prueba RV-139b», se crea como hoy (§1 de ese archivo) y se revoca al acabar con `fn_revocar_dispositivo`, también si la comprobación falla a medias;
   - la transacción de escritura: una sola `psql` con `begin`, los claims de administrador, la revisión de un punto `[PRUEBA]` del seed (como propuesta del móvil de prueba), `fn_aprobar`, `fn_editar_punto`, la entrada (`fn_abrir_entrada` y `fn_cerrar_entrada`), sus comprobaciones con `select`, y `rollback`. Nada se manda por HTTP dentro de ella;
   - los canjes del código y la subida de fotos se prueban en local (`e2e/integracion`), no en staging.
2. **CLAUDE.md §5**: la línea de DEC-217 (RV-513).
3. **Fuera las bocas de prueba**, una vez, ahora que el piloto no ha empezado:
   - los códigos, de los registros de RV-139b en `docs/verificacion/` (BOC-0007 a BOC-0017 y las de las comprobaciones posteriores, que también los dicen); los registros no nombran el correo de administrador, así que se va por los códigos;
   - cada una, **Retirar** (`fn_retirar_punto`) con el motivo «[PRUEBA] alta de la comprobación en staging (RV-139b)», con claims de administrador, como hace RV-139b; la lista de códigos, en el registro de `docs/39`;
   - `promover-piloto` ya deja fuera lo que no está activo (`CONDICION_PUNTOS`, `promover-piloto.ts:35`): comprobarlo con una consulta de solo lectura en staging con esa misma condición, que no devuelve ninguno de esos códigos (sin lanzar `promover-piloto`, que necesita el environment `production`);
   - cierra #651 con un comentario.
4. **Test:** ninguno de código (es un procedimiento y una limpieza); el registro anota la consulta y su resultado.

---

## 3. RV-515 · Avisos push: comprobaciones del destino y tope por móvil (DEC-218) · media · migración `0050`

**Divulgación: §0.7.** Lo que sigue no sale de este documento hasta 0.16.1.

**Qué pasa.**

- `fn_validar_suscripcion` (`0029:13`) saca el host con `^https://([^/:?#]+)`, que se para en el primer `:`. Un destino con usuario o puerto delante del host de verdad pasa la lista, y `/api/push` (`functions/api/push.ts:98-103`, `functions/_lib/webpush.ts:189`) envía a otro sitio. El runtime de Workers acepta esa URL (comprobado en la revisión).
- `fn_guardar_suscripcion_push` (`0030:32-54`), que llama cualquiera con un token, no limita cuántas suscripciones tiene un móvil; el tema admite repetidos (`<@` no los mira). Con muchas, cada propuesta rechazada genera un aviso por suscripción, la cola de envíos se atasca (también el aviso «alguien está probando códigos») y la base crece.
- Revocar un móvil (`fn_revocar_dispositivo`, `fn_revocar_desde`, cambiar el código revocando, la tarea `hidrantes_revocar_tokens` de `0004:31-33`, `scripts/sql/codigo-staging.sql:60`, `restaurar.ts`) no borra sus suscripciones; solo cerrar sesión (`0040:345`).
- `fn_avisar_jefatura` (`0005:328`) y `fn_encolar_resumen_semanal` (`0009:113`) no miran si el administrador sigue activo; quitar el acceso (`0046:158-160`) no borra sus suscripciones.

**Solución (migración `0050`).**

1. **`fn_validar_suscripcion`:** el destino empieza por `https://`, y lo que va hasta la primera `/` (la autoridad) es **solo** un host que cumple `^[a-z0-9.-]+$`, sin `@` ni `:`; ese host está en la lista de hoy (FCM, Mozilla, Apple, Windows). Lo demás, como hoy.
2. **`fn_guardar_suscripcion_push`:** `cardinality(temas) = 1` y el tema, `resultado_propuesta`. Con un cerrojo por móvil (`pg_advisory_xact_lock(hashtext('suscripciones:' || dispositivo_id))`, como `0039:696`; `dispositivos` tiene una fila por token, no por móvil), si con esta tendría más de **3**, borra la más vieja. Lo mismo, con su tope de 3 por correo y su propio cerrojo, en `fn_guardar_suscripcion_push_admin`.
3. **Al quedarse sin acceso:** un disparador `after update of revocado_en on hidrantes.dispositivos` borra las suscripciones de ese `dispositivo_id` **si ya no le queda ningún token válido** (sin `revocado_en`). Cubre todas las vías de arriba y las que vengan.
4. **Jefatura:** `fn_avisar_jefatura` y `fn_encolar_resumen_semanal` unen con `administradores` activos (como ya hace `fn_encolar_aviso_tecnico`); `fn_gestionar_administrador`, al quitar el acceso, borra las suscripciones de ese correo.
5. **Las que ya hay:** la migración borra las suscripciones guardadas que no cumplen el punto 1 y deja como mucho 3 por móvil (las más nuevas). Las de móviles sin ningún token válido, también.
6. **`/api/push`, antes de enviar:** sobre `n.suscripcion.endpoint` y **antes** de `destinoDePruebas` (`push.ts:102`, `:162-172`), la misma regla del punto 1, en una función de `functions/_lib/` con la lista: la autoridad se lee del texto (lo que hay entre `https://` y la primera `/`), no con `new URL()`, que se come `:443`. Si no cumple, no se envía y la suscripción se borra como una caducada (`suscripcion_caducada`, lo mismo que un 404 o un 410).

**Tests:**

- **pgTAP:** un destino con usuario, con contraseña, con puerto o con un host fuera de la lista → `PAYLOAD_INVALIDO(suscripcion)`; uno de la lista → bien; la cuarta suscripción de un móvil borra la primera; dos temas o uno repetido → error; revocar por cada vía (`fn_revocar_dispositivo`, `fn_revocar_desde`, cambiar el código revocando, el `update` de la tarea) deja el móvil sin suscripciones; **un móvil con otro token válido conserva las suyas**; un administrador sin acceso no recibe `nuevas_propuestas` ni el resumen semanal, y al quitarle el acceso se van sus suscripciones.
- **vitest de la Function** (`functions/api/push.test.ts`): los destinos de los tests pasan a hosts de la lista (hoy usan `push.example.net`); un destino que no cumple no llega a `fetch` y se borra.
- **e2e/integración:** activar los avisos en el móvil sigue funcionando (`e2e/integracion`, con `destinoDePruebas`).

**Documentación** (con nombres neutros hasta 0.16.1): 05 §2.12, §6.1 y §6.3 (las reglas); 11 (los límites de las suscripciones).

**Publicar 0.16.1** en cuanto esté en `develop` (§0.7).

---

## 4. RV-516 · La cadena del migrador, en el sobre (DEC-219) · alta

**Primero, §0.7:** este documento entra en Git en este PR, y DEC-218 con su texto completo.

**Qué pasa.**

- `scripts/restaurar.ts:428-432` necesita `SUPABASE_DB_URL` (la cadena de `hidrantes_migrador`) o la pregunta.
- Esa cadena solo existe en los secretos de GitHub: `arranque.ts` crea la clave al azar (`claveAleatoria()`, `:376`) y la manda a `fijarSecreto` / `fijarSecretoTareas` (`:579`, `:612`), sin enseñarla nunca, tampoco con `--rotar db`. `traspasar-secreto.ts` solo la lleva de un secreto a otro.
- 15 §5.3, paso 4, da por hecho «la cadena del secreto», y 15 §2, que las contraseñas de las bases están en el sobre.
- El ensayo del 20–21 sep funcionó porque quien lo hizo tenía la cadena de esa sesión de `arranque`.

**Solución.**

1. **`arranque`**, cuando crea o rota la clave del migrador de un entorno (la rama `rotarDb` de `prepararSupabase`):
   - al final del paso, después de dejarla en los secretos, enseña la cadena **una sola vez**, con el mismo patrón con que enseña la clave privada del respaldo (`prepararGpg`, `:560`): un recuadro con «Cadena del migrador de `<entorno>`: guárdala ahora en el gestor de contraseñas o en el sobre (15 §2). No se vuelve a enseñar.», y espera a que se pulse Intro;
   - no la escribe en ningún archivo, en el registro de `log` ni en un argumento de otro proceso; si la salida no es una terminal (`!process.stdout.isTTY`), no la enseña y dice cómo repetir la rotación en una.
2. **`restaurar`**, sin `SUPABASE_DB_URL`: la pregunta como hoy, con el texto «Cadena de conexión de `<entorno>` (`hidrantes_migrador`; está en el sobre, 15 §2)». Nada más cambia.
3. **Tests** (vitest de `arranque`, con `psql`, `gh` y Supabase simulados, como los de hoy):
   - con `--rotar db` y una terminal, la cadena sale una vez en la salida y no en ningún `log`, archivo ni argumento;
   - sin terminal, no sale;
   - sin `--rotar db` (la clave ya existe), no sale nada;
   - los tests de hoy de `arranque` y `restaurar`, en verde sin cambiarlos.

**Documentación:**

- 15 §2: la fila de las contraseñas de las bases pasa a «Cadena de `hidrantes_migrador` de dev y de prod (DEC-219): la enseña `arranque` al crearla o rotarla; gestor o sobre». La contraseña de `postgres` no va al sobre (es del proyecto de uniformidad): la tiene el desarrollador o quien lleve ese proyecto.
- 15 §5.3, paso 4: la cadena, la del sobre; si no está, otra rotación (`npm run arranque -- --rotar db`, con la contraseña de `postgres`) y apuntar la nueva.
- 15 §9: en la comprobación anual, que el sobre tenga las dos cadenas y que sean las de ahora (una conexión de prueba de solo lectura).
- 04 §5 y 11: una línea cada uno.

---

## 5. RV-517 · La base de datos vigila las tareas (DEC-220) · media · migración `0051`

**Qué pasa.**

- El respaldo (`respaldo.yml`), la vigilancia diaria (`vigilancia.yml`), el despachador y la reactivación de workflows corren en GitHub Actions.
- GitHub para los workflows programados de un repositorio sin actividad (60 días); DEC-085 reconoce que no está probado que reactivarlos por la API reinicie esa cuenta.
- Las tareas `pg_cron` (`scripts/sql/tareas-esperadas.txt`) son purgas y el resumen semanal. El Worker solo llama a `/api/push`.
- Salud enseña la vigilancia o el respaldo viejos, pero solo a quien abre el panel.

**Solución (migración `0051`).**

1. **`avisos_tecnicos.clave`**: su `check` (`0045:294-296`) admite hoy cuatro claves; la migración lo quita y lo vuelve a poner con `tareas_paradas`.
2. **`fn_encolar_aviso_tecnico`** acepta `tareas_paradas` con su texto fijo, como las otras: «Las tareas automáticas (comprobación diaria o respaldo) llevan días sin hacerse. Avisa al desarrollador.» Plazo, 24 h.
3. **`fn_vigilar_tareas()`** (`security definer`, `search_path` fijo; la ejecuta `hidrantes_migrador`, que es quien corre las tareas, `0004:21`; ni `anon` ni `authenticated`):
   - si `config.ultima_vigilancia` falta o tiene más de **36 h**, o (con `config.vigilar_respaldo` a `true`, por defecto) `config.ultimo_respaldo` falta o tiene más de **9 días**, llama a `fn_encolar_aviso_tecnico('tareas_paradas', null, null, '/admin/ajustes')`;
   - nada más.
4. **La tarea `hidrantes_vigilar_tareas`**, diaria a las **08:00 UTC**, en la migración y en `scripts/sql/tareas-esperadas.txt`.
5. **Salud** la nombra con un texto (`nombreTarea`, `salud.ts:49-51`, `textos.ts:1260`): «Vigilar las tareas automáticas», en el Apéndice A (06 `:847`).
6. **Igual en staging y en producción.**

**Tests (pgTAP):**

- con `ultima_vigilancia` de hace 37 h → una notificación `tareas_paradas` para un administrador activo suscrito a `avisos_tecnicos`; con las dos al día → ninguna; con el respaldo viejo y `vigilar_respaldo = false` → ninguna; dos llamadas seguidas → una;
- la tarea existe con su horario; `04_concurrencia_y_tareas.test.sql` (`:41-46`, que hoy compara las ocho tareas) con la novena;
- `fn_vigilar_tareas` no es ejecutable por `anon` ni `authenticated` (y en las listas de permisos de `02` y `34`).

**Documentación:** 04 §9 (la tabla de tareas); 05 (la tarea, la clave y `vigilar_respaldo`); 06 Apéndice A (el texto del aviso y el nombre de la tarea); 15 §4 (qué hacer si llega: mirar Actions, reactivar los workflows; puntos 4 y 9); 13 §8 (los avisos técnicos).

---

## 6. RV-518 · Los despliegues y las tareas comprueban el proyecto de la base · media

**Qué pasa.**

- `deploy-staging.yml:134` y `deploy-prod.yml:123` lanzan `node scripts/migrar.ts` **sin `--entorno`**, así que la guarda de proyecto (`migrar.ts:154-168`, `comprobarCadena` de `scripts/lib/comun.ts`) no corre.
- El seed de staging va con `psql` a pelo (`deploy-staging.yml:162-163`).
- `purgar-fotos.yml` (`:84`, `:100`, que borra fotos) y `respaldo.yml` usan `SUPABASE_DB_URL_PROD` sin guarda de proyecto: con la de staging ahí, todas las fotos de producción parecerían huérfanas.
- `guarda-produccion.ts:59-87` solo comprueba que las variables coinciden entre sí, no con el ref de producción que el repositorio ya conoce (`REFS`). 04 §4 dice que la CI aborta «si `PROJECT_REF` no es el esperado».

**Solución.**

1. `deploy-staging.yml`: `node scripts/migrar.ts --entorno staging`; `deploy-prod.yml`: `--entorno prod` (los nombres de `entornoPedido`).
2. Un script pequeño, `scripts/comprobar-cadena.ts --entorno <e>` (lee la cadena del entorno del proceso y llama a `comprobarCadena`), como primer paso con secretos de: el seed de `deploy-staging.yml`, `purgar-fotos.yml` y los trabajos de `respaldo.yml` (prod y staging), antes de cualquier `psql` o `pg_dump`.
3. `guarda-produccion.ts`: el `ref` tiene que ser `REFS.prod`.

**Tests:** `scripts/workflows.test.ts` (los dos `deploy-*.yml` llaman a `migrar.ts` con su `--entorno`; el seed, `purgar-fotos` y `respaldo` llaman a `comprobar-cadena` antes del primer `psql`/`pg_dump`); vitest de `comprobar-cadena`; `guarda-produccion.test.ts` (hoy usa `REF='abcdefghijklmnopqrst'`: pasa a `REFS.prod`, y un ref de staging → bloqueo).

**Documentación:** 04 §4 (ya dice lo que pasará; que sea verdad) y §9.

---

## 7. RV-519 · La clave del respaldo y la cadena del migrador, en la agrupación · media

**Qué pasa.** 15 §2 dice que la clave privada del respaldo la tienen jefatura y secretaría; en realidad la tiene solo el desarrollador (`35-seguridad…:672`, `verificacion/fase-8.md:131`; la entrega del sobre está pendiente, 09). Si él no está, las 13 copias semanales no se pueden leer. Y con DEC-219, el sobre tiene que llevar también las dos cadenas del migrador.

**Solución.** Lo hacen personas; Claude Code deja escrito qué y lo vigila:

1. **15 §2**, al día con la realidad: «Hoy: el desarrollador. Antes del piloto, al gestor de contraseñas o al sobre de la agrupación (issue #…)».
2. **Una issue `organizacion`**, «Antes del piloto: la clave del respaldo y las cadenas del migrador, en la agrupación», con los pasos:
   - el desarrollador lanza `npm run arranque -- --rotar db` para staging y para prod (necesita la contraseña de `postgres` de cada proyecto) y guarda las dos cadenas que enseña (RV-516);
   - la clave privada GPG (huella de 15 §2) y las dos cadenas, al gestor o al sobre, con dos personas;
   - anotarlo en 15 §9.

   Enlazada desde #77.
3. **09 §8**, en «Queda»: esa issue.

---

## 8. RV-520 · El formulario no se pierde al revocar el acceso (DEC-221) · media

**Qué pasa.**

- `comprobarAcceso` (`src/lib/acceso.ts:309-312`), al recibir un `TOKEN_*`, olvida el token y pone `{ tipo: 'fuera', caducado: true }`; `App.tsx:75-86` desmonta toda la app y pinta la entrada.
- Los campos y las fotos de un formulario viven en el estado del componente (`Proponer.tsx`). Se pierden.
- `comprobarAcceso` corre en segundo plano con el formulario abierto: al volver la cobertura (`conexion.ts`), al volver a la app tras la cámara si la última sincronización tiene más de 5 min (`acceso.ts:507`), y cuando la cola recibe un `TOKEN_*` (`cola.ts:612`).
- Revocar es la respuesta de jefatura a un código filtrado: le pasa a todos a la vez.

**Solución.**

1. **Un registro de «formulario abierto»** (un módulo pequeño en `src/lib/`): `Proponer` lo marca al montar y lo desmarca al desmontar, también la pantalla de resultado (`RUTA_HECHO`).
2. **`comprobarAcceso` con un formulario abierto**, ante un `TOKEN_*`: no olvida el token todavía ni pasa a `fuera`; deja `accesoCaducado: true` en el estado de acceso. Sin formulario abierto, como hoy.
3. **En el formulario**, con `accesoCaducado`:
   - un aviso arriba (`tinte-ambar`): «El acceso de este móvil ya no vale. Guarda lo que llevas: se enviará cuando vuelvas a escribir el código.»;
   - enviar guarda en el móvil como siempre (`encolar` guarda primero en IndexedDB; la cola se para con el `TOKEN_*` sin borrar nada) y va a la pantalla de resultado, que dice que está guardado en el móvil (UI-05);
   - al salir del formulario o de la pantalla de resultado, olvida el token y pasa a la entrada (`fuera`, `caducado: true`).
4. **Al volver a entrar**, la cola envía lo guardado con el token nuevo (la cola solo se vacía al cerrar sesión, `vaciarCola`), y los avisos push se vuelven a suscribir **en ese momento** (RV-515 borra las suscripciones del móvil revocado; hoy `resincronizarPush` puede esperar hasta 24 h, `push.ts:294`).
5. **Si la app se cierra o se recarga** con el formulario abierto y el acceso ya caducado, el formulario se pierde como hoy (RV-152, aceptado): al abrirla, la entrada.
6. **Solo el voluntario:** jefatura no usa token de dispositivo.

**Tests:**

- vitest de `acceso`: `TOKEN_REVOCADO` con un formulario abierto → `accesoCaducado`, el token sigue guardado y no `fuera`; sin formulario → `fuera`; al desmarcar con `accesoCaducado` → token olvidado y `fuera`; tras volver a entrar, se pide la suscripción push.
- e2e (móvil): un alta a medias con las dos fotos; la sincronización recibe `TOKEN_REVOCADO` (simulado); el formulario sigue con lo escrito y el aviso; enviar → la pantalla de resultado («guardado en el móvil»); salir → la entrada; volver a entrar (simulado) → el alta se envía.

**Documentación:** 01 FR-35 (lo que pasa con lo escrito); 02 FL-01 y FL-09; 06 Apéndice A (el aviso); 14 §2 y §8 (si cambian el código mientras rellenas algo).

---

## 9. RV-521 · Los envíos con error, a la vista (DEC-221) · media

**Qué pasa.**

- «N sin enviar» (`BarraEstado.tsx:161-165`, y en la hoja de sincronización `:113`) tiene el mismo aspecto esté esperando o haya fallado para siempre.
- El aviso de 24 h deja fuera lo que falló (`:154`, `!c.fallo`), y «Sincronizar» lo salta (`cola.ts:763`). Reintentar y Descartar solo están en Mis propuestas.
- 14 (`:184`, `:241`) dice que «sale solo» y que se toque Sincronizar.
- Jefatura (que también usa la cola, «Aplicar ahora») no tiene Mis propuestas: `RutasDentro.tsx:46-48` la manda al mapa, y el «N sin enviar» de su barra no lleva a ninguna parte (UI-01).

**Solución.**

1. **La pastilla**, con algún envío con `fallo`: «N con error», en `tinte-rojo` con su borde; si además hay otros esperando, «N con error · M sin enviar». Lleva a Mis propuestas.
2. **El aviso de la barra** (el mismo sitio del de 24 h): «Un envío no se ha podido hacer. Mira Mis propuestas.» (plural según N), mientras haya alguno con `fallo`.
3. **La hoja de sincronización**: la misma cuenta, y el enlace a Mis propuestas.
4. **Jefatura:** `/mis-propuestas` deja entrar a jefatura y le enseña **solo** la parte de la cola de este móvil (con Reintentar y Descartar); la lista del servidor, que es de voluntario, no. En la navegación de arriba sigue sin salir para jefatura (se llega desde la pastilla y la hoja).

**Tests:**

- vitest de la pastilla (`BarraEstado.test.tsx`): con un `fallo` → «1 con error» y la clase roja; con uno y dos esperando → «1 con error · 2 sin enviar».
- e2e (móvil): una revisión en cola que vuelve con `PUNTO_NO_ACTIVO` (simulado) → la pastilla roja y el aviso; tocar → Mis propuestas con Reintentar y Descartar.
- e2e (jefatura en el móvil, `jefatura-movil.spec.ts`): un «Aplicar ahora» con error → la pastilla lleva a la cola de jefatura, que deja descartarlo.

**Documentación:** 01 FR-83 (también lo que falló); 02 FL-10 y FL-28; 06 §5 (estado de la sincronización) y Apéndice A; 14 §8, §9 y §12.

---

## 10. RV-522 · Panel: el filtro en oscuro, el código del alta aprobada y el respaldo de staging en Salud · media

1. **El filtro en modo oscuro** (`src/componentes/panel/Filtros.tsx`):
   - el chip elegido y el círculo de radio de la lista usan `--marino-700` (`:278`, `:281`, `:296`), que no se lee en oscuro (`Boton.tsx:10` lo dice). Pasan a `--anillo-seleccion` (el borde del chip, el anillo y el punto del radio);
   - «Listo» (`bg-marino-950`, `:236`), con borde en oscuro como «Cómo llegar» de la ficha (`Ficha.tsx:324`: `bg-marino-950` y `border-texto`).
   - **Test:** e2e en oscuro a 412: el radio elegido y el borde del chip elegido contrastan ≥ 3:1 con el fondo de la hoja (WCAG 1.4.11), y «Listo» tiene un borde visible.
2. **El código del alta aprobada** (lo que `docs/38` RV-505 dejó a medias):
   - `coincide()` (`src/lib/panel/cola.ts:280-283`) recibe también los puntos y mira el código resuelto (`codigoCola`, `:213`); cambian su firma y sus llamadas;
   - el título y el `aria-label` del detalle (`ColaRevision.tsx:403`, `:436`) dicen ese código y no «nuevo»;
   - **Test:** vitest de `coincide` con el alta aprobada; el e2e de `panel-cola.spec.ts` busca HID-9001 en Aprobadas y lo encuentra, y el título del detalle lo dice.
3. **El respaldo de staging en Salud** (`src/lib/panel/salud.ts:133-136`, `:192-197`):
   - staging tiene respaldo semanal desde DEC-203, pero Salud lo sigue tratando como «no se respalda»: un respaldo viejo o que falta no sale en «Necesita atención»;
   - staging pasa a tratarse como producción en la fila del respaldo y en `atencionSalud`; fuera `respaldoNoAplica` si nadie más lo usa (y su texto del Apéndice A); 06 (`:842`, `:848`) al día;
   - **Tests que cambian** (los e2e se construyen como staging): `salud.test.ts`; `panel-ajustes.spec.ts` `:485-495` (el de RV-78) y `:853-859` («Todo bien» con `ultimo_respaldo` de `2026-09-18`, `:37`: pasa a una fecha reciente); `panel-simulado.ts:74` (`ultimo_respaldo: null` → una fecha reciente, o el caso que se quiera probar).

---

## 11. RV-523 · Fotos en el Inventario (DEC-222)

**Qué pasa.** Los puntos que lee jefatura ya traen `foto_path` y `foto_sitio_path` (`v_puntos_activos`, `0048`), y la cola enseña las fotos de una propuesta (`DetallePropuesta.tsx`, `UnaFoto`). Editar (`EditarPunto.tsx`) no enseña ninguna, y en el mapa del Inventario tocar un punto solo lo resalta (`Inventario.tsx:563`, `alSeleccionar={setSeleccion}`).

**Solución.**

1. **Una pieza común para una foto del panel**: saca `UnaFoto` de `DetallePropuesta.tsx` a `src/componentes/panel/piezas.tsx` (o a su propio archivo), con el alto como propiedad. La cola la sigue usando sin cambiar lo que hace (sus tests, en verde).
2. **Editar**, debajo de la banda (estado, código, «Editar», ✕) y encima del mapa:
   - la foto de la conexión y, si la hay, la del sitio, lado a lado (una sola, a todo el ancho), cada una con su etiqueta («Conexión», «Sitio»), como en la cola;
   - **solo lectura**: Editar no cambia fotos;
   - tocar una la abre en grande, como en la cola (el enlace a la foto, con nombre «Conexión · toca para ampliar»);
   - alto: 150 px por debajo de 768 (pantalla completa), 160 desde ahí (en los 500 y 540 px del panel);
   - si no carga, el texto de la cola en su hueco, y se anota (UI-04);
   - la foto se pide al abrir Editar, no antes: la lista no carga ninguna.
3. **En el mapa del Inventario**, tocar un punto abre Editar de ese punto (lo mismo que tocar su fila) y lo deja resaltado. Con cambios sin guardar en otro, la pregunta de siempre (`ConfirmarDescartar`).
4. **Con la caché de fotos de siempre** (`CACHE_FOTOS`): una foto ya vista se ve sin cobertura.

**Tests:**

- e2e (412, 820 y 1280): Editar de un punto con dos fotos → dos imágenes con su `alt` y su etiqueta; con una → una a todo el ancho; una que no carga → el texto; tocar → el enlace a la foto;
- e2e: en el mapa del Inventario, tocar un marcador abre Editar de ese punto;
- la lista del Inventario no pide ninguna foto (`page.on('request')` sin peticiones al bucket mientras no se abre Editar).

**Documentación:** 01 FR-120 («…Editar, con las fotos del punto»); 06 §5 «Panel: Editar» (las fotos, entre la banda y el mapa) y «Panel: Inventario» (el mapa abre Editar); 13 §5.

---

## 12. RV-524 · «Hidrantes test» (DEC-223)

**Qué pasa.** El nombre sale de `T.app.nombreCorto` («Hidrantes») en `vite.config.ts` (manifiesto `name` y `short_name`; `%TITULO%` y `%NOMBRE_CORTO%` de `index.html`, que dan el `<title>` y `apple-mobile-web-app-title`). El título de la cabecera del panel es `T.panel.titulo` («Hidrantes Albolote · Panel de jefatura»), visible desde 800 px. Igual en staging y en producción.

**Solución.**

1. **Textos:** `T.app.nombreCortoPruebas: 'Hidrantes test'` y `T.panel.tituloPruebas: 'Hidrantes test · Panel de jefatura'` (y en el Apéndice A).
2. **Una función con el nombre por entorno**, en `config/` (donde vive lo que comparten `vite.config.ts` y `src`, y donde vitest la puede probar): con `staging`, el de pruebas; con `produccion` y `local`, el de hoy.
3. **`vite.config.ts`**: el manifiesto (`name`: «Hidrantes test · Protección Civil Albolote», `short_name`: «Hidrantes test»), `%TITULO%` y `%NOMBRE_CORTO%`, con esa función.
4. **La cabecera del panel** (`PanelJefatura.tsx`), con esa función: «Hidrantes test · Panel de jefatura» en staging. Los `aria-label` de la navegación (`Armazon.tsx:70`, `NavegacionArriba.tsx:25`) no cambian.
5. **Lo instalado:** en Android, Chrome pone el nombre nuevo a la app instalada al actualizar el manifiesto (puede tardar un día). En iPhone hace falta quitarla y volver a añadirla, y eso borra su acceso y lo que tenga sin enviar: antes, que no quede nada en «sin enviar»; después, volver a escribir el código.
6. **Nada más cambia:** ni la dirección, ni el icono, ni la franja «ENTORNO DE PRUEBAS».
7. **Como `chore(staging)`**: no sale en las Novedades de producción (§0.4).

**Tests:**

- vitest de la función de `config/`: `staging` → «Hidrantes test»; `produccion` y `local` → «Hidrantes»;
- `scripts/workflows.test.ts` o la comprobación del `dist` (`build-del-entorno.sh`): el de staging lleva «Hidrantes test» en `manifest.webmanifest` y en `<title>`, y el de producción no;
- **e2e que cambian** (se construyen como staging): `armazon.spec.ts:9` y `:35` (título y `short_name`), y los que miren el título del panel.

**Documentación:** 04 §4 (lo que cambia por entorno); 06 Apéndice A; `docs/entornos.md` (lo escribe `arranque.ts`, `escribirEntornos` `:731-750`: cambia la plantilla); 13 §10 y 14 §2 (el nombre en el móvil durante el piloto, y el aviso del iPhone del punto 5).

---

## 13. RV-525 · Documentación al día con la app · media

Lo que el piloto va a leer y usar. Cada corrección, con la línea de la app que la respalda. Lo que traen RV-515 a RV-524 ya lo ha escrito cada uno; aquí, lo que encontró la revisión.

**14 (manual del voluntario):**

- la leyenda (`:76-77`): Barro, «marrón con una B blanca»; No funciona, «blanco con un aspa gris» (06 §4.3, `simbologia.ts`); nada tachado;
- Corregir datos (`:141`): la foto es opcional (`propuestas.ts:240`);
- la barra del mapa (`:58-59`): «sin conexión · hace N» (`estado-sincro.ts:28`);
- la versión nueva (`:226`): la barra de abajo «Hay una versión nueva» con «Actualizar».

**13 (manual de jefatura):**

- `:113` (y 10 AC-166, 02 `:279`): la revisión caducada es la fecha en rojo, no «hace 1 año» (UI-12 del panel);
- §4 y §5, «En el móvil»: el detalle a pantalla completa con «‹»; el botón se llama «Corregir»; «Rechazar seleccionadas…» con un motivo común; Exportar como icono;
- `:254-256`: en staging (el piloto), «Purgar fotos huérfanas» y «Respaldo ahora» no se pueden usar y las otras dos solo quedan pedidas.

**10:**

- **Mal hoy:** AC-44 y AC-22 (una boca ofrece 45, 70 u otra medida, DEC-144); AC-120 (el Inventario filtra por tipo y estado, no por núcleo); AC-74 (Salud ya no tiene «puntos sin dirección»); AC-105 (nueve indicadores, no ocho); AC-169 (con los filtros quitados, el CSV lleva todo); AC-40 y AC-41 («GPS · ±N m», «Pin puesto a mano»); AC-42 (cinco estados); AC-12 (amarillo y marrón); AC-17 y AC-18 («Callejero», «Foto aérea»); AC-13 y AC-15 (sin tachado); AC-60 («Aprobada HID-…»); AC-10 (el aviso de versión de hoy); AC-133 (Mis propuestas no dice quién decidió, FR-91); AC-99 (el comando con `--admin` y `--dispositivo`/`--buscar`); AC-113 (la reserva siguiente al tope y el nombre de test de hoy); AC-106 (la purga de fotos, solo en producción); AC-140 (cinco pantallas del panel). Cada uno, con lo que hace la app hoy.
- **Nuevos:** AC-185 «Purgar lo caducado…» (no se deshace); AC-186 «Rechazar seleccionadas…» con un motivo común; AC-187 «Revocar este móvil» desde Salud; AC-188 las fotos en Editar; AC-189 «Hidrantes test» en un móvil con las dos apps; AC-190 un formulario a medias cuando jefatura revoca; AC-191 un envío con error en rojo y qué hacer.

**01, 02 y 03:**

- 01 FR-61 y FR-62: sin «atenuados y tachados» ni «tachado»; los dibujos de 06 §4.3;
- 02 FL-30: «⋯» → «Quitar el acceso…» / «Devolver el acceso»; FL-31 paso 4: el inventario completo está en Inventario → Exportar (FR-144); FL-01 (la hora a la que se puede volver a probar), FL-03 (los cuatro enganches, con Directo), FL-06 (foto opcional, sin nota), FL-35 («sin conexión · hace N»);
- 03 TR-21: el panel se usa en el móvil, la tableta y el ordenador (768, 1.100 y 1.600 px; DEC-213).

**06 y `textos.test.ts`:**

- el Apéndice A, sin literales que ya no existen en el código (`Sincronizado […]` y `Sin cobertura · datos de […]` de `:504`, `Incidencias abiertas` de `:843`, y los que salgan);
- `textos.test.ts` comprueba también al revés: cada literal del Apéndice A existe en `textos.ts`, contando cada `[…]` como un hueco que casa con cualquier valor, o está en una lista cerrada de textos que escribe el servidor (los de `fn_encolar_aviso_tecnico`, los de las vigilancias y el Worker), cada uno con su motivo al lado.

**CLAUDE.md, skills, 09 e índice:**

- `INDICE.md:28`: la fila de `docs/38` va a la tabla de especificaciones archivadas;
- `CLAUDE.md:217` y `revisar-pantallas` (`:9-10`): los tamaños de verdad de `vistas.spec.ts` (412 × 915; el panel a 820, 1280 y 1920 × 900);
- 09 §3 (`:446`, `:451`): los riesgos que contaban con «pendientes > 14 días» y las direcciones que faltan en Salud, que ya no están, pasan al resumen semanal.

---

## 14. RV-526 · Tests: el panel también en el móvil, y las dos RPC sin pgTAP · media

1. **El recorrido de controles muertos y axe, también para el panel en el móvil.** `controles.spec.ts:382`, `:395`, `accesibilidad.spec.ts:293-294` y `degradacion.spec.ts:74` se saltan el panel en el proyecto `movil` porque «el panel es de escritorio (FR-100)», que ya no es verdad (DEC-213). Pasan a recorrerlo también a 412 × 915: la lupa, ☰, la hoja de filtros, la barra de lote, «⋯» y Exportar en icono (UI-01, AC-140).
2. **pgTAP que llama de verdad** a `fn_guardar_direccion_sugerida` y a `fn_borrar_suscripcion_push` (hoy solo salen en las listas de permisos): lo que hacen, sus errores y que solo tocan lo suyo.

---

## 15. RV-527 · Cierre

- **RV-139b** sobre el commit final, con la regla de DEC-217.
- **Recorrido corto con `revisar-pantallas`**: las fotos en Editar (412 y 1280), «Hidrantes test» en el manifiesto y la pestaña de staging, la pastilla «con error», el filtro en oscuro.
- **Publicar** con `npm run publicar -- --solo-comprobar` y después `npm run publicar`: **0.17.0**.
  - Que el manifiesto de producción sigue diciendo «Hidrantes».
  - Que `hidrantes_vigilar_tareas` está entre las tareas de producción: la vigilancia diaria (`revisar-bd.sh`, `tareas-programadas.sql`) o Salud del sistema.
- **Archivar:** a `docs/archivo/especificaciones/` con `git mv`, y su fila en `INDICE.md`.

## 16. Checklist

- [ ] RV-139b no deja nada escrito en staging; las bocas de prueba, retiradas; #651 cerrada.
- [ ] Un destino de push que no es solo un host de la lista no se guarda ni se usa; como mucho 3 suscripciones por móvil; quedarse sin acceso las borra. 0.16.1 en producción.
- [ ] `arranque` enseña la cadena del migrador una vez al crearla o rotarla; 15 §2 y §5.3 dicen dónde está.
- [ ] La base avisa a jefatura si la vigilancia o el respaldo se paran.
- [ ] Los despliegues, la purga de fotos y el respaldo no tocan la base de otro proyecto.
- [ ] La issue de la clave del respaldo y las cadenas del migrador, abierta y enlazada desde #77.
- [ ] Un formulario a medias sobrevive a la revocación; un envío con error se ve en rojo, también en el móvil de jefatura.
- [ ] El filtro se lee en oscuro; el código del alta aprobada se busca; Salud avisa del respaldo de staging.
- [ ] Editar enseña las fotos; el mapa del Inventario abre Editar.
- [ ] Staging se llama «Hidrantes test»; producción, «Hidrantes».
- [ ] 13, 14, 10, 01, 02, 03, 06 y CLAUDE.md al día con la app.
- [ ] Los 27 bajos, como issues `tras-piloto`.
- [ ] 0.17.0 en producción. Este documento, archivado.

## 17. Fuera

- Todo lo de §0.6: después del piloto.
- **Lo que hacen personas** (DEC-193, issues `organizacion`): la rotación y el sobre (RV-519), #76 a #85, el iPhone de verdad.
- **Miniaturas en la lista del Inventario** y cambiar fotos desde Editar.
- **La dirección de staging** y el proyecto de Cloudflare.
