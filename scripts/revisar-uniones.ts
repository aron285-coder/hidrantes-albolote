// Revisa las uniones de jefatura que ya existen (docs/36 RV-463, DEC-206). Para cada fila de
// `administradores` con `usuario_id`, lee ese usuario de Supabase Auth (solo esos ids: el proyecto
// es compartido con la app de uniformidad) y aplica la misma regla que /api/vincular-jefatura
// (RV-450). Si no la cumple, la desune con fn_desvincular_administrador (solo service_role) y deja un
// problema para la vigilancia.
//
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… [REVISAR_UNIONES_MODO=desunir] node scripts/revisar-uniones.ts
//
// Sin REVISAR_UNIONES_MODO=desunir solo informa: dice el motivo de cada unión que no cumple la regla,
// sin desunir ninguna (lo primero, antes de desunir en producción).
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

// Los dos problemas que llevan aviso técnico en staging: .github/scripts/revisar-uniones.sh los busca
// por este texto (scripts/workflows.test.ts comprueba que coinciden).
export const PROBLEMA_DESUNIDA = 'una cuenta de jefatura se ha desunido: que vuelva a entrar';
export const PROBLEMA_SIN_DESUNIR = 'una cuenta de jefatura no cumple la regla de la unión y no se ha podido desunir';
export const PROBLEMA_NINGUNA =
  'ninguna cuenta de jefatura cumple la regla de la unión: no se ha desunido ninguna (¿ha cambiado Supabase Auth?); revísalo a mano';

const normalizar = (v: unknown) => (typeof v === 'string' ? v.trim().toLowerCase() : null);

/**
 * La regla de la unión (docs/36 §2, punto 1): al menos una identidad de Google; **todas** las
 * identidades con `email_verified === true` y el mismo correo, en minúsculas, que la de Google;
 * `user.email` ese mismo correo; y ese correo es el del administrador de la fila.
 */
export function unionLimpia(usuario: UsuarioAuth, correoAdministrador: string): boolean {
  return motivoDeMezcla(usuario, correoAdministrador) === null;
}

/**
 * Por qué una unión no cumple la regla, en palabras y sin datos (para el modo que solo informa), o
 * null si la cumple. `usuario` null: ya no existe en Auth.
 */
export function motivoDeMezcla(usuario: UsuarioAuth | null, correoAdministrador: string): string | null {
  if (!usuario) return 'el usuario ya no existe';
  const correo = normalizar(correoAdministrador);
  if (!correo || !correo.includes('@')) return 'la fila no tiene un correo válido';
  if (normalizar(usuario.email) !== correo) return 'el correo de la cuenta es otro';
  if (!Array.isArray(usuario.identities) || usuario.identities.length === 0) return 'sin identidades';
  const identidades = usuario.identities as (Identidad | null)[];
  if (!identidades.some((i) => i?.provider === 'google')) return 'sin identidad de Google';
  if (identidades.some((i) => i?.identity_data?.email_verified !== true)) {
    return 'una identidad sin el correo verificado';
  }
  if (identidades.some((i) => normalizar(i?.identity_data?.email) !== correo)) return 'una identidad con otro correo';
  return null;
}

export const PROBLEMA_SOLO_INFORMAR = 'una cuenta de jefatura no cumple la regla de la unión';

export interface Resultado {
  revisadas: number;
  desunidas: number;
  problemas: string[];
}

/** Lo máximo que se espera a cada petición: una colgada no se come el trabajo de la vigilancia. */
export const ESPERA_MS = 15_000;

/**
 * El 404 de Auth cuando el usuario no existe. Otro 404 (una URL equivocada, una pasarela) no dice
 * nada del usuario y no puede desunir a nadie.
 */
async function usuarioNoExiste(r: Response): Promise<boolean> {
  if (r.status !== 404) return false;
  const datos: unknown = await r.json().catch(() => null);
  return !!datos && typeof datos === 'object' && (datos as { error_code?: unknown }).error_code === 'user_not_found';
}

