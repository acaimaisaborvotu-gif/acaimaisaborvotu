# Guia da Impressora Térmica

A impressão é controlada pelo navegador, direto na impressora USB da loja, usando
**ESC/POS** (padrão da maioria das térmicas). É o que faltou no chefgourmet.

## O que sai impresso
Quando a loja clica em **Aceitar** um pedido:
- **2 vias do entregador** (iguais): número do pedido, quantidade de itens da sacola,
  nome, telefone, endereço, forma de pagamento e valor a receber (com troco), taxa.
- **1 papel por item** na produção: número do pedido, "Item XX de NN", "Itens no pedido: N",
  e a descrição (recipiente, tamanho, base e acompanhamentos). Pedido com 4 itens = 4 papéis.

## Requisitos
- **Computador** na loja (não funciona pra imprimir pelo celular).
- Navegador **Google Chrome** ou **Microsoft Edge** (eles têm a Web Serial API).
- Impressora térmica **ESC/POS** conectada por **USB**.

## Como configurar (uma vez)
1. Conecte a impressora no USB e ligue.
2. Abra o painel no Chrome, vá na aba **Impressora**.
3. Clique em **Conectar impressora**. O navegador abre uma janelinha com os dispositivos:
   escolha a sua impressora e clique em **Conectar**.
4. Clique em **Imprimir teste**. Se sair o papel de teste, está pronto.

A partir daí, toda vez que você **aceitar** um pedido, as vias saem sozinhas.

> O navegador lembra da impressora autorizada. Se mudar de computador ou navegador,
> refaça o passo 3.

## Ajustes
- **Largura do papel:** o padrão é 58mm (32 colunas). Se a sua bobina for 80mm,
  abra `app/assets/js/printing.js` e troque `const WIDTH = 32;` por `48`.
- **Acentos:** os textos saem sem acento de propósito (ex: "Acai"), pra não embaralhar
  em impressora nenhuma. Quando soubermos o modelo exato, dá pra ligar acentos via
  página de código (codepage) específica.

## Alternativa: QZ Tray (se a Web Serial não funcionar)
Algumas impressoras antigas funcionam melhor com um agente local chamado **QZ Tray**:
1. Baixe em **https://qz.io** e instale no computador da loja.
2. Deixe o QZ Tray aberto (ícone na barra de tarefas).
3. Avise que a loja vai usar QZ Tray que a gente liga esse caminho no código
   (o `printing.js` já está preparado pra isso).

## Resolvendo problemas
- **"Web Serial não suportado":** está usando Safari/Firefox ou celular. Use Chrome no PC.
- **Não acha a impressora:** confira o cabo USB, se está ligada, e o driver no Windows.
- **Imprime cortado:** ajuste a largura (WIDTH) conforme a bobina.
- **Não imprimiu ao aceitar:** vá na aba Impressora e reconecte; depois use o botão 🖨 de reimprimir no pedido.
