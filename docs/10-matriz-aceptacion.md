# 10 · Matriz de aceptación — Mapa de hidrantes

| | |
|---|---|
| **Estado** | Vivo. Se amplía cuando aparece un caso nuevo; los resultados se anotan por recorrido. |
| **Versión** | 1.5 — 23 de septiembre de 2026: §K, AC-150 a AC-156 de las funciones de mapa para emergencias (DEC-089), y §L, un caso para cada FR que no tenía (docs/18 GM-00). 1.4 — 22 de septiembre de 2026: AC-140 pasa a comprobarse sola (`e2e/controles.spec.ts`). v1.3: anotados los cuatro casos técnicos que ya están comprobados (AC-110, AC-114, AC-115, AC-116); el resto los recorre jefatura. v1.2 — 17 de septiembre de 2026. v1.1 añadió la sección I; v1.2 añade la J (reglas de interfaz, textos y concurrencia). |
| **Propietario de** | los casos de prueba de aceptación (`AC-nn`). Cada caso cita el requisito que verifica (01, 03). |
| **Cómo se usa** | Se imprime. Jefatura y 2–3 voluntarios lo recorren en la calle sobre **staging** con el código del piloto, y después sobre producción antes de abrir a los 65. Columna "Resultado": ✓ / ✗ / n.a.; columna "Notas": qué pasó si ✗. |

Material: dos móviles Android (uno de gama media de menos de tres años, otro más antiguo si lo hay),
un iPhone, un portátil para el panel, un punto real fuera de la zona (o simulado con el pin), y el
recorrido de un barrio con al menos cinco puntos, uno de ellos boca de riego.

Cada recorrido se registra al final del documento (§ Recorridos).

---

## A · Entrada y acceso

| ID | Caso | Pasos | Resultado esperado | Verifica | ✓/✗ | Notas |
|---|---|---|---|---|---|---|
| AC-01 | Primer uso con código correcto | Abrir la URL en un móvil nuevo; teclear el código y nombre y apellido; Entrar | Aparecen las tres pantallas de primer uso; después el mapa. El móvil no vuelve a pedir el código al cerrar y abrir. | FR-30, FR-31, FR-94 | | |
| AC-02 | Código incorrecto | Teclear un código erróneo | Mensaje "código incorrecto" sin más pistas | FR-33 | | |
| AC-03 | Bloqueo por intentos | Teclear 11 códigos erróneos seguidos en el mismo móvil | A partir del undécimo: "espera una hora". El resto de móviles siguen entrando. | FR-33, TR-41 | | |
| AC-04 | Sin apellido | Dejar el apellido vacío | No deja entrar; indica el campo | FR-32 | | |
| AC-05 | Cambiar nombre | Ajustes → Cambiar nombre | Las propuestas nuevas llevan el nombre nuevo; las antiguas conservan el anterior | FR-32 | | |
| AC-06 | Jefatura con Google, autorizada | "¿Eres de jefatura?" → Google con un correo de la lista | Entra; etiqueta Jefatura en la barra | FR-36, FR-150 | | |
| AC-07 | Jefatura con Google, no autorizada | Ídem con un correo que no está en la lista | "No autorizado"; no ve el mapa | FR-37 | | |
| AC-08 | Instalación Android | Chrome → Instalar aplicación | Icono con el escudo en el escritorio; abre a pantalla completa | FR-04, TR-20 | | |
| AC-09 | Instalación iPhone | Safari → Compartir → Añadir a pantalla de inicio (según 14) | Ídem | FR-04, TR-20 | | |
| AC-10 | Versión nueva | Desplegar una versión; abrir la app | Aviso "hay una versión nueva, recargar"; al recargar cambia la versión en Ajustes | TR-24, TR-93 | | |

## B · Mapa, lista, ficha y búsqueda

