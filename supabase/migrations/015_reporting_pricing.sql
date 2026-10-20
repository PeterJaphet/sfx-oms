-- M17: price overrides and recipe-based reporting, no rewriting financial history.
begin;
alter table order_items add column catalogue_unit_price numeric(12,2), add column price_override_reason text;
create or replace function public.quote_order(p_order jsonb) returns jsonb
language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare
  uid uuid:=require_role('operations','admin'); it jsonb; v record; ac record;
  extra_list jsonb; extra_sum numeric; qty int; sub numeric:=0; disc numeric; pct numeric;
  priced jsonb:='[]'; payments jsonb:='[]'; paid numeric:=0; cover numeric; received numeric; rate numeric;
  total_amount numeric; pos int:=0; result jsonb; extra jsonb; selected_extra record; seen uuid[]; extra_qty int; catalogue_price numeric; override_price numeric;
begin
  if jsonb_typeof(p_order->'items') is distinct from 'array' or jsonb_array_length(p_order->'items')=0 then raise exception 'An order needs at least one item'; end if;
  for it in select * from jsonb_array_elements(p_order->'items') loop
    select pv.id,pv.name variant_name,pv.price,p.id product_id,p.name product_name,pc.name category_name
      into v from product_variants pv join products p on p.id=pv.product_id join product_categories pc on pc.id=p.category_id
      where pv.id=(it->>'variant_id')::uuid and pv.is_active and p.is_active and pc.is_active;
    if v.id is null then raise exception 'Item is not on the active menu: %',it->>'variant_id'; end if;
    catalogue_price:=v.price;
    if nullif(it->>'unit_price_override','') is not null then
      if not (it ? 'extras') then raise exception 'Price changes require the current order form'; end if;
      override_price:=(it->>'unit_price_override')::numeric;
      if override_price::text in ('NaN','Infinity','-Infinity') or override_price<0 or override_price>9999999999.99 or override_price<>round(override_price,2) then raise exception 'Enter a valid unit price with at most 2 decimals'; end if;
      if nullif(trim(it->>'price_override_reason'),'') is null or length(trim(it->>'price_override_reason'))>300 then raise exception 'Enter a reason for changing the price'; end if;
      v.price:=override_price;
    end if;
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
    if nullif(it->>'unit_price_override','') is not null then
      priced:=jsonb_set(priced,array[pos::text],(priced->pos)||jsonb_build_object('catalogue_unit_price',catalogue_price,'price_override_reason',trim(it->>'price_override_reason')));
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

create or replace function create_trading_order(p_order jsonb) returns orders
language plpgsql security definer set search_path=public,pg_catalog as $$
declare
 uid uuid:=require_role('operations','admin'); o orders; q jsonb; e jsonb; it jsonb;
 d date:=coalesce(nullif(p_order->>'order_date','')::date,public.business_date());
 rid uuid:=nullif(p_order->>'client_request_id','')::uuid;
 h text:=encode(sha256(convert_to((p_order-'quote_token'-'cost_token')::text,'UTF8')),'hex');
 acct accounts; received numeric; num int;
