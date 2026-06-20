// =============================================================================
// DASHBOARD (aba do painel, só dono) — faturamento, vendas, vendas por dia,
// produtos mais vendidos. Período filtrável. Lê das RPCs do 0006.
// Gráficos em DIV/CSS puro (sem biblioteca). Cancelado fica fora; fuso da loja.
// =============================================================================
import { el, money, toast } from './util.js';

let _client = null, _store = '';
let _host = null;
let periodo = '7d';
let customDe = null, customAte = null;

export function renderDashboard(host, client, storeSlug) {
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
  if (periodo === 'custom' && customDe && customAte) {
    return customDe <= customAte ? [customDe, customAte] : [customAte, customDe];
  }
  let hoje = await rpc('today_local');
  hoje = Array.isArray(hoje) ? (hoje[0]?.today_local || hoje[0]) : hoje;          // scalar 'YYYY-MM-DD'
  if (!hoje) hoje = ymd(new Date());
  const base = new Date(hoje + 'T12:00:00');
  return ({
    hoje: [hoje, hoje],
    '7d': [minusDays(base, 6), hoje],
    '30d': [minusDays(base, 29), hoje],
    mes: [hoje.slice(0, 8) + '01', hoje],
  })[periodo] || [minusDays(base, 6), hoje];
}

function paint() {
  _host.innerHTML = '';
  // seletor de período
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
  const corpo = el('div', { id: 'dash-corpo' }, el('p', { class: 'hint', text: 'Carregando relatório...' }));
  _host.append(corpo);
  if (periodo === 'custom' && (!customDe || !customAte)) corpo.innerHTML = '<p class="hint" style="text-align:center;padding:20px">Escolha as datas e clique em Aplicar.</p>';
  else load(corpo);
}

async function load(corpo) {
  const [de, ate] = await intervalo();
  const [resumo, porDia, topItens, topSizes, topAcomps] = await Promise.all([
    rpc('dashboard_summary', { p_store: _store, p_de: de, p_ate: ate }),
    rpc('dashboard_sales_by_day', { p_store: _store, p_de: de, p_ate: ate }),
    rpc('dashboard_top_items', { p_store: _store, p_de: de, p_ate: ate, p_limit: 10, p_order: 'qtd' }),
    rpc('dashboard_top_sizes', { p_store: _store, p_de: de, p_ate: ate }),
    rpc('dashboard_top_acomps', { p_store: _store, p_de: de, p_ate: ate, p_limit: 15 }),
  ]);
  corpo.innerHTML = '';
  const r = (Array.isArray(resumo) ? resumo[0] : resumo) || {};

  // KPIs
  const kpis = el('div', { class: 'kpi-grid' }, [
    kpi('Faturamento (produtos)', money(r.faturamento_liq || 0), 'principal'),
    kpi('Taxas de entrega', money(r.taxa_entrega || 0)),
    kpi('Total recebido', money(r.faturamento || 0)),
    kpi('Vendas', r.vendas || 0),
    kpi('Ticket médio', money(r.ticket_medio || 0)),
    kpi('Novos clientes', r.novos_clientes || 0),
    kpi('Entregas', r.entregas || 0),
    kpi('Retiradas', r.retiradas || 0),
    kpi('Cancelados', r.cancelados || 0, (r.cancelados || 0) > 0 ? 'alerta' : ''),
    kpi('Descontos', money(r.descontos || 0)),
  ]);
  corpo.append(card('Resumo do período', kpis));

  // Vendas por dia
  const dias = Array.isArray(porDia) ? porDia : [];
  if (dias.length) {
    const max = Math.max(1, ...dias.map((d) => Number(d.faturamento) || 0));
    const graf = el('div', { class: 'chart-bars' }, dias.map((d) => {
      const v = Number(d.faturamento) || 0;
      const dd = String(d.dia).slice(8, 10) + '/' + String(d.dia).slice(5, 7);
      return el('div', { class: 'chart-col' }, [
        el('div', { class: 'chart-bar-wrap' }, el('div', { class: 'chart-bar', style: `height:${Math.max(2, Math.round(v / max * 100))}%`, title: `${dd}: ${money(v)} (${d.vendas} vendas)` })),
        el('span', { class: 'chart-lbl', text: dd }),
      ]);
    }));
    corpo.append(card('Faturamento por dia', graf));
  }

  // Mais vendidos
  const itens = Array.isArray(topItens) ? topItens : [];
  if (itens.length) {
    const maxQ = Math.max(1, ...itens.map((i) => Number(i.qtd) || 0));
    const rank = el('div', { class: 'rank' }, itens.map((i, idx) => {
      const q = Number(i.qtd) || 0;
      return el('div', { class: 'rank-item' }, [
        el('div', { class: 'rank-head' }, [el('span', { text: `${idx + 1}. ${i.nome}` }), el('b', { text: `${q}x · ${money(i.receita || 0)}` })]),
        el('div', { class: 'rank-track' }, el('div', { class: 'rank-fill', style: `width:${Math.round(q / maxQ * 100)}%` })),
      ]);
    }));
    corpo.append(card('Mais vendidos', rank));
  } else {
    corpo.append(card('Mais vendidos', el('p', { class: 'hint', text: 'Sem vendas no período.' })));
  }

  // Etapa 5: vendas por tamanho de copo e acompanhamentos mais pedidos (pedidos novos)
  corpo.append(rankCard('Tamanhos mais vendidos', (Array.isArray(topSizes) ? topSizes : []).map((r) => ({ label: r.tamanho, qtd: r.qtd }))));
  corpo.append(rankCard('Acompanhamentos mais pedidos', (Array.isArray(topAcomps) ? topAcomps : []).map((r) => ({ label: r.nome, qtd: r.qtd }))));
}

// Ranking simples (label + barra) a partir de [{label, qtd}], reaproveita o estilo .rank
function rankCard(titulo, rows) {
  if (!rows.length) return card(titulo, el('p', { class: 'hint', text: 'Ainda sem dados. Conta a partir dos pedidos novos.' }));
  const max = Math.max(1, ...rows.map((r) => Number(r.qtd) || 0));
  const rank = el('div', { class: 'rank' }, rows.map((r, idx) => {
    const q = Math.round(Number(r.qtd) || 0);
    return el('div', { class: 'rank-item' }, [
      el('div', { class: 'rank-head' }, [el('span', { text: `${idx + 1}. ${r.label || '(sem nome)'}` }), el('b', { text: `${q}x` })]),
      el('div', { class: 'rank-track' }, el('div', { class: 'rank-fill', style: `width:${Math.round((Number(r.qtd) || 0) / max * 100)}%` })),
    ]);
  }));
  return card(titulo, rank);
}

function kpi(label, valor, mod) {
  return el('div', { class: 'kpi' + (mod ? ' kpi-' + mod : '') }, [
    el('div', { class: 'kpi-val', text: String(valor) }),
    el('div', { class: 'kpi-lbl', text: label }),
  ]);
}
function card(titulo, conteudo) {
  return el('div', { class: 'panel-card' }, [el('h3', { text: titulo }), conteudo]);
}
