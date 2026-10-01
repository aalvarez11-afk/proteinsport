/**
 * carrito.js — Carrito de compras de Protein Sport Cali
 *
 * Guarda el pedido en el navegador del cliente (localStorage), así que
 * si cierra la página y vuelve más tarde, su pedido sigue ahí.
 *
 * Cada renglón del carrito es un producto + talla + color concretos:
 * una proteína de 2 lb y la misma de 5 lb son dos renglones.
 */

const Carrito = (() => {

  const CLAVE = 'proteinsport_carrito_v1';
  let renglones = [];
  const suscriptores = [];

  // ── Persistencia ───────────────────────────────────────────

  function cargar() {
    try {
      renglones = JSON.parse(localStorage.getItem(CLAVE)) || [];
      if (!Array.isArray(renglones)) renglones = [];
    } catch { renglones = []; }
    return renglones;
  }

  function guardar() {
    try { localStorage.setItem(CLAVE, JSON.stringify(renglones)); }
    catch { /* modo incógnito: el carrito solo dura la sesión */ }
    suscriptores.forEach(fn => fn(renglones));
  }

  function alCambiar(fn) { suscriptores.push(fn); fn(renglones); }

  // ── Identidad de un renglón ────────────────────────────────

  function idRenglon(referencia, talla, color) {
    return `${referencia}||${talla || ''}||${color || ''}`;
  }

  // ── Operaciones ────────────────────────────────────────────

  function agregar(producto, talla, color, cantidad = 1) {
    const id = idRenglon(producto.referencia, talla, color);
    const existente = renglones.find(r => r.id === id);
    const tope = topeDisponible(producto, talla, color);

    if (existente) {
      existente.cantidad = Math.min(existente.cantidad + cantidad, tope);
    } else {
      renglones.push({
        id,
        referencia: producto.referencia,
        nombre:     producto.nombre,
        precio:     producto.precio,
        imagen:     producto.imagenes[0],
        talla:      talla || '',
        color:      color || '',
        cantidad:   Math.min(cantidad, tope),
      });
    }
    guardar();
  }

  // Cuánto se puede pedir de esta combinación. Si no conocemos el stock
  // (no hay pestaña Inventario), permitimos hasta 10 y se confirma por WhatsApp.
  function topeDisponible(producto, talla, color) {
    if (producto.stockDesconocido) return 10;
    const v = producto.variantes.find(v =>
      v.talla === talla && (color ? v.color === color : true)
    );
    return v ? Math.max(1, v.stock) : 1;
  }

  function cambiarCantidad(id, cantidad) {
    const r = renglones.find(r => r.id === id);
    if (!r) return;
    r.cantidad = Math.max(1, Math.min(cantidad, 99));
    guardar();
  }

  function quitar(id) {
    renglones = renglones.filter(r => r.id !== id);
    guardar();
  }

  function vaciar() { renglones = []; guardar(); }

  // ── Consultas ──────────────────────────────────────────────

  const obtener   = () => renglones;
  const total     = () => renglones.reduce((s, r) => s + r.precio * r.cantidad, 0);
  const unidades  = () => renglones.reduce((s, r) => s + r.cantidad, 0);
  const estaVacio = () => renglones.length === 0;

  cargar();

  return {
    agregar, quitar, vaciar, cambiarCantidad,
    obtener, total, unidades, estaVacio,
    alCambiar, topeDisponible,
  };
})();

window.Carrito = Carrito;