| ID | Caso | Pasos | Resultado esperado | Verifica | ✓/✗ | Notas |
|---|---|---|---|---|---|---|
| AC-11 | Encuadre y límite | Abrir el mapa | Encuadrado sobre Albolote/Calicasas; límite discontinuo visible | FR-54 | | |
| AC-12 | Forma y color | Localizar un hidrante y una boca de riego con estados distintos | Círculo vs cuadrado; verde/ámbar/rojo/gris según estado | FR-60, TR-30 | | |
| AC-13 | Cinco tamaños a pleno sol | Al mediodía, con brillo automático, mirar puntos de 100·bueno, 70·bueno, 45·bueno, 45·regular y uno que no funciona | Se distinguen los cinco tamaños; el que no funciona va atenuado y tachado | FR-60, FR-61, TR-33 | | |
| AC-14 | Sin revisar > 12 meses | Localizar un punto con revisión antigua | Borde discontinuo, mismo tamaño y color | FR-61 | | |
| AC-15 | Leyenda | Mirar la leyenda | Muestra forma, colores, tachado y borde discontinuo | FR-62 | | |
| AC-16 | Declutter | Alejar el zoom hasta ver todo el término | Quedan solo los puntos grandes; al acercar aparecen los demás; nunca racimos numerados | FR-64 | | |
| AC-17 | Las cuatro capas | Cambiar a Calle, Satélite, Catastro y volver al mapa base | Las cuatro cargan con cobertura; el selector recuerda la elegida al reabrir | FR-63 | | |
| AC-18 | Capas sin cobertura | Modo avión → selector de capas | Calle, Satélite y Catastro en gris con "necesita cobertura"; el mapa base sigue | FR-63, FR-80 | | |
| AC-19 | Mi posición | Pulsar centrar | El mapa se centra; punto azul con halo | FR-65 | | |
| AC-20 | Ficha | Tocar un punto | Código, tipo, diámetro, estado, foto, dirección, distancia, descripción, última revisión. **Sin** nombres de autores ni historial | FR-66 | | |
| AC-21 | Ficha sin autores (red) | Con el inspector del navegador, revisar la respuesta de la ficha | No viaja ningún nombre de voluntario | FR-66, principio 5 (04) | | |
| AC-22 | Ficha de boca de riego | Abrir una boca de riego | Aparece el racor; el diámetro es 45 mm | FR-16, FR-20 | | |
| AC-23 | Lista y filtros | Pestaña Lista; probar cada filtro y el orden por distancia | Filtra bien; la distancia crece hacia abajo | FR-68 | | |
| AC-24 | Búsqueda por código | Buscar "0147" | Resultado; al elegirlo, el mapa se centra y abre la ficha | FR-69 | | |
| AC-25 | Búsqueda por calle | Buscar "Real" | Aparecen los puntos de la calle Real | FR-69, FR-15 | | |
| AC-26 | Búsqueda sin cobertura | Modo avión; repetir AC-24 | Funciona igual | FR-69, FR-80, TR-01 | | |
| AC-27 | Tableta y ordenador | Abrir en tableta y en portátil | Tableta: mapa y ficha a la vez; portátil: lista lateral y ficha flotante | FR-70, TR-25 | | |
| AC-28 | Modo oscuro | Activar el modo oscuro del móvil; abrir la app | Interfaz y mapa base oscuros; los colores de estado se reconocen igual | FR-71, TR-34 | | |

## C · Sin cobertura

| ID | Caso | Pasos | Resultado esperado | Verifica | ✓/✗ | Notas |
|---|---|---|---|---|---|---|
| AC-30 | Mapa base descargado | Con wifi, primer uso; después Ajustes | Ajustes dice "Descargado · N MB · versión …" | FR-81 | | |
| AC-31 | Calles sin cobertura en zona no visitada | Modo avión; desplazarse a Calicasas sin haberlo mirado antes | Hay calles y portales | FR-81, TR-02 | | |
| AC-32 | Mapa base no descargado | Borrar datos de la app; entrar con datos móviles; modo avión | El mapa avisa "mapa base no descargado"; los puntos siguen | FR-81 | | |
| AC-33 | Alta sin cobertura | Modo avión; alta completa con foto | Se guarda; contador "1 sin enviar"; botón decía "Guardar · se enviará con cobertura" | FR-82 | | |
| AC-34 | Sincronización automática | Quitar modo avión | En menos de un minuto el contador baja a 0 y la propuesta aparece en el panel con su foto | FR-82, TR-04 | | |
| AC-35 | Tres altas sin cobertura | Repetir AC-33 tres veces; reconectar | Llegan las tres, una vez cada una | FR-82, FR-84 | | |
| AC-36 | Reintento sin duplicar | Forzar un reenvío (cerrar la app durante la sincronización y reabrir) | El panel sigue mostrando una sola propuesta por alta | FR-49, TR-05 | | |
| AC-37 | Aviso 24 h | Propuesta sin enviar con el móvil en modo avión más de 24 h (o reloj adelantado) | Mis propuestas y el mapa lo advierten | FR-83, TR-06 | | |
| AC-38 | Persistencia | Cerrar la app y reiniciar el móvil en modo avión | Puntos, mapa base y cola siguen ahí | TR-07 | | |

## D · Alta y las cinco operaciones

