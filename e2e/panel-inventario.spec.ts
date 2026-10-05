// Panel · inventario, registro y papelera (FR-120, FR-123–FR-125, FR-160; FL-24, FL-26, FL-32).

import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { T } from '../src/lib/textos.ts';
import { SUPABASE_PRUEBAS } from '../playwright.config.ts';
import { conGoogle, simularTablas } from './ayudas.ts';
import { PUNTOS } from './puntos.ts';

const [P0] = PUNTOS;

const REGISTRO = [
  {
    id: 2,
    momento: '2026-09-19T09:30:00Z',
    actor: 'jefe@example.org',
    es_admin: true,
    accion: 'aprobacion',
    punto_id: P0.id,
    codigo: P0.codigo,
    resumen: 'aprobacion · HID-9001 · caudal',
    antes: null,
    despues: null,
  },
  {
    id: 1,
    momento: '2026-09-18T09:30:00Z',
    actor: 'Luis Martín',
    es_admin: false,
    accion: 'propuesta_creada',
    punto_id: P0.id,
    codigo: P0.codigo,
    resumen: 'propuesta_creada · HID-9001',
    antes: null,
    despues: null,
  },
];

const BORRADOS = [
  {
    id: 'b1',
    codigo: 'HID-9100',
    tipo: 'hidrante',
    diametro_mm: 70,
    borrado_en: new Date(Date.now() - 8 * 86_400_000).toISOString(),
  },
];

interface Llamada {
  nombre: string;
  cuerpo: Record<string, unknown>;
}

async function prepararPanel(page: Page) {
  const llamadas: Llamada[] = [];
  let borrados = BORRADOS;
  await conGoogle(page, 'jefe@example.org');
  await simularTablas(page, {
    v_puntos_activos: PUNTOS,
    v_cola_revision: [],
    v_registro: (url) => {
      const accion = url.searchParams.get('accion');
      return accion ? REGISTRO.filter((e) => `eq.${e.accion}` === accion) : REGISTRO;
    },
    puntos: (url) => (url.searchParams.get('situacion') === 'eq.borrado' ? borrados : []),
    propuestas: [],
    config: [{ valor: 30 }],
  });
  await page.route(`${SUPABASE_PRUEBAS}/rest/v1/rpc/*`, async (route) => {
    const nombre = new URL(route.request().url()).pathname.split('/').pop()!;
    const cuerpo = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
    llamadas.push({ nombre, cuerpo });
    const json = (d: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(d) });
    switch (nombre) {
      case 'fn_es_admin':
        return json(true);
      case 'fn_editar_punto':
      case 'fn_retirar_punto':
        return json(null);
      case 'fn_restaurar_punto':
        borrados = [];
        return json(null);
      case 'fn_historial_punto':
        return json(REGISTRO);
      case 'fn_exportar_inventario': {
        // Como el servidor: filtra por tipo y estado; sin filtros, dos filas de muestra.
        const f = (cuerpo.filtros ?? {}) as { tipo?: string; caudal?: string };
        const filas =
          f.tipo || f.caudal
            ? PUNTOS.filter((p) => (!f.tipo || p.tipo === f.tipo) && (!f.caudal || p.caudal === f.caudal))
            : PUNTOS.slice(0, 2);
        return json(
          filas.map((p) => ({
            codigo: p.codigo,
            tipo: p.tipo,
            diametro_mm: p.diametro_mm,
            caudal: p.caudal,
            racor: p.racor,
            direccion: p.direccion,
            nucleo: p.nucleo,
            municipio: p.municipio,
            fecha_ultima_revision: p.fecha_ultima_revision,
            lat: p.lat,
            lng: p.lng,
          })),
        );
      }
      default:
        return route.abort('connectionrefused');
    }
  });
  return llamadas;
}

/** Los dos filtros del inventario (docs/29 RV-123): desplegables con la etiqueta encima. */
const tipo = (page: Page) => page.getByRole('combobox', { name: T.panelInventario.colTipo, exact: true });
const estado = (page: Page) => page.getByRole('combobox', { name: T.panelInventario.colEstado, exact: true });

