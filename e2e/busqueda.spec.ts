// Búsqueda de calles, lugares, direcciones y coordenadas (FR-73, FL-36, TR-117, TR-118, AC-151;
// docs/18 GM-04). Las calles salen del callejero guardado en el móvil, también sin red; los números
// de portal, de /api/geocodificar, que aquí se simula.

import { expect, test, type Page } from '@playwright/test';
import { T } from '../src/lib/textos.ts';
import { conSesion, simularRpc, TOKEN } from './ayudas.ts';
import { LISTADO, PUNTOS } from './puntos.ts';

async function abrir(page: Page) {
  await conSesion(page);
  await simularRpc(page, { fn_listar_puntos: LISTADO, fn_registrar_error: null });
  await page.goto('/');
  await expect(page.getByText(T.mapa.nPuntos(PUNTOS.length), { exact: false })).toBeVisible();
}

const buscador = (page: Page) => page.getByRole('searchbox', { name: T.mapa.buscar });
const hojaAqui = (page: Page) => page.getByRole('dialog', { name: T.aqui.titulo });
const zoomGuardado = (page: Page) =>
  page.evaluate(() => (JSON.parse(localStorage.getItem('hidrantes.vista') ?? 'null')?.zoom ?? 0) as number);

const PORTAL = {
  etiqueta: 'Calle Real, 12, Albolote',
  tipo: 'portal',
  lat: 37.231929,
  lng: -3.657528,
  municipio: 'albolote',
};

test('sin red, "calle real" enseña la calle; al elegirla, la resalta y abre ¿Qué hay aquí?', async ({
  page,
  context,
}) => {
  await abrir(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload(); // la segunda carga ya la controla el Service Worker, con el callejero precacheado
  await expect(page.getByText(T.mapa.nPuntos(PUNTOS.length), { exact: false })).toBeVisible();
  await context.setOffline(true);
  await buscador(page).fill('c/ real');
  const calles = page.getByRole('group', { name: T.busqueda.calles });
  await expect(calles).toContainText(T.busqueda.fuenteCalles);
  await calles.getByRole('button', { name: /^Calle Real · Albolote$/ }).click();
  await expect(page).toHaveURL(/\?aqui=37\.\d+,-3\.\d+/);
  await expect(hojaAqui(page)).toBeVisible();
  await expect(hojaAqui(page)).toContainText(T.aqui.junto('Calle Real'));
  await expect(page.locator('path.linea-calle')).toHaveCount(1);
  // Desde ahí, el incidente con un toque (FL-36).
  await expect(hojaAqui(page).getByRole('button', { name: T.aqui.cercanosDesdeAqui })).toBeVisible();
  await context.setOffline(false);
});

test('pegar un enlace de Google Maps enseña "Coordenadas" arriba y centra el mapa ahí', async ({ page }) => {
  await abrir(page);
  await buscador(page).fill('https://www.google.com/maps/@37.2305,-3.656,17z');
  const primero = page.getByRole('button', { name: T.busqueda.coordenadas('37.230500, -3.656000') });
  await expect(primero).toBeVisible();
  await primero.click();
  await expect(page).toHaveURL(/\?aqui=37\.230500,-3\.656000/);
  await expect(hojaAqui(page)).toBeVisible();
  await expect.poll(() => zoomGuardado(page)).toBeGreaterThanOrEqual(18);
});

test('un enlace corto no se puede leer, y lo dice', async ({ page }) => {
  await abrir(page);
  await buscador(page).fill('https://maps.app.goo.gl/AbCdEf123');
  await expect(page.getByText(T.busqueda.enlaceCorto)).toBeVisible();
});

test('con red, "calle real 12" enseña la dirección de CartoCiudad, y al elegirla centra el mapa', async ({ page }) => {
  await abrir(page);
  const pedidas: unknown[] = [];
  await page.route('**/api/geocodificar', async (ruta) => {
    pedidas.push(ruta.request().postDataJSON());
    await ruta.fulfill({ json: { resultados: [PORTAL], fuente: 'CartoCiudad (IGN/CNIG)' } });
  });
  await buscador(page).fill('calle real 12');
  const direcciones = page.getByRole('group', { name: T.busqueda.direcciones });
  await expect(direcciones).toContainText(T.busqueda.fuenteDirecciones);
  await direcciones.getByRole('button', { name: PORTAL.etiqueta }).click();
  await expect(page).toHaveURL(/\?aqui=37\.231929,-3\.657528/);
  await expect(hojaAqui(page)).toBeVisible();
  await expect.poll(() => zoomGuardado(page)).toBeGreaterThanOrEqual(18);
  // Una sola petición, tras dejar de escribir, con el token del móvil (nunca anónima).
  expect(pedidas).toEqual([{ q: 'calle real 12', token: TOKEN }]);
});

test('con /api/geocodificar en 503, explica que el portal necesita cobertura y enseña la calle', async ({ page }) => {
  await abrir(page);
  await page.route('**/api/geocodificar', (ruta) => ruta.fulfill({ status: 503, json: { error: 'SIN_SERVIDOR' } }));
  await buscador(page).fill('calle real 12');
  await expect(page.getByText(T.busqueda.portalSinCobertura)).toBeVisible();
  await expect(
    page.getByRole('group', { name: T.busqueda.calles }).getByRole('button', { name: /^Calle Real · Albolote$/ }),
  ).toBeVisible();
});

test('sin red, con número, lo mismo y sin preguntar a nadie', async ({ page, context }) => {
  await abrir(page);
  const callejero = page.waitForResponse((r) => r.url().endsWith('/callejero.json'));
  await buscador(page).fill('calle'); // descarga el callejero
  await callejero;
  let preguntas = 0;
  await page.route('**/api/geocodificar', (ruta) => {
    preguntas++;
    return ruta.abort();
  });
  await context.setOffline(true);
  await buscador(page).fill('calle real 12');
  await expect(page.getByText(T.busqueda.portalSinCobertura)).toBeVisible();
  await expect(page.getByRole('group', { name: T.busqueda.calles })).toContainText('Calle Real');
  expect(preguntas).toBe(0);
  await context.setOffline(false);
});
