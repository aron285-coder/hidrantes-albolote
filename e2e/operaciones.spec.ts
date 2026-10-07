// Fase 6: las seis operaciones, la foto sin EXIF, la cola sin cobertura y Mis propuestas
// (FL-03–FL-10), con el servidor simulado. "Algo no funciona" salió en docs/29 RV-125.

import { expect, test, type Page } from '@playwright/test';
import { conExif } from '../src/lib/exif-prueba.ts';
import { T } from '../src/lib/textos.ts';
import { TOKEN, conGoogle, conSesion, simularRpc, simularTablas } from './ayudas.ts';
import { LISTADO, PUNTOS } from './puntos.ts';

const SB = 'https://supabase.invalid';

interface Servidor {
  propuestas: Record<string, unknown>[];
  subidas: Buffer[];
}

/** Servidor simulado: guarda lo que llega y responde como las RPC de 05 §6 (idempotente por clave_local). */
async function servidor(page: Page, { caido = false } = {}): Promise<Servidor> {
  const s: Servidor = { propuestas: [], subidas: [] };
  await page.route('**/api/url-subida', (r) =>
    caido
      ? r.abort('connectionrefused')
      : r.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({ foto_path: `fotos/${s.subidas.length + 1}.jpg`, url: `${SB}/storage/subir` }),
        }),
  );
  await page.route(`${SB}/storage/subir`, async (r) => {
    s.subidas.push(r.request().postDataBuffer()!);
    await r.fulfill({ status: 200, body: '{}' });
  });
  await page.route('**/api/push', (r) => r.fulfill({ contentType: 'application/json', body: '{"enviadas":0}' }));
  await page.route(`${SB}/rest/v1/rpc/*`, async (r) => {
    const nombre = new URL(r.request().url()).pathname.split('/').pop();
    const cuerpo = r.request().postDataJSON() ?? {};
    const json = (b: unknown) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(b) });
    if (caido) return r.abort('connectionrefused');
    if (nombre === 'fn_listar_puntos') return json(LISTADO);
    if (nombre === 'fn_proponer') {
      if (!s.propuestas.some((p) => p.clave_local === cuerpo.clave_local)) s.propuestas.push(cuerpo);
      return json({ propuesta_id: cuerpo.clave_local, estado: 'pendiente', aplicada: false, codigo: null });
    }
    if (nombre === 'fn_mis_propuestas') {
      return json(
        s.propuestas.map((p) => ({
          id: p.clave_local,
          clave_local: p.clave_local,
          operacion: p.operacion,
          punto_id: p.punto_id,
          codigo: null,
          datos: p.datos,
          estado: 'pendiente',
          motivo_rechazo: null,
          correcciones: null,
          creada_en: new Date().toISOString(),
          revisada_en: null,
        })),
      );
    }
    return json(null);
  });
  return s;
}

/** JPEG de 2400×1800 hecho en el navegador, con posición EXIF añadida. */
async function fotoConExif(page: Page): Promise<Buffer> {
  const bytes = await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 2400;
    c.height = 1800;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#b4321f';
    ctx.fillRect(0, 0, 2400, 1800);
    const b = await new Promise<Blob>((r) => c.toBlob((x) => r(x!), 'image/jpeg', 0.9));
    return Array.from(new Uint8Array(await b.arrayBuffer()));
  });
  return Buffer.from(conExif(Uint8Array.from(bytes), 37.2311, -3.6572));
}

async function hacerFoto(page: Page) {
  await page.getByTestId('entrada-foto').setInputFiles({
    name: 'foto.jpg',
    mimeType: 'image/jpeg',
    buffer: await fotoConExif(page),
  });
  await expect(page.getByTestId('hueco-entrada-foto').getByText(/\d+ kB/)).toBeVisible();
  // Alta y corregir ubicación piden además la del sitio (docs/24 RV-103).
  if (await page.getByTestId('entrada-foto-sitio').count()) await hacerFotoSitio(page);
}

async function hacerFotoSitio(page: Page) {
  await page.getByTestId('entrada-foto-sitio').setInputFiles({
    name: 'sitio.jpg',
    mimeType: 'image/jpeg',
    buffer: await fotoConExif(page),
  });
  await expect(page.getByTestId('hueco-entrada-foto-sitio').getByText(/\d+ kB/)).toBeVisible();
}

const enviar = (page: Page, texto: string = T.envio.enviarRevision) =>
  page.getByRole('button', { name: texto, exact: true });

