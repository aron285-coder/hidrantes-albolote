// RV-81: activar los avisos dice el motivo si falla, y la hoja no se cierra en silencio. Chromium sin
// servicio de push hace fallar a `pushManager.subscribe`; para el camino bueno se sustituye por una
// suscripción con la forma real de FCM.

import { expect, test, type Page } from '@playwright/test';
import { LISTADO } from './puntos.ts';
import { conSesion, simularRpc } from './ayudas.ts';
import { T } from '../src/lib/textos.ts';

const ENDPOINT_FCM = `https://fcm.googleapis.com/fcm/send/${'dQw4w9WgXcQ:APA91b'.padEnd(152 - 36, 'x')}`;

test.skip(({ isMobile }) => !isMobile, 'los avisos se activan en el móvil');

async function abrirAjustes(page: Page, guardada: Record<string, unknown> | null | 'falla') {
  await conSesion(page);
  await page.context().grantPermissions(['notifications']);
  // Chromium sin interfaz de CI da el permiso por denegado aunque se conceda: se fija aquí. Que no haya
  // servicio de push, que es lo que se prueba, no depende de esto.
  await page.addInitScript(() => {
    Object.defineProperty(Notification, 'permission', { get: () => 'granted', configurable: true });
    Notification.requestPermission = async () => 'granted';
  });
  await simularRpc(page, {
    fn_listar_puntos: LISTADO,
    fn_mis_propuestas: [],
    fn_registrar_error: null,
    ...(guardada === 'falla' ? {} : { fn_guardar_suscripcion_push: guardada }),
  });
  await page.goto('/ajustes');
  // El Service Worker de verdad tiene que estar listo: con la máquina cargada tarda en instalarse.
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  const interruptor = page.getByRole('switch', { name: T.ajustes.avisarResolucion });
  // Si no aparece, el build de los e2e no lleva VITE_VAPID_PUBLIC_KEY (playwright.config.ts): falla, no se salta.
  await expect(interruptor, 'sin VITE_VAPID_PUBLIC_KEY en el build no hay sección de avisos').toBeVisible();
  return interruptor;
}

test('sin servicio de push: la hoja dice el motivo y no se cierra', async ({ page }, testInfo) => {
  const interruptor = await abrirAjustes(page, null);
  await interruptor.click();
  const hoja = page.getByRole('dialog', { name: T.push.titulo });
  await hoja.getByRole('button', { name: T.push.permitir }).click();
  const motivo = hoja.getByTestId('motivo-push');
  await expect(motivo).toContainText(T.push.sinServicioPush, { timeout: 15_000 });
  await expect(motivo).toContainText(T.push.referencia('sin_servicio_push'));
  await expect(hoja).toBeVisible();
  // Se puede volver a intentar, y el interruptor no se queda deshabilitado (UI-02).
  await expect(hoja.getByRole('button', { name: T.push.reintentar })).toBeEnabled();
  // Para revisarla una persona (revisar-pantallas): no se compara.
  const captura = testInfo.outputPath('hoja-motivo.png');
  await page.screenshot({ path: captura });
  await testInfo.attach('hoja-motivo', { path: captura, contentType: 'image/png' });
  await hoja.getByRole('button', { name: T.push.cerrar }).click();
  await expect(hoja).toBeHidden();
  await expect(interruptor).toBeEnabled();
  await expect(interruptor).toHaveAttribute('aria-checked', 'false');
});

test('con una suscripción de FCM y el servidor que la guarda: queda activado', async ({ page }) => {
  await page.addInitScript((endpoint) => {
    const suscripcion = {
      endpoint,
      expirationTime: null,
      options: { applicationServerKey: null, userVisibleOnly: true },
      unsubscribe: async () => true,
      toJSON: () => ({ endpoint, expirationTime: null, keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) } }),
    };
    PushManager.prototype.getSubscription = async () => null;
    PushManager.prototype.subscribe = async () => suscripcion as unknown as PushSubscription;
  }, ENDPOINT_FCM);
  const interruptor = await abrirAjustes(page, null);
  const guardada = page.waitForRequest((r) => r.url().endsWith('/rpc/fn_guardar_suscripcion_push'));
  await interruptor.click();
  await page.getByRole('dialog', { name: T.push.titulo }).getByRole('button', { name: T.push.permitir }).click();
  const cuerpo = (await guardada).postDataJSON() as { suscripcion: { endpoint: string } };
  expect(cuerpo.suscripcion.endpoint).toBe(ENDPOINT_FCM);
  await expect(page.getByRole('dialog', { name: T.push.titulo })).toBeHidden();
  await expect(interruptor).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText(T.push.activado)).toBeVisible();
});

test('el servidor no la guarda: lo dice, con el código para jefatura', async ({ page }) => {
  await page.addInitScript((endpoint) => {
    PushManager.prototype.getSubscription = async () => null;
    PushManager.prototype.subscribe = async () =>
      ({
        endpoint,
        options: { applicationServerKey: null },
        toJSON: () => ({ endpoint, keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) } }),
      }) as unknown as PushSubscription;
  }, ENDPOINT_FCM);
  const interruptor = await abrirAjustes(page, 'falla');
  await interruptor.click();
  const hoja = page.getByRole('dialog', { name: T.push.titulo });
  await hoja.getByRole('button', { name: T.push.permitir }).click();
  await expect(hoja.getByTestId('motivo-push')).toContainText(T.push.servidorSinConexion);
  await expect(hoja.getByTestId('motivo-push')).toContainText('servidor:SERVIDOR_NO_DISPONIBLE');
  await expect(interruptor).toHaveAttribute('aria-checked', 'false');
});
