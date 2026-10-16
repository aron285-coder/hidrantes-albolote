// docs/21 RV-88: capturas de las pantallas principales, en claro y en oscuro, a 412 × 915 (proyecto
// móvil, Pixel 7) y a 1280 × 800 (escritorio), para que una persona las mire antes de fusionar (skill
// revisar-pantallas). No se comparan con nada: van adjuntas al informe con testInfo.attach, y el
// trabajo ci-vistas las sube como artefacto. Datos simulados (e2e/puntos.ts); nunca un servidor real.

import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { T } from '../src/lib/textos.ts';
import { SUPABASE_PRUEBAS } from '../playwright.config.ts';
import { abrirFiltros, conGoogle, conSesion, simularRpc, accionInventario } from './ayudas.ts';
import { LISTADO, PUNTOS } from './puntos.ts';
import { jefatura, PANEL_COMPLETO } from './panel-simulado.ts';

const [P0, P1] = PUNTOS;
const hace = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

async function voluntario(page: Page) {
  await conSesion(page);
  await simularRpc(page, {
    fn_listar_puntos: LISTADO,
    fn_ficha_punto: P0,
    fn_mis_propuestas: [],
    fn_registrar_error: null,
  });
}

/** docs/33 RV-315 (U6): Mis propuestas con una de cada estado, como en el mockup. */
async function voluntarioConPropuestas(page: Page) {
  await conSesion(page);
  const base = { correcciones: null, revisada_en: null, motivo_rechazo: null };
  await simularRpc(page, {
    fn_listar_puntos: LISTADO,
    fn_mis_propuestas: [
      {
        ...base,
        id: 'p1',
        clave_local: 'k1',
        operacion: 'estado',
        punto_id: P0.id,
        codigo: P0.codigo,
        datos: { caudal: 'no_funciona', descripcion_fallo: 'Tapa soldada' },
        estado: 'pendiente',
        creada_en: hace(0.02),
      },
      {
        ...base,
        id: 'p2',
        clave_local: 'k2',
        operacion: 'alta',
        punto_id: null,
        codigo: null,
        datos: { tipo: 'hidrante', diametro_mm: 100, caudal: 'bueno' },
        estado: 'aprobada',
        creada_en: hace(26),
      },
      {
        ...base,
        id: 'p3',
        clave_local: 'k3',
        operacion: 'datos',
        punto_id: P1.id,
        codigo: P1.codigo,
        datos: { racor: 'directo' },
        estado: 'rechazada',
        motivo_rechazo: 'la foto es de la boca de al lado',
        creada_en: hace(50),
      },
    ],
    fn_registrar_error: null,
  });
}

/**
 * docs/25 RV-107: los doce puntos sin revisar (los cinco tamaños, círculo y cuadrado), y el mapa
 * a z17 sobre ellos, para mirar el anillo de 8 rayas en el mapa y en la lista.
 */
async function voluntarioSinRevisar(page: Page) {
  await conSesion(page);
  await simularRpc(page, {
    fn_listar_puntos: { ...LISTADO, puntos: PUNTOS.map((p) => ({ ...p, revision_caducada: true })) },
    fn_ficha_punto: { ...P0, revision_caducada: true },
    fn_mis_propuestas: [],
    fn_registrar_error: null,
  });
  // La clave es VISTA de src/lib/vista.ts; no se importa porque arrastra imports sin extensión.
  await page.addInitScript(([clave, vista]) => sessionStorage.setItem(clave, vista), [
    'hidrantes.vista',
    JSON.stringify({ centro: [37.2326, -3.6554], zoom: 17 }),
  ] as const);
}

interface Vista {
  nombre: string;
  ruta: string;
  preparar: (p: Page) => Promise<void>;
  lista: (p: Page) => Promise<void>;
  /** Solo en escritorio: el panel es de ordenador (FR-100). */
  soloEscritorio?: boolean;
  /** Ancho del escritorio si no es el de siempre (1280). */
  anchoEscritorio?: number;
}

