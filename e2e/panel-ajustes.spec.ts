// Panel · ajustes (FR-140–FR-145, FR-162–FR-167).

import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { T } from '../src/lib/textos.ts';
import { SUPABASE_PRUEBAS } from '../playwright.config.ts';
import { conGoogle, simularTablas } from './ayudas.ts';
import { PUNTOS } from './puntos.ts';
import { readFileSync } from 'node:fs';
import { novedadesDe } from '../scripts/generar-novedades.ts';

/** Lo que `npm run build` genera desde el CHANGELOG, que es lo que lleva la app probada. */
const NOVEDADES = novedadesDe(readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8'));

const CONFIG = [
  { clave: 'codigo_acceso', valor: '482917' },
  { clave: 'codigo_acceso_cambiado_en', valor: '2026-09-02T10:00:00Z' },
  { clave: 'codigo_acceso_cambiado_por', valor: 'jefe@example.org' },
  { clave: 'meses_revision', valor: 12 },
  { clave: 'radio_duplicado_m', valor: 25 },
  { clave: 'dias_papelera', valor: 30 },
  { clave: 'buffer_zona_m', valor: 400 },
  { clave: 'max_subidas_dispositivo_dia', valor: 40 },
  { clave: 'metros_tramo_manguera', valor: 20 },
  { clave: 'escala_radios', valor: [11, 9, 7, 5.5, 5] },
];

const ADMINISTRADORES = [
  { email: 'jefe@example.org', activo: true, creado_en: '2026-08-01T10:00:00Z', creado_por: 'migracion' },
  { email: 'secretaria@example.org', activo: false, creado_en: '2026-09-03T10:00:00Z', creado_por: 'jefe@example.org' },
];

const SALUD = {
  pendientes_14d: 2,
  errores_7d: 0,
  sin_direccion: 3,
  ultimo_respaldo: '2026-09-18T03:00:00Z',
  storage_bytes: 117_440_512,
  version_zona: '2026-07-14',
  version_mapabase: '2026-07-14',
  ultima_vigilancia: '2026-09-20T07:41:00Z',
  vigilancia_ok: true,
  dispositivos_activos: 61,
  bd_bytes: 38 * 1024 * 1024,
  esquema_bytes: 3 * 1024 * 1024,
  tareas: [
    {
      tarea: 'hidrantes_purgar_errores',
      ultima: new Date(Date.now() - 2 * 3600_000).toISOString(),
      fallo: false,
      problema: false,
    },
    { tarea: 'hidrantes_resumen_semanal', ultima: null, fallo: false, problema: false },
    {
      tarea: 'hidrantes_purgar_subidas',
      ultima: new Date(Date.now() - 50 * 3600_000).toISOString(),
      fallo: true,
      problema: true,
    },
    // Una de las que tiene que haber y no está en pg_cron (docs/19 RV-56).
    { tarea: 'hidrantes_revocar_tokens', ultima: null, fallo: false, falta: true, problema: true },
  ],
};

interface Llamada {
  nombre: string;
  cuerpo: Record<string, unknown>;
}

async function prepararPanel(
  page: Page,
  {
    conDispatch = true,
    salud = SALUD as Record<string, unknown>,
    pedidos = [] as unknown[],
    // docs/33 RV-338: `config.entrada_abierta_hasta` (0044). Sin poner, la base no la tiene.
    entrada = undefined as string | null | undefined,
  } = {},
) {
  const llamadas: Llamada[] = [];
  let entradaHasta = entrada;
  let administradores = ADMINISTRADORES;
  await conGoogle(page, 'jefe@example.org');
  await simularTablas(page, {
    v_puntos_activos: PUNTOS,
    v_cola_revision: [],
    propuestas: [],
    puntos: [],
    config: (url) => {
      const filtro = url.searchParams.get('clave') ?? '';
      const claves = filtro.startsWith('in.') ? filtro.slice(4, -1).split(',') : null;
      const filas =
        entradaHasta === undefined ? CONFIG : [...CONFIG, { clave: 'entrada_abierta_hasta', valor: entradaHasta }];
      const igual = url.searchParams.get('clave')?.startsWith('eq.') ? url.searchParams.get('clave')!.slice(3) : null;
      if (igual) return filas.filter((c) => c.clave === igual);
      return claves ? filas.filter((c) => claves.includes(c.clave)) : filas;
    },
    administradores: () => administradores,
    dispositivos: [{ id: 'x1' }, { id: 'x2' }],
    nucleos: [
      { nombre: 'Albolote', municipio: 'albolote', manual: false },
      { nombre: 'Pretel', municipio: 'albolote', manual: true },
    ],
  });
  await page.route(`${SUPABASE_PRUEBAS}/rest/v1/rpc/*`, async (route) => {
    const nombre = new URL(route.request().url()).pathname.split('/').pop()!;
    const cuerpo = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
    llamadas.push({ nombre, cuerpo });
    const json = (d: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(d) });
    switch (nombre) {
      case 'fn_es_admin':
        return json(true);
      case 'fn_salud':
        // Con 0044, fn_salud dice si la entrada está abierta (RV-300).
        return json(
          'entradas_frenadas_24h' in salud ? { ...salud, entrada_abierta_hasta: entradaHasta ?? null } : salud,
        );
      case 'fn_abrir_entrada':
        entradaHasta = new Date(Date.now() + (Number(cuerpo.horas) || 24) * 3_600_000).toISOString();
        return json(entradaHasta);
      case 'fn_cerrar_entrada':
        entradaHasta = null;
        return json(null);
      case 'fn_exportar_inventario':
        return json([]);
      case 'fn_gestionar_administrador':
        administradores = administradores.map((a) =>
          a.email === cuerpo.email ? { ...a, activo: cuerpo.activo as boolean } : a,
        );
        return json(null);
      case 'fn_cambiar_codigo_acceso':
        // Con 0044, revocar todos abre la entrada 24 h (RV-300).
        if (cuerpo.revocar_dispositivos && entradaHasta !== undefined) {
          entradaHasta = new Date(Date.now() + 24 * 3_600_000).toISOString();
        }
        return json(null);
      case 'fn_guardar_config':
      case 'fn_renombrar_nucleo':
        return json(null);
      case 'fn_pedidos_recientes':
        return json(pedidos);
      case 'fn_revocar_dispositivo':
        return json(1);
      default:
        return route.abort('connectionrefused');
    }
  });
  await page.route('**/api/lanzar-workflow', (r) =>
    conDispatch
      ? r.fulfill({
          contentType: 'application/json',
          status: 202,
          body: '{"lanzada":true,"workflow":"regenerar-zona"}',
        })
      : r.fulfill({ contentType: 'application/json', status: 503, body: '{"error":"NO_CONFIGURADO"}' }),
  );
  await page.route('**/api/push', (r) => r.fulfill({ contentType: 'application/json', body: '{"enviadas":0}' }));
  return llamadas;
}

const llamadaA = (llamadas: Llamada[], nombre: string) => llamadas.find((l) => l.nombre === nombre)?.cuerpo;

