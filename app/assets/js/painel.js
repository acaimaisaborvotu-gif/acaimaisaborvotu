// =============================================================================
// PAINEL DE GESTÃO — Açaí Mais Sabor
// Pedidos em tempo real + som, aceite que imprime, fluxo de status,
// editor de cardápio, configurações e impressora.
// =============================================================================

import { CONFIG, hasSupabase } from './config.js';
import { sb, statusManualEfetivo } from './data.js';
import { printer } from './printing.js';
import * as SEED from './menu-data.js';
import { el, money, toast, escapeHtml, imgUrl } from './util.js';
import { renderClientes } from './crm.js';
import { renderDashboard } from './dashboard.js';
import { renderAttribution } from './attribution-panel.js';

const app = document.getElementById('app');
const STORE_SLUG = CONFIG.STORE_ID;

let client = null;
let session = null;
let profile = null;
let store = { nome: SEED.STORE.nome };
let cfg = { menu: null, settings: null };
let orders = [];
let tab = 'pedidos';
let filter = 'ativos';
let channel = null;

const STATUS = {
  novo: { label: 'Novo', next: 'aceito', action: 'Aceitar e imprimir' },
  aceito: { label: 'Aceito', next: 'producao', action: 'Em produção' },
  producao: { label: 'Em produção', next: 'pronto', action: 'Pronto' },
  pronto: { label: 'Pronto', next: 'saiu', action: 'Saiu para entrega' },
  saiu: { label: 'Saiu para entrega', next: 'entregue', action: 'Marcar entregue' },
  entregue: { label: 'Entregue', next: null, action: null },
  cancelado: { label: 'Cancelado', next: null, action: null },
};
const STATUS_COLOR = { novo: 'var(--magenta)', aceito: 'var(--warn)', producao: '#c98a00', pronto: 'var(--ok)', saiu: 'var(--roxo-600)', entregue: 'var(--ink-mute)', cancelado: 'var(--danger)' };

// Próximo passo do pedido. Retirada pula "saiu para entrega" (vai de Pronto direto pra Retirado).
function nextStep(o) {
  const s = STATUS[o.status]; if (!s || !s.next) return null;
  if (o.delivery_type === 'retirada' && o.status === 'pronto') return { next: 'entregue', action: 'Marcar retirada' };
  return { next: s.next, action: s.action };
}

// ---------------------------------------------------------------- boot
(async function boot() {
  try {
    if (!hasSupabase()) return renderNoBackend();
    client = await sb();
    const { data } = await client.auth.getSession();
    session = data.session;
    if (!session) return renderLogin();
    await loadAll();
  } catch (e) {
    console.error(e);
    app.innerHTML = '';
    app.append(
      el('div', { class: 'notice', html: `<h3>Não consegui abrir o painel</h3><p>${escapeHtml(String(e.message || e))}</p>` }),
      el('div', { style: 'text-align:center;margin-top:10px' }, el('button', { class: 'btn btn-ghost', text: 'Tentar de novo', onclick: () => location.reload() })),
    );
  }
})();

async function loadAll() {
  const { data: prof } = await client.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
  if (!prof) return renderNoProfile();
  profile = prof;
  const { data: st } = await client.from('stores').select('*').eq('slug', STORE_SLUG).maybeSingle();
  if (st) store = st;
  const { data: conf } = await client.from('store_config').select('*').eq('store_slug', STORE_SLUG).maybeSingle();
  cfg = conf || cfg;
  await loadOrders();
  if (printer.config().method === 'serial') printer.reconnectSerial().catch(() => {});
  renderApp();
  subscribeOrders();
  startAutoRefresh();
  document.addEventListener('click', unlockAudio, { once: true });
}

async function loadOrders() {
  const { data } = await client.from('orders').select('*')
    .eq('store_slug', STORE_SLUG)
    .gte('created_at', new Date(Date.now() - 86400000).toISOString())
    .order('created_at', { ascending: false });
  orders = data || [];
}

function subscribeOrders() {
  channel?.unsubscribe();
  channel = client.channel('painel-orders')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders', filter: `store_slug=eq.${STORE_SLUG}` }, (p) => {
      orders.unshift(p.new); alertNew(); renderOrders();
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `store_slug=eq.${STORE_SLUG}` }, (p) => {
      const i = orders.findIndex((o) => o.id === p.new.id); if (i >= 0) orders[i] = p.new; renderOrders();
    })
    .subscribe();
}

// Rede de segurança: se a conexão ao vivo cair (internet oscilou, PC dormiu),
// recarrega os pedidos ao focar a aba e a cada 1 min, e reassina se preciso.
let autoRefreshOn = false;
function startAutoRefresh() {
  if (autoRefreshOn) return; autoRefreshOn = true;
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') safeRefresh(); });
  window.addEventListener('focus', safeRefresh);
  setInterval(safeRefresh, 60000);
}
async function safeRefresh() {
  if (document.visibilityState !== 'visible' || !session) return;
  try {
    const before = new Set(orders.map((o) => o.id));
    await loadOrders();
    if (!channel || channel.state !== 'joined') subscribeOrders();
    const temNovo = orders.some((o) => o.status === 'novo' && !before.has(o.id));
    renderOrders();
    if (temNovo) alertNew();
  } catch (e) {}
}

// Garante que o som toca (libera o áudio numa interação do usuário)
function unlockAudio() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch (e) {}
}

// ---------------------------------------------------------------- views
function renderNoBackend() {
  app.innerHTML = '';
  app.append(el('div', { class: 'notice', html: `
    <h3>Conecte o Supabase primeiro</h3>
    <p>O painel precisa do Supabase pra receber pedidos em tempo real. Abra <code>app/assets/js/config.js</code> e preencha <code>SUPABASE_URL</code> e <code>SUPABASE_ANON_KEY</code>.</p>
    <p style="margin-top:8px">Passo a passo completo em <code>docs/GUIA-SUPABASE.md</code>.</p>` }));
}

function renderNoProfile() {
  app.innerHTML = '';
  app.append(el('div', { class: 'notice', html: `
    <h3>Usuário sem permissão</h3>
    <p>Seu login existe, mas não está vinculado à loja. No Supabase, rode o bloco final de <code>0002_seed.sql</code> com o seu e-mail pra virar dono.</p>` }),
    el('div', { style: 'text-align:center' }, el('button', { class: 'btn btn-ghost', text: 'Sair', onclick: logout })));
}

function renderLogin() {
  app.innerHTML = '';
  const email = el('input', { type: 'email', placeholder: 'E-mail', autocomplete: 'username' });
  const pass = el('input', { type: 'password', placeholder: 'Senha', autocomplete: 'current-password' });
  const btn = el('button', { class: 'btn btn-primary btn-block', style: 'margin-top:16px', text: 'Entrar' });
  const form = el('form', { class: 'login-card' }, [
    el('img', { src: '../assets/img/logo.png', alt: 'Açaí Mais Sabor', style: 'height:58px;display:block;margin:0 auto 8px' }),
    el('div', { class: 'center muted', style: 'margin-bottom:10px', text: 'Painel de gestão' }),
    email, pass, btn,
  ]);
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); btn.disabled = true; btn.textContent = 'Entrando...';
    const { data, error } = await client.auth.signInWithPassword({ email: email.value.trim(), password: pass.value });
    if (error) { toast('E-mail ou senha inválidos'); btn.disabled = false; btn.textContent = 'Entrar'; return; }
    session = data.session; unlockAudio(); await loadAll();
  });
  app.append(el('div', { class: 'login-wrap' }, form));
}

async function logout() { await client.auth.signOut(); location.reload(); }

function renderApp() {
  app.innerHTML = '';
  const isOwner = profile.role === 'owner';
  const isAgencia = !!profile.agencia; // acesso "agência" (só Nathan) — independe de ser dono
  const tabs = [['pedidos', 'Pedidos'], ['clientes', 'Clientes'], isOwner ? ['dashboard', 'Dashboard'] : null, isAgencia ? ['atribuicao', 'Atribuição'] : null, ['cardapio', 'Cardápio'], isOwner ? ['config', 'Configurações'] : null, isOwner ? ['acessos', 'Acessos'] : null, ['impressora', 'Impressora']].filter(Boolean);
  const tabNav = el('div', { class: 'pn-tabs' }, tabs.map(([id, label]) => {
    const b = el('button', { class: id === tab ? 'active' : '', 'data-tab': id, text: label });
    if (id === 'pedidos') { const n = orders.filter((o) => o.status === 'novo').length; if (n) b.append(el('span', { class: 'badge', text: n })); }
    b.addEventListener('click', () => { tab = id; renderApp(); });
    return b;
  }));
  app.append(
    el('div', { class: 'pn-topbar' }, [
      el('img', { class: 'logo-img', src: '../assets/img/logo.png', alt: 'Açaí Mais Sabor', style: 'height:30px' }),
      el('b', { text: store.nome }),
      el('div', { class: 'who' }, [el('span', { class: 'role', text: profile.role === 'owner' ? 'Dono' : 'Operação' }), el('span', { text: profile.nome || session.user.email }), el('button', { class: 'pn-logout', text: 'Sair', onclick: logout })]),
    ]),
    tabNav,
    el('div', { class: 'pn-main', id: 'tabContent' }),
  );
  ({
    pedidos: renderOrders,
    clientes: () => renderClientes(document.getElementById('tabContent'), client, STORE_SLUG, store.nome, (currentMenu() || {}).textos, profile.role === 'owner'),
    dashboard: () => renderDashboard(document.getElementById('tabContent'), client, STORE_SLUG),
    atribuicao: () => renderAttribution(document.getElementById('tabContent'), client, STORE_SLUG),
    cardapio: renderCardapio, config: renderConfig, acessos: renderAcessos, impressora: renderImpressora,
  }[tab])();
}

