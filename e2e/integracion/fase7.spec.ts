// Integración de la Fase 7 contra la pila local real (INTEGRACION=1, ci-sql). Criterio de salida:
// aprobar 20 revisiones en bloque en menos de 30 s y verlas en `registro`; detectar y fusionar un
// duplicado a 8 m; una propuesta desactualizada exige confirmación; el formulario de correcciones
// guarda `correcciones` y el autor lo ve en Mis propuestas.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { T } from '../../src/lib/textos.ts';
import { sesionDeJefatura } from './sesion-google.ts';

const BD = process.env.BD_PRUEBAS ?? 'postgresql://postgres:postgres@127.0.0.1:55422/postgres'; // detectar-secretos:permitir (Supabase local efímero)
const RAIZ = path.resolve(import.meta.dirname, '../..');

// El panel es de escritorio (FR-100): el proyecto de integración emula un móvil, así que aquí no.
test.use({ viewport: { width: 1400, height: 900 }, isMobile: false, hasTouch: false });

function consulta(sql: string): string {
  // Sin acentos en el SQL: en Windows psql interpreta el argumento con la página de códigos de la
  // consola y un carácter no ASCII llegaría roto (PGCLIENTENCODING no lo arregla).
  return execFileSync('psql', ['-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', BD, '-c', sql], {
    encoding: 'utf8',
    env: { ...process.env, PGCLIENTENCODING: 'UTF8' },
  }).trim();
}

function variables(archivo: string): Record<string, string> {
  return Object.fromEntries(
    readFileSync(path.join(RAIZ, archivo), 'utf8')
      .split('\n')
      .filter((l) => /^[A-Z_]+=/.test(l))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
  );
}

/** Sesión de Google de un administrador nuevo, como en la Fase 6. */
async function entrarComoJefatura(page: Page, request: APIRequestContext): Promise<string> {
  const env = variables('.env.local');
  const servicio = variables('.dev.vars').SUPABASE_SERVICE_ROLE_KEY;
  const correo = `panel.${Date.now()}@example.org`;
  consulta(`insert into hidrantes.administradores (email, creado_por) values ('${correo}', 'prueba')`);
  // Jefatura exige una sesión de Google (RV-36): la local se vuelve a firmar como tal.
  const sesion = await sesionDeJefatura(
    request,
    { url: env.VITE_SUPABASE_URL, anon: env.VITE_SUPABASE_ANON_KEY, servicio },
    correo,
  );
  await page.addInitScript((s) => {
    if (!sessionStorage.getItem('g')) {
      sessionStorage.setItem('g', '1');
      localStorage.setItem('hidrantes.auth', s);
    }
  }, JSON.stringify(sesion));
  return correo;
}

/** Un punto activo con una propuesta pendiente de la operación que se pida. */
function sembrarPunto(
  marca: string,
  autor: string,
  i: number,
  operacion: string,
  datos: string,
  lat = 37.231,
  lng = -3.656,
): string {
  const codigo = consulta(`select hidrantes.fn_siguiente_codigo('hidrante')`);
  // Con CTE: psql imprimiría también el "INSERT 0 1" de un returning suelto.
  const punto = consulta(`
    with nuevo as (insert into hidrantes.puntos (codigo, tipo, geom, diametro_mm, caudal, foto_path, municipio, nucleo,
                                  fecha_ultima_revision, descripcion, actualizado_en)
    values ('${codigo}', 'hidrante', 'SRID=4326;POINT(${lng + i * 0.0002} ${lat})', 70, 'bueno',
            'fotos/p-${i}.jpg', 'albolote', 'Albolote', current_date - 400, '${marca} #${i}',
            now() - interval '1 day')
    returning id)
    select id from nuevo`);
  consulta(`
    insert into hidrantes.propuestas (punto_id, operacion, datos, autor_nombre, autor_apellido, dispositivo_id,
                                      clave_local, foto_path, creada_en)
    values ('${punto}', '${operacion}', '${datos}'::jsonb, '${autor}', 'F7', gen_random_uuid(),
            '${marca}-${i}', 'fotos/r-${i}.jpg', now() - interval '2 hours')`);
  return punto;
}

