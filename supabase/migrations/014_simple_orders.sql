-- M16: additive two-stage orders, dated Admin entry and atomic settlement.
-- Migration 013 belongs to the paused M15 branch and is not required here.
begin;
alter table orders add column settlement jsonb;

create function create_trading_order(p_order jsonb) returns orders
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
  insert into order_items(order_id,variant_id,product_id,product_name,variant_name,category_name,unit_price,quantity,addons,note,extras_total,extras_priced_separately)
  values(o.id,(it->>'variant_id')::uuid,(it->>'product_id')::uuid,it->>'product_name',it->>'variant_name',it->>'category_name',
  (it->>'unit_price')::numeric,(it->>'quantity')::int,it->'addons',it->>'note',coalesce((it->>'extras_total')::numeric,0),coalesce((it->>'extras_priced_separately')::boolean,false));
 end loop;
 insert into order_cost_snapshots(order_id,estimate,created_by)values(o.id,e,uid);
 perform log_activity('order.create','orders',o.id::text,jsonb_build_object('number',num,'business_date',d,'total',o.total,'workflow','accepted-delivered'));
 return o;
end $$;

create function deliver_trading_order(p_order uuid) returns orders
language plpgsql security definer set search_path=public,pg_catalog as $$
declare uid uuid:=require_role('operations','logistics','admin'); o orders; a accounts;
 received numeric; paid numeric; rate numeric; d date;
begin
 perform m8_lock_current_day();
 select * into o from orders where id=p_order for update;
 if not found then raise exception 'Order not found'; end if;
 if app_role()='logistics' and o.order_type<>'delivery' then raise exception 'Logistics can only deliver delivery orders'; end if;
 if o.settlement is null then raise exception 'Legacy order requires its original payment workflow'; end if;
 if o.status='completed' then return o; end if;
 if o.status='cancelled' then raise exception 'Order is cancelled'; end if;
 d:=case when (o.settlement->>'historical')::boolean then o.business_date else public.business_date() end;
 if d<>public.business_date() and app_role()<>'admin' then raise exception 'Only Admin can settle earlier orders'; end if;
 perform pg_advisory_xact_lock_shared(hashtextextended('financial-day:'||d::text,0));
 select * into a from accounts where id=(o.settlement->>'account_id')::smallint and is_active;
 if not found or a.currency is distinct from o.settlement->>'currency' then raise exception 'The selected payment account is unavailable'; end if;
 select coalesce(sum(amount_try),0) into paid from ledger_entries where order_id=o.id;
 if paid<>0 then raise exception 'This order already has payments; ask Admin to review'; end if;
 received:=(o.settlement->>'amount')::numeric;
 if o.total>0 then
  rate:=case when a.currency='TRY' then 1 else round(o.total/received,6) end;
  if rate<=0 then raise exception 'Payment exchange rate is too small'; end if;
  insert into ledger_entries(account_id,entry_type,amount,rate_to_try,amount_try,business_date,order_id,note,created_by)
  values(a.id,'order_payment',received,rate,o.total,d,o.id,'Payment confirmed on delivery',uid);
 end if;
 update orders set status='completed',completed_at=now() where id=o.id returning * into o;
 perform log_activity('order.status','orders',o.id::text,jsonb_build_object('status','completed','payment','automatic','business_date',d));
 return o;
end $$;

-- Old clients must not bypass settlement by using their original status RPC.
create function guard_trading_status() returns trigger language plpgsql set search_path=public,pg_catalog as $$
begin
 if old.settlement is not null then
  if new.settlement is distinct from old.settlement or new.business_date<>old.business_date then raise exception 'Saved settlement and order date are permanent'; end if;
  if new.status not in ('new','completed','cancelled') then raise exception 'Use Accepted or Delivered for this order'; end if;
  if new.status='completed' and old.status<>'completed' and
   (select coalesce(sum(amount_try),0) from ledger_entries where order_id=new.id)<>new.total then
   raise exception 'Use delivery confirmation to record the payment';
  end if;
 end if;
 return new;
end $$;
create trigger trading_status before update on orders for each row execute function guard_trading_status();

