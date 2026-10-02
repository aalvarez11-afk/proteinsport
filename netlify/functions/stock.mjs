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
// Se identifica tal cual es: un servidor de la web de Protein Sport.
const IDENTIDAD = { 'User-Agent': 'ProteinSportWeb/1.0 (+https://proteinsport.netlify.app; stock MergeOn)', Accept: 'application/json' };
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

// Qué dijo quien rechazó: la API de MergeOn responde JSON con "detail"; un
// firewall delante (Cloudflare) responde HTML. Del detalle se tachan las keys.
async function describirRechazo(res) {
  const tipo = res.headers.get('content-type') || '';
  const cuerpo = (await res.text()).slice(0, 400);
  if (!tipo.includes('json')) {
    return `bloqueado antes de llegar a la API: ${tipo.split(';')[0] || 'sin tipo'}, server ${res.headers.get('server') || '?'}`;
  }
  let detalle = '';
  try { const d = JSON.parse(cuerpo).detail; detalle = typeof d === 'string' ? d : JSON.stringify(d); } catch { /* sin detalle */ }
  return (detalle || 'sin detalle').replace(/mk_[A-Za-z0-9]+/g, 'mk_***').slice(0, 160);
}

// Cuando MergeOn rechaza la lectura, junta el motivo que dio y de qué negocio
// es la key (el error más probable es pegar la de otro negocio).
async function diagnosticarKey({ url, key, ecommerceId }, rechazo) {
  const base = `MergeOn respondió HTTP ${rechazo.status} (${await describirRechazo(rechazo)})`;
  try {
    const res = await fetch(`${url}/api-keys/me`, {
      headers: { ...IDENTIDAD, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return `${base}; al validar la key: HTTP ${res.status} (${await describirRechazo(res)})`;
    const suyo = String((await res.json())?.ecommerce_id ?? '?');
    return suyo === String(ecommerceId)
      ? `${base}; la key sí es del negocio ${suyo}`
      : `${base}; la key es del negocio ${suyo}, no del ${ecommerceId}`;
  } catch {
    return base;
  }
}

async function traerProductos({ url, key, ecommerceId }) {
  const todos = [];
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const res = await fetch(`${url}/products/?limit=${POR_PAGINA}&offset=${pagina * POR_PAGINA}`, {
      headers: { ...IDENTIDAD, Authorization: `Bearer ${key}`, ecommerce_id: ecommerceId },
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 401 || res.status === 403) throw new Error(await diagnosticarKey({ url, key, ecommerceId }, res));
    if (!res.ok) throw new Error(`MergeOn respondió HTTP ${res.status}`);
    const lote = await res.json();
    if (!Array.isArray(lote)) {
      // Solo los nombres de los campos, nunca sus valores
      const forma = lote && typeof lote === 'object' ? Object.keys(lote).slice(0, 5).join(',') : typeof lote;
      throw new Error(`Respuesta inesperada de MergeOn (${forma})`);
    }
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

  // trim: al pegar la key en Netlify es fácil que se cuele un espacio o un salto de línea
  const key = (process.env.MERGEON_API_KEY || '').trim();
  if (!key) return json({ error: 'Falta configurar MERGEON_API_KEY en Netlify' }, 503, false);

  try {
    const { lista, completo } = await traerProductos({
      url: (process.env.MERGEON_API_URL || 'https://api.mergeon.dev').replace(/\/$/, ''),
      key,
      ecommerceId: process.env.MERGEON_ECOMMERCE_ID || '317',
    });
    return json({ completo, actualizado: new Date().toISOString(), productos: resumir(lista) }, 200, true);
  } catch (err) {
    // El motivo es siempre uno de los mensajes armados aquí (código HTTP,
    // tiempo agotado, sin conexión): nunca lleva la key ni datos de MergeOn.
    const motivo = err.name === 'TimeoutError' ? 'MergeOn tardó más de 8 s'
      : err.message.startsWith('MergeOn') || err.message.startsWith('Respuesta') ? err.message
      : 'No se pudo conectar con MergeOn';
    // Tampoco al log va err.message suelto: un error de cabecera inválida lo
    // repetiría con la key adentro.
    console.error('[stock] No se pudo leer MergeOn:', err.name, motivo);
    return json({ error: 'No se pudo leer el stock', motivo }, 502, false);
  }
};

export const config = { path: '/api/stock' };
