// docs/28 RV-116 (#454): en el móvil, Registro y Papelera caben a lo ancho. Por debajo de md las filas
// de Registro se apilan, como en Inventario; desde md, la tabla. La pestaña Voluntarios ya no existe
// (docs/29 RV-122, DEC-167). Todos los datos son simulados (repositorio público: nada de nombres reales).

import { AxeBuilder } from '@axe-core/playwright';
import type { NodeResult, Result } from 'axe-core';
import { expect, test, type Page } from '@playwright/test';
import { T } from '../src/lib/textos.ts';
import { SUPABASE_PRUEBAS } from '../playwright.config.ts';
import { conGoogle, simularTablas, filasRegistro, filtrarPor } from './ayudas.ts';
import { PUNTOS } from './puntos.ts';

test.describe.configure({ timeout: 60_000 });
// Con varios workers y la máquina cargada, la primera lectura del panel puede pasar de 5 s.
const CARGA = 15_000;

const hace = (horas: number) => new Date(Date.now() - horas * 3_600_000).toISOString();

const REGISTRO = Array.from({ length: 6 }, (_, i) => ({
  id: i + 1,
  momento: hace(i * 7),
  actor: i % 2 ? 'jefatura-de-pruebas-con-correo-largo@example.org' : 'Voluntario de Pruebas Apellidolargo',
  es_admin: i % 2 === 1,
  accion: i % 2 ? 'aprobacion_con_correcciones' : 'propuesta_creada',
  codigo: `HID-00${i + 1}`,
  resumen: 'Caudal de bueno a regular · diámetro de 80 a 100 mm · dirección corregida a mano por jefatura',
  antes: null,
  despues: null,
}));

const PAPELERA = [
  { id: 'b1', codigo: 'BOC-0042', tipo: 'boca_riego', diametro_mm: 45, borrado_en: hace(48) },
  { id: 'b2', codigo: 'HID-0107', tipo: 'hidrante', diametro_mm: 100, borrado_en: hace(500) },
  // docs/38 RV-508: a este le queda un día.
  { id: 'b3', codigo: 'HID-0108', tipo: 'hidrante', diametro_mm: 80, borrado_en: hace(29 * 24 + 2) },
];

async function prepararPanel(page: Page) {
  const errores: string[] = [];
  await conGoogle(page, 'jefatura@example.org');
  await simularTablas(page, {
    v_puntos_activos: PUNTOS,
    v_cola_revision: [],
    propuestas: [],
    puntos: PAPELERA,
    v_registro: REGISTRO,
    config: [{ clave: 'dias_papelera', valor: 30 }],
  });
  await page.route(`${SUPABASE_PRUEBAS}/rest/v1/rpc/*`, (route) => {
    const nombre = new URL(route.request().url()).pathname.split('/').pop()!;
    const json = (d: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(d) });
    if (nombre === 'fn_es_admin') return json(true);
    if (nombre === 'fn_registrar_error') {
      errores.push(nombre);
      return json(null);
    }
    return route.abort('connectionrefused');
  });
  // Los errores salen por /api/error desde RV-148: se cuentan también ahí.
  await page.route('**/api/error', (route) => {
    errores.push(`/api/error ${route.request().postData() ?? ''}`);
    return route.fulfill({ status: 204 });
  });
  // Con datos móviles, el mapa base no se descarga solo: aquí no se mide eso, y una descarga cortada
  // por el page.goto del test se anotaría como error.
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'connection', {
      value: { type: 'cellular', saveData: false },
      configurable: true,
    }),
  );
  // Una lectura que falla deja la pestaña en «Reintentar» y el test mediría una pantalla vacía. Los
  // errores se mandan después, sin esperar: se mira cuando la red está quieta.
  return {
    sinErrores: async () => {
      await page.waitForLoadState('networkidle');
      expect(errores, 'errores registrados por el panel').toEqual([]);
    },
  };
}

