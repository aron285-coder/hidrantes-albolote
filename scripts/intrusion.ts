// Las ocho pruebas de intrusión de TR-40 y 11 §5, ejecutadas de verdad con la `anon key` desde
// fuera, como haría cualquiera que abra la consola del navegador. Las ocho tienen que fallar.
//
//   npm run intrusion                 contra la pila local (Supabase local + wrangler en :8788)
//   npm run intrusion -- --anotar     además escribe el resultado y la fecha en 11 §5
//
// Nunca contra dev ni prod (04 §4): la ejecuta ci-sql con la pila local, igual que probar-functions.
// Lo que hace de más que los tests de pgTAP: pgTAP comprueba los permisos desde dentro de Postgres;
// esto comprueba lo que de verdad contesta PostgREST, Storage y las Pages Functions a un cliente.

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { abortar, argumentos, ejecutar, ejecutarScript, log, RAIZ } from './lib/comun.ts';

const DOC = path.join(RAIZ, 'docs', '11-seguridad-y-privacidad.md');
const FUNCIONES = process.env.FUNCTIONS_URL ?? 'http://127.0.0.1:8788';
const BUCKET = process.env.BUCKET ?? 'hidrantes-fotos-dev';
// El código del seed de staging (supabase/seed-staging.sql), no un secreto.
const CODIGO_SEED = process.env.CODIGO_SEED ?? '000000';

export interface Respuesta {
  estado: number;
  cuerpo: unknown;
}

/** Lo que se ve desde fuera cuando algo está bien cerrado: un error HTTP o una respuesta vacía. */
export function denegado(r: Respuesta): boolean {
  if (r.estado >= 400) return true;
  return Array.isArray(r.cuerpo) && r.cuerpo.length === 0;
}

/** Resumen corto de la respuesta para la columna «Resultado» de 11 §5. */
export function resumen(r: Respuesta): string {
  const c = r.cuerpo as { code?: string; message?: string; error?: string } | unknown[];
  if (Array.isArray(c)) return r.estado === 200 ? `${r.estado}, ${c.length} filas` : String(r.estado);
  const codigo = c?.code ?? c?.error;
  const mensaje = c?.message ?? '';
  const texto = [codigo, mensaje].filter(Boolean).join(': ').replace(/\s+/g, ' ').slice(0, 60);
  return texto ? `${r.estado} · ${texto}` : String(r.estado);
}

export interface Resultado {
  numero: number;
  nombre: string;
  pasa: boolean;
  observado: string;
}

/**
 * Escribe fecha y resultado en las dos últimas columnas de la tabla de 11 §5, sin tocar las tres
 * primeras: el enunciado de cada prueba es del documento, no del script.
 */
export function anotarChecklist(markdown: string, fecha: string, resultados: Resultado[]): string {
  const porNumero = new Map(resultados.map((r) => [r.numero, r]));
  return markdown.replace(/^\| (\d) \|(.*)$/gm, (linea, numero: string) => {
    const r = porNumero.get(Number(numero));
    if (!r) return linea;
    const celdas = linea.split('|').map((c) => c.trim());
    // celdas: ['', '#', 'Prueba', 'Esperado', 'Última ejecución', 'Resultado', '']
    if (celdas.length !== 7) return linea;
    celdas[4] = fecha;
    celdas[5] = `${r.pasa ? '✅' : '❌'} ${r.observado}`;
    return `| ${celdas.slice(1, 6).join(' | ')} |`;
  });
}

// ---------- cliente ----------

interface Cliente {
  url: string;
  anon: string;
}

function supabaseLocal(): Cliente {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (url && anon) return { url, anon };
  const estado = ejecutar('npx', ['--no-install', 'supabase', 'status', '-o', 'json']);
  if (estado.codigo !== 0) abortar('Supabase local no está en marcha. Ejecuta: npx supabase start');
  const s = JSON.parse(estado.salida.slice(estado.salida.indexOf('{'))) as Record<string, string>;
  return { url: s.API_URL, anon: s.ANON_KEY };
}

