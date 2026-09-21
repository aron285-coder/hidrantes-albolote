// Integración de la Fase 8 contra la pila local real (INTEGRACION=1, ci-sql): el camino crítico
// entero de una sola vez, con el voluntario y jefatura en dos navegadores distintos, como en la
// vida real. Entrar → alta con el pin movido a mano y foto por URL firmada → jefatura aprueba con
// dirección → el punto aparece en el mapa del voluntario → retirada → papelera → restauración.
//
// Lo que se prueba aquí no es cada pantalla (eso son los e2e con servidor simulado), sino que las
// piezas encajan contra Postgres, Storage y las Pages Functions de verdad.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { T } from '../../src/lib/textos.ts';

const BD = process.env.BD_PRUEBAS ?? 'postgresql://postgres:postgres@127.0.0.1:55422/postgres'; // detectar-secretos:permitir (Supabase local efímero)
const RAIZ = path.resolve(import.meta.dirname, '../..');

function consulta(sql: string): string {
  // Sin acentos en el SQL: en Windows psql interpreta el argumento con la página de códigos de la
  // consola y un carácter no ASCII llegaría roto.
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

/** Una pestaña de escritorio con sesión de Google de un administrador recién creado. */
async function panelDeJefatura(browser: Browser, request: APIRequestContext): Promise<Page> {
  const env = variables('.env.local');
  const servicio = variables('.dev.vars').SUPABASE_SERVICE_ROLE_KEY;
  const correo = `panel.f8.${Date.now()}@example.org`;
  const clave = `clave-${Date.now()}`; // detectar-secretos:permitir (usuario efímero del Supabase local)
  consulta(`insert into hidrantes.administradores (email, creado_por) values ('${correo}', 'prueba')`);
  const alta = await request.post(`${env.VITE_SUPABASE_URL}/auth/v1/admin/users`, {
    headers: { apikey: servicio, Authorization: `Bearer ${servicio}` },
    data: { email: correo, password: clave, email_confirm: true },
  });
  expect(alta.ok()).toBe(true);
  const sesion = await (
    await request.post(`${env.VITE_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      headers: { apikey: env.VITE_SUPABASE_ANON_KEY },
      data: { email: correo, password: clave },
    })
  ).json();
  expect(sesion.access_token).toBeTruthy();

  // El panel es de escritorio (FR-100); el proyecto de integración emula un móvil.
  const contexto = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await contexto.addInitScript((s) => localStorage.setItem('hidrantes.auth', s), JSON.stringify(sesion));
  return contexto.newPage();
}

async function jpeg(page: Page): Promise<Buffer> {
  const bytes = await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 1200;
    c.height = 900;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#b5471d';
    ctx.fillRect(0, 0, 1200, 900);
    const b = await new Promise<Blob>((r) => c.toBlob((x) => r(x!), 'image/jpeg', 0.9));
    return Array.from(new Uint8Array(await b.arrayBuffer()));
  });
  return Buffer.from(bytes);
}

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 37.2309, longitude: -3.6558, accuracy: 8 });
});

test('camino crítico: alta con pin manual y foto, aprobación con dirección, mapa, retirada y restauración', async ({
  page,
  browser,
  request,
}) => {
  test.setTimeout(180_000);
  const sello = Date.now();
  const marca = `[PRUEBA] F8 ${sello}`;
  // La cola busca por código, autor, dirección y núcleo: el apellido distingue esta pasada de las
  // que corran en paralelo en otro worker.
  const apellido = `Critico${sello}`;

  // ---------- 1. El voluntario entra con el código ----------
  await page.goto('/');
  await page.getByLabel(T.entrada.cifra(1)).fill('0');
  await page.keyboard.type('00000');
  await page.getByLabel(T.entrada.nombre).fill('Camino');
  await page.getByLabel(T.entrada.apellido).fill(apellido);
  await page.getByRole('button', { name: T.entrada.entrar, exact: true }).click();
  await page.getByRole('button', { name: T.bienvenida.saltar }).click();
  await expect(page.getByText(/Sincronizado/)).toBeVisible({ timeout: 30_000 });

  // ---------- 2. Alta con el pin movido a mano y foto por URL firmada ----------
  await page.getByRole('button', { name: T.navegacion.nuevoPunto }).click();
  const mapa = page.getByTestId('selector-pin');
  await expect(mapa).toBeVisible();
  const caja = (await mapa.boundingBox())!;
  await mapa.click({ position: { x: caja.width / 2 + 40, y: caja.height / 2 + 25 } });
  await page.getByRole('radio', { name: T.formulario.hidrante }).click();
  await page.getByRole('radio', { name: T.formulario.d100 }).click();
  await page.getByRole('radio', { name: T.formulario.bueno }).click();
  await page
    .getByTestId('entrada-foto')
    .setInputFiles({ name: 'f.jpg', mimeType: 'image/jpeg', buffer: await jpeg(page) });
  await expect(page.getByText(/Foto añadida/)).toBeVisible({ timeout: 30_000 });
  await page.getByLabel(T.formulario.descripcionOpcional).fill(marca);
  await page.getByRole('button', { name: T.envio.enviarRevision, exact: true }).click();
  await expect(page.getByRole('heading', { level: 2, name: T.envio.enviado })).toBeVisible({ timeout: 30_000 });

  const propuesta = consulta(`select id from hidrantes.propuestas where datos ->> 'descripcion' = '${marca}'`);
  expect(propuesta).toMatch(/^[0-9a-f-]{36}$/);
  // La foto viajó por URL firmada y quedó referenciada; el pin manual se guarda como tal (FR-11).
  expect(consulta(`select foto_path is not null from hidrantes.propuestas where id = '${propuesta}'`)).toBe('t');
  expect(consulta(`select origen_ubicacion::text from hidrantes.propuestas where id = '${propuesta}'`)).toBe('manual');

  // ---------- 3. Jefatura la aprueba, con dirección ----------
  const panel = await panelDeJefatura(browser, request);
  await panel.goto('/admin/cola');
  await panel.getByPlaceholder(T.panelCola.buscar).fill(apellido);
  const lista = panel.getByRole('region', { name: T.panelCola.colaRevision });
  await expect(lista.getByRole('listitem')).toHaveCount(1, { timeout: 30_000 });
  await lista.getByRole('listitem').first().getByRole('button').click();
  const detalle = panel.getByRole('article');
  await detalle.getByLabel(T.ficha.direccion).fill('Calle de la Prueba 8');
  await detalle.getByRole('button', { name: T.panelCola.aprobar, exact: true }).click();
  await expect(panel.getByRole('status').filter({ hasText: /Aprobada/ })).toBeVisible({ timeout: 30_000 });

  // El alta aprobada crea el punto con el código siguiente; la propuesta de alta no guarda punto_id,
  // el vínculo entre las dos cosas queda en el registro (05 §4).
  const codigo = consulta(`select codigo from hidrantes.puntos where descripcion = '${marca}'`);
  expect(codigo).toMatch(/^HID-[0-9]{4}$/);
  expect(consulta(`select direccion from hidrantes.puntos where codigo = '${codigo}'`)).toBe('Calle de la Prueba 8');

  // ---------- 4. El voluntario lo ve en el mapa ----------
  await page.goto('/');
  await page.getByRole('link', { name: T.navegacion.lista }).click();
  await page.getByPlaceholder(T.mapa.buscar).fill(codigo);
  await expect(page.getByText(codigo).first()).toBeVisible({ timeout: 30_000 });
  // Y en Mis propuestas consta como aprobada, sin decir quién la aprobó (FR-27).
  await page.goto('/mis-propuestas');
  const ficha = page.getByRole('listitem').filter({ hasText: codigo });
  await expect(ficha).toContainText(T.misPropuestas.aprobada);
  await expect(ficha).not.toContainText('@');

  // ---------- 5. Retirada: desaparece del mapa y queda en el histórico ----------
  await panel.goto('/admin/inventario');
  await panel.getByPlaceholder(T.panelCola.buscar).fill(codigo);
  const fila = panel.getByRole('row').filter({ hasText: codigo });
  await expect(fila).toHaveCount(1, { timeout: 30_000 });
  await fila.getByRole('button', { name: T.panel.retirar }).click();
  const dialogoRetirar = panel.getByRole('dialog');
  await expect(dialogoRetirar.getByText(T.panelInventario.avisoRetirar)).toBeVisible();
  await dialogoRetirar.getByLabel(T.panelInventario.motivo).fill('Sustituido en obra (prueba)');
  await dialogoRetirar.getByRole('button', { name: T.panel.retirar }).click();
  await expect(panel.getByRole('status').filter({ hasText: /retirado/ })).toBeVisible({ timeout: 30_000 });
  expect(consulta(`select situacion::text from hidrantes.puntos where codigo = '${codigo}'`)).toBe('retirado');

  await page.goto('/');
  await page.getByRole('link', { name: T.navegacion.lista }).click();
  await page.getByPlaceholder(T.mapa.buscar).fill(codigo);
  await expect(page.getByText(codigo)).toHaveCount(0, { timeout: 30_000 });

  // ---------- 6. Papelera y restauración (FR-124) ----------
  // Retirado y borrado no son lo mismo: restaurar es de la papelera, así que primero se borra.
  consulta(`update hidrantes.puntos set situacion = 'activo' where codigo = '${codigo}'`);
  await panel.goto('/admin/inventario');
  await panel.getByPlaceholder(T.panelCola.buscar).fill(codigo);
  const fila2 = panel.getByRole('row').filter({ hasText: codigo });
  await expect(fila2).toHaveCount(1, { timeout: 30_000 });
  await fila2.getByRole('button', { name: T.panel.borrar, exact: true }).click();
  const dialogoBorrar = panel.getByRole('dialog');
  await dialogoBorrar.getByLabel(T.panelInventario.motivo).fill('Duplicado de prueba');
  await dialogoBorrar.getByRole('button', { name: T.panel.borrar, exact: true }).click();
  await expect(panel.getByRole('status').filter({ hasText: /papelera/ })).toBeVisible({ timeout: 30_000 });
  expect(consulta(`select situacion::text from hidrantes.puntos where codigo = '${codigo}'`)).toBe('borrado');

  await panel.goto('/admin/papelera');
  const enPapelera = panel.getByRole('row').filter({ hasText: codigo });
  await expect(enPapelera).toHaveCount(1, { timeout: 30_000 });
  await enPapelera.getByRole('button', { name: T.panel.restaurar }).click();
  // Por su texto: el cartel de «ENTORNO DE PRUEBAS» que lleva staging también es un `status`.
  await expect(panel.getByRole('status').filter({ hasText: T.panelPapelera.restaurado(codigo) })).toBeVisible({
    timeout: 30_000,
  });
  expect(consulta(`select situacion::text from hidrantes.puntos where codigo = '${codigo}'`)).toBe('activo');

  // El registro cuenta la historia entera, sin huecos (11 §6).
  expect(
    consulta(`select string_agg(accion, ',' order by momento) from hidrantes.registro
               where punto_id = (select id from hidrantes.puntos where codigo = '${codigo}')`),
    // Escribir la dirección es una corrección de jefatura, y así consta (FR-106).
  ).toBe('aprobacion_con_correcciones,retirada,borrado,restauracion');

  await panel.context().close();
});