const llamadaA = (llamadas: Llamada[], nombre: string) => llamadas.find((l) => l.nombre === nombre)?.cuerpo;

test('inventario: filtros, orden y búsqueda global (FR-120, FR-145)', async ({ page }) => {
  await prepararPanel(page);
  await page.goto('/admin/inventario');
  const filas = page.getByRole('row');
  await expect(filas).toHaveCount(PUNTOS.length + 1); // + la cabecera
  await expect(page.getByRole('cell', { name: P0.codigo })).toBeVisible();

  await tipo(page).selectOption('boca_riego');
  await expect(filas).toHaveCount(5);
  await tipo(page).selectOption('todos');

  await page.getByRole('button', { name: T.panelInventario.ordenarPor(T.panelInventario.colCodigo) }).click();
  await expect(filas.nth(1).getByRole('cell').first()).toHaveText('HID-9008');

  await page.getByPlaceholder(T.panelCola.buscar).fill('BOC-9009');
  await expect(filas).toHaveCount(2);
  await page.getByPlaceholder(T.panelCola.buscar).fill('');

  await page.getByRole('radio', { name: T.panelInventario.mapa }).click();
  await expect(page.getByTestId('mapa')).toBeVisible();
});

test('inventario: editar la dirección en la celda y editar el punto (FR-15, FR-151)', async ({ page }) => {
  const llamadas = await prepararPanel(page);
  await page.goto('/admin/inventario');
  const celda = page.getByLabel(T.panelInventario.direccionDe(P0.codigo));
  await celda.fill('Calle Real 16');
  await celda.blur();
  await expect
    .poll(() => llamadaA(llamadas, 'fn_editar_punto'))
    .toEqual({
      punto_id: P0.id,
      cambios: { direccion: 'Calle Real 16' },
    });

  const fila = page.getByRole('row').filter({ hasText: P0.codigo });
  await fila.getByRole('button', { name: T.panel.editar }).click();
  const dialogo = page.getByRole('dialog');
  await expect(dialogo.getByRole('button', { name: T.panel.guardarCambios })).toBeDisabled();
  await dialogo.getByLabel(T.panelCola.campoEstado).selectOption('malo');
  await dialogo.getByRole('button', { name: T.panel.guardarCambios }).click();
  await expect(page.getByRole('status').filter({ hasText: T.panelInventario.guardado(P0.codigo) })).toBeVisible();
  expect(llamadas.filter((l) => l.nombre === 'fn_editar_punto').at(-1)?.cuerpo).toEqual({
    punto_id: P0.id,
    cambios: { caudal: 'malo' },
  });
});

// docs/18 RV-41, DEC-090: el tipo no se cambia desde el inventario.
test('panel-inventario: editar no ofrece el tipo', async ({ page }) => {
  await prepararPanel(page);
  await page.goto('/admin/inventario');
  const fila = page.getByRole('row').filter({ hasText: P0.codigo });
  await fila.getByRole('button', { name: T.panel.editar }).click();
  const dialogo = page.getByRole('dialog');
  await expect(dialogo.getByLabel(T.panelCola.campoEstado)).toBeVisible();
  await expect(dialogo.getByLabel(T.panelCola.campoTipo)).toHaveCount(0);
  await expect(dialogo.getByText(T.panelErrores.tipoNoModificable)).toBeVisible();
});

