// Da de alta al propietario como administrador (05 §2.9) si todavía no existe.
// No va en una migración porque el repositorio es público (DEC-053): el correo viene del secreto
// PROPIETARIO_EMAIL de GitHub. Lo ejecutan deploy-staging.yml y deploy-prod.yml tras migrar.
// Nunca reactiva ni toca una fila existente: si jefatura lo desactivó, se respeta.

import { abortar, ejecutarScript, log, psqlOk } from './lib/comun.ts';

export function sqlPropietario(email: string): string {
  const e = email.trim().toLowerCase();
  if (!/^[^@\s']+@[^@\s']+\.[^@\s']+$/.test(e)) abortar('PROPIETARIO_EMAIL no tiene forma de correo.');
  return `with alta as (
  insert into hidrantes.administradores (email, creado_por) values ('${e}', 'migracion')
  on conflict (email) do nothing
  returning email
)
insert into hidrantes.registro (actor, es_admin, accion, despues)
select 'migracion', true, 'administrador_alta', jsonb_build_object('email', email) from alta
returning 1;`;
}

async function principal(): Promise<void> {
  const url = process.env.SUPABASE_DB_URL ?? abortar('Falta SUPABASE_DB_URL.');
  const email = process.env.PROPIETARIO_EMAIL;
  if (!email) {
    log.aviso('Sin PROPIETARIO_EMAIL: no se da de alta al propietario (npm run arranque lo configura).');
    return;
  }
  const r = psqlOk(url, sqlPropietario(email), { tuplas: true });
  // Sin mostrar el correo: el log de Actions es público.
  log.ok(r ? 'propietario dado de alta como administrador' : 'propietario ya presente en administradores');
}

if (import.meta.main) ejecutarScript(principal);
