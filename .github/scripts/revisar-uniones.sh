# Las uniones de jefatura en la vigilancia (docs/36 RV-463, DEC-206). Se carga con `source` desde
# vigilancia.yml, en un paso propio de cada trabajo (producción en `mirar`, con prod-tareas, y
# `staging`), el único con la service role de su entorno.
#
#   revisar_uniones PREFIJO
#
# Corre scripts/revisar-uniones.ts con `node` (sin node_modules, DEC-198), que desune la que no cumple
# la regla de la unión. Deja en $GITHUB_OUTPUT `problemas` (una línea por problema, con PREFIJO
# delante: «staging: » o nada), para el paso que comprueba, y `desunida` (si/no), para el aviso
# técnico. Nunca falla: lo que no ha podido hacer es un problema más.
revisar_uniones() {
  local pre="$1" salida='' codigo=0 linea desunida=no
  local lineas=()
  if [ -z "${SUPABASE_URL:-}" ] || [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
    lineas+=("${pre}faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY: no se han revisado las uniones de jefatura")
  else
    salida=$(node scripts/revisar-uniones.ts) || codigo=$?
    # Lo que haya escrito cuenta aunque no haya terminado: una cuenta ya desunida tiene que avisar.
    while IFS= read -r linea; do
      if [ -z "$linea" ]; then continue; fi
      lineas+=("${pre}$linea")
      if [ "$linea" = 'una cuenta de jefatura se ha desunido: que vuelva a entrar' ]; then desunida=si; fi
    done <<< "$salida"
    if [ "$codigo" -ne 0 ]; then
      lineas+=("${pre}no se ha podido terminar la revisión de las uniones de jefatura")
    fi
  fi
  {
    echo 'problemas<<FIN_PROBLEMAS'
    if [ ${#lineas[@]} -gt 0 ]; then printf '%s\n' "${lineas[@]}"; fi
    echo 'FIN_PROBLEMAS'
    echo "desunida=$desunida"
  } >> "$GITHUB_OUTPUT"
  return 0
}
