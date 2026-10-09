# 01 · Requisitos funcionales — Mapa de hidrantes

| | |
|---|---|
| **Estado** | Congelado. Cambia solo con una versión nueva. |
| **Conformidad** | Versión aprobada por el desarrollador al pedir el cambio; jefatura recibe la versión nueva con la release (DEC-177). |
| **Versión** | 1.13 — 9 oct 2026 (`docs/33`): la entrada del día del lanzamiento, con los topes de entradas en Ajustes y «abrir la entrada para todos 24 h», que se abre sola al cambiar el código revocando (FR-33, FR-34, FR-140, FR-142, DEC-190); Salud del sistema en palabras, con un resumen arriba (FR-143, DEC-192); Mis propuestas con una línea de lo propuesto (FR-91, DEC-192). v1.12 — oct 2026 (`docs/29`): enganche Directo (FR-20, DEC-170); Inventario con filtros de tipo y estado y Editar en panel lateral con mover el punto (FR-120, DEC-168, DEC-169); retirados FR-92, FR-121, FR-122, FR-130 y FR-132, y FR-131 por script (DEC-167); FR-143 sin incidencias. v1.11 — octubre de 2026 (`docs/28`): el detalle de la cola sin chips de señales; el ⚠ de la lista solo por lo que el detalle enseña como aviso (FR-104, DEC-166). v1.10 — 5 de octubre de 2026 (`docs/27`): Cercanos con un botón por fila, sin tramos ni *Medir tendido*, y los avisos de posición en el subtítulo (FR-74, DEC-165). v1.9 — 5 de octubre de 2026 (`docs/26`): desde la app, jefatura abre el panel con un toque (FR-150, DEC-164). v1.8 — 4 de octubre de 2026 (`docs/25`): regular en amarillo RAL (FR-60, DEC-154); sin revisar con un anillo de rayas (FR-61, FR-62, DEC-155); la ficha con banda de estado (FR-66, DEC-156); la lista sin dirección y con la distancia (FR-68); coordenadas con su sistema (FR-72, FR-75, DEC-157); la cola con mapa en las seis operaciones, todos los datos y fotos (FR-102, FR-103, FR-105, DEC-158); «tipo de enganche» en lugar de «racor» (FR-20, FR-41, FR-44, FR-66, DEC-163). v1.7 — 3 de octubre de 2026 (`docs/24`, Frontend): "¿Qué hay aquí?" con *Añadir un punto aquí* primero y sin la calle a la vista (FR-72, RV-99 y RV-100); la segunda pantalla de primer uso define Malo y No funciona (FR-94, RV-99). v1.6 (docs/24, Backend) — 3 de octubre de 2026: bocas de riego de 45, 70 u otra medida, que se aprueba tal cual (FR-16, FR-17, DEC-144); estado "Barro" (FR-18, FR-61, FR-68, DEC-145); foto del sitio en alta y en corregir ubicación (FR-21, FR-41, FR-45, FR-66, DEC-146). v1.5 — 25 de septiembre de 2026: Novedades enseña lo último de cada versión, cada línea con su número (FR-167, DEC-142). v1.4 — 24 de septiembre de 2026: sin cobertura, el mapa base propio se pinta debajo de la capa en línea elegida (FR-63, DEC-098). v1.3 — 23 de septiembre de 2026: el tipo de un punto no cambia (FR-11, FR-44, DEC-090); funciones de mapa para emergencias: "¿Qué hay aquí?", búsqueda de calles y coordenadas, modo incidente, compartir y medir (FR-50, FR-69, FR-142, FR-72 a FR-76, DEC-089). v1.2 — 21 de septiembre de 2026: alta con pulsación larga en FR-50 (DEC-077). v1.1 — 17 de septiembre de 2026. Consolida `requisitos-hidrantes.html` v6.1 §1–5 y §8.1; v1.1 añade problema/objetivos/no-objetivos (estructura del skill *write-spec*), la sección 13 y el criterio de alcance DEC-037. |
| **Propietario de** | las reglas funcionales del sistema. Todo otro documento las cita por su `FR-nn`. |
| **No contiene** | pasos de uso (→ 02), cifras técnicas (→ 03), campos y tipos (→ 05), colores y tamaños (→ 06). |

Convenciones: **debe** = obligatorio en la versión 1; **puede** = permitido pero no exigido.
**Prioridad:** todos los requisitos son P0 (imprescindibles para el piloto) salvo los marcados **P1**,
que también forman parte de la versión 1 pero se construyen después del piloto si hace falta para no
retrasarlo. **Criterio de alcance (DEC-037):** todo lo que Claude Code pueda construir sin trabajo
adicional del desarrollador, sin cuentas externas nuevas y sin coste está dentro de la versión 1. Lo
que no cumple ese criterio está en 16.

---

## A. Problema, objetivos y no-objetivos

### Problema

La Agrupación de Voluntarios de Protección Civil de Albolote no tiene un inventario fiable de los
hidrantes y bocas de riego del término municipal y de Calicasas: el conocimiento está en la cabeza de
unos pocos voluntarios veteranos y en hojas dispersas, y nadie sabe con certeza, en un servicio, cuál
es el punto de agua más cercano que funciona ni cuándo se comprobó por última vez. El coste de no
resolverlo se paga en minutos perdidos durante una emergencia y en trabajo de revisión que se repite
o no se hace.

### Objetivos (cómo sabremos que ha funcionado)

