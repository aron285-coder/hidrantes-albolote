# Despliegues de producción que no vienen de deploy-prod.yml (docs/31 RV-130, DEC-172). Se carga con
# `source` desde el trabajo «mirar» de vigilancia.yml, que corre en el environment prod-tareas.
#
# Por qué hace falta: el permiso «Pages: Edit» de Cloudflare es de toda la cuenta (no se puede limitar
# a un proyecto, docs/entornos.md), así que el token con el que staging se despliega en cada fusión a
# develop, sin aprobación, también podría desplegar el proyecto de producción. No se puede impedir;
# se detecta.
#
# Un despliegue de producción está autorizado si hay una ejecución de deploy-prod.yml con su mismo
# commit que estaba en marcha cuando se creó (± 2 minutos). Solo el commit no basta: `wrangler pages
# deploy --commit-hash` acepta cualquiera. Cuentan las ejecuciones correctas y las que fallaron en un
# paso posterior al despliegue (la paridad, por ejemplo): las dos pasaron por la aprobación de
# production; un deploy-prod fallido ya lo avisa RV-136.
#
#   ajenos LISTA EJECUCIONES DESDE   ids de los despliegues no autorizados («id commit fecha»)
#   ultimo_bueno LISTA EJECUCIONES   el despliegue autorizado y correcto más reciente que no está activo
#   mirar_despliegues                lo de arriba con la API, la issue, el aviso y, si config lo pide, revertir
#
# LISTA es un JSON con un array de despliegues de la API de Pages; el activo lleva `"activo": true` y
# se mira siempre, los demás solo si son posteriores a DESDE (época en segundos). EJECUCIONES es la
# respuesta de `actions/workflows/deploy-prod.yml/runs`.
#
# Corre con bash -e (el shell de Actions). Nunca sale con error: lo que no puede mirar es un problema
# que se añade al array `problemas` del que lo llama.

