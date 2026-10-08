import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

// docs/31 RV-130: un despliegue de producción que no viene de deploy-prod.yml se detecta. Con listas
// simuladas de la API de Pages y de los jobs de deploy-prod.yml; curl, gh y psql simulados.
// docs/32 RV-203: solo autoriza la ventana del paso que despliega, no toda la ejecución.
const raiz = path.resolve(import.meta.dirname, '..');
const tieneJq = spawnSync('bash', ['-c', 'command -v jq'], { encoding: 'utf8' }).status === 0;
// En la CI hay jq: ahí estos tests no se pueden saltar.
const saltar = !tieneJq && !process.env.CI;
const dir = mkdtempSync(path.join(tmpdir(), 'despliegues-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const SHA_BUENO = 'a'.repeat(40);
const SHA_OTRO = 'b'.repeat(40);
const ID_BUENO = '11111111-1111-1111-1111-111111111111';
const ID_AJENO = '22222222-2222-2222-2222-222222222222';
const ID_VIEJO = '33333333-3333-3333-3333-333333333333';
const PASO = 'Desplegar a Cloudflare Pages';

const despliegue = (id: string, sha: string, creado: string, extra: object = {}) => ({
  id,
  environment: 'production',
  created_on: creado,
  latest_stage: { name: 'deploy', status: 'success' },
  deployment_trigger: { type: 'ad_hoc', metadata: { commit_hash: sha } },
  ...extra,
});
/** Un paso de un job, como lo da la API de jobs. */
const paso = (name: string, ini: string | null, fin: string | null, conclusion: string | null = 'success') => ({
  name,
  status: fin ? 'completed' : ini ? 'in_progress' : 'queued',
  conclusion,
  started_at: ini,
  completed_at: fin,
});
/** El job «desplegar» de deploy-prod.yml, con sus pasos. */
const job = (runId: number, sha: string, pasos: object[], extra: object = {}) => ({
  run_id: runId,
  head_sha: sha,
  name: 'desplegar',
  status: 'completed',
  conclusion: 'success',
  steps: pasos,
  ...extra,
});
/** deploy-prod aprobado a las 10:00; el paso que despliega, de 10:05 a 10:06; la paridad, después. */
const jobBueno = job(1, SHA_BUENO, [
  paso('Guarda de seguridad', '2026-10-06T10:00:10Z', '2026-10-06T10:00:20Z'),
  paso('Migraciones (hidrantes_migrador, DEC-052)', '2026-10-06T10:00:20Z', '2026-10-06T10:04:50Z'),
  paso(PASO, '2026-10-06T10:05:00Z', '2026-10-06T10:06:00Z'),
  paso('Paridad con develop', '2026-10-06T10:06:10Z', '2026-10-06T10:08:00Z'),
]);
/** Rechazado en el environment production: el job falla sin correr ningún paso. */
const jobRechazado = job(2, SHA_OTRO, [], { conclusion: 'failure' });
const DESDE = Date.parse('2026-10-01T00:00:00Z') / 1000;

function correr(guion: string, archivos: Record<string, unknown>, env: Record<string, string> = {}) {
  for (const [nombre, contenido] of Object.entries(archivos)) {
    writeFileSync(path.join(dir, nombre), JSON.stringify(contenido));
  }
  return spawnSync('bash', ['-e', '-c', `set -uo pipefail\nsource .github/scripts/despliegues-ajenos.sh\n${guion}`], {
    cwd: raiz,
    encoding: 'utf8',
    env: { ...process.env, D: dir, RUNNER_TEMP: dir, ...env },
  });
}

/** Los no autorizados de la lista, con las ventanas de esos jobs. */
const ajenos = (lista: object[], jobs: object[]) =>
  correr(`ventanas "$D/jobs.json" > "$D/ventanas.json"\najenos "$D/lista.json" "$D/ventanas.json" ${DESDE}`, {
    'lista.json': lista,
    'jobs.json': jobs,
  });

describe.skipIf(saltar)('ajenos (RV-130, RV-203)', () => {
  it('uno durante el paso que despliega pasa; uno sin ejecución correspondiente sale', () => {
    const r = ajenos(
      [
        despliegue(ID_BUENO, SHA_BUENO, '2026-10-06T10:05:12.123456Z', { activo: true }),
        despliegue(ID_AJENO, SHA_OTRO, '2026-10-06T12:00:30.5Z'),
      ],
      [jobBueno, jobRechazado],
    );
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout.trim()).toBe(`${ID_AJENO} bbbbbbb 2026-10-06T12:00:30.5Z production`);
  });

  it('el mismo commit fuera de la ejecución de deploy-prod no basta: --commit-hash acepta cualquiera', () => {
    const r = ajenos([despliegue(ID_AJENO, SHA_BUENO, '2026-10-06T15:00:00Z')], [jobBueno]);
    expect(r.stdout.trim()).toBe(`${ID_AJENO} aaaaaaa 2026-10-06T15:00:00Z production`);
  });

  it('los anteriores a DESDE no se miran, salvo el activo, que se mira siempre', () => {
    const r = ajenos(
      [
        despliegue(ID_VIEJO, SHA_OTRO, '2026-09-01T00:00:00Z'),
        despliegue(ID_AJENO, SHA_OTRO, '2026-09-02T00:00:00Z', { activo: true }),
      ],
      [jobBueno],
    );
    expect(r.stdout.trim()).toBe(`${ID_AJENO} bbbbbbb 2026-09-02T00:00:00Z production`);
  });

  it('un preview en el proyecto de producción nunca viene de deploy-prod, aunque coincida el commit y la hora', () => {
    const r = ajenos([despliegue(ID_AJENO, SHA_BUENO, '2026-10-06T10:05:30Z', { environment: 'preview' })], [jobBueno]);
    expect(r.stdout.trim()).toBe(`${ID_AJENO} aaaaaaa 2026-10-06T10:05:30Z preview`);
  });

  // RV-203: los tres casos de la especificación.
  it('un despliegue durante la espera de la aprobación da alarma, aunque luego se apruebe', () => {
    // Creada a las 9:00, aprobada a las 10:00: a las 9:30 nadie ha aprobado nada.
    const r = ajenos([despliegue(ID_AJENO, SHA_BUENO, '2026-10-06T09:30:00Z')], [jobBueno]);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout.trim()).toBe(`${ID_AJENO} aaaaaaa 2026-10-06T09:30:00Z production`);
  });

  it('un despliegue durante el paso que despliega no da alarma', () => {
    const r = ajenos([despliegue(ID_BUENO, SHA_BUENO, '2026-10-06T10:05:40Z', { activo: true })], [jobBueno]);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout.trim()).toBe('');
  });

  it('un despliegue de una ejecución rechazada da alarma', () => {
    const rechazada = job(3, SHA_BUENO, [], { conclusion: 'failure' });
    const r = ajenos([despliegue(ID_AJENO, SHA_BUENO, '2026-10-06T10:05:40Z')], [rechazada]);
    expect(r.stdout.trim()).toBe(`${ID_AJENO} aaaaaaa 2026-10-06T10:05:40Z production`);
  });

  it('ni los pasos de antes ni los de después de la misma ejecución autorizan nada', () => {
    const r = ajenos(
      [
        despliegue(ID_AJENO, SHA_BUENO, '2026-10-06T10:02:00Z'),
        despliegue(ID_VIEJO, SHA_BUENO, '2026-10-06T10:07:30Z'),
      ],
      [jobBueno],
    );
    expect(r.stdout.trim().split('\n').sort()).toEqual(
      [
        `${ID_AJENO} aaaaaaa 2026-10-06T10:02:00Z production`,
        `${ID_VIEJO} aaaaaaa 2026-10-06T10:07:30Z production`,
      ].sort(),
    );
  });

  it('un paso que despliega y falla no autoriza; uno en marcha ahora, sí', () => {
    const fallido = job(4, SHA_BUENO, [paso(PASO, '2026-10-06T10:05:00Z', '2026-10-06T10:06:00Z', 'failure')], {
      conclusion: 'failure',
    });
    const lista = [despliegue(ID_AJENO, SHA_BUENO, '2026-10-06T10:05:30Z')];
    expect(ajenos(lista, [fallido]).stdout.trim()).toContain(ID_AJENO);
    const enMarcha = job(5, SHA_BUENO, [paso(PASO, '2026-10-06T10:05:00Z', null, null)], {
      status: 'in_progress',
      conclusion: null,
    });
    expect(ajenos(lista, [enMarcha]).stdout.trim()).toBe('');
  });

  it('el reintento de una ejecución autoriza su propia ventana', () => {
    const reintento = job(1, SHA_BUENO, [paso(PASO, '2026-10-06T11:05:00Z', '2026-10-06T11:06:00Z')], {
      run_attempt: 2,
    });
    const r = ajenos(
      [despliegue(ID_BUENO, SHA_BUENO, '2026-10-06T11:05:30Z', { activo: true })],
      [jobBueno, reintento],
    );
    expect(r.stdout.trim()).toBe('');
  });

  it('ultimo_bueno es el autorizado y correcto más reciente que no está activo', () => {
    const r = correr('ventanas "$D/jobs.json" > "$D/ventanas.json"\nultimo_bueno "$D/lista.json" "$D/ventanas.json"', {
      'lista.json': [
        despliegue(ID_AJENO, SHA_OTRO, '2026-10-06T12:00:30Z', { activo: true }),
        despliegue(ID_BUENO, SHA_BUENO, '2026-10-06T10:05:00Z'),
        despliegue(ID_VIEJO, SHA_BUENO, '2026-10-06T10:05:50Z', { latest_stage: { status: 'failure' } }),
      ],
      'jobs.json': [jobBueno],
    });
    expect(r.stdout.trim()).toBe(ID_BUENO);
  });
});

