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

/**
 * `vista`: los puntos que devuelve la vista en cada sincronización; cambiarla es como si otro
 * administrador hubiera cambiado un punto (docs/31 RV-165).
 */
async function preparar(page: Page, extra: typeof PUNTOS = [], vista?: { lista: typeof PUNTOS }) {
  const llamadas: Llamada[] = [];
  const registro: Record<string, unknown>[] = [];
  await conGoogle(page, 'jefe@example.org');
  await simularTablas(page, {
    v_puntos_activos: () => vista?.lista ?? [...PUNTOS, ...extra],
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
    // Qué cambió, con palabras (docs/30 RV-127): el estado nuevo y "Movido N m", sin claves técnicas.
    await expect(fila).toContainText(new RegExp(`${T.panelRegistro.campos.caudal}: [^·]+ → ${T.formulario.malo}`));
    await expect(fila).toContainText(/Movido \d+(,\d)? m/);
    await expect(fila).not.toContainText(/desplazamiento_m|actualizado_en|\blat\b|\blng\b/);
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

// docs/30 RV-128: con una ventana modal abierta, el resto de la página queda inert y Tab no sale de
// ella. Editar al lado de la tabla (>= 1100 px) no es modal: la tabla sigue a mano (DEC-169).
test.describe('El foco no se escapa de las ventanas del panel (docs/30 RV-128)', () => {
  test.skip(({ isMobile }) => !!isMobile, 'los anchos se fijan a mano en el proyecto de escritorio');

  type Sitio = 'editar' | 'ventana' | 'raiz' | 'body' | 'otro';
  interface Foco {
    sitio: Sitio;
    etiqueta: string | null;
  }
  /** Dónde está el foco: en Editar, en otra ventana (Retirar…), en la página (#raiz) o en ninguna parte. */
  const dondeFoco = (page: Page) =>
    page.evaluate((): Foco => {
      const a = document.activeElement;
      const etiqueta = a?.getAttribute('aria-label') ?? null;
      if (!a || a === document.body) return { sitio: 'body', etiqueta };
      if (a.closest('[role="dialog"][data-forma]')) return { sitio: 'editar', etiqueta };
      if (a.closest('[role="dialog"], [role="alertdialog"]')) return { sitio: 'ventana', etiqueta };
      if (a.closest('#raiz')) return { sitio: 'raiz', etiqueta };
      return { sitio: 'otro', etiqueta };
    });
  async function tabular(page: Page, veces: number) {
    const sitios: Foco[] = [];
    for (let i = 0; i < veces; i++) {
      await page.keyboard.press('Tab');
      sitios.push(await dondeFoco(page));
    }
    return sitios;
  }
  async function axe(page: Page) {
    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .exclude('.leaflet-marker-pane')
      .analyze();
    expect(violations.flatMap((v) => v.nodes.map((n) => `${v.id} · ${n.target.join(' ')}`))).toEqual([]);
  }
  const inertes = (page: Page) => page.evaluate(() => document.querySelectorAll('[inert]').length);

  test('a 768 px, con Editar abierto, Tab da la vuelta dentro del panel y nunca llega a la tabla', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await preparar(page);
    await page.goto('/admin/inventario');
    await editarDe(page, BOCA.codigo).click();
    const p = panel(page);
    await expect(p).toHaveAttribute('aria-modal', 'true');
    expect(await p.evaluate((d) => d.contains(document.activeElement))).toBe(true);
    await expect(page.locator('#raiz')).toHaveAttribute('inert', '');

    const sitios = await tabular(page, 80);
    // Fuera del panel solo puede estar "en ninguna parte" (la barra del navegador, al dar la vuelta).
    expect(sitios.filter((s) => s.sitio !== 'editar' && s.sitio !== 'body')).toEqual([]);
    // Desde el último control vuelve al primero del panel: la X de cerrar.
    expect(sitios.some((s) => s.sitio === 'editar' && s.etiqueta === T.ficha.cerrar)).toBe(true);
    await axe(page);

    // Al cerrar no queda nada inert.
    await page.keyboard.press('Escape');
    await expect(p).toHaveCount(0);
    expect(await inertes(page)).toBe(0);
  });

  test('a 1440 px, con Editar al lado de la tabla, Tab sí llega a la tabla', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await preparar(page);
    await page.goto('/admin/inventario');
    await editarDe(page, BOCA.codigo).click();
    const p = panel(page);
    await expect(p).toHaveAttribute('aria-modal', 'false');
    expect(await inertes(page)).toBe(0);
    const sitios = await tabular(page, 80);
    expect(sitios.some((s) => s.sitio === 'raiz')).toBe(true);
    await axe(page);
  });

  test('al estrechar la ventana con el foco en la tabla, Editar pasa a modal y el foco entra en él', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await preparar(page);
    await page.goto('/admin/inventario');
    await editarDe(page, BOCA.codigo).click();
    const p = panel(page);
    await expect(p).toHaveAttribute('aria-modal', 'false');
    await editarDe(page, HIDRANTE.codigo).focus();
    expect((await dondeFoco(page)).sitio).toBe('raiz');
    // 1050 px: Editar con velo, y la tabla sigue siendo tabla (por debajo de 1024 px pasa a filas
    // apiladas y el botón con el foco se desmonta, que es otra cosa).
    await page.setViewportSize({ width: 1050, height: 900 });
    await expect(p).toHaveAttribute('aria-modal', 'true');
    await expect.poll(async () => (await dondeFoco(page)).sitio).toBe('editar');
    // Y al volver a ensanchar, la tabla vuelve a estar viva sin cerrar Editar.
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(p).toHaveAttribute('aria-modal', 'false');
    expect(await inertes(page)).toBe(0);
  });

  test('con Retirar encima de Editar (768 px), Tab no sale de Retirar y al cerrarlo Editar vuelve a responder', async ({
    page,
  }) => {
    // Retirar se abre desde la tabla, que a 768 px está detrás del velo: se abre con Editar al lado de
    // la tabla y después la ventana se estrecha, así que Editar pasa a ser modal sin cerrarse.
    await page.setViewportSize({ width: 1440, height: 900 });
    await preparar(page);
    await page.goto('/admin/inventario');
    await editarDe(page, BOCA.codigo).click();
    const p = panel(page);
    await page.getByRole('row').filter({ hasText: BOCA.codigo }).getByRole('button', { name: T.panel.retirar }).click();
    const retirar = page.getByRole('dialog').filter({ hasText: T.panelInventario.avisoRetirar });
    await expect(retirar).toBeVisible();
    await page.setViewportSize({ width: 768, height: 1024 });
    await expect(p).toHaveAttribute('aria-modal', 'true');

    const sitios = await tabular(page, 30);
    expect(sitios.filter((s) => s.sitio !== 'ventana' && s.sitio !== 'body')).toEqual([]);
    expect(sitios.some((s) => s.sitio === 'ventana')).toBe(true);
    await axe(page);

    await page.keyboard.press('Escape');
    await expect(retirar).toHaveCount(0);
    // Editar vuelve a estar vivo; la tabla, no.
    expect(await p.evaluate((d) => d.closest('[inert]') === null)).toBe(true);
    await expect(page.locator('#raiz')).toHaveAttribute('inert', '');
    const directo = p.getByRole('radio', { name: T.formulario.directo });
    await directo.click();
    await expect(directo).toHaveAttribute('aria-checked', 'true');
    await directo.focus();
    const despues = await tabular(page, 60);
    expect(despues.filter((s) => s.sitio !== 'editar' && s.sitio !== 'body')).toEqual([]);
  });

  test('el aviso de error se ve, se anuncia y se cierra con Editar abierto a 768 px', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await preparar(page);
    await page.route(`${SUPABASE_PRUEBAS}/rest/v1/rpc/fn_editar_punto`, (r) =>
      r.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'P0001',
          message: 'PUNTO_OCUPADO: otro lo está cambiando',
          details: null,
          hint: null,
        }),
      }),
    );
    await page.goto('/admin/inventario');
    await editarDe(page, BOCA.codigo).click();
    const p = panel(page);
    await p.getByRole('radio', { name: T.formulario.directo }).click();
    await p.getByRole('button', { name: T.panel.guardarCambios }).click();
    const aviso = page.getByRole('alert').filter({ hasText: T.panelErrores.puntoOcupado });
    await expect(aviso).toBeVisible();
    await expect(p).toBeVisible();
    // Fuera de cualquier nodo inert: el lector de pantalla lo lee y la X responde.
    expect(await aviso.evaluate((a) => a.closest('[inert]') === null)).toBe(true);
    await aviso.getByRole('button', { name: T.ficha.cerrar }).click();
    await expect(aviso).toHaveCount(0);
  });

  test('el aviso de «Guardado» sigue vivo si se abre otra ventana mientras se ve', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await preparar(page);
    await page.goto('/admin/inventario');
    await editarDe(page, BOCA.codigo).click();
    const p = panel(page);
    await p.getByRole('radio', { name: T.formulario.directo }).click();
    await p.getByRole('button', { name: T.panel.guardarCambios }).click();
    await expect(p).toHaveCount(0);
    const aviso = page.getByRole('status').filter({ hasText: T.panelInventario.guardado(BOCA.codigo) });
    await expect(aviso).toBeVisible();
    // Al cerrar Editar, el foco vuelve al "Editar" de la fila (con #raiz ya sin inert).
    await expect(editarDe(page, BOCA.codigo)).toBeFocused();
    await editarDe(page, HIDRANTE.codigo).click();
    await expect(p).toBeVisible();
    await expect(page.locator('#raiz')).toHaveAttribute('inert', '');
    expect(await aviso.evaluate((a) => a.closest('[inert]') === null)).toBe(true);
  });
});