| ID | Caso | Pasos | Resultado esperado | Verifica | ✓/✗ | Notas |
|---|---|---|---|---|---|---|
| AC-40 | Alta de hidrante con GPS | Junto a un hidrante real; +; dejar el pin donde marca el GPS; 100 mm; bueno; foto; enviar | Propuesta en el panel con "GPS en campo · ±N m" | FR-41, FR-13 | | |
| AC-41 | Alta con pin manual | Arrastrar el pin 30 m | El panel muestra "Pin colocado a mano · 30 m del GPS" | FR-50, FR-13 | | |
| AC-42 | Los cuatro estados | Cuatro altas, una por estado | Colores correctos en el panel y, tras aprobar, en el mapa | FR-18 | | |
| AC-43 | No funciona sin descripción | Elegir "No funciona" y dejar el fallo vacío | No deja enviar; indica el campo | FR-19 | | |
| AC-44 | Boca de riego: 45 fijo y racor | Tipo boca de riego | No pregunta diámetro (45 mm fijo); pide racor con las fotos de referencia | FR-16, FR-20 | | |
| AC-45 | Hidrante sin racor | Tipo hidrante | No aparece el campo racor | FR-20 | | |
| AC-46 | Otra medida | Hidrante → "Otra medida" → 80 | Se envía; el panel lo señala "fijar 70 o 100 al aprobar" | FR-17 | | |
| AC-47 | Sin foto | Rellenar todo menos la foto | Botón deshabilitado con "Falta la foto para poder enviar" | FR-21 | | |
| AC-48 | Fuera de zona | Pin fuera del término (o en un punto real fuera) | Aviso "fuera de la zona habitual"; permite continuar; el panel lo señala y el municipio es "fuera de zona" | FR-55, FR-14 | | |
| AC-49 | Duplicado sin aviso al voluntario | Alta a 8 m de un punto activo del mismo tipo | El voluntario no ve nada; el panel marca "posible duplicado" | FR-51, FR-52 | | |
| AC-50 | Duplicado de tipo distinto | Alta de boca de riego a 8 m de un hidrante | El panel **no** lo marca como duplicado | FR-51 | | |
| AC-51 | Sigue igual | Ficha → Proponer un cambio → Sigue igual → foto → enviar | Propuesta "Revisión" sin diff de datos | FR-42 | | |
| AC-52 | Actualizar estado | Bueno → Regular con nota | Diff Bueno → Regular en el panel | FR-43 | | |
| AC-53 | Corregir datos | Cambiar diámetro 70 → 100 | Diff en el panel | FR-44 | | |
| AC-54 | Corregir ubicación | Arrastrar el pin 18 m | El panel muestra posición anterior, nueva y "18 m" | FR-45 | | |
| AC-55 | Proponer retirada | Motivo "Asfaltado" + texto + foto | Propuesta "Retirada"; el punto sigue en el mapa hasta que jefatura confirme | FR-46 | | |
| AC-56 | Retirar propuesta propia | Mis propuestas → Retirar sobre una pendiente | Desaparece del panel; queda "retirada por el autor" en el historial | FR-48 | | |
| AC-57 | Autor sin teclearlo | Cualquier envío | El panel muestra nombre y apellido sin que el formulario los pidiera | FR-23 | | |
| AC-58 | Jefatura desde el móvil | Con sesión de Google en el móvil, actualizar el estado de un punto | Botón "Aplicar ahora"; el cambio aparece al momento en el mapa de otro móvil tras sincronizar; el registro lo anota como administrador | FR-150, FR-151 | | |

## E · Voluntario: resultado, incidencias, ajustes

| ID | Caso | Pasos | Resultado esperado | Verifica | ✓/✗ | Notas |
|---|---|---|---|---|---|---|
| AC-60 | Aviso de aprobación | Jefatura aprueba un alta del móvil A; abrir la app en A | Aviso "tu alta … se aprobó como HID-…" | FR-90 | | |
| AC-61 | Aviso de rechazo con motivo | Jefatura rechaza con motivo; abrir la app | El aviso y Mis propuestas muestran el motivo | FR-90, FR-91 | | |
| AC-62 | Correcciones visibles | Jefatura aprueba con correcciones; abrir Mis propuestas | Se ve qué se corrigió | FR-91, FR-106 | | |
| AC-63 | Algo no funciona | Ajustes → Algo no funciona → describir → Avisar | Aparece en Voluntarios → Incidencias, abierta, con versión y pantalla | FR-92, FR-132 | | |
| AC-64 | Cerrar sesión con cola pendiente | Con una propuesta sin enviar, Cerrar sesión | Pide confirmación explícita y avisa de que se perderá | FR-93 | | |
| AC-65 | Primer uso desde Ajustes | Ajustes → Cómo se usa | Vuelven a verse las tres pantallas | FR-94 | | |

