// La misma URL en tres anchos (TR-25, FR-70, docs/17 RV-28): el móvil, la tableta y el ordenador.
// Aserciones de disposición, no capturas comparadas; las capturas van como adjunto del informe para
// que una persona las mire.

import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { T } from '../src/lib/textos.ts';
import { SUPABASE_PRUEBAS } from '../playwright.config.ts';
import { conGoogle, conSesion, simularRpc, simularTablas } from './ayudas.ts';
import { LISTADO, PUNTOS } from './puntos.ts';

const [P0] = PUNTOS;

async function abrir(page: Page, ancho: number, alto: number, ruta = '/') {
  await page.setViewportSize({ width: ancho, height: alto });
  await conSesion(page);
  await simularRpc(page, { fn_listar_puntos: LISTADO, fn_ficha_punto: P0, fn_registrar_error: null });
  await page.goto(ruta);
  await expect(page.getByTestId('mapa')).toBeVisible();
}

async function captura(page: Page, info: TestInfo, nombre: string) {
  await info.attach(nombre, { body: await page.screenshot(), contentType: 'image/png' });
}

// Los anchos los fija cada prueba: con el proyecto de escritorio basta, el de móvil lo repetiría.
test.skip(({ isMobile }) => !!isMobile, 'los tres anchos se fijan a mano en el proyecto de escritorio');

test('390 px: el mapa ocupa todo el ancho y la ficha es una pantalla propia', async ({ page }, info) => {
  await abrir(page, 390, 844);
  const mapa = (await page.getByTestId('mapa').boundingBox())!;
  expect(mapa.x).toBeLessThanOrEqual(1);
  expect(mapa.width).toBeGreaterThanOrEqual(388);
  // Sin lista lateral: el buscador es el del propio mapa.
  await expect(page.getByRole('complementary')).toHaveCount(0);
  await captura(page, info, 'mapa-390');

  await page.goto(`/?p=${P0.id}`);
  await expect(page.getByRole('article')).toBeVisible();
  await expect(page.getByTestId('mapa')).toHaveCount(0);
  await captura(page, info, 'ficha-390');
});

test('768 px: las herramientas son botones laterales y mapa y ficha se ven a la vez (TR-25, FR-70)', async ({
  page,
}, info) => {
  await abrir(page, 768, 1024, `/?p=${P0.id}`);
  const mapa = (await page.getByTestId('mapa').boundingBox())!;
  for (const nombre of [T.mapa.capas, T.mapa.miPosicion, T.mapa.acercar, T.mapa.alejar]) {
    const b = (await page.getByRole('button', { name: nombre }).boundingBox())!;
    // En la columna de la derecha del mapa.
    expect(b.x + b.width, nombre).toBeGreaterThan(mapa.x + mapa.width - 80);
  }
  const ficha = (await page.getByRole('article').boundingBox())!;
  expect(ficha.width).toBeLessThan(mapa.width);
  await captura(page, info, 'tableta-768');
});

test('1280 px: lista lateral y ficha flotante que no tapa el plano (FR-70)', async ({ page }, info) => {
  await abrir(page, 1280, 800, `/?p=${P0.id}`);
  const lista = page.getByRole('complementary').first();
  await expect(lista.getByRole('searchbox', { name: T.mapa.buscar })).toBeVisible();
  const mapa = (await page.getByTestId('mapa').boundingBox())!;
  const ficha = (await page.getByRole('article').boundingBox())!;
  // Flotante dentro del mapa, y ocupando como mucho la mitad de su ancho: el plano sigue a la vista.
  expect(ficha.x).toBeGreaterThanOrEqual(mapa.x);
  expect(ficha.x + ficha.width).toBeLessThanOrEqual(mapa.x + mapa.width + 1);
  expect(ficha.width).toBeLessThan(mapa.width / 2);
  await captura(page, info, 'escritorio-1280');
});

