// docs/33 RV-334 (N4): "Confirmar y aprobar" no se desbloquea con datos viejos. Quien espera ver los
// datos nuevos (la Cola tras un PROPUESTA_DESACTUALIZADA) espera a la última carga, no a la suya.

import { describe, expect, it, vi } from 'vitest';
import type { Resultado } from '@/lib/api';
import { crearTurnos, esperarLaUltima } from '@/hooks/carga';

vi.mock('@/lib/errores', () => ({ anotarError: () => undefined }));

/** Una carga del servidor que se contesta cuando se quiere. */
function cargaAMano<T>() {
  let contestar!: (r: Resultado<T>) => void;
  let fallar!: (e: unknown) => void;
  const promesa = new Promise<Resultado<T>>((r, f) => ((contestar = r), (fallar = f)));
  return { cargar: () => promesa, contestar, fallar };
}

// Lo que hace useCarga, sin React: el caso N4 de punta a punta (docs/33 RV-334).
describe('crearTurnos (RV-334)', () => {
  it('la recarga de cada minuto empieza mientras se espera y falla: no se da por visto', async () => {
    const aplicadas: Resultado<string>[] = [];
    const t = crearTurnos<string>((r) => aplicadas.push(r));
    const tras = cargaAMano<string>();
    const minuto = cargaAMano<string>();
    const visto = t.recargarYVer(tras.cargar);
    void t.recargar(minuto.cargar);
    tras.contestar({ ok: true, datos: 'vieja' });
    minuto.contestar({ ok: false, codigo: 'RED' });
    expect(await visto).toBe(false);
    // Solo la última se aplica: la vieja, que llegó tarde, no pisa lo que se ve.
    expect(aplicadas).toEqual([{ ok: false, codigo: 'RED' }]);
  });

  it('sin otra carga, vale la suya y se aplica', async () => {
    const aplicadas: Resultado<string>[] = [];
    const t = crearTurnos<string>((r) => aplicadas.push(r));
    const c = cargaAMano<string>();
    const visto = t.recargarYVer(c.cargar);
    c.contestar({ ok: true, datos: 'hoy' });
    expect(await visto).toBe(true);
    expect(aplicadas).toEqual([{ ok: true, datos: 'hoy' }]);
  });

  it('una carga que lanza un error no deja "Cargando…": se aplica como error y dice false', async () => {
    const aplicadas: Resultado<string>[] = [];
    const t = crearTurnos<string>((r) => aplicadas.push(r));
    const c = cargaAMano<string>();
    const visto = t.recargarYVer(c.cargar);
    c.fallar(new Error('fila ilegible'));
    expect(await visto).toBe(false);
    expect(aplicadas).toEqual([{ ok: false, codigo: 'ERROR_INTERNO' }]);
  });

  it('una carga que llega tarde dice false aunque haya ido bien', async () => {
    const t = crearTurnos<string>(() => undefined);
    const a = cargaAMano<string>();
    const b = cargaAMano<string>();
    const primera = t.recargar(a.cargar);
    void t.recargar(b.cargar);
    a.contestar({ ok: true, datos: 'x' });
    expect(await primera).toBe(false);
    b.contestar({ ok: true, datos: 'y' });
  });
});

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
