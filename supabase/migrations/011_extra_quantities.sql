-- M12: extra quantities are totals for the whole dish line, independent of dish quantity.
-- Preserve original generated line_total, historic prices, RPC-only writes, RLS and closed-day guards.
begin;
create function public.order_extras_amount(p_extras jsonb) returns numeric
language plpgsql immutable security invoker set search_path=public,pg_catalog as $$
declare x jsonb; qty numeric; price numeric; total_amount numeric:=0;
begin
  if jsonb_typeof(p_extras) is distinct from 'array' then raise exception 'Extras must be a list'; end if;
  for x in select * from jsonb_array_elements(p_extras) loop
    if jsonb_typeof(x) is distinct from 'object' or jsonb_typeof(x->'quantity') is distinct from 'number' or
      jsonb_typeof(x->'price') is distinct from 'number' then raise exception 'Invalid extra snapshot'; end if;
    qty:=(x->>'quantity')::numeric; price:=(x->>'price')::numeric;
    if qty<1 or qty>999 or qty<>trunc(qty) or price<0 or price<>round(price,2) then raise exception 'Invalid extra snapshot'; end if;
    total_amount:=total_amount+qty*price;
  end loop;
  return total_amount;
end $$;
revoke all on function public.order_extras_amount(jsonb) from public,anon,authenticated;
alter table public.order_items
  add column extras_total numeric(12,2) not null default 0 check (extras_total>=0),
  add column extras_priced_separately boolean not null default false,
  add column charged_total numeric(12,2) generated always as (unit_price*quantity+extras_total) stored,
  add constraint m12_extra_snapshot_amount check (case when extras_priced_separately
    then extras_total=public.order_extras_amount(addons) else extras_total=0 end);
comment on column public.order_items.line_total is 'Original generated dish amount; legacy rows include per-dish extras in unit_price. Read charged_total for the full charged line.';
comment on column public.order_items.charged_total is 'Database generated full charged line, including independently quantified extras.';
create or replace function public.quote_order(p_order jsonb) returns jsonb
language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare
  uid uuid:=require_role('operations','admin'); it jsonb; v record; ac record;
  extra_list jsonb; extra_sum numeric; qty int; sub numeric:=0; disc numeric; pct numeric;
  priced jsonb:='[]'; payments jsonb:='[]'; paid numeric:=0; cover numeric; received numeric; rate numeric;
  total_amount numeric; pos int:=0; result jsonb; extra jsonb; selected_extra record; seen uuid[]; extra_qty int;
begin
  if jsonb_typeof(p_order->'items') is distinct from 'array' or jsonb_array_length(p_order->'items')=0 then raise exception 'An order needs at least one item'; end if;
  for it in select * from jsonb_array_elements(p_order->'items') loop
    select pv.id,pv.name variant_name,pv.price,p.id product_id,p.name product_name,pc.name category_name
      into v from product_variants pv join products p on p.id=pv.product_id join product_categories pc on pc.id=p.category_id
      where pv.id=(it->>'variant_id')::uuid and pv.is_active and p.is_active and pc.is_active;
    if v.id is null then raise exception 'Item is not on the active menu: %',it->>'variant_id'; end if;
    qty:=coalesce((it->>'quantity')::int,1);
    if qty<=0 then raise exception 'Quantity must be more than 0'; end if;
    if it ? 'extras' then
      if it ? 'addon_ids' then raise exception 'Choose extra quantities or legacy extras, not both'; end if;
      if qty>999 then raise exception 'Use at most 999 dishes per item'; end if;
      if jsonb_typeof(it->'extras') is distinct from 'array' then raise exception 'Extras must be a list'; end if;
      extra_list:='[]'; extra_sum:=0; seen:=array[]::uuid[];
      for extra in select * from jsonb_array_elements(it->'extras') loop
        if jsonb_typeof(extra) is distinct from 'object' or jsonb_typeof(extra->'quantity') is distinct from 'number' then
          raise exception 'Extra quantity must be a whole number from 1 to 999';
        end if;
        if (extra->>'quantity')::numeric<1 or (extra->>'quantity')::numeric>999 or
          (extra->>'quantity')::numeric<>trunc((extra->>'quantity')::numeric) then
          raise exception 'Extra quantity must be a whole number from 1 to 999';
        end if;
        extra_qty:=(extra->>'quantity')::numeric::int;
        select ad.id,ad.name,ad.price into selected_extra from addons ad join product_addons pa on pa.addon_id=ad.id
          where pa.product_id=v.product_id and ad.id=(extra->>'addon_id')::uuid and pa.is_active and ad.is_active;
        if selected_extra.id is null then raise exception 'An extra is not available on %',v.product_name; end if;
        if selected_extra.id=any(seen) then raise exception 'Choose each extra only once'; end if;
        seen:=array_append(seen,selected_extra.id);
        extra_list:=extra_list||jsonb_build_array(jsonb_build_object('addon_id',selected_extra.id,'name',selected_extra.name,'price',selected_extra.price,'quantity',extra_qty));
        extra_sum:=extra_sum+selected_extra.price*extra_qty;
      end loop;
      select coalesce(jsonb_agg(x order by x->>'addon_id'),'[]') into extra_list from jsonb_array_elements(extra_list) x;
      if v.price*qty+extra_sum>9999999999.99 then raise exception 'Item total is too large'; end if;
      priced:=priced||jsonb_build_array(jsonb_build_object('position',pos,'variant_id',v.id,'product_id',v.product_id,
        'product_name',v.product_name,'variant_name',v.variant_name,'category_name',v.category_name,'unit_price',v.price,
        'quantity',qty,'extras_total',extra_sum,'extras_priced_separately',true,'line_total',v.price*qty+extra_sum,
        'addons',extra_list,'note',nullif(it->>'note','')));
      sub:=sub+v.price*qty+extra_sum;
    else
      -- Preserve legacy quote tokens and per-dish pricing for installed clients and pending retries.
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
    sub:=sub+(v.price+extra_sum)*qty;
    end if;
    pos:=pos+1;
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


