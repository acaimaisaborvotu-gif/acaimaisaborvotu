// =============================================================================
// MODAL DE PRODUTO — montagem com preço dinâmico
// Tipos: monte | combo | frape | milkshake | simples
// Lê o cardápio corrente (hidratado do painel/Supabase ou seed) via menu().
// =============================================================================

import { el, money } from './util.js';
import { menu } from './data.js';

let M;                                   // catálogo corrente (setado ao abrir)
const comboRecips = () => M.RECIPIENTES.filter((r) => r.id === 'copo' || r.id === 'tigela');
const acompName = (id) => { for (const g of M.ACOMPANHAMENTOS) { const f = g.itens.find((i) => i.id === id); if (f) return f; } return null; };

function overlayShell(item) {
  const overlay = el('div', { class: 'overlay' });
  const sheet = el('div', { class: 'sheet' });
  const hero = el('div', { class: 'sheet-hero' },
    item.foto ? el('img', { src: item.foto, alt: item.nome, onerror: function () { this.replaceWith(el('span', { class: 'emoji', text: item.emoji || '🍧' })); } })
              : el('span', { class: 'emoji', text: item.emoji || '🍧' }));
  const close = el('button', { class: 'close', 'aria-label': 'Fechar', html: '&times;' });
  hero.append(close);
  const body = el('div', { class: 'sheet-body' });
  const foot = el('div', { class: 'sheet-foot' });
  sheet.append(hero, body, foot);
  overlay.append(sheet);
  document.body.append(overlay);
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => overlay.classList.add('show'));

  const destroy = () => { overlay.classList.remove('show'); document.body.style.overflow = ''; setTimeout(() => overlay.remove(), 280); };
  close.addEventListener('click', destroy);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) destroy(); });
  document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { destroy(); document.removeEventListener('keydown', esc); } });
  return { overlay, sheet, body, foot, destroy };
}

function groupHead(title, sub, tag) {
  return el('div', { class: 'opt-head' }, [
    el('div', { class: 't' }, [title, sub ? el('small', { text: sub }) : null]),
    tag === 'req' ? el('span', { class: 'opt-req', text: 'Escolha 1' })
      : tag === 'opt' ? el('span', { class: 'opt-opt', text: 'Opcional' }) : null,
  ]);
}

// Seletor recipiente (segmentado) + tamanhos. NADA pré-selecionado: a pessoa escolhe.
function sizePicker(recipientes, state, recompute) {
  const wrap = el('div');
  const single = recipientes.length === 1;
  if (single) state.recipienteId = recipientes[0].id; // recipiente único é implícito (frapê, milk)
  const seg = el('div', { class: 'seg-recip' });
  const sizesBox = el('div');
  function renderSizes() {
    sizesBox.innerHTML = '';
    const r = recipientes.find((x) => x.id === state.recipienteId);
    if (!r) { sizesBox.append(el('div', { class: 'opt-hint', text: 'Primeiro escolha copo ou tigela' })); return; }
    r.tamanhos.forEach((t) => {
      const sel = state.tamanhoId === t.id;
      const row = el('button', { class: 'opt' + (sel ? ' sel' : ''), type: 'button' }, [
        el('span', { class: 'oname', text: `${t.ml}ml` }),
        el('span', { class: 'oprice', text: money(t.preco) }),
        el('span', { class: 'mark', html: sel ? '&#10003;' : '' }),
      ]);
      row.addEventListener('click', () => { state.tamanhoId = t.id; renderSizes(); recompute(); });
      sizesBox.append(row);
    });
  }
  if (!single) {
    recipientes.forEach((r) => {
      const b = el('button', { class: 'btn btn-ghost', type: 'button', style: 'flex:1;padding:9px', text: r.nome });
      b.addEventListener('click', () => {
        state.recipienteId = r.id; state.tamanhoId = null;
        [...seg.children].forEach((c, i) => c.className = 'btn ' + (recipientes[i].id === state.recipienteId ? 'btn-primary' : 'btn-ghost'));
        renderSizes(); recompute();
      });
      seg.append(b);
    });
  }
  renderSizes();
  wrap.append(single ? el('div') : seg, sizesBox);
  return wrap;
}

