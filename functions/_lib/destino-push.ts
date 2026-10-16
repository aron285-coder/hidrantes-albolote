/**
 * El destino de un aviso push (docs/39 RV-515, DEC-218): `https://` y una autoridad que es solo un host de la lista de
 * servicios de push de los navegadores, sin usuario, contraseña ni puerto. La misma regla que
 * `fn_validar_suscripcion` (0050). La autoridad se lee del texto, no con `new URL()`, que normaliza y se come `:443`.
 */
export function destinoAdmitido(endpoint: unknown): boolean {
  if (typeof endpoint !== 'string') return false;
  // `https://` en minúsculas, como en la base; el host, sin distinguir (docs/40 RV-532).
  const m = /^https:\/\/([^/?#]*)/.exec(endpoint);
  if (!m) return false;
  const host = m[1].toLowerCase();
  if (!/^[a-z0-9.-]+$/.test(host)) return false;
  return (
    host === 'fcm.googleapis.com' ||
    /^([a-z0-9-]+\.)+push\.services\.mozilla\.com$/.test(host) ||
    host === 'web.push.apple.com' ||
    /^([a-z0-9-]+\.)+push\.apple\.com$/.test(host) ||
    /^([a-z0-9-]+\.)+notify\.windows\.com$/.test(host)
  );
}