| # | Objetivo | Métrica | Meta a 6 meses del lanzamiento |
|---|---|---|---|
| G1 | Inventario completo y vivo | puntos activos con revisión < 12 meses | ≥ 90 % |
| G2 | Respuesta en campo | tiempo desde abrir la app hasta ver el punto más cercano que funciona | < 15 s, sin cobertura |
| G3 | Participación amplia, no de tres personas | voluntarios con ≥ 1 propuesta aprobada | ≥ 30 de 65 |
| G4 | Moderación sostenible | propuestas pendientes con más de 14 días | 0 en Salud del sistema |
| G5 | Coste y dependencia cero | coste mensual; horas del desarrollador tras el lanzamiento | 0 €; < 1 h/trimestre |

Indicadores adelantados (semana 1 del piloto): instalaciones en móviles reales, altas recibidas,
tiempo medio de aprobación. Indicadores retardados: G1–G5.

### No-objetivos de la versión 1 (→ 16)

Solo lo que exige trabajo del desarrollador más allá de las dos horas, una cuenta externa nueva o
coste: dominio propio, cuentas individuales para voluntarios, avisos por correo o SMS (necesitan un
proveedor), aplicación nativa en tiendas, e integración directa con sistemas de terceros (la
exportación FR-160 cubre el intercambio de datos).

### Historias de usuario (resumen)

- Como voluntario en un servicio, quiero ver de un vistazo el punto de agua más cercano que funciona,
  aunque no tenga cobertura, para no perder minutos buscando.
- Como voluntario en ronda, quiero dar de alta o confirmar un punto en cuatro toques y con foto, para
  que el trabajo de campo se convierta en dato sin papeleo.
- Como voluntario, quiero saber en qué quedó lo que propuse y por qué, para no repetir errores.
- Como jefatura, quiero revisar propuestas con el antes y el después a la vista y aprobar en bloque
  las rutinarias, para que moderar no se convierta en un trabajo.
- Como jefatura, quiero saber qué puntos llevan más de un año sin revisar, por núcleo, para repartir
  el trabajo de campo.
- Como jefatura, quiero exportar el inventario en un formato abierto para compartirlo con bomberos o
  el ayuntamiento sin darles acceso al sistema.
- Como responsable de la agrupación, quiero que todo funcione sin depender de una persona concreta ni
  de una cuota de pago.

---

## 0. Objetivo y usuarios

| ID | Requisito |
|---|---|
| FR-01 | El sistema mantiene un mapa vivo de los **hidrantes de incendios** y **bocas de riego** de la zona de cobertura, mantenido por los voluntarios sobre el terreno y validado por jefatura. |
| FR-02 | El sistema responde en cualquier momento a tres preguntas: **dónde está el punto de agua más cercano**, **en qué estado está** y **cuándo se comprobó por última vez**. |
| FR-03 | Hay dos perfiles: **voluntario** (~65 personas, consulta y propone desde el móvil, sin cuenta individual) y **jefatura / administrador** (revisa, aprueba y administra; entra con Google). |
| FR-04 | La aplicación es una web instalable (PWA), la misma para móvil, tableta y ordenador; el diseño se adapta al ancho, no hay versiones distintas. |
| FR-05 | Toda la interfaz está en español. |

---

## 1. Datos de cada punto

