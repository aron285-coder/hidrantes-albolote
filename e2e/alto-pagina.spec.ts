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
}

/** La página no se desplaza: ni mide más que la ventana ni se mueve al pedirle bajar. */
async function paginaQuieta(page: Page, info: TestInfo) {
  const { alto, ventana } = await page.evaluate(() => ({
    alto: document.documentElement.scrollHeight,
    ventana: innerHeight,
  }));
  await page.evaluate(() => scrollTo(0, 10000));
  // Para el PR: tras pedir bajar del todo, la cabecera sigue arriba y no queda una franja vacía.
  await info.attach('tras-bajar', { body: await page.screenshot(), contentType: 'image/png' });
  expect(alto, 'alto de la página').toBeLessThanOrEqual(ventana);
  expect(await page.evaluate(() => scrollY), 'la página no se mueve').toBe(0);
}

/** La lista sí se desplaza: su contenedor tiene más contenido que alto y baja al pedírselo. */
async function listaSeDesplaza(page: Page) {
  const desplazado = await primero(page).evaluate((boton) => {
    let caja: HTMLElement | null = boton.parentElement;
    while (caja && getComputedStyle(caja).overflowY !== 'auto') caja = caja.parentElement;
    if (!caja || caja.scrollHeight <= caja.clientHeight) return 0;
    caja.scrollTop = 10000;
    return caja.scrollTop;
  });
  expect(desplazado, 'la lista se desplaza').toBeGreaterThan(0);
}

const ESCRITORIO = [
  [1440, 900],
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
        await listaSeDesplaza(page);
      });
    }
  }

  // En el móvil el mapa no lleva lista lateral; la pestaña Lista se desplaza por dentro, como en el ordenador.
  for (const ruta of ['/', '/lista']) {
    test(`412×915 en ${ruta}`, async ({ page, context }, info) => {
      await abrir(page, context, 412, 915, ruta, ruta === '/lista');
      await paginaQuieta(page, info);
      if (ruta === '/lista') await listaSeDesplaza(page);
    });
  }
});
