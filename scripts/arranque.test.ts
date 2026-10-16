import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ErrorDeScript } from './lib/comun.ts';
import {
  ENTORNOS,
  ENV_TAREAS,
  secretosEnSuSitio,
  sitioSecretoTareas,
  type EscrituraWorker,
  type OpsFaltantes,
  ROTABLES,
  aRotar,
  pasoTrasSecretosPages,
  planPropietario,
  repoDestino,
  planFaltantes,
  ponerFaltantes,
  secretosWorkerDe,
  sufijoDe,
  variablesDelBuildQueFaltan,
  vigilanciaEnOrden,
  codigoAleatorio,
  conCodigoStaging,
  nombreEnSuSitio,
  SITIOS_PROPIETARIO,
  ensenarCadenaMigrador,
  motivoSinTerminal,
  arrancarEntorno,
  guardarCadenaMigrador,
  etiquetaEntorno,
} from './arranque.ts';

// docs/35 RV-410: el build de los deploy, sin environment, usa la clave VAPID pública del repositorio.
describe('variables del build en el repositorio', () => {
  it('pide las de staging y producción que falten, y ninguna si están', () => {
    expect(variablesDelBuildQueFaltan([])).toEqual(['VITE_VAPID_PUBLIC_KEY_STAGING', 'VITE_VAPID_PUBLIC_KEY_PROD']);
    expect(variablesDelBuildQueFaltan(['VITE_VAPID_PUBLIC_KEY_STAGING'])).toEqual(['VITE_VAPID_PUBLIC_KEY_PROD']);
    expect(variablesDelBuildQueFaltan(['VITE_VAPID_PUBLIC_KEY_STAGING', 'VITE_VAPID_PUBLIC_KEY_PROD'])).toEqual([]);
  });

  it('el arranque completo y --solo-faltantes las ponen, y los deploy las usan', () => {
    const fuente = readFileSync(path.join(import.meta.dirname, 'arranque.ts'), 'utf8');
    expect(fuente).toContain('fijarVariable(`VITE_VAPID_PUBLIC_KEY_${sufijo}`, vapidPublica)');
    expect(fuente).toContain('copiarVariablesDelBuild();');
    for (const [a, s] of [
      ['deploy-staging.yml', 'STAGING'],
      ['deploy-prod.yml', 'PROD'],
    ]) {
      const yml = readFileSync(path.join(import.meta.dirname, '..', '.github', 'workflows', a!), 'utf8');
      expect(yml).toContain(`VITE_VAPID_PUBLIC_KEY: \${{ vars.VITE_VAPID_PUBLIC_KEY_${s} }}`);
    }
  });
});

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