const VISTAS: Vista[] = [
  {
    nombre: 'mapa',
    ruta: '/',
    preparar: voluntario,
    lista: (p) => expect(p.getByTestId('estado-sincro')).toHaveAttribute('data-puntos', String(PUNTOS.length)),
  },
  {
    nombre: 'mapa-incidente',
    ruta: `/?incidente=${P0.lat.toFixed(6)},${P0.lng.toFixed(6)}`,
    preparar: voluntario,
    lista: (p) =>
      expect(p.getByRole('region', { name: T.incidente.titulo }).getByRole('listitem').first()).toBeVisible(),
  },
  {
    nombre: 'mapa-ficha',
    ruta: `/?p=${P0.id}`,
    preparar: voluntario,
    lista: (p) => expect(p.getByRole('article')).toBeVisible(),
  },
  {
    // docs/24 RV-99 y RV-100: sin título visible, «Añadir un punto aquí» primero y en naranja.
    nombre: 'que-hay-aqui',
    ruta: `/?aqui=${P0.lat.toFixed(6)},${P0.lng.toFixed(6)}`,
    preparar: voluntario,
    lista: (p) => expect(p.getByRole('dialog', { name: T.aqui.titulo })).toBeVisible(),
  },
  {
    // docs/24 RV-99: el formulario de alta sin las definiciones debajo de los campos.
    nombre: 'nuevo-punto',
    ruta: '/proponer/alta',
    preparar: voluntario,
    lista: (p) => expect(p.getByRole('radio', { name: T.formulario.hidrante })).toBeVisible(),
  },
  {
    // docs/24 RV-104 y docs/29 RV-121: los cuatro racores, con foto si el desarrollador ya las ha puesto.
    nombre: 'nuevo-punto-boca',
    ruta: '/proponer/alta',
    preparar: voluntario,
    lista: async (p) => {
      await p.getByRole('radio', { name: T.formulario.bocaRiego }).click();
      const racor = p.getByRole('radiogroup', { name: T.formulario.racor });
      await racor.scrollIntoViewIfNeeded();
      await expect(racor).toBeVisible();
    },
  },
  {
    // docs/24 RV-102: la rejilla de estados 2 + 3 con Barro marcado.
    nombre: 'nuevo-punto-barro',
    ruta: '/proponer/alta',
    preparar: voluntario,
    lista: async (p) => {
      await p.getByRole('radio', { name: T.formulario.hidrante }).click();
      await p.getByRole('radio', { name: T.formulario.barro }).click();
      await p.getByRole('radiogroup', { name: T.formulario.caudal }).scrollIntoViewIfNeeded();
      await expect(p.getByRole('radio', { name: T.formulario.barro })).toHaveAttribute('aria-checked', 'true');
    },
  },
  {
    // docs/31 RV-152: el formulario de un punto que ya no está lo dice, sin mandar al mapa.
    nombre: 'punto-ya-no-esta',
    ruta: '/proponer/estado?p=no-existe',
    preparar: voluntario,
    lista: (p) => expect(p.getByText(T.operaciones.puntoYaNoEsta)).toBeVisible(),
  },
  {
    // #563 (RV-270 D3): corregir datos dice que la foto es opcional.
    nombre: 'corregir-datos-foto',
    ruta: `/proponer/datos?p=${P0.id}`,
    preparar: voluntario,
    lista: async (p) => {
      const hueco = p.getByTestId('hueco-entrada-foto');
      await hueco.scrollIntoViewIfNeeded();
      await expect(hueco.getByRole('button', { name: T.formulario.hacerFotoOpcional })).toBeVisible();
    },
  },
  {
    // docs/24 RV-102: la leyenda con la fila de Barro.
    nombre: 'leyenda',
    ruta: '/',
    preparar: voluntario,
    lista: async (p) => {
      const leyenda = p.getByRole('button', { name: T.mapa.leyenda, exact: true });
      if (await leyenda.isVisible()) await leyenda.click();
      await expect(p.getByText(T.mapa.leyendaTamano)).toBeVisible();
    },
  },
  {
    // docs/24 RV-103: las dos fotos del alta, Conexión y Sitio, lado a lado.
    nombre: 'nuevo-punto-fotos',
    ruta: '/proponer/alta',
    preparar: voluntario,
    lista: async (p) => {
      const hueco = p.getByTestId('hueco-entrada-foto-sitio');
      await hueco.scrollIntoViewIfNeeded();
      await expect(hueco).toBeVisible();
    },
  },
  {
    // docs/33 RV-316 (D9): las dos fotos hechas, «✓ Conexión · N kB» en una línea.
    nombre: 'nuevo-punto-fotos-hechas',
    ruta: '/proponer/alta',
    preparar: voluntario,
    lista: async (p) => {
      const jpeg = await p.evaluate(async () => {
        const c = document.createElement('canvas');
        c.width = 400;
        c.height = 300;
        c.getContext('2d')!.fillRect(0, 0, 400, 300);
        const b = await new Promise<Blob>((r) => c.toBlob((x) => r(x!), 'image/jpeg'));
        return Array.from(new Uint8Array(await b.arrayBuffer()));
      });
      for (const id of ['entrada-foto', 'entrada-foto-sitio']) {
        await p.getByTestId(id).setInputFiles({ name: 'f.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(jpeg) });
      }
      const hueco = p.getByTestId('hueco-entrada-foto-sitio');
      await hueco.scrollIntoViewIfNeeded();
      await expect(hueco.getByText(/kB/)).toBeVisible();
    },
    anchoEscritorio: 1440,
  },
  {
    nombre: 'lista',
    ruta: '/lista',
    preparar: voluntario,
    lista: (p) => expect(p.getByRole('button', { name: new RegExp(P0.codigo) }).first()).toBeVisible(),
  },
  {
    // docs/25 RV-107: el anillo de "sin revisar" en los cinco tamaños, a 412 y 1440 px.
    nombre: 'mapa-sin-revisar',
    ruta: '/',
    preparar: voluntarioSinRevisar,
    lista: (p) => expect(p.locator('.leaflet-marker-pane [data-sin-revisar]')).toHaveCount(PUNTOS.length),
    anchoEscritorio: 1440,
  },
  {
    nombre: 'lista-sin-revisar',
    ruta: '/lista',
    preparar: voluntarioSinRevisar,
    lista: async (p) => {
      const fila = p.getByRole('button', { name: new RegExp(P0.codigo) }).first();
      await expect(fila).toBeVisible();
      await expect(fila.locator('[data-sin-revisar]')).toHaveCount(1);
    },
    anchoEscritorio: 1440,
  },
  {
    nombre: 'ajustes',
    ruta: '/ajustes',
    preparar: voluntario,
    lista: (p) => expect(p.getByText(T.ajustes.firma)).toBeVisible(),
  },
  {
    nombre: 'mis-propuestas',
    ruta: '/mis-propuestas',
    preparar: voluntarioConPropuestas,
    lista: (p) => expect(p.getByText(T.misPropuestas.motivo('la foto es de la boca de al lado'))).toBeVisible(),
    anchoEscritorio: 1440,
  },
  {
    // Cola, Inventario y Ajustes a cada ancho: al final del archivo (docs/38 RV-510).
    // docs/36 RV-471: al guardar, otro administrador ya había cambiado el punto (PUNTO_CAMBIADO).
    nombre: 'panel-editar-punto-cambiado',
    ruta: '/admin/inventario',
    preparar: async (p) => {
      await jefatura(p);
      await p.route(`${SUPABASE_PRUEBAS}/rest/v1/rpc/fn_editar_punto`, (r) =>
        r.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'P0001', message: 'PUNTO_CAMBIADO: otro administrador', details: null }),
        }),
      );
    },
    lista: async (p) => {
      await accionInventario(p, P0.codigo, 'editar');
      const editar = p.getByRole('dialog');
      await editar.getByRole('radio', { name: T.formulario.malo }).click();
      await editar.getByRole('button', { name: T.panel.guardarCambios }).click();
      await expect(editar.getByText(T.panelEditar.puntoCambiado)).toBeVisible();
    },
    soloEscritorio: true,
    anchoEscritorio: 1440,
  },
  {
    // docs/30 RV-127: el Registro dice qué cambió, con palabras, en la tabla y en las filas apiladas.
    nombre: 'panel-registro',
    ruta: '/admin/registro',
    preparar: jefatura,
    lista: (p) => expect(p.getByText(/Movido 5,6 m/)).toBeVisible(),
    anchoEscritorio: 1440,
  },
  {
    // docs/30 RV-127: el Historial del punto, con la segunda línea del detalle.
    nombre: 'panel-historial',
    ruta: '/admin/inventario',
    preparar: jefatura,
    lista: async (p) => {
      // Historial, en el «⋯» de la fila (docs/38 RV-506).
      await p
        .getByRole('button', { name: /^Más acciones de / })
        .first()
        .click();
      await p.getByRole('menuitem', { name: T.panel.historial, exact: true }).click();
      await expect(p.getByRole('dialog').getByText(/Movido 5,6 m/)).toBeVisible();
    },
    anchoEscritorio: 1440,
  },
  {
    // docs/36 RV-450: la cuenta de Google tiene otra identidad unida y no entra en jefatura.
    nombre: 'no-autorizado-cuenta-mezclada',
    ruta: '/admin',
    preparar: async (p) => {
      await conGoogle(p, 'jefe@example.org');
      await simularRpc(p, { fn_es_admin: false });
      await p.route('**/api/vincular-jefatura', (r) =>
        r.fulfill({ status: 403, contentType: 'application/json', body: '{"error":"CUENTA_MEZCLADA"}' }),
      );
      // Queda anotado: el servidor lo recibe.
      await p.route('**/api/error', (r) => r.fulfill({ contentType: 'application/json', body: '{}' }));
    },
    lista: async (p) => {
      await expect(p.getByText(T.entrada.cuentaMezcladaDetalle)).toBeVisible();
    },
    anchoEscritorio: 1440,
  },
];

