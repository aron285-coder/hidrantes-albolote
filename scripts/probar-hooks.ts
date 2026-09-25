// Los hooks de .claude/hooks/ con entradas simuladas (docs/21 SK-02, DEC-115). Corre en ci-calidad.
//
//   npx tsx scripts/probar-hooks.ts
//
// Cada caso pasa al hook el JSON que Claude Code le pasaría (tool_name, tool_input, cwd) y
// comprueba el código de salida: 2 bloquea, 0 deja pasar. Los casos de git usan un repositorio
// temporal con develop, un origin/develop simulado y archivos que no pueden entrar.

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { RAIZ, abortar, ejecutarScript, log } from './lib/comun.ts';

const HOOKS = path.join(RAIZ, '.claude', 'hooks');

interface Caso {
  hook: string;
  que: string;
  entrada: { tool_name: string; tool_input: Record<string, unknown> };
  bloquea: boolean;
}

const bash = (command: string) => ({ tool_name: 'Bash', tool_input: { command } });

function repositorioDePrueba(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'hooks-'));
  const git = (...a: string[]) => {
    const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd: dir, encoding: 'utf8' });
    if (r.status !== 0) abortar(`git ${a.join(' ')}: ${r.stderr}`);
  };
  const escribir = (ruta: string, texto = 'x\n') => {
    mkdirSync(path.dirname(path.join(dir, ruta)), { recursive: true });
    writeFileSync(path.join(dir, ruta), texto);
  };
  git('init', '-q', '-b', 'develop');
  escribir('supabase/migrations/0001_aplicada.sql', 'select 1;\n');
  escribir('src/ok.ts', 'export const a = 1;\n');
  git('add', '.');
  git('commit', '-q', '-m', 'base');
  // Lo que ya está en develop cuenta como aplicado en staging.
  git('update-ref', 'refs/remotes/origin/develop', 'HEAD');
  git('switch', '-q', '-c', 'fase-9/prueba');
  escribir('supabase/migrations/0002_de_la_rama.sql', 'select 2;\n');
  git('add', '.');
  git('commit', '-q', '-m', 'rama');
  git('switch', '-q', 'develop');
  // Lo que nunca puede entrar.
  escribir('.env', 'X=1\n');
  escribir('volcado.sql');
  escribir('datos/otro.pmtiles');
  escribir('public/mapabase/albolote.pmtiles');
  escribir('src/nuevo.ts');
  return dir;
}

