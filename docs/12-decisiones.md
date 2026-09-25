# 12 · Registro de decisiones — Mapa de hidrantes

| | |
|---|---|
| **Estado** | Vivo. Cada decisión se anota **el mismo día** que se toma. Nunca se edita una entrada cerrada: si cambia, se añade otra que la sustituye y se enlazan. |
| **Versión** | 1.41 — 25 de septiembre de 2026 (DEC-129; v1.40: DEC-128; v1.39: DEC-116; v1.38: DEC-115; v1.37: DEC-114; v1.36: DEC-111 a DEC-113; v1.35: DEC-104; v1.34: DEC-101; v1.33: DEC-103; v1.32: DEC-102; v1.31: DEC-100; v1.30: DEC-099; v1.29: DEC-098; v1.28: DEC-097; v1.27: DEC-096; v1.26: DEC-095; v1.25: DEC-089, DEC-092, DEC-093; v1.24: DEC-091; v1.23: DEC-090; v1.22: DEC-094; v1.21: DEC-082 a DEC-088; v1.20: DEC-081; v1.19: DEC-080; v1.18: DEC-079; v1.17: DEC-078; v1.16: DEC-077; v1.15: DEC-076; v1.14: DEC-075; v1.13: DEC-074; v1.12: DEC-073; v1.11: DEC-072; v1.10: DEC-071; v1.9: DEC-069 y DEC-070; v1.7: DEC-065 a DEC-068; v1.4: DEC-060 a DEC-064; v1.3: DEC-052 a DEC-059; v1.1: DEC-037 a DEC-051) |
| **Propietario de** | qué se decidió, cuándo, por qué, qué se descartó y a qué documentos afecta. |
| **Formato** | `DEC-nnn` · fecha · estado (vigente / sustituida por DEC-xxx) · decisión · contexto · alternativas descartadas · consecuencias · documentos afectados. |

Las fechas anteriores al 16 de septiembre de 2026 reconstruyen decisiones tomadas en las versiones
1–5 del documento de requisitos; su fecha exacta no consta y se indica la versión.

---

## Producto y alcance

### DEC-001 · Aplicación web instalable (PWA), no app nativa
- **Fecha:** requisitos v1–v2 · **Estado:** vigente
- **Decisión:** una única web instalable para móvil, tableta y ordenador.
- **Por qué:** sin tiendas de aplicaciones, sin dos bases de código, actualizaciones instantáneas, coste 0 €.
- **Descartado:** app Android nativa (dejaría fuera iPhone y exigiría publicación en tienda).
- **Consecuencias:** en iPhone la instalación es manual (Compartir → Añadir a pantalla de inicio); Safari puede desalojar datos locales, de ahí el contador de pendientes siempre visible.
- **Afecta a:** 01 FR-04, 03 TR-20, 04 §2.

### DEC-002 · Sin cuentas individuales para voluntarios
- **Fecha:** requisitos v2 · **Estado:** vigente
- **Decisión:** código de grupo compartido más nombre y apellido tecleados; la identidad técnica es el dispositivo.
- **Por qué:** 65 personas con soltura muy distinta; gestionar 65 cuentas caería sobre una sola persona.
- **Descartado:** cuentas con correo y contraseña; enlaces mágicos por correo (no hay correos de todos).
- **Consecuencias:** el nombre es atribución, no autenticación; todo control de propiedad va contra `dispositivo_id` (04 §3.5).
- **Afecta a:** 01 §2, 05 §2.4, 11 §2.

### DEC-003 · Todo pasa por moderación de jefatura
- **Fecha:** requisitos v1 · **Estado:** vigente
- **Decisión:** los voluntarios proponen; solo jefatura escribe en el mapa.
- **Por qué:** un dato falso en un servicio de emergencia es peor que un dato tardío; el código compartido hace imprescindible la revisión.
- **Descartado:** publicación directa con revisión posterior.
- **Consecuencias:** la cola de revisión es la pieza que decide si el proyecto vive a los seis meses; de ahí el diff, el bloque y las señales.
- **Afecta a:** 01 §3 y §8, 04 §3.2.

### DEC-004 · Código de acceso de 6 dígitos
- **Fecha:** requisitos v5 (jefatura) · **Estado:** vigente
- **Decisión:** 6 dígitos numéricos.
- **Por qué:** facilidad para 65 personas; jefatura lo prefirió a 8 caracteres alfanuméricos.
- **Descartado:** 8 caracteres alfanuméricos (recomendación técnica de la v1 del plan).
- **Consecuencias:** la brevedad se compensa con cinco capas de protección (11 §3) y con el token de dispositivo.
- **Afecta a:** 01 FR-30, 03 TR-41, 11 §3.

### DEC-005 · Seis operaciones, con la revisión "sigue igual" como operación propia
- **Fecha:** requisitos v3 · **Estado:** vigente
- **Decisión:** alta, revisión, actualizar estado, corregir datos, corregir ubicación, proponer retirada.
- **Por qué:** distinguir tipos de cambio evita que la cola se llene de confirmaciones rutinarias; la revisión se aprueba en bloque.
- **Descartado:** un único "editar".
- **Afecta a:** 01 §3, 02 FL-04–08, 05 §1 (`operacion`).

### DEC-006 · Sin dominio propio: se mantiene `pages.dev`
- **Fecha:** 16 sep 2026 (jefatura) · **Estado:** vigente
- **Decisión:** no se compra dominio; coste 0 €.
- **Descartado:** dominio propio (10–15 €/año y una renovación que alguien tiene que recordar).
- **Consecuencias:** enlace fijado en el grupo, QR en la sede, acceso directo de la PWA.
- **Afecta a:** 04 §4, 09 §3.

### DEC-007 · Exportación a Excel/GeoJSON, rutas, avisos automáticos y QR: segunda fase
- **Fecha:** requisitos v4 · **Estado:** sustituida por DEC-037
- **Decisión:** fuera de la versión 1, sin cerrar la puerta (nombres de campo y RPC preparados).
- **Por qué:** la versión 1 tiene que llegar a la calle; nada de esto es necesario para responder a las tres preguntas de FR-02.
- **Afecta a:** 16, 01 §13.

## Datos del punto

### DEC-008 · Diámetro = salida mayor; hidrantes 70/100, bocas de riego 45 fijo
- **Fecha:** requisitos v4 · **Estado:** vigente
- **Decisión:** se registra el diámetro de la salida mayor, no el DN del cuerpo; dos opciones para hidrantes, ninguna pregunta para bocas de riego.
- **Por qué:** es lo observable y lo que decide qué manguera se acopla; el catálogo español (DN80/100/150) siempre da salida mayor de 70 o 100.
- **Descartado:** lista libre de diámetros; DN del cuerpo.
- **Consecuencias:** constraints en 05 §2.1; etiqueta "diámetro de la salida mayor"; opción "otra medida" (DEC-009).
- **Afecta a:** 01 FR-16, 05 §2.1.

### DEC-009 · "Otra medida" de diámetro llega marcada; jefatura fija 70 o 100
- **Fecha:** 16 sep 2026 · **Estado:** vigente
- **Decisión:** el voluntario puede indicar otra medida; el punto aprobado solo admite 70 o 100.
- **Por qué:** jefatura quiere conocer el caso raro sin forzar un dato falso ni abrir el enum.
- **Afecta a:** 01 FR-17, 05 §6.2 (`DIAMETRO_SIN_FIJAR`).

### DEC-010 · Racor solo en bocas de riego
- **Fecha:** requisitos v4 (cambiado dos veces antes; esta es la definitiva) · **Estado:** vigente
- **Decisión:** Granada / Barcelona / otro, solo para bocas de riego, con fotos de referencia en el formulario.
- **Por qué:** los hidrantes llevan racor Barcelona por UNE 23400; las variantes municipales existen en bocas de riego. Ofrecer el campo en hidrantes invita a rellenarlo mal.
- **Descartado:** racor en ambos tipos (v2); racor en ninguno (v3).
- **Afecta a:** 01 FR-20, 05 §2.1.

### DEC-011 · Foto obligatoria en toda alta y revisión; lectura pública por URL no enumerable
- **Fecha:** requisitos v5; lectura pública confirmada 16 sep 2026 · **Estado:** vigente
- **Decisión:** sin foto no se envía; la foto viaja en la cola offline; el bucket se lee públicamente por uuid.
- **Por qué:** la foto es la prueba de que alguien estuvo allí; las URL firmadas de lectura romperían la caché offline de fichas.
- **Descartado:** foto opcional (aparecía así en una tabla de la v4, contradicción resuelta); URL firmadas de lectura.
- **Afecta a:** 01 FR-21, 04 §7, 11 §4.

### DEC-012 · Cuarto nivel de la escala: "No funciona" (antes "defecto")
- **Fecha:** 16 sep 2026 · **Estado:** vigente
- **Decisión:** la escala es bueno · regular · malo · **no funciona**; enum `no_funciona`.
- **Por qué:** "defecto" no es lo que dice un voluntario en la calle; "no funciona" describe lo observado (no se pudo usar).
- **Descartado:** "defecto"; un campo aparte "tiene defecto sí/no" (dos cosas no pueden ser ciertas a la vez).
- **Afecta a:** 00 §6, 01 FR-18, 05 §1, 06 §8, todos los mockups.

### DEC-013 · Cinco tamaños de marcador, no cuatro
- **Fecha:** 16 sep 2026 · **Estado:** vigente
- **Decisión:** la fórmula diámetro × caudal se agrupa en cinco radios (11 / 9 / 7 / 5,5 / 5) configurables.
- **Por qué:** la v5 decía "cuatro tamaños" pero su propia tabla tenía cinco.
- **Afecta a:** 06 §4, 05 §2.10 (`escala_radios`).

### DEC-014 · Dirección deducida por el sistema, no tecleada
- **Fecha:** 16 sep 2026 (opción 9A) · **Estado:** vigente
- **Decisión:** reverse geocoding con Nominatim, **en servidor** (Pages Function), al revisar la propuesta; corregible por jefatura; nunca bloqueante.
- **Por qué:** la v5 prometía "búsqueda por calle" y una hoja de campo con dirección sin tener campo de dirección.
- **Descartado:** campo tecleado por el voluntario (9B: más trabajo en campo y datos inconsistentes); llamada a Nominatim desde el navegador (9C: sin control de tasa ni atribución fiable).
- **Afecta a:** 01 FR-15, 05 §2.1 y §9, 04 §6.

### DEC-015 · Fuera de zona: avisar y permitir
- **Fecha:** requisitos v5; mecanismo fijado 16 sep 2026 · **Estado:** vigente
- **Decisión:** el punto se acepta con `municipio = fuera_de_zona` y señal en la cola.
- **Por qué:** apoyos a otras agrupaciones.
- **Afecta a:** 01 FR-55, 05 §1 (`municipio`).

### DEC-016 · Duplicados: mismo tipo, resueltos en el panel, sin aviso al voluntario
- **Fecha:** requisitos v3; "mismo tipo" fijado 16 sep 2026 · **Estado:** vigente
- **Decisión:** el servidor busca el punto activo más cercano **del mismo tipo** a < 25 m (configurable); el voluntario no ve nada; jefatura compara y fusiona.
- **Por qué:** en la calle no se puede decidir si dos registros son uno; quien ve ambos es el revisor.
- **Descartado:** aviso en campo; RPC de "puntos cercanos" para el móvil (filtraría la señal).
- **Afecta a:** 01 FR-51–52, 05 §6.1.

## Acceso y seguridad

### DEC-017 · Token de dispositivo tras el primer canje; el código no vuelve a viajar
- **Fecha:** plan v1, coherencia fijada 16 sep 2026 · **Estado:** vigente
- **Decisión:** el móvil guarda un token (hash en servidor), no el código; caduca a los 365 días sin uso.
- **Por qué:** el límite de intentos no debe molestar a quien ya entró; el código no debe estar en 65 móviles.
- **Descartado:** validar el código en cada RPC (v1 del plan).
- **Afecta a:** 01 FR-31, 05 §2.4, 11 §3.

### DEC-018 · Validación del código solo a través de una Pages Function
- **Fecha:** plan v1; `execute` revocado 16 sep 2026 · **Estado:** vigente
- **Decisión:** `/api/verificar-codigo` ve la IP real (`CF-Connecting-IP`), aplica el límite por IP y llama a `fn_verificar_codigo` con `service_role`; `anon` no puede ejecutarla.
- **Por qué:** `x-forwarded-for` lo falsifica el cliente; sin revocar el `execute`, el límite por IP sería decorativo.
- **Afecta a:** 04 §6, 05 §5, 11 §3.

### DEC-019 · Subida de fotos solo con URL firmada
- **Fecha:** 16 sep 2026 · **Estado:** vigente
- **Decisión:** ninguna política de escritura para `anon`; reserva en `subidas` con cuota diaria y URL firmada de 2 h.
- **Por qué:** con `insert` abierto, cualquiera con la `anon key` podía llenar el gigabyte gratuito.
- **Descartado:** `insert` para `anon` con límite de tamaño (plan v1).
- **Afecta a:** 01 FR-38, 04 §7, 05 §2.6, 11 §4.

### DEC-020 · Permisos de hidrantes en tabla propia `administradores`
- **Fecha:** 16 sep 2026 · **Estado:** vigente
- **Decisión:** `hidrantes.administradores`, independiente de `public.app_users`; arranca con el propietario.
- **Por qué:** una columna en `app_users` haría drift en un esquema de otro repositorio; heredar sus administradores no lo decidió nadie.
- **Descartado:** columna `acceso_hidrantes` en `app_users` (plan v1); reutilizar `app_users` tal cual.
- **Afecta a:** 01 FR-37, 04 §5, 05 §2.9.

### DEC-021 · Jefatura opera desde el móvil con la misma PWA; sus cambios se aplican al momento
- **Fecha:** 16 sep 2026 (opción 12A) · **Estado:** vigente
- **Decisión:** sesión de Google en la PWA; `fn_proponer` aplica sin cola y registra como administrador.
- **Descartado:** panel separado para móvil; que jefatura proponga como un voluntario más y se apruebe a sí misma.
- **Afecta a:** 01 §12, 05 §6.1.

### DEC-022 · Anonimización por dispositivo, no por nombre; registro indefinido
- **Fecha:** 16 sep 2026 · **Estado:** vigente
- **Decisión:** `fn_anonimizar_autor(dispositivo_id)`; `registro.dispositivo_id` añadido; el registro no se borra.
- **Por qué:** los nombres se repiten; borrar filas destruiría la auditoría.
- **Afecta a:** 01 FR-131, 05 §2.3, 11 §6.4.

### DEC-023 · Sin segundo propietario disponible: cuentas institucionales
- **Fecha:** 16 sep 2026 (jefatura) · **Estado:** vigente
- **Decisión:** no hay segunda persona; las cuentas de GitHub, Cloudflare y Supabase pasan a una cuenta de Google de la agrupación con credenciales custodiadas y comprobación anual.
- **Por qué:** migrar la propiedad ahora cuesta 45 minutos; hacerlo cuando el titular no esté puede ser imposible.
- **Afecta a:** 04 §14, 15.

## Arquitectura

### DEC-024 · Supabase compartido con la app de uniformidad; esquema propio `hidrantes`; sin `supabase db push`
- **Fecha:** plan v1 · **Estado:** vigente
- **Decisión:** se reutilizan los dos proyectos existentes; historial de migraciones propio con `psql`.
- **Por qué:** el plan gratuito no permite más proyectos; dos repositorios con `db push` se pisarían.
- **Afecta a:** 04 §5, 05 §2.12.

### DEC-025 · `puntos` mutable + `registro` append-only, no libro mayor
- **Fecha:** plan v1 · **Estado:** vigente
- **Decisión:** el estado actual vive en `puntos`; la historia en `registro`.
- **Por qué:** un hidrante tiene un estado verdadero en cada momento; un ledger obligaría a recalcular en cada lectura.
- **Descartado:** el modelo de la app de uniformidad (ledger como fuente única).
- **Afecta a:** 04 §3.1, 05 §2.1 y §2.3.

### DEC-026 · Mapa base propio en PMTiles, descargado entero al móvil
- **Fecha:** plan v1 (PMTiles); descarga completa y regla R2 el 16 sep 2026 · **Estado:** vigente
- **Decisión:** archivo PMTiles propio a partir de datos OSM; descarga completa a Cache Storage; ≤ 20 MB en Pages, si no en R2 vía `VITE_MAPABASE_URL`.
- **Por qué:** la política de OSM prohíbe precargar teselas; "offline" no puede ser "lo que ya miraste".
- **Descartado:** teselas OSM precargadas; lectura por rangos como único mecanismo offline (plan v1).
- **Afecta a:** 01 FR-81, 03 TR-02–03, 04 §8.

### DEC-027 · Sin agrupación de marcadores; declutter por zoom
- **Fecha:** 16 sep 2026 · **Estado:** vigente
- **Decisión:** no se agrupan marcadores; al alejar desaparecen por tamaño; solo si la prueba de carga lo exige, agrupar a z ≤ 12.
- **Por qué:** los racimos destruyen la semántica del tamaño.
- **Descartado:** agrupar a partir de 500 puntos (plan v1).
- **Afecta a:** 01 FR-64, 06 §4.4.

### DEC-028 · Dos entornos aislados; tests solo contra Supabase local
- **Fecha:** plan v1; tests locales fijados 16 sep 2026 · **Estado:** vigente
- **Decisión:** staging (dev) y producción (prod) sin compartir nada; CI levanta Supabase local para pgTAP y e2e.
- **Descartado:** e2e contra staging (plan v1, contradecía su propia regla).
- **Afecta a:** 04 §4, 03 TR-91.

### DEC-029 · Piloto en staging con promoción de datos a producción
- **Fecha:** 16 sep 2026 (opción 7B) · **Estado:** vigente
- **Decisión:** piloto en staging; `promover-piloto.ts` copia puntos, fotos y registro conservando códigos.
- **Descartado:** piloto directamente en producción (7A: mezcla pruebas con datos reales y expone el código real antes de tiempo); piloto en staging sin promoción (7C: se pierde una semana de trabajo de campo).
- **Afecta a:** 04 §13, 09 Fase 9.

### DEC-030 · `pg_cron` para purgas SQL; GitHub Actions para lo que necesita `service_role` fuera de la BD
- **Fecha:** 16 sep 2026 · **Estado:** vigente
- **Por qué:** una purga que alguien tiene que lanzar a mano no se lanza; la purga de fotos y el respaldo necesitan tocar Storage y cifrar.
- **Descartado:** RPC `fn_purgar_fotos_huerfanas` (no puede borrar bytes de Storage).
- **Afecta a:** 04 §9, 05 §6.2.

### DEC-031 · Arranque en un solo comando; el desarrollador interviene unas dos horas en total
- **Fecha:** 16 sep 2026 · **Estado:** vigente
- **Decisión:** `scripts/arranque.ts` crea todo; solo se piden a mano el token de Cloudflare y las contraseñas de BD; si un paso exige un panel web, es un defecto del plan.
- **Afecta a:** 04 §11, 09 §1.

### DEC-032 · Estimación de ~27 días (antes 18)
- **Fecha:** 16 sep 2026 · **Estado:** vigente
- **Por qué:** la v1 daba 1,5 días a toda la calidad y no incluía URL firmadas, mapa descargable, dirección, Voluntarios ni promoción del piloto.
- **Afecta a:** 09 §4.

## Documentación

### DEC-033 · Toda la documentación en español, incluidos los documentos de construcción
- **Fecha:** 17 sep 2026 · **Estado:** vigente
- **Por qué:** continuidad sin segundo propietario; un sucesor de la agrupación lee español.
- **Descartado:** construcción en neerlandés (más cómodo para el único desarrollador actual).
- **Afecta a:** 00 §6.

### DEC-034 · Estructura de 16 documentos con un propietario por tipo de verdad
- **Fecha:** 17 sep 2026 · **Estado:** vigente
- **Por qué:** los dos archivos originales contenían la misma regla en varios sitios y ya habían producido contradicciones (foto, racor).
- **Descartado:** mantener dos archivos; fusionar 03 en 04 y 13 en 15 (se puede hacer después si pesa).
- **Afecta a:** 00.

### DEC-035 · Contratos añadidos en 05 que el plan v2.1 no tenía
- **Fecha:** 17 sep 2026 · **Estado:** vigente
- **Decisión:** columnas `duplicado_de`, `distancia_duplicado_m`, `correcciones` en `propuestas`; RPC `fn_editar_punto`, `fn_guardar_config`, `fn_historial_punto`, `fn_salud`; parámetro `prevalece` en `fn_fusionar_con_existente`; vocabulario de errores.
- **Por qué:** derivan de FR-106, FR-120, FR-142 y FR-143, que el plan describía sin darles firma.
- **Afecta a:** 05 §2.2, §6.2, §8; 09 Fases 2–3 y 7.

### DEC-036 · Los mockups son prototipos ejecutables, no imágenes
- **Fecha:** 17 sep 2026 · **Estado:** vigente
- **Decisión:** 07 y 08 son páginas HTML en las que todas las acciones funcionan sobre datos de ejemplo (código de acceso, cola offline, sincronización, aprobaciones, fusiones, papelera, código, administradores…), con un simulador de cobertura, dispositivo, tema y resolución de jefatura en 07.
- **Por qué:** jefatura valida mejor tocando que mirando; las contradicciones (botón deshabilitado sin motivo, formulario que no abre) aparecen al usarlo, no al leerlo.
- **Descartado:** mantener mockups estáticos; un prototipo en una herramienta de diseño externa (otra cuenta más que mantener).
- **Consecuencias:** 07 muestra las tres distribuciones completas (móvil, tableta, ordenador) a elección explícita, escaladas a la pantalla: el móvil a la altura de la ventana con marco, tableta y ordenador a todo el ancho; 08 ocupa el 100 % del ancho y se reorganiza por debajo de 900 px; no comparten estado entre sí (son archivos independientes); la simulación de "jefatura resuelve" en 07 sustituye al panel real.
- **Afecta a:** 07, 08, 10 (los casos AC se pueden ensayar antes en el prototipo).

### DEC-037 · Alcance de la versión 1: todo lo que Claude Code pueda construir
- **Fecha:** 17 sep 2026 (desarrollador) · **Estado:** vigente · **Sustituye a:** DEC-007
- **Decisión:** entra en la versión 1 todo lo que Claude Code pueda construir sin trabajo adicional del desarrollador, sin cuentas externas nuevas y sin coste. Pasan a v1 (como P1, tras el piloto): exportación Excel/CSV/GeoJSON, "cómo llegar", QR, notificaciones push, regenerar zona y mapa base desde Ajustes, núcleos, novedades y degradación controlada (01 §13).
- **Descartado / fuera:** dominio propio, cuentas individuales, avisos por correo o SMS (proveedor), app nativa, integraciones directas.
- **Consecuencias:** 16 se reduce a una lista corta; +2,5 días en 09; el piloto no espera a los P1.
- **Afecta a:** 01 §A y §13–14, 03 §11, 04 §6 y §9, 05 §2.12–2.13 y §9, 09, 10 §I, 16.

### DEC-038 · Skills oficiales y `CLAUDE.md` como memoria de Claude Code
- **Fecha:** 17 sep 2026 · **Estado:** vigente
- **Decisión:** el repositorio instala los skills oficiales `supabase`, `supabase-postgres-best-practices` (Supabase), `cloudflare` (Cloudflare), `webapp-testing` y `frontend-design` (Anthropic) y el skill `task-shaper` de la organización; lleva un `CLAUDE.md` con las reglas de 09 §5; cada tarea de 09 es una issue de GitHub con la forma de `task-shaper`.
- **Por qué:** los skills oficiales evitan reinventar RLS, Wrangler y Playwright con datos desactualizados; sin `CLAUDE.md` cada sesión de Claude Code empieza sin memoria; las issues son el registro de avance verificable.
- **Descartado:** skills de terceros no oficiales (calidad irregular); trabajar sin issues (el avance solo estaría en la cabeza de una sesión).
- **Afecta a:** 04 §15, 09 §1, Fase 0, §5–6.

### DEC-039 · Notificaciones por Web Push, no por correo
- **Fecha:** 17 sep 2026 · **Estado:** vigente
- **Decisión:** los avisos al voluntario (resultado de su propuesta) y a jefatura (nuevas propuestas, resumen semanal) van por Web Push con claves VAPID propias, opt-in y desactivadas por defecto.
- **Por qué:** el correo necesita un proveedor (cuenta y a menudo coste); el push no necesita nada externo y lo genera `arranque.ts`.
- **Descartado:** correo (16), SMS (coste), Firebase (cuenta externa).
- **Consecuencias:** en iPhone solo con la PWA instalada; el aviso al abrir la app (FR-90) sigue siendo el canal garantizado.
- **Afecta a:** 01 FR-163–164, 03 TR-104, 04 §6, 05 §2.12–2.13.

