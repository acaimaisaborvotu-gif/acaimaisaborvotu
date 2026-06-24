// =============================================================================
// CARDÁPIO AÇAÍ MAIS SABOR — Votuporanga/SP
// Fonte única de dados (seed). Serve como fallback local quando o Supabase
// ainda não está conectado, e como base do seed SQL do banco.
// Preços extraídos do cardápio oficial (PDF). Todos editáveis no painel.
// =============================================================================

export const STORE = {
  nome: 'Açaí Mais Sabor',
  cidade: 'Votuporanga/SP',
  endereco: 'Rua Pernambuco, 3507 - Patrimônio Velho - Votuporanga/SP',
  whatsapp: '5517996653639',
  telefoneExibicao: '(17) 99665-3639',
  instagram: '@acaimaissaborvotu',
};

// Configurações operacionais (tudo editável no painel, reflete em tempo real)
export const SETTINGS = {
  taxaEntrega: 8.0,          // taxa padrão de entrega
  taxasBairro: [],           // exceções por bairro: [{ bairro: 'Esplanada', taxa: 12 }] (o resto usa a padrão)
  pedidoMinimo: 0,           // 0 = sem mínimo
  retiradaMinutos: 20,       // tempo base de retirada na loja
  retiradaIncrementoMin: 5,  // +X min de retirada por lote de pedidos abertos
  retiradaIncrementoCadaPedidos: 10, // a cada N pedidos abertos
  // Tempo de entrega dinâmico
  tempoBaseMin: 40,          // faixa base (min)
  tempoBaseMax: 50,          // faixa base (max)
  tempoIncrementoMin: 10,    // +X minutos
  tempoIncrementoCadaPedidos: 10, // a cada N pedidos abertos
  // Horário por dia da semana (0=domingo ... 6=sábado). null = fechado
  horarios: {
    0: { abre: '15:00', fecha: '23:00' },
    1: { abre: '15:00', fecha: '23:00' },
    2: { abre: '15:00', fecha: '23:00' },
    3: { abre: '15:00', fecha: '23:00' },
    4: { abre: '15:00', fecha: '23:00' },
    5: { abre: '15:00', fecha: '23:00' },
    6: { abre: '15:00', fecha: '23:00' },
  },
  pagamentos: ['pix', 'cartao', 'dinheiro'], // formas na entrega
};

// Recipientes e tamanhos (preço base por tamanho). Compartilhados por Monte e Combinados.
export const RECIPIENTES = [
  {
    id: 'copo', nome: 'Copo',
    tamanhos: [
      { id: 'copo-300', ml: 300, preco: 11.0 },
      { id: 'copo-400', ml: 400, preco: 14.0 },
      { id: 'copo-500', ml: 500, preco: 17.0 },
      { id: 'copo-700', ml: 700, preco: 22.0 },
    ],
  },
  {
    id: 'tigela', nome: 'Tigela',
    tamanhos: [
      { id: 'tigela-300', ml: 300, preco: 11.0 },
      { id: 'tigela-500', ml: 500, preco: 17.0 },
      { id: 'tigela-700', ml: 700, preco: 22.0 },
      { id: 'tigela-1100', ml: 1100, preco: 34.0 },
    ],
  },
];

// Bases do açaí: inclusas no preço, pode escolher mais de uma. Açaí é a padrão.
export const BASES = [
  { id: 'acai', nome: 'Açaí', padrao: true },
  { id: 'acai-zero', nome: 'Açaí Zero' },
  { id: 'cupuacu', nome: 'Cupuaçu' },
  { id: 'graviola', nome: 'Graviola' },
  { id: 'iogurte', nome: 'Iogurte' },
  { id: 'pitaya', nome: 'Pitaya' },
];

