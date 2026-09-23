// Degradación controlada (FR-168, 09 Fase 8): cuando falla algo del servidor, la aplicación sigue
// sirviendo para algo y lo dice en español. Nunca una pantalla en blanco ni un error técnico.
//
// Lo que se comprueba aquí, de arriba abajo:
//   1. La base de datos no responde → siguen los puntos guardados en el móvil, con su aviso.
//   2. Las Pages Functions no responden → la entrada explica el problema y no pierde lo escrito.
//   3. El panel de jefatura → aviso equivalente, con la antigüedad de lo que enseña.
//   4. El gigabyte gratuito de fotos casi lleno → banda en Salud del sistema (TR-53).
//
// Los casos 1 y 2 tienen parientes en acceso.spec.ts (que el aviso aparece); aquí lo que importa es
// lo otro: que lo guardado se siga viendo y que no asome nada técnico.

import { expect, test, type Page } from '@playwright/test';
import { T } from '../src/lib/textos.ts';
import { SUPABASE_PRUEBAS } from '../playwright.config.ts';
import { conGoogle, conSesion, simularRpc, simularTablas } from './ayudas.ts';
import { LISTADO, PUNTOS } from './puntos.ts';

/** Nada de jerga ni de códigos internos en la pantalla (UI-04, UI-22). */
async function sinJergaTecnica(page: Page) {
  const texto = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  for (const jerga of [/PGRST/, /\b42501\b/, /TypeError/, /Failed to fetch/i, /NetworkError/i, /\bRPC\b/, /RLS/]) {
    expect(texto, `la pantalla no enseña ${jerga}`).not.toMatch(jerga);
  }
}

/** Un fallo del servidor de verdad: 503 con una página de error, no un JSON amable. */
const paginaDeError = {
  status: 503,
  contentType: 'text/html',
  body: '<html><body><h1>503 Service Temporarily Unavailable</h1></body></html>',
};

