-- Scenario test: go-live plus one business day through every role.
-- Run after 00_auth_stub.sql, schema.sql, seed.sql. Every check prints "ok ..." or "FAIL ...".
\set ON_ERROR_STOP 1
\pset footer off
insert into auth.users values ('00000000-0000-0000-0000-00000000000a'),('00000000-0000-0000-0000-00000000000b'),('00000000-0000-0000-0000-00000000000c');
insert into profiles (id, full_name, role) values
 ('00000000-0000-0000-0000-00000000000a','Peter (Admin)','admin'),
 ('00000000-0000-0000-0000-00000000000b','Increase (Ops)','operations'),
 ('00000000-0000-0000-0000-00000000000c','Musa (Logistics)','logistics');
insert into auth.sessions(id, user_id)
select id, id from auth.users;
grant select, insert, update on all tables in schema public to authenticated;

create or replace function as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', u, false),
         set_config('request.jwt.claims', jsonb_build_object('sub',u,'session_id',u,'role','authenticated')::text, false); $$;
create or replace function expect_fail(sql text, label text) returns text language plpgsql as $$
begin execute sql; return 'FAIL (no error): ' || label;
exception when others then return 'ok blocked: ' || label || ' -> ' || sqlerrm; end $$;
create or replace function check_eq(got numeric, want numeric, label text) returns text language sql as $$
  select case when got = want then 'ok ' || label || ' = ' || got else 'FAIL ' || label || ': got ' || coalesce(got::text,'null') || ', want ' || want end; $$;
create or replace function v(name text) returns uuid language sql as $$
  select pv.id from product_variants pv join products p on p.id = pv.product_id where p.name = v.name; $$;
create or replace function cat(name text) returns smallint language sql as $$
  select id from expense_categories where expense_categories.name = cat.name; $$;
-- Grant only test helpers; never undo migration/internal-function revocations.
grant execute on function as_user(text), expect_fail(text,text), check_eq(numeric,numeric,text),
  v(text), cat(text) to authenticated, service_role;

set role authenticated;

-- ===== GO-LIVE (Admin): opening balances and debts =====
select as_user('00000000-0000-0000-0000-00000000000a');
select set_fx_rate('NGN', 0.027);
select adjust_balance(1::smallint, 2000, 'Opening balance at go-live', true);   -- Cash ₺2,000
select adjust_balance(2::smallint, 10000, 'Opening balance at go-live', true);  -- İşbank ₺10,000
select adjust_balance(4::smallint, 85, 'Opening balance at go-live', true);     -- SFx $85
select expect_fail($$select adjust_balance(1::smallint, 500, 'Opening again', true)$$, 'second opening balance on Cash');
select direction, amount, currency from record_debt('we_owe', 'Metro Market', 'Unpaid supplies before go-live', 4200, 'TRY', business_date() + 5, true);
select direction, amount, currency from record_debt('owed_to_us', 'EMU staff office', 'Event catering balance', 1850, 'TRY', null, true);
select direction, amount, currency from record_debt('we_owe', 'Hilary', 'Personal loan to the business', 100, 'USD', null, false, 4::smallint);  -- loan into SFx
select check_eq((select balance from v_account_balances where name='SFx'), 185, 'SFx after $100 loan received');

-- ===== OPERATIONS: orders =====
select as_user('00000000-0000-0000-0000-00000000000b');
-- order 1: 2 BBQ Burger + 1 Jollof Rice + Chicken = 1,220; Cash 660 + Naira ₦15,000 covering 410 → ₺150 still due
select check_eq((create_order(jsonb_build_object('channel','walk_in','items', jsonb_build_array(
    jsonb_build_object('variant_id', v('BBQ Burger'), 'quantity', 2),
    jsonb_build_object('variant_id', v('Jollof Rice + Chicken'), 'quantity', 1)),
  'payments', jsonb_build_array(jsonb_build_object('account_id',1,'amount_try',660),
                                jsonb_build_object('account_id',7,'amount_try',410,'amount',15000))))).total, 1220, 'order 1 total (2 BBQ + Jollof Rice + Chicken)');
-- order 2: delivery, discount 20, paid by İşbank later
select check_eq((create_order(jsonb_build_object('channel','whatsapp','order_type','delivery','delivery_address','EMU dorm 3',
  'discount_amount',20,'discount_reason','Loyal customer',
  'items', jsonb_build_array(jsonb_build_object('variant_id', v('Zinger Burger'), 'quantity', 1))))).total, 380, 'order 2 total after discount');
-- order 3: Vegetable Soup + Swallow + Fish = 580, paid in USD via SFx ($12.10), then voided by Admin with refund
select check_eq((create_order(jsonb_build_object('channel','instagram','items', jsonb_build_array(
    jsonb_build_object('variant_id', v('Vegetable Soup'), 'quantity', 1,
      'addon_ids', (select jsonb_agg(id) from addons where name in ('Swallow','Fish')))),
  'payments', jsonb_build_array(jsonb_build_object('account_id',4,'amount_try',580,'amount',12.10))))).total, 580, 'order 3 total with extras');
select expect_fail($$select cancel_order((select id from orders where daily_number=3), 'Wrong order')$$, 'ops cancelling a paid order');
select expect_fail($$select add_order_payment((select id from orders where daily_number=2), 1::smallint, 999)$$, 'overpayment');
select add_order_payment((select id from orders where daily_number=2), 2::smallint, 380);
select status from set_order_status((select id from orders where daily_number=2), 'ready');
select expect_fail($$select set_order_status((select id from orders where daily_number=2), 'completed')$$, 'ops completing a delivery');

-- ===== OPERATIONS: money out =====
select kind, amount, status from create_withdrawal('advance', 1::smallint, 1000, 'Buy chicken and burger bread', cat('Meat, chicken & offal'), '00000000-0000-0000-0000-00000000000c');
select kind, amount, status from create_withdrawal('direct_expense', 1::smallint, 150, 'Gas cylinder refill', cat('Gas'));
select check_eq((select count(*) from create_withdrawal('direct_expense', 2::smallint, 2500, 'Freezer repair', cat('Equipment maintenance')) where status = 'pending_approval'), 1, 'withdrawal over ₺2,000 waits for approval');
select expect_fail($$select create_withdrawal('direct_expense', 1::smallint, 999999, 'Too much', cat('Gas'))$$, 'withdraw more than balance');
select expect_fail($$select settle_debt((select id from debts where counterparty='Metro Market'), 2::smallint, 4200)$$, 'ops paying debt over limit');
select settle_debt((select id from debts where counterparty='Metro Market'), 2::smallint, 1500, null, 'Part payment');
select settle_debt((select id from debts where counterparty='EMU staff office'), 1::smallint, 1850, null, 'Collected in cash');
select expect_fail($$select record_debt('we_owe', 'Someone', 'New IOU', 100)$$, 'ops recording a debt');

-- ===== LOGISTICS =====
select as_user('00000000-0000-0000-0000-00000000000c');
select status from set_order_status((select id from orders where daily_number=2), 'picked_up');
select status from set_order_status((select id from orders where daily_number=2), 'completed');
select supplier, amount from log_purchase(jsonb_build_object('supplier','Metro Market','category_id', cat('Meat, chicken & offal'),
  'advance_id',(select id from withdrawals where kind='advance'),
  'items',jsonb_build_array(jsonb_build_object('description','Chicken','quantity',4,'unit','kg','amount',720),
                            jsonb_build_object('description','Burger bread','quantity',24,'unit','pcs','amount',180))));
select supplier, amount from log_purchase(jsonb_build_object('supplier','Lemar','category_id', cat('Packaging'),'on_credit',true,'due_date', business_date() + 7,
  'items',jsonb_build_array(jsonb_build_object('description','Takeaway boxes','quantity',200,'unit','pcs','amount',600))));
select return_change((select id from withdrawals where kind='advance'), 1::smallint, 100);
select check_eq((select remaining from v_advances), 0, 'advance fully accounted');
select expect_fail($$select create_order('{"channel":"walk_in","items":[]}')$$, 'logistics creating order');
select expect_fail($$select create_withdrawal('direct_expense', 1::smallint, 10, 'test test', cat('Gas'))$$, 'logistics withdrawing');
select check_eq((select count(*) from debts), 0, 'logistics cannot see debts');

-- ===== ADMIN: approval, void, checks =====
select as_user('00000000-0000-0000-0000-00000000000a');
select status from decide_withdrawal((select id from withdrawals where status='pending_approval'), true, 'ok');
select status from cancel_order((select id from orders where daily_number=3), 'Customer allergic, refunded');
select settle_debt((select id from debts where counterparty='Metro Market'), 2::smallint, 2700, null, 'Final payment');
select check_eq((select outstanding from v_debts where counterparty='Lemar'), 600, 'credit purchase owed to Lemar');
select check_eq((select count(*) from v_debts where state='settled'), 2, 'settled debts (Metro, EMU)');

