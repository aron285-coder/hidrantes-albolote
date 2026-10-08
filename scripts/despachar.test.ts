// docs/31 RV-137: el despachador recoge los pedidos del panel en producción y lanza su workflow.
// docs/32 RV-201: en tres trabajos; solo el que lanza tiene actions: write (podría borrar el respaldo).

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ARCHIVO, RAMA, WORKFLOWS, marcarTodos, pendientes, separar, type Entorno } from './despachar.ts';
import { ErrorDeScript } from './lib/comun.ts';

const SUPABASE = 'https://proyecto.supabase.co';
const raiz = path.resolve(import.meta.dirname, '..');
const carpeta = path.join(raiz, '.github/workflows');
const yml = readFileSync(path.join(carpeta, 'despachador.yml'), 'utf8');
const tieneJq = spawnSync('bash', ['-c', 'command -v jq'], { encoding: 'utf8' }).status === 0;
// En la CI hay jq: ahí los tests de los guiones no se pueden saltar.
const sinJq = !tieneJq && !process.env.CI;

/** Un trabajo de despachador.yml, de su cabecera a la del siguiente. */
function trabajo(nombre: string): string {
  const desde = yml.indexOf(`\n  ${nombre}:\n`);
  expect(desde, nombre).toBeGreaterThan(-1);
  const resto = yml.slice(desde + 1);
  const fin = resto.slice(1).search(/\n {2}[a-z-]+:\n/);
  return fin === -1 ? resto : resto.slice(0, fin + 1);
}

/** El guion `run: |` de un paso, sin la sangría. */
function guionDe(texto: string, paso: string): string {
  const desde = texto.indexOf(`- name: ${paso}`);
  expect(desde, paso).toBeGreaterThan(-1);
  const resto = texto.slice(desde);
  return resto
    .slice(resto.indexOf('run: |\n') + 'run: |\n'.length)
    .split('\n')
    .filter((l, i, ls) => !(i === ls.length - 1 && l === ''))
    .map((l) => l.replace(/^ {10}/, ''))
    .join('\n');
}

interface Llamada {
  url: string;
  cuerpo: unknown;
  cabeceras: Record<string, string>;
}

/** fetch simulado: responde por URL y anota cada llamada. */
function simulado(respuestas: {
  pendientes?: Response | (() => Response);
  marcar?: (cuerpo: { id: unknown; resultado: string }) => Response;
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
    throw new Error(`URL inesperada: ${u}`);
  });
  const entorno: Entorno = {
    supabaseUrl: SUPABASE,
    servicio: 'clave-de-servicio', // detectar-secretos:permitir (valor de prueba)
    fetch: f as unknown as typeof fetch,
  };
  return { entorno, llamadas };
}

const marcados = (llamadas: Llamada[]) =>
  llamadas.filter((l) => l.url.endsWith('/rpc/fn_marcar_pedido')).map((l) => l.cuerpo);

describe('leer: separar', () => {
  it('los de la lista se lanzan; uno desconocido sale ya con su error', () => {
    expect(
      separar([
        { id: 1, workflow: 'purgar-fotos' },
        { id: 9, workflow: 'borrar-todo' },
        { id: 2, workflow: 'regenerar-zona' },
      ]),
    ).toEqual({
      lanzar: [
        { id: 1, workflow: 'purgar-fotos' },
        { id: 2, workflow: 'regenerar-zona' },
      ],
      rechazados: [{ id: 9, trabajo: 'borrar-todo', resultado: 'error: trabajo desconocido (borrar-todo)' }],
    });
  });
});