// Grupo de acompanhamentos com stepper (+/-)
function acompGroup(group, state) {
  const box = el('div', { class: 'opt-group' });
  box.append(groupHead(group.nome, null, 'opt'));
  group.itens.forEach((it) => {
    const nEl = el('span', { class: 'n', text: '0' });
    const minus = el('button', { type: 'button', html: '&minus;', disabled: true });
    const plus = el('button', { type: 'button', html: '+' });
    const row = el('div', { class: 'opt' }, [
      el('span', { class: 'oname', text: it.nome }),
      el('span', { class: 'oprice', text: '+ ' + money(it.preco) }),
      el('div', { class: 'stepper' }, [minus, nEl, plus]),
    ]);
    const sync = () => { const q = state.acomp.get(it.id) || 0; nEl.textContent = q; minus.disabled = q === 0; row.classList.toggle('sel', q > 0); };
    minus.addEventListener('click', () => { const q = Math.max(0, (state.acomp.get(it.id) || 0) - 1); q ? state.acomp.set(it.id, q) : state.acomp.delete(it.id); sync(); state._recompute(); });
    plus.addEventListener('click', () => { state.acomp.set(it.id, (state.acomp.get(it.id) || 0) + 1); sync(); state._recompute(); });
    box.append(row);
  });
  return box;
}

