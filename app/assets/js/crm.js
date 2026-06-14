// =============================================================================
// CRM (aba Clientes do painel, só dono) — lista de clientes, abandonos,
// WhatsApp com mensagens prontas, histórico e opt-out. Lê das RPCs do 0006.
// =============================================================================
import { el, money, toast } from './util.js';

let _client = null, _store = '', _storeNome = '', _templates = {};
let _host = null;
let aba = 'clientes';                 // 'clientes' | 'abandonos'
const f = { sort: 'oldest', minDays: null, onlyNew: false, onlyAband: false, search: '', offset: 0, limit: 50 };
const ab = { hours: 720, offset: 0 };  // janela dos abandonos

// Mensagens padrão (a loja edita no painel). {nome} = 1º nome, {loja} = nome da loja.
const TEMPLATES_DEFAULT = {
  inativo: 'Oi {nome}, sentimos sua falta aqui no {loja}! Bateu vontade de açaí? Manda um oi que a gente capricha no seu. 💜',
  abandono: 'Oi {nome}, vi que você começou um pedido aqui no {loja} mas não finalizou. Ficou alguma dúvida? Posso fechar pra você agora se quiser. 🍧',
};
const template = (tipo) => (_templates && _templates[tipo === 'inativo' ? 'waInativo' : 'waAbandono']) || TEMPLATES_DEFAULT[tipo];
const fill = (t, nome) => String(t || '').replace(/\{nome\}/g, ((nome || '').trim().split(' ')[0]) || 'tudo bem?').replace(/\{loja\}/g, _storeNome || 'Açaí Mais Sabor');
const wa = (phone, msg) => `https://wa.me/${String(phone || '').replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`;

export function renderClientes(host, client, storeSlug, storeNome, templates) {
  _host = host; _client = client; _store = storeSlug; _storeNome = storeNome || _storeNome; _templates = templates || {};
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
    el('button', { class: aba === 'abandonos' ? 'active' : '', text: 'Abandonos', onclick: () => { aba = 'abandonos'; paint(); } }),
  ]));
  if (aba === 'clientes') paintClientes(); else paintAbandonos();
}

function chip(label, active, onclick) { return el('button', { class: 'crm-chip' + (active ? ' active' : ''), text: label, onclick }); }
function vazio(msg) { return el('div', { class: 'center muted', style: 'padding:30px 10px' }, [el('div', { style: 'font-size:2rem', text: '👤' }), el('p', { style: 'margin-top:8px', text: msg })]); }

