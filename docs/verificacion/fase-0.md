# Verificación · Fase 0 · Repositorio, entornos y despliegue

**Estado: en curso.** Lo local está construido y probado. Falta ejecutar `npm run arranque` (lo hace
el desarrollador, porque pide credenciales) y comprobar el despliegue real en staging y producción.
Este archivo se completa entonces (09 §7).

## 1. Qué se ha construido

- Repositorio Git en la carpeta existente; esqueleto Vite 8 + React 19 + TypeScript 6 + Tailwind 4
  (con los tokens de 06) + shadcn/ui (configuración); fuentes servidas localmente.
- `scripts/arranque.ts`, que crea el repositorio público, las protecciones, los environments,
  Supabase (rol `hidrantes_migrador`, esquema expuesto, Auth, bucket), Cloudflare Pages, GPG, VAPID,
  los secretos y las issues, y escribe `docs/entornos.md`. También hace `--local` y `--rotar`.
- `migrar.ts` (historial propio, hash, orden, una transacción por migración), `revertir.ts`,
  `crear-issues.ts`, `detectar-secretos.ts` (pre-commit), `guarda-produccion.ts`,
  `comprobar-despliegue.ts`, `presupuesto.ts`.
- CI (`ci-calidad`, `ci-sql`, `ci-e2e`), despliegues de staging y producción, Dependabot con fusión
  automática, release-please, `mantener-activo.yml`, plantillas de PR e issue y CODEOWNERS.
- `src/lib/textos.ts` con el Apéndice A completo, regla de ESLint (TR-111) y test contra el apéndice (TR-112).

## 2. Criterio de salida (copiado de 09)

> `npm run arranque` termina sin más pasos manuales que los tres pegados; un commit trivial en
> `develop` aparece solo en staging con banda naranja; un PR a `main`, tras aprobación, aparece solo
> en producción; un *push* directo a `main` es rechazado; el repositorio está clonado en
> `C:\Proteccion civil\hidrantes-albolote`; las cabeceras de TR-100 se sirven; las issues de las
> fases 1–9 existen con su milestone; `CLAUDE.md` está en la raíz. Verificado en ambos sentidos.

**Resultado:** pendiente del arranque real. Los "tres pegados" son ahora cuatro: se añade el token de
acceso de Supabase (DEC-055).

## 3. Comprobado en local (18 sep 2026)

| Qué | Cómo | Resultado |
|---|---|---|
| Typecheck, lint, formato | `npm run typecheck`, `npm run lint`, `npm run formato:comprobar` | ✅ |
| 254 tests unitarios | `npm test`: textos contra el Apéndice A (TR-112), migrar (hash, orden, borradas), detector de secretos, claves VAPID/GPG, parser de issues (85 tareas), guarda de producción, comprobación tras desplegar | ✅ |
| Presupuesto JS (TR-11) | `npm run build && npm run presupuesto`: 70 kB gzip de 300 | ✅ |
| Rol `hidrantes_migrador`, idempotente | `npm run migrar -- --local` dos veces seguidas contra `supabase start` | ✅ |
| pgTAP del arranque de BD | `npm run test:sql`: 7 comprobaciones (PostGIS, pg_cron, rol, propietario del esquema, nada en `public`) | ✅ |
| E2E del armazón | `PW_CANAL=msedge npm run e2e`: español, versión, banda de pruebas, noindex, fuentes propias sin terceros, manifiesto; móvil y escritorio | ✅ 8/8 |
| `_headers` y `robots.txt` por entorno | generados en `dist/` y comprobados por `comprobar-despliegue.test.ts` | ✅ |

## 4. Cómo reproducirlo

```
npm install
npx supabase start
npm run migrar -- --local
npm run typecheck && npm run lint && npm test
npm run test:sql
npm run build && npm run presupuesto
npm run e2e            # en Windows sin Chromium de Playwright: PW_CANAL=msedge npm run e2e
```

## 5. Suposiciones tomadas

- Repositorio público (DEC-053), proyectos de Supabase mantenidos activos (DEC-054) y los ajustes
  del arranque (DEC-055): token de Supabase, `GITHUB_DISPATCH_TOKEN` en la Fase 7, `VITE_*` en
  GitHub, release-please sobre `develop`, puertos locales 55420–55429, sin políticas de Storage, JWT por
  `request.jwt.claims`.
- Rol de migraciones propio (DEC-052).

## 6. Lo que queda abierto

- Ejecutar `npm run arranque` y comprobar el criterio de salida completo (desarrollador + Claude Code).
- Las tres últimas entradas del changelog en `config` (FR-167) necesitan la tabla `config`: Fase 2.
- La versión en Ajustes: cuando exista la pantalla (Fase 4/6); ya está en `<meta name="version">` y en `VERSION`.
- `wrangler pages dev` en la CI: cuando existan las Functions (Fase 3).
- Correo del propietario en `administradores` desde `arranque.ts`, no desde una migración (DEC-053): Fase 2.
- Iconos de la PWA con el escudo: Fase 4.
