# Entornos creados por el arranque

Generado por `npm run arranque` el 2026-09-23. Sin secretos: los valores viven
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
| Variables del repositorio | `SUPABASE_URL_STAGING`, `SUPABASE_ANON_KEY_STAGING`, `SUPABASE_URL_PROD`, `SUPABASE_ANON_KEY_PROD` (mantener-activo.yml, DEC-054) |
| Environment `prod-tareas` (sin revisores, solo `develop`) | `SUPABASE_DB_URL_PROD`, `SUPABASE_SERVICE_ROLE_KEY_PROD`, `VIGILANCIA_SECRETO_PROD`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`: las tareas de producción que no pueden esperar una aprobación (respaldo, purga de fotos, vigilancia, avisos a mano, comprobar-produccion; DEC-071, docs/31 RV-131, DEC-172) |
| Secretos del repositorio | `SUPABASE_DB_URL_STAGING`, `SUPABASE_SERVICE_ROLE_KEY_STAGING` (promoción del piloto, DEC-078), `GPG_PUBLIC_KEY` (pública: cifra el respaldo, DEC-071), `VIGILANCIA_SECRETO_STAGING` (DEC-088), `PROPIETARIO_EMAIL` (DEC-053). Ninguno de producción: cualquier rama los podría leer (DEC-172) |
| Secretos del Worker `hidrantes-avisos` | `VIGILANCIA_SECRETO_{STAGING,PROD}`, con los mismos valores que Pages y GitHub (docs/19 RV-52, DEC-097) |
| Variables cifradas de Pages | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SAL_IP`, `NOMINATIM_USER_AGENT`, `VAPID_PRIVATE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT`, `VIGILANCIA_SECRETO` (DEC-088) |

El token de Cloudflare (`CLOUDFLARE_API_TOKEN`) es uno para toda la cuenta: el permiso **Cloudflare Pages: Edit** es de cuenta y no se puede limitar a un proyecto ([Cloudflare, permisos de los tokens de API](https://developers.cloudflare.com/fundamentals/api/reference/permissions/), comprobado el 7 oct 2026). Con el que despliega staging se podría desplegar producción. Separarlo exigiría otra cuenta de Cloudflare; en su lugar, la vigilancia compara cada despliegue de producción con las ejecuciones de `deploy-prod.yml` y abre la issue «Despliegue de producción no autorizado» si alguno no corresponde (docs/31 RV-130, `.github/scripts/despliegues-ajenos.sh`). Revertir solo es `config.revertir_despliegue_ajeno`, apagada si no existe. Los dos proyectos de Pages tienen la variable `ENTORNO` (`staging` | `produccion`), que ponen los `deploy-*.yml` antes de desplegar.

Rotar un secreto: `npm run arranque -- --rotar <db|cloudflare|sal-ip|vapid|gpg|vigilancia|todo>` (15).

Pages aplica sus secretos solo a los despliegues nuevos: tras rotar uno, el arranque vuelve a desplegar
staging (`gh workflow run "Desplegar staging" --ref develop`); producción lo aplica en su siguiente
despliegue, el PR `develop → main` (15 §2, docs/18 RV-38).

## Trabajos que pide el panel (docs/31 RV-137 y RV-146, DEC-172)

El panel ya no lanza workflows con un token de GitHub, y ningún proyecto de Pages guarda `GITHUB_DISPATCH_TOKEN`. Un botón de Ajustes deja un **pedido** en la base de datos (`fn_pedir_trabajo`), y `despachador.yml` (environment `prod-tareas`, cada 15 minutos) lo lanza con su propio `GITHUB_TOKEN` (`scripts/despachar.ts`).

| Botón de Ajustes | Pedido | Workflow que se lanza (desde `develop`) |
|---|---|---|
| Purgar fotos huérfanas | `purgar-fotos` | `purgar-fotos.yml` |
| Respaldo ahora | `respaldo` | `respaldo.yml` |
| Regenerar zona de cobertura | `regenerar-zona` | `mantenimiento.yml` con `trabajo: regenerar-zona` |
| Regenerar mapa base | `regenerar-mapabase` | `mantenimiento.yml` con `trabajo: regenerar-mapabase` |

- **Tarda hasta 15 minutos en empezar** (algo más si GitHub retrasa el cron). Para no esperar: `gh workflow run despachador.yml --ref develop`.
- **Solo en producción.** El despachador lee los pedidos de la base de datos de producción. En staging, «Purgar fotos» y «Respaldo» responden `SOLO_EN_PRODUCCION`, y los demás se anotan en la base de datos de staging, que nadie despacha: **desde staging no se lanza nada de producción**.
- Cada pedido se marca con `lanzado` o `error: …` (`fn_marcar_pedido`). Uno con error no se reintenta: se vuelve a pedir, y abre la issue «Un trabajo pedido desde el panel no se ha lanzado», que se cierra a mano. Si el despachador no puede leer o anotar los pedidos, abre «El despachador de trabajos ha fallado», que se cierra sola cuando vuelve a ir bien (15 §4).
- Sin `npm ci`: el despachador solo usa módulos de Node, así que ninguna dependencia de npm corre con la clave de servicio de producción.