// docs/19 RV-60: en tableta y ordenador, "Cercanos" tapaba la ficha y a los candidatos.
type Caja = { x: number; y: number; width: number; height: number };
const cortan = (a: Caja, b: Caja) =>
  Math.min(a.x + a.width, b.x + b.width) > Math.max(a.x, b.x) &&
  Math.min(a.y + a.height, b.y + b.height) > Math.max(a.y, b.y);
const dentro = (a: Caja, b: Caja) =>
  a.x >= b.x && a.y >= b.y && a.x + a.width <= b.x + b.width && a.y + a.height <= b.y + b.height;

for (const [ancho, alto] of [
  [768, 1024],
  [1024, 768],
  [1280, 800],
] as const) {
  test(`${ancho} px: con incidente y ficha abiertos, ni se tapan ni tapan el incidente y los tres primeros (RV-60)`, async ({
    page,
  }, info) => {
    await abrir(page, ancho, alto, `/?incidente=${P0.lat.toFixed(6)},${P0.lng.toFixed(6)}`);
    const cercanos = page.getByRole('region', { name: T.incidente.titulo });
    const filas = cercanos.getByRole('listitem');
    await expect(filas.first()).toBeVisible();
    const n = Math.min(3, await filas.count());
    const codigos: string[] = [];
    for (let i = 0; i < n; i++) codigos.push(/(HID|BOC)-\d{4}/.exec((await filas.nth(i).textContent()) ?? '')![0]);
    await filas.first().getByRole('button').first().click();
    const ficha = page.getByRole('article');
    await expect(ficha).toBeVisible();

    const caja = async (l: ReturnType<Page['locator']>) => (await l.boundingBox())!;
    const paneles = [await caja(cercanos), await caja(ficha)];
    expect(cortan(paneles[0]!, paneles[1]!), 'Cercanos y la ficha no se cortan').toBe(false);
    // El incidente y los tres primeros, dentro del mapa y fuera de los paneles. El mapa se vuelve a
    // encuadrar al abrir la ficha: se espera a que quede quieto.
    const mapa = await caja(page.getByTestId('mapa'));
    const marcas = [page.locator('.marca-incidente'), ...codigos.map((c) => page.locator(`.marcador[title="${c}"]`))];
    await expect
      .poll(async () => {
        for (const m of marcas) {
          const b = await m.boundingBox();
          if (!b || !dentro(b, mapa) || paneles.some((p) => cortan(b, p))) return false;
        }
        return true;
      })
      .toBe(true);
    await captura(page, info, `incidente-y-ficha-${ancho}`);
  });
}

// docs/21 RV-82: "Cercanos", con texto, ensanchaba la columna de la derecha y dejaba los botones de
// 44 px hacia el centro del mapa; en tableta y ordenador la ficha además los tapaba.
const COLUMNA = [T.mapa.capas, T.medir.boton, T.mapa.miPosicion, T.mapa.acercar, T.mapa.alejar];

