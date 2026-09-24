import { describe, expect, it } from 'vitest';
import { ErrorDeScript } from './lib/comun.ts';
import {
  ENTORNOS,
  type EscrituraWorker,
  type OpsFaltantes,
  ROTABLES,
  aRotar,
  pasoTrasSecretosPages,
  planFaltantes,
  ponerFaltantes,
  secretosWorkerDe,
  sufijoDe,
  vigilanciaEnOrden,
} from './arranque.ts';

describe('--rotar', () => {
  it('sin nada, no se rota nada: el arranque completo no es una rotación', () => {
    expect(aRotar(undefined).size).toBe(0);
    expect(aRotar('')).toEqual(new Set());
  });

  it('uno solo', () => {
    expect([...aRotar('gpg')]).toEqual(['gpg']);
  });

  it('varios separados por comas, que es lo que pide rehacer los secretos del respaldo (DEC-071)', () => {
    expect([...aRotar('db,gpg')]).toEqual(['db', 'gpg']);
    expect([...aRotar(' db , gpg ')]).toEqual(['db', 'gpg']);
  });

  it('"todo" son todos', () => {
    expect(aRotar('todo')).toEqual(new Set(ROTABLES));
  });

  it('un nombre inventado aborta diciendo cuáles hay, en vez de no rotar nada en silencio', () => {
    expect(() => aRotar('base-de-datos')).toThrow(ErrorDeScript);
    expect(() => aRotar('db,gpj')).toThrow(/gpj no existe/);
  });
});

describe('secreto de la vigilancia (RV-08)', () => {
  it('se puede rotar solo', () => {
    expect([...aRotar('vigilancia')]).toEqual(['vigilancia']);
    expect(aRotar('todo').has('vigilancia')).toBe(true);
  });
  it('su secreto de repositorio lleva el sufijo del entorno', () => {
    expect(sufijoDe({ clave: 'staging' })).toBe('STAGING');
    expect(sufijoDe({ clave: 'production' })).toBe('PROD');
  });
});

// docs/18 RV-38: un secreto de Pages nuevo solo vale en un despliegue nuevo.
describe('tras fijar los secretos de Pages', () => {
  it('staging se vuelve a desplegar desde develop', () => {
    expect(pasoTrasSecretosPages({ clave: 'staging' }).comando).toEqual([
      'workflow',
      'run',
      'Desplegar staging',
      '--ref',
      'develop',
    ]);
  });

  it('producción no se despliega sola: se dice el paso', () => {
    const paso = pasoTrasSecretosPages({ clave: 'production' });
    expect(paso.comando).toBeUndefined();
    expect(paso.aviso).toMatch(/develop → main/);
  });
});

// docs/19 P-01 y RV-52: --solo-faltantes pone lo que falta y nunca rota lo que ya está.
describe('--solo-faltantes', () => {
  const COMPLETO = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SAL_IP',
    'NOMINATIM_USER_AGENT',
    'VAPID_PRIVATE_KEY',
    'VAPID_PUBLIC_KEY',
    'VAPID_SUBJECT',
    'VIGILANCIA_SECRETO',
  ];
  const REPO = ['VIGILANCIA_SECRETO_PROD', 'VIGILANCIA_SECRETO_STAGING'];

  it('con todo puesto, no toca nada', () => {
    expect(planFaltantes({ clave: 'production', pages: COMPLETO, repo: REPO, worker: REPO })).toEqual({
      clave: 'production',
      vigilancia: false,
      salIp: false,
      vapid: false,
      nominatim: false,
      aMano: [],
    });
  });

  it('si al Worker le falta el secreto, se genera uno nuevo para Pages, el repositorio y el Worker', () => {
    expect(planFaltantes({ clave: 'staging', pages: COMPLETO, repo: REPO, worker: [] }).vigilancia).toBe(true);
    const soloProd = ['VIGILANCIA_SECRETO_PROD'];
    expect(planFaltantes({ clave: 'staging', pages: COMPLETO, repo: REPO, worker: soloProd }).vigilancia).toBe(true);
    expect(planFaltantes({ clave: 'production', pages: COMPLETO, repo: REPO, worker: soloProd }).vigilancia).toBe(
      false,
    );
  });

  it('nunca genera claves VAPID si ya están: dejaría sin avisos a los suscritos', () => {
    const plan = planFaltantes({ clave: 'production', pages: COMPLETO, repo: [], worker: [] });
    expect(plan.vigilancia).toBe(true);
    expect(plan.vapid).toBe(false);
    expect(plan.salIp).toBe(false);
  });

  it('lo que solo sabe el arranque completo se dice, no se inventa', () => {
    const plan = planFaltantes({ clave: 'production', pages: ['SAL_IP'], repo: REPO, worker: REPO });
    expect(plan.aMano).toEqual(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
    expect(plan.vapid).toBe(true);
    expect(plan.nominatim).toBe(true);
  });
});

