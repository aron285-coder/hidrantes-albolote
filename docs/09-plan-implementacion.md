# 09 · Plan de implementación — Mapa de hidrantes

| | |
|---|---|
| **Estado** | Vivo. Se actualiza durante la construcción sin ceremonia; las casillas se marcan al terminar cada tarea. |
| **Versión** | 3.3 — 17 de septiembre de 2026. v3.0 sustituyó al plan v2.1; v3.1 (revisión de completitud y robustez) añade `CLAUDE.md` y skills, issues por tarea, convenciones para Claude Code, cabeceras, vigilancia, Dependabot, Lighthouse, push, exportación y degradación controlada; v3.2 explicita el control de versiones (Git/GitHub) y la ubicación local del repositorio; v3.3 añade el módulo de textos, las reglas UI, la concurrencia y la verificación por fase (DEC-047 a DEC-050); v3.4 (18 sep 2026) ajusta la Fase 0 a lo construido (DEC-052 a DEC-055). |
| **Propietario de** | fases, tareas, orden, definición de terminado, modelo de delegación, estimación y riesgos de ejecución. |
| **Lee antes de cada fase** | **01** (qué), **03** (cuánto), **04** (dónde), **05** (campos y firmas), **06** (aspecto). Este documento dice *en qué orden y cuándo está terminado*; no repite lo que dicen esos cinco. |
| **Para** | Claude Code, que ejecuta; el desarrollador, que interviene unas dos horas en total; jefatura, que acepta. |

Coste de software: 0 €. Convención de idioma: esquema, identificadores, enums, UI y comentarios de
código en **español** (00 §6).

**Skills que usa Claude Code en este proyecto** (04 §15): `supabase` y `supabase-postgres-best-practices`
(oficiales de Supabase), `cloudflare` (oficial de Cloudflare), `webapp-testing` y `frontend-design`
(oficiales de Anthropic) y `task-shaper` (de la organización, para la forma de cada issue). Se
instalan en la Fase 0 y quedan referenciados en `CLAUDE.md`.

---

## 1. Modelo de delegación

### Lo que hace Claude Code (prácticamente todo)

Código, migraciones, scripts, tests, CI/CD, documentación 13–15, generación del límite municipal y
del mapa base, creación del repositorio y de los proyectos de Cloudflare por CLI, configuración de
GitHub y de Supabase (Management API), aplicación de migraciones por CI, generación del código de
acceso real, capturas para el manual del voluntario (Playwright), checklist de aceptación y
promoción de los datos del piloto. Todo arranca con **un comando**: `npm run arranque`.

### Lo que hace el desarrollador

| Cuándo | Qué | Tiempo |
|---|---|---|
| Una vez, al arrancar | Crear en Cloudflare un token de API (*Cloudflare Pages: Edit*) y en Supabase un token de acceso, y pegarlos cuando `npm run arranque` los pida, junto con las contraseñas de base de datos de dev y prod (las tiene por la app de uniformidad; la Management API no las devuelve). El token de Supabase se puede borrar al terminar (DEC-055). | 12 min |
| Fase 1 | Abrir `datos/zona-cobertura.html` y confirmar que el límite cubre Albolote y Calicasas. | 3 min |
| Fase 5 | Abrir staging en su móvil a la luz del día y decir si los cinco tamaños se distinguen (TR-33). Si no, ajustar radios en Ajustes. | 10 min |
| Fase 9 | Aprobar el despliegue a producción y el workflow de promoción del piloto: dos clics en GitHub. | 2 min |
| Tras el lanzamiento | Crear la cuenta de Google institucional y transferir la propiedad siguiendo **15**. | 45 min |

**Total: unas dos horas.** Si un paso exige acceso manual a un panel web, es un defecto de este
plan: se sustituye por un script y se anota en 12. Las tres excepciones conocidas (token de
Cloudflare, contraseñas de BD, cuenta de Google) no tienen forma de evitarse.

Revisado el 17 de septiembre para ver si podía ser aún menos: (a) el token de Cloudflare es
imprescindible porque CI despliega desde GitHub Actions y la sesión OAuth de `wrangler login` no sirve
en un runner; (b) las contraseñas de BD se podrían evitar aplicando migraciones por la Management API,
pero `pg_dump` del respaldo las necesita igualmente, así que no ahorraría nada; (c) todo lo nuevo de
la v3.1 (dependencias, vigilancia, push, exportación) se diseñó para no añadir ni un paso manual:
Dependabot fusiona solo, la vigilancia abre issues sola, las claves VAPID las genera `arranque.ts`.

### Lo que hace jefatura

Nada hasta que la Fase 8 termine (DEC-043): valida **sobre staging**, con la aplicación funcionando,
no sobre documentos. Entonces: recorrer **10** en la calle con 2–3 voluntarios (media jornada, sin el
desarrollador), con 01 y 02 como guion; anotar desacuerdos como issues `alcance`; generar el código
del piloto desde Ajustes; aprobar el fin del piloto; comunicar el código real al grupo; dar la sesión
presencial de 20 minutos.

### Modelo y esfuerzo

