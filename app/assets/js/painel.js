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

// ---------------------------------------------------------------- boot
(async function boot() {
  if (!hasSupabase()) return renderNoBackend();
  client = await sb();
  const { data } = await client.auth.getSession();
  session = data.session;
  if (!session) return renderLogin();
  await loadAll();
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
  printer.reconnect().catch(() => {});
  renderApp();
  subscribeOrders();
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
    session = data.session; await loadAll();
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
      el('div', { class: 'ototal' }, [el('span', { text: 'Total' }), el('span', { text: money(o.total) })]),
    ]),
    el('div', { class: 'oactions' }, [
      el('button', { class: 'btn btn-ghost mini', style: 'flex:0 0 auto', html: '🖨', title: 'Reimprimir', onclick: () => doPrint(o) }),
      s.next ? el('button', { class: 'btn btn-primary', text: s.action, onclick: () => advance(o) }) : el('span', { class: 'muted', style: 'flex:1;text-align:center', text: 'Pedido finalizado' }),
    ]),
  ]);
  return card;
}

async function advance(o) {
  const s = STATUS[o.status]; if (!s?.next) return;
  if (o.status === 'novo') { await doPrint(o); } // aceite imprime
  const patch = { status: s.next };
  if (s.next === 'aceito') patch.accepted_at = new Date().toISOString();
  const { error } = await client.from('orders').update(patch).eq('id', o.id);
  if (error) return toast('Erro ao atualizar');
  o.status = s.next; renderOrders();
}

async function doPrint(o) {
  try {
    if (!printer.supported()) return toast('Use o Chrome no computador pra imprimir');
    await printer.printOrder(o, store);
    await client.from('orders').update({ printed: true }).eq('id', o.id);
    o.printed = true; renderOrders();
    toast('Enviado pra impressora');
  } catch (e) {
    console.error(e);
    if (String(e.message).includes('não conectada') || String(e.message).includes('conectada')) {
      toast('Conecte a impressora na aba Impressora');
    } else toast('Falha ao imprimir: ' + e.message);
  }
}

let audioCtx;
function alertNew() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
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
  return { RECIPIENTES: SEED.RECIPIENTES, BASES: SEED.BASES, ACOMPANHAMENTOS: SEED.ACOMPANHAMENTOS, COMBOS: SEED.COMBOS, DESTAQUES: SEED.DESTAQUES, FRAPE: SEED.FRAPE, MILKSHAKE: SEED.MILKSHAKE, SALADAS: SEED.SALADAS, SOBREMESAS: SEED.SOBREMESAS, BEBIDAS: SEED.BEBIDAS, CATEGORIAS: SEED.CATEGORIAS, FOTOS_SEED: { ...SEED.FOTOS_SEED }, categoriaFotos: { ...SEED.CATEGORIA_FOTOS }, esgotados: [] };
}
// Aplica a estrutura nova do código preservando o que a loja já editou (fotos, esgotados, destaques)
function mergedSeed() {
  const seed = seedMenu();
  const old = cfg.menu;
  if (old) {
    seed.FOTOS_SEED = { ...seed.FOTOS_SEED, ...(old.FOTOS_SEED || {}) };
    seed.categoriaFotos = { ...seed.categoriaFotos, ...(old.categoriaFotos || {}) };
    seed.esgotados = old.esgotados || [];
    if (old.DESTAQUES) seed.DESTAQUES = old.DESTAQUES;
  }
  return seed;
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
    el('p', { class: 'hint', text: 'Aplica melhorias de estrutura do sistema (categorias, ajustes). Suas fotos, esgotados e destaques são mantidos.' }),
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

  // Destaques + esgotado + preço dos combos
  const combosCard = el('div', { class: 'panel-card' }, [el('h3', { text: 'Combinados' }), el('p', { class: 'hint', text: 'Estrela = destaque. Chave = esgotado some do cardápio. Valor = preço dos acompanhamentos (o tamanho soma por cima). Foto aparece na hora.' })]);
  menu.COMBOS.forEach((c) => combosCard.append(menuRow({
    id: c.id, nome: c.nome, sub: c.desc, price: c.valorBase, foto: menu.FOTOS_SEED?.[c.id],
    isDestaque: (menu.DESTAQUES || []).includes(c.id), esgotado: esgot.has(c.id),
    onPrice: (v) => { c.valorBase = v; }, onStar: () => toggleDestaque(menu, c.id),
    onEsg: () => toggleEsg(menu, c.id), onFoto: (url) => { (menu.FOTOS_SEED = menu.FOTOS_SEED || {})[c.id] = url; },
  })));
  combosCard.append(saveBtn(menu));
  host.append(combosCard);

  // Recipientes (tamanhos)
  const recCard = el('div', { class: 'panel-card' }, [el('h3', { text: 'Tamanhos (Monte Seu Açaí)' }), el('p', { class: 'hint', text: 'Preço base por recipiente e tamanho.' })]);
  menu.RECIPIENTES.forEach((r) => r.tamanhos.forEach((t) => recCard.append(menuRow({
    id: t.id, nome: `${r.nome} ${t.ml}ml`, price: t.preco, onPrice: (v) => { t.preco = v; }, simple: true,
  }))));
  recCard.append(saveBtn(menu));
  host.append(recCard);

  // Acompanhamentos (preços)
  const acCard = el('div', { class: 'panel-card' }, [el('h3', { text: 'Acompanhamentos' }), el('p', { class: 'hint', text: 'Preço de cada acompanhamento e esgotar item.' })]);
  menu.ACOMPANHAMENTOS.forEach((g) => { acCard.append(el('div', { style: 'font-weight:800;margin-top:10px', text: g.nome })); g.itens.forEach((it) => acCard.append(menuRow({ id: it.id, nome: it.nome, price: it.preco, esgotado: esgot.has(it.id), onPrice: (v) => { it.preco = v; }, onEsg: () => toggleEsg(menu, it.id), noStar: true }))); });
  acCard.append(saveBtn(menu));
  host.append(acCard);

  // Simples (saladas, sobremesas, bebidas)
  [['SALADAS', 'Saladas'], ['SOBREMESAS', 'Diversos'], ['BEBIDAS', 'Bebidas']].forEach(([k, label]) => {
    const card = el('div', { class: 'panel-card' }, [el('h3', { text: label })]);
    menu[k].forEach((p) => card.append(menuRow({ id: p.id, nome: p.nome, sub: p.desc, price: p.preco, esgotado: esgot.has(p.id), onPrice: (v) => { p.preco = v; }, onEsg: () => toggleEsg(menu, p.id), noStar: true })));
    card.append(saveBtn(menu));
    host.append(card);
  });
}

