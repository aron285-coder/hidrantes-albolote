import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

// docs/35 RV-412 (DEC-202): producción solo va atrasada por lo que cambia lo que corre en producción.
// Un cambio de documentación, de la CI o de una dependencia de desarrollo no cuenta. Con un repositorio
// de Git de prueba en una carpeta temporal.
const raiz = path.resolve(import.meta.dirname, '..');
const guion = path.join(raiz, '.github', 'scripts', 'produccion-atrasada.sh').replaceAll('\\', '/');
const base = mkdtempSync(path.join(tmpdir(), 'atrasada-'));
afterAll(() => rmSync(base, { recursive: true, force: true }));

let repo = '';
let n = 0;

function git(...args: string[]) {
  const r = spawnSync('git', args, {
    cwd: repo,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'prueba',
      GIT_AUTHOR_EMAIL: 'prueba@prueba.invalid',
      GIT_COMMITTER_NAME: 'prueba',
      GIT_COMMITTER_EMAIL: 'prueba@prueba.invalid',
    },
  });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

function escribir(archivo: string, contenido: unknown) {
  const ruta = path.join(repo, archivo);
  mkdirSync(path.dirname(ruta), { recursive: true });
  writeFileSync(ruta, typeof contenido === 'string' ? contenido : JSON.stringify(contenido, null, 2) + '\n');
}

/** Un commit con estos archivos, con fecha fija (segundos desde 2026-10-01) para comprobar la más antigua. */
function commit(archivos: Record<string, unknown>, segundos: number) {
  for (const [a, c] of Object.entries(archivos)) escribir(a, c);
  git('add', '-A');
  const fecha = `${1790812800 + segundos} +0000`;
  spawnSync('git', ['commit', '-q', '-m', `c${++n}`], {
    cwd: repo,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'prueba',
      GIT_AUTHOR_EMAIL: 'prueba@prueba.invalid',
      GIT_COMMITTER_NAME: 'prueba',
      GIT_COMMITTER_EMAIL: 'prueba@prueba.invalid',
      GIT_AUTHOR_DATE: fecha,
      GIT_COMMITTER_DATE: fecha,
    },
  });
  return 1790812800 + segundos;
}

const paquete = (deps: Record<string, string>, dev: Record<string, string>, version = '1.0.0') => ({
  name: 'app',
  version,
  dependencies: deps,
  devDependencies: dev,
});
const lock = (paquetes: Record<string, object>, version = '1.0.0') => ({
  name: 'app',
  version,
  lockfileVersion: 3,
  packages: { '': { name: 'app', version, dependencies: { a: '^1.0.0' }, devDependencies: { d: '^1.0.0' } }, ...paquetes },
});
const LOCK_BASE = {
  'node_modules/a': { version: '1.0.0' },
  'node_modules/t': { version: '1.0.0' },
  'node_modules/d': { version: '1.0.0', dev: true },
  'node_modules/dt': { version: '1.0.0', dev: true },
};

/** Lo que dice el guion de main..develop: «N FECHA» (FECHA, la del commit que cuenta más antiguo). */
function atrasada() {
  const r = spawnSync('bash', ['-e', '-c', `set -uo pipefail\nsource "${guion}"\nproduccion_atrasada main develop`], {
    cwd: repo,
    encoding: 'utf8',
  });
  if (r.status !== 0) throw new Error(`produccion_atrasada: ${r.stderr}`);
  return r.stdout.trim();
}

beforeEach(() => {
  repo = path.join(base, `r${++n}`);
  mkdirSync(repo);
  git('init', '-q', '-b', 'main');
  git('config', 'commit.gpgsign', 'false');
  commit(
    {
      'package.json': paquete({ a: '^1.0.0' }, { d: '^1.0.0' }),
      'package-lock.json': lock(LOCK_BASE),
      'src/app.ts': 'export {};\n',
      'docs/a.md': 'a\n',
    },
    0,
  );
  git('switch', '-q', '-c', 'develop');
});

