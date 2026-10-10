# Verificación · Pantallas de campo más simples (docs/24) · sesión Frontend

**Estado: hecho el 3 oct 2026.** Especificación: `docs/archivo/especificaciones/24-campo-mas-simple.md`, puntos de Frontend
(RV-99, RV-100, RV-102a, RV-104 y la parte de pantalla de RV-101, RV-102 y RV-103). Coordinación: #409.
Ops junta este registro con los de Backend y Ops en `campo.md`.

## 1. Qué se ha hecho

| RV | Issue · PR | CI (ci-calidad) | Qué | Cómo se vio fallar antes |
|---|---|---|---|---|
| 102a | #414 · #415 | run 37146749289 | Un `caudal` que la versión no conoce se dibuja como no funciona (gris, mínimo, tachado), la ficha dice «Estado desconocido · actualiza la aplicación», `anotarError` una vez por sesión sin datos del punto; lista, inventario del panel y desplegables de jefatura lo tratan igual. Fusionado **antes** que 0034 | `simbologia.test.ts`: `fill="undefined"` y sin tachado; `caudal.test.ts`: `textoPunto` lanzaba `TypeError` |
| 99 y 100 | #418 · #420 | run 37149242306 | «¿Qué hay aquí?» sin título visible (sigue el `aria-label`) ni «Junto a»; «Añadir un punto aquí» primero y primario naranja. Fuera las ayudas del diámetro y del caudal, el círculo azul y el aviso de conexión repetido. Malo y No funciona en la 2.ª pantalla de bienvenida y en `docs/02` §«Sesión presencial». Regla de un primario por pantalla (06 §5): la pantalla de resultado sin IndexedDB tenía dos | `textos.test.ts` (6 en rojo), `acciones-campo.test.tsx` (4), e2e del resultado con dos primarios |
| 104 | #422 · #423 | run 37148775901 | `scripts/preparar-racores.ts` (Chromium de Playwright, 160 × 160, ≤ 25 kB, sin dependencias nuevas); Granada y Barcelona con su foto de 48 px; sin ella, el botón como antes; `webp` en el precache | `racor.test.tsx` y `e2e/racores.spec.ts`: no existían el script ni las funciones |
| 101 | #425 · #426 | run 37151903972 | Bocas de 45, 70 u otra medida (entero 20–150) en alta y corregir datos; `radioPx` con los tramos de 0032; el panel no bloquea una boca de otra medida, enseña el número y jefatura lo corrige; tras 0032 (#416) | `diametro-bocas.test.ts` (11 de 11) y e2e de la boca de 70 |
| 102 | #427 · #428 | run 37152440709 | «Barro»: rejilla 2 + 3, marcador marrón mínimo y tachado sin atenuar, leyenda, filtro «No utilizable», Cercanos sin él y aviso que lo nombra, chip en ficha y panel, filtro del inventario; tras 0033/0034 (#419) | `barro.test.ts` (5 de 6), `accesibilidad.test.ts` (sin tokens marrones), e2e de alta con Barro y de 360 px |
| 103 | #429 · #430 | run 37153560842 | Dos fotos, Conexión y Sitio, en alta y corregir ubicación; la del sitio a 1280 px; cola con dos reservas y la clave `foto_sitio_path` siempre; envíos de la versión anterior con la firma vieja; `FOTO_NO_RESERVADA` sube la que falta (y las dos si se repite); ficha con las dos; panel lado a lado y señal «sin foto del sitio»; exportación con las dos URL; tras 0035 (#421) | `cola-foto-sitio.test.ts` (5 de 6), `foto-sitio.test.ts`, `exportar.test.ts`, e2e de alta, ubicación, ficha y panel |

- **Decisiones:** DEC-147 (un primario por pantalla), DEC-148 (pantalla de bocas; el número no hizo falta para el
  presupuesto de RV-104: `npm run presupuesto` solo mide el JavaScript inicial), DEC-149 (Barro), DEC-150 (foto del
  sitio).
