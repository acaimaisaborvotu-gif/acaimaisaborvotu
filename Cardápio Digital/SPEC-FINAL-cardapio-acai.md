== SPEC FINALIZADA: Cardápio Digital de Delivery + Painel de Gestão ==
Cliente: Açaí Mais Sabor — Votuporanga/SP
Responsável: Nathan Ferreira
Data: 2026-06-04
Status: AGUARDANDO APROVAÇÃO para execução
Base: fecha as "Decisões Abertas" do briefing original (spec-cardapio-acai-saas.md)

---

## PRINCÍPIO CENTRAL (vale para o sistema inteiro)

TUDO é configurável no painel de controle e reflete em TEMPO REAL (no mesmo segundo) no
cardápio do cliente. Nada de valor "chumbado" no código. São editáveis no painel:
taxa de entrega, horário, regra de tempo dinâmico, produtos, preços, tamanhos, bases,
acompanhamentos, combos, destaques, estoque (esgotado), impressora.

Implementação: toda configuração e todo o cardápio vivem no Supabase; o cardápio público
assina mudanças via Supabase Realtime e atualiza sem refresh.

---

## DECISÕES FECHADAS (confirmadas pelo Nathan)

1. MONTAGEM ("Monte Seu Açaí"): preço = base do recipiente/tamanho + soma de cada
   acompanhamento pelo preço da tabela. NÃO existe acompanhamento grátis.

2. BASES (Açaí, Açaí Zero, Cupuaçu, Graviola, Iogurte, Pitaya): inclusas no preço do
   tamanho, sem custo extra. Pode escolher MAIS DE UMA base. Açaí é a base padrão
   pré-selecionada (as outras são menos pedidas).

3. COMBINADOS: categoria própria. Cliente escolhe o combo e o tamanho (300/400/500/700).
   Permite adicionar acompanhamento extra pago (somando ao preço do combo).

4. RECIPIENTES / LINHAS DE PRODUTO (cada um com seus tamanhos e preços):
   - Copo:       300 / 400 / 500 / 700 ml  ->  11 / 14 / 17 / 22
   - Tigela:     300 / 500 / 700 / 1100 ml ->  11 / 17 / 22 / 34
   - Frapê:      300 / 400 / 500 / 700 ml  ->  11 / 14 / 17 / 22 (batido com leite, canudo)
   - Barca:      1300 / 1500 ml            ->  41 / 48
   - Milk-shake: 300 / 400 / 500 / 700 ml  ->  17 / 19 / 21 / 25 (+ sabor por R$ 5,00)

5. CATEGORIAS DO CARDÁPIO PÚBLICO (estrutura confirmada pela referência chefgourmet):
   Destaques, Combinados, Monte Seu Açaí, Frapês, Saladas de Frutas, Milk Shakes,
   Diversos/Sobremesas, Bebidas.
   Destaques iniciais: Combinado Ninho Trufado, Chocomaster, Mania, Raspas, Supremo
   (editável no painel).

6. TAXA DE ENTREGA: fixa R$ 8,00 (editável no painel). Retirada na loja = R$ 0,00.
   Pedido mínimo: nenhum por enquanto (campo no painel, default vazio).

7. TEMPO DE ENTREGA: dinâmico e configurável no painel. Base 40–50 min + incremento por
   faixas de pedidos abertos (ex.: +10 min a cada 10 pedidos), totalmente editável.
   Retirada ~20 min. Mudou no painel, reflete na hora pro cliente.

8. HORÁRIO: 15h–23h, editável no painel (por dia da semana). Fora do horário o cliente
   navega o cardápio mas o botão de finalizar fica bloqueado com aviso.

9. PAGAMENTO NA ENTREGA: PIX, Cartão (débito/crédito na maquininha), Dinheiro (com troco
   calculado). Sem pagamento online nesta fase.

10. IMPRESSORA: configurável no painel. Botão "Configurar impressora" abre o seletor de
    dispositivo do Chrome (Web Serial), detecta automaticamente a impressora USB conectada
    e salva a escolha. Protocolo ESC/POS (padrão da maioria das térmicas). QZ Tray como
    alternativa. Modelo ainda indefinido; quando soubermos, adicionamos o perfil específico.

11. MULTI-LOJA: banco modelado com store_id + Row Level Security desde já. SEM autocadastro
    nesta fase (apenas Açaí Mais Sabor ativa). Vira SaaS depois sem retrabalho.

12. WHATSAPP DA LOJA: +55 17 99665-3639. Mensagem de status ("saiu para entrega") via
    Make.com fica para a fase seguinte; número já registrado.

13. RASTREAMENTO: GTM-WC3TM37P em todas as páginas (head + body). dataLayer com a jornada:
    view_item, add_to_cart, begin_checkout, add_payment_info, purchase (valor real).

14. FOTOS: cada produto tem foto opcional, enviada pelo painel (Supabase Storage), aparece
    na hora pro cliente. Placeholder bonito quando não houver foto. Fotos dos combos virão
    do Drive da loja, subidas pelo painel.

15. INFRA: GitHub + Netlify já existem. Supabase a criar (guia passo a passo incluído na
    entrega). Nathan sobe o código ao GitHub; Netlify publica automático.

16. IDENTIDADE VISUAL: extraída do cardápio (roxo/magenta + amarelo do logo + verde limão
    de destaque, fundo claro). Logo "Açaí + Sabor" reaproveitado do PDF.

---

## PENDÊNCIA CRÍTICA A CONFIRMAR

