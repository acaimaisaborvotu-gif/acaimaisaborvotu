// =============================================================================
// ATRIBUIÇÃO (aba do painel, só dono) — de onde vieram as vendas, com VALOR REAL.
// Lê das RPCs do 0014 (attribution_summary / attribution_orders). Fuso da loja;
// cancelado fica fora. É a fonte da verdade da loja (não depende do Meta).
// =============================================================================
import { el, money, toast } from './util.js';

let _client = null, _store = '', _host = null;
let periodo = '7d';
let customDe = null, customAte = null;
// 'last' = onde a pessoa FECHOU (último clique) | 'first' = por onde ela ENTROU (o
// anúncio/canal que a trouxe). O toggle troca o crédito do funil + resumo.
let _touch = 'last';
// dados carregados + filtro por origem (clicar no funil filtra as vendas)
let _corpo = null, _resumo = [], _funil = [], _pedidos = [], _filtro = null;

export function renderAttribution(host, client, storeSlug) {
  _host = host; _client = client; _store = storeSlug;
  paint();
}

async function rpc(fn, args) {
  try { const { data, error } = await _client.rpc(fn, args); if (error) { toast('Erro: ' + error.message); return null; } return data; }
  catch (e) { toast('Falha ao carregar'); return null; }
}

const ymd = (d) => d.toISOString().slice(0, 10);
function minusDays(base, n) { const x = new Date(base); x.setDate(x.getDate() - n); return ymd(x); }

async function intervalo() {
  if (periodo === 'custom' && customDe && customAte) return customDe <= customAte ? [customDe, customAte] : [customAte, customDe];
  let hoje = await rpc('today_local');
  hoje = Array.isArray(hoje) ? (hoje[0]?.today_local || hoje[0]) : hoje;
  if (!hoje) hoje = ymd(new Date());
  const base = new Date(hoje + 'T12:00:00');
  return ({ hoje: [hoje, hoje], '7d': [minusDays(base, 6), hoje], '30d': [minusDays(base, 29), hoje], mes: [hoje.slice(0, 8) + '01', hoje] })[periodo] || [minusDays(base, 6), hoje];
}

function paint() {
  _host.innerHTML = '';
  const presets = [['hoje', 'Hoje'], ['7d', '7 dias'], ['30d', '30 dias'], ['mes', 'Mês'], ['custom', 'Personalizado']];
  _host.append(el('div', { class: 'pn-filters' }, presets.map(([id, label]) => {
    const b = el('button', { class: id === periodo ? 'active' : '', text: label });
    b.addEventListener('click', () => { periodo = id; paint(); });
    return b;
  })));
  if (periodo === 'custom') {
    const de = el('input', { type: 'date', class: 'crm-select', value: customDe || '' });
    const ate = el('input', { type: 'date', class: 'crm-select', value: customAte || '' });
    const aplicar = el('button', { class: 'btn btn-ghost mini', text: 'Aplicar', onclick: () => { if (!de.value || !ate.value) return toast('Escolha as duas datas'); customDe = de.value; customAte = ate.value; paint(); } });
    _host.append(el('div', { class: 'crm-toolbar', style: 'margin-top:8px' }, [el('span', { class: 'hint', style: 'margin:0', text: 'De' }), de, el('span', { class: 'hint', style: 'margin:0', text: 'até' }), ate, aplicar]));
  }
  // Toggle do crédito: primeiro toque (quem trouxe) x último toque (onde fechou).
  const toques = [['first', '1º toque'], ['last', 'Último toque']];
  _host.append(el('div', { class: 'pn-filters', style: 'margin-top:8px' }, toques.map(([id, label]) => {
    const b = el('button', { class: id === _touch ? 'active' : '', text: label });
    b.addEventListener('click', () => { _touch = id; paint(); });
    return b;
  })));
  _host.append(el('p', { class: 'hint', style: 'margin:6px 0 0', text: _touch === 'first'
    ? 'Crédito pra origem que TROUXE o cliente — mostra o que gera cliente novo.'
    : 'Crédito pra origem onde a pessoa FECHOU. Cada venda tem a jornada completa abaixo.' }));
  const corpo = el('div', { id: 'atrib-corpo' }, el('p', { class: 'hint', text: 'Carregando...' }));
  _host.append(corpo);
  if (periodo === 'custom' && (!customDe || !customAte)) corpo.innerHTML = '<p class="hint" style="text-align:center;padding:20px">Escolha as datas e clique em Aplicar.</p>';
  else load(corpo);
}

async function load(corpo) {
  _corpo = corpo; _filtro = null;
  const [de, ate] = await intervalo();
  const [resumo, funil, pedidos] = await Promise.all([
    rpc('attribution_summary', { p_store: _store, p_de: de, p_ate: ate, p_touch: _touch }),
    rpc('attribution_funnel', { p_store: _store, p_de: de, p_ate: ate, p_touch: _touch }),
    rpc('attribution_orders', { p_store: _store, p_de: de, p_ate: ate, p_limit: 500 }),
  ]);
  _resumo = Array.isArray(resumo) ? resumo : [];
  _funil = Array.isArray(funil) ? funil : [];
  _pedidos = Array.isArray(pedidos) ? pedidos : [];
  draw();
}

