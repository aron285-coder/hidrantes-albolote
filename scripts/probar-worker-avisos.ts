// Integración del Worker de los avisos contra la pila local (docs/19 RV-52). Lo corre CI en `ci-sql`;
// en local, con Supabase levantado y `npm run arranque -- --local` hecho:
//
//   npx tsx scripts/probar-worker-avisos.ts
//
// 1. Pone unas claves VAPID de prueba en .dev.vars y levanta `wrangler pages dev` en :8788.
// 2. Levanta un receptor de push en :9911 que responde 201, como un servicio de push de verdad.
// 3. Siembra una suscripción con las claves del receptor de la RFC 8291 y una notificación pendiente.
// 4. Arranca el Worker con `wrangler dev --test-scheduled`, con DESTINOS apuntando a :8788 y el
//    secreto local, y dispara su cron con /__scheduled.
// 5. La notificación queda enviada (enviada_en) o con su error anotado, nunca pendiente.
//
// Al terminar deja .dev.vars como estaba, borra lo sembrado y para los procesos. Nunca contra dev ni prod.

import { type ChildProcess, spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { paresVapid } from './lib/claves.ts';
import { RAIZ, abortar, ejecutarScript, log, psqlOk } from './lib/comun.ts';
import { LOCAL_POSTGRES } from './migrar.ts';

const PAGES = 'http://127.0.0.1:8788';
const WORKER = 'http://127.0.0.1:8787';
const RECEPTOR = 9911;
const SECRETO_LOCAL = 'vigilancia-local'; // detectar-secretos:permitir (el de .dev.vars local)
// Claves del receptor de la RFC 8291 §5: válidas para cifrar, como las de un navegador suscrito.
const P256DH = 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4';
const AUTH = 'BTBZMqHH6r4Tts7J_aSIgg';
const MARCA = 'rv52-worker';

const procesos: ChildProcess[] = [];
const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

async function hastaQueResponda(url: string, segundos = 90): Promise<void> {
  for (let i = 0; i < segundos; i++) {
    const r = await fetch(url).catch(() => null);
    if (r) return;
    await esperar(1000);
  }
  abortar(`${url} no responde tras ${segundos} s`);
}

function lanzar(comando: string, args: string[]): ChildProcess {
  const p = spawn(comando, args, { cwd: RAIZ, shell: process.platform === 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
  let salida = '';
  p.stdout?.on('data', (d) => (salida += d));
  p.stderr?.on('data', (d) => (salida += d));
  p.on('exit', (c) => {
    if (c && c !== 0)
      console.error(`${comando} ${args.slice(0, 3).join(' ')} terminó con ${c}\n${salida.slice(-2000)}`);
  });
  procesos.push(p);
  return p;
}

async function principal(): Promise<void> {
  const devVars = path.join(RAIZ, '.dev.vars');
  const original = readFileSync(devVars, 'utf8');
  if (!original.includes(`VIGILANCIA_SECRETO=${SECRETO_LOCAL}`))
    abortar('Falta .dev.vars local: npm run arranque -- --local');
  let recibidos = 0;
  const receptor = createServer((peticion, respuesta) => {
    if (peticion.method === 'POST') recibidos++;
    peticion.resume();
    respuesta.writeHead(201).end();
  }).listen(RECEPTOR, '127.0.0.1');

  try {
    log.paso('Pages Functions con claves VAPID de prueba');
    const vapid = paresVapid();
    writeFileSync(
      devVars,
      `${original.trimEnd()}\nVAPID_PUBLIC_KEY=${vapid.publica}\nVAPID_PRIVATE_KEY=${vapid.privada}\nVAPID_SUBJECT=${PAGES}\n`,
    );
    lanzar('npm', ['run', 'functions:dev']);
    await hastaQueResponda(PAGES);

    log.paso('Una suscripción y una notificación pendientes');
    const id = psqlOk(
      LOCAL_POSTGRES,
      `with s as (
         insert into hidrantes.suscripciones_push (dispositivo_id, suscripcion)
         values (gen_random_uuid(), jsonb_build_object('endpoint', 'http://127.0.0.1:${RECEPTOR}/push/${MARCA}',
                 'keys', jsonb_build_object('p256dh', '${P256DH}', 'auth', '${AUTH}')))
         returning id)
       insert into hidrantes.notificaciones (suscripcion_id, titulo, cuerpo)
       select id, '[PRUEBA] ${MARCA}', 'Aviso de prueba del Worker' from s returning id;`,
      { tuplas: true },
    ).trim();

    log.paso('El Worker con su cron, contra :8788');
    lanzar('npx', [
      '--no-install',
      'wrangler',
      'dev',
      '--test-scheduled',
      '--config',
      'workers/avisos/wrangler.toml',
      '--port',
      '8787',
      '--ip',
      '127.0.0.1',
      '--var',
      `DESTINOS:${PAGES}`,
      '--var',
      `VIGILANCIA_SECRETO_STAGING:${SECRETO_LOCAL}`,
    ]);
    await hastaQueResponda(WORKER);
    const disparo = await fetch(`${WORKER}/__scheduled?cron=*/5+*+*+*+*`);
    if (!disparo.ok) abortar(`/__scheduled responde ${disparo.status}`);

    let estado = '';
    for (let i = 0; i < 60; i++) {
      estado = psqlOk(
        LOCAL_POSTGRES,
        `select case when enviada_en is not null then 'enviada' when error is not null then 'error: ' || error else 'pendiente' end
           from hidrantes.notificaciones where id = ${Number(id)};`,
        { tuplas: true },
      ).trim();
      if (estado !== 'pendiente') break;
      await esperar(1000);
    }
    if (estado === 'pendiente') abortar('El cron del Worker no ha despachado la notificación en 60 s.');
    if (!estado.startsWith('enviada') || recibidos < 1) {
      abortar(`La notificación quedó "${estado}" y el receptor recibió ${recibidos} peticiones: se esperaba enviada.`);
    }
    log.ok(`el cron del Worker la ha despachado: ${estado}, ${recibidos} push recibido`);
  } finally {
    writeFileSync(devVars, original);
    psqlOk(
      LOCAL_POSTGRES,
      `delete from hidrantes.suscripciones_push where suscripcion ->> 'endpoint' like '%${MARCA}';`,
    );
    for (const p of procesos) p.kill();
    receptor.close();
  }
}

if (import.meta.main) ejecutarScript(principal);