// ---------------------------------------------------------------- Clientes
function paintClientes() {
  const wrap = el('div', { class: 'panel-card' }); _host.append(wrap);
  const lista = el('div', { class: 'crm-lista' });
  const pager = el('div', { class: 'crm-pager' });

  const reload = async () => {
    lista.innerHTML = ''; lista.append(el('p', { class: 'hint', text: 'Carregando...' }));
    const rows = await rpc('crm_customers', { p_store: _store, p_search: f.search || null, p_only_abandoned: f.onlyAband, p_min_days: f.minDays, p_only_new: f.onlyNew, p_sort: f.sort, p_limit: f.limit, p_offset: f.offset });
    lista.innerHTML = '';
    if (!rows.length) {
      lista.append(vazio(f.offset > 0 ? 'Fim da lista.' : 'Nenhum cliente nesse filtro.'));
      pager.innerHTML = '';
      if (f.offset > 0) pager.append(el('button', { class: 'btn btn-ghost mini', text: '‹ Anterior', onclick: () => { f.offset = Math.max(0, f.offset - f.limit); reload(); } }));
      return;
    }
    rows.forEach((c) => lista.append(customerRow(c)));
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

  const chipsBar = el('div', { class: 'crm-chips' });
  const renderChips = () => {
    chipsBar.innerHTML = '';
    const set = (fn) => { fn(); f.offset = 0; renderChips(); reload(); };
    chipsBar.append(
      chip('Todos', !f.minDays && !f.onlyNew && !f.onlyAband, () => set(() => { f.minDays = null; f.onlyNew = false; f.onlyAband = false; })),
      chip('Sem pedir +15d', f.minDays === 15, () => set(() => { f.minDays = 15; f.onlyNew = false; f.onlyAband = false; })),
      chip('+30d', f.minDays === 30, () => set(() => { f.minDays = 30; f.onlyNew = false; f.onlyAband = false; })),
      chip('+60d', f.minDays === 60, () => set(() => { f.minDays = 60; f.onlyNew = false; f.onlyAband = false; })),
      chip('Novos', f.onlyNew, () => set(() => { f.onlyNew = true; f.minDays = null; f.onlyAband = false; })),
      chip('Abandonou', f.onlyAband, () => set(() => { f.onlyAband = true; f.minDays = null; f.onlyNew = false; })),
    );
  };
  renderChips();

  const qtd = el('select', { class: 'crm-select' });
  [10, 20, 50, 100].forEach((n) => { const o = el('option', { value: n, text: n + ' por pág.' }); if (f.limit === n) o.selected = true; qtd.append(o); });
  qtd.addEventListener('change', () => { f.limit = Number(qtd.value); f.offset = 0; reload(); });
  wrap.append(el('div', { class: 'crm-toolbar' }, [busca, ordenar, qtd]), chipsBar, lista, pager);
  reload();
}

function customerRow(c) {
  const dias = c.days_since_last;
  const recencia = dias == null ? '' : dias >= 30 ? 'crm-frio' : dias >= 15 ? 'crm-morno' : '';
  const diasTxt = dias == null ? 'sem pedido' : dias === 0 ? 'pediu hoje' : `há ${dias} dia${dias === 1 ? '' : 's'}`;
  const nome = c.name || '(sem nome)';
  return el('div', { class: 'crm-row' }, [
    el('div', { class: 'crm-info' }, [
      el('b', { text: nome }),
      el('small', { class: 'muted', style: 'display:block', text: c.phone + (c.opt_out ? ' · opt-out' : '') }),
      el('div', { class: 'crm-badges' }, [
        el('span', { class: 'pill', text: `${c.orders_count} pedido${c.orders_count === 1 ? '' : 's'}` }),
        el('span', { class: 'pill', text: money(c.total_spent) }),
        el('span', { class: 'pill ' + recencia, text: diasTxt }),
        c.has_open_lead ? el('span', { class: 'pill', text: '🛒 carrinho aberto' }) : null,
      ]),
    ]),
    el('div', { class: 'crm-acoes' }, [
      c.opt_out ? null : el('a', { class: 'btn btn-whats mini', href: wa(c.phone, fill(template('inativo'), nome)), target: '_blank', rel: 'noopener', title: 'WhatsApp', html: '💬' }),
      el('button', { class: 'btn btn-ghost mini', text: 'Ver', onclick: () => openDrawer(c) }),
    ]),
  ]);
}

async function openDrawer(c) {
  const overlay = el('div', { class: 'overlay' });
  const sheet = el('div', { class: 'sheet' });
  const body = el('div', { class: 'sheet-body' });
  const destroy = () => { overlay.classList.remove('show'); document.body.style.overflow = ''; setTimeout(() => overlay.remove(), 280); };
  sheet.append(
    el('div', { class: 'sheet-foot', style: 'border-top:none;border-bottom:1px solid var(--line)' }, [
      el('b', { text: c.name || c.phone, style: 'flex:1;font-size:1.1rem' }),
      el('button', { class: 'icon-btn', style: 'background:var(--surface-2);color:var(--ink)', html: '&times;', onclick: () => destroy() }),
    ]), body);
  overlay.append(sheet); document.body.append(overlay);
  document.body.style.overflow = 'hidden'; requestAnimationFrame(() => overlay.classList.add('show'));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) destroy(); });

  const ticket = c.orders_count ? c.total_spent / c.orders_count : 0;
  body.append(
    el('a', { class: 'btn btn-whats btn-block', href: wa(c.phone, fill(template('inativo'), c.name)), target: '_blank', rel: 'noopener', html: '💬 Mandar WhatsApp' }),
    el('div', { class: 'crm-badges', style: 'margin:12px 0' }, [
      el('span', { class: 'pill', text: `${c.orders_count} pedidos` }),
      el('span', { class: 'pill', text: 'Total ' + money(c.total_spent) }),
      el('span', { class: 'pill', text: 'Ticket ' + money(ticket) }),
    ]),
  );
  const optInput = el('input', { type: 'checkbox' }); optInput.checked = !!c.opt_out;
  optInput.addEventListener('change', async () => { await rpc('crm_set_opt_out', { p_store: _store, p_phone: c.phone, p_value: optInput.checked }); c.opt_out = optInput.checked; toast('Salvo'); });
  body.append(el('div', { class: 'frow', style: 'margin-bottom:12px' }, [el('label', { text: 'Não enviar marketing (opt-out)' }), el('label', { class: 'switch' }, [optInput, el('span')])]));

  const hist = el('div', {}, el('p', { class: 'hint', text: 'Carregando histórico...' }));
  body.append(hist);
  const pedidos = await rpc('crm_customer_orders', { p_store: _store, p_phone: c.phone, p_limit: 30, p_offset: 0 });
  hist.innerHTML = '';
  if (!pedidos.length) { hist.append(el('p', { class: 'hint', text: 'Sem pedidos registrados.' })); return; }
  pedidos.forEach((o) => {
    const data = (() => { try { return new Date(o.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }); } catch (e) { return ''; } })();
    const itens = (o.items || []).map((i) => `${i.qtd}x ${i.nome}`).join(', ');
    hist.append(el('div', { class: 'opt-group', style: 'margin-bottom:8px' }, [
      el('div', { style: 'display:flex;justify-content:space-between;gap:8px' }, [el('b', { text: `#${String(o.daily_number || 0).padStart(3, '0')} · ${data}` }), el('span', { class: 'oprice', style: 'flex:none', text: money(o.total) })]),
      itens ? el('small', { class: 'muted', style: 'display:block;margin-top:3px', text: itens }) : null,
      o.coupon ? el('small', { class: 'muted', style: 'display:block', text: 'Cupom: ' + o.coupon }) : null,
    ]));
  });
}

