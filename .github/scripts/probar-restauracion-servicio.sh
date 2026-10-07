#!/usr/bin/env bash
# Comprueba de verdad un respaldo (docs/31 RV-134): restaura el volcado **todavía sin cifrar** en el
# Postgres de servicio del trabajo (`services: postgres`, la misma imagen que `supabase start`, en el
# puerto 55422), con el mismo `restaurar.ts --entorno local` de una emergencia, y compara cuántos
# puntos hay con los que tenía el origen. Lo usa respaldo.yml cada semana.
#
#   .github/scripts/probar-restauracion-servicio.sh <volcado.sql> <puntos> [<puntos> …]
#
# Varios números de puntos porque el origen se cuenta antes y después de pg_dump: si alguien da un
# alta justo en medio, cualquiera de los dos vale. Solo imprime números: nada del volcado.
set -euo pipefail

volcado=${1:?falta el volcado}
shift
[ "$#" -gt 0 ] || { echo "::error::faltan los puntos esperados"; exit 1; }

# Credenciales del Postgres de servicio, efímero y sin datos hasta este paso (como el Supabase local).
PG=postgresql://postgres:postgres@127.0.0.1:55422/postgres # detectar-secretos:permitir (Postgres de servicio efímero)

ADMIN=postgresql://supabase_admin:postgres@127.0.0.1:55422/postgres # detectar-secretos:permitir (Postgres de servicio efímero)

for _ in $(seq 1 60); do
  pg_isready -q -h 127.0.0.1 -p 55422 -U postgres && break
  sleep 2
done

# Antes de nada, el registro del servidor en silencio. Al parar el contenedor, Actions imprime su
# registro en el log del trabajo, que es público; la imagen registra las sentencias DDL y, con un
# error, la sentencia entera y el CONTEXT de un COPY con la fila. Con datos de producción eso no
# puede salir. Si no se puede silenciar, no se restaura.
psql "$ADMIN" -X -q -v ON_ERROR_STOP=1 \
  -c "alter system set log_statement = 'none'" \
  -c "alter system set log_min_messages = 'fatal'" \
  -c "alter system set log_min_error_statement = 'panic'" \
  -c "alter system set log_error_verbosity = 'terse'" \
  -c 'select pg_reload_conf()' > /dev/null
silencio=$(psql "$PG" -X -A -t -v ON_ERROR_STOP=1 -c 'show log_statement' -c 'show log_min_error_statement' | tr '\n' ' ')
if [ "$silencio" != "none panic " ]; then
  echo "::error::No se ha podido silenciar el registro del Postgres de servicio ($silencio): no se restaura."
  exit 1
fi

# Como un proyecto recién hecho: el rol hidrantes_migrador, PostGIS y pg_cron (arranque-bd.sql, igual
# que arranque.ts), pero **sin** el esquema hidrantes, que es lo que se ha perdido. Sin esquema,
# restaurar.ts no tiene acceso de ahora que leer ni copia previa que hacer, y lo crea él: en esta base
# de usar y tirar, hidrantes_migrador puede crear esquemas (en Supabase hay que hacerlo con postgres,
# 15 §5.3 paso 4).
psql "$PG" -X -q -v ON_ERROR_STOP=1 -v clave=migrador-local -f supabase/sql/arranque-bd.sql
psql "$PG" -X -q -v ON_ERROR_STOP=1 \
  -c 'drop schema if exists hidrantes cascade' \
  -c 'grant create on database postgres to hidrantes_migrador'

npx tsx scripts/restaurar.ts --entorno local --archivo "$volcado" --confirmar RESTAURAR

restaurados=$(psql "$PG" -X -A -t -v ON_ERROR_STOP=1 -c 'select count(*) from hidrantes.puntos')
for esperado in "$@"; do
  if [ "$restaurados" = "$esperado" ]; then
    echo "Restaurado en un Postgres de servicio: $restaurados puntos, los mismos que el origen."
    exit 0
  fi
done
echo "::error::El volcado restaurado tiene $restaurados puntos y el origen tenía $*: el respaldo no es fiable (15 §5.3)."
exit 1
