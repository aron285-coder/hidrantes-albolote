# Registro de `docs/39` · Antes del piloto, tras la revisión del 16 oct 2026

Una línea por PR: qué entró, el test que falló antes y el PR. Hasta que 0.16.1 esté en producción, RV-515 solo dice
«avisos push: comprobaciones del destino y tope por móvil» (`docs/39` §0.7).

- **RV-513:** 12 v1.68 con DEC-216 a DEC-223 (DEC-218 con texto neutro hasta 0.16.1) y sus filas del índice;
  `docs/40` en DEC-193, DEC-196, DEC-205, DEC-209 y DEC-212. CLAUDE.md §5 (`docs/39` como cuarta excepción y la línea
  de DEC-217), la skill `paquete-rv` y 09 §8. Issues: #811 a #825, una por punto; los 27 bajos de §0.6, #826 a #852,
  con `tras-piloto`. El documento, en `.git/info/exclude` hasta 0.16.1. Sin test: solo documentación.
- **RV-514:** `revision-completa-staging.md` con la sección «Desde `docs/39` (DEC-217)»: qué lee, el móvil de prueba
  «Prueba RV-139b» revocado al acabar con `fn_revocar_dispositivo`, la transacción con `rollback` y lo que no hace.
  La comprobación (fuera de Git, como siempre) se rehízo así: sin alta ni fotos ni canjes, las llamadas que escriben
  cortadas en el navegador, y la escritura de jefatura en una transacción que se deshace. Bocas de las comprobaciones
  de antes, retiradas en staging como jefatura (`fn_retirar_punto`, motivo «[PRUEBA] alta de la comprobación en
  staging (RV-139b)»): **BOC-0007, BOC-0008, BOC-0009, BOC-0010, BOC-0011, BOC-0012, BOC-0013, BOC-0014, BOC-0015,
  BOC-0016 y BOC-0017** (las once, `[PRUEBA] RV-139b alta …`; traspaso 38867050886, borrado). Consulta de solo lectura
  con la condición de `promover-piloto` (`situacion = 'activo'`, `CONDICION_PUNTOS`) sobre esos códigos: **0**.
  #651, cerrada. Sin test de código: es un procedimiento y una limpieza.
- **RV-515:** avisos push: comprobaciones del destino y tope por móvil (migración `0050`, DEC-218; pgTAP
  `47_avisos_push_destino_y_tope`, `functions/_lib/destino-push.test.ts` y `functions/api/push.test.ts`, que fallaban
  antes). 05 v1.6 y 11 v1.8.
  - Con 0.16.1 en producción, DEC-218 tiene su texto completo en 12 y este documento entra en Git (RV-516, §0.7).
- **RV-516:** `arranque` enseña la cadena de `hidrantes_migrador` **una vez** al crearla o rotarla (`--rotar db`), con
  el mismo patrón que la clave privada del respaldo (`ensenarCadenaMigrador`): nunca a un archivo, al registro ni a un
  argumento; sin terminal no sale y dice cómo repetirlo. `restaurar` la pide diciendo que está en el sobre. Tests que
  fallaban antes: los tres de «la cadena del migrador, en el sobre» de `scripts/arranque.test.ts`. 15 v1.7 (§2, §5.3
  paso 4, §9), 04 v1.7 (§5), 11 v1.9. `docs/39-revision-tras-38.md` entra en Git y DEC-218, con su texto completo (12
  v1.69).
- **RV-517:** la base de datos vigila las tareas (migración `0051`, DEC-220): clave `tareas_paradas` con su texto fijo,
  `fn_vigilar_tareas` y la tarea `hidrantes_vigilar_tareas` (08:00 UTC), también en `scripts/sql/tareas-esperadas.txt`;
  Salud la nombra «Vigilar las tareas automáticas». Tests que fallaban antes: pgTAP `48_vigilar_tareas` y
  `04_concurrencia_y_tareas` (nueve tareas). 04 v1.8, 05 v1.7, 06 (Apéndice A), 13 v0.6 y 15 v1.8.
