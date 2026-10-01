# Protein Sport Cali — tienda web (demo)

Catálogo de proteínas, creatinas, pre-entrenos y combos de Protein Sport Cali, con carrito y
pedido que se cierra por WhatsApp. Sitio estático, sin build: HTML, CSS y JavaScript sin
dependencias. Construido sobre el motor de la tienda FabJak.

Dirección prevista: **https://proteinsport.netlify.app** (si Netlify le da otro nombre,
cambiarlo también en `index.html`, `assets/js/config.js` y en los prompts de MergeOn).

## Publicar en Netlify

**Add new site → Import an existing project → GitHub → este repo.** No hay que configurar nada:
`netlify.toml` ya dice que no hay build y que se publica la raíz. Cada push a `main` redespliega.

## De dónde sale el catálogo

`datos/productos.json` **no se edita a mano**: lo genera `mergeon/generar-catalogo.js` (en la
carpeta de la demo, fuera de este repo) desde la tienda Shopify real de la marca,
proteinsportcali.com. Trae **sus 178 productos** con **precios, sabores y fotos reales**;
las fotos se cargan directo del CDN de Shopify.

- El stock es inventado para la demo (Shopify no lo publica), el mismo que tiene MergeOn: el agente
  de WhatsApp vende directo con él. Los sabores en 0 no aparecen para elegir.
- Quedaron fuera a propósito los pro-hormonales y anabólicos.

Para refrescarlo: volver a bajar `shopify-productos.json`, correr el generador, commit y push.

## Dónde se cambia cada cosa

| Qué | Dónde |
|---|---|
| Número de WhatsApp, formas de pago, textos, colores, nombres de variantes | `assets/js/config.js` |
| Productos, precios, sabores (generado) | `datos/productos.json` |
| Textos legales (campos entre corchetes por completar) | `legal/` |

Los pedidos llegan a la línea de demo **312 662 7758**, conectada al agente de MergeOn. Las
líneas reales de la tienda son 302 283 1877 (ventas) y 317 565 7485 (mayoristas). Prefijo de
pedido `PSC-`.

## Pendiente antes de usarla con clientes reales

- Confirmar formas de pago (en su web: tarjeta, PSE, Nequi y Daviplata; contraentrega no consta).
- Está marcada `noindex` y `robots.txt` bloquea buscadores: abrirla cuando sea cliente.

## Local

```bash
python -m http.server 5513
```
