-- =============================================================================
-- place_order: o cliente cria o pedido por esta função (SECURITY DEFINER),
-- sem mexer direto na tabela. Retorna id + número do dia. Mais seguro.
-- =============================================================================

create or replace function public.place_order(p jsonb)
returns table (id uuid, daily_number int)
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_num int;
begin
  insert into public.orders (
    store_slug, status, customer_name, customer_phone, delivery_type, address,
    payment_method, change_for, subtotal, delivery_fee, total, items, eta_min, eta_max
  ) values (
    p->>'store_slug', 'novo', p->>'customer_name', p->>'customer_phone',
    coalesce(p->>'delivery_type', 'entrega'), p->>'address',
    p->>'payment_method', p->>'change_for',
    coalesce((p->>'subtotal')::numeric, 0), coalesce((p->>'delivery_fee')::numeric, 0),
    coalesce((p->>'total')::numeric, 0), coalesce(p->'items', '[]'::jsonb),
    (p->>'eta_min')::int, (p->>'eta_max')::int
  )
  returning orders.id, orders.daily_number into v_id, v_num;
  return query select v_id, v_num;
end; $$;

grant execute on function public.place_order(jsonb) to anon, authenticated;

-- remove pedidos de teste, se houver
delete from public.orders where customer_name like 'TESTE%';
