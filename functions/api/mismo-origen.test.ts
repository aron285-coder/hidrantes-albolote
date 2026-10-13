// docs/35 RV-401 (DEC-199, 05 §9): las Functions con POST solo atienden peticiones de la propia app.
// Una petición de otra web se rechaza con 403 ORIGEN_NO_PERMITIDO antes de leer el cuerpo o llamar a
// la base de datos; las de servidor a servidor (sin Origin) siguen pasando.

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type Env, type Manejador } from '../_lib/comun.ts';
import { onRequestPost as error } from './error.ts';
import { onRequestPost as geocodificar } from './geocodificar.ts';
import { onRequestPost as lanzarWorkflow } from './lanzar-workflow.ts';
import { onRequestPost as push } from './push.ts';
import { onRequestPost as urlSubida } from './url-subida.ts';
import { onRequestPost as verificarCodigo } from './verificar-codigo.ts';
import { onRequestPost as vincularJefatura } from './vincular-jefatura.ts';

const ENV = {
  SUPABASE_URL: 'https://proyecto.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'clave-de-servicio', // detectar-secretos:permitir (valor de prueba)
  SAL_IP: 'sal-larga-de-pruebas', // detectar-secretos:permitir (valor de prueba)
} as Env;

const ORIGEN = 'https://hidrantes-albolote-staging.pages.dev';

const MANEJADORES: Record<string, Manejador> = {
  error,
  geocodificar,
  'lanzar-workflow': lanzarWorkflow,
  push,
  'url-subida': urlSubida,
  'verificar-codigo': verificarCodigo,
  'vincular-jefatura': vincularJefatura,
};

const peticion = (ruta: string, cabeceras: Record<string, string>, cuerpo: string | null = '{}') =>
  new Request(`${ORIGEN}/api/${ruta}`, { method: 'POST', headers: cabeceras, body: cuerpo });

afterEach(() => vi.restoreAllMocks());

describe('ORIGEN_NO_PERMITIDO en todas las Functions con POST (docs/35 RV-401)', () => {
  it('la lista de arriba son todas las Functions con POST de functions/api', () => {
    const carpeta = path.dirname(fileURLToPath(import.meta.url));
    const conPost = readdirSync(carpeta)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
      .filter((f) => /export const onRequestPost\b/.test(readFileSync(path.join(carpeta, f), 'utf8')))
      .map((f) => f.replace(/\.ts$/, ''))
      .sort();
    expect(conPost).toEqual(Object.keys(MANEJADORES).sort());
  });

  const ajenas: [string, Record<string, string>, string | null][] = [
    ['otra web (Origin distinto)', { 'Content-Type': 'application/json', Origin: 'https://otra.example' }, '{}'],
    ['Origin null', { 'Content-Type': 'application/json', Origin: 'null' }, '{}'],
    [
      'otra web (Sec-Fetch-Site: cross-site)',
      { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'cross-site' },
      '{}',
    ],
    ['un subdominio hermano (same-site)', { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'same-site' }, '{}'],
    ['texto plano', { 'Content-Type': 'text/plain' }, '{}'],
    ['otra web, sin cuerpo ni Content-Type', { Origin: 'https://otra.example', 'Content-Length': '0' }, null],
    ['formulario', { 'Content-Type': 'application/x-www-form-urlencoded' }, 'a=1'],
    ['cuerpo sin Content-Type', {}, '{}'],
  ];

  for (const [ruta, manejador] of Object.entries(MANEJADORES)) {
    it(`/api/${ruta}: 403 ORIGEN_NO_PERMITIDO sin llamar a nadie`, async () => {
      const espia = vi.spyOn(globalThis, 'fetch');
      const aviso = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      // A la vez: /api/verificar-codigo tarda siempre lo mismo (TR-42), también en el 403.
      const respuestas = await Promise.all(
        ajenas.map(([, cabeceras, cuerpo]) => manejador({ request: peticion(ruta, cabeceras, cuerpo), env: ENV })),
      );
      for (const [i, r] of respuestas.entries()) {
        const que = ajenas[i]![0];
        expect(r.status, que).toBe(403);
        expect(await r.json(), que).toEqual({ error: 'ORIGEN_NO_PERMITIDO' });
      }
      expect(espia).not.toHaveBeenCalled();
      // Cada rechazo deja en el registro del Worker la ruta y el motivo, nada más.
      expect(aviso).toHaveBeenCalledTimes(ajenas.length);
      for (const [linea] of aviso.mock.calls) {
        expect(String(linea)).toMatch(new RegExp(`^ORIGEN_NO_PERMITIDO /api/${ruta} (tipo|origen|sitio)$`));
      }
    });
  }
});

describe('lo que sigue pasando', () => {
  // Cualquier respuesta que no sea el 403 de origen vale: aquí solo se mira la puerta.
  const noEsOrigen = async (r: Response) => {
    if (r.status !== 403) return true;
    const cuerpo = (await r.json()) as { error?: string };
    return cuerpo.error !== 'ORIGEN_NO_PERMITIDO';
  };

  it('la propia app: mismo Origin, same-origin y JSON con charset', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('[]'));
    const r = await push({
      request: peticion('push', {
        'Content-Type': 'application/json; charset=utf-8',
        Origin: ORIGEN,
        'Sec-Fetch-Site': 'same-origin',
      }),
      env: ENV,
    });
    expect(await noEsOrigen(r)).toBe(true);
  });

  it('servidor a servidor: sin Origin ni Sec-Fetch-Site (el Worker de avisos, la vigilancia)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('[]'));
    const r = await push({
      request: peticion('push', { 'Content-Type': 'application/json', 'X-Vigilancia': 'otro' }),
      env: ENV,
    });
    expect(await noEsOrigen(r)).toBe(true);
  });

  it('una navegación escrita a mano (Sec-Fetch-Site: none)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('[]'));
    const r = await push({
      request: peticion('push', { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'none' }),
      env: ENV,
    });
    expect(await noEsOrigen(r)).toBe(true);
  });

  it('el aviso del panel a /api/push: POST sin cuerpo y sin Content-Type, desde la propia app', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('[]'));
    const r = await push({
      request: peticion('push', { Origin: ORIGEN, 'Sec-Fetch-Site': 'same-origin', 'Content-Length': '0' }, null),
      env: ENV,
    });
    expect(await noEsOrigen(r)).toBe(true);
  });
});
