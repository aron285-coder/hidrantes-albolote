# 15 · Continuidad y emergencias — Mapa de hidrantes

| | |
|---|---|
| **Estado** | Vivo. Los valores marcados `«…»` los rellena `scripts/arranque.ts` en `docs/entornos.md` y se copian aquí al cerrar la Fase 0; la tabla de §9 se actualiza en cada comprobación. |
| **Versión** | 1.0 — 17 de septiembre de 2026 |
| **Propietario de** | qué cuenta controla qué, dónde están las credenciales, y los procedimientos paso a paso para restaurar, revertir, rotar y recuperar el control cuando algo falla o cuando el desarrollador no está. |
| **Para** | jefatura y quien tenga que hacerse cargo del sistema sin conocerlo. Escrito para leerse con prisa. |
| **Referencias** | arquitectura en **04**; datos personales en **11**; tareas de construcción en **09** Fase 8. |

**Regla de oro:** nada de este documento exige saber programar. Cada procedimiento es una lista de
clics o de comandos que se copian tal cual. Si un paso no se entiende, se para y se pide ayuda: un
paso mal hecho en una restauración cuesta más que una hora de espera.

---

## 1. Qué hay, dónde y quién lo controla

| Pieza | Proveedor | Identificador | Cuenta propietaria | Coste |
|---|---|---|---|---|
| Código fuente, CI/CD, respaldos cifrados, issues | GitHub | repo público (DEC-053) `aron285-coder/hidrantes-albolote` (hasta el traspaso, §7); copia local en `C:\Proteccion civil\hidrantes-albolote` | `«cuenta-institucional@…»` · hoy: cuenta personal del desarrollador | 0 € |
| Aplicación y Pages Functions (producción) | Cloudflare Pages | proyecto `hidrantes-albolote` → `hidrantes-albolote.pages.dev` | `«cuenta-institucional@…»` | 0 € |
| Aplicación (pruebas) | Cloudflare Pages | `hidrantes-albolote-staging` | ídem | 0 € |
| Base de datos, Storage, Auth (producción) | Supabase | proyecto **prod** `«PROJECT_REF_PROD»`, esquema `hidrantes`, bucket `hidrantes-fotos` | ídem (compartido con la app de uniformidad) | 0 € |
| Base de datos (pruebas) | Supabase | proyecto **dev** `«PROJECT_REF_DEV»`, bucket `hidrantes-fotos-dev` | ídem | 0 € |
| Inicio de sesión de jefatura | Google (vía Supabase Auth) | proveedor Google del proyecto Supabase | ídem | 0 € |
| Mapa base propio (si > 20 MB) | Cloudflare R2 | bucket `hidrantes-mapabase` | ídem | 0 € |
| Dirección deducida | Nominatim (OSM) | sin cuenta; `User-Agent` `«…»` | — | 0 € |

Objetivo: todo en **una cuenta de Google institucional de la agrupación**, no en la personal de nadie
(DEC-023). Situación de partida (sep 2026): GitHub, Cloudflare y Supabase están bajo la cuenta de
Google personal del desarrollador; §7 dice cómo moverlos tras el lanzamiento. Hasta entonces, la
columna "Cuenta propietaria" dice `«desarrollador»`.

---

## 2. Credenciales: qué existe y dónde se guarda

| Credencial | Para qué | Dónde está | Quién la tiene |
|---|---|---|---|
| Contraseña + 2FA de la cuenta de Google institucional | entrar en GitHub, Cloudflare y Supabase | gestor de contraseñas de la agrupación (o sobre cerrado en la sede) | jefatura + secretaría |
| Códigos de recuperación de 2FA (Google, GitHub, Cloudflare, Supabase) | recuperar acceso si se pierde el móvil del 2FA | mismo sitio, entrada aparte | ídem |
| Clave GPG privada del respaldo | descifrar un respaldo | mismo sitio; **no está en GitHub ni en ningún ordenador** | ídem |
| Contraseñas de las bases de datos (dev, prod) | `pg_dump`, restauración | mismo sitio; también en los secretos de GitHub (cifrados) | ídem |
| Token de API de Cloudflare | despliegues desde CI | solo en los secretos de GitHub; se puede regenerar en un minuto | — |
| Resto de secretos (`SERVICE_ROLE_KEY`, `SAL_IP`, `GITHUB_DISPATCH_TOKEN`, VAPID…) | funcionamiento interno | secretos de GitHub y variables de Cloudflare; **todos regenerables** con `npm run arranque` | — |
| Código de acceso de los voluntarios | entrar en la app | lo ve jefatura en Ajustes del panel | jefatura |

