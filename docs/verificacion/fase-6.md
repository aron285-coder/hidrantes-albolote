# Verificación · Fase 6 · Las seis operaciones

**Estado: terminada el 20 sep 2026.** El criterio de salida se cumple entero contra la pila local
real en CI (§2). Quedan pendientes, fuera del criterio, las fotos de referencia del racor (jefatura)
y una prueba en móvil real de la cámara y de los avisos push (§6).

## 1. Qué se ha construido

- Formularios de las seis operaciones con el motivo bajo el botón deshabilitado (UI-02), pin sobre el
  mapa con GPS, aviso de fuera de zona sin bloquear.
- Foto procesada en el móvil sin EXIF (≤ 1600 px); posición EXIF aparte.
- Cola en IndexedDB: url-subida → PUT → fn_proponer con `clave_local`; reintentos; errores visibles.
- Jefatura aplica al momento desde el móvil; Mis propuestas; aviso de resolución; "Algo no
  funciona"; avisos push; Ajustes completo. Decisiones en DEC-063.

## 2. Criterio de salida (copiado de 09)

> dar de alta tres puntos con foto en modo avión, recuperar cobertura y ver que llegan los tres, una
> sola vez cada uno; forzar un reenvío duplicado y comprobar que no crea una segunda propuesta; un
> administrador desde el móvil ve su cambio en el mapa sin pasar por la cola.

**Resultado:** cumplido. `e2e/integracion/fase6.spec.ts` en ci-sql, contra `wrangler pages dev` y
Supabase local:

| Parte | Cómo | Resultado |
|---|---|---|
| Tres altas con foto en modo avión llegan una vez cada una | Tres altas sin red; al volver, `count(*) = 3` en `propuestas` y tres `foto_path` distintas | ✅ |
| Reenvío duplicado no crea otra | Se reinyecta en la cola un envío ya hecho (misma `clave_local`); tras salir, sigue habiendo 3 | ✅ |
| Administrador desde el móvil sin cola | Usuario real de Supabase local en `administradores`; su alta queda `aprobada`, crea `BOC-####` activo y aparece en su búsqueda | ✅ |

## 3. Casos de 10 ejecutados

Operaciones, cola, Mis propuestas e incidencias cubiertos por `e2e/operaciones.spec.ts` (móvil y
escritorio) y por la integración de §2. TR-15 y TR-47 comprobados sobre la foto realmente subida
(sin bloque EXIF, 1600×1200, < 500 kB).

## 4. Cómo reproducirlo

```
npm test
PW_CANAL=msedge npm run e2e
npm run build && npm run functions:dev &
INTEGRACION=1 PW_CANAL=msedge npm run e2e
```

## 5. Suposiciones tomadas

DEC-063 (todo por la cola, reintentos, foto, firma de jefatura, racor sin fotos todavía, push).

## 6. Lo que queda abierto

- Fotos de referencia de los racores Granada, Barcelona y otro (las hace jefatura; van en
  `src/activos/racores/`).
- Probar en un móvil real la cámara (orientación de fotos de iPhone y Android) y un aviso push de
  punta a punta. **Ya se puede**: staging volvió a abrirse el 22 sep 2026 (DEC-061) y ese día se usó
  en un POCO M6 Pro, aunque la cámara y el push no entraron en esa sesión.