test('20 revisiones aprobadas en bloque en menos de 30 s, y en el registro (criterio)', async ({ page, request }) => {
  const marca = `[PRUEBA] F7 ${Date.now()}`;
  const autor = `Lote${Date.now()}`;
  for (let i = 1; i <= 20; i++) sembrarPunto(marca, autor, i, 'revision', '{}');
  await entrarComoJefatura(page, request);

  await page.goto('/admin/cola');
  // La búsqueda global deja en pantalla solo las de este caso: la base local es compartida.
  await page.getByPlaceholder(T.panelCola.buscar).fill(autor);
  await page.getByLabel(T.panelCola.filtroOperacion).selectOption('revision');
  const lista = page.getByRole('region', { name: T.panelCola.colaRevision });
  await expect(lista.getByRole('listitem')).toHaveCount(20, { timeout: 20_000 });

  const empezo = Date.now();
  await page.getByLabel(T.panelCola.seleccionarTodas).check();
  await expect(page.getByText(T.panelCola.seleccionadas(20))).toBeVisible();
  await page.getByRole('button', { name: T.panelCola.aprobarSeleccionadas }).click();
  await expect(page.getByRole('status').filter({ hasText: T.panelCola.loteAprobadas(20) })).toBeVisible({
    timeout: 30_000,
  });
  const tardo = Date.now() - empezo;
  expect(tardo).toBeLessThan(30_000);

  expect(
    consulta(`select count(*) from hidrantes.propuestas where clave_local like '${marca}-%' and estado = 'aprobada'`),
  ).toBe('20');
  expect(
    consulta(`
      select count(*) from hidrantes.registro g
      join hidrantes.puntos p on p.id = g.punto_id
      where g.accion = 'aprobacion' and p.descripcion like '${marca} %'`),
  ).toBe('20');
  // Y la revisión quedó hecha hoy en los 20 puntos (FR-61).
  expect(
    consulta(
      `select count(*) from hidrantes.puntos where descripcion like '${marca} %' and fecha_ultima_revision = current_date`,
    ),
  ).toBe('20');
});

