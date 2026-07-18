// =============================================================================
// GTM / dataLayer — jornada de e-commerce (GA4) p/ Meta, GA4 e Google Ads.
// Pronto p/ server-side (sGTM / Meta CAPI):
//  - event_id único em todo evento (deduplicação pixel browser x server)
//  - user_data no purchase (telefone E.164, nome, cidade) p/ advanced matching
//    (enviar em claro pro server container; o sGTM/Meta hasheia)
// =============================================================================
import { phoneE164 } from './util.js';
import { CONFIG } from './config.js';

window.dataLayer = window.dataLayer || [];

// Ambiente que NÃO pode disparar evento real (dev local, rede privada, preview do
// Netlify). Preview do Netlify tem "--" no host (deploy-preview-1--site.netlify.app);
// produção é o domínio próprio (acaimaisaborvotu.com.br), então nunca cai aqui.
const ehLocal = () => {
  const h = location.hostname;
  return /^(localhost|127\.|0\.0\.0\.0|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(h)
    || /\.local$/.test(h)
    || (h.endsWith('.netlify.app') && h.includes('--'));
};
const cookie = (n) => { try { return (document.cookie.match('(^|;)\\s*' + n + '\\s*=\\s*([^;]+)') || [])[2] || null; } catch (e) { return null; } };

const newEventId = () =>
  (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2));

// external_id ESTÁVEL do cliente: um id anônimo persistente (localStorage), o MESMO
// em todo evento e no navegador + servidor. Costura a jornada (view -> lead -> compra
// -> recompra) e sobe a qualidade de correspondência (EMQ). NÃO é dado pessoal; o
// servidor hasheia antes de mandar pro Meta.
function externalId() {
  try {
    let v = localStorage.getItem('ams_uid');
    if (!v) { v = newEventId(); localStorage.setItem('ams_uid', v); }
    return v;
  } catch (e) { return undefined; }
}

// eventId opcional: quando o evento tem um id ESTÁVEL (ex: purchase = venda_{id do
// pedido}), passar aqui. Assim o Pixel do navegador e o nosso CAPI (server) mandam
// o MESMO event_id e o Meta deduplica; e reenvio não vira compra nova.
function push(event, ecommerce, extra = {}, eventId) {
  const id = eventId || newEventId();
  window.dataLayer.push({ ecommerce: null }); // limpa o objeto anterior
  window.dataLayer.push({ event, event_id: id, ecommerce, ...extra });
  // Espelha o MESMO evento (mesmo event_id) pro nosso CAPI server-side -> dedup com o
  // Pixel. Purchase NÃO: vai pelo caminho autoritativo (capiPurchase, valor do banco).
  if (event !== 'purchase') capiMirror(event, id, ecommerce, extra);
}

// eventos do funil que valem no CAPI (Meta). remove_from_cart não tem evento Meta.
// page_view FORA de propósito: o Pixel do navegador dispara PageView com o
// {{Api Event ID}} (auto do GTM), que a gente não controla por evento. Se o CAPI
// mandasse PageView com outro event_id, o Meta contaria 2. Pra religar server-side:
// trocar o Event ID da tag [FB] PageView no GTM de {{Api Event ID}} p/ {{DL - event_id}}
// e re-adicionar 'page_view' aqui + o track.pageView() no cardapio.js.
const CAPI_EVENTS = new Set(['view_item', 'add_to_cart', 'begin_checkout', 'add_payment_info', 'search', 'generate_lead']);

// espelha um evento do funil pro nosso CAPI (server-side, first-party). Fire-and-forget.
function capiMirror(event, eventId, ecommerce, extra) {
  if (ehLocal() || !CAPI_EVENTS.has(event)) return;
  try {
    const ec = ecommerce || {};
    const ud = (extra && extra.user_data) || {};
    const items = Array.isArray(ec.items) ? ec.items : [];
    fetch('/.netlify/functions/capi', {
      method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        store: CONFIG.STORE_ID, event_name: event, event_id: eventId,
        value: ec.value, currency: ec.currency,
        contents: items.length ? items.map((i) => ({ id: i.item_id, quantity: i.quantity, item_price: i.price })) : undefined,
        content_name: items.length ? items.map((i) => i.item_name).filter(Boolean).join(', ') : undefined,
        user_data: { phone: ud.phone_number, first_name: ud.first_name, last_name: ud.last_name },
        external_id: externalId(),
        fbp: cookie('_fbp') || undefined, fbc: cookie('_fbc') || undefined,
        fbclid: new URLSearchParams(location.search).get('fbclid') || undefined,
        event_source_url: location.href,
      }),
    }).catch(() => {});
  } catch (e) {}
}

