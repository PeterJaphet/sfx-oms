-- M9: read models, complete exports, server totals and date presets.
-- Existing financial functions, RLS policies and schema.sql are unchanged.
begin;
create view v_report_order_dimensions with(security_invoker=on) as
select business_date,channel,order_type,extract(hour from created_at at time zone 'Europe/Nicosia')::int as hour,
 extract(isodow from business_date)::int as weekday,count(*) as orders,sum(subtotal) as gross_sales,sum(discount_amount) as discounts,sum(total) as net_revenue
from orders where status<>'cancelled' group by 1,2,3,4,5;
create view v_report_account_days with(security_invoker=on) as
select account_id,business_date,sum(amount) as movement,
 coalesce(sum(amount)filter(where amount>0),0) as money_in,
 coalesce(-sum(amount)filter(where amount<0),0) as money_out
from ledger_entries group by 1,2;
create view v_report_deliveries with(security_invoker=on) as
select o.id,o.business_date,o.daily_number,o.status,o.picked_up_by,p.full_name as staff,
 o.ready_at,o.picked_up_at,o.completed_at,
 round(extract(epoch from(o.completed_at-o.picked_up_at))/60,2) as delivery_minutes,
 round(extract(epoch from(o.picked_up_at-o.ready_at))/60,2) as waiting_minutes
from orders o left join profiles p on p.id=o.picked_up_by
where o.order_type='delivery' and o.status<>'cancelled' and o.picked_up_at is not null;
revoke all on v_report_order_dimensions,v_report_account_days,v_report_deliveries from public,anon;
grant select on v_report_order_dimensions,v_report_account_days,v_report_deliveries to authenticated;
create function report_periods() returns jsonb
language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare uid uuid:=require_role('operations','admin'); d date:=business_date(); w date:=date_trunc('week',d)::date;
begin
 return jsonb_build_object('business_date',d,'today',jsonb_build_object('from',d,'to',d),
 'week',jsonb_build_object('from',w,'to',w+6),'last_week',jsonb_build_object('from',w-7,'to',w-1),
 'month',jsonb_build_object('from',date_trunc('month',d)::date,'to',(date_trunc('month',d)+interval '1 month - 1 day')::date));
end $$;
create function get_report(p_report text,p_from date,p_to date,p_offset int default 0,p_limit int default 100,p_search text default '') returns jsonb
language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare uid uuid:=require_role('operations','admin'); rows jsonb; summary jsonb:='{}'; filtered jsonb; page jsonb;
 prev_from date:=p_from-(p_to-p_from+1); prev_to date:=p_from-1; total int;
