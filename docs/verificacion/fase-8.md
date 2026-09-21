# Verificación · Fase 8 · Calidad, respaldo y observabilidad

**Estado: terminada el 21 sep 2026.** El criterio de salida se cumple entero salvo dos cosas que no
dependen del código y quedan anotadas en §6: la prueba de carga en un móvil real (TR-12, esperando a
que staging salga del bloqueo de DEC-061) y los tres días seguidos de vigilancia en verde, que se
cumplen solos a partir de hoy (§2, última fila).

Lo que distingue a esta fase de las anteriores: casi todo lo que hay aquí **se ha ejecutado de
verdad**, no solo escrito. El respaldo corrió contra producción, la restauración se ensayó sobre una
base vacía, las ocho pruebas de intrusión se lanzaron con la `anon key` desde fuera, los tiempos de
3G se midieron con el navegador frenado y la vigilancia abrió y cerró sola su propia issue. Cinco
defectos reales salieron de ahí y están en §5.

## 1. Qué se ha construido

| Pieza | Qué hace |
|---|---|
| `respaldo.yml` | `pg_dump` semanal del esquema `hidrantes` cifrado con GPG (artefacto de 90 días), fotos el primer domingo de mes, `config.ultimo_respaldo` y `config.storage_bytes` en Salud del sistema, issue `vigilancia` si falla |
| `scripts/restaurar.ts` · `scripts/restaurar-fotos.ts` | restauración sobre una base limpia: solo el esquema `hidrantes`, en una transacción, con confirmación escrita y guarda de `PROJECT_REF`. Es el procedimiento de 15 §5.3 y §5.6 |
| `scripts/arranque.ts --rotar` | rotación de secretos uno a uno o en lista (`--rotar db,gpg`) |
| `scripts/intrusion.ts` | las ocho pruebas de TR-40 con la `anon key` desde fuera; resultado con fecha en 11 §5; en `ci-sql` |
| `scripts/compatibilidad.ts` | el frontend publicado contra la base ya migrada, con sus propios casos de integración; en `ci-sql` cuando la rama toca migraciones |
| `vigilancia.yml` | comprobación diaria (app en producción y staging, RPC de lectura, respaldo < 8 días, avisos push atascados), issue automática y **cierre automático** cuando todo vuelve a responder |
| `e2e/integracion/fase8.spec.ts` | el camino crítico entero contra la pila real, con el voluntario y jefatura en dos navegadores |
| `e2e/rendimiento.spec.ts` · `src/lib/rendimiento.test.ts` | presupuesto de TR-10, TR-13 y TR-14 con 3G simulada por CDP |
| `e2e/accesibilidad.spec.ts` · `src/lib/accesibilidad.test.ts` | axe (WCAG 2.1 A y AA) sobre las pantallas montadas y contraste medido sobre los tokens de verdad |
| `e2e/cabeceras.spec.ts` | cabeceras de TR-100, CSP sin violaciones e instalabilidad, con un navegador sobre lo desplegado |
| `e2e/degradacion.spec.ts` | FR-168 de punta a punta y la banda de almacenamiento de Salud del sistema |
| Migraciones **0010** y **0011** | acción `restauracion_respaldo` en el registro; `fn_salud` devuelve `ultima_vigilancia` y `vigilancia_ok` |

## 2. Criterio de salida (copiado de 09)

> CI verde con las tres capas; un respaldo restaurado con éxito; las ocho pruebas de intrusión
> fallando como se espera; presupuesto de rendimiento y Lighthouse cumplidos; cabeceras A;
> `vigilancia.yml` ha corrido en verde tres días seguidos; la prueba de degradación pasa.