**Opus, effort high, en todas las fases** (DEC-044). Sin excepciones por velocidad; una fase mal
hecha cuesta más que sus tokens.

---

## 2. Orden y dependencias

```
0 Entornos ─► 1 Zona ─► 2 Esquema ─► 3 RPC + Functions ─► 4 Acceso y armazón ─► 5 Mapa ─► 6 Operaciones ─► 7 Panel ─► 8 Calidad ─► 9 Aceptación y piloto
```

Fases 0–3 antes de escribir una línea de interfaz: un problema de despliegue descubierto en la
fase 9 es el más caro de todos, y un error en el esquema o en las RPC se paga durante todo el
proyecto. El frontend sobre una base sólida avanza deprisa. Cada fase termina cuando se cumple su
**criterio de salida**; ninguna empieza con el anterior en rojo.

---

## Fase 0 · Repositorio, entornos y despliegue

**Objetivo:** un commit en `develop` aparece solo en staging y uno en `main` solo en producción,
todo creado con un comando. Referencia: 04 §4, §10, §11.

- [x] `scripts/arranque.ts` (`npm run arranque`), idempotente, en este orden:
  1. Comprueba `gh auth status` y `wrangler whoami`; se detiene con el comando de login exacto si
     falta alguna sesión. Pide el token de Cloudflare, un token de acceso de Supabase (Management API,
     DEC-055) y las dos contraseñas de BD, que solo sirven para crear `hidrantes_migrador` (DEC-052).
  2. `gh repo create aron285-coder/hidrantes-albolote --public --source .` desde la carpeta ya
     inicializada en `C:\Proteccion civil\hidrantes-albolote` (DEC-053, DEC-055); primer commit con `docs/`, `CLAUDE.md`,
     `.gitignore` y `.gitattributes` (`* text=auto eol=lf`, para que Windows no meta CRLF); ramas
     `main` y `develop`; protección de `main` (solo PR, CI verde, sin *force push*) y de `develop`
     (CI obligatoria); *environments* `staging` y `production` (este con *required reviewers* =
     propietario); etiquetas y *milestones* de las fases. Todo por `gh api`.
  3. Localiza los dos proyectos de Supabase por nombre (Management API); obtiene `PROJECT_REF`,
     `anon key`, `service_role key`; construye la cadena del pooler (modo sesión, 5432).
  4. Configura Supabase por Management API en dev y prod: esquema `hidrantes` en los expuestos de
     PostgREST; URL de Pages en `uri_allow_list` de Auth; bucket con 5 MB y `mime` restringido.
  5. Crea los dos proyectos de Pages con Wrangler, rama de producción, variables y secretos.
     Bucket R2 del mapa base solo si hace falta (Fase 5).
  6. Genera el par GPG; sube la pública; **muestra la privada una sola vez** con la instrucción de
     guardarla según 15.
  7. Sube todos los secretos y variables de 04 §10 con `gh secret set` / `gh variable set`.
     `GITHUB_DISPATCH_TOKEN` se crea en la Fase 7, con `/api/lanzar-workflow` (DEC-055).
  8. Genera el par de claves **VAPID** (push) y lo sube como secretos/variables de Pages.
  9. Instala los skills de 04 §15 en `.claude/skills/` y escribe **`CLAUDE.md`** (§5 de este documento).
  10. Crea una **issue de GitHub por cada tarea** de las fases 1–9 de este documento con
      `scripts/crear-issues.ts`, usando la plantilla *feature* del skill `task-shaper` (Why de una
      frase, fuera de alcance, cómo verificar, criterios de aceptación como checklist, esfuerzo S/M/L),
      etiquetadas por fase, y un *milestone* por fase. Claude Code trabaja issue a issue y cierra cada
      una con su PR.
  11. Escribe `docs/entornos.md` (qué se creó y dónde) y rellena los valores reales de **15**.
- [x] Vite + React + TS + Tailwind + shadcn/ui; Prettier + ESLint; estructura de 04 §11. Fuentes
      Barlow Condensed, Source Sans 3 y JetBrains Mono **servidas localmente** (06 §3).
- [x] `_headers` con las cabeceras de TR-100 (generado en el build por `config/cabeceras.ts`, DEC-055); `manifest.webmanifest`; `robots.txt` por entorno.
- [x] `.github/dependabot.yml` (npm y Actions, semanal) y `automerge.yml` (fusiona parches y menores
      con CI verde; los mayores esperan).
- [x] *Conventional commits* + `release-please` (o equivalente sin cuenta externa): versión semántica,
      `CHANGELOG.md` automático, tag por release; la versión se inyecta en `<meta name="version">` y
      en Ajustes, y las tres últimas entradas del changelog se cargan en `config` para FR-167.
- [x] Plantilla de PR con la definición de terminado (§6), plantilla de issue, `CODEOWNERS` con el
      propietario y *hook* de pre-commit que detecta secretos (04 §11.1).
- [x] `ci.yml`: typecheck, lint, build, presupuesto de tamaño (TR-11), unitarios, pgTAP y Playwright,
      **contra Supabase local (`supabase start`) y `wrangler pages dev`**. Nunca contra dev ni prod.
