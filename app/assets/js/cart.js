// Carrinho (sacola) — estado + persistência local
import { uid } from './util.js';

const KEY = 'ams_cart';
let items = load();
const listeners = new Set();

function load() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } }
function save() { localStorage.setItem(KEY, JSON.stringify(items)); listeners.forEach((f) => f(items)); }

export function onChange(f) { listeners.add(f); return () => listeners.delete(f); }
export function getItems() { return items; }
export function count() { return items.reduce((s, i) => s + i.qtd, 0); }
export function subtotal() { return items.reduce((s, i) => s + i.precoUnit * i.qtd, 0); }
export function totalItens() { return count(); }

export function add(line) {
  line.uid = uid();
  line.qtd = line.qtd || 1;
  items.push(line);
  save();
  return line;
}
export function setQty(u, qtd) {
  const it = items.find((i) => i.uid === u);
  if (!it) return;
  it.qtd = qtd;
  if (qtd <= 0) items = items.filter((i) => i.uid !== u);
  save();
}
export function remove(u) { items = items.filter((i) => i.uid !== u); save(); }
export function clear() { items = []; save(); }

// Carrinho salvo no aparelho com preços de outra versão do cardápio é descartado.
// Chamar só com o cardápio FRESCO (depois do hydrate), nunca com o cache.
// Primeira vez (sem versão salva) também descarta: é carrinho de antes desta trava.
const VKEY = 'ams_cart_v';
export function conferirVersao(v) {
  if (!v) return false;
  let salva = null; try { salva = localStorage.getItem(VKEY); } catch (e) {}
  try { localStorage.setItem(VKEY, v); } catch (e) {}
  if (salva !== v && items.length) { items = []; save(); return true; }
  return false;
}
