import { useNavigate } from 'react-router';
import { BarraEstado } from '@/componentes/mapa/BarraEstado';
import { ListaPuntos } from '@/componentes/mapa/ListaPuntos';

/** Pestaña Lista (FR-68): elegir un punto lleva al mapa con su ficha abierta (FR-69). */
export function Lista() {
  const navegar = useNavigate();
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <BarraEstado />
      <ListaPuntos alElegir={(id) => navegar(`/?p=${encodeURIComponent(id)}`)} />
    </div>
  );
}
