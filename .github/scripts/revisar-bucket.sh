# Los límites del bucket de fotos en la vigilancia (`docs/41` RV-540, 04 §7). Se carga con `source`
# desde vigilancia.yml, en un paso propio de cada trabajo (producción en `mirar`, con prod-tareas, y
# `staging`), que junto al de las uniones es el único con la service role de su entorno.
#
#   revisar_bucket PREFIJO
#
# Corre scripts/revisar-bucket.ts con `node` (sin node_modules, DEC-198), que solo lee el bucket y
# escribe una línea por diferencia. Deja en $GITHUB_OUTPUT `problemas` (con PREFIJO delante:
# «staging: » o nada) para el paso que comprueba, y `avisar` (si/no) para el aviso técnico a
# jefatura: cualquier diferencia o un bucket que no responde es para avisar, porque mientras esté así
# las fotos pueden no verse o entrar sin límite. Nunca falla: lo que no ha podido hacer es un
# problema más.
revisar_bucket() {
  local pre="$1" salida='' codigo=0 linea avisar=no
  local lineas=()
  if [ -z "${SUPABASE_URL:-}" ] || [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ] || [ -z "${BUCKET:-}" ]; then
    lineas+=("${pre}faltan SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY o BUCKET: no se han revisado los límites del bucket de fotos")
    avisar=si
  else
    salida=$(node scripts/revisar-bucket.ts) || codigo=$?
    while IFS= read -r linea; do
      if [ -z "$linea" ]; then continue; fi
      lineas+=("${pre}$linea")
      avisar=si
    done <<< "$salida"
    if [ "$codigo" -ne 0 ]; then
      lineas+=("${pre}no se ha podido terminar la revisión del bucket de fotos")
      avisar=si
    fi
  fi
  {
    echo 'problemas<<FIN_PROBLEMAS'
    if [ ${#lineas[@]} -gt 0 ]; then printf '%s\n' "${lineas[@]}"; fi
    echo 'FIN_PROBLEMAS'
    echo "avisar=$avisar"
  } >> "$GITHUB_OUTPUT"
  return 0
}
