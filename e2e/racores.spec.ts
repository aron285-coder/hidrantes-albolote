// Fotos de referencia del racor (FR-20, docs/24 RV-104).
// 1. scripts/preparar-racores.ts con una imagen de prueba generada aquí: 160 × 160 y ≤ 25 kB. Va en
//    Playwright y no en vitest porque necesita el navegador, y el job de vitest del CI no lo tiene.
// 2. Sin cobertura tras la primera carga, la foto del racor se sigue viendo (precache del Service
//    Worker). Solo cuando el desarrollador ya ha puesto las fotos en public/racores (docs/24 §5).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { LADO, MAXIMO_BYTES, prepararRacores } from '../scripts/preparar-racores.ts';
import { T } from '../src/lib/textos.ts';
import { conSesion, simularRpc } from './ayudas.ts';
import { LISTADO } from './puntos.ts';

test('preparar-racores recorta al centro y deja 160 × 160 en ≤ 25 kB', async ({ page, isMobile }, info) => {
  test.skip(!!isMobile, 'basta con una pasada');
  await page.setContent('<html><body></body></html>');
  // Foto de prueba apaisada y con ruido, para que el WebP tenga que bajar de calidad.
  const png = await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 1200;
    c.height = 800;
    const ctx = c.getContext('2d')!;
    const g = ctx.createLinearGradient(0, 0, 1200, 800);
    g.addColorStop(0, '#8a5a2b');
    g.addColorStop(1, '#2b5a8a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1200, 800);
    const datos = ctx.getImageData(0, 0, 1200, 800);
    for (let i = 0; i < datos.data.length; i += 4) {
      const ruido = (Math.random() - 0.5) * 120;
      datos.data[i] += ruido;
      datos.data[i + 1] += ruido;
      datos.data[i + 2] += ruido;
    }
    ctx.putImageData(datos, 0, 0);
    // Marca roja en el centro: tiene que seguir en el centro tras el recorte.
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(560, 360, 80, 80);
    const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png'));
    return [...new Uint8Array(await blob.arrayBuffer())];
  });
  const entrada = info.outputPath('originales');
  const salida = info.outputPath('racores');
  mkdirSync(entrada, { recursive: true });
  writeFileSync(path.join(entrada, 'granada.png'), Buffer.from(png));
  writeFileSync(path.join(entrada, 'Barcelona-frente.png'), Buffer.from(png));
  writeFileSync(path.join(entrada, 'directo.png'), Buffer.from(png));

  const escritas = await prepararRacores(entrada, salida, page);
  expect(escritas.map((r) => path.basename(r))).toEqual(['granada.webp', 'barcelona.webp', 'directo.webp']);
  for (const archivo of escritas) {
    const bytes = readFileSync(archivo);
    expect(bytes.length).toBeLessThanOrEqual(MAXIMO_BYTES);
    const medida = await page.evaluate(async (b64) => {
      const img = await createImageBitmap(await (await fetch(`data:image/webp;base64,${b64}`)).blob());
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const [r, g, b] = ctx.getImageData(img.width / 2, img.height / 2, 1, 1).data;
      return { ancho: img.width, alto: img.height, centro: [r, g, b] };
    }, bytes.toString('base64'));
    expect(medida.ancho).toBe(LADO);
    expect(medida.alto).toBe(LADO);
    expect(medida.centro[0]).toBeGreaterThan(180);
    expect(medida.centro[1]).toBeLessThan(90);
  }
});

test('falta una foto: el script lo dice y no escribe nada', async ({ page, isMobile }, info) => {
  test.skip(!!isMobile, 'basta con una pasada');
  const entrada = info.outputPath('solo-granada');
  mkdirSync(entrada, { recursive: true });
  writeFileSync(path.join(entrada, 'granada.jpg'), Buffer.from([0xff, 0xd8, 0xff]));
  await expect(prepararRacores(entrada, info.outputPath('salida'), page)).rejects.toThrow(/Falta la foto de barcelona/);
  expect(existsSync(info.outputPath('salida'))).toBe(false);
});

