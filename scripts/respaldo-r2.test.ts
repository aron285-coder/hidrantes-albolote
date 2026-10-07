// La segunda copia del respaldo en R2 (docs/31 RV-133, DEC-173), en los workflows: respaldo.yml sube
// el mismo archivo cifrado sin imprimir el secreto, deploy-staging.yml despliega el Worker y la
// vigilancia mira /estado con un límite de 8 días.

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const WORKFLOWS = path.resolve(import.meta.dirname, '../.github/workflows');
const leer = (archivo: string) => readFileSync(path.join(WORKFLOWS, archivo), 'utf8');

/** El paso que empieza por `- name: <nombre>`, hasta el siguiente paso o trabajo. */
function paso(texto: string, nombre: string): string {
  const inicio = texto.indexOf(`- name: ${nombre}`);
  expect(inicio, nombre).toBeGreaterThan(-1);
  const resto = texto.slice(inicio + 10);
  const fin = resto.search(/\n {6}- (name|uses|if):|\n {2}[a-z-]+:\n/);
  return texto.slice(inicio, fin === -1 ? undefined : inicio + 10 + fin);
}

describe('Worker hidrantes-respaldos (RV-133)', () => {
  const toml = readFileSync(path.resolve(import.meta.dirname, '../workers/respaldos/wrangler.toml'), 'utf8');

  it('wrangler.toml: el bucket hidrantes-respaldos por binding y ningún secreto escrito', () => {
    expect(toml).toMatch(/^name = "hidrantes-respaldos"/m);
    expect(toml).toMatch(/^binding = "RESPALDOS"/m);
    expect(toml).toMatch(/^bucket_name = "hidrantes-respaldos"/m);
    expect(toml).not.toMatch(/RESPALDO_SUBIDA_SECRETO\s*=/);
    expect(toml).not.toMatch(/^\[vars\]/m);
  });

  it('deploy-staging.yml lo despliega tras Pages, y con un token sin permiso lo avisa', () => {
    const texto = leer('deploy-staging.yml');
    const cuerpo = paso(texto, 'Desplegar el Worker de los respaldos');
    expect(texto.indexOf('- name: Desplegar el Worker de los respaldos')).toBeGreaterThan(
      texto.indexOf('wrangler pages deploy'),
    );
    expect(cuerpo).toContain('npx wrangler deploy --config workers/respaldos/wrangler.toml');
    expect(cuerpo).toContain('workers/scripts/hidrantes-respaldos/secrets');
    expect(cuerpo).toMatch(/"\$codigo" = "401" \] \|\| \[ "\$codigo" = "403"/);
    expect(cuerpo).toContain('::warning::');
  });
});

describe('respaldo.yml sube el mismo archivo cifrado a R2 (RV-133)', () => {
  const texto = leer('respaldo.yml');

  it('el volcado, después del artefacto, con el mismo archivo y el nombre AAAA-MM-DD', () => {
    const cuerpo = paso(texto, 'Segunda copia del volcado en R2');
    expect(texto.indexOf('- name: Segunda copia del volcado en R2')).toBeGreaterThan(
      texto.indexOf('name: respaldo-hidrantes'),
    );
    expect(cuerpo).toContain(
      'npx tsx scripts/subir-respaldo.ts --tipo bd --archivo "hidrantes-$FECHA.sql.gpg" --nombre "$FECHA.sql.gpg"',
    );
    // Sin continue-on-error: si la subida falla, el job falla y abre la issue de siempre.
    expect(cuerpo).not.toContain('continue-on-error');
    expect(cuerpo).not.toMatch(/\|\| true/);
  });

  it('las fotos, si se han respaldado, con el nombre del mes', () => {
    const cuerpo = paso(texto, 'Segunda copia de las fotos en R2');
    expect(cuerpo).toContain("if: steps.fotos.outcome == 'success'");
    expect(cuerpo).toContain('--tipo fotos --archivo "fotos-$FECHA.tar.gpg" --nombre "${FECHA:0:7}.tar.gpg"');
  });

  it('sin fotos en el bucket, el tar vacío no falla (#439)', () => {
    const cuerpo = paso(texto, 'Fotos del bucket, cifradas (mensual)');
    expect(cuerpo.indexOf('mkdir -p "fotos-$FECHA"')).toBeGreaterThan(-1);
    expect(cuerpo.indexOf('mkdir -p "fotos-$FECHA"')).toBeLessThan(cuerpo.indexOf('tar -cf'));
  });

  it('nunca se descifra en CI', () => {
    expect(texto).not.toMatch(/gpg[^\n]*--decrypt|gpg -d\b/);
  });
});

describe('el secreto de subida no se imprime en ningún workflow (RV-133)', () => {
  const archivos = readdirSync(WORKFLOWS).filter((f) => f.endsWith('.yml'));

  it('solo llega por env, nunca escrito en un run:', () => {
    for (const archivo of archivos) {
      const texto = leer(archivo);
      for (const [i, linea] of texto.split('\n').entries()) {
        if (!linea.includes('RESPALDO_SUBIDA_SECRETO')) continue;
        const donde = `${archivo}:${i + 1}`;
        if (linea.includes('secrets.RESPALDO_SUBIDA_SECRETO')) {
          // Solo como variable de entorno del paso.
          expect(linea.trim(), donde).toBe('RESPALDO_SUBIDA_SECRETO: ${{ secrets.RESPALDO_SUBIDA_SECRETO }}');
          continue;
        }
        expect(linea, donde).not.toMatch(/\becho\b[^\n]*\$\{?RESPALDO_SUBIDA_SECRETO/);
        expect(linea, donde).not.toMatch(/curl[^\n]*\$\{?RESPALDO_SUBIDA_SECRETO/);
        expect(linea, donde).not.toMatch(/set -x/);
        // Lo único admitido: escribirlo a un archivo de cabecera para curl -H @archivo.
        if (/printf[^\n]*RESPALDO_SUBIDA_SECRETO/.test(linea)) expect(linea, donde).toMatch(/> "\$cabecera"$/);
      }
    }
  });
});

describe('vigilancia mira la copia en R2 (RV-133)', () => {
  const texto = leer('vigilancia.yml');

  it('un trabajo en prod-tareas pregunta a /estado y avisa con 8 días o más', () => {
    const cuerpo = paso(texto, 'Último respaldo en R2');
    expect(texto).toMatch(/respaldos:\n {4}runs-on: ubuntu-24\.04\n {4}environment: prod-tareas/);
    expect(cuerpo).toContain('"${RESPALDOS_URL%/}/estado"');
    expect(cuerpo).toContain('-H @"$cabecera"');
    expect(cuerpo).toContain('if [ "$dias" -ge 8 ]');
    expect(cuerpo).toContain("jq -r '.bd.fecha // empty'");
  });

  it('el resultado llega a la issue de la vigilancia, también si el trabajo no termina', () => {
    expect(texto).toContain('needs: [worker, staging, respaldos]');
    expect(texto).toContain('R2_PROBLEMA: ${{ needs.respaldos.outputs.problema }}');
    expect(texto).toContain('if [ "${R2_RESULTADO:-}" != success ]; then');
  });
});