function casos(): Caso[] {
  const m = 'supabase/migrations';
  return [
    // supabase db push
    { hook: 'sin-db-push', que: 'supabase db push', entrada: bash('npx supabase db push'), bloquea: true },
    {
      hook: 'sin-db-push',
      que: 'desde PowerShell',
      entrada: { tool_name: 'PowerShell', tool_input: { command: 'npx.cmd supabase db push --linked' } },
      bloquea: true,
    },
    { hook: 'sin-db-push', que: 'npm run migrar', entrada: bash('npm run migrar -- --local'), bloquea: false },
    // migraciones aplicadas
    {
      hook: 'migraciones-aplicadas',
      que: 'Edit de una migración de develop',
      entrada: {
        tool_name: 'Edit',
        tool_input: { file_path: `${m}/0001_aplicada.sql`, old_string: '1', new_string: '3' },
      },
      bloquea: true,
    },
    {
      hook: 'migraciones-aplicadas',
      que: 'Write encima de una migración de develop',
      entrada: { tool_name: 'Write', tool_input: { file_path: `${m}/0001_aplicada.sql`, content: 'x' } },
      bloquea: true,
    },
    {
      hook: 'migraciones-aplicadas',
      que: 'Write de una migración nueva',
      entrada: { tool_name: 'Write', tool_input: { file_path: `${m}/0030_nueva.sql`, content: 'select 30;' } },
      bloquea: false,
    },
    {
      hook: 'migraciones-aplicadas',
      que: 'rm de una de develop',
      entrada: bash(`rm ${m}/0001_aplicada.sql`),
      bloquea: true,
    },
    { hook: 'migraciones-aplicadas', que: 'git rm', entrada: bash(`git rm -q ${m}/0001_aplicada.sql`), bloquea: true },
    {
      hook: 'migraciones-aplicadas',
      que: 'sed -i',
      entrada: bash(`sed -i s/1/2/ ${m}/0001_aplicada.sql`),
      bloquea: true,
    },
    {
      hook: 'migraciones-aplicadas',
      que: 'redirección >>',
      entrada: bash(`echo x >> ${m}/0001_aplicada.sql`),
      bloquea: true,
    },
    { hook: 'migraciones-aplicadas', que: 'leerla', entrada: bash(`cat ${m}/0001_aplicada.sql`), bloquea: false },
    {
      hook: 'migraciones-aplicadas',
      que: 'sed sin -i',
      entrada: bash(`sed -n 1p ${m}/0001_aplicada.sql`),
      bloquea: false,
    },
    // La 0002 solo está en la rama de trabajo: aún se puede renumerar (skill nueva-migracion). En
    // develop no existe como archivo, así que se comprueba desde la rama.
    {
      hook: 'migraciones-aplicadas',
      que: 'git mv de una que solo está en la rama',
      entrada: bash(`git switch -q fase-9/prueba && git mv ${m}/0002_de_la_rama.sql ${m}/0031_de_la_rama.sql`),
      bloquea: false,
    },
    // docs/22 RV-91: órdenes que copian o restauran encima de una migración.
    {
      hook: 'migraciones-aplicadas',
      que: 'cp encima de una de develop',
      entrada: bash(`cp volcado.sql ${m}/0001_aplicada.sql`),
      bloquea: true,
    },
    {
      hook: 'migraciones-aplicadas',
      que: 'cp a una nueva',
      entrada: bash(`cp volcado.sql ${m}/0040_nueva.sql`),
      bloquea: false,
    },
    {
      hook: 'migraciones-aplicadas',
      que: 'cp desde una de develop',
      entrada: bash(`cp ${m}/0001_aplicada.sql copia.sql`),
      bloquea: false,
    },
    { hook: 'migraciones-aplicadas', que: 'tee', entrada: bash(`echo x | tee ${m}/0001_aplicada.sql`), bloquea: true },
    {
      hook: 'migraciones-aplicadas',
      que: 'dd of=',
      entrada: bash(`dd if=/dev/zero of=${m}/0001_aplicada.sql count=1`),
      bloquea: true,
    },
    {
      hook: 'migraciones-aplicadas',
      que: 'git checkout -- ruta',
      entrada: bash(`git checkout origin/develop -- ${m}/0001_aplicada.sql`),
      bloquea: true,
    },
    {
      hook: 'migraciones-aplicadas',
      que: 'git restore',
      entrada: bash(`git restore ${m}/0001_aplicada.sql`),
      bloquea: true,
    },
    {
      hook: 'migraciones-aplicadas',
      que: 'Copy-Item en PowerShell',
      entrada: {
        tool_name: 'PowerShell',
        tool_input: { command: `Copy-Item volcado.sql -Destination ${m}/0001_aplicada.sql` },
      },
      bloquea: true,
    },
    // force push
    {
      hook: 'sin-force-push',
      que: '--force a develop',
      entrada: bash('git push --force origin develop'),
      bloquea: true,
    },
    { hook: 'sin-force-push', que: '-f a main', entrada: bash('git push -f origin main'), bloquea: true },
    { hook: 'sin-force-push', que: '+main', entrada: bash('git push origin +HEAD:main'), bloquea: true },
    {
      hook: 'sin-force-push',
      que: 'sin refspec estando en develop',
      entrada: bash('git push --force-with-lease'),
      bloquea: true,
    },
    {
      hook: 'sin-force-push',
      que: 'a la rama propia',
      entrada: bash('git push --force-with-lease origin fase-9/prueba'),
      bloquea: false,
    },
    { hook: 'sin-force-push', que: 'push normal a develop', entrada: bash('git push origin develop'), bloquea: false },
    // docs/22 RV-91: HEAD y refs/heads/ son la rama de destino.
    {
      hook: 'sin-force-push',
      que: '--force a HEAD estando en develop',
      entrada: bash('git push --force origin HEAD'),
      bloquea: true,
    },
    {
      hook: 'sin-force-push',
      que: '-f a HEAD:refs/heads/main',
      entrada: bash('git push -f origin HEAD:refs/heads/main'),
      bloquea: true,
    },
    {
      hook: 'sin-force-push',
      que: '--force a HEAD en una rama propia',
      entrada: bash('git switch -q fase-9/prueba && git push --force origin HEAD'),
      bloquea: false,
    },
    // console.log
    {
      hook: 'sin-console-log',
      que: 'Write en src',
      entrada: { tool_name: 'Write', tool_input: { file_path: 'src/lib/a.ts', content: 'console.log(x);' } },
      bloquea: true,
    },
    {
      hook: 'sin-console-log',
      que: 'MultiEdit en functions',
      entrada: {
        tool_name: 'MultiEdit',
        tool_input: { file_path: 'functions/api/push.ts', edits: [{ old_string: 'a', new_string: 'console.log (b)' }] },
      },
      bloquea: true,
    },
    {
      hook: 'sin-console-log',
      que: 'console.error en src',
      entrada: {
        tool_name: 'Edit',
        tool_input: { file_path: 'src/lib/a.ts', old_string: 'a', new_string: 'console.error(e)' },
      },
      bloquea: false,
    },
    {
      hook: 'sin-console-log',
      que: 'console.log en scripts',
      entrada: { tool_name: 'Write', tool_input: { file_path: 'scripts/a.ts', content: 'console.log(x);' } },
      bloquea: false,
    },
    // docs/22 RV-91: el Service Worker y el Worker de los avisos también.
    {
      hook: 'sin-console-log',
      que: 'Write en public/sw-push.js',
      entrada: { tool_name: 'Write', tool_input: { file_path: 'public/sw-push.js', content: 'console.log(e);' } },
      bloquea: true,
    },
    {
      hook: 'sin-console-log',
      que: 'Edit en workers/',
      entrada: {
        tool_name: 'Edit',
        tool_input: { file_path: 'workers/avisos/src/index.ts', old_string: 'a', new_string: 'console.log(r)' },
      },
      bloquea: true,
    },
    {
      hook: 'sin-console-log',
      que: 'console.error en workers/',
      entrada: {
        tool_name: 'Edit',
        tool_input: { file_path: 'workers/avisos/src/index.ts', old_string: 'a', new_string: 'console.error(r)' },
      },
      bloquea: false,
    },
    // git add
    { hook: 'git-add-prohibidos', que: '.env', entrada: bash('git add .env'), bloquea: true },
    {
      hook: 'git-add-prohibidos',
      que: 'git add -A con .env y un .sql en la raíz',
      entrada: bash('git add -A'),
      bloquea: true,
    },
    {
      hook: 'git-add-prohibidos',
      que: '.pmtiles fuera de su sitio',
      entrada: bash('git add datos/otro.pmtiles'),
      bloquea: true,
    },
    {
      hook: 'git-add-prohibidos',
      que: 'el mapa base en public/mapabase',
      entrada: bash('git add public/mapabase/albolote.pmtiles'),
      bloquea: false,
    },
    { hook: 'git-add-prohibidos', que: 'código', entrada: bash('git add src/nuevo.ts'), bloquea: false },
  ];
}