export function openProduct(item, onAdd) {
  M = menu();
  const { body, foot, destroy } = overlayShell(item);
  const state = { recipienteId: null, tamanhoId: null, bases: new Set(), acomp: new Map(), sabor: null, sabor2: null, obs: '', qtd: 1 };

  body.append(el('div', { class: 'sheet-title', text: item.tipo === 'combo' ? `Combinado ${item.nome}` : item.nome }));
  if (item.desc) body.append(el('div', { class: 'sheet-desc', text: item.desc }));

  if (item.tipo === 'monte') {
    M.BASES.filter((b) => b.padrao).forEach((b) => state.bases.add(b.id));
    const g1 = el('div', { class: 'opt-group' }); g1.append(groupHead('Tamanho', null, 'req'), sizePicker(M.RECIPIENTES, state, () => recompute()));
    body.append(g1);
    const gb = el('div', { class: 'opt-group' }); gb.append(groupHead('Base', 'Pode escolher mais de uma. Açaí já vem marcado.', 'opt'));
    M.BASES.forEach((b) => {
      const row = el('div', { class: 'opt' + (state.bases.has(b.id) ? ' sel' : '') }, [
        el('span', { class: 'oname', text: b.nome }),
        el('span', { class: 'oprice free', text: 'Grátis' }),
        el('span', { class: 'mark sq', html: state.bases.has(b.id) ? '&#10003;' : '' }),
      ]);
      row.addEventListener('click', () => { state.bases.has(b.id) ? state.bases.delete(b.id) : state.bases.add(b.id); row.classList.toggle('sel'); row.querySelector('.mark').innerHTML = state.bases.has(b.id) ? '&#10003;' : ''; });
      gb.append(row);
    });
    body.append(gb);
    M.ACOMPANHAMENTOS.forEach((g) => body.append(acompGroup(g, state)));
  } else if (item.tipo === 'combo') {
    const recs = comboRecips();
    const g1 = el('div', { class: 'opt-group' }); g1.append(groupHead('Tamanho', 'Copo ou tigela', 'req'), sizePicker(recs, state, () => recompute()));
    body.append(g1);
    const extras = el('div', { class: 'opt-group' });
    extras.append(groupHead('Turbine com acompanhamentos', 'Opcional, soma ao preço', 'opt'));
    body.append(extras);
    M.ACOMPANHAMENTOS.forEach((g) => body.append(acompGroup(g, state)));
  } else if (item.tipo === 'frape') {
    const g1 = el('div', { class: 'opt-group' }); g1.append(groupHead('Tamanho', null, 'req'), sizePicker([{ id: 'frape', nome: 'Frapê', tamanhos: M.FRAPE.tamanhos }], state, () => recompute()));
    body.append(g1);
    M.ACOMPANHAMENTOS.forEach((g) => body.append(acompGroup(g, state)));
  } else if (item.tipo === 'milkshake') {
    const g1 = el('div', { class: 'opt-group' }); g1.append(groupHead('Tamanho', null, 'req'), sizePicker([{ id: 'milk', nome: 'Milk-shake', tamanhos: M.MILKSHAKE.tamanhos }], state, () => recompute()));
    body.append(g1);
    const gs = el('div', { class: 'opt-group' }); gs.append(groupHead('Sabor', null, 'req'));
    M.MILKSHAKE.sabores.forEach((s) => {
      const row = el('button', { class: 'opt', type: 'button' }, [el('span', { class: 'oname', text: s.nome }), el('span', { class: 'mark', html: '' })]);
      row.addEventListener('click', () => { state.sabor = s.id; [...gs.querySelectorAll('.opt')].forEach((r) => { r.classList.remove('sel'); r.querySelector('.mark').innerHTML = ''; }); row.classList.add('sel'); row.querySelector('.mark').innerHTML = '&#10003;'; recompute(); });
      gs.append(row);
    });
    body.append(gs);
    const g2 = el('div', { class: 'opt-group' });
    const toggle = el('div', { class: 'opt' }, [el('span', { class: 'oname', text: 'Adicionar 2º sabor' }), el('span', { class: 'oprice', text: '+ ' + money(M.MILKSHAKE.precoSaborExtra) }), el('span', { class: 'mark sq', html: '' })]);
    const sel2 = el('div', { class: 'hidden' });
    M.MILKSHAKE.sabores.forEach((s) => {
      const row = el('button', { class: 'opt', type: 'button' }, [el('span', { class: 'oname', text: s.nome }), el('span', { class: 'mark', html: '' })]);
      row.addEventListener('click', () => { state.sabor2 = s.id; [...sel2.querySelectorAll('.opt')].forEach((r) => { r.classList.remove('sel'); r.querySelector('.mark').innerHTML = ''; }); row.classList.add('sel'); row.querySelector('.mark').innerHTML = '&#10003;'; recompute(); });
      sel2.append(row);
    });
    toggle.addEventListener('click', () => {
      const on = sel2.classList.toggle('hidden') === false;
      toggle.classList.toggle('sel', on); toggle.querySelector('.mark').innerHTML = on ? '&#10003;' : '';
      if (!on) { state.sabor2 = null; sel2.querySelectorAll('.opt').forEach((r) => { r.classList.remove('sel'); r.querySelector('.mark').innerHTML = ''; }); }
      recompute();
    });
    g2.append(toggle, sel2); body.append(g2);
  }

  const gobs = el('div', { class: 'opt-group' });
  gobs.append(groupHead('Observação', 'Ex: sem granola, capricha na fruta', 'opt'));
  const ta = el('textarea', { class: 'obs', placeholder: 'Alguma observação?', maxlength: '200' });
  ta.addEventListener('input', () => { state.obs = ta.value.trim(); });
  gobs.append(ta); body.append(gobs);

  const qn = el('span', { class: 'n', text: '1' });
  const qminus = el('button', { type: 'button', html: '&minus;', disabled: true });
  const qplus = el('button', { type: 'button', html: '+' });
  const addBtn = el('button', { class: 'btn btn-primary btn-block', type: 'button' });
  qminus.addEventListener('click', () => { state.qtd = Math.max(1, state.qtd - 1); qn.textContent = state.qtd; qminus.disabled = state.qtd === 1; recompute(); });
  qplus.addEventListener('click', () => { state.qtd += 1; qn.textContent = state.qtd; qminus.disabled = false; recompute(); });
  foot.append(el('div', { class: 'stepper' }, [qminus, qn, qplus]), addBtn);

  function precoUnit() {
    let p = 0;
    if (item.tipo === 'simples') return item.raw.preco;
    if (item.tipo === 'combo') p += item.raw.valorBase;
    if (item.tipo === 'monte' || item.tipo === 'combo' || item.tipo === 'frape') {
      const recs = item.tipo === 'combo' ? comboRecips() : item.tipo === 'frape' ? [{ tamanhos: M.FRAPE.tamanhos }] : M.RECIPIENTES;
      const t = recs.flatMap((r) => r.tamanhos).find((x) => x.id === state.tamanhoId);
      if (t) p += t.preco;
      for (const [id, q] of state.acomp) { const a = acompName(id); if (a) p += a.preco * q; }
    }
    if (item.tipo === 'milkshake') {
      const t = M.MILKSHAKE.tamanhos.find((x) => x.id === state.tamanhoId); if (t) p += t.preco;
      if (state.sabor2) p += M.MILKSHAKE.precoSaborExtra;
    }
    return p;
  }
  function valido() {
    if (item.tipo === 'simples') return true;
    if (item.tipo === 'milkshake') return !!state.tamanhoId && !!state.sabor;
    return !!state.tamanhoId;
  }
  function faltando() {
    if (item.tipo === 'simples') return '';
    if (!state.tamanhoId) return 'Escolha o tamanho';
    if (item.tipo === 'milkshake' && !state.sabor) return 'Escolha o sabor';
    return '';
  }
  state._recompute = recompute;
  function recompute() {
    const unit = precoUnit(); const ok = valido();
    addBtn.disabled = !ok;
    addBtn.innerHTML = ok ? `Adicionar &bull; ${money(unit * state.qtd)}` : faltando();
  }
  recompute();

  addBtn.addEventListener('click', () => {
    if (!valido()) return;
    onAdd(buildLine(item, state, precoUnit()));
    destroy();
  });
}

