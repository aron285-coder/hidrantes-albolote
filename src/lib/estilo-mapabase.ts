// Estilo claro y oscuro del mapa base propio, con los colores de 06 §2.3. Es el único sitio donde
// se tocan: se parte de los estilos de Protomaps y se sustituyen fondo, manzanas, calles, verdes,
// agua y rótulos.

import { type Flavor, namedFlavor } from '@protomaps/basemaps';

const CLARO = {
  fondo: '#EFECE3',
  manzanas: '#E2DED3',
  calles: '#FFFFFF',
  verdes: '#D3E0C6',
  arboles: '#BACFA8',
  agua: '#B9CBD6',
  rotulos: '#8A9090',
  limite: { color: '#28517F', opacidad: 0.45 },
};

const OSCURO = {
  fondo: '#1B2536',
  manzanas: '#25314A',
  calles: '#3B4A64',
  verdes: '#233A2E',
  arboles: '#2E4A38',
  agua: '#2C4358',
  rotulos: '#7E8A99',
  limite: { color: '#7FA3D6', opacidad: 0.55 },
};

export type Modo = 'claro' | 'oscuro';

/** Límite de la zona de cobertura: discontinuo `9 7` (06 §2.3). */
export const estiloLimite = (modo: Modo) => {
  const p = modo === 'oscuro' ? OSCURO : CLARO;
  return { color: p.limite.color, opacity: p.limite.opacidad, weight: 2, dashArray: '9 7', fill: false };
};

export function estiloMapabase(modo: Modo): Flavor {
  const p = modo === 'oscuro' ? OSCURO : CLARO;
  const base = namedFlavor(modo === 'oscuro' ? 'dark' : 'light');
  const calles = {
    other: p.calles,
    minor_service: p.calles,
    minor_a: p.calles,
    minor_b: p.calles,
    link: p.calles,
    major: p.calles,
    highway: p.calles,
    bridges_other: p.calles,
    bridges_minor: p.calles,
    bridges_link: p.calles,
    bridges_major: p.calles,
    bridges_highway: p.calles,
  };
  return {
    ...base,
    ...calles,
    background: p.fondo,
    earth: p.fondo,
    buildings: p.manzanas,
    park_a: p.verdes,
    park_b: p.verdes,
    wood_a: p.arboles,
    wood_b: p.arboles,
    scrub_a: p.verdes,
    scrub_b: p.verdes,
    water: p.agua,
    roads_label_minor: p.rotulos,
    roads_label_major: p.rotulos,
    roads_label_minor_halo: p.fondo,
    roads_label_major_halo: p.fondo,
    subplace_label_halo: p.fondo,
    city_label_halo: p.fondo,
    address_label_halo: p.fondo,
    // Las fuentes del propio despliegue (06 §3); sin fuentes remotas.
    regular: 'Source Sans 3',
    bold: 'Source Sans 3',
    italic: 'Source Sans 3',
  };
}
