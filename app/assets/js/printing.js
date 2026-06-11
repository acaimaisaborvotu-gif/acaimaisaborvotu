// =============================================================================
// IMPRESSÃO TÉRMICA ESC/POS via Web Serial (Chrome/Edge no desktop).
// Via do entregador (2 vias) + via de produção (1 papel por item).
// Acentos são normalizados para ASCII p/ sair limpo em qualquer térmica.
// QZ Tray fica como alternativa (veja docs/GUIA-IMPRESSORA.md).
// =============================================================================

const ESC = 0x1b, GS = 0x1d, LF = 0x0a;
const WIDTH = 32; // 58mm = 32 colunas (use 48 para 80mm)

const noAccent = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const enc = new TextEncoder();

// Construtor de comandos ESC/POS
class Ticket {
  constructor() { this.parts = []; this.cmd(ESC, 0x40); } // init
  cmd(...b) { this.parts.push(new Uint8Array(b)); return this; }
  raw(bytes) { this.parts.push(bytes); return this; }
  align(a) { return this.cmd(ESC, 0x61, a); }          // 0 esq, 1 centro, 2 dir
  bold(on) { return this.cmd(ESC, 0x45, on ? 1 : 0); }
  size(n) { return this.cmd(GS, 0x21, n); }             // 0x00 normal, 0x11 2x
  text(s) { this.parts.push(enc.encode(noAccent(s))); return this; }
  line(s = '') { return this.text(s).feed(1); }
  feed(n = 1) { for (let i = 0; i < n; i++) this.parts.push(new Uint8Array([LF])); return this; }
  rule(ch = '-') { return this.line(ch.repeat(WIDTH)); }
  cut() { return this.feed(3).cmd(GS, 0x56, 66, 0); }   // corte parcial
  bytes() { const len = this.parts.reduce((s, p) => s + p.length, 0); const out = new Uint8Array(len); let o = 0; for (const p of this.parts) { out.set(p, o); o += p.length; } return out; }
}

const padNum = (n) => String(n ?? 0).padStart(3, '0');
const money = (v) => 'R$ ' + (Number(v) || 0).toFixed(2).replace('.', ',');
// Cabeçalho com tipo + número do pedido: "Pedido Entrega 001" / "Pedido Retirada 001"
const pedidoLabel = (order) => 'Pedido ' + (order.delivery_type === 'retirada' ? 'Retirada' : 'Entrega') + ' ' + padNum(order.daily_number);

// Expande linhas do pedido em unidades (qtd 2 => 2 papeis)
function explode(items) {
  const units = [];
  for (const it of items) for (let i = 0; i < (it.qtd || 1); i++) units.push(it);
  return units;
}

// ---- Via do entregador (2 vias iguais) ----
export function deliveryTicket(order, store) {
  const t = new Ticket();
  const totalItens = explode(order.items).length;
  const retirada = order.delivery_type === 'retirada';
  t.align(1).bold(true).size(0x11).line(noAccent(store?.nome || 'ACAI MAIS SABOR'));
  t.size(0).line(retirada ? 'VIA DA RETIRADA' : 'VIA DO ENTREGADOR').bold(false);
  t.size(0x11).bold(true).line(pedidoLabel(order)).size(0).bold(false);
  t.align(0).rule();
  t.line('Cliente: ' + order.customer_name);
  t.line('Tel: ' + order.customer_phone);
  if (!retirada && order.address) wrap('End: ' + order.address).forEach((l) => t.line(l));
  t.bold(true).line('Itens na sacola: ' + totalItens).bold(false);
  t.rule();
  const pg = { pix: 'PIX na entrega', cartao: 'Cartao na maquininha', dinheiro: 'Dinheiro' }[order.payment_method] || order.payment_method || '';
  t.line('Pagamento: ' + pg);
  if (order.payment_method === 'dinheiro' && order.change_for) {
    const troco = parseFloat(String(order.change_for).replace(',', '.')) - Number(order.total);
    t.line('Troco para: R$ ' + order.change_for + (isFinite(troco) ? '  (troco ' + money(troco) + ')' : ''));
  }
  t.line('Subtotal: ' + money(order.subtotal));
  if (!retirada) t.line('Taxa de entrega: ' + money(order.delivery_fee));
  if (Number(order.discount) > 0) t.line('Desconto' + (order.coupon ? ' (' + order.coupon + ')' : '') + ': -' + money(order.discount));
  t.size(0x11).bold(true).line('TOTAL: ' + money(order.total)).size(0).bold(false);
  t.rule();
  const tempo = order.eta_max || order.eta_min;
  if (tempo) {
    const base = new Date(order.created_at || Date.now());
    const lim = new Date(base.getTime() + Number(tempo) * 60000);
    const hora = String(lim.getHours()).padStart(2, '0') + 'h' + String(lim.getMinutes()).padStart(2, '0');
    t.align(1).bold(true).line((retirada ? 'Pronto ate ' : 'Entrega maxima ate ') + hora).bold(false);
  }
  t.cut();
  return t.bytes();
}