// Grupos de acompanhamentos (cada item com preço próprio; soma no total).
// Usados no "Monte Seu Açaí" e como extras pagos nos Combinados.
export const ACOMPANHAMENTOS = [
  {
    id: 'frutas', nome: 'Frutas', itens: [
      { id: 'fr-abacaxi', nome: 'Abacaxi', preco: 2.5 },
      { id: 'fr-banana', nome: 'Banana', preco: 2.5 },
      { id: 'fr-cereja', nome: 'Cereja', preco: 5.5 },
      { id: 'fr-mamao', nome: 'Mamão', preco: 2.5 },
      { id: 'fr-manga', nome: 'Manga', preco: 2.5 },
      { id: 'fr-morango', nome: 'Morango', preco: 4.5 },
      { id: 'fr-uva', nome: 'Uva', preco: 3.0 },
    ],
  },
  {
    id: 'chocolates', nome: 'Chocolates', itens: [
      { id: 'ch-alpino', nome: 'Alpino', preco: 4.0 },
      { id: 'ch-bis-branco', nome: 'Bis Branco', preco: 3.0 },
      { id: 'ch-bis-preto', nome: 'Bis Preto', preco: 3.0 },
      { id: 'ch-brigadeiro', nome: 'Brigadeiro "de colher"', preco: 3.5 },
      { id: 'ch-charge', nome: 'Charge', preco: 4.5 },
      { id: 'ch-confeti', nome: 'Confeti', preco: 3.0 },
      { id: 'ch-diamante-negro', nome: 'Diamante Negro', preco: 4.0 },
      { id: 'ch-gotas', nome: 'Gotas de Chocolate', preco: 3.0 },
      { id: 'ch-kitkat', nome: 'Kit Kat', preco: 3.0 },
      { id: 'ch-moranguete', nome: 'Moranguete', preco: 4.5 },
      { id: 'ch-nescau-ball', nome: 'Nescau Ball', preco: 4.5 },
      { id: 'ch-oreo', nome: 'Oreo', preco: 4.5 },
      { id: 'ch-ouro-branco', nome: 'Ouro Branco', preco: 3.0 },
      { id: 'ch-ovomaltine', nome: 'Ovomaltine', preco: 3.5 },
      { id: 'ch-prestigio', nome: 'Prestígio', preco: 4.5 },
      { id: 'ch-raspas-choc', nome: 'Raspas de Chocolate', preco: 3.5 },
      { id: 'ch-sonho-valsa', nome: 'Sonho de Valsa', preco: 3.0 },
      { id: 'ch-suflair', nome: 'Suflair', preco: 4.0 },
      { id: 'ch-trento', nome: 'Trento', preco: 4.5 },
    ],
  },
  {
    id: 'cremes', nome: 'Cremes', itens: [
      { id: 'cr-avela', nome: 'Creme de Avelã', preco: 6.5 },
      { id: 'cr-bis-branco', nome: 'Creme de Bis Branco', preco: 6.5 },
      { id: 'cr-bis-preto', nome: 'Creme de Bis Preto', preco: 6.5 },
      { id: 'cr-ferrero', nome: 'Creme de Ferrero Rocher', preco: 6.5 },
      { id: 'cr-kinder', nome: 'Creme de Kinder Bueno', preco: 6.5 },
      { id: 'cr-laka-oreo', nome: 'Creme de Laka com Oreo', preco: 6.5 },
      { id: 'cr-ovomaltine', nome: 'Creme de Ovomaltine', preco: 6.5 },
      { id: 'cr-pacoca', nome: 'Creme de Paçoca', preco: 6.5 },
      { id: 'cr-raffaello', nome: 'Creme de Raffaello', preco: 6.5 },
      { id: 'cr-pistache', nome: 'Creme de Pistache', preco: 8.0 },
    ],
  },
  {
    id: 'mousses', nome: 'Mousses', itens: [
      { id: 'mo-ninho', nome: 'Ninho', preco: 3.5 },
      { id: 'mo-limao', nome: 'Limão', preco: 3.5 },
      { id: 'mo-maracuja', nome: 'Maracujá', preco: 3.5 },
      { id: 'mo-morango', nome: 'Morango', preco: 3.5 },
    ],
  },
  {
    id: 'sorvetes', nome: 'Sorvetes', itens: [
      { id: 'so-bombom', nome: 'Bombom', preco: 3.5 },
      { id: 'so-chocolate', nome: 'Chocolate', preco: 3.5 },
      { id: 'so-creme', nome: 'Creme', preco: 3.5 },
      { id: 'so-flocos', nome: 'Flocos', preco: 3.5 },
      { id: 'so-kinder-ovo', nome: 'Kinder Ovo', preco: 3.5 },
      { id: 'so-maracuja', nome: 'Maracujá', preco: 3.5 },
      { id: 'so-morango', nome: 'Morango', preco: 3.5 },
      { id: 'so-prestigio', nome: 'Prestígio', preco: 3.5 },
    ],
  },
  {
    id: 'coberturas', nome: 'Coberturas', itens: [
      { id: 'co-caramelo', nome: 'Caramelo', preco: 2.5 },
      { id: 'co-chocolate', nome: 'Chocolate', preco: 2.5 },
      { id: 'co-maracuja', nome: 'Maracujá', preco: 2.5 },
      { id: 'co-morango', nome: 'Morango', preco: 2.5 },
    ],
  },
  {
    id: 'diversos', nome: 'Diversos', itens: [
      { id: 'di-amendoim', nome: 'Amendoim', preco: 2.5 },
      { id: 'di-beijinho', nome: 'Beijinho "de colher"', preco: 3.5 },
      { id: 'di-castanha', nome: 'Castanha de Caju', preco: 3.0 },
      { id: 'di-chantilly', nome: 'Chantilly', preco: 3.0 },
      { id: 'di-granola', nome: 'Granola', preco: 3.0 },
      { id: 'di-leite-cond', nome: 'Leite Condensado', preco: 2.5 },
      { id: 'di-leite-po', nome: 'Leite em Pó', preco: 4.5 },
      { id: 'di-mel', nome: 'Mel', preco: 4.5 },
      { id: 'di-pacoca', nome: 'Paçoca', preco: 3.0 },
      { id: 'di-raspas-coco', nome: 'Raspas de Coco', preco: 3.0 },
      { id: 'di-sucrilhos', nome: 'Sucrilhos', preco: 3.0 },
      { id: 'di-xarope-guarana', nome: 'Xarope de Guaraná', preco: 2.5 },
      { id: 'di-whey', nome: 'Whey Protein 2W', preco: 6.5 },
    ],
  },
];

