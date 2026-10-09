# Lo que la vigilancia mira en la base de datos de un entorno (TR-102, docs/20 RV-78). Se carga con
# `source` desde vigilancia.yml: el trabajo «mirar» lo usa con producción y el trabajo «staging» con
# staging, cada uno con el secreto de su entorno. Añade cada problema al array `problemas` del que
# lo llama y guarda las tareas de pg_cron en config.tareas_programadas de esa base.
#
#   revisar_bd produccion "$BD"   todo: respaldo, avisos sin salir, tareas, espacio e intentos del código
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
  # Una consulta que falla es un problema, no un cero (docs/31 RV-138): antes un fallo de psql se
  # cambiaba por 0, y la cola de avisos atascada se veía como vacía.
  if ! pendientes=$(psql -X -A -t -v ON_ERROR_STOP=1 "$bd" -c \
    "select count(*) from hidrantes.notificaciones where enviada_en is null and error is null and creada_en < now() - interval '30 minutes';" 2>/dev/null); then
    problemas+=("${pre}no se pueden contar los avisos push sin salir")
  elif [ "${pendientes:-0}" -gt 0 ]; then
    problemas+=("${pre}$pendientes avisos push llevan más de 30 minutos sin salir: mira el Worker hidrantes-avisos (docs/19 RV-52)")
  fi
  # Tareas de pg_cron (TR-54, RV-22): cuándo corrió cada una y si falló. Se guarda para
  # Salud del sistema, salga como salga.
  # Con la lista de las que tiene que haber (RV-56): una que falte, o todas, es un problema.
  # Fuera del repositorio (docs/22 RV-90): en el directorio actual quedaba suelto tras los tests.
  local tareas_json="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/tareas-$entorno.json"
  esperadas=$(paste -sd, scripts/sql/tareas-esperadas.txt)
  tareas=$(psql -X -A -t -v ON_ERROR_STOP=1 -v esperadas="$esperadas" "$bd" -f scripts/sql/tareas-programadas.sql 2>/dev/null || echo '')
  if [ -z "$tareas" ]; then
    problemas+=("${pre}no se pueden leer las tareas programadas de pg_cron")
  else
    printf '%s' "$tareas" > "$tareas_json"
    # psql no sustituye variables en -c: va por -f (RV-38). Si no se guarda, es un problema.
    if ! psql -X -q -v ON_ERROR_STOP=1 "$bd" -v valor="$tareas" -f scripts/sql/guardar-tareas.sql; then
      problemas+=("${pre}no se pueden guardar las tareas programadas en Salud del sistema")
    fi
    faltan=$(jq -r '[.[] | select(.falta) | .tarea] | join(", ")' "$tareas_json")
    if [ -n "$faltan" ]; then
      problemas+=("${pre}faltan tareas programadas de pg_cron: $faltan (¿restauración en un proyecto nuevo? 15 §5.3)")
    fi
    atrasadas=$(jq -r '[.[] | select(.problema and (.falta | not)) | .tarea] | join(", ")' "$tareas_json")
    if [ -n "$atrasadas" ]; then
      problemas+=("${pre}tareas programadas que fallaron o no han corrido a tiempo: $atrasadas")
    fi
  fi
  [ "$entorno" = produccion ] || return 0
  revisar_espacio "$bd"
  # Intentos del código de acceso (RV-14, TR-41): muchos fallos o un tope de todo el grupo
  # alcanzado son la huella de un ataque, y los voluntarios con móvil nuevo no podrían entrar.
  # Tercera y cuarta columna (docs/33 RV-300, 0044): móviles con el código bueno frenados por un tope
  # de canjes buenos desde la última vez que se abrió la entrada, y si la entrada está abierta ahora
  # (entonces no se pide abrirla). codigo_correcto se lee con to_jsonb para que la consulta no falle en
  # una base sin 0044.
  if ! intentos=$(psql -X -A -t -F ' ' -v ON_ERROR_STOP=1 "$bd" -c \
    "select count(*) filter (where not i.exito and not i.bloqueado), count(*) filter (where i.bloqueado and i.tope in ('global', 'altas_global')), count(distinct coalesce(i.dispositivo_id::text, i.ip_hash)) filter (where i.bloqueado and i.tope in ('altas_ip', 'altas_global') and coalesce((to_jsonb(i) ->> 'codigo_correcto')::boolean, false) and i.momento > coalesce((select max(r.momento) from hidrantes.registro r where r.accion = 'entrada_abierta'), '-infinity'::timestamptz)), coalesce((select jsonb_typeof(c.valor) = 'string' and (c.valor #>> '{}')::timestamptz > now() from hidrantes.config c where c.clave = 'entrada_abierta_hasta'), false) from hidrantes.intentos_codigo i where i.momento > now() - interval '24 hours';" 2>/dev/null); then
    problemas+=("no se pueden leer los intentos del código de acceso")
    return 0
  fi
  read -r fallidos globales frenadas abierta <<< "$intentos"
  if [ "${fallidos:-0}" -gt 300 ] || [ "${globales:-0}" -gt 0 ]; then
    problemas+=("posible ataque al código de acceso ($fallidos fallos y $globales bloqueos de todo el grupo en 24 h): cambia el código (15 §5.4)")
  fi
  if [ "${frenadas:-0}" -gt "$FRENADAS_MAX" ] && [ "${abierta:-f}" != t ]; then
    problemas+=("Hay voluntarios que no pueden entrar: abre la entrada 24 h en Ajustes ($frenadas móviles con el código bueno frenados por el tope de entradas en 24 h; DEC-190)")
    avisar_jefatura "$bd" 'Voluntarios sin poder entrar' 'Hay voluntarios que no pueden entrar: abre la entrada 24 h en Ajustes' \
      'de que hay voluntarios que no pueden entrar'
  fi
}

