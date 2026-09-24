import { type Simbolo, svgMarcador } from '@/lib/simbologia';

/** El mismo marcador del mapa, para listas, ficha y leyenda. */
export function MarcadorSvg({ punto, tamano = 24 }: { punto: Simbolo; tamano?: number }) {
  return (
    <span
      className="inline-flex shrink-0"
      style={{ width: tamano, height: tamano }}
      aria-hidden
      dangerouslySetInnerHTML={{ __html: svgMarcador(punto, { tamano }) }}
    />
  );
}
