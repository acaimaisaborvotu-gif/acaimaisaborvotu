// =============================================================================
// ATRIBUIÇÃO (aba do painel, só dono) — de onde vieram as vendas, com VALOR REAL.
// Lê das RPCs do 0014 (attribution_summary / attribution_orders). Fuso da loja;
// cancelado fica fora. É a fonte da verdade da loja (não depende do Meta).
// =============================================================================
import { el, money, toast } from './util.js';

let _client = null, _store = '', _host = null;
let periodo = '7d';
let customDe = null, customAte = null;
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
  _host.append(el('p', { class: 'hint', text: 'De onde vieram suas vendas, com o valor REAL do seu banco (não é estimativa do Meta). Links: /pedidos = bio, /faca-seu-pedido = WhatsApp, /pedidos-google = Google.' }));
  const corpo = el('div', { id: 'atrib-corpo' }, el('p', { class: 'hint', text: 'Carregando...' }));
  _host.append(corpo);
  if (periodo === 'custom' && (!customDe || !customAte)) corpo.innerHTML = '<p class="hint" style="text-align:center;padding:20px">Escolha as datas e clique em Aplicar.</p>';
  else load(corpo);
}

async function load(corpo) {
  _corpo = corpo; _filtro = null;
  const [de, ate] = await intervalo();
  const [resumo, funil, pedidos] = await Promise.all([
    rpc('attribution_summary', { p_store: _store, p_de: de, p_ate: ate }),
    rpc('attribution_funnel', { p_store: _store, p_de: de, p_ate: ate }),
    rpc('attribution_orders', { p_store: _store, p_de: de, p_ate: ate, p_limit: 300 }),
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
}

// Funil por origem em TABELA. Cada linha é CLICÁVEL: filtra as vendas por aquela origem.
function funnelCard(rows) {
  if (!rows.length) return card('Funil por origem', el('p', { class: 'hint', text: 'Ainda sem visitas registradas. Começa a contar depois de subir (registra as visitas novas).' }));
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
  return card('Funil por origem (clique numa origem para filtrar as vendas)', el('div', { style: 'overflow-x:auto' }, table));
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

// Todas as vendas em TABELA por linha. Se _filtro tiver origem, mostra só as dela.
function ordersCard(all) {
  const rows = _filtro ? all.filter((o) => (o.source || 'direto') === _filtro) : all;
  const titulo = _filtro ? `Vendas de: ${_filtro}` : 'Todas as vendas (por linha)';
  const header = el('div', { style: 'display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap' }, [
    el('h3', { text: titulo, style: 'margin:0' }),
    _filtro ? el('button', { class: 'btn btn-ghost mini', text: '✕ Ver todas', onclick: () => { _filtro = null; draw(); } }) : null,
  ]);
  if (!rows.length) return el('div', { class: 'panel-card' }, [header, el('p', { class: 'hint', text: 'Sem vendas nessa origem.' })]);
  const head = el('tr', {}, ['#', 'Quando', 'Cliente', 'Origem', 'Campanha', 'Anúncio', 'Valor'].map((h) => el('th', { text: h })));
  const body = rows.map((o) => {
    const quando = (() => { try { return new Date(o.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } })();
    return el('tr', {}, [
      el('td', { text: '#' + String(o.daily_number || 0).padStart(3, '0') }),
      el('td', { text: quando }),
      el('td', {}, [el('b', { text: o.cliente || '-' }), o.telefone ? el('small', { class: 'muted', style: 'display:block' , text: o.telefone }) : null]),
      el('td', { text: o.source || 'direto' }),
      el('td', { text: o.campaign || '-' }),
      el('td', { text: o.content || '-' }),
      el('td', {}, el('b', { text: money(o.total) })),
    ]);
  });
  const table = el('table', { class: 'atrib-table' }, [el('thead', {}, head), el('tbody', {}, body)]);
  return el('div', { class: 'panel-card' }, [header, el('div', { style: 'overflow-x:auto' }, table)]);
}

function kpi(label, valor, mod) { return el('div', { class: 'kpi' + (mod ? ' kpi-' + mod : '') }, [el('div', { class: 'kpi-val', text: String(valor) }), el('div', { class: 'kpi-lbl', text: label })]); }
function card(titulo, conteudo) { return el('div', { class: 'panel-card' }, [el('h3', { text: titulo }), conteudo]); }
