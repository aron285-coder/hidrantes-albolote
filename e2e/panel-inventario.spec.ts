// Panel · inventario, registro y papelera (FR-120, FR-123–FR-125, FR-160; FL-24, FL-26, FL-32).

import { readFileSync } from 'node:fs';
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { T } from '../src/lib/textos.ts';
import { SUPABASE_PRUEBAS } from '../playwright.config.ts';
import {
  conGoogle,
  simularTablas,
  buscarEnPanel,
  abrirFiltros,
  accionInventario,
  filaInventario,
  filasInventario,
  filtrarPor,
} from './ayudas.ts';
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

/**
 * `puntos`: la vista del inventario, que se vuelve a leer en cada sincronización; con ella, una
 * edición cambia el punto como haría el servidor, y otro administrador puede cambiarlo por fuera.
 */
async function prepararPanel(page: Page, puntos?: { lista: typeof PUNTOS }) {
  const llamadas: Llamada[] = [];
  let borrados = BORRADOS;
  await conGoogle(page, 'jefe@example.org');
  await simularTablas(page, {
    v_puntos_activos: () => puntos?.lista ?? PUNTOS,
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
      case 'fn_editar_punto': {
        if (puntos) {
          const { punto_id, cambios } = cuerpo as { punto_id: string; cambios: Record<string, unknown> };
          const ahora = new Date().toISOString();
          puntos.lista = puntos.lista.map((p) => (p.id === punto_id ? { ...p, ...cambios, actualizado_en: ahora } : p));
        }
        return json(null);
      }
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

/** Tipo y Estado (docs/29 RV-123), en el botón de filtros desde docs/38 (RV-506, DEC-214). */
const elegirTipo = (page: Page, nombre: string) => filtrarPor(page, T.panelInventario.colTipo, nombre);
const elegirEstado = (page: Page, nombre: string) => filtrarPor(page, T.panelInventario.colEstado, nombre);
const filas = (page: Page) => filasInventario(page);

const llamadaA = (llamadas: Llamada[], nombre: string) => llamadas.find((l) => l.nombre === nombre)?.cuerpo;

test('inventario: filtros, orden y búsqueda global (FR-120, FR-145)', async ({ page }) => {
  await prepararPanel(page);
  await page.goto('/admin/inventario');
  await expect(filas(page)).toHaveCount(PUNTOS.length);
  await expect(filaInventario(page, P0.codigo)).toBeVisible();

  await elegirTipo(page, T.panelInventario.bocasDeRiego);
  await expect(filas(page)).toHaveCount(4);
  await elegirTipo(page, T.mapa.todos);

  // El orden: por la cabecera en la tabla; desde el botón de filtros en la lista (docs/38 RV-506).
  const cabecera = page.getByRole('button', { name: T.panelInventario.ordenarPor(T.panelInventario.colCodigo) });
  if (await cabecera.count()) await cabecera.click();
  else await filtrarPor(page, T.panelInventario.ordenarPorTitulo, T.panelInventario.colCodigo);
  await expect(filas(page).first()).toContainText('HID-9008');

  await buscarEnPanel(page, 'BOC-9009');
  await expect(filas(page)).toHaveCount(1);
  await buscarEnPanel(page, '');

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

  await accionInventario(page, P0.codigo, 'editar');
  const dialogo = page.getByRole('dialog');
  await expect(dialogo.getByRole('button', { name: T.panel.guardarCambios })).toBeDisabled();
  // Editar es el panel lateral con las píldoras de estado del alta (docs/29 RV-124).
  await dialogo.getByRole('radio', { name: T.formulario.malo }).click();
  await dialogo.getByRole('button', { name: T.panel.guardarCambios }).click();
  await expect(page.getByRole('status').filter({ hasText: T.panelInventario.guardado(P0.codigo) })).toBeVisible();
  expect(llamadas.filter((l) => l.nombre === 'fn_editar_punto').at(-1)?.cuerpo).toEqual({
    punto_id: P0.id,
    cambios: { caudal: 'malo' },
  });
});

// docs/31 RV-164: la celda de la dirección sigue al dato. Tocada una vez, ya no se quedaba con lo
// escrito, y pasar por ella con Tab volvía a guardar la dirección vieja encima de una más nueva.
test('la dirección de la celda no deshace un cambio más nuevo (docs/31 RV-164)', async ({ page }) => {
  const puntos = { lista: PUNTOS.map((p) => ({ ...p })) };
  const llamadas = await prepararPanel(page, puntos);
  const ediciones = () => llamadas.filter((l) => l.nombre === 'fn_editar_punto').map((l) => l.cuerpo);
  await page.goto('/admin/inventario');
  const celda = page.getByLabel(T.panelInventario.direccionDe(P0.codigo));

  // 1 · En la celda y después en Editar.
  await celda.fill('Calle Real 16');
  await celda.blur();
  await expect.poll(() => ediciones().length).toBe(1);
  await accionInventario(page, P0.codigo, 'editar');
  const dialogo = page.getByRole('dialog');
  await dialogo.getByRole('textbox', { name: T.ficha.direccion, exact: true }).fill('Calle Nueva 1');
  await dialogo.getByRole('button', { name: T.panel.guardarCambios }).click();
  await expect(dialogo).toBeHidden();
  await expect(celda).toHaveValue('Calle Nueva 1');
  await celda.focus();
  await celda.blur();

  // 2 · Otro administrador la cambia; se ve al sincronizar (aquí, tras guardar otra celda).
  puntos.lista = puntos.lista.map((p) =>
    p.id === P0.id ? { ...p, direccion: 'Calle Otra 3', actualizado_en: new Date().toISOString() } : p,
  );
  const otra = page.getByLabel(T.panelInventario.direccionDe(PUNTOS[2].codigo));
  await otra.fill('Calle Prueba 2 bis');
  await otra.blur();
  await expect(celda).toHaveValue('Calle Otra 3');
  await celda.focus();
  await celda.blur();

  // Tres guardados (celda, Editar, la otra celda) y ninguno vuelve a escribir lo viejo en P0.
  await page.waitForTimeout(300);
  expect(ediciones()).toEqual([
    { punto_id: P0.id, cambios: { direccion: 'Calle Real 16' } },
    { punto_id: P0.id, cambios: { direccion: 'Calle Nueva 1' } },
    { punto_id: PUNTOS[2].id, cambios: { direccion: 'Calle Prueba 2 bis' } },
  ]);
});

// docs/32 RV-256: con el foco en la celda sin escribir, una sincronización trae otra dirección. Antes
// el blur guardaba la vieja encima; ahora solo se guarda lo escrito, y la celda enseña lo nuevo.
test('la celda con el foco y sin escribir no guarda al llegar otra dirección (docs/32 RV-256)', async ({ page }) => {
  const puntos = { lista: PUNTOS.map((p) => ({ ...p })) };
  const llamadas = await prepararPanel(page, puntos);
  const ediciones = () => llamadas.filter((l) => l.nombre === 'fn_editar_punto').map((l) => l.cuerpo);
  await page.goto('/admin/inventario');
  const celda = page.getByLabel(T.panelInventario.direccionDe(P0.codigo));
  await expect(celda).toHaveValue(P0.direccion ?? '');
  await celda.focus();

  // Otro administrador la cambia y llega la sincronización (al volver la red) con el foco dentro.
  puntos.lista = puntos.lista.map((p) =>
    p.id === P0.id ? { ...p, direccion: 'Calle Otra 3', actualizado_en: new Date().toISOString() } : p,
  );
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(celda).toHaveValue('Calle Otra 3');
  await expect(celda).toBeFocused();
  await celda.blur();
  await page.waitForTimeout(300);
  expect(ediciones()).toEqual([]);

  // Lo escrito sí se guarda, aunque llegue otra dirección mientras tanto.
  await celda.fill('Calle Mía 7');
  puntos.lista = puntos.lista.map((p) => (p.id === P0.id ? { ...p, direccion: 'Calle Tercera 9' } : p));
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForTimeout(300);
  await expect(celda).toHaveValue('Calle Mía 7');
  await celda.blur();
  await expect.poll(ediciones).toEqual([{ punto_id: P0.id, cambios: { direccion: 'Calle Mía 7' } }]);
});

// RV-256: si no se ha podido guardar, lo escrito sigue siendo un cambio y el siguiente blur lo intenta.
test('la dirección que no se pudo guardar se vuelve a intentar al salir otra vez (docs/32 RV-256)', async ({
  page,
}) => {
  const puntos = { lista: PUNTOS.map((p) => ({ ...p })) };
  const llamadas = await prepararPanel(page, puntos);
  let fallos = 1;
  await page.route(`${SUPABASE_PRUEBAS}/rest/v1/rpc/fn_editar_punto`, (r) => {
    if (fallos-- <= 0) return r.fallback();
    return r.fulfill({
      status: 500,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: '{"message":"caído"}',
    });
  });
  const ediciones = () => llamadas.filter((l) => l.nombre === 'fn_editar_punto').map((l) => l.cuerpo);
  await page.goto('/admin/inventario');
  const celda = page.getByLabel(T.panelInventario.direccionDe(P0.codigo));
  await celda.fill('Calle Mía 7');
  await celda.blur();
  await expect(page.getByRole('alert').first()).toBeVisible();
  await expect(celda).toHaveValue('Calle Mía 7');
  expect(ediciones()).toEqual([]);

  await celda.focus();
  await celda.blur();
  await expect.poll(ediciones).toEqual([{ punto_id: P0.id, cambios: { direccion: 'Calle Mía 7' } }]);
  await expect(page.getByRole('status').filter({ hasText: T.panelInventario.guardado(P0.codigo) })).toBeVisible();
});

// docs/18 RV-41, DEC-090: el tipo no se cambia desde el inventario.
test('panel-inventario: editar no ofrece el tipo', async ({ page }) => {
  await prepararPanel(page);
  await page.goto('/admin/inventario');
  await accionInventario(page, P0.codigo, 'editar');
  const dialogo = page.getByRole('dialog');
  // El segmentado del tipo está, pero bloqueado (docs/29 RV-124).
  const tipo = dialogo.getByRole('radiogroup', { name: T.formulario.tipoElemento });
  await expect(tipo.getByRole('radio', { name: T.formulario.hidrante })).toHaveAttribute('aria-checked', 'true');
  for (const r of await tipo.getByRole('radio').all()) await expect(r).toBeDisabled();
  await expect(dialogo.getByText(T.panelErrores.tipoNoModificable)).toBeVisible();
});

test('inventario: retirar pide motivo y el historial se puede consultar (FR-123, FR-124)', async ({ page }) => {
  const llamadas = await prepararPanel(page);
  await page.goto('/admin/inventario');
  await accionInventario(page, P0.codigo, 'retirar');
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

  await accionInventario(page, P0.codigo, 'historial');
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

// docs/33 RV-335: el JSON del inventario sale de Salud del sistema y es la cuarta opción de Exportar.
// Es el inventario completo: no lleva los filtros ni la búsqueda (FR-144, consulta, no respaldo).
test('Exportar ▾: «Inventario completo (JSON)», sin filtros (docs/33 RV-335)', async ({ page }) => {
  const llamadas = await prepararPanel(page);
  await page.goto('/admin/inventario');
  await elegirTipo(page, T.mapa.hidrantes);
  await page.getByRole('button', { name: T.panel.exportar }).click();
  await expect(page.getByRole('menu').getByRole('menuitem')).toHaveText([
    T.panel.excel,
    T.panel.csv,
    T.panel.geojson,
    T.panel.inventarioCompletoJson,
  ]);
  const descarga = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: T.panel.inventarioCompletoJson, exact: true }).click();
  const archivo = await descarga;
  expect(archivo.suggestedFilename()).toMatch(/^hidrantes-albolote-\d{4}-\d{2}-\d{2}\.json$/);
  const filas = JSON.parse(readFileSync((await archivo.path())!, 'utf8')) as { codigo: string }[];
  expect(filas.length).toBe(2);
  expect(llamadas.filter((l) => l.nombre === 'fn_exportar_inventario').at(-1)?.cuerpo).toEqual({ filtros: {} });
  await expect(page.getByRole('status').filter({ hasText: T.panelAjustes.inventarioDescargado(2) })).toBeVisible();
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

// docs/31 RV-166: buscar desde la página 3 vuelve a la primera. Antes pedía una página fuera de
// rango, el servidor daba error y se quedaban las filas sin filtrar como si fueran el resultado.
test('registro: buscar desde otra página vuelve a la primera (docs/31 RV-166)', async ({ page }) => {
  await prepararPanel(page);
  const ENTRADAS = Array.from({ length: 120 }, (_, i) => ({
    ...REGISTRO[1],
    id: 1000 - i,
    momento: new Date(Date.parse('2026-09-18T09:30:00Z') - i * 60_000).toISOString(),
    codigo: i % 10 === 0 ? 'HID-9001' : 'HID-9002',
    resumen: `propuesta_creada · ${i % 10 === 0 ? 'HID-9001' : 'HID-9002'}`,
  }));
  const desplazamientos: number[] = [];
  const conBusqueda: number[] = [];
  // Como PostgREST: con búsqueda filtra, y una página fuera de rango es un 416.
  await page.route(`${SUPABASE_PRUEBAS}/rest/v1/v_registro?*`, (route) => {
    const url = new URL(route.request().url());
    const busca = url.searchParams.get('or') ?? '';
    const filas = busca.includes('HID-9001') ? ENTRADAS.filter((e) => e.codigo === 'HID-9001') : ENTRADAS;
    const desde = Number(url.searchParams.get('offset') ?? 0);
    const cuantas = Number(url.searchParams.get('limit') ?? filas.length);
    desplazamientos.push(desde);
    if (busca) conBusqueda.push(desde);
    const cabeceras = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Expose-Headers': 'Content-Range',
      'Content-Range': `${desde}-${Math.min(desde + cuantas, filas.length) - 1}/${filas.length}`,
    };
    if (desde >= filas.length)
      return route.fulfill({
        status: 416,
        contentType: 'application/json',
        headers: { ...cabeceras, 'Content-Range': `*/${filas.length}` },
        body: JSON.stringify({ code: 'PGRST103', message: 'Requested range not satisfiable' }),
      });
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: cabeceras,
      body: JSON.stringify(filas.slice(desde, desde + cuantas)),
    });
  });
  await page.goto('/admin/registro');
  const paginas = page.getByRole('navigation', { name: T.panelInventario.paginas });
  await paginas.getByRole('button', { name: '3', exact: true }).click();
  await expect(paginas.getByRole('button', { name: '3', exact: true })).toHaveAttribute('aria-current', 'true');
  await expect.poll(() => desplazamientos.at(-1)).toBe(100);

  await buscarEnPanel(page, 'HID-9001');
  await expect(page.getByText(T.panelRegistro.entradas(12))).toBeVisible();
  await expect(page.getByRole('cell', { name: 'HID-9002', exact: true })).toHaveCount(0);
  await expect(page.getByRole('cell', { name: 'HID-9001', exact: true })).toHaveCount(12);
  // Ninguna petición con búsqueda ha pedido la página 3: ni un 416 ni el aviso de error de paso.
  expect(conBusqueda.length).toBeGreaterThan(0);
  expect(conBusqueda.every((d) => d === 0)).toBe(true);
  await expect(page.getByRole('alert')).toHaveCount(0);

  // Volver a la búsqueda de antes (vacía) también empieza en la primera página.
  await buscarEnPanel(page, '');
  await expect(page.getByText(T.panelRegistro.entradas(120))).toBeVisible();
  await expect(paginas.getByRole('button', { name: '1', exact: true })).toHaveAttribute('aria-current', 'true');
  expect(desplazamientos.at(-1)).toBe(0);
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
  await elegirTipo(page, T.mapa.hidrantes);
  await elegirEstado(page, T.formulario.regular);
  const regulares = PUNTOS.filter((p) => p.tipo === 'hidrante' && p.caudal === 'regular').map((p) => p.codigo);
  await expect(filas(page)).toHaveCount(regulares.length);

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
  await buscarEnPanel(page, regulares[1]!);
  await expect(filas(page)).toHaveCount(1);
  expect(await leerCsv()).toEqual([regulares[1]]);
  await expect(page.getByRole('status').filter({ hasText: T.panelInventario.exportado(1) })).toBeVisible();
});

// ---------- docs/29 RV-123 (DEC-168): Tipo y Estado; desde docs/38 (DEC-214), en el botón de filtros ----------

test('Tipo y Estado en la hoja, con los números de cada estado y "Quitar filtros" (RV-123, docs/38 RV-506)', async ({
  page,
}) => {
  await prepararPanel(page);
  await page.goto('/admin/inventario');
  await expect(filas(page)).toHaveCount(PUNTOS.length);
  // Sin desplegables: el botón de filtros.
  await expect(page.getByRole('main').getByRole('combobox')).toHaveCount(0);
  const cuantos = (deTipo: string, caudal: string) =>
    PUNTOS.filter((p) => (deTipo === 'todos' || p.tipo === deTipo) && p.caudal === caudal).length;

  await abrirFiltros(page);
  const hoja = page.getByRole('dialog');
  const estados = hoja.getByRole('radiogroup', { name: T.panelInventario.colEstado }).getByRole('radio');
  // Los cinco estados con su número, también Barro (que en los datos de prueba no tiene ninguno).
  await expect(estados).toHaveCount(6);
  await expect(estados.nth(0)).toHaveAccessibleName(`${T.mapa.todos} ${PUNTOS.length}`);
  await expect(estados.nth(4)).toHaveAccessibleName(`${T.formulario.barro} ${cuantos('todos', 'barro')}`);
  await expect(hoja.getByRole('radiogroup', { name: T.panelInventario.colTipo }).getByRole('radio')).toHaveText([
    T.mapa.todos,
    T.mapa.hidrantes,
    T.panelInventario.bocasDeRiego,
  ]);
  await expect(hoja.getByRole('button', { name: T.panelInventario.quitarFiltros })).toHaveCount(0);

  // Con el tipo elegido, los números son los de ese tipo.
  await hoja.getByRole('radio', { name: T.panelInventario.bocasDeRiego }).click();
  const bocas = PUNTOS.filter((p) => p.tipo === 'boca_riego');
  await expect(filas(page)).toHaveCount(bocas.length);
  await expect(estados.nth(0)).toHaveAccessibleName(`${T.mapa.todos} ${bocas.length}`);
  await expect(estados.nth(2)).toHaveAccessibleName(`${T.formulario.regular} ${cuantos('boca_riego', 'regular')}`);

  await estados.nth(3).click();
  await expect(filas(page)).toHaveCount(cuantos('boca_riego', 'malo'));
  await hoja.getByRole('button', { name: T.panelInventario.quitarFiltros }).click();
  await expect(filas(page)).toHaveCount(PUNTOS.length);
  await expect(hoja.getByRole('button', { name: T.panelInventario.quitarFiltros })).toHaveCount(0);
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
  await expect(menu.getByRole('menuitem')).toHaveText([
    T.panel.excel,
    T.panel.csv,
    T.panel.geojson,
    T.panel.inventarioCompletoJson,
  ]);
  await expect(menu.getByRole('menuitem', { name: T.panel.excel })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitem', { name: T.panel.csv })).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect(menu.getByRole('menuitem', { name: T.panel.inventarioCompletoJson })).toBeFocused();
  await page.keyboard.press('End');
  await expect(menu.getByRole('menuitem', { name: T.panel.inventarioCompletoJson })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(menu.getByRole('menuitem', { name: T.panel.excel })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(boton).toBeFocused();
  await expect(boton).toHaveAttribute('aria-expanded', 'false');

  // Tocar fuera lo cierra.
  await boton.click();
  await expect(menu).toBeVisible();
  await page.getByText(T.panel.atribucion).click();
  await expect(menu).toHaveCount(0);

  // Elegir con Intro: exporta lo filtrado y el foco vuelve al botón.
  await elegirTipo(page, T.mapa.hidrantes);
  await elegirEstado(page, T.formulario.malo);
  await boton.focus();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect(menu.getByRole('menuitem', { name: T.panel.geojson })).toBeFocused();
  const descarga = page.waitForEvent('download');
  await page.keyboard.press('Enter');
  expect((await descarga).suggestedFilename()).toMatch(/\.geojson$/);
  await expect(boton).toBeFocused();
  expect(llamadaA(llamadas, 'fn_exportar_inventario')).toEqual({ filtros: { tipo: 'hidrante', caudal: 'malo' } });
});

test('Inventario con filtros: axe en claro y oscuro, y a 412 px nada se sale a lo ancho (RV-123, docs/38 RV-506)', async ({
  page,
}) => {
  await prepararPanel(page);
  for (const tema of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: tema });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/admin/inventario');
    await elegirTipo(page, T.panelInventario.bocasDeRiego);
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

  // Tableta y móvil: el botón de filtros, Exportar y Tabla/Mapa en una fila (docs/38 RV-506).
  for (const [ancho, alto] of [
    [768, 1024],
    [412, 915],
  ] as const) {
    await page.setViewportSize({ width: ancho, height: alto });
    await page.goto('/admin/inventario');
    await elegirTipo(page, T.panelInventario.bocasDeRiego);
    const cajas = await Promise.all(
      [
        page.getByRole('button', { name: /^Filtros: / }),
        page.getByRole('button', { name: T.panel.exportar }),
        page.getByRole('radio', { name: T.panelInventario.mapa }),
      ].map((l) => l.boundingBox()),
    );
    const [f] = cajas.map((c) => c!);
    for (const c of cajas) expect(c!.y + c!.height / 2).toBeGreaterThan(f.y);
    for (const c of cajas) expect(c!.y + c!.height / 2).toBeLessThan(f.y + f.height);
    for (const c of cajas) expect(Math.round(c!.height)).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  }
  // El menú abierto cabe en la pantalla del móvil.
  await page.getByRole('button', { name: T.panel.exportar }).click();
  const menu = (await page.getByRole('menu').boundingBox())!;
  expect(menu.x).toBeGreaterThanOrEqual(0);
  expect(menu.x + menu.width).toBeLessThanOrEqual(412);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});

test('un filtro sin puntos: estado vacío, Exportar solo con el inventario completo, el motivo y "Quitar filtros" (RV-123, RV-335)', async ({
  page,
}) => {
  const llamadas = await prepararPanel(page);
  await page.goto('/admin/inventario');
  await expect(filas(page)).toHaveCount(PUNTOS.length);
  // En los datos de prueba no hay ningún punto con barro.
  await elegirEstado(page, T.formulario.barro);
  await expect(page.getByText(T.panelInventario.vacio)).toBeVisible();
  await expect(filas(page)).toHaveCount(0);
  const boton = page.getByRole('button', { name: T.panel.exportar });
  // El motivo: debajo del botón desde 768 px; en el móvil, dentro del menú (docs/38 RV-506).
  const movil = page.viewportSize()!.width < 768;
  if (!movil) {
    await expect(boton).toHaveAccessibleDescription(T.panelInventario.nadaQueExportar);
    await expect(page.getByText(T.panelInventario.nadaQueExportar)).toBeVisible();
  }
  // Lo filtrado no se puede exportar; el inventario completo (JSON), sí: no depende de los filtros
  // (docs/33 RV-335). Con el teclado, el menú entra directamente en él.
  await boton.focus();
  await page.keyboard.press('ArrowDown');
  const menu = page.getByRole('menu');
  for (const nombre of [T.panel.excel, T.panel.csv, T.panel.geojson]) {
    const opcion = menu.getByRole('menuitem', { name: nombre, exact: true });
    await expect(opcion).toBeDisabled();
    await expect(opcion).toHaveAccessibleDescription(T.panelInventario.nadaQueExportar);
  }
  const completo = menu.getByRole('menuitem', { name: T.panel.inventarioCompletoJson });
  await expect(completo).toBeEnabled();
  await expect(completo).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(completo).toBeFocused();
  await page.keyboard.press('Escape');
  expect(llamadaA(llamadas, 'fn_exportar_inventario')).toBeUndefined();
  const descarga = page.waitForEvent('download');
  await boton.click();
  await completo.click();
  expect((await descarga).suggestedFilename()).toMatch(/\.json$/);
  expect(llamadaA(llamadas, 'fn_exportar_inventario')).toEqual({ filtros: {} });

  await abrirFiltros(page);
  await page.getByRole('button', { name: T.panelInventario.quitarFiltros }).click();
  await page.getByRole('button', { name: T.panel.listo, exact: true }).click();
  await expect(filas(page)).toHaveCount(PUNTOS.length);
  if (!movil) await expect(boton).not.toHaveAttribute('aria-describedby');
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

// docs/31 RV-169: el oscuro elegido a mano (data-tema) con el sistema en claro. La variante dark: de
// Tailwind solo sigue al sistema; con un token en los dos bloques de index.css se ve igual.
test('Inventario, Registro y Ajustes: axe con el oscuro forzado sobre un sistema claro (RV-169)', async ({ page }) => {
  await prepararPanel(page);
  await page.emulateMedia({ colorScheme: 'light' });
  await page.addInitScript(() => localStorage.setItem('hidrantes.tema', JSON.stringify('oscuro')));
  for (const ruta of ['/admin/inventario', '/admin/registro', '/admin/ajustes']) {
    await page.goto(ruta);
    await expect(page.locator('html')).toHaveAttribute('data-tema', 'oscuro');
    await expect(page.getByRole('main').first()).toBeVisible();
    await page.waitForLoadState('networkidle');
    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .exclude('.leaflet-marker-pane')
      .analyze();
    expect(
      violations.flatMap((v) => v.nodes.map((n) => `${v.id} · ${n.target.join(' ')}`)),
      ruta,
    ).toEqual([]);
  }
});

// ---------- docs/38 RV-506 (DEC-213 a DEC-215): filas por debajo de 1.100 px, tabla desde ahí ----------

test.describe('Inventario por anchos (docs/38 RV-506)', () => {
  test.skip(({ isMobile }) => !!isMobile, 'cada test fija su ventana');
  const malos = PUNTOS.filter((p) => p.caudal === 'malo');

  test('a 412: sin cabeceras; el botón dice el orden; filtrar por Malo y ordenar por Dirección', async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 915 });
    await prepararPanel(page);
    await page.goto('/admin/inventario');
    await expect(filas(page)).toHaveCount(PUNTOS.length);
    await expect(page.getByRole('columnheader')).toHaveCount(0);
    const boton = page.getByRole('button', { name: /^Filtros: / });
    await expect(boton).toHaveAccessibleName(T.panel.filtrosDe(`${T.mapa.todos} · ${T.panelInventario.colCodigo} ▲`));
    // Sin filtro, el total no se repite al pie (ya está en la pestaña).
    await expect(page.getByText(/con este filtro/)).toHaveCount(0);
    await elegirEstado(page, T.formulario.malo);
    await expect(filas(page)).toHaveCount(malos.length);
    await expect(boton).toHaveAccessibleName(
      T.panel.filtrosDe(`${T.formulario.malo} · ${T.panelInventario.colCodigo} ▲`),
    );
    await expect(boton).toHaveClass(/anillo-seleccion/);
    await expect(page.getByText(T.panelInventario.puntosConFiltro(malos.length))).toBeVisible();
    await abrirFiltros(page);
    const orden = page.getByRole('radiogroup', { name: T.panelInventario.ordenarPorTitulo });
    await orden.getByRole('radio', { name: new RegExp(`^${T.ficha.direccion}`) }).click();
    await orden.getByRole('radio', { name: new RegExp(`^${T.ficha.direccion}`) }).click();
    await expect(orden.getByRole('radio', { name: `${T.ficha.direccion} ▼` })).toBeVisible();
    await page.getByRole('button', { name: T.panel.listo, exact: true }).click();
    await expect(boton).toHaveAccessibleName(T.panel.filtrosDe(`${T.formulario.malo} · ${T.ficha.direccion} ▼`));
  });

  test('a 412: tocar el código abre Editar; la dirección se escribe sin abrirlo; «⋯» → Borrar devuelve el foco', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 412, height: 915 });
    await prepararPanel(page);
    await page.goto('/admin/inventario');
    const celda = page.getByLabel(T.panelInventario.direccionDe(P0.codigo));
    await celda.click();
    await celda.fill('Calle Nueva 1');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(celda).toHaveValue('Calle Nueva 1');

    await filaInventario(page, P0.codigo).getByText(P0.codigo, { exact: true }).click();
    const editar = page.getByRole('dialog');
    await expect(editar).toBeVisible();
    expect(Math.round((await editar.boundingBox())!.width)).toBe(412);
    await page.keyboard.press('Escape');
    await expect(editar).toHaveCount(0);
    // El foco vuelve a la fila (su botón «Editar [código]»).
    await expect(
      filaInventario(page, P0.codigo).getByRole('button', { name: T.panelInventario.editarPunto(P0.codigo) }),
    ).toBeFocused();
    // Tocar otra parte de la fila (aquí, la línea de «Revisado:») también abre Editar: el botón la cubre entera.
    const caja = (await filaInventario(page, P0.codigo).boundingBox())!;
    await page.mouse.click(caja.x + 40, caja.y + caja.height - 8);
    await expect(editar).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(editar).toHaveCount(0);

    const mas = page.getByRole('button', { name: T.panel.masAcciones(P0.codigo) });
    await mas.click();
    await page.getByRole('menuitem', { name: T.panel.borrar, exact: true }).click();
    const dialogo = page.getByRole('dialog');
    await expect(dialogo.getByText(T.panelInventario.avisoBorrar)).toBeVisible();
    await dialogo.getByRole('button', { name: T.panelCola.cancelar }).click();
    await expect(dialogo).toHaveCount(0);
    await expect(mas).toBeFocused();
  });

  for (const [ancho, tabla] of [
    [820, false],
    [1099, false],
    [1100, true],
    [1280, true],
  ] as const) {
    test(`a ${ancho} px, ${tabla ? 'tabla' : 'filas'}`, async ({ page }) => {
      await page.setViewportSize({ width: ancho, height: 900 });
      await prepararPanel(page);
      await page.goto('/admin/inventario');
      await expect(filas(page)).toHaveCount(PUNTOS.length);
      await expect(page.getByRole('main').locator('table')).toHaveCount(tabla ? 1 : 0);
      await expect(page.getByRole('main').getByRole('list', { name: T.panelCola.inventario })).toHaveCount(
        tabla ? 0 : 1,
      );
    });
  }

  test('a 1280: Editar y «⋯» en cada fila, una fecha por revisión, sin «Mostrando», orden por cabecera', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await prepararPanel(page);
    await page.goto('/admin/inventario');
    await expect(filas(page)).toHaveCount(PUNTOS.length);
    await expect(page.getByText(/^Mostrando/)).toHaveCount(0);
    for (const fila of await filas(page).all()) {
      await expect(fila.getByRole('button', { name: T.panel.editar, exact: true })).toBeVisible();
      await expect(fila.getByRole('button', { name: /^Más acciones de / })).toBeVisible();
      // La revisión: un <time>, con la exacta en el title, sin una segunda fecha a la vista.
      await expect(fila.locator('time')).toHaveCount(1);
    }
    await page.getByRole('button', { name: T.panelInventario.ordenarPor(T.panelInventario.colCodigo) }).click();
    await expect(filas(page).first()).toContainText('HID-9008');
  });
});

