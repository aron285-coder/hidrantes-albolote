# Verificación · Fase 0 · Repositorio, entornos y despliegue

**Estado: terminada el 18 sep 2026.** Criterio de salida cumplido (§2).

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

**Resultado: cumplido.**

| Parte del criterio | Cómo se comprobó | Resultado |
|---|---|---|
| `npm run arranque` sin más pasos manuales que lo pegado | Ejecutado por el desarrollador. Los "tres pegados" son cuatro: token de Supabase (DEC-055). Dos fallos corregidos por el camino: teclas repetidas tras las preguntas ocultas y la caché de credenciales del pooler | ✅ |
| Merge en `develop` → solo staging, con banda naranja | PR #86: `deploy-staging.yml` en verde; captura de `hidrantes-albolote-staging.pages.dev` con "ENTORNO DE PRUEBAS" | ✅ |
| PR a `main` tras aprobación → solo producción | PR #93 (DEC-056): `deploy-prod.yml` esperó a la aprobación del propietario, pasó la guarda y desplegó; producción sin banda, `Allow: /` y sin `X-Robots-Tag`; staging siguió con la banda | ✅ |
| *Push* directo a `main` rechazado | Protección leída por la API: PR obligatorio, `ci-calidad`/`ci-sql`/`ci-e2e` obligatorios, `enforce_admins`, sin *force push* ni borrado; igual en `develop`. No se intentó un *push* real | ✅ (configuración) |
| Repositorio en `C:\Proteccion civil\hidrantes-albolote` | `git remote -v` → `aron285-coder/hidrantes-albolote` | ✅ |
| Cabeceras de TR-100 | `comprobar-despliegue.ts` en ambos despliegues y `curl -I` manual: CSP sin `unsafe-eval`, HSTS, `nosniff`, `Referrer-Policy`, `Permissions-Policy` | ✅ |
| Issues de las fases 1–9 con milestone | 85 issues creadas, etiquetas `fase-N` y milestones "Fase N" | ✅ |
| `CLAUDE.md` en la raíz | en `main` y `develop` | ✅ |

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

- Los skills los instaló `npx skills` para el usuario (`~\.agents\skills`, enlazados a Claude Code), no en
  `.claude/skills/` del repositorio; funcionan igual. `cloudflare`, `webapp-testing` y `frontend-design`
  no aparecen en la instalación: se revisa al necesitarlos (Fases 3–5).
- Dependabot abrió cinco PR de versión mayor que esperan revisión (TR-101). TypeScript 7 rompe
  `typescript-eslint` (admite < 6.1): no se fusiona hasta que lo soporte.
- El primer release de release-please arranca en 0.1.0 (`initial-version`), no en 1.0.0.
- Las tres últimas entradas del changelog en `config` (FR-167) necesitan la tabla `config`: Fase 2.
- La versión en Ajustes: cuando exista la pantalla (Fase 4/6); ya está en `<meta name="version">` y en `VERSION`.
- `wrangler pages dev` en la CI: cuando existan las Functions (Fase 3).
- Correo del propietario en `administradores` desde `arranque.ts`, no desde una migración (DEC-053): Fase 2.
- Iconos de la PWA con el escudo: Fase 4.
