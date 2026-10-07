// Panel de jefatura · cola de revisión (FL-21–FL-23, FR-100–FR-110) contra un Supabase simulado.

import { AxeBuilder } from '@axe-core/playwright';
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
    ...delPunto(PUNTOS.find((p) => p.id === extra.punto_id)),
    ...extra,
  };
}

/** Las columnas de 0036 (docs/25 RV-110, DEC-160): la fila del punto de hoy y su posición; en un alta, nulas. */
function delPunto(p: (typeof PUNTOS)[number] | undefined) {
  if (!p) return { punto: null, punto_lat: null, punto_lng: null };
  const { codigo, tipo, diametro_mm, caudal, racor, descripcion, descripcion_fallo, direccion, nucleo } = p;
  return {
    punto: {
      codigo,
      tipo,
      diametro_mm,
      caudal,
      racor,
      descripcion,
      descripcion_fallo,
      direccion,
      nucleo,
      fecha_ultima_revision: p.fecha_ultima_revision,
      foto_path: p.foto_path,
      foto_sitio_path: null,
    },
    punto_lat: p.lat,
    punto_lng: p.lng,
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
    codigo: P0.codigo,
    datos: {},
    foto_path: null,
    foto_sitio_path: null,
    direccion_sugerida: null,
    direccion_actual: P0.direccion,
    lat: null,
    lng: null,
    origen_ubicacion: null,
    precision_gps_m: null,
    nucleo: 'Albolote',
    motivo_rechazo: 'La foto es del hidrante de al lado',
    correcciones: null,
    revisada_por: 'jefe@example.org',
    revisada_en: hace(100),
    // v_historial_revision (0036): las mismas columnas del punto que la cola.
    ...delPunto(P0),
  },
];

interface Llamada {
  nombre: string;
  cuerpo: Record<string, unknown>;
}