// Capturas para la revisión a ojo (skill revisar-pantallas): PW_CAPTURAS=1, a 412, 820, 1280 y 1920, en claro y oscuro.
test.describe('capturas del Inventario (docs/38)', () => {
  test.skip(({ isMobile }) => !process.env.PW_CAPTURAS || isMobile, 'solo bajo demanda');
  for (const [ancho, alto] of [
    [412, 915],
    [820, 1180],
    [1280, 800],
    [1920, 1080],
  ] as const) {
    for (const tema of ['light', 'dark'] as const) {
      test(`inventario ${ancho} ${tema}`, async ({ page }) => {
        await page.setViewportSize({ width: ancho, height: alto });
        await page.emulateMedia({ colorScheme: tema });
        await prepararPanel(page);
        await page.goto('/admin/inventario');
        await expect(filas(page)).toHaveCount(PUNTOS.length);
        await page.screenshot({ path: `recorridos/capturas-38/inventario-${ancho}-${tema}.png` });
        await abrirFiltros(page);
        await page.screenshot({ path: `recorridos/capturas-38/inventario-filtros-${ancho}-${tema}.png` });
        await page.getByRole('button', { name: T.panel.listo, exact: true }).click();
        await page.getByRole('button', { name: T.panel.masAcciones(P0.codigo) }).click();
        await page.screenshot({ path: `recorridos/capturas-38/inventario-mas-${ancho}-${tema}.png` });
      });
    }
  }
});
