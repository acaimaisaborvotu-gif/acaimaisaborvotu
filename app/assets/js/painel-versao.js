// =============================================================================
// Atualização automática do painel (24/11/2026).
// Motivo: o painel que fica aberto o dia todo na loja seguia rodando o código velho
// depois de uma publicação (pedido 2649 saiu com 1 via e valor do iFood até darem F5).
//
// Como funciona: a cada 2 min pergunta ao site a "impressão digital" (ETag) dos
// arquivos do painel. Mudou? Marca que tem versão nova e só recarrega quando é seguro:
// aba Pedidos, ninguém digitando, nada imprimindo, nenhum pedido NOVO esperando aceite.
// Trava: no máximo 1 recarga automática a cada 10 min (nunca entra em laço).
// =============================================================================

const ARQUIVOS = [
  '/painel/index.html', '/assets/css/theme.css', '/assets/css/painel.css',
  ...['painel', 'painel-versao', 'config', 'data', 'printing', 'ifood-valores', 'menu-data', 'util', 'crm', 'dashboard', 'attribution-panel', 'attribution']
    .map((f) => `/assets/js/${f}.js`),
];
const CHAVE_ULTIMA = 'painel-auto-recarga-em';
const CHAVE_VOLTOU = 'painel-auto-recarga-voltou';
const INTERVALO = 2 * 60000;
const PAUSA_MIN = 10 * 60000;

async function assinatura() {
  const partes = await Promise.all(ARQUIVOS.map(async (u) => {
    const r = await fetch(u, { method: 'HEAD', cache: 'no-store' });
    if (!r.ok) throw new Error('sem resposta ' + u);
    const tag = (r.headers.get('etag') || '').replace(/^W\//, '');   // o mesmo arquivo vem com e sem W/ conforme a compressão
    return tag || r.headers.get('last-modified') || r.headers.get('content-length') || '';
  }));
  return partes.join('|');
}

const ler = (k) => { try { return sessionStorage.getItem(k); } catch { return null; } };
const gravar = (k, v) => { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch {} };

// true uma vez, logo depois de uma recarga automática (para avisar e pedir o clique do som).
export function voltouDeAtualizacao() {
  const v = ler(CHAVE_VOLTOU); gravar(CHAVE_VOLTOU, null); return !!v;
}

export function vigiarVersao(podeRecarregar) {
  let base = null, pendente = false;
  const checar = async () => {
    try {
      if (!pendente) {
        const s = await assinatura();
        if (base === null) { base = s; return; }
        if (s === base) return;
        pendente = true;
      }
      const ultima = Number(ler(CHAVE_ULTIMA)) || 0;
      if (Date.now() - ultima < PAUSA_MIN) return;
      if (!podeRecarregar()) return;
      gravar(CHAVE_ULTIMA, String(Date.now())); gravar(CHAVE_VOLTOU, '1');
      location.reload();
    } catch (e) { /* sem internet ou site fora: tenta na próxima */ }
  };
  checar();
  setInterval(checar, INTERVALO);
}
