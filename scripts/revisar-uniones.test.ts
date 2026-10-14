import { describe, expect, it } from 'vitest';
import { correoDeGoogle, cuentaSinMezcla } from '../functions/api/vincular-jefatura.ts';
import {
  PROBLEMA_DESUNIDA,
  PROBLEMA_NINGUNA,
  PROBLEMA_SOLO_INFORMAR,
  type Pedir,
  motivoDeMezcla,
  revisarUniones,
  unionLimpia,
} from './revisar-uniones.ts';

// docs/36 RV-463: la vigilancia revisa cada unión de jefatura con la regla de /api/vincular-jefatura
// (RV-450, DEC-206) y desune la que no la cumple. Con usuarios simulados: nada sale a la red.

const URL_BASE = 'https://ejemplo.supabase.co';
const CLAVE = 'clave-de-prueba';
const ID_LIMPIO = '11111111-1111-4111-8111-111111111111';
const ID_MEZCLADO = '22222222-2222-4222-8222-222222222222';

const google = (email: string, verificado: unknown = true) => ({
  provider: 'google',
  identity_data: { email, email_verified: verificado },
});
const conCorreo = (email: string) => ({ provider: 'email', identity_data: { email, email_verified: true } });

const LIMPIO = { id: ID_LIMPIO, email: 'jefa@ejemplo.org', identities: [google('jefa@ejemplo.org')] };
const MEZCLADO = {
  id: ID_MEZCLADO,
  email: 'jefe@ejemplo.org',
  identities: [google('jefe@ejemplo.org'), google('otra@ejemplo.org')],
};

describe('unionLimpia (la regla de RV-450)', () => {
  it('una identidad de Google con el correo del administrador: limpia', () => {
    expect(unionLimpia(LIMPIO, 'jefa@ejemplo.org')).toBe(true);
    expect(unionLimpia({ ...LIMPIO, email: 'Jefa@Ejemplo.org' }, ' JEFA@ejemplo.org ')).toBe(true);
  });

  it('una identidad de correo con el mismo correo más la de Google: limpia', () => {
    expect(
      unionLimpia(
        { ...LIMPIO, identities: [conCorreo('jefa@ejemplo.org'), google('jefa@ejemplo.org')] },
        'jefa@ejemplo.org',
      ),
    ).toBe(true);
  });

  it('dos identidades de Google de correos distintos: mezclada', () => {
    expect(unionLimpia(MEZCLADO, 'jefe@ejemplo.org')).toBe(false);
  });

  it('una identidad de otro proveedor con otro correo, o sin verificar: mezclada', () => {
    const otra = { provider: 'github', identity_data: { email: 'otra@ejemplo.org', email_verified: true } };
    expect(unionLimpia({ ...LIMPIO, identities: [google('jefa@ejemplo.org'), otra] }, 'jefa@ejemplo.org')).toBe(false);
    const sinVerificar = { provider: 'email', identity_data: { email: 'jefa@ejemplo.org', email_verified: false } };
    expect(unionLimpia({ ...LIMPIO, identities: [google('jefa@ejemplo.org'), sinVerificar] }, 'jefa@ejemplo.org')).toBe(
      false,
    );
    expect(unionLimpia({ ...LIMPIO, identities: [google('jefa@ejemplo.org', 'true')] }, 'jefa@ejemplo.org')).toBe(
      false,
    );
  });

  it('user.email distinto, sin Google, sin identidades o el correo de otro administrador: mezclada', () => {
    expect(unionLimpia({ ...LIMPIO, email: 'otra@ejemplo.org' }, 'jefa@ejemplo.org')).toBe(false);
    expect(unionLimpia({ ...LIMPIO, identities: [conCorreo('jefa@ejemplo.org')] }, 'jefa@ejemplo.org')).toBe(false);
    expect(unionLimpia({ ...LIMPIO, identities: [] }, 'jefa@ejemplo.org')).toBe(false);
    expect(unionLimpia({ ...LIMPIO, identities: undefined }, 'jefa@ejemplo.org')).toBe(false);
    expect(unionLimpia(LIMPIO, 'otro@ejemplo.org')).toBe(false);
  });
});

interface Llamada {
  metodo: string;
  url: string;
  cabeceras: Record<string, string>;
  cuerpo: unknown;
}