| Parte | Cómo se ha comprobado | Resultado |
|---|---|---|
| CI verde con las tres capas | `ci-calidad`, `ci-sql` y `ci-e2e` en cada PR de la fase | ✅ 1 049 unitarios, 236 pgTAP, 125 e2e simulados y 8 de integración real |
| Un respaldo **restaurado** con éxito | ensayo completo sobre una base vacía con el volcado cifrado de verdad: importar la clave, descifrar, vaciar el esquema, restaurar en transacción y comprobar recuentos y permisos | ✅ (tres defectos por el camino, §5) |
| El respaldo corre de verdad | `respaldo.yml` lanzado a mano contra producción el 21 sep 2026 (run 35575039376): artefacto `respaldo-hidrantes` de 136 KB cifrado, 90 días de retención, `ultimo_respaldo` anotado | ✅ |
| Las ocho pruebas de intrusión fallan | `npm run intrusion` contra la pila local; resultado exacto de cada una, con fecha, en 11 §5 | ✅ las ocho denegadas |
| Presupuesto de rendimiento | `e2e/rendimiento.spec.ts` con 3G simulada (1,6 Mbit/s, 300 ms): primera pantalla útil **2,40 s** (TR-10 < 3 s), ficha **2,56 s** (TR-14 < 3 s); búsqueda sobre 1 000 puntos, mediana de 11 ejecuciones (TR-13) | ✅ |
| Lighthouse | `deploy-staging.yml` sobre staging con los umbrales de TR-103 (85 / 95 / 95) | ✅ los tres umbrales; la instalabilidad pasa a un e2e porque Lighthouse 12 ya no la audita (DEC-074) |
| Cabeceras A | `comprobar-despliegue.ts` desde fuera y `e2e/cabeceras.spec.ts` con un navegador: las de TR-100, la CSP sin `unsafe-eval` ni Nominatim, y cero violaciones al cargar | ✅ |
| Prueba de degradación | `e2e/degradacion.spec.ts`: base de datos caída → puntos guardados + aviso; Functions con 503 → la entrada lo explica y conserva lo escrito; panel igual; ninguna pantalla con jerga | ✅ |
| `vigilancia.yml` tres días en verde | ha corrido de punta a punta el 21 sep 2026: la primera ejecución encontró un problema real (no había respaldo), abrió la issue #133 y salió en rojo; hecho el respaldo, la siguiente **cerró la issue sola** | ⏳ el ciclo entero está probado; los tres días se cumplen solos (cron diario, 07:41 UTC) |

## 3. Casos de 10 ejecutados

- **Camino crítico (AC-01 a AC-08, en integración real):** entrar con el código → alta con el pin
  movido a mano y foto por URL firmada → jefatura aprueba escribiendo la dirección → el punto sale
  en el mapa y en la lista del voluntario → retirada → papelera → restauración, con el registro
  contando la historia entera sin huecos.
- **Rendimiento (TR-10, TR-13, TR-14):** medidos, no estimados; números arriba.
- **Accesibilidad (TR-30, TR-31, TR-32):** axe sin violaciones en entrada, mapa, lista, alta, mis
  propuestas, ajustes y las dos pantallas del panel; contraste de los tokens en claro y oscuro,
  incluida la cadena de dos saltos del marcador (DEC-072).
- **Seguridad (TR-40):** las ocho de 11 §5, ejecutadas y documentadas con su respuesta exacta.
- **Continuidad (TR-50, TR-51, TR-52):** respaldo real, restauración ensayada, marcha atrás del
  frontend por CLI ya probada en fases anteriores.
- **Degradación (FR-168) y cuota (TR-53):** e2e propios.

## 4. Cómo reproducirlo

```
npm test
PW_CANAL=chrome npm run e2e
npm run test:sql
npm run arranque -- --local && npm run build && npm run functions:dev &
npm run probar-functions && npm run intrusion
INTEGRACION=1 PW_CANAL=chrome npm run e2e
npm run compatibilidad -- --forzar
URL_DESPLEGADA=https://hidrantes-albolote-staging.pages.dev npm run e2e -- e2e/cabeceras.spec.ts
```