create function daily_order_profit() returns jsonb language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare uid uuid:=require_role('operations','admin'); result jsonb;
begin
 select jsonb_build_object('business_date',public.business_date(),'orders',count(*),'revenue',coalesce(sum(o.total),0),
 'missing',count(*) filter(where s.order_id is null or not coalesce((s.estimate->>'complete')::boolean,false)),
 'gross_profit',case when count(*) filter(where s.estimate->>'gross_profit' is null)>0 then null else coalesce(sum((s.estimate->>'gross_profit')::numeric),0) end,
 'net_profit',case when count(*) filter(where s.estimate->>'net_profit' is null)>0 then null else coalesce(sum((s.estimate->>'net_profit')::numeric),0) end)
 into result from orders o left join order_cost_snapshots s on s.order_id=o.id
 where o.business_date=public.business_date() and o.status<>'cancelled';
 return result;
end $$;
revoke all on function create_trading_order(jsonb),deliver_trading_order(uuid),daily_order_profit() from public,anon;
grant execute on function create_trading_order(jsonb),deliver_trading_order(uuid),daily_order_profit() to authenticated;
revoke all on function guard_trading_status() from public,anon,authenticated;
create or replace function list_delivery_orders() returns jsonb
language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare uid uuid:=require_role('logistics','admin'); result jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',o.id,'business_date',o.business_date,'daily_number',o.daily_number,'channel',o.channel,
    'settlement',case when o.settlement is not null then '{}'::jsonb else null end,'order_type',o.order_type,'status',o.status,'customer_name',o.customer_name,'customer_phone',o.customer_phone,
    'delivery_address',o.delivery_address,'note',o.note,'subtotal',o.subtotal,'discount_amount',o.discount_amount,
    'discount_reason',o.discount_reason,'total',o.total,'created_at',o.created_at,
    'ready_at',o.ready_at,'picked_up_at',o.picked_up_at,'paid_try',p.paid_try,'balance_due',p.balance_due,
    'items',(select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'product_name',i.product_name,
      'variant_name',i.variant_name,'quantity',i.quantity,'line_total',i.charged_total,'addons',i.addons,'note',i.note) order by i.id),'[]')
      from order_items i where i.order_id=o.id)
    ) order by coalesce(o.ready_at,o.created_at),o.created_at,o.id),'[]') into result
  from orders o join v_order_payments p on p.id=o.id
  where o.order_type='delivery' and (o.status in ('ready','picked_up') or (o.status='new' and o.settlement is not null));
  return result;
end $$;

-- Publish orders only when the hosted Realtime publication is available.
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(
  select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='orders') then
  alter publication supabase_realtime add table orders;
 end if;
end $$;

-- Reference-only source, with no year assumed and no ledger/report effects.
create table historical_sales_records (
 id text primary key, title text not null, source_name text not null, source_year int,
 months jsonb not null, payment_mix jsonb not null, notes text not null
);
alter table historical_sales_records enable row level security;
create policy admin_read on historical_sales_records for select to authenticated using(app_role()='admin');
revoke all on historical_sales_records from public,anon,authenticated;
grant select on historical_sales_records to authenticated;
create trigger no_delete before delete on historical_sales_records for each row execute function trg_no_delete();
create trigger immutable before update on historical_sales_records for each row execute function costing_immutable();
insert into historical_sales_records values (
 'summer-review-june-september','Summer review · June–September','DOC-20261016-WA0154.pdf',null,
 '[{"month":"June","days":6,"orders":52,"revenue":16820},{"month":"July","days":7,"orders":87,"revenue":34820},{"month":"August","days":23,"orders":210,"revenue":78490},{"month":"September","days":22,"orders":160,"revenue":58932}]',
 '[{"account":"Cash","amount_try":100821},{"account":"SFX","amount_try":55073},{"account":"CR","amount_try":14480},{"account":"Koop","amount_try":7030},{"account":"Naira","amount_try":6168},{"account":"Isbank","amount_try":4240},{"account":"Redot","amount_try":1250}]',
 'Reference only. Year not stated in the source. 58 trading days, 509 orders, 189062 TRY total. No individual orders, costs or profit supplied. Naira receipts total 236661 NGN; TRY values are implied by source monthly totals (June 350, August 4908, September 910), not verified FX rates. Does not post payments, change account balances, or enter live sales/profit reports.');
commit;