test('inventario: retirar pide motivo y el historial se puede consultar (FR-123, FR-124)', async ({ page }) => {
  const llamadas = await prepararPanel(page);
  await page.goto('/admin/inventario');
  const fila = page.getByRole('row').filter({ hasText: P0.codigo });
  await fila.getByRole('button', { name: T.panel.retirar }).click();
  let dialogo = page.getByRole('dialog');
  await expect(dialogo.getByText(T.panelInventario.avisoRetirar)).toBeVisible();
  await dialogo.getByRole('button', { name: T.panel.retirar }).click();
  await expect(dialogo.getByText(T.panelInventario.sinMotivo)).toBeVisible();
  expect(llamadaA(llamadas, 'fn_retirar_punto')).toBeUndefined();
  await dialogo.getByLabel(T.panelInventario.motivo).fill('Sustituido por obra');
  await dialogo.getByRole('button', { name: T.panel.retirar }).click();
  await expect
    .poll(() => llamadaA(llamadas, 'fn_retirar_punto'))
    .toEqual({
      punto_id: P0.id,
      motivo: 'Sustituido por obra',
    });

  await fila.getByRole('button', { name: T.panel.historial }).click();
  dialogo = page.getByRole('dialog');
  await expect(dialogo.getByText(T.panelRegistro.aprobacion)).toBeVisible();
});

test('inventario: exportar en los tres formatos (FR-160, FL-32)', async ({ page }) => {
  const llamadas = await prepararPanel(page);
  await page.goto('/admin/inventario');
  for (const [boton, extension] of [
    [T.panel.excel, 'xlsx'],
    [T.panel.csv, 'csv'],
    [T.panel.geojson, 'geojson'],
  ]) {
    const descarga = page.waitForEvent('download');
    await page.getByRole('button', { name: T.panel.exportar }).click();
    await page.getByRole('menuitem', { name: boton, exact: true }).click();
    expect((await descarga).suggestedFilename()).toMatch(
      new RegExp(`^hidrantes-albolote-\\d{4}-\\d{2}-\\d{2}\\.${extension}$`),
    );
  }
  await expect(page.getByRole('status').filter({ hasText: T.panelInventario.exportado(2) })).toBeVisible();
  expect(llamadaA(llamadas, 'fn_exportar_inventario')).toEqual({ filtros: {} });
});

test('registro: filtro por acción, solo lectura (FR-123, FL-26)', async ({ page }) => {
  await prepararPanel(page);
  await page.goto('/admin/registro');
  await expect(page.getByRole('row')).toHaveCount(3);
  await expect(page.getByText(T.panelRegistro.inmutable)).toBeVisible();
  await page.getByLabel(T.panelRegistro.filtroAccion).selectOption('aprobacion');
  await expect(page.getByRole('row')).toHaveCount(2);
  await expect(page.getByRole('cell', { name: T.panelRegistro.aprobacion })).toBeVisible();
});

test('papelera: restaurar dentro de plazo (FR-124, FL-24)', async ({ page }) => {
  await prepararPanel(page);
  await page.goto('/admin/papelera');
  await expect(page.getByText(T.panelPapelera.explicacion(30))).toBeVisible();
  await expect(page.getByText(T.panelPapelera.quedan(22))).toBeVisible();
  await page.getByRole('button', { name: T.panel.restaurar }).click();
  await expect(page.getByRole('status').filter({ hasText: T.panelPapelera.restaurado('HID-9100') })).toBeVisible();
  await expect(page.getByText(T.panelPapelera.vacia)).toBeVisible();
});

