import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// docs/32 RV-202: el respaldo se cifra para la clave de docs/15 §2 (GPG_HUELLA, constante de respaldo.yml desde docs/33 RV-341) y se comprueba antes
// y después de cifrar. Con dos claves generadas aquí: la buena y una equivocada.
const raiz = path.resolve(import.meta.dirname, '..');
const tieneGpg = spawnSync('bash', ['-c', 'command -v gpg'], { encoding: 'utf8' }).status === 0;
// En la CI hay gpg: ahí no se puede saltar.
const sinGpg = !tieneGpg && !process.env.CI;
const dir = mkdtempSync(path.join(tmpdir(), 'clave-gpg-'));
const llavero = path.join(dir, 'llavero');
afterAll(() => {
  // El agente de gpg que arranca la generación de claves, que si no se queda vivo.
  spawnSync('gpgconf', ['--kill', 'gpg-agent'], { env: { ...process.env, GNUPGHOME: llavero } });
  rmSync(dir, { recursive: true, force: true });
});

function bash(guion: string, env: Record<string, string> = {}) {
  // En Windows (Git Bash), gpg quiere rutas de MSYS.
  const rutas =
    'if command -v cygpath > /dev/null; then GNUPGHOME=$(cygpath -u "$GNUPGHOME"); D=$(cygpath -u "$D"); fi';
  return spawnSync('bash', ['-e', '-c', `set -uo pipefail\n${rutas}\nsource .github/scripts/clave-gpg.sh\n${guion}`], {
    cwd: raiz,
    encoding: 'utf8',
    env: { ...process.env, GNUPGHOME: llavero, D: dir, ...env },
  });
}

let BUENA = '';
let OTRA = '';

describe.skipIf(sinGpg)('clave-gpg.sh (RV-202)', () => {
  beforeAll(() => {
    const r = bash(`
      mkdir -p "$GNUPGHOME"; chmod 700 "$GNUPGHOME"
      for n in buena otra; do
        gpg --batch --quiet --passphrase '' --quick-gen-key "Prueba $n <$n@respaldo.invalid>" future-default default never
        gpg --batch --armor --export "$n@respaldo.invalid" > "$D/$n.asc"
        gpg --batch --with-colons --list-keys "$n@respaldo.invalid" | awk -F: '/^fpr:/ {print $10; exit}' > "$D/$n.huella"
      done
      echo 'datos del respaldo' > "$D/plano.sql"
    `);
    expect(r.status, r.stderr).toBe(0);
    BUENA = readFileSync(path.join(dir, 'buena.huella'), 'utf8').trim();
    OTRA = readFileSync(path.join(dir, 'otra.huella'), 'utf8').trim();
    expect(BUENA).toMatch(/^[0-9A-F]{40}$/);
    expect(OTRA).not.toBe(BUENA);
  }, 60_000);

  describe('comprobar_clave: antes de cifrar', () => {
    it('la clave de GPG_HUELLA pasa', () => {
      const r = bash(`comprobar_clave "${BUENA}" < "$D/buena.asc"`);
      expect(r.status, r.stdout + r.stderr).toBe(0);
    });

    it('una clave equivocada falla y dice cuál trae y cuál se esperaba', () => {
      const r = bash(`comprobar_clave "${BUENA}" < "$D/otra.asc"`);
      expect(r.status).not.toBe(0);
      expect(r.stdout).toContain(`::error::GPG_PUBLIC_KEY no es la clave del respaldo: trae ${OTRA}`);
      expect(r.stdout).toContain(`se esperaba solo ${BUENA}`);
    });

    it('la buena junto con otra también falla: una sola clave', () => {
      const r = bash(`cat "$D/buena.asc" "$D/otra.asc" | comprobar_clave "${BUENA}"`);
      expect(r.status).not.toBe(0);
      expect(r.stdout).toContain('no es la clave del respaldo');
    });

    it('sin clave, o con algo que no es una clave, falla', () => {
      for (const entrada of ['< /dev/null', "<<< 'no es una clave'"]) {
        const r = bash(`comprobar_clave "${BUENA}" ${entrada}`);
        expect(r.status, entrada).not.toBe(0);
        expect(r.stdout).toMatch(/^::error::GPG_PUBLIC_KEY no (se puede leer|trae ninguna)/);
      }
    });

    it('una GPG_HUELLA vacía o mal escrita falla antes de mirar nada', () => {
      for (const h of ['', 'BD378A1E', BUENA.toLowerCase()]) {
        const r = bash(`comprobar_clave "${h}" < "$D/buena.asc"`);
        expect(r.status, h).not.toBe(0);
        expect(r.stdout).toContain('GPG_HUELLA no es una huella de 40 cifras');
      }
    });
  });

  describe('comprobar_cifrado: después de cifrar', () => {
    const cifrar = (para: string, salida: string) =>
      `gpg --batch --yes --trust-model always --encrypt ${para} --output "$D/${salida}" "$D/plano.sql"`;

    it('cifrado para GPG_HUELLA (va a su subclave de cifrado) pasa', () => {
      const r = bash(`${cifrar(`--recipient "${BUENA}"`, 'bueno.gpg')}\ncomprobar_cifrado "${BUENA}" "$D/bueno.gpg"`);
      expect(r.status, r.stdout + r.stderr).toBe(0);
    });

    it('cifrado para una clave equivocada falla', () => {
      const r = bash(`${cifrar(`--recipient "${OTRA}"`, 'otro.gpg')}\ncomprobar_cifrado "${BUENA}" "$D/otro.gpg"`);
      expect(r.status).not.toBe(0);
      expect(r.stdout).toMatch(
        /::error::.*otro\.gpg está cifrado para la clave [0-9A-F]{16}, que no es la del respaldo/,
      );
    });

    it('cifrado para la buena y además para otra también falla', () => {
      const r = bash(
        `${cifrar(`--recipient "${BUENA}" --recipient "${OTRA}"`, 'dos.gpg')}\ncomprobar_cifrado "${BUENA}" "$D/dos.gpg"`,
      );
      expect(r.status).not.toBe(0);
      expect(r.stdout).toContain('que no es la del respaldo');
    });

    it('un archivo sin cifrar falla', () => {
      const r = bash(`comprobar_cifrado "${BUENA}" "$D/plano.sql"`);
      expect(r.status).not.toBe(0);
      expect(r.stdout).toContain('no está cifrado para ninguna clave pública');
    });
  });
});