// docs/20 RV-72: un fallo pasajero al leer los secretos del Worker no rota nada.
describe('secretos del Worker sin rotar por un fallo (RV-72)', () => {
  const PAGES = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SAL_IP',
    'NOMINATIM_USER_AGENT',
    'VAPID_PRIVATE_KEY',
    'VAPID_PUBLIC_KEY',
    'VAPID_SUBJECT',
    'VIGILANCIA_SECRETO',
  ];
  const REPO = ['VIGILANCIA_SECRETO_PROD', 'VIGILANCIA_SECRETO_STAGING'];
  const LISTA = { codigo: 0, salida: JSON.stringify(REPO.map((name) => ({ name, type: 'secret_text' }))) };

  function simuladas(
    secretosWorker: { codigo: number; salida: string },
    fijarWorker: () => EscrituraWorker = () => 'ok',
  ): { op: OpsFaltantes; escrito: string[] } {
    const escrito: string[] = [];
    const op: OpsFaltantes = {
      secretosRepo: () => REPO,
      secretosWorker: () => secretosWorker,
      secretosPages: () => PAGES,
      fijarPages: (proyecto, nombre) => escrito.push(`pages ${proyecto} ${nombre}`),
      fijarRepo: (nombre) => escrito.push(`repo ${nombre}`),
      fijarWorker: (nombre) => {
        escrito.push(`worker ${nombre}`);
        return fijarWorker();
      },
      fijarVariable: (nombre) => escrito.push(`variable ${nombre}`),
      aplicar: (e) => escrito.push(`aplicar ${e.clave}`),
      aleatorio: () => 'x',
      vapid: () => ({ privada: 'p', publica: 'q' }),
    };
    return { op, escrito };
  }

  it('lee la lista, reconoce un Worker que no existe y para ante cualquier otro error', () => {
    expect(secretosWorkerDe(LISTA)).toEqual(REPO);
    expect(
      secretosWorkerDe({ codigo: 1, salida: 'This Worker does not exist on your account. [code: 10007]' }),
    ).toEqual([]);
    expect(() => secretosWorkerDe({ codigo: 1, salida: 'fetch failed' })).toThrow(/no se cambia nada/);
    expect(() => secretosWorkerDe({ codigo: 0, salida: 'Not logged in' })).toThrow(ErrorDeScript);
  });

  it('con `wrangler secret list` fallando, --solo-faltantes no genera ningún secreto y sale con error', async () => {
    const { op, escrito } = simuladas({ codigo: 1, salida: 'You are not authenticated. Please run `wrangler login`.' });
    await expect(ponerFaltantes(op, ENTORNOS)).rejects.toThrow(/no se cambia nada/);
    expect(escrito).toEqual([]);
  });

  it('con todo en su sitio, no escribe nada', async () => {
    const { op, escrito } = simuladas(LISTA);
    expect(await ponerFaltantes(op, ENTORNOS)).toEqual([]);
    expect(escrito).toEqual([]);
  });

  it('con el Worker inexistente, sí los pone: el Worker primero, luego Pages y el repositorio', async () => {
    const { op, escrito } = simuladas({
      codigo: 1,
      salida: '✘ [ERROR] A request to the Cloudflare API failed. [code: 10007]',
    });
    await ponerFaltantes(op, ENTORNOS);
    expect(escrito).toEqual([
      'worker VIGILANCIA_SECRETO_STAGING',
      'pages hidrantes-albolote-staging VIGILANCIA_SECRETO',
      'repo VIGILANCIA_SECRETO_STAGING',
      'aplicar staging',
      'worker VIGILANCIA_SECRETO_PROD',
      'pages hidrantes-albolote VIGILANCIA_SECRETO',
      'repo VIGILANCIA_SECRETO_PROD',
      'aplicar production',
    ]);
  });

  it('en la rotación, si el Worker no acepta el secreto, no se toca Pages ni el repositorio', async () => {
    const tocado: string[] = [];
    await expect(
      vigilanciaEnOrden(
        'PROD',
        () => 'error',
        () => {
          tocado.push('pages y repo');
        },
      ),
    ).rejects.toThrow(/no se ha tocado Pages ni el repositorio/);
    expect(tocado).toEqual([]);
  });

  it('si el Worker ya lo tiene y falla lo demás, dice cómo completarlo', async () => {
    await expect(
      vigilanciaEnOrden(
        'STAGING',
        () => 'ok',
        () => {
          throw new Error('gh: HTTP 502');
        },
      ),
    ).rejects.toThrow(/a medias[\s\S]*--rotar vigilancia[\s\S]*Desplegar staging[\s\S]*HTTP 502/);
  });

  it('con el Worker que aún no existe, la rotación sigue con Pages y el repositorio', async () => {
    const tocado: string[] = [];
    await vigilanciaEnOrden(
      'STAGING',
      () => 'sin-worker',
      () => {
        tocado.push('pages y repo');
      },
    );
    expect(tocado).toEqual(['pages y repo']);
  });
});
