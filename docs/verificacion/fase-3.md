# Verificación · Fase 3 · Funciones RPC y Pages Functions

**Estado: en curso** hasta comprobar la CI y el despliegue en staging (§6). Todo lo local está en verde.

## 1. Qué se ha construido

- `0005_rpc_voluntario`: helpers (errores, identidad de jefatura, registro, token) y las RPC de
  voluntario: canje del código, lista y ficha, reserva de foto, propuestas con idempotencia y
  duplicados, Mis propuestas, retirar, incidencias, push y errores del cliente.
- `0006_rpc_jefatura`: `fn_aplicar_propuesta` (núcleo de aprobar, lote y jefatura desde el móvil),
  rechazo, fusión, inventario, papelera con purga nocturna, código de acceso, administradores,
  parámetros, voluntarios, anonimización, salud, exportación y utilidades de las Functions.
- `0007_permisos_rpc`: funciones de `service_role` (fotos referenciadas, notificaciones) y todos los
  `execute`, empezando por revocarlo todo.
- Cinco Pages Functions (`functions/api/`) sin dependencias, con Web Push propio (RFC 8291/8292).
- 187 comprobaciones pgTAP (92 nuevas), 33 tests de Functions y la prueba de integración
  `scripts/probar-functions.ts` contra `wrangler pages dev` y Supabase local.

## 2. Criterio de salida (copiado de 09)

| Caso | Test | Resultado |
|---|---|---|
| Código erróneo rechazado | `05_rpc_voluntario`; `probar-functions` (401) | ✅ |
| 11 intentos bloqueados | `05_rpc_voluntario`: 10 fallos del mismo móvil y el 11.º se bloquea aunque sea el código bueno; 30 desde la misma IP con uuid nuevo cada vez | ✅ |
| `fn_verificar_codigo` desde `anon` → *permission denied* | `05_rpc_voluntario` (anon y authenticated); `02_permisos` (solo 9 RPC para anon) | ✅ |
| Token revocado rechazado | `05_rpc_voluntario` (y caducado a los 400 días) | ✅ |
| Reserva 41 del día rechazada | `05_rpc_voluntario`; en paralelo, `07_concurrencia_rpc` | ✅ |
| `foto_path` de otro dispositivo rechazado | `05_rpc_voluntario`: `FOTO_NO_RESERVADA` | ✅ |
| Alta → aprobación → punto visible con `direccion` | `06_rpc_jefatura` | ✅ |
| Aprobación con correcciones | `06_rpc_jefatura` (y el autor ve la corrección) | ✅ |
| `DIAMETRO_SIN_FIJAR` | `06_rpc_jefatura` | ✅ |
| Rechazo sin motivo rechazado | `06_rpc_jefatura` | ✅ |
| No-admin no aprueba | `06_rpc_jefatura`; `05_rpc_voluntario` (anon) | ✅ |
| Admin que llama a `fn_proponer` ve el cambio aplicado sin cola | `06_rpc_jefatura` | ✅ |
| `clave_local` repetida no duplica | `05_rpc_voluntario`; en paralelo, `07_concurrencia_rpc` | ✅ |
| Duplicado solo del mismo tipo | `05_rpc_voluntario` | ✅ |
| `fn_mis_propuestas` con otro token no devuelve nada ajeno | `05_rpc_voluntario` (y nunca trae quién decidió) | ✅ |
| `fn_cambiar_codigo_acceso(…, true)` revoca todos los tokens | `06_rpc_jefatura` | ✅ |
| `fn_aprobar_lote` con una desactualizada aprueba las demás | `06_rpc_jefatura` | ✅ |
| `/api/direccion` sin JWT → 403 | `api.test.ts` y `probar-functions` | ✅ |

## 3. Otras comprobaciones

| Qué | Cómo | Resultado |
|---|---|---|
| Dos `fn_aprobar` simultáneos: uno aprueba, otro `PROPUESTA_NO_PENDIENTE` (05 §11) | `07_concurrencia_rpc`, dos sesiones `dblink` reales | ✅ |
| Ninguna función ejecutable por `PUBLIC` | `02_permisos` (detectó un fallo real, DEC-059) | ✅ |
| El intento fallido queda anotado aunque se rechace | `05_rpc_voluntario` | ✅ |
| Tiempo mínimo de 800 ms en `/api/verificar-codigo` (TR-42) | `api.test.ts` y `probar-functions` | ✅ |
| URL firmada de subida funciona de verdad | `probar-functions`: `PUT` de un JPEG a Storage local | ✅ |
| Cifrado Web Push | vector del apéndice A de la RFC 8291, byte a byte; firma VAPID verificada | ✅ |
| Fusión, papelera y plazo, código fuera del registro, último administrador, lista blanca de parámetros | `06_rpc_jefatura` | ✅ |
| Tests independientes del seed de staging | ejecutados con y sin seed, y dos veces seguidas | ✅ |

## 4. Cómo reproducirlo

```
npx supabase start && npx supabase db reset --local
npm run arranque -- --local          # rol, migraciones, .env.local y .dev.vars
npm run cargar-zona -- --local
PGPASSWORD=migrador-local psql -h 127.0.0.1 -p 55422 -U hidrantes_migrador -d postgres -f supabase/seed-staging.sql  # detectar-secretos:permitir (Supabase local)
npm run test:sql && npm test
npm run build && npm run functions:dev   # en otra terminal
npm run probar-functions
```

## 5. Suposiciones tomadas

DEC-059 (corregido primero en 05 v1.4): privilegios por defecto globales; error de
`fn_verificar_codigo` en columna; identidad técnica de jefatura por su correo; código en claro solo
para administradores; sin código en el *summary* de producción; solape de 60 s en la sincronización;
Web Push propio con `VAPID_PUBLIC_KEY`; bucket por dominio; tipos propios para las Functions.

## 6. Lo que queda abierto

- Comprobar en CI y en staging tras el merge.
- `VAPID_PUBLIC_KEY` en Pages: `npm run arranque -- --rotar vapid` antes de la Fase 6.
- `GITHUB_DISPATCH_TOKEN` y los workflows con `repository_dispatch`: Fase 7.
- `storage_bytes` en Salud lo anotará el workflow de respaldo (Fase 8).