test('una foto que no se puede leer no deja la otra puesta a medias', async ({ page, isMobile }, info) => {
  test.skip(!!isMobile, 'basta con una pasada');
  await page.setContent('<html><body></body></html>');
  const png = await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = c.height = 300;
    const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png'));
    return [...new Uint8Array(await blob.arrayBuffer())];
  });
  const entrada = info.outputPath('una-rota');
  mkdirSync(entrada, { recursive: true });
  writeFileSync(path.join(entrada, 'granada.png'), Buffer.from(png));
  writeFileSync(path.join(entrada, 'barcelona.png'), Buffer.from('no es una imagen'));
  await expect(prepararRacores(entrada, info.outputPath('salida'), page, ['granada', 'barcelona'])).rejects.toThrow(
    /barcelona\.png/,
  );
  expect(existsSync(info.outputPath('salida'))).toBe(false);
});

// docs/29 RV-121: la de Directo llega después; con la lista, solo esa, sin rehacer las otras dos.
test('con la lista de racores prepara solo esos', async ({ page, isMobile }, info) => {
  test.skip(!!isMobile, 'basta con una pasada');
  await page.setContent('<html><body></body></html>');
  const png = await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = c.height = 300;
    const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png'));
    return [...new Uint8Array(await blob.arrayBuffer())];
  });
  const entrada = info.outputPath('solo-directo');
  mkdirSync(entrada, { recursive: true });
  writeFileSync(path.join(entrada, 'directo.png'), Buffer.from(png));
  const escritas = await prepararRacores(entrada, info.outputPath('salida'), page, ['directo']);
  expect(escritas.map((r) => path.basename(r))).toEqual(['directo.webp']);
});

test('dos fotos del mismo racor: lo dice en vez de elegir una al azar', async ({ page, isMobile }, info) => {
  test.skip(!!isMobile, 'basta con una pasada');
  const entrada = info.outputPath('dos-granada');
  mkdirSync(entrada, { recursive: true });
  for (const a of ['granada.jpg', 'granada-vieja.png', 'barcelona.jpg']) writeFileSync(path.join(entrada, a), '');
  await expect(prepararRacores(entrada, info.outputPath('salida'), page)).rejects.toThrow(/más de una foto de granada/);
});

async function abrirBoca(page: import('@playwright/test').Page) {
  await conSesion(page);
  await simularRpc(page, { fn_listar_puntos: LISTADO, fn_registrar_error: null });
  await page.goto('/proponer/alta');
  await page.getByRole('radio', { name: T.formulario.bocaRiego }).click();
}

test('sin las fotos en el servidor, los botones se ven solo con el nombre', async ({ page }) => {
  await page.route('**/racores/*.webp', (r) => r.fulfill({ status: 404, body: '' }));
  await abrirBoca(page);
  for (const nombre of [T.formulario.granada, T.formulario.barcelona, T.formulario.directo, T.formulario.otro]) {
    const boton = page.getByRole('radio', { name: nombre });
    await expect(boton).toBeVisible();
    await expect(boton.locator('img')).toHaveCount(0);
  }
});

test('con las fotos, se ven encima del nombre y tocar la foto elige el racor', async ({ page }) => {
  await page.setContent('<html><body></body></html>');
  const webp = await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = c.height = 160;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#6b4423';
    ctx.fillRect(0, 0, 160, 160);
    const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/webp', 0.8));
    return [...new Uint8Array(await blob.arrayBuffer())];
  });
  await page.route('**/racores/*.webp', (r) =>
    r.fulfill({ status: 200, contentType: 'image/webp', body: Buffer.from(webp) }),
  );
  await abrirBoca(page);
  const barcelona = page.getByRole('radio', { name: T.formulario.barcelona });
  const img = barcelona.locator('img');
  await expect(img).toBeVisible();
  expect(await img.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(LADO);
  await expect(page.getByRole('radio', { name: T.formulario.otro }).locator('img')).toHaveCount(0);
  await img.click();
  await expect(barcelona).toHaveAttribute('aria-checked', 'true');
});

const HAY_FOTOS = ['granada', 'barcelona'].every((r) =>
  existsSync(path.resolve(import.meta.dirname, `../public/racores/${r}.webp`)),
);

test('sin cobertura, la foto del racor se sigue viendo (precache)', async ({ page, context }) => {
  test.skip(!HAY_FOTOS, 'las fotos de los racores aún no están en public/racores (las pone el desarrollador)');
  await conSesion(page);
  await simularRpc(page, { fn_listar_puntos: LISTADO, fn_registrar_error: null });
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await context.setOffline(true);
  await page.goto('/proponer/alta');
  await page.getByRole('radio', { name: T.formulario.bocaRiego }).click();
  const granada = page.getByRole('radio', { name: T.formulario.granada });
  const img = granada.locator('img');
  await expect(img).toBeVisible();
  expect(await img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth)).toBe(LADO);
});