Regla: lo que no se puede regenerar (contraseña de Google, códigos de recuperación, clave GPG,
contraseñas de BD) va al gestor o al sobre. Lo demás se regenera y no hace falta guardarlo.

Comprobación del sobre: cerrado, fechado, firmado por dos personas, en la caja fuerte o el archivo de
la sede. Se abre solo con dos personas presentes y se anota en §9.

---

## 3. Quién hace qué si falta alguien

| Situación | Quién actúa | Qué hace |
|---|---|---|
| El desarrollador no está disponible (vacaciones, baja) | jefatura | nada urgente: el sistema funciona solo; la vigilancia diaria avisa si algo falla (§4) |
| El desarrollador deja el proyecto | jefatura | §7: comprobar que todo está en la cuenta institucional; cualquier otra persona con Claude Code y este repositorio puede continuar (el `CLAUDE.md` y los documentos 00–12 lo explican todo) |
| Cambia la jefatura | jefatura saliente + entrante | añadir al nuevo en Ajustes → Administradores; entregar el sobre; §9 |
| Se pierde el móvil con el 2FA | jefatura | códigos de recuperación del sobre; después regenerar 2FA y códigos nuevos al sobre |

---

## 4. Cómo saber si algo va mal

En orden de fiabilidad:

1. **Salud del sistema** (Panel → Ajustes): pendientes antiguas, incidencias, errores, último
   respaldo, almacenamiento, última vigilancia. Verde = todo bien.
2. **Issues con etiqueta `vigilancia`** en GitHub: las abre solo el trabajo diario cuando la app, la
   base de datos o el respaldo fallan. Una issue abierta = algo que mirar en la §5 correspondiente.
3. **Los voluntarios**: "Algo no funciona" en Ajustes de la app llega a Panel → Voluntarios.
4. Páginas de estado de los proveedores: `status.supabase.com`, `cloudflarestatus.com`,
   `githubstatus.com`. Si está caído el proveedor, no hay nada que hacer salvo esperar; la app sigue
   mostrando los datos guardados en los móviles (FR-168).

---

## 5. Procedimientos de emergencia

Cada uno indica gravedad, cuánto tiempo hay y los pasos exactos. Los comandos se ejecutan en un
ordenador con el repositorio clonado y las sesiones de `gh`, `wrangler` y `supabase` abiertas con la
cuenta institucional (§8 explica cómo abrirlas).

### 5.1 La aplicación no carga o muestra una pantalla en blanco tras un despliegue

**Gravedad:** alta si es producción. **Tiempo:** minutos. **Quién:** cualquiera con acceso a GitHub.

1. Comprobar `cloudflarestatus.com`. Si Cloudflare está caído, esperar.
2. Volver al despliegue anterior de Pages (no reconstruye nada, es inmediato):
   ```
   npm run revertir -- --entorno prod
   ```
   Sin ordenador: Cloudflare → Pages → `hidrantes-albolote` → *Deployments* → el anterior con
   ✓ → *Rollback to this deployment*.
3. Abrir la app en un móvil y comprobar que carga. Los móviles se actualizan solos al abrirla.
4. Abrir una issue en GitHub con el título "Revertido despliegue del «fecha»" y pegar el error.
   Claude Code la recoge en la siguiente sesión.

### 5.2 Un cambio de base de datos ha roto algo

**Gravedad:** alta. **Tiempo:** una hora. **Quién:** quien maneje Claude Code.

Las migraciones son solo hacia adelante (04 §12): **no se edita ni se borra una migración
aplicada**. Se corrige con otra migración que deshaga el efecto:

1. Identificar la migración culpable en `supabase/migrations/` (la última con fecha del despliegue).
2. Pedir a Claude Code: "Escribe una migración que revierta `«archivo»` sin perder datos, con test
   pgTAP, y ábrela como PR a `develop`". Revisar el PR, fusionar, comprobar en staging.
3. PR de `develop` a `main`, aprobar el *environment* `production`. CI la aplica.
4. Si los datos ya están dañados y no basta con revertir el esquema: §5.3.

