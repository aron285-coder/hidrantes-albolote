// Auditoría de accesibilidad con axe sobre las pantallas de verdad (TR-30, TR-103). El contraste de
// los tokens ya lo mide src/lib/accesibilidad.test.ts; esto busca lo que solo se ve montado: campos
// sin etiqueta, encabezados saltados, botones sin nombre accesible, listas mal anidadas.
//
// Se comprueban las reglas WCAG 2.2 A y AA (con las de 2.0 y 2.1 que siguen en 2.2). Si alguna vez
// hay que tolerar algo, se desactiva esa regla **con el motivo escrito**, nunca la pantalla entera.

import { AxeBuilder } from '@axe-core/playwright';
import type { NodeResult, Result } from 'axe-core';
import { expect, test, type Page } from '@playwright/test';
import { T } from '../src/lib/textos.ts';
import { conGoogle, conSesion, simularRpc, simularTablas } from './ayudas.ts';
import { LISTADO, PUNTOS } from './puntos.ts';
import { SUPABASE_PRUEBAS } from '../playwright.config.ts';

// wcag22aa trae target-size (RV-29); los 44 px de TR-32 los mide geometria(), más abajo.
const REGLAS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

// Cada prueba pasa axe por varias pantallas; con cuatro workers y la máquina cargada, 30 s no
// siempre bastan (se vio en el ensayo de RV-27 con --repeat-each=3).
test.describe.configure({ timeout: 60_000 });

async function auditar(page: Page, contexto: string) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(REGLAS)
    // El contraste de los marcadores del mapa es de 06 §4.2 y se mide con su propia fórmula, en
    // los dos modos: axe solo ve el SVG suelto y no sabe qué hay detrás (DEC-072).
    .exclude('.leaflet-marker-pane')
    .analyze();
  // El resumen lleva el selector y el motivo exacto: una violación sin el nodo no se puede arreglar.
  const resumen = violations.flatMap((v: Result) =>
    v.nodes.map(
      (n: NodeResult) => `${v.id} · ${n.target.join(' ')} · ${(n.any[0]?.message ?? v.help).replace(/\s+/g, ' ')}`,
    ),
  );
  expect(resumen, `${contexto} · violaciones de axe`).toEqual([]);
}

interface Caja {
  que: string;
  x: number;
  y: number;
  w: number;
  h: number;
  grupo: string | null;
  destructivo: boolean;
  variante: string | null;
  /** Un marcador del mapa: contenido que se desplaza bajo los controles flotantes. */
  marcador: boolean;
  i: number;
}

/**
 * Geometría de los controles (TR-32, TR-113, UI-13, UI-15; docs/17 RV-29): axe con WCAG 2.1 no
 * mide objetivos táctiles. En el móvil, cada control mide ≥ 44 × 44 px (contando la etiqueta que lo
 * envuelve, que es su área táctil) y entre dos vecinos hay ≥ 8 px; en todas las pantallas, una
 * acción destructiva queda a ≥ 12 px de la afirmativa. Los segmentos de un mismo grupo de radios son
 * un solo control y no cuentan entre sí; un objetivo de 52 px o más en el eje en que se tocan ya
 * lleva sus 8 px dentro (filas de lista).
 */
