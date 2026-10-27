begin;
create table inventory_items (
 id uuid primary key default gen_random_uuid(),
 name text not null check(length(trim(name)) between 1 and 200),
 item_group text not null check(length(trim(item_group)) between 1 and 100),
 default_unit text not null default '' check(length(default_unit)<=40),
 is_active boolean not null default true,
 revision int not null default 1,
 updated_by uuid references profiles(id),
 updated_at timestamptz not null default now()
);
create unique index inventory_name_unique on inventory_items(lower(name));
alter table inventory_items enable row level security;
create policy read_inventory on inventory_items for select to authenticated using (app_role() in ('admin','operations','logistics'));
revoke all on inventory_items from public,anon,authenticated;
grant select on inventory_items to authenticated;
create trigger no_delete before delete on inventory_items for each row execute function trg_no_delete();

alter table purchase_items add column inventory_item_id uuid references inventory_items(id);
alter table purchase_items add column inventory_group_snapshot text;

create function save_inventory_item(p jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_catalog as $$
declare uid uuid:=require_role('admin'); r inventory_items; item_id uuid:=(p->>'id')::uuid;
begin
 if item_id is null then raise exception 'An inventory item id is required';end if;
 perform pg_advisory_xact_lock(hashtextextended('inventory:'||item_id::text,0));
 select * into r from inventory_items where id=item_id for update;
 if found then
  if r.name=trim(p->>'name') and r.item_group=trim(p->>'item_group') and r.default_unit=trim(coalesce(p->>'default_unit','')) and r.is_active=(p->>'is_active')::boolean then return to_jsonb(r);end if;
  if r.revision is distinct from (p->>'revision')::int then raise exception 'This item changed; reload before editing';end if;
  update inventory_items set name=trim(p->>'name'),item_group=trim(p->>'item_group'),default_unit=trim(coalesce(p->>'default_unit','')),
   is_active=(p->>'is_active')::boolean,revision=revision+1,updated_by=uid,updated_at=now() where id=item_id returning * into r;
 else
  if coalesce((p->>'revision')::int,0)<>0 then raise exception 'Inventory item not found';end if;
  insert into inventory_items(id,name,item_group,default_unit,is_active,updated_by)
  values(item_id,trim(p->>'name'),trim(p->>'item_group'),trim(coalesce(p->>'default_unit','')),coalesce((p->>'is_active')::boolean,true),uid) returning * into r;
 end if;
 perform log_activity(case when r.is_active then 'inventory.save' else 'inventory.remove' end,'inventory_items',r.id::text,to_jsonb(r));
 return to_jsonb(r);
end $$;
revoke all on function save_inventory_item(jsonb) from public,anon;
grant execute on function save_inventory_item(jsonb) to authenticated;

-- Keep historic Payroll classification; new entries use the operational category.
update expense_categories set name='Payroll (legacy fixed)',is_active=false where name='Payroll' and kind='fixed';
insert into expense_categories(name,kind,sort_order) select 'Payroll','operational',41 where exists(select 1 from expense_categories) on conflict(name) do nothing;

-- Checklist supplied by owner; quantities and costs were blank.
insert into inventory_items(name,item_group) values
('Rice Packages','Packaging Materials'),
('Burger Packages','Packaging Materials'),
('Shawarma Packages','Packaging Materials'),
('Soup Packages','Packaging Materials'),
('Sauce Packages','Packaging Materials'),
('Salad Packages','Packaging Materials'),
('Fries Packages','Packaging Materials'),
('Delivery Bag','Packaging Materials'),
('Aluminium Foil','Packaging Materials'),
('Stretch Film','Packaging Materials'),
('Baking Paper','Packaging Materials'),
('Bulk Rice Packages','Packaging Materials'),
('Bulk Soup Packages','Packaging Materials'),
('Spoons','Packaging Materials'),
('Tissue Paper','Packaging Materials'),
('White nylon','Packaging Materials'),
('Ham (Salami)','Proteins'),
('Cheese','Proteins'),
('Minced Chicken','Proteins'),
('Chicken Breast','Proteins'),
('Boneless Chicken Thighs','Proteins'),
('Chicken Lap','Proteins'),
('Turkey','Proteins'),
('Fish','Proteins'),
('Ponmo','Proteins'),
('Shaki','Proteins'),
('Sausages','Proteins'),
('Eggs','Proteins'),
('Liver','Proteins'),
('Lemon Sauce','Sauce & Dairy'),
('Mayonnaise','Sauce & Dairy'),
('Condensed Milk','Sauce & Dairy'),
('Milk','Sauce & Dairy'),
('Ketchup','Sauce & Dairy'),
('BBQ Sauce','Sauce & Dairy'),
('Mustard','Sauce & Dairy'),
('Honey','Sauce & Dairy'),
('Flour','Grains'),
('Rice','Grains'),
('Semo','Grains'),
('Bread (Shawarma)','Grains'),
('Burger Bread','Grains'),
('Spinach','Legumes and Vegetables'),
('Red Bell Pepper','Legumes and Vegetables'),
('Onions','Legumes and Vegetables'),
('Green Bell Pepper','Legumes and Vegetables'),
('Spring Onion','Legumes and Vegetables'),
('Tomatoes','Legumes and Vegetables'),
('Cabbage','Legumes and Vegetables'),
('Carrots','Legumes and Vegetables'),
('Lettuce','Legumes and Vegetables'),
('Tomato Paste','Legumes and Vegetables'),
('Sweet pepper paste','Legumes and Vegetables'),
('Hot pepper paste','Legumes and Vegetables'),
('Butter','Oil'),
('Palm Oil','Oil'),
('Crayfish','Ingredients & Spices'),
('Maggi','Ingredients & Spices'),
('Bizim Breast Seasoning','Ingredients & Spices'),
('Curry Powder','Ingredients & Spices'),
('Turmeric','Ingredients & Spices'),
('Bay Leaf','Ingredients & Spices'),
('Black Pepper','Ingredients & Spices'),
('Sweet Pepper','Ingredients & Spices'),
('Meatball Spice','Ingredients & Spices'),
('Garlic Powder','Ingredients & Spices'),
('Nutmeg','Ingredients & Spices'),
('Chicken Seasoning Cube','Ingredients & Spices'),
('Salt','Ingredients & Spices'),
('Sugar Pepper','Ingredients & Spices'),
('Thyme','Ingredients & Spices'),
('Hot Pepper','Ingredients & Spices'),
('Ground Chilli Pepper','Ingredients & Spices'),
('Rosemary','Ingredients & Spices'),
('Fresh Garlic','Ingredients & Spices'),
('Fresh Ginger','Ingredients & Spices');

create or replace function log_purchase(p jsonb) returns purchases
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := require_role('logistics', 'admin');
  pu purchases; adv withdrawals; total numeric; rate numeric; acct smallint; it jsonb; dbt uuid; preview jsonb;
begin
  perform public.m8_lock_current_day();
  if nullif(p->>'advance_id','') is not null then perform 1 from withdrawals where id=(p->>'advance_id')::uuid for update;
  elsif nullif(p->>'account_id','') is not null then perform 1 from accounts where id=(p->>'account_id')::smallint for update; end if;
  -- Lock referenced catalogue rows through validation and snapshot insertion.
  perform 1 from inventory_items where id in(select (x->>'inventory_item_id')::uuid from jsonb_array_elements(p->'items')x where nullif(x->>'inventory_item_id','') is not null) for share;
  for it in select * from jsonb_array_elements(p->'items') loop
   if nullif(it->>'inventory_item_id','') is not null then
    if not exists(select 1 from inventory_items where id=(it->>'inventory_item_id')::uuid and is_active) then raise exception 'Inventory item removed; choose an active item';end if;
    if nullif(trim(it->>'unit'),'') is null or nullif(it->>'quantity','') is null then raise exception 'Enter a quantity and unit for inventory items';end if;
   end if;
  end loop;
  preview:=m6_purchase_preview(p);
  if nullif(p->>'receipt_path','') is not null and (split_part(p->>'receipt_path','/',1)<>uid::text or not exists(select 1 from storage.objects where bucket_id='receipts' and name=p->>'receipt_path')) then raise exception 'Receipt must be uploaded in your own folder'; end if;
  select coalesce(sum((x->>'amount')::numeric), 0) into total
    from jsonb_array_elements(coalesce(p->'items', '[]')) x;
  if total <= 0 then raise exception 'Add at least one item with an amount'; end if;

  if p ? 'advance_id' and p->>'advance_id' is not null then
    select * into adv from withdrawals where id = (p->>'advance_id')::uuid;
    if adv.id is null or adv.kind <> 'advance' or adv.status <> 'approved' then
      raise exception 'Not an approved advance';
    end if;
    if app_role() <> 'admin' and adv.recipient_id <> uid then
      raise exception 'You can only log purchases against your own advances';
    end if;
    rate := adv.rate_to_try;
  elsif coalesce((p->>'on_credit')::boolean, false) then
    rate := 1;  -- credit purchases are in lira
    insert into debts (direction, counterparty, description, currency, amount, due_date, source, created_by)
    values ('we_owe', trim(p->>'supplier'), 'Supplies on credit', 'TRY', total,
            nullif(p->>'due_date','')::date, 'purchase_on_credit', uid)
    returning id into dbt;
  else
    acct := (p->>'account_id')::smallint;
    rate := resolve_rate(acct, (p->>'rate')::numeric);
    if account_balance(acct) < total then raise exception 'Not enough money in this account'; end if;
  end if;

  insert into purchases (supplier, category_id, advance_id, account_id, debt_id, amount, rate_to_try, amount_try,
                         receipt_path, note, logged_by)
  values (trim(p->>'supplier'), (p->>'category_id')::smallint, adv.id, acct, dbt, total, rate,
          round(total * rate, 2), nullif(p->>'receipt_path', ''), nullif(p->>'note', ''), uid)
  returning * into pu;

  for it in select * from jsonb_array_elements(p->'items') loop
    insert into purchase_items (purchase_id, description, quantity, unit, amount,inventory_item_id,inventory_group_snapshot)
    values (pu.id, coalesce((select name from inventory_items where id=nullif(it->>'inventory_item_id','')::uuid),it->>'description'), nullif(it->>'quantity','')::numeric, nullif(it->>'unit', ''),
            (it->>'amount')::numeric,nullif(it->>'inventory_item_id','')::uuid,(select item_group from inventory_items where id=nullif(it->>'inventory_item_id','')::uuid));
  end loop;

  if acct is not null then
    perform post_entry(acct, 'purchase_direct', -total, rate, p_purchase => pu.id, p_note => pu.supplier);
  end if;
  perform log_activity('purchase.create', 'purchases', pu.id::text,
    jsonb_build_object('supplier', pu.supplier, 'amount', total, 'advance_id', adv.id, 'on_credit', dbt is not null));
  return pu;
end $$;

-- Allocate FX rounding by cumulative line totals so every purchase reconciles
-- exactly to its recorded TRY total, even when several sub-cent lines occur.
create view v_purchase_item_expenses with(security_invoker=on) as
with lines as (
 select i.*,p.business_date,p.supplier,p.logged_by
 from purchase_items i join purchases p on p.id=i.purchase_id where not p.is_reversed
), allocated as (
 select l.*,p.rate_to_try,
 round(sum(l.amount)over(partition by purchase_id order by l.id)*p.rate_to_try,2)
 -round((sum(l.amount)over(partition by purchase_id order by l.id)-l.amount)*p.rate_to_try,2) as amount_try
 from lines l join purchases p on p.id=l.purchase_id
)
select id,purchase_id,inventory_item_id,description,inventory_group_snapshot,quantity,unit,amount,amount_try,business_date,supplier,logged_by from allocated;
grant select on v_purchase_item_expenses to authenticated;

create function inventory_expense_report(p_from date,p_to date) returns jsonb
language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare uid uuid:=require_role('admin','logistics'); r jsonb; total numeric;
begin
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 then raise exception 'Choose a date range of at most 367 days';end if;
 select coalesce(jsonb_agg(to_jsonb(t) order by t.item_group,t.name,t.unit),'[]'),coalesce(sum(t.amount_try),0) into r,total from (
 select e.inventory_item_id,coalesce(i.name,e.description) as name,coalesce(i.item_group,'Unlinked historical items') as item_group,
 coalesce(e.unit,'Unspecified') as unit,case when count(e.quantity)=count(*) then sum(e.quantity) end as quantity,sum(e.amount_try) as amount_try,count(distinct e.purchase_id) as purchases
 from v_purchase_item_expenses e left join inventory_items i on i.id=e.inventory_item_id
 where e.business_date between p_from and p_to and (app_role()='admin' or e.logged_by=uid)
 group by e.inventory_item_id,coalesce(i.name,e.description),coalesce(i.item_group,'Unlinked historical items'),coalesce(e.unit,'Unspecified')
 )t;
 return jsonb_build_object('from',p_from,'to',p_to,'rows',r,'total_try',total);
end $$;
revoke all on function inventory_expense_report(date,date) from public,anon;
grant execute on function inventory_expense_report(date,date) to authenticated;

create function review_financial_calculations(p_from date,p_to date) returns jsonb
language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare uid uuid:=require_role('admin'); r jsonb; p jsonb;
begin
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 then raise exception 'Choose a date range of at most 367 days';end if;
 p:=order_profit_report(p_from,p_to);
 select jsonb_build_object(
 'revenue_difference',coalesce((select sum(net_sales)from v_sales_daily where business_date between p_from and p_to),0)-(p->>'revenue')::numeric,
 'order_arithmetic_errors',(select count(*)from orders where business_date between p_from and p_to and total<>subtotal-discount_amount),
 'purchase_line_errors',(select count(*)from purchases pu where business_date between p_from and p_to and not is_reversed and amount<>(select coalesce(sum(amount),0)from purchase_items where purchase_id=pu.id)),
 'purchase_fx_errors',(select count(*)from purchases pu where business_date between p_from and p_to and not is_reversed and amount_try<>round(amount*rate_to_try,2)),
 'allocation_errors',(select count(*)from purchases pu where business_date between p_from and p_to and not is_reversed and amount_try<>(select coalesce(sum(amount_try),0)from v_purchase_item_expenses where purchase_id=pu.id)),
 'completed_payment_errors',(select count(*)from orders o where business_date between p_from and p_to and status='completed' and total<>(select coalesce(sum(amount_try),0)from ledger_entries where order_id=o.id)),
 'missing_recipe_orders',(p->>'missing_net')::int,
 'recipe_gross_difference',case when p->>'gross_profit' is not null then (p->>'gross_profit')::numeric-((p->>'revenue')::numeric-(p->>'cogs')::numeric)end,
 'recipe_net_difference',case when p->>'net_profit' is not null then (p->>'net_profit')::numeric-((p->>'gross_profit')::numeric-(p->>'operational')::numeric-(p->>'fixed')::numeric)end
 ) into r;
 return r;
end $$;
revoke all on function review_financial_calculations(date,date) from public,anon;
grant execute on function review_financial_calculations(date,date) to authenticated;

-- Presentation-only label; keep the existing API keys and money formulae.
do $$declare d text;begin
 d:=pg_get_functiondef('get_report(text,date,date,integer,integer,text)'::regprocedure);
 d:=replace(d,'''metric'',''Net revenue''','''metric'',''Revenue''');
 execute d;
end $$;
create function list_inventory_items() returns jsonb
language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare uid uuid:=require_role('admin','operations','logistics'); r jsonb;
begin
 select coalesce(jsonb_agg(to_jsonb(i) order by item_group,name),'[]')into r from inventory_items i;
 return r;
end $$;
revoke all on function list_inventory_items() from public,anon;
grant execute on function list_inventory_items() to authenticated;
commit;
