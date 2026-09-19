// Iconos de la PWA a partir del escudo de 07 §7.1 (npm run iconos). Dibuja el SVG en el navegador
// de Playwright y lo guarda en PNG: sin dependencias nuevas. Los PNG se commitean en public/iconos.
// En local sin Chromium descargado: PW_CANAL=msedge npm run iconos.

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const FONDO = '#F1F3EE'; // --fondo (06 §2.1), el mismo que background_color del manifiesto
const ESCUDO = `
  <path d="M29 2 L54 11 V30 C54 47 43 58 29 64 C15 58 4 47 4 30 V11 Z" fill="#0E1B30" stroke="#B08A2E" stroke-width="2"/>
  <path d="M29 14 C34 14 38 18 38 23 C38 30 29 40 29 40 C29 40 20 30 20 23 C20 18 24 14 29 14 Z" fill="#E97136"/>
  <circle cx="29" cy="23" r="4.2" fill="#0E1B30"/>`;

/** Escudo centrado en un cuadrado; `proporcion` es la altura del escudo respecto al lado. */
function svg(proporcion: number, fondo: string | null): string {
  const lado = 66 / proporcion;
  const x = (lado - 58) / 2;
  const y = (lado - 66) / 2;
  const rect = fondo ? `<rect width="${lado}" height="${lado}" fill="${fondo}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lado} ${lado}">${rect}<g transform="translate(${x} ${y})">${ESCUDO}</g></svg>`;
}

const PNG: { archivo: string; lado: number; proporcion: number }[] = [
  { archivo: 'icono-192.png', lado: 192, proporcion: 0.8 },
  { archivo: 'icono-512.png', lado: 512, proporcion: 0.8 },
  // maskable: el sistema recorta hasta un círculo del 80 %; el escudo queda dentro de la zona segura
  { archivo: 'icono-maskable-512.png', lado: 512, proporcion: 0.58 },
  // iOS no admite transparencia ni recorta: fondo lleno y algo de margen
  { archivo: 'apple-touch-icon.png', lado: 180, proporcion: 0.72 },
];

const salida = path.resolve(import.meta.dirname, '../public/iconos');
mkdirSync(salida, { recursive: true });
writeFileSync(path.join(salida, 'icono.svg'), svg(0.94, null) + '\n');

const navegador = await chromium.launch({ channel: process.env.PW_CANAL || undefined });
const pagina = await navegador.newPage();
for (const { archivo, lado, proporcion } of PNG) {
  await pagina.setViewportSize({ width: lado, height: lado });
  await pagina.setContent(
    `<html><body style="margin:0">${svg(proporcion, FONDO).replace('<svg ', `<svg width="${lado}" height="${lado}" `)}</body></html>`,
  );
  await pagina.screenshot({ path: path.join(salida, archivo), omitBackground: false });
  console.log(`✓ ${archivo} (${lado} px)`);
}
await navegador.close();
