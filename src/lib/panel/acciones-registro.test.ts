// docs/36 RV-472: cada acción que el servidor puede escribir en el Registro tiene su nombre en el panel
// (y por tanto su opción en el filtro). La lista se saca de las migraciones: una acción nueva que llegue
// sin nombre hace fallar este test en vez de salir con su clave en el Registro.

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { NOMBRE_ACCION } from './inventario';

const MIGRACIONES = path.resolve(import.meta.dirname, '../../../supabase/migrations');

/** Lo que va entre el paréntesis que abre en `desde` y el que lo cierra (sin contar los de cadenas). */
function entreParentesis(sql: string, desde: number): string {
  let nivel = 0;
  let enCadena = false;
  for (let i = desde; i < sql.length; i++) {
    const c = sql[i];
    if (c === "'") enCadena = !enCadena;
    if (enCadena) continue;
    if (c === '(') nivel++;
    else if (c === ')' && --nivel === 0) return sql.slice(desde + 1, i);
  }
  return sql.slice(desde + 1);
}

/** Los argumentos de primer nivel de una llamada. */
function argumentos(dentro: string): string[] {
  const args: string[] = [];
  let nivel = 0;
  let enCadena = false;
  let actual = '';
  for (const c of dentro) {
    if (c === "'") enCadena = !enCadena;
    if (!enCadena && c === '(') nivel++;
    if (!enCadena && c === ')') nivel--;
    if (!enCadena && nivel === 0 && c === ',') {
      args.push(actual);
      actual = '';
    } else actual += c;
  }
  return [...args, actual];
}

const literales = (texto: string) => [...texto.matchAll(/'([a-z][a-z0-9_]*)'/g)].map((m) => m[1]!);

/**
 * Sin comentarios (`-- …` y `/* … *\/`), que pueden citar acciones de ejemplo. Un `--` dentro de una
 * cadena no es un comentario.
 */
function sinComentarios(sql: string): string {
  let fuera = '';
  let enCadena = false;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (c === "'") enCadena = !enCadena;
    if (!enCadena && c === '-' && sql[i + 1] === '-') {
      const fin = sql.indexOf('\n', i);
      i = fin === -1 ? sql.length : fin - 1;
      continue;
    }
    if (!enCadena && c === '/' && sql[i + 1] === '*') {
      const fin = sql.indexOf('*/', i + 2);
      i = fin === -1 ? sql.length : fin + 1;
      continue;
    }
    fuera += c;
  }
  return fuera;
}

function accionesDeLasMigraciones(): Set<string> {
  const acciones = new Set<string>();
  for (const archivo of readdirSync(MIGRACIONES).filter((a) => a.endsWith('.sql'))) {
    const sql = sinComentarios(readFileSync(path.join(MIGRACIONES, archivo), 'utf8'));
    // 1. El cuarto argumento de cada llamada a fn_registrar (actor, dispositivo, es_admin, accion, …).
    for (const m of sql.matchAll(/fn_registrar\s*\(/g)) {
      const accion = argumentos(entreParentesis(sql, m.index + m[0].length - 1))[3] ?? '';
      for (const a of literales(accion)) acciones.add(a);
    }
    // 2. Las que admite el check de registro.accion (las que se escriben sin fn_registrar, como la
    //    restauración de un respaldo, y las que se calculan en una variable antes de la llamada).
    for (const m of sql.matchAll(/check\s*\(\s*\(?\s*accion\s+in\s*\(/gi)) {
      for (const a of literales(entreParentesis(sql, m.index + m[0].length - 1))) acciones.add(a);
    }
    // El mismo check escrito como `accion = any (array[…])`.
    for (const m of sql.matchAll(/accion\s*=\s*any\s*\(\s*\(?\s*array\s*\[([^\]]*)\]/gi)) {
      for (const a of literales(m[1]!)) acciones.add(a);
    }
    // 3. Las que se añaden a ese check desde un bloque `do` (0046: `actuales || 'x'`, o con array_append).
    if (sql.includes('registro_accion_check')) {
      for (const m of sql.matchAll(/\|\|\s*'([a-z][a-z0-9_]*)'\s*::\s*text/g)) acciones.add(m[1]!);
      for (const m of sql.matchAll(/array_append\s*\([^,]+,\s*'([a-z][a-z0-9_]*)'/g)) acciones.add(m[1]!);
    }
  }
  return acciones;
}

describe('acciones del Registro (RV-472)', () => {
  const acciones = accionesDeLasMigraciones();

  it('saca de las migraciones las acciones que se sabe que existen', () => {
    for (const a of ['propuesta_creada', 'aprobacion_con_correcciones', 'restauracion_respaldo', 'entrada_abierta'])
      expect(acciones).toContain(a);
    expect(acciones).toContain('administrador_vinculado');
    // Las 25 de 0047. Si baja, el analizador ha dejado de ver alguna.
    expect(acciones.size).toBeGreaterThanOrEqual(25);
  });

  it('todas tienen nombre en el panel', () => {
    const sinNombre = [...acciones].filter((a) => !Object.hasOwn(NOMBRE_ACCION, a)).sort();
    expect(sinNombre).toEqual([]);
  });
});
