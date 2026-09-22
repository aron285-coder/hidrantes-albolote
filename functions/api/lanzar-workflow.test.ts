// Los trabajos de mantenimiento que jefatura lanza desde Ajustes (FR-144, FR-165, DEC-069). El
// token de GitHub que usa esta Function solo tiene `actions:write`, pero aun así solo puede
// disparar los workflows de la lista: nada de aceptar el nombre que venga en el cuerpo.

import { describe, expect, it, vi } from 'vitest';
import { type Env } from '../_lib/comun.ts';
import { ARCHIVO, WORKFLOWS, onRequestPost } from './lanzar-workflow.ts';

const ENV = {
  SUPABASE_URL: 'https://proyecto.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'clave-de-servicio', // detectar-secretos:permitir (valor de prueba)
  SAL_IP: 'sal',
  GITHUB_DISPATCH_TOKEN: 'token-de-despacho', // detectar-secretos:permitir (valor de prueba)
} as Env;

const peticion = (cuerpo: unknown, conSesion = true) =>
  new Request('https://hidrantes-albolote.pages.dev/api/lanzar-workflow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(conSesion ? { Authorization: 'Bearer a.b.c' } : {}) },
    body: JSON.stringify(cuerpo),
  });

function fingirRed({ admin = true, github = new Response(null, { status: 204 }) } = {}) {
  const llamadas: { url: string; cuerpo: unknown }[] = [];
  const espia = vi.spyOn(globalThis, 'fetch').mockImplementation((entrada, opciones) => {
    const url = String(entrada);
    const cuerpo = (opciones as RequestInit | undefined)?.body;
    llamadas.push({ url, cuerpo: typeof cuerpo === 'string' ? JSON.parse(cuerpo) : cuerpo });
    if (url.includes('fn_es_admin')) return Promise.resolve(new Response(String(admin)));
    if (url.includes('api.github.com')) return Promise.resolve(github);
    return Promise.resolve(new Response('null'));
  });
  return { espia, llamadas };
}

describe('POST /api/lanzar-workflow', () => {
  it('todos los trabajos que ofrece el panel tienen workflow (FR-144, FR-165)', () => {
    expect(WORKFLOWS.filter((w) => !ARCHIVO[w])).toEqual([]);
  });

  it('sin sesión de administrador, 403 y no se dispara nada', async () => {
    const { espia, llamadas } = fingirRed({ admin: false });
    const r = await onRequestPost({ request: peticion({ workflow: 'respaldo' }), env: ENV });
    expect(r.status).toBe(403);
    expect(llamadas.some((l) => l.url.includes('api.github.com'))).toBe(false);
    espia.mockRestore();
  });

  it('lanza la purga de fotos sobre develop y lo anota en el registro (FR-144)', async () => {
    const { espia, llamadas } = fingirRed();
    const r = await onRequestPost({ request: peticion({ workflow: 'purgar-fotos' }), env: ENV });

    expect(r.status).toBe(202);
    expect(await r.json()).toEqual({ lanzada: true, workflow: 'purgar-fotos' });
    const disparo = llamadas.find((l) => l.url.includes('api.github.com'))!;
    expect(disparo.url).toContain('/actions/workflows/purgar-fotos.yml/dispatches');
    expect(disparo.cuerpo).toEqual({ ref: 'develop' }); // sin entradas: el workflow usa sus valores por defecto
    expect(llamadas.some((l) => l.url.includes('fn_registrar_workflow'))).toBe(true);
    espia.mockRestore();
  });

  it('los trabajos de regeneración van al mismo workflow con su entrada (DEC-069)', async () => {
    for (const [workflow, trabajo] of [
      ['regenerar-zona', 'regenerar-zona'],
      ['regenerar-mapabase', 'regenerar-mapabase'],
    ] as const) {
      const { espia, llamadas } = fingirRed();
      await onRequestPost({ request: peticion({ workflow }), env: ENV });
      const disparo = llamadas.find((l) => l.url.includes('api.github.com'))!;
      expect(disparo.url).toContain('/actions/workflows/mantenimiento.yml/dispatches');
      expect(disparo.cuerpo).toEqual({ ref: 'develop', inputs: { trabajo } });
      espia.mockRestore();
    }
  });

  it('el respaldo va a su propio workflow y sin entradas: GitHub rechaza las que no declara', async () => {
    const { espia, llamadas } = fingirRed();
    const r = await onRequestPost({ request: peticion({ workflow: 'respaldo' }), env: ENV });

    expect(r.status).toBe(202);
    const disparo = llamadas.find((l) => l.url.includes('api.github.com'))!;
    expect(disparo.url).toContain('/actions/workflows/respaldo.yml/dispatches');
    expect(disparo.cuerpo).toEqual({ ref: 'develop' });
    espia.mockRestore();
  });

  it('un workflow que no está en la lista es 400, venga como venga', async () => {
    const { espia, llamadas } = fingirRed();
    for (const cuerpo of [{}, { workflow: 'despliegue' }, { workflow: 42 }, { workflow: '../../otro' }]) {
      const r = await onRequestPost({ request: peticion(cuerpo), env: ENV });
      expect(r.status, JSON.stringify(cuerpo)).toBe(400);
    }
    expect(llamadas.some((l) => l.url.includes('api.github.com'))).toBe(false);
    espia.mockRestore();
  });

  it('sin token de GitHub lo dice con un código propio, no con un fallo mudo (UI-04)', async () => {
    const { espia } = fingirRed();
    const sinToken = { ...ENV, GITHUB_DISPATCH_TOKEN: undefined } as Env;
    const r = await onRequestPost({ request: peticion({ workflow: 'purgar-fotos' }), env: sinToken });
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ error: 'NO_CONFIGURADO' });
    espia.mockRestore();
  });

  it('si GitHub no acepta el disparo, 503 y no se anota nada en el registro', async () => {
    const { espia, llamadas } = fingirRed({ github: new Response('{"message":"Not Found"}', { status: 404 }) });
    const r = await onRequestPost({ request: peticion({ workflow: 'respaldo' }), env: ENV });
    expect(r.status).toBe(503);
    expect(llamadas.some((l) => l.url.includes('fn_registrar_workflow'))).toBe(false);
    espia.mockRestore();
  });
});
