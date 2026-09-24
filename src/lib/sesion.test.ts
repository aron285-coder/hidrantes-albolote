import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { borrar, escribir, leer } from './almacen';
import { almacenEnMemoria } from './pruebas';
import {
  bloqueadoHasta,
  bloquear,
  cerrarSesion,
  dispositivoId,
  esErrorDeAcceso,
  guardarSesion,
  leerFirma,
  leerSesion,
  marcarPrimerUsoVisto,
  olvidarToken,
  primerUsoVisto,
} from './sesion';

afterEach(() => vi.unstubAllGlobals());

describe('almacén local (TR-07)', () => {
  it('sin almacenamiento no rompe: lee null y escribe en vano', () => {
    almacenEnMemoria(true);
    expect(() => escribir('x', 1)).not.toThrow();
    expect(leer('x')).toBeNull();
    expect(() => borrar('x')).not.toThrow();
  });

  it('un valor corrupto se lee como null', () => {
    const datos = almacenEnMemoria();
    datos.set('hidrantes.x', '{no es json');
    expect(leer('x')).toBeNull();
  });
});

describe('sesión del voluntario (FR-30–FR-35, TR-43)', () => {
  let datos: Map<string, string>;
  beforeEach(() => {
    datos = almacenEnMemoria();
  });

  it('el identificador del móvil se genera una vez y es un uuid', () => {
    const id = dispositivoId();
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(dispositivoId()).toBe(id);
  });

  it('guarda token y firma recortada; sin token no hay sesión', () => {
    expect(leerSesion()).toBeNull();
    guardarSesion('t'.repeat(43), { nombre: ' Ana ', apellido: 'Ruiz ' });
    expect(leerSesion()).toEqual({ token: 't'.repeat(43), nombre: 'Ana', apellido: 'Ruiz' });
  });

  it('un token rechazado se olvida pero el nombre se conserva (FR-35)', () => {
    guardarSesion('t'.repeat(43), { nombre: 'Ana', apellido: 'Ruiz' });
    olvidarToken();
    expect(leerSesion()).toBeNull();
    expect(leerFirma()).toEqual({ nombre: 'Ana', apellido: 'Ruiz' });
  });

  it('cerrar sesión borra acceso, nombre y el identificador del móvil (FL-12)', () => {
    const antes = dispositivoId();
    guardarSesion('t'.repeat(43), { nombre: 'Ana', apellido: 'Ruiz' });
    marcarPrimerUsoVisto();
    cerrarSesion();
    expect(leerSesion()).toBeNull();
    expect(leerFirma()).toBeNull();
    expect(primerUsoVisto()).toBe(false);
    expect(dispositivoId()).not.toBe(antes);
    expect([...datos.keys()]).toEqual(['hidrantes.dispositivo_id']);
  });

  it('el bloqueo por intentos dura una hora y se levanta al entrar', () => {
    const ahora = 1_000_000;
    bloquear(ahora);
    expect(bloqueadoHasta(ahora + 59 * 60_000)).toBe(ahora + 3600_000);
    expect(bloqueadoHasta(ahora + 3600_000)).toBeNull();
    guardarSesion('t'.repeat(43), { nombre: 'Ana', apellido: 'Ruiz' });
    expect(bloqueadoHasta(ahora)).toBeNull();
  });

  it('reconoce los errores que obligan a volver a entrar', () => {
    expect(esErrorDeAcceso('TOKEN_REVOCADO')).toBe(true);
    expect(esErrorDeAcceso('TOKEN_CADUCADO')).toBe(true);
    expect(esErrorDeAcceso('SERVIDOR_NO_DISPONIBLE')).toBe(false);
  });
});
