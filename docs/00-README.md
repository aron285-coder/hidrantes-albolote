# Mapa de hidrantes · Protección Civil de Albolote — Índice de la documentación

| | |
|---|---|
| **Estado** | Vivo (este índice se actualiza cada vez que cambia la lista de documentos) |
| **Versión** | 1.6 — 17 de septiembre de 2026 |
| **Idioma** | Español, en todos los documentos. Ver "Idioma" al final. |

Este archivo dice qué documento existe, para quién es, y **quién es dueño de cada tipo de verdad**.
Esa última columna es la que evita contradicciones: hasta ahora la foto figuraba como opcional en
una tabla y como obligatoria en el formulario, y el racor cambió dos veces de alcance, porque la
misma regla estaba escrita en dos sitios.

---

## 1. Documentos

| # | Documento | Archivo | Estado | Para quién |
|---|---|---|---|---|
| 00 | Índice y reglas de la documentación | `00-README.md` | vivo | todos |
| 01 | Requisitos funcionales | `01-requisitos-funcionales.md` | **congelado** | jefatura |
| 02 | Flujos de usuario | `02-flujos-de-usuario.md` | **congelado** | jefatura + construcción |
| 03 | Requisitos técnicos | `03-requisitos-tecnicos.md` | **congelado** | construcción |
| 04 | Arquitectura e infraestructura | `04-arquitectura-e-infraestructura.md` | **congelado** | construcción |
| 05 | Modelo de datos y contrato de API | `05-modelo-de-datos-y-api.md` | **congelado** | construcción |
| 06 | Sistema de diseño y simbología | `06-sistema-de-diseno.md` + `06-sistema-de-diseno.html` | **congelado** | construcción |
| 07 | Prototipo interactivo de la aplicación (móvil, tableta, ordenador; v2.1 incluye los P1) | `07-mockups-app.html` | **congelado** | jefatura |
| 08 | Prototipo interactivo del panel de jefatura (v2.1 incluye exportación, QR, avisos, mantenimiento) | `08-mockups-panel.html` | **congelado** | jefatura |
| 09 | Plan de implementación | `09-plan-implementacion.md` | vivo | Claude Code |
| 10 | Matriz de aceptación | `10-matriz-aceptacion.md` | vivo | jefatura |
| 11 | Seguridad y privacidad | `11-seguridad-y-privacidad.md` | vivo | jefatura |
| 12 | Registro de decisiones | `12-decisiones.md` | vivo | todos |
| 13 | Manual de operación para jefatura (se escribe tras el piloto, DEC-041) | `13-manual-jefatura.md` | vivo | jefatura |
| 14 | Manual del voluntario (tras el piloto, DEC-041) | `14-manual-voluntario.md` | vivo | los 65 voluntarios |
| 15 | Continuidad y emergencias | `15-continuidad-y-emergencias.md` | vivo | jefatura |
| 16 | Alcance y hoja de ruta (lista corta tras DEC-037) | `16-alcance-y-hoja-de-ruta.md` | **congelado** | jefatura |

Escritos: **00–12, 15 y 16**, más `CLAUDE.md` en la raíz del repositorio. Pendientes: 13 y 14 (tras el piloto), que se derivan de los archivos anteriores
(`requisitos-hidrantes.html` v6.1 y `plan-implementacion-hidrantes.md` v2.1) según la tabla de la
sección 5. Hasta que existan, esos dos archivos siguen siendo la referencia para su contenido; para
todo lo cubierto por 00–12, **la referencia son ya estos documentos**. 09 sustituye por completo al
plan v2.1.

---

## 2. Un hecho, una casa

Cada tipo de contenido tiene exactamente un documento propietario. Los demás **enlazan**, no copian.

