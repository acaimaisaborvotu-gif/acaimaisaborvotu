// GTM / dataLayer — jornada de e-commerce (GA4) para distribuir a Meta, GA4 e Google Ads
window.dataLayer = window.dataLayer || [];

function push(event, ecommerce) {
  window.dataLayer.push({ ecommerce: null }); // limpa o objeto anterior
  window.dataLayer.push({ event, ecommerce });
}

const lineToGA = (l) => ({
  item_id: l.refId, item_name: l.nome, item_category: l.catId || l.tipo,
  price: Number(l.precoUnit?.toFixed?.(2) ?? l.precoUnit), quantity: l.qtd || 1,
});

export const track = {
  viewItem(item) {
    push('view_item', { currency: 'BRL', value: item.precoFrom, items: [{ item_id: item.id, item_name: item.nome, item_category: item.catId, price: item.precoFrom }] });
  },
  addToCart(line) {
    push('add_to_cart', { currency: 'BRL', value: line.precoUnit * line.qtd, items: [lineToGA(line)] });
  },
  removeFromCart(line) {
    push('remove_from_cart', { currency: 'BRL', value: line.precoUnit * line.qtd, items: [lineToGA(line)] });
  },
  beginCheckout(items, value) {
    push('begin_checkout', { currency: 'BRL', value, items: items.map(lineToGA) });
  },
  addPaymentInfo(items, value, payment_type) {
    push('add_payment_info', { currency: 'BRL', value, payment_type, items: items.map(lineToGA) });
  },
  purchase(order) {
    push('purchase', {
      transaction_id: order.id || order.numero || String(Date.now()),
      currency: 'BRL', value: order.totals.total, shipping: order.totals.taxa,
      items: order.items.map(lineToGA),
    });
  },
};
