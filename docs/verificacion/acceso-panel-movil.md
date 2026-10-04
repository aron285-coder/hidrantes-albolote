# Verificación · Jefatura llega al panel desde la app del móvil (docs/26 RV-113)

**Estado: hecho en código el 5 oct 2026; falta la prueba en el Android del desarrollador (§4).**
Especificación: `docs/26-acceso-al-panel-desde-el-movil.md`. Una sesión (Frontend-acceso), DEC-164,
`PW_PUERTO=4181`. Coordinación en #440.

## 1. Qué se ha hecho

| Punto | Qué | DEC |
|---|---|---|
| RV-113 · 1 | Ajustes → fila «Cuenta de jefatura» → botón secundario «Panel de jefatura» a todo el ancho, con el icono `LayoutDashboard` (lucide ya era dependencia), que abre `/admin` dentro de la app | DEC-164 |
| RV-113 · 2 | La etiqueta «Jefatura» de la barra superior es un enlace a `/admin`, `aria-label` «Abrir el panel de jefatura», chevron `›`, objetivo táctil de 44 × 44 px; el título se acorta con «…» antes que la etiqueta | DEC-164 |
| RV-113 · 3 | «Ir al mapa» del panel, sin cambios; el «atrás» vuelve a la pantalla de antes (e2e) | — |
| RV-113 · 4 | Los dos accesos navegan también sin servidor; el panel enseña su `AvisoServidor` | — |
| RV-113 · 5 | Comprobación del panel a 412 × 915 (§3) | — |

- **Textos:** `ajustes.irAlPanel` y `jefatura.abrirPanel` en `src/lib/textos.ts` y en el Apéndice A de `docs/06`.
- **Documentos:** `docs/02` v1.7 (FL-20 paso 4, FL-28 paso 3), `docs/06` v1.19 (§5 barra superior, Apéndice A), `docs/12` v1.51 (DEC-164). `docs/01` FR-150 lo escribe Ops (texto en el PR y en #440).

## 2. Lo que la especificación no esperaba

- **El texto de la etiqueta pasa de blanco a `--marino-950`.** Blanco sobre `--oro-600` da 3,2:1; al ser un control, el axe del e2e lo marca (`color-contrast`). Marino da 5,3:1. Lo comprueba `src/lib/accesibilidad.test.ts` («la etiqueta Jefatura se lee y se ve sobre la barra»). El fondo de oro, la negrita y el tamaño no cambian.
- **El botón de Ajustes usa `--texto`, no `--marino-950`**, en borde y texto (los colores del secundario de 06 §5). En claro son casi el mismo color; en oscuro `--marino-950` no cambia y se quedaría sin contraste sobre `--papel`.
- **En los formularios de las operaciones, la etiqueta no es un enlace** (`enlacePanel={false}` en `Proponer`). Un toque sin querer desmontaba el formulario sin preguntar, con las fotos y los datos. Lo encontró `pr-review-toolkit` (silent-failure-hunter); lo comprueban `BarraSuperior.test.tsx` y el e2e «en el formulario de alta…».
- **Los dos accesos son `<Link>` del router, no botones con `navigate`.** Navegan igual, sin recargar ni abrir otra pestaña, y para un lector de pantalla son un enlace a otra pantalla.

## 3. El panel a 412 × 915 (punto 5)

Capturas a 412 × 915 (Pixel 7, Chrome) de la barra con la etiqueta, de Ajustes con el botón y de las
siete pestañas del panel, con datos simulados. Se midió en cada pestaña si la página se desplaza a
lo ancho y qué controles quedan fuera de la vista. **Las capturas no se suben al repositorio:** llevan
el correo de prueba de la sesión y datos del panel.

| Pestaña | Datos con los que se vio | Desplazamiento a lo ancho | Controles fuera de la vista | ¿Se puede usar? |
|---|---|---|---|---|
| Cola de revisión | vacía | no | ninguno | sí (con filas, es de `docs/25` RV-110) |
| Inventario | 12 puntos | no | ninguno: la tabla pasa a filas apiladas | sí |
| Revisiones caducadas | 1 núcleo | no | ninguno | sí |
| Registro | vacío | no | ninguno | sí, vacío; con filas, sin comprobar |
| Papelera | vacía | no | ninguno | sí, vacía; con filas, sin comprobar |
| **Voluntarios** | 1 voluntario | no (la tabla se desplaza dentro de su caja) | **«Última» cortada; «Acciones» y «Anonimizar…» fuera, a la derecha** | **con dificultad** → #454 |
| Ajustes | configuración de prueba | no | ninguno | sí |

Las pestañas del panel salen en tres filas y la cabecera ocupa unos 200 px, pero todo se ve y se toca.

## 4. Pruebas

| Prueba | Qué comprueba | ¿Falló antes del arreglo? |
|---|---|---|
| `src/componentes/BarraSuperior.test.tsx` | con jefatura, enlace a `/admin` con su `aria-label` y chevron; 44 × 44 (`min-h-11 min-w-11`); texto marino; título truncable; sin jefatura, sin enlace | sí (3 de 4; «sin jefatura» ya pasaba) |
| `src/paginas/Ajustes.test.tsx` | con jefatura, «Panel de jefatura» enlaza a `/admin`, secundario, a todo el ancho; con voluntario, no está | sí (1 de 2; «voluntario» ya pasaba) |
| `src/lib/accesibilidad.test.ts` · etiqueta Jefatura | marino sobre oro ≥ 4,5:1; blanco no llega; oro se distingue de la barra | — (prueba de tokens) |
| `e2e/jefatura-movil.spec.ts` (proyecto `movil`, 412 × 915) | 1 · «Jefatura» abre `/admin/cola`; 2 · «Ir al mapa» vuelve a `/`; 3 · Ajustes → «Panel de jefatura» abre el panel; 4 · `goBack()` vuelve a Ajustes; 5 · voluntario sin etiqueta ni botón; axe de la barra y de Ajustes; en el formulario de alta la etiqueta no es enlace | sí (los 4 primeros; el del formulario se añadió tras la revisión) |

En local, además: `acceso`, `accesibilidad`, `anchos` y `controles` en `movil` y `escritorio`, en
verde salvo `anchos.spec.ts:273` («360 px: la rejilla de estados…», proyecto `escritorio`), que
falla 2 de cada 3 veces **también en `develop` sin este cambio**: inestable y anterior a este PR.

**Pendiente del desarrollador (docs/26 §3):** en el Android, con la app instalada y la sesión de
Google, tocar «Jefatura» y comprobar que abre el panel, y que «atrás» vuelve a la app. Anotar aquí
el resultado.
