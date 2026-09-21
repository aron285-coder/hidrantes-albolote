// Integración de la Fase 6 contra la pila local real (INTEGRACION=1, ci-sql). Criterio de salida:
// tres altas con foto en modo avión llegan una sola vez cada una al volver la red; un reenvío
// duplicado no crea otra propuesta; un administrador desde el móvil ve su cambio en el mapa sin cola.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { T } from '../../src/lib/textos.ts';

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

async function foto(page: Page): Promise<Buffer> {
  const bytes = await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 1200;
    c.height = 900;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#2e7d4f';
    ctx.fillRect(0, 0, 1200, 900);
    const b = await new Promise<Blob>((r) => c.toBlob((x) => r(x!), 'image/jpeg', 0.9));
    return Array.from(new Uint8Array(await b.arrayBuffer()));
  });
  return Buffer.from(bytes);
}

async function altaBocaDeRiego(page: Page, descripcion: string, boton: string) {
  await page.getByRole('button', { name: T.navegacion.nuevoPunto }).click();
  await page.getByRole('radio', { name: T.formulario.bocaRiego }).click();
  await page.getByRole('radio', { name: T.formulario.barcelona }).click();
  await page.getByRole('radio', { name: T.formulario.bueno }).click();
  await page
    .getByTestId('entrada-foto')
    .setInputFiles({ name: 'f.jpg', mimeType: 'image/jpeg', buffer: await foto(page) });
  await expect(page.getByText(/Foto añadida/)).toBeVisible();
  await page.getByLabel(T.formulario.descripcionOpcional).fill(descripcion);
  await page.getByRole('button', { name: boton, exact: true }).click();
}

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 37.2311, longitude: -3.6561, accuracy: 6 });
});

test('tres altas sin cobertura llegan una vez cada una; un reenvío duplicado no crea otra', async ({
  page,
  context,
}) => {
  const marca = `[PRUEBA] F6 ${Date.now()}`;
  await page.goto('/');
  await page.getByLabel(T.entrada.cifra(1)).fill('0');
  await page.keyboard.type('00000');
  await page.getByLabel(T.entrada.nombre).fill('Integración');
  await page.getByLabel(T.entrada.apellido).fill('Fase Seis');
  await page.getByRole('button', { name: T.entrada.entrar, exact: true }).click();
  await page.getByRole('button', { name: T.bienvenida.saltar }).click();
  await expect(page.getByText(/Sincronizado/)).toBeVisible();

  await context.setOffline(true);
  for (let i = 1; i <= 3; i++) {
    await altaBocaDeRiego(page, `${marca} #${i}`, T.envio.guardarSinCobertura);
    await expect(page.getByRole('heading', { level: 2, name: T.envio.guardadoEnMovil })).toBeVisible();
    await page.getByRole('button', { name: T.envio.volverAlMapa }).click();
  }
  // Copia de un envío de la cola, para reenviarlo después con la misma marca.
  const copia = await page.evaluate(
    () =>
      new Promise<unknown>((ok) => {
        const r = indexedDB.open('hidrantes');
        r.onsuccess = () => {
          const q = r.result.transaction('cola').objectStore('cola').getAll();
          q.onsuccess = () => ok(q.result[0]);
        };
      }),
  );
  await context.setOffline(false);
  await expect(page.getByRole('link', { name: /sin enviar/ })).toHaveCount(0, { timeout: 20_000 });

  const cuenta = () =>
    consulta(`select count(*) from hidrantes.propuestas where datos ->> 'descripcion' like '${marca}%'`);
  expect(cuenta()).toBe('3');
  expect(
    consulta(
      `select count(distinct foto_path) from hidrantes.propuestas where datos ->> 'descripcion' like '${marca}%'`,
    ),
  ).toBe('3');

  // Reenvío forzado del mismo envío (misma clave_local): vuelve a la cola y sale otra vez.
  await page.evaluate(
    (item) =>
      new Promise<void>((ok) => {
        const r = indexedDB.open('hidrantes');
        r.onsuccess = () => {
          const t = r.result.transaction('cola', 'readwrite');
          t.objectStore('cola').put(item);
          t.oncomplete = () => ok();
        };
      }),
    copia,
  );
  await page.reload();
  await expect(page.getByRole('link', { name: /sin enviar/ })).toHaveCount(0, { timeout: 20_000 });
  expect(cuenta()).toBe('3');
});

test('un administrador desde el móvil aplica al momento y ve el punto en el mapa', async ({ page, request }) => {
  const env = variables('.env.local');
  const servicio = variables('.dev.vars').SUPABASE_SERVICE_ROLE_KEY;
  const api = env.VITE_SUPABASE_URL;
  const correo = `jefe.${Date.now()}@example.org`;
  const clave = `clave-${Date.now()}`; // detectar-secretos:permitir (usuario efímero del Supabase local)

  consulta(`insert into hidrantes.administradores (email, creado_por) values ('${correo}', 'prueba')`);
  const alta = await request.post(`${api}/auth/v1/admin/users`, {
    headers: { apikey: servicio, Authorization: `Bearer ${servicio}` },
    data: { email: correo, password: clave, email_confirm: true },
  });
  expect(alta.ok()).toBe(true);
  const sesion = await (
    await request.post(`${api}/auth/v1/token?grant_type=password`, {
      headers: { apikey: env.VITE_SUPABASE_ANON_KEY },
      data: { email: correo, password: clave },
    })
  ).json();
  expect(sesion.access_token).toBeTruthy();

  await page.addInitScript((s) => {
    if (!sessionStorage.getItem('g')) {
      sessionStorage.setItem('g', '1');
      localStorage.setItem('hidrantes.auth', s);
    }
  }, JSON.stringify(sesion));
  await page.goto('/');
  await expect(page.getByText(T.navegacion.jefatura, { exact: true })).toBeVisible();

  const marca = `[PRUEBA] jefatura ${Date.now()}`;
  await altaBocaDeRiego(page, marca, T.envio.aplicarAhora);
  await expect(page.getByRole('heading', { level: 2, name: T.envio.aplicado })).toBeVisible();

  const codigo = consulta(
    `select codigo from hidrantes.puntos where descripcion = '${marca}' and situacion = 'activo'`,
  );
  expect(codigo).toMatch(/^BOC-\d{4}$/);
  expect(consulta(`select estado from hidrantes.propuestas where datos ->> 'descripcion' = '${marca}'`)).toBe(
    'aprobada',
  );
  // Sin cola: nada pendiente, y el punto ya está en su mapa.
  await page.getByRole('button', { name: T.envio.volverAlMapa }).click();
  await page.getByRole('searchbox', { name: T.mapa.buscar }).first().fill(codigo);
  await expect(page.locator('button').filter({ hasText: codigo }).first()).toBeVisible();
});