// ---- Vias de produção (1 papel por item) ----
export function productionTickets(order) {
  const units = explode(order.items);
  const total = units.length;
  const chunks = [];
  units.forEach((it, idx) => {
    const t = new Ticket();
    t.align(1).size(0x11).bold(true).line(pedidoLabel(order)).size(0).bold(false);
    t.line('Producao ' + padNum(idx + 1) + ' - Item ' + String(idx + 1).padStart(2, '0') + ' de ' + String(total).padStart(2, '0'));
    t.align(0).rule();
    t.bold(true).size(0x11).line(it.nome).size(0).bold(false);
    const temNovo = (it.extras && it.extras.length) || (it.grupos && it.grupos.length);
    if (temNovo) {
      (it.extras || []).forEach((d) => t.line(noAccent(d)));
      (it.grupos || []).forEach((g) => {
        t.bold(true).line(noAccent(g.grupo + ':')).bold(false);
        (g.itens || []).forEach((x) => t.line('  ' + noAccent(x)));
      });
    } else if (it.detalhes && it.detalhes.length) {
      it.detalhes.forEach((d) => t.line(noAccent(d)));   // pedidos antigos (sem grupos)
    } else {
      t.line('Puro, sem acompanhamento');
    }
    t.line(''.padEnd(WIDTH, '='));
    t.cut();
    chunks.push(t.bytes());
  });
  return chunks;
}

function wrap(s, width = WIDTH) {
  const words = String(s).split(' '); const lines = []; let cur = '';
  for (const w of words) { if ((cur + ' ' + w).trim().length > width) { lines.push(cur.trim()); cur = w; } else cur += ' ' + w; }
  if (cur.trim()) lines.push(cur.trim());
  return lines.length ? lines : [''];
}

// =============================================================================
// Transporte: QZ Tray (impressora instalada no Windows, ex: EPSON TM-T20)
// ou Web Serial (impressora em porta serial/USB direta) como alternativa.
// =============================================================================
const PCFG_KEY = 'ams_printer_cfg';
let pcfg = {};
try { pcfg = JSON.parse(localStorage.getItem(PCFG_KEY) || '{}'); } catch (e) {}

let port = null;   // web serial
let _qz = null;    // window.qz

function bytesToB64(bytes) {
  let bin = ''; const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(bin);
}

async function loadQz() {
  if (window.qz) return window.qz;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/qz-tray@2.2.4/qz-tray.js';
    s.onload = resolve;
    s.onerror = () => reject(new Error('Não consegui carregar o QZ Tray (sem internet?)'));
    document.head.appendChild(s);
  });
  return window.qz;
}

async function qzConnect() {
  const qz = await loadQz();
  // Modo sem assinatura: o QZ Tray pede pra você liberar uma vez (marque "lembrar").
  qz.security.setCertificatePromise((resolve) => resolve());
  qz.security.setSignaturePromise(() => (resolve) => resolve());
  if (!qz.websocket.isActive()) await qz.websocket.connect();
  _qz = qz;
  return qz;
}

export const printer = {
  supportsSerial() { return 'serial' in navigator; },
  config() { return pcfg; },
  setConfig(method, printerName) { pcfg = { method, printer: printerName }; localStorage.setItem(PCFG_KEY, JSON.stringify(pcfg)); },

  // ---- QZ Tray ----
  async qzListPrinters() { const qz = await qzConnect(); return await qz.printers.find(); },
  async qzPrint(jobs) {
    const qz = _qz || await qzConnect();
    if (!pcfg.printer) throw new Error('Escolha a impressora primeiro');
    const config = qz.configs.create(pcfg.printer);
    const data = jobs.map((b) => ({ type: 'raw', format: 'base64', data: bytesToB64(b) }));
    await qz.print(config, data);
  },

  // ---- Web Serial ----
  connected() { return !!port; },
  async reconnectSerial() {
    if (!this.supportsSerial()) return false;
    try { const ports = await navigator.serial.getPorts(); if (ports.length) { port = ports[0]; if (!port.readable) await port.open({ baudRate: 9600 }); return true; } } catch (e) {}
    return false;
  },
  async connectSerial() {
    if (!this.supportsSerial()) throw new Error('Web Serial não suportado. Use o QZ Tray.');
    port = await navigator.serial.requestPort();
    await port.open({ baudRate: 9600 });
    this.setConfig('serial', 'Serial (USB)');
    return true;
  },
  async writeSerial(bytes) {
    if (!port) { const ok = await this.reconnectSerial(); if (!ok) throw new Error('Impressora serial não conectada'); }
    if (!port.writable) await port.open({ baudRate: 9600 });
    const writer = port.writable.getWriter();
    try { await writer.write(bytes); } finally { writer.releaseLock(); }
  },

  // ---- Comum ----
  // Imprime o pedido: 2 vias do entregador + N vias de produção (1 por item)
  async printOrder(order, store) {
    // Entrega = 2 vias do entregador; Retirada = 1 via só.
    const vias = order.delivery_type === 'retirada'
      ? [deliveryTicket(order, store)]
      : [deliveryTicket(order, store), deliveryTicket(order, store)];
    const jobs = [...vias, ...productionTickets(order)];
    if (pcfg.method === 'serial') { for (const j of jobs) { await this.writeSerial(j); await new Promise((r) => setTimeout(r, 250)); } }
    else { await this.qzPrint(jobs); }
    return jobs.length;
  },
  async test(store) {
    const t = new Ticket();
    t.align(1).bold(true).size(0x11).line(noAccent(store?.nome || 'ACAI MAIS SABOR')).size(0).bold(false);
    t.line('Teste de impressao').rule().align(0)
      .line('Se voce esta lendo isso,').line('a impressora esta OK!').cut();
    if (pcfg.method === 'serial') await this.writeSerial(t.bytes());
    else await this.qzPrint([t.bytes()]);
  },
};
