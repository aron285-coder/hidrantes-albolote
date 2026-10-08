// docs/30 RV-128: la pila de ventanas modales y el `inert` del resto. Vitest corre en Node, sin DOM:
// un doble con lo que usa foco-modal (hijos, padre y atributos). El Tab de verdad lo cubre
// e2e/inventario-editar.spec.ts.

import { afterEach, describe, expect, it } from 'vitest';
import { FUERA_DE_MODAL, activarModal } from './foco-modal';

class Nodo {
  parentElement: Nodo | null = null;
  children: Nodo[] = [];
  private atributos = new Map<string, string>();
  constructor(readonly nombre: string) {}
  hasAttribute(a: string) {
    return this.atributos.has(a);
  }
  setAttribute(a: string, v: string) {
    this.atributos.set(a, v);
  }
  removeAttribute(a: string) {
    this.atributos.delete(a);
  }
  get inert() {
    return this.hasAttribute('inert');
  }
  /** Añade un hijo al final, como hace un portal al abrirse. */
  poner(nombre: string) {
    const h = new Nodo(nombre);
    h.parentElement = this;
    this.children.push(h);
    return h;
  }
  quitar(h: Nodo) {
    this.children = this.children.filter((x) => x !== h);
    h.parentElement = null;
  }
}

const el = (n: Nodo) => n as unknown as Element;

describe('useModal / activarModal (RV-128)', () => {
  let cerrar: (() => void)[] = [];
  const activar = (n: Nodo, body: Nodo) => {
    const c = activarModal(el(n), el(body));
    cerrar.push(c);
    return c;
  };
  afterEach(() => {
    cerrar.forEach((c) => c());
    cerrar = [];
  });

  it('con una ventana, #raiz queda inert y la ventana no', () => {
    const body = new Nodo('body');
    const raiz = body.poner('raiz');
    const ventana = body.poner('ventana');
    const caja = ventana.poner('caja');
    activar(caja, body); // desde dentro: sube hasta el hijo de body
    expect(raiz.inert).toBe(true);
    expect(ventana.inert).toBe(false);
    expect(caja.inert).toBe(false);
  });

  it('con dos apiladas, la de abajo queda inert; al cerrar la de arriba, vuelve y #raiz sigue inert', () => {
    const body = new Nodo('body');
    const raiz = body.poner('raiz');
    const editar = body.poner('editar');
    activar(editar, body);
    const retirar = body.poner('retirar');
    const cerrarRetirar = activar(retirar, body);
    expect(raiz.inert).toBe(true);
    expect(editar.inert).toBe(true);
    expect(retirar.inert).toBe(false);

    cerrarRetirar();
    body.quitar(retirar);
    expect(editar.inert).toBe(false);
    expect(raiz.inert).toBe(true);
  });

  it('al cerrar todas no queda ningún inert', () => {
    const body = new Nodo('body');
    const raiz = body.poner('raiz');
    const a = body.poner('a');
    const b = body.poner('b');
    const ca = activar(a, body);
    const cb = activar(b, body);
    cb();
    ca();
    expect([raiz, a, b].map((n) => n.inert)).toEqual([false, false, false]);
  });

  it('un elemento que ya era inert lo sigue siendo, abierta y cerrada la ventana', () => {
    const body = new Nodo('body');
    const raiz = body.poner('raiz');
    const ajeno = body.poner('ajeno');
    ajeno.setAttribute('inert', '');
    const ventana = body.poner('ventana');
    const c = activar(ventana, body);
    expect(ajeno.inert).toBe(true);
    c();
    expect(ajeno.inert).toBe(true);
    expect(raiz.inert).toBe(false);
  });

  it('la de arriba es la que va después en <body>, aunque se active antes (cambio de forma sin cerrar)', () => {
    const body = new Nodo('body');
    const raiz = body.poner('raiz');
    const editar = body.poner('editar'); // al lado de la tabla: aún no es modal
    const retirar = body.poner('retirar');
    activar(retirar, body);
    expect(editar.inert).toBe(true);
    const cerrarEditar = activar(editar, body); // gira la tableta: Editar pasa a velo
    expect(editar.inert).toBe(true);
    expect(retirar.inert).toBe(false);
    cerrarEditar(); // vuelve a ir al lado de la tabla
    expect(editar.inert).toBe(true); // Retirar sigue encima
    expect(raiz.inert).toBe(true);
  });

  it('el aviso del panel (FUERA_DE_MODAL) no se inertiza', () => {
    const body = new Nodo('body');
    const aviso = body.poner('aviso');
    aviso.setAttribute(FUERA_DE_MODAL, '');
    const ventana = body.poner('ventana');
    activar(ventana, body);
    expect(aviso.inert).toBe(false);
  });

  it('desactivar dos veces no quita la ventana de otro (StrictMode)', () => {
    const body = new Nodo('body');
    const raiz = body.poner('raiz');
    const ventana = body.poner('ventana');
    const primera = activar(ventana, body);
    primera();
    activar(ventana, body);
    primera();
    expect(raiz.inert).toBe(true);
  });

  it('fuera de <body> no hace nada', () => {
    const body = new Nodo('body');
    const raiz = body.poner('raiz');
    const suelto = new Nodo('suelto');
    activar(suelto, body);
    expect(raiz.inert).toBe(false);
  });
});
