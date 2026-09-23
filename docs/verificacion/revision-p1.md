# Verificación · Revisión de sep 2026 · bloque P1

**Estado: hecho el 23 sep 2026**, salvo lo que depende de un paso manual o del calendario (§3).
Especificación: `docs/17-cambios-revision-2026-09.md`. El bloque P0 está en `revision-p0.md`. Como
en P0, cada test de regresión se vio fallar sobre `develop` antes del arreglo; los de SQL, con un
commit solo de tests y la CI lanzada sobre esa rama (Docker Desktop no arranca en este equipo).

## 1. Qué se ha hecho

| RV | Issue · PR | Qué | Tests que lo prueban |
|---|---|---|---|
| 13 | #170 · #202 | `restaurar.ts` sobre un esquema vivo (secuencias sueltas), auditoría condicional, migra lo que le falte al volcado, `--confirmar` solo en local | `scripts/probar-restauracion.ts` en `ci-sql` (con datos y con un volcado real de 0009), `restaurar.test.ts` |
| 14 | #171 · #203 | IP normalizada (/64 en IPv6), `fn_verificar_codigo` bajo bloqueo consultivo, tope de canjes buenos (150/IP/día, 150/h), topes anotados, alarma en Salud y vigilancia (0015, DEC-086) | `13_codigo_acceso.test.sql` (TR-41, topes, concurrencia con dblink), `verificar-codigo.test.ts` |
| 15 | #172 · #204 | lectura de jefatura por páginas de 1.000 | `puntos.test.ts`, `e2e/integracion/fase7.spec.ts` (1.050 puntos) |
| 16 | #173 · #204 | jefatura confirmada sigue en el panel sin servidor | `acceso.test.ts`, e2e `degradacion.spec.ts` |
| 17 | #174 · #205 (+ #196) | `lock_timeout` de 5 s en las RPC de escritura, lote que omite con `PUNTO_OCUPADO` (0016) | `14_bloqueos.test.sql` (dblink), `11_reservas_y_alta_jefatura.test.sql`, `panel/errores.test.ts` |
| 18 | #175 · #207 | fusión con descripción y recálculo de municipio, núcleo y dirección (0017) | `15_fusion.test.sql`, `panel/cola.test.ts`, e2e `panel-cola.spec.ts` |
| 19 | #176 · #196 | alta de jefatura sin "otra medida" y sin su correo en `autor_*` (0013) | `11_reservas_y_alta_jefatura.test.sql`, e2e `operaciones.spec.ts` |
| 20 | #177 · #208 | novedades desde el build, en la app y en el panel (DEC-087) | `generar-novedades.test.ts`, e2e `mapa.spec.ts` y `panel-ajustes.spec.ts` |
| 21 | #178 · #209 | `config.version_mapabase` tras cada despliegue | `cargar-version-mapabase.test.ts`, paso de `ci-sql` |
| 22 | #179 · #209 | `fn_salud` con tamaño de la base de datos, del esquema y tareas de `pg_cron`; vigilancia las lee y avisa (0018) | `16_salud.test.sql`, paso de `ci-sql` como `hidrantes_migrador`, e2e `panel-ajustes.spec.ts` |
| 23 | #180 · #210 | retirar dice por qué no pudo; correcciones en español (`src/lib/campos.ts`) | `campos.test.ts`, e2e `operaciones.spec.ts` |
| 24 | #181 · #210 | "revisado hace…" en cada fila; tipo, estado y revisión combinables; exportar con búsqueda | `inventario.test.ts`, `exportar.test.ts`, e2e `panel-inventario.spec.ts` (lee el CSV) y `mapa.spec.ts` |
| 25 | #182 · #211 | Nominatim exige `User-Agent` con contacto y usa caché por coordenadas | `direccion.test.ts` |
| 26 | #183 · #211 | el trigger del registro solo admite el texto de la anonimización (0019) | `17_registro_anonimizacion.test.sql` |

Migraciones: **0015** a **0019**, mismas firmas, con `npm run compatibilidad` en cada `ci-sql`.
Decisiones: DEC-086 y DEC-087. Arreglo aparte: #212 (la vigilancia daba por problema un workflow que
aún no ha corrido por calendario).

## 2. Checklist de 17 §13

- [x] Cada RV P0 y P1 tiene su issue cerrada, su PR fusionado y el test de regresión que falló
      antes del arreglo. Excepción: el test de integración de RV-15 (1.050 puntos) no se lanzó en
      rojo sobre `develop`; lo hizo el unitario de páginas.
- [x] `typecheck`, `lint`, `formato:comprobar`, `test`, `build` y `presupuesto` en verde (en
      `ci-calidad` de cada PR; 271,5 kB de JavaScript inicial).
- [ ] `npm run e2e` en verde dos veces seguidas (RV-27): con #213, ensayado con
      `--repeat-each=3 --workers=4`: 587 de 588 (el fallo, un axe por tiempo con la máquina
      cargada; #213 le da margen). Falta verlo dos veces seguidas en CI tras fusionar #213.
- [x] `ci-sql` en verde con la restauración sobre un esquema con datos (RV-13).
- [x] `npm run compatibilidad` en verde tras cada migración (TR-107).
- [x] 05, 06 (Apéndice A), 04, 11, 12 (DEC-082 a DEC-088), 15 y 10 actualizados.
- [ ] `avisos.yml` ha corrido en staging al menos una vez con un aviso real entregado: **pendiente
      del paso manual** `npm run arranque -- --rotar vigilancia`.
- [ ] `vigilancia.yml` enseña tareas, tamaño de la base de datos y workflows vivos: el código está
      (#209, #212); falta la primera ejecución completa en verde tras fusionar #212.
- [x] Nada de nombres, correos ni secretos en issues, PR ni commits (DEC-053). `scripts/docs.test.ts`
      lo comprueba para los correos de `docs/`, `src/` y `e2e/`.

## 3. Qué queda

- ~~Paso manual del desarrollador: `npm run arranque -- --rotar vigilancia` (RV-08).~~ Hecho el 23 sep
  2026. El mismo arranque puso el `User-Agent` de Nominatim con la URL del repositorio (RV-25).
- RV-12: comprobar la cabecera CORS sobre una foto real de staging en el piloto.
- Bloque P2 (RV-27 a RV-32): hecho el 23 sep 2026, #213 a #218 (`revision-p2.md`).
- `docs/17` §12: decisiones que no se han tomado aquí (Turnstile, ensayo real de marcha atrás,
  fecha de revisión de campo, restaurar retirados…).

## 4. Suposiciones tomadas

- RV-13: el volcado "antiguo" de CI es real (migraciones hasta 0009) en vez de un `sed` sobre uno
  nuevo, que `migrar.ts` rechazaría con razón.
- RV-14: los bloqueos no cuentan como fallos; la columna `tope` distingue los de todo el grupo.
- RV-18: sin dirección sugerida, la fusión con la ubicación de la propuesta conserva la dirección
  que había, como `fn_aplicar_propuesta`.
- RV-20: sin paso de CI que compare el JSON de novedades con git (DEC-087).
- RV-22: una tarea semanal que aún no ha corrido nunca no cuenta como problema.
- RV-24: la búsqueda no se anota en el registro de la exportación (la RPC no la admite).
