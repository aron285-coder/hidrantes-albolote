# ¿Es el build de este entorno? (docs/35 RV-410, DEC-198). El trabajo «construir» no tiene environment
# y construye con las variables públicas del repositorio; el que despliega sí lo tiene, y comprueba
# aquí que dist lleva los valores de su environment. Si no, el despliegue serviría una app que habla
# con otro proyecto. Los valores son públicos (van dentro del bundle), pero no se imprimen.
#
#   build_del_entorno DIR NOMBRE...   cada NOMBRE es una variable de entorno que tiene que aparecer en
#                                     DIR; con ? delante (?VITE_MAPABASE_URL) es opcional: si está
#                                     vacía en el environment no se mira
build_del_entorno() {
  local dir="$1" nombre valor opcional fallos=0
  shift
  if [ ! -d "$dir" ]; then
    echo "::error::No está el build ($dir)"
    return 1
  fi
  for nombre in "$@"; do
    opcional=0
    if [ "${nombre#\?}" != "$nombre" ]; then
      opcional=1
      nombre="${nombre#\?}"
    fi
    valor="${!nombre:-}"
    if [ -z "$valor" ] && [ "$opcional" = 1 ]; then
      echo "$nombre: vacía en el environment (opcional)"
    elif [ -z "$valor" ]; then
      echo "::error::Falta la variable $nombre en el environment: npm run arranque -- --solo-faltantes"
      fallos=1
    elif ! grep -rqF -- "$valor" "$dir"; then
      echo "::error::El build no lleva el $nombre de este environment: construir usa las variables del repositorio (con sufijo _STAGING o _PROD), y tienen que ser las mismas que las del environment (docs/04 §11.2)"
      fallos=1
    else
      echo "$nombre: el del environment"
    fi
  done
  return "$fallos"
}
