/* CAPI próprio do Açaí: Meta Conversions API server-side, no NOSSO domínio.
   Substitui o papel do Stape (doutrina do molde: "a Function substitui o Stape aqui").

   SEGURANÇA: o navegador manda só { store, order_id, fbp, fbclid }. O VALOR, o
   telefone e os itens NÃO vêm do navegador: a Function busca o pedido real no
   Supabase com a service key. Assim ninguém forja compra nem infla valor. E o
   event_id é determinístico (venda_{order_id}), então replay = o Meta deduplica.

   Env vars (Netlify): SUPABASE_URL, SUPABASE_SERVICE_KEY. (META_CAPI_TOKEN = fallback)
*/
const crypto = require('crypto');

const SUPA_URL = process.env.SUPABASE_URL || '';
const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY || '';

// SHA-256 do valor normalizado (trim + lowercase): como o Meta exige no advanced matching.
const sha256 = (s) => (s == null || s === '' ? null : crypto.createHash('sha256').update(String(s).trim().toLowerCase()).digest('hex'));

const json = (status, body) => ({
  statusCode: status,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  },
  body: JSON.stringify(body || {}),
});

// UF pelo DDD (truque do molde pro campo st do matching).
const DDD_UF = { 11: 'sp', 12: 'sp', 13: 'sp', 14: 'sp', 15: 'sp', 16: 'sp', 17: 'sp', 18: 'sp', 19: 'sp', 21: 'rj', 22: 'rj', 24: 'rj', 27: 'es', 28: 'es', 31: 'mg', 32: 'mg', 34: 'mg', 37: 'mg', 38: 'mg', 41: 'pr', 43: 'pr', 44: 'pr', 47: 'sc', 48: 'sc', 51: 'rs', 53: 'rs', 54: 'rs', 61: 'df', 62: 'go', 71: 'ba', 81: 'pe', 85: 'ce', 91: 'pa' };

// VALOR À PROVA DO FORMATO BR (cicatriz: "8 mil disparou 8 reais").
// O furo clássico: parseFloat("8.000,00") === 8 (para no 2º ponto) e Number("8.000,00") === NaN.
// Aqui o valor vem do banco (numeric = ponto decimal, sem separador de milhar), mas a gente
// NÃO confia: se aparecer vírgula (formato BR), converte explicitamente antes de somar.
// Atenção: sem vírgula, "1.800" é 1.8 (formato do banco), NÃO 1800: por isso o teste da vírgula.
function valorSeguro(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  const s = String(v == null ? '' : v).trim();
  if (!s) return 0;
  const n = /,/.test(s)
    ? Number(s.replace(/\./g, '').replace(',', '.'))   // BR digitado: "8.000,00" -> 8000
    : Number(s);                                       // banco/SQL: "8000.00" -> 8000
  return isFinite(n) ? n : 0;
}

// Teto de sanidade do value: açaí não passa disso. Trava qualquer tentativa de
// inflar a conversão (defesa em profundidade além do recalculo do total no banco).
const VALOR_MAX = 2000;
const capValor = (v) => Math.min(Math.max(valorSeguro(v), 0), VALOR_MAX);

// Telefone canônico E.164 sem "+" (só dígitos, com DDI 55): é o formato que o Meta espera hashear.
function canonico(tel) {
  let d = String(tel || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.length <= 11) d = '55' + d;          // veio sem DDI
  return d;
}
const dddDe = (tel) => { const d = canonico(tel); return d ? d.slice(2, 4) : null; };

