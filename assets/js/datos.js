/**
 * datos.js — Capa de datos de Protein Sport Cali
 *
 * Se encarga de traer el inventario desde la hoja de Google, entenderlo
 * y entregárselo al catálogo ya listo para mostrar.
 *
 * Estrategia en cascada, para que la tienda NUNCA se vea vacía:
 *    1. Caché del navegador (si tiene menos de CONFIG.hoja.cacheMinutos)
 *    2. Hoja de Google publicada como CSV
 *    3. Archivo de respaldo datos/productos.json
 *
 * Sin dependencias externas: el parser de CSV va incluido.
 */

const Datos = (() => {

  const CLAVE_CACHE = 'proteinsport_datos_v1';

  // ── Parser CSV (RFC 4180) ──────────────────────────────────
  // Maneja comillas dobles, comas dentro de campos y saltos de
  // línea dentro de campos entrecomillados. Sin esto, una
  // descripción con una coma rompería toda la fila.
  function parsearCSV(texto) {
    const filas = [];
    let fila = [];
    let campo = '';
    let dentroDeComillas = false;

    // Normaliza saltos de línea de Windows y quita el BOM de Excel
    texto = texto.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    for (let i = 0; i < texto.length; i++) {
      const c = texto[i];

      if (dentroDeComillas) {
        if (c === '"') {
          if (texto[i + 1] === '"') { campo += '"'; i++; }  // comilla escapada
          else dentroDeComillas = false;
        } else {
          campo += c;
        }
      } else {
        if (c === '"')      dentroDeComillas = true;
        else if (c === ',') { fila.push(campo); campo = ''; }
        else if (c === '\n'){ fila.push(campo); filas.push(fila); fila = []; campo = ''; }
        else                campo += c;
      }
    }
    // Último campo (archivos que no terminan en salto de línea)
    if (campo !== '' || fila.length > 0) { fila.push(campo); filas.push(fila); }

    return filas.filter(f => f.some(v => v.trim() !== ''));  // descarta filas vacías
  }

  // Convierte el CSV en una lista de objetos usando la primera fila
  // como nombres de columna. Tolera mayúsculas, tildes y espacios de sobra.
  function csvAObjetos(texto) {
    const filas = parsearCSV(texto);
    if (filas.length < 2) return [];

    const columnas = filas[0].map(normalizarNombreColumna);

    return filas.slice(1).map(fila => {
      const obj = {};
      columnas.forEach((col, i) => { obj[col] = (fila[i] ?? '').trim(); });
      return obj;
    });
  }

  function normalizarNombreColumna(nombre) {
    return nombre
      .trim()
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // quita tildes
      .replace(/\s+/g, '_');
  }

  // ── Normalización de valores ───────────────────────────────

  // "89.000", "$89,000", "89000 " -> 89000
  function aNumero(valor) {
    if (valor === null || valor === undefined) return 0;
    const limpio = String(valor).replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
    const n = parseFloat(limpio);
    return Number.isFinite(n) ? n : 0;
  }

  // Google entrega los números de la hoja en formato decimal, así que una
  // talla 30 llega como "30.0" y se vería así en los botones del sitio.
  // Solo recortamos el ".0" cuando el valor es exactamente un número entero;
  // una talla como "8.5" o un color con punto se dejan intactos.
  function aTexto(valor) {
    const v = String(valor ?? '').trim();
    return /^-?\d+\.0+$/.test(v) ? v.replace(/\.0+$/, '') : v;
  }

  // "SI", "sí", "x", "true", "1" -> true
  function aBooleano(valor, pordefecto = true) {
    const v = String(valor ?? '').trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (v === '') return pordefecto;
    return ['si', 's', 'x', 'true', 'verdadero', '1', 'yes'].includes(v);
  }

  // ── Construcción del catálogo ──────────────────────────────

  function construirCatalogo(filasProductos, filasInventario) {
    const problemas = [];

    // Agrupa el inventario por referencia
    const inventarioPorRef = {};
    filasInventario.forEach((fila, i) => {
      const ref = aTexto(fila.referencia);
      if (!ref) { problemas.push(`Inventario fila ${i + 2}: sin referencia`); return; }

      const talla = aTexto(fila.talla);
      if (!talla) { problemas.push(`Inventario fila ${i + 2}: sin talla (${ref})`); return; }

      (inventarioPorRef[ref] ||= []).push({
        talla,
        color: aTexto(fila.color),
        stock: Math.max(0, Math.round(aNumero(fila.stock))),
      });
    });

    const productos = [];
    filasProductos.forEach((fila, i) => {
      const referencia = aTexto(fila.referencia);
      if (!referencia) { problemas.push(`Productos fila ${i + 2}: sin referencia, se omite`); return; }

      const nombre = (fila.nombre || '').trim();
      if (!nombre) { problemas.push(`Productos fila ${i + 2}: sin nombre, se omite (${referencia})`); return; }

      const precio = aNumero(fila.precio);
      if (precio <= 0) { problemas.push(`Productos fila ${i + 2}: precio inválido, se omite (${referencia})`); return; }

      if (!aBooleano(fila.activo, true)) return;   // producto ocultado a propósito

      const precioAntes = aNumero(fila.precio_antes);
      const imagenes = [fila.imagen_1, fila.imagen_2, fila.imagen_3]
        .map(u => (u || '').trim())
        .filter(Boolean);

      const variantes = inventarioPorRef[referencia] || [];

      productos.push({
        referencia,
        nombre,
        categoria:   (fila.categoria || '').trim() || 'General',
        descripcion: (fila.descripcion || '').trim(),
        precio,
        precioAntes: precioAntes > precio ? precioAntes : 0,
        imagenes:    imagenes.length ? imagenes : ['assets/img/placeholder.svg'],
        destacado:   aBooleano(fila.destacado, false),
        variantes,
        // Si no hay filas de inventario, no sabemos el stock: se muestra
        // "consultar disponibilidad" en vez de decir que está agotado.
        stockDesconocido: variantes.length === 0,
        stockTotal: variantes.reduce((s, v) => s + v.stock, 0),
      });
    });

    if (problemas.length) {
      console.warn(
        `[ProteinSport] Se encontraron ${problemas.length} problema(s) en la hoja de cálculo:\n  ` +
        problemas.join('\n  ') +
        '\n(El resto del catálogo se cargó con normalidad.)'
      );
    }

    // Destacados primero y, dentro de cada grupo, el orden de la hoja:
    // así la tienda decide qué producto sale de primero. sort() es estable.
    productos.sort((a, b) => b.destacado - a.destacado);

    return { productos, problemas };
  }

  // ── Caché en el navegador ──────────────────────────────────

  function leerCache() {
    try {
      const crudo = localStorage.getItem(CLAVE_CACHE);
      if (!crudo) return null;
      const { guardadoEn, productos } = JSON.parse(crudo);
      const minutos = (Date.now() - guardadoEn) / 60000;
      if (minutos > (CONFIG.hoja.cacheMinutos ?? 5)) return null;
      return productos;
    } catch { return null; }   // modo incógnito o almacenamiento lleno
  }

  function guardarCache(productos) {
    try {
      localStorage.setItem(CLAVE_CACHE, JSON.stringify({ guardadoEn: Date.now(), productos }));
    } catch { /* no pasa nada si no se puede guardar */ }
  }

  function limpiarCache() {
    try { localStorage.removeItem(CLAVE_CACHE); } catch { /* ignorar */ }
  }

  // ── De dónde se leen los datos ─────────────────────────────

  // Acepta dos formas de configurar la hoja:
  //   1. idHoja     -> construimos las direcciones solas (lo más simple)
  //   2. urlProductos / urlInventario -> direcciones de "Publicar en la Web"
  // Las URLs explícitas mandan, por si alguien necesita algo a la medida.
  function urlsDeLaHoja() {
    const h = CONFIG.hoja;

    if (h.urlProductos) {
      return { productos: h.urlProductos, inventario: h.urlInventario || '' };
    }

    const id = extraerId(h.idHoja);
    if (!id) return { productos: '', inventario: '' };

    const gviz = pestana =>
      `https://docs.google.com/spreadsheets/d/${id}/gviz/tq` +
      `?tqx=out:csv&sheet=${encodeURIComponent(pestana)}`;

    return {
      productos:  gviz(h.pestanaProductos  || 'Productos'),
      inventario: gviz(h.pestanaInventario || 'Inventario'),
    };
  }

  // Tolera que peguen el ID pelado o la dirección completa del navegador.
  // Es el error más fácil de cometer al configurar, así que lo resolvemos
  // en vez de dejar la tienda vacía sin explicación.
  function extraerId(valor) {
    const v = String(valor || '').trim();
    if (!v) return '';
    const enLaUrl = v.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (enLaUrl) return enLaUrl[1];
    return /^[a-zA-Z0-9-_]{20,}$/.test(v) ? v : '';
  }

  // ── Carga principal ────────────────────────────────────────

  async function traerCSV(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status} al leer la hoja`);
    const texto = await res.text();
    // Si la hoja no está publicada, Google devuelve una página HTML de error
    if (texto.trimStart().startsWith('<')) {
      throw new Error('La hoja no está publicada como CSV (revisa el paso "Publicar en la Web")');
    }
    return csvAObjetos(texto);
  }

  async function cargar({ forzar = false } = {}) {
    if (!forzar) {
      const cacheados = leerCache();
      if (cacheados) return { productos: cacheados, origen: 'cache' };
    }

    const { productos: urlProductos, inventario: urlInventario } = urlsDeLaHoja();

    if (urlProductos) {
      try {
        const [filasProductos, filasInventario] = await Promise.all([
          traerCSV(urlProductos),
          urlInventario ? traerCSV(urlInventario).catch(err => {
            console.warn('[ProteinSport] No se pudo leer la pestaña Inventario:', err.message);
            return [];
          }) : Promise.resolve([]),
        ]);

        const { productos } = construirCatalogo(filasProductos, filasInventario);
        if (productos.length) {
          guardarCache(productos);
          return { productos, origen: 'hoja' };
        }
        console.warn('[ProteinSport] La hoja se leyó pero no tiene productos válidos. Uso el respaldo.');
      } catch (err) {
        console.warn('[ProteinSport] No se pudo leer la hoja de Google:', err.message, '— uso el respaldo.');
      }
    }

    // Respaldo: productos de ejemplo o la última copia buena del repo
    try {
      const res = await fetch(CONFIG.avanzado.respaldo, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const datos = await res.json();
      const { productos } = construirCatalogo(datos.productos || [], datos.inventario || []);
      return { productos, origen: urlProductos ? 'respaldo' : 'ejemplo' };
    } catch (err) {
      console.error('[ProteinSport] Tampoco se pudo cargar el respaldo:', err.message);
      return { productos: [], origen: 'error' };
    }
  }

  return { cargar, limpiarCache, parsearCSV, csvAObjetos, aNumero, aBooleano,
           aTexto, urlsDeLaHoja, extraerId };
})();

window.Datos = Datos;