| ID | Requisito |
|---|---|
| FR-10 | Cada punto tiene un **código** interno único y correlativo, `HID-####` para hidrantes y `BOC-####` para bocas de riego, generado por el sistema y nunca reutilizado. |
| FR-11 | Cada punto es de un **tipo**: hidrante de incendios o boca de riego. El tipo no cambia una vez creado; se corrige retirando el punto y dando de alta el correcto (DEC-090). |
| FR-12 | Cada punto tiene una **ubicación** (latitud/longitud) fijada por el voluntario, por GPS o colocando el pin en el mapa. |
| FR-13 | El sistema registra el **origen de la ubicación** (GPS en campo / colocado a mano), la **precisión del GPS** que informó el móvil y la **distancia** entre la posición GPS y el pin final. Es una señal para jefatura; no bloquea nada. |
| FR-14 | El sistema deduce el **municipio y núcleo** de las coordenadas por cruce con la zona de cobertura. El voluntario no lo introduce. Fuera de todo límite, el municipio es "fuera de zona". |
| FR-15 | El sistema deduce la **dirección** (calle y número más cercanos) de las coordenadas al revisar la propuesta, con OpenStreetMap. Jefatura puede corregirla. El voluntario no la escribe. Si el servicio de direcciones no responde, el punto se aprueba sin dirección y queda marcado como pendiente de dirección. |
| FR-16 | Cada punto tiene un **diámetro de la salida mayor**: hidrantes **70 o 100 mm**; bocas de riego **45 o 70 mm, u otra medida** (de 20 a 150 mm). Si el voluntario no lo indica en una boca, 45 (DEC-144). En hidrantes con varias salidas se registra solo la mayor. La etiqueta en pantalla dice "diámetro de la salida mayor", porque es el de la salida y no el de la tubería. |
| FR-17 | El voluntario puede indicar **"otra medida"** de diámetro. La propuesta llega a jefatura señalada. En un **hidrante**, para aprobarla, jefatura fija 70 o 100 o la rechaza: ningún hidrante aprobado tiene otro valor. En una **boca de riego** se aprueba tal cual, porque es lo que hay en la calle y una boca no tiene norma que la limite (DEC-144). |
| FR-18 | Cada punto tiene un **caudal / estado** en una escala de cinco niveles: **bueno, regular, malo, barro, no funciona**. "Malo" = se probó y sale débil. "Barro" = sale agua con barro: no se puede usar, y no exige descripción (DEC-145). "No funciona" = no se pudo usar (tapa que no abre, válvula rota, arqueta enterrada o inaccesible). Solo uno puede ser cierto a la vez, por eso van en la misma escala. |
| FR-19 | Si el estado es "no funciona", es obligatoria una **descripción del fallo** en texto libre. |
| FR-20 | Las bocas de riego tienen un **tipo de enganche**: Barcelona, Granada, Directo u otro (en ese orden, DEC-170), con fotos de referencia junto al campo. Los hidrantes no lo tienen (norma UNE 23400; no hay variantes municipales). En los datos y la API el campo sigue llamándose `racor`; solo cambia lo que se lee (DEC-163). |
| FR-21 | Cada punto tiene una **foto de la conexión**, obligatoria, hecha con la cámara del móvil. Sin foto no se puede enviar un alta ni una revisión. Además, una **foto del sitio**, una referencia para encontrarlo ("al lado de la gasolinera"), obligatoria al dar de alta y al corregir la ubicación, y que no se pide en las demás operaciones. Los puntos de antes pueden no tenerla (DEC-146). |
| FR-22 | Cada punto puede tener una **descripción** libre opcional (referencia de calle, acceso…). |
| FR-23 | El **autor** de cada cambio (nombre y apellido) se toma de la sesión del móvil; no se pregunta en cada envío. |
| FR-24 | Cada punto tiene una **fecha de última revisión física**, que fija el sistema al aprobar una propuesta que la confirme. |
| FR-25 | Cada punto tiene una **situación**: activo, retirado (existió y ya no está) o borrado (en papelera, recuperable 30 días). |
| FR-26 | Cada propuesta tiene un **estado de moderación**: pendiente, aprobada, rechazada (con motivo) o retirada por su autor. |
| FR-27 | **Los nombres solo los ve jefatura.** Un voluntario no ve nunca, en ninguna pantalla ni en ninguna respuesta del servidor, el nombre de otro voluntario ni el correo de un administrador: ni en el mapa, ni en la ficha, ni en Mis propuestas (donde ve solo su propio nombre, "jefatura" como quien decidió, y el motivo), ni en las notificaciones, ni en las exportaciones. Quién propuso, quién aprobó y qué se corrigió vive únicamente en el panel (registro, cola, historial de un punto, actividad). Se comprueba en la respuesta de red, no solo en la pantalla (AC-21, AC-134). |

---

## 2. Acceso de voluntarios

| ID | Requisito |
|---|---|
| FR-30 | No hay cuentas individuales para voluntarios. La primera vez que se abre la aplicación en un móvil se piden el **código de acceso del grupo** (6 dígitos) y el **nombre y apellido** del voluntario. |
| FR-31 | El código se teclea **una sola vez por móvil**. Tras validarlo, el móvil recibe una credencial propia (token de dispositivo) y no vuelve a pedir el código mientras esa credencial sea válida. |
| FR-32 | El móvil recuerda el nombre y apellido; se pueden cambiar desde Ajustes si el teléfono pasa a otra persona. Se exige apellido porque con 65 personas los nombres se repiten. |
| FR-33 | Los intentos de código están limitados (por dispositivo, por dirección IP real y en total). Tras demasiados fallos, la aplicación pide esperar sin indicar si el código estaba cerca. También están limitadas las **entradas con el código bueno**, desde una misma wifi al día y entre todos por hora, para que un código filtrado no sirva para sacar credenciales sin fin; jefatura cambia esos dos topes desde Ajustes (FR-142). Los detalles medibles están en 03 y 11. |
| FR-34 | Jefatura puede **cambiar el código** desde Ajustes en cualquier momento, eligiendo entre **cerrar solo la puerta a accesos nuevos** (quien ya entró sigue trabajando) o **revocar todos los dispositivos** (todos vuelven a teclearlo; para cuando se sospecha una filtración). Jefatura puede además **abrir la entrada para todos durante 24 horas** (hasta 72) y cerrarla antes: mientras está abierta, los topes de entradas con el código bueno (FR-33) no frenan a los voluntarios que entran a la vez desde la misma wifi, y los de intentos fallidos siguen igual. Se abre sola 24 horas al generar un código nuevo **revocando todos los dispositivos** y se cierra sola al pasar la hora. El día del lanzamiento se abre **antes** de comunicar el código (DEC-190). |
| FR-35 | La credencial de un móvil caduca si no se usa durante un periodo largo (03) y el voluntario vuelve a introducir el código conservando su nombre. |
| FR-36 | Jefatura y administradores entran con su **cuenta de Google**, la misma que ya usan en la app de uniformidad, tanto en el móvil como en el ordenador. |
| FR-37 | Los permisos de hidrantes son **independientes** de los de la app de uniformidad: una lista propia de correos, gestionada desde Ajustes. Arranca solo con el propietario. Un correo que no esté en la lista ve "No autorizado". |
| FR-38 | Solo un móvil que ya validó el código puede **subir fotos**, y con un tope diario por dispositivo. Nadie ajeno puede consumir el espacio de almacenamiento. |

---

## 3. Las seis operaciones

