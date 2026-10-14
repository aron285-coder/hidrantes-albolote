# 35 · Seguridad y defectos antes del piloto (oct 2026)

> **Archivada el 14 oct 2026 (RV-442).** Todo lo de este documento está en producción con 0.13.0. Lo que se hizo, PR a PR, en `verificacion/seguridad-35.md`. Los números finales: migraciones `0045` a `0047`; DEC-196 a DEC-203 como aquí (DEC-204 es la de los archivos de contexto de Claude Code, #655). Desviaciones: `TOPE_MOVILES_NUEVOS` no es un código propio, sino el tope de siempre con `ambito=moviles_nuevos` (compatibilidad con la versión anterior, DEC-201); la comprobación del paso 1 de RV-400 dio que el rol del migrador no tiene acceso al esquema `auth`.

| | |
|---|---|
| **Para** | Claude Code, en este repositorio. **Cuatro sesiones** (Backend, Frontend-campo, Frontend-panel y Ops) en tres oleadas. Cada sesión puede usar subagentes en worktrees (máximo 3), donde lo dice §0.3. |
| **Base** | `develop` en `a85fd89`. Producción en **0.12.0**. Última migración: `0044`. Última decisión: DEC-195. |
| **Origen** | La revisión completa del 13 oct 2026, con seguridad, hecha fuera del repositorio. Cada punto trae sus hallazgos con archivo y línea. El desarrollador ha elegido **todo lo alto y lo medio que Claude Code puede hacer**, salvo S3 y S5. |
| **Congelación** | Es una **excepción a DEC-193**, decidida por el desarrollador: DEC-196 (§1). Para todo lo que no está aquí, DEC-193 sigue vigente. |
| **Divulgación** | Este documento describe fallos que todavía no están arreglados, y el repositorio es **público**. Las reglas están en §0.4: el documento no entra en Git hasta RV-442. |
| **El desarrollador** | No hace nada (DEC-176, DEC-177). Acepta el riesgo de S3. La release la publica Ops (oleada 3). |
| **Requisitos** | Cambian en `docs/01` FR-33 y FR-34 (entrada con el código) y la cabecera. Cambian también `03` (topes), `05`, `06` (anillo de foco y Apéndice A) y `02` (flujos). Cada versión nueva va «aprobada por el desarrollador al pedir el cambio» (DEC-177). |

## 0. Reparto

### 0.1 Decisiones del desarrollador

Los números de DEC y de migración se toman **justo antes de fusionar**. Si ya están usados, se pasa al siguiente libre y se anota en la issue de coordinación, como en `docs/33`.

| DEC | Qué | Punto |
|---|---|---|
| **DEC-196** | `docs/35` es una excepción de seguridad a DEC-193. La siguiente especificación es `docs/36`, que sale del piloto. Texto en §1. | RV-414 |
| **DEC-197** | Jefatura queda atada a su **identidad de Google**, no al correo de la sesión. | RV-400 |
| **DEC-198** | El código de las dependencias **no corre con secretos**: `ignore-scripts`, trabajos con secretos sin `node_modules`, construir aparte de desplegar y fusión automática estricta. | RV-410 |
| **DEC-199** | Entrada con el código: el tope global ya no frena un código bueno, solo peticiones de la propia app, IPv6 por /48 y 60 fallos por hora. Las seis cifras no cambian (DEC-004 es de jefatura). | RV-401 |
| **DEC-200** | Staging: secretos en su environment, el código fuera del repositorio y los administradores del seed inactivos. | RV-411 |
| **DEC-201** | Abuso con el código bueno: los móviles nuevos gastan como mucho la mitad del grupo, jefatura tiene su espacio, la entrada **no se abre sola** al revocar y se puede revocar desde una hora. Sustituye el «se abre sola» de DEC-190. | RV-402 |
| **DEC-202** | **Avisos técnicos a jefatura** por push. La vigilancia sondea las Functions y solo cuenta como retraso de producción lo que corre en producción. | RV-404, RV-412 |
| **DEC-203** | Respaldo de staging, porque en el piloto los datos reales están ahí. Sigue siendo un solo respaldo por entorno (DEC-180). | RV-413 |

### 0.2 Sesiones, oleadas y puntos

| Oleada | Sesión | Puntos | `PW_PUERTO` |
|---|---|---|---|
| 0 | **Ops** | RV-405: puesta en marcha (§0.5) | — |
| 1 | **Backend** | RV-400 a RV-404 (migraciones de `0045` en adelante, una Function nueva, pgTAP) | 4400 |
| 1 | **Ops** | RV-410, RV-411, RV-413 y RV-414 | 4440 |
| 1 | **Frontend-campo** | RV-420 a RV-425 | 4420 |
| 1 | **Frontend-panel** | RV-430 y RV-431 | 4430 |
| 2 | **Frontend-campo** | RV-426 y RV-427, cuando estén en `develop` los códigos de RV-401 y RV-402 | 4420 |
| 2 | **Frontend-panel** | RV-432 y RV-433, cuando estén en `develop` RV-400, RV-402 y RV-404 | 4430 |
| 2 | **Ops** | RV-412, cuando esté en `develop` RV-404 | 4440 |
| 3 | **Ops** | RV-440 (RV-139b), RV-441 (recorrido corto) y RV-442 (publicar 0.13.0 y archivar) | 4440 |

**De dónde sale cada punto:**

| Revisión | Nivel | Punto |
|---|---|---|
| S1 · jefatura por el correo de la sesión | alto | RV-400 |
| S2 · dependencias con secretos | alto | RV-410 |
| S4 · entrada con el código | medio | RV-401, RV-426 |
| S6 · staging | medio | RV-411 |
| S7 · abuso con el código bueno | medio | RV-402, RV-427, RV-433 |
| Defectos del campo (6) | medio | RV-420 a RV-425 |
| Defectos del panel (3) | medio | RV-403, RV-430, RV-431 |
| Operación: avisos, sondeo, retraso por Dependabot, respaldo de staging | medio | RV-404, RV-412, RV-413 |
| Documentación (15, cabeceras, 02, manual 14, deriva) | medio | RV-414 |

### 0.3 Archivos y subagentes

| Archivo | Dueño |
|---|---|
| `supabase/migrations/*`, `supabase/tests/*`, `functions/**`, `e2e/integracion/**`, `docs/05`, `docs/11` | Backend |
| `src/` salvo `src/componentes/panel/**`, `src/lib/panel/**`, `src/paginas/PanelJefatura.tsx` y `src/lib/acceso.ts`; `public/sw-push.js`; `src/index.css`; en `docs/06`, solo §2 (el token nuevo) y §10 (foco) | Frontend-campo |
| `src/componentes/panel/**`, `src/lib/panel/**`, `src/paginas/PanelJefatura.tsx`, **`src/lib/acceso.ts`** (en esta especificación), el resto de `docs/06` | Frontend-panel |
| `.github/**`, `.npmrc`, `package.json`, `package-lock.json`, `scripts/**`, `supabase/seed-staging.sql`, `CLAUDE.md`, `docs/00`, `01`, `02`, `03`, `04`, `09`, `10`, `12`, `13`, `14`, `15`, `16`, `entornos.md`, `INDICE.md`, `docs/capturas/`, `docs/verificacion/*` | Ops |
| `src/lib/textos.ts` y `docs/06` Apéndice A | Cada uno, su bloque. Se rebasa justo antes de fusionar. |

**Subagentes:**

- **Backend:**
  - la sesión principal hace RV-400 (migración y Function);
  - el subagente B hace RV-403 y RV-404 (una migración), y fusiona primero;
  - el subagente A hace RV-401 y RV-402 (otra migración, que usa `fn_encolar_aviso_tecnico` de RV-404) y fusiona después de B.
- **Ops:**
  1. RV-410;
  2. RV-411 y RV-413;
  3. RV-414.
- **Frontend-campo:**
  1. RV-420, RV-422 y RV-424 (pantallas);
  2. RV-421, RV-423 y RV-425 (mapa y estilos).
- **Frontend-panel:** sin subagentes. Son cuatro puntos pequeños.

**Herramientas, como siempre:**

- `paquete-rv`, `nueva-migracion` (Backend) y `revisar-pantallas` (Frontend);
- `pr-review-toolkit` y `code-review` en cada PR de código;
- `security-guidance` en Backend y Ops. Cada aviso se contesta en el PR.

**Un test que falla antes del arreglo** en cada punto con código. Capturas antes y después de cada cambio visible, a 412 × 915 y 1440 × 900, en claro y en oscuro. **Registro:** `docs/verificacion/seguridad-35.md`, con redacción neutra (§0.4).

### 0.4 Divulgación (repositorio público)

1. **Este archivo no entra en Git hasta RV-442.** Las sesiones lo leen desde la copia local, con su ruta absoluta: `C:\Proteccion civil\hidrantes-albolote\docs\35-seguridad-antes-del-piloto.md`.
   - Ops lo añade a `.git/info/exclude` en RV-405, para que un `git add -A` no lo suba.
   - En RV-442 entra directamente en `docs/archivo/especificaciones/` (DEC-195).
2. **Las issues, los PR, los commits y el registro dicen qué cambia, no cómo se ataca.**
   - Títulos neutros, del tipo «docs/35 · RV-400».
   - Ni pasos de ataque ni el nombre de lo que se puede explotar hasta RV-442.
   - Un `fix:` con ámbito de usuario sale en Novedades: se escribe para un voluntario («la cuenta de jefatura queda unida a su cuenta de Google»).
3. Nunca en ningún sitio: el código de acceso (tampoco el de staging), correos, nombres ni secretos.

### 0.5 RV-405 · Puesta en marcha (Ops, antes de la oleada 1)

- **`.git/info/exclude`:** añade este archivo (§0.4).
- **Issues:** una issue por paquete, con título neutro. RV-400 y RV-410 llevan la etiqueta **`bloquea-release`**: así la puerta de `publicar` no deja salir nada hasta que estén cerradas (DEC-176). Una issue de coordinación, como en `docs/33`.
- **Worktrees:** `..\hidrantes-<sesión>`, como siempre (`trabajo-en-paralelo.md` §4).

---

## 1. DEC-196 · Excepción de seguridad a la congelación (RV-414)

Para `docs/12`, tal cual:

> ### DEC-196 · `docs/35`: seguridad antes del piloto, excepción a DEC-193
> - **Fecha:** 13 oct 2026 (desarrollador) · **Estado:** vigente (`docs/35`).
> - **Contexto:** la revisión completa del 13 oct 2026, con seguridad, encontró dos fallos altos y varios medios:
>   en la entrada con el código, en staging, en el campo, en el panel y en la operación. Los altos bloquearían el
>   lanzamiento. Con los medios, el piloto se haría con defectos conocidos que ya tienen arreglo. DEC-193 solo deja
>   entrar arreglos `bloquea-release`, lo que salga de #76 a #78 y mantenimiento invisible.
> - **Decisión:**
>   1. `docs/35` entra como excepción a DEC-193, y solo con lo que contiene.
>   2. Los dos altos van como issues `bloquea-release`.
>   3. DEC-193 sigue vigente para todo lo demás. La siguiente especificación es **`docs/36`** y parte de
>      `docs/verificacion/piloto.md` (donde DEC-193 decía `docs/35`).
>   4. Fuera de `docs/35`: S3 (riesgo aceptado por el desarrollador), S5 (decidido por el desarrollador) y los
>      hallazgos bajos, que pasan a issues `tras-piloto`.
> - **Descartado:**
>   - esperar al piloto: un piloto con datos reales y el acceso de jefatura sin atar a su cuenta de Google no es
>     aceptable;
>   - meterlo todo como `bloquea-release` sin especificación: sin reparto ni tests escritos.
> - **Afecta a:** DEC-193 («Fin de la congelación»: `docs/36`); CLAUDE.md §5 («salvo `docs/35`, DEC-196»); 09 §8.

---

## 2. Backend (oleada 1)

### RV-400 · Jefatura atada a su identidad de Google (S1, DEC-197) · P0 · `bloquea-release`

**Qué pasa.**

- `fn_es_admin()` (`0022_jefatura_con_google.sql`) da jefatura a una sesión si su JWT cumple tres cosas:
  - trae un `email` que está en `administradores` y activo;
  - `amr` tiene `oauth`;
  - `app_metadata.providers` tiene `google`.
- El `email` del JWT es el de `auth.users`. **El propio usuario lo puede cambiar** con `updateUser({ email })`. Su identidad de Google no cambia con él.
- **Así se cuela alguien:**
  1. Entra con **su** cuenta de Google en el proyecto de Supabase. El proyecto es el de uniformidad, y el acceso con Google está abierto.
  2. Pide cambiar su correo al de un administrador que todavía no tiene usuario en `auth.users`: uno recién añadido, o los dos `@example.com` del seed de staging.
  3. Si el administrador pulsa el enlace de confirmación que le llega, o si el proyecto confirma solo, el atacante tiene el panel.
- `scripts/comprobar-auth.ts:9-11` y `63-73` dicen que desde 0022 «eso no da jefatura». Para este caso, es falso.

**Solución.**

1. **Primero, sin cambiar nada:** en staging, con la cadena del migrador, `select has_table_privilege(current_user, 'auth.identities', 'select')`.
   - **Si da `true`** (no se espera): la comprobación del paso 3 se hace en SQL, leyendo `auth.identities`, y la Function sobra. Se anota en DEC-197.
   - **Si da `false`** (lo esperado, DEC-052): como sigue. **No** se pide un `grant` sobre `auth`: es el proyecto de uniformidad.
2. **Migración:**
   - **`administradores`:** columnas `usuario_id uuid unique` (null = sin vincular todavía) y `vinculado_en timestamptz`.
   - **`fn_es_admin()`:** además de lo de hoy, exige `a.usuario_id = auth.uid()`. Una fila sin vincular no da jefatura.
   - **`fn_vincular_administrador(usuario uuid, correo text) returns text`**, solo para `service_role`. Bloqueo por fila. Según el caso:
     | Caso | Devuelve | Hace |
     |---|---|---|
     | Fila activa con ese correo y sin vincular | `VINCULADO` | La vincula |
     | Ya vinculada a ese mismo usuario | `YA_VINCULADO` | Nada |
     | Vinculada a otro usuario | `OTRA_CUENTA` | Nada |
     | No hay fila activa con ese correo | `NO_ES_ADMINISTRADOR` | Nada |

     Cada vínculo va al Registro como `administrador_vinculado`, sin el `usuario_id`.
   - **Ajustes:** lo que lista los administradores (una vista o RLS sobre `administradores`; comprobar cuál) devuelve también `vinculado boolean`.
   - **`fn_gestionar_administrador`:** no deja quitar el acceso al **último administrador activo y vinculado**, si no lo hace ya. Error `ULTIMO_ADMINISTRADOR`. Lo usa RV-431.
   - **`grep fn_email_jwt`:** nada más puede decidir quién es jefatura sin pasar por `fn_es_admin` o `fn_exigir_admin`. Lo que solo lo usa para anotar el autor se queda como está.
3. **Function `functions/api/vincular-jefatura.ts`** (`POST`, con el JWT de la sesión en `Authorization`):
   - Lee el usuario con `GET {SUPABASE_URL}/auth/v1/user` y ese JWT; GoTrue lo valida. Sin usuario → 401.
   - Busca en `identities` una con `provider = 'google'` e `identity_data.email_verified === true`.
   - **El correo que cuenta es `identity_data.email`**, en minúsculas. **Nunca** `user.email`.
   - Llama a `fn_vincular_administrador(user.id, ese correo)` con la service role y devuelve `{ resultado }`. Con `NO_ES_ADMINISTRADOR` u `OTRA_CUENTA`, 403 con su código.
   - Límite por IP con `functions/_lib/limite.ts`, como las demás, y mismo origen (RV-401).
   - Nunca registra ni el correo ni el `usuario_id` (11).
4. **Los tests de SQL que simulan jefatura** ponen ahora `sub` en los claims y vinculan la fila en su preparación. Igual `e2e/integracion/**`.
5. **Transición:**
   - Tras la migración, los administradores de hoy quedan sin vincular.
   - El panel nuevo (RV-432) llama a la Function al entrar y la cuenta queda vinculada sin que nadie haga nada.
   - Con la versión anterior del panel en caché, jefatura ve «sin acceso» hasta pulsar *Actualizar* en el aviso de versión.
   - Es una excepción a «compatible una versión atrás» (CLAUDE.md §9) y se anota en DEC-197. Afecta a dos o tres personas, y producción aún no está abierta.
6. **Seed de staging y textos de `comprobar-auth.ts`:** los hace Ops en RV-411.

**Tests.**

- **pgTAP:**
  - un JWT con el correo de un administrador, `oauth` y `google`, sin vincular → no es jefatura;
  - vinculado al mismo `sub` → sí;
  - otro `sub` con el mismo correo → no;
  - las cuatro respuestas de `fn_vincular_administrador`;
  - `anon` y `authenticated` no la pueden ejecutar;
  - el último administrador no se puede desactivar.
- **Vitest de la Function:**
  - sin identidad de Google → 403;
  - con `email_verified` a falso → 403;
  - **el caso del ataque:** identidad de Google con otro correo y `user.email` igual al del administrador → 403;
  - bien → llama a la RPC con el correo de la identidad.

**Documentación:**

- 05: la columna, la RPC y la Function;
- 11: jefatura, y la amenaza en la tabla de riesgos;
- 04: la lista de Functions, sin escribir cuántas son (DEC-195).

### RV-401 · Entrada con el código: nadie bloquea a todos ni prueba desde webs ajenas (S4, DEC-199) · P1

**Qué pasa.**

1. **El tope global bloquea también el código bueno.** El tope de fallos (200 por hora, `0044:209`) se mira antes del bcrypt.
   - `functions/_lib/comun.ts:69-103` agrupa IPv6 por /64.
   - Con siete IP o siete /64 que fallen 30 veces cada una, nadie puede entrar durante una hora. Y se puede repetir.
2. **Cualquier web puede enviar intentos.**
   - `leerJson` (`comun.ts:50`) no mira el `Content-Type`, y ninguna Function mira el `Origin`.
   - Un `POST` con `text/plain` no necesita permiso CORS. Así una web puede hacer que los navegadores de sus visitantes envíen intentos: miles de IP distintas para probar códigos o para disparar el tope global.
3. **Fuerza bruta.** A 200 fallos por hora sin parar salen 4.800 al día: un 14 % del millón de códigos en un mes, sin que nadie se entere.
4. **Bloqueo y recuento.**
   - `fn_verificar_codigo` hace el bcrypt **dentro** del bloqueo global (`pg_advisory_xact_lock`) y sin `lock_timeout`. Una avalancha de intentos pone en cola todas las entradas.
   - Con los topes de canjes buenos (`altas_ip`, `altas_global`), cada intento frenado inserta una fila con `codigo_correcto`. Así se puede inflar `fn_entradas_frenadas_24h`.

**Solución.** Las seis cifras no cambian: DEC-004 es una decisión de jefatura.

- **En SQL** (la migración del subagente A):
  - El bcrypt va **antes** del bloqueo, y la función lleva `set lock_timeout = '3s'`. Si no consigue el bloqueo, error `OCUPADO`.
  - **Tope global: de 200 a 60 fallos por hora.** Cambian el valor por defecto de `fn_config` y la fila de `config`, si existe. No está en Ajustes.
  - **Un móvil limpio sigue pudiendo entrar.** Con el tope **global** alcanzado (no el de móvil ni el de IP), el intento se evalúa igual si el móvil y su IP agrupada **no tienen ningún fallo en 24 h**:
    - con el código bueno, entra y cuenta como éxito;
    - con uno malo, cuenta como fallo, y ese móvil y esa IP quedan frenados como hoy.

    El voluntario que lo escribe bien entra aunque alguien esté atacando. El atacante solo gana un intento por IP limpia y día.
  - **Aviso a jefatura.** La primera vez que salta el tope global en una hora, se encola un aviso técnico (RV-404) con la clave `intentos_codigo`: «Alguien está probando códigos de acceso. Si se repite, cambia el código en Ajustes.»
  - **Frenados con el código bueno:** como mucho una fila por móvil y hora. `fn_entradas_frenadas_24h` cuenta móviles distintos.
- **En las Functions:**
  - **`exigirMismoOrigen(peticion)`** en `_lib/comun.ts`, en **todas** las Functions con `POST`:
    - `Content-Type` tiene que ser `application/json`. Si algún llamante usa `sendBeacon`, se mira cómo envía y se acepta solo eso;
    - si hay `Origin`, igual al origen de la propia petición;
    - si hay `Sec-Fetch-Site`, `same-origin` o `none`;
    - si no, 403 `ORIGEN_NO_PERMITIDO`.

    Las llamadas de servidor a servidor (el Worker a `/api/push`, la vigilancia) no llevan `Origin` y siguen funcionando.
  - **IPv6 por /48**, no por /64, en la IP agrupada: un cliente suele tener un /48 o un /56 entero.
  - **`OCUPADO`** → 503 con `Retry-After: 30`.
- **El texto de `OCUPADO`** lo pone Frontend-campo en RV-426.

**Cuánto queda.** Con 60 fallos por hora son 1.440 al día: un 4 % al mes si nadie hace nada. Con el aviso a jefatura y el código cambiado al día siguiente, un 0,14 %. Va a 11 §3 con estos números.

**Tests.**

- **pgTAP:**
  - con el tope global alcanzado, un móvil limpio entra con el código bueno;
  - con uno malo queda frenado;
  - un móvil con un fallo previo, frenado;
  - `lock_timeout`: con dos transacciones, la segunda recibe `OCUPADO`;
  - el aviso técnico, una vez por hora;
  - los frenados, una fila por móvil y hora.
- **Vitest:** `exigirMismoOrigen` con cada caso, la agrupación por /48 y el 503.

**Documentación:** 03 (topes), 05 y 11 §3.

### RV-402 · Quien tiene el código no agota lo de todos (S7, DEC-201) · P1

**Qué pasa.**

1. **Con el código se agota lo del grupo.** Una persona saca hasta 20 móviles al día por wifi, y más con varias wifis o con la entrada abierta.
   - Con 10 móviles llega al tope del grupo de 600 propuestas al día.
   - Con 4, al de 150 fotos.
   - El resto del grupo se queda sin enviar ese día.
2. **Las reservas dejan a jefatura sin espacio.** Las reservas de foto abiertas (5 MB cada una, 6 por móvil) cuentan para el espacio **de todos**, también el de jefatura (`0044:511-516`). Con suficientes móviles, jefatura no puede subir fotos durante 2 horas.
3. **La entrada se abre sola.** «Cambiar el código revocando todos» abre la entrada 24 h sin preguntar (DEC-190). Es lo que se hace ante una filtración, y justo entonces se relajan los topes.
4. **Solo se puede revocar a todos.** Ante una filtración no hay otra opción.

**Solución** (la misma migración que RV-401):

- **Los móviles nuevos no gastan más de la mitad.**
  - Los móviles con el token emitido hace menos de 24 h (`dispositivos.emitido_en`) pueden usar, entre todos, como mucho la mitad de `max_propuestas_dia_total` y la mitad de `max_subidas_dia_total`.
  - Error `TOPE_MOVILES_NUEVOS`, con su `ambito` (RV-303).
  - No se aplica con la entrada abierta: el día del lanzamiento todos los móviles son nuevos.
  - Los móviles de jefatura no cuentan.
- **Espacio de jefatura.** Para un administrador, la comprobación de espacio cuenta los bytes reales y **solo sus** reservas abiertas. Para los voluntarios, igual que hoy.
- **La entrada no se abre sola.**
  - Firma nueva: `fn_cambiar_codigo_acceso(nuevo, revocar_dispositivos, abrir_entrada boolean default false)`.
  - Se borra la de dos argumentos; si no, PostgREST no sabe cuál llamar. La nueva la sustituye, con sus permisos.
  - El panel anterior la sigue llamando con dos argumentos: cambia el código sin abrir la entrada.
- **Revocar desde una hora:**
  - `fn_contar_desde(desde timestamptz) returns integer` y `fn_revocar_desde(desde timestamptz) returns integer`, solo para jefatura.
  - Cuentan o revocan los tokens sin revocar con `emitido_en >= desde`. Los de jefatura nunca.
  - `desde` no puede ser de hace más de 30 días.
  - Va al Registro con el número y la hora, sin dispositivos.
- **Las pantallas** van en RV-427 y RV-433.

**Tests (pgTAP), uno por cada cosa:**

- con la entrada abierta, los móviles nuevos no tienen tope;
- el panel anterior, con dos argumentos, sigue funcionando.

**Documentación:**

- 01: FR-33, y FR-34 sin «se abre sola»;
- 03 (topes), 05, 11 y 13.

### RV-403 · Añadir o renombrar un núcleo no deja la Cola «desactualizada» · P2

**Qué pasa.**

- `fn_anadir_nucleo` (`0009:78-80`) actualiza **todos** los puntos activos del municipio, cambie o no su núcleo. `fn_renombrar_nucleo` (`0009:45`) actualiza los de ese núcleo.
- El disparador sube `actualizado_en`, y la Cola compara `actualizado_en > creada_en` (`v_cola` y `fn_aplicar_propuesta`).
- Resultado: cada propuesta pendiente del municipio sale «desactualizada» y jefatura tiene que confirmarla.

**Solución** (la migración del subagente B):

- **`fn_anadir_nucleo`:** solo las filas cuyo núcleo cambia (`is distinct from`).
- **Columna nueva `puntos.datos_cambiados_en`:**
  - la pone el disparador cuando cambia algo que no sea `nucleo`, `municipio` ni las marcas de tiempo;
  - al crearla, se rellena con `actualizado_en`;
  - `v_cola` y la última definición de `fn_aplicar_propuesta` (búscala con `grep`) comparan con ella.
- `actualizado_en` sigue subiendo con todo: la sincronización de los móviles lo necesita para traer el núcleo nuevo.

**Test (pgTAP):** con una propuesta pendiente, añadir un núcleo que cambia ese punto → no sale desactualizada. Corregir el estado del punto → sí.

### RV-404 · Avisos técnicos a jefatura (DEC-202) · P1

**Qué pasa.** Todo lo que vigila la app (vigilancia, respaldo, despliegue) termina en una issue de GitHub, y eso solo lo ve el desarrollador. Si él no está, jefatura no se entera de que falla el respaldo o de que alguien está probando códigos.

**Solución** (la migración del subagente B):

- **Tema de push nuevo, `avisos_tecnicos`,** para las suscripciones de jefatura. Las que ya existen lo reciben activado.
- **`fn_encolar_aviso_tecnico(clave text, titulo text, cuerpo text, url text default '/panel/salud') returns boolean`**, solo para `service_role`. RV-401 también la usa por dentro.
  - Encola una notificación por cada suscripción de jefatura con ese tema.
  - Como mucho **una por clave cada 24 h**; la de `intentos_codigo`, una por hora.
  - Devuelve si ha encolado.
  - Sin nombres ni correos.
- **Envío:** `/api/push` lo envía en su siguiente vuelta (el Worker llama cada 5 min), como los demás avisos.
- **Los textos son fijos** y van donde estén hoy los de los demás avisos de jefatura. Se copian al Apéndice A de 06. Las claves:

  | Clave | Texto |
  |---|---|
  | `vigilancia` | «La comprobación diaria ha encontrado un problema. El desarrollador ya tiene el aviso. Mira Salud del sistema.» |
  | `respaldo` | «El respaldo de esta semana ha fallado.» |
  | `despliegue` | «La última actualización no se ha podido instalar entera.» |
  | `intentos_codigo` | RV-401 |
- **Quién la llama:** RV-401 desde SQL y Ops en RV-412.
- **Límite aceptado:** si Supabase o las Pages Functions están caídas, el push no sale y queda solo la issue, como hoy. Se anota en 15.

**Tests (pgTAP):**

- solo `service_role` la puede ejecutar;
- la deduplicación por clave;
- solo las suscripciones de jefatura con el tema;
- ninguna de voluntario.

---

## 3. Ops (oleadas 1 y 2)

### RV-410 · El código de las dependencias no corre con secretos (S2, DEC-198) · P0 · `bloquea-release`

**Qué pasa.**

- **`npm ci` con scripts en trabajos con secretos.** `preparar` (`.github/actions/preparar/action.yml`) hace `npm ci` **con** los scripts de instalación, en trabajos que tienen secretos de producción:
  - `respaldo.yml:58`, `purgar-fotos.yml:43` y `comprobar-produccion.yml:20`;
  - los dos `deploy-*.yml`, que además migran, construyen y despliegan en el mismo trabajo.
- **`allowScripts`** de `package.json` no protege nada: npm lo ignora.
- **La fusión automática de Dependabot es demasiado amplia.**
  - Acepta comodines (`eslint*`, `@types/*`).
  - No mira el lockfile: un parche de una dependencia permitida puede traer otras nuevas o cambiadas, con scripts de instalación, que se fusionan solas.
- **`checkout` deja el `GITHUB_TOKEN`** en `.git/config` (`persist-credentials` por defecto), al alcance de cualquier paquete que corra en ese trabajo.
- **`npm audit`:** 5 vulnerabilidades altas y 1 baja, todas en dependencias de desarrollo (wrangler/miniflare, undici, sharp, source-map-js y serialize-javascript).

**Solución.**

1. **Scripts de instalación.**
   - `.npmrc` con `ignore-scripts=true`.
   - Los dos paquetes que necesitan su script se reconstruyen a mano: `npm rebuild esbuild workerd`, en `preparar` y en CLAUDE.md §6, después de `npm ci`.
   - Se quita `allowScripts`.
2. **Los trabajos con secretos no usan `node_modules`.**
   - Comprobado con esbuild en `a85fd89`: estos scripts solo usan módulos de Node: `migrar`, `asegurar-propietario`, `cargar-zona`, `purgar-fotos`, `respaldo-fotos`, `comprobar-produccion`, `guarda-produccion`, `paridad`, `cargar-version-mapabase` y `promover-piloto`.
   - Se ejecutan con `node scripts/x.ts`, sin `npm ci` ni `tsx`. Node 24 quita los tipos, y `despachador.yml` ya lo hace así.
   - Si alguno usa sintaxis que Node no puede quitar (enum, parámetros de constructor con `private`…), se reescribe esa parte.
   - En esos trabajos, `preparar` con `npm: 'false'`.
3. **Cada despliegue, en tres trabajos:**
   - **`construir`:** sin environment ni secretos, con `contents: read`. Hace `npm ci`, `npm rebuild esbuild workerd` y `npm run build`, y sube `dist` como artefacto de un día.
   - **`desplegar`:** con el environment.
     - `checkout` con `persist-credentials: false`, y Node sin caché de npm.
     - `npm ci --prefix .github/despliegue`. Esa carpeta tiene un `package.json` con **solo `wrangler`**, en versión exacta, su lockfile y su propio `.npmrc` con `ignore-scripts`.
     - Los scripts, con `node`.
     - Descarga `dist` y hace `wrangler pages deploy`. En staging, también el Worker.
   - **`comprobar`:** sin secretos. `comprobar-despliegue` (usa `pmtiles`) y el e2e de cabeceras.
   - «Avisar del fallo» va en un trabajo final con `needs` e `if: failure() || cancelled()`.
4. **`persist-credentials: false`** en todos los `checkout` de trabajos con secretos o con permiso de escritura. Donde se hace `git push`, no, y se anota por qué.
5. **Fusión automática:**
   - `automerge-permitidos.txt`: nombres exactos, sin comodines.
   - `automerge-permitido.mjs` recibe también el lockfile de la base y el del PR.
     - El del PR se lee con `gh api …/contents/package-lock.json?ref=<sha del PR>`, **como datos**. Nunca se hace checkout del PR.
     - Rechaza la fusión si una entrada de `packages` cambia y no es un paquete de la lista a la versión que dice Dependabot.
     - También si aparece una entrada nueva.
     - También si alguna entrada nueva o cambiada lleva `hasInstallScript`.
   - Tests del script con lockfiles de ejemplo: añadir un paquete, cambiar uno transitivo, uno con script de instalación y uno bueno.
6. **`dependabot.yml`** vigila también `/.github/despliegue` (npm), sin fusión automática.
7. **`npm audit fix`**, sin `--force`.
   - Lo que necesite una versión mayor va en un PR aparte, revisado.
   - Si rompe algo, issue `tras-piloto`.
   - Objetivo: `npm audit` sin altas.
8. **Test en `scripts/workflows.test.ts`:**
   - ningún paso de un trabajo con `secrets.` (salvo `GITHUB_TOKEN`) llama a `npm run`, `npx` ni `tsx`, salvo `wrangler` desde `.github/despliegue`;
   - todo `checkout` de esos trabajos lleva `persist-credentials: false` o está en la lista de excepciones, con su motivo.

**Documentación:** 04 (CI y despliegue), 11 (cadena de suministro) y CLAUDE.md §6.

### RV-411 · Staging: secretos en su environment y código fuera del repositorio (S6, DEC-200) · P1

**Qué pasa.**

- **Secretos al alcance de cualquier rama.** `SUPABASE_DB_URL_STAGING`, `SUPABASE_SERVICE_ROLE_KEY_STAGING`, `VIGILANCIA_SECRETO_STAGING` y `PROPIETARIO_EMAIL` son secretos **del repositorio**: los puede leer un workflow de cualquier rama. En el piloto, staging tendrá datos reales.
- **El código de staging es público.** Es `000000` y está en el repositorio: `seed-staging.sql:89-93`, `scripts/intrusion.ts:18` y `scripts/capturas.ts:24`.
- **Administradores activos en el seed.** Los dos administradores `@example.com` están activos (es el blanco de RV-400).
- **Un texto que se equivoca.** `comprobar-auth.ts` dice que el cambio de correo «no da jefatura» (RV-400).

**Solución.**

1. **Secretos.** Se mueven con `npm run traspasar-secreto` (`traspaso.yml`):

   | Secreto del repositorio | Va a |
   |---|---|
   | `VIGILANCIA_SECRETO_STAGING` | `staging`, como `VIGILANCIA_SECRETO` |
   | `PROPIETARIO_EMAIL` | `staging` y `production` |
   | `SUPABASE_DB_URL_STAGING` y `SUPABASE_SERVICE_ROLE_KEY_STAGING` | `production`, porque los usa `promover-piloto`, que corre ahí. Staging ya tiene los suyos, con otros nombres. |

   - Después, `gh secret delete` de los cuatro del repositorio.
   - Los workflows los leen del environment.
   - `arranque.ts --rotar` escribe en los sitios nuevos.
   - Se comprueba con un despliegue de staging y una vigilancia en verde.
2. **El environment `staging`** solo admite `develop`. Se comprueba con `gh api …/environments/staging`; si no tiene esa regla, se pone.
3. **El código de staging:**
   - Claude Code genera uno aleatorio de seis cifras (`crypto.randomInt`). Lo guarda como secreto `CODIGO_STAGING` del environment `staging` y en su `.env.local`, que no se commitea. Nunca en logs, PR, issues ni en el chat.
   - `seed-staging.sql` deja de llevarlo: lo recibe como variable de `psql` (`-v codigo=…`). En la CI, con su base efímera, se pasa el de pruebas; en staging, `CODIGO_STAGING`.
   - `deploy-staging.yml`: si el hash de staging sigue siendo el de `000000`, pone el de `CODIGO_STAGING` y revoca los móviles de staging. Si jefatura ya ha puesto otro (el del piloto), no lo toca.
   - `capturas.ts` e `intrusion.ts` leen `CODIGO_STAGING` del entorno, y en local el del seed.
   - Si una sesión no lo tiene en su `.env.local`, genera uno nuevo y lo vuelve a poner (secreto y workflow). No se lo pide a nadie.
4. **Seed:** los administradores `@example.com` pasan a `activo = false`, también si ya existen (`on conflict … do update … where administradores.creado_por = 'seed'`).
5. **`scripts/comprobar-auth.ts`:** la cabecera y `evaluar` dicen lo que pasa de verdad: el correo de la sesión se puede cambiar, y desde RV-400 jefatura va atada a su identidad de Google.

**Tests (`scripts/workflows.test.ts`):**

- ningún workflow usa los cuatro secretos del repositorio;
- `seed-staging.sql` no contiene `000000`.

**Documentación:** `entornos.md` (tabla de secretos), 04 y 15.

### RV-412 · Vigilancia: las Functions, el retraso de producción y los avisos (DEC-202) · P1 · oleada 2

1. **Sondeo de las Functions**, en producción y en staging.
   - Envía `POST /api/verificar-codigo` con `Content-Type: application/json` y el cuerpo `{}`.
   - Espera un 400 con el JSON de error. Hay que comprobar en `verificar-codigo.ts` que ese camino responde antes de llamar a Supabase y que no cuenta como intento.
   - Un 5xx, HTML o ninguna respuesta es un problema: «Las funciones del servidor no responden».
2. **Producción atrasada** (`vigilancia.yml:226-238`).
   - Hoy cuenta cualquier commit fuera de `docs/`. Por eso cada fusión de Dependabot pone la vigilancia en rojo a los 7 días.
   - Pasa a un script, `.github/scripts/produccion-atrasada.sh`, con su test, que solo cuenta lo que cambia lo que corre en producción:
     - `src/`, `public/`, `functions/`, `workers/`, `supabase/migrations/`, `index.html` y `vite.config.ts`;
     - `package.json` y `package-lock.json`, solo si cambian dependencias que no son de desarrollo: `dependencies`, y en el lockfile las entradas sin `"dev": true`.
3. **Avisos técnicos a jefatura** (RV-404):
   - la vigilancia, si hay problemas **de producción**: `fn_encolar_aviso_tecnico('vigilancia', …)` con `psql`, en el trabajo de `prod-tareas`;
   - `respaldo.yml`, cuando falla, con la clave `respaldo`;
   - `deploy-prod.yml`, cuando falla, con la clave `despliegue`.

### RV-413 · Respaldo de staging (DEC-203) · P1

**Qué pasa.** En el piloto, los datos reales están en staging hasta `promover-piloto`. El respaldo solo copia producción.

**Solución.** `respaldo.yml` gana el trabajo `respaldo-staging`, en el environment `staging`, igual que el de producción:

- **Qué copia:**
  - los datos, cada semana;
  - las fotos de `hidrantes-fotos-dev`, el primer domingo de cada mes.
- **Cómo:** cifrado con la misma clave GPG (huella fija), como artefacto `respaldo-staging-<fecha>` de 90 días.
- **Sin prueba de restauración**, que es solo de producción. Sí comprueba que el archivo cifrado no está vacío y que lleva la huella.
- **Si falla:** la misma issue de siempre con «staging» en el título, y aviso técnico a la jefatura de staging (la del piloto).
- Sigue siendo **un** respaldo por entorno, en el mismo sitio (DEC-180). No es una segunda copia.

**Documentación:** 04 §9 y 15 §5.3 (restaurar staging: la misma receta con otra cadena).

### RV-414 · Documentación al día · P2

- **`docs/12`:** DEC-196 (§1) y DEC-197 a DEC-203, con el formato de siempre (Fecha, Estado, Contexto, Decisión, Descartado, Afecta a), a partir de cada punto.
  - DEC-193: en «Fin de la congelación», `docs/36`.
  - DEC-190: «se abre sola», sustituido por DEC-201.
- **CLAUDE.md:**
  - §5: «Hasta el piloto, DEC-193 (salvo `docs/35`, DEC-196)»;
  - §6: `npm ci` y `npm rebuild esbuild workerd` (RV-410), y fuera `npm run codigo`, que no existe.
- **`docs/15`:**
  - las líneas 57, 144, 339 y 343 hablan de aprobar `production` a mano; desde DEC-176 lo hace la puerta automática;
  - §10 Contactos: sin tabla. Una línea: «Los contactos van en el sobre y en el gestor de contraseñas, nunca aquí: el repositorio es público»;
  - el límite de los avisos técnicos (RV-404) y cómo restaurar staging (RV-413).
- **Cabeceras:**
  - `00:93` y las cabeceras de 02, 03, 04, 05, 06 y 16 dicen «cambia con conformidad de jefatura». Pasan a «cambia con una especificación, aprobada por el desarrollador al pedirla (DEC-177)»;
  - `10:198`: «Se validan con jefatura en F9.1 (#76) y en el piloto».
- **`docs/02`:**
  - el guion de la sesión no tiene Barro (452-454);
  - FL-31 lista filas de Salud quitadas en U13 (350);
  - FL-29 no tiene «abrir la entrada 24 h» (322-330), ni la casilla y «revocar desde» de RV-402.
- **Deriva:**
  - `GITHUB_DISPATCH_TOKEN` donde se lee como vigente (`09:104`, comentarios de workflows). DEC-068 y DEC-069 pasan a «sustituida por» la DEC del despachador;
  - en 04, las reservas son de 2 días (no 7) y el tope de fotos es 150 (no 400);
  - en 04, «cinco Pages Functions» pasa a decirse sin número (DEC-195);
  - en `INDICE.md`, la línea en blanco entre las filas 33 y 34 parte la tabla.
- **Manual 14** (`14:152`):
  - «Los dibujos te ayudan a compararlo» pasa a decir «las fotos»;
  - `capturas/vistas/` se vuelve a copiar del artefacto `vistas` de la CI del último PR de Frontend de esta especificación (oleada 2);
  - se comprueba que `nuevo-punto-boca.png` enseña las fotos con Barcelona y Directo como dice DEC-194.

---

## 4. Frontend-campo

### RV-420 · Mis propuestas abierta desde un aviso: ‹ no lleva a ninguna parte · P2

- **Qué pasa:** `MisPropuestas.tsx:145` vuelve con `navegar(-1)`. Si se abre desde un push (`sw-push.js:88,94`), es la primera página del historial, y ‹ no hace nada.
- **Solución:**
  - un `volverOAlInicio(navegar)` en `src/lib/navegacion.ts`, como el de `Legal.tsx:9`;
  - se usa en `MisPropuestas`, en `Legal` y en cada `alVolver={() => navegar(-1)}` de una pantalla que pueda ser la primera. Se buscan con `grep`.
- **Test (e2e):** abrir `/mis-propuestas` directamente y pulsar ‹ lleva a `/`.

### RV-421 · Actualizar el mapa sin conexión en la misma sesión rompe el mapa base · P2

- **Qué pasa:**
  - PMTiles guarda la cabecera y los directorios por `getKey()`, y la clave es siempre `URL_MAPABASE` (`mapabase.ts:67-74`).
  - La fuente es una sola instancia (`capas-leaflet.ts:20-21`).
  - Al descargar otra vez (`mapabase.ts:180`), los directorios guardados apuntan al archivo viejo, y las teselas salen mal o con error.
- **Solución:**
  - la clave lleva la versión y la fecha de la descarga;
  - al descargar o borrar, se crea la fuente de nuevo (`archivo = null`) y se redibujan las capas base.
- **Tests:**
  - vitest: la clave cambia tras descargar;
  - e2e: descargar, cambiar la versión simulada, descargar otra vez → las teselas cargan sin errores en la consola.

### RV-422 · La ficha arrastra el fallo de la foto al siguiente punto · P2

- **Qué pasa:** en tableta y ordenador, el panel de la ficha se queda montado (`Mapa.tsx:387-395`), y el estado de «foto que falló» (`Ficha.tsx:35-38`) pasa al punto siguiente.
- **Solución:** `key={punto.id}` en `<Ficha>`.
- **Test (vitest):** la foto de A falla → se cambia a B → se intenta cargar la foto de B.

### RV-423 · Nuevo punto: el pin se sale de la pantalla si el GPS llega tarde · P2

- **Qué pasa:** el mapa se centra en la posición inicial (`SelectorPin.tsx:63,70`). Cuando llega el GPS, el pin se mueve y el mapa no (`122-125`).
- **Solución:** con la primera posición del GPS, el mapa se centra **una vez**, si el usuario todavía no ha movido el pin ni el mapa.
- **Test (e2e):** con la geolocalización retrasada, el pin queda dentro de la pantalla. Si antes se arrastra el mapa, no salta.

### RV-424 · El aviso de versión tapa el final de la ficha en el móvil · P2

- **Qué pasa:** el aviso va fijo abajo y tapa el botón de copiar las UTM (`Mapa.tsx:398-405`, `AvisoVersion.tsx`).
- **Solución:**
  - `AvisoVersion` publica su alto en `--aviso-abajo`, con un `ResizeObserver`; si está oculto, 0;
  - la ficha, la lista y las hojas usan `padding-bottom: var(--aviso-abajo)`.
- **Test (e2e):** a 412 × 915 con el aviso visible, el botón de copiar las UTM se ve y se puede pulsar al bajar.

### RV-425 · Anillo de foco visible en oscuro y sobre la barra · P2

- **Qué pasa:** el foco es `--marino-700` (`index.css:285-288`). En modo oscuro y sobre la barra azul marino tiene un contraste de unos 1,5:1.
- **Solución:**
  - token `--anillo-foco`: en claro, `--marino-700`; en oscuro, uno claro, con al menos 3:1 sobre el fondo;
  - sobre `.bg-barra`, la variante clara.
  - Sale en 06 §2 (el token) y §10 (el foco).
- **Test:** contraste de al menos 3:1 sobre el fondo claro, el fondo oscuro y la barra, como los tests de tintes que ya hay.

### RV-426 · Entrada: `OCUPADO` y `ORIGEN_NO_PERMITIDO` con palabras · oleada 2

En `mensajes-entrada.ts` y `textos.ts`:

- `OCUPADO`: «Hay mucha gente entrando a la vez. Prueba otra vez en un minuto.»
- `ORIGEN_NO_PERMITIDO`: el texto genérico de error. Con la app no debería pasar nunca.

**Test (vitest):** cada código tiene su texto, y ninguno dice «Sin conexión».

### RV-427 · `TOPE_MOVILES_NUEVOS` con palabras · oleada 2

- Con el mecanismo de los demás topes (`ambito`, RV-303).
- Texto: «Hoy los móviles recién entrados ya han enviado mucho. Podrás seguir mañana; lo que tienes se queda guardado.»
- Que la propuesta quede guardada en la cola, como con los demás topes.

---

## 5. Frontend-panel

### RV-430 · Cola: ‹ mientras se guarda ya no saca de la Cola · P2

- **Qué pasa:**
  - si se pulsa ‹ mientras se guarda, al terminar `hecho()` vuelve a llamar a `volverACola()` (`ColaRevision.tsx:145-151`, `208-214`);
  - con `navegar(-1)`, eso saca de la Cola o cierra otra propuesta que se haya abierto entretanto (`DetallePropuesta.tsx:167-168`, `222-226`).
- **Solución:**
  - `alHecho(id)`: `hecho(id)` solo vuelve a la Cola si la propuesta abierta sigue siendo `id` y no ha habido otra navegación desde que se empezó a guardar (se compara `location.key`);
  - ‹ no se deshabilita.
- **Test (e2e, con la RPC retrasada en `simularRpc`):**
  - ‹ durante el guardado → sigue en la Cola;
  - abrir otra propuesta durante el guardado → esa sigue abierta.

### RV-431 · Ajustes: quitar el acceso a un administrador pide confirmación · P2

- **Qué pasa:** es una casilla sin confirmación (`Ajustes.tsx:364-376`), también para uno mismo.
- **Solución:**
  - **Pasar a «sin acceso»** abre un `Dialogo`: «¿Quitar el acceso a {correo}?».
  - **Para uno mismo:** «Vas a quitarte el acceso a ti. Saldrás del panel y otro administrador tendrá que devolvértelo.»
  - **Devolver el acceso** no pide confirmación.
  - **`ULTIMO_ADMINISTRADOR`** (RV-400) se dice con palabras: «Tiene que quedar al menos un administrador con acceso.»
- **Tests:** vitest y e2e.

### RV-432 · El panel vincula la cuenta de jefatura al entrar · oleada 2

- **En `src/lib/acceso.ts`:** con una sesión de Google, si `fn_es_admin` da falso, llama **una vez por sesión** a `POST /api/vincular-jefatura` y vuelve a comprobar. Con `VINCULADO` o `YA_VINCULADO`, entra. Con lo demás, la pantalla de «sin acceso» de siempre.
- **En Ajustes → Administradores:** con `vinculado = false`, «Pendiente de su primer acceso», con la ayuda «Que entre en el panel cuanto antes con su cuenta de Google».
- **Test (e2e):** sin vincular → llamada → entra. Con `OTRA_CUENTA` → sin acceso, sin bucle.

### RV-433 · Código de acceso, revocar desde una hora y avisos técnicos · oleada 2

- **Cambiar el código revocando todos:** casilla «Abrir la entrada 24 h para que todos puedan volver a entrar a la vez», **sin marcar**, con una línea de ayuda. Se pasa `abrir_entrada` (RV-402).
- **Revocar desde una hora:** «Revocar los móviles que han entrado desde…», en Ajustes, junto al código.
  - Fecha y hora, por defecto hace 24 h.
  - Antes de confirmar, un `Dialogo` dice cuántos son («Se revocarán N móviles», con `fn_contar_desde`).
  - Con 0, el botón deshabilitado y el motivo escrito.
- **Ajustes → Avisos:** interruptor «Avisos técnicos» (tema `avisos_tecnicos`), con su explicación.
- **Textos** al Apéndice A de 06.
- **Tests:** vitest y e2e de los tres.

---

## 6. Cierre (Ops, oleada 3)

- **RV-440:** RV-139b sobre el commit final de `develop`.
- **RV-441 · Recorrido corto de lo cambiado** en staging, con `revisar-pantallas`:
  - Mis propuestas abierta por URL directa;
  - el mapa sin conexión descargado dos veces;
  - la ficha con una foto que falla y después otro punto;
  - un punto nuevo con el GPS retrasado;
  - el aviso de versión;
  - el foco en oscuro;
  - ‹ en la Cola durante un guardado;
  - Ajustes: administradores, código, revocar y avisos.

  Solo se guardan en Git las capturas que el registro comenta (DEC-195).
- **RV-442 · Publicar 0.13.0** con `npm run publicar -- --solo-comprobar` y después `npm run publicar`.
  - Al terminar, `comprobar-produccion`.
  - Este documento pasa a `docs/archivo/especificaciones/35-seguridad-antes-del-piloto.md`, con su fila en `INDICE.md`, y sale de `.git/info/exclude`.
  - Los hallazgos bajos y S8 se anotan como issues `tras-piloto`, con título neutro.
  - Se cierra el registro.

## 7. Checklist

- [ ] Una sesión de Google con el correo de un administrador y otra identidad no entra en el panel; la del administrador, sí, sin hacer nada.
- [ ] Ningún trabajo con secretos ejecuta código de `node_modules`, salvo `wrangler` desde su carpeta. Ningún `checkout` de esos trabajos deja el token. La fusión automática rechaza un lockfile con paquetes de más.
- [ ] `npm audit` sin altas.
- [ ] Con el tope global alcanzado, un móvil limpio entra con el código bueno. Una petición desde otro origen recibe 403.
- [ ] Los móviles nuevos no agotan el grupo. Jefatura sube fotos con todas las reservas ocupadas. Revocar no abre la entrada. «Revocar desde» revoca solo los de después.
- [ ] Añadir un núcleo no desactualiza la Cola.
- [ ] Jefatura recibe los avisos técnicos, como mucho uno por clave y día.
- [ ] Ningún secreto de staging en el repositorio. Ni `000000` en el seed. Los administradores del seed, inactivos.
- [ ] La vigilancia sondea las Functions y no se pone en rojo por Dependabot.
- [ ] Hay respaldo de staging de esta semana.
- [ ] Los seis defectos del campo y los tres del panel, con su test.
- [ ] Documentación: 15, cabeceras, 02, 14 y la deriva.
- [ ] Tests, e2e y axe en verde; CI y staging en verde; RV-139b en verde; 0.13.0 en producción.
- [ ] Este documento, archivado. Nada de §0.4 publicado antes de tiempo.

## 8. Fuera de este documento

- **S3** (el desarrollador acepta el riesgo) y **S5** (decidido por el desarrollador). Sin detalle aquí.
- **Los hallazgos bajos y S8:** issues `tras-piloto` después de RV-442.
- **Turnstile en la entrada:** necesitaría un token de Cloudflare con otro permiso. Va como «descartado» en DEC-199.
- **Lo que Claude Code no puede hacer:**
  - una segunda persona de la agrupación como administradora en GitHub;
  - probar a descifrar un respaldo: la clave privada está fuera de línea, con el desarrollador;
  - #81 (los correos de jefatura);
  - pruebas en un iPhone real, con push real y del marcador a pleno sol;
  - los contactos y el sobre;
  - el traspaso a la cuenta institucional.

## 9. Lo que hace el desarrollador

Nada.

- Después de 0.13.0, la cuenta de cada administrador se une sola a su Google la primera vez que abre el panel (RV-432).
- Quien tenga la versión anterior en caché pulsa *Actualizar* en el aviso de versión.
