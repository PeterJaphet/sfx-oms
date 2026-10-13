-- M3: retain retry equality without exposing submitted payment/customer data.
-- Convert only duplicate request metadata; original order snapshots and ledger stay intact.
begin;
alter table public.orders rename column client_request_payload to client_request_hash;
alter table public.orders alter column client_request_hash type text
  using encode(sha256(convert_to(client_request_hash::text,'UTF8')),'hex');
create or replace function public.create_order(p_order jsonb) returns public.orders
language plpgsql security definer set search_path=public,pg_catalog as $$
declare
  uid uuid:=require_role('operations','admin'); o orders; it jsonb; q jsonb; num int; bdate date:=business_date();
  request_id uuid:=nullif(p_order->>'client_request_id','')::uuid;
  request_hash text:=encode(sha256(convert_to((p_order-'client_request_id'-'quote_token')::text,'UTF8')),'hex');
begin
  if request_id is not null then
    perform pg_advisory_xact_lock(hashtext('order-request-'||uid::text||request_id::text));
    select * into o from orders where created_by=uid and client_request_id=request_id;
    if o.id is not null then
      if o.client_request_hash is distinct from request_hash then raise exception 'This save request already belongs to another order'; end if;
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
    discount_amount,discount_reason,subtotal,total,created_by,client_request_id,client_request_hash)
  values(bdate,num,(p_order->>'channel')::order_channel,coalesce((p_order->>'order_type')::order_type,'pickup'),
    nullif(p_order->>'customer_name',''),nullif(p_order->>'customer_phone',''),nullif(p_order->>'delivery_address',''),nullif(p_order->>'note',''),
    (q->>'discount_amount')::numeric,nullif(trim(p_order->>'discount_reason'),''),(q->>'subtotal')::numeric,(q->>'total')::numeric,uid,
    request_id,case when request_id is not null then request_hash end) returning * into o;
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
revoke execute on function public.create_order(jsonb) from public,anon;
grant execute on function public.create_order(jsonb) to authenticated;
commit;