| ID | Requisito |
|---|---|
| FR-40 | Un voluntario puede proponer seis operaciones: **alta nueva**, **revisión** ("sigue igual"), **actualizar estado**, **corregir datos**, **corregir ubicación** y **proponer retirada**. |
| FR-41 | **Alta nueva:** un punto que no estaba en el mapa. Requiere ubicación, tipo, diámetro, estado, tipo de enganche (si boca de riego), foto de la conexión, foto del sitio y, si procede, descripción del fallo. Necesita aprobación. |
| FR-42 | **Revisión:** "he estado allí y sigue igual". No cambia ningún dato; solo actualiza la fecha de última revisión. Requiere foto. Jefatura puede aprobarla **en bloque**, sin revisar una por una. |
| FR-43 | **Actualizar estado:** el caudal ha cambiado, o el punto ha dejado de funcionar (o vuelve a funcionar). Requiere foto y, si el estado es "no funciona", la descripción del fallo. Necesita aprobación. |
| FR-44 | **Corregir datos:** diámetro, tipo de enganche o descripción mal introducidos; el tipo no (FR-11). No refleja un cambio en la realidad sino un error de registro. Necesita aprobación. |
| FR-45 | **Corregir ubicación:** el pin está desplazado. El voluntario lo arrastra al sitio correcto; el sistema conserva la posición anterior y calcula el desplazamiento. Lleva foto de la conexión y foto del sitio, que sustituye a la que hubiera (DEC-146). Necesita aprobación. |
| FR-46 | **Proponer retirada:** el punto ya no existe (obras, asfaltado, sustitución). Requiere motivo (uno rápido: obras, asfaltado, sustituido, otro; más texto libre) y foto del sitio. Solo jefatura puede confirmarla; hasta entonces el punto sigue visible. |
| FR-47 | Toda propuesta pendiente queda **fuera del mapa general**: solo la ve jefatura en su cola, y el propio autor en "Mis propuestas". |
| FR-48 | Un voluntario puede **retirar una propuesta suya** mientras siga pendiente. No puede borrar nada, ni siquiera sus altas ya aprobadas. |
| FR-49 | Cada envío lleva una marca de idempotencia propia: un reintento (por ejemplo, tras recuperar cobertura) **nunca crea una segunda propuesta**. |

---

## 4. Ubicación, duplicados y zona de cobertura

| ID | Requisito |
|---|---|
| FR-50 | El voluntario puede **tocar el mapa para colocar el punto**; no depende solo del GPS. La aplicación muestra la posición GPS con su margen de error y un pin arrastrable. Además, **mantener pulsado el mapa** (clic derecho en ordenador) abre *¿Qué hay aquí?* (FR-72), cuya acción *Añadir un punto aquí* empieza un alta con el pin en ese sitio a un toque; sobre un marcador existente no, que ahí lo que toca es abrir la ficha. Sustituye en parte a DEC-077 (DEC-089). |
| FR-51 | **Duplicados:** al recibir un alta, el sistema busca el punto activo más cercano **del mismo tipo**. Si está a menos del radio configurado (25 m por defecto), la propuesta llega a jefatura marcada como posible duplicado, con ambos puntos en un minimapa, una comparación campo a campo con el existente, y la acción de **fusionar** con él en vez de crear otro. |
| FR-52 | El voluntario **no recibe ningún aviso de duplicado** en la calle. Lo resuelve quien ve los dos registros: jefatura. |
| FR-53 | La **zona de cobertura** es el término municipal de Albolote (Albolote, Cortijo del Aire, El Chaparral, Parque del Cubillas, Pretel, urbanizaciones consolidadas y diseminado) más Calicasas, con un margen de unos 400 m. Se genera de forma automática a partir de datos públicos (OpenStreetMap, límites administrativos); nadie descarga ni mantiene archivos a mano. |
| FR-54 | El mapa se abre encuadrado sobre la zona y dibuja su límite como línea discontinua tenue. |
| FR-55 | Si un punto cae **fuera de la zona**, la aplicación avisa ("esto queda fuera de la zona habitual, ¿seguro?") pero **permite continuar**. El punto se guarda como "fuera de zona" y jefatura lo ve señalado en la cola. |

---

## 5. Mapa, lista, ficha y búsqueda

