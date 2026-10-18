// Los límites del bucket de fotos, probados con una URL firmada de verdad (`docs/41` RV-541, TR-45,
// 04 §7), contra la pila local real (INTEGRACION=1, ci-sql): `wrangler pages dev` en :8788 sobre
// Supabase local con migraciones y el seed de staging. Nunca contra dev ni prod.
//
// La prueba 7 de `npm run intrusion` comprueba que no se sube **sin** URL firmada. Lo que nadie
// comprobaba es que **con** una URL firmada el bucket se niegue a lo demasiado grande y a lo que no
// es una imagen, y en esos dos límites descansa toda la protección de las fotos: la Function reserva
// y firma; quien dice «no» es el bucket.
//
// No es una novena prueba de intrusión: «las ocho» salen en TR-40, AC-110, 11 §5 y CLAUDE.md, y no se
// renumeran.
//
// La reserva se pide con una sesión de jefatura y no canjeando el código del seed, aunque §4 lo
// describiera así: el canje tiene tope por IP (docs/36 RV-451) y en la CI todas las pruebas de
// integración salen de la misma, así que un canje más dejaba a las demás con `OCUPADO` (se vio en la
// ejecución 39152897860). Lo que se prueba es lo mismo: `/api/url-subida` → URL firmada → `PUT`, y
// los límites son del bucket, iguales para quien suba.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { sesionDeJefatura, sqlVincular } from './sesion-google.ts';

const BD = process.env.BD_PRUEBAS ?? 'postgresql://postgres:postgres@127.0.0.1:55422/postgres'; // detectar-secretos:permitir (Supabase local efímero)
const RAIZ = path.resolve(import.meta.dirname, '../..');

function consulta(sql: string): string {
  return execFileSync('psql', ['-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', BD, '-c', sql], { encoding: 'utf8' }).trim();
}

function variables(archivo: string): Record<string, string> {
  return Object.fromEntries(
    readFileSync(path.join(RAIZ, archivo), 'utf8')
      .split('\n')
      .filter((l) => /^[A-Z_]+=/.test(l))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
  );
}

/** Cabecera JPEG válida y mínima: SOI, APP0/JFIF y EOI. Pesa 22 bytes. */
const JPEG = Buffer.from('ffd8ffe000104a46494600010100000100010000ffd9', 'hex');
/** TR-45: el tope son 5 MB. Un byte más tiene que sobrar. */
const UN_BYTE_DE_MAS = 5 * 1024 * 1024 + 1;

interface Reserva {
  foto_path: string;
  url: string;
}

test('con una URL firmada, el bucket no acepta más de 5 MB ni algo que no sea JPEG o WebP', async ({ request }) => {
  // Subir 5 MB a la Storage local no es inmediato.
  test.setTimeout(120_000);
  const env = variables('.env.local');
  const servicio = variables('.dev.vars').SUPABASE_SERVICE_ROLE_KEY;
  const correo = `jefe.limites.${Date.now()}@example.org`;

  consulta(`insert into hidrantes.administradores (email, creado_por) values ('${correo}', 'prueba')`);
  const sesion = await sesionDeJefatura(
    request,
    { url: env.VITE_SUPABASE_URL, anon: env.VITE_SUPABASE_ANON_KEY, servicio },
    correo,
  );
  consulta(sqlVincular(correo, sesion.user.id));

  const reservar = async (): Promise<Reserva> => {
    const r = await request.post('/api/url-subida', {
      headers: { Authorization: `Bearer ${sesion.access_token}` },
      data: {},
    });
    expect(r.status(), await r.text()).toBe(200);
    return (await r.json()) as Reserva;
  };
  const sinUsar: string[] = [];

  // 1. El control: un JPEG pequeño entra. Si esto fallara, lo de abajo no probaría nada.
  const buena = await reservar();
  const subida = await request.put(buena.url, { headers: { 'Content-Type': 'image/jpeg' }, data: JPEG });
  expect(subida.status(), await subida.text()).toBeLessThan(300);

  // 2. Un byte más de 5 MB, con el tipo correcto: lo rechaza el bucket, no la Function.
  const grande = await reservar();
  sinUsar.push(grande.foto_path);
  const demasiado = await request.put(grande.url, {
    headers: { 'Content-Type': 'image/jpeg' },
    data: Buffer.alloc(UN_BYTE_DE_MAS, 0x41),
  });
  const textoGrande = await demasiado.text();
  // La Storage local contesta 400; se comprueba la familia y se deja el código en la salida.
  expect(demasiado.status(), `5 MB + 1 byte: ${demasiado.status()} ${textoGrande}`).toBeGreaterThanOrEqual(400);
  expect(demasiado.status(), `5 MB + 1 byte: ${demasiado.status()} ${textoGrande}`).toBeLessThan(500);
  console.log(`RV-541 · 5 MB + 1 byte → HTTP ${demasiado.status()}`);

  // 3. Un tipo que no está en la lista, del tamaño que sea.
  const otroTipo = await reservar();
  sinUsar.push(otroTipo.foto_path);
  const html = await request.put(otroTipo.url, {
    headers: { 'Content-Type': 'text/html' },
    data: Buffer.from('<html>no soy una foto</html>'),
  });
  const textoHtml = await html.text();
  expect(html.status(), `text/html: ${html.status()} ${textoHtml}`).toBeGreaterThanOrEqual(400);
  expect(html.status(), `text/html: ${html.status()} ${textoHtml}`).toBeLessThan(500);
  console.log(`RV-541 · text/html → HTTP ${html.status()}`);

  // 4. Las dos reservas que no se han usado se quitan: si no, cuentan para el espacio y para las
  // reservas abiertas (0041) y estorbarían a las demás pruebas de esta misma pila. Con la sesión de
  // jefatura no hay token de dispositivo para `fn_liberar_reservas`, así que se borran por SQL, que
  // es lo que ya hacen las demás pruebas de integración para preparar y limpiar.
  const rutas = sinUsar.map((r) => `'${r.replaceAll("'", "''")}'`).join(', ');
  expect(consulta(`delete from hidrantes.subidas where foto_path in (${rutas}) returning 1`).split('\n')).toHaveLength(
    sinUsar.length,
  );
});
