// docs/33 RV-336: los mapas del panel dibujan Barro y No funciona con el mismo marcador que el mapa del
// voluntario (06 §4.3, RV-319): el Inventario en modo mapa y el minimapa del detalle de la Cola. Se
// compara lo que dibuja el navegador en los dos sitios con los mismos puntos.

import { expect, test, type Page } from '@playwright/test';
import { T } from '../src/lib/textos.ts';
import type { Punto } from '../src/tipos/punto.ts';
import { SUPABASE_PRUEBAS } from '../playwright.config.ts';
import { conGoogle, conSesion, simularTablas } from './ayudas.ts';
import { LISTADO, PUNTOS } from './puntos.ts';

// Todos los radios a 11 (la escala de config, la misma en el móvil y en la vista): así se ven al zoom
// con el que se abre cada mapa (06 §4.4). Aquí se mira el dibujo, no el tamaño.
const ESCALA = [11, 11, 11, 11, 11];
const CONFIG = { meses_revision: 12, escala_radios: ESCALA };

const punto = (base: Punto, i: number, codigo: string, caudal: Punto['caudal']): Punto => ({
  ...base,
  id: `5eed0000-0000-4000-8000-00000000009${i}`,
  codigo,
  caudal,
  descripcion_fallo: '[PRUEBA] Tapa soldada',
  radio_px: 11,
  revision_caducada: false,
  fecha_ultima_revision: new Date().toISOString().slice(0, 10),
  lat: 37.2318 + i * 0.0004,
  lng: -3.6545,
});

const LOS_CUATRO = [
  punto(PUNTOS[0], 1, 'HID-9091', 'barro'),
  punto(PUNTOS[0], 2, 'HID-9092', 'no_funciona'),
  punto(PUNTOS[8], 3, 'BOC-9093', 'barro'),
  punto(PUNTOS[8], 4, 'BOC-9094', 'no_funciona'),
];
const [PROPIO] = LOS_CUATRO;

/** El móvil del voluntario y la sesión de jefatura en la misma página, con los cuatro puntos. */
async function preparar(page: Page) {
  await conSesion(page);
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
    if (nombre === 'fn_es_admin') return json(true);
    if (nombre === 'fn_listar_puntos') return json({ ...LISTADO, puntos: LOS_CUATRO, config: CONFIG });
    return json(null);
  });
}

/** El SVG de cada marcador de un mapa, por su código (el `title` del marcador). */
const svgsPorCodigo = (mapa: ReturnType<Page['locator']>) =>
  mapa
    .locator('.leaflet-marker-icon.marcador[title]')
    .evaluateAll((l) => Object.fromEntries(l.map((e) => [e.getAttribute('title'), e.querySelector('svg')?.outerHTML])));

/** Los marcadores del mapa del voluntario, cuando están los cuatro. */
async function delVoluntario(page: Page): Promise<Record<string, string>> {
  await page.goto('/');
  const mapa = page.getByTestId('mapa');
  await expect.poll(async () => Object.keys(await svgsPorCodigo(mapa)).length).toBe(LOS_CUATRO.length);
  return (await svgsPorCodigo(mapa)) as Record<string, string>;
}

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

test('Inventario en mapa: Barro y No funciona con el marcador del mapa del voluntario (RV-336)', async ({ page }) => {
  await preparar(page);
  const voluntario = await delVoluntario(page);

  await page.goto('/admin/inventario');
  await page.getByRole('radio', { name: T.panelInventario.mapa }).click();
  const mapa = page.getByTestId('mapa');
  await expect.poll(async () => svgsPorCodigo(mapa)).toEqual(voluntario);
});

test('Cola, minimapa del detalle: el punto y los de alrededor con el marcador del voluntario (RV-336)', async ({
  page,
}) => {
  await preparar(page);
  await conPropuesta(page);
  const voluntario = await delVoluntario(page);

  const mapa = await abrirDetalle(page);
  // Los de alrededor llevan su código; el de la propuesta, no (va sin atenuar y sin title).
  const { [PROPIO.codigo]: propio, ...alrededor } = voluntario;
  await expect.poll(async () => svgsPorCodigo(mapa)).toEqual(alrededor);
  const todos = () => mapa.locator('.leaflet-marker-icon.marcador svg').evaluateAll((l) => l.map((e) => e.outerHTML));
  await expect.poll(todos).toContain(propio);
});

// En Tailwind 4, `max-[1099px]` es "< 1.099 px": a 1.099 px exactos no valía ni la medida de tableta
// ni la de escritorio (`min-[1100px]`). El corte de tableta es `max-[1100px]`, "< 1.100 px". Se miran
// los dos lados del corte.
for (const [ancho, alturaMapa, anchoEditar, botonesAlAncho] of [
  [1099, 280, 500, true],
  [1100, 300, 540, false],
] as const) {
  test.describe(`a ${ancho} px (DEC-158, DEC-169)`, () => {
    test.skip(({ isMobile }) => isMobile, 'una ventana de escritorio');
    test.use({ viewport: { width: ancho, height: 900 } });

    test(`el mapa del detalle mide ${alturaMapa} px y Editar ${anchoEditar} px`, async ({ page }) => {
      await preparar(page);
      await conPropuesta(page);
      const mapa = await abrirDetalle(page);
      expect(Math.round((await mapa.boundingBox())!.height)).toBe(alturaMapa);
      // Por debajo del corte, los botones de la barra de acciones se reparten el ancho.
      const aprobar = page.getByRole('button', { name: T.panelCola.aprobar, exact: true });
      await expect(aprobar).toHaveCSS('flex-grow', botonesAlAncho ? '1' : '0');

      await page.goto('/admin/inventario');
      const fila = page.getByRole('row').filter({ hasText: PROPIO.codigo });
      await fila.getByRole('button', { name: T.panel.editar }).click();
      expect(Math.round((await page.getByRole('dialog').boundingBox())!.width)).toBe(anchoEditar);
    });
  });
}
