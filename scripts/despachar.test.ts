// docs/31 RV-137: el despachador recoge los pedidos del panel en producción y lanza su workflow.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ARCHIVO, RAMA, WORKFLOWS, despachar, lanzar, pendientes, type Entorno } from './despachar.ts';
import { ErrorDeScript } from './lib/comun.ts';

const SUPABASE = 'https://proyecto.supabase.co';

interface Llamada {
  url: string;
  cuerpo: unknown;
  cabeceras: Record<string, string>;
}

/** fetch simulado: responde por URL y anota cada llamada. */
function simulado(respuestas: {
  pendientes?: Response | (() => Response);
  marcar?: (cuerpo: { id: unknown; resultado: string }) => Response;
  github?: (archivo: string, cuerpo: unknown) => Response | null;
}) {
  const llamadas: Llamada[] = [];
  const f = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    const cuerpo: unknown = init?.body ? JSON.parse(String(init.body)) : null;
    llamadas.push({ url: u, cuerpo, cabeceras: (init?.headers ?? {}) as Record<string, string> });
    if (u.endsWith('/rpc/fn_pedidos_pendientes')) {
      const r = respuestas.pendientes ?? Response.json([]);
      return typeof r === 'function' ? r() : r;
    }
    if (u.endsWith('/rpc/fn_marcar_pedido')) {
      return respuestas.marcar?.(cuerpo as { id: unknown; resultado: string }) ?? new Response(null, { status: 204 });
    }
    const m = /\/actions\/workflows\/([^/]+)\/dispatches$/.exec(u);
    if (m) {
      const r = respuestas.github ? respuestas.github(m[1]!, cuerpo) : new Response(null, { status: 204 });
      if (!r) throw new TypeError('fetch failed', { cause: { code: 'ENOTFOUND' } });
      return r;
    }
    throw new Error(`URL inesperada: ${u}`);
  });
  const entorno: Entorno = {
    supabaseUrl: SUPABASE,
    servicio: 'clave-de-servicio', // detectar-secretos:permitir (valor de prueba)
    githubToken: 'token-de-prueba', // detectar-secretos:permitir (valor de prueba)
    repo: 'dueno/repo',
    fetch: f as unknown as typeof fetch,
  };
  return { entorno, llamadas };
}

const marcados = (llamadas: Llamada[]) =>
  llamadas.filter((l) => l.url.endsWith('/rpc/fn_marcar_pedido')).map((l) => l.cuerpo);