function buildLine(item, state, unit) {
  const acompList = [...state.acomp.entries()].map(([id, q]) => { const a = acompName(id); return a ? (q > 1 ? `${a.nome} x${q}` : a.nome) : null; }).filter(Boolean);
  let titulo = item.nome, detalhes = [];

  if (item.tipo === 'simples') {
    titulo = item.nome;
  } else if (item.tipo === 'monte') {
    const t = M.RECIPIENTES.flatMap((r) => r.tamanhos).find((x) => x.id === state.tamanhoId);
    const recip = M.RECIPIENTES.find((r) => r.tamanhos.some((x) => x.id === state.tamanhoId));
    const baseNomes = M.BASES.filter((b) => state.bases.has(b.id)).map((b) => b.nome);
    titulo = `${baseNomes.join(' + ') || 'Açaí'} ${recip.nome} ${t.ml}ml`;
    detalhes = acompList.length ? acompList : ['Sem acompanhamento'];
  } else if (item.tipo === 'combo') {
    const recs = comboRecips();
    const t = recs.flatMap((r) => r.tamanhos).find((x) => x.id === state.tamanhoId);
    const recip = recs.find((r) => r.tamanhos.some((x) => x.id === state.tamanhoId));
    titulo = `Combinado ${item.nome} (${recip.nome} ${t.ml}ml)`;
    detalhes = [item.desc, ...acompList.map((a) => `+ ${a}`)];
  } else if (item.tipo === 'frape') {
    const t = M.FRAPE.tamanhos.find((x) => x.id === state.tamanhoId);
    titulo = `Frapê ${t.ml}ml`;
    detalhes = acompList.length ? acompList : ['Puro'];
  } else if (item.tipo === 'milkshake') {
    const t = M.MILKSHAKE.tamanhos.find((x) => x.id === state.tamanhoId);
    const s1 = M.MILKSHAKE.sabores.find((s) => s.id === state.sabor);
    const s2 = M.MILKSHAKE.sabores.find((s) => s.id === state.sabor2);
    titulo = `Milk-shake ${s1 ? s1.nome : ''} ${t.ml}ml`;
    if (s2) detalhes.push(`2º sabor: ${s2.nome}`);
  }
  if (state.obs) detalhes.push(`Obs: ${state.obs}`);

  return {
    tipo: item.tipo, refId: item.id, catId: item.catId, nome: titulo,
    precoUnit: Number(unit.toFixed(2)), qtd: state.qtd,
    print: { titulo, detalhes }, obs: state.obs,
  };
}
