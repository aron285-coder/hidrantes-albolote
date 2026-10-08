# docs/32 RV-207: instalar los navegadores de Playwright sin que el paso se cuelgue. Se carga con
# `source` desde .github/actions/navegadores.
#
#   con_reintento <segundos> <orden…>
#
# Cada intento tiene un tope (`timeout`, y KILL 15 s después si no se para); si falla o se pasa, se
# reintenta una vez. Dos intentos de 225 s caben en los 8 minutos del paso (timeout-minutes: 8 en
# ci.yml), y un paso colgado no se come los 90 minutos que `npm run publicar` espera a la CI.
con_reintento() {
  local tope="$1"
  shift
  local intento
  for intento in 1 2; do
    if timeout -k 15 "$tope" "$@"; then
      return 0
    fi
    echo "::warning::$* falló o pasó de ${tope} s (intento $intento de 2)"
  done
  echo "::error::No se han podido instalar los navegadores de Playwright: $*"
  return 1
}
