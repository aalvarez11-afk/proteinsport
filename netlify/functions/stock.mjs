/**
 * stock.mjs — Stock, precio y disponibilidad en vivo desde MergeOn
 *
 * MergeOn es la única fuente: ahí se edita el inventario y ahí vende el
 * agente. La web pide /api/stock y pinta lo que diga MergeOn, así nunca
 * muestra disponible algo que el agente ya no puede vender.
 *
 * La API key vive en las variables de entorno de Netlify (MERGEON_API_KEY),
 * nunca en el código ni en el navegador: esta función es el único lugar que
 * habla con la API, y solo devuelve datos públicos (stock, precio, si se ve).
 *
 * Respuesta:
 *   { completo, actualizado, productos: {
 *       "PRO-001": { disponible, precio, precioAntes,
 *                    variantes: { "2 lbs|vainilla": 12, ... } } } }
 * La clave de cada variante es "presentación|sabor" en minúsculas, igual que
 * talla|color en el inventario de la web. stock null = MergeOn no lo controla.
 */

const POR_PAGINA = 200;
const MAX_PAGINAS = 10;

// "PRO-001-3" -> "PRO-001"; si no hay variantes, la descripción trae "Ref. PRO-001."
function referenciaDe(producto) {
  for (const v of producto.variants || []) {
    const m = String(v.external_id || '').match(/^([A-Z]{3}-\d{3})-\d+$/);
    if (m) return m[1];
  }
  const m = String(producto.description || '').match(/Ref\. ([A-Z]{3}-\d{3})/);
  return m ? m[1] : null;
}

const claveVariante = (presentacion, sabor) =>
  `${String(presentacion ?? '').trim()}|${String(sabor ?? '').trim()}`.toLowerCase();

export function resumir(lista) {
  const productos = {};
  for (const p of lista) {
    const ref = referenciaDe(p);
    if (!ref) continue;
    const oferta = p.has_discount && p.discount_price > 0 && p.discount_price < p.price;
    const variantes = {};
    for (const v of p.variants || []) {
      const a = v.attributes || {};
      variantes[claveVariante(a['Presentación'], a.Sabor)] =
        v.manage_stock === false ? null : Math.max(0, Math.round(Number(v.stock) || 0));
    }
    productos[ref] = {
      disponible: p.available !== false,
      precio: oferta ? p.discount_price : p.price,
      precioAntes: oferta ? p.price : 0,
      variantes,
    };
  }
  return productos;
}

async function traerProductos({ url, key, ecommerceId }) {
  const todos = [];
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const res = await fetch(`${url}/products/?limit=${POR_PAGINA}&offset=${pagina * POR_PAGINA}`, {
      headers: { Authorization: `Bearer ${key}`, ecommerce_id: ecommerceId },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`MergeOn respondió HTTP ${res.status}`);
    const lote = await res.json();
    if (!Array.isArray(lote)) throw new Error('Respuesta inesperada de MergeOn');
    todos.push(...lote);
    if (lote.length < POR_PAGINA) return { lista: todos, completo: true };
  }
  return { lista: todos, completo: false };
}

const json = (cuerpo, status, cache) => new Response(JSON.stringify(cuerpo), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': cache ? 'public, max-age=30' : 'no-store',
    // La CDN de Netlify guarda la respuesta 60 s: con mil visitas por minuto,
    // MergeOn recibe una sola consulta.
    ...(cache && { 'Netlify-CDN-Cache-Control': 'public, durable, s-maxage=60, stale-while-revalidate=300' }),
  },
});

export default async (req) => {
  if (req.method !== 'GET') return json({ error: 'Método no permitido' }, 405, false);

  const key = process.env.MERGEON_API_KEY;
  if (!key) return json({ error: 'Falta configurar MERGEON_API_KEY en Netlify' }, 503, false);

  try {
    const { lista, completo } = await traerProductos({
      url: (process.env.MERGEON_API_URL || 'https://api.mergeon.dev').replace(/\/$/, ''),
      key,
      ecommerceId: process.env.MERGEON_ECOMMERCE_ID || '317',
    });
    return json({ completo, actualizado: new Date().toISOString(), productos: resumir(lista) }, 200, true);
  } catch (err) {
    // El detalle va al log de Netlify; al navegador solo un aviso genérico.
    console.error('[stock] No se pudo leer MergeOn:', err.message);
    return json({ error: 'No se pudo leer el stock' }, 502, false);
  }
};

export const config = { path: '/api/stock' };