### DEC-040 · Estructura de 01 según *write-spec*; 09 con definición de terminado
- **Fecha:** 17 sep 2026 · **Estado:** vigente
- **Decisión:** 01 incorpora problema, objetivos medibles, no-objetivos e historias de usuario (skill `product-management:write-spec`) delante de los FR; 09 añade convenciones para Claude Code y una definición de terminado por PR (skill `task-shaper`).
- **Por qué:** los FR dicen qué; sin objetivos medibles nadie sabe si el proyecto funcionó a los seis meses.
- **Afecta a:** 01 §A, 09 §5–6.

### DEC-042 · Los nombres solo los ve jefatura
- **Fecha:** 17 sep 2026 (desarrollador) · **Estado:** vigente
- **Decisión:** ningún voluntario ve nombres de otros voluntarios ni correos de administradores en ninguna pantalla ni respuesta del servidor; quien decidió se muestra como "jefatura". Ya estaba implícito (FR-66, principio 5 de 04); pasa a requisito propio FR-27 con dos casos de aceptación.
- **Por qué:** evita comparaciones y roces entre 65 voluntarios y reduce la exposición de datos personales al mínimo (11 §6).
- **Afecta a:** 01 FR-27 y FR-106, 05 §4 y §6.1, 10 AC-133–134, 11 §2.

### DEC-043 · Jefatura valida sobre staging, no sobre documentos
- **Fecha:** 17 sep 2026 (desarrollador) · **Estado:** vigente
- **Decisión:** la primera validación de jefatura ocurre al terminar la Fase 8, sobre la aplicación en staging, con 01, 02 y 10 como guion. Hasta entonces los documentos congelados los congela el desarrollador.
- **Por qué:** jefatura valida mejor tocando; los documentos y prototipos ya existen para que Claude Code construya sin ambigüedad.
- **Riesgo aceptado:** un desacuerdo tardío puede costar retrabajo; se mitiga con issues `alcance` y con que 01 es corto de leer.
- **Afecta a:** 00 §3 y §7, 09 §1 y Fase 9.

### DEC-044 · Opus con effort high para todas las fases
- **Fecha:** 17 sep 2026 (desarrollador) · **Estado:** vigente
- **Decisión:** Claude Code trabaja con el modelo Opus y esfuerzo *high* en todas las fases, incluidas las de interfaz.
- **Por qué:** prioridad a la calidad y a que el desarrollador no tenga que revisar; el ahorro de Sonnet en las fases de UI no compensa el riesgo de retrabajo.
- **Descartado:** `opusplan`/Sonnet en fases 4–7.
- **Afecta a:** `CLAUDE.md` §1, 09 §1.

### DEC-045 · Nombres fijos de entornos y recursos
- **Fecha:** 17 sep 2026 · **Estado:** vigente
- **Decisión:** repo `hidrantes-albolote`; ramas `main`/`develop`; Environments `staging`/`production`; Pages `hidrantes-albolote` y `hidrantes-albolote-staging`; Supabase: los proyectos **prod** y **dev** existentes de la app de uniformidad, esquema `hidrantes`; buckets `hidrantes-fotos` / `hidrantes-fotos-dev`; R2 `hidrantes-mapabase[-staging]` solo si hace falta. La cuenta de Cloudflare ya pertenece a la cuenta de Google del desarrollador; el traspaso a la institucional (15 §7) se hace tras el lanzamiento.
- **Afecta a:** `CLAUDE.md` §7, 04 §4, 15 §1.

### DEC-046 · Repositorio propio en `C:\Proteccion civil`, separado del de uniformidad
- **Fecha:** 17 sep 2026 (desarrollador) · **Estado:** vigente, salvo la visibilidad: sustituida por DEC-053 (público)
- **Decisión:** `hidrantes-albolote` es un repositorio de GitHub privado e independiente, clonado en `C:\Proteccion civil\hidrantes-albolote`, hermano de `C:\Proteccion civil\uniformidad`. Sin monorepo, sin submódulos, sin código compartido. Flujo `main`/`develop`/`fase-N/…`, commits convencionales y `release-please` (04 §11.1).
- **Por qué:** los dos proyectos comparten solo la instancia de Supabase; unirlos arrastraría el historial de migraciones y las dependencias de uno al otro, justo lo que DEC-024 evita. Tenerlos al lado en disco facilita consultar convenciones sin mezclarlos.
- **Descartado:** monorepo con ambas apps; carpeta dentro del repositorio de uniformidad.
- **Afecta a:** 04 §11 y §11.1, 09 Fase 0, 15 §1 y §8, `CLAUDE.md` §6.

### DEC-047 · Reglas de interfaz numeradas y apéndice de textos exactos
- **Fecha:** 17 sep 2026 · **Estado:** vigente · **Origen:** revisión de la especificación de la app de uniformidad (§5, §6, §10.10, Apéndice B)
- **Decisión:** 06 §9 recoge las reglas de interfaz como requisitos numerados (`UI-01`…`UI-22`) —ningún control muerto, motivo en los botones deshabilitados, estado vacío en toda lista, notación canónica con ` · `, separación de acciones destructivas, objetivos táctiles— y 06 Apéndice A fija los **textos exactos** en español. Todos los textos viven en `src/lib/textos.ts`, con regla de ESLint que prohíbe literales fuera de ahí.
- **Por qué:** la app de uniformidad tuvo que corregir precisamente esos defectos (texto pegado, botones sin efecto, códigos internos visibles); escribirlos como reglas evita repetirlos. Sin textos fijados, cada pantalla acaba con su propia manera de decir lo mismo.
- **Afecta a:** 06 §9 y Apéndice A, 03 TR-110–113, 09 §6 y Fase 0, 10 §J, `CLAUDE.md` §3 y §5, 00 §4.

### DEC-048 · Concurrencia explícita en las escrituras
- **Fecha:** 17 sep 2026 · **Estado:** vigente · **Origen:** el `LockService` de la app de uniformidad
- **Decisión:** 05 §11 fija bloqueo por fila (`for update`) en toda RPC que cambia puntos o propuestas, orden de bloqueo en los lotes, `on conflict` para la idempotencia, reserva de subida en una sola sentencia, `statement_timeout` de 10 s y prohibición de peticiones de red dentro de una transacción. Tests pgTAP con dos sesiones.
- **Por qué:** dos administradores revisando a la vez es el caso normal; sin bloqueo, gana el último y se pierde una decisión. Un bloqueo global como el de uniformidad sería innecesario en Postgres.
- **Afecta a:** 05 §11, 03 TR-114, 09 Fase 3 y §6, 10 AC-142–143.

### DEC-049 · Los prototipos son referencia visual; los documentos mandan
- **Fecha:** 17 sep 2026 (desarrollador) · **Estado:** vigente · **Origen:** Apéndice D de la especificación de uniformidad
- **Decisión:** 07 y 08 fijan aspecto e interacción; ante cualquier diferencia con 01, 05 o 06 gana el documento, y el prototipo se corrige o la diferencia se anota aquí. Lo que aparece en un prototipo y no está en 01 no se construye.
- **Por qué:** los prototipos se tocan más a menudo que los documentos; sin una regla de precedencia acabarían dictando requisitos por accidente.
- **Afecta a:** 00 §2, `CLAUDE.md` §2.

### DEC-050 · Verificación escrita al cerrar cada fase
- **Fecha:** 17 sep 2026 · **Estado:** vigente · **Origen:** §17.5 de la especificación de uniformidad ("self-verify and include a How I verified note")
- **Decisión:** cada fase termina con `docs/verificacion/fase-N.md`: qué se construyó, qué casos de 10 se ejecutaron y cómo, comandos para reproducirlo, suposiciones tomadas y qué queda abierto. Sin ese archivo la fase no está terminada.
- **Por qué:** es lo que permite al desarrollador confiar sin revisar el código línea a línea, y lo que deja rastro cuando la sesión de Claude Code se cierra.
- **Afecta a:** 09 §7 y §6, 03 TR-115, 10 AC-147, `CLAUDE.md` §5.

### DEC-051 · No hay inventario previo que importar: se arranca vacío
- **Fecha:** 17 sep 2026 (jefatura/desarrollador) · **Estado:** vigente
- **Decisión:** no existe una lista previa de hidrantes (ni del ayuntamiento, ni del consorcio, ni en hoja de cálculo). Producción arranca vacía y el inventario se construye en campo, con los datos del piloto como primera carga (DEC-029). No se escribe script de importación.
- **Por qué:** se planteó al revisar la migración de la app de uniformidad, que sí partía de datos reales. Aquí no los hay; escribir un importador sin fuente sería trabajo muerto.
- **Consecuencias:** el esfuerzo de campo inicial es real (~400 puntos); las revisiones caducadas y la hoja de campo son las herramientas para repartirlo. Si algún día aparece una lista, importarla es un script de un día contra el mismo esquema.
- **Afecta a:** 04 §4 y §13, 09 Fase 9, 16 §3.

### DEC-052 · Rol propio `hidrantes_migrador`; la contraseña de `postgres` no sale del arranque
- **Fecha:** 18 sep 2026 (desarrollador) · **Estado:** vigente · **Complementa:** DEC-024
- **Contexto:** `SUPABASE_DB_URL` llevaba la contraseña de `postgres`, que también alcanza el esquema `public` de la app de uniformidad. Un fallo en un workflow de este repositorio podría dañar datos de la otra aplicación.
- **Decisión:** `arranque.ts` usa la contraseña de `postgres` **una sola vez por entorno**, en memoria y sin guardarla: habilita `postgis` y `pg_cron`, crea el esquema `hidrantes` y el rol `hidrantes_migrador` (login, contraseña aleatoria generada por el script) como propietario del esquema, con `usage` en `cron` y sin ningún privilegio en `public`. `SUPABASE_DB_URL` en GitHub lleva el usuario `hidrantes_migrador.<ref>` del pooler. `migrar.ts`, `cargar-zona.ts`, `respaldo.yml` y `restaurar.ts` trabajan con ese rol.
- **Alternativas descartadas:** guardar la contraseña de `postgres` en GitHub (alcance excesivo); migrar por la Management API (sigue haciendo falta `pg_dump` con credenciales, 09 §1).
- **Consecuencias:** una extensión nueva o un permiso fuera de `hidrantes` exige volver a ejecutar `npm run arranque` con la contraseña de `postgres`; `--rotar db` regenera la contraseña de `hidrantes_migrador`. Lo que exija privilegios de superusuario se documenta como paso de arranque, nunca como migración.
- **Afecta a:** 04 §5, §10 y §11; 09 Fase 0; 11; 15.

### DEC-053 · Repositorio público en GitHub
- **Fecha:** 18 sep 2026 (desarrollador) · **Estado:** vigente · **Sustituye en parte a:** DEC-046 (solo la visibilidad)
- **Contexto:** la cuenta de GitHub es Free. En un repositorio privado, GitHub Free no ofrece protección de ramas ni *environments* con aprobación (comprobado: "Upgrade to GitHub Pro or make this repository public"). El plan depende de ambas: `main` solo por PR con CI verde y producción solo tras la aprobación del propietario.
- **Decisión:** `aron285-coder/hidrantes-albolote` es **público**. Protección de `main` y `develop` (solo PR, CI verde, sin *force push*, también para administradores), *environments* `staging` y `production` con aprobación, escaneo de secretos con bloqueo en el *push* y alertas de Dependabot, todo por `arranque.ts`.
- **Alternativas descartadas:** privado sin protección (producción por botón manual, reglas solo de palabra, 2.000 min/mes de Actions); GitHub Pro (4 €/mes, rompe el coste 0 €).
- **Consecuencias:** la seguridad nunca descansa en que el código sea secreto (ya era así: RLS y RPC, 04 §3). Código, issues, PR y *seed* (ficticio, `[PRUEBA]`) son visibles: **nunca nombres de voluntarios, correos ni datos de contacto en issues, PR, commits ni documentación**; las incidencias de voluntarios viven en la base de datos, no en GitHub. Por lo mismo, el correo del propietario **no va en la migración 0004** (09 Fase 2): lo inserta `arranque.ts` en `hidrantes.administradores` desde `gh api user/emails`, y el *seed* de staging usa correos ficticios. El *pre-commit* y el escaneo de GitHub protegen contra secretos. Actions sin límite de minutos.
- **Afecta a:** 04 §11.1, 00 §5, 11, 15 §1, `CLAUDE.md` §3 y §7, plantillas de PR e issue.

### DEC-054 · Mantener activos los proyectos de Supabase
- **Fecha:** 18 sep 2026 · **Estado:** vigente
- **Contexto:** al empezar la Fase 0 los dos proyectos estaban en pausa: Supabase Free pausa un proyecto tras unos siete días sin actividad. En pausa no funcionan ni esta aplicación ni la de uniformidad; en una semana tranquila de verano podría pasar en producción.
- **Decisión:** `mantener-activo.yml` hace cada día una lectura de la API REST de dev y de prod con la anon key (pública por diseño). Si falla, abre una issue `vigilancia`. No usa *environments*, porque `production` exigiría aprobación en cada ejecución: la URL y la anon key van como variables del repositorio. `vigilancia.yml` (Fase 8) lo complementa, no lo sustituye.
- **Alternativas descartadas:** esperar a `vigilancia.yml` (Fase 8, demasiado tarde); servicio externo de *ping* (exige cuenta).
- **Afecta a:** 04 §9, 15.

### DEC-055 · Ajustes del arranque al construirlo
- **Fecha:** 18 sep 2026 · **Estado:** vigente
- **Decisiones**, todas de bajo riesgo, tomadas al implementar la Fase 0:
  1. **El repositorio se inicializa en la carpeta existente** (`git init` en `C:\Proteccion civil\hidrantes-albolote`, que ya tenía `docs/` y `CLAUDE.md`) y `arranque.ts` lo publica con `gh repo create --source`, en lugar de `--clone`.
  2. **Token de acceso de Supabase:** la configuración que no es SQL (esquemas expuestos en PostgREST, URL de redirección de Auth, *pooler*, claves) solo existe en la Management API, y el CLI no expone esas operaciones. `arranque.ts` pide un token personal de Supabase, lo usa en memoria y recomienda borrarlo al terminar. Los cambios de Auth y PostgREST **añaden** a lo existente, nunca sustituyen lo de uniformidad.
  3. **`GITHUB_DISPATCH_TOKEN` se crea en la Fase 7**, cuando exista `/api/lanzar-workflow`: un token *fine-grained* no se puede crear por API y hoy no lo usa nada.
  4. **Las `VITE_*` son variables de GitHub Environments**, no de Cloudflare: el build se hace en GitHub Actions y se sube con `wrangler pages deploy`, así que Pages nunca ve las variables de build. Pages solo guarda los secretos de las Functions.
  5. **`release-please` trabaja sobre `develop`**, y relanza la CI de su PR con `workflow_dispatch` (los PR abiertos con `GITHUB_TOKEN` no la disparan). La versión llega a `main` con el PR `develop → main`, sin divergencias de changelog.
  6. **Supabase local en los puertos 55420–55429**, para convivir con el Supabase local de uniformidad. `supabase start` no aplica migraciones (`[db.migrations] enabled = false`): solo crea el esquema vacío para PostgREST; el resto lo hace `migrar.ts --local`, con el mismo `arranque-bd.sql` que dev y prod.
  7. **Sin políticas de Storage:** el bucket es público para lectura y la subida solo va con URL firmada por `service_role`; no hace falta ninguna política sobre `storage.objects` (que además pertenece a `supabase_storage_admin`).
  8. **Las RPC leen el JWT con `current_setting('request.jwt.claims', true)`**: en Supabase `postgres` no puede conceder permisos sobre el esquema `auth`.
  9. **La guarda de producción y la comprobación tras desplegar son scripts con test** (`guarda-produccion.ts`, `comprobar-despliegue.ts`), no *shell* dentro del YAML.
- **Afecta a:** 04 §10, §11 y §11.1; 09 Fase 0.

### DEC-056 · Un PR `develop → main` en la Fase 0 para probar el camino a producción
- **Fecha:** 18 sep 2026 (desarrollador) · **Estado:** vigente en lo que toca a la Fase 0; la regla de no pedir otro PR a `main` hasta la Fase 9 la sustituye DEC-096
- **Contexto:** el criterio de salida de la Fase 0 (09) exige que un PR a `main`, tras aprobación, aparezca solo en producción; `CLAUDE.md` §5 dice que el PR `develop → main` no se pide hasta la Fase 9.
- **Decisión:** se hace **una** vez al cerrar la Fase 0, con producción sirviendo solo el armazón vacío (sin datos, sin banda). A partir de ahí rige `CLAUDE.md`: el siguiente PR `develop → main` es el de la Fase 9.
- **Por qué:** descubrir un fallo del despliegue a producción en la Fase 9 es lo más caro (09 §2); el armazón no expone nada.
- **Afecta a:** 09 Fase 0, `CLAUDE.md` §5.

### DEC-057 · Zona de cobertura: qué es núcleo, el margen en el servidor y la carga antes de la Fase 2
- **Fecha:** 18 sep 2026 · **Estado:** vigente
- **Decisiones**, de bajo riesgo, tomadas al construir la Fase 1:
  1. **Municipios por código INE** (`ine:municipio` 18003 y 18037), no por nombre: un nombre puede repetirse en otra provincia.
  2. **Núcleo = `place` de OSM de tipo town, village, hamlet, suburb, quarter o neighbourhood** dentro de los términos. Los `locality` son parajes sin población (El Juncal, Los Tabletares…) y no cuentan. Resultado actual: los diez de FR-53 (Albolote, Barrio Seco, La Farfana, Cortijo del Aire, El Chaparral, Parque del Cubillas, Pretel, Urb. Buenavista, Urb. El Torreón, Calicasas).
  3. **El margen de 400 m también vale en el servidor:** `limite_municipal` guarda el término sin margen; `fn_municipio_de` considera "fuera de zona" solo lo que está a más de `buffer_zona_m` de todo límite, y en el margen asigna el municipio más cercano. Así el servidor y el aviso del móvil (que usa `zona-cobertura.geojson`, con margen) nunca discrepan. Aclarado en 05 §6.3.
  4. **`cargar-zona.ts` no hace nada si las tablas aún no existen** (llegan con la migración 0001, Fase 2): avisa y sigue, para no romper el despliegue de staging entre las dos fases.
  5. **Sin `osmtogeojson`:** su versión actual arrastra `@xmldom/xmldom` con avisos críticos; los anillos se unen con una función propia de 30 líneas con test. Geometría con módulos sueltos de Turf (los mismos que usará el móvil en la Fase 6).
  6. **La previsualización usa el mapa base del IGN**: las teselas de OSM se rechazan desde un archivo local sin `Referer`.
  7. **Tres servidores Overpass** en orden; si fallan todos, los GeoJSON committeados siguen valiendo. La fuente IECA (DERA G13) queda escrita en `generar-zona.ts` como alternativa manual.
- **Afecta a:** 05 §6.3, 04 §8, 09 Fase 1.

### DEC-058 · Ajustes del esquema al construir la Fase 2
- **Fecha:** 18 sep 2026 · **Estado:** vigente
- **Decisiones**, de bajo riesgo, corregidas primero en 05 (v1.3):
  1. **Las constraints de texto obligatorio usan `coalesce`.** Tal como estaban en 05, `caudal <> 'no_funciona' or length(trim(descripcion_fallo)) > 0` dejaba pasar una descripción `NULL` (un `check` que da `NULL` se considera cumplido). Igual con el motivo de rechazo. Lo detectó el test pgTAP.
  2. **`v_puntos_activos` expone `foto_path`, no `foto_url`:** una migración no conoce la URL del proyecto de cada entorno; el cliente la compone con `VITE_SUPABASE_URL` y el bucket. Así no hace falta otra clave de `config` que mantener.
  3. **`search_path` de las funciones = `pg_catalog, hidrantes, extensions`**, no `hidrantes, public`: en Supabase PostGIS y pgcrypto están en `extensions`, y `public` es de uniformidad.
  4. **Los helpers de las vistas tienen `execute` para `authenticated`** (`fn_es_admin`, `fn_config`, `fn_radio_px`, `fn_municipio_de`): las vistas `security_invoker` y las políticas se evalúan con el rol de quien consulta. Toda otra función nace sin `execute` para `PUBLIC` (privilegios por defecto).
  5. **`registro` admite una sola reescritura:** el `actor`, cuando `fn_anonimizar_autor` activa `hidrantes.anonimizando` (11 §7). Cualquier otro cambio sigue bloqueado por el trigger. Se decide ahora para no reabrir la tabla en la Fase 3.
  6. **El propietario no va en la migración 0004** sino en `asegurar-propietario.ts`, desde el secreto `PROPIETARIO_EMAIL` (DEC-053). `arranque.ts` pregunta el correo.
  7. **La purga de la papelera se programa en la Fase 3**, con `fn_purgar_papelera` (escribe en `registro`). Las otras cuatro tareas de 04 §9 ya están en `pg_cron` con el prefijo `hidrantes_`.
  8. **Seed con códigos `9xxx`** y correos de `example.com`: se distinguen a simple vista de los reales y no consumen las secuencias.
  9. **El código de acceso se guarda con bcrypt (`crypt` + `gen_salt('bf')` de pgcrypto)**, de las dos opciones que admitía 05 §2.10: ya está en Supabase, sin extensión nueva.
- **Afecta a:** 05 §2, §4, §5, §6, §12.

### DEC-059 · Ajustes de las RPC y las Functions al construir la Fase 3
- **Fecha:** 19 sep 2026 · **Estado:** vigente
- **Decisiones**, corregidas primero en 05 (v1.4):
  1. **Ninguna función nace ejecutable por `PUBLIC` — de verdad.** `alter default privileges … in schema` solo añade permisos, nunca quita el `execute` que Postgres da a `PUBLIC`: la línea de 0001 no hacía nada. Lo detectó el primer test de la Fase 3 (`anon` podía llamar a `fn_verificar_codigo`). Staging no estaba expuesto (solo tenía 0001–0004, y 0003 revocaba todo explícitamente). Ahora 0005 fija el privilegio por defecto global del rol de migraciones, 0007 revoca y concede explícitamente, y `02_permisos` comprueba que ninguna función es de `PUBLIC` y que `anon` solo ejecuta las nueve RPC de voluntario.
  2. **`fn_verificar_codigo` devuelve el error en una columna** (`token, caduca_en, error`) en vez de lanzarlo: una excepción desharía la anotación del intento fallido y el límite de 10/30/200 no contaría nunca. Solo cuentan los fallos.
  3. **Identidad técnica del administrador = `md5` de su correo** (`fn_dispositivo_admin`), no "un uuid por sesión": así casan su reserva de foto y su propuesta aunque cambie de sesión. `/api/url-subida` acepta su JWT y llama a `fn_reservar_subida_admin()`.
  4. **El código de acceso se guarda también en claro en `config.codigo_acceso`**, legible solo por administradores (RLS), porque FR-140 pide *ver el actual*. La verificación sigue siendo por bcrypt. El código nunca va al registro.
  5. **Producción no genera el código en el primer despliegue**: el *summary* de Actions es público (DEC-053). Lo genera jefatura desde Ajustes (Fase 7). Se retira ese paso de `deploy-prod.yml`.
  6. **`sincronizado_en` con 60 s de solape**, para no perder escrituras que confirman durante la lectura.
  7. **Web Push propio** (RFC 8291 + 8292 con WebCrypto, probado con el vector de la RFC), sin dependencias; `/api/push` necesita también `VAPID_PUBLIC_KEY` en Pages, que `arranque.ts` guarda desde ahora. Los entornos ya creados la recibirán con `npm run arranque -- --rotar vapid` antes de la Fase 6 (no hay suscripciones que perder).
  8. **El bucket de fotos se deduce del dominio** en las Functions (`hidrantes-fotos` solo en el de producción), sin otra variable de Pages que mantener.
  9. **Funciones nuevas de servicio**: `fn_guardar_direccion_sugerida`, `fn_registrar_workflow`, `fn_reclamar_notificaciones`, `fn_resultado_notificacion`, `fn_purgar_papelera_interna` (pg_cron cada noche) y los helpers de 05 §6.3.
  10. **Tipos propios para las Functions** en vez de `@cloudflare/workers-types`, que choca con los tipos DOM de TypeScript 6: solo se usan `Request`, `Response`, `fetch` y WebCrypto.
- **Afecta a:** 05 §2.2, §2.10, §6, §9, §10; 04 §10 y §11; 09 Fase 0 y Fase 3.

### DEC-060 · Decisiones de detalle al construir la Fase 4 (acceso y armazón)
- **Fecha:** 19 sep 2026 · **Estado:** vigente
- **Contexto:** 01, 02 y 09 fijan qué hace la entrada, Ajustes y la degradación, pero no dónde se
  guarda la sesión, cómo se valida el token al abrir ni qué se ve de lo que aún no existe.
