// Fase 5: mapa, lista, búsqueda, ficha, capas, modo sin cobertura (FR-60–FR-71, FR-80–FR-81).

import { expect, test, type Page } from '@playwright/test';
import { T } from '../src/lib/textos.ts';
import { conSesion, simularRpc } from './ayudas.ts';
import { LISTADO, PUNTOS } from './puntos.ts';

async function abrir(page: Page, ruta = '/') {
  await conSesion(page);
  await simularRpc(page, { fn_listar_puntos: LISTADO, fn_registrar_error: null });
  await page.goto('/');
  await expect(page.getByText(T.mapa.nPuntos(PUNTOS.length), { exact: false })).toBeVisible();
  if (ruta !== '/') await page.goto(ruta);
}

/** Un botón con texto (resultado de búsqueda o fila de la lista), nunca un marcador del mapa. */
const boton = (page: Page, texto: string) => page.locator('button').filter({ hasText: texto }).first();

test.describe('mapa y lista', () => {
  test('sincroniza, pinta los marcadores y dice cuándo (FR-60, FR-80)', async ({ page }) => {
    await abrir(page);
    await expect(page.getByText(/Sincronizado hace/)).toBeVisible();
    // Al encuadre inicial (zoom ≤ 13) solo se ven R1 y R2 (06 §4.4).
    const visibles = await page.locator('.marcador').count();
    expect(visibles).toBeGreaterThan(0);
    expect(visibles).toBeLessThan(PUNTOS.length);
    await expect(page.getByRole('region', { name: T.mapa.leyenda })).toContainText(T.mapa.leyendaTamano);
  });

  test('buscar por calle abre la ficha, sin autores ni historial (FR-66, FR-69)', async ({ page }) => {
    await abrir(page);
    const buscador = page.getByRole('searchbox', { name: T.mapa.buscar }).first();
    await buscador.fill('real 14');
    await boton(page, 'HID-9001').click();
    await expect(page).toHaveURL(/\?p=/);
    const ficha = page.getByRole('article');
    await expect(ficha).toContainText('Calle Real 14');
    await expect(ficha).toContainText(T.formulario.bueno);
    await expect(ficha).toContainText(T.formato.mm(100));
    await expect(page.getByRole('link', { name: T.ficha.comoLlegar })).toHaveAttribute('href', /37\.2308/);
    await expect(page.getByRole('button', { name: T.ficha.proponerCambio })).toBeVisible();
  });

  test('lista: filtros, estados vacíos y paso al mapa (FR-68)', async ({ page }) => {
    await abrir(page, '/lista');
    await page.getByRole('radio', { name: T.mapa.bocas }).click();
    await expect(page.getByRole('button', { name: /BOC-90/ })).toHaveCount(4);
    await page.getByRole('radio', { name: T.mapa.sinRevisar }).click();
    await expect(page.getByRole('button', { name: /HID-9005/ })).toBeVisible();
    await page.getByRole('searchbox', { name: T.mapa.buscar }).fill('no existe');
    await expect(page.getByText(T.mapa.busquedaVacia)).toBeVisible();
    await page.getByRole('searchbox', { name: T.mapa.buscar }).fill('');
    await boton(page, 'HID-9005').click();
    await expect(page.getByRole('article')).toContainText(T.ficha.caducada);
  });

  test('capas: elegir satélite se recuerda (FR-63)', async ({ page }) => {
    await abrir(page);
    await page.getByRole('button', { name: T.mapa.capas }).click();
    await page.getByRole('radio', { name: new RegExp(T.mapa.satelitePnoa.replace(/[()]/g, '\\$&')) }).click();
    await expect(page.getByText(/Instituto Geográfico Nacional/)).toBeVisible();
    await page.reload();
    await expect(page.getByText(/Instituto Geográfico Nacional/)).toBeVisible();
  });
});

test.describe('sin cobertura (criterio de salida)', () => {
  test('con el mapa base descargado, mapa, búsqueda y lista funcionan en modo avión', async ({ page, context }) => {
    await abrir(page, '/ajustes');
    // Se descarga solo al arrancar con una conexión que lo permite (FR-81).
    await expect(page.getByText(/Descargado · /)).toBeVisible({ timeout: 20_000 });
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await expect(page.getByText(/Descargado · /)).toBeVisible();

    await context.setOffline(true);
    await page.goto('/');
    await expect(page.getByText(/Sin cobertura · datos de/)).toBeVisible();
    await expect(page.locator('.marcador').first()).toBeVisible();
    // El mapa base se dibuja desde el móvil: hay teselas de lienzo pintadas.
    await expect(page.locator('.leaflet-tile-container canvas, canvas.leaflet-tile').first()).toBeVisible();
    await expect(page.getByText(T.mapa.mapaNoDescargado)).toHaveCount(0);

    await page.getByRole('searchbox', { name: T.mapa.buscar }).first().fill('HID-9002');
    await boton(page, 'HID-9002').click();
    await expect(page.getByRole('article')).toContainText(T.ficha.sinDireccion);

    await page.goto('/lista');
    await expect(page.getByRole('button', { name: /HID-9001/ })).toBeVisible();

    // Una capa en línea sin cobertura sale en gris con el motivo.
    await page.goto('/');
    await page.getByRole('button', { name: T.mapa.capas }).click();
    await expect(
      page.getByRole('radio', { name: new RegExp(T.mapa.calleOsm.replace(/[()]/g, '\\$&')) }),
    ).toBeDisabled();
    await context.setOffline(false);
  });

  test('sin mapa base y sin cobertura, el mapa lo avisa en vez de quedarse en blanco (FR-81)', async ({
    page,
    context,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'connection', { value: { type: 'cellular', saveData: false } });
    });
    await abrir(page);
    await context.setOffline(true);
    await expect(page.getByText(T.mapa.mapaNoDescargado)).toBeVisible();
    await context.setOffline(false);
  });
});

