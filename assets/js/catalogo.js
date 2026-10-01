/**
 * catalogo.js — Interfaz de la tienda Protein Sport Cali
 *
 * Dibuja el catálogo, los filtros, el detalle de cada producto,
 * el carrito y el formulario que termina en WhatsApp.
 */

(() => {
  'use strict';

  let TODOS = [];          // catálogo completo tal como vino de la hoja
  let VISIBLES = [];       // resultado de aplicar filtros
  let mostrados = 0;       // cuántos llevamos pintados (paginación "Ver más")
  let productoAbierto = null;

  const $  = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));
  const pesos = WhatsApp.pesos;

  // Nombres de las dos columnas del inventario (Talla/Color en ropa,
  // Presentación/Sabor en suplementos). Se cambian en config.js.
  const ETQ = Object.assign({ talla: 'Talla', tallas: 'tallas', color: 'Color' }, CONFIG.variantes);

  // Todo texto que venga de la hoja pasa por aquí antes de ir al HTML.
  // Sin esto, un nombre de producto con < o > podría romper la página.
  function esc(texto) {
    return String(texto ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ── Arranque ───────────────────────────────────────────────

  async function iniciar() {
    aplicarMarca();
    conectarEventos();
    Carrito.alCambiar(pintarCarrito);

    mostrarEstado('cargando');
    const { productos, origen } = await Datos.cargar();
    TODOS = productos;

    if (!TODOS.length) { mostrarEstado('vacio'); return; }

    mostrarEstado(null);
    avisarSegunOrigen(origen);
    llenarFiltros();
    filtrar();
  }

  function aplicarMarca() {
    const { tienda, apariencia } = CONFIG;
    document.title = `${tienda.nombre} — ${tienda.eslogan}`;
    $$('[data-marca-nombre]').forEach(el => el.textContent = tienda.nombre);
    $$('[data-marca-eslogan]').forEach(el => el.textContent = tienda.eslogan);

    const raiz = document.documentElement.style;
    raiz.setProperty('--color-principal', apariencia.colorPrincipal);
    raiz.setProperty('--color-acento', apariencia.colorAcento);

    $('#btn-whatsapp-flotante').href = WhatsApp.enlaceGeneral();
    $('#btn-hero-whatsapp').href = WhatsApp.enlaceGeneral();

    // La dirección es opcional: una tienda solo a domicilio no la publica
    const direccion = [tienda.direccion, tienda.ciudad].filter(Boolean).join(', ');
    $$('[data-marca-direccion]').forEach(el => el.textContent = direccion);
    const mapa = $('#btn-mapa');
    if (mapa) mapa.href = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(direccion);
    $$('[data-enlace-whatsapp]').forEach(el => el.href = WhatsApp.enlaceGeneral());
    $('#btn-instagram').href = `https://www.instagram.com/${tienda.instagram}/`;
    $('label[for="filtro-talla"]').textContent = ETQ.talla;
  }

  // Si la hoja no responde el cliente no tiene por qué enterarse,
  // pero quien administra la tienda sí: el aviso solo sale con ?debug
  function avisarSegunOrigen(origen) {
    const enModoPrueba = new URLSearchParams(location.search).has('debug');

    // Demo: el catálogo sale del JSON a propósito, así que este aviso
    // solo aparece con ?debug para no mostrárselo al cliente en la reunión.
    if (origen === 'ejemplo' && enModoPrueba) {
      mostrarBanner(
        'Estás viendo productos de ejemplo. Conecta tu hoja de Google en ' +
        '<code>assets/js/config.js</code> para mostrar tu inventario real.'
      );
    } else if (origen === 'respaldo') {
      console.warn('[ProteinSport] Mostrando el respaldo: la hoja de Google no respondió.');
      if (enModoPrueba) mostrarBanner('No se pudo leer la hoja de Google. Se está mostrando el respaldo.');
    }

    if (!WhatsApp.numeroConfigurado()) {
      mostrarBanner(
        'Falta configurar el número de WhatsApp en <code>assets/js/config.js</code>. ' +
        'Los pedidos todavía no llegan a ningún lado.'
      );
    }
  }

  function mostrarBanner(html) {
    const cont = $('#avisos');
    const div = document.createElement('div');
    div.className = 'aviso';
    div.innerHTML = `<span>⚠️ ${html}</span><button class="aviso-cerrar" aria-label="Cerrar aviso">&times;</button>`;
    div.querySelector('button').onclick = () => div.remove();
    cont.appendChild(div);
  }

  function mostrarEstado(estado) {
    const el = $('#estado');
    const grid = $('#grid-productos');
    const mensajes = {
      cargando: '<div class="cargando"><div class="spinner"></div><p>Cargando el catálogo…</p></div>',
      vacio:    '<div class="vacio"><p>No pudimos cargar el catálogo en este momento.</p>' +
                `<p><a class="btn btn-primario" href="${WhatsApp.enlaceGeneral()}" target="_blank" rel="noopener">Escríbenos por WhatsApp</a></p></div>`,
      sinResultados: '<div class="vacio"><p>No encontramos productos con esos filtros.</p>' +
                '<p><button class="btn btn-secundario" id="btn-limpiar-filtros">Quitar filtros</button></p></div>',
    };
    el.innerHTML = estado ? mensajes[estado] : '';
    el.hidden = !estado;
    grid.hidden = !!estado;

    const limpiar = $('#btn-limpiar-filtros');
    if (limpiar) limpiar.onclick = () => {
      $('#buscador').value = '';
      $('#filtro-categoria').value = '';
      $('#filtro-talla').value = '';
      filtrar();
    };
  }

  // ── Filtros ────────────────────────────────────────────────

  function llenarFiltros() {
    const categorias = [...new Set(TODOS.map(p => p.categoria))]
      .sort((a, b) => a.localeCompare(b, 'es'));

    const tallas = [...new Set(TODOS.flatMap(p => p.variantes.map(v => v.talla)))]
      .filter(Boolean)
      .sort(ordenarTallas);

    llenarSelect($('#filtro-categoria'), categorias, 'Todas las categorías');
    llenarSelect($('#filtro-talla'), tallas, `Todas las ${ETQ.tallas}`);
    $('#filtro-talla').closest('.campo').hidden = tallas.length === 0 || ETQ.filtro === false;
  }

  // Las tallas de ropa no se ordenan alfabéticamente: XS va antes que S.
  // Las numéricas (28, 30, 32) sí van por número.
  function ordenarTallas(a, b) {
    const orden = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
    const ia = orden.indexOf(a.toUpperCase());
    const ib = orden.indexOf(b.toUpperCase());
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    const na = parseFloat(a), nb = parseFloat(b);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return a.localeCompare(b, 'es');
  }

  function llenarSelect(select, valores, textoTodos) {
    select.innerHTML = `<option value="">${textoTodos}</option>` +
      valores.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
  }

  function filtrar() {
    const texto     = $('#buscador').value.trim().toLowerCase();
    const categoria = $('#filtro-categoria').value;
    const talla     = $('#filtro-talla').value;
    const orden     = $('#orden').value;

    VISIBLES = TODOS.filter(p => {
      if (categoria && p.categoria !== categoria) return false;
      if (talla && !p.variantes.some(v => v.talla === talla && v.stock > 0)) return false;
      if (texto) {
        const donde = `${p.nombre} ${p.referencia} ${p.categoria} ${p.descripcion}`.toLowerCase();
        if (!donde.includes(texto)) return false;
      }
      return true;
    });

    if (orden === 'precio-asc')  VISIBLES.sort((a, b) => a.precio - b.precio);
    if (orden === 'precio-desc') VISIBLES.sort((a, b) => b.precio - a.precio);
    if (orden === 'nombre')      VISIBLES.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

    mostrados = 0;
    $('#grid-productos').innerHTML = '';

    if (!VISIBLES.length) { mostrarEstado('sinResultados'); return; }
    mostrarEstado(null);
    pintarMas();

    const n = VISIBLES.length;
    $('#contador-resultados').textContent =
      n === 1 ? '1 producto' : `${n} productos`;
  }

  // ── Catálogo ───────────────────────────────────────────────

  function pintarMas() {
    const porPagina = CONFIG.avanzado.productosPorPagina;
    const lote = VISIBLES.slice(mostrados, mostrados + porPagina);
    $('#grid-productos').insertAdjacentHTML('beforeend', lote.map(tarjeta).join(''));
    mostrados += lote.length;

    const btn = $('#btn-ver-mas');
    btn.hidden = mostrados >= VISIBLES.length;
    btn.textContent = `Ver más (${VISIBLES.length - mostrados} restantes)`;
  }

  function tarjeta(p) {
    const agotado = !p.stockDesconocido && p.stockTotal === 0;
    const descuento = p.precioAntes
      ? Math.round((1 - p.precio / p.precioAntes) * 100) : 0;

    return `
      <article class="tarjeta ${agotado ? 'agotado' : ''}" data-ref="${esc(p.referencia)}" tabindex="0">
        <div class="tarjeta-img">
          <img src="${esc(p.imagenes[0])}" alt="${esc(p.nombre)}" loading="lazy"
               onerror="this.src='assets/img/placeholder.svg'">
          <div class="etiquetas">
            ${descuento ? `<span class="etiqueta etiqueta-descuento">-${descuento}%</span>` : ''}
            ${p.destacado && !agotado ? '<span class="etiqueta etiqueta-destacado">Destacado</span>' : ''}
          </div>
          ${agotado ? '<span class="etiqueta etiqueta-agotado">Agotado</span>' : ''}
        </div>
        <div class="tarjeta-info">
          <span class="tarjeta-categoria">${esc(p.categoria)}</span>
          <h3 class="tarjeta-nombre">${esc(p.nombre)}</h3>
          <div class="tarjeta-precios">
            <span class="precio">${pesos(p.precio)}</span>
            ${p.precioAntes ? `<span class="precio-antes">${pesos(p.precioAntes)}</span>` : ''}
          </div>
          <span class="tarjeta-ref">Ref. ${esc(p.referencia)}</span>
        </div>
      </article>`;
  }

  // ── Detalle del producto ───────────────────────────────────

  function abrirProducto(referencia) {
    const p = TODOS.find(x => x.referencia === referencia);
    if (!p) return;
    productoAbierto = p;

    const tallas = [...new Set(p.variantes.map(v => v.talla))].sort(ordenarTallas);

    $('#modal-producto .modal-cuerpo').innerHTML = `
      <div class="detalle">
        <div class="detalle-galeria">
          <img id="detalle-img" src="${esc(p.imagenes[0])}" alt="${esc(p.nombre)}"
               onerror="this.src='assets/img/placeholder.svg'">
          ${p.imagenes.length > 1 ? `
            <div class="miniaturas">
              ${p.imagenes.map((img, i) => `
                <img src="${esc(img)}" alt="Vista ${i + 1} de ${esc(p.nombre)}"
                     class="miniatura ${i === 0 ? 'activa' : ''}" data-img="${esc(img)}"
                     onerror="this.style.display='none'">`).join('')}
            </div>` : ''}
        </div>

        <div class="detalle-info">
          <span class="tarjeta-categoria">${esc(p.categoria)}</span>
          <h2>${esc(p.nombre)}</h2>
          <span class="tarjeta-ref">Ref. ${esc(p.referencia)}</span>

          <div class="tarjeta-precios detalle-precios">
            <span class="precio">${pesos(p.precio)}</span>
            ${p.precioAntes ? `<span class="precio-antes">${pesos(p.precioAntes)}</span>` : ''}
          </div>
          ${CONFIG.ventas.notaPago ? `<p class="cuotas">💳 <span>${CONFIG.ventas.notaPago}</span></p>` : ''}

          ${p.descripcion ? `<p class="detalle-desc">${esc(p.descripcion)}</p>` : ''}

          ${p.stockDesconocido ? `
            <p class="nota-stock">Disponibilidad sujeta a confirmación. Escríbenos y te decimos al instante.</p>
          ` : tallas.length ? `
            <div class="campo">
              <label>${esc(ETQ.talla)}</label>
              <div class="tallas" id="selector-tallas">
                ${tallas.map(t => {
                  const stockTalla = p.variantes
                    .filter(v => v.talla === t)
                    .reduce((s, v) => s + v.stock, 0);
                  return `<button class="talla ${stockTalla === 0 ? 'sin-stock' : ''}"
                                  data-talla="${esc(t)}" ${stockTalla === 0 ? 'disabled' : ''}
                                  title="${stockTalla === 0 ? 'Agotada' : `${stockTalla} disponible(s)`}">
                            ${esc(t)}
                          </button>`;
                }).join('')}
              </div>
            </div>
            <div class="campo" id="campo-color" hidden>
              <label>${esc(ETQ.color)}</label>
              <div class="colores" id="selector-colores"></div>
            </div>
          ` : `<p class="nota-stock">Este producto no tiene ${esc(ETQ.tallas)} registradas. Consúltanos por WhatsApp.</p>`}

          <div class="campo campo-cantidad">
            <label for="cantidad">Cantidad</label>
            <div class="stepper">
              <button type="button" id="menos" aria-label="Quitar uno">−</button>
              <input type="number" id="cantidad" value="1" min="1" max="10" inputmode="numeric">
              <button type="button" id="mas" aria-label="Agregar uno">+</button>
            </div>
            <span class="disponibles" id="disponibles"></span>
          </div>

          <button class="btn btn-primario btn-ancho" id="btn-agregar">Agregar al carrito</button>
          <a class="btn btn-whatsapp btn-ancho" href="${WhatsApp.enlaceProducto(p)}"
             target="_blank" rel="noopener">Preguntar por WhatsApp</a>
        </div>
      </div>`;

    conectarEventosDetalle(p);
    abrirModal('#modal-producto');
  }

  function conectarEventosDetalle(p) {
    const modal = $('#modal-producto');

    modal.querySelectorAll('.miniatura').forEach(m => {
      m.onclick = () => {
        $('#detalle-img').src = m.dataset.img;
        modal.querySelectorAll('.miniatura').forEach(x => x.classList.remove('activa'));
        m.classList.add('activa');
      };
    });

    const selTallas = $('#selector-tallas');
    if (selTallas) {
      selTallas.querySelectorAll('.talla:not([disabled])').forEach(btn => {
        btn.onclick = () => {
          selTallas.querySelectorAll('.talla').forEach(b => b.classList.remove('activa'));
          btn.classList.add('activa');
          actualizarColores(p, btn.dataset.talla);
          actualizarDisponibles(p);
        };
      });
      // Preselecciona la primera talla disponible: un clic menos para el cliente
      const primera = selTallas.querySelector('.talla:not([disabled])');
      if (primera) primera.click();
    }

    $('#menos').onclick = () => cambiarCantidad(-1, p);
    $('#mas').onclick   = () => cambiarCantidad(+1, p);
    $('#cantidad').oninput = () => actualizarDisponibles(p);

    $('#btn-agregar').onclick = () => {
      const talla = modal.querySelector('.talla.activa')?.dataset.talla || '';
      const color = modal.querySelector('.color.activo')?.dataset.color || '';
      const cantidad = parseInt($('#cantidad').value, 10) || 1;

      if (!p.stockDesconocido && p.variantes.length && !talla) {
        alert(`Elige ${ETQ.talla.toLowerCase()} para continuar.`);
        return;
      }

      Carrito.agregar(p, talla, color, cantidad);
      cerrarModal('#modal-producto');
      abrirCarrito();
    };

    actualizarDisponibles(p);
  }

  function actualizarColores(p, talla) {
    const colores = [...new Set(
      p.variantes.filter(v => v.talla === talla && v.stock > 0).map(v => v.color)
    )].filter(Boolean);

    const campo = $('#campo-color');
    const cont  = $('#selector-colores');
    if (!campo || !cont) return;

    campo.hidden = colores.length === 0;
    cont.innerHTML = colores.map((c, i) =>
      `<button class="color ${i === 0 ? 'activo' : ''}" data-color="${esc(c)}">${esc(c)}</button>`
    ).join('');

    cont.querySelectorAll('.color').forEach(btn => {
      btn.onclick = () => {
        cont.querySelectorAll('.color').forEach(b => b.classList.remove('activo'));
        btn.classList.add('activo');
        actualizarDisponibles(p);
      };
    });
  }

  function cambiarCantidad(delta, p) {
    const input = $('#cantidad');
    const nuevo = (parseInt(input.value, 10) || 1) + delta;
    input.value = Math.max(1, Math.min(nuevo, parseInt(input.max, 10) || 10));
    actualizarDisponibles(p);
  }

  // Mantiene el tope de cantidad pegado al stock real de la combinación elegida
  function actualizarDisponibles(p) {
    const modal = $('#modal-producto');
    const talla = modal.querySelector('.talla.activa')?.dataset.talla || '';
    const color = modal.querySelector('.color.activo')?.dataset.color || '';
    const tope  = Carrito.topeDisponible(p, talla, color);

    const input = $('#cantidad');
    input.max = tope;
    if ((parseInt(input.value, 10) || 1) > tope) input.value = tope;

    $('#disponibles').textContent = p.stockDesconocido
      ? 'Confirmamos disponibilidad por WhatsApp'
      : (tope > 0 ? `${tope} disponible(s)` : 'Agotado');
  }

  // ── Carrito ────────────────────────────────────────────────

  function pintarCarrito(renglones) {
    $('#contador-carrito').textContent = Carrito.unidades();
    $('#contador-carrito').hidden = Carrito.estaVacio();

    const cont = $('#items-carrito');

    if (Carrito.estaVacio()) {
      cont.innerHTML = '<p class="carrito-vacio">Tu carrito está vacío.<br>Agrega productos del catálogo para hacer tu pedido.</p>';
      $('#pie-carrito').hidden = true;
      return;
    }

    cont.innerHTML = renglones.map(r => `
      <div class="item-carrito">
        <img src="${esc(r.imagen)}" alt="${esc(r.nombre)}" onerror="this.src='assets/img/placeholder.svg'">
        <div class="item-info">
          <h4>${esc(r.nombre)}</h4>
          <span class="item-variante">
            ${[r.talla && esc(r.talla), esc(r.color)].filter(Boolean).join(' · ') || `Ref. ${esc(r.referencia)}`}
          </span>
          <div class="item-controles">
            <div class="stepper stepper-mini">
              <button type="button" data-accion="menos" data-id="${esc(r.id)}" aria-label="Quitar uno">−</button>
              <span>${r.cantidad}</span>
              <button type="button" data-accion="mas" data-id="${esc(r.id)}" aria-label="Agregar uno">+</button>
            </div>
            <button class="item-quitar" data-accion="quitar" data-id="${esc(r.id)}">Quitar</button>
          </div>
        </div>
        <span class="item-precio">${pesos(r.precio * r.cantidad)}</span>
      </div>`).join('');

    cont.querySelectorAll('[data-accion]').forEach(btn => {
      const { accion, id } = btn.dataset;
      btn.onclick = () => {
        const r = Carrito.obtener().find(x => x.id === id);
        if (!r) return;
        if (accion === 'menos')  r.cantidad > 1 ? Carrito.cambiarCantidad(id, r.cantidad - 1) : Carrito.quitar(id);
        if (accion === 'mas')    Carrito.cambiarCantidad(id, r.cantidad + 1);
        if (accion === 'quitar') Carrito.quitar(id);
      };
    });

    $('#pie-carrito').hidden = false;
    $('#total-carrito').textContent = pesos(Carrito.total());
  }

  const abrirCarrito  = () => { $('#panel-carrito').classList.add('abierto'); $('#fondo-oscuro').classList.add('visible'); };
  const cerrarCarrito = () => { $('#panel-carrito').classList.remove('abierto'); $('#fondo-oscuro').classList.remove('visible'); };

  // ── Checkout → WhatsApp ────────────────────────────────────

  function abrirCheckout() {
    if (Carrito.estaVacio()) return;

    $('#select-pago').innerHTML = CONFIG.ventas.formasDePago
      .map(f => `<option value="${esc(f)}">${esc(f)}</option>`).join('');

    $('#resumen-total').textContent = pesos(Carrito.total());
    $('#nota-envio').textContent = CONFIG.ventas.notaEnvio;

    cerrarCarrito();
    abrirModal('#modal-checkout');
  }

  function enviarPedido(evento) {
    evento.preventDefault();

    const datos = {
      nombre:    $('#cli-nombre').value.trim(),
      ciudad:    $('#cli-ciudad').value.trim(),
      direccion: $('#cli-direccion').value.trim(),
      pago:      $('#select-pago').value,
      notas:     $('#cli-notas').value.trim(),
    };

    const { url, pedido } = WhatsApp.enlaceDePedido(Carrito.obtener(), datos);

    // Se abre en otra pestaña para no perder el carrito si el cliente vuelve atrás
    window.open(url, '_blank', 'noopener');

    cerrarModal('#modal-checkout');
    mostrarConfirmacion(pedido);
  }

  function mostrarConfirmacion(pedido) {
    $('#modal-confirmacion .modal-cuerpo').innerHTML = `
      <div class="confirmacion">
        <div class="confirmacion-icono">✅</div>
        <h2>¡Tu pedido está listo!</h2>
        <p>Se abrió WhatsApp con tu pedido <strong>${esc(pedido)}</strong> ya escrito.</p>
        <p class="confirmacion-nota">Recuerda <strong>pulsar enviar</strong> en WhatsApp para que nos llegue.
        Te confirmamos disponibilidad y costo de envío por ahí mismo.</p>
        <button class="btn btn-primario btn-ancho" id="btn-seguir">Seguir viendo el catálogo</button>
        <button class="btn btn-texto" id="btn-vaciar">Vaciar el carrito</button>
      </div>`;

    abrirModal('#modal-confirmacion');
    $('#btn-seguir').onclick = () => cerrarModal('#modal-confirmacion');
    $('#btn-vaciar').onclick = () => { Carrito.vaciar(); cerrarModal('#modal-confirmacion'); };
  }

  // ── Modales ────────────────────────────────────────────────

  function abrirModal(sel) {
    $(sel).classList.add('visible');
    document.body.style.overflow = 'hidden';
  }

  function cerrarModal(sel) {
    $(sel).classList.remove('visible');
    if (!$$('.modal.visible').length) document.body.style.overflow = '';
  }

  // ── Eventos generales ──────────────────────────────────────

  function conectarEventos() {
    $('#buscador').oninput        = debounce(filtrar, 250);
    $('#filtro-categoria').onchange = filtrar;
    $('#filtro-talla').onchange   = filtrar;
    $('#orden').onchange          = filtrar;
    $('#btn-ver-mas').onclick     = pintarMas;

    // Delegación: las tarjetas se crean y destruyen al filtrar
    $('#grid-productos').addEventListener('click', e => {
      const tarjeta = e.target.closest('.tarjeta');
      if (tarjeta) abrirProducto(tarjeta.dataset.ref);
    });
    $('#grid-productos').addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const tarjeta = e.target.closest('.tarjeta');
      if (tarjeta) { e.preventDefault(); abrirProducto(tarjeta.dataset.ref); }
    });

    $('#btn-carrito').onclick      = abrirCarrito;
    $('#cerrar-carrito').onclick   = cerrarCarrito;
    $('#fondo-oscuro').onclick     = cerrarCarrito;
    $('#btn-checkout').onclick     = abrirCheckout;
    $('#form-checkout').onsubmit   = enviarPedido;

    $$('.modal-cerrar').forEach(btn => {
      btn.onclick = () => cerrarModal('#' + btn.closest('.modal').id);
    });
    $$('.modal').forEach(modal => {
      modal.onclick = e => { if (e.target === modal) cerrarModal('#' + modal.id); };
    });

    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      const abierto = $('.modal.visible');
      if (abierto) cerrarModal('#' + abierto.id);
      else cerrarCarrito();
    });
  }

  // Evita filtrar en cada tecla mientras el cliente escribe
  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  document.addEventListener('DOMContentLoaded', iniciar);
})();
