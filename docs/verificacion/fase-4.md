# Verificación · Fase 4 · Acceso y armazón del frontend

**Estado: terminada el 19 sep 2026; probada en un Android real el 22 sep 2026.** Ese día staging
volvió a abrirse sin VPN (DEC-061) y el desarrollador la usó en un **POCO M6 Pro (Android 15,
`AP3A.240905.015.A2`)**: el mapa se maneja con soltura y de esa sesión salieron tres correcciones
(DEC-075 a DEC-077). Queda el **iPhone**, y dejar constancia de la instalación como PWA en los dos.

## 1. Qué se ha construido

- Entrada con código y nombre, sesión local sin guardar el código, bloqueo por intentos, token
  rechazado → código otra vez conservando el nombre; Google para jefatura con "No autorizado" y `/admin`.
- Armazón Mapa · Lista · Ajustes; Ajustes con lo que ya funciona; tres pantallas de primer uso; aviso legal.
- PWA instalable (iconos del escudo, metadatos de iOS, precache, aviso de versión nueva).
- Degradación controlada con reintento exponencial; cola de errores a `fn_registrar_error`; límites
  de error por pantalla. Decisiones en DEC-060.

## 2. Criterio de salida (copiado de 09)

> instalable en un Android real y un iPhone real, con icono y a pantalla completa; un error provocado
> aparece en `errores_cliente`; un correo no autorizado ve "No autorizado".

**Resultado:** cumplido en parte.

| Parte | Cómo | Resultado |
|---|---|---|
| Error provocado en `errores_cliente` | `e2e/integracion/fase4.spec.ts` en ci-sql: `wrangler pages dev` + Supabase local, código 000000, fallo forzado en `/lista`, consulta a la tabla | ✅ |
| Correo no autorizado ve "No autorizado" | e2e con sesión de Google simulada y `fn_es_admin = false` | ✅ automático · ⏳ con Google real en staging |
| Instalable en Android y iPhone reales | e2e: manifiesto con iconos 192/512/maskable, `apple-touch-icon`, Service Worker activo y arranque sin red | ✅ automático · ✅ usada en Android real (POCO M6 Pro, 22 sep 2026) · ⏳ iPhone |

## 3. Casos de 10 ejecutados

| Caso | Cómo se comprobó | Resultado |
|---|---|---|
| AC-01 | e2e: entrada → tres pantallas → mapa; al recargar no pide nada; integración contra la pila real | ✅ |
| AC-02 | e2e: 401 → "Código incorrecto", casillas vacías, nombre conservado | ✅ |
| AC-03 | e2e: 429 → mensaje y entrada bloqueada tras recargar; el límite 10/30/200 ya lo prueba pgTAP (Fase 3) | ✅ |
| AC-04 | e2e: sin apellido no llama al servidor e indica el campo | ✅ |
| AC-05 | e2e: cambiar firma en Ajustes. Que las propuestas lleven el nombre nuevo se prueba en la Fase 6 | ✅ parcial |
| AC-06 | e2e simulado: etiqueta Jefatura y `/admin` | ✅ simulado · ⏳ real |
| AC-07 | e2e simulado | ✅ simulado · ⏳ real |
| AC-10 | Aviso implementado (`registerType: prompt`, comprobación horaria); falta ver dos despliegues seguidos en un móvil | ⏳ |
| AC-28 | e2e: modo oscuro fijado y persistente; revisión visual en claro y oscuro (se corrigió el contraste) | ✅ interfaz · mapa base en la Fase 5 |
| AC-64 | e2e: confirmación con el efecto escrito. El aviso de envíos pendientes llega con la cola (Fase 6) | ✅ parcial |
| AC-65 | e2e: Ajustes → Cómo se usa | ✅ |
| AC-111 | e2e y unitario: en el almacenamiento solo token, firma, `dispositivo_id`; nunca el código | ✅ |
| AC-128 | e2e: Supabase bloqueado → aviso, la app sigue y reintenta; al volver, desaparece | ✅ |
| AC-145 | e2e: sin servidor → texto en español sin códigos | ✅ parcial (los otros dos casos, Fase 6) |

## 4. Cómo reproducirlo

```
npm test
PW_CANAL=msedge npm run e2e
# integración (con Supabase local, migraciones y seed-staging cargados):
npm run build && npm run functions:dev &
INTEGRACION=1 PW_CANAL=msedge npm run e2e
```

## 5. Suposiciones tomadas

DEC-060 (sesión, jefatura, Ajustes sin lo que aún no existe, Service Worker en modo aviso, iconos) y
DEC-061 (bloqueos de LaLiga).

## 6. Lo que queda abierto

- Prueba en un Android y un iPhone reales: instalar, icono, pantalla completa, código 000000.
- Google real en staging: con la cuenta del propietario (Jefatura) y con otra ("No autorizado").
- AC-10 en un móvil: ver el aviso tras el siguiente despliegue.