async function capturar(page: Page, info: TestInfo, nombre: string) {
  // Sin animaciones a medias ni el cursor del campo de búsqueda parpadeando.
  await page.waitForLoadState('networkidle');
  const ruta = info.outputPath(`${nombre}.png`);
  await page.screenshot({ path: ruta, animations: 'disabled', caret: 'hide' });
  await info.attach(nombre, { path: ruta, contentType: 'image/png' });
}

for (const tema of ['claro', 'oscuro'] as const) {
  for (const vista of VISTAS) {
    test(`${vista.nombre} · ${tema}`, async ({ page, isMobile }, info) => {
      test.skip(!!isMobile && !!vista.soloEscritorio, 'el panel de jefatura es de ordenador');
      // Escritorio a 1280 × 800; el móvil es el Pixel 7 del proyecto (412 × 915).
      if (!isMobile) await page.setViewportSize({ width: vista.anchoEscritorio ?? 1280, height: 800 });
      await page.emulateMedia({ colorScheme: tema === 'oscuro' ? 'dark' : 'light' });
      await vista.preparar(page);
      await page.goto(vista.ruta);
      await vista.lista(page);
      await capturar(page, info, `${vista.nombre}-${isMobile ? '412' : (vista.anchoEscritorio ?? 1280)}-${tema}`);
    });
  }
}