test.describe('operaciones (FL-03–FL-08)', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 37.2309, longitude: -3.6566, accuracy: 9 });
    await conSesion(page);
  });

  test('alta: el botón dice qué falta; la foto sube sin EXIF y la posición EXIF va aparte', async ({ page }) => {
    const s = await servidor(page);
    await page.goto('/');
    await page.getByRole('button', { name: T.navegacion.nuevoPunto }).click();
    await expect(enviar(page)).toBeDisabled();
    await expect(page.getByText(T.avisosFormulario.eligeTipo)).toBeVisible();

    await page.getByRole('radio', { name: T.formulario.hidrante }).click();
    await expect(page.getByText(T.avisosFormulario.eligeDiametro)).toBeVisible();
    await page.getByRole('radio', { name: T.formulario.d100 }).click();
    // docs/24 RV-99: sin las definiciones debajo de los campos (van al primer uso y a la sesión).
    await expect(page.getByText('La salida, no la tubería')).toHaveCount(0);
    await expect(page.getByText('Malo =')).toHaveCount(0);
    await expect(page.getByText('círculo azul')).toHaveCount(0);
    await page.getByRole('radio', { name: T.formulario.noFunciona }).click();
    await expect(page.getByText(T.avisosFormulario.describeFallo)).toBeVisible();
    await page.getByLabel(T.formulario.descripcionFallo).fill('Tapa soldada');
    await expect(page.getByText(T.avisosFormulario.faltaFoto)).toBeVisible();
    await hacerFoto(page);
    await enviar(page).click();

    await expect(page.getByRole('heading', { level: 2, name: T.envio.enviado })).toBeVisible();
    expect(s.propuestas).toHaveLength(1);
    const p = s.propuestas[0];
    expect(p).toMatchObject({
      token: TOKEN,
      operacion: 'alta',
      punto_id: null,
      datos: { tipo: 'hidrante', diametro_mm: 100, caudal: 'no_funciona', descripcion_fallo: 'Tapa soldada' },
      origen: 'gps',
      foto_path: 'fotos/1.jpg',
      autor_nombre: 'Voluntaria',
    });
    expect(p.exif_lat as number).toBeCloseTo(37.2311, 3);
    expect(p.gps_lat as number).toBeCloseTo(37.2309, 4);
    // TR-47: la foto subida no lleva bloque EXIF; TR-15: lado mayor 1600 y tamaño moderado.
    const subida = s.subidas[0];
    expect(subida.includes(Buffer.from('Exif'))).toBe(false);
    expect(subida.length).toBeLessThan(500 * 1024);
    const dimensiones = await page.evaluate(async (b64) => {
      const img = await createImageBitmap(await (await fetch(`data:image/jpeg;base64,${b64}`)).blob());
      return [img.width, img.height];
    }, subida.toString('base64'));
    expect(dimensiones).toEqual([1600, 1200]);
    // docs/24 RV-103: la foto del sitio va aparte, con su reserva, y a 1280 px.
    expect(p.foto_sitio_path).toBe('fotos/2.jpg');
    const sitio = await page.evaluate(async (b64) => {
      const img = await createImageBitmap(await (await fetch(`data:image/jpeg;base64,${b64}`)).blob());
      return [img.width, img.height];
    }, s.subidas[1].toString('base64'));
    expect(sitio).toEqual([1280, 960]);
  });

  test('alta: sin la foto del sitio el botón dice qué falta (docs/24 RV-103)', async ({ page }) => {
    await servidor(page);
    await page.goto('/');
    await page.getByRole('button', { name: T.navegacion.nuevoPunto }).click();
    await page.getByRole('radio', { name: T.formulario.hidrante }).click();
    await page.getByRole('radio', { name: T.formulario.d70 }).click();
    await page.getByRole('radio', { name: T.formulario.bueno }).click();
    await expect(page.getByTestId('hueco-entrada-foto')).toContainText(T.formulario.conexion);
    await expect(page.getByTestId('hueco-entrada-foto-sitio')).toContainText(T.formulario.sitio);
    await page.getByTestId('entrada-foto').setInputFiles({
      name: 'foto.jpg',
      mimeType: 'image/jpeg',
      buffer: await fotoConExif(page),
    });
    await expect(page.getByText(T.avisosFormulario.faltaFotoSitio)).toBeVisible();
    await expect(enviar(page)).toBeDisabled();
    await hacerFotoSitio(page);
    await expect(enviar(page)).toBeEnabled();
  });

  // Las cinco operaciones sobre un punto, desde la ficha. Una prueba por operación: las cinco seguidas,
  // con sus fotos, pasaban de los 30 s con cuatro workers (docs/18 RV-49).
  const OPERACIONES: {
    nombre: string;
    hacer: (page: Page) => Promise<void>;
    envio?: string;
    esperado: Record<string, unknown>;
  }[] = [
    {
      nombre: T.operaciones.sigueIgual,
      hacer: async (page) => {
        await expect(page.getByText(T.operaciones.revisionAviso)).toBeVisible();
        await hacerFoto(page);
      },
      // docs/24 RV-103: sin hueco del sitio; la firma nueva lleva la clave a null.
      esperado: { operacion: 'revision', foto_sitio_path: null },
    },
    {
      nombre: T.operaciones.actualizarEstado,
      hacer: async (page) => {
        await page.getByRole('radio', { name: T.formulario.regular }).click();
        await hacerFoto(page);
      },
      esperado: { operacion: 'estado' },
    },
    {
      nombre: T.operaciones.corregirDatos,
      hacer: async (page) => {
        await expect(page.getByText(T.avisosFormulario.sinCambios)).toBeVisible();
        await page.getByRole('radio', { name: T.formulario.d70 }).click();
      },
      esperado: { operacion: 'datos', datos: { diametro_mm: 70 }, foto_path: null },
    },
    {
      nombre: T.operaciones.corregirUbicacion,
      hacer: async (page) => {
        await expect(page.getByText(T.avisosFormulario.muevePin)).toBeVisible();
        const mapa = page.getByTestId('selector-pin');
        // El mapa del selector puede no escuchar aún el toque cuando ya se ve: se toca hasta que el pin
        // se mueve, en vez de dar por hecho que el primer toque llegó.
        await expect(async () => {
          const caja = (await mapa.boundingBox())!;
          await mapa.click({ position: { x: caja.width / 2 + 60, y: caja.height / 2 } });
          await expect(page.getByText(T.formulario.desplazamiento)).toBeVisible({ timeout: 1000 });
        }).toPass();
        await hacerFoto(page);
      },
      // docs/24 RV-103: corregir ubicación pide también la foto del sitio.
      esperado: {
        operacion: 'ubicacion',
        origen: 'manual',
        datos: {},
        foto_path: 'fotos/1.jpg',
        foto_sitio_path: 'fotos/2.jpg',
      },
    },
    {
      nombre: T.operaciones.proponerRetirada,
      hacer: async (page) => {
        await page.getByRole('radio', { name: T.formulario.obras }).click();
        await expect(page.getByText(T.avisosFormulario.explicaMotivo)).toBeVisible();
        await page.getByLabel(T.formulario.motivoRetirada).fill('Zanja abierta, el hidrante no está');
        await hacerFoto(page);
      },
      envio: T.envio.enviarRetirada,
      esperado: { operacion: 'retirada', datos: { motivo_rapido: 'obras' } },
    },
  ];

  for (const op of OPERACIONES) {
    test(`desde la ficha: ${op.nombre}`, async ({ page }) => {
      const s = await servidor(page);
      const hid = PUNTOS[0];
      await page.goto(`/?p=${hid.id}`);
      await page.getByRole('button', { name: T.ficha.proponerCambio }).click();
      await expect(page.getByRole('dialog', { name: T.operaciones.queHaCambiado(hid.codigo) })).toBeVisible();
      await page.getByRole('button', { name: new RegExp(`^${op.nombre}`) }).click();
      await op.hacer(page);
      await enviar(page, op.envio).click();
      await expect(page.getByRole('heading', { level: 2, name: T.envio.enviado })).toBeVisible();
      expect(s.propuestas).toHaveLength(1);
      expect(s.propuestas[0]).toMatchObject({ ...op.esperado, punto_id: hid.id });
    });
  }
  // docs/31 RV-157: una notificación tocada con el formulario a medias no se lo lleva sin preguntar.
  test('un aviso con el formulario a medias pregunta antes de salir', async ({ page }) => {
    await servidor(page);
    const hid = PUNTOS[0];
    await page.goto(`/?p=${hid.id}`);
    await page.getByRole('button', { name: T.ficha.proponerCambio }).click();
    await page.getByRole('button', { name: new RegExp(`^${T.operaciones.sigueIgual}`) }).click();
    await expect(page).toHaveURL(/\/proponer\//);
    // Lo que manda public/sw-push.js en vez de navegar.
    await page.evaluate(() =>
      navigator.serviceWorker.dispatchEvent(
        new MessageEvent('message', { data: { tipo: 'aviso_push', url: '/mis-propuestas' } }),
      ),
    );
    await expect(page.getByText(T.avisoFormulario.avisoNuevo)).toBeVisible();
    await page.getByRole('button', { name: T.avisoFormulario.ver, exact: true }).click();
    const hoja = page.getByRole('dialog', { name: T.avisoFormulario.salir });
    await expect(hoja.getByText(T.avisoFormulario.sePierde)).toBeVisible();
    await hoja.getByRole('button', { name: T.avisoFormulario.seguir }).click();
    await expect(page).toHaveURL(/\/proponer\//);
    await page.getByRole('button', { name: T.avisoFormulario.ver, exact: true }).click();
    await page
      .getByRole('dialog', { name: T.avisoFormulario.salir })
      .getByRole('button', { name: T.avisoFormulario.botonSalir })
      .click();
    await expect(page).toHaveURL(/\/mis-propuestas$/);
    await expect(page.getByText(T.avisoFormulario.avisoNuevo)).toHaveCount(0);
  });

  // docs/18 RV-41, DEC-090: el tipo no se cambia; se retira el punto y se da de alta el correcto.
  test('corregir datos no ofrece cambiar el tipo y enlaza a retirar', async ({ page }) => {
    await servidor(page);
    const hid = PUNTOS[0];
    await page.goto(`/?p=${hid.id}`);
    await page.getByRole('button', { name: T.ficha.proponerCambio }).click();
    await page.getByRole('button', { name: new RegExp(`^${T.operaciones.corregirDatos}`) }).click();
    await expect(page.getByRole('radio', { name: T.formulario.bocaRiego })).toHaveCount(0);
    await expect(page.getByRole('radio', { name: T.formulario.hidrante })).toHaveCount(0);
    await expect(page.getByText(T.operaciones.tipoNoCambia)).toBeVisible();
    await page.getByRole('link', { name: T.operaciones.proponerRetirada }).click();
    await expect(page).toHaveURL((u) => u.pathname === '/proponer/retirada' && u.searchParams.get('p') === hid.id);
    await expect(page.getByLabel(T.formulario.motivoRetirada)).toBeVisible();
  });

  // docs/31 RV-157: «Repetir» con una foto que no se puede leer deja la anterior, con el aviso.
  test('repetir una foto que falla deja la anterior y lo dice', async ({ page }) => {
    await servidor(page);
    const hid = PUNTOS[0];
    await page.goto(`/?p=${hid.id}`);
    await page.getByRole('button', { name: T.ficha.proponerCambio }).click();
    await page.getByRole('button', { name: new RegExp(`^${T.operaciones.sigueIgual}`) }).click();
    await hacerFoto(page);
    const hueco = page.getByTestId('hueco-entrada-foto');
    const tamano = await hueco.getByText(/\d+ kB/).textContent();
    await page.getByTestId('entrada-foto').setInputFiles({
      name: 'rota.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from('esto no es una foto'),
    });
    await expect(hueco.getByRole('alert')).toHaveText(T.operaciones.fotoRepetidaIlegible);
    await expect(hueco.getByText(/\d+ kB/)).toHaveText(tamano!);
    await expect(enviar(page)).toBeEnabled();
  });

  test('sin cobertura: tres altas se guardan y salen solas al volver, una vez cada una (criterio)', async ({
    page,
    context,
  }) => {
    const s = await servidor(page);
    await page.goto('/');
    await expect(page.getByText(T.mapa.nPuntos(PUNTOS.length))).toBeVisible();
    await context.setOffline(true);
    for (let i = 0; i < 3; i++) {
      await page.getByRole('button', { name: T.navegacion.nuevoPunto }).click();
      await page.getByRole('radio', { name: T.formulario.bocaRiego }).click();
      await page.getByRole('radio', { name: T.formulario.d45 }).click();
      await page.getByRole('radio', { name: T.formulario.granada }).click();
      await page.getByRole('radio', { name: T.formulario.bueno }).click();
      await hacerFoto(page);
      await enviar(page, T.envio.guardarSinCobertura).click();
      await expect(page.getByRole('heading', { level: 2, name: T.envio.guardadoEnMovil })).toBeVisible();
      await page.getByRole('button', { name: T.envio.volverAlMapa }).click();
    }
    await expect(page.getByRole('link', { name: T.mapa.sinEnviar(3) })).toBeVisible();
    expect(s.propuestas).toHaveLength(0);

    // TR-04: al volver la señal salen solas, sin que nadie toque nada, y en menos de un minuto.
    const vueltaLaSenal = Date.now();
    await context.setOffline(false);
    await expect(page.getByRole('link', { name: /sin enviar/ })).toHaveCount(0, { timeout: 60_000 });
    expect(Date.now() - vueltaLaSenal).toBeLessThan(60_000);
    expect(s.propuestas).toHaveLength(3);
    expect(new Set(s.propuestas.map((p) => p.clave_local)).size).toBe(3);
    // Dos fotos por alta: la de la conexión y la del sitio (docs/24 RV-103).
    expect(s.subidas).toHaveLength(6);
    expect(s.propuestas.every((p) => typeof p.foto_sitio_path === 'string')).toBe(true);
    expect(s.propuestas.every((p) => p.datos && (p.datos as { diametro_mm: number }).diametro_mm === 45)).toBe(true);
  });

  // docs/24 RV-101: una boca de 70 mm se da de alta con su diámetro; otra medida pide el número.
  test('alta de una boca de riego de 70 mm', async ({ page }) => {
    const s = await servidor(page);
    await page.goto('/');
    await page.getByRole('button', { name: T.navegacion.nuevoPunto }).click();
    await page.getByRole('radio', { name: T.formulario.bocaRiego }).click();
    await expect(page.getByText(T.avisosFormulario.eligeDiametro)).toBeVisible();
    await page.getByRole('radio', { name: T.formulario.otraMedida }).click();
    await expect(page.getByText(T.avisosFormulario.indicaMedida)).toBeVisible();
    await page.getByLabel(T.formulario.otraMedida).fill('200');
    await expect(page.getByText(T.avisosFormulario.indicaMedida)).toBeVisible();
    await page.getByRole('radio', { name: T.formulario.d70 }).click();
    // docs/25 RV-112 (DEC-163) y docs/29 RV-121 (DEC-170): «Tipo de enganche», con Barcelona,
    // Granada, Directo y Otro en este orden.
    await expect(page.getByText('Elige el tipo de enganche')).toBeVisible();
    const enganche = page.getByRole('radiogroup', { name: 'Tipo de enganche' });
    await expect(enganche.getByRole('radio')).toHaveText(['Barcelona', 'Granada', 'Directo', 'Otro']);
    await expect(page.getByText(/racor/i)).toHaveCount(0);
    await enganche.getByRole('radio', { name: T.formulario.barcelona }).click();
    await page.getByRole('radio', { name: T.formulario.bueno }).click();
    await hacerFoto(page);
    await enviar(page).click();
    await expect(page.getByRole('heading', { level: 2, name: T.envio.enviado })).toBeVisible();
    expect(s.propuestas[0]?.datos).toEqual({
      tipo: 'boca_riego',
      diametro_mm: 70,
      racor: 'barcelona',
      caudal: 'bueno',
    });
  });

  // docs/29 RV-121 (DEC-170): las cuatro tarjetas en una fila, ≥ 44 × 44, sin desplazar a lo ancho.
  for (const ancho of [360, 412]) {
    test(`alta de una boca con enganche Directo a ${ancho} px`, async ({ page }) => {
      await page.setViewportSize({ width: ancho, height: 800 });
      // Sin la foto de Directo en el servidor (la pone el desarrollador): la tarjeta, solo con el nombre.
      await page.route('**/racores/directo.webp', (r) => r.fulfill({ status: 404, body: '' }));
      const s = await servidor(page);
      await page.goto('/');
      await page.getByRole('button', { name: T.navegacion.nuevoPunto }).click();
      await page.getByRole('radio', { name: T.formulario.bocaRiego }).click();
      await page.getByRole('radio', { name: T.formulario.d45 }).click();
      const enganche = page.getByRole('radiogroup', { name: T.formulario.racor });
      const tarjetas = enganche.getByRole('radio');
      await expect(tarjetas).toHaveText(['Barcelona', 'Granada', 'Directo', 'Otro']);
      await expect(enganche.getByRole('radio', { name: T.formulario.directo }).locator('img')).toHaveCount(0);
      const cajas = await Promise.all((await tarjetas.all()).map((t) => t.boundingBox()));
      for (const c of cajas) {
        expect(c!.width).toBeGreaterThanOrEqual(44);
        expect(c!.height).toBeGreaterThanOrEqual(44);
        expect(Math.abs(c!.y - cajas[0]!.y), 'las cuatro en la misma fila').toBeLessThan(1);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(ancho);
      await enganche.getByRole('radio', { name: T.formulario.directo }).click();
      await page.getByRole('radio', { name: T.formulario.bueno }).click();
      await hacerFoto(page);
      await enviar(page).click();
      await expect(page.getByRole('heading', { level: 2, name: T.envio.enviado })).toBeVisible();
      expect(s.propuestas[0]?.datos).toEqual({
        tipo: 'boca_riego',
        diametro_mm: 45,
        racor: 'directo',
        caudal: 'bueno',
      });
    });
  }

  // docs/24 RV-102: "Barro" no pide descripción del fallo y viaja tal cual.
  test('alta con Barro: sin descripción del fallo', async ({ page }) => {
    const s = await servidor(page);
    await page.goto('/');
    await page.getByRole('button', { name: T.navegacion.nuevoPunto }).click();
    await page.getByRole('radio', { name: T.formulario.hidrante }).click();
    await page.getByRole('radio', { name: T.formulario.d100 }).click();
    // Un hidrante no tiene tipo de enganche (docs/25 RV-112).
    await expect(page.getByRole('radiogroup', { name: T.formulario.racor })).toHaveCount(0);
    await page.getByRole('radio', { name: T.formulario.barro }).click();
    await expect(page.getByLabel(T.formulario.descripcionFallo)).toHaveCount(0);
    await hacerFoto(page);
    await enviar(page).click();
    await expect(page.getByRole('heading', { level: 2, name: T.envio.enviado })).toBeVisible();
    expect(s.propuestas[0]?.datos).toEqual({ tipo: 'hidrante', diametro_mm: 100, caudal: 'barro' });
  });

  test('Mis propuestas lista lo enviado', async ({ page }) => {
    const s = await servidor(page);
    await page.goto('/?p=' + PUNTOS[0].id);
    await page.getByRole('button', { name: T.ficha.proponerCambio }).click();
    await page.getByRole('button', { name: new RegExp(`^${T.operaciones.sigueIgual}`) }).click();
    await hacerFoto(page);
    await enviar(page).click();
    await page.getByRole('button', { name: T.envio.verMisPropuestas }).click();
    await expect(page.getByText(T.misPropuestas.pendiente)).toBeVisible();
    await expect(page.getByRole('button', { name: T.misPropuestas.retirar })).toBeVisible();

    await page.goto('/ajustes');
    await expect(page.getByText(T.misPropuestas.resumen(1, 0))).toBeVisible();
    expect(s.propuestas).toHaveLength(1);
  });

  // docs/29 RV-125 (DEC-167): sin la lista de incidencias en el panel nadie leería los avisos.
  test('Ajustes ya no ofrece "Algo no funciona" y /incidencia lleva a Ajustes', async ({ page }) => {
    const s = await servidor(page);
    await page.goto('/ajustes');
    await expect(page.getByText(T.ajustes.comoSeUsa)).toBeVisible();
    await expect(page.getByText(/Algo no funciona/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Avisar a jefatura' })).toHaveCount(0);
    // Un enlace guardado o el historial de una versión vieja: a Ajustes, sin formulario.
    await page.goto('/incidencia');
    await expect(page).toHaveURL(/\/ajustes$/);
    await expect(page.getByText(T.ajustes.comoSeUsa)).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Qué ha pasado' })).toHaveCount(0);
    expect(s.propuestas).toHaveLength(0);
  });
});

test.describe('cola: lo que se envía mientras otro envío sube (RV-01, RV-02)', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 37.2309, longitude: -3.6566, accuracy: 9 });
    await conSesion(page);
  });

  test('una corrección enviada mientras sube otra foto sale en la misma vuelta', async ({ page }) => {
    const s = await servidor(page);
    // La reserva de la primera foto no contesta hasta que la corrección está enviada: 3G lento.
    let soltar!: () => void;
    const suelta = new Promise<void>((r) => (soltar = r));
    let reservas = 0;
    await page.route('**/api/url-subida', async (r) => {
      reservas++;
      await suelta;
      await r.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ foto_path: `fotos/${reservas}.jpg`, url: `${SB}/storage/subir` }),
      });
    });
    const [hid, otro] = PUNTOS;
    await page.goto(`/?p=${hid.id}`);
    await page.getByRole('button', { name: T.ficha.proponerCambio }).click();
    await page.getByRole('button', { name: new RegExp(`^${T.operaciones.sigueIgual}`) }).click();
    await hacerFoto(page);
    await enviar(page).click();
    await expect.poll(() => reservas).toBe(1);

    // Mientras la foto espera, el voluntario vuelve atrás y corrige los datos de otro punto.
    await page.goto(`/?p=${otro.id}`);
    await page.getByRole('button', { name: T.ficha.proponerCambio }).click();
    await page.getByRole('button', { name: new RegExp(`^${T.operaciones.corregirDatos}`) }).click();
    await page.getByRole('radio', { name: otro.diametro_mm === 70 ? T.formulario.d100 : T.formulario.d70 }).click();
    await expect.poll(() => reservas).toBeGreaterThanOrEqual(2);
    await enviar(page).click();
    soltar();

    await expect(page.getByRole('heading', { level: 2, name: T.envio.enviado })).toBeVisible();
    await page.getByRole('button', { name: T.envio.volverAlMapa }).click();
    await expect(page.getByRole('link', { name: /sin enviar/ })).toHaveCount(0);
    expect(s.propuestas.map((p) => p.operacion)).toEqual(['revision', 'datos']);
  });

  test('sin IndexedDB avisa de no cerrar la aplicación', async ({ page }) => {
    await page.addInitScript(() => {
      indexedDB.open = () => {
        throw new DOMException('sin IndexedDB', 'UnknownError');
      };
    });
    await servidor(page);
    await page.route(`${SB}/rest/v1/rpc/fn_proponer`, (r) => r.abort('connectionrefused'));
    await page.goto('/');
    await page.getByRole('button', { name: T.navegacion.nuevoPunto }).click();
    await page.getByRole('radio', { name: T.formulario.bocaRiego }).click();
    await page.getByRole('radio', { name: T.formulario.d45 }).click();
    await page.getByRole('radio', { name: T.formulario.granada }).click();
    await page.getByRole('radio', { name: T.formulario.bueno }).click();
    await hacerFoto(page);
    await page.getByRole('button', { name: /^(Enviar para revisión|Guardar · se enviará)/ }).click();
    await expect(page.getByRole('heading', { level: 2, name: T.envio.soloEnMemoria })).toBeVisible();
    await expect(page.getByText(T.envio.soloEnMemoriaDetalle)).toBeVisible();
    await expect(page.getByRole('button', { name: T.envio.reintentarAhora })).toBeVisible();
    // Un solo primario por pantalla (docs/24 RV-100, DEC-147): reintentar; volver al mapa, secundario.
    await expect(page.locator('[data-variante="primario"]')).toHaveCount(1);
    await expect(page.getByRole('button', { name: T.envio.volverAlMapa })).toHaveAttribute(
      'data-variante',
      'secundario',
    );
  });

  // docs/18 RV-39: la pantalla no se quedaba en "Solo en memoria" tras un reintento bueno.
  test('tras "Reintentar ahora" con éxito la pantalla dice enviado', async ({ page }) => {
    await page.addInitScript(() => {
      indexedDB.open = () => {
        throw new DOMException('sin IndexedDB', 'UnknownError');
      };
    });
    await servidor(page);
    let caido = true;
    await page.route(`${SB}/rest/v1/rpc/fn_proponer`, (r) => (caido ? r.abort('connectionrefused') : r.fallback()));
    await page.goto('/');
    await page.getByRole('button', { name: T.navegacion.nuevoPunto }).click();
    await page.getByRole('radio', { name: T.formulario.bocaRiego }).click();
    await page.getByRole('radio', { name: T.formulario.d45 }).click();
    await page.getByRole('radio', { name: T.formulario.granada }).click();
    await page.getByRole('radio', { name: T.formulario.bueno }).click();
    await hacerFoto(page);
    await page.getByRole('button', { name: /^(Enviar para revisión|Guardar · se enviará)/ }).click();
    await expect(page.getByRole('heading', { level: 2, name: T.envio.soloEnMemoria })).toBeVisible();
    // La pantalla sigue a la cola (docs/31 RV-151) y la cola reintenta sola: lo que salga antes del
    // toque espera a que se pulse, para que el botón siga ahí y sea el toque el que lo lleve.
    let pulsado!: () => void;
    const tocado = new Promise<void>((r) => (pulsado = r));
    await page.route(`${SB}/rest/v1/rpc/fn_proponer`, async (r) => {
      await tocado;
      await r.fallback();
    });
    caido = false;
    await page.getByRole('button', { name: T.envio.reintentarAhora }).click();
    pulsado();
    await expect(page.getByRole('heading', { level: 2, name: T.envio.enviado })).toBeVisible();
    await expect(page.getByRole('button', { name: T.envio.reintentarAhora })).toHaveCount(0);
  });
});