async function geometria(page: Page, contexto: string, { movil }: { movil: boolean }) {
  const cajas: Caja[] = await page.evaluate(() => {
    const sel =
      'button, a[href], [role=button], [role=radio], input:not([type=hidden]):not([type=file]), select, textarea, .marcador';
    const vistos = [...document.querySelectorAll<HTMLElement>(sel)].filter((e) => {
      const r = e.getBoundingClientRect();
      const st = getComputedStyle(e);
      if (r.width <= 1 || r.height <= 1 || st.visibility === 'hidden' || e.closest('[aria-hidden="true"]'))
        return false;
      // Solo lo que se puede tocar: un control que una hoja con scroll deja fuera de la vista no es un
      // objetivo táctil ahora (docs/18 GM-03). Se mira si su centro está a la vista y es suyo.
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) return false;
      const encima = document.elementFromPoint(cx, cy);
      const etiqueta = e.closest('label');
      return !encima || e.contains(encima) || encima.contains(e) || (!!etiqueta && etiqueta.contains(encima));
    });
    // La variante sale de `data-variante` (Boton la pone siempre) y, en un <button> suelto que no la
    // lleve, de su clase: una acción destructiva sin la marca no se escapa de los 12 px (docs/18 RV-50).
    const varianteDe = (e: HTMLElement): string | null => {
      const marcada = e.getAttribute('data-variante');
      if (marcada) return marcada;
      if (e.classList.contains('bg-rojo-700')) return 'destructivo';
      if (e.classList.contains('bg-naranja-600')) return 'primario';
      return null;
    };
    return vistos.map((e, i) => {
      const variante = varianteDe(e);
      const propio = e.getBoundingClientRect();
      const etiqueta = e.closest('label')?.getBoundingClientRect();
      const r = etiqueta && etiqueta.width * etiqueta.height > propio.width * propio.height ? etiqueta : propio;
      const nombre = (e.getAttribute('aria-label') || e.textContent || e.getAttribute('placeholder') || e.tagName)
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 40);
      return {
        que: `${e.tagName.toLowerCase()} "${nombre}"`,
        x: r.left,
        y: r.top,
        w: r.width,
        h: r.height,
        // Un grupo de opciones, o una pieza unida como el zoom (06 §5): sin aire entre sus botones.
        grupo: e.closest('[role=radiogroup],[data-pieza-unida]')?.getAttribute('aria-label') ?? null,
        destructivo: variante === 'destructivo',
        variante,
        marcador: e.classList.contains('marcador'),
        i,
      };
    });
  });
  const hueco = (a: Caja, b: Caja) => {
    const dx = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
    const dy = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
    return { dx, dy };
  };
  const problemas: string[] = [];
  if (movil) {
    for (const c of cajas) {
      if (c.w < 43.5 || c.h < 43.5) problemas.push(`${c.que}: ${Math.round(c.w)} × ${Math.round(c.h)} px (< 44)`);
    }
  }
  for (let i = 0; i < cajas.length; i++) {
    for (let j = i + 1; j < cajas.length; j++) {
      const a = cajas[i]!;
      const b = cajas[j]!;
      const { dx, dy } = hueco(a, b);
      // Solapados: uno está encima del otro (capas, o uno dentro de otro), no al lado.
      if (dx < 0 && dy < 0) continue;
      const lado = dx >= 0 && dy < 0; // uno junto al otro en horizontal
      // En diagonal (ni encima ni al lado) manda el mayor de los dos huecos: la leyenda abajo a la
      // izquierda y "Cercanos" a la derecha no son vecinos aunque sus bordes queden a la misma altura.
      const gap = lado ? dx : dx >= 0 ? Math.max(dx, dy) : dy;
      if (a.destructivo !== b.destructivo && a.variante && b.variante && gap < 12) {
        problemas.push(`${a.que} y ${b.que}: ${Math.round(gap)} px entre la acción destructiva y la otra (< 12)`);
      }
      if (!movil || gap >= 8) continue;
      if (a.grupo && a.grupo === b.grupo) continue;
      // Un marcador junto a un control flotante del mapa no es un problema de la interfaz: basta con
      // mover el mapa (docs/18 GM-03). Entre marcadores, y entre controles, sí cuenta.
      if (a.marcador !== b.marcador) continue;
      const eje = lado ? Math.min(a.w, b.w) : Math.min(a.h, b.h);
      if (eje >= 52) continue;
      problemas.push(`${a.que} y ${b.que}: ${Math.round(gap)} px entre controles vecinos (< 8)`);
    }
  }
  expect(problemas, `${contexto} · geometría de los controles`).toEqual([]);
}

