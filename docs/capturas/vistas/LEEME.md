# Capturas de la CI, para los borradores de 13 y 14

Copiadas el 2026-10-07 del artefacto `vistas` del trabajo `ci-vistas` (`e2e/vistas.spec.ts`,
docs/21 RV-88), en la CI del PR #482, el último de `develop` que tocó pantallas. Son de la versión
actual de la app, con **datos simulados** (`e2e/puntos.ts`): códigos `HID-90nn` y `BOC-90nn`,
descripciones `[PRUEBA]`, la voluntaria ficticia «Voluntaria Pruebas» y `jefe@example.org`.
Ninguna sale de staging ni de producción, y ningún nombre es de nadie (FR-27, DEC-053).

Las del voluntario son a 412 × 915 (Pixel 7); las del panel, a 1280 × 800 o 1440 × 800. Modo claro.
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
| `panel-cola.png` | `panel-cola-1280-claro` | Panel · Cola de revisión: lista, mapa, el cambio marcado y Aprobar / Rechazar |
| `panel-inventario.png` | `panel-inventario-1280-claro` | Panel · Inventario: filtros de Tipo y Estado, Exportar y acciones por fila |
| `panel-historial.png` | `panel-historial-1440-claro` | Panel · Historial de un punto, con palabras |
| `panel-registro.png` | `panel-registro-1440-claro` | Panel · Registro: quién hizo qué y qué cambió |
| `panel-ajustes.png` | `panel-ajustes-1280-claro` | Panel · Ajustes: código de acceso y Salud del sistema |