- [x] `deploy-staging.yml`: `migrar.ts` contra dev, `cargar-zona.ts`, `seed-staging.sql`
      (idempotente), despliegue. Nunca `supabase db push`.
- [x] `deploy-prod.yml`: *environment* `production`, guarda (aborta con seed o `PROJECT_REF`
      incorrecto), `migrar.ts`, `cargar-zona.ts`, despliegue; en el primer despliegue genera el
      código de acceso real y lo deja en el *summary*.
- [x] `scripts/migrar.ts`: historial propio `hidrantes.migraciones_aplicadas`, orden, transacción,
      abortar si cambia el hash de una aplicada (04 §5, §12). `scripts/revertir.ts` para Pages.
- [x] Banda "ENTORNO DE PRUEBAS" con `VITE_ENTORNO=staging`; `noindex` y `robots.txt` en staging.
- [x] Copiar `docs/` (00–16) al repositorio tal cual. No se duplica nada en otro formato.
- [x] `src/lib/textos.ts` con el Apéndice A de **06** como punto de partida, y la regla de ESLint que
      prohíbe literales de interfaz fuera de ese módulo (TR-111).
- [x] Carpeta `docs/verificacion/` con la plantilla de `fase-N.md` (TR-115).

**Criterio de salida:** `npm run arranque` termina sin más pasos manuales que los tres pegados; un
commit trivial en `develop` aparece solo en staging con banda naranja; un PR a `main`, tras
aprobación, aparece solo en producción; un *push* directo a `main` es rechazado; el repositorio está
clonado en `C:\Proteccion civil\hidrantes-albolote`; las cabeceras de TR-100 se sirven; las issues de
las fases 1–9 existen con su milestone; `CLAUDE.md` está en la raíz. Verificado en ambos sentidos.

---

## Fase 1 · Zona de cobertura

**Objetivo:** los GeoJSON de la zona en el repositorio y cargados en BD, con comprobación
automática. Referencia: FR-53, FR-14, 04 §8.

- [x] `scripts/generar-zona.ts` (`npm run zona`): consulta Overpass (`admin_level=8`, Albolote y
      Calicasas; mirror alternativo y fuente IECA escrita como respaldo); simplifica; une; margen de
      400 m; escribe `datos/zona-cobertura.geojson`, `datos/limite-municipal.geojson`,
      `datos/nucleos.geojson`, `datos/meta.json` y `datos/zona-cobertura.html` (previsualización con
      Leaflet).
- [x] Test que comprueba diez coordenadas conocidas (cinco dentro por núcleo, dos en Calicasas, tres
      fuera) contra los GeoJSON.
- [x] `scripts/cargar-zona.ts` (`npm run cargar-zona`): `upsert` en `limite_municipal` y `nucleos`
      desde CI, tras las migraciones. Hasta que la Fase 2 cree las tablas, avisa y no carga (DEC-057).
- [x] Committear los GeoJSON: el build nunca depende de Overpass.

**Criterio de salida:** test de las diez coordenadas en verde; el desarrollador mira la
previsualización tres minutos y confirma.

---

## Fase 2 · Esquema de base de datos

**Objetivo:** esquema `hidrantes` aplicado en staging por CI, con RLS, Storage, `pg_cron` y seed.
Referencia: **05 §1–5, §10–11** al pie de la letra; 04 §5 (PostGIS primero en dev).

- [ ] Migración 0001: extensiones (`postgis`, `pg_cron`), enums, tablas, constraints, índices,
      secuencias, triggers (`actualizado_en`, protección de `registro`).
- [ ] Migración 0002: vistas `security_invoker` (05 §4) con `fn_radio_px` leyendo `config`.
- [ ] Migración 0003: RLS y grants exactamente como 05 §5; `revoke execute` de
      `fn_verificar_codigo`, `fn_reservar_subida`, `fn_fotos_referenciadas` a `anon` y
      `authenticated`.
- [ ] Migración 0004: `config` con defaults de 05 §2.10; `administradores` con el propietario;
      trabajos `pg_cron` de 04 §9.
- [ ] Bucket y políticas de Storage (via `arranque.ts` y migración de políticas): sin escritura
      para `anon`/`authenticated`, lectura pública.
- [ ] `supabase/seed-staging.sql` según 05 §11.

**Criterio de salida:** pgTAP en verde para: constraints de diámetro y racor por tipo; `no_funciona`
sin descripción rechazado; punto sin foto rechazado; `insert` en Storage con `anon` rechazado;
`registro` sin `update`/`delete`; dos altas concurrentes obtienen códigos distintos; cada vista
devuelve filas con el rol previsto.

---

## Fase 3 · Funciones RPC y Pages Functions

**Objetivo:** toda la lógica de escritura probada antes de tocar la UI. Referencia: **05 §6–9**.

- [ ] RPC de voluntario (05 §6.1), con `fn_validar_token` al inicio de cada una y tiempo constante
      en `fn_verificar_codigo`.
- [ ] RPC de jefatura (05 §6.2), incluidos los casos límite con mensaje explícito y los códigos de
      error de 05 §8.
