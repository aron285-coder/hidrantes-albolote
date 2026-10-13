import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

// docs/35 RV-412 (DEC-202): la vigilancia sondea las Functions y avisa a jefatura. curl y psql
// simulados con funciones de bash; anotan lo que se pide en $D/anotado.
const raiz = path.resolve(import.meta.dirname, '..');
const dir = mkdtempSync(path.join(tmpdir(), 'avisos-tecnicos-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const SIMULADOS = `
curl() {
  local salida='' url='' cuerpo=''
  while [ $# -gt 0 ]; do
    case "$1" in
      -o) salida="$2"; shift 2 ;;
      -d) cuerpo="$2"; shift 2 ;;
      -H) echo "cabecera $2" >> "$D/anotado"; shift 2 ;;
      -w|-X|--max-time) shift 2 ;;
      -*) shift ;;
      *) url="$1"; shift ;;
    esac
  done
  echo "curl $url $cuerpo" >> "$D/anotado"
  [ "$CURL_FALLA" = 1 ] && return 7
  printf '%s' "$CURL_CUERPO" > "$salida"
  printf '%s' "$CURL_CODIGO"
}
psql() {
  echo "psql $*" >> "$D/anotado"
  [ "$PSQL_FALLA" = 1 ] && { echo "error con el servidor" >&2; return 2; }
  echo "$PSQL_SALIDA"
}
`;

function correr(guion: string, env: Record<string, string> = {}) {
  rmSync(path.join(dir, 'anotado'), { force: true });
  const r = spawnSync(
    'bash',
    ['-c', `set -uo pipefail\nsource .github/scripts/avisos-tecnicos.sh\n${SIMULADOS}\n${guion}`],
    {
      cwd: raiz,
      encoding: 'utf8',
      env: {
        ...process.env,
        D: dir,
        CURL_FALLA: '0',
        CURL_CODIGO: '400',
        CURL_CUERPO: '{"error":"PAYLOAD_INVALIDO"}',
        PSQL_FALLA: '0',
        PSQL_SALIDA: 't',
        BD: 'postgresql://simulada',
        ...env,
      },
    },
  );
  let anotado = '';
  try {
    anotado = readFileSync(path.join(dir, 'anotado'), 'utf8');
  } catch {
    anotado = '';
  }
  return { ...r, anotado };
}

describe('sondear_functions (RV-412)', () => {
  it('un 400 con el JSON de error: sin problema; POST con JSON a verificar-codigo y sin Origin', () => {
    const r = correr('sondear_functions https://app.example');
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('');
    expect(r.anotado).toContain('curl https://app.example/api/verificar-codigo {}');
    expect(r.anotado).toContain('cabecera Content-Type: application/json');
    expect(r.anotado).not.toMatch(/Origin/i);
  });

  it.each([
    ['un 5xx', { CURL_CODIGO: '503', CURL_CUERPO: '{"error":"NO_CONFIGURADO"}' }],
    ['HTML con 400', { CURL_CODIGO: '400', CURL_CUERPO: '<!doctype html><title>Error</title>' }],
    ['la app servida en su lugar', { CURL_CODIGO: '200', CURL_CUERPO: '<div id="raiz"></div>' }],
    ['ninguna respuesta', { CURL_FALLA: '1' }],
  ])('%s es un problema', (_n, env) => {
    const r = correr('sondear_functions https://app.example', env);
    expect(r.stdout).toContain('https://app.example: las funciones del servidor no responden');
  });
});

describe('aviso_tecnico (RV-412)', () => {
  it.each(['vigilancia', 'respaldo', 'despliegue'])('encola la clave %s con fn_encolar_aviso_tecnico', (clave) => {
    const r = correr(`aviso_tecnico ${clave}`);
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe('t');
    expect(r.anotado).toContain(`select hidrantes.fn_encolar_aviso_tecnico('${clave}', null, null);`);
    expect(r.anotado).toContain('ON_ERROR_STOP=1');
  });

  it('ya avisado: «f», sin fallar', () => {
    const r = correr('aviso_tecnico respaldo', { PSQL_SALIDA: 'f' });
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe('f');
  });

  it('si psql falla, falla y no deja ver el error del servidor', () => {
    const r = correr('aviso_tecnico vigilancia', { PSQL_FALLA: '1' });
    expect(r.status).not.toBe(0);
    expect(r.stdout + r.stderr).not.toContain('servidor');
  });

  it('una clave que no es suya ni llega a la base', () => {
    const r = correr("aviso_tecnico \"x'); drop table y; --\"");
    expect(r.status).toBe(2);
    expect(r.anotado).not.toContain('psql');
  });

  it('sin cadena de conexión, falla', () => {
    const r = correr('aviso_tecnico vigilancia', { BD: '' });
    expect(r.status).toBe(1);
    expect(r.anotado).not.toContain('psql');
  });
});
