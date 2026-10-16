// El nombre de la app por entorno (docs/39 RV-524, DEC-223): en staging, «Hidrantes test», para distinguirla en un
// móvil con las dos instaladas; en producción y en local, «Hidrantes». Lo usan vite.config.ts (manifiesto, <title> y
// el nombre de iPhone) y la cabecera del panel. Vive en src/lib y no en config/: src no puede importar de config/
// (tsconfig.app.json), y vite.config.ts ya importa de src/lib (textos).

import { T } from './textos.ts';

type Entorno = 'local' | 'staging' | 'produccion';

/** El nombre corto: el de la pantalla de inicio y el de iPhone. */
export const nombreCortoDe = (entorno: Entorno): string =>
  entorno === 'staging' ? T.app.nombreCortoPruebas : T.app.nombreCorto;

/** El título de la cabecera del panel. */
export const tituloPanelDe = (entorno: Entorno): string =>
  entorno === 'staging' ? T.panel.tituloPruebas : T.panel.titulo;
