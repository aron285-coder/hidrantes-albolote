// Panel de jefatura · cola de revisión (FL-21–FL-23, FR-100–FR-110) contra un Supabase simulado.

import { expect, test, type Page } from '@playwright/test';
import { T } from '../src/lib/textos.ts';
import { SUPABASE_PRUEBAS } from '../playwright.config.ts';
import { conGoogle, simularTablas } from './ayudas.ts';
import { PUNTOS } from './puntos.ts';

const hace = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

function fila(extra: Record<string, unknown>): Record<string, unknown> {
  return {
    estado: 'pendiente',
    autor_nombre: 'Sara',
    autor_apellido: 'Ruiz',
    dispositivo_id: 'd1',
    tipo_actual: null,
    foto_path: null,
    foto_path_actual: null,
    direccion_sugerida: null,
    direccion_actual: null,
    lat: null,
    lng: null,
    antes: null,
    despues: null,
    origen_ubicacion: null,
    precision_gps_m: null,
    distancia_gps_m: null,
    distancia_exif_m: null,
    fuera_de_zona: false,
    meses_desde_revision: null,
    duplicado_de: null,
    distancia_duplicado_m: null,
    codigo_duplicado: null,
    otra_medida: false,
    desactualizada: false,
    nucleo: 'Albolote',
    punto_actualizado_en: null,
    ...extra,
  };
}

const [P0, P1, , , P4, P5, , , P8] = PUNTOS;

function cola() {
  return [
    fila({
      id: 'c1',
      operacion: 'estado',
      creada_en: hace(2),
      punto_id: P0.id,
      codigo: P0.codigo,
      datos: { caudal: 'regular', nota: 'Sale menos fuerza' },
      antes: { caudal: 'bueno' },
      direccion_actual: P0.direccion,
      meses_desde_revision: 1,
    }),
    fila({
      id: 'c2',
      operacion: 'revision',
      creada_en: hace(5),
      punto_id: P4.id,
      codigo: P4.codigo,
      datos: {},
      autor_nombre: 'Luis',
      autor_apellido: 'Martín',
      nucleo: 'El Chaparral',
    }),
    fila({
      id: 'c3',
      operacion: 'revision',
      creada_en: hace(6),
      punto_id: P5.id,
      codigo: P5.codigo,
      datos: {},
      autor_nombre: 'Luis',
      autor_apellido: 'Martín',
      nucleo: 'El Chaparral',
    }),
    fila({
      id: 'c4',
      operacion: 'alta',
      creada_en: hace(30),
      codigo: null,
      datos: {
        tipo: 'boca_riego',
        diametro_mm: 45,
        caudal: 'regular',
        racor: 'granada',
        descripcion: 'Junto a la fuente',
      },
      lat: P8.lat + 0.00005,
      lng: P8.lng,
      origen_ubicacion: 'gps',
      precision_gps_m: 5,
      distancia_gps_m: 3,
      duplicado_de: P8.id,
      codigo_duplicado: P8.codigo,
      distancia_duplicado_m: 6,
      direccion_sugerida: 'Calle Fuente 3',
      autor_nombre: 'Javier',
      autor_apellido: 'Ortiz',
      nucleo: 'Pretel',
    }),
    fila({
      id: 'c5',
      operacion: 'alta',
      creada_en: hace(50),
      codigo: null,
      datos: { tipo: 'hidrante', diametro_otro: 80, caudal: 'bueno' },
      lat: 37.2335,
      lng: -3.651,
      origen_ubicacion: 'manual',
      distancia_gps_m: 40,
      otra_medida: true,
      autor_nombre: 'Marta',
      autor_apellido: 'León',
      nucleo: 'Parque del Cubillas',
    }),
    fila({
      id: 'c6',
      operacion: 'estado',
      creada_en: hace(96),
      punto_id: P1.id,
      codigo: P1.codigo,
      datos: { caudal: 'malo' },
      antes: { caudal: 'regular' },
      desactualizada: true,
      punto_actualizado_en: hace(20),
      autor_nombre: 'Ana',
      autor_apellido: 'García',
    }),
  ];
}