/** Lo que se sale a lo ancho: la página y cada caja con desplazamiento propio. */
async function desbordes(page: Page) {
  return page.evaluate(() => {
    const fuera: string[] = [];
    const doc = document.documentElement;
    if (doc.scrollWidth > doc.clientWidth + 1) fuera.push(`página ${doc.scrollWidth} > ${doc.clientWidth}`);
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      const { overflowX } = getComputedStyle(el);
      if (overflowX !== 'auto' && overflowX !== 'scroll') continue;
      if (el.scrollWidth > el.clientWidth + 1) {
        fuera.push(
          `${el.tagName.toLowerCase()}.${el.className.split(' ').slice(0, 3).join('.')} ${el.scrollWidth} > ${el.clientWidth}`,
        );
      }
    }
    // Y lo que se corta sin desplazamiento: ninguna celda acaba fuera de la pantalla.
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('td, th, [role="cell"]'))) {
      const caja = el.getBoundingClientRect();
      if (caja.width && caja.right > window.innerWidth + 1) {
        fuera.push(`celda «${el.textContent?.slice(0, 30)}» acaba en ${Math.round(caja.right)}`);
      }
    }
    return fuera;
  });
}

async function auditar(page: Page, contexto: string) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const resumen = violations.flatMap((v: Result) =>
    v.nodes.map(
      (n: NodeResult) => `${v.id} · ${n.target.join(' ')} · ${(n.any[0]?.message ?? v.help).replace(/\s+/g, ' ')}`,
    ),
  );
  expect(resumen, `${contexto} · violaciones de axe`).toEqual([]);
}

test.describe('a 412 × 915', () => {
  test.skip(({ isMobile }) => !isMobile, 'las filas apiladas son del móvil (proyecto movil)');
  test.use({ viewport: { width: 412, height: 915 } });

  test('Registro con filas cabe a lo ancho (RV-116)', async ({ page }) => {
    const panel = await prepararPanel(page);
    await page.goto('/admin/registro');
    await expect(page.getByText(REGISTRO[0].codigo!)).toBeVisible({ timeout: CARGA });
    expect(await desbordes(page)).toEqual([]);
    await panel.sinErrores();
    await auditar(page, 'Registro en el móvil');
  });

  // Desde docs/38 RV-508, la Papelera es una lista por debajo de 1.100 px.
  test('Papelera con filas cabe a lo ancho y «Restaurar» se toca (RV-116)', async ({ page }) => {
    const panel = await prepararPanel(page);
    await page.goto('/admin/papelera');
    await expect(page.getByText(PAPELERA[1].codigo)).toBeVisible({ timeout: CARGA });
    expect(await desbordes(page)).toEqual([]);
    await panel.sinErrores();
    const restaurar = page.getByRole('button', { name: T.panel.restaurar }).last();
    await expect(restaurar).toBeInViewport({ ratio: 1 });
    await auditar(page, 'Papelera en el móvil');
  });
});

test.describe('desde md', () => {
  test.skip(({ isMobile }) => isMobile, 'la tabla, en escritorio');

  // Desde docs/38 (DEC-213), el Registro es una lista hasta 1.099 px y una tabla desde 1.100.
  for (const [ancho, alto, tablaRegistro] of [
    [768, 1024, false],
    [1440, 900, true],
  ] as const) {
    test(`a ${ancho} px, Registro y Papelera caben (RV-116, docs/38 RV-507 y RV-508)`, async ({ page }) => {
      await page.setViewportSize({ width: ancho, height: alto });
      const panel = await prepararPanel(page);
      await page.goto('/admin/registro');
      await expect(page.getByText(REGISTRO[0].codigo).first()).toBeVisible({ timeout: CARGA });
      await expect(page.locator('table')).toHaveCount(tablaRegistro ? 1 : 0);
      expect(await desbordes(page)).toEqual([]);

      await page.goto('/admin/papelera');
      await expect(page.getByText(PAPELERA[1].codigo)).toBeVisible({ timeout: CARGA });
      await expect(page.locator('table')).toHaveCount(tablaRegistro ? 1 : 0);
      expect(await desbordes(page)).toEqual([]);
      await panel.sinErrores();
    });
  }
});

