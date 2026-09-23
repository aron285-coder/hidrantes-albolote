// Clientes mínimos de las API que usa el arranque: Supabase Management, Supabase Storage,
// Cloudflare y GitHub (vía `gh`). Todos idempotentes: leen antes de escribir.

import { abortar, ejecutar } from './comun.ts';

async function peticion<R>(url: string, init: RequestInit & { permitir404?: boolean } = {}): Promise<R | null> {
  const r = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
  if (r.status === 404 && init.permitir404) return null;
  const texto = await r.text();
  if (!r.ok) abortar(`${init.method ?? 'GET'} ${url.replace(/\?.*/, '')} → ${r.status}: ${texto.slice(0, 400)}`);
  return (texto ? JSON.parse(texto) : {}) as R;
}

// ---------- Supabase Management API ----------

export class SupabaseGestion {
  constructor(private readonly token: string) {}

  private api<R>(ruta: string, init: RequestInit & { permitir404?: boolean } = {}) {
    return peticion<R>(`https://api.supabase.com/v1${ruta}`, {
      ...init,
      headers: { Authorization: `Bearer ${this.token}`, ...init.headers },
    });
  }

  async proyectos(): Promise<{ id: string; ref?: string; name: string; region: string; status: string }[]> {
    return (await this.api('/projects')) ?? [];
  }

  async claves(ref: string): Promise<{ name: string; api_key: string; type?: string }[]> {
    return (await this.api(`/projects/${ref}/api-keys?reveal=true`)) ?? [];
  }

  async anadirEsquemaExpuesto(ref: string, esquema: string): Promise<boolean> {
    const actual = await this.api<{ db_schema: string }>(`/projects/${ref}/postgrest`);
    const lista = (actual?.db_schema ?? 'public')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (lista.includes(esquema)) return false;
    await this.api(`/projects/${ref}/postgrest`, {
      method: 'PATCH',
      body: JSON.stringify({ db_schema: [...lista, esquema].join(', ') }),
    });
    return true;
  }

  /** La configuración de Auth del proyecto, solo para leerla (comprobar-auth.ts, RV-36). */
  async configAuth(ref: string): Promise<Record<string, unknown>> {
    return (await this.api<Record<string, unknown>>(`/projects/${ref}/config/auth`)) ?? {};
  }

  /** Añade URLs de redirección de Auth sin tocar las de la app de uniformidad. */
  async anadirRedirecciones(ref: string, urls: string[]): Promise<string[]> {
    const actual = await this.api<{ uri_allow_list?: string }>(`/projects/${ref}/config/auth`);
    const lista = (actual?.uri_allow_list ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const nuevas = urls.filter((u) => !lista.includes(u));
    if (nuevas.length > 0) {
      await this.api(`/projects/${ref}/config/auth`, {
        method: 'PATCH',
        body: JSON.stringify({ uri_allow_list: [...lista, ...nuevas].join(',') }),
      });
    }
    return nuevas;
  }

  /** Host del pooler de Supavisor; el modo sesión usa el puerto 5432 (los runners no tienen IPv6). */
  async hostPooler(ref: string): Promise<string> {
    const cfg = await this.api<{ db_host: string; database_type?: string }[]>(
      `/projects/${ref}/config/database/pooler`,
    );
    const primario = (cfg ?? []).find((c) => (c.database_type ?? 'PRIMARY') === 'PRIMARY');
    return primario?.db_host ?? abortar(`No encuentro el pooler del proyecto ${ref}`);
  }
}

/** Elige la anon/publishable y la service_role/secret de la lista de claves de un proyecto. */
export function elegirClaves(claves: { name: string; api_key: string; type?: string }[]): {
  anon: string;
  servicio: string;
} {
  const por = (nombres: string[], tipo: string) =>
    claves.find((c) => nombres.includes(c.name) && c.api_key && !c.api_key.includes('·'))?.api_key ??
    claves.find((c) => c.type === tipo && c.api_key)?.api_key;
  const anon = por(['anon'], 'publishable');
  const servicio = por(['service_role'], 'secret');
  if (!anon || !servicio) abortar('No encuentro las claves anon y service_role del proyecto de Supabase.');
  return { anon, servicio };
}

// ---------- Supabase Storage ----------

export async function asegurarBucket(
  urlProyecto: string,
  claveServicio: string,
  id: string,
): Promise<'creado' | 'actualizado'> {
  const cabeceras = { Authorization: `Bearer ${claveServicio}`, apikey: claveServicio };
  const cuerpo = {
    public: true, // lectura por URL no enumerable (04 §7); sin políticas de escritura para nadie
    file_size_limit: 5 * 1024 * 1024,
    allowed_mime_types: ['image/jpeg', 'image/webp'],
  };
  const existe = await peticion(`${urlProyecto}/storage/v1/bucket/${id}`, {
    headers: cabeceras,
    permitir404: true,
  }).catch(() => null);
  if (existe) {
    await peticion(`${urlProyecto}/storage/v1/bucket/${id}`, {
      method: 'PUT',
      headers: cabeceras,
      body: JSON.stringify({ id, ...cuerpo }),
    });
    return 'actualizado';
  }
  await peticion(`${urlProyecto}/storage/v1/bucket`, {
    method: 'POST',
    headers: cabeceras,
    body: JSON.stringify({ id, name: id, ...cuerpo }),
  });
  return 'creado';
}

// ---------- Cloudflare ----------

interface RespuestaCf<R> {
  success: boolean;
  result: R;
  errors: { message: string }[];
}

export class Cloudflare {
  constructor(private readonly token: string) {}