test('ajustes: código de acceso con confirmación y revocación (FR-140, FL-29)', async ({ page }) => {
  const llamadas = await prepararPanel(page);
  await page.goto('/admin/ajustes');
  const tarjeta = page.getByRole('region').filter({ hasText: T.panelAjustes.codigoAcceso }).first();
  await expect(tarjeta.getByText('••••••')).toBeVisible();
  await tarjeta.getByRole('button', { name: T.panelAjustes.ver }).click();
  await expect(tarjeta.getByText('482917')).toBeVisible();

  await tarjeta.getByLabel(T.panel.revocarTodos).check();
  await expect(tarjeta.getByText(T.panelAjustes.explicaRevocando)).toBeVisible();
  await tarjeta.getByRole('button', { name: T.panel.generarNuevo }).click();
  const dialogo = page.getByRole('dialog');
  await expect(dialogo.getByText(T.panelAjustes.avisoRevocando(2))).toBeVisible();
  await dialogo.getByRole('button', { name: T.panelAjustes.confirmarCodigo }).click();
  // La llamada sale después del clic, no con él: se espera a que llegue (docs/18 RV-49).
  await expect.poll(() => llamadaA(llamadas, 'fn_cambiar_codigo_acceso')).toBeTruthy();
  const cuerpo = llamadaA(llamadas, 'fn_cambiar_codigo_acceso')!;
  expect(cuerpo.revocar_dispositivos).toBe(true);
  expect(String(cuerpo.nuevo)).toMatch(/^\d{6}$/);
});

test('ajustes: administradores, parámetros y núcleos (FR-141, FR-142, FR-166)', async ({ page }) => {
  const llamadas = await prepararPanel(page);
  await page.goto('/admin/ajustes');

  await page.getByLabel(T.panelAjustes.accesoDe('secretaria@example.org')).click();
  await expect
    .poll(() => llamadaA(llamadas, 'fn_gestionar_administrador'))
    .toEqual({ email: 'secretaria@example.org', activo: true });

  const parametros = page.getByRole('region').filter({ hasText: T.panelAjustes.parametros }).first();
  await expect(parametros.getByRole('button', { name: T.panel.guardarCambios })).toBeDisabled();
  await parametros.getByLabel(T.panelAjustes.mesesRevision).fill('18');
  await parametros.getByRole('button', { name: T.panel.guardarCambios }).click();
  await expect.poll(() => llamadaA(llamadas, 'fn_guardar_config')).toEqual({ cambios: { meses_revision: 18 } });

  const nucleos = page.getByRole('region').filter({ hasText: T.panelAjustes.nucleos }).first();
  await nucleos.getByRole('button', { name: T.panelAjustes.renombrar }).first().click();
  await nucleos.getByLabel(T.panelAjustes.nombreDe('Albolote')).fill('Albolote centro');
  await nucleos.getByRole('button', { name: T.panel.guardarCambios }).click();
  await expect
    .poll(() => llamadaA(llamadas, 'fn_renombrar_nucleo'))
    .toEqual({ nombre_actual: 'Albolote', nombre_nuevo: 'Albolote centro' });
});

// docs/18 GM-01: el tramo de manguera se ajusta entre 10 y 30 m (FR-142).
test('ajustes: el tramo de manguera se guarda y fuera de 10–30 no deja guardar (FR-142)', async ({ page }) => {
  const llamadas = await prepararPanel(page);
  await page.goto('/admin/ajustes');
  const parametros = page.getByRole('region').filter({ hasText: T.panelAjustes.parametros }).first();
  const tramo = parametros.getByLabel(T.panelAjustes.metrosTramo);
  await expect(tramo).toHaveValue('20');
  await tramo.fill('40');
  await expect(parametros.getByText(T.panelAjustes.fueraDeRango(T.panelAjustes.metrosTramo))).toBeVisible();
  await expect(parametros.getByRole('button', { name: T.panel.guardarCambios })).toBeDisabled();
  await tramo.fill('25');
  await parametros.getByRole('button', { name: T.panel.guardarCambios }).click();
  await expect.poll(() => llamadaA(llamadas, 'fn_guardar_config')).toEqual({ cambios: { metros_tramo_manguera: 25 } });
});

// docs/31 RV-167: los radios se escriben como texto y se leen al salir. Antes se re-formateaban en
// cada tecla: "5,5" se quedaba en "5" y no se podía añadir un quinto valor.
test('ajustes: los radios del marcador se escriben libres y se validan al salir (RV-167)', async ({ page }) => {
  const llamadas = await prepararPanel(page);
  await page.goto('/admin/ajustes');
  const parametros = page.getByRole('region').filter({ hasText: T.panelAjustes.parametros }).first();
  const radios = parametros.getByLabel(T.panelAjustes.radiosMarcador);
  const guardar = parametros.getByRole('button', { name: T.panel.guardarCambios });
  await expect(radios).toHaveValue('11 · 9 · 7 · 5,5 · 5');

  // Escribir tecla a tecla: lo escrito se queda tal cual.
  await radios.fill('');
  await radios.pressSequentially('11 · 9');
  await expect(radios).toHaveValue('11 · 9');
  await radios.blur();
  await expect(parametros.getByText(T.panelAjustes.radiosInvalidos).first()).toBeVisible();
  await expect(radios).toHaveAttribute('aria-invalid', 'true');
  await expect(guardar).toBeDisabled();

  // Corregido sin salir del campo, Guardar ya responde: el motivo habla de lo que se ve.
  await radios.fill('');
  await radios.pressSequentially('12 · 9 · 7 · 5,5 · 4');
  await expect(radios).toHaveValue('12 · 9 · 7 · 5,5 · 4');
  await expect(guardar).toBeEnabled();
  await expect(parametros.getByText(T.panelAjustes.radiosInvalidos)).toHaveCount(0);
  await guardar.click();
  await expect(radios).not.toHaveAttribute('aria-invalid', 'true');
  await expect
    .poll(() => llamadaA(llamadas, 'fn_guardar_config'))
    .toEqual({ cambios: { escala_radios: [12, 9, 7, 5.5, 4] } });
});

// docs/31 RV-167: con la lista sin cargar, Administradores y Núcleos se quedaban en «Cargando…».
test('ajustes: si no cargan Administradores ni Núcleos, lo dicen y dejan reintentar (RV-167)', async ({ page }) => {
  await prepararPanel(page);
  let fallan = true;
  await page.route(/\/rest\/v1\/(administradores|nucleos)\?/, (r) =>
    fallan
      ? r.fulfill({
          status: 500,
          contentType: 'application/json',
          body: '{"message":"caído"}',
          headers: { 'Access-Control-Allow-Origin': '*' },
        })
      : r.fallback(),
  );
  await page.goto('/admin/ajustes');
  for (const [titulo, fila] of [
    [T.panelAjustes.administradores, 'jefe@example.org'],
    [T.panelAjustes.nucleos, 'Pretel'],
  ] as const) {
    const tarjeta = page.getByRole('region', { name: titulo, exact: true });
    const error = tarjeta.getByRole('alert');
    await expect(error).toContainText(T.panelErrores.sinServidor);
    await expect(tarjeta.getByText(T.panelCola.cargando)).toHaveCount(0);
    fallan = false;
    await error.getByRole('button', { name: T.mapa.reintentar }).click();
    await expect(tarjeta.getByText(fila).first()).toBeVisible();
    await expect(tarjeta.getByRole('alert')).toHaveCount(0);
    fallan = true;
  }
});

