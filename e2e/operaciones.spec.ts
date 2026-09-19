// Fase 6: las seis operaciones, la foto sin EXIF, la cola sin cobertura, Mis propuestas y
// "Algo no funciona" (FL-03–FL-11), con el servidor simulado.

import { expect, test, type Page } from '@playwright/test';
import { conExif } from '../src/lib/exif-prueba.ts';
import { T } from '../src/lib/textos.ts';
import { TOKEN, conSesion } from './ayudas.ts';
import { LISTADO, PUNTOS } from './puntos.ts';

const SB = 'https://supabase.invalid';

interface Servidor {
  propuestas: Record<string, unknown>[];
  subidas: Buffer[];
  incidencias: Record<string, unknown>[];
}

/** Servidor simulado: guarda lo que llega y responde como las RPC de 05 §6 (idempotente por clave_local). */
async function servidor(page: Page, { caido = false } = {}): Promise<Servidor> {
  const s: Servidor = { propuestas: [], subidas: [], incidencias: [] };
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
    if (nombre === 'fn_reportar_incidencia') {
      s.incidencias.push(cuerpo);
      return json('00000000-0000-4000-8000-000000000001');
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
  await expect(page.getByText(/Foto añadida · \d+ kB/)).toBeVisible();
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
  });

  test('revisión, estado, datos, ubicación y retirada desde la ficha', async ({ page }) => {
    const s = await servidor(page);
    const hid = PUNTOS[0];
    const abrirOperacion = async (nombre: string) => {
      await page.goto(`/?p=${hid.id}`);
      await page.getByRole('button', { name: T.ficha.proponerCambio }).click();
      await expect(page.getByRole('dialog', { name: T.operaciones.queHaCambiado(hid.codigo) })).toBeVisible();
      await page.getByRole('button', { name: new RegExp(`^${nombre}`) }).click();
    };

    await abrirOperacion(T.operaciones.sigueIgual);
    await expect(page.getByText(T.operaciones.revisionAviso)).toBeVisible();
    await hacerFoto(page);
    await enviar(page).click();
    await expect(page.getByRole('heading', { level: 2, name: T.envio.enviado })).toBeVisible();

    await abrirOperacion(T.operaciones.actualizarEstado);
    await page.getByRole('radio', { name: T.formulario.regular }).click();
    await hacerFoto(page);
    await enviar(page).click();
    await expect(page.getByRole('heading', { level: 2, name: T.envio.enviado })).toBeVisible();

    await abrirOperacion(T.operaciones.corregirDatos);
    await expect(page.getByText(T.avisosFormulario.sinCambios)).toBeVisible();
    await page.getByRole('radio', { name: T.formulario.d70 }).click();
    await enviar(page).click();
    await expect(page.getByRole('heading', { level: 2, name: T.envio.enviado })).toBeVisible();

    await abrirOperacion(T.operaciones.corregirUbicacion);
    await expect(page.getByText(T.avisosFormulario.muevePin)).toBeVisible();
    const mapa = page.getByTestId('selector-pin');
    const caja = (await mapa.boundingBox())!;
    await mapa.click({ position: { x: caja.width / 2 + 60, y: caja.height / 2 } });
    await expect(page.getByText(T.formulario.desplazamiento)).toBeVisible();
    await hacerFoto(page);
    await enviar(page).click();
    await expect(page.getByRole('heading', { level: 2, name: T.envio.enviado })).toBeVisible();

    await abrirOperacion(T.operaciones.proponerRetirada);
    await page.getByRole('radio', { name: T.formulario.obras }).click();
    await expect(page.getByText(T.avisosFormulario.explicaMotivo)).toBeVisible();
    await page.getByLabel(T.formulario.motivoRetirada).fill('Zanja abierta, el hidrante no está');
    await hacerFoto(page);
    await enviar(page, T.envio.enviarRetirada).click();
    await expect(page.getByRole('heading', { level: 2, name: T.envio.enviado })).toBeVisible();

    expect(s.propuestas.map((p) => p.operacion)).toEqual(['revision', 'estado', 'datos', 'ubicacion', 'retirada']);
    expect(s.propuestas.every((p) => p.punto_id === hid.id)).toBe(true);
    expect(s.propuestas[2]).toMatchObject({ datos: { diametro_mm: 70 }, foto_path: null });
    expect(s.propuestas[3]).toMatchObject({ origen: 'manual', datos: {} });
    expect(s.propuestas[4]).toMatchObject({ datos: { motivo_rapido: 'obras' } });
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
      await page.getByRole('radio', { name: T.formulario.granada }).click();
      await page.getByRole('radio', { name: T.formulario.bueno }).click();
      await hacerFoto(page);
      await enviar(page, T.envio.guardarSinCobertura).click();
      await expect(page.getByRole('heading', { level: 2, name: T.envio.guardadoEnMovil })).toBeVisible();
      await page.getByRole('button', { name: T.envio.volverAlMapa }).click();
    }
    await expect(page.getByRole('link', { name: T.mapa.sinEnviar(3) })).toBeVisible();
    expect(s.propuestas).toHaveLength(0);

    await context.setOffline(false);
    await expect(page.getByRole('link', { name: /sin enviar/ })).toHaveCount(0, { timeout: 15_000 });
    expect(s.propuestas).toHaveLength(3);
    expect(new Set(s.propuestas.map((p) => p.clave_local)).size).toBe(3);
    expect(s.subidas).toHaveLength(3);
    expect(s.propuestas.every((p) => p.datos && (p.datos as { diametro_mm: number }).diametro_mm === 45)).toBe(true);
  });

  test('Mis propuestas lista lo enviado y "Algo no funciona" llega a jefatura', async ({ page }) => {
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
    await page.getByRole('button', { name: T.ajustes.avisarJefatura }).click();
    await expect(page.getByRole('button', { name: T.ajustes.avisarJefatura })).toBeDisabled();
    await page.getByLabel(T.incidencia.queHaPasado).fill('Al hacer la foto la app se cierra');
    await page.getByRole('button', { name: T.ajustes.avisarJefatura }).click();
    await expect(page.getByRole('heading', { level: 2, name: T.incidencia.enviado })).toBeVisible();
    expect(s.incidencias[0]).toMatchObject({ token: TOKEN, descripcion: 'Al hacer la foto la app se cierra' });
  });
});
