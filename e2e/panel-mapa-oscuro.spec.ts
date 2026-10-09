// docs/33 RV-332 (D13): los botones de zoom del mapa del detalle de la Cola siguen al modo oscuro
// (--control-mapa, --texto, --linea), en vez del blanco de Leaflet. Contra un Supabase simulado.

import { expect, test, type Page } from '@playwright/test';
import { SUPABASE_PRUEBAS } from '../playwright.config.ts';
import { conGoogle, simularTablas } from './ayudas.ts';
import { PUNTOS } from './puntos.ts';

const P0 = PUNTOS[0]!;

const PROPUESTA = {
  id: 'm1',
  operacion: 'estado',
  estado: 'pendiente',
  creada_en: new Date(Date.now() - 3_600_000).toISOString(),
  autor_nombre: 'Prueba',
  autor_apellido: 'Mapa',
  dispositivo_id: 'd1',
  punto_id: P0.id,
  codigo: P0.codigo,
  datos: { caudal: 'regular' },
  antes: { caudal: P0.caudal },
  tipo_actual: null,
  foto_path: null,
  foto_path_actual: null,
  direccion_sugerida: null,
  direccion_actual: P0.direccion,
  lat: null,
  lng: null,
  despues: null,
  origen_ubicacion: null,
  precision_gps_m: null,
  distancia_gps_m: null,
  distancia_exif_m: null,
  fuera_de_zona: false,
  meses_desde_revision: null,
  duplicado_de: null,
  distancia_duplicado_m: null,
  codigo_duplicado: null,
  otra_medida: false,
  desactualizada: false,
  nucleo: 'Albolote',
  punto_actualizado_en: null,
  punto: null,
  punto_lat: P0.lat,
  punto_lng: P0.lng,
};

async function prepararPanel(page: Page) {
  await conGoogle(page, 'jefe@example.org');
  await simularTablas(page, {
    v_puntos_activos: PUNTOS,
    v_cola_revision: [PROPUESTA],
    propuestas: [PROPUESTA],
    puntos: [],
    config: [],
  });
  await page.route(`${SUPABASE_PRUEBAS}/rest/v1/rpc/*`, (route) => {
    const nombre = new URL(route.request().url()).pathname.split('/').pop()!;
    if (nombre === 'fn_es_admin') return route.fulfill({ contentType: 'application/json', body: 'true' });
    return route.abort('connectionrefused');
  });
}

/** Los colores de un botón de zoom y los tokens de la página, ya resueltos por el navegador. */
async function colores(page: Page) {
  const zoom = page.getByTestId('minimapa-propuesta').locator('.leaflet-bar a').first();
  await expect(zoom).toBeVisible();
  return zoom.evaluate((a) => {
    const muestra = document.createElement('i');
    muestra.style.cssText = 'background-color:var(--control-mapa);color:var(--texto);border-color:var(--linea)';
    document.body.append(muestra);
    const t = getComputedStyle(muestra);
    const tokens = { fondo: t.backgroundColor, texto: t.color, linea: t.borderTopColor };
    muestra.remove();
    const c = getComputedStyle(a);
    return { tokens, fondo: c.backgroundColor, texto: c.color, linea: c.borderBottomColor };
  });
}

test.describe('RV-332: zoom del mapa del panel', () => {
  test.skip(({ isMobile }) => !!isMobile, 'basta con un tamaño: es CSS');

  for (const modo of ['sistema', 'forzado'] as const) {
    test(`en oscuro (${modo}) usa los tokens del modo oscuro`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      if (modo === 'sistema') await page.emulateMedia({ colorScheme: 'dark' });
      else
        await page.addInitScript(() => {
          document.documentElement.dataset.tema = 'oscuro';
        });
      await prepararPanel(page);
      await page.goto('/admin/cola?p=m1');
      if (modo === 'forzado') await page.evaluate(() => (document.documentElement.dataset.tema = 'oscuro'));
      const c = await colores(page);
      // El fondo oscuro de los controles (rgba(20, 29, 45, 0.94)), no el blanco de Leaflet.
      expect(c.fondo).toBe(c.tokens.fondo);
      expect(c.fondo).not.toBe('rgb(255, 255, 255)');
      expect(c.texto).toBe(c.tokens.texto);
      expect(c.linea).toBe(c.tokens.linea);
    });
  }

  for (const modo of ['sistema', 'forzado sobre un sistema oscuro'] as const) {
    test(`en claro (${modo}) sigue blanco, con el texto y la línea de la paleta`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.emulateMedia({ colorScheme: modo === 'sistema' ? 'light' : 'dark' });
      await prepararPanel(page);
      await page.goto('/admin/cola?p=m1');
      if (modo !== 'sistema') await page.evaluate(() => (document.documentElement.dataset.tema = 'claro'));
      const c = await colores(page);
      expect(c.fondo).toBe('rgb(255, 255, 255)');
      expect(c.texto).toBe(c.tokens.texto);
      expect(c.linea).toBe(c.tokens.linea);
    });
  }
});