async function principal(): Promise<void> {
  const dir = repositorioDePrueba();
  let fallos = 0;
  try {
    for (const c of casos()) {
      // El `git switch` de un caso se hace de verdad aquí: el hook mira el estado del repositorio.
      const cmd = String(c.entrada.tool_input.command ?? '');
      const cambio = /^git switch -q (\S+) && /.exec(cmd);
      if (cambio) spawnSync('git', ['switch', '-q', cambio[1]!], { cwd: dir });
      const r = spawnSync('node', [path.join(HOOKS, `${c.hook}.mjs`)], {
        cwd: dir,
        input: JSON.stringify({ hook_event_name: 'PreToolUse', cwd: dir, ...c.entrada }),
        encoding: 'utf8',
      });
      if (cambio) spawnSync('git', ['switch', '-q', 'develop'], { cwd: dir });
      const bloqueo = r.status === 2;
      const bien = bloqueo === c.bloquea && (r.status === 0 || r.status === 2);
      if (bien) log.ok(`${c.hook} · ${c.que}: ${bloqueo ? 'bloquea' : 'deja pasar'}`);
      else {
        fallos++;
        log.error(`${c.hook} · ${c.que}: salida ${r.status}, se esperaba ${c.bloquea ? '2' : '0'}. ${r.stderr.trim()}`);
      }
      if (bloqueo && !/^Bloqueado por un hook del proyecto: .*CLAUDE\.md §\d/.test(r.stderr)) {
        fallos++;
        log.error(`${c.hook} · ${c.que}: el mensaje no cita la regla de CLAUDE.md`);
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  if (fallos) abortar(`${fallos} casos de los hooks no hacen lo que deben.`);
}

if (import.meta.main) ejecutarScript(principal);