// Controle de status da loja (abrir/fechar/automático). Fica no topo da aba Pedidos,
// então DONO e OPERADOR conseguem usar (a RLS de store_config já é is_staff). Salva na hora.
function lojaStatusControl() {
  const card = el('div', { class: 'panel-card' }, [
    el('h3', { text: 'Status da loja agora' }),
    el('p', { class: 'hint', text: 'Abrir mais cedo ou fechar numa emergência. Vale só por HOJE: amanhã volta pro horário normal sozinha. Salva ao tocar.' }),
  ]);
  const box = el('div'); card.append(box);
  const setStatus = async (val) => {
    const hojeSP = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    const saved = { ...currentSettings(), statusManual: val, statusManualDia: val === 'auto' ? null : hojeSP };
    const { error } = await client.from('store_config').upsert({ store_slug: STORE_SLUG, settings: saved, updated_at: new Date().toISOString() });
    if (error) { toast('Erro ao salvar status'); return; }
    cfg.settings = saved;
    toast(val === 'auto' ? 'Modo automático: segue o horário.' : val === 'aberto' ? 'Loja ABERTA só por hoje.' : 'Loja FECHADA só por hoje.');
    render();
  };
  const render = () => {
    box.innerHTML = '';
    const cur = statusManualEfetivo(currentSettings());
    const opts = [
      ['auto', '🕒 Automático', 'Segue o horário cadastrado.'],
      ['aberto', '🟢 Abrir agora', 'Força ABERTA só hoje.'],
      ['fechado', '🔴 Fechar agora', 'Força FECHADA só hoje.'],
    ];
    box.append(el('div', { class: 'status-opts' }, opts.map(([val, label, desc]) =>
      el('button', { class: 'status-opt' + (cur === val ? ' active' : ''), type: 'button', onclick: () => setStatus(val) }, [
        el('div', { class: 'so-label', text: label }),
        el('div', { class: 'so-desc', text: desc }),
      ]))));
    if (cur !== 'auto') box.append(el('div', { class: 'status-warn', text: cur === 'aberto'
      ? '⚠️ Aberta no manual só por HOJE. Amanhã volta ao normal sozinha (ou toque em Automático).'
      : '⚠️ Fechada no manual só por HOJE. Amanhã volta ao normal sozinha (ou toque em Automático).' }));
  };
  render();
  return card;
}

// Relatório de vendas do dia: monta os números a partir dos pedidos de HOJE (fuso SP).
// Zera sozinho a cada dia porque só conta os pedidos do dia atual.
function buildReportData() {
  const fmt = (dt) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(dt);
  const hoje = fmt(new Date());
  const doDia = orders.filter((o) => { try { return fmt(new Date(o.created_at)) === hoje; } catch (e) { return false; } });
  const vendas = doDia.filter((o) => o.status !== 'cancelado');
  const cancelados = doDia.filter((o) => o.status === 'cancelado');
  const vendaComTaxa = vendas.reduce((s, o) => s + Number(o.total || 0), 0);
  const taxaTotal = vendas.reduce((s, o) => s + Number(o.delivery_fee || 0), 0);
  const hora = (o) => { try { return new Date(o.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };
  const mapO = (o) => ({ num: o.daily_number || 0, hora: hora(o), total: Number(o.total || 0) });
  return {
    dataLabel: new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
    vendas: vendas.map(mapO), cancelados: cancelados.map(mapO),
    vendaSemTaxa: vendaComTaxa - taxaTotal, vendaComTaxa, taxaTotal,
  };
}

function renderReport(host) {
  const r = buildReportData();
  const kpi = (lbl, val, mod) => el('div', { class: 'kpi' + (mod ? ' kpi-' + mod : '') }, [el('div', { class: 'kpi-val', text: val }), el('div', { class: 'kpi-lbl', text: lbl })]);
  const card = el('div', { class: 'panel-card' });
  card.append(el('div', { style: 'display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap' }, [
    el('h3', { text: 'Relatório do dia · ' + r.dataLabel, style: 'margin:0' }),
    el('button', { class: 'btn btn-primary mini', html: '🖨 Imprimir', onclick: async (e) => {
      e.target.disabled = true;
      try { await printer.printReport(buildReportData(), store); toast('Relatório enviado pra impressora'); }
      catch (err) { toast('Falha ao imprimir: ' + (err.message || '')); }
      e.target.disabled = false;
    } }),
  ]));
  card.append(el('div', { class: 'kpi-grid', style: 'margin-top:12px' }, [
    kpi('Venda (produtos)', money(r.vendaSemTaxa), 'principal'),
    kpi('Taxa de entrega', money(r.taxaTotal)),
    kpi('Total recebido', money(r.vendaComTaxa)),
    kpi('Pedidos', String(r.vendas.length)),
  ]));
  const lista = el('div', { class: 'rank', style: 'margin-top:14px' });
  if (!r.vendas.length) lista.append(el('p', { class: 'hint', text: 'Nenhum pedido hoje ainda.' }));
  r.vendas.forEach((o) => lista.append(el('div', { class: 'rank-item' }, el('div', { class: 'rank-head' }, [
    el('span', { text: '#' + String(o.num).padStart(3, '0') + ' · ' + o.hora }), el('b', { text: money(o.total) }),
  ]))));
  card.append(lista);
  if (r.cancelados.length) {
    const cancVal = r.cancelados.reduce((s, o) => s + o.total, 0);
    card.append(el('h3', { text: 'Cancelados (' + r.cancelados.length + ') · ' + money(cancVal), style: 'margin-top:16px;color:var(--danger)' }));
    const cl = el('div', { class: 'rank' });
    r.cancelados.forEach((o) => cl.append(el('div', { class: 'rank-item', style: 'opacity:.6' }, el('div', { class: 'rank-head' }, [
      el('span', { text: '#' + String(o.num).padStart(3, '0') + ' · ' + o.hora }), el('b', { text: money(o.total) }),
    ]))));
    card.append(cl);
  }
  host.append(card);
}

// ---------------------------------------------------------------- Pedidos
function renderOrders() {
  if (tab !== 'pedidos') return;
  const host = document.getElementById('tabContent'); if (!host) return;
  host.innerHTML = '';
  host.append(lojaStatusControl());
  const filters = [['ativos', 'Em andamento'], ['novo', 'Novos'], ['producao', 'Em produção'], ['pronto', 'Prontos'], ['saiu', 'Saíram'], ['entregue', 'Entregues'], ['todos', 'Todos'], ['relatorio', 'Relatório do dia']];
  host.append(el('div', { class: 'pn-filters' }, filters.map(([id, label]) => {
    const b = el('button', { class: id === filter ? 'active' : '', text: label });
    b.addEventListener('click', () => { filter = id; renderOrders(); });
    return b;
  })));
  // atualiza badge do tab
  const badge = document.querySelector('.pn-tabs button[data-tab=pedidos] .badge'); const n = orders.filter((o) => o.status === 'novo').length;
  if (badge) badge.textContent = n || '';
  if (filter === 'relatorio') { renderReport(host); return; }
  let list = orders;
  if (filter === 'ativos') list = orders.filter((o) => !['entregue', 'cancelado'].includes(o.status));
  else if (filter !== 'todos') list = orders.filter((o) => o.status === filter);
  if (!list.length) { host.append(el('div', { class: 'empty' }, [el('div', { class: 'big', text: '🍧' }), el('p', { text: 'Nenhum pedido aqui.' })])); return; }
  host.append(el('div', { class: 'orders' }, list.map(orderCard)));
}

function orderCard(o) {
  const s = STATUS[o.status] || STATUS.novo;
  const card = el('div', { class: 'order s-' + o.status }, [
    el('div', { class: 'ohead' }, [
      el('span', { class: 'onum', text: '#' + String(o.daily_number || 0).padStart(3, '0') }),
      el('span', { class: 'otime', text: new Date(o.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) }),
      el('span', { class: 'ostatus', style: `background:${STATUS_COLOR[o.status]}22;color:${STATUS_COLOR[o.status]}`, text: s.label }),
    ]),
    el('div', { class: 'obody' }, [
      el('div', { class: 'ocust', text: o.customer_name }),
      el('div', { class: 'oinfo', text: `${o.customer_phone} · ${o.delivery_type === 'retirada' ? 'Retirada' : 'Entrega'}` }),
      o.address ? el('div', { class: 'oinfo', text: '📍 ' + o.address }) : null,
      (() => {
        const tempo = o.eta_max || o.eta_min;
        if (!tempo || ['entregue', 'cancelado'].includes(o.status)) return null;
        const lim = new Date(new Date(o.created_at).getTime() + Number(tempo) * 60000);
        const hhmm = String(lim.getHours()).padStart(2, '0') + 'h' + String(lim.getMinutes()).padStart(2, '0');
        return el('div', { class: 'oeta', text: (o.delivery_type === 'retirada' ? '⏱ Pronto até ' : '⏱ Entrega até ') + hhmm });
      })(),
      el('div', { class: 'oitems' }, (o.items || []).map((it) => el('div', { class: 'it', html: `<b>${it.qtd}x ${escapeHtml(it.nome)}</b>${it.detalhes?.length ? `<small>${escapeHtml(it.detalhes.join(', '))}</small>` : ''}` }))),
      el('div', { style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap' }, [
        el('span', { class: 'tag-pay', text: ({ pix: 'PIX', cartao: 'Cartão', dinheiro: 'Dinheiro' }[o.payment_method] || o.payment_method || '') + (o.payment_method === 'dinheiro' && o.change_for ? ` (troco p/ R$ ${o.change_for})` : '') }),
        o.printed ? el('span', { class: 'tag-pay', style: 'background:rgba(43,174,102,.12);color:var(--ok)', text: '🖨 impresso' }) : null,
      ]),
      Number(o.discount) > 0 ? el('div', { class: 'oinfo', style: 'color:var(--ok)', text: `Desconto${o.coupon ? ' (' + o.coupon + ')' : ''}: -${money(o.discount)}` }) : null,
      el('div', { class: 'ototal' }, [el('span', { text: 'Total' }), el('span', { text: money(o.total) })]),
    ]),
    el('div', { class: 'oactions' }, [
      el('button', { class: 'btn btn-ghost mini', style: 'flex:0 0 auto', html: '🖨', title: 'Reimprimir', onclick: () => doPrint(o) }),
      (profile.role === 'owner' && !['entregue', 'cancelado'].includes(o.status))
        ? el('button', { class: 'btn btn-ghost mini', style: 'flex:0 0 auto;color:var(--danger)', text: 'Cancelar', title: 'Cancelar pedido', onclick: () => cancelOrder(o) }) : null,
      nextStep(o) ? el('button', { class: 'btn btn-primary', text: nextStep(o).action, onclick: () => advance(o) }) : el('span', { class: 'muted', style: 'flex:1;text-align:center', text: o.status === 'cancelado' ? 'Pedido cancelado' : 'Pedido finalizado' }),
    ]),
  ]);
  return card;
}

async function advance(o) {
  const ns = nextStep(o); if (!ns) return;
  if (o.status === 'novo') { await doPrint(o); } // aceite imprime
  const patch = { status: ns.next };
  if (ns.next === 'aceito') patch.accepted_at = new Date().toISOString();
  const { error } = await client.from('orders').update(patch).eq('id', o.id);
  if (error) return toast('Erro ao atualizar');
  o.status = ns.next; renderOrders();
}

// Cancela o pedido (erro no pedido ou cliente desistiu). Pede confirmação porque
// o cliente passa a ver "cancelado" no acompanhamento e sai do faturamento.
async function cancelOrder(o) {
  if (profile.role !== 'owner') return toast('Só o dono pode cancelar pedido.');
  const num = '#' + String(o.daily_number || 0).padStart(3, '0');
  if (!confirm(`Cancelar o pedido ${num}? O cliente vai ver como cancelado e ele sai do faturamento.`)) return;
  const { error } = await client.from('orders').update({ status: 'cancelado' }).eq('id', o.id);
  if (error) return toast('Erro ao cancelar');
  o.status = 'cancelado'; renderOrders();
  toast(`Pedido ${num} cancelado`);
}

async function doPrint(o) {
  try {
    await printer.printOrder(o, store);
    await client.from('orders').update({ printed: true }).eq('id', o.id);
    o.printed = true; renderOrders();
    toast('Enviado pra impressora');
  } catch (e) {
    console.error(e);
    const m = String(e.message || '');
    if (/impressora|qz|conectad|escolha|carregar/i.test(m)) toast('Configure a impressora na aba Impressora');
    else toast('Falha ao imprimir: ' + m);
  }
}

let audioCtx;
function alertNew() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    [0, 0.3, 0.6].forEach((delay) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.connect(g); g.connect(audioCtx.destination);
      o.type = 'sine'; o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, audioCtx.currentTime + delay);
      g.gain.exponentialRampToValueAtTime(0.3, audioCtx.currentTime + delay + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + delay + 0.18);
      o.start(audioCtx.currentTime + delay); o.stop(audioCtx.currentTime + delay + 0.2);
    });
  } catch {}
  if (Notification?.permission === 'granted') new Notification('Novo pedido!', { body: 'Chegou um pedido novo no painel.' });
  toast('🔔 Novo pedido!');
}

