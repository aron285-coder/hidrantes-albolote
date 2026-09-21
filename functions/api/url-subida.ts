// POST /api/url-subida (05 §9, 04 §7): reserva de foto y URL firmada de subida.
// Voluntario: { token }. Jefatura desde el móvil: cabecera Authorization con su JWT (DEC-059).
// Nadie sube a Storage sin pasar por aquí: el bucket no tiene políticas de escritura.

import { type Manejador, bucketPara, error, estadoDe, json, jwtDe, leerJson, rpc } from '../_lib/comun.ts';

export const CADUCIDAD_S = 7200; // la de las URL firmadas de subida de Supabase

export const onRequestPost: Manejador = async ({ request, env }) => {
  const cuerpo = (await leerJson(request)) ?? {};
  const jwt = jwtDe(request);

  let reserva;
  if (typeof cuerpo.token === 'string' && cuerpo.token.length >= 20) {
    reserva = await rpc<string>(env, 'fn_reservar_subida', { token: cuerpo.token });
  } else if (jwt) {
    reserva = await rpc<string>(env, 'fn_reservar_subida_admin', {}, { jwt });
  } else {
    return error(401, 'TOKEN_INVALIDO');
  }
  if (!reserva.ok) return error(estadoDe(reserva.codigo), reserva.codigo);

  const fotoPath = reserva.datos;
  const bucket = bucketPara(request.url, env);
  let firmada: Response;
  try {
    firmada = await fetch(`${env.SUPABASE_URL}/storage/v1/object/upload/sign/${bucket}/${fotoPath}`, {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
  } catch {
    return error(503, 'SERVIDOR_NO_DISPONIBLE');
  }
  if (!firmada.ok) return error(503, 'SERVIDOR_NO_DISPONIBLE');
  const { url } = (await firmada.json()) as { url: string };
  return json({ foto_path: fotoPath, url: `${env.SUPABASE_URL}/storage/v1${url}`, caduca_en_s: CADUCIDAD_S });
};