### 5.3 Restaurar un respaldo (pérdida o corrupción de datos)

**Gravedad:** máxima. **Tiempo:** 4 horas (TR-51). **Quién:** dos personas: una con el sobre, otra
con el ordenador. Ensayado con éxito el **20 sep 2026** sobre una base limpia (`docs/verificacion/fase-8.md` §3).

Los respaldos son artefactos del workflow `respaldo.yml` en GitHub, cifrados con GPG, de las últimas
13 semanas (datos) y 3 meses (fotos).

1. Antes de nada, **parar las escrituras**: Panel → Ajustes → Código de acceso → *Generar uno nuevo*
   con *Revocar todos los dispositivos*. Nadie podrá enviar nada hasta que se comunique el código
   nuevo. Avisar al grupo: "la aplicación está en mantenimiento".
2. Descargar el respaldo más reciente **anterior al problema**:
   ```
   gh run list --workflow respaldo.yml --limit 20
   gh run download «ID» --name respaldo-hidrantes
   ```
3. Descifrar con la clave privada del sobre (importarla una sola vez en este ordenador; borrarla al
   terminar):
   ```
   gpg --import clave-privada-respaldo.asc
   gpg --decrypt hidrantes-«fecha».sql.gpg > hidrantes.sql
   ```
4. Restaurar **solo el esquema `hidrantes`** en producción (la app de uniformidad no se toca):
   ```
   npm run restaurar -- --entorno prod --archivo hidrantes.sql
   ```
   El script vacía el esquema `hidrantes` y lo rehace desde el volcado, todo en una transacción: si
   algo falla a la mitad, la base se queda como estaba. Antes comprueba que el archivo es un volcado
   nuestro, que no toca `public` y que el `PROJECT_REF` de la cadena es el de producción. Pide
   confirmación escribiendo `RESTAURAR`.

   Vacía el esquema en vez de borrarlo porque crear uno exige un permiso que `hidrantes_migrador` no
   tiene (DEC-052), y en una emergencia solo hay a mano la cadena del secreto. Si el esquema ha
   desaparecido del todo —una base recién hecha—, el script lo dice y hay que crear la cáscara una
   vez con la cadena de `postgres`:
   ```
   create schema hidrantes authorization hidrantes_migrador;
   ```
5. Fotos: si también se perdieron, `npm run restaurar-fotos -- --entorno prod --archivo fotos-«fecha».tar.gpg`
   (necesita `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`, o los pide). Solo sube lo que falte: las
   fotos que ya estén en el bucket se dejan como están, así que se puede repetir sin miedo.
6. Comprobar: abrir el panel, ver Inventario y Registro; abrir la app en un móvil, sincronizar.
7. Comunicar el código nuevo al grupo. Anotar en §9 y en el Registro (el script escribe una entrada
   `restauracion_respaldo`).
8. Borrar la clave privada del ordenador: `gpg --delete-secret-keys «id»`.

Lo que se pierde: los cambios entre el respaldo y el incidente (como mucho una semana, TR-50). Los
voluntarios verán sus propuestas de esos días como "sin enviar" si aún las tienen en el móvil, y se
reenviarán solas.

### 5.4 El código de acceso se ha filtrado

**Gravedad:** media (las ubicaciones no son secretas; toda escritura pasa por moderación).
**Tiempo:** el mismo día. **Quién:** jefatura, desde el panel.

1. Ajustes → Código de acceso → marcar *Revocar todos los dispositivos* → *Generar uno nuevo* →
   confirmar.
2. Revisar en la Cola las propuestas de las últimas horas antes de aprobar nada; rechazar lo que no
   cuadre.
3. Comunicar el código nuevo por el canal habitual del grupo, no por uno público.
4. Anotar en 11 §8.

### 5.5 Una cuenta de administrador puede estar comprometida

**Gravedad:** alta. **Tiempo:** inmediato. **Quién:** otro administrador.

1. Panel → Ajustes → Administradores → desactivar el correo afectado.
2. Registro → filtrar por actor = ese correo → revisar y deshacer (restaurar desde Papelera, editar)
   lo que no cuadre.
3. La persona recupera su cuenta de Google (contraseña + 2FA) y se la reactiva.

### 5.6 Un secreto de servidor se ha filtrado (`service_role`, token de GitHub, VAPID…)