// Capturas para la revisión a ojo (skill revisar-pantallas): PW_CAPTURAS=1, en claro y en oscuro.
test.describe('capturas', () => {
  test.skip(({ isMobile }) => !isMobile || !process.env.PW_CAPTURAS, 'solo bajo demanda, en el proyecto movil');
  const TAMAÑOS = [
    [412, 915],
    [768, 1024],
    [1440, 900],
  ] as const;
  const ESPERA: Record<string, string> = {
    registro: REGISTRO[0].codigo,
    papelera: PAPELERA[1].codigo,
  };
  for (const [ancho, alto] of TAMAÑOS) {
    test(`Registro y Papelera a ${ancho} px`, async ({ page }, info) => {
      await page.setViewportSize({ width: ancho, height: alto });
      await prepararPanel(page);
      for (const [pestaña, texto] of Object.entries(ESPERA)) {
        await page.goto(`/admin/${pestaña}`);
        await expect(page.getByText(texto).first()).toBeVisible({ timeout: CARGA });
        for (const tema of ['light', 'dark'] as const) {
          await page.emulateMedia({ colorScheme: tema });
          await page.screenshot({
            path: info.outputPath(`${pestaña}-${ancho}-${tema}.png`),
            fullPage: true,
            animations: 'disabled',
          });
        }
      }
    });
  }
});

// ---------- docs/38 RV-507 (DEC-213, DEC-215): el Registro por anchos ----------

test.describe('Registro por anchos (docs/38 RV-507)', () => {
  test.skip(({ isMobile }) => isMobile, 'cada test fija su ventana');
  const ENTRADAS = [
    {
      ...REGISTRO[0],
      id: 101,
      actor: 'jefatura@example.org',
      es_admin: true,
      accion: 'borrado',
      codigo: 'HID-0101',
      resumen: 'borrado · HID-0101',
      antes: { codigo: 'HID-0101', tipo: 'hidrante', motivo: 'Duplicado' },
      despues: null,
    },
    {
      ...REGISTRO[0],
      id: 102,
      actor: 'jefatura@example.org',
      es_admin: true,
      accion: 'config_cambiada',
      codigo: null,
      resumen: 'config_cambiada · dias_papelera',
      antes: { dias_papelera: 30 },
      despues: { dias_papelera: 45 },
    },
    { ...REGISTRO[1], id: 103 },
  ];

  async function preparar(page: Page) {
    const panel = await prepararPanel(page);
    // Como PostgREST: el filtro por acción lo hace el servidor.
    await page.route(`${SUPABASE_PRUEBAS}/rest/v1/v_registro?*`, (route) => {
      const url = new URL(route.request().url());
      const accion = url.searchParams.get('accion')?.replace(/^eq\./, '');
      const filas = accion ? ENTRADAS.filter((e) => e.accion === accion) : ENTRADAS;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Expose-Headers': 'Content-Range',
          'Content-Range': `0-${Math.max(filas.length - 1, 0)}/${filas.length}`,
        },
        body: JSON.stringify(filas),
      });
    });
    return panel;
  }

  test('a 412: tres líneas; sin punto, ni «Punto» ni «—»; tu entrada dice «Tú»; filtrar por «Borrado»', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 412, height: 915 });
    await preparar(page);
    await page.goto('/admin/registro');
    await expect(filasRegistro(page)).toHaveCount(3, { timeout: CARGA });
    await expect(filasRegistro(page).first().locator('p')).toHaveCount(3);
    const sinPunto = filasRegistro(page).nth(1);
    await expect(sinPunto).toContainText(`${T.panelAjustes.diasPapelera}: 30 → 45`);
    await expect(sinPunto).not.toContainText(T.panelRegistro.colPunto);
    await expect(sinPunto).not.toContainText('—');
    await expect(sinPunto).toContainText(T.panel.tu);
    await expect(page.getByRole('main')).not.toContainText('jefatura@example.org');
    await filtrarPor(page, T.panelRegistro.colAccion, T.panelRegistro.borrado);
    await expect(filasRegistro(page)).toHaveCount(1);
    await expect(page.getByRole('button', { name: /^Filtros: / })).toHaveAccessibleName(
      T.panel.filtrosDe(T.panelRegistro.borrado),
    );
  });

  for (const [ancho, alto, tabla] of [
    [820, 1180, false],
    [1280, 800, true],
  ] as const) {
    test(`a ${ancho} px, ${tabla ? 'tabla' : 'lista'}`, async ({ page }) => {
      await page.setViewportSize({ width: ancho, height: alto });
      await preparar(page);
      await page.goto('/admin/registro');
      await expect(filasRegistro(page)).toHaveCount(3, { timeout: CARGA });
      await expect(page.getByRole('main').locator('table')).toHaveCount(tabla ? 1 : 0);
    });
  }

  test('a 1920 px, la tabla mide como mucho 1.500 px', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await preparar(page);
    await page.goto('/admin/registro');
    await expect(filasRegistro(page)).toHaveCount(3, { timeout: CARGA });
    expect((await page.getByRole('main').locator('table').boundingBox())!.width).toBeLessThanOrEqual(1500);
  });
});

