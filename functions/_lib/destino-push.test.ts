// El destino de un aviso push (docs/39 RV-515, DEC-218).

import { describe, expect, it } from 'vitest';
import { destinoAdmitido } from './destino-push.ts';

describe('destinoAdmitido', () => {
  it.each([
    'https://fcm.googleapis.com/fcm/send/abc:def?x=1',
    'https://updates.push.services.mozilla.com/wpush/v2/abc',
    'https://web.push.apple.com/QGuQyavXutnMs',
    'https://api.push.apple.com/3/device/abc',
    'https://db5p.notify.windows.com/w/?token=abc',
    'HTTPS://FCM.GOOGLEAPIS.COM/fcm/send/abc',
  ])('admite %s', (d) => expect(destinoAdmitido(d)).toBe(true));

  it.each([
    'https://usuario@fcm.googleapis.com/fcm/send/abc',
    'https://u:p@fcm.googleapis.com/fcm/send/abc',
    'https://fcm.googleapis.com:443/fcm/send/abc',
    'https://otro.example.org/push',
    'https://push.services.mozilla.com.example.org/x',
    'http://fcm.googleapis.com/fcm/send/abc',
    'fcm.googleapis.com/fcm/send/abc',
    '',
    null,
    42,
  ])('rechaza %s', (d) => expect(destinoAdmitido(d)).toBe(false));
});
