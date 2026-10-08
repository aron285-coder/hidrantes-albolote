# Verificación · Cola sin señales y lo pendiente de 25, 26 y 27 (docs/28)

**Estado: hecho en staging (oct 2026).** Producción, con la siguiente release (P-15 de `docs/25`).
Especificación: `docs/28-cola-sin-senales-y-pendientes.md`. Dos sesiones (Panel, con un subagente, y
Ops). El detalle de cada punto está en el cuerpo de su PR.

## Panel

### RV-115 · Detalle de la cola sin señales · #461

- Sin chips de señales en las seis operaciones; en un alta, «Datos del punto» sin subtítulo.
- El ⚠ de la lista solo por desactualizada, hidrante de otra medida, posible duplicado o fuera de zona (`tieneAviso`).
- Borrados `senales()`, `Senal`, `GPS_IMPRECISO_M`, `FOTO_LEJOS_M`, la prop `alta` de `DatosDelPunto` y 16 textos de `panelCola` (también del Apéndice A); `senalAviso` se queda.
- **Tras la revisión** (silent-failure-hunter), cuatro cosas que solo decían los chips se dicen ahora sin chip (DEC-166): «[núcleo] · Fuera de zona» en la cabecera; duplicado que no está en el inventario cargado; «llegó sin foto del sitio» en el título de «Fotos»; aviso de desactualizada encima de Corregir y Fusionar.
- **axe sobre el detalle, por primera vez:** «Cambia» y «N cambios» a `--naranja-texto`, el antes tachado sin transparencia y el minimapa como `role="group"`.
- **Pruebas:** vitest (`detalle-propuesta.test.tsx`, `cola.test.ts`, `foto-sitio.test.ts`) y e2e (`panel-cola.spec.ts`, axe en claro y oscuro). Todas las nuevas fallaban sobre `develop`. `e2e/integracion/fase7.spec.ts` ajustado (comprobaba un texto borrado).

### RV-117 · Contraste en el panel oscuro · #462

- Tokens `--ambar-texto` (`#E8B54A` en oscuro: 8,36:1 sobre `--papel`, 9,42:1 sobre `--fondo`), `--rojo-texto` (`#F28B82`: 6,60:1 y 7,43:1) y, fuera de lo pedido, `--verde-texto` (`#5FC48E`: 7,34:1), porque axe marcaba el «después» en verde a 3,13:1.
- Fusionar (texto `--ambar-texto`, borde `--oro-600` ≥ 3:1), Rechazar y «Anonimizar…» (`--rojo-texto`), la comparación de duplicados y el resto de texto rojo, ámbar o verde sobre superficie del panel. La tabla de comparación y la caja de Fusionar usan un tinte `color-mix` sobre `--papel`.
- **Pruebas:** `accesibilidad.test.ts` (≥ 4,5:1 en los dos modos; borde de Fusionar ≥ 3:1) y axe del alta con duplicado y de Fusionar y Rechazar, en claro y oscuro, sin exclusiones. Fallaban antes.

### RV-116 · Voluntarios en el móvil · #460 (subagente; cierra #454)

- Por debajo de 768 px, Voluntarios y Registro pasan a tarjetas, como Inventario, con «Anonimizar…» a todo el ancho y 44 px. Papelera ya cabía con filas (412 px) y se queda como tabla.
- **Pruebas:** `e2e/panel-movil.spec.ts` a 412 × 915: sin desplazamiento a lo ancho (página, contenedores y celdas), «Anonimizar…» visible y tocable, axe de las tres pestañas, y falla si el panel registra un error de carga. A 768 y 1440, las tablas de siempre. Voluntarios y Registro fallaban antes (686 y 565 px de ancho en 412).

## Ops

- **RV-118 · `anchos.spec.ts` «360 px: la rejilla de estados…» · #459.** Causa: las fotos de referencia del racor cargan tarde y empujan la rejilla de estados 34 px mientras el test medía los botones de uno en uno (`[2, 1, 2]`). Arreglo en el test: espera a las fotos y mide los cinco a la vez, sin reintentos ni `fixme`. `--repeat-each=20` en local: 11 fallos de 20 antes; 20 de 20 después, cuatro veces (80/80). El salto que ve el voluntario con poca cobertura queda propuesto como tarea aparte (reservar el hueco de la foto).
- **RV-119 · Tope de los marcadores: cerrado sin código.** El zoom no cambia el radio; el radio sale de `escala_radios`, que `fn_guardar_config` y Ajustes limitan a cinco números entre 2 y 30; y `svgMarcador` dibuja siempre en un lienzo de `tamano` px exactos, encogiendo lo que no cabe. El lienzo ya es el tope (como mucho 22 px de semilado con cualquier valor; 16,8 px con radio 30). Lo cubren los tests de `simbologia.test.ts` sobre el tamaño del lienzo.
- **Documentación:** `docs/01` v1.11 (FR-104), `docs/02`, `05`, `06` v1.21 (§2 y §5), `10` AC-70, `12` DEC-166, `docs/mockups/25-cola.html` sin chips ni subtítulo del alta (#458 y este cierre). Registro de docs/26 con la prueba del desarrollador en el Android.

## Pendiente

1. **Desarrollador (docs/28 §8):** en staging, en el Android, abrir un alta y una revisión de la cola; probar Cercanos; P-15; las fotos propias de los racores. Hechos el 5 oct 2026: el amarillo a pleno sol (se ve bien) y la conformidad de jefatura sobre `docs/01` v1.8 a v1.11.
2. **Fuera de alcance, propuesto como tarea:** la app del voluntario tiene texto rojo y verde sobre la superficie que en oscuro se lee a ~2:1 (`Entrada.tsx`, `Incidencia.tsx`, `Ajustes.tsx`, `Mapa.tsx`, `MisPropuestas.tsx`, `Proponer.tsx`); se arregla con los tokens de RV-117.
