// Integración de las Pages Functions contra Supabase local (09 Fase 3, criterio de salida; TR-40).
// Requiere `wrangler pages dev` en FUNCTIONS_URL (por defecto :8788) con .dev.vars de Supabase local,
// y el seed de staging cargado (código 000000). Nunca contra dev ni prod.
//
//   npm run probar-functions

import { abortar, ejecutarScript, log } from './lib/comun.ts';

const BASE = process.env.FUNCTIONS_URL ?? 'http://127.0.0.1:8788';
let fallos = 0;

function comprobar(condicion: boolean, texto: string, detalle = ''): void {
  if (condicion) log.ok(texto);
  else {
    fallos++;
    log.error(`${texto}${detalle ? ` · ${detalle}` : ''}`);
  }
}

async function pedir(ruta: string, init: RequestInit = {}) {
  const r = await fetch(`${BASE}${ruta}`, init);
  const texto = await r.text();
  let cuerpo: unknown;
  try {
    cuerpo = JSON.parse(texto);
  } catch {
    cuerpo = texto;
  }
  return { estado: r.status, cuerpo: cuerpo as Record<string, unknown> };
}

const post = (ruta: string, cuerpo: unknown, cabeceras: Record<string, string> = {}) =>
  pedir(ruta, {
    method: 'POST',
    body: JSON.stringify(cuerpo),
    headers: { 'Content-Type': 'application/json', ...cabeceras },
  });

async function principal(): Promise<void> {
  log.paso(`Pages Functions en ${BASE}`);
  const dispositivo = crypto.randomUUID();

  const malo = await post('/api/verificar-codigo', { codigo: '999999', dispositivo_id: dispositivo });
  comprobar(
    malo.estado === 401 && malo.cuerpo.error === 'CODIGO_INCORRECTO',
    'código erróneo: 401 CODIGO_INCORRECTO',
    JSON.stringify(malo),
  );

  const t0 = Date.now();
  const bueno = await post('/api/verificar-codigo', { codigo: '000000', dispositivo_id: dispositivo });
  comprobar(
    bueno.estado === 200 && typeof bueno.cuerpo.token === 'string',
    'código del seed: 200 con token',
    JSON.stringify(bueno),
  );
  comprobar(Date.now() - t0 >= 780, 'la respuesta tarda al menos 800 ms (TR-42)');
  const token = String(bueno.cuerpo.token ?? '');
  if (!token) abortar('Sin token no se puede seguir.');

  const subida = await post('/api/url-subida', { token });
  comprobar(
    subida.estado === 200 && /^fotos\/.+\.jpg$/.test(String(subida.cuerpo.foto_path)),
    'url-subida: reserva con token',
    JSON.stringify(subida),
  );
  if (subida.estado === 200) {
    const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9]);
    const put = await fetch(String(subida.cuerpo.url), {
      method: 'PUT',
      body: jpeg,
      headers: { 'Content-Type': 'image/jpeg' },
    });
    comprobar(put.ok, 'la URL firmada admite la foto (PUT)', `HTTP ${put.status}`);
  }
  const sinToken = await post('/api/url-subida', {});
  comprobar(sinToken.estado === 401, 'url-subida sin token ni sesión: 401');

  const direccion = await pedir('/api/direccion?lat=37.23&lng=-3.65');
  comprobar(
    direccion.estado === 403 && direccion.cuerpo.error === 'NO_AUTORIZADO',
    '/api/direccion sin JWT: 403 (TR-40)',
  );

  const workflow = await post('/api/lanzar-workflow', { workflow: 'respaldo' });
  comprobar(workflow.estado === 403, '/api/lanzar-workflow sin JWT: 403');

  const push = await post('/api/push', { token: 'inventado-inventado-inventado' });
  comprobar(push.estado === 401, '/api/push con token inventado: 401');

  if (fallos) abortar(`${fallos} comprobaciones fallidas`);
  log.ok('Pages Functions conformes con 05 §9');
}

ejecutarScript(principal);