## F · Panel: cola de revisión

| ID | Caso | Pasos | Resultado esperado | Verifica | ✓/✗ | Notas |
|---|---|---|---|---|---|---|
| AC-70 | Diff y señales | Abrir una propuesta de estado | Antes tachado, después en verde; señales de GPS y foto | FR-102, FR-104 | | |
| AC-71 | Minimapa | Abrir un alta | Pin propuesto con los aprobados alrededor | FR-103 | | |
| AC-72 | Dirección deducida | Abrir un alta con cobertura en el panel | Campo "Dirección" relleno y marcado "deducida · editable" | FR-15, FR-105 | | |
| AC-73 | Dirección corregida | Editar el campo y aprobar | La ficha del voluntario muestra la dirección corregida | FR-15, FR-105 | | |
| AC-74 | Dirección sin servicio | (Simulado) Nominatim sin respuesta; aprobar | Se aprueba sin dirección; Salud cuenta "puntos sin dirección: +1" | FR-15, TR-72 | | |
| AC-75 | Aprobar | Aprobar un alta | El punto aparece en el mapa con código nuevo; entrada en el registro | FR-106, FR-10 | | |
| AC-76 | Aprobar con correcciones | Cambiar el diámetro y Guardar y aprobar | El punto lleva el valor corregido; el registro y Mis propuestas del autor lo reflejan | FR-106 | | |
| AC-77 | Otra medida sin fijar | Aprobar directamente un alta con "otra medida" | No deja: pide fijar 70 o 100 en correcciones | FR-17 | | |
| AC-78 | Rechazar sin motivo | Rechazar con el motivo vacío | No deja | FR-106 | | |
| AC-79 | Fusionar duplicado | Abrir el alta de AC-49 → comparar → Fusionar | Comparación en dos columnas; tras fusionar no hay punto nuevo; el existente tiene la foto nueva y revisión de hoy | FR-51, FR-106 | | |
| AC-80 | Aprobación en bloque | Seleccionar 5 revisiones → Aprobar seleccionadas | Las cinco aprobadas; cinco entradas en el registro; menos de 30 s en total | FR-107 | | |
| AC-81 | Bloque con una desactualizada | Incluir en el lote una propuesta cuyo punto cambió después | Se aprueban las demás; la desactualizada queda pendiente con aviso | FR-107, FR-108 | | |
| AC-82 | Desactualizada individual | Abrir esa propuesta | Aviso en rojo; el botón es "Confirmar y aprobar" | FR-108 | | |
| AC-83 | Historial | Filtro Aprobadas / Rechazadas | Se ven con quién, cuándo, motivo o correcciones; solo lectura | FR-109 | | |
| AC-84 | Filtro por operación | Elegir "revisiones" | Solo revisiones | FR-101 | | |
| AC-85 | Búsqueda global | Escribir un apellido | Aparecen sus propuestas | FR-145 | | |

## G · Panel: inventario, caducadas, registro, papelera, voluntarios, ajustes

