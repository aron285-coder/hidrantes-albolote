// Modo incidente: los más cercanos que funcionan, sin cobertura (FR-74, G2; docs/18 GM-03).

import { expect, test, type Page } from '@playwright/test';
import { T } from '../src/lib/textos.ts';
import { conGoogle, conSesion, simularRpc, simularTablas } from './ayudas.ts';
import { SUPABASE_PRUEBAS } from '../playwright.config.ts';
import { LISTADO, PUNTOS } from './puntos.ts';

const O = { latitude: 37.2305, longitude: -3.656 };
const M_POR_GRADO = 111_195;
const CAUDALES = ['bueno', 'regular', 'malo', 'no_funciona'] as const;

/** 30 puntos al norte del incidente, cada 40 m, con estados y tipos mezclados. */
const CERCA = Array.from({ length: 30 }, (_, i) => {
  const hidrante = i % 3 !== 1;
  return {
    ...PUNTOS[0]!,
    id: `00000000-0000-4000-8000-00000000c${String(i).padStart(3, '0')}`,
    codigo: `${hidrante ? 'HID' : 'BOC'}-${String(7000 + i)}`,
    tipo: hidrante ? ('hidrante' as const) : ('boca_riego' as const),
    diametro_mm: hidrante ? 100 : 45,
    racor: hidrante ? null : ('granada' as const),
    // El más cercano de todos (40 m) no funciona: la hoja tiene que avisar.
    caudal: i === 0 ? ('no_funciona' as const) : CAUDALES[i % 4]!,
    lat: O.latitude + (40 * (i + 1)) / M_POR_GRADO,
    lng: O.longitude,
    radio_px: 9,
  };
});
const metros = (lat: number) => Math.round((lat - O.latitude) * M_POR_GRADO);

async function preparar(page: Page, context: import('@playwright/test').BrowserContext, conPosicion = true) {
  if (conPosicion) {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ ...O, accuracy: 8 });
  }
  await conSesion(page);
  await simularRpc(page, { fn_listar_puntos: { ...LISTADO, puntos: CERCA }, fn_registrar_error: null });
  await page.goto('/');
  await expect(page.getByText(T.mapa.nPuntos(CERCA.length), { exact: false })).toBeVisible();
}

const hoja = (page: Page) => page.getByRole('region', { name: T.incidente.titulo });
const filas = (page: Page) => hoja(page).getByRole('listitem');

test('sin red: cinco que funcionan, en orden y con su distancia', async ({ page, context }) => {
  await preparar(page, context);
  await context.setOffline(true);
  await page.getByRole('button', { name: T.incidente.boton }).click();
  await expect(filas(page)).toHaveCount(5);
  const esperados = CERCA.filter((p) => p.caudal === 'bueno' || p.caudal === 'regular').slice(0, 5);
  for (const [i, p] of esperados.entries()) {
    const fila = filas(page).nth(i);
    await expect(fila).toContainText(p.codigo);
    await expect(fila).toContainText(/bueno|regular/);
    const texto = (await fila.textContent()) ?? '';
    const m = Number(/(\d+) m · /.exec(texto)?.[1]);
    expect(Math.abs(m - metros(p.lat))).toBeLessThanOrEqual(1);
    await expect(fila).toContainText('· N ·');
  }
  await expect(page).toHaveURL(/\?incidente=37\.230500,-3\.656000&gps=1/);
  await expect(hoja(page)).toContainText(T.incidente.desdeTuPosicion);
  await context.setOffline(false);
});

test('"Solo hidrantes" cambia la lista', async ({ page, context }) => {
  await preparar(page, context);
  await page.getByRole('button', { name: T.incidente.boton }).click();
  await expect(filas(page).filter({ hasText: 'BOC-' })).not.toHaveCount(0);
  await hoja(page).getByRole('switch', { name: T.incidente.soloHidrantes }).check();
  await expect(filas(page)).toHaveCount(5);
  await expect(filas(page).filter({ hasText: 'BOC-' })).toHaveCount(0);
});

test('avisa de que el más cercano no funciona', async ({ page, context }) => {
  await preparar(page, context);
  await page.getByRole('button', { name: T.incidente.boton }).click();
  await expect(hoja(page).getByRole('alert')).toHaveText(T.incidente.masCercanoNoFunciona(CERCA[0]!.codigo, '40 m'));
});

