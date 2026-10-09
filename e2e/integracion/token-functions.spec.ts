// /api/geocodificar y /api/push con el token de un voluntario de verdad (#561, docs/32 RV-270 D1),
// contra la pila local real (INTEGRACION=1, ci-sql): `wrangler pages dev` en :8788 sobre Supabase
// local con migraciones y el seed de staging (código 000000). Nunca contra dev ni prod.
//
// Antes de 0043 las dos Functions comprobaban el token con fn_listar_puntos, que service_role no puede
// ejecutar, y contestaban 401 a todos los voluntarios. Sin pedir nada fuera: la búsqueda va con una q
// de dos letras (400 después de la autorización, sin llegar a CartoCiudad) y /api/push se queda en
// 503 NO_CONFIGURADO porque el wrangler de :8788 no tiene claves VAPID (también después de autorizar).

import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

test('un token recién canjeado vale para buscar portales y para pedir el envío de avisos', async ({ request }) => {
  const canje = await request.post('/api/verificar-codigo', {
    data: { codigo: '000000', dispositivo_id: randomUUID() },
  });
  expect(canje.status(), await canje.text()).toBe(200);
  const { token } = (await canje.json()) as { token: string };

  const busqueda = await request.post('/api/geocodificar', { data: { token, q: 'ab' } });
  expect(busqueda.status(), await busqueda.text()).not.toBe(401);
  expect(await busqueda.json()).toEqual({ error: 'PAYLOAD_INVALIDO' });

  const envio = await request.post('/api/push', { data: { token } });
  expect(envio.status(), await envio.text()).not.toBe(401);
  expect([200, 503]).toContain(envio.status());
  if (envio.status() === 503) expect(await envio.json()).toEqual({ error: 'NO_CONFIGURADO' });
});

test('un token inventado sigue sin valer: 401 en las dos', async ({ request }) => {
  const token = 'inventado-inventado-inventado-0561';
  const busqueda = await request.post('/api/geocodificar', { data: { token, q: 'ab' } });
  expect(busqueda.status(), await busqueda.text()).toBe(401);
  expect(await busqueda.json()).toEqual({ error: 'TOKEN_INVALIDO' });
  const envio = await request.post('/api/push', { data: { token } });
  expect(envio.status(), await envio.text()).toBe(401);
  expect(await envio.json()).toEqual({ error: 'NO_AUTORIZADO' });
});
