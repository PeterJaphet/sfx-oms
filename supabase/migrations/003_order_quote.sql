-- M3: authoritative checkout quotes, percentage discounts and safe save retries.
-- No schema.sql edits, RLS changes or new deletion paths.
begin;
alter table public.orders add column client_request_id uuid;
alter table public.orders add column client_request_payload jsonb;
alter table public.orders add constraint m3_request_pair check ((client_request_id is null)=(client_request_payload is null));
create unique index m3_order_request on public.orders(created_by,client_request_id) where client_request_id is not null;

-- Stable: every menu read in a quote uses the same statement snapshot.
create function public.quote_order(p_order jsonb) returns jsonb
language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare
  uid uuid:=require_role('operations','admin'); it jsonb; v record; ac record;
  extra_list jsonb; extra_sum numeric; qty int; sub numeric:=0; disc numeric; pct numeric;
  priced jsonb:='[]'; payments jsonb:='[]'; paid numeric:=0; cover numeric; received numeric; rate numeric;
  total_amount numeric; pos int:=0; result jsonb;
begin
  if jsonb_typeof(p_order->'items') is distinct from 'array' or jsonb_array_length(p_order->'items')=0 then raise exception 'An order needs at least one item'; end if;
  for it in select * from jsonb_array_elements(p_order->'items') loop
    select pv.id,pv.name variant_name,pv.price,p.id product_id,p.name product_name,pc.name category_name
      into v from product_variants pv join products p on p.id=pv.product_id join product_categories pc on pc.id=p.category_id
      where pv.id=(it->>'variant_id')::uuid and pv.is_active and p.is_active and pc.is_active;
    if v.id is null then raise exception 'Item is not on the active menu: %',it->>'variant_id'; end if;
    qty:=coalesce((it->>'quantity')::int,1);
    if qty<=0 then raise exception 'Quantity must be more than 0'; end if;
    if exists(select 1 from jsonb_array_elements_text(coalesce(it->'addon_ids','[]')) x
      where not exists(select 1 from product_addons pa join addons a on a.id=pa.addon_id
        where pa.product_id=v.product_id and pa.addon_id=x::uuid and pa.is_active and a.is_active)) then
      raise exception 'An extra is not available on %',v.product_name;
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('addon_id',a.id,'name',a.name,'price',a.price) order by a.id),'[]'),coalesce(sum(a.price),0)
      into extra_list,extra_sum from addons a where a.is_active and a.id in(select jsonb_array_elements_text(coalesce(it->'addon_ids','[]'))::uuid);
    priced:=priced||jsonb_build_array(jsonb_build_object('position',pos,'variant_id',v.id,'product_id',v.product_id,
      'product_name',v.product_name,'variant_name',v.variant_name,'category_name',v.category_name,'unit_price',v.price+extra_sum,
      'quantity',qty,'line_total',(v.price+extra_sum)*qty,'addons',extra_list,'note',nullif(it->>'note','')));
    sub:=sub+(v.price+extra_sum)*qty; pos:=pos+1;
  end loop;
  disc:=coalesce((p_order->>'discount_amount')::numeric,0);
  if p_order->>'discount_percent' is not null then
    pct:=(p_order->>'discount_percent')::numeric;
    if pct<0 or pct>100 then raise exception 'Discount percent must be between 0 and 100'; end if;
    if disc<>0 then raise exception 'Choose an amount or percent discount, not both'; end if;
    disc:=round(sub*pct/100,2);
  end if;
  if disc<0 or disc<>round(disc,2) then raise exception 'Discount must be a non-negative amount with at most 2 decimals'; end if;
  if disc>sub then raise exception 'Discount is larger than the order'; end if;
  if disc>0 and nullif(trim(p_order->>'discount_reason'),'') is null then raise exception 'A discount reason is required'; end if;
  total_amount:=sub-disc;
  for it in select * from jsonb_array_elements(coalesce(p_order->'payments','[]')) loop
    cover:=(it->>'amount_try')::numeric;
    if cover is null or cover<=0 then raise exception 'Payment must be more than 0'; end if;
    if cover>9999999999.99 or cover<>round(cover,2) then raise exception 'Payment must have at most 2 decimals'; end if;
    if paid+cover>total_amount+0.005 then raise exception 'Payment of % exceeds the % still due',cover,total_amount-paid; end if;
    select a.id,a.name,a.currency into ac from accounts a where a.id=(it->>'account_id')::smallint and a.is_active;
    if ac.id is null then raise exception 'Unknown account'; end if;
    if ac.currency='TRY' then received:=cover; rate:=1;
    else
      received:=(it->>'amount')::numeric;
      if received is null or received<=0 then raise exception 'Enter the amount received in %',ac.currency; end if;
      if received>999999999999.99 or received<>round(received,2) then raise exception 'Amount received must have at most 2 decimals'; end if;
      rate:=round(cover/received,6);
      if rate<=0 then raise exception 'Payment rate must be more than 0'; end if;
    end if;
    payments:=payments||jsonb_build_array(jsonb_build_object('account_id',ac.id,'account_name',ac.name,'currency',ac.currency,
      'amount',received,'amount_try',cover,'rate_to_try',rate));
    paid:=paid+cover;
  end loop;
  result:=jsonb_build_object('business_date',business_date(),'items',priced,'subtotal',sub,'discount_amount',disc,
    'total',total_amount,'paid_try',paid,'balance_due',total_amount-paid,'payments',payments);
  return result||jsonb_build_object('quote_token',md5(jsonb_build_object('items',priced,'subtotal',sub,'discount_amount',disc)::text));