begin
 perform m8_lock_current_day();
 perform pg_advisory_xact_lock(hashtextextended('sfx-costing',0));
 if rid is null then raise exception 'A save request ID is required'; end if;
 perform pg_advisory_xact_lock(hashtext('order-request-'||uid::text||rid::text));
 select * into o from orders where created_by=uid and client_request_id=rid;
 if found then
  if o.client_request_hash is distinct from h then raise exception 'This save request already belongs to another order'; end if;
  return o;
 end if;
 if d>public.business_date() then raise exception 'Cannot enter a future order date'; end if;
 if d<>public.business_date() and app_role()<>'admin' then raise exception 'Only Admin can enter earlier orders'; end if;
 if coalesce(p_order->>'order_type','') not in ('delivery','pickup') then raise exception 'Choose Delivery or Pickup'; end if;
 if p_order->>'order_type'='delivery' and nullif(trim(p_order->>'delivery_address'),'') is null then raise exception 'Enter a delivery address'; end if;
 if jsonb_array_length(coalesce(p_order->'payments','[]'))<>0 then raise exception 'Payments are recorded when delivered'; end if;
 select * into acct from accounts where id=(p_order->>'settlement_account')::smallint and is_active;
 if not found then raise exception 'Choose an active payment account'; end if;
 if acct.name='SFx (legacy USD; review)' then raise exception 'Choose the new SFx TL account for new orders';end if;
 q:=quote_costed_order(p_order);
 if p_order->>'quote_token' is distinct from q->>'quote_token' then raise exception 'Menu prices changed; review the updated total before saving'; end if;
 if p_order->>'cost_token' is distinct from q->>'cost_token' then raise exception 'Costing changed; review the updated profit before saving'; end if;
 e:=q->'costing';
 if (q->>'total')::numeric=0 then received:=0;
 elsif acct.currency='TRY' then received:=(q->>'total')::numeric;
 else
  received:=(p_order->>'settlement_amount')::numeric;
  if received is null or received::text in ('NaN','Infinity','-Infinity') or received<=0 or received>999999999999.99 or received<>round(received,2) then
   raise exception 'Enter the amount to receive in % with at most 2 decimals',acct.currency;
  end if;
 end if;
 perform pg_advisory_xact_lock_shared(hashtextextended('financial-day:'||d::text,0));
 perform pg_advisory_xact_lock(hashtext('order-number-'||d));
 select coalesce(max(daily_number),0)+1 into num from orders where business_date=d;
 insert into orders(business_date,daily_number,channel,order_type,customer_name,customer_phone,delivery_address,note,
 discount_amount,discount_reason,subtotal,total,created_by,client_request_id,client_request_hash,settlement)
 values(d,num,(p_order->>'channel')::order_channel,(p_order->>'order_type')::order_type,
 nullif(trim(p_order->>'customer_name'),''),nullif(trim(p_order->>'customer_phone'),''),nullif(trim(p_order->>'delivery_address'),''),nullif(trim(p_order->>'note'),''),
 (q->>'discount_amount')::numeric,nullif(trim(p_order->>'discount_reason'),''),(q->>'subtotal')::numeric,(q->>'total')::numeric,uid,rid,h,
 jsonb_build_object('account_id',acct.id,'currency',acct.currency,'amount',received,'amount_try',q->'total',
 'historical',d<public.business_date())) returning * into o;
 for it in select * from jsonb_array_elements(q->'items') loop
  insert into order_items(order_id,variant_id,product_id,product_name,variant_name,category_name,unit_price,quantity,addons,note,extras_total,extras_priced_separately,catalogue_unit_price,price_override_reason)
  values(o.id,(it->>'variant_id')::uuid,(it->>'product_id')::uuid,it->>'product_name',it->>'variant_name',it->>'category_name',
  (it->>'unit_price')::numeric,(it->>'quantity')::int,it->'addons',it->>'note',coalesce((it->>'extras_total')::numeric,0),coalesce((it->>'extras_priced_separately')::boolean,false),(it->>'catalogue_unit_price')::numeric,it->>'price_override_reason');
 end loop;
 insert into order_cost_snapshots(order_id,estimate,created_by)values(o.id,e,uid);
 perform log_activity('order.create','orders',o.id::text,jsonb_build_object('number',num,'business_date',d,'total',o.total,'workflow','accepted-delivered'));
 return o;
end $$;


create function order_profit_report(p_from date,p_to date) returns jsonb
language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare uid uuid:=require_role('operations','admin'); r record; e jsonb; q jsonb; rows jsonb:='[]'; missing jsonb:='[]';
 rev numeric:=0; cogs numeric:=0; gross numeric:=0; overhead numeric:=0; fixed numeric:=0; net numeric:=0;
 missing_gross int:=0; missing_net int:=0; reconstructed int:=0; n int:=0;
