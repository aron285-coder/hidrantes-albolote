// docs/28 RV-116 (#454): en el móvil, Registro y Papelera caben a lo ancho. Por debajo de md las filas
// de Registro se apilan, como en Inventario; desde md, la tabla. La pestaña Voluntarios ya no existe
// (docs/29 RV-122, DEC-167). Todos los datos son simulados (repositorio público: nada de nombres reales).

import { AxeBuilder } from '@axe-core/playwright';
import type { NodeResult, Result } from 'axe-core';
import { expect, test, type Page } from '@playwright/test';
import { T } from '../src/lib/textos.ts';
import { SUPABASE_PRUEBAS } from '../playwright.config.ts';
import { conGoogle, simularTablas } from './ayudas.ts';
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
  // Una lectura que falla deja la pestaña en «Reintentar» y el test mediría una pantalla vacía.
  return { sinErrores: () => expect(errores, 'errores registrados por el panel').toEqual([]) };
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
    panel.sinErrores();
    await auditar(page, 'Registro en el móvil');
  });

  // Papelera sigue en tabla: con cuatro columnas cabe a 412 px (docs/28 RV-116, comprobado aquí).
  test('Papelera con filas cabe a lo ancho y «Restaurar» se toca (RV-116)', async ({ page }) => {
    const panel = await prepararPanel(page);
    await page.goto('/admin/papelera');
    await expect(page.getByText(PAPELERA[1].codigo)).toBeVisible({ timeout: CARGA });
    expect(await desbordes(page)).toEqual([]);
    panel.sinErrores();
    const restaurar = page.getByRole('button', { name: T.panel.restaurar }).last();
    await expect(restaurar).toBeInViewport({ ratio: 1 });
    await auditar(page, 'Papelera en el móvil');
  });
});

test.describe('desde md', () => {
  test.skip(({ isMobile }) => isMobile, 'la tabla, en escritorio');

  // 768 es el primer ancho con tabla: si cabe ahí, cabe en todos los demás.
  for (const [ancho, alto] of [
    [768, 1024],
    [1440, 900],
  ] as const) {
    test(`a ${ancho} px, Registro y Papelera siguen en tabla y caben (RV-116)`, async ({ page }) => {
      await page.setViewportSize({ width: ancho, height: alto });
      const panel = await prepararPanel(page);
      await page.goto('/admin/registro');
      await expect(page.getByText(REGISTRO[0].codigo).first()).toBeVisible({ timeout: CARGA });
      await expect(page.locator('table')).toHaveCount(1);
      expect(await desbordes(page)).toEqual([]);

      await page.goto('/admin/papelera');
      await expect(page.getByText(PAPELERA[1].codigo)).toBeVisible({ timeout: CARGA });
      await expect(page.locator('table')).toHaveCount(1);
      expect(await desbordes(page)).toEqual([]);
      panel.sinErrores();
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