// ---------------------------------------------------------------- Cardápio (editor)
function currentMenu() { return cfg.menu || seedMenu(); }
function seedMenu() {
  const c = (x) => structuredClone(x); // cópia profunda: mergedSeed muta o resultado, então não pode tocar o módulo SEED
  return { RECIPIENTES: c(SEED.RECIPIENTES), BASES: c(SEED.BASES), ACOMPANHAMENTOS: c(SEED.ACOMPANHAMENTOS), COMBOS: c(SEED.COMBOS), DESTAQUES: c(SEED.DESTAQUES), FRAPE: c(SEED.FRAPE), MILKSHAKE: c(SEED.MILKSHAKE), SALADAS: c(SEED.SALADAS), SOBREMESAS: c(SEED.SOBREMESAS), BEBIDAS: c(SEED.BEBIDAS), CATEGORIAS: c(SEED.CATEGORIAS), FOTOS_SEED: { ...SEED.FOTOS_SEED }, categoriaFotos: { ...SEED.CATEGORIA_FOTOS }, esgotados: [], secao2: { ...SEED.SECAO2, itens: [] }, upsell: { ...SEED.UPSELL, itens: [] }, cupons: [...(SEED.CUPONS || [])], textos: { ...SEED.TEXTOS }, removidos: [] };
}
// Aplica a estrutura nova do código preservando o que a loja já editou
// (fotos, esgotados, destaques, seções E PREÇOS alterados no painel)
function mergedSeed() {
  const seed = seedMenu();
  const old = cfg.menu;
  if (old) {
    // tombstones: remove do seed os itens-padrão que a loja apagou de propósito (senão o "Atualizar" os ressuscitaria)
    const rem = new Set(old.removidos || []);
    if (rem.size) {
      seed.COMBOS = seed.COMBOS.filter((c) => !rem.has(c.id));
      seed.ACOMPANHAMENTOS.forEach((g) => { g.itens = g.itens.filter((i) => !rem.has(i.id)); });
      ['SALADAS', 'SOBREMESAS', 'BEBIDAS'].forEach((k) => { seed[k] = seed[k].filter((p) => !rem.has(p.id)); });
    }
    seed.removidos = old.removidos || [];
    seed.FOTOS_SEED = { ...seed.FOTOS_SEED, ...(old.FOTOS_SEED || {}) };
    seed.categoriaFotos = { ...seed.categoriaFotos, ...(old.categoriaFotos || {}) };
    seed.esgotados = old.esgotados || [];
    if (old.DESTAQUES) seed.DESTAQUES = old.DESTAQUES;
    // preserva os RECIPIENTES da loja (nomes, tamanhos em ml, preços, e adições/remoções de copo/tigela).
    // Mantém recipientes novos que venham do código; o que a loja apagou continua apagado.
    if (Array.isArray(old.RECIPIENTES) && old.RECIPIENTES.length) {
      const novos = seed.RECIPIENTES.filter((sr) => !old.RECIPIENTES.some((or) => or.id === sr.id));
      seed.RECIPIENTES = [...old.RECIPIENTES.map((r) => ({ ...r, tamanhos: (r.tamanhos || []).map((t) => ({ ...t })) })), ...novos];
    }
    if (old.secao2) seed.secao2 = old.secao2;
    if (old.upsell) seed.upsell = old.upsell;
    if (old.cupons) seed.cupons = old.cupons;
    if (old.textos) seed.textos = { ...seed.textos, ...old.textos };
    // preserva preços editados (casa por id; itens removidos do seed somem naturalmente)
    const priceMap = {};
    (old.RECIPIENTES || []).forEach((r) => (r.tamanhos || []).forEach((t) => priceMap[t.id] = t.preco));
    (old.FRAPE?.tamanhos || []).forEach((t) => priceMap[t.id] = t.preco);
    (old.MILKSHAKE?.tamanhos || []).forEach((t) => priceMap[t.id] = t.preco);
    (old.ACOMPANHAMENTOS || []).forEach((g) => (g.itens || []).forEach((i) => priceMap[i.id] = i.preco));
    [...(old.SALADAS || []), ...(old.SOBREMESAS || []), ...(old.BEBIDAS || [])].forEach((p) => priceMap[p.id] = p.preco);
    const comboBase = {}; (old.COMBOS || []).forEach((c) => comboBase[c.id] = c.valorBase);
    seed.RECIPIENTES.forEach((r) => r.tamanhos.forEach((t) => { if (priceMap[t.id] != null) t.preco = priceMap[t.id]; }));
    seed.FRAPE.tamanhos.forEach((t) => { if (priceMap[t.id] != null) t.preco = priceMap[t.id]; });
    seed.MILKSHAKE.tamanhos.forEach((t) => { if (priceMap[t.id] != null) t.preco = priceMap[t.id]; });
    if (old.MILKSHAKE?.precoSaborExtra != null) seed.MILKSHAKE.precoSaborExtra = old.MILKSHAKE.precoSaborExtra;
    (old.SOBREMESAS || []).forEach((s) => { const ns = seed.SOBREMESAS.find((x) => x.id === s.id); if (ns && s.precoBolaExtra != null) ns.precoBolaExtra = s.precoBolaExtra; });
    seed.ACOMPANHAMENTOS.forEach((g) => g.itens.forEach((i) => { if (priceMap[i.id] != null) i.preco = priceMap[i.id]; }));
    [...seed.SALADAS, ...seed.SOBREMESAS, ...seed.BEBIDAS].forEach((p) => { if (priceMap[p.id] != null) p.preco = priceMap[p.id]; });
    seed.COMBOS.forEach((c) => { if (comboBase[c.id] != null) c.valorBase = comboBase[c.id]; });
    // preserva NOMES e DESCRICOES editados (por id)
    const nameMap = {}, descMap = {};
    (old.COMBOS || []).forEach((c) => { nameMap[c.id] = c.nome; descMap[c.id] = c.desc; });
    (old.ACOMPANHAMENTOS || []).forEach((g) => (g.itens || []).forEach((i) => { nameMap[i.id] = i.nome; }));
    [...(old.SALADAS || []), ...(old.SOBREMESAS || []), ...(old.BEBIDAS || [])].forEach((p) => { nameMap[p.id] = p.nome; descMap[p.id] = p.desc; });
    seed.COMBOS.forEach((c) => { if (nameMap[c.id] != null) c.nome = nameMap[c.id]; if (descMap[c.id] != null) c.desc = descMap[c.id]; });
    seed.ACOMPANHAMENTOS.forEach((g) => g.itens.forEach((i) => { if (nameMap[i.id] != null) i.nome = nameMap[i.id]; }));
    [...seed.SALADAS, ...seed.SOBREMESAS, ...seed.BEBIDAS].forEach((p) => { if (nameMap[p.id] != null) p.nome = nameMap[p.id]; if (descMap[p.id] != null) p.desc = descMap[p.id]; });
    // preserva os SABORES (tipos) que a loja editou nas bebidas
    const tiposMap = {}; (old.BEBIDAS || []).forEach((p) => { if (Array.isArray(p.tipos)) tiposMap[p.id] = p.tipos; });
    seed.BEBIDAS.forEach((p) => { if (tiposMap[p.id]) p.tipos = tiposMap[p.id]; });
    ['FRAPE', 'MILKSHAKE'].forEach((k) => { if (old[k] && old[k].nome) seed[k].nome = old[k].nome; if (old[k] && old[k].desc) seed[k].desc = old[k].desc; });
    // itens CRIADOS pela loja (nao existem no seed do codigo) -> mantem
    const sCombo = new Set(seed.COMBOS.map((c) => c.id));
    (old.COMBOS || []).forEach((c) => { if (!sCombo.has(c.id)) seed.COMBOS.push(c); });
    seed.ACOMPANHAMENTOS.forEach((sg) => { const og = (old.ACOMPANHAMENTOS || []).find((g) => g.id === sg.id); if (og) { const ids = new Set(sg.itens.map((i) => i.id)); (og.itens || []).forEach((i) => { if (!ids.has(i.id)) sg.itens.push(i); }); } });
    ['SALADAS', 'SOBREMESAS', 'BEBIDAS'].forEach((k) => { const ids = new Set(seed[k].map((p) => p.id)); (old[k] || []).forEach((p) => { if (!ids.has(p.id)) seed[k].push(p); }); });
  }
  return seed;
}
// Lista de produtos selecionáveis (com preço "a partir de", pro auto-preencher)
function allProductsList(menu) {
  const out = [];
  const minTam = (tamanhos) => Math.min(...(tamanhos || []).map((t) => t.preco));
  const comboMin = minTam((menu.RECIPIENTES || []).flatMap((r) => (r.id === 'copo' || r.id === 'tigela') ? r.tamanhos : []));
  (menu.COMBOS || []).forEach((c) => out.push({ id: c.id, nome: 'Combinado ' + c.nome, preco: c.valorBase + comboMin }));
  out.push({ id: 'monte', nome: 'Monte Seu Açaí', preco: minTam((menu.RECIPIENTES || []).flatMap((r) => r.tamanhos)) });
  out.push({ id: 'frape', nome: 'Frapê', preco: minTam(menu.FRAPE?.tamanhos) });
  out.push({ id: 'milkshake', nome: 'Milk Shake', preco: minTam(menu.MILKSHAKE?.tamanhos) });
  (menu.SALADAS || []).forEach((s) => out.push({ id: s.id, nome: s.nome, preco: s.preco }));
  (menu.SOBREMESAS || []).forEach((s) => out.push({ id: s.id, nome: s.nome, preco: s.preco }));
  (menu.BEBIDAS || []).forEach((s) => out.push({ id: s.id, nome: s.nome, preco: s.preco }));
  return out;
}

