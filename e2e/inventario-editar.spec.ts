// Inventario · Editar como panel lateral con mapa y los cambios marcados (docs/29 RV-124, DEC-169;
// FR-120, FR-151). Supabase simulado: las RPC responden aquí y el Registro se rellena con lo que
// haría fn_editar_punto (0038). Nunca un servidor real.

import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { T } from '../src/lib/textos.ts';
import { SUPABASE_PRUEBAS } from '../playwright.config.ts';
import { conGoogle, simularTablas } from './ayudas.ts';
import { PUNTOS } from './puntos.ts';

const BOCA = PUNTOS.find((p) => p.tipo === 'boca_riego')!;
const HIDRANTE = PUNTOS[0]!;
const OTRA = PUNTOS[1]!;

interface Llamada {
  nombre: string;
  cuerpo: Record<string, unknown>;
}

/** Metros entre dos puntos (haversine), como lib/geometria. */
function metros(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = (g: number) => (g * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

async function preparar(page: Page, extra: typeof PUNTOS = []) {
  const llamadas: Llamada[] = [];
  const registro: Record<string, unknown>[] = [];
  await conGoogle(page, 'jefe@example.org');
  await simularTablas(page, {
    v_puntos_activos: [...PUNTOS, ...extra],
    v_cola_revision: [],
    v_registro: () => registro,
    puntos: [],
    propuestas: [],
    config: [],
  });
  await page.route(`${SUPABASE_PRUEBAS}/rest/v1/rpc/*`, async (route) => {
    const nombre = new URL(route.request().url()).pathname.split('/').pop()!;
    const cuerpo = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
    llamadas.push({ nombre, cuerpo });
    const json = (d: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(d) });
    if (nombre === 'fn_es_admin') return json(true);
    if (nombre === 'fn_registrar_error') return json(null);
    if (nombre === 'fn_editar_punto') {
      // Como 0038: una sola entrada edicion_admin; si se movió, despues lleva desplazamiento_m.
      const punto = [...PUNTOS, ...extra].find((p) => p.id === cuerpo.punto_id)!;
      const cambios = cuerpo.cambios as Record<string, unknown>;
      const despues: Record<string, unknown> = { ...punto, ...cambios };
      if (typeof cambios.lat === 'number' && typeof cambios.lng === 'number') {
        despues.desplazamiento_m = Math.round(metros(punto, { lat: cambios.lat, lng: cambios.lng }) * 10) / 10;
      }
      registro.unshift({
        id: registro.length + 1,
        momento: new Date().toISOString(),
        actor: 'jefe@example.org',
        es_admin: true,
        accion: 'edicion_admin',
        punto_id: punto.id,
        codigo: punto.codigo,
        // v_registro (0002): acción, código y las claves de despues.
        resumen: ['edicion_admin', punto.codigo, Object.keys(despues).sort().join(', ')].join(' · '),
        antes: punto,
        despues,
      });
      return json(null);
    }
    return route.abort('connectionrefused');
  });
  await page.route('**/api/direccion?*', (r) =>
    r.fulfill({ contentType: 'application/json', body: JSON.stringify({ direccion: null, fuente: null }) }),
  );
  return { llamadas, registro };
}

const editarDe = (page: Page, codigo: string) =>
  page.getByRole('row').filter({ hasText: codigo }).getByRole('button', { name: T.panel.editar });

const panel = (page: Page) => page.getByRole('dialog', { name: new RegExp(`^\\S+ ${T.panelEditar.editar}$`) });

/** Toca el mapa de Editar `dx` píxeles a la derecha del pin: a zoom 18, unos 0,48 m por píxel. */
async function moverPin(page: Page, dx: number) {
  const mapa = panel(page).getByTestId('selector-pin');
  const caja = (await mapa.boundingBox())!;
  await mapa.click({ position: { x: caja.width / 2 + dx, y: caja.height / 2 } });
}

test.describe('Editar del Inventario (docs/29 RV-124)', () => {
  test.skip(({ isMobile }) => !!isMobile, 'los anchos se fijan a mano en el proyecto de escritorio');

  test('a 1440 px: panel lateral de 540 px, sin velo, con la tabla a la vista y la fila marcada', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await preparar(page);
    await page.goto('/admin/inventario');
    const boton = editarDe(page, BOCA.codigo);
    await boton.click();
    const p = panel(page);
    await expect(p).toBeVisible();
    await expect(p).toHaveAttribute('aria-modal', 'false');
    const caja = (await p.boundingBox())!;
    expect(Math.round(caja.width)).toBe(540);
    expect(Math.round(caja.x + caja.width)).toBe(1440);

    // Abre con los valores guardados, la banda del estado guardado y "No has cambiado nada".
    await expect(p.getByRole('heading')).toContainText(BOCA.codigo);
    await expect(p.getByText(T.avisosFormulario.sinCambios)).toBeVisible();
    await expect(p.getByRole('button', { name: T.panel.guardarCambios })).toBeDisabled();
    await expect(p.getByRole('radio', { name: T.formulario.granada })).toHaveAttribute('aria-checked', 'true');
    // El foco ha entrado en el panel.
    expect(await p.evaluate((d) => d.contains(document.activeElement))).toBe(true);

    // La tabla se sigue viendo y desplazando; la fila editada, marcada.
    await expect(page.getByRole('row').filter({ hasText: BOCA.codigo })).toHaveAttribute('data-editando', 'true');
    await expect(page.getByRole('cell', { name: HIDRANTE.codigo })).toBeVisible();

    // Sin cambios, Editar en otra fila cambia de punto sin preguntar.
    await editarDe(page, OTRA.codigo).click();
    await expect(p.getByRole('heading')).toContainText(OTRA.codigo);
    await expect(page.getByRole('alertdialog')).toHaveCount(0);

    // Con cambios, pregunta; "Seguir editando" se queda, "Descartar" pasa al otro punto.
    await p.getByRole('radio', { name: T.formulario.malo }).click();
    await editarDe(page, HIDRANTE.codigo).click();
    const pregunta = page.getByRole('alertdialog', { name: T.panelEditar.descartarN(1) });
    await expect(pregunta).toBeVisible();
    await expect(pregunta.getByRole('button', { name: T.panelEditar.seguirEditando })).toBeFocused();
    await pregunta.getByRole('button', { name: T.panelEditar.seguirEditando }).click();
    await expect(p.getByRole('heading')).toContainText(OTRA.codigo);
    await editarDe(page, HIDRANTE.codigo).click();
    await page.getByRole('alertdialog').getByRole('button', { name: T.panelEditar.descartar }).click();
    await expect(p.getByRole('heading')).toContainText(HIDRANTE.codigo);

    // Esc cierra sin cambios y devuelve el foco al "Editar" de la fila.
    await page.keyboard.press('Escape');
    await expect(p).toHaveCount(0);
    await expect(editarDe(page, HIDRANTE.codigo)).toBeFocused();
  });

  test('a 768 px: velo, y tocar fuera con cambios pregunta', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await preparar(page);
    await page.goto('/admin/inventario');
    await editarDe(page, BOCA.codigo).click();
    const p = panel(page);
    await expect(p).toHaveAttribute('aria-modal', 'true');
    expect(Math.round((await p.boundingBox())!.width)).toBe(500);

    // Sin cambios, tocar fuera cierra.
    await page.mouse.click(100, 500);
    await expect(p).toHaveCount(0);

    await editarDe(page, BOCA.codigo).click();
    await p.getByRole('radio', { name: T.formulario.directo }).click();
    await page.mouse.click(100, 500);
    const pregunta = page.getByRole('alertdialog', { name: T.panelEditar.descartarN(1) });
    await expect(pregunta).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(pregunta).toHaveCount(0);
    await expect(p).toBeVisible();
    // La X también pregunta; Descartar cierra.
    await p.getByRole('button', { name: T.ficha.cerrar }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: T.panelEditar.descartar }).click();
    await expect(p).toHaveCount(0);
  });

  test('a 412 px: pantalla completa, y "atrás" cierra el panel sin salir del panel de jefatura', async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 915 });
    await preparar(page);
    await page.goto('/admin/inventario');
    await editarDe(page, BOCA.codigo).click();
    const p = panel(page);
    const caja = (await p.boundingBox())!;
    expect(caja.width).toBe(412);
    expect(caja.height).toBe(915);
    // Guardar fijo abajo.
    const guardar = (await p.getByRole('button', { name: T.panel.guardarCambios }).boundingBox())!;
    expect(guardar.y + guardar.height).toBeGreaterThan(915 - 80);

    await page.goBack();
    await expect(p).toHaveCount(0);
    await expect(page).toHaveURL(/\/admin\/inventario$/);
    await expect(page.getByText(T.panel.mostrando(PUNTOS.length, PUNTOS.length))).toBeVisible();

    // Con cambios, "atrás" pregunta y no cierra hasta Descartar.
    await editarDe(page, BOCA.codigo).click();
    await p.getByRole('radio', { name: T.formulario.regular }).click();
    await page.goBack();
    await expect(page.getByRole('alertdialog', { name: T.panelEditar.descartarN(1) })).toBeVisible();
    await expect(p).toBeVisible();
    await page.getByRole('alertdialog').getByRole('button', { name: T.panelEditar.descartar }).click();
    await expect(p).toHaveCount(0);
    await expect(page).toHaveURL(/\/admin\/inventario$/);

    // Cerrar con la X quita la entrada del historial: "atrás" ya no la repite.
    await editarDe(page, BOCA.codigo).click();
    await p.getByRole('button', { name: T.ficha.cerrar }).click();
    await expect(p).toHaveCount(0);
    await expect(page).toHaveURL(/\/admin\/inventario$/);
  });

  test('flujo completo: mover el pin y cambiar el estado, guardar, y en el Registro la edición con el desplazamiento', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const { llamadas, registro } = await preparar(page);
    await page.goto('/admin/inventario');
    await editarDe(page, BOCA.codigo).click();
    const p = panel(page);

    await moverPin(page, 70);
    const ubicacion = p.locator('[data-campo="ubicacion"]');
    await expect(ubicacion).toHaveAttribute('data-cambia', 'true');
    await expect(p.getByText(T.panelEditar.conCambio(T.panelEditar.ubicacion))).toBeVisible();
    // El rótulo de antes se vuelve a pintar al moverse; el anterior se desvanece (Leaflet).
    await expect(p.locator('.rotulo-antes').last()).toHaveText(/^antes · \d+ m$/);
    // Más de 25 m: aviso de revisar la dirección, que no cambia sola.
    await expect(p.getByText(/^Has movido el punto \d+ m: revisa la dirección\.$/)).toBeVisible();
    await expect(p.getByRole('textbox', { name: T.ficha.direccion })).toHaveValue(BOCA.direccion ?? '');

    await p.getByRole('radio', { name: T.formulario.malo }).click();
    await expect(p.locator('p', { hasText: T.panelCola.cambios(2) })).toHaveText(
      T.panelEditar.resumen(
        T.panelCola.cambios(2),
        [T.panelEditar.campoUbicacion, T.panelEditar.campoEstado].join(', '),
      ),
    );
    await p.getByRole('button', { name: T.panel.guardarCambios }).click();

    await expect(page.getByRole('status').filter({ hasText: T.panelInventario.guardado(BOCA.codigo) })).toBeVisible();
    await expect(p).toHaveCount(0);
    const enviado = llamadas.filter((l) => l.nombre === 'fn_editar_punto').at(-1)!.cuerpo;
    const cambios = enviado.cambios as Record<string, number | string>;
    expect(Object.keys(cambios).sort()).toEqual(['caudal', 'lat', 'lng']);
    expect(cambios.caudal).toBe('malo');
    expect(metros(BOCA, { lat: cambios.lat as number, lng: cambios.lng as number })).toBeGreaterThan(25);
    expect(registro).toHaveLength(1);

    await page.getByRole('link', { name: T.panelCola.registro, exact: true }).click();
    const fila = page.getByRole('row').filter({ hasText: T.panelRegistro.edicionAdmin });
    await expect(fila).toContainText(BOCA.codigo);
    await expect(fila).toContainText('desplazamiento_m');
  });

  test('sin mover el pin no se envían lat ni lng; un error deja el panel abierto con lo escrito', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await preparar(page);
    const enviados: unknown[] = [];
    await page.route(`${SUPABASE_PRUEBAS}/rest/v1/rpc/fn_editar_punto`, (r) => {
      enviados.push(r.request().postDataJSON());
      return r.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'P0001',
          message: 'PUNTO_OCUPADO: otro lo está cambiando',
          details: null,
          hint: null,
        }),
      });
    });
    await page.goto('/admin/inventario');
    await editarDe(page, BOCA.codigo).click();
    const p = panel(page);
    await p.getByRole('radio', { name: T.formulario.directo }).click();
    await expect(p.locator('[data-campo="enganche"]')).toContainText(`${T.panelEditar.antes} ${T.formulario.granada}`);
    await p.getByRole('button', { name: T.panel.guardarCambios }).click();
    await expect(page.getByRole('alert').filter({ hasText: T.panelErrores.puntoOcupado })).toBeVisible();
    await expect(p).toBeVisible();
    await expect(p.getByRole('radio', { name: T.formulario.directo })).toHaveAttribute('aria-checked', 'true');
    // Sin mover el pin, la llamada no llevó la ubicación.
    expect(enviados).toEqual([{ punto_id: BOCA.id, cambios: { racor: 'directo' } }]);
  });

  test('mientras guarda no se cierra ni se cambia de punto, y al acabar cierra el mismo', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await preparar(page);
    let soltar = () => {};
    const espera = new Promise<void>((ok) => (soltar = ok));
    await page.route(`${SUPABASE_PRUEBAS}/rest/v1/rpc/fn_editar_punto`, async (r) => {
      await espera;
      await r.fulfill({ contentType: 'application/json', body: 'null' });
    });
    await page.goto('/admin/inventario');
    await editarDe(page, BOCA.codigo).click();
    const p = panel(page);
    await p.getByRole('radio', { name: T.formulario.malo }).click();
    await p.getByRole('button', { name: T.panel.guardarCambios }).click();

    const guardando = p.getByRole('button', { name: T.panelEditar.guardando });
    await expect(guardando).toBeDisabled();
    await expect(p).toHaveAttribute('aria-busy', 'true');
    await expect(p.getByRole('button', { name: T.ficha.cerrar })).toBeDisabled();
    await expect(p.getByRole('button', { name: T.panelCola.cancelar })).toBeDisabled();
    await page.keyboard.press('Escape');
    await editarDe(page, HIDRANTE.codigo).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(p.getByRole('heading')).toContainText(BOCA.codigo);

    soltar();
    await expect(page.getByRole('status').filter({ hasText: T.panelInventario.guardado(BOCA.codigo) })).toBeVisible();
    await expect(p).toHaveCount(0);
  });

  test('salir del Inventario con cambios pregunta; sin cambios, sale; y cerrar la pestaña avisa', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await preparar(page);
    await page.goto('/admin/inventario');
    await editarDe(page, BOCA.codigo).click();
    const p = panel(page);
    await p.getByRole('radio', { name: T.formulario.regular }).click();

    const registro = page.getByRole('link', { name: T.panelCola.registro, exact: true });
    await registro.click();
    const pregunta = page.getByRole('alertdialog', { name: T.panelEditar.descartarN(1) });
    await expect(pregunta).toBeVisible();
    await pregunta.getByRole('button', { name: T.panelEditar.seguirEditando }).click();
    await expect(page).toHaveURL(/\/admin\/inventario$/);
    await expect(p).toBeVisible();

    // Cerrar la pestaña con cambios: el aviso del navegador.
    let aviso = '';
    page.once('dialog', (d) => {
      aviso = d.type();
      void d.dismiss();
    });
    await page.evaluate(() => window.dispatchEvent(new Event('beforeunload', { cancelable: true })));
    const cancelado = await page.evaluate(() => {
      const e = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    });
    expect(cancelado || aviso === 'beforeunload').toBe(true);

    await registro.click();
    await page.getByRole('alertdialog').getByRole('button', { name: T.panelEditar.descartar }).click();
    await expect(page).toHaveURL(/\/admin\/registro$/);
    await expect(p).toHaveCount(0);
    // "Atrás" vuelve al Inventario, sin una entrada de Editar de más por medio.
    await page.goBack();
    await expect(page).toHaveURL(/\/admin\/inventario$/);
    await expect(p).toHaveCount(0);

    // Sin cambios, el enlace sale sin preguntar.
    await editarDe(page, BOCA.codigo).click();
    await page.getByRole('link', { name: T.panelCola.registro, exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/registro$/);
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
  });

  test('Esc en Retirar no cierra Editar, y retirar el punto que se edita cierra Editar', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await preparar(page);
    await page.route(`${SUPABASE_PRUEBAS}/rest/v1/rpc/fn_retirar_punto`, (r) =>
      r.fulfill({ contentType: 'application/json', body: 'null' }),
    );
    await page.goto('/admin/inventario');
    await editarDe(page, BOCA.codigo).click();
    const p = panel(page);
    const fila = page.getByRole('row').filter({ hasText: BOCA.codigo });

    await fila.getByRole('button', { name: T.panel.historial }).click();
    await expect(page.getByRole('dialog', { name: new RegExp(T.panel.historial) })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: new RegExp(T.panel.historial) })).toHaveCount(0);
    await expect(p).toBeVisible();

    await fila.getByRole('button', { name: T.panel.retirar }).click();
    const retirar = page.getByRole('dialog').filter({ hasText: T.panelInventario.avisoRetirar });
    await expect(retirar).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(retirar).toHaveCount(0);
    await expect(p).toBeVisible();

    await fila.getByRole('button', { name: T.panel.retirar }).click();
    await retirar.getByLabel(T.panelInventario.motivo).fill('Sustituido por obra');
    await retirar.getByRole('button', { name: T.panel.retirar }).click();
    await expect(retirar).toHaveCount(0);
    await expect(p).toHaveCount(0);
  });

  test('Esc en la pregunta de cambiar de fila sigue en el mismo punto', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await preparar(page);
    await page.goto('/admin/inventario');
    await editarDe(page, BOCA.codigo).click();
    const p = panel(page);
    await p.getByRole('radio', { name: T.formulario.malo }).click();
    await editarDe(page, HIDRANTE.codigo).click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(p.getByRole('heading')).toContainText(BOCA.codigo);
    await expect(p.getByRole('radio', { name: T.formulario.malo })).toHaveAttribute('aria-checked', 'true');
  });

  test('Guardar deshabilitado dice por qué: sin cambios, fallo vacío, otra medida vacía', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await preparar(page);
    await page.goto('/admin/inventario');
    await editarDe(page, BOCA.codigo).click();
    const p = panel(page);
    const guardar = p.getByRole('button', { name: T.panel.guardarCambios });

    await expect(guardar).toBeDisabled();
    await expect(guardar).toHaveAccessibleDescription(T.avisosFormulario.sinCambios);

    await p.getByRole('radio', { name: T.formulario.noFunciona }).click();
    await expect(guardar).toBeDisabled();
    await expect(guardar).toHaveAccessibleDescription(T.avisosFormulario.describeFallo);
    await expect(p.getByText(T.avisosFormulario.describeFallo, { exact: true })).toBeVisible();
    await p.getByRole('textbox', { name: T.formulario.descripcionFallo }).fill('No abre');
    await expect(guardar).toBeEnabled();

    await p.getByRole('radio', { name: T.formulario.otraMedida }).click();
    await expect(guardar).toBeDisabled();
    await expect(guardar).toHaveAccessibleDescription(T.avisosFormulario.indicaMedida);
    await p.getByRole('textbox', { name: T.formulario.otraMedida }).fill('60');
    await expect(guardar).toBeEnabled();
  });

  test('fuera de la zona habitual avisa y se puede guardar', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    // Dentro de los límites del check de puntos (0038), lejos de Albolote y Calicasas.
    const fuera = { ...BOCA, id: '5eed0000-0000-4000-8000-000000000099', codigo: 'BOC-9099', lat: 37.6, lng: -3.0 };
    const { llamadas } = await preparar(page, [fuera]);
    await page.goto('/admin/inventario');
    await editarDe(page, fuera.codigo).click();
    const p = panel(page);
    await expect(p.getByText(T.panelEditar.fueraDeZona)).toBeVisible();
    await moverPin(page, 20);
    await p.getByRole('button', { name: T.panel.guardarCambios }).click();
    await expect(page.getByRole('status').filter({ hasText: T.panelInventario.guardado(fuera.codigo) })).toBeVisible();
    const cambios = llamadas.filter((l) => l.nombre === 'fn_editar_punto').at(-1)!.cuerpo.cambios as Record<
      string,
      unknown
    >;
    expect(Object.keys(cambios).sort()).toEqual(['lat', 'lng']);
  });

  for (const [ancho, alto] of [
    [1440, 900],
    [768, 1024],
    [412, 915],
  ] as const) {
    for (const tema of ['light', 'dark'] as const) {
      test(`axe del panel abierto con cambios · ${ancho} px · ${tema}`, async ({ page }) => {
        await page.setViewportSize({ width: ancho, height: alto });
        await page.emulateMedia({ colorScheme: tema });
        await preparar(page);
        await page.goto('/admin/inventario');
        await editarDe(page, BOCA.codigo).click();
        const p = panel(page);
        await p.getByRole('radio', { name: T.formulario.noFunciona }).click();
        await p.getByRole('radio', { name: T.formulario.directo }).click();
        await moverPin(page, 70);
        await expect(p.getByText(T.panelCola.cambios(3))).toBeVisible();
        const { violations } = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
          .include('[role="dialog"]')
          .exclude('.leaflet-marker-pane')
          .analyze();
        expect(violations.flatMap((v) => v.nodes.map((n) => `${v.id} · ${n.target.join(' ')}`))).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(
          0,
        );
      });
    }
  }
});
