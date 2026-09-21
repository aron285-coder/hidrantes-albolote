// Aviso de lo que lleva demasiado tiempo en la cola local (TR-06, FR-83). Lo que TR-04 promete —que
// salga solo al volver la señal, y en menos de un minuto— se comprueba en operaciones.spec.ts, con
// los envíos creados desde la pantalla.
//
// Aquí el servidor no responde (es lo que deja un envío atascado), así que la cola no se vacía y el
// reloj del envío es lo único que cambia entre los dos casos.

import { expect, test, type Page } from '@playwright/test';
import { T } from '../src/lib/textos.ts';
import { conSesion, simularRpc } from './ayudas.ts';
import { LISTADO, PUNTOS } from './puntos.ts';

const [P0] = PUNTOS;

/** Deja un envío en la cola local del móvil, creado hace `horas`. */
async function encolar(page: Page, horas: number, clave: string): Promise<void> {
  await page.evaluate(
    ([clave, desde, puntoId, codigo]) =>
      new Promise<void>((ok, fallo) => {
        const abrir = indexedDB.open('hidrantes');
        abrir.onerror = () => fallo(abrir.error);
        abrir.onsuccess = () => {
          const t = abrir.result.transaction('cola', 'readwrite');
          t.objectStore('cola').put({
            clave_local: clave,
            creada_en: Date.now() - (desde as number),
            args: {
              clave_local: clave,
              operacion: 'estado',
              punto_id: puntoId,
              datos: { caudal: 'regular' },
              token: 'a'.repeat(43),
              nombre: 'Voluntaria',
              apellido: 'Pruebas',
            },
            foto: null,
            foto_path: null,
            codigo,
            intentos: 0,
            proximo: 0,
            fallo: null,
          });
          t.oncomplete = () => ok();
          t.onerror = () => fallo(t.error);
        };
      }),
    [clave, horas * 3600_000, P0.id, P0.codigo] as const,
  );
}

test.beforeEach(async ({ page }) => {
  await conSesion(page);
  // fn_proponer no está en la lista: responde como un servidor caído, que es lo que atasca la cola.
  await simularRpc(page, { fn_listar_puntos: LISTADO, fn_registrar_error: null, fn_mis_propuestas: [] });
  await page.goto('/');
  await expect(page.getByText(T.mapa.nPuntos(PUNTOS.length))).toBeVisible();
});

test('un envío que lleva más de 24 h esperando se avisa (TR-06, FR-83)', async ({ page }) => {
  await encolar(page, 25, 'k-vieja');
  await page.reload();
  await expect(page.getByRole('link', { name: T.mapa.sinEnviar(1) })).toBeVisible();
  await expect(page.getByText(T.misPropuestas.esperando24h)).toBeVisible();
});

test('lo de hace un rato no se avisa: esperar un poco es normal (TR-06)', async ({ page }) => {
  await encolar(page, 2, 'k-reciente');
  await page.reload();
  await expect(page.getByRole('link', { name: T.mapa.sinEnviar(1) })).toBeVisible();
  await expect(page.getByText(T.misPropuestas.esperando24h)).toHaveCount(0);
});
