// docs/33 RV-334 (N4): "Confirmar y aprobar" no se desbloquea con datos viejos. Quien espera ver los
// datos nuevos (la Cola tras un PROPUESTA_DESACTUALIZADA) espera a la última carga, no a la suya.

import { describe, expect, it } from 'vitest';
import { esperarLaUltima } from '@/hooks/carga';

/** Una promesa que se resuelve cuando se quiere. */
function aMano() {
  let resolver!: (ok: boolean) => void;
  const promesa = new Promise<boolean>((r) => (resolver = r));
  return { promesa, resolver };
}

describe('esperarLaUltima (RV-334)', () => {
  it('sin otra carga después, vale el resultado de la suya', async () => {
    const a = aMano();
    const visto = esperarLaUltima(a.promesa, () => a.promesa);
    a.resolver(true);
    expect(await visto).toBe(true);
  });

  it('la suya va bien pero la sustituye una más nueva que falla: no se da por visto (N4)', async () => {
    const a = aMano();
    const b = aMano();
    let ultima = a.promesa;
    const visto = esperarLaUltima(a.promesa, () => ultima);
    ultima = b.promesa; // la recarga de cada minuto empieza mientras tanto
    a.resolver(true); // la vieja llega bien, pero ya no es la que se ve
    b.resolver(false);
    expect(await visto).toBe(false);
  });

  it('la suya falla pero la última va bien: lo que se ve es bueno', async () => {
    const a = aMano();
    const b = aMano();
    let ultima = a.promesa;
    const visto = esperarLaUltima(a.promesa, () => ultima);
    ultima = b.promesa;
    a.resolver(false);
    b.resolver(true);
    expect(await visto).toBe(true);
  });

  it('espera a la última aunque empiece después de que la suya termine', async () => {
    const a = aMano();
    const b = aMano();
    const c = aMano();
    let ultima = a.promesa;
    const visto = esperarLaUltima(a.promesa, () => ultima);
    ultima = b.promesa;
    a.resolver(true);
    await Promise.resolve();
    ultima = c.promesa;
    b.resolver(true);
    c.resolver(false);
    expect(await visto).toBe(false);
  });

  it('sin ninguna en curso, la suya', async () => {
    expect(await esperarLaUltima(Promise.resolve(true), () => null)).toBe(true);
  });
});
