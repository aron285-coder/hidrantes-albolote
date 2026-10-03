# Verificación · Pantallas de campo más simples (docs/24) · sesión Backend

**Estado: hecho el 3 oct 2026.** Especificación: `docs/24-campo-mas-simple.md`, puntos de Backend
(RV-101, RV-102 y RV-103, parte de servidor). Coordinación: #409. Ops junta este registro con los de
Frontend y Ops en `campo.md`.

## 1. Qué se ha hecho

| RV | Issue · PR | Migración | Qué | Cómo se vio fallar antes |
|---|---|---|---|---|
| 101 | #410 · #416 | **0032** `diametro_bocas` | Boca de riego con 45, 70 u otra medida entera de 20 a 150 mm, aprobada tal cual; sin diámetro, 45 (app anterior). `puntos_diametro_boca` de 20 a 150. La aprobación, `fn_editar_punto` y la fusión ya no ponen 45 a toda boca. Corregir datos valida el diámetro contra el tipo del punto. `fn_radio_px` por tramos (≤ 45 → 1, ≤ 70 → 2, > 70 → 3). **Además:** un alta aprobada sin correcciones perdía su `punto_id` (`nullif(c,'{}') \|\| …` es NULL) y Mis propuestas no enseñaba su código; arreglado y rellenado desde `registro` | run 37146360935: `29_diametro_bocas.test.sql` con los casos 2-3 y 5-8 en rojo, y error en la revisión de la boca de 70 por el `punto_id` perdido |
| 102 | #411 · #419 | **0033** `estado_barro` y **0034** `estado_barro_uso` | 0033: solo `add value 'barro' after 'no_funciona'`. 0034: `fn_radio_px` con barro al mínimo; el alta y la fusión solo guardan la nota de fallo con no funciona (regla de RV-42). `fn_proponer` acepta barro sin descripción por el cast al enum. Fusionado con RV-102a ya en `develop` (#415, casilla marcada en #409) | run 37146816297: `30_estado_barro.test.sql`, `PAYLOAD_INVALIDO(valor): Valor fuera de la lista` y el caso 1 en rojo |
| 103 | #412 · #421 | **0035** `foto_del_sitio` | `foto_sitio_path` en puntos y propuestas (nullables). `fn_proponer` con firma nueva de 17 parámetros (sin default en el último) y la de 16 intacta; las dos llaman a `fn_proponer_interno` (sin `execute` para `anon` ni `authenticated`). Obligatoria en alta y ubicación (`FOTO_SITIO_OBLIGATORIA`), no admitida en las demás, reservada por el mismo móvil y distinta de la de la conexión. Aprobación, lote, alta directa de jefatura y fusión la guardan. **`fn_fotos_referenciadas` y `_lista` la protegen de la purga.** `v_puntos_activos`, `v_cola_revision` (`sin_foto_sitio`) y la exportación la traen. Tope de subidas de fábrica 40 → 80 | run 37147918880: `31_foto_del_sitio.test.sql`, la firma nueva no existe |

- **CI en verde de cada PR:** #416 run 37146923681; #419 run 37147826462; #421 run 37148746098.
- **Decisiones:** DEC-144 (diámetro de bocas), DEC-145 (Barro), DEC-146 (foto del sitio). Sin usar: ninguna del rango.
- **pgTAP:** `29_diametro_bocas` (32 casos), `30_estado_barro` (15), `31_foto_del_sitio` (36). Ajustados:
  `01_esquema` (una boca de 70 ya es válida: se prueba 151), `05_rpc_voluntario` y `07_concurrencia_rpc`
  (leen el tope de `config`), `11_reservas_y_alta_jefatura` y `14_bloqueos` (dos firmas de `fn_proponer`).
- **`scripts/migrar.ts`** aplica cada archivo en su propia transacción (`aplicar()`: `begin`, bloqueo, archivo,
  fila de historial, `commit`, un `psql` por archivo): por eso 0033 y 0034 van separadas y 0034 ya ve `barro`.
