// Fase 4: entrada, primer uso, armazón, Ajustes, jefatura, degradación y límites de error.

import { expect, test, type Page } from '@playwright/test';
import { T } from '../src/lib/textos.ts';
import { FIRMA, conGoogle, conSesion, irALista, simularRpc } from './ayudas.ts';
import { SUPABASE_PRUEBAS } from '../playwright.config.ts';

const TOKEN_NUEVO = 'n'.repeat(43);
/** Demasiados intentos dice a qué hora se puede volver a probar (docs/32 RV-242). */
const CON_HORA = /^Demasiados intentos\. Podrás volver a intentarlo a las \d\d:\d\d\.$/;

async function teclearCodigo(page: Page, codigo: string) {
  await page.getByLabel(T.entrada.cifra(1)).fill(codigo[0]);
  for (let i = 1; i < codigo.length; i++) await page.keyboard.type(codigo[i]);
}

async function rellenarEntrada(page: Page, codigo = '482915') {
  await teclearCodigo(page, codigo);
  await page.getByLabel(T.entrada.nombre).fill(FIRMA.nombre);
  await page.getByLabel(T.entrada.apellido).fill(FIRMA.apellido);
  await page.getByRole('button', { name: T.entrada.entrar, exact: true }).click();
}

test.describe('entrada del voluntario (FL-01)', () => {
  test('código incorrecto: mensaje sin pistas y casillas vacías (FR-33)', async ({ page }) => {
    await page.route('**/api/verificar-codigo', (r) =>
      r.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"CODIGO_INCORRECTO"}' }),
    );
    await page.goto('/');
    await rellenarEntrada(page);
    await expect(page.getByRole('alert')).toHaveText(T.entrada.codigoIncorrecto);
    await expect(page.getByLabel(T.entrada.cifra(1))).toHaveValue('');
    // El nombre se conserva para el siguiente intento.
    await expect(page.getByLabel(T.entrada.nombre)).toHaveValue(FIRMA.nombre);
  });

  test('demasiados intentos: bloquea la entrada y dice por qué (FR-33, UI-02)', async ({ page }) => {
    await page.route('**/api/verificar-codigo', (r) =>
      r.fulfill({ status: 429, contentType: 'application/json', body: '{"error":"DEMASIADOS_INTENTOS"}' }),
    );
    await page.goto('/');
    await rellenarEntrada(page);
    await expect(page.getByRole('alert')).toHaveText(CON_HORA);
    await expect(page.getByRole('button', { name: T.entrada.entrar, exact: true })).toBeDisabled();
    await page.reload();
    await expect(page.getByLabel(T.entrada.cifra(1))).toBeDisabled();
    // Con la hora, también al volver a abrir (docs/32 RV-242).
    await expect(page.getByText(CON_HORA)).toBeVisible();
  });

  test('pide nombre, apellido y las 6 cifras antes de llamar al servidor', async ({ page }) => {
    let llamadas = 0;
    await page.route('**/api/verificar-codigo', (r) => {
      llamadas++;
      return r.abort();
    });
    await page.goto('/');
    await page.getByRole('button', { name: T.entrada.entrar, exact: true }).click();
    await expect(page.getByText(T.entrada.codigoSeisCifras)).toBeVisible();
    await expect(page.getByText(T.entrada.faltaNombre)).toBeVisible();
    expect(llamadas).toBe(0);
  });

  test('sin servidor: lo dice en español, sin códigos internos (UI-04, FR-168)', async ({ page }) => {
    await page.route('**/api/verificar-codigo', (r) => r.abort('connectionrefused'));
    await page.goto('/');
    await rellenarEntrada(page);
    await expect(page.getByRole('alert')).toHaveText(T.entrada.sinServidor);
    await expect(page.getByText(T.mapa.sinServidor, { exact: true }).first()).toBeVisible();
  });

  test('entra, ve las tres pantallas de primer uso y llega al mapa; el código no se guarda', async ({ page }) => {
    await page.route('**/api/verificar-codigo', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ token: TOKEN_NUEVO, caduca_en: '2027-09-19T00:00:00Z' }),
      }),
    );
    await simularRpc(page, { fn_listar_puntos: { puntos: [], bajas: [] } });
    await page.goto('/');
    await rellenarEntrada(page);

    for (const [i, p] of T.bienvenida.pantallas.entries()) {
      await expect(page.getByRole('heading', { name: p.titulo })).toBeVisible();
      // docs/24 RV-99: las definiciones de Malo y No funciona, una línea cada una.
      for (const l of p.lineas) await expect(page.getByText(l)).toBeVisible();
      const ultima = i === T.bienvenida.pantallas.length - 1;
      await page.getByRole('button', { name: ultima ? T.bienvenida.empezar : T.bienvenida.siguiente }).click();
    }
    await expect(page.getByTestId('mapa')).toBeVisible();
    await expect(page.getByRole('link', { name: T.navegacion.mapa })).toBeVisible();

    const almacen = await page.evaluate(() => JSON.stringify(localStorage));
    expect(almacen).toContain(TOKEN_NUEVO);
    expect(almacen).not.toContain('482915');
    expect(almacen).toMatch(/"hidrantes\.dispositivo_id":"\\"[0-9a-f-]{36}\\""/);

    // Al volver a abrir no pide nada.
    await page.reload();
    await expect(page.getByTestId('mapa')).toBeVisible();
  });

  test('aviso legal desde la entrada, con vuelta', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /Aviso legal y privacidad/ }).click();
    await expect(page.getByRole('heading', { name: T.legal.titulo })).toBeVisible();
    await page.getByRole('button', { name: T.entrada.volver }).click();
    await expect(page.getByLabel(T.entrada.cifra(1))).toBeVisible();
  });

  test('"Entrar con Google" lleva a Google a través de Supabase (FR-36)', async ({ page, baseURL }) => {
    let destino = '';
    await page.route('https://supabase.invalid/auth/v1/authorize**', (r) => {
      destino = r.request().url();
      return r.fulfill({ status: 200, contentType: 'text/html', body: '<p>google</p>' });
    });
    await page.goto('/');
    await page.getByRole('button', { name: T.entrada.jefaturaGoogle }).click();
    await expect.poll(() => destino).toContain('provider=google');
    expect(destino).toContain('code_challenge=');
    expect(decodeURIComponent(destino)).toContain(`redirect_to=${baseURL}/`);
  });
});

