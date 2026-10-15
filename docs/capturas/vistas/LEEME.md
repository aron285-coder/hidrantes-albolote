# Capturas de la CI, para los borradores de 13 y 14

Las del voluntario, copiadas el 2026-10-14 del artefacto `vistas` del trabajo `ci-vistas` (`e2e/vistas.spec.ts`,
docs/21 RV-88), en la CI del PR #690 (`docs/35` RV-433), el último de `develop` que tocó pantallas
en `docs/35` (RV-414). `nuevo-punto-boca.png` enseña las fotos propias de los enganches, con
Barcelona y Directo como dice DEC-194. Son de la versión
actual de la app, con **datos simulados** (`e2e/puntos.ts`): códigos `HID-90nn` y `BOC-90nn`,
descripciones `[PRUEBA]`, la voluntaria ficticia «Voluntaria Pruebas» y `jefe@example.org`.
Ninguna sale de staging ni de producción, y ningún nombre es de nadie (FR-27, DEC-053).

Las del panel se sustituyeron el 2026-10-16 (`docs/38` RV-511) con `e2e/vistas.spec.ts` del PR #805 (RV-511, sobre el de RV-510, PR #804), con el
panel simulado de `e2e/panel-simulado.ts` (`PANEL_COMPLETO`): el panel por anchos, con las listas, los filtros en un
botón y el menú ☰ del móvil.

Las del voluntario son a 412 × 915 (Pixel 7); las del panel, a 1280 × 900 (1440 × 800 el Historial) y las dos del
móvil, a 412 × 915. Modo claro.
Están en su carpeta porque `npm run capturas` reescribe `docs/capturas/LEEME.md` y sus diez PNG.

No se editan a mano: si una pantalla cambia, se copian otra vez del artefacto `vistas` del PR que
la cambie (o se lanza `npx playwright test e2e/vistas.spec.ts` y se copian de `test-results/`).

| Archivo | Vista de origen | Qué enseña |
|---|---|---|
| `mapa.png` | `mapa-412-claro` | El mapa con la zona, la leyenda abierta, Cercanos y el botón naranja de añadir |
| `lista.png` | `lista-412-claro` | La lista con los filtros, el orden y cada punto con su estado |
| `ficha.png` | `mapa-ficha-412-claro` | La ficha de un punto: banda de estado, datos, Cómo llegar, Proponer un cambio y coordenadas |
| `que-hay-aqui.png` | `que-hay-aqui-412-claro` | «¿Qué hay aquí?» tras una pulsación larga: coordenadas y Añadir un punto aquí |
| `cercanos-desde-aqui.png` | `mapa-incidente-412-claro` | Cercanos desde un punto marcado, con distancia y dirección |
| `nuevo-punto.png` | `nuevo-punto-412-claro` | Nuevo punto: el pin, tipo, caudal / estado y las dos fotos |
| `nuevo-punto-boca.png` | `nuevo-punto-boca-412-claro` | Nuevo punto de una boca de riego: diámetro y tipo de enganche |
| `ajustes.png` | `ajustes-412-claro` | Ajustes del voluntario: firma, Mis propuestas, mapa, avisos y novedades |
| `panel-cola.png` | `panel-cola-1280-claro` | Panel · Cola de revisión: el botón de filtros, la lista de tres líneas, el mapa, el cambio marcado y Aprobar / Rechazar |
| `panel-inventario.png` | `panel-inventario-1280-claro` | Panel · Inventario: el botón de filtros, Exportar, y Editar y «⋯» en cada fila |
| `panel-historial.png` | `panel-historial-1440-claro` | Panel · Historial de un punto, con palabras |
| `panel-registro.png` | `panel-registro-1280-claro` | Panel · Registro: el filtro por acción, «Tú» y qué cambió |
| `panel-ajustes.png` | `panel-ajustes-1280-claro` | Panel · Ajustes en dos columnas: código de acceso, administradores con su etiqueta y «⋯», parámetros |
| `panel-movil-menu.png` | `panel-menu-412-claro` | Panel en el móvil: el menú ☰ con las pestañas y sus números, y el punto naranja |
| `panel-movil-filtros.png` | `panel-inventario-filtros-412-claro` | Panel en el móvil: la hoja de Filtrar y ordenar del Inventario |
