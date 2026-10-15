# 38 · El panel en el móvil: pestañas en el menú, filtros en un botón y listas más simples (oct 2026)

| | |
|---|---|
| **Para** | Claude Code, en este repositorio. **Una sola sesión (Frontend), en orden** (§0.3). |
| **Base** | `develop` en `d092f66`. Producción en **0.15.0**. La siguiente decisión es DEC-212 y el siguiente punto, RV-500. **No hay migración** (§0.5). |
| **Origen** | El desarrollador revisó el panel de jefatura en el móvil, la tableta y el ordenador, eligió un diseño por pestaña y pantalla y pidió dos cambios más: en el móvil, las pestañas dentro del menú; los filtros y el orden, en uno o dos botones con una ventana. El resultado son los cinco mockups de `docs/mockups/38-panel-*.html`. |
| **Versión** | **1, del 15 oct 2026.** Antes de empezar, comprueba que tu copia tiene §0.6 (correcciones a los mockups) con once puntos. |
| **Congelación** | **Tercera excepción a DEC-193** (DEC-212): solo lo que dice este documento. La especificación de después del piloto pasa a ser **`docs/39`**. |
| **Divulgación** | Nada de seguridad. Este documento y los mockups entran en Git con el primer PR (RV-500). Los mockups solo llevan datos simulados de los e2e (`HID-90nn`, `@example.org`, «Voluntaria Pruebas»). |
| **Sin backend** | Solo interfaz: ni migraciones, ni RPC nuevas o cambiadas, ni Functions, ni workflows (§0.5). |
| **El desarrollador** | No hace nada. Aprueba los cambios de 01, 02, 06 y 08 al pedir esta especificación (DEC-177). |

## 0. Reparto

### 0.1 Decisiones

| DEC | Qué |
|---|---|
| **DEC-212** | **`docs/38`, tercera excepción a DEC-193:** el panel en el móvil, solo interfaz. La de después del piloto pasa a `docs/39`. |
| **DEC-213** | **El panel por anchos (UI-18, UI-15).** Móvil < 768 px: las pestañas, dentro del menú ☰; la cabecera dice en qué pestaña estás y la búsqueda es una lupa. Tableta 768–1.099: pestañas arriba. PC desde 1.100 (pequeño) y desde 1.600 (grande). Las tablas del Inventario, del Registro y de la Papelera, desde 1.100. Toques de 44 px hasta 1.099. |
| **DEC-214** | **Filtros y orden en un botón con una hoja (UI-19).** Un botón que dice lo que está puesto abre todos los filtros y, donde no hay cabeceras de tabla, el orden. Sustituye la forma de DEC-168 (dos desplegables); lo que se filtra no cambia. |
| **DEC-215** | **Listas del panel más simples (UI-11, UI-12, UI-16, UI-17).** Una fecha, un formato; cada dato una vez; el estado con etiquetas de color; filas de tres líneas como mucho y sin «…»; en el Inventario, tocar la fila abre Editar por debajo de 1.100 px y en el PC «Editar» y «⋯»; en Administradores, etiqueta y «⋯» en vez de la casilla. |

El texto de cada una, en §1 (RV-500).

### 0.2 Orden

Un PR por punto, en este orden. Una issue por punto (§1).

