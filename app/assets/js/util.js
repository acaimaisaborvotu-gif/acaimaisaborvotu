// Helpers compartilhados (cardápio + painel)

export const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const money = (n) => BRL.format(Number(n) || 0);

export const el = (tag, props = {}, children = []) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(c));
  }
  return node;
};

export const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

let toastTimer;
export function toast(msg) {
  let wrap = document.querySelector('.toast-wrap');
  if (!wrap) { wrap = el('div', { class: 'toast-wrap' }); document.body.append(wrap); }
  const t = el('div', { class: 'toast', text: msg });
  wrap.append(t);
  requestAnimationFrame(() => t.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 250); }, 2200);
}

// Foto do Supabase Storage -> versão redimensionada pela CDN (bem mais leve).
// O navegador recebe WebP automático (header Accept), então fica minúsculo.
// O ORIGINAL fica intacto no banco (não há reupload). URLs que não são do
// Storage (ex: assets locais) passam direto.
// IMPORTANTE: passa width E height iguais com resize=contain. Só `width` faria
// o Supabase cortar pra width x altura-original (deformava/cortava a foto). Com
// resize=contain a foto é só reduzida MANTENDO a proporção (sem corte nem
// distorção); o recorte de exibição fica por conta do object-fit do CSS.
// `box` = caixa máxima (px) em que a foto cabe; quality 1-100.
export function imgUrl(url, box, quality = 72) {
  if (!url || typeof url !== 'string') return url;
  const marker = '/storage/v1/object/public/';
  const i = url.indexOf(marker);
  if (i < 0) return url;
  const rendered = url.slice(0, i) + '/storage/v1/render/image/public/' + url.slice(i + marker.length);
  return rendered + (rendered.includes('?') ? '&' : '?') + 'width=' + box + '&height=' + box + '&resize=contain&quality=' + quality;
}

// Normaliza nome de bairro pra comparar: tira acento, deixa minúsculo, remove a
// palavra "bairro" e pontuação. Ex: "Bairro Esplanada!" -> "esplanada".
export function normBairro(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\bbairro\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

// Distância de edição (Levenshtein): quantas letras diferem. Usada pra reconhecer
// bairro mesmo com erro de digitação (ex: "explanada" ~ "esplanada" = distância 1).
export function levenshtein(a, b) {
  a = String(a); b = String(b);
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[n];
}

// "HH:MM" -> minutos
export const hmToMin = (hm) => { const [h, m] = String(hm).split(':').map(Number); return h * 60 + m; };
export const uid = () => Math.random().toString(36).slice(2, 9);

// ---- Telefone (centralizado: usado no checkout, tracking, login e WhatsApp) ----
// Tira o DDI 55 que vem em autofill/colagem (ex "+55 (17) 99999-8888"), pra nao virar DDD.
// Numeros do DDD 55 (Santa Maria/RS) tem 10-11 digitos e NAO sao afetados (so tira de 12-13).
function semDDI(d) { return (d.length > 11 && d.startsWith('55')) ? d.slice(2) : d; }

// So digitos com DDI 55: '(17) 99999-8888' / '+5517999998888' -> '5517999998888'
export function phoneCanon(tel) {
  const d = semDDI(String(tel ?? '').replace(/\D/g, ''));
  return d ? '55' + d : '';
}
// E.164 (+55...) pro tracking / advanced matching. Vazio -> undefined.
export const phoneE164 = (tel) => { const c = phoneCanon(tel); return c ? '+' + c : undefined; };

// Mascara de digitacao "(17) 99999-8888". Robusta a autofill com +55 e a colagem.
export function maskPhone(v) {
  let d = semDDI(String(v ?? '').replace(/\D/g, '')).slice(0, 11);
  if (d.length <= 10) return d.replace(/(\d{2})(\d{0,4})(\d{0,4}).*/, (_, a, b, c) => `(${a}) ${b}${c ? '-' + c : ''}`).trim();
  return d.replace(/(\d{2})(\d{5})(\d{0,4}).*/, '($1) $2-$3');
}
// Telefone valido = 10 (fixo) ou 11 (celular) digitos, ja sem o DDI.
export const phoneValido = (tel) => { const d = semDDI(String(tel ?? '').replace(/\D/g, '')); return d.length === 10 || d.length === 11; };

// Icone do WhatsApp (inline SVG) reaproveitado em varios lugares.
export const ICON_WHATS = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" style="vertical-align:-4px;margin-right:6px"><path d="M.057 24l1.687-6.163a11.867 11.867 0 0 1-1.587-5.945C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 0 1 8.413 3.488 11.824 11.824 0 0 1 3.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 0 1-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 0 0 1.51 5.26l-.999 3.648 3.477-.999zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>';