async function saveMenu(menu) {
  menu.updated = Date.now();
  const { error } = await client.from('store_config').upsert({ store_slug: STORE_SLUG, menu, updated_at: new Date().toISOString() });
  if (error) { toast('Erro ao salvar'); console.error(error); return false; }
  cfg.menu = menu; toast('Salvo. Já apareceu pro cliente.'); return true;
}

function renderCardapio() {
  const host = document.getElementById('tabContent'); host.innerHTML = '';
  const menu = currentMenu();
  const esgot = new Set(menu.esgotados || []);

  if (!cfg.menu) {
    host.append(el('div', { class: 'panel-card' }, [
      el('h3', { text: 'Publicar o cardápio' }),
      el('p', { class: 'hint', text: 'Seu cardápio ainda não foi publicado no banco. Clique pra publicar o cardápio completo (recipientes, combos, acompanhamentos, preços). Depois é só editar aqui.' }),
      el('button', { class: 'btn btn-primary', text: 'Publicar cardápio agora', onclick: async (e) => { e.target.disabled = true; if (await saveMenu(seedMenu())) renderCardapio(); } }),
    ]));
    return;
  }

  // Atualizar estrutura nova (preserva fotos/esgotados/destaques)
  host.append(el('div', { class: 'panel-card' }, [
    el('h3', { text: 'Atualizar cardápio' }),
    el('p', { class: 'hint', text: 'Aplica melhorias de estrutura do sistema. Seus preços, nomes, descrições, fotos, esgotados, destaques e os itens que você criou ou removeu são mantidos.' }),
    el('button', { class: 'btn btn-ghost', text: 'Atualizar para a versão mais nova', onclick: async (e) => { e.target.disabled = true; if (await saveMenu(mergedSeed())) renderCardapio(); else e.target.disabled = false; } }),
  ]));

  // Fotos das Categorias (tiles)
  menu.categoriaFotos = menu.categoriaFotos || {};
  const catCard = el('div', { class: 'panel-card' }, [el('h3', { text: 'Fotos das Categorias' }), el('p', { class: 'hint', text: 'Imagem do tile de cada categoria (seção Categorias). Aparece na hora pro cliente.' })]);
  (menu.CATEGORIAS || []).filter((c) => c.id !== 'destaques').forEach((c) => {
    catCard.append(menuRow({ id: c.id, nome: c.nome, foto: menu.categoriaFotos[c.id], price: null, noStar: true, onFoto: (url) => { menu.categoriaFotos[c.id] = url; } }));
  });
  catCard.append(saveBtn(menu));
  host.append(catCard);

  // Fotos: Monte, Frapê, Milk Shake
  menu.FOTOS_SEED = menu.FOTOS_SEED || {};
  const espCard = el('div', { class: 'panel-card' }, [el('h3', { text: 'Fotos: Monte, Frapê, Milk Shake' }), el('p', { class: 'hint', text: 'Foto desses produtos especiais (salada e diversos têm foto nas seções abaixo).' })]);
  [['monte', 'Monte Seu Açaí'], ['frape', 'Frapê'], ['milkshake', 'Milk Shake']].forEach(([key, nome]) => {
    espCard.append(menuRow({ id: key, nome, foto: menu.FOTOS_SEED[key], price: null, noStar: true, onFoto: (url) => { menu.FOTOS_SEED[key] = url; } }));
  });
  espCard.append(saveBtn(menu));
  host.append(espCard);

  // Valores especiais: sabor extra do Milk Shake + bola extra do Petit/Brownie
  menu.MILKSHAKE = menu.MILKSHAKE || {};
  const valCard = el('div', { class: 'panel-card' }, [el('h3', { text: 'Valores especiais' }), el('p', { class: 'hint', text: 'Quanto soma cada extra. Reajuste quando mudar os preços.' })]);
  const msInput = el('input', { type: 'number', step: '0.50', value: Number(menu.MILKSHAKE.precoSaborExtra ?? 5).toFixed(2), style: 'width:100px;text-align:right' });
  msInput.addEventListener('input', () => menu.MILKSHAKE.precoSaborExtra = parseFloat(msInput.value) || 0);
  valCard.append(el('div', { class: 'frow' }, [el('label', { text: 'Milk Shake: cada sabor a mais (R$)' }), msInput]));
  (menu.SOBREMESAS || []).filter((s) => s.sorvete).forEach((s) => {
    const inp = el('input', { type: 'number', step: '0.50', value: Number(s.precoBolaExtra ?? 3.5).toFixed(2), style: 'width:100px;text-align:right' });
    inp.addEventListener('input', () => { s.precoBolaExtra = parseFloat(inp.value) || 0; });
    valCard.append(el('div', { class: 'frow' }, [el('label', { text: s.nome + ': cada bola a mais (R$)' }), inp]));
  });
  valCard.append(saveBtn(menu));
  host.append(valCard);

  // Seção extra (Promoção) abaixo do TOP 5 — lista compacta + seletor
  menu.secao2 = menu.secao2 || { titulo: 'Promoção da semana', ativa: false, itens: [] };
  const s2 = menu.secao2;
  if (!s2.itens) s2.itens = (s2.ids || []).map((id) => ({ tipo: 'ref', refId: id })); // formato antigo
  const produtos = allProductsList(menu);
  const nomeProduto = (id) => produtos.find((p) => p.id === id)?.nome || id;
  const prodSelect = (selId) => el('select', { style: 'border:1.5px solid var(--line);border-radius:10px;padding:9px;flex:1;min-width:0' },
    [el('option', { value: '', text: 'Escolha um produto do cardápio...' }), ...produtos.map((p) => el('option', { value: p.id, text: `${p.nome} (${money(p.preco)})`, selected: p.id === selId }))]);

  const s2card = el('div', { class: 'panel-card' }, [el('h3', { text: 'Seção extra (abaixo do TOP 5)' }), el('p', { class: 'hint', text: 'Ex: Promoção, Baratos da semana. Adicione produtos do cardápio ou crie uma oferta personalizada com preço promocional.' })]);
  const s2ativa = el('input', { type: 'checkbox' }); s2ativa.checked = !!s2.ativa; s2ativa.addEventListener('change', () => s2.ativa = s2ativa.checked);
  const s2tit = el('input', { type: 'text', value: s2.titulo || '', style: 'width:100%;text-align:left' }); s2tit.addEventListener('input', () => s2.titulo = s2tit.value);
  s2card.append(el('div', { class: 'frow' }, [el('label', { text: 'Mostrar a seção' }), el('label', { class: 'switch' }, [s2ativa, el('span')])]));
  s2card.append(el('div', { class: 'frow' }, [el('label', { text: 'Título' }), s2tit]));

  const s2box = el('div');
  const renderS2 = () => {
    s2box.innerHTML = '';
    if (!s2.itens.length) s2box.append(el('p', { class: 'hint', text: 'Nenhum item ainda. Adicione abaixo.' }));
    s2.itens.forEach((it, idx) => {
      const rm = el('button', { class: 'btn btn-ghost mini', text: '✕', onclick: () => { s2.itens.splice(idx, 1); renderS2(); } });
      if (it.tipo === 'custom') {
        const nome = el('input', { type: 'text', value: it.nome || '', placeholder: 'Nome da oferta (ex: Copo 500ml Morango + Ninho)', style: 'flex:1;text-align:left' }); nome.addEventListener('input', () => it.nome = nome.value);
        const desc = el('input', { type: 'text', value: it.desc || '', placeholder: 'O que vem (descrição curta)', style: 'width:100%;text-align:left' }); desc.addEventListener('input', () => it.desc = desc.value);
        const de = el('input', { type: 'number', step: '0.50', value: it.precoDe != null ? Number(it.precoDe).toFixed(2) : '', placeholder: 'De (opc.)', style: 'width:100px;text-align:right' }); de.addEventListener('input', () => it.precoDe = de.value === '' ? null : (parseFloat(de.value) || 0));
        const por = el('input', { type: 'number', step: '0.50', value: Number(it.preco || 0).toFixed(2), style: 'width:100px;text-align:right' }); por.addEventListener('input', () => it.preco = parseFloat(por.value) || 0);
        s2box.append(el('div', { style: 'border:1.5px solid var(--line);border-radius:12px;padding:10px;margin:8px 0' }, [
          el('div', { style: 'display:flex;gap:8px;align-items:center' }, [el('span', { class: 'pill', text: '🔥 Oferta' }), nome, fotoBtn((url) => { it.foto = url; }), rm]),
          el('div', { style: 'margin-top:8px' }, desc),
          el('div', { style: 'display:flex;gap:8px;align-items:center;margin-top:8px' }, [el('label', { style: 'font-size:.82rem;font-weight:700', text: 'De R$' }), de, el('label', { style: 'font-size:.82rem;font-weight:700', text: 'Por R$' }), por]),
        ]));
      } else {
        s2box.append(el('div', { class: 'menu-item' }, [el('span', { class: 'mi-name', text: nomeProduto(it.refId) }), el('span', { class: 'pill', text: 'do cardápio' }), rm]));
      }
    });
  };
  renderS2();
  const s2sel = prodSelect('');
  s2card.append(s2box,
    el('div', { style: 'display:flex;gap:8px;margin-top:10px;flex-wrap:wrap' }, [
      s2sel,
      el('button', { class: 'btn btn-ghost mini', text: '+ Adicionar', onclick: () => { if (s2sel.value) { s2.itens.push({ tipo: 'ref', refId: s2sel.value }); s2sel.value = ''; renderS2(); } } }),
      el('button', { class: 'btn btn-ghost mini', text: '🔥 Criar oferta personalizada', onclick: () => { s2.itens.push({ tipo: 'custom', id: 'promo-' + Date.now(), nome: '', desc: '', preco: 0, precoDe: null }); renderS2(); } }),
    ]),
    saveBtn(menu));
  host.append(s2card);

  // Upsell na sacola — escolhe do cardápio (com desconto) ou oferta livre
  menu.upsell = menu.upsell || { ativo: false, titulo: 'Que tal adicionar?', itens: [] };
  const up = menu.upsell; up.itens = up.itens || [];
  const upcard = el('div', { class: 'panel-card' }, [el('h3', { text: 'Upsell (oferta na sacola)' }), el('p', { class: 'hint', text: 'Aparece na sacola antes de enviar, com 1 clique pra adicionar. Puxe um produto do cardápio (e mude o preço pra dar desconto) ou crie uma oferta livre. Ex: Água R$3, Aumentar p/ 500ml +R$5.' })]);
  const upativo = el('input', { type: 'checkbox' }); upativo.checked = !!up.ativo; upativo.addEventListener('change', () => up.ativo = upativo.checked);
  const uptit = el('input', { type: 'text', value: up.titulo || '', style: 'width:100%;text-align:left' }); uptit.addEventListener('input', () => up.titulo = uptit.value);
  upcard.append(el('div', { class: 'frow' }, [el('label', { text: 'Mostrar o upsell' }), el('label', { class: 'switch' }, [upativo, el('span')])]));
  upcard.append(el('div', { class: 'frow' }, [el('label', { text: 'Título' }), uptit]));
  const upBox = el('div');
  const renderUp = () => {
    upBox.innerHTML = '';
    if (!up.itens.length) upBox.append(el('p', { class: 'hint', text: 'Nenhuma oferta ainda. Adicione abaixo.' }));
    up.itens.forEach((it, idx) => {
      const thumb = it.foto ? el('img', { class: 'mi-thumb', src: imgUrl(it.foto, 120, 72), loading: 'lazy', decoding: 'async', onerror: function () { if (this.dataset.orig) this.replaceWith(el('div', { class: 'mi-thumb', html: '<span>🍧</span>' })); else { this.dataset.orig = '1'; this.src = it.foto; } } }) : el('div', { class: 'mi-thumb', html: '<span>🍧</span>' });
      const nome = el('input', { type: 'text', value: it.nome || '', placeholder: 'Nome da oferta', style: 'flex:1;text-align:left' }); nome.addEventListener('input', () => it.nome = nome.value);
      const preco = el('input', { type: 'number', step: '0.50', value: Number(it.preco || 0).toFixed(2), style: 'width:90px;text-align:right' }); preco.addEventListener('input', () => it.preco = parseFloat(preco.value) || 0);
      const rm = el('button', { class: 'btn btn-ghost mini', text: '✕', onclick: () => { up.itens.splice(idx, 1); renderUp(); } });
      upBox.append(el('div', { class: 'menu-item' }, [thumb, nome, preco, fotoBtn((url) => { it.foto = url; renderUp(); }), rm]));
    });
  };
  renderUp();
  const upSel = prodSelect('');
  upcard.append(upBox,
    el('div', { style: 'display:flex;gap:8px;margin-top:10px;flex-wrap:wrap' }, [
      upSel,
      el('button', { class: 'btn btn-ghost mini', text: '+ Usar do cardápio', onclick: () => {
        const p = produtos.find((x) => x.id === upSel.value);
        if (p) { up.itens.push({ id: 'up-' + Date.now(), refId: p.id, nome: p.nome, preco: p.preco, foto: (menu.FOTOS_SEED || {})[p.id] || null }); upSel.value = ''; renderUp(); }
      } }),
      el('button', { class: 'btn btn-ghost mini', text: '+ Oferta livre', onclick: () => { up.itens.push({ id: 'up-' + Date.now(), nome: '', preco: 0 }); renderUp(); } }),
    ]),
    saveBtn(menu));
  host.append(upcard);

  // Cupons de desconto
  menu.cupons = menu.cupons || [];
  const cupCard = el('div', { class: 'panel-card' }, [el('h3', { text: 'Cupons de desconto' }), el('p', { class: 'hint', text: 'O cliente digita o código no checkout. % desconta sobre o subtotal; R$ desconta um valor fixo. Mínimo = subtotal mínimo pra valer (0 = sem mínimo). Desmarque pra desativar sem apagar.' })]);
  const cupBox = el('div');
  const renderCup = () => {
    cupBox.innerHTML = '';
    if (!menu.cupons.length) cupBox.append(el('p', { class: 'hint', text: 'Nenhum cupom ainda. Crie abaixo.' }));
    menu.cupons.forEach((c, idx) => {
      const cod = el('input', { type: 'text', value: c.codigo || '', placeholder: 'EX: ACAI10', style: 'flex:1;min-width:90px;text-align:left;text-transform:uppercase' });
      cod.addEventListener('input', () => c.codigo = cod.value.toUpperCase().replace(/\s/g, ''));
      const tipo = el('select', { style: 'border:1.5px solid var(--line);border-radius:10px;padding:9px' });
      [['percent', '%'], ['fixo', 'R$']].forEach(([v, t]) => { const o = el('option', { value: v, text: t }); if ((c.tipo || 'percent') === v) o.selected = true; tipo.append(o); });
      tipo.addEventListener('change', () => c.tipo = tipo.value);
      const valor = el('input', { type: 'number', step: '0.5', value: Number(c.valor || 0), placeholder: 'Valor', style: 'width:74px;text-align:right' }); valor.addEventListener('input', () => c.valor = parseFloat(valor.value) || 0);
      const minimo = el('input', { type: 'number', step: '1', value: Number(c.minimo || 0), placeholder: 'Mín', style: 'width:64px;text-align:right' }); minimo.addEventListener('input', () => c.minimo = parseFloat(minimo.value) || 0);
      const ativo = el('input', { type: 'checkbox' }); ativo.checked = c.ativo !== false; ativo.addEventListener('change', () => c.ativo = ativo.checked);
      const primeira = el('input', { type: 'checkbox' }); primeira.checked = !!c.primeiraCompra; primeira.addEventListener('change', () => c.primeiraCompra = primeira.checked);
      const rm = el('button', { class: 'btn btn-ghost mini', text: '✕', onclick: () => { menu.cupons.splice(idx, 1); renderCup(); } });
      cupBox.append(el('div', { class: 'menu-item', style: 'flex-wrap:wrap;gap:6px' }, [
        cod, tipo, valor, el('span', { class: 'hint', style: 'margin:0', text: 'mín' }), minimo,
        el('label', { style: 'display:flex;align-items:center;gap:4px;flex:0 0 auto', title: 'Vale só na primeira compra do cliente' }, [primeira, el('span', { class: 'hint', style: 'margin:0', text: '1ª compra' })]),
        el('label', { class: 'switch', style: 'flex:0 0 auto' }, [ativo, el('span')]), rm,
      ]));
    });
  };
  renderCup();
  cupCard.append(cupBox,
    el('button', { class: 'btn btn-ghost mini', style: 'margin-top:10px', text: '+ Novo cupom', onclick: () => { menu.cupons.push({ codigo: '', tipo: 'percent', valor: 10, minimo: 0, ativo: true }); renderCup(); } }),
    saveBtn(menu));
  host.append(cupCard);

  // Combinados: nome, ingredientes, preço, destaque, esgotado, foto, adicionar/remover
  const combosCard = el('div', { class: 'panel-card' }, [el('h3', { text: 'Combinados' }), el('p', { class: 'hint', text: 'Edite nome e ingredientes. Estrela = TOP 5. Chave = esgotado. Valor = preço base (o tamanho soma por cima). "+ Novo" cria um combinado.' })]);
  menu.COMBOS.forEach((c) => combosCard.append(menuRow({
    id: c.id, nome: c.nome, sub: c.desc, price: c.valorBase, foto: menu.FOTOS_SEED?.[c.id],
    isDestaque: (menu.DESTAQUES || []).includes(c.id), esgotado: esgot.has(c.id),
    onName: (v) => { c.nome = v; }, onDesc: (v) => { c.desc = v; },
    onPrice: (v) => { c.valorBase = v; }, onStar: () => toggleDestaque(menu, c.id),
    onEsg: () => toggleEsg(menu, c.id), onFoto: (url) => { (menu.FOTOS_SEED = menu.FOTOS_SEED || {})[c.id] = url; },
    onRemove: () => { if (confirm(`Remover "${c.nome}"?`)) { (menu.removidos = menu.removidos || []).push(c.id); menu.COMBOS = menu.COMBOS.filter((x) => x.id !== c.id); renderCardapio(); } },
  })));
  combosCard.append(el('button', { class: 'btn btn-ghost mini', style: 'margin-top:8px', text: '+ Novo combinado', onclick: () => { menu.COMBOS.push({ id: 'combo-' + Date.now(), nome: 'Novo combinado', desc: '', valorBase: 10 }); renderCardapio(); } }));
  combosCard.append(saveBtn(menu));
  host.append(combosCard);

  // Recipientes (tamanhos): nome do recipiente + ml + preço, adicionar/remover tamanho
  const recCard = el('div', { class: 'panel-card' }, [el('h3', { text: 'Tamanhos (Monte e Combinados)' }), el('p', { class: 'hint', text: 'Nome do recipiente, e o ml + preço de cada tamanho. Mudar o ml muda o nome que o cliente vê (ex: "Copo 500ml"). "+ Adicionar tamanho" cria; ✕ remove. Deixe ao menos 1 tamanho.' })]);
  menu.RECIPIENTES.forEach((r) => {
    const nomeInp = el('input', { class: 'mi-edit', type: 'text', value: r.nome || '', placeholder: 'Nome (ex: Copo)', style: 'font-weight:800;max-width:170px;margin-top:12px' });
    nomeInp.addEventListener('input', () => { r.nome = nomeInp.value; });
    recCard.append(nomeInp);
    r.tamanhos.forEach((t) => {
      const ml = el('input', { type: 'number', step: '50', min: '0', value: t.ml, style: 'width:84px;text-align:right' });
      ml.addEventListener('input', () => { t.ml = parseInt(ml.value, 10) || 0; });
      const preco = el('input', { class: 'price', type: 'number', step: '0.50', value: Number(t.preco).toFixed(2) });
      preco.addEventListener('input', () => { t.preco = parseFloat(preco.value) || 0; });
      const rm = el('button', { class: 'btn btn-ghost mini', title: 'Remover tamanho', text: '✕', onclick: () => {
        if (r.tamanhos.length <= 1) return toast('Deixe pelo menos 1 tamanho.');
        if (confirm(`Remover ${r.nome} ${t.ml}ml?`)) { r.tamanhos = r.tamanhos.filter((x) => x.id !== t.id); renderCardapio(); }
      } });
      recCard.append(el('div', { class: 'menu-item' }, [
        el('div', { class: 'mi-name' }, el('span', { text: 'Tamanho' })),
        ml, el('span', { class: 'hint', style: 'margin:0', text: 'ml' }), preco, rm,
      ]));
    });
    recCard.append(el('button', { class: 'btn btn-ghost mini', style: 'margin:4px 0 6px', text: '+ Adicionar tamanho em ' + (r.nome || 'recipiente'), onclick: () => { r.tamanhos.push({ id: r.id + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6), ml: 300, preco: 15 }); renderCardapio(); } }));
  });
  recCard.append(saveBtn(menu));
  host.append(recCard);

  // Acompanhamentos: nome, preço, esgotado, adicionar/remover por grupo
  const acCard = el('div', { class: 'panel-card' }, [el('h3', { text: 'Acompanhamentos' }), el('p', { class: 'hint', text: 'Edite nome e preço de cada acompanhamento. "+ Adicionar" cria um novo no grupo.' })]);
  menu.ACOMPANHAMENTOS.forEach((g) => {
    acCard.append(el('div', { style: 'font-weight:800;margin-top:10px', text: g.nome }));
    g.itens.forEach((it) => acCard.append(menuRow({ id: it.id, nome: it.nome, price: it.preco, esgotado: esgot.has(it.id), onName: (v) => { it.nome = v; }, onPrice: (v) => { it.preco = v; }, onEsg: () => toggleEsg(menu, it.id), noStar: true, onRemove: () => { if (confirm(`Remover "${it.nome}"?`)) { (menu.removidos = menu.removidos || []).push(it.id); g.itens = g.itens.filter((x) => x.id !== it.id); renderCardapio(); } } })));
    acCard.append(el('button', { class: 'btn btn-ghost mini', style: 'margin:4px 0 6px', text: '+ Adicionar em ' + g.nome, onclick: () => { g.itens.push({ id: g.id + '-' + Date.now(), nome: 'Novo item', preco: 3 }); renderCardapio(); } }));
  });
  acCard.append(saveBtn(menu));
  host.append(acCard);

  // Frapê e Milk Shake: nome e descrição editáveis (ex: "Cremoso, escolha o sabor")
  menu.FRAPE = menu.FRAPE || {}; menu.MILKSHAKE = menu.MILKSHAKE || {};
  const espNomeCard = el('div', { class: 'panel-card' }, [el('h3', { text: 'Frapê e Milk Shake' }), el('p', { class: 'hint', text: 'Nome e descrição que aparecem no cardápio.' })]);
  [['FRAPE', 'Frapê'], ['MILKSHAKE', 'Milk Shake']].forEach(([k]) => espNomeCard.append(menuRow({ id: k, nome: menu[k].nome, sub: menu[k].desc, onName: (v) => { menu[k].nome = v; }, onDesc: (v) => { menu[k].desc = v; }, noStar: true, simple: true })));
  espNomeCard.append(saveBtn(menu));
  host.append(espNomeCard);

  // Textos e exemplos que aparecem nos modais do cliente
  menu.textos = menu.textos || {};
  const txtCard = el('div', { class: 'panel-card' }, [el('h3', { text: 'Textos do cardápio' }), el('p', { class: 'hint', text: 'As mensagens e exemplos que o cliente vê nos modais. Edite do jeito que preferir.' })]);
  const txtRow = (label, key, ph) => { const i = el('input', { type: 'text', value: menu.textos[key] || '', placeholder: ph || '', style: 'width:100%;text-align:left' }); i.addEventListener('input', () => menu.textos[key] = i.value); return el('div', { class: 'frow', style: 'flex-direction:column;align-items:stretch;gap:4px' }, [el('label', { text: label }), i]); };
  txtCard.append(
    txtRow('Embaixo do "Monte Seu Açaí"', 'monteDesc', SEED.TEXTOS.monteDesc),
    txtRow('Embaixo de "Base"', 'baseDesc', SEED.TEXTOS.baseDesc),
    txtRow('Embaixo de "Turbine / Adicione acompanhamentos"', 'turbineDesc', SEED.TEXTOS.turbineDesc),
    txtRow('Embaixo de "Sabores" (Milk Shake) — use {valor} pro preço do sabor extra', 'msSaboresDesc', SEED.TEXTOS.msSaboresDesc),
    txtRow('Embaixo de "Bolas de sorvete" (Petit/Brownie) — use {valor} pro preço da bola extra', 'bolasDesc', SEED.TEXTOS.bolasDesc),
    txtRow('Exemplo embaixo de "Observação"', 'obsExemplo', SEED.TEXTOS.obsExemplo),
    txtRow('Texto cinza dentro do campo de observação', 'obsPlaceholder', SEED.TEXTOS.obsPlaceholder),
    saveBtn(menu),
  );
  host.append(txtCard);

  // Mensagens de WhatsApp usadas na aba Clientes (CRM)
  const waCard = el('div', { class: 'panel-card' }, [
    el('h3', { text: 'Mensagens de WhatsApp (Clientes)' }),
    el('p', { class: 'hint', text: 'O texto que já vem pronto ao clicar no WhatsApp na aba Clientes. Use {nome} pro primeiro nome do cliente e {loja} pro nome da loja.' }),
  ]);
  const waRow = (label, key, def) => {
    const t = el('textarea', { rows: 3, style: 'width:100%;text-align:left;resize:vertical' });
    t.value = menu.textos[key] || def || '';
    t.addEventListener('input', () => menu.textos[key] = t.value);
    return el('div', { class: 'frow', style: 'flex-direction:column;align-items:stretch;gap:4px' }, [el('label', { text: label }), t]);
  };
  waCard.append(
    waRow('Cliente sumido (sem pedir há um tempo)', 'waInativo', SEED.TEXTOS.waInativo),
    waRow('Abandonou o carrinho (entrou no checkout e não finalizou)', 'waAbandono', SEED.TEXTOS.waAbandono),
    saveBtn(menu),
  );
  host.append(waCard);

  // Simples (saladas, diversos, bebidas): nome, descrição, preço, foto, adicionar/remover
  [['SALADAS', 'Saladas'], ['SOBREMESAS', 'Diversos'], ['BEBIDAS', 'Bebidas']].forEach(([k, label]) => {
    const card = el('div', { class: 'panel-card' }, [el('h3', { text: label }), el('p', { class: 'hint', text: 'Edite nome, descrição e preço. "+ Adicionar" cria um item.' })]);
    menu[k].forEach((p) => {
      card.append(menuRow({ id: p.id, nome: p.nome, sub: p.desc, price: p.preco, foto: menu.FOTOS_SEED?.[p.id], esgotado: esgot.has(p.id), onName: (v) => { p.nome = v; }, onDesc: (v) => { p.desc = v; }, onPrice: (v) => { p.preco = v; }, onFoto: (url) => { (menu.FOTOS_SEED = menu.FOTOS_SEED || {})[p.id] = url; }, onEsg: () => toggleEsg(menu, p.id), noStar: true, onRemove: () => { if (confirm(`Remover "${p.nome}"?`)) { (menu.removidos = menu.removidos || []).push(p.id); menu[k] = menu[k].filter((x) => x.id !== p.id); renderCardapio(); } } }));
      if (k === 'BEBIDAS') card.append(tiposEditor(p));
    });
    card.append(el('button', { class: 'btn btn-ghost mini', style: 'margin-top:8px', text: '+ Adicionar', onclick: () => { menu[k].push({ id: k.toLowerCase() + '-' + Date.now(), nome: 'Novo item', desc: '', preco: 5, ...(k === 'SALADAS' ? { acomp: true } : {}) }); renderCardapio(); } }));
    card.append(saveBtn(menu));
    host.append(card);
  });
}

