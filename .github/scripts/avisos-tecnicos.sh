# Sondeo de las Functions y avisos técnicos a jefatura (docs/35 RV-412, DEC-202). Se carga con `source`.
#
#   sondear_functions APP     escribe un problema si las Functions de APP no responden como deben;
#                             nada si responden
#   aviso_tecnico CLAVE       encola el aviso técnico CLAVE (vigilancia, respaldo, despliegue) para
#                             jefatura con hidrantes.fn_encolar_aviso_tecnico, en la base de $BD;
#                             escribe «t» si lo ha encolado y «f» si no (ya avisado en las últimas 24 h
#                             o nadie con el tema). Falla si no se puede llamar.

# Las Functions responden: POST /api/verificar-codigo con `{}` da 400 con el JSON de error. Ese camino
# responde antes de llamar a Supabase y no cuenta como intento. Sin Origin, como toda llamada de
# servidor a servidor. Un 5xx, HTML (la página de error de Cloudflare o la app servida en su lugar) o
# ninguna respuesta es un problema.
sondear_functions() {
  local app=$1 cuerpo codigo
  cuerpo=$(mktemp)
  codigo=$(curl -s -o "$cuerpo" -w '%{http_code}' --max-time 20 -X POST "$app/api/verificar-codigo" \
    -H 'Content-Type: application/json' -d '{}' || echo 000)
  if [ "$codigo" != "400" ] || ! grep -q '"error"' "$cuerpo"; then
    echo "$app: las funciones del servidor no responden (verificar-codigo da $codigo)"
  fi
  rm -f "$cuerpo"
}

aviso_tecnico() {
  local clave=$1
  case "$clave" in vigilancia | respaldo | despliegue) ;; *) echo "clave de aviso no admitida: $clave" >&2; return 2 ;; esac
  if [ -z "${BD:-}" ]; then
    echo "sin cadena de conexión: no se puede avisar a jefatura" >&2
    return 1
  fi
  # Sin el error de psql en la salida: puede nombrar el servidor, y las issues son públicas.
  psql -X -A -t -v ON_ERROR_STOP=1 "$BD" \
    -c "select hidrantes.fn_encolar_aviso_tecnico('$clave', null, null);" 2>/dev/null
}
