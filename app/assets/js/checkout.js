// =============================================================================
// CHECKOUT em etapas: 1) nome+telefone  2) endereço/retirada  3) pagamento
// Calcula taxa, tempo dinâmico, bloqueia fora do horário, envia o pedido.
// =============================================================================

import { el, money, toast, maskPhone, phoneCanon, phoneValido, ICON_WHATS } from './util.js';
import * as cart from './cart.js';
import { getStore, getSettings, isOpenNow, tempoEntrega, submitOrder, openOrdersCount, validarCupom, captureLead } from './data.js';
import { track } from './tracking.js';

const PAGAMENTOS = {
  pix: { nome: 'PIX na entrega', emoji: '⚡' },
  cartao: { nome: 'Cartão na maquininha', emoji: '💳' },
  dinheiro: { nome: 'Dinheiro', emoji: '💵' },
};

export function openCheckout({ openOrders: ooInicial = 0 } = {}) {
  const settings = getSettings();
  const store = getStore();
  const items = cart.getItems();
  if (!items.length) { toast('Sua sacola está vazia'); return; }

  // Pedidos abertos (tempo dinâmico): busca por trás, sem segurar a abertura do checkout.
  let openOrders = ooInicial;
  openOrdersCount().then((n) => { openOrders = n; }).catch(() => {});
  let leadEnviado = false; // captura de abandono dispara 1x por checkout

  let saved = {}; try { saved = JSON.parse(localStorage.getItem('ams_cliente') || '{}'); } catch (e) {}
  const state = {
    step: 1, nome: saved.nome || '', telefone: saved.telefone || '',
    tipo: 'entrega', rua: saved.rua || '', numero: saved.numero || '', bairro: saved.bairro || '',
    complemento: saved.complemento || '', referencia: saved.referencia || '', obs: '',
    metodo: settings.pagamentos[0], trocoPara: '', cupom: null,
  };
  const sub = cart.subtotal();
  const taxa = () => (state.tipo === 'entrega' ? settings.taxaEntrega : 0);
  const desconto = () => state.cupom?.desconto || 0;
  const total = () => Math.max(0, sub + taxa() - desconto());

  // shell
  const overlay = el('div', { class: 'overlay' });
  const sheet = el('div', { class: 'sheet' });
  const head = el('div', { class: 'sheet-foot', style: 'border-top:none;border-bottom:1px solid var(--line);justify-content:flex-start;gap:10px' });
  const back = el('button', { class: 'icon-btn', style: 'background:var(--surface-2);color:var(--ink)', html: '&#8592;' });
  const htitle = el('b', { text: 'Finalizar pedido', style: 'font-size:1.05rem' });
  head.append(back, htitle);
  const body = el('div', { class: 'sheet-body' });
  const foot = el('div', { class: 'sheet-foot' });
  sheet.append(head, body, foot);
  overlay.append(sheet);
  document.body.append(overlay);
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => overlay.classList.add('show'));
  const destroy = () => { overlay.classList.remove('show'); document.body.style.overflow = ''; setTimeout(() => overlay.remove(), 280); };
  overlay.addEventListener('click', (e) => { if (e.target === overlay) destroy(); });
  back.addEventListener('click', () => { if (state.step === 1) destroy(); else { state.step--; render(); } });

  track.beginCheckout(items, total());

  function field(label, input) { return el('label', { class: 'opt-group', style: 'display:block' }, [el('div', { class: 'opt-head' }, el('div', { class: 't', text: label })), input]); }
  const inputStyle = 'width:100%;border:1.5px solid var(--line);border-radius:12px;padding:13px;outline:none';

  function stepCustomer() {
    body.innerHTML = '';
    const nome = el('input', { style: inputStyle, placeholder: 'Seu nome', value: state.nome, autocomplete: 'name' });
    const tel = el('input', { style: inputStyle, placeholder: '(17) 99999-9999', value: state.telefone, type: 'tel', inputmode: 'tel', autocomplete: 'tel' });
    nome.addEventListener('input', () => state.nome = nome.value);
    // Mascara robusta + escuta 'change' tambem, pra pegar autofill que nao dispara 'input'.
    const aplicaTel = () => { tel.value = maskPhone(tel.value); state.telefone = tel.value; };
    tel.addEventListener('input', aplicaTel);
    tel.addEventListener('change', aplicaTel);
    body.append(
      el('div', { class: 'sheet-title', text: 'Pra começar' }),
      el('div', { class: 'sheet-desc', text: 'Só o nome e o telefone pra identificar o pedido.' }),
      field('Nome', nome), field('Telefone / WhatsApp', tel),
    );
    setFoot('Continuar', () => {
      // Re-le direto dos campos: cobre autofill que preencheu sem disparar evento.
      state.nome = nome.value.trim();
      state.telefone = maskPhone(tel.value);
      if (state.nome.length < 2) return toast('Digite seu nome');
      if (!phoneValido(state.telefone)) return toast('Telefone inválido. Confira o DDD e o número.');
      // captura de abandono (best-effort, nao trava o fluxo) + lead no GTM, 1x por checkout
      if (!leadEnviado) {
        leadEnviado = true;
        captureLead({ telefone: state.telefone, nome: state.nome, items: cart.getItems(), cartValue: cart.subtotal(), step: 1 });
        track.generateLead(state.telefone, state.nome, 'checkout_step1');
      }
      // pre-salva nome+telefone (a versao completa e salva ao finalizar)
      try { const cur = JSON.parse(localStorage.getItem('ams_cliente') || '{}'); localStorage.setItem('ams_cliente', JSON.stringify({ ...cur, nome: state.nome, telefone: state.telefone })); } catch (e) {}
      state.step = 2; render();
    });
  }

  function stepDelivery() {
    body.innerHTML = '';
    const seg = el('div', { style: 'display:flex;gap:8px;margin:6px 0 4px' });
    ['entrega', 'retirada'].forEach((t) => {
      const b = el('button', { class: 'btn ' + (state.tipo === t ? 'btn-primary' : 'btn-ghost'), style: 'flex:1', text: t === 'entrega' ? '🛵 Entrega' : '🏪 Retirada' });
      b.addEventListener('click', () => { state.tipo = t; render(); });
      seg.append(b);
    });
    body.append(el('div', { class: 'sheet-title', text: 'Como prefere receber?' }), seg);

    const inp = (key, ph) => {
      const i = el('input', { style: inputStyle, placeholder: ph, value: state[key] });
      i.addEventListener('input', () => state[key] = i.value);
      return i;
    };

    if (state.tipo === 'entrega') {
      const ruaNum = el('div', { style: 'display:flex;gap:8px' }, [
        el('div', { style: 'flex:3' }, inp('rua', 'Rua / Avenida')),
        el('div', { style: 'flex:1.1' }, inp('numero', 'Número')),
      ]);
      body.append(
        field('Rua e número', ruaNum),
        field('Bairro', inp('bairro', 'Seu bairro')),
        field('Complemento', inp('complemento', 'Apto, bloco, casa (opcional)')),
        field('Ponto de referência', inp('referencia', 'Perto de... (opcional)')),
        el('div', { class: 'pill', style: 'margin-top:4px', html: '📍 Cidade <b>&nbsp;Votuporanga/SP</b>' }),
        el('div', { class: 'muted', style: 'font-size:.8rem;margin-top:6px', text: 'Entregas somente para Votuporanga/SP.' }),
      );
    } else {
      body.append(el('div', { class: 'sheet-desc', style: 'margin-top:8px', text: `Retirar na loja: ${store.endereco}` }));
    }

    const ta = el('textarea', { class: 'obs', placeholder: 'Alguma observação pro pedido? (opcional)', maxlength: '200' });
    ta.value = state.obs; ta.addEventListener('input', () => state.obs = ta.value);
    body.append(field('Observação', ta));

    setFoot('Continuar', () => {
      if (state.tipo === 'entrega') {
        if (state.rua.trim().length < 3) return toast('Informe a rua');
        if (!state.numero.trim()) return toast('Informe o número (ou S/N)');
        if (state.bairro.trim().length < 2) return toast('Informe o bairro');
      }
      state.step = 3; render();
    });
  }

  function stepPayment() {
    body.innerHTML = '';
    body.append(el('div', { class: 'sheet-title', text: 'Pagamento na entrega' }), el('div', { class: 'sheet-desc', text: 'Você paga na hora que receber.' }));
    const gp = el('div', { class: 'opt-group' });
    settings.pagamentos.forEach((m) => {
      const sel = state.metodo === m;
      const row = el('button', { class: 'opt' + (sel ? ' sel' : ''), type: 'button' }, [
        el('span', { style: 'font-size:1.2rem', text: PAGAMENTOS[m].emoji }),
        el('span', { class: 'oname', text: PAGAMENTOS[m].nome }),
        el('span', { class: 'mark', html: sel ? '&#10003;' : '' }),
      ]);
      row.addEventListener('click', () => { state.metodo = m; render(); });
      gp.append(row);
    });
    body.append(gp);

    if (state.metodo === 'dinheiro') {
      const troco = el('input', { style: inputStyle, type: 'tel', inputmode: 'numeric', placeholder: 'Troco para quanto? (opcional)', value: state.trocoPara });
      troco.addEventListener('input', () => state.trocoPara = troco.value.replace(/[^\d,.-]/g, ''));
      body.append(field('Troco', troco));
    }

    // Cupom de desconto
    const cupomBox = el('div', { class: 'opt-group' });
    cupomBox.append(el('div', { class: 'opt-head' }, el('div', { class: 't', text: 'Cupom de desconto' })));
    if (state.cupom) {
      cupomBox.append(el('div', { class: 'opt sel', style: 'justify-content:space-between' }, [
        el('span', { class: 'oname', html: `✅ <b>${state.cupom.codigo}</b> aplicado (${'-' + money(state.cupom.desconto)})` }),
        el('button', { class: 'btn btn-ghost mini', type: 'button', text: 'Remover', onclick: () => { state.cupom = null; render(); } }),
      ]));
    } else {
      const inp = el('input', { style: inputStyle + ';text-transform:uppercase;flex:1', placeholder: 'Tem um cupom? Digite aqui', value: '' });
      const aplicar = () => {
        const r = validarCupom(inp.value, sub);
        if (!r.ok) return toast(r.msg);
        state.cupom = r; toast(r.msg); render();
      };
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); aplicar(); } });
      cupomBox.append(el('div', { style: 'display:flex;gap:8px' }, [inp, el('button', { class: 'btn btn-ghost', type: 'button', style: 'flex:0 0 auto', text: 'Aplicar', onclick: aplicar })]));
    }
    body.append(cupomBox);

    // Resumo
    const resumo = el('div', { class: 'opt-group' });
    resumo.append(el('div', { class: 'opt-head' }, el('div', { class: 't', text: 'Resumo' })));
    items.forEach((i) => resumo.append(el('div', { class: 'opt', style: 'align-items:flex-start' }, [
      el('span', { class: 'oname', html: `<b>${i.qtd}x</b> ${i.print?.titulo || i.nome}${i.print?.detalhes?.length ? `<br><small class="muted">${i.print.detalhes.join(', ')}</small>` : ''}` }),
      el('span', { class: 'oprice', text: money(i.precoUnit * i.qtd) }),
    ])));
    const lin = (l, v, bold, cor) => el('div', { style: `display:flex;justify-content:space-between;padding:4px 2px;${bold ? 'font-weight:900;font-size:1.05rem' : `color:${cor || 'var(--ink-soft)'}`}` }, [el('span', { text: l }), el('span', { text: v })]);
    resumo.append(lin('Subtotal', money(sub)), lin(state.tipo === 'entrega' ? 'Taxa de entrega' : 'Retirada', state.tipo === 'entrega' ? money(taxa()) : 'Grátis'));
    if (state.cupom) resumo.append(lin(`Desconto (${state.cupom.codigo})`, '-' + money(desconto()), false, 'var(--ok)'));
    resumo.append(lin('Total', money(total()), true));
    body.append(resumo);

    const aberto = isOpenNow(settings);
    const min = settings.pedidoMinimo || 0;
    const abaixoMin = min > 0 && sub < min;
    const label = !aberto ? 'Loja fechada' : abaixoMin ? `Pedido mínimo ${money(min)}` : `Enviar pedido • ${money(total())}`;
    setFoot(label, async () => {
      if (!aberto) return toast('Estamos fechados no momento');
      if (abaixoMin) return toast(`Pedido mínimo de ${money(min)}`);
      track.addPaymentInfo(items, total(), state.metodo, state.cupom?.codigo);
      await finalize();
    }, !aberto || abaixoMin);
  }

  async function finalize() {
    const btn = foot.querySelector('button.btn-primary');
    btn.disabled = true; btn.innerHTML = 'Enviando...';
    const eta = tempoEntrega(openOrders, settings);
    const obsTxt = state.obs.trim();
    let endereco = '';
    if (state.tipo === 'entrega') {
      endereco = `${state.rua.trim()}, ${state.numero.trim()}${state.complemento.trim() ? ' - ' + state.complemento.trim() : ''} - ${state.bairro.trim()} - Votuporanga/SP${state.referencia.trim() ? ' (Ref: ' + state.referencia.trim() + ')' : ''}`;
    }
    if (obsTxt) endereco += (endereco ? ' | ' : '') + 'Obs: ' + obsTxt;
    const order = {
      customer: { nome: state.nome.trim(), telefone: state.telefone.trim() },
      items: items.map((i) => ({ nome: i.print?.titulo || i.nome, detalhes: i.print?.detalhes || [], extras: i.print?.extras || [], grupos: i.print?.grupos || [], qtd: i.qtd, precoUnit: i.precoUnit, tipo: i.tipo, refId: i.refId, catId: i.catId })),
      totals: { subtotal: sub, taxa: taxa(), desconto: desconto(), total: total() },
      coupon: state.cupom?.codigo || null,
      payment: { metodo: state.metodo, trocoPara: state.metodo === 'dinheiro' ? state.trocoPara : '' },
      delivery: { tipo: state.tipo, endereco, etaMin: state.tipo === 'entrega' ? eta.min : settings.retiradaMinutos, etaMax: state.tipo === 'entrega' ? eta.max : settings.retiradaMinutos },
    };
    order.whatsappText = buildWhatsApp(order, store);
    // salva os dados do cliente no aparelho pra próxima vez
    try { localStorage.setItem('ams_cliente', JSON.stringify({ nome: state.nome.trim(), telefone: state.telefone.trim(), rua: state.rua.trim(), numero: state.numero.trim(), bairro: state.bairro.trim(), complemento: state.complemento.trim(), referencia: state.referencia.trim() })); } catch (e) {}
    try {
      const res = await submitOrder(order);
      order.id = res.id; order.numero = res.numero;
      track.purchase(order);
      // guarda o pedido no aparelho pra ele acompanhar o status no cardápio
      if (res.id) {
        try {
          localStorage.setItem('ams_pedido', JSON.stringify({
            id: res.id, numero: res.numero, status: 'novo', tipo: order.delivery.tipo,
            etaMin: order.delivery.etaMin, etaMax: order.delivery.etaMax, ts: Date.now(),
          }));
        } catch (e) {}
      }
      cart.clear();
      showSuccess(res, order);
    } catch (e) {
      console.error(e);
      btn.disabled = false; btn.innerHTML = `Enviar pedido • ${money(total())}`;
      toast('Não consegui enviar. Tente de novo.');
    }
  }

  function showSuccess(res, order) {
    head.classList.add('hidden'); foot.classList.add('hidden');
    body.innerHTML = '';
    const numTxt = res.numero ? `#${String(res.numero).padStart(3, '0')}` : '';
    const waNum = phoneCanon(store.whatsapp);
    const waMsg = `Olá! Fiz o pedido ${numTxt || 'pelo cardápio'} e gostaria de tirar uma dúvida.`;
    body.append(
      el('div', { style: 'text-align:center;padding:30px 10px' }, [
        el('div', { style: 'font-size:3.4rem', text: '🎉' }),
        el('div', { class: 'sheet-title', style: 'margin-top:8px', text: 'Pedido enviado!' }),
        el('div', { class: 'sheet-desc', style: 'margin-top:6px', html: res.numero ? `Seu número é <b>${numTxt}</b>.` : 'A loja já recebeu seu pedido.' }),
        el('div', { class: 'sheet-desc', style: 'margin-top:4px', text: order.delivery.tipo === 'entrega' ? `Chega em aprox. ${order.delivery.etaMin} a ${order.delivery.etaMax} min.` : `Pronto pra retirar em aprox. ${order.delivery.etaMin} min.` }),
        res.id ? el('div', { class: 'pill pill-ok', style: 'margin-top:14px', text: '👀 Acompanhe o status no topo do cardápio' }) : null,
        res.via === 'whatsapp' ? el('div', { class: 'pill', style: 'margin-top:14px', text: 'Confirme o envio no WhatsApp que abriu' }) : null,
        waNum ? el('a', { class: 'btn btn-whats btn-block', style: 'margin-top:22px', href: `https://wa.me/${waNum}?text=${encodeURIComponent(waMsg)}`, target: '_blank', rel: 'noopener', html: ICON_WHATS + ' Tirar dúvida no WhatsApp' }) : null,
        el('button', { class: 'btn btn-ghost btn-block', style: 'margin-top:10px', text: 'Voltar ao cardápio', onclick: () => { destroy(); location.reload(); } }),
      ]),
    );
  }

  function setFoot(label, onClick, disabled = false) {
    foot.innerHTML = '';
    const btn = el('button', { class: 'btn btn-primary btn-block', type: 'button', html: label });
    btn.disabled = disabled;
    btn.addEventListener('click', onClick);
    foot.append(btn);
  }

  function render() {
    [stepCustomer, stepDelivery, stepPayment][state.step - 1]();
    htitle.textContent = ['Seus dados', 'Entrega', 'Pagamento'][state.step - 1];
  }
  render();
}