describe('deploy-prod.yml tiene el paso que despliega con el nombre que busca la vigilancia (RV-203)', () => {
  it('se llama así, y es el que corre wrangler pages deploy en el proyecto de producción', () => {
    const guion = readFileSync(path.join(raiz, '.github/scripts/despliegues-ajenos.sh'), 'utf8');
    expect(guion).toContain(`PASO_DESPLIEGUE='${PASO}'`);
    const deploy = readFileSync(path.join(raiz, '.github/workflows/deploy-prod.yml'), 'utf8');
    const pasos = deploy.split(/\n(?= {6}- )/);
    const desplegar = pasos.filter((p) => /wrangler pages deploy/.test(p));
    expect(desplegar).toHaveLength(1);
    expect(desplegar[0]).toContain(`- name: ${PASO}\n`);
    expect(desplegar[0]).toContain('--project-name hidrantes-albolote ');
  });
});

describe.skipIf(saltar)('mirar_despliegues con la API simulada (RV-130)', () => {
  /** curl, gh y psql simulados; anotan lo que se pide en $D/anotado. */
  const simulados = (revertir: string, issueAbierta = '', avisados = '', admins = '2') => `
    : > "$D/anotado"
    curl() {
      local salida="" url=""
      while [ $# -gt 0 ]; do
        case "$1" in -o) salida="$2"; shift 2 ;; -X) echo "curl $1 $2" >> "$D/anotado"; shift 2 ;; -w|-H|--max-time) shift 2 ;; -*) shift ;; *) url="$1"; shift ;; esac
      done
      case "$url" in
        */rollback) echo "rollback $url" >> "$D/anotado"; printf 200 ;;
        */deployments\\?*) cp "$D/recientes.json" "$salida"; printf 200 ;;
        *) cp "$D/proyecto.json" "$salida"; printf 200 ;;
      esac
    }
    gh() {
      case "$*" in
        *deploy-prod.yml/runs*) cat "$D/ejec.json" ;;
        *"/jobs?"*)
          local id
          id=$(printf '%s' "$1 $2" | sed -E 's|.*/runs/([0-9]+)/jobs.*|\\1|')
          echo "jobs $id" >> "$D/anotado"
          if [ -f "$D/jobs-roto" ]; then return 1; fi
          jq -c --argjson id "$id" '.[] | select(.run_id == $id)' "$D/jobs.json" ;;
        "issue list"*"--state all"*) printf '%s\\n' "${avisados}" ;;
        "issue list"*) printf '%s' "${issueAbierta}" ;;
        "issue create"*) echo "issue create" >> "$D/anotado" ;;
        "issue comment"*) echo "issue comment" >> "$D/anotado" ;;
        *) echo "gh $*" >> "$D/anotado" ;;
      esac
    }
    psql() {
      case "$*" in
        *revertir_despliegue_ajeno*) echo ${revertir} ;;
        *notificaciones*) echo "aviso jefatura" >> "$D/anotado"; echo ${admins} ;;
      esac
    }
    problemas=()
    mirar_despliegues
    printf 'P:%s\\n' "\${problemas[@]}"
    cat "$D/anotado"
  `;
  const env = {
    CLOUDFLARE_API_TOKEN: 't',
    CLOUDFLARE_ACCOUNT_ID: 'c',
    GH_TOKEN: 'g',
    REPO: 'x/y',
    BD: 'postgresql://simulada',
  };
  const ahora = new Date();
  const hace = (min: number) => new Date(ahora.getTime() - min * 60_000).toISOString().replace(/\.\d+Z$/, 'Z');
  const ejecReciente = {
    workflow_runs: [
      {
        id: 41,
        head_sha: SHA_BUENO,
        status: 'completed',
        conclusion: 'success',
        created_at: hace(130),
        updated_at: hace(120),
      },
      // Esperando la aprobación: aún no ha corrido nada, no se piden sus jobs.
      { id: 42, head_sha: SHA_OTRO, status: 'waiting', conclusion: null, created_at: hace(40), updated_at: hace(40) },
    ],
  };
  const jobsRecientes = [job(41, SHA_BUENO, [paso(PASO, hace(126), hace(124))])];

  it('todo de deploy-prod: ningún problema, ni issue ni aviso; solo pide los jobs de las que han corrido', () => {
    const r = correr(
      simulados('false'),
      {
        'proyecto.json': { result: { canonical_deployment: despliegue(ID_BUENO, SHA_BUENO, hace(125)) } },
        'recientes.json': { result: [despliegue(ID_BUENO, SHA_BUENO, hace(125))] },
        'ejec.json': ejecReciente,
        'jobs.json': jobsRecientes,
      },
      env,
    );
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout.trim()).toBe('P:\njobs 41');
  });

  it('uno sin ejecución correspondiente abre la issue y avisa a jefatura; sin la opción, no revierte', () => {
    const r = correr(
      simulados('false'),
      {
        'proyecto.json': { result: { canonical_deployment: despliegue(ID_AJENO, SHA_OTRO, hace(30)) } },
        'recientes.json': {
          result: [despliegue(ID_AJENO, SHA_OTRO, hace(30)), despliegue(ID_BUENO, SHA_BUENO, hace(125))],
        },
        'ejec.json': ejecReciente,
        'jobs.json': jobsRecientes,
      },
      env,
    );
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain(
      `P:despliegue de producción no autorizado (no viene de deploy-prod.yml): ${ID_AJENO} bbbbbbb`,
    );
    expect(r.stdout).toContain('issue create');
    expect(r.stdout).toContain('aviso jefatura');
    expect(r.stdout).not.toContain('rollback');
    // La del commit pendiente espera la aprobación: no se piden sus jobs.
    expect(r.stdout).not.toContain('jobs 42');
  });

  it('con config.revertir_despliegue_ajeno, vuelve al último despliegue bueno', () => {
    const r = correr(
      simulados('true'),
      {
        'proyecto.json': { result: { canonical_deployment: despliegue(ID_AJENO, SHA_OTRO, hace(30)) } },
        'recientes.json': {
          result: [despliegue(ID_AJENO, SHA_OTRO, hace(30)), despliegue(ID_BUENO, SHA_BUENO, hace(125))],
        },
        'ejec.json': ejecReciente,
        'jobs.json': jobsRecientes,
      },
      env,
    );
    expect(r.stdout).toContain(
      `rollback https://api.cloudflare.com/client/v4/accounts/c/pages/projects/hidrantes-albolote/deployments/${ID_BUENO}/rollback`,
    );
  });

  it('si no puede leer los pasos de una ejecución, es un problema y no mira nada más', () => {
    writeFileSync(path.join(dir, 'jobs-roto'), '');
    try {
      const r = correr(
        simulados('false'),
        {
          'proyecto.json': { result: { canonical_deployment: despliegue(ID_BUENO, SHA_BUENO, hace(125)) } },
          'recientes.json': { result: [despliegue(ID_BUENO, SHA_BUENO, hace(125))] },
          'ejec.json': ejecReciente,
          'jobs.json': jobsRecientes,
        },
        env,
      );
      expect(r.status, r.stderr).toBe(0);
      expect(r.stdout).toContain('P:no se pueden leer los pasos de la ejecución 41 de deploy-prod.yml');
      expect(r.stdout).not.toContain('issue create');
    } finally {
      rmSync(path.join(dir, 'jobs-roto'), { force: true });
    }
  });

  it('con la issue ya abierta y el mismo despliegue, no se repite el aviso; la vigilancia dice que sigue abierta', () => {
    const r = correr(
      simulados('false', '7', `- ${ID_AJENO} bbbbbbb`),
      {
        'proyecto.json': { result: { canonical_deployment: despliegue(ID_AJENO, SHA_OTRO, hace(30)) } },
        'recientes.json': { result: [despliegue(ID_AJENO, SHA_OTRO, hace(30))] },
        'ejec.json': ejecReciente,
        'jobs.json': jobsRecientes,
      },
      env,
    );
    expect(r.stdout).toContain('P:sigue abierta la issue #7');
    expect(r.stdout).not.toContain('issue comment');
    expect(r.stdout).not.toContain('aviso jefatura');
  });

  const ajenoActivo = () => ({
    'proyecto.json': { result: { canonical_deployment: despliegue(ID_AJENO, SHA_OTRO, hace(30)) } },
    'recientes.json': { result: [despliegue(ID_AJENO, SHA_OTRO, hace(30))] },
    'ejec.json': ejecReciente,
    'jobs.json': jobsRecientes,
  });

  it('cerrar la issue es darlo por atendido: no se vuelve a abrir ni a avisar', () => {
    const r = correr(simulados('false', '', `- ${ID_AJENO} bbbbbbb`), ajenoActivo(), env);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout.trim()).toBe('P:');
  });

  it('con la issue abierta y un despliegue nuevo, la comenta y vuelve a avisar', () => {
    const r = correr(simulados('false', '7', `- ${ID_VIEJO} bbbbbbb`), ajenoActivo(), env);
    expect(r.stdout).toContain('P:despliegue de producción no autorizado');
    expect(r.stdout).toContain('issue comment');
    expect(r.stdout).toContain('aviso jefatura');
  });

  it('sin administradores con avisos, lo dice: nadie ha recibido el aviso', () => {
    const r = correr(simulados('false', '', '', '0'), ajenoActivo(), env);
    expect(r.stdout).toContain('P:ningún administrador tiene los avisos activados');
  });

  it('sin token de Cloudflare es un problema, no un silencio', () => {
    const r = correr(simulados('false'), {}, { ...env, CLOUDFLARE_API_TOKEN: '' });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('P:falta el token de Cloudflare en prod-tareas');
  });
});