/** Supabase simulado con estado: aprobar o rechazar quita la propuesta de la cola. */
async function prepararPanel(page: Page, extra: Record<string, unknown>[] = []) {
  let pendientes = [...cola(), ...extra];
  const llamadas: Llamada[] = [];
  const quitar = (ids: string[]) => (pendientes = pendientes.filter((p) => !ids.includes(p.id as string)));
  await conGoogle(page, 'jefe@example.org');
  await simularTablas(page, {
    v_puntos_activos: PUNTOS,
    v_cola_revision: () => pendientes,
    propuestas: (url) => (url.searchParams.get('estado') === 'eq.pendiente' ? pendientes : []),
    v_historial_revision: (url) => (url.searchParams.get('estado') === 'eq.rechazada' ? RECHAZADAS : []),
    puntos: [],
    config: [],
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
  // Una propuesta que llega después, la más nueva: sale la primera en la siguiente carga (RV-161).
  return Object.assign(llamadas, { llega: (f: Record<string, unknown>) => pendientes.unshift(f) });
}

const llamadaA = (llamadas: Llamada[], nombre: string) => llamadas.find((l) => l.nombre === nombre)?.cuerpo;

/** Abre una propuesta. Por debajo de 1.100 px el detalle es otra pantalla: antes se vuelve a la cola. */
async function abrir(page: Page, texto: RegExp) {
  const volver = page.getByRole('button', { name: T.panelCola.volverCola });
  if (await volver.isVisible()) await volver.click();
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
  // En el móvil se lee también en la barra de abajo (RV-110).
  await expect(page.getByText(T.panelCola.seleccionadas(2)).first()).toBeVisible();
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
    // La dirección deducida al abrir no se ha tocado: no es una corrección (docs/31 RV-162).
    correcciones: { diametro_mm: 70 },
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
  // Al corregir, los botones se van y el aviso sigue encima del formulario (docs/28 RV-115).
  await detalle.getByRole('button', { name: T.panelCola.aprobarConCorrecciones }).click();
  await expect(detalle.getByText(T.panelCola.desactualizada('hace 20 h'))).toBeVisible();
  await detalle.getByRole('button', { name: T.panelCola.cancelar }).click();
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
  // En tableta y móvil no hay ninguna abierta hasta tocarla.
  if (!(await page.getByRole('article').isVisible())) await abrir(page, /Luis Martín/);
  const detalle = page.getByRole('article');
  await expect(detalle.getByText(T.panelCola.motivo('La foto es del hidrante de al lado'))).toBeVisible();
  await expect(detalle.getByText(/Rechazada por jefe@example.org/)).toBeVisible();
  // El mismo detalle (mapa y datos del punto), sin ningún botón para decidir (RV-110).
  await expect(detalle.getByTestId('minimapa-propuesta')).toBeVisible();
  await expect(detalle.getByText(T.panelCola.datosDelPunto)).toBeVisible();
  await expect(detalle.getByTestId('acciones-propuesta')).toHaveCount(0);
  for (const nombre of [T.panelCola.aprobar, T.panelCola.aprobarConCorrecciones, T.panelCola.rechazar]) {
    await expect(detalle.getByRole('button', { name: nombre, exact: true })).toHaveCount(0);
  }
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

// docs/24 RV-103: el detalle enseña las dos fotos lado a lado; lo que llegó sin la del sitio enseña solo
// la de la conexión, sin señal aparte (docs/28 RV-115, DEC-166).
test('alta con las dos fotos y alta sin foto del sitio (RV-103)', async ({ page }) => {
  await page.route(`${SUPABASE_PRUEBAS}/storage/v1/object/public/**`, (r) =>
    r.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="9"/>',
    }),
  );
  const alta = (id: string, extra: Record<string, unknown>) =>
    fila({
      id,
      operacion: 'alta',
      creada_en: hace(1),
      punto_id: null,
      codigo: null,
      datos: { tipo: 'hidrante', diametro_mm: 100, caudal: 'bueno', descripcion: `Alta ${id}` },
      lat: 37.2305,
      lng: -3.656,
      foto_path: `fotos/${id}-conexion.jpg`,
      ...extra,
    });
  await prepararPanel(page, [
    alta('s1', { foto_sitio_path: 'fotos/s1-sitio.jpg', sin_foto_sitio: false, autor_nombre: 'Dos' }),
    alta('s2', { foto_sitio_path: null, sin_foto_sitio: true, autor_nombre: 'Una' }),
  ]);
  await page.goto('/admin/cola');
  await abrir(page, /Dos Ruiz/);
  const detalle = page.getByRole('article');
  await expect(detalle.locator('figcaption')).toHaveText([T.formulario.conexion, T.formulario.sitio]);
  await expect(detalle.locator('figure img')).toHaveCount(2);
  await expect(detalle.getByText(T.panelCola.sinFotoSitio)).toHaveCount(0);

  await abrir(page, /Una Ruiz/);
  await expect(detalle.locator('figcaption')).toHaveText([T.formulario.conexion]);
  await expect(detalle.locator('figure img')).toHaveCount(1);
  await expect(detalle.getByRole('heading', { name: T.panelCola.fotos })).toContainText(T.panelCola.sinFotoSitio);
});

// ---------- docs/25 RV-110: mapa arriba, datos completos y fotos, a todo el ancho ----------

const [, , P2] = PUNTOS;

/** Una corrección de datos y una de ubicación con fotos, como en los mockups. */
function rv110() {
  return [
    fila({
      id: 'd1',
      operacion: 'datos',
      creada_en: hace(1),
      punto_id: P2.id,
      codigo: P2.codigo,
      datos: { diametro_mm: 70 },
      antes: { diametro_mm: 100 },
      direccion_actual: P2.direccion,
      autor_nombre: 'Prueba',
      autor_apellido: 'Tres',
    }),
    fila({
      id: 'u1',
      operacion: 'ubicacion',
      creada_en: hace(3),
      punto_id: P1.id,
      codigo: P1.codigo,
      datos: {},
      lat: P1.lat + 0.0003,
      lng: P1.lng + 0.0002,
      origen_ubicacion: 'manual',
      direccion_sugerida: 'Calle Olivo 8',
      foto_path: 'fotos/u1-conexion.jpg',
      foto_sitio_path: 'fotos/u1-sitio.jpg',
      foto_path_actual: 'fotos/actual.jpg',
      autor_nombre: 'Prueba',
      autor_apellido: 'Cuatro',
    }),
  ];
}

async function conFotos(page: Page) {
  await page.route(`${SUPABASE_PRUEBAS}/storage/v1/object/public/**`, (r) =>
    r.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="9"><rect width="16" height="9" fill="#8D9A86"/></svg>',
    }),
  );
}

