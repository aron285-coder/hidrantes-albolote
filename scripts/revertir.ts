// Vuelve el frontend a un despliegue anterior de Cloudflare Pages, sin reconstruir (04 §12, 15).
// La base de datos no se toca: solo hacia adelante.
//
//   npm run revertir -- --entorno produccion                 lista y vuelve al anterior
//   npm run revertir -- --entorno staging --despliegue <id>  vuelve a uno concreto
//   npm run revertir -- --entorno produccion --listar        solo lista
//
// Necesita CLOUDFLARE_API_TOKEN en el entorno (o lo pide).

import { abortar, argumentos, confirmar, ejecutarScript, log, preguntar } from './lib/comun.ts';
import { Cloudflare } from './lib/servicios.ts';

const PROYECTOS: Record<string, string> = {
  staging: 'hidrantes-albolote-staging',
  produccion: 'hidrantes-albolote',
};

async function principal(): Promise<void> {
  const { banderas, valores } = argumentos();
  const entorno = valores.get('entorno') ?? abortar('Indica --entorno staging o --entorno produccion');
  const proyecto = PROYECTOS[entorno] ?? abortar(`Entorno desconocido: ${entorno}`);

  const cf = new Cloudflare(
    process.env.CLOUDFLARE_API_TOKEN || (await preguntar('Token de API de Cloudflare', { oculto: true })),
  );
  const cuenta = await cf.cuenta();
  const despliegues = (await cf.despliegues(cuenta, proyecto)).filter((d) => d.environment === 'production');
  if (despliegues.length === 0) abortar(`${proyecto} no tiene despliegues de producción.`);

  log.paso(`Despliegues de ${proyecto} (el primero es el actual)`);
  despliegues.slice(0, 10).forEach((d, i) => {
    const meta = d.deployment_trigger?.metadata;
    log.info(
      `${i === 0 ? '→' : ' '} ${d.id}  ${d.created_on.slice(0, 16).replace('T', ' ')}  ${meta?.commit_hash?.slice(0, 7) ?? ''}`,
    );
  });
  if (banderas.has('listar')) return;

  const destino =
    valores.get('despliegue') ?? despliegues[1]?.id ?? abortar('No hay un despliegue anterior al que volver.');
  if (destino === despliegues[0].id) abortar('Ese despliegue ya es el actual.');
  if (!despliegues.some((d) => d.id === destino)) abortar(`No encuentro el despliegue ${destino} en ${proyecto}.`);
  if (!(await confirmar(`¿Volver ${proyecto} al despliegue ${destino}?`))) return;

  await cf.revertir(cuenta, proyecto, destino);
  log.ok(`${proyecto} sirve ahora ${destino}. Anota el motivo en una issue (15).`);
}

ejecutarScript(principal);
