// Punto de entrada del Worker hidrantes-avisos (docs/19 RV-52, DEC-097). Solo la exportación por
// defecto: el runtime de Workers trata cada exportación con nombre como un manejador y se niega a
// arrancar si alguna es otra cosa (lo cazó la prueba de integración con una constante). La lógica,
// en despachar.ts.

import { type Env, despachar } from './despachar.ts';

interface Contexto {
  waitUntil(promesa: Promise<unknown>): void;
}

export default {
  async scheduled(_evento: unknown, env: Env, ctx: Contexto): Promise<void> {
    ctx.waitUntil(despachar(env));
  },
  // Sin superficie HTTP (workers_dev = false y sin rutas): por si acaso, nada que ver aquí.
  async fetch(): Promise<Response> {
    return new Response('Not found', { status: 404 });
  },
};