create or replace function public.create_order(p_order jsonb) returns public.orders
language plpgsql security definer set search_path=public,pg_catalog as $$
declare
  uid uuid:=require_role('operations','admin'); o orders; it jsonb; q jsonb; num int; bdate date:=business_date();
  request_id uuid:=nullif(p_order->>'client_request_id','')::uuid;
  request_hash text:=encode(sha256(convert_to((p_order-'client_request_id'-'quote_token')::text,'UTF8')),'hex');
begin
  perform public.m8_lock_current_day();
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
    insert into order_items(order_id,variant_id,product_id,product_name,variant_name,category_name,unit_price,quantity,addons,note,extras_total,extras_priced_separately)
    values(o.id,(it->>'variant_id')::uuid,(it->>'product_id')::uuid,it->>'product_name',it->>'variant_name',it->>'category_name',
      (it->>'unit_price')::numeric,(it->>'quantity')::int,it->'addons',it->>'note',coalesce((it->>'extras_total')::numeric,0),coalesce((it->>'extras_priced_separately')::boolean,false));
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

create or replace view v_items_sold_daily with (security_invoker = on) as
select o.business_date, i.category_name, i.product_id, i.product_name, i.variant_name,
       sum(i.quantity)::int as quantity, sum(i.charged_total)::numeric(14,2) as revenue
from order_items i join orders o on o.id = i.order_id
where o.status <> 'cancelled'
group by 1, 2, 3, 4, 5;

-- Extras sold per day (Swallow, Fish, Turkey...): added to a plate or sold on their own.
create or replace view v_extras_sold_daily with (security_invoker = on) as
with sold as (
  select o.business_date, x->>'name' as extra_name, case when i.extras_priced_separately then (x->>'quantity')::int else i.quantity end as on_plate, 0 as standalone,
         (case when i.extras_priced_separately then (x->>'quantity')::int else i.quantity end) * (x->>'price')::numeric as revenue
  from order_items i join orders o on o.id = i.order_id, jsonb_array_elements(i.addons) x
  where o.status <> 'cancelled'
  union all
  select o.business_date, a.name, 0, i.quantity, i.charged_total
  from order_items i join orders o on o.id = i.order_id
  join products p on p.id = i.product_id join addons a on a.id = p.addon_id
  where o.status <> 'cancelled'
)
select business_date, extra_name,
       sum(on_plate)::int as on_plate, sum(standalone)::int as standalone,
       sum(on_plate + standalone)::int as quantity, sum(revenue)::numeric(14,2) as revenue
from sold group by 1, 2;


create or replace function list_delivery_orders() returns jsonb
language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare uid uuid:=require_role('logistics','admin'); result jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',o.id,'business_date',o.business_date,'daily_number',o.daily_number,'channel',o.channel,
    'order_type',o.order_type,'status',o.status,'customer_name',o.customer_name,'customer_phone',o.customer_phone,
    'delivery_address',o.delivery_address,'note',o.note,'subtotal',o.subtotal,'discount_amount',o.discount_amount,
    'discount_reason',o.discount_reason,'total',o.total,'created_at',o.created_at,
    'ready_at',o.ready_at,'picked_up_at',o.picked_up_at,'paid_try',p.paid_try,'balance_due',p.balance_due,
    'items',(select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'product_name',i.product_name,
      'variant_name',i.variant_name,'quantity',i.quantity,'line_total',i.charged_total,'addons',i.addons,'note',i.note) order by i.id),'[]')
      from order_items i where i.order_id=o.id)
    ) order by coalesce(o.ready_at,o.created_at),o.created_at,o.id),'[]') into result
  from orders o join v_order_payments p on p.id=o.id
  where o.order_type='delivery' and o.status in ('ready','picked_up');
  return result;
end $$;
revoke all on function list_delivery_orders() from public,anon;
grant execute on function list_delivery_orders() to authenticated;

commit;