- **Documentos:** 01 v1.7 (FR-72 y FR-94), 02 v1.5 (FL-03, FL-07 y la sesión presencial), 06 v1.10 a v1.15, 12.
- **Revisión:** cada PR con `silent-failure-hunter`, `pr-test-analyzer` y `code-review`; lo arreglado y lo explicado
  está en cada PR. Lo más importante que salió de ahí:
  - #415: el inventario del panel ordenaba con `NaN` un estado desconocido;
  - #426: el diff de «corregir datos» no enseñaba la otra medida de una boca;
  - #426: jefatura podía mandar un hidrante con otra medida al cambiar el tipo;
  - #430: la cola podía reintentar para siempre si el texto de `FOTO_NO_RESERVADA` cambiaba.
- **Archivos de otras sesiones** (avisados en #409):
  - `vite.config.ts` (Ops): `webp` en `globPatterns`, como pedía RV-104.
  - `e2e/integracion/fase6/7/8.spec.ts` (Backend): sus altas eligen 45 en la boca y suben la foto del sitio;
    `fase6` comprueba que las tres altas llegan a `v_cola_revision` con las dos fotos.

## 2. Capturas (412 × 915, `revisar-pantallas`)

Vistas nuevas en `e2e/vistas.spec.ts`: `que-hay-aqui`, `nuevo-punto`, `nuevo-punto-boca`, `nuevo-punto-barro`,
`leyenda` y `nuevo-punto-fotos`. `ci-vistas` las sube en el artefacto `vistas` de cada PR.

- **«¿Qué hay aquí?»:**
  - Antes (develop): título, «Junto a Plaza de las Ánimas» y «Añadir un punto aquí» el último de cuatro botones blancos.
  - Después: coordenadas y «Añadir un punto aquí» en naranja, primero. La hoja es más baja y deja ver el zoom.
- **Nuevo punto:**
  - Sin las ayudas de diámetro y caudal.
  - Boca con «45 mm · 70 mm · Otra medida».
  - Rejilla 2 + 3 con Barro, en marrón claro con borde marrón.
  - Dos botones de foto, «Conexión» y «Sitio».
- **Racores:** sin fotos, los tres como antes. Con las WebP de prueba del test (sin subir), la foto de 48 px va
  encima del nombre y «Otro» queda sin foto.
- **Leyenda:** «Barro» como cuadro marrón tachado, junto a «No funciona» en gris tachado.

## 3. Staging

Comprobado **solo leyendo**. Sin código de acceso no se puede entrar en la app, así que se miró el código servido
por `hidrantes-albolote-staging.pages.dev` tras los despliegues de #426 y #428:

- **Textos que tienen que estar:** «No utilizable», «Estado desconocido», «tiene barro», «Medida en mm, de 20 a 150»,
  «Boca de otra medida», «se probó y sale débil.», la ruta `racores/` y «Toca el mapa para ajustar el pin».
- **Textos que no tienen que estar:** «La salida, no la tubería» y «Junto a».
- **CSS:** `--marron-600:#806460`.
- **Precache:** las fotos de los racores no están porque aún no existen. Es lo esperado.
- **RV-103,** tras el despliegue de #430: están «Falta la foto del sitio», «sin foto del sitio» y la clave `foto_sitio_path`.

## 4. Suposiciones y pendiente

- **Fotos de los racores:** no hacen falta: los dibujos de `public/racores/` (Granada, Barcelona y Directo) son la referencia definitiva (DEC-178, `docs/31` RV-157b).
  fondo liso. Se preparan con `npx tsx scripts/preparar-racores.ts <carpeta>` y se suben en un PR aparte. El e2e del
  precache sin cobertura deja de saltarse solo en cuanto estén.
- **Boca:** el diámetro hay que elegirlo, sin 45 por defecto (DEC-148).
- **Barro:** marrón rojizo `#806460` en vez del `#6B4423` propuesto (DEC-149).
- **Foto del sitio y `FOTO_NO_RESERVADA`:** se distinguen por el texto del servidor, y la cola tiene una red si ese
  texto cambia. Petición a Backend en #409 para un código propio en la próxima migración (DEC-150).
- **Sesión presencial (F9.9, #84):** Malo, Barro y No funciona se explican en voz alta; el guion está en `docs/02`.
  Barro aún no está en la bienvenida: allí solo van los dos que salieron del formulario (RV-99).
- **Locales:** sin Docker, los e2e de integración y `npm run compatibilidad` los pasa el CI. Sin Firefox local,
  `panel-firefox` también.
