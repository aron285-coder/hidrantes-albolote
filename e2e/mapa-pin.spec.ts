// docs/32 RV-243: el mapa del pin lleva su atribución y avisa sin cobertura y sin mapa base; y
// «N sin enviar» de la barra de estado se puede tocar entero (sus 44 px no quedan bajo la cabecera).

import { expect, test } from '@playwright/test';
import { T } from '../src/lib/textos.ts';
import { conSesion, simularRpc } from './ayudas.ts';
import { LISTADO, PUNTOS } from './puntos.ts';

test.describe('mapa del pin (RV-243)', () => {
  test('lleva la atribución de lo que se ve', async ({ page }) => {
    await conSesion(page);
    await simularRpc(page, { fn_listar_puntos: LISTADO, fn_registrar_error: null });
    await page.goto('/proponer/alta');
    await expect(page.getByTestId('selector-pin')).toBeVisible();
    await expect(page.getByTestId('atribucion-pin')).toHaveText(T.mapa.atribucionBase);
  });

  test('sin conexión y sin mapa base descargado, lo avisa encima del mapa', async ({ page, context }) => {
    // Datos móviles: el mapa base no se descarga solo (FR-81).
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'connection', { value: { type: 'cellular', saveData: false } });
    });
    await conSesion(page);
    await simularRpc(page, { fn_listar_puntos: LISTADO, fn_registrar_error: null });
    await page.goto('/proponer/alta');
    await expect(page.getByTestId('selector-pin')).toBeVisible();
    await expect(page.getByTestId('aviso-pin-sin-mapa')).toHaveCount(0);
    await context.setOffline(true);
    await expect(page.getByTestId('aviso-pin-sin-mapa')).toHaveText(T.operaciones.pinSinMapa);
    await context.setOffline(false);
    await expect(page.getByTestId('aviso-pin-sin-mapa')).toHaveCount(0);
  });
});

test('«N sin enviar» se toca en sus cuatro bordes (RV-243, UI-15)', async ({ page }) => {
  await conSesion(page);
  await simularRpc(page, { fn_listar_puntos: LISTADO, fn_registrar_error: null });
  await page.goto('/');
  await expect(page.getByTestId('estado-sincro')).toHaveAttribute('data-puntos', String(PUNTOS.length));
  await page.evaluate(
    () =>
      new Promise<void>((ok, ko) => {
        const abrir = indexedDB.open('hidrantes');
        abrir.onerror = () => ko(abrir.error);
        abrir.onsuccess = () => {
          const t = abrir.result.transaction('cola', 'readwrite');
          t.objectStore('cola').put({
            clave_local: 'k-borde',
            creada_en: Date.now(),
            args: { clave_local: 'k-borde', operacion: 'estado', punto_id: 'x', datos: {} },
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
  const enlace = page.getByRole('link', { name: T.mapa.sinEnviar(1) });
  await expect(enlace).toBeVisible();
  // El sello de la barra cambia de texto al sincronizar y mueve el enlace: se mide y se toca en el
  // mismo instante, y se espera a que quede quieto.
  const fuera = () =>
    enlace.evaluate((a) => {
      const c = a.getBoundingClientRect();
      const bordes: Record<string, [number, number]> = {
        arriba: [c.x + c.width / 2, c.y + 1],
        abajo: [c.x + c.width / 2, c.bottom - 1],
        izquierda: [c.x + 1, c.y + c.height / 2],
        derecha: [c.right - 1, c.y + c.height / 2],
      };
      const malos = Object.entries(bordes)
        .filter(([, [x, y]]) => !a.contains(document.elementFromPoint(x, y)))
        .map(([b]) => b);
      return c.height >= 44 ? malos : ['menos de 44 px', ...malos];
    });
  await expect.poll(fuera, { message: 'bordes de «N sin enviar» que no se pueden tocar' }).toEqual([]);
});
