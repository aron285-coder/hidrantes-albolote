// El presupuesto de rendimiento que se puede medir en CI (TR-10, TR-14), con la red frenada a 3G:
// 1,6 Mbit/s y 300 ms de latencia, como dice 03. Lo mide en el móvil emulado, que es donde importa.
//
// TR-11 (tamaño del JavaScript inicial) lo mide `npm run presupuesto`; TR-13 (búsqueda con 1.000
// puntos), los unitarios de src/lib/rendimiento.test.ts; TR-12 (fluidez al arrastrar el mapa) pide
// un móvil real y se anota a mano en la verificación de la fase.

import { expect, test, type Page } from '@playwright/test';
import { T } from '../src/lib/textos.ts';
import { conSesion, simularRpc } from './ayudas.ts';
import { LISTADO, PUNTOS } from './puntos.ts';

/** 3G de 03: 1,6 Mbit/s de bajada, 750 kbit/s de subida, 300 ms de ida y vuelta. */
async function frenarA3G(page: Page): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 300,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });
}

/** Mil puntos como los que habrá dentro de unos años, con los campos que usa el mapa. */
function milPuntos() {
  const base = PUNTOS[0];
  return Array.from({ length: 1000 }, (_, i) => ({
    ...base,
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    codigo: `HID-${String(i + 1).padStart(4, '0')}`,
    descripcion: `[PRUEBA] Punto ${i}`,
    direccion: `Calle Prueba ${i}`,
    lat: 37.2 + (i % 100) * 0.0004,
    lng: -3.66 + Math.floor(i / 100) * 0.0004,
  }));
}

// Solo en el móvil emulado: en escritorio el mismo frenado mediría otra cosa y duplicaría el tiempo
// de CI sin decir nada nuevo.
test.describe('presupuesto de rendimiento', () => {
  test.skip(({ isMobile }) => !isMobile, 'se mide en el móvil emulado');

  test('la primera pantalla útil llega en menos de 3 s con 3G (TR-10)', async ({ page }) => {
    await conSesion(page);
    await simularRpc(page, { fn_listar_puntos: LISTADO, fn_registrar_error: null });
    await frenarA3G(page);

    const empezado = Date.now();
    await page.goto('/');
    // Útil = el mapa con sus puntos, no un armazón vacío (TR-10).
    await expect(page.getByTestId('mapa')).toBeVisible();
    await expect(page.getByText(T.mapa.nPuntos(PUNTOS.length), { exact: false })).toBeVisible();
    const tardado = Date.now() - empezado;

    console.log(`TR-10 · primera pantalla útil con 3G: ${(tardado / 1000).toFixed(2)} s`);
    expect(tardado).toBeLessThan(3000);
  });

  test('sincronizar 1.000 puntos con 3G termina en menos de 10 s (TR-14)', async ({ page }) => {
    const puntos = milPuntos();
    await conSesion(page);
    await simularRpc(page, {
      fn_listar_puntos: { ...LISTADO, puntos, sincronizado_en: '2026-09-19T10:00:00Z' },
      fn_registrar_error: null,
    });
    await frenarA3G(page);

    const empezado = Date.now();
    await page.goto('/');
    await expect(page.getByText(T.mapa.nPuntos(1000), { exact: false })).toBeVisible({ timeout: 30_000 });
    const tardado = Date.now() - empezado;

    console.log(`TR-14 · 1.000 puntos sincronizados con 3G: ${(tardado / 1000).toFixed(2)} s`);
    expect(tardado).toBeLessThan(10_000);
  });

  test('con 1.000 puntos, buscar en el móvil responde al momento (TR-13 en pantalla)', async ({ page }) => {
    const puntos = milPuntos();
    await conSesion(page);
    await simularRpc(page, {
      fn_listar_puntos: { ...LISTADO, puntos, sincronizado_en: '2026-09-19T10:00:00Z' },
      fn_registrar_error: null,
    });
    await page.goto('/');
    await expect(page.getByText(T.mapa.nPuntos(1000), { exact: false })).toBeVisible({ timeout: 30_000 });

    // La búsqueda es local: sin red de por medio, el límite de TR-13 es el del algoritmo.
    const empezado = Date.now();
    await page.getByPlaceholder(T.mapa.buscar).fill('HID-0500');
    await expect(page.getByText('HID-0500').first()).toBeVisible();
    expect(Date.now() - empezado).toBeLessThan(1000);
  });
});