| ID | Requisito |
|---|---|
| FR-60 | El mapa muestra todos los puntos **activos y aprobados**. La forma distingue el tipo (círculo = hidrante, cuadrado = boca de riego), el color el estado (colores de seguridad RAL: bueno verde, regular amarillo, malo rojo; DEC-154, que sustituye a DEC-076), y el tamaño lo aprovechable que es el punto (diámetro × caudal). La especificación exacta está en 06. |
| FR-61 | Los puntos sin revisar en más de 12 meses (configurable) se distinguen visualmente (un anillo de rayas alrededor del marcador, cuyo borde sigue continuo; DEC-155) manteniendo tamaño y color. Los que no funcionan caen al tamaño mínimo y van atenuados y tachados; los de "barro", al tamaño mínimo y tachados, con su color (DEC-145). |
| FR-62 | El mapa tiene una **leyenda** visible que explica forma, color, tamaño, tachado y anillo de rayas (sin revisar). |
| FR-63 | Capas disponibles: **mapa base propio** (por defecto, funciona sin cobertura), **calle** (OpenStreetMap, en línea), **satélite** (PNOA del IGN, en línea) y **Catastro** (superpuesta, en línea). Todas gratuitas y sin clave de API. El selector recuerda la última capa elegida. Sin cobertura, las capas en línea aparecen en gris con el motivo. Si la capa elegida es en línea y el mapa base está en el móvil, se pinta debajo el mapa base propio y se avisa; la elección no cambia (v1.4, DEC-098). |
| FR-64 | Al alejar el zoom, los puntos desaparecen por orden inverso de tamaño: la vista general muestra siempre lo más aprovechable. No se agrupan marcadores en racimos. |
| FR-65 | Hay un botón para **centrar el mapa en la posición del usuario**, y se muestra la posición con su halo de precisión. |
| FR-66 | La **ficha** de un punto muestra: código, tipo, diámetro, estado, tipo de enganche (si boca de riego), foto de la conexión y, si la hay, la del sitio, dirección, distancia hasta el usuario, descripción, fecha de última revisión y la antigüedad de los datos que se están viendo. **No muestra** el historial de cambios ni los nombres de quien lo editó: eso es solo del panel. El estado va arriba, en una banda de su color con la fecha de la última revisión, y *Cómo llegar* es la única acción principal (DEC-156). |
| FR-67 | Desde la ficha se accede a **"Proponer un cambio"** con las cinco operaciones sobre un punto existente. |
| FR-68 | La pestaña **Lista** muestra los mismos puntos ordenados por distancia (por defecto), código o estado, con filtros rápidos: todos, hidrantes, bocas de riego, no utilizable ("no funciona" y "barro", DEC-145), sin revisar. Cada fila muestra marcador, código y diámetro, estado y última revisión, y a la derecha la distancia, solo si hay posición. La dirección no va en la fila, solo en la ficha, pero la búsqueda la sigue usando (FR-69). Con la revisión caducada, la fila dice «sin revisar desde hace N» en el naranja de aviso. |
| FR-69 | Hay **búsqueda** por código, dirección y descripción, tanto en el mapa como en la lista, y funciona sin cobertura sobre los datos guardados en el móvil. Elegir un resultado centra el mapa y abre la ficha. La búsqueda encuentra también calles, lugares, direcciones con número y coordenadas (FR-73). |
| FR-70 | A partir del ancho de tableta, mapa y ficha se ven a la vez; en ordenador aparece además una lista lateral filtrable y la ficha se abre como panel flotante sin tapar el plano. |
| FR-71 | La aplicación tiene **modo oscuro**, activado por la preferencia del móvil y conmutable a mano. Es operativo: en un servicio de noche, una pantalla blanca arruina la visión adaptada a la oscuridad. |
| FR-72 | **"¿Qué hay aquí?"** Al mantener pulsado el mapa (o clic derecho), se abre una hoja con las coordenadas del sitio en dos sistemas, cada una con su nombre y su botón de copiar: **WGS84 · grados decimales** (6 decimales) y **ETRS89 · UTM huso 30N** (EPSG:25830, a metro; DEC-157), y cuatro acciones: primero *Añadir un punto aquí*, la principal, y después *Cercanos desde aquí*, *Medir desde aquí* y *Compartir esta ubicación*. La calle más cercana, si se conoce, no se enseña en la hoja: va en el texto de *Compartir*. Funciona sin cobertura. |
| FR-73 | **Búsqueda de calles, lugares, direcciones y coordenadas.** La búsqueda encuentra, además de puntos, calles y lugares con nombre de Albolote y Calicasas **sin cobertura**, y con cobertura también el número de portal. Acepta coordenadas en decimal, grados-minutos-segundos y UTM, y enlaces de Google Maps o Apple Plans que las contengan. Elegir un resultado centra el mapa y ofrece *Cercanos desde aquí*. Los resultados de calles citan su fuente. |
| FR-74 | **Modo incidente: los más cercanos que funcionan.** Desde un botón del mapa (con la posición del GPS), desde FR-72 o desde un resultado de FR-73, la aplicación marca un punto de incidente y lista los cinco puntos activos más cercanos cuyo estado es *bueno* o *regular*. Cada fila da código, diámetro y estado, distancia en línea recta y rumbo, con *Cómo llegar*. Tocar la fila abre la ficha. Si la posición es vieja o poco precisa, el subtítulo lo dice (DEC-165). Un conmutador limita a hidrantes. Funciona sin cobertura, el incidente no sale del móvil, y *atrás* lo cierra. |
| FR-75 | **Compartir y coordenadas.** La ficha, FR-72 y FR-74 permiten compartir con el menú del móvil (o copiar, donde no lo haya) un texto con código, tipo, diámetro y estado si es un punto, dirección, las coordenadas en una línea por sistema con el nombre delante («WGS84 · grados decimales: …» y «ETRS89 · UTM huso 30N: 30S …»; fuera del huso 30, solo la de WGS84), y un enlace de Google Maps a esas coordenadas. La S de «30S» es la banda de latitud de MGRS, no «sur» (06, Apéndice A). La ficha enseña las coordenadas en los dos sistemas, con botón de copiar (DEC-157). Nunca se incluyen nombres (FR-27). |
| FR-76 | **Medir distancia.** Una herramienta de medición sobre el mapa suma tramos entre los puntos que se tocan (y se imanta a los marcadores cercanos), y enseña la distancia total y el número de tramos de manguera que hacen falta según FR-142. Deshacer el último punto, borrar y terminar. Funciona sin cobertura. |

---

## 6. Funcionamiento sin cobertura

