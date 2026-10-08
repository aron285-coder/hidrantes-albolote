# Despliegues del proyecto de Pages de producción que no vienen de deploy-prod.yml (docs/31 RV-130,
# DEC-172). Se carga con `source` desde el trabajo «mirar» de vigilancia.yml (environment prod-tareas).
#
# Por qué hace falta: el permiso «Pages: Edit» de Cloudflare es de toda la cuenta (no se puede limitar
# a un proyecto, docs/entornos.md), así que el token con el que staging se despliega en cada fusión a
# develop, sin aprobación, también podría desplegar el proyecto de producción. No se puede impedir;
# se detecta.
#
# Un despliegue del proyecto de producción está autorizado solo si se creó mientras corría el paso
# «Desplegar a Cloudflare Pages» de un job de deploy-prod.yml con su mismo commit (docs/32 RV-203):
# la ventana started_at–completed_at de ese paso, de la API de jobs (hasta ahora si sigue en marcha),
# ± 30 s por la diferencia de relojes. Cuenta también si el paso terminó en failure o cancelled:
# wrangler puede haber creado el despliegue antes de fallar, y ese paso solo corre después de la
# aprobación de production. Ni la espera de esa aprobación, ni los pasos de antes o de después, ni
# una ejecución rechazada (su paso no llega a empezar) autorizan nada: con el token de Cloudflare, en
# esa espera se podría desplegar el commit pendiente y parecería legítimo (antes contaba toda la
# ejecución, de created_at a updated_at).
# Solo el commit no basta: `wrangler pages deploy --commit-hash` acepta cualquiera. deploy-prod solo
# despliega producción: un despliegue de preview en ese proyecto nunca está autorizado.
#
#   ventanas JOBS                   las ventanas del paso que despliega («[{sha, ini, fin}]», época)
#   ajenos LISTA VENTANAS DESDE     los no autorizados («id commit fecha entorno»)
#   ultimo_bueno LISTA VENTANAS     el de producción autorizado y correcto más reciente que no está activo
#   mirar_despliegues               lo de arriba con la API, la issue, el aviso y, si config lo pide, revertir
#
# LISTA es un JSON con un array de despliegues de la API de Pages; el activo lleva `"activo": true` y
# se mira siempre, los demás solo si son posteriores a DESDE (época en segundos). JOBS es un array con
# los jobs (todos los intentos) de las ejecuciones de deploy-prod.yml, de `actions/runs/{id}/jobs`;
# VENTANAS, lo que devuelve `ventanas`.
#
# Corre con bash -e (el shell de Actions). Nunca sale con error: lo que no puede mirar es un problema
# que se añade al array `problemas` del que lo llama.

# El nombre del paso de deploy-prod.yml que despliega; scripts/despliegues-ajenos.test.ts comprueba que
# sigue llamándose así.
PASO_DESPLIEGUE='Desplegar a Cloudflare Pages'

# La primera línea de un archivo de errores, recortada: el porqué en el problema, sin tragárselo.
_primera_linea() {
  local linea=''
  if [ -s "$1" ]; then IFS= read -r linea < "$1" || true; fi
  printf '%s' "${linea:0:160}"
  if [ -z "$linea" ]; then printf 'sin mensaje'; fi
}

ventanas() {
  jq -c --arg paso "$PASO_DESPLIEGUE" '
    def ts: sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601;
    [.[] | .head_sha as $sha | .steps[]?
      | select(.name == $paso and .started_at != null and .conclusion != "skipped")
      | {sha: $sha, ini: (.started_at | ts),
         fin: (if .completed_at != null then (.completed_at | ts) else now end)}]' "$1"
}

