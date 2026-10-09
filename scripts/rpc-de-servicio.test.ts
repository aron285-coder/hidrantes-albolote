// docs/33 RV-305: la lista de RPC que se llaman con service_role y la del pgTAP 40 son la misma. Si
// alguien añade una llamada en functions/**, scripts/** o workers/** sin añadirla al pgTAP, o una que
// el escáner no sabe leer, este test falla en CI.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  COMPROBACIONES_FIJAS,
  PGTAP,
  argumentosDeLaLlamada,
  diferencias,
  planDePgtap,
  rpcDeServicio,
  rpcEnPgtap,
  rpcEnTexto,
} from './rpc-de-servicio.ts';

const nombres = (codigo: string) => rpcEnTexto(codigo).nombres;

describe('rpcEnTexto', () => {
  it('lee el ayudante de las Functions y el de los scripts, con o sin tipo', () => {
    const codigo = `
      const a = await rpc(env, 'fn_uno', { x: 1 });
      const b = await rpc<Pendiente[]>(env, 'fn_dos', { limite: LOTE });
      const c = await rpc(e, "fn_tres", {});`;
    expect(rpcEnTexto(codigo)).toEqual({ nombres: ['fn_dos', 'fn_tres', 'fn_uno'], problemas: [] });
  });

  it('lee tipos anidados y un primer argumento con punto', () => {
    const codigo = `
      await rpc<Record<string, number>>(env, 'fn_anidado', {});
      await rpc<Array<Map<string, Fila>>>(contexto.env, 'fn_con_punto', {});`;
    expect(nombres(codigo)).toEqual(['fn_anidado', 'fn_con_punto']);
  });

  it('una llamada con el JWT de quien llama no es de servicio', () => {
    const codigo = `
      const r = await rpc<boolean>(env, 'fn_es_admin', {}, { jwt });
      const s = await rpc<string>(env, 'fn_reservar_subida_admin', {}, { jwt: jwt! });
      const t = await rpc(env, 'fn_pedir_trabajo', { workflow }, {
        jwt,
      });
      const u = await rpc(env, 'fn_registrar_error', { mensaje: \`fallo (\${r.codigo})\` });`;
    expect(nombres(codigo)).toEqual(['fn_registrar_error']);
  });

  it('la palabra jwt en otro sitio de la llamada no la saca de la lista', () => {
    const codigo = `
      await rpc(env, 'fn_mensaje', { mensaje: 'jwt caducado' });
      await rpc(env, 'fn_campo', { jwt: 'x' });
      await rpc(env, 'fn_comentario', {
        // el jwt no hace falta aquí
        a: 1,
      });`;
    expect(nombres(codigo)).toEqual(['fn_campo', 'fn_comentario', 'fn_mensaje']);
  });

  it('lee .rpc(...) y las URL /rest/v1/rpc/ escritas a mano', () => {
    const codigo = `
      await cliente.rpc('fn_cuatro', {});
      await fetch(\`\${url}/rest/v1/rpc/fn_cinco\`, { method: 'POST' });`;
    expect(nombres(codigo)).toEqual(['fn_cinco', 'fn_cuatro']);
  });

  it('no confunde otras funciones que acaban en rpc ni la definición del ayudante', () => {
    const codigo = `
      await llamarrpc(env, 'fn_no');
      export async function rpc<T>(env: Env, nombre: string) {}
      async function rpc(e: Entorno, nombre: string, cuerpo: object) {}`;
    expect(rpcEnTexto(codigo)).toEqual({ nombres: [], problemas: [] });
  });

  it('lo que no sabe leer sale como problema, no pasa en silencio', () => {
    const codigo = `
      await rpc(env, nombre, {});
      const llamar = (n) => fetch(\`\${url}/rest/v1/rpc/\${n}\`, {});`;
    expect(rpcEnTexto(codigo, 'scripts/nuevo.ts').problemas).toEqual([
      'scripts/nuevo.ts:2: rpc con el nombre de la función fuera de un literal',
      'scripts/nuevo.ts: /rest/v1/rpc/${…} en un ayudante que no está en AYUDANTES',
    ]);
    expect(rpcEnTexto('await rpc(env, "fn_x", {', 'a.ts').problemas).toEqual(['a.ts:1: llamada a rpc sin cerrar']);
  });

  it('argumentosDeLaLlamada parte en el primer nivel y salta comillas y comentarios', () => {
    const texto = `rpc(env, 'fn_x', { m: ')', n: [1, 2] } /* ) */, { jwt })`;
    expect(argumentosDeLaLlamada(texto, texto.indexOf('('))).toEqual([
      'env',
      "'fn_x'",
      "{ m: ')', n: [1, 2] } /* ) */",
      '{ jwt }',
    ]);
    expect(() => argumentosDeLaLlamada('rpc(env, ', 3)).toThrow();
  });
});

describe('el pgTAP 40 comprueba exactamente las RPC de servicio (RV-305)', () => {
  const sql = readFileSync(PGTAP, 'utf8');
  const { donde, problemas } = rpcDeServicio();
  const enCodigo = [...donde.keys()];

  it('lee todas las llamadas del repositorio', () => {
    expect(problemas).toEqual([]);
  });

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
    expect(enCodigo).not.toContain('fn_pedir_trabajo');
    // La prueba de intrusión llama con la clave anónima a propósito.
    expect(enCodigo).not.toContain('fn_aprobar');
  });

  it('las dos listas y el plan coinciden', () => {
    expect(diferencias(enCodigo, rpcEnPgtap(sql), planDePgtap(sql))).toEqual([]);
  });

  it('fn_registrar_error se comprueba en la firma de seis argumentos, la de service_role', () => {
    expect(sql).toMatch(/\('fn_registrar_error',\s*6\)/);
  });

  it('el pgTAP comprueba también usage sobre el esquema', () => {
    expect(sql).toMatch(/has_schema_privilege\('service_role', 'hidrantes', 'usage'\)/);
  });

  it('diferencias dice qué falta y qué sobra', () => {
    expect(diferencias(['fn_a', 'fn_b'], ['fn_b', 'fn_c'], 2 + COMPROBACIONES_FIJAS)).toEqual([
      `fn_a: se llama con service_role y ${PGTAP} no la comprueba`,
      `fn_c: ${PGTAP} la comprueba y ya nadie la llama`,
    ]);
    expect(diferencias(['fn_a'], ['fn_a'], 3)).toEqual([
      `${PGTAP}: plan(3) y tendría que ser ${1 + COMPROBACIONES_FIJAS}`,
    ]);
    // Si no encuentra la lista del pgTAP, no pasa: todas faltan.
    expect(diferencias(['fn_a'], [], null)).toHaveLength(2);
  });
});
