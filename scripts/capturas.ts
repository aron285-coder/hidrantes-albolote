// Capturas de la aplicación para los manuales 13 y 14 (09 Fase 9). Un móvil emulado recorre las
// pantallas del voluntario y deja los PNG en `docs/capturas/`, numerados y con nombre estable, para
// que los manuales puedan citarlos sin volver a hacerlos a mano cada vez que cambie una pantalla.
//
//   npm run capturas                      contra staging
//   npm run capturas -- --local           contra la pila local (wrangler en :8788)
//   npm run capturas -- --url <url> --codigo <6 cifras>
//   npm run capturas -- --oscuro          las mismas, en modo oscuro
//
// `docs/capturas/` se commitea y el repositorio es público (DEC-053): aquí solo entra el nombre de
// pruebas que escribe este script y los datos del seed, que van marcados `[PRUEBA]`. Antes de
// guardar cada imagen se comprueba que no asome ningún otro nombre de voluntario.

import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { devices, chromium, type Page } from '@playwright/test';
import { abortar, argumentos, ejecutarScript, log, RAIZ } from './lib/comun.ts';
import { T } from '../src/lib/textos.ts';

const DESTINO = path.join(RAIZ, 'docs', 'capturas');
const STAGING = 'https://hidrantes-albolote-staging.pages.dev';
const LOCAL = 'http://127.0.0.1:8788';
/** El código del seed de staging, que no es secreto; el real nunca se escribe aquí. */
const CODIGO_SEED = '000000';
/** Nombre neutro: lo que se vea en las capturas no puede ser de nadie (FR-27, DEC-053). */
export const FIRMA = { nombre: 'Voluntaria', apellido: 'Manual' };

export interface Captura {
  archivo: string;
  /** Qué enseña, para el pie de foto del manual. */
  que: string;
}

/** Nombre del archivo: `NN-nombre.png`, en el orden en que se recorren las pantallas. */
export const nombreArchivo = (i: number, nombre: string, oscuro: boolean) =>
  `${String(i).padStart(2, '0')}-${nombre}${oscuro ? '-oscuro' : ''}.png`;

/** Todas las palabras que la interfaz dice por su cuenta: lo que salga de ahí no es de nadie. */
export function vocabularioInterfaz(textos: unknown = T): Set<string> {
  const palabras = new Set<string>();
  const recorrer = (v: unknown) => {
    if (typeof v === 'string') {
      for (const p of v.split(/[^\p{L}]+/u)) if (p) palabras.add(p);
    } else if (typeof v === 'function') {
      recorrer((v as (...a: unknown[]) => unknown)('[n]', '[n]', '[n]'));
    } else if (v && typeof v === 'object') {
      Object.values(v).forEach(recorrer);
    }
  };
  recorrer(textos);
  return palabras;
}

/**
 * Un "Nombre Apellido" de la pantalla que no debería acabar en una captura pública (FR-27,
 * DEC-053). Solo cuenta si las dos palabras van en la misma línea y **ninguna** es vocabulario de
 * la interfaz: "Mis propuestas" o "Aviso legal" no son nadie; "Lucía Fernández", sí.
 */
export function nombresAjenos(texto: string, { firma = FIRMA, vocabulario = vocabularioInterfaz() } = {}): string[] {
  const propio = `${firma.nombre} ${firma.apellido}`;
  const sospechosos = new Set<string>();
  for (const linea of texto.split('\n')) {
    for (const [, a, b] of linea.matchAll(/\b([A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,})[ ]+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,})\b/g)) {
      const candidato = `${a} ${b}`;
      if (candidato === propio) continue;
      if (vocabulario.has(a) || vocabulario.has(b)) continue;
      sospechosos.add(candidato);
    }
  }
  return [...sospechosos];
}

/** El índice que leerán quienes escriban 13 y 14: qué es cada archivo y de dónde salió. */
export function indice(capturas: Captura[], url: string, cuando: Date): string {
  const fecha = cuando.toISOString().slice(0, 10);
  return [
    '# Capturas de la aplicación',
    '',
    `Generadas con \`npm run capturas\` el ${fecha} desde ${url}, con un móvil emulado (Pixel 7).`,
    'No se editan a mano: si una pantalla cambia, se vuelve a lanzar el script.',
    '',
    'Llevan la banda **ENTORNO DE PRUEBAS** porque no se hacen contra producción (04 §4), y los',
    'datos son los del seed, marcados `[PRUEBA]`. Ningún nombre de voluntario aparece en ellas: el',
    'script entra con un nombre neutro y avisa si encuentra cualquier otro (FR-27, DEC-053).',
    '',
    '| Archivo | Qué enseña |',
    '|---|---|',
    ...capturas.map((c) => `| \`${c.archivo}\` | ${c.que} |`),
    '',
  ].join('\n');
}

async function guardar(page: Page, destino: string, archivo: string, aviso: (t: string) => void): Promise<void> {
  const texto = await page.locator('body').innerText();
  const ajenos = nombresAjenos(texto);
  if (ajenos.length) aviso(`${archivo}: revisa si esto puede publicarse — ${ajenos.slice(0, 3).join(', ')}`);
  await page.screenshot({ path: path.join(destino, archivo) });
}

async function entrar(page: Page, url: string, codigo: string): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.getByLabel(T.entrada.cifra(1)).fill(codigo[0]);
  await page.keyboard.type(codigo.slice(1));
  await page.getByLabel(T.entrada.nombre).fill(FIRMA.nombre);
  await page.getByLabel(T.entrada.apellido).fill(FIRMA.apellido);
}

