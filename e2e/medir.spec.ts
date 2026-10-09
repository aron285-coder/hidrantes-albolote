// Medir distancia en tramos de manguera (FR-76; docs/18 GM-06).

import { expect, test, type Page } from '@playwright/test';
import { T } from '../src/lib/textos.ts';
import { conSesion, simularRpc } from './ayudas.ts';
import { LISTADO, PUNTOS } from './puntos.ts';

const M_POR_GRADO = 111_195;
/** Como `distancia()` de src/lib/formato.ts para menos de 1 km (el e2e no puede importarla). */
const distancia = (m: number) => `${Math.round(m)} m`;
const M_POR_GRADO_LNG = M_POR_GRADO * Math.cos((37.2305 * Math.PI) / 180);
const A = {
  ...PUNTOS[0]!,
  id: '00000000-0000-4000-8000-0000000fa001',
  codigo: 'HID-7101',
  lat: 37.2305,
  lng: -3.656,
  radio_px: 11,
  caudal: 'bueno' as const,
};
// 99 m y no 100: con decimales de más, 100,01 m ya serían 6 tramos de 20 m.
const B = {
  ...A,
  id: '00000000-0000-4000-8000-0000000fa002',
  codigo: 'HID-7102',
  lng: -3.656 - 59 / M_POR_GRADO_LNG,
};

async function preparar(page: Page) {
  // A z18, con B a 59 m al oeste de A y el centro 40 m al sur de los dos: a la misma altura, unos
  // 125 px el uno del otro, lejos de la búsqueda, de la columna de herramientas y de la barra de abajo.
  await page.addInitScript(() => {
    sessionStorage.setItem('hidrantes.vista', JSON.stringify({ centro: [37.23014, -3.65633], zoom: 18 }));
  });
  await conSesion(page);
  await simularRpc(page, { fn_listar_puntos: { ...LISTADO, puntos: [A, B] }, fn_registrar_error: null });
}

const barra = (page: Page) => page.getByRole('region', { name: T.medir.titulo });
/** Lo que dice la barra: distancia y tramos (aria-live). */
const resultado = (page: Page) => barra(page).locator('p').first().innerText();
const marcador = (page: Page, codigo: string) => page.locator(`.marcador[title="${codigo}"]`);

async function centro(page: Page, codigo: string) {
  // Con la máquina cargada, el marcador tarda en pintarse y el mapa aún se está colocando: se espera
  // a que esté y a que dos lecturas seguidas coincidan antes de medirlo (docs/18 RV-49).
  // Al moverse, el mapa vuelve a pintar los marcadores: entre medias el de B no existe y no hay caja.
  const leer = async () => {
    const c = await marcador(page, codigo)
      .boundingBox({ timeout: 1000 })
      .catch(() => null);
    return c ? { x: Math.round(c.x + c.width / 2), y: Math.round(c.y + c.height / 2) } : null;
  };
  let previo = await leer();
  await expect
    .poll(async () => {
      const ahora = await leer();
      const quieto = !!ahora && !!previo && ahora.x === previo.x && ahora.y === previo.y;
      previo = ahora;
      return quieto;
    })
    .toBe(true);
  return previo!;
}

test('desde ¿Qué hay aquí?, dos puntos a 59 m: 59 m · 3 tramos de 20 m, con el imán', async ({ page }) => {
  await preparar(page);
  await page.goto(`/?aqui=${A.lat.toFixed(6)},${A.lng.toFixed(6)}`);
  await page.getByRole('dialog', { name: T.aqui.titulo }).getByRole('button', { name: T.medir.desdeAqui }).click();
  await expect(barra(page)).toContainText(T.medir.empezar);
  // Un toque a 30 px de B, fuera de su icono: se imanta a B.
  const b = await centro(page, B.codigo);
  await page.mouse.click(b.x + 30, b.y);
  await expect.poll(() => resultado(page)).toBe(T.medir.resultado(distancia(59), 3, 20));
});