- [ ] Helpers (05 §6.3).
- [ ] `functions/api/{verificar-codigo,url-subida,direccion,lanzar-workflow,push}.ts` con el contrato de
      05 §9; cola de 1 req/s para Nominatim; `wrangler pages dev` en CI.
- [ ] Tests pgTAP y tests de las Functions en CI.

**Criterio de salida:** tests en verde para: código erróneo rechazado; 11 intentos bloqueados;
`fn_verificar_codigo` desde `anon` → *permission denied*; token revocado rechazado; reserva 41 del
día rechazada; `foto_path` de otro dispositivo rechazado; alta → aprobación → punto visible con
`direccion`; aprobación con correcciones; `DIAMETRO_SIN_FIJAR`; rechazo sin motivo rechazado;
no-admin no aprueba; admin que llama a `fn_proponer` ve el cambio aplicado sin cola; `clave_local`
repetida no duplica; duplicado solo del mismo tipo; `fn_mis_propuestas` con otro token no devuelve
nada ajeno; `fn_cambiar_codigo_acceso(…, true)` revoca todos los tokens; `fn_aprobar_lote` con una
desactualizada aprueba las demás; `/api/direccion` sin JWT → 403.

---

## Fase 4 · Acceso y armazón del frontend

**Objetivo:** aplicación que arranca, pide código y nombre, y navega entre pantallas vacías.
Referencia: FL-01, FL-12, FL-20; 07 §7.1; 06.

- [ ] Pantalla de entrada → `POST /api/verificar-codigo`; enlace a Google para jefatura.
- [ ] `dispositivo_id` uuid generado una vez; persistencia local de token, nombre, apellido y
      `dispositivo_id`. El código no se guarda. Token inválido → pedir código conservando el nombre.
- [ ] Mensajes de bloqueo por intentos sin pistas (FR-33).
- [ ] Login Google en la misma PWA; "No autorizado" si no está en `administradores`; etiqueta
      Jefatura; ruta `/admin`.
- [ ] Armazón: navegación inferior Mapa / Lista / Ajustes; Ajustes con lo de FR-93 (lo que dependa
      de fases posteriores, como placeholder claro).
- [ ] PWA: manifest, iconos con el escudo, Service Worker con precache del armazón y `autoUpdate`
      con aviso "hay una versión nueva, recargar" (TR-24). Fuentes servidas localmente (06 §3).
- [ ] Captura global de errores → `fn_registrar_error`, con cola offline propia; **límites de error**
      por pantalla con "volver al mapa" (TR-106).
- [ ] **Degradación controlada** (FR-168): estado global "servidor no disponible" cuando Supabase o una
      Function fallan; la app sigue con datos locales, muestra el aviso y reintenta con retroceso
      exponencial. Sin pantallas en blanco ni errores técnicos visibles.
- [ ] Tres pantallas de primer uso (FR-94), saltables y recuperables desde Ajustes.
- [ ] Notas de iOS en **14**: instalación por "Compartir → Añadir a pantalla de inicio"; Safari puede
      desalojar IndexedDB.

**Criterio de salida:** instalable en un Android real y un iPhone real, con icono y a pantalla
completa; un error provocado aparece en `errores_cliente`; un correo no autorizado ve "No
autorizado".

---

## Fase 5 · Mapa, capas y simbología

**Objetivo:** el mapa operativo, con y sin cobertura. Referencia: FR-60–71, FR-80–81; **06 §4**;
04 §8; 07 §7.2 y §7.6.

- [ ] `scripts/generar-mapabase.ts` (`npm run mapabase`): `pmtiles extract` del recuadro; imprime
      tamaño; ≤ 20 MB a Pages, si no a R2; `VITE_MAPABASE_URL`.
- [ ] Descarga completa del PMTiles a Cache Storage (automática con wifi, manual desde Ajustes),
      servicio de rangos desde la caché, indicador de estado y versión, aviso si falta (FR-81).
- [ ] Leaflet con `protomaps-leaflet`; estilo claro y oscuro del mapa base desde los tokens de 06
      §2.3, en un solo archivo `src/lib/estilo-mapabase.ts`.
- [ ] Capas en línea (OSM, PNOA, Catastro) en `src/lib/capas.ts`, con atribución, `User-Agent`
      identificable, capa recordada, y degradación en gris sin conexión. Verificar que PNOA y
      Catastro responden por HTTPS y no filtran por `Referer`.
- [ ] Límite de zona dibujado; encuadre inicial; centrar en mi posición con halo de precisión.
- [ ] Marcadores según **06 §4** exactamente: `radio_px` viene de `v_puntos_activos`; forma, borde,
      tachado, discontinuo, declutter por zoom, objetivo táctil ≥ 44 px, sin agrupación.
- [ ] Leyenda con el contenido y orden de 06 §4.5.
- [ ] Caché de puntos en IndexedDB con sincronización incremental (05 §10) y sello visible.
- [ ] Búsqueda local (código, dirección, descripción) en mapa y lista; pestaña Lista con filtros y
      orden de FR-68.
- [ ] Ficha (FR-66) con menú "Proponer un cambio" y **"Cómo llegar"** (FR-161: enlace `geo:`/Google
      Maps/Apple Plans según plataforma); comprobar en la respuesta de red que no viajan autores ni
      historial.
