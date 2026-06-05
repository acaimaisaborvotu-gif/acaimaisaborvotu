-- =============================================================================
-- AÇAÍ MAIS SABOR — Schema inicial (Supabase / Postgres)
-- Multi-loja com Row Level Security. Cardápio e configurações em JSONB editável.
-- Rode este arquivo inteiro no SQL Editor do Supabase (veja docs/GUIA-SUPABASE.md).
-- =============================================================================

-- ---- Lojas -------------------------------------------------------------------
create table if not exists public.stores (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,         -- ex: 'acai-mais-sabor'
  nome        text not null,
  cidade      text,
  whatsapp    text,
  created_at  timestamptz default now()
);

-- ---- Perfis de usuário (liga ao auth.users) ----------------------------------
-- role: 'owner' (dono, vê tudo) | 'operator' (operação, sem financeiro/CRM)
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  store_slug  text not null references public.stores(slug),
  role        text not null default 'operator' check (role in ('owner','operator')),
  nome        text,
  created_at  timestamptz default now()
);

-- ---- Configuração da loja (cardápio + ajustes operacionais, tudo editável) ----
create table if not exists public.store_config (
  store_slug  text primary key references public.stores(slug) on delete cascade,
  menu        jsonb,   -- catálogo completo (mesma estrutura do menu-data.js)
  settings    jsonb,   -- taxa, horário, tempo dinâmico, pagamentos, impressora
  updated_at  timestamptz default now()
);

-- ---- Pedidos -----------------------------------------------------------------
create table if not exists public.orders (
  id             uuid primary key default gen_random_uuid(),
  store_slug     text not null references public.stores(slug),
  daily_number   int,
  status         text not null default 'novo'
                 check (status in ('novo','aceito','producao','pronto','saiu','entregue','cancelado')),
  customer_name  text not null,
  customer_phone text not null,
  delivery_type  text not null default 'entrega' check (delivery_type in ('entrega','retirada')),
  address        text,
  payment_method text,
  change_for     text,
  subtotal       numeric(10,2) not null default 0,
  delivery_fee   numeric(10,2) not null default 0,
  total          numeric(10,2) not null default 0,
  items          jsonb not null default '[]',
  eta_min        int,
  eta_max        int,
  printed        boolean not null default false,
  created_at     timestamptz default now(),
  accepted_at    timestamptz,
  updated_at     timestamptz default now()
);
create index if not exists orders_store_status_idx on public.orders (store_slug, status);
create index if not exists orders_store_created_idx on public.orders (store_slug, created_at);

-- Numeração diária por loja (001, 002, ... reinicia a cada dia)
create or replace function public.set_daily_number() returns trigger as $$
begin
  select coalesce(max(daily_number), 0) + 1 into new.daily_number
  from public.orders
  where store_slug = new.store_slug
    and created_at >= date_trunc('day', now());
  return new;
end; $$ language plpgsql;

drop trigger if exists trg_daily_number on public.orders;
create trigger trg_daily_number before insert on public.orders
  for each row execute function public.set_daily_number();

create or replace function public.touch_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end; $$ language plpgsql;

drop trigger if exists trg_orders_touch on public.orders;
create trigger trg_orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();

-- ---- Helper: usuário é staff da loja? ----------------------------------------
create or replace function public.is_staff(p_store text) returns boolean as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and store_slug = p_store
  );
$$ language sql security definer stable;

create or replace function public.is_owner(p_store text) returns boolean as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and store_slug = p_store and role = 'owner'
  );
$$ language sql security definer stable;

-- ---- Row Level Security ------------------------------------------------------
alter table public.stores       enable row level security;
alter table public.profiles     enable row level security;
alter table public.store_config enable row level security;
alter table public.orders       enable row level security;

-- stores: leitura pública (o cardápio precisa do nome/whatsapp); escrita só staff
drop policy if exists stores_read on public.stores;
create policy stores_read on public.stores for select using (true);

-- profiles: cada um vê o próprio; staff vê os da mesma loja
drop policy if exists profiles_self on public.profiles;
create policy profiles_self on public.profiles for select
  using (id = auth.uid() or is_staff(store_slug));

-- store_config: leitura pública (cardápio lê o menu/settings); escrita só staff
drop policy if exists config_read on public.store_config;
create policy config_read on public.store_config for select using (true);
drop policy if exists config_write on public.store_config;
create policy config_write on public.store_config for all
  using (is_staff(store_slug)) with check (is_staff(store_slug));

-- orders: cliente (anon) cria pedido novo; staff lê e atualiza os da sua loja
drop policy if exists orders_insert_public on public.orders;
create policy orders_insert_public on public.orders for insert
  with check (status = 'novo');
drop policy if exists orders_staff_read on public.orders;
create policy orders_staff_read on public.orders for select
  using (is_staff(store_slug));
drop policy if exists orders_staff_update on public.orders;
create policy orders_staff_update on public.orders for update
  using (is_staff(store_slug)) with check (is_staff(store_slug));

-- ---- Realtime: publica orders e store_config ---------------------------------
do $$ begin
  alter publication supabase_realtime add table public.orders;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.store_config;
exception when duplicate_object then null; end $$;

-- ---- Storage: bucket de fotos dos produtos -----------------------------------
insert into storage.buckets (id, name, public)
  values ('fotos', 'fotos', true)
  on conflict (id) do nothing;

drop policy if exists fotos_public_read on storage.objects;
create policy fotos_public_read on storage.objects for select
  using (bucket_id = 'fotos');
drop policy if exists fotos_staff_write on storage.objects;
create policy fotos_staff_write on storage.objects for insert
  to authenticated with check (bucket_id = 'fotos');
drop policy if exists fotos_staff_update on storage.objects;
create policy fotos_staff_update on storage.objects for update
  to authenticated using (bucket_id = 'fotos');
