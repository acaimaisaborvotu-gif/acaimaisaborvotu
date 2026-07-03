// =============================================================================
// CRM (aba Clientes do painel) — base de clientes em tabela limpa: quem é, quantos
// pedidos, quanto gastou, quando foi o último e a SITUAÇÃO (novo / recorrente /
// sumido / carrinho aberto). Clicar abre a JORNADA DE COMPRA do cliente.
// Lê das RPCs do 0006/0007 + crm_stats (0017).
// =============================================================================
import { el, money, toast } from './util.js';

let _client = null, _store = '', _storeNome = '', _templates = {};
let _host = null;
let _isOwner = false;               // só o dono pode cancelar pedido
let aba = 'clientes';                 // 'clientes' | 'abandonos'
const f = { sort: 'oldest', minDays: null, onlyNew: false, onlyAband: false, search: '', offset: 0, limit: 50 };
const ab = { hours: 720 };            // janela dos abandonos

// Mensagens padrão (a loja edita no painel). {nome} = 1º nome, {loja} = nome da loja.
const TEMPLATES_DEFAULT = {
  inativo: 'Oi {nome}, sentimos sua falta aqui no {loja}! Bateu vontade de açaí? Manda um oi que a gente capricha no seu. 💜',
  abandono: 'Oi {nome}, vi que você começou um pedido aqui no {loja} mas não finalizou. Ficou alguma dúvida? Posso fechar pra você agora se quiser. 🍧',
};
const template = (tipo) => (_templates && _templates[tipo === 'inativo' ? 'waInativo' : 'waAbandono']) || TEMPLATES_DEFAULT[tipo];
const fill = (t, nome) => String(t || '').replace(/\{nome\}/g, ((nome || '').trim().split(' ')[0]) || 'tudo bem?').replace(/\{loja\}/g, _storeNome || 'Açaí Mais Sabor');
const wa = (phone, msg) => `https://wa.me/${String(phone || '').replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`;
const dataCurta = (iso) => { try { return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }); } catch (e) { return ''; } };
const dataHora = (iso) => { try { return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };
const diasDesde = (iso) => { try { return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000); } catch (e) { return null; } };
const mesmoDia = (a, b) => { try { return new Date(a).toDateString() === new Date(b).toDateString(); } catch (e) { return false; } };

export function renderClientes(host, client, storeSlug, storeNome, templates, isOwner) {
  _host = host; _client = client; _store = storeSlug; _storeNome = storeNome || _storeNome; _templates = templates || {}; _isOwner = !!isOwner;
  paint();
}

async function rpc(fn, args) {
  try { const { data, error } = await _client.rpc(fn, args); if (error) { toast('Erro: ' + error.message); return []; } return data || []; }
  catch (e) { toast('Falha ao carregar'); return []; }
}

function paint() {
  _host.innerHTML = '';
  _host.append(el('div', { class: 'pn-filters' }, [
    el('button', { class: aba === 'clientes' ? 'active' : '', text: 'Clientes', onclick: () => { aba = 'clientes'; paint(); } }),
    el('button', { class: aba === 'abandonos' ? 'active' : '', text: 'Carrinhos abandonados', onclick: () => { aba = 'abandonos'; paint(); } }),
  ]));
  if (aba === 'clientes') paintClientes(); else paintAbandonos();
}

// Situação principal do cliente (badge única, a mais acionável primeiro).
function situacao(c) {
  if (c.has_open_lead) return ['🛒 Carrinho aberto', 'st-cart'];
  if ((c.orders_count || 0) >= 2) return ['Recorrente', 'st-recor'];
  return ['Novo', 'st-novo'];
}
// Recência do último pedido (com cor: vermelho = sumido).
function recencia(dias) {
  if (dias == null) return ['sem pedido', 'muted'];
  if (dias === 0) return ['hoje', 'rec-hot'];
  const t = `há ${dias} dia${dias === 1 ? '' : 's'}`;
  return [t, dias >= 30 ? 'rec-cold' : dias >= 15 ? 'rec-warm' : ''];
}

