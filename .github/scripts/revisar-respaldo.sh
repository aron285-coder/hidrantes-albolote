# El único respaldo existe (docs/32 RV-201, DEC-180). Se carga con `source` desde el trabajo «mirar»
# de vigilancia.yml (environment prod-tareas).
#
# Solo hay una copia de los datos fuera de Supabase: el artifact `respaldo-hidrantes` de respaldo.yml,
# 90 días en GitHub. config.ultimo_respaldo (revisar-bd.sh) dice cuándo corrió el respaldo, no que su
# copia siga ahí: un artifact borrado o caducado no se notaba. Aquí se mira el de la última ejecución
# correcta de respaldo.yml en develop (la única rama que llega a prod-tareas; una de otra rama no sería
# de producción), con la API de artifacts: tiene que existir, no haber caducado, pesar al menos
# 10 000 bytes (respaldo.yml ya falla con un volcado cifrado más pequeño) y tener menos de 8 días. Si
# no, es un problema (la issue de vigilancia) y un aviso push a cada administrador suscrito, como
# mucho uno cada 20 horas. Lo que no puede mirar también es un problema, con el porqué, sin push.
#
#   mirar_respaldo    necesita GH_TOKEN, REPO, RUNNER_TEMP y BD (producción; sin BD no hay aviso push)
#
# Corre con bash -e (el shell de Actions). Nunca sale con error: añade cada problema al array
# `problemas` del que lo llama. Solo usa gh (con su --jq) y date: no hace falta jq.

RESPALDO_ARTIFACT=respaldo-hidrantes
RESPALDO_DIAS_MAX=8
RESPALDO_BYTES_MIN=10000

# La primera línea de un archivo de errores, recortada: el porqué en el problema, sin tragárselo.
_respaldo_error() {
  local linea=''
  if [ -s "$1" ]; then IFS= read -r linea < "$1" || true; fi
  printf '%s' "${linea:0:160}"
  if [ -z "$linea" ]; then printf 'sin mensaje'; fi
}

mirar_respaldo() {
  local ejecucion artefacto expirado bytes creado edad=0 falta='' error
  error=$(mktemp "${RUNNER_TEMP:-/tmp}/respaldo-error.XXXXXX") || error=/dev/null
  if ! ejecucion=$(gh api "repos/$REPO/actions/workflows/respaldo.yml/runs?status=success&branch=develop&per_page=1" \
    --jq '.workflow_runs[0].id // empty' 2> "$error"); then
    problemas+=("no se pueden leer las ejecuciones de respaldo.yml ($(_respaldo_error "$error")): no se ha comprobado que exista la copia del respaldo (RV-201)")
    rm -f "$error"
    return 0
  fi
  if [ -z "$ejecucion" ]; then
    falta="no hay ninguna ejecución correcta de respaldo.yml en develop"
  elif ! artefacto=$(gh api "repos/$REPO/actions/runs/$ejecucion/artifacts?name=$RESPALDO_ARTIFACT&per_page=10" \
    --jq "[.artifacts[]? | select(.name == \"$RESPALDO_ARTIFACT\")] | first // empty | \"\\(.expired) \\(.size_in_bytes) \\(.created_at)\"" 2> "$error"); then
    problemas+=("no se pueden leer los artifacts de la ejecución $ejecucion de respaldo.yml ($(_respaldo_error "$error")): no se ha comprobado que exista la copia del respaldo (RV-201)")
    rm -f "$error"
    return 0
  elif [ -z "$artefacto" ]; then
    falta="la última ejecución correcta de respaldo.yml ($ejecucion) no tiene el artifact $RESPALDO_ARTIFACT (¿borrado?)"
  else
    read -r expirado bytes creado <<< "$artefacto"
    if [ -z "${creado:-}" ] || ! creado=$(date -u -d "$creado" +%s 2>/dev/null); then
      falta="el artifact $RESPALDO_ARTIFACT de la ejecución $ejecucion no dice cuándo se creó"
    elif edad=$(( $(date -u +%s) - creado )); [ "$expirado" != false ]; then
      falta="el artifact $RESPALDO_ARTIFACT de la ejecución $ejecucion ha caducado"
    elif ! [[ "$bytes" =~ ^[0-9]+$ ]] || [ "$bytes" -lt "$RESPALDO_BYTES_MIN" ]; then
      falta="el artifact $RESPALDO_ARTIFACT de la ejecución $ejecucion ocupa $bytes bytes (mínimo $RESPALDO_BYTES_MIN): está vacío o a medias"
    elif [ "$edad" -ge $((RESPALDO_DIAS_MAX * 86400)) ]; then
      falta="el último artifact $RESPALDO_ARTIFACT tiene $((edad / 86400)) días (máximo $RESPALDO_DIAS_MAX)"
    fi
  fi
  rm -f "$error"
  [ -n "$falta" ] || return 0
  problemas+=("$falta: no hay una copia reciente de los datos fuera de Supabase, y es la única (DEC-180). Lanza respaldo.yml y mira 15 §5.3")
  avisar_respaldo
  return 0
}

# Un aviso push a cada administrador suscrito (s.email no nulo, como el resumen semanal). Sin datos
# personales en el texto (FR-27). Lo envía el Worker hidrantes-avisos en sus siguientes 5 minutos.
# Si ya salió uno en las últimas 20 horas, no se repite: la vigilancia corre dos veces al día y la
# issue sigue diciéndolo; jefatura recibe un aviso al día mientras falte.
avisar_respaldo() {
  local n
  if [ -z "${BD:-}" ]; then
    problemas+=("sin SUPABASE_DB_URL_PROD no se ha podido avisar a jefatura de que falta el respaldo (RV-201)")
  elif ! n=$(psql -X -A -t -v ON_ERROR_STOP=1 "$BD" -c "with reciente as (select 1 from hidrantes.notificaciones where titulo = 'Respaldo sin copia' and creada_en > now() - interval '20 hours' limit 1), n as (insert into hidrantes.notificaciones (suscripcion_id, titulo, cuerpo, url) select s.id, 'Respaldo sin copia', 'El último respaldo no tiene su copia guardada en GitHub. Mira la issue de vigilancia.', '/admin' from hidrantes.suscripciones_push s where s.email is not null and not exists (select 1 from reciente) returning 1) select case when exists (select 1 from reciente) then 'ya' else (select count(*) from n)::text end;" 2>/dev/null); then
    # Sin el error de psql en el problema: puede nombrar el servidor, y la issue es pública.
    problemas+=("no se ha podido avisar a jefatura de que falta el respaldo (RV-201)")
  elif [ "$n" = ya ]; then
    : # ya avisada en las últimas 20 horas
  elif [ "${n:-0}" = 0 ]; then
    problemas+=("ningún administrador tiene los avisos activados: nadie ha recibido el aviso de que falta el respaldo (RV-201)")
  fi
}