test('a 1440 px el detalle ocupa todo el ancho y los botones se ven sin desplazar (RV-110)', async ({
  page,
  isMobile,
}) => {
  test.skip(!!isMobile, 'el ordenador, en los proyectos de escritorio');
  await page.setViewportSize({ width: 1440, height: 900 });
  await prepararPanel(page, rv110());
  await page.goto('/admin/cola');
  await abrir(page, /Prueba Tres/);
  const detalle = page.getByRole('article');
  const lista = page.getByRole('region', { name: T.panelCola.colaRevision });
  expect(Math.abs((await lista.boundingBox())!.width - 340)).toBeLessThanOrEqual(1);
  const caja = (await detalle.boundingBox())!;
  const mapa = (await detalle.getByTestId('minimapa-propuesta').boundingBox())!;
  // El detalle llega al borde derecho y el mapa mide lo que él, menos su margen interior (2 × 20 px).
  expect(Math.abs(caja.x + caja.width - 1440)).toBeLessThanOrEqual(2);
  expect(Math.abs(mapa.width - (caja.width - 40))).toBeLessThanOrEqual(2);
  expect(Math.abs(mapa.height - 300)).toBeLessThanOrEqual(1);
  // Todos los datos, con solo el diámetro marcado.
  await expect(detalle.locator('[data-cambia="true"]')).toHaveCount(1);
  await expect(detalle.locator('[data-cambia="true"]')).toHaveAttribute('data-campo', 'diametro_mm');
  await expect(detalle.getByText(T.coordenadas.utm, { exact: true })).toBeVisible();
  const aprobar = detalle.getByRole('button', { name: T.panelCola.aprobar, exact: true });
  await expect(aprobar).toBeInViewport();
  // Y siguen a la vista al desplazar.
  await page.mouse.wheel(0, 2000);
  await expect(aprobar).toBeInViewport();
});

test('una ubicación: satélite, la foto actual junto a las nuevas, mapa en grande (RV-110)', async ({ page }) => {
  await conFotos(page);
  await prepararPanel(page, rv110());
  await page.goto('/admin/cola');
  await abrir(page, /Prueba Cuatro/);
  const detalle = page.getByRole('article');
  const mapa = detalle.getByTestId('minimapa-propuesta');
  await expect(mapa).toHaveAttribute('data-capa', 'satelite');
  await expect(detalle.locator('figcaption')).toHaveText([
    T.panelCola.fotoActualPunto,
    T.panelCola.fotoNueva(T.panelCola.conexion),
    T.panelCola.fotoNueva(T.panelCola.sitio),
  ]);
  await detalle.getByRole('radio', { name: T.panelCola.capaMapa }).click();
  await expect(mapa).toHaveAttribute('data-capa', 'base');
  await detalle.getByRole('button', { name: T.panelCola.abrirEnGrande }).click();
  await expect(detalle.getByRole('button', { name: T.panelCola.cerrarGrande })).toBeVisible();
  expect((await mapa.boundingBox())!.width).toBe(page.viewportSize()!.width);
  // "Cerrar" se puede tocar: en el móvil, la barra de botones no lo tapa.
  await detalle.getByRole('button', { name: T.panelCola.cerrarGrande }).click();
  await expect(detalle.getByRole('button', { name: T.panelCola.abrirEnGrande })).toBeVisible();
  await detalle.getByRole('button', { name: T.panelCola.abrirEnGrande }).click();
  await page.keyboard.press('Escape');
  await expect(detalle.getByRole('button', { name: T.panelCola.abrirEnGrande })).toBeVisible();
});