// docs/31 RV-165: Editar no se queda con una foto vieja del punto. Sin cambios propios se pone al
// día solo; con cambios, avisa y deja ver lo nuevo tras confirmar que se descartan los propios.
test.describe('Editar con el punto al día (docs/31 RV-165)', () => {
  test.skip(({ isMobile }) => !!isMobile, 'los anchos se fijan a mano en el proyecto de escritorio');

  /** Otro administrador cambia el punto; se ve al sincronizar, que aquí lo dispara guardar otra celda. */
  async function otroAdministrador(
    page: Page,
    vista: { lista: typeof PUNTOS },
    cambios: Partial<(typeof PUNTOS)[number]>,
  ) {
    vista.lista = vista.lista.map((x) =>
      x.id === HIDRANTE.id ? { ...x, ...cambios, actualizado_en: new Date().toISOString() } : x,
    );
    const celda = page.getByLabel(T.panelInventario.direccionDe(OTRA.codigo));
    await celda.fill('Calle Prueba 1 bis');
    await celda.blur();
  }

  test('sin cambios sin guardar, Editar se actualiza sin cerrarse', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const vista = { lista: PUNTOS.map((x) => ({ ...x })) };
    await preparar(page, [], vista);
    await page.goto('/admin/inventario');
    await editarDe(page, HIDRANTE.codigo).click();
    const p = panel(page);
    await expect(p.getByRole('radio', { name: T.formulario.bueno })).toHaveAttribute('aria-checked', 'true');

    await otroAdministrador(page, vista, { caudal: 'regular', descripcion: '[PRUEBA] Cambiada por otro' });
    await expect(p.getByRole('radio', { name: T.formulario.regular })).toHaveAttribute('aria-checked', 'true');
    await expect(p.getByRole('textbox', { name: T.formulario.descripcionOpcional })).toHaveValue(
      '[PRUEBA] Cambiada por otro',
    );
    // "Antes" y la comparación usan lo nuevo: no hay nada cambiado ni aviso.
    await expect(p.getByText(T.avisosFormulario.sinCambios)).toBeVisible();
    await expect(p.getByText(T.panelEditar.otroAdministrador)).toHaveCount(0);
    await expect(p).toBeVisible();
  });

  test('con cambios, avisa y "Ver lo nuevo" descarta lo propio tras confirmar', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const vista = { lista: PUNTOS.map((x) => ({ ...x })) };
    const { llamadas } = await preparar(page, [], vista);
    await page.goto('/admin/inventario');
    await editarDe(page, HIDRANTE.codigo).click();
    const p = panel(page);
    const descripcion = p.getByRole('textbox', { name: T.formulario.descripcionOpcional });
    await descripcion.fill('[PRUEBA] Mía');

    await otroAdministrador(page, vista, { caudal: 'malo' });
    const aviso = p.getByRole('status').filter({ hasText: T.panelEditar.otroAdministrador });
    await expect(aviso).toBeVisible();
    // Lo propio sigue escrito y la comparación sigue siendo con lo que se abrió.
    await expect(descripcion).toHaveValue('[PRUEBA] Mía');
    await expect(p.getByRole('radio', { name: T.formulario.bueno })).toHaveAttribute('aria-checked', 'true');
    // El aviso, sin fallos de axe en claro ni en oscuro.
    for (const tema of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: tema });
      const { violations } = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .include('[role="dialog"] [role="status"]')
        .analyze();
      expect(violations.flatMap((v) => v.nodes.map((n) => `${tema} · ${v.id} · ${n.target.join(' ')}`))).toEqual([]);
    }

    // "Seguir editando" no toca nada.
    await aviso.getByRole('button', { name: T.panelEditar.verLoNuevo }).click();
    const pregunta = page.getByRole('alertdialog', { name: T.panelEditar.descartarN(1) });
    await pregunta.getByRole('button', { name: T.panelEditar.seguirEditando }).click();
    await expect(descripcion).toHaveValue('[PRUEBA] Mía');
    // El foco vuelve a «Ver lo nuevo», no a <body> detrás del panel.
    await expect(aviso.getByRole('button', { name: T.panelEditar.verLoNuevo })).toBeFocused();

    // "Descartar" pone Editar al día.
    await aviso.getByRole('button', { name: T.panelEditar.verLoNuevo }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: T.panelEditar.descartar }).click();
    await expect(p.getByRole('radio', { name: T.formulario.malo })).toHaveAttribute('aria-checked', 'true');
    await expect(descripcion).toHaveValue(HIDRANTE.descripcion!);
    await expect(p.getByText(T.avisosFormulario.sinCambios)).toBeVisible();
    await expect(p.getByText(T.panelEditar.otroAdministrador)).toHaveCount(0);
    await expect(p).toBeVisible();
    // «Ver lo nuevo» ya no está: el foco pasa al primer control de Editar.
    expect(await p.evaluate((d) => d.contains(document.activeElement) && document.activeElement !== d)).toBe(true);
    // Nada se ha guardado en el punto que se editaba.
    expect(llamadas.filter((l) => l.nombre === 'fn_editar_punto' && l.cuerpo.punto_id === HIDRANTE.id)).toEqual([]);
  });

  test('guardar con el aviso a la vista manda solo lo propio', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const vista = { lista: PUNTOS.map((x) => ({ ...x })) };
    const { llamadas } = await preparar(page, [], vista);
    await page.goto('/admin/inventario');
    await editarDe(page, HIDRANTE.codigo).click();
    const p = panel(page);
    await p.getByRole('textbox', { name: T.formulario.descripcionOpcional }).fill('[PRUEBA] Mía');
    await otroAdministrador(page, vista, { caudal: 'malo' });
    await expect(p.getByText(T.panelEditar.otroAdministrador)).toBeVisible();
    await p.getByRole('button', { name: T.panel.guardarCambios }).click();
    await expect(p).toHaveCount(0);
    expect(llamadas.filter((l) => l.nombre === 'fn_editar_punto' && l.cuerpo.punto_id === HIDRANTE.id)).toEqual([
      { nombre: 'fn_editar_punto', cuerpo: { punto_id: HIDRANTE.id, cambios: { descripcion: '[PRUEBA] Mía' } } },
    ]);
  });

  test('la fila abierta en Editar no deja cambiar la dirección en la tabla', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await preparar(page);
    await page.goto('/admin/inventario');
    await editarDe(page, HIDRANTE.codigo).click();
    await expect(panel(page)).toBeVisible();
    await expect(page.getByLabel(T.panelInventario.direccionDe(HIDRANTE.codigo))).toHaveCount(0);
    await expect(page.getByRole('row').filter({ hasText: HIDRANTE.codigo })).toContainText(HIDRANTE.direccion!);
    await expect(page.getByLabel(T.panelInventario.direccionDe(OTRA.codigo))).toBeEditable();
  });
});

