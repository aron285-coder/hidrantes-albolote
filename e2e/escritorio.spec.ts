// docs/33 RV-321 (U12, D6a, D6b): en el ordenador (desde 1100 px) la navegación va arriba, sin barra
// abajo y sin «Lista» (la lista ya está a la izquierda); los filtros de la lista se parten en dos líneas
// en vez de desplazarse; y con el mapa sin conexión no se ve el borde recto de su recorte.

import { expect, test, type Page } from '@playwright/test';
import { T } from '../src/lib/textos.ts';
import { conSesion, simularRpc } from './ayudas.ts';
import { LISTADO } from './puntos.ts';
import mapabase from '../datos/mapabase.json' with { type: 'json' };

test.skip(({ isMobile }) => !!isMobile, 'los tamaños se fijan a mano en el proyecto de escritorio');

async function abrir(page: Page, ancho: number, alto: number, ruta = '/') {
  await page.setViewportSize({ width: ancho, height: alto });
  await conSesion(page);
  await simularRpc(page, { fn_listar_puntos: LISTADO, fn_mis_propuestas: [], fn_registrar_error: null });
  await page.goto(ruta);
  await expect(
    page
      .getByTestId('mapa')
      .or(page.getByRole('heading', { level: 1 }))
      .first(),
  ).toBeVisible();
}

const visibles = (page: Page, nombre: string) => page.getByRole('link', { name: nombre }).filter({ visible: true });

