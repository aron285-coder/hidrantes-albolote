// #562 (RV-270 D2): en el ordenador, la página del mapa y la de la lista medían siempre más que la
// ventana (1175 px; 1252 en /lista) y la rueda del ratón subía la página entera: se iban la cabecera y
// el buscador. La página mide la ventana; lo único que se desplaza es la lista.

import { expect, test, type BrowserContext, type Page, type TestInfo } from '@playwright/test';
import { T } from '../src/lib/textos.ts';
import { conSesion, simularRpc } from './ayudas.ts';
import { LISTADO, PUNTOS } from './puntos.ts';

// Muchos puntos, como en staging: la lista es más larga que cualquier ventana.
const MUCHOS = Array.from({ length: 120 }, (_, i) => {
  const base = PUNTOS[i % PUNTOS.length]!;
  return {
    ...base,
    id: `5eed0000-0000-4000-8000-${String(1000 + i).padStart(12, '0')}`,
    codigo: `${base.codigo.slice(0, 4)}${String(5000 + i)}`,
    lat: base.lat + Math.floor(i / PUNTOS.length) * 0.0004,
  };
});

const primero = (page: Page) => page.getByRole('button', { name: new RegExp(MUCHOS[0]!.codigo) }).first();

/**
 * Con la posición conocida, como en el recorrido: cada fila lleva la distancia y un texto solo para el
 * lector de pantalla («desde ti»), que es lo que se salía de la lista y estiraba la página.
 */
async function abrir(page: Page, context: BrowserContext, ancho: number, alto: number, ruta: string, conLista = true) {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: PUNTOS[0]!.lat, longitude: PUNTOS[0]!.lng });
  await page.setViewportSize({ width: ancho, height: alto });
  await conSesion(page);
  await simularRpc(page, { fn_listar_puntos: { ...LISTADO, puntos: MUCHOS }, fn_registrar_error: null });
  await page.goto(ruta);
  if (ruta === '/') await expect(page.getByTestId('mapa')).toBeVisible();
  if (conLista) await expect(primero(page)).toContainText(T.mapa.desdeTi);
  // Se mide con los avisos de arriba ya puestos (el de sin conexión, con el Supabase ficticio): ocupan alto.
  await expect(page.getByText(T.mapa.sinServidor).first()).toBeVisible();
}

const altoPagina = (page: Page) => page.evaluate(() => document.documentElement.scrollHeight);
const ventana = (page: Page) => page.evaluate(() => innerHeight);

/** La página no se desplaza: ni mide más que la ventana ni se mueve al pedirle bajar. */
async function paginaQuieta(page: Page, info: TestInfo) {
  const alto = await ventana(page);
  await expect.poll(() => altoPagina(page), { message: 'alto de la página' }).toBeLessThanOrEqual(alto);
  await page.evaluate(() => scrollTo(0, 10000));
  // Para el PR: tras pedir bajar del todo, la cabecera sigue arriba y no queda una franja vacía.
  await info.attach('tras-bajar', { body: await page.screenshot(), contentType: 'image/png' });
  expect(await page.evaluate(() => scrollY), 'la página no se mueve').toBe(0);
}

/** La caja de la lista que se desplaza (la primera antecesora con overflow-y: auto). */
const cajaLista = (page: Page) =>
  primero(page).evaluateHandle((boton) => {
    let caja: HTMLElement | null = boton.parentElement;
    while (caja && getComputedStyle(caja).overflowY !== 'auto') caja = caja.parentElement;
    return caja;
  });

/**
 * La lista llega hasta la barra de abajo (no se ha encogido para que la página quepa) y se desplaza: su
 * caja tiene más contenido que alto y baja al pedírselo.
 */
