// Integración de la purga de fotos contra el Supabase local (docs/18 RV-33). Lo corre CI en
// `ci-sql`; en local, con la pila levantada:
//
//   npx tsx scripts/probar-purga.ts
//
// Siembra 1.100 puntos [PRUEBA] con foto y pide la lista por PostgREST, como la purga de los lunes.
// La RPC antigua (setof text) se corta en max_rows = 1.000; la nueva trae las 1.100 o más. Al
// terminar borra lo sembrado. Nunca contra dev ni prod.

import { abortar, ejecutar, ejecutarScript, log, psqlOk } from './lib/comun.ts';
import { LOCAL_POSTGRES } from './migrar.ts';
import { MAX_FILAS_POSTGREST, anotarUltimaPurga, hayUltimaPurga, modoDePurga, referenciadas } from './purgar-fotos.ts';

const SEMBRADOS = 1100;
const PREFIJO = 'rv33-integracion/';

async function principal(): Promise<void> {
  const estado = ejecutar('npx', ['--no-install', 'supabase', 'status', '-o', 'json']);
  if (estado.codigo !== 0) abortar('Supabase local no está en marcha. Ejecuta: npx supabase start');
  const s = JSON.parse(estado.salida.slice(estado.salida.indexOf('{'))) as Record<string, string>;
  const url = s.API_URL;
  const servicio = s.SERVICE_ROLE_KEY;
  if (!url?.includes('127.0.0.1') || !servicio) abortar('Esto solo corre contra el Supabase local.');

  log.paso(`Purga con ${SEMBRADOS} fotos referenciadas`);
  psqlOk(
    LOCAL_POSTGRES,
    `insert into hidrantes.puntos (codigo, tipo, geom, diametro_mm, caudal, foto_path, municipio,
                                   fecha_ultima_revision, descripcion)
     select 'HID-' || (7500 + i), 'hidrante',
            ('SRID=4326;POINT(' || (-3.69 + (i % 40) * 0.0015) || ' ' || (37.21 + (i / 40) * 0.0012) || ')')::extensions.geography,
            100, 'bueno', '${PREFIJO}' || i || '.jpg', 'albolote', current_date, '[PRUEBA] RV-33 integración ' || i
     from generate_series(1, ${SEMBRADOS}) i;`,
  );
  try {
    const antigua = await fetch(`${url}/rest/v1/rpc/fn_fotos_referenciadas`, {
      method: 'POST',
      headers: {
        apikey: servicio,
        Authorization: `Bearer ${servicio}`,
        'Content-Type': 'application/json',
        'Content-Profile': 'hidrantes',
        'Accept-Profile': 'hidrantes',
      },
      body: '{}',
    });
    const cortada = ((await antigua.json()) as unknown[]).length;
    log.info(`la RPC antigua (setof text) devuelve ${cortada}: PostgREST la corta en max_rows`);
    if (cortada !== MAX_FILAS_POSTGREST) {
      log.aviso(`se esperaba ${MAX_FILAS_POSTGREST}; si max_rows ha cambiado, revisa MAX_FILAS_POSTGREST`);
    }

    const vivas = await referenciadas(url, servicio);
    const nuestras = vivas.filter((f) => f.startsWith(PREFIJO)).length;
    log.info(`fn_fotos_referenciadas_lista devuelve ${vivas.length}, ${nuestras} de ellas sembradas aquí`);
    if (vivas.length < SEMBRADOS || nuestras !== SEMBRADOS) {
      abortar(`La lista de referenciadas viene truncada: ${vivas.length} (${nuestras} de ${SEMBRADOS} sembradas).`);
    }
    log.ok(`la purga ve las ${vivas.length} fotos referenciadas, más de ${MAX_FILAS_POSTGREST}`);
  } finally {
    psqlOk(LOCAL_POSTGRES, `delete from hidrantes.puntos where foto_path like '${PREFIJO}%';`);
  }
  primeraVez();
}

// docs/22 RV-94, DEC-129: la primera pasada programada es ensayo; tras una de verdad, ya borra.
function primeraVez(): void {
  log.paso('Guarda de la primera purga');
  const borrarMarca = () => psqlOk(LOCAL_POSTGRES, "delete from hidrantes.config where clave = 'ultima_purga_fotos';");
  borrarMarca();
  try {
    const antes = modoDePurga({
      programada: true,
      ensayoPedido: false,
      hayUltimaPurga: hayUltimaPurga(LOCAL_POSTGRES),
    });
    if (!antes.ensayo || !antes.primeraVez) abortar('Sin ultima_purga_fotos, la pasada programada no ha hecho ensayo.');
    log.ok('primera vez, programada → ensayo');
    const aMano = modoDePurga({
      programada: false,
      ensayoPedido: false,
      hayUltimaPurga: hayUltimaPurga(LOCAL_POSTGRES),
    });
    if (aMano.ensayo) abortar('A mano y sin ensayo, la primera pasada tenía que borrar.');
    log.ok('primera vez, a mano sin ensayo → borra');
    anotarUltimaPurga(LOCAL_POSTGRES);
    const despues = modoDePurga({
      programada: true,
      ensayoPedido: false,
      hayUltimaPurga: hayUltimaPurga(LOCAL_POSTGRES),
    });
    if (despues.ensayo) abortar('Con ultima_purga_fotos anotada, la pasada programada tenía que borrar.');
    log.ok('tras una purga de verdad, programada → borra');
  } finally {
    borrarMarca();
  }
}

ejecutarScript(principal);