| ID | Requisito |
|---|---|
| FR-80 | **Consultar siempre funciona.** Los puntos aprobados se guardan en el móvil; mapa base (una vez descargado), búsqueda, lista y fichas están disponibles sin señal, con la fecha de la última sincronización a la vista. |
| FR-81 | El **mapa base propio se descarga entero** al móvil la primera vez que hay wifi, o cuando se pide desde Ajustes. Ajustes muestra si está descargado y de qué versión. Si falta, el mapa lo avisa al arrancar en vez de quedarse en blanco. Cuando hay una versión nueva del mapa base, la aplicación ofrece descargarla. |
| FR-82 | **Dar de alta y proponer cambios también funciona sin cobertura.** La propuesta **y su foto** quedan en una cola dentro del móvil y se envían solas al recuperar señal. La aplicación muestra siempre cuántos envíos quedan pendientes. |
| FR-83 | Si un envío lleva más de 24 horas en la cola, la aplicación lo advierte en lugar de dejarlo en silencio. |
| FR-84 | Nada se pierde ni se duplica al reintentar (FR-49). |

---

## 7. El voluntario sabe en qué quedó lo suyo

| ID | Requisito |
|---|---|
| FR-90 | Al abrir la aplicación, si alguna propuesta propia se aprobó o rechazó desde la última visita, se muestra un aviso con el resultado y, si fue rechazada, el **motivo**. |
| FR-91 | **Mis propuestas** lista las propuestas de ese móvil con su estado, **una línea con lo que se propuso** (por ejemplo «Regular → No funciona», «Hidrante 100 mm» en un alta, «Sigue igual» en una revisión, «Retirada: Obras»; el valor de antes solo mientras está pendiente o sin enviar), el motivo de rechazo, las correcciones que hizo jefatura al aprobar, y lo que aún está sin enviar. Nada más: sin fecha de resolución ni código asignado (DEC-192). Desde ahí se retira una propuesta pendiente (FR-48). |
| FR-92 | *Retirado (DEC-167, `docs/29`).* ~~Existe en Ajustes la opción "Algo no funciona en la aplicación", distinta de proponer cambios en un punto. Envía una descripción libre con la versión y la pantalla; lo recibe jefatura en su panel con estado abierta / resuelta.~~ |
| FR-93 | Ajustes del voluntario muestra: nombre, acceso a Mis propuestas, estado del mapa sin cobertura, estado de la sincronización, capa por defecto, modo oscuro, ayuda (pantallas de primer uso), aviso legal, cerrar sesión, y aviso de versión nueva. |
| FR-94 | Al primer uso se muestran tres pantallas breves de orientación (qué es un punto y cómo se lee el mapa, cómo se añade, que todo pasa por revisión de jefatura), saltables y recuperables desde Ajustes. La segunda define en una línea cada estado que no se explica en el formulario (Malo y No funciona, FR-18). |

---

## 8. Panel de jefatura: cola de revisión

| ID | Requisito |
|---|---|
| FR-100 | El panel es una parte de la misma aplicación, accesible solo con cuenta de Google autorizada (FR-36, FR-37), pensado para ordenador y usable en tableta. |
| FR-101 | La **cola de revisión** lista las propuestas pendientes, etiquetadas por operación (alta, revisión, estado, datos, ubicación, retirada), con autor, antigüedad, dirección y núcleo; y permite **filtrar por operación**. |
| FR-102 | Cada propuesta muestra **todos los datos del punto**, no solo los que cambian: código, tipo, diámetro, estado, tipo de enganche (bocas), descripción, fallo (si no funciona), dirección, núcleo, coordenadas WGS84 y ETRS89 · UTM huso 30N, última revisión, origen de la ubicación y quién lo propuso. Lo que cambia va **primero y marcado**, con el antes y el después campo a campo; en un alta se marcan los datos que puso el voluntario. Las fotos van lado a lado: si el punto ya existe y trae fotos nuevas, la foto actual del punto va delante para comparar; si no trae nuevas, se ven las actuales y se dice (DEC-158). Sin eso, aprobar obliga a abrir la ficha original y comparar a ojo. |
| FR-103 | **Cada propuesta, en las seis operaciones**, muestra un **mapa** a todo el ancho del detalle con el punto y los puntos aprobados alrededor; en un alta, el pin propuesto y el radio de duplicado; en una corrección de ubicación, la posición de ahora y la propuesta con los metros entre las dos. Se puede pasar a Satélite (las ubicaciones se abren en Satélite) y abrir en grande (DEC-158). |
| FR-104 | El detalle de cada propuesta enseña el origen de la ubicación y su precisión, la última revisión, las fotos, el núcleo o *fuera de zona*, el posible duplicado, el diámetro *otra medida* pendiente y si el punto cambió después de la propuesta. La lista de la cola marca con ⚠ las propuestas desactualizadas, con duplicado, fuera de zona o con un diámetro por fijar (DEC-166). |
| FR-105 | Al abrir una propuesta con ubicación nueva o corregida, el panel muestra la **dirección deducida** en un campo editable (FR-15). Lo que quede escrito es lo que se guarda al aprobar. La dirección es un campo más de *Datos del punto* (FR-102). |
| FR-106 | Acciones sobre una propuesta: **Aprobar**, **Aprobar con correcciones** (corregir uno o varios valores y aprobar en un solo paso, sin devolverla al voluntario), **Rechazar** con motivo obligatorio (queda en el registro y lo ve el autor; el campo recuerda a jefatura que no mencione a otros voluntarios, FR-27), y **Fusionar con el punto existente** si es posible duplicado (FR-51), eligiendo qué valor prevalece en cada campo que difiere. |
| FR-107 | **Aprobación en bloque:** seleccionar varias propuestas (típicamente revisiones) y aprobarlas de una vez. Si alguna no puede aprobarse (desactualizada, punto borrado), se aprueban las demás y se indica cuál quedó fuera y por qué. |
| FR-108 | **Propuesta desactualizada:** si el punto cambió después de enviarse la propuesta, el panel lo avisa y exige una confirmación expresa antes de aprobar, porque el diff se calculó sobre un estado que ya no existe. |
| FR-109 | **Historial de propuestas:** las aprobadas y rechazadas no desaparecen; la misma pantalla las muestra con filtro de estado (pendientes / aprobadas / rechazadas), en solo lectura, con quién decidió, cuándo, el motivo o las correcciones. |
| FR-110 | La cola indica cuántas propuestas hay pendientes en todo momento. |