begin
 if p_from is null or p_to is null or p_from>p_to then raise exception 'Choose a valid date range'; end if;
 if p_offset is null or p_offset<0 or p_limit is null or p_limit<0 or p_limit>1000 then raise exception 'Choose a valid report page'; end if;
 if p_report in('debts','unpaid','advances') then
  p_from:=business_date();p_to:=p_from;prev_from:=p_from-1;prev_to:=prev_from;
 end if;
 -- Limit 0 exports ALL matches from one database snapshot, without REST row limits.
 case p_report
 when 'sales' then
  select coalesce(jsonb_agg(t order by t.business_date),'[]') into rows from(select d::date as business_date,coalesce(s.orders,0) as orders,coalesce(s.cancelled_orders,0) as cancelled_orders,coalesce(s.gross_sales,0) as gross_sales,coalesce(s.discounts,0) as discounts,coalesce(s.net_sales,0) as net_revenue,case when s.orders>0 then round(s.net_sales/s.orders,2) end as average_order from generate_series(p_from::timestamp,p_to::timestamp,'1 day')d left join v_sales_daily s on s.business_date=d::date)t;
  select jsonb_build_object('orders',coalesce(sum(orders),0),'gross_sales',coalesce(sum(gross_sales),0),'discounts',coalesce(sum(discounts),0),'net_revenue',coalesce(sum(net_sales),0),'average_order',case when sum(orders)>0 then round(sum(net_sales)/sum(orders),2) end) into summary from v_sales_daily where business_date between p_from and p_to;
 when 'items' then
  select coalesce(jsonb_agg(t order by t.quantity desc,t.product_name,t.variant_name,t.category_name),'[]') into rows from(select c.*,coalesce(p.quantity,0) as previous_quantity,coalesce(p.revenue,0) as previous_revenue from report_items_sold(p_from,p_to)c left join report_items_sold(prev_from,prev_to)p using(category_name,product_name,variant_name))t;
  select jsonb_build_object('categories',coalesce(jsonb_agg(t order by t.quantity desc,t.category_name),'[]')) into summary from(select category_name,sum(quantity) as quantity,sum(revenue) as revenue from report_items_sold(p_from,p_to) group by 1)t;
 when 'item_categories' then
  select coalesce(jsonb_agg(t order by t.quantity desc,t.category_name),'[]') into rows from(select category_name,sum(quantity) as quantity,sum(revenue) as revenue from report_items_sold(p_from,p_to) group by 1)t;
 when 'extras' then
  select coalesce(jsonb_agg(t order by t.quantity desc,t.extra_name),'[]') into rows from(select extra_name,sum(on_plate) as on_plate,sum(standalone) as standalone,sum(quantity) as quantity,sum(revenue) as revenue from v_extras_sold_daily where business_date between p_from and p_to group by 1)t;
 when 'payments' then
  select coalesce(jsonb_agg(t order by t.account),'[]') into rows from(select account,currency,sum(amount) as amount,sum(amount_try) as amount_try from v_payments_daily where business_date between p_from and p_to group by 1,2)t;
 when 'expenses' then
  select coalesce(jsonb_agg(t order by t.amount_try desc,t.category),'[]') into rows from(select category,kind,sum(amount_try) as amount_try,count(*) as entries from v_expenses where business_date between p_from and p_to group by 1,2)t;
  select jsonb_build_object('cogs',coalesce(sum(amount_try)filter(where kind='cogs'),0),'operational',coalesce(sum(amount_try)filter(where kind='operational'),0),'fixed',coalesce(sum(amount_try)filter(where kind='fixed'),0),'total',coalesce(sum(amount_try),0)) into summary from v_expenses where business_date between p_from and p_to;
 when 'suppliers' then
  select coalesce(jsonb_agg(t order by t.amount_try desc,t.supplier),'[]') into rows from(select description as supplier,sum(amount_try) as amount_try,count(*) as purchases from v_expenses where source='purchase' and business_date between p_from and p_to group by 1)t;
 when 'expense_staff' then
  select coalesce(jsonb_agg(t order by t.amount_try desc,t.staff,t.staff_id),'[]') into rows from(select p.id as staff_id,p.full_name as staff,sum(e.amount_try) as amount_try,count(*) as entries from v_expenses e join profiles p on p.id=e.staff_id where e.business_date between p_from and p_to group by p.id)t;
 when 'expense_details' then
  select coalesce(jsonb_agg(t order by t.business_date desc,t.id),'[]') into rows from(select e.*,p.full_name as staff from v_expenses e join profiles p on p.id=e.staff_id where e.business_date between p_from and p_to)t;
 when 'accounts' then
  select coalesce(jsonb_agg(t order by t.sort_order,t.id),'[]') into rows from(select a.id,a.name,a.currency,a.sort_order,a.is_active,coalesce(sum(v.movement)filter(where v.business_date<p_from),0) as opening,coalesce(sum(v.money_in)filter(where v.business_date between p_from and p_to),0) as money_in,coalesce(sum(v.money_out)filter(where v.business_date between p_from and p_to),0) as money_out,coalesce(sum(v.movement)filter(where v.business_date<=p_to),0) as closing from accounts a left join v_report_account_days v on v.account_id=a.id group by a.id)t;
 when 'closes' then
  select coalesce(jsonb_agg(t order by t.business_date desc,t.id desc),'[]') into rows from(select c.id,c.business_date,a.name as account,c.expected_amount,c.counted_amount,c.difference,c.note,c.superseded,p.full_name as staff,c.closed_at from day_closes c join accounts a on a.id=c.account_id join profiles p on p.id=c.closed_by where c.business_date between p_from and p_to)t;
 when 'logistics_purchases' then
  select coalesce(jsonb_agg(t order by t.business_date desc,t.id),'[]') into rows from(select e.*,p.full_name as staff from v_expenses e join profiles p on p.id=e.staff_id where e.source='purchase' and e.business_date between p_from and p_to)t;
 when 'logistics_advances' then
  select coalesce(jsonb_agg(t order by t.business_date desc,t.id),'[]') into rows from(select v.*,a.currency from v_advances v join accounts a on a.id=v.account_id where v.business_date between p_from and p_to)t;
 when 'deliveries' then
  select coalesce(jsonb_agg(t order by t.business_date desc,t.daily_number),'[]') into rows from(select * from v_report_deliveries where business_date between p_from and p_to)t;
 when 'channels' then
  select coalesce(jsonb_agg(t order by t.channel),'[]') into rows from(select channel,sum(orders) as orders,sum(net_revenue) as net_revenue from v_report_order_dimensions where business_date between p_from and p_to group by 1)t;
 when 'types' then
  select coalesce(jsonb_agg(t order by t.order_type),'[]') into rows from(select order_type,sum(orders) as orders,sum(net_revenue) as net_revenue from v_report_order_dimensions where business_date between p_from and p_to group by 1)t;
 when 'hours' then
  select coalesce(jsonb_agg(t order by t.hour),'[]') into rows from(select hour,sum(orders) as orders,sum(net_revenue) as net_revenue from v_report_order_dimensions where business_date between p_from and p_to group by 1)t;
 when 'weekdays' then
  select coalesce(jsonb_agg(t order by t.weekday),'[]') into rows from(select weekday,sum(orders) as orders,sum(net_revenue) as net_revenue from v_report_order_dimensions where business_date between p_from and p_to group by 1)t;
 when 'debts' then
  select coalesce(jsonb_agg(t order by t.is_overdue desc,t.due_date nulls last,t.counterparty,t.id),'[]') into rows from(select * from v_debts where state='open')t;
  summary:=debt_summary();
 when 'unpaid' then
  select coalesce(jsonb_agg(t order by t.business_date,t.daily_number),'[]') into rows from(select v.id,v.business_date,v.daily_number,o.customer_name,v.total,v.paid_try,v.balance_due from v_order_payments v join orders o on o.id=v.id where v.status<>'cancelled' and v.balance_due>0)t;
  select jsonb_build_object('due_now',coalesce(sum(balance_due),0)) into summary from v_order_payments where status<>'cancelled' and balance_due>0;
 when 'advances' then
  select coalesce(jsonb_agg(t order by t.business_date,t.id),'[]') into rows from(select v.*,a.currency from v_advances v join accounts a on a.id=v.account_id where v.state in('open','owed_to_staff'))t;
 when 'pnl' then
  select to_jsonb(t) into summary from report_pnl(p_from,p_to)t;
  rows:=jsonb_build_array(
   jsonb_build_object('metric','Net revenue','amount',coalesce((summary->>'net_revenue')::numeric,0),'unit','TRY'),
   jsonb_build_object('metric','Cost of goods','amount',coalesce((summary->>'cost_of_goods')::numeric,0),'unit','TRY'),
   jsonb_build_object('metric','Gross profit','amount',coalesce((summary->>'gross_profit')::numeric,0),'unit','TRY'),
   jsonb_build_object('metric','Gross margin','amount',(summary->>'gross_margin')::numeric,'unit','ratio'),
   jsonb_build_object('metric','Operational costs','amount',coalesce((summary->>'operational_expenses')::numeric,0),'unit','TRY'),
   jsonb_build_object('metric','Fixed overheads','amount',coalesce((summary->>'fixed_overheads')::numeric,0),'unit','TRY'),
   jsonb_build_object('metric','Net profit','amount',coalesce((summary->>'net_profit')::numeric,0),'unit','TRY'),
   jsonb_build_object('metric','Net margin','amount',(summary->>'net_margin')::numeric,'unit','ratio'));
 else raise exception 'Unknown report';
 end case;
 select coalesce(jsonb_agg(value order by ord),'[]') into filtered from jsonb_array_elements(rows)with ordinality x(value,ord)
 where coalesce(p_search,'')='' or exists(select 1 from jsonb_each_text(value)e where e.value ilike '%'||p_search||'%');
 if p_report in('items','item_categories','extras') then
  select summary||jsonb_build_object('filtered_quantity',coalesce(sum((value->>'quantity')::numeric),0),'filtered_revenue',coalesce(sum((value->>'revenue')::numeric),0),'filtered_on_plate',coalesce(sum((value->>'on_plate')::numeric),0),'filtered_standalone',coalesce(sum((value->>'standalone')::numeric),0)) into summary from jsonb_array_elements(filtered)value;
 end if;
 total:=jsonb_array_length(filtered);
 select coalesce(jsonb_agg(value order by ord),'[]') into page from jsonb_array_elements(filtered)with ordinality x(value,ord)
 where ord>p_offset and(p_limit=0 or ord<=p_offset+p_limit);
 return jsonb_build_object('report',p_report,'scope',case when p_report in('debts','unpaid','advances') then 'current' else 'period' end,'from',p_from,'to',p_to,'generated_at',now(),'business_date',business_date(),
 'previous_from',prev_from,'previous_to',prev_to,'summary',summary,'rows',page,'total',total,'offset',p_offset);
