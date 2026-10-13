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
#   - src/, public/, functions/, workers/, supabase/migrations/, index.html o vite.config.ts;
#   - en package.json, las `dependencies` (no las de desarrollo ni la versión de una release);
#   - en package-lock.json, alguna entrada de `packages` sin `"dev": true` (cambiada, nueva o quitada);
#     de la entrada raíz, solo sus `dependencies`.
# Necesita el historial completo (checkout con fetch-depth: 0), git y node.

PRODUCCION_RUTAS=(src public functions workers supabase/migrations index.html vite.config.ts)

# Las dependencias que no son de desarrollo de un package.json o un package-lock.json, en JSON
# ordenado. Lee el archivo por la entrada; vacío o ilegible cuenta como «sin dependencias».
_deps_produccion() {
  node -e '
    const tipo = process.argv[1];
    let datos = {};
    try { datos = JSON.parse(require("fs").readFileSync(0, "utf8") || "{}"); } catch { datos = {}; }
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

# ¿Cambia el commit $1 las dependencias de producción del archivo $2 (tipo $3) respecto a su primer padre?
_cambia_deps() {
  local c=$1 archivo=$2 tipo=$3 antes despues
  antes=$(git show "$c^1:$archivo" 2>/dev/null | _deps_produccion "$tipo")
  despues=$(git show "$c:$archivo" 2>/dev/null | _deps_produccion "$tipo")
  [ "$antes" != "$despues" ]
}

produccion_atrasada() {
  local base=$1 cabeza=$2 c cambiados n=0 primero=''
  local commits cuenta
  # Si git falla (historial incompleto, rama que no existe), la función falla: quien la llama lo
  # cuenta como problema, en vez de dar «0» sin haber mirado.
  commits=$(git rev-list --reverse "$base..$cabeza") || return 1
  # Cada commit, comparado con su primer padre (develop se fusiona con squash: casi nunca hay merges).
  for c in $commits; do
    cambiados=$(git diff --name-only "$c^1" "$c") || return 1
    cuenta=false
    if [ -n "$(git diff --name-only "$c^1" "$c" -- "${PRODUCCION_RUTAS[@]}")" ]; then
      cuenta=true
    elif grep -qx 'package.json' <<< "$cambiados" && _cambia_deps "$c" package.json paquete; then
      cuenta=true
    elif grep -qx 'package-lock.json' <<< "$cambiados" && _cambia_deps "$c" package-lock.json lock; then
      cuenta=true
    fi
    if [ "$cuenta" = true ]; then
      n=$((n + 1))
      if [ -z "$primero" ]; then primero=$(git log -1 --format=%ct "$c"); fi
    fi
  done
  if [ "$n" -eq 0 ]; then echo 0; else echo "$n $primero"; fi
}
