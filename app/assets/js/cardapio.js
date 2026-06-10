// =============================================================================
// CARDÁPIO PÚBLICO — controlador principal
// =============================================================================

import { el, money, toast } from './util.js';
import * as cart from './cart.js';
import { getStore, getSettings, isOpenNow, nextOpenLabel, buildCatalog, hydrate, openOrdersCount, secao2, upsellItems } from './data.js';
import { openProduct } from './product-modal.js';
import { openCheckout } from './checkout.js';
import { track } from './tracking.js';

const ICON = {
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>',
  bag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 7h12l-1 13H7L6 7Z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg>',
};

const store = getStore();
let settings = getSettings();
let catalog = buildCatalog();
let query = '';

const root = el('div');
document.body.append(root);

function statusPill() {
  const aberto = isOpenNow(settings);
  return el('span', { class: 'pill ' + (aberto ? 'pill-ok' : 'pill-closed') }, [el('span', { class: 'dot' }), aberto ? 'Aberto agora' : 'Fechado']);
}

function header() {
  const cartBtn = el('button', { class: 'icon-btn', id: 'cartBtn', 'aria-label': 'Sacola', html: ICON.bag });
  cartBtn.append(el('span', { class: 'count', id: 'cartCount', text: '0', style: 'display:none' }));
  cartBtn.addEventListener('click', openCart);
  return el('header', { class: 'app-header' }, el('div', { class: 'container bar' }, [
    el('img', { class: 'logo-img', src: 'assets/img/logo.png', alt: 'Açaí Mais Sabor' }),
    el('div', { class: 'spacer' }),
    cartBtn,
  ]));
}

function hero() {
  const aberto = isOpenNow(settings);
  return el('div', { class: 'hero' }, el('div', { class: 'container inner' }, [
    el('img', { class: 'hero-logo', src: 'assets/img/logo.png', alt: 'Açaí Mais Sabor' }),
    el('h1', { class: 'hero-h1', text: 'O Açaí oficial de Votuporanga' }),
    el('p', { class: 'hero-sub', text: 'Feito com propósito, entregue com carinho e tem o Sabor que fala por si!' }),
    el('div', { class: 'hero-status' }, el('span', { class: 'pill ' + (aberto ? 'pill-ok' : 'pill-closed') }, [el('span', { class: 'dot' }), aberto ? 'Aberto agora' : `Fechado, abre ${nextOpenLabel(settings) || 'em breve'}`])),
  ]));
}

function closedBanner() {
  if (isOpenNow(settings)) return null;
  return el('div', { class: 'closed-banner', html: `Estamos fechados. Você pode montar o pedido, abrimos <b>${nextOpenLabel(settings) || 'em breve'}</b>.` });
}

let searchTimer;
function searchBar() {
  const input = el('input', { placeholder: 'Buscar no cardápio...', 'aria-label': 'Buscar' });
  input.addEventListener('input', () => {
    query = input.value.trim().toLowerCase();
    renderSections();
    clearTimeout(searchTimer);
    if (query.length >= 3) searchTimer = setTimeout(() => track.search(query), 1200);
  });
  return el('div', { class: 'search-wrap' }, el('div', { class: 'container' }, el('div', { class: 'search' }, [el('span', { html: ICON.search }), input])));
}