// ---------------------------------------------------------------- Clientes
function paintClientes() {
  // Cartões-resumo da base (uma chamada).
  const kpis = el('div', { class: 'kpi-grid' }, el('p', { class: 'hint', text: 'Carregando resumo...' }));
  _host.append(el('div', { class: 'panel-card' }, [el('h3', { text: 'Sua base de clientes' }), kpis]));
  rpc('crm_stats', { p_store: _store }).then((r) => {
    const s = (Array.isArray(r) ? r[0] : r) || {};
    kpis.innerHTML = '';
    kpis.append(
      kpi('Clientes', s.total || 0, 'principal'),
      kpi('Novos (1 pedido)', s.novos || 0),
      kpi('Recorrentes (2+)', s.recorrentes || 0),
      kpi('Sumidos +30d', s.sumidos || 0, (s.sumidos || 0) > 0 ? 'alerta' : ''),
      kpi('🛒 Carrinho aberto', s.carrinho_aberto || 0, (s.carrinho_aberto || 0) > 0 ? 'alerta' : ''),
    );
  });

  const wrap = el('div', { class: 'panel-card' }); _host.append(wrap);
  const corpo = el('div', { style: 'overflow-x:auto' });
  const pager = el('div', { class: 'crm-pager' });

  const reload = async () => {
    corpo.innerHTML = ''; corpo.append(el('p', { class: 'hint', text: 'Carregando...' }));
    const rows = await rpc('crm_customers', { p_store: _store, p_search: f.search || null, p_only_abandoned: f.onlyAband, p_min_days: f.minDays, p_only_new: f.onlyNew, p_sort: f.sort, p_limit: f.limit, p_offset: f.offset });
    corpo.innerHTML = '';
    if (!rows.length) {
      corpo.append(vazio(f.offset > 0 ? 'Fim da lista.' : 'Nenhum cliente nesse filtro.'));
      pager.innerHTML = '';
      if (f.offset > 0) pager.append(el('button', { class: 'btn btn-ghost mini', text: '‹ Anterior', onclick: () => { f.offset = Math.max(0, f.offset - f.limit); reload(); } }));
      return;
    }
    const head = el('tr', {}, ['Cliente', 'Pedidos', 'Total gasto', 'Último pedido', 'Situação', ''].map((h) => el('th', { text: h })));
    const body = rows.map(customerRow);
    corpo.append(el('table', { class: 'atrib-table crm-table' }, [el('thead', {}, head), el('tbody', {}, body)]));
    pager.innerHTML = '';
    pager.append(
      el('button', { class: 'btn btn-ghost mini', text: '‹ Anterior', disabled: f.offset === 0, onclick: () => { f.offset = Math.max(0, f.offset - f.limit); reload(); } }),
      el('span', { class: 'hint', style: 'margin:0', text: `${f.offset + 1}–${f.offset + rows.length}` }),
      el('button', { class: 'btn btn-ghost mini', text: 'Próximos ›', disabled: rows.length < f.limit, onclick: () => { f.offset += f.limit; reload(); } }),
    );
  };

  const busca = el('input', { type: 'search', class: 'crm-search', placeholder: 'Buscar nome ou telefone', value: f.search });
  let tb; busca.addEventListener('input', () => { clearTimeout(tb); tb = setTimeout(() => { f.search = busca.value.trim(); f.offset = 0; reload(); }, 350); });
  const ordenar = el('select', { class: 'crm-select' });
  [['oldest', 'Mais sumido'], ['recent', 'Mais recente'], ['spent', 'Mais gastou'], ['orders', 'Mais pedidos']].forEach(([v, t]) => { const o = el('option', { value: v, text: t }); if (f.sort === v) o.selected = true; ordenar.append(o); });
  ordenar.addEventListener('change', () => { f.sort = ordenar.value; f.offset = 0; reload(); });
  const qtd = el('select', { class: 'crm-select' });
  [20, 50, 100].forEach((n) => { const o = el('option', { value: n, text: n + '/pág' }); if (f.limit === n) o.selected = true; qtd.append(o); });
  qtd.addEventListener('change', () => { f.limit = Number(qtd.value); f.offset = 0; reload(); });

  const chipsBar = el('div', { class: 'crm-chips' });
  const renderChips = () => {
    chipsBar.innerHTML = '';
    const set = (fn) => { fn(); f.offset = 0; renderChips(); reload(); };
    chipsBar.append(
      chip('Todos', !f.minDays && !f.onlyNew && !f.onlyAband, () => set(() => { f.minDays = null; f.onlyNew = false; f.onlyAband = false; })),
      chip('Novos', f.onlyNew, () => set(() => { f.onlyNew = true; f.minDays = null; f.onlyAband = false; })),
      chip('Sumidos +30d', f.minDays === 30, () => set(() => { f.minDays = 30; f.onlyNew = false; f.onlyAband = false; })),
      chip('🛒 Carrinho aberto', f.onlyAband, () => set(() => { f.onlyAband = true; f.minDays = null; f.onlyNew = false; })),
    );
  };
  renderChips();

  wrap.append(el('div', { class: 'crm-toolbar' }, [busca, ordenar, qtd]), chipsBar, corpo, pager);
  reload();
}