end $$;
create function get_dashboard(p_from date,p_to date)returns jsonb
language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare uid uuid:=require_role('operations','admin'); result jsonb; balances jsonb; total_try numeric; missing int; needs jsonb;
begin
 result:=jsonb_build_object('sales',get_report('sales',p_from,p_to,0,0),'pnl',get_report('pnl',p_from,p_to,0,0),
 'items',get_report('items',p_from,p_to,0,10),'expenses',get_report('expenses',p_from,p_to,0,10));
 select coalesce(jsonb_agg(t order by t.sort_order,t.id),'[]'),coalesce(sum(t.balance_try_estimate),0),count(*)filter(where t.balance_try_estimate is null)
 into balances,total_try,missing from v_account_balances t;
 needs:=jsonb_build_object('close',(select to_jsonb(t) from(select business_date,difference,note from day_closes where not superseded and difference<>0 order by business_date desc,id desc limit 1)t),
 'advances',(select coalesce(jsonb_agg(t),'[]') from(select v.recipient_name,v.purpose,v.remaining,a.currency,v.age_days from v_advances v join accounts a on a.id=v.account_id where v.state in('open','owed_to_staff') order by v.business_date,v.id limit 5)t));
 if app_role()='admin' then needs:=needs||jsonb_build_object('pending_approvals',(select count(*) from withdrawals where status='pending_approval'));end if;
 return result||jsonb_build_object('operational_fixed',coalesce((result->'pnl'->'summary'->>'operational_expenses')::numeric,0)+coalesce((result->'pnl'->'summary'->>'fixed_overheads')::numeric,0),'balances',balances,'balance_try_estimate',total_try,'missing_balance_rates',missing,'debts',debt_summary(),'needs',needs);
end $$;
revoke all on function report_periods() from public,anon;
grant execute on function report_periods() to authenticated;
revoke all on function get_report(text,date,date,int,int,text) from public,anon;
grant execute on function get_report(text,date,date,int,int,text) to authenticated;
revoke all on function get_dashboard(date,date) from public,anon;
grant execute on function get_dashboard(date,date) to authenticated;
commit;