| ID | Caso | Pasos | Resultado esperado | Verifica | ✓/✗ | Notas |
|---|---|---|---|---|---|---|
| AC-90 | Inventario: filtros y orden | Filtrar por núcleo y ordenar por última revisión | Correcto; "mostrando X de N" | FR-120 | | |
| AC-91 | Dirección en celda | Editar una dirección en la tabla | Se guarda; la ficha la muestra | FR-120, FR-15 | | |
| AC-92 | Retirar | Retirar un punto con motivo | Desaparece del mapa; sigue en el registro e historial | FR-124 | | |
| AC-93 | Borrar y restaurar | Borrar un punto → Papelera → Restaurar | Vuelve al mapa | FR-124 | | |
| AC-94 | Historial de un punto | Inventario → Historial | Todas las acciones sobre ese punto | FR-123 | | |
| AC-95 | Revisiones caducadas por núcleo | Abrir la pestaña | Agrupadas por núcleo con recuento | FR-121 | | |
| AC-96 | Hoja de campo | Hoja de campo por núcleo → imprimir a PDF | Una hoja por núcleo con código, dirección (o coordenadas), tipo, Ø, estado y casilla | FR-122 | | |
| AC-97 | Registro inmutable | Intentar editar o borrar una entrada (por API con cuenta de administrador) | Falla | FR-123, TR-46 | | |
| AC-98 | Actividad de voluntarios | Pestaña Voluntarios, 3 y 12 meses | Cifras coherentes con lo aprobado y rechazado en el piloto | FR-130 | | |
| AC-99 | Anonimizar | Anonimizar a un voluntario de prueba | Sus filas muestran "voluntario dado de baja"; el punto y el registro siguen | FR-131 | | |
| AC-100 | Incidencia resuelta | Marcar resuelta la de AC-63 | Estado resuelta; Salud baja en uno | FR-132, FR-143 | | |
| AC-101 | Cambiar código sin revocar | Generar uno nuevo sin revocar → confirmar | Los móviles registrados siguen; un móvil nuevo necesita el código nuevo; el antiguo ya no vale | FR-34, FR-140 | | |
| AC-102 | Cambiar código revocando | Generar con "Revocar todos" → confirmar | Todos los móviles piden el código al abrir; conservan el nombre | FR-34, FR-35 | | |
| AC-103 | Administradores | Añadir un correo, entrar con él; desactivarlo, volver a entrar | Entra / "No autorizado". No deja desactivar al último activo | FR-141 | | |
| AC-104 | Parámetros | Cambiar meses de revisión a 6 → Guardar → sincronizar un móvil | Más puntos con borde discontinuo | FR-142 | | |
| AC-105 | Salud | Abrir Ajustes | Los ocho indicadores con valores plausibles; fecha del último respaldo de la semana | FR-143 | | |
| AC-106 | Purga | Lanzar purga | Aviso de que tarda unos minutos; después Storage usado baja o queda igual y hay entrada en el registro | FR-144 | | |
| AC-107 | Descargar inventario | Descargar JSON | Archivo con todos los puntos activos | FR-144 | | |

## H · Seguridad y datos (los ejecuta Claude Code, jefatura firma el resultado)

| ID | Caso | Resultado esperado | Verifica | ✓/✗ | Notas |
|---|---|---|---|---|---|
| AC-110 | Las ocho pruebas de intrusión con la `anon key` (TR-40) | Las ocho fallan; documentadas en 11 | TR-40 | ✓ | 21 sep 2026 · `npm run intrusion`, y en cada PR desde ci-sql. Resultado de cada una, en 11 §5 |
| AC-111 | Código no almacenado en el móvil | Inspección del almacenamiento local: solo token, nombre, `dispositivo_id` | TR-43 | ✓ | 23 sep 2026 · `src/lib/acceso.test.ts` · "al entrar guarda token, nombre e identificador; el código nunca (TR-43)" |
| AC-112 | EXIF eliminado | La foto en el bucket no tiene metadatos | TR-47 | | |
| AC-113 | Cuota de subidas | La reserva 41 del día falla | TR-45 | ✓ | 23 sep 2026 · pgTAP `05_rpc_voluntario.test.sql` ("la reserva 41 del día: rechazada") y `07_concurrencia_rpc.test.sql` (40 y 41 a la vez) |
| AC-114 | Respaldo restaurado | Restauración sobre base limpia ejecutada y documentada | TR-51 | ✓ | 20–21 sep 2026 · ensayo completo con un volcado cifrado real; sacó tres defectos (15 §5.3, verificación de la Fase 8) |
| AC-115 | Presupuesto de rendimiento | CI: < 3 s en 3G, < 300 kB | TR-10, TR-11 | ✓ | 21 sep 2026 · 2,40 s la primera pantalla con 3G simulada (`e2e/rendimiento.spec.ts`); 23 sep 2026 · 271,5 kB de JavaScript inicial (`npm run presupuesto`); 24 sep 2026 · 178,1 kB con las pantallas con sesión en una porción aparte, y `presupuesto` falla si Leaflet o una pantalla con sesión vuelven al arranque (DEC-099); 24 sep 2026 · 2,44 s de mediana en 5 pasadas, con la porción con sesión sin `Suspense` (DEC-112) |
| AC-116 | Carga con 1.000 puntos | Mapa fluido en el móvil de gama media documentado | TR-12 | ✓ | 22 sep 2026 · POCO M6 Pro, Android 15 (`AP3A.240905.015.A2`), sobre staging; se maneja con soltura |

## I · Exportación, avisos, utilidades y robustez (FR-160–168, TR-100–107)