export async function revisarUniones(cfg: {
  url: string;
  clave: string;
  pedir?: Pedir;
  /** Cada problema en cuanto se sabe: si el proceso muere después, lo dicho ya consta. */
  alProblema?: (problema: string) => void;
  /** Dice por qué no cumple la regla cada unión, sin desunir ninguna. */
  soloInformar?: boolean;
}): Promise<Resultado> {
  const pedirBase = cfg.pedir ?? fetch;
  const pedir: Pedir = (url, init = {}) => pedirBase(url, { ...init, signal: AbortSignal.timeout(ESPERA_MS) });
  const base = cfg.url.replace(/\/+$/, '');
  const cabeceras = { apikey: cfg.clave, Authorization: `Bearer ${cfg.clave}` };
  const lista: string[] = [];
  const problemas = {
    push(p: string) {
      lista.push(p);
      cfg.alProblema?.(p);
    },
  };
  const resultado = { revisadas: 0, desunidas: 0, problemas };
  const fin = (): Resultado => ({ revisadas: resultado.revisadas, desunidas: resultado.desunidas, problemas: lista });

  let uniones: Union[];
  try {
    const r = await pedir(`${base}/rest/v1/administradores?select=email,usuario_id&usuario_id=not.is.null`, {
      headers: { ...cabeceras, 'Accept-Profile': 'hidrantes' },
    });
    if (!r.ok) {
      resultado.problemas.push(`no se pueden leer las uniones de jefatura (rest ${r.status})`);
      return fin();
    }
    const datos: unknown = await r.json().catch(() => null);
    if (
      !Array.isArray(datos) ||
      !datos.every((u) => u && typeof u.email === 'string' && typeof u.usuario_id === 'string')
    ) {
      resultado.problemas.push('no se pueden leer las uniones de jefatura (respuesta inesperada)');
      return fin();
    }
    uniones = datos as Union[];
  } catch {
    resultado.problemas.push('no se pueden leer las uniones de jefatura (red)');
    return fin();
  }

  const mezcladas: Union[] = [];
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
      } else if (!(await usuarioNoExiste(r))) {
        resultado.problemas.push(`no se ha podido revisar una unión de jefatura (auth ${r.status})`);
        continue;
      }
      // Sin usuario: ya no existe. La unión no vale para nadie: se desune como una mezclada.
    } catch {
      resultado.problemas.push('no se ha podido revisar una unión de jefatura (auth red)');
      continue;
    }
    resultado.revisadas++;
    const motivo = motivoDeMezcla(usuario, union.email);
    if (motivo === null) continue;
    // Solo informar: el motivo, sin desunir (la primera revisión, para mirarlo antes de desunir).
    if (cfg.soloInformar) {
      resultado.problemas.push(`${PROBLEMA_SOLO_INFORMAR} (${motivo}); no se ha desunido: solo se informa`);
      continue;
    }
    mezcladas.push(union);
  }
  if (cfg.soloInformar) return fin();

  // Si ninguna de dos o más cumple la regla, lo más probable es un cambio de forma de Supabase Auth, no
  // que todas sean ajenas: no se desune ninguna (el panel se quedaría sin jefatura) y se avisa.
  if (resultado.revisadas >= 2 && mezcladas.length === resultado.revisadas) {
    resultado.problemas.push(PROBLEMA_NINGUNA);
    return fin();
  }

  for (const union of mezcladas) {
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
    resultado.problemas.push(`${PROBLEMA_SIN_DESUNIR} (${motivo}): quítale el acceso y devuélveselo en Ajustes`);
  }
  return fin();
}

async function principal(): Promise<number> {
  const url = process.env.SUPABASE_URL;
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !clave) {
    console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.');
    return 1;
  }
  // REVISAR_UNIONES_MODO: «desunir» desune; cualquier otro valor (o nada) solo informa. Lo seguro es
  // no desunir: se desune solo cuando se pide (vigilancia.yml lo decide).
  const modo = process.env.REVISAR_UNIONES_MODO === 'desunir' ? 'desunir' : 'solo-informar';
  const r = await revisarUniones({
    url,
    clave,
    soloInformar: modo !== 'desunir',
    alProblema: (p) => console.log(p),
  });
  console.error(`Uniones de jefatura (${modo}): ${r.revisadas} revisadas, ${r.desunidas} desunidas.`);
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