-- ===== OPERATIONS: daily close =====
select as_user('00000000-0000-0000-0000-00000000000b');
-- Cash: 2,000 + 660 − 1,000 − 150 + 1,850 + 100 = 3,460
select check_eq((close_day(3410, 'Short 50')).expected_amount, 3460, 'expected cash at close');
select expect_fail($$select close_day(3460)$$, 'ops re-closing the day');
select expect_fail($$select reverse_entry(1, 'nope nope')$$, 'ops reversing ledger');
select case when count(*) = 0 then 'ok blocked: ops cannot see activity log' else 'FAIL: ops sees activity log' end from activity_log;

reset role;
select expect_fail($$update ledger_entries set amount = 1 where id = 1$$, 'editing ledger (even as superuser)');
select expect_fail($$delete from debts$$, 'deleting debts');
set role authenticated;
select as_user('00000000-0000-0000-0000-00000000000a');

-- ===== NUMBERS =====
-- İşbank: 10,000 + 380 − 1,500 − 2,500 − 2,700 = 3,680
select check_eq((select balance from v_account_balances where name='İşbank'), 3680, 'İşbank balance');
-- SFx: 85 + 100 loan + 12.10 − 12.10 refund = 185
select check_eq((select balance from v_account_balances where name='SFx'), 185, 'SFx balance (USD)');
-- Net revenue = orders 1 + 2 (order 3 voided) = 1,220 + 380
select check_eq((select net_revenue from report_pnl(business_date(), business_date())), 1600, 'net revenue');
-- COGS = 900 chicken/bread + 600 boxes on credit
select check_eq((select cost_of_goods from report_pnl(business_date(), business_date())), 1500, 'cost of goods');
select check_eq((select operational_expenses from report_pnl(business_date(), business_date())), 150, 'operational (gas)');
select check_eq((select fixed_overheads from report_pnl(business_date(), business_date())), 2500, 'fixed (freezer repair)');
select check_eq((select net_profit from report_pnl(business_date(), business_date())), -2550, 'net profit (debt payments excluded)');
select check_eq((select net_profit from v_pnl_weekly where week_start = date_trunc('week', business_date())::date), -2550, 'weekly view matches');

\echo '--- balances'
select name, currency, balance, balance_try_estimate from v_account_balances order by sort_order;
select check_eq((select unit_price from order_items i join orders o on o.id = i.order_id where o.daily_number = 3), 580, 'extras priced into the plate');
select check_eq((select count(*) from order_items i join orders o on o.id = i.order_id, jsonb_array_elements(i.addons) where o.daily_number = 3), 2, 'two extras recorded on the plate');
select expect_fail($$select create_order(jsonb_build_object('channel','walk_in','items', jsonb_build_array(jsonb_build_object('variant_id', v('BBQ Burger'), 'addon_ids', (select jsonb_agg(id) from addons where name='Fish')))))$$, 'adding Fish to a burger');
select as_user('00000000-0000-0000-0000-00000000000b');
select check_eq((create_order(jsonb_build_object('channel','walk_in','items', jsonb_build_array(
    jsonb_build_object('variant_id', v('Vegetable Soup'), 'quantity', 2,
      'addon_ids', (select jsonb_agg(id) from addons where name = 'Swallow')))))).total, 800, 'order 4: 2 × (Vegetable Soup + Swallow)');
select check_eq((create_order(jsonb_build_object('channel','walk_in','items', jsonb_build_array(
    jsonb_build_object('variant_id', v('Fish'), 'quantity', 3))))).total, 540, 'order 5: 3 × Fish on its own');
select check_eq((select sum(quantity) from v_extras_sold_daily where extra_name = 'Swallow'), 2, 'swallow sold (voided order excluded)');
select check_eq((select sum(standalone) from v_extras_sold_daily where extra_name = 'Fish'), 3, 'fish sold on its own');
select check_eq((select sum(on_plate) from v_extras_sold_daily where extra_name = 'Fish'), 0, 'fish on plates (only on the voided order)');
update addons set price = 200 where name = 'Fish';
select check_eq((select price from product_variants where id = v('Fish')), 200, 'extra price change reaches its menu item');
update product_variants set price = 180 where id = v('Fish');
select check_eq((select price from addons where name = 'Fish'), 180, 'menu item price change reaches the extra');
select as_user('00000000-0000-0000-0000-00000000000a');
\echo '--- items sold'
select * from report_items_sold(business_date(), business_date());
\echo '--- debts'
select direction, counterparty, currency, amount, settled, outstanding, state from v_debts order by created_at;
\echo '--- P&L'
select * from report_pnl(business_date(), business_date());

-- ===== M1: sessions, staff permissions and audit (original 42 checks above) =====
select check_eq((select count(*) from get_session_profile() where role = 'admin'), 1, 'active Admin session profile');
select * from record_login();
select * from record_login();
select check_eq((select count(*) from activity_log where action='auth.login'), 1, 'login audited once per session');
select check_eq((select count(*) from activity_log where action='auth.login' and actor_id=auth.uid()), 1, 'login audit actor');
select expect_fail($$select audit_staff_pin_reset(auth.uid(),auth.uid(),auth.uid())$$, 'client cannot forge PIN-reset audit');
select expect_fail($$select log_activity('fake','profiles','fake')$$, 'client cannot call internal audit helper');
reset role;
insert into auth.users values ('00000000-0000-0000-0000-00000000000d');
set role authenticated;
insert into profiles(id,full_name,phone,role) values ('00000000-0000-0000-0000-00000000000d','New Staff','+905000000000','operations');
select check_eq((select count(*) from activity_log where action='staff.create' and entity_id='00000000-0000-0000-0000-00000000000d' and actor_id=auth.uid()), 1, 'staff creation audited with Admin actor');
update profiles set role='logistics' where id='00000000-0000-0000-0000-00000000000d';
select check_eq((select count(*) from activity_log where action='staff.update' and entity_id='00000000-0000-0000-0000-00000000000d' and details->'before'->>'role'='operations' and details->'after'->>'role'='logistics'), 1, 'role-change audit contains before and after');
select expect_fail($$delete from profiles where id='00000000-0000-0000-0000-00000000000d'$$, 'staff cannot be deleted');

select as_user('00000000-0000-0000-0000-00000000000b');
with changed as (update profiles set role='admin' where id=auth.uid() returning id)
select check_eq((select count(*) from changed),0,'Operations cannot promote themselves');
select * from record_login();
select as_user('00000000-0000-0000-0000-00000000000c');
with changed as (update profiles set is_active=false where id='00000000-0000-0000-0000-00000000000a' returning id)
select check_eq((select count(*) from changed),0,'Logistics cannot deactivate Admin');
select * from record_login();
select as_user('00000000-0000-0000-0000-00000000000a');
select check_eq((select count(*) from activity_log where action='auth.login'),3,'all three roles can audit their own login');

reset role;
set role service_role;
select audit_staff_pin_reset('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000d');
select expect_fail($$select audit_staff_pin_reset('00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000d')$$,'PIN audit rejects non-admin actor');
reset role;
set role authenticated;
select check_eq((select count(*) from activity_log where action='staff.pin_reset' and actor_id=auth.uid()),1,'successful PIN reset audited');
select check_eq((select count(*) from activity_log where action='staff.pin_reset' and details is not null),0,'audit never contains PIN');
update profiles set is_active=false where id='00000000-0000-0000-0000-00000000000c';
select check_eq((select count(*) from activity_log where action='staff.update' and entity_id='00000000-0000-0000-0000-00000000000c' and details->'after'->>'is_active'='false'),1,'deactivation audited');
select as_user('00000000-0000-0000-0000-00000000000c');
select check_eq((select count(*) from withdrawals),0,'inactive Logistics cannot read their own advances');
select check_eq((select count(*) from purchases),0,'inactive Logistics cannot read their own purchases');
select expect_fail($$select record_login()$$,'inactive staff cannot finish login');
select as_user('00000000-0000-0000-0000-00000000000a');
update profiles set is_active=true where id='00000000-0000-0000-0000-00000000000c';