// Monta o evento Purchase a partir do PEDIDO REAL do banco (nunca do navegador).
// Separado do handler pra ser testável (padrão do molde: exports.userData).
function montarEvento(o, b, ipAddr, uaStr) {
  b = b || {};
  const atrib = o.atribuicao || {};
  const fbclid = b.fbclid || (atrib.last && atrib.last.fbclid) || (atrib.first && atrib.first.fbclid) || null;

  const nome = String(o.customer_name || '').trim().split(/\s+/);
  const tel = canonico(o.customer_phone);
  const ud = {};
  if (ipAddr) ud.client_ip_address = ipAddr;
  if (uaStr) ud.client_user_agent = uaStr;
  if (tel) ud.ph = [sha256(tel)];
  if (nome[0]) ud.fn = [sha256(nome[0])];
  if (nome.length > 1) ud.ln = [sha256(nome[nome.length - 1])];
  ud.ct = [sha256('votuporanga')];
  ud.st = [sha256('sp')];            // loja de Votuporanga/SP: st fixo coerente com o ct fixo
  ud.country = [sha256('br')];
  // external_id = id ESTÁVEL do cliente (uid do navegador). Costura a jornada e sobe a
  // EMQ; cai pro id do pedido só se o navegador não mandar (ex: reenvio manual).
  ud.external_id = [sha256(b.external_id || o.id)];
  if (b.fbp) ud.fbp = b.fbp;
  if (b.fbc) ud.fbc = b.fbc;
  else if (fbclid) ud.fbc = 'fb.1.' + Date.now() + '.' + fbclid;

  const itens = Array.isArray(o.items) ? o.items : [];
  const custom = {
    currency: 'BRL',
    value: capValor(o.total),
    order_id: String(o.id),          // uuid do pedido (igual ao transaction_id do Pixel; não colide entre dias)
    contents: itens.map((i) => ({ id: String(i.refId || i.id || i.nome || 'item'), quantity: Number(i.qtd) || 1, item_price: valorSeguro(i.precoUnit) })),
  };
  if (itens.length) custom.content_name = itens.map((i) => i.prodNome || i.nome).filter(Boolean).join(', ').slice(0, 200);

  return {
    event_name: 'Purchase',
    event_id: 'venda_' + o.id,       // determinístico: dedup com o Pixel + replay não infla
    event_time: Math.floor(new Date(o.created_at || Date.now()).getTime() / 1000),
    action_source: 'website',        // website (NÃO system_generated): só assim o Meta EXIBE em Testar Eventos
    event_source_url: b.event_source_url || 'https://acaimaisaborvotu.com.br/',
    user_data: ud,
    custom_data: custom,
  };
}

// GA4 -> Meta. Purchase FORA de propósito: compra só entra pelo caminho autoritativo
// (order_id -> valor lido do banco). Assim ninguém forja/infla venda pelo modo genérico.
const EVENTOS_META = { page_view: 'PageView', view_item: 'ViewContent', add_to_cart: 'AddToCart', begin_checkout: 'InitiateCheckout', add_payment_info: 'AddPaymentInfo', search: 'Search', generate_lead: 'Lead' };

// Evento do funil (meio/topo) espelhado do navegador. O event_id é o MESMO do Pixel
// (DL - event_id) -> o Meta deduplica. Não tem dado sensível de dinheiro aqui.
function montarEventoGenerico(b, ipAddr, uaStr) {
  b = b || {};
  const name = EVENTOS_META[b.event_name];
  if (!name || !b.event_id) return null;
  const ud = {};
  if (ipAddr) ud.client_ip_address = ipAddr;
  if (uaStr) ud.client_user_agent = uaStr;
  const u = b.user_data || {};
  const tel = canonico(u.phone || u.phone_number);
  if (tel) ud.ph = [sha256(tel)];
  if (u.first_name) ud.fn = [sha256(u.first_name)];
  if (u.last_name) ud.ln = [sha256(u.last_name)];
  ud.country = [sha256('br')];
  if (b.external_id) ud.external_id = [sha256(b.external_id)];   // mesmo id estável do funil/Purchase
  if (b.fbp) ud.fbp = b.fbp;
  if (b.fbc) ud.fbc = b.fbc;
  else if (b.fbclid) ud.fbc = 'fb.1.' + Date.now() + '.' + b.fbclid;
  const ev = {
    event_name: name,
    event_id: b.event_id,          // MESMO id do Pixel -> dedup
    event_time: Math.floor(Date.now() / 1000),
    action_source: 'website',
    event_source_url: b.event_source_url || 'https://acaimaisaborvotu.com.br/',
    user_data: ud,
  };
  const cd = {};
  if (b.value != null && b.value !== '') cd.value = capValor(b.value);
  if (b.currency) cd.currency = b.currency;
  if (Array.isArray(b.contents) && b.contents.length) cd.contents = b.contents.map((c) => ({ id: String(c.id || 'item'), quantity: Number(c.quantity) || 1, item_price: valorSeguro(c.item_price) }));
  if (b.content_name) cd.content_name = String(b.content_name).slice(0, 200);
  if (Object.keys(cd).length) ev.custom_data = cd;
  return ev;
}

