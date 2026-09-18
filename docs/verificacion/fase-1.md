# Verificación · Fase 1 · Zona de cobertura

**Estado: terminada el 18 sep 2026.** Criterio de salida cumplido (§2).

## 1. Qué se ha construido

- `npm run zona` (`scripts/generar-zona.ts`): consulta Overpass por código INE (18003 Albolote,
  18037 Calicasas) con tres servidores en orden, une los anillos de cada término, simplifica (≈ 10 m),
  une ambos términos y añade 400 m de margen. Escribe `datos/limite-municipal.geojson` (9,6 kB),
  `zona-cobertura.geojson` (7,1 kB), `nucleos.geojson` (1,9 kB), `meta.json` y la previsualización
  `zona-cobertura.html` (esta no se committea).
- `npm run cargar-zona` (`scripts/cargar-zona.ts`): *upsert* en una transacción en
  `hidrantes.limite_municipal` y `hidrantes.nucleos`; nunca borra núcleos (FR-166); si las tablas aún
  no existen, avisa y no hace nada (DEC-057).
- Diez núcleos: Albolote, Barrio Seco, La Farfana, Cortijo del Aire, El Chaparral, Parque del Cubillas,
  Pretel, Urb. Buenavista, Urb. El Torreón (Albolote) y Calicasas.

## 2. Criterio de salida (copiado de 09)

> test de las diez coordenadas en verde; el desarrollador mira la previsualización tres minutos y confirma.

| Parte | Cómo | Resultado |
|---|---|---|
| Diez coordenadas | `scripts/lib/zona.test.ts`: cinco núcleos de Albolote, dos puntos de Calicasas, tres fuera (Granada, Pinos Puente, Iznalloz), cada una contra el término y contra la zona con margen | ✅ |
| Previsualización | el desarrollador abrió `datos/zona-cobertura.html` y confirmó que cubre Albolote y Calicasas con sus núcleos (18 sep 2026) | ✅ |

## 3. Otras comprobaciones

| Qué | Cómo | Resultado |
|---|---|---|
| El margen es de ~400 m | test: a 300 m del término, dentro; a 800 m, fuera | ✅ |
| Superficies plausibles | PostGIS local: Albolote 78,5 km², Calicasas 11,3 km² (INE: ≈ 78,8 y ≈ 11,4) | ✅ |
| Geometrías válidas en PostGIS | `st_isvalid` en ambas tras cargar | ✅ |
| Carga idempotente | `cargar-zona --local` dos veces sobre tablas creadas según 05 §2.11 | ✅ |
| Sin tablas, el despliegue no se rompe | `cargar-zona --local` antes de crearlas: aviso y salida 0 | ✅ |
| Espejos de Overpass | en la ejecución real, los dos primeros dieron 504 y respondió el tercero | ✅ |
| Unión de anillos | tests de vías invertidas, anillo sin cerrar y huecos | ✅ |

AC-48 (fuera de zona) no aplica todavía: necesita la app (Fase 6) y `fn_municipio_de` (Fase 3).

## 4. Cómo reproducirlo

```
npm run zona                      # regenera datos/ (red)
npx vitest run scripts/lib/zona   # diez coordenadas y geometría
npx supabase start && npm run migrar -- --local && npm run cargar-zona -- --local
```

## 5. Suposiciones tomadas

DEC-057: municipios por código INE; núcleo = `place` town/village/hamlet/suburb/quarter/neighbourhood
(los `locality` son parajes); el margen también en el servidor (aclarado en 05 §6.3); carga que espera
a las tablas; sin `osmtogeojson` por una dependencia vulnerable; mapa base del IGN en la
previsualización; IECA como fuente alternativa escrita, no automatizada.

## 6. Lo que queda abierto

- Test pgTAP de la carga contra las tablas reales: Fase 2, cuando existan.
- `fn_municipio_de` con el margen de DEC-057: Fase 3.