describe('produccion_atrasada (RV-412)', () => {
  it('sin commits por delante: 0', () => {
    expect(atrasada()).toBe('0');
  });

  it('documentación, CI y scripts no cuentan', () => {
    commit({ 'docs/a.md': 'b\n' }, 10);
    commit({ '.github/workflows/x.yml': 'on: push\n' }, 20);
    commit({ 'scripts/x.ts': 'export {};\n', 'README.md': 'x\n' }, 30);
    expect(atrasada()).toBe('0');
  });

  it.each([
    'src/app.ts',
    'public/sw.js',
    'functions/api/x.ts',
    'workers/avisos/index.ts',
    'supabase/migrations/0099_x.sql',
    'index.html',
    'vite.config.ts',
  ])('un cambio en %s cuenta', (archivo) => {
    const t = commit({ [archivo]: `// ${archivo}\n` }, 100);
    commit({ 'docs/a.md': 'c\n' }, 200);
    expect(atrasada()).toBe(`1 ${t}`);
  });

  it('una dependencia de desarrollo (package.json y lockfile) no cuenta', () => {
    commit(
      {
        'package.json': paquete({ a: '^1.0.0' }, { d: '^2.0.0' }),
        'package-lock.json': lock({
          ...LOCK_BASE,
          'node_modules/d': { version: '2.0.0', dev: true },
          'node_modules/dt': { version: '1.1.0', dev: true },
          'node_modules/dn': { version: '1.0.0', dev: true },
        }),
      },
      10,
    );
    expect(atrasada()).toBe('0');
  });

  it('el cambio de versión de una release no cuenta', () => {
    commit(
      {
        'package.json': paquete({ a: '^1.0.0' }, { d: '^1.0.0' }, '1.1.0'),
        'package-lock.json': lock(LOCK_BASE, '1.1.0'),
        'CHANGELOG.md': '## 1.1.0\n',
      },
      10,
    );
    expect(atrasada()).toBe('0');
  });

  it('una dependencia de producción en package.json cuenta', () => {
    const t = commit({ 'package.json': paquete({ a: '^1.1.0' }, { d: '^1.0.0' }) }, 10);
    expect(atrasada()).toBe(`1 ${t}`);
  });

  it('una dependencia transitiva de producción en el lockfile cuenta (cambiada, nueva o quitada)', () => {
    const t = commit({ 'package-lock.json': lock({ ...LOCK_BASE, 'node_modules/t': { version: '1.0.1' } }) }, 10);
    commit(
      {
        'package-lock.json': lock({
          ...LOCK_BASE,
          'node_modules/t': { version: '1.0.1' },
          'node_modules/n': { version: '1.0.0' },
        }),
      },
      20,
    );
    const { 'node_modules/t': _t, ...sinT } = LOCK_BASE;
    commit({ 'package-lock.json': lock({ ...sinT, 'node_modules/n': { version: '1.0.0' } }) }, 30);
    expect(atrasada()).toBe(`3 ${t}`);
  });

  it('una entrada que pasa de desarrollo a producción cuenta', () => {
    const t = commit({ 'package-lock.json': lock({ ...LOCK_BASE, 'node_modules/dt': { version: '1.0.0' } }) }, 10);
    expect(atrasada()).toBe(`1 ${t}`);
  });

  it('cuenta los que cuentan y da la fecha del más antiguo de ellos', () => {
    commit({ 'docs/a.md': 'd\n' }, 10);
    const t = commit({ 'src/app.ts': 'export const a = 1;\n' }, 20);
    commit({ '.github/workflows/x.yml': 'on: push\n' }, 30);
    commit({ 'functions/api/x.ts': 'export {};\n' }, 40);
    expect(atrasada()).toBe(`2 ${t}`);
  });

  it('lo que ya está en main no cuenta', () => {
    commit({ 'src/app.ts': 'export const a = 2;\n' }, 10);
    git('switch', '-q', 'main');
    git('merge', '-q', '--no-edit', '--no-ff', 'develop');
    git('switch', '-q', 'develop');
    expect(atrasada()).toBe('0');
  });
});