test('ajustes: salud, mantenimiento, QR y novedades (FR-143–FR-145, FR-162, FR-165, FR-167)', async ({ page }) => {
  await prepararPanel(page);
  await page.goto('/admin/ajustes');
  const salud = page.getByRole('region').filter({ hasText: T.panel.saludSistema }).first();
  await expect(salud.getByText('112,0 MB')).toBeVisible();
  await expect(salud.getByText('61')).toBeVisible();
  // El JSON del inventario está ahora en Inventario → Exportar (docs/33 RV-335).
  await expect(salud.getByRole('button')).toHaveCount(0);

  // docs/31 RV-146 y RV-167: el panel deja un pedido; el aviso lo dice así.
  const pedido = page.waitForRequest((r) => r.url().includes('/api/lanzar-workflow') && r.method() === 'POST');
  await page.getByRole('button', { name: T.panel.regenerarZona }).click();
  expect((await pedido).postDataJSON()).toEqual({ workflow: 'regenerar-zona' });
  await expect(
    page.getByRole('status').filter({ hasText: T.panelAjustes.trabajoPedido(T.panel.regenerarZona) }),
  ).toBeVisible();

  // FR-144: la purga de fotos huérfanas y el respaldo trabajan contra producción: este build es de
  // staging (VITE_ENTORNO), así que salen deshabilitados con su motivo y no se piden (RV-167).
  for (const nombre of [T.panel.purgarFotos, T.panel.respaldoAhora]) {
    const boton = page.getByRole('button', { name: nombre });
    await expect(boton).toBeDisabled();
    await expect(boton).toHaveAccessibleDescription(T.panelAjustes.soloEnProduccion);
  }

  // Las novedades salen del build, no de fn_novedades (RV-20): sin simular la RPC, se ven igual.
  // Cada línea lleva su propio número, no el de la última versión (docs/23 RV-95).
  const novedades = page.getByRole('region', { name: T.panelAjustes.novedades, exact: true });
  for (const l of NOVEDADES.lineas) {
    await expect(novedades.getByRole('listitem').filter({ hasText: l.texto })).toHaveText(`${l.version} · ${l.texto}`);
  }

  await page.getByRole('button', { name: T.panelAjustes.imprimirA4 }).click();
  await expect(page.getByText(T.panelAjustes.escaneaParaInstalar)).toBeVisible();
  await page.locator('.hoja-campo').getByRole('button', { name: T.panelAjustes.cerrarHoja, exact: true }).click();
  await expect(page.getByText(T.panelAjustes.escaneaParaInstalar)).toHaveCount(0);
});

test('ajustes: sin token de GitHub, el mantenimiento lo dice (FR-165, UI-04)', async ({ page }) => {
  await prepararPanel(page, { conDispatch: false });
  await page.goto('/admin/ajustes');
  await page.getByRole('button', { name: T.panel.regenerarMapaBase }).click();
  await expect(page.getByRole('alert').filter({ hasText: T.panelErrores.noConfigurado })).toBeVisible();
});

test('Salud del sistema enseña la base de datos y las tareas programadas (RV-22, TR-53, TR-54)', async ({ page }) => {
  await prepararPanel(page);
  await page.goto('/admin/ajustes');
  const salud = page.getByRole('region').filter({ hasText: T.panel.saludSistema }).first();
  await expect(salud.getByText(T.panelAjustes.espacioDe('38', '500'))).toBeVisible();
  // Con su nombre en palabras; «Borrar errores viejos» y «Resumen semanal» ya no salen (docs/33 RV-335).
  const tareas = salud.getByTestId('tareas-programadas');
  await expect(tareas.getByRole('listitem')).toHaveCount(2);
  await expect(tareas).not.toContainText('purgar_errores');
  await expect(tareas).not.toContainText('resumen_semanal');
  await expect(
    tareas.getByRole('listitem').filter({ hasText: T.panelAjustes.nombresTareas.hidrantes_purgar_subidas }),
  ).toContainText(/falló o va con retraso/);
  await expect(
    tareas.getByRole('listitem').filter({ hasText: T.panelAjustes.nombresTareas.hidrantes_revocar_tokens }),
  ).toContainText(T.panelAjustes.tareaFalta);
});

// docs/20 RV-78: en staging no se hacen respaldos (solo de producción). "todavía ninguno" se leía
// como un fallo y tapaba los problemas de verdad del piloto. Los e2e se construyen con
// VITE_ENTORNO=staging (playwright.config.ts).
test('en staging, el texto del respaldo no aplica (RV-78)', async ({ page }) => {
  await prepararPanel(page, { salud: { ...SALUD, ultimo_respaldo: null } });
  await page.goto('/admin/ajustes');
  const salud = page.getByRole('region').filter({ hasText: T.panel.saludSistema }).first();
  const fila = salud
    .locator('div')
    .filter({ has: page.getByText(T.panelAjustes.ultimoRespaldo, { exact: true }) })
    .last();
  await expect(fila).toContainText(T.panelAjustes.respaldoNoAplica);
  await expect(fila).not.toContainText(T.panelAjustes.nunca);
});

// docs/23 RV-98: la purga de fotos solo mide producción; en staging, "sin dato" parecía una avería.
test('en staging, el almacenamiento sin dato dice que no se mide en pruebas (RV-98)', async ({ page }) => {
  await prepararPanel(page, { salud: { ...SALUD, storage_bytes: null } });
  await page.goto('/admin/ajustes');
  const salud = page.getByRole('region').filter({ hasText: T.panel.saludSistema }).first();
  const fila = salud
    .locator('div')
    .filter({ has: page.getByText(T.panelAjustes.fotos, { exact: true }) })
    .last();
  await expect(fila).toContainText(T.panelAjustes.almacenamientoNoAplica);
  await expect(fila).not.toContainText(T.panelAjustes.sinDato);
});