function customerRow(c) {
  const nome = c.name || '(sem nome)';
  const [recTxt, recCls] = recencia(c.days_since_last);
  const [stTxt, stCls] = situacao(c);
  const tr = el('tr', { class: 'crm-click' }, [
    el('td', {}, [el('b', { text: nome }), el('small', { class: 'muted', style: 'display:block', text: c.phone + (c.opt_out ? ' · opt-out' : '') })]),
    el('td', { class: 'num', text: String(c.orders_count || 0) }),
    el('td', { class: 'num', text: money(c.total_spent) }),
    el('td', {}, el('span', { class: recCls, text: recTxt })),
    el('td', {}, el('span', { class: 'st-badge ' + stCls, text: stTxt })),
    el('td', { class: 'crm-acoes' }, [
      c.opt_out ? null : el('a', { class: 'btn btn-whats mini', href: wa(c.phone, fill(template('inativo'), nome)), target: '_blank', rel: 'noopener', title: 'WhatsApp', html: '💬', onclick: (e) => e.stopPropagation() }),
      el('button', { class: 'btn btn-ghost mini', text: 'Ver', onclick: (e) => { e.stopPropagation(); openDrawer(c); } }),
    ]),
  ]);
  tr.addEventListener('click', () => openDrawer(c));
  return tr;
}

