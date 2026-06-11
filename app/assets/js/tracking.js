// =============================================================================
// GTM / dataLayer — jornada de e-commerce (GA4) p/ Meta, GA4 e Google Ads.
// Pronto p/ server-side (sGTM / Meta CAPI):
//  - event_id único em todo evento (deduplicação pixel browser x server)
//  - user_data no purchase (telefone E.164, nome, cidade) p/ advanced matching
//    (enviar em claro pro server container; o sGTM/Meta hasheia)
// =============================================================================
window.dataLayer = window.dataLayer || [];

const newEventId = () =>
  (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2));

function push(event, ecommerce, extra = {}) {
  window.dataLayer.push({ ecommerce: null }); // limpa o objeto anterior
  window.dataLayer.push({ event, event_id: newEventId(), ecommerce, ...extra });
}

const lineToGA = (l) => ({
  item_id: l.refId, item_name: l.nome, item_category: l.catId || l.tipo,
  price: Number(l.precoUnit?.toFixed?.(2) ?? l.precoUnit), quantity: l.qtd || 1,
});

// Telefone BR -> E.164 (+5517999998888)
function phoneE164(tel) {
  const d = String(tel || '').replace(/\D/g, '');
  if (d.length === 10 || d.length === 11) return '+55' + d;
  if (d.length === 12 || d.length === 13) return '+' + d;
  return d ? '+' + d : undefined;
}

export const track = {
  search(term) {
    window.dataLayer.push({ event: 'search', event_id: newEventId(), search_term: term });
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
  addPaymentInfo(items, value, payment_type, coupon) {
    push('add_payment_info', { currency: 'BRL', value, payment_type, coupon: coupon || undefined, items: items.map(lineToGA) });
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
    });
  },
};
