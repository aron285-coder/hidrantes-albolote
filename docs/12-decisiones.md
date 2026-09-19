# 12 · Registro de decisiones — Mapa de hidrantes

| | |
|---|---|
| **Estado** | Vivo. Cada decisión se anota **el mismo día** que se toma. Nunca se edita una entrada cerrada: si cambia, se añade otra que la sustituye y se enlazan. |
| **Versión** | 1.3 — 19 de septiembre de 2026 (DEC-052 a DEC-059; v1.1: DEC-037 a DEC-051) |
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
- **Fecha:** 18 sep 2026 (desarrollador) · **Estado:** vigente
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

### DEC-041 · Manuales (13, 14) al final, con capturas reales
- **Fecha:** 17 sep 2026 (desarrollador) · **Estado:** vigente
- **Decisión:** 13 y 14 se escriben después del piloto, con las capturas de `scripts/capturas.ts` sobre la app real.
- **Por qué:** escribirlos sobre mockups obliga a rehacerlos.
- **Afecta a:** 00 §1, 09 Fase 9.

---

## Índice por documento afectado

| Documento | Decisiones |
|---|---|
| 01 | 001–005, 007–022, 037, 039, 040, 042 |
| 03 | 001, 004, 026, 028 |
| 04 | 001, 003, 006, 014, 018–020, 023–031, 052–055 |
| 05 | 002, 005, 008–010, 012–022, 024–025, 030, 035, 057–059 |
| 06 | 012, 013, 027, 047 |
| 07, 08 | 036 |
| 09 | 006, 029, 031, 032, 035, 037, 038, 040, 041, 043, 044, 046, 047, 048, 050, 051 |
| 00, CLAUDE.md | 034, 038, 043, 044, 045, 046, 047, 049, 050, 053 |
| 11 | 002, 004, 011, 017–019, 022 |
| 15 | 023 |
| 16 | 007, 037 |
| 03, 04, 05, 10 | 037, 038, 039, 047, 048, 050 |
| 07, 08 | 036, 049 |

## Cómo añadir una decisión

1. Copiar la plantilla de una entrada, siguiente número libre, fecha de hoy.
2. Escribir el contexto **antes** que la decisión: qué problema había.
3. Anotar lo descartado y por qué; es lo que evita volver a discutirlo.
4. Actualizar el documento propietario (00 §2) y añadir el número aquí y en su cabecera de versión si es congelado.
5. Si sustituye a otra, marcar la antigua como "sustituida por DEC-nnn" sin borrarla.
