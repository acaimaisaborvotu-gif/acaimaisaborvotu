// =============================================================================
// CAMADA DE DADOS
// Lê do Supabase quando configurado; senão usa o seed local (menu-data.js).
// Expõe: loja, configurações, catálogo, horário, tempo dinâmico, envio de pedido.
// =============================================================================

import { CONFIG, hasSupabase } from './config.js';
import * as SEED from './menu-data.js';
import { hmToMin } from './util.js';

// Menu/configurações hidratados do Supabase (quando conectado). Senão, usa o seed.
let MENU = null;
let SETTINGS_HYDRATED = null;
// Cache local: na 1a tela já mostra o último cardápio salvo (abre instantâneo)
const CACHE_KEY = 'ams_cache_v1';
try { const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); if (c) { MENU = c.menu || null; SETTINGS_HYDRATED = c.settings || null; } } catch (e) {}

const SEED_MENU = () => ({
  RECIPIENTES: SEED.RECIPIENTES, BASES: SEED.BASES, ACOMPANHAMENTOS: SEED.ACOMPANHAMENTOS,
  COMBOS: SEED.COMBOS, DESTAQUES: SEED.DESTAQUES, FRAPE: SEED.FRAPE, MILKSHAKE: SEED.MILKSHAKE,
  SALADAS: SEED.SALADAS, SOBREMESAS: SEED.SOBREMESAS, BEBIDAS: SEED.BEBIDAS,
  CATEGORIAS: SEED.CATEGORIAS, FOTOS_SEED: SEED.FOTOS_SEED, categoriaFotos: SEED.CATEGORIA_FOTOS, esgotados: [],
});

// Catálogo corrente (hidratado ou seed). Os modais leem daqui.
export function menu() { return MENU || SEED_MENU(); }
export const RAW = { get RECIPIENTES() { return menu().RECIPIENTES; }, get BASES() { return menu().BASES; }, get ACOMPANHAMENTOS() { return menu().ACOMPANHAMENTOS; }, get FRAPE() { return menu().FRAPE; }, get MILKSHAKE() { return menu().MILKSHAKE; } };

// Busca menu + settings do Supabase. Chame antes de renderizar o cardápio.
export async function hydrate() {
  if (!hasSupabase()) return;
  try {
    const client = await sb();
    const { data } = await client.from('store_config').select('menu, settings').eq('store_slug', CONFIG.STORE_ID).maybeSingle();
    if (data?.menu) MENU = data.menu;
    if (data?.settings) SETTINGS_HYDRATED = data.settings;
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ menu: MENU, settings: SETTINGS_HYDRATED })); } catch (e) {}
  } catch (e) { console.warn('hydrate falhou, usando cache/seed', e); }
}

// ---- Supabase (carregado sob demanda) ----
let _sb = null;
export async function sb() {
  if (!hasSupabase()) return null;
  if (_sb) return _sb;
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  _sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
  return _sb;
}

// ---- Loja e configurações ----
export function getStore() { return SEED.STORE; }
export function getSettings() {
  return { ...SEED.SETTINGS, ...(SETTINGS_HYDRATED || {}) };
}

// ---- Horário de funcionamento ----
export function isOpenNow(settings = getSettings(), now = new Date()) {
  const h = settings.horarios?.[now.getDay()];
  if (!h) return false;
  const mins = now.getHours() * 60 + now.getMinutes();
  const abre = hmToMin(h.abre), fecha = hmToMin(h.fecha);
  return fecha > abre ? mins >= abre && mins < fecha : mins >= abre || mins < fecha;
}
export function nextOpenLabel(settings = getSettings(), now = new Date()) {
  for (let i = 0; i < 7; i++) {
    const d = (now.getDay() + i) % 7;
    const h = settings.horarios?.[d];
    if (!h) continue;
    if (i === 0 && isOpenNow(settings, now)) return null;
    const dias = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
    if (i === 0) return `hoje às ${h.abre}`;
    if (i === 1) return `amanhã às ${h.abre}`;
    return `${dias[d]} às ${h.abre}`;
  }
  return null;
}

// ---- Tempo de entrega dinâmico ----
export function tempoEntrega(openOrders = 0, settings = getSettings()) {
  const extras = Math.floor(openOrders / Math.max(1, settings.tempoIncrementoCadaPedidos)) * settings.tempoIncrementoMin;
  return { min: settings.tempoBaseMin + extras, max: settings.tempoBaseMax + extras };
}

// ---- Preços ----
const recipMin = () => Math.min(...menu().RECIPIENTES.flatMap((r) => r.tamanhos.map((t) => t.preco)));
const comboSizes = () => menu().RECIPIENTES.filter((r) => r.id === 'copo' || r.id === 'tigela');
const comboMinSize = () => Math.min(...comboSizes().flatMap((r) => r.tamanhos.map((t) => t.preco)));

export function comboFrom(combo) { return combo.valorBase + comboMinSize(); }

// ---- Estoque (esgotados): vem do menu hidratado ----
function soldOutSet() { return new Set(menu().esgotados || []); }

