// GET /api/direccion?lat=&lng=&propuesta_id= (05 §9, FR-15, FR-105). Solo jefatura.
// Devuelve la dirección deducida y la guarda en la propuesta; nunca bloquea la revisión.
// Nominatim exige un User-Agent con contacto: sin NOMINATIM_USER_AGENT no se le llama (RV-25). Y la
// caché de Cloudflare guarda la respuesta por coordenadas redondeadas a 4 decimales (unos 11 m, basta
// para una calle) 30 días, también sin propuesta: el límite de 1 petición/s es por instancia.

import { type Manejador, error, esAdmin, esUuid, json, jwtDe, rpc } from '../_lib/comun.ts';
import { direccionDe } from '../_lib/nominatim.ts';

export const onRequestGet: Manejador = async ({ request, env }) => {
  const jwt = jwtDe(request);
  if (!(await esAdmin(env, jwt))) return error(403, 'NO_AUTORIZADO');

  const q = new URL(request.url).searchParams;
  const lat = Number(q.get('lat'));
  const lng = Number(q.get('lng'));
  const propuestaId = q.get('propuesta_id');
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 36.6 || lat > 38.2 || lng < -4.5 || lng > -2.5) {
    return error(400, 'PAYLOAD_INVALIDO');
  }
  if (propuestaId !== null && !esUuid(propuestaId)) return error(400, 'PAYLOAD_INVALIDO');

  // Si la propuesta ya tiene dirección, no se vuelve a preguntar a Nominatim.
  if (propuestaId) {
    const r = await fetch(
      `${env.SUPABASE_URL}/rest/v1/v_cola_revision?id=eq.${propuestaId}&select=direccion_sugerida`,
      {
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${jwt}`,
          'Accept-Profile': 'hidrantes',
        },
      },
    ).catch(() => null);
    const filas = r?.ok ? ((await r.json()) as { direccion_sugerida: string | null }[]) : [];
    if (filas[0]?.direccion_sugerida) {
      return json({ direccion: filas[0].direccion_sugerida, fuente: 'nominatim', cacheada: true });
    }
  }

  const agente = env.NOMINATIM_USER_AGENT;
  if (!agente) return error(503, 'NO_CONFIGURADO');

  const cache = typeof caches !== 'undefined' ? (caches as unknown as { default?: Cache }).default : undefined;
  const clave = new Request(`https://cache.hidrantes-albolote.invalid/direccion/${lat.toFixed(4)},${lng.toFixed(4)}`);
  let direccion: string | null = null;
  const enCache = await cache?.match(clave).catch(() => undefined);
  if (enCache) direccion = ((await enCache.json().catch(() => ({}))) as { direccion?: string }).direccion ?? null;
  if (!direccion) {
    direccion = await direccionDe(lat, lng, agente);
    if (direccion && cache) {
      const respuesta = new Response(JSON.stringify({ direccion }), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${30 * 24 * 3600}` },
      });
      await cache.put(clave, respuesta).catch(() => undefined);
    }
  }
  if (!direccion) return json({ direccion: null, fuente: 'nominatim', motivo: 'sin_respuesta' });
  if (propuestaId) {
    await rpc(env, 'fn_guardar_direccion_sugerida', { propuesta_id: propuestaId, direccion }, { jwt: jwt! });
  }
  return json({ direccion, fuente: 'nominatim', cacheada: false });
};