test.describe('degradación controlada (FR-168)', () => {
  test('la base de datos no responde: siguen los puntos guardados y el aviso los fecha', async ({ page }) => {
    await conSesion(page);
    await simularRpc(page, { fn_listar_puntos: LISTADO, fn_registrar_error: null, fn_mis_propuestas: [] });
    await page.goto('/');
    await expect(page.getByText(T.mapa.nPuntos(PUNTOS.length), { exact: false })).toBeVisible();

    // A partir de aquí no hay Supabase: ni RPC, ni auth, ni nada. La ruta nueva gana a la simulada.
    await page.route(`${SUPABASE_PRUEBAS}/**`, (r) => r.abort('connectionrefused'));
    await page.reload();

    await expect(page.getByText(T.mapa.sinServidor, { exact: true })).toBeVisible();
    // Lo que se guardó en el móvil sigue estando: es lo que un voluntario necesita en una salida.
    await expect(page.getByText(T.mapa.nPuntos(PUNTOS.length), { exact: false })).toBeVisible();
    await page.getByRole('link', { name: T.navegacion.lista }).click();
    await expect(page.getByText(PUNTOS[0].codigo, { exact: true }).first()).toBeVisible();
    // Y la ficha, que es donde está el dato que se consulta delante del hidrante.
    await page.getByText(PUNTOS[0].codigo, { exact: true }).first().click();
    await expect(page.getByRole('heading', { name: PUNTOS[0].codigo, exact: true })).toBeVisible();
    await sinJergaTecnica(page);
  });

  test('las funciones de servidor no responden: la entrada lo explica y conserva lo escrito', async ({ page }) => {
    await page.route('**/api/verificar-codigo', (r) => r.fulfill(paginaDeError));
    await page.goto('/');
    await page.getByLabel(T.entrada.cifra(1)).fill('1');
    await page.keyboard.type('23456');
    await page.getByLabel(T.entrada.nombre).fill('Ana');
    await page.getByLabel(T.entrada.apellido).fill('Pruebas');
    await page.getByRole('button', { name: T.entrada.entrar, exact: true }).click();

    await expect(page.getByRole('alert')).toHaveText(T.entrada.sinServidor);
    // Nombre y apellido siguen puestos: volver a escribirlos con guantes es lo último que hace falta.
    await expect(page.getByLabel(T.entrada.nombre)).toHaveValue('Ana');
    await expect(page.getByLabel(T.entrada.apellido)).toHaveValue('Pruebas');
    await expect(page.getByRole('button', { name: T.entrada.entrar, exact: true })).toBeEnabled();
    await sinJergaTecnica(page);
  });

  test.describe('panel de jefatura', () => {
    test.skip(({ isMobile }) => !!isMobile, 'el panel es de escritorio (FR-100)');

    test('el panel avisa igual y no se queda en blanco', async ({ page }) => {
      await conGoogle(page, 'jefa@example.org');
      await simularTablas(page, { v_puntos_activos: PUNTOS, v_cola_revision: [], propuestas: [] });
      await page.route(`${SUPABASE_PRUEBAS}/rest/v1/rpc/fn_es_admin`, (r) =>
        r.fulfill({ contentType: 'application/json', body: 'true' }),
      );
      await page.goto('/admin/cola');
      await expect(page.getByRole('region', { name: T.panelCola.colaRevision })).toBeVisible();

      await page.route(`${SUPABASE_PRUEBAS}/rest/v1/**`, (r) => r.fulfill(paginaDeError));
      await page.getByRole('link', { name: T.panelCola.inventario }).click();
      await expect(page.getByText(T.panel.sinServidor, { exact: false })).toBeVisible({ timeout: 20_000 });
      await expect(page.getByRole('button', { name: T.mapa.reintentar })).toBeVisible();
      await sinJergaTecnica(page);
    });

    // RV-16: si al arrancar el servidor no responde, jefatura no acaba en la pantalla de entrada.
    test('el panel sin servidor enseña los datos guardados (RV-16)', async ({ page }) => {
      await conGoogle(page, 'jefa@example.org');
      await simularTablas(page, { v_puntos_activos: PUNTOS, v_cola_revision: [], propuestas: [] });
      await page.route(`${SUPABASE_PRUEBAS}/rest/v1/rpc/fn_es_admin`, (r) =>
        r.fulfill({ contentType: 'application/json', body: 'true' }),
      );
      await page.goto('/admin/inventario');
      await expect(page.getByText(T.panel.mostrando(PUNTOS.length, PUNTOS.length))).toBeVisible();

      // Segundo arranque: el servidor no responde a nada.
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await page.route(`${SUPABASE_PRUEBAS}/**`, (r) => r.fulfill(paginaDeError));
      await page.reload();
      await expect(page.getByLabel(T.entrada.nombre)).toHaveCount(0);
      await expect(page.getByText(T.panel.mostrando(PUNTOS.length, PUNTOS.length))).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText(T.panel.sinServidor, { exact: false })).toBeVisible({ timeout: 20_000 });
      await sinJergaTecnica(page);
    });

    test('el gigabyte de fotos casi lleno: banda en Salud del sistema (TR-53)', async ({ page }) => {
      const GIGA = 1024 ** 3;
      let bytes = Math.round(GIGA * 0.5);
      const salud = () => ({
        pendientes_14d: 0,
        incidencias_abiertas: 0,
        errores_7d: 0,
        sin_direccion: 0,
        ultimo_respaldo: '2026-09-18T03:00:00Z',
        storage_bytes: bytes,
        version_zona: '2026-07-14',
        version_mapabase: '2026-07-14',
        ultima_vigilancia: '2026-09-20T07:41:00Z',
        vigilancia_ok: true,
        dispositivos_activos: 61,
      });
      await conGoogle(page, 'jefa@example.org');
      await simularTablas(page, { v_puntos_activos: PUNTOS, v_cola_revision: [], propuestas: [], config: [] });
      await page.route(`${SUPABASE_PRUEBAS}/rest/v1/rpc/*`, (route) => {
        const nombre = new URL(route.request().url()).pathname.split('/').pop()!;
        const cuerpo = { fn_es_admin: true, fn_salud: salud(), fn_novedades: [] }[nombre];
        if (cuerpo === undefined) return route.abort('connectionrefused');
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(cuerpo) });
      });

      // Medio lleno: ni banda ni alarmismo, solo el dato de siempre.
      await page.goto('/admin/ajustes');
      const salud96 = T.panelAjustes.almacenamientoLleno(96);
      await expect(page.getByText(T.panelAjustes.almacenamiento)).toBeVisible();
      await expect(page.getByText(salud96)).toBeHidden();

      // Al 96 %, la banda con qué hacer antes de que se llene.
      bytes = Math.round(GIGA * 0.96);
      await page.reload();
      await expect(page.getByText(salud96)).toBeVisible();
      await sinJergaTecnica(page);
    });
  });
});