PREÇO DOS COMBOS — fonte da verdade. Os preços do chefgourmet estão exatamente R$ 11,00
abaixo do PDF (R$ 11 = copo 300ml), ou seja, lá cadastraram só os acompanhamentos sem somar
o copo. Assumindo o PDF como fonte verdadeira (preço cheio, com copo). Aguardando o "ok" do
Nathan antes de gerar o seed de preços.

---

## ARQUITETURA

- Frontend: HTML/CSS/JS vanilla, modular (cardápio público + painel). Migrável a React.
- Backend: Supabase — Postgres + Auth + Realtime + Storage. Isolamento por store_id com RLS.
- Realtime: cardápio assina config/produtos/estoque; painel assina pedidos novos (com som).
- Deploy: GitHub -> Netlify (frontend) + Supabase (backend). Make.com (mensageria, fase 2).
- Impressão: Web Serial API (Chrome) principal + QZ Tray alternativa, ESC/POS.
- Sem travessão em qualquer copy do cardápio ou mensagem ao cliente.

### Modelo de dados (resumo)
stores; users (perfis: owner/operator); categories; products; product_sizes;
option_groups + options (bases e acompanhamentos por categoria, com preço); combos +
combo_sizes; orders; order_items; order_item_options; settings (taxa, horário, tempo
dinâmico, impressora, pagamento); + fase 2: customers, coupons, loyalty.

---

## IMPRESSÃO (o ponto que quebrou no chefgourmet — núcleo do diferencial)

- Só imprime DEPOIS que a loja clica em "Aceitar".
- VIA DO ENTREGADOR: 2 vias iguais, contendo nº do pedido, quantidade total de itens (para
  conferência da sacola), endereço + nome + telefone, forma de pagamento e valor a receber
  (com troco, se houver), taxa de entrega.
- VIA DE PRODUÇÃO: 1 papel por item. Cada papel com nº do pedido, "Item XX de NN", "Itens no
  pedido: N", e a descrição do item (recipiente, tamanho, base(s) e acompanhamentos).
  Numeração XX de NN gerada automática conforme a quantidade de itens. 1 item = 1 papel;
  7 itens = 7 papéis.
- Configuração e detecção da impressora pelo painel (Web Serial).

---

## ESCOPO — FASE 1 (entregue agora: NÚCLEO OPERACIONAL)

Cardápio público:
- Cardápio responsivo com a identidade Açaí Mais Sabor (header/logo, categorias, busca,
  card de produto com foto e preço, sacola flutuante).
- Monte Seu Açaí (recipiente -> tamanho -> base(s) -> acompanhamentos com preço -> obs).
- Combinados (escolhe combo -> tamanho -> extras pagos opcionais).
- Demais categorias (Frapês, Saladas, Milk Shakes, Diversos, Bebidas).
- Checkout em etapas: nome+telefone -> endereço/retirada -> pagamento (PIX/cartão/dinheiro
  com troco). Taxa como adicional no resumo. Tempo de entrega dinâmico exibido.
- Abrir/fechar por horário (fora do horário navega mas não finaliza).
- GTM + dataLayer (jornada completa, purchase com valor real).

Painel de gestão:
- Pedidos em tempo real com alerta sonoro.
- Fluxo de status: Novo > Aceito > Em produção > Pronto > Saiu para entrega > Entregue.
- Aceite obrigatório antes da impressão. Impressão das vias (entregador + produção).
- Gestão de cardápio: produtos, preços, tamanhos, bases, acompanhamentos, combos, fotos.
- Estoque: marcar esgotado (some do cardápio na hora) e reativar.
- Destaques: trocar itens em destaque.
- Configurações: taxa, horário, regra de tempo dinâmico, impressora, formas de pagamento.
- Usuários e permissões: owner (tudo) e operator (opera pedidos/impressão/destaque/foto,
  NÃO vê faturamento/CRM — telas financeiras chegam na fase 2, já com a permissão pronta).
- Configurar impressora (detecção automática Web Serial).

Infra:
- Migrations SQL do Supabase + guia passo a passo de criação da conta/projeto.
- Projeto pronto pro GitHub + publicação no Netlify.

---

## FORA DA FASE 1 (próximas fases)

Programa de fidelidade; CRM e ficha do cliente; dashboard de faturamento/pedidos/ticket
médio/mais vendidos; cupom de desconto; upsell automático no carrinho; login/cadastro do
cliente; mensagem de status ao cliente no WhatsApp (Make.com); autocadastro multi-loja.

---

## CRITÉRIOS DE ACEITAÇÃO (Fase 1)

- Cliente monta açaí (recipiente, tamanho, base(s), acompanhamentos com preço), escolhe
  combo, e finaliza só com nome e telefone.
- Taxa fixa aparece no resumo; retirada zera a taxa; tempo dinâmico sobe com o volume.
- Fora do horário, navega mas não finaliza.
- Pedido cai no painel em tempo real, com som.
- Impressão só após o aceite; 2 vias de entregador + N vias de produção (1 por item) no
  formato definido.
- Operator não enxerga financeiro/CRM; owner enxerga tudo (telas financeiras na fase 2).
- Item marcado esgotado some do cardápio na hora.
- Qualquer alteração no painel (taxa, horário, preço, produto) reflete no cardápio na hora.
- GTM dispara purchase com valor real.

---

## ENTREGÁVEIS

1. Código do cardápio público + painel (HTML/CSS/JS), pronto pro GitHub/Netlify.
2. Migrations SQL do Supabase (schema + RLS + seed do cardápio Açaí Mais Sabor).
3. Guia passo a passo: criar Supabase, rodar as migrations, pegar as chaves, conectar.
4. Guia de configuração da impressora térmica.
