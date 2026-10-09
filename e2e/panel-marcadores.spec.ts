// docs/33 RV-336: los mapas del panel dibujan Barro y No funciona con el mismo marcador que el mapa del
// voluntario (06 §4.3, RV-319): el Inventario en modo mapa y el minimapa del detalle de la Cola.

import { expect, test, type Page } from '@playwright/test';
import { T } from '../src/lib/textos.ts';
import { svgMarcador } from '../src/lib/simbologia.ts';
import type { Punto } from '../src/tipos/punto.ts';
import { SUPABASE_PRUEBAS } from '../playwright.config.ts';
import { conGoogle, simularTablas } from './ayudas.ts';
import { PUNTOS } from './puntos.ts';

// Con el radio mayor, para que se vean al zoom con el que se abre el mapa (06 §4.4): aquí se mira el
// dibujo, no el tamaño.
const conRadio = (p: Punto, codigo: string, id: string, caudal: Punto['caudal']): Punto => ({
  ...p,
  id,
  codigo,
  caudal,
  radio_px: 11,
  revision_caducada: false,
});

const BARRO_HID = conRadio(PUNTOS[0], 'HID-9091', '5eed0000-0000-4000-8000-000000000091', 'barro');
const NF_HID = conRadio(PUNTOS[0], 'HID-9092', '5eed0000-0000-4000-8000-000000000092', 'no_funciona');
const BARRO_BOC = conRadio(PUNTOS[8], 'BOC-9093', '5eed0000-0000-4000-8000-000000000093', 'barro');
const NF_BOC = conRadio(PUNTOS[8], 'BOC-9094', '5eed0000-0000-4000-8000-000000000094', 'no_funciona');
const LOS_CUATRO = [BARRO_HID, NF_HID, BARRO_BOC, NF_BOC].map((p, i) => ({
  ...p,
  lat: 37.2318 + i * 0.0004,
  lng: -3.6545,
}));

async function prepararPanel(page: Page) {
  await conGoogle(page, 'jefe@example.org');
  await simularTablas(page, {
    v_puntos_activos: LOS_CUATRO,
    v_cola_revision: [],
    v_registro: [],
    puntos: [],
    propuestas: [],
    config: [{ valor: 30 }],
  });
  await page.route(`${SUPABASE_PRUEBAS}/rest/v1/rpc/*`, async (route) => {
    const nombre = new URL(route.request().url()).pathname.split('/').pop()!;
    const json = (d: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(d) });
    return nombre === 'fn_es_admin' ? json(true) : json(null);
  });
}

/** El SVG del marcador como lo deja el navegador, para comparar sin depender de comillas ni espacios. */
const comoHtml = (page: Page, svg: string) =>
  page.evaluate((s) => {
    const d = document.createElement('div');
    d.innerHTML = s;
    return d.innerHTML;
  }, svg);

test('Inventario en mapa: Barro y No funciona con el marcador del mapa del voluntario (RV-336)', async ({ page }) => {
  await prepararPanel(page);
  await page.goto('/admin/inventario');
  await page.getByRole('radio', { name: T.panelInventario.mapa }).click();
  await expect(page.getByTestId('mapa')).toBeVisible();
  for (const p of LOS_CUATRO) {
    const marcador = page.locator(`.leaflet-marker-icon.marcador[title="${p.codigo}"]`);
    await expect(marcador, p.codigo).toBeVisible();
    const esperado = await comoHtml(page, svgMarcador(p));
    expect(await marcador.innerHTML(), p.codigo).toBe(esperado);
  }
});

const [PROPIO] = LOS_CUATRO;

/** Una revisión pendiente sobre el primero de los cuatro, para abrir el detalle de la Cola. */
const conPropuesta = (page: Page) =>
  page.route(/\/rest\/v1\/v_cola_revision\b/, (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'm1',
          estado: 'pendiente',
          operacion: 'revision',
          creada_en: new Date(Date.now() - 3_600_000).toISOString(),
          punto_id: PROPIO.id,
          codigo: PROPIO.codigo,
          datos: {},
          autor_nombre: 'Sara',
          autor_apellido: 'Ruiz',
          dispositivo_id: 'd1',
          antes: null,
          despues: null,
          lat: null,
          lng: null,
          fuera_de_zona: false,
          otra_medida: false,
          desactualizada: false,
          nucleo: 'Albolote',
          punto: {
            codigo: PROPIO.codigo,
            tipo: PROPIO.tipo,
            diametro_mm: PROPIO.diametro_mm,
            caudal: PROPIO.caudal,
            racor: PROPIO.racor,
            descripcion: PROPIO.descripcion,
            descripcion_fallo: PROPIO.descripcion_fallo,
            direccion: PROPIO.direccion,
            nucleo: PROPIO.nucleo,
            fecha_ultima_revision: PROPIO.fecha_ultima_revision,
            foto_path: null,
            foto_sitio_path: null,
          },
          punto_lat: PROPIO.lat,
          punto_lng: PROPIO.lng,
        },
      ]),
    }),
  );

/** Abre el detalle de la Cola. Por debajo de 1.100 px la cola y el detalle son dos pantallas. */
async function abrirDetalle(page: Page) {
  await page.goto('/admin');
  const mapa = page.getByTestId('minimapa-propuesta').first();
  if ((page.viewportSize()?.width ?? 0) < 1100)
    await page.getByRole('button', { name: new RegExp(PROPIO.codigo) }).click();
  await expect(mapa).toBeVisible();
  return mapa;
}

test('Cola, minimapa del detalle: el punto y los de alrededor con el marcador nuevo (RV-336)', async ({ page }) => {
  await prepararPanel(page);
  await conPropuesta(page);
  const [propio, ...alrededor] = LOS_CUATRO;
  const mapa = await abrirDetalle(page);
  // Los marcadores, como SVG del navegador: el del punto, sin atenuar; los de alrededor, dentro de su
  // capa de opacidad. El dibujo es el mismo.
  const svgs = () => mapa.locator('.leaflet-marker-icon.marcador svg').evaluateAll((l) => l.map((e) => e.outerHTML));
  for (const p of [propio, ...alrededor]) {
    const esperado = await comoHtml(page, svgMarcador(p));
    await expect.poll(svgs, { message: p.codigo }).toContain(esperado);
  }
});

// En Tailwind 4, `max-[1099px]` es "< 1.099 px": a 1.099 px exactos no valía ni la medida de tableta
// ni la de escritorio (`min-[1100px]`). El corte de tableta es `max-[1100px]`, "< 1.100 px".
test.describe('a 1.099 px, la medida de tableta (DEC-158, DEC-169)', () => {
  test.skip(({ isMobile }) => isMobile, 'una ventana de escritorio');
  test.use({ viewport: { width: 1099, height: 900 } });

  test('el mapa del detalle mide 280 px y Editar 500 px', async ({ page }) => {
    await prepararPanel(page);
    await conPropuesta(page);
    const mapa = await abrirDetalle(page);
    expect((await mapa.boundingBox())?.height).toBe(280);

    await page.goto('/admin/inventario');
    const fila = page.getByRole('row').filter({ hasText: PROPIO.codigo });
    await fila.getByRole('button', { name: T.panel.editar }).click();
    expect((await page.getByRole('dialog').boundingBox())?.width).toBe(500);
  });
});