for (const ancho of [820, 412]) {
  test(`a ${ancho} px la cola y el detalle son dos pantallas; "‹" vuelve (RV-110)`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: ancho === 820 ? 1180 : 915 });
    await prepararPanel(page, rv110());
    await page.goto('/admin/cola');
    const lista = page.getByRole('region', { name: T.panelCola.colaRevision });
    await expect(lista.getByRole('listitem').first()).toBeVisible();
    await expect(lista.getByTestId('mapita').first()).toBeVisible();
    await expect(page.getByRole('article')).toHaveCount(0);
    await expect(page.getByText(T.panelCola.tocaUna)).toBeVisible();

    await abrir(page, /Prueba Tres/);
    const detalle = page.getByRole('article');
    expect((await detalle.boundingBox())!.width).toBe(ancho);
    const mapa = (await detalle.getByTestId('minimapa-propuesta').boundingBox())!;
    expect(Math.abs(mapa.height - (ancho === 820 ? 280 : 200))).toBeLessThanOrEqual(1);
    const corregir = detalle.getByRole('button', { name: T.panelCola.aprobarConCorrecciones });
    await expect(corregir).toBeInViewport();
    // Lo que se ve (innerText): "Corregir" en el móvil, el nombre largo en tableta.
    expect(await corregir.innerText()).toBe(
      ancho === 412 ? T.panelCola.corregirCorto : T.panelCola.aprobarConCorrecciones,
    );
    const desborde = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(desborde).toBeLessThanOrEqual(1);

    await page.getByRole('button', { name: T.panelCola.volverCola }).click();
    await expect(page.getByRole('article')).toHaveCount(0);
    await expect(lista).toBeVisible();
    // "Atrás" del navegador también vuelve a la cola.
    await abrir(page, /Prueba Tres/);
    await expect(page.getByRole('article')).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('article')).toHaveCount(0);

    // Con propuestas marcadas, la barra de abajo aprueba en bloque (FR-107).
    await lista.getByRole('checkbox').first().check();
    await expect(page.getByRole('button', { name: T.panelCola.aprobarSeleccionadas })).toBeVisible();
  });
}

// ---------- docs/28 RV-115 (DEC-166): sin señales en el detalle; el ⚠ de la lista, solo por avisos ----------

/** Un alta con pin a mano lejos del GPS y la foto lejos del pin: antes, dos chips ⚠ y el ⚠ en la lista. */
const PIN_A_MANO = fila({
  id: 'm1',
  operacion: 'alta',
  creada_en: hace(4),
  codigo: null,
  datos: { tipo: 'hidrante', diametro_mm: 100, caudal: 'bueno' },
  lat: 37.2335,
  lng: -3.649,
  origen_ubicacion: 'manual',
  precision_gps_m: 35,
  distancia_gps_m: 40,
  distancia_exif_m: 120,
  foto_path: 'fotos/m1-conexion.jpg',
  sin_foto_sitio: true,
  autor_nombre: 'Prueba',
  autor_apellido: 'Cinco',
});