// docs/22 RV-92, RV-93 y RV-94: de dónde salen las tareas, la vigilancia de más de 26 h y el bucket vacío.
test.describe('Salud del sistema: tareas en vivo o de la vigilancia (RV-92)', () => {
  const haceH = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
  const filaDe = (page: Page, titulo: string) =>
    page
      .getByRole('region')
      .filter({ hasText: T.panel.saludSistema })
      .first()
      .locator('div')
      .filter({ has: page.getByText(titulo, { exact: true }) })
      .last();

  test('en vivo dice "Ahora mismo" y una vigilancia de hace 13 h no se marca', async ({ page }) => {
    await prepararPanel(page, { salud: { ...SALUD, tareas_origen: 'en_vivo', ultima_vigilancia: haceH(13) } });
    await page.goto('/admin/ajustes');
    await expect(page.getByTestId('origen-tareas')).toHaveText(T.panelAjustes.tareasAhora);
    const vigilancia = filaDe(page, T.panelAjustes.ultimaVigilancia).locator('dd');
    await expect(vigilancia).toContainText('hace 13 h');
    await expect(vigilancia).not.toHaveAttribute('data-aviso');
    await expect(vigilancia).not.toContainText(T.panelAjustes.vigilanciaAtrasada);
  });

  test('de la vigilancia dice de cuándo es, y una vigilancia de 27 h va en tono de aviso', async ({ page }, info) => {
    await prepararPanel(page, {
      salud: {
        ...SALUD,
        tareas_origen: 'vigilancia',
        tareas_medidas_en: haceH(13),
        tareas_error: '42501',
        ultima_vigilancia: haceH(27),
        storage_bytes: 0,
      },
    });
    await page.goto('/admin/ajustes');
    await expect(page.getByTestId('origen-tareas')).toHaveText(T.panelAjustes.tareasSegunVigilancia('hace 13 h'));
    const vigilancia = filaDe(page, T.panelAjustes.ultimaVigilancia).locator('dd');
    await expect(vigilancia).toHaveAttribute('data-aviso', 'true');
    await expect(vigilancia).toContainText(T.panelAjustes.vigilanciaAtrasada);
    // El SQLSTATE es para diagnóstico: no se enseña (UI-13).
    await expect(page.getByRole('region').filter({ hasText: T.panel.saludSistema }).first()).not.toContainText('42501');
    // Con el bucket vacío, 0 es un dato (RV-94).
    await expect(filaDe(page, T.panelAjustes.fotos).locator('dd')).toHaveText('0,0 MB');
    // Para revisarla una persona (revisar-pantallas).
    const salud = page.getByRole('region').filter({ hasText: T.panel.saludSistema }).first();
    const captura = info.outputPath('salud-vigilancia.png');
    await salud.screenshot({ path: captura });
    await info.attach('salud-vigilancia', { path: captura, contentType: 'image/png' });
  });
});

// ---------- docs/32: Ajustes sin errores silenciosos ----------

const caido = {
  status: 500,
  contentType: 'application/json',
  body: '{"message":"caído"}',
  headers: { 'Access-Control-Allow-Origin': '*' },
};
const tarjetaDe = (page: Page, titulo: string) => page.getByRole('region', { name: titulo, exact: true });

// RV-257: antes, los campos enseñaban los valores por defecto y se podían editar; al guardar,
// todo lo que difería de esos valores (y no de lo guardado) viajaba como cambio.
test('Parámetros: deshabilitados hasta cargar; con error, el motivo y Reintentar (docs/32 RV-257)', async ({
  page,
}) => {
  const llamadas = await prepararPanel(page);
  let soltar = () => {};
  const espera = new Promise<void>((ok) => (soltar = ok));
  let falla = false;
  await page.route(/\/rest\/v1\/config\?.*meses_revision/, async (r) => {
    await espera;
    if (falla) return r.fulfill(caido);
    // Lo guardado no es lo de por defecto: 6 meses, 45 días.
    return r.fulfill({
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(
        CONFIG.filter((c) => !c.clave.startsWith('codigo_acceso')).map((c) =>
          c.clave === 'meses_revision' ? { ...c, valor: 6 } : c.clave === 'dias_papelera' ? { ...c, valor: 45 } : c,
        ),
      ),
    });
  });
  await page.goto('/admin/ajustes');
  const parametros = tarjetaDe(page, T.panelAjustes.parametros);
  const meses = parametros.getByLabel(T.panelAjustes.mesesRevision);
  const guardar = parametros.getByRole('button', { name: T.panel.guardarCambios });
  await expect(parametros.getByText(T.panelCola.cargando).first()).toBeVisible();
  await expect(meses).toBeDisabled();
  await expect(meses).toHaveValue('');
  await expect(parametros.getByLabel(T.panelAjustes.radiosMarcador)).toBeDisabled();
  await expect(guardar).toBeDisabled();

  soltar();
  await expect(meses).toBeEnabled();
  await expect(meses).toHaveValue('6');
  await meses.fill('18');
  await guardar.click();
  // Solo lo tocado: ni los días de papelera (45 frente a 30 por defecto) ni nada más.
  await expect.poll(() => llamadaA(llamadas, 'fn_guardar_config')).toEqual({ cambios: { meses_revision: 18 } });

  // Sin poder cargar: el motivo y Reintentar, los campos sin tocar.
  falla = true;
  await page.reload();
  const error = tarjetaDe(page, T.panelAjustes.parametros).getByRole('alert');
  await expect(error).toContainText(T.panelErrores.sinServidor);
  await expect(meses).toBeDisabled();
  falla = false;
  await error.getByRole('button', { name: T.mapa.reintentar }).click();
  await expect(meses).toHaveValue('6');
  await expect(tarjetaDe(page, T.panelAjustes.parametros).getByRole('alert')).toHaveCount(0);
});

// RV-261: el código que no carga ya no es «—», y sin poder contar los móviles no se dice «0».
test('Código de acceso: lo que no carga se dice, con Reintentar (docs/32 RV-261)', async ({ page }) => {
  await prepararPanel(page);
  let falla = true;
  await page.route(/\/rest\/v1\/config\?.*codigo_acceso/, (r) => (falla ? r.fulfill(caido) : r.fallback()));
  await page.route(/\/rest\/v1\/dispositivos\?/, (r) => r.fulfill(caido));
  await page.goto('/admin/ajustes');
  const tarjeta = tarjetaDe(page, T.panelAjustes.codigoAcceso);
  const error = tarjeta.getByRole('alert');
  await expect(error).toContainText(T.panelAjustes.codigoNoCarga);
  await expect(tarjeta).not.toContainText('—');
  await expect(tarjeta.getByText(T.panelAjustes.sinCambiosSinCuenta)).toBeVisible();
  falla = false;
  await error.getByRole('button', { name: T.mapa.reintentar }).click();
  await tarjeta.getByRole('button', { name: T.panelAjustes.ver }).click();
  await expect(tarjeta.getByText('482917')).toBeVisible();

  // La ventana de revocar dice que no se sabe cuántos, y deja seguir.
  await tarjeta.getByLabel(T.panel.revocarTodos).check();
  await tarjeta.getByRole('button', { name: T.panel.generarNuevo }).click();
  const dialogo = page.getByRole('dialog');
  await expect(dialogo.getByText(T.panelAjustes.avisoRevocandoSinCuenta)).toBeVisible();
  await expect(dialogo.getByRole('button', { name: T.panelAjustes.confirmarCodigo })).toBeEnabled();
});