/** Supabase simulado: las uniones, los usuarios de Auth por id y lo que responde la RPC. */
function simulado(opciones: {
  uniones?: unknown;
  estadoUniones?: number;
  usuarios?: Record<string, unknown>;
  estadoUsuario?: Record<string, number>;
  desunir?: { estado: number; cuerpo: unknown };
}) {
  const llamadas: Llamada[] = [];
  const pedir: Pedir = async (url, init = {}) => {
    const cabeceras = Object.fromEntries(new Headers(init.headers).entries());
    llamadas.push({
      metodo: init.method ?? 'GET',
      url,
      cabeceras,
      cuerpo: init.body ? JSON.parse(String(init.body)) : undefined,
    });
    const r = (estado: number, cuerpo: unknown) =>
      new Response(JSON.stringify(cuerpo), { status: estado, headers: { 'Content-Type': 'application/json' } });
    if (url.startsWith(`${URL_BASE}/rest/v1/administradores?`)) {
      return r(opciones.estadoUniones ?? 200, opciones.uniones ?? []);
    }
    const usuario = /\/auth\/v1\/admin\/users\/([^/?]+)$/.exec(url);
    if (usuario) {
      const id = decodeURIComponent(usuario[1]!);
      const estado = opciones.estadoUsuario?.[id];
      if (estado) return r(estado, { msg: 'error' });
      const u = opciones.usuarios?.[id];
      // La forma del 404 de GoTrue cuando el usuario no existe.
      return u ? r(200, u) : r(404, { code: 404, error_code: 'user_not_found', msg: 'User not found' });
    }
    if (url === `${URL_BASE}/rest/v1/rpc/fn_desvincular_administrador`) {
      return r(opciones.desunir?.estado ?? 200, opciones.desunir?.cuerpo ?? true);
    }
    throw new Error(`petición inesperada: ${url}`);
  };
  return { pedir, llamadas };
}

const UNIONES = [
  { email: 'jefa@ejemplo.org', usuario_id: ID_LIMPIO },
  { email: 'jefe@ejemplo.org', usuario_id: ID_MEZCLADO },
];

