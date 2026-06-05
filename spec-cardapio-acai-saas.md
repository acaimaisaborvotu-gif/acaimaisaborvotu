== SPEC: Cardápio Digital de Delivery + Painel de Gestão (SaaS) ==
Cliente piloto: Açaí Mais Sabor (Votuporanga, SP)
Responsável: Nathan Ferreira
Status: rascunho para revisão

---

## OBJETIVO

Sistema próprio de cardápio digital de delivery de açaí, com painel de gestão de pedidos, impressão térmica controlada, CRM e fidelidade. Substitui Cardápio Web/Goomer/Anota Aí, com a vantagem de rastreamento total (GTM) e zero comissão de plataforma. Começa com uma loja (Açaí Mais Sabor) e é modelado para virar SaaS multi-loja depois.

---

## ESCOPO — O QUE SERÁ ENTREGUE

### A) Cardápio do cliente final (frontend público)

1. Cardápio responsivo e bonito, padrão dos apps de delivery (header com banner/logo, categorias, card de produto com foto e preço, busca, sacola flutuante).
2. Montagem do produto via modal:
   - Recipiente: copo ou tigela
   - Tamanho: 300ml, 400ml, 500ml (configurável no painel)
   - Base/açaí (puro, com cupuaçu, etc., configurável)
   - Acompanhamentos: seleção múltipla com +/- (grátis até X, excedente pago, configurável)
   - Observação livre do cliente
3. Upsell no avanço do carrinho: sugestão automática de item/adicional para subir ticket médio ("adicione Nutella por R$X", "leve mais um copo com desconto"). Regra configurável no painel.
4. Cupom de desconto: campo no checkout, validação de código (percentual ou valor fixo, validade, uso único ou múltiplo).
5. Checkout em etapas:
   - Etapa 1: nome + telefone (pedido já fica identificado)
   - Etapa 2: endereço de entrega ou retirada
   - Etapa 3: forma de pagamento (pagamento na entrega: dinheiro com troco, cartão na maquininha, PIX na entrega)
6. Taxa de entrega exibida como adicional no resumo final, calculada por zona/bairro (mais longe = maior). Retirada na loja = taxa zero.
7. Tempo de entrega estimado exibido ao cliente, dinâmico: aumenta conforme o volume de pedidos abertos no momento (regra de incremento configurável) e conforme a distância da zona de entrega.
8. Abrir/fechar delivery por horário de funcionamento: fora do horário o cliente acessa e navega o cardápio, mas o botão de finalizar fica bloqueado com aviso ("estamos fechados, abrimos às X").
9. Login opcional do cliente (cadastro com e-mail/telefone + senha) para guardar dados, histórico e entrar no programa de fidelidade. Checkout sem login continua permitido (só nome + telefone).
10. Programa de fidelidade: a cada X copos comprados, ganha Y de desconto ou cashback (modelo a definir nas decisões abertas).
11. Acompanhamento de status pelo cliente: ao mudar para "saiu para entrega", dispara mensagem ao cliente.

### B) Painel de gestão (admin da loja)

12. Recebimento de pedidos em tempo real (sem refresh), com alerta sonoro de pedido novo.
13. Fluxo de status do pedido: Novo > Aceito > Em produção > Pronto > Saiu para entrega > Entregue. Cada avanço é manual no painel.
14. Aceite obrigatório antes da impressão: o pedido só imprime depois que a loja clica em "Aceitar".
15. Gestão de cardápio: trocar foto dos produtos e acompanhamentos, editar nome, preço, tamanhos e adicionais.
16. Controle de estoque simples: marcar item ou acompanhamento como esgotado, que some do cardápio do cliente na hora. Reativar quando voltar.
17. Gestão de destaques: trocar item em destaque/promoção do dia.
18. Configurações operacionais: horário de funcionamento, zonas e taxas de entrega, regra de tempo dinâmico, regra de upsell, cupons.
19. Dashboard de negócio: faturamento, quantidade de pedidos, pedidos por dia do mês, ticket médio, produtos mais vendidos.
20. CRM: ficha de cada cliente com histórico de pedidos, frequência, valor total gasto, último pedido, para follow up posterior.

