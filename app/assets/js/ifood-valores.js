// =============================================================================
// Pedido do iFood com o VALOR DO CARDÁPIO DA LOJA (24/11/2026, pedido do Djalma).
//
// Conferido no cardápio do iFood inteiro (24/11/2026, Portal do Parceiro + página da loja):
// todo produto e todo acompanhamento do iFood = cardápio digital x 1,2. EXCEÇÃO: o TAMANHO
// dentro dos Combinados (400ml pra cima o iFood cobra menos que x 1,2; no Floresta Negra é
// outra tabela). Por isso o cálculo é parte por parte:
//   Combinado X   -> valorBase do cardápio + tamanho pelo preço do cardápio + extras do iFood / 1,2
//   qualquer outro -> preço do iFood / 1,2 (base e cada complemento)
//   entrega        -> taxa da loja para o bairro do cliente (a mesma tabela do cardápio digital)
//   total          -> produtos + entrega   (a taxa de serviço do iFood não entra)
// O valor do iFood continua no banco, intacto, só para consulta.
// Pedido antigo, gravado antes do robô guardar o preço de cada parte (ifoodPrecos):
// combinado sem extra sai pelo nome; o resto / 1,2, marcado "confira" se o nome não bater.
// =============================================================================

export const FATOR_IFOOD = 1.2;

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();

// Bairro: a exceção da tabela que aparece no endereço; senão a taxa padrão.
// (Mesma regra de tolerância do cardápio digital: matchBairro em data.js.)
export function taxaLoja(order, settings = {}) {
  if (order.delivery_type === 'retirada') return 0;
  const end = norm(String(order.address || '').split(' | Obs:')[0].replace(/\(Ref:[^)]*\)/g, ' '));   // observação e referência não contam
  for (const e of settings.taxasBairro || []) {
    const b = norm(e.bairro);
    if (b && (' ' + end + ' ').includes(' ' + b + ' ')) return r2(e.taxa);
  }
  return r2(settings.taxaEntrega);
}

// Preço do item pelo NOME no cardápio digital (só para conferir). null = não sei calcular.
function precoPeloNome(it, menu = {}) {
  const nome = norm(it.nome);
  const opcoes = (it.blocos || []).filter((b) => b.t === 'sec').flatMap((b) => b.itens || []).map((x) => norm(String(x).replace(/^\s*\d+x\s+/, '')));
  // Combinado X + tamanho (copo/tigela N ml)
  const m = nome.match(/^combinado (.+)$/);
  if (m) {
    const combo = (menu.COMBOS || []).find((c) => norm(c.nome) === m[1]);
    if (!combo) return null;
    let tam = null;
    for (const r of menu.RECIPIENTES || []) for (const t of r.tamanhos || []) {
      if (opcoes.includes(norm(r.nome + ' ' + t.ml + 'ml'))) tam = t.preco;
    }
    if (tam == null) return null;
    // Algum extra pago? Então não dá pra conferir só pelo nome.
    const extras = opcoes.filter((o) => !/^(copo|tigela) \d+ml$/.test(o) && !(menu.BASES || []).some((b) => norm(b.nome) === o));
    if (extras.length) return null;
    return r2(Number(combo.valorBase) + Number(tam));
  }
  // Produto simples (bebida, salada, sobremesa) sem opções
  if (!opcoes.length) {
    for (const k of ['BEBIDAS', 'SALADAS', 'SOBREMESAS']) {
      const p = (menu[k] || []).find((x) => norm(x.nome) === nome);
      if (p) return r2(p.preco);
    }
  }
  return null;
}

const tamanhoCombo = (nomeOpcao, menu) => {
  const o = norm(nomeOpcao).replace(/(\d) (\d{3}) ?ml$/, '$1$2ml').replace(/ ml$/, 'ml');   // "1.100ml" / "300 ml"
  for (const r of menu.RECIPIENTES || []) for (const t of r.tamanhos || []) {
    if (o === norm(r.nome + ' ' + t.ml + 'ml').replace(/ ml$/, 'ml')) return Number(t.preco);
  }
  return null;
};
const ehBase = (nomeOpcao, menu) => (menu.BASES || []).some((b) => norm(b.nome) === norm(nomeOpcao));

// Preço de UMA unidade do item no cardápio da loja. { preco, confira }
function precoLojaItem(it, menu = {}) {
  const pc = it.ifoodPrecos;
  if (pc && Array.isArray(pc.opcoes)) {
    const m = norm(it.nome).match(/^combinado (.+)$/);
    const combo = m ? (menu.COMBOS || []).find((c) => norm(c.nome) === m[1]) : null;
    let total = combo ? Number(combo.valorBase) : Number(pc.base) / FATOR_IFOOD;
    let confira = !!m && !combo;   // diz "Combinado" mas não existe no cardápio digital
    for (const op of pc.opcoes) {
      if (combo) {
        const tam = tamanhoCombo(op.nome, menu);
        if (tam != null) { total += tam; continue; }
        if (ehBase(op.nome, menu)) continue;   // base do combinado é inclusa
      }
      total += Number(op.preco) / FATOR_IFOOD;
    }
    return { preco: r2(total), confira };
  }
  const loja = r2(Number(it.precoUnit) / FATOR_IFOOD);
  const pelo = precoPeloNome(it, menu);
  if (pelo != null) return { preco: pelo, confira: false };
  return { preco: loja, confira: /^combinado /.test(norm(it.nome)) };   // combinado com extra, sem os preços das partes
}

// Valores do pedido para a LOJA. Pedido do site volta como está.
export function valoresLoja(order, { menu = {}, settings = {} } = {}) {
  if (order.canal !== 'ifood') {
    return { ifood: false, itens: order.items || [], subtotal: r2(order.subtotal), entrega: r2(order.delivery_fee), total: r2(order.total), confira: [] };
  }
  const confira = [];
  const itens = (order.items || []).map((it) => {
    const { preco, confira: c } = precoLojaItem(it, menu);
    if (c) confira.push(it.nome);
    return { ...it, precoIfood: r2(it.precoUnit), precoUnit: preco, confira: c };
  });
  const subtotal = r2(itens.reduce((s, it) => s + it.precoUnit * (Number(it.qtd) || 1), 0));
  const entrega = taxaLoja(order, settings);
  return {
    ifood: true, itens, subtotal, entrega, total: r2(subtotal + entrega), confira,
    ifoodTotal: r2(order.total), ifoodSubtotal: r2(order.subtotal), ifoodEntrega: r2(order.delivery_fee),
  };
}

// Cópia do pedido com os valores da loja (para imprimir e somar no relatório).
export function pedidoComValorLoja(order, ctx) {
  const v = valoresLoja(order, ctx);
  if (!v.ifood) return order;
  return { ...order, items: v.itens, subtotal: v.subtotal, delivery_fee: v.entrega, total: v.total, discount: 0, _valoresLoja: v };
}