test('el detalle sin señales y el ⚠ de la lista solo por lo que el detalle avisa (RV-115)', async ({ page }) => {
  await conFotos(page);
  await prepararPanel(page, [PIN_A_MANO]);
  await page.goto('/admin/cola');
  const lista = page.getByRole('region', { name: T.panelCola.colaRevision });
  const fila = (quien: RegExp) => lista.getByRole('listitem').filter({ hasText: quien });
  const aviso = (quien: RegExp) => fila(quien).getByLabel(T.panelCola.senalAviso);
  // Duplicado, otra medida de hidrante y desactualizada: ⚠. Pin a mano y foto lejos, no.
  await expect(aviso(/Javier Ortiz/)).toHaveCount(1);
  await expect(aviso(/Marta León/)).toHaveCount(1);
  await expect(aviso(/Ana García/)).toHaveCount(1);
  await expect(aviso(/Prueba Cinco/)).toHaveCount(0);
  await expect(aviso(/Sara Ruiz/)).toHaveCount(0);

  await abrir(page, /Prueba Cinco/);
  const detalle = page.getByRole('article');
  await expect(detalle.getByRole('heading', { name: T.panelCola.datosDelPunto })).toHaveText(T.panelCola.datosDelPunto);
  await expect(detalle.getByRole('list', { name: 'Señales de fiabilidad' })).toHaveCount(0);
  for (const t of ['La foto se hizo', 'Pin puesto a mano ·', 'Con foto', 'datos del voluntario']) {
    await expect(detalle.getByText(t)).toHaveCount(0);
  }
  // Lo que decía el chip del pin sigue en "Origen de la ubicación".
  await expect(detalle.locator('[data-campo="origen"]')).toContainText(T.panelCola.origenManual);

  await abrir(page, new RegExp(P4.codigo));
  await expect(detalle.getByRole('heading', { name: T.panelCola.datosDelPunto })).toContainText(T.panelCola.restoIgual);
});

/** axe del detalle abierto, con las reglas de accesibilidad.spec.ts. */
async function auditarDetalle(page: Page, contexto: string) {
  await page.waitForLoadState('networkidle');
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .include('article')
    .exclude('.leaflet-marker-pane')
    .analyze();
  const resumen = violations.flatMap((v) => v.nodes.map((n) => `${v.id} · ${n.target.join(' ')}`));
  expect(resumen, contexto).toEqual([]);
}

// axe del detalle de un alta, una revisión, un cambio de estado y un alta con duplicado, en los dos
// modos. Sin exclusiones: en oscuro, el texto ámbar, rojo y verde usa los tokens -texto (RV-117).
for (const tema of ['claro', 'oscuro'] as const) {
  test(`axe del detalle de la cola · ${tema} (RV-115)`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: tema === 'oscuro' ? 'dark' : 'light' });
    await conFotos(page);
    await prepararPanel(page, [PIN_A_MANO]);
    await page.goto('/admin/cola');
    for (const quien of [/Prueba Cinco/, new RegExp(P4.codigo), new RegExp(P0.codigo), /Javier Ortiz/]) {
      await abrir(page, quien);
      await expect(page.getByRole('article').getByRole('heading').first()).toBeVisible();
      await auditarDetalle(page, `${quien} · ${tema}`);
    }
  });

  // docs/28 RV-117: Fusionar, Rechazar, la comparación y el aviso de motivo, también en oscuro.
  test(`axe de fusionar y rechazar · ${tema} (RV-117)`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: tema === 'oscuro' ? 'dark' : 'light' });
    await prepararPanel(page);
    await page.goto('/admin/cola');
    await abrir(page, /Javier Ortiz/);
    const detalle = page.getByRole('article');
    await expect(detalle.getByText(T.panelCola.posibleDuplicado)).toBeVisible();
    await detalle.getByRole('button', { name: T.panelCola.fusionarCon(P8.codigo) }).click();
    await expect(detalle.getByRole('button', { name: T.panelCola.fusionar, exact: true })).toBeVisible();
    await auditarDetalle(page, `fusionar · ${tema}`);
    await detalle.getByRole('button', { name: T.panelCola.cancelar }).click();
    await detalle.getByRole('button', { name: T.panelCola.rechazar }).click();
    await detalle.getByRole('button', { name: T.panelCola.confirmarRechazo }).click();
    await expect(detalle.getByText(T.panelCola.sinMotivo)).toBeVisible();
    await auditarDetalle(page, `rechazar · ${tema}`);
  });
}

