# 16 · Alcance y hoja de ruta — Mapa de hidrantes

| | |
|---|---|
| **Estado** | Congelado. Cambia con conformidad de jefatura y nueva versión. |
| **Versión** | 1.2 — 23 de septiembre de 2026 (§2.1: el modo incidente cubre "lo más cercano que funciona" sin rutas, DEC-089; pendiente de conformidad de jefatura en F9.1, #76). 1.1 — 17 de septiembre de 2026 (añade §2.1) |
| **Propietario de** | qué está **fuera** de la versión 1, por qué, y qué habría que decidir para meterlo después. |
| **Regla de alcance (DEC-037)** | Está **dentro** de la versión 1 todo lo que Claude Code pueda construir sin trabajo adicional del desarrollador, sin cuentas externas nuevas y sin coste. Este documento es, por tanto, corto: solo lo que no cumple ese criterio. |

---

## 1. Qué es la versión 1

Todo lo que describe **01** (FR-01 a FR-168), incluidos los requisitos P1 de 01 §13, que se
construyen dentro de la versión 1 pero después del piloto si hace falta para no retrasarlo:
exportación Excel/CSV/GeoJSON, "cómo llegar", QR, notificaciones push, regenerar zona y mapa base
desde Ajustes, núcleos, novedades y degradación controlada.

Orden de entrega: fases 0–8 de **09** → piloto en staging con validación de jefatura → producción →
P1.

---

## 2. Qué queda fuera y por qué

| Fuera | Por qué no cumple el criterio | Qué haría falta para meterlo |
|---|---|---|
| **Dominio propio** (`hidrantes.protecciociv…`) | coste anual y una renovación que alguien tiene que recordar (DEC-006) | decisión de jefatura de asumir 10–15 €/año y quién renueva; después es una tarde de Claude Code: DNS en Cloudflare y dominio personalizado en Pages |
| **Cuentas individuales para voluntarios** | gestionar 65 altas, bajas y contraseñas recaería en una persona (DEC-002); el modelo código + token cubre la necesidad | que jefatura quiera identidad verificada por persona; Supabase Auth con enlaces mágicos exigiría un correo por voluntario |
| **Avisos por correo o SMS** | necesitan un proveedor con cuenta (Resend, Postmark, Twilio…) y, en volumen, coste; el push web cubre el caso (DEC-039) | crear la cuenta del proveedor y su clave; una tarea corta de Claude Code sobre `notificaciones` |
| **Aplicación nativa en tiendas** | cuentas de desarrollador de Apple (99 $/año) y Google, revisión de tiendas, dos bases de código (DEC-001) | nada lo justifica mientras la PWA cumpla TR-20 |
| **Integración directa con sistemas de terceros** (bomberos, ayuntamiento, consorcio) | exige acuerdos, formatos y credenciales de la otra parte | la exportación FR-160 es el canal; una API de solo lectura con clave se puede añadir en un día cuando exista un consumidor concreto |
| **Rutas calculadas dentro de la app** | necesitaría un servicio de rutas (cuenta o coste) o datos OSM de calles offline muy pesados | "cómo llegar" (FR-161) abre la app de mapas del móvil, que ya lo hace mejor |
| **Fotos privadas con URL firmada de lectura** | romperían la caché offline de las fichas (DEC-011) | solo si aparece un motivo de privacidad real; entonces caché de fotos por dispositivo |
| **Monitorización externa** (UptimeRobot, Sentry…) | cuentas externas; `vigilancia.yml` y `errores_cliente` cubren la necesidad (TR-102) | ninguno previsto |

---

## 2.1 Lo que se estudió y no aplica

**Importar un inventario previo.** La app de uniformidad se migró sobre datos reales (46 artículos,
65 voluntarios). Aquí se comprobó que **no existe ninguna lista previa** de hidrantes: producción
arranca vacía y el inventario se construye en campo (DEC-051). Si algún día el ayuntamiento o el
consorcio facilitan una, importarla contra este esquema es un script de un día.

**Código QR por punto** (pegatina en el hidrante que abre su ficha). Técnicamente entra en el
criterio DEC-037, pero exige imprimir y pegar ~400 pegatinas que se despegan a la intemperie; se
descarta salvo que jefatura lo pida.

**"Lo más cercano que funciona" sin rutas.** Las rutas calculadas siguen fuera (§2), pero el modo
incidente (FR-74) responde a la pregunta que importa en una salida: qué puntos activos que funcionan
hay más cerca, a qué distancia en línea recta, en qué dirección y con cuántos tramos de manguera,
sin cobertura. "Cómo llegar" sigue abriendo la app de mapas del móvil (FR-161). Brújula, recibir
ubicaciones compartidas, Street View y rondas guardadas se estudiaron el 23 sep 2026 y quedan fuera
(`docs/18` §5, DEC-089).

---

## 3. Preparado para después

Decisiones ya tomadas para que nada de lo anterior obligue a rehacer:

- `foto_path`, no `foto_url`: cambiar de proveedor de almacenamiento no toca datos.
- `dispositivo_id` como identidad técnica: una cuenta individual sería una columna más, no un rediseño.
- `notificaciones` como cola genérica: añadir un canal (correo) es un envío más, no otro modelo.
- Exportación con esquema estable (TR-105): una API de lectura devolvería lo mismo.
- Capas en `src/lib/capas.ts`: cambiar o añadir un proveedor de mapa es un archivo.

---

## 4. Cómo se decide un cambio de alcance

1. Se propone en una issue con la etiqueta `alcance`.
2. Se comprueba contra el criterio DEC-037. Si lo cumple, entra sin más: se añade el FR en 01 y una
   entrada en 12.
3. Si no lo cumple, jefatura decide si asume el coste o la cuenta que exige; la decisión y su
   responsable van a 12, y la fila correspondiente de §2 se actualiza aquí.

---

## Trazabilidad

| Sección | Origen |
|---|---|
| 1–2 | DEC-001, 002, 006, 011, 037, 039; plan v2.1 Fase 10 (diferido) |
| 3 | 04 §5 (foto_path), 05 §2.2 y §2.13, 03 TR-105 |