### C) Controle de acesso e permissões

21. Login com senha para a loja.
22. Multi-usuário com dois perfis:
    - Dono/Gestor: acesso total (pedidos, cardápio, configurações, dashboard de faturamento, CRM).
    - Funcionária/Operação: acessa pedidos, opera o fluxo, imprime, troca destaque/foto do cardápio. NÃO vê dashboard de faturamento, quantidade de pedidos nem CRM financeiro.
23. Possibilidade de adicionar mais usuários e definir o perfil de cada um.

### D) Impressão térmica (USB, na loja)

24. Impressão acionada somente após o aceite do pedido.
25. Impressora térmica conectada por USB ao computador da loja, controlada pelo navegador (Chrome via Web Serial API) ou por agente local (QZ Tray) como alternativa.
26. Via do entregador (2 vias iguais), contendo:
    - Número do pedido
    - Quantidade total de itens do pedido (para conferência da sacola)
    - Endereço de entrega, nome e telefone do cliente
    - Forma de pagamento e valor a receber (com troco, se houver)
    - Taxa de entrega
27. Via de produção (cozinha): impressão de 1 papel separado por item do pedido. Pedido com 4 itens (4 copos diferentes) gera 4 papéis distintos. Cada papel contém obrigatoriamente: o número do pedido, a quantidade total de itens daquele pedido, qual item é (XX de total) e a descrição do item (recipiente, tamanho, base e acompanhamentos). Formato:

```
Pedido 001
Item 01 de 04  |  Itens no pedido: 4
--------------------
Açaí tigela 300ml
Banana
====================

Pedido 001
Item 02 de 04  |  Itens no pedido: 4
--------------------
Açaí copo 500ml
Morango
====================

Pedido 001
Item 03 de 04  |  Itens no pedido: 4
--------------------
Açaí copo 400ml
Nutella
Banana
====================

Pedido 001
Item 04 de 04  |  Itens no pedido: 4
--------------------
Açaí tigela 500ml
Puro, sem acompanhamento
====================
```

Regra: a numeração XX de total e a quantidade de itens são geradas automaticamente conforme a quantidade de itens do pedido. Pedido com 1 item gera 1 papel (Item 01 de 01), pedido com 7 itens gera 7 papéis.

### E) Rastreamento

28. Google Tag Manager instalado no HTML de todas as páginas do cardápio.
29. dataLayer disparando eventos da jornada: view_item, add_to_cart, begin_checkout, add_payment_info, purchase (com valor real do pedido), para distribuir a Meta, GA4 e Google Ads via GTM.

### F) Infraestrutura e deploy

30. Código versionado no GitHub.
31. Frontend (cardápio + painel) hospedado no Netlify.
32. Backend (banco, login, tempo real, fotos) no Supabase.
33. Mensageria de status ao cliente via Make.com (webhook do pedido para WhatsApp).

---

## O QUE NÃO ENTRA NESTA FASE (fase 1, loja única)

- Cobrança/pagamento online (PIX automático, cartão online). Pagamento é na entrega.
- Painel de SaaS para autocadastro de novas lojas e cobrança de mensalidade (vem na fase 2, multi-loja).
- App nativo (iOS/Android). É web responsivo.
- Integração com motoboy terceirizado/rastreamento de entregador em mapa.
- Emissão de nota fiscal.

---

## REQUISITOS TÉCNICOS

- Frontend: HTML/CSS/JS (migrável para React no painel se escalar).
- Backend: Supabase (Postgres, Auth, Realtime, Storage).
- Isolamento de dados por loja: Row Level Security no Supabase (essencial para virar multi-loja sem vazar dado entre lojas).
- Impressão: Web Serial API (Chrome) como caminho principal; QZ Tray como alternativa mais estável. ESC/POS para a térmica.
- Deploy: GitHub > Netlify (frontend) + Supabase (backend) + Make.com (mensageria).
- Sem travessão em nenhuma copy do cardápio ou mensagem ao cliente.