  private async api<R>(ruta: string, init: RequestInit & { permitir404?: boolean } = {}): Promise<R | null> {
    const r = await peticion<RespuestaCf<R>>(`https://api.cloudflare.com/client/v4${ruta}`, {
      ...init,
      headers: { Authorization: `Bearer ${this.token}`, ...init.headers },
    });
    return r ? r.result : null;
  }

  async verificarToken(): Promise<void> {
    const r = await this.api<{ status: string }>('/user/tokens/verify');
    if (r?.status !== 'active') abortar('El token de Cloudflare no está activo.');
  }

  async cuenta(): Promise<string> {
    const cuentas = (await this.api<{ id: string; name: string }[]>('/accounts')) ?? [];
    if (cuentas.length !== 1) abortar(`El token ve ${cuentas.length} cuentas de Cloudflare; debe ver exactamente una.`);
    return cuentas[0].id;
  }

  async proyecto(cuenta: string, nombre: string) {
    return this.api<{
      name: string;
      subdomain: string;
      deployment_configs: Record<string, { env_vars?: Record<string, unknown> }>;
    }>(`/accounts/${cuenta}/pages/projects/${nombre}`, { permitir404: true });
  }

  async crearProyecto(cuenta: string, nombre: string, ramaProduccion: string): Promise<void> {
    await this.api(`/accounts/${cuenta}/pages/projects`, {
      method: 'POST',
      body: JSON.stringify({ name: nombre, production_branch: ramaProduccion }),
    });
  }

  /** Variables cifradas de las Pages Functions, en producción y en previsualizaciones. */
  async fijarSecretos(cuenta: string, nombre: string, secretos: Record<string, string>): Promise<void> {
    const env_vars = Object.fromEntries(
      Object.entries(secretos).map(([k, v]) => [k, { type: 'secret_text', value: v }]),
    );
    await this.api(`/accounts/${cuenta}/pages/projects/${nombre}`, {
      method: 'PATCH',
      body: JSON.stringify({ deployment_configs: { production: { env_vars }, preview: { env_vars } } }),
    });
  }

  async despliegues(cuenta: string, nombre: string) {
    return (
      (await this.api<
        {
          id: string;
          environment: string;
          created_on: string;
          url: string;
          deployment_trigger?: { metadata?: { branch?: string; commit_hash?: string } };
        }[]
      >(`/accounts/${cuenta}/pages/projects/${nombre}/deployments?per_page=25`)) ?? []
    );
  }

  async revertir(cuenta: string, nombre: string, despliegue: string): Promise<void> {
    await this.api(`/accounts/${cuenta}/pages/projects/${nombre}/deployments/${despliegue}/rollback`, {
      method: 'POST',
    });
  }
}

// ---------- GitHub (gh) ----------

export function gh(args: string[], entrada?: string): string {
  const r = ejecutar('gh', args, { entrada });
  if (r.codigo !== 0) abortar(`gh ${args.slice(0, 3).join(' ')} falló: ${r.error || r.salida}`);
  return r.salida;
}

export function ghApi(ruta: string, metodo = 'GET', cuerpo?: unknown): string {
  const args = ['api', '-X', metodo, ruta, '-H', 'Accept: application/vnd.github+json'];
  if (cuerpo !== undefined) args.push('--input', '-');
  return gh(args, cuerpo === undefined ? undefined : JSON.stringify(cuerpo));
}

export function ghApiOpcional(ruta: string): string | null {
  const r = ejecutar('gh', ['api', ruta]);
  return r.codigo === 0 ? r.salida : null;
}