// RV-260 y RV-224: en staging, el pedido queda anotado y nadie lo lanza; el aviso no promete minutos.
test('Mantenimiento en staging: «queda anotado» (docs/32 RV-260)', async ({ page }) => {
  await prepararPanel(page);
  await page.route('**/api/lanzar-workflow', (r) =>
    r.fulfill({
      contentType: 'application/json',
      status: 202,
      body: '{"pedido":true,"workflow":"regenerar-zona","staging":true}',
    }),
  );
  await page.goto('/admin/ajustes');
  await page.getByRole('button', { name: T.panel.regenerarZona }).click();
  await expect(
    page.getByRole('status').filter({ hasText: T.panelAjustes.trabajoAnotadoStaging(T.panel.regenerarZona) }),
  ).toBeVisible();
  await expect(page.getByText(T.panelAjustes.trabajoPedido(T.panel.regenerarZona))).toHaveCount(0);
});

// RV-263: la hoja A4 del QR es una ventana: rol, foco dentro, Tab no sale y el foco vuelve al cerrar.
test('Hoja A4 del QR: ventana modal con el foco dentro (docs/32 RV-263)', async ({ page }) => {
  await prepararPanel(page);
  await page.goto('/admin/ajustes');
  const abrir = page.getByRole('button', { name: T.panelAjustes.imprimirA4 });
  await abrir.click();
  const hoja = page.getByRole('dialog', { name: T.panelAjustes.imprimirA4 });
  await expect(hoja).toHaveAttribute('aria-modal', 'true');
  await expect(hoja.getByRole('button', { name: T.panelAjustes.imprimir })).toBeFocused();
  // Lo de detrás queda inert: Tab va de un botón a otro de la hoja y, como mucho, pasa por el
  // navegador (body); nunca llega al panel.
  const sitios: string[] = [];
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    sitios.push(
      await hoja.evaluate((el) => {
        const a = document.activeElement;
        return !a || a === document.body ? 'body' : el.contains(a) ? 'hoja' : 'fuera';
      }),
    );
  }
  expect(sitios).not.toContain('fuera');
  expect(sitios).toContain('hoja');
  await expect(page.locator('#raiz')).toHaveAttribute('inert', '');
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(violations.flatMap((v) => v.nodes.map((n) => `${v.id} · ${n.target.join(' ')}`))).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(hoja).toHaveCount(0);
  await expect(abrir).toBeFocused();
});

// ---------- docs/32 oleada 2 (0041) ----------

const MB = 1024 ** 2;
const SALUD_0041 = {
  ...SALUD,
  fotos_bytes: 200 * MB,
  fotos_origen: 'storage',
  reservas_abiertas: 6,
  max_bytes_fotos: 800 * MB,
  fotos_pct: 72.4,
  max_bytes_bd: 400 * MB,
  bd_pct: 9.5,
  reservas_dispositivos_24h: [
    { dispositivo: 'abcd1234', reservas: 37, abiertas: 4, revocado: false },
    { dispositivo: 'ef567890', reservas: 12, abiertas: 0, revocado: true },
  ],
};

// RV-262: el espacio de fotos y de la base de datos con su tope, y revocar el móvil que más pide.
test('Salud: espacio de fotos y de la base, y «Revocar este móvil» (docs/32 RV-262)', async ({ page }) => {
  const llamadas = await prepararPanel(page, { salud: SALUD_0041 });
  await page.goto('/admin/ajustes');
  const salud = tarjetaDe(page, T.panel.saludSistema);
  await expect(salud.getByText(T.panelAjustes.espacioDe('200', '800'))).toBeVisible();
  // La base de datos, con lo que ocupa el esquema (docs/33 RV-301, RV-335).
  await expect(salud.getByText(T.panelAjustes.espacioDe('3', '400'))).toBeVisible();
  // Al 72 %, el aviso del tope (no el del gigabyte).
  await expect(salud.getByRole('status').filter({ hasText: T.panelAjustes.espacioFotosLleno(72) })).toBeVisible();

  const moviles = salud.getByTestId('reservas-moviles');
  await expect(moviles.getByRole('listitem')).toHaveCount(2);
  await expect(moviles.getByRole('listitem').nth(0)).toContainText(T.panelAjustes.reservasDetalle(37, 4));
  await expect(moviles.getByRole('listitem').nth(1)).toContainText(T.panelAjustes.movilRevocado);
  await expect(moviles.getByRole('button')).toHaveCount(1);

  await moviles.getByRole('button', { name: T.panelAjustes.revocarMovilDe('abcd1234') }).click();
  const dialogo = page.getByRole('dialog');
  await expect(dialogo.getByText(T.panelAjustes.avisoRevocarMovil('abcd1234'))).toBeVisible();
  await dialogo.getByRole('button', { name: T.panelAjustes.confirmarRevocarMovil, exact: true }).click();
  await expect.poll(() => llamadaA(llamadas, 'fn_revocar_dispositivo')).toEqual({ dispositivo: 'abcd1234' });
  await expect(
    page.getByRole('status').filter({ hasText: T.panelAjustes.movilRevocadoAviso('abcd1234') }),
  ).toBeVisible();
  await expect(dialogo).toHaveCount(0);
});

test('Salud: si no se puede revocar, lo dice y la ventana sigue abierta (docs/32 RV-262)', async ({ page }) => {
  await prepararPanel(page, { salud: SALUD_0041 });
  await page.route(`${SUPABASE_PRUEBAS}/rest/v1/rpc/fn_revocar_dispositivo`, (r) =>
    r.fulfill({
      status: 400,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ code: 'P0001', message: 'DISPOSITIVO_NO_ENCONTRADO: No hay ningún móvil' }),
    }),
  );
  await page.goto('/admin/ajustes');
  const salud = tarjetaDe(page, T.panel.saludSistema);
  await salud.getByRole('button', { name: T.panelAjustes.revocarMovilDe('abcd1234') }).click();
  const dialogo = page.getByRole('dialog');
  const confirmar = dialogo.getByRole('button', { name: T.panelAjustes.confirmarRevocarMovil, exact: true });
  await confirmar.click();
  await expect(page.getByText(T.panelErrores.dispositivoNoEncontrado)).toBeVisible();
  await expect(dialogo).toBeVisible();
  await expect(confirmar).toBeEnabled();
  await expect(page.getByText(T.panelAjustes.movilRevocadoAviso('abcd1234'))).toHaveCount(0);
});

test('Salud: sin móviles con fotos pedidas, lo dice (docs/32 RV-262)', async ({ page }) => {
  await prepararPanel(page, { salud: { ...SALUD_0041, reservas_dispositivos_24h: [] } });
  await page.goto('/admin/ajustes');
  await expect(tarjetaDe(page, T.panel.saludSistema).getByText(T.panelAjustes.reservasVacio)).toBeVisible();
});

// ---------- docs/33 RV-335 (U13): Salud del sistema en palabras ----------

