// Ayudas de los e2e: sesión guardada y un Supabase simulado con page.route.

import type { Page, Route } from '@playwright/test';
import { SUPABASE_PRUEBAS } from '../playwright.config.ts';
import { T } from '../src/lib/textos.ts';

export const TOKEN = 'a'.repeat(43);
export const FIRMA = { nombre: 'Voluntaria', apellido: 'Pruebas' };

/** Deja el móvil como si ya hubiera entrado (y visto o no las pantallas de primer uso). */
export async function conSesion(page: Page, { primerUsoVisto = true, extra = {} as Record<string, unknown> } = {}) {
  await page.addInitScript(
    ([token, firma, visto, otros]) => {
      if (sessionStorage.getItem('sembrado')) return;
      sessionStorage.setItem('sembrado', '1');
      localStorage.setItem('hidrantes.token', JSON.stringify(token));
      localStorage.setItem('hidrantes.firma', JSON.stringify(firma));
      if (visto) localStorage.setItem('hidrantes.primer_uso_visto', 'true');
      for (const [k, v] of Object.entries(otros)) localStorage.setItem(`hidrantes.${k}`, JSON.stringify(v));
    },
    [TOKEN, FIRMA, primerUsoVisto, extra] as const,
  );
}

const json = (route: Route, cuerpo: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(cuerpo) });

/** RPC simuladas: nombre → respuesta. Lo no listado responde como un servidor caído. */
export async function simularRpc(page: Page, respuestas: Record<string, unknown>) {
  await page.route(`${SUPABASE_PRUEBAS}/rest/v1/rpc/*`, (route) => {
    const nombre = new URL(route.request().url()).pathname.split('/').pop()!;
    if (nombre in respuestas) return json(route, respuestas[nombre]);
    return route.abort('connectionrefused');
  });
}

/** Sesión de Google guardada (jefatura), sin pasar por Google: supabase-js la lee del almacén. */
export async function conGoogle(page: Page, correo: string) {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const expira = Math.floor(Date.now() / 1000) + 3600;
  // Como el de una sesión de Google de Supabase: fn_es_admin exige amr oauth y providers google (RV-36).
  const appMetadata = { provider: 'google', providers: ['google'] };
  const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({
    sub: 'u1',
    email: correo,
    role: 'authenticated',
    exp: expira,
    amr: [{ method: 'oauth', timestamp: expira - 3600 }],
    app_metadata: appMetadata,
  })}.firma`;
  const sesion = {
    access_token: jwt,
    refresh_token: 'refresco',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: expira,
    user: {
      id: 'u1',
      aud: 'authenticated',
      role: 'authenticated',
      email: correo,
      app_metadata: appMetadata,
      user_metadata: {},
    },
  };
  await page.addInitScript((s) => {
    if (!sessionStorage.getItem('google')) {
      sessionStorage.setItem('google', '1');
      localStorage.setItem('hidrantes.auth', s);
    }
  }, JSON.stringify(sesion));
  // Respuestas con cuerpo válido: con un 204 vacío, supabase-js da la respuesta por error y reintenta
  // con espera creciente, reteniendo varios segundos el token que necesitan las lecturas del panel.
  await page.route(`${SUPABASE_PRUEBAS}/auth/v1/**`, (route) => {
    const cuerpo = route.request().url().includes('/user') ? sesion.user : sesion;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(cuerpo) });
  });
}

/**
 * Tablas y vistas simuladas para el panel (05 §5): nombre → filas, o función de la URL. Los HEAD con
 * count=exact reciben el total en Content-Range, como PostgREST. Lo no listado, servidor caído.
 */
export async function simularTablas(page: Page, tablas: Record<string, unknown[] | ((url: URL) => unknown[])>) {
  await page.route(new RegExp(`^${SUPABASE_PRUEBAS.replaceAll('.', '\\.')}/rest/v1/(?!rpc/)`), (route) => {
    const url = new URL(route.request().url());
    const nombre = url.pathname.split('/').pop()!;
    const t = tablas[nombre];
    if (!t) return route.abort('connectionrefused');
    const filas = typeof t === 'function' ? t(url) : t;
    // Sin exponer Content-Range, el navegador se lo oculta al cliente y no habría cuenta (FR-110).
    const cabeceras = {
      'Content-Range': `0-${Math.max(filas.length - 1, 0)}/${filas.length}`,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Expose-Headers': 'Content-Range',
    };
    if (route.request().method() === 'HEAD') return route.fulfill({ status: 200, headers: cabeceras, body: '' });
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: cabeceras,
      body: JSON.stringify(filas),
    });
  });
}