- [ ] Layout adaptable: ≥ 900 px lista lateral y ficha flotante; tableta con botones laterales.
- [ ] Modo oscuro completo (interfaz y mapa base).

**Criterio de salida:** con el mapa base descargado, mapa y búsqueda funcionan en modo avión con los
datos de la última sincronización; las cuatro capas cargan en 3G; los tests unitarios cubren las
12 combinaciones de simbología; el desarrollador confirma que los cinco tamaños se distinguen en su
móvil a la luz del día.

---

## Fase 6 · Las seis operaciones

**Objetivo:** que un voluntario proponga cualquier cambio, con o sin cobertura, y que jefatura
pueda hacerlo desde el móvil. Referencia: FL-03–FL-11, FL-28; 07 §7.3–7.5; 05 §7, §10.

- [ ] Alta nueva según FL-03: pin arrastrable + GPS con precisión; tipo; diámetro con "otra medida";
      racor con fotos de referencia servidas con la app (`src/activos/racores/`); caudal;
      descripción del fallo condicional; foto obligatoria con botón deshabilitado que dice por qué;
      descripción.
- [ ] Aviso de fuera de zona con Turf sobre `zona-cobertura.geojson`, sin bloquear.
- [ ] Tratamiento de la foto en el cliente (TR-15, TR-47): orientación, ≤ 1600 px, recompresión,
      EXIF leído y enviado aparte.
- [ ] Revisión (un botón), actualizar estado, corregir datos, corregir ubicación (posición actual
      gris + línea de desplazamiento), proponer retirada (motivo rápido + texto + foto). Pantallas de
      07 §7.3.
- [ ] Variante jefatura: "Aplicar ahora", resultado "Aplicado".
- [ ] Cola offline en IndexedDB con `clave_local`, blob de foto, contador visible, reintentos con
      retroceso exponencial, fallos permanentes mostrados al voluntario, aviso a las 24 h. Envío:
      `url-subida` → `PUT` → `fn_proponer` (05 §10).
- [ ] Mis propuestas con estado, motivo, correcciones, sin enviar, retirar. Aviso de resolución al
      abrir (comprobación local, sin push).
- [ ] "Algo no funciona" → `fn_reportar_incidencia`.
- [ ] Ajustes completo (FR-93), incluido cerrar sesión con confirmación si hay envíos pendientes.
- [ ] **Notificaciones push del voluntario** (FR-163, P1): interruptor en Ajustes, explicación previa
      al permiso (iOS solo con la app instalada), suscripción con `fn_guardar_suscripcion_push`,
      Service Worker que muestra la notificación y abre Mis propuestas. Tras cada sincronización el
      cliente llama a `/api/push`.

**Criterio de salida:** dar de alta tres puntos con foto en modo avión, recuperar cobertura y ver que
llegan los tres, una sola vez cada uno; forzar un reenvío duplicado y comprobar que no crea una
segunda propuesta; un administrador desde el móvil ve su cambio en el mapa sin pasar por la cola.

---

## Fase 7 · Panel de jefatura

**Objetivo:** que aprobar sea rápido. Referencia: FR-100–145; FL-20–31; **08** (que ya lo prototipa
tal cual); 05 §6.2, §9.

- [ ] Siete pestañas y búsqueda global (FR-145).
- [ ] Cola de revisión en dos columnas con lista, filtros, casillas y barra de acciones en bloque;
      detalle con minimapa, dirección deducida (`/api/direccion`, campo editable), diff, señales,
      foto; acciones Aprobar / Aprobar con correcciones (formulario en el mismo panel) / Rechazar /
      Fusionar (comparación en dos columnas y elección por campo); propuesta desactualizada con
      confirmación; historial por estado y fechas.
- [ ] Inventario: tabla con filtros, orden, paginación de 50, dirección en celda, tabla/mapa,
      acciones editar / retirar / borrar / historial.
- [ ] Revisiones caducadas por núcleo y hoja de campo con CSS de impresión (FR-122).
- [ ] Registro con filtros y paginación; historial de un punto desde su ficha.
- [ ] Papelera con restaurar.
- [ ] Voluntarios: actividad 3/12 meses con anonimizar; incidencias con marcar resuelta.
- [ ] Ajustes: código con confirmación y revocar; administradores con sugerencias de `app_users`;
      parámetros con Guardar; núcleos (renombrar / añadir el que Overpass no traiga); Salud del
      sistema (`fn_salud`); purga vía `/api/lanzar-workflow`; descarga JSON. Atribución a Nominatim en
      el pie.
- [ ] **Exportación** (FR-160, P1): botón en Inventario que genera `.xlsx` (SheetJS), `.csv` (UTF-8
      BOM) y `.geojson` con los filtros activos, en el navegador, y registra `exportacion`.
- [ ] **Código QR** del enlace (FR-162, P1) en Ajustes, con vista imprimible A4.
- [ ] **Regenerar zona / mapa base y lanzar respaldo** desde Ajustes vía `/api/lanzar-workflow`
      (FR-165); **Núcleos** (FR-166); **Novedades** (FR-167) desde `fn_novedades`.
