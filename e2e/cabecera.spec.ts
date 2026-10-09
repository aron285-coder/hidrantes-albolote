// docs/33 RV-311 (U2) y RV-324 (N3): la cabecera compacta del móvil. El estado de la sincronización va
// como una píldora a la derecha de «Puntos de agua» (al día, hace…, sin conexión, sin servidor); sin
// franjas aparte; al tocarla, el detalle. «N sin enviar» va debajo, a la derecha, sin tapar el buscador.

import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { T } from '../src/lib/textos.ts';
import { conSesion, simularRpc } from './ayudas.ts';
import { LISTADO, PUNTOS } from './puntos.ts';
import { SUPABASE_PRUEBAS } from '../playwright.config.ts';

/** Todo lo que pide el arranque: si falta una RPC, la app se cree sin servidor. */
const TODO = { fn_listar_puntos: LISTADO, fn_mis_propuestas: [], fn_registrar_error: null };

async function abrir(page: Page, respuestas: Record<string, unknown> = TODO) {
  await conSesion(page);
  await simularRpc(page, respuestas);
  await page.goto('/');
  await expect(page.getByTestId('mapa')).toBeVisible();
}

const estado = (page: Page) => page.getByRole('banner').getByTestId('estado-sincro');

/** Lo que hay entre la cabecera y el mapa: nada (ni la franja del sello ni la de conexión). */
async function hueco(page: Page) {
  const cabecera = (await page.getByRole('banner').boundingBox())!;
  const mapa = (await page.getByTestId('mapa').boundingBox())!;
  return Math.round(mapa.y - (cabecera.y + cabecera.height));
}

async function axe(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .exclude('.leaflet-marker-pane')
    .analyze();
  expect(violations.map((v) => `${v.id} · ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}

// axe sobre la pantalla entera tarda con la máquina cargada.
test.describe.configure({ timeout: 60_000 });

test.describe('cabecera compacta (RV-311)', () => {
  test('al día: punto verde «al día · 12», sin franja del sello', async ({ page }) => {
    await abrir(page);
    await expect(estado(page)).toContainText(T.mapa.alDia(PUNTOS.length));
    await expect(estado(page).locator('[data-punto="verde"]')).toHaveCount(1);
    await expect(page.getByText(/Sincronizado hace/)).toHaveCount(0);
    expect(await hueco(page)).toBeLessThanOrEqual(1);
    await axe(page);
  });

  test('sin servidor: la píldora con «Reintentar» va dentro de la barra, no en otra franja', async ({ page }) => {
    await abrir(page, { fn_listar_puntos: LISTADO, fn_registrar_error: null });
    await page.route(`${SUPABASE_PRUEBAS}/**`, (r) => r.abort('connectionrefused'));
    await page.reload();
    // El texto a la vista en la píldora (no solo en la región que oye el lector de pantalla).
    await expect(estado(page).getByRole('button', { name: new RegExp(T.mapa.sinServidor) })).toBeVisible();
    await expect(page.getByRole('banner').getByRole('button', { name: T.mapa.reintentar })).toBeVisible();
    expect(await hueco(page)).toBeLessThanOrEqual(1);
    // Al menos 80 px más de mapa que con la franja del sello y la de conexión (U2): a 412 × 915 el
    // mapa empieza justo bajo la banda de pruebas y la barra de 48 px.
    const mapa = (await page.getByTestId('mapa').boundingBox())!;
    if ((page.viewportSize()?.width ?? 0) < 768) expect(mapa.y).toBeLessThanOrEqual(24 + 48 + 1);
    await axe(page);
  });

  test('sin cobertura: punto gris «sin conexión», con la fecha de los datos (FR-80)', async ({ page, context }) => {
    await abrir(page);
    await expect(estado(page)).toContainText(T.mapa.alDia(PUNTOS.length));
    await context.setOffline(true);
    await expect(estado(page)).toContainText(T.mapa.sinConexionHace(T.formato.haceUnMomento));
    await expect(estado(page).locator('[data-punto="gris"]')).toHaveCount(1);
    expect(await hueco(page)).toBeLessThanOrEqual(1);
    await axe(page);
    // Sin cobertura, «Sincronizar ahora» está deshabilitado y dice por qué (UI-03).
    await estado(page).getByRole('button').first().click();
    const boton = page
      .getByRole('dialog', { name: T.sincro.titulo })
      .getByRole('button', { name: T.sincro.sincronizarAhora });
    await expect(boton).toBeDisabled();
    await expect(boton).toHaveAccessibleDescription(T.mapa.necesitaCobertura);
    await context.setOffline(false);
  });

  test('con más de una hora: punto ámbar «hace 2 h»', async ({ page }) => {
    await page.clock.install();
    await abrir(page);
    await expect(estado(page)).toContainText(T.mapa.alDia(PUNTOS.length));
    // Dos horas sin volver a sincronizar (la app sigue abierta y sin abrirse de nuevo).
    await page.clock.fastForward('02:01:00');
    await expect(estado(page)).toContainText(T.formato.haceHoras(2));
    await expect(estado(page).locator('[data-punto="ambar"]')).toHaveCount(1);
    await axe(page);
  });

  test('tocar el estado abre el detalle; «Sincronizar ahora» pide los puntos', async ({ page }) => {
    await abrir(page);
    await estado(page).getByRole('button').first().click();
    const hoja = page.getByRole('dialog', { name: T.sincro.titulo });
    await expect(hoja).toBeVisible();
    await expect(hoja).toContainText(T.sincro.ultima);
    await expect(hoja).toContainText(T.sincro.puntosGuardados(PUNTOS.length));
    await axe(page);
    const peticion = page.waitForRequest(/fn_listar_puntos/);
    await hoja.getByRole('button', { name: T.sincro.sincronizarAhora }).click();
    await peticion;
    await expect(hoja.getByRole('status')).toHaveCount(0);
  });

  test('si «Sincronizar ahora» no sale, lo dice', async ({ page }) => {
    await abrir(page);
    await page.route('**/rest/v1/rpc/fn_listar_puntos', (r) =>
      r.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"x"}' }),
    );
    await estado(page).getByRole('button').first().click();
    const hoja = page.getByRole('dialog', { name: T.sincro.titulo });
    await hoja.getByRole('button', { name: T.sincro.sincronizarAhora }).click();
    await expect(hoja.getByRole('status')).toHaveText(T.sincro.noSeHaPodido);
  });

  test('a 360 px, sin servidor, la cabecera no se sale de la pantalla', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await abrir(page, { fn_listar_puntos: LISTADO, fn_registrar_error: null });
    await page.route(`${SUPABASE_PRUEBAS}/**`, (r) => r.abort('connectionrefused'));
    await page.reload();
    const reintentar = page.getByRole('banner').getByRole('button', { name: T.mapa.reintentar });
    await expect(reintentar).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    const b = (await reintentar.boundingBox())!;
    expect(b.x + b.width).toBeLessThanOrEqual(360);
    await expect(page.getByRole('heading', { name: T.navegacion.puntosDeAgua })).toBeVisible();
  });
});

