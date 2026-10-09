// docs/33 RV-335 (U13): Salud del sistema en palabras, con un resumen arriba.

import { describe, expect, it } from 'vitest';
import type { Salud } from './ajustes';
import { atencionSalud, filasSalud, nombreTarea, tareasVisibles } from './salud';
import { T } from '../textos';

const MB = 1024 ** 2;
const ahora = new Date('2026-10-09T10:00:00Z');
const haceH = (h: number) => new Date(ahora.getTime() - h * 3_600_000).toISOString();

/** Una salud sin nada que vigilar, con los datos de 0041. */
const BIEN: Salud = {
  pendientes_14d: 2,
  errores_7d: 1,
  sin_direccion: 3,
  ultimo_respaldo: haceH(20),
  storage_bytes: 112 * MB,
  version_zona: '2026-07-14',
  version_mapabase: '2026-07-14',
  version_callejero: '2026-07-14',
  ultima_vigilancia: haceH(1),
  vigilancia_ok: true,
  dispositivos_activos: 61,
  intentos_fallidos_24h: 0,
  topes_alcanzados_24h: 0,
  topes_globales_24h: 0,
  bd_bytes: 300 * MB,
  esquema_bytes: 38 * MB,
  tareas: [
    { tarea: 'hidrantes_purgar_errores', ultima: haceH(2), fallo: false, problema: false },
    { tarea: 'hidrantes_resumen_semanal', ultima: null, fallo: false, problema: false },
    { tarea: 'hidrantes_purgar_papelera', ultima: haceH(6), fallo: false, problema: false },
  ],
  fotos_bytes: 112 * MB,
  fotos_origen: 'storage',
  max_bytes_fotos: 800 * MB,
  fotos_pct: 14,
  max_bytes_bd: 400 * MB,
  bd_pct: 75,
};

const etiquetas = (s: Salud) => filasSalud(s, 'produccion', ahora).map((f) => f.etiqueta);
const fila = (s: Salud, etiqueta: string, entorno: 'produccion' | 'staging' = 'produccion') =>
  filasSalud(s, entorno, ahora).find((f) => f.etiqueta === etiqueta);

describe('Salud: lo que queda, con nombres en palabras (RV-335)', () => {
  it('las filas, en este orden', () => {
    expect(etiquetas(BIEN)).toEqual([
      T.panelAjustes.fotos,
      T.panelAjustes.baseDeDatos,
      T.panelAjustes.ultimoRespaldo,
      T.panelAjustes.ultimaVigilancia,
      T.panelAjustes.errores7,
      T.panelAjustes.dispositivosActivos,
      T.panelAjustes.intentosFallidos24h,
      T.panelAjustes.zonaYMapaBase,
    ]);
    expect(T.panelAjustes.fotos).toBe('Fotos');
    expect(T.panelAjustes.zonaYMapaBase).toBe('Zona y mapa base');
  });

  it('fuera: pendientes de 14 días, sin dirección, callejero y los topes de intentos', () => {
    const textos = filasSalud(BIEN, 'produccion', ahora).flatMap((f) => [f.etiqueta, f.valor]);
    for (const fuera of ['Propuestas pendientes', 'Puntos sin dirección', 'Callejero', 'Entradas bloqueadas']) {
      expect(
        textos.some((t) => t.includes(fuera)),
        fuera,
      ).toBe(false);
    }
  });

  it('fotos: MB de 800 con barra; base de datos: los MB del esquema de 400, con barra', () => {
    const fotos = fila(BIEN, T.panelAjustes.fotos)!;
    expect(fotos.valor).toBe(T.panelAjustes.espacioDe('112', '800'));
    expect(fotos.valor).toBe('112 MB de 800 MB');
    expect(fotos.barra).toBe(14);
    expect(fotos.aviso).toBe(false);
    const bd = fila(BIEN, T.panelAjustes.baseDeDatos)!;
    // Del esquema (RV-301), no de toda la base compartida con uniformidad.
    expect(bd.valor).toBe('38 MB de 400 MB');
    expect(bd.barra).toBeCloseTo(9.5, 1);
    expect(bd.aviso).toBe(false);
  });

  it('fotos medidas en el último respaldo: se dice', () => {
    expect(fila({ ...BIEN, fotos_origen: 'respaldo' }, T.panelAjustes.fotos)!.valor).toBe(
      T.panelAjustes.espacioSegunRespaldo('112 MB de 800 MB'),
    );
  });

  it('sin los datos de 0041: como antes, sin barra y sin romper', () => {
    const viejo = {
      ...BIEN,
      fotos_bytes: undefined,
      fotos_origen: undefined,
      max_bytes_fotos: undefined,
      fotos_pct: undefined,
      max_bytes_bd: undefined,
      bd_pct: undefined,
      esquema_bytes: undefined,
    } as Salud;
    expect(fila(viejo, T.panelAjustes.fotos)!.valor).toBe('112,0 MB');
    expect(fila(viejo, T.panelAjustes.fotos)!.barra).toBeUndefined();
    expect(fila(viejo, T.panelAjustes.baseDeDatos)!.valor).toBe('300 MB de 500 MB');
    expect(fila({ ...viejo, storage_bytes: null }, T.panelAjustes.fotos, 'staging')!.valor).toBe(
      T.panelAjustes.almacenamientoNoAplica,
    );
    expect(fila({ ...viejo, bd_bytes: undefined }, T.panelAjustes.baseDeDatos)!.valor).toBe(T.panelAjustes.sinDato);
    // Sin intentos (base anterior a 0015): 0.
    expect(fila({ ...viejo, intentos_fallidos_24h: undefined }, T.panelAjustes.intentosFallidos24h)!.valor).toBe('0');
  });

  it('zona y mapa base: una fecha si coinciden, las dos si no', () => {
    expect(fila(BIEN, T.panelAjustes.zonaYMapaBase)!.valor).toBe('14 jul 2026');
    expect(fila({ ...BIEN, version_mapabase: '2026-08-01' }, T.panelAjustes.zonaYMapaBase)!.valor).toBe(
      '14 jul 2026 · 1 ago 2026',
    );
    expect(fila({ ...BIEN, version_zona: null, version_mapabase: null }, T.panelAjustes.zonaYMapaBase)!.valor).toBe(
      T.panelAjustes.sinDato,
    );
  });

  it('en staging, el respaldo no aplica; en producción, sin respaldo, "todavía ninguno"', () => {
    expect(fila({ ...BIEN, ultimo_respaldo: null }, T.panelAjustes.ultimoRespaldo, 'staging')!.valor).toBe(
      T.panelAjustes.respaldoNoAplica,
    );
    expect(fila({ ...BIEN, ultimo_respaldo: null }, T.panelAjustes.ultimoRespaldo)!.valor).toBe(T.panelAjustes.nunca);
  });
});