- **Decisiones:**
  1. **Sesión en `localStorage`** (`hidrantes.token`, `hidrantes.firma`, `hidrantes.dispositivo_id`),
     con toda lectura y escritura protegida: sin almacenamiento la app sigue en memoria (TR-07). Los
     puntos y la cola irán a IndexedDB en las Fases 5 y 6. El código nunca se escribe (TR-43).
  2. **Con token guardado se entra sin red**; después se valida con la lectura más pequeña posible
     (`fn_listar_puntos(token, desde = ahora)`). Solo un `TOKEN_*` devuelve a la entrada, con aviso
     y el nombre conservado (FR-35); un servidor caído no echa a nadie (FR-168).
  3. **Cerrar sesión renueva también `dispositivo_id`**: si el móvil pasa a otra persona, sus
     propuestas no se mezclan con las del anterior en *Mis propuestas*.
  4. **Bloqueo por intentos recordado en el móvil una hora** además del límite del servidor, para
     que la pantalla lo diga sin tener que fallar otra vez (FR-33).
  5. **Jefatura:** PKCE de Supabase en la misma PWA; después de Google, `fn_es_admin()` decide.
     Si no es administrador se cierra la sesión de Google y se ve "No autorizado". Vuelve a `/admin`
     en pantallas ≥ 900 px y a `/` en el móvil (FL-20 paso 3). Hasta la Fase 7, `/admin` solo dice
     que el panel llega después y permite ir al mapa o salir.
  6. **Ajustes muestra solo lo que ya funciona** (firma, modo oscuro, primer uso, aviso legal, cerrar
     sesión, versión y recarga). Mapa sin cobertura, sincronización, capa, Mis propuestas, avisos e
     "Algo no funciona" aparecen con su fase: UI-01 prevalece sobre el "placeholder" de 09.
  7. **Modo oscuro en tres posiciones** (Según el móvil · Siempre · Nunca), como el prototipo 07.
     Enlaces y selección usan `--texto`, porque `--marino-700` no contrasta sobre el fondo oscuro.
  8. **Degradación:** estado global con tres valores (bien, sin cobertura, sin servidor); cualquier
     llamada que no llega o recibe 5xx lo marca; reintento automático 2 → 60 s con ±20 % de azar,
     botón "Reintentar" y reintento al recuperar la red.
  9. **Errores del cliente:** cola local de los últimos 20, enviada a `fn_registrar_error` en cuanto
     hay servidor. Para probar los límites de error, fuera de producción `hidrantes.forzar_fallo = ruta`
     hace fallar esa pantalla al dibujarse (no hay control visible).
  10. **Service Worker en modo `prompt`**, no `autoUpdate`: la versión nueva se detecta al abrir y cada
      hora y se ofrece "hay una versión nueva, recargar"; recargar sola podría perder un formulario a
      medias. Cumple TR-24 (nadie pasa más de una sesión con la versión vieja).
  11. **Iconos generados con Playwright** desde el escudo de 07 (`npm run iconos`), sin dependencia
      nueva; fondo `--fondo` para iOS y zona segura del 58 % en el icono *maskable*.
  12. **Dependencias nuevas:** `@supabase/supabase-js` (Google con PKCE y llamadas a las RPC),
      `react-router` (rutas, incluida `/admin`) y `lucide-react` (iconos de 06 §7).
- **Descartado:** IndexedDB para la sesión (tres claves pequeñas no lo justifican); validar el token
  antes de mostrar nada (con mala cobertura el voluntario vería una pantalla de espera); recarga
  automática al haber versión nueva.
- **Afecta a:** 06 Apéndice A; 09 Fase 4.

### DEC-062 · Decisiones de detalle al construir la Fase 5 (mapa)
- **Fecha:** 19 sep 2026 · **Estado:** vigente
- **Contexto:** 04 §8 y 06 §4 fijan qué hace el mapa; faltaba cómo extraer el mapa base sin
  herramientas externas, cuándo descargarlo y qué hacer con lo que depende de la Fase 6.
- **Decisiones:**
  1. **Extracción propia del mapa base** (`npm run mapabase`): lee por rangos la compilación diaria
     de Protomaps con la librería `pmtiles` y escribe un PMTiles v3 con `scripts/lib/pmtiles.ts`
     (probado releyéndolo con la librería oficial). Sin descargar ni ejecutar el binario `pmtiles`.
     Zoom 10–15 del recuadro de la zona: **4,2 MB, 366 teselas**; va con el despliegue en
     `public/mapabase/` y se commitea. La versión (fecha de la compilación) está en
     `datos/mapabase.json`; el móvil la compara con la descargada. `config.version_mapabase` queda
     sin usar: la versión viaja con el propio despliegue.
  2. **`pmtiles` fijado en 3.2.1**, la misma versión que usa `protomaps-leaflet`: una sola copia.
  3. **Descarga automática** al arrancar si no está descargado y la conexión es wifi o el móvil no
     dice cuál es (iPhone); nunca con ahorro de datos ni con datos móviles declarados. La versión
     nueva se ofrece en Ajustes, no se fuerza. Cerrar sesión no borra el mapa base (no es personal).
  4. **La ficha no muestra "Proponer un cambio" hasta la Fase 6**: las operaciones aún no existen
     (UI-01 prevalece sobre la tarea de 09, como en DEC-060).
  5. **Anillo de selección en oscuro:** `--marino-950` no se ve sobre el mapa oscuro; token nuevo
     `--anillo-seleccion` (`#E6EAF0`, el del prototipo 07) añadido primero a 06 §2.4. Pendiente de la
     conformidad de jefatura por ser 06 un documento congelado.
  6. **Catastro va superpuesto** al mapa base propio (FR-63 lo llama "superpuesta").
  7. **El punto elegido va en la URL** (`/?p=id`): la lista, la búsqueda y el mapa llevan al mismo
     sitio y "atrás" cierra la ficha. Móvil: ficha a pantalla completa; ≥ 768 px flotante; ≥ 900 px
     además la lista lateral (FR-70).
  8. **Posición solo en memoria**, nunca enviada ni guardada; se sigue desde el arranque solo si el
     permiso ya estaba concedido. Sin posición, "distancia" ordena por código.
  9. **Fotos ya vistas en caché del Service Worker** (CacheFirst, 800 fotos, 180 días) para que la
     ficha las enseñe sin cobertura (DEC-011).
  10. **Jefatura en el móvil lee `v_puntos_activos`** con su sesión de Google (no tiene token de
      dispositivo): lectura completa en cada sincronización.
  11. **Dependencias nuevas:** `leaflet` (mapa), `protomaps-leaflet` y `@protomaps/basemaps`
      (dibujo y estilos del mapa base vectorial), `pmtiles` (lectura del archivo, en la app y en el
      script).
- **Descartado:** el binario `pmtiles extract` (descarga de un ejecutable; lo mismo se hace en JS);
  descargar el mapa base en datos móviles sin preguntar; agrupar marcadores en racimos (06 §4.4).
- **Afecta a:** 06 §2.4, §4.3 y Apéndice A; 09 Fase 5; 04 §8 (el mapa base cabe en Pages).

### DEC-063 · Decisiones de detalle al construir la Fase 6 (operaciones)
- **Fecha:** 20 sep 2026 · **Estado:** vigente
- **Contexto:** 02 y 05 §7/§10 fijan qué manda cada operación y el orden de envío; faltaba cómo se
  comporta la cola, qué se ve mientras tanto y qué hacer con lo que aún no existe.
- **Decisiones:**
  1. **Todo pasa por la cola**, haya cobertura o no: se guarda la propuesta con su foto en IndexedDB
     y se envía al momento si se puede. Un único camino para probar y ningún envío que se pierda si
     la red cae a medias. La pantalla de resultado dice "Enviado", "Guardado en el móvil" o
     "Aplicado" según lo que haya pasado de verdad.
  2. **Reintentos:** retroceso de 2 s a 60 s contra un servidor caído; al volver la red o pulsar
     "Reintentar" se intenta todo ya. Cuota de fotos agotada: se reintenta cada hora. Errores
     permanentes (punto ya no activo, datos no válidos, falta foto) se enseñan en Mis propuestas con
     "Descartar" y confirmación. `FOTO_NO_RESERVADA` hace subir la foto otra vez con la misma marca.
  3. **Foto:** se endereza con la orientación de la cámara, lado mayor ≤ 1600 px, JPEG que baja de
     calidad hasta ≈ 300 kB; el lienzo no copia EXIF. La posición EXIF se lee con un lector propio
     (sin dependencias) y viaja como `exif_lat/exif_lng`. En "corregir datos" la foto es opcional,
     como en 05 §6.
  4. **Jefatura en el móvil firma como "Jefatura" + su correo** en `autor_*` (el registro ya usa su
     correo); no tiene Mis propuestas ni avisos push de voluntario.
  5. **Fotos de referencia del racor pendientes:** no hay fotos reales de los racores de Albolote.
     Hasta que jefatura las haga, las tarjetas llevan solo el nombre; se añadirán en
     `src/activos/racores/` sin tocar la lógica. Un dibujo inventado podría inducir a error.
  6. **"Algo no funciona" necesita cobertura** (no pasa por la cola): el botón lo dice.
  7. **Avisos push:** interruptor en Ajustes con la explicación antes del permiso; en iPhone sin
     instalar se dice que primero hay que instalarla. Tras cada sincronización el móvil llama a
     `/api/push`. `VAPID_PUBLIC_KEY` se ha puesto en Pages (staging y producción) desde la variable
     pública de GitHub, sin rotar claves.
  8. **Cerrar sesión** borra también la cola, Mis propuestas guardadas y la suscripción push,
     avisando antes de cuántos envíos se perderán.
  9. **Dependencia movida:** `@turf/boolean-point-in-polygon` pasa de desarrollo a la app (aviso de
     fuera de zona, FR-55).
- **Descartado:** enviar directamente sin cola cuando hay red (dos caminos y más fallos posibles);
  bloquear el alta fuera de zona (FR-55 dice avisar).
- **Afecta a:** 06 Apéndice A; 09 Fase 6.

