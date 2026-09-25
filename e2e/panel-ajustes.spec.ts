// Panel · voluntarios, incidencias y ajustes (FR-130–FR-132, FR-140–FR-145, FR-162–FR-167).

import { expect, test, type Page } from '@playwright/test';
import { T } from '../src/lib/textos.ts';
import { SUPABASE_PRUEBAS } from '../playwright.config.ts';
import { conGoogle, simularTablas } from './ayudas.ts';
import { PUNTOS } from './puntos.ts';
import { readFileSync } from 'node:fs';
import { novedadesDe } from '../scripts/generar-novedades.ts';

/** Lo que `npm run build` genera desde el CHANGELOG, que es lo que lleva la app probada. */
const NOVEDADES = novedadesDe(readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8'));

const ACTIVIDAD = [
  {
    autor: 'Luis Martín',
    dispositivo_id: 'd1',
    propuestas: 16,
    aprobadas: 14,
    rechazadas: 1,
    tasa: 0.93,
    ultima: '2026-09-19T08:00:00Z',
  },
  {
    autor: 'Marta León',
    dispositivo_id: 'd2',
    propuestas: 6,
    aprobadas: 4,
    rechazadas: 2,
    tasa: 0.67,
    ultima: '2026-09-18T08:00:00Z',
  },
];

const INCIDENCIAS: Record<string, unknown>[] = [
  {
    id: 'i1',
    momento: '2026-09-17T06:06:00Z',
    descripcion: 'Al hacer la foto la app se cierra',
    version_app: '1.0.3',
    ruta: '/proponer/alta',
    estado: 'abierta',
    resuelta_por: null,
    resuelta_en: null,
  },
];

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
  incidencias_abiertas: 1,
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

async function prepararPanel(page: Page, { conDispatch = true, salud = SALUD as Record<string, unknown> } = {}) {
  const llamadas: Llamada[] = [];
  let incidencias = INCIDENCIAS;
  let administradores = ADMINISTRADORES;
  await conGoogle(page, 'jefe@example.org');
  await simularTablas(page, {
    v_puntos_activos: PUNTOS,
    v_cola_revision: [],
    propuestas: [],
    puntos: [],
    incidencias_app: () => incidencias,
    config: (url) => {
      const filtro = url.searchParams.get('clave') ?? '';
      const claves = filtro.startsWith('in.') ? filtro.slice(4, -1).split(',') : null;
      return claves ? CONFIG.filter((c) => claves.includes(c.clave)) : CONFIG;
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
      case 'fn_actividad_voluntarios':
        return json(ACTIVIDAD);
      case 'fn_anonimizar_autor':
        return json(7);
      case 'fn_resolver_incidencia':
        incidencias = incidencias.map((i) => ({
          ...i,
          estado: 'resuelta',
          resuelta_por: 'jefe@example.org',
          resuelta_en: new Date().toISOString(),
        }));
        return json(null);
      case 'fn_salud':
        return json(salud);
      case 'fn_exportar_inventario':
        return json([]);
      case 'fn_gestionar_administrador':
        administradores = administradores.map((a) =>
          a.email === cuerpo.email ? { ...a, activo: cuerpo.activo as boolean } : a,
        );
        return json(null);
      case 'fn_cambiar_codigo_acceso':
      case 'fn_guardar_config':
      case 'fn_renombrar_nucleo':
        return json(null);
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

test('voluntarios: actividad, anonimizar e incidencias (FR-130–FR-132, FL-27)', async ({ page }) => {
  const llamadas = await prepararPanel(page);
  await page.goto('/admin/voluntarios');
  await expect(page.getByRole('cell', { name: 'Luis Martín' })).toBeVisible();
  await expect(page.getByText(T.panelVoluntarios.porcentaje(93))).toBeVisible();
  await expect(page.getByText(T.panelVoluntarios.convieneHablar)).toBeVisible();
  expect(llamadaA(llamadas, 'fn_actividad_voluntarios')).toEqual({ meses: 3 });

  const fila = page.getByRole('row').filter({ hasText: 'Marta León' });
  await fila.getByRole('button', { name: T.panel.anonimizar }).click();
  const dialogo = page.getByRole('dialog');
  await expect(dialogo.getByText(T.panelVoluntarios.avisoAnonimizar('Marta León'))).toBeVisible();
  await dialogo.getByRole('button', { name: T.panelVoluntarios.confirmarAnonimizar }).click();
  await expect(page.getByRole('status').filter({ hasText: T.panelVoluntarios.anonimizado(7) })).toBeVisible();
  expect(llamadaA(llamadas, 'fn_anonimizar_autor')).toEqual({ dispositivo_id: 'd2' });

  await page.getByRole('button', { name: T.panel.marcarResuelta }).click();
  await expect(page.getByRole('status').filter({ hasText: T.panelVoluntarios.incidenciaResuelta })).toBeVisible();
  expect(llamadaA(llamadas, 'fn_resolver_incidencia')).toEqual({ incidencia_id: 'i1' });
});

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

test('ajustes: salud, mantenimiento, QR y novedades (FR-143–FR-145, FR-162, FR-165, FR-167)', async ({ page }) => {
  await prepararPanel(page);
  await page.goto('/admin/ajustes');
  const salud = page.getByRole('region').filter({ hasText: T.panel.saludSistema }).first();
  await expect(salud.getByText('112,0 MB')).toBeVisible();
  await expect(salud.getByText('61')).toBeVisible();

  const descarga = page.waitForEvent('download');
  await salud.getByRole('button', { name: T.panel.descargarInventario }).click();
  expect((await descarga).suggestedFilename()).toMatch(/^hidrantes-albolote-\d{4}-\d{2}-\d{2}\.json$/);

  await page.getByRole('button', { name: T.panel.regenerarZona }).click();
  await expect(
    page.getByRole('status').filter({ hasText: T.panelAjustes.trabajoLanzado(T.panel.regenerarZona) }),
  ).toBeVisible();

  // FR-144: la purga de fotos huérfanas es un trabajo más de mantenimiento, con su aviso de que
  // tarda unos minutos y su confirmación (AC-106).
  const purga = page.waitForRequest((r) => r.url().includes('/api/lanzar-workflow') && r.method() === 'POST');
  await page.getByRole('button', { name: T.panel.purgarFotos }).click();
  expect((await purga).postDataJSON()).toEqual({ workflow: 'purgar-fotos' });
  await expect(
    page.getByRole('status').filter({ hasText: T.panelAjustes.trabajoLanzado(T.panel.purgarFotos) }),
  ).toBeVisible();

  // Las novedades salen del build, no de fn_novedades (RV-20): sin simular la RPC, se ven igual.
  // Cada línea lleva su propio número, no el de la última versión (docs/23 RV-95).
  const novedades = page.getByRole('region', { name: T.panelAjustes.novedades, exact: true });
  for (const l of NOVEDADES.lineas) {
    await expect(novedades.getByRole('listitem').filter({ hasText: l.texto })).toHaveText(`${l.version} · ${l.texto}`);
  }

  await page.getByRole('button', { name: T.panelAjustes.imprimirA4 }).click();
  await expect(page.getByText(T.panelAjustes.escaneaParaInstalar)).toBeVisible();
  await page.locator('.hoja-campo').getByRole('button', { name: T.panelCaducadas.cerrarHoja, exact: true }).click();
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
  await expect(salud.getByText(T.panelAjustes.baseDeDatosDetalle('38,0', '500,0'))).toBeVisible();
  const tareas = salud.getByTestId('tareas-programadas');
  await expect(tareas.getByText('purgar_errores')).toBeVisible();
  await expect(tareas.getByText(T.panelAjustes.tareaSinEjecutar)).toBeVisible();
  await expect(tareas.getByText(/falló o va con retraso/)).toBeVisible();
  await expect(tareas.getByRole('listitem').filter({ hasText: 'revocar_tokens' })).toContainText(
    T.panelAjustes.tareaFalta,
  );
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
    .filter({ has: page.getByText(T.panelAjustes.almacenamiento, { exact: true }) })
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
    await expect(filaDe(page, T.panelAjustes.almacenamiento).locator('dd')).toHaveText('0,0 MB');
    // Para revisarla una persona (revisar-pantallas).
    const salud = page.getByRole('region').filter({ hasText: T.panel.saludSistema }).first();
    const captura = info.outputPath('salud-vigilancia.png');
    await salud.screenshot({ path: captura });
    await info.attach('salud-vigilancia', { path: captura, contentType: 'image/png' });
  });
});