function menuRow({ id, nome, sub, price, foto, isDestaque, esgotado, onPrice, onStar, onEsg, onFoto, onName, onDesc, onRemove, simple, noStar }) {
  const priceInput = price == null ? null : el('input', { class: 'price', type: 'number', step: '0.50', value: Number(price).toFixed(2) });
  if (priceInput) priceInput.addEventListener('input', () => onPrice(parseFloat(priceInput.value) || 0));
  // Nome: editável quando onName é passado; senão texto.
  let nameEl;
  if (onName) { const i = el('input', { class: 'mi-edit', type: 'text', value: nome || '', placeholder: 'Nome do item' }); i.addEventListener('input', () => onName(i.value)); nameEl = i; }
  else nameEl = el('span', { text: nome });
  // Descrição: editável quando onDesc é passado; senão small (se houver).
  let descEl = null;
  if (onDesc) { const d = el('input', { class: 'mi-edit mi-desc', type: 'text', value: sub || '', placeholder: 'Descrição / ingredientes' }); d.addEventListener('input', () => onDesc(d.value)); descEl = d; }
  else if (sub) descEl = el('small', { text: sub });
  const row = el('div', { class: 'menu-item' + (onName ? ' mi-editavel' : '') }, [
    !simple ? (foto ? el('img', { class: 'mi-thumb', src: imgUrl(foto, 120, 72), loading: 'lazy', decoding: 'async', onerror: function () { if (this.dataset.orig) this.replaceWith(el('div', { class: 'mi-thumb', html: '<span>🍧</span>' })); else { this.dataset.orig = '1'; this.src = foto; } } }) : el('div', { class: 'mi-thumb', html: '<span>🍧</span>' })) : null,
    el('div', { class: 'mi-name' }, [nameEl, descEl]),
    !noStar && !simple ? starEl(isDestaque, onStar) : null,
    priceInput,
    onFoto ? fotoBtn(onFoto) : null,
    onEsg ? esgSwitch(esgotado, onEsg) : null,
    onRemove ? el('button', { class: 'btn btn-ghost mini', title: 'Remover', text: '✕', onclick: () => onRemove() }) : null,
  ]);
  return row;
}
// Editor de sabores de uma bebida (ex: Coca, Guaraná). O cliente escolhe 1 ao adicionar.
function tiposEditor(p) {
  const wrap = el('div', { class: 'tipos-editor' });
  const render = () => {
    wrap.innerHTML = '';
    p.tipos = p.tipos || [];
    const chips = el('div', { class: 'tipos-chips' }, p.tipos.map((nome, i) => el('span', { class: 'tipo-chip' }, [
      el('span', { text: nome }),
      el('button', { class: 'tipo-x', type: 'button', text: '✕', title: 'Remover sabor', onclick: () => { p.tipos.splice(i, 1); render(); } }),
    ])));
    const inp = el('input', { class: 'mi-edit', type: 'text', placeholder: 'Ex: Coca-Cola, Guaraná...' });
    const addTipo = () => { const v = inp.value.trim(); if (!v) return; (p.tipos = p.tipos || []).push(v); inp.value = ''; render(); inp.focus(); };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addTipo(); } });
    wrap.append(
      el('div', { class: 'hint', style: 'margin:2px 0', text: p.tipos.length ? 'Sabores (o cliente escolhe 1):' : 'Sem sabores. Adicione p/ o cliente escolher (ex: Coca, Guaraná).' }),
      chips,
      el('div', { class: 'tipos-add' }, [inp, el('button', { class: 'btn btn-ghost mini', type: 'button', text: '+ Sabor', onclick: addTipo })]),
    );
  };
  render();
  return wrap;
}
function starEl(on, cb) { const s = el('span', { class: 'star' + (on ? ' on' : ''), text: '★' }); s.addEventListener('click', () => { const nowOn = cb(); s.classList.toggle('on', nowOn); }); return s; }
function esgSwitch(on, cb) { const inp = el('input', { type: 'checkbox' }); inp.checked = !on; const lbl = el('label', { class: 'switch', title: 'Disponível' }, [inp, el('span')]); inp.addEventListener('change', () => cb()); return lbl; }
// Comprime/redimensiona no navegador antes de subir (sem perda visível, deixa o site leve)
async function compressImage(file, maxDim = 1080, quality = 0.85) {
  if (!file.type || !file.type.startsWith('image/')) return { blob: file, jpg: false };
  try {
    const bmp = await loadBitmap(file);
    let width = bmp.naturalWidth || bmp.width, height = bmp.naturalHeight || bmp.height;
    if (!width || !height) throw new Error('sem dimensao');
    if (Math.max(width, height) > maxDim) { const s = maxDim / Math.max(width, height); width = Math.round(width * s); height = Math.round(height * s); }
    const c = document.createElement('canvas'); c.width = width; c.height = height;
    c.getContext('2d').drawImage(bmp, 0, 0, width, height);
    const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', quality));
    return blob && blob.size < file.size ? { blob, jpg: true } : { blob: file, jpg: false };
  } catch { return { blob: file, jpg: false }; }
}
// Decodifica o arquivo via createImageBitmap; se falhar (alguns PNG/HEIC), cai pro <img>.
function loadBitmap(file) {
  if (window.createImageBitmap) return createImageBitmap(file).catch(() => imgDecode(file));
  return imgDecode(file);
}
function imgDecode(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => { URL.revokeObjectURL(url); resolve(im); };
    im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')); };
    im.src = url;
  });
}