| ID | Caso | Pasos | Resultado esperado | Verifica | ✓/✗ | Notas |
|---|---|---|---|---|---|---|
| AC-120 | Exportar Excel | Inventario → filtrar por núcleo → Exportar → .xlsx | Abre en Excel con acentos correctos y solo los puntos filtrados; entrada en el Registro | FR-160, TR-105 | | |
| AC-121 | Exportar GeoJSON | Ídem → .geojson | Se abre en QGIS o geojson.io con los puntos en su sitio | FR-160 | | |
| AC-122 | Cómo llegar | Ficha → Cómo llegar | Se abre la app de mapas del móvil con el punto | FR-161 | | |
| AC-123 | QR | Ajustes del panel → Código QR → imprimir | Un móvil que escanea el QR abre la aplicación | FR-162 | | |
| AC-124 | Push voluntario | Ajustes → activar notificaciones → jefatura aprueba una propuesta | Llega la notificación; al tocarla se abre Mis propuestas. En iPhone, solo con la app instalada, y la app lo avisó antes | FR-163, TR-104 | | |
| AC-125 | Push jefatura | Administrador suscrito; un voluntario envía dos altas en 10 min | Una sola notificación agrupada en la hora | FR-164 | | |
| AC-126 | Regenerar zona desde Ajustes | Ajustes → Regenerar zona | Aviso "tarda unos minutos"; Salud muestra la nueva fecha al terminar | FR-165 | | |
| AC-127 | Novedades | Tras un despliegue, abrir Ajustes | Hasta tres líneas de novedades con la versión nueva, escritas para un voluntario: sin rutas de archivo ni códigos internos (DEC-091) | FR-167 | ✓ | e2e `mapa.spec.ts` (RV-47) |
| AC-128 | Servidor no disponible | Bloquear Supabase (modo avión con mapa base descargado no vale: usar un bloqueo de dominio) | La app muestra los datos guardados y "sin conexión con el servidor"; nada en blanco; lo enviado queda en cola | FR-168, TR-106 | | |
| AC-129 | Cabeceras | Analizador de cabeceras sobre producción | Puntuación A; CSP sin `unsafe-eval` | TR-100 | | |
| AC-130 | Vigilancia | Ver la última ejecución de `vigilancia.yml` | En verde; al forzar un fallo se abre una issue | TR-102 | | |
| AC-131 | Lighthouse | Informe del último despliegue a staging | Rendimiento ≥ 85, accesibilidad ≥ 95, PWA instalable | TR-103 | | |
| AC-132 | Dependabot | Ver PRs cerrados del último mes | Parches fusionados solos con CI verde | TR-101 | | |
| AC-133 | Rechazo sin nombres | Jefatura rechaza con un motivo; el autor abre Mis propuestas | Ve el motivo y "jefatura" como quien decidió; ningún correo ni nombre ajeno | FR-27 | | |
| AC-134 | Ningún nombre en las respuestas al voluntario | Con el inspector del navegador, revisar todas las respuestas de `fn_listar_puntos`, `fn_ficha_punto`, `fn_mis_propuestas` y las notificaciones push recibidas durante el recorrido | No aparece ningún nombre de voluntario ajeno ni correo de administrador | FR-27, TR-40 | | |

## J · Interfaz, textos y concurrencia (UI-01 a UI-22, TR-110–115)