const RECHAZADAS = [
  {
    id: 'r1',
    operacion: 'revision',
    estado: 'rechazada',
    creada_en: hace(200),
    autor_nombre: 'Luis',
    autor_apellido: 'Martín',
    punto_id: P0.id,
    datos: {},
    foto_path: null,
    direccion_sugerida: null,
    motivo_rechazo: 'La foto es del hidrante de al lado',
    correcciones: null,
    revisada_por: 'jefe@example.org',
    revisada_en: hace(100),
    punto: { codigo: P0.codigo, direccion: P0.direccion, nucleo: 'Albolote' },
  },
];

interface Llamada {
  nombre: string;
  cuerpo: Record<string, unknown>;
}

/** Supabase simulado con estado: aprobar o rechazar quita la propuesta de la cola. */
async function prepararPanel(page: Page) {
  let pendientes = cola();
  const llamadas: Llamada[] = [];
  const quitar = (ids: string[]) => (pendientes = pendientes.filter((p) => !ids.includes(p.id as string)));
  await conGoogle(page, 'jefe@example.org');
  await simularTablas(page, {
    v_puntos_activos: PUNTOS,
    v_cola_revision: () => pendientes,
    propuestas: (url) => {
      const estado = url.searchParams.get('estado');
      if (estado === 'eq.rechazada') return RECHAZADAS;
      return estado === 'eq.pendiente' ? pendientes : [];
    },
  });
  await page.route(`${SUPABASE_PRUEBAS}/rest/v1/rpc/*`, async (route) => {
    const nombre = new URL(route.request().url()).pathname.split('/').pop()!;
    const cuerpo = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
    llamadas.push({ nombre, cuerpo });
    const json = (d: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(d) });
    switch (nombre) {
      case 'fn_es_admin':
        return json(true);
      case 'fn_aprobar_lote': {
        const ids = cuerpo.propuesta_ids as string[];
        quitar(ids);
        return json(ids.map((id) => ({ propuesta_id: id, resultado: 'aprobada', motivo: null })));
      }
      case 'fn_aprobar':
      case 'fn_fusionar_con_existente':
        quitar([cuerpo.propuesta_id as string]);
        return json({ punto_id: 'nuevo', codigo: 'HID-9100' });
      case 'fn_rechazar':
        quitar([cuerpo.propuesta_id as string]);
        return json(null);
      default:
        return route.abort('connectionrefused');
    }
  });
  await page.route('**/api/direccion?*', (r) =>
    r.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ direccion: 'Camino del Cubillas 2', fuente: 'nominatim' }),
    }),
  );
  return llamadas;
}

const llamadaA = (llamadas: Llamada[], nombre: string) => llamadas.find((l) => l.nombre === nombre)?.cuerpo;

async function abrir(page: Page, texto: RegExp) {
  await page.getByRole('button', { name: texto }).click();
}

test('lista, contador, filtros y búsqueda global (FR-101, FR-110, FR-145)', async ({ page }) => {
  await prepararPanel(page);
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin\/cola$/);
  await expect(page.getByRole('link', { name: `${T.panelCola.colaRevision} 6` })).toBeVisible();
  await expect(page.getByText('Sara Ruiz · hace 2 h · Calle Real 14 · Albolote')).toBeVisible();

  const lista = page.getByRole('region', { name: T.panelCola.colaRevision });
  await page.getByLabel(T.panelCola.filtroOperacion).selectOption('revision');
  await expect(lista.getByRole('listitem')).toHaveCount(2);
  await page.getByLabel(T.panelCola.filtroOperacion).selectOption('');

  await page.getByPlaceholder(T.panelCola.buscar).fill('marta');
  await expect(lista.getByRole('listitem')).toHaveCount(1);
  await page.getByPlaceholder(T.panelCola.buscar).fill('nadie');
  await expect(page.getByText(T.panelCola.busquedaVacia('nadie'))).toBeVisible();
});

