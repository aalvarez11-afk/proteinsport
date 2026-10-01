/**
 * whatsapp.js — Cierre de la venta por WhatsApp
 *
 * Arma el mensaje del pedido y abre el chat de la tienda con ese texto
 * ya escrito. El cliente siempre tiene que pulsar "enviar": WhatsApp no
 * permite mandar mensajes automáticamente, y así debe ser.
 */

const WhatsApp = (() => {

  // Límite prudente para el largo de la URL. Algunos celulares y
  // navegadores cortan enlaces muy largos sin avisar, y el pedido
  // llegaría incompleto. Si nos pasamos, resumimos el mensaje.
  const LARGO_MAXIMO_URL = 1800;

  // Intl deja un espacio duro entre el signo y el número ("$ 89.000").
  // En Colombia se escribe pegado, así que lo quitamos.
  const pesos = n => new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: CONFIG.ventas.moneda,
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n).replace(/\s/g, '\u00a0').replace(/\$\u00a0/, '$');

  // Código corto para que la tienda pueda referirse al pedido.
  // No es un identificador único global: es una referencia de conversación.
  function numeroDePedido() {
    const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  // sin I, O, 0, 1
    let codigo = '';
    for (let i = 0; i < 4; i++) {
      codigo += letras[Math.floor(Math.random() * letras.length)];
    }
    return `PSC-${codigo}`;
  }

  // Limpia el número: deja solo dígitos. wa.me no acepta +, espacios ni guiones.
  function numeroLimpio() {
    return String(CONFIG.whatsapp.numero || '').replace(/\D/g, '');
  }

  // totalReal permite mostrar el total del pedido COMPLETO aunque la lista
  // se haya recortado por longitud: si no, el cliente vería un precio menor
  // al que realmente va a pagar.
  function armarMensaje(renglones, datosCliente, pedido, { resumido = false, totalReal = null } = {}) {
    const L = [];

    L.push(`¡Hola ${CONFIG.tienda.nombre}! Quiero hacer un pedido 💪`);
    L.push(`Pedido: ${pedido}`);
    L.push('');

    renglones.forEach((r, i) => {
      if (resumido) {
        // Versión compacta: una línea por producto
        const detalle = [r.talla, r.color, `x${r.cantidad}`]
          .filter(Boolean).join(' ');
        L.push(`${i + 1}. ${r.nombre} (${r.referencia}) ${detalle} · ${pesos(r.precio * r.cantidad)}`);
      } else {
        L.push(`${i + 1}. ${r.nombre} (${r.referencia})`);
        const detalle = [
          r.talla,
          r.color,
          `x${r.cantidad}`,
          pesos(r.precio * r.cantidad),
        ].filter(Boolean).join(' · ');
        L.push(`   ${detalle}`);
      }
    });

    const total = totalReal ?? renglones.reduce((s, r) => s + r.precio * r.cantidad, 0);
    L.push('');
    L.push(`Total: ${pesos(total)}`);

    if (datosCliente && Object.values(datosCliente).some(Boolean)) {
      L.push('');
      if (datosCliente.nombre)    L.push(`Nombre: ${datosCliente.nombre}`);
      if (datosCliente.ciudad)    L.push(`Ciudad: ${datosCliente.ciudad}`);
      if (datosCliente.direccion) L.push(`Dirección: ${datosCliente.direccion}`);
      if (datosCliente.pago)      L.push(`Pago: ${datosCliente.pago}`);
      if (datosCliente.notas)     L.push(`Notas: ${datosCliente.notas}`);
    }

    return L.join('\n');
  }

  /**
   * Genera el enlace wa.me con el pedido dentro.
   * Si el mensaje completo no cabe en la URL, usa la versión resumida;
   * si aun así no cabe, corta la lista e indica cuántos productos faltan.
   */
  function enlaceDePedido(renglones, datosCliente) {
    const numero = numeroLimpio();
    const pedido = numeroDePedido();
    const base   = `https://wa.me/${numero}?text=`;
    const totalPedido = renglones.reduce((s, r) => s + r.precio * r.cantidad, 0);

    let mensaje = armarMensaje(renglones, datosCliente, pedido);

    if (base.length + encodeURIComponent(mensaje).length > LARGO_MAXIMO_URL) {
      mensaje = armarMensaje(renglones, datosCliente, pedido, { resumido: true });
    }

    // Último recurso: un pedido enorme. Recortamos y dejamos constancia.
    if (base.length + encodeURIComponent(mensaje).length > LARGO_MAXIMO_URL) {
      let visibles = renglones.length;
      while (visibles > 1) {
        visibles--;
        const parcial = renglones.slice(0, visibles);
        mensaje = armarMensaje(parcial, datosCliente, pedido, { resumido: true, totalReal: totalPedido })
          + `\n\n(+ ${renglones.length - visibles} producto(s) más — se los detallo por aquí)`;
        if (base.length + encodeURIComponent(mensaje).length <= LARGO_MAXIMO_URL) break;
      }
    }

    return { url: base + encodeURIComponent(mensaje), pedido, mensaje };
  }

  // Enlace del botón flotante, para consultas sin pedido
  function enlaceGeneral(textoPersonalizado) {
    const texto = textoPersonalizado || CONFIG.whatsapp.saludoGeneral;
    return `https://wa.me/${numeroLimpio()}?text=${encodeURIComponent(texto)}`;
  }

  // Enlace para preguntar por un producto concreto
  function enlaceProducto(producto) {
    const texto = `¡Hola ${CONFIG.tienda.nombre}! Me interesa: `
      + `${producto.nombre} (${producto.referencia}). ¿Me cuentan qué ${(CONFIG.variantes && CONFIG.variantes.tallas) || 'tallas'} tienen disponibles?`;
    return `https://wa.me/${numeroLimpio()}?text=${encodeURIComponent(texto)}`;
  }

  // Avisa si el número quedó sin configurar, para no descubrirlo con un cliente real
  function numeroConfigurado() {
    const n = numeroLimpio();
    return n.length >= 10 && n !== '573001234567';
  }

  return { enlaceDePedido, enlaceGeneral, enlaceProducto, numeroConfigurado, pesos };
})();

window.WhatsApp = WhatsApp;
