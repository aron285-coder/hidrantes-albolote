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
