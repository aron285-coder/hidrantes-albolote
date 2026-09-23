# Entornos creados por el arranque

Generado por `npm run arranque` el 2026-09-20. Sin secretos: los valores viven
en GitHub Environments y en Cloudflare Pages (04 §10).

| Entorno | Rama | Proyecto Supabase · ref | Bucket | URL |
|---|---|---|---|---|
| staging | `develop` | `uniformidad-dev` · `jowapbzawsebfpksnlqx` | `hidrantes-fotos-dev` | https://hidrantes-albolote-staging.pages.dev |
| production | `main` | `uniformidad-prod` · `cbgqirjqyltadpydpeyr` | `hidrantes-fotos` | https://hidrantes-albolote.pages.dev |

| Cosa | Valor |
|---|---|
| Repositorio | https://github.com/aron285-coder/hidrantes-albolote (público, DEC-053) |
| Cuenta de Cloudflare | `12c14cad67798806b9ba75017f3e2959` |
| Rol de migraciones | `hidrantes_migrador` por el pooler en modo sesión, puerto 5432 (DEC-052) |
| Huella GPG de respaldos | `BD378A1E0E09843032B3A70254A89DD4FC82E6CE` (regenerada el 20 sep 2026: la anterior usaba algoritmos que GnuPG no lee) |
| Secretos por environment | `SUPABASE_DB_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` (+ `GPG_PUBLIC_KEY` en production) |
| Variables por environment | `VITE_ENTORNO`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_VAPID_PUBLIC_KEY`, `PAGES_PROYECTO`, `SUPABASE_PROJECT_REF` |
| Secretos del repositorio | `SUPABASE_DB_URL_PROD`, `SUPABASE_SERVICE_ROLE_KEY_PROD`, `GPG_PUBLIC_KEY` (trabajos por calendario, DEC-071); `SUPABASE_DB_URL_STAGING`, `SUPABASE_SERVICE_ROLE_KEY_STAGING` (promover-piloto.yml, DEC-078); `VIGILANCIA_SECRETO_PROD`, `VIGILANCIA_SECRETO_STAGING` (avisos.yml, DEC-088; **pendiente**: `npm run arranque -- --rotar vigilancia`) |
| Variables del repositorio | `SUPABASE_URL_STAGING`, `SUPABASE_ANON_KEY_STAGING`, `SUPABASE_URL_PROD`, `SUPABASE_ANON_KEY_PROD` (mantener-activo.yml, DEC-054) |
| Variables cifradas de Pages | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SAL_IP`, `NOMINATIM_USER_AGENT`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `VIGILANCIA_SECRETO` (DEC-088) |

Rotar un secreto: `npm run arranque -- --rotar <db|cloudflare|sal-ip|vapid|gpg|todo>` (15).
