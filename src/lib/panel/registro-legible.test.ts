// docs/30 RV-127 (DEC-171): el detalle del Registro dice qué cambió, con palabras.

import { describe, expect, it } from 'vitest';
import type { EntradaRegistro } from './inventario';
import { detalleLegible } from './registro-legible';

/** Un punto como lo deja fn_punto_json en `antes`/`despues` (0005, 0035). */
const PUNTO = {
  id: '11111111-1111-1111-1111-111111111111',
  codigo: 'BOC-0001',
  tipo: 'boca_riego',
  diametro_mm: 45,
  caudal: 'no_funciona',
  racor: 'granada',
  descripcion_fallo: 'Tapa soldada',
  descripcion: null,
  direccion: 'Calle Real 3',
  foto_path: 'puntos/abc.webp',
  foto_sitio_path: null,
  municipio: 'albolote',
  nucleo: 'Barrio Seco',
  situacion: 'activo',
  fecha_ultima_revision: '2026-09-01',
  creado_en: '2026-01-01T10:00:00Z',
  actualizado_en: '2026-09-01T10:00:00Z',
  borrado_en: null,
  lat: 37.23,
  lng: -3.65,
};

const entrada = (e: Partial<EntradaRegistro>): EntradaRegistro => ({
  id: 1,
  momento: '2026-10-05T10:00:00Z',
  actor: 'jefe@example.org',
  es_admin: true,
  accion: 'edicion_admin',
  codigo: 'BOC-0001',
  resumen: '',
  antes: null,
  despues: null,
  ...e,
});

const edicion = (cambios: Record<string, unknown>) =>
  entrada({
    antes: PUNTO,
    despues: { ...PUNTO, actualizado_en: '2026-10-05T10:00:00Z', ...cambios },
  });