// FR-120 y FR-160 (RV-24): tipo y estado se combinan, y el archivo lleva lo filtrado, también la
// búsqueda, que el servidor no conoce.
test('filtrar hidrantes regulares y exportar CSV da solo esas filas (RV-24)', async ({ page }) => {
  const llamadas = await prepararPanel(page);
  await page.goto('/admin/inventario');
  const filas = page.getByRole('row');
  await tipo(page).selectOption('hidrante');
  await estado(page).selectOption('regular');
  const regulares = PUNTOS.filter((p) => p.tipo === 'hidrante' && p.caudal === 'regular').map((p) => p.codigo);
  await expect(filas).toHaveCount(regulares.length + 1);

  const leerCsv = async () => {
    const descarga = page.waitForEvent('download');
    await page.getByRole('button', { name: T.panel.exportar }).click();
    await page.getByRole('menuitem', { name: T.panel.csv, exact: true }).click();
    const texto = await (await descarga).createReadStream().then(
      (flujo) =>
        new Promise<string>((ok) => {
          let datos = '';
          flujo.on('data', (c) => (datos += c));
          flujo.on('end', () => ok(datos));
        }),
    );
    return texto
      .split(String.fromCharCode(13, 10))
      .slice(1)
      .filter(Boolean)
      .map((l) => l.split(';')[0]!.replace(/^"|"$/g, ''));
  };

  expect(await leerCsv()).toEqual(regulares);
  expect(llamadaA(llamadas, 'fn_exportar_inventario')).toEqual({ filtros: { tipo: 'hidrante', caudal: 'regular' } });

  // Con búsqueda, solo lo que se ve.
  await page.getByPlaceholder(T.panelCola.buscar).fill(regulares[1]!);
  await expect(filas).toHaveCount(2);
  expect(await leerCsv()).toEqual([regulares[1]]);
  await expect(page.getByRole('status').filter({ hasText: T.panelInventario.exportado(1) })).toBeVisible();
});

// ---------- docs/29 RV-123 (DEC-168): Tipo y Estado en desplegables, Exportar ▾ ----------

test('Tipo y Estado: desplegables con los números de cada estado y "Quitar filtros" (RV-123)', async ({ page }) => {
  await prepararPanel(page);
  await page.goto('/admin/inventario');
  const filas = page.getByRole('row');
  await expect(filas).toHaveCount(PUNTOS.length + 1);
  // Los filtros quitados no están: ni chips, ni núcleo, ni diámetro, ni revisión.
  await expect(page.getByRole('radiogroup', { name: T.panelInventario.colTipo })).toHaveCount(0);
  await expect(page.getByRole('main').getByRole('combobox')).toHaveCount(2);
  await expect(page.getByRole('button', { name: T.panelInventario.quitarFiltros })).toHaveCount(0);

  const cuantos = (deTipo: string, caudal: string) =>
    PUNTOS.filter((p) => (deTipo === 'todos' || p.tipo === deTipo) && p.caudal === caudal).length;
  expect(await estado(page).locator('option').allTextContents()).toEqual([
    T.panelInventario.conNumero(T.mapa.todos, PUNTOS.length),
    T.panelInventario.conNumero(T.formulario.bueno, cuantos('todos', 'bueno')),
    T.panelInventario.conNumero(T.formulario.regular, cuantos('todos', 'regular')),
    T.panelInventario.conNumero(T.formulario.malo, cuantos('todos', 'malo')),
    T.panelInventario.conNumero(T.formulario.barro, cuantos('todos', 'barro')),
    T.panelInventario.conNumero(T.formulario.noFunciona, cuantos('todos', 'no_funciona')),
  ]);
  expect(await tipo(page).locator('option').allTextContents()).toEqual([
    T.mapa.todos,
    T.mapa.hidrantes,
    T.panelInventario.bocasDeRiego,
  ]);

  // Con el tipo elegido, los números son los de ese tipo; el filtro activo va en negrita.
  await tipo(page).selectOption('boca_riego');
  const bocas = PUNTOS.filter((p) => p.tipo === 'boca_riego');
  await expect(filas).toHaveCount(bocas.length + 1);
  await expect(estado(page).locator('option').first()).toHaveText(
    T.panelInventario.conNumero(T.mapa.todos, bocas.length),
  );
  await expect(estado(page).locator('option[value="regular"]')).toHaveText(
    T.panelInventario.conNumero(T.formulario.regular, cuantos('boca_riego', 'regular')),
  );
  expect(await tipo(page).evaluate((e) => getComputedStyle(e).fontWeight)).toBe('600');
  expect(await estado(page).evaluate((e) => getComputedStyle(e).fontWeight)).toBe('400');

  await estado(page).selectOption('malo');
  await expect(filas).toHaveCount(cuantos('boca_riego', 'malo') + 1);

  await page.getByRole('button', { name: T.panelInventario.quitarFiltros }).click();
  await expect(filas).toHaveCount(PUNTOS.length + 1);
  await expect(tipo(page)).toHaveValue('todos');
  await expect(estado(page)).toHaveValue('todos');
  await expect(page.getByRole('button', { name: T.panelInventario.quitarFiltros })).toHaveCount(0);
});