### DEC-064 · Botón propio para instalar la app y "Mi posición" en el mapa de los formularios
- **Fecha:** 20 sep 2026 (desarrollador, tras probar staging en Android) · **Estado:** vigente
- **Contexto:** en Chrome para Android el desarrollador no encontró cómo instalar la app: la opción
  del menú cambia de nombre con el idioma y la versión ("App installeren", "Añadir a pantalla de
  inicio"…) y las instrucciones decían "Instalar aplicación". Chrome sí la consideraba instalable
  (sin errores de instalabilidad salvo el modo incógnito de la prueba). Además, en el minimapa de un
  alta no había forma de volver a la posición propia.
- **Decisiones:**
  1. La app escucha `beforeinstallprompt` y ofrece su propio botón "Instalar": un aviso en el mapa
     que se cierra una vez para siempre y una fila fija en Ajustes. En iPhone (sin ese evento) Ajustes
     explica Compartir → Añadir a pantalla de inicio; en otros navegadores, el menú.
  2. El minimapa de los formularios tiene el botón "Mi posición", como el mapa principal: centra en
     el GPS y, en un alta, devuelve el pin al GPS (origen `gps`). En "corregir ubicación" solo centra,
     para no mover el pin sin querer. Si el pin cambia fuera de la vista, el mapa lo sigue.
- **Afecta a:** 06 Apéndice A; notas para 14.
- **Corregida en parte por DEC-066** (el mapa ya no sigue al pin).

### DEC-065 · Cómo se construye la cola de revisión del panel
- **Fecha:** 20 sep 2026 · **Estado:** vigente
- **Contexto:** la Fase 7 empieza por la cola (FR-100–FR-110). El contrato de 05 ya tenía todas las
  RPC; faltaba decidir qué calcula el panel, qué pide a la base de datos y qué umbrales usan las
  señales de fiabilidad (FR-104), que 01 describe sin números.
- **Decisiones:**
  1. El panel **lee** vistas y tablas con la sesión de Google (RLS de 05 §5) y **escribe** solo por
     RPC. Las lecturas pasan por `src/lib/panel/consultas.ts`, que devuelve `Resultado` y anota si el
     servidor responde, igual que `rpc()`.
  2. `v_cola_revision` gana dos columnas (migración 0008): `nucleo` —el del punto o, en un alta, el
     que se deduce del pin— y `punto_actualizado_en`, para explicar desde cuándo está desactualizada
     una propuesta. Sin ellas, la lista no podía escribir "Autor · hace 2 h · calle · núcleo" (FR-101).
  3. El historial (FR-109) se lee de `propuestas` con un tope de 300 filas por estado; el histórico
     completo es el Registro (FR-123).
  4. Umbrales de las señales: GPS "poco preciso" por encima de **20 m**; foto hecha a más de **30 m**
     del pin. El resto de señales no necesitan umbral (origen del pin, fuera de zona, duplicado,
     "otra medida", desactualizada, antigüedad de la revisión anterior).
  5. La dirección deducida se pide a `/api/direccion` al abrir una propuesta con pin si aún no la
     tiene; lo que quede escrito solo viaja como `correcciones.direccion` si difiere de la deducida.
  6. Con "otra medida" el botón *Aprobar* queda deshabilitado con el motivo escrito (UI-02): hay que
     fijar 70 o 100 en *Aprobar con correcciones*, que es lo que `fn_aprobar` exige (DIAMETRO_SIN_FIJAR).
  7. **No se construye** lo que el prototipo 08 enseña pero ningún requisito pide: "Borrar
     definitivamente" en la papelera (FR-124 purga sola a los 30 días), "Reabrir" una incidencia y el
     CSV del Registro. El rechazo en bloque sí, porque está en 06 Apéndice A y en 09.
  8. Una lectura caída no vacía la pantalla: se conserva lo cargado, se avisa arriba con la hora del
     último dato y se reintenta con la degradación controlada (FR-168). `postgrest-js` reintenta solo
     las lecturas fallidas con espera creciente, así que el aviso tarda unos segundos en darse por firme.
- **Descartado:** calcular el núcleo de un alta en el navegador (el GeoJSON de la zona no trae los
  núcleos); traer el historial entero (crece sin límite).
- **Afecta a:** 05 §4; 06 Apéndice A; 09 Fase 7.

### DEC-066 · Minimapa de los formularios: más alto y sin recentrados automáticos
- **Fecha:** 20 sep 2026 (desarrollador, probando en Android) · **Estado:** vigente
- **Contexto:** con 224 px de alto se veía poco contexto alrededor del pin, y el mapa se recentraba
  solo cuando el pin se movía fuera de la vista (DEC-064.2), lo que descoloca mientras se ajusta a mano.
- **Decisión:** el minimapa pasa a 336 px (+50 %) y no vuelve a centrarse solo: al llegar una lectura
  de GPS o moverse el pin, solo se mueve el pin. Para centrar está el botón "Mi posición".
- **Afecta a:** 06 §5; notas para 14.

### DEC-067 · Inventario, registro, papelera y exportación del panel
- **Fecha:** 20 sep 2026 · **Estado:** vigente
- **Contexto:** segunda tanda de pestañas de la Fase 7 (FR-120–FR-125, FR-160). Faltaba decidir de
  dónde salen los datos, cómo se imprime la hoja de campo y con qué se genera el Excel sin servicios
  externos ni cuentas.
- **Decisiones:**
  1. El **inventario** se pinta con los puntos que el panel ya tiene sincronizados (la misma
     `v_puntos_activos` del mapa): filtros, orden y páginas de 50 se calculan en el navegador, que
     con unos cientos de puntos va sobrado y funciona aunque el servidor tarde.
  2. El **registro** sí se pagina en el servidor (`range` de PostgREST, 50 por página) porque crece
     sin límite; la búsqueda global filtra por actor, código y resumen, escapando lo que rompería el
     filtro. Solo lectura: no hay ningún control que escriba.
  3. La **hoja de campo** (FR-122) no abre ventanas nuevas —los bloqueadores se las comen—: se pinta
     sobre la página y una regla de impresión deja solo la hoja, una página por núcleo.
  4. La **exportación** (FR-160) genera el archivo en el navegador: CSV con BOM y punto y coma (Excel
     en español), GeoJSON estándar y un .xlsx propio de unas 40 líneas (OOXML mínimo comprimido con
     **fflate**, dependencia nueva de 8 kB que ya estaba en el árbol). Los números van como números.
  5. Retirar y borrar piden motivo y explican el efecto antes de confirmar (UI-06); la papelera
     enseña los días que quedan y solo purga lo caducado, como manda FR-124.
- **Descartado:** SheetJS desde npm (la versión publicada arrastra avisos de seguridad y el propio
  proyecto recomienda su CDN, que sería un servicio externo); generar el xlsx en el servidor (no hace
  falta y gastaría cuota).
- **Afecta a:** 06 §5 y Apéndice A; 09 Fase 7.

### DEC-068 · Voluntarios, ajustes, núcleos, QR y avisos de jefatura
- **Fecha:** 20 sep 2026 · **Estado:** vigente; el punto 5 lo sustituye DEC-069 (`workflow_dispatch`
  en lugar de `repository_dispatch`)
- **Contexto:** última tanda de la Fase 7 (FR-130–FR-145, FR-162–FR-167). Los núcleos gestionables y
  el resumen semanal no tenían RPC en 05, y el QR no podía depender de un servicio externo.
- **Decisiones:**
  1. **Núcleos** (FR-166): migración 0009 con `fn_renombrar_nucleo` y `fn_anadir_nucleo`. Renombrar
     arrastra los puntos que lo tienen y recuerda el nombre de OpenStreetMap en `nucleos.nombre_osm`,
     para que `cargar-zona.ts` no lo resucite en el siguiente despliegue. Añadir exige señalar dónde
     está: el municipio y el núcleo de cada punto se deducen por cercanía (05 §6.3), así que un núcleo
     sin geometría no serviría; al añadirlo se recalcula el núcleo de los puntos de ese municipio.
     El registro gana la acción `nucleo_guardado`.
  2. **Resumen semanal** (FR-164): lo encola `pg_cron` los lunes (`fn_encolar_resumen_semanal`) y lo
     envía `/api/push`, al que el panel llama al abrirse. Así no hace falta un workflow con secretos
     nuevos; cuando la Fase 8 traiga `vigilancia.yml`, ese trabajo también lo despachará.
  3. **Código de acceso**: lo genera el navegador con `crypto.getRandomValues` y se confirma en un
     diálogo que dice cuántos móviles tendrán que volver a escribirlo (FR-140, UI-06).
  4. **Código QR** (FR-162): librería `uqr` (sin dependencias, 10 kB) y hoja A4 imprimible con el
     escudo y "Escanea para instalar". Nada de servicios de QR por internet.
  5. **Mantenimiento** (FR-165): `mantenimiento.yml` escucha el `repository_dispatch` y abre un PR a
     `develop` con lo regenerado, en vez de escribir en la rama: el mapa base pesa megas y conviene
     mirarlo antes de desplegarlo. Los botones de **purga de fotos** y **respaldo** no se dibujan
     todavía: sus workflows llegan en la Fase 8 y un botón que no hace nada está prohibido (UI-01).
  6. **`GITHUB_DISPATCH_TOKEN`** es el único paso manual que queda para el desarrollador: un token
     *fine-grained* no se puede crear por API. Sin él, `/api/lanzar-workflow` responde
     `NO_CONFIGURADO` y el panel lo dice con palabras, sin dejar la pantalla muda.
- **Afecta a:** 04 §9; 05 §8; 06 Apéndice A; 09 Fase 7.

### DEC-129 · La primera purga de fotos es un ensayo, y el ensayo también anota el tamaño
- **Fecha:** 25 sep 2026 · **Estado:** vigente (`docs/22` RV-94). Sesión Ops.
- **Contexto:** `purgar-fotos.yml` no se había ejecutado nunca. La primera vez iba a ser la pasada programada del lunes 28-09 a las 04:43 UTC, y borraría de verdad sin que nadie hubiera visto una lista. Además, un ensayo no anotaba `storage_bytes` aunque lo medía, así que Salud del sistema decía «Almacenamiento usado: sin dato».
- **Decisión:**
  1. **El paso de anotar corre siempre.** Con ensayo, `actualizado_por = 'purgar-fotos.yml (ensayo)'`. El valor es el tamaño real del bucket: `bytes_restantes = bytesDe(enBucket)` cuando no se borra nada.
  2. **Guarda de primera vez**, en `scripts/purgar-fotos.ts` (`modoDePurga`). La pasada **programada** (`--programada`, que el workflow pasa solo con `schedule`) hace ensayo si no existe `config.ultima_purga_fotos`. Entonces el workflow escribe lo que borraría en el resumen y abre la issue «Primera purga de fotos: revisa el ensayo» (etiqueta `vigilancia`). Una ejecución a mano sin ensayo, o la programada de la semana siguiente, ya borra.
  3. **Solo una pasada que borra de verdad** escribe `config.ultima_purga_fotos = to_jsonb(now())`, aunque no haya nada que borrar. Si no se puede leer esa marca, se da por que no existe: mejor un ensayo de más.
- **Comprobado:** `purgar-fotos.test.ts` (`modoDePurga`), `workflows.test.ts`, y `probar-purga.ts` contra el Supabase local en `ci-sql`, que prueba la primera vez programada, la manual y la siguiente.
- **Afecta a:** 04 §9; 15 §4.

### DEC-128 · Los trabajos de Actions, fijos en ubuntu-24.04, con un canario de Ubuntu 26
- **Fecha:** 25 sep 2026 · **Estado:** vigente (`docs/22` RV-89). Sesión Ops.
- **Contexto:** cada ejecución avisa de que `ubuntu-latest` pasa a Ubuntu 26 desde el 19 oct 2026, y los 21 trabajos lo usaban. `preparar` instala `postgresql-client-17` con el script de PGDG, que en una versión recién salida puede no tener paquetes. Si ese paso falla, fallan a la vez `ci-sql`, el respaldo, la vigilancia y la purga: todo lo que avisa cuando algo va mal.
- **Decisión:**
  1. Los 21 trabajos, con `runs-on: ubuntu-24.04`. Ningún `ubuntu-latest` en `.github/workflows/`: lo comprueba `workflows.test.ts`.
  2. `canario-ubuntu.yml`, con el trabajo `canario-ubuntu-26` en `ubuntu-26.04`, los miércoles a las 05:13 UTC y a mano. Hace `preparar` con psql, las versiones de psql, pg_dump y jq, y `npm run typecheck && npm test`, sin tocar ninguna base de datos. Abre o cierra la issue «Canario Ubuntu 26 en rojo».
  3. Está en las listas `WORKFLOWS` de la vigilancia y de `mantener-activo.yml` (DEC-085), con el límite de 8 días de los semanales.
  4. **Paso a Ubuntu 26:** cuando el canario lleve dos semanas en verde, en un PR aparte, y el canario se retira.
- **Descartado:**
  - **Meter el canario en `mantenimiento.yml`:** ese lo despacha jefatura con una entrada obligatoria.
  - **Quedarse en `ubuntu-latest` y arreglar si falla:** fallaría justo lo que avisa de los fallos.
- **Afecta a:** 15 §4.

### DEC-132 · Salud del sistema lee las tareas programadas en vivo; la foto de la vigilancia, de respaldo
- **Fecha:** 25 sep 2026 · **Estado:** vigente (`docs/22` RV-92, 0031). Sesión Backend.
- **Contexto:** `fn_salud()` devolvía en `tareas` la foto que guarda `vigilancia.yml` cada noche (`config.tareas_programadas`). El 25-09, en producción, `purgar_intentos` (cada hora) decía "hace 13 h · bien" y `purgar_subidas` "todavía sin ejecutar" aunque ya había corrido.
- **Decisión:**
  1. **`hidrantes.fn_tareas_programadas()`**, `security definer`, dueño `hidrantes_migrador` (el que aplica las migraciones y es dueño de las tareas; `arranque-bd.sql` le da `select` en `cron.job` y `cron.job_run_details`). La misma consulta que `scripts/sql/tareas-programadas.sql`, sin la lista de esperadas, y con la misma forma de fila que la foto (el panel anterior la pinta igual). Una tarea que estaba en la última foto de la vigilancia y ya no está en `cron.job` (o no se ve, por ejemplo recreada con otro dueño: pg_cron filtra por `username`) sale con `falta = true` y `problema = true`: sin eso, una lista vacía o incompleta se leería como «todo bien» (hallazgo de la revisión del PR). En `plpgsql` para que la migración no falle en una base sin pg_cron. Sin `execute` para `anon` ni `authenticated`.
  2. **`fn_salud()`**, misma firma: `tareas` de `fn_tareas_programadas()` y `tareas_origen = 'en_vivo'`. Si falla con `insufficient_privilege`, `undefined_table`, `invalid_schema_name` o `undefined_function`, la foto de `config.tareas_programadas` con `tareas_origen = 'vigilancia'`, `tareas_medidas_en` (el `actualizado_en` de esa fila) y `tareas_error` (el SQLSTATE, para saber por qué). Cualquier otro error sigue saliendo como error: no se esconde.
  3. **La vigilancia no cambia:** sigue guardando la foto, que es la red de seguridad, y sigue siendo la única que mira las tareas que faltan.
- **Descartado:** dar a `authenticated` lectura de `cron.job_run_details`: es de toda la base (también de uniformidad) y abriría más de lo necesario.
- **Afecta a:** 05 §6.2 y §6.3.

### DEC-120 · La integración de los avisos, con un servidor de push falso y una variable que solo vale en local
- **Fecha:** 25 sep 2026 · **Estado:** vigente (`docs/21` RV-86). Sesión Backend.
- **Contexto:** la suscripción a los avisos no se había probado nunca de punta a punta contra la pila real: los e2e simulan la RPC y `scripts/probar-worker-avisos.ts` mete la suscripción a mano con un endpoint `http://` que `fn_validar_suscripcion` no admitiría. Por eso nadie vio que `fn_guardar_suscripcion_push` fallaba siempre (DEC-119).
- **Decisión:**
  1. **`e2e/integracion/avisos.spec.ts`**, en el paso de integración de `ci-sql`: una suscripción con forma de FCM (endpoint de 152 caracteres, claves de 65 y 16 bytes) guardada con `fn_guardar_suscripcion_push` por PostgREST y un token canjeado en `/api/verificar-codigo`; jefatura (sesión local firmada como Google) rechaza una propuesta de ese móvil, que es lo que crea el aviso; `/api/push` con `X-Vigilancia` local lo envía; un servidor de push falso en el test comprueba el camino, `aes128gcm`, `TTL` y la cabecera VAPID: `aud` = `https://fcm.googleapis.com`, `exp` en el futuro y a menos de 24 h (RFC 8292 §2), `sub` y la firma ES256 verificada con la clave pública.
  2. **`PUSH_ENDPOINT_PRUEBAS`:** `/api/push` sustituye el origen del endpoint por el de esa variable **solo** si tanto ella como `SUPABASE_URL` son `127.0.0.1` o `localhost` (`destinoDePruebas`). La firma sigue siendo para el servicio de verdad. Así, aunque la variable llegara a staging o a producción, no desviaría ningún aviso.
  3. **El spec levanta su propio `wrangler pages dev` en :8789** con claves VAPID de prueba y la variable como `--binding`: no toca `.dev.vars`, `package.json` ni `ci.yml` (de Ops), y el wrangler de :8788 del paso sigue sin claves VAPID, como espera `probar-functions.ts`.
  4. **`scripts/guarda-produccion.ts`** aborta si `PUSH_ENDPOINT_PRUEBAS` está en el entorno del despliegue, en `deploy-prod.yml` (fuera de comentarios) o en `scripts/arranque.ts`, que es quien sube los secretos de Pages. La guarda solo ve lo que ve el runner: una variable puesta a mano en el proyecto de Pages no le llega. La barrera de verdad es la del punto 2 (`SUPABASE_URL` local), que no depende de dónde se ponga la variable.
- **Descartado:** apuntar la suscripción directamente al servidor falso (como `probar-worker-avisos.ts`): no pasaría por `fn_validar_suscripcion` ni por la forma real de un endpoint de FCM, que es justo lo que había que probar.
- **Afecta a:** 05 §9.

### DEC-118 · Una suscripción push solo se borra al momento si el servicio dice que no existe
- **Fecha:** 25 sep 2026 · **Estado:** vigente (`docs/21` RV-84, 0030). Sesión Backend.
- **Contexto:** `fn_resultado_notificacion` borraba la suscripción al tercer error de cualquier tipo. Un 5xx o un 429 pasajero de FCM bastaba: el móvil seguía diciendo "Activado" y no volvía a recibir nada.
- **Decisión:**
  1. **Solo 404 y 410** (`suscripcion_caducada`, lo pone `enviar()` de `functions/_lib/webpush.ts`) borran al primer aviso.
  2. **Cualquier otro error** suma un fallo y anota el error en el aviso, como antes. La suscripción se borra solo con **10 fallos seguidos y ningún envío bueno en los últimos 7 días**, o ninguno nunca. Un envío bueno pone `fallos = 0`.
  3. **429:** `/api/push` no llama a `fn_resultado_notificacion`, y los demás avisos del lote para ese mismo servicio (origen del endpoint) no se intentan en esa invocación. Todos ellos se aplazan con **una** llamada a la RPC nueva `fn_aplazar_notificaciones(ids, segundos)` (solo `service_role`), con el `Retry-After` mayor (segundos o fecha; 60 s si no viene; de 0 a 24 h): vuelven a poder reclamarse pasado ese tiempo y se les devuelve el intento, así que una racha de 429 no los deja como `SIN_RESPUESTA` (DEC-088). Presupuesto: 20 × 2 + 3 = 43 peticiones de 50. La respuesta lleva `aplazadas`, y `quedan` solo si el lote venía lleno y no se aplazó entero: los avisos de otros servicios no esperan por uno que ha pedido calma.
- **Coste aceptado:**
  - si la llamada a `fn_aplazar_notificaciones` falla, esos avisos siguen reclamados y salen a los 15 minutos gastando un intento, como cualquier aviso sin anotar; cuentan en `sin_anotar`;
  - un 5xx sigue dejando **ese aviso** con `error` y no se reintenta (como antes de 0030): lo que cambia es que la suscripción ya no se pierde. Reintentar los 5xx sería otro cambio en la cola, fuera de RV-84;
  - una suscripción rota de verdad con un error que no es 404/410 (p. ej. un 403 por claves VAPID cambiadas) tarda hasta 7 días en borrarse. Mientras, sus avisos fallan y quedan anotados, que es lo mismo que pasaría sin borrarla.
- **Descartado:**
  - subir solo el umbral de 3 a 10 sin mirar `ultimo_envio`: una suscripción que recibe bien a diario se perdería con una mala racha de un día;
  - dejar lo aplazado solo reclamado, sin RPC nueva (lo que proponía `docs/21`): cada 429 gastaba un intento, incluso en los avisos que ni se intentaban, y tres seguidos los perdían; y un `Retry-After` de más de 15 minutos no se respetaba.
- **Afecta a:** 05 §2.12, §6.3 y §9; 11 §6.1.

### DEC-119 · Una fila de voluntario y una de jefatura por navegador
- **Fecha:** 25 sep 2026 · **Estado:** vigente (`docs/21` RV-84, 0030). Sesión Backend.
- **Contexto:** el único de `suscripciones_push` era solo por `endpoint`, y `fn_guardar_suscripcion_push` (voluntario) y `fn_guardar_suscripcion_push_admin` se quitaban la fila con `on conflict … set email = null` / `set dispositivo_id = null`. Voluntario y jefatura en el mismo navegador: el último que activaba se quedaba la fila y el otro dejaba de recibir sin saberlo.
- **Decisión:** el único pasa a `((suscripcion ->> 'endpoint'), (dispositivo_id is null))` (`suscripciones_endpoint_duenio_idx`), índice nuevo y borrado del viejo sin editar 0001. Cada función hace `on conflict` sobre ese índice y solo actualiza su tipo de dueño. Mismas firmas (04 §12); `/api/push` no cambia porque cada aviso ya va a una `suscripcion_id`.
- **Por qué por tipo de dueño y no `coalesce(dispositivo_id::text, email)`** (lo que proponía `docs/21`): un navegador solo tiene un token de voluntario, así que otro `dispositivo_id` en el mismo endpoint es ese navegador con un acceso nuevo; con el índice de `docs/21` se quedaría también la fila del acceso viejo y el navegador recibiría los avisos de las dos. Lo mismo con dos administradores en el mismo ordenador: los avisos de jefatura son iguales para todos, y dos filas serían avisos repetidos. Con el índice por tipo de dueño el `upsert` sigue siendo atómico y sin borrados aparte.
- **Encontrado al escribir el test:** las dos funciones de guardar fallaban **siempre** en la base real con `42702 column reference "suscripcion" is ambiguous`: en `on conflict ((suscripcion ->> 'endpoint'))`, el parámetro `suscripcion` y la columna se llaman igual y plpgsql no elige. Ningún pgTAP las llamaba (solo se comprobaban sus permisos) y los e2e simulan la RPC. Es, del lado del servidor, la incidencia «Avisos quedan desactivados» de staging (RV-81). 0030 pone `#variable_conflict use_column` y califica los parámetros con el nombre de la función; no se renombran porque PostgREST llama por nombre de parámetro. `27_suscripciones_duenios.test.sql` las llama con los roles `anon` y `authenticated`, como PostgREST.
- **Afecta a:** 05 §2.12.

### DEC-116 · Tres skills propias del proyecto, versionadas en .claude/skills/
- **Fecha:** 25 sep 2026 · **Estado:** vigente (`docs/21` SK-03). Sesión Ops.
- **Decisión:** `paquete-rv`, `nueva-migracion` y `revisar-pantallas`, con el texto de `docs/21` §3 como punto de partida y sin quitar ningún paso. Cada una tiene su `SKILL.md` con `name` y `description`, que dicen cuándo usarla: es lo que Claude Code mira para cargarla. Se añadió solo lo propio de este repositorio:
  - `paquete-rv`: `npm.cmd`/`npx.cmd` y `PW_CANAL=chrome` en Windows, y que «Cierra #N» no cierra la issue;
  - `nueva-migracion`: los hooks de DEC-115 dejan editar una migración que solo está en la rama, y cómo lanzar `ci-sql` sin Docker en local;
  - `revisar-pantallas`: mientras no exista `e2e/vistas.spec.ts` (RV-88, sesión Frontend), cómo sacar las mismas capturas desde los specs de la pantalla tocada.
- **Comprobado:** `scripts/herramientas.test.ts` exige las tres carpetas, un `SKILL.md` con encabezado `name` y `description`, y que el `name` coincida con la carpeta.
- **Afecta a:** CLAUDE.md §8.

### DEC-115 · Las prohibiciones de CLAUDE.md §3, también como hooks de Claude Code
- **Fecha:** 25 sep 2026 · **Estado:** vigente (`docs/21` SK-02). Sesión Ops.
- **Contexto:** las prohibiciones duras solo estaban escritas. Una sesión cansada, o una nueva que aún no ha leído CLAUDE.md, podía saltarse una. Algunas cuestan caro: una migración aplicada editada rompe staging, y un `.env` en un repositorio público no se puede deshacer (DEC-053).
- **Decisión:**
  1. **Hooks `PreToolUse` en `.claude/settings.json`**, sin plugin, cada uno con un script de Node sin dependencias en `.claude/hooks/` (`comun.mjs` y uno por regla). Salen con 2 (bloqueo) y un mensaje que cita la regla. Se llaman con `node "${CLAUDE_PROJECT_DIR}/.claude/hooks/<regla>.mjs"`, que también funciona con la ruta de Windows con espacio. Comprobado en vivo el 25 sep 2026.
  2. **Qué bloquean:**
     - `sin-db-push`: `supabase db push` en Bash o PowerShell;
     - `migraciones-aplicadas`: Edit, Write, MultiEdit, `rm`, `git rm`, `mv`, `sed -i` o una redirección sobre una migración que **ya está en `origin/develop` o `origin/main`**. Una migración nueva, o una que solo está en la rama de trabajo, se puede editar y renumerar: lo pide la skill `nueva-migracion`. Sin remoto, cuenta como aplicada si el archivo existe;
     - `sin-force-push`: `git push` con `--force`, `-f`, `--force-with-lease` o un refspec con `+` hacia `develop` o `main`, o sin refspec estando en una de ellas;
     - `sin-console-log`: `console.log(` en lo que se escribe en `src/**` o `functions/**`;
     - `git-add-prohibidos`: lo que `git add --dry-run` con los mismos argumentos metería, si es un `.env*` (salvo `.env.example`), `.dev.vars`, un `.sql` en la raíz o un `.pmtiles` fuera de `public/mapabase/`. Así también se ve con `git add -A` o `git add .`.
  3. **`scripts/probar-hooks.ts`** los ejecuta con la entrada JSON de Claude Code (`tool_name`, `tool_input`, `cwd`) en un repositorio temporal: 28 casos, bloqueados y permitidos. Corre en `ci-calidad`.
- **Coste aceptado:** los hooks miran el texto del comando, no lo interpretan. `echo "supabase db push"` también se bloquea. Es mejor un falso positivo que dejar pasar la acción.
- **Descartado:**
  - **Un solo script con todas las reglas:** un fallo en una regla dejaría sin las demás.
  - **Bloquear también los `console.log` de `scripts/`:** los scripts de operación escriben por consola a propósito, con `log`.
- **Afecta a:** CLAUDE.md §3.

### DEC-114 · Los plugins oficiales de revisión, declarados en el repositorio
- **Fecha:** 25 sep 2026 · **Estado:** vigente (`docs/21` SK-01). Sesión Ops.
- **Contexto:** RV-81 (activar los avisos falla en silencio) es el tipo de fallo que una revisión con un agente de fallos silenciosos encuentra antes que un voluntario. Cada sesión de Claude Code, hoy o dentro de un año, tiene que tener las mismas herramientas sin instalar nada a mano.
- **Decisión:**
  1. **Comandos que funcionaron**, con Claude Code 2.1.141 desde la raíz del repositorio (`/plugin` es interactivo; su equivalente por CLI):
     - `claude plugin marketplace add anthropics/claude-code --scope project`: el marketplace se llama **`claude-code-plugins`**;
     - `claude plugin install pr-review-toolkit@claude-code-plugins --scope project`, y lo mismo con `code-review` y `security-guidance`.
  2. **Versiones instaladas:** `pr-review-toolkit` 1.0.0, `code-review` 1.0.0 y `security-guidance` 2.0.0.
  3. **En `.claude/settings.json`**, que se versiona: `extraKnownMarketplaces` con `{"claude-code-plugins": {"source": {"source": "github", "repo": "anthropics/claude-code"}}}` y `enabledPlugins` con los tres `<plugin>@claude-code-plugins: true`. Son los nombres de `code.claude.com/docs/en/settings` («Shared project settings»), y los mismos que escribió `--scope project`.
     - Esa documentación advierte de que `extraKnownMarketplaces` solo se aplica **cuando cada persona confía en la carpeta**. Hasta entonces no se ofrecen los plugins del marketplace.
  4. `.claude/settings.local.json` y `.claude/worktrees/` siguen en `.gitignore`. Nunca van credenciales en `settings.json`: `scripts/herramientas.test.ts` lo comprueba con los patrones de `detectar-secretos.ts`.
  5. **CLAUDE.md:** §5.5 exige la revisión con `pr-review-toolkit` y `code-review`, y §8 dice cuándo usar cada plugin.
- **Descartado:** instalarlos a nivel de usuario (`--scope user`). Solo valdría en este ordenador.
- **Afecta a:** CLAUDE.md §5 y §8.

### DEC-122 · Activar los avisos dice siempre el motivo si no queda activo
- **Fecha:** 25 sep 2026 · **Estado:** vigente (`docs/21` RV-81), salvo la línea de referencia del punto 3, que sustituye DEC-136. Sesión Frontend.
- **Contexto:** en un Android con staging, "Permitir avisos" dejaba el interruptor apagado, sin mensaje y sin error en Salud del sistema. Había cuatro caminos que acababan en el mismo "Desactivado" mudo.
- **Decisión:**
  1. `activarPush()` nunca lanza y devuelve `{ estado, motivo? }`. Motivos: `permiso_no_concedido` (el permiso vuelve `default`), `permiso_bloqueado` (vuelve `denied`; el estado sigue siendo `denegado`), `sin_service_worker` (`serviceWorker.ready` no llega en 10 s), `sin_servicio_push` (`subscribe` o `getSubscription` lanzan, o algo imprevisto), `clave_distinta` (había una suscripción con otra clave VAPID y no se pudo cambiar) y `servidor:<código>` (la RPC falla).
  2. Todos salvo los dos de permiso van a `anotarError` con el nombre y el mensaje del error, o con el código de la RPC. **Nunca** el endpoint ni las claves.
  3. **La hoja no se cierra si algo falla:** enseña el texto del motivo (Apéndice A de 06), una línea pequeña "Referencia para jefatura: `<motivo>`" y "Reintentar". Con `permiso_bloqueado` no se ofrece "Reintentar" (no cambiaría nada, UI-01): el texto dice dónde activarlo en Android. La referencia es lo que el desarrollador anota en el paso manual de `docs/22` §4.3.
  4. Para `servidor:*` no se usa `textoError` del panel: sus textos son de jefatura ("revisa los valores"). Hay dos textos de voluntario: sin conexión y "el servidor no ha guardado la suscripción".
  5. **Resincronización:** tras cada sincronización buena, si los avisos están activos y hay permiso, se vuelve a enviar la suscripción como mucho una vez cada 24 h. El intento se marca antes de hacerlo, así que un fallo que se repite no llena de errores a jefatura. Si el SW dejó una marca de `pushsubscriptionchange`, se envía sin esperar a las 24 h.
  6. **`pushsubscriptionchange` en `sw-push.js`:** usa `newSubscription` si llega o se vuelve a suscribir con la clave de la vieja, y deja en IndexedDB (`hidrantes-sw`, almacén `kv`, clave `push_pendiente`) la suscripción nueva, o `true` si no pudo hacerla. La app la envía al abrirse. Es una base propia del SW para no tocar la versión de la base `hidrantes` de la app.
- **Pendiente (paso manual del desarrollador, 2 min, `docs/22` §4.3):** repetir la activación en el Android con staging y anotar aquí la referencia que enseña la hoja, o que quedó activado.
- **Descartado:** cerrar la hoja y avisar con un aviso flotante: se pierde el "Reintentar" y el texto largo no cabe.
- **Afecta a:** 06 Apéndice A; `src/lib/push.ts`, `public/sw-push.js`.

### DEC-123 · Controles del mapa: iconos a la derecha, acciones principales abajo y leyenda plegable
- **Fecha:** 25 sep 2026 · **Estado:** vigente (`docs/21` RV-82). Sesión Frontend.
- **Contexto:** en un Android, "Cercanos", con texto, ensanchaba la columna de la derecha a unos 110 px y dejaba los botones de 44 px hacia el centro del mapa. Con la leyenda abierta y el "+", el mapa útil se quedaba en la mitad. En tableta y ordenador, la ficha flotante (`right-16`) tapaba la columna.
- **Decisión** (patrón de las apps de mapas):
  1. **Columna de la derecha solo con iconos:** 44 px fijos y `right-2`. Contiene Capas, Medir y Mi posición, y el zoom en una pieza de 44 × 88. El zoom se queda porque es la alternativa de un dedo al pellizco.
  2. **"Cercanos" extendido abajo a la derecha,** 48 px y `--marino-950`, 12 px por encima del "+". El "+" queda en **56 px**: 06 decía 44, pero el código ya usaba 56.
  3. **Leyenda plegable:** una ficha "Leyenda" de 44 px que se despliega y se cierra con la X o tocando fuera.
     - El primer uso la enseña desplegada una vez.
     - El estado se guarda en `almacen` (`leyenda_abierta`).
  4. **`src/lib/disposicion-mapa.ts` (`CONTROLES`, `RESERVA_DERECHA`, `ZONA_ABAJO`, `MARGEN_FICHA_PX`) es la única fuente de medidas.** Lo que ya no se mide ni se escribe a mano:
     - la ficha (`right` y alto máximo, que termina por encima de los botones de abajo);
     - los avisos flotantes (antes medían la columna con `ResizeObserver`);
     - el encuadre del incidente.
  5. **Test de geometría (`accesibilidad.spec.ts`):**
     - los botones de una pieza unida (`data-pieza-unida`, el zoom) no necesitan 8 px entre ellos: es la única excepción de UI-15, escrita allí;
     - en diagonal manda el mayor de los dos huecos. La leyenda desplegada, abajo a la izquierda, y "Cercanos", abajo a la derecha, no son vecinos.
- **Descartado:** "Cercanos" dentro de la barra de búsqueda, como botón a su derecha. Ocupa menos, pero queda arriba, lejos del pulgar, y compite con el teclado al buscar.
- **Afecta a:** 06 §4.5, §4.7, §5 y Apéndice A; 07 (mapa).

### DEC-124 · El aviso del mapa base, también para quien solo tenía teselas sueltas
- **Fecha:** 25 sep 2026 · **Estado:** vigente (`docs/21` RV-85). Sesión Frontend.
- **Contexto:** quien va con datos móviles y nunca descargó el PMTiles solo tiene, sin cobertura, lo que quedó en `hidrantes-teselas-<versión>`. Cada versión nueva del mapa base borra esa caché al activarse el SW (`docs/20` RV-71, DEC-111).
- **Comprobado:** el aviso de RV-10 ya depende solo de que el PMTiles no esté descargado, no de si hay teselas sueltas. Por eso no hace falta cambiar código:
  - con cobertura sale "El mapa base no está en el móvil" con el botón de descarga;
  - sin cobertura sale "Mapa base no descargado…".
- **Decisión:** se deja fijado con un e2e (`e2e/mapabase-version.spec.ts`). Simula datos móviles para que el PMTiles no se descargue solo (FR-81), deja una caché `hidrantes-teselas-19990101`, instala el SW de cero y comprueba tres cosas: que la caché vieja desaparece y que el aviso sale con cobertura y sin ella. El test pasa sobre `develop`: es un test de protección, no de regresión.
- **Pendiente para Ops:** una línea en 04 §8 con este comportamiento (04 es de Ops; pedido en la issue de coordinación de `docs/22`).
- **Afecta a:** 04 §8 (Ops).

### DEC-125 · Tocar un aviso navega solo una ventana controlada; si no, abre una
- **Fecha:** 25 sep 2026 · **Estado:** vigente (`docs/21` RV-83). Sesión Frontend.
- **Contexto:** `notificationclick` buscaba ventanas con `includeUncontrolled: true` y llamaba a `navigate()` sin esperar la promesa. Tras la primera instalación no hay `clientsClaim`, así que la ventana no está controlada, `navigate()` rechaza, y la app recibía el foco sin cambiar de pantalla.
- **Decisión:** `matchAll({ type: 'window' })` solo con las controladas. De la primera de este origen se pide primero el foco (el navegador solo lo deja poco después del toque) y después se navega. Un foco que falla no abre otra ventana; si no hay ventana controlada, o si `navigate()` falla, se usa `clients.openWindow(url)` una sola vez. Todo va dentro de `event.waitUntil`, que nunca queda rechazado: el SW no tiene token para anotar errores, y la app enseña el resultado en «Mis propuestas» al abrirse.
- **Descartado:** añadir `clientsClaim` al SW de Workbox. Cambia cuándo toma el control una versión nueva (TR-24, el aviso de versión nueva) solo para arreglar esto.
- **Afecta a:** `public/sw-push.js`; `config/sw-push.test.ts` (nuevo, carga el SW con `vm`).

### DEC-136 · La hoja de avisos no enseña el código del motivo
- **Fecha:** 25 sep 2026 · **Estado:** vigente. Sustituye la línea "Referencia para jefatura: `<motivo>`" de DEC-122 punto 3. Sesión Frontend.
- **Contexto:** la revisión de RV-82 recordó UI-13: al voluntario no se le enseñan códigos internos, salvo el del propio punto. `sin_servicio_push` o `servidor:DESCONOCIDO` lo son.
- **Decisión:** la hoja enseña solo el texto del motivo. Cada motivo tiene un texto distinto, así que el texto basta para saber el caso. Lo que no depende del voluntario queda además en Salud del sistema → "Errores de la aplicación", con la ruta `push:*`.
- **Paso manual del desarrollador (`docs/22` §4.3):** anotar el texto que enseña la hoja y mirar si hay un error `push:*` nuevo en Salud del sistema.
- **Afecta a:** 06 Apéndice A; `src/paginas/Ajustes.tsx`.

### DEC-137 · Salud del sistema dice de cuándo son las tareas, marca la vigilancia atrasada y enseña 0 bytes
- **Fecha:** 25 sep 2026 · **Estado:** vigente (`docs/22` RV-92, parte de pantalla; RV-93 punto 3; petición de Ops para RV-94). Sesión Frontend.
- **Decisión:**
  1. **Debajo de "Tareas programadas"** va una de tres líneas:
     - "Ahora mismo", con `tareas_origen = 'en_vivo'`;
     - "Según la vigilancia de hace N h", con `tareas_medidas_en` en relativo;
     - "Según la última vigilancia", si la base es anterior a 0031 (no trae origen) o no trae la hora.

     `tareas_error` (el SQLSTATE) no se enseña: es para diagnóstico (UI-13).
  2. **"Última vigilancia"** va en `--naranja-texto` a partir de **26 h** (`VIGILANCIA_ATRASADA_H` en `src/lib/panel/ajustes.ts`). Como el color solo no basta (WCAG 1.4.1), se añade además "lleva más de un día sin pasar". Hasta 26 h no se marca: GitHub retrasa la vigilancia varias horas.
  3. **"Almacenamiento usado":** con el bucket vacío, 0 bytes es un dato ("0,0 MB"), no "sin dato" (`storage_bytes != null`). `avisoAlmacenamiento(0)` ya daba `null` y no cambia.
  4. **La lógica va en funciones puras de `src/lib/panel/ajustes.ts`,** probadas con vitest (`origenTareas`, `vigilanciaAtrasada`, `textoAlmacenamiento`), y la pantalla se prueba con e2e. `docs/22` pedía un vitest de `Ajustes.tsx`, pero el proyecto no tiene entorno DOM en vitest, y añadir jsdom sería una dependencia nueva para un solo test.
- **Afecta a:** 06 Apéndice A; `src/componentes/panel/Ajustes.tsx`, `src/lib/panel/ajustes.ts`.

### DEC-112 · Margen de TR-10: la porción con sesión se enseña sin `Suspense`
- **Fecha:** 24 sep 2026 · **Estado:** vigente (`docs/20` RV-80). Decisión de bajo riesgo de la sesión Frontend: TR-10 y su umbral no cambian.
- **Contexto:**
  - DEC-099 midió de 2,76 a 2,93 s frente a los 3 s de TR-10.
  - Tras RV-71 (DEC-111), `rendimiento.spec.ts` en local (Chrome, `--workers=1`, 5 pasadas): 2,72 · 2,67 · 2,69 · 2,65 · 2,74 s, **mediana 2,69 s**.
  - En CI, las cinco últimas ejecuciones de `ci-e2e-rendimiento` dieron 2,50 · 2,61 · 2,50 · 2,60 · 2,85 s.
  - La mediana está justo en el límite de 2,7 s de RV-80, y hubo un 2,85 en CI.
- **Perfil** del arranque con sesión y 3G (tiempos de recurso y marcas cuadro a cuadro en la página):
  - Todo el JavaScript (inicial y porción con sesión por la precarga, unos 290 kB gzip) llega a los 2,2 s, que es lo que da la banda de 1,6 Mbit/s.
  - Entre los 2,2 y los 2,6 s, **"Cargando…" seguía a la vista sin ninguna tarea larga ni petición pendiente**. Era el fallback del `Suspense` de `RutasDentro`: React 19 deja el fallback de un `Suspense` a la vista al menos 300 ms antes de revelar el contenido, aunque la porción llegue al momento. Es el "Cargando…" de más de 1 s que se veía en staging al recargar.
  - Los otros sospechosos de RV-80 no bloquean el primer dibujo.
    - **El blob de 4,4 MB:** se lee de Cache Storage al pedir la primera tesela, de forma asíncrona.
    - **`getSession`:** solo se espera en la sesión de Google de jefatura. El voluntario con token no pasa por ahí.
- **Decisión:**
  - `App.tsx` carga la porción con sesión con un `import()` propio, sin `lazy` ni `Suspense`. Se sigue pidiendo al arrancar con una sesión guardada.
  - Mientras no llega, un estado normal enseña "Cargando…". Si no llega, el error se lanza en el render y lo recoge `LimiteCarga`, como antes (TR-106).
- **Resultado** en local, con el mismo spec y el mismo umbral:
  - **TR-10:** 2,44 · 2,45 · 2,42 · 2,42 · 2,45 s, **mediana 2,44 s**, 0,25 s menos.
  - **"Cargando…" a la vista:** de 342–345 ms a 117–159 ms.
  - **JavaScript inicial:** 178,5 kB, igual que antes.
- **Test:** *con sesión, "Cargando…" no se queda a la vista cuando la porción ya ha llegado (RV-80)*, en `rendimiento.spec.ts` (`@rendimiento`), con un umbral de 250 ms medido en la página, cuadro a cuadro. Sobre `develop` falla (342 y 345 ms).
- **Descartado:**
  - **Relajar o medir distinto TR-10.** Además, `toBeVisible` reintenta a intervalos crecientes, así que el número del spec va a saltos y cuenta de más, nunca de menos.
  - **Esperar a la porción antes de montar React:** con una red lenta, la pantalla quedaría en blanco en vez de decir "Cargando…".
- **Afecta a:** 03 TR-10 (sin cambio de texto); 10 AC-115.

### DEC-113 · Inventario vacío, panel a 800 px y respaldo en staging: los detalles
- **Fecha:** 24 sep 2026 · **Estado:** vigente (`docs/20` RV-76, RV-79 y la parte Frontend de RV-78). Decisión de bajo riesgo de la sesión Frontend: no cambia ningún requisito.
- **Decisión:**
  1. **Inventario vacío (RV-76).** El caso lo decide `sincronizadoEn`: con `null`, el texto de siempre; con valor y sin puntos, "Todavía no hay ningún punto en el inventario…" y el botón "Añadir un punto".
     - El botón abre `/proponer/alta` **sin coordenadas**, igual que el "+" naranja: el alta coloca el pin con el GPS si está al día (FL-03, RV-40). Pasar la posición en la URL la trataría como una pulsación larga (DEC-077).
     - El aviso va dentro de `avisos-mapa`, con los demás avisos flotantes, que ya dejan libre la columna de controles (RV-59).
     - El mapa y la lista usan el mismo componente (`AvisoSinPuntos`). En ordenador, con la lista al lado, sale en los dos sitios, como antes.
  2. **Panel por debajo de 1.024 px (RV-79).**
     - El Inventario pasa a filas de dos líneas: código, tipo, diámetro, estado y acciones en la primera; dirección, núcleo y revisión en la segunda.
     - Sigue siendo una tabla para los lectores de pantalla (`role="table"`, `row`, `columnheader` y `cell`), con los mismos botones de ordenar arriba. Se cambia de tabla a filas con `matchMedia('(min-width: 1024px)')`, no con CSS, para no tener dos campos de dirección con la misma etiqueta.
     - El campo de dirección mide al menos `27ch`, así que "— pendiente, escribe aquí" nunca se corta, tampoco en la tabla ancha. El tipo va con `whitespace-nowrap`.
     - Las pestañas se reparten en dos filas (`flex-wrap`), sin selector: se ven todas a la vez y cada una sigue siendo un enlace.
  3. **"Último respaldo" en staging (RV-78):** con `VITE_ENTORNO=staging` y sin respaldo, dice "no se respalda: entorno de pruebas". Si algún día hubiera una fecha, se enseña la fecha. En local sigue "todavía ninguno".
- **Descartado:**
  - **Un selector "Sección: Inventario ▾"** para las pestañas: esconde las demás y añade un toque. Con dos filas caben las siete a 768 px.
  - **Filas de dos líneas solo con CSS** sobre la misma `<table>`: con `display` cambiado, algunos navegadores pierden la semántica de tabla, y el test tendría que adivinarla.
- **Afecta a:** 06 Apéndice A (tres textos nuevos).

### DEC-111 · En línea, el mapa base va en teselas sueltas; el PMTiles entero, solo para la descarga
- **Fecha:** 24 sep 2026 · **Estado:** vigente (`docs/20` RV-71). Decisión de bajo riesgo de la sesión Frontend: no cambia ningún requisito.
- **Contexto:**
  - Con sesión y sin la copia descargada, el mapa de staging solo pintaba el fondo y la zona. `pmtiles` daba 12–16 veces "Server returned no content-length header or content-length exceeding request".
  - Diagnóstico del 24-09 a las 20:06 UTC, `curl -sI -H 'Range: bytes=0-99' https://hidrantes-albolote-staging.pages.dev/mapabase/albolote.pmtiles`:
    ```
    HTTP/1.1 200 OK
    Content-Type: application/octet-stream
    ETag: "a8fb8033993a5c97fe05bd69bb55d59a"
    Access-Control-Allow-Origin: *
    Server: cloudflare
    (sin Content-Range, sin Accept-Ranges, sin Content-Length)
    ```
    Pages no sirve rangos de este archivo: devuelve un 200 con el archivo entero. Los e2e no lo veían porque `vite preview` sí los sirve.
  - Medida en staging antes del arreglo, Playwright y Chrome con el Service Worker bloqueado, sesión y Supabase simulados en el navegador (no llega nada a la base), datos móviles simulados para que no se descargue solo: 393 kB en la primera vista, **12 errores de `pmtiles`** y **0 de 12 lienzos del mapa con dibujo**. La petición del `.pmtiles` se corta en cuanto llegan las cabeceras del 200, así que se cuentan 0 kB. El coste real está en la radio, que empieza a recibir 4,4 MB en cada intento.
- **Decisión:**
  1. **Paso 1 de RV-71, las cabeceras:** el `.pmtiles` se sirve con `Content-Type: application/vnd.pmtiles` y `Cache-Control: no-transform`. No se puede comprobar sin desplegar, así que va en el mismo PR y se mira tras el despliegue (resultado abajo). La solución no depende de él: si Pages llegara a servir rangos, el mapa seguiría con las teselas sueltas.
  2. **Teselas sueltas, sacadas del PMTiles que ya está en el repositorio.** Así no se descarga nada de Protomaps y la versión no cambia (`20260919`). Es lo más aburrido: los mismos bytes que el archivo de la descarga. `npm run mapabase -- --solo-teselas` las escribe del PMTiles publicado, y `npm run mapabase`, al regenerar, escribe las dos cosas.
     - Ruta: `public/mapabase/t/<versión>/{z}/{x}/{y}.pbf`, descomprimidas, para no depender de `Content-Encoding`, más `meta.json` (zooms, recuadro, número y bytes).
     - Una por cada tesela del recuadro de `datos/mapabase.json` en z10–15: **366 archivos, 7,2 MB sin comprimir** (el PMTiles, en gzip, pesa 4,2 MB).
     - Una tesela sin datos se escribe vacía, que es un MVT válido. Hoy son 0. Así ninguna petición del recuadro cae en la página de la SPA, que Pages sirve con 200 para lo que no existe.
     - Se borran las carpetas de otras versiones.
     - **Topes: 5.000 archivos y 15 MB.** Pages admite 20.000 archivos por despliegue, y el resto de la app son unos 85. 5.000 da para unas 13 veces el recuadro de hoy y deja 15.000 de margen. 15 MB es el doble de lo de hoy. El script falla antes de escribir nada si se pasa.
  3. **Origen del mapa (`FuenteMapabase`, `src/lib/mapabase.ts`)**, tesela a tesela:
     - **con copia descargada:** el PMTiles de Cache Storage, como antes;
     - **sin copia:** un `GET` normal de la tesela suelta de su versión, solo si está en el recuadro y los zooms. Si no, no se pide. Un 404 o un `text/html` se tratan como "sin tesela".
     - Se quita `FetchSource` por rangos.
     - **No se usa `ZxySource` de `protomaps-leaflet` 5.1.0**, que se elige con una plantilla que no acaba en `.pmtiles`. No sabe del recuadro: pediría teselas de z9 y de fuera, y leería como MVT la página de la SPA (200 `text/html`). `FuenteMapabase` extiende `PMTiles` y redefine `getZxy`, que es lo único que `protomaps-leaflet` le pide (`PmtilesSource`). Así se pasa por `url` sin conversiones de tipo.
  4. **Caché y cabeceras:**
     - `/mapabase/t/*`: `Cache-Control: public, max-age=31536000, immutable`.
     - El tipo, `Content-Type: application/vnd.mapbox-vector-tile`, solo en `/mapabase/t/:version/:z/:x/:y`. Si fuera en `/mapabase/t/*`, `meta.json` saldría como tesela: Pages junta con una coma el mismo encabezado de dos reglas.
     - `globPatterns` sigue sin `.pbf`.
     - `runtimeCaching` `CacheFirst` para `/mapabase/t/` (`config/cache-teselas.ts`): `hidrantes-teselas-<versión>`, 600 entradas, `purgeOnQuotaError` y solo respuestas 200.
     - Para que `sw-push.js`, un archivo estático, sepa qué caché es la vigente, el build emite `sw-teselas.js` con `self.CACHE_TESELAS = "hidrantes-teselas-<versión>"`. El Service Worker lo importa antes que `sw-push.js`, y este borra en `activate` las demás `hidrantes-teselas-*`. Esto toca `vite.config.ts` (un plugin y `importScripts`), además de `globPatterns` y `runtimeCaching`.
     - La descarga completa (FR-81) no cambia.
  5. **Comprobación tras desplegar** (`scripts/comprobar-despliegue.ts`, staging y producción): una tesela z10 del recuadro da 200 con tipo MVT (`application/vnd.mapbox-vector-tile` o `application/x-protobuf`), y el `GET` del `.pmtiles` da 200 con los bytes de `datos/mapabase.json`.
- **Resultado en staging tras el despliegue:** en `docs/verificacion/revision-vivo-frontend.md` (kB de la primera vista y cabeceras de la tesela y del `.pmtiles`).
- **Descartado:**
  - **R2 o un Worker que sirva rangos:** más piezas y otra cuenta de recursos por 4 MB. Queda en 16 §3 para cuando el mapa base pase de 20.000 archivos.
  - **Volver a bajar de Protomaps:** cambiaría la versión, obligaría a los móviles a bajar otra copia y no gana nada.
  - **Precachear las teselas:** 7 MB y 366 archivos en cada instalación y actualización del Service Worker, que es justo lo que FR-81 deja para cuando hay wifi.
  - **Un `.pmtiles` de ejemplo en `scripts/fixtures/`:** `detectar-secretos` no deja subir más `.pmtiles` que el publicado. El test construye uno pequeño en memoria con `scripts/lib/pmtiles.ts`.
- **Afecta a:** 03 TR-03 (sin cambio de texto); 04 §8; 16 §3.

### DEC-104 · Staging se vigila en su propio trabajo, con el secreto de su environment
- **Fecha:** 24 sep 2026 · **Estado:** vigente (`docs/20` RV-78). Sustituye el punto 3 de DEC-103.
- **Contexto:** la primera vigilancia con DEC-103 (run 36055437810) mostró dos cosas.
  - `SUPABASE_DB_URL_STAGING` no existe como secreto del repositorio: `docs/20` lo daba por hecho, y el arranque solo lo pone al rotar `db`.
  - «Comprobar» terminó con 141 sin resultado. `git log … | head -1` recibía SIGPIPE en cuanto `main` iba bastante por detrás, y con `pipefail` bajo `bash -e` (el shell de Actions) el paso entero se paraba. Justo cuando hay que avisar de que producción va atrasada.
- **Decisión:**
  1. Lo que se mira en cada base va en `.github/scripts/revisar-bd.sh` (`revisar_bd produccion|staging`), sin `a && b` sueltos.
  2. Un trabajo `staging`, con `environment: staging` (no pide aprobación) y su `SUPABASE_DB_URL`, mira los avisos sin salir y las tareas de `pg_cron` de staging. Anota allí `ultima_vigilancia` y `vigilancia_ok` **de staging**, y pasa sus problemas a «mirar», que los pone en la misma issue.
  3. `tail -1` en vez de `head -1`, y un test que prohíbe `| head` en la vigilancia.
- **Descartado:**
  - **Crear `SUPABASE_DB_URL_STAGING` en el repositorio:** un secreto más con la misma contraseña, que habría que rotar a la vez que el del environment.
  - **Escribir en staging el resultado global:** para eso haría falta un tercer trabajo en staging tras «mirar». En la Salud del sistema de staging, lo útil es lo de staging.
- **Afecta a:** 04 §9.

### DEC-103 · El Worker de los avisos se despliega en cada push y dice qué código lleva; la vigilancia también anota staging
- **Fecha:** 24 sep 2026 · **Estado:** vigente (`docs/20` RV-74 y RV-78, parte Ops); **el punto 3, sustituido por DEC-104**. Decisión de bajo riesgo de la sesión Ops.
- **Decisión:**
  1. **`deploy-staging.yml` despliega el Worker en cada push a `develop`**, sin mirar el diff, con `--var VERSION_CODIGO:<último commit de workers/>`. Para eso el checkout tiene la historia completa.
  2. **La vigilancia lee `VERSION_CODIGO`** de los ajustes del Worker (`GET …/workers/scripts/hidrantes-avisos/settings`, `result.bindings`). Si no coincide con `git log -1 -- workers` de `develop`, o no está, es un problema. Sin permiso de lectura ya lo dice el cron (punto 7), y no se repite.
  3. **La vigilancia también mira staging** con `SUPABASE_DB_URL_STAGING`: avisos sin salir y tareas de `pg_cron`, que guarda en su `config.tareas_programadas`. Anota `ultima_vigilancia` y `vigilancia_ok` en las dos bases. En staging no se miran el respaldo, el tamaño (la base de dev la comparte uniformidad) ni los intentos del código. Un problema de staging sale en la misma issue, con «staging:» delante.
- **Descartado:**
  - **Comparar con el id de versión de Cloudflare:** no dice de qué commit es.
  - **Una vigilancia aparte para staging:** duplicaría el workflow, y habría otra issue que mirar.
- **Afecta a:** 04 §9.

### DEC-102 · Los scripts de producción no cambian nada si no han podido leer, y dicen lo que no han mirado
- **Fecha:** 24 sep 2026 · **Estado:** vigente (`docs/20` RV-72, RV-73 y RV-75). Decisión de bajo riesgo de la sesión Ops.
- **Decisión:**
  1. **`arranque --solo-faltantes` lee todo antes de escribir nada:** el repositorio, el Worker y las dos Pages.
     - `wrangler secret list` tiene tres salidas: la lista, el Worker no existe (código 10007 de la API, `WORKER_NOT_FOUND_ERR_CODE` en wrangler) o un error. Un error para con «no se cambia nada».
     - Un secreto de vigilancia nuevo se escribe **primero en el Worker** y solo después en Pages y el repositorio (`vigilanciaEnOrden`), también en `--rotar vigilancia`. Si el Worker no lo acepta, no se toca nada más.
     - Si el Worker ya lo tiene y falla lo demás, el script imprime cómo completarlo: comprobar las sesiones, volver a `--rotar vigilancia` y volver a desplegar staging. Los valores no se imprimen (DEC-053), así que completar es generar otro y ponerlo en los tres sitios, el Worker primero.
  2. **`comprobar-produccion` sale con 2** si una fila imprescindible queda en NO COMPROBADO. Con `--parcial` sale con 0, y el resumen dice qué queda para la otra mitad.
     - La invocación de P-10 es `npm run comprobar-produccion -- --completo`. Hace la mitad local, lanza `comprobar-produccion.yml` (que corre con `--parcial --json` y sube las filas como artefacto), espera y une las dos: lo que una no pudo mirar lo pone la otra.
     - Entre las dos solo viajan grupo, nombre, estado y nota.
  3. **`paridad.ts`** solo compara con el segundo padre del merge si ese padre está en `origin/develop` (`git merge-base --is-ancestor`). Si no, compara con `origin/develop` y lo dice.
- **Descartado:**
  - **En RV-73, un único proceso en Actions que lea también los secretos del repositorio:** `GITHUB_TOKEN` no puede listarlos, y un token con ese permiso sería un secreto más que rotar.
  - **En RV-72, reintentar `wrangler secret list`:** un reintento que al final falla seguiría necesitando parar.
- **Afecta a:** 04 §4 (comprobar producción); 15 §2 (rotar).

### DEC-101 · Novedades sin códigos de ninguna serie ni términos técnicos
- **Fecha:** 24 sep 2026 · **Estado:** vigente (`docs/20` RV-77). Decisión de bajo riesgo de la sesión Ops.
- **Contexto:** en Ajustes salieron «Calles, lugares, direcciones y coordenadas (GM-04)» y «Avisos cada 5 minutos desde un Worker de Cloudflare». El filtro tenía una lista de series (RV, F, TR, FR, DEC, AC, UI), y cada serie nueva se colaba.
- **Decisión:**
  1. Un solo patrón para cualquier código: `[A-Z]{1,4}-d{1,3}` y `Fd+(.d+)?`. Entre paréntesis (solos o varios, con «Fase N» y «#N») se quitan y la línea se queda. Suelto en la frase, la línea no entra: quitarlo dejaría la frase coja.
  2. Una entrada con un término técnico no entra. La lista está en `TERMINOS_TECNICOS` (`scripts/generar-novedades.ts`): Worker, Cloudflare, Supabase, CI, workflow, token, build, PR, migración, pgTAP, e2e y Playwright. CI y PR solo en mayúsculas, para no descartar palabras corrientes; los demás sin distinguir.
  3. Los códigos de punto (`HID-0012`) no cuentan: llevan cuatro cifras.
- **Coste aceptado:** una carretera escrita como «A-92» descartaría la línea. Hoy no hay ninguna, y es mejor perder una novedad que enseñar un código.
- **Afecta a:** `scripts/generar-novedades.ts` (FR-167 no cambia).

### DEC-100 · Especificaciones grandes en tres sesiones en paralelo, y CI que no hace esperar
- **Fecha:** 24 sep 2026 (desarrollador) · **Estado:** vigente. `docs/trabajo-en-paralelo.md`; PAR-01 es su preparación.
- **Contexto:**
  - En `docs/18` hubo unas 6 h de trabajo real y 24 PR en serie, cada uno con unos 10 min de CI.
  - `ci-e2e` era un solo trabajo de 8 a 10 min, también en los PR que solo tocaban documentación. `ci-calidad` tarda 1 min y `ci-sql` 4.
  - Con varias sesiones a la vez, dos cosas fallarían sin avisar: los e2e de una sesión probarían el build de otra (el mismo puerto 4173 con `reuseExistingServer`), y dos migraciones con el mismo número o fuera de orden solo se verían al desplegar staging.
- **Decisión:**
  1. **Tres sesiones** (Ops, Backend, Frontend), cada una dueña de sus rutas, coordinadas por una issue por especificación. El reparto está en `docs/trabajo-en-paralelo.md`.
  2. **Puertos por sesión:** `PW_PUERTO` en `playwright.config.ts` (4173 por defecto) y `VITE_PUERTO` en `vite.config.ts` (5173). Los dos e2e que tenían escrito `127.0.0.1:4173` usan `baseURL`.
  3. **`ci-e2e` en tres partes** (`ci-e2e-parte`, `--fully-parallel --shard=N/3`, `fail-fast: false`) más `ci-e2e-rendimiento` con un worker. Los navegadores salen de una caché por la versión de `@playwright/test` (`.github/actions/navegadores`). El check obligatorio sigue llamándose `ci-e2e`: es un agregador con `if: always()` que solo acepta `success` y `skipped`. Así `CHECKS_OBLIGATORIOS` y la protección de ramas no cambian.
     `--fully-parallel` reparte por test: por archivo, en el primer intento una parte tardó 5,5 min y las otras dos 3,7. Ningún spec comparte estado entre tests: no hay `beforeAll` ni `serial`, y el estado simulado vive dentro de cada test.
  4. **PR de documentación:** el trabajo `cambios` da `codigo=false` si todo lo cambiado está bajo `docs/` o es `*.md` fuera de `src/` (`.github/scripts/hay-codigo.sh`). Entonces `ci-sql` y los e2e se saltan por su `if`, y GitHub los cuenta como correctos. En `push` y a mano, siempre `codigo=true`. Ni los e2e ni ci-sql leen `docs/`: `intrusion.ts` escribe en 11, pero no lo lee.
  5. **Migraciones en orden desde CI:** en los PR, `ci-calidad` corre `scripts/comprobar-migraciones-nuevas.ts`. Falla si una migración añadida no va por encima de la mayor de la rama base, y dice a qué número renumerar. También falla si el PR modifica o borra una migración de la base (CLAUDE.md §3).
  6. **Números de decisión:** DEC-099 ya lo tomó la pantalla de entrada (#327). Este documento es DEC-100, y los rangos de la próxima especificación son Ops DEC-100 a 105, Backend 106 a 111 y Frontend 112 a 117.
- **Suposiciones:**
  - Si falla el trabajo `cambios`, `ci-sql` queda saltado, pero `ci-e2e` falla y el PR no se puede fusionar.
  - Una lista de cambios vacía cuenta como código.
  - «Comprobarlo en el propio PR con un commit que solo toque `docs/`» no se puede hacer. `cambios` mira todo el PR, y el de PAR-01 toca código, así que la prueba es el segundo PR de 9.6.
- **Descartado:**
  - **`paths-ignore` en el workflow:** sin ejecución no hay check, y un check obligatorio que no llega deja el PR esperando para siempre.
  - **`fullyParallel` en `playwright.config.ts`:** cambiaría también cómo corren los e2e en local. Basta con `--fully-parallel` en las partes del CI.
  - **Rangos de migraciones por sesión:** `migrar.ts` rechaza una pendiente anterior a la última aplicada.
- **Resultado:** la duración antes y después (mediana de 5 ejecuciones, API de Actions) está en `docs/verificacion/par-01.md`.
- **Afecta a:** 04 §11; CLAUDE.md §5; `docs/trabajo-en-paralelo.md`.

### DEC-099 · La pantalla de entrada no descarga el mapa: las pantallas con sesión van aparte
- **Fecha:** 24 sep 2026 · **Estado:** vigente. Decisión de bajo riesgo (no cambia ningún requisito); la parte de Lighthouse queda **propuesta**, sin aplicar.
- **Contexto:**
  - El paso de Lighthouse de `deploy-staging.yml` (TR-103) fallaba a ratos con rendimiento 0,84 frente a 0,85, también con commits que solo tocaban documentación.
  - No era ruido. En los 22 informes de staging entre `d0e8f5a` y `31ea8b9`, la mejor de las dos pasadas (LHCI agrega con `optimistic` por defecto) bajó de 0,88–0,91 a 0,84–0,86, siempre con FCP ≈ 3,1 s y LCP ≈ 3,4 s. La primera pasada sale casi siempre peor (0,34–0,92, TBT de hasta 3,6 s): arranca en frío.
  - Lighthouse mide la pantalla de entrada, sin sesión. Esa pantalla cargaba todo: Leaflet, protomaps, el estilo del mapa base y todas las pantallas con sesión (285 kB gzip en un build como el de staging). Las funciones de mapa para emergencias (GM-01 a GM-06) sumaron unos 13 kB, y #304, #314 y #319 sumaron 1,6 kB entre las tres. Eso no causa el fallo por sí solo, pero dejó la nota en el umbral.
  - Además, `main.tsx` empezaba a descargar el mapa base entero (4,3 MB) en la pantalla de entrada. En Lighthouse, si esa descarga acaba antes del último repintado del LCP (el cambio de fuente), entra en el cálculo del LCP y la nota se hunde. En local ocurre siempre: LCP de 25 s. En staging no había pasado aún, pero por solo unos milisegundos de diferencia.
- **Decisión:**
  1. Las pantallas con sesión (mapa, lista, Ajustes, operaciones, bienvenida, incidencia) van en **una sola porción**, `src/paginas/RutasDentro.tsx`, que `App.tsx` carga con `lazy`. Van todas juntas para que, una vez dentro, ninguna pantalla dependa de otra descarga: sin cobertura se puede ir a cualquiera. El Service Worker la precachea con el resto del JS (`globPatterns`). La envuelve un límite de error propio (`LimiteCarga`), que no se reinicia al cambiar de ruta y, si la porción no llega, recarga la app (TR-106).
  2. **Precarga con sesión:** `config/precarga.ts` añade a `index.html` un script clásico diminuto, `assets/precarga-<hash>.js`, que solo con sesión guardada (token, sesión de Google o `?code=`) pide la porción y su CSS en paralelo con el JavaScript inicial. Sin esto, la primera pantalla útil con 3G (TR-10) pasaba de 2,7 s a 3,5–3,9 s por las idas y vueltas. Es un archivo y no un script en línea, para que la CSP siga siendo `script-src 'self'`.
  3. **El mapa base se comprueba y se descarga al entrar**, al montar `RutasDentro`, y no al arrancar. FR-81 no cambia: se descarga la primera vez que hay wifi. Sin sesión no hay mapa que enseñar.
  4. **Guarda en CI:** `npm run presupuesto` falla si el JavaScript inicial vuelve a traer Leaflet, protomaps o una pantalla con sesión. Además, un e2e comprueba que la entrada no pide la porción ni el mapa base, y que la precarga solo la pide con sesión.
- **Resultado:** JavaScript inicial de 285 kB a 178 kB gzip, y peso total de la entrada de 4,7 MB a 271 kB. Con Lighthouse 12.6.1 en local, rendimiento de 0,62–0,65 a 0,87–0,91 (FCP de 3,29 s a 2,78 s). TR-10 en local: de 2,63–2,73 s a 2,76–2,93 s. Cumple, con menos margen; el `vite preview` local va por HTTP/1.1, con seis conexiones, y Cloudflare por HTTP/2.
- **Descartado:**
  - **Bajar el umbral**, o subir `numberOfRuns` con la agregación optimista: sería pasar más veces sin arreglar nada.
  - **Mediana de más pasadas ahora:** con la primera pasada en frío, la mediana de dos o tres habría fallado *más* con el código de antes.
  - **Cargar en diferido solo lo del modo incidente:** el peso está en Leaflet y en las pantallas, no en GM-03.
  - **Una porción por pantalla:** sin cobertura, ir a una pantalla aún no descargada fallaría si el Service Worker no la tiene.
  - **Script de precarga en línea con hash en la CSP:** toca la CSP (11) por 300 ms.
- **Propuesta pendiente del desarrollador:** cuando staging lleve unos días con esto, pasar `.github/lighthouse.json` a `numberOfRuns: 3` con `aggregationMethod: "median"`. Con una pasada en frío y dos templadas, la mediana es la peor de las templadas: más exigente que hoy y sin depender de la suerte. TR-103 no cambia.
- **Afecta a:** 03 TR-10, TR-11 y TR-103 (sin cambio de texto); 10 AC-115 y AC-131.

### DEC-098 · Sin cobertura, el mapa base propio va debajo de la capa en línea
- **Fecha:** 24 sep 2026 · **Estado:** vigente (`docs/19` RV-58). Pendiente de conformidad de jefatura con 01 v1.4 (F9.1, #76).
- **Contexto:** con la capa de calle (OSM) o el satélite (PNOA) elegida, al perder la cobertura el mapa se quedaba en blanco con los marcadores y un aviso. En una emergencia sin señal eso deja al voluntario sin calles, aunque tenga el mapa base en el móvil.
- **Decisión:**
  - Mientras la conexión no esté bien (`conexion !== 'bien'`) y el mapa base esté descargado, se pinta **debajo** de la capa en línea. Encima sigue la capa elegida, con lo que el navegador tenga en caché o nada. Es el mismo mecanismo que ya usaba Catastro, generalizado en `capasPintadas` (`src/lib/capas.ts`).
  - El aviso pasa a "Sin cobertura: se ve el mapa base propio en lugar de «…»". Sin el mapa base descargado, el aviso sigue como estaba.
  - La capa elegida no se cambia ni se guarda otra: al volver la cobertura, todo queda como estaba.
- **Descartado:** cambiar la capa al mapa base al perder la cobertura. Obliga a volver a elegirla y pisa la preferencia de FR-93.
- **Afecta a:** 01 FR-63 (v1.4), 06 Apéndice A.

### DEC-097 · Los avisos push los despacha un Cloudflare Worker con Cron Trigger
- **Fecha:** 24 sep 2026 (desarrollador) · **Estado:** vigente (`docs/19` §0.2.2, RV-52). Sustituye la cadencia de DEC-088: lo demás de DEC-088 (reclamar, anotar, `quedan`) sigue igual.
- **Contexto:**
  - El cron de GitHub es de mejor esfuerzo. `avisos.yml`, programado cada 15 minutos, corrió el 23 y 24 sep a las 16:16, 19:45, 22:45, 01:09, 06:10 y 11:48.
  - Además, la tarea de PROD fallaba porque producción no tenía aún la versión actual (lo arregla DEC-096).
  - Los avisos solo llegaban a tiempo si alguien sincronizaba o moderaba.
- **Decisión:**
  - Un Worker, `hidrantes-avisos` (`workers/avisos/`), con `crons = ["*/5 * * * *"]`, en la cuenta de Cloudflare que ya existe.
  - Cada 5 minutos llama a `POST /api/push` de producción y de staging con `X-Vigilancia` y el secreto de cada uno. Repite mientras la respuesta traiga `quedan`, como mucho 10 veces por destino: 20 subpeticiones, por debajo de las 50 del plan gratuito.
  - El tiempo de espera de `fetch` no cuenta como CPU. Parsear respuestas tan pequeñas queda muy por debajo de los 10 ms de CPU del plan gratuito.
  - Un 401 o un 404 de un destino se anota con `console.warn`, sin datos, y se sigue con el otro: un entorno atrasado no para al otro. Nunca lanza.
  - **Uno solo para los dos entornos**, desplegado desde `deploy-staging.yml` cuando cambia `workers/` o si aún no existe. Su código es el mismo para ambos y no toca datos: solo pide a cada Function que envíe lo suyo. No tiene superficie HTTP: `workers_dev = false`, sin rutas, y `fetch()` responde 404.
  - **Secretos:** `VIGILANCIA_SECRETO_PROD` y `VIGILANCIA_SECRETO_STAGING`, con los mismos valores que Pages y los secretos del repositorio. Los pone `npm run arranque` en la primera instalación, con `--rotar vigilancia` y con `--solo-faltantes`. Como el valor no se puede leer de ningún sitio, si falta en uno se genera uno nuevo para los tres.
  - `avisos.yml` se queda solo con `workflow_dispatch`, como envío manual de emergencia.
  - La vigilancia diaria:
    - baja el umbral de "avisos sin salir" de 2 h a **30 min**;
    - comprueba que el Worker tiene su cron, con `GET …/workers/scripts/hidrantes-avisos/schedules`.

    Lo hace en un trabajo con el *environment* `staging`, que no pide aprobación y tiene el token de la cuenta. DEC-071 sigue valiendo para el resto: ningún trabajo por calendario usa `production`.
- **Token sin permiso de Workers** (24 sep 2026, primer despliegue): el token de los *environments* solo tenía Pages. Por eso:
  - el paso del Worker en `deploy-staging.yml` avisa (`::warning::` y resumen) sin tirar el despliegue de Pages;
  - `comprobar-produccion` lo cuenta como problema («Workers Scripts: Edit»). Mira el permiso con la lista de nombres de los secretos del Worker, que solo da un token con Edit: el token del primer despliegue veía los Workers, pero no podía desplegarlos;
  - `arranque -- --solo-faltantes` despliega el Worker con la sesión de `wrangler login` si falta.

  Ampliar el token es un paso del desarrollador en el panel, porque la API no deja ampliar un token con él mismo (15 §2).
- **Descartado:**
  - `pg_cron` con `pg_net`: exigiría activar una extensión en la base de datos que se comparte con uniformidad y guardar el secreto en esa base;
  - seguir con el cron de GitHub: no se puede confiar en él para algo que el voluntario espera en minutos.
- **Afecta a:** 03 TR-78; 04 §9 (secretos) y §11 (workflows); 05 §9 (`/api/push`); 15 §2; `scripts/arranque.ts`; `workers/avisos/`; `avisos.yml`, `vigilancia.yml`, `mantener-activo.yml` y `deploy-staging.yml`.

### DEC-096 · Producción tiene siempre la versión completa de staging
- **Fecha:** 24 sep 2026 (desarrollador) · **Estado:** vigente (`docs/19` §0.2.1, P-04). Sustituye la última frase de DEC-056 y la regla de `CLAUDE.md` §5 "no lo pidas hasta que la Fase 9 lo diga".
- **Contexto:**
  - `main` se quedó en la versión de prueba de la Fase 0 (18 sep 2026), 145 commits por detrás de `develop`.
  - Con producción tan atrás, cada tarea que depende de ella falla en silencio: `avisos.yml` en PROD, por ejemplo. Además, el primer despliegue de verdad acumularía un mes de cambios sin probar.
- **Decisión:**
  - `main` se pone al día con `develop` al cerrar cada bloque de trabajo, por PR `develop → main` con las dos aprobaciones del desarrollador (el PR y el *environment* `production`).
  - Se fusiona con *merge commit*, no con squash: así `main` y `develop` comparten historia y la paridad se comprueba comparando árboles.
  - Antes de cada PR, `npm run comprobar-produccion` (P-01). Después de cada despliegue, el paso "Paridad con develop" de `deploy-prod.yml` (P-03).
  - La vigilancia diaria avisa si `main` lleva más de 7 días por detrás en algo que no sea documentación.
  - **Poner producción al día no abre el acceso.** El código de acceso real se genera y se comunica en F9.10 (#85), después de la validación de jefatura (#76) y del piloto (#77). Por eso F9.4 (#79) pasa de "PR `develop → main`" a "Abrir producción a la agrupación".
- **Por qué:** es más barato desplegar diez veces poco que una vez mucho. Producción es la que tiene que funcionar cuando nadie mire (CLAUDE.md §9), y sin datos ni código real no expone nada a nadie.
- **Afecta a:** `CLAUDE.md` §5, 04 §4, 09 Fase 9 (F9.4), la issue #79 y DEC-056.

### DEC-095 · La regla de textos de interfaz: qué no es texto que se vea
- **Fecha:** 24 sep 2026 · **Estado:** vigente (`docs/18` RV-50)
- **Contexto:** al rehacer los restos de RV-31 salió que la parte de "tres palabras" de la regla de ESLint (UI-20, TR-111) nunca había funcionado. El patrón estaba en una cadena normal y `'\S'` se quedaba en `'S'`: solo pillaba textos con tildes. Con el patrón arreglado, la regla marcó 26 sitios, y ninguno era texto de interfaz.
- **Decisión:**
  - el patrón va con `String.raw`, y `scripts/eslint.test.ts` comprueba que tres palabras sin tilde dan error;
  - **no** cuentan como texto de interfaz:
    - el marcado, es decir, una cadena que empieza por `<` o lleva `="`, `</` o `/>` (SVG de los marcadores, XML de la exportación);
    - las listas de columnas de PostgREST (`'id, codigo, tipo'`, también con `tabla!fk(…)`);
    - el mensaje de un `new …Error(…)`, que es para quien depura. Lo que ve el usuario sale de `T` por el código de error;
    - un literal o una plantilla entre llaves en un atributo no visible (`className`, `type`). Sí cuentan como hijo de un elemento o en `aria-label`, `title`, `alt`, `placeholder`, `aria-description` y `label`;
  - `MODULOS_SIN_UI` es la lista explícita de módulos de protocolo, que la regla no mira: `api.ts`, `bd.ts`, `almacen.ts`, `supabase.ts`, `red.ts`, `estilo-mapabase.ts`.
- **Descartado:** reescribir los 26 sitios para esquivar la regla. Habría escondido marcado y consultas en constantes sin ganar nada.
- **Afecta a:** 06 §9 (UI-20), 03 TR-111, `eslint.config.js`.

### DEC-093 · Callejero sin conexión desde OpenStreetMap
- **Fecha:** 23 sep 2026 · **Estado:** vigente (`docs/18` §0.3.3, GM-04); pendiente de conformidad de jefatura en F9.1 (#76)
- **Contexto:** la búsqueda de calles y lugares tiene que funcionar **sin cobertura** (FR-73), igual que el resto del mapa. Necesita un callejero de la zona dentro del móvil.
- **Decisión:**
  - `scripts/generar-callejero.ts` (`npm run callejero`) lo genera desde OSM vía Overpass, con los mismos servidores y el mismo `User-Agent` que la zona. Solo corre a mano o en el workflow de regenerar (FR-165), nunca en el build de CI (TR-77).
  - Guarda calles, lugares, polígonos industriales y equipamientos con nombre, unidos por nombre y municipio, simplificados a unos 3 m y recortados a la zona.
  - Sale `public/callejero.json`, de 200 kB como mucho (TR-117). Se precachea y se carga la primera vez que se usa la búsqueda: no va en el JS inicial.
  - Los resultados citan "© OpenStreetMap" (ODbL, como el mapa base, TR-71).
- **Al implementarlo (GM-04, 23 sep 2026):**
  - Cada tramo cuenta por su punto medio: dentro o fuera de la zona, y en qué municipio. Lo que cae en el margen de la zona, fuera de los dos términos (el polígono de Juncaril), va sin municipio.
  - Además de las sendas sin nombre de calle, se descartan las vías `proposed` y `construction`: aún no existen.
  - La primera generación da 795 entradas (638 calles y 157 lugares) en 125 kB. `datos/callejero.json` guarda solo la versión y el recuento, para Salud del sistema (config `version_callejero`, que anota `cargar-version-mapabase.ts` en cada despliegue).
  - Mantenimiento lo regenera con la zona y con el mapa base; si Overpass falla o no cabe, se queda el que había y lo dice el resumen del workflow.
- **Descartado:**
  - la búsqueda de calles de CartoCiudad sin conexión, porque no hay descarga ligera por municipio;
  - Nominatim desde el navegador, porque exige cobertura y su política lo desaconseja.
- **Afecta a:** 01 FR-73, 03 TR-77 y TR-117, 05 (config `version_callejero`), 11 §6.1.

### DEC-092 · Números de portal con CartoCiudad, a través de una Function
- **Fecha:** 23 sep 2026 · **Estado:** vigente (`docs/18` §0.3.3, GM-04); pendiente de conformidad de jefatura en F9.1 (#76)
- **Contexto:** con cobertura, la búsqueda tiene que encontrar también el portal ("calle real 12"), y el callejero de OSM no trae portales. CartoCiudad (IGN/CNIG) los tiene para toda España. Es gratuito y no pide cuenta, así que cumple DEC-037.
- **Comprobado el 23 sep 2026:**
  - **Documentación oficial** (`github.com/IDEESpain/Cartociudad` y *CartoCiudad_ServiciosWeb.pdf* del IDEE):
    - `GET /geocoder/api/geocoder/candidates?q=&limit=&no_process=` devuelve un array de candidatos con `id`, `type` (`portal`, `callejero`, `toponimo`…), `address`, `muni`, `portalNumber`, `lat` y `lng`;
    - `find?id=&type=&portal=` geolocaliza un candidato que venga sin coordenadas;
    - existe `municipio_filter`.
  - **Al implementarlo (GM-04, 23 sep 2026), con llamadas reales:**
    - sin filtro, `candidates?q=calle real 12` devuelve diez calles reales de toda España y ninguna de Albolote. Con `municipio_filter=Albolote,Calicasas` (por nombre; con los códigos INE no devuelve nada) sale `CALLE REAL 12, Albolote`, `type: portal`, `lat 37.23193`, `lng −3.65753`. La Function lo manda siempre;
    - un candidato `callejero` llega con `lat: 0, lng: 0`, no sin ellas: se trata igual que si faltaran y se pide `find?id=&type=callejero`, que devuelve un objeto con `lat`, `lng` y la geometría;
    - `address` viene en mayúsculas ("CALLE REAL 12, Albolote"): la Function la da como "Calle Real, 12, Albolote";
    - sin resultados no se guarda en la caché: una calle nueva puede aparecer al día siguiente.
    - **probado desde local el 24 sep 2026** con `geocodificar()` de la Function contra CartoCiudad real: "calle real 12", "avenida de andalucia 31", "calle real" y "juncaril" dieron el portal, los dos portales (Albolote y Calicasas), la calle (vía `find`) y cinco lugares, en 130 a 410 ms.
  - **Llamada real** desde este equipo: `candidates?q=calle real 12 albolote&limit=3` devolvió `CALLE REAL 12, Albolote`, `type: portal`, `lat 37.2319`, `lng −3.6575`.
  - **Licencia:** según el propio documento de servicios, se pueden usar "de modo libre y gratuito para cualquier uso". La única obligación es mencionar procedencia y autoría, bajo la licencia CC BY 4.0 del SCNE.
- **Decisión:**
  - `POST /api/geocodificar`, una Pages Function nuestra (05 §9). El navegador solo habla con nuestro origen, así que la CSP no cambia.
  - Nunca anónima: pide un token de voluntario o una sesión de administrador.
  - Tiene un tiempo máximo de 5 s (TR-118), una caché de 30 días con la clave `sha256` del texto normalizado y solo devuelve resultados dentro de la zona con 2 km de margen.
  - La consulta no se registra en ningún sitio (11 §6.1).
  - Los resultados dicen "CartoCiudad · IGN".
  - **Caché y tope por token** (docs/19 RV-63, 24 sep 2026). La respuesta dice `x-hidrantes-cache: hit|miss`, y `comprobar-despliegue` hace en staging dos peticiones iguales con el secreto de vigilancia, a esta Function y a `/api/direccion`. Si la segunda no sale de la caché, avisa sin tirar el despliegue. En `*.pages.dev` la Cache API puede no guardar nada, y por eso la protección real frente a un bucle es el tope de 30 búsquedas por minuto y token. El resultado del primer despliegue se anota en `docs/verificacion/revision-3-p1.md`.
- **Descartado:**
  - la API de Google Places: clave, facturación, y términos que prohíben guardar los resultados y usarlos sin conexión;
  - Nominatim para portales, que en la zona casi no tiene números;
  - llamar a CartoCiudad desde el navegador, que abriría la CSP y enviaría la IP del voluntario a un tercero.
- **Afecta a:** 01 FR-73, 03 TR-76 y TR-118, 05 §9, 11 §6.1.

### DEC-094 · Jefatura exige una sesión de Google, no solo el correo del JWT
- **Fecha:** 23 sep 2026 · **Estado:** vigente (`docs/18` RV-36)
- **Contexto:** `fn_es_admin()` daba jefatura a cualquier usuario de Supabase Auth cuyo JWT trajera
  un `email` de `administradores`. El proyecto es también el de la app de uniformidad. Si ese
  proyecto deja registrarse con correo y contraseña, alguien puede darse de alta con el correo de un
  administrador que aún no haya entrado con Google y tener jefatura completa.
  `scripts/comprobar-auth.ts` lo midió el 23 sep 2026 en staging y en producción:
  `disable_signup = false`, correo activado y `mailer_autoconfirm = false`. El registro por correo
  está abierto, con confirmación. El correo de confirmación le llegaría al administrador, que podría
  pulsarlo sin darse cuenta.
- **Decisión:**
  1. `fn_email_jwt()` (0022, misma firma) devuelve el correo solo si se cumplen dos condiciones:
     - `app_metadata.providers` contiene `google`. `app_metadata` lo escribe solo Auth.
     - alguna entrada de `amr` tiene `method = 'oauth'`. `amr` describe cómo se abrió **esta**
       sesión: una abierta con contraseña trae `password`, aunque el usuario tenga Google vinculado.
  2. `fn_es_admin()` compara con ese correo. Con eso quedan cubiertos a la vez `fn_exigir_admin`, la
     rama de jefatura de `fn_proponer`, las políticas de RLS y las Functions, que preguntan a
     `fn_es_admin`.
  3. La configuración de Auth no se toca: es compartida con uniformidad (CLAUDE.md §6). La
     recomendación para su responsable queda en la issue #222.
- **Formato comprobado:**
  - En local, el JWT de una sesión con contraseña trae `amr: [{method: 'password', timestamp}]` y
    `app_metadata: {provider: 'email', providers: ['email']}`. Lo comprueba el test de integración
    `e2e/integracion/jefatura-google.spec.ts`.
  - Para Google, Supabase Auth emite `method: 'oauth'` y añade `google` a `providers`. Es el
    `models.OAuth` de GoTrue, en los flujos implícito y PKCE.
  - El Supabase local no tiene Google. Por eso los tests de integración de jefatura vuelven a
    firmar la sesión local con el secreto JWT **local**, cambiando solo esos dos claims
    (`e2e/integracion/sesion-google.ts`).
- **`comprobar-auth.ts`:**
  - Lee la Management API si hay `SUPABASE_ACCESS_TOKEN`.
  - Si no lo hay, usa el endpoint público `/auth/v1/settings` con la anon key de las variables del
    repositorio, que da los mismos tres datos. Así no hace falta un token de Management para
    comprobarlo.
  - `vigilancia.yml` no lo ejecuta, como pide `docs/18`.
- **Descartado:**
  - cerrar el registro por correo desde aquí, porque es de uniformidad;
  - comparar el `sub` con una lista de usuarios, porque obligaría a dar de alta el uuid de Auth de
    cada administrador;
  - exigir solo `providers ? 'google'`, porque una sesión abierta con contraseña de un usuario que
    además tiene Google pasaría.
- **Afecta a:** 05 §6.3, 11 §2, `e2e/ayudas.ts`, `supabase/tests/*`, `e2e/integracion/*`.

### DEC-091 · Novedades: solo los ámbitos de cara al usuario
- **Fecha:** 23 sep 2026 · **Estado:** vigente (`docs/18` RV-47); completa DEC-087
- **Contexto:** Ajustes enseñaba a los voluntarios líneas como "Scripts/capturas.ts deja las pantallas listas para 13 y 14". `generar-novedades.ts` tomaba cualquier `feat:` o `fix:` del CHANGELOG, y el e2e exigía **exactamente** tres líneas, lo que lo hacía frágil.
- **Decisión:**
  1. Solo entran los commits cuyo ámbito esté en esta lista: `mapa, lista, ficha, alta, operaciones, cola, envios, ajustes, avisos, panel, cola-revision, inventario, fotos, posicion, mapabase, diseño, accesibilidad, busqueda, incidente, medir, compartir`. La lista está en el propio script (`AMBITOS_USUARIO`).
  2. Se descarta la línea que, ya limpia, nombre un archivo (`.ts`, `.tsx`, `.yml`, `.sql`, `.md`) o un código interno (`RV-nn`, `F9.x`, `TR-nn`, `FR-nn`).
  3. Cada línea se corta a 140 caracteres.
  4. Sin ninguna válida, `lineas: []`, y Ajustes enseña su texto vacío.
  5. CLAUDE.md §5.5 lo pide al escribir: la descripción de un `feat:` o `fix:` con ámbito de usuario dice qué cambia para un voluntario.
  6. El e2e pasa a "entre 1 y 3 líneas, sin `/` ni `.ts`".
- **Descartado:**
  - Escribir las novedades a mano en un archivo aparte: nadie se acordaría.
  - Filtrar solo por palabras: los ámbitos ya separan lo interno de lo que se ve.
- **Afecta a:** `scripts/generar-novedades.ts`, CLAUDE.md §5, 10 (AC-127).

### DEC-090 · El tipo de un punto no se cambia
- **Fecha:** 23 sep 2026 · **Estado:** vigente. Decisión del desarrollador (`docs/18` §0.3.1, RV-41); pendiente de conformidad de jefatura en F9.1 (#76).
- **Contexto:** "corregir datos", `fn_editar_punto` y las correcciones de `fn_aplicar_propuesta` admitían `tipo`, pero el `codigo` no cambia. Una boca de riego podía quedarse como `HID-0123`: rompía FR-10 ("coherente con su prefijo"), y del tipo salen el radio del marcador y el diámetro fijo de 45 mm.
- **Decisión:**
  - Fuera de un alta, un `tipo` distinto del actual da `TIPO_NO_MODIFICABLE` en:
    - `fn_proponer` (operación `datos`);
    - `fn_editar_punto`;
    - `fn_aplicar_propuesta` (lo propuesto más las correcciones).
  - Un tipo **igual** al actual se acepta, porque el frontend anterior lo manda siempre (04 §12).
  - En un alta sí se corrige: aún no hay código, y sale del tipo final.
  - La app y el panel dejan de ofrecer el selector fuera del alta. "Corregir datos" enseña el tipo con un enlace a *Proponer retirada*.
  - En la cola del móvil, `TIPO_NO_MODIFICABLE` es un fallo permanente.
  - Las propuestas pendientes antiguas que cambien el tipo no se tocan solas: `fn_aprobar_lote` las omite con ese código y jefatura las rechaza con motivo. 0023 cuenta cuántas hay con `raise notice`.
- **Descartado:** cambiar el código a la vez que el tipo. Un código dado no se reutiliza ni se cambia, y un voluntario puede tenerlo apuntado en campo (FR-10).
- **Afecta a:** 01 FR-11 y FR-44 (v1.3), 02 FL-06, 05 §7 y §8, 06 Apéndice A.

### DEC-089 · Funciones de mapa para emergencias
- **Fecha:** 23 sep 2026 · **Estado:** vigente. Aprobadas por el desarrollador (`docs/18` §0.3.2); pendientes de conformidad de jefatura en la validación F9.1 (#76).
- **Contexto:** el objetivo G2 es ver el punto más cercano que funciona en menos de 15 s y sin cobertura (01 §A). Hasta ahora se conseguía a mano, ordenando la lista por distancia. Faltaban las acciones que Google Maps hace bien, apoyadas en lo que esta app tiene y Google no: datos propios, uso sin conexión y el estado real de cada hidrante.
- **Decisión:** entran cinco funciones, todas sin conexión salvo el número de portal:
  - "¿Qué hay aquí?" con la pulsación larga (FR-72). Sustituye en parte a DEC-077: la pulsación larga ya no abre el alta directamente, sino una hoja cuya acción *Añadir un punto aquí* lo hace a un toque;
  - búsqueda de calles, lugares, direcciones y coordenadas (FR-73);
  - modo incidente con los cinco más cercanos que funcionan (FR-74);
  - compartir y coordenadas UTM ETRS89 huso 30 (FR-75);
  - medir distancia en tramos de manguera (FR-76), con `metros_tramo_manguera` en config (FR-142).

  Además:
  - Nada calcula rutas: "Cómo llegar" sigue abriendo la app de mapas del móvil (16 §2).
  - El incidente, la medición y la posición nunca salen del móvil (11 §6.1).
  - No hay colores nuevos: las marcas de trabajo usan los tokens de interfaz (06 §4.7).
  - No hay dependencias nuevas: UTM, rumbo y distancia a un segmento son código propio, probado contra PROJ (TR-119).
- **Descartado:**
  - **Rutas propias:** necesitarían un servicio de rutas, con cuenta o coste, o un grafo de calles pesado (16 §2).
  - **APIs de Google:** clave, facturación y términos que prohíben el uso sin conexión.
  - **Brújula y rumbo en el punto azul:** en iOS pide permiso de orientación y falla cerca de vehículos.
  - **Recibir ubicaciones compartidas (Share Target):** solo funciona en Android con la app instalada.
  - **Street View en la ficha.**
  - **Rondas de revisión guardadas:** "sin revisar" más el orden por distancia ya lo cubren.

  Todo lo descartado se revisa tras el piloto (`docs/18` §5).
- **Afecta a:** 01 v1.3 (FR-50, FR-69, FR-142, FR-72 a FR-76), 02 v1.3 (FL-03, FL-35 a FL-38), 03 §13 y §8, 05 §2.10 y §9, 06 §4.7 y Apéndice A, 10 §K, 11 §6.1, 16 §2.1.

### DEC-088 · Los avisos salen cada 15 minutos y solo cuentan como enviados cuando se anotan
- **Fecha:** 23 sep 2026 · **Estado:** vigente; sustituye el punto 2 de DEC-068 en cuanto a quién
  despacha los avisos (`docs/17` RV-08). La cadencia (cada 15 minutos con `avisos.yml`) la sustituye
  DEC-097: cada 5 minutos, con un Worker
- **Contexto:** DEC-068 dejó el envío a `/api/push` "al abrir el panel" y a una vigilancia que nunca
  lo llamó: aprobar o rechazar no avisaba a nadie hasta que alguien abría la app, y el resumen del
  lunes esperaba igual. Además `fn_reclamar_notificaciones` marcaba `enviada_en` al reclamar 100, y
  la Function se quedaba sin peticiones de salida hacia el aviso 24 (50 por invocación en el plan
  gratuito): esos avisos quedaban como enviados sin haber salido.
- **Decisión:** (1) reclamar solo anota `reclamada_en` e `intentos`; `enviada_en` lo pone el
  resultado bueno; lo reclamado sin resultado vuelve a salir a los 15 minutos y al cuarto intento
  queda `SIN_RESPUESTA` (0014). (2) `/api/push` reclama 20 (20 × 2 + 2 = 42 < 50) y responde
  `quedan`. (3) `avisos.yml` cada 15 minutos, sin *environment* (DEC-071), con
  `VIGILANCIA_SECRETO_{PROD,STAGING}`, que `arranque.ts` crea en Pages y en el repositorio
  (`--rotar vigilancia`). (4) El panel pide el envío tras cada moderación (una vez por lote) y el
  móvil tras cada vuelta de la cola que envió algo.
- **Consecuencia aceptada:** un aviso cuyo resultado no se pudo anotar puede llegar dos veces.
- **Descartado:** marcar enviada antes de enviar con un lote más pequeño (sigue perdiendo si la
  Function cae a mitad) y un Cron Trigger de Workers (Pages Functions no los tiene; haría falta un
  Worker aparte con su despliegue).
- **Paso manual:** `npm run arranque -- --rotar vigilancia`, una vez, unos 5 minutos para los dos
  entornos (15 §2).
- **Afecta a:** 04 §9 y §10, 05 §2.13 y §9, 15 §2, `docs/entornos.md`.

### DEC-087 · Las novedades salen del build, no de la base de datos
- **Fecha:** 23 sep 2026 · **Estado:** vigente (bajo riesgo; `docs/17` RV-20)
- **Contexto:** 05 decía que CI cargaba el CHANGELOG en `config.novedades` y nada lo hacía
  (`docs/verificacion/fase-0.md` lo aplazó): el panel decía siempre "Todavía no hay novedades
  publicadas", y el e2e del panel simulaba la RPC y no lo veía. Además `fn_novedades` solo la
  ejecuta `authenticated`: el voluntario no podía ver nada, y FR-167 / AC-127 piden novedades en
  Ajustes de la app al actualizarse.
- **Decisión:** `scripts/generar-novedades.ts` lee `CHANGELOG.md` y escribe
  `src/generado/novedades.json` (versión, fecha y tres líneas limpias: sin ámbito en negrita, sin
  enlaces ni identificadores técnicos; primero novedades, luego correcciones). Corre en `prebuild`,
  así que cada build de CI y de despliegue lleva las de su CHANGELOG. Ajustes de la app las enseña
  (con "Nuevo" y un punto en la pestaña hasta abrirlas); el panel las lee del mismo JSON.
  `fn_novedades` se queda sin uso (04 §12) y se retira en la siguiente versión mayor.
- **Sin paso de CI que compare el JSON con git:** el CHANGELOG cambia en el PR de release-please,
  que no tiene quién regenere el JSON sin romper DEC-079; como `prebuild` lo regenera siempre, lo
  que se despliega nunca va atrasado. El archivo en git es solo para que el typecheck y los tests
  tengan algo que importar; puede ir una versión por detrás.
- **Lo que queda en manos del desarrollo:** las líneas salen de los `feat:`/`fix:`. Si no se
  entienden para un voluntario, el arreglo es escribir mejor el commit, no filtrar aquí.
- **Afecta a:** 05 §6.2, 06 Apéndice A.

### DEC-086 · Código de acceso: el /64, la cuenta bajo bloqueo y un tope de canjes buenos
- **Fecha:** 23 sep 2026 · **Estado:** vigente (`docs/17` RV-14)
- **Contexto:** el `dispositivo_id` lo elige el cliente y la IP se hasheaba entera: en IPv6 un
  atacante rota direcciones dentro de su /64 y el límite por IP no sirve; solo queda el techo global
  de 200 fallos por hora, que además se podía pasar con peticiones en paralelo (la cuenta iba sin
  bloqueo). Y los canjes buenos no tenían límite: con el código, dispositivos sin fin.
- **Decisión:** (1) la Function cuenta el /64 en IPv6 (`normalizarIp`). (2) `fn_verificar_codigo`
  empieza con un bloqueo consultivo: los canjes van de uno en uno (son pocos). (3) Topes de canjes
  buenos `max_altas_ip_dia` = 150 y `max_altas_global_hora` = 150: la sesión presencial de F9.9 son
  65 personas en la misma wifi y cabe con más del doble de margen. (4) Cada `DEMASIADOS_INTENTOS` se
  anota (`bloqueado`, `tope`), sin contar como fallo; Salud del sistema enseña fallos y bloqueos de
  24 h y la vigilancia abre la issue con más de 300 fallos o cualquier bloqueo de todo el grupo.
- **Límite conocido:** el bloqueo por inundación del techo global sigue siendo posible; la defensa
  completa (Turnstile o una regla de rate limiting de Cloudflare) cambia la entrada y 11, y queda en
  `docs/17` §12 para decidir.
- **Descartado:** subir el código a 8 cifras ya (cambia FR-31 y la comunicación a 65 personas: solo
  si se confirma un ataque) y contar los bloqueados como fallos (reintentar alargaría el bloqueo de
  quien espera).
- **Afecta a:** 05 §2.5, §2.10 y §11; 11 §3.

### DEC-085 · Los workflows programados se rehabilitan solos para que GitHub no los apague
- **Fecha:** 23 sep 2026 · **Estado:** vigente (revisión de sep 2026, `docs/17` RV-11)
- **Contexto:** en un repositorio público, GitHub desactiva los workflows con `schedule` cuando el
  repositorio pasa 60 días sin actividad
  (<https://docs.github.com/en/actions/how-tos/manage-workflow-runs/disable-and-enable-workflows>).
  Cuando el desarrollo termine se pararían a la vez `mantener-activo.yml` (y Supabase se pausaría,
  también para uniformidad, DEC-054), el respaldo, la vigilancia y la purga de fotos, y nadie se
  enteraría porque la vigilancia también se para.
- **Decisión:** `mantener-activo.yml` tiene un job `mantener-workflows` que llama a
  `PUT /repos/…/actions/workflows/<archivo>/enable` para cada workflow programado, con una lista
  explícita; `vigilancia.yml` hace lo mismo como paso final, así que se sostienen mutuamente.
  `vigilancia.yml` además comprueba que cada uno está `active` y que su última ejecución programada
  tiene menos de 2 días (8 para los semanales) y, si no, abre la issue de vigilancia.
  `scripts/workflows.test.ts` rompe CI si aparece un workflow programado fuera de la lista.
- **Límite conocido:** la documentación de GitHub no dice expresamente que habilitar por la API
  reinicie el contador; es el mecanismo que usan las acciones de *keepalive* sin commits. Si GitHub
  lo cambia, la comprobación de la vigilancia lo detecta (un workflow desactivado o parado abre la
  issue) y GitHub avisa por correo antes de desactivar; la alternativa sería un commit vacío mensual
  a una rama `mantenimiento/latido`, que pediría otra decisión.
- **Descartado:** depender de la fusión automática de Dependabot (no garantiza actividad) y un
  commit mensual automático a `develop` (ensucia el historial y dispara despliegues).
- **Afecta a:** 04 §9, 15 §4.

### DEC-084 · Las reservas de subida valen 7 días y caducan un día antes de que la purga las borre
- **Fecha:** 23 sep 2026 · **Estado:** vigente (`docs/17` RV-07, RV-19)
- **Contexto:** la purga de fotos protegía las reservas de menos de 24 h, y `fn_proponer` aceptaba
  cualquier reserva del mismo dispositivo. Con una foto subida, un `fn_proponer` fallido y más de
  24 h sin red, la purga del lunes borraba el archivo y el reintento **entraba**: jefatura podía
  aprobar un punto con un `foto_path` inexistente, aunque la foto es obligatoria. Y `subidas` crecía
  sin límite.
- **Decisión:** clave `dias_reserva_subida` = 7. La purga protege las reservas de menos de 7 días;
  `fn_proponer` rechaza con `FOTO_NO_RESERVADA` una reserva sin confirmar de más de 6, y el móvil,
  que aún guarda el Blob en su cola, la vuelve a subir. `pg_cron` borra las reservas de más de 30
  días; la idempotencia va por `clave_local` antes de mirar la foto, así que no rompe reintentos.
  En la misma migración, con sesión de administrador `fn_proponer` ignora los `autor_*` recibidos
  (usa "Jefatura" y el correo recortado a 60) y el alta de jefatura no ofrece "otra medida" (RV-19).
- **Descartado:** alargar solo la ventana de la purga (seguiría existiendo una reserva que la purga
  ha borrado y `fn_proponer` acepta) y confirmar la reserva al subir (la subida no pasa por la base
  de datos: es una URL firmada).
- **Afecta a:** 04 §7 y §9, 05 §2.6 y §2.10.

### DEC-083 · Bajas de puntos purgados, época de los datos y una completa por semana
- **Fecha:** 23 sep 2026 · **Estado:** vigente (`docs/17` RV-06)
- **Contexto:** `bajas` solo listaba puntos que todavía existían; tras la purga de la papelera (30
  días) un móvil que no había sincronizado en ese intervalo seguía enseñando el hidrante para
  siempre. Y tras `npm run restaurar` los puntos vuelven con `actualizado_en` antiguos, así que los
  móviles con un sello más reciente no recibían lo restaurado.
- **Decisión:** (1) `bajas` incluye los `punto_id` de `registro` con `accion = 'purga_papelera'`
  desde `desde` (0012). (2) `restaurar.ts` escribe una `config.epoca_datos` nueva en la misma
  transacción; el móvil que la ve distinta repite una completa. (3) Red de seguridad: una completa
  si la última tiene más de 7 días. Cuesta una lectura de ~1.000 puntos por semana y móvil (unos
  300 kB comprimidos), dentro de la transferencia gratuita.
- **Descartado:** conservar filas "fantasma" de los purgados (contradice la purga, 11 §2) y forzar
  la completa en cada arranque (datos móviles de más).
- **Afecta a:** 05 §10, 15 §5.3.

### DEC-082 · El móvil deriva "sin revisar" y el radio del marcador
- **Fecha:** 23 sep 2026 · **Estado:** vigente (bajo riesgo; `docs/17` RV-05)
- **Contexto:** `v_puntos_activos` calcula `revision_caducada` y `radio_px` al leer, pero tras la
  primera sincronización el móvil solo recibe los puntos con `actualizado_en > desde`. Un punto que
  cruza los 12 meses sin cambiar nunca se veía "sin revisar" (FR-61), y un cambio de
  `escala_radios` no llegaba a los puntos no modificados (FR-142). `fn_listar_puntos` ya mandaba
  `config` y el cliente la ignoraba.
- **Decisión:** `src/lib/derivar.ts` replica `fn_radio_px` y la comparación de fechas de la vista
  (resta de meses al estilo de Postgres) y el móvil deriva los dos campos en todos sus puntos al
  sincronizar, al cargar lo guardado y al volver a la app si cambió el día local. La paridad con el
  servidor se comprueba en la integración contra la pila real. Jefatura lee la vista entera y no
  re-deriva al sincronizar.
- **Consecuencia aceptada:** "hoy" es la fecha local del móvil y el servidor usa la suya (UTC):
  alrededor de medianoche pueden diferir un día.
- **Descartado:** forzar una sincronización completa diaria (más datos móviles para algo que se
  calcula con dos números) y tocar `actualizado_en` de los puntos que caducan con `pg_cron` (una
  escritura masiva que ensucia el registro y no resuelve el cambio de escala).
- **Afecta a:** 05 §10.

### DEC-081 · El ámbar de los avisos, medido como texto y no como relleno
- **Fecha:** 22 sep 2026 · **Estado:** vigente; continúa DEC-072 y DEC-076
- **Contexto:** `--ambar-700` (`#8A6408`) nació como **relleno** del marcador "regular", donde TR-31
  pide 3:1. DEC-076 lo jubiló para caudal y lo dejó para los **avisos**, que son texto sobre
  `--oro-100`: ahí se queda en **4,33:1** y TR-31 pide 4,5:1. Nadie lo midió al cambiarle el oficio.
  axe lo habría visto, pero solo mira lo que está en pantalla, y un aviso casi nunca lo está: saltó
  de forma intermitente en la auditoría del formulario de alta, según llegara o no el aviso del GPS.
- **Decisión:** `--ambar-700` pasa a `#7F5C07`: 4,93:1 sobre `--oro-100`, 5,26:1 sobre
  `--ambar-100` y 6,11:1 sobre blanco. Sigue siendo ámbar; se nota más oscuro solo al compararlos.
  Y `src/lib/accesibilidad.test.ts` gana el par que faltaba, así que a partir de ahora se mide en
  cada cambio en lugar de depender de que un aviso esté a la vista cuando pasa axe.
- **Descartado:** aclarar `--oro-100` (el fondo del aviso es lo que lo hace reconocible de lejos);
  agrandar el texto del aviso a 18 px para entrar en el umbral de texto grande (no cabe en la banda
  del mapa); dejarlo en 4,33:1 (TR-31 es un número, no una orientación).
- **Afecta a:** 06 §2.2 y §5; `src/index.css`; los prototipos 06/07/08.

### DEC-080 · La purga de fotos huérfanas, el trabajo que se quedó sin hacer
- **Fecha:** 22 sep 2026 · **Estado:** vigente; completa el punto 5 de DEC-068
- **Contexto:** DEC-068 dejó los botones de **purga de fotos** y **respaldo** sin dibujar porque sus
  workflows llegaban en la Fase 8. La Fase 8 trajo `respaldo.yml` y su botón, pero la purga se quedó
  por el camino: `fn_fotos_referenciadas()` existía desde la Fase 3 y no la llamaba nadie, el texto
  `Purgar fotos huérfanas` estaba en el Apéndice A de 06 sin usarse, y 04 §9 la daba por hecha. Sin
  ella, cada foto de una propuesta rechazada o de un envío a medias se queda para siempre en el
  gigabyte gratuito: cuando se llene, la aplicación deja de admitir fotos (TR-53). Lo sacó una
  revisión de la aplicación contra 01 y 03, no un fallo en la calle.
- **Decisión:** `scripts/purgar-fotos.ts` + `purgar-fotos.yml`, con las dos vías que pedían FR-144 y
  TR-54: los lunes de madrugada por su cuenta y bajo demanda desde Ajustes con `/api/lanzar-workflow`.
  Qué se conserva lo decide la base de datos (`fn_fotos_referenciadas`: puntos, propuestas pendientes
  o aprobadas y reservas de menos de 24 h), no el script. Tres redes de seguridad, porque borrar
  fotos no se deshace: si la lista de referenciadas llega vacía con el bucket lleno **no se borra
  nada**; si Storage o la base fallan, el script aborta en vez de seguir; y `--ensayo` dice qué
  sobraría sin tocar nada. Al terminar anota en `config.storage_bytes` el espacio que queda ocupado,
  que es lo que Salud del sistema enseña (FR-143).
- **Descartado:** borrar desde `pg_cron` (Postgres no puede tocar Storage); borrar por antigüedad del
  archivo sin preguntar a la base (una foto vieja puede ser la de un punto vivo); pedir confirmación
  escrita como en `promover-piloto.yml` (esto ha de correr solo, TR-54).
- **Consecuencia:** una prueba comprueba que **todos** los trabajos que ofrece el panel tienen
  workflow, para que no vuelva a quedarse uno a medias.
- **Afecta a:** 04 §7 y §9; 06 Apéndice A (el texto ya estaba); 09 Fase 8.

### DEC-079 · El PR de versión necesita un empujón humano para poder fusionarse
- **Fecha:** 22 sep 2026 · **Estado:** vigente
- **Contexto:** `release-please` abre su PR con `GITHUB_TOKEN`, y GitHub, por diseño, **no dispara
  workflows con eventos hechos por ese token**: el PR nace sin checks y `develop` exige tres. El
  workflow lanzaba la CI sobre la rama con `workflow_dispatch` creyendo que bastaba; al fusionar la
  0.1.0 se vio que no: esos checks salen verdes pero **no cuentan como checks del PR**, que sigue
  en `BLOCKED`.
- **Decisión:** el PR de versión se desbloquea con **un empujón de una persona** a su rama (un
  commit vacío vale): eso es un `pull_request: synchronize` de verdad y la CI corre como check del
  PR. El workflow deja el comando exacto en su resumen, para no tener que recordarlo. La CI por
  `workflow_dispatch` se mantiene, pero solo como aviso temprano.
- **Descartado:** un PAT con `contents: write` para que el bot empuje (otro secreto que caduca y
  que hay que rotar, por un empujón cada pocas semanas); bajar la protección de `develop` (es lo que
  garantiza que nada entra en rojo); fusionar con `--admin` (salta los checks: exactamente lo que no
  se quiere en un repositorio de un servicio de emergencias).
- **Afecta a:** `.github/workflows/release-please.yml`; 04 §11.1.

### DEC-078 · Las dos cadenas de conexión, en el repositorio, para poder promover el piloto
- **Fecha:** 22 sep 2026 · **Estado:** vigente
- **Contexto:** `promover-piloto.yml` lee de staging y escribe en producción, y un trabajo de
  GitHub Actions solo puede declarar **un** environment. Con `environment: production` (que es el
  que exige la aprobación del desarrollador) el trabajo no ve los secretos de `staging`.
- **Descartado:** partirlo en dos trabajos, uno por entorno, pasándose el guion generado como
  artefacto. En un repositorio público los artefactos los puede descargar cualquiera, y ese guion
  lleva **nombres de voluntarios** (`autor_nombre`): eso no sale de la base de datos (11, FR-27).
- **Decisión:** `arranque.ts` guarda también en el **repositorio** `SUPABASE_DB_URL_STAGING` y
  `SUPABASE_SERVICE_ROLE_KEY_STAGING`, como ya hacía con los de producción para el respaldo
  (DEC-071). El environment `production` sigue siendo el que manda: sin la aprobación, el trabajo
  ni siquiera arranca.
- **Afecta a:** `scripts/arranque.ts`, `.github/workflows/promover-piloto.yml`, `docs/entornos.md`.

### DEC-077 · Mantener pulsado el mapa empieza un alta ahí mismo
- **Fecha:** 21 sep 2026 · **Estado:** vigente; sustituida en parte por DEC-089 (la pulsación larga abre "¿Qué hay aquí?", cuya acción *Añadir un punto aquí* empieza el alta a un toque)
- **Contexto:** en la prueba con un Android real se pidió poder dar de alta un punto **manteniendo
  pulsado el mapa**, como en Google Maps. Hasta ahora el alta empezaba solo por el botón **+**
  (FL-03) y el pin nacía en el GPS, así que junto a un hidrante al que no se puede uno acercar —una
  mediana, una parcela cerrada— había que mover el pin a mano después.
- **Decisión:** medio segundo de pulsación sobre el mapa del voluntario abre *Nuevo punto* con el pin
  en ese sitio y `origen_ubicacion = 'manual'` (FR-13). **Abre directo, sin preguntar**: el
  formulario ya enseña el pin, se puede mover y se puede cancelar, así que una confirmación previa
  solo sería un toque de más (UI-05). Las coordenadas viajan en la ruta
  (`/proponer/alta?lat=&lng=`) con **seis decimales**, los ~10 cm de TR-61; no son dato personal
  (11 §1), son la ubicación de un hidrante.
- **Detalles del gesto:** cancela si el dedo se mueve más de 12 px (eso es arrastrar el mapa), si
  aparece un segundo dedo (eso es un pellizco para el zoom) o si el propio mapa empieza a moverse o
  a hacer zoom. Sobre un marcador no dispara: ahí manda abrir la ficha. Con ratón el gesto es el
  **clic derecho**, y se le quita el menú del navegador encima del mapa.
- **Por qué un detector propio y no el `contextmenu` del navegador:** en Android no todos los
  navegadores lo lanzan igual sobre un `div` con la selección desactivada, que es lo que hace
  Leaflet. La máquina de estados vive en `src/lib/pulsacion-larga.ts`, sin DOM, y por eso se puede
  probar entera; el `contextmenu` se usa solo para el ratón.
- **Afecta a:** 01 FR-50, 02 FL-03, `src/lib/pulsacion-larga.ts`, `src/lib/propuestas.ts`
  (`rutaAltaEn`, `coordenadasDe`), `src/componentes/mapa/MapaLeaflet.tsx`, `src/paginas/Mapa.tsx`,
  `src/paginas/Proponer.tsx`.

### DEC-076 · El estado "regular" es naranja, no ámbar
- **Fecha:** 21 sep 2026 · **Estado:** vigente
- **Contexto:** en la prueba con un Android real, el desarrollador pidió que **regular se vea
  naranja**. El token de 06 §2.2 era `--ambar-700` `#8A6408`, que en pantalla, y más a pleno sol,
  se lee marrón mostaza; junto al rojo de "malo" no se distingue de un vistazo, que es justo lo que
  la simbología tiene que resolver (06 §1).
- **Decisión:** `regular` pasa a **`--naranja-estado-600` `#A85300`** en el relleno del marcador, la
  leyenda, la lista y el panel; el chip usa `--naranja-estado-100` `#FDE8D6` de fondo y
  `--naranja-estado-700` `#8F4505` de texto (la misma separación relleno/texto que el verde, DEC-072).
- **Por qué ese naranja y no uno más vivo:** el relleno tiene que llegar a 3:1 contra **todas** las
  superficies del mapa claro, incluidas las más oscuras (árboles `#BACFA8`, agua `#B9CBD6`), donde el
  borde blanco no ayuda. `#A85300` da 3,22:1 ahí, exactamente el mismo margen que tenía el ámbar;
  `#CC6600` se queda en 2,30:1 y `#E8710A`, en 2,62:1 sobre el fondo claro. Es decir: el claror lo
  fija TR-31 y lo único que cambia es el tono, que es lo que se pedía.
- **Qué no cambia:** el `--ambar-*` sigue siendo el color de **aviso** (señales de fiabilidad,
  diferencias en el diff, propuesta pendiente, banda de almacenamiento). No es caudal.
- **Afecta a:** `src/index.css`, `src/lib/simbologia.ts`, `src/lib/ficha.ts`, 06 §2.2 y los
  prototipos 06/07/08 y `requisitos-hidrantes.html`; `src/lib/accesibilidad.test.ts` lo mide.

### DEC-075 · El mapa llega a z21, y cada capa dice hasta dónde tiene teselas
- **Fecha:** 21 sep 2026 · **Estado:** vigente
- **Contexto:** la prueba en un Android real (TR-12) sacó tres cosas del zoom: en el mapa no se podía
  acercar lo suficiente para poner el pin donde está el hidrante (tope z19), en el mapa del alta
  tampoco (z20), y **con el satélite al máximo la pantalla se quedaba en blanco**. Lo último no era
  la red: `SelectorPin` permitía z20 mientras la capa PNOA declaraba `maxZoom: 19`, y Leaflet, al
  pasar del tope de una capa, **la quita entera**.
- **Decisión:** un solo tope, `ZOOM_MAX = 21` en `src/lib/capas.ts`, para los dos mapas. Cada capa
  ráster declara `maxNativeZoom` con el último nivel que de verdad sirve —OSM **z19** (su política de
  teselas), PNOA **z20**— y Leaflet amplía esa última tesela en lugar de pedir una que no existe. El
  Catastro es WMS: dibuja a la escala que se le pida y no necesita tope propio.
- **Cómo se ha comprobado el límite de PNOA:** pidiendo teselas al WMTS del IGN en Albolote y en
  Calicasas. Hasta z20 responde `200 image/jpeg`; en z21 y z22, `400` con un XML de excepción.
- **Por qué z21 y no más:** a z21 se distingue la acera de la calzada, que es lo que hacía falta;
  más allá solo se amplía borrosidad. Un test unitario fija el tope y los niveles nativos, y un e2e
  lleva el mapa al máximo con el satélite y comprueba que sigue habiendo teselas (pedidas a z20).
- **Afecta a:** `src/lib/capas.ts`, `src/componentes/mapa/MapaLeaflet.tsx`,
  `src/componentes/operaciones/SelectorPin.tsx`, 06 §4.4.

### DEC-074 · La instalabilidad la comprueba un e2e, no Lighthouse
- **Fecha:** 21 sep 2026 · **Estado:** vigente
- **Contexto:** TR-103 pide "Lighthouse en CI sobre staging: rendimiento ≥ 85, accesibilidad ≥ 95,
  buenas prácticas ≥ 95, **PWA instalable**". Lighthouse 12 (la que trae `treosh/lighthouse-ci-action@v12`)
  **quitó la categoría PWA** y ya no ejecuta la auditoría `installable-manifest`, así que la
  aserción no fallaba por una app no instalable: fallaba porque la auditoría no se ejecutaba
  (`auditRan`, 0 de 1). Eso dejó rojo el despliegue de staging tres veces seguidas.
- **Decisión:** la aserción `installable-manifest` queda en `off` en `.github/lighthouse.json` y la
  instalabilidad se comprueba **con un navegador sobre lo desplegado**, en `e2e/cabeceras.spec.ts`:
  manifiesto con `display: standalone` y `start_url`, iconos de 192 y 512 más uno `maskable`, los
  tres servidos como PNG, y un Service Worker activo. Lo lanza `deploy-staging.yml` justo después de
  desplegar, con `URL_DESPLEGADA`. Los tres umbrales numéricos de TR-103 siguen en Lighthouse.
- **Descartado:** clavar la acción a Lighthouse 11 para conservar la categoría PWA (quedarse atrás en
  la herramienta que mide accesibilidad y rendimiento, por una auditoría que se puede hacer mejor
  desde el propio navegador).
- **Afecta a:** `.github/lighthouse.json`, `e2e/cabeceras.spec.ts`, `.github/workflows/deploy-staging.yml`;
  03 TR-103 (lectura: la parte de "PWA instalable" no la mide Lighthouse).

### DEC-073 · El aviso de almacenamiento salta al 90 % del gigabyte gratuito
- **Fecha:** 21 sep 2026 · **Estado:** vigente
- **Contexto:** la prueba de degradación de la Fase 8 pide "Storage al 90 % → banda en Salud", pero
  ningún documento decía de qué es ese 90 %, qué dice la banda ni si bloquea algo. Salud del sistema
  solo enseñaba los megas ocupados, que no le dicen nada a jefatura si no sabe la cota.
- **Decisión:** el porcentaje es sobre el **1 GB de fotos de TR-53**, la única cota que la aplicación
  puede llenar sola. Desde el 90 %, la tarjeta de Salud del sistema enseña una banda de aviso (06 §5:
  fondo `--oro-100`, borde `--oro-600`, texto `--ambar-700`, ⚠ delante) que dice el porcentaje y qué
  hacer: purgar la papelera y las fotos huérfanas. **No bloquea nada** y no se puede descartar: es un
  dato de la tarjeta, no una alerta que se cierre y se olvide. Por debajo del 90 % no se dibuja
  (UI-01: nada que no aporte).
- **Descartado:** cortar las subidas al llegar al 90 % (dejaría a un voluntario sin poder enviar su
  alta con un cuarto de giga libre); avisar por push a jefatura (aún no hay tema para eso y el aviso
  no es urgente: se ve al entrar en Ajustes).
- **Afecta a:** `src/lib/panel/ajustes.ts` (`avisoAlmacenamiento`), `src/componentes/panel/Ajustes.tsx`,
  `src/lib/textos.ts`, 06 Apéndice A, `e2e/degradacion.spec.ts`.

### DEC-072 · Dos arreglos de contraste que salieron al medir los tokens
- **Fecha:** 20 sep 2026 · **Estado:** vigente
- **Contexto:** la Fase 8 pedía comprobar TR-31 (4,5:1 en texto, 3:1 en los colores de estado sobre
  el mapa) de forma automática. Al escribir la comprobación sobre los tokens de verdad aparecieron
  dos incumplimientos que nadie había medido:
  1. `--verde-600` sobre `--verde-100` da **4,17:1**, y ahí va texto: las etiquetas "bueno", "alta"
     y "resuelta". Los otros tres estados sí llegan (4,63 / 6,04 / 7,70).
  2. En modo oscuro, 06 §2.4 cambiaba el borde del marcador a `#111826` "para que siga separando
     del fondo". Contra el mapa oscuro (`#1B2536`) ese borde da **1,16:1**, y los rellenos de estado
     contra él, entre 1,81 y 3,52: el marcador se perdía justo donde se usa de noche.
  3. Y axe, sobre las pantallas montadas, encontró el que más se usa de todos: **texto blanco sobre
     `--naranja-600` `#DD5A1F` da 3,78:1**. Es el botón de Enviar, el de Entrar, el botón + del mapa
     y la banda de pruebas. El mismo naranja como texto sobre blanco, igual.
- **Decisiones:**
  1. **`--verde-700` `#276B42`** para el texto sobre `--verde-100` (5,31:1). El relleno del marcador
     sigue siendo el `--verde-600` que fija 06 §4.2: la simbología de emergencias no se toca.
  2. **`--naranja-600` baja a `#C94F16`** (4,55:1 con blanco encima, y 4,55:1 sobre blanco). Es el
     color de acción de toda la aplicación, así que el cambio se ve; se prefiere eso a un botón que
     no se lee a pleno sol, que es el escenario de 06 §1. Cuando el naranja es **texto sobre una
     superficie** se usa `--naranja-texto`: `#BE4811` en claro (4,56:1 sobre `--fondo`) y `#F0A070`
     en oscuro (7,48:1 sobre las tarjetas), el mismo que ya usaba el badge de pendientes.
  3. **El borde del marcador se queda blanco en los dos modos.** Contra el mapa oscuro da 13,6:1 y
     los cuatro rellenos contra él, de 5,0:1 a 9,8:1. Es además lo que ya decía 06 §4.2 ("el borde
     blanco de 2,5 px garantiza la separación en cualquier fondo de mapa"): el cambio de §2.4 lo
     contradecía.
  4. **Cómo se lee TR-31 en el mapa:** un marcador se distingue en dos saltos —el relleno contra el
     borde, y el relleno *o* el borde contra el mapa—, y los dos tienen que llegar a 3:1. Exigir el
     relleno contra el mapa a secas es imposible con una simbología idéntica en claro y oscuro: en
     el mapa oscuro, `no_funciona` (`#40453D`) se queda en 1,57:1 y aclararlo cambiaría el color de
     un estado. Queda así en el test; si el desarrollador prefiere cambiar los colores de estado en
     oscuro, se decide aparte.
- **Descartado:** aclarar los cuatro estados en oscuro (cambia la simbología, que es lo primero que
  aprende un voluntario); dejar el verde como estaba (es texto, y TR-31 no distingue).
- **Afecta a:** 06 §2.1, §2.2, §2.4 y los prototipos 06/07/08; `src/index.css`;
  `src/lib/accesibilidad.test.ts`; `e2e/accesibilidad.spec.ts`; 03 TR-31 (lectura).

### DEC-071 · Los secretos de la automatización viven en el repositorio, no en el entorno
- **Fecha:** 20 sep 2026 · **Estado:** vigente
- **Contexto:** `respaldo.yml` (Fase 8) necesita la cadena de la base de datos de producción y la
  clave de servicio. Hoy esos secretos están en el *environment* `production`, que tiene
  `required_reviewers`: cualquier job que lo declare espera a que una persona apruebe la ejecución.
  Eso es exactamente lo que queremos para desplegar, y exactamente lo que **no** puede tener un
  respaldo semanal de madrugada: un respaldo que espera a que alguien pulse un botón no es un
  respaldo, y el proyecto se sostiene sobre la idea de que nadie tiene que mirarlo (TR-50).
- **Decisión:** los trabajos automáticos (respaldo, y más adelante purga de fotos y vigilancia) usan
  **secretos de repositorio** con sufijo de entorno —`SUPABASE_DB_URL_PROD`,
  `SUPABASE_SERVICE_ROLE_KEY_PROD`, `GPG_PUBLIC_KEY`—, y los *environments* siguen guardando los del
  despliegue con su aprobación. El workflow comprueba que están y, si falta alguno, falla diciendo
  en el resumen los tres `gh secret set` exactos, en vez de intentarlo y dejar un respaldo a medias.
- **Descartado:**
  - *Quitarle los revisores a `production`*: es la única barrera entre `develop` y la producción.
  - *Un environment nuevo sin revisores con los mismos valores*: la misma exposición, con un sitio
    más donde mirar cuando algo no cuadre.
  - *Respaldar desde `pg_cron`*: no puede escribir archivos ni cifrarlos.
- **Riesgo aceptado:** un secreto de repositorio lo puede leer cualquier workflow del repositorio.
  El repositorio es público (DEC-053), pero GitHub no entrega secretos a los PR que vienen de un
  fork, y los workflows que los usan solo se disparan por calendario o a mano. Queda como uno de los
  puntos a mirar en las pruebas de intrusión (TR-40, tarea F8.8).
- **Consecuencias:** tres `gh secret set` una sola vez, con valores que el desarrollador ya tiene.
  Hasta entonces el respaldo falla a propósito y lo dice; `vigilancia.yml` avisará de que no hay
  respaldo reciente.
- **Afecta a:** 04 §9, §10; 15 §5.3; `.github/workflows/respaldo.yml`.

### DEC-070 · Regenerar la zona no abre un PR si solo cambia la fecha
- **Fecha:** 20 sep 2026 · **Estado:** vigente
- **Contexto:** al probar el Mantenimiento ya arreglado (DEC-069) se lanzó "Regenerar zona" contra
  OpenStreetMap real. El workflow abrió un PR y el único cambio era la fecha: `generar-zona.ts` sella
  `version` con el día en que se ejecuta, así que los archivos siempre salen distintos aunque la
  geometría sea idéntica byte a byte. El paso "Sin cambios" del workflow mira `git status`, que ve el
  sello y nunca se cumple.
- **Por qué importa:** quien pulsa el botón es jefatura, y quien tendría que revisar el PR es el
  desarrollador. Un PR de ruido cada vez enseña a fusionar sin mirar, que es justo lo que ese PR
  intermedio venía a evitar (DEC-068.5), y convierte el historial de `datos/` en una lista de fechas.
- **Decisión:** `generar-zona.ts` compara lo recién construido con lo que hay en `datos/` ignorando el
  sello de versión (`mismaGeometria`). Si la geometría es la misma, **no escribe nada** y lo dice; la
  versión sigue siendo la del último cambio real, que es lo que "Salud del sistema" enseña como fecha
  de la zona (FR-143). La previsualización HTML sí se reescribe: no se committea.
- **Descartado:** sellar la fecha solo en `meta.json` (el mismo ruido, en otro archivo); que el
  workflow filtrara el diff con `git diff -I` (la regla quedaría en YAML, lejos de quien la lee, y
  `npm run zona` a mano seguiría ensuciando el repositorio).
- **Consecuencias:** "Regenerar zona" con datos sin cambios termina en verde y sin PR, y el resumen del
  workflow lo dice. Cuando OSM cambie de verdad, el PR llega con el cambio y con la fecha nueva.
- **Afecta a:** `scripts/generar-zona.ts`; 04 §8; 12 (DEC-068.5).

### DEC-069 · El token de mantenimiento, con `actions:write` y no con `contents:write`
- **Fecha:** 20 sep 2026 · **Estado:** vigente
- **Contexto:** al ir a crear `GITHUB_DISPATCH_TOKEN` (último paso manual de la Fase 7) apareció una
  contradicción: 04 §10 lo describe desde el principio como un token con el **permiso único
  `actions:write`**, pero la implementación de DEC-068 usa `repository_dispatch`, y GitHub exige para
  ese endpoint **`contents:write`** en los tokens *fine-grained* (`actions:write` solo vale para
  `workflow_dispatch`). Con `contents:write`, un secreto filtrado de una Pages Function pública podría
  empujar directamente a `develop`, que despliega solo a staging; el repositorio es público (DEC-053),
  así que el atacante vería además exactamente qué hay que empujar.
- **Decisiones:**
  1. **Gana 04**, que es el propietario de los secretos: `/api/lanzar-workflow` despacha con
     `workflow_dispatch` sobre el archivo del workflow (`mantenimiento.yml`), rama `develop` y el
     trabajo como entrada `trabajo`. El token se crea con `Actions: Read and write` y nada más.
  2. **`mantenimiento.yml` pierde el disparador `repository_dispatch`**: ya no lo usa nadie y dejarlo
     sería configuración muerta. El paso "Qué toca" lee solo `inputs.trabajo`.
  3. **Un trabajo sin workflow responde `NO_CONFIGURADO`** y no llama a GitHub: `purgar-fotos` y
     `respaldo` siguen en la lista blanca de 05 §9, pero sus workflows son de la Fase 8. Antes se
     mandaba un `repository_dispatch` que nadie escuchaba y la pantalla decía que todo había ido bien.
  4. **Funciona aunque `main` no tenga el workflow**: `workflow_dispatch` por API pide que el archivo
     esté en la rama por defecto, que aquí es `develop` (7, "Nombres fijos"), no `main`.
- **Descartado:** crear el token con `contents:write` y seguir con `repository_dispatch` (más cómodo,
  cero código, pero le da a un secreto de internet permiso de escritura sobre el código); y un token
  *classic* con `repo` (aún más amplio y sin caducidad obligatoria).
- **Consecuencias:** el desarrollador crea el token con un solo permiso. Si en la Fase 8 la purga de
  fotos o el respaldo necesitan su propio workflow, se añaden al mapa `ARCHIVO` de la función.
- **Afecta a:** 04 §10; 05 §9; 12 (DEC-068.5); `functions/api/lanzar-workflow.ts`;
  `.github/workflows/mantenimiento.yml`; `docs/verificacion/fase-7.md`.

### DEC-061 · Riesgo: bloqueos de IP de Cloudflare por LaLiga en España
- **Fecha:** 19 sep 2026 · **Estado:** vigente (riesgo aceptado con mitigaciones)
- **Al día 22 sep 2026:** staging vuelve a abrirse con normalidad y **sin VPN**, desde la misma
  conexión que el 19 no llegaba (200 en 0,14 s). Es lo esperable de un bloqueo por horario de
  partido: va y viene, no se "arregla". El riesgo sigue vigente y las mitigaciones también; lo que
  cambia es que las pruebas que esperaban a esto ya se pueden hacer, y la primera —la de carga en
  un móvil real, TR-12— se hizo ese mismo día.
- **Contexto:** el sábado 19 sep 2026 staging no cargaba ni en fibra ni con datos móviles
  (`ERR_CONNECTION_TIMED_OUT`), mientras que producción, GitHub y Supabase respondían y el despliegue
  se comprobaba bien desde GitHub (EE. UU.). Causa: por orden judicial (sentencia 310/2024), Movistar,
  MásOrange, Vodafone y DIGI bloquean durante los partidos de LaLiga IP compartidas de Cloudflare.
  `hidrantes-albolote-staging.pages.dev` resuelve a **188.114.96.5 / 188.114.97.5**, que según el
  histórico público de hayahora.futbol se han bloqueado 15–19 veces desde julio de 2026 en los cinco
  operadores. Producción (`172.66.47.37`, `172.66.44.219`) y Supabase (`104.18.38.10`,
  `172.64.149.246`) no han aparecido nunca, pero sí 22 IP vecinas de `172.66.*` y dos de `104.18.*`.
  La IP la asigna Cloudflare por nombre de host y puede cambiar; no se puede elegir en el plan gratuito.
- **Riesgo:** un fin de semana de partido, si producción o Supabase caen en la lista, ningún voluntario
  en España llega al servidor durante unas horas. No es una caída que se vea en la página de estado de
  Cloudflare ni desde fuera de España.
- **Decisiones:**
  1. **La mitigación principal ya está en el diseño:** la app instalada abre desde su Service Worker,
     el mapa base y los puntos quedan en el móvil (Fase 5) y lo enviado se encola (Fase 6); el aviso
     es "Sin conexión con el servidor" y reintenta solo (FR-168). Consultar un hidrante en una
     emergencia no depende de la red. Por eso se insiste en instalar y abrir la app una vez con
     cobertura antes de necesitarla.
  2. **Vigilancia automática** (propuesta, pendiente de confirmar): un workflow diario que resuelve los
     tres nombres (producción, staging, Supabase) y los cruza con la lista pública de hayahora.futbol;
     abre una issue si una IP nuestra aparece. Sin cuenta ni coste.
  3. **Staging se prueba fuera de horario de partido** (entre semana, o con la herramienta de
     hayahora.futbol para saber si hay bloqueo). La prueba en móviles reales de la Fase 4 queda
     pendiente por esto.
  4. **Procedimiento en 15 §5.8** para jefatura: cómo reconocerlo y qué hacer.
- **Descartado, por ahora:**
  - *Copia estática en GitHub Pages* (Fastly, nunca bloqueada): sería otro origen, así que el móvil no
    comparte acceso, puntos guardados ni cola con la app principal, y los datos (`*.supabase.co`) y las
    Functions siguen detrás de Cloudflare. Solo ayudaría si cayera `pages.dev` y no Supabase. Queda
    como plan B documentado.
  - *Dominio propio en Cloudflare*: sigue en IP compartidas de Cloudflare (los foros recogen zonas
    gratuitas asignadas a las mismas 188.114.96/97) y cuesta dinero (DEC-006).
  - *Dominio propio para Supabase o salir de Cloudflare*: de pago; contradice el coste 0.
  - *Recrear el proyecto de staging para que le toque otra IP*: azar, y puede volver a pasar.
- **Afecta a:** 09 §3, 15 §5.8; notas para 14.

### DEC-041 · Manuales (13, 14) al final, con capturas reales
- **Fecha:** 17 sep 2026 (desarrollador) · **Estado:** vigente
- **Decisión:** 13 y 14 se escriben después del piloto, con las capturas de `scripts/capturas.ts` sobre la app real.
- **Por qué:** escribirlos sobre mockups obliga a rehacerlos.
- **Afecta a:** 00 §1, 09 Fase 9.

---

## Índice por documento afectado

| Documento | Decisiones |
|---|---|
| 01 | 001–005, 007–022, 037, 039, 040, 042, 089, 090, 092, 093, 098 |
| 03 | 001, 004, 026, 028, 099, 111, 112 |
| 04 | 001, 003, 006, 014, 018–020, 023–031, 052–055, 068, 080, 084, 085, 088, 100, 102, 103, 104, 111 |
| 05 | 002, 005, 008–010, 012–022, 024–025, 030, 035, 057–059, 065, 068, 082, 083, 084, 086, 088, 087, 118, 119, 120, 132 |
| 06 | 012, 013, 027, 047, 060, 062, 063, 064, 065, 066, 067, 068, 080, 081, 087, 098, 113 |
| 07, 08 | 036 |
| 09 | 006, 029, 031, 032, 035, 037, 038, 040, 041, 043, 044, 046, 047, 048, 050, 051, 060, 061, 062, 063, 065, 067, 068, 080 |
| 00, CLAUDE.md | 034, 038, 043, 044, 045, 046, 047, 049, 050, 053, 091, 100, 114, 115, 116 |
| 11 | 002, 004, 011, 017–019, 022, 086, 094, 118 |
| 15 | 023, 061, 085, 088, 102, 128, 129 |
| 16 | 007, 037, 111 |
| 03, 04, 05, 10 | 037, 038, 039, 047, 048, 050 |
| 07, 08 | 036, 049 |

## Cómo añadir una decisión

1. Copiar la plantilla de una entrada, siguiente número libre, fecha de hoy.
2. Escribir el contexto **antes** que la decisión: qué problema había.
3. Anotar lo descartado y por qué; es lo que evita volver a discutirlo.
4. Actualizar el documento propietario (00 §2) y añadir el número aquí y en su cabecera de versión si es congelado.
5. Si sustituye a otra, marcar la antigua como "sustituida por DEC-nnn" sin borrarla.