test('duplicado a 8 m: se detecta al proponer y se fusiona sin crear un punto nuevo (criterio)', async ({
  page,
  context,
  request,
}) => {
  const marca = `[PRUEBA] F7 dup ${Date.now()}`;
  // Un punto existente y un alta del voluntario a ~8 m: fn_proponer marca el duplicado (FR-51).
  // Un rincón sin puntos alrededor: así el único duplicado posible es el que se introduce aquí.
  const lat = 37.2733;
  const lng = -3.6186;
  const apellido = `Dup${Date.now()}`;
  // La base local es la misma entre ejecuciones: se deja el rincón libre para que el único duplicado
  // posible sea el de este caso.
  consulta(`
    update hidrantes.propuestas set duplicado_de = null
     where duplicado_de in (select id from hidrantes.puntos where descripcion like '[PRUEBA] F7 dup%')`);
  consulta(`
    delete from hidrantes.propuestas
     where punto_id in (select id from hidrantes.puntos where descripcion like '[PRUEBA] F7 dup%')`);
  consulta(`delete from hidrantes.puntos where descripcion like '[PRUEBA] F7 dup%'`);
  const codigo = consulta(`select hidrantes.fn_siguiente_codigo('hidrante')`);
  consulta(`
    insert into hidrantes.puntos (codigo, tipo, geom, diametro_mm, caudal, foto_path, municipio, nucleo,
                                  fecha_ultima_revision, descripcion)
    values ('${codigo}', 'hidrante', 'SRID=4326;POINT(${lng} ${lat})', 70, 'bueno', 'fotos/dup.jpg', 'albolote',
            'Albolote', current_date - 30, '${marca} existente')`);

  await context.grantPermissions(['geolocation']);
  // 0,00007° de latitud ≈ 8 m.
  await context.setGeolocation({ latitude: lat + 0.00007, longitude: lng, accuracy: 5 });
  await page.goto('/');
  await page.getByLabel(T.entrada.cifra(1)).fill('0');
  await page.keyboard.type('00000');
  await page.getByLabel(T.entrada.nombre).fill('Integración');
  await page.getByLabel(T.entrada.apellido).fill(apellido);
  await page.getByRole('button', { name: T.entrada.entrar, exact: true }).click();
  await page.getByRole('button', { name: T.bienvenida.saltar }).click();
  await expect(page.getByText(/Sincronizado/)).toBeVisible();

  await page.getByRole('button', { name: T.navegacion.nuevoPunto }).click();
  await page.getByRole('radio', { name: T.formulario.hidrante }).click();
  await page.getByRole('radio', { name: T.formulario.d70 }).click();
  await page.getByRole('radio', { name: T.formulario.regular }).click();
  const jpeg = await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 800;
    c.height = 600;
    c.getContext('2d')!.fillRect(0, 0, 800, 600);
    const b = await new Promise<Blob>((r) => c.toBlob((x) => r(x!), 'image/jpeg', 0.9));
    return Array.from(new Uint8Array(await b.arrayBuffer()));
  });
  await page
    .getByTestId('entrada-foto')
    .setInputFiles({ name: 'f.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(jpeg) });
  await page.getByLabel(T.formulario.descripcionOpcional).fill(`${marca} propuesta`);
  await page.getByRole('button', { name: T.envio.enviarRevision, exact: true }).click();
  await expect(page.getByRole('heading', { level: 2, name: T.envio.enviado })).toBeVisible({ timeout: 20_000 });

  const distancia = consulta(`
    select round(distancia_duplicado_m::numeric)
    from hidrantes.propuestas where datos ->> 'descripcion' = '${marca} propuesta'`);
  expect(Number(distancia)).toBeGreaterThan(0);
  expect(Number(distancia)).toBeLessThan(15);

  // Jefatura lo ve señalado y lo fusiona con el existente.
  await entrarComoJefatura(page, request);
  await page.goto('/admin/cola');
  await page.getByPlaceholder(T.panelCola.buscar).fill(apellido);
  await page
    .getByRole('button', { name: new RegExp(apellido) })
    .first()
    .click();
  const detalle = page.getByRole('article');
  await expect(detalle.getByText(T.panelCola.posibleDuplicado)).toBeVisible();
  await detalle.getByRole('button', { name: T.panelCola.fusionarCon(codigo) }).click();
  await detalle.getByLabel(T.panelCola.campoEstado).selectOption('propuesta');
  await detalle.getByRole('button', { name: T.panelCola.fusionar, exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: T.panelCola.fusionada(codigo) })).toBeVisible();

  // Fusionar no crea un punto nuevo: si lo creara, llevaría la descripción de esta propuesta. Se
  // cuenta solo lo de esta prueba y no el total de la tabla, porque los demás casos de integración
  // corren a la vez y dan de alta sus propios puntos.
  expect(consulta(`select count(*) from hidrantes.puntos where descripcion = '${marca} propuesta'`)).toBe('0');
  expect(
    consulta(
      `select caudal::text || '|' || (fecha_ultima_revision = current_date)::text from hidrantes.puntos where codigo = '${codigo}'`,
    ),
  ).toBe('regular|true');
  expect(
    consulta(
      `select correcciones ->> 'fusionada_con' from hidrantes.propuestas where datos ->> 'descripcion' = '${marca} propuesta'`,
    ),
  ).toBe(codigo);
});

