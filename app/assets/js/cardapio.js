// =============================================================================
// CARDÁPIO PÚBLICO — controlador principal
// =============================================================================

import { el, money, toast, maskPhone, phoneValido, imgUrl } from './util.js';
import * as cart from './cart.js';
import { getStore, getSettings, isOpenNow, nextOpenLabel, buildCatalog, hydrate, secao2, novidades, upsellItems, menorMl, orderStatus, customerLogin, customerOrders, precosVersao } from './data.js';
import { openProduct } from './product-modal.js';
import { openCheckout } from './checkout.js';
import { track } from './tracking.js';
import { captureAttribution, trackVisit } from './attribution.js';

// Captura a origem da visita (UTM / link bonito / referrer) o quanto antes,
// antes de qualquer navegação. Fica salva no aparelho até a pessoa comprar.
captureAttribution();
trackVisit('pageview');
// PageView server-side fica DESLIGADO por ora (evita PageView em dobro no Meta): o
// Pixel dispara o do navegador com {{Api Event ID}}. Pra religar, ver CAPI_EVENTS em tracking.js.
// Marca "adicionou ao carrinho" 1x por sessão (alimenta o funil por origem).
let _addCartTracked = false;
const markAddCart = () => { if (!_addCartTracked) { _addCartTracked = true; trackVisit('add_cart'); } };
if (cart.getItems().length) markAddCart();
cart.onChange((items) => { if (items.length) markAddCart(); });

// Logo leve: a original (logo.png) tem 294KB e 1000px, exibida com ~190px; atrasava ~2s as
// fotos no 4G (medido em 10/10/2026). Celular que nao abre WebP cai na original.
const LOGO_LEVE = 'assets/img/logo-hero.webp';
function logoReserva() { if (this.dataset.reserva) return; this.dataset.reserva = '1'; this.src = 'assets/img/logo.png'; }   // troca uma vez so, sem repeticao
const ICON = {
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>',
  bag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 7h12l-1 13H7L6 7Z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/></svg>',
};

const store = getStore();
let settings = getSettings();
let catalog = buildCatalog();
let query = '';

const root = el('div', { style: 'position:relative' }); // a barra de conta/sacola fica por cima do banner
document.body.append(root);

function statusPill() {
  const aberto = isOpenNow(settings);
  return el('span', { class: 'pill ' + (aberto ? 'pill-ok' : 'pill-closed') }, [el('span', { class: 'dot' }), aberto ? 'Aberto agora' : 'Fechado']);
}

