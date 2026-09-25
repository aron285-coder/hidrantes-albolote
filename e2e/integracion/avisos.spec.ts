// Integración real de los avisos push (docs/21 RV-86, DEC-120), contra la pila local (INTEGRACION=1,
// ci-sql). Todo el camino menos el servicio de push de verdad:
//
// 1. una suscripción con la forma de una de FCM (endpoint de 152 caracteres, claves de longitud real)
//    se guarda con fn_guardar_suscripcion_push y un token de dispositivo de verdad;
// 2. jefatura rechaza una propuesta de ese móvil y eso crea el aviso;
// 3. /api/push, con el secreto de la vigilancia local, lo reclama y lo envía a un servidor de push
//    falso levantado aquí: `PUSH_ENDPOINT_PRUEBAS` sustituye el host del endpoint. Esa variable solo
//    existe en este wrangler (y /api/push la ignora si Supabase no es local; guarda-produccion.ts
//    aborta si aparece en producción);
// 4. el envío llega cifrado y con una cabecera VAPID válida: aud, exp y la firma verificada con la
//    clave pública.
//
// Levanta su propio `wrangler pages dev` en :8789 con claves VAPID de prueba: el de :8788 de este paso
// de CI no tiene claves VAPID. Nunca contra dev ni prod.

import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import { randomBytes, randomUUID, webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { type IncomingHttpHeaders, type Server, createServer } from 'node:http';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { paresVapid } from '../../scripts/lib/claves.ts';
import { sesionDeJefatura } from './sesion-google.ts';

const BD = process.env.BD_PRUEBAS ?? 'postgresql://postgres:postgres@127.0.0.1:55422/postgres'; // detectar-secretos:permitir (Supabase local efímero)
const RAIZ = path.resolve(import.meta.dirname, '../..');
const PAGES = 'http://127.0.0.1:8789';
const PUERTO_PUSH = 9912;
const SECRETO_LOCAL = 'vigilancia-local'; // detectar-secretos:permitir (el de .dev.vars local)
const SUJETO = 'mailto:avisos-pruebas@example.org';
const MARCA = `[PRUEBA] RV-86 ${Date.now()}`;

// Claves del receptor de la RFC 8291 §5: 65 bytes (p256dh) y 16 bytes (auth), como las de un navegador.
const P256DH = 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4';
const AUTH = 'BTBZMqHH6r4Tts7J_aSIgg';

/** Un endpoint con la forma de los de FCM: 152 caracteres en total. */
function endpointFcm(): string {
  const base = 'https://fcm.googleapis.com/fcm/send/';
  const aleatorio = (n: number) => randomBytes(n).toString('base64url').slice(0, n);
  const token = `${aleatorio(11)}:APA91b${aleatorio(152 - base.length - 18)}`;
  return base + token;
}

function consulta(sql: string): string {
  return execFileSync('psql', ['-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', BD, '-c', sql], {
    encoding: 'utf8',
    env: { ...process.env, PGCLIENTENCODING: 'UTF8' },
  }).trim();
}

function variables(archivo: string): Record<string, string> {
  return Object.fromEntries(
    readFileSync(path.join(RAIZ, archivo), 'utf8')
      .split('\n')
      .filter((l) => /^[A-Z_]+=/.test(l))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
  );
}

interface Recibido {
  ruta: string;
  cabeceras: IncomingHttpHeaders;
  cuerpo: Buffer;
}

const recibidos: Recibido[] = [];
let receptor: Server;
let wrangler: ChildProcess | undefined;
let salidaWrangler = '';
let suscripcion = '';
let correo = '';
const vapid = paresVapid();

test.describe.configure({ mode: 'serial', timeout: 180_000 });

test.beforeAll(async () => {
  // Un servidor viejo en :8789 firmaría con otras claves y el fallo saldría tarde y confuso.
  if (await fetch(PAGES).catch(() => null))
    throw new Error(':8789 ya está ocupado: para el wrangler que haya quedado.');
  receptor = createServer((peticion, respuesta) => {
    const trozos: Buffer[] = [];
    peticion.on('data', (t: Buffer) => trozos.push(t));
    peticion.on('end', () => {
      recibidos.push({ ruta: peticion.url ?? '', cabeceras: peticion.headers, cuerpo: Buffer.concat(trozos) });
      respuesta.writeHead(201).end();
    });
  });
  await new Promise<void>((ok, mal) => {
    receptor.once('error', (e) =>
      mal(new Error(`El servidor de push falso no arranca en :${PUERTO_PUSH}: ${e.message}`)),
    );
    receptor.listen(PUERTO_PUSH, '127.0.0.1', ok);
  });

  // Su propio grupo de procesos fuera de Windows: npx lanza wrangler y wrangler lanza workerd.
  wrangler = spawn(
    'npx',
    [
      '--no-install',
      'wrangler',
      'pages',
      'dev',
      'dist',
      '--port',
      '8789',
      '--ip',
      '127.0.0.1',
      '--compatibility-date=2026-09-01',
      // El wrangler de :8788 ya usa el 9229.
      '--inspector-port',
      '9230',
      '--binding',
      `VAPID_PUBLIC_KEY=${vapid.publica}`,
      '--binding',
      `VAPID_PRIVATE_KEY=${vapid.privada}`,
      '--binding',
      `VAPID_SUBJECT=${SUJETO}`,
      '--binding',
      `PUSH_ENDPOINT_PRUEBAS=http://127.0.0.1:${PUERTO_PUSH}`,
    ],
    { cwd: RAIZ, shell: process.platform === 'win32', detached: process.platform !== 'win32', stdio: 'pipe' },
  );
  wrangler.stdout?.on('data', (d) => (salidaWrangler += d));
  wrangler.stderr?.on('data', (d) => (salidaWrangler += d));
  let salio: number | null | undefined;
  wrangler.once('exit', (c) => (salio = c));
  for (let i = 0; i < 120; i++) {
    if (salio !== undefined)
      throw new Error(`wrangler en :8789 ha terminado (${salio}):
${salidaWrangler.slice(-2000)}`);
    const r = await fetch(PAGES).catch(() => null);
    if (r) return;
    await new Promise((ok) => setTimeout(ok, 1000));
  }
  throw new Error(`wrangler en :8789 no responde:\n${salidaWrangler.slice(-2000)}`);
});

test.afterAll(async () => {
  // Primero los procesos y el puerto: si la limpieza de la base fallara, no quedan vivos.
  try {
    if (wrangler?.pid && process.platform === 'win32') {
      // Con shell, kill() solo mataría cmd.exe: el árbol entero (npx, wrangler, workerd).
      execFileSync('taskkill', ['/pid', String(wrangler.pid), '/T', '/F'], { stdio: 'ignore' });
    } else if (wrangler?.pid) process.kill(-wrangler.pid, 'SIGTERM');
  } catch {
    wrangler?.kill();
  }
  receptor?.closeAllConnections();
  receptor?.close();
  consulta(`delete from hidrantes.propuestas where clave_local like '${MARCA}%'`);
  consulta(`delete from hidrantes.puntos where descripcion like '${MARCA}%'`);
  if (suscripcion) consulta(`delete from hidrantes.suscripciones_push where id = '${suscripcion}'`);
  if (correo) consulta(`delete from hidrantes.administradores where email = '${correo}'`);
});

test('una suscripción de FCM guardada de verdad recibe el aviso con VAPID válido', async ({ request }) => {
  const env = variables('.env.local');
  const api = { url: env.VITE_SUPABASE_URL, anon: env.VITE_SUPABASE_ANON_KEY };
  const rpc = (nombre: string, datos: unknown, jwt = api.anon) =>
    request.post(`${api.url}/rest/v1/rpc/${nombre}`, {
      headers: {
        apikey: api.anon,
        Authorization: `Bearer ${jwt}`,
        'Content-Profile': 'hidrantes',
        'Accept-Profile': 'hidrantes',
      },
      data: datos,
    });

  // 1. Un móvil con su token, y su suscripción con forma de FCM.
  const dispositivo = randomUUID();
  const canje = await request.post(`${PAGES}/api/verificar-codigo`, {
    data: { codigo: '000000', dispositivo_id: dispositivo },
  });
  expect(canje.status(), await canje.text()).toBe(200);
  const { token } = (await canje.json()) as { token: string };

  const endpoint = endpointFcm();
  expect(endpoint).toHaveLength(152);
  const guardada = await rpc('fn_guardar_suscripcion_push', {
    token,
    suscripcion: { endpoint, expirationTime: null, keys: { p256dh: P256DH, auth: AUTH } },
    temas: ['resultado_propuesta'],
  });
  expect(guardada.status(), await guardada.text()).toBe(200);
  suscripcion = (await guardada.json()) as string;
  expect(consulta(`select dispositivo_id from hidrantes.suscripciones_push where id = '${suscripcion}'`)).toBe(
    dispositivo,
  );

  // 2. Jefatura rechaza una propuesta de ese móvil: es lo que crea el aviso al autor.
  const codigo = consulta(`select hidrantes.fn_siguiente_codigo('hidrante')`);
  const punto = consulta(`
    with nuevo as (insert into hidrantes.puntos (codigo, tipo, geom, diametro_mm, caudal, foto_path, municipio,
                                                 fecha_ultima_revision, descripcion)
    values ('${codigo}', 'hidrante', 'SRID=4326;POINT(-3.6561 37.2311)', 70, 'bueno', 'fotos/rv86.jpg', 'albolote',
            current_date - 30, '${MARCA}')
    returning id)
    select id from nuevo`);
  const propuesta = consulta(`
    with nueva as (insert into hidrantes.propuestas (punto_id, operacion, datos, autor_nombre, autor_apellido,
                                                     dispositivo_id, clave_local, foto_path)
    values ('${punto}', 'revision', '{}'::jsonb, 'Avisos', 'RV86', '${dispositivo}', '${MARCA}', 'fotos/rv86-r.jpg')
    returning id)
    select id from nueva`);

  correo = `avisos.${Date.now()}@example.org`;
  consulta(`insert into hidrantes.administradores (email, creado_por) values ('${correo}', 'prueba')`);
  const servicio = variables('.dev.vars').SUPABASE_SERVICE_ROLE_KEY;
  const sesion = await sesionDeJefatura(request, { ...api, servicio }, correo);
  const rechazo = await rpc(
    'fn_rechazar',
    { propuesta_id: propuesta, motivo: 'prueba de avisos' },
    sesion.access_token,
  );
  expect(rechazo.ok(), await rechazo.text()).toBe(true);
  const aviso = consulta(`select id from hidrantes.notificaciones where suscripcion_id = '${suscripcion}'`);
  expect(aviso).toMatch(/^\d+$/);

  // 3. /api/push lo reclama y lo envía (en la base local puede haber otros avisos pendientes).
  for (let i = 0; i < 5; i++) {
    const envio = await request.post(`${PAGES}/api/push`, {
      headers: { 'X-Vigilancia': SECRETO_LOCAL },
      data: {},
    });
    expect(envio.status(), await envio.text()).toBe(200);
    if (consulta(`select enviada_en is not null from hidrantes.notificaciones where id = ${aviso}`) === 't') break;
  }
  expect(
    consulta(`select enviada_en is not null and error is null from hidrantes.notificaciones where id = ${aviso}`),
  ).toBe('t');

  // 4. Llegó al servidor falso, por el camino del endpoint, cifrado y con VAPID.
  const ruta = new URL(endpoint).pathname;
  const llegado = recibidos.find((r) => r.ruta === ruta);
  expect(llegado, `el servidor de push falso no recibió ${ruta}`).toBeTruthy();
  expect(llegado!.cabeceras['content-encoding']).toBe('aes128gcm');
  expect(Number(llegado!.cabeceras.ttl)).toBeGreaterThan(0);
  expect(llegado!.cuerpo.length).toBeGreaterThan(86); // cabecera de 86 bytes + el registro cifrado
  expect(llegado!.cuerpo.toString('utf8')).not.toContain('rechazado');

  const autorizacion = String(llegado!.cabeceras.authorization);
  const [, jwt, k] = /^vapid t=([\w-]+\.[\w-]+\.[\w-]+), k=([\w-]+)$/.exec(autorizacion) ?? [];
  expect(k).toBe(vapid.publica);
  const [cab, reclamos, firma] = jwt.split('.');
  const leer = (p: string) => JSON.parse(Buffer.from(p, 'base64url').toString('utf8')) as Record<string, unknown>;
  expect(leer(cab)).toEqual({ typ: 'JWT', alg: 'ES256' });
  const r = leer(reclamos) as { aud: string; exp: number; sub: string };
  expect(r.aud).toBe('https://fcm.googleapis.com');
  expect(r.sub).toBe(SUJETO);
  const ahora = Math.floor(Date.now() / 1000);
  expect(r.exp).toBeGreaterThan(ahora);
  expect(r.exp).toBeLessThanOrEqual(ahora + 24 * 3600); // RFC 8292 §2: como mucho 24 h

  const publica = Buffer.from(vapid.publica, 'base64url');
  const clave = await webcrypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      x: publica.subarray(1, 33).toString('base64url'),
      y: publica.subarray(33, 65).toString('base64url'),
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  );
  const valida = await webcrypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    clave,
    Buffer.from(firma, 'base64url'),
    Buffer.from(`${cab}.${reclamos}`),
  );
  expect(valida, 'la firma VAPID se verifica con la clave pública').toBe(true);
});