// ---------- docs/38 RV-508: la Papelera por anchos ----------

test.describe('Papelera por anchos (docs/38 RV-508)', () => {
  test.skip(({ isMobile }) => isMobile, 'cada test fija su ventana');
  const filas = (page: Page) => page.getByRole('main').locator('ul[aria-label="Papelera"] > li');

  test('a 412: lista; «Restaurar» de 44 px; «Purgar…» en rojo y lejos de los «Restaurar»; «queda 1 día» en rojo', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 412, height: 915 });
    const panel = await prepararPanel(page);
    await page.goto('/admin/papelera');
    await expect(filas(page)).toHaveCount(PAPELERA.length, { timeout: CARGA });
    await expect(page.getByRole('main').locator('table')).toHaveCount(0);
    const primera = filas(page).first();
    await expect(primera).toContainText(`${T.panelPapelera.colBorrado} `);
    await expect(primera).toContainText(T.panelPapelera.quedan(28));
    const restaurar = page.getByRole('button', { name: T.panel.restaurar });
    for (const b of await restaurar.all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);

    const purgar = page.getByRole('button', { name: T.panelPapelera.purgarCaducado });
    const caja = (await purgar.boundingBox())!;
    expect(caja.height).toBeGreaterThanOrEqual(44);
    const rojo = await page.evaluate(() => {
      const d = document.createElement('div');
      d.className = 'text-rojo-texto';
      document.body.append(d);
      const c = getComputedStyle(d).color;
      d.remove();
      return c;
    });
    await expect(purgar).toHaveCSS('color', rojo);
    await expect(purgar).toHaveCSS('border-top-color', rojo);
    // Ningún «Restaurar» en la misma franja que «Purgar…».
    for (const b of await restaurar.all()) {
      const r = (await b.boundingBox())!;
      expect(r.y >= caja.y + caja.height || r.y + r.height <= caja.y).toBe(true);
    }

    const ultimo = filas(page).filter({ hasText: 'HID-0108' }).getByText(T.panelPapelera.quedan(1));
    await expect(ultimo).toHaveCSS('color', rojo);
    await expect(ultimo).toHaveCSS('font-weight', '700');
    expect(await desbordes(page)).toEqual([]);
    await panel.sinErrores();
  });

  test('a 820 px, lista', async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 1180 });
    const panel = await prepararPanel(page);
    await page.goto('/admin/papelera');
    await expect(filas(page)).toHaveCount(PAPELERA.length, { timeout: CARGA });
    await expect(page.getByRole('main').locator('table')).toHaveCount(0);
    expect(await desbordes(page)).toEqual([]);
    await panel.sinErrores();
  });

  test('a 1280 px, la tabla mide como mucho 900 px y el diálogo de purgar sigue igual', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await prepararPanel(page);
    await page.goto('/admin/papelera');
    const tabla = page.getByRole('main').locator('table');
    await expect(tabla.locator('tbody > tr')).toHaveCount(PAPELERA.length, { timeout: CARGA });
    expect((await tabla.boundingBox())!.width).toBeLessThanOrEqual(900);
    await page.getByRole('button', { name: T.panelPapelera.purgarCaducado }).click();
    const dialogo = page.getByRole('dialog', { name: T.panelPapelera.purgarCaducado });
    await expect(dialogo).toContainText(T.panelPapelera.avisoPurga(30));
    await dialogo.getByRole('button', { name: T.panelCola.cancelar }).click();
    await expect(dialogo).toHaveCount(0);
  });

  test('vacía: «Purgar…» deshabilitado y descrito por «La papelera está vacía.»', async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 915 });
    await prepararPanel(page);
    await page.route(`${SUPABASE_PRUEBAS}/rest/v1/puntos?*`, (route) =>
      route.fulfill({
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: '[]',
      }),
    );
    await page.goto('/admin/papelera');
    const purgar = page.getByRole('button', { name: T.panelPapelera.purgarCaducado });
    await expect(page.getByText(T.panelPapelera.vacia)).toBeVisible({ timeout: CARGA });
    await expect(purgar).toBeDisabled();
    await expect(purgar).toHaveAccessibleDescription(T.panelPapelera.vacia);
  });
});