// Drawer com a JORNADA DE COMPRA. Recalcula tudo dos pedidos reais (serve pro
// cliente da lista E pro abandono que já comprou). openCart (opcional) = carrinho
// aberto atual, mostrado no topo quando vem da aba de abandonos.
async function openDrawer(c, openCart) {
  const overlay = el('div', { class: 'overlay' });
  const sheet = el('div', { class: 'sheet' });
  const body = el('div', { class: 'sheet-body' });
  const destroy = () => { overlay.classList.remove('show'); document.body.style.overflow = ''; setTimeout(() => overlay.remove(), 280); };
  sheet.append(
    el('div', { class: 'sheet-foot', style: 'border-top:none;border-bottom:1px solid var(--line)' }, [
      el('div', { style: 'flex:1;min-width:0' }, [el('b', { text: c.name || c.phone, style: 'font-size:1.1rem' }), el('small', { class: 'muted', style: 'display:block', text: c.phone })]),
      el('button', { class: 'icon-btn', style: 'background:var(--surface-2);color:var(--ink)', html: '&times;', onclick: () => destroy() }),
    ]), body);
  overlay.append(sheet); document.body.append(overlay);
  document.body.style.overflow = 'hidden'; requestAnimationFrame(() => overlay.classList.add('show'));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) destroy(); });

  body.append(el('p', { class: 'hint', text: 'Carregando jornada...' }));

  const render = async () => {
    const pedidos = await rpc('crm_customer_orders', { p_store: _store, p_phone: c.phone, p_limit: 50, p_offset: 0 });
    const validos = pedidos.filter((o) => o.status !== 'cancelado');
    const totalGasto = validos.reduce((s, o) => s + (Number(o.total) || 0), 0);
    const ticket = validos.length ? totalGasto / validos.length : 0;
    const desde = validos.length ? validos[validos.length - 1].created_at : null; // 1º pedido (lista é desc)
    const ultimo = validos.length ? validos[0].created_at : null;
    const diasUlt = ultimo ? diasDesde(ultimo) : null;

    body.innerHTML = '';
    body.append(el('a', { class: 'btn btn-whats btn-block', href: wa(c.phone, fill(template('inativo'), c.name)), target: '_blank', rel: 'noopener', html: '💬 Mandar WhatsApp' }));

    // Mini-resumo do cliente.
    body.append(el('div', { class: 'kpi-grid', style: 'margin:12px 0' }, [
      kpi('Pedidos', String(validos.length), 'principal'),
      kpi('Total gasto', money(totalGasto)),
      kpi('Ticket médio', money(ticket)),
      kpi('Cliente desde', desde ? dataCurta(desde) : '—'),
    ]));

    // Alerta de situação (o que Nathan quer ver: comprou e sumiu? só 1x?).
    if (validos.length === 0) {
      body.append(banner('Nunca finalizou uma compra (só carrinho/lead).', 'warn'));
    } else if (diasUlt != null && diasUlt >= 30) {
      const so1 = validos.length === 1;
      body.append(banner(`⚠️ ${so1 ? 'Comprou 1x e sumiu' : 'Cliente recorrente que sumiu'} — sem pedir há ${diasUlt} dias. Hora de reativar.`, 'alerta'));
    } else if (validos.length >= 2) {
      body.append(banner(`💜 Cliente fiel: ${validos.length} pedidos. Último há ${diasUlt} dia${diasUlt === 1 ? '' : 's'}.`, 'ok'));
    }

    // Carrinho aberto atual (quando veio da aba de abandonos) — com data pra comparar.
    if (openCart) {
      const itensCart = (openCart.items || []).map((i) => `${i.qtd || 1}x ${i.nome}`).join(', ') || '(vazio)';
      const cartTs = openCart.updated_at || openCart.created_at;
      const sobra = ultimo && cartTs && mesmoDia(cartTs, ultimo);
      body.append(el('div', { class: 'opt-group', style: 'margin-top:14px;border:1px dashed var(--magenta)' }, [
        el('div', { style: 'display:flex;justify-content:space-between;gap:8px;align-items:center' }, [
          el('b', { text: '🛒 Carrinho aberto (não finalizado)' }),
          el('span', { class: 'oprice', style: 'flex:none', text: money(openCart.cart_value) }),
        ]),
        el('small', { class: 'muted', style: 'display:block;margin-top:3px', text: itensCart }),
        el('small', { class: 'muted', style: 'display:block', text: 'Adicionado: ' + dataHora(cartTs) }),
        sobra ? el('small', { style: 'display:block;margin-top:2px;color:var(--amarelo-dark);font-weight:600', text: '⚠️ mesmo dia da última compra — pode ser sobra do pedido' }) : null,
      ]));
    }

    // Linha do tempo de pedidos.
    body.append(el('h3', { style: 'margin:14px 0 8px', text: 'Histórico de pedidos' }));
    if (!validos.length && !pedidos.length) { body.append(el('p', { class: 'hint', text: 'Sem pedidos registrados.' })); }
    pedidos.forEach((o, idx) => {
      const cancelado = o.status === 'cancelado';
      const itens = (o.items || []).map((i) => `${i.qtd}x ${i.nome}`).join(', ');
      const ordinal = pedidos.length - idx; // 1º = mais antigo
      body.append(el('div', { class: 'opt-group', style: 'margin-bottom:8px' + (cancelado ? ';opacity:.55' : '') }, [
        el('div', { style: 'display:flex;justify-content:space-between;gap:8px;align-items:center' }, [
          el('b', { text: `${ordinal}º pedido · ${dataCurta(o.created_at)}` }),
          el('span', { class: 'oprice', style: 'flex:none', text: money(o.total) }),
        ]),
        itens ? el('small', { class: 'muted', style: 'display:block;margin-top:3px', text: itens }) : null,
        o.coupon ? el('small', { class: 'muted', style: 'display:block', text: '🎟️ ' + o.coupon }) : null,
        el('div', { style: 'margin-top:6px' },
          cancelado
            ? el('span', { class: 'st-badge st-cancel', text: 'Cancelado' })
            : (_isOwner ? el('button', { class: 'btn btn-ghost mini', style: 'color:var(--danger)', text: 'Cancelar pedido', onclick: () => cancelarPedido(o, render) }) : null)),
      ]));
    });

    // Opt-out (LGPD), discreto no rodapé.
    const optInput = el('input', { type: 'checkbox' }); optInput.checked = !!c.opt_out;
    optInput.addEventListener('change', async () => { await rpc('crm_set_opt_out', { p_store: _store, p_phone: c.phone, p_value: optInput.checked }); c.opt_out = optInput.checked; toast('Salvo'); });
    body.append(el('div', { class: 'frow', style: 'margin-top:14px;padding-top:12px;border-top:1px solid var(--line)' }, [el('label', { class: 'muted', text: 'Não enviar marketing (opt-out)' }), el('label', { class: 'switch' }, [optInput, el('span')])]));
  };
  render();
}

// Cancela um pedido (inclusive já entregue): sai do faturamento e do total do cliente.
async function cancelarPedido(o, reRender) {
  if (!_isOwner) return toast('Só o dono pode cancelar pedido.');
  const num = o.daily_number ? '#' + String(o.daily_number).padStart(3, '0') : 'esse pedido';
  if (!confirm(`Cancelar ${num}? Ele sai do faturamento e do total gasto do cliente.`)) return;
  const { error } = await _client.from('orders').update({ status: 'cancelado' }).eq('id', o.id);
  if (error) { toast('Erro ao cancelar'); return; }
  toast(`${num} cancelado. Saiu do faturamento.`);
  reRender();
}

