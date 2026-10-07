// Punto de entrada del Worker hidrantes-respaldos (docs/31 RV-133, DEC-173). Solo la exportación por
// defecto: el runtime de Workers trata cada exportación con nombre como un manejador (lo mismo que en
// workers/avisos). La lógica, en respaldos.ts.

import { type Env, atender } from './respaldos.ts';

export default {
  async fetch(peticion: Request, env: Env): Promise<Response> {
    return atender(peticion, env);
  },
};