| # | Punto | Qué | Ronda |
|---|---|---|---|
| 1 | **RV-500** | Este documento y los mockups a Git; DEC-212 a DEC-215; CLAUDE.md, skills y 09 §8; las issues | 0 |
| 2 | **RV-501** | Los documentos primero: 01, 02, 06 (§2, §5, §9 y Apéndice A), 08 y 10 | 0 |
| 3 | **RV-502** | Piezas comunes: anchos, tokens, fecha, etiquetas, «Tú», menú «⋯» y ayudas de los e2e | 1 |
| 4 | **RV-503** | Navegación del móvil: pestañas en el menú ☰, cabecera con la pestaña y lupa | 1 |
| 5 | **RV-504** | El botón de filtros y su hoja | 1 |
| 6 | **RV-505** | Cola de revisión | 2 |
| 7 | **RV-506** | Inventario | 2 |
| 8 | **RV-507** | Registro (cierra #758) | 2 |
| 9 | **RV-508** | Papelera | 2 |
| 10 | **RV-509** | Ajustes (cierra #753) | 2 |
| 11 | **RV-510** | Pruebas de anchos, toques de 44 px (cierra #754) y vistas | 3 |
| 12 | **RV-511** | Manual 13, capturas, 10 e índice | 3 |
| 13 | **RV-512** | RV-139b, recorrido, publicar y archivar | 3 |

Cada PR, con el flujo de siempre (skill `paquete-rv`): el test que falla antes, `pr-review-toolkit`, `code-review`, `revisar-pantallas` (todos menos RV-500 y RV-501) y CI verde. No esperes al CI para empezar el siguiente: `gh pr merge --auto --squash`.

**La ronda 2 depende de la 1.** RV-505 a RV-509 usan las piezas de RV-502 a RV-504: no empieces una pestaña antes de que esas tres estén en `develop`. RV-503 deja de pintar las pestañas en el móvil: en ese mismo PR, todos los e2e que llegan a una pestaña o al buscador a 412 px pasan por las ayudas de RV-502 (§3.7). Cada PR deja la CI verde; ninguno deja e2e en rojo «para el siguiente».

**Registro:** `docs/verificacion/panel-movil-38.md`. Una línea por PR: qué entró, el test que falló antes y el número del PR.

### 0.3 Por qué una sola sesión

`docs/trabajo-en-paralelo.md` §1: una especificación de una sola área va con una sesión. Aquí todo es Frontend, y las cinco pestañas comparten `src/lib/textos.ts`, el Apéndice A de 06, `e2e/ayudas.ts` y las piezas de la ronda 1: varias sesiones chocarían en esos archivos en cada PR. Con `--auto`, la sesión sigue con el siguiente punto mientras corre el CI del anterior.

### 0.4 Mockups y documentos

- **Los mockups** son `docs/mockups/38-panel-cola.html`, `38-panel-inventario.html`, `38-panel-registro.html`, `38-panel-papelera.html` y `38-panel-ajustes.html`. Cada uno tiene las reglas R1 a R11, los requisitos de la pestaña y, por pantalla, «Ahora» (captura de 0.15.0) y «Propuesta» con sus estados (filtros abiertos, menú abierto, «⋯» abierto, dos marcadas).
- **Se abren con Playwright** si hace falta verlos (CLAUDE.md §2). Son de 412 × 915, 820 × 1180, 1280 × 800 y 1920 × 1080, en claro.
- **Mandan los documentos** (CLAUDE.md §2). Este documento y 06 (tras RV-501) son la verdad; el mockup es la referencia visual. Si no coinciden, gana el texto.
- **R1 a R11 de los mockups**, en 06 tras RV-501:

  | Mockup | En 06 |
  |---|---|
  | R1 La información es la de hoy | Regla de esta especificación (§0.7) |
  | R2 Cada dato, una vez por pantalla | UI-16, que ya existe |
  | R3 Una fecha, un formato | UI-12, ampliada al panel |
  | R4 Nada de «…» ni desplazamiento a lo ancho | **UI-17**, nueva |
  | R5 Toque de 44 px hasta 1.099 px | UI-15, ampliada al panel |
  | R6 Lo que no se deshace, apartado, en rojo y con confirmación | UI-06 y UI-14, que ya existen |
  | R7 Filtros con mayúscula inicial | Apéndice A |
  | R8 Teclado, foco y lectores como hoy | §10 y TR-35, que ya existen |
  | R9 Vacío, cargando y error como hoy | UI-03 y UI-04, que ya existen |
  | R10 Pestañas del móvil en el menú | **UI-18**, nueva |
  | R11 Filtros y orden en un botón | **UI-19**, nueva |

### 0.5 Sin backend

Todo lo que enseñan los mockups ya llega al navegador. Si algo de este documento pareciera necesitar SQL, una RPC o una Function, **para**: anótalo en la issue del punto y sigue sin ello. No hay migración en esta especificación.

| Lo que se enseña | De dónde sale hoy |
|---|---|
| El punto naranja de ☰ (propuestas pendientes) | `pendientes` de `Armazon` (`PanelJefatura.tsx`), el mismo número de la pestaña |
| Estado, operación y núcleo de la cola | `cargarCola` / `cargarHistorial`; operación y núcleo se filtran ya en el navegador (`ColaRevision.tsx`, `visibles`) |
| El código de un alta aprobada en el historial | `correcciones.punto_id` buscado en `usePuntos()`, como ya hace `Decision` en `DetallePropuesta.tsx` |
| Tipo, estado, cuentas y orden del Inventario | `inventario()`, `cuentaPorEstado()`, `ordenarPor()` en el navegador |
| Filtro del Registro | `cargarRegistro(accion, …)`, como hoy |
| «quedan N días» de la Papelera | `diasQueQuedan()` en el navegador |
| Etiqueta y «⋯» de cada administrador | `gestionarAdministrador` (la misma llamada de la casilla) y `pendienteDeVincular` |
| Estado de cada pedido de Mantenimiento | `PedidoReciente.estado` (`fn_pedidos_recientes`), que ya lee `estadoPedido()` |
| «Tú» | `useAcceso().correo` y `esUnoMismo()` (`src/lib/panel/ajustes.ts`), que ya usa Administradores |

### 0.6 Correcciones a los mockups (manda esto)

Los mockups se dibujaron a mano, con datos simulados. Donde dicen otra cosa, se hace así:

1. **Colores de las etiquetas de operación:** los de 06 §5 y `COLOR_OPERACION` (`piezas.tsx`): datos y ubicación en gris.
2. **El Estado del Inventario tiene cinco valores:** Bueno, Regular, Malo, **Barro** y No funciona, con su número. Los datos simulados no tienen Barro; la hoja lo enseña con «0».
3. **Tipo:** «Todos», «Hidrantes», «Bocas de riego», los textos de hoy (`TIPOS`).
4. **Tu fila en Administradores:** tu correo **con la etiqueta «Tú»**, no «Tú» solo. Por debajo de 1.024 px tu correo no sale en ninguna otra parte de la pantalla, y en Administradores es el dato que se gestiona.
5. **«Devolver el acceso»** solo sale en el «⋯» de un administrador sin acceso; **«Quitar el acceso…»**, solo en el de uno con acceso.
6. **La fecha exacta** va en el `title` del `<time>`: se ve al pasar el ratón. En táctil no hay «mantener pulsado»; la fecha y la hora siguen en el detalle y en el Historial.
7. **El aviso ⚠ de la cola**, como hoy: el icono con su `aria-label` (`T.panelCola.senalAviso`).
8. **El diámetro de una boca de riego**, como hoy y como UI-11: «45 mm · enganche Granada». El mockup lo abrevia.
9. **Ordenar por** lleva las siete columnas de hoy, en el orden de `COLUMNAS` (`Inventario.tsx`): Código, Tipo, Diámetro, Estado, Dirección, Núcleo y Última revisión.
10. **Textos que ya existen se quedan:** las cabeceras del Registro (Momento, Actor, Acción, Punto, Detalle), y en el «⋯» de un punto, «Historial», «Retirar» y «Borrar» (`T.panel`), sin el paréntesis ni los iconos del mockup. El resto de literales, los del Apéndice A tras RV-501 (§2.4); los del mockup son orientativos.
11. **Las columnas de Ajustes** van de arriba abajo, una detrás de otra (CSS `columns`): el reparto del mockup (una tarjeta a cada columna por turnos) es orientativo.

### 0.7 Reglas de toda la especificación

- **R1. La información es la de hoy.** Se enseña más simple; nunca se añade un dato nuevo ni se quita uno que jefatura usa. Lo que se quita es lo repetido (§6 a §10 dicen qué).
- **Los detalles no cambian:** el detalle de una propuesta, Editar, Historial, las ventanas de Retirar, Borrar, Purgar y Quitar el acceso, y la hoja A4 del QR.
- **Modo oscuro:** solo tokens (`--anillo-seleccion`, `tinte-*`…). Ninguna caja clara en oscuro (`revisar-pantallas`). Las etiquetas grises y azules usan los tokens nuevos de RV-502.
- **Textos:** en `textos.ts` y en el Apéndice A (UI-20, UI-21). `textos.test.ts` exige que cada texto de `T` esté en el apéndice: RV-501 **solo añade** al apéndice; cada PR de código cambia o borra en el apéndice los literales que cambia o deja de usar en `textos.ts`.
- **Novedades (FR-167):** el `feat(panel): …` de cada PR se escribe para jefatura, con palabras: «En el móvil, las pestañas del panel están en el menú».
- **Accesibilidad como hoy (TR-35, 06 §10):** todo con teclado, foco visible, nombres accesibles, ventanas modales con lo de detrás `inert`.
- **Sin dependencias nuevas.** Vitest corre en Node sin DOM (`vitest.config.ts`, `environment: 'node'`): lo que necesita un DOM (pulsar, foco, Esc) se prueba con Playwright; vitest, para la lógica pura y para pintar con `react-dom/server`, como `registro.test.tsx`.

---

## 1. RV-500 · Puesta en marcha

- **Este archivo** a `docs/38-panel-en-el-movil.md` (DEC-195: la especificación en curso va en la raíz).
- **Mockups:** `docs/mockups/38-panel-cola.html`, `38-panel-inventario.html`, `38-panel-registro.html`, `38-panel-papelera.html` y `38-panel-ajustes.html` ya están en la carpeta, sin seguimiento: `git add`. Si falta alguno, para y dilo en la issue. Borra los dos borradores superados que hay al lado, también sin seguimiento: `docs/mockups/panel-movil-propuesta.html` y `docs/mockups/panel-pantallas-propuesta.html`. No toques otros archivos sin seguimiento (`docs/capturas/staging-31/`, `docs/revision-recorrido-y-propuestas-ui.html`).
- **12** (v1.67): DEC-212 a DEC-215, con este texto, y sus filas en «Índice por documento afectado».
  - En DEC-193, DEC-196, DEC-205 y DEC-209, donde dicen que la de después del piloto es `docs/38`: «desde DEC-212, `docs/39`».
  - En el estado de DEC-168: «la forma (dos desplegables), sustituida por DEC-214». En DEC-171: «matizada por DEC-215 (sin recortar con «…»)». En DEC-192: «U14, matizada por DEC-213 (pestañas en ☰ por debajo de 768 px)».

  > **DEC-212 · `docs/38`: el panel en el móvil, tercera excepción a DEC-193**
  > - **Fecha:** 15 oct 2026 (desarrollador) · **Estado:** vigente (`docs/38`).
  > - **Contexto:** en el móvil, el panel parte las pestañas en dos filas, corta los filtros («todas las operaci…») y enseña una fila de cabeceras que no está encima de nada. Jefatura va a usar el panel desde el móvil durante el piloto. El desarrollador revisó todas las pestañas en cuatro anchos y eligió un diseño (`docs/mockups/38-panel-*.html`).
  > - **Decisión:** 1. `docs/38` entra como excepción a DEC-193, solo con lo que contiene y sin tocar la base de datos, las RPC, las Functions ni los workflows. 2. La especificación de después del piloto pasa a ser **`docs/39`** y parte de `docs/verificacion/piloto.md`. Donde DEC-193, DEC-196, DEC-205 y DEC-209 dicen `docs/38`, léase `docs/39`.
  > - **Descartado:** dejarlo como issue `tras-piloto` (jefatura usaría en el piloto el panel que se va a cambiar).
  > - **Afecta a:** DEC-193, DEC-196, DEC-205, DEC-209, CLAUDE.md §5, la skill `paquete-rv` y 09 §8.

  > **DEC-213 · El panel por anchos**
  > - **Fecha:** 15 oct 2026 (desarrollador) · **Estado:** vigente (`docs/38` RV-502, RV-503). Matiza DEC-167 (las cinco pestañas siguen), DEC-192 U14 (el menú ☰ por debajo de 800 px sigue y suma las pestañas por debajo de 768) y FR-100.
  > - **Contexto:** el panel se pensó para el ordenador. En el móvil, las pestañas ocupan dos filas y el resto se aprieta.
  > - **Decisión:** 1. Cuatro anchos: móvil < 768 px, tableta 768–1.099, PC pequeño 1.100–1.599 y PC grande ≥ 1.600. 2. En el móvil, las pestañas van dentro del menú ☰ con su número; la cabecera dice la pestaña y la búsqueda es una lupa; desde otra pestaña, un punto naranja en ☰ avisa de que hay propuestas pendientes. Desde 768, las pestañas arriba, en una fila. 3. Desde 1.100, tablas en el Inventario, el Registro y la Papelera; por debajo, filas. Hasta ahora: el Inventario, tabla desde 1.024; el Registro, desde 768; la Papelera, siempre. 4. En el panel, toques de 44 × 44 hasta 1.099 px y de 32 desde 1.100 (UI-15).
  > - **Descartado:** barra de pestañas abajo como la app del voluntario (una fila fija más en cada pantalla); las pestañas en un desplegable de la cabecera (dos sitios para navegar).
  > - **Afecta a:** 01 FR-100; 06 §5, UI-15 y UI-18.

  > **DEC-214 · Filtros y orden en un botón con una hoja**
  > - **Fecha:** 15 oct 2026 (desarrollador) · **Estado:** vigente (`docs/38` RV-504). Sustituye la forma de DEC-168: Tipo y Estado siguen siendo los filtros del Inventario, pero en la hoja.
  > - **Contexto:** la Cola tenía cuatro botones de estado y dos desplegables; el Inventario, dos desplegables y una fila de cabeceras para ordenar; en el móvil se cortaban.
  > - **Decisión:** en la Cola, el Inventario y el Registro, **un botón** que dice lo que está puesto («Pendientes», «Todos · Código ▲», «Todas las acciones») y abre una hoja con todos los filtros y, donde no hay cabeceras de tabla, el orden. En el móvil, hoja inferior modal; desde 768 px, ventana debajo del botón. Cada opción se aplica al tocarla; «Quitar filtros» solo si hay algún filtro distinto de lo de por defecto, y los devuelve a eso (el orden no es un filtro: se queda); «Listo» o ✕ cierran. Con algún filtro distinto de lo de por defecto, el botón se marca. En las tablas del PC se sigue ordenando por las cabeceras.
  > - **Descartado:** filtros siempre a la vista en chips (una o dos filas fijas en el móvil); desplegables nativos (se cortan y no enseñan el color del estado).
  > - **Afecta a:** 01 FR-120; 02 FL-21, FL-23 y FL-24; 06 §5 y UI-19.

  > **DEC-215 · Las listas del panel, más simples**
  > - **Fecha:** 15 oct 2026 (desarrollador) · **Estado:** vigente (`docs/38` RV-505 a RV-509). Matiza UI-11, UI-12 y DEC-171 en el panel.
  > - **Contexto:** la misma pantalla enseñaba el total del Inventario tres veces, cada fecha dos («hace 1 mes · 20 ago 2026»), el correo propio en la cabecera y en las listas, y cortaba con «…» la línea de cada propuesta y los textos largos del Registro.
  > - **Decisión:** 1. En las listas del panel, una fecha, un formato: «hace…» hasta 7 días y la fecha después; la fecha y la hora exactas, al pasar el ratón. 2. Cada dato una vez por pantalla (UI-16). 3. Los estados, con etiquetas de color: estado del punto, operación, acceso de un administrador y pedido de Mantenimiento. 4. Filas de tres líneas como mucho, sin «…» (UI-17): el detalle del Registro ya no se recorta a 60 caracteres. 5. Inventario: por debajo de 1.100 px, tocar la fila abre Editar y «⋯» lleva Historial, Retirar y Borrar; en el PC, «Editar» y «⋯». 6. Administradores: etiqueta de acceso y «⋯» («Quitar el acceso…» o «Devolver el acceso») en vez de la casilla, que decía lo mismo que «activo». 7. El propio administrador se lee «Tú».
  > - **Descartado:** las variantes B y C de los mockups (tarjetas, cola agrupada por núcleo, tablas en el móvil, acordeón o apartados en Ajustes).
  > - **Afecta a:** 06 §5, UI-11, UI-12, UI-17 y el tono del Apéndice A; DEC-171; 13.

- **CLAUDE.md:**
  - §5: «salvo `docs/35`, `docs/36` y `docs/38` (DEC-196, DEC-205 y DEC-212); `docs/37` cabe dentro (DEC-209)… `docs/39`, la de después del piloto, no se escribe hasta que exista `docs/verificacion/piloto.md`». Las únicas excepciones, «`docs/35`, `docs/36` y `docs/38`».
  - §2, fila «construir una pantalla»: «y `docs/mockups/38-panel-*.html` para las listas del panel».
  - §8, fila de `revisar-pantallas`: «capturas a 412 × 915 y 1280 × 800 (en el panel, también 820 × 1180 y 1920 × 1080)».
- **Skills:** en `.claude/skills/paquete-rv/SKILL.md`, la nota de arriba: «Hasta el piloto (DEC-193) no hay especificaciones nuevas, salvo las excepciones que diga CLAUDE.md §5 (hoy, `docs/38`)». En `revisar-pantallas`, paso 1: «en el panel, también a 820 × 1180 y 1920 × 1080».
- **09 §8**, fase 9: `docs/38`, el panel en el móvil (DEC-212), con su registro; «la siguiente especificación es `docs/39`».
- **Issues:** una por punto, con título neutro y enlace a su sección.

---

## 2. RV-501 · Los documentos primero

CLAUDE.md §2: lo que un prototipo dibuja y 01 o 06 no dicen, no se construye. Este PR pone en los documentos todo lo de §3 a §12 antes del código. Versiones nuevas en las cabeceras: 01 **1.16**, 02 **1.13**, 06 **1.34** y 10 **1.8**, cada una «aprobada por el desarrollador al pedir el cambio (`docs/38`)».

### 2.1 01

- **FR-100:** «…pensado para ordenador y usable en tableta **y en el móvil** (DEC-213)».
- **FR-120:** «columnas ordenables» pasa a «**ordenable**: por columna en el ordenador y desde el botón de filtros en la tableta y el móvil (DEC-214)».
- Tabla de trazabilidad del final: «FR-100, FR-120 (v1.16) · `docs/38` (15 oct 2026), DEC-213 y DEC-214».

### 2.2 02

- **FL-21, paso 1:** «…filtrando por operación con el botón de filtros si quiere».
- **FL-23, paso 1:** «Cambia *Pendientes* por *Aprobadas* o *Rechazadas* en el botón de filtros».
- **FL-24, paso 1:** «Filtra por tipo y estado con el botón de filtros; en el ordenador ordena por columna, y en la tableta y el móvil, desde el mismo botón (DEC-214). Busca por código o calle con la búsqueda global (FR-145)».
- **FL-24, paso 2 (Editar):** «En el ordenador, *Editar* en la fila; en la tableta y el móvil, tocando la fila. *Historial*, *Retirar* y *Borrar*, en el menú «⋯» de la fila».
- Tabla del final: en las filas FL-20–23, FL-24–26 y FL-29–31, añade «y `mockups/38-panel-*.html`».

### 2.3 06

**§2.1 y §2.4, dos tokens nuevos** (con su valor oscuro, como los `tinte-*` de hoy):

- `--tinte-gris`: claro `--gris-100` (`#E5E4DC`) con texto `--gris-700`; oscuro, un gris oscuro con texto claro que dé ≥ 4,5:1 (`tintes.test.ts`).
- `--tinte-azul`: claro `#DCE6F2` con texto `--marino-700`; oscuro, igual que el resto de tintes oscuros.
- Los usan las etiquetas nuevas y, en el mismo PR de RV-502, las de operación «Revisión», «Datos» y «Ubicación» (`COLOR_OPERACION`), que hoy se quedan claras en oscuro.

**§9.2, reglas que cambian:**

- **UI-11**, propuesta en la cola: «en el panel, en tres líneas: `Alta · HID-0147 · hace 2 h` / `C/ Real 14 · Albolote` / `Autor` (DEC-215)». Punto en las filas del Inventario: «`HID-0147 · Hidrante · 100 mm` / `Bueno` (etiqueta) `C/ Real 14 · Albolote` / `Revisado: hace 3 días`».
- **UI-12**, al final: «**En las listas del panel** (DEC-215): hasta 7 días, «hace 2 h», «hace 3 días»; después, «20 ago 2026»; nunca las dos a la vez. La fecha exacta (y la hora, si el dato la tiene), en el `title` de `<time>`. En los detalles del panel y en la app del voluntario, como hasta ahora».
- **UI-15**, al final: «En el panel (DEC-213), **44 × 44 hasta 1.099 px** de ancho; desde 1.100, 32 px como mínimo (ratón). En una casilla cuenta su etiqueta, si la envuelve».

**§9.2, reglas nuevas:**

| # | Regla |
|---|---|
| UI-17 | **Nada de «…» en los datos ni desplazamiento a lo ancho.** Si un dato no cabe, parte en otra línea. Ninguna pantalla se desplaza a lo ancho, desde 360 px. Nunca una fila de cabeceras que no esté encima de sus columnas. |
| UI-18 | **Navegación del panel por anchos** (DEC-213). Móvil < 768 px: las cinco pestañas van en el menú ☰ con su número, la cabecera dice la pestaña y la búsqueda es una lupa; un punto naranja en ☰ avisa de propuestas pendientes desde otra pestaña. Desde 768 px, las pestañas arriba en una fila, sin desplazamiento. |
| UI-19 | **Filtros y orden en un botón** (DEC-214). Un botón con el icono de filtros dice lo que está puesto y abre una hoja (móvil) o una ventana (≥ 768 px) con todos los filtros y, donde no hay cabeceras, el orden. Cada opción se aplica al tocarla. «Quitar filtros», solo con algún filtro distinto de lo de por defecto; los devuelve a eso y deja el orden. «Listo» o ✕ cierran. Con algún filtro distinto de lo de por defecto, el botón lleva el borde de 2 px `--anillo-seleccion` y negrita. |

**§5, filas que cambian.** En cada una, se cambia solo lo que se dice aquí; el resto de la fila se queda.

- **Panel: pestañas** (fila entera nueva): «Cinco: Cola de revisión · Inventario · Registro · Papelera · Ajustes (DEC-167). Desde 768 px, arriba en una fila: fondo `#F5F6F2`, activa blanca con borde inferior de 2 px `--naranja-600`, número naranja para pendientes y gris para totales. Por debajo de 768, en el menú ☰ (UI-18), con los mismos números; la activa, marcada y con `aria-current="page"`».
- **Panel con poca pantalla:** fuera «y los filtros de la Cola son tres desplegables compactos en una línea, de 44 px de alto»; la medida de 720 × 450 (al menos 4 propuestas) se queda y se vuelve a medir con las filas de tres líneas. Al final se añade: «**Por debajo de 768 px** (DEC-213): la cabecera es el escudo, el nombre de la pestaña (el `h1`, con «Panel de jefatura ·» solo para el lector), la lupa («Buscar», 44 × 44) y ☰. La lupa abre el buscador en la misma cabecera, con ✕ («Cerrar la búsqueda»); con algo escrito, el buscador se queda abierto. ☰ lleva tu correo, las cinco pestañas (cada una con su icono) y, tras una línea, «Ir al mapa» y «Cerrar sesión». Desde otra pestaña, con propuestas pendientes, un punto naranja de 10 px sobre ☰, que pasa a llamarse «Menú, hay propuestas pendientes»».
- **Panel: cola en tableta y móvil:** fuera «Abajo, una barra `--marino-950` dice "Toca una para revisarla" o, con propuestas marcadas, aprueba o rechaza en bloque»; en su lugar: «Cada fila, en tres líneas (UI-11): la etiqueta de la operación, el código o «nuevo», ⚠ si hay aviso y, a la derecha, cuándo; la dirección (o «sin dirección») y el núcleo; el autor. Nunca «…». La barra `--marino-950` de abajo **solo con algo marcado**: en el móvil, «N seleccionadas» encima de «Aprobar seleccionadas» y «Rechazar seleccionadas…», a lo ancho; en la tableta, solo los dos botones (el número ya está arriba)». Lo que dice de «Rechazar seleccionadas…» y del motivo común, como esté.
- **Panel: Inventario, filtros:** se sustituye solo la frase de los dos `<select>` («dos `<select>` nativos… «Quitar filtros»») y la de «en el móvil, Tipo y Estado lado a lado y debajo el resto» por: «El botón de filtros (UI-19): Tipo (Todos · Hidrantes · Bocas de riego) y Estado (Todos y los cinco estados con su número según el tipo, cada uno con su etiqueta de color). En la tableta y el móvil, también Ordenar por (Código, Tipo, Diámetro, Estado, Dirección, Núcleo y Última revisión; tocar otra vez el elegido cambia ▲ / ▼). En el PC se ordena por las cabeceras. En el móvil, Exportar es un botón de icono (⤓, «Exportar») con el mismo menú; sin filas, el motivo va dentro del menú, debajo de las opciones deshabilitadas». Exportar ▾, el CSV, la celda de la dirección y lo demás, como están.
- **Panel: registro:** fuera «Textos de más de 60 caracteres se recortan con «…»»; en su lugar: «Los textos largos parten en líneas, sin recortar (UI-17, DEC-215). Las claves de `config` se nombran como en la tarjeta Parámetros».
- **Panel: ventanas modales y foco:** al final: «Una ventana que se abre desde un menú «⋯» devuelve el foco a ese «⋯» al cerrarse (el elemento del menú ya no existe)».
- **Panel: Ajustes:** al final: «Orden (DEC-215): Código de acceso, Acceso de administradores, Salud del sistema, Avisos para jefatura, Parámetros, Núcleos, Mantenimiento, Código QR del enlace y Novedades. Una columna por debajo de 1.100 px, dos hasta 1.599 y tres desde 1.600, en columnas que bajan cada una a su ritmo, sin huecos (CSS `columns`). Administradores: cada uno con su etiqueta de acceso y «⋯». Mantenimiento: «error» es una etiqueta roja y el motivo va detrás en texto». Donde la fila diga que el error de un pedido va en `--rojo-texto`, se sustituye por esto.

**§5, filas nuevas:**

| Componente | Especificación |
|---|---|
| **Panel: botón de filtros y su hoja** (`docs/38` RV-504, DEC-214) | Botón secundario de 44 px: icono `SlidersHorizontal` de 16 px, el resumen de lo puesto y ▾; si el resumen no cabe, parte en dos líneas. Activo: borde de 2 px `--anillo-seleccion` y negrita. Abre, por debajo de 768 px, la **hoja inferior** de §5 con su título y ✕; desde 768, una **ventana de 400 px** debajo del botón, alineada con él, con borde `--linea`, radio 12 y sombra, que se cierra con Esc, al tocar fuera y al salir de ella con el tabulador. Dentro, un grupo por filtro: título en 12 px 700 `--texto-suave` en mayúsculas y sus opciones como chips de 44 px (radio 999, borde `--linea`; la elegida, borde de 2 px `--marino-700`, fondo `tinte-azul` y ✓ delante). En los grupos de estado y operación, el chip es la etiqueta de color, con el número detrás si lo hay. Una lista larga (las acciones del Registro) va como filas de 44 px con un círculo de radio. Abajo, separado por una línea: «Quitar filtros» (enlace, solo si hay alguno) y «Listo» (primario `--marino-950`). |
| **Panel: «⋯» de una fila** (`docs/38` RV-502) | Botón de icono `Ellipsis` de 44 × 44 (32 desde 1.100), con nombre «Más acciones de [HID-0147]». Abre un menú con el patrón de «Exportar ▾» (`docs/29` RV-123): flechas, Inicio, Fin, Esc; se pinta en un portal y se abre hacia arriba si no cabe debajo. Filas de 44 px; la destructiva, la última, en `--rojo-700` y separada por una línea (UI-14). |
| **Panel: etiquetas de estado** (`docs/38` RV-502) | Mismo dibujo que los chips de estado del punto (radio 999, 12 px 700). Acceso de un administrador: «Activo» (`tinte-verde`), «Pendiente de su primer acceso» (`tinte-ambar`), «Sin acceso» (`tinte-gris`). Pedido de Mantenimiento: «pedido» (`tinte-azul`), «lanzado» (`tinte-verde`), «error» (`tinte-rojo`), con el motivo detrás en texto. «Tú» y «Jefatura», etiquetas de 11 px (`tinte-gris` y `tinte-azul`). |

**§5, el párrafo de los mockups de arriba:** añade «y las listas del panel por anchos en [`mockups/38-panel-cola.html`](mockups/38-panel-cola.html), `38-panel-inventario.html`, `38-panel-registro.html`, `38-panel-papelera.html` y `38-panel-ajustes.html` (`docs/38`; «Propuesta» de cada pantalla)».

**Apéndice A, «Tono»:** «neutro en el panel, salvo «Tú» y «por ti», que nombran al propio administrador (DEC-215)».

**06.html:** si enseña las pestañas del panel o los filtros del Inventario, se pone al día con estas filas. Si no, nada.

### 2.4 Apéndice A

En **Panel: cola**, **Panel: resto**, **Panel: inventario…** y **Panel: ajustes**, según toque. **Este PR solo añade** (§0.7): los literales que cambian o se borran los toca el PR de código que los cambia, a la vez en `textos.ts` y aquí.

| Texto | Dónde | Hoy |
|---|---|---|
| `Filtrar la cola` · `Filtrar y ordenar` | Título de la hoja | nuevos (`Filtrar` y `Filtrar por acción` ya existen: `T.mapa.filtrar`, `T.panelRegistro.filtroAccion`) |
| `Filtros: [Pendientes · Alta]` | Nombre accesible del botón | nuevo |
| `Listo` | Pie de la hoja | nuevo (`Quitar filtros` ya existe) |
| `Estado` · `Operación` · `Núcleo` · `Tipo` · `Acción` · `Ordenar por` | Títulos de los grupos de la hoja | reutiliza los que existan; `Ordenar por` es nuevo |
| `Todas` | Primera opción de Operación | nuevo (`Todos` ya existe: `T.mapa.todos`) |
| `Tocar otra vez el elegido cambia ▲ / ▼.` | Ayuda de Ordenar por | nuevo |
| `Todas las acciones` | Resumen del botón del Registro y primera opción de su lista | hoy `todas las acciones` (R7: lo cambia RV-507) |
| `Todos los puntos` | Resumen del botón del Inventario en el PC sin filtros | nuevo |
| `Buscar` · `Cerrar la búsqueda` | La lupa y la ✕ de la cabecera del móvil | nuevos |
| `Menú, hay propuestas pendientes` | Nombre de ☰ con el punto naranja | nuevo |
| `Más acciones de [HID-0147]` · `Más acciones de [correo]` | Nombre del «⋯» | nuevo |
| `Editar [HID-0147]` | Nombre del botón que cubre la fila del Inventario (< 1.100 px) | nuevo |
| `Revisado: [hace 3 días]` · `Revisado: [20 ago 2026]` | Tercera línea de la fila del Inventario | nuevo |
| `[1] punto con este filtro` · `[4] puntos con este filtro` · `[1] punto con esta búsqueda` · `[4] puntos con esta búsqueda` | Pie del Inventario con filtro o búsqueda (con `plural`) | sustituyen a `Mostrando [n] de [N] puntos` (RV-506) |
| `＋ Añadir dirección` | Celda de dirección vacía | sustituye a `— pendiente, escribe aquí` (RV-506) |
| `Borrado [hace 1 día]` | Papelera, en filas | nuevo |
| `Tú` | Tu correo en el Registro; etiqueta en tu fila de Administradores | nuevo |
| `añadido el [5 sept 2026] por ti` | Administradores, lo que añadiste tú | nuevo (`por [correo]` sigue para los demás) |
| `Activo` · `Sin acceso` · `Pendiente de su primer acceso` | Etiquetas de acceso | `Pendiente de su primer acceso` ya existe; hoy `activo` y `sin acceso` en minúscula (los cambia RV-509) |
| `Quitar el acceso…` · `Devolver el acceso` | «⋯» de un administrador | nuevos (`Quitar el acceso`, sin «…», sigue siendo el título y el botón de la confirmación) |
| `«Añadir» se activa al escribir un correo.` | Debajo de «Añadir» deshabilitado (#753) | nuevo |
| `[Purgar fotos huérfanas] y [Respaldo ahora]: solo en producción.` | Mantenimiento, una línea, con los nombres de los botones | sustituye a los dos `Solo en producción` (RV-509) |
| `error` | Etiqueta del pedido con error, con el motivo detrás | ya existe (`pedidoErrorSinMotivo`); `error: [motivo]` sale de uso (RV-509) |
| Los nombres de la tarjeta Parámetros (`Días de papelera`, `Radios de marcador (px)`…) | Detalle de «Parámetros cambiados» en el Registro | ya existen (`T.panelAjustes`), se reutilizan |

**Salen de uso** (cada uno lo borra el PR que lo deja sin uso, de `textos.ts` y del apéndice; ESLint y `textos.test.ts` avisan): `Toca una para revisarla`, `Filtrar:` (Cola y Registro), `todas las operaciones`, `todos los núcleos`, los nombres accesibles de los tres desplegables de la Cola (`filtroOperacion`, `filtroNucleo`, `filtroEstado`) si no se reutilizan como nombre de grupo, `[nombre] · [n]` (`conNumero`), `Mostrando [n] de [N] puntos`, `— pendiente, escribe aquí`, `Acceso de [correo]` (`accesoDe`), `activo` y `sin acceso` en minúscula, `error: [motivo]`, `Solo en producción` y las variantes de Código de acceso con el número de móviles (`cambiadoPor`, `sinCambios`) si nadie más las usa. `pulsa una columna para ordenar · …` se queda: la tabla del PC la sigue enseñando.

### 2.5 08

Arriba del todo de `08-mockups-panel.html`, una nota: «Las listas del panel por anchos (móvil, tableta, PC pequeño y grande) están en `mockups/38-panel-*.html` (`docs/38`, DEC-213 a DEC-215). Donde no coinciden con este prototipo, mandan esos y 06». Nada más.

### 2.6 10

- **AC-90** (`mostrando X de N`) y **AC-169** (el desplegable de Estado): al día con el botón de filtros y el pie «N puntos con este filtro». Los casos nuevos van en RV-511.

---

## 3. RV-502 · Piezas comunes

Todo con tests de vitest (lógica pura o pintado con `react-dom/server`, §0.7). Lo único que se ve cambiar: `usePanelAncho` y los colores de tres etiquetas en oscuro.

### 3.1 Anchos

- `src/hooks/ancho.ts`: constantes con nombre para el panel, `PANEL_TABLETA = 768`, `PANEL_PC = 1100`, `PANEL_GRANDE = 1600`, y los hooks que haga falta.
- **`usePanelAncho` pasa de 1.024 a 1.100** (DEC-213): la tabla del Inventario sale desde 1.100, como la cola con el detalle (`COLA_Y_DETALLE`) y Editar a la derecha (`min-[1100px]:mr-[540px]`). Ajusta los e2e que miran el Inventario entre 1.024 y 1.099 (`panel-marcadores.spec.ts`, a 1.099).
- En Tailwind: `md:` para 768; `min-[1100px]:` / `max-[1100px]:` y `min-[1600px]:` para los otros dos (06 §5: nunca `max-[1099px]`). Ningún otro corte nuevo.

### 3.2 Tokens

- `--tinte-gris` y `--tinte-azul` en `src/index.css` (claro, oscuro por `prefers-color-scheme` y oscuro forzado, como los demás `tinte-*`) y en el `@theme` de Tailwind.
- `COLOR_OPERACION` (`piezas.tsx`): «Revisión» con `tinte-azul`, «Datos» y «Ubicación» con `tinte-gris`.
- **Test:** `tintes.test.ts` comprueba los dos nuevos (≥ 4,5:1 en claro y en oscuro).

### 3.3 La fecha de las listas (UI-12)

- `src/lib/formato.ts`: `cuando(f, ahora = new Date())`: menos de 7 días, `hace(f, ahora)`; desde 7 días, `fechaCorta(f)`.
- Componente `Fecha` (en `src/componentes/panel/piezas.tsx`): `<time dateTime={…} title={…}>{cuando(f)}</time>`.
  - `title`, con hora: `T.panelRegistro.fechaHora(fechaCorta(f), horaCorta(f))` («20 ago 2026 a las 14:05»).
  - `soloDia` para las columnas `date` (`fecha_ultima_revision`): `title` sin hora, y la fecha leída a mediodía UTC como ya hace `registro-legible.ts`, para que nunca cambie de día (TR-81).
- **Tests:** 6 días 23 h → «hace 6 días»; 7 días → la fecha (con un `ahora` fijo); el `title` con hora y sin ella; una fecha `date` no cambia de día en Madrid.

### 3.4 Etiquetas

En `piezas.tsx`, junto a `EtiquetaOperacion`:

- `EtiquetaEstado`: el chip de caudal que hoy pinta `estadoDe` en el Inventario (`claseChip`, `nombreCaudal`), para usarlo igual en la tabla, las filas y la hoja.
- `EtiquetaAcceso` (`activo` / `pendiente` / `sin_acceso`) y `EtiquetaPedido` (`pedido` / `lanzado` / `error`), con los tokens de 06 §5.
- `EtiquetaPequena` para «Tú» y «Jefatura».
- **Test:** cada una se pinta con su texto y su clase (`react-dom/server`).

### 3.5 «Tú»

- Con lo que ya hay: `useAcceso().correo` (`src/hooks/estado.ts`) y `esUnoMismo(correo, propio)` (`src/lib/panel/ajustes.ts`), como Administradores hoy. Nada nuevo en el contexto del panel.

### 3.6 El menú «⋯» de una fila

- Saca el patrón de `MenuExportar` (`Inventario.tsx`) a una pieza general, `MenuBoton`, y que `MenuExportar` la use **sin cambiar lo que hace**:
  - opciones `{ nombre, alElegir, peligro?, deshabilitada?, motivo? }`: una deshabilitada lleva `aria-describedby` a su motivo, escrito dentro del menú;
  - `ocupado` (con `aria-busy` y el texto del botón, como «Exportando…»);
  - flechas, Inicio, Fin; ↑ en el botón abre en la última; Esc devuelve el foco al botón; tocar fuera y Tab cierran;
  - el menú, en un **portal** con posición fija junto al botón, y hacia arriba si no cabe debajo: las listas están en un contenedor con `overflow-auto` y un menú dentro se cortaría.
- La opción de `peligro` va la última, en rojo y con una línea encima.
- Botón «⋯»: icono `Ellipsis` de lucide, 44 × 44 por debajo de 1.100 px y 32 desde ahí, nombre «Más acciones de …».
- **Foco al cerrar una ventana abierta desde el menú:** vuelve al «⋯» que la abrió (la opción del menú ya no existe). Quien abre la ventana le pasa ese botón (como hoy `origen` en Editar).
- **Tests:** los e2e de Exportar de hoy siguen verdes sin tocarlos (es la prueba de que no cambió).

### 3.7 Ayudas de los e2e

En `e2e/ayudas.ts`, para que los e2e lleguen igual a todos los anchos:

- `irAPestana(page, nombre)`: por debajo de 768, abre ☰ y elige; si no, pulsa la pestaña.
- `buscarEnPanel(page, texto)`: por debajo de 768, la lupa y el campo; si no, el campo.
- `abrirFiltros(page)` y `elegirFiltro(page, grupo, opcion)`.

Este PR solo las añade (con un e2e que las use a 412 y a 1280). Los e2e de hoy pasan a usarlas en RV-503 a RV-509.

---

## 4. RV-503 · Navegación del móvil (UI-18, DEC-213)

**Hoy** (`PanelJefatura.tsx`): por debajo de 1.024 px, las pestañas parten en dos filas (`flex-wrap`); por debajo de 800, la cabecera lleva el buscador dentro y ☰ con tu correo, «Ir al mapa» y «Cerrar sesión» (`MenuPequeno`).

**Cambia:**

1. **Por debajo de 768 px:**
   - el `<nav aria-label={T.jefatura.panel}>` de arriba no se pinta;
   - **la cabecera:** escudo, `h1` con «Panel de jefatura · » en `sr-only` y el nombre de la pestaña, la lupa y ☰. El `h1` sigue en la página también con el buscador abierto (en `sr-only`): `Hoja` y `Dialogo` devuelven a él el foco cuando lo que los abrió ya no está;
   - **la lupa** (44 × 44, «Buscar») cambia la cabecera a: escudo, el campo de búsqueda de hoy (el mismo `usePanel().buscar`), ✕ («Cerrar la búsqueda», que borra y cierra) y ☰. El foco va al campo al abrir y vuelve a la lupa al cerrar. Con algo escrito, el campo se queda abierto aunque se cambie de pestaña: siempre se ve qué se está buscando;
   - **☰**, en este orden: tu correo, las cinco pestañas dentro de un `<nav aria-label={T.jefatura.panel}>` (los mismos `NavLink` de `pestanas`, con un icono de lucide `aria-hidden` —`ListChecks`, `Table`, `ScrollText`, `Trash2`, `Settings`—, su número y `aria-current="page"` en la activa), una línea, «Ir al mapa» y «Cerrar sesión». Al abrir, el foco va a la pestaña activa. Elegir una pestaña cierra el menú. Lo demás, como hoy (Esc, tocar fuera, Tab fuera, cierre al ensanchar);
   - **el punto naranja:** con `pendientes.datos > 0` y la ruta fuera de `cola`, un punto de 10 px `--naranja-600` sobre ☰ y el nombre «Menú, hay propuestas pendientes». En la Cola, no.
2. **De 768 a 799:** como hoy (cabecera compacta, ☰ sin pestañas), pero las pestañas arriba **en una fila**. Caben con los nombres de hoy a 768; compruébalo con un e2e.
3. **Desde 800:** como hoy, con las pestañas en una fila (sin `flex-wrap` ni desplazamiento a lo ancho, UI-17).

**Tests (e2e, `panel-navegacion.spec.ts`):**

- a 412: no hay fila de pestañas; el `h1` dice «Cola de revisión» a la vista; ☰ lleva las cinco pestañas con «6» y «2»; elegir «Inventario» navega, cierra el menú y el `h1` dice «Inventario»;
- a 412, desde Inventario con pendientes: ☰ se llama «Menú, hay propuestas pendientes»; en la Cola, «Menú»;
- a 412: lupa → campo con el foco; escribir filtra la lista; ✕ borra, cierra y devuelve el foco a la lupa; con algo escrito, cambiar de pestaña deja el campo abierto;
- a 768, 820 y 1280: las cinco pestañas a la vista, en una fila (misma `y`), sin desplazamiento a lo ancho;
- Esc, tocar fuera y Tab cierran ☰ también a 412.

**e2e que hay que adaptar en este PR** (con `irAPestana` y `buscarEnPanel`; lo que comprueban no cambia):

- `panel-pestanas.spec.ts` (todo el archivo lee las pestañas por `navigation`);
- `jefatura-movil.spec.ts` (espera el enlace «Cola de revisión» a la vista);
- `acceso.spec.ts` (busca el encabezado por `T.panel.titulo`: a 412 el `h1` dice también la pestaña);
- `panel-poca-pantalla.spec.ts` (el buscador en la barra: a 720 sigue; por debajo de 768, tras la lupa);
- los que escriben en el buscador a 412: `panel-cola.spec.ts`, `panel-inventario.spec.ts` y `e2e/integracion/fase7.spec.ts`;
- `anchos.spec.ts` (el test de «se ven todas las pestañas»), `degradacion.spec.ts` e `inventario-editar.spec.ts`, si llegan a las pestañas por su enlace.

---

## 5. RV-504 · El botón de filtros y su hoja (UI-19, DEC-214)

Pieza nueva, `src/componentes/panel/Filtros.tsx`. La usan la Cola, el Inventario y el Registro (RV-505 a RV-507). Este PR la deja hecha; la estrena la Cola en RV-505, con sus e2e.

**Propiedades:**

```ts
interface Opcion<V extends string> {
  valor: V;
  nombre: string;     // para el resumen y el nombre accesible: «Alta», «Malo», «Código»
  adorno?: ReactNode; // si lo hay, el chip enseña esto (la etiqueta de color) en vez de `nombre`
  cuenta?: number;    // «Malo 3»
}
interface Grupo<V extends string> {
  titulo: string;     // «Estado», «Operación», «Acción»: también es el nombre del radiogroup
  opciones: Opcion<V>[];
  valor: V;
  alCambiar: (v: V) => void;
  forma?: 'chips' | 'lista'; // 'lista' para las acciones del Registro
  ayuda?: string;     // «Tocar otra vez el elegido cambia ▲ / ▼.»
}
<Filtros titulo resumen activo grupos alQuitar? lleno? />
```

**Cómo se comporta:**

- **Botón:** `min-h-11`, icono `SlidersHorizontal`, el `resumen` y ▾; `aria-haspopup="dialog"`, `aria-expanded`; nombre accesible «Filtros: [resumen]». El resumen parte en dos líneas si no cabe, nunca «…». `activo`: borde de 2 px `--anillo-seleccion` y negrita, como `Desplegable` hoy. `lleno`: ocupa el ancho que quede (móvil).
- **Por debajo de 768 px:** dentro de la `Hoja` de hoy (`src/componentes/Hoja.tsx`, sin cambiarla: la usa también la app del voluntario), con `tituloVisible={false}` y la cabecera propia de `Filtros`: el título, ✕ («Cerrar») a la derecha, el cuerpo que se desplaza (`max-h` de `70dvh`) y el pie fijo abajo. Modal, `inert` detrás, Esc, el foco entra y vuelve al botón: lo hace `Hoja`.
- **Desde 768 px:** ventana no modal debajo del botón, en posición absoluta y alineada con el borde del botón que quede dentro de la pantalla; 400 px de ancho, `role="dialog"` con `aria-label`. El foco entra al abrir; Esc cierra y devuelve el foco al botón; tocar fuera y salir con Tab la cierran (como `MenuPequeno`). Si no cabe hacia abajo, se desplaza dentro.
- **Si el ancho cruza 768 px con la hoja o la ventana abierta, se cierra** (para no quedarse en el modo equivocado).
- **Grupos:** cada uno, `role="radiogroup"` con `aria-label` = su título. Las opciones, `<button role="radio" aria-checked>` de 44 px de alto. Elegida: borde de 2 px `--marino-700`, fondo `tinte-azul`, ✓ delante (`aria-hidden`). Con `adorno`, el chip enseña el adorno (que ya lleva el nombre) en vez de `nombre`, y el nombre accesible es `nombre` (+ la cuenta); con `cuenta`, el número detrás en `--texto-suave`.
- **`forma: 'lista'`:** filas de 44 px con un círculo de radio, una debajo de otra; el grupo se desplaza dentro.
- **Se aplica al tocar:** `alCambiar` al momento; la lista de detrás cambia ya. No se cierra sola.
- **Pie:** «Quitar filtros» (enlace, solo con `activo` y `alQuitar`) y «Listo» (primario `--marino-950`), que cierra. ✕ también cierra.

**Tests:**

- vitest (`react-dom/server`): el botón dice el resumen, su nombre es «Filtros: …», lleva la marca de activo con `activo`, y un chip con `adorno` no repite el nombre;
- e2e: en RV-505 (§6), con la Cola: hoja modal a 412 (lo de detrás `inert`, Esc cierra y el foco vuelve al botón), ventana a 1280 (no modal; Tab fuera la cierra), tocar una opción no cierra, «Quitar filtros» solo con algo puesto, cruzar 768 px con la hoja abierta la cierra.

---

## 6. RV-505 · Cola de revisión

**Mockup:** `38-panel-cola.html`. **Hoy:** `ColaRevision.tsx`.

**Barra de arriba (todas las pantallas):**

- **Pendientes:** «Seleccionar todas» (la casilla, dentro de una etiqueta de 44 × 44) y, desde 768 px, «Ninguna seleccionada» / «N seleccionadas» a su lado; después, el botón de filtros. En el móvil, el botón ocupa el resto de la fila (`lleno`).
- **Historial** (Aprobadas, Rechazadas, Retiradas por el autor): «Historial: solo lectura» y el botón de filtros.
- **Fuera:** los cuatro botones de estado, los tres desplegables (`SELECT`) y «Filtrar:».

**Filtros** (`Filtros`, título «Filtrar la cola»):

- Estado: Pendientes · Aprobadas · Rechazadas · Retiradas por el autor (`ESTADOS`). Cambiarlo vacía la selección, como hoy (`cambiarEstado`).
- Operación: Todas y las seis, con `EtiquetaOperacion` como adorno.
- Núcleo: Todos y los de las propuestas cargadas (`nucleos`, como hoy).
- **Resumen:** el estado y, detrás, con « · », la operación y el núcleo si los hay: «Pendientes», «Aprobadas · Alta · Albolote».
- **Activo** si algo no es lo de por defecto (Pendientes, Todas, Todos). «Quitar filtros» vuelve a eso.

**Cada fila (lista, a todos los anchos):**

- Línea 1: `EtiquetaOperacion`, el código o «nuevo», ⚠ si `tieneAviso`, y a la derecha `<Fecha>` de `creada_en`.
- Línea 2: la dirección (o «sin dirección» en `--texto-suave`) · el núcleo (o «Fuera de zona» / «sin núcleo», como `lineaCola`).
- Línea 3: el autor.
- Sin `truncate`: lo largo parte. `lineaCola` se sustituye por una función que devuelve las tres partes; sus tests se adaptan (UI-11 nueva).
- La casilla de cada fila, dentro de una etiqueta de 44 × 44.
- **En el historial, un alta aprobada** enseña el código del punto, no «nuevo»: `correcciones.punto_id` buscado en `usePuntos()`, como ya hace `Decision` en `DetallePropuesta.tsx`. Si el punto ya no está en la lista (borrado), «nuevo», como hoy.

**Lote:**

- **Por debajo de 1.100 px:** la barra oscura de abajo **solo con algo marcado**. En el móvil, «N seleccionadas» arriba y «Aprobar seleccionadas» y «Rechazar seleccionadas…» debajo, a lo ancho y a partes iguales, con 12 px entre ellos (UI-14). En la tableta, solo los dos botones: el número ya está arriba. Sin nada marcado no hay barra, y «Toca una para revisarla» desaparece (y su texto).
- **Desde 1.100:** «Aprobar seleccionadas» y «Rechazar seleccionadas…» en la barra de arriba, **solo con algo marcado** (hoy, siempre a la vista y deshabilitados: decían lo mismo que «Ninguna seleccionada»).

**Lista y detalle desde 1.100:** la lista pasa de 340 a **360 px** (380 desde 1.600) y el detalle ocupa el resto, como hoy.

**Lo que sale una vez:** el número de pendientes, en la pestaña (o en ☰). «N seleccionadas», en un solo sitio a cada ancho.

**Tests:**

- e2e a 412: la barra dice «Pendientes»; en la hoja, «Alta» → la lista solo tiene altas, el botón dice «Pendientes · Alta» y está marcado; «Quitar filtros» lo deshace; y los de la hoja de §5;
- e2e a 412: sin marcar, no hay barra abajo ni «Toca una para revisarla»; marcar dos → «2 seleccionadas» y los dos botones; «Rechazar seleccionadas…» abre el rechazo en lote de hoy;
- e2e a 820: con dos marcadas, la barra de abajo lleva solo los dos botones y «2 seleccionadas» está arriba;
- e2e a 1280: «Aprobar seleccionadas» no está en la página sin nada marcado; marcar una lo trae; los de la ventana de §5;
- e2e a 412 y 1280: ninguna fila tiene `text-overflow: ellipsis`; una propuesta sin dirección dice «sin dirección»;
- e2e: en Aprobadas, un alta aprobada enseña el código de su punto;
- cambiar de estado en la hoja vacía la selección (el de hoy de `panel-poca-pantalla.spec.ts`, adaptado);
- a 720 × 450 se siguen viendo al menos 4 propuestas (06 §5; si no, se dice en el PR y se ajusta el alto de la fila, no el número);
- vitest de la función de las tres líneas (fuera de zona, sin núcleo, sin dirección).

**e2e que hay que adaptar:** `panel-cola.spec.ts`, `panel-poca-pantalla.spec.ts` (`filtroOperacion`, `filtroNucleo`, `filtroEstado`, `tocaUna`, `barra-cola`), `panel-tableta.spec.ts` y `e2e/integracion/fase7.spec.ts` (`filtroOperacion`).

---

## 7. RV-506 · Inventario

**Mockup:** `38-panel-inventario.html`. **Hoy:** `Inventario.tsx`.

**Barra de arriba:**

- **Móvil:** el botón de filtros (`lleno`), Exportar como botón de icono (⤓, 44 × 44, «Exportar», el mismo menú; sin filas, el motivo dentro del menú, §3.6) y Tabla/Mapa (cada botón de 44 px). Una fila.
- **Tableta y PC:** el botón de filtros a la izquierda; «Exportar ▾» y Tabla/Mapa a la derecha, como hoy.
- **Fuera:** los dos `Desplegable` y el enlace «Quitar filtros» de la barra (pasa a la hoja).

**Filtros:**

- **Por debajo de 1.100 px** (título «Filtrar y ordenar»): Tipo (Todos · Hidrantes · Bocas de riego); Estado (Todos con el total y los cinco con su `cuentaPorEstado`, cada uno con `EtiquetaEstado` como adorno); Ordenar por (las `COLUMNAS` de hoy, en su orden), con la ayuda «Tocar otra vez el elegido cambia ▲ / ▼.» y el elegido con ▲ o ▼ detrás.
- **Desde 1.100** (título «Filtrar»): solo Tipo y Estado. El orden, por las cabeceras, como hoy.
- **Resumen:** por debajo de 1.100, el tipo (si no es Todos), el estado (si no es Todos) y el orden: «Todos · Código ▲», «Malo · Código ▲», «Hidrantes · Malo · Dirección ▼». Desde 1.100: «Todos los puntos», «Malo», «Hidrantes · Malo».
- **Activo** con tipo o estado distintos de Todos (el orden no cuenta). «Quitar filtros» vuelve a Todos y Todos y deja el orden. Cambiar un filtro o el orden vuelve a la página 1 (`setN(0)`), como hoy.

**Por debajo de 1.100 px, filas** (sustituyen a las de dos líneas y a su fila de cabeceras, que desaparece):

- Línea 1: el código (JetBrains Mono, negrita) y, en `--texto-suave`, tipo · diámetro (y « · enganche Granada», UI-11).
- Línea 2: `EtiquetaEstado`, la celda de dirección (`CeldaDireccion`, se sigue editando ahí) · el núcleo.
- Línea 3: «Revisado: [`<Fecha soloDia>`]», en rojo y negrita si `revision_caducada`.
- **Tocar la fila abre Editar:** un `<button>` que cubre la fila (enlace estirado: `after:absolute after:inset-0`), con nombre «Editar [código]» y foco visible en toda la fila. La celda de dirección y «⋯» van encima (`relative z-10`) y hacen lo suyo. Un «›» a la derecha, `aria-hidden`.
- **«⋯»** (`MenuBoton`): Historial, Retirar y Borrar (peligro), con los textos de hoy. Abren los diálogos de hoy; al cerrarlos, el foco vuelve al «⋯» (§3.6).
- Para el lector de pantalla, una lista (`<ul aria-label="Inventario">`) con un elemento por punto: el `role="table"` de las filas de hoy sobra, porque ya no hay columnas a la vista.

**Desde 1.100, tabla** (la de hoy):

- Columna Acciones: «Editar» (botón secundario) y «⋯» con Historial, Retirar y Borrar. Fuera los cuatro enlaces subrayados.
- Columna Última revisión: `<Fecha soloDia>` (una fecha, un formato), en rojo si caducó.
- Diámetro, como hoy: «45 mm · enganche Granada».

**Celda de dirección vacía:** «＋ Añadir dirección», con borde discontinuo `--linea` y radio 6, para que se vea que se pulsa; 44 px de alto por debajo de 1.100. Se sigue editando en la celda.

**Pie:**

- Con filtro o búsqueda: «N puntos con este filtro» (o «con esta búsqueda»). Sin ninguno, nada: el total ya está en la pestaña.
- Las páginas, como hoy (44 px por debajo de 1.100, RV-510).
- «Pulsa una columna para ordenar · la dirección se edita en la propia celda», solo con la tabla.

**Lo que sale una vez:** el total, en la pestaña (o en ☰) y, con la hoja abierta, en «Todos 12». La revisión, una vez.

**Tests:**

- e2e a 412: no hay fila de cabeceras; el botón dice «Todos · Código ▲»; en la hoja, Estado «Malo» → 3 filas, el botón dice «Malo · Código ▲» y está marcado, el pie dice «3 puntos con este filtro»; Ordenar por «Dirección» dos veces → ▼;
- e2e a 412: tocar el código de una fila abre Editar a pantalla completa; tocar la dirección no lo abre y deja escribir; «⋯» → «Borrar» abre el diálogo de hoy y, al cancelar, el foco vuelve al «⋯»;
- e2e a 820 y 1.099: filas; a 1.100 y 1280: tabla;
- e2e a 1280: no hay «Mostrando»; la revisión no lleva una segunda fecha; «Editar» y «⋯» en cada fila; ordenar por cabecera, como hoy;
- la hoja enseña los cinco estados, Barro incluido.

**e2e que hay que adaptar:**

- `panel-inventario.spec.ts` (`colTipo`, `colEstado`, `quitarFiltros`, `ordenarPor`);
- `panel-dialogo.spec.ts` (Retirar, Historial y Borrar en «⋯»; el foco vuelve al «⋯»);
- `integracion/fase7.spec.ts` (`T.panel.mostrando`) e `integracion/fase8.spec.ts` (las acciones de la fila, a 1.400);
- `panel-marcadores.spec.ts` (`getByRole('row')` a 1.099: ahora son filas de lista);
- `vistas.spec.ts` (la vista `panel-historial` llega al Historial por «⋯»);
- `inventario-editar.spec.ts`, `controles.spec.ts`, `degradacion.spec.ts` y `panel-pestanas.spec.ts` (`mostrando`).

---

## 8. RV-507 · Registro (cierra #758)

**Mockup:** `38-panel-registro.html`. **Hoy:** `Registro.tsx`; filas por debajo de 768 (`useAncho`), tabla desde ahí.

**Barra de arriba:** el botón de filtros (título «Filtrar por acción»; un grupo «Acción» en `forma: 'lista'` con «Todas las acciones» y las de `NOMBRE_ACCION` en orden alfabético, como hoy) y, a la derecha (en el móvil, debajo), «N entradas · no se puede editar ni borrar». Resumen: «Todas las acciones» o el nombre de la elegida; activo con una acción elegida. Fuera «Filtrar:» y el `<select>`.

**Por debajo de 1.100 px, una lista** (`<ul aria-label="Registro">`, como el Inventario; sustituye a `FilasApiladas`), de tres líneas por entrada:

- Línea 1: la acción en negrita y, a la derecha, el código del punto (JetBrains Mono) **solo si hay punto**. Fuera «Punto —».
- Línea 2: el detalle (`detalleLegible`), en `--texto-suave`, partiendo donde haga falta.
- Línea 3: quién («Tú» si es tu correo; si no, el correo o el nombre), la etiqueta «Jefatura» si `es_admin`, y « · » `<Fecha>`.

**Desde 1.100, la tabla** de hoy, con sus cabeceras de hoy (Momento, Actor, Acción, Punto, Detalle): `<Fecha>`, «Tú», la etiqueta «Jefatura» y la celda de Punto **vacía** sin punto (fuera «—»). Desde 1.600, la tabla de **1.500 px como mucho**.

**Detalle con palabras** (`registro-legible.ts`):

- **Sin recortar:** fuera `recortar` y su `MAXIMO` de 60 caracteres. El texto parte en líneas (UI-17); vale también para el Historial de un punto, que usa la misma función.
- `config_cambiada`: cada clave de `config` con el nombre que tiene en la tarjeta Parámetros (`T.panelAjustes.diasPapelera`, `radiosMarcador`…): «Días de papelera: 30 → 45». Hoy, «dias_papelera: 30 → 45». El valor, como hoy.
- **#758:** `workflow_lanzado`, `exportacion` y `anonimizacion`, también con palabras: mira qué claves traen `antes` y `despues` en las funciones que escriben esas entradas y en los datos de los e2e, y nómbralas con los textos que ya usa la app (los nombres de las tareas de Mantenimiento, los formatos de Exportar).
- Una clave sin nombre se sigue enseñando tal cual (mejor que perderla), y un test lo dice.

**Tests:**

- vitest de `detalleLegible`: un texto de 120 caracteres sale entero; `config_cambiada` con nombres (el test de hoy cambia de expectativa); los tres de #758; una clave desconocida, tal cual;
- e2e a 412: tres líneas por entrada; una entrada sin punto no tiene «Punto» ni «—»; tu entrada dice «Tú» y no tu correo; elegir «Borrado» en la hoja filtra y el botón lo dice;
- e2e a 820: lista, no tabla; a 1280: tabla;
- e2e a 1920: la tabla mide como mucho 1.500 px.

**e2e y tests que hay que adaptar:** `panel-movil.spec.ts` (Registro con filas a 412; y a 768 espera una tabla: ahora es lista hasta 1.099), `panel-inventario.spec.ts` (`filtroAccion`), `registro.test.tsx` y `registro-legible.test.ts`.

---

## 9. RV-508 · Papelera

**Mockup:** `38-panel-papelera.html`. **Hoy:** `Papelera.tsx`, tabla a todos los anchos.

- **Arriba:** la explicación («Los borrados se conservan N días y después se purgan.») y **«Purgar lo caducado…» en rojo** (borde y texto `--rojo-700`, 44 px por debajo de 1.100), apartado de los «Restaurar». Con la papelera vacía, como hoy (deshabilitado), con su motivo escrito (UI-02): «La papelera está vacía.» ya lo dice debajo; enlázalo con `aria-describedby`.
- **Por debajo de 1.100 px, una lista:** el código y «Restaurar» (secundario, 44 px) a la derecha; tipo · diámetro; «Borrado [`<Fecha>`] · quedan N días» («queda 1 día» en `--rojo-700` y negrita).
- **Desde 1.100, la tabla de hoy, de 900 px como mucho:** Código, Tipo, Borrado (`<Fecha>` · quedan N días) y Restaurar.
- Sin filtros: no hacen falta.

**Tests:** e2e a 412 (lista, «Restaurar» de 44 px, «Purgar…» en rojo y no al lado de ningún «Restaurar»); a 820 (lista); a 1280 (la tabla no pasa de 900 px); el diálogo de purgar, el de hoy. **Adaptar:** `panel-movil.spec.ts` (Papelera con filas a 412 y la tabla a 768).

---

## 10. RV-509 · Ajustes (cierra #753)

**Mockup:** `38-panel-ajustes.html`. **Hoy:** `Ajustes.tsx`.

**Orden y columnas:**

- Las tarjetas en este orden: Código de acceso, Acceso de administradores, Salud del sistema, Avisos para jefatura, Parámetros, Núcleos, Mantenimiento, Código QR del enlace y Novedades.
- El contenedor de hoy (`overflow-auto`) se queda; dentro, una envoltura con una columna por debajo de 1.100 px, **dos** de 1.100 a 1.599 y **tres** desde 1.600 (`columns-*` de CSS, cada tarjeta con `break-inside: avoid` y el hueco de hoy entre ellas). Cada columna baja a su ritmo y no quedan huecos (hoy, `lg:grid-cols-2` iguala el alto de cada fila). El orden de lectura y del tabulador es el de la lista de arriba.

**Lo que sale una vez:**

- **Código de acceso** sin el número de móviles: «Sin cambios desde el arranque.» o «Cambiado por última vez el … por ….». El número está en Salud («Móviles con acceso») y en la ventana de revocar, que lo sigue diciendo.
- **Mantenimiento** (solo fuera de producción, donde hay botones deshabilitados): una sola línea debajo de los cuatro botones, «[Purgar fotos huérfanas] y [Respaldo ahora]: solo en producción.», con los nombres de los botones sacados de sus textos, y los dos botones con `aria-describedby` a ella. Hoy, dos «Solo en producción».

**Acceso de administradores:**

- Cada fila: el correo (el tuyo, con la etiqueta «Tú», §3.5); `EtiquetaAcceso` («Activo», «Pendiente de su primer acceso» o «Sin acceso»); debajo, «añadido el [fecha] por [quien]» («por ti» si fuiste tú) y, si está pendiente, la ayuda de hoy; a la derecha, «⋯».
- **«⋯»:** con acceso, «Quitar el acceso…» (peligro), que abre la confirmación de hoy (`setQuitando`, `avisoQuitarAcceso`); sin acceso, «Devolver el acceso», que hace lo de marcar la casilla (`cambiar(email, true)`). La regla de no quitar al último administrador activo sigue en el servidor (FR-141). Al cerrar la confirmación, el foco vuelve al «⋯».
- **Fuera:** la casilla y el texto «activo» / «sin acceso».
- **#753:** «Añadir» deshabilitado con «"Añadir" se activa al escribir un correo.» debajo (UI-02), con `aria-describedby`.

**Últimos pedidos:** el estado de cada uno con `EtiquetaPedido` («pedido», «lanzado», «error») y, con error, el motivo detrás en texto.

**Salud:** como está («Todo bien» ya es una etiqueta).

**Toques de 44 px por debajo de 1.100** (UI-15, con #754): los campos de Parámetros y del correo nuevo, «Renombrar» y «Añadir un núcleo», las sugerencias de correo, las casillas de Avisos y de Código de acceso (por su etiqueta) y los enlaces de Salud.

**Tests:**

- e2e a 412: el orden de las tarjetas; tu fila con «Tú» y «Activo»; «⋯» de un activo → «Quitar el acceso…» → la confirmación de hoy y, al cancelar, el foco en el «⋯»; «⋯» de uno sin acceso → «Devolver el acceso» → llama a la RPC con `activo: true`; no hay casillas en Administradores;
- e2e a 1280 y 1920: dos y tres columnas; ninguna tarjeta tiene encima, en su columna, un hueco mayor que el de entre tarjetas;
- e2e: «móviles registrados» no sale en Código de acceso y «Móviles con acceso» sí en Salud; «solo en producción» sale una vez (en staging simulado);
- **adaptar** `panel-ajustes.spec.ts` (`accesoDe`: el nombre accesible del «⋯» lleva el correo).

---

## 11. RV-510 · Pruebas de anchos, toques de 44 px (cierra #754) y vistas

**Un e2e nuevo, `e2e/listas-anchos.spec.ts`** (el nombre no empieza por `panel-`, para que el proyecto `panel-firefox` no lo repita), en el proyecto de escritorio con el ancho a mano (como `anchos.spec.ts`), para las cinco pestañas a **360, 412, 820, 1.100, 1280 y 1920** px, en claro y en oscuro:

- **sin desplazamiento a lo ancho:** `document.scrollingElement.scrollWidth <= clientWidth`;
- **sin «…»** en las listas: ningún elemento de `main` con `text-overflow: ellipsis` que desborde (`scrollWidth > clientWidth`), y ningún texto de dato que acabe en «…»;
- **toques:** por debajo de 1.100, todo botón, enlace, campo y casilla de `main` y de la cabecera mide ≥ 44 × 44 (una casilla, por su etiqueta si la envuelve); desde 1.100, ≥ 32. Las excepciones, las de UI-15, escritas en el test con su motivo;
- **axe** sin infracciones en cada pestaña a 412 y a 1280, y con la hoja de filtros y el menú ☰ abiertos a 412 (`AxeBuilder`, como `accesibilidad.spec.ts`);
- **un dato, una vez:** en el Inventario no sale «Mostrando» ni una revisión con dos fechas; en el Registro no sale tu correo (sale «Tú»); en Ajustes, «solo en producción» sale una vez y «móviles registrados» no sale.

**#754:** las páginas del Inventario y del Registro (`min-h-8 min-w-8` hoy), Tabla/Mapa, «Restaurar», la celda de dirección y los toques de Ajustes (§10), a 44 px por debajo de 1.100. Lo que haya quedado de RV-505 a RV-509, aquí. El test de arriba lo vigila.

**Vistas** (`e2e/vistas.spec.ts`, skill `revisar-pantallas`): las cinco pestañas a 412, 820, 1280 y 1920, en claro y en oscuro, y a 412 la hoja de filtros de la Cola y del Inventario, el menú ☰ y el «⋯» de una fila.

---

## 12. RV-511 · Manual, capturas, 10 e índice

- **13** (v0.5):
  - §3: en el móvil, las pestañas en ☰; la lupa; el punto naranja;
  - §4: el botón de filtros; la barra de lote solo con algo marcado;
  - §5: el botón de filtros y orden; en el móvil y la tableta, tocar la fila abre Editar y «⋯» lleva lo demás; en el ordenador, «Editar» y «⋯»; «＋ Añadir dirección»;
  - §6: el filtro del Registro; «Tú»;
  - §7: «Purgar lo caducado…» en rojo;
  - §8: Administradores, la etiqueta y «⋯»; el orden de las tarjetas.
- **Capturas** (`docs/capturas/vistas/`):
  - se sustituyen `panel-cola.png`, `panel-inventario.png`, `panel-registro.png`, `panel-historial.png` y `panel-ajustes.png`, desde el artefacto `vistas` del PR de RV-510;
  - dos nuevas del móvil, `panel-movil-menu.png` y `panel-movil-filtros.png`, enlazadas desde 13 §3 y §5;
  - su `LEEME.md`, al día (fecha, PR, tamaños).
- **10** (v1.8, que ya subió en RV-501; aquí se añaden casos):
  - **AC-179:** en el móvil, las pestañas están en ☰ con sus números; la cabecera dice la pestaña; con pendientes, el punto naranja desde otra pestaña;
  - **AC-180:** Cola: filtrar por operación y núcleo desde el botón; marcar dos y aprobarlas desde la barra de abajo;
  - **AC-181:** Inventario en el móvil: filtrar por estado, ordenar por dirección, tocar un punto abre Editar, «⋯» → Retirar;
  - **AC-182:** Registro: filtrar por «Borrado»; tus entradas dicen «Tú»;
  - **AC-183:** Ajustes: quitar y devolver el acceso a un administrador desde «⋯»;
  - **AC-184:** ninguna pantalla del panel se desplaza a lo ancho en un móvil de 360 px ni corta un dato con «…».
- **INDICE.md:** en la fila de `mockups/`, «y `38-panel-cola.html`, `38-panel-inventario.html`, `38-panel-registro.html`, `38-panel-papelera.html` y `38-panel-ajustes.html` («Propuesta» de cada pantalla), citados por 06».

---

## 13. RV-512 · Cierre

- **RV-139b** sobre el commit final.
- **Recorrido con `revisar-pantallas`** en staging, solo para leer, a 412, 820, 1280 y 1920, en claro y en oscuro: cada pestaña, la hoja de filtros, el menú ☰ y un «⋯». Al lado de su mockup: lo que no coincida y no esté en §0.6, se arregla o se explica en el registro.
- **Publicar** con `npm run publicar -- --solo-comprobar` y después `npm run publicar`. La versión, la que proponga release-please (**0.16.0**, por los `feat`).
- **Archivar:** este documento a `docs/archivo/especificaciones/`, con su fila en `INDICE.md`. Los mockups `38-panel-*.html` se quedan en `docs/mockups/` (los cita 06).

## 14. Checklist

- [ ] En el móvil, las pestañas están en ☰, la cabecera dice la pestaña, la búsqueda es una lupa y un punto naranja avisa de pendientes.
- [ ] Cola, Inventario y Registro filtran (y el Inventario ordena) desde un botón que dice lo que está puesto.
- [ ] Ninguna lista del panel enseña dos veces un dato, corta con «…» ni se desplaza a lo ancho, de 360 a 1.920 px, en claro y en oscuro.
- [ ] Una fecha, un formato, en todas las listas del panel.
- [ ] Inventario: tocar la fila abre Editar por debajo de 1.100; «Editar» y «⋯» en el PC.
- [ ] En el historial de la cola, un alta aprobada enseña su código.
- [ ] Administradores con etiqueta y «⋯»; Mantenimiento y Código de acceso sin repetidos.
- [ ] #753, #754 y #758, cerradas.
- [ ] 01, 02, 06, 08, 10, 12 y 13 al día; CLAUDE.md y las skills, también; capturas nuevas.
- [ ] Ninguna migración, RPC, Function ni workflow cambiado, ni dependencia nueva.
- [ ] 0.16.0 en producción. Este documento, archivado.

## 15. Fuera

- **Los detalles:** el detalle de una propuesta, Editar, Historial y las ventanas no cambian.
- **La app del voluntario:** nada. `Hoja` no cambia; UI-12 sigue como está fuera del panel.
- **Las variantes B y C** de los mockups.
- **Las otras issues `tras-piloto` del panel** (#750 a #752, #755 a #757, #759): siguen para después del piloto.
- **Lo que hacen personas** (DEC-193, issues `organizacion`): #76 a #85.
