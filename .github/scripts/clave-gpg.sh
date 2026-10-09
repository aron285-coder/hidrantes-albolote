# La clave con la que se cifra el respaldo es la de docs/15 §2 (docs/32 RV-202). Se carga con `source`
# desde respaldo.yml.
#
# Antes el destinatario era la primera huella de lo que hubiera en el secreto GPG_PUBLIC_KEY, sin
# compararla con nada: si alguien cambiaba esa clave, todos los respaldos quedaban ilegibles para la
# clave privada que se guarda (15 §2) y todo seguía en verde. Ahora la huella esperada es la variable
# GPG_HUELLA, constante de respaldo.yml (docs/33 RV-341), y:
#
#   comprobar_clave HUELLA < CLAVE      antes de importar: la clave pública trae una sola clave
#                                       principal, y es la de HUELLA
#   comprobar_cifrado HUELLA ARCHIVO    después de cifrar: el archivo va para HUELLA o una de sus
#                                       subclaves, y para nada más (gpg --list-packets)
#
# Las dos escriben un ::error:: y devuelven 1 si no es así; el paso que las llama falla.

_huella_valida() {
  if ! [[ "$1" =~ ^[0-9A-F]{40}$ ]]; then
    echo "::error::GPG_HUELLA no es una huella de 40 cifras hexadecimales en mayúsculas (la constante de respaldo.yml; la de docs/15 §2)"
    return 1
  fi
}

comprobar_clave() {
  local huella="$1" primarias
  _huella_valida "$huella" || return 1
  # show-only: lista lo que se importaría sin tocar el llavero. La huella de cada clave principal es
  # la línea fpr que sigue a su pub (las de las subclaves siguen a sub).
  if ! primarias=$(gpg --batch --with-colons --import-options show-only --import 2>/dev/null \
    | awk -F: '/^pub:/ {p = 1; next} /^fpr:/ && p {print $10; p = 0}'); then
    echo "::error::GPG_PUBLIC_KEY no se puede leer como clave pública de GPG"
    return 1
  fi
  if [ -z "$primarias" ]; then
    echo "::error::GPG_PUBLIC_KEY no trae ninguna clave pública"
    return 1
  fi
  if [ "$primarias" != "$huella" ]; then
    echo "::error::GPG_PUBLIC_KEY no es la clave del respaldo: trae $(printf '%s' "$primarias" | tr '\n' ' ')y se esperaba solo $huella (GPG_HUELLA, docs/15 §2). Con otra clave, el respaldo no se podría descifrar."
    return 1
  fi
}

comprobar_cifrado() {
  local huella="$1" archivo="$2" validas usadas id
  _huella_valida "$huella" || return 1
  # Los keyid (las 16 últimas cifras de la huella) de la clave y de sus subclaves, del llavero.
  validas=$(gpg --batch --with-colons --list-keys "$huella" 2>/dev/null | awk -F: '/^fpr:/ {print substr($10, 25)}')
  if [ -z "$validas" ]; then
    echo "::error::La clave $huella no está en el llavero: no se puede comprobar para quién va $archivo"
    return 1
  fi
  # Sin la clave privada, --list-packets termina con error después de listar los paquetes: se mira lo
  # que ha listado.
  usadas=$({ gpg --batch --list-packets "$archivo" 2>/dev/null || true; } \
    | sed -nE 's/^:pubkey enc packet:.* keyid ([0-9A-Fa-f]{16}).*$/\1/p' | tr 'a-f' 'A-F')
  if [ -z "$usadas" ]; then
    echo "::error::$archivo no está cifrado para ninguna clave pública"
    return 1
  fi
  for id in $usadas; do
    if ! printf '%s\n' "$validas" | grep -qx "$id"; then
      echo "::error::$archivo está cifrado para la clave $id, que no es la del respaldo ($huella, docs/15 §2)"
      return 1
    fi
  done
}
