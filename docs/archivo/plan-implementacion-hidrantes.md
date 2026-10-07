> **Archivado el 17 de septiembre de 2026.** Sustituido por `docs/09-plan-implementacion.md` v3.1 y por 04, 05, 10, 11, 12, 15 y 16. Se conserva solo como historia del proyecto; no es la referencia para construir.

# Plan de implementación — Mapa de hidrantes · Protección Civil de Albolote

Plan operativo por fases para construir la aplicación descrita en `requisitos-hidrantes.html` (v6).
Escrito para ejecutarse con **Claude Code**. Coste de software: **0 €**.

**Versión 2 — 16 de septiembre de 2026.** Revisión completa de la v1. Lo que cambia, en una lista:

- Subida de fotos solo con **URL firmada** emitida tras validar el dispositivo (la v1 dejaba `insert` abierto a `anon`).
- `fn_verificar_codigo` solo ejecutable por la *Pages Function*; el **token de dispositivo** se aplica de forma coherente en todas las RPC y en el frontend (la v1 mezclaba código y token).
- Mapa base **PMTiles descargado entero** al móvil para uso sin cobertura, con la decisión R2 tomada de antemano.
- Permisos de jefatura en una tabla propia `hidrantes.administradores`, no en una columna de `public.app_users`.
- **Dirección deducida** por *reverse geocoding* (Nominatim, en servidor, al revisar) en `puntos.direccion`.
- Aviso de **fuera de zona**, búsqueda y filtros en la app del voluntario, layout de tableta/escritorio, jefatura operando desde el móvil, pestaña Voluntarios con incidencias.
- **Piloto en staging con promoción de datos** a producción mediante `scripts/promover-piloto.ts`.
- Arranque en **un solo comando** (`npm run arranque`) que crea repo, entornos, secretos, proyectos de Cloudflare y configura Supabase por Management API. El desarrollador interviene unas dos horas en todo el proyecto.
- Estimación revisada: **~27 días** (antes 18).
- **Revisión 2.1 (misma fecha):** el nivel de estado "defecto" pasa a llamarse **"No funciona"** (`no_funciona`) en enum, UI y documentos; mockups ampliados (lista móvil, corregir ubicación, retirada, jefatura en móvil, ficha de boca de riego, modo oscuro) y panel con corrección editable, comparación de duplicados, fusión con elección de campos, inventario ordenable y paginado, y confirmaciones en Ajustes.

> **Convención de idioma:** el esquema, los identificadores de base de datos, los enums y la UI van
> en **español**, igual que en la app de uniformidad. Los comentarios de código, en español también.

