// docs/38 RV-510 (#754, DEC-213, UI-15): las cinco pestañas del panel a 360, 412, 820, 1.100, 1.280 y 1.920 px, en
// claro y en oscuro: sin desplazamiento a lo ancho, sin «…» en los datos, toques de 44 px por debajo de 1.100 (32
// desde ahí), axe, y cada dato una sola vez. El nombre no empieza por «panel-» para que el proyecto panel-firefox no
// lo repita. Datos simulados (e2e/panel-simulado.ts); nunca un servidor real.

import { AxeBuilder } from '@axe-core/playwright';
import type { NodeResult, Result } from 'axe-core';
import { expect, test, type Page } from '@playwright/test';
import { T } from '../src/lib/textos.ts';
import { abrirFiltros } from './ayudas.ts';
import { jefatura, PANEL_COMPLETO, REGISTRO } from './panel-simulado.ts';

test.describe.configure({ timeout: 120_000 });
test.skip(({ isMobile }) => isMobile, 'en el proyecto de escritorio, con el ancho a mano (como anchos.spec.ts)');

const CARGA = 15_000;
const ANCHOS = [360, 412, 820, 1100, 1280, 1920] as const;
const PESTANAS = ['cola', 'inventario', 'registro', 'papelera', 'ajustes'] as const;

/** Los textos de la interfaz que acaban en «…» (un botón que abre algo, «Cargando…»): esos no son datos cortados. */
function textosConPuntos(o: unknown, fuera = new Set<string>()): Set<string> {
  if (typeof o === 'string') {
    if (o.endsWith('…')) fuera.add(o);
  } else if (o && typeof o === 'object') for (const v of Object.values(o)) textosConPuntos(v, fuera);
  return fuera;
}
/** El panel completo y, además, 60 entradas en el Registro: más de una página. */
const EXTRA = {
  ...PANEL_COMPLETO,
  // Más de una página (50 por página): los botones de página también se miden.
  v_registro: Array.from({ length: 60 }, (_, i) => ({ ...REGISTRO[i % REGISTRO.length], id: i + 1 })),
};

const INTERFAZ_CON_PUNTOS = [...textosConPuntos(T)];

async function abrir(page: Page, pestana: (typeof PESTANAS)[number]) {
  await page.goto(`/admin/${pestana}`);
  await expect(page.getByRole('main')).toBeVisible({ timeout: CARGA });
  await expect(page.getByRole('main').getByText(T.panelCola.cargando)).toHaveCount(0, { timeout: CARGA });
  await page.waitForLoadState('networkidle');
}

