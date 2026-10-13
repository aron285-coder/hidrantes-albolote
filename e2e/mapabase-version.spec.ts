// docs/21 RV-85: quien nunca descargó el mapa base solo tiene, sin cobertura, las teselas sueltas de
// `hidrantes-teselas-<versión>`. Un Service Worker nuevo borra las de otras versiones al activarse
// (docs/20 RV-71): tras eso, el aviso "El mapa base no está en el móvil" tiene que salir, con
// cobertura y sin ella (DEC-124).
//
// docs/35 RV-421: bajar otra copia del mapa base en la misma sesión deja el mapa base bien pintado.

import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { expect, test, type Page } from '@playwright/test';
import info from '../datos/mapabase.json' with { type: 'json' };
import { escribirPmtiles, teselasDelRecuadro } from '../scripts/lib/pmtiles.ts';
import { T } from '../src/lib/textos.ts';
import { conSesion, simularRpc } from './ayudas.ts';
import { LISTADO, PUNTOS } from './puntos.ts';

const VIEJA = 'hidrantes-teselas-19990101';

test.skip(({ isMobile }) => !isMobile, 'basta con el móvil: el Service Worker es el mismo');

test('con teselas sueltas de una versión vieja y el SW nuevo, se borran y el aviso sale (RV-85)', async ({
  page,
  context,
}) => {
  // Con datos móviles: el mapa base no se descarga solo (FR-81), así que solo hay teselas sueltas.
  await page.addInitScript(() => {
    const conexion = Object.assign(new EventTarget(), { type: 'cellular', saveData: false });
    Object.defineProperty(navigator, 'connection', { get: () => conexion, configurable: true });
  });
  await conSesion(page);
  await simularRpc(page, { fn_listar_puntos: LISTADO, fn_registrar_error: null });
  await page.goto('/');
  await expect(page.getByTestId('estado-sincro')).toHaveAttribute('data-puntos', String(PUNTOS.length));
  // Teselas vistas en línea con la versión anterior del mapa base.
  await page.evaluate(async (nombre) => {
    await navigator.serviceWorker.ready;
    const c = await caches.open(nombre);
    await c.put('/mapabase/t/19990101/12/2040/1580.mvt', new Response('tesela vieja'));
  }, VIEJA);

  // Llega un Service Worker nuevo: se instala y se activa de cero.
  await page.evaluate(async () => {
    for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
  });
  await page.reload();
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await expect.poll(() => page.evaluate(() => caches.keys())).not.toContain(VIEJA);

  // Con cobertura, el aviso ofrece la descarga.
  await expect(page.getByTestId('aviso-mapabase')).toContainText(T.mapa.mapabaseFalta);

  // Sin cobertura, dice que el fondo no está.
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText(T.mapa.mapaNoDescargado)).toBeVisible();
});

/**
 * Una copia anterior del mapa base: las mismas teselas que la del despliegue pero vacías, así que
 * cada una está en otro sitio del archivo. Del tamaño esperado, para que se guarde.
 */
function copiaAnterior(): Buffer {
  const recuadro = info.recuadro as [number, number, number, number];
  const vacia = gzipSync(Buffer.alloc(0));
  const teselas = [];
  for (let z = info.zoom[0]!; z <= info.zoom[1]!; z++) {
    for (const { x, y } of teselasDelRecuadro(z, recuadro)) teselas.push({ z, x, y, datos: vacia });
  }
  const archivo = escribirPmtiles(teselas, {
    compresionTeselas: 2,
    tipoTesela: 1,
    minZoom: info.zoom[0]!,
    maxZoom: info.zoom[1]!,
    recuadro,
    metadatos: {},
  });
  const lleno = Buffer.alloc(info.bytes);
  lleno.set(archivo);
  return lleno;
}

/** Lienzos del mapa base con algo pintado: más colores que el fondo liso (como en mapa.spec.ts, RV-71). */
const lienzosPintados = (page: Page) =>
  page.evaluate(() => {
    let pintados = 0;
    for (const c of document.querySelectorAll<HTMLCanvasElement>(
      '.leaflet-tile-container canvas, canvas.leaflet-tile',
    )) {
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      const colores = new Set<string>();
      for (let i = 0; i < d.length; i += 4 * 61) colores.add(`${d[i]},${d[i + 1]},${d[i + 2]}`);
      if (colores.size > 3) pintados++;
    }
    return pintados;
  });

test('al bajar la versión nueva del mapa base en la misma sesión, se pinta bien y sin errores (RV-421)', async ({
  page,
}) => {
  // Datos móviles: el mapa base no se descarga solo (FR-81); lo baja el botón del aviso.
  await page.addInitScript(() => {
    const conexion = Object.assign(new EventTarget(), { type: 'cellular', saveData: false });
    Object.defineProperty(navigator, 'connection', { get: () => conexion, configurable: true });
  });
  // La primera descarga recibe la copia anterior; la siguiente, la del despliegue.
  const copias = [copiaAnterior(), readFileSync('public/mapabase/albolote.pmtiles')];
  let descargas = 0;
  await page.route('**/mapabase/*.pmtiles', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/octet-stream',
      body: copias[Math.min(descargas++, copias.length - 1)]!,
    }),
  );
  await conSesion(page);
  await simularRpc(page, { fn_listar_puntos: LISTADO, fn_registrar_error: null });
  await page.goto('/');
  await expect(page.getByTestId('estado-sincro')).toHaveAttribute('data-puntos', String(PUNTOS.length));
  const aviso = page.getByTestId('aviso-mapabase');
  await aviso.getByRole('button', { name: /^Descargar \(\d+,\d MB\)$/ }).click();
  await expect(aviso).toHaveCount(0, { timeout: 20_000 });

  // Lo descargado pasa a ser de una versión anterior a la del despliegue, y el mapa lo lee al abrir.
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('hidrantes.mapabase')!);
    localStorage.setItem('hidrantes.mapabase', JSON.stringify({ ...d, version: '2000-01-01' }));
  });
  await page.reload();
  await expect(page.getByTestId('estado-sincro')).toHaveAttribute('data-puntos', String(PUNTOS.length));
  await expect(aviso).toContainText(T.ajustes.versionNuevaMapa);
  await expect.poll(() => lienzosPintados(page)).toBe(0);

  const errores: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errores.push(m.text());
  });
  page.on('pageerror', (e) => errores.push(e.message));
  await aviso.getByRole('button', { name: T.mapa.descargarVersionNueva }).click();
  await expect(aviso).toHaveCount(0, { timeout: 20_000 });
  expect(descargas).toBe(2);

  await expect.poll(() => lienzosPintados(page), { timeout: 15_000 }).toBeGreaterThan(0);
  expect(errores).toEqual([]);
});
