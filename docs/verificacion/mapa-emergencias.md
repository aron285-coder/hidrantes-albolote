# Verificación · Segunda revisión (23 sep 2026) · bloque D: funciones de mapa para emergencias

**Estado: hecho el 23 sep 2026.** Especificación: `docs/18-cambios-revision-2-y-mapa.md` §4
(GM-00 a GM-06). Requisitos: FR-50 v1.3, FR-69, FR-72 a FR-76, FR-142; flujos FL-35 a FL-38;
técnicos TR-76, TR-77, TR-116 a TR-119; decisiones DEC-089, DEC-092 y DEC-093. Como en los bloques
A y B, cada test nuevo falla sobre `develop` antes de su PR: el módulo, la Function o el control que
prueba no existían.

## 1. Qué se ha construido

| GM | Issue · PR | Qué | Tests que lo prueban |
|---|---|---|---|
| 00 | #238 · #260 | Documentos antes que el código: 01 v1.3, 02, 03 §13, 05, 06 §4.7, 10 §K y §L, 11 §6.1, 12, 16 | `scripts/docs.test.ts`: cada FR de 01 tiene al menos un AC en 10 |
| 01 | #239 · #262 | `coordenadas.ts` (UTM ETRS89 huso 30 sin dependencias), `geometria.ts` y el tramo de manguera en config y en Ajustes (0027) | `coordenadas.test.ts` (cuatro vectores de PROJ, ≤ 1 m), `geometria.test.ts`, `24_tramo_de_manguera.test.sql` |
| 02 + 05 | #240, #243 · #263 | "¿Qué hay aquí?" con la pulsación larga; coordenadas y *Compartir* en la ficha y en la hoja | `compartir.test.ts`; e2e `mapa.spec.ts` |
| 03 | #241 · #264 | Modo incidente: los cinco puntos más cercanos que funcionan, sin cobertura | `incidente.test.ts` (TR-116); e2e `incidente.spec.ts`, con G2 |
| 06 | #244 · #265 | Medir un tendido y los tramos de manguera | `medicion.test.ts`; e2e `medir.spec.ts` |
| 04 | #242 · #266 | Callejero sin conexión (`npm run callejero`, 125 kB), coordenadas y enlaces pegados, `/api/geocodificar` con CartoCiudad y la búsqueda en grupos (0028) | `generar-callejero.test.ts`, `callejero.test.ts`, `coordenadas.test.ts` (interpretar), `geocodificar.test.ts`, `25_version_callejero.test.sql`, `probar-functions.ts`; e2e `busqueda.spec.ts` y `rendimiento.spec.ts` (TR-117) |

- **Migraciones nuevas:** 0027 y 0028, con las mismas firmas.
- **Decisiones:** DEC-089, DEC-092 y DEC-093, con lo comprobado al implementar GM-04.
- **Dependencias nuevas:** ninguna. La UTM, la geometría y la interpretación de coordenadas son propias.

## 2. Criterio de salida

> Bloque D de 18 §1: GM-00 → GM-01 → GM-02 + GM-05 → GM-03 → GM-06 → GM-04, cada uno con sus tests,
> CI en verde y el JS inicial dentro de +10 kB sobre el de antes del bloque.

**Resultado:** cumplido.

- Los seis PR se fusionaron en ese orden, cada uno con la CI completa en verde.
- JS inicial: 229,5 kB con el bloque entero, frente a 219,5 kB en `develop` antes del bloque: +10,0 kB, medido con `npm run presupuesto` sin `.env.local` (§5).
- El callejero no cuenta en el JS inicial: es un JSON aparte y se precachea.

## 3. Casos de 10 ejecutados