/** Lo que se sale a lo ancho, los «…» y los toques pequeños de la pantalla que se ve. */
async function problemas(page: Page, minimo: number) {
  return page.evaluate(
    ({ minimo, interfaz }) => {
      const fallos: string[] = [];
      const doc = document.scrollingElement!;
      if (doc.scrollWidth > doc.clientWidth) fallos.push(`a lo ancho: ${doc.scrollWidth} > ${doc.clientWidth}`);
      const main = document.querySelector('main');
      if (!main) return ['sin main'];
      const nombre = (e: Element) =>
        `${e.tagName.toLowerCase()} «${(e.getAttribute('aria-label') ?? e.textContent ?? '').trim().slice(0, 40)}»`;
      const visible = (e: Element) => {
        const r = e.getBoundingClientRect();
        const st = getComputedStyle(e);
        return r.width > 0 && r.height > 0 && st.visibility !== 'hidden';
      };

      // Sin «…»: ni recortes con text-overflow ni datos que acaben así.
      for (const e of main.querySelectorAll<HTMLElement>('*')) {
        if (!visible(e)) continue;
        const st = getComputedStyle(e);
        if (st.textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth) fallos.push(`recortado: ${nombre(e)}`);
        // Cada pestaña se desplaza dentro de su propio contenedor: que tampoco ahí haya desplazamiento a lo ancho.
        if ((st.overflowX === 'auto' || st.overflowX === 'scroll') && e.scrollWidth > e.clientWidth + 1)
          fallos.push(`a lo ancho dentro: ${nombre(e)} (${e.scrollWidth} > ${e.clientWidth})`);
      }
      const recorrido = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
      for (let n = recorrido.nextNode(); n; n = recorrido.nextNode()) {
        if (!n.textContent!.trim().endsWith('…') || !n.parentElement || !visible(n.parentElement)) continue;
        // Con el texto del elemento entero: un «…» suelto detrás de un dato («{dato}…» en JSX) también cuenta.
        const t = n.parentElement.textContent!.trim();
        if (interfaz.some((i) => t.endsWith(i))) continue;
        fallos.push(`dato con «…»: «${t.slice(-60)}»`);
      }

      // Toques (UI-15): una casilla cuenta por su etiqueta si la envuelve. Excepción de UI-15: las piezas unidas
      // (el zoom del mapa de Leaflet).
      const controles = [
        ...document.querySelectorAll<HTMLElement>(
          'header button, header a[href], header input, main button, main a[href], main input, main select, main textarea, main [role="button"]',
        ),
      ];
      for (const c of controles) {
        if (c.closest('.leaflet-control-zoom')) continue;
        if (c instanceof HTMLInputElement && c.type === 'hidden') continue;
        const caja =
          c instanceof HTMLInputElement && (c.type === 'checkbox' || c.type === 'radio') && c.closest('label')
            ? c.closest('label')!
            : c;
        if (!visible(caja) && !visible(c)) continue;
        // Un botón que se estira con ::after (la fila del Inventario que abre Editar) se toca en toda su fila.
        const tras = getComputedStyle(c, '::after');
        const zona = tras.content !== 'none' && tras.position === 'absolute' && c.offsetParent ? c.offsetParent : caja;
        const r = zona.getBoundingClientRect();
        if (Math.round(r.width) < minimo || Math.round(r.height) < minimo)
          fallos.push(`toque de ${Math.round(r.width)} × ${Math.round(r.height)}: ${nombre(c)}`);
      }
      return fallos;
    },
    { minimo, interfaz: INTERFAZ_CON_PUNTOS },
  );
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

for (const tema of ['light', 'dark'] as const) {
  for (const ancho of ANCHOS) {
    test(`a ${ancho} px en ${tema === 'light' ? 'claro' : 'oscuro'}: sin desbordes, sin «…» y toques de ${ancho < 1100 ? 44 : 32} px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: ancho, height: ancho < 768 ? 915 : 900 });
      await page.emulateMedia({ colorScheme: tema });
      await jefatura(page, EXTRA);
      for (const pestana of PESTANAS) {
        await abrir(page, pestana);
        expect(await problemas(page, ancho < 1100 ? 44 : 32), `${pestana} a ${ancho} px`).toEqual([]);
        if (ancho === 412 || ancho === 1280) await auditar(page, `${pestana} a ${ancho} px (${tema})`);
      }
    });
  }
}

test('a 412 px: axe con la hoja de filtros y con el menú ☰ abiertos', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await jefatura(page, EXTRA);
  for (const pestana of ['cola', 'inventario', 'registro'] as const) {
    await abrir(page, pestana);
    await abrirFiltros(page);
    await expect(page.getByRole('dialog')).toBeVisible();
    await auditar(page, `filtros de ${pestana}`);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  await page.getByRole('button', { name: new RegExp(`^${T.panel.menu}`) }).click();
  await expect(page.locator('#menu-cabecera')).toBeVisible();
  await auditar(page, 'menú ☰');
});

test('un dato, una vez: sin «Mostrando» ni dos fechas por revisión; «Tú» en el Registro; Ajustes sin repetir', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await jefatura(page, EXTRA);
  await abrir(page, 'inventario');
  const main = page.getByRole('main');
  await expect(main).not.toContainText(/Mostrando/);
  // Una revisión es una fecha: ni «hace 3 días · 20 ago 2026» ni dos <time> en la misma celda.
  const dobles = await main
    .locator('td, li')
    .evaluateAll((celdas) => celdas.filter((c) => c.querySelectorAll(':scope time').length > 1).length);
  expect(dobles).toBe(0);

  await abrir(page, 'registro');
  await expect(main).not.toContainText('jefe@example.org');
  await expect(main).toContainText(T.panel.tu);
  // Con 60 entradas hay páginas: las han medido también las pruebas de toques.
  await expect(main.getByRole('navigation', { name: T.panelInventario.paginas })).toBeVisible();

  await abrir(page, 'ajustes');
  await expect(main.getByText(/solo en producción/i)).toHaveCount(1);
  await expect(main).not.toContainText(/móviles? registrados?/);
});