// docs/31 RV-131, DEC-172: ningún secreto de producción en el nivel del repositorio.
describe('environment prod-tareas (RV-131)', () => {
  const fuente = readFileSync(path.join(import.meta.dirname, 'arranque.ts'), 'utf8');

  it('los secretos _PROD de las tareas van a prod-tareas; los de staging, a un environment (RV-411)', () => {
    expect(ENV_TAREAS).toBe('prod-tareas');
    expect(sitioSecretoTareas('SUPABASE_DB_URL_PROD')).toBe('prod-tareas');
    expect(sitioSecretoTareas('SUPABASE_SERVICE_ROLE_KEY_PROD')).toBe('prod-tareas');
    expect(sitioSecretoTareas('VIGILANCIA_SECRETO_PROD')).toBe('prod-tareas');
    expect(sitioSecretoTareas('VIGILANCIA_SECRETO_STAGING')).toBe('staging');
    expect(nombreEnSuSitio('VIGILANCIA_SECRETO_STAGING')).toBe('VIGILANCIA_SECRETO');
    expect(sitioSecretoTareas('SUPABASE_DB_URL_STAGING')).toBe('production');
    expect(sitioSecretoTareas('SUPABASE_SERVICE_ROLE_KEY_STAGING')).toBe('production');
    expect(nombreEnSuSitio('SUPABASE_DB_URL_STAGING')).toBe('SUPABASE_DB_URL_STAGING');
    expect(sitioSecretoTareas('GPG_PUBLIC_KEY')).toBeUndefined();
  });

  it('uno que sigue en el repositorio pero no en su environment cuenta como que falta', () => {
    const hay = secretosEnSuSitio({
      '': ['VIGILANCIA_SECRETO_PROD', 'VIGILANCIA_SECRETO_STAGING', 'GPG_PUBLIC_KEY', ''],
      'prod-tareas': ['SUPABASE_DB_URL_PROD', 'VIGILANCIA_SECRETO_STAGING'],
      staging: ['VIGILANCIA_SECRETO'],
      production: ['SUPABASE_SERVICE_ROLE_KEY_STAGING'],
    });
    expect(hay).toEqual([
      'GPG_PUBLIC_KEY',
      'SUPABASE_DB_URL_PROD',
      'SUPABASE_SERVICE_ROLE_KEY_STAGING',
      'VIGILANCIA_SECRETO_STAGING',
    ]);
    expect(
      planFaltantes({
        clave: 'production',
        pages: ['VIGILANCIA_SECRETO'],
        repo: hay,
        worker: ['VIGILANCIA_SECRETO_PROD'],
      }).vigilancia,
    ).toBe(true);
  });

  it('el arranque crea prod-tareas sin revisores y solo para develop', () => {
    expect(fuente).toContain("{ nombre: ENV_TAREAS, rama: 'develop', revisor: false }");
    expect(fuente).toContain('`repos/${REPO}/environments/${e.nombre}/deployment-branch-policies`');
  });

  it('ningún secreto _PROD se escribe en el repositorio sin pasar por sitioSecretoTareas', () => {
    // fijarSecreto(nombre, valor) sin tercer argumento es el repositorio.
    const alRepositorio = [...fuente.matchAll(/fijarSecreto\(([^,]+),[^,)]+\)/g)].map((m) => m[1]!.trim());
    expect(alRepositorio.filter((n) => /PROD|sufijo/.test(n))).toEqual([]);
  });

  // docs/35 RV-411: ninguno de staging ni el del propietario en el nivel del repositorio.
  it('ni los de staging ni PROPIETARIO_EMAIL ni CODIGO_STAGING se escriben en el repositorio', () => {
    const alRepositorio = [...fuente.matchAll(/fijarSecreto\(([^,]+),[^,)]+\)/g)].map((m) => m[1]!.trim());
    expect(alRepositorio.filter((n) => /STAGING|PROPIETARIO|CODIGO/.test(n))).toEqual([]);
    expect(SITIOS_PROPIETARIO).toEqual(['staging', 'production']);
    expect(fuente).toContain("fijarSecreto('CODIGO_STAGING', codigo, 'staging')");
  });

  it('entornos.md y su plantilla no dejan ningún secreto de producción en el repositorio', () => {
    const entornos = readFileSync(path.join(import.meta.dirname, '../docs/entornos.md'), 'utf8');
    for (const texto of [entornos, fuente.replaceAll('\\`', '`')]) {
      const fila = texto.split('\n').find((l) => l.startsWith('| Secretos del repositorio |'))!;
      expect(fila).not.toMatch(/PROD\b|\{STAGING,PROD\}/);
      expect(texto).toContain('| Environment `prod-tareas` (sin revisores, solo `develop`) |');
    }
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

// docs/32 RV-208: traspaso.yml solo lo lanza quien diga la variable PROPIETARIO; la pone el arranque.
describe('variable PROPIETARIO', () => {
  const fuente = readFileSync(path.join(import.meta.dirname, 'arranque.ts'), 'utf8');

  it('sin variable, se pone; con el mismo login (sin mirar mayúsculas), se deja; con otro, se avisa', () => {
    expect(planPropietario(null, 'titular')).toBe('poner');
    expect(planPropietario('Titular', 'titular')).toBe('ya-esta');
    expect(planPropietario('otro', 'titular')).toBe('distinta');
  });

  it('la ponen el arranque completo (preguntando si es otra) y --solo-faltantes (sin pisarla)', () => {
    expect(fuente).toContain("fijarVariable('PROPIETARIO', login)");
    expect(fuente).toContain('await asegurarVariablePropietario(login, true)');
    expect(fuente).toContain('await asegurarVariablePropietario(login, false)');
  });

  it('quien aprueba production es el login de gh, no el titular del remoto (que puede ser una organización)', () => {
    expect(fuente).toContain('ghApi(`users/${login}`)');
    expect(fuente).not.toMatch(/users\/\$\{REPO/);
  });

  it('el repositorio sale de git remote; sin origin (primer arranque), del login de gh', () => {
    expect(repoDestino(true, 'titular', () => 'otro/hidrantes-albolote')).toBe('otro/hidrantes-albolote');
    const sinRemoto = () => {
      throw new Error('no se debe leer el remoto');
    };
    expect(repoDestino(false, 'titular', sinRemoto)).toBe('titular/hidrantes-albolote');
  });
});

// docs/35 RV-411 (DEC-200): el código de staging se genera al azar y solo va al secreto y a .env.local.
describe('código de acceso de staging', () => {
  it('seis cifras, y nunca seis iguales (tampoco el de pruebas)', () => {
    const valores = [0, 111111, 42, 999999];
    const azar = () => valores.shift()!;
    expect(codigoAleatorio(azar)).toBe('000042');
    expect(codigoAleatorio(() => 7)).toBe('000007');
    expect(codigoAleatorio()).toMatch(/^\d{6}$/);
  });

  it('en .env.local cambia solo su línea y deja las demás', () => {
    const antes = 'VITE_ENTORNO=local\nCODIGO_STAGING=123456\nVITE_SUPABASE_URL=x\n\n';
    expect(conCodigoStaging(antes, '654321')).toBe('VITE_ENTORNO=local\nVITE_SUPABASE_URL=x\nCODIGO_STAGING=654321\n');
    expect(conCodigoStaging('', '654321')).toBe('CODIGO_STAGING=654321\n');
  });
});

// docs/39 RV-516 (DEC-219): la cadena del migrador se enseña una vez, al crearla o rotarla, para el sobre (15 §2).
describe('la cadena del migrador, en el sobre', () => {
  const CADENA = 'postgresql://hidrantes_migrador.ref:clave-de-prueba@pooler.example:5432/postgres'; // detectar-secretos:permitir (valor de prueba)
  const preparar = (tty: boolean) => {
    const salida: string[] = [];
    const preguntas: string[] = [];
    const io = {
      tty,
      escribir: (t: string) => void salida.push(t),
      esperar: async (p: string) => void preguntas.push(p),
      limpiar: () => void salida.push('<limpio>'),
    };
    return { salida, preguntas, io };
  };

  it('con una terminal, sale una vez, con el aviso del sobre, y espera a que se guarde', async () => {
    const { salida, preguntas, io } = preparar(true);
    expect(await ensenarCadenaMigrador('staging', CADENA, io)).toBe(true);
    expect(salida.filter((l) => l.includes(CADENA))).toHaveLength(1);
    expect(salida.join(' ')).toContain('Cadena del migrador de staging');
    expect(salida.join(' ')).toContain('15 §2');
    expect(preguntas).toHaveLength(1);
    expect(salida.at(-1)).toBe('<limpio>');
  });

  it('sin terminal, no sale, y dice cómo repetir la rotación en una', async () => {
    const { salida, preguntas, io } = preparar(false);
    expect(await ensenarCadenaMigrador('production', CADENA, io)).toBe(false);
    expect(salida.join(' ')).not.toContain('clave-de-prueba');
    expect(salida.join(' ')).toContain('--rotar db');
    expect(preguntas).toHaveLength(0);
  });

  it('sin terminal no se rota: la cadena del sobre dejaría de valer sin enseñar la nueva', () => {
    expect(motivoSinTerminal(true, false)).toMatch(/terminal/);
    // docs/40 RV-530: en Git Bash (mintty) la salida no es una terminal; dice qué usar.
    expect(motivoSinTerminal(true, false)).toMatch(/PowerShell/);
    expect(motivoSinTerminal(true, false)).toMatch(/winpty npm run arranque -- --rotar db/);
    expect(motivoSinTerminal(true, true)).toBeNull();
    expect(motivoSinTerminal(false, false)).toBeNull();
  });

  it('solo se llama con una cadena nueva (--rotar db), y nunca va a log, a un archivo ni a un argumento', () => {
    const fuente = readFileSync(path.join(import.meta.dirname, 'arranque.ts'), 'utf8');
    // La definición y una sola llamada, la de guardarCadenaMigrador; a esta solo la llama prepararSupabase con la
    // clave recién creada (docs/40 RV-530).
    expect(fuente.match(/ensenarCadenaMigrador\(/g) ?? []).toHaveLength(2);
    expect(fuente.match(/await alTenerMigrador\(urlMigrador\)/g) ?? []).toHaveLength(1);
    // Comprobación de la fuente (no del comportamiento): ni la cadena ni la clave en un log, una consola o un archivo.
    for (const v of ['urlMigrador', 'claveMigrador']) {
      expect(fuente).not.toMatch(
        new RegExp(`(log\\.[a-z]+|console\\.[a-z]+|writeFileSync|appendFileSync)\\([^;]*${v}`),
      );
    }
  });
});

// docs/40 RV-530: con --rotar db, la cadena se guarda y se enseña antes de nada que pueda abortar.
describe('--rotar db: la cadena, a salvo antes de nada que pueda abortar', () => {
  const CADENA = 'postgresql://hidrantes_migrador.ref:clave-nueva@pooler.example:5432/postgres'; // detectar-secretos:permitir (valor de prueba)
  const pasos = (orden: string[], worker: EscrituraWorker) => ({
    supabase: async (alTenerMigrador: (c: string) => Promise<void>) => {
      orden.push('clave cambiada en la base');
      await alTenerMigrador(CADENA);
      orden.push('pregunta de PostGIS');
      return { ref: 'ref', url: 'https://ref.supabase.co', anon: 'a', servicio: 's', urlMigrador: CADENA };
    },
    guardarCadena: (c: string) =>
      guardarCadenaMigrador('production', 'PROD', c, {
        fijar: (nombre, _valor, entorno) => void orden.push(`secreto ${nombre} ${entorno ?? 'repo'}`),
        ensenar: async (etiqueta) => {
          orden.push(`enseñada (${etiqueta})`);
          return true;
        },
      }),
    pages: async () => {
      orden.push('Pages');
      return { vigilancia: 'v', resto: async () => void orden.push('Pages y repositorio') };
    },
    worker: () => worker,
  });

  it('el orden: la base, los secretos de la cadena y la cadena en pantalla, antes de PostGIS y de Pages', async () => {
    const orden: string[] = [];
    await arrancarEntorno('PROD', pasos(orden, 'ok'));
    expect(orden).toEqual([
      'clave cambiada en la base',
      'secreto SUPABASE_DB_URL production',
      `secreto SUPABASE_DB_URL_PROD ${ENV_TAREAS}`,
      'enseñada (producción)',
      'pregunta de PostGIS',
      'Pages',
      'Pages y repositorio',
    ]);
  });

  it('si el Worker rechaza, la cadena ya está guardada y enseñada, y no dice «todo sigue como estaba»', async () => {
    const orden: string[] = [];
    const error = await arrancarEntorno('PROD', pasos(orden, 'error')).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorDeScript);
    const mensaje = (error as Error).message;
    expect(mensaje).not.toMatch(/todo sigue como estaba/);
    expect(mensaje).toMatch(/La clave del migrador ya está cambiada y guardada en GitHub/);
    expect(mensaje).not.toContain('clave-nueva');
    expect(orden).toContain('enseñada (producción)');
    expect(orden).not.toContain('Pages y repositorio');
  });

  it('sin rotar la base, el mensaje de siempre', async () => {
    await expect(
      vigilanciaEnOrden(
        'STAGING',
        () => 'error',
        () => undefined,
      ),
    ).rejects.toThrow(/todo sigue como estaba/);
  });

  it('el recuadro dice «staging» o «producción»', () => {
    expect(etiquetaEntorno('production')).toBe('producción');
    expect(etiquetaEntorno('staging')).toBe('staging');
  });
});
