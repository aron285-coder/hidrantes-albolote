# Recorrido completo de la app en staging · 8 oct 2026 (docs/32 RV-270, DEC-184)

| | |
|---|---|
| **Qué** | La app entera recorrida como una persona, en una ventana de Chromium visible en este PC (`headless: false`, `slowMo` 250 ms), que se quedó abierta todo el recorrido. |
| **Dónde** | Voluntario: **staging real** (`hidrantes-albolote-staging.pages.dev`), commit `4ab5c44`; a mitad del recorrido se desplegó `d21136e` (solo documentación) y la app lo ofreció con su aviso de versión nueva (§2, fila 5.4). Primera vez y panel: el build de `4ab5c44` con el modo de staging, servido en local con el servidor simulado de los e2e. Pasos reales de jefatura: en la base de staging con claims de administrador en una transacción. |
| **Tamaños** | Móvil Pixel 7 (412 × 915, táctil), una pasada a 360 px, escritorio 1440 × 900 y zoom del navegador al 200 % (720 × 450 CSS). Claro y oscuro. |
| **Capturas** | [`recorrido/2026-10-08/`](recorrido/2026-10-08/): 86 capturas en JPEG de 720 px de ancho; las `v…` llevan un recuadro rojo sobre lo que se comenta. Solo datos de prueba (`[PRUEBA]`, firma ficticia «Prueba Recorrido», nombres ficticios del simulado y correos `example.org`). |
| **Bocetos** | [`recorrido/2026-10-08/propuestas.html`](recorrido/2026-10-08/propuestas.html) (P3, P4 y P5). |

## Cómo, sin ver ningún secreto

- **Cadena de staging.** Traspaso de `SUPABASE_DB_URL` del environment `staging` con clave efímera (`traspaso.yml`, el mismo sobre RSA-OAEP + AES-256-GCM que `scripts/traspasar-secreto.ts`). Se descifró **en memoria** dentro de un proceso local que no la escribió nunca a disco, ni a un argumento, ni a la salida (RV-208): `psql` la recibía por el entorno del proceso hijo (`PG*`) y `npm run anonimizar` por `SUPABASE_DB_URL` en su entorno. Antes de usarla, el proceso comprobó que el ref era el de staging. Artefacto y ejecución del traspaso, borrados. Al acabar, el proceso se cerró y la cadena se fue con él.
- **Entrada como voluntario.** Como en RV-139b: un token aleatorio cuyo sha256 se guardó en `hidrantes.dispositivos` para un dispositivo nuevo, comprobado con `fn_validar_token`, y puesto en el almacenamiento local de cada contexto de Playwright. Nadie tecleó ni leyó el código de acceso.
- **Primera vez** (bienvenida, código, nombre): en el build local con `/api/verificar-codigo` simulado y códigos ficticios (uno incorrecto y uno correcto). Nunca con el código real.
- **Jefatura.** Nada de Google ni de credenciales. El panel se recorrió en el build local con el simulado de los e2e (`conGoogle`, tablas y RPC). En la base de staging, con `request.jwt.claims` de un administrador activo locales a la transacción (correo leído dentro de la consulta, nunca impreso): `fn_es_admin()` = `true`, `fn_salud()` responde con los campos de 0041, la cola real tenía exactamente las 6 propuestas del recorrido (5 con foto: *Corregir datos* no la exige) y se rechazaron con `fn_rechazar(…, 'prueba')`.
- **Tiempos** con `performance.now()` del navegador alrededor de cada paso (incluyen los 250 ms de `slowMo` del clic) y de la navegación; **consola** con los eventos `console` (error y warning) y `pageerror` de cada página.
- **Staging como estaba.** Antes: 15 puntos activos, 0 propuestas pendientes, 8 dispositivos activos. Después: lo mismo. Las 6 propuestas del recorrido, rechazadas con «prueba» (el alta rechazada no crea punto: no hubo nada que borrar). El dispositivo de prueba: *Cerrar sesión* en la app lo revocó (`revocado_en` puesto) y `npm run anonimizar -- --entorno staging` anonimizó sus 12 filas.