function catNav() {
  const track = el('div', { class: 'track' });
  catalog.forEach((c, i) => {
    const b = el('button', { class: i === 0 ? 'active' : '', 'data-cat': c.id, text: c.nome });
    b.addEventListener('click', () => { document.getElementById('sec-' + c.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    track.append(b);
  });
  return el('nav', { class: 'cat-nav', id: 'catNav' }, track);
}

function thumb(item, big) {
  if (item.foto) return el('img', { class: big ? 'ph' : 'thumb', src: item.foto, alt: item.nome, loading: 'lazy', onerror: function () { const ph = el('div', { class: (big ? 'ph' : 'thumb') + ' ph' }, el('span', { text: item.emoji })); this.replaceWith(ph); } });
  return el('div', { class: (big ? 'ph' : 'thumb') + ' ph' }, el('span', { text: item.emoji }));
}

function card(item) {
  const c = el('div', { class: 'card' + (item.esgotado ? ' out' : '') }, [
    thumb(item, false),
    el('div', { class: 'body' }, [
      el('h3', { text: item.nome }),
      item.desc ? el('p', { text: item.desc }) : null,
      el('div', { class: 'price' }, [
        el('div', {}, [
          item.tipo === 'simples' ? null : el('div', { class: 'from', text: 'a partir de' }),
          el('span', { class: 'val', text: money(item.precoFrom) }),
        ]),
        el('button', { class: 'add', html: item.esgotado ? '&times;' : '+', 'aria-label': 'Adicionar' }),
      ]),
    ]),
    item.esgotado ? el('span', { class: 'out-tag', text: 'Esgotado' }) : null,
  ]);
  if (!item.esgotado) c.addEventListener('click', () => open(item));
  return c;
}

function monteCard(item) {
  const c = el('div', { class: 'card', style: 'background:var(--grad-acai);color:#fff;border:none' }, [
    item.foto
      ? el('img', { class: 'thumb', src: item.foto, alt: item.nome, loading: 'lazy', onerror: function () { this.replaceWith(el('div', { class: 'thumb ph', style: 'background:rgba(255,255,255,.15)' }, el('span', { text: '🍨' }))); } })
      : el('div', { class: 'thumb ph', style: 'background:rgba(255,255,255,.15)' }, el('span', { text: '🍨' })),
    el('div', { class: 'body' }, [
      el('h3', { style: 'color:#fff', text: item.nome }),
      el('p', { style: 'color:rgba(255,255,255,.85)', text: item.desc }),
      el('div', { class: 'price' }, [
        el('div', {}, [el('div', { class: 'from', style: 'color:rgba(255,255,255,.8)', text: 'a partir de' }), el('span', { class: 'val', style: 'color:#fff', text: money(item.precoFrom) })]),
        el('span', { class: 'btn btn-amarelo', style: 'padding:9px 16px', text: 'Montar' }),
      ]),
    ]),
  ]);
  c.addEventListener('click', () => open(item));
  return c;
}

function featured(items) {
  const track = el('div', { class: 'featured' });
  items.forEach((item) => {
    const f = el('div', { class: 'fcard' }, [
      thumb(item, true),
      el('div', { class: 'fbody' }, [
        el('h3', { text: item.nome }),
        item.precoDe
          ? el('div', { class: 'from', html: `de <s>${money(item.precoDe)}</s> por` })
          : el('div', { class: 'from', text: item.tipo === 'simples' ? '' : 'a partir de' }),
        el('div', { class: 'val', text: money(item.precoFrom) }),
      ]),
    ]);
    f.addEventListener('click', () => open(item));
    track.append(f);
  });
  return track;
}

const EMOJI_CAT = { combinados: '🍧', monte: '🍨', frapes: '🥤', saladas: '🥣', milkshakes: '🥤', sobremesas: '🍫', bebidas: '🧃' };
function categoriasTiles() {
  const cats = catalog.filter((c) => c.id !== 'destaques' && c.items.length);
  const row = el('div', { class: 'cats-row' }, cats.map((c) => {
    const img = c.foto
      ? el('img', { class: 'ct-img', src: c.foto, alt: c.nome, loading: 'lazy', onerror: function () { this.replaceWith(el('div', { class: 'ct-img ph' }, el('span', { text: EMOJI_CAT[c.id] || '🍧' }))); } })
      : el('div', { class: 'ct-img ph' }, el('span', { text: EMOJI_CAT[c.id] || '🍧' }));
    const tile = el('button', { class: 'cat-tile' }, [img, el('span', { class: 'ct-name', text: c.nome })]);
    tile.addEventListener('click', () => document.getElementById('sec-' + c.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    return tile;
  }));
  const arrow = el('button', { class: 'cats-arrow', 'aria-label': 'Mais categorias', html: '&#8250;' });
  arrow.addEventListener('click', () => row.scrollBy({ left: 250, behavior: 'smooth' }));
  const wrap = el('div', { class: 'cats-wrap' }, [row, arrow]);
  requestAnimationFrame(() => { if (row.scrollWidth <= row.clientWidth + 8) arrow.style.display = 'none'; });
  return el('section', { class: 'section' }, el('div', { class: 'container' }, [el('h2', { text: 'Categorias' }), wrap]));
}

// Seção 2 personalizável (ex: Promoção), abaixo do TOP 5
function secao2Section() {
  const s = secao2();
  if (!s) return null;
  const sec = el('section', { class: 'section' });
  sec.append(el('div', { class: 'container' }, el('h2', { text: s.titulo })), featured(s.items));
  return sec;
}

let sectionsHost;
function renderSections() {
  if (!sectionsHost) return;
  sectionsHost.innerHTML = '';
  if (query) {
    const matches = catalog.flatMap((c) => c.items).filter((i) => (i.nome + ' ' + (i.desc || '')).toLowerCase().includes(query));
    const sec = el('section', { class: 'section' }, el('div', { class: 'container' }, [
      el('h2', { text: `Resultados (${matches.length})` }),
      matches.length ? el('div', { class: 'grid' }, matches.map(card)) : el('p', { class: 'muted center', style: 'padding:30px', text: 'Nada encontrado. Tente outro nome.' }),
    ]));
    sectionsHost.append(sec);
    return;
  }
  catalog.forEach((c) => {
    if (!c.items.length) return;
    const inner = el('div', { class: 'container' });
    inner.append(el('h2', { text: c.nome }));
    if (c.tipo === 'destaques') {
      // carrossel fica fora do container pra sangrar nas bordas
    } else if (c.tipo === 'monte') {
      inner.append(el('div', { class: 'grid', style: 'grid-template-columns:1fr' }, c.items.map(monteCard)));
    } else {
      inner.append(el('div', { class: 'grid' }, c.items.map(card)));
    }
    const sec = el('section', { class: 'section', id: 'sec-' + c.id });
    if (c.tipo === 'destaques') { sec.append(el('div', { class: 'container' }, el('h2', { text: c.nome })), featured(c.items)); }
    else sec.append(inner);
    sectionsHost.append(sec);
    if (c.tipo === 'destaques') {
      const s2 = secao2Section();
      if (s2) sectionsHost.append(s2);
      sectionsHost.append(categoriasTiles());
    }
  });
  observeSections();
}

function open(item) {
  track.viewItem(item);
  openProduct(item, (line) => { cart.add(line); track.addToCart(line); toast(`${line.qtd}x adicionado à sacola`); });
}

// ---- Sacola (revisão antes do checkout) ----
function openCart() {
  const items = cart.getItems();
  const overlay = el('div', { class: 'overlay' });
  const sheet = el('div', { class: 'sheet' });
  const body = el('div', { class: 'sheet-body' });
  const foot = el('div', { class: 'sheet-foot' });
  const head = el('div', { class: 'sheet-foot', style: 'border-top:none;border-bottom:1px solid var(--line)' }, [
    el('b', { text: 'Sua sacola', style: 'font-size:1.1rem;flex:1' }),
    el('button', { class: 'icon-btn', style: 'background:var(--surface-2);color:var(--ink)', html: '&times;', onclick: () => destroy() }),
  ]);
  sheet.append(head, body, foot); overlay.append(sheet); document.body.append(overlay);
  document.body.style.overflow = 'hidden'; requestAnimationFrame(() => overlay.classList.add('show'));
  const destroy = () => { overlay.classList.remove('show'); document.body.style.overflow = ''; setTimeout(() => overlay.remove(), 280); };
  overlay.addEventListener('click', (e) => { if (e.target === overlay) destroy(); });

  function paint() {
    const list = cart.getItems();
    body.innerHTML = ''; foot.innerHTML = '';
    if (!list.length) { body.append(el('div', { class: 'center muted', style: 'padding:50px 10px' }, [el('div', { style: 'font-size:2.4rem', text: '🛒' }), el('p', { style: 'margin-top:10px', text: 'Sua sacola está vazia' })])); return; }
    list.forEach((i) => {
      const nEl = el('span', { class: 'n', text: i.qtd });
      const minus = el('button', { type: 'button', html: '&minus;' });
      const plus = el('button', { type: 'button', html: '+' });
      minus.addEventListener('click', () => { cart.setQty(i.uid, i.qtd - 1); paint(); });
      plus.addEventListener('click', () => { cart.setQty(i.uid, i.qtd + 1); paint(); });
      body.append(el('div', { class: 'opt', style: 'align-items:flex-start' }, [
        el('div', { style: 'flex:1' }, [
          el('div', { html: `<b>${i.print?.titulo || i.nome}</b>` }),
          i.print?.detalhes?.length ? el('small', { class: 'muted', text: i.print.detalhes.join(', ') }) : null,
          el('div', { class: 'oprice', style: 'margin-top:4px', text: money(i.precoUnit * i.qtd) }),
        ]),
        el('div', { class: 'stepper' }, [minus, nEl, plus]),
      ]));
    });
    // Upsell (oferta antes de enviar) — configurável no painel
    const up = upsellItems();
    if (up && up.itens.length) {
      const upBox = el('div', { class: 'opt-group', style: 'margin-top:14px' });
      upBox.append(el('div', { class: 'opt-head' }, el('div', { class: 't', text: up.titulo })));
      up.itens.forEach((u) => {
        const add = el('button', { class: 'btn btn-amarelo mini', style: 'flex:0 0 auto', text: '+ ' + money(u.preco) });
        add.addEventListener('click', () => {
          const line = cart.add({ tipo: 'upsell', refId: u.refId || u.id, catId: 'upsell', nome: u.nome, precoUnit: Number(u.preco) || 0, qtd: 1, print: { titulo: u.nome, detalhes: [] } });
          track.addToCart(line);
          paint();
        });
        upBox.append(el('div', { class: 'opt' }, [
          u.foto ? el('img', { src: u.foto, alt: u.nome, style: 'width:46px;height:46px;border-radius:10px;object-fit:cover;flex:none' }) : null,
          el('span', { class: 'oname', text: u.nome }), add,
        ]));
      });
      body.append(upBox);
    }
    foot.append(
      el('div', { style: 'flex:1' }, [el('small', { class: 'muted', text: 'Subtotal' }), el('div', { style: 'font-weight:900;font-size:1.1rem', text: money(cart.subtotal()) })]),
      el('button', { class: 'btn btn-primary', style: 'flex:1.4', text: 'Ir para o pagamento', onclick: async (e) => {
        const min = settings.pedidoMinimo || 0;
        if (min > 0 && cart.subtotal() < min) { toast(`Pedido mínimo de ${money(min)}. Faltam ${money(min - cart.subtotal())}.`); return; }
        e.target.disabled = true;
        const oo = await openOrdersCount();
        destroy(); openCheckout({ openOrders: oo });
      } }),
    );
  }
  paint();
}

// ---- Cart bar flutuante ----
function cartBar() {
  const bar = el('div', { class: 'cart-bar', id: 'cartBar' }, el('div', { class: 'inner' }, [
    el('span', { class: 'qty', id: 'cbQty', text: '0 itens' }),
    el('span', { class: 'lbl', text: 'Ver sacola' }),
    el('span', { class: 'tot', id: 'cbTot', text: money(0) }),
  ]));
  bar.addEventListener('click', openCart);
  return bar;
}

function updateCart() {
  const n = cart.count();
  const countEl = document.getElementById('cartCount');
  if (countEl) { countEl.textContent = n; countEl.style.display = n ? 'grid' : 'none'; }
  const bar = document.getElementById('cartBar');
  if (bar) {
    bar.classList.toggle('show', n > 0);
    document.getElementById('cbQty').textContent = `${n} ${n === 1 ? 'item' : 'itens'}`;
    document.getElementById('cbTot').textContent = money(cart.subtotal());
  }
}

// ---- Scrollspy ----
let observer;
function observeSections() {
  observer?.disconnect();
  const navBtns = [...document.querySelectorAll('#catNav button')];
  observer = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        const id = e.target.id.replace('sec-', '');
        navBtns.forEach((b) => b.classList.toggle('active', b.dataset.cat === id));
        document.querySelector(`#catNav button.active`)?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
      }
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  document.querySelectorAll('section.section').forEach((s) => observer.observe(s));
}

// ---- Boot ----
function boot() {
  root.innerHTML = '';
  root.append(header(), hero());
  const cb = closedBanner(); if (cb) root.append(cb);
  root.append(searchBar(), catNav());
  const main = el('main', { id: 'sections', style: 'padding-bottom:90px' });
  sectionsHost = main; root.append(main, cartBar());
  renderSections();
  updateCart();
  document.getElementById('loading')?.remove();
}

cart.onChange(updateCart);

// Abre INSTANTÂNEO: mostra o cardápio do cache local (ou seed) na hora,
// e atualiza por trás com o Supabase (sem segurar a tela nem manter conexão ao vivo).
settings = getSettings(); catalog = buildCatalog(); boot();
// assinatura inclui catálogo + promo + upsell + settings: re-renderiza se QUALQUER um mudou
const fullSig = () => JSON.stringify({ c: catalog, s2: secao2(), up: upsellItems(), st: settings });
let lastSig = fullSig();
hydrate().then(() => {
  settings = getSettings();
  catalog = buildCatalog();
  const sig = fullSig();
  if (sig !== lastSig) { const y = window.scrollY; boot(); window.scrollTo(0, y); lastSig = sig; }
}).catch(() => {});
