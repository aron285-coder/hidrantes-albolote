# La variable ENTORNO (staging | produccion) del proyecto de Pages, para las Functions (docs/31 RV-130;
# la usa RV-146). La ponen deploy-staging.yml y deploy-prod.yml antes de desplegar: Pages solo aplica
# sus variables a los despliegues nuevos.
#
#   poner_entorno PROYECTO VALOR
#
# PATCH del proyecto con solo esa variable, en production y en preview: la API de Pages mezcla
# env_vars (lo mismo hace arranque.ts con los secretos). Por si algún día dejara de mezclar, compara
# los nombres de antes y de después, en production y en preview,
# y falla si se ha perdido alguno, que sería un secreto borrado.
# Necesita CLOUDFLARE_API_TOKEN y CLOUDFLARE_ACCOUNT_ID. Nunca imprime valores.
poner_entorno() {
  local proyecto="$1" valor="$2" api antes despues cuerpo codigo dir
  case "$valor" in staging | produccion) ;; *) echo "::error::ENTORNO no válido: $valor"; return 1 ;; esac
  api="https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/$proyecto"
  dir=$(mktemp -d "${RUNNER_TEMP:-/tmp}/entorno.XXXXXX")
  codigo=$(curl -s -o "$dir/antes.json" -w '%{http_code}' --max-time 20 -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" "$api" || true)
  if [ "$codigo" != 200 ]; then echo "::error::No se puede leer el proyecto de Pages $proyecto (HTTP $codigo)"; return 1; fi
  antes=$(jq -r '[.result.deployment_configs | to_entries[] | select(.key == "production" or .key == "preview") | .key as $e | (.value.env_vars // {} | keys[]) | "\($e):\(.)"] | sort | join(",")' "$dir/antes.json")
  cuerpo=$(jq -cn --arg v "$valor" '{deployment_configs: {production: {env_vars: {ENTORNO: {type: "plain_text", value: $v}}}, preview: {env_vars: {ENTORNO: {type: "plain_text", value: $v}}}}}')
  codigo=$(curl -s -o "$dir/despues.json" -w '%{http_code}' --max-time 20 -X PATCH -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    -H 'Content-Type: application/json' -d "$cuerpo" "$api" || true)
  if [ "$codigo" != 200 ]; then echo "::error::No se ha podido poner ENTORNO en $proyecto (HTTP $codigo)"; return 1; fi
  despues=$(jq -r '[.result.deployment_configs | to_entries[] | select(.key == "production" or .key == "preview") | .key as $e | (.value.env_vars // {} | keys[]) | "\($e):\(.)"] | sort | join(",")' "$dir/despues.json")
  if [ "$(jq -r '.result.deployment_configs.production.env_vars.ENTORNO.value // ""' "$dir/despues.json")" != "$valor" ]; then
    echo "::error::$proyecto no tiene ENTORNO=$valor después de ponerla"; return 1
  fi
  local perdidas
  perdidas=$(LC_ALL=C comm -23 <(tr ',' '\n' <<< "$antes" | sed '/^$/d') <(tr ',' '\n' <<< "$despues" | sed '/^$/d'))
  if [ -n "$perdidas" ]; then
    echo "::error::Al poner ENTORNO, $proyecto ha perdido variables: $(tr '\n' ' ' <<< "$perdidas")(vuelve a ponerlas: npm run arranque -- --solo-faltantes)"
    return 1
  fi
  rm -rf "$dir"
  echo "ENTORNO=$valor en $proyecto"
}