// ---------- docs/38 RV-510: el panel por anchos (skill revisar-pantallas) ----------

const PESTANAS_PANEL = ['cola', 'inventario', 'registro', 'papelera', 'ajustes'] as const;

for (const tema of ['claro', 'oscuro'] as const) {
  for (const ancho of [412, 820, 1280, 1920] as const) {
    test(`panel por anchos a ${ancho} px · ${tema}`, async ({ page, isMobile }, info) => {
      test.skip(!!isMobile, 'en escritorio, con el ancho a mano');
      await page.setViewportSize({ width: ancho, height: ancho < 768 ? 915 : 900 });
      await page.emulateMedia({ colorScheme: tema === 'oscuro' ? 'dark' : 'light' });
      await jefatura(page, PANEL_COMPLETO);
      for (const pestana of PESTANAS_PANEL) {
        await page.goto(`/admin/${pestana}`);
        await expect(page.getByRole('main').getByText(T.panelCola.cargando)).toHaveCount(0);
        await capturar(page, info, `panel-${pestana}-${ancho}-${tema}`);
      }
      if (ancho !== 412) return;
      // A 412, también la hoja de filtros de la Cola y del Inventario, el menú ☰ y el «⋯» de una fila.
      for (const pestana of ['cola', 'inventario'] as const) {
        await page.goto(`/admin/${pestana}`);
        await abrirFiltros(page);
        await expect(page.getByRole('dialog')).toBeVisible();
        await capturar(page, info, `panel-${pestana}-filtros-${ancho}-${tema}`);
      }
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: new RegExp(`^${T.panel.menu}`) }).click();
      await expect(page.locator('#menu-cabecera')).toBeVisible();
      await capturar(page, info, `panel-menu-${ancho}-${tema}`);
      await page.keyboard.press('Escape');
      await page.goto('/admin/inventario');
      await page
        .getByRole('button', { name: /^Más acciones de / })
        .first()
        .click();
      await expect(page.getByRole('menu')).toBeVisible();
      await capturar(page, info, `panel-inventario-mas-${ancho}-${tema}`);
    });
  }
}