test.describe('con sesión guardada', () => {
  test('token revocado: vuelve a pedir el código conservando el nombre (FR-35)', async ({ page }) => {
    await conSesion(page);
    await page.route('https://supabase.invalid/rest/v1/rpc/fn_listar_puntos', (r) =>
      r.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'P0001', message: 'TOKEN_REVOCADO: El acceso de este móvil se ha revocado' }),
      }),
    );
    await page.goto('/');
    await expect(page.getByText(T.entrada.accesoCaducado)).toBeVisible();
    await expect(page.getByLabel(T.entrada.nombre)).toHaveValue(FIRMA.nombre);
    await expect(page.getByLabel(T.entrada.apellido)).toHaveValue(FIRMA.apellido);
  });

  test('servidor caído: la app sigue, lo avisa y reintenta (FR-168)', async ({ page }) => {
    await conSesion(page);
    let intentos = 0;
    await page.route('https://supabase.invalid/rest/v1/rpc/*', (r) => {
      intentos++;
      return r.abort('connectionrefused');
    });
    await page.goto('/');
    await expect(page.getByText(T.mapa.sinServidor, { exact: true }).first()).toBeVisible();
    await expect(page.getByTestId('mapa')).toBeVisible();
    await page.getByRole('link', { name: T.navegacion.ajustes }).click();
    await expect(page.getByText(`${FIRMA.nombre} ${FIRMA.apellido}`)).toBeVisible();

    const antes = intentos;
    await page.getByRole('button', { name: T.mapa.reintentar }).click();
    await expect.poll(() => intentos).toBeGreaterThan(antes);

    // Vuelve el servidor: el aviso desaparece.
    await page.unroute('https://supabase.invalid/rest/v1/rpc/*');
    // Todo lo que el reintento llama: si algo quedara sin responder, el aviso volvería enseguida.
    await simularRpc(page, {
      fn_listar_puntos: { puntos: [], bajas: [] },
      fn_mis_propuestas: [],
      fn_registrar_error: null,
    });
    await page.getByRole('button', { name: T.mapa.reintentar }).click();
    await expect(page.getByText(T.mapa.sinServidor, { exact: true }).first()).toBeHidden();
  });

  test('sin cobertura: lo dice en gris y la app sigue', async ({ page, context }) => {
    await conSesion(page);
    await simularRpc(page, { fn_listar_puntos: { puntos: [], bajas: [] } });
    await page.goto('/');
    await context.setOffline(true);
    // En el mapa y la lista, la píldora de la cabecera (docs/33 RV-311); en las demás pantallas, la banda.
    const pildora = page.getByTestId('estado-sincro');
    await expect(pildora).toContainText(T.mapa.sinConexion);
    // En el ordenador no hay pestaña «Lista»: la lista va al lado del mapa (docs/33 RV-321).
    if (await page.getByRole('link', { name: T.navegacion.lista }).count()) {
      await page.getByRole('link', { name: T.navegacion.lista }).click();
    }
    await expect(page.getByRole('radio', { name: T.mapa.todos })).toBeVisible();
    await expect(pildora).toContainText(T.mapa.sinConexion);
    await page.getByRole('link', { name: T.navegacion.ajustes }).click();
    await expect(page.locator('div[role=status]').getByText(T.mapa.sinCoberturaSolo, { exact: true })).toBeVisible();
    await context.setOffline(false);
    await expect(page.locator('div[role=status]').getByText(T.mapa.sinCoberturaSolo, { exact: true })).toBeHidden();
  });

  test('primer uso saltable y recuperable desde Ajustes (FR-94)', async ({ page }) => {
    await conSesion(page, { primerUsoVisto: false });
    await simularRpc(page, { fn_listar_puntos: { puntos: [], bajas: [] } });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: T.bienvenida.pantallas[0].titulo })).toBeVisible();
    await page.getByRole('button', { name: T.bienvenida.saltar }).click();
    await expect(page.getByTestId('mapa')).toBeVisible();

    await page.getByRole('link', { name: T.navegacion.ajustes }).click();
    await page
      .getByText(T.ajustes.comoSeUsa)
      .locator('xpath=ancestor::div[contains(@class,"rounded-tarjeta")]')
      .getByRole('button', { name: T.ajustes.ver })
      .click();
    await expect(page.getByRole('heading', { name: T.bienvenida.pantallas[0].titulo })).toBeVisible();
  });

  test('Ajustes: cambiar firma, modo oscuro y cerrar sesión con confirmación (FL-12)', async ({ page }) => {
    await conSesion(page);
    await simularRpc(page, { fn_listar_puntos: { puntos: [], bajas: [] } });
    await page.goto('/ajustes');

    await page
      .getByRole('group', { name: `${FIRMA.nombre} ${FIRMA.apellido}` })
      .getByRole('button', { name: T.ajustes.cambiar })
      .click();
    await page.getByLabel(T.entrada.apellido).fill('');
    await expect(page.getByRole('button', { name: T.ajustes.guardar })).toBeDisabled();
    await expect(page.getByText(T.entrada.faltaNombre)).toBeVisible();
    await page.getByLabel(T.entrada.apellido).fill('Nueva');
    await page.getByRole('button', { name: T.ajustes.guardar }).click();
    await expect(page.getByText(`${FIRMA.nombre} Nueva`)).toBeVisible();

    await page.getByRole('radio', { name: T.ajustes.siempre }).click();
    await expect(page.locator('html')).toHaveAttribute('data-tema', 'oscuro');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-tema', 'oscuro');
    await page.getByRole('radio', { name: T.ajustes.segunMovil }).click();
    await expect(page.locator('html')).not.toHaveAttribute('data-tema', /.*/);

    await page.getByRole('button', { name: T.ajustes.cerrarSesion }).click();
    const hoja = page.getByRole('dialog', { name: T.ajustes.confirmarCerrar });
    await expect(hoja).toContainText(T.ajustes.cerrarSesionDetalle);
    await hoja.getByRole('button', { name: T.ajustes.cancelar }).click();
    await expect(hoja).toBeHidden();

    await page.getByRole('button', { name: T.ajustes.cerrarSesion }).click();
    await page.getByRole('button', { name: T.ajustes.cerrarSesionBoton, exact: true }).click();
    await expect(page.getByLabel(T.entrada.cifra(1))).toBeVisible();
    await expect(page.getByLabel(T.entrada.nombre)).toHaveValue('');
    const claves = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('hidrantes.')));
    // No queda nada personal ni del móvil: ni acceso, ni nombre, ni identificador, ni puntos.
    // (La preferencia de pantalla y el mapa base se conservan: no son datos personales.)
    for (const clave of ['token', 'firma', 'dispositivo_id', 'primer_uso_visto']) {
      expect(claves).not.toContain(`hidrantes.${clave}`);
    }
    expect(claves).toContain('hidrantes.tema');
  });

  test('un fallo en una pantalla muestra el límite de error y se anota (TR-106)', async ({ page }) => {
    await conSesion(page, { extra: { forzar_fallo: '/lista' } });
    const enviados: unknown[] = [];
    await page.route('https://supabase.invalid/rest/v1/rpc/*', async (r) => {
      const nombre = new URL(r.request().url()).pathname.split('/').pop();
      if (nombre === 'fn_registrar_error') enviados.push(r.request().postDataJSON());
      await r.fulfill({ status: 200, contentType: 'application/json', body: '{"puntos":[],"bajas":[]}' });
    });
    // docs/31 RV-148, docs/33 RV-306: el error sale solo por la Function /api/error.
    await page.route('**/api/error', async (r) => {
      enviados.push(r.request().postDataJSON());
      await r.fulfill({ status: 204 });
    });
    await page.goto('/');
    await irALista(page);
    await expect(page.getByRole('alert')).toContainText(T.fallo.titulo);
    // La navegación sigue viva y "Volver al mapa" funciona.
    await page.getByRole('button', { name: T.envio.volverAlMapa }).click();
    await expect(page.getByTestId('mapa')).toBeVisible();

    // El de la pantalla, buscado por su ruta: antes puede ir otro (la descarga del mapa base cortada).
    const delFallo = () =>
      enviados.find((e) => (e as { ruta?: string }).ruta === '/lista') as Record<string, unknown> | undefined;
    await expect.poll(delFallo).toBeTruthy();
    expect(delFallo()).toMatchObject({
      mensaje: 'Fallo provocado en /lista',
      ruta: '/lista',
      dispositivo_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
    expect(JSON.stringify(delFallo())).not.toContain(FIRMA.apellido);
  });
});

