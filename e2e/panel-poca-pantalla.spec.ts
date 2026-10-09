// docs/33 RV-331 (U14): el panel con poca pantalla (zoom 200 % de 1440 × 900, o tableta) y la Cola sin
// el mapita de cada fila. Contra un Supabase simulado; nombres ficticios.

import { expect, test, type Page } from '@playwright/test';
import { T } from '../src/lib/textos.ts';
import { SUPABASE_PRUEBAS } from '../playwright.config.ts';
import { conGoogle, simularTablas } from './ayudas.ts';
import { PUNTOS } from './puntos.ts';

const hace = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

/** Nueve propuestas de estado o revisión, una por punto. */
const COLA = PUNTOS.slice(0, 9).map((p, i) => ({
  id: `u${i}`,
  operacion: i % 2 ? 'revision' : 'estado',
  estado: 'pendiente',
  creada_en: hace(i + 1),
  autor_nombre: 'Prueba',
  autor_apellido: `Número ${i}`,
  dispositivo_id: 'd1',
  punto_id: p.id,
  codigo: p.codigo,
  datos: i % 2 ? {} : { caudal: 'regular' },
  antes: i % 2 ? null : { caudal: p.caudal },
  tipo_actual: null,
  foto_path: null,
  foto_path_actual: null,
  direccion_sugerida: null,
  direccion_actual: p.direccion,
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
  punto_lat: p.lat,
  punto_lng: p.lng,
}));

async function prepararPanel(page: Page) {
  await conGoogle(page, 'jefe@example.org');
  await simularTablas(page, {
    v_puntos_activos: PUNTOS,
    v_cola_revision: COLA,
    propuestas: COLA,
    v_historial_revision: [],
    puntos: [],
    config: [],
  });
  await page.route(`${SUPABASE_PRUEBAS}/rest/v1/rpc/*`, (route) => {
    const nombre = new URL(route.request().url()).pathname.split('/').pop()!;
    if (nombre === 'fn_es_admin') return route.fulfill({ contentType: 'application/json', body: 'true' });
    return route.abort('connectionrefused');
  });
}

/** Cuántas filas de la cola se ven enteras, encima de la barra fija de abajo si la hay. */
function filasEnteras(page: Page) {
  return page.evaluate(() => {
    const barra = document.querySelector('[data-testid="barra-cola"]')?.getBoundingClientRect().top;
    const limite = Math.min(window.innerHeight, barra ?? Infinity);
    return [...document.querySelectorAll('[data-propuesta]')]
      .map((b) => b.closest('li')!.getBoundingClientRect())
      .filter((r) => r.top >= 0 && r.bottom <= limite + 0.5).length;
  });
}