test.describe('Salud del sistema en palabras (docs/33 RV-335)', () => {
  const haceH = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
  const BIEN = {
    ...SALUD_0041,
    fotos_bytes: 112 * MB,
    fotos_pct: 14,
    esquema_bytes: 38 * MB,
    ultimo_respaldo: haceH(20),
    ultima_vigilancia: haceH(1),
    tareas: [
      { tarea: 'hidrantes_purgar_papelera', ultima: haceH(6), fallo: false, problema: false },
      { tarea: 'hidrantes_resumen_semanal', ultima: null, fallo: false, problema: false },
    ],
  };

  test('«Todo bien» arriba y lo que queda, con nombres en palabras', async ({ page }, info) => {
    await prepararPanel(page, { salud: BIEN });
    await page.goto('/admin/ajustes');
    const salud = tarjetaDe(page, T.panel.saludSistema);
    await expect(salud.getByTestId('resumen-salud')).toHaveText(T.panelAjustes.todoBien);
    await expect(salud.locator('dl > div > dt')).toHaveText([
      T.panelAjustes.fotos,
      T.panelAjustes.baseDeDatos,
      T.panelAjustes.ultimoRespaldo,
      T.panelAjustes.ultimaVigilancia,
      T.panelAjustes.errores7,
      T.panelAjustes.dispositivosActivos,
      T.panelAjustes.intentosFallidos24h,
      T.panelAjustes.zonaYMapaBase,
      // Debajo, las tareas (TR-54) y los móviles con más fotos pedidas (RV-262).
      new RegExp(`^${T.panelAjustes.tareasProgramadas}`),
      T.panelAjustes.reservasPorMovil,
    ]);
    await expect(salud.getByText(T.panelAjustes.espacioDe('112', '800'))).toBeVisible();
    await expect(salud.getByTestId('barra-espacio')).toHaveCount(2);
    await expect(salud.getByText('14 jul 2026')).toBeVisible();
    // Fuera (indicación del desarrollador): las tareas siguen funcionando, solo no salen aquí.
    for (const fuera of [/Propuestas pendientes/, /Puntos sin dirección/, /Resumen semanal/, /Borrar errores/]) {
      await expect(salud).not.toContainText(fuera);
    }
    const tareas = salud.getByTestId('tareas-programadas').getByRole('listitem');
    await expect(tareas).toHaveCount(1);
    await expect(tareas).toContainText(T.panelAjustes.nombresTareas.hidrantes_purgar_papelera);
    const captura = info.outputPath('salud-todo-bien.png');
    await salud.screenshot({ path: captura });
    await info.attach('salud-todo-bien', { path: captura, contentType: 'image/png' });
  });

  test('lo que necesita atención, arriba y en tono de aviso', async ({ page }, info) => {
    await prepararPanel(page, {
      salud: {
        ...BIEN,
        fotos_pct: 72.4,
        esquema_bytes: 300 * MB,
        bd_pct: 75,
        ultima_vigilancia: haceH(30),
        tareas: [{ tarea: 'hidrantes_purgar_subidas', ultima: haceH(50), fallo: true, problema: true }],
      },
    });
    await page.goto('/admin/ajustes');
    const salud = tarjetaDe(page, T.panel.saludSistema);
    const resumen = salud.getByTestId('resumen-salud');
    await expect(resumen).toHaveAttribute('role', 'status');
    await expect(resumen.getByRole('listitem')).toHaveText([
      T.panelAjustes.atencionVigilancia,
      T.panelAjustes.espacioFotosLleno(72),
      T.panelAjustes.atencionBaseDeDatos(75),
      T.panelAjustes.atencionTarea(T.panelAjustes.nombresTareas.hidrantes_purgar_subidas),
    ]);
    await expect(resumen).not.toContainText(T.panelAjustes.todoBien);
    const captura = info.outputPath('salud-atencion.png');
    await salud.screenshot({ path: captura });
    await info.attach('salud-atencion', { path: captura, contentType: 'image/png' });
  });

  test('sin los datos nuevos de la base, no rompe', async ({ page }) => {
    await prepararPanel(page, {
      salud: { ...SALUD, ultima_vigilancia: haceH(1), tareas: null, intentos_fallidos_24h: undefined },
    });
    await page.goto('/admin/ajustes');
    const salud = tarjetaDe(page, T.panel.saludSistema);
    await expect(salud.getByTestId('resumen-salud')).toHaveText(T.panelAjustes.todoBien);
    await expect(salud.getByText('112,0 MB')).toBeVisible();
    await expect(salud.getByTestId('barra-espacio')).toHaveCount(1);
  });
});

// RV-260: los últimos pedidos con su estado; el error, con su texto.
test('Mantenimiento: los últimos pedidos y qué ha pasado (docs/32 RV-260)', async ({ page }) => {
  const hace = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
  await prepararPanel(page, {
    pedidos: [
      { id: 3, workflow: 'regenerar-zona', pedido_en: hace(2), lanzado_en: null, estado: 'pedido', resultado: null },
      {
        id: 2,
        workflow: 'regenerar-mapabase',
        pedido_en: hace(90),
        lanzado_en: hace(85),
        estado: 'lanzado',
        resultado: 'lanzado',
      },
      {
        id: 1,
        workflow: 'respaldo',
        pedido_en: hace(3000),
        lanzado_en: hace(1500),
        estado: 'error',
        resultado: 'error: caducado',
      },
    ],
  });
  await page.goto('/admin/ajustes');
  const lista = tarjetaDe(page, T.panelAjustes.mantenimiento).getByTestId('pedidos-recientes');
  const filas = lista.getByRole('listitem');
  await expect(filas).toHaveCount(3);
  await expect(filas.nth(0)).toContainText(T.panel.regenerarZona);
  await expect(filas.nth(0)).toContainText(T.panelAjustes.pedidoPendiente);
  await expect(filas.nth(1)).toContainText(T.panelAjustes.pedidoLanzado);
  await expect(filas.nth(2)).toContainText(T.panel.respaldoAhora);
  await expect(filas.nth(2)).toContainText(T.panelAjustes.pedidoError('caducado'));
});

test('Mantenimiento: sin pedidos, el estado vacío; si no cargan, el error y Reintentar (docs/32 RV-260)', async ({
  page,
}) => {
  await prepararPanel(page);
  let falla = true;
  await page.route(`${SUPABASE_PRUEBAS}/rest/v1/rpc/fn_pedidos_recientes`, (r) =>
    falla ? r.fulfill(caido) : r.fallback(),
  );
  await page.goto('/admin/ajustes');
  const tarjeta = tarjetaDe(page, T.panelAjustes.mantenimiento);
  const error = tarjeta.getByRole('alert');
  await expect(error).toContainText(T.panelErrores.sinServidor);
  await expect(tarjeta.getByText(T.panelAjustes.pedidosVacio)).toHaveCount(0);
  falla = false;
  await error.getByRole('button', { name: T.mapa.reintentar }).click();
  await expect(tarjeta.getByText(T.panelAjustes.pedidosVacio)).toBeVisible();
});

// ---------- docs/33 RV-338: la entrada del día del lanzamiento ----------