for (const [ancho, alto] of [
  [1440, 900],
  [1280, 800],
  [1100, 800],
] as const) {
  test(`${ancho} px: Mapa · Mis propuestas · Ajustes arriba; sin barra abajo ni «Lista»`, async ({ page }) => {
    await abrir(page, ancho, alto);
    const arriba = page.getByRole('banner');
    for (const nombre of [T.navegacion.mapa, T.navegacion.misPropuestas, T.navegacion.ajustes]) {
      // Sin «exact»: el de Ajustes lleva el punto de novedades en su nombre.
      await expect(arriba.getByRole('link', { name: nombre })).toBeVisible();
    }
    await expect(visibles(page, T.navegacion.lista)).toHaveCount(0);
    // Cada destino, una sola vez a la vista (la barra de abajo está oculta).
    for (const nombre of [T.navegacion.mapa, T.navegacion.ajustes]) {
      await expect(visibles(page, nombre)).toHaveCount(1);
    }
    // La página activa, marcada.
    await expect(arriba.getByRole('link', { name: T.navegacion.mapa, exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    // El punto de las novedades sin ver, también arriba.
    await expect(page.getByTestId('punto-novedades-arriba')).toBeVisible();
    await arriba.getByRole('link', { name: T.navegacion.misPropuestas, exact: true }).click();
    await expect(page).toHaveURL(/\/mis-propuestas/);
  });
}

test('en /lista, «Mapa» sigue marcado: la lista es parte del mapa en el ordenador', async ({ page }) => {
  await abrir(page, 1440, 900, '/lista');
  await expect(page.getByRole('banner').getByRole('link', { name: T.navegacion.mapa, exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

test('1099 px: la barra de abajo sigue, con «Lista»', async ({ page }) => {
  await abrir(page, 1099, 800);
  await expect(visibles(page, T.navegacion.lista)).toHaveCount(1);
});

test('los filtros de la lista se parten en dos líneas en vez de desplazarse (D6a)', async ({ page }) => {
  await abrir(page, 1440, 900);
  const filtros = page.getByRole('radiogroup', { name: T.mapa.filtrar });
  await expect(filtros).toBeVisible();
  const medidas = await filtros.evaluate((el) => ({
    desborda: el.scrollWidth - el.clientWidth,
    alto: el.clientHeight,
  }));
  expect(medidas.desborda, 'sin barra de desplazamiento').toBeLessThanOrEqual(0);
  const radios = filtros.getByRole('radio');
  const ys = new Set<number>();
  for (let i = 0; i < (await radios.count()); i++) ys.add(Math.round((await radios.nth(i).boundingBox())!.y));
  expect(ys.size, 'en más de una línea').toBeGreaterThan(1);
});

test('con el mapa sin conexión, al alejar no se sale de su recorte (D6b)', async ({ page }) => {
  await abrir(page, 1440, 900);
  const mapa = page.getByTestId('mapa');
  // Se aleja hasta que el mapa no deja más.
  let previo = -1;
  await expect
    .poll(
      async () => {
        await page.getByRole('button', { name: T.mapa.alejar }).click();
        const z = Number(await mapa.getAttribute('data-zoom'));
        const quieto = z === previo;
        previo = z;
        return quieto;
      },
      { timeout: 20_000, intervals: [500] },
    )
    .toBe(true);
  const [oeste, sur, este, norte] = mapabase.recuadro as [number, number, number, number];
  const [s, o, n, e] = ((await mapa.getAttribute('data-vista')) ?? '').split(',').map(Number) as [
    number,
    number,
    number,
    number,
  ];
  // No se aleja más de lo justo para ver el recorte entero: en la medida que manda, la vista no pasa del
  // doble del recorte (a z10, el mínimo de siempre, eran unas cuatro veces su alto y nueve su ancho).
  const veces = Math.min((e - o) / (este - oeste), (n - s) / (norte - sur));
  expect(veces).toBeLessThanOrEqual(2.2);
});

test('con una capa en línea se puede alejar como siempre (z10)', async ({ page }) => {
  await abrir(page, 1440, 900);
  await page.getByRole('button', { name: T.mapa.capas }).click();
  await page.getByRole('radio', { name: new RegExp(T.capas.calle) }).click();
  const mapa = page.getByTestId('mapa');
  await expect
    .poll(
      async () => {
        await page.getByRole('button', { name: T.mapa.alejar }).click();
        return Number(await mapa.getAttribute('data-zoom'));
      },
      { timeout: 20_000, intervals: [500] },
    )
    .toBe(10);
});

// #625 (docs/33 RV-344 D1): Mis propuestas se abría sin la navegación de arriba; para ir a Ajustes había
// que volver primero al mapa. Ahora la lleva como Mapa y Ajustes, y el móvil no cambia.
test('1440 px: Mis propuestas lleva la navegación de arriba, marcada como actual (#625)', async ({ page }) => {
  await abrir(page, 1440, 900);
  await page.getByRole('banner').getByRole('link', { name: T.navegacion.misPropuestas, exact: true }).click();
  await expect(page).toHaveURL(/\/mis-propuestas$/);
  await expect(page.getByRole('heading', { level: 1, name: T.navegacion.misPropuestas })).toBeVisible();
  const arriba = page.getByRole('banner');
  for (const nombre of [T.navegacion.mapa, T.navegacion.misPropuestas, T.navegacion.ajustes]) {
    await expect(arriba.getByRole('link', { name: nombre })).toBeVisible();
  }
  await expect(arriba.getByRole('link', { name: T.navegacion.misPropuestas, exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(arriba.getByRole('link', { name: T.navegacion.mapa, exact: true })).not.toHaveAttribute(
    'aria-current',
    'page',
  );
  // El punto de las novedades sin ver, también aquí.
  await expect(page.getByTestId('punto-novedades-arriba')).toBeVisible();
  // Desde aquí, directa a Ajustes.
  await arriba.getByRole('link', { name: T.navegacion.ajustes }).click();
  await expect(page).toHaveURL(/\/ajustes$/);
  // Volver atrás sigue llevando a Mis propuestas y, con la flecha, al mapa.
  await page.goBack();
  await expect(page).toHaveURL(/\/mis-propuestas$/);
  await page.getByRole('button', { name: T.entrada.volver }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('mapa')).toBeVisible();
});

test('412 px: Mis propuestas sigue sin navegación y el mapa con la barra de abajo (#625)', async ({ page }) => {
  await abrir(page, 412, 915);
  // En el móvil, Mis propuestas se abre desde Ajustes.
  await visibles(page, T.navegacion.ajustes).click();
  await page
    .getByRole('group', { name: T.navegacion.misPropuestas })
    .getByRole('button', { name: T.ajustes.ver })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: T.navegacion.misPropuestas })).toBeVisible();
  for (const nombre of [T.navegacion.mapa, T.navegacion.misPropuestas, T.navegacion.ajustes]) {
    await expect(visibles(page, nombre)).toHaveCount(0);
  }
  await page.getByRole('button', { name: T.entrada.volver }).click();
  await expect(page).toHaveURL(/\/ajustes$/);
  await visibles(page, T.navegacion.mapa).click();
  await expect(page.getByTestId('mapa')).toBeVisible();
  for (const nombre of [T.navegacion.mapa, T.navegacion.lista, T.navegacion.ajustes]) {
    await expect(visibles(page, nombre)).toHaveCount(1);
  }
  await expect(visibles(page, T.navegacion.misPropuestas)).toHaveCount(0);
});