describe('vigilancia.yml mira los despliegues de producción (RV-130)', () => {
  const vigilancia = readFileSync(path.join(raiz, '.github/workflows/vigilancia.yml'), 'utf8');
  const mirar = vigilancia.slice(vigilancia.indexOf('\n  mirar:\n'));

  it('el trabajo mirar carga el guion, con el token de Cloudflare de prod-tareas', () => {
    expect(mirar).toMatch(/^ {4}environment: prod-tareas$/m);
    expect(mirar).toContain('source .github/scripts/despliegues-ajenos.sh');
    expect(mirar).toContain('mirar_despliegues');
    expect(mirar).toContain('CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}');
  });
});

describe.skipIf(saltar)('poner_entorno (RV-130)', () => {
  /** curl simulado: GET da $D/antes.json; PATCH guarda el cuerpo y da $D/despues.json. */
  const guion = (valor: string) => `
    source .github/scripts/entorno-pages.sh
    curl() {
      local salida="" metodo=GET cuerpo=""
      while [ $# -gt 0 ]; do
        case "$1" in -o) salida="$2"; shift 2 ;; -X) metodo="$2"; shift 2 ;; -d) cuerpo="$2"; shift 2 ;; -w|-H|--max-time) shift 2 ;; *) shift ;; esac
      done
      if [ "$metodo" = PATCH ]; then printf '%s' "$cuerpo" > "$D/cuerpo.json"; cp "$D/despues.json" "$salida"; else cp "$D/antes.json" "$salida"; fi
      printf 200
    }
    poner_entorno hidrantes-albolote-staging ${valor}
  `;
  const proyecto = (vars: Record<string, object>) => ({
    result: { deployment_configs: { production: { env_vars: vars } } },
  });
  const env = { CLOUDFLARE_API_TOKEN: 't', CLOUDFLARE_ACCOUNT_ID: 'c' };
  const secreto = { type: 'secret_text', value: '' };

  it('manda solo ENTORNO, en production y preview, y comprueba que quedó', () => {
    const r = correr(
      guion('staging'),
      {
        'antes.json': proyecto({ SAL_IP: secreto }),
        'despues.json': proyecto({ SAL_IP: secreto, ENTORNO: { type: 'plain_text', value: 'staging' } }),
      },
      env,
    );
    expect(r.status, r.stderr + r.stdout).toBe(0);
    const cuerpo = JSON.parse(readFileSync(path.join(dir, 'cuerpo.json'), 'utf8'));
    const una = { env_vars: { ENTORNO: { type: 'plain_text', value: 'staging' } } };
    expect(cuerpo).toEqual({ deployment_configs: { production: una, preview: una } });
  });

  it('si la API hubiera borrado otra variable al ponerla, falla diciendo cuál', () => {
    const r = correr(
      guion('staging'),
      {
        'antes.json': proyecto({ SAL_IP: secreto, VAPID_SUBJECT: secreto }),
        'despues.json': proyecto({ SAL_IP: secreto, ENTORNO: { type: 'plain_text', value: 'staging' } }),
      },
      env,
    );
    expect(r.status).not.toBe(0);
    expect(r.stdout).toContain('ha perdido variables: production:VAPID_SUBJECT');
  });

  it('un valor que no es staging ni produccion no se manda', () => {
    const r = correr(guion('prod'), {}, env);
    expect(r.status).not.toBe(0);
    expect(r.stdout).toContain('ENTORNO no válido');
  });
});
