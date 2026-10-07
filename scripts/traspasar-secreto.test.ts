import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { comprobarOrigen, descifrar, ejecucionDe, parEfimero, pedidoDe } from './traspasar-secreto.ts';

const raiz = path.resolve(import.meta.dirname, '..');
const traspaso = readFileSync(path.join(raiz, '.github/workflows/traspaso.yml'), 'utf8');

/** Los bloques `run: |` del workflow, con su sangría quitada. */
function bloquesRun(texto: string): string[] {
  const lineas = texto.split('\n');
  const bloques: string[] = [];
  for (let i = 0; i < lineas.length; i++) {
    const m = /^(\s*)(?:-\s+)?run:\s*(.*)$/.exec(lineas[i]!);
    if (!m) continue;
    if (m[2] !== '|') {
      bloques.push(m[2]!);
      continue;
    }
    const cuerpo: string[] = [];
    while (
      i + 1 < lineas.length &&
      (lineas[i + 1]!.trim() === '' || (/^\s/.test(lineas[i + 1]!) && lineas[i + 1]!.search(/\S/) > m[1]!.length))
    ) {
      cuerpo.push(lineas[++i]!.trim());
    }
    bloques.push(cuerpo.join('\n'));
  }
  return bloques;
}

describe('traspaso.yml no imprime el secreto (docs/31 §1.2, RV-131)', () => {
  const runs = bloquesRun(traspaso);

  it('hay dos trabajos, uno sin environment y otro en el del origen, y ambos solo en workflow_dispatch', () => {
    expect(runs).toHaveLength(2);
    expect(runs[0]).toBe(runs[1]);
    expect(traspaso).toMatch(/^on:\n {2}workflow_dispatch:\n/m);
    expect(traspaso).not.toMatch(/^\s{2}(push|pull_request|schedule):/m);
    expect(traspaso).toContain('environment: ${{ inputs.origen }}');
  });

  it('solo lo puede lanzar el propietario: los dos trabajos lo exigen', () => {
    const condiciones = [...traspaso.matchAll(/^ {4}if: (.+)$/gm)].map((m) => m[1]);
    expect(condiciones).toEqual([
      "inputs.origen == 'repositorio' && github.triggering_actor == 'aron285-coder'",
      "inputs.origen != 'repositorio' && github.triggering_actor == 'aron285-coder'",
    ]);
  });

  it('el secreto solo entra por env, nunca dentro de un run:', () => {
    expect([...traspaso.matchAll(/secrets\[inputs\.secreto\]/g)]).toHaveLength(2);
    expect(traspaso.match(/^\s+VALOR: \$\{\{ secrets\[inputs\.secreto\] \}\}$/gm)).toHaveLength(2);
    for (const r of runs) expect(r).not.toMatch(/secrets\./);
    for (const r of runs) expect(r).not.toMatch(/\$\{\{/);
  });

  it('ningún run: escribe el valor: solo se comprueba que no esté vacío y va por tubería a openssl', () => {
    for (const r of runs) {
      const usos = r.split('\n').filter((l) => l.includes('VALOR'));
      expect(usos).toHaveLength(2);
      expect(usos[0]).toMatch(/^if \[ -z "\$\{VALOR:-\}" \]; then echo "::error::\$NOMBRE no existe/);
      expect(usos[1]).toMatch(/^printf '%s' "\$VALOR" \| openssl pkeyutl -encrypt /);
      expect(r).not.toMatch(/set -x|set -o xtrace|tee\b|GITHUB_STEP_SUMMARY|GITHUB_OUTPUT|GITHUB_ENV/);
    }
  });

  it('el artefacto es el texto cifrado, de 1 día', () => {
    expect(traspaso.match(/path: cifrado\.b64\n\s+retention-days: 1\n/g)).toHaveLength(2);
  });
});

describe('pedidoDe', () => {
  const pedido = (v: Record<string, string>) => pedidoDe(new Map(Object.entries(v)));

  it('admite varios secretos y los sitios repositorio o un environment', () => {
    expect(pedido({ secreto: 'A_PROD, B', desde: 'repositorio', hacia: 'prod-tareas' })).toEqual({
      secretos: ['A_PROD', 'B'],
      desde: 'repositorio',
      hacia: 'prod-tareas',
    });
  });

  it('rechaza nombres raros, sitios raros y origen igual a destino', () => {
    expect(() => pedido({ secreto: 'a;b', desde: 'repositorio', hacia: 'x' })).toThrow(/no válido/);
    expect(() => pedido({ desde: 'repositorio', hacia: 'x' })).toThrow(/Falta --secreto/);
    expect(() => pedido({ secreto: 'A', desde: 'Repo $(x)', hacia: 'x' })).toThrow(/--desde/);
    expect(() => pedido({ secreto: 'A', desde: 'staging', hacia: 'staging' })).toThrow(/mismo sitio/);
  });
});

describe('comprobarOrigen', () => {
  it('para antes de lanzar nada si el secreto no está en el origen: el trabajo vería el del repositorio', () => {
    expect(() => comprobarOrigen(['CLOUDFLARE_API_TOKEN'], ['SUPABASE_DB_URL'], 'staging')).toThrow(
      /No están en staging: CLOUDFLARE_API_TOKEN/,
    );
    expect(() => comprobarOrigen(['A', 'B'], ['B', 'A', 'C'], 'repositorio')).not.toThrow();
  });
});

describe('ejecucionDe', () => {
  it('encuentra la ejecución por su run-name', () => {
    const lista = [
      { databaseId: 1, displayTitle: 'Traspaso otro' },
      { databaseId: 2, displayTitle: 'Traspaso abc' },
    ];
    expect(ejecucionDe(lista, 'abc')).toBe(2);
    expect(ejecucionDe(lista, 'zzz')).toBeNull();
  });
});

describe('cifrar en el workflow y descifrar aquí', () => {
  const hayOpenssl = spawnSync('openssl', ['version'], { encoding: 'utf8' }).status === 0;
  const linea = bloquesRun(traspaso)[0]!
    .split('\n')
    .find((l) => l.startsWith('printf \'%s\' "$VALOR" | openssl'))!;
  // El mismo openssl del workflow, con la clave en un archivo temporal.
  const opensslDelWorkflow = linea
    .replace(/^printf '%s' "\$VALOR" \| /, '')
    .replace(/ \| base64 -w0 > cifrado\.b64$/, '')
    .split(' ');

  it.skipIf(!hayOpenssl)(
    'lo que cifra el openssl de traspaso.yml se descifra con descifrar(), igual byte a byte',
    () => {
      const { publica, privada } = parEfimero();
      const dir = mkdtempSync(path.join(tmpdir(), 'traspaso-test-'));
      try {
        const der = path.join(dir, 'clave.der');
        writeFileSync(der, Buffer.from(publica, 'base64'));
        const args = opensslDelWorkflow.slice(1).map((a) => (a === 'clave.der' ? der : a));
        // Un valor de prueba con lo que lleva una cadena de conexión real: :, @, /, ?, = y %.
        const valor = 'postgresql://usuario.ref:cl@ve%2F?=x@host:5432/postgres?sslmode=require';
        const r = spawnSync('openssl', args, { input: valor });
        expect(r.status, String(r.stderr)).toBe(0);
        expect(descifrar(privada, r.stdout.toString('base64'))).toBe(valor);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  );

  it('la clave pública cabe en la validación del workflow', () => {
    const { publica } = parEfimero();
    expect(publica).toMatch(/^[A-Za-z0-9+/=]{500,1200}$/);
    expect(traspaso).toContain('^[A-Za-z0-9+/=]{500,1200}$');
  });

  it('un texto cifrado vacío es un error, no un secreto vacío', () => {
    const { privada } = parEfimero();
    expect(() => descifrar(privada, '')).toThrow(/vacío/);
  });
});
