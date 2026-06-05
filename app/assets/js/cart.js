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
