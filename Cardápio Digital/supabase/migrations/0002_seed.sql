-- =============================================================================
-- SEED — cria a loja Açaí Mais Sabor.
-- O cardápio completo (produtos, preços, combos) é publicado pelo PAINEL, no
-- botão "Publicar cardápio", a partir do menu-data.js. Assim o menu-data.js
-- segue como fonte única e você edita tudo pelo painel depois.
-- =============================================================================

insert into public.stores (slug, nome, cidade, whatsapp)
values ('acai-mais-sabor', 'Açaí Mais Sabor', 'Votuporanga/SP', '5517996653639')
on conflict (slug) do nothing;

insert into public.store_config (store_slug, menu, settings)
values ('acai-mais-sabor', null, null)
on conflict (store_slug) do nothing;

-- -----------------------------------------------------------------------------
-- DEPOIS de criar seu usuário em Authentication > Users, rode o bloco abaixo
-- trocando o e-mail para virar DONO (owner) da loja:
--
-- insert into public.profiles (id, store_slug, role, nome)
-- select id, 'acai-mais-sabor', 'owner', 'Dono'
-- from auth.users where email = 'SEU-EMAIL-AQUI@exemplo.com'
-- on conflict (id) do update set role = 'owner', store_slug = 'acai-mais-sabor';
-- -----------------------------------------------------------------------------