describe('respaldo.yml usa la huella esperada (RV-202)', () => {
  const respaldo = readFileSync(path.join(raiz, '.github/workflows/respaldo.yml'), 'utf8');
  const paso = (nombre: string) => {
    const desde = respaldo.indexOf(`- name: ${nombre}`);
    expect(desde, nombre).toBeGreaterThan(-1);
    return respaldo.slice(desde).split(/\n {6}- /)[0]!;
  };

  // docs/33 RV-341: la huella es una constante del workflow, no una variable del repositorio. Cambiarla
  // exige un PR; no basta con quien pueda editar las variables.
  it('la huella es una constante de respaldo.yml, no una variable del repositorio', () => {
    expect(respaldo).not.toMatch(/vars\.GPG_HUELLA/);
    const constante = /^env:\n(?: {2}\S.*\n)*? {2}GPG_HUELLA: ([0-9A-F]{40})$/m.exec(respaldo);
    expect(constante, 'env: GPG_HUELLA del workflow').not.toBeNull();
  });

  it('la constante es la huella de docs/entornos.md y de docs/15 §2', () => {
    const constante = /^ {2}GPG_HUELLA: ([0-9A-F]{40})$/m.exec(respaldo)?.[1];
    const entornos = readFileSync(path.join(raiz, 'docs/entornos.md'), 'utf8');
    const continuidad = readFileSync(path.join(raiz, 'docs/15-continuidad-y-emergencias.md'), 'utf8');
    expect(constante).toBe(/Huella GPG de respaldos \| `([0-9A-F]{40})`/.exec(entornos)?.[1]);
    expect(constante).toBe(/Clave GPG privada del respaldo \(huella `([0-9A-F]{40})`\)/.exec(continuidad)?.[1]);
  });

  it('antes de importar, comprobar_clave; el destinatario es GPG_HUELLA, no la primera huella que haya', () => {
    const importar = paso('Importar la clave pública de cifrado');
    expect(importar).toContain('source .github/scripts/clave-gpg.sh');
    expect(importar).toMatch(/comprobar_clave "\$GPG_HUELLA"/);
    expect(importar.indexOf('comprobar_clave')).toBeLessThan(importar.indexOf('gpg --batch --import'));
    expect(importar).toContain('echo "DESTINATARIO=$GPG_HUELLA"');
    expect(importar).not.toContain('awk');
  });

  it('después de cifrar los datos y las fotos, comprobar_cifrado, antes de guardar el artifact', () => {
    const datos = paso('Volcado del esquema hidrantes, cifrado');
    expect(datos).toMatch(/comprobar_cifrado "\$DESTINATARIO" "hidrantes-\$FECHA\.sql\.gpg"/);
    expect(datos.indexOf('comprobar_cifrado')).toBeGreaterThan(datos.indexOf('--encrypt'));
    const fotos = paso('Fotos del bucket, cifradas (mensual)');
    expect(fotos).toMatch(/comprobar_cifrado "\$DESTINATARIO" "fotos-\$FECHA\.tar\.gpg"/);
    expect(respaldo.indexOf('comprobar_cifrado "$DESTINATARIO" "hidrantes-')).toBeLessThan(
      respaldo.indexOf('name: respaldo-hidrantes'),
    );
  });
});