test.describe('La entrada del día del lanzamiento (docs/33 RV-338)', () => {
  const seccion = (page: Page) =>
    tarjetaDe(page, T.panelAjustes.codigoAcceso).getByRole('region', { name: T.panelAjustes.entrada });

  test('abrir y cerrar la entrada desde Código de acceso', async ({ page }) => {
    const llamadas = await prepararPanel(page, { entrada: null });
    await page.goto('/admin/ajustes');
    const entrada = seccion(page);
    const abrir = entrada.getByRole('button', { name: T.panelAjustes.abrirEntrada });
    await expect(abrir).toHaveAccessibleDescription(T.panelAjustes.explicaEntrada);
    await abrir.click();
    await expect.poll(() => llamadaA(llamadas, 'fn_abrir_entrada')).toEqual({ horas: 24 });
    const franja = entrada.getByText(/^Entrada abierta para todos hasta el \S+ \d+ a las \d\d:\d\d$/);
    await expect(franja).toBeVisible();
    await expect(abrir).toHaveCount(0);
    await entrada.getByRole('button', { name: T.panelAjustes.cerrarAhora }).click();
    await expect.poll(() => llamadas.some((l) => l.nombre === 'fn_cerrar_entrada')).toBe(true);
    await expect(page.getByRole('status').filter({ hasText: T.panelAjustes.entradaCerrada })).toBeVisible();
    await expect(entrada.getByRole('button', { name: T.panelAjustes.abrirEntrada })).toBeVisible();
  });

  test('abierta al cargar: la franja verde con «Cerrar ahora»', async ({ page }, info) => {
    await prepararPanel(page, { entrada: new Date(Date.now() + 5 * 3_600_000).toISOString() });
    await page.goto('/admin/ajustes');
    const entrada = seccion(page);
    await expect(entrada.getByText(/^Entrada abierta para todos hasta el /)).toBeVisible();
    await expect(entrada.getByRole('button', { name: T.panelAjustes.cerrarAhora })).toBeVisible();
    const captura = info.outputPath('entrada-abierta.png');
    await tarjetaDe(page, T.panelAjustes.codigoAcceso).screenshot({ path: captura });
    await info.attach('entrada-abierta', { path: captura, contentType: 'image/png' });
  });

  test('una hora ya pasada es entrada cerrada', async ({ page }) => {
    await prepararPanel(page, { entrada: new Date(Date.now() - 3_600_000).toISOString() });
    await page.goto('/admin/ajustes');
    await expect(seccion(page).getByRole('button', { name: T.panelAjustes.abrirEntrada })).toBeVisible();
  });

  test('generar un código revocando todos avisa de que la entrada se abrirá 24 h', async ({ page }) => {
    await prepararPanel(page, { entrada: null });
    await page.goto('/admin/ajustes');
    const tarjeta = tarjetaDe(page, T.panelAjustes.codigoAcceso);
    await expect(seccion(page).getByRole('button', { name: T.panelAjustes.abrirEntrada })).toBeVisible();
    // Sin revocar, la confirmación no lo dice.
    await tarjeta.getByRole('button', { name: T.panel.generarNuevo }).click();
    await expect(page.getByRole('dialog').getByText(T.panelAjustes.avisoEntradaAlRevocar)).toHaveCount(0);
    await page.getByRole('dialog').getByRole('button', { name: T.panelCola.cancelar }).click();
    await tarjeta.getByLabel(T.panel.revocarTodos).check();
    await tarjeta.getByRole('button', { name: T.panel.generarNuevo }).click();
    const dialogo = page.getByRole('dialog');
    await expect(dialogo.getByText(T.panelAjustes.avisoEntradaAlRevocar)).toBeVisible();
    await dialogo.getByRole('button', { name: T.panelAjustes.confirmarCodigo }).click();
    // Después, la sección dice que está abierta (la abrió el servidor).
    await expect(seccion(page).getByText(/^Entrada abierta para todos hasta el /)).toBeVisible();
  });

  test('los dos topes de entradas en Parámetros, con sus rangos', async ({ page }) => {
    const llamadas = await prepararPanel(page, { entrada: null });
    await page.goto('/admin/ajustes');
    const tarjeta = tarjetaDe(page, T.panelAjustes.parametros);
    const wifi = tarjeta.getByLabel(T.panelAjustes.altasIpDia);
    const hora = tarjeta.getByLabel(T.panelAjustes.altasGlobalHora);
    // Sin su fila en config, los de 0041 (lo que aplica el servidor).
    await expect(wifi).toHaveValue('20');
    await expect(hora).toHaveValue('40');
    const guardar = tarjeta.getByRole('button', { name: T.panel.guardarCambios });
    await wifi.fill('4');
    await expect(guardar).toBeDisabled();
    await expect(tarjeta.getByText(T.panelAjustes.fueraDeRango(T.panelAjustes.altasIpDia))).toBeVisible();
    await wifi.fill('300');
    await hora.fill('9');
    await expect(tarjeta.getByText(T.panelAjustes.fueraDeRango(T.panelAjustes.altasGlobalHora))).toBeVisible();
    await hora.fill('200');
    await guardar.click();
    await expect
      .poll(() => llamadaA(llamadas, 'fn_guardar_config'))
      .toEqual({ cambios: { max_altas_ip_dia: 300, max_altas_global_hora: 200 } });
  });

  test('Salud: entradas frenadas con el enlace que abre la entrada', async ({ page }) => {
    const llamadas = await prepararPanel(page, {
      entrada: null,
      salud: { ...SALUD_0041, entradas_frenadas_24h: 7, ultima_vigilancia: new Date().toISOString() },
    });
    await page.goto('/admin/ajustes');
    const salud = tarjetaDe(page, T.panel.saludSistema);
    const fila = salud
      .locator('dl > div')
      .filter({ has: page.getByText(T.panelAjustes.entradasFrenadas24h, { exact: true }) });
    await expect(fila.locator('dd')).toHaveAttribute('data-aviso', 'true');
    await expect(salud.getByTestId('resumen-salud')).toContainText(T.panelAjustes.atencionFrenadas(7));
    await fila.getByRole('button', { name: T.panelAjustes.abrirEntrada24h }).click();
    await expect.poll(() => llamadaA(llamadas, 'fn_abrir_entrada')).toEqual({ horas: 24 });
    // Abierta: la fila dice hasta cuándo, sin enlace, y Código de acceso también lo sabe.
    await expect(fila.locator('dd')).toContainText(/^7 · entrada abierta hasta el /);
    await expect(fila.getByRole('button')).toHaveCount(0);
    await expect(seccion(page).getByRole('button', { name: T.panelAjustes.cerrarAhora })).toBeVisible();
  });

  test('contra una base sin 0044, nada de esto se enseña', async ({ page }) => {
    await prepararPanel(page, { salud: SALUD_0041 });
    await page.goto('/admin/ajustes');
    await expect(tarjetaDe(page, T.panel.saludSistema).getByText(T.panelAjustes.ultimoRespaldo)).toBeVisible();
    await expect(page.getByRole('region', { name: T.panelAjustes.entrada })).toHaveCount(0);
    await expect(page.getByText(T.panelAjustes.entradasFrenadas24h)).toHaveCount(0);
    await expect(page.getByRole('button', { name: T.panelAjustes.abrirEntrada24h })).toHaveCount(0);
    // Ni los topes de entradas en Parámetros: fn_guardar_config no los admitiría.
    await expect(tarjetaDe(page, T.panelAjustes.parametros).getByLabel(T.panelAjustes.mesesRevision)).toBeVisible();
    await expect(page.getByLabel(T.panelAjustes.altasIpDia)).toHaveCount(0);
    await expect(page.getByLabel(T.panelAjustes.altasGlobalHora)).toHaveCount(0);
    // La confirmación de revocar tampoco promete abrirla.
    const tarjeta = tarjetaDe(page, T.panelAjustes.codigoAcceso);
    await tarjeta.getByLabel(T.panel.revocarTodos).check();
    await tarjeta.getByRole('button', { name: T.panel.generarNuevo }).click();
    await expect(page.getByRole('dialog').getByText(T.panelAjustes.avisoEntradaAlRevocar)).toHaveCount(0);
  });

  test('si no se puede abrir, lo dice y la sección no cambia', async ({ page }) => {
    await prepararPanel(page, { entrada: null });
    await page.route(`${SUPABASE_PRUEBAS}/rest/v1/rpc/fn_abrir_entrada`, (r) =>
      r.fulfill({
        status: 400,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ code: 'P0001', message: 'NO_AUTORIZADO' }),
      }),
    );
    await page.goto('/admin/ajustes');
    const abrir = seccion(page).getByRole('button', { name: T.panelAjustes.abrirEntrada });
    await abrir.click();
    await expect(page.getByRole('alert').first()).toBeVisible();
    await expect(abrir).toBeEnabled();
    await expect(seccion(page).getByText(/^Entrada abierta para todos hasta el /)).toHaveCount(0);
  });

  test('Salud con la entrada ya abierta: hasta cuándo, sin enlace', async ({ page }) => {
    await prepararPanel(page, {
      entrada: new Date(Date.now() + 5 * 3_600_000).toISOString(),
      salud: { ...SALUD_0041, entradas_frenadas_24h: 7, ultima_vigilancia: new Date().toISOString() },
    });
    await page.goto('/admin/ajustes');
    const salud = tarjetaDe(page, T.panel.saludSistema);
    const fila = salud
      .locator('dl > div')
      .filter({ has: page.getByText(T.panelAjustes.entradasFrenadas24h, { exact: true }) });
    await expect(fila.locator('dd')).toContainText(/^7 · entrada abierta hasta el /);
    await expect(fila.getByRole('button')).toHaveCount(0);
    await expect(fila.locator('dd')).not.toHaveAttribute('data-aviso');
    await expect(salud.getByTestId('resumen-salud')).not.toContainText(T.panelAjustes.atencionFrenadas(7));
  });

  test('si no se puede saber si está abierta, lo dice con Reintentar', async ({ page }) => {
    await prepararPanel(page, { entrada: null });
    let falla = true;
    await page.route(/\/rest\/v1\/config\?.*entrada_abierta_hasta/, (r) =>
      falla
        ? r.fulfill({
            status: 500,
            contentType: 'application/json',
            body: '{"message":"caído"}',
            headers: { 'Access-Control-Allow-Origin': '*' },
          })
        : r.fallback(),
    );
    await page.goto('/admin/ajustes');
    const entrada = seccion(page);
    await expect(entrada.getByRole('alert')).toContainText(T.panelAjustes.entradaNoCarga);
    falla = false;
    await entrada.getByRole('button', { name: T.mapa.reintentar }).click();
    await expect(entrada.getByRole('button', { name: T.panelAjustes.abrirEntrada })).toBeVisible();
  });
});