test.describe('app del voluntario', () => {
  test('entrada, primer uso y aviso legal', async ({ page, isMobile }) => {
    await simularRpc(page, { fn_registrar_error: null });
    await page.goto('/');
    await expect(page.getByLabel(T.entrada.nombre)).toBeVisible();
    await auditar(page, 'entrada');
    await geometria(page, 'entrada', { movil: !!isMobile });
  });

  test('mapa, lista y ficha', async ({ page, isMobile }) => {
    await conSesion(page);
    await simularRpc(page, { fn_listar_puntos: LISTADO, fn_registrar_error: null, fn_ficha_punto: PUNTOS[0] });
    await page.goto('/');
    await expect(page.getByText(T.mapa.nPuntos(PUNTOS.length), { exact: false })).toBeVisible();
    await auditar(page, 'mapa');
    await geometria(page, 'mapa', { movil: !!isMobile });

    // La leyenda plegada (RV-82): una ficha de 44 px con nombre, sin pegarse a los demás controles.
    await page.reload();
    await expect(page.getByRole('button', { name: T.mapa.leyenda, exact: true })).toBeVisible();
    await auditar(page, 'mapa con la leyenda plegada');
    await geometria(page, 'mapa con la leyenda plegada', { movil: !!isMobile });

    await page.getByRole('link', { name: T.navegacion.lista }).click();
    await expect(page.getByPlaceholder(T.mapa.buscar)).toBeVisible();
    await auditar(page, 'lista');
    await geometria(page, 'lista', { movil: !!isMobile });
  });

  // docs/18 GM-02 a GM-06: la ficha con sus coordenadas, "¿Qué hay aquí?", el incidente y la medición.
  // Una prueba por pantalla: juntas pasaban del minuto con cuatro workers (docs/18 RV-49).
  const EMERGENCIAS: [string, string, (p: Page) => ReturnType<Page['getByRole']>][] = [
    ['ficha', `/?p=${PUNTOS[0].id}`, (p) => p.getByRole('region', { name: T.coordenadas.titulo })],
    ['qué hay aquí', '/?aqui=37.2305,-3.656', (p) => p.getByRole('dialog', { name: T.aqui.titulo })],
    ['incidente', '/?incidente=37.230500,-3.656000', (p) => p.getByRole('region', { name: T.incidente.titulo })],
    ['medir', '/?medir=1', (p) => p.getByRole('region', { name: T.medir.titulo })],
  ];
  for (const [nombre, ruta, listo] of EMERGENCIAS) {
    test(`${nombre} (funciones de mapa para emergencias)`, async ({ page, isMobile }) => {
      await conSesion(page);
      await simularRpc(page, { fn_listar_puntos: LISTADO, fn_registrar_error: null });
      await page.goto(ruta);
      await expect(listo(page)).toBeVisible();
      await auditar(page, nombre);
      await geometria(page, nombre, { movil: !!isMobile });
    });
  }

  // docs/18 GM-04: la búsqueda con puntos, calles y una dirección.
  test('búsqueda (funciones de mapa para emergencias)', async ({ page, isMobile }) => {
    await conSesion(page);
    await simularRpc(page, { fn_listar_puntos: LISTADO, fn_registrar_error: null });
    await page.route('**/api/geocodificar', (r) =>
      r.fulfill({
        json: {
          resultados: [
            {
              etiqueta: 'Calle Real, 12, Albolote',
              tipo: 'portal',
              lat: 37.231929,
              lng: -3.657528,
              municipio: 'albolote',
            },
          ],
          fuente: 'CartoCiudad (IGN/CNIG)',
        },
      }),
    );
    await page.goto('/');
    await page.getByRole('searchbox', { name: T.mapa.buscar }).fill('real 12');
    await expect(page.getByRole('group', { name: T.busqueda.direcciones }).getByRole('button')).toBeVisible();
    await auditar(page, 'búsqueda');
    await geometria(page, 'búsqueda', { movil: !!isMobile });
  });

  test('formulario de alta, que es el que más campos tiene', async ({ page, isMobile }) => {
    await conSesion(page);
    await simularRpc(page, { fn_listar_puntos: LISTADO, fn_registrar_error: null });
    await page.goto('/proponer/alta');
    await expect(page.getByTestId('selector-pin')).toBeVisible();
    await auditar(page, 'alta');
    await geometria(page, 'alta', { movil: !!isMobile });
  });

  test('mis propuestas y ajustes', async ({ page, isMobile }) => {
    await conSesion(page);
    await simularRpc(page, { fn_listar_puntos: LISTADO, fn_mis_propuestas: [], fn_registrar_error: null });
    await page.goto('/mis-propuestas');
    await auditar(page, 'mis propuestas');
    await geometria(page, 'mis propuestas', { movil: !!isMobile });
    await page.goto('/ajustes');
    await auditar(page, 'ajustes');
    await geometria(page, 'ajustes', { movil: !!isMobile });
  });
});

