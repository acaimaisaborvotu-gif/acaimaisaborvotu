// =============================================================================
// PAINEL DE GESTÃO — Açaí Mais Sabor
// Pedidos em tempo real + som, aceite que imprime, fluxo de status,
// editor de cardápio, configurações e impressora.
// =============================================================================

import { CONFIG, hasSupabase } from './config.js';
import { sb } from './data.js';
import { printer } from './printing.js';
import * as SEED from './menu-data.js';
import { el, money, toast, escapeHtml } from './util.js';

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
};
const STATUS_COLOR = { novo: 'var(--magenta)', aceito: 'var(--warn)', producao: '#c98a00', pronto: 'var(--ok)', saiu: 'var(--roxo-600)', entregue: 'var(--ink-mute)' };

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
  const tabs = [['pedidos', 'Pedidos'], ['cardapio', 'Cardápio'], isOwner ? ['config', 'Configurações'] : null, ['impressora', 'Impressora']].filter(Boolean);
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
  ({ pedidos: renderOrders, cardapio: renderCardapio, config: renderConfig, impressora: renderImpressora }[tab])();
}

// ---------------------------------------------------------------- Pedidos
function renderOrders() {
  if (tab !== 'pedidos') return;
  const host = document.getElementById('tabContent'); if (!host) return;
  host.innerHTML = '';
  const filters = [['ativos', 'Em andamento'], ['novo', 'Novos'], ['producao', 'Em produção'], ['pronto', 'Prontos'], ['saiu', 'Saíram'], ['entregue', 'Entregues'], ['todos', 'Todos']];
  host.append(el('div', { class: 'pn-filters' }, filters.map(([id, label]) => {
    const b = el('button', { class: id === filter ? 'active' : '', text: label });
    b.addEventListener('click', () => { filter = id; renderOrders(); });
    return b;
  })));
  let list = orders;
  if (filter === 'ativos') list = orders.filter((o) => !['entregue', 'cancelado'].includes(o.status));
  else if (filter !== 'todos') list = orders.filter((o) => o.status === filter);
  if (!list.length) { host.append(el('div', { class: 'empty' }, [el('div', { class: 'big', text: '🍧' }), el('p', { text: 'Nenhum pedido aqui.' })])); return; }
  host.append(el('div', { class: 'orders' }, list.map(orderCard)));
  // atualiza badge do tab
  const badge = document.querySelector('.pn-tabs button[data-tab=pedidos] .badge'); const n = orders.filter((o) => o.status === 'novo').length;
  if (badge) badge.textContent = n || '';
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
      nextStep(o) ? el('button', { class: 'btn btn-primary', text: nextStep(o).action, onclick: () => advance(o) }) : el('span', { class: 'muted', style: 'flex:1;text-align:center', text: 'Pedido finalizado' }),
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
  return { RECIPIENTES: SEED.RECIPIENTES, BASES: SEED.BASES, ACOMPANHAMENTOS: SEED.ACOMPANHAMENTOS, COMBOS: SEED.COMBOS, DESTAQUES: SEED.DESTAQUES, FRAPE: SEED.FRAPE, MILKSHAKE: SEED.MILKSHAKE, SALADAS: SEED.SALADAS, SOBREMESAS: SEED.SOBREMESAS, BEBIDAS: SEED.BEBIDAS, CATEGORIAS: SEED.CATEGORIAS, FOTOS_SEED: { ...SEED.FOTOS_SEED }, categoriaFotos: { ...SEED.CATEGORIA_FOTOS }, esgotados: [], secao2: { ...SEED.SECAO2, itens: [] }, upsell: { ...SEED.UPSELL, itens: [] }, cupons: [...(SEED.CUPONS || [])], removidos: [] };
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
    if (old.secao2) seed.secao2 = old.secao2;
    if (old.upsell) seed.upsell = old.upsell;
    if (old.cupons) seed.cupons = old.cupons;
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
  const petit = (menu.SOBREMESAS || []).filter((s) => s.sorvete);
  const pbInput = el('input', { type: 'number', step: '0.50', value: Number(petit[0]?.precoBolaExtra ?? 3.5).toFixed(2), style: 'width:100px;text-align:right' });
  pbInput.addEventListener('input', () => { const v = parseFloat(pbInput.value) || 0; petit.forEach((s) => s.precoBolaExtra = v); });
  valCard.append(el('div', { class: 'frow' }, [el('label', { text: 'Petit Gateau / Brownie: cada bola a mais (R$)' }), pbInput]));
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
      const thumb = it.foto ? el('img', { class: 'mi-thumb', src: it.foto }) : el('div', { class: 'mi-thumb', html: '<span>🍧</span>' });
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

  // Recipientes (tamanhos)
  const recCard = el('div', { class: 'panel-card' }, [el('h3', { text: 'Tamanhos (Monte Seu Açaí)' }), el('p', { class: 'hint', text: 'Preço base por recipiente e tamanho.' })]);
  menu.RECIPIENTES.forEach((r) => r.tamanhos.forEach((t) => recCard.append(menuRow({
    id: t.id, nome: `${r.nome} ${t.ml}ml`, price: t.preco, onPrice: (v) => { t.preco = v; }, simple: true,
  }))));
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

  // Simples (saladas, diversos, bebidas): nome, descrição, preço, foto, adicionar/remover
  [['SALADAS', 'Saladas'], ['SOBREMESAS', 'Diversos'], ['BEBIDAS', 'Bebidas']].forEach(([k, label]) => {
    const card = el('div', { class: 'panel-card' }, [el('h3', { text: label }), el('p', { class: 'hint', text: 'Edite nome, descrição e preço. "+ Adicionar" cria um item.' })]);
    menu[k].forEach((p) => card.append(menuRow({ id: p.id, nome: p.nome, sub: p.desc, price: p.preco, foto: menu.FOTOS_SEED?.[p.id], esgotado: esgot.has(p.id), onName: (v) => { p.nome = v; }, onDesc: (v) => { p.desc = v; }, onPrice: (v) => { p.preco = v; }, onFoto: (url) => { (menu.FOTOS_SEED = menu.FOTOS_SEED || {})[p.id] = url; }, onEsg: () => toggleEsg(menu, p.id), noStar: true, onRemove: () => { if (confirm(`Remover "${p.nome}"?`)) { (menu.removidos = menu.removidos || []).push(p.id); menu[k] = menu[k].filter((x) => x.id !== p.id); renderCardapio(); } } })));
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
    !simple ? (foto ? el('img', { class: 'mi-thumb', src: foto }) : el('div', { class: 'mi-thumb', html: '<span>🍧</span>' })) : null,
    el('div', { class: 'mi-name' }, [nameEl, descEl]),
    !noStar && !simple ? starEl(isDestaque, onStar) : null,
    priceInput,
    onFoto ? fotoBtn(onFoto) : null,
    onEsg ? esgSwitch(esgotado, onEsg) : null,
    onRemove ? el('button', { class: 'btn btn-ghost mini', title: 'Remover', text: '✕', onclick: () => onRemove() }) : null,
  ]);
  return row;
}
function starEl(on, cb) { const s = el('span', { class: 'star' + (on ? ' on' : ''), text: '★' }); s.addEventListener('click', () => { const nowOn = cb(); s.classList.toggle('on', nowOn); }); return s; }
function esgSwitch(on, cb) { const inp = el('input', { type: 'checkbox' }); inp.checked = !on; const lbl = el('label', { class: 'switch', title: 'Disponível' }, [inp, el('span')]); inp.addEventListener('change', () => cb()); return lbl; }
// Comprime/redimensiona no navegador antes de subir (sem perda visível, deixa o site leve)
async function compressImage(file, maxDim = 1080, quality = 0.85) {
  if (!file.type || !file.type.startsWith('image/')) return { blob: file, jpg: false };
  try {
    const bmp = await createImageBitmap(file);
    let { width, height } = bmp;
    if (Math.max(width, height) > maxDim) { const s = maxDim / Math.max(width, height); width = Math.round(width * s); height = Math.round(height * s); }
    const c = document.createElement('canvas'); c.width = width; c.height = height;
    c.getContext('2d').drawImage(bmp, 0, 0, width, height);
    const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', quality));
    return blob && blob.size < file.size ? { blob, jpg: true } : { blob: file, jpg: false };
  } catch { return { blob: file, jpg: false }; }
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
      const { error } = await client.storage.from('fotos').upload(path, blob, { upsert: true, contentType: jpg ? 'image/jpeg' : f.type });
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
    const { error } = await client.from('store_config').upsert({ store_slug: STORE_SLUG, settings: s, updated_at: new Date().toISOString() });
    if (error) { toast('Erro ao salvar'); e.target.disabled = false; return; }
    cfg.settings = s; toast('Configurações salvas. Já valem pro cliente.'); e.target.disabled = false;
  } });

  host.append(ops, pays, hours, save);
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