_JQ_AUTORIZADOS='
  def ts: sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601;
  [$ejecuciones[0].workflow_runs[]?
    | select(.status != "completed" or .conclusion == "success" or .conclusion == "failure")
    | {sha: .head_sha, ini: (.run_started_at | ts),
       fin: (if .status == "completed" then (.updated_at | ts) else now end)}] as $ok
  | def autorizado: (.created_on | ts) as $t | (.deployment_trigger.metadata.commit_hash // "") as $c
      | any($ok[]; .sha == $c and $t >= .ini - 120 and $t <= .fin + 120);
'

ajenos() {
  jq -r --slurpfile ejecuciones "$2" --argjson desde "$3" "$_JQ_AUTORIZADOS"'
    [.[] | select(.environment == "production")
         | select(.activo == true or (.created_on | ts) >= $desde)
         | select(autorizado | not)]
    | unique_by(.id) | .[]
    | "\(.id) \((.deployment_trigger.metadata.commit_hash // "sin-commit")[0:7]) \(.created_on)"' "$1"
}

ultimo_bueno() {
  jq -r --slurpfile ejecuciones "$2" "$_JQ_AUTORIZADOS"'
    [.[] | select(.environment == "production" and .activo != true and .latest_stage.status == "success")
         | select(autorizado)]
    | sort_by(.created_on | ts) | last | .id // empty' "$1"
}

# Necesita CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, GH_TOKEN, REPO, BD (producción) y RUNNER_TEMP.
mirar_despliegues() {
  local proyecto=hidrantes-albolote dir api lista ejec ids revertir bueno titulo abierta cuerpo codigo
  dir=$(mktemp -d "${RUNNER_TEMP:-/tmp}/despliegues.XXXXXX")
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
  codigo=$(curl -s -o "$dir/recientes.json" -w '%{http_code}' --max-time 20 -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" "$api/deployments?env=production&per_page=25" || true)
  if [ "$codigo" != 200 ]; then
    problemas+=("no se pueden listar los despliegues de producción (HTTP ${codigo:-000}) (RV-130)")
    return 0
  fi
  if ! jq -s '[(.[0].result.canonical_deployment // empty) + {activo: true}] + (.[1].result // [])' \
    "$dir/proyecto.json" "$dir/recientes.json" > "$dir/lista.json" 2>/dev/null; then
    problemas+=("la respuesta de Cloudflare con los despliegues de producción no se entiende (RV-130)")
    return 0
  fi
  if ! gh api "repos/$REPO/actions/workflows/deploy-prod.yml/runs?per_page=100" > "$dir/ejecuciones.json" 2>/dev/null; then
    problemas+=("no se pueden leer las ejecuciones de deploy-prod.yml: no se han mirado los despliegues (RV-130)")
    return 0
  fi
  # Los de los últimos 3 días (la vigilancia corre dos veces al día) y siempre el activo.
  ids=$(ajenos "$dir/lista.json" "$dir/ejecuciones.json" "$(( $(date -u +%s) - 3 * 86400 ))") || {
    problemas+=("no se ha podido comparar los despliegues de producción con deploy-prod.yml (RV-130)")
    return 0
  }
  [ -n "$ids" ] || return 0

  problemas+=("despliegue de producción no autorizado (no viene de deploy-prod.yml): $(printf '%s' "$ids" | tr '\n' ';' | sed 's/;$//') — RV-130, 15 §4")
  revertir=no
  local activo
  activo=$(jq -r '.[] | select(.activo == true) | .id' "$dir/lista.json")
  if printf '%s\n' "$ids" | grep -q "^$activo "; then
    if [ "$(psql -X -A -t -v ON_ERROR_STOP=1 "$BD" -c "select hidrantes.fn_config('revertir_despliegue_ajeno','false') #>> '{}';" 2>/dev/null || echo false)" = true ]; then
      bueno=$(ultimo_bueno "$dir/lista.json" "$dir/ejecuciones.json" || true)
      if [ -z "$bueno" ]; then
        revertir="no: no hay un despliegue anterior de deploy-prod.yml al que volver"
      elif [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 -X POST -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" "$api/deployments/$bueno/rollback" || true)" = 200 ]; then
        revertir="sí: producción ha vuelto al despliegue $bueno"
      else
        revertir="falló: producción sigue en el despliegue no autorizado; vuelve a promover $bueno a mano"
      fi
    else
      revertir="no (config.revertir_despliegue_ajeno está apagada)"
    fi
  fi

  titulo='Despliegue de producción no autorizado'
  cuerpo=$(printf 'La vigilancia de %s ha encontrado despliegues del proyecto de Pages de producción que no corresponden a ninguna ejecución de deploy-prod.yml (id, commit, fecha):\n\n%s\n\nRevertido: %s\n\nQué hacer: 15 §4. Mira quién tiene el token de Cloudflare, rótalo (npm run arranque -- --rotar cloudflare) y vuelve a desplegar producción por el PR develop → main.\n' \
    "$(date -u +%Y-%m-%d)" "$(printf '%s\n' "$ids" | sed 's/^/- /')" "$revertir")
  abierta=$(gh issue list --repo "$REPO" --label vigilancia --state open --search "$titulo in:title" --json number --jq '.[0].number // empty' 2>/dev/null || true)
  if [ -n "$abierta" ]; then
    # Ya se avisó: solo se comenta si hay algún despliegue nuevo.
    if gh issue view "$abierta" --repo "$REPO" --comments --json body,comments --jq '[.body, .comments[].body] | join("\n")' > "$dir/issue.txt" 2>/dev/null \
      && printf '%s\n' "$ids" | cut -d' ' -f1 | grep -qvxFf <(grep -oE '[0-9a-f]{8}-[0-9a-f-]{27}' "$dir/issue.txt" || true); then
      gh issue comment "$abierta" --repo "$REPO" --body "$cuerpo" >/dev/null || problemas+=("no se ha podido comentar la issue $abierta (RV-130)")
      avisar_jefatura
    fi
  else
    gh issue create --repo "$REPO" --title "$titulo" --label vigilancia --body "$cuerpo" >/dev/null \
      || problemas+=("no se ha podido abrir la issue «$titulo» (RV-130)")
    avisar_jefatura
  fi
  return 0
}

# Un aviso push a cada administrador suscrito (como el resumen semanal: s.email no nulo). Sin datos
# personales en el texto (FR-27). Lo envía el Worker hidrantes-avisos en sus siguientes 5 minutos.
avisar_jefatura() {
  psql -X -q -v ON_ERROR_STOP=1 "$BD" -c "insert into hidrantes.notificaciones (suscripcion_id, titulo, cuerpo, url) select s.id, 'Despliegue no autorizado', 'Producción tiene un despliegue que no viene de GitHub. Mira la issue de vigilancia.', '/admin' from hidrantes.suscripciones_push s where s.email is not null;" >/dev/null 2>&1 \
    || problemas+=("no se ha podido avisar a jefatura del despliegue no autorizado (RV-130)")
}
