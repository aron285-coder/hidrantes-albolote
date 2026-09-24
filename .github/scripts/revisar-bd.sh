# Lo que la vigilancia mira en la base de datos de un entorno (TR-102, docs/20 RV-78). Se carga con
# `source` desde vigilancia.yml: el trabajo «mirar» lo usa con producción y el trabajo «staging» con
# staging, cada uno con el secreto de su entorno. Añade cada problema al array `problemas` del que
# lo llama y guarda las tareas de pg_cron en config.tareas_programadas de esa base.
#
#   revisar_bd produccion "$BD"   todo: respaldo, avisos sin salir, tareas, tamaño e intentos del código
#   revisar_bd staging "$BD"      lo que aplica en staging: avisos sin salir y tareas programadas
#
# Corre con bash -e (el shell de Actions): nada de `a && b` al final de un bloque, que con `a` falso
# terminaría el paso.
revisar_bd() {
  local entorno="$1" bd="$2" pre=""
  if [ "$entorno" = staging ]; then pre="staging: "; fi
  if [ "$entorno" = produccion ]; then
    dias=$(psql -X -A -t -v ON_ERROR_STOP=1 "$bd" -c \
      "select coalesce(extract(day from now() - (hidrantes.fn_config('ultimo_respaldo','null') #>> '{}')::timestamptz)::int, 999);" 2>/dev/null || echo error)
    if [ "$dias" = "error" ]; then
      problemas+=("no se puede consultar la base de datos")
      return
    elif [ "$dias" -gt 8 ]; then
      problemas+=("el último respaldo tiene $dias días (más de 8)")
    fi
  elif ! psql -X -A -t -v ON_ERROR_STOP=1 "$bd" -c 'select 1;' > /dev/null 2>&1; then
    problemas+=("${pre}no se puede consultar la base de datos")
    return
  fi
  pendientes=$(psql -X -A -t -v ON_ERROR_STOP=1 "$bd" -c \
    "select count(*) from hidrantes.notificaciones where enviada_en is null and error is null and creada_en < now() - interval '30 minutes';" 2>/dev/null || echo 0)
  if [ "${pendientes:-0}" -gt 0 ]; then
    problemas+=("${pre}$pendientes avisos push llevan más de 30 minutos sin salir: mira el Worker hidrantes-avisos (docs/19 RV-52)")
  fi
  # Tareas de pg_cron (TR-54, RV-22): cuándo corrió cada una y si falló. Se guarda para
  # Salud del sistema, salga como salga.
  # Con la lista de las que tiene que haber (RV-56): una que falte, o todas, es un problema.
  esperadas=$(paste -sd, scripts/sql/tareas-esperadas.txt)
  tareas=$(psql -X -A -t -v ON_ERROR_STOP=1 -v esperadas="$esperadas" "$bd" -f scripts/sql/tareas-programadas.sql 2>/dev/null || echo '')
  if [ -z "$tareas" ]; then
    problemas+=("${pre}no se pueden leer las tareas programadas de pg_cron")
  else
    printf '%s' "$tareas" > "tareas-$entorno.json"
    # psql no sustituye variables en -c: va por -f (RV-38). Si no se guarda, es un problema.
    if ! psql -X -q -v ON_ERROR_STOP=1 "$bd" -v valor="$tareas" -f scripts/sql/guardar-tareas.sql; then
      problemas+=("${pre}no se pueden guardar las tareas programadas en Salud del sistema")
    fi
    faltan=$(jq -r '[.[] | select(.falta) | .tarea] | join(", ")' "tareas-$entorno.json")
    if [ -n "$faltan" ]; then
      problemas+=("${pre}faltan tareas programadas de pg_cron: $faltan (¿restauración en un proyecto nuevo? 15 §5.3)")
    fi
    atrasadas=$(jq -r '[.[] | select(.problema and (.falta | not)) | .tarea] | join(", ")' "tareas-$entorno.json")
    if [ -n "$atrasadas" ]; then
      problemas+=("${pre}tareas programadas que fallaron o no han corrido a tiempo: $atrasadas")
    fi
  fi
  [ "$entorno" = produccion ] || return 0
  # La base de datos de 500 MB la comparte uniformidad: aviso al 80 % (TR-53, RV-22).
  tam=$(psql -X -A -t -v ON_ERROR_STOP=1 "$bd" -c "select pg_database_size(current_database());" 2>/dev/null || echo 0)
  if [ "${tam:-0}" -gt $((400 * 1024 * 1024)) ]; then
    problemas+=("la base de datos ocupa $((tam / 1024 / 1024)) MB de 500 (más del 80 %)")
  fi
  # Intentos del código de acceso (RV-14, TR-41): muchos fallos o un tope de todo el grupo
  # alcanzado son la huella de un ataque, y los voluntarios con móvil nuevo no podrían entrar.
  intentos=$(psql -X -A -t -F ' ' -v ON_ERROR_STOP=1 "$bd" -c \
    "select count(*) filter (where not exito and not bloqueado), count(*) filter (where bloqueado and tope in ('global', 'altas_global')) from hidrantes.intentos_codigo where momento > now() - interval '24 hours';" 2>/dev/null || echo '0 0')
  read -r fallidos globales <<< "$intentos"
  if [ "${fallidos:-0}" -gt 300 ] || [ "${globales:-0}" -gt 0 ]; then
    problemas+=("posible ataque al código de acceso ($fallidos fallos y $globales bloqueos de todo el grupo en 24 h): cambia el código (15 §5.4)")
  fi
}
