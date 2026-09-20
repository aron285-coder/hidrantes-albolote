// El panel es de escritorio, pero tiene que ser usable en tableta y con teclado (FR-100, TR-35).

import { expect, test } from '@playwright/test';
import { T } from '../src/lib/textos.ts';
import { SUPABASE_PRUEBAS } from '../playwright.config.ts';
import { conGoogle, simularTablas } from './ayudas.ts';
import { PUNTOS } from './puntos.ts';

const [P0] = PUNTOS;

const PENDIENTE = {
  id: 'c1',
  operacion: 'estado',
  estado: 'pendiente',
  creada_en: new Date(Date.now() - 7_200_000).toISOString(),
  autor_nombre: 'Sara',
  autor_apellido: 'Ruiz',
  dispositivo_id: 'd1',
  punto_id: P0.id,
  codigo: P0.codigo,
  datos: { caudal: 'regular' },
  antes: { caudal: 'bueno' },
  foto_path: null,
  foto_path_actual: null,
  direccion_sugerida: null,
  direccion_actual: P0.direccion,
  lat: null,
  lng: null,
  origen_ubicacion: null,
  precision_gps_m: null,
  distancia_gps_m: null,
  distancia_exif_m: null,
  fuera_de_zona: false,
  meses_desde_revision: 1,
  duplicado_de: null,
  distancia_duplicado_m: null,
  codigo_duplicado: null,
  otra_medida: false,
  desactualizada: false,
  nucleo: 'Albolote',
  punto_actualizado_en: null,
};

test.beforeEach(async ({ page }) => {
  await conGoogle(page, 'jefe@example.org');
  await simularTablas(page, { v_puntos_activos: PUNTOS, v_cola_revision: [PENDIENTE], propuestas: [PENDIENTE] });
  await page.route(`${SUPABASE_PRUEBAS}/rest/v1/rpc/fn_es_admin`, (r) =>
    r.fulfill({ contentType: 'application/json', body: 'true' }),
  );
});

test('en tableta la cola y el detalle se apilan, sin desbordar a lo ancho', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/admin/cola');
  const lista = page.getByRole('region', { name: T.panelCola.colaRevision });
  await expect(lista).toBeVisible();
  const detalle = page.getByRole('article');
  await expect(detalle).toBeVisible();

  // Apilados: el detalle empieza por debajo de la lista, no a su lado.
  const cajaLista = (await lista.boundingBox())!;
  const cajaDetalle = (await detalle.boundingBox())!;
  expect(cajaDetalle.y).toBeGreaterThan(cajaLista.y);
  // Y nada se sale de la pantalla.
  const desborde = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(desborde).toBeLessThanOrEqual(1);
});

test('el panel se maneja con el teclado (TR-35)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/admin/cola');
  await expect(page.getByRole('article')).toBeVisible();

  // Desde la búsqueda global se llega a las pestañas y a la lista solo con el tabulador.
  await page.getByPlaceholder(T.panelCola.buscar).focus();
  const alcanzado: string[] = [];
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press('Tab');
    alcanzado.push(await page.evaluate(() => document.activeElement?.textContent?.trim().slice(0, 40) ?? ''));
  }
  expect(alcanzado.some((t) => t.includes(T.panelCola.inventario))).toBe(true);
  expect(alcanzado.some((t) => t.includes(P0.codigo))).toBe(true);

  // Y el foco se ve: el anillo del navegador no está anulado.
  const anillo = await page.evaluate(() => {
    const boton = document.querySelector('a[href="/admin/inventario"]') as HTMLElement;
    boton.focus();
    const estilo = getComputedStyle(boton);
    return `${estilo.outlineStyle}|${estilo.outlineWidth}`;
  });
  expect(anillo).not.toBe('none|0px');
});