test('mientras mide, tocar un marcador no abre su ficha', async ({ page }) => {
  await preparar(page);
  await page.goto('/');
  await page.getByRole('button', { name: T.medir.boton }).click();
  await expect(barra(page)).toBeVisible();
  const a = await centro(page, A.codigo);
  await page.mouse.click(a.x, a.y);
  const b = await centro(page, B.codigo);
  await page.mouse.click(b.x, b.y);
  await expect(page).not.toHaveURL(/[?&]p=/);
  await expect(page.getByRole('article')).toHaveCount(0);
  await expect.poll(() => resultado(page)).toBe(T.medir.resultado(distancia(59), 3, 20));
  // Deshacer quita el último; con uno solo, deshabilitado y con motivo (UI-02).
  await barra(page).getByRole('button', { name: T.medir.deshacer }).click();
  await expect(barra(page).getByRole('button', { name: T.medir.deshacer })).toBeDisabled();
  await expect(barra(page).getByText(T.medir.motivoDeshacer)).toBeVisible();
  await barra(page).getByRole('button', { name: T.medir.borrar }).click();
  await expect(barra(page).getByText(T.medir.motivoBorrar)).toBeVisible();
});

test('atrás sale de la medición', async ({ page }) => {
  await preparar(page);
  await page.goto('/');
  await page.getByRole('button', { name: T.medir.boton }).click();
  await expect(page).toHaveURL(/medir=1/);
  await page.goBack();
  await expect(barra(page)).toHaveCount(0);
  await expect(page).not.toHaveURL(/medir=1/);
});

// docs/19 RV-67: la etiqueta iba centrada sobre la línea y la línea la tachaba.
test('la etiqueta del tramo queda al lado de la línea, sin que la corte', async ({ page }) => {
  await preparar(page);
  await page.goto('/');
  await page.getByRole('button', { name: T.medir.boton }).click();
  const a = await centro(page, A.codigo);
  await page.mouse.click(a.x, a.y);
  const b = await centro(page, B.codigo);
  await page.mouse.click(b.x, b.y);
  await expect.poll(() => resultado(page)).toBe(T.medir.resultado(distancia(59), 3, 20));
  const etiqueta = page.locator('.etiqueta-medicion').first();
  await expect(etiqueta).toBeVisible();
  const e = (await etiqueta.boundingBox())!;
  const cx = e.x + e.width / 2;
  const cy = e.y + e.height / 2;
  // Distancia del centro de la caja a la recta a–b: más de media caja, la línea no la corta.
  const dist = Math.abs((b.y - a.y) * cx - (b.x - a.x) * cy + b.x * a.y - b.y * a.x) / Math.hypot(b.y - a.y, b.x - a.x);
  expect(dist).toBeGreaterThan(e.height / 2);
});

// docs/33 RV-318 (U9, D7): con dos tramos en «V», las etiquetas se montaban en el vértice.
test('dos tramos en ángulo agudo: dos píldoras que no se pisan; al alejar, las de tramos cortos se van', async ({
  page,
}) => {
  await preparar(page);
  await page.goto('/');
  await page.getByRole('button', { name: T.medir.boton }).click();
  await expect(barra(page)).toBeVisible();
  const mapa = (await page.getByTestId('mapa').boundingBox())!;
  // Lejos de A y de B (arriba del centro) para que el imán no los atrape.
  for (const [fx, fy] of [
    [0.12, 0.5],
    [0.82, 0.42],
    [0.2, 0.3],
  ] as const) {
    await page.mouse.click(mapa.x + mapa.width * fx, mapa.y + mapa.height * fy);
  }
  const etiquetas = page.locator('.etiqueta-medicion');
  await expect(etiquetas).toHaveCount(2);
  const [e1, e2] = [(await etiquetas.nth(0).boundingBox())!, (await etiquetas.nth(1).boundingBox())!];
  const solapan =
    e1.x < e2.x + e2.width && e2.x < e1.x + e1.width && e1.y < e2.y + e2.height && e2.y < e1.y + e1.height;
  expect(solapan).toBe(false);
  // Una píldora opaca.
  const estilo = await etiquetas.first().evaluate((el) => {
    const s = getComputedStyle(el);
    return { radio: parseFloat(s.borderTopLeftRadius), fondo: s.backgroundColor };
  });
  expect(estilo.radio).toBeGreaterThanOrEqual(10);
  expect(estilo.fondo).toMatch(/^rgb\(/);
  // El total, en la fuente normal (no la monoespaciada).
  const fuente = await barra(page)
    .locator('p')
    .first()
    .evaluate((p) => getComputedStyle(p).fontFamily);
  expect(fuente).not.toMatch(/mono/i);
  // Al alejar, los tramos quedan cortos en pantalla (< 70 px) y sus etiquetas se van.
  // Se pulsa dentro del poll: Leaflet ignora los clics mientras dura su animación de zoom.
  await expect
    .poll(
      async () => {
        await page.getByRole('button', { name: T.mapa.alejar }).click();
        return etiquetas.count();
      },
      { timeout: 15_000, intervals: [400] },
    )
    .toBe(0);
});
