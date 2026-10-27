-- =====================================================================
-- SFx Burger OMS — starting data. Run after schema.sql.
-- Menu and prices come from the printed SFx Burger menu; cost categories and the
-- dollar rate come from the costing sheet's Weekly P&L tab (12 Oct 2026).
-- =====================================================================

-- Payment accounts. SFx, RedotPay and Crypto hold US dollars.
insert into accounts (name, currency, is_cash, sort_order) values
  ('Cash',     'TRY', true,  1),
  ('İşbank',   'TRY', false, 2),
  ('Koop',     'TRY', false, 3),
  ('SFx',      'USD', false, 4),
  ('RedotPay', 'USD', false, 5),
  ('Crypto',   'USD', false, 6),
  ('Naira',    'NGN', false, 7);

-- Withdrawals and debt payments above ₺2,000 by Operations wait for Admin.
-- Change any time: update settings set withdrawal_approval_limit_try = <amount>;
update settings set withdrawal_approval_limit_try = 2000;

-- Expense categories, split the same way as the Weekly P&L tab:
--   cogs        = ingredients + packaging
--   operational = electricity, water, gas, transport, cleaning, payroll
--   fixed       = rent and other weekly overheads
insert into expense_categories (name, kind, sort_order) values
  ('Meat, chicken & offal',        'cogs',  1),   -- chicken, liver, shaki and ponmo, sausages
  ('Rice, flour & grains',         'cogs',  2),
  ('Vegetables & peppers',         'cogs',  3),   -- peppers, onions, spinach, cabbage, carrots
  ('Oils, spices & seasoning',     'cogs',  4),   -- oil, palm oil, curry, thyme, Maggi, crayfish
  ('Sauces & dairy',               'cogs',  5),   -- mayonnaise, ketchup, milk, eggs
  ('Bread & wraps',                'cogs',  6),   -- burger bread, shawarma bread
  ('Drinks',                       'cogs',  7),
  ('Packaging',                    'cogs',  8),
  ('Electricity',                  'operational', 20),
  ('Water',                        'operational', 21),
  ('Gas',                          'operational', 22),
  ('Transport — market runs',      'operational', 23),
  ('Transport — deliveries',       'operational', 24),
  ('Cleaning supplies',            'operational', 25),
  ('Rent',                         'fixed', 40),
  ('Payroll',                      'operational', 41),
  ('Marketing & promotions',       'fixed', 42),
  ('Phone & internet',             'fixed', 43),
  ('Equipment maintenance',        'fixed', 44),
  ('Licences & permits',           'fixed', 45),
  ('Bank & payment fees',          'fixed', 46),
  ('Miscellaneous',                'fixed', 47);

-- Menu categories, products and extras, from the printed SFx Burger menu (Oct 2026).
insert into product_categories (name, sort_order) values
  ('Rice & Soup', 1), ('Burgers', 2), ('Shawarma', 3);

with menu (category, name, price, ord) as (values
  ('Rice & Soup', 'Native Rice + Chicken',  450, 1),
  ('Rice & Soup', 'Jollof Rice + Chicken',  420, 2),
  ('Rice & Soup', 'Vegetable Soup',         350, 3),
  ('Burgers',     'Classic Burger',         400, 1),
  ('Burgers',     'BBQ Burger',             400, 2),
  ('Burgers',     'Zinger Burger',          400, 3),
  ('Burgers',     'Chips',                   50, 4),
  ('Shawarma',    'Classic Shawarma',       370, 1),
  ('Shawarma',    'Suya Shawarma',          400, 2),
  ('Shawarma',    'Congolese Shawarma',     400, 3)
), p as (
  insert into products (category_id, name)
  select c.id, m.name from menu m join product_categories c on c.name = m.category
  returning id, name
)
insert into product_variants (product_id, name, price, sort_order)
select p.id, 'Regular', m.price, m.ord from p join menu m on m.name = p.name;

-- Extras: added to a rice or soup plate (Vegetable Soup + Swallow + Fish = ₺580)
-- or sold on their own from the Extras tab. One price for both; changing one changes the other.
insert into addons (name, price) values
  ('Fish', 180), ('Turkey', 300), ('Chicken', 150), ('Shaki', 70), ('Ponmo', 70),
  ('Salad', 70), ('Egg', 50), ('Swallow', 50);

insert into product_addons (product_id, addon_id)
select p.id, a.id
from products p join product_categories c on c.id = p.category_id, addons a
where c.name = 'Rice & Soup';

insert into product_categories (name, sort_order) values ('Extras', 4);

with x as (
  insert into products (category_id, name, addon_id)
  select (select id from product_categories where name = 'Extras'), a.name, a.id from addons a
  returning id, addon_id
)
insert into product_variants (product_id, name, price, sort_order)
select x.id, 'Regular', a.price, row_number() over (order by a.price desc)
from x join addons a on a.id = x.addon_id;

-- Starting exchange rate from the Weekly P&L tab (47.90 TL per $).
-- The Naira rate is not in the sheet: Admin sets it in the app before the first Naira payment.
-- (Runs as the database owner, so set_by is left empty.)
insert into fx_rates (currency, rate_to_try) values ('USD', 47.90);

-- First Admin: sign the user up in Supabase Auth, then:
-- insert into profiles (id, full_name, role) values ('<auth user uuid>', 'Peter Japhet', 'admin');
--
-- Go-live, as Admin in the app (or SQL): opening balance per account, then each outstanding debt.
--   select adjust_balance(1::smallint, 2450, 'Opening balance at go-live', true);          -- Cash, ₺
--   select adjust_balance(4::smallint, 85, 'Opening balance at go-live', true);            -- SFx, $
--   select record_debt('we_owe', 'Metro Market', 'Unpaid supplies before go-live', 4200, 'TRY', '2026-10-20', true);
--   select record_debt('owed_to_us', 'EMU staff office', 'Event catering balance', 1850, 'TRY', null, true);