// Desenha tudo a partir dos dados carregados (sem refazer as buscas). O clique no
// funil só troca o _filtro e redesenha — rápido.
function draw() {
  const corpo = _corpo; if (!corpo) return;
  corpo.innerHTML = '';
  const byDim = (d) => _resumo.filter((r) => r.dimensao === d).sort((a, b) => Number(b.valor) - Number(a.valor));
  const src = byDim('source');
  corpo.append(card('Resumo do período', el('div', { class: 'kpi-grid' }, [
    kpi('Vendas', String(src.reduce((s, r) => s + Number(r.pedidos || 0), 0)), 'principal'),
    kpi('Valor total', money(src.reduce((s, r) => s + Number(r.valor || 0), 0))),
    kpi('Só produtos', money(src.reduce((s, r) => s + Number(r.valor_produtos || 0), 0))),
  ])));
  corpo.append(funnelCard(_funil));
  corpo.append(rankCard('Por campanha', byDim('campaign'), 'Nenhuma venda com campanha (links/anúncios).'));
  corpo.append(rankCard('Por anúncio', byDim('content'), 'Nenhuma venda com anúncio (utm_content).'));
  corpo.append(ordersCard(_pedidos));
  corpo.append(el('p', { class: 'hint', style: 'text-align:center;margin-top:14px', text: 'Valor real do seu banco (não é estimativa do Meta) · /pedidos = bio · /faca-seu-pedido = WhatsApp · /pedidos-google = Google' }));
}

// Qual origem usar pra filtrar/agrupar, conforme o toque escolhido.
function touchSource(o) { return (_touch === 'first' ? o.first_source : o.last_source) || 'direto'; }

// Funil por origem em TABELA. Cada linha é CLICÁVEL: filtra as vendas por aquela origem.
function funnelCard(rows) {
  if (!rows.length) return card('Funil por origem', el('p', { class: 'hint', text: 'Ainda sem visitas registradas (começa a contar nas visitas novas).' }));
  const head = el('tr', {}, ['Origem', 'Visitas', 'Carrinho', 'Vendas', 'Valor'].map((h) => el('th', { text: h })));
  const body = rows.map((r) => {
    const origem = r.source || 'direto';
    const ativo = _filtro === origem;
    const tr = el('tr', { class: 'atrib-click' + (ativo ? ' active' : ''), title: 'Clique para ver só as vendas desta origem' }, [
      el('td', {}, el('b', { text: origem })),
      el('td', { text: String(r.pageviews || 0) }),
      el('td', { text: String(r.add_cart || 0) }),
      el('td', { text: String(r.compras || 0) }),
      el('td', {}, el('b', { text: money(r.valor) })),
    ]);
    tr.addEventListener('click', () => { _filtro = ativo ? null : origem; draw(); });
    return tr;
  });
  const table = el('table', { class: 'atrib-table' }, [el('thead', {}, head), el('tbody', {}, body)]);
  return card('Funil por origem', el('div', {}, [
    el('p', { class: 'hint', style: 'margin:0 0 8px', text: 'Toque numa origem pra filtrar as vendas abaixo.' }),
    el('div', { style: 'overflow-x:auto' }, table),
  ]));
}

// Ranking com barra: chave + pedidos + valor.
function rankCard(titulo, rows, vazio) {
  if (!rows.length) return card(titulo, el('p', { class: 'hint', text: vazio || 'Sem dados.' }));
  const max = Math.max(1, ...rows.map((r) => Number(r.valor) || 0));
  const rank = el('div', { class: 'rank' }, rows.map((r, idx) => el('div', { class: 'rank-item' }, [
    el('div', { class: 'rank-head' }, [
      el('span', { text: `${idx + 1}. ${r.chave || '(sem)'}` }),
      el('b', { text: `${r.pedidos} venda${Number(r.pedidos) === 1 ? '' : 's'} · ${money(r.valor)}` }),
    ]),
    el('div', { class: 'rank-track' }, el('div', { class: 'rank-fill', style: `width:${Math.round((Number(r.valor) || 0) / max * 100)}%` })),
  ])));
  return card(titulo, rank);
}

// Normaliza a origem no navegador (mesma regra do SQL: ig->instagram, fb->facebook).
const NORM = { ig: 'instagram', fb: 'facebook', msg: 'messenger', an: 'audience_network' };
function normSource(s) { const k = (s || '').toLowerCase(); return NORM[k] || k || 'direto'; }

const NUMS = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩', '⑪', '⑫'];

