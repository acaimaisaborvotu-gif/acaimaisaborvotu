// =============================================================================
// ATRIBUIÇÃO DE PRIMEIRA PARTE
// Captura DE ONDE a pessoa veio (UTM dos anúncios, fbclid, ou os links bonitos
// /pedidos, /faca-seu-pedido, etc.) e guarda no aparelho dela. A origem fica
// salva ATÉ ela comprar — mesmo que navegue, feche e volte. Não depende de manter
// a UTM na URL. Depois o pedido leva a origem junto (checkout -> Supabase).
// Isso é 100% nosso: valor e origem reais, sem depender do Meta.
// =============================================================================
import { sb } from './data.js';
import { CONFIG, hasSupabase } from './config.js';

const KEY_FIRST = 'ams_atrib_first';  // primeiro toque (não sobrescreve)
const KEY_LAST = 'ams_atrib_last';    // último toque com origem clara (last non-direct click)
const KEY_PATH = 'ams_atrib_path';    // JORNADA: todos os toques com origem clara (1º, 2º, 3º...)
const KEY_SESSION = 'ams_session';    // id da visita (pro funil pageview -> carrinho -> compra)
const PATH_MAX = 12;                  // guarda no máx. os últimos 12 toques (não estoura o storage)

const readJson = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };

const clip = (s) => (s == null ? null : String(s).trim().slice(0, 160) || null);

// Lê os parâmetros da URL (UTM + click ids). Retorna null se não houver nenhum.
function fromUrl() {
  const p = new URLSearchParams(location.search);
  const o = {
    source: clip(p.get('utm_source')),
    medium: clip(p.get('utm_medium')),
    campaign: clip(p.get('utm_campaign')),
    content: clip(p.get('utm_content')),
    term: clip(p.get('utm_term')),
    fbclid: clip(p.get('fbclid')),
    gclid: clip(p.get('gclid')),
  };
  return Object.values(o).some(Boolean) ? o : null;
}

// Sem UTM: tenta inferir pela origem do clique (referrer). "direto" = digitou/salvou.
function fromReferrer() {
  const ref = document.referrer || '';
  if (!ref) return null;
  // Navegação DENTRO do próprio site (mesmo domínio) não é uma nova origem.
  try { if (new URL(ref).host === location.host) return null; } catch (e) {}
  if (/instagram\.com/i.test(ref)) return { source: 'instagram', medium: 'organico' };
  if (/facebook\.com|fb\.com|fb\.me/i.test(ref)) return { source: 'facebook', medium: 'organico' };
  if (/google\./i.test(ref)) return { source: 'google', medium: 'organico' };
  if (/wa\.me|whatsapp|l\.wl\.co/i.test(ref)) return { source: 'whatsapp', medium: 'organico' };
  if (/bing\.|duckduckgo|yahoo/i.test(ref)) return { source: 'busca', medium: 'organico' };
  return { source: 'outro', medium: 'referral' };
}

// Roda no carregamento do cardápio (o mais cedo possível). Idempotente.
export function captureAttribution() {
  try {
    const now = fromUrl() || fromReferrer();
    const stamp = { ...(now || { source: 'direto', medium: 'nenhum' }), landing: location.pathname, ts: Date.now() };
    // Primeiro toque: grava só uma vez (nunca sobrescreve).
    if (!localStorage.getItem(KEY_FIRST)) localStorage.setItem(KEY_FIRST, JSON.stringify(stamp));
    // Último toque: sobrescreve quando veio com origem clara (last non-direct click).
    // Visita "direta" NÃO apaga uma origem boa anterior — a campanha mantém o crédito.
    if (now) localStorage.setItem(KEY_LAST, JSON.stringify(stamp));
    else if (!localStorage.getItem(KEY_LAST)) localStorage.setItem(KEY_LAST, JSON.stringify(stamp));
    // Jornada: só toques com origem CLARA entram (direto é volta, não é toque novo).
    // Não repete o mesmo toque seguido; guarda no máximo os últimos PATH_MAX.
    if (now) {
      const t = { source: stamp.source, medium: stamp.medium || null, campaign: stamp.campaign || null, content: stamp.content || null, ts: stamp.ts, landing: stamp.landing };
      let path = readJson(KEY_PATH); if (!Array.isArray(path)) path = [];
      const prev = path[path.length - 1];
      const igual = prev && prev.source === t.source && prev.medium === t.medium && prev.campaign === t.campaign && prev.content === t.content;
      if (!igual) { path.push(t); if (path.length > PATH_MAX) path = path.slice(-PATH_MAX); localStorage.setItem(KEY_PATH, JSON.stringify(path)); }
    }
  } catch (e) {}
}

// Devolve { first, last, path } pro checkout anexar ao pedido.
// path = a jornada (1º, 2º, 3º... toque com origem clara). Quando há jornada,
// first = path[0] e last = último toque (bate com o que o painel desenha). Só quando
// a pessoa nunca teve um toque claro (só visita direta) é que cai no KEY_FIRST/LAST.
export function getAttribution() {
  let path = readJson(KEY_PATH); if (!Array.isArray(path)) path = [];
  const first = path.length ? path[0] : readJson(KEY_FIRST);
  const last = path.length ? path[path.length - 1] : (readJson(KEY_LAST) || readJson(KEY_FIRST));
  if (!first && !last && !path.length) return null;
  return { first, last, path };
}

// Zera a jornada DEPOIS de uma compra: o próximo pedido do mesmo aparelho começa
// uma jornada nova (senão os toques da compra passada vazam pro pedido seguinte).
export function clearAttribution() {
  try { [KEY_FIRST, KEY_LAST, KEY_PATH, KEY_SESSION].forEach((k) => localStorage.removeItem(k)); } catch (e) {}
}

// Id da visita (fica no aparelho). Serve pra ligar pageview -> carrinho no funil.
function sessionId() {
  let s = null;
  try { s = localStorage.getItem(KEY_SESSION); } catch (e) {}
  if (!s) { s = 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); try { localStorage.setItem(KEY_SESSION, s); } catch (e) {} }
  return s;
}

// Registra no banco a visita (pageview) e o add ao carrinho, com a origem.
// Best-effort: NUNCA trava o cardápio. Alimenta o funil por origem no painel.
export async function trackVisit(event) {
  if (!hasSupabase()) return;
  try {
    const client = await sb();
    await client.rpc('track_visit', { p_store: CONFIG.STORE_ID, p_session: sessionId(), p_atrib: getAttribution(), p_event: event });
  } catch (e) {}
}