describe('Salud: el resumen de arriba (RV-335)', () => {
  const sinBd = { ...BIEN, bd_pct: 9.5 };

  it('nada que vigilar: lista vacía ("Todo bien")', () => {
    expect(atencionSalud(sinBd, 'produccion', ahora)).toEqual([]);
    expect(T.panelAjustes.todoBien).toBe('Todo bien');
  });

  it('el respaldo de más de 8 días, o ninguno en producción', () => {
    expect(atencionSalud({ ...sinBd, ultimo_respaldo: haceH(9 * 24) }, 'produccion', ahora)).toEqual([
      T.panelAjustes.atencionRespaldoViejo('hace 9 días'),
    ]);
    expect(atencionSalud({ ...sinBd, ultimo_respaldo: haceH(7 * 24) }, 'produccion', ahora)).toEqual([]);
    expect(atencionSalud({ ...sinBd, ultimo_respaldo: null }, 'produccion', ahora)).toEqual([
      T.panelAjustes.atencionSinRespaldo,
    ]);
    // En staging no se respalda (RV-78): no es un problema.
    expect(atencionSalud({ ...sinBd, ultimo_respaldo: null }, 'staging', ahora)).toEqual([]);
  });

  it('la vigilancia sin pasar o con avisos', () => {
    expect(atencionSalud({ ...sinBd, ultima_vigilancia: haceH(27) }, 'produccion', ahora)).toEqual([
      T.panelAjustes.atencionVigilancia,
    ]);
    expect(atencionSalud({ ...sinBd, vigilancia_ok: false }, 'produccion', ahora)).toEqual([
      T.panelAjustes.atencionVigilanciaAvisos,
    ]);
  });

  it('el espacio por encima del 70 %: fotos y base de datos', () => {
    expect(atencionSalud({ ...sinBd, fotos_pct: 72.4 }, 'produccion', ahora)).toEqual([
      T.panelAjustes.espacioFotosLleno(72),
    ]);
    // La base de datos con los MB del esquema: 300 de 400 = 75 %.
    expect(atencionSalud({ ...sinBd, esquema_bytes: 300 * MB }, 'produccion', ahora)).toEqual([
      T.panelAjustes.atencionBaseDeDatos(75),
    ]);
  });

  it('una tarea programada que falla o falta, con su nombre en palabras', () => {
    const tareas = [
      ...(BIEN.tareas ?? []),
      { tarea: 'hidrantes_purgar_subidas', ultima: haceH(50), fallo: true, problema: true },
    ];
    expect(atencionSalud({ ...sinBd, tareas }, 'produccion', ahora)).toEqual([
      T.panelAjustes.atencionTarea(T.panelAjustes.nombresTareas.hidrantes_purgar_subidas),
    ]);
  });
});

describe('Salud: tareas programadas en palabras (RV-335)', () => {
  it('sin "Resumen semanal" ni "Borrar errores viejos": siguen funcionando, pero no salen', () => {
    expect(tareasVisibles(BIEN).map((t) => t.tarea)).toEqual(['hidrantes_purgar_papelera']);
    // Aunque fallen: de eso avisa la vigilancia.
    const fallan = (BIEN.tareas ?? []).map((t) => ({ ...t, problema: true }));
    expect(atencionSalud({ ...BIEN, bd_pct: 9.5, tareas: fallan }, 'produccion', ahora)).toEqual([
      T.panelAjustes.atencionTarea(T.panelAjustes.nombresTareas.hidrantes_purgar_papelera),
    ]);
    expect(tareasVisibles({ ...BIEN, tareas: null })).toEqual([]);
  });

  it('cada tarea con su nombre; una desconocida, con el suyo sin el prefijo', () => {
    expect(nombreTarea('hidrantes_purgar_intentos')).toBe('Borrar intentos de código viejos (cada hora)');
    expect(nombreTarea('hidrantes_purgar_papelera')).toBe('Vaciar lo caducado de la papelera (cada día)');
    expect(nombreTarea('hidrantes_algo_nuevo')).toBe('algo_nuevo');
  });
});