// Célula da JORNADA: 1º -> 2º -> 3º ... -> 🛒 comprou. Cada toque é um chip
// (origem + campanha/anúncio embaixo). Pedido antigo (sem path) cai no first/last.
function jornadaCell(o) {
  // Janela de deploy (SQL antigo ainda no banco): a RPC não devolve estes campos.
  // Avisa em vez de mostrar 'direto' errado pra todo mundo.
  if (o.jornada === undefined && o.first_source === undefined && o.last_source === undefined) {
    return el('td', {}, el('small', { class: 'muted', text: '— atualize: rode a migração 0016' }));
  }
  // Jornada já normaliza a origem no chip; pedido antigo (path vazio) cai no first/last.
  let toques = Array.isArray(o.jornada) ? o.jornada.map((t) => ({ source: normSource(t.source), campaign: t.campaign, content: t.content })) : [];
  if (!toques.length) {
    // Sem jornada gravada. Distingue "sem rastreio" (atribuicao nula) de direto real.
    if (!o.first_source && !o.last_source) {
      return el('td', {}, el('div', { class: 'jornada' }, [
        el('span', { class: 'jor-chip', text: 'sem rastreio' }),
        el('span', { class: 'jor-seta', text: '→' }),
        el('span', { class: 'jor-buy', text: '🛒 comprou' }),
      ]));
    }
    const f = { source: o.first_source }, l = { source: o.last_source };
    toques = (o.first_source && o.last_source && o.first_source !== o.last_source) ? [f, l] : [f];
  }
  const chips = [];
  toques.forEach((t, i) => {
    if (i) chips.push(el('span', { class: 'jor-seta', text: '→' }));
    const detalhe = [t.campaign, t.content].filter(Boolean).join(' · ');
    chips.push(el('span', { class: 'jor-chip' + (i === toques.length - 1 ? ' jor-fim' : '') }, [
      el('b', { text: (NUMS[i] || ('#' + (i + 1))) + ' ' + (t.source || 'direto') }),
      detalhe ? el('small', { text: detalhe }) : null,
    ]));
  });
  chips.push(el('span', { class: 'jor-seta', text: '→' }));
  chips.push(el('span', { class: 'jor-buy', text: '🛒 comprou' }));
  return el('td', {}, el('div', { class: 'jornada' }, chips));
}

// Todas as vendas em TABELA, cada uma com a JORNADA completa (todos os toques).
// O filtro do funil usa a origem do toque selecionado (1º ou último).
function ordersCard(all) {
  const rows = _filtro ? all.filter((o) => touchSource(o) === _filtro) : all;
  const titulo = _filtro ? `Vendas de: ${_filtro}` : 'Todas as vendas — jornada completa de cada uma';
  const header = el('div', { style: 'display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap' }, [
    el('h3', { text: titulo, style: 'margin:0' }),
    _filtro ? el('button', { class: 'btn btn-ghost mini', text: '✕ Ver todas', onclick: () => { _filtro = null; draw(); } }) : null,
  ]);
  if (!rows.length) return el('div', { class: 'panel-card' }, [header, el('p', { class: 'hint', text: 'Sem vendas nessa origem.' })]);
  // Aviso de truncamento: a tabela traz no máx. 500 linhas, mas o resumo/funil contam
  // TODAS. Se o período tiver mais que isso, avisa (senão parece que "sumiu" venda).
  const totalVendas = _resumo.filter((r) => r.dimensao === 'source').reduce((s, r) => s + Number(r.pedidos || 0), 0);
  const truncado = (!_filtro && totalVendas > all.length)
    ? el('p', { class: 'hint', text: `Mostrando as ${all.length} vendas mais recentes de ${totalVendas} no período. Pra ver todas (e filtrar por origem sem cortar), use um período menor.` })
    : null;
  const head = el('tr', {}, ['#', 'Quando', 'Cliente', 'Jornada (todos os toques → comprou)', 'Valor'].map((h) => el('th', { text: h })));
  const body = rows.map((o) => {
    const quando = (() => { try { return new Date(o.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } })();
    return el('tr', {}, [
      el('td', { text: '#' + String(o.daily_number || 0).padStart(3, '0') }),
      el('td', { text: quando }),
      el('td', {}, [el('b', { text: o.cliente || '-' }), o.telefone ? el('small', { class: 'muted', style: 'display:block', text: o.telefone }) : null]),
      jornadaCell(o),
      el('td', {}, el('b', { text: money(o.total) })),
    ]);
  });
  const table = el('table', { class: 'atrib-table' }, [el('thead', {}, head), el('tbody', {}, body)]);
  return el('div', { class: 'panel-card' }, [header, truncado, el('div', { style: 'overflow-x:auto' }, table)]);
}

function kpi(label, valor, mod) { return el('div', { class: 'kpi' + (mod ? ' kpi-' + mod : '') }, [el('div', { class: 'kpi-val', text: String(valor) }), el('div', { class: 'kpi-lbl', text: label })]); }
function card(titulo, conteudo) { return el('div', { class: 'panel-card' }, [el('h3', { text: titulo }), conteudo]); }