## 1. Resumen

1. La app está **madura y coherente**: los nueve bloques se recorren de punta a punta, en claro, oscuro, 360 px, escritorio y zoom 200 %, sin desbordes horizontales y con axe limpio salvo dos avisos menores.
2. **Un defecto alto que bloquea la 0.10.0 (#561):** `/api/geocodificar` y `/api/push` rechazan el token de **todos** los voluntarios porque `service_role` no puede ejecutar `fn_listar_puntos`; la búsqueda de portales nunca funciona y dice «Vuelve a entrar con el código», y el aviso inmediato tras enviar no se pide. También está en producción.
3. Tres defectos medios: en escritorio la página entera se desplaza 275 px (#562); *Corregir datos* dice «foto obligatoria» y envía sin ella (#563); con `PUNTO_NO_ACTIVO`, *Aprobar* sigue activo (#564, el pendiente conocido).
4. Lo mejor: sin conexión → guardar → con conexión → cola enviada en 1,4 s; salir de un formulario a medias pregunta; el panel de la cola, la fusión y el lote son claros y rápidos.
5. Lo que más ganaría con poco esfuerzo: abrir el mapa centrado en el voluntario, que *Mis propuestas* diga qué se propuso, y quitar las siglas y la jerga que quedan (capas, «Guardado protegido», tareas de Salud).

## 2. Tabla de recorridos

M = Pixel 7 · 360 = móvil a 360 px · E = escritorio 1440 × 900 · Z = zoom 200 %. «ok» = se ve bien y hace lo que dice.

| # | Pantalla | Tamaño | Modo | Resultado | Captura |
|---|---|---|---|---|---|
| 1.1 | Entrada: código, nombre, legal | M, E | claro, oscuro | ok; vacío dice «El código son 6 cifras» y «Escribe tu nombre y apellido» | `p01-…`, `p02-entrada-vacia-pv-movil-claro.jpg` |
| 1.2 | Código incorrecto (simulado) | M | claro | ok: «Código incorrecto», conserva el nombre | `p03-codigo-incorrecto-pv-movil-claro.jpg` |
| 1.3 | Bienvenida 1, 2 y 3 | M, E | claro, oscuro | ok; axe limpio | `p04-…`, `p05-…`, `p06-…` |
| 1.4 | Permiso de ubicación concedido | M, E | claro | ok | `p07-primer-mapa-pv-movil-claro.jpg` |
| 1.5 | Permiso de ubicación denegado | M | oscuro | **no verificable**: Chrome automatizado deja el permiso en «preguntar» y no lo deniega; la app se queda en «Buscando tu posición…» y ofrece marcar el incidente a mano | `p09-posicion-denegada-movil-oscuro.jpg` |
| 2.1 | Mapa al abrir | M, E | claro, oscuro | problema leve: abre con toda la zona y los 15 puntos en dos manchas (P1) | `v13-mapa-inicio-toda-la-zona.jpg`, `g01-mapa-movil-oscuro.jpg` |
| 2.2 | Marcadores por estado, anillo de sin revisar | M | claro | ok | `m04-marcadores-movil-claro.jpg` |
| 2.3 | Capas (base propio, calle, satélite, catastro) | M, E | claro, oscuro | problema leve: siglas (OSM, PNOA) y `li` sin `ul` (axe) | `v09-capas-siglas-y-lista-sin-ul.jpg` |
| 2.4 | Buscar por código y por calle | M | claro | ok, 0,3 s | `m05-…`, `m06-buscar-calle-movil-claro.jpg` |
| 2.5 | Buscar dirección con portal | M | claro | **problema alto** (D1, #561) | `v12-buscador-dos-cerrar-y-portal-sin-acceso.jpg` |
| 2.6 | «¿Qué hay aquí?» | M | claro | no se abrió con el clic derecho del ratón en la emulación táctil; lo cubren los e2e (`mapa.spec.ts`) | — |
| 2.7 | Medir | M | claro | ok; etiquetas de tramo solapadas en el vértice (D7) | `v05-medir-etiquetas-solapadas.jpg` |
| 2.8 | Cercanos | M, 360, E | claro, oscuro | ok; «·» huérfano al partir el subtítulo (D8) | `v06-cercanos-punto-huerfano.jpg` |
| 2.9 | Leyenda y zoom | M, E | claro, oscuro | ok | `m01-…`, `g01-mapa-escritorio-oscuro.jpg` |
| 3.1 | Ficha: banda, datos, coordenadas | M, E | claro, oscuro | ok; las fotos del seed no existen en staging (D12) | `m10-ficha-movil-claro.jpg`, `g05-…` |
| 3.2 | Cómo llegar | M, E | claro | ok: `geo:` en Android, Google Maps web en escritorio | `m10-…` |
| 3.3 | Compartir | M | claro | sin hoja visible: Chrome abre el diálogo nativo, que no sale en la captura | — |
| 3.4 | Proponer un cambio (menú de las seis) | M | claro | ok | `m17-menu-operaciones-movil-claro.jpg` |
| 4.1 | Alta: hidrante, otra medida 80, Barro, dos fotos, **sin conexión** | M | claro | ok: guardado en 0,8 s y enviado solo en 1,4 s al volver la conexión | `m13-…`, `m14-…`, `m15-cola-sin-enviar-movil-claro.jpg` |
| 4.2 | Volver atrás a mitad del alta | M | claro | ok: «¿Salir sin enviar?» con *Salir* y *Seguir* | `m12-alta-volver-atras-movil-claro.jpg` |
| 4.3 | Revisión «Sigue igual» con foto | M | claro | ok, 1,2 s | `m19-enviado-movil-claro.jpg` |
| 4.4 | Estado → No funciona con fallo | M | claro | ok, 0,6 s | `m20-estado-movil-claro.jpg` |
| 4.5 | Corregir datos → enganche Directo | M | claro | **problema medio** (D3, #563) | `v04-datos-foto-obligatoria-que-no-lo-es.jpg` |
| 4.6 | Corregir ubicación con dos fotos | M | claro | ok, 1,3 s | `m22-ubicacion-movil-claro.jpg` |
| 4.7 | Proponer retirada (Obras) | M | claro | ok, 1,3 s | `m23-retirada-movil-claro.jpg` |
| 4.8 | Formularios en oscuro y a 360 px | M, 360, E | oscuro, claro | ok; «Conexión · 18 kB» se parte en dos líneas (D9) | `g07-alta-movil-oscuro.jpg`, `g07-alta-360-claro.jpg`, `v10-foto-kb-partido.jpg` |
| 5.1 | Cola sin enviar y reintento automático | M | claro | ok («1 sin enviar» → 0) | `m15-…` |
| 5.2 | Mis propuestas: pendientes y rechazadas con motivo | M, E | claro, oscuro | ok; *Retirar* de 36 px de ancho y sin decir qué se propuso (D10, P3) | `v07-…`, `m39-mis-propuestas-rechazadas-movil-claro.jpg` |
| 5.3 | Novedades en Ajustes | M | claro | ok | `m27-ajustes-movil-claro.jpg` |
| 5.4 | Aviso de versión nueva (real: `d21136e` se desplegó durante el recorrido) | M | claro | ok: salió en mapa, ficha y formularios; «recargar» actualizó en 1,5 s y el aviso desapareció | `m24-aviso-version-nueva-movil-claro.jpg` |
| 6.1 | Mapa base: descargar | E | oscuro | ok: se descarga solo (4,2 MB); con red lenta enseña el porcentaje | `m30-mapabase-descargando-escritorio-oscuro.jpg` |
| 6.2 | Mapa base: cancelar | E | oscuro | no existe el control (ningún FR lo pide): propuesta P10 | `m30-…` |
| 6.3 | Push: activar y desactivar | E | claro | sin servicio de push en Chrome automatizado: la app lo dice con *Reintentar* y *Cerrar* (como en RV-139b) | `m32-avisos-sin-servicio-escritorio-claro.jpg` |
| 6.4 | Tema (según el móvil, siempre, nunca) | E | claro → oscuro | ok | — |
| 6.5 | Nombre (firma) | E | claro | ok: edición en línea con *Guardar* y *Cancelar* | — |
| 6.6 | Cerrar sesión | M | claro | ok: confirma, revoca el token en el servidor y vuelve a la entrada en 0,4 s | `m41-…`, `m42-tras-cerrar-sesion-movil-claro.jpg` |
| 7.1 | Lista: filtros, orden y búsqueda | 360, M, E | claro, oscuro | ok | `m28-lista-filtro-360-claro.jpg`, `g08-lista-360-claro.jpg` |
| 7.2 | App en escritorio | E | claro, oscuro | **problema medio** (D2, #562) | `v08-escritorio-pagina-desplazada.jpg`, `v01-…` |
| 8.1 | Panel: las cinco pestañas | E, M, 360 | claro, oscuro | ok | `j01-…`, `k-cola-pmo.jpg` |
| 8.2 | Cola: filtros (estado, operación) | E | claro | ok | `j10-cola-rechazadas-escritorio-claro.jpg` |
| 8.3 | Cola: aprobar | E | claro | ok, 0,4 s (simulado) | — |
| 8.4 | Cola: `PUNTO_NO_ACTIVO` | E | claro | **problema medio, pendiente conocido** (D4, #564) | `v03-cola-punto-no-activo-aprobar-sigue-activo.jpg` |
| 8.5 | Cola: aprobar con correcciones | E | claro | ok; la dirección sale vacía en el formulario (P-baja en §4) | `j03-…` |
| 8.6 | Cola: rechazar con motivo | E | claro | ok | `j04-rechazar-escritorio-claro.jpg` |
| 8.7 | Cola: fusionar con el existente | E | claro | ok: campo a campo, «existente» o «propuesta» | `j06-fusionar-escritorio-claro.jpg` |
| 8.8 | Cola: en lote | E | claro | ok | `j07-lote-seleccion-escritorio-claro.jpg` |
| 8.9 | Inventario: filtros, tabla y mapa | E, M, 360 | claro, oscuro | ok | `j12-…`, `k-inventario-pm360.jpg` |
| 8.10 | Inventario: Exportar (Excel, CSV, GeoJSON) | E | claro | ok: los tres se descargan; CSV con `;` y coma decimal | `j13-exportar-menu-escritorio-claro.jpg` |
| 8.11 | Inventario: Editar con mover y Directo | E | claro | ok: «2 cambios · ubicación, enganche» y manda solo eso | `j15-editar-mover-directo-escritorio-claro.jpg` |
| 8.12 | Inventario: Retirar, Borrar, Historial | E | claro | ok: motivo obligatorio y explicación de cada uno | `j16-…`, `j17-…`, `j18-…` |
| 8.13 | Registro y Papelera (restaurar) | E | claro | ok | `j19-…`, `j20-…` |
| 8.14 | Ajustes: código, administradores, núcleos, parámetros, Salud, Mantenimiento, avisos | E, M | claro, oscuro | ok; nombres técnicos de tareas en Salud (P11) | `j22-ajustes-escritorio-claro.jpg`, `k-ajustes-peo.jpg` |
| 8.15 | Panel en el móvil, detalle como ventana | M | oscuro | ok; botones de zoom del mapa en blanco sobre el mapa oscuro (D13) | `v11-panel-oscuro-zoom-blanco.jpg` |
| 9.1 | Teclado en el panel (Tab, Enter, Esc, flechas) | E | claro | ok: orden de foco lógico y visible; Esc cierra y devuelve el foco. Las flechas no mueven por la cola (P12); al abrir Editar el foco va a «Mi posición» (D14) | — |
| 9.2 | axe en cada pantalla | todos | ambos | limpio salvo `listitem` en Capas y `target-size` de dos marcadores superpuestos (D11) | — |
| 9.3 | Zoom del navegador al 200 % | Z | claro | ok: sin desborde; en el panel la cabecera ocupa media pantalla (P13) | `j24-zoom200-cola.jpg`, `m37-zoom200-mapa.jpg` |

## 3. Defectos encontrados

| Id | Gravedad | Issue | Qué |
|---|---|---|---|
| D1 | **alta** | **#561** (`bloquea-release`) | Portales y aviso inmediato: 401 para todos los voluntarios |
| D2 | media | #562 | Escritorio: la página se desplaza entera |
| D3 | media | #563 | Corregir datos: «foto obligatoria» que no lo es |
| D4 | media | #564 | Cola: `PUNTO_NO_ACTIVO` deja *Aprobar* activo (pendiente conocido) |
| D5–D14 | baja | — | Abajo |

**D1 · alta · #561.** *Pasos:* entrar como voluntario en staging; buscar «Calle Real 10». *Esperado:* «Direcciones» con portales de CartoCiudad. *Pasa:* «Vuelve a entrar con el código para buscar números de portal»; `POST /api/geocodificar` y `POST /api/push` con el token responden `401`. *Causa:* las dos Functions validan el token llamando a `fn_listar_puntos` con `service_role`, que no tiene `execute` sobre ella (0007 solo la concede a `anon` y `authenticated`; `has_function_privilege` = `false` en staging). Afecta a portales (siempre) y al envío inmediato de avisos (solo queda el del Worker cada 5 min). Producción tiene la misma concesión. Captura: `v12-…`.

**D2 · media · #562.** *Pasos:* app en escritorio, rueda del ratón hasta abajo. *Esperado:* la página no se mueve. *Pasa:* `scrollHeight` fijo de 1175 px (1252 en Lista) con cualquier alto de ventana; la cabecera se va y queda una franja vacía. Captura: `v08-…`, `v01-…`.

**D3 · media · #563.** *Pasos:* ficha de una boca → *Corregir datos* → enganche *Directo*. *Esperado:* el hueco de la foto no dice «obligatoria» (FR-21 solo la exige en alta y revisión). *Pasa:* dice «Hacer foto · obligatoria» y *Enviar para revisión* envía sin foto. Captura: `v04-…`.

**D4 · media · #564 (pendiente conocido).** *Pasos:* Cola → *Aprobar* sobre un punto que ya no está activo. *Esperado:* *Aprobar* deshabilitado con el motivo escrito. *Pasa:* sale «El punto ya no está activo.» y *Aprobar* sigue activo; pulsarlo repite la llamada que falla. Captura: `v03-…`.

Bajas (sin issue, para el docs/33 si se quiere):

- **D5 · Modo oscuro: el buscador del mapa es translúcido.** Se leen los nombres del mapa a través del campo. Captura: `v02-buscador-transparente-modo-oscuro.jpg`.
- **D6 · Escritorio: barra horizontal visible bajo los filtros de la lista lateral** y el mapa base propio acaba en una línea recta a la derecha al alejar (es el borde del extracto). Captura: `v01-…`.
- **D7 · Medir:** las etiquetas de dos tramos («410 m», «362 m») se pisan en el vértice. Captura: `v05-…`.
- **D8 · Cercanos:** el subtítulo empieza por «·» cuando se parte la línea; igual en «¿El tipo está mal? … ·» de *Corregir datos*. Captura: `v06-…`.
- **D9 · Fotos del formulario:** «Conexión · 18 kB» se parte en dos líneas a 412 px. Captura: `v10-…`.
- **D10 · Mis propuestas:** *Retirar* mide 36 × 44 px (06 pide 44 × 44). Captura: `v07-…`.
- **D11 · Accesibilidad:** en Capas, cuatro `li` sin `ul` (axe `listitem`, serio); dos marcadores en el mismo sitio dan `target-size` (los 4 duplicados de RV-139b, D12).
- **D12 · Datos de staging:** las fotos de los puntos del seed (`fotos/prueba-*.jpg`) no existen en el bucket (14 respuestas `400` en la consola, «No se ha podido cargar la foto» en la ficha), y BOC-0003 a BOC-0006 son cuatro altas aprobadas de RV-139b en el mismo sitio. No es código: conviene subir fotos de prueba al seed o limpiar esas cuatro.
- **D13 · Panel en oscuro:** los botones + / − del mapa de la cola son blancos sobre el mapa oscuro. Captura: `v11-…`.
- **D14 · Panel, Editar:** al abrir la ventana con el teclado, el foco cae en «Mi posición» del mapa y no en el título o el primer campo.

## 4. Revisión visual

Se marcan con recuadro rojo las capturas `v01` a `v13`.

- **Mapa (móvil).** Bien: jerarquía clara, controles de 44 px a la derecha, *Cercanos* y + sin taparse, la banda «ENTORNO DE PRUEBAS» bien visible. Mal: abre con toda la zona y los puntos se amontonan (`v13`); con la leyenda abierta, «Barro» y «No funciona» son dos iconos rayados casi iguales a ese tamaño (`m01`).
- **Buscador.** Bien: resultados por secciones con su fuente. Mal: dos «×» seguidos de distinto color (borrar y cerrar) (`v12`); en oscuro, translúcido (`v02`).
- **Ficha.** Bien: banda de estado, *Cómo llegar* como única acción principal, coordenadas copiables. Mal: si la foto falla, un bloque gris ocupa un tercio de la pantalla (`m10`).
- **Formularios.** Bien: un primario por pantalla, motivo escrito bajo el botón deshabilitado («Mueve el pin al sitio correcto», «Elige el diámetro»), oscuro cuidado. Mal: «Otra medida» sin unidad al lado del número; «La posición no está al día…» sigue tras colocar el pin a mano (`m13`); `v04`, `v10`.
- **Mis propuestas.** Bien: estado en chip y motivo del rechazo. Mal: no dice qué se propuso; «ALTA nuevo» en minúscula y monoespaciada; la fecha es la del envío, no la de la resolución (`v07`, `m39`).
- **Ajustes (app).** Bien: secciones claras, *Cerrar sesión* separado y en rojo suave. Mal: «Guardado protegido · no» no se entiende; las novedades repiten «0.9.0 ·» en cada línea bajo «Versión 0.9.0» (`m27`).
- **Escritorio (app).** La lista lateral funciona, pero la barra de abajo (*Mapa · Lista · Ajustes*) ocupa 1440 px con tres iconos y *Lista* sobra con la lista ya a la vista; la página se desplaza (`v08`, `v01`).
- **Panel.** Bien: cola con mapa, cambios marcados («1 cambio · el resto se queda igual»), fusionar campo a campo, Editar en panel lateral con resumen de cambios, exportar con su formato. Mal: en el móvil, casillas de 16 px y botones de 36 px; Salud con nombres de tareas en clave (`purgar_errores`) y *Descargar inventario (JSON)* metido en Salud; en el formulario de corregir, la dirección vacía no dice si se conserva (`j03`); a 200 % la cabecera y las pestañas se comen media pantalla (`j24`).
- **Consistencia y oscuro.** Colores de estado iguales en mapa, lista, ficha y panel; tipografía de datos (monoespaciada) coherente. En oscuro, los controles del mapa del panel quedan en blanco (`v11`).

## 5. Propuestas de mejora de la UI

Como mucho 15, por prioridad. **No se implementan aquí**: el desarrollador elige cuáles van a un docs/33.

| # | Qué cambiar | Por qué | Beneficio | Esfuerzo | Prioridad |
|---|---|---|---|---|---|
| P1 | Abrir el mapa **centrado en el voluntario** (zoom de calle) si está en la zona; si no, en los puntos | Hoy abre con toda la comarca y hay que hacer 3–4 toques para ver un hidrante (`v13`). En una emergencia, cada toque cuenta | alto | S | 1 |
| P2 | **Escritorio sin barra de abajo**: la navegación arriba o en la columna izquierda, sin *Lista* (ya está a la vista) | Tres iconos repartidos en 1440 px y una pestaña que no aporta (`g01-mapa-escritorio-claro`) | medio | M | 2 |
| P3 | **Mis propuestas dice qué se propuso** («Regular → No funciona») y cuándo se resolvió; *Retirar* como botón de 44 px | El voluntario no recuerda qué mandó hace una semana; hoy solo ve «ESTADO HID-9002» (boceto en `propuestas.html`) | alto | S | 3 |
| P4 | **Un solo ✕ en el buscador** (con texto, borra; vacío, cierra) y fondo opaco en oscuro | Dos ✕ seguidos se confunden; en oscuro se lee el mapa a través (`v12`, `v02`, boceto) | medio | S | 4 |
| P5 | Aviso de versión nueva: **«Hay una versión nueva» + botón *Actualizar***, con mayúscula, y en un formulario a medias abajo, no entre la cabecera y el contenido | Hoy empieza en minúscula y en la ficha y los formularios se mete entre la cabecera y la banda de estado (`m24`, `m17`, boceto) | medio | S | 5 |
| P6 | **Capas sin siglas**: «Callejero», «Foto aérea», «Catastro», «Mapa sin conexión»; y su lista como `ul` | «Calle (OSM)» y «Satélite (PNOA)» son jerga para un voluntario (`v09`); arregla también D11 | medio | S | 6 |
| P7 | **Ficha con foto que falla**: una franja baja con icono y «Sin foto», no un bloque de un tercio de pantalla | Empuja *Cómo llegar* fuera de la vista sin aportar nada (`m10`) | medio | S | 7 |
| P8 | **Corregir datos**: foto «opcional» (D3) y la ayuda «¿El tipo está mal?…» sin el «·» colgando, con el enlace en la misma línea | Coherencia con FR-21 y lectura limpia (`v04`) | medio | S | 8 |
| P9 | **Medir**: etiquetas de tramo que se apartan de la línea y no se pisan; resultado en la fuente normal (no monoespaciada en negrita) | Se leen mal en los vértices (`v05`) | bajo | S | 9 |
| P10 | **Cancelar la descarga del mapa base** desde Ajustes mientras dura | Con datos móviles caros o red lenta (≈ 20 s a 200 kB/s) no hay forma de pararla | bajo | S | 10 |
| P11 | **Salud en palabras**: «Borrar errores viejos» en vez de `purgar_errores`; *Descargar inventario (JSON)* a Exportar | Jefatura no tiene por qué saber cómo se llama una tarea programada (`j22`) | bajo | S | 11 |
| P12 | Panel: **flechas arriba/abajo** para moverse por la cola y enlace «Saltar al contenido» | Moderar 20 propuestas con Tab, dos tabulaciones por fila (casilla y fila), es lento | medio | S | 12 |
| P13 | Panel a **zoom 200 %**: cabecera compacta (buscador en una línea con el título) y pestañas que se desplazan | A 200 % solo se ven 1,5 propuestas (`j24`) | bajo | M | 13 |
| P14 | **Ajustes de la app**: quitar «Guardado protegido» o explicarlo («El móvil no borrará los datos guardados: sí/no»); novedades sin repetir «0.9.0 ·» | Jerga y ruido (`m27`) | bajo | S | 14 |
| P15 | **Leyenda**: Barro y No funciona con iconos que se distingan a 16 px (Barro marrón lleno, No funciona gris tachado) | A tamaño de leyenda parecen el mismo (`m01`) | bajo | S | 15 |

## 6. Velocidad

Medido con `performance.now()` (y la Navigation Timing API para las cargas), en este PC, con banda ancha, contra staging. Los pasos con clic incluyen 250 ms de `slowMo`.

| Paso | Tiempo | Límite (docs/03) | |
|---|---|---|---|
| Abrir la app (staging): DOMContentLoaded / LCP / «Sincronizado» | 0,53 s / 1,0 s / 1,8 s | TR-10: < 3 s en 3G (aquí banda ancha, sin *throttling*) | dentro |
| Buscar por código (local) | 0,31 s (con 0,25 de slowMo) | TR-13: < 200 ms | dentro (≈ 60 ms sin el slowMo) |
| Buscar por calle (callejero local) | 0,31 s | — | |
| Abrir Cercanos | 0,50 s | TR-116: cálculo < 50 ms (incluye animación de la hoja) | dentro |
| Guardar un alta sin conexión | 0,76 s | — | |
| Vaciar la cola al volver la conexión (alta con 2 fotos) | 1,44 s | — | |
| Enviar revisión / estado / datos / ubicación / retirada (en línea, con fotos) | 1,16 / 0,64 / 0,36 / 1,29 / 1,26 s | — | |
| Recargar por versión nueva hasta «Sincronizado» | 1,47 s | TR-24 | ok |
| Mis propuestas | 1,0 s aprox. | — | |
| Cerrar sesión | 0,37 s | — | |
| Descarga del mapa base (4,2 MB) | < 1 s en banda ancha; ≈ 20 s a 200 kB/s | — | |
| Panel (simulado): abrir la Cola / el Inventario / Registro, Papelera, Ajustes | 1,1 s / 0,6 s / ≈ 2 s (con 1,5 s de espera fija) | TR-16: < 2 s con 200 pendientes | dentro (con 9; los 200 los mide el e2e) |
| Panel: aprobar | 0,43 s | — | |

Ninguno se sale de docs/03. La primera carga en 3G (TR-10) y la de 200 propuestas (TR-16) las miden la CI y Lighthouse, no este recorrido.

## 7. Consola

| Origen | Veces | Qué | Por qué |
|---|---|---|---|
| Staging | 65 | `401` al cargar cada página y tras cada envío | `/api/push` con el token del voluntario: es D1 (#561) |
| Staging | 14 | `400` en las fichas | Las fotos del seed no existen en el bucket (D12) |
| Staging | 1 | «Chrome currently does not support the Push API in incognito mode» | Contexto de Playwright (no es un navegador normal); la app lo dice en pantalla |
| Local (simulado) | 50 + 56 | `ERR_CONNECTION_REFUSED` y `502` | Lo que el simulado no contesta (p. ej. teselas en línea) y `/api/error` sin Functions en `vite preview`: son del montaje, no de la app |
| Local (simulado) | 1 + 3 | `400` y `401` | Provocados a propósito: `PUNTO_NO_ACTIVO` y código incorrecto |

**Ningún `pageerror`** (excepción de JavaScript sin capturar) en todo el recorrido, ni en staging ni en local.

## Desviaciones de la especificación

- **Panel «en el build de staging»**: como en RV-139b, el build con el modo de staging apunta a su Supabase real y los simulados interceptan `supabase.invalid`; se usó el build del mismo commit (`4ab5c44`) con `VITE_ENTORNO=staging` y el Supabase de pruebas.
- **Permiso de ubicación denegado**: Chrome automatizado no deniega el permiso (se queda en «preguntar») ni con `Browser.setPermission`; se vio el estado «Buscando tu posición…» y la salida de marcar a mano. La denegación la cubren los e2e.
- **«¿Qué hay aquí?»**: la pulsación larga no se dispara con el clic derecho del ratón en la emulación táctil; lo cubren los e2e.
- **Push**: sin servicio de push en Chrome automatizado; se vio el mensaje de error y sus botones.
- **Compartir**: abre el diálogo nativo del sistema, que no sale en las capturas.
- **Mapa base «cancelar»**: no existe el control; queda como propuesta P10.
- **Salud del panel**: el simulado lleva los campos de los e2e; los campos nuevos de 0041 (`fotos_pct`, `reservas_abiertas`…) se comprobaron en la base de staging con `fn_salud()` como administrador, no en pantalla.
- **Capturas**: se guardan 86 de las 165 tomadas, en JPEG de 720 px, para no cargar el repositorio público.