describe('despachar', () => {
  it('sin pedidos no lanza ni marca nada', async () => {
    const { entorno, llamadas } = simulado({});
    expect(await despachar(entorno)).toEqual({ lanzados: 0, fallidos: 0, errores: [] });
    expect(llamadas.map((l) => l.url)).toEqual([`${SUPABASE}/rest/v1/rpc/fn_pedidos_pendientes`]);
  });

  it('lanza cada pedido en develop, con sus entradas, y lo marca como lanzado', async () => {
    const { entorno, llamadas } = simulado({
      pendientes: Response.json([
        { id: 1, workflow: 'purgar-fotos', pedido_en: '2026-10-07T10:00:00Z' },
        { id: 2, workflow: 'regenerar-zona', pedido_en: '2026-10-07T10:01:00Z' },
      ]),
    });
    expect(await despachar(entorno)).toEqual({ lanzados: 2, fallidos: 0, errores: [] });
    const despachos = llamadas.filter((l) => l.url.includes('/dispatches'));
    expect(despachos.map((l) => [l.url, l.cuerpo])).toEqual([
      ['https://api.github.com/repos/dueno/repo/actions/workflows/purgar-fotos.yml/dispatches', { ref: 'develop' }],
      [
        'https://api.github.com/repos/dueno/repo/actions/workflows/mantenimiento.yml/dispatches',
        { ref: 'develop', inputs: { trabajo: 'regenerar-zona' } },
      ],
    ]);
    expect(despachos[0]!.cabeceras.Authorization).toBe('Bearer token-de-prueba');
    expect(marcados(llamadas)).toEqual([
      { id: 1, resultado: 'lanzado' },
      { id: 2, resultado: 'lanzado' },
    ]);
  });

  it('llama a la base de datos con la clave de servicio y el esquema hidrantes', async () => {
    const { entorno, llamadas } = simulado({});
    await despachar(entorno);
    expect(llamadas[0]!.cabeceras).toMatchObject({
      Authorization: 'Bearer clave-de-servicio',
      'Content-Profile': 'hidrantes',
      'Accept-Profile': 'hidrantes',
    });
  });

  it('si GitHub no acepta uno, lo marca con el error, sigue con los demás y lo cuenta', async () => {
    const { entorno, llamadas } = simulado({
      pendientes: Response.json([
        { id: 'a', workflow: 'respaldo' },
        { id: 'b', workflow: 'purgar-fotos' },
        { id: 'c', workflow: 'regenerar-mapabase' },
      ]),
      github: (archivo) =>
        archivo === 'respaldo.yml'
          ? Response.json({ message: 'Unexpected inputs provided:\n ["x"]' }, { status: 422 })
          : archivo === 'purgar-fotos.yml'
            ? null
            : new Response(null, { status: 204 }),
    });
    const errores = [
      'error: GitHub respondió 422: Unexpected inputs provided: ["x"]',
      'error: GitHub no respondió (ENOTFOUND)',
    ];
    expect(await despachar(entorno)).toEqual({
      lanzados: 1,
      fallidos: 2,
      errores: [`respaldo: ${errores[0]}`, `purgar-fotos: ${errores[1]}`],
    });
    expect(marcados(llamadas)).toEqual([
      { id: 'a', resultado: errores[0] },
      { id: 'b', resultado: errores[1] },
      { id: 'c', resultado: 'lanzado' },
    ]);
  });

  it('un cuerpo de GitHub que no es JSON se anota recortado, en una línea', async () => {
    const { entorno } = simulado({ github: () => new Response(`Bad\ngateway ${'x'.repeat(400)}`, { status: 502 }) });
    const r = await lanzar(entorno, 'respaldo');
    expect(r.startsWith('error: GitHub respondió 502: Bad gateway xxx')).toBe(true);
    expect(r).not.toContain('\n');
    expect(r.length).toBe(200);
  });

  it('un trabajo que no conoce no se lanza: se marca con error', async () => {
    const { entorno, llamadas } = simulado({ pendientes: Response.json([{ id: 9, workflow: 'borrar-todo' }]) });
    expect(await despachar(entorno)).toMatchObject({ lanzados: 0, fallidos: 1 });
    expect(llamadas.some((l) => l.url.includes('/dispatches'))).toBe(false);
    expect(marcados(llamadas)).toEqual([{ id: 9, resultado: 'error: trabajo desconocido (borrar-todo)' }]);
  });

  it('si no puede marcar un pedido, se para (y falla) antes de lanzar el siguiente', async () => {
    const { entorno, llamadas } = simulado({
      pendientes: Response.json([
        { id: 1, workflow: 'respaldo' },
        { id: 2, workflow: 'purgar-fotos' },
      ]),
      marcar: () => new Response('{}', { status: 500 }),
    });
    await expect(despachar(entorno)).rejects.toThrow(/fn_marcar_pedido respondió 500 para el pedido 1/);
    expect(llamadas.filter((l) => l.url.includes('/dispatches'))).toHaveLength(1);
  });
});

describe('pendientes: una respuesta rara para todo', () => {
  it.each([
    ['un error de la base de datos', new Response('{}', { status: 401 }), /respondió 401/],
    ['algo que no es una lista', Response.json({ id: 1 }), /no devolvió una lista/],
    ['JSON roto', new Response('no es json', { status: 200 }), /no devolvió una lista/],
    ['una fila sin workflow', Response.json([{ id: 1 }]), /sin id o sin workflow/],
    ['una fila sin id', Response.json([{ workflow: 'respaldo' }]), /sin id o sin workflow/],
    ['una fila nula', Response.json([null]), /sin id o sin workflow/],
  ])('%s', async (_n, respuesta, motivo) => {
    const { entorno, llamadas } = simulado({ pendientes: respuesta });
    const e = await pendientes(entorno).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ErrorDeScript);
    expect((e as Error).message).toMatch(motivo);
    expect(llamadas.some((l) => l.url.includes('/dispatches'))).toBe(false);
  });

  // Producción va por detrás hasta 0.9.0: sin 0040 no puede haber pedidos, y el despachador no debe
  // abrir una issue cada 15 minutos. Solo «la función no existe» (PGRST202); otro 404 se para.
  it('sin la función (404 PGRST202, producción antes de 0040): no hay pedidos', async () => {
    const { entorno } = simulado({ pendientes: Response.json({ code: 'PGRST202' }, { status: 404 }) });
    expect(await pendientes(entorno)).toEqual([]);
  });

  it('otro 404 sí se para', async () => {
    const { entorno } = simulado({ pendientes: new Response('Not found', { status: 404 }) });
    await expect(pendientes(entorno)).rejects.toThrow(/respondió 404/);
  });

  it('sin red, se para', async () => {
    const { entorno } = simulado({
      pendientes: () => {
        throw new TypeError('fetch failed', { cause: { code: 'ECONNRESET' } });
      },
    });
    await expect(pendientes(entorno)).rejects.toThrow(/no respondió a fn_pedidos_pendientes \(ECONNRESET\)/);
  });
});