describe('revisarUniones (RV-463)', () => {
  it('una unión limpia se queda y una mezclada se desune, con su problema', async () => {
    const s = simulado({ uniones: UNIONES, usuarios: { [ID_LIMPIO]: LIMPIO, [ID_MEZCLADO]: MEZCLADO } });
    const r = await revisarUniones({ url: URL_BASE, clave: CLAVE, pedir: s.pedir });
    expect(r).toEqual({
      revisadas: 2,
      desunidas: 1,
      problemas: ['una cuenta de jefatura se ha desunido: que vuelva a entrar'],
    });
    const desunir = s.llamadas.filter((l) => l.url.endsWith('/rpc/fn_desvincular_administrador'));
    expect(desunir).toHaveLength(1);
    expect(desunir[0]!.metodo).toBe('POST');
    expect(desunir[0]!.cuerpo).toEqual({ correo: 'jefe@ejemplo.org' });
    expect(desunir[0]!.cabeceras['content-profile']).toBe('hidrantes');
  });

  it('solo lee los usuarios unidos, uno a uno, con la service role', async () => {
    const s = simulado({ uniones: UNIONES, usuarios: { [ID_LIMPIO]: LIMPIO, [ID_MEZCLADO]: MEZCLADO } });
    await revisarUniones({ url: URL_BASE, clave: CLAVE, pedir: s.pedir });
    const lista = s.llamadas[0]!;
    expect(lista.url).toBe(`${URL_BASE}/rest/v1/administradores?select=email,usuario_id&usuario_id=not.is.null`);
    expect(lista.cabeceras['accept-profile']).toBe('hidrantes');
    const auth = s.llamadas.filter((l) => l.url.includes('/auth/v1/'));
    expect(auth.map((l) => l.url)).toEqual([
      `${URL_BASE}/auth/v1/admin/users/${ID_LIMPIO}`,
      `${URL_BASE}/auth/v1/admin/users/${ID_MEZCLADO}`,
    ]);
    for (const l of s.llamadas) {
      expect(l.cabeceras.apikey).toBe(CLAVE);
      expect(l.cabeceras.authorization).toBe(`Bearer ${CLAVE}`);
    }
  });

  it('sin uniones no pide nada a Auth', async () => {
    const s = simulado({ uniones: [] });
    expect(await revisarUniones({ url: URL_BASE, clave: CLAVE, pedir: s.pedir })).toEqual({
      revisadas: 0,
      desunidas: 0,
      problemas: [],
    });
    expect(s.llamadas).toHaveLength(1);
  });

  it('un usuario que ya no existe en Auth se desune', async () => {
    const s = simulado({ uniones: [UNIONES[0]] });
    const r = await revisarUniones({ url: URL_BASE, clave: CLAVE, pedir: s.pedir });
    expect(r.desunidas).toBe(1);
  });

  // Revisión de #712: un 404 de una URL equivocada o de una pasarela no dice nada del usuario.
  it('un 404 que no es «user_not_found» es un problema y no desune', async () => {
    const s = simulado({ uniones: UNIONES, estadoUsuario: { [ID_LIMPIO]: 404, [ID_MEZCLADO]: 404 } });
    const r = await revisarUniones({ url: URL_BASE, clave: CLAVE, pedir: s.pedir });
    expect(r).toEqual({
      revisadas: 0,
      desunidas: 0,
      problemas: [
        'no se ha podido revisar una unión de jefatura (auth 404)',
        'no se ha podido revisar una unión de jefatura (auth 404)',
      ],
    });
    expect(s.llamadas.filter((l) => l.url.includes('/rpc/'))).toEqual([]);
  });

  it('si ninguna de dos o más cumple la regla, no desune ninguna y lo dice', async () => {
    const otro = { ...MEZCLADO, id: ID_LIMPIO, email: 'jefa@ejemplo.org' };
    const s = simulado({ uniones: UNIONES, usuarios: { [ID_LIMPIO]: otro, [ID_MEZCLADO]: MEZCLADO } });
    const r = await revisarUniones({ url: URL_BASE, clave: CLAVE, pedir: s.pedir });
    expect(r).toEqual({ revisadas: 2, desunidas: 0, problemas: [PROBLEMA_NINGUNA] });
    expect(s.llamadas.filter((l) => l.url.includes('/rpc/'))).toEqual([]);
  });

  it('cada problema sale en cuanto se sabe, y cada petición lleva un tiempo máximo', async () => {
    const s = simulado({
      uniones: UNIONES,
      usuarios: { [ID_MEZCLADO]: MEZCLADO },
      estadoUsuario: { [ID_LIMPIO]: 500 },
    });
    const vistos: string[] = [];
    const senales: unknown[] = [];
    const pedir: Pedir = (url, init) => {
      senales.push(init?.signal);
      return s.pedir(url, init);
    };
    const r = await revisarUniones({ url: URL_BASE, clave: CLAVE, pedir, alProblema: (p) => vistos.push(p) });
    expect(vistos).toEqual(r.problemas);
    expect(vistos).toContain(PROBLEMA_DESUNIDA);
    expect(senales.length).toBeGreaterThan(0);
    for (const sn of senales) expect(sn).toBeInstanceOf(AbortSignal);
  });

  it('solo informar: dice el motivo de cada una y no desune ninguna', async () => {
    const sinCampo = {
      ...LIMPIO,
      identities: [google('jefa@ejemplo.org'), { provider: 'email', identity_data: { email: 'jefa@ejemplo.org' } }],
    };
    const s = simulado({ uniones: UNIONES, usuarios: { [ID_LIMPIO]: sinCampo, [ID_MEZCLADO]: MEZCLADO } });
    const r = await revisarUniones({ url: URL_BASE, clave: CLAVE, pedir: s.pedir, soloInformar: true });
    expect(r).toEqual({
      revisadas: 2,
      desunidas: 0,
      problemas: [
        `${PROBLEMA_SOLO_INFORMAR} (una identidad sin el correo verificado); no se ha desunido: solo se informa`,
        `${PROBLEMA_SOLO_INFORMAR} (una identidad con otro correo); no se ha desunido: solo se informa`,
      ],
    });
    expect(s.llamadas.filter((l) => l.url.includes('/rpc/'))).toEqual([]);
  });

  it('motivoDeMezcla da un motivo para cada caso, y null si cumple la regla', () => {
    expect(motivoDeMezcla(LIMPIO, 'jefa@ejemplo.org')).toBeNull();
    expect(motivoDeMezcla(null, 'jefa@ejemplo.org')).toBe('el usuario ya no existe');
    expect(motivoDeMezcla({ ...LIMPIO, email: 'x@ejemplo.org' }, 'jefa@ejemplo.org')).toBe(
      'el correo de la cuenta es otro',
    );
    expect(motivoDeMezcla({ ...LIMPIO, identities: [] }, 'jefa@ejemplo.org')).toBe('sin identidades');
    expect(motivoDeMezcla({ ...LIMPIO, identities: [conCorreo('jefa@ejemplo.org')] }, 'jefa@ejemplo.org')).toBe(
      'sin identidad de Google',
    );
    expect(motivoDeMezcla(MEZCLADO, 'jefe@ejemplo.org')).toBe('una identidad con otro correo');
  });

  it('la regla es la de /api/vincular-jefatura: Google verificado y cuenta sin mezcla', () => {
    const casos: [unknown, string][] = [
      [LIMPIO, 'jefa@ejemplo.org'],
      [MEZCLADO, 'jefe@ejemplo.org'],
      [{ ...LIMPIO, identities: [conCorreo('jefa@ejemplo.org'), google('jefa@ejemplo.org')] }, 'jefa@ejemplo.org'],
      [{ ...LIMPIO, identities: [conCorreo('jefa@ejemplo.org')] }, 'jefa@ejemplo.org'],
      [{ ...LIMPIO, email: 'otra@ejemplo.org' }, 'jefa@ejemplo.org'],
      [{ ...LIMPIO, identities: [google('jefa@ejemplo.org', 'true')] }, 'jefa@ejemplo.org'],
      [{ ...LIMPIO, identities: [] }, 'jefa@ejemplo.org'],
      [LIMPIO, 'otro@ejemplo.org'],
    ];
    for (const [usuario, correo] of casos) {
      const u = usuario as Parameters<typeof unionLimpia>[0];
      const funcion = correoDeGoogle(u as never) === correo && cuentaSinMezcla(u as never, correo);
      expect(unionLimpia(u, correo), JSON.stringify(usuario)).toBe(funcion);
    }
  });

  it('un id que no es un uuid no se pide a Auth: es un problema', async () => {
    const s = simulado({ uniones: [{ email: 'jefa@ejemplo.org', usuario_id: '../users' }] });
    const r = await revisarUniones({ url: URL_BASE, clave: CLAVE, pedir: s.pedir });
    expect(s.llamadas.filter((l) => l.url.includes('/auth/'))).toEqual([]);
    expect(r.problemas).toEqual(['una unión de jefatura tiene un usuario que no es válido: no se ha revisado']);
  });

  it('si Auth falla con una, es un problema y no se desune; las demás se revisan', async () => {
    const s = simulado({
      uniones: UNIONES,
      usuarios: { [ID_MEZCLADO]: MEZCLADO },
      estadoUsuario: { [ID_LIMPIO]: 500 },
    });
    const r = await revisarUniones({ url: URL_BASE, clave: CLAVE, pedir: s.pedir });
    expect(r.revisadas).toBe(1);
    expect(r.desunidas).toBe(1);
    expect(r.problemas).toEqual([
      'no se ha podido revisar una unión de jefatura (auth 500)',
      'una cuenta de jefatura se ha desunido: que vuelva a entrar',
    ]);
  });

  it('si no se puede desunir, es un problema que lo dice', async () => {
    const s = simulado({
      uniones: [UNIONES[1]],
      usuarios: { [ID_MEZCLADO]: MEZCLADO },
      desunir: { estado: 500, cuerpo: { message: 'error' } },
    });
    const r = await revisarUniones({ url: URL_BASE, clave: CLAVE, pedir: s.pedir });
    expect(r.desunidas).toBe(0);
    expect(r.problemas).toEqual([
      'una cuenta de jefatura no cumple la regla de la unión y no se ha podido desunir (rpc 500): quítale el acceso y devuélveselo en Ajustes',
    ]);
  });

  it('si la RPC dice que no había nada que desunir, no cuenta como desunida', async () => {
    const s = simulado({
      uniones: [UNIONES[1]],
      usuarios: { [ID_MEZCLADO]: MEZCLADO },
      desunir: { estado: 200, cuerpo: false },
    });
    const r = await revisarUniones({ url: URL_BASE, clave: CLAVE, pedir: s.pedir });
    expect(r).toEqual({ revisadas: 1, desunidas: 0, problemas: [] });
  });

  it('si no se pueden leer las uniones, es un problema', async () => {
    const s = simulado({ estadoUniones: 401 });
    expect((await revisarUniones({ url: URL_BASE, clave: CLAVE, pedir: s.pedir })).problemas).toEqual([
      'no se pueden leer las uniones de jefatura (rest 401)',
    ]);
    const raro = simulado({ uniones: { no: 'es una lista' } });
    expect((await revisarUniones({ url: URL_BASE, clave: CLAVE, pedir: raro.pedir })).problemas).toEqual([
      'no se pueden leer las uniones de jefatura (respuesta inesperada)',
    ]);
  });

  it('ningún problema lleva un correo ni un id', async () => {
    const s = simulado({
      uniones: [...UNIONES, { email: 'x@ejemplo.org', usuario_id: 'no-uuid' }],
      usuarios: { [ID_MEZCLADO]: MEZCLADO },
      estadoUsuario: { [ID_LIMPIO]: 503 },
      desunir: { estado: 500, cuerpo: null },
    });
    const r = await revisarUniones({ url: URL_BASE, clave: CLAVE, pedir: s.pedir });
    expect(r.problemas.length).toBeGreaterThan(0);
    for (const p of r.problemas) {
      expect(p).not.toMatch(/@|[0-9a-f]{8}-[0-9a-f]{4}/);
    }
  });
});