reset role;
update auth.sessions set created_at=statement_timestamp()-interval '12 hours' where user_id='00000000-0000-0000-0000-00000000000b';
set role authenticated;
select as_user('00000000-0000-0000-0000-00000000000b');
select check_eq((select count(*) from accounts),0,'12-hour session cannot read accounts');
select check_eq((select count(*) from products),0,'12-hour session cannot read menu');
select expect_fail($$select create_order('{"channel":"walk_in","items":[]}')$$,'12-hour session cannot call order RPC');
select expect_fail($$select get_session_profile()$$,'12-hour session cannot fetch profile');
select as_user('00000000-0000-0000-0000-00000000000a');
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000a","session_id":"00000000-0000-0000-0000-00000000000c"}',false);
select check_eq((select count(*) from accounts),0,'session must belong to caller');
select set_config('request.jwt.claims','{}',false);
select expect_fail($$select get_session_profile()$$,'missing session id rejected');
select as_user('00000000-0000-0000-0000-00000000000a');
reset role;
delete from auth.sessions where user_id='00000000-0000-0000-0000-00000000000c';
set role authenticated;
select as_user('00000000-0000-0000-0000-00000000000c');
select check_eq((select count(*) from orders),0,'signed-out JWT cannot read orders');
select as_user('00000000-0000-0000-0000-00000000000a');

-- ===== M2: menu transactions, immutable history and Storage permissions =====
reset role;
grant usage,select on all sequences in schema public to authenticated;
grant delete on product_categories,product_addons to authenticated; -- prove triggers deny even with table grants
update auth.sessions set created_at=statement_timestamp() where user_id='00000000-0000-0000-0000-00000000000b';
insert into auth.sessions(id,user_id) values('00000000-0000-0000-0000-00000000000c','00000000-0000-0000-0000-00000000000c');
set role authenticated;
select as_user('00000000-0000-0000-0000-00000000000b');
select save_menu_extra(jsonb_build_object('id',(select id from addons where name='Fish'),'name','Fish','price','200','is_active',true,
  'product_ids',(select jsonb_agg(id) from products where name='Vegetable Soup')));
select check_eq((select price from addons where name='Fish'),200,'M2 Fish extra price');
select check_eq((select price from product_variants where id=v('Fish')),200,'M2 Fish standalone price');
select check_eq((select count(*) from price_history where addon_id=(select id from addons where name='Fish') and old_price=180 and new_price=200 and changed_by=auth.uid()),2,'M2 Fish history preserves actor and before/after');
select check_eq((select unit_price from order_items i join orders o on o.id=i.order_id where daily_number=5),180,'M2 old standalone order snapshot unchanged');
select check_eq((select (a->>'price')::numeric from order_items i join orders o on o.id=i.order_id,jsonb_array_elements(i.addons) a where daily_number=3 and a->>'name'='Fish'),180,'M2 old plate extra snapshot unchanged');
select expect_fail($$select create_order(jsonb_build_object('channel','walk_in','items',jsonb_build_array(jsonb_build_object('variant_id',v('Jollof Rice + Chicken'),'addon_ids',(select jsonb_agg(id) from addons where name='Fish')))))$$,'M2 removed dish-extra link cannot be ordered');
select check_eq((select count(*) from product_addons pa join addons a on a.id=pa.addon_id join products p on p.id=pa.product_id where a.name='Fish' and p.name='Jollof Rice + Chicken' and not pa.is_active),1,'M2 removed link retained as inactive');
select save_menu_extra(jsonb_build_object('name','Test Extra','price','12.50','is_active',false,'product_ids','[]'::jsonb));
select check_eq((select count(*) from products p join addons a on a.id=p.addon_id join product_variants pv on pv.product_id=p.id where a.name='Test Extra' and a.price=pv.price and not a.is_active and not p.is_active and not pv.is_active),1,'M2 new extra has one matching inactive standalone variant');
update addons set is_active=false where name='Fish';
select check_eq((select count(*) from products p join product_variants pv on pv.product_id=p.id where p.name='Fish' and not p.is_active and not pv.is_active),1,'M2 extra deactivation reaches standalone menu');
select expect_fail($$select create_order(jsonb_build_object('channel','walk_in','items',jsonb_build_array(jsonb_build_object('variant_id',v('Fish')))))$$,'M2 inactive standalone extra cannot be ordered');
select expect_fail($$select create_order(jsonb_build_object('channel','walk_in','items',jsonb_build_array(jsonb_build_object('variant_id',v('Vegetable Soup'),'addon_ids',(select jsonb_agg(id) from addons where name='Fish')))))$$,'M2 inactive plate extra cannot be ordered');
update addons set is_active=true where name='Fish';
update product_categories set is_active=false where name='Burgers';
select expect_fail($$select create_order(jsonb_build_object('channel','walk_in','items',jsonb_build_array(jsonb_build_object('variant_id',v('BBQ Burger')))))$$,'M2 inactive category cannot be ordered');
update product_categories set is_active=true where name='Burgers';
select save_menu_product(jsonb_build_object('category_id',(select id from product_categories where name='Burgers'),'name','Test Dish','is_active',true,
  'variants',jsonb_build_array(jsonb_build_object('name','Small','price','10.25'),jsonb_build_object('name','Large','price','20.50'))));
select check_eq((select count(*) from product_variants pv join products p on p.id=pv.product_id where p.name='Test Dish'),2,'M2 atomic product with two variants');
select expect_fail($$select save_menu_product(jsonb_build_object('category_id',(select id from product_categories where name='Burgers'),'name','Rollback Dish','variants',jsonb_build_array(jsonb_build_object('name','Good','price','10'),jsonb_build_object('name','Bad','price','-1'))))$$,'M2 invalid variant rejects whole product');
select check_eq((select count(*) from products where name='Rollback Dish'),0,'M2 failed product leaves no partial rows');
select import_menu_products('[{"category":"Burgers","product":"Test Dish","variant":"Small","price":"11.75"},{"category":"Imported","product":"CSV Dish","variant":"Regular","price":"22"}]');
select check_eq((select price from product_variants pv join products p on p.id=pv.product_id where p.name='Test Dish' and pv.name='Small'),11.75,'M2 CSV updates matching variant price');
select check_eq((select count(*) from products where name='CSV Dish'),1,'M2 CSV creates product and category');
select expect_fail($$select import_menu_products('[{"category":"Imported","product":"CSV Dish","variant":"Regular","price":"33"},{"category":"Imported","product":"Bad CSV","variant":"Regular","price":"bad"}]')$$,'M2 invalid import rolls back batch');
select check_eq((select price from product_variants where id=v('CSV Dish')),22,'M2 failed import leaves old price');
select expect_fail($$select import_menu_products('[{"category":"Extras","product":"Fish","variant":"Regular","price":"1"}]')$$,'M2 CSV cannot independently price an extra');
select expect_fail($$delete from product_categories where name='Imported'$$,'M2 categories cannot be deleted');
select expect_fail($$delete from product_addons where not is_active$$,'M2 dish-extra links cannot be deleted');
insert into storage.objects(bucket_id,name) values('menu-photos',auth.uid()::text||'/test.jpg');
select check_eq((select count(*) from storage.objects where bucket_id='menu-photos'),1,'M2 Operations can upload and read own photo');
select expect_fail($$insert into storage.objects(bucket_id,name) values('menu-photos','someone-else/test.jpg')$$,'M2 cannot upload into another folder');
with changed as (update storage.objects set name='renamed.jpg' returning id) select check_eq((select count(*) from changed),0,'M2 uploaded photos cannot be overwritten');
with changed as (delete from storage.objects returning id) select check_eq((select count(*) from changed),0,'M2 photos cannot be deleted');
select as_user('00000000-0000-0000-0000-00000000000c');
select expect_fail($$select save_menu_product('{"name":"Forbidden","variants":[]}')$$,'M2 Logistics cannot save menu products');
select expect_fail($$select save_menu_extra('{"name":"Forbidden","price":"1"}')$$,'M2 Logistics cannot save extras');
select expect_fail($$select import_menu_products('[]')$$,'M2 Logistics cannot import CSV');
select expect_fail($$insert into storage.objects(bucket_id,name) values('menu-photos',auth.uid()::text||'/test.jpg')$$,'M2 Logistics cannot upload menu photos');
select check_eq((select count(*) from price_history),0,'M2 Logistics cannot read price history');
select check_eq((select count(*) from storage.objects),1,'M2 active Logistics can read menu photos');
select as_user('00000000-0000-0000-0000-00000000000a');
select check_eq(((select count(*) from activity_log where action='product_addons.update' and actor_id='00000000-0000-0000-0000-00000000000b')>0)::int,1,'M2 dish-extra changes audited');
select check_eq(((select count(*) from activity_log where action='product_categories.update' and actor_id='00000000-0000-0000-0000-00000000000b')>0)::int,1,'M2 category changes audited');
select check_eq((select count(*) from storage.buckets where id='menu-photos' and not public and file_size_limit=5242880),1,'M2 photos bucket is private and capped at 5MB');