describe('la tabla de trabajos', () => {
  const carpeta = path.resolve(import.meta.dirname, '../.github/workflows');

  it('tiene los cuatro de siempre', () => {
    expect([...WORKFLOWS].sort()).toEqual(['purgar-fotos', 'regenerar-mapabase', 'regenerar-zona', 'respaldo']);
    expect(RAMA).toBe('develop');
  });

  it.each(WORKFLOWS)('%s: su archivo existe, acepta workflow_dispatch y declara sus entradas', (w) => {
    const { archivo, entradas } = ARCHIVO[w];
    const texto = readFileSync(path.join(carpeta, archivo), 'utf8');
    expect(texto).toMatch(/^\s{2}workflow_dispatch:/m);
    for (const [clave, valor] of Object.entries(entradas ?? {})) {
      expect(texto).toMatch(new RegExp(`^\\s{6}${clave}:`, 'm'));
      expect(texto).toContain(valor);
    }
  });

  it('lanzar devuelve el error, no lanza una excepción, con un nombre desconocido', async () => {
    const { entorno } = simulado({});
    expect(await lanzar(entorno, 'x')).toBe('error: trabajo desconocido (x)');
  });
});

describe('despachador.yml', () => {
  const carpeta = path.resolve(import.meta.dirname, '../.github/workflows');
  const yml = readFileSync(path.join(carpeta, 'despachador.yml'), 'utf8');

  // Los pedidos no se reclaman en la base de datos: dos pasadas a la vez lanzarían el mismo dos veces.
  it('nunca dos pasadas a la vez', () => {
    expect(yml).toMatch(/^concurrency:\n {2}group: despachador\n {2}cancel-in-progress: false$/m);
  });

  it('cada 15 minutos y a mano', () => {
    expect(yml).toMatch(/^\s{4}- cron: '7,22,37,52 \* \* \* \*'$/m);
    expect(yml).toMatch(/^\s{2}workflow_dispatch:$/m);
  });

  it('en el environment prod-tareas, con la clave de servicio de producción y el GITHUB_TOKEN', () => {
    expect(yml).toMatch(/^\s{4}environment: prod-tareas$/m);
    expect(yml).toContain('SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY_PROD }}');
    expect(yml).toContain('SUPABASE_URL: ${{ vars.SUPABASE_URL_PROD }}');
    expect(yml).toContain('GH_TOKEN: ${{ github.token }}');
    expect(yml).toMatch(/^\s{2}actions: write$/m);
    expect(yml).not.toMatch(/GITHUB_DISPATCH_TOKEN|secrets\.GITHUB_TOKEN_/);
  });

  it('sin npm ci: ninguna dependencia de npm corre con la clave de servicio', () => {
    const sinComentarios = yml.replace(/^\s*#.*$/gm, '');
    expect(sinComentarios).not.toMatch(/npm (ci|install|run)|npx |\.\/\.github\/actions\/preparar/);
    expect(yml).toContain('run: node scripts/despachar.ts');
    // Solo módulos de Node: lo que importa despachar.ts y lo que importa a su vez.
    for (const archivo of ['despachar.ts', 'lib/comun.ts']) {
      const fuente = readFileSync(path.resolve(import.meta.dirname, archivo), 'utf8');
      // También los import de varias líneas: basta con el `from '…'`.
      for (const [, modulo] of fuente.matchAll(/\bfrom '([^']+)'/g)) {
        expect(modulo, `${archivo}: ${modulo}`).toMatch(/^(node:|\.\/)/);
      }
    }
  });

  // Lo que corre en despachador.yml, tal cual: Node quita los tipos, sin tsx. Si alguien mete en
  // despachar.ts o lib/comun.ts algo que no se pueda quitar (enum, namespace…), esto falla.
  it('node lo carga sin tsx y, sin variables, se para diciendo qué falta', () => {
    const env = { ...process.env };
    for (const v of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'GH_TOKEN', 'GITHUB_REPOSITORY']) delete env[v];
    const r = spawnSync(process.execPath, ['scripts/despachar.ts'], {
      cwd: path.resolve(import.meta.dirname, '..'),
      encoding: 'utf8',
      env,
    });
    expect(r.status, r.stderr).toBe(1);
    expect(r.stderr + r.stdout).toContain('Faltan SUPABASE_URL');
  });

  describe('las issues', () => {
    const desde = yml.indexOf('- name: Abrir o cerrar las issues del despachador');
    const paso = yml.slice(desde);
    const guion = paso
      .slice(paso.indexOf('run: |\n') + 'run: |\n'.length)
      .split('\n')
      .map((l) => l.replace(/^ {10}/, ''))
      .join('\n');
    const tieneJq = spawnSync('bash', ['-c', 'command -v jq'], { encoding: 'utf8' }).status === 0;
    const FALLO = 'El despachador de trabajos ha fallado';
    const PEDIDO = 'Un trabajo pedido desde el panel no se ha lanzado';
    /** gh simulado con jq de verdad; lo que no es leer se anota. */
    const correr = (estado: string, conError: string, issues: { number: number; title: string }[]) => {
      const dir = mkdtempSync(path.join(tmpdir(), 'despachador-'));
      const anotado = path.join(dir, 'anotado');
      try {
        const gh = [
          'gh() {',
          '  local filtro="" a=("$@") i',
          '  for ((i = 0; i < ${#a[@]}; i++)); do if [ "${a[i]}" = --jq ]; then filtro="${a[i+1]}"; fi; done',
          '  if [ "$1 $2" = "issue list" ]; then printf "%s" "$ISSUES" | jq -r "$filtro"; return; fi',
          '  echo "gh $1 $2 $3" >> "$ANOTADO"',
          '}',
        ].join('\n');
        const r = spawnSync('bash', ['-e', '-c', `${gh}\n${guion}`], {
          encoding: 'utf8',
          env: {
            ...process.env,
            ANOTADO: anotado,
            ESTADO: estado,
            CON_ERROR: conError,
            EJECUCION: 'https://ejecucion',
            ISSUES: JSON.stringify(issues.map((i) => ({ ...i, state: 'OPEN' }))),
          },
        });
        expect(r.status, r.stderr).toBe(0);
        return existsSync(anotado) ? readFileSync(anotado, 'utf8') : '';
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    };

    it('corre siempre y lee la salida de despachar.ts por env, no dentro del guion', () => {
      expect(desde).toBeGreaterThan(-1);
      expect(paso).toContain('if: always()');
      expect(paso).toContain('CON_ERROR: ${{ steps.despachar.outputs.con_error }}');
      expect(guion).not.toContain('${{');
    });

    it.skipIf(!tieneJq)('todo bien: cierra la del fallo, y la de un pedido con error no la toca', () => {
      const issues = [
        { number: 3, title: FALLO },
        { number: 4, title: PEDIDO },
      ];
      expect(correr('success', '', issues)).toBe('gh issue close 3\n');
    });

    it.skipIf(!tieneJq)('la ejecución falla: abre la del fallo una sola vez', () => {
      expect(correr('failure', '', [])).toBe('gh issue create --title\n');
      expect(correr('failure', '', [{ number: 3, title: FALLO }])).toBe('');
    });

    it.skipIf(!tieneJq)('un pedido con error: abre su issue, o comenta en la abierta, y no la cierra', () => {
      const conError = 'respaldo: error: GitHub respondió 422: x';
      expect(correr('success', conError, [])).toBe('gh issue create --title\n');
      expect(correr('success', conError, [{ number: 4, title: PEDIDO }])).toBe('gh issue comment 4\n');
    });
  });

  it('está en las listas de workflows programados que se mantienen activos', () => {
    for (const a of ['mantener-activo.yml', 'vigilancia.yml']) {
      const texto = readFileSync(path.join(carpeta, a), 'utf8');
      for (const [, lista] of texto.matchAll(/^\s+WORKFLOWS: (.+)$/gm)) expect(lista, a).toContain('despachador.yml');
    }
  });
});