- **Compatibilidad (TR-107):** `npm run compatibilidad` en verde en `ci-sql` de los tres PR. En #421, el caso
  de la Fase 5 de la versión anterior comprueba con una lista cerrada que `v_puntos_activos` no trae autores;
  `compatibilidad.ts` le añade las columnas que 05 §4 ya documenta (`COLUMNAS_NUEVAS_PUNTOS`).
- **Revisión:** en los tres PR, `silent-failure-hunter`, `pr-test-analyzer` y `code-review`. Lo arreglado y lo
  explicado está en cada PR (entre otras cosas: números enormes que tumbaban el lote y la fusión de un hidrante
  con otra medida en #416; los casos de nota de fallo en #419; purga sin reserva, lote y tope solo si es de
  fábrica en #421).
- **Otros archivos:** `scripts/promover-piloto.ts` copia también `foto_sitio_path` (y su archivo);
  `e2e/integracion/fase5.spec.ts` admite la columna nueva. Documentos: 01 (v1.6, FR-16, 17, 18, 21, 41, 45,
  61, 66 y 68), 03 TR-45, 04 §7, 05, 11 y 12.

## 2. Suposiciones

- **RV-101:** la otra medida de una boca es un **entero** (32,5 → `PAYLOAD_INVALIDO`). Jefatura corrige el
  diámetro de una boca con `diametro_mm` y cualquier valor de 20 a 150. La app 0.6.5, en "corregir datos" de
  una boca que no tiene 45, manda `diametro_mm: 45`: mientras quede alguna sin actualizar, jefatura lo ve en el
  diff de la cola (DEC-144).
- **RV-101, hallazgo:** el relleno de `punto_id` también ayuda a `promover-piloto.ts`, que busca el punto de
  cada alta en `correcciones ->> 'punto_id'`: sin él, un alta aprobada sin correcciones no habría viajado.
- **RV-102:** la nota de fallo solo vale con no funciona, también al dar de alta y al fusionar. Una propuesta en
  barro que traiga nota la conserva en `propuestas.datos` y en el registro, pero no pasa al punto (DEC-145).
  Cercanos se calcula en el móvil: su prueba es de Frontend.
- **RV-103:** una ubicación de la app anterior, sin foto del sitio, **conserva** la que había: corregir
  ubicación corrige un pin, no mueve el hidrante. Una foto del sitio sustituida la borra la purga, como una
  `foto_path` sustituida (DEC-146).
- **RV-103, tope:** se dobla solo si la fila sigue siendo de la migración (`actualizado_por = 'migracion'` y
  40). Si jefatura lo guardó desde Ajustes, aunque fuera 40, lo sube ella.

## 3. Lo que queda para otros

- **Frontend (pedido en #409):**
  - RV-101: `radioPx` de `src/lib/derivar.ts` con los tramos nuevos de `fn_radio_px`; el panel no bloquea
    "Aprobar" por `otra_medida` en una boca; la otra medida de boca va como `diametro_otro` entero.
  - RV-103: con la firma nueva, mandar **siempre** la clave `foto_sitio_path` (`null` si no hay), porque
    PostgREST elige la firma por las claves; el código `FOTO_SITIO_OBLIGATORIA`; las columnas nuevas de la cola
    y de la exportación.
- **Ops (P-14):**
  - Las cuatro migraciones van a producción **en orden** (0032, 0033, 0034, 0035) con `migrar.ts`, cada una en
    su transacción. RV-102a (#415) está en `develop` antes que 0034, así que van bien en la misma release.
  - Tras desplegar, comprobar que `max_subidas_dispositivo_dia` quedó en 80 (o se respetó el valor de jefatura:
    lo dice el `notice` de 0035 en el log del despliegue).
  - La purga en ensayo de producción (`gh workflow run purgar-fotos.yml -f ensayo=true`) no debe proponer borrar
    ninguna foto del sitio: `fn_fotos_referenciadas_lista()` las incluye.
  - El `warning` de 0032 avisa si queda alguna alta aprobada sin punto en `correcciones` (sin fila en
    `registro`); en staging y producción no se espera ninguna.