**Gravedad:** alta. **Tiempo:** el mismo día. **Quién:** quien maneje el ordenador.

1. `npm run arranque -- --rotar «nombre-del-secreto»` regenera ese secreto en Supabase o GitHub y lo
   vuelve a subir a GitHub Environments, a los secretos del repositorio (los que usan los trabajos
   por calendario, DEC-071) y a Cloudflare. Se pueden pedir varios: `--rotar db,gpg`. Para rotar
   todo: `--rotar todo` (ojo: cambia también las claves VAPID, y los móviles ya suscritos dejan de
   recibir avisos hasta que vuelvan a abrir la aplicación).
2. Redesplegar (`git commit --allow-empty -m "chore: rotación" && git push` en `develop`, luego PR a
   `main`).
3. Si fue la `service_role key` de producción: revisar el Registro de las últimas 24 h.

### 5.7 El almacenamiento de fotos se acerca a 1 GB

**Gravedad:** baja hasta el 90 %. **Tiempo:** semanas. **Quién:** jefatura.

1. Ajustes → *Purgar fotos huérfanas*. Esperar unos minutos; ver Storage en Salud.
2. Si sigue alto: pedir a Claude Code bajar la calidad de compresión (TR-15) y redesplegar.
3. Si no basta: mover las fotos a Cloudflare R2 (04 §5 lo prevé; `foto_path` no cambia). Es una tarea
   de Claude Code de un día.

### 5.8 Supabase, Cloudflare o GitHub caídos

**Quién:** nadie. Comprobar la página de estado del proveedor y esperar. Mientras:

- Supabase caído: la app muestra "sin conexión con el servidor" y los datos guardados; lo enviado se
  encola. El panel no funciona.
- Cloudflare caído: la app instalada abre con lo guardado (Service Worker); la web no carga para
  quien no la tenga instalada.
- GitHub caído: nada visible para los voluntarios; los despliegues y respaldos esperan.

**Caso frecuente en España: bloqueo por partidos de LaLiga (DEC-061).** Los operadores bloquean IP
de Cloudflare durante los partidos, casi siempre en fin de semana y durante unas horas.

- **Cómo se reconoce:** falla a la vez en todos los operadores (fibra y datos móviles), solo en
  España y en horario de partido; desde fuera (o con una VPN) la web carga. En
  <https://hayahora.futbol> se ve si hay bloqueo activo y se puede comprobar el dominio.
- **Qué hacer:** nada en el sistema; no es una avería ni se arregla desplegando. Avisar al grupo:
  "la app sigue funcionando con lo guardado; lo que enviéis saldrá solo cuando acabe el bloqueo".
  El panel de jefatura esperará.
- **Si coincide con una emergencia:** los hidrantes se consultan igual en la app instalada. Quien no
  la tenga instalada no podrá abrirla hasta que acabe el bloqueo.
- **Si pasa también entre semana o fuera de horario de partido**, anotarlo en una issue: habría que
  retomar las alternativas descartadas en DEC-061.

### 5.9 Se ha perdido el acceso a la cuenta de Google institucional

**Gravedad:** máxima a medio plazo. **Tiempo:** días.

1. Códigos de recuperación del sobre → recuperar la cuenta.
2. Si no hay códigos: recuperación de Google con el teléfono y correo de rescate registrados en el
   arranque (`«…»`). Puede tardar días.
3. Mientras: la app y el panel siguen funcionando; solo se pierde la capacidad de desplegar y de
   administrar las cuentas. Nadie más tiene ese acceso, por eso el sobre importa.

### 5.10 Un voluntario pide que se borre su nombre

No es una emergencia: 11 §6.4 y 13. Panel → Voluntarios → *Anonimizar*.

---

## 6. Marcha atrás de un despliegue del frontend (sin emergencia)

Cuando una versión nueva tiene un defecto que no rompe nada pero molesta:

1. `npm run revertir -- --entorno prod` (o el rollback en Cloudflare, §5.1).
2. Issue en GitHub describiendo el defecto; Claude Code lo corrige en `develop`, se prueba en staging
   y se vuelve a desplegar por el camino normal.

La base de datos no se toca en una marcha atrás del frontend: las migraciones son compatibles con la
versión anterior (TR-107).

---

## 7. Traspaso de propiedad a la cuenta institucional (una vez, tras el lanzamiento)