---

## 9. Panel de jefatura: inventario, caducadas, registro, papelera

| ID | Requisito |
|---|---|
| FR-120 | **Inventario** completo de puntos en tabla y en mapa, con filtros por tipo y estado (DEC-168); columnas ordenables, también núcleo, diámetro y última revisión; paginado; dirección editable en la propia celda; y acciones editar, retirar, borrar (a papelera) e historial del punto. La edición es un panel lateral con el mapa y los controles del alta, con los cambios marcados, donde jefatura también puede mover el punto sin pasar por la cola; queda en el registro (DEC-169). |
| FR-121 | *Retirado (DEC-167, `docs/29`).* ~~Revisiones caducadas: listado de puntos con más de 12 meses (configurable) sin revisar, agrupado por núcleo, para repartir trabajo de campo.~~ |
| FR-122 | *Retirado (DEC-167, `docs/29`).* ~~Hoja de campo imprimible: una hoja por núcleo con código, dirección (o coordenadas si no hay dirección), tipo, diámetro, último estado conocido y una casilla en blanco para anotar la revisión.~~ |
| FR-123 | **Registro de auditoría:** quién, cuándo, qué cambió y quién lo aprobó, para cualquier punto y sin límite de antigüedad; filtrable por tipo de acción. Solo visible en el panel. Las entradas del registro no se pueden modificar ni borrar. |
| FR-124 | **Retirar** un punto (existió y ya no está): desaparece del mapa operativo y se conserva en el histórico. **Borrar** (el registro nunca debió existir): va a la **papelera**, recuperable durante 30 días (configurable); después se purga automáticamente. Ambas acciones son exclusivas de jefatura. |
| FR-125 | Las revisiones caducadas no generan correos automáticos: se consultan en el panel cuando toca. |

---

## 10. Panel de jefatura: voluntarios e incidencias

| ID | Requisito |
|---|---|
| FR-130 | *Retirado (DEC-167, `docs/29`).* ~~Actividad de voluntarios: quién ha aportado cuánto en los últimos 3 y 12 meses, con propuestas, aprobadas, rechazadas, tasa de aprobación y última actividad. Sirve para agradecer y para detectar a quien necesita que le expliquen mejor el formulario. No es un ranking público; vive solo en el panel.~~ |
| FR-131 | La anonimización la hace el desarrollador con `npm run anonimizar` (11), sin pasar por el panel (DEC-167). Se puede **anonimizar** a un voluntario que ejerza su derecho de supresión, identificándolo por su dispositivo (no por nombre, porque los nombres se repiten). Sus filas se conservan con el autor sustituido por "voluntario dado de baja" (detalle en 11). |
| FR-132 | *Retirado (DEC-167, `docs/29`).* ~~Incidencias de la aplicación: lista de lo recibido por "Algo no funciona" (FR-92) con fecha, versión, pantalla, descripción y estado; acción "marcar resuelta".~~ |

---

## 11. Panel de jefatura: ajustes y salud

| ID | Requisito |
|---|---|
| FR-140 | **Código de acceso:** ver el actual, generar uno nuevo con o sin revocar dispositivos (FR-34), con confirmación previa que explique qué pasará con los móviles registrados (y, si se revocan, que la entrada se abrirá 24 horas), y fecha y autor del último cambio. Debajo, la **entrada** (FR-34): cerrada, con el botón para abrirla 24 horas; abierta, con hasta cuándo y el botón para cerrarla ya. Abrir y cerrar quedan en el Registro. |
| FR-141 | **Administradores:** añadir un correo (con los de la app de uniformidad como sugerencia), activar y desactivar. No se puede desactivar al último administrador activo. |
| FR-142 | **Parámetros** modificables sin desplegar código: meses entre revisiones, radio de duplicado, días de papelera, margen de la zona, los cinco radios de marcador, el tope diario de subidas de foto, la longitud del tramo de manguera (20 m por defecto, FR-76) y los dos topes de entradas con el código bueno, «Entradas desde una misma wifi al día» y «Entradas por hora, entre todos» (FR-33). Se guardan con un botón explícito y los móviles los aplican en su siguiente sincronización. |
| FR-143 | **Salud del sistema:** propuestas con más de 14 días sin revisar, errores de la aplicación en los últimos 7 días, puntos sin dirección deducida, fecha y resultado del último respaldo, espacio de almacenamiento usado, y fecha de generación de la zona de cobertura y del mapa base. |
| FR-144 | Acción **purgar fotos huérfanas**, con aviso de que se ejecuta fuera de la aplicación y tarda unos minutos, y acción **descargar el inventario** en formato abierto (JSON) para consulta. Esta descarga no es el respaldo (→ 15). |
| FR-145 | **Búsqueda global** en la cabecera del panel: por código, dirección o nombre de quien propuso. |

---

## 12. Jefatura desde el móvil