async function supa(path, opts) {
  const r = await fetch(SUPA_URL + '/rest/v1' + path, {
    ...(opts || {}),
    headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json', ...((opts || {}).headers || {}) },
  });
  return r;
}
const supaJson = async (path) => { try { const r = await supa(path); return await r.json(); } catch (e) { return []; } };

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return json(200, {});
  if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'POST only' });
  if (!SUPA_URL || !SUPA_KEY) return json(500, { ok: false, error: 'SUPABASE_URL/SUPABASE_SERVICE_KEY ausentes no Netlify' });

  if (!origemOk(event)) return json(403, { ok: false, error: 'origem nao autorizada' });

  let b; try { b = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { ok: false, error: 'json invalido' }); }
  const store = String(b.store || '').trim();
  if (!store) return json(400, { ok: false, error: 'store ausente' });

  // 1) Config (pixel + token + versão + test code). Só a service key lê esta tabela.
  //    Lê a resposta CRUA pra saber o PORQUÊ quando falha (401 = service key errada;
  //    array vazio = RLS sem bypass / store errada; linha sem pixel/token = falta salvar).
  const cfgResp = await supa('/capi_config?store_slug=eq.' + encodeURIComponent(store) + '&select=*');
  const cfgBody = await cfgResp.json().catch(() => null);
  const cfg = (Array.isArray(cfgBody) && cfgBody[0]) || {};
  const token = cfg.capi_token || process.env.META_CAPI_TOKEN || '';
  if (!cfg.pixel_id || !token) {
    let motivo;
    if (cfgResp.status === 401 || cfgResp.status === 403) motivo = 'a SUPABASE_SERVICE_KEY parece errada/incompleta (Supabase respondeu ' + cfgResp.status + '). Confira se colou a chave service_role inteira no Netlify.';
    else if (cfgResp.status >= 400) motivo = 'Supabase respondeu ' + cfgResp.status + ': ' + JSON.stringify(cfgBody).slice(0, 160);
    else if (Array.isArray(cfgBody) && !cfgBody.length) motivo = 'a Function leu 0 linhas de capi_config (store "' + store + '"): service key sem bypass de RLS ou store diferente.';
    else if (!cfg.pixel_id) motivo = 'falta o Pixel ID (salve no painel).';
    else motivo = 'falta o token do CAPI (salve no painel).';
    return json(400, { ok: false, error: 'pixel_id/capi_token nao configurados no painel', motivo, supabase_status: cfgResp.status });
  }

  // 2) Teste de conexão (botão do painel): dispara um evento fake e devolve a resposta crua.
  if (b.teste) {
    const ev = {
      event_name: 'TestEvent', event_id: 'teste_' + Date.now(),
      event_time: Math.floor(Date.now() / 1000), action_source: 'website',
      event_source_url: b.event_source_url || 'https://acaimaisaborvotu.com.br/',
      user_data: { client_ip_address: ip(event), client_user_agent: ua(event), external_id: [sha256('teste-painel')] },
    };
    const r = await enviar(cfg, token, ev);
    await logar(store, null, ev, r, 'teste');
    return r.status >= 200 && r.status < 300 ? json(200, { ok: true, meta: r.body }) : json(502, { ok: false, meta_status: r.status, meta: r.body });
  }

  // 3) Evento do funil (page_view/view_item/add_to_cart/begin_checkout/...): encaminha
  //    o que o navegador espelhou, com o MESMO event_id do Pixel. Purchase NÃO passa aqui
  //    (é filtrado no mapa): compra só pelo caminho autoritativo do order_id abaixo.
  if (!b.order_id && b.event_name) {
    const ev = montarEventoGenerico(b, ip(event), ua(event));
    if (!ev) return json(200, { ok: true, skipped: 'evento nao mapeado (ou purchase pelo caminho errado)' });
    const rg = await enviar(cfg, token, ev);
    await logar(store, null, ev, rg, 'site');
    return rg.status >= 200 && rg.status < 300 ? json(200, { ok: true, meta_status: rg.status }) : json(502, { ok: false, meta_status: rg.status, meta: rg.body });
  }

  // 4) Purchase real: busca o PEDIDO no banco (nunca confia no valor vindo do navegador).
  const orderId = String(b.order_id || '').trim();
  if (!orderId) return json(400, { ok: false, error: 'order_id ou event_name ausente' });
  const pedidos = await supaJson('/orders?id=eq.' + encodeURIComponent(orderId) + '&store_slug=eq.' + encodeURIComponent(store) + '&select=*');
  const o = (Array.isArray(pedidos) && pedidos[0]) || null;
  if (!o) return json(404, { ok: false, error: 'pedido nao encontrado' });
  if (o.status === 'cancelado') return json(200, { ok: true, skipped: 'pedido cancelado' });

  const evento = montarEvento(o, b, ip(event), ua(event));
  const r = await enviar(cfg, token, evento);
  await logar(store, o.id, evento, r, 'site');
  // Falha do Meta = 502 (nunca "200 OK" falso: cicatriz do molde).
  return r.status >= 200 && r.status < 300 ? json(200, { ok: true, meta_status: r.status }) : json(502, { ok: false, meta_status: r.status, meta: r.body });
};

