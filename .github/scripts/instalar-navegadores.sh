# docs/32 RV-207: instalar los navegadores de Playwright sin que el paso se cuelgue. Se carga con
# `source` desde .github/actions/navegadores.
#
#   con_reintento <segundos> <orden…>
#
# Cada intento tiene un tope (`timeout`, y KILL 15 s después si no se para); si falla o se pasa, se
# reintenta una vez. Con 200 s, lo peor son 2 × (200 + 15) = 430 s: caben en los 9 minutos del paso, con los 30 s de liberar apt,
# (timeout-minutes: 9 en ci.yml y deploy-staging.yml) con margen para la caché y para que el
# ::error:: final llegue a escribirse. Un paso colgado no se come los 90 minutos que
# `npm run publicar` espera a la CI.
# Si el primer intento se corta por el tope, `timeout` mata npx pero el apt-get que lanzó sigue vivo
# y se queda con el cerrojo de dpkg: el segundo intento fallaba con «Could not get lock
# /var/lib/dpkg/lock-frontend» (run 37893324608). Antes de repetir se para ese apt y se deja dpkg en
# orden. Solo en un runner con apt y sudo; en otro sitio no hace nada.
liberar_apt() {
  command -v apt-get >/dev/null 2>&1 && command -v sudo >/dev/null 2>&1 || return 0
  sudo pkill -x apt-get 2>/dev/null || true
  sudo pkill -x dpkg 2>/dev/null || true
  local s
  for s in $(seq 1 30); do
    pgrep -x apt-get >/dev/null 2>&1 || pgrep -x dpkg >/dev/null 2>&1 || break
    sleep 1
  done
  sudo dpkg --configure -a >/dev/null 2>&1 || true
}

con_reintento() {
  local tope="$1"
  shift
  local intento
  for intento in 1 2; do
    if timeout -k 15 "$tope" "$@"; then
      return 0
    fi
    echo "::warning::$* falló o pasó de ${tope} s (intento $intento de 2)"
    [ "$intento" = 1 ] && liberar_apt
  done
  echo "::error::No se han podido instalar los navegadores de Playwright: $*"
  return 1
}
