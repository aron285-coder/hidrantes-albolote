import type { ReactNode } from 'react';

/**
 * Por debajo de md, una tabla del panel pasa a filas apiladas, como las del Inventario (docs/28
 * RV-116): a 412 px la tabla de Voluntarios se desplazaba dentro de su caja y "Anonimizar…" quedaba
 * fuera, a la derecha. Sigue siendo una tabla para los lectores de pantalla: las cabeceras están,
 * ocultas a la vista, y cada dato lleva su etiqueta delante solo para los ojos.
 */
export function FilasApiladas({
  nombre,
  columnas,
  children,
}: {
  nombre: string;
  columnas: string[];
  children: ReactNode;
}) {
  return (
    <div role="table" aria-label={nombre} className="text-[13px]">
      <div role="row" className="sr-only">
        {columnas.map((c) => (
          <span key={c} role="columnheader">
            {c}
          </span>
        ))}
      </div>
      {children}
    </div>
  );
}

/** Una fila apilada: una tarjeta con los datos uno debajo de otro. */
export function FilaApilada({ children }: { children: ReactNode }) {
  return (
    <div role="row" className="border-linea bg-papel space-y-1.5 border-b px-3 py-3">
      {children}
    </div>
  );
}

/** Un dato de una fila apilada: la etiqueta delante y el valor, que parte donde haga falta. */
export function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div role="cell" className="flex min-w-0 items-baseline gap-2">
      <span aria-hidden className="text-texto-suave shrink-0">
        {etiqueta}
      </span>
      <span className="min-w-0 [overflow-wrap:anywhere]">{children}</span>
    </div>
  );
}