-- ===== M3: quotes, discounts, payments, retries (all 102 earlier checks retained) =====
select as_user('00000000-0000-0000-0000-00000000000b');
update addons set price=180 where name='Fish'; -- isolated acceptance fixture, never the hosted menu
create temp table m3_cases(name text primary key,payload jsonb);
insert into m3_cases values('split',jsonb_build_object('channel','walk_in','client_request_id','30000000-0000-4000-8000-000000000001',
  'items',jsonb_build_array(jsonb_build_object('variant_id',v('BBQ Burger'),'quantity',2),jsonb_build_object('variant_id',v('Jollof Rice + Chicken'),'quantity',1)),
  'payments',jsonb_build_array(jsonb_build_object('account_id',1,'amount_try',780),jsonb_build_object('account_id',7,'amount_try',410,'amount',15000))));
select count(*) as m3_orders_before from orders \gset
select check_eq((quote_order((select payload from m3_cases where name='split'))->>'total')::numeric,1220,'M3 database quote total');
select check_eq((quote_order((select payload from m3_cases where name='split'))->>'balance_due')::numeric,30,'M3 split-payment quote leaves 30 due');
select check_eq((quote_order((select payload from m3_cases where name='split'))->'payments'->1->>'rate_to_try')::numeric,0.027333,'M3 implied Naira rate has six decimals');
select check_eq((select count(*) from orders),:m3_orders_before,'M3 quotes create no order');
select check_eq((quote_order(jsonb_build_object('items',jsonb_build_array(jsonb_build_object('variant_id',v('Vegetable Soup'),'addon_ids',(select jsonb_agg(id) from addons where name in('Fish','Swallow'))))))->>'total')::numeric,580,'M3 soup plus Swallow and Fish quote');
select check_eq((quote_order(jsonb_build_object('items',jsonb_build_array(jsonb_build_object('variant_id',v('Fish'),'quantity',2))))->>'total')::numeric,360,'M3 standalone Fish quote');
select check_eq((quote_order((select payload-'payments' from m3_cases where name='split')||'{"discount_percent":10,"discount_reason":"Ten percent"}')->>'total')::numeric,1098,'M3 percentage discount is computed in database');
select check_eq((quote_order((select payload-'payments' from m3_cases where name='split')||'{"discount_amount":20,"discount_reason":"Loyal customer"}')->>'total')::numeric,1200,'M3 fixed discount quote');
select expect_fail($$select quote_order((select payload from m3_cases where name='split')||'{"discount_percent":101,"discount_reason":"Bad"}')$$,'M3 discount percent above 100');
select expect_fail($$select quote_order((select payload from m3_cases where name='split')||'{"discount_percent":10,"discount_amount":1,"discount_reason":"Both"}')$$,'M3 conflicting discount types');
select expect_fail($$select quote_order((select payload from m3_cases where name='split')||'{"discount_amount":1,"discount_reason":"   "}')$$,'M3 blank discount reason');
select expect_fail($$select quote_order((select payload-'payments' from m3_cases where name='split')||'{"payments":[{"account_id":1,"amount_try":1221}]}')$$,'M3 overpayment uses database message');
select expect_fail($$select quote_order((select payload-'payments' from m3_cases where name='split')||'{"payments":[{"account_id":7,"amount_try":100}]}')$$,'M3 foreign payment needs received amount');
select expect_fail($$select quote_order((select payload-'payments' from m3_cases where name='split')||'{"payments":[{"account_id":1,"amount_try":1.001}]}')$$,'M3 sub-cent payment rejected');
select expect_fail($$select quote_order((select payload-'payments' from m3_cases where name='split')||'{"payments":[{"account_id":7,"amount_try":1,"amount":"NaN"}]}')$$,'M3 non-finite foreign receipt rejected');
create temp table m3_saved as select (create_order(payload)).* from m3_cases where name='split';
select check_eq((select balance_due from v_order_payments where id=(select id from m3_saved)),30,'M3 saved split order leaves 30 due');
select check_eq((select count(*) from ledger_entries where order_id=(select id from m3_saved)),2,'M3 both payments saved once');
select create_order(payload) from m3_cases where name='split';
select check_eq((select count(*) from orders where client_request_id='30000000-0000-4000-8000-000000000001'),1,'M3 retried save returns same order');
select check_eq((select count(*) from ledger_entries where order_id=(select id from m3_saved)),2,'M3 retried save never duplicates payments');
select expect_fail($$select create_order((select payload from m3_cases where name='split')||'{"note":"Changed request"}')$$,'M3 request id cannot be reused with changed content');
insert into m3_cases values('discount',(select payload-'payments'-'client_request_id' from m3_cases where name='split')||'{"client_request_id":"30000000-0000-4000-8000-000000000002","discount_percent":10,"discount_reason":"Ten percent"}');
select check_eq((create_order((select payload from m3_cases where name='discount'))).discount_amount,122,'M3 saved percentage discount becomes exact amount');
select check_eq((select count(*) from ledger_entries l join orders o on o.id=l.order_id where o.client_request_id='30000000-0000-4000-8000-000000000002'),0,'M3 unpaid save writes no payments');
select expect_fail($$select create_order((select payload-'client_request_id' from m3_cases where name='split')||'{"client_request_id":"30000000-0000-4000-8000-000000000003","payments":[{"account_id":1,"amount_try":780},{"account_id":7,"amount_try":410,"amount":0}]}')$$,'M3 invalid split payment rejects whole order');
select check_eq((select count(*) from orders where client_request_id='30000000-0000-4000-8000-000000000003'),0,'M3 failed save has no partial order');
select check_eq((select count(*) from ledger_entries l join orders o on o.id=l.order_id where o.client_request_id='30000000-0000-4000-8000-000000000003'),0,'M3 failed save has no partial ledger');
insert into m3_cases values('stale',(select payload-'payments'-'client_request_id' from m3_cases where name='split')||jsonb_build_object('quote_token',quote_order((select payload-'payments' from m3_cases where name='split'))->>'quote_token'));
update product_variants set price=401 where id=v('BBQ Burger');
select expect_fail($$select create_order((select payload from m3_cases where name='stale'))$$,'M3 changed menu quote must be reviewed');
select check_eq((select unit_price from order_items where order_id=(select id from m3_saved) and product_name='BBQ Burger'),400,'M3 saved prices stay frozen after menu edit');
update product_variants set price=400 where id=v('BBQ Burger');
update product_variants set is_active=false where id=v('BBQ Burger');
select expect_fail($$select quote_order((select payload from m3_cases where name='split'))$$,'M3 inactive variants cannot be quoted');
update product_variants set is_active=true where id=v('BBQ Burger');
select as_user('00000000-0000-0000-0000-00000000000c');
select expect_fail($$select quote_order('{"items":[]}')$$,'M3 Logistics cannot quote orders');
select expect_fail($$select create_order('{"items":[]}')$$,'M3 Logistics cannot create orders');
select as_user('00000000-0000-0000-0000-00000000000a');
select check_eq((quote_order((select payload from m3_cases where name='split'))->>'total')::numeric,1220,'M3 Admin can quote orders');
select check_eq((select count(*) from activity_log where action='order.create' and entity_id=(select id::text from m3_saved)),1,'M3 save audited once even after retries');
select check_eq(has_function_privilege('anon','quote_order(jsonb)','execute')::int,0,'M3 anonymous cannot call quote RPC');
select check_eq((select sum(line_total) from order_items where order_id=(select id from m3_saved)),1220,'M3 stored item lines equal quote');

select check_eq((select length(client_request_hash) from m3_saved),64,'M3 request metadata is an opaque SHA-256 hash');
select check_eq((select count(*) from information_schema.columns where table_schema='public' and table_name='orders' and column_name='client_request_payload'),0,'M3 full payment payload is not exposed on orders');

select check_eq((quote_order(jsonb_build_object('total',1,'subtotal',1,'items',jsonb_build_array(jsonb_build_object('variant_id',v('BBQ Burger'),'quantity',2,'unit_price',1),jsonb_build_object('variant_id',v('Jollof Rice + Chicken'),'quantity',1,'unit_price',1))))->>'total')::numeric,1220,'M3 quotes ignore client prices and totals');
select expect_fail($$select quote_order(jsonb_build_object('items',jsonb_build_array(jsonb_build_object('variant_id',v('BBQ Burger'),'quantity',0))))$$,'M3 zero item quantity refused');

