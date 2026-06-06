# Guia da Impressora Térmica (EPSON TM-T20)

A impressora da loja é uma **EPSON TM-T20**, bobina **58mm**, instalada no Windows com o
nome **CAIXA**. Como ela está instalada como impressora do Windows (e não como porta serial
crua), a impressão é feita pelo **QZ Tray**: um programinha grátis que liga o navegador
direto na impressora e manda o ESC/POS (com corte por item).

## O que sai impresso (quando você aceita um pedido)
- **2 vias do entregador** (iguais): número do pedido, quantidade de itens da sacola,
  nome, telefone, endereço, forma de pagamento e valor a receber (com troco), taxa.
- **1 papel por item** na produção: número do pedido, "Item XX de NN", e a descrição
  (recipiente, tamanho, base e acompanhamentos). Pedido com 4 itens = 4 papéis.

## Configurar (uma vez)

**1. Instalar o QZ Tray**
- No computador da loja (o que tem a impressora), acesse **https://qz.io/download**.
- Baixe e instale o QZ Tray. Depois de instalar, ele fica aberto perto do relógio (ícone).
- Deixe ele sempre aberto.

**2. Conectar no painel**
- Abra o painel no Chrome, vá na aba **Impressora**.
- Clique em **Conectar e listar impressoras**.
- O QZ Tray vai pedir permissão pra esse site. Clique em **Permitir** e marque
  **"Lembrar desta decisão"** (assim não pergunta de novo).
- Na lista que aparecer, escolha a impressora **CAIXA** e clique em **Salvar impressora**.

**3. Testar**
- Clique em **Imprimir teste**. Se sair o papel de teste, está pronto.

A partir daí, toda vez que você **aceitar** um pedido, as vias saem sozinhas.

## Dia a dia
- O QZ Tray precisa estar **aberto** no PC da loja (deixe iniciar junto com o Windows).
- Aceitou o pedido > imprime. Se precisar tirar de novo, use o botão 🖨 no pedido.

## Ajustes
- A bobina é **58mm** (32 colunas), que é o padrão do sistema. Nada a mexer.
- Os textos saem **sem acento** de propósito (ex: "Acai"), pra sair limpo na térmica.

## Resolvendo problemas
- **"QZ Tray não encontrado":** o QZ Tray não está aberto ou não foi instalado. Abra/instale
  e tente de novo.
- **Pediu permissão de novo:** marque "Lembrar desta decisão" na janela do QZ Tray.
- **Não aparece a CAIXA na lista:** confira no Windows se a impressora "CAIXA" está
  instalada e ligada (Painel de Controle > Dispositivos e Impressoras).
- **Imprime cortado/torto:** confirme que a bobina é 58mm.

## Alternativa (não é o caso de vocês)
Se um dia usarem uma impressora que aparece como **porta serial/USB direta**, o painel tem
o botão "Conectar via porta serial" (Web Serial). Pra EPSON TM-T20 instalada como CAIXA,
use o **QZ Tray** acima.