test('propuesta desactualizada: exige confirmación; las correcciones llegan al autor (criterio)', async ({
  page,
  request,
}) => {
  const marca = `[PRUEBA] F7 desact ${Date.now()}`;
  const autor = `Desact${Date.now()}`;
  const punto = sembrarPunto(marca, autor, 1, 'estado', '{"caudal": "malo"}', 37.2295, -3.6602);
  // El punto cambia después de enviarse la propuesta.
  consulta(`update hidrantes.puntos set caudal = 'regular', actualizado_en = now() where id = '${punto}'`);

  await entrarComoJefatura(page, request);
  await page.goto('/admin/cola');
  await page.getByPlaceholder(T.panelCola.buscar).fill(autor);
  const lista = page.getByRole('region', { name: T.panelCola.colaRevision });
  await expect(lista.getByRole('listitem')).toHaveCount(1, { timeout: 20_000 });
  await lista.getByRole('listitem').first().getByRole('button').click();
  const detalle = page.getByRole('article');
  await expect(detalle.getByText(T.panelCola.senalDesactualizada)).toBeVisible({ timeout: 20_000 });
  // El botón normal no está: hay que confirmar expresamente (FR-108).
  await expect(detalle.getByRole('button', { name: T.panelCola.aprobar, exact: true })).toHaveCount(0);

  // Y con correcciones: se guardan y el autor las ve en Mis propuestas (FR-106, FR-90).
  await detalle.getByRole('button', { name: T.panelCola.aprobarConCorrecciones }).click();
  await detalle.getByLabel(T.panelCola.campoEstado).selectOption('no_funciona');
  await detalle.getByLabel(T.panelCola.campoFallo).fill('Arqueta cegada');
  await detalle.getByRole('button', { name: T.panelCola.guardarYAprobar }).click();
  await expect(page.getByRole('status').filter({ hasText: /Aprobada con correcciones/ })).toBeVisible();

  expect(consulta(`select correcciones ->> 'caudal' from hidrantes.propuestas where clave_local = '${marca}-1'`)).toBe(
    'no_funciona',
  );
  expect(
    consulta(
      `select accion from hidrantes.registro where propuesta_id = (select id from hidrantes.propuestas where clave_local = '${marca}-1')`,
    ),
  ).toBe('aprobacion_con_correcciones');

  // El autor, en su móvil: la propuesta aparece aprobada y con las correcciones.
  const dispositivo = consulta(`select dispositivo_id from hidrantes.propuestas where clave_local = '${marca}-1'`);
  const token = `token-f7-${Date.now()}`; // detectar-secretos:permitir (token efímero del Supabase local)
  consulta(
    `insert into hidrantes.dispositivos (dispositivo_id, token_hash) values ('${dispositivo}', hidrantes.fn_sha256('${token}'))`,
  );
  await page.context().clearCookies();
  await page.addInitScript(
    ([t, d]) => {
      localStorage.clear();
      localStorage.setItem('hidrantes.token', JSON.stringify(t));
      localStorage.setItem('hidrantes.dispositivo_id', JSON.stringify(d));
      localStorage.setItem('hidrantes.firma', JSON.stringify({ nombre: 'Integracion', apellido: 'Fase Siete' }));
      localStorage.setItem('hidrantes.primer_uso_visto', 'true');
    },
    [token, dispositivo] as const,
  );
  await page.goto('/mis-propuestas');
  await expect(page.getByText(T.misPropuestas.aprobada).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/con correcciones/)).toBeVisible();
});

// RV-15 (TR-60): PostgREST corta en 1.000 filas y la lectura de jefatura es una sustitución completa.
// Con más de 1.000 puntos el inventario tiene que enseñarlos todos.
test('el inventario del panel enseña más de 1.000 puntos (RV-15, TR-60)', async ({ page, request }) => {
  const antes = Number(consulta(`select count(*) from hidrantes.puntos where situacion = 'activo'`));
  consulta(`
    insert into hidrantes.puntos (codigo, tipo, geom, diametro_mm, caudal, foto_path, municipio, fecha_ultima_revision,
                                  descripcion)
    select 'HID-' || (7000 + i), 'hidrante',
           ('SRID=4326;POINT(' || (-3.66 + (i % 40) * 0.0004) || ' ' || (37.22 + (i / 40) * 0.0004) || ')')::extensions.geography,
           70, 'bueno', 'fotos/carga-' || i || '.jpg', 'albolote', current_date, '[PRUEBA] carga ' || i
    from generate_series(0, 1049) i`);
  try {
    await entrarComoJefatura(page, request);
    await page.goto('/admin/inventario');
    await expect(page.getByText(T.panel.mostrando(50, antes + 1050), { exact: false })).toBeVisible({
      timeout: 20_000,
    });
  } finally {
    consulta(`delete from hidrantes.puntos where codigo between 'HID-7000' and 'HID-8049'`);
  }
});