-- ===== M4: delivery visibility, payments, status, refund permissions =====
select as_user('00000000-0000-0000-0000-00000000000b');
create temp table m4_delivery as select saved.* from create_order(jsonb_build_object('channel','phone','order_type','delivery','delivery_address','M4 test address','customer_name','M4 Customer',
 'items',jsonb_build_array(jsonb_build_object('variant_id',v('BBQ Burger'))),'payments',jsonb_build_array(jsonb_build_object('account_id',1,'amount_try',100)))) saved;
create temp table m4_receipt(eid bigint);
insert into m4_receipt select add_order_payment((select id from m4_delivery),7::smallint,100,5000,'40000000-0000-4000-8000-000000000001');
select check_eq(add_order_payment((select id from m4_delivery),7::smallint,100,5000,'40000000-0000-4000-8000-000000000001'),(select eid from m4_receipt),'M4 retry returns original ledger entry');
select check_eq((select count(*) from ledger_entries where order_id=(select id from m4_delivery)),2,'M4 retry never duplicates payment');
select expect_fail($$select add_order_payment((select id from m4_delivery),7::smallint,101,5000,'40000000-0000-4000-8000-000000000001')$$,'M4 changed payment retry refused');
select expect_fail($$select add_order_payment((select id from m4_delivery),1::smallint,201,null,'40000000-0000-4000-8000-000000000002')$$,'M4 overpayment retains database guard');
select expect_fail($$select add_order_payment((select id from m4_delivery),1::smallint,1.001,null,'40000000-0000-4000-8000-000000000002')$$,'M4 sub-cent payment refused');
select expect_fail($$select add_order_payment((select id from m4_delivery),7::smallint,1,'NaN','40000000-0000-4000-8000-000000000002')$$,'M4 nonfinite payment refused');
select expect_fail($$select add_order_payment((select id from m4_delivery),7::smallint,1,null,'40000000-0000-4000-8000-000000000002')$$,'M4 foreign amount required');
select expect_fail($$select cancel_order((select id from m4_delivery),'Ops cannot refund')$$,'M4 Operations cannot cancel partially paid delivery');
select status from set_order_status((select id from m4_delivery),'preparing');
select status from set_order_status((select id from m4_delivery),'ready');
select expect_fail($$select list_delivery_orders()$$,'M4 Operations cannot call Logistics projection');
select expect_fail($$select set_order_status((select id from m4_delivery),'picked_up')$$,'M4 Operations cannot pick up delivery');
select as_user('00000000-0000-0000-0000-00000000000c');
select check_eq((select (x->>'balance_due')::numeric from jsonb_array_elements(list_delivery_orders()) x where x->>'id'=(select id::text from m4_delivery)),200,'M4 Logistics sees true partially paid due');
select check_eq((select (x->>'paid_try')::numeric from jsonb_array_elements(list_delivery_orders()) x where x->>'id'=(select id::text from m4_delivery)),200,'M4 Logistics sees true paid total');
select check_eq((select count(*) from ledger_entries where order_id=(select id from m4_delivery)),0,'M4 Logistics still cannot read order ledger');
select check_eq((select count(*) from jsonb_array_elements(list_delivery_orders()) x where x->>'order_type'<>'delivery' or x->>'status' not in ('ready','picked_up')),0,'M4 projection only exposes active deliveries');
select check_eq((select count(*) from jsonb_array_elements(list_delivery_orders()) x where x ? 'client_request_hash' or x ? 'payments' or x ? 'paid_via'),0,'M4 projection has no request or account details');
select expect_fail($$select add_order_payment((select id from m4_delivery),1::smallint,1,null,'40000000-0000-4000-8000-000000000003')$$,'M4 Logistics cannot take payment');
select status from set_order_status((select id from m4_delivery),'picked_up');
select check_eq((select count(*) from jsonb_array_elements(list_delivery_orders()) x where x->>'id'=(select id::text from m4_delivery)),1,'M4 picked-up delivery remains on board');
select status from set_order_status((select id from m4_delivery),'completed');
select check_eq((select count(*) from jsonb_array_elements(list_delivery_orders()) x where x->>'id'=(select id::text from m4_delivery)),0,'M4 completed delivery leaves board');
select as_user('00000000-0000-0000-0000-00000000000a');
select check_eq((select count(*) from activity_log where action='order.payment' and entity_id=(select id::text from m4_delivery)),2,'M4 payments each audited once');
select balance as m4_cash_before from v_account_balances where id=1 \gset
select balance as m4_naira_before from v_account_balances where id=7 \gset
select status from cancel_order((select id from m4_delivery),'Admin voids completed delivery');
select check_eq((select balance from v_account_balances where id=1),:m4_cash_before-100,'M4 Admin refund reduces Cash by original receipt');
select check_eq((select balance from v_account_balances where id=7),:m4_naira_before-5000,'M4 Admin refund reduces Naira by original receipt');
select check_eq((select paid_try from v_order_payments where id=(select id from m4_delivery)),0,'M4 voided payment total is zero');
select expect_fail($$select cancel_order((select id from m4_delivery),'Duplicate refund')$$,'M4 double cancellation refused');
select check_eq(has_function_privilege('anon','list_delivery_orders()','execute')::int,0,'M4 anonymous cannot read delivery projection');
select check_eq(has_function_privilege('anon','add_order_payment(uuid,smallint,numeric,numeric,uuid)','execute')::int,0,'M4 anonymous cannot add payment');
select check_eq((select count(*) from order_payment_requests),0,'M4 retry metadata unreadable even by client Admin');