function fotoBtn(cb) {
  const file = el('input', { type: 'file', accept: 'image/*', style: 'display:none' });
  const b = el('button', { class: 'btn btn-ghost mini', text: '📷' });
  b.addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const f = file.files[0]; if (!f) return; b.textContent = '...';
    try {
      const { blob, jpg } = await compressImage(f);
      const base = (f.name.replace(/\.[^.]+$/, '') || 'foto').replace(/[^\w]/g, '').slice(0, 30) || 'foto';
      const ext = jpg ? 'jpg' : (f.name.split('.').pop() || 'jpg');
      const path = `${STORE_SLUG}/${Date.now()}-${base}.${ext}`;
      const { error } = await client.storage.from('fotos').upload(path, blob, { upsert: true, cacheControl: '31536000', contentType: jpg ? 'image/jpeg' : f.type });
      if (error) throw error;
      const { data } = client.storage.from('fotos').getPublicUrl(path);
      cb(data.publicUrl); b.textContent = '✓';
    } catch (e) { toast('Erro no upload'); b.textContent = '📷'; }
  });
  b.append(file); return b;
}
function toggleDestaque(menu, id) { menu.DESTAQUES = menu.DESTAQUES || []; const i = menu.DESTAQUES.indexOf(id); if (i >= 0) menu.DESTAQUES.splice(i, 1); else menu.DESTAQUES.push(id); return menu.DESTAQUES.includes(id); }
function toggleEsg(menu, id) { menu.esgotados = menu.esgotados || []; const i = menu.esgotados.indexOf(id); if (i >= 0) menu.esgotados.splice(i, 1); else menu.esgotados.push(id); return menu.esgotados.includes(id); }
function saveBtn(menu) { return el('button', { class: 'btn btn-primary', style: 'margin-top:14px', text: 'Salvar alterações', onclick: (e) => { e.target.disabled = true; saveMenu(menu).then(() => { e.target.disabled = false; }); } }); }