function header() {
  const cartBtn = el('button', { class: 'icon-btn', id: 'cartBtn', 'aria-label': 'Sacola', html: ICON.bag });
  cartBtn.append(el('span', { class: 'count', id: 'cartCount', text: '0', style: 'display:none' }));
  cartBtn.addEventListener('click', openCart);
  const logo = el('img', { class: 'logo-img', src: LOGO_LEVE, onerror: logoReserva, alt: 'Açaí Mais Sabor', style: 'cursor:pointer', title: 'Voltar ao início' });
  logo.addEventListener('click', () => {
    const input = document.querySelector('.search input');
    if (input && input.value) { input.value = ''; query = ''; renderSections(); }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  const entrar = el('button', { class: 'icon-btn', id: 'entrarBtn', 'aria-label': 'Entrar / Meus pedidos', title: 'Entrar / Meus pedidos', html: ICON.user });
  entrar.addEventListener('click', () => {
    const c = clienteSalvo();
    if (c.telefone && c.nome) openMeusPedidos({ nome: c.nome, telefone: c.telefone });
    else openLogin();
  });
  return el('header', { class: 'app-header' }, el('div', { class: 'container bar' }, [
    logo,
    el('div', { class: 'spacer' }),
    entrar,
    cartBtn,
  ]));
}

function hero() {
  const aberto = isOpenNow(settings);
  return el('div', { class: 'hero' }, el('div', { class: 'container inner' }, [
    el('img', { class: 'hero-logo', src: LOGO_LEVE, onerror: logoReserva, alt: 'Açaí Mais Sabor', fetchpriority: 'high', width: 400, height: 250 }),
    el('h1', { class: 'hero-h1', html: 'O Açaí oficial<br>de <em>Votuporanga</em>' }),
    el('div', { class: 'hero-status' }, el('span', { class: 'pill ' + (aberto ? 'pill-ok' : 'pill-closed') }, [el('span', { class: 'dot' }), aberto ? 'Aberto agora' : (nextOpenLabel(settings) ? `Fechado, abre ${nextOpenLabel(settings)}` : 'Fechado no momento')])),
  ]));
}

// Rodapé: endereço, horário (lido do PAINEL, nunca escrito à mão: o da loja impressa
// ficou desatualizado assim), WhatsApp e Instagram.
const fmtHora = (h) => { const [hh, mm] = String(h || '').split(':'); return hh ? (mm && mm !== '00' ? `${+hh}h${mm}` : `${+hh}h`) : ''; };
function horarioTexto() {
  const hs = settings.horarios || {};
  const dias = [0, 1, 2, 3, 4, 5, 6].map((d) => hs[d]).filter((h) => h && h.abre && h.fecha);
  if (!dias.length) return '';
  const igual = dias.length === 7 && dias.every((h) => h.abre === dias[0].abre && h.fecha === dias[0].fecha);
  if (igual) return `Todos os dias, das ${fmtHora(dias[0].abre)} às ${fmtHora(dias[0].fecha)}`;
  const hoje = hs[new Date().getDay()];
  return hoje && hoje.abre ? `Hoje, das ${fmtHora(hoje.abre)} às ${fmtHora(hoje.fecha)}` : '';
}
function rodape() {
  const tel = String(store.whatsapp || '').replace(/\D/g, '').replace(/^55/, '');
  const telFmt = tel.length === 11 ? `(${tel.slice(0, 2)}) ${tel.slice(2, 7)}-${tel.slice(7)}` : tel;
  const hr = horarioTexto();
  return el('footer', { class: 'rodape' }, el('div', { class: 'container' }, [
    el('img', { src: LOGO_LEVE, onerror: logoReserva, alt: 'Açaí Mais Sabor', loading: 'lazy' }),
    el('p', { html: `Rua Pernambuco, 3507 · Patrimônio Velho · Votuporanga/SP${hr ? '<br>' + hr : ''}<br>` +
      (telFmt ? `<a href="https://wa.me/55${tel}" target="_blank" rel="noopener">${telFmt}</a> · ` : '') +
      '<a href="https://www.instagram.com/acai_mais_saborvotuporanga/" target="_blank" rel="noopener">@acai_mais_saborvotuporanga</a>' }),
    el('p', { class: 'fn', text: 'Imagens ilustrativas. Preços sujeitos a alteração.' }),
  ]));
}

function closedBanner() {
  if (isOpenNow(settings)) return null;
  const label = nextOpenLabel(settings);
  const html = label
    ? `Estamos fechados. Você pode montar o pedido, abrimos <b>${label}</b>.`
    : 'Estamos fechados no momento. Você pode montar o pedido e enviar quando reabrirmos.';
  return el('div', { class: 'closed-banner', html });
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

// Foto de card servida pelo PROPRIO site (/fotos-card/v1/{tam}/...), ja no tamanho certo:
// sem o Supabase gerar a foto na hora (0,5 a 0,7s por foto quando o cache dele esfria, medido
// em 10/10/2026). {tam}: 640 nos destaques, 320 na lista. Outra URL (Storage): como sempre.
// Em WebP q80 (39% mais leve que JPEG e mais fiel). Celular antigo que nao abre WebP (iOS 13
// pra tras) cai no onerror do thumb() e recebe a foto do Supabase.
function srcCard(u, box, q) { return u && u.includes('{tam}') ? u.replace('{tam}', box > 400 ? '640' : '320') : imgUrl(u, box, q); }

// prio: as 2 primeiras fotos do TOP 5 (as que aparecem na tela sem rolar) pedem na frente das outras
function thumb(item, big, prio) {
  const foto = item.fotoCard || item.foto;   // card: padronizada; o modal usa item.foto (original)
  if (foto) return el('img', {
    class: big ? 'ph' : 'thumb', src: srcCard(foto, big ? 640 : 400, big ? 74 : 72),
    alt: item.nome, loading: prio ? 'eager' : 'lazy', fetchpriority: prio ? 'high' : null, decoding: 'async',
    onerror: function () {
      if (this.dataset.orig) this.replaceWith(el('div', { class: (big ? 'ph' : 'thumb') + ' ph' }, el('span', { text: item.emoji })));
      else { this.dataset.orig = '1'; this.src = foto.includes('{tam}') && item.foto ? imgUrl(item.foto, 640, 74) : foto; }  // falhou -> tenta a foto do Supabase
    },
  });
  return el('div', { class: (big ? 'ph' : 'thumb') + ' ph' }, el('span', { text: item.emoji }));
}

// Etiquetas dos combinados (as mesmas cores da loja). Ordem = ordem dos filtros.
const TAGS = { maispedido: ['Mais pedido', 't-mp'], novidade: ['Novidade', 't-nv'], chocolate: ['Ama chocolate', 't-ch'],
  morango: ['Ama morango', 't-mo'], banana: ['Ama banana', 't-ba'], crianca: ['Criança', 't-cr'], fitness: ['Fitness', 't-ft'], indicado: ['Indicado', 't-in'] };
const FILTRAVEIS = ['chocolate', 'morango', 'banana', 'crianca', 'fitness', 'indicado'];

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
    item.tag && TAGS[item.tag] ? el('span', { class: 'ctag ' + TAGS[item.tag][1], text: TAGS[item.tag][0] }) : null,
  ]);
  if (item.tag) c.dataset.tag = item.tag;
  if (!item.esgotado) c.addEventListener('click', () => open(item));
  return c;
}