// Combinados prontos: preço = valorBase (acompanhamentos) + tamanho escolhido.
// Combos podem ser servidos em Copo ou Tigela. valorBase = preço PDF 300ml - 11.
export const COMBOS = [
  { id: '220-volts', nome: '220 Volts', desc: 'Chocolate Charge, Paçoca e Xarope de Guaraná', valorBase: 10.0 },
  { id: 'arco-iris', nome: 'Arco-Íris', desc: 'Confeti, Leite Condensado e Morango', valorBase: 10.0 },
  { id: 'banana-trufada', nome: 'Banana Trufada', desc: 'Banana, Creme de Avelã e Mousse de Ninho', valorBase: 12.5 },
  { id: 'barbie', nome: 'Barbie', desc: 'Beijinho "de colher", Mousse de Morango e Sorvete de Morango', valorBase: 10.5 },
  { id: 'beijinho', nome: 'Beijinho', desc: 'Beijinho "de colher", Leite em Pó e Mousse de Morango', valorBase: 9.5 },
  { id: 'brasileirinho', nome: 'Brasileirinho', desc: 'Banana, Leite Condensado e Paçoca', valorBase: 8.0 },
  { id: 'chocobiscoito', nome: 'Chocobiscoito', desc: 'Creme de Bis Preto, Oreo e Sorvete de Flocos', valorBase: 14.5 },
  { id: 'chocomaster', nome: 'Chocomaster', desc: 'Alpino, Creme de Avelã e Ovomaltine', valorBase: 14.0 },
  { id: 'da-casa', nome: 'Da Casa', desc: 'Creme de Laka com Oreo, Morango e Oreo', valorBase: 15.5 },
  { id: 'da-galera', nome: 'Da Galera', desc: 'Creme de Ovomaltine, Kit Kat e Morango', valorBase: 14.0 },
  { id: 'dinamite', nome: 'Dinamite', desc: 'Creme de Bis Branco, Diamante Negro e Sorvete de Prestígio', valorBase: 14.0 },
  { id: 'do-branco', nome: 'Do Branco', desc: 'Creme de Raffaello, Bis Branco e Ouro Branco', valorBase: 12.5 },
  { id: 'do-chefe', nome: 'Do Chefe', desc: 'Creme de Kinder Bueno, Creme de Raffaello e Morango', valorBase: 17.5 },
  { id: 'dos-sonhos', nome: 'Dos Sonhos', desc: 'Ouro Branco, Sonho de Valsa e Sorvete de Bombom', valorBase: 14.5 },
  { id: 'floresta-negra', nome: 'Floresta Negra', desc: 'Amendoim, Cereja e Creme de Avelã', valorBase: 14.5 },
  { id: 'joaninha', nome: 'Joaninha', desc: 'Gotas de Chocolate e Mousse de Morango', valorBase: 6.5 },
  { id: 'kids', nome: 'Kids', desc: 'Brigadeiro, Chantilly e Confeti', valorBase: 9.5 },
  { id: 'kit-kat', nome: 'Kit Kat', desc: 'Creme de Bis Branco e Kit Kat', valorBase: 9.5 },
  { id: 'mania', nome: 'Mania', desc: 'Leite Condensado, Leite em Pó e Morango', valorBase: 9.5 },
  { id: 'maravilhoso', nome: 'Maravilhoso', desc: 'Banana, Creme de Paçoca e Nescau Ball', valorBase: 13.5 },
  { id: 'mix-frutas', nome: 'Mix de Frutas', desc: 'Abacaxi, Banana, Manga e Morango', valorBase: 12.0 },
  { id: 'moranguete', nome: 'Moranguete', desc: 'Creme de Avelã, Moranguete e Mousse de Morango', valorBase: 13.0 },
  { id: 'ninho-trufado', nome: 'Ninho Trufado', desc: 'Creme de Avelã, Morango e Mousse de Leite Ninho', valorBase: 14.5 },
  { id: 'power', nome: 'Power', desc: 'Banana, Granola Tradicional, Mel e Whey', valorBase: 16.5 },
  { id: 'preferido', nome: 'Preferido', desc: 'Creme de Avelã, Leite em Pó e Morango', valorBase: 13.5 },
  { id: 'prestigio', nome: 'Prestígio', desc: 'Beijinho "de colher", Prestígio e Raspas de Chocolate', valorBase: 11.5 },
  { id: 'que-mais-sai', nome: 'Que Mais Sai', desc: 'Creme de Avelã, Leite Condensado e Leite em Pó', valorBase: 11.5 },
  { id: 'quero-mais', nome: 'Quero Mais', desc: 'Bis Branco, Bis Preto e Mousse de Leite Ninho', valorBase: 9.5 },
  { id: 'raspas', nome: 'Raspas', desc: 'Leite Condensado, Morango e Raspas de Chocolate', valorBase: 10.5 },
  { id: 'sabor', nome: 'Sabor', desc: 'Granola, Leite Condensado, Leite em Pó e Morango', valorBase: 12.5 },
  { id: 'saboroso', nome: 'Saboroso', desc: 'Banana, Granola Tradicional, Leite Condensado e Leite em Pó', valorBase: 10.5 },
  { id: 'supremo', nome: 'Supremo', desc: 'Creme de Avelã, Sorvete de Maracujá e Suflair', valorBase: 14.0 },
  { id: 'tanto-faz', nome: 'Tanto Faz', desc: 'Mousse de Limão e Raspas de Chocolate', valorBase: 7.0 },
  { id: 'top', nome: 'Top', desc: 'Creme de Ferrero Rocher, Leite em Pó e Uva', valorBase: 12.0 },
  { id: 'trento', nome: 'Trento', desc: 'Creme de Avelã, Mousse de Maracujá e Trento', valorBase: 14.5 },
];

