// =============================================================================
// MODAL DE PRODUTO — montagem com preço dinâmico
// Tipos: monte | combo | frape | milkshake | sorvete (petit/brownie) | simples
// Lê o cardápio corrente (hidratado do painel/Supabase ou seed) via menu().
// =============================================================================

import { el, money } from './util.js';
import { menu } from './data.js';

let M;                                   // catálogo corrente (setado ao abrir)
const comboRecips = () => M.RECIPIENTES.filter((r) => r.id === 'copo' || r.id === 'tigela');
const acompName = (id) => { for (const g of M.ACOMPANHAMENTOS) { const f = g.itens.find((i) => i.id === id); if (f) return f; } return null; };

// Ordem dos grupos de acompanhamento (Diversos vem antes dos Chocolates)
const ACOMP_ORDER = ['frutas', 'cremes', 'mousses', 'diversos', 'chocolates', 'sorvetes', 'coberturas'];
const acompGroupsOrdered = () => [...M.ACOMPANHAMENTOS].sort((a, b) => {
  const ia = ACOMP_ORDER.indexOf(a.id), ib = ACOMP_ORDER.indexOf(b.id);
  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
});

// Acompanhamentos escolhidos, agrupados por categoria (na ordem). [{grupo, itens:[{nome,qtd}]}]
function acompGrouped(state) {
  const out = [];
  acompGroupsOrdered().forEach((g) => {
    const itens = g.itens.filter((it) => (state.acomp.get(it.id) || 0) > 0).map((it) => ({ nome: it.nome, qtd: state.acomp.get(it.id) }));
    if (itens.length) out.push({ grupo: g.nome, itens });
  });
  return out;
}

// Linha "Base:/Bases:" que vai abaixo do recipiente (impressao e sacola).
function baseLinhaTxt(state) {
  const ns = M.BASES.filter((b) => state.bases.has(b.id)).map((b) => b.nome);
  return `${ns.length > 1 ? 'Bases' : 'Base'}: ${ns.join(', ') || 'Açaí'}`;
}

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
      : tag === 'req+' ? el('span', { class: 'opt-req', text: 'Pelo menos 1' })
      : tag === 'opt' ? el('span', { class: 'opt-opt', text: 'Opcional' }) : null,
  ]);
}