// Sin sesión de administrador no se llega a Ajustes: ni la entrada ni sus topes (RV-338).
test('sin sesión de administrador, nada de la entrada (docs/33 RV-338)', async ({ page }) => {
  await conGoogle(page, 'voluntario@example.org');
  await simularTablas(page, { v_puntos_activos: PUNTOS, v_cola_revision: [], propuestas: [], config: [] });
  const llamadas: string[] = [];
  await page.route(`${SUPABASE_PRUEBAS}/rest/v1/rpc/*`, (route) => {
    const nombre = new URL(route.request().url()).pathname.split('/').pop()!;
    llamadas.push(nombre);
    if (nombre === 'fn_es_admin') return route.fulfill({ contentType: 'application/json', body: 'false' });
    return route.abort('connectionrefused');
  });
  await page.goto('/admin/ajustes');
  await expect(page.getByRole('heading', { name: T.entrada.noAutorizado })).toBeVisible();
  await expect(page.getByText(T.panelAjustes.abrirEntrada)).toHaveCount(0);
  await expect(page.getByText(T.panelAjustes.altasIpDia)).toHaveCount(0);
  expect(llamadas.filter((n) => n.includes('entrada'))).toEqual([]);
});

// docs/34 RV-355: en oscuro, «Entrada abierta» y «Todo bien» ya no son superficies claras, y la página
// pasa axe (contraste incluido) con los tintes nuevos.
test('en oscuro, la entrada abierta y «Todo bien» van en tinte oscuro y pasan axe (docs/34 RV-355)', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  const haceH = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
  await prepararPanel(page, {
    entrada: new Date(Date.now() + 5 * 3_600_000).toISOString(),
    salud: {
      ...SALUD_0041,
      fotos_bytes: 112 * MB,
      fotos_pct: 14,
      esquema_bytes: 38 * MB,
      ultimo_respaldo: haceH(20),
      ultima_vigilancia: haceH(1),
      tareas: [{ tarea: 'hidrantes_purgar_papelera', ultima: haceH(6), fallo: false, problema: false }],
    },
  });
  await page.goto('/admin/ajustes');
  const franja = page.getByText(/^Entrada abierta para todos hasta el /);
  const resumen = tarjetaDe(page, T.panel.saludSistema).getByTestId('resumen-salud');
  await expect(franja).toBeVisible();
  await expect(resumen).toHaveText(T.panelAjustes.todoBien);
  // Luminancia relativa del fondo: los -100 de antes pasaban de 0,8; los tintes oscuros no llegan a 0,05.
  const luz = (el: Element) => {
    let n: Element | null = el;
    let fondo = 'rgba(0, 0, 0, 0)';
    while (n && /rgba\(0, 0, 0, 0\)|transparent/.test(fondo)) {
      fondo = getComputedStyle(n).backgroundColor;
      n = n.parentElement;
    }
    const [r, g, b] = (fondo.match(/[\d.]+/g) ?? []).slice(0, 3).map((c) => {
      const v = Number(c) / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  expect(await franja.evaluate(luz)).toBeLessThan(0.05);
  expect(await resumen.evaluate(luz)).toBeLessThan(0.05);
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(violations.flatMap((v) => v.nodes.map((n) => `${v.id} · ${n.target.join(' ')}`))).toEqual([]);
});
