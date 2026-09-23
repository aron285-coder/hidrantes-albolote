# Verificación · Segunda revisión (23 sep 2026) · bloque B (P1)

**Estado: hecho el 23 sep 2026.** Especificación: `docs/18-cambios-revision-2-y-mapa.md` §2. El
bloque A está en `revision-2-p0.md`. Como en A, cada test de regresión se vio fallar sobre `develop`
antes del arreglo.

## 1. Qué se ha hecho

| RV | Issue · PR | Qué | Tests que lo prueban (rojos antes del arreglo) |
|---|---|---|---|
| 44 | #230 · #254 | Sin config guardada (jefatura) no se re-deriva con la de por defecto, ni al arrancar ni al cambiar el día | `puntos.test.ts` (2 rojos) |
| 45 | #231 · #254 | `fn_listar_puntos` con 10 minutos de solape (0025). `puntos.ts` con generación: cerrar sesión durante una sincronización no escribe ni publica | `10_sincronizacion.test.sql`; `puntos.test.ts` · cerrar sesión durante una sincronización (rojo) |
| 46 | #232 · #255 | La promoción aborta con los códigos que producción ya tiene con otro id, y los nombra. Puntos con `on conflict (id)` y `actualizado_en = now()`, y época nueva en la misma transacción | `promover-piloto.test.ts` (4 rojos) |
| 47 | #233 · #258 | Novedades solo de ámbitos de cara al usuario, sin rutas ni códigos internos y cortadas a 140 (DEC-091). CLAUDE.md §5 pide escribirlas así | `generar-novedades.test.ts` (5 rojos); e2e `mapa.spec.ts` (de 1 a 3 líneas, sin rutas) |
| 48 | #234 · #259 | Reserva de al menos un día y purga de al menos dos. Una fila por IP, tope y minuto en `intentos_codigo`. `lock_timeout` en `fn_renombrar_nucleo` (0026). `normalizarIp` con cubo `invalida` y la IPv4 mapeada en hexadecimal. Clave de caché de `/api/direccion` con el origen de la petición | `23_limites_y_defensas.test.sql`; `verificar-codigo.test.ts` y `direccion.test.ts` (3 rojos) |

- **Migraciones nuevas:** 0025 y 0026, con las mismas firmas. 0026 vuelve a crear `fn_proponer` desde la de 0023, que ya rechaza el cambio de tipo, y `fn_verificar_codigo` desde 0015.
- **Decisiones:** DEC-091.

## 2. Cómo se comprobó

- CI completa en verde en cada PR antes de fusionar, y staging desplegado tras cada fusión.
- Las migraciones se fusionaron en orden: 0024, 0025, 0026.
- En local: typecheck, lint, prettier y vitest completo. Los e2e de novedades, en Chrome.

## 3. Qué queda

Nada de este bloque. El PR a `main` (#79) espera al piloto (#77) y a la validación de jefatura (#76).

## 4. Suposiciones tomadas

- **RV-44 y RV-45** van en un solo PR, porque tocan el mismo sitio de `src/lib/puntos.ts`.
- **RV-45:** si la generación cambia mientras se escribe en IndexedDB, se deshace lo escrito (`borrarTodo`). No basta con no publicarlo.
- **RV-47:** `acceso`, `mantenimiento`, `capturas`, `piloto`, `ci` o `sql` no están en la lista de ámbitos. Las novedades de hoy salen de `diseño` y `mapa`.
- **RV-48:** el cubo `invalida` es el mismo para toda IP imposible. Solo importa que no se mezcle con ninguna IP de verdad.
