# Documentación · Mapa de hidrantes · Protección Civil de Albolote

Estado al 8 de octubre de 2026. La referencia completa está en `00-README.md`.

«Congelado, versionado»: no se reescribe; cada cambio es una versión nueva, anotada en su cabecera y
pedida por una especificación (01 va por la v1.12; DEC-177).

| # | Documento | Estado |
|---|---|---|
| — | `../CLAUDE.md` (raíz del repositorio) | vivo |
| 00 | `00-README.md` · índice y reglas de propiedad | vivo |
| 01 | `01-requisitos-funcionales.md` | congelado, versionado (v1.12) |
| 02 | `02-flujos-de-usuario.md` | congelado, versionado |
| 03 | `03-requisitos-tecnicos.md` | congelado, versionado |
| 04 | `04-arquitectura-e-infraestructura.md` | congelado, versionado |
| 05 | `05-modelo-de-datos-y-api.md` | congelado, versionado |
| 06 | `06-sistema-de-diseno.md` + `06-sistema-de-diseno.html` | congelado, versionado |
| 07 | `07-mockups-app.html` · prototipo interactivo | congelado, versionado |
| 08 | `08-mockups-panel.html` · prototipo interactivo | congelado, versionado |
| 09 | `09-plan-implementacion.md` | vivo |
| 10 | `10-matriz-aceptacion.md` | vivo |
| 11 | `11-seguridad-y-privacidad.md` | vivo |
| 12 | `12-decisiones.md` | vivo |
| 13 | `13-manual-jefatura.md` · manual de jefatura (`docs/31` RV-139) | borrador, se revisa tras el piloto |
| 14 | `14-manual-voluntario.md` · manual del voluntario (`docs/31` RV-139) | borrador, se revisa tras el piloto |
| 15 | `15-continuidad-y-emergencias.md` | vivo |
| 16 | `16-alcance-y-hoja-de-ruta.md` | congelado |
| 17 | `17-cambios-revision-2026-09.md` · especificación de cambios tras la revisión del 23 sep 2026 (RV-01 a RV-32) | aplicado |
| 18 | `18-cambios-revision-2-y-mapa.md` · segunda revisión del 23 sep 2026 (RV-33 a RV-51) y funciones de mapa para emergencias (GM-00 a GM-06) | hecho el 24 sep 2026; queda §5, pendiente de decisión |
| 19 | `19-paridad-avisos-y-revision-3.md` · producción al día con staging (P-01 a P-04), avisos con un Worker y tercera revisión (RV-52 a RV-70) | vivo, hasta cerrar los bloques P, A y B |
| 20 | `20-revision-en-vivo.md` · revisión sobre staging y producción en vivo (P-10, RV-71 a RV-80), la primera en paralelo con dos sesiones | hecho el 25 sep 2026, en staging y producción (0.6.3) |
| 21 | `21-avisos-controles-y-herramientas.md` · avisos que no se activan (RV-81, RV-84, RV-86), controles del mapa (RV-82) y herramientas de Claude Code (SK-01 a SK-03), en tres sesiones | sustituida por 22 para lo pendiente |
| 22 | `22-pendientes-y-mantenimiento.md` · lo pendiente de 21 (RV-81 a RV-88) y mantenimiento: Ubuntu 26 en Actions (RV-89), archivos sueltos de los tests (RV-90), huecos de los hooks (RV-91), tareas en vivo en Salud del sistema (RV-92), vigilancia dos veces al día (RV-93) y primera purga de fotos (RV-94) | hecho el 25 sep 2026, en staging y producción (0.6.4); quedan comprobaciones del 27 y 28-09 |
| 23 | `23-novedades-y-limpieza.md` · Novedades con el número de cada línea (RV-95), «no se mide en pruebas» en staging (RV-98), issues que se cierran solas (RV-96) y release sin runs caducados (RV-97) | hecho el 25 sep 2026 (0.6.5); queda la GitHub App de RV-97 |
| 24 | `24-campo-mas-simple.md` · pantallas de campo más simples (RV-99, RV-100), racores con foto (RV-104), bocas de 70 mm y otra medida (RV-101), estado «Barro» (RV-102) y foto del sitio (RV-103), en tres sesiones | hecho el 4 oct 2026 (0.7.0); las fotos propias de los racores, pendientes |
| 25 | `25-lista-ficha-cola-y-colores.md` · regular en amarillo RAL (RV-105), lista sin dirección (RV-106), marcador sin revisar (RV-107), ficha con banda de estado (RV-108), coordenadas con su sistema (RV-109), cola con mapa y datos completos (RV-110), «Tipo de enganche» (RV-112) y mockups (RV-111), en cuatro sesiones | hecho el 4 oct 2026, en staging; producción con P-15 |
| 26 | `26-acceso-al-panel-desde-el-movil.md` · jefatura llega al panel desde la app del móvil (RV-113), en una sesión | hecho el 4 oct 2026, en staging; probado en el Android por el desarrollador |
| 27 | `27-cercanos-simplificado.md` · Cercanos más simple, un botón por fila (RV-114), en una sesión | hecho el 4 oct 2026, en staging; falta la prueba en el Android |
| 28 | `28-cola-sin-senales-y-pendientes.md` · detalle de la cola sin señales (RV-115), Voluntarios en el móvil (RV-116), contraste del panel oscuro (RV-117), test inestable de anchos (RV-118) y tope de los marcadores (RV-119), en dos sesiones | hecho en staging (oct 2026); producción con la siguiente release |
| 29 | `29-inventario-y-editar.md` · panel con cinco pestañas (RV-122), Inventario con Tipo y Estado (RV-123), Editar en panel lateral con mover el punto (RV-124), enganche Directo (RV-120, RV-121), sin «Algo no funciona» (RV-125) y anonimizar por script (RV-126), en cuatro sesiones | hecho en staging (oct 2026); producción con la siguiente release |
| 30 | `30-registro-legible-y-foco.md` · el Registro dice qué cambió (RV-127), el foco no sale de las ventanas del panel (RV-128) y lint sin advertencias (RV-129), en una sesión | hecho en staging (oct 2026); producción con la siguiente release |
| 31 | `31-revision-completa.md` · revisión completa del 7 oct 2026: producción protegida, copias fuera de GitHub, release y defectos (RV-130 a RV-169), en cuatro sesiones y tres oleadas | hecho el 8 oct 2026, en staging y en producción (0.9.0, `docs/32` RV-200); la segunda copia en R2, descartada (DEC-180) |
| 32 | `32-segunda-revision-y-recorrido.md` · segunda revisión completa del 8 oct 2026: 0.9.0 a producción, el único respaldo vigilado, Dependabot con lista de permitidos, topes de espacio y de propuestas (0041), arreglos de campo y del panel, y recorrido completo de la app en staging (RV-200 a RV-271), en cuatro sesiones y cuatro oleadas | hecho el 9 oct 2026, en staging y producción (0.10.0); recorrido en `verificacion/recorrido-staging-2026-10-08.md` |
| 33 | `33-mejoras-y-defectos.md` · mejoras de UI elegidas del recorrido (U1 a U15), defectos (D, N), la entrada del día del lanzamiento con «abrir la entrada 24 h» (RV-300), topes de espacio y reservas, staging con fotos, huella GPG en el workflow y release 0.11.0 (RV-300 a RV-345), en cuatro sesiones y tres oleadas | hecho el 9 oct 2026, en staging y producción (0.11.0); recorrido en `verificacion/recorrido-staging-2026-10-09.md` |
| 34 | `34-cierre-antes-del-piloto.md` · lo pendiente del recorrido (plurales, buscador, panel en el móvil, Ajustes con novedades, staging con foto del sitio, tintes en oscuro), fotos propias de los enganches, limpieza de la documentación y release 0.12.0 (RV-350 a RV-362), en una sesión; última especificación antes del piloto (DEC-193) | en curso |
| — | `mockups/` · mockups definitivos de las especificaciones: `25-lista.html` (solo §1), `25-ficha.html` y `25-cola.html` y `27-cercanos.html` (solo la versión A), `29-inventario-y-editar.html` (solo la versión B) y `33-mejoras.html` («Ahora» y «Propuesta» de cada mejora de `docs/33`) | vivo |
| — | `trabajo-en-paralelo.md` · cómo repartir una especificación grande entre tres sesiones de Claude Code (Ops, Backend, Frontend), y PAR-01 (DEC-100) | vivo |
| — | `entornos.md` · lo que dejó el arranque (refs, buckets, secretos por nombre) | vivo |
| — | `verificacion/fase-N.md` · qué se ejecutó al cerrar cada fase y con qué resultado | vivo |
| — | `capturas/` · pantallas de la app para 13 y 14, con su `LEEME.md` (`npm run capturas`) | vivo |
| — | `notas-para-14-ios.md` · lo que hay que contar de iPhone en el manual | vivo |
| — | `archivo/` · los dos documentos originales, sustituidos: `requisitos-hidrantes.html` v6.1 y `plan-implementacion-hidrantes.md` v2.1 | histórico |
