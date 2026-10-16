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
