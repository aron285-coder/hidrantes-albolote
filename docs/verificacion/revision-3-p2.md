# Verificación · Tercera revisión (24 sep 2026) · bloque C (P2)

**Estado: hecho el 24 sep 2026.** Especificación: `docs/19-paridad-avisos-y-revision-3.md` §4 y §5
(RV-68 a RV-70). Los bloques A y B están en `revision-3-p0.md` y `revision-3-p1.md`.

## 1. Qué se ha hecho

| RV | Issue · PR | Qué | Cómo se vio fallar antes |
|---|---|---|---|
| 68 | #289 · #316 | Cinco defensas: el mapa base se valida antes de guardarlo (firma `PMTiles`, versión 3 y tamaño ±1 %); las suscripciones push solo a los servicios de los navegadores (migración **0029**, `fn_validar_suscripcion` con la misma firma); la purga de fotos no se para con un número redondo si `total` cuadra; en Novedades, el filtro va antes del corte; `comprobar-auth` informa de `security_manual_linking_enabled` | `mapabase.test.ts` (3), `purgar-fotos.test.ts`, `generar-novedades.test.ts` y `comprobar-auth.test.ts` rojos sobre `develop`; pgTAP `26_suscripciones_push.test.sql` con cinco servicios válidos y cuatro falsos |
| 69 | #290 · #315 | `interpretar` acepta coma decimal, grados y minutos decimales, Google `search` con `+`, texto delante y la longitud sin signo (con «Se ha tomado … como Oeste») | las 5 filas de `coordenadas.test.ts` rojas sobre `develop` |
| 70 | #291 · #317 | 04 §5: el aviso de Supabase del 30 oct 2026 no afecta a `hidrantes`. La plantilla de PR tiene una línea más, y `02_permisos.test.sql` falla si a una tabla, vista o secuencia de `hidrantes` le faltan los privilegios de `service_role` | los tres tests nuevos comprueban el estado actual en ci-sql |

- **Decisiones:** ninguna nueva.
- **Migraciones:** 0029.

## 2. El aviso de Supabase del 30 de octubre (19 §5)

- **No afecta a esta aplicación.** Todo está en `hidrantes`, con permisos explícitos, y de `public` solo se lee `public.app_users`, que ya existe.
- **Sí puede afectar a la app de uniformidad**, que usa `public` en el mismo proyecto: toda tabla nueva que cree desde el 30 oct 2026 necesita sus `grant` en su propia migración. Ese repositorio no se ha tocado (CLAUDE.md §6). Se le dice al desarrollador en el resumen del bloque P para que avise a quien lo mantenga.

## 3. Suposiciones

- **La longitud sin signo (RV-69)** se toma como oeste si, con el signo cambiado, cae en el recuadro de la zona con 5 km de margen, no en el contorno exacto. Así `coordenadas.ts` sigue sin turf ni el GeoJSON (DEC-089).
- **Las suscripciones ya guardadas (RV-68)** no se revisan: si alguna fuera de otro host, fallaría al enviar y se borraría a los tres fallos, como siempre.