Guion de 45 minutos. Hacerlo con dos personas y el gestor de contraseñas abierto.

1. **Crear la cuenta de Google** `«nombre»@gmail.com` (o del dominio del ayuntamiento si lo hay)
   con contraseña larga, 2FA con el móvil de jefatura y **códigos de recuperación** guardados; correo
   y teléfono de rescate de la agrupación.
2. **GitHub:** crear una organización con esa cuenta; en el repo personal → *Settings → Transfer* a
   la organización. Los secretos de *Environments* no se transfieren: relanzar `npm run arranque`
   apunta al repo nuevo y los vuelve a subir. Añadir al desarrollador actual como *member* con
   permiso de escritura, no *owner*.
3. **Cloudflare:** *Manage account → Members* → invitar la cuenta institucional como
   *Super Administrator*; cuando acepte, transferir la propiedad y dejar al desarrollador como
   administrador. Regenerar el token de API con la cuenta nueva y actualizarlo en GitHub.
4. **Supabase:** *Organization settings → Team* → invitar la cuenta institucional como *Owner*;
   aceptar; el desarrollador pasa a *Developer*. (Es la misma organización que la app de uniformidad:
   coordinar con quien la administre.)
5. Comprobar: hacer un cambio trivial en `develop` y ver que staging se despliega. Lanzar
   `respaldo.yml` a mano y ver que termina.
6. Rellenar §1 y §2 con los valores reales; cerrar el sobre; anotar en §9.

Hasta que esto se haga, el proyecto depende de una cuenta personal. No bloquea el lanzamiento, pero
es lo primero después.

---

## 8. Abrir las sesiones de línea de comandos (para quien no lo haya hecho nunca)

Con Node.js y Git instalados. El repositorio vive en `C:\Proteccion civil\hidrantes-albolote` en la
máquina del desarrollador; en otra máquina se clona con
`git clone https://github.com/aron285-coder/hidrantes-albolote`. Desde esa carpeta:

```
gh auth login            # GitHub: elegir "GitHub.com", "HTTPS", "Login with a web browser"
npx wrangler login       # Cloudflare: se abre el navegador
npx supabase login       # Supabase: se abre el navegador
npm install
```

Entrar siempre con la cuenta institucional. Al terminar en un ordenador que no es de la agrupación:
`gh auth logout`, `npx wrangler logout`, `npx supabase logout`.

---

## 9. Comprobación periódica

| Cuándo | Qué | Quién | Hecho el |
|---|---|---|---|
| **Mensual** (5 min) | Salud del sistema en verde; sin issues `vigilancia` abiertas; último respaldo < 8 días | jefatura | |
| **Trimestral** (15 min) | Entrar en GitHub, Cloudflare y Supabase con la cuenta institucional; comprobar que el 2FA funciona; Dependabot sin PR mayores pendientes desde hace más de un mes | jefatura | |
| **Anual** (1 h) | Ensayo de restauración en staging (§5.3 contra dev); comprobar el sobre (cerrado, dos firmas); regenerar zona y mapa base desde Ajustes; revisar 11 §8 | jefatura + una segunda persona | |
| **Al cambiar jefatura** | §3; entrega del sobre firmada | ambos | |

Registro de comprobaciones y de incidentes:

| Fecha | Tipo (mensual / trimestral / anual / incidente §5.x) | Resultado | Quién |
|---|---|---|---|
| | | | |

---

## 10. Contactos

| Rol | Nombre | Cómo |
|---|---|---|
| Jefatura | `«…»` | `«…»` |
| Segunda persona con acceso al sobre | `«…»` | `«…»` |
| Desarrollador actual | `«…»` | `«…»` · disponibilidad: `«…»` |
| Administrador de la app de uniformidad (Supabase compartido) | `«…»` | `«…»` |

---

## Trazabilidad

| Sección | Origen |
|---|---|
| 1–2, 7 | plan v2.1 "Continuidad de acceso", "Reglas de entorno"; DEC-023 |
| 5.1, 5.2, 6 | plan v2.1 "Marcha atrás"; 04 §12 |
| 5.3 | plan v2.1 Fase 8 (respaldo GPG, prueba de restauración); TR-50–51 |
| 5.4–5.6 | 11 §3, §9 |
| 4, 9 | TR-102 (vigilancia), FR-143 (Salud) |