_JQ_AUTORIZADOS='
  def ts: sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601;
  ($ventanas[0] // []) as $ok
  | def autorizado: (.created_on | ts) as $t | (.deployment_trigger.metadata.commit_hash // "") as $c
      | .environment == "production" and any($ok[]; .sha == $c and $t >= .ini - 30 and $t <= .fin + 30);
'

ajenos() {
  jq -r --slurpfile ventanas "$2" --argjson desde "$3" "$_JQ_AUTORIZADOS"'
    [.[] | select(.activo == true or (.created_on | ts) >= $desde)
         | select(autorizado | not)]
    | unique_by(.id) | .[]
    | "\(.id) \((.deployment_trigger.metadata.commit_hash // "sin-commit")[0:7]) \(.created_on) \(.environment)"' "$1"
}

ultimo_bueno() {
  jq -r --slurpfile ventanas "$2" "$_JQ_AUTORIZADOS"'
    [.[] | select(.activo != true and .latest_stage.status == "success") | select(autorizado)]
    | sort_by(.created_on | ts) | last | .id // empty' "$1"
}

# Necesita CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, GH_TOKEN, REPO, BD (producción) y RUNNER_TEMP.
mirar_despliegues() {
  local proyecto=hidrantes-albolote titulo='Despliegue de producción no autorizado'
  local dir api ids nuevos activo revertir bueno abierta cuerpo codigo config ejecuciones id
  dir=$(mktemp -d "${RUNNER_TEMP:-/tmp}/despliegues.XXXXXX") || { problemas+=("no se puede crear un directorio temporal (RV-130)"); return 0; }
  api="https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID:-}/pages/projects/$proyecto"
  if [ -z "${CLOUDFLARE_API_TOKEN:-}" ] || [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
    problemas+=("falta el token de Cloudflare en prod-tareas: no se pueden mirar los despliegues de producción (RV-130)")
    return 0
  fi
  codigo=$(curl -s -o "$dir/proyecto.json" -w '%{http_code}' --max-time 20 -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" "$api" || true)
  if [ "$codigo" != 200 ]; then
    problemas+=("no se puede leer el proyecto de Pages de producción (HTTP ${codigo:-000}): no se han mirado sus despliegues (RV-130)")
    return 0
  fi
  # Producción y preview: deploy-prod solo hace producción, un preview en este proyecto también es ajeno.
  codigo=$(curl -s -o "$dir/recientes.json" -w '%{http_code}' --max-time 20 -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" "$api/deployments?per_page=25" || true)
  if [ "$codigo" != 200 ]; then
    problemas+=("no se pueden listar los despliegues de producción (HTTP ${codigo:-000}) (RV-130)")
    return 0
  fi
  if ! jq -s '[(.[0].result.canonical_deployment // empty) + {activo: true}] + (.[1].result // [])' \
    "$dir/proyecto.json" "$dir/recientes.json" > "$dir/lista.json" 2>/dev/null; then
    problemas+=("la respuesta de Cloudflare con los despliegues de producción no se entiende (RV-130)")
    return 0
  fi
  if ! gh api "repos/$REPO/actions/workflows/deploy-prod.yml/runs?per_page=100" > "$dir/ejecuciones.json" 2> "$dir/error"; then
    problemas+=("no se pueden leer las ejecuciones de deploy-prod.yml ($(_primera_linea "$dir/error")): no se han mirado los despliegues (RV-130)")
    return 0
  fi
  # Los jobs (todos los intentos), con sus pasos, de las ejecuciones con el commit de algún despliegue
  # de la lista (RV-203), estén como estén: una relanzada que espera la aprobación tiene, en su intento
  # anterior, el paso que desplegó lo que hay en producción. Los intentos que no han llegado al paso no
  # dan ventana.
  if ! ejecuciones=$(jq -r --slurpfile lista "$dir/lista.json" '
      [$lista[0][] | .deployment_trigger.metadata.commit_hash // empty] as $shas
      | .workflow_runs[]? | select(.head_sha as $s | $shas | index($s)) | .id' "$dir/ejecuciones.json" 2> "$dir/error"); then
    problemas+=("la respuesta de GitHub con las ejecuciones de deploy-prod.yml no se entiende ($(_primera_linea "$dir/error")) (RV-203)")
    return 0
  fi
  : > "$dir/jobs.ndjson"
  for id in $ejecuciones; do
    if ! gh api "repos/$REPO/actions/runs/$id/jobs?filter=all&per_page=100" --jq '.jobs[]' >> "$dir/jobs.ndjson" 2> "$dir/error"; then
      problemas+=("no se pueden leer los pasos de la ejecución $id de deploy-prod.yml ($(_primera_linea "$dir/error")): no se han mirado los despliegues (RV-203)")
      return 0
    fi
  done
  if ! jq -s '.' "$dir/jobs.ndjson" > "$dir/jobs.json" 2> "$dir/error" || ! ventanas "$dir/jobs.json" > "$dir/ventanas.json" 2> "$dir/error"; then
    problemas+=("la respuesta de GitHub con los pasos de deploy-prod.yml no se entiende ($(_primera_linea "$dir/error")) (RV-203)")
    return 0
  fi
  # Los de los últimos 3 días (la vigilancia corre dos veces al día) y siempre el activo.
  if ! ids=$(ajenos "$dir/lista.json" "$dir/ventanas.json" "$(( $(date -u +%s) - 3 * 86400 ))"); then
    problemas+=("no se ha podido comparar los despliegues de producción con deploy-prod.yml (RV-130)")
    return 0
  fi
  abierta=$(gh issue list --repo "$REPO" --label vigilancia --state open --search "$titulo in:title" --json number --jq '.[0].number // empty' 2>/dev/null || true)
  if [ -z "$ids" ]; then
    if [ -n "$abierta" ]; then problemas+=("sigue abierta la issue #$abierta de un despliegue de producción no autorizado: ciérrala cuando esté resuelto (RV-130)"); fi
    return 0
  fi

  # Los ya avisados (en una issue con este título, abierta o cerrada) no se repiten: cerrar la issue es
  # darlos por atendidos.
  if ! gh issue list --repo "$REPO" --label vigilancia --state all --search "$titulo in:title" --limit 20 \
    --json body,comments --jq '.[] | .body, .comments[].body' > "$dir/avisados.txt" 2>/dev/null; then
    : > "$dir/avisados.txt"
  fi
  nuevos=$(printf '%s\n' "$ids" | grep -vFf <(grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' "$dir/avisados.txt" || true) || true)
  if [ -z "$nuevos" ]; then
    if [ -n "$abierta" ]; then problemas+=("sigue abierta la issue #$abierta de un despliegue de producción no autorizado (RV-130)"); fi
    return 0
  fi
  problemas+=("despliegue de producción no autorizado (no viene de deploy-prod.yml): $(printf '%s' "$nuevos" | tr '\n' ';' | sed 's/;$//') — RV-130, 15 §4")

  revertir="no hacía falta: el activo sí viene de deploy-prod.yml"
  activo=$(jq -r '.[] | select(.activo == true) | .id' "$dir/lista.json" 2>/dev/null || true)
  if [ -n "$activo" ] && printf '%s\n' "$ids" | grep -q "^$activo "; then
    if ! config=$(psql -X -A -t -v ON_ERROR_STOP=1 "$BD" -c "select hidrantes.fn_config('revertir_despliegue_ajeno','false') #>> '{}';" 2>/dev/null); then
      revertir="no: no se ha podido leer config.revertir_despliegue_ajeno"
      problemas+=("no se ha podido leer config.revertir_despliegue_ajeno (RV-130)")
    elif [ "$config" != true ]; then
      revertir="no (config.revertir_despliegue_ajeno está apagada)"
    elif ! bueno=$(ultimo_bueno "$dir/lista.json" "$dir/ventanas.json") || [ -z "$bueno" ]; then
      revertir="no: no hay un despliegue anterior de deploy-prod.yml al que volver"
    elif [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 -X POST -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" "$api/deployments/$bueno/rollback" || true)" = 200 ]; then
      revertir="sí: producción ha vuelto al despliegue $bueno"
    else
      revertir="falló: producción sigue en el despliegue no autorizado; vuelve a promover $bueno"
      problemas+=("no se ha podido revertir producción al despliegue $bueno (RV-130)")
    fi
  fi

  cuerpo=$(printf 'La vigilancia de %s ha encontrado despliegues del proyecto de Pages de producción que no corresponden a ninguna ejecución de deploy-prod.yml (id, commit, fecha, entorno):\n\n%s\n\nRevertido: %s\n\nQué hacer: 15 §4. Mira quién tiene el token de Cloudflare, rótalo (npm run arranque -- --rotar cloudflare) y vuelve a desplegar producción por el PR develop → main. Cierra esta issue cuando esté resuelto: los despliegues de aquí no se vuelven a avisar.\n' \
    "$(date -u +%Y-%m-%d)" "$(printf '%s\n' "$nuevos" | sed 's/^/- /')" "$revertir")
  if [ -n "$abierta" ]; then
    gh issue comment "$abierta" --repo "$REPO" --body "$cuerpo" >/dev/null || problemas+=("no se ha podido comentar la issue $abierta (RV-130)")
  else
    gh issue create --repo "$REPO" --title "$titulo" --label vigilancia --body "$cuerpo" >/dev/null \
      || problemas+=("no se ha podido abrir la issue «$titulo» (RV-130)")
  fi
  avisar_jefatura
  return 0
}

# Un aviso push a cada administrador suscrito (como el resumen semanal: s.email no nulo). Sin datos
# personales en el texto (FR-27). Lo envía el Worker hidrantes-avisos en sus siguientes 5 minutos.
avisar_jefatura() {
  local n
  if ! n=$(psql -X -A -t -v ON_ERROR_STOP=1 "$BD" -c "with n as (insert into hidrantes.notificaciones (suscripcion_id, titulo, cuerpo, url) select s.id, 'Despliegue no autorizado', 'Producción tiene un despliegue que no viene de GitHub. Mira la issue de vigilancia.', '/admin' from hidrantes.suscripciones_push s where s.email is not null returning 1) select count(*) from n;" 2>/dev/null); then
    problemas+=("no se ha podido avisar a jefatura del despliegue no autorizado (RV-130)")
  elif [ "${n:-0}" = 0 ]; then
    problemas+=("ningún administrador tiene los avisos activados: nadie ha recibido el aviso del despliegue no autorizado (RV-130)")
  fi
}