begin
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 then raise exception 'Choose a date range of at most 367 days'; end if;
 for r in select o.*,s.estimate from orders o left join order_cost_snapshots s on s.order_id=o.id
  where o.business_date between p_from and p_to and o.status<>'cancelled' order by o.business_date,o.daily_number loop
  e:=r.estimate;
  if e is null or not coalesce((e->>'complete')::boolean,false) then
   select jsonb_build_object('total',r.total,'items',coalesce(jsonb_agg(to_jsonb(i)),'[]')) into q from order_items i where i.order_id=r.id;
   e:=costing_order_math(q); reconstructed:=reconstructed+1;
  end if;
  n:=n+1;rev:=rev+r.total;
  if e->>'gross_profit' is null then missing_gross:=missing_gross+1;
  else cogs:=cogs+(e->>'cogs')::numeric;gross:=gross+(e->>'gross_profit')::numeric; end if;
  if e->>'net_profit' is null then missing_net:=missing_net+1;
  else net:=net+(e->>'net_profit')::numeric;overhead:=overhead+(e->>'operational')::numeric;fixed:=fixed+(e->>'fixed')::numeric;end if;
  missing:=missing||coalesce(e->'missing','[]');
  rows:=rows||jsonb_build_array(jsonb_build_object('id',r.id,'business_date',r.business_date,'daily_number',r.daily_number,'revenue',r.total,
   'gross_profit',e->'gross_profit','net_profit',e->'net_profit','missing',e->'missing','reconstructed',r.estimate is null or not coalesce((r.estimate->>'complete')::boolean,false)));
 end loop;
 select coalesce(jsonb_agg(value order by value),'[]') into missing from(select distinct value from jsonb_array_elements(missing))x;
 return jsonb_build_object('from',p_from,'to',p_to,'orders',n,'revenue',rev,'cogs',case when missing_gross=0 then cogs end,
 'gross_profit',case when missing_gross=0 then gross end,'net_profit',case when missing_net=0 then net end,
 'operational',case when missing_net=0 then overhead end,'fixed',case when missing_net=0 then fixed end,
 'missing_gross',missing_gross,'missing_net',missing_net,'missing',missing,'reconstructed',reconstructed,'rows',rows);
end $$;
create or replace function daily_order_profit() returns jsonb language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare uid uuid:=require_role('operations','admin'); r jsonb;
begin r:=order_profit_report(business_date(),business_date());
 return r||jsonb_build_object('business_date',business_date(),'missing',greatest((r->>'missing_gross')::int,(r->>'missing_net')::int));
end $$;

create function extra_sales_audit(p_from date,p_to date,p_name text default 'Turkey') returns jsonb
language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare uid uuid:=require_role('operations','admin'); result jsonb;
begin
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 then raise exception 'Choose a date range of at most 367 days';end if;
 with sold as (
 select o.id,o.business_date,o.daily_number,i.product_name,'On its own'::text as source,i.quantity as quantity
 from orders o join order_items i on i.order_id=o.id join products pr on pr.id=i.product_id join addons a on a.id=pr.addon_id
 where o.status<>'cancelled' and o.business_date between p_from and p_to and lower(a.name)=lower(p_name)
 union all
 select o.id,o.business_date,o.daily_number,i.product_name,'On a plate',case when i.extras_priced_separately then (x->>'quantity')::int else i.quantity end
 from orders o join order_items i on i.order_id=o.id cross join lateral jsonb_array_elements(i.addons)x
 where o.status<>'cancelled' and o.business_date between p_from and p_to and lower(x->>'name')=lower(p_name)
 ) select jsonb_build_object('name',p_name,'from',p_from,'to',p_to,'quantity',coalesce(sum(quantity),0),
 'standalone',coalesce(sum(quantity)filter(where source='On its own'),0),'on_plate',coalesce(sum(quantity)filter(where source='On a plate'),0),
 'rows',coalesce(jsonb_agg(to_jsonb(sold)order by business_date,daily_number),'[]')) into result from sold;
 return result;
end $$;