async function pedir(url: string, init: RequestInit = {}): Promise<Respuesta> {
  const r = await fetch(url, init);
  const texto = await r.text();
  let cuerpo: unknown = texto;
  try {
    cuerpo = JSON.parse(texto);
  } catch {
    /* respuesta sin JSON: se queda el texto */
  }
  return { estado: r.status, cuerpo };
}

function clienteRest(c: Cliente) {
  const cabeceras = {
    apikey: c.anon,
    Authorization: `Bearer ${c.anon}`,
    'Content-Type': 'application/json',
    'Accept-Profile': 'hidrantes',
    'Content-Profile': 'hidrantes',
  };
  return {
    tabla: (ruta: string, init: RequestInit = {}) =>
      pedir(`${c.url}/rest/v1/${ruta}`, { ...init, headers: { ...cabeceras, ...init.headers } }),
    rpc: (nombre: string, cuerpo: unknown) =>
      pedir(`${c.url}/rest/v1/rpc/${nombre}`, {
        method: 'POST',
        headers: cabeceras,
        body: JSON.stringify(cuerpo),
      }),
  };
}

/** Un token de dispositivo de verdad, el que tendría un voluntario que acaba de entrar. */
async function tokenDeVoluntario(): Promise<string> {
  const r = await pedir(`${FUNCIONES}/api/verificar-codigo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ codigo: CODIGO_SEED, dispositivo_id: crypto.randomUUID() }),
  });
  const token = (r.cuerpo as { token?: string }).token;
  if (r.estado !== 200 || !token) abortar(`No se pudo canjear el código del seed: ${JSON.stringify(r)}`);
  return token;
}

/** Un alta lleva foto obligatoria (FR-30): se reserva y se sube como lo hace la aplicación. */
async function fotoSubida(token: string): Promise<string> {
  const reserva = await pedir(`${FUNCIONES}/api/url-subida`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  const { url, foto_path: ruta } = reserva.cuerpo as { url?: string; foto_path?: string };
  if (reserva.estado !== 200 || !url || !ruta) abortar(`No se pudo reservar la foto: ${JSON.stringify(reserva)}`);
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9]);
  const put = await fetch(url, { method: 'PUT', body: jpeg, headers: { 'Content-Type': 'image/jpeg' } });
  if (!put.ok) abortar(`No se pudo subir la foto de la prueba 5: HTTP ${put.status}`);
  return ruta;
}

// ---------- las ocho ----------

async function ejecutarPruebas(c: Cliente): Promise<Resultado[]> {
  const { tabla, rpc } = clienteRest(c);
  const salida: Resultado[] = [];
  const anotar = (numero: number, nombre: string, pasa: boolean, observado: string) => {
    salida.push({ numero, nombre, pasa, observado });
    (pasa ? log.ok : log.error)(`${numero}. ${nombre} · ${observado}`);
  };

  // 1 y 2. Leer directamente las tablas que guardan quién propuso qué y qué hizo jefatura.
  for (const [numero, nombre] of [
    [1, 'propuestas'],
    [2, 'registro'],
  ] as const) {
    const r = await tabla(`${nombre}?select=*&limit=1`);
    anotar(numero, `select sobre ${nombre}`, denegado(r), resumen(r));
  }

  // 3. Escribir en el inventario sin pasar por una propuesta.
  const insertado = await tabla('puntos', {
    method: 'POST',
    body: JSON.stringify({ codigo: 'HID-9999', tipo: 'hidrante', caudal: 'bueno' }),
  });
  const actualizado = await tabla('puntos?codigo=eq.HID-0001', {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ caudal: 'malo' }),
  });
  anotar(
    3,
    'insert / update en puntos',
    denegado(insertado) && denegado(actualizado),
    `insert ${resumen(insertado)}; update ${resumen(actualizado)}`,
  );

  // 4. Aprobar una propuesta sin ser jefatura.
  // Los nombres de los argumentos son los de 05 §8: si no lo fueran, el 404 de PostgREST no
  // probaría nada. Con ellos bien puestos, el 404 es el de una función que anon no puede ni ver.
  const aprobada = await rpc('fn_aprobar', {
    propuesta_id: '00000000-0000-0000-0000-000000000000',
    correcciones: {},
    confirmar_desactualizada: false,
  });
  anotar(4, 'llamar a fn_aprobar', denegado(aprobada), resumen(aprobada));

  // 5. Ver las propuestas de otro dispositivo. Se crea una de verdad con el token A y se pide con
  //    el token B: la lista de B no puede traerla.
  const tokenA = await tokenDeVoluntario();
  const tokenB = await tokenDeVoluntario();
  const claveA = `intrusion-${crypto.randomUUID()}`;
  const propuesta = await rpc('fn_proponer', {
    token: tokenA,
    clave_local: claveA,
    autor_nombre: 'Prueba',
    autor_apellido: 'Intrusion',
    operacion: 'alta',
    punto_id: null,
    datos: { tipo: 'hidrante', diametro_mm: '100', caudal: 'bueno', descripcion: '[PRUEBA] intrusión' },
    origen: 'manual',
    lat: 37.2265,
    lng: -3.6555,
    gps_lat: null,
    gps_lng: null,
    precision_gps_m: null,
    exif_lat: null,
    exif_lng: null,
    foto_path: await fotoSubida(tokenA),
  });
  if (propuesta.estado !== 200) abortar(`La propuesta de la prueba 5 no se pudo crear: ${JSON.stringify(propuesta)}`);
  const mias = await rpc('fn_mis_propuestas', { token: tokenA });
  const deOtro = await rpc('fn_mis_propuestas', { token: tokenB });
  const claves = (r: Respuesta) =>
    Array.isArray(r.cuerpo) ? (r.cuerpo as { clave_local?: string }[]).map((p) => p.clave_local) : [];
  const laVeSuDueno = claves(mias).includes(claveA);
  const laVeElOtro = claves(deOtro).includes(claveA);
  anotar(
    5,
    'fn_mis_propuestas con el token de otro dispositivo',
    laVeSuDueno && !laVeElOtro,
    laVeSuDueno ? `${claves(deOtro).length} filas ajenas, ninguna suya` : 'la prueba no vale: su dueño tampoco la ve',
  );

  // 6. Validar el código de acceso saltándose la Function, que es la que limita y retrasa (TR-41, TR-42).
  const verificado = await rpc('fn_verificar_codigo', {
    codigo: CODIGO_SEED,
    dispositivo_id: crypto.randomUUID(),
    ip_hash: null,
  });
  anotar(6, 'llamar a fn_verificar_codigo', denegado(verificado), resumen(verificado));

  // 7. Subir una foto al bucket sin URL firmada.
  const subida = await pedir(`${c.url}/storage/v1/object/${BUCKET}/fotos/intrusion.jpg`, {
    method: 'POST',
    headers: { apikey: c.anon, Authorization: `Bearer ${c.anon}`, 'Content-Type': 'image/jpeg' },
    body: Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]),
  });
  anotar(7, 'subir al bucket sin URL firmada', denegado(subida), resumen(subida));

  // 8. Pedir una dirección (Nominatim) sin sesión de administrador.
  const direccion = await pedir(`${FUNCIONES}/api/direccion?lat=37.2265&lng=-3.6555`);
  anotar(8, 'GET /api/direccion sin JWT de administrador', denegado(direccion), resumen(direccion));

  return salida;
}

// ---------- principal ----------

async function principal(): Promise<void> {
  const { banderas } = argumentos();
  const c = supabaseLocal();
  log.paso(`Ocho pruebas de intrusión (TR-40) contra ${c.url} y ${FUNCIONES}`);
  const resultados = await ejecutarPruebas(c);

  if (banderas.has('anotar')) {
    const fecha = new Date().toISOString().slice(0, 10);
    writeFileSync(DOC, anotarChecklist(readFileSync(DOC, 'utf8'), fecha, resultados), 'utf8');
    log.ok(`11 §5 anotado con fecha ${fecha}`);
  }

  const fallan = resultados.filter((r) => !r.pasa);
  if (fallan.length) abortar(`${fallan.length} de 8 pruebas de intrusión NO fallaron: hay un agujero.`);
  log.ok('Las ocho fallan, que es lo que tienen que hacer');
}

if (import.meta.main) ejecutarScript(principal);