- [ ] **Push para jefatura** (FR-164, P1): suscripción desde Ajustes; `fn_proponer` encola un aviso
      agrupado por hora; el resumen semanal lo genera `vigilancia.yml` los lunes.
- [ ] Aviso de "servidor no disponible" en el panel (FR-168).
- [ ] Escritorio primero, usable en tableta; accesible por teclado (TR-35).

**Criterio de salida:** aprobar 20 revisiones en bloque en menos de 30 segundos y verlas en
`registro`; detectar y fusionar un duplicado introducido a propósito a 8 m; una propuesta
desactualizada exige confirmación; el formulario de correcciones guarda `correcciones` y el autor lo
ve en Mis propuestas.

---

## Fase 8 · Calidad, respaldo y observabilidad

**Objetivo:** que el sistema sobreviva sin mantenimiento activo. Referencia: **03** (todo), 04 §9,
§12; **11**; **15**.

- [ ] Tests unitarios de `src/lib`: simbología (12 combinaciones), geometría, formato de fechas y
      distancias (TR-80).
- [ ] pgTAP completo (Fases 2–3) en CI contra base efímera.
- [ ] E2E Playwright en CI: camino crítico completo (entrar → alta con pin manual y foto por URL
      firmada → aprobar con dirección → aparece en el mapa → retirar → restaurar), más los casos de
      TR-04, TR-06, TR-24.
- [ ] `respaldo.yml`: `pg_dump` semanal del esquema `hidrantes` cifrado con GPG, artefacto con 90
      días; sincronización mensual del bucket. Escribe `config.ultimo_respaldo`. Nunca a una rama.
- [ ] **Prueba de restauración** ejecutada una vez sobre una base limpia; procedimiento en 15.
- [ ] Presupuesto de rendimiento en CI (TR-10, TR-11); prueba de carga con 1.000 puntos en un móvil
      real (TR-12–TR-14), documentando el dispositivo.
- [ ] Accesibilidad: contraste de los tokens de 06 (TR-31), objetivos táctiles (TR-32), foco.
- [ ] Checklist de las ocho pruebas de intrusión (TR-40) ejecutada y documentada en 11.
- [ ] **Lighthouse CI** en `deploy-staging.yml` con los umbrales de TR-103 y **axe** en e2e.
- [ ] **Prueba de cabeceras** (TR-100) en e2e contra staging tras el despliegue (lectura, sin datos).
- [ ] **`vigilancia.yml`** (TR-102): app, RPC, respaldo reciente, push pendientes; issue automática
      con etiqueta `vigilancia`; Salud del sistema muestra la última ejecución.
- [ ] **Prueba de compatibilidad hacia atrás** (TR-107): la última versión publicada del frontend
      contra la BD con las migraciones nuevas, en CI.
- [ ] **Prueba de degradación**: Supabase inaccesible (bloqueo de red en e2e) → la app muestra datos
      locales y el aviso; Functions inaccesibles → la entrada explica el problema; Storage al 90 % →
      banda en Salud.
- [ ] `scripts/restaurar.ts` y `scripts/restaurar-fotos.ts` (solo esquema `hidrantes`, transacción, confirmación escrita, guarda de `PROJECT_REF`) y `npm run arranque -- --rotar <secreto|todo>`: son los que usa **15** §5.3 y §5.6. Probados en la prueba de restauración.

**Criterio de salida:** CI verde con las tres capas; un respaldo restaurado con éxito; las ocho
pruebas de intrusión fallando como se espera; presupuesto de rendimiento y Lighthouse cumplidos;
cabeceras A; `vigilancia.yml` ha corrido en verde tres días seguidos; la prueba de degradación pasa.

---

## Fase 9 · Aceptación, piloto y puesta en marcha

**Objetivo:** jefatura aprueba **10** completa y se abre el acceso a la agrupación. Referencia: 04
§13; 13, 14, 15.

- [ ] **Validación de jefatura sobre staging** (primera vez que ve el sistema): sesión de una hora
      con 07/08 sustituidos por la app real; recorrido de **10** en campo con 2–3 voluntarios;
      desacuerdos → issues `alcance` → 12 → corrección antes del piloto.
- [ ] Piloto de una semana en staging con un barrio real y 5–8 voluntarios; jefatura genera antes un
      código real desde Ajustes. Incidencias en la pestaña Voluntarios.
- [ ] Corregir lo que salga; volver a pasar los casos de 10 afectados.
- [ ] PR `develop` → `main`; aprobación; despliegue automático con código real en el *summary*.
- [ ] `scripts/promover-piloto.ts` (`promover-piloto.yml`, manual con aprobación): cola de staging a
      cero → lee puntos activos no `[PRUEBA]` con propuestas aprobadas y registro → copia fotos
      entre buckets → inserta conservando códigos y avanza secuencias → informe. Idempotente por
      `codigo`.
- [ ] Autorizar los correos de jefatura desde Ajustes (solo el propietario viene por migración).
- [ ] `scripts/capturas.ts` (Playwright emulando móvil sobre staging) deja las capturas listas en
      `docs/capturas/`; los manuales **13** y **14** se escriben después con ellas (decisión de
      jefatura: manuales al final).