# Más de 5 móviles frenados con el código bueno en 24 h: la entrada se queda corta (docs/33 RV-300).
FRENADAS_MAX=5

# Espacio de fotos y de la base de datos (docs/32 RV-220 y RV-221, DEC-182 y DEC-183). Sustituye al
# aviso fijo de 400 MB: hidrantes.fn_espacio() da lo que ocupa cada uno, su tope (max_bytes_fotos y
# max_bytes_bd, en Ajustes) y el umbral del aviso (`aviso`, 0.7). Las fotos cuentan también 5 MB por
# reserva abierta, como el tope. Al pasar del umbral: problema (la issue) y aviso push a jefatura.
# Si el espacio de fotos no sale del bucket (`fotos_origen` distinto de `storage`), el tope trabaja
# con la última medida de la purga o del respaldo: es un problema, y otro si esa medida es vieja
# (`fotos_medidos_en`, 0042) o no dice de cuándo es.
ESPACIO_DIAS_MAX=8

revisar_espacio() {
  local bd="$1" espacio origen fotos_mb max_fotos_mb fotos_alto bd_mb max_bd_mb bd_alto pct dias
  local total_mb max_total_mb total_alto pct_total hid_mb cron_mb net_mb resto_mb cron_purga
  # docs/33 RV-301 (0044): el tope de la base de datos mide el esquema hidrantes (esquema_bytes), y el
  # total del proyecto se vigila aparte contra 500 MB (aviso al 80 %) con su desglose. Con una base sin
  # 0044, las claves nuevas no están: el esquema se toma del total, como antes, y el resto de 0.
  if ! espacio=$(psql -X -A -t -F ' ' -v ON_ERROR_STOP=1 "$bd" -c "select e ->> 'fotos_origen',
      ((e ->> 'fotos_bytes')::bigint + (e ->> 'fotos_reservado_bytes')::bigint) / 1048576,
      (e ->> 'max_bytes_fotos')::bigint / 1048576,
      (e ->> 'fotos_bytes')::bigint + (e ->> 'fotos_reservado_bytes')::bigint
        >= (e ->> 'aviso')::numeric * (e ->> 'max_bytes_fotos')::bigint,
      coalesce(e ->> 'esquema_bytes', e ->> 'bd_bytes')::bigint / 1048576,
      (e ->> 'max_bytes_bd')::bigint / 1048576,
      coalesce(e ->> 'esquema_bytes', e ->> 'bd_bytes')::bigint >= (e ->> 'aviso')::numeric * (e ->> 'max_bytes_bd')::bigint,
      round((e ->> 'aviso')::numeric * 100),
      case when e ->> 'fotos_origen' = 'storage' then 0
           when e ->> 'fotos_medidos_en' is null then -1
           else floor(extract(epoch from now() - (e ->> 'fotos_medidos_en')::timestamptz) / 86400)::int end,
      (e ->> 'bd_bytes')::bigint / 1048576,
      case when n then (e ->> 'max_bytes_bd_total')::bigint else 524288000 end / 1048576,
      (e ->> 'bd_bytes')::bigint >= case when n then (e ->> 'aviso_total')::numeric else 0.8 end
                                    * case when n then (e ->> 'max_bytes_bd_total')::bigint else 524288000 end,
      round(case when n then (e ->> 'aviso_total')::numeric else 0.8 end * 100),
      case when n then (e -> 'bd_desglose' ->> 'hidrantes')::bigint else 0 end / 1048576,
      case when n then (e -> 'bd_desglose' ->> 'cron')::bigint else 0 end / 1048576,
      case when n then (e -> 'bd_desglose' ->> 'net')::bigint else 0 end / 1048576,
      case when n then (e -> 'bd_desglose' ->> 'resto')::bigint else 0 end / 1048576,
      case when n then e ->> 'cron_purga' else 'ok' end,
      case when n then (e ->> 'cron_antiguas')::int else 0 end
    from hidrantes.fn_espacio() e, lateral (select e ? 'esquema_bytes' as n) v;" 2>/dev/null); then
    problemas+=("no se puede medir el espacio de fotos ni el de la base de datos (hidrantes.fn_espacio)")
    return 0
  fi
  read -r origen fotos_mb max_fotos_mb fotos_alto bd_mb max_bd_mb bd_alto pct dias \
    total_mb max_total_mb total_alto pct_total hid_mb cron_mb net_mb resto_mb cron_purga cron_antiguas <<< "$espacio"
  if ! [[ "${dias:-}" =~ ^-?[0-9]+$ && "${fotos_alto:-}${bd_alto:-}${total_alto:-}" =~ ^[tf][tf][tf]$
          && "${cron_purga:-}" =~ ^(ok|sin_permiso)$ && "${cron_antiguas:-}" =~ ^-?[0-9]+$ ]]; then
    problemas+=("hidrantes.fn_espacio ha devuelto algo que la vigilancia no entiende: no se ha comprobado el espacio")
    return 0
  fi
  local lleno=0
  if [ "$fotos_alto" = t ]; then
    lleno=1
    problemas+=("las fotos ocupan $fotos_mb MB de $max_fotos_mb, contando las reservas abiertas (aviso al $pct %): al llegar al tope nadie puede subir fotos (DEC-182)")
  fi
  if [ "$bd_alto" = t ]; then
    lleno=1
    problemas+=("la base de datos ocupa $bd_mb MB de $max_bd_mb en el esquema hidrantes (aviso al $pct %): al llegar al tope no se aceptan propuestas (DEC-183)")
  fi
  if [ "$total_alto" = t ]; then
    lleno=1
    problemas+=("toda la base de datos del proyecto ocupa $total_mb MB de $max_total_mb (aviso al $pct_total %): hidrantes $hid_mb MB, historial de pg_cron $cron_mb MB, respuestas de pg_net $net_mb MB y el resto (uniformidad, auth) $resto_mb MB")
  fi
  if [ "$lleno" = 1 ]; then avisar_espacio "$bd"; fi
  # La purga del historial de pg_cron (0044): se mide el efecto, no solo el permiso. Ejecuciones de
  # tareas de hidrantes de más de 11 días quieren decir que hidrantes_purgar_registros_cron no borra.
  if [ "$cron_antiguas" -lt 0 ]; then
    problemas+=("no se puede leer el historial de pg_cron para comprobar que se borra (hidrantes.fn_espacio)")
  elif [ "$cron_antiguas" -gt 0 ]; then
    local causa="mira la tarea en Salud del sistema"
    if [ "$cron_purga" = sin_permiso ]; then
      causa="falta el grant delete on cron.job_run_details to hidrantes_migrador de supabase/sql/arranque-bd.sql, que se da como postgres"
    fi
    problemas+=("el historial de pg_cron tiene $cron_antiguas ejecuciones de más de 11 días: hidrantes_purgar_registros_cron no lo está borrando ($causa; docs/33 RV-301)")
  fi
  if [ "$origen" != storage ]; then
    problemas+=("el espacio de fotos no se mide en el bucket ($origen): falta el permiso de lectura de Storage del bloque \$storage\$ de supabase/sql/arranque-bd.sql (DEC-182)")
    if [ "$dias" -lt 0 ]; then
      problemas+=("la medida del espacio de fotos no dice de cuándo es: el tope de fotos puede no ver lo que ocupa el bucket")
    elif [ "$dias" -gt "$ESPACIO_DIAS_MAX" ]; then
      problemas+=("la medida del espacio de fotos tiene $dias días (más de $ESPACIO_DIAS_MAX): el tope de fotos puede no ver lo que ocupa el bucket")
    fi
  fi
  return 0
}

# Un aviso push a cada administrador suscrito, como el del respaldo (revisar-respaldo.sh): sin datos
# personales (FR-27), como mucho uno cada 20 horas mientras siga lleno. Lo envía el Worker
# hidrantes-avisos en sus siguientes 5 minutos.
avisar_espacio() {
  avisar_jefatura "$1" 'Espacio casi lleno' 'Las fotos o la base de datos se están quedando sin espacio. Mira Salud del sistema.' \
    'de que el espacio está casi lleno'
}

# avisar_jefatura BD TITULO CUERPO QUE: el aviso, como mucho uno con ese título cada 20 horas. TITULO
# y CUERPO son textos fijos de este archivo (sin comillas simples); QUE completa el problema si falla.
avisar_jefatura() {
  local bd="$1" titulo="$2" cuerpo="$3" que="$4" n
  if ! n=$(psql -X -A -t -v ON_ERROR_STOP=1 "$bd" -c "with reciente as (select 1 from hidrantes.notificaciones where titulo = '$titulo' and creada_en > now() - interval '20 hours' limit 1), n as (insert into hidrantes.notificaciones (suscripcion_id, titulo, cuerpo, url) select s.id, '$titulo', '$cuerpo', '/admin' from hidrantes.suscripciones_push s where s.email is not null and not exists (select 1 from reciente) returning 1) select case when exists (select 1 from reciente) then 'ya' else (select count(*) from n)::text end;" 2>/dev/null); then
    # Sin el error de psql en el problema: puede nombrar el servidor, y la issue es pública.
    problemas+=("no se ha podido avisar a jefatura $que")
  elif [ "$n" = 0 ]; then
    problemas+=("ningún administrador tiene los avisos activados: nadie ha recibido el aviso $que")
  fi
  return 0
}