async function principal(): Promise<void> {
  const { banderas, valores } = argumentos();
  const oscuro = banderas.has('oscuro');
  const url = valores.get('url') ?? (banderas.has('local') ? LOCAL : STAGING);
  const codigo = valores.get('codigo') ?? CODIGO_SEED;
  if (!/^\d{6}$/.test(codigo)) abortar('El código son seis cifras.');
  if (url.includes('hidrantes-albolote.pages.dev')) {
    abortar('Producción no: las capturas se hacen en staging o en local (04 §4).');
  }

  log.paso(`Capturas de ${url} en un móvil emulado${oscuro ? ', modo oscuro' : ''}`);
  mkdirSync(DESTINO, { recursive: true });

  const navegador = await chromium.launch({ channel: process.env.PW_CANAL || undefined });
  const contexto = await navegador.newContext({
    ...devices['Pixel 7'],
    locale: 'es-ES',
    timezoneId: 'Europe/Madrid',
    colorScheme: oscuro ? 'dark' : 'light',
    permissions: ['geolocation'],
    geolocation: { latitude: 37.2309, longitude: -3.6558 },
  });
  // Encuadre de partida sobre el casco de Albolote: el mapa recuerda la última vista, y la de por
  // defecto abarca los dos términos enteros, donde los marcadores salen como cabezas de alfiler.
  await contexto.addInitScript(() => {
    try {
      localStorage.setItem('hidrantes.vista', JSON.stringify({ centro: [37.2309, -3.6558], zoom: 15 }));
    } catch {
      // sin almacenamiento: se queda el encuadre de toda la zona
    }
  });
  const page = await contexto.newPage();
  page.setDefaultTimeout(30_000);
  const hechas: Captura[] = [];
  let avisos = 0;
  const aviso = (t: string) => {
    avisos++;
    log.aviso(t);
  };
  const capturar = async (nombre: string, que: string) => {
    const archivo = nombreArchivo(hechas.length + 1, nombre, oscuro);
    await guardar(page, DESTINO, archivo, aviso);
    hechas.push({ archivo, que });
    log.ok(`${archivo} · ${que}`);
  };

  try {
    // 1. Entrada, con el código y el nombre ya escritos (FL-01).
    await entrar(page, url, codigo);
    await capturar('entrada', 'La pantalla de entrada, con el código del grupo y el nombre');

    await page.getByRole('button', { name: T.entrada.entrar, exact: true }).click();

    // 2-4. Las tres pantallas de primer uso (FR-94).
    for (const [i, pantalla] of T.bienvenida.pantallas.entries()) {
      await page.getByRole('heading', { name: pantalla.titulo }).waitFor();
      await capturar(`bienvenida-${i + 1}`, pantalla.titulo);
      await page.getByRole('button', { name: i === 2 ? T.bienvenida.empezar : T.bienvenida.siguiente }).click();
    }

    // 5. El mapa con los puntos.
    await page.getByRole('region', { name: T.mapa.leyenda }).waitFor();
    await page.waitForTimeout(1500); // que terminen de pintarse las teselas del mapa base
    await capturar('mapa', 'El mapa con los puntos, la leyenda y la barra de estado');

    // 6. La lista, que es como se busca sin mirar el mapa.
    await page.getByRole('link', { name: T.navegacion.lista }).click();
    await page.getByPlaceholder(T.mapa.buscar).waitFor();
    await page.waitForTimeout(500);
    await capturar('lista', 'La lista de puntos, con sus filtros y la distancia');

    // 7. La ficha de un punto.
    const primero = page
      .locator('button')
      .filter({ hasText: /HID-|BOC-/ })
      .first();
    if (await primero.count()) {
      await primero.click();
      await page.getByRole('article').waitFor();
      await page.waitForTimeout(500);
      await capturar('ficha', 'La ficha de un punto: estado, medidas, dirección y foto');
      await page.goto(url, { waitUntil: 'domcontentloaded' });
    } else {
      aviso('sin puntos en el listado: no se captura la ficha');
    }

    // 8. El alta, que es la pantalla que más se usa.
    await page.goto(`${url}/proponer/alta`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('selector-pin').waitFor();
    await page.waitForTimeout(1500);
    await capturar('nuevo-punto', 'Nuevo punto: el pin sobre el mapa y el formulario');

    // 9. Mis propuestas y 10. Ajustes.
    await page.goto(`${url}/mis-propuestas`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    await capturar('mis-propuestas', 'Mis propuestas, con el estado de cada envío');

    await page.goto(`${url}/ajustes`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    await capturar('ajustes', 'Ajustes: mapa base, avisos, modo oscuro y aviso legal');
  } finally {
    await contexto.close();
    await navegador.close();
  }

  writeFileSync(path.join(DESTINO, 'LEEME.md'), indice(hechas, url, new Date()), 'utf8');
  log.paso(`${hechas.length} capturas en docs/capturas/ (con su LEEME.md)`);
  for (const c of hechas) log.info(`${c.archivo} · ${c.que}`);
  if (avisos) log.aviso(`${avisos} aviso(s): míralas antes de commitearlas.`);
}

/** Lo que hay ahora mismo en la carpeta, para el informe de los manuales. */
export const capturasExistentes = (): string[] =>
  readdirSync(DESTINO, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith('.png'))
    .map((d) => d.name)
    .sort();

/** Solo para las pruebas: deja la carpeta como estaba. */
export const limpiar = () => rmSync(DESTINO, { recursive: true, force: true });

if (import.meta.main) ejecutarScript(principal);