test.describe('zoom (#136)', () => {
  // El ZOOM_MAX de src/lib/capas.ts. Aquí va el número y no el import porque este archivo se compila
  // con la resolución de Node y capas.ts importa sin extensión; capas.test.ts fija que sigan siendo
  // el mismo 21.
  const TOPE = 21;
  // Una tesela de 1×1 en JPEG: lo que se comprueba es que la capa sigue puesta al tope de zoom, no
  // lo que dibuja el IGN. Así el test no depende de www.ign.es.
  const TESELA = Buffer.from(
    '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAP//////////////////////////////////////////////////////////' +
      '////////////////////////2wBDAf//////////////////////////////////////////////////////////' +
      '///////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEA' +
      'AAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhED' +
      'EQA/AKAAAf/Z',
    'base64',
  );

  async function conSatelite(page: Page) {
    await page.route('https://www.ign.es/**', (r) => r.fulfill({ contentType: 'image/jpeg', body: TESELA }));
    await abrir(page);
    await page.getByRole('button', { name: T.mapa.capas }).click();
    await page.getByRole('radio', { name: new RegExp(T.mapa.satelitePnoa.replace(/[()]/g, '\\$&')) }).click();
    await expect(page.getByText(/Instituto Geográfico Nacional/)).toBeVisible();
  }

  const zoomGuardado = (page: Page) =>
    page.evaluate(() => (JSON.parse(localStorage.getItem('hidrantes.vista') ?? 'null')?.zoom ?? 0) as number);

  test('se puede acercar hasta el tope y el satélite no se queda en blanco', async ({ page }) => {
    await conSatelite(page);
    const acercar = page.getByRole('button', { name: T.mapa.acercar });
    // Se pulsa dentro del poll porque Leaflet ignora los clics mientras dura su animación de zoom.
    await expect
      .poll(
        async () => {
          await acercar.click();
          return zoomGuardado(page);
        },
        { timeout: 20_000, intervals: [250] },
      )
      .toBe(TOPE);
    // Y al tope sigue habiendo teselas: la capa no ha desaparecido (que era el fondo blanco).
    const teselas = page.locator('img.leaflet-tile');
    await expect.poll(() => teselas.count()).toBeGreaterThan(0);
    // Las pide del último nivel que el IGN tiene (z20) y las amplía: a z21 responde 400.
    await expect(teselas.first()).toHaveAttribute('src', /tilematrix=20&/);
    // Más allá del tope no se pasa, por mucho que se insista.
    await acercar.click();
    await acercar.click();
    expect(await zoomGuardado(page)).toBe(TOPE);
  });
});

test.describe('alta con pulsación larga (#138)', () => {
  /** Lo que hace un dedo que se queda quieto: pointerdown, esperar, pointerup. */
  async function mantenerPulsado(page: Page, x: number, y: number, ms = 700) {
    await page.locator('[data-testid="mapa"]').dispatchEvent('pointerdown', {
      clientX: x,
      clientY: y,
      pointerType: 'touch',
      isPrimary: true,
    });
    await page.waitForTimeout(ms);
    // Si la pulsación ya ha abierto el alta, el mapa ya no está: levantar el dedo sobra.
    await page
      .locator('[data-testid="mapa"]')
      .dispatchEvent('pointerup', { clientX: x, clientY: y }, { timeout: 1000 })
      .catch(() => {});
  }

  test('mantener pulsado el mapa abre el alta con el pin ahí mismo', async ({ page }) => {
    await abrir(page);
    const caja = (await page.locator('[data-testid="mapa"]').boundingBox())!;
    await mantenerPulsado(page, caja.x + caja.width / 2, caja.y + caja.height / 2);

    await expect(page).toHaveURL(/\/proponer\/alta\?lat=-?\d+\.\d{6}&lng=-?\d+\.\d{6}/);
    await expect(page.getByTestId('selector-pin')).toBeVisible();
    // Y el punto es el del centro del mapa, que es donde se pulsó.
    const url = new URL(page.url());
    expect(Number(url.searchParams.get('lat'))).toBeGreaterThan(37);
    expect(Number(url.searchParams.get('lng'))).toBeLessThan(-3);
  });

  test('un toque corto no abre nada: eso es mirar el mapa', async ({ page }) => {
    await abrir(page);
    const caja = (await page.locator('[data-testid="mapa"]').boundingBox())!;
    await mantenerPulsado(page, caja.x + caja.width / 2, caja.y + caja.height / 2, 150);
    await page.waitForTimeout(600);
    await expect(page).toHaveURL(/\/$|\/\?/);
  });

  test('sobre un marcador no: ahí lo que toca es abrir la ficha', async ({ page }) => {
    await abrir(page);
    const marcador = page.locator('.marcador').first();
    const caja = (await marcador.boundingBox())!;
    await marcador.dispatchEvent('pointerdown', {
      clientX: caja.x + caja.width / 2,
      clientY: caja.y + caja.height / 2,
      pointerType: 'touch',
      isPrimary: true,
    });
    await page.waitForTimeout(900);
    await expect(page).not.toHaveURL(/\/proponer/);
  });

  test('en escritorio, el clic derecho hace lo mismo', async ({ page }) => {
    await abrir(page);
    const caja = (await page.locator('[data-testid="mapa"]').boundingBox())!;
    await page.mouse.click(caja.x + caja.width / 2, caja.y + caja.height / 2, { button: 'right' });
    await expect(page).toHaveURL(/\/proponer\/alta\?lat=/);
  });
});