/** La pestaña Lista; en el ordenador (desde 1100 px) no hay pestaña: la lista va al lado del mapa y se
 *  abre /lista directamente (docs/33 RV-321). */
export async function irALista(page: Page) {
  const enlace = page.getByRole('link', { name: 'Lista', exact: true });
  if (await enlace.count()) await enlace.click();
  // Sin recargar, como un enlace: lo que la app tiene en memoria sigue (React Router atiende popstate).
  else
    await page.evaluate(() => {
      history.pushState({}, '', '/lista');
      dispatchEvent(new PopStateEvent('popstate'));
    });
}

// docs/38 RV-502: para que los e2e lleguen igual al panel a todos los anchos. Por debajo de 768 px las pestañas van
// en el menú ☰ y la búsqueda detrás de la lupa (RV-503); desde 768, a la vista. Las ayudas miran lo que hay en
// pantalla, así valen antes y después de cada cambio.

/** Las pestañas del panel: la fila de arriba o, en el móvil, la de dentro del menú. */
const navegacionPanel = (page: Page) => page.getByRole('navigation', { name: T.jefatura.panel });

/** Va a la pestaña `nombre` del panel: la pulsa a la vista o, si está en el menú ☰, lo abre y la elige. */
export async function irAPestana(page: Page, nombre: string) {
  const enlace = navegacionPanel(page).getByRole('link', { name: new RegExp(`^${escaparRegex(nombre)}`) });
  if (!(await enlace.first().isVisible())) {
    await page.getByRole('button', { name: new RegExp(`^${escaparRegex(T.panel.menu)}`) }).click();
  }
  await enlace.first().click();
}

/** Escribe en la búsqueda del panel: el campo a la vista o, en el móvil, tras la lupa. */
export async function buscarEnPanel(page: Page, texto: string) {
  const campo = page.getByPlaceholder(T.panelCola.buscar);
  if (!(await campo.isVisible())) await page.getByRole('button', { name: T.panel.buscar, exact: true }).click();
  await campo.fill(texto);
}

/** Abre el botón de filtros de la pestaña (UI-19). */
export async function abrirFiltros(page: Page) {
  await page.getByRole('button', { name: /^Filtros: / }).click();
}

/** Dentro de la hoja o la ventana de filtros, elige `opcion` en el grupo `grupo`. */
export async function elegirFiltro(page: Page, grupo: string, opcion: string | RegExp) {
  await page
    .getByRole('radiogroup', { name: grupo })
    .getByRole('radio', { name: typeof opcion === 'string' ? new RegExp(`^${escaparRegex(opcion)}`) : opcion })
    .click();
}

function escaparRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Abre los filtros, elige `opcion` en `grupo` y cierra con «Listo» (docs/38 RV-505). */
export async function filtrarPor(page: Page, grupo: string, opcion: string | RegExp) {
  await abrirFiltros(page);
  await elegirFiltro(page, grupo, opcion);
  await page.getByRole('button', { name: T.panel.listo, exact: true }).click();
}

/**
 * Las filas del Inventario (docs/38 RV-506): las de la tabla desde 1.100 px o los elementos de la lista por debajo.
 * Sin la fila de cabeceras.
 */
export const filasInventario = (page: Page) =>
  page.getByRole('main').locator('tbody > tr, ul[aria-label="Inventario"] > li');
export const filaInventario = (page: Page, codigo: string) => filasInventario(page).filter({ hasText: codigo });

/** Editar, Historial, Retirar o Borrar de un punto del Inventario: «Editar» y «⋯» en la tabla; la fila y «⋯» en la lista. */
export async function accionInventario(page: Page, codigo: string, que: 'editar' | 'historial' | 'retirar' | 'borrar') {
  const fila = filaInventario(page, codigo);
  // Antes de mirar si es tabla o lista, que la fila haya llegado.
  await fila.first().waitFor();
  if (que === 'editar') {
    const enTabla = fila.getByRole('button', { name: T.panel.editar, exact: true });
    if (await enTabla.count()) return enTabla.click();
    return fila.getByRole('button', { name: T.panelInventario.editarPunto(codigo), exact: true }).click();
  }
  await fila.getByRole('button', { name: T.panel.masAcciones(codigo) }).click();
  const nombre = que === 'historial' ? T.panel.historial : que === 'retirar' ? T.panel.retirar : T.panel.borrar;
  await page.getByRole('menuitem', { name: nombre, exact: true }).click();
}