// ---------------------------------------------------------------- Configurações
function currentSettings() { return cfg.settings || SEED.SETTINGS; }
function renderConfig() {
  const host = document.getElementById('tabContent'); host.innerHTML = '';
  const s = JSON.parse(JSON.stringify(currentSettings()));
  const numRow = (label, val, on, step = '1') => { const i = el('input', { type: 'number', step, value: val }); i.addEventListener('input', () => on(parseFloat(i.value) || 0)); return el('div', { class: 'frow' }, [el('label', { text: label }), i]); };

  const ops = el('div', { class: 'panel-card' }, [el('h3', { text: 'Entrega e tempo' }), el('p', { class: 'hint', text: 'Tudo aqui reflete na hora pro cliente.' }),
    numRow('Taxa de entrega (R$)', s.taxaEntrega, (v) => s.taxaEntrega = v, '0.50'),
    numRow('Pedido mínimo (R$, 0 = sem)', s.pedidoMinimo, (v) => s.pedidoMinimo = v, '1'),
    numRow('Tempo retirada (min)', s.retiradaMinutos, (v) => s.retiradaMinutos = v),
    numRow('Tempo base mínimo (min)', s.tempoBaseMin, (v) => s.tempoBaseMin = v),
    numRow('Tempo base máximo (min)', s.tempoBaseMax, (v) => s.tempoBaseMax = v),
    numRow('Acrescentar (min)', s.tempoIncrementoMin, (v) => s.tempoIncrementoMin = v),
    numRow('A cada quantos pedidos abertos', s.tempoIncrementoCadaPedidos, (v) => s.tempoIncrementoCadaPedidos = v),
    numRow('Retirada: acrescentar (min)', s.retiradaIncrementoMin || 0, (v) => s.retiradaIncrementoMin = v),
    numRow('Retirada: a cada quantos pedidos', s.retiradaIncrementoCadaPedidos || 10, (v) => s.retiradaIncrementoCadaPedidos = v),
  ]);

  // Taxa por bairro (exceções) — o resto usa a taxa de entrega padrão acima
  s.taxasBairro = Array.isArray(s.taxasBairro) ? s.taxasBairro : [];
  const bairroCard = el('div', { class: 'panel-card' }, [el('h3', { text: 'Taxa por bairro (exceções)' }), el('p', { class: 'hint', text: 'A entrega usa a taxa padrão acima. Aqui você cadastra SÓ os bairros com valor diferente (ex: Esplanada R$ 12). O cliente digita o bairro e o sistema reconhece, mesmo com erro de digitação.' })]);
  const bairroBox = el('div');
  const renderBairros = () => {
    bairroBox.innerHTML = '';
    if (!s.taxasBairro.length) bairroBox.append(el('p', { class: 'hint', text: 'Nenhuma exceção. Todos os bairros pagam a taxa padrão.' }));
    s.taxasBairro.forEach((b, idx) => {
      const nome = el('input', { type: 'text', value: b.bairro || '', placeholder: 'Bairro (ex: Esplanada)', style: 'flex:1;min-width:120px;text-align:left' });
      nome.addEventListener('input', () => b.bairro = nome.value);
      const tx = el('input', { type: 'number', step: '0.50', value: Number(b.taxa ?? 0).toFixed(2), style: 'width:90px;text-align:right' });
      tx.addEventListener('input', () => b.taxa = parseFloat(tx.value) || 0);
      const rm = el('button', { class: 'btn btn-ghost mini', title: 'Remover', text: '✕', onclick: () => { s.taxasBairro.splice(idx, 1); renderBairros(); } });
      bairroBox.append(el('div', { class: 'menu-item', style: 'gap:8px' }, [nome, el('span', { class: 'hint', style: 'margin:0', text: 'R$' }), tx, rm]));
    });
  };
  renderBairros();
  bairroCard.append(bairroBox, el('button', { class: 'btn btn-ghost mini', style: 'margin-top:10px', text: '+ Adicionar bairro', onclick: () => { s.taxasBairro.push({ bairro: '', taxa: 12 }); renderBairros(); } }));

  const pays = el('div', { class: 'panel-card' }, [el('h3', { text: 'Formas de pagamento (na entrega)' })]);
  [['pix', 'PIX'], ['cartao', 'Cartão'], ['dinheiro', 'Dinheiro']].forEach(([id, label]) => {
    const inp = el('input', { type: 'checkbox' }); inp.checked = (s.pagamentos || []).includes(id);
    inp.addEventListener('change', () => { s.pagamentos = s.pagamentos || []; inp.checked ? (s.pagamentos.includes(id) || s.pagamentos.push(id)) : (s.pagamentos = s.pagamentos.filter((x) => x !== id)); });
    pays.append(el('div', { class: 'frow' }, [el('label', { text: label }), el('label', { class: 'switch' }, [inp, el('span')])]));
  });

  const dias = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  const hours = el('div', { class: 'panel-card' }, [el('h3', { text: 'Horário de funcionamento' }), el('p', { class: 'hint', text: 'Fora do horário o cliente navega mas não finaliza.' })]);
  s.horarios = s.horarios || {};
  dias.forEach((d, i) => {
    const h = s.horarios[i] || { abre: '15:00', fecha: '23:00' };
    const aberto = el('input', { type: 'checkbox' }); aberto.checked = !!s.horarios[i];
    const abre = el('input', { type: 'time', value: h.abre }); const fecha = el('input', { type: 'time', value: h.fecha });
    const apply = () => { s.horarios[i] = aberto.checked ? { abre: abre.value, fecha: fecha.value } : null; };
    [aberto, abre, fecha].forEach((x) => x.addEventListener('change', apply));
    hours.append(el('div', { class: 'frow' }, [el('label', { text: d }), el('label', { class: 'switch' }, [aberto, el('span')]), abre, el('span', { text: 'às' }), fecha]));
  });

  const save = el('button', { class: 'btn btn-primary', style: 'margin:6px 0 30px', text: 'Salvar configurações', onclick: async (e) => {
    e.target.disabled = true;
    // Preserva o status manual (controlado na aba Pedidos) pra este Salvar não sobrescrever.
    const fresh = currentSettings();
    const settings = { ...s, statusManual: fresh.statusManual, statusManualDia: fresh.statusManualDia };
    const { error } = await client.from('store_config').upsert({ store_slug: STORE_SLUG, settings, updated_at: new Date().toISOString() });
    if (error) { toast('Erro ao salvar'); e.target.disabled = false; return; }
    cfg.settings = settings; toast('Configurações salvas. Já valem pro cliente.'); e.target.disabled = false;
  } });

  host.append(ops, bairroCard, pays, hours, save);
}