function buildWhatsApp(o, store) {
  const L = [];
  L.push(`*Novo pedido | ${store.nome}*`, '');
  L.push(`*Cliente:* ${o.customer.nome}`);
  L.push(`*Telefone:* ${o.customer.telefone}`);
  L.push(`*Tipo:* ${o.delivery.tipo === 'entrega' ? 'Entrega' : 'Retirada na loja'}`);
  if (o.delivery.endereco) L.push(`*Endereço:* ${o.delivery.endereco}`);
  L.push('', '*Itens:*');
  o.items.forEach((i) => { L.push(`${i.qtd}x ${i.nome}` + (i.detalhes?.length ? ` (${i.detalhes.join(', ')})` : '') + ` = ${money(i.precoUnit * i.qtd)}`); });
  L.push('', `Subtotal: ${money(o.totals.subtotal)}`);
  L.push(o.delivery.tipo === 'entrega' ? `Taxa de entrega: ${money(o.totals.taxa)}` : 'Retirada: sem taxa');
  if (o.totals.desconto > 0) L.push(`Desconto${o.coupon ? ' (' + o.coupon + ')' : ''}: -${money(o.totals.desconto)}`);
  L.push(`*Total: ${money(o.totals.total)}*`);
  const pg = { pix: 'PIX na entrega', cartao: 'Cartão na maquininha', dinheiro: 'Dinheiro' }[o.payment.metodo];
  L.push('', `*Pagamento:* ${pg}` + (o.payment.metodo === 'dinheiro' && o.payment.trocoPara ? ` (troco para R$ ${o.payment.trocoPara})` : ''));
  return L.join('\n');
}