> **Regla rectora de este plan:** todo lo que pueda hacer Claude Code, lo hace Claude Code. La
> persona solo interviene donde es imposible delegar: entregar credenciales una vez, decidir, y
> probar en la calle. Ver [Modelo de delegación](#modelo-de-delegación).

---

## Decisiones cerradas por jefatura

| Punto | Decisión |
|---|---|
| Dominio | Se mantiene `pages.dev`. No se compra dominio propio; el coste sigue siendo 0 €. |
| Código de acceso | **6 dígitos.** Ver "Protección del código de acceso" para cómo se compensa su brevedad. |
| Tipo de racor | Confirmado: Granada, Barcelona u otro, **solo en bocas de riego**. Con foto de referencia de cada tipo dentro del formulario. |
| Foto del punto | **Obligatoria.** Sin foto no se puede enviar una propuesta de alta. |
| Diámetro | Es el de la **salida mayor**, no el DN del cuerpo (80/100/150). Hidrantes 70 o 100 mm; bocas de riego 45 mm fijo. |
| Administradores de hidrantes | Tabla propia `hidrantes.administradores`, independiente de `public.app_users`. Arranca solo con el propietario; el resto se añade desde Ajustes sin desplegar. |
| Segundo propietario de las cuentas | **No hay una segunda persona disponible.** Ver "Continuidad" para la alternativa adoptada. |
| Piloto | En **staging**, con un barrio real. Al terminar, `scripts/promover-piloto.ts` copia a producción los puntos aprobados con sus fotos y su registro, conservando los códigos. Ver Fase 9. |
| Dirección del punto | **Deducida por el sistema** (reverse geocoding con Nominatim, en servidor, al revisar la propuesta) y corregible por jefatura. El voluntario no la escribe. |
| Estimación | Ampliada a **~27 días**; la v1 (18) no cubría entornos, respaldo, mapa propio ni piloto de forma realista. |

---

## 0. Contexto y principios

### Qué se construye

PWA instalable para que ~65 voluntarios registren y consulten **hidrantes de incendios** y **bocas de
riego** del término municipal de Albolote (más Calicasas) sobre un mapa Leaflet, con moderación
previa por jefatura.

### Stack

| Capa | Elección |
|---|---|
| Frontend | React + TypeScript + Vite + Tailwind + shadcn/ui |
| Mapa | Leaflet + **mapa base propio en PMTiles** (offline) + capas en línea OSM / PNOA (IGN) / Catastro |
| Geometría cliente | Turf.js (`booleanPointInPolygon`, `distance`) |
| Backend / BD | Supabase, **esquema `hidrantes`**, PostGIS habilitado |
| Almacenamiento | Supabase Storage, bucket `hidrantes-fotos`. **Subida solo con URL firmada** emitida por una *Pages Function* tras validar el token del dispositivo |
| Auth jefatura | Google, con el proveedor ya configurado en Supabase Auth por la app de uniformidad. Permisos en `hidrantes.administradores` |
| Acceso voluntario | Código de grupo de 6 dígitos, canjeado una sola vez por un **token de dispositivo** que viaja en cada RPC |
| Offline | Service Worker (`vite-plugin-pwa`) + IndexedDB (`idb`) |
| Hosting | Cloudflare Pages, con cuatro *Pages Functions*: validar código, emitir URL de subida, deducir dirección y lanzar la purga |
| CI/CD | GitHub Actions: build, typecheck, lint, tests SQL, e2e, y **migraciones automáticas** |
| E2E | Playwright |
| Errores | Tabla `errores_cliente` en Supabase (sin servicio externo) |
| Dirección | Nominatim (OSM), consultado en servidor desde una *Pages Function*, una vez por punto |
| Tareas programadas | `pg_cron` dentro de Supabase para purgas SQL; GitHub Actions para lo que necesita `service_role` fuera de la BD (respaldo, fotos huérfanas) |

### Principios de arquitectura

1. **`puntos` guarda el estado actual; `registro` guarda la historia.**
   A diferencia de la app de uniformidad, aquí **no** se usa un libro mayor *append-only* como única
   fuente. Un hidrante tiene un único estado verdadero en un momento dado (no es un saldo que se
   acumule), así que `puntos` es una tabla mutable. La trazabilidad se garantiza porque *toda*
   mutación pasa por RPC que escribe en `registro` con el valor anterior y el nuevo. Modelarlo como
   ledger obligaría a recalcular el estado en cada lectura del mapa sin ninguna ventaja.
2. **Nada entra al mapa sin aprobación.** Los voluntarios escriben en `propuestas`, nunca en
   `puntos`. Solo las RPC de administrador trasladan una propuesta a `puntos`.
3. **Integridad de escritura en la base de datos.** Toda mutación va por funciones RPC
   `SECURITY DEFINER` que validan permisos, validan la entrada y escriben auditoría. El navegador
   nunca hace `insert`/`update` directo.
4. **RLS como única puerta.** La `anon key` es pública; la seguridad viene de RLS y de la
   validación del código de acceso dentro de cada RPC.
5. **Identidad del dispositivo, no del nombre.** El nombre y apellido es *atribución*, no
   *autenticación*: sirve para que jefatura sepa a quién preguntar. Todo control de propiedad
   (retirar una propuesta propia, listar "mis propuestas") se hace contra un `dispositivo_id` uuid
   generado en el móvil, nunca contra el nombre escrito.
6. **Códigos estables.** `HID-####` (hidrante) y `BOC-####` (boca de riego), correlativos por
   secuencia de Postgres, nunca reutilizados ni regenerados.
7. **Migraciones versionadas** en `supabase/migrations`, aplicadas por CI. Cero cambios ad-hoc en el
   panel de Supabase, en ningún entorno.
8. **Cero pasos manuales reproducibles.** Todo lo que se pueda generar o desplegar con un script, se
   hace con un script que queda en el repo.
9. **Nada llega a Storage sin una URL firmada.** La `anon key` no puede escribir en el bucket. El
   móvil pide una URL de subida a la *Pages Function*, que la emite solo si el token del dispositivo
   es válido y la cuota diaria no se ha agotado. Sin esto, cualquiera con la `anon key` (que es
   pública) podría llenar el gigabyte gratuito en una tarde.
10. **Jefatura también trabaja desde el móvil.** La misma PWA, con inicio de sesión de Google:
    cualquiera de las seis operaciones que haga un administrador se aplica al momento y queda en
    `registro` como acción de administrador, sin pasar por la cola.

---

## Entornos: staging y producción separados

Dos entornos completos y aislados. **Ningún dato, credencial ni bucket se comparte entre ellos.**

| | **staging** | **producción** |
|---|---|---|
| Rama de Git | `develop` | `main` |
| Proyecto Cloudflare Pages | `hidrantes-albolote-staging` | `hidrantes-albolote` |
| URL | `hidrantes-albolote-staging.pages.dev` | `hidrantes-albolote.pages.dev` |
| Proyecto Supabase | **dev** (el existente de la app de uniformidad) | **prod** (el existente) |
| Esquema | `hidrantes` | `hidrantes` (idéntico, mismas migraciones) |
| Bucket de Storage | `hidrantes-fotos-dev` | `hidrantes-fotos` |
| Código de acceso | `000000` en el *seed* inicial; para el piloto jefatura genera uno real desde Ajustes | real, generado y rotable |
| `administradores` | correos de prueba + el del propietario | el propietario al arrancar; el resto desde Ajustes |
| Datos | *seed* de 12 puntos `[PRUEBA]` (idempotente: nunca pisa datos existentes) + los del piloto | **vacío al arrancar**; recibe los datos del piloto con `promover-piloto.ts` |
| Indexación | `robots.txt` con `Disallow: /` y meta `noindex` | normal |
| Aviso visual | banda naranja permanente arriba: "ENTORNO DE PRUEBAS" | ninguna |
| Despliegue | automático al hacer merge a `develop` | automático al hacer merge a `main`, con aprobación manual del *environment* de GitHub |
| Migraciones | las aplica CI automáticamente | las aplica CI tras la aprobación |

### Infraestructura compartida con la app de uniformidad

Los dos proyectos de Supabase ya existen y los usa la app de uniformidad. Reutilizarlos es lo
correcto —el plan gratuito solo permite dos proyectos activos por organización, así que crear otros
dos no es una opción— pero convivir en la misma base de datos trae tres problemas que hay que
resolver **antes de la primera migración**, no después.

**1. Historial de migraciones compartido.** El CLI de Supabase guarda las migraciones aplicadas en
`supabase_migrations.schema_migrations`, una tabla por base de datos. Si dos repositorios distintos
ejecutan `supabase db push` contra el mismo proyecto, cada uno verá las migraciones del otro como
desconocidas y puede intentar repararlas o negarse a continuar.

> **Solución adoptada:** este proyecto **no usa `supabase db push`**. Las migraciones se aplican con
> `psql` desde CI, contra un historial propio en `hidrantes.migraciones_aplicadas` (nombre de
> archivo, hash del contenido, fecha). Un script `scripts/migrar.ts` lee `supabase/migrations/`,
> compara con esa tabla, aplica en orden lo que falte dentro de una transacción y aborta si el hash
> de una migración ya aplicada ha cambiado. La app de uniformidad sigue con su flujo intacto y
> ninguno de los dos pisa al otro.

**2. `app_users` es de la app de uniformidad.** Reutilizar la lista de personas es lo que queremos,
pero tal cual está, **cualquier administrador de la app de uniformidad se convertiría
automáticamente en administrador de hidrantes**, que no es lo que nadie ha decidido. Y añadirle una
columna desde este repositorio crearía *drift* en el esquema `public`, que gestiona el otro proyecto.

> **Solución adoptada:** tabla propia **`hidrantes.administradores`** (`email`, `activo`,
> `creado_en`, `creado_por`). `fn_es_admin()` comprueba que el email del JWT está ahí y activo. El
> esquema `public` no se toca. El panel de Ajustes muestra los correos de `public.app_users` como
> sugerencia al añadir uno (solo lectura), de modo que la lista de personas sigue siendo una sola
> pero cada módulo decide sus permisos. El propietario se inserta en la migración inicial.

**3. PostGIS se habilita para toda la instancia.** `create extension postgis` afecta al proyecto
entero, no solo al esquema `hidrantes`.

> **Solución adoptada:** habilitarlo primero en **dev**, comprobar que la app de uniformidad sigue
> funcionando con normalidad, y solo entonces en prod. Es una extensión estándar y el riesgo es bajo,
> pero se verifica en vez de suponerlo.

### Consumo del plan gratuito

Merece una cuenta explícita, porque el proyecto se comparte con otra aplicación:

| Recurso | Límite gratuito | Estimación de este módulo |
|---|---|---|
| Base de datos | 500 MB | Muy holgado: 1.000 puntos con su auditoría no llegan a 20 MB |
| Storage | 1 GB | Es el recurso crítico. A ~250 kB por foto comprimida, 1.000 puntos con foto ≈ 250 MB, más las fotos de propuestas pendientes |
| Transferencia | 5 GB/mes | Las teselas del mapa vienen de OSM/IGN, no de Supabase; solo cuentan fotos y datos |

Medidas ya incluidas en el plan: compresión a ≤1600 px antes de subir, subida solo con URL firmada y
cuota diaria por dispositivo (nadie ajeno puede consumir la cuota), purga de fotos huérfanas, y un
indicador de consumo en el panel de salud (Fase 7). **Si el uso se acercara al límite**, la
primera palanca es reducir la calidad de compresión; la segunda, mover las fotos a Cloudflare R2
(también con nivel gratuito). No hace falta decidirlo ahora, pero sí no atarse: el campo se llama
`foto_path` y no `foto_url`, precisamente para poder cambiar de proveedor sin migrar datos.

### Reglas de entorno

- **Las migraciones son las mismas y en el mismo orden.** Producción nunca recibe una migración que
  no haya pasado antes por staging. Lo garantiza el flujo de ramas: nada llega a `main` sin pasar
  por `develop`.
- **El *seed* es un archivo aparte** (`supabase/seed-staging.sql`), y la CI de producción no lo
  ejecuta nunca. Debe fallar el despliegue si alguien lo intenta.
- **Cada punto ficticio del seed lleva `descripcion` con el prefijo `[PRUEBA]`**, de modo que si
  alguna vez apareciera uno en producción se detecta a simple vista.
- **Las *preview deployments* de Cloudflare** (una URL por Pull Request, gratis) apuntan siempre a
  Supabase **dev**. Nunca a prod.
- **Los secretos viven en tres sitios y solo en tres sitios:** GitHub Environments (`staging` y
  `production`), y las variables de entorno de cada proyecto de Cloudflare Pages. Ningún `.env`
  committeado; `.env.example` sí, con los nombres y sin valores. Los carga `scripts/arranque.ts`
  (Fase 0). La lista completa, para que no falte ninguno el día del primer despliegue:

  | Dónde | Secreto | Para qué |
  |---|---|---|
  | GitHub (ambos entornos) | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | desplegar a Pages y configurar variables |
  | GitHub (por entorno) | `SUPABASE_DB_URL` | `psql` para `migrar.ts`, `cargar-zona.ts` y `pg_dump`. **Cadena del pooler de Supavisor en modo sesión (puerto 5432)**: los runners de GitHub no tienen IPv6 y la conexión directa no funciona |
  | GitHub (por entorno) | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | purga de fotos, respaldo del bucket, `promover-piloto.ts` |
  | GitHub (production) | `GPG_PUBLIC_KEY` | cifrar el respaldo. La clave privada **no** está en GitHub: se imprime una vez en el arranque y va al sobre o al gestor de contraseñas |
  | Cloudflare Pages (por proyecto, cifradas) | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SAL_IP`, `GITHUB_DISPATCH_TOKEN`, `NOMINATIM_USER_AGENT` | las cuatro *Pages Functions* |
  | Cloudflare Pages (variables públicas) | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_ENTORNO`, `VITE_MAPABASE_URL` | el frontend |

### Marcha atrás

Un despliegue que sale mal a las nueve de la noche necesita una salida ensayada, no improvisada:

- **Frontend:** Cloudflare Pages conserva todos los despliegues anteriores; volver a uno es
  inmediato y sin reconstruir. `scripts/revertir.ts` lo hace por CLI, para no depender de encontrar
  el botón en el panel.
- **Base de datos: migraciones solo hacia adelante.** Nunca se edita ni se borra una migración ya
  aplicada; un error se corrige con una migración nueva que lo deshace. Por eso `migrar.ts`
  comprueba el hash: si alguien modifica un archivo ya aplicado, el despliegue falla en vez de
  dejar los dos entornos desincronizados en silencio.
- **Regla de compatibilidad:** toda migración debe funcionar con la versión de frontend anterior
  durante unos minutos, porque la base de datos se actualiza antes que el navegador de la gente. En
  la práctica: añadir columnas y valores de enum sí; renombrar o eliminar, en dos pasos separados
  por un despliegue.
- **`docs/emergencias.md`** con los tres procedimientos escritos: revertir el frontend, revertir una
  migración y restaurar un respaldo.

---

## Modelo de delegación

### Lo que hace Claude Code (prácticamente todo)

Código, migraciones, scripts, tests, CI/CD, documentación, generación del límite municipal y del
mapa base, creación del repositorio y de los dos proyectos de Cloudflare Pages **por CLI**,
configuración de ramas, *environments* y secretos de GitHub por CLI, configuración de Supabase por
**Management API** (esquema expuesto en PostgREST, bucket, URL de redirección de Google Auth),
aplicación de migraciones a ambos entornos por CI, generación del código de acceso real, capturas de
pantalla para el manual del voluntario (con Playwright), checklist de aceptación y promoción de los
datos del piloto a producción.

Todo eso arranca con **un solo comando**: `npm run arranque` (`scripts/arranque.ts`), que se apoya
en las sesiones que el desarrollador ya tiene abiertas por la app de uniformidad (`gh auth`,
`supabase login`, `wrangler login`). El script es idempotente y se puede relanzar.

### Lo que tiene que hacer el desarrollador

| Cuándo | Qué | Tiempo |
|---|---|---|
| **Una vez, al arrancar** | Crear en el panel de Cloudflare un token de API con permiso *Cloudflare Pages: Edit* (es lo único de Cloudflare que no se puede crear por CLI) y pegarlo cuando `npm run arranque` lo pida, junto con la **contraseña de la base de datos** de dev y de prod (la tiene por la app de uniformidad; la Management API no la devuelve). El script hace el resto. | 10 min |
| **Fase 1** | Abrir `datos/zona-cobertura.html` (lo genera el script) y confirmar de un vistazo que el límite cubre Albolote y Calicasas. El test automático ya comprueba diez coordenadas; esto es una segunda mirada. | 3 min |
| **Fase 5** | Abrir staging en su propio móvil, a la luz del día, y decir si los cinco tamaños se distinguen. Si no, cambiar los radios en Ajustes — sin desplegar. | 10 min |
| **Fase 9** | Aprobar el despliegue a producción y, después, el workflow de promoción del piloto: dos clics en GitHub. | 2 min |
| **Después del lanzamiento, sin prisa** | Crear la cuenta de Google institucional y pasarle la propiedad de GitHub, Cloudflare y Supabase siguiendo `docs/continuidad.md` clic a clic. Es lo único que no se puede automatizar porque exige verificación humana. | 45 min |

**Total: unas dos horas de trabajo del desarrollador en todo el proyecto**, casi todas en el
arranque y en la continuidad. Todo lo demás lo ejecuta Claude Code o CI.

### Lo que hace jefatura (no el desarrollador)

Recorrer la matriz de aceptación en la calle con 2–3 voluntarios (media jornada), generar el código
del piloto desde Ajustes, aprobar el fin del piloto, comunicar el código real al grupo y dar la sesión
presencial de 20 minutos. Todo con documentos que Claude Code deja escritos. El desarrollador no tiene
que estar presente.

Si en algún momento un paso exige acceso manual a un panel web, **es un defecto de este plan**: hay
que sustituirlo por un script y anotarlo en `docs/decisiones.md`. Las tres excepciones conocidas
—crear el token de Cloudflare, teclear la contraseña de la base de datos y crear una cuenta de
Google— están arriba y no hay forma de evitarlas.

---

## Fase 0 · Repositorio, entornos y automatización de despliegue

**Objetivo:** repo que compila, con los **dos** entornos funcionando de punta a punta, creado con
un solo comando. No se escribe lógica hasta que un commit en `develop` aparezca solo en staging y un
commit en `main` solo en producción.

- [ ] **`scripts/arranque.ts`** (`npm run arranque`), idempotente. Por orden:
  1. Comprueba las sesiones locales (`gh auth status`, `supabase projects list`, `wrangler whoami`) y
     se detiene con el comando exacto de login si falta alguna. Pide de forma interactiva lo único que
     no puede obtener: el token de API de Cloudflare y las dos contraseñas de base de datos.
  2. Crea el repo privado `hidrantes-albolote` con `gh repo create`, las ramas `main` y `develop`,
     la protección de `main` (solo PR, CI verde obligatoria) y los *environments* `staging` y
     `production` (este último con *required reviewers* = el propietario), todo por `gh api`.
  3. Localiza los dos proyectos de Supabase por nombre con la Management API y obtiene sus
     `PROJECT_REF`, `anon key` y `service_role key` (`GET /v1/projects/{ref}/api-keys`). Construye la
     cadena del pooler con la contraseña tecleada.
  4. Configura Supabase por Management API, en dev y prod: añade `hidrantes` a los esquemas expuestos
     de PostgREST (`PATCH /v1/projects/{ref}/postgrest`), añade las URL de Pages a la lista de
     redirección de Auth (`PATCH /v1/projects/{ref}/config/auth`, campo `uri_allow_list`) y crea el
     bucket con límite de 5 MB y `mime` restringido (API de Storage con `service_role`).
  5. Crea los dos proyectos de Cloudflare Pages con Wrangler, les asigna rama de producción y carga
     sus variables y secretos. Crea el bucket R2 del mapa base solo si hace falta (Fase 5).
  6. Genera el par de claves GPG del respaldo, sube la pública a GitHub y **muestra la privada una
     única vez** con la instrucción de guardarla en el sobre o el gestor de contraseñas.
  7. Crea el token de repositorio `GITHUB_DISPATCH_TOKEN` (permiso único `actions:write`) y sube
     todos los secretos con `gh secret set` (ver tabla en "Reglas de entorno").
  8. Escribe `docs/entornos.md` con lo que ha creado y dónde.
- [ ] Vite + React + TS + Tailwind + shadcn/ui. Prettier + ESLint.
- [ ] Estructura:
  ```
  src/{componentes,paginas,lib,hooks,tipos}
  scripts/           # arranque.ts, migrar.ts, generar-zona.ts, cargar-zona.ts,
                     # generar-mapabase.ts, generar-codigo.ts, revertir.ts,
                     # promover-piloto.ts, capturas.ts
  functions/api/     # Pages Functions: verificar-codigo, url-subida, direccion, lanzar-purga
  supabase/migrations/
  supabase/seed-staging.sql
  datos/             # geojson, pmtiles y previsualización html (generados)
  docs/
  e2e/               # Playwright
  ```
- [ ] `.github/workflows/ci.yml` — en cada push y PR: `typecheck`, `lint`, `build`, tests unitarios,
      tests SQL (pgTAP) y Playwright, **todos contra una instancia local de Supabase levantada en el
      propio runner** (`supabase start`) y con las *Pages Functions* servidas por `wrangler pages dev`.
      Ni los tests SQL ni los e2e tocan nunca el proyecto dev compartido: dos ramas trabajando a la
      vez se pisarían los datos, y un test que borra algo en una base compartida con la app de
      uniformidad es un accidente esperando a ocurrir.
- [ ] `.github/workflows/deploy-staging.yml` — al mergear en `develop`: `npm run migrar` contra
      Supabase **dev** (vía `SUPABASE_DB_URL` del pooler), `npm run cargar-zona`, `seed-staging.sql`
      (idempotente, `on conflict do nothing`: nunca pisa datos del piloto), y despliegue a Pages
      staging. **Nunca `supabase db push`** — ver "Infraestructura compartida".
- [ ] `.github/workflows/deploy-prod.yml` — al mergear en `main`: *environment* `production` con
      aprobación manual, `npm run migrar` y `npm run cargar-zona` contra Supabase **prod**, **no**
      ejecuta el seed, y despliega a Pages producción. En el primer despliegue genera el código de
      acceso real y lo deja en el *summary* del workflow.
- [ ] Guarda de seguridad en el workflow de producción: abortar si el nombre del archivo de seed
      aparece en el comando, o si `PROJECT_REF` no coincide con el esperado.
- [ ] Banda "ENTORNO DE PRUEBAS" condicionada a `VITE_ENTORNO=staging`, y `noindex` en staging.
- [ ] `docs/PRD.md`: **enlaza** a `requisitos-hidrantes.html`, que se copia al repo tal cual y sigue
      siendo la fuente de verdad funcional. El markdown recoge solo lo que Claude Code necesita
      consultar rápido (enums, reglas de validación, regla de simbología). Duplicar el documento
      entero garantiza que las dos copias se separen en tres semanas.
- [ ] `docs/entornos.md`: qué hay en cada entorno, qué secreto va dónde, cómo promover de staging a
      producción.

**Criterio de salida:** `npm run arranque` termina sin más pasos manuales que los tres pegados; un
commit trivial en `develop` aparece **solo** en staging con su banda naranja; un PR a `main`, tras
aprobación, aparece **solo** en producción. Verificado en ambos sentidos.

---

## Fase 1 · Zona de cobertura (automatizada)

**Objetivo:** límite municipal generado por script, sin descargas manuales. Va primero porque la
deducción de municipio/núcleo es dependencia del esquema.

- [ ] `scripts/generar-zona.ts`, ejecutable con `npm run zona`:
  1. Consulta la **API de Overpass** (`https://overpass-api.de/api/interpreter`) pidiendo las
     relaciones `admin_level=8` de Albolote y Calicasas. Filtrar por código INE (`ine:municipio`
     = `18009` para Albolote) cuando esté presente, para no depender del nombre.
  2. Convierte a GeoJSON (`osmtogeojson`), simplifica (`turf.simplify`, tolerancia ~0.0002),
     une ambos polígonos (`turf.union`) y aplica buffer de **400 m** (`turf.buffer`).
  3. Escribe `datos/zona-cobertura.geojson` (con buffer, para los avisos del cliente) y
     `datos/limite-municipal.geojson` (exacto, para deducir municipio en BD).
  4. Escribe los núcleos como puntos etiquetados (`place=village|hamlet|suburb|neighbourhood`
     dentro del término) en `datos/nucleos.geojson`.
  5. Escribe `datos/meta.json` con la fecha de generación y las versiones de las relaciones OSM
     usadas, para poder detectar después si el origen cambió.
  6. Escribe `datos/zona-cobertura.html`: una página estática con Leaflet que dibuja los dos
     polígonos y los núcleos sobre OSM, para la comprobación visual de tres minutos del desarrollador.
- [ ] Manejo de fallos: reintentar con mirror (`https://overpass.kumi.systems/api/interpreter`) antes
      de fallar; aceptar `--endpoint` por argumento.
- [ ] **Respaldo documentado:** si `admin_level=8` de Calicasas no estuviera completo en OSM, usar la
      capa de límites del IECA por WFS. El script debe traer una función alternativa ya escrita y
      seleccionable con `--fuente=ieca`, no dejarlo como tarea futura.
- [ ] Committear los GeoJSON generados: el build nunca depende de un servicio externo en vivo.
- [ ] Todo punto fuera de `limite-municipal.geojson` recibe `municipio = 'fuera_de_zona'` y
      `nucleo = null` en la BD (Fase 3, `fn_municipio_de`). La app avisa al voluntario pero le deja
      continuar (apoyos a otras agrupaciones); jefatura lo ve como señal en la cola.
- [ ] `docs/zona-cobertura.md`: cómo se regenera y cuándo.

**Criterio de salida:** `npm run zona` es idempotente, y un test comprueba diez coordenadas —una por
núcleo, más el Polígono Industrial Juncaril— que devuelven el núcleo esperado, y que un punto en
Granada capital queda fuera.

---

## Fase 2 · Esquema de base de datos

**Objetivo:** esquema `hidrantes` aplicado en staging por CI, con RLS y datos de arranque.

### Enums

```
tipo_punto            : hidrante | boca_riego
estado_caudal         : bueno | regular | malo | no_funciona   -- "No funciona" en la UI
tipo_racor            : granada | barcelona | otro
operacion             : alta | revision | estado | datos | ubicacion | retirada
estado_moderacion     : pendiente | aprobada | rechazada | retirada_por_autor
situacion_punto       : activo | retirado | borrado
origen_ubicacion      : gps | manual
```

`diametro_mm` se modela como `smallint` con constraint, no como enum.

### Tablas

**`puntos`** — estado actual aprobado.
`id`, `codigo` (`HID-####` / `BOC-####`, único), `tipo`, `geom geography(Point,4326)`,
`diametro_mm`, `caudal`, `racor`, `descripcion_fallo`, `descripcion`, **`direccion`** (deducida por
reverse geocoding al revisar, corregible por jefatura, puede ser nula), `foto_path`, `municipio`
(`albolote` | `calicasas` | `fuera_de_zona`), `nucleo`, `situacion`, `fecha_ultima_revision`,
`creado_en`, `actualizado_en`, `borrado_en`.

- Constraint: `tipo = 'boca_riego'` ⇒ `diametro_mm = 45`.
- Constraint: `tipo = 'hidrante'` ⇒ `diametro_mm IN (70,100)`.

> **`diametro_mm` es el diámetro de la salida, no el DN del cuerpo.** Los hidrantes se fabrican en
> DN80, DN100 y DN150; el DN80 lleva dos salidas de 45 mm y una de 70 mm, y el DN100 y el DN150 dos
> de 70 mm y una de 100 mm. Como se registra siempre la salida mayor, 70 y 100 cubren todos los
> hidrantes existentes, y los 45 mm de un DN80 nunca son la mayor, así que no chocan con la regla de
> las bocas de riego. La boca de riego es DN40 de cuerpo con racor de 45 mm: el 45 que se guarda es
> el racor. Nombrar el campo "diámetro" a secas invitaría a anotar el DN de la brida; la etiqueta en
> la interfaz debe decir **"diámetro de la salida mayor"**.
- Constraint: `tipo = 'boca_riego'` ⇒ `racor IS NOT NULL`; `tipo = 'hidrante'` ⇒ `racor IS NULL`.

> **El racor solo se pregunta en bocas de riego.** Comprobado con especificaciones de fabricante: los
> hidrantes españoles se suministran con racor Barcelona según UNE 23400, el estándar obligatorio
> para material contra incendios. Granada, Madrid y Zaragoza son estándares **municipales de bocas de
> riego** y no existen como variante de hidrante, así que ofrecer esa lista en un hidrante sería
> presentar opciones que nunca aplican — lo que invita a rellenarlas mal. (Matiz anotado por si
> apareciera más adelante: la salida central de 100 mm de algunos hidrantes no lleva racor sino rosca
> con tapón tipo Bombero, y bajo pedido existen acoples Storz o Guillemin. Ninguna de las dos cosas es
> una observación de campo para un voluntario, así que quedan fuera del alcance.)
- Constraint: `caudal = 'no_funciona'` ⇒ `descripcion_fallo IS NOT NULL` y no vacía.
- Constraint: `foto_path IS NOT NULL` — la foto es obligatoria en todo punto aprobado.
- Constraint: `geom` dentro de un rectángulo amplio en torno a la provincia de Granada (defensa
  contra coordenadas corruptas, no contra puntos fuera de zona).
- Índice GIST sobre `geom`. Índice sobre `actualizado_en` (sincronización incremental).

**`propuestas`** — cola de moderación.
`id`, `punto_id` (nulo si es alta), `operacion`, `datos jsonb` (solo los campos que cambian),
`autor_nombre`, `autor_apellido`, **`dispositivo_id uuid`**, **`clave_local text`**,
`origen_ubicacion`, `geom`, `gps_geom`, **`precision_gps_m`** (el `accuracy` de la API de
geolocalización), **`exif_geom`** (coordenadas EXIF de la foto, si las tenía, leídas antes de
borrarlas), `distancia_gps_m`, **`direccion_sugerida`** (la rellena la *Pages Function* al abrir la
propuesta en el panel), `foto_path`, `estado`, `motivo_rechazo`, `revisada_por`, `revisada_en`,
`creada_en`.

- **Índice único sobre `clave_local`** — es la clave de idempotencia que genera el móvil. Un reenvío
  de la cola offline no puede crear una segunda propuesta.
- Índice sobre `dispositivo_id` para "Mis propuestas".
- Los duplicados se buscan **entre puntos activos del mismo tipo** a menos de `radio_duplicado_m`,
  como fija el documento de requisitos: un hidrante junto a una boca de riego no es duplicado.

**`registro`** — auditoría *append-only*.
`id`, `momento`, `actor` (nombre+apellido o email), **`dispositivo_id`** (nulo si es admin),
`es_admin`, `accion`, `punto_id`, `propuesta_id`, `antes jsonb`, `despues jsonb`.

> `dispositivo_id` en `registro` es lo que permite atender una petición de supresión sin ambigüedad:
> con 65 personas hay nombres repetidos, y anonimizar "por nombre" borraría a quien no lo pidió.

**`intentos_codigo`** — control de fuerza bruta.
`id`, `dispositivo_id`, `ip_hash`, `momento`, `exito`. Purga de lo anterior a 24 h con `pg_cron`
(ver "Tareas programadas").

**`dispositivos`** — dispositivos que ya validaron el código alguna vez.
`id`, `dispositivo_id`, `token_hash` (SHA-256 del token aleatorio de 32 bytes que emite el
servidor; el token en claro solo lo tiene el móvil), `emitido_en`, `ultimo_uso`, `revocado_en`. Ver
más abajo.

**`errores_cliente`** — telemetría mínima.
`id`, `momento`, `dispositivo_id`, `mensaje`, `pila`, `ruta`, `agente`. Sin datos de usuario más allá
del `dispositivo_id`.

**`subidas`** — reservas de subida de foto.
`id`, `dispositivo_id`, `foto_path`, `reservada_en`, `confirmada_en`. La *Pages Function* de subida
crea una fila por URL firmada emitida; sirve para la cuota diaria por dispositivo, para que
`fn_proponer` compruebe que el `foto_path` es de quien lo envía, y para que la purga de huérfanas no
borre una foto reservada hace cinco minutos que aún está subiendo.

**`incidencias_app`** — "algo no funciona".
`id`, `momento`, `dispositivo_id`, `descripcion`, `version_app`, `ruta`, `estado` (`abierta` |
`resuelta`), `resuelta_por`, `resuelta_en`.

**`administradores`** — quién puede entrar al panel. `email` (único), `activo`, `creado_en`,
`creado_por`. Ver "Infraestructura compartida".

**`config`** — clave/valor: `codigo_acceso_hash`, `codigo_acceso_cambiado_en`, `meses_revision` (12),
`radio_duplicado_m` (25), `buffer_zona_m` (400), `dias_papelera` (30),
`max_intentos_dispositivo` (10/h), `max_intentos_ip` (30/h), `max_intentos_global` (200/h),
`dias_caducidad_token` (365), `max_subidas_dispositivo_dia` (40), `escala_radios` (los cinco radios
de la simbología). La sal de las IP (`SAL_IP`) **no** está en la base de datos: vive en las variables
de la *Pages Function*, que es la única pieza que ve IPs.

**`limite_municipal`** y **`nucleos`** — geometrías importadas de los GeoJSON de la Fase 1, para el
cruce punto → municipio/núcleo en BD. Las carga `scripts/cargar-zona.ts` (`npm run cargar-zona`)
desde CI tras las migraciones, con `upsert` idempotente. **No por migración**: si fueran migraciones,
regenerar el límite obligaría a escribir un archivo nuevo cada vez, y acabaríamos con diez
migraciones que solo cambian un polígono.

### Protección del código de acceso

Jefatura ha fijado **6 dígitos**, que son un millón de combinaciones. Eso es poco si el atacante
puede probar sin límite, así que la protección se apoya en tres piezas, y conviene entender por qué
no basta con la primera.

**1. Límite por dispositivo: útil pero insuficiente.** El `dispositivo_id` lo genera el propio móvil,
así que quien quiera probar códigos genera un uuid nuevo en cada intento y el contador nunca sube.

**2. Límite por IP: no se puede confiar en la cabecera.** La documentación de Supabase propone leer
`x-forwarded-for` desde `current_setting('request.headers')`, pero **esa cabecera la puede falsificar
el cliente**: basta enviarla a mano en la petición. Cualquier límite construido sobre ella es
decorativo.

> **Solución adoptada:** la validación del código **no llega directamente a Supabase**. Pasa por una
> *Pages Function* de Cloudflare (gratuita, en el mismo despliegue), que sí ve la IP real en
> `CF-Connecting-IP` —una cabecera que Cloudflare impone y el cliente no puede alterar— y aplica ahí
> el límite por IP antes de llamar a la RPC. Es la única capa de la arquitectura que conoce la IP de
> verdad.

**3. Techo global, como última red.** Un máximo de intentos fallidos en todo el sistema por hora
(configurable, 200 por defecto), que ningún cambio de identidad esquiva. A ese ritmo, recorrer el
millón de combinaciones llevaría años, y el panel de salud avisa mucho antes.

**4. Token de dispositivo, para que el límite no moleste a quien sí debe entrar.** Al validar
correctamente por primera vez, el servidor emite un token aleatorio que el móvil guarda y envía en
adelante. Las llamadas siguientes se autorizan con ese token, no con el código. Dos consecuencias
buenas: los 65 voluntarios dejan de tocar el sistema de intentos tras su primer acceso, y activar el
techo global **no deja a nadie fuera**, porque los que ya entraron no pasan por ahí. Sin esta pieza,
el techo global sería un botón de denegación de servicio al alcance de cualquiera.

**5. Que nadie salte la Pages Function.** Si `anon` pudiera ejecutar `fn_verificar_codigo`
directamente, bastaría con inventarse el `ip_hash` y todo lo anterior sería decorativo. Por eso
`fn_verificar_codigo` **no tiene `execute` para `anon` ni para `authenticated`**: solo la ejecuta la
*Pages Function* con la `service_role key`, que vive en las variables cifradas de Cloudflare y nunca
llega al navegador. Un test pgTAP comprueba que la llamada desde `anon` falla con *permission denied*.

Al cambiar el código desde Ajustes, jefatura elige si **revocar todos los tokens** (todos vuelven a
introducir el código) o solo impedir accesos nuevos. El primer caso es el que se usa si se sospecha
que el código se ha filtrado.

### Secuencias

`seq_codigo_hidrante` y `seq_codigo_boca`, para que `fn_siguiente_codigo` sea segura ante
concurrencia. **No** calcular el siguiente código con `max(codigo)+1`: dos altas aprobadas a la vez
producirían el mismo código.

### Vistas (`security_invoker`)

- `v_puntos_activos` — lo que ve el mapa: `situacion = 'activo'`, con `tamano_marcador` y
  `revision_caducada` ya calculados (ver Fase 5).
- `v_cola_revision` — propuestas pendientes con los datos del punto afectado, el diff y las señales
  de fiabilidad (origen GPS, distancia, foto, duplicado cercano, meses desde la última revisión).
- `v_revisiones_caducadas` — puntos con `fecha_ultima_revision < now() - meses_revision`.
- `v_registro` — auditoría legible.

### RLS

- `anon`: **ningún** acceso directo a tablas ni vistas. Solo `execute` sobre las RPC de voluntario.
- `authenticated`: `select` sobre las tablas base **condicionado por una política que llama a
  `fn_es_admin()`**, y `execute` sobre las RPC de administrador. Conviene ser explícito porque las
  vistas llevan `security_invoker`: eso significa que se evalúan con los permisos de quien consulta,
  así que una vista sin política en su tabla base no devuelve nada y parece un error de la vista
  cuando en realidad falta la política.
- `registro`: `insert` solo desde RPC; sin `update` ni `delete` para nadie, nunca, con un trigger
  `BEFORE UPDATE OR DELETE` que lanza excepción además de la política. Dos capas, porque una política
  mal escrita es un error silencioso y un trigger no lo es.
- Cada tabla con RLS activado debe tener al menos una política. Un `enable row level security` sin
  políticas bloquea todo, incluidas las RPC `SECURITY DEFINER` mal declaradas: verificar en los tests
  de la Fase 3 que cada RPC funciona con el rol previsto.

### Storage

Bucket por entorno. **Ninguna política de escritura para `anon`**: la única forma de subir una foto
es una URL firmada.

- **Flujo de subida.** El móvil llama a `/api/url-subida` con su token de dispositivo. La *Pages
  Function* ejecuta `fn_reservar_subida(token)` (con `service_role`), que valida el token, comprueba
  la cuota diaria (`max_subidas_dispositivo_dia`, 40), inserta una fila en `subidas` y devuelve un
  `foto_path` aleatorio `fotos/<uuid>.jpg`. La Function crea con la API de Storage una
  `createSignedUploadUrl` para ese path exacto (válida 2 h) y la devuelve. El móvil hace `PUT` del
  blob a esa URL. Nadie elige el nombre del archivo ni sube sin cuota.
- **Límites del bucket** (los fija `arranque.ts`): 5 MB por archivo, `mime` `image/jpeg` e
  `image/webp`. Sin `list`, `update` ni `delete` para nadie que no sea `service_role`.
- **Lectura pública.** Las URL son uuid y no se enumeran; el objeto de la foto es un hidrante, no
  una persona, y `docs/instalacion.md` lo dice. La alternativa —URL firmadas de lectura— rompería la
  caché offline de fichas, así que se descarta a sabiendas.
- **Las fotos no se mueven al aprobar.** Una función SQL no puede copiar archivos entre prefijos:
  Storage guarda los bytes fuera de Postgres y solo los metadatos en `storage.objects`. Al aprobar,
  `puntos.foto_path` pasa a apuntar al mismo archivo que ya subió el voluntario; lo que cambia es
  quién lo referencia, no dónde está. Cualquier plan que diga "la RPC copia la foto" es un plan que
  no se puede implementar.
- **Purga de huérfanas:** `.github/workflows/purgar-fotos.yml`, semanal, usa la `service_role key`:
  llama a `fn_fotos_referenciadas()` (devuelve los paths presentes en `puntos.foto_path`, en
  cualquier propuesta pendiente o aprobada, y en `subidas` reservadas hace menos de 24 h), lista el
  bucket y borra lo que no esté en esa lista. Se hace fuera de la base de datos porque borrar filas
  de `storage.objects` no elimina los bytes. **Desde Ajustes** se lanza el mismo workflow: el panel
  llama a `/api/lanzar-purga`, la *Pages Function* comprueba que el JWT es de administrador y hace
  un `repository_dispatch` en GitHub con `GITHUB_DISPATCH_TOKEN` (permiso único `actions:write`, que
  nunca llega al navegador).
- Una foto referenciada por un punto **nunca** se borra aunque su propuesta original se rechazara
  después: la comprobación es por referencia, no por estado de la propuesta.

### Tareas programadas (`pg_cron`)

`pg_cron` está disponible en Supabase y se habilita por migración. Cuatro trabajos, todos en el
esquema `hidrantes` y todos idempotentes: purgar `intentos_codigo` > 24 h (cada hora), purgar la
papelera pasado `dias_papelera` (diario), borrar `errores_cliente` > 90 días (diario) y revocar
tokens de dispositivo sin uso en `dias_caducidad_token` (diario). Lo que necesita `service_role`
fuera de la base de datos (fotos, respaldo) va por GitHub Actions; lo que es puro SQL, por `pg_cron`.
Ninguna purga depende de que alguien la lance a mano.

### Seed (solo staging)

- `config` con código de acceso `000000` y los parámetros por defecto, con `on conflict do
  nothing`: si jefatura generó un código real para el piloto, el siguiente despliegue no lo pisa.
- 12 puntos ficticios repartidos por los núcleos, todos con `descripcion` prefijada `[PRUEBA]`.
- En producción, `puntos` **arranca vacía**.

**Criterio de salida:** CI aplica las migraciones a staging desde una base limpia; los constraints
rechazan una boca de riego de 70 mm, una boca de riego sin racor, un hidrante **con** racor, un
punto sin foto y un `no_funciona` sin descripción; una subida al bucket con la `anon key` es
rechazada; dos inserciones concurrentes obtienen códigos distintos.

---

## Fase 3 · Funciones RPC

**Objetivo:** toda la lógica de escritura en BD, probada, antes de tocar la UI.

### Voluntario (validan el token de dispositivo en cada llamada)

| Función | Qué hace |
|---|---|
| `fn_verificar_codigo(codigo, dispositivo_id, ip_hash)` | **Sin `execute` para `anon`**: solo la llama la *Pages Function* `/api/verificar-codigo` con `service_role`, aportando el `ip_hash` de la IP real. Registra el intento, comprueba los tres límites y, si el código es correcto, **emite el token de dispositivo** y guarda su hash. Tiempo de respuesta constante, para no filtrar información por la duración. |
| `fn_validar_token(token)` | Helper interno que ejecutan todas las demás RPC de voluntario al empezar: busca el hash, comprueba que no está revocado ni caducado, actualiza `ultimo_uso` y devuelve el `dispositivo_id`. El código de acceso **no vuelve a viajar** después del primer canje. |
| `fn_listar_puntos(token, desde timestamptz DEFAULT NULL)` | Devuelve `v_puntos_activos` (incluida `direccion`). Si `desde` viene, solo lo modificado después: sincronización incremental. Incluye la lista de ids retirados o borrados para que el cliente los elimine de su caché. |
| `fn_ficha_punto(token, punto_id)` | Ficha sin historial ni nombres de autores. |
| `fn_reservar_subida(token)` | Solo `service_role` (la llama `/api/url-subida`). Valida el token, aplica la cuota diaria, inserta en `subidas` y devuelve el `foto_path` para el que la Function emitirá la URL firmada. |
| `fn_proponer(token, clave_local, autor_nombre, autor_apellido, operacion, punto_id, datos, origen, lat, lng, gps_lat, gps_lng, precision_gps_m, exif_lat, exif_lng, foto_path)` | Valida el payload según `operacion`, comprueba que `foto_path` fue reservado por este dispositivo, calcula `distancia_gps_m` y el duplicado más cercano **del mismo tipo**, inserta en `propuestas` y escribe en `registro`. **Si `clave_local` ya existe, devuelve la propuesta existente sin crear otra.** Si quien llama es un administrador autenticado con Google (JWT de `authenticated` + `fn_es_admin()`), **aplica el cambio al momento** vía `fn_aprobar` y lo registra como acción de administrador: es el "se aplica al momento" del documento de requisitos. |
| `fn_mis_propuestas(token)` | Propuestas de **ese dispositivo**, con estado, motivo de rechazo y fecha de revisión. Nunca por nombre. |
| `fn_retirar_propuesta(token, propuesta_id)` | Solo si sigue `pendiente` y el dispositivo coincide. |
| `fn_reportar_incidencia(token, descripcion, version_app, ruta)` | Inserta en `incidencias_app`. Limitada a 5 por dispositivo y día. |
| `fn_registrar_error(dispositivo_id, mensaje, pila, ruta, agente)` | Inserta en `errores_cliente`. Es la única RPC anónima sin token, porque un error puede ocurrir antes de validar: limitada por dispositivo, con techo global diario y `pila` truncada a 4 kB; sin techo sería un canal abierto para llenar la base de datos. |

No hay RPC de voluntario para "puntos cercanos": el duplicado se calcula dentro de `fn_proponer` y
solo lo ve jefatura, como fija el documento de requisitos. Exponerlo al móvil sería filtrar una señal
que el voluntario no debe recibir en campo.

### Jefatura (validan pertenencia a `administradores`)

| Función | Qué hace |
|---|---|
| `fn_aprobar(propuesta_id, correcciones jsonb DEFAULT NULL, confirmar_desactualizada boolean DEFAULT false)` | Aplica la propuesta a `puntos` (crea o actualiza), fusionando `correcciones`. Deduce municipio y núcleo. Guarda `direccion` (la que el panel obtuvo de `/api/direccion` y jefatura pudo corregir; si no llegó, queda nula y aparece en Salud del sistema como pendiente). Actualiza `fecha_ultima_revision`. **No copia la foto**: `puntos.foto_path` pasa a apuntar al archivo ya subido. Marca la propuesta `aprobada`. Escribe `registro` con antes/después. **Si `puntos.actualizado_en` es posterior a `propuestas.creada_en`, falla** salvo que se pase `confirmar_desactualizada`: el punto cambió después de que el voluntario hiciera su propuesta, así que el diff que ve jefatura está calculado sobre un estado que ya no existe. |
| `fn_aprobar_lote(propuesta_ids uuid[])` | Aprueba cada propuesta en su **propia** transacción y devuelve el resultado de cada una (aprobada / omitida y por qué). No es todo-o-nada: si de 20 revisiones una está desactualizada o su punto fue borrado, se aprueban las 19 restantes y el panel muestra la que quedó fuera. Un lote que falla entero por un caso raro obliga a jefatura a buscar el culpable a mano, que es justo lo que la aprobación en bloque venía a evitar. |
| `fn_rechazar(propuesta_id, motivo)` | `motivo` obligatorio y no vacío. |
| `fn_fusionar_con_existente(propuesta_id, punto_id)` | Convierte un alta duplicada en actualización del punto indicado. |
| **Casos límite, todos con mensaje explícito** | Aprobar una propuesta cuyo punto fue retirado o borrado entretanto; aprobar una ya aprobada o rechazada; fusionar con un punto de otro tipo; restaurar un punto pasado el plazo de papelera; aprobar un alta con "otra medida" de diámetro sin fijar 70 o 100 en `correcciones`. Las cinco fallan con un texto que dice qué ha pasado, no con un error genérico de base de datos. |
| `fn_retirar_punto(punto_id, motivo)` | `situacion = 'retirado'`. Sigue en el histórico. |
| `fn_borrar_punto(punto_id, motivo)` | `situacion = 'borrado'`, `borrado_en = now()`. Papelera. |
| `fn_restaurar_punto(punto_id)` | Solo dentro de `dias_papelera`. |
| `fn_purgar_papelera()` | Borra definitivamente lo que exceda el plazo. |
| `fn_fotos_referenciadas()` | Solo `service_role`. Devuelve los paths que **no** deben borrarse; la purga real la hace el workflow (ver Storage, Fase 2). |
| `fn_cambiar_codigo_acceso(nuevo, revocar_dispositivos boolean)` | Actualiza hash y fecha. Con `revocar_dispositivos = true` marca `revocado_en` en todos los tokens (todos vuelven a introducir el código); con `false`, solo impide accesos nuevos. Es la elección que el documento de requisitos deja a jefatura. |
| `fn_gestionar_administrador(email, activo)` | Alta/baja en `administradores`. Un administrador no puede desactivarse a sí mismo si es el último activo. |
| `fn_resolver_incidencia(incidencia_id)` | Marca `resuelta`. |
| `fn_actividad_voluntarios(meses)` | Propuestas por autor (nombre + apellido + `dispositivo_id`) en los últimos N meses, con tasa de aprobación. Solo para el panel. |
| `fn_anonimizar_autor(dispositivo_id)` | Sustituye nombre y apellido por "voluntario dado de baja" en `propuestas` y `registro` para ese dispositivo, conservando las filas. |
| `fn_exportar_inventario()` | Devuelve `puntos` en JSON para descarga manual desde Ajustes. **No es el mecanismo de respaldo** — ese va por `pg_dump` con `service_role` desde CI (Fase 8), porque un respaldo que depende de que alguien esté logueado con Google no es un respaldo. |

### Helpers internos

- `fn_municipio_de(geom)` → `(municipio, nucleo)` por cruce con `limite_municipal` y proximidad a
  `nucleos` (tope de 1.500 m; si no, `diseminado`). Fuera de todo límite: `('fuera_de_zona', null)`.
- `fn_siguiente_codigo(tipo)` → usa las secuencias de la Fase 2.
- `fn_es_admin()` → comprueba el email del JWT contra `administradores` (activo).
- `fn_validar_token(token)` → helper llamado al inicio de cada RPC de voluntario, para que la
  comprobación esté escrita una sola vez (ver tabla).

### Pages Functions (`functions/api/`)

Cuatro, en TypeScript, servidas por Cloudflare junto al frontend y probadas en CI con
`wrangler pages dev` contra la Supabase local:

| Ruta | Qué hace |
|---|---|
| `POST /api/verificar-codigo` | Lee `CF-Connecting-IP`, calcula `ip_hash = sha256(SAL_IP + ip)`, llama a `fn_verificar_codigo` con `service_role` y devuelve el token al móvil. |
| `POST /api/url-subida` | Recibe el token, llama a `fn_reservar_subida`, crea la URL firmada de subida para el `foto_path` devuelto y la entrega. |
| `GET /api/direccion?lat&lng&propuesta_id` | Solo con JWT de administrador (se reenvía a Supabase para `fn_es_admin()`). Consulta Nominatim (`reverse`, `zoom=18`) con `User-Agent` identificable y máximo una petición por segundo, guarda el resultado en `propuestas.direccion_sugerida` y lo devuelve. Si Nominatim no responde, devuelve vacío y el panel deja el campo editable en blanco; **nunca bloquea la aprobación**. |
| `POST /api/lanzar-purga` | Solo con JWT de administrador. `repository_dispatch` a `purgar-fotos.yml`. |

**Criterio de salida:** tests pgTAP ejecutados en CI que cubren: código erróneo rechazado; 11
intentos fallidos bloqueados; `fn_verificar_codigo` desde `anon` → *permission denied*; token
revocado rechazado; la reserva de subida número 41 del día rechazada; `foto_path` de otro dispositivo
rechazado en `fn_proponer`; alta → aprobación → punto visible con `direccion`; aprobación con
correcciones; rechazo sin motivo rechazado; no-admin no puede aprobar; administrador que llama a
`fn_proponer` ve el cambio aplicado sin cola; `registro` no admite `update`; **`clave_local`
repetida no duplica**; duplicado marcado solo si el tipo coincide; `fn_mis_propuestas` con otro token
no devuelve nada ajeno; `fn_cambiar_codigo_acceso(…, true)` deja todos los tokens revocados.

---

## Fase 4 · Acceso y armazón del frontend

**Objetivo:** aplicación que arranca, pide código y nombre, y navega entre pantallas vacías.

- [ ] Pantalla de entrada: código + nombre + apellido. Envía el código a `/api/verificar-codigo`
      (nunca a Supabase directamente) y recibe el token de dispositivo. Enlace discreto "¿Eres de
      jefatura? Entrar con Google".
- [ ] `dispositivo_id` uuid generado una sola vez y guardado localmente. Es la identidad técnica del
      móvil.
- [ ] Persistencia local: **token**, nombre, apellido y `dispositivo_id`. El código de acceso **no se
      guarda** en el móvil. Si el token deja de ser válido (jefatura revocó los dispositivos o
      caducó), se vuelve a pedir el código conservando el nombre.
- [ ] Mensaje claro cuando el bloqueo por intentos se activa ("demasiados intentos, prueba en una
      hora"), sin revelar si el código era casi correcto.
- [ ] Ajustes del voluntario: cambiar nombre, capa de mapa por defecto, cerrar sesión (borra todo lo
      local, incluida la cola pendiente, con confirmación explícita si hay envíos sin enviar).
- [ ] Login Google para jefatura **en la misma PWA**, con pantalla "No autorizado" si el correo no
      está en `administradores`. Un administrador ve el mapa igual que un voluntario, con una etiqueta
      "Jefatura" en la barra, y sus seis operaciones se aplican al momento (Fase 3, `fn_proponer`). El
      panel completo sigue en `/admin`.
- [ ] Armazón: navegación inferior (Mapa / Lista / Ajustes) y ruta `/admin`.
- [ ] PWA: `manifest.json`, iconos con el escudo, Service Worker con precache del armazón.
- [ ] **Estrategia de actualización del Service Worker:** `autoUpdate` con aviso visible ("hay una
      versión nueva, recargar") en lugar de activación silenciosa. Un móvil no puede quedarse
      atascado en una versión antigua sin saberlo.
- [ ] **Captura de errores global** (`window.onerror` y `unhandledrejection`) enviada a
      `fn_registrar_error`, con cola offline propia para no perder los errores que ocurran sin
      cobertura.
- [ ] **Primer uso:** tras entrar por primera vez, tres pantallas breves que expliquen qué es un
      punto, cómo se añade y que todo pasa por revisión de jefatura. Se pueden saltar y volver a ver
      desde Ajustes. Son 65 personas con niveles muy distintos de soltura con el móvil, y nadie va a
      leer un manual antes de usarlo.
- [ ] **Notas de iOS**, documentadas en `docs/instalacion.md`: en iPhone la instalación es
      "Compartir → Añadir a pantalla de inicio" (no hay aviso automático), y Safari puede desalojar
      IndexedDB si la app no se usa durante semanas — de ahí que la cola offline muestre siempre
      cuántos envíos están pendientes.

**Criterio de salida:** instalable en un Android real y en un iPhone real, con icono propio y a
pantalla completa; un error provocado a propósito aparece en `errores_cliente`.

---

## Fase 5 · Mapa, capas y simbología

**Objetivo:** el mapa operativo, que es el 80 % del valor de la aplicación.

### El mapa offline no puede usar teselas de OpenStreetMap

Comprobado antes de construir nada, y cambia el diseño: la política de uso de `tile.openstreetmap.org`
**prohíbe expresamente la descarga anticipada de teselas para uso sin conexión**. Cachear lo que el
usuario ya ha visto sí está permitido; precargar una zona "por si acaso" no, y los servidores de la
fundación bloquean sin previo aviso a quien lo hace. Como esta aplicación se usa precisamente donde
no hay cobertura, apoyarse en OSM para el modo offline habría sido construir sobre algo que nos
pueden cortar cualquier día.

> **Solución adoptada: mapa base propio con PMTiles.** Un archivo único generado con `pmtiles extract`
> acotado al recuadro de Albolote y Calicasas, a partir de las compilaciones públicas de Protomaps
> derivadas de datos OSM. Un municipio pesa unos pocos megabytes, se sirve como archivo estático y se
> lee en el navegador con `protomaps-leaflet`. Es legal (datos ODbL, los generamos nosotros), gratis,
> funciona sin conexión por diseño y no depende de la disponibilidad de nadie.
>
> - `scripts/generar-mapabase.ts` (`npm run mapabase`) extrae el archivo por recuadro sin descargar
>   el planeta entero: la herramienta usa peticiones por rango. Imprime el tamaño resultante.
> - **Dónde se sirve, decidido ahora:** si el archivo pesa ≤ 20 MB va dentro del despliegue de Pages;
>   si pesa más, `arranque.ts` crea un bucket **R2** (gratuito) con CORS para los dos dominios de
>   Pages y `generar-mapabase.ts` lo sube ahí. El frontend lee la URL de `VITE_MAPABASE_URL`, así que
>   el cambio no toca código. Se esperan entre 8 y 15 MB para Albolote + Calicasas.
> - **Offline de verdad, no "lo que ya viste".** En línea el mapa se lee por rangos, bajo demanda;
>   pero sin cobertura solo existe lo que se descargó antes, y el Service Worker no cachea bien
>   respuestas parciales. Por eso la app **descarga el archivo completo** una vez (automáticamente la
>   primera vez que detecta wifi, o desde Ajustes con "Descargar mapa para uso sin cobertura"), lo
>   guarda en Cache Storage y sirve los rangos desde ahí con un `fetch` interceptado. Ajustes muestra
>   "Mapa sin cobertura: descargado · 12 MB · versión julio 2026" o "no descargado", y el mapa avisa
>   al arrancar si falta en vez de quedarse en blanco.
> - Se regenera un par de veces al año, como la zona de cobertura. No es un dato que envejezca rápido.
>   Cuando cambia, `meta.json` lleva la versión y el móvil ofrece descargar la nueva.

- [ ] Leaflet con selector de capas, capa recordada en `localStorage`:
  - **Mapa base propio (PMTiles)** — por defecto, y la **única capa disponible sin conexión**.
  - **OSM estándar** — solo en línea, sin precarga, respetando las cabeceras de caché del servidor y
    enviando un `User-Agent`/`Referer` identificable como exige su política.
  - **PNOA** del IGN por WMTS — satélite, solo en línea.
  - **Catastro** por WMS — superpuesta, linderos de parcela, solo en línea.
  - Atribución correcta y visible en todas ellas. Las URL de servicio, en un único fichero
    `src/lib/capas.ts`.
- [ ] **Sobre CORS en PNOA y Catastro:** las capas ráster de Leaflet se cargan con etiquetas `<img>`,
      que no están sujetas a CORS, así que funcionan aunque el servicio no envíe
      `Access-Control-Allow-Origin`. La restricción sí aparecería si el Service Worker intentara
      cachearlas con `fetch` (obtendría respuestas opacas, cacheables pero no inspeccionables). Como
      esas capas son solo en línea, el problema no se plantea. Verificar en la Fase 5 que ambos
      servicios responden por HTTPS y no filtran por `Referer`.
- [ ] **Degradación clara:** sin conexión, el selector muestra las capas en línea en gris con el
      motivo ("necesita cobertura"), en lugar de dejar un mapa en blanco sin explicación.
- [ ] Límite municipal dibujado desde `datos/zona-cobertura.geojson` como línea discontinua tenue.
- [ ] Encuadre inicial sobre la zona; botón "centrar en mi posición".
- [ ] **Búsqueda en la app del voluntario**, en la cabecera del mapa y de la lista: por código,
      dirección y descripción, sobre la caché local de IndexedDB, así funciona sin cobertura. Al
      elegir un resultado, el mapa se centra y abre la ficha.
- [ ] **Filtros de la lista** (mockup 7.2, pestaña Lista): Todos · Hidrantes · Bocas · No funciona ·
      Sin revisar, más orden por distancia (por defecto), código y estado; cada fila muestra la
      distancia al usuario.
- [ ] **Layout adaptable**, como fija el documento de requisitos (§7.6): en móvil, mapa a pantalla
      completa y ficha encima; a partir de 900 px, lista lateral filtrable junto al mapa y ficha como
      panel flotante; en tableta, herramientas como botones fijos en el lateral con objetivos táctiles
      grandes. Es la misma aplicación, no otra versión.

### Regla de simbología (implementar exactamente así)

```
capacidad = {100: 3, 70: 2, 45: 1}[diametro_mm]
factor    = {bueno: 1.0, regular: 0.66, malo: 0.33, no_funciona: 0}[caudal]
puntuacion = capacidad * factor

radio_px = 11  si puntuacion >= 3.0     // 100 bueno
           9   si puntuacion >= 1.9     // 100 regular, 70 bueno
           7   si puntuacion >= 0.9     // 100 malo, 70 regular, 45 bueno
           5.5 si puntuacion > 0        // 70 malo, 45 regular, 45 malo
           5   si puntuacion == 0       // no funciona
```

- **Forma:** círculo = hidrante, cuadrado (rx 3) = boca de riego. El tipo debe distinguirse sin color.
- **Color de relleno:** `bueno` `#2E7D4F`, `regular` `#8A6408`, `malo` `#9C2B1E`, `no_funciona` `#40453D`.
- **No funciona:** opacidad 0,5 y línea cruzada blanca encima.
- **Leyenda** (mockup 7.2): no solo colores; muestra forma (círculo/cuadrado), el tachado de "no
  funciona" y el borde discontinuo de "sin revisar", porque son las tres cosas que un voluntario
  nuevo no adivina. La posición del usuario se dibuja como punto azul con halo de precisión.
- **Revisión caducada** (>12 meses): borde discontinuo `3 2.5`, mismo tamaño y color.
- **Declutter por zoom:** ocultar por orden creciente de `radio_px` al alejarse
  (z≤13 solo radio ≥9; z≤15 solo radio ≥7; z≥16 todo).
- Calcular `radio_px` en `v_puntos_activos`, no en el cliente, para que la app y el panel usen el
  mismo criterio sin duplicar lógica. Los cinco valores viven en `config`, para poder separar la
  escala tras la prueba de campo **sin desplegar código**.

- [ ] Leyenda fija en la esquina con los cuatro colores.
- [ ] **Objetivos táctiles de al menos 44 px** alrededor de cada marcador, independientemente de su
      radio dibujado: se usa en la calle, a veces con guantes.
- [ ] Pantalla Lista: mismos puntos en tabla, ordenables por distancia, tipo y estado.
- [ ] Ficha del voluntario: tipo, diámetro, caudal, racor, foto, **dirección**, descripción, fecha de
      última revisión, y menú "Proponer un cambio" con las cinco operaciones sobre un punto existente. **Sin historial y sin nombres de autores** — comprobado también en la respuesta de
      red, no solo en pantalla.
- [ ] Caché offline de los puntos aprobados en IndexedDB, con **sincronización incremental** por
      `actualizado_en` y sello de última sincronización visible en la interfaz. Lo que de verdad hace
      falta sin cobertura son los puntos, y esos sí se pueden guardar enteros sin depender de nadie.
- [ ] **Modo oscuro**, activado por la preferencia del sistema y conmutable a mano. No es estético:
      en un servicio nocturno, una pantalla blanca a pleno brillo arruina la visión adaptada a la
      oscuridad durante varios minutos. El mapa base PMTiles lleva su propio estilo oscuro, que se
      define en el mismo sitio que el claro.
- [ ] **Sin agrupación de marcadores por defecto.** El declutter por zoom ya cumple esa función y
      respeta la semántica del tamaño; agrupar la destruiría. Solo si la prueba de carga de la Fase 8
      lo exige, se agrupa a z ≤ 12 y nunca más cerca.

**Criterio de salida:** con el mapa base descargado, el mapa y la búsqueda funcionan en modo avión
con los datos de la última sincronización; las cuatro capas cargan en un móvil con 3G; el propietario confirma que los cinco tamaños se distinguen
en su móvil a la luz del día.

---

## Fase 6 · Las seis operaciones

**Objetivo:** que un voluntario pueda proponer cualquier cambio, con o sin cobertura.

- [ ] **Alta nueva:** pin naranja arrastrable + círculo azul del GPS con su radio de precisión.
      Campos: tipo, diámetro de la salida mayor (oculto y fijado a 45 si es boca de riego; opción
      "otra medida" con campo libre, que llega a la cola marcada para que jefatura lo compruebe),
      caudal, racor (solo bocas de riego), **foto obligatoria**, descripción opcional.
      `descripcion_fallo` obligatoria si `caudal = no_funciona`.
- [ ] **Aviso de fuera de zona:** si el pin queda fuera de `zona-cobertura.geojson` (comprobado en
      el cliente con Turf), se muestra "Esto queda fuera de la zona habitual. ¿Seguro?" y se permite
      continuar. Jefatura lo verá como `municipio = fuera_de_zona` en la cola.
- [ ] **La foto es obligatoria y no se puede omitir.** Consecuencias que hay que resolver, no
      esquivar: el botón de envío queda deshabilitado con un texto que explica por qué; la cámara se
      abre directamente desde el formulario; y **si el envío es offline, la foto viaja en la cola**
      como blob, de modo que una propuesta sin cobertura sigue siendo válida. Exigir foto y no
      guardarla offline sería hacer la aplicación inservible justo donde más falta hace.
- [ ] **Subida por URL firmada.** Al sincronizar, para cada propuesta de la cola: `POST
      /api/url-subida` → `PUT` del blob → `fn_proponer` con el `foto_path` devuelto. Si el `PUT`
      falla, la reserva caduca sola y se pide otra en el siguiente intento; la propuesta nunca se
      envía sin foto subida.
- [ ] **Tratamiento de la foto en el cliente:** leer orientación y coordenadas EXIF, aplicar la
      orientación, redimensionar a ≤1600 px y recomprimir (lo que elimina todos los metadatos:
      privacidad), y enviar las coordenadas EXIF aparte como `exif_geom`. Sirven a jefatura cuando el
      punto se registró "al volver a casa": si la foto se hizo a 900 m del pin, se ve.
- [ ] **Selector de racor con fotos de referencia.** Al elegir el racor de una boca de riego se
      muestran las fotos de los tipos Granada y Barcelona una al lado de la otra, para comparar con lo que el voluntario tiene
      delante. Es la confusión más previsible del formulario entero y se
      resuelve con dos imágenes en `src/activos/racores/`, servidas con la aplicación y por tanto
      disponibles sin cobertura.
- [ ] **Revisión:** un solo botón en la ficha, "Sigue igual". No abre formulario.
- [ ] **Actualizar estado:** solo caudal y, si procede, descripción del fallo.
- [ ] **Corregir datos:** tipo, diámetro, racor, descripción.
- [ ] **Jefatura desde el móvil:** con sesión de Google, las mismas pantallas aplican el cambio al
      momento y muestran "Aplicado" en vez de "Enviado para revisión".
- [ ] **Corregir ubicación:** arrastrar el pin sobre un mapa grande; la posición actual queda
      dibujada como círculo gris y una línea muestra el desplazamiento en metros (mockup 7.3). La
      posición anterior queda en la propuesta y en `registro`.
- [ ] **Proponer retirada:** motivo obligatorio, con cuatro motivos rápidos (obras, asfaltado,
      sustituido, otro) más texto libre, y foto del sitio. La pantalla dice que el punto sigue en el
      mapa hasta que jefatura confirme (mockup 7.3).
- [ ] Registrar siempre `origen_ubicacion`, `precision_gps_m` y `distancia_gps_m`.
- [ ] **Duplicados:** se calculan en el servidor al recibir la propuesta (mismo tipo, menos de
      `radio_duplicado_m`) y se muestran **solo a jefatura**. El voluntario no recibe aviso durante
      el alta.
- [ ] **Cola offline:** cada propuesta se guarda en IndexedDB con su `clave_local` y se envía al
      recuperar conexión. Indicador visible de "N pendientes de enviar". Reintentos con retroceso
      exponencial; los fallos permanentes (por ejemplo, validación rechazada por el servidor) se
      muestran al voluntario en lugar de reintentarse indefinidamente.
- [ ] "Mis propuestas": lista por dispositivo, con estado y motivo de rechazo, y opción de retirar
      las pendientes.
- [ ] **Aviso de resolución.** Al abrir la aplicación, si alguna propuesta propia se ha aprobado o
      rechazado desde la última visita, se muestra un aviso discreto con el resultado. Sin esto, el
      voluntario nunca sabe si sirvió de algo lo que hizo, y la participación se apaga sola a las
      pocas semanas. Es una comprobación local contra la lista de propuestas propias, sin
      notificaciones push ni permisos adicionales.
- [ ] **Canal para incidencias de la aplicación**, separado de los hidrantes: una opción en Ajustes,
      "algo no funciona", que envía con `fn_reportar_incidencia` una descripción libre junto al
      `dispositivo_id`, la versión y la última ruta visitada, a la pestaña Voluntarios del panel, con
      estado abierta/resuelta. Sin esto, cualquier problema acaba en una llamada de teléfono a una
      sola persona.

**Criterio de salida:** dar de alta tres puntos con foto en modo avión, recuperar cobertura y ver que
llegan los tres, una sola vez cada uno; forzar un reenvío duplicado y comprobar que no crea una
segunda propuesta.

---

## Fase 7 · Panel de jefatura

**Objetivo:** que aprobar sea rápido. Si cuesta, la cola se abandona y el mapa deja de ser fiable.

- [ ] Pestañas: Cola de revisión · Inventario · Revisiones caducadas · Registro · Papelera ·
      Voluntarios · Ajustes. Búsqueda global en la cabecera.
- [ ] **Cola de revisión**, diseño en dos columnas:
  - Lista con casillas de selección, etiqueta de operación, código, autor y antigüedad.
  - Filtro por tipo de operación y por núcleo.
  - Barra de acciones en bloque: aprobar / rechazar las seleccionadas.
  - Detalle con **diff campo a campo** (antes tachado en rojo, después en verde, "sin cambios" en
    gris para el resto).
  - **Dirección deducida:** al abrir una propuesta con ubicación nueva o corregida, el panel llama
    a `/api/direccion` y muestra el resultado en un campo editable ("C/ Real 14, Albolote ·
    deducida"). Lo que quede en el campo es lo que `fn_aprobar` guarda. Atribución a
    OpenStreetMap/Nominatim en el pie del panel.
  - Señales automáticas de fiabilidad: origen GPS, precisión y distancia al pin, coordenadas EXIF de
    la foto si difieren del pin en más de 50 m, punto fuera de zona, antigüedad de la última
    revisión, aviso si hay un punto aprobado **del mismo tipo** a menos de `radio_duplicado_m`, y
    "otra medida" de diámetro pendiente de fijar.
  - Minimapa con el punto propuesto y los aprobados del entorno.
  - Acciones: **Aprobar**, **Aprobar con correcciones** (abre los campos de la propuesta editables
    en el mismo panel, con la dirección; el registro guarda qué se corrigió y el autor lo ve en su
    móvil), **Rechazar** con motivo obligatorio, y **Fusionar con un punto existente** cuando es un
    duplicado.
  - **Duplicado:** comparación en dos columnas, propuesta frente a punto existente (tipo, diámetro,
    racor, estado, última revisión, dirección, las dos fotos). Al fusionar, para cada campo que
    difiere jefatura elige qué valor prevalece; el existente recibe la foto nueva y cuenta como
    revisión. Sin la comparación no hay forma de decidir si son dos puntos o uno.
  - **Aviso de propuesta desactualizada:** si el punto cambió después de que se enviara la
    propuesta, se muestra en rojo con el diff recalculado contra el estado actual, y aprobar exige
    una confirmación extra. Es el caso de dos voluntarios que pasan por el mismo hidrante el mismo
    día.
- [ ] **Historial de propuestas:** las rechazadas y aprobadas no desaparecen. La misma pantalla, con
      un filtro de estado (pendiente / aprobada / rechazada / retirada por el autor) y por fechas.
      Sin esto, "¿por qué se rechazó aquello?" solo se responde rebuscando en el registro.
- [ ] **Búsqueda global** en la cabecera: por código (`HID-0147`), por dirección o por nombre de autor.
      Con 438 puntos, navegar solo por mapa y filtros no basta.
- [ ] **Pestaña Voluntarios — actividad:** quién ha aportado cuánto en los últimos 3 y 12 meses, con
      tasa de aprobación. Sirve para dos cosas legítimas: agradecer a quien tira del carro, y detectar a
      alguien que necesita que le expliquen mejor cómo rellenar el formulario. **No es un ranking
      público** — vive solo en el panel. Desde aquí se lanza también `fn_anonimizar_autor` si alguien
      ejerce su derecho de supresión.
- [ ] **Pestaña Voluntarios — incidencias de la aplicación:** lista de `incidencias_app` con fecha,
      descripción, versión, ruta y estado; acción "marcar resuelta". Es donde acaba "algo no
      funciona".
- [ ] **Inventario:** tabla completa con filtros (tipo, diámetro, caudal, núcleo, antigüedad de
      revisión), columnas ordenables, paginación de 50 con "mostrando X de N", dirección editable
      en la propia celda y conmutador tabla/mapa. Acciones directas: editar, retirar, borrar (a
      papelera, con confirmación), historial del punto.
- [ ] **Revisiones caducadas:** puntos con más de 12 meses, agrupables por núcleo para repartir
      trabajo. Solo consulta — sin correos automáticos.
- [ ] **Hoja de campo imprimible:** desde Revisiones caducadas o desde Inventario filtrado, un botón
      que genera con CSS de impresión una hoja por núcleo —código, dirección, tipo, diámetro, último
      estado y una casilla en blanco— para dársela en papel a quien salga a revisar. Cuesta muy poco
      y evita depender de que todo el mundo lleve el móvil con batería. La exportación a Excel sigue
      siendo de segunda fase; esto no la sustituye.
- [ ] **Registro:** auditoría completa con filtros por fecha, actor, acción y punto, y paginación.
      Historial de un punto accesible desde su ficha.
- [ ] **Papelera:** borrados de los últimos 30 días, con restaurar y purgar.
- [ ] **Ajustes:** cambiar el código de acceso con el interruptor "revocar todos los dispositivos"
      (mostrando fecha y autor del último cambio, con **confirmación explícita** que dice cuántos
      móviles se verán afectados), parámetros con botón "Guardar" y aviso de cuándo los aplican los
      móviles, gestionar
      `administradores` (añadir correo con sugerencias de `app_users`, activar/desactivar), ajustar
      los parámetros de `config` (radio de duplicados, meses de revisión, escala de tamaños, subidas
      por dispositivo), ver la fecha de generación del límite municipal y del mapa base, lanzar la
      purga de fotos huérfanas (vía `/api/lanzar-purga`, con aviso de que tarda unos minutos) y
      descargar el inventario en JSON.
- [ ] **Núcleos:** lista de los núcleos deducidos automáticamente, con la posibilidad de renombrar
      uno o añadir a mano el que Overpass no traiga. El cálculo es automático, pero el resultado no
      puede quedar fuera del alcance de jefatura.
- [ ] **Salud del sistema**, en Ajustes: propuestas con más de 14 días sin revisar, errores de
      cliente en 7 días, incidencias abiertas, fecha del último respaldo, Storage usado, puntos sin
      dirección deducida, versión del mapa base y de la zona.
- [ ] **Escritorio primero**, usable en tableta.

**Criterio de salida:** aprobar 20 revisiones en bloque en menos de 30 segundos y verlas reflejadas
en `registro`; detectar y fusionar un duplicado introducido a propósito a 8 m.

---

## Fase 8 · Calidad, respaldo y observabilidad

**Objetivo:** que el sistema sobreviva sin mantenimiento activo. Esta fase es lo que diferencia una
demo de algo que aún funciona dentro de dos años.

- [ ] **Tests unitarios** de `src/lib`: simbología (las 12 combinaciones), geometría, formato de
      fechas relativas.
- [ ] **Tests SQL (pgTAP)** de la Fase 3, ejecutados en CI contra una base efímera.
- [ ] **E2E con Playwright**, en CI contra la Supabase local y las *Pages Functions* en `wrangler
      pages dev` (nunca contra staging, por lo dicho en la Fase 0), cubriendo el camino crítico
      completo: entrar con código → alta con pin manual y foto por URL firmada → aprobar desde el
      panel con dirección deducida → el punto aparece en el mapa → retirar → restaurar desde la
      papelera.
- [ ] **Respaldo automático.** El plan gratuito de Supabase no ofrece recuperación a un instante
      concreto, así que `.github/workflows/respaldo.yml` se ejecuta semanalmente y **usa la
      `service_role key`, no una RPC de administrador**: un runner de CI no tiene sesión de Google,
      así que no puede pasar por `fn_es_admin()`. Vuelca con `pg_dump` el esquema `hidrantes`
      completo —incluidas `propuestas` pendientes, que también son trabajo que se perdería— y
      guarda el resultado **cifrado con GPG** como artefacto de GitHub Actions, con 90 días de
      retención. La clave pública la subió `arranque.ts`; la privada está en el sobre. El esquema
      `hidrantes` incluye `administradores`, así que el volcado es completo.
- [ ] **El respaldo no se commitea a ninguna rama.** Contiene nombres de voluntarios: meterlo en el
      historial de Git lo vuelve permanente e imposible de purgar si alguien ejerce su derecho de
      supresión. Artefacto cifrado y con caducidad, no commit.
- [ ] **Las fotos entran en el respaldo.** Un volcado de base de datos deja `foto_path` apuntando a
      archivos que ya no existirían tras un borrado del bucket. El mismo workflow sincroniza el
      bucket a un artefacto mensual aparte. Sin esto, "tenemos respaldo" es falso a medias, que es
      peor que no tenerlo.
- [ ] **Prueba de restauración:** documentar y **ejecutar una vez** la restauración de un respaldo
      sobre una base limpia. Un respaldo que nunca se ha restaurado no cuenta como respaldo.
- [ ] **Presupuesto de rendimiento:** primera carga útil por debajo de 3 s en 3G, y el paquete
      principal por debajo de 300 kB comprimido (sin contar el mapa base PMTiles, que se carga por
      rangos y bajo demanda). Comprobado en CI.
- [ ] **Prueba de carga realista:** generar 1.000 puntos de prueba en la instancia local y medir el
      desplazamiento del mapa, la sincronización inicial y la búsqueda en un móvil de gama media real
      —no en el emulador del portátil, que miente—. Es el momento de decidir si hace falta agrupar
      marcadores, no cuando el mapa ya esté lleno.
- [ ] **Accesibilidad:** contraste suficiente en los cuatro colores de estado, objetivos táctiles de
      44 px, y la información de estado nunca transmitida solo por color (de ahí la forma y el
      tachado).
- [ ] **Continuidad de acceso.** No hay una segunda persona disponible para compartir la propiedad
      de las cuentas, así que la mitigación es otra: **que las cuentas no pertenezcan a una persona,
      sino a la agrupación**.
  - Crear una cuenta de Google institucional (por ejemplo `informatica@…` de la agrupación) y que
    **esa** cuenta sea la propietaria de GitHub, Cloudflare y Supabase. Migrar la propiedad ahora
    cuesta una tarde; hacerlo cuando el titular ya no esté disponible puede ser imposible.
  - Sus credenciales y las claves de recuperación de dos factores, en un sobre cerrado en la sede o
    en el gestor de contraseñas de la agrupación — donde jefatura guarda lo demás.
  - `docs/continuidad.md`: dónde vive cada cosa, con qué cuenta se accede, dónde está la clave GPG
    privada, y los pasos para desplegar, restaurar un respaldo y rotar el código sin conocimiento
    previo del proyecto. Claude Code lo escribe como **guion clic a clic** (crear la cuenta,
    transferir el repo, cambiar el propietario de la organización de Supabase, transferir la cuenta
    de Cloudflare), para que los 45 minutos del desarrollador sean seguir una lista. Se hace después
    del lanzamiento: no bloquea nada.
  - **Comprobación anual:** que alguien de jefatura acceda una vez al año con esas credenciales, para
    detectar que siguen funcionando antes de necesitarlas de verdad.
  - Esto no sustituye a tener una segunda persona; reduce el daño de no tenerla. Conviene decirlo
    así de claro en el documento, para que no se confunda con estar resuelto.
- [ ] **Revisión de seguridad**, en checklist, desde la `anon key`: leer `propuestas`, leer
      `registro`, escribir en `puntos`, aprobar una propuesta, listar las propuestas de otro
      dispositivo, ejecutar `fn_verificar_codigo` directamente, subir un archivo al bucket sin URL
      firmada, y llamar a `/api/direccion` sin JWT de administrador. **Las ocho deben fallar**, y
      quedar documentadas en `docs/seguridad.md`.

**Criterio de salida:** CI verde con las tres capas de tests; un respaldo restaurado con éxito; las
ocho pruebas de intrusión fallando como se espera.

---

## Fase 9 · Aceptación y puesta en marcha

- [ ] **Matriz de aceptación** en `docs/aceptacion.md`, recorrida en campo por jefatura con 2–3
      voluntarios (el desarrollador no tiene que estar):
      entrada con código y nombre; bloqueo por intentos; alta con GPS; alta con pin manual; los
      cuatro estados de caudal; boca de riego con sus 45 mm fijos; boca de riego con su racor y sus fotos de referencia; hidrante sin campo de racor;
      alta sin foto rechazada; alta con foto en modo avión;
      `no_funciona` sin descripción rechazado; foto; offline y sincronización; reenvío sin duplicar; las
      cuatro capas de mapa; los cinco tamaños de marcador legibles a pleno sol; aviso de fuera de zona; búsqueda y mapa en
      modo avión tras descargar el mapa base; administrador editando desde el móvil con aplicación
      inmediata; dirección deducida y corregida en el panel; revisión en bloque;
      aprobación con correcciones; fusión de duplicado; rechazo con motivo visible para el autor;
      retirada; papelera y restauración; cambio del código de acceso; y que la ficha del voluntario
      no expone nombres.
- [ ] **Piloto de una semana en staging** con un barrio real y 5–8 voluntarios, antes de abrir a los
      65. Antes de empezar, jefatura genera desde Ajustes un código real para staging (el `000000`
      del seed deja de valer). Incidencias en la pestaña Voluntarios del panel y en
      `docs/incidencias-piloto.md`.
- [ ] Corregir lo que salga del piloto. Volver a pasar la matriz sobre lo corregido.
- [ ] **Promoción a producción:** PR de `develop` a `main`, aprobación del *environment* en GitHub, y
      el resto es automático (migraciones + despliegue + código de acceso real en el *summary*).
- [ ] **Promoción de los datos del piloto** con `scripts/promover-piloto.ts` (`npm run
      promover-piloto`, ejecutable como workflow manual con aprobación del *environment*
      `production`):
  1. Exige que la cola de staging esté a cero: lo pendiente se aprueba o se rechaza antes, no se
     migra a medias.
  2. Lee de staging los `puntos` con `situacion = 'activo'` cuya `descripcion` no empiece por
     `[PRUEBA]`, con sus `propuestas` aprobadas y su `registro`.
  3. Copia sus fotos de `hidrantes-fotos-dev` a `hidrantes-fotos` por la API de Storage, con el
     mismo `foto_path`.
  4. Inserta en producción **conservando los códigos** (`HID-0001`… siguen siendo los que los
     voluntarios ya vieron) y avanza las secuencias por encima del máximo importado.
  5. Es idempotente por `codigo`: relanzarlo no duplica nada. Deja un informe en el *summary* del
     workflow: cuántos puntos, cuántas fotos, cuánto pesa.
  Los voluntarios del piloto instalan la PWA de producción y meten el código real; el token de
  staging no vale en producción y no hace falta que valga.
- [ ] Comunicar el código real al grupo (jefatura).
- [ ] Autorizar los correos de jefatura desde Ajustes. La migración inicial solo trae al propietario;
      a partir de ahí se gestionan sin tocar código. Un cambio de personal no puede depender de un
      despliegue.
- [ ] `docs/instalacion.md` para el voluntario: cómo instalar en Android e iOS, en lenguaje sencillo
      y **con capturas generadas por `scripts/capturas.ts`** (Playwright emulando un móvil, sobre
      staging), para que se regeneren solas cuando cambie la interfaz.
- [ ] **Una sesión presencial de 20 minutos** en una reunión ordinaria de la agrupación, con los
      móviles en la mano: instalar, entrar con el código, y dar de alta un punto real en la puerta de
      la sede. Vale más que cualquier manual, y detecta de golpe los móviles viejos o los problemas de
      permisos de cámara y ubicación.
- [ ] `docs/operacion.md` para jefatura: cómo revisar la cola, rotar el código, dar y quitar acceso
      de administrador, regenerar la zona si Overpass cambia, restaurar de la papelera y recuperar un
      respaldo.

**Criterio de salida:** jefatura aprueba la matriz completa y se abre el acceso a la agrupación.

---

## Conformidad con el documento de requisitos

Cotejo realizado sobre `requisitos-hidrantes.html` v6. Los puntos donde el plan **añade** detalle de
implementación que el documento funcional no fija (formato del token de dispositivo, nombres de
tablas, estructura de CI) no son desviaciones. Sí conviene tener presentes estas correspondencias, porque
se corrigieron al cotejar y no son obvias:

| Requisito | Cómo se cumple |
|---|---|
| "Racor: Granada, Barcelona u otro" | Se pregunta **solo en bocas de riego**, que es donde existen variantes municipales. Los hidrantes llevan racor Barcelona por norma UNE 23400 y el campo no aparece. |
| "El voluntario no recibe aviso de duplicado en campo" | La distancia al punto más cercano se calcula en el servidor y viaja como señal a la cola de revisión. El formulario del voluntario no la muestra. |
| "Autor tomado de la sesión, no preguntado en cada envío" | `autor_nombre` y `autor_apellido` los rellena el cliente desde lo guardado en el móvil; no son campos del formulario. Siguen siendo obligatorios en la propuesta. |
| "Sí (se aplica al momento)" para jefatura | `fn_proponer` detecta el JWT de administrador y aplica el cambio sin cola, registrándolo como acción de administrador. |
| "Búsqueda por calle" y "dirección" en la hoja de campo | `puntos.direccion`, deducida con Nominatim al revisar y corregible; sin campo para el voluntario. |
| "Si el punto cae fuera, avisa pero permite continuar" | Aviso en el cliente con Turf; `municipio = fuera_de_zona` en la BD, visible como señal en la cola. |
| "Mapa, búsqueda y fichas disponibles sin señal" | Caché de puntos en IndexedDB + mapa base PMTiles descargado entero + búsqueda local. |
| "Distancia al punto activo más cercano del mismo tipo" | El cálculo de duplicados filtra por `tipo`. |
| "Solo puede subir fotos un móvil que ya validó el código" | URL firmada tras `fn_reservar_subida(token)`, con cuota diaria. |

---

## Fase 10 · Diferido a segunda fase

No se construye ahora, pero **ninguna decisión de las fases anteriores debe cerrarle la puerta**:

- Exportación a Excel (`.xlsx`) y a **GeoJSON/KML**, respetando filtros y orden.
- Avisos automáticos de revisión caducada (correo o notificación push).
- Rutas y navegación hasta el punto.
- Importación de datos de la red de abastecimiento, si el ayuntamiento o la concesionaria facilitan
  planos.
- Etiquetas QR por punto, siguiendo el patrón de la app de uniformidad.

---

## Privacidad y datos personales

La aplicación almacena **nombre y apellido** de voluntarios, lo que la sitúa dentro del RGPD. Igual
que en la app de uniformidad, la protección viene de guardar lo mínimo:

- **No** se guardan DNI, teléfono, correo ni dirección de los voluntarios.
- El nombre solo es visible para jefatura y administradores, nunca para otros voluntarios, y no sale
  en ninguna respuesta de red dirigida a un voluntario.
- El `dispositivo_id` es un uuid aleatorio sin relación con el hardware ni con la persona.
- Las fotos se suben con nombre aleatorio. **Instruir en `docs/instalacion.md`** que no se fotografíen
  personas ni matrículas: el objeto de la foto es el hidrante.
- Retención: el `registro` se conserva indefinidamente por ser la auditoría del sistema; los nombres
  que contiene son el registro de quién hizo qué, que es precisamente su finalidad legítima.
- **Titularidad de los datos.** Conviene dejarlo escrito antes de que surja: los datos los genera la
  agrupación en el ejercicio de su función, y son suyos. Si el ayuntamiento, el consorcio de bomberos
  o cualquier otro organismo los solicita, jefatura decide qué se comparte y en qué formato; la
  exportación de la segunda fase existe precisamente para poder hacerlo sin dar acceso al sistema.
  `docs/privacidad.md` recoge quién decide.
- **Derecho de supresión:** si un voluntario pide que se borre su nombre, se sustituye en
  `propuestas` y `registro` por "voluntario dado de baja" manteniendo las filas, **identificándolo por
  `dispositivo_id`** y no por nombre, porque los nombres se repiten. Borrar la fila entera destruiría
  la auditoría de un cambio que sigue existiendo en el mapa. El procedimiento, en
  `docs/privacidad.md`, con la RPC `fn_anonimizar_autor(dispositivo_id)`; jefatura localiza el
  dispositivo desde la pestaña Voluntarios.
- **Fotos:** se recomprimen en el móvil antes de subir, lo que elimina los metadatos EXIF (posición,
  modelo de teléfono, fecha). Las coordenadas EXIF se envían aparte como dato del punto, no de la
  persona. La lectura del bucket es pública por URL no enumerable; `docs/instalacion.md` pide no
  fotografiar personas ni matrículas.
- **Nominatim:** al deducir la dirección se envían a un servicio de OpenStreetMap las coordenadas del
  hidrante, nunca datos del voluntario ni su IP (la petición sale de Cloudflare).
- `docs/privacidad.md` con un aviso breve y legible que jefatura pueda compartir con el grupo, más un
  **aviso legal** mínimo enlazado desde la propia aplicación: responsable del tratamiento
  (la agrupación), finalidad, base jurídica y cómo ejercer derechos.

---

## Riesgos y decisiones a vigilar

| Riesgo | Mitigación |
|---|---|
| El código compartido circula fuera del grupo | Las ubicaciones de hidrantes no son datos personales; el daño posible es vandalismo de datos, y toda escritura pasa por moderación. El código es rotable en cualquier momento y los intentos están limitados. |
| Un código de 6 dígitos es adivinable por fuerza bruta | Decisión cerrada por jefatura. Cinco capas: límite por dispositivo, límite por IP real en la *Pages Function*, techo global, token de dispositivo y `fn_verificar_codigo` sin `execute` para `anon`. Ver "Protección del código de acceso". Rotable en un minuto. |
| Duplicados por reenvío de la cola offline | `clave_local` con índice único, comprobada en `fn_proponer`. |
| Un borrado masivo por error, sin recuperación en el plan gratuito | `pg_dump` semanal cifrado como artefacto de CI, fotos incluidas, con restauración probada al menos una vez (Fase 8). |
| Los tamaños de marcador no se distinguen a pleno sol | Los cinco radios viven en `config`: se ajustan sin desplegar. Se valida en la Fase 5 con el propietario. |
| PNOA o Catastro cambian de URL de servicio | Las capas están en `src/lib/capas.ts`; OSM queda siempre como respaldo. |
| Overpass cae el día que haya que regenerar la zona | Mirror alternativo, fuente IECA alternativa ya escrita, y GeoJSON committeado: el build nunca depende del servicio en vivo. |
| Safari en iOS desaloja IndexedDB y se pierde la cola offline | La cola muestra siempre cuántos envíos quedan pendientes y avisa si llevan más de 24 h sin enviarse. |
| Fotos huérfanas acumulándose en Storage y agotando la cuota gratuita | Workflow semanal de purga (con `fn_fotos_referenciadas`), lanzable también desde Ajustes, más el indicador de Storage en Salud del sistema. |
| Un hidrante cuya salida mayor no sea 70 ni 100 mm | Es improbable —el catálogo español no lo contempla— pero el formulario ofrece "otra medida" con campo libre, que llega a la cola marcada para que jefatura lo compruebe en vez de forzar un valor falso. |
| Aparece un cuarto tipo de racor | `tipo_racor` es un enum; ampliarlo es una migración de una línea. |
| Nadie revisa la cola durante semanas | El panel de salud muestra las propuestas con más de 14 días sin revisar. |
| Los dos repositorios se pisan el historial de migraciones del Supabase compartido | Historial propio en `hidrantes.migraciones_aplicadas` y aplicación con `psql`, sin `supabase db push`. |
| Un administrador de la app de uniformidad se convierte sin querer en administrador de hidrantes | Tabla propia `hidrantes.administradores`, exigida por `fn_es_admin()`; el esquema `public` no se toca. |
| Dos voluntarios modifican el mismo punto el mismo día y el segundo diff es engañoso | `fn_aprobar` detecta la propuesta desactualizada y exige confirmación explícita. |
| Las fotos agotan el gigabyte gratuito de Storage | Compresión, purga de huérfanas, indicador de consumo, y `foto_path` en vez de `foto_url` para poder mover a R2 sin migrar datos. |
| La URL `pages.dev` es larga y poco memorable para 65 personas | Decisión cerrada: no se compra dominio. Se mitiga con el enlace fijado en el grupo, un código QR en la sede y el acceso directo que deja la instalación de la PWA. |
| El límite de intentos se esquiva generando un `dispositivo_id` nuevo | Límite por IP real en la *Pages Function* de Cloudflare, más techo global que nadie esquiva. |
| `x-forwarded-for` en Supabase lo puede falsificar el cliente, así que un límite por IP en la base de datos no sirve | La IP se toma de `CF-Connecting-IP` en Cloudflare, que el cliente no puede alterar. Comprobado antes de diseñar sobre ello. |
| El techo global deja fuera a los 65 voluntarios mientras alguien ataca | Token de dispositivo: quien ya entró una vez no vuelve a pasar por el control de código. |
| Precargar teselas de OSM para uso offline está prohibido por su política de uso y bloquean sin avisar | Mapa base propio en PMTiles, generado por nosotros a partir de datos OSM. Las capas de OSM, PNOA y Catastro quedan como consulta en línea. |
| La foto obligatoria impide dar de alta sin cobertura | La foto viaja en la cola offline como blob y se sube al sincronizar. |
| El proyecto depende de la cuenta personal de una sola persona | Las cuentas pasan a una cuenta institucional de la agrupación, con credenciales custodiadas y comprobación anual. |
| El voluntario nunca sabe si su propuesta sirvió de algo | Aviso de resolución al abrir la aplicación. |
| Un lote de 20 aprobaciones falla entero por un caso raro | `fn_aprobar_lote` procesa cada una por separado y devuelve qué quedó fuera y por qué. |
| El respaldo existe pero no se puede ejecutar, o deja las fotos fuera | `pg_dump` con `service_role` desde CI, cifrado, incluyendo `propuestas`, más sincronización mensual del bucket. |
| Los datos personales quedan para siempre en el historial de Git | Los respaldos son artefactos cifrados con caducidad, nunca commits. |
| Los tests e2e contaminan el proyecto Supabase compartido con la app de uniformidad | CI levanta una instancia local de Supabase; los tests nunca tocan dev ni prod. |
| Un voluntario ejerce su derecho de supresión | `docs/privacidad.md` recoge el procedimiento: sustituir su nombre en `propuestas` y `registro` por "voluntario dado de baja" conservando la trazabilidad técnica del cambio. Se identifica por `dispositivo_id`, no por nombre, porque hay nombres repetidos. Hay que tenerlo escrito antes de que lo pidan, no después. |
| Cualquiera con la `anon key` (pública) llena el gigabyte de Storage con basura | Sin políticas de escritura para `anon`. Subida solo con URL firmada emitida tras validar el token y la cuota diaria de 40 por dispositivo. |
| Alguien llama a `fn_verificar_codigo` directamente con un `ip_hash` inventado y esquiva el límite por IP | La función no tiene `execute` para `anon`; solo la ejecuta la *Pages Function* con `service_role`. Test pgTAP. |
| El mapa base "offline" solo contiene lo que el usuario ya miró en línea | Descarga completa del PMTiles a Cache Storage, automática con wifi y manual desde Ajustes, con indicador de estado. |
| Safari desaloja la caché del mapa base junto con IndexedDB | Ajustes muestra si el mapa está descargado y la app avisa al arrancar sin él; volver a descargar son unos MB. |
| El PMTiles supera los 25 MB de Pages | Decidido de antemano: > 20 MB va a R2, `VITE_MAPABASE_URL` cambia, el código no. |
| Los datos del piloto en staging se pierden al arrancar producción vacía | `promover-piloto.ts` copia puntos, fotos y registro conservando los códigos, idempotente y con informe. |
| Nominatim no responde o limita | La dirección es opcional: la aprobación nunca se bloquea; el campo queda vacío, aparece en Salud como pendiente y se vuelve a intentar al abrir la ficha en el panel. Volumen esperado: cientos de peticiones al año. |
| La `service_role key` de las *Pages Functions* se filtra | Vive solo en variables cifradas de Cloudflare; el frontend nunca la recibe; rotarla es relanzar `arranque.ts`. |
| Los runners de GitHub no llegan a la base de datos (IPv6) | `SUPABASE_DB_URL` apunta al pooler de Supavisor en modo sesión, que tiene IPv4. Documentado en `docs/entornos.md`. |
| `wrangler`, `gh` o `supabase` no tienen sesión en la máquina del desarrollador | `arranque.ts` lo detecta al principio y dice exactamente qué comando de login falta; no empieza a crear nada a medias. |

---

## Estimación

| Fase | Esfuerzo |
|---|---|
| 0 · Repositorio, entornos, `arranque.ts` y *Pages Functions* base | 2,5 días |
| 1 · Zona de cobertura | 0,5 día |
| 2 · Esquema, Storage con URL firmadas, `pg_cron` | 2 días |
| 3 · RPC, *Pages Functions* y tests pgTAP | 3 días |
| 4 · Acceso por token, jefatura en la PWA y armazón | 2 días |
| 5 · Mapa, mapa base offline, búsqueda, layout adaptable | 3,5 días |
| 6 · Las seis operaciones, cola offline con fotos, EXIF | 4 días |
| 7 · Panel de jefatura con dirección, Voluntarios e incidencias | 4 días |
| 8 · Calidad, respaldo, restauración, carga, seguridad | 3,5 días |
| 9 · Aceptación, piloto, promoción de datos, manuales con capturas | 1,5 días |

**Total: ~27 días de trabajo enfocado de Claude Code**, más una semana de piloto en paralelo. Del
desarrollador: unas dos horas (ver "Modelo de delegación").

El aumento respecto a la v1 (18 días) corresponde a lo que la revisión del 16 de septiembre sacó a
la luz: la Fase 8 tenía 1,5 días para tests unitarios, pgTAP, e2e, respaldo cifrado, prueba de
restauración, presupuesto de rendimiento, prueba de carga y revisión de seguridad, que no era
creíble; la subida por URL firmada, el mapa base descargable, la dirección deducida, la pestaña
Voluntarios y la promoción del piloto no existían; y el arranque en un comando cuesta más de
escribir de lo que ahorra en su primera ejecución, pero es lo que reduce el trabajo del desarrollador
a dos horas.

### Orden recomendado de arranque

Fases 0 → 1 → 2 → 3 antes de escribir una línea de interfaz. Los entornos primero, porque un
problema de despliegue descubierto en la fase 9 es el más caro de todos; después el esquema y las
RPC, donde un error cuesta caro más adelante. El frontend sobre una base sólida avanza muy rápido.
