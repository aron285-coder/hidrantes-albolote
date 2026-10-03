# Verificación · Novedades que dicen lo que cambió, issues que se cierran solas y release sin runs caducados (docs/23)

**Estado: hecho el 25 sep 2026, en staging y en producción (0.6.5).** Queda la GitHub App de RV-97, del desarrollador.
Especificación: `docs/23-novedades-y-limpieza.md`. Dos sesiones (Frontend y Ops), coordinadas en
#393. Registros: `novedades-limpieza-frontend.md` y `novedades-limpieza-ops.md`.

## 1. Qué se ha hecho

| Punto | Sesión | PR | Qué |
|---|---|---|---|
| RV-95 | Frontend | #399 | Novedades versión a versión, de la más reciente a la más antigua: primero las novedades y luego las correcciones, como mucho dos por ámbito y tres en total. Cada línea lleva el número de su versión. Se sigue leyendo el formato viejo `string[]` (DEC-142, FR-167 v1.5) |
| RV-98 | Frontend | #399 | En staging, sin dato: «Almacenamiento usado · no se mide en pruebas» (DEC-143) |
| RV-96 | Ops | #395 | `Closes #` en la plantilla de PR; #326 cerrada (DEC-141) |
| RV-97 | Ops | #397 | release-please con el token de una GitHub App propia, y reserva sin ella (DEC-140) |

- **Decisiones:** DEC-140 a DEC-143.
- **Migraciones:** ninguna.
- **Corrección a `docs/23`:** §1 RV-95 punto 4 nombra `src/componentes/AvisoNovedades.tsx` como lector del JSON. Ese componente enseña el resultado de las propuestas de un voluntario y no lee Novedades, así que no se tocó (DEC-142, punto 8).

## 2. Checklist de docs/23 §4

- [x] **RV-95 en producción:** el código servido de la 0.6.5 lleva `lineas` con su número: `0.6.5 · Las novedades enseñan lo último de cada versión, cada una con su número`, `0.6.4 · Activar los avisos dice qué ha fallado y cómo arreglarlo` y `0.6.4 · Los avisos se activan de verdad y ya no se pierden por un fallo pasajero`. El test del caso de la 0.6.4 está en verde. No se vio en pantalla: hace falta una sesión.
- [x] **RV-98:** en staging, el código servido lleva «no se mide en pruebas» con el mismo criterio de entorno que «Último respaldo». No se vio en pantalla: hace falta una sesión de jefatura.
- [x] **RV-96:** la plantilla usa `Closes #`, #326 está cerrada, y las issues de código ya se cierran solas: #394 al fusionar #395, y #398 al fusionar #399.
- [ ] **RV-97:** fusionado con reserva. **Pendiente del desarrollador:** crear la App (15 §2). La release sin runs «expired» y sin empujón se comprueba en la primera con la App.
- [x] **P-13:** producción en la **0.6.5** el 25 sep 2026 a las 20:28 UTC (#403, run 36184349766), con la paridad en verde. RV-97 quedó **pendiente del desarrollador**: esta release aún necesitó el empujón.
  - Las comprobaciones del 27-09 (respaldo) y del 28-09 (primera purga en ensayo, con su issue) de `docs/22` P-12 siguen pendientes hasta esas fechas.