// ---------------------------------------------------------------- Abandonos
function paintAbandonos() {
  const wrap = el('div', { class: 'panel-card' }); _host.append(wrap);
  const lista = el('div', { class: 'crm-lista' });

  const reload = async () => {
    lista.innerHTML = ''; lista.append(el('p', { class: 'hint', text: 'Carregando...' }));
    const rows = await rpc('crm_abandoned', { p_store: _store, p_hours: ab.hours, p_limit: 50, p_offset: 0 });
    lista.innerHTML = '';
    if (!rows.length) { lista.append(vazio('Ninguém abandonou nesse período. 🎉')); return; }
    rows.forEach((l) => lista.append(abandonedRow(l)));
  };

  const janela = el('select', { class: 'crm-select' });
  [['24', 'Hoje'], ['168', '7 dias'], ['720', '30 dias']].forEach(([v, t]) => { const o = el('option', { value: v, text: t }); if (ab.hours === Number(v)) o.selected = true; janela.append(o); });
  janela.addEventListener('change', () => { ab.hours = Number(janela.value); reload(); });
  wrap.append(el('div', { class: 'crm-toolbar' }, [el('span', { class: 'hint', style: 'margin:0', text: 'Quem entrou no checkout e não finalizou:' }), janela]), lista);
  reload();
}

function abandonedRow(l) {
  const min = l.minutes_ago || 0;
  const tempo = min < 60 ? `há ${min} min` : min < 1440 ? `há ${Math.floor(min / 60)}h` : `há ${Math.floor(min / 1440)}d`;
  const carrinho = (l.items || []).map((i) => `${i.qtd || 1}x ${i.nome}`).join(', ') || '(carrinho vazio)';
  return el('div', { class: 'crm-row' }, [
    el('div', { class: 'crm-info' }, [
      el('b', { text: l.name || '(sem nome)' }),
      el('small', { class: 'muted', style: 'display:block', text: `${l.phone} · ${tempo}` }),
      el('div', { class: 'crm-badges' }, [
        el('span', { class: 'pill', text: money(l.cart_value) }),
        el('span', { class: 'pill', text: l.ever_bought ? 'já comprou' : 'cliente novo' }),
      ]),
      el('small', { class: 'muted', style: 'display:block;margin-top:3px', text: '🛒 ' + carrinho }),
    ]),
    el('div', { class: 'crm-acoes' }, [
      el('a', { class: 'btn btn-whats mini', href: wa(l.phone, fill(template('abandono'), l.name)), target: '_blank', rel: 'noopener', title: 'WhatsApp', html: '💬' }),
    ]),
  ]);
}
