import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

// docs/32 RV-201 (DEC-180): el único respaldo es el artifact de respaldo.yml; la vigilancia comprueba
// que existe, no ha caducado, no está vacío y tiene menos de 8 días. Con gh y psql simulados.
const raiz = path.resolve(import.meta.dirname, '..');
const tieneJq = spawnSync('bash', ['-c', 'command -v jq'], { encoding: 'utf8' }).status === 0;
const sinJq = !tieneJq && !process.env.CI;
const dir = mkdtempSync(path.join(tmpdir(), 'respaldo-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const hace = (dias: number) => new Date(Date.now() - dias * 86_400_000).toISOString().replace(/\.\d+Z$/, 'Z');

/**
 * gh simulado. Sin CON_JQ, devuelve ya filtrado lo que hay en $D/ejecucion y $D/artefacto (lo que
 * daría el --jq de gh). Con CON_JQ, aplica el filtro de verdad, con jq, a $D/runs.json y
 * $D/artifacts.json, con la forma de la API.
 */
const guion = `
  : > "$D/anotado"
  gh() {
    local filtro="" a=("$@") i url="$2"
    for ((i = 0; i < \${#a[@]}; i++)); do if [ "\${a[i]}" = --jq ]; then filtro="\${a[i+1]}"; fi; done
    echo "gh $url" >> "$D/anotado"
    case "$url" in
      *respaldo.yml/runs*)
        if [ -f "$D/roto" ]; then echo "HTTP 503: Service Unavailable" >&2; return 1; fi
        if [ -n "\${CON_JQ:-}" ]; then jq -r "$filtro" "$D/runs.json"; else cat "$D/ejecucion"; fi ;;
      */artifacts*)
        if [ -n "\${CON_JQ:-}" ]; then jq -r "$filtro" "$D/artifacts.json"; else cat "$D/artefacto"; fi ;;
    esac
  }
  psql() { echo "aviso jefatura" >> "$D/anotado"; echo "\${ADMINS:-2}"; }
  problemas=()
  source .github/scripts/revisar-respaldo.sh
  mirar_respaldo
  printf 'P:%s\\n' "\${problemas[@]}"
  cat "$D/anotado"
`;

function correr(archivos: Record<string, string>, env: Record<string, string> = {}) {
  rmSync(path.join(dir, 'roto'), { force: true });
  for (const [nombre, contenido] of Object.entries(archivos)) writeFileSync(path.join(dir, nombre), contenido);
  const r = spawnSync('bash', ['-e', '-c', `set -uo pipefail\n${guion}`], {
    cwd: raiz,
    encoding: 'utf8',
    env: { ...process.env, D: dir, REPO: 'x/y', GH_TOKEN: 'g', BD: 'postgresql://simulada', CON_JQ: '', ...env },
  });
  expect(r.status, r.stderr).toBe(0);
  return r.stdout;
}

const conArtefacto = (texto: string) => ({ ejecucion: '77\n', artefacto: `${texto}\n` });

describe('mirar_respaldo (RV-201)', () => {
  it('el artifact de la última ejecución correcta está, con datos y de hace 2 días: nada que decir', () => {
    const salida = correr(conArtefacto(`false 185096 ${hace(2)}`));
    expect(salida).toContain('P:\n');
    expect(salida).not.toContain('aviso jefatura');
    expect(salida).toContain(
      'gh repos/x/y/actions/workflows/respaldo.yml/runs?status=success&branch=develop&per_page=1',
    );
    expect(salida).toContain('gh repos/x/y/actions/runs/77/artifacts?name=respaldo-hidrantes&per_page=10');
  });

  it.each([
    ['sin artifact (borrado)', '', 'no tiene el artifact respaldo-hidrantes'],
    ['caducado', `true 185096 ${hace(2)}`, 'ha caducado'],
    ['vacío', `false 0 ${hace(2)}`, 'ocupa 0 bytes (mínimo 10000)'],
    ['demasiado pequeño', `false 9999 ${hace(2)}`, 'ocupa 9999 bytes (mínimo 10000): está vacío o a medias'],
    ['de hace 9 días', `false 185096 ${hace(9)}`, 'tiene 9 días (máximo 8)'],
    ['sin fecha', 'false 185096', 'no dice cuándo se creó'],
  ])('%s: problema y aviso push a jefatura', (_n, artefacto, motivo) => {
    const salida = correr(conArtefacto(artefacto));
    expect(salida).toContain(motivo);
    expect(salida).toContain('es la única (DEC-180)');
    expect(salida).toContain('aviso jefatura');
  });

  it('sin ninguna ejecución correcta de respaldo.yml: problema y aviso', () => {
    const salida = correr({ ejecucion: '', artefacto: '' });
    expect(salida).toContain('P:no hay ninguna ejecución correcta de respaldo.yml');
    expect(salida).toContain('aviso jefatura');
    expect(salida).not.toContain('/artifacts');
  });

  it('si no puede leer la API, es un problema, pero no un aviso push', () => {
    writeFileSync(path.join(dir, 'roto'), '');
    const r = spawnSync('bash', ['-e', '-c', `set -uo pipefail\n${guion}`], {
      cwd: raiz,
      encoding: 'utf8',
      env: { ...process.env, D: dir, REPO: 'x/y', GH_TOKEN: 'g', BD: 'postgresql://simulada', CON_JQ: '' },
    });
    rmSync(path.join(dir, 'roto'), { force: true });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('P:no se pueden leer las ejecuciones de respaldo.yml (HTTP 503: Service Unavailable)');
    expect(r.stdout).not.toContain('aviso jefatura');
  });

  it('sin la base de datos no hay aviso push, y también se dice', () => {
    const salida = correr(conArtefacto(''), { BD: '' });
    expect(salida).toContain('no se ha podido avisar a jefatura de que falta el respaldo');
    expect(salida).not.toContain('aviso jefatura');
  });

  it('si ya se avisó en las últimas 20 horas, no se repite ni es otro problema', () => {
    const salida = correr(conArtefacto(''), { ADMINS: 'ya' });
    expect(salida).toContain('no tiene el artifact respaldo-hidrantes');
    expect(salida).not.toContain('ningún administrador');
    expect(salida).not.toContain('no se ha podido avisar');
  });

  it('sin administradores con avisos, lo dice', () => {
    const salida = correr(conArtefacto(''), { ADMINS: '0' });
    expect(salida).toContain('ningún administrador tiene los avisos activados');
  });

  describe.skipIf(sinJq)('con los filtros --jq de verdad sobre respuestas con la forma de la API', () => {
    const runs = JSON.stringify({ workflow_runs: [{ id: 77, conclusion: 'success' }] });
    const artifacts = (lista: object[]) => JSON.stringify({ total_count: lista.length, artifacts: lista });

    it('lee el id, y del artifact con ese nombre: caducado, bytes y fecha', () => {
      const salida = correr(
        {
          'runs.json': runs,
          'artifacts.json': artifacts([
            { name: 'respaldo-fotos', expired: false, size_in_bytes: 10, created_at: hace(1) },
            { name: 'respaldo-hidrantes', expired: false, size_in_bytes: 185096, created_at: hace(1) },
          ]),
        },
        { CON_JQ: '1' },
      );
      expect(salida).toContain('P:\n');
      expect(salida).toContain('/actions/runs/77/artifacts');
    });

    it('solo el de fotos: falta el de los datos', () => {
      const salida = correr(
        {
          'runs.json': runs,
          'artifacts.json': artifacts([
            { name: 'respaldo-fotos', expired: false, size_in_bytes: 10, created_at: hace(1) },
          ]),
        },
        { CON_JQ: '1' },
      );
      expect(salida).toContain('no tiene el artifact respaldo-hidrantes');
    });

    it('sin ejecuciones correctas', () => {
      const salida = correr({ 'runs.json': JSON.stringify({ workflow_runs: [] }) }, { CON_JQ: '1' });
      expect(salida).toContain('P:no hay ninguna ejecución correcta de respaldo.yml');
    });
  });
});

describe('vigilancia.yml mira la copia del respaldo (RV-201)', () => {
  const vigilancia = readFileSync(path.join(raiz, '.github/workflows/vigilancia.yml'), 'utf8');
  const mirar = vigilancia.slice(vigilancia.indexOf('\n  mirar:\n'));

  it('el trabajo mirar, en prod-tareas, carga el guion y lo llama con el token y la base de datos', () => {
    expect(mirar).toMatch(/^ {4}environment: prod-tareas$/m);
    expect(mirar).toContain('source .github/scripts/revisar-respaldo.sh');
    expect(mirar).toMatch(/^ {10}mirar_respaldo$/m);
    expect(mirar).toContain('GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}');
    expect(mirar).toContain('BD: ${{ secrets.SUPABASE_DB_URL_PROD }}');
  });

  it('respaldo.yml guarda el artifact con ese nombre, 90 días', () => {
    const respaldo = readFileSync(path.join(raiz, '.github/workflows/respaldo.yml'), 'utf8');
    expect(respaldo).toMatch(/name: respaldo-hidrantes\n\s+path: hidrantes-\*\.sql\.gpg\n\s+retention-days: 90/);
    expect(readFileSync(path.join(raiz, '.github/scripts/revisar-respaldo.sh'), 'utf8')).toContain(
      'RESPALDO_ARTIFACT=respaldo-hidrantes',
    );
  });
});