| ID | Caso | Pasos | Resultado esperado | Verifica | ✓/✗ | Notas |
|---|---|---|---|---|---|---|
| AC-140 | Ningún control muerto | Recorrido automatizado que pulsa todos los controles de cada pantalla de la app y del panel | Cada uno cambia la pantalla, abre un diálogo o muestra un aviso; ningún botón deshabilitado sin motivo escrito debajo | UI-01, UI-02, TR-110 | ✓ | 22 sep 2026 · automatizado en `e2e/controles.spec.ts` para las ocho pantallas del **voluntario** en el móvil: pulsa cada control y exige que cambie la pantalla, abra un diálogo o saque un aviso; en escritorio comprueba que ninguno se queda sin nombre. 23 sep 2026 · también las siete pantallas del **panel** en escritorio (RV-30): la primera de cada acción repetida por fila, las descargas esperando el archivo, y fuera, con su motivo, "Ir al mapa", "Cerrar sesión" de Google y "Salir" de la cabecera (salen del panel; los cubre `acceso.spec.ts`). En la app no se pulsan "Descargar" y "Actualizar" del mapa base ni sus avisos en el mapa (bajarían megas; los cubren `mapa.spec.ts` y `ajustes`) ni "Cómo llegar" (abre la app de mapas del móvil, FR-161). **Parcial:** la cola del recorrido del panel está vacía, así que "Aprobar", "Rechazar…" y "Fusionar" no se pulsan aquí; los cubren `panel-cola.spec.ts` y la integración `fase7.spec.ts` (docs/18 RV-51) 
| AC-141 | Legibilidad y separación | Revisión de cada pantalla en móvil y escritorio | Sin texto pegado; datos compuestos con ` · `; "Aprobar" y "Rechazar…" separados; objetivos táctiles ≥ 44 px | UI-10 a UI-16, TR-113 | | |
| AC-142 | Dos administradores a la vez | Dos navegadores abren la misma propuesta y pulsan Aprobar casi a la vez | Uno aprueba; el otro ve "esta propuesta ya no está pendiente" y la lista se refresca. Nada se duplica ni se pisa | TR-114, 05 §11 | ✓ | 23 sep 2026 · pgTAP `07_concurrencia_rpc.test.sql` con dblink: dos `fn_aprobar` a la vez, la segunda falla con `PROPUESTA_NO_PENDIENTE` |
| AC-143 | Dos envíos del mismo móvil | Forzar dos sincronizaciones simultáneas con propuestas en cola | Una sola propuesta por `clave_local` | TR-114, FR-49 | ✓ | 23 sep 2026 · pgTAP `07_concurrencia_rpc.test.sql` (dos `fn_proponer` con la misma `clave_local`) y `src/lib/cola.test.ts` |
| AC-144 | Estados vacíos | Vaciar la cola, filtrar el inventario a cero, entrar sin propuestas propias | Las tres pantallas muestran un texto útil, no una tabla vacía | UI-03 | | |
| AC-145 | Errores explicados | Provocar un rechazo sin motivo, una foto que falta y un fallo de red | Tres mensajes en español que dicen qué pasa y qué hacer; ningún código técnico | UI-04, TR-36 | | |
| AC-146 | Textos centralizados | Buscar en el código literales de interfaz fuera de `src/lib/textos.ts` | Ninguno; el build falla si se añade uno | UI-20, TR-111 | ✓ | 23 sep 2026 · regla de `eslint.config.js` en `npm run lint` (ci-calidad) y `src/lib/textos.test.ts` (cada texto en el Apéndice A); la regla se amplía a `.ts` en RV-31 |
| AC-147 | Verificación por fase | Abrir `docs/verificacion/` | Un archivo por fase cerrada, con casos ejecutados, comandos y suposiciones | TR-115 | | |

---

## K · Funciones de mapa para emergencias (FR-72–76, TR-116–119, DEC-089)

