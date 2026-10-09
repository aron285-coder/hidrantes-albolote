// docs/26 RV-113 (DEC-164): en el móvil, jefatura llega al panel desde la app con un toque, por la
// etiqueta «Jefatura» de la barra o por «Panel de jefatura» en Ajustes, y vuelve con «Ir al mapa» o
// con «atrás» sin salir de la app. Un voluntario no ve ninguno de los dos accesos.

import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { T } from '../src/lib/textos.ts';
import { conGoogle, conSesion, simularRpc, simularTablas } from './ayudas.ts';
import { LISTADO, PUNTOS } from './puntos.ts';

// 412 × 915 es el Pixel 7 del proyecto «movil»: en escritorio el panel ya se abre al entrar (FR-150).
test.skip(({ isMobile }) => !isMobile, 'el acceso al panel desde la app es del móvil');

async function comoJefatura(page: Page) {
  await conGoogle(page, 'jefa@example.org');
  await simularTablas(page, { v_puntos_activos: PUNTOS, v_cola_revision: [], propuestas: [], puntos: [] });
  await simularRpc(page, { fn_es_admin: true, fn_registrar_error: null });
}

const etiqueta = (page: Page) => page.getByRole('link', { name: T.jefatura.abrirPanel });
// Exacto: «Abrir el panel de jefatura», la etiqueta de la barra, también contiene el texto.
const botonAjustes = (page: Page) => page.getByRole('link', { name: T.ajustes.irAlPanel, exact: true });

async function enElPanel(page: Page) {
  await expect(page).toHaveURL(/\/admin\/cola$/);
  await expect(page.getByRole('link', { name: T.panelCola.colaRevision })).toBeVisible();
}

test('en el mapa, tocar «Jefatura» abre el panel y «Ir al mapa» vuelve (RV-113 · 1 y 2)', async ({ page }) => {
  await comoJefatura(page);
  await page.goto('/');
  await expect(page.getByTestId('mapa')).toBeVisible();
  // El objetivo táctil mide al menos 44 × 44 px (UI-15).
  const caja = await etiqueta(page).boundingBox();
  expect(caja!.width).toBeGreaterThanOrEqual(44);
  expect(caja!.height).toBeGreaterThanOrEqual(44);

  await etiqueta(page).click();
  await enElPanel(page);

  // Por debajo de 800 px, "Ir al mapa" está en el menú ☰ de la cabecera (docs/33 RV-331).
  const menu = page.getByRole('button', { name: T.panel.menu });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('link', { name: T.jefatura.irAlMapa }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('mapa')).toBeVisible();
});

test('Ajustes → «Panel de jefatura» abre el panel y «atrás» vuelve a Ajustes (RV-113 · 3 y 4)', async ({ page }) => {
  await comoJefatura(page);
  await page.goto('/');
  await page.getByRole('link', { name: T.navegacion.ajustes }).click();
  await expect(page).toHaveURL(/\/ajustes$/);

  await botonAjustes(page).click();
  await enElPanel(page);

  // El «atrás» de Android: vuelve a Ajustes, dentro de la app.
  await page.goBack();
  await expect(page).toHaveURL(/\/ajustes$/);
  await expect(botonAjustes(page)).toBeVisible();
});

// DEC-164: en un formulario a medias, un toque sin querer en la esquina se llevaría las fotos y los datos.
test('en el formulario de alta, la etiqueta Jefatura se ve pero no lleva al panel (DEC-164)', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 37.2309, longitude: -3.6566, accuracy: 9 });
  await comoJefatura(page);
  await page.goto('/');
  await page.getByRole('button', { name: T.navegacion.nuevoPunto }).click();
  await expect(page.getByRole('radio', { name: T.formulario.hidrante })).toBeVisible();
  await expect(page.getByText(T.navegacion.jefatura, { exact: true })).toBeVisible();
  await expect(etiqueta(page)).toHaveCount(0);
});

test('con sesión de voluntario no están ni la etiqueta ni el botón (RV-113 · 5)', async ({ page }) => {
  await conSesion(page);
  await simularRpc(page, { fn_listar_puntos: LISTADO, fn_registrar_error: null });
  await page.goto('/');
  await expect(page.getByTestId('mapa')).toBeVisible();
  await expect(etiqueta(page)).toHaveCount(0);
  await expect(page.getByText(T.navegacion.jefatura, { exact: true })).toHaveCount(0);

  await page.getByRole('link', { name: T.navegacion.ajustes }).click();
  await expect(page.getByText(T.ajustes.firma)).toBeVisible();
  await expect(botonAjustes(page)).toHaveCount(0);
});

test('accesibilidad (axe) de la barra y de Ajustes con sesión de jefatura (RV-113)', async ({ page }) => {
  await comoJefatura(page);
  await page.goto('/');
  await expect(etiqueta(page)).toBeVisible();
  const analizar = () =>
    new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .include('header')
      .analyze();
  expect((await analizar()).violations.map((v) => v.id)).toEqual([]);

  await page.getByRole('link', { name: T.navegacion.ajustes }).click();
  await expect(botonAjustes(page)).toBeVisible();
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(violations.map((v) => `${v.id} · ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
});
