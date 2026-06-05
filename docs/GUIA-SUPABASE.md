# Guia do Supabase (passo a passo)

O Supabase é o "cérebro" nos bastidores: banco de dados, login da loja, tempo real
(o pedido aparece no painel sozinho) e onde ficam as fotos. É gratuito pra começar.
Você faz isto **uma vez**. Leva uns 15 minutos.

---

## 1. Criar a conta e o projeto

1. Acesse **https://supabase.com** e clique em **Start your project**. Entre com o Google ou e-mail.
2. Clique em **New project**.
   - **Name:** `acai-mais-sabor`
   - **Database Password:** crie uma senha forte e **guarde** (anote num lugar seguro).
   - **Region:** escolha **South America (São Paulo)**.
3. Clique em **Create new project** e espere uns 2 minutos (ele monta o banco).

---

## 2. Rodar o banco de dados (as "migrations")

1. No menu da esquerda, clique em **SQL Editor**.
2. Clique em **+ New query**.
3. Abra o arquivo `supabase/migrations/0001_init.sql` (desta pasta), **copie tudo** e cole no editor.
4. Clique em **Run** (canto inferior direito). Deve aparecer "Success".
5. Abra **+ New query** de novo, cole o conteúdo de `supabase/migrations/0002_seed.sql` e clique em **Run**.

Pronto: as tabelas, a segurança (RLS), o tempo real e o espaço das fotos estão criados.

---

## 3. Pegar as 2 chaves

1. No menu da esquerda, vá em **Project Settings** (engrenagem) > **API**.
2. Copie:
   - **Project URL** (algo como `https://abcdefgh.supabase.co`)
   - **anon public** (uma chave longa começando com `eyJ...`)
3. Abra o arquivo `app/assets/js/config.js` e cole:

```js
export const CONFIG = {
  SUPABASE_URL: 'https://abcdefgh.supabase.co',   // <- cole aqui
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiInR5cCI6...', // <- cole aqui
  STORE_ID: 'acai-mais-sabor',
  GTM_ID: 'GTM-WC3TM37P',
  WHATSAPP_FALLBACK: '5517996653639',
};
```

> A chave **anon public** pode ficar no código sem problema: ela só faz o que a
> segurança (RLS) permite (criar pedido, ler o cardápio). **Nunca** use a chave
> `service_role` aqui.

---

## 4. Criar o login da loja

1. No menu, vá em **Authentication** > **Users** > **Add user** > **Create new user**.
2. Coloque o e-mail e a senha que a loja vai usar pra entrar no painel. (desmarque "Auto confirm" se quiser, mas marcar é mais simples)
3. Agora vá em **SQL Editor** > **New query** e rode o bloco abaixo, **trocando o e-mail**:

```sql
insert into public.profiles (id, store_slug, role, nome)
select id, 'acai-mais-sabor', 'owner', 'Dono'
from auth.users where email = 'EMAIL-DA-LOJA@exemplo.com'
on conflict (id) do update set role = 'owner', store_slug = 'acai-mais-sabor';
```

Isso transforma esse usuário no **dono** (vê tudo no painel).

### Adicionar a funcionária depois (perfil operação)
Crie outro usuário em Authentication, e rode o mesmo bloco trocando `'owner'` por `'operator'`
e o e-mail. A operação não vê faturamento nem CRM.

---

## 5. Publicar o cardápio

1. Abra o **painel** (`/painel/` do seu site), entre com o login que você criou.
2. Vá na aba **Cardápio** e clique em **Publicar cardápio agora**.
   Isso joga todo o cardápio (combos, tamanhos, acompanhamentos, preços) pro banco.
3. A partir daí, tudo que você editar no painel (preço, esgotado, destaque, foto, taxa, horário)
   aparece **na hora** pro cliente.

---

## Pronto!
- Cardápio do cliente: a página inicial do site.
- Painel da loja: `/painel/`.
- Os pedidos caem no painel em tempo real, com som.

Qualquer chave trocada ou projeto novo, é só repetir o passo 3.
