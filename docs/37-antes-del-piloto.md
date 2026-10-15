# 37 · Antes del piloto: el despliegue, la entrada del lanzamiento y la documentación (oct 2026)

| | |
|---|---|
| **Para** | Claude Code, en este repositorio. **Una sola sesión, en orden** (§0.2). |
| **Base** | `develop` en `2516a14`. Producción en **0.14.0**. La siguiente migración es la `0049` y la siguiente decisión, DEC-209. |
| **Origen** | La revisión completa del 15 oct 2026, hecha después de cerrar `docs/36`. El desarrollador ha elegido tres arreglos y la documentación que necesita el piloto. |
| **Versión** | **1, del 15 oct 2026.** Antes de empezar, comprueba que tu copia tiene §2 (RV-490). En `docs/36` se trabajó con una copia anterior y se perdió un punto (§0.3). |
| **Congelación** | Cabe en DEC-193 tal cual: dos arreglos `bloquea-release` y mantenimiento de la documentación. No hace falta otra excepción. Para no repetir número, la especificación de después del piloto pasa a ser **`docs/38`** (DEC-209). |
| **Divulgación** | Ya no hace falta esconderlo: H1 está descrito en el archivo público de `docs/36`, y lo demás no es de seguridad. Este documento entra en Git con el primer PR (RV-489). |
| **El desarrollador** | No hace nada. Aprueba el cambio de 03, 05 y 10 al pedir esta especificación (DEC-177). |

## 0. Reparto

### 0.1 Decisiones

| DEC | Qué |
|---|---|
| **DEC-209** | **`docs/37`, dentro de DEC-193:** arreglos `bloquea-release` y documentación. La especificación de después del piloto es `docs/38`. |
| **DEC-210** | **`dist` comprobado antes de desplegar.** Nada de `_worker.js`, `functions/`, `_routes.json` ni `_redirects`; `_headers` idéntico al del repositorio; solo archivos estáticos esperados. Matiza DEC-198. |
| **DEC-211** | **Entrada con la entrada abierta.** Con la entrada abierta, la Function deja pasar más intentos por wifi y minuto, y la app vuelve a intentarlo sola tras «mucha gente entrando». Matiza DEC-207. |

### 0.2 Orden

Un PR por punto, en este orden:

| # | Punto | Qué | Etiqueta |
|---|---|---|---|
| 1 | **RV-489** | Este documento a `docs/`, DEC-209 a DEC-211 y las issues | — |
| 2 | **RV-490** | H1: comprobar `dist` antes de desplegar | `bloquea-release` |
| 3 | **RV-491** | La entrada del lanzamiento: 65 personas en una wifi | `bloquea-release` |
| 4 | **RV-492** | Editar: la versión, distinta y no solo más nueva | — |
| 5 | **RV-493** | Jefatura con otra cuenta de Google (`OTRA_CUENTA`) | — |
| 6 | **RV-494** a **RV-497** | Documentación del piloto | — |
| 7 | **RV-498** | Los bajos de las revisiones del 14 y el 15 oct, como issues `tras-piloto` | — |
| 8 | **RV-499** | RV-139b, recorrido corto, publicar **0.15.0** y archivar | — |

Cada PR, con el flujo de siempre: el test que falla antes, `pr-review-toolkit`, `code-review` y CI verde. Los que tocan `src/` llevan también `revisar-pantallas`.

**Registro:** `docs/verificacion/antes-del-piloto-37.md`.

### 0.3 Por qué H1 llega ahora

H1 se añadió a `docs/36` como RV-464 el 14 oct, después de que las sesiones de Claude Code hubieran leído el documento. Por eso no se hizo, y el archivo de `docs/36` lo sigue dando como «fuera».

En RV-499 se añade una nota al principio de `docs/archivo/especificaciones/36-revision-tras-35.md`: «RV-464 (H1) se hizo en `docs/37` RV-490».

---

## 1. RV-489 · Puesta en marcha

- Este archivo a `docs/37-antes-del-piloto.md` (DEC-195: la especificación en curso va en la raíz).
- DEC-209, DEC-210 y DEC-211 en `docs/12`. En DEC-193, DEC-196 y DEC-205, donde dicen `docs/37`, pasa a `docs/38`.
- CLAUDE.md §5: «salvo `docs/35` y `docs/36`… `docs/38`, la de después del piloto».
- Una issue por punto. RV-490 y RV-491 llevan `bloquea-release`.

---

## 2. RV-490 · Lo que llega de `construir` no puede cambiar el código de servidor (H1, DEC-210) · P0 · `bloquea-release`

