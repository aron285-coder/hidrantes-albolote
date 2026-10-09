# 33 · Mejoras elegidas del recorrido, defectos y la entrada del día del lanzamiento (oct 2026)

> **Nota al ponerlo en el repositorio (9 oct 2026, coordinación en #580).** Mandan sobre el texto de abajo:
>
> - **Las decisiones de §0.1 son DEC-190, DEC-191 y DEC-192**, no DEC-187 a DEC-189: esos números ya los
>   usaron los arreglos de #563, #564 y #562. Donde abajo pone DEC-187 (entrada del lanzamiento), léase
>   **DEC-190**; DEC-188 (150 fotos al día), **DEC-191**; DEC-189 (U1 a U15), **DEC-192**.
> - **D2, D3 y D4 ya están arreglados en `develop`:** D2 en #576 (DEC-189, test `e2e/alto-pagina.spec.ts`),
>   D3 en #574 (DEC-187, «Hacer foto · opcional» y `necesitaFoto`) y D4 en parte en #575 y #577 (DEC-188).
>   RV-321, RV-316 y RV-330 parten de esos arreglos y no los rehacen.
> - `fn_registrar_error` de 5 argumentos sin `anon` (RV-306) va en esta release aunque 0.9.0 no lleve una
>   semana en producción: el acceso real no está abierto (F9.10).

| | |
|---|---|
| **Para** | Claude Code, en este repositorio. **Cuatro sesiones** (Backend, Frontend-campo, Frontend-panel, Ops) en tres oleadas. Cada sesión puede usar subagentes en worktrees (máx. 3) donde lo dice §0.3. |
| **Base** | `develop` en `11ee841`. Producción en **0.10.0** desde el 9 oct, con el arreglo de D1. |
| **Origen** | Recorrido RV-270 (`docs/verificacion/recorrido-staging-2026-10-08.md`, #565) y la revisión posterior del código. El desarrollador ha elegido las mejoras de este documento. |
| **Mockups** | `docs/mockups/33-mejoras.html`: por cada mejora de UI, la captura real del recorrido ("Ahora") y el mockup ("Propuesta"). Si el mockup y este texto no coinciden, manda el texto. |
| **El desarrollador** | No hace nada (DEC-176, DEC-177). La release la publica Ops (oleada 3). |
| **Requisitos** | Cambian FR-31 a FR-34 (entrada con el código), FR-143 (Salud) y el texto de Mis propuestas en `docs/01`. Versión nueva de 01 con "aprobada por el desarrollador al pedir el cambio" (DEC-177). |

## 0. Reparto

### 0.1 Decisiones del desarrollador

| DEC | Qué |
|---|---|
| **DEC-187** | **La entrada del día del lanzamiento.** Los topes de canje del código se pueden cambiar desde Ajustes, y jefatura puede **abrir la entrada para todos durante 24 h** (RV-300). Se abre sola cuando se genera un código nuevo revocando los móviles. |
| **DEC-188** | El tope de grupo de **150 fotos al día no se toca** (T2 de la revisión, descartado): no es un problema. |
| **DEC-189** | Mejoras de UI U1 a U15 con las indicaciones del desarrollador: U1 con la leyenda plegada, U6 lo más simple posible, U13 sin cuatro filas, U14 sin el minimapa de la Cola. |

### 0.2 Sesiones, oleadas y puntos

| Oleada | Sesión | Puntos | `PW_PUERTO` |
|---|---|---|---|
| 1 | **Backend** | RV-300 a RV-306 (migración 0044, Functions, pgTAP) | 4300 |
| 1 | **Frontend-campo** | RV-310 a RV-329 (app del voluntario) | 4310 |
| 1 | **Frontend-panel** | RV-330 a RV-337 (panel) | 4330 |
| 1 | **Ops** | RV-340 a RV-342 (staging, respaldo, documentación) | — |
| 2 | **Frontend-panel** | RV-338: la parte de Ajustes de RV-300, cuando 0044 esté en `develop` | 4330 |
| 2 | **Frontend-campo** | RV-329: mensajes con `ambito` (RV-303), cuando esté en `develop` | 4310 |
| 3 | **Ops** | RV-343 (RV-139b sobre el commit nuevo), RV-344 (recorrido corto de lo cambiado) y RV-345 (publicar 0.11.0) | 4340 |

### 0.3 Archivos y subagentes

| Archivo | Dueño |
|---|---|
| `supabase/migrations/0044_*.sql`, `supabase/tests/*`, `functions/**`, `docs/05`, `docs/11` | Backend |
| `src/` salvo `src/componentes/panel/**`, `src/lib/panel/**` y `src/paginas/PanelJefatura.tsx`; `public/sw-push.js` | Frontend-campo |
| `src/componentes/panel/**`, `src/lib/panel/**`, `src/paginas/PanelJefatura.tsx`, `docs/06` | Frontend-panel |
| `.github/**`, `scripts/**`, `supabase/seed-staging.sql`, `docs/01`, `03`, `04`, `09`, `12`, `13`, `14`, `15`, `INDICE.md`, `docs/mockups/`, `docs/verificacion/*` | Ops |
| `src/lib/textos.ts` | Cada uno, su bloque. Rebasar justo antes de fusionar. |

**Subagentes:**

- **Frontend-campo:**
  - (1) mapa, cabecera, buscador y avisos: U1 a U4, U8 a U10, U12, D2, D5 a D7, D11, N3;
  - (2) ficha, formularios, Mis propuestas y Ajustes: U5 a U7, U11, D3, D8 a D10, N1, N2, N5, N6.
- **Frontend-panel:**
  - (1) Cola: U14, U15, D4, D13, N4;
  - (2) Salud, Editar y Ajustes: U13, D14, RV-338.
- **Backend:** la sesión principal escribe 0044. Un subagente hace las Functions y el test de permisos (RV-303 a RV-305).

**Herramientas, como siempre:** `paquete-rv`, `nueva-migracion` (Backend), `revisar-pantallas` (Frontend), `pr-review-toolkit`, `code-review` y, en Backend y Ops, `security-guidance`. **Un test que falla antes del arreglo** en cada punto con código. **Capturas antes y después** de cada mejora de UI, a 412 px y 1440 px, en claro y en oscuro, comparadas con el mockup. **Registro:** `docs/verificacion/mejoras-33.md`.

---

## 1. Backend (oleada 1, migración 0044)

### RV-300 · La entrada del día del lanzamiento (T1, DEC-187) · P0

**Qué pasa.** 0041 dejó `max_altas_ip_dia = 20` y `max_altas_global_hora = 40`, y **no están** en la lista de parámetros que se cambian desde Ajustes (`0041:63-69`).

- **Cuándo pasa:** el día del lanzamiento (F9.10), o cuando jefatura genera un código nuevo revocando todos los móviles (`0006:382`, la respuesta de `15` §5.4 a un código filtrado).
- **Qué pasa entonces:** los ~65 voluntarios entran desde la misma wifi del parque. Entran 20; los demás reciben `DEMASIADOS_INTENTOS` durante un día. A partir de 40 en una hora, nadie más.
- Hoy solo se arregla con SQL.

**Solución.**

1. **Los dos topes, en Ajustes.** `max_altas_ip_dia` y `max_altas_global_hora` entran en la lista de `fn_guardar_config`:
   - con nombres en palabras: "Entradas desde una misma wifi al día" y "Entradas por hora, entre todos";
   - rangos válidos: 5–500 y 10–500.
   - Queda en el Registro como cualquier parámetro.
2. **"Abrir la entrada para todos (24 h)".**
   - Parámetro nuevo `entrada_abierta_hasta` (`timestamptz`, nulo por defecto). Mientras sea futuro:
     - el tope por IP pasa a **200 al día** y el tope por hora a **200**;
     - **los topes de intentos fallidos no cambian.** La protección contra quien prueba códigos sigue igual: solo se abre la entrada a quien acierta;
     - los tokens creados en esa ventana **no** tienen el límite de "token nuevo" (10 propuestas el primer día): tienen el normal.
   - Funciones nuevas, solo para administradores:
     - `fn_abrir_entrada(horas int default 24)`, con máximo 72;
     - `fn_cerrar_entrada()`.
   - Las dos quedan en el Registro (`entrada_abierta` y `entrada_cerrada`) con quién y hasta cuándo.
3. **Se abre sola.**
   - `fn_cambiar_codigo_acceso` con "revocar todos los dispositivos" pone `entrada_abierta_hasta = now() + 24 h` en la misma transacción, y lo dice en el Registro.
   - Un código nuevo **sin** revocar no la abre: los móviles que ya estaban siguen dentro.
4. **Se cierra sola** al pasar la hora. No hace falta ninguna tarea programada: la comprobación es `entrada_abierta_hasta > now()`.
5. **Salud:** `fn_salud` devuelve:
   - `entradas_frenadas_24h`: canjes correctos rechazados por los topes de IP o de hora, no por código mal;
   - `entrada_abierta_hasta`.
   - Vigilancia avisa (issue y push a jefatura) si `entradas_frenadas_24h > 5`, con el texto "Hay voluntarios que no pueden entrar: abre la entrada 24 h en Ajustes".
6. **pgTAP:**
   - con la entrada cerrada, la 21.ª entrada desde una IP falla;
   - con la entrada abierta, entran 65 desde la misma IP y 65 en la misma hora;
   - los fallos de código siguen frenando igual con la entrada abierta;
   - cambiar el código revocando la abre 24 h, y sin revocar no;
   - pasada la hora, vuelve a 20;
   - un token creado con la entrada abierta tiene 60 propuestas;
   - sin sesión de administrador: `NO_AUTORIZADO`.

La parte de pantalla es RV-338 (Frontend-panel, oleada 2).

### RV-301 · El tope de espacio mide lo nuestro (T3) · P1

**Qué pasa.**

- `pg_database_size(current_database())` (`0041:484`) cuenta toda la base de datos: uniformidad, auth, `cron.job_run_details` y `net._http_response`. Si eso crece, los voluntarios reciben `SIN_ESPACIO` y nadie sabe por qué.
- `fn_espacio_fotos` (`0042:91-101`) solo suma los buckets de hidrantes, pero la cuota de 1 GB es de todo el proyecto.

**Qué se hace.**

- **El tope de la base de datos** compara `max_bytes_bd` con el tamaño del **esquema `hidrantes`**: la suma de `pg_total_relation_size` de sus tablas.
- **El total de la base de datos** se sigue midiendo, pero solo para avisar: vigilancia avisa al 80 % de 500 MB, con el desglose (hidrantes, el resto y los registros de pg_cron y pg_net).
- **Una tarea de pg_cron diaria** borra `cron.job_run_details` de más de 7 días. Solo las filas de los trabajos de hidrantes, por `jobname like 'hidrantes_%'`.
- **El tope de fotos** sigue mirando solo nuestros buckets. Vigilancia avisa además si **todo** el Storage del proyecto pasa del 80 % de 1 GB.
- **`SIN_ESPACIO`** lleva `reintentar_en_s` (1 hora), como los demás topes.
- **pgTAP** y test de vigilancia.

### RV-302 · Reservas que se liberan y "token nuevo" por móvil (T4) · P1

**Qué pasa.**

- **Reservas:** una propuesta que falla para siempre (por ejemplo `PUNTO_NO_ACTIVO`, un error de validación o cinco errores desconocidos) deja sus reservas de foto abiertas 2 h. Con tres fallos en una tanda sin conexión se llega a 6, y la cola de ese móvil se para hasta 2 h (`0042:59-66`).
- **Token nuevo:** el límite se mide por la fecha del token (`0041:462`). Un veterano que vuelve a entrar queda en 10 propuestas un día.

**Qué se hace.**

- **`fn_liberar_reservas(rutas text[])`**, para `anon` con token: marca como liberadas las reservas de ese dispositivo con esas rutas. Dejan de contar para `RESERVAS_ABIERTAS` y la purga las borra como siempre. Frontend-campo la llama cuando una propuesta pasa a fallo definitivo (RV-328).
- **"Token nuevo"** se mide por la **primera** vez que se vio ese `dispositivo_id`: `min(emitido_en)` de sus tokens, o `primera_vez` en `dispositivos` si existe.
- **pgTAP** de las dos cosas.

### RV-303 · Distinguir "tu tope" de "el del grupo" (T5) · P2 · subagente

- `functions/_lib/comun.ts:175-182` (`detalleTope`) deja pasar `ambito` (`dispositivo` o `grupo`), que ya manda 0042.
- Tests de `url-subida`.
- Frontend-campo pone los textos en RV-329.

### RV-304 · Endurecimiento (T7) · P2 · subagente

- **`/api/push` con token:** límite de 30 llamadas por token y hora (`dentroDelLimite`, como `/api/geocodificar`). Antes de #566 siempre daba 401; ahora se puede llamar en bucle.
- **El candado `propuestas:global`** (`0041:475`) se coge **solo** alrededor del recuento del tope global, no hasta el final de la transacción: se cambia a un recuento con `for update` sobre una fila contador, o se hace el recuento primero y la inserción después, sin el `pg_advisory_xact_lock` de toda la transacción.
- **Tests:** el límite de `/api/push`; dos propuestas a la vez no se esperan más que el recuento.

### RV-305 · Un test que vigile los permisos de `service_role` (seguimiento de D1) · P1 · subagente

**Qué pasa.** D1 pasó porque ninguna prueba comprobaba que `service_role` pudiera ejecutar lo que llaman las Functions.

**Qué se hace.**

- `scripts/rpc-de-servicio.ts` lista **cada RPC** que se llama sin JWT de usuario desde `functions/**` y `scripts/**`, leyendo `rpc(env, '…'` y `.rpc('…'`.
- pgTAP 40 comprueba `has_function_privilege('service_role', …, 'execute')` para cada una. La lista se genera en CI y, si el archivo de pgTAP no coincide con lo que encuentra el script, el job falla.

### RV-306 · Errores que hoy pasan sin aviso (seguimiento) · P3

- **`fn_registrar_error` de 5 argumentos:** quitarle `anon` en esta release. La 0.9.0 lleva una semana en producción, como se acordó en docs/32 RV-222. Se cierra #472 en lo que toca.
- **Contar un fallo** cuando un aviso llega a `SIN_RESPUESTA` (pendiente de `segunda-revision.md`).

---

## 2. Frontend-campo (oleada 1)

### Mejoras de UI (ver el mockup de cada una)

#### RV-310 · U1 · El mapa se abre donde está el voluntario · P1

- **Con posición al día y dentro de la zona:** zoom de calle (17) centrado en el voluntario, con el botón "Mi posición" marcado.
- **Sin posición o fuera de zona:** encuadre de **todos los puntos**, no de la zona entera.
- **Un aviso discreto** arriba, "Centrado en tu posición · Ver toda la zona", que se va solo a los 4 s. "Ver toda la zona" encuadra la zona.
- **Si el voluntario ya movió el mapa** en esta sesión, se respeta: al volver de la ficha no se recentra.
- **La leyenda sigue plegada** abajo a la izquierda, como ahora ("Leyenda"), y se abre al tocarla.
- **e2e:**
  - con posición simulada dentro de la zona, el zoom es 17 y el centro es la posición;
  - sin permiso, se ven todos los puntos;
  - la leyenda, plegada.

#### RV-311 · U2 · Cabecera compacta en el móvil · P1

- **El estado de sincronización** pasa a la derecha de la barra "Puntos de agua":
  - punto verde "al día · 15";
  - ámbar "hace 2 h";
  - gris "sin conexión".
- **La franja "Sincronizado hace…" desaparece** como franja aparte.
- **"Sin conexión con el servidor · Reintentar"** va dentro de la barra como una píldora, no como otra franja.
- **Tocar el estado** abre una hoja con el detalle: última sincronización, puntos guardados, "N sin enviar" y "Sincronizar ahora".
- **"N sin enviar"** se queda como enlace propio, debajo de la barra y alineado a la derecha, sin tapar el buscador (N3).
- La banda "ENTORNO DE PRUEBAS" no cambia.
- **Medida:** al menos 80 px más de mapa a 412 × 915.
- **Tests:** las tres situaciones de la píldora y axe.

#### RV-312 · U3 · Buscador: un solo ✕, direcciones primero y opaco en oscuro · P2

- **Un solo ✕:** con texto, borra; vacío, cierra la búsqueda. Fuera el segundo ✕.
- **Si lo escrito lleva un número**, la sección "Direcciones" va primero.
- **Fondo opaco** `--papel` también en oscuro (D5, `Mapa.tsx:428`).
- **Tests.**

#### RV-313 · U4 · Aviso de versión nueva abajo, con botón · P2

- **Una barra abajo**, sobre la navegación: "Hay una versión nueva", con mayúscula, y el botón **Actualizar**.
- **No empuja el contenido ni tapa el buscador.** Sustituye a la franja de arriba.
- **En un formulario:** no ofrece actualizar. Dice "Se actualizará cuando termines" y actualiza al volver al mapa, con lo que ya hace RV-230 si hay algo solo en memoria.
- **Tests.**

#### RV-314 · U5 · Ficha sin foto: una franja, no un bloque · P2

- **Sin foto, o si falla:** una franja de 44 px con icono y "Sin foto". Si la carga falló, "No se ha podido cargar la foto · Reintentar".
- **Con foto:** alto máximo de 200 px.
- **"Cómo llegar"** queda en la primera pantalla a 412 × 915.
- **Test.**

#### RV-315 · U6 · Mis propuestas dice qué se propuso, lo más simple posible · P1

**Cada tarjeta:**

- **Arriba:** el código (o "Punto nuevo"), el tipo de cambio en texto suave y el chip de estado.
- **Una sola línea** con lo que se propuso:
  - "Regular → No funciona";
  - "Enganche: Granada → Directo";
  - "Hidrante 100 mm" en un alta;
  - "Sigue igual" en una revisión;
  - "Retirada: Obras".
- **Si se rechazó:** "Motivo: …" en una línea de texto suave, sin recuadro.
- **"hace 1 min"** y, si está pendiente, el botón **Retirar** de 44 × 44 px (D10, `MisPropuestas.tsx:189-191`).
- **Nada más:** sin fecha de resolución, sin código asignado, sin "ALTA nuevo" en monoespaciada.
- El texto de la línea sale de los mismos datos que manda la propuesta. Hay que reutilizar `valorDe`/`textoCambios` de `registro-legible.ts`, moviéndolos a `src/lib/` si hace falta, sin duplicarlos.
- **Tests** de la línea para las seis operaciones.

#### RV-316 · U7 · Formularios: foto opcional cuando lo es, y textos enteros · P1

- **D3** (`Campos.tsx:255`, `Proponer.tsx:337-338`): en *Corregir datos* la foto es **opcional**:
  - prop `opcional` en `CampoFoto`/`HuecoFoto`;
  - título "Foto · opcional";
  - botón secundario "Hacer foto (opcional)".
- **D8:** la ayuda del tipo es una frase con el enlace dentro: "¿El tipo está mal? Propón retirarlo y da de alta el correcto". Sin "·" colgando. Igual en el subtítulo de Cercanos (`PanelCercanos.tsx:123`): el separador no puede quedarse solo al partir la línea.
- **D9** (`Campos.tsx:228-234`): "✓ Conexión · 18 kB" no se parte (`whitespace-nowrap`). "repetir" pasa a tocar la propia ficha de la foto, con `aria-label` "Repetir la foto de la conexión".
- **"Otra medida":** el campo de número lleva "mm" al lado.
- **"La posición no está al día…"** desaparece en cuanto el voluntario coloca el pin a mano.
- **Tests.**

#### RV-317 · U8 · Capas en palabras, con una miniatura · P2

- **Nombres:**
  - "Mapa sin conexión" (funciona sin cobertura);
  - "Callejero" (con nombres de calles);
  - "Foto aérea" (para ver el terreno);
  - "Catastro" (parcelas y edificios).
  - Las tres últimas dicen "necesita cobertura".
- **Una miniatura** de cada capa: una imagen pequeña fija en `public/capas/`.
- **Las fuentes**, solo en una línea al pie: "OpenStreetMap, PNOA (IGN), Catastro".
- **D11** (`SelectorCapas.tsx:24`): `div role="radiogroup"` con hijos `div`, o `ul` con el radiogroup en un envoltorio. Axe limpio.
- **Ajustes, "Capa por defecto":** los mismos nombres.

#### RV-318 · U9 · Medir: etiquetas que no se pisan · P3

- **D7** (`MapaLeaflet.tsx:384-404`):
  - cada etiqueta en una píldora blanca, apartada de la línea hacia fuera del ángulo del vértice;
  - se recolocan en `zoomend`;
  - si un tramo mide menos de ~70 px en pantalla, su etiqueta se oculta.
- **El total**, en la fuente normal: "772 m · 39 tramos de manguera de 20 m".
- **Test** de la colocación con dos tramos en ángulo agudo.

#### RV-319 · U10 · Leyenda: Barro y No funciona que se distinguen · P2

- **Barro:** relleno marrón lleno con una "B" blanca.
- **No funciona:** blanco con borde gris y "✕".
- **Se distinguen sin color.** El mismo cambio en el **marcador del mapa**, no solo en la leyenda. Con su test de contraste, en `docs/06` §4 (Frontend-panel lo actualiza).
- **Leyenda en dos grupos:** tipo (forma) y estado (color).
- **Plegada por defecto** (U1).

#### RV-320 · U11 · Ajustes de la app sin jerga · P3

- **Una sola tarjeta "Mapa sin cobertura"**, con tamaño, fecha y puntos guardados, y "Sincronizar". Junta las tres de hoy.
- **"Guardado protegido"** pasa a una frase: "El móvil no borrará estos datos aunque le falte espacio". Si es "no", "El móvil podría borrar estos datos si le falta espacio: instala la aplicación para evitarlo".
- **Novedades** con el título "Novedades de la versión 0.x.y" y las líneas **sin** repetir la versión. "Ver versiones anteriores" se pliega.
- **"Capa por defecto"**, con los nombres de U8.

#### RV-321 · U12 · Escritorio: navegación arriba, sin barra de abajo · P2

- **A partir de 1100 px:**
  - "Mapa · Mis propuestas · Ajustes" en la barra de arriba, con el estado de U2 a la derecha;
  - **sin barra abajo**;
  - **sin "Lista"**, porque la lista está a la izquierda.
- **La lista lateral:** los filtros se parten en dos líneas en vez de desplazarse (D6a, `ListaPuntos.tsx:100`).
- **D2** (`ListaPuntos.tsx:147`): el contenedor con scroll lleva `relative`, para que los `sr-only` no estiren la página. **Test:** `document.scrollingElement.scrollHeight === innerHeight` a 1440 × 900 y 1440 × 700.
- **D6b** (`MapaLeaflet.tsx:119-122`): con el mapa sin conexión, `maxBounds` y `minZoom` se ajustan al recorte del PMTiles, para que no se vea su borde recto.

### Defectos

#### RV-322 · N1 · "Proponer retirada" desde Corregir datos · P1

**Qué pasa** (`Proponer.tsx:514-521`, `formulario-a-medias.ts:47-51`):

- el enlace usa `replace` y solo sustituye la entrada extra del historial;
- "atrás" vuelve a un *Corregir datos* vacío en vez de a la ficha;
- y no pregunta si había algo escrito.

**Qué se hace:**

- si hay algo escrito, pregunta "¿Salir sin enviar?";
- quita las dos entradas, la del formulario y la extra;
- "atrás" desde la retirada vuelve a la ficha.

**e2e** a 412 px.

#### RV-323 · N2 · Apagar los avisos del voluntario no apaga los de jefatura · P1

**Qué pasa** (`push.ts:183-190,224`): sin sesión de jefatura abierta, se decide con lo que recuerda el navegador, que se borra al cerrar sesión del panel.

**Qué se hace:**

- Antes de dar de baja la suscripción del navegador, se pregunta **al servidor** si ese endpoint tiene filas de administrador. Hace falta una función de solo lectura que dé un sí o un no, sin datos: `fn_endpoint_tiene_jefatura(endpoint)`, para `anon` con token. La añade Backend en 0044 y se coordina.
- Si las tiene, solo se borra la fila del voluntario.
- **Test.**

#### RV-324 · N3 · "N sin enviar" no tapa el buscador · P2

`BarraEstado.tsx:51` cuelga 16 px por debajo de la barra y tapa los 8 px de arriba del buscador, incluido su ✕. Se resuelve con U2 (RV-311). **Test:** `elementFromPoint` en el ✕ del buscador devuelve el ✕.

#### RV-325 · N5 · Cerrar sesión de jefatura desde Ajustes borra sus temas · P3

`Ajustes.tsx:122`: `salirDeGoogle()` también llama a `olvidarTemasJefatura()`. Test.

#### RV-326 · N6 · Fotos de 24 MP · P1

`foto-grande.ts:7`:

- el límite sube a **26 MP**: 5712 × 4284 = 24,5 MP, la cámara por defecto de iPhone 15 y 16;
- **test** con esas medidas.

#### RV-327 · Comprobar el hueco encima del alta · P2

En la captura `m13` del recorrido hay ~260 px vacíos **encima** de la cabecera del alta.

- **Comprobar** a 412 × 915, en móvil emulado y con la cabecera fija, si es la captura de página completa o un desplazamiento real, como D2.
- Si es real: arreglarlo, con un test de que la cabecera está en `y = 0` tras abrir el alta desde el mapa.
- Anotar el resultado en el registro.

#### RV-328 · Liberar las reservas de una propuesta que falla (RV-302) · P2

Cuando un elemento de la cola pasa a fallo definitivo, se llama a `fn_liberar_reservas` con sus rutas de foto, sin esperar ni bloquear. **Test.**

## 3. Frontend-campo (oleada 2)

### RV-329 · Mensajes con `ambito` (RV-303) · P2

- **`ambito = grupo`:** "El grupo ha llegado al máximo de fotos de hoy. Se enviará a las HH:MM".
- **`ambito = dispositivo`:** "Has llegado a tu máximo de fotos de hoy. Se enviará a las HH:MM".
- Sin `ambito`, como hoy. En la cola y en Mis propuestas. **Tests.**

---

## 4. Frontend-panel (oleada 1)

### RV-330 · U15 / D4 · Cola: un punto que ya no está activo · P1

**Qué pasa:** `DetallePropuesta.tsx:181`, `bloqueoAprobar = bloqueoPorMedida(p, punto)`, no mira la situación del punto, aunque `lib/panel/cola.ts:347` ya la detecta.

**Qué se hace:**

- **Bloqueo:** `puntoActual(p, punto)?.situacion !== 'activo'`, en operaciones que no sean alta ni retirada. También tras recibir `PUNTO_NO_ACTIVO`.
- **Aviso arriba, en rojo:** "Este punto ya no está activo (retirado el 7 oct). La propuesta no se puede aprobar."
- **Aprobar y Corregir** desactivados con el motivo escrito (UI-02).
- **La acción principal pasa a ser "Rechazar: el punto ya no existe"**, con el motivo ya escrito ("El punto ya no está activo"), editable.
- **En la lista**, la fila lleva ⚠ (`tieneAviso`, `cola.ts:211`), y la aprobación en lote la salta y lo dice.
- **Tests** y e2e.

### RV-331 · U14 · Panel con poca pantalla, y sin minimapa en la Cola · P2

- **Fuera el minimapa de cada fila de la Cola** (indicación del desarrollador), en **todos** los tamaños. La fila es más baja. El mapa sigue en el detalle.
- **Por debajo de 800 px de ancho útil** (tableta o zoom 200 %):
  - el buscador va dentro de la barra;
  - "Ir al mapa" y "Cerrar sesión" van en un menú ☰;
  - los filtros de la Cola son desplegables compactos en una línea.
- **Medida:** a 720 × 450 CSS (zoom 200 % de 1440 × 900) se ven al menos 4 propuestas.
- **e2e** con esa ventana.

### RV-332 · D13 · Controles del mapa del panel en oscuro · P3

`MinimapaPropuesta.tsx:55`: el `L.control.zoom` usa el estilo de Leaflet, blanco. En `index.css`, `.leaflet-bar a` con `--control-mapa`, `--texto` y `--linea`, en los dos modos oscuros. Captura.

### RV-333 · D14 · Foco al abrir Editar · P3

`EditarPunto.tsx:407-411`: al abrir, el foco va al título del panel (`tabIndex=-1`), no a "Mi posición". Test de teclado.

### RV-334 · N4 · "Confirmar y aprobar" no se desbloquea con datos viejos · P2

`hooks/carga.ts:52`: `recargarYVer` devuelve `false` si una carga más nueva la sustituyó, o espera a la última. `DetallePropuesta.verDeNuevo` (`:149-152`) solo desbloquea con la última carga buena. Test.

### RV-335 · U13 · Salud del sistema en palabras · P2

- **Fuera** (indicación del desarrollador):
  - "Resumen semanal para jefatura";
  - "Puntos sin dirección";
  - "Propuestas esperando más de 14 días";
  - "Borrar errores viejos (cada día)".
  - Las tareas siguen funcionando: solo dejan de salir en Salud.
- **Arriba, un resumen:** "Todo bien", o lo que necesita atención (respaldo viejo, vigilancia sin responder, espacio por encima del 70 %).
- **Lo que queda, con nombres en palabras:**
  - Fotos (MB de 800, con barra);
  - Base de datos (MB de 400, del esquema, RV-301);
  - Último respaldo;
  - Última vigilancia;
  - Errores de la aplicación (7 días);
  - Móviles con acceso;
  - Códigos de acceso fallidos (24 h);
  - **Entradas frenadas por el tope (24 h)**, con el enlace "abrir la entrada 24 h" (RV-338);
  - Zona y mapa base.
- **"Descargar inventario (JSON)"** pasa a Inventario → Exportar ▾ (cuarta opción, "Inventario completo (JSON)").
- **`docs/01` FR-143**, al día (Ops).
- **Tests y captura.**

### RV-336 · Marcadores nuevos de Barro y No funciona en el panel · P2

Los marcadores de RV-319, también en los mapas del panel (Inventario, detalle de la Cola, Editar). `docs/06` §4 con la simbología nueva y su test de contraste.

### RV-337 · `docs/06` al día · P3

Apéndice A con todos los textos nuevos de docs/33 (de las dos sesiones de frontend). §5 con:

- la cabecera compacta (U2);
- el aviso de versión abajo (U4);
- la ficha sin foto (U5);
- Mis propuestas (U6);
- las capas (U8);
- la navegación de escritorio (U12);
- Salud (U13);
- el panel estrecho (U14).

## 5. Frontend-panel (oleada 2)

### RV-338 · La entrada del día del lanzamiento, en Ajustes (RV-300) · P0

- **Ajustes → Código de acceso**, una sección "Entrada":
  - **Cerrada:** el botón "Abrir la entrada para todos (24 h)", con la explicación "Para el día del lanzamiento o después de cambiar el código: deja entrar a todos desde la misma wifi durante 24 horas. Quien pruebe códigos sigue frenado".
  - **Abierta:** franja verde "Entrada abierta para todos hasta el jue 10 a las 18:30", con "Cerrar ahora".
- **Generar código nuevo con "Revocar todos"** avisa en la confirmación: "La entrada se abrirá 24 h para que todos puedan volver a entrar".
- **Parámetros:** "Entradas desde una misma wifi al día" y "Entradas por hora, entre todos", con sus rangos.
- **Salud:** "Entradas frenadas por el tope (24 h)" con el enlace que abre la entrada (RV-335).
- **Tests y e2e:**
  - abrir y cerrar;
  - el aviso de la confirmación;
  - los dos parámetros;
  - sin sesión de administrador, nada de esto.

---

## 6. Ops (oleada 1)

### RV-340 · Datos de staging que se parecen a los reales (T8, D12) · P2

- **`supabase/seed-staging.sql:19-33`:**
  - los puntos de prueba llevan fotos que **existen**: el paso de seed (`ci.yml:123`) sube a `hidrantes-fotos-dev` unas fotos de prueba sin datos personales, generadas o de `e2e/fixtures`;
  - si no se puede, `foto_path = null`.
- **Las cuatro bocas duplicadas BOC-0003 a BOC-0006** de RV-139b: retiradas con motivo "prueba" (con claims de administrador, como en RV-139b).
- **Test:** después del seed, cada `foto_path` de staging responde 200.

### RV-341 · La huella GPG dentro del workflow (T7) · P3

`GPG_HUELLA` pasa de variable del repositorio a una constante en `respaldo.yml`. Así, cambiarla exige un PR y no basta con los permisos de la variable. Test de workflows.

### RV-342 · Documentación · P2

- **`docs/01`:**
  - FR-31 a FR-34: los topes de entrada, configurables, y "abrir la entrada 24 h";
  - FR-143: Salud;
  - Mis propuestas: la línea de lo propuesto.
- **`docs/15` §5.4** (código filtrado) y **F9.10** (lanzamiento): el paso "abrir la entrada 24 h", que se abre sola al revocar. Para el lanzamiento: abrirla **antes** de comunicar el código.
- **`docs/12`:** DEC-187, DEC-188 y DEC-189.
- **`docs/mockups/33-mejoras.html`:** el archivo de mockups de este documento.
- **`INDICE.md`:** la fila 33.
- **`docs/13` y `docs/14`** (manuales en borrador):
  - la entrada del lanzamiento (13, jefatura);
  - la nueva Mis propuestas y las capas (14, voluntario).

## 7. Ops (oleada 3)

### RV-343 · Comprobación en staging (RV-139b) sobre el commit nuevo · P0

La misma comprobación de RV-139b, sobre el commit con todo docs/33. Además:

- un canje de 25 dispositivos simulados desde la misma IP, con la entrada cerrada (falla el 21.º) y abierta (entran los 25);
- cerrar la entrada.

### RV-344 · Recorrido corto de lo cambiado, en una ventana visible (DEC-184) · P1

Como RV-270, pero **solo lo que cambia docs/33**. Contra staging, en una ventana visible, a 412 px, 360 px y 1440 px, en claro y en oscuro:

- el mapa al abrir;
- la cabecera;
- el buscador;
- el aviso de versión;
- la ficha sin foto;
- Mis propuestas;
- los formularios;
- las capas;
- Medir;
- la leyenda y los marcadores;
- Ajustes;
- el escritorio;
- y en el panel (simulado): la Cola con punto retirado, la Cola sin minimapa y a 200 %, Salud y la entrada del lanzamiento.

**Informe** en `docs/verificacion/recorrido-staging-AAAA-MM-DD.md`:

- cada mejora con su captura **al lado del mockup** de `docs/mockups/33-mejoras.html`;
- "igual que el mockup", o en qué se aparta y por qué;
- defectos encontrados, con issue si son de gravedad alta o media;
- como mucho 10 propuestas nuevas, sin implementar.

**Al acabar, staging como estaba.**

### RV-345 · Publicar 0.11.0 · P0

Si RV-343 está en verde y RV-344 no ha abierto ninguna `bloquea-release`: `npm run publicar`, y su fila en `paridad-produccion.md`.

---

## 8. Checklist

- [ ] **Backend:**
  - [ ] topes de entrada en Ajustes y "abrir la entrada 24 h", que se abre sola al revocar;
  - [ ] espacio del esquema y del proyecto;
  - [ ] reservas liberadas y "token nuevo" por móvil;
  - [ ] `ambito`;
  - [ ] límite de `/api/push`;
  - [ ] candado más fino;
  - [ ] test de permisos de `service_role`;
  - [ ] `fn_registrar_error` de 5 argumentos sin `anon`;
  - [ ] `fn_endpoint_tiene_jefatura`.
- [ ] **Frontend-campo:**
  - [ ] U1 (con la leyenda plegada), U2, U3, U4, U5;
  - [ ] U6 (simple), U7, U8, U9, U10, U11, U12;
  - [ ] D2, D3, D5 a D11;
  - [ ] N1, N2, N3, N5, N6;
  - [ ] el hueco del alta comprobado;
  - [ ] reservas liberadas;
  - [ ] mensajes con `ambito`.
- [ ] **Frontend-panel:**
  - [ ] U13 (sin las cuatro filas), U14 (sin minimapa), U15;
  - [ ] D4, D13, D14, N4;
  - [ ] marcadores nuevos;
  - [ ] la entrada del lanzamiento en Ajustes;
  - [ ] `docs/06`.
- [ ] **Ops:**
  - [ ] staging con fotos y sin duplicados;
  - [ ] huella GPG en el workflow;
  - [ ] documentación;
  - [ ] RV-139b;
  - [ ] recorrido corto con capturas junto al mockup;
  - [ ] 0.11.0 en producción.
- [ ] **Todo:** tests, e2e, axe y pgTAP en verde; CI y staging en verde.

## 9. Lo que hace el desarrollador

**Nada.** Cuando lea el informe de RV-344, decide si alguna de las propuestas nuevas va a un docs/34.
