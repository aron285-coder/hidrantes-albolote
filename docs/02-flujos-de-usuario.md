# 02 · Flujos de usuario — Mapa de hidrantes

| | |
|---|---|
| **Estado** | Congelado. Cambia con conformidad de jefatura y nueva versión. |
| **Versión** | 1.3 — 23 de septiembre de 2026 (FL-06 sin cambio de tipo, DEC-090; FL-03 con "¿Qué hay aquí?" y FL-35 a FL-38, funciones de mapa para emergencias, DEC-089; pendiente de conformidad de jefatura en F9.1, #76). 1.2 — 21 de septiembre de 2026 (atajo de alta con pulsación larga en FL-03, DEC-077). v1.1 — 17 de septiembre de 2026 (añade FL-13 y FL-32–34 para FR-160–168) |
| **Propietario de** | el **orden de los pasos** de cada tarea. Las reglas están en 01 y aquí solo se citan (`FR-nn`). Las pantallas están en 07 y 08. |

Cada flujo tiene actor, condición de partida, pasos numerados con el requisito que aplica, resultado
y variantes. Los nombres de pantalla y botón son los de 07 y 08.

---

## Voluntario

### FL-01 · Primer uso en un móvil

**Actor:** voluntario. **Parte de:** la aplicación se abre por primera vez en este móvil.

1. Abre la URL (recibida por el canal habitual del grupo) o el acceso directo instalado. → pantalla *Entrada*.
2. Teclea el **código de acceso** de 6 dígitos y su **nombre y apellido**. (FR-30, FR-32)
3. Pulsa *Entrar*. El móvil recibe su credencial y el código no se vuelve a pedir. (FR-31)
4. Ve tres pantallas de orientación, saltables: cómo se lee el mapa, cómo se añade un punto, que todo pasa por jefatura. (FR-94)
5. Si el móvil tiene wifi, la aplicación descarga en segundo plano el mapa base para uso sin cobertura y los puntos aprobados. (FR-80, FR-81)
6. Llega al *Mapa*.

**Resultado:** el móvil está registrado, con nombre, puntos y mapa base guardados.

**Variantes**
- Código erróneo: mensaje "código incorrecto" sin más pistas. Tras demasiados intentos: "espera una hora". (FR-33)
- Sin wifi: el mapa base no se descarga aún; *Ajustes* muestra "no descargado" y el mapa lo avisa. (FR-81)
- Es jefatura: pulsa "¿Eres de jefatura? Entrar con Google" → FL-20.

---

### FL-02 · Consultar un punto

**Actor:** voluntario. **Parte de:** *Mapa* o *Lista*, con o sin cobertura.

1. Localiza el punto: acercando el mapa, con *centrar en mi posición* (FR-65), desde la *Lista* ordenada por distancia (FR-68), o con la *búsqueda* por código, calle o descripción (FR-69).
2. Toca el marcador o la fila. → *Ficha*. (FR-66)
3. Lee estado, diámetro, racor, foto, dirección, distancia y fecha de la última revisión. La ficha indica de cuándo son los datos si no hay cobertura. (FR-80)
4. Opcionalmente pulsa *Proponer un cambio* → FL-04 a FL-08.

**Resultado:** el voluntario sabe dónde está, cómo está y cuándo se comprobó. (FR-02)

**Variantes**
- Sin cobertura: todo igual sobre los datos guardados; las capas en línea aparecen en gris. (FR-63, FR-80)
- Mapa base no descargado y sin cobertura: el mapa muestra los puntos sobre fondo vacío con el aviso "mapa base no descargado". (FR-81)

---

### FL-03 · Alta de un punto nuevo

**Actor:** voluntario, junto al punto. **Parte de:** *Mapa*, botón **+** o pulsación larga sobre el mapa.

1. Pulsa **+**. → *Nuevo punto*. El mapa muestra la posición GPS con su margen de error y un pin naranja arrastrable. (FR-50)
   - Atajo: **mantener pulsado** un sitio del mapa (clic derecho en ordenador) abre *¿Qué hay aquí?* (FR-72); su acción *Añadir un punto aquí* abre *Nuevo punto* con el pin ya puesto ahí, sin pasar por el GPS. Sobre un marcador no hace nada: ahí manda la ficha. (FR-50, DEC-077, DEC-089)
2. Ajusta el pin si el GPS no acierta. El sistema guardará origen, precisión y distancia. (FR-13)
3. Si el pin queda fuera de la zona: aviso "esto queda fuera de la zona habitual, ¿seguro?". Puede continuar. (FR-55)
4. Elige el **tipo**. (FR-11)
   - Hidrante: elige **diámetro de la salida mayor** 70 / 100 / otra medida. (FR-16, FR-17)
   - Boca de riego: el diámetro no se pregunta (45 mm); elige el **racor** comparando con las fotos de referencia. (FR-16, FR-20)
5. Elige **caudal / estado**. Si es *no funciona*, aparece la **descripción del fallo**, obligatoria. (FR-18, FR-19)
6. Hace la **foto** con la cámara. Hasta que hay foto, el botón de envío está deshabilitado y dice por qué. (FR-21)
7. Añade **descripción** si quiere. (FR-22)
8. Pulsa *Enviar para revisión*. El autor y la posición del móvil van solos. (FR-23)

**Resultado:** una propuesta *pendiente* en la cola de jefatura, invisible en el mapa general. (FR-47)

**Variantes**
- Sin cobertura: la barra superior lo indica; el botón dice *Guardar · se enviará con cobertura*; propuesta y foto quedan en la cola del móvil y se envían solas. (FR-82)
- El punto está a menos de 25 m de otro del mismo tipo: el voluntario no ve nada; jefatura lo verá como posible duplicado. (FR-51, FR-52)
- Es administrador: el botón dice *Aplicar ahora* y el punto entra en el mapa al momento. (FR-151)

---

### FL-04 · Revisión: "sigue igual"

**Actor:** voluntario, junto al punto. **Parte de:** *Ficha* → *Proponer un cambio*.

1. Pulsa *Sigue igual*. (FR-42)
2. Hace la foto de hoy. (FR-21)
3. Pulsa *Enviar para revisión*.

**Resultado:** propuesta de revisión pendiente. Al aprobarse, solo cambia la fecha de última revisión. (FR-24)

Es la operación que da sentido al ciclo de 12 meses y la que jefatura aprueba en bloque (FL-22).

---

### FL-05 · Actualizar estado

**Actor:** voluntario. **Parte de:** *Ficha* → *Proponer un cambio* → *Actualizar estado*.

1. La pantalla recuerda el estado actual y la última revisión.
2. Elige el **estado de ahora**. Si es *no funciona*, describe el fallo. (FR-18, FR-19)
3. Hace la foto de hoy. (FR-21)
4. Nota opcional.
5. Pulsa *Enviar para revisión*. (FR-43)

**Resultado:** propuesta pendiente con el diff estado anterior → nuevo.

---

### FL-06 · Corregir datos

**Actor:** voluntario. **Parte de:** *Ficha* → *Proponer un cambio* → *Corregir datos*.

1. Cambia diámetro, racor o descripción. Las reglas de FR-16 y FR-20 aplican igual que en el alta.
   El tipo se ve pero no se cambia (FR-11): si está mal, el enlace *Proponer retirada* lleva a FL-08 de
   ese punto, y después se da de alta el correcto (FL-03).
2. Foto de hoy y nota opcional.
3. *Enviar para revisión*. (FR-44)

**Resultado:** propuesta pendiente con el diff de los campos cambiados.

---

### FL-07 · Corregir ubicación

**Actor:** voluntario, junto al punto. **Parte de:** *Ficha* → *Proponer un cambio* → *Corregir ubicación*.

1. El mapa muestra la posición actual como círculo gris y el pin naranja encima.
2. Arrastra el pin al sitio real. La pantalla muestra el desplazamiento en metros y la distancia del pin al GPS del móvil. (FR-45, FR-13)
3. Foto de hoy y nota opcional.
4. *Enviar para revisión*.

**Resultado:** propuesta pendiente con posición anterior, nueva y desplazamiento. Jefatura verá ambas.

---

### FL-08 · Proponer retirada

**Actor:** voluntario. **Parte de:** *Ficha* → *Proponer un cambio* → *Proponer retirada*.

1. Elige un motivo rápido (obras, asfaltado, sustituido, otro) y lo explica brevemente. (FR-46)
2. Hace una foto del sitio tal como está.
3. La pantalla recuerda que solo jefatura confirma la retirada y que el punto sigue en el mapa hasta entonces.
4. Pulsa *Enviar propuesta de retirada*.

**Resultado:** propuesta pendiente. Al confirmarla, el punto pasa a *retirado* y desaparece del mapa operativo, conservando el histórico. (FR-25, FR-124)

---

### FL-09 · Trabajar sin cobertura y sincronizar

**Actor:** voluntario. **Parte de:** cualquier pantalla, sin señal.

1. La aplicación marca "sin cobertura"; consultar, buscar y proponer siguen funcionando. (FR-80, FR-82)
2. Cada propuesta guardada suma uno al contador "pendientes de enviar" del mapa.
3. Al recuperar señal, la aplicación envía la cola sola: primero sube cada foto, luego la propuesta. Un reintento nunca duplica. (FR-49, FR-84)
4. Si algo lleva más de 24 h sin salir, *Mis propuestas* y el mapa lo advierten. (FR-83)

**Resultado:** todo lo hecho en la calle llega a jefatura sin que el voluntario haga nada.

---

### FL-10 · Ver en qué quedaron mis propuestas

**Actor:** voluntario. **Parte de:** abrir la aplicación, o *Ajustes* → *Mis propuestas*.

1. Si hay novedades desde la última visita, un aviso las resume al abrir (aprobadas, rechazadas con motivo). (FR-90)
2. *Mis propuestas* lista cada envío con estado, motivo de rechazo, correcciones de jefatura y lo que sigue sin enviar. (FR-91)
3. Sobre una propuesta pendiente puede pulsar *Retirar*. (FR-48)

**Resultado:** el voluntario cierra el círculo sin preguntar a nadie.

---

### FL-11 · Avisar de que algo no funciona en la aplicación

**Actor:** voluntario. **Parte de:** *Ajustes* → *Algo no funciona en la aplicación*.

1. Describe el problema en texto libre. La versión y la pantalla van solas. (FR-92)
2. Pulsa *Avisar a jefatura*.

**Resultado:** una incidencia *abierta* en la pestaña *Voluntarios* del panel (FL-27).

---

### FL-12 · Ajustes del voluntario

**Actor:** voluntario. **Parte de:** pestaña *Ajustes*. (FR-93)

- **Cambiar nombre:** si el móvil pasa a otra persona. (FR-32)
- **Mapa sin cobertura:** ver estado, descargar o actualizar a la versión nueva. (FR-81)
- **Sincronizar ahora:** forzar la actualización de puntos.
- **Capa por defecto**, **modo oscuro**. (FR-63, FR-71)
- **Cómo se usa:** volver a ver las tres pantallas de orientación. (FR-94)
- **Cerrar sesión en este móvil:** borra credencial, nombre y la cola pendiente, avisando antes.
- **Versión nueva disponible → recargar.**

---

### FL-13 · Activar notificaciones y "cómo llegar"

**Actor:** voluntario. (FR-161, FR-163)

1. *Ficha* → *Cómo llegar*: se abre la aplicación de mapas del móvil con el punto. La app no calcula rutas.
2. *Ajustes* → *Avisarme cuando jefatura resuelva mis propuestas*: la app explica qué recibirá y, en iPhone, que hace falta tenerla instalada; después pide el permiso del sistema.
3. Al aprobarse o rechazarse algo suyo, llega la notificación; al tocarla se abre *Mis propuestas*. Sin permiso, el aviso al abrir la app (FL-10) sigue funcionando igual.

---

## Jefatura

### FL-20 · Entrar como jefatura

**Actor:** administrador. **Parte de:** *Entrada* → "¿Eres de jefatura? Entrar con Google", o la URL del panel.

1. Inicia sesión con su cuenta de Google. (FR-36)
2. Si su correo está en la lista de administradores y activo, entra; si no, ve "No autorizado". (FR-37)
3. En el móvil, ve el mapa con la etiqueta *Jefatura* (FL-28). En el ordenador, el *Panel*.

---

### FL-21 · Revisar una propuesta

**Actor:** administrador. **Parte de:** *Panel* → *Cola de revisión*.

1. Elige una propuesta de la lista, filtrando por operación si quiere. (FR-101)
2. Lee el detalle: minimapa (FR-103), dirección deducida en campo editable (FR-105), diff campo a campo (FR-102), señales de fiabilidad (FR-104) y foto.
3. Decide:
   - **Aprobar.** (FR-106)
   - **Aprobar con correcciones:** edita los valores que haga falta en el formulario que se despliega y pulsa *Guardar y aprobar*. Si el diámetro venía como "otra medida", debe fijar 70 o 100 antes. (FR-17, FR-106)
   - **Rechazar…:** escribe el motivo, obligatorio, y confirma. (FR-106)
   - **Fusionar con el punto existente** (solo si está marcada como posible duplicado): compara las dos columnas, elige por campo qué prevalece y confirma. No se crea un punto nuevo; el existente queda revisado hoy. (FR-51, FR-106)
4. Si la propuesta está **desactualizada** (el punto cambió después), el botón normal se sustituye por *Confirmar y aprobar* y el panel lo explica. (FR-108)

**Resultado:** el punto se crea o actualiza (con fecha de revisión y dirección), la propuesta pasa al historial, el registro guarda antes y después, y el autor lo verá en su móvil. (FR-24, FR-109, FR-123, FR-90)

---

### FL-22 · Aprobar en bloque

**Actor:** administrador. **Parte de:** *Cola de revisión*, típicamente filtrada por *revisiones*.

1. Marca las casillas de las propuestas (o *todas*).
2. Pulsa *Aprobar seleccionadas*. (FR-107)
3. El panel informa cuántas se aprobaron y cuál quedó fuera, si alguna, y por qué (desactualizada, punto borrado).

**Resultado:** cada propuesta aprobada con su propia entrada en el registro; las omitidas siguen pendientes para revisarlas una a una.

---

### FL-23 · Consultar el historial de propuestas

**Actor:** administrador. **Parte de:** *Cola de revisión*.

1. Cambia el filtro *Pendientes* por *Aprobadas* o *Rechazadas*. (FR-109)
2. Abre una propuesta: se ve en solo lectura quién decidió, cuándo, el motivo o las correcciones.

Responde a "¿por qué se rechazó aquello?" sin rebuscar en el registro.

---

### FL-24 · Inventario: editar, retirar, borrar, restaurar

**Actor:** administrador. **Parte de:** *Panel* → *Inventario*. (FR-120)

1. Filtra (tipo, estado, núcleo, diámetro, sin revisar) y ordena por columna; busca por código o calle con la búsqueda global. (FR-145)
2. Sobre un punto:
   - **Editar:** corrige un valor; se aplica al momento y queda en el registro como acción de administrador. (FR-151)
   - **Dirección:** se edita en la propia celda. (FR-15)
   - **Retirar:** el punto existió y ya no está; pide motivo. (FR-124)
   - **Borrar:** el registro nunca debió existir; pide motivo y va a la papelera. (FR-124)
   - **Historial:** todo lo que pasó con ese punto. (FR-123)
3. Para deshacer un borrado: *Panel* → *Papelera* → *Restaurar*, dentro de los 30 días. (FR-124)

---

### FL-25 · Repartir revisiones caducadas

**Actor:** administrador. **Parte de:** *Panel* → *Revisiones caducadas*.

1. Ve los puntos con más de 12 meses sin revisar, agrupados por núcleo. (FR-121)
2. Despliega un núcleo para ver la lista.
3. Pulsa *Hoja de campo por núcleo* para imprimir una hoja por núcleo con casilla en blanco, para quien salga sin móvil. (FR-122)
4. Reparte el trabajo por el canal habitual del grupo. No hay correos automáticos. (FR-125)

---

### FL-26 · Consultar el registro

**Actor:** administrador. **Parte de:** *Panel* → *Registro*.

1. Filtra por tipo de acción (aprobación, rechazo, alta, retirada, configuración…). (FR-123)
2. Lee momento, actor, acción, punto y detalle. No se puede editar ni borrar nada.

---

### FL-27 · Voluntarios e incidencias

**Actor:** administrador. **Parte de:** *Panel* → *Voluntarios*.

1. Elige el periodo (3 o 12 meses) y ve la actividad por voluntario. (FR-130)
2. Sobre un voluntario que ha pedido darse de baja: *Anonimizar…* → confirma. (FR-131; procedimiento en 11)
3. En *Incidencias de la aplicación*, lee cada aviso y pulsa *Marcar resuelta* cuando esté atendido. (FR-132)

---

### FL-28 · Operar desde el móvil como jefatura

**Actor:** administrador con sesión de Google en el móvil. **Parte de:** *Mapa*. (FR-150)

1. Todo es igual que para un voluntario (FL-02 a FL-08), con la etiqueta *Jefatura* en la barra.
2. En cualquier operación, la pantalla dice que el cambio se aplicará al momento y el botón es *Aplicar ahora*. (FR-151)

**Resultado:** el punto cambia en el mapa de todos sin pasar por la cola; el registro lo anota como acción de administrador.

---

### FL-29 · Cambiar el código de acceso

**Actor:** administrador. **Parte de:** *Panel* → *Ajustes* → *Código de acceso*.

1. Decide si marca **Revocar todos los dispositivos** (sospecha de filtración) o no (solo cerrar la puerta a accesos nuevos). (FR-34)
2. Pulsa *Generar uno nuevo* y confirma en el aviso, que explica qué pasará con los móviles registrados. (FR-140)
3. Comunica el código nuevo al grupo por el canal habitual.

**Resultado:** código nuevo en vigor al instante; el registro anota el cambio; si se revocó, cada móvil pedirá el código al abrir la aplicación (FL-01 sin volver a escribir el nombre).

---

### FL-30 · Añadir o quitar un administrador

**Actor:** administrador. **Parte de:** *Panel* → *Ajustes* → *Acceso de administradores*. (FR-141)

1. Escribe el correo (se sugieren los de la app de uniformidad) y añade.
2. Para retirar acceso, desactiva el interruptor. El último administrador activo no se puede desactivar.

No hace falta desplegar nada ni tocar código.

---

### FL-31 · Ajustar parámetros y consultar la salud

**Actor:** administrador. **Parte de:** *Panel* → *Ajustes*.

1. Cambia meses entre revisiones, radio de duplicado, días de papelera, margen de zona, radios de marcador o tope de subidas, y pulsa *Guardar cambios*. Los móviles lo aplican en su siguiente sincronización. (FR-142)
2. Revisa *Salud del sistema*: pendientes antiguas, incidencias abiertas, errores, puntos sin dirección, último respaldo, almacenamiento, versión de zona y mapa base. (FR-143)
3. Si el almacenamiento crece, lanza *Purgar fotos huérfanas* y espera unos minutos. (FR-144)
4. Para una copia de consulta, *Descargar inventario (JSON)*. (FR-144; el respaldo real está en 15)

---

### FL-32 · Exportar el inventario

**Actor:** administrador. **Parte de:** *Panel* → *Inventario*. (FR-160)

1. Aplica los filtros que quiera (núcleo, tipo, estado…).
2. Pulsa *Exportar* y elige Excel, CSV o GeoJSON. El archivo se genera en su navegador y se descarga.
3. Lo comparte por el canal que corresponda (bomberos, ayuntamiento). La exportación consta en el Registro.

---

### FL-33 · Regenerar zona o mapa base, lanzar un respaldo

**Actor:** administrador. **Parte de:** *Panel* → *Ajustes*. (FR-165)

1. Pulsa *Regenerar zona*, *Regenerar mapa base* o *Respaldo ahora*. El panel avisa de que tarda unos minutos.
2. Al terminar, *Salud del sistema* muestra la fecha nueva; si algo falla, aparece una issue de vigilancia y Salud lo indica.

---

### FL-34 · Notificaciones y novedades para jefatura

**Actor:** administrador. (FR-164, FR-167)

1. *Ajustes* → activar *Nuevas propuestas* y/o *Resumen semanal*. Como mucho una notificación por hora; el resumen llega los lunes con caducadas y pendientes antiguas.
2. Tras cada actualización de la aplicación, *Ajustes* muestra tres líneas de novedades.

---

### FL-35 · Incidente con GPS, sin cobertura

**Actor:** voluntario en una salida, con el móvil y sin cobertura. (FR-74, FR-80, G2)

1. Abre la aplicación. El mapa pinta lo guardado en el móvil y la barra dice "sin cobertura · datos de hace N min". (FR-80, FR-168)
2. Pulsa **Cercanos**, junto a *centrar en mí*. Con la posición del GPS al día, el incidente es esa posición. (FR-74)
3. El mapa marca el incidente con una diana, traza líneas discontinuas a los candidatos y encuadra el incidente y los tres primeros. Se abre la hoja *Cercanos* con, como mucho, los cinco puntos activos más cercanos en estado *bueno* o *regular*. (FR-74)
4. Cada fila da código, tipo y diámetro, estado, distancia en línea recta, rumbo (N, NE…) y tramos de manguera. Si el más cercano de todos no funciona, un aviso lo dice para que nadie vaya a él por costumbre. (FR-74, FR-142)
5. *Solo hidrantes* limita la lista. Tocar una fila abre la ficha sin cerrar el incidente; *Cómo llegar* abre la app de mapas del móvil. (FR-74, FR-161)
6. *Atrás* cierra el modo incidente. (FR-74)

**Variantes**
- La posición no está al día (el GPS dejó de responder): el origen es la última posición, y un aviso dice "posición de hace N min". (FR-74)
- Sin posición: la hoja lo explica ("mantén pulsado el mapa donde está el incidente o busca la calle") y enfoca la búsqueda. Ningún botón se queda sin hacer nada. (FR-74, FR-72, FR-73)
- Ningún punto que funcione a menos de 2 km: estado vacío con *Ver todos en la lista*, ordenada por distancia desde el incidente. (FR-74, FR-68)

---

### FL-36 · Incidente desde una calle buscada

**Actor:** voluntario o jefatura que recibe un aviso con la dirección. (FR-73, FR-72, FR-74)

1. Escribe la calle en la búsqueda del mapa ("calle real", "c/ real", "avda andalucía"). Las calles y lugares salen del callejero guardado en el móvil, sin cobertura, citando "© OpenStreetMap". (FR-73)
2. Elige la calle: el mapa la encuadra y la resalta, y se abre *¿Qué hay aquí?* en el punto de la calle más cercano al centro del mapa. (FR-73, FR-72)
3. Pulsa *Cercanos desde aquí*: el resto es FL-35 desde el paso 3, con el incidente en ese sitio. (FR-74)

**Variantes**
- Con número de portal ("calle real 12") y cobertura: aparece la dirección exacta (fuente "CartoCiudad · IGN"); elegirla centra el mapa en el portal y abre *¿Qué hay aquí?* ahí. (FR-73)
- Con número y sin cobertura (o el servicio caído): "Los números de portal necesitan cobertura: te enseño la calle", y el resultado de la calle. (FR-73)
- Unas coordenadas o un enlace de Google Maps pegados: un único resultado "Coordenadas …" arriba; elegirlo centra el mapa ahí. Un enlace corto (maps.app.goo.gl) no se puede leer y lo dice. (FR-73)

---

### FL-37 · Compartir un hidrante con bomberos por WhatsApp

**Actor:** voluntario o jefatura. (FR-75)

1. Abre la ficha del hidrante. El bloque *Coordenadas* enseña las decimales y las UTM ETRS89 huso 30, cada una con su botón de copiar. (FR-75)
2. Pulsa **Compartir**, junto a *Cómo llegar*. Se abre el menú del móvil con un texto: código, tipo, diámetro y estado; dirección; coordenadas decimales y UTM; y un enlace de Google Maps a esas coordenadas. Sin nombres ni la descripción libre. (FR-75, FR-27)
3. Elige WhatsApp y el chat. (FR-75)

**Variantes**
- Sin menú de compartir (ordenador, algunos navegadores): el texto se copia y un aviso dice "Copiado". Si tampoco se puede copiar, el aviso enseña el texto seleccionable. (FR-75, UI-05)
- Compartir el incidente o un sitio de *¿Qué hay aquí?*: el mismo texto sin los datos del punto. (FR-75, FR-72, FR-74)
- Sin cobertura: el menú del móvil funciona igual; el mensaje sale cuando haya señal. (FR-75)

---

### FL-38 · Medir el tendido desde un hidrante

**Actor:** voluntario en una salida. (FR-76, FR-74)

1. Desde una fila de *Cercanos*, *Medir tendido*: la medición empieza con la recta incidente → punto ya puesta. También desde *¿Qué hay aquí?* (*Medir desde aquí*) o desde el botón *Medir* del menú de herramientas del mapa. (FR-76, FR-72, FR-74)
2. Mientras mide, cada toque en el mapa añade un vértice (y se imanta a un marcador si cae cerca); tocar no abre fichas. (FR-76)
3. La barra inferior dice la distancia total y los tramos: "186 m · 10 tramos de 20 m". Cada tramo de más de 30 m lleva su etiqueta. (FR-76, FR-142)
4. *Deshacer* quita el último vértice; *Borrar* empieza de nuevo; *Terminar* o *atrás* salen. La medición no se guarda. (FR-76)

**Variantes**
- Sin cobertura: todo funciona igual. (FR-76)
- Con 0 o 1 vértices, *Deshacer* está deshabilitado y dice por qué. (FR-76, UI-02)

---

## Trazabilidad

| Flujo | Pantallas (07 / 08) | Requisitos principales |
|---|---|---|
| FL-01 | 07 §7.1 | FR-30–33, FR-94 |
| FL-02 | 07 §7.2 | FR-60–69, FR-80 |
| FL-03 | 07 §7.4 | FR-41, FR-50, FR-55, FR-82 |
| FL-04–08 | 07 §7.3 | FR-42–46 |
| FL-09 | 07 §7.2, §7.4, §7.5 | FR-80–84 |
| FL-10–12 | 07 §7.5 | FR-90–94 |
| FL-20–23 | 08 Cola de revisión | FR-100–110 |
| FL-24–26 | 08 Inventario, Caducadas, Registro, Papelera | FR-120–125 |
| FL-27 | 08 Voluntarios | FR-130–132 |
| FL-28 | 07 §7.3 (variante jefatura) | FR-150–151 |
| FL-29–31 | 08 Ajustes | FR-140–145 |
| FL-35–38 | 07 Mapa, Ficha (incidente, ¿Qué hay aquí?, búsqueda, compartir, medir) | FR-72–76, FR-161 |
| FL-13, FL-32–34 | 07 Ficha/Ajustes (cómo llegar, avisos, novedades, servidor caído), 08 Inventario/Ajustes (exportar, mantenimiento, avisos, QR, novedades, servidor caído) | FR-160–168 |