// Seletor recipiente (segmentado) + tamanhos. NADA pré-selecionado: a pessoa escolhe.
function sizePicker(recipientes, state, recompute) {
  const wrap = el('div');
  const single = recipientes.length === 1;
  if (single) state.recipienteId = recipientes[0].id;
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

// Grupo de Base (req+). Açaí em primeiro, mas NADA pré-marcado.
function baseGroup(state) {
  const gb = el('div', { class: 'opt-group' });
  gb.append(groupHead('Base', 'Escolha pelo menos 1. Pode trocar o Açaí ou combinar mais de uma base.', 'req+'));
  M.BASES.forEach((b) => {
    const mark = el('span', { class: 'mark sq', html: state.bases.has(b.id) ? '&#10003;' : '' });
    const row = el('div', { class: 'opt' + (state.bases.has(b.id) ? ' sel' : '') }, [
      el('span', { class: 'oname', text: b.nome }),
      el('span', { class: 'oprice free', text: 'Grátis' }),
      mark,
    ]);
    row.addEventListener('click', () => {
      state.bases.has(b.id) ? state.bases.delete(b.id) : state.bases.add(b.id);
      row.classList.toggle('sel', state.bases.has(b.id));
      mark.innerHTML = state.bases.has(b.id) ? '&#10003;' : '';
      state._recompute && state._recompute();
    });
    gb.append(row);
  });
  return gb;
}

// Grupo de acompanhamentos com stepper (+/-) -> escreve em state.acomp
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

// Grupo de bolas de sorvete com stepper (+/-) -> escreve em state.bolas
function bolasGroup(group, state) {
  const box = el('div', { class: 'opt-group' });
  (group.itens || []).forEach((it) => {
    const nEl = el('span', { class: 'n', text: '0' });
    const minus = el('button', { type: 'button', html: '&minus;', disabled: true });
    const plus = el('button', { type: 'button', html: '+' });
    const row = el('div', { class: 'opt' }, [
      el('span', { class: 'oname', text: it.nome }),
      el('div', { class: 'stepper' }, [minus, nEl, plus]),
    ]);
    const sync = () => { const q = state.bolas.get(it.id) || 0; nEl.textContent = q; minus.disabled = q === 0; row.classList.toggle('sel', q > 0); };
    minus.addEventListener('click', () => { const q = Math.max(0, (state.bolas.get(it.id) || 0) - 1); q ? state.bolas.set(it.id, q) : state.bolas.delete(it.id); sync(); state._recompute(); });
    plus.addEventListener('click', () => { state.bolas.set(it.id, (state.bolas.get(it.id) || 0) + 1); sync(); state._recompute(); });
    box.append(row);
  });
  return box;
}

const totalBolas = (state) => [...state.bolas.values()].reduce((a, b) => a + b, 0);

export function openProduct(item, onAdd) {
  M = menu();
  const { body, foot, destroy } = overlayShell(item);
  const state = { recipienteId: null, tamanhoId: null, bases: new Set(), acomp: new Map(), sabores: new Set(), bolas: new Map(), obs: '', qtd: 1 };
  const temAcomp = item.tipo === 'simples' && item.raw && item.raw.acomp;

  body.append(el('div', { class: 'sheet-title', text: item.tipo === 'combo' ? `Combinado ${item.nome}` : item.nome }));
  if (item.desc) body.append(el('div', { class: 'sheet-desc', text: item.desc }));

  if (item.tipo === 'monte') {
    const g1 = el('div', { class: 'opt-group' }); g1.append(groupHead('Tamanho', null, 'req'), sizePicker(M.RECIPIENTES, state, () => recompute()));
    body.append(g1);
    body.append(baseGroup(state));
    acompGroupsOrdered().forEach((g) => body.append(acompGroup(g, state)));
  } else if (item.tipo === 'combo') {
    const recs = comboRecips();
    const g1 = el('div', { class: 'opt-group' }); g1.append(groupHead('Tamanho', 'Copo ou tigela', 'req'), sizePicker(recs, state, () => recompute()));
    body.append(g1);
    body.append(baseGroup(state));
    const extras = el('div', { class: 'opt-group' });
    extras.append(groupHead('Turbine com acompanhamentos', 'Opcional, soma ao preço', 'opt'));
    body.append(extras);
    acompGroupsOrdered().forEach((g) => body.append(acompGroup(g, state)));
  } else if (item.tipo === 'frape') {
    const g1 = el('div', { class: 'opt-group' }); g1.append(groupHead('Tamanho', null, 'req'), sizePicker([{ id: 'frape', nome: 'Frapê', tamanhos: M.FRAPE.tamanhos }], state, () => recompute()));
    body.append(g1);
    body.append(baseGroup(state));
    acompGroupsOrdered().forEach((g) => body.append(acompGroup(g, state)));
  } else if (item.tipo === 'milkshake') {
    const g1 = el('div', { class: 'opt-group' }); g1.append(groupHead('Tamanho', null, 'req'), sizePicker([{ id: 'milk', nome: 'Milk-shake', tamanhos: M.MILKSHAKE.tamanhos }], state, () => recompute()));
    body.append(g1);
    const gs = el('div', { class: 'opt-group' });
    gs.append(groupHead('Sabores', `1º incluso. Cada sabor a mais: + ${money(M.MILKSHAKE.precoSaborExtra)}`, 'req+'));
    M.MILKSHAKE.sabores.forEach((s) => {
      const mark = el('span', { class: 'mark sq', html: '' });
      const row = el('div', { class: 'opt' }, [el('span', { class: 'oname', text: s.nome }), mark]);
      row.addEventListener('click', () => {
        state.sabores.has(s.id) ? state.sabores.delete(s.id) : state.sabores.add(s.id);
        const on = state.sabores.has(s.id); row.classList.toggle('sel', on); mark.innerHTML = on ? '&#10003;' : '';
        recompute();
      });
      gs.append(row);
    });
    body.append(gs);
  } else if (item.tipo === 'sorvete') {
    // Petit Gateau / Brownie: 1 bola inclusa, cada bola a mais soma; + acompanhamentos opcionais
    const sorveteGroup = M.ACOMPANHAMENTOS.find((g) => g.id === 'sorvetes');
    const extra = item.raw.precoBolaExtra ?? 3.5;
    const gs = bolasGroup(sorveteGroup || { itens: [] }, state);
    gs.prepend(groupHead('Bolas de sorvete', `1 bola já inclusa. Cada bola a mais: + ${money(extra)}`, 'req+'));
    body.append(gs);
    const extras = el('div', { class: 'opt-group' });
    extras.append(groupHead('Turbine com acompanhamentos', 'Opcional, soma ao preço', 'opt'));
    body.append(extras);
    acompGroupsOrdered().filter((g) => g.id !== 'sorvetes').forEach((g) => body.append(acompGroup(g, state)));
  } else if (temAcomp) {
    // Salada de frutas, Fondue: produto com preço base + acompanhamentos opcionais (sem base/tamanho)
    const extras = el('div', { class: 'opt-group' });
    extras.append(groupHead('Adicione acompanhamentos', 'Opcional, soma ao preço', 'opt'));
    body.append(extras);
    acompGroupsOrdered().forEach((g) => body.append(acompGroup(g, state)));
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

  const acompSum = () => { let p = 0; for (const [id, q] of state.acomp) { const a = acompName(id); if (a) p += a.preco * q; } return p; };

  function precoUnit() {
    let p = 0;
    if (item.tipo === 'simples') { p = item.raw.preco; if (temAcomp) p += acompSum(); return p; }
    if (item.tipo === 'combo') p += item.raw.valorBase;
    if (item.tipo === 'monte' || item.tipo === 'combo' || item.tipo === 'frape') {
      const recs = item.tipo === 'combo' ? comboRecips() : item.tipo === 'frape' ? [{ tamanhos: M.FRAPE.tamanhos }] : M.RECIPIENTES;
      const t = recs.flatMap((r) => r.tamanhos).find((x) => x.id === state.tamanhoId);
      if (t) p += t.preco;
      p += acompSum();
    }
    if (item.tipo === 'milkshake') {
      const t = M.MILKSHAKE.tamanhos.find((x) => x.id === state.tamanhoId); if (t) p += t.preco;
      p += Math.max(0, state.sabores.size - 1) * M.MILKSHAKE.precoSaborExtra;
    }
    if (item.tipo === 'sorvete') {
      p += item.raw.preco;
      p += Math.max(0, totalBolas(state) - 1) * (item.raw.precoBolaExtra ?? 3.5);
      p += acompSum();
    }
    return p;
  }
  function valido() {
    if (item.tipo === 'simples') return true;
    if (item.tipo === 'monte' || item.tipo === 'combo' || item.tipo === 'frape') return !!state.tamanhoId && state.bases.size >= 1;
    if (item.tipo === 'milkshake') return !!state.tamanhoId && state.sabores.size >= 1;
    if (item.tipo === 'sorvete') return totalBolas(state) >= 1;
    return !!state.tamanhoId;
  }
  function faltando() {
    if (item.tipo === 'sorvete') return totalBolas(state) < 1 ? 'Escolha pelo menos 1 bola' : '';
    if (!state.tamanhoId && item.tipo !== 'simples') return 'Escolha o tamanho';
    if ((item.tipo === 'monte' || item.tipo === 'combo' || item.tipo === 'frape') && state.bases.size < 1) return 'Escolha pelo menos 1 base';
    if (item.tipo === 'milkshake' && state.sabores.size < 1) return 'Escolha pelo menos 1 sabor';
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
    onAdd(buildLine(item, state, precoUnit(), temAcomp));
    destroy();
  });
}

function buildLine(item, state, unit, temAcomp) {
  // acompanhamentos agrupados por categoria -> [{grupo, itens:['1x Morango', ...]}]
  const grupos = acompGrouped(state).map((g) => ({ grupo: g.grupo, itens: g.itens.map((i) => `${i.qtd}x ${i.nome}`) }));
  const extras = [];          // linhas avulsas (base, sorvete, obs)
  let titulo = item.nome;

  if (item.tipo === 'monte') {
    const t = M.RECIPIENTES.flatMap((r) => r.tamanhos).find((x) => x.id === state.tamanhoId);
    const recip = M.RECIPIENTES.find((r) => r.tamanhos.some((x) => x.id === state.tamanhoId));
    titulo = `${recip.nome} ${t.ml}ml`;
    extras.push(baseLinhaTxt(state));
    if (!grupos.length) extras.push('Sem acompanhamento');
  } else if (item.tipo === 'combo') {
    const recs = comboRecips();
    const t = recs.flatMap((r) => r.tamanhos).find((x) => x.id === state.tamanhoId);
    const recip = recs.find((r) => r.tamanhos.some((x) => x.id === state.tamanhoId));
    titulo = `${recip.nome} ${t.ml}ml`;
    extras.push(baseLinhaTxt(state), `Combinado ${item.nome}`);
    if (item.desc) extras.push(item.desc);
  } else if (item.tipo === 'frape') {
    const t = M.FRAPE.tamanhos.find((x) => x.id === state.tamanhoId);
    titulo = `Frapê ${t.ml}ml`;
    extras.push(baseLinhaTxt(state));
  } else if (item.tipo === 'milkshake') {
    const t = M.MILKSHAKE.tamanhos.find((x) => x.id === state.tamanhoId);
    const nomes = M.MILKSHAKE.sabores.filter((s) => state.sabores.has(s.id)).map((s) => s.nome);
    titulo = `Milk-shake ${t.ml}ml`;
    extras.push(`Sabores: ${nomes.join(' + ')}`);
  } else if (item.tipo === 'sorvete') {
    const svGroup = M.ACOMPANHAMENTOS.find((g) => g.id === 'sorvetes');
    const bolas = [...state.bolas.entries()].map(([id, q]) => { const s = svGroup?.itens.find((x) => x.id === id); return s ? `${q}x ${s.nome}` : null; }).filter(Boolean);
    titulo = item.nome;
    extras.push(`Sorvete: ${bolas.join(', ')}`);
  }
  if (state.obs) extras.push(`Obs: ${state.obs}`);

  // versão compacta em strings (sacola / checkout / WhatsApp)
  const detalhes = [...extras, ...grupos.map((g) => `${g.grupo}: ${g.itens.join(', ')}`)];

  return {
    tipo: item.tipo, refId: item.id, catId: item.catId, nome: titulo,
    precoUnit: Number(unit.toFixed(2)), qtd: state.qtd,
    print: { titulo, extras, grupos, detalhes }, obs: state.obs,
  };
}