describe('marcar: marcarTodos', () => {
  it('anota cada pedido con lo que devolvió el trabajo lanzar (los id llegan como texto) y los rechazados', async () => {
    const { entorno, llamadas } = simulado({});
    const r = await marcarTodos(
      entorno,
      [
        { id: 1, workflow: 'purgar-fotos' },
        { id: 2, workflow: 'respaldo' },
      ],
      [{ id: 9, trabajo: 'borrar-todo', resultado: 'error: trabajo desconocido (borrar-todo)' }],
      [
        { id: '1', trabajo: 'purgar-fotos', resultado: 'lanzado' },
        { id: '2', trabajo: 'respaldo', resultado: 'error: GitHub: HTTP 422 Unexpected inputs' },
      ],
    );
    expect(marcados(llamadas)).toEqual([
      { id: 1, resultado: 'lanzado' },
      { id: 2, resultado: 'error: GitHub: HTTP 422 Unexpected inputs' },
      { id: 9, resultado: 'error: trabajo desconocido (borrar-todo)' },
    ]);
    expect(r).toEqual({
      lanzados: 1,
      fallidos: 2,
      errores: [
        'respaldo: error: GitHub: HTTP 422 Unexpected inputs',
        'borrar-todo: error: trabajo desconocido (borrar-todo)',
      ],
      sinResultado: [],
    });
  });

  it('un pedido sin resultado (lanzar no llegó a él) no se anota: sigue pendiente y se dice', async () => {
    const { entorno, llamadas } = simulado({});
    const r = await marcarTodos(entorno, [{ id: 3, workflow: 'respaldo' }], [], []);
    expect(marcados(llamadas)).toEqual([]);
    expect(r.sinResultado).toEqual(['respaldo (pedido 3)']);
  });

  it('un resultado que no es lanzado ni error se anota como error, en una línea', async () => {
    const { entorno, llamadas } = simulado({});
    await marcarTodos(
      entorno,
      [
        { id: 1, workflow: 'respaldo' },
        { id: 2, workflow: 'purgar-fotos' },
      ],
      [],
      [
        { id: '1', trabajo: 'respaldo', resultado: 'ok' },
        { id: '2', trabajo: 'purgar-fotos', resultado: `error: a\nb ${'x'.repeat(400)}` },
      ],
    );
    const [uno, dos] = marcados(llamadas) as { resultado: string }[];
    expect(uno!.resultado).toBe('error: el trabajo lanzar devolvió un resultado que no se entiende');
    expect(dos!.resultado.startsWith('error: a b xxx')).toBe(true);
    expect(dos!.resultado.length).toBe(200);
  });

  it('llama a la base de datos con la clave de servicio y el esquema hidrantes', async () => {
    const { entorno, llamadas } = simulado({});
    await marcarTodos(
      entorno,
      [{ id: 1, workflow: 'respaldo' }],
      [],
      [{ id: '1', trabajo: 'respaldo', resultado: 'lanzado' }],
    );
    expect(llamadas[0]!.cabeceras).toMatchObject({
      Authorization: 'Bearer clave-de-servicio',
      'Content-Profile': 'hidrantes',
      'Accept-Profile': 'hidrantes',
    });
  });

  it('si no puede marcar un pedido, se para (y falla)', async () => {
    const { entorno, llamadas } = simulado({ marcar: () => new Response('{}', { status: 500 }) });
    await expect(
      marcarTodos(
        entorno,
        [
          { id: 1, workflow: 'respaldo' },
          { id: 2, workflow: 'purgar-fotos' },
        ],
        [],
        [
          { id: '1', trabajo: 'respaldo', resultado: 'lanzado' },
          { id: '2', trabajo: 'purgar-fotos', resultado: 'lanzado' },
        ],
      ),
    ).rejects.toThrow(/fn_marcar_pedido respondió 500 para el pedido 1/);
    expect(marcados(llamadas)).toHaveLength(1);
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
    const { entorno } = simulado({ pendientes: respuesta });
    const e = await pendientes(entorno).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ErrorDeScript);
    expect((e as Error).message).toMatch(motivo);
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
});

describe('despachador.yml', () => {
  // Los pedidos no se reclaman en la base de datos: dos pasadas a la vez lanzarían el mismo dos veces.
  it('nunca dos pasadas a la vez', () => {
    expect(yml).toMatch(/^concurrency:\n {2}group: despachador\n {2}cancel-in-progress: false$/m);
  });

  it('cada 15 minutos y a mano', () => {
    expect(yml).toMatch(/^\s{4}- cron: '7,22,37,52 \* \* \* \*'$/m);
    expect(yml).toMatch(/^\s{2}workflow_dispatch:$/m);
  });

  // RV-201: el GITHUB_TOKEN con actions: write puede borrar artifacts, y el respaldo es uno, el único.
  describe('solo el trabajo que lanza tiene actions: write (RV-201, DEC-180)', () => {
    it('nada por defecto en el workflow; cada trabajo, lo suyo', () => {
      expect(yml).toMatch(/^permissions: \{\}$/m);
      const permisos = (t: string) =>
        [...trabajo(t).matchAll(/^ {4}permissions:\n((?: {6}.+\n)+)/gm)].map((m) => m[1]!.trim().split(/\n\s*/).sort());
      expect(permisos('leer')).toEqual([['contents: read']]);
      expect(permisos('lanzar')).toEqual([['actions: write']]);
      expect(permisos('marcar')).toEqual([['contents: read']]);
      expect(permisos('avisar')).toEqual([['issues: write']]);
      expect(yml.replace(/^\s*#.*$/gm, '').match(/actions: write/g)).toHaveLength(1);
    });

    it('el que lanza no hace checkout, no instala nada ni ve la clave de servicio ni un environment', () => {
      const lanzar = trabajo('lanzar');
      const sinComentarios = lanzar.replace(/^\s*#.*$/gm, '');
      expect(sinComentarios).not.toMatch(/actions\/checkout|setup-node|npm |npx |\.\/\.github|scripts\//);
      expect(sinComentarios).not.toMatch(/secrets\.|environment:/);
      expect(lanzar).toContain('PEDIDOS: ${{ needs.leer.outputs.pedidos }}');
    });

    it('los que leen y marcan con la clave de servicio, en prod-tareas y sin actions', () => {
      for (const t of ['leer', 'marcar']) {
        const texto = trabajo(t);
        expect(texto, t).toMatch(/^ {4}environment: prod-tareas$/m);
        expect(texto, t).toContain('SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY_PROD }}');
        expect(texto, t).toContain('SUPABASE_URL: ${{ vars.SUPABASE_URL_PROD }}');
        expect(texto, t).not.toMatch(/GH_TOKEN|github\.token|actions:/);
      }
      expect(trabajo('leer')).toContain('run: node scripts/despachar.ts leer');
      expect(trabajo('marcar')).toContain('run: node scripts/despachar.ts marcar');
      expect(yml).not.toMatch(/GITHUB_DISPATCH_TOKEN|secrets\.GITHUB_TOKEN_/);
    });

    it('el case de lanzar es la misma tabla que ARCHIVO', () => {
      const guion = guionDe(trabajo('lanzar'), 'Lanzar los trabajos pedidos');
      const casos = new Map<string, { archivo: string; entrada: boolean }>();
      for (const [, nombres, cuerpo] of guion.matchAll(/^\s+([a-z| -]+)\) (archivo=[^;\n]+(?:;[^\n]*)?) ;;$/gm)) {
        const archivo = /archivo=([a-z.-]+)/.exec(cuerpo!)![1]!;
        for (const n of nombres!.split('|').map((x) => x.trim())) {
          casos.set(n, { archivo, entrada: cuerpo!.includes('entrada="$trabajo"') });
        }
      }
      const esperado = new Map(
        WORKFLOWS.map((w) => [w, { archivo: ARCHIVO[w].archivo, entrada: ARCHIVO[w].entradas?.trabajo === w }]),
      );
      expect(casos).toEqual(esperado);
    });
  });

  it('sin npm ci: ninguna dependencia de npm corre con la clave de servicio', () => {
    const sinComentarios = yml.replace(/^\s*#.*$/gm, '');
    expect(sinComentarios).not.toMatch(/npm (ci|install|run)|npx |\.\/\.github\/actions\/preparar/);
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
  it('node lo carga sin tsx; sin modo o sin variables, se para diciendo qué falta', () => {
    const env = { ...process.env };
    for (const v of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) delete env[v];
    const correr = (...args: string[]) =>
      spawnSync(process.execPath, ['scripts/despachar.ts', ...args], { cwd: raiz, encoding: 'utf8', env });
    const sinModo = correr();
    expect(sinModo.status, sinModo.stderr).toBe(1);
    expect(sinModo.stderr + sinModo.stdout).toContain('Uso: node scripts/despachar.ts leer|marcar');
    const sinVariables = correr('leer');
    expect(sinVariables.status, sinVariables.stderr).toBe(1);
    expect(sinVariables.stderr + sinVariables.stdout).toContain('Faltan SUPABASE_URL');
  });

  describe.skipIf(sinJq)('el guion de lanzar, con gh simulado', () => {
    const guion = guionDe(trabajo('lanzar'), 'Lanzar los trabajos pedidos');
    /** gh simulado: anota la llamada; falla con el archivo que se le diga. */
    const correr = (pedidos: unknown, falla = '') => {
      const dir = mkdtempSync(path.join(tmpdir(), 'lanzar-'));
      try {
        const salida = path.join(dir, 'salida');
        const anotado = path.join(dir, 'anotado');
        writeFileSync(salida, '');
        const gh = [
          'gh() {',
          '  echo "gh $*" >> "$ANOTADO"',
          '  if [ -n "$FALLA" ] && [[ "$*" == *"/$FALLA/"* ]]; then echo "gh: Unexpected inputs provided (HTTP 422)" >&2; return 1; fi',
          '}',
        ].join('\n');
        const r = spawnSync('bash', ['-e', '-c', `${gh}\n${guion}`], {
          encoding: 'utf8',
          env: {
            ...process.env,
            GITHUB_OUTPUT: salida,
            ANOTADO: anotado,
            FALLA: falla,
            GH_REPO: 'dueno/repo',
            PEDIDOS: JSON.stringify(pedidos),
          },
        });
        expect(r.status, r.stderr).toBe(0);
        const linea = readFileSync(salida, 'utf8').trim();
        expect(linea.startsWith('resultados=')).toBe(true);
        return {
          resultados: JSON.parse(linea.slice('resultados='.length)) as unknown,
          llamadas: existsSync(anotado) ? readFileSync(anotado, 'utf8').trim().split('\n') : [],
        };
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    };

    it('lanza cada pedido en develop, con su entrada, y devuelve el resultado de cada uno', () => {
      const { resultados, llamadas } = correr([
        { id: 1, trabajo: 'purgar-fotos' },
        { id: 2, trabajo: 'regenerar-zona' },
      ]);
      expect(llamadas).toEqual([
        'gh api -X POST repos/dueno/repo/actions/workflows/purgar-fotos.yml/dispatches -f ref=develop',
        'gh api -X POST repos/dueno/repo/actions/workflows/mantenimiento.yml/dispatches -f ref=develop -f inputs[trabajo]=regenerar-zona',
      ]);
      expect(resultados).toEqual([
        { id: '1', trabajo: 'purgar-fotos', resultado: 'lanzado' },
        { id: '2', trabajo: 'regenerar-zona', resultado: 'lanzado' },
      ]);
    });

    it('si GitHub no acepta uno, devuelve su error y sigue con los demás', () => {
      const { resultados } = correr(
        [
          { id: 1, trabajo: 'respaldo' },
          { id: 2, trabajo: 'purgar-fotos' },
        ],
        'respaldo.yml',
      );
      expect(resultados).toEqual([
        { id: '1', trabajo: 'respaldo', resultado: 'error: GitHub: gh: Unexpected inputs provided (HTTP 422)' },
        { id: '2', trabajo: 'purgar-fotos', resultado: 'lanzado' },
      ]);
    });

    it('un trabajo que no está en su case no se lanza, aunque llegue de leer; un id raro, tampoco', () => {
      const { resultados, llamadas } = correr([
        { id: 9, trabajo: 'borrar-todo' },
        { id: '1; rm -rf /', trabajo: 'respaldo' },
      ]);
      expect(llamadas).toEqual([]);
      // El del id raro no vuelve: marcar lo deja pendiente y falla diciéndolo.
      expect(resultados).toEqual([
        { id: '9', trabajo: 'borrar-todo', resultado: 'error: trabajo desconocido (borrar-todo)' },
      ]);
    });
  });

  describe('las issues', () => {
    const avisar = trabajo('avisar');
    const guion = guionDe(avisar, 'Abrir o cerrar las issues del despachador');
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

    it('corre siempre, mira los tres trabajos y lee la salida de marcar por env, no dentro del guion', () => {
      expect(avisar).toMatch(/^ {4}needs: \[leer, lanzar, marcar\]$/m);
      expect(avisar).toMatch(/^ {4}if: always\(\)$/m);
      expect(avisar).toContain("needs.leer.result == 'success'");
      expect(avisar).toContain('needs.lanzar.result');
      expect(avisar).toContain('needs.marcar.result');
      expect(avisar).toContain('CON_ERROR: ${{ needs.marcar.outputs.con_error }}');
      expect(guion).not.toContain('${{');
    });

    it.skipIf(sinJq)('todo bien: cierra la del fallo, y la de un pedido con error no la toca', () => {
      const issues = [
        { number: 3, title: FALLO },
        { number: 4, title: PEDIDO },
      ];
      expect(correr('success', '', issues)).toBe('gh issue close 3\n');
    });

    it.skipIf(sinJq)('la ejecución falla: abre la del fallo una sola vez', () => {
      expect(correr('failure', '', [])).toBe('gh issue create --title\n');
      expect(correr('failure', '', [{ number: 3, title: FALLO }])).toBe('');
    });

    it.skipIf(sinJq)('un pedido con error: abre su issue, o comenta en la abierta, y no la cierra', () => {
      const conError = 'respaldo: error: GitHub: HTTP 422';
      expect(correr('success', conError, [])).toBe('gh issue create --title\n');
      expect(correr('success', conError, [{ number: 4, title: PEDIDO }])).toBe('gh issue comment 4\n');
    });
  });

  it('marcar corre aunque lanzar falle o no haga falta, si leer fue bien y hay algo que anotar', () => {
    expect(trabajo('marcar')).toContain(
      "if: always() && needs.leer.result == 'success' && needs.leer.outputs.hay == 'si'",
    );
  });

  it('está en las listas de workflows programados que se mantienen activos', () => {
    for (const a of ['mantener-activo.yml', 'vigilancia.yml']) {
      const texto = readFileSync(path.join(carpeta, a), 'utf8');
      for (const [, lista] of texto.matchAll(/^\s+WORKFLOWS: (.+)$/gm)) expect(lista, a).toContain('despachador.yml');
    }
  });
});
