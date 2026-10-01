/**
 * Protein Sport Cali — Configuración
 * ============================================================
 *  ESTE ES EL ÚNICO ARCHIVO QUE NECESITAS EDITAR.
 *  Cambia los valores marcados con  <-- CAMBIAR
 *
 *  Demo armada sobre el motor de la tienda FabJak: catálogo,
 *  carrito y pedido que se cierra por WhatsApp.
 * ============================================================
 */

const CONFIG = {

  // ─── 1. DATOS DE LA TIENDA ──────────────────────────────────
  tienda: {
    nombre: 'Protein Sport Cali',
    eslogan: 'Suplementos 100% originales en Cali 💪',
    descripcion: 'Proteínas, creatinas, pre-entrenos y combos de las mejores marcas. Envío gratis a toda Colombia desde $150.000 y entrega el mismo día en Cali.',
    ciudad: 'Cali, Valle',
    direccion: 'Calle 13 oeste #55-15',
    instagram: 'proteinsportcali',
  },

  // ─── 2. WHATSAPP ────────────────────────────────────────────
  whatsapp: {
    // Formato: 57 + los 10 dígitos del celular. SIN +, SIN espacios, SIN guiones.
    // Demo: línea de prueba conectada al agente de MergeOn.
    numero: '573126627758',  // <-- línea de demo. Las de la tienda: ventas 573022831877, mayoristas 573175657485

    // Mensaje del botón flotante (consultas generales, sin pedido)
    saludoGeneral: '¡Hola Protein Sport! Vi su tienda y quiero hacer una consulta.',
  },

  // ─── 3. CONEXIÓN CON LA HOJA DE CÁLCULO ─────────────────────
  //
  //  Vacío a propósito: la demo lee los productos de datos/productos.json,
  //  que se genera desde su tienda Shopify con mergeon/generar-catalogo.js.
  //
  hoja: {
    idHoja: '',
    urlProductos:  '',
    urlInventario: '',
    pestanaProductos:  'Productos',
    pestanaInventario: 'Inventario',
    cacheMinutos: 5,
  },

  // ─── 4. VENTAS Y ENVÍOS ─────────────────────────────────────
  ventas: {
    moneda: 'COP',

    // Formas de pago que aparecen en el formulario del pedido.
    formasDePago: [
      'Nequi o Daviplata',
      'Transferencia bancaria',
      'Tarjeta o PSE (te enviamos el link)',
    ],

    // Línea bajo el precio en el detalle del producto (HTML permitido).
    notaPago: 'Paga con <strong>Nequi, Daviplata, PSE o tarjeta</strong>',

    // Texto que se muestra bajo el total en el carrito.
    notaEnvio: 'Envío gratis a toda Colombia desde $150.000; por debajo, $12.000. En Cali, si confirmas antes de las 2:00 p. m., te llega hoy mismo.',
  },

  // ─── 5. VARIANTES ───────────────────────────────────────────
  // Cómo se llaman las dos columnas del inventario en esta tienda.
  // En ropa son Talla y Color; en suplementos, Presentación y Sabor.
  variantes: {
    talla:  'Presentación',
    tallas: 'presentaciones',
    color:  'Sabor',
    // En suplementos las presentaciones no se comparan entre sí (2 Lbs,
    // 90 Servicios, Lata): filtrar por ahí no ayuda, así que no se muestra.
    filtro: false,
  },

  // ─── 6. APARIENCIA ──────────────────────────────────────────
  apariencia: {
    // Rojo de su marca para botones, y uno más claro para texto sobre negro
    colorPrincipal: '#e11d1d',
    colorAcento:    '#ff5a4f',

    imagenCompartir: 'https://proteinsport.netlify.app/assets/img/og-proteinsport.png',
  },

  // ─── 7. AVANZADO ────────────────────────────────────────────
  avanzado: {
    respaldo: 'datos/productos.json',
    productosPorPagina: 12,
  },
};

// No modificar de aquí hacia abajo
window.CONFIG = CONFIG;