-- ===== M5: money previews, approvals, request safety, audit, role guards =====
-- The earlier advance fixture now supplies the user-required category; no prior assertion changed.
select as_user('00000000-0000-0000-0000-00000000000a');
select adjust_balance(1::smallint,15000,'M5 isolated test funds');
select balance as m5_cash_before from v_account_balances where id=1 \gset
create temp table m5_payloads(name text primary key,p jsonb);
insert into m5_payloads values('pending',jsonb_build_object('kind','direct_expense','account_id',1,'amount','2500','purpose','M5 repair request','category_id',cat('Gas')));
select as_user('00000000-0000-0000-0000-00000000000b');
select check_eq((quote_withdrawal((select p from m5_payloads where name='pending'))->>'needs_approval')::boolean::int,1,'M5 2500 preview needs approval');
select check_eq((quote_withdrawal((select p from m5_payloads where name='pending'))->>'balance_after')::numeric,:m5_cash_before,'M5 pending preview leaves balance unchanged');
select check_eq((quote_withdrawal((select p from m5_payloads where name='pending'))->>'balance_if_approved')::numeric,:m5_cash_before-2500,'M5 preview shows approved balance');
select check_eq((select balance from v_account_balances where id=1),:m5_cash_before,'M5 preview posts nothing');
insert into m5_payloads values('pending-token',(select p||jsonb_build_object('quote_token',quote_withdrawal(p)->>'quote_token') from m5_payloads where name='pending'));
create temp table m5_pending as select run_money_action('withdraw',(select p from m5_payloads where name='pending-token'),'60000000-0000-4000-8000-000000000001') as result;
select check_eq((select count(*) from withdrawals where id=(select (result->>'id')::uuid from m5_pending) and status='pending_approval'),1,'M5 request is pending');
select check_eq((select balance from v_account_balances where id=1),:m5_cash_before,'M5 pending request posts no money');
select run_money_action('withdraw',(select p from m5_payloads where name='pending-token'),'60000000-0000-4000-8000-000000000001');
select check_eq((select count(*) from withdrawals where purpose='M5 repair request'),1,'M5 withdrawal retry creates one request');
select expect_fail($$select run_money_action('withdraw',(select p||'{"amount":"2501"}' from m5_payloads where name='pending-token'),'60000000-0000-4000-8000-000000000001')$$,'M5 changed request content refused');
select expect_fail($$select run_money_action('decide',jsonb_build_object('withdrawal_id',(select result->>'id' from m5_pending),'approve',true),'60000000-0000-4000-8000-000000000002')$$,'M5 Operations cannot approve');
select expect_fail($$select quote_withdrawal('{"kind":"advance","account_id":1,"amount":"10","purpose":"No category","recipient_id":"00000000-0000-0000-0000-00000000000c"}')$$,'M5 advance preview requires category');
select expect_fail($$select create_withdrawal('advance',1::smallint,10,'Missing category',null,'00000000-0000-0000-0000-00000000000c')$$,'M5 advance write requires category');
select expect_fail($$select quote_withdrawal((select p||'{"amount":"99999999"}' from m5_payloads where name='pending'))$$,'M5 excessive withdrawal rejected with balance');
select expect_fail($$select create_withdrawal('direct_expense',1::smallint,0.001,'Sub-cent amount',cat('Gas'))$$,'M5 sub-cent withdrawal rejected');
select expect_fail($$select create_withdrawal('direct_expense',1::smallint,-1,'Negative amount',cat('Gas'))$$,'M5 negative withdrawal rejected');
select expect_fail($$select create_withdrawal('direct_expense',1::smallint,'NaN','Nonfinite amount',cat('Gas'))$$,'M5 nonfinite withdrawal rejected');
select expect_fail($$select create_withdrawal('advance',1::smallint,10,'Unknown recipient',cat('Gas'),'00000000-0000-0000-0000-000000000099')$$,'M5 advance needs active recipient');
select expect_fail($$select create_withdrawal('direct_expense',1::smallint,10,'Bad receipt path',cat('Gas'),null,null,'someone-else/test.jpg')$$,'M5 receipt must be real and owned');
select check_eq((quote_withdrawal(jsonb_build_object('kind','direct_expense','account_id',4,'amount','1','purpose','M5 USD quote','category_id',cat('Gas')))->>'amount_try')::numeric,47.90,'M5 USD preview uses latest default');
select check_eq((quote_withdrawal(jsonb_build_object('kind','direct_expense','account_id',4,'amount','1','rate','48','purpose','M5 explicit rate','category_id',cat('Gas')))->>'amount_try')::numeric,48,'M5 explicit confirmed withdrawal rate');
insert into m5_payloads values('stale',(select p||jsonb_build_object('quote_token',quote_withdrawal(p)->>'quote_token') from m5_payloads where name='pending'));
select as_user('00000000-0000-0000-0000-00000000000a');
select run_money_action('decide',jsonb_build_object('withdrawal_id',(select result->>'id' from m5_pending),'approve',true,'note','Approved repair'),'60000000-0000-4000-8000-000000000002');
select check_eq((select balance from v_account_balances where id=1),:m5_cash_before-2500,'M5 balance changes after approval');
select run_money_action('decide',jsonb_build_object('withdrawal_id',(select result->>'id' from m5_pending),'approve',true,'note','Approved repair'),'60000000-0000-4000-8000-000000000002');
select check_eq((select count(*) from ledger_entries where withdrawal_id=(select (result->>'id')::uuid from m5_pending)),1,'M5 approval retry posts once');
select expect_fail($$select run_money_action('withdraw',(select p from m5_payloads where name='stale'),'60000000-0000-4000-8000-000000000003')$$,'M5 changed balance preview refused');
select check_eq((select amount_try from v_expenses where id=(select (result->>'id')::uuid from m5_pending)),2500,'M5 approved direct expense visible');
select check_eq((select count(*) from v_expenses where id=(select (result->>'id')::uuid from m5_pending) and category='Gas'),1,'M5 expense has correct category');
create temp table m5_advance as select saved.* from create_withdrawal('advance',1::smallint,50,'M5 category advance',cat('Meat, chicken & offal'),'00000000-0000-0000-0000-00000000000c') saved;
select check_eq((select count(*) from v_expenses where id=(select id from m5_advance)),0,'M5 advance is not an expense');
select check_eq((select category_id from m5_advance),cat('Meat, chicken & offal'),'M5 advance stores category');
select expect_fail($$select transfer_between_accounts(1::smallint,2::smallint,-1)$$,'M5 negative transfer refused');
select expect_fail($$select transfer_between_accounts(1::smallint,2::smallint,10,9)$$,'M5 same-currency mismatch refused');
select expect_fail($$select transfer_between_accounts(1::smallint,4::smallint,100)$$,'M5 foreign transfer needs received amount');
select expect_fail($$select transfer_between_accounts(1::smallint,1::smallint,10)$$,'M5 same-account transfer refused');
select balance as m5_cash_pre_transfer from v_account_balances where id=1 \gset
select balance as m5_usd_pre_transfer from v_account_balances where id=4 \gset
select run_money_action('transfer','{"from_account":1,"to_account":4,"amount_from":"479","amount_to":"10","note":"M5 conversion"}','60000000-0000-4000-8000-000000000004');
select run_money_action('transfer','{"from_account":1,"to_account":4,"amount_from":"479","amount_to":"10","note":"M5 conversion"}','60000000-0000-4000-8000-000000000004');
select check_eq((select balance from v_account_balances where id=1),:m5_cash_pre_transfer-479,'M5 transfer source debited once');
select check_eq((select balance from v_account_balances where id=4),:m5_usd_pre_transfer+10,'M5 transfer destination credited once');
select check_eq((select count(*) from account_transfers where note='M5 conversion'),1,'M5 transfer retry keeps one transfer');
select expect_fail($$select adjust_balance(1::smallint,0.001,'Sub-cent adjustment')$$,'M5 sub-cent adjustment refused');
select balance as m5_cash_pre_adjust from v_account_balances where id=1 \gset
create temp table m5_adjust as select run_money_action('adjust','{"account_id":1,"amount":"12.50","reason":"M5 till correction"}','60000000-0000-4000-8000-000000000005') as result;
select run_money_action('adjust','{"account_id":1,"amount":"12.50","reason":"M5 till correction"}','60000000-0000-4000-8000-000000000005');
select check_eq((select balance from v_account_balances where id=1),:m5_cash_pre_adjust+12.5,'M5 adjustment retry posts once');
select expect_fail($$select reverse_entry((select (result->>'id')::bigint from m5_adjust),'')$$,'M5 reversal needs reason');
select run_money_action('reverse',jsonb_build_object('entry_id',(select result->>'id' from m5_adjust),'reason','M5 undo correction'),'60000000-0000-4000-8000-000000000006');
select run_money_action('reverse',jsonb_build_object('entry_id',(select result->>'id' from m5_adjust),'reason','M5 undo correction'),'60000000-0000-4000-8000-000000000006');
select check_eq((select balance from v_account_balances where id=1),:m5_cash_pre_adjust,'M5 reversal retry posts once');
select expect_fail($$select set_fx_rate('USD',0)$$,'M5 zero rate refused');
select expect_fail($$select set_fx_rate('EUR',1)$$,'M5 unsupported default currency refused');
select expect_fail($$select set_fx_rate('NGN',0.0000001)$$,'M5 overprecision rate refused');
select run_money_action('rate','{"currency":"USD","rate":"48"}','60000000-0000-4000-8000-000000000007');
select run_money_action('rate','{"currency":"USD","rate":"48"}','60000000-0000-4000-8000-000000000007');
select check_eq((select rate_to_try from fx_rates where currency='USD' and effective_date=business_date()),48,'M5 rate saved on server business date');
select check_eq((select count(*) from activity_log where action='account.transfer' and details->>'amount_from'='479'),1,'M5 transfer audited once');
select check_eq((select count(*) from activity_log where action='fx_rate.set' and details->'after'->>'rate_to_try'='48.000000'),1,'M5 rate change audited once');
select run_money_action('limit','{"limit":"3000"}','60000000-0000-4000-8000-000000000008');
select check_eq((select withdrawal_approval_limit_try from settings),3000,'M5 Admin can change approval limit');
select check_eq((select count(*) from activity_log where action='settings.update' and details->'after'->>'withdrawal_approval_limit_try'='3000.00'),1,'M5 limit change audited');
select expect_fail($$select set_approval_limit(-1)$$,'M5 invalid limit refused');
select expect_fail($$select run_money_action('arbitrary','{}','60000000-0000-4000-8000-000000000099')$$,'M5 dispatcher cannot write arbitrary tables');
select check_eq((select count(*) from money_requests),0,'M5 recovery metadata has no client read policy');
select check_eq(has_function_privilege('anon','run_money_action(text,jsonb,uuid)','execute')::int,0,'M5 anonymous cannot run money actions');
select check_eq(has_function_privilege('authenticated','m5_amount(numeric,boolean)','execute')::int,0,'M5 validation helper is private');
select set_approval_limit(2000);
select as_user('00000000-0000-0000-0000-00000000000b');
select expect_fail($$select set_approval_limit(3000)$$,'M5 Operations cannot change limit');
select expect_fail($$select run_money_action('adjust','{"account_id":1,"amount":"1","reason":"Forbidden"}','60000000-0000-4000-8000-000000000010')$$,'M5 Operations cannot adjust');
select as_user('00000000-0000-0000-0000-00000000000c');
select expect_fail($$select quote_withdrawal((select p from m5_payloads where name='pending'))$$,'M5 Logistics cannot preview withdrawal');
select expect_fail($$select run_money_action('withdraw',(select p from m5_payloads where name='pending'),'60000000-0000-4000-8000-000000000011')$$,'M5 Logistics cannot withdraw');
select expect_fail($$insert into ledger_entries(account_id,entry_type,amount,rate_to_try,amount_try,created_by) values(1,'direct_expense',-999999,1,-999999,auth.uid())$$,'M5 direct ledger writes remain denied');