- **RV-518:** `deploy-staging.yml` y `deploy-prod.yml` migran con `--entorno staging` / `--entorno prod`;
  `scripts/comprobar-cadena.ts` (nuevo) como primer paso con la base en el seed de staging, `purgar-fotos.yml` y los dos
  trabajos de `respaldo.yml`; `guarda-produccion.ts` exige `REFS.prod`. Tests que fallaban antes: los de «la guarda de
  proyecto en los workflows» de `scripts/workflows.test.ts`, `scripts/comprobar-cadena.test.ts` y «todo coherente, pero
  del proyecto de staging» de `guarda-produccion.test.ts` (que pasa a usar `REFS.prod`). 04 v1.9.
- **RV-519:** issue `organizacion` #858 («Antes del piloto: la clave del respaldo y las cadenas del migrador, en la
  agrupación»), con los pasos y enlazada desde #77; 15 v1.9 §2 dice quién las tiene hoy (el desarrollador; las
  cadenas, nadie); 09 §8, en «Queda». Sin test: lo hacen personas.
- **RV-520:** con un formulario abierto, revocar el acceso ya no salta a la entrada (`src/lib/formulario-abierto.ts`,
  `accesoCaducado` en el acceso del voluntario): el formulario lo dice, «Guardar en el móvil» lo deja en la cola, la
  pantalla de resultado dice que se enviará al volver a entrar, y la entrada sale al cerrarlos; al volver a entrar, la
  suscripción a los avisos se rehace al momento (`resincronizarPush(…, forzar)`). Tests que fallaban antes: los tres de
  «el formulario no se pierde al revocar el acceso» de `acceso.test.ts`, «con forzar» de `push.test.ts` y el e2e nuevo
  `e2e/formulario-revocado.spec.ts`. 01 v1.17, 02 v1.14, 06 (Apéndice A), 14 v0.3.
- **RV-521:** con algún envío con `fallo`, la pastilla dice «N con error» (o «N con error · M sin enviar») en
  `tinte-rojo`, sale el aviso «Un envío no se ha podido hacer. Mira Mis propuestas.» y la hoja de la sincronización lo
  cuenta igual; `/mis-propuestas` deja entrar a jefatura y le enseña solo su cola (Reintentar, Descartar). Tests que
  fallaban antes: los de «los envíos con error, a la vista» de `BarraEstado.test.tsx` y el e2e nuevo
  `e2e/envios-con-error.spec.ts` (voluntario y jefatura en el móvil). 01 v1.18, 02 v1.15, 06 (Apéndice A), 14 v0.4.
- **RV-522:** el filtro en oscuro (el chip y el radio elegidos en `--anillo-seleccion`; «Listo» con borde `--texto`),
  el código del alta aprobada (`coincide` recibe los puntos y busca por `codigoCola`; el título y el `aria-label` del
  detalle lo dicen) y el respaldo de staging en Salud (como producción: «todavía ninguno» y aviso; fuera
  `respaldoNoAplica`). Tests que fallaban antes: el e2e nuevo `panel-filtros-oscuro.spec.ts`, el de `coincide` de
  `cola.test.ts`, el e2e «buscar el código del punto creado» de `panel-cola.spec.ts`, y `salud.test.ts` y el de RV-78
  de `panel-ajustes.spec.ts`, que cambian (los e2e se construyen como staging; `panel-ajustes` y `panel-simulado` llevan
  ya un respaldo reciente). 06 v1.35.
- **RV-523:** Editar enseña las fotos del punto (conexión y sitio, solo lectura, se amplían; si no cargan, el texto)
  con `FotoPanel`, la pieza que ahora comparte con la cola (`UnaFoto` sale de `DetallePropuesta`); en el mapa del
  Inventario, tocar un punto abre Editar. Tests que fallaban antes: el e2e nuevo `e2e/inventario-fotos.spec.ts` (412,
  820 y 1.280; una sola foto a todo el ancho; la que no carga; la lista no pide ninguna; el mapa abre Editar). 01 v1.19,
  06 v1.36, 13 v0.7.
