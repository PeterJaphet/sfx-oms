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
select kind, amount, status from create_withdrawal('advance', 1::smallint, 1000, 'Buy chicken and burger bread', null, '00000000-0000-0000-0000-00000000000c');
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