-- M5 receipt bucket uses the original storage.sql policies, unchanged.
select as_user('00000000-0000-0000-0000-00000000000b');
insert into storage.objects(bucket_id,name) values('receipts',auth.uid()::text||'/'||business_date()||'/m5-test.jpg');
select check_eq((select count(*) from storage.objects where bucket_id='receipts'),1,'M5 Operations uploads own receipt');
select expect_fail($$insert into storage.objects(bucket_id,name) values('receipts','someone-else/m5.jpg')$$,'M5 receipt upload rejects another folder');
select id from create_withdrawal('direct_expense',1::smallint,1,'M5 uploaded receipt',cat('Gas'),null,null,auth.uid()::text||'/'||business_date()||'/m5-test.jpg');
select check_eq((select count(*) from withdrawals where purpose='M5 uploaded receipt' and receipt_path is not null),1,'M5 real receipt attaches to withdrawal');
with changed as(update storage.objects set name='changed.jpg' where bucket_id='receipts' returning id)select check_eq((select count(*) from changed),0,'M5 receipt files cannot be overwritten');
with changed as(delete from storage.objects where bucket_id='receipts' returning id)select check_eq((select count(*) from changed),0,'M5 receipt files cannot be deleted');
select as_user('00000000-0000-0000-0000-00000000000a');
select check_eq((select count(*) from storage.objects where bucket_id='receipts'),1,'M5 Admin reads staff receipts');
select as_user('00000000-0000-0000-0000-00000000000c');
select check_eq((select count(*) from storage.objects where bucket_id='receipts'),0,'M5 Logistics cannot read Operations receipt');
insert into storage.objects(bucket_id,name) values('receipts',auth.uid()::text||'/'||business_date()||'/own-test.jpg');
select check_eq((select count(*) from storage.objects where bucket_id='receipts'),1,'M5 Logistics sees only own receipt');
select as_user('00000000-0000-0000-0000-00000000000a');
select check_eq((select count(*) from storage.buckets where id='receipts' and not public and file_size_limit=5242880),1,'M5 original receipts bucket remains private and capped');