| Caso | Cómo se comprobó | Resultado |
|---|---|---|
| AC-150 ¿Qué hay aquí? | e2e `mapa.spec.ts`: pulsación larga y clic derecho, UTM `30S 441808 4120645`, *Añadir un punto aquí* abre el alta con esas coordenadas, *atrás* cierra. La calle cercana: `busqueda.spec.ts` ("Junto a Calle Real") | ✅ |
| AC-151 Buscar calle, portal o coordenadas | e2e `busqueda.spec.ts`: sin red "c/ real" con "© OpenStreetMap"; "calle real 12" con la Function simulada y "CartoCiudad · IGN"; el enlace de Google Maps da "Coordenadas …" arriba; con 503 y sin red, el texto de cobertura y la calle | ✅ |
| AC-152 Modo incidente | e2e `incidente.spec.ts`: cinco que funcionan en orden, rumbo y tramos, aviso del que no funciona, *Solo hidrantes*, *atrás*, recarga | ✅ |
| AC-153 Compartir un punto | `compartir.test.ts`, con el formato exacto y sin descripción; e2e con `navigator.share` sustituido. El envío por WhatsApp en un móvil real queda para F9.1 (#76) | ✅ automático · real pendiente |
| AC-154 Medir un tendido | e2e `medir.spec.ts`: dos vértices a 59 m dan "59 m · 3 tramos de 20 m", con imán; tocar un marcador no abre su ficha; *atrás* sale; *Medir tendido* trae la recta | ✅ |
| AC-155 G2 | e2e `incidente.spec.ts` @rendimiento, perfil móvil: la primera fila en menos de 3 s. Los 15 s de campo, en F9.1 | ✅ e2e · campo pendiente |
| AC-156 UTM exacto | `coordenadas.test.ts`: cuatro puntos de la zona contra pyproj (EPSG:4258 → EPSG:25830), diferencia ≤ 1 m | ✅ |
| AC-157 a AC-167 | Son los casos que GM-00 añadió para cubrir con un AC cada FR de 01. Los que tienen test ya lo citan en 10 (AC-158, AC-161, AC-162, AC-164, AC-167). El resto se recorre con jefatura en la validación F9.1 (#76) | no aplica todavía |

## 4. Cómo reproducirlo

```
npm test
npx playwright test e2e/mapa.spec.ts e2e/incidente.spec.ts e2e/medir.spec.ts e2e/busqueda.spec.ts
npx playwright test --grep @rendimiento --workers=1
npm run callejero
```

En Windows, con el navegador instalado: `PW_CANAL=chrome`. Los pgTAP (24 y 25) corren en `ci-sql`.
Docker no funciona en este equipo, así que la base de datos local no se puede levantar aquí.

## 5. Suposiciones tomadas

- **GM-04, CartoCiudad:** se manda siempre `municipio_filter=Albolote,Calicasas`. Sin él, el portal de Albolote no sale entre los diez primeros. Con los códigos INE, el filtro no devuelve nada (DEC-092).
- **GM-04, caché:** una respuesta vacía no se guarda, porque una calle nueva puede aparecer al día siguiente.
- **GM-04, callejero:**
  - las vías `proposed` y `construction` no entran;
  - lo que cae en el margen de la zona, fuera de los dos términos, va sin municipio (DEC-093).
- **GM-04, desempate por municipio:** el municipio del centro del mapa es el de la entrada del callejero más cercana a ese centro. La app no carga los límites municipales, y el recuadro no distingue Albolote de Calicasas.
- **GM-04, pantalla:**
  - mientras los resultados están abiertos en el móvil y la tableta, la columna de controles de la derecha se oculta. axe marcaba el *Acercar* tapado a medias por la lista;
  - las filas de resultados miden 52 px, como las de la lista. El 06 §5 ya lo recoge.
- **GM-04, JS inicial:**
  - la búsqueda del callejero llega en su propio trozo, con los datos, y la llamada a `/api/geocodificar` también, al preguntar;
  - los paneles (Cercanos, ¿Qué hay aquí?, la barra de medir) **no** se cargan aparte. En la primera sesión, antes de que el Service Worker controle la página, un trozo pedido sin red no llega, y esas funciones tienen que ir sin red.
  - Resultado: 229,5 kB, +10,0 kB sobre `develop` antes del bloque (219,5 kB). Frente a los 219,0 kB que cita 18 como partida, son +10,5 kB.
- **GM-04, Mantenimiento:** el callejero se regenera con la zona y con el mapa base. Si falla, sigue el que había, y el resumen del workflow lo dice.

## 6. Lo que queda abierto

- La conformidad de jefatura con FR-50 v1.3 y FR-72 a FR-76 y la prueba en campo de G2: validación F9.1 (#76).
- El PR a `main` (#79), con el resto de la Fase 9.
