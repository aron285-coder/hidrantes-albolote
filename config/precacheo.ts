// El callejero sin conexión en el precacheo del Service Worker (TR-117, docs/18 GM-04), con la
// revisión del contenido: si se regenera, el móvil baja el nuevo al actualizar la app. Solo ese
// archivo: `globPatterns` no incluye `json`, así que nada más de `public/` entra por error.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export function entradaCallejero(ruta: string): { url: string; revision: string } {
  const revision = createHash('sha256').update(readFileSync(ruta)).digest('hex').slice(0, 16);
  return { url: '/callejero.json', revision };
}