test('Exportar ▾: menú con flechas, Esc y tocar fuera; exporta lo filtrado (RV-123)', async ({ page }) => {
  const llamadas = await prepararPanel(page);
  await page.goto('/admin/inventario');
  const boton = page.getByRole('button', { name: T.panel.exportar });
  const menu = page.getByRole('menu');
  await expect(boton).toHaveAttribute('aria-haspopup', 'menu');
  await expect(boton).toHaveAttribute('aria-expanded', 'false');
  await expect(menu).toHaveCount(0);

  // Con el teclado: flecha abajo abre y entra en Excel; las flechas dan la vuelta; Esc devuelve el foco.
  await boton.focus();
  await page.keyboard.press('ArrowDown');
  await expect(boton).toHaveAttribute('aria-expanded', 'true');
  await expect(menu.getByRole('menuitem')).toHaveText([T.panel.excel, T.panel.csv, T.panel.geojson]);
  await expect(menu.getByRole('menuitem', { name: T.panel.excel })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitem', { name: T.panel.csv })).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect(menu.getByRole('menuitem', { name: T.panel.geojson })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(menu.getByRole('menuitem', { name: T.panel.excel })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(boton).toBeFocused();
  await expect(boton).toHaveAttribute('aria-expanded', 'false');

  // Tocar fuera lo cierra.
  await boton.click();
  await expect(menu).toBeVisible();
  await page.getByText(T.panelInventario.ayudaTabla).click();
  await expect(menu).toHaveCount(0);

  // Elegir con Intro: exporta lo filtrado y el foco vuelve al botón.
  await tipo(page).selectOption('hidrante');
  await estado(page).selectOption('malo');
  await boton.focus();
  await page.keyboard.press('ArrowUp');
  await expect(menu.getByRole('menuitem', { name: T.panel.geojson })).toBeFocused();
  const descarga = page.waitForEvent('download');
  await page.keyboard.press('Enter');
  expect((await descarga).suggestedFilename()).toMatch(/\.geojson$/);
  await expect(boton).toBeFocused();
  expect(llamadaA(llamadas, 'fn_exportar_inventario')).toEqual({ filtros: { tipo: 'hidrante', caudal: 'malo' } });
});

test('Inventario con filtros: axe en claro y oscuro, y a 412 px nada se sale a lo ancho (RV-123)', async ({ page }) => {
  await prepararPanel(page);
  for (const tema of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: tema });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/admin/inventario');
    await tipo(page).selectOption('boca_riego');
    await page.getByRole('button', { name: T.panel.exportar }).click();
    await expect(page.getByRole('menu')).toBeVisible();
    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .exclude('.leaflet-marker-pane')
      .analyze();
    expect(
      violations.flatMap((v) => v.nodes.map((n) => `${v.id} · ${n.target.join(' ')}`)),
      `inventario · ${tema}`,
    ).toEqual([]);
  }

  // Tableta: todo en una fila, también con "Quitar filtros" a la vista.
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/admin/inventario');
  await tipo(page).selectOption('boca_riego');
  const enTableta = await Promise.all(
    [
      tipo(page),
      page.getByRole('button', { name: T.panelInventario.quitarFiltros }),
      page.getByRole('button', { name: T.panel.exportar }),
      page.getByRole('radio', { name: T.panelInventario.mapa }),
    ].map((l) => l.boundingBox()),
  );
  const [st] = enTableta.map((c) => c!);
  for (const c of enTableta) expect(c!.y + c!.height / 2).toBeGreaterThan(st.y);
  for (const c of enTableta) expect(c!.y + c!.height / 2).toBeLessThan(st.y + st.height);

  // Móvil: Tipo y Estado lado a lado; debajo, Quitar filtros, Exportar y Tabla/Mapa.
  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto('/admin/inventario');
  await tipo(page).selectOption('boca_riego');
  const cajas = await Promise.all(
    [
      tipo(page),
      estado(page),
      page.getByRole('button', { name: T.panelInventario.quitarFiltros }),
      page.getByRole('button', { name: T.panel.exportar }),
    ].map((l) => l.boundingBox()),
  );
  const [t, e, q, x] = cajas.map((c) => c!);
  expect(Math.abs(t.y - e.y)).toBeLessThan(2);
  expect(e.x).toBeGreaterThan(t.x + t.width - 1);
  expect(t.height).toBeGreaterThanOrEqual(44);
  expect(q.y).toBeGreaterThan(t.y + t.height);
  expect(x.y).toBeGreaterThan(t.y + t.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  // El menú abierto cabe en la pantalla del móvil.
  await page.getByRole('button', { name: T.panel.exportar }).click();
  const menu = (await page.getByRole('menu').boundingBox())!;
  expect(menu.x).toBeGreaterThanOrEqual(0);
  expect(menu.x + menu.width).toBeLessThanOrEqual(412);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});