end $$;
revoke execute on function public.quote_order(jsonb) from public,anon;
grant execute on function public.quote_order(jsonb) to authenticated;

-- Same return type, role guard, numbering lock, snapshots, payment RPC and audit.
-- Snapshot rows and percent discount come from one database quote, never the client.
create or replace function public.create_order(p_order jsonb) returns public.orders
language plpgsql security definer set search_path=public,pg_catalog as $$
declare
  uid uuid:=require_role('operations','admin'); o orders; it jsonb; q jsonb; num int; bdate date:=business_date();
  request_id uuid:=nullif(p_order->>'client_request_id','')::uuid;
  request_payload jsonb:=p_order-'client_request_id'-'quote_token';
begin
  if request_id is not null then
    perform pg_advisory_xact_lock(hashtext('order-request-'||uid::text||request_id::text));
    select * into o from orders where created_by=uid and client_request_id=request_id;
    if o.id is not null then
      if o.client_request_payload is distinct from request_payload then raise exception 'This save request already belongs to another order'; end if;
      return o;
    end if;
  end if;
  q:=quote_order(p_order);
  if p_order->>'quote_token' is not null and p_order->>'quote_token' is distinct from q->>'quote_token' then
    raise exception 'Menu prices changed; review the updated total before saving';
  end if;
  perform pg_advisory_xact_lock(hashtext('order-number-'||bdate));
  select coalesce(max(daily_number),0)+1 into num from orders where business_date=bdate;
  insert into orders(business_date,daily_number,channel,order_type,customer_name,customer_phone,delivery_address,note,
    discount_amount,discount_reason,subtotal,total,created_by,client_request_id,client_request_payload)
  values(bdate,num,(p_order->>'channel')::order_channel,coalesce((p_order->>'order_type')::order_type,'pickup'),
    nullif(p_order->>'customer_name',''),nullif(p_order->>'customer_phone',''),nullif(p_order->>'delivery_address',''),nullif(p_order->>'note',''),
    (q->>'discount_amount')::numeric,nullif(trim(p_order->>'discount_reason'),''),(q->>'subtotal')::numeric,(q->>'total')::numeric,uid,
    request_id,case when request_id is not null then request_payload end) returning * into o;
  for it in select * from jsonb_array_elements(q->'items') loop
    insert into order_items(order_id,variant_id,product_id,product_name,variant_name,category_name,unit_price,quantity,addons,note)
    values(o.id,(it->>'variant_id')::uuid,(it->>'product_id')::uuid,it->>'product_name',it->>'variant_name',it->>'category_name',
      (it->>'unit_price')::numeric,(it->>'quantity')::int,it->'addons',it->>'note');
  end loop;
  -- Retain the original payment guard and ledger function, even after quote validation.
  for it in select * from jsonb_array_elements(coalesce(p_order->'payments','[]')) loop
    perform add_order_payment(o.id,(it->>'account_id')::smallint,(it->>'amount_try')::numeric,(it->>'amount')::numeric);
  end loop;
  perform log_activity('order.create','orders',o.id::text,jsonb_build_object('number',o.daily_number,'total',o.total));
  return o;
end $$;
-- CREATE OR REPLACE preserves the existing create_order ACL; restate it explicitly.
revoke execute on function public.create_order(jsonb) from public,anon;
grant execute on function public.create_order(jsonb) to authenticated;
commit;
