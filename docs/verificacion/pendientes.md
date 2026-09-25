# Verificación · Lo pendiente de docs/21 y el mantenimiento (docs/22)

**Estado: hecho el 25 sep 2026, en staging y en producción (0.6.4).** Quedan las comprobaciones del 27 y 28-09 y los pasos del desarrollador (§3).
Especificación: `docs/22-pendientes-y-mantenimiento.md`, que recoge lo que quedaba de `docs/21`.
Tres sesiones en paralelo, coordinadas en #362. Los registros de cada sesión son
`pendientes-frontend.md`, `pendientes-backend.md` y `pendientes-ops.md`. Las herramientas de Claude
Code de `docs/21` (SK-01 a SK-03) se hicieron antes: #356, #358 y #360 (DEC-114 a DEC-116).

## 1. Qué se ha hecho

| Punto | Sesión | PR | Prioridad |
|---|---|---|---|
| RV-81 · activar los avisos dice qué ha fallado | Frontend | #376 | P0 |
| RV-82 · controles del mapa y «Cercanos» | Frontend | #381, #385 | P0 |
| RV-84 · las suscripciones se guardan de verdad y no se pierden por fallos pasajeros | Backend | #368 (migración 0030) | P1 |
| RV-86 · integración de los avisos con un servidor de push falso | Backend | #377 | P1 |
| RV-92 · tareas programadas en vivo en Salud del sistema | Backend y Frontend | #375 (migración 0031) · #387 | P1 |
| RV-89 · Actions fijo en `ubuntu-24.04` y canario de Ubuntu 26 | Ops | #365 | P1 |
| RV-83, RV-85 y RV-87 | Frontend | #383 | P1–P2 |
| RV-88 · capturas de pantallas en cada PR | Frontend | #385 | P2 |
| RV-90, RV-93 y RV-94 | Ops | #370 | P2 |
| RV-91 · tres huecos de los hooks | Ops | #367 | P2 |

- **Decisiones:** DEC-118 a DEC-120 y DEC-132 (Backend), DEC-122 a DEC-126, DEC-136 y DEC-137 (Frontend), y DEC-128 y DEC-129 (Ops).
- **Migraciones:** 0030 y 0031. Las dos están aplicadas en staging y van a producción con P-12.
- **Lo más importante que salió:** guardar una suscripción push **nunca había funcionado en el servidor**, ni en staging ni en producción. Las dos RPC chocaban con `42702 column reference "suscripcion" is ambiguous` en su `on conflict`. Ningún pgTAP las llamaba y los e2e simulaban la RPC. Es la otra mitad de la incidencia «Avisos quedan desactivados», y la arregla 0030 (Backend, DEC-118).

## 2. Checklist de docs/22 §5

- [ ] **RV-81 en el Android del desarrollador:** activar los avisos funciona, o dice exactamente por qué no. Queda para él (§4.3). La activación puede funcionar desde que 0030 está en staging.
- [x] **RV-82:** hay captura a 412 × 915 en el PR (#381), con los controles alineados al borde y «Cercanos» abajo a la derecha.
- [x] **RV-83, RV-85, RV-87 y RV-88,** fusionados con su test. RV-85 no tenía avería: su e2e es de protección (DEC-124).
- [x] **RV-84 y RV-86:** pgTAP (`27_suscripciones_duenios`, 31 casos) e integración, en verde en `ci-sql`.
- [ ] **Una notificación real llega al Android** tras aprobar una propuesta suya en staging. Queda para el desarrollador.
- [x] **RV-89:** no queda ningún `ubuntu-latest`. El canario de Ubuntu 26 corrió en verde el 25-09 (run 36124034908), antes del 19-10.
- [x] **RV-90:** `npm test` no deja archivos, y el paso de CI se puso en rojo en una rama de prueba (run 36125625135).
- [x] **RV-91:** los tres huecos están bloqueados y probados (42 casos de `probar-hooks.ts`).
- [ ] **RV-92 en producción:** `purgar_intentos` de hace menos de 1 h, con «Ahora mismo». 0031 ya está en producción. Falta mirarlo en Salud del sistema con una sesión de jefatura, que Claude Code no abre.
- [x] **RV-93:** hay dos pasadas de vigilancia al día, y #342 se cerró sola con la vigilancia programada del 25-09 (run 36138075138, hacia las 13:00 UTC).
- [ ] **RV-94:** «Almacenamiento usado» con dato en producción, y la primera purga revisada.
  - El ensayo del 25-09 (run 36125628694) anotó 0 bytes: el bucket de producción está vacío. Desde #387 la pantalla enseña 0 en vez de «sin dato».
  - La primera purga programada es el lunes 28-09. Hará ensayo y abrirá su issue (DEC-129).
- [x] **P-12:** producción en la **0.6.4** el 25 sep 2026 a las 15:18 UTC (#390, run 36141770642), con 0030 y 0031 y la paridad en verde. Registro en `paridad-produccion.md`.
  - [ ] Queda comprobar el respaldo del 27-09 y la purga del 28-09, después de esas fechas.

## 3. Lo que queda para personas (docs/22 §4)

1. **En el Android con staging:** Ajustes → Avisos → activar.
   - Anota en DEC-122 el texto que salga, o que quedó activado, y mira si hay un error `push:*` nuevo en Salud del sistema.
   - Si dice que los avisos están bloqueados: Ajustes de Android → Aplicaciones → la PWA → Notificaciones.
2. **Lunes 28-09:** en Salud del sistema de producción, «Último respaldo» del 27-09, y la issue de la primera purga.
3. **Antes del piloto (#77):** cerrar la incidencia de staging y rechazar las 8 propuestas de prueba.
4. **P-12:** las dos aprobaciones de producción.