test('aprobar en bloque dos revisiones (FL-22)', async ({ page }) => {
  const llamadas = await prepararPanel(page);
  await page.goto('/admin/cola');
  await page.getByLabel(T.panelCola.filtroOperacion).selectOption('revision');
  await page.getByLabel(T.panelCola.seleccionarTodas).check();
  await expect(page.getByText(T.panelCola.seleccionadas(2))).toBeVisible();
  await page.getByRole('button', { name: T.panelCola.aprobarSeleccionadas }).click();
  await expect(page.getByRole('status').filter({ hasText: T.panelCola.loteAprobadas(2) })).toBeVisible();
  expect((llamadaA(llamadas, 'fn_aprobar_lote')!.propuesta_ids as string[]).sort()).toEqual(['c2', 'c3']);
  await expect(page.getByText(T.panelCola.filtroVacio)).toBeVisible();
});

test('detalle con diff y señales; aprobar un cambio de estado (FL-21)', async ({ page }) => {
  const llamadas = await prepararPanel(page);
  await page.goto('/admin/cola');
  await abrir(page, new RegExp(P0.codigo));
  const detalle = page.getByRole('article');
  await expect(detalle.getByRole('heading', { name: `${P0.codigo} · ${T.operaciones.etiquetaEstado}` })).toBeVisible();
  await expect(detalle.getByText('Bueno', { exact: true })).toBeVisible();
  await expect(detalle.getByText('Regular', { exact: true })).toBeVisible();
  await expect(detalle.getByText('"Sale menos fuerza"')).toBeVisible();
  await detalle.getByRole('button', { name: T.panelCola.aprobar, exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: T.panelCola.aprobada(P0.codigo) })).toBeVisible();
  expect(llamadaA(llamadas, 'fn_aprobar')).toEqual({
    propuesta_id: 'c1',
    correcciones: null,
    confirmar_desactualizada: false,
  });
});

test('"otra medida": aprobar exige fijar el diámetro con correcciones (FR-17, FR-106)', async ({ page }) => {
  const llamadas = await prepararPanel(page);
  await page.goto('/admin/cola');
  await abrir(page, /Marta León/);
  const detalle = page.getByRole('article');
  await expect(detalle.getByTestId('minimapa-propuesta')).toBeVisible();
  // Dirección deducida al abrir (FR-105), editable.
  await expect(detalle.getByLabel(T.ficha.direccion)).toHaveValue('Camino del Cubillas 2');
  await expect(detalle.getByRole('button', { name: T.panelCola.aprobar, exact: true })).toBeDisabled();
  await expect(detalle.getByText(T.panelCola.fijaDiametro).first()).toBeVisible();

  await detalle.getByRole('button', { name: T.panelCola.aprobarConCorrecciones }).click();
  await expect(detalle.getByRole('button', { name: T.panelCola.guardarYAprobar })).toBeDisabled();
  await detalle.getByLabel(T.panelCola.campoDiametro).selectOption('70');
  await detalle.getByRole('button', { name: T.panelCola.guardarYAprobar }).click();
  await expect(
    page.getByRole('status').filter({ hasText: T.panelCola.aprobadaConCorrecciones(T.panelCola.nuevo) }),
  ).toBeVisible();
  expect(llamadaA(llamadas, 'fn_aprobar')).toEqual({
    propuesta_id: 'c5',
    correcciones: { diametro_mm: 70, direccion: 'Camino del Cubillas 2' },
    confirmar_desactualizada: false,
  });
});

test('rechazar pide motivo (FR-106)', async ({ page }) => {
  const llamadas = await prepararPanel(page);
  await page.goto('/admin/cola');
  await abrir(page, /Ana García/);
  const detalle = page.getByRole('article');
  await detalle.getByRole('button', { name: T.panelCola.rechazar }).click();
  await detalle.getByRole('button', { name: T.panelCola.confirmarRechazo }).click();
  await expect(detalle.getByText(T.panelCola.sinMotivo)).toBeVisible();
  expect(llamadaA(llamadas, 'fn_rechazar')).toBeUndefined();
  await detalle.getByLabel(T.panelCola.motivoRechazo).fill('La foto no se ve');
  await detalle.getByRole('button', { name: T.panelCola.confirmarRechazo }).click();
  await expect(page.getByRole('status').filter({ hasText: T.panelCola.rechazadaAviso })).toBeVisible();
  expect(llamadaA(llamadas, 'fn_rechazar')).toEqual({ propuesta_id: 'c6', motivo: 'La foto no se ve' });
});

