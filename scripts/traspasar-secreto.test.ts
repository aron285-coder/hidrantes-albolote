import { spawnSync } from 'node:child_process';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  comprobarOrigen,
  comprobarPropietario,
  descifrar,
  ejecucionDe,
  parEfimero,
  pedidoDe,
} from './traspasar-secreto.ts';

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

/** El programa de Node que cifra en traspaso.yml: lo que va entre `<<'JS'` y `JS`. */
function programaDelWorkflow(run: string): string {
  const m = /^node - > cifrado\.json <<'JS'\n([\s\S]*?)\nJS$/m.exec(run);
  if (!m) throw new Error('traspaso.yml no cifra con el programa de Node entre <<JS y JS');
  return m[1]!;
}

/** Cifra `valor` exactamente como traspaso.yml: el mismo programa, con VALOR y CLAVE en el entorno. */
function cifrarComoElWorkflow(valor: string, clave: string): string {
  const r = spawnSync(process.execPath, ['-'], {
    input: programaDelWorkflow(bloquesRun(traspaso)[0]!),
    env: { PATH: process.env.PATH, VALOR: valor, CLAVE: clave },
    encoding: 'utf8',
  });
  expect(r.status, r.stderr).toBe(0);
  return r.stdout;
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

  it('solo lo puede lanzar el titular de la variable PROPIETARIO, y sin ella no corre (docs/32 RV-208)', () => {
    const condiciones = [...traspaso.matchAll(/^ {4}if: (.+)$/gm)].map((m) => m[1]);
    expect(condiciones).toEqual([
      "inputs.origen == 'repositorio' && vars.PROPIETARIO != '' && github.triggering_actor == vars.PROPIETARIO",
      "inputs.origen != 'repositorio' && vars.PROPIETARIO != '' && github.triggering_actor == vars.PROPIETARIO",
    ]);
    // Ningún titular escrito a mano.
    expect(traspaso).not.toMatch(/triggering_actor == '/);
  });

  it('el secreto solo entra por env, nunca dentro de un run:', () => {
    expect([...traspaso.matchAll(/secrets\[inputs\.secreto\]/g)]).toHaveLength(2);
    expect(traspaso.match(/^\s+VALOR: \$\{\{ secrets\[inputs\.secreto\] \}\}$/gm)).toHaveLength(2);
    for (const r of runs) expect(r).not.toMatch(/secrets\./);
    for (const r of runs) expect(r).not.toMatch(/\$\{\{/);
  });

  it('ningún run: escribe el valor: se comprueba que no esté vacío y solo lo lee el cifrado', () => {
    for (const r of runs) {
      const usos = r.split('\n').filter((l) => l.includes('VALOR'));
      expect(usos).toHaveLength(2);
      expect(usos[0]).toMatch(/^if \[ -z "\$\{VALOR:-\}" \]; then echo "::error::\$NOMBRE no existe/);
      expect(usos[1]).toBe("const datos = Buffer.concat([aes.update(process.env.VALOR, 'utf8'), aes.final()]);");
      expect(r).not.toMatch(/set -x|set -o xtrace|tee\b|GITHUB_STEP_SUMMARY|GITHUB_OUTPUT|GITHUB_ENV/);
      // Lo único que escribe el programa es el sobre, y va al archivo, no a la salida del paso.
      const programa = programaDelWorkflow(r);
      expect(programa.match(/process\.stdout\.write\(/g)).toHaveLength(1);
      expect(programa).toContain('process.stdout.write(JSON.stringify(sobre));');
      expect(programa).not.toMatch(/console\.|process\.stderr/);
    }
  });

  it('el artefacto es el sobre cifrado, de 1 día', () => {
    expect(traspaso.match(/path: cifrado\.json\n\s+retention-days: 1\n/g)).toHaveLength(2);
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

describe('comprobarPropietario (docs/32 RV-208)', () => {
  it('sin la variable PROPIETARIO para y dice cómo ponerla', () => {
    expect(() => comprobarPropietario(null, 'titular', 'titular')).toThrow(
      /gh variable set PROPIETARIO --body titular/,
    );
    expect(() => comprobarPropietario('', 'titular', 'titular')).toThrow(/PROPIETARIO/);
  });

  it('con otra sesión de gh para: los trabajos se saltarían sin artefacto', () => {
    expect(() => comprobarPropietario('titular', 'otra', 'titular')).toThrow(/solo lo puede lanzar titular/);
    expect(() => comprobarPropietario('titular', 'titular', 'titular')).not.toThrow();
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

// Cada caso arranca un Node aparte, como el runner: en Windows con la suite en paralelo tarda.
describe('cifrar en el workflow y descifrar aquí (híbrido, docs/32 RV-208)', { timeout: 60_000 }, () => {
  // Un solo par para todo el bloque: generar uno de 4096 bits tarda.
  const { publica, privada } = parEfimero();

  it('una cadena de conexión real vuelve igual byte a byte', () => {
    // Lo que lleva una cadena de conexión real: :, @, /, ?, = y %.
    const valor = 'postgresql://usuario.ref:cl@ve%2F?=x@host:5432/postgres?sslmode=require'; // detectar-secretos:permitir (valor ficticio)
    expect(descifrar(privada, cifrarComoElWorkflow(valor, publica))).toBe(valor);
  });

  it('un secreto de 4 KB, más de lo que admite RSA-OAEP solo (446 bytes), también', () => {
    const valor = randomBytes(3072).toString('base64');
    expect(valor).toHaveLength(4096);
    expect(descifrar(privada, cifrarComoElWorkflow(valor, publica))).toBe(valor);
  });

  it('una clave pública de GPG, con saltos de línea y acentos en el nombre, también', () => {
    const cuerpo = randomBytes(2400)
      .toString('base64')
      .match(/.{1,64}/g)!
      .join('\n');
    const valor = `-----BEGIN PGP PUBLIC KEY BLOCK-----\nComment: Protección Civil\n\n${cuerpo}\n-----END PGP PUBLIC KEY BLOCK-----\n`;
    expect(descifrar(privada, cifrarComoElWorkflow(valor, publica))).toBe(valor);
  });

  it('cada ejecución usa una clave AES nueva: el mismo valor no da el mismo sobre', () => {
    const a = JSON.parse(cifrarComoElWorkflow('mismo', publica)) as Record<string, string>;
    const b = JSON.parse(cifrarComoElWorkflow('mismo', publica)) as Record<string, string>;
    expect(a.clave).not.toBe(b.clave);
    expect(a.iv).not.toBe(b.iv);
  });

  it('un sobre tocado no se descifra: GCM lo detecta y no se fija un valor estropeado', () => {
    const sobre = JSON.parse(cifrarComoElWorkflow('x'.repeat(600), publica)) as Record<string, string>;
    const datos = Buffer.from(sobre.datos!, 'base64');
    datos[0] = datos[0]! ^ 1;
    const tocado = JSON.stringify({ ...sobre, datos: datos.toString('base64') });
    expect(() => descifrar(privada, tocado)).toThrow(/no es para esta clave o se ha modificado/);
  });

  it('con otra clave privada no se descifra', () => {
    const otra = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
    expect(() => descifrar(otra, cifrarComoElWorkflow('valor', publica))).toThrow(/no es para esta clave/);
  });

  it('el formato viejo (solo RSA, en base64) se rechaza con un mensaje claro', () => {
    expect(() => descifrar(privada, 'QUJDRA==')).toThrow(/no es el sobre de traspaso\.yml/);
    expect(() => descifrar(privada, '{"v":2}')).toThrow(/no es el sobre de traspaso\.yml/);
  });

  it('la clave pública cabe en la validación del workflow', () => {
    expect(publica).toMatch(/^[A-Za-z0-9+/=]{500,1200}$/);
    expect(traspaso).toContain('^[A-Za-z0-9+/=]{500,1200}$');
  });

  it('un texto cifrado vacío es un error, no un secreto vacío', () => {
    expect(() => descifrar(privada, '')).toThrow(/vacío/);
  });
});
