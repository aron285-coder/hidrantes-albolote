// La rejilla de teselas de Web Mercator. Solo aritmética, sin dependencias: corre con node sin
// node_modules (comprobar-despliegue.ts en los trabajos con secretos, docs/35 RV-410).

/** Teselas (x, y) de un zoom que tocan el recuadro, en la rejilla de Web Mercator. */
export function teselasDelRecuadro(z: number, [oeste, sur, este, norte]: [number, number, number, number]) {
  const n = 2 ** z;
  const x = (lon: number) => Math.min(n - 1, Math.floor(((lon + 180) / 360) * n));
  const y = (lat: number) => {
    const r = (lat * Math.PI) / 180;
    return Math.min(n - 1, Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n));
  };
  const lista: { x: number; y: number }[] = [];
  for (let tx = x(oeste); tx <= x(este); tx++) {
    for (let ty = y(norte); ty <= y(sur); ty++) lista.push({ x: tx, y: ty });
  }
  return lista;
}
