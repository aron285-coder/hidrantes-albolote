// Panel · inventario, caducadas, registro y papelera (FR-120–FR-125, FR-160; FL-24–FL-26, FL-32).

import { expect, test, type Page } from '@playwright/test';
import { T } from '../src/lib/textos.ts';
import { SUPABASE_PRUEBAS } from '../playwright.config.ts';
import { conGoogle, simularTablas } from './ayudas.ts';
import { PUNTOS } from './puntos.ts';

const [P0, , , , P4] = PUNTOS;

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

const llamadaA = (llamadas: Llamada[], nombre: string) => llamadas.find((l) => l.nombre === nombre)?.cuerpo;

test('inventario: filtros, orden y búsqueda global (FR-120, FR-145)', async ({ page }) => {
  await prepararPanel(page);
  await page.goto('/admin/inventario');
  const filas = page.getByRole('row');
  await expect(filas).toHaveCount(PUNTOS.length + 1); // + la cabecera
  await expect(page.getByRole('cell', { name: P0.codigo })).toBeVisible();

  await page.getByRole('radio', { name: T.panelInventario.bocasDeRiego }).click();
  await expect(filas).toHaveCount(5);
  await page
    .getByRole('radiogroup', { name: T.panelInventario.colTipo })
    .getByRole('radio', { name: T.mapa.todos })
    .click();

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
    await page.getByRole('button', { name: boton, exact: true }).click();
    expect((await descarga).suggestedFilename()).toMatch(
      new RegExp(`^hidrantes-albolote-\\d{4}-\\d{2}-\\d{2}\\.${extension}$`),
    );
  }
  await expect(page.getByRole('status').filter({ hasText: T.panelInventario.exportado(2) })).toBeVisible();
  expect(llamadaA(llamadas, 'fn_exportar_inventario')).toEqual({ filtros: {} });
});

test('revisiones caducadas por núcleo y hoja de campo imprimible (FR-121, FR-122)', async ({ page }) => {
  await prepararPanel(page);
  await page.goto('/admin/caducadas');
  await expect(page.getByText(T.panelCaducadas.resumen(1))).toBeVisible();
  await page.getByRole('button', { name: T.panelCaducadas.verPuntos }).first().click();
  await expect(page.getByText(P4.codigo, { exact: false }).first()).toBeVisible();

  await page.getByRole('button', { name: T.panelCaducadas.hoja, exact: true }).first().click();
  await expect(page.getByRole('heading', { name: T.panelCaducadas.tituloHoja('Albolote') })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: T.panelCaducadas.colAnotar })).toBeVisible();
  await page.getByRole('button', { name: T.panelCaducadas.cerrarHoja, exact: true }).click();
  await expect(page.getByRole('heading', { name: T.panelCaducadas.tituloHoja('Albolote') })).toHaveCount(0);
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
  await page
    .getByRole('radiogroup', { name: T.panelInventario.colTipo })
    .getByRole('radio', { name: T.mapa.hidrantes })
    .click();
  await page
    .getByRole('radiogroup', { name: T.panelInventario.colEstado })
    .getByRole('radio', { name: T.formulario.regular })
    .click();
  const regulares = PUNTOS.filter((p) => p.tipo === 'hidrante' && p.caudal === 'regular').map((p) => p.codigo);
  await expect(filas).toHaveCount(regulares.length + 1);

  const leerCsv = async () => {
    const descarga = page.waitForEvent('download');
    await page.getByRole('button', { name: T.panel.csv, exact: true }).click();
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
