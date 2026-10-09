// docs/33 RV-305: la lista de RPC que se llaman con service_role y la del pgTAP 40 son la misma. Si
// alguien añade una llamada en functions/** o scripts/** sin añadirla al pgTAP, este test falla en CI.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  PGTAP,
  argumentosDeLaLlamada,
  diferencias,
  planDePgtap,
  rpcDeServicio,
  rpcEnPgtap,
  rpcEnTexto,
} from './rpc-de-servicio.ts';

describe('rpcEnTexto', () => {
  it('lee el ayudante de las Functions y el de los scripts, con o sin tipo', () => {
    const codigo = `
      const a = await rpc(env, 'fn_uno', { x: 1 });
      const b = await rpc<Pendiente[]>(env, 'fn_dos', { limite: LOTE });
      const c = await rpc(e, "fn_tres", {});`;
    expect(rpcEnTexto(codigo)).toEqual(['fn_dos', 'fn_tres', 'fn_uno']);
  });

  it('una llamada con el JWT de quien llama no es de servicio', () => {
    const codigo = `
      const r = await rpc<boolean>(env, 'fn_es_admin', {}, { jwt });
      const s = await rpc<string>(env, 'fn_reservar_subida_admin', {}, { jwt: jwt });
      const t = await rpc(env, 'fn_pedir_trabajo', { workflow }, {
        jwt,
      });
      const u = await rpc(env, 'fn_registrar_error', { mensaje: \`fallo (\${r.codigo})\` });`;
    expect(rpcEnTexto(codigo)).toEqual(['fn_registrar_error']);
  });

  it('lee .rpc(...) y las URL /rest/v1/rpc/ escritas a mano', () => {
    const codigo = `
      await cliente.rpc('fn_cuatro', {});
      await fetch(\`\${url}/rest/v1/rpc/fn_cinco\`, { method: 'POST' });`;
    expect(rpcEnTexto(codigo)).toEqual(['fn_cinco', 'fn_cuatro']);
  });

  it('no confunde otras funciones que acaban en rpc ni un nombre en variable', () => {
    const codigo = `
      await llamarrpc(env, 'fn_no');
      await rpc(env, nombre, {});
      const ruta = \`\${url}/rest/v1/rpc/\${nombre}\`;`;
    expect(rpcEnTexto(codigo)).toEqual([]);
  });

  it('argumentosDeLaLlamada salta los paréntesis entre comillas', () => {
    const texto = `rpc(env, 'fn_x', { m: ')' }, { jwt })`;
    expect(argumentosDeLaLlamada(texto, texto.indexOf('('))).toBe(`env, 'fn_x', { m: ')' }, { jwt }`);
  });
});

describe('el pgTAP 40 comprueba exactamente las RPC de servicio (RV-305)', () => {
  const sql = readFileSync(PGTAP, 'utf8');
  const enCodigo = [...rpcDeServicio().keys()];

  it('encuentra las llamadas de verdad', () => {
    // Las que hicieron falta en D1 y las de la purga, por si una regex deja de leerlas.
    expect(enCodigo).toEqual(
      expect.arrayContaining([
        'fn_validar_token',
        'fn_registrar_error',
        'fn_reclamar_notificaciones',
        'fn_fotos_referenciadas_lista',
      ]),
    );
    // Llamadas con el JWT de jefatura: no son de servicio.
    expect(enCodigo).not.toContain('fn_es_admin');
    expect(enCodigo).not.toContain('fn_reservar_subida_admin');
    // La prueba de intrusión llama con la clave anónima a propósito.
    expect(enCodigo).not.toContain('fn_aprobar');
  });

  it('las dos listas y el plan coinciden', () => {
    expect(diferencias(enCodigo, rpcEnPgtap(sql), planDePgtap(sql))).toEqual([]);
  });

  it('fn_registrar_error se comprueba en la firma de seis argumentos, la de service_role', () => {
    expect(sql).toMatch(/\('fn_registrar_error',\s*6\)/);
  });

  it('diferencias dice qué falta y qué sobra', () => {
    expect(diferencias(['fn_a', 'fn_b'], ['fn_b', 'fn_c'], 2)).toEqual([
      `fn_a: se llama con service_role y ${PGTAP} no la comprueba`,
      `fn_c: ${PGTAP} la comprueba y ya nadie la llama`,
    ]);
    expect(diferencias(['fn_a'], ['fn_a'], 3)).toEqual([`${PGTAP}: plan(3) y la lista tiene 1`]);
  });
});
