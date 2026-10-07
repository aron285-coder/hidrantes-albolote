import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

// docs/31 RV-130: un despliegue de producción que no viene de deploy-prod.yml se detecta. Con listas
// simuladas de la API de Pages y de las ejecuciones de deploy-prod.yml; curl, gh y psql simulados.
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

const despliegue = (id: string, sha: string, creado: string, extra: object = {}) => ({
  id,
  environment: 'production',
  created_on: creado,
  latest_stage: { name: 'deploy', status: 'success' },
  deployment_trigger: { type: 'ad_hoc', metadata: { commit_hash: sha } },
  ...extra,
});
const ejecuciones = {
  workflow_runs: [
    {
      head_sha: SHA_BUENO,
      status: 'completed',
      conclusion: 'success',
      run_started_at: '2026-10-06T10:00:00Z',
      updated_at: '2026-10-06T10:08:00Z',
    },
    // Cancelada: no autoriza nada.
    {
      head_sha: SHA_OTRO,
      status: 'completed',
      conclusion: 'cancelled',
      run_started_at: '2026-10-06T12:00:00Z',
      updated_at: '2026-10-06T12:01:00Z',
    },
  ],
};
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

describe.skipIf(saltar)('ajenos (RV-130)', () => {
  it('uno de deploy-prod pasa; uno sin ejecución correspondiente sale', () => {
    const r = correr('ajenos "$D/lista.json" "$D/ejec.json" ' + DESDE, {
      'lista.json': [
        despliegue(ID_BUENO, SHA_BUENO, '2026-10-06T10:05:12.123456Z', { activo: true }),
        despliegue(ID_AJENO, SHA_OTRO, '2026-10-06T12:00:30.5Z'),
      ],
      'ejec.json': ejecuciones,
    });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout.trim()).toBe(`${ID_AJENO} bbbbbbb 2026-10-06T12:00:30.5Z`);
  });

  it('el mismo commit fuera de la ejecución de deploy-prod no basta: --commit-hash acepta cualquiera', () => {
    const r = correr('ajenos "$D/lista.json" "$D/ejec.json" ' + DESDE, {
      'lista.json': [despliegue(ID_AJENO, SHA_BUENO, '2026-10-06T15:00:00Z')],
      'ejec.json': ejecuciones,
    });
    expect(r.stdout.trim()).toBe(`${ID_AJENO} aaaaaaa 2026-10-06T15:00:00Z`);
  });

  it('los anteriores a DESDE no se miran, salvo el activo, que se mira siempre', () => {
    const r = correr('ajenos "$D/lista.json" "$D/ejec.json" ' + DESDE, {
      'lista.json': [
        despliegue(ID_VIEJO, SHA_OTRO, '2026-09-01T00:00:00Z'),
        despliegue(ID_AJENO, SHA_OTRO, '2026-09-02T00:00:00Z', { activo: true }),
      ],
      'ejec.json': ejecuciones,
    });
    expect(r.stdout.trim()).toBe(`${ID_AJENO} bbbbbbb 2026-09-02T00:00:00Z`);
  });

  it('los de preview no son de producción', () => {
    const r = correr('ajenos "$D/lista.json" "$D/ejec.json" ' + DESDE, {
      'lista.json': [despliegue(ID_AJENO, SHA_OTRO, '2026-10-06T12:00:00Z', { environment: 'preview' })],
      'ejec.json': ejecuciones,
    });
    expect(r.stdout.trim()).toBe('');
  });

  it('ultimo_bueno es el autorizado y correcto más reciente que no está activo', () => {
    const r = correr('ultimo_bueno "$D/lista.json" "$D/ejec.json"', {
      'lista.json': [
        despliegue(ID_AJENO, SHA_OTRO, '2026-10-06T12:00:30Z', { activo: true }),
        despliegue(ID_BUENO, SHA_BUENO, '2026-10-06T10:05:00Z'),
        despliegue(ID_VIEJO, SHA_BUENO, '2026-10-06T10:06:00Z', { latest_stage: { status: 'failure' } }),
      ],
      'ejec.json': ejecuciones,
    });
    expect(r.stdout.trim()).toBe(ID_BUENO);
  });
});

describe.skipIf(saltar)('mirar_despliegues con la API simulada (RV-130)', () => {
  /** curl, gh y psql simulados; anotan lo que se pide en $D/anotado. */
  const simulados = (revertir: string, issueAbierta = '') => `
    : > "$D/anotado"
    curl() {
      local salida="" url=""
      while [ $# -gt 0 ]; do
        case "$1" in -o) salida="$2"; shift 2 ;; -X) echo "curl $1 $2" >> "$D/anotado"; shift 2 ;; -*) shift ;; *) url="$1"; shift ;; esac
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
        "issue list"*) printf '%s' "${issueAbierta}" ;;
        "issue create"*) echo "issue create" >> "$D/anotado" ;;
        "issue comment"*) echo "issue comment" >> "$D/anotado" ;;
        *) echo "gh $*" >> "$D/anotado" ;;
      esac
    }
    psql() {
      case "$*" in
        *revertir_despliegue_ajeno*) echo ${revertir} ;;
        *notificaciones*) echo "aviso jefatura" >> "$D/anotado" ;;
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
        head_sha: SHA_BUENO,
        status: 'completed',
        conclusion: 'success',
        run_started_at: hace(130),
        updated_at: hace(120),
      },
    ],
  };

  it('todo de deploy-prod: ningún problema, ni issue ni aviso', () => {
    const r = correr(
      simulados('false'),
      {
        'proyecto.json': { result: { canonical_deployment: despliegue(ID_BUENO, SHA_BUENO, hace(125)) } },
        'recientes.json': { result: [despliegue(ID_BUENO, SHA_BUENO, hace(125))] },
        'ejec.json': ejecReciente,
      },
      env,
    );
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout.trim()).toBe('P:');
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
      },
      env,
    );
    expect(r.stdout).toContain(
      `rollback https://api.cloudflare.com/client/v4/accounts/c/pages/projects/hidrantes-albolote/deployments/${ID_BUENO}/rollback`,
    );
  });

  it('con la issue ya abierta y el mismo despliegue, no se repite el aviso', () => {
    const guion = simulados('false', '7').replace(
      '*) echo "gh $*" >> "$D/anotado" ;;',
      `"issue view"*) echo "${ID_AJENO}" ;;\n        *) echo "gh $*" >> "$D/anotado" ;;`,
    );
    const r = correr(
      guion,
      {
        'proyecto.json': { result: { canonical_deployment: despliegue(ID_AJENO, SHA_OTRO, hace(30)) } },
        'recientes.json': { result: [despliegue(ID_AJENO, SHA_OTRO, hace(30))] },
        'ejec.json': ejecReciente,
      },
      env,
    );
    expect(r.stdout).toContain('P:despliegue de producción no autorizado');
    expect(r.stdout).not.toContain('issue comment');
    expect(r.stdout).not.toContain('aviso jefatura');
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
    expect(r.stdout).toContain('ha perdido variables: VAPID_SUBJECT');
  });

  it('un valor que no es staging ni produccion no se manda', () => {
    const r = correr(guion('prod'), {}, env);
    expect(r.status).not.toBe(0);
    expect(r.stdout).toContain('ENTORNO no válido');
  });
});