- [ ] **15** verificado con los datos reales del arranque (`docs/entornos.md`) y la prueba de
      restauración de la Fase 8 anotada.
- [ ] Sesión presencial de 20 minutos en una reunión ordinaria: instalar, entrar, dar de alta un
      punto real en la puerta de la sede.
- [ ] Comunicar el código real al grupo (jefatura).

**Criterio de salida:** todos los casos de 10 en verde con firma de jefatura; datos del piloto en
producción; los 65 tienen el enlace y el código.

---

## 3. Riesgos de ejecución

Los riesgos de seguridad y privacidad viven en **11**; aquí, los de construcción y operación.

| Riesgo | Mitigación |
|---|---|
| Duplicados por reenvío de la cola offline | `clave_local` con índice único, comprobada en `fn_proponer`. |
| Los tamaños de marcador no se distinguen a pleno sol | Radios en `config`; se ajustan sin desplegar; validación en Fase 5. |
| PNOA o Catastro cambian de URL | Capas centralizadas en `src/lib/capas.ts`; OSM como respaldo. |
| Overpass cae al regenerar la zona | Mirror alternativo, fuente IECA escrita, GeoJSON committeado. |
| Safari desaloja IndexedDB o la caché del mapa base | Contador de pendientes siempre visible, aviso a las 24 h, estado del mapa en Ajustes, redescarga de unos MB. |
| El PMTiles supera 25 MB | Decidido: > 20 MB va a R2; cambia `VITE_MAPABASE_URL`, no el código. |
| Un hidrante con salida distinta de 70/100 | "Otra medida" llega marcada; jefatura fija o rechaza. |
| Aparece un cuarto racor | `tipo_racor` es enum; migración de una línea. |
| Nadie revisa la cola durante semanas | Salud del sistema muestra pendientes > 14 días. |
| Dos repositorios pisan el historial de migraciones compartido | Historial propio y `psql`; nunca `db push`. |
| Dos voluntarios cambian el mismo punto el mismo día | Propuesta desactualizada con confirmación. |
| Un lote falla entero por un caso raro | `fn_aprobar_lote` procesa una a una y devuelve qué quedó fuera. |
| Los datos del piloto se pierden al arrancar producción vacía | `promover-piloto.ts` idempotente con informe. |
| Nominatim no responde | Dirección opcional; nunca bloquea; pendiente visible en Salud. |
| Los runners de GitHub no llegan a la BD (IPv6) | `SUPABASE_DB_URL` por el pooler de Supavisor. |
| Falta una sesión de CLI al arrancar | `arranque.ts` lo detecta antes de crear nada a medias. |
| Los tests e2e contaminan Supabase compartido | CI levanta Supabase local; nunca dev ni prod. |
| El respaldo existe pero no se puede restaurar o deja fuera las fotos | Restauración probada una vez; bucket sincronizado mensualmente. |
| La URL `pages.dev` es poco memorable | Decisión cerrada (DEC-006): enlace fijado, QR en la sede, acceso directo de la PWA. |
| El proyecto depende de una sola persona | Cuentas institucionales y comprobación anual (15). |
| Una dependencia con vulnerabilidad se queda sin actualizar | Dependabot semanal con fusión automática de parches y menores; los mayores abren PR visible. |
| La app deja de responder y nadie se entera | `vigilancia.yml` diario abre una issue; Salud del sistema lo muestra. |
| Un cambio de esquema rompe los móviles que aún no se han actualizado | Contrato compatible una versión hacia atrás y prueba en CI (TR-107); auto-actualización de la PWA (TR-24). |
| Las notificaciones push fallan en iPhone | Opt-in explícito con explicación; la app funciona igual sin ellas; el aviso al abrir (FR-90) sigue siendo el canal principal. |
| Claude Code pierde el contexto entre sesiones | `CLAUDE.md` en la raíz, issues por tarea con criterios de aceptación, y el registro de avance de §8. |
| Una exportación sale con acentos rotos en Excel | CSV con BOM y `.xlsx` nativo; test que abre el archivo. |

---

## 4. Estimación

| Fase | Esfuerzo |
|---|---|
| 0 · Repositorio, entornos, `arranque.ts`, `CLAUDE.md`, issues, cabeceras, Dependabot | 3 días |
| 1 · Zona de cobertura | 0,5 día |
| 2 · Esquema, Storage, `pg_cron`, seed | 2 días |
| 3 · RPC, Pages Functions, pgTAP | 3 días |
| 4 · Acceso por token, jefatura en la PWA, armazón | 2 días |
| 5 · Mapa, mapa base offline, búsqueda, layout | 3,5 días |
| 6 · Seis operaciones, cola offline con fotos, EXIF | 4 días |
| 7 · Panel completo | 4 días |
| 8 · Calidad, respaldo, restauración, carga, seguridad, Lighthouse, vigilancia, degradación | 4 días |
| 9 · Aceptación, piloto, promoción de datos, capturas | 1,5 días |
| P1 (tras el piloto) · push, exportación, QR, workflows desde Ajustes, novedades | 2,5 días |