const lineToGA = (l) => ({
  item_id: l.refId, item_name: l.prodNome || l.nome, item_category: l.catId || l.tipo,
  price: Number(l.precoUnit?.toFixed?.(2) ?? l.precoUnit), quantity: l.qtd || 1,
});

export const track = {
  // search e generate_lead passam pelo push(): ganham event_id e espelham pro CAPI
  // com o MESMO id do Pixel (dedup), igual aos outros eventos do funil. Antes iam
  // por dataLayer.push cru e NUNCA chegavam no server-side.
  search(term) {
    push('search', {}, { search_term: term });
  },
  // Lead gerado (cliente preencheu nome+telefone no checkout, ou logou pelo telefone).
  generateLead(telefone, nome, stage) {
    const n = (nome || '').trim();
    push('generate_lead', {}, {
      lead_stage: stage,
      user_data: { phone_number: phoneE164(telefone), first_name: n.split(' ')[0] || undefined, last_name: n.split(' ').slice(1).join(' ') || undefined },
    });
  },
  viewItem(item) {
    push('view_item', { currency: 'BRL', value: item.precoFrom, items: [{ item_id: item.id, item_name: item.nome, item_category: item.catId, price: item.precoFrom }] });
  },
  addToCart(line) {
    push('add_to_cart', { currency: 'BRL', value: line.precoUnit * line.qtd, items: [lineToGA(line)] });
  },
  removeFromCart(line) {
    push('remove_from_cart', { currency: 'BRL', value: line.precoUnit * line.qtd, items: [lineToGA(line)] });
  },
  beginCheckout(items, value, coupon) {
    push('begin_checkout', { currency: 'BRL', value, coupon: coupon || undefined, items: items.map(lineToGA) });
  },
  // No passo do pagamento o nome+telefone JÁ foram validados (passo 1), então mandamos
  // o user_data junto pra não desperdiçar match nesse evento de fundo de funil.
  addPaymentInfo(items, value, payment_type, coupon, telefone, nome) {
    const n = (nome || '').trim();
    const ud = {};
    if (telefone) ud.phone_number = phoneE164(telefone);
    if (n) { ud.first_name = n.split(' ')[0] || undefined; ud.last_name = n.split(' ').slice(1).join(' ') || undefined; }
    push('add_payment_info', { currency: 'BRL', value, payment_type, coupon: coupon || undefined, items: items.map(lineToGA) },
      Object.keys(ud).length ? { user_data: ud } : {});
  },
  purchase(order) {
    const nome = (order.customer?.nome || '').trim();
    push('purchase', {
      transaction_id: order.id || order.numero || String(Date.now()),
      currency: 'BRL', value: order.totals.total, shipping: order.totals.taxa,
      coupon: order.coupon || undefined,
      items: order.items.map(lineToGA),
    }, {
      user_data: {
        phone_number: phoneE164(order.customer?.telefone),
        first_name: nome.split(' ')[0] || undefined,
        last_name: nome.split(' ').slice(1).join(' ') || undefined,
        city: 'Votuporanga', region: 'SP', country: 'BR',
      },
    }, purchaseEventId(order));
  },
};

// event_id ESTÁVEL da compra: o mesmo que o nosso CAPI (server) usa -> o Meta
// deduplica navegador x servidor, e reenvio não vira compra nova.
export const purchaseEventId = (order) => (order && order.id ? 'venda_' + order.id : undefined);

// CAPI PRÓPRIO (server-side, no NOSSO domínio = first-party). Manda só o ID do
// pedido: a Function busca o pedido real no banco e monta o payload (ninguém forja
// compra nem infla valor). Fire-and-forget: NUNCA trava a compra do cliente.
export function capiPurchase(order) {
  if (!order || !order.id || ehLocal()) return;
  try {
    const fbclid = new URLSearchParams(location.search).get('fbclid');
    fetch('/.netlify/functions/capi', {
      method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        store: CONFIG.STORE_ID,
        order_id: order.id,
        external_id: externalId(),
        fbp: cookie('_fbp') || undefined,
        fbc: cookie('_fbc') || undefined,
        fbclid: fbclid || undefined,
        event_source_url: location.href,
      }),
    }).catch(() => {});
  } catch (e) {}
}
