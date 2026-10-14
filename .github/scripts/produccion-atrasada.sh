# ¿Va producción atrasada en algo que corre en producción? (docs/35 RV-412, DEC-202; antes docs/19
# P-03, DEC-096). Se carga con `source` desde el trabajo «mirar» de vigilancia.yml.
#
#   produccion_atrasada BASE CABEZA
#
# Escribe «0» si ningún commit de BASE..CABEZA cambia lo que corre en producción, o «N FECHA»: cuántos
# lo cambian y la fecha (época, en segundos) del más antiguo de ellos. Antes contaba cualquier commit
# fuera de docs/, y cada fusión de Dependabot ponía la vigilancia en rojo a los 7 días.
#
# Cuenta un commit si cambia:
#   - una de las rutas de PRODUCCION_RUTAS (abajo, cada una con su porqué);
#   - en package.json, las `dependencies` (no las de desarrollo ni la versión de una release);
#   - en package-lock.json, alguna entrada de `packages` sin `"dev": true` (cambiada, nueva o quitada);
#     de la entrada raíz, solo sus `dependencies`.
# Necesita el historial completo (checkout con fetch-depth: 0), git y node.

# Lo que llega a producción con `npm run publicar` (docs/36 RV-462):
#   src, public, index.html, vite.config.ts   el build que se sirve;
#   config                 lo importa vite.config.ts: _headers, la CSP y las cachés del SW;
#   functions              las Pages Functions;
#   supabase/migrations    las migraciones que aplica deploy-prod.yml;
#   datos                  la zona, los núcleos y las versiones que deploy-prod.yml carga en la base;
#   CHANGELOG.md           las Novedades van dentro del bundle.
# workers/ no está: el Worker de los avisos se despliega desde develop con cada despliegue de staging
# (deploy-staging.yml), así que producción no tiene nada pendiente por él.
PRODUCCION_RUTAS=(src public index.html vite.config.ts config functions supabase/migrations datos CHANGELOG.md)

# Las dependencias que no son de desarrollo de un package.json o un package-lock.json, en JSON
# ordenado. Lee el archivo por la entrada; vacío cuenta como «sin dependencias», y uno que no es JSON
# hace fallar la función: no se da por mirado lo que no se ha podido leer.
_deps_produccion() {
  node -e '
    const tipo = process.argv[1];
    const datos = JSON.parse(require("fs").readFileSync(0, "utf8").trim() || "{}") || {};
    const ordenar = (v) =>
      Array.isArray(v) ? v.map(ordenar)
      : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, ordenar(v[k])]))
      : v;
    let r;
    if (tipo === "paquete") {
      r = datos.dependencies || {};
    } else {
      r = {};
      for (const [k, v] of Object.entries(datos.packages || {})) {
        if (k === "") r[""] = (v && v.dependencies) || {};
        else if (!(v && v.dev === true)) r[k] = v;
      }
    }
    process.stdout.write(JSON.stringify(ordenar(r)));
  ' "$1"
}

# Las dependencias de producción del archivo $2 (tipo $3) en el commit $1. Un archivo que no existe en
# ese commit no tiene ninguna. Falla si git o node fallan.
_deps_en() {
  local c=$1 archivo=$2 tipo=$3 contenido=''
  if git cat-file -e "$c:$archivo" 2>/dev/null; then
    contenido=$(git show "$c:$archivo") || return 1
  fi
  printf '%s' "$contenido" | _deps_produccion "$tipo"
}

# ¿Cambia el commit $1 las dependencias de producción del archivo $2 (tipo $3) respecto a su primer
# padre? 0 si cambian, 1 si no, 2 si no se ha podido saber.
_cambia_deps() {
  local c=$1 archivo=$2 tipo=$3 antes despues
  antes=$(_deps_en "$c^1" "$archivo" "$tipo") || return 2
  despues=$(_deps_en "$c" "$archivo" "$tipo") || return 2
  [ "$antes" != "$despues" ]
}

produccion_atrasada() {
  local base=$1 cabeza=$2 c cambiados n=0 primero=''
  local commits cuenta rutas par archivo tipo
  # Si git falla (historial incompleto, rama que no existe), la función falla: quien la llama lo
  # cuenta como problema, en vez de dar «0» sin haber mirado.
  commits=$(git rev-list --reverse "$base..$cabeza") || return 1
  # Cada commit, comparado con su primer padre (develop se fusiona con squash: casi nunca hay merges).
  for c in $commits; do
    cambiados=$(git diff --name-only "$c^1" "$c") || return 1
    cuenta=false
    rutas=$(git diff --name-only "$c^1" "$c" -- "${PRODUCCION_RUTAS[@]}") || return 1
    if [ -n "$rutas" ]; then
      cuenta=true
    else
      for par in 'package.json paquete' 'package-lock.json lock'; do
        read -r archivo tipo <<< "$par"
        if [ "$cuenta" = false ] && grep -qx "$archivo" <<< "$cambiados"; then
          # En un if, para que bash -e (el de Actions) no corte en el «1» de «no cambian».
          if _cambia_deps "$c" "$archivo" "$tipo"; then
            cuenta=true
          elif [ $? -ne 1 ]; then
            return 1
          fi
        fi
      done
    fi
    if [ "$cuenta" = true ]; then
      n=$((n + 1))
      if [ -z "$primero" ]; then primero=$(git log -1 --format=%ct "$c"); fi
    fi
  done
  if [ "$n" -eq 0 ]; then echo 0; else echo "$n $primero"; fi
}
