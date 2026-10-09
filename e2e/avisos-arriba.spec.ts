// docs/32 RV-238: los avisos de arriba van en un contenedor común que los apila, y el mapa baja su
// margen superior mientras hay avisos: el buscador y la barra de estado no quedan tapados.

import { expect, test, type Locator } from '@playwright/test';
import { T } from '../src/lib/textos.ts';
import { conSesion, simularRpc } from './ayudas.ts';
import { LISTADO, PUNTOS } from './puntos.ts';

const APROBADA = {
  id: 'r1',
  clave_local: 'k-r1',
  operacion: 'datos',
  punto_id: PUNTOS[0].id,
  codigo: PUNTOS[0].codigo,
  datos: {},
  estado: 'aprobada',
  motivo_rechazo: null,
  correcciones: null,
  creada_en: new Date().toISOString(),
  revisada_en: new Date().toISOString(),
};

const caja = async (l: Locator) => {
  const c = await l.boundingBox();
  expect(c, 'sin caja').not.toBeNull();
  return c!;
};

test.describe('avisos de arriba (RV-238)', () => {
  test.skip(({ isMobile }) => !isMobile, 'el buscador sobre el mapa es del móvil y la tableta');

  test('a 360 px, el aviso de novedades no tapa el buscador ni la barra de estado', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    // Ya había entrado antes (hay propuestas vistas): lo aprobado desde entonces es una novedad.
    await conSesion(page, { extra: { propuestas_vistas: {} } });
    await simularRpc(page, { fn_listar_puntos: LISTADO, fn_mis_propuestas: [APROBADA], fn_registrar_error: null });
    await page.goto('/');
    const aviso = page.getByRole('status').filter({ hasText: T.misPropuestas.aprobadaAviso(PUNTOS[0].codigo) });
    await expect(aviso).toBeVisible();
    const buscador = page.getByRole('searchbox', { name: T.mapa.buscar });
    await expect(buscador).toBeVisible();

    // El mapa baja cuando aparece el aviso: hay que esperar a que se recoloque.
    await expect
      .poll(async () => (await caja(buscador)).y - ((await caja(aviso)).y + (await caja(aviso)).height))
      .toBeGreaterThanOrEqual(0);
    // Y no tapa la barra superior, que en staging lleva encima la banda de pruebas.
    const barra = await caja(page.locator('header').first());
    expect((await caja(aviso)).y, 'el aviso empieza bajo la barra').toBeGreaterThanOrEqual(barra.y + barra.height);
    const sello = page.getByText(T.mapa.nPuntos(PUNTOS.length), { exact: false });
    const a = await caja(aviso);
    expect((await caja(sello)).y, 'la barra de estado queda debajo del aviso').toBeGreaterThanOrEqual(a.y + a.height);

    // Lo que hay en el sitio del buscador es el buscador, no el aviso.
    const b = await caja(buscador);
    const encima = await page.evaluate(
      ([x, y]) => document.elementFromPoint(x, y)?.closest('input, [role=status]')?.tagName ?? null,
      [b.x + b.width / 2, b.y + b.height / 2],
    );
    expect(encima).toBe('INPUT');

    // Al cerrar el aviso, el mapa vuelve a subir.
    await aviso.getByRole('button', { name: T.ficha.cerrar }).click();
    await expect(aviso).toHaveCount(0);
    await expect.poll(async () => (await caja(buscador)).y).toBeLessThan(b.y);
  });
});