// Destaques iniciais (editável no painel)
export const DESTAQUES = ['ninho-trufado', 'chocomaster', 'mania', 'raspas', 'supremo'];

// Frapê: batido com leite, pra tomar de canudo. Tamanhos próprios + acompanhamentos opcionais.
export const FRAPE = {
  id: 'frape', nome: 'Frapê', desc: 'Açaí batido com leite, pra tomar de canudo',
  tamanhos: [
    { id: 'frape-300', ml: 300, preco: 11.0 },
    { id: 'frape-400', ml: 400, preco: 14.0 },
    { id: 'frape-500', ml: 500, preco: 17.0 },
    { id: 'frape-700', ml: 700, preco: 22.0 },
  ],
};

// Milk-shake: tamanhos + escolher 1 sabor (incluso). Sabor extra +R$5.
export const MILKSHAKE = {
  id: 'milkshake', nome: 'Milk-shake', desc: 'Cremoso, escolha o sabor',
  precoSaborExtra: 5.0,
  tamanhos: [
    { id: 'milk-300', ml: 300, preco: 17.0 },
    { id: 'milk-400', ml: 400, preco: 19.0 },
    { id: 'milk-500', ml: 500, preco: 21.0 },
    { id: 'milk-700', ml: 700, preco: 25.0 },
  ],
  sabores: [
    { id: 'ms-brigadeiro', nome: 'Brigadeiro' },
    { id: 'ms-chocolate', nome: 'Chocolate' },
    { id: 'ms-ferrero', nome: 'Ferrero Rocher' },
    { id: 'ms-flocos', nome: 'Flocos' },
    { id: 'ms-kinder-ovo', nome: 'Kinder Ovo' },
    { id: 'ms-maracuja', nome: 'Maracujá' },
    { id: 'ms-morango', nome: 'Morango' },
    { id: 'ms-ninho', nome: 'Ninho' },
    { id: 'ms-nutella', nome: 'Nutella' },
    { id: 'ms-ovomaltine', nome: 'Ovomaltine' },
  ],
};