// ---------------------------------------------------------------- Abandonos
function paintAbandonos() {
  const wrap = el('div', { class: 'panel-card' }); _host.append(wrap);
  const lista = el('div', { class: 'crm-lista' });

  const reload = async () => {
    lista.innerHTML = ''; lista.append(el('p', { class: 'hint', text: 'Carregando...' }));
    const rows = await rpc('crm_abandoned', { p_store: _store, p_hours: ab.hours, p_limit: 50, p_offset: 0 });
    lista.innerHTML = '';
    if (!rows.length) { lista.append(vazio('Ninguém abandonou o carrinho nesse período. 🎉')); return; }
    rows.forEach((l) => lista.append(abandonedRow(l)));
  };

  const janela = el('select', { class: 'crm-select' });
  [['24', 'Hoje'], ['168', '7 dias'], ['720', '30 dias']].forEach(([v, t]) => { const o = el('option', { value: v, text: t }); if (ab.hours === Number(v)) o.selected = true; janela.append(o); });
  janela.addEventListener('change', () => { ab.hours = Number(janela.value); reload(); });
  wrap.append(el('div', { class: 'crm-toolbar' }, [el('span', { class: 'hint', style: 'margin:0', text: 'Entrou no checkout e não finalizou:' }), janela]), lista);
  reload();
}

function abandonedRow(l) {
  const min = l.minutes_ago || 0;
  const tempo = min < 60 ? `há ${min} min` : min < 1440 ? `há ${Math.floor(min / 60)}h` : `há ${Math.floor(min / 1440)}d`;
  const carrinho = (l.items || []).map((i) => `${i.qtd || 1}x ${i.nome}`).join(', ') || '(carrinho vazio)';
  const jaCliente = !!l.ever_bought;
  const cartTs = l.updated_at || l.created_at;
  const sobra = jaCliente && l.last_order_at && cartTs && mesmoDia(cartTs, l.last_order_at);
  return el('div', { class: 'crm-row' }, [
    el('div', { class: 'crm-info' }, [
      el('div', { style: 'display:flex;align-items:center;gap:8px;flex-wrap:wrap' }, [
        el('b', { text: l.name || '(sem nome)' }),
        el('span', { class: 'st-badge ' + (jaCliente ? 'st-recor' : 'st-novo'), text: jaCliente ? 'já é cliente' : 'nunca comprou' }),
      ]),
      el('small', { class: 'muted', style: 'display:block;margin-top:2px', text: l.phone }),
      el('div', { class: 'crm-badges', style: 'margin-top:5px' }, [
        el('span', { class: 'pill', text: money(l.cart_value) }),
      ]),
      el('small', { class: 'muted', style: 'display:block;margin-top:3px', text: '🛒 ' + carrinho }),
      el('small', { class: 'muted', style: 'display:block;margin-top:3px', text: `Carrinho: ${dataHora(cartTs)} · ${tempo}` + (jaCliente && l.last_order_at ? `  ·  última compra: ${dataCurta(l.last_order_at)}` : '') }),
      sobra ? el('small', { style: 'display:block;margin-top:2px;color:var(--amarelo-dark);font-weight:600', text: '⚠️ carrinho no mesmo dia da última compra — pode ser sobra do pedido' }) : null,
    ]),
    el('div', { class: 'crm-acoes' }, [
      jaCliente ? el('button', { class: 'btn btn-ghost mini', text: 'Histórico', onclick: () => openDrawer({ phone: l.phone, name: l.name }, l) }) : null,
      el('a', { class: 'btn btn-whats mini', href: wa(l.phone, fill(template('abandono'), l.name)), target: '_blank', rel: 'noopener', title: 'WhatsApp', html: '💬' }),
    ]),
  ]);
}

// ------------------------------------------------------------------- helpers
function chip(label, active, onclick) { return el('button', { class: 'crm-chip' + (active ? ' active' : ''), text: label, onclick }); }
function vazio(msg) { return el('div', { class: 'center muted', style: 'padding:30px 10px' }, [el('div', { style: 'font-size:2rem', text: '👤' }), el('p', { style: 'margin-top:8px', text: msg })]); }
function kpi(label, valor, mod) { return el('div', { class: 'kpi' + (mod ? ' kpi-' + mod : '') }, [el('div', { class: 'kpi-val', text: String(valor) }), el('div', { class: 'kpi-lbl', text: label })]); }
function banner(txt, tone) { return el('div', { class: 'crm-banner crm-banner-' + (tone || 'ok'), text: txt }); }
