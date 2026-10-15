#!/usr/bin/env bash
# Lo que llega de «construir» no puede cambiar el código de servidor (docs/37 RV-490, DEC-210).
#
#   bash .github/scripts/comprobar-dist.sh DIST
#
# Con VITE_ENTORNO, VITE_SUPABASE_URL y VITE_MAPABASE_URL: las mismas variables públicas que usó
# «construir». Lo ejecuta «desplegar» justo después de descargar dist, antes de cualquier paso con
# secretos. Escribe cada problema como ::error:: y sale con 1 si hay alguno; con 0 si no.
#
# «construir» corre el código de las dependencias sin secretos (DEC-198), pero lo que deja en dist se
# despliega con el environment. Wrangler solo empaqueta functions/ si dist no trae _worker.js: si lo trae,
# ese código sustituye a todas las Functions. _routes.json decide qué va a las Functions, _redirects
# puede llevar a otra web y _headers, quitar la CSP. Si algún día hace falta uno de ellos, se genera en
# «desplegar» desde el repositorio, nunca desde dist.
set -euo pipefail

dist=${1:?uso: comprobar-dist.sh DIST}
raiz=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)

# Las extensiones de un dist limpio (15 oct 2026): la app, sus mapas de código, las fuentes, las imágenes,
# el mapa base (teselas sueltas y el PMTiles entero) y robots.txt. Una nueva se añade aquí a propósito.
EXTENSIONES=(html js css map json webmanifest svg png jpg jpeg webp ico woff woff2 pbf pmtiles txt)

problemas=()

if [ ! -d "$dist" ] || [ -L "$dist" ]; then
  echo "::error::$dist no es una carpeta"
  exit 1
fi

# 1. Los archivos especiales de Pages que cambian lo que hace el servidor.
for especial in _worker.js functions _routes.json _redirects; do
  if [ -e "$dist/$especial" ] || [ -L "$dist/$especial" ]; then
    problemas+=("dist trae $especial: cambiaría el código de servidor o las rutas")
  fi
done
# Cualquier otro nombre de la raíz que empiece por «_», salvo _headers: Pages reserva esos nombres.
while IFS= read -r -d '' f; do
  nombre=${f##*/}
  case "$nombre" in _headers | _worker.js | _routes.json | _redirects) continue ;; esac
  problemas+=("dist trae $nombre en la raíz: nombre reservado de Pages")
done < <(find "$dist" -mindepth 1 -maxdepth 1 -name '_*' -print0)

# 2. Ningún enlace simbólico ni nada que no sea un archivo o una carpeta.
while IFS= read -r -d '' f; do
  problemas+=("dist trae un enlace simbólico: ${f#"$dist"/}")
done < <(find "$dist" -mindepth 1 -type l -print0)
while IFS= read -r -d '' f; do
  problemas+=("dist trae algo que no es un archivo: ${f#"$dist"/}")
done < <(find "$dist" -mindepth 1 ! -type f ! -type d ! -type l -print0)

# 3. Solo archivos estáticos esperados.
while IFS= read -r -d '' f; do
  relativo=${f#"$dist"/}
  [ "$relativo" = "_headers" ] && continue
  nombre=${f##*/}
  extension=${nombre##*.}
  permitida=no
  if [ "$extension" != "$nombre" ]; then
    for e in "${EXTENSIONES[@]}"; do
      if [ "$extension" = "$e" ]; then
        permitida=si
        break
      fi
    done
  fi
  [ "$permitida" = si ] || problemas+=("dist trae un archivo inesperado: $relativo")
done < <(find "$dist" -mindepth 1 -type f -print0)

# 4. _headers, idéntico byte a byte al que genera el repositorio.
esperado=$(mktemp)
trap 'rm -f "$esperado"' EXIT
if ! node "$raiz/scripts/cabeceras-esperadas.ts" >"$esperado"; then
  problemas+=("no se ha podido generar el _headers esperado (VITE_ENTORNO=${VITE_ENTORNO:-})")
elif [ -L "$dist/_headers" ] || [ ! -f "$dist/_headers" ]; then
  problemas+=("dist no trae _headers")
elif ! cmp -s "$esperado" "$dist/_headers"; then
  problemas+=("dist/_headers no es el que genera config/cabeceras.ts")
fi

if [ ${#problemas[@]} -gt 0 ]; then
  for p in "${problemas[@]}"; do echo "::error::$p"; done
  echo "dist no se despliega: ${#problemas[@]} problema(s) (docs/37 RV-490, DEC-210)."
  exit 1
fi
echo "dist: sin archivos especiales, solo estáticos esperados y _headers del repositorio."