describe('detalleLegible · edición con el punto entero en antes y después', () => {
  it('solo salen los campos que cambian, con nombres y valores en palabras', () => {
    const d = detalleLegible(edicion({ caudal: 'regular', racor: 'directo', descripcion_fallo: null }));
    expect(d).toBe('Estado: No funciona → Regular · Enganche: Granada → Directo · Fallo: Tapa soldada → —');
    expect(d).not.toMatch(/actualizado_en|codigo|caudal|racor/);
  });

  it('con desplazamiento_m sale "Movido 6,2 m" y nunca lat ni lng', () => {
    const d = detalleLegible(
      edicion({ caudal: 'regular', racor: 'directo', lat: 37.23005, lng: -3.65001, desplazamiento_m: 6.2 }),
    );
    expect(d).toBe('Estado: No funciona → Regular · Enganche: Granada → Directo · Movido 6,2 m');
    expect(d).not.toMatch(/lat|lng|desplazamiento/);
  });

  it('sin desplazamiento_m pero con otra posición, la distancia se calcula', () => {
    // 0,0001° de latitud son unos 11,1 m.
    expect(detalleLegible(edicion({ lat: 37.2301 }))).toBe('Movido 11,1 m');
  });

  it('calculado y por debajo de 0,5 m, no sale nada del movimiento', () => {
    const calculado = detalleLegible(edicion({ caudal: 'bueno', lat: 37.230001 }));
    expect(calculado).toBe('Estado: No funciona → Bueno');
  });

  it('el desplazamiento que anotó la base de datos sale siempre, aunque sea pequeño', () => {
    const d = detalleLegible(edicion({ caudal: 'bueno', lat: 37.230001, desplazamiento_m: 0.1 }));
    expect(d).toBe('Estado: No funciona → Bueno · Movido 0,1 m');
  });

  it('un movimiento redondo se lee sin decimales', () => {
    expect(detalleLegible(edicion({ lat: 37.2301, desplazamiento_m: 12 }))).toBe('Movido 12 m');
  });

  it('el resto de campos, en su orden y con su formato', () => {
    const d = detalleLegible(
      edicion({
        tipo: 'hidrante',
        diametro_mm: 70,
        direccion: 'Calle Nueva 1',
        descripcion: 'Junto al colegio',
        nucleo: 'Albolote',
        fecha_ultima_revision: '2026-10-05',
        foto_path: 'puntos/otra.webp',
        foto_sitio_path: 'sitios/una.webp',
        situacion: 'retirado',
        codigo: 'BOC-0002',
      }),
    );
    expect(d).toBe(
      [
        'Diámetro: 45 mm → 70 mm',
        'Tipo: Boca de riego → Hidrante',
        'Dirección: Calle Real 3 → Calle Nueva 1',
        'Descripción: — → Junto al colegio',
        'Núcleo: Barrio Seco → Albolote',
        'Última revisión: 1 sept 2026 → 5 oct 2026',
        'Foto: cambiada',
        'Foto del sitio: cambiada',
        'Situación: Activo → Retirado',
        'Código: BOC-0001 → BOC-0002',
      ].join(' · '),
    );
    expect(d).not.toMatch(/webp|puntos\//);
  });

  it('un racor que esta versión no conoce se lee "Otro"', () => {
    expect(detalleLegible(edicion({ racor: 'storz' }))).toBe('Enganche: Granada → Otro');
  });

  it('un texto largo se recorta a 60 caracteres con "…"', () => {
    const largo = 'a'.repeat(80);
    const d = detalleLegible(edicion({ descripcion: largo }));
    const valor = d.split(' → ')[1]!;
    expect(valor).toHaveLength(60);
    expect(valor.endsWith('…')).toBe(true);
  });

  it('un valor vacío o nulo se lee "—"', () => {
    expect(detalleLegible(edicion({ direccion: '' }))).toBe('Dirección: Calle Real 3 → —');
    expect(detalleLegible(edicion({ direccion: null }))).toBe('Dirección: Calle Real 3 → —');
    expect(detalleLegible(edicion({ direccion: '   ' }))).toBe('Dirección: Calle Real 3 → —');
  });

  it('las claves que no le dicen nada a jefatura no salen nunca', () => {
    const d = detalleLegible(
      edicion({
        caudal: 'malo',
        id: 'otro',
        creado_en: 'x',
        municipio: 'calicasas',
        revision_caducada: true,
        borrado_en: '2026-10-05',
        borrado_por: 'otro@example.org',
        punto_id: 'p',
      }),
    );
    expect(d).toBe('Estado: No funciona → Malo');
  });

  it('una clave que no está en la tabla se enseña con su nombre', () => {
    expect(detalleLegible(edicion({ prioridad: 'alta' }))).toBe('prioridad: alta');
  });

  it('un borrado: la situación y el motivo', () => {
    const d = detalleLegible(
      entrada({ accion: 'borrado', antes: PUNTO, despues: { situacion: 'borrado', motivo: 'Duplicado de BOC-0002' } }),
    );
    expect(d).toBe('Situación: Activo → Borrado · Motivo: Duplicado de BOC-0002');
  });

  it('una fecha de revisión no se corre de día por el huso horario', () => {
    expect(detalleLegible(edicion({ fecha_ultima_revision: '2026-12-31' }))).toBe(
      'Última revisión: 1 sept 2026 → 31 dic 2026',
    );
    expect(detalleLegible(edicion({ fecha_ultima_revision: '2026-01-01' }))).toBe(
      'Última revisión: 1 sept 2026 → 1 ene 2026',
    );
  });

  it('dos puntos enteros sin cambios visibles: "Sin cambios en los datos", no la lista de claves', () => {
    const e = edicion({});
    e.resumen = 'edicion_admin · BOC-0001 · actualizado_en, caudal, codigo';
    expect(detalleLegible(e)).toBe('Sin cambios en los datos');
  });
});

describe('detalleLegible · valores frecuentes en palabras', () => {
  it('un booleano se lee "sí" o "no"', () => {
    const d = detalleLegible(
      entrada({ accion: 'codigo_cambiado', codigo: null, despues: { revocar_dispositivos: true } }),
    );
    expect(d).toBe('revocar_dispositivos: sí');
    expect(
      detalleLegible(entrada({ accion: 'codigo_cambiado', codigo: null, despues: { revocar_dispositivos: false } })),
    ).toBe('revocar_dispositivos: no');
  });

  it('la operación de una propuesta, con el nombre de la cola, y una foto anidada sin su ruta', () => {
    const d = detalleLegible(
      entrada({
        accion: 'propuesta_creada',
        despues: { operacion: 'estado', datos: { caudal: 'malo', foto_path: 'propuestas/x.webp' } },
      }),
    );
    expect(d).toBe('datos: Estado: Malo, Foto: adjunta · operacion: Estado');
    expect(d).not.toMatch(/webp|propuestas\//);
  });

  it('una exportación filtrada por revisión caducada conserva el filtro', () => {
    const d = detalleLegible(
      entrada({
        accion: 'exportacion',
        codigo: null,
        despues: { filtros: { tipo: 'hidrante', revision_caducada: true }, filas: 4 },
      }),
    );
    expect(d).toBe('filas: 4 · filtros: Tipo: Hidrante, revision_caducada: sí');
  });
});

describe('detalleLegible · solo después', () => {
  it('un alta: el resumen del punto', () => {
    expect(detalleLegible(entrada({ accion: 'aprobacion', despues: { ...PUNTO, caudal: 'bueno' } }))).toBe(
      'Boca de riego · 45 mm · Bueno · Barrio Seco',
    );
  });

  it('un punto sin núcleo no deja un hueco', () => {
    const hidrante = { ...PUNTO, tipo: 'hidrante', diametro_mm: 100, racor: null, caudal: 'regular', nucleo: null };
    expect(detalleLegible(entrada({ accion: 'aprobacion', despues: hidrante }))).toBe('Hidrante · 100 mm · Regular');
  });

  it('config_cambiada: cada clave con su valor', () => {
    const d = detalleLegible(
      entrada({
        accion: 'config_cambiada',
        codigo: null,
        antes: { dias_papelera: 30 },
        despues: { dias_papelera: 45, escala_radios: [5, 10, 15, 20, 25] },
      }),
    );
    expect(d).toBe('dias_papelera: 30 → 45 · escala_radios: 5, 10, 15, 20, 25');
  });

  it('una restauración: la clave con su nombre', () => {
    expect(detalleLegible(entrada({ accion: 'restauracion', despues: { situacion: 'activo' } }))).toBe(
      'Situación: Activo',
    );
  });

  it('un rechazo: el motivo', () => {
    expect(detalleLegible(entrada({ accion: 'rechazo', despues: { motivo: 'Foto de otro punto' } }))).toBe(
      'Motivo: Foto de otro punto',
    );
  });
});

describe('detalleLegible · solo antes', () => {
  it('una purga: qué punto era, con su código y su tipo', () => {
    // El punto ya no existe: v_registro no trae el código (left join), solo lo tiene `antes`.
    expect(detalleLegible(entrada({ accion: 'purga_papelera', codigo: null, antes: PUNTO }))).toBe(
      'Código: BOC-0001 · Boca de riego',
    );
  });

  it('con un motivo, también el motivo', () => {
    expect(detalleLegible(entrada({ accion: 'purga_papelera', antes: { ...PUNTO, motivo: 'Caducado' } }))).toBe(
      'Código: BOC-0001 · Boca de riego · Motivo: Caducado',
    );
  });

  it('sin código ni tipo, "—"', () => {
    expect(detalleLegible(entrada({ accion: 'purga_papelera', antes: { nucleo: 'Albolote' } }))).toBe('—');
  });
});

describe('detalleLegible · privacidad (FR-27)', () => {
  it('dispositivo_id, autor_nombre, autor_apellido y actor nunca aparecen', () => {
    const casos = [
      entrada({
        accion: 'anonimizacion',
        codigo: null,
        despues: { dispositivo_id: 'abcd-1234', propuestas: 3, registro: 5 },
      }),
      entrada({
        accion: 'propuesta_creada',
        despues: {
          operacion: 'revision',
          autor_nombre: 'Nombrevoluntario',
          autor_apellido: 'Apellidovoluntario',
          actor: 'Actorvoluntario',
          datos: { caudal: 'bueno', autor_nombre: 'Nombrevoluntario', dispositivo_id: 'abcd-1234' },
        },
      }),
      edicion({ autor_nombre: 'Nombrevoluntario', actor: 'Actorvoluntario', dispositivo_id: 'abcd-1234' }),
      entrada({ antes: { autor_nombre: 'Nombrevoluntario' }, despues: null }),
    ];
    for (const e of casos) {
      const d = detalleLegible(e);
      expect(d).not.toMatch(/abcd-1234|dispositivo|Nombrevoluntario|Apellidovoluntario|Actorvoluntario|autor|actor/);
    }
    expect(detalleLegible(casos[0]!)).toBe('propuestas: 3 · registro: 5');
    expect(detalleLegible(casos[1]!)).toBe('datos: Estado: Bueno · operacion: Revisión');
  });

  it('ni en el resumen de respaldo', () => {
    const e = entrada({
      accion: 'anonimizacion',
      codigo: null,
      resumen: 'anonimizacion · autor_nombre, dispositivo_id',
      despues: { dispositivo_id: 'abcd-1234' },
    });
    expect(detalleLegible(e)).toBe('—');
  });
});

describe('detalleLegible · nada que enseñar', () => {
  it('sin antes ni después: el resumen sin "acción · código"', () => {
    expect(
      detalleLegible(
        entrada({ accion: 'edicion_admin', codigo: 'BOC-0001', resumen: 'edicion_admin · BOC-0001 · nota' }),
      ),
    ).toBe('nota');
    expect(
      detalleLegible(entrada({ accion: 'workflow_lanzado', codigo: null, resumen: 'workflow_lanzado · workflow' })),
    ).toBe('workflow');
  });

  it('sin cambios visibles fuera de un punto: el resumen sin el prefijo y sin las claves técnicas', () => {
    const e = entrada({
      accion: 'config_cambiada',
      codigo: null,
      resumen: 'config_cambiada · actualizado_en, dias_papelera',
      antes: { dias_papelera: 30 },
      despues: { dias_papelera: 30 },
    });
    expect(detalleLegible(e)).toBe('dias_papelera');
  });

  it('si tampoco queda nada, "—"', () => {
    expect(detalleLegible(entrada({ resumen: 'edicion_admin · BOC-0001' }))).toBe('—');
    expect(detalleLegible(entrada({ resumen: '' }))).toBe('—');
  });
});