test.describe('RV-331: panel con poca pantalla', () => {
  test.skip(({ isMobile }) => !!isMobile, 'cada test fija su ventana');

  test('a 720 × 450 (zoom 200 %) se ven al menos 4 propuestas', async ({ page }, info) => {
    await page.setViewportSize({ width: 720, height: 450 });
    await prepararPanel(page);
    await page.goto('/admin/cola');
    const lista = page.getByRole('region', { name: T.panelCola.colaRevision });
    await expect(lista.getByRole('listitem')).toHaveCount(COLA.length);
    expect(await filasEnteras(page)).toBeGreaterThanOrEqual(4);
    await info.attach('cola-720x450', { body: await page.screenshot(), contentType: 'image/png' });
  });

  test('por debajo de 800 px: buscador en la barra, menú ☰ y filtros en una línea', async ({ page }) => {
    await page.setViewportSize({ width: 720, height: 450 });
    await prepararPanel(page);
    await page.goto('/admin/cola');
    const cabecera = page.getByRole('banner');
    const buscador = cabecera.getByPlaceholder(T.panelCola.buscar);
    const menu = cabecera.getByRole('button', { name: T.panel.menu });
    // El buscador va en la misma línea que el menú, dentro de la barra.
    const [b, m] = [(await buscador.boundingBox())!, (await menu.boundingBox())!];
    expect(Math.abs(b.y + b.height / 2 - (m.y + m.height / 2))).toBeLessThanOrEqual(4);
    // "Ir al mapa" y "Cerrar sesión" no están a la vista hasta abrir el menú.
    await expect(page.getByRole('link', { name: T.jefatura.irAlMapa })).toBeHidden();
    await expect(page.getByRole('button', { name: T.panel.salir })).toBeHidden();
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    await menu.click();
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('link', { name: T.jefatura.irAlMapa })).toBeVisible();
    await expect(page.getByRole('button', { name: T.panel.salir })).toBeVisible();
    // Escape lo cierra y devuelve el foco al botón.
    await page.keyboard.press('Escape');
    await expect(page.getByRole('link', { name: T.jefatura.irAlMapa })).toBeHidden();
    await expect(menu).toBeFocused();

    // Los filtros: tres desplegables en una línea.
    const desplegables = [T.panelCola.filtroEstado, T.panelCola.filtroOperacion, T.panelCola.filtroNucleo].map((n) =>
      page.getByRole('combobox', { name: n }),
    );
    const cajas = await Promise.all(desplegables.map(async (d) => (await d.boundingBox())!));
    for (const c of cajas) expect(Math.abs(c.y - cajas[0]!.y)).toBeLessThanOrEqual(2);
    await expect(page.getByRole('radiogroup', { name: T.panelCola.filtroEstado })).toBeHidden();
    // El de estado funciona: Rechazadas deja la lista en solo lectura.
    await desplegables[0]!.selectOption('rechazada');
    await expect(page.getByText(T.panelCola.soloLectura)).toBeVisible();
  });

  for (const ancho of [800, 1440]) {
    test(`desde 800 px (a ${ancho}), la cabecera y los filtros de siempre`, async ({ page }) => {
      await page.setViewportSize({ width: ancho, height: 900 });
      await prepararPanel(page);
      await page.goto('/admin/cola');
      await expect(page.getByRole('link', { name: T.jefatura.irAlMapa })).toBeVisible();
      await expect(page.getByRole('button', { name: T.panel.salir })).toBeVisible();
      await expect(page.getByRole('button', { name: T.panel.menu })).toBeHidden();
      await expect(page.getByRole('radiogroup', { name: T.panelCola.filtroEstado })).toBeVisible();
      await expect(page.getByRole('combobox', { name: T.panelCola.filtroEstado })).toBeHidden();
    });
  }

  test('a 799 px ya es la cabecera compacta, sin las pastillas de estado', async ({ page }) => {
    await page.setViewportSize({ width: 799, height: 900 });
    await prepararPanel(page);
    await page.goto('/admin/cola');
    await expect(page.getByRole('button', { name: T.panel.menu })).toBeVisible();
    await expect(page.getByRole('combobox', { name: T.panelCola.filtroEstado })).toBeVisible();
    await expect(page.getByRole('radiogroup', { name: T.panelCola.filtroEstado })).toBeHidden();
    await expect(page.getByRole('link', { name: T.jefatura.irAlMapa })).toBeHidden();
  });

  test('el menú ☰ se cierra al tocar fuera y al salir con el tabulador', async ({ page }) => {
    await page.setViewportSize({ width: 720, height: 450 });
    await prepararPanel(page);
    await page.goto('/admin/cola');
    const menu = page.getByRole('button', { name: T.panel.menu });
    await menu.click();
    await expect(page.getByRole('link', { name: T.jefatura.irAlMapa })).toBeFocused();
    // Un toque en la franja de arriba, que no hace nada: solo cierra el menú.
    await page.mouse.click(360, 6);
    await expect(menu).toHaveAttribute('aria-expanded', 'false');

    await menu.click();
    // Del primer enlace, al botón de salir y fuera del menú.
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: T.panel.salir })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('link', { name: T.jefatura.irAlMapa })).toBeHidden();
  });

  test('«Cerrar sesión» desde el menú ☰ sale del panel y olvida los temas de avisos de jefatura', async ({ page }) => {
    await page.setViewportSize({ width: 720, height: 450 });
    await prepararPanel(page);
    await page.goto('/admin/cola');
    await page.evaluate(() => localStorage.setItem('hidrantes.push_jefatura', '["cola"]'));
    await page.getByRole('button', { name: T.panel.menu }).click();
    await page.getByRole('button', { name: T.panel.salir }).click();
    await expect(page.getByLabel(T.entrada.cifra(1))).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('hidrantes.push_jefatura'))).toBeNull();
  });

  test('cambiar de estado en el desplegable vacía la selección, como las pastillas', async ({ page }) => {
    await page.setViewportSize({ width: 720, height: 450 });
    await prepararPanel(page);
    await page.goto('/admin/cola');
    const lista = page.getByRole('region', { name: T.panelCola.colaRevision });
    await lista.getByRole('checkbox').first().check();
    await expect(page.getByTestId('barra-cola')).toContainText(T.panelCola.seleccionadas(1));
    const estado = page.getByRole('combobox', { name: T.panelCola.filtroEstado });
    await estado.selectOption('rechazada');
    await expect(page.getByText(T.panelCola.soloLectura)).toBeVisible();
    await estado.selectOption('pendiente');
    await expect(page.getByTestId('barra-cola')).toContainText(T.panelCola.tocaUna);
  });

  for (const [ancho, alto] of [
    [412, 915],
    [720, 450],
    [820, 1180],
    [1440, 900],
  ] as const) {
    test(`sin mapita en las filas de la Cola a ${ancho} px; el mapa sigue en el detalle`, async ({ page }) => {
      await page.setViewportSize({ width: ancho, height: alto });
      await prepararPanel(page);
      await page.goto('/admin/cola');
      const lista = page.getByRole('region', { name: T.panelCola.colaRevision });
      await expect(lista.getByRole('listitem').first()).toBeVisible();
      await expect(page.getByTestId('mapita')).toHaveCount(0);
      await lista.getByRole('button', { name: new RegExp(COLA[1]!.codigo) }).click();
      await expect(page.getByRole('article').getByTestId('minimapa-propuesta')).toBeVisible();
    });
  }
});
