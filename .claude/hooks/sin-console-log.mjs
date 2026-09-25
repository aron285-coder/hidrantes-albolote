// CLAUDE.md §3: nunca `console.log` en la app ni en las Functions. Los errores, a fn_registrar_error.
import { bloquear, escrituras, leerEntrada } from './comun.mjs';

// El Service Worker (public/) y el Worker de los avisos (workers/) también llegan a producción
// (docs/22 RV-91). public/mapabase/ no tiene JavaScript.
const CODIGO = /(^|\/)(src|functions|workers|public)\/.*\.(t|j)sx?$/;

for (const { ruta, texto } of escrituras(await leerEntrada())) {
  if (CODIGO.test(ruta) && /\bconsole\.log\s*\(/.test(texto)) {
    bloquear(
      'nada de `console.log(` en src/**, functions/**, workers/** ni public/** (CLAUDE.md §3): los errores van a `anotarError` / fn_registrar_error, sin datos personales.',
    );
  }
}