test('un filtro sin puntos: estado vacío, Exportar deshabilitado con el motivo y "Quitar filtros" (RV-123)', async ({
  page,
}) => {
  const llamadas = await prepararPanel(page);
  await page.goto('/admin/inventario');
  await expect(page.getByRole('row')).toHaveCount(PUNTOS.length + 1);
  // En los datos de prueba no hay ningún punto con barro.
  await estado(page).selectOption('barro');
  await expect(page.getByText(T.panelInventario.vacio)).toBeVisible();
  await expect(page.getByRole('row')).toHaveCount(0);
  const boton = page.getByRole('button', { name: T.panel.exportar });
  await expect(boton).toBeDisabled();
  await expect(boton).toHaveAccessibleDescription(T.panelInventario.nadaQueExportar);
  await expect(page.getByText(T.panelInventario.nadaQueExportar)).toBeVisible();
  expect(llamadaA(llamadas, 'fn_exportar_inventario')).toBeUndefined();

  await page.getByRole('button', { name: T.panelInventario.quitarFiltros }).click();
  await expect(page.getByRole('row')).toHaveCount(PUNTOS.length + 1);
  await expect(boton).toBeEnabled();
  await expect(page.getByText(T.panelInventario.nadaQueExportar)).toHaveCount(0);
});

test('mientras exporta, Exportar dice "Exportando…" y no abre el menú otra vez (RV-123)', async ({ page }) => {
  const llamadas = await prepararPanel(page);
  let soltar = () => {};
  const espera = new Promise<void>((ok) => (soltar = ok));
  await page.route(`${SUPABASE_PRUEBAS}/rest/v1/rpc/fn_exportar_inventario`, async (route) => {
    llamadas.push({ nombre: 'fn_exportar_inventario', cuerpo: {} });
    await espera;
    await route.fulfill({ contentType: 'application/json', body: '[]' });
  });
  await page.goto('/admin/inventario');
  await page.getByRole('button', { name: T.panel.exportar }).click();
  await page.getByRole('menuitem', { name: T.panel.csv }).click();
  const ocupado = page.getByRole('button', { name: T.panel.exportando });
  await expect(ocupado).toHaveAttribute('aria-busy', 'true');
  await expect(ocupado).toBeFocused();
  await ocupado.click({ force: true });
  await expect(page.getByRole('menu')).toHaveCount(0);
  expect(llamadas.filter((l) => l.nombre === 'fn_exportar_inventario')).toHaveLength(1);
  soltar();
  await expect(page.getByRole('button', { name: T.panel.exportar })).not.toHaveAttribute('aria-busy');
});
