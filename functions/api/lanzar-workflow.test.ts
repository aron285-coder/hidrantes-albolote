// Los trabajos de mantenimiento que jefatura pide desde Ajustes (FR-144, FR-165, RV-146). La Function
// ya no habla con GitHub ni guarda ningún token: deja un pedido en la base de datos
// (fn_pedir_trabajo) y despachador.yml lo recoge en producción. En staging, los trabajos que solo
// actúan sobre producción (purgar fotos, respaldo) se rechazan: el bucket y la base de producción no
// se tocan desde el panel de pruebas.

import { describe, expect, it, vi } from 'vitest';
import { type Env } from '../_lib/comun.ts';
import { SOLO_PRODUCCION, WORKFLOWS, onRequestPost } from './lanzar-workflow.ts';

const BASE = {
  SUPABASE_URL: 'https://proyecto.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'clave-de-servicio', // detectar-secretos:permitir (valor de prueba)
  SAL_IP: 'sal',
};
const PRODUCCION = { ...BASE, ENTORNO: 'produccion' } as Env;
const STAGING = { ...BASE, ENTORNO: 'staging' } as Env;

const peticion = (cuerpo: unknown, conSesion = true) =>
  new Request('https://hidrantes-albolote.pages.dev/api/lanzar-workflow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(conSesion ? { Authorization: 'Bearer a.b.c' } : {}) },
    body: JSON.stringify(cuerpo),
  });

interface Red {
  admin?: boolean;
  /** Lo que contesta fn_pedir_trabajo. */
  pedido?: Response | Error;
}

function fingirRed({ admin = true, pedido = new Response('1') }: Red = {}) {
  const llamadas: { url: string; cuerpo: unknown; autorizacion: string | null }[] = [];
  const espia = vi.spyOn(globalThis, 'fetch').mockImplementation((entrada, opciones) => {
    const url = String(entrada);
    const init = opciones as RequestInit | undefined;
    const cuerpo = init?.body;
    llamadas.push({
      url,
      cuerpo: typeof cuerpo === 'string' ? JSON.parse(cuerpo) : cuerpo,
      autorizacion: new Headers(init?.headers).get('Authorization'),
    });
    if (url.includes('fn_es_admin')) return Promise.resolve(new Response(String(admin)));
    if (url.includes('fn_pedir_trabajo')) {
      return pedido instanceof Error ? Promise.reject(pedido) : Promise.resolve(pedido.clone());
    }
    return Promise.resolve(new Response('null'));
  });
  return { espia, llamadas };
}

const raise = (codigo: string) =>
  new Response(JSON.stringify({ code: 'P0001', message: `${codigo}: detalle` }), { status: 400 });