// Capturas para revisar a ojo (skill revisar-pantallas): los tres tamaños, en claro y en oscuro.
for (const tema of ['claro', 'oscuro'] as const) {
  for (const [ancho, alto] of [
    [412, 915],
    [820, 1180],
    [1440, 900],
  ] as const) {
    test(`captura de la cola · ${ancho} · ${tema} (RV-110)`, async ({ page }, info) => {
      test.skip(info.project.name !== 'escritorio', 'una vez, en el Chrome de escritorio');
      await page.setViewportSize({ width: ancho, height: alto });
      await page.emulateMedia({ colorScheme: tema === 'oscuro' ? 'dark' : 'light' });
      await conFotos(page);
      await prepararPanel(page, rv110());
      await page.goto('/admin/cola');
      const lista = page.getByRole('region', { name: T.panelCola.colaRevision });
      await expect(lista.getByRole('listitem').first()).toBeVisible();
      const capturar = async (nombre: string) => {
        await page.waitForLoadState('networkidle');
        const ruta = info.outputPath(`${nombre}.png`);
        await page.screenshot({ path: ruta, animations: 'disabled', caret: 'hide' });
        await info.attach(nombre, { path: ruta, contentType: 'image/png' });
      };
      if (ancho < 1100) await capturar(`cola-${ancho}-${tema}`);
      for (const [nombre, quien] of [
        ['datos', /Prueba Tres/],
        ['ubicacion', /Prueba Cuatro/],
        ['alta', /Javier Ortiz/],
        ['revision', new RegExp(P4.codigo)],
      ] as const) {
        await abrir(page, quien);
        await expect(page.getByRole('article').getByRole('heading').first()).toBeVisible();
        await capturar(`detalle-${nombre}-${ancho}-${tema}`);
      }
    });
  }
}

// ---------- docs/31 RV-161 a RV-163 ----------

/** Un alta que llega sin dirección: el panel la deduce al abrir (FR-105). */
const ALTA_SIN_DIRECCION = fila({
  id: 'a9',
  operacion: 'alta',
  creada_en: hace(1),
  codigo: null,
  datos: { tipo: 'hidrante', diametro_mm: 100, caudal: 'bueno' },
  lat: 37.2335,
  lng: -3.651,
  origen_ubicacion: 'gps',
  precision_gps_m: 4,
  direccion_sugerida: null,
  autor_nombre: 'Prueba',
  autor_apellido: 'Seis',
});

test('RV-162 caso 1: aprobar un alta con la dirección deducida sin tocar no lleva correcciones', async ({ page }) => {
  const llamadas = await prepararPanel(page, [ALTA_SIN_DIRECCION]);
  await page.goto('/admin/cola');
  await abrir(page, /Prueba Seis/);
  const detalle = page.getByRole('article');
  await expect(detalle.getByLabel(T.ficha.direccion)).toHaveValue('Camino del Cubillas 2');
  await detalle.getByRole('button', { name: T.panelCola.aprobar, exact: true }).click();
  await expect
    .poll(() => llamadaA(llamadas, 'fn_aprobar'))
    .toEqual({ propuesta_id: 'a9', correcciones: null, confirmar_desactualizada: false });
});

test('RV-162 caso 1: si la deducida no se pudo guardar, aprobar la manda como corrección', async ({ page }) => {
  const llamadas = await prepararPanel(page, [ALTA_SIN_DIRECCION]);
  // La Function la deduce pero no la guarda como sugerida: sin mandarla, el punto quedaría sin dirección.
  await page.route('**/api/direccion?*', (r) =>
    r.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ direccion: 'Camino del Cubillas 2', fuente: 'nominatim', guardada: false }),
    }),
  );
  await page.goto('/admin/cola');
  await abrir(page, /Prueba Seis/);
  const detalle = page.getByRole('article');
  await expect(detalle.getByLabel(T.ficha.direccion)).toHaveValue('Camino del Cubillas 2');
  await detalle.getByRole('button', { name: T.panelCola.aprobar, exact: true }).click();
  await expect
    .poll(() => llamadaA(llamadas, 'fn_aprobar'))
    .toEqual({
      propuesta_id: 'a9',
      correcciones: { direccion: 'Camino del Cubillas 2' },
      confirmar_desactualizada: false,
    });
});

