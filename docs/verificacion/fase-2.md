# Verificación · Fase 2 · Esquema de base de datos

**Estado: terminada el 18 sep 2026.** Criterio de salida cumplido (§2) y comprobado en staging (§3).

## 1. Qué se ha construido

- Migraciones `0001_esquema` (enums, secuencias, 15 tablas con sus constraints e índices, triggers de
  `actualizado_en` y de `registro` inmutable, `fn_siguiente_codigo`), `0002_vistas` (`fn_es_admin`,
  `fn_config`, `fn_radio_px`, `fn_municipio_de` y las cuatro vistas `security_invoker`),
  `0003_permisos` (RLS en todas las tablas, lectura solo para administradores, sin escritura directa)
  y `0004_config_y_tareas` (12 valores de `config` y cuatro tareas de `pg_cron`).
- `supabase/seed-staging.sql`: 12 puntos `[PRUEBA]` con las 12 combinaciones, 6 propuestas (una por
  operación, con duplicado y desactualizada), código `000000`, dos administradores de prueba.
- `scripts/asegurar-propietario.ts`: el propietario como administrador desde el secreto `PROPIETARIO_EMAIL`.
- 95 comprobaciones pgTAP en cinco archivos; la CI aplica además la zona y el seed dos veces.

## 2. Criterio de salida (copiado de 09)

> pgTAP en verde para: constraints de diámetro y racor por tipo; `no_funciona` sin descripción
> rechazado; punto sin foto rechazado; `insert` en Storage con `anon` rechazado; `registro` sin
> `update`/`delete`; dos altas concurrentes obtienen códigos distintos; cada vista devuelve filas con el
> rol previsto.

| Parte | Test | Resultado |
|---|---|---|
| Diámetro y racor por tipo | `01_esquema`: boca ≠ 45, hidrante 45, hidrante con racor, boca sin racor | ✅ |
| `no_funciona` sin descripción | `01_esquema`: con `NULL` y con blancos | ✅ |
| Punto sin foto | `01_esquema`: `NULL` y cadena vacía | ✅ |
| Storage con `anon` | `02_permisos`: `insert` en `storage.objects` como `anon` y como `authenticated` → 42501 | ✅ |
| `registro` sin `update`/`delete` | `01_esquema` (update, delete, truncate) y `02_permisos` (`service_role`) | ✅ |
| Dos altas concurrentes | `04_concurrencia_y_tareas`: dos sesiones `dblink` con transacción abierta → códigos distintos | ✅ |
| Cada vista con el rol previsto | `02_permisos`: `anon` → *permission denied*; `authenticated` no administrador o desactivado → vacío; administrador → filas en las cuatro vistas | ✅ |

## 3. Otras comprobaciones

| Qué | Cómo | Resultado |
|---|---|---|
| Radios de las 12 combinaciones (06 §4.2) y lectura de `config` | `03_vistas` | ✅ |
| Municipio, núcleo, margen de 400 m y "diseminado" (DEC-057) | `03_vistas` con dos términos de prueba | ✅ |
| Señales de la cola: antes/después, desactualizada, otra medida, fuera de zona, duplicado | `03_vistas` | ✅ |
| Anonimización: solo `actor`, solo con la marca | `01_esquema` | ✅ |
| Ninguna política de escritura; `anon` y `PUBLIC` sin privilegios; vistas `security_invoker` | `02_permisos` | ✅ |
| Seed idempotente y coherente con las vistas | aplicado dos veces en local; radios y núcleos deducidos iguales a los escritos | ✅ |
| `migrar.ts` detecta una migración aplicada que cambia | ocurrió de verdad en local al corregir 0001 | ✅ |
| Staging: despliegue completo | `deploy-staging.yml` tras el PR #98: 0001–0004 aplicadas por `hidrantes_migrador`, propietario dado de alta, zona cargada (2 términos, 10 núcleos), seed, cabeceras | ✅ |
| Staging: `anon` sin acceso por la API | `curl` a `/rest/v1/` con la anon key y `Accept-Profile: hidrantes`: `puntos`, `v_puntos_activos`, `propuestas`, `registro`, `config` y `rpc/fn_siguiente_codigo` → 42501 | ✅ |
| Staging: la API de uniformidad sigue respondiendo | `GET /rest/v1/` → 200 | ✅ |

## 4. Cómo reproducirlo

```
npx supabase start
npx supabase db reset --local
npm run migrar -- --local && npm run cargar-zona -- --local
npm run test:sql
```

## 5. Suposiciones tomadas

DEC-058 (corregido primero en 05 v1.3): `coalesce` en las constraints de texto obligatorio;
`foto_path` en lugar de `foto_url` en la vista; `search_path` con `extensions`; `execute` de los
helpers para `authenticated`; excepción de anonimización en `registro`; propietario por secreto;
papelera en la Fase 3; seed con códigos 9xxx; bcrypt para el código.

## 6. Lo que queda abierto

- RPC, Pages Functions y la tarea de la papelera: Fase 3.