---

## RASTREAMENTO E INTEGRAÇÕES

- GTM em todas as páginas, dataLayer com a jornada completa de compra.
- Evento de conversão principal: purchase com valor do pedido.
- Webhook do pedido para Make.com: salva, notifica a loja e dispara mensagem de status ao cliente no WhatsApp.

---

## CRITÉRIOS DE ACEITAÇÃO

- Cliente monta açaí (copo/tigela, tamanho, base, acompanhamentos), recebe upsell, aplica cupom e finaliza só com nome e telefone.
- Taxa e tempo de entrega aparecem corretos por zona, e o tempo sobe conforme o volume.
- Fora do horário, o cliente navega mas não consegue pedir.
- Pedido cai no painel em tempo real, com som.
- Impressão só ocorre após o aceite, gera 2 vias de entregador e N vias de produção (1 por item) no formato definido.
- Funcionária não enxerga faturamento nem CRM; dono enxerga tudo.
- Item marcado como esgotado some do cardápio do cliente na hora.
- GTM dispara purchase com valor real.
- Cliente recebe mensagem quando o pedido sai para entrega.

---

## DECISÕES ABERTAS (preciso da tua definição)

1. Fidelidade: desconto progressivo ou cashback acumulado? Qual a regra (ex: a cada 10 copos, 1 grátis? ou 5% de cashback por compra)?
2. Taxa de entrega: por bairro/zona nomeada ou por raio de distância em km? Preciso da lista de zonas e valores do Açaí Mais Sabor.
3. Tempo dinâmico: qual a regra de incremento? (ex: base 40min, +10min a cada 5 pedidos abertos).
4. Mensagem ao cliente: WhatsApp via API oficial (tem custo) ou via Make com número da loja? SMS é alternativa.
5. Multi-loja: confirmo começar só com a Açaí Mais Sabor e modelar o banco já preparado para multi-loja, sem construir o autocadastro agora?
6. Impressora: qual modelo/marca a loja tem (ou vai comprar)? A maioria é ESC/POS padrão, mas confirmar evita surpresa.
7. Pagamento na entrega: aceita dinheiro (com troco), cartão na maquininha e PIX na entrega? Algum outro?

---

## MAPA DE COBERTURA (conferência item por item do teu briefing)

- Cardápio bonito acessível pelo cliente: itens 1, A
- Escolher copo/base/tamanho/tigela ou copo/acompanhamentos: item 2
- Sugestão de upsell no avanço para subir ticket: item 3
- Cupom de desconto: item 4
- Finalizar só com nome e telefone, depois endereço e pagamento, pagamento na entrega: item 5
- Cadastro com login/senha + mais dados + fidelidade (X copos = desconto/cashback): itens 9, 10
- Painel recebe todos os pedidos: item 12
- Painel troca foto de itens e acompanhamentos: item 15
- Marcar item esgotado para não aparecer: item 16
- Dashboard (faturamento, qtd pedidos, pedidos por dia, CRM por cliente para follow up): itens 19, 20
- Multi-login com permissões (funcionária vê pedidos/painel/troca destaque, não vê faturamento e qtd): itens 21, 22, 23
- Tempo de entrega que aparece ao cliente e sobe conforme chegam pedidos: item 7
- Taxa de entrega como adicional final, maior para mais longe: item 6
- Abrir/fechar delivery por horário (acessa mas não pede fora do horário): item 8
- GTM no HTML de todas as páginas: itens 28, 29
- Pedido visto no painel e impressão só após aceitar: itens 13, 14, 24
- Impressão entregador: 2 vias com número do pedido e quantidade de itens: item 26
- Impressão produção: 1 papel por item, cada papel com número do pedido + quantidade total de itens + descrição do item: item 27
- Avançar status e avisar cliente que saiu para entrega: itens 11, 13
- Onde subir (GitHub + Netlify): itens 30, 31, 32, 33 (resposta: GitHub + Netlify para o front, Supabase para o backend, Make para a mensagem)
