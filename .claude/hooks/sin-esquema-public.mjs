// CLAUDE.md §3: nunca tocar el esquema `public`. Es de la app de uniformidad, que comparte los dos
// proyectos de Supabase (04 §5). Todo va en `hidrantes` (DEC-196).
//
// Vigila lo que llega a la base de datos desde el repositorio: las migraciones y el seed de staging.
// Bloquea un objeto calificado con `public.` y `schema public` (crear, alterar, conceder sobre el
// esquema). Deja pasar `revoke … from public` y `grant … to public`: ahí `public` es el rol de todos
// los usuarios de Postgres, no el esquema, y las migraciones lo usan para quitar permisos.
import { bloquear, escrituras, leerEntrada } from './comun.mjs';

const SQL = /(^|\/)supabase\/(migrations\/[^/]+\.sql|seed-staging\.sql)$/;
const ESQUEMA = /\b"?public"?\s*\.\s*"?[a-z_]|\bschema\s+"?public\b/i;
/** Comentarios de SQL fuera: un comentario que explica la regla no la incumple. */
const sinComentarios = (texto) => texto.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');

for (const { ruta, texto } of escrituras(await leerEntrada())) {
  if (!SQL.test(ruta)) continue;
  const m = ESQUEMA.exec(sinComentarios(texto));
  if (m) {
    bloquear(
      `«${m[0].trim()}»: nunca se toca el esquema public, que es de la app de uniformidad (CLAUDE.md §3, DEC-196). Todo va en hidrantes.`,
    );
  }
}
