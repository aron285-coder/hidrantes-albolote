// CLAUDE.md §3: nunca `console.log` en la app ni en las Functions. Los errores, a fn_registrar_error.
import { bloquear, escrituras, leerEntrada } from './comun.mjs';

const CODIGO = /(^|\/)(src|functions)\//;

for (const { ruta, texto } of escrituras(await leerEntrada())) {
  if (CODIGO.test(ruta) && /\bconsole\.log\s*\(/.test(texto)) {
    bloquear(
      'nada de `console.log(` en src/** ni en functions/** (CLAUDE.md §3): los errores van a `anotarError` / fn_registrar_error, sin datos personales.',
    );
  }
}