**Total: ~30 días de trabajo enfocado de Claude Code** (27,5 hasta el piloto + 2,5 de P1), más una
semana de piloto en paralelo. Del desarrollador, unas dos horas.

---

## 5. Convenciones para Claude Code (`CLAUDE.md`)

Lo que va en el `CLAUDE.md` de la raíz, en este orden:

1. **Qué es el proyecto** en tres líneas y dónde está la verdad: 00 §2 (un hecho, una casa). Antes
   de tocar un campo, leer 05; antes de un color o tamaño, 06; antes de una regla, 01.
2. **Orden de trabajo:** issue abierta más antigua de la fase en curso; una rama por issue
   (`fase-N/nombre-corto`); un PR por issue; el PR enlaza la issue y marca su checklist.
3. **Prohibiciones duras:** nunca `supabase db push`; nunca tocar el esquema `public`; nunca
   commitear secretos ni respaldos; nunca pruebas contra dev o prod (solo Supabase local); nunca
   `insert`/`update` directo desde el frontend; nunca "defecto" (es "no funciona").
4. **Idioma:** español en código, esquema, UI y commits. Términos fijos de 00 §6.
5. **Commits:** *conventional commits* en español (`feat(mapa): …`, `fix(cola): …`).
6. **Cambios de documentación:** si una tarea obliga a cambiar 01–06, primero el documento
   propietario, luego una entrada en 12, luego el código. Nunca al revés.
7. **Skills disponibles y cuándo usarlos** (04 §15).
8. **Cómo arrancar el entorno local:** `supabase start`, `npm run dev`, `wrangler pages dev`,
   `npm test`, `npm run e2e`.

## 6. Definición de terminado (por PR)

Plantilla de PR, en forma de checklist (es la forma del skill `task-shaper`):

- [ ] La issue enlazada tiene todos sus criterios de aceptación marcados.
- [ ] Tests: unitarios y pgTAP para lo tocado; e2e si cambia un flujo de 02.
- [ ] CI verde (typecheck, lint, build, presupuesto, tests, Lighthouse en staging).
- [ ] Ningún requisito nuevo inventado: todo lo que hace el código está en 01 o en 12.
- [ ] Cambios de esquema compatibles hacia atrás (04 §12) y reflejados en 05.
- [ ] Textos de UI en español, sin jerga técnica, con los términos de 00 §6.
- [ ] Sin secretos, sin `console.log` de datos personales, sin dependencias nuevas sin motivo escrito.
- [ ] Reglas de interfaz de **06 §9** cumplidas en lo tocado: ningún control muerto, motivo en los
      botones deshabilitados, estado vacío en las listas, notación canónica, separación de acciones
      destructivas, objetivos táctiles.
- [ ] Textos nuevos añadidos a `src/lib/textos.ts` **y** al Apéndice A de 06 en este mismo PR.
- [ ] Escrituras con bloqueo por fila y tests de concurrencia si toca una RPC de escritura (05 §11).
- [ ] Registro de avance (§8) actualizado si cierra una fase, con `docs/verificacion/fase-N.md` (§7).

## 7. Verificación por fase

Al cerrar cada fase, Claude Code escribe `docs/verificacion/fase-N.md` antes de abrir el PR final de
esa fase. Es lo que permite al desarrollador no revisar el código línea a línea:

1. **Qué se ha construido**, en cinco líneas.
2. **Casos de 10 ejecutados**: identificador, cómo se comprobó (test automático, script de
   Playwright, comprobación manual), resultado. Los que no aplican todavía, marcados como tales.
3. **Cómo reproducirlo**: comandos exactos.
4. **Suposiciones tomadas** donde 01–06 no llegaban, con la entrada de 12 correspondiente.
5. **Lo que queda abierto** y en qué issue está.

Sin ese archivo la fase no está terminada (TR-115). El criterio de salida de la fase se copia ahí
con su resultado.

## 8. Registro de avance

| Fase | Estado | Fecha | Notas |
|---|---|---|---|
| 0 | terminada | 18 sep 2026 | Repositorio público (DEC-053); rol `hidrantes_migrador` (DEC-052); `mantener-activo.yml` (DEC-054); ajustes del arranque (DEC-055); un PR a `main` de prueba (DEC-056). Changelog en `config` (FR-167) y versión en Ajustes quedan para las Fases 2 y 4. Verificación: `docs/verificacion/fase-0.md`. |
| 1 | terminada | 18 sep 2026 | Diez núcleos desde OSM; margen de 400 m también en el servidor; carga en espera de las tablas de la Fase 2 (DEC-057). Verificación: `docs/verificacion/fase-1.md`. |
| 2 | pendiente | | |
| 3 | pendiente | | |
| 4 | pendiente | | |
| 5 | pendiente | | |
| 6 | pendiente | | |
| 7 | pendiente | | |
| 8 | pendiente | | |
| 9 | pendiente | | |

Se rellena al cerrar cada fase con la fecha y cualquier desviación respecto a 01–06 (que se corrige
primero en el documento propietario y se anota en 12).