test('RV-162 caso 2: corregir el estado no añade la dirección que el formulario rellena', async ({ page }) => {
  const llamadas = await prepararPanel(page);
  await page.goto('/admin/cola');
  await abrir(page, new RegExp(P0.codigo));
  const detalle = page.getByRole('article');
  await detalle.getByRole('button', { name: T.panelCola.aprobarConCorrecciones }).click();
  await expect(detalle.getByLabel(T.ficha.direccion)).toHaveValue('Calle Real 14');
  await detalle.getByLabel(T.panelCola.campoEstado).selectOption('malo');
  await detalle.getByRole('button', { name: T.panelCola.guardarYAprobar }).click();
  await expect
    .poll(() => llamadaA(llamadas, 'fn_aprobar'))
    .toEqual({ propuesta_id: 'c1', correcciones: { caudal: 'malo' }, confirmar_desactualizada: false });
});

test('RV-162 caso 3: vaciar la dirección la quita (manda null)', async ({ page }) => {
  const llamadas = await prepararPanel(page);
  await page.goto('/admin/cola');
  await abrir(page, new RegExp(P0.codigo));
  const detalle = page.getByRole('article');
  await detalle.getByRole('button', { name: T.panelCola.aprobarConCorrecciones }).click();
  await detalle.getByLabel(T.ficha.direccion).fill('');
  await detalle.getByRole('button', { name: T.panelCola.guardarYAprobar }).click();
  await expect
    .poll(() => llamadaA(llamadas, 'fn_aprobar'))
    .toEqual({ propuesta_id: 'c1', correcciones: { direccion: null }, confirmar_desactualizada: false });
});

test('RV-161: una propuesta nueva no mueve el detalle abierto ni borra lo escrito', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.clock.install();
  const llamadas = await prepararPanel(page);
  await page.goto('/admin/cola');
  const detalle = page.getByRole('article');
  const titulo = detalle.getByRole('heading', { name: `${P0.codigo} · ${T.operaciones.etiquetaEstado}` });
  await expect(titulo).toBeVisible();
  // La abierta queda fija en la dirección, sin apilar una entrada.
  await expect(page).toHaveURL(/[?&]p=c1\b/);
  await detalle.getByRole('button', { name: T.panelCola.rechazar }).click();
  await detalle.getByLabel(T.panelCola.motivoRechazo).fill('La foto no se ve');

  llamadas.llega(
    fila({
      id: 'n1',
      operacion: 'revision',
      creada_en: hace(0),
      punto_id: P5.id,
      codigo: P5.codigo,
      datos: {},
      autor_nombre: 'Prueba',
      autor_apellido: 'Nueva',
    }),
  );
  await page.clock.runFor(61_000);
  const lista = page.getByRole('region', { name: T.panelCola.colaRevision });
  await expect(lista.getByRole('listitem').first()).toContainText('Prueba Nueva');

  await expect(titulo).toBeVisible();
  await expect(detalle.getByLabel(T.panelCola.motivoRechazo)).toHaveValue('La foto no se ve');
  await expect(page).toHaveURL(/[?&]p=c1\b/);
  await detalle.getByRole('button', { name: T.panelCola.confirmarRechazo }).click();
  await expect
    .poll(() => llamadaA(llamadas, 'fn_rechazar'))
    .toEqual({ propuesta_id: 'c1', motivo: 'La foto no se ve' });
});