test('jefatura no ve "otra medida" en un alta (RV-19, FR-151)', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 37.2309, longitude: -3.6566, accuracy: 9 });
  await conGoogle(page, 'jefa@example.org');
  await simularRpc(page, { fn_es_admin: true, fn_registrar_error: null });
  await simularTablas(page, { v_puntos_activos: PUNTOS });
  await page.goto('/');
  await page.getByRole('button', { name: T.navegacion.nuevoPunto }).click();
  await page.getByRole('radio', { name: T.formulario.hidrante }).click();
  await expect(page.getByRole('radio', { name: T.formulario.d100 })).toBeVisible();
  await expect(page.getByRole('radio', { name: T.formulario.otraMedida })).toHaveCount(0);
});

test.describe('Mis propuestas (RV-23)', () => {
  const PROPIA = (extra: Record<string, unknown>) => ({
    id: 'r1',
    clave_local: 'k-r1',
    operacion: 'datos',
    punto_id: PUNTOS[0].id,
    codigo: PUNTOS[0].codigo,
    datos: {},
    estado: 'pendiente',
    motivo_rechazo: null,
    correcciones: null,
    creada_en: new Date().toISOString(),
    revisada_en: null,
    ...extra,
  });

  async function conPropuestas(page: Page, propias: Record<string, unknown>[]) {
    await conSesion(page);
    await page.route(`${SB}/rest/v1/rpc/*`, async (r) => {
      const nombre = new URL(r.request().url()).pathname.split('/').pop();
      const json = (b: unknown, status = 200) =>
        r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });
      if (nombre === 'fn_listar_puntos') return json(LISTADO);
      if (nombre === 'fn_mis_propuestas') return json(propias);
      if (nombre === 'fn_retirar_propuesta') {
        return json({ code: 'P0001', message: 'PROPUESTA_NO_PENDIENTE: Ya no está pendiente' }, 400);
      }
      return json(null);
    });
  }

  test('retirar una propuesta ya revisada lo dice', async ({ page }) => {
    await conPropuestas(page, [PROPIA({})]);
    await page.goto('/mis-propuestas');
    await page.getByRole('button', { name: T.misPropuestas.retirar }).click();
    const hoja = page.getByRole('dialog');
    await hoja.getByRole('button', { name: T.misPropuestas.retirar }).click();
    await expect(hoja.getByRole('alert')).toHaveText(T.misPropuestas.yaRevisada);
  });

  test('las correcciones se leen en español', async ({ page }) => {
    await conPropuestas(page, [PROPIA({ estado: 'aprobada', correcciones: { diametro_mm: 70, racor: 'granada' } })]);
    await page.goto('/mis-propuestas');
    await expect(
      page.getByText(T.misPropuestas.conCorrecciones('Diámetro: 70 mm · Tipo de enganche: Granada')),
    ).toBeVisible();
    await expect(page.getByText(/diametro mm/)).toHaveCount(0);
  });
});

