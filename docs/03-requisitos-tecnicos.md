# 03 · Requisitos técnicos — Mapa de hidrantes

| | |
|---|---|
| **Estado** | Congelado. Cambia con conformidad de jefatura y nueva versión. |
| **Versión** | 1.4 — 24 de septiembre de 2026: TR-78, Cloudflare Workers para los avisos (DEC-097). 1.3 — 23 de septiembre de 2026: §13, requisitos de las funciones de mapa para emergencias (TR-116 a TR-119), y CartoCiudad y el callejero de OSM en §8 (DEC-089, DEC-092, DEC-093; pendiente de conformidad de jefatura en F9.1, #76). v1.2 — 17 de septiembre de 2026. v1.1 añadió cabeceras, vigilancia y push (ahora §12); v1.2 añade §11 (interfaz sin cabos sueltos, textos y concurrencia), DEC-047/048/050. |
| **Propietario de** | las **exigencias medibles y no funcionales**: qué tiene que cumplir el sistema, no cómo se consigue. La solución elegida está en 04; si mañana cambia la solución, estas exigencias siguen en pie. |
| **No contiene** | decisiones de producto (→ 04), reglas funcionales (→ 01), campos (→ 05). |

Cada requisito indica **cómo se comprueba**. Un requisito técnico que no se puede medir no está aquí.

---

## 1. Funcionamiento sin cobertura

| ID | Requisito | Comprobación |
|---|---|---|
| TR-01 | Con el móvil en modo avión y tras una sincronización previa, el mapa, la lista, la búsqueda y las fichas funcionan con los datos de la última sincronización. (FR-80) | Prueba manual AC en 10; e2e con red desactivada. |
| TR-02 | El mapa base sin cobertura muestra calles y portales de toda la zona de cobertura, no solo lo que el usuario miró antes en línea. (FR-81) | En modo avión, desplazarse a un núcleo no visitado: hay calles. |
| TR-03 | El mapa base completo para uso sin cobertura pesa **≤ 20 MB**; se prevé entre 8 y 15 MB. Si excediera 20 MB, cambia su ubicación de servicio (04), no el requisito. | Tamaño del archivo impreso por el script de generación. |
| TR-04 | Una propuesta hecha sin cobertura, con su foto, se envía sola al recuperar señal en menos de **60 s**, sin intervención del usuario. (FR-82) | e2e: crear en modo avión, reconectar, comprobar llegada. |
| TR-05 | Un reintento de envío nunca crea una segunda propuesta: la clave de idempotencia generada en el móvil es única por propuesta. (FR-49) | Test SQL: segundo envío con la misma clave devuelve la misma propuesta. |
| TR-06 | La aplicación advierte de cualquier envío que lleve **> 24 h** en la cola local. (FR-83) | Manipular el reloj en e2e. |
| TR-07 | Los datos guardados en el móvil (puntos, mapa base, cola) sobreviven al cierre de la aplicación y al reinicio del dispositivo. Si el sistema operativo los desaloja, la aplicación lo detecta y vuelve a descargarlos avisando. | Prueba manual en Android y iOS. |
| TR-08 | La sincronización de puntos es **incremental**: tras la primera carga, solo viaja lo modificado desde la última sincronización, incluidas las bajas. | Inspección de la petición de red. |

---

## 2. Rendimiento

| ID | Requisito | Comprobación |
|---|---|---|
| TR-10 | Primera carga útil (mapa con puntos visible) **< 3 s** en una conexión 3G simulada (1,6 Mbit/s, 300 ms de latencia). | Lighthouse / Playwright con *throttling*, en CI. |
| TR-11 | Paquete principal de JavaScript **< 300 kB comprimido**, sin contar el mapa base, que se carga aparte y bajo demanda. | Informe de tamaño del build, en CI, falla si se supera. |
| TR-12 | Con **1.000 puntos** cargados, el desplazamiento y zoom del mapa se mantienen fluidos (≥ 30 fps percibidos) en un móvil Android de gama media real de menos de tres años. | Prueba de carga manual con datos generados; se documenta el dispositivo. |
| TR-13 | La búsqueda local devuelve resultados en **< 200 ms** con 1.000 puntos. | Test unitario con datos generados. |
| TR-14 | La sincronización inicial de 1.000 puntos termina en **< 10 s** en 3G. | Prueba de carga. |
| TR-15 | Las fotos se reducen en el móvil antes de subir a **≤ 1600 px** en su lado mayor y **≈ 250 kB** de media (JPEG/WebP); nunca más de 5 MB. | Test unitario del procesado; límite duro en el almacenamiento (04). |
| TR-16 | El panel de jefatura carga la cola con 200 propuestas pendientes en **< 2 s** en ordenador con banda ancha. | e2e con datos generados. |

---

## 3. Compatibilidad

| ID | Requisito | Comprobación |
|---|---|---|
| TR-20 | Funciona e **instalable como PWA** en Android (Chrome, y los navegadores basados en Chromium de Samsung y Xiaomi) y en iOS/iPadOS (Safari), en versiones publicadas en los **últimos tres años**. | Matriz de dispositivos en 10; prueba manual en al menos un Android y un iPhone reales. |
| TR-21 | El panel de jefatura funciona en Chrome, Edge, Firefox y Safari de escritorio de los últimos dos años, a partir de **1.024 px** de ancho, y es usable en tableta. | e2e en Chromium y Firefox; manual en Safari. |
| TR-22 | La cámara se abre directamente desde el formulario en Android e iOS, y la foto llega con la orientación correcta. | Manual en ambos sistemas. |
| TR-23 | La geolocalización funciona en ambos sistemas y la aplicación explica qué hacer si el permiso está denegado. | Manual con permiso denegado. |
| TR-24 | La aplicación se **actualiza sola**: una versión nueva se detecta al abrir y se ofrece recargar; ningún móvil se queda con una versión antigua más de una sesión. | e2e: desplegar versión nueva, abrir, ver aviso. |
| TR-25 | La misma URL sirve móvil, tableta y ordenador; el diseño cambia a partir de **900 px** de ancho (lista lateral) y en tableta las herramientas pasan a botones laterales. (FR-70) | Capturas en tres anchos en CI. |

---

## 4. Accesibilidad y uso en campo

| ID | Requisito | Comprobación |
|---|---|---|
| TR-30 | Toda información de estado se transmite por **al menos dos canales**: nunca solo por color (de ahí forma, tamaño, tachado y borde). (FR-60, FR-61) | Revisión contra 06. |
| TR-31 | Contraste mínimo **4,5:1** en texto y **3:1** en los cuatro colores de estado sobre el fondo del mapa, en modo claro y oscuro. | Comprobación de contraste automatizada sobre los tokens de 06. |
| TR-32 | Objetivos táctiles de **≥ 44 × 44 px** en marcadores, botones y controles del mapa, con independencia del radio dibujado. Se usa en la calle, a veces con guantes. | Auditoría de tamaños en e2e. |
| TR-33 | Legible a pleno sol: los cinco tamaños de marcador se distinguen en un móvil real a la luz del día. | Comprobación del propietario en Fase 5 (09) y AC en 10. |
| TR-34 | Modo oscuro completo (interfaz y mapa base) que respeta la preferencia del sistema y se conmuta a mano. (FR-71) | Manual. |
| TR-35 | Toda función es alcanzable con teclado en el panel; el foco es visible. | Auditoría rápida en e2e. |
| TR-36 | Los textos de error dicen qué ha pasado y qué hacer; ningún error de base de datos llega crudo al usuario. | Revisión de los casos límite de 05 §6. |

---

## 5. Seguridad (medible)

Los principios y el modelo de amenazas están en 11; aquí, lo que se puede comprobar.

| ID | Requisito | Comprobación |
|---|---|---|
| TR-40 | Con la clave pública del cliente (`anon key`), **fallan** las ocho operaciones siguientes: leer propuestas, leer el registro, escribir en puntos, aprobar una propuesta, listar las propuestas de otro dispositivo, ejecutar la validación del código directamente, subir un archivo sin URL firmada, y pedir una dirección sin sesión de administrador. | Checklist ejecutada y documentada; tests SQL. |
| TR-41 | Intentos de código limitados a **10 por dispositivo y hora**, **30 por IP real y hora** y **200 en total y hora** (configurables). El límite por IP se aplica sobre la IP real, no sobre una cabecera que el cliente pueda falsificar. | Tests SQL y test de la función de borde. |
| TR-42 | La validación del código responde en **tiempo constante** (no filtra por duración si el código estaba cerca). | Test: tiempos de código correcto e incorrecto no difieren significativamente. |
| TR-43 | El código de acceso **no se almacena en el móvil** después del primer canje; solo la credencial de dispositivo. Esa credencial caduca a los **365 días** sin uso (configurable). | Inspección del almacenamiento local; test SQL de caducidad. |
| TR-44 | Ningún secreto de servidor llega al navegador: solo la `anon key` y las URL públicas. | Inspección del build y de las respuestas de red. |
| TR-45 | Subida de fotos: máximo **40 por dispositivo y día** (configurable), archivos **≤ 5 MB**, tipos `image/jpeg` e `image/webp`, nombre de archivo asignado por el servidor. | Tests SQL y de almacenamiento. |
| TR-46 | El registro de auditoría es **append-only**: no admite modificación ni borrado por ningún rol, ni siquiera administrador. (FR-123) | Test SQL: `update` y `delete` fallan. |
| TR-47 | Los metadatos EXIF de las fotos (posición, dispositivo, fecha) **no se suben**: la recompresión en el móvil los elimina. Las coordenadas EXIF se envían aparte como dato del punto. | Test unitario: la imagen resultante no tiene EXIF. |

---

## 6. Disponibilidad, respaldo y recuperación

| ID | Requisito | Comprobación |
|---|---|---|
| TR-50 | Respaldo **semanal** automático de todos los datos (puntos, propuestas, registro, configuración, administradores) y **mensual** de las fotos, cifrado, con **90 días** de retención. **RPO: 7 días** para datos, 30 para fotos. | Artefactos presentes en CI; fecha en Salud del sistema. |
| TR-51 | La restauración completa sobre una base limpia se ha **ejecutado con éxito al menos una vez** antes de abrir a los 65 voluntarios, y el procedimiento está escrito en 15. **RTO objetivo: 4 horas** con el procedimiento en mano. | Prueba de restauración documentada. |
| TR-52 | Volver a una versión anterior del frontend es **inmediato** y por línea de comandos; los cambios de base de datos son solo hacia adelante y compatibles con la versión anterior del frontend durante el despliegue. | Ensayo del procedimiento de marcha atrás (04). |
| TR-53 | El servicio se apoya únicamente en **planes gratuitos** con estas cotas, que el sistema no debe superar en la versión 1: base de datos 500 MB, almacenamiento de fotos 1 GB, transferencia 5 GB/mes, dos proyectos de base de datos compartidos con la app de uniformidad. | Indicador de consumo en Salud del sistema; estimación en 04. |
| TR-54 | Las purgas periódicas (intentos de código, papelera, errores antiguos, credenciales caducadas, fotos huérfanas) se ejecutan **sin intervención humana**. | Tareas programadas presentes y con última ejecución visible. |
| TR-55 | Ningún componente exige que una persona concreta esté disponible para operar: todas las cuentas pertenecen a la agrupación (15). | Revisión de propiedad de cuentas. |

---

## 7. Datos, volumen y retención

| ID | Requisito | Comprobación |
|---|---|---|
| TR-60 | Dimensionado para **≥ 1.000 puntos**, **≥ 20.000 propuestas** y **≥ 100.000 entradas de registro** sin cambios de diseño. | Prueba de carga. |
| TR-61 | Coordenadas con precisión de al menos **6 decimales** (≈ 10 cm); distancias calculadas sobre geografía real (no plana). | Test SQL. |
| TR-62 | Retención: registro **indefinido**; intentos de código **24 h**; errores de la aplicación **90 días**; papelera **30 días** (configurable); credenciales de dispositivo **365 días** sin uso. | Configuración y tareas programadas. |
| TR-63 | Los nombres de voluntarios pueden **anonimizarse por dispositivo** conservando las filas (derecho de supresión, 11). | Test SQL de la RPC. |

---

## 8. Dependencias externas y sus condiciones de uso

| ID | Requisito | Comprobación |
|---|---|---|
| TR-70 | **OpenStreetMap (teselas):** solo en línea, sin precarga anticipada, con `User-Agent`/`Referer` identificables y respetando las cabeceras de caché. La política de uso de OSM prohíbe descargar teselas para uso sin conexión; el mapa sin cobertura **no** puede apoyarse en ellas. | Revisión de configuración de capas. |
| TR-71 | **Datos OSM para el mapa base propio:** atribución © OpenStreetMap contributors visible; licencia ODbL respetada. | Atribución presente en el mapa. |
| TR-72 | **Nominatim:** máximo **1 petición por segundo**, `User-Agent` identificable, uso solo desde servidor, atribución visible en el panel, y nunca como dependencia bloqueante: si no responde, la aprobación sigue sin dirección. (FR-15) | Test de la función de borde; texto de atribución. |
| TR-73 | **PNOA (IGN) y Catastro:** solo en línea, por HTTPS, con atribución; no se almacenan sus imágenes. | Revisión de capas. |
| TR-74 | **Overpass (límites administrativos):** se consulta solo al regenerar la zona, nunca en tiempo de ejecución de la aplicación; el resultado se guarda en el repositorio. | El build no depende de Overpass. |
| TR-75 | Ninguna dependencia externa requiere tarjeta de crédito ni clave de API de pago. | Revisión de 04. |
| TR-76 | **CartoCiudad (IGN/CNIG), números de portal:** solo desde la Pages Function `/api/geocodificar` (nunca desde el navegador), con `User-Agent` identificable, caché de 30 días por consulta normalizada y límite de tiempo de 5 s; uso libre y gratuito, con la obligación de citar la fuente ("CartoCiudad · IGN", licencia CC BY 4.0 del SCNE). Nunca bloqueante: sin él, la búsqueda sigue con calles, lugares y coordenadas (FR-73, DEC-092). | Test de la Function; atribución en los resultados. |
| TR-77 | **Callejero sin conexión desde OSM:** se genera con Overpass solo a mano o al regenerar la zona (nunca en el build de CI), se guarda en el repositorio y lleva la atribución © OpenStreetMap (ODbL) en sus resultados (FR-73, DEC-093). | El build no depende de Overpass; atribución presente. |
| TR-78 | **Cloudflare Workers (Cron Triggers), en la cuenta que ya existe:** un Worker `hidrantes-avisos` con un cron cada 5 minutos despacha los avisos push (FR-163). Plan gratuito: 5 Cron Triggers por cuenta, 100.000 peticiones al día y 50 subpeticiones por invocación; el Worker hace 20 como mucho. Sin coste ni cuenta nueva (DEC-037, DEC-097). | `workers/avisos/src/index.test.ts`; la vigilancia comprueba el cron. |

---

## 9. Localización y formato

| ID | Requisito | Comprobación |
|---|---|---|
| TR-80 | Idioma único: español. Fechas en formato relativo ("hace 3 meses") con la fecha absoluta disponible; formato `d mmm yyyy` (`20 ago 2026`). Distancias en metros hasta 1 km y en kilómetros con un decimal después. | Test unitario de formato. |
| TR-81 | Zona horaria `Europe/Madrid` en toda la aplicación y el panel; almacenamiento en UTC. | Test unitario. |

---

## 10. Observabilidad y calidad

| ID | Requisito | Comprobación |
|---|---|---|
| TR-90 | Los errores del cliente se registran en el propio sistema (mensaje, pila truncada a 4 kB, ruta, agente, dispositivo), sin servicio externo y sin datos de usuario más allá del identificador de dispositivo; con techo diario para que no puedan usarse para llenar la base de datos. | Test SQL del techo. |
| TR-91 | Tres capas de pruebas automatizadas en cada cambio: unitarias (simbología, geometría, formato), SQL (permisos, reglas, casos límite) y extremo a extremo (camino crítico completo), **todas contra una instancia local efímera**, nunca contra los entornos compartidos. | CI en verde obligatoria para integrar. |
| TR-92 | Ningún cambio llega a producción sin haber pasado por el entorno de pruebas, y el despliegue a producción exige **aprobación manual**. | Configuración de ramas y entornos (04). |
| TR-93 | La aplicación indica su versión en Ajustes y en las incidencias enviadas. | Manual. |

---

## 11. Interfaz sin cabos sueltos, textos y concurrencia

| ID | Requisito | Comprobación |
|---|---|---|
| TR-110 | **Ningún control muerto, ningún estado sin texto** (06 §9.1, UI-01 a UI-06): todo control produce efecto visible; ningún botón deshabilitado sin motivo escrito; toda lista tiene estado vacío; todo fallo se explica; toda acción destructiva se confirma. | Recorrido automatizado con Playwright que pulsa todos los controles de cada pantalla y verifica que cambia el DOM, aparece un diálogo o aparece un aviso (AC-140). |
| TR-111 | **Todos los textos de interfaz en `src/lib/textos.ts`** (UI-20). Ningún literal de cara al usuario en un componente. | Regla de ESLint que prohíbe cadenas con letras acentuadas o de más de dos palabras en JSX fuera de ese módulo; falla el build. |
| TR-112 | **Los textos coinciden con el Apéndice A de 06** (UI-21). Una cadena nueva se añade al apéndice en el mismo PR. | Test que compara las claves de `textos.ts` con el apéndice; revisión en el PR. |
| TR-113 | **Notación canónica y separación** (UI-10 a UI-16): sin texto pegado, separadores ` · `, ≥ 12 px entre acción afirmativa y destructiva, ≥ 44 px de objetivo táctil con ≥ 8 px entre controles. | Test de accesibilidad y de geometría en e2e sobre cada pantalla (AC-141). |
| TR-114 | **Escrituras seguras ante concurrencia** (05 §11): bloqueo por fila, sin "gana el último", sin interbloqueos en lote, sin peticiones de red dentro de una transacción; `statement_timeout` 10 s. | pgTAP con dos sesiones simultáneas (AC-142). |
| TR-115 | **Cada fase entrega su verificación**: `docs/verificacion/fase-N.md` con los casos de 10 ejecutados, cómo se comprobaron, resultado y suposiciones tomadas. | El PR que cierra la fase incluye el archivo; sin él, la fase no está terminada (09 §6). |

---

## 12. Cabeceras, actualizaciones, vigilancia y notificaciones

| ID | Requisito | Comprobación |
|---|---|---|
| TR-100 | Cabeceras de seguridad en toda respuesta de Pages: `Content-Security-Policy` (sin `unsafe-eval`; `connect-src` limitado a Supabase, Nominatim vía la Function, OSM/IGN/Catastro; `img-src` idem), `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (cámara y geolocalización solo para el propio origen). | Test e2e que lee las cabeceras de staging tras el despliegue; puntuación A en un analizador de cabeceras. |
| TR-101 | Dependencias actualizadas **sin intervención**: Dependabot semanal; parches y menores con CI verde se fusionan solos; los mayores abren PR y esperan. | Configuración en el repo; historial de PR automáticos. |
| TR-102 | **Vigilancia diaria**: un trabajo comprueba que la app responde, que una RPC de lectura responde y que el último respaldo tiene menos de 8 días. Si falla, abre una *issue* en GitHub y lo muestra Salud del sistema. Sin servicio externo. | Workflow presente; simular fallo y ver la issue. |
| TR-103 | **Lighthouse** en CI sobre staging: rendimiento ≥ 85, accesibilidad ≥ 95, buenas prácticas ≥ 95, PWA instalable. Falla el pipeline si baja. | Informe de Lighthouse CI en cada despliegue; la instalabilidad, con un navegador sobre lo desplegado (`e2e/cabeceras.spec.ts`), porque Lighthouse 12 ya no la audita (DEC-074). |
| TR-104 | Notificaciones push (FR-163–164): estándar Web Push con claves VAPID generadas en el arranque; **opt-in explícito**; ninguna notificación contiene nombres de otros voluntarios; en iOS solo con la PWA instalada (16.4+), y la app lo dice antes de pedir permiso. Ninguna dependencia de terceros (sin Firebase). | Test de la Function de envío; prueba manual en Android e iOS. |
| TR-105 | Exportaciones (FR-160) generadas en el navegador, sin pasar por un servidor de terceros: `.xlsx` con SheetJS (→ DEC-067: se hace con `fflate`), `.csv` UTF-8 con BOM (Excel en español), `.geojson` RFC 7946 con `codigo`, `tipo`, `diametro_mm`, `caudal`, `racor`, `direccion`, `nucleo`, `fecha_ultima_revision`. | Test unitario que abre el archivo generado. |
| TR-106 | La aplicación tiene **límites de error**: un fallo de renderizado en una pantalla muestra un mensaje y un botón "volver al mapa" y se registra en `errores_cliente`; nunca una pantalla en blanco. (FR-168) | e2e que fuerza un error en un componente. |
| TR-107 | Ningún cambio en el frontend rompe a los móviles con la versión anterior durante la ventana de despliegue: el contrato de las RPC es compatible hacia atrás al menos una versión (04 §12). | Revisión en cada migración; test de la versión anterior contra la BD nueva en CI. |

---

## 13. Funciones de mapa para emergencias

| ID | Requisito | Comprobación |
|---|---|---|
| TR-116 | Calcular los cercanos (FR-74) sobre 1.000 puntos tarda **< 50 ms** en un móvil medio. | vitest en Node con umbral de 20 ms (mediana de 20 ejecuciones) y e2e con CPU ×4. |
| TR-117 | El callejero (FR-73) ocupa **≤ 200 kB** sin comprimir, se precachea en el Service Worker y no forma parte del JS inicial. | El script que lo genera falla por encima; e2e: no se pide al arrancar, solo al abrir la búsqueda. |
| TR-118 | `/api/geocodificar` responde en **≤ 5 s** o devuelve `SIN_SERVIDOR`. Con él caído, la búsqueda sigue funcionando para calles, lugares y coordenadas. | Test de la Function con fetch simulado; e2e con la Function en 503. |
| TR-119 | La conversión a UTM (ETRS89, huso 30) tiene un error **≤ 1 m** frente a PROJ (EPSG:4258 → EPSG:25830) en la zona. | vitest contra vectores de referencia calculados con PROJ. |

---

## Trazabilidad

| Sección | Origen |
|---|---|
| 11 | revisión de la especificación de uniformidad, 17 sep 2026 (DEC-047, DEC-048, DEC-050) |
| 12 | revisión 17 sep 2026 (robustez, DEC-037) |
| 1, 3, 4 | `requisitos-hidrantes.html` v6.1 §6.3, §6.4, §7.6; plan v2.1 Fases 4–6 |
| 2, 6, 7, 10 | plan v2.1 Fase 8 y "Consumo del plan gratuito" |
| 5 | plan v2.1 "Protección del código de acceso", Storage, Fase 8 (revisión de seguridad) |
| 8 | plan v2.1 Fase 5 (política de OSM, Nominatim) y Fase 1 (Overpass); TR-76 y TR-77, `docs/18` bloque D (DEC-092, DEC-093) |
| 13 | `docs/18` bloque D, 23 sep 2026 (DEC-089) |
