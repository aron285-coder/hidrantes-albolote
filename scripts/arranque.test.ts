import { describe, expect, it } from 'vitest';
import { ErrorDeScript } from './lib/comun.ts';
import { ROTABLES, aRotar, pasoTrasSecretosPages, planFaltantes, sufijoDe } from './arranque.ts';

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