// Saladas de frutas (preço base + acompanhamentos opcionais; sem base de açaí)
export const SALADAS = [
  { id: 'salada-verao', nome: 'Salada Delícia de Verão', desc: 'Abacaxi, Banana, Mamão, Manga, Morango e Uva', preco: 17.5, acomp: true },
  { id: 'salada-maravilha', nome: 'Salada Maravilha', desc: 'Banana, Granola, Mamão, Manga e Morango', preco: 15.0, acomp: true },
  { id: 'salada-mais-sabor', nome: 'Salada Mais Sabor', desc: 'Abacaxi, Banana, Cereja, Mel e Uva', preco: 18.0, acomp: true },
];

// Diversos / Sobremesas. acomp = aceita acompanhamentos; sorvete = bola inclusa + extras.
export const SOBREMESAS = [
  { id: 'chocolate-quente', nome: 'Chocolate Quente', preco: 13.0 },
  { id: 'fondue', nome: 'Fondue', desc: 'Turbine com os acompanhamentos que quiser', preco: 14.0, acomp: true },
  { id: 'petit-gateau', nome: 'Petit Gateau', desc: '1 bola de sorvete inclusa e turbine com acompanhamentos', preco: 23.0, sorvete: true, precoBolaExtra: 3.5 },
  { id: 'brownie', nome: 'Brownie', desc: '1 bola de sorvete inclusa e turbine com acompanhamentos', preco: 23.0, sorvete: true, precoBolaExtra: 3.5 },
];