// FR-55 (RV-30): un alta fuera de la zona avisa y deja continuar; jefatura lo verá señalado.
test('un alta fuera de la zona avisa y deja continuar (FR-55)', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  // Granada capital: dentro de los límites de la base de datos, fuera de Albolote y Calicasas.
  await context.setGeolocation({ latitude: 37.1773, longitude: -3.5986, accuracy: 6 });
  await conSesion(page);
  const s = await servidor(page);
  await page.goto('/proponer/alta');
  await expect(page.getByText(T.avisosFormulario.fueraDeZona)).toBeVisible();
  await page.getByRole('radio', { name: T.formulario.bocaRiego }).click();
  await page.getByRole('radio', { name: T.formulario.d45 }).click();
  await page.getByRole('radio', { name: T.formulario.granada }).click();
  await page.getByRole('radio', { name: T.formulario.bueno }).click();
  await hacerFoto(page);
  await enviar(page).click();
  await expect(page.getByRole('heading', { level: 2, name: T.envio.enviado })).toBeVisible();
  expect(s.propuestas[0]).toMatchObject({ operacion: 'alta' });
  expect(s.propuestas[0].lat as number).toBeCloseTo(37.1773, 3);
});

// docs/31 RV-151: con señal débil, Enviar esperaba a la cola entera (reserva, fotos y RPC) y el
// voluntario se quedaba minutos en "Enviando…". Ahora basta con que quede guardada en el móvil.
test('Enviar no espera a la cola: con la red parada, el resultado sale al momento y cambia al salir', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 37.2309, longitude: -3.6566, accuracy: 9 });
  await conSesion(page);
  const s = await servidor(page);
  // La reserva de la foto no contesta: hay red, pero no pasa nada por ella.
  let soltar!: () => void;
  const suelta = new Promise<void>((r) => (soltar = r));
  await page.route('**/api/url-subida', async (r) => {
    await suelta;
    await r.fallback();
  });
  await page.goto('/proponer/alta');
  await page.getByRole('radio', { name: T.formulario.bocaRiego }).click();
  await page.getByRole('radio', { name: T.formulario.d45 }).click();
  await page.getByRole('radio', { name: T.formulario.granada }).click();
  await page.getByRole('radio', { name: T.formulario.bueno }).click();
  await hacerFoto(page);
  await enviar(page).click();
  await expect(page.getByRole('heading', { level: 2, name: T.envio.guardadoEnMovil })).toBeVisible({ timeout: 1000 });
  await expect(page.getByText(T.operaciones.guardadoDetalle)).toBeVisible();
  expect(s.propuestas).toHaveLength(0);

  // Cuando la red responde, la misma pantalla pasa a "Enviado", sin tocar nada.
  soltar();
  await expect(page.getByRole('heading', { level: 2, name: T.envio.enviado })).toBeVisible();
  expect(s.propuestas).toHaveLength(1);
});