test('«N sin enviar» no tapa el ✕ del buscador (RV-324)', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 1100, 'en ordenador el buscador va en la lista');
  await abrir(page);
  await page.evaluate(
    () =>
      new Promise<void>((ok, ko) => {
        const abrirBd = indexedDB.open('hidrantes');
        abrirBd.onerror = () => ko(abrirBd.error);
        abrirBd.onsuccess = () => {
          const t = abrirBd.result.transaction('cola', 'readwrite');
          t.objectStore('cola').put({
            clave_local: 'k-n3',
            creada_en: Date.now(),
            rpc: 'fn_proponer_estado',
            args: { clave_local: 'k-n3', operacion: 'estado', punto_id: 'x', datos: {} },
            foto: null,
            foto_path: null,
            codigo: 'HID-9001',
            intentos: 0,
            proximo: 0,
            fallo: 'PAYLOAD_INVALIDO(caudal)',
          });
          t.oncomplete = () => ok();
        };
      }),
  );
  await page.reload();
  await expect(page.getByRole('link', { name: T.mapa.sinEnviar(1) })).toBeVisible();
  await page.getByRole('searchbox', { name: T.mapa.buscar }).fill('HID');
  const aspa = page.getByRole('button', { name: T.mapa.borrarBusqueda });
  await expect(aspa).toBeVisible();
  // Arriba del todo del ✕ (los 8 px que tapaba el enlace) y su centro: los dos son del ✕.
  const tapado = () =>
    aspa.evaluate((b) => {
      const c = b.getBoundingClientRect();
      return [
        [c.x + c.width / 2, c.y + 2],
        [c.x + c.width / 2, c.y + c.height / 2],
      ].filter(([x, y]) => !b.contains(document.elementFromPoint(x!, y!))).length;
    });
  await expect.poll(tapado).toBe(0);
});