**Qué pasa.**

- Desde RV-410 (DEC-198) se construye en `construir`, sin secretos, y se despliega `dist` en `desplegar`, con el environment. Ver `deploy-prod.yml:78` y `:141`, y `deploy-staging.yml:105` y `:170`.
- **Wrangler solo empaqueta `functions/` si `dist/_worker.js` no existe.** Comprobado en la versión fijada (4.149.0): `wrangler-dist/cli.js`, `if (!_workerJS && fs14.existsSync(functionsDirectory))`. Si existe, como archivo o como carpeta, ese `_worker.js` **sustituye a todas las Functions**.
- **Así se cuela.** Una dependencia de desarrollo comprometida corre en `construir` y escribe `dist/_worker.js`. `desplegar` lo sube sin mirarlo. Ese código corre en el servidor con las variables de Pages, entre ellas `SUPABASE_SERVICE_ROLE_KEY`.
- **Otros archivos especiales que `dist` puede traer:**
  - `_routes.json`, que decide qué va a las Functions;
  - `_redirects`, que puede llevar a otra web;
  - `_headers`, que puede quitar la CSP.
- **Ninguna comprobación lo detecta.** `build-del-entorno.sh` solo busca las variables públicas, y `comprobar-despliegue` y `paridad` se ejecutan después de desplegar.

**Solución:** `.github/scripts/comprobar-dist.sh`, en los dos `deploy-*.yml`. Se ejecuta en `desplegar` **justo después de descargar `dist`** y antes de cualquier paso con secretos, migrar incluido.

1. **No pueden estar:** `dist/_worker.js` (archivo o carpeta), `dist/functions`, `dist/_routes.json` ni `dist/_redirects`.
   - Si está alguno, el trabajo falla con un mensaje claro.
   - Si algún día hiciera falta uno, se genera en `desplegar` desde el repositorio, nunca desde `dist`.
2. **`dist/_headers`** tiene que ser idéntico, byte a byte, al que sale del repositorio.
   - Se genera en `desplegar` con `node`, desde `config/cabeceras.ts`, que no importa nada.
   - Si `vite.config.ts` lo escribe con algo más (por ejemplo, la versión), se separa la función que lo construye para poder llamarla con `node` sin `node_modules`.
3. **Solo archivos estáticos esperados.**
   - Una lista cerrada de extensiones, sacada de un `dist` limpio de hoy (`.html`, `.js`, `.css`, `.json`, `.webmanifest`, `.svg`, `.png`, `.jpg`, `.webp`, `.woff2`, `.pmtiles`, `.txt`, `.ico`…).
   - Ningún enlace simbólico.
4. **Después de desplegar,** `comprobar` hace el sondeo de RV-412: `/api/verificar-codigo` con `{}` tiene que dar **exactamente** el 400 `PAYLOAD_INVALIDO` de las Functions del repositorio, con su cuerpo JSON.
5. **Riesgo que se acepta** (DEC-210): el JavaScript del navegador también sale de `construir`. Una dependencia comprometida podría cambiarlo y llevarse el JWT de quien use el panel, pero no los secretos del servidor. Lo cubren la lista de permitidos de Dependabot y el lockfile estricto (RV-410).

**Tests** (un test del script y `scripts/workflows.test.ts`):

- `comprobar-dist.sh` falla con cada uno de estos casos:
  - `_worker.js`, como archivo y como carpeta;
  - `functions/`;
  - `_routes.json`;
  - `_redirects`;
  - un `_headers` cambiado;
  - un `.exe`;
  - un enlace simbólico.
- Con un `dist` limpio, pasa.
- Los dos `deploy-*.yml` lo ejecutan justo después de `download-artifact` y antes de cualquier paso con `secrets.`.

**Documentación:** 04 (despliegue) y 11 (cadena de suministro).

---

## 3. RV-491 · 65 personas entran desde una wifi el día del lanzamiento (DEC-211) · P0 · `bloquea-release`

**Qué pasa.**