// docs/31 RV-152: si Android descarta la pestaña mientras está la cámara, al volver se recarga el
// formulario antes de que hayan cargado los puntos, y mandaba al mapa.
test.describe('el formulario de un punto al recargar (RV-152)', () => {
  test.beforeEach(async ({ page }) => {
    await conSesion(page);
    await servidor(page);
  });

  test('recargar el formulario de un punto lo vuelve a abrir, sin mandar al mapa', async ({ page }) => {
    const hid = PUNTOS[0];
    await page.goto('/');
    await expect(page.getByText(T.mapa.nPuntos(PUNTOS.length))).toBeVisible();
    await page.goto(`/proponer/revision?p=${hid.id}`);
    await expect(page.getByText(hid.codigo, { exact: true })).toBeVisible();
    await expect(page).toHaveURL((u) => u.pathname === '/proponer/revision');
  });

  test('un punto que ya no está: lo dice y no redirige', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(T.mapa.nPuntos(PUNTOS.length))).toBeVisible();
    await page.goto('/proponer/estado?p=no-existe');
    await expect(page.getByRole('alert').filter({ hasText: T.operaciones.puntoYaNoEsta })).toBeVisible();
    await expect(page).toHaveURL((u) => u.pathname === '/proponer/estado');
    await page.getByRole('button', { name: T.envio.volverAlMapa }).click();
    await expect(page).toHaveURL((u) => u.pathname === '/');
  });
});
