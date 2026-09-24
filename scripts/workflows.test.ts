import { execFileSync } from 'node:child_process';
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

// docs/18 RV-38: fallos que se ocultaban solos.
describe('vigilancia y avisos sin fallos silenciosos (RV-38)', () => {
  it("ningún run usa -v con -c y una variable :'…' en la misma línea: psql no sustituye en -c", () => {
    const malas: string[] = [];
    for (const a of archivos) {
      for (const [i, l] of leer(a).split('\n').entries()) {
        if (/psql\b/.test(l) && /\s-v\s/.test(l) && /\s-c\s/.test(l) && /:'\w+'/.test(l)) malas.push(`${a}:${i + 1}`);
      }
    }
    expect(malas).toEqual([]);
  });

  it('guardar las tareas no se traga el error con || true', () => {
    const texto = leer('vigilancia.yml');
    expect(texto).toContain('-f scripts/sql/guardar-tareas.sql');
    const linea = texto.split('\n').find((l) => l.includes('guardar-tareas.sql'))!;
    expect(linea).not.toMatch(/\|\|\s*true/);
  });

  it('la issue se abre o se cierra aunque falle la rehabilitación de workflows', () => {
    const texto = leer('vigilancia.yml');
    const paso = (nombre: string) => texto.slice(texto.indexOf(`- name: ${nombre}`)).split(/\n\s{6}- name:/)[0]!;
    expect(paso('Abrir o cerrar la issue de vigilancia')).toMatch(/^\s+if: always\(\)$/m);
    expect(paso('Rehabilitar los workflows programados')).toMatch(/^\s+continue-on-error: true$/m);
  });

  it('avisos.yml no hace || echo 000: con la red caída daba 000000 y no reintentaba', () => {
    const texto = leer('avisos.yml');
    expect(texto).not.toContain('|| echo 000');
    expect(texto).toContain('.github/scripts/codigo-http.sh');
  });

  it('avisos.yml trata un 401 como aviso, no como fallo: el secreto de Pages vale al siguiente despliegue', () => {
    const texto = leer('avisos.yml');
    expect(texto).toMatch(/"\$codigo" = "401"/);
    expect(texto).toMatch(/::warning::.*401/);
  });
});

describe('codigo_http (RV-38)', () => {
  const codigo = (entrada: string) =>
    execFileSync('bash', ['-c', `source .github/scripts/codigo-http.sh; codigo_http "${entrada}"`], {
      cwd: path.resolve(import.meta.dirname, '..'),
      encoding: 'utf8',
    });

  it('deja el código tal cual', () => {
    expect(codigo('200')).toBe('200');
    expect(codigo('503')).toBe('503');
  });

  it('red caída: curl escribe 000 y sale con error; queda 000, no 000000', () => {
    expect(codigo('000')).toBe('000');
    expect(codigo('000000')).toBe('000');
  });

  it('sin salida, 000', () => {
    expect(codigo('')).toBe('000');
  });
});

// docs/19 P-03, DEC-096: producción es la versión de staging, y la vigilancia avisa si se queda atrás.
describe('paridad de producción (P-03)', () => {
  it('deploy-prod.yml comprueba la paridad después de desplegar y de anunciar las versiones', () => {
    const texto = leer('deploy-prod.yml');
    const paridad = texto.indexOf('- name: Paridad con develop');
    expect(paridad).toBeGreaterThan(-1);
    expect(paridad).toBeGreaterThan(texto.indexOf('wrangler pages deploy'));
    expect(paridad).toBeGreaterThan(texto.indexOf('npm run cargar-version-mapabase'));
    expect(texto.slice(paridad)).toContain('npm run paridad');
    // Sin historia completa no hay HEAD^2 con el que comparar el árbol.
    expect(texto).toMatch(/fetch-depth: 0/);
  });

  it('vigilancia.yml comprueba que producción está al día, sin contar la documentación', () => {
    const texto = leer('vigilancia.yml');
    expect(texto).toContain("origin/main..origin/develop -- . ':!docs'");
    expect(texto).toMatch(/"\$dias_atras" -gt 7/);
    expect(texto).toContain('haz P-02');
    expect(texto).toMatch(/fetch-depth: 0/);
  });
});