Pendientes de conformidad de jefatura en F9.1 (#76). Se comprueban en el piloto con uso real.

| ID | Caso | Pasos | Resultado esperado | Verifica | ✓/✗ | Notas |
|---|---|---|---|---|---|---|
| AC-150 | ¿Qué hay aquí? | Sin cobertura, mantener pulsado un sitio del mapa sin marcador | Hoja con coordenadas decimales y UTM ETRS89 huso 30, la calle más cercana si la hay y las cuatro acciones; *Añadir un punto aquí* abre el alta con el pin ahí; *atrás* la cierra | FR-72, FR-50 | ✓ | 23 sep 2026 · e2e `mapa.spec.ts` y `busqueda.spec.ts` |
| AC-151 | Buscar calle, lugar, portal o coordenadas | Sin cobertura, buscar "c/ real"; con cobertura, "calle real 12"; pegar un enlace de Google Maps | La calle sale del móvil con "© OpenStreetMap"; el portal, con "CartoCiudad · IGN"; el enlace da "Coordenadas …" arriba; sin cobertura, el portal explica que necesita cobertura y enseña la calle | FR-73, FR-69, TR-118 | ✓ | 23 sep 2026 · e2e `busqueda.spec.ts` |
| AC-152 | Modo incidente | Sin cobertura, con GPS, pulsar *Cercanos* | Como mucho cinco puntos que funcionan (bueno o regular), en orden de distancia, con rumbo y tramos; aviso si el más cercano no funciona; *Solo hidrantes* cambia la lista; *atrás* sale; recargar lo mantiene | FR-74 | ✓ | 23 sep 2026 · e2e `incidente.spec.ts` |
| AC-153 | Compartir un punto | Ficha → *Compartir* → WhatsApp | Llega código, tipo, diámetro, estado, dirección, coordenadas decimales y UTM y un enlace de Google Maps; sin nombres ni descripción | FR-75, FR-27 | | |
| AC-154 | Medir un tendido | Desde *Cercanos*, *Medir tendido*; añadir dos vértices; *Deshacer*; *Terminar* | La barra dice la distancia y los tramos de manguera; tocar no abre fichas; *Deshacer* quita el último; *atrás* sale | FR-76, FR-142 | ✓ | 23 sep 2026 · e2e `medir.spec.ts` |
| AC-155 | G2: el punto más cercano que funciona | Con puntos guardados y sin red, cronometrar desde abrir la app hasta ver la primera fila de *Cercanos* con un toque | Menos de 15 s en campo; en e2e con perfil móvil, menos de 3 s | G2, FR-74, TR-116 | | e2e `incidente.spec.ts` (@rendimiento) |
| AC-156 | UTM exacto | Comparar las UTM de la app con PROJ (EPSG:4258 → EPSG:25830) en cuatro puntos de la zona | Diferencia ≤ 1 m | TR-119, FR-72, FR-75 | ✓ | 23 sep 2026 · vitest `coordenadas.test.ts` |

---

## L · Requisitos generales que no tenían caso propio (docs/18 GM-00)

Casos para que cada FR de 01 tenga al menos uno que lo cite (`scripts/docs.test.ts`). La mayoría ya
se ven al recorrer los anteriores: aquí se anotan una vez.

| ID | Caso | Pasos | Resultado esperado | Verifica | ✓/✗ | Notas |
|---|---|---|---|---|---|---|
| AC-157 | Qué es y para quién | Recorrer el mapa con un voluntario y el panel con jefatura | El mapa enseña hidrantes y bocas de la zona mantenidos por voluntarios y validados por jefatura; responde dónde está el más cercano, en qué estado y cuándo se revisó; hay dos perfiles, voluntario sin cuenta y jefatura con Google | FR-01, FR-02, FR-03 | | |
| AC-158 | Todo en español | Recorrer todas las pantallas de la app y del panel | Ningún texto en otro idioma ni código técnico a la vista | FR-05, UI-20 | | regla de ESLint y `textos.test.ts` (AC-146) |
| AC-159 | Datos de cada punto | Abrir la ficha de un hidrante y de una boca de riego | Tipo, ubicación, descripción, fecha de última revisión y situación; el tipo no se ofrece para cambiar (FR-11) | FR-11, FR-12, FR-22, FR-24, FR-25 | | |
| AC-160 | Estados de una propuesta | Enviar tres propuestas; jefatura aprueba una, rechaza otra con motivo; el autor retira la tercera | Mis propuestas enseña aprobada, rechazada con motivo y retirada por ti; la pendiente no está en el mapa general | FR-26, FR-47 | | |
| AC-161 | Fotos solo con código | Intentar pedir una URL de subida sin token | 401; con token, hasta el tope diario del dispositivo | FR-38 | ✓ | 23 sep 2026 · `scripts/probar-functions.ts` e intrusión (TR-40) |
| AC-162 | Seis operaciones y "Proponer un cambio" | Abrir la ficha → *Proponer un cambio* | Cinco operaciones sobre el punto; la sexta, el alta, desde el botón + | FR-40, FR-67 | | e2e `operaciones.spec.ts` |
| AC-163 | Zona de cobertura | Colocar un pin en Albolote, en Calicasas y fuera | Dentro, sin aviso; fuera (más de unos 400 m), aviso y se puede continuar | FR-53, FR-55 | | |
| AC-164 | Panel en ordenador y tableta | Abrir el panel en un portátil y en una tableta con una cuenta autorizada y con otra no autorizada | La autorizada entra y se usa en los dos; la otra ve "no autorizado" | FR-100 | | e2e `anchos.spec.ts` |
| AC-165 | Pendientes a la vista | Con tres propuestas pendientes, abrir el panel | La cola dice 3 en todo momento, y baja al aprobar | FR-110 | | |
| AC-166 | Caducadas sin correos | Dejar puntos sin revisar más de 12 meses | Salen en Caducadas del panel; no llega ningún correo automático | FR-125 | | |
| AC-167 | Núcleos desde Ajustes | Ajustes → Núcleos: renombrar uno y añadir otro | El renombrado se ve en el inventario y la lista; el nuevo sale con su recuento de puntos | FR-166 | | e2e `panel-ajustes.spec.ts` |

---

## Recorridos

| Fecha | Entorno | Quién | Móviles | Casos ✓ / ✗ / n.a. | Firma de jefatura |
|---|---|---|---|---|---|
| | staging (piloto) | | | | |
| | producción | | | | |

Un caso ✗ se anota en 12 si implica un cambio de decisión, o se abre como tarea en 09 si es un
defecto. No se abre a los 65 con ningún ✗ en las secciones A–G.