for (const [ancho, alto] of [
  [390, 844],
  [412, 915],
  [768, 1024],
  [1280, 800],
] as const) {
  test(`${ancho} px: la columna de controles va pegada al borde y "Cercanos", abajo a la derecha (RV-82)`, async ({
    page,
  }, info) => {
    await abrir(page, ancho, alto);
    // Con los puntos ya en la lista: es la lista la que estiraba la fila en el ordenador.
    await expect(page.getByText(T.mapa.nPuntos(PUNTOS.length), { exact: false })).toBeVisible();
    const mapa = (await page.getByTestId('mapa').boundingBox())!;
    const bordeMapa = mapa.x + mapa.width;
    const columna: Caja[] = [];
    for (const nombre of COLUMNA)
      columna.push((await page.getByRole('button', { name: nombre, exact: true }).boundingBox())!);
    const derechas = columna.map((b) => b.x + b.width);
    for (const [i, d] of derechas.entries()) {
      expect(Math.abs(d - derechas[0]!), `${COLUMNA[i]}: mismo borde derecho que Capas`).toBeLessThanOrEqual(1);
      expect(bordeMapa - d, `${COLUMNA[i]}: a ≤ 12 px del borde del mapa`).toBeLessThanOrEqual(12);
    }
    const izquierda = Math.min(...columna.map((b) => b.x));
    expect(Math.max(...derechas) - izquierda, 'la columna mide ≤ 48 px de ancho').toBeLessThanOrEqual(48);

    const cercanos = (await page.getByRole('button', { name: T.incidente.boton, exact: true }).boundingBox())!;
    const nuevo = (await page.getByRole('button', { name: T.navegacion.nuevoPunto }).boundingBox())!;
    const atribucion = (await page.getByTestId('atribucion').boundingBox())!;
    // Abajo a la derecha, encima del "+", con 12 px de aire (UI-15), sin tocar la atribución.
    expect(cercanos.y, 'Cercanos en la mitad de abajo').toBeGreaterThan(mapa.y + mapa.height / 2);
    expect(bordeMapa - (cercanos.x + cercanos.width), 'Cercanos pegado a la derecha').toBeLessThanOrEqual(16);
    const aire = nuevo.y - (cercanos.y + cercanos.height);
    expect(aire, 'Cercanos encima del +, a 12 px').toBeGreaterThanOrEqual(11.5);
    expect(aire, 'Cercanos encima del +, a 12 px').toBeLessThanOrEqual(12.5);
    // Las medidas de 06 §5: Cercanos de 48 px de alto, el + de 56 y el zoom en una pieza de 44 × 88.
    expect(Math.round(cercanos.height)).toBe(48);
    expect([Math.round(nuevo.width), Math.round(nuevo.height)]).toEqual([56, 56]);
    const zoom = (await page.getByRole('group', { name: T.mapa.zoom }).boundingBox())!;
    expect([Math.round(zoom.width), Math.round(zoom.height)]).toEqual([44, 88]);
    expect(cortan(cercanos, atribucion), 'Cercanos y la atribución').toBe(false);
    expect(cortan(nuevo, atribucion), 'el + y la atribución').toBe(false);
    for (const [i, b] of columna.entries()) expect(cortan(b, cercanos), `${COLUMNA[i]} y Cercanos`).toBe(false);
    // Todo a la vista, sin desplazar la página ni quedar bajo la navegación (lo vio vistas.spec.ts, RV-88).
    const navegacion = (await page.getByRole('navigation').first().boundingBox())!;
    const leyenda = (await page.getByRole('region', { name: T.mapa.leyenda }).boundingBox())!;
    for (const [nombre, b] of [
      ['Cercanos', cercanos],
      ['el +', nuevo],
      ['la leyenda', leyenda],
    ] as const) {
      expect(b.y + b.height, `${nombre} dentro de la pantalla`).toBeLessThanOrEqual(alto);
      expect(cortan(b, navegacion), `${nombre} y la navegación`).toBe(false);
    }
    // Y la página no se desplaza: el mapa cabe en la pantalla, se mueva el control que se mueva.
    const alturas = await page.evaluate(() => [document.scrollingElement!.scrollHeight, innerHeight]);
    expect(alturas[0], 'la página no es más alta que la pantalla').toBeLessThanOrEqual(alturas[1]! + 1);
    await captura(page, info, `controles-${ancho}`);

    if (ancho < 768) {
      // Para revisarlas una persona en el PR (revisar-pantallas): el incidente abierto y la ficha.
      await page.goto(`/?incidente=${P0.lat.toFixed(6)},${P0.lng.toFixed(6)}`);
      await expect(page.getByRole('region', { name: T.incidente.titulo }).getByRole('listitem').first()).toBeVisible();
      await captura(page, info, `incidente-${ancho}`);
      await page.goto(`/?p=${P0.id}`);
      await expect(page.getByRole('article')).toBeVisible();
      await captura(page, info, `ficha-${ancho}`);
      return;
    }
    await page.goto(`/?p=${P0.id}`);
    // La caja que se ve: la ficha flotante, que desplaza su contenido si no cabe.
    await expect(page.getByRole('article')).toBeVisible();
    const ficha = (await page.locator('aside:has(article)').boundingBox())!;
    for (const nombre of [...COLUMNA, T.incidente.boton, T.navegacion.nuevoPunto]) {
      const b = (await page.getByRole('button', { name: nombre, exact: true }).boundingBox())!;
      expect(cortan(b, ficha), `${nombre} y la ficha`).toBe(false);
    }
    await captura(page, info, `controles-con-ficha-${ancho}`);
  });
}

