import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  type Esperado,
  type Estado,
  type Git,
  arbol,
  commitDeHtml,
  estadoTrasPropagar,
  problemasDeParidad,
} from './paridad.ts';

const SHA = 'a'.repeat(40);
const ESPERADO: Esperado = {
  locales: [
    { archivo: '0001_base.sql', contenido: 'x', hash: 'h1' },
    { archivo: '0002_mas.sql', contenido: 'y', hash: 'h2' },
  ],
  versionMapabase: '20260919',
  versionCallejero: '20260923',
};

function estado(cambios: Partial<Estado> = {}): Estado {
  return {
    arbolIgual: true,
    comparadoCon: 'develop fusionado (bbbbbbb)',
    commitEsperado: SHA,
    commitServido: SHA,
    aplicadas: new Map([
      ['0001_base.sql', 'h1'],
      ['0002_mas.sql', 'h2'],
    ]),
    estadoPush: 401,
    estadoGeocodificar: 401,
    config: { version_mapabase: '20260919', version_callejero: '20260923' },
    ...cambios,
  };
}

describe('paridad de producción con develop (docs/19 P-03)', () => {
  it('todo igual: ningún problema', () => {
    expect(problemasDeParidad(estado(), ESPERADO)).toEqual([]);
  });

  it('detecta una migración que falta', () => {
    const p = problemasDeParidad(estado({ aplicadas: new Map([['0001_base.sql', 'h1']]) }), ESPERADO);
    expect(p).toEqual(['falta la migración 0002_mas.sql en producción']);
  });

  it('detecta un hash distinto', () => {
    const aplicadas = new Map([
      ['0001_base.sql', 'otro'],
      ['0002_mas.sql', 'h2'],
    ]);
    expect(problemasDeParidad(estado({ aplicadas }), ESPERADO)).toEqual([
      'la migración 0001_base.sql tiene otro hash en producción',
    ]);
  });

  it('detecta una versión servida distinta, y la falta de la marca', () => {
    expect(problemasDeParidad(estado({ commitServido: 'c'.repeat(40) }), ESPERADO)).toEqual([
      'el frontend servido es del commit ccccccc, no del aaaaaaa',
    ]);
    expect(problemasDeParidad(estado({ commitServido: null }), ESPERADO)[0]).toMatch(/no dice su commit/);
  });

  it('detecta un árbol distinto', () => {
    expect(problemasDeParidad(estado({ arbolIgual: false }), ESPERADO)).toEqual([
      'main no tiene el mismo árbol que develop fusionado (bbbbbbb)',
    ]);
  });

  it('las Functions de la versión actual: sin credenciales, 401; un 404 dice que no están', () => {
    const p = problemasDeParidad(estado({ estadoGeocodificar: 404, estadoPush: null }), ESPERADO);
    expect(p).toEqual([
      'POST /api/push sin credenciales da error de red, no 401',
      'POST /api/geocodificar sin credenciales da 404, no 401',
    ]);
  });

  it('las versiones del mapa base y del callejero en config', () => {
    const p = problemasDeParidad(
      estado({ config: { version_mapabase: '20260901', version_callejero: null } }),
      ESPERADO,
    );
    expect(p).toEqual([
      'config.version_mapabase es 20260901, no 20260919',
      'config.version_callejero es null, no 20260923',
    ]);
  });

  it('lee el commit de <meta name="commit">', () => {
    expect(commitDeHtml(`<head><meta name="commit" content="${SHA}"></head>`)).toBe(SHA);
    expect(commitDeHtml('<head><meta name="version" content="0.5.0"></head>')).toBeNull();
  });
});

// Primer despliegue real (24 sep 2026, run 36027754885): /api/geocodificar dio 405 porque la edge aún
// servía las Functions del despliegue anterior, que no la tenía. Minutos después daba 401.
describe('las Functions tras propagar el despliegue', () => {
  it('reintenta hasta que responde lo esperado', async () => {
    const respuestas = [405, 405, 401];
    const esperas: number[] = [];
    const estado = await estadoTrasPropagar(async () => respuestas.shift() ?? null, 401, {
      intentos: 6,
      esperar: async (ms) => void esperas.push(ms),
    });
    expect(estado).toBe(401);
    expect(esperas).toHaveLength(2);
  });

  it('si nunca llega, devuelve el último estado para decirlo', async () => {
    let n = 0;
    const estado = await estadoTrasPropagar(async () => (n++, 405), 401, { intentos: 3, esperar: async () => {} });
    expect(estado).toBe(405);
    expect(n).toBe(3);
  });
});

// docs/20 RV-75: un merge en main de una rama que no está en develop no es paridad.
describe('con qué se compara el árbol de main', () => {
  let dir = '';
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  /** Un repositorio de verdad, con develop, main y lo que se fusione en main. */
  function repositorio(): Git {
    dir = mkdtempSync(path.join(tmpdir(), 'paridad-'));
    return (args: string[]) => {
      const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
        cwd: dir,
        encoding: 'utf8',
      });
      return { ok: r.status === 0, salida: (r.stdout ?? '').trim() };
    };
  }
  const sh = (g: Git, ...a: string[]) => {
    const r = g(a);
    if (!r.ok) throw new Error(`git ${a.join(' ')}`);
    return r.salida;
  };
  const escribir = (nombre: string, texto: string) => writeFileSync(path.join(dir, nombre), texto);

  function base(g: Git) {
    sh(g, 'init', '-q', '-b', 'develop');
    escribir('a.txt', '1');
    sh(g, 'add', '.');
    sh(g, 'commit', '-q', '-m', 'base');
    sh(g, 'switch', '-q', '-c', 'main');
  }

  it('el merge del PR develop → main se compara con el develop fusionado', () => {
    const g = repositorio();
    base(g);
    sh(g, 'switch', '-q', 'develop');
    escribir('a.txt', '2');
    sh(g, 'commit', '-q', '-am', 'cambio en develop');
    sh(g, 'update-ref', 'refs/remotes/origin/develop', 'develop');
    sh(g, 'switch', '-q', 'main');
    sh(g, 'merge', '-q', '--no-ff', '-m', 'merge', 'develop');
    const r = arbol(g);
    expect(r.igual).toBe(true);
    expect(r.con).toMatch(/^develop fusionado/);
  });

  it('un hotfix fusionado con merge commit se compara con origin/develop, y difiere', () => {
    const g = repositorio();
    base(g);
    sh(g, 'update-ref', 'refs/remotes/origin/develop', 'develop');
    sh(g, 'switch', '-q', '-c', 'hotfix');
    escribir('a.txt', 'arreglo');
    sh(g, 'commit', '-q', '-am', 'hotfix');
    sh(g, 'switch', '-q', 'main');
    sh(g, 'merge', '-q', '--no-ff', '-m', 'merge', 'hotfix');
    const r = arbol(g);
    // Sobre develop: igual = true, comparado con el propio hotfix.
    expect(r.igual).toBe(false);
    expect(r.con).toMatch(/^origin\/develop \(el merge es de [0-9a-f]{7}, que no está en develop\)$/);
  });

  it('sin merge commit, contra origin/develop', () => {
    const g = repositorio();
    base(g);
    sh(g, 'update-ref', 'refs/remotes/origin/develop', 'develop');
    expect(arbol(g)).toEqual({ igual: true, con: 'origin/develop' });
  });
});