- `functions/api/verificar-codigo.ts:29` deja **10 intentos por minuto y por IP agrupada** (RV-451). Lo hace también con la entrada abierta: la Function no sabe si lo está.
- En la sesión del lanzamiento (#84), 65 personas en una sala con la misma wifi tardan por lo menos 7 minutos en entrar.
- La app no vuelve a intentarlo sola: cada voluntario ve «Hay mucha gente entrando a la vez. Prueba otra vez en un minuto» y pulsa Entrar a mano. Los que pulsan antes de tiempo vuelven a chocar.
- Ni 13 ni 14 lo avisan.

**Solución.**

1. **La Function sabe si la entrada está abierta.**
   - Llama a `fn_entrada_abierta_hasta()` con la service role como mucho una vez por minuto y por aislado, y guarda el resultado en memoria.
   - Si la llamada falla, se sigue con el tope normal.
   - Si `service_role` no tiene `execute` sobre esa función, la migración `0049` se lo da (solo a `service_role`).
2. **Con la entrada abierta, 60 por minuto y por IP agrupada;** sin ella, 10 como ahora. Son dos constantes en la Function, documentadas en 03 TR-41.
   - Lo de la base de datos no cambia: con la entrada abierta, `fn_verificar_codigo` ya sube los topes de altas a 200.
3. **La app vuelve a intentarlo sola** (`src/paginas/Entrada.tsx`). Con `OCUPADO`:
   - espera `reintentar_en_s` más entre 0 y 10 s al azar (para no volver todos a la vez);
   - lo vuelve a intentar sola, **como mucho tres veces seguidas**;
   - mientras tanto se lee «Mucha gente entrando a la vez. Lo vuelvo a intentar en N s…», con la cuenta atrás, y el botón **Cancelar**;
   - si cambian el código o el nombre, se cancela la espera;
   - si a la tercera sigue `OCUPADO`, el texto de hoy, con Entrar a mano.
   - Los textos van en `textos.ts` y en el Apéndice A de 06.
4. **Documentación.**
   - 13 §2: el día del lanzamiento, abrir la entrada **antes** de dar el código. Con la entrada abierta entran unas 60 personas por minuto desde la misma wifi.
   - 14 §2: si sale «Mucha gente entrando», no hay que hacer nada: la app lo vuelve a intentar.

**Tests.**

- **Vitest de la Function:**
  - con la entrada abierta (RPC simulada), el intento 11 y el 60 pasan y el 61 recibe `OCUPADO`;
  - sin ella, el 11 recibe `OCUPADO`;
  - la RPC de la entrada se llama una vez por minuto, no en cada intento;
  - si falla, se aplica el tope de 10.
- **e2e:**
  - `OCUPADO` con `reintentar_en_s: 1` y después éxito → entra sin pulsar nada;
  - tres `OCUPADO` seguidos → el texto final y Entrar a mano;
  - Cancelar para la espera.

---

## 4. RV-492 · Editar: la versión tiene que ser la misma, no solo no más nueva · P2

**Qué pasa.**

- `fn_editar_punto` rechaza con `PUNTO_CAMBIADO` solo si `datos_cambiados_en > version` (`0048:437-438`).
- El disparador pone `datos_cambiados_en := now()`, que es la hora en que **empezó** la transacción, no la de su commit.
- **Así se pierde un cambio:**
  1. Una transacción C empieza antes que otra B, pero hace commit después.
  2. La marca de C queda **anterior** a la de B.
  3. Quien abrió el punto después de B y guarda con la versión de B no ve el cambio de C: `T_C > T_B` es falso, y lo pisa.
- El margen es de milisegundos, pero existe.

**Solución (migración `0049`).**

- En `fn_editar_punto`: `date_trunc('milliseconds', p.datos_cambiados_en) is distinct from date_trunc('milliseconds', version)`, en vez de `>`.
- Si la Cola (`fn_aplicar_propuesta`) compara con `>` contra `creada_en` (otra cosa, una marca de la propuesta), se queda como está. Revisarlo y anotarlo.

**pgTAP:** con una `version` **posterior** a la guardada (el caso C/B, simulado poniendo a mano una `datos_cambiados_en` anterior) → `PUNTO_CAMBIADO`.

---

## 5. RV-493 · Jefatura con otra cuenta de Google (`OTRA_CUENTA`) · P2

**Qué pasa.** Si la fila de un administrador ya está unida y esa persona entra con **otra** cuenta de Google, la Function responde `OTRA_CUENTA`. El panel dice lo mismo que a un desconocido: «Tu cuenta de Google no está en la lista…» (`src/lib/textos.ts:43-44`). La salida existe (otro administrador le quita y le devuelve el acceso, que desune: `0046:155-160`), pero no está escrita en ningún sitio.

**Solución.**

- **Texto propio en el panel:** «Este correo de jefatura ya está unido a otra cuenta de Google. Entra con esa, o pide a otro administrador que te quite y te devuelva el acceso.» Va en `acceso.ts` y en `textos.ts`.
- **13 §2 y 15 §5.5:** el procedimiento, en tres líneas.
- **Test (vitest de `acceso.ts`):** `OTRA_CUENTA` lleva a su texto, y `NO_ES_ADMINISTRADOR` al de siempre.

---

## 6. Documentación del piloto

### RV-494 · 10: casos de aceptación de `docs/35` y `docs/36` · P1

Para que la validación (#76) y el piloto (#77) comprueben lo que cambió:

- **AC-102:** al «Revocar todos», la casilla «Abrir la entrada 24 h» aparece **sin marcar**.
- **Casos nuevos:**
  - «revocar desde» (por defecto hace 24 h, la cuenta antes de confirmar, nada si son 0);
  - la mitad del tope para los móviles nuevos;
  - los avisos técnicos (activar en Ajustes, llega uno);
  - `PUNTO_CAMBIADO` con «Ver lo nuevo»;
  - `CUENTA_MEZCLADA` y `OTRA_CUENTA`;
  - el código pegado o sugerido;
  - la entrada con 20 móviles a la vez desde una wifi, con la entrada abierta (RV-491).
- La cabecera de 10, al día.

### RV-495 · 03, 05 y 11: límites y números · P1

- **03:** filas TR con los topes que hoy solo están en 05 §2:
  - 60 propuestas por móvil y día;
  - 600 del grupo;
  - 150 fotos del grupo en 24 h;
  - 6 reservas abiertas;
  - 10 propuestas por móvil nuevo y día, y la mitad del grupo para los nuevos;
  - 800 MB de fotos y 400 MB de base de datos.

  Cada fila remite a 05 §2 como fuente de los números. TR-41: «en un minuto», como dice la app, no «30 s».
- **05:** versión nueva en la cabecera, con `docs/35` y `docs/36` (DEC-197 a DEC-208) y «aprobada por el desarrollador al pedir el cambio».
- **11:**
  - «cinco capas» (`:60`, `:388`) pasa a decirse sin número, porque hoy son 1 a 6 más 3b (DEC-195);
  - «reserva 41» (`:207`) pasa a decir «la reserva siguiente al tope».

### RV-496 · 13 y 14: los manuales del piloto · P1

- **14** (voluntario):
  - la cabecera, al día;
  - §2: «Mucha gente entrando» (RV-491) y «demasiados intentos», con la hora a la que se puede volver a probar (no «esperar una hora»);
  - el tope de los móviles recién entrados (la propuesta se queda guardada);
  - `14:230`: «Sincronizar» está en la fila «Mapa sin cobertura» de Ajustes o en la píldora de la cabecera, no en «Ajustes → Puntos guardados».
- **13** (jefatura):
  - el día del lanzamiento (RV-491);
  - `OTRA_CUENTA` (RV-493);
  - activar los avisos técnicos, que vienen apagados;
  - tras la primera entrada al panel, volver a entrar en los demás dispositivos (DEC-206).

### RV-497 · Lo demás de la documentación · P3

- **01 FR-164 y 02 FL-34:** los avisos técnicos (DEC-202).
- **`entornos.md`:** las variables `PROPIETARIO`, `VITE_MAPABASE_URL`, `VITE_MAPABASE_URL_STAGING` y `VITE_MAPABASE_URL_PROD`.
- **12:**
  - la tabla «Índice por documento afectado» con DEC-157 a DEC-211;
  - en DEC-199 y DEC-201, «03 v1.6» pasa a decirse sin número de versión (DEC-195);
  - «44 migraciones» (`12:786`), sin número.
- **`docs/verificacion/revision-36.md:97-98`:** RV-481 a RV-483 ya están hechos.
- **`docs/capturas/01..10.png`:** son del 22 de septiembre y solo los enlaza su LEEME. Se regeneran con `npm run capturas` o se borran con su LEEME (DEC-195).

---

## 7. RV-498 · Los bajos, como issues `tras-piloto`

Una issue por línea, con la etiqueta `tras-piloto` y un título neutro (DEC-205 punto 3). Se enlazan desde el registro. **No se implementan.**

**Campo:**

1. El aviso de versión no deja hueco para el indicador de inicio del iPhone fuera de las pantallas con barra (`AvisoVersion.tsx:140`).
2. Anillo de foco sobre `bg-marino-700` en claro (`AvisoVersion.tsx:165`, `index.css:297-300`).
3. El tope de móviles nuevos dice «mañana» aunque se pueda antes (`textos.ts:572`).
4. Un 4xx al subir una foto se trata como «servidor caído», sin fin (`cola.ts:513`).
5. IndexedDB sin tiempo máximo al abrir (`bd.ts:37`).
6. El mapa sin conexión borrado por el sistema durante la sesión no se detecta (`mapabase.ts:54-63`).
7. Mis propuestas con el token revocado: error genérico y no lleva a la entrada (`MisPropuestas.tsx:117`).
8. Dos ventanas procesan la misma cola (sin `navigator.locks`).
9. Un mensaje largo pegado puede perder cifras por `maxLength` (`Entrada.tsx:129`).

**Panel:**

10. La fecha más antigua que ofrece «revocar desde» se rechaza (`Ajustes.tsx:406`).
11. Salud no se recarga tras revocar (`Ajustes.tsx:874`).
12. La ventana de cambiar el código se puede cerrar mientras guarda (`Ajustes.tsx:227`).
13. «Añadir» administrador deshabilitado sin motivo (`Ajustes.tsx:576`).
14. Zonas de toque de menos de 44 px (`Inventario.tsx:663`, `Registro.tsx:160`, `Ajustes.tsx:588`, `:180`).
15. Tras «Ver lo nuevo», lo escrito en un campo oculto no se ve (Fallo con estado no «No funciona»).
16. Tras «Ver lo nuevo», la posición propia del pin no se puede recuperar.
17. Dos «Ver lo nuevo» con efectos distintos (`EditarPunto.tsx:732-741` y `:785`).
18. El Registro enseña claves crudas en `workflow_lanzado`, `exportacion` y `anonimizacion`.
19. «Se revocarán N móviles» cuenta tokens, no móviles (`fn_contar_desde`).

**Servidor:**

20. Dos primeras entradas a la vez pueden deshacer una unión buena (`vincular-jefatura.ts:158-175`). `fn_desvincular_administrador` sin comprobar el usuario.
21. Hay un hueco entre la unión y el cierre de las demás sesiones (`vinculado_en` antes del logout).
22. Los intentos frenados bloquean la fila de `avisos_tecnicos` (`0048:171-173`).
23. Los avisos técnicos llegan a administradores sin unir (`0045:386`).
24. IPv6 por /48 también en el tope de altas por wifi.
25. Se puede saltar la mitad para móviles nuevos esperando 24 h.

**CI:**

26. `psql` del seed de staging sin `VERBOSITY=terse` (`deploy-staging.yml:153-154`).
27. La service role de producción va a una URL que sale de una variable del repositorio (`vigilancia.yml:185`, `despachador.yml:54`).
28. «Desunida» se pierde si el paso se corta por tiempo (`revisar-uniones.sh:37-42`).
29. Trabajos sin `timeout-minutes` o sin `concurrency` (`mantener-activo.yml`, `release-please.yml`, `comprobar-produccion.yml`).
30. Búsqueda de issue por título sin filtro exacto (`canario-ubuntu.yml:62`); la issue del respaldo de staging no se cierra sola.

---

## 8. RV-499 · Cierre

- **RV-139b** sobre el commit final.
- **Recorrido corto con `revisar-pantallas`:**
  - la entrada con `OCUPADO` simulado: espera y reintento solo, y Cancelar;
  - el texto de `OTRA_CUENTA` (simulado).
- **Publicar 0.15.0** con `npm run publicar -- --solo-comprobar` y después `npm run publicar`.
  - Comprobar en el registro de la ejecución de `deploy-prod` que `comprobar-dist.sh` ha pasado.
- **Archivar:** este documento a `docs/archivo/especificaciones/`, con su fila en `INDICE.md`, y la nota de §0.3 en `docs/36`.

## 9. Checklist

- [ ] Un `dist` con `_worker.js`, `functions/`, `_routes.json`, `_redirects`, un `_headers` cambiado, un archivo inesperado o un enlace simbólico no se despliega.
- [ ] Con la entrada abierta entran 60 por minuto desde una wifi, y la app vuelve a intentarlo sola.
- [ ] Editar rechaza cualquier versión distinta.
- [ ] `OTRA_CUENTA` tiene su texto y su procedimiento.
- [ ] 10, 03, 05, 11, 13 y 14 al día.
- [ ] Los 30 bajos, como issues `tras-piloto`.
- [ ] 0.15.0 en producción, con `comprobar-dist` en verde. Este documento, archivado.

## 10. Fuera

- Todo lo de §7: después del piloto.
- **Lo que hacen personas** (DEC-193, issues `organizacion`):
  - el desarrollador da de alta a jefatura en staging. Ninguna cuenta está unida todavía ni en staging ni en producción;
  - jefatura pone el código del piloto, activa los avisos técnicos y abre la entrada antes de dar el código;
  - #76 a #85;
  - el iPhone y el marcador a pleno sol;
  - el sobre.
