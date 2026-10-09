// docs/32 RV-239 y RV-240: volver atrás desde un formulario a medias pregunta (con la flecha y con el
// "atrás" de Android, que es el del historial), y la pantalla de resultado tiene su propia ruta.

import { expect, test, type Page } from '@playwright/test';
import { T } from '../src/lib/textos.ts';
import { conSesion } from './ayudas.ts';
import { LISTADO, PUNTOS } from './puntos.ts';
import { SUPABASE_PRUEBAS } from '../playwright.config.ts';

const HID = PUNTOS[0];
const FORMULARIO = `/proponer/datos?p=${HID.id}`;

async function preparar(page: Page) {
  await conSesion(page);
  await page.route(`${SUPABASE_PRUEBAS}/rest/v1/rpc/*`, (r) => {
    const nombre = new URL(r.request().url()).pathname.split('/').pop();
    const cuerpo = (r.request().postDataJSON() ?? {}) as { clave_local?: string };
    const json = (b: unknown) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(b) });
    if (nombre === 'fn_listar_puntos') return json(LISTADO);
    if (nombre === 'fn_proponer') {
      return json({ propuesta_id: cuerpo.clave_local, estado: 'pendiente', aplicada: false, codigo: null });
    }
    if (nombre === 'fn_mis_propuestas') return json([]);
    return json(null);
  });
  // Del mapa al formulario, como al venir de la ficha: hay una pantalla a la que volver.
  await page.goto('/');
  await expect(page.getByTestId('estado-sincro')).toHaveAttribute('data-puntos', String(PUNTOS.length));
  await page.goto(FORMULARIO);
  await expect(page.getByRole('heading', { level: 1, name: T.operaciones.corregirDatos })).toBeVisible();
}

const pregunta = (page: Page) => page.getByRole('dialog', { name: T.avisoFormulario.salirSinEnviar });

test.describe('salir de un formulario a medias (RV-239)', () => {
  test.skip(({ isMobile }) => !isMobile, 'el "atrás" de Android: proyecto movil');

  test('sin nada rellenado, atrás sale sin preguntar', async ({ page }) => {
    await preparar(page);
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expect(pregunta(page)).toHaveCount(0);
  });

  test('con algo rellenado, el "atrás" del móvil pregunta; Seguir lo conserva y Salir sale', async ({ page }) => {
    await preparar(page);
    const d70 = page.getByRole('radio', { name: T.formulario.d70 });
    await d70.click();
    await page.goBack();
    await expect(pregunta(page)).toBeVisible();
    await expect(pregunta(page)).toContainText(T.avisoFormulario.sePierdeTodo);
    await expect(page).toHaveURL(new RegExp(`/proponer/datos`));

    await pregunta(page).getByRole('button', { name: T.avisoFormulario.seguirCorto, exact: true }).click();
    await expect(pregunta(page)).toHaveCount(0);
    await expect(d70).toBeChecked();

    // Otra vez atrás: vuelve a preguntar (la entrada propia se ha vuelto a poner).
    await page.goBack();
    await expect(pregunta(page)).toBeVisible();
    await pregunta(page).getByRole('button', { name: T.avisoFormulario.botonSalir, exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test('tras recargar el formulario, la entrada propia no se apila: una sola pregunta y fuera', async ({ page }) => {
    await preparar(page);
    await page.getByRole('radio', { name: T.formulario.d70 }).click();
    await page.reload();
    await page.getByRole('radio', { name: T.formulario.d70 }).click();
    await page.goBack();
    await expect(pregunta(page)).toBeVisible();
    await pregunta(page).getByRole('button', { name: T.avisoFormulario.botonSalir, exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(pregunta(page)).toHaveCount(0);
  });

  test('con algo rellenado, la flecha de la barra también pregunta', async ({ page }) => {
    await preparar(page);
    await page.getByRole('radio', { name: T.formulario.d70 }).click();
    await page.getByRole('button', { name: T.entrada.volver }).click();
    await expect(pregunta(page)).toBeVisible();
    await pregunta(page).getByRole('button', { name: T.avisoFormulario.botonSalir, exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe('la pantalla de resultado (RV-240)', () => {
  test('tras enviar, la URL es /proponer/hecho; atrás no vuelve al formulario y recargar no pregunta', async ({
    page,
  }) => {
    await preparar(page);
    await page.getByRole('radio', { name: T.formulario.d70 }).click();
    await page.getByRole('button', { name: T.envio.enviarRevision, exact: true }).click();
    await expect(page.getByRole('heading', { level: 2, name: T.envio.enviado })).toBeVisible();
    await expect(page).toHaveURL(/\/proponer\/hecho$/);
    await expect(pregunta(page)).toHaveCount(0);

    // Recargar desde el resultado: sin pregunta, y a Mis propuestas, que dice qué ha pasado con todo.
    await page.reload();
    await expect(page).toHaveURL(/\/mis-propuestas$/);
  });
});