async function listaSeDesplaza(page: Page) {
  const caja = await cajaLista(page);
  const { abajo, desplazado } = await caja.evaluate((c) => {
    if (!(c instanceof HTMLElement)) return { abajo: 0, desplazado: 0 };
    const abajo = c.getBoundingClientRect().bottom;
    if (c.scrollHeight <= c.clientHeight) return { abajo, desplazado: 0 };
    c.scrollTop = 10000;
    return { abajo, desplazado: c.scrollTop };
  });
  // La barra de abajo (la de «Lista»); en el ordenador no hay (docs/33 RV-321) y el límite es la ventana.
  const navAbajo = page.getByRole('navigation').filter({ has: page.getByRole('link', { name: T.navegacion.lista }) });
  const barra = (await navAbajo.count()) ? (await navAbajo.boundingBox())! : { y: await ventana(page) };
  expect(abajo, 'la lista llega a la barra de abajo').toBeGreaterThanOrEqual(barra.y - 8);
  expect(abajo, 'la lista no se mete bajo la barra de abajo').toBeLessThanOrEqual(barra.y + 1);
  expect(desplazado, 'la lista se desplaza').toBeGreaterThan(0);
}

/** El mapa no se ha encogido para que la página quepa: mide al menos media ventana de alto. */
async function mapaAlto(page: Page) {
  const mapa = (await page.getByTestId('mapa').boundingBox())!;
  expect(mapa.height, 'alto del mapa').toBeGreaterThanOrEqual((await ventana(page)) / 2);
}

const ESCRITORIO = [
  [1440, 900],
  // docs/33 RV-321: también con una ventana más baja de ordenador.
  [1440, 700],
  [1280, 800],
  [1280, 768],
] as const;

test.describe('la página del mapa y de la lista mide la ventana (#562)', () => {
  // Los tamaños los fija cada prueba: con el proyecto de escritorio basta.
  test.skip(({ isMobile }) => !!isMobile, 'los tamaños se fijan a mano en el proyecto de escritorio');

  for (const [ancho, alto] of ESCRITORIO) {
    for (const ruta of ['/', '/lista']) {
      test(`${ancho}×${alto} en ${ruta}`, async ({ page, context }, info) => {
        await abrir(page, context, ancho, alto, ruta);
        await paginaQuieta(page, info);
        if (ruta === '/') await mapaAlto(page);
        await listaSeDesplaza(page);
      });
    }
  }

  // En el móvil el mapa no lleva lista lateral; la pestaña Lista se desplaza por dentro, como en el ordenador.
  for (const ruta of ['/', '/lista']) {
    test(`412×915 en ${ruta}`, async ({ page, context }, info) => {
      await abrir(page, context, 412, 915, ruta, ruta === '/lista');
      await paginaQuieta(page, info);
      if (ruta === '/') await mapaAlto(page);
      if (ruta === '/lista') await listaSeDesplaza(page);
    });
  }

  // Ajustes no se ha acotado: con contenido más largo que la ventana, la página sigue desplazándose.
  test('1280×768 en /ajustes: la página sigue desplazándose', async ({ page, context }) => {
    await abrir(page, context, 1280, 768, '/ajustes', false);
    await expect(page.getByRole('heading', { name: T.ajustes.seccionNovedades })).toBeVisible();
    await expect.poll(() => altoPagina(page)).toBeGreaterThan(768);
    await page.evaluate(() => scrollTo(0, 10000));
    expect(await page.evaluate(() => scrollY), 'Ajustes se desplaza').toBeGreaterThan(0);
  });

  // Ventana baja (móvil en horizontal): sin sitio para acotar, la página crece como antes y, al bajar del
  // todo, el «+» queda por encima de la barra de abajo, sin taparse.
  test('844×390 en /: el «+» no queda bajo la barra de abajo', async ({ page, context }) => {
    await abrir(page, context, 844, 390, '/', false);
    await page.evaluate(() => scrollTo(0, 10000));
    const mas = (await page.getByRole('button', { name: T.navegacion.nuevoPunto }).boundingBox())!;
    const barra = (await page.getByRole('navigation').last().boundingBox())!;
    expect(mas.y + mas.height, '«+» encima de la barra').toBeLessThanOrEqual(barra.y);
  });
});