test.describe('a 412 × 915 (RV-163)', () => {
  test.beforeEach(async ({ page }) => page.setViewportSize({ width: 412, height: 915 }));

  test('"‹" y aprobar vuelven atrás en el historial: no se apila una entrada por propuesta', async ({ page }) => {
    await prepararPanel(page, rv110());
    await page.goto('/admin/cola');
    const lista = page.getByRole('region', { name: T.panelCola.colaRevision });
    await expect(lista.getByRole('listitem').first()).toBeVisible();
    const largo = () => page.evaluate(() => history.length);
    const inicio = await largo();

    await abrir(page, new RegExp(P0.codigo));
    await page.getByRole('button', { name: T.panelCola.volverCola }).click();
    await expect(page.getByRole('article')).toHaveCount(0);
    await abrir(page, new RegExp(P4.codigo));
    await page.getByRole('button', { name: T.panelCola.volverCola }).click();
    await expect(page.getByRole('article')).toHaveCount(0);
    expect(await largo()).toBe(inicio + 1);

    // Después de aprobar, igual: la cola, sin una entrada de más.
    await abrir(page, new RegExp(P5.codigo));
    await page.getByRole('article').getByRole('button', { name: T.panelCola.aprobar, exact: true }).click();
    await expect(page.getByRole('article')).toHaveCount(0);
    await expect(page).not.toHaveURL(/[?&]p=/);
    expect(await largo()).toBe(inicio + 1);
  });

  test('con ?p= en la dirección (un enlace, recargar), "‹" y aprobar se quedan en la cola', async ({ page }) => {
    await prepararPanel(page);
    await page.goto('/admin/cola');
    await page.goto('/admin/cola?p=c1');
    const largo = () => page.evaluate(() => history.length);
    const inicio = await largo();
    await expect(page.getByRole('article')).toBeVisible();
    // No hay una entrada apilada por la cola: atrás saldría del panel. Se quita ?p= sin apilar.
    await page.getByRole('button', { name: T.panelCola.volverCola }).click();
    await expect(page).toHaveURL(/\/admin\/cola$/);
    await expect(page.getByRole('region', { name: T.panelCola.colaRevision })).toBeVisible();
    expect(await largo()).toBe(inicio);

    await page.goto('/admin/cola?p=c2');
    await page.getByRole('article').getByRole('button', { name: T.panelCola.aprobar, exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/cola$/);
    await expect(page.getByRole('region', { name: T.panelCola.colaRevision })).toBeVisible();
  });

  test('"Rechazar seleccionadas" lleva al formulario de arriba con el foco en el motivo', async ({ page }) => {
    await prepararPanel(page, rv110());
    await page.goto('/admin/cola');
    const lista = page.getByRole('region', { name: T.panelCola.colaRevision });
    await lista.getByRole('checkbox').last().check();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.getByRole('button', { name: T.panelCola.rechazarSeleccionadas }).click();
    const motivo = page.getByLabel(T.panelCola.motivoComun);
    await expect(motivo).toBeFocused();
    await expect(motivo).toBeInViewport();
  });
});

// docs/31 RV-169: la fila abierta con el oscuro elegido a mano (data-tema) y el sistema en claro. La
// variante dark: solo sigue al sistema: con #EFF3F8 fijo, el texto claro del oscuro no se leía.
test('Cola: la fila abierta y la lista pasan axe con el oscuro forzado sobre un sistema claro (RV-169)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.addInitScript(() => localStorage.setItem('hidrantes.tema', JSON.stringify('oscuro')));
  await prepararPanel(page);
  await page.goto('/admin/cola');
  await expect(page.locator('html')).toHaveAttribute('data-tema', 'oscuro');
  const lista = page.getByRole('region', { name: T.panelCola.colaRevision });
  const abierta = lista.getByRole('listitem').filter({ has: page.locator('[aria-current="true"]') });
  await expect(abierta).toHaveCount(1);
  await expect(abierta).toHaveCSS('background-color', 'rgb(36, 49, 73)');
  await page.waitForLoadState('networkidle');
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .include(`section[aria-label="${T.panelCola.colaRevision}"]`)
    .analyze();
  expect(violations.flatMap((v) => v.nodes.map((n) => `${v.id} · ${n.target.join(' ')}`))).toEqual([]);
});
