import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buscarSecretos } from './detectar-secretos.ts';

// docs/21 SK-01 a SK-03: las herramientas de Claude Code viven en el repositorio, así que cualquier
// sesión nueva las tiene sin instalar nada a mano (DEC-114).
const raiz = path.resolve(import.meta.dirname, '..');
const rutaAjustes = path.join(raiz, '.claude', 'settings.json');

interface Ajustes {
  enabledPlugins?: Record<string, boolean>;
  extraKnownMarketplaces?: Record<string, { source?: { source?: string; repo?: string } }>;
}

describe('plugins de Claude Code del proyecto (SK-01)', () => {
  const texto = readFileSync(rutaAjustes, 'utf8');
  const ajustes = JSON.parse(texto) as Ajustes;

  it('.claude/settings.json existe y es JSON válido', () => {
    expect(existsSync(rutaAjustes)).toBe(true);
    expect(typeof ajustes).toBe('object');
  });

  it('declara el marketplace oficial de Anthropic', () => {
    expect(ajustes.extraKnownMarketplaces?.['claude-code-plugins']?.source).toEqual({
      source: 'github',
      repo: 'anthropics/claude-code',
    });
  });

  it('activa los tres plugins oficiales', () => {
    for (const p of ['pr-review-toolkit', 'code-review', 'security-guidance']) {
      expect(ajustes.enabledPlugins?.[`${p}@claude-code-plugins`], p).toBe(true);
    }
  });

  it('no contiene nada con forma de secreto', () => {
    expect(buscarSecretos(texto)).toEqual([]);
  });

  it('settings.local.json no se versiona', () => {
    expect(readFileSync(path.join(raiz, '.gitignore'), 'utf8')).toMatch(/^\.claude\/settings\.local\.json$/m);
  });
});

describe('hooks que hacen cumplir CLAUDE.md §3 (SK-02)', () => {
  const ajustes = JSON.parse(readFileSync(rutaAjustes, 'utf8')) as {
    hooks?: { PreToolUse?: { matcher: string; hooks: { type: string; command: string }[] }[] };
  };
  const grupos = ajustes.hooks?.PreToolUse ?? [];
  const scripts = (matcher: string) =>
    grupos
      .filter((g) => g.matcher === matcher)
      .flatMap((g) => g.hooks.map((h) => /\/\.claude\/hooks\/([\w-]+)\.mjs/.exec(h.command)?.[1]));

  it('los comandos pasan por los cuatro hooks de Bash y PowerShell', () => {
    expect(scripts('Bash|PowerShell')).toEqual([
      'sin-db-push',
      'migraciones-aplicadas',
      'sin-force-push',
      'git-add-prohibidos',
    ]);
  });

  it('las escrituras pasan por los de migraciones y console.log', () => {
    expect(scripts('Edit|Write|MultiEdit')).toEqual(['migraciones-aplicadas', 'sin-console-log']);
  });

  it('cada hook existe y se llama con node desde la carpeta del proyecto', () => {
    for (const g of grupos) {
      for (const h of g.hooks) {
        expect(h.type).toBe('command');
        expect(h.command).toMatch(/^node "\$\{CLAUDE_PROJECT_DIR\}\/\.claude\/hooks\/[\w-]+\.mjs"$/);
        const nombre = /hooks\/([\w-]+\.mjs)/.exec(h.command)![1]!;
        expect(existsSync(path.join(raiz, '.claude', 'hooks', nombre)), nombre).toBe(true);
      }
    }
  });

  it('ci-calidad ejecuta scripts/probar-hooks.ts', () => {
    expect(readFileSync(path.join(raiz, '.github', 'workflows', 'ci.yml'), 'utf8')).toContain(
      'npx tsx scripts/probar-hooks.ts',
    );
  });
});

describe('skills propias del proyecto (SK-03)', () => {
  for (const skill of ['paquete-rv', 'nueva-migracion', 'revisar-pantallas']) {
    it(`${skill}: SKILL.md con name y description en el encabezado`, () => {
      const ruta = path.join(raiz, '.claude', 'skills', skill, 'SKILL.md');
      expect(existsSync(ruta)).toBe(true);
      const texto = readFileSync(ruta, 'utf8');
      const cabecera = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(texto)?.[1] ?? '';
      expect(cabecera).toMatch(new RegExp(`^name: ${skill}$`, 'm'));
      const descripcion = /^description: (.+)$/m.exec(cabecera)?.[1] ?? '';
      // Tiene que decir cuándo usarla: es lo que Claude Code mira para cargarla.
      expect(descripcion).toMatch(/Úsala/);
      expect(buscarSecretos(texto)).toEqual([]);
    });
  }

  it('CLAUDE.md §8 dice cuándo usar cada una', () => {
    const claude = readFileSync(path.join(raiz, 'CLAUDE.md'), 'utf8');
    for (const skill of ['paquete-rv', 'nueva-migracion', 'revisar-pantallas'])
      expect(claude).toContain(`| \`${skill}\` |`);
  });
});

// docs/23 RV-96, DEC-141: GitHub solo cierra issues con sus palabras clave en inglés.
describe('plantilla de PR (RV-96)', () => {
  const plantilla = readFileSync(path.join(raiz, '.github', 'PULL_REQUEST_TEMPLATE.md'), 'utf8');

  it('enlaza la issue con Closes #, que la cierra al fusionar', () => {
    expect(plantilla.split('\n')[0]).toBe('Closes #');
    expect(plantilla).not.toContain('Cierra #');
  });

  it('la skill paquete-rv dice lo mismo', () => {
    const skill = readFileSync(path.join(raiz, '.claude', 'skills', 'paquete-rv', 'SKILL.md'), 'utf8');
    expect(skill).toContain('`Closes #N`');
    expect(skill).not.toMatch(/ciérrala a mano/);
  });
});