// ---------------------------------------------------------------- Acessos (logins do painel)
// Chama a Edge Function "manage-users" (a chave de admin fica só no servidor).
async function callManageUsers(body) {
  const { data, error } = await client.functions.invoke('manage-users', { body });
  if (error) {
    let msg = error.message || 'Erro ao falar com o servidor';
    try { const ctx = await error.context?.json?.(); if (ctx?.error) msg = ctx.error; } catch (e) {}
    throw new Error(msg);
  }
  if (data && data.error) throw new Error(data.error);
  return data || {};
}

function renderAcessos() {
  const host = document.getElementById('tabContent'); host.innerHTML = '';
  const listCard = el('div', { class: 'panel-card' }, [
    el('h3', { text: 'Acessos ao painel' }),
    el('p', { class: 'hint', text: 'Quem pode entrar no painel. "Operação" não vê Dashboard nem Configurações. Você não pode excluir o próprio acesso.' }),
  ]);
  const listBox = el('div', {}, el('p', { class: 'hint', text: 'Carregando...' }));
  listCard.append(listBox);
  host.append(listCard);

  async function load() {
    listBox.innerHTML = '';
    try {
      const { users } = await callManageUsers({ action: 'list' });
      if (!users || !users.length) { listBox.append(el('p', { class: 'hint', text: 'Nenhum acesso ainda.' })); return; }
      users.forEach((u) => {
        const tag = el('span', { class: 'pill', text: u.role === 'owner' ? 'Dono' : 'Operação' });
        const acao = u.self
          ? el('span', { class: 'hint', style: 'margin:0', text: '(você)' })
          : el('button', { class: 'btn btn-ghost mini', title: 'Excluir acesso', text: '✕', onclick: async (e) => {
              if (!confirm(`Excluir o acesso de ${u.nome || u.email}? A pessoa não vai mais conseguir entrar.`)) return;
              e.target.disabled = true;
              try { await callManageUsers({ action: 'delete', id: u.id }); toast('Acesso excluído'); load(); }
              catch (err) { toast(err.message); e.target.disabled = false; }
            } });
        listBox.append(el('div', { class: 'menu-item' }, [
          el('div', { class: 'mi-name' }, [el('span', { text: u.nome || '(sem nome)' }), el('small', { text: u.email })]),
          tag, acao,
        ]));
      });
    } catch (err) {
      listBox.append(el('div', { class: 'notice', html: `<p>${escapeHtml(err.message)}</p><p class="hint" style="margin-top:6px">Se aparecer erro de função não encontrada, falta publicar a Edge Function <code>manage-users</code> no Supabase.</p>` }));
    }
  }
  load();

  // ---- Criar novo acesso ----
  const nome = el('input', { type: 'text', placeholder: 'Ex: Maria', style: 'width:100%;text-align:left' });
  const email = el('input', { type: 'email', placeholder: 'email@exemplo.com', autocomplete: 'off', style: 'width:100%;text-align:left' });
  const senha = el('input', { type: 'text', placeholder: 'mínimo 6 caracteres', autocomplete: 'new-password', style: 'width:100%;text-align:left' });
  const cargo = el('select', { style: 'border:1.5px solid var(--line);border-radius:10px;padding:9px' }, [
    el('option', { value: 'operator', text: 'Operação (sem financeiro)' }),
    el('option', { value: 'owner', text: 'Dono (acesso total)' }),
  ]);
  const criar = el('button', { class: 'btn btn-primary', text: 'Criar acesso' });
  criar.addEventListener('click', async () => {
    if (!nome.value.trim() || !email.value.trim() || senha.value.length < 6) return toast('Preencha nome, e-mail e senha (mín. 6).');
    criar.disabled = true; criar.textContent = 'Criando...';
    try {
      await callManageUsers({ action: 'create', nome: nome.value.trim(), email: email.value.trim(), password: senha.value, role: cargo.value });
      toast('Acesso criado! Já pode entrar com esse e-mail e senha.');
      nome.value = ''; email.value = ''; senha.value = ''; load();
    } catch (err) { toast(err.message); }
    criar.disabled = false; criar.textContent = 'Criar acesso';
  });
  const frow = (label, inp) => el('div', { class: 'frow', style: 'flex-direction:column;align-items:stretch;gap:4px' }, [el('label', { text: label }), inp]);
  host.append(el('div', { class: 'panel-card' }, [
    el('h3', { text: 'Criar novo acesso' }),
    el('p', { class: 'hint', text: 'A pessoa entra no painel com o e-mail e a senha que você definir aqui. Anote e passe pra ela.' }),
    frow('Nome', nome), frow('E-mail de acesso', email), frow('Senha', senha),
    el('div', { class: 'frow' }, [el('label', { text: 'Cargo' }), cargo]),
    criar,
  ]));
}

// ---------------------------------------------------------------- Impressora
function renderImpressora() {
  const host = document.getElementById('tabContent'); host.innerHTML = '';
  const cfg = printer.config();
  const status = el('div', { class: 'pill ' + (cfg.printer ? 'pill-ok' : 'pill-closed'), style: 'margin:8px 0' });
  status.innerHTML = `<span class="dot"></span> ${cfg.printer ? 'Impressora: ' + cfg.printer : 'Nenhuma impressora configurada'}`;
  const pickerBox = el('div', { style: 'margin-top:10px' });

  host.append(el('div', { class: 'panel-card' }, [
    el('h3', { text: 'Impressora térmica (EPSON TM-T20)' }),
    el('p', { class: 'hint', html: 'Sua impressora está instalada no Windows como <b>CAIXA</b>. Pra imprimir por ela, usamos o <b>QZ Tray</b>, um programinha grátis que liga o navegador na impressora.' }),
    status,
    el('p', { class: 'hint', html: '<b>Passo 1:</b> instale o QZ Tray no PC da loja em <b>qz.io/download</b> e deixe aberto (ícone perto do relógio).' }),
    el('p', { class: 'hint', html: '<b>Passo 2:</b> clique abaixo, libere quando o QZ Tray perguntar (marque "lembrar") e escolha a impressora <b>CAIXA</b>.' }),
    el('div', { style: 'display:flex;gap:10px;flex-wrap:wrap;margin-top:6px' }, [
      el('button', { class: 'btn btn-primary', text: '🖨 Conectar e listar impressoras', onclick: async (e) => {
        e.target.disabled = true; const old = e.target.textContent; e.target.textContent = 'Conectando...';
        try {
          const printers = await printer.qzListPrinters();
          pickerBox.innerHTML = '';
          if (!printers || !printers.length) pickerBox.append(el('p', { class: 'hint', text: 'Nenhuma impressora encontrada no QZ Tray.' }));
          else {
            const sel = el('select', { style: 'border:1.5px solid var(--line);border-radius:10px;padding:10px;width:100%' },
              printers.map((p) => el('option', { value: p, text: p, selected: p === cfg.printer || /caixa|tm-t20|epson/i.test(p) })));
            const save = el('button', { class: 'btn btn-amarelo', style: 'margin-top:8px', text: 'Salvar impressora', onclick: () => { printer.setConfig('qz', sel.value); toast('Impressora salva: ' + sel.value); renderImpressora(); } });
            pickerBox.append(el('div', { class: 'frow' }, [el('label', { text: 'Escolha a impressora' }), sel]), save);
          }
        } catch (err) { console.error(err); toast('QZ Tray não encontrado. Instale e deixe aberto.'); }
        e.target.disabled = false; e.target.textContent = old;
      } }),
      el('button', { class: 'btn btn-ghost', text: '🧾 Imprimir teste', onclick: async () => { try { await printer.test(store); toast('Teste enviado'); } catch (err) { toast(err.message || 'Configure a impressora'); } } }),
    ]),
    pickerBox,
    el('p', { class: 'hint', style: 'margin-top:14px', html: 'A impressão sai sozinha quando você aceita um pedido (2 vias do entregador + 1 papel por item). Guia completo em <code>docs/GUIA-IMPRESSORA.md</code>.' }),
  ]));

  if (printer.supportsSerial()) {
    host.append(el('div', { class: 'panel-card' }, [
      el('h3', { text: 'Alternativa: porta serial direta' }),
      el('p', { class: 'hint', text: 'Use apenas se a impressora aparecer como porta serial. Não é o caso da EPSON instalada como CAIXA.' }),
      el('button', { class: 'btn btn-ghost', text: 'Conectar via porta serial', onclick: async () => { try { await printer.connectSerial(); toast('Conectada via serial'); renderImpressora(); } catch (err) { toast(err.message); } } }),
    ]));
  }
}