test('desactualizada: "Confirmar y aprobar" con confirmación expresa (FR-108)', async ({ page }) => {
  const llamadas = await prepararPanel(page);
  await page.goto('/admin/cola');
  await abrir(page, /Ana García/);
  const detalle = page.getByRole('article');
  await expect(detalle.getByText(T.panelCola.desactualizada('hace 20 h'))).toBeVisible();
  await expect(detalle.getByRole('button', { name: T.panelCola.aprobar, exact: true })).toHaveCount(0);
  await detalle.getByRole('button', { name: T.panelCola.confirmarYAprobar }).click();
  await expect
    .poll(() => llamadaA(llamadas, 'fn_aprobar'))
    .toMatchObject({ propuesta_id: 'c6', confirmar_desactualizada: true });
});

test('posible duplicado: comparar y fusionar eligiendo qué prevalece (FR-51)', async ({ page }) => {
  const llamadas = await prepararPanel(page);
  await page.goto('/admin/cola');
  await abrir(page, /Javier Ortiz/);
  const detalle = page.getByRole('article');
  await expect(detalle.getByText(T.panelCola.posibleDuplicado)).toBeVisible();
  await expect(detalle.getByRole('columnheader', { name: new RegExp(`${P8.codigo} existente`) })).toBeVisible();
  await detalle.getByRole('button', { name: T.panelCola.fusionarCon(P8.codigo) }).click();
  await detalle.getByLabel(T.panelCola.campoEstado).selectOption('propuesta');
  // La descripción también difiere y se elige (RV-18, FR-106).
  await detalle.getByLabel(T.panelCola.campoDescripcion).selectOption('propuesta');
  await detalle.getByRole('button', { name: T.panelCola.fusionar, exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: T.panelCola.fusionada(P8.codigo) })).toBeVisible();
  expect(llamadaA(llamadas, 'fn_fusionar_con_existente')).toEqual({
    propuesta_id: 'c4',
    punto_id: P8.id,
    prevalece: { caudal: 'propuesta', descripcion: 'propuesta' },
  });
});

test('historial de rechazadas en solo lectura (FR-109)', async ({ page }) => {
  await prepararPanel(page);
  await page.goto('/admin/cola');
  await page.getByRole('radio', { name: T.panelCola.rechazadas }).click();
  await expect(page.getByText(T.panelCola.soloLectura)).toBeVisible();
  const detalle = page.getByRole('article');
  await expect(detalle.getByText(T.panelCola.motivo('La foto es del hidrante de al lado'))).toBeVisible();
  await expect(detalle.getByText(/Rechazada por jefe@example.org/)).toBeVisible();
  await expect(detalle.getByRole('button')).toHaveCount(0);
});

test('sin servidor: aviso en el panel y la lista explica el fallo (FR-168)', async ({ page }) => {
  await conGoogle(page, 'jefe@example.org');
  await page.route(`${SUPABASE_PRUEBAS}/rest/v1/rpc/fn_es_admin`, (r) =>
    r.fulfill({ contentType: 'application/json', body: 'true' }),
  );
  await page.route(new RegExp(`^${SUPABASE_PRUEBAS.replace(/\./g, '\\.')}/rest/v1/(?!rpc/)`), (r) =>
    r.abort('connectionrefused'),
  );
  await page.goto('/admin/cola');
  // postgrest-js reintenta solo las lecturas caídas con espera creciente: el fallo es firme a los ~7 s.
  await expect(page.getByText(T.panel.sinServidor, { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('alert').filter({ hasText: T.panelErrores.sinServidor })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole('button', { name: T.mapa.reintentar }).first()).toBeVisible();
});