- **RV-524:** «Hidrantes test» en staging (manifiesto `name` y `short_name`, `<title>`, `apple-mobile-web-app-title` y la
  cabecera del panel); producción y local, «Hidrantes». La función vive en `src/lib/nombre-app.ts` y no en `config/`:
  `src` no puede importar de `config/` (`tsconfig.app.json`) y `vite.config.ts` ya importa de `src/lib`; decisión de
  bajo riesgo, anotada aquí. `deploy-staging.yml` comprueba «Hidrantes test» en el `dist` y `deploy-prod.yml` se para si
  lo lleva; `docs/entornos.md` (y su plantilla en `arranque.ts`) con la columna «App». Como `chore(staging)`: no sale en
  las Novedades de producción. Tests que fallaban antes: `src/lib/nombre-app.test.ts`, los dos de
  `scripts/workflows.test.ts` y `e2e/armazon.spec.ts` (título, nombre de iPhone y manifiesto). 04 v1.10, 06 v1.37,
  13 v0.8, 14 v0.5.
- **RV-525:** la documentación, al día con la app, cada corrección con la línea del código que la respalda. 14 v0.6
  (leyenda sin tachado, Barro y No funciona como en 06 §4.3; la foto opcional en Corregir datos; «sin conexión · hace N»;
  la barra «Hay una versión nueva»); 13 v0.9 (la fecha en rojo; «En el móvil» de §4 y §5; lo que no se puede usar en
  staging); 10 v1.9 (los AC que estaban mal hoy, y AC-185 a AC-191 nuevos); 01 v1.20, 02 v1.16, 03 v1.11 (TR-21: 768,
  1.100 y 1.600 px); 06 v1.38 sin literales que ya no existen. `textos.test.ts` comprueba también al revés (cada literal
  del Apéndice A está en `textos.ts`, con `[…]` como hueco, o en la lista cerrada de textos del servidor, cada uno con su
  motivo); fallaba antes con los tres literales viejos. CLAUDE.md y `revisar-pantallas` con los tamaños de
  `vistas.spec.ts`; 09 §3, los dos riesgos al resumen semanal; INDICE, la fila de `docs/38` en las archivadas.
- **RV-526:** el panel en el móvil ya no se salta en `controles`, `accesibilidad` y `degradacion` (412 × 915: los menús
  se abren con las pestañas de abajo, el Inventario se mide en filas y no en tabla, y los botones de toda la fila no
  cuentan en la geometría); pasan en los dos proyectos. pgTAP `49_rpc_sin_prueba_propia` (12): `fn_guardar_direccion_sugerida`
  (solo jefatura, recortada, en blanco → sin dirección, 300 como mucho, una decidida no cambia) y
  `fn_borrar_suscripcion_push` (token que no vale → error; borra solo las de ese móvil). Corrió en `ci-sql` (sin Docker en
  local).
- **RV-527 (RV-139b):** verde sobre `cdfc27a` con la regla de DEC-217 (nada escrito en staging; el móvil de prueba,
  revocado). Recorrido corto sin nada que corregir. En las PR de RV-526 se arreglaron dos tests que fallaban solo en CI
  con el panel en `movil`: el menú de Exportar se cerraba al enfocar un elemento (ahora `preventScroll`) y `controles`
  lleva cada control al centro antes de pulsarlo.
- **RV-527 (cierre):** 0.17.0 en producción (`0ab153d`, deploy 38905909640) con `npm run publicar`; la primera pasada
  se paró en `ci-sql` del PR `develop → main` por el límite de Docker, se relanzó ese trabajo. Producción dice «Hidrantes»;
  la vigilancia ya encuentra `hidrantes_vigilar_tareas` en producción y staging, y avisa de que aún no ha corrido (#874, se
  cierra sola tras su primera vuelta; el aviso de más, #876 `tras-piloto`). Los 27 bajos, #826 a #852 (`tras-piloto`).
  `docs/39` archivada con `git mv` y su fila en la tabla de archivadas de `INDICE.md`.
