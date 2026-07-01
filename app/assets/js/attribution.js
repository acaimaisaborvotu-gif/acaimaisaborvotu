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
const KEY_SESSION = 'ams_session';    // id da visita (pro funil pageview -> carrinho -> compra)

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
  } catch (e) {}
}

// Devolve { first, last } pro checkout anexar ao pedido.
export function getAttribution() {
  const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const first = read(KEY_FIRST), last = read(KEY_LAST) || first;
  if (!first && !last) return null;
  return { first, last };
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
