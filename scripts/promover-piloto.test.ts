import { describe, expect, it } from 'vitest';
import {
  CONDICION_PUNTOS,
  PREFIJO_PRUEBA,
  SQL_GENERADOR,
  cuentaPorTabla,
  errorDePromocion,
  esDePruebas,
  esLocal,
  fotosDe,
  guionPromocion,
  informe,
  motivoCodigosEnConflicto,
  sqlCodigosEnConflicto,
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
    expect(SQL_GENERADOR.match(/on conflict (\(id\) )?do nothing/g)).toHaveLength(2);
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

// docs/18 RV-46: códigos en conflicto y puntos que no llegaban a los móviles.
describe('promoción sin conflictos ni puntos invisibles (RV-46)', () => {
  it('un código existente con otro id aborta y lo nombra', () => {
    expect(motivoCodigosEnConflicto(['HID-0007', 'BOC-0002'])).toMatch(/HID-0007.*BOC-0002/);
    expect(motivoCodigosEnConflicto([])).toBeNull();
  });

  it('la comprobación compara código e id contra producción', () => {
    const sql = sqlCodigosEnConflicto([{ id: '00000000-0000-4000-8000-000000000001', codigo: 'HID-0007' }]);
    expect(sql).toContain("('00000000-0000-4000-8000-000000000001'::uuid, 'HID-0007')");
    expect(sql).toContain('x.codigo = v.codigo and x.id <> v.id');
    expect(sqlCodigosEnConflicto([])).toBeNull();
  });

  it('el guion fija actualizado_en = now(): si no, las incrementales no los verían', () => {
    const puntos = SQL_GENERADOR.slice(SQL_GENERADOR.indexOf('insert into hidrantes.puntos'));
    const hastaValores = puntos.slice(0, puntos.indexOf('from elegidos p'));
    expect(hastaValores).toContain('now())');
    expect(hastaValores).not.toContain('p.actualizado_en');
    expect(SQL_GENERADOR).toContain('on conflict (id) do nothing;');
  });

  it('el guion incluye la época nueva, dentro de la transacción', () => {
    const guion = guionPromocion(['insert into hidrantes.puntos (id) values (1);']);
    expect(guion.startsWith('begin;')).toBe(true);
    const epoca = guion.indexOf("'epoca_datos', to_jsonb(gen_random_uuid()::text)");
    expect(epoca).toBeGreaterThan(guion.indexOf('insert into hidrantes.puntos'));
    expect(epoca).toBeLessThan(guion.lastIndexOf('commit;'));
    expect(guion).toContain("'promover-piloto.ts'");
  });
});

// docs/19 RV-53: una promoción fallida no escribe nombres de voluntarios en los logs de Actions.
describe('error de una promoción fallida (RV-53)', () => {
  const FALLO = [
    'psql:<stdin>:40: ERROR:  null value in column "autor_nombre" of relation "propuestas" violates not-null constraint',
    'DETAIL:  Failing row contains (0f1e2d3c-4b5a-4968-8776-6a5b4c3d2e1f, null, alta, {}, null, Pérez, d1, x, manual, Ana García).',
  ].join('\n');

  it('sin --detalle, ni en local: sin la fila', () => {
    const texto = errorDePromocion(FALLO, false);
    expect(texto).toContain('violates not-null constraint');
    for (const nombre of ['Pérez', 'Ana', 'García', 'Failing row contains (0f']) expect(texto).not.toContain(nombre);
  });

  it('con CI, nunca, aunque se pida --detalle', () => {
    const antes = process.env.CI;
    try {
      process.env.CI = '1';
      expect(errorDePromocion(FALLO, true)).not.toContain('Pérez');
      delete process.env.CI;
      expect(errorDePromocion(FALLO, true)).toContain('Pérez');
    } finally {
      if (antes === undefined) delete process.env.CI;
      else process.env.CI = antes;
    }
  });
});
