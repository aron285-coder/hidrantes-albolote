import { describe, expect, it } from 'vitest';
import {
  CONDICION_PUNTOS,
  PREFIJO_PRUEBA,
  SQL_GENERADOR,
  cuentaPorTabla,
  esDePruebas,
  esLocal,
  fotosDe,
  informe,
} from './promover-piloto.ts';

describe('qué sube y qué no', () => {
  it('lo del seed se queda en staging', () => {
    expect(esDePruebas(`${PREFIJO_PRUEBA} Junto al ayuntamiento`)).toBe(true);
    expect(esDePruebas('Junto al ayuntamiento')).toBe(false);
    expect(esDePruebas(null)).toBe(false);
  });

  it('solo puntos activos: los retirados y los de la papelera no se promueven', () => {
    expect(CONDICION_PUNTOS).toContain("situacion = 'activo'");
    expect(CONDICION_PUNTOS).toContain(PREFIJO_PRUEBA);
  });
});

describe('el guion que se genera', () => {
  it('conserva los códigos y los identificadores, que es de lo que va esto', () => {
    expect(SQL_GENERADOR).toContain('insert into hidrantes.puntos (id, codigo,');
    expect(SQL_GENERADOR).not.toMatch(/fn_siguiente_codigo/);
  });

  it('se puede pasar dos veces: cada tabla trae su guarda', () => {
    // puntos y propuestas conservan su id; registro lo genera, así que va por "no existe ya".
    expect(SQL_GENERADOR.match(/on conflict do nothing/g)).toHaveLength(2);
    expect(SQL_GENERADOR).toContain('where not exists (select 1 from hidrantes.registro x');
  });

  it('se lleva también el alta, que no guarda punto_id', () => {
    // El check propuestas_alta_sin_punto obliga a punto_id nulo en las altas: el vínculo con el
    // punto creado está en correcciones->>'punto_id'.
    expect(SQL_GENERADOR).toContain("(r.correcciones ->> 'punto_id')::uuid in (select id from elegidos)");
  });

  it('y el registro de esas propuestas, aunque no cuelgue de un punto', () => {
    expect(SQL_GENERADOR).toContain('or g.propuesta_id in (select id from suyas)');
  });

  it('nunca toca el esquema public', () => {
    expect(SQL_GENERADOR).not.toMatch(/\bpublic\./);
  });
});

describe('informe', () => {
  const sentencias = [
    "insert into hidrantes.puntos (id, codigo) values ('1', 'HID-0007');",
    "insert into hidrantes.puntos (id, codigo) values ('2', 'BOC-0003');",
    "insert into hidrantes.propuestas (id, foto_path) values ('3', 'fotos/a1.jpg');",
    "insert into hidrantes.registro (momento) select '2026-09-20';",
  ];

  it('cuenta lo que va a cada tabla', () => {
    expect(cuentaPorTabla(sentencias)).toEqual({ puntos: 2, propuestas: 1, registro: 1 });
  });

  it('saca las fotos que hay que copiar, sin repetirlas', () => {
    expect(fotosDe([...sentencias, "insert into hidrantes.puntos (foto_path) values ('fotos/a1.jpg');"])).toEqual([
      'fotos/a1.jpg',
    ]);
  });

  it('el ensayo se lee distinto que la promoción de verdad', () => {
    const c = { puntos: 2, propuestas: 1, registro: 1 };
    expect(informe(c, { copiadas: 3, ya: 0 }, true)).toContain('Se promoverían');
    expect(informe(c, { copiadas: 3, ya: 1 }, false)).toContain('Fotos copiadas: 3 (1 ya estaban)');
  });
});

describe('a dónde se puede escribir', () => {
  it('una base del propio ordenador es la del ensayo, no producción de nadie', () => {
    expect(esLocal('postgresql://postgres:postgres@127.0.0.1:55422/ensayo')).toBe(true);
    expect(esLocal('postgresql://u:c@localhost:5432/postgres')).toBe(true);
  });

  it('cualquier proyecto de Supabase, no', () => {
    expect(esLocal('postgresql://hidrantes_migrador.abc:c@aws-0-eu-west-3.pooler.supabase.com:5432/postgres')).toBe(
      false,
    );
    expect(esLocal('no es una url')).toBe(false);
  });
});
