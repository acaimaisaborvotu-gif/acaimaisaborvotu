# Cardápio Digital + Painel — Açaí Mais Sabor (Votuporanga/SP)

Sistema próprio de cardápio digital de delivery, com painel de gestão, pedidos em
tempo real, impressão térmica controlada e rastreamento (GTM). Sem comissão de plataforma.
Modelado para virar SaaS multi-loja depois (Row Level Security por loja).

## O que já está pronto (Fase 1 — núcleo operacional)
- **Cardápio do cliente:** Monte Seu Açaí (recipiente, tamanho, bases, acompanhamentos com
  preço), Combinados, Frapês, Milk-shakes, Saladas, Diversos, Bebidas. Busca, sacola,
  checkout em etapas (nome/telefone > endereço/retirada > pagamento), taxa, tempo dinâmico,
  abre/fecha por horário.
- **Painel:** login com perfis (dono/operação), pedidos em tempo real com som, fluxo de
  status, aceite que dispara a impressão, editor de cardápio (preços, esgotado, destaque,
  foto), configurações (taxa, horário, tempo, pagamento), configuração da impressora.
- **Impressão térmica ESC/POS:** 2 vias do entregador + 1 papel por item na produção.
- **Rastreamento:** GTM-WC3TM37P com dataLayer (view_item, add_to_cart, begin_checkout,
  add_payment_info, purchase com valor real).
- **Tudo editável no painel e refletindo em tempo real** no cardápio do cliente.

## Próximas fases
Fidelidade, CRM, dashboard financeiro, cupom, upsell, login do cliente, mensagem de status
no WhatsApp (Make.com), autocadastro multi-loja.

---

## Estrutura
```
app/                      site publicado (Netlify)
  index.html              cardápio do cliente (com GTM)
  painel/index.html       painel da loja
  assets/css/             theme.css (design) + painel.css
  assets/js/              menu-data, data, cardapio, product-modal, checkout,
                          cart, tracking, printing, painel, config, util
  assets/img/seed/        fotos iniciais (a loja troca pelo painel)
supabase/migrations/      0001_init.sql (schema+RLS+realtime) e 0002_seed.sql
docs/                     GUIA-SUPABASE.md e GUIA-IMPRESSORA.md
netlify.toml              publica a pasta app/
```

## Rodar no computador (teste local)
Precisa servir por HTTP (módulos JS não abrem por file://):
```
cd app
python3 -m http.server 8080
```
Abra `http://localhost:8080` (cardápio) e `http://localhost:8080/painel/` (painel).
Sem Supabase configurado, o cardápio funciona com os dados locais e o pedido vai por WhatsApp.

## Colocar no ar
1. **Supabase** (backend): siga `docs/GUIA-SUPABASE.md` e preencha `app/assets/js/config.js`.
2. **GitHub:** suba esta pasta no repositório.
3. **Netlify:** conecte o repositório. O `netlify.toml` já manda publicar a pasta `app/`.
   - Cardápio: `https://SEU-SITE.netlify.app/`
   - Painel: `https://SEU-SITE.netlify.app/painel/`
4. **Impressora:** siga `docs/GUIA-IMPRESSORA.md` (Chrome no PC da loja).

## Configuração
`app/assets/js/config.js`: chaves do Supabase, ID da loja, GTM e WhatsApp de fallback.
Cardápio e preços vivem no painel depois de publicados (botão "Publicar cardápio").

## Identidade
Paleta extraída do cardápio: roxo `#4a1052`, magenta `#d6217f`, verde-limão `#9ccc3c`,
amarelo `#f5c518`. Sem travessão nas mensagens ao cliente.