`PW_CANAL` usa el navegador ya instalado: en este equipo la descarga de navegadores de Playwright
está bloqueada, igual que staging (DEC-061). La base local se queda con datos de las ejecuciones
anteriores; pgTAP los nota (planea sobre una base recién migrada), así que antes de `npm run test:sql`
conviene `npx supabase stop --no-backup && npx supabase start`.

## 5. Defectos reales que salieron al ejecutar (no al escribir)

1. **El respaldo restaurado dejaba a los voluntarios fuera.** `pg_dump --no-privileges` se llevaba
   por delante todos los `grant`: una base restaurada no daba `execute` a `anon` en las nueve RPC del
   voluntario. La aplicación habría arrancado "bien" y nadie habría podido entrar. Se quitó la
   opción.
2. **La restauración no podía crear el esquema.** `hidrantes_migrador` no tiene `CREATE` sobre la
   base (DEC-052): `create schema` daba *permission denied for database postgres*. Ahora se vacía el
   esquema en su sitio en vez de recrearlo.
3. **La clave GPG generada no servía.** openpgp.js 6 con `type: 'curve25519'` emite los algoritmos
   nuevos de RFC 9580 (Ed25519 27, X25519 25) y GnuPG 2.4 los rechaza ("skipped: No public key").
   Se pasó a `type: 'ecc', curve: 'curve25519Legacy'` (EdDSA 22, ECDH 18) y hay un test que falla si
   alguien vuelve atrás.
4. **El respaldo real falló a la primera:** `SUPABASE_DB_URL_PROD` era la conexión directa, que en
   Supabase solo tiene IPv6, y los runners de GitHub no lo tienen (*Network is unreachable*). Se
   añadió una comprobación previa que lo dice con la cadena del *pooler* y el comando de rotación; el
   desarrollador la cambió y el respaldo del 21 sep pasó.
5. **Tres fallos de contraste** que nadie había medido (chip verde 4,17:1, borde del marcador en
   oscuro 1,16:1 y blanco sobre naranja 3,78:1, este último encontrado por axe y no por los tokens):
   DEC-072.
6. **Dos casos de integración se pisaban entre sí** al empezar a correr en paralelo: uno contaba
   todas las filas de `puntos` y otro esperaba un único `role="status"` donde staging pone dos (la
   banda de entorno de pruebas). Los dos, arreglados en su propio PR.
7. **Lighthouse dejó rojo el despliegue de staging** por una auditoría que ya no existe, no por la
   aplicación: DEC-074.

## 6. Lo que queda abierto

- **TR-12 · prueba de carga en un móvil real** (1 000 puntos, ≥ 30 fps, Android de gama media de
  menos de tres años, documentando el dispositivo). Los tres tiempos medibles desde CI (TR-10,
  TR-13, TR-14) están cumplidos; lo que falta es el móvil de verdad, y espera a que staging sea
  accesible (DEC-061), igual que las pruebas pendientes de las Fases 4, 5 y 6.
- **Tres días seguidos de vigilancia en verde.** El ciclo completo está probado hoy (abre la issue
  cuando algo falla, la cierra cuando deja de fallar); solo hace falta que pasen los días. Si alguno
  sale en rojo, habrá una issue con la etiqueta `vigilancia` explicando qué.
- **Sincronización mensual de fotos**: el bucket de producción está vacío mientras no haya piloto, así
  que el camino se ha probado con el script (`respaldo-fotos.ts`, con sus tests) pero todavía no ha
  copiado ninguna foto de verdad. Ocurrirá el primer domingo de mes tras el piloto.
- **La clave privada del respaldo**: **guardada el 21 sep 2026** por el desarrollador, fuera del
  repositorio (15 §5.3), y borrada del directorio temporal donde se generó. Sin ella un respaldo
  cifrado no se puede restaurar: es el único secreto que no se puede rotar sin perder los respaldos
  anteriores. La pública sigue como secreto del repositorio y su huella, en `docs/entornos.md`.