// ---- Catálogo pronto para render ----
const EMOJI = { destaques: '🍧', combinados: '🍧', monte: '🍨', frapes: '🥤', saladas: '🥣', milkshakes: '🥤', sobremesas: '🍫', bebidas: '🧃' };

export function buildCatalog() {
  const src = menu();
  const out = soldOutSet();
  const fotos = src.FOTOS_SEED || {};
  const catFotos = src.categoriaFotos || {};
  const combosById = Object.fromEntries((src.COMBOS || []).map((c) => [c.id, c]));
  // Combinados: Ninho Trufado sempre primeiro (mais vendido)
  const combosOrdenados = [...(src.COMBOS || [])].sort((a, b) =>
    a.id === 'ninho-trufado' ? -1 : b.id === 'ninho-trufado' ? 1 : 0);
  const cats = [];

  for (const cat of (src.CATEGORIAS || SEED.CATEGORIAS)) {
    let items = [];
    if (cat.id === 'destaques') {
      items = (src.DESTAQUES || []).map((id) => combosById[id]).filter(Boolean).map((c) => ({
        id: c.id, nome: c.nome, desc: c.desc, tipo: 'combo', catId: cat.id,
        foto: fotos[c.id] || null, precoFrom: comboFrom(c), raw: c,
      }));
    } else if (cat.id === 'combinados') {
      items = combosOrdenados.map((c) => ({
        id: c.id, nome: c.nome, desc: c.desc, tipo: 'combo', catId: cat.id,
        foto: fotos[c.id] || null, precoFrom: comboFrom(c), raw: c,
      }));
    } else if (cat.id === 'monte') {
      items = [{
        id: 'monte', nome: 'Monte Seu Açaí', tipo: 'monte', catId: cat.id,
        desc: 'Escolha o recipiente, o tamanho, a base e os acompanhamentos do seu jeito',
        foto: null, precoFrom: recipMin(), raw: null,
      }];
    } else if (cat.id === 'frapes') {
      const f = src.FRAPE;
      items = [{ id: f.id, nome: f.nome, desc: f.desc, tipo: 'frape', catId: cat.id,
        foto: fotos.frape || null, precoFrom: Math.min(...f.tamanhos.map((t) => t.preco)), raw: f }];
    } else if (cat.id === 'milkshakes') {
      const ms = src.MILKSHAKE;
      items = [{ id: ms.id, nome: ms.nome, desc: ms.desc, tipo: 'milkshake', catId: cat.id,
        foto: fotos[ms.id] || null, precoFrom: Math.min(...ms.tamanhos.map((t) => t.preco)), raw: ms }];
    } else if (cat.id === 'saladas') {
      items = (src.SALADAS || []).map((s) => ({ id: s.id, nome: s.nome, desc: s.desc, tipo: 'simples', catId: cat.id,
        foto: fotos[s.id] || fotos['salada-verao'] || null, precoFrom: s.preco, raw: s }));
    } else if (cat.id === 'sobremesas') {
      items = (src.SOBREMESAS || []).map((s) => ({ id: s.id, nome: s.nome, desc: s.desc || '', tipo: 'simples', catId: cat.id,
        foto: fotos[s.id] || null, precoFrom: s.preco, raw: s }));
    } else if (cat.id === 'bebidas') {
      items = (src.BEBIDAS || []).map((s) => ({ id: s.id, nome: s.nome, desc: s.desc || '', tipo: 'simples', catId: cat.id,
        foto: fotos[s.id] || null, precoFrom: s.preco, raw: s }));
    }
    items.forEach((it) => { it.esgotado = out.has(it.id); it.emoji = EMOJI[cat.id] || '🍧'; });
    cats.push({ ...cat, foto: catFotos[cat.id] || null, items });
  }
  return cats;
}

// ---- Envio de pedido ----
// order: { customer, items, totals, payment, delivery, whatsappText }
export async function submitOrder(order) {
  if (hasSupabase()) {
    const client = await sb();
    const p = {
      store_slug: CONFIG.STORE_ID,
      customer_name: order.customer.nome,
      customer_phone: order.customer.telefone,
      delivery_type: order.delivery.tipo,
      address: order.delivery.endereco || null,
      payment_method: order.payment.metodo,
      change_for: order.payment.trocoPara || null,
      subtotal: order.totals.subtotal,
      delivery_fee: order.totals.taxa,
      total: order.totals.total,
      items: order.items,
      eta_min: order.delivery.etaMin,
      eta_max: order.delivery.etaMax,
    };
    const { data, error } = await client.rpc('place_order', { p });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return { ok: true, via: 'supabase', id: row.id, numero: row.daily_number };
  }
  // Fallback: envia por WhatsApp
  const url = `https://wa.me/${CONFIG.WHATSAPP_FALLBACK}?text=${encodeURIComponent(order.whatsappText)}`;
  window.open(url, '_blank');
  return { ok: true, via: 'whatsapp' };
}

// ---- Realtime (reflete mudanças do painel no cardápio) ----
export async function subscribe(table, cb) {
  const client = await sb();
  if (!client) return null;
  return client.channel(`rt-${table}`)
    .on('postgres_changes', { event: '*', schema: 'public', table }, cb)
    .subscribe();
}
