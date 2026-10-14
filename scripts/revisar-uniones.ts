// Revisa las uniones de jefatura que ya existen (docs/36 RV-463, DEC-206). Para cada fila de
// `administradores` con `usuario_id`, lee ese usuario de Supabase Auth (solo esos ids: el proyecto
// es compartido con la app de uniformidad) y aplica la misma regla que /api/vincular-jefatura
// (RV-450). Si no la cumple, la desune con fn_desvincular_administrador (solo service_role) y deja un
// problema para la vigilancia.
//
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/revisar-uniones.ts
//
// Solo módulos de Node (DEC-198): corre en la vigilancia con secretos, sin node_modules. Escribe
// cada problema en una línea de la salida estándar, sin correos ni ids (11 §6), y el recuento en la
// de errores. Sale con 0 aunque haya problemas: los recoge la vigilancia. Sale con 1 si ni siquiera
// ha podido empezar.

export type Pedir = (url: string, init?: RequestInit) => Promise<Response>;

interface Identidad {
  provider?: unknown;
  identity_data?: { email?: unknown; email_verified?: unknown } | null;
}
export interface UsuarioAuth {
  id?: unknown;
  email?: unknown;
  identities?: unknown;
}
interface Union {
  email: string;
  usuario_id: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const PROBLEMA_DESUNIDA = 'una cuenta de jefatura se ha desunido: que vuelva a entrar';

const normalizar = (v: unknown) => (typeof v === 'string' ? v.trim().toLowerCase() : null);

/**
 * La regla de la unión (docs/36 §2, punto 1): al menos una identidad de Google; **todas** las
 * identidades con `email_verified === true` y el mismo correo, en minúsculas, que la de Google;
 * `user.email` ese mismo correo; y ese correo es el del administrador de la fila.
 */
export function unionLimpia(usuario: UsuarioAuth, correoAdministrador: string): boolean {
  const correo = normalizar(correoAdministrador);
  if (!correo || !correo.includes('@')) return false;
  if (normalizar(usuario.email) !== correo) return false;
  if (!Array.isArray(usuario.identities) || usuario.identities.length === 0) return false;
  const identidades = usuario.identities as (Identidad | null)[];
  if (!identidades.some((i) => i?.provider === 'google')) return false;
  return identidades.every(
    (i) => i?.identity_data?.email_verified === true && normalizar(i.identity_data.email) === correo,
  );
}

export interface Resultado {
  revisadas: number;
  desunidas: number;
  problemas: string[];
}

export async function revisarUniones(cfg: { url: string; clave: string; pedir?: Pedir }): Promise<Resultado> {
  const pedir = cfg.pedir ?? fetch;
  const base = cfg.url.replace(/\/+$/, '');
  const cabeceras = { apikey: cfg.clave, Authorization: `Bearer ${cfg.clave}` };
  const resultado: Resultado = { revisadas: 0, desunidas: 0, problemas: [] };

  let uniones: Union[];
  try {
    const r = await pedir(`${base}/rest/v1/administradores?select=email,usuario_id&usuario_id=not.is.null`, {
      headers: { ...cabeceras, 'Accept-Profile': 'hidrantes' },
    });
    if (!r.ok) {
      resultado.problemas.push(`no se pueden leer las uniones de jefatura (rest ${r.status})`);
      return resultado;
    }
    const datos: unknown = await r.json().catch(() => null);
    if (
      !Array.isArray(datos) ||
      !datos.every((u) => u && typeof u.email === 'string' && typeof u.usuario_id === 'string')
    ) {
      resultado.problemas.push('no se pueden leer las uniones de jefatura (respuesta inesperada)');
      return resultado;
    }
    uniones = datos as Union[];
  } catch {
    resultado.problemas.push('no se pueden leer las uniones de jefatura (red)');
    return resultado;
  }

  for (const union of uniones) {
    if (!UUID.test(union.usuario_id)) {
      resultado.problemas.push('una unión de jefatura tiene un usuario que no es válido: no se ha revisado');
      continue;
    }
    let usuario: UsuarioAuth | null = null;
    try {
      const r = await pedir(`${base}/auth/v1/admin/users/${union.usuario_id}`, { headers: cabeceras });
      if (r.ok) {
        const datos: unknown = await r.json().catch(() => undefined);
        if (!datos || typeof datos !== 'object' || Array.isArray(datos)) {
          resultado.problemas.push('no se ha podido revisar una unión de jefatura (auth respuesta inesperada)');
          continue;
        }
        usuario = datos as UsuarioAuth;
      } else if (r.status !== 404) {
        resultado.problemas.push(`no se ha podido revisar una unión de jefatura (auth ${r.status})`);
        continue;
      }
      // 404: el usuario ya no existe. La unión no vale para nadie: se desune como una mezclada.
    } catch {
      resultado.problemas.push('no se ha podido revisar una unión de jefatura (auth red)');
      continue;
    }
    resultado.revisadas++;
    if (usuario && unionLimpia(usuario, union.email)) continue;

    let motivo: string;
    try {
      const r = await pedir(`${base}/rest/v1/rpc/fn_desvincular_administrador`, {
        method: 'POST',
        headers: { ...cabeceras, 'Content-Type': 'application/json', 'Content-Profile': 'hidrantes' },
        body: JSON.stringify({ correo: union.email }),
      });
      const datos: unknown = await r.json().catch(() => undefined);
      if (r.ok && datos === true) {
        resultado.desunidas++;
        resultado.problemas.push(PROBLEMA_DESUNIDA);
        continue;
      }
      // false: entretanto ya no estaba unida (otro administrador le quitó el acceso). Nada que hacer.
      if (r.ok && datos === false) continue;
      motivo = r.ok ? 'rpc respuesta inesperada' : `rpc ${r.status}`;
    } catch {
      motivo = 'rpc red';
    }
    resultado.problemas.push(
      `una cuenta de jefatura no cumple la regla de la unión y no se ha podido desunir (${motivo}): quítale el acceso y devuélveselo en Ajustes`,
    );
  }
  return resultado;
}

async function principal(): Promise<number> {
  const url = process.env.SUPABASE_URL;
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !clave) {
    console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.');
    return 1;
  }
  const r = await revisarUniones({ url, clave });
  for (const p of r.problemas) console.log(p);
  console.error(`Uniones de jefatura: ${r.revisadas} revisadas, ${r.desunidas} desunidas.`);
  return 0;
}

if (import.meta.main) {
  principal().then(
    (codigo) => process.exit(codigo),
    () => {
      // Sin el error: podría llevar la URL o una respuesta con datos.
      console.error('La revisión de las uniones de jefatura ha fallado sin terminar.');
      process.exit(1);
    },
  );
}
