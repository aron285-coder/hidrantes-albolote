# Verificación · Fase 5 · Mapa, capas y simbología

**Estado: terminada el 19 sep 2026, con una comprobación manual pendiente** (§6): el desarrollador
aún no ha visto staging a la luz del día en su móvil, porque staging está bloqueado en España durante
los partidos de LaLiga (DEC-061).

## 1. Qué se ha construido

- Mapa base propio extraído con `npm run mapabase` (escritor PMTiles propio, 4,2 MB, zoom 10–15),
  descargado entero a Cache Storage; aviso si falta; versión nueva ofrecida en Ajustes.
- Leaflet con estilos claro/oscuro de 06 §2.3; capas OSM, PNOA y Catastro; límite de la zona.
- Marcadores de 06 §4 con declutter; leyenda; puntos en IndexedDB con sincronización incremental.
- Búsqueda, lista con filtros y orden, ficha con "Cómo llegar"; layout adaptable; modo oscuro.
  Decisiones en DEC-062.

## 2. Criterio de salida (copiado de 09)

> con el mapa base descargado, mapa y búsqueda funcionan en modo avión con los datos de la última
> sincronización; las cuatro capas cargan en 3G; los tests unitarios cubren las 12 combinaciones de
> simbología; el desarrollador confirma que los cinco tamaños se distinguen en su móvil a la luz del día.

| Parte | Cómo | Resultado |
|---|---|---|
| Modo avión con mapa base descargado | e2e `mapa.spec.ts` (móvil y escritorio): descarga, sin red, mapa pintado, búsqueda y lista | ✅ |
| Las 12 combinaciones | `simbologia.test.ts` | ✅ |
| Las cuatro capas en 3G | Las URL responden por HTTPS con nuestro Referer (comprobado con `curl`); sin prueba con red 3G real | ⏳ |
| Cinco tamaños distinguibles a la luz del día | Prueba del desarrollador en su móvil | ⏳ (staging bloqueado, DEC-061) |

## 3. Casos de 10 ejecutados

AC de mapa y ficha cubiertos por `e2e/mapa.spec.ts` e `e2e/integracion/fase5.spec.ts` (la respuesta
de `fn_listar_puntos` no trae autores ni historial). AC-28 (modo oscuro) revisado con capturas.

## 4. Cómo reproducirlo

```
npm test
PW_CANAL=msedge npm run e2e
npm run mapabase   # regenera el mapa base (lee Protomaps por rangos)
```

## 5. Suposiciones tomadas

DEC-062.

## 6. Lo que queda abierto

- Los cinco tamaños a la luz del día en el móvil del desarrollador (TR-33).
- Carga de las cuatro capas con una red 3G real.
- Conformidad de jefatura con el token `--anillo-seleccion` añadido a 06 §2.4.
