-- Suscripciones push solo a los servicios de push de los navegadores (docs/19 RV-68). Hasta ahora
-- fn_validar_suscripcion admitía cualquier `https://`: /api/push mandaría avisos, con su cifrado y su
-- firma VAPID, al host que alguien hubiera guardado. Ahora solo los de Chrome/Android (FCM), Firefox,
-- Safari e iOS, y Edge/Windows.
--
-- Misma firma (05 §8): fn_guardar_suscripcion_push y fn_guardar_suscripcion_push_admin la siguen
-- llamando igual. Las suscripciones ya guardadas no se tocan; si alguna fuera de otro host, el envío
-- fallaría y se borraría tras tres fallos, como siempre (05 §9).

create or replace function hidrantes.fn_validar_suscripcion(suscripcion jsonb) returns void
language plpgsql immutable set search_path = pg_catalog as $$
declare
  host text := lower(substring(coalesce(suscripcion ->> 'endpoint', '') from '^https://([^/:?#]+)'));
begin
  if jsonb_typeof(suscripcion) <> 'object' or host is null
     or not (host = 'fcm.googleapis.com'
             or host ~ '^([a-z0-9-]+\.)+push\.services\.mozilla\.com$'
             or host = 'web.push.apple.com'
             or host ~ '^([a-z0-9-]+\.)+push\.apple\.com$'
             or host ~ '^([a-z0-9-]+\.)+notify\.windows\.com$')
     or suscripcion #>> '{keys,p256dh}' is null or suscripcion #>> '{keys,auth}' is null
     or length(suscripcion::text) > 2000 then
    perform hidrantes.fn_error('PAYLOAD_INVALIDO(suscripcion)', 'Suscripción no válida');
  end if;
end $$;