// Bebidas (preço único)
// `tipos` (opcional): sabores que o cliente escolhe ao adicionar, mesmo preço.
// Edite/adicione/remova no painel. Os sabores abaixo são só exemplo.
export const BEBIDAS = [
  { id: 'agua-c-gas', nome: 'Água com Gás', preco: 3.0 },
  { id: 'agua-s-gas', nome: 'Água sem Gás', preco: 3.0 },
  { id: 'refri-lata', nome: 'Refrigerante Lata', preco: 5.5, tipos: ['Coca-Cola', 'Coca-Cola Zero', 'Guaraná Antarctica', 'Fanta Laranja', 'Sprite'] },
  { id: 'refri-600', nome: 'Refrigerante 600ml', preco: 8.0, tipos: ['Coca-Cola', 'Coca-Cola Zero', 'Guaraná Antarctica', 'Fanta Laranja'] },
  { id: 'refri-2l', nome: 'Refrigerante 2L', preco: 17.5, tipos: ['Coca-Cola', 'Guaraná Antarctica', 'Fanta Laranja'] },
];

// Ordem e rótulos das categorias do cardápio público
export const CATEGORIAS = [
  { id: 'destaques', nome: 'TOP 5', tipo: 'destaques' },
  { id: 'combinados', nome: 'Combinados', tipo: 'combos' },
  { id: 'monte', nome: 'Monte Seu Açaí', tipo: 'monte' },
  { id: 'frapes', nome: 'Frapês', tipo: 'frape' },
  { id: 'saladas', nome: 'Salada de Frutas', tipo: 'simples' },
  { id: 'milkshakes', nome: 'Milk Shakes', tipo: 'milkshake' },
  { id: 'sobremesas', nome: 'Diversos', tipo: 'simples' },
  { id: 'bebidas', nome: 'Águas & Refrigerantes', tipo: 'simples' },
];

// Fotos dos tiles de Categorias (a loja sobe pelo painel). catId -> url
export const CATEGORIA_FOTOS = {};

// Seção 2 personalizável abaixo do TOP 5 (ex: "Promoção"). A loja edita no painel.
// itens: { tipo:'ref', refId }                                  -> produto do cardápio
//        { tipo:'custom', id, nome, desc, preco, precoDe, foto } -> oferta personalizada
//        (precoDe opcional: mostra "de R$X por R$Y" riscado)
export const SECAO2 = { titulo: 'Promoção da semana', ativa: false, itens: [] };

// Upsell na sacola (antes de enviar). A loja edita no painel.
// itens: [{ id, nome, preco, refId? }] - refId quando veio do cardápio.
export const UPSELL = { ativo: false, titulo: 'Que tal adicionar?', itens: [] };

// Cupons de desconto (a loja cria no painel). O cliente digita no checkout.
// item: { codigo, tipo:'percent'|'fixo', valor, minimo, ativo }
export const CUPONS = [];

// Textos/exemplos do cardápio que aparecem nos modais (a loja edita no painel).
export const TEXTOS = {
  monteDesc: 'Escolha o recipiente, o tamanho, a base e os acompanhamentos do seu jeito',
  baseDesc: 'Escolha pelo menos 1. Pode trocar o Açaí ou combinar mais de uma base.',
  turbineDesc: 'Opcional, soma ao preço',
  msSaboresDesc: '1º incluso. Cada sabor a mais: + {valor}',
  bolasDesc: '1 bola já inclusa. Cada bola a mais: + {valor}',
  obsExemplo: 'Ex: sem granola, do seu jeito',
  obsPlaceholder: 'Alguma observação?',
  // Mensagens do CRM (botão WhatsApp). {nome} = 1º nome do cliente, {loja} = nome da loja.
  waInativo: 'Oi {nome}, sentimos sua falta aqui no {loja}! Bateu vontade de açaí? Manda um oi que a gente capricha no seu. 💜',
  waAbandono: 'Oi {nome}, vi que você começou um pedido aqui no {loja} mas não finalizou. Posso fechar pra você agora se quiser? 🍧',
};

// Fotos iniciais (placeholder do seed; a loja troca pelo painel depois)
export const FOTOS_SEED = {
  'salada-verao': 'assets/img/seed/salada-frutas.png',
  'salada-maravilha': 'assets/img/seed/salada-frutas.png',
  'salada-mais-sabor': 'assets/img/seed/salada-frutas.png',
  frape: 'assets/img/seed/frape-morango.png',
  combo: 'assets/img/seed/combo-acai.png',
};