test.describe('acciones destructivas (UI-13, RV-29)', () => {
  test('la hoja de cerrar sesión y un envío fallido en Mis propuestas', async ({ page, isMobile }) => {
    await conSesion(page);
    await simularRpc(page, { fn_listar_puntos: LISTADO, fn_mis_propuestas: [], fn_registrar_error: null });
    await page.goto('/ajustes');
    await page.getByRole('button', { name: T.ajustes.cerrarSesion }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await geometria(page, 'hoja de cerrar sesión', { movil: !!isMobile });

    // Un envío con fallo: "Reintentar" y "Descartar" juntos.
    await page.goto('/');
    await page.evaluate(
      () =>
        new Promise<void>((ok, ko) => {
          const abrir = indexedDB.open('hidrantes');
          abrir.onerror = () => ko(abrir.error);
          abrir.onsuccess = () => {
            const t = abrir.result.transaction('cola', 'readwrite');
            t.objectStore('cola').put({
              clave_local: 'k-geometria',
              creada_en: Date.now(),
              args: { clave_local: 'k-geometria', operacion: 'estado', punto_id: 'x', datos: {} },
              foto: null,
              foto_path: null,
              codigo: 'HID-9001',
              intentos: 0,
              proximo: 0,
              fallo: 'PAYLOAD_INVALIDO(caudal)',
            });
            t.oncomplete = () => ok();
          };
        }),
    );
    await page.goto('/mis-propuestas');
    await expect(page.getByRole('button', { name: T.misPropuestas.descartar })).toBeVisible();
    await geometria(page, 'mis propuestas con un fallo', { movil: !!isMobile });
  });
});

test.describe('panel de jefatura', () => {
  // El panel es de escritorio (FR-100).
  test.skip(({ isMobile }) => !!isMobile, 'el panel se audita en escritorio');

  test('cola de revisión e inventario', async ({ page }) => {
    await conGoogle(page, 'jefa@example.org');
    await simularTablas(page, { v_puntos_activos: PUNTOS, v_cola_revision: [], propuestas: [] });
    await page.route(`${SUPABASE_PRUEBAS}/rest/v1/rpc/fn_es_admin`, (r) =>
      r.fulfill({ contentType: 'application/json', body: 'true' }),
    );
    await page.goto('/admin/cola');
    await expect(page.getByRole('region', { name: T.panelCola.colaRevision })).toBeVisible();
    await auditar(page, 'panel · cola');
    await geometria(page, 'panel · cola', { movil: false });

    await page.goto('/admin/inventario');
    await expect(page.getByRole('table')).toBeVisible();
    await auditar(page, 'panel · inventario');
    await geometria(page, 'panel · inventario', { movil: false });
  });

  // docs/18 RV-50: la geometría en todas las pantallas del panel, no solo en la cola y el inventario.
  test('caducadas, registro, voluntarios, papelera y ajustes', async ({ page }) => {
    await conGoogle(page, 'jefa@example.org');
    await simularTablas(page, {
      v_puntos_activos: PUNTOS,
      v_cola_revision: [],
      v_registro: [],
      propuestas: [],
      puntos: [],
      incidencias_app: [],
      config: [],
      administradores: [
        { email: 'jefa@example.org', activo: true, creado_en: '2026-08-01T10:00:00Z', creado_por: 'migracion' },
      ],
      dispositivos: [],
      nucleos: [],
    });
    await simularRpc(page, {
      fn_es_admin: true,
      fn_salud: {
        pendientes_14d: 0,
        incidencias_abiertas: 0,
        errores_7d: 0,
        sin_direccion: 0,
        dispositivos_activos: 3,
      },
      fn_actividad_voluntarios: [],
      fn_registrar_error: null,
    });
    const pantallas: [string, string, (p: Page) => ReturnType<Page['getByRole']>][] = [
      ['caducadas', '/admin/caducadas', (p) => p.getByRole('main')],
      ['registro', '/admin/registro', (p) => p.getByRole('main')],
      ['voluntarios', '/admin/voluntarios', (p) => p.getByRole('main')],
      ['papelera', '/admin/papelera', (p) => p.getByRole('main')],
      ['ajustes', '/admin/ajustes', (p) => p.getByRole('region', { name: T.panel.saludSistema })],
    ];
    for (const [nombre, ruta, listo] of pantallas) {
      await page.goto(ruta);
      await expect(listo(page)).toBeVisible();
      await auditar(page, `panel · ${nombre}`);
      await geometria(page, `panel · ${nombre}`, { movil: false });
    }
  });
});

// docs/19 RV-59: el aviso "Buscando tu posición…" se montaba sobre el botón de capas.
test.describe('avisos flotantes del mapa (RV-59)', () => {
  test.skip(({ isMobile }) => !isMobile, 'móvil y tableta; en ordenador la columna va arriba del todo');

  for (const [nombre, tamano] of [
    ['móvil', null],
    ['tableta', { width: 820, height: 1180 }],
  ] as const) {
    test(`ningún aviso flotante se solapa con un botón del mapa (${nombre})`, async ({ page }) => {
      if (tamano) await page.setViewportSize(tamano);
      // Permiso de ubicación denegado: el aviso más largo que sale sobre el mapa.
      await page.addInitScript(() => {
        const geo = {
          watchPosition(_ok: PositionCallback, error?: PositionErrorCallback | null) {
            setTimeout(() => error?.({ code: 1, PERMISSION_DENIED: 1 } as GeolocationPositionError), 50);
            return 1;
          },
          clearWatch() {},
          getCurrentPosition() {},
        };
        Object.defineProperty(navigator, 'geolocation', { value: geo, configurable: true });
      });
      await conSesion(page);
      await simularRpc(page, { fn_listar_puntos: LISTADO, fn_registrar_error: null });
      await page.goto('/');
      await expect(page.getByText(T.mapa.nPuntos(PUNTOS.length), { exact: false })).toBeVisible();
      await page.getByRole('button', { name: T.mapa.miPosicion }).click();
      await expect(page.getByRole('status').filter({ hasText: T.mapa.posicionDenegada })).toBeVisible();

      const avisos = await page.getByTestId('avisos-mapa').locator(':scope > *').all();
      expect(avisos.length).toBeGreaterThan(0);
      const botones = [
        T.mapa.capas,
        T.medir.boton,
        T.mapa.miPosicion,
        T.incidente.boton,
        T.mapa.acercar,
        T.mapa.alejar,
      ];
      for (const aviso of avisos) {
        const a = (await aviso.boundingBox())!;
        for (const nombreBoton of botones) {
          const b = (await page.getByRole('button', { name: nombreBoton, exact: true }).first().boundingBox())!;
          const ancho = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
          const alto = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
          expect(ancho * alto, `el aviso tapa "${nombreBoton}"`).toBe(0);
        }
      }
    });

    // docs/20 RV-76: el aviso de inventario vacío tapaba en parte el botón "+" del zoom.
    test(`el aviso de inventario vacío no se solapa con ningún botón del mapa (${nombre})`, async ({ page }) => {
      if (tamano) await page.setViewportSize(tamano);
      await conSesion(page);
      await simularRpc(page, {
        fn_listar_puntos: { ...LISTADO, puntos: [], sincronizado_en: new Date().toISOString() },
        fn_registrar_error: null,
      });
      await page.goto('/');
      const aviso = page.getByTestId('aviso-sin-puntos');
      await expect(aviso).toContainText(T.mapa.inventarioVacio);
      const a = (await aviso.boundingBox())!;
      const nodoAviso = await aviso.elementHandle();
      const botones = await page.getByRole('button').all();
      expect(botones.length).toBeGreaterThan(5);
      for (const boton of botones) {
        // Los botones del propio aviso no cuentan.
        if (await boton.evaluate((b, av) => av!.contains(b), nodoAviso)) continue;
        const b = await boton.boundingBox();
        if (!b) continue;
        const ancho = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
        const alto = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
        const nombreBoton = (await boton.getAttribute('aria-label')) ?? (await boton.innerText());
        expect(ancho * alto, `el aviso tapa "${nombreBoton}"`).toBe(0);
      }
    });
  }
});
