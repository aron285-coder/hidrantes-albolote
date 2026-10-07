# ¿Tiene `main` algo que la rama que se quiere llevar a `main` no tenga en su historia? (docs/31
# RV-135, DEC-096). Se carga con `source`.
#
#   main_en_la_rama "$CABEZA"     # el sha de la cabeza del PR, no HEAD
#
# En un PR, HEAD es el merge de prueba que hace GitHub y siempre tiene `origin/main` como padre: hay
# que mirar la cabeza de la rama.
#
# Con merge commit (DEC-096), la punta de `main` no es ancestro de `develop`, pero su árbol es el de
# su padre de `develop`, que sí lo es: el árbol del merge-base es el de `main`. Con squash (#296,
# #438), el merge-base se queda en la release anterior y los árboles difieren: el PR chocará en
# CHANGELOG.md y package.json.
#
# Sale con 0 si se puede fusionar, 1 si main tiene cambios fuera de la rama (con el arreglo), y 2 si
# no se ha podido comprobar (git falló): nunca da por bueno lo que no ha mirado.
main_en_la_rama() {
  local cabeza="$1" base rc
  if [ -z "$cabeza" ]; then
    echo "::error::main_en_la_rama: falta el sha de la cabeza del PR"
    return 2
  fi
  if ! git rev-parse -q --verify "origin/main^{commit}" >/dev/null; then
    echo "::error::No encuentro origin/main: ¿falta fetch-depth: 0?"
    return 2
  fi
  if ! git rev-parse -q --verify "$cabeza^{commit}" >/dev/null; then
    echo "::error::No encuentro la cabeza del PR ($cabeza) en el clon: ¿falta fetch-depth: 0?"
    return 2
  fi
  rc=0
  base=$(git merge-base origin/main "$cabeza") || rc=$?
  if [ "$rc" -eq 1 ]; then
    echo "::error::main y la rama no comparten historia."
    return 1
  elif [ "$rc" -ne 0 ]; then
    echo "::error::git merge-base falló con $rc: no se ha podido comprobar."
    return 2
  fi
  rc=0
  git diff --quiet "$base" origin/main || rc=$?
  if [ "$rc" -eq 0 ]; then
    echo "main no tiene nada que la rama no tenga: se puede fusionar con merge commit."
    return 0
  elif [ "$rc" -ne 1 ]; then
    echo "::error::git diff falló con $rc: no se ha podido comprobar."
    return 2
  fi
  # El motivo exacto, antes del diagnóstico: qué commits y qué archivos tiene main que la rama no.
  echo "Commits de main desde el merge-base (${base:0:7}):"
  git log --oneline "$base..origin/main" || true
  echo "Archivos que difieren:"
  git diff --stat "$base" origin/main || true
  echo "::error::main tiene cambios fuera de la historia de esta rama: lo normal es que un PR develop → main" \
    "se fusionara con squash (DEC-096); también puede ser un conflicto resuelto en GitHub o un cambio directo en main. Arreglo: un PR a develop con" \
    "'git merge -s ours origin/main' (como #352 y RV-135) si develop ya tiene esos cambios, o un merge" \
    "normal de origin/main si no; fusionado con merge commit. Y este PR, también con merge commit (gh pr merge --merge)."
  return 1
}
