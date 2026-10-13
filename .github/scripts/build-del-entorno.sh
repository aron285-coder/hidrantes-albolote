# ¿Es el build de este entorno? (docs/35 RV-410, DEC-198). El trabajo «construir» no tiene environment
# y construye con las variables públicas del repositorio; el que despliega sí lo tiene, y comprueba
# aquí que dist lleva los valores de su environment. Si no, el despliegue serviría una app que habla
# con otro proyecto. Los valores son públicos (van dentro del bundle), pero no se imprimen.
#
#   build_del_entorno DIR NOMBRE...   cada NOMBRE es una variable de entorno que tiene que aparecer en DIR
build_del_entorno() {
  local dir="$1" nombre valor fallos=0
  shift
  if [ ! -d "$dir" ]; then
    echo "::error::No está el build ($dir)"
    return 1
  fi
  for nombre in "$@"; do
    valor="${!nombre:-}"
    if [ -z "$valor" ]; then
      echo "::error::Falta la variable $nombre en el environment: npm run arranque -- --solo-faltantes"
      fallos=1
    elif ! grep -rqF -- "$valor" "$dir"; then
      echo "::error::El build no lleva el $nombre de este environment: construir y desplegar no usan las mismas variables (las del repositorio las pone npm run arranque)"
      fallos=1
    else
      echo "$nombre: el del environment"
    fi
  done
  return "$fallos"
}