// docs/33 RV-333 (D14): al abrir Editar, el foco va al título del panel y no a «Mi posición», que es
// lo primero que se puede pulsar: con el teclado, Intro otra vez movería el pin sin querer.
test.describe('Foco al abrir Editar (docs/33 RV-333)', () => {
  for (const [ancho, alto] of [
    [1440, 900],
    [768, 1024],
  ] as const) {
    test(`a ${ancho} px, abierto con el teclado, el foco está en el título`, async ({ page }) => {
      await page.setViewportSize({ width: ancho, height: alto });
      await preparar(page);
      await page.goto('/admin/inventario');
      await editarDe(page, BOCA.codigo).focus();
      await page.keyboard.press('Enter');
      const p = panel(page);
      await expect(p).toBeVisible();
      const titulo = p.getByRole('heading', { name: new RegExp(BOCA.codigo) });
      await expect(titulo).toBeFocused();
      await expect(titulo).toHaveAttribute('tabindex', '-1');
      // Intro con el foco en el título no hace nada: el punto sigue sin cambios.
      await page.keyboard.press('Enter');
      await expect(p.getByText(T.avisosFormulario.sinCambios)).toBeVisible();
      // Tab sigue por el panel: el siguiente control es la X de cerrar.
      await page.keyboard.press('Tab');
      await expect(p.getByRole('button', { name: T.ficha.cerrar })).toBeFocused();
    });
  }
});