function ip(event) {
  const h = event.headers || {};
  return (h['x-nf-client-connection-ip'] || String(h['x-forwarded-for'] || '').split(',')[0] || '').trim() || undefined;
}
const ua = (event) => (event.headers || {})['user-agent'] || undefined;

// Só aceita chamada do próprio site/painel. Sem isso a Function vira open relay:
// qualquer um POSTando eventos forjados no dataset do Meta. O navegador manda
// Origin/Referer em toda requisição de mesma origem; se nenhum bater, recusa.
// Aceita (a) o domínio de produção OU (b) a MESMA origem do próprio site (host da
// requisição). O (b) cobre teste na URL crua *.netlify.app e o domínio custom sem
// precisar hardcode, e continua barrando qualquer origem de fora.
const ORIGEM_OK = /^https:\/\/(www\.)?acaimaisaborvotu\.com\.br(\/|$)/i;
const hostDe = (u) => { try { return new URL(u).host; } catch (e) { return ''; } };
function origemOk(event) {
  const h = event.headers || {};
  const org = h.origin || h.referer || '';
  if (!org) return false;
  if (ORIGEM_OK.test(org)) return true;
  return !!h.host && hostDe(org) === h.host;   // mesma origem do próprio site
}

// POST pro Meta. O test_event_code só entra se ainda NÃO EXPIROU (anti-TEST16403).
async function enviar(cfg, token, evento) {
  const ver = cfg.graph_api_version || 'v21.0';
  const url = 'https://graph.facebook.com/' + ver + '/' + cfg.pixel_id + '/events?access_token=' + encodeURIComponent(token);
  const payload = { data: [evento] };
  const testAtivo = cfg.test_event_code && cfg.test_expira_em && new Date(cfg.test_expira_em) > new Date();
  if (testAtivo) payload.test_event_code = cfg.test_event_code;
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const body = await r.json().catch(() => ({}));
    return { status: r.status, body };
  } catch (e) { return { status: 0, body: { error: String(e) } }; }
}

// exportados pros testes (tests/capi.test.js)
exports.montarEvento = montarEvento;
exports.montarEventoGenerico = montarEventoGenerico;
exports.canonico = canonico;
exports.sha256 = sha256;
exports.valorSeguro = valorSeguro;

// Recibo de entrega: grava o que saiu e o que o Meta respondeu. Nunca trava o fluxo.
async function logar(store, orderId, evento, r, fonte) {
  try {
    await supa('/capi_log', {
      method: 'POST', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ store_slug: store, order_id: orderId, event_name: evento.event_name, event_id: evento.event_id, payload: evento, response: r.body, status_code: r.status, fonte }),
    });
  } catch (e) {}
}