test('sin posición, la hoja lo explica y enfoca la búsqueda', async ({ page, context, isMobile }) => {
  await preparar(page, context, false);
  await page.getByRole('button', { name: T.incidente.boton }).click();
  await expect(hoja(page)).toContainText(T.incidente.sinPosicion);
  await expect(filas(page)).toHaveCount(0);
  const buscador = isMobile
    ? page.getByRole('searchbox', { name: T.mapa.buscar }).first()
    : page.locator('#buscar-lista');
  await expect(buscador).toBeFocused();
});

test('atrás cierra el incidente y la URL vuelve a /', async ({ page, context }) => {
  await preparar(page, context);
  await page.getByRole('button', { name: T.incidente.boton }).click();
  await expect(filas(page).first()).toBeVisible();
  await page.goBack();
  await expect(hoja(page)).toHaveCount(0);
  await expect(page).not.toHaveURL(/incidente=/);
});

test('recargar con ?incidente= lo restaura, desde el punto marcado', async ({ page, context }) => {
  await preparar(page, context, false);
  await page.goto('/?incidente=37.230500,-3.656000');
  await expect(filas(page)).toHaveCount(5);
  await expect(hoja(page)).toContainText(T.incidente.desdePuntoMarcado);
  await page.reload();
  await expect(filas(page)).toHaveCount(5);
});

test('tocar una fila abre la ficha sin cerrar el incidente', async ({ page, context }) => {
  await preparar(page, context);
  await page.getByRole('button', { name: T.incidente.boton }).click();
  const primero = CERCA.find((p) => p.caudal === 'bueno' || p.caudal === 'regular')!;
  await filas(page).first().getByRole('button').first().click();
  await expect(page).toHaveURL(new RegExp(`incidente=.*&p=${primero.id}`));
  await expect(page.getByRole('heading', { name: primero.codigo })).toBeVisible();
  await page.goBack();
  await expect(filas(page)).toHaveCount(5);
});

// G2 (01 §A, AC-155): desde abrir la app hasta ver el punto más cercano que funciona, sin red.
test('G2: con puntos guardados y sin red, la primera fila de Cercanos en menos de 3 s @rendimiento', async ({
  page,
  context,
  isMobile,
}) => {
  test.skip(!isMobile, 'G2 se mide en el perfil móvil');
  await preparar(page, context);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload(); // la segunda carga ya la controla el Service Worker
  await expect(page.getByText(T.mapa.nPuntos(CERCA.length), { exact: false })).toBeVisible();
  await context.setOffline(true);
  const t0 = Date.now();
  await page.goto('/');
  await page.getByRole('button', { name: T.incidente.boton }).click();
  await expect(filas(page).first()).toBeVisible();
  const ms = Date.now() - t0;
  test.info().annotations.push({ type: 'G2', description: `${ms} ms` });
  expect(ms).toBeLessThan(3000);
  await context.setOffline(false);
});

test('desde ¿Qué hay aquí?, "Cercanos desde aquí" abre el incidente en ese sitio', async ({ page, context }) => {
  await preparar(page, context, false);
  await page.goto('/?aqui=37.230500,-3.656000');
  await page
    .getByRole('dialog', { name: T.aqui.titulo })
    .getByRole('button', { name: T.aqui.cercanosDesdeAqui })
    .click();
  await expect(page).toHaveURL(/\?incidente=37\.230500,-3\.656000$/);
  await expect(filas(page)).toHaveCount(5);
  await expect(hoja(page)).toContainText(T.incidente.desdePuntoMarcado);
});

// docs/19 RV-57: al arrancar con sesión de Google se borraban todos los parámetros de la dirección.
test('jefatura recarga /?incidente=… y el incidente sigue abierto (RV-57)', async ({ page }) => {
  await conGoogle(page, 'jefa@example.org');
  await simularTablas(page, { v_puntos_activos: CERCA, config: [] });
  await page.route(`${SUPABASE_PRUEBAS}/rest/v1/rpc/fn_es_admin`, (r) =>
    r.fulfill({ contentType: 'application/json', body: 'true' }),
  );
  await page.goto('/?incidente=37.230500,-3.656000');
  await expect(hoja(page)).toBeVisible();
  await expect(filas(page).first()).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(/\?incidente=37\.230500,-3\.656000/);
  await expect(hoja(page)).toBeVisible();
  await expect(hoja(page)).toContainText(T.incidente.desdePuntoMarcado);
});