function monteCard(item) {
  const c = el('div', { class: 'card', style: 'background:var(--grad-acai);color:#fff;border:none' }, [
    (item.fotoCard || item.foto)
      ? el('img', { class: 'thumb', src: srcCard(item.fotoCard || item.foto, 400, 72), alt: item.nome, loading: 'lazy', decoding: 'async', onerror: function () { if (this.dataset.orig) this.replaceWith(el('div', { class: 'thumb ph', style: 'background:rgba(255,255,255,.15)' }, el('span', { text: '🍨' }))); else { this.dataset.orig = '1'; this.src = item.foto ? imgUrl(item.foto, 400, 72) : ''; } } })
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

// ACENO: o carrossel desliza um pouco e volta, mostrando que tem mais pro lado.
// Mesmo código do cardápio da loja: anima quadro a quadro (não depende de scroll suave),
// desliga o encaixe durante o movimento, repete 3 vezes e para; qualquer toque cancela.
// Só começa quando o carrossel aparece na tela, e respeita quem desligou animações.
const semMovimento = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
const suave = (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
function acenar(el) {
  if (semMovimento || !('IntersectionObserver' in window)) return;
  const ATE = 52, IDA = 420, ESPERA = 240, VOLTA = 460, PAUSA = 3000, MAX = 3;
  let vezes = 0, parado = false, timer = null, quadro = null;
  const soltarSnap = () => { el.style.scrollSnapType = ''; };
  const cancelar = () => {
    parado = true;
    if (timer) clearTimeout(timer);
    if (quadro) { cancelAnimationFrame(quadro); quadro = null; if (el.scrollLeft > 0 && el.scrollLeft <= ATE + 4) el.scrollLeft = 0; }
    soltarSnap();
  };
  ['pointerdown', 'touchstart', 'wheel'].forEach((e) => el.addEventListener(e, cancelar, { passive: true, once: true }));
  const uma = () => {
    if (parado || vezes >= MAX || !el.isConnected || el.scrollWidth <= el.clientWidth + 8) return cancelar();
    vezes++;
    el.style.scrollSnapType = 'none';
    const t0 = performance.now(), fim = IDA + ESPERA + VOLTA;
    const passo = (agora) => {
      if (parado) return;
      const t = agora - t0;
      const x = t < IDA ? ATE * suave(t / IDA) : t < IDA + ESPERA ? ATE : ATE * (1 - suave(Math.min((t - IDA - ESPERA) / VOLTA, 1)));
      el.scrollLeft = Math.round(x);
      if (t < fim) quadro = requestAnimationFrame(passo);
      else { el.scrollLeft = 0; quadro = null; soltarSnap(); timer = setTimeout(uma, PAUSA); }
    };
    quadro = requestAnimationFrame(passo);
  };
  const io = new IntersectionObserver((ents) => {
    if (ents.some((e) => e.isIntersecting && e.intersectionRatio >= .5)) { io.disconnect(); timer = setTimeout(uma, 700); }
  }, { threshold: [.5] });
  io.observe(el);
}

function featured(items, selo, seloCls = 't-nv', prioridade = 0) {
  const track = el('div', { class: 'featured' });
  items.forEach((item, i) => {
    const f = el('div', { class: 'fcard' }, [
      thumb(item, true, i < prioridade),
      // o selo vem DEPOIS da foto: no Safari do iPhone, a foto carregada sob demanda era
      // pintada por cima do selo quando ele vinha antes (na lista, que já era depois, não sumia)
      selo ? el('span', { class: 'fselo ' + seloCls, text: typeof selo === 'function' ? selo(i) : selo }) : null,
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
  // seta pra quem usa mouse (no celular o card cortado na borda já mostra que tem mais)
  const arrow = el('button', { class: 'feat-arrow', type: 'button', 'aria-label': 'Ver mais', html: '&#8250;' });
  arrow.addEventListener('click', () => track.scrollBy({ left: Math.max(200, track.clientWidth * 0.8), behavior: 'smooth' }));
  const sync = () => { const fim = track.scrollLeft + track.clientWidth >= track.scrollWidth - 8; arrow.style.display = fim ? 'none' : ''; };
  track.addEventListener('scroll', sync, { passive: true });
  requestAnimationFrame(sync);
  acenar(track);
  return el('div', { class: 'feat-wrap' }, [track, arrow]);
}

const EMOJI_CAT = { combinados: '🍧', monte: '🍨', frapes: '🥤', saladas: '🥣', milkshakes: '🥤', sobremesas: '🍫', bebidas: '🧃' };
function categoriasTiles() {
  const cats = catalog.filter((c) => c.id !== 'destaques' && c.items.length);
  const row = el('div', { class: 'cats-row' }, cats.map((c) => {
    const img = c.foto
      ? el('img', { class: 'ct-img', src: imgUrl(c.foto, 360, 74), alt: c.nome, loading: 'lazy', decoding: 'async', onerror: function () { if (this.dataset.orig) this.replaceWith(el('div', { class: 'ct-img ph' }, el('span', { text: EMOJI_CAT[c.id] || '🍧' }))); else { this.dataset.orig = '1'; this.src = c.foto; } } })
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

// Novidades (combinados marcados como NOVO no painel), logo abaixo do TOP 5
function novidadesSection() {
  const items = novidades();
  if (!items.length) return null;
  const sec = el('section', { class: 'section', id: 'sec-novidades' });
  sec.append(el('div', { class: 'container' }, el('h2', { text: 'Novidades' })), featured(items, 'NOVIDADE', 't-nv'));
  return sec;
}

// Seção 2 personalizável (ex: Promoção), abaixo do TOP 5
function secao2Section() {
  const s = secao2();
  if (!s) return null;
  const sec = el('section', { class: 'section' });
  sec.append(el('div', { class: 'container' }, el('h2', { text: s.titulo })), featured(s.items));
  return sec;
}

// Combinados: "N combinações prontas" + filtros por categoria, como na loja.
// O filtro só esconde/mostra cards: não muda o que vai pra sacola nem o preço.
function combinadosFiltrados(lista) {
  // Igual à loja: quem já aparece no TOP 5 ou em Novidades não repete na lista.
  // Só ESCONDE da lista: o catálogo segue com todos (busca e upsell acham por id).
  const items = lista.filter((i) => i.tag !== 'maispedido' && i.tag !== 'novidade');
  const grid = el('div', { class: 'grid' }, items.map(card));
  const cats = FILTRAVEIS.filter((k) => items.some((i) => i.tag === k));
  const txt = el('p', { class: 'sec-sub', text: `${items.length} combinações prontas. Escolha o tamanho ao pedir.` });
  if (!cats.length) return [txt, grid];
  const bar = el('div', { class: 'filtros' });
  const aplica = (k, btn) => {
    bar.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === btn));
    grid.querySelectorAll('.card').forEach((cd) => { cd.style.display = !k || cd.dataset.tag === k ? '' : 'none'; });
  };
  const todos = el('button', { class: 'on', type: 'button', text: 'Todos' });
  todos.addEventListener('click', () => aplica('', todos));
  bar.append(todos);
  cats.forEach((k) => {
    const b = el('button', { type: 'button', text: `${TAGS[k][0]} (${items.filter((i) => i.tag === k).length})` });
    b.addEventListener('click', () => aplica(k, b));
    bar.append(b);
  });
  return [txt, bar, grid];
}

// Milk-shake com tudo à vista, como na loja: tamanhos com preço e sabores. É só VITRINE:
// tocar abre o mesmo modal de sempre, que é quem monta o pedido, o preço do sabor extra
// e o texto da impressão. Nada do caminho do pedido muda.
function milkshakeBox(item) {
  const ms = item.raw || {};
  const extra = ms.precoSaborExtra ?? 5;
  const tams = [...(ms.tamanhos || [])].sort((a, b) => a.ml - b.ml);
  const sabores = (ms.sabores || []).map((s) => s.nome || s).filter(Boolean);
  const box = el('div', { class: 'mk-box', role: 'button', tabindex: '0' }, [
    el('div', { class: 'mk-head' }, [
      (item.fotoCard || item.foto) ? el('img', { src: srcCard(item.fotoCard || item.foto, 240, 74), alt: item.nome, loading: 'lazy', decoding: 'async' }) : null,
      el('div', {}, [el('h3', { text: item.nome || 'Milk-shake' }), el('p', { text: 'Escolha o tamanho e o sabor.' })]),
    ]),
    el('div', { class: 'passo' }, [
      el('b', {}, [el('span', { class: 'n', text: '1' }), 'Escolha o tamanho']),
      el('div', { class: 'mk-tams' }, tams.map((t) => el('div', {}, [el('b', { text: `${t.ml}ml` }), el('span', { text: money(t.preco) })]))),
    ]),
    el('div', { class: 'passo' }, [
      el('b', {}, [el('span', { class: 'n', text: '2' }), 'Escolha o sabor']),
      el('p', { class: 'mk-hint', text: `1 sabor já vem incluso no preço. Cada sabor a mais: + ${money(extra)}` }),
      el('div', { class: 'mk-sabores' }, sabores.map((s) => el('span', { text: s }))),
    ]),
    el('div', { class: 'mk-cta', text: 'Montar meu milk-shake' }),
  ]);
  const abrir = () => open(item);
  box.addEventListener('click', abrir);
  box.addEventListener('keydown', (e) => { if (e.key === 'Enter') abrir(); });
  return box;
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
    } else if (c.id === 'combinados') {
      inner.append(...combinadosFiltrados(c.items));
    } else if (c.tipo === 'milkshake' && c.items.length === 1) {
      inner.append(milkshakeBox(c.items[0]));
    } else {
      inner.append(el('div', { class: 'grid' }, c.items.map(card)));
    }
    const sec = el('section', { class: 'section', id: 'sec-' + c.id });
    if (c.tipo === 'destaques') { sec.append(el('div', { class: 'container' }, el('h2', { text: c.nome })), featured(c.items, (i) => `#${i + 1} mais pedido`, 't-mp', 2)); }
    else sec.append(inner);
    sectionsHost.append(sec);
    if (c.tipo === 'destaques') {
      const nv = novidadesSection();
      if (nv) sectionsHost.append(nv);
      const s2 = secao2Section();
      if (s2) sectionsHost.append(s2);
      sectionsHost.append(categoriasTiles());
    }
  });
  observeSections();
}

// item.promo ({preco, ml}) vem da seção de ofertas: abre travado no tamanho da promoção.
function open(item) {
  track.viewItem(item);
  openProduct(item, (line) => { cart.add(line); track.addToCart(line); toast(`${line.qtd}x adicionado à sacola`); }, item.promo || undefined);
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
      // ids das bebidas, pra reconhecer bebida adicionada pelo upsell (senão vira "upsell"
      // e perde o aviso/via de bebida e ainda gera papel de produção)
      const bebidaIds = new Set((catalog.find((c) => c.id === 'bebidas')?.items || []).map((i) => i.id));
      const upBox = el('div', { class: 'opt-group', style: 'margin-top:14px' });
      upBox.append(el('div', { class: 'opt-head' }, el('div', { class: 't', text: up.titulo })));
      up.itens.forEach((u) => {
        const add = el('button', { class: 'btn btn-amarelo mini', style: 'flex:0 0 auto', text: '+ ' + money(u.preco) });
        add.addEventListener('click', () => {
          const refId = u.refId || u.id;
          const catItem = catalog.flatMap((c) => c.items).find((it) => it.id === refId);
          // Se o produto exige escolha (sabor do refri, tamanho/base do açaí...), abre o
          // modal pra o cliente escolher, em vez de adicionar "no escuro".
          const precisaEscolher = catItem && (catItem.tipo !== 'simples' || (catItem.raw && Array.isArray(catItem.raw.tipos) && catItem.raw.tipos.filter(Boolean).length));
          if (precisaEscolher) {
            track.viewItem(catItem);
            // Montável (combinado, monte, frapê): a oferta trava no tamanho de entrada,
            // senão o desconto seria ignorado e o cliente pagaria o preço cheio.
            const ml = catItem.tipo !== 'simples' ? menorMl(catItem) : null;
            openProduct(catItem, (line) => { cart.add(line); track.addToCart(line); paint(); },
              ml ? { preco: Number(u.preco) || 0, ml } : Number(u.preco));
            return;
          }
          // Item simples sem escolha (ex: água): 1 clique, preserva o preço da oferta.
          const line = cart.add({ tipo: 'upsell', refId, catId: bebidaIds.has(refId) ? 'bebidas' : 'upsell', nome: u.nome, precoUnit: Number(u.preco) || 0, qtd: 1, print: { titulo: u.nome, detalhes: [] } });
          track.addToCart(line);
          paint();
        });
        upBox.append(el('div', { class: 'opt' }, [
          u.foto ? el('img', { src: imgUrl(u.foto, 120, 72), alt: u.nome, loading: 'lazy', decoding: 'async', style: 'width:46px;height:46px;border-radius:10px;object-fit:cover;flex:none', onerror: function () { if (this.dataset.orig) this.style.display = 'none'; else { this.dataset.orig = '1'; this.src = u.foto; } } }) : null,
          Number(u.precoDe) > Number(u.preco)
            ? el('span', { class: 'oname' }, [document.createTextNode(u.nome + ' '), el('s', { class: 'muted', text: money(u.precoDe) })])
            : el('span', { class: 'oname', text: u.nome }),
          add,
        ]));
      });
      body.append(upBox);
    }
    foot.append(
      el('div', { style: 'flex:1' }, [el('small', { class: 'muted', text: 'Subtotal' }), el('div', { style: 'font-weight:900;font-size:1.1rem', text: money(cart.subtotal()) })]),
      el('button', { class: 'btn btn-primary', style: 'flex:1.4', text: 'Ir para o pagamento', onclick: () => {
        const min = settings.pedidoMinimo || 0;
        if (min > 0 && cart.subtotal() < min) { toast(`Pedido mínimo de ${money(min)}. Faltam ${money(min - cart.subtotal())}.`); return; }
        destroy(); openCheckout();
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

// ---- Acompanhamento de pedido (status pro cliente) ----
const PEDIDO_KEY = 'ams_pedido';
const ST = {
  novo: { label: 'Pedido recebido', passo: 0 },
  aceito: { label: 'Pedido confirmado', passo: 0 },
  producao: { label: 'Em produção 🍨', passo: 1 },
  pronto: { label: 'Pronto! 🎉', passo: 2 },
  saiu: { label: 'Saiu para entrega 🛵', passo: 3 },
  entregue: { label: 'Entregue', passo: 4 },
  cancelado: { label: 'Cancelado', passo: -1 },
};
const statusLabel = (s) => (ST[s] || ST.novo).label;
let pedido = lerPedido();
let trackRepaint = null;

function lerPedido() {
  try {
    const p = JSON.parse(localStorage.getItem(PEDIDO_KEY) || 'null');
    if (!p) return null;
    if (Date.now() - (p.ts || 0) > 4 * 3600 * 1000) { localStorage.removeItem(PEDIDO_KEY); return null; } // expira em 4h
    return p;
  } catch (e) { return null; }
}
function salvarPedido() { try { localStorage.setItem(PEDIDO_KEY, JSON.stringify(pedido)); } catch (e) {} }
function limparPedido() { try { localStorage.removeItem(PEDIDO_KEY); } catch (e) {} pedido = null; }

function trackerBar() {
  if (!pedido) return null;
  const num = pedido.numero ? `#${String(pedido.numero).padStart(3, '0')}` : '';
  const bar = el('div', { class: 'order-track', id: 'orderTrack' }, [
    el('span', { class: 'ot-pulse' }),
    el('div', { class: 'ot-info' }, [
      el('div', { class: 'ot-num', text: `Seu pedido ${num}` }),
      el('div', { class: 'ot-status', id: 'otStatus', text: statusLabel(pedido.status) }),
    ]),
    el('span', { class: 'ot-cta', text: 'Acompanhar ›' }),
  ]);
  bar.addEventListener('click', openTrack);
  return bar;
}

// Banner "Repetir último pedido": aparece quando o cliente já fez um pedido neste
// aparelho (e não tem pedido em andamento). 1 clique re-monta a sacola e abre.
function repetirBanner() {
  if (pedido) return null; // já tem pedido em andamento -> mostra só o tracker
  let last; try { last = JSON.parse(localStorage.getItem('ams_ultimo_pedido') || 'null'); } catch (e) {}
  // pedido salvo com preços de outra versão do cardápio não volta (preço velho ou item que saiu)
  if (last && (last.v || null) !== (menuFresco ? precosVersao() : last.v || null)) return null;
  const items = (last && Array.isArray(last.items) ? last.items : []).filter((i) => i && i.precoUnit != null);
  if (!items.length) return null;
  const qtd = items.reduce((s, i) => s + (Number(i.qtd) || 1), 0);
  const total = items.reduce((s, i) => s + (Number(i.precoUnit) || 0) * (Number(i.qtd) || 1), 0);
  const resumo = items.map((i) => `${Number(i.qtd) || 1}x ${(i.print && i.print.titulo) || i.nome}`).join(', ');
  const bar = el('button', { class: 'repeat-bar', type: 'button' }, [
    el('span', { class: 'rb-ico', text: '🔁' }),
    el('div', { class: 'rb-info' }, [
      el('div', { class: 'rb-title', text: 'Repetir último pedido' }),
      el('div', { class: 'rb-sub', text: resumo }),
    ]),
    el('span', { class: 'rb-cta', text: money(total) }),
  ]);
  bar.addEventListener('click', () => {
    items.forEach((i) => { cart.add({ ...i }); track.addToCart(i); });
    toast(`${qtd} ${qtd === 1 ? 'item adicionado' : 'itens adicionados'} à sacola`);
    openCart();
  });
  return bar;
}

function openTrack() {
  if (!pedido) return;
  const overlay = el('div', { class: 'overlay' });
  const sheet = el('div', { class: 'sheet' });
  const body = el('div', { class: 'sheet-body' });
  const head = el('div', { class: 'sheet-foot', style: 'border-top:none;border-bottom:1px solid var(--line)' }, [
    el('b', { text: `Pedido ${pedido.numero ? '#' + String(pedido.numero).padStart(3, '0') : ''}`, style: 'font-size:1.1rem;flex:1' }),
    el('button', { class: 'icon-btn', style: 'background:var(--surface-2);color:var(--ink)', html: '&times;', onclick: () => destroy() }),
  ]);
  sheet.append(head, body); overlay.append(sheet); document.body.append(overlay);
  document.body.style.overflow = 'hidden'; requestAnimationFrame(() => overlay.classList.add('show'));
  const destroy = () => { trackRepaint = null; overlay.classList.remove('show'); document.body.style.overflow = ''; setTimeout(() => overlay.remove(), 280); };
  overlay.addEventListener('click', (e) => { if (e.target === overlay) destroy(); });

  const paint = () => {
    body.innerHTML = '';
    if (!pedido) { destroy(); return; }
    if (pedido.status === 'cancelado') {
      body.append(el('div', { style: 'text-align:center;padding:30px 10px' }, [
        el('div', { style: 'font-size:3rem', text: '❌' }),
        el('div', { class: 'sheet-title', style: 'margin-top:8px', text: 'Pedido cancelado' }),
        el('div', { class: 'sheet-desc', style: 'margin-top:6px', text: 'Se tiver dúvida, fale com a loja no WhatsApp.' }),
        el('button', { class: 'btn btn-ghost btn-block', style: 'margin-top:18px', text: 'Ok, entendi', onclick: () => { limparPedido(); refreshTrackerUI(); destroy(); } }),
      ]));
      return;
    }
    const entrega = pedido.tipo === 'entrega';
    const passos = entrega
      ? [['📥', 'Pedido recebido', 0], ['🍨', 'Em produção', 1], ['✅', 'Pronto', 2], ['🛵', 'Saiu para entrega', 3], ['🎉', 'Entregue', 4]]
      : [['📥', 'Pedido recebido', 0], ['🍨', 'Em produção', 1], ['✅', 'Pronto pra retirar', 2], ['🎉', 'Retirado', 4]];
    const atual = (ST[pedido.status] || ST.novo).passo;
    const eta = entrega ? `Entrega em aprox. ${pedido.etaMin} a ${pedido.etaMax} min` : `Pronto em aprox. ${pedido.etaMin} min`;
    body.append(el('div', { class: 'sheet-desc', style: 'text-align:center;margin-bottom:10px', text: eta }));
    const timeline = el('div', { class: 'timeline' });
    passos.forEach(([emoji, txt, idx]) => {
      const feito = atual >= idx;
      const ativo = atual === idx;
      timeline.append(el('div', { class: 'tl-step' + (feito ? ' done' : '') + (ativo ? ' active' : '') }, [
        el('span', { class: 'tl-dot', text: feito ? emoji : '' }),
        el('span', { class: 'tl-txt', text: txt }),
      ]));
    });
    body.append(timeline);
    if (pedido.status === 'entregue') body.append(el('button', { class: 'btn btn-primary btn-block', style: 'margin-top:18px', text: 'Concluir', onclick: () => { limparPedido(); refreshTrackerUI(); destroy(); } }));
    else body.append(el('p', { class: 'hint', style: 'text-align:center;margin-top:14px', text: 'Atualiza sozinho. Pode fechar e voltar quando quiser.' }));
  };
  paint();
  trackRepaint = paint;
}

function refreshTrackerUI() {
  const bar = document.getElementById('orderTrack');
  if (!pedido) bar?.remove();
  else { const st = document.getElementById('otStatus'); if (st) st.textContent = statusLabel(pedido.status); }
  if (trackRepaint) trackRepaint();
}

async function refreshTracker() {
  if (!pedido) return;
  const s = await orderStatus(pedido.id);
  if (!s) return;
  if (s.status && s.status !== pedido.status) { pedido.status = s.status; salvarPedido(); }
  if (s.eta_min != null) pedido.etaMin = s.eta_min;
  if (s.eta_max != null) pedido.etaMax = s.eta_max;
  refreshTrackerUI();
}

// ---- Login do cliente por telefone + Meus pedidos ----
function clienteSalvo() { try { return JSON.parse(localStorage.getItem('ams_cliente') || '{}') || {}; } catch (e) { return {}; } }

function loginSheet(titulo) {
  const overlay = el('div', { class: 'overlay' });
  const sheet = el('div', { class: 'sheet' });
  const body = el('div', { class: 'sheet-body' });
  const destroy = () => { overlay.classList.remove('show'); document.body.style.overflow = ''; setTimeout(() => overlay.remove(), 280); };
  const head = el('div', { class: 'sheet-foot', style: 'border-top:none;border-bottom:1px solid var(--line)' }, [
    el('b', { text: titulo, style: 'font-size:1.1rem;flex:1' }),
    el('button', { class: 'icon-btn', style: 'background:var(--surface-2);color:var(--ink)', html: '&times;', onclick: () => destroy() }),
  ]);
  sheet.append(head, body); overlay.append(sheet); document.body.append(overlay);
  document.body.style.overflow = 'hidden'; requestAnimationFrame(() => overlay.classList.add('show'));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) destroy(); });
  return { body, destroy };
}

function openLogin() {
  const { body, destroy } = loginSheet('Entrar');
  const c = clienteSalvo();
  const inStyle = 'width:100%;border:1.5px solid var(--line);border-radius:12px;padding:13px;outline:none';
  const nome = el('input', { style: inStyle, placeholder: 'Seu nome', value: c.nome || '', autocomplete: 'name' });
  const tel = el('input', { style: inStyle, placeholder: '(17) 99999-9999', value: c.telefone || '', type: 'tel', inputmode: 'tel', autocomplete: 'tel' });
  const aplica = () => { tel.value = maskPhone(tel.value); };
  // Ao APAGAR não re-formata, senão os "()" do DDD travam e não dá pra corrigir o número.
  tel.addEventListener('input', (e) => { if (e && typeof e.inputType === 'string' && e.inputType.startsWith('delete')) return; aplica(); });
  tel.addEventListener('change', aplica);
  const msg = el('div', { class: 'sheet-desc', style: 'margin-top:8px;color:var(--magenta)' });
  const btn = el('button', { class: 'btn btn-primary btn-block', style: 'margin-top:16px', text: 'Ver meus pedidos' });
  btn.addEventListener('click', async () => {
    const t = maskPhone(tel.value), n = nome.value.trim();
    if (n.length < 2 || !phoneValido(t)) { msg.textContent = 'Preencha o nome e o telefone certinho.'; return; }
    btn.disabled = true; btn.textContent = 'Entrando...';
    const r = await customerLogin(t, n);
    if (r && r.found) {
      try { localStorage.setItem('ams_cliente', JSON.stringify({ ...clienteSalvo(), nome: r.name || n, telefone: t })); } catch (e) {}
      track.generateLead(t, n, 'login');
      destroy(); openMeusPedidos({ nome: r.name || n, telefone: t, resumo: r });
    } else {
      btn.disabled = false; btn.textContent = 'Ver meus pedidos';
      msg.textContent = 'Não achei pedidos com esse nome e telefone. Se for seu primeiro pedido, é só montar no cardápio.';
    }
  });
  body.append(
    el('div', { class: 'sheet-title', text: 'Já pediu aqui?' }),
    el('div', { class: 'sheet-desc', text: 'Coloque seu telefone e nome pra ver seus pedidos e já preencher tudo automático na próxima.' }),
    el('label', { class: 'opt-group', style: 'display:block;margin-top:12px' }, [el('div', { class: 'opt-head' }, el('div', { class: 't', text: 'Nome' })), nome]),
    el('label', { class: 'opt-group', style: 'display:block' }, [el('div', { class: 'opt-head' }, el('div', { class: 't', text: 'Telefone' })), tel]),
    msg, btn,
    el('p', { class: 'hint', style: 'text-align:center;margin-top:12px', text: 'Usamos só pra identificar seus pedidos. Sem senha.' }),
  );
}

async function openMeusPedidos(cliente) {
  const { body, destroy } = loginSheet(`Olá, ${(cliente.nome || '').split(' ')[0] || 'cliente'}`);
  let r = cliente.resumo;
  const badges = el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px' });
  body.append(badges);
  body.append(el('button', { class: 'btn btn-ghost btn-block mini', style: 'margin-bottom:12px', text: 'Sair desta conta', onclick: () => { try { const cur = clienteSalvo(); delete cur.nome; delete cur.telefone; localStorage.setItem('ams_cliente', JSON.stringify(cur)); } catch (e) {} destroy(); toast('Você saiu'); } }));
  const lista = el('div', {}, el('p', { class: 'hint', style: 'text-align:center', text: 'Buscando seus pedidos...' }));
  body.append(lista);
  if (!r) r = await customerLogin(cliente.telefone, cliente.nome);
  if (r && r.orders_count != null) {
    badges.append(el('span', { class: 'pill pill-ok', text: `${r.orders_count} pedido${r.orders_count === 1 ? '' : 's'}` }));
    if (r.total_spent != null) badges.append(el('span', { class: 'pill', text: `Total ${money(r.total_spent)}` }));
  }
  const pedidos = await customerOrders(cliente.telefone, cliente.nome);
  lista.innerHTML = '';
  if (!pedidos.length) { lista.append(el('div', { class: 'center muted', style: 'padding:30px 10px' }, [el('div', { style: 'font-size:2.2rem', text: '🧾' }), el('p', { style: 'margin-top:8px', text: 'Você ainda não tem pedidos por aqui.' })])); return; }
  pedidos.forEach((o) => {
    const dataTxt = (() => { try { return new Date(o.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }); } catch (e) { return ''; } })();
    const itens = (o.items || []).map((i) => `${i.qtd}x ${i.nome}`).join(', ');
    lista.append(el('div', { class: 'opt-group', style: 'margin-bottom:8px' }, [
      el('div', { style: 'display:flex;justify-content:space-between;align-items:center;gap:8px' }, [
        el('b', { text: `#${String(o.daily_number || 0).padStart(3, '0')} · ${dataTxt}` }),
        el('span', { class: 'pill', style: 'flex:none', text: statusLabel(o.status) }),
      ]),
      itens ? el('small', { class: 'muted', style: 'display:block;margin-top:4px', text: itens }) : null,
      el('div', { class: 'oprice', style: 'margin-top:4px', text: money(o.total) }),
    ]));
  });
}

// ---- Boot ----
function boot() {
  root.innerHTML = '';
  root.append(header(), hero());
  const tb = trackerBar(); if (tb) root.append(tb);
  const cb = closedBanner(); if (cb) root.append(cb);
  const rb = repetirBanner(); temRepetir = !!rb; if (rb) root.append(rb);
  root.append(searchBar(), catNav());
  const main = el('main', { id: 'sections', style: 'padding-bottom:90px' });
  sectionsHost = main; root.append(main, rodape(), cartBar());
  renderSections();
  updateCart();
  document.getElementById('loading')?.remove();
}

cart.onChange(updateCart);
// Enquanto o cardápio vem do cache, o banner "Repetir" confia na versão salva; depois do
// hydrate ele é re-julgado contra a versão real (por isso o boot de novo se ele existia).
let menuFresco = false;
let temRepetir = false;

// Abre INSTANTÂNEO: mostra o cardápio do cache local (ou seed) na hora,
// e atualiza por trás com o Supabase (sem segurar a tela nem manter conexão ao vivo).
settings = getSettings(); catalog = buildCatalog(); boot();
// acompanhamento do pedido: busca o status agora e atualiza a cada 20s
if (pedido) { refreshTracker(); setInterval(refreshTracker, 20000); }
// assinatura inclui catálogo + promo + upsell + settings: re-renderiza se QUALQUER um mudou
const fullSig = () => JSON.stringify({ c: catalog, nv: novidades(), s2: secao2(), up: upsellItems(), st: settings });
let lastSig = fullSig();
hydrate().then(() => {
  settings = getSettings();
  catalog = buildCatalog();
  // só com o cardápio FRESCO dá pra julgar versão: com o cache podia descartar à toa
  menuFresco = true;
  const limpou = cart.conferirVersao(precosVersao());
  const sig = fullSig();
  if (sig !== lastSig || limpou || temRepetir) { const y = window.scrollY; boot(); window.scrollTo(0, y); lastSig = sig; }
}).catch(() => {});
