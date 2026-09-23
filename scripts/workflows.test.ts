import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Sin parser de YAML en las dependencias: expresiones acotadas sobre los archivos, que bastan para
// lo que se comprueba aquí (DEC-085).
const carpeta = path.resolve(import.meta.dirname, '../.github/workflows');
const archivos = readdirSync(carpeta).filter((a) => a.endsWith('.yml'));
const leer = (a: string) => readFileSync(path.join(carpeta, a), 'utf8');

const programados = archivos.filter((a) => /^on:[\s\S]*?^\s{2}schedule:/m.test(leer(a))).sort();

function listas(a: string): string[][] {
  return [...leer(a).matchAll(/^\s+WORKFLOWS: (.+)$/gm)].map((m) => m[1]!.trim().split(/\s+/).sort());
}

describe('workflows programados (DEC-085)', () => {
  it('hay workflows programados que mantener', () => {
    expect(programados).toContain('mantener-activo.yml');
    expect(programados).toContain('vigilancia.yml');
  });

  it('mantener-activo.yml rehabilita todos los workflows con schedule', () => {
    const texto = leer('mantener-activo.yml');
    expect(texto).toMatch(/^\s{2}mantener-workflows:/m);
    expect(texto).toMatch(/actions: write/);
    expect(texto).toContain('/actions/workflows/$w/enable');
    expect(listas('mantener-activo.yml')).toEqual([programados]);
  });

  it('vigilancia.yml comprueba y rehabilita la misma lista', () => {
    const texto = leer('vigilancia.yml');
    const ls = listas('vigilancia.yml');
    expect(ls.length).toBe(2);
    for (const l of ls) expect(l).toEqual(programados);
    expect(texto).toContain('runs?event=schedule&per_page=1');
    expect(texto).toContain('/actions/workflows/$w/enable');
    expect(texto).toMatch(/^\s{2}actions: write/m);
  });
});

describe('avisos.yml (RV-08)', () => {
  const texto = leer('avisos.yml');
  it('corre cada 15 minutos y a mano', () => {
    expect(texto).toMatch(/cron: '\*\/15 \* \* \* \*'/);
    expect(texto).toMatch(/^\s{2}workflow_dispatch:/m);
  });
  it('recorre producción y staging', () => {
    expect(texto).toMatch(/entorno: \[PROD, STAGING\]/);
    expect(texto).toContain("secrets[format('VIGILANCIA_SECRETO_{0}', matrix.entorno)]");
    expect(texto).toContain('X-Vigilancia');
  });
  it('no declara environment: production pediría aprobación en cada ejecución (DEC-071)', () => {
    expect(texto).not.toMatch(/^\s*environment:/m);
  });
  it('repite mientras queden avisos, como mucho diez veces', () => {
    expect(texto).toContain('"quedan":true');
    expect(texto).toContain('seq 1 10');
  });
});