| Tipo de contenido | Propietario | Ejemplo |
|---|---|---|
| Reglas funcionales ("el sistema debe…") | **01** | La foto es obligatoria en toda alta y revisión |
| Orden de los pasos de una tarea | **02** | Qué pantalla sigue a cuál al dar de alta un punto |
| Eisen medibles: rendimiento, offline, navegadores, límites | **03** | Primera carga < 3 s en 3G |
| Decisiones de infraestructura y despliegue | **04** | Cloudflare Pages + Supabase, dos entornos |
| Campos, tipos, constraints, vistas, firmas de RPC y de las *Pages Functions* | **05** | `diametro_mm smallint`, `fn_aprobar(propuesta_id, correcciones, confirmar_desactualizada)` |
| Colores, tamaños, tipografía, simbología del marcador | **06** | Radio 11 px para 100 mm · bueno |
| Aspecto de cada pantalla | **07**, **08** | Dónde está el botón "Proponer un cambio" |
| Fases, tareas, definición de terminado | **09** | Qué se hace en la Fase 3 |
| Casos de prueba de aceptación | **10** | "Alta sin cobertura llega al panel al recuperar señal" |
| Datos personales, su tratamiento, derecho de supresión, aviso legal | **11** | Qué se guarda de cada voluntario y durante cuánto tiempo |
| Qué se decidió, cuándo, por qué y qué se descartó | **12** | DEC-010 · Racor solo en bocas de riego |
| Procedimientos de operación diaria | **13** | Cómo rotar el código de acceso |
| Instrucciones para el voluntario | **14** | Cómo instalar la app en iPhone |
| Cuentas, respaldo, restauración, marcha atrás | **15** | Cómo restaurar un respaldo |
| Lo que **no** entra en la versión 1 | **16** | Exportación a Excel y GeoJSON: segunda fase |

Reglas derivadas:

- Si un requisito funcional aparece en 02, 07, 08, 09 o 10, va con su identificador (`FR-31`) y sin
  reformularlo. Si hace falta reformularlo, se cambia en 01 y se enlaza.
- Un cambio de campo o de firma se hace en 05 y se propaga a 04 y 09 por referencia. Nunca al revés.
- Una decisión se anota en 12 el mismo día que se toma; los documentos afectados citan la entrada
  (`DEC-nnn`).
- Cuando un documento contradiga a su propietario, gana el propietario y se corrige el otro.
- **Los prototipos 07 y 08 son la referencia visual y de interacción; los documentos mandan.** Si un
  prototipo y 01, 05 o 06 dicen cosas distintas, gana el documento y el prototipo se corrige (o se
  anota la diferencia como decisión en 12). Un prototipo no crea requisitos: lo que se ve ahí y no
  está en 01 no se construye.

---

## 3. Congelado frente a vivo

- **Congelado (01–08 y 16):** describe lo acordado. Cambia solo con nuevo número de versión y fecha
  en la cabecera, y arrastra una entrada en 12. Hasta la validación de jefatura (que se hace sobre
  staging al terminar la Fase 8, DEC-043) los congela el desarrollador; después, cualquier cambio
  exige la conformidad de jefatura.
- **Vivo (00, 09–15):** documentos de trabajo que se actualizan sobre la marcha, sin ceremonia.

Cada archivo lleva en la cabecera su estado, versión, fecha y de qué verdad es propietario. Así
quien lo abre sabe si está leyendo un acuerdo o una nota de trabajo.

---

## 4. Identificadores

| Prefijo | Qué numera | Dónde vive |
|---|---|---|
| `FR-nn` | requisito funcional | 01 |
| `FL-nn` | flujo de usuario | 02 |
| `TR-nn` | requisito técnico medible | 03 |
| `DEC-nnn` | decisión | 12 |
| `UI-nn` | regla de interfaz | 06 §9 |
| `AC-nn` | caso de aceptación | 10 |

Los números no se reutilizan: un requisito retirado se marca "retirado" y conserva su número.

---

## 5. De dónde viene cada documento