-- An explicit Admin transition keeps historical USD entries and pending settlements intact.
create function prepare_sfx_try_account(p_apply boolean default false) returns jsonb
language plpgsql security definer set search_path=public,pg_catalog as $$
declare uid uuid:=require_role('admin'); old_account accounts; new_account accounts; old_rows int; old_amount numeric; try_amount numeric; pending int;
begin
 perform pg_advisory_xact_lock(hashtextextended('sfx-account-transition',0));
 select * into old_account from accounts where lower(name)='sfx' for update;
 if old_account.currency='TRY' then return jsonb_build_object('ready',true,'account_id',old_account.id);end if;
 if old_account.id is null then raise exception 'SFx account not found';end if;
 select count(*),coalesce(sum(amount),0),coalesce(sum(amount_try),0)into old_rows,old_amount,try_amount from ledger_entries where account_id=old_account.id;
 select count(*) into pending from orders where status not in('cancelled','completed') and (settlement->>'account_id')::int=old_account.id;
 if not p_apply then return jsonb_build_object('ready',false,'historical_entries',old_rows,'recorded_currency',old_account.currency,'recorded_balance',old_amount,'recorded_try_value',try_amount,'pending_orders',pending);end if;
 update accounts set name='SFx (legacy USD; review)',sort_order=99 where id=old_account.id;
 insert into accounts(name,currency,is_cash,sort_order)values('SFx','TRY',false,4)returning * into new_account;
 perform log_activity('account.sfx_try_transition','accounts',new_account.id::text,jsonb_build_object('legacy_account',old_account.id,'historical_entries',old_rows,'pending_orders',pending));
 return jsonb_build_object('ready',true,'account_id',new_account.id,'legacy_account_id',old_account.id,'historical_entries',old_rows,'pending_orders',pending);
end $$;
revoke all on function order_profit_report(date,date),extra_sales_audit(date,date,text),prepare_sfx_try_account(boolean) from public,anon;
grant execute on function order_profit_report(date,date),extra_sales_audit(date,date,text),prepare_sfx_try_account(boolean) to authenticated;
-- Prevent old save protocols from accepting overrides without their audit columns.
do $$ declare definition text; begin
 definition:=pg_get_functiondef('public.create_order(jsonb)'::regprocedure);
 definition:=replace(definition,'q:=quote_order(p_order);', $patch$if exists(select 1 from jsonb_array_elements(p_order->'items')x where nullif(x->>'unit_price_override','') is not null) then raise exception 'Use the current order form for custom prices';end if;
 q:=quote_order(p_order);$patch$);
 execute definition;
end $$;
create function get_workspace_dashboard(p_from date,p_to date) returns jsonb
language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare uid uuid:=require_role('operations','admin'); result jsonb;
begin
 result:=get_dashboard(p_from,p_to)||jsonb_build_object('recipe_profit',order_profit_report(p_from,p_to)-'rows','extras',get_report('extras',p_from,p_to,0,10),'turkey',extra_sales_audit(p_from,p_to,'Turkey'));
 result:=result||jsonb_build_object('accounting_expenses',coalesce((result->'pnl'->'summary'->>'cost_of_goods')::numeric,0)+(result->>'operational_fixed')::numeric);
 -- Read-only preview; do not invoke the transition mutator from this stable report.
 if app_role()='admin' then result:=result||jsonb_build_object('sfx_needs_transition',exists(select 1 from accounts where lower(name)='sfx' and currency<>'TRY'));end if;
 return result;
end $$;
revoke all on function get_workspace_dashboard(date,date) from public,anon;
grant execute on function get_workspace_dashboard(date,date) to authenticated;
-- Owner supplied total cost per Turkey portion: TRY 250 on 20 October 2026.
-- Do not invent a breakdown or overwrite an existing recipe without review.
insert into cost_recipes(name,addon_id,inputs)
select 'Turkey · supplied total cost',a.id,
 jsonb_build_object('ingredients',jsonb_build_array(jsonb_build_object('name','Owner-supplied total per portion','cost',250)),
 'packaging',0,'overhead',0,'yield',1,'multiplier',case when a.price>0 then a.price/250 else 1 end,'rounding',10,'planned_batches',0)
from addons a where lower(a.name)='turkey' and not exists(select 1 from cost_recipes r where r.addon_id=a.id);
commit;
