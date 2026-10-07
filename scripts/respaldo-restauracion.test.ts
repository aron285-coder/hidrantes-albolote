// La prueba semanal de restauración (docs/31 RV-134): respaldo.yml restaura el volcado sin cifrar en
// un Postgres de servicio y cuenta los puntos, y ese volcado nunca sale del runner.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const RAIZ = path.resolve(import.meta.dirname, '..');
const yml = readFileSync(path.join(RAIZ, '.github/workflows/respaldo.yml'), 'utf8');
const script = readFileSync(path.join(RAIZ, '.github/scripts/probar-restauracion-servicio.sh'), 'utf8');

function paso(nombre: string): string {
  const inicio = yml.indexOf(`- name: ${nombre}`);
  expect(inicio, nombre).toBeGreaterThan(-1);
  const resto = yml.slice(inicio + 10);
  const fin = resto.search(/\n {6}- (name|uses|if):/);
  return yml.slice(inicio, fin === -1 ? undefined : inicio + 10 + fin);
}

describe('respaldo.yml comprueba el respaldo restaurándolo (RV-134)', () => {
  it('con un Postgres de servicio de la imagen de Supabase, en el puerto del Supabase local', () => {
    expect(yml).toMatch(/services:\n {6}postgres:\n {8}image: ghcr\.io\/supabase\/postgres:17\.\d+\.\d+\.\d+/);
    expect(yml).toContain('- 55422:5432');
  });

  it('vuelca sin cifrar fuera del espacio de trabajo, cifra ese mismo archivo y cuenta los puntos antes y después', () => {
    const cuerpo = paso('Volcado del esquema hidrantes, cifrado');
    expect(cuerpo).toContain('umask 077');
    expect(cuerpo).toContain('plano="$RUNNER_TEMP/hidrantes-$FECHA.sql"');
    expect(cuerpo).toContain('pg_dump --schema=hidrantes --no-owner --format=plain --file "$plano" "$BD"');
    expect(cuerpo).toMatch(/--output "hidrantes-\$FECHA\.sql\.gpg" "\$plano"/);
    expect(cuerpo.indexOf('puntos_antes=')).toBeLessThan(cuerpo.indexOf('pg_dump'));
    expect(cuerpo.indexOf('puntos_despues=')).toBeGreaterThan(cuerpo.indexOf('pg_dump'));
    expect(cuerpo).toContain('echo "PUNTOS_ORIGEN=$puntos_antes $puntos_despues"');
  });

  it('restaura después de guardar el respaldo, y el job falla si no cuadra', () => {
    const cuerpo = paso('Restaurar el volcado en el Postgres de servicio y contar los puntos');
    expect(cuerpo).toContain('bash .github/scripts/probar-restauracion-servicio.sh "$PLANO" $PUNTOS_ORIGEN');
    expect(cuerpo).not.toContain('continue-on-error');
    const restaurar = yml.indexOf('- name: Restaurar el volcado en el Postgres de servicio');
    expect(restaurar).toBeGreaterThan(yml.indexOf('name: respaldo-hidrantes'));
    expect(restaurar).toBeLessThan(yml.indexOf('- name: Avisar si el respaldo ha fallado'));
  });

  it('el volcado sin cifrar se borra siempre y ningún artefacto lo lleva', () => {
    const cuerpo = paso('Borrar el volcado sin cifrar');
    expect(cuerpo).toContain('if: always()');
    expect(cuerpo).toContain('"$PLANO"');
    for (const m of yml.matchAll(/path: (.+)/g)) expect(m[1]).toMatch(/\.gpg$/);
  });

  it('el script restaura con restaurar.ts --entorno local, sin el esquema, y compara con todos los números', () => {
    expect(script).toContain('set -euo pipefail');
    expect(script).toContain('-f supabase/sql/arranque-bd.sql');
    expect(script).toContain('drop schema if exists hidrantes cascade');
    expect(script).toContain('npx tsx scripts/restaurar.ts --entorno local --archivo "$volcado" --confirmar RESTAURAR');
    expect(script).toContain('select count(*) from hidrantes.puntos');
    expect(script).toMatch(/for esperado in "\$@"/);
    expect(script).toMatch(/exit 1\s*$/);
    // Nada del volcado por pantalla.
    expect(script).not.toMatch(/\bcat\b|\bhead\b|\btail\b/);
  });

  it('silencia el registro del servidor antes de restaurar: Actions lo imprime al parar el contenedor', () => {
    for (const ajuste of [
      "log_statement = 'none'",
      "log_min_messages = 'fatal'",
      "log_min_error_statement = 'panic'",
    ]) {
      expect(script).toContain(`alter system set ${ajuste}`);
    }
    expect(script).toContain('select pg_reload_conf()');
    expect(script).toContain('"$silencio" != "none panic "');
    expect(script.indexOf('pg_reload_conf')).toBeLessThan(script.indexOf('scripts/restaurar.ts'));
  });

  it('sin fotos en el bucket, el tar vacío no falla (#439)', () => {
    const cuerpo = paso('Fotos del bucket, cifradas (mensual)');
    expect(cuerpo.indexOf('mkdir -p "fotos-$FECHA"')).toBeGreaterThan(-1);
    expect(cuerpo.indexOf('mkdir -p "fotos-$FECHA"')).toBeLessThan(cuerpo.indexOf('tar -cf'));
  });

  it('nunca se descifra en CI', () => {
    expect(yml).not.toMatch(/gpg[^\n]*--decrypt|gpg -d\b/);
  });
});