function menuRow({ id, nome, sub, price, foto, isDestaque, esgotado, onPrice, onStar, onEsg, onFoto, simple, noStar }) {
  const priceInput = price == null ? null : el('input', { class: 'price', type: 'number', step: '0.50', value: Number(price).toFixed(2) });
  if (priceInput) priceInput.addEventListener('input', () => onPrice(parseFloat(priceInput.value) || 0));
  const row = el('div', { class: 'menu-item' }, [
    !simple ? (foto ? el('img', { class: 'mi-thumb', src: foto }) : el('div', { class: 'mi-thumb', html: '<span>🍧</span>' })) : null,
    el('div', { class: 'mi-name' }, [nome, sub ? el('small', { text: sub }) : null]),
    !noStar && !simple ? starEl(isDestaque, onStar) : null,
    priceInput,
    onFoto ? fotoBtn(onFoto) : null,
    onEsg ? esgSwitch(esgotado, onEsg) : null,
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
  const supported = printer.supported();
  const statusEl = el('div', { class: 'pill', style: 'margin:6px 0' });
  const refresh = () => { const c = printer.connected(); statusEl.className = 'pill ' + (c ? 'pill-ok' : 'pill-closed'); statusEl.innerHTML = `<span class="dot"></span> ${c ? 'Impressora conectada' : 'Impressora não conectada'}`; };
  refresh();
  const card = el('div', { class: 'panel-card' }, [
    el('h3', { text: 'Impressora térmica' }),
    el('p', { class: 'hint', html: supported ? 'Conecte a impressora USB e clique em conectar. O navegador vai mostrar a lista de dispositivos pra você escolher. A impressão sai sozinha quando você aceita um pedido.' : 'Este navegador não suporta impressão direta. Use o <b>Google Chrome</b> ou <b>Edge</b> no computador da loja.' }),
    statusEl,
    el('div', { style: 'display:flex;gap:10px;flex-wrap:wrap;margin-top:10px' }, [
      el('button', { class: 'btn btn-primary', text: '🔌 Conectar impressora', disabled: !supported, onclick: async (e) => { try { await printer.connect(); refresh(); toast('Impressora conectada!'); } catch (err) { toast(err.message); } } }),
      el('button', { class: 'btn btn-ghost', text: '🧾 Imprimir teste', disabled: !supported, onclick: async () => { try { await printer.test(store); toast('Teste enviado'); } catch (err) { toast(err.message || 'Conecte a impressora'); } } }),
    ]),
    el('p', { class: 'hint', style: 'margin-top:14px', html: 'Modelo da impressora ainda não definido. Quando a loja tiver a impressora, é só conectar aqui. Detalhes e alternativa (QZ Tray) em <code>docs/GUIA-IMPRESSORA.md</code>.' }),
  ]);
  host.append(card);
}