// docs/20 RV-79: a unos 800 px (tableta en vertical, TR-21) el Inventario cortaba la dirección en
// "— pen", partía "Boca de riego" en dos líneas y dejaba Voluntarios y Ajustes fuera de la vista.
test.describe('panel de jefatura en tableta en vertical (RV-79)', () => {
  test.beforeEach(async ({ page }) => {
    await conGoogle(page, 'jefe@example.org');
    await simularTablas(page, { v_puntos_activos: PUNTOS, v_cola_revision: [], propuestas: [] });
    await page.route(`${SUPABASE_PRUEBAS}/rest/v1/rpc/fn_es_admin`, (r) =>
      r.fulfill({ contentType: 'application/json', body: 'true' }),
    );
  });

  for (const ancho of [768, 800]) {
    test(`${ancho} px: el Inventario no corta la dirección, no parte el tipo y se ven todas las pestañas`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width: ancho, height: 1024 });
      await page.goto('/admin/inventario');
      const campos = page.getByRole('textbox', { name: /^Dirección de (HID|BOC)-/ });
      await expect(campos.first()).toBeVisible();
      expect(await campos.count()).toBe(PUNTOS.length);

      // Ni el valor ni el "— pendiente, escribe aquí" caben a medias en su campo.
      const cortados = await campos.evaluateAll((els) => {
        const lienzo = document.createElement('canvas').getContext('2d')!;
        return (els as HTMLInputElement[])
          .filter((e) => {
            const st = getComputedStyle(e);
            lienzo.font = `${st.fontWeight} ${st.fontSize} ${st.fontFamily}`;
            const texto = e.value || e.placeholder;
            const hueco = e.clientWidth - parseFloat(st.paddingLeft) - parseFloat(st.paddingRight);
            return e.scrollWidth > e.clientWidth || lienzo.measureText(texto).width > hueco;
          })
          .map((e) => e.getAttribute('aria-label'));
      });
      expect(cortados).toEqual([]);

      // "Boca de riego" en una sola línea.
      const tipo = page.getByRole('main').getByText(T.formulario.bocaRiego, { exact: true }).first();
      const lineas = await tipo.evaluate((e) => {
        const r = document.createRange();
        r.selectNodeContents(e);
        return new Set([...r.getClientRects()].map((c) => Math.round(c.top))).size;
      });
      expect(lineas).toBe(1);

      // Todas las pestañas a la vista, sin desplazamiento a lo ancho.
      const nav = page.getByRole('navigation', { name: T.jefatura.panel });
      for (const nombre of [
        T.panelCola.colaRevision,
        T.panelCola.inventario,
        T.panelCola.revisionesCaducadas,
        T.panelCola.registro,
        T.panelCola.papelera,
        T.panelCola.voluntarios,
        T.panelCola.ajustes,
      ]) {
        const caja = (await nav.getByRole('link', { name: new RegExp(`^${nombre}`) }).boundingBox())!;
        expect(caja.x, nombre).toBeGreaterThanOrEqual(0);
        expect(caja.x + caja.width, nombre).toBeLessThanOrEqual(ancho);
      }
      expect(await nav.evaluate((n) => n.scrollWidth - n.clientWidth)).toBeLessThanOrEqual(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(
        0,
      );
      await captura(page, info, `inventario-${ancho}`);
    });
  }
});
