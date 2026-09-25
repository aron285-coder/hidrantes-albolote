// CLAUDE.md §3: nunca `supabase db push`. Las migraciones van por scripts/migrar.ts (04 §5).
import { bloquear, comandoDe, leerEntrada } from './comun.mjs';

const comando = comandoDe(await leerEntrada());
if (comando && /\bsupabase\s+(?:--\S+\s+)*db\s+push\b/.test(comando)) {
  bloquear('nunca `supabase db push` (CLAUDE.md §3). Las migraciones se aplican con `npm run migrar` (04 §5).');
}