| ID | Requisito |
|---|---|
| FR-150 | Un administrador con sesión de Google usa **la misma aplicación** que el voluntario en el móvil, con una etiqueta "Jefatura" en la barra. Desde la app, jefatura abre el panel con un toque: la etiqueta "Jefatura" de la barra o "Panel de jefatura" en Ajustes. Dentro de un formulario de operación la etiqueta no lleva al panel, para no perder lo escrito (DEC-164). Al entrar con Google en el móvil se sigue volviendo al mapa. |
| FR-151 | Cualquiera de las seis operaciones hecha por un administrador **se aplica al momento**, sin pasar por la cola, y queda en el registro como acción de administrador. La pantalla lo dice antes de confirmar ("Aplicar ahora" en lugar de "Enviar para revisión"). |

---

## 13. Exportación, avisos y utilidades (P1, dentro de la versión 1)

| ID | Requisito |
|---|---|
| FR-160 | **Exportación** del inventario desde el panel en **Excel (.xlsx)**, **CSV** y **GeoJSON**, con los filtros activos del Inventario, generada en el navegador del administrador. Es el canal para compartir datos con bomberos, ayuntamiento u otros cuerpos sin darles acceso. Cada exportación consta en el registro. |
| FR-161 | **"Cómo llegar"** en la ficha del voluntario: abre la aplicación de mapas del móvil (Google Maps / Apple Plans) con las coordenadas del punto. No se calculan rutas propias. |
| FR-162 | **Código QR** del enlace de la aplicación, generado en Ajustes del panel e imprimible en A4 con el escudo y el texto "Escanea para instalar", para la sede y las reuniones. |
| FR-163 | **Notificaciones push** (web push), **opcionales y desactivadas por defecto**, que el voluntario activa en Ajustes: "tu propuesta se aprobó / se rechazó". En iPhone solo funcionan con la aplicación instalada en la pantalla de inicio; la aplicación lo explica. |
| FR-164 | **Notificaciones push para jefatura**, opcionales: nueva propuesta pendiente (agrupadas: como mucho una por hora) y **resumen semanal** de revisiones caducadas y pendientes antiguas. Sustituyen a los correos automáticos, que quedan fuera (→ 16). |
| FR-165 | **Regenerar la zona de cobertura y el mapa base** desde Ajustes del panel, con aviso de que tarda unos minutos y resultado en Salud del sistema. |
| FR-166 | **Núcleos** gestionables desde Ajustes: renombrar, añadir los que la fuente pública no traiga, ver cuántos puntos tiene cada uno. |
| FR-167 | **Novedades**: al actualizarse la aplicación, Ajustes muestra qué ha cambiado en tres líneas, generado desde el registro de cambios del repositorio: lo último de cada versión, de la más reciente hacia atrás, y cada línea con el número de la versión que la trajo (DEC-142). |
| FR-168 | **Degradación controlada:** si la base de datos o las funciones de servidor no responden, la aplicación sigue mostrando los datos guardados con un aviso claro ("sin conexión con el servidor · datos de hace N min") y encola lo que se envíe; nunca muestra una pantalla en blanco ni un error técnico. El panel muestra un aviso equivalente. |

---

## 14. Fuera de la versión 1

Definido en **16** con el criterio DEC-037. Lista corta: dominio propio; cuentas individuales para
voluntarios; avisos por correo o SMS; aplicación nativa; integración directa con sistemas de otros
cuerpos. Nada de esto impide añadirse después: la exportación, el token de dispositivo y la tabla de
administradores están pensados para ello.

---

## 15. Trazabilidad

| Sección | Origen |
|---|---|
| 0–1 | `requisitos-hidrantes.html` v6.1 §1, §2 y "Ya decidido" |
| 2 | §4 y plan v2.1 "Protección del código de acceso" |
| 3–4 | §3 y §5 |
| 5–6 | §6 y §7 |
| 7 | §3.5, §7.5 |
| 8–11 | §8.1 y §8.2 |
| 12 | §3.6 y principio 10 del plan v2.1 |
| 13 | DEC-037 (17 sep 2026): antes en la Fase 10 diferida del plan |
| A | estructura del skill *product-management:write-spec* |
| Cambio "defecto" → "no funciona" | plan v2.1, revisión 2.1 (16 sep 2026) |
| FR-72 a FR-76, FR-11 (tipo fijo) | `docs/18-cambios-revision-2-y-mapa.md` §0.3 y bloque D (23 sep 2026), DEC-089, DEC-090 |
| FR-20, FR-41, FR-44, FR-60 a FR-62, FR-66, FR-68, FR-72, FR-75, FR-102, FR-103, FR-105 (v1.8) | `docs/25-lista-ficha-cola-y-colores.md` (4 oct 2026), DEC-154 a DEC-158 y DEC-163 |
| FR-150 (v1.9) | `docs/26-acceso-al-panel-desde-el-movil.md` (5 oct 2026), DEC-164 |
| FR-74 (v1.10) | `docs/27-cercanos-simplificado.md` (5 oct 2026), DEC-165 |
| FR-104 (v1.11) | `docs/28-cola-sin-senales-y-pendientes.md` (oct 2026), DEC-166 |
| FR-20, FR-92, FR-120 a FR-122, FR-130 a FR-132, FR-143 (v1.12) | `docs/29-inventario-y-editar.md` (oct 2026), DEC-167 a DEC-170 |
| FR-33, FR-34, FR-91, FR-140, FR-142, FR-143 (v1.13) | `docs/33-mejoras-y-defectos.md` (9 oct 2026), DEC-190 y DEC-192 |