test.describe('jefatura (FL-20)', () => {
  test('correo no autorizado ve "No autorizado" y vuelve a la entrada (FR-37)', async ({ page }) => {
    await conGoogle(page, 'ajeno@example.org');
    await simularRpc(page, { fn_es_admin: false });
    // La cuenta no está en la lista: la Function lo dice así (docs/35 RV-432).
    await page.route('**/api/vincular-jefatura', (route) =>
      route.fulfill({ status: 403, contentType: 'application/json', body: '{"error":"NO_ES_ADMINISTRADOR"}' }),
    );
    await page.goto('/');
    await expect(page.getByRole('heading', { name: T.entrada.noAutorizado })).toBeVisible();
    await expect(page.getByText(T.entrada.noAutorizadoDetalle)).toBeVisible();
    await page.getByRole('button', { name: T.entrada.volver }).click();
    await expect(page.getByLabel(T.entrada.cifra(1))).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('hidrantes.auth'))).toBeNull();
  });

  // docs/35 RV-432: la cuenta de jefatura se une a su cuenta de Google al entrar, una vez por sesión.
  /** Cada petición a la Function recibe la siguiente respuesta de la lista (la última se repite). */
  type Respuesta = { status: number; cuerpo: Record<string, string> };
  async function conVincular(page: Page, ...respuestas: Respuesta[]) {
    let unida = false;
    const pedidas: (string | null)[] = [];
    await page.route('**/api/vincular-jefatura', (route) => {
      pedidas.push(route.request().headers()['authorization'] ?? null);
      const respuesta = respuestas[Math.min(pedidas.length, respuestas.length) - 1]!;
      if (respuesta.status === 200) unida = true;
      return route.fulfill({
        status: respuesta.status,
        contentType: 'application/json',
        body: JSON.stringify(respuesta.cuerpo),
      });
    });
    await page.route(`${SUPABASE_PRUEBAS}/rest/v1/rpc/*`, (route) => {
      const nombre = new URL(route.request().url()).pathname.split('/').pop()!;
      if (nombre === 'fn_es_admin')
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(unida) });
      if (nombre === 'fn_registrar_error') return route.fulfill({ contentType: 'application/json', body: 'null' });
      return route.abort('connectionrefused');
    });
    // Los fallos anotados (docs/36 RV-450 anota CUENTA_MEZCLADA): el servidor los recibe.
    await page.route('**/api/error', (route) => route.fulfill({ contentType: 'application/json', body: '{}' }));
    return pedidas;
  }

  test('sin unir todavía: el panel la une al entrar y entra (docs/35 RV-432)', async ({ page }) => {
    await conGoogle(page, 'jefe@example.org');
    const pedidas = await conVincular(page, { status: 200, cuerpo: { resultado: 'VINCULADO' } });
    await page.goto('/admin');
    await expect(page.getByRole('heading', { level: 1, name: new RegExp(T.jefatura.panel) })).toBeAttached();
    expect(pedidas).toHaveLength(1);
    expect(pedidas[0]).toMatch(/^Bearer \S+$/);
  });

  // docs/36 RV-450: tras unir, el panel renueva la sesión antes de volver a preguntar.
  /** Las renovaciones de la sesión que pide supabase-js. Con `status`, el servidor de Auth contesta así. */
  async function renovaciones(page: Page, status = 200) {
    const pedidas: string[] = [];
    await page.route(`${SUPABASE_PRUEBAS}/auth/v1/token?grant_type=refresh_token`, async (route) => {
      pedidas.push(route.request().url());
      if (status === 200) return route.fallback();
      return route.fulfill({
        status,
        contentType: 'application/json',
        body: '{"error":"invalid_grant","error_description":"Invalid Refresh Token"}',
      });
    });
    return pedidas;
  }

  test('al unir, renueva la sesión y solo entonces es jefatura (docs/36 RV-450)', async ({ page }) => {
    await conGoogle(page, 'jefe@example.org');
    // El servidor solo da jefatura con un token renovado después de unir (DEC-206).
    let unida = false;
    await page.route('**/api/vincular-jefatura', (route) => {
      unida = true;
      return route.fulfill({ contentType: 'application/json', body: '{"resultado":"VINCULADO"}' });
    });
    const renovadas: string[] = [];
    let renovadaTrasUnir = false;
    await page.route(`${SUPABASE_PRUEBAS}/auth/v1/token?grant_type=refresh_token`, (route) => {
      renovadas.push(route.request().url());
      if (unida) renovadaTrasUnir = true;
      return route.fallback();
    });
    await page.route(`${SUPABASE_PRUEBAS}/rest/v1/rpc/*`, (route) => {
      const nombre = new URL(route.request().url()).pathname.split('/').pop()!;
      if (nombre === 'fn_es_admin')
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(renovadaTrasUnir) });
      if (nombre === 'fn_registrar_error') return route.fulfill({ contentType: 'application/json', body: 'null' });
      return route.abort('connectionrefused');
    });
    await page.goto('/admin');
    await expect(page.getByRole('heading', { level: 1, name: new RegExp(T.jefatura.panel) })).toBeAttached();
    expect(renovadas.length).toBeGreaterThanOrEqual(1);
  });

  test('al unir, si la sesión no se renueva: lo dice y deja reintentar (docs/36 RV-450)', async ({ page }) => {
    await conGoogle(page, 'jefe@example.org');
    const pedidas = await conVincular(page, { status: 200, cuerpo: { resultado: 'VINCULADO' } });
    const renovadas = await renovaciones(page, 400);
    // Sin renovar, el servidor no da jefatura con el token de antes (DEC-206).
    await page.route(`${SUPABASE_PRUEBAS}/rest/v1/rpc/*`, (route) => {
      const nombre = new URL(route.request().url()).pathname.split('/').pop()!;
      return route.fulfill({ contentType: 'application/json', body: nombre === 'fn_es_admin' ? 'false' : 'null' });
    });
    const reintentar = page.getByRole('button', { name: T.entrada.reintentar });
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: T.entrada.cuentaSinComprobar })).toBeVisible();
    await expect(reintentar).toBeVisible();
    expect(renovadas).toHaveLength(1);
    expect(pedidas).toHaveLength(1);
    // La sesión sigue guardada, y Reintentar vuelve a pedir la unión.
    expect(await page.evaluate(() => localStorage.getItem('hidrantes.auth'))).not.toBeNull();
    await reintentar.click();
    await expect.poll(() => pedidas.length).toBe(2);
    await expect(page.getByRole('heading', { name: T.entrada.cuentaSinComprobar })).toBeVisible();
  });

  test('una cuenta con otra identidad unida: «No autorizado» con su texto (docs/36 RV-450)', async ({ page }) => {
    await conGoogle(page, 'jefe@example.org');
    const pedidas = await conVincular(page, { status: 403, cuerpo: { error: 'CUENTA_MEZCLADA' } });
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: T.entrada.noAutorizado })).toBeVisible();
    await expect(page.getByText(T.entrada.cuentaMezcladaDetalle)).toBeVisible();
    await expect(page.getByRole('button', { name: T.entrada.reintentar })).toHaveCount(0);
    expect(pedidas).toHaveLength(1);
    // La sesión de Google ya está cerrada, antes de pulsar Volver.
    await expect.poll(() => page.evaluate(() => localStorage.getItem('hidrantes.auth'))).toBeNull();
    await page.getByRole('button', { name: T.entrada.volver }).click();
    await expect(page.getByLabel(T.entrada.cifra(1))).toBeVisible();
  });

  test('el correo de jefatura unido a otra cuenta de Google: su texto (docs/37 RV-493)', async ({ page }) => {
    await conGoogle(page, 'jefe@example.org');
    const pedidas = await conVincular(page, { status: 403, cuerpo: { error: 'OTRA_CUENTA' } });
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: T.entrada.noAutorizado })).toBeVisible();
    await expect(page.getByText(T.entrada.otraCuentaDetalle)).toBeVisible();
    await expect(page.getByText(T.entrada.noAutorizadoDetalle)).toHaveCount(0);
    expect(pedidas).toHaveLength(1);
  });

  test('con otra cuenta: «No autorizado», sin volver a pedirlo (docs/35 RV-432)', async ({ page }) => {
    await conGoogle(page, 'jefe@example.org');
    const pedidas = await conVincular(page, { status: 403, cuerpo: { error: 'OTRA_CUENTA' } });
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: T.entrada.noAutorizado })).toBeVisible();
    // Sin bucle: ni otra petición ni otra pantalla.
    await page.waitForTimeout(1000);
    expect(pedidas).toHaveLength(1);
    await expect(page.getByRole('heading', { name: T.entrada.noAutorizado })).toBeVisible();
  });

  test('sin poder comprobarla: lo dice, y Reintentar la une y entra (docs/35 RV-432)', async ({ page }) => {
    await conGoogle(page, 'jefe@example.org');
    const pedidas = await conVincular(
      page,
      { status: 503, cuerpo: { error: 'SERVIDOR_NO_DISPONIBLE' } },
      { status: 200, cuerpo: { resultado: 'VINCULADO' } },
    );
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: T.entrada.cuentaSinComprobar })).toBeVisible();
    // Sin bucle: no se vuelve a pedir sola.
    await page.waitForTimeout(1000);
    expect(pedidas).toHaveLength(1);
    // El de la pantalla (el aviso de conexión tiene el suyo).
    await page.locator('[data-variante="primario"]', { hasText: T.entrada.reintentar }).click();
    await expect(page.getByRole('heading', { level: 1, name: new RegExp(T.jefatura.panel) })).toBeAttached();
    expect(pedidas).toHaveLength(2);
  });

  test('administrador: etiqueta Jefatura, ruta /admin y salida', async ({ page }) => {
    await conGoogle(page, 'jefe@example.org');
    await simularRpc(page, { fn_es_admin: true });
    await page.goto('/admin');
    const titulo = page.getByRole('heading', { level: 1, name: new RegExp(T.jefatura.panel) });
    await expect(titulo).toBeAttached();
    // Por debajo de 800 px, "Ir al mapa" está en el menú ☰ de la cabecera (docs/33 RV-331); por debajo de 768,
    // el título dice la pestaña y «Panel de jefatura» solo para el lector (docs/38 RV-503); desde 800 px, se ve.
    const menu = page.getByRole('button', { name: T.panel.menu });
    if (await menu.isVisible()) await menu.click();
    else await expect(titulo).toBeVisible();
    await page.getByRole('link', { name: T.jefatura.irAlMapa }).click();
    await expect(page.getByTestId('mapa')).toBeVisible();
    await expect(page.getByText(T.navegacion.jefatura, { exact: true })).toBeVisible();

    await page.getByRole('link', { name: T.navegacion.ajustes }).click();
    await expect(page.getByText(T.ajustes.sesionGoogle('jefe@example.org'))).toBeVisible();
    await expect(page.getByRole('button', { name: T.ajustes.cerrarSesion })).toHaveCount(0);
    await page.getByRole('button', { name: T.ajustes.cerrarSesionGoogle }).click();
    await expect(page.getByLabel(T.entrada.cifra(1))).toBeVisible();
  });
});