-- M6: purchases, authoritative own-advance totals, change, recovery and privacy.
reset role;
insert into auth.users(id) values('00000000-0000-4000-8000-00000000000d');
insert into profiles(id,full_name,role) values('00000000-0000-4000-8000-00000000000d','M6 Other Logistics','logistics');
insert into auth.sessions(id,user_id) values('00000000-0000-4000-8000-00000000000d','00000000-0000-4000-8000-00000000000d');
set role authenticated;
select as_user('00000000-0000-0000-0000-00000000000a');
select adjust_balance(1::smallint,50000,'M6 fixture funds');
select id from create_withdrawal('advance',1::smallint,600,'M6 assigned advance',cat('Meat, chicken & offal'),'00000000-0000-0000-0000-00000000000c');
select id from create_withdrawal('advance',1::smallint,1000,'M6 change advance',cat('Meat, chicken & offal'),'00000000-0000-0000-0000-00000000000c');
select id from create_withdrawal('advance',1::smallint,1000,'M6 overspend advance',cat('Meat, chicken & offal'),'00000000-0000-0000-0000-00000000000c');
select id from create_withdrawal('advance',1::smallint,100,'M6 other advance',cat('Gas'),'00000000-0000-4000-8000-00000000000d');
select id from log_purchase(jsonb_build_object('supplier','M6 Admin purchase','category_id',cat('Meat, chicken & offal'),'advance_id',(select id from withdrawals where purpose='M6 assigned advance'),'items','[{"description":"Chicken","quantity":1.25,"unit":"kg","amount":300}]'::jsonb));
select as_user('00000000-0000-0000-0000-00000000000c');
select check_eq((select (x->>'spent')::numeric from jsonb_array_elements(list_logistics_advances())x where x->>'purpose'='M6 assigned advance'),300,'M6 own totals include Admin-logged purchases');
select check_eq((select (x->>'remaining')::numeric from jsonb_array_elements(list_logistics_advances())x where x->>'purpose'='M6 assigned advance'),300,'M6 true own remaining');
select check_eq((select count(*) from purchases where supplier='M6 Admin purchase'),0,'M6 Admin purchase details stay private to Logistics');
select check_eq((select count(*) from jsonb_array_elements(list_logistics_advances())x where x->>'purpose'='M6 other advance'),0,'M6 advance RPC excludes other staff');
select set_config('sfx.m6_purchase',jsonb_build_object('supplier','M6 Own supplier','category_id',cat('Meat, chicken & offal'),'advance_id',(select id from withdrawals where purpose='M6 assigned advance'),'items','[{"description":"Bread","quantity":2,"unit":"pack","amount":100}]'::jsonb)::text,false);
select set_config('sfx.m6_quote',quote_purchase(current_setting('sfx.m6_purchase')::jsonb)::text,false);
select check_eq((current_setting('sfx.m6_quote')::jsonb->>'amount')::numeric,100,'M6 server sums line amounts');
select check_eq((current_setting('sfx.m6_quote')::jsonb->>'remaining_after')::numeric,200,'M6 server advance preview');
select check_eq((select count(*) from purchases where supplier='M6 Own supplier'),0,'M6 quote writes no purchase');
select check_eq((select count(*) from activity_log where action='purchase.create' and details->>'supplier'='M6 Own supplier'),0,'M6 quote writes no activity');
select set_config('sfx.m6_purchase',(current_setting('sfx.m6_purchase')::jsonb||jsonb_build_object('quote_token',current_setting('sfx.m6_quote')::jsonb->>'quote_token'))::text,false);
select set_config('sfx.m6_result',run_logistics_action('purchase',current_setting('sfx.m6_purchase')::jsonb,'60000000-0000-4000-8000-000000000001')::text,false);
select check_eq((run_logistics_action('purchase',current_setting('sfx.m6_purchase')::jsonb,'60000000-0000-4000-8000-000000000001')->>'amount')::numeric,100,'M6 purchase retry returns confirmation');
select check_eq((select count(*) from purchases where supplier='M6 Own supplier'),1,'M6 retry creates one purchase');
select check_eq((select count(*) from purchase_items where purchase_id=(current_setting('sfx.m6_result')::jsonb->>'id')::uuid),1,'M6 retry creates one item line');
select expect_fail($q$select run_logistics_action('purchase',current_setting('sfx.m6_purchase')::jsonb||'{"supplier":"Different supplier"}','60000000-0000-4000-8000-000000000001')$q$,'M6 changed request payload refused');
select expect_fail($q$select run_logistics_action('purchase',current_setting('sfx.m6_purchase')::jsonb,'60000000-0000-4000-8000-000000000002')$q$,'M6 stale advance preview refused');
select expect_fail($q$select quote_purchase(current_setting('sfx.m6_purchase')::jsonb||jsonb_build_object('advance_id',(select id from withdrawals where purpose='M6 other advance')))$q$,'M6 foreign advance quote denied');
select expect_fail($q$select log_purchase(current_setting('sfx.m6_purchase')::jsonb||jsonb_build_object('advance_id',(select id from withdrawals where purpose='M6 other advance')))$q$,'M6 foreign advance write denied');
select expect_fail($q$select quote_purchase(current_setting('sfx.m6_purchase')::jsonb||'{"on_credit":true}')$q$,'M6 ambiguous funding refused');
select expect_fail($q$select quote_purchase(current_setting('sfx.m6_purchase')::jsonb||'{"supplier":" "}')$q$,'M6 supplier required');
select expect_fail($q$select quote_purchase(current_setting('sfx.m6_purchase')::jsonb||'{"category_id":null}')$q$,'M6 category required');
select expect_fail($q$select quote_purchase(current_setting('sfx.m6_purchase')::jsonb||'{"items":[]}')$q$,'M6 items required');
select expect_fail($q$select quote_purchase(current_setting('sfx.m6_purchase')::jsonb||'{"items":[{"description":"x","amount":-1}]}')$q$,'M6 negative line refused');
select expect_fail($q$select quote_purchase(current_setting('sfx.m6_purchase')::jsonb||'{"items":[{"description":"x","amount":"NaN"}]}')$q$,'M6 NaN refused');
select expect_fail($q$select quote_purchase(current_setting('sfx.m6_purchase')::jsonb||'{"items":[{"description":"x","amount":1.001}]}')$q$,'M6 sub-cent amount refused');
select expect_fail($q$select quote_purchase(current_setting('sfx.m6_purchase')::jsonb||'{"items":[{"description":"x","amount":1,"quantity":-1}]}')$q$,'M6 negative quantity refused');
select expect_fail($q$select quote_purchase(current_setting('sfx.m6_purchase')::jsonb||'{"items":[{"description":"x","amount":1,"quantity":0.0001}]}')$q$,'M6 quantity precision refused');
select expect_fail($q$select quote_purchase(current_setting('sfx.m6_purchase')::jsonb||'{"items":[{"description":"","amount":1}]}')$q$,'M6 item description required');
select expect_fail($q$select log_purchase(current_setting('sfx.m6_purchase')::jsonb||'{"receipt_path":"00000000-0000-0000-0000-00000000000b/receipt.jpg"}')$q$,'M6 other staff receipt refused');
select expect_fail($q$select log_purchase(current_setting('sfx.m6_purchase')::jsonb||jsonb_build_object('receipt_path',auth.uid()::text||'/not-uploaded.jpg'))$q$,'M6 missing upload refused');
select check_eq((select count(*) from money_requests),0,'M6 request metadata stays private');
select expect_fail($q$select m6_purchase_preview(current_setting('sfx.m6_purchase')::jsonb)$q$,'M6 helper cannot be called by client');
select expect_fail($q$select run_logistics_action('reverse','{}','60000000-0000-4000-8000-000000000010')$q$,'M6 dispatcher accepts only logistics actions');
select expect_fail($q$insert into purchases(supplier,category_id,amount,rate_to_try,amount_try,logged_by) values('Bypass',1,1,1,1,auth.uid())$q$,'M6 direct purchase writes denied');
select set_config('sfx.m6_credit',jsonb_build_object('supplier','M6 Credit supplier','category_id',cat('Packaging'),'on_credit',true,'items','[{"description":"Boxes","quantity":3,"unit":"pack","amount":75.50}]'::jsonb)::text,false);
select set_config('sfx.m6_credit_result',run_logistics_action('purchase',current_setting('sfx.m6_credit')::jsonb,'60000000-0000-4000-8000-000000000003')::text,false);
select check_eq((current_setting('sfx.m6_credit_result')::jsonb->>'amount_try')::numeric,75.5,'M6 credit purchase is TRY');
select check_eq((select count(*) from purchases where supplier='M6 Credit supplier' and receipt_path is null),1,'M6 receipt optional');
select check_eq((select count(*) from ledger_entries where purchase_id=(current_setting('sfx.m6_credit_result')::jsonb->>'id')::uuid),0,'M6 credit moves no account money');
select check_eq((select count(*) from jsonb_array_elements(list_logistics_purchases())x where x->>'supplier'='M6 Credit supplier' and x->>'due_date' is null and x->>'debt_id' is not null),1,'M6 own credit confirmation has debt and optional date');
select check_eq((select count(*) from jsonb_array_elements(list_logistics_purchases())x where x->>'supplier'='M6 Admin purchase'),0,'M6 purchase RPC hides other staff');
select as_user('00000000-0000-0000-0000-00000000000a');
select check_eq((select amount from debts where id=(current_setting('sfx.m6_credit_result')::jsonb->>'debt_id')::uuid),75.5,'M6 credit creates supplier debt');
select check_eq((select count(*) from debts where counterparty='M6 Credit supplier' and due_date is null and source='purchase_on_credit'),1,'M6 due date optional');
select check_eq((select count(*) from jsonb_array_elements(list_logistics_advances())x where x->>'purpose'='M6 other advance'),1,'M6 Admin can see all advances');
select check_eq((select count(*) from jsonb_array_elements(list_logistics_purchases())x where x->>'supplier'='M6 Own supplier'),1,'M6 Admin can see all purchases');
select as_user('00000000-0000-0000-0000-00000000000c');
select id from log_purchase(jsonb_build_object('supplier','M6 change supplies','category_id',cat('Meat, chicken & offal'),'advance_id',(select id from withdrawals where purpose='M6 change advance'),'items','[{"description":"Chicken","quantity":4,"unit":"kg","amount":900}]'::jsonb));
select set_config('sfx.m6_change',jsonb_build_object('advance_id',(select id from withdrawals where purpose='M6 change advance'),'account_id',1,'amount',100)::text,false);
select set_config('sfx.m6_change_quote',quote_return_change(current_setting('sfx.m6_change')::jsonb)::text,false);
select check_eq((current_setting('sfx.m6_change_quote')::jsonb->>'remaining_after')::numeric,0,'M6 change server preview');
select expect_fail($q$select return_change((select id from withdrawals where purpose='M6 change advance'),4::smallint,100)$q$,'M6 change requires matching currency');
select expect_fail($q$select return_change((select id from withdrawals where purpose='M6 change advance'),1::smallint,101)$q$,'M6 too much change refused');
select expect_fail($q$select return_change((select id from withdrawals where purpose='M6 change advance'),1::smallint,0.001)$q$,'M6 sub-cent change refused');
select set_config('sfx.m6_change',(current_setting('sfx.m6_change')::jsonb||jsonb_build_object('quote_token',current_setting('sfx.m6_change_quote')::jsonb->>'quote_token'))::text,false);
select run_logistics_action('change',current_setting('sfx.m6_change')::jsonb,'60000000-0000-4000-8000-000000000004');
select run_logistics_action('change',current_setting('sfx.m6_change')::jsonb,'60000000-0000-4000-8000-000000000004');
select check_eq((select count(*) from ledger_entries where withdrawal_id=(select id from withdrawals where purpose='M6 change advance') and entry_type='change_returned'),1,'M6 change retry posts once');
select check_eq((select count(*) from jsonb_array_elements(list_logistics_advances('accounted'))x where x->>'purpose'='M6 change advance' and x->>'state'='accounted'),1,'M6 1000 given 900 spent 100 returned is accounted');
select expect_fail($q$select return_change((select id from withdrawals where purpose='M6 change advance'),1::smallint,1)$q$,'M6 accounted advance cannot return again');
select expect_fail($q$select log_purchase(current_setting('sfx.m6_purchase')::jsonb||jsonb_build_object('advance_id',(select id from withdrawals where purpose='M6 change advance')))$q$,'M6 accounted advance cannot fund new purchase');
select id from log_purchase(jsonb_build_object('supplier','M6 overspend','category_id',cat('Gas'),'advance_id',(select id from withdrawals where purpose='M6 overspend advance'),'items','[{"description":"Fuel","amount":1050}]'::jsonb));
select check_eq((select (x->>'remaining')::numeric from jsonb_array_elements(list_logistics_advances())x where x->>'purpose'='M6 overspend advance'),-50,'M6 overspend remains owed to staff');
select check_eq((select count(*) from jsonb_array_elements(list_logistics_advances())x where x->>'purpose'='M6 overspend advance' and x->>'state'='owed_to_staff'),1,'M6 overspend state preserved');
select set_config('sfx.m6_direct',jsonb_build_object('supplier','M6 Direct supplier','category_id',cat('Gas'),'account_id',1,'items','[{"description":"Fuel","amount":10.25}]'::jsonb)::text,false);
select check_eq((quote_purchase(current_setting('sfx.m6_direct')::jsonb)->>'amount_try')::numeric,10.25,'M6 direct quote uses account currency');
select run_logistics_action('purchase',current_setting('sfx.m6_direct')::jsonb,'60000000-0000-4000-8000-000000000005');
select expect_fail($q$select quote_purchase(current_setting('sfx.m6_direct')::jsonb||'{"items":[{"description":"Fuel","amount":99999999}]}')$q$,'M6 direct overdraw refused');
select as_user('00000000-0000-0000-0000-00000000000a');
select check_eq((select amount from ledger_entries where purchase_id=(select id from purchases where supplier='M6 Direct supplier')),-10.25,'M6 direct purchase debits own-currency ledger');
select check_eq((select count(*) from v_expenses where description in ('M6 Direct supplier','M6 Credit supplier','M6 Own supplier')),3,'M6 each funding type counts as expense');
select check_eq((select count(*) from activity_log where action='purchase.create' and details->>'supplier'='M6 Own supplier'),1,'M6 retry audits once');
select as_user('00000000-0000-0000-0000-00000000000b');
select expect_fail($q$select quote_purchase('{}')$q$,'M6 Operations cannot quote purchase');
select expect_fail($q$select run_logistics_action('purchase','{}','60000000-0000-4000-8000-000000000006')$q$,'M6 Operations cannot write purchase');
select expect_fail($q$select list_logistics_advances()$q$,'M6 Operations cannot open Logistics advances');
select expect_fail($q$select quote_return_change('{}')$q$,'M6 Operations cannot return change');
set role anon;
select expect_fail($q$select quote_purchase('{}')$q$,'M6 anon denied purchase preview');
select expect_fail($q$select list_logistics_purchases()$q$,'M6 anon denied purchase list');
reset role;