| Contenido actual | Destino |
|---|---|
| `requisitos-hidrantes.html` §1–5 (objetivo, datos, operaciones, acceso, zona) | 01; los pasos, a 02 |
| `requisitos-hidrantes.html` §6 (capas y simbología) | 06; el requisito de funcionar sin cobertura, a 03 |
| `requisitos-hidrantes.html` §7 (pantallas del voluntario) | 07 |
| `requisitos-hidrantes.html` §8 (panel de jefatura) | 08; sus requisitos, a 01 |
| `requisitos-hidrantes.html` §9–10 (decisiones, próximos pasos) | 12 y 09 |
| `plan-implementacion-hidrantes.md` — decisiones cerradas | 12 |
| `plan-implementacion-hidrantes.md` — stack, principios, entornos, infraestructura compartida, secretos, marcha atrás | 04 |
| `plan-implementacion-hidrantes.md` — enums, tablas, vistas, RLS, RPC, *Pages Functions* | 05 |
| `plan-implementacion-hidrantes.md` — regla de simbología | 06 |
| `plan-implementacion-hidrantes.md` — fases, tareas, estimación, modelo de delegación | 09 |
| `plan-implementacion-hidrantes.md` — matriz de aceptación (Fase 9) | 10 |
| `plan-implementacion-hidrantes.md` — protección del código, privacidad, revisión de seguridad | 11 |
| `plan-implementacion-hidrantes.md` — continuidad, respaldo, emergencias | 15 |
| `plan-implementacion-hidrantes.md` — Fase 10 (diferido) | 16 |
| `plan-implementacion-hidrantes.md` — riesgos | 09; los de seguridad, referenciados desde 11 |

Cuando 07–16 estén escritos, los dos archivos de origen se mueven a `docs/archivo/` y se marcan
como sustituidos en su primera línea. No se borran: son la historia de cómo se llegó aquí.

---

## 6. Idioma

Todos los documentos van en **español**, incluidos los de construcción (03, 04, 05, 09). La razón es
la continuidad: no hay una segunda persona en el proyecto, y un sucesor de la agrupación leerá
español antes que neerlandés. Los identificadores de código, tablas, columnas, enums y la interfaz
también van en español, como en la app de uniformidad. Los comentarios de código, también.

Términos fijos, para no traducirlos de tres maneras:

| Término | Uso |
|---|---|
| **punto** | un hidrante o una boca de riego, genérico |
| **hidrante** / **boca de riego** | los dos tipos; nunca "hidrante" para ambos |
| **propuesta** | lo que envía un voluntario; es "pendiente", "aprobada", "rechazada" o "retirada por el autor" |
| **alta, revisión, actualizar estado, corregir datos, corregir ubicación, proponer retirada** | las seis operaciones, siempre con estos nombres |
| **caudal / estado** | la escala bueno · regular · malo · **no funciona** (nunca "defecto") |
| **retirado** / **borrado** | el punto ya no existe / el registro nunca debió existir (papelera) |
| **jefatura** / **administrador** | quien revisa y aprueba; en el sistema, un correo en `administradores` |
| **código de acceso** / **token de dispositivo** | lo que teclea el voluntario una vez / lo que guarda su móvil después |
| **zona de cobertura** | término municipal de Albolote más Calicasas, con margen de 400 m |
| **fuera de zona** | un punto que cae fuera de ella; se permite, se señala |

---

## 7. Ubicación en el repositorio

Repositorio de GitHub público (DEC-053) `hidrantes-albolote`, clonado en `C:\Proteccion civil\hidrantes-albolote`
(al lado del de la app de uniformidad, pero independiente: 04 §11.1, DEC-046). Esta documentación es
parte del repositorio y se versiona con él: un cambio en un documento va en su propio commit
(`docs(05): …`) y, si es congelado, con su entrada en 12.

```
docs/
  00-README.md
  01-requisitos-funcionales.md
  02-flujos-de-usuario.md
  03-requisitos-tecnicos.md
  04-arquitectura-e-infraestructura.md
  05-modelo-de-datos-y-api.md
  06-sistema-de-diseno.md
  06-sistema-de-diseno.html
  07-mockups-app.html
  08-mockups-panel.html
  09-plan-implementacion.md
  10-matriz-aceptacion.md
  11-seguridad-y-privacidad.md
  12-decisiones.md
  13-manual-jefatura.md
  14-manual-voluntario.md
  15-continuidad-y-emergencias.md
  16-alcance-y-hoja-de-ruta.md
  archivo/            # requisitos-hidrantes.html v6.1 y plan-implementacion-hidrantes.md v2.1
CLAUDE.md             # en la raíz del repositorio, no en docs/
```

Claude Code lee `CLAUDE.md` (raíz del repo; 09 §5) al empezar cada sesión y 01, 03, 04, 05 y 06 antes
de cada fase de 09; usa los skills de 04 §15. Jefatura valida sobre **staging**, al terminar la Fase
8, con 01, 02 y 10 en la mano (DEC-043); no antes.