describe('POST /api/lanzar-workflow', () => {
  it('nunca llama a GitHub, en ningún entorno ni con ningún trabajo', async () => {
    const { espia, llamadas } = fingirRed();
    for (const env of [PRODUCCION, STAGING]) {
      for (const workflow of WORKFLOWS) await onRequestPost({ request: peticion({ workflow }), env });
    }
    expect(llamadas.some((l) => l.url.includes('github.com'))).toBe(false);
    espia.mockRestore();
  });

  it('sin sesión de administrador, 403 y no se pide nada', async () => {
    const { espia, llamadas } = fingirRed({ admin: false });
    const r = await onRequestPost({ request: peticion({ workflow: 'respaldo' }), env: PRODUCCION });
    expect(r.status).toBe(403);
    expect(llamadas.some((l) => l.url.includes('fn_pedir_trabajo'))).toBe(false);
    espia.mockRestore();
  });

  it('un workflow que no está en la lista es 400, venga como venga', async () => {
    const { espia, llamadas } = fingirRed();
    for (const cuerpo of [{}, { workflow: 'despliegue' }, { workflow: 42 }, { workflow: '../../otro' }]) {
      const r = await onRequestPost({ request: peticion(cuerpo), env: PRODUCCION });
      expect(r.status, JSON.stringify(cuerpo)).toBe(400);
    }
    expect(llamadas.some((l) => l.url.includes('fn_pedir_trabajo'))).toBe(false);
    espia.mockRestore();
  });

  describe('en producción', () => {
    it.each(WORKFLOWS)('%s se pide en la base de datos, con la sesión de quien lo pide', async (workflow) => {
      const { espia, llamadas } = fingirRed();
      const r = await onRequestPost({ request: peticion({ workflow }), env: PRODUCCION });

      expect(r.status).toBe(202);
      expect(await r.json()).toEqual({ pedido: true, workflow });
      const pedido = llamadas.find((l) => l.url.includes('/rpc/fn_pedir_trabajo'))!;
      expect(pedido.cuerpo).toEqual({ workflow });
      // Con el JWT del administrador: la base de datos comprueba quién es y lo anota en el registro.
      expect(pedido.autorizacion).toBe('Bearer a.b.c');
      espia.mockRestore();
    });

    it('si ya hay un pedido pendiente de ese trabajo, 409 YA_PEDIDO', async () => {
      const { espia } = fingirRed({ pedido: raise('YA_PEDIDO') });
      const r = await onRequestPost({ request: peticion({ workflow: 'respaldo' }), env: PRODUCCION });
      expect(r.status).toBe(409);
      expect(await r.json()).toEqual({ error: 'YA_PEDIDO' });
      espia.mockRestore();
    });

    it('si la base de datos dice que no es administrador, 403', async () => {
      const { espia } = fingirRed({ pedido: raise('NO_AUTORIZADO') });
      const r = await onRequestPost({ request: peticion({ workflow: 'respaldo' }), env: PRODUCCION });
      expect(r.status).toBe(403);
      expect(await r.json()).toEqual({ error: 'NO_AUTORIZADO' });
      espia.mockRestore();
    });

    it('si la base de datos no contesta, 503 y no se da por pedido (UI-04)', async () => {
      const { espia } = fingirRed({ pedido: new TypeError('fetch failed') });
      const r = await onRequestPost({ request: peticion({ workflow: 'respaldo' }), env: PRODUCCION });
      expect(r.status).toBe(503);
      expect(await r.json()).toEqual({ error: 'SERVIDOR_NO_DISPONIBLE' });
      espia.mockRestore();
    });
  });

  describe('en staging', () => {
    it.each(SOLO_PRODUCCION)('%s es 409 SOLO_EN_PRODUCCION y no se pide nada', async (workflow) => {
      const { espia, llamadas } = fingirRed();
      const r = await onRequestPost({ request: peticion({ workflow }), env: STAGING });
      expect(r.status).toBe(409);
      expect(await r.json()).toEqual({ error: 'SOLO_EN_PRODUCCION' });
      expect(llamadas.some((l) => l.url.includes('fn_pedir_trabajo'))).toBe(false);
      espia.mockRestore();
    });

    it('purgar fotos y respaldo son justo los que solo actúan sobre producción', () => {
      expect([...SOLO_PRODUCCION].sort()).toEqual(['purgar-fotos', 'respaldo']);
    });

    it.each(WORKFLOWS.filter((w) => !(SOLO_PRODUCCION as readonly string[]).includes(w)))(
      '%s se pide en la base de datos de staging',
      async (workflow) => {
        const { espia, llamadas } = fingirRed();
        const r = await onRequestPost({ request: peticion({ workflow }), env: STAGING });
        expect(r.status).toBe(202);
        expect(await r.json()).toEqual({ pedido: true, workflow });
        expect(llamadas.some((l) => l.url.includes('fn_pedir_trabajo'))).toBe(true);
        espia.mockRestore();
      },
    );

    // Sin ENTORNO (o con un valor raro) se trata como staging: lo seguro es no tocar producción.
    it.each([undefined, '', 'Produccion', 'production', 'prod'])(
      'con ENTORNO=%s cuenta como staging',
      async (entorno) => {
        const { espia } = fingirRed();
        const r = await onRequestPost({
          request: peticion({ workflow: 'purgar-fotos' }),
          env: { ...BASE, ENTORNO: entorno } as Env,
        });
        expect(r.status).toBe(409);
        expect(await r.json()).toEqual({ error: 'SOLO_EN_PRODUCCION' });
        espia.mockRestore();
      },
    );
  });
});
