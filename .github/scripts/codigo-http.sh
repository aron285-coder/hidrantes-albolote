# Código HTTP de una llamada con curl -w '%{http_code}' (docs/18 RV-38). Se carga con `source`.
#
# Si la red falla, curl escribe 000 y sale con error. Con `|| echo 000` quedaba 000000, que no casaba
# con la rama de reintento. Se llama así:
#
#   codigo=$(curl -s -w '%{http_code}' … || true)
#   codigo=$(codigo_http "$codigo")
#
# y queda siempre con tres cifras: las tres últimas, o 000 si no hubo salida.
codigo_http() {
  local c="${1:-}"
  c="${c:-000}"
  printf '%s' "${c: -3}"
}
