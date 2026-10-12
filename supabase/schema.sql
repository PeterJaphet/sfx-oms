-- =====================================================================
-- SFx Burger OMS — database schema (Supabase / PostgreSQL 15+)
-- Run once in the Supabase SQL editor, then run seed.sql and storage.sql.
--
-- Design rules (see PRD):
--   * Money moves only through ledger_entries; balances are computed.
--   * Nothing is deleted. Ledger rows are immutable; mistakes are reversed.
--   * All writes that touch money or orders go through SECURITY DEFINER
--     functions (RPC) that check the caller's role. Tables are read-only
--     to the app except products/menu (Operations + Admin) and settings.
--   * Reports are in TRY. Every ledger row stores amount in the account's
--     currency plus amount_try and the rate used.
--   * Business day runs 06:00–05:59 Europe/Nicosia.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
create type user_role       as enum ('operations', 'logistics', 'admin');
create type order_channel   as enum ('walk_in', 'whatsapp', 'instagram', 'phone', 'delivery_app', 'event');
create type order_type      as enum ('pickup', 'delivery', 'dine_in');
create type order_status    as enum ('new', 'preparing', 'ready', 'picked_up', 'completed', 'cancelled');
-- Matches the costing sheet: COGS = ingredients + packaging; operational = electricity,
-- water, gas, transport, cleaning; fixed = rent, payroll, marketing, phone, licences...
create type expense_kind    as enum ('cogs', 'operational', 'fixed');
create type debt_direction  as enum ('we_owe', 'owed_to_us');
create type withdrawal_kind as enum ('advance', 'direct_expense');
create type withdrawal_status as enum ('pending_approval', 'approved', 'rejected', 'reversed');
create type entry_type as enum (
  'order_payment',     -- in:  customer pays an order
  'refund',            -- out: money back to a customer
  'advance',           -- out: cash handed to staff to buy supplies (not an expense)
  'advance_topup',     -- out: staff reimbursed when purchases exceeded the advance
  'direct_expense',    -- out: gas, transport, wages... (expense)
  'purchase_direct',   -- out: supplies paid straight from an account (expense)
  'change_returned',   -- in:  unspent advance returned
  'transfer_out',      -- out: moved to another account
  'transfer_in',       -- in:  received from another account
  'opening_balance',   -- in/out: starting balance (admin)
  'adjustment',        -- in/out: correction with reason (admin)
  'reversal',          -- in/out: cancels another entry (admin)
  'debt_out',          -- out: we pay a debt we owe, or lend money
  'debt_in'            -- in:  someone pays what they owe us, or we borrow money
);

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------
-- Business date: a sale at 01:30 belongs to the previous day.
create or replace function business_date(ts timestamptz default now())
returns date language sql stable as $$
  select ((ts at time zone 'Europe/Nicosia') - interval '6 hours')::date;
$$;

-- ---------------------------------------------------------------------
-- People and settings
-- ---------------------------------------------------------------------
create table profiles (
  id          uuid primary key references auth.users(id) on delete restrict,
  full_name   text not null,
  phone       text,
  role        user_role not null default 'operations',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create or replace function app_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid() and is_active;
$$;

create or replace function require_role(variadic allowed user_role[]) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare r user_role;
begin
  r := app_role();
  if r is null or not (r = any(allowed)) then
    raise exception 'Not allowed for your role' using errcode = '42501';
  end if;
  return auth.uid();
end $$;

create table settings (
  id                              boolean primary key default true check (id), -- single row
  withdrawal_approval_limit_try   numeric(12,2),        -- null = no approval needed
  advance_max_age_days            int not null default 3,
  updated_at                      timestamptz not null default now()
);
insert into settings default values;

-- ---------------------------------------------------------------------
-- Accounts and exchange rates
-- ---------------------------------------------------------------------
create table accounts (
  id          smallint generated always as identity primary key,
  name        text not null unique,
  currency    text not null check (currency ~ '^[A-Z]{3,4}$'), -- TRY, USD, NGN, USDT
  is_cash     boolean not null default false,                  -- counted at daily close
  is_active   boolean not null default true,
  sort_order  int not null default 0
);

create table fx_rates (
  id              bigint generated always as identity primary key,
  currency        text not null,
  rate_to_try     numeric(18,6) not null check (rate_to_try > 0), -- 1 unit = x TRY
  effective_date  date not null default business_date(),
  set_by          uuid references profiles(id),
  created_at      timestamptz not null default now(),
  unique (currency, effective_date)
);

-- ---------------------------------------------------------------------
-- Menu
-- ---------------------------------------------------------------------
create table product_categories (
  id          smallint generated always as identity primary key,
  name        text not null unique,
  sort_order  int not null default 0,
  is_active   boolean not null default true
);

create table products (
  id           uuid primary key default gen_random_uuid(),
  category_id  smallint not null references product_categories(id),
  name         text not null,
  description  text,
  photo_path   text,
  is_active    boolean not null default true,
  created_by   uuid references profiles(id) default auth.uid(),
  created_at   timestamptz not null default now(),
  unique (category_id, name)
);

-- Every product has at least one variant ("Regular"); price lives here.
create table product_variants (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references products(id),
  name        text not null default 'Regular',
  price       numeric(12,2) not null check (price >= 0),
  is_active   boolean not null default true,
  sort_order  int not null default 0,
  unique (product_id, name)
);

create table addons (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  price      numeric(12,2) not null check (price >= 0),
  is_active  boolean not null default true
);

-- An extra can also be sold on its own: its standalone menu item points back to it,
-- so both share one price and one sales count.
alter table products add column addon_id uuid unique references addons(id);

create table product_addons (
  product_id  uuid references products(id),
  addon_id    uuid references addons(id),
  primary key (product_id, addon_id)
);

create table price_history (
  id          bigint generated always as identity primary key,
  variant_id  uuid references product_variants(id),
  addon_id    uuid references addons(id),
  old_price   numeric(12,2),
  new_price   numeric(12,2) not null,
  changed_by  uuid references profiles(id),
  changed_at  timestamptz not null default now(),
  check ((variant_id is null) <> (addon_id is null))
);

create or replace function trg_price_history() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.price is distinct from old.price then
    insert into price_history (variant_id, addon_id, old_price, new_price, changed_by)
    values (
      case when tg_table_name = 'product_variants' then new.id end,
      case when tg_table_name = 'addons' then new.id end,
      case when tg_op = 'UPDATE' then old.price end,
      new.price, auth.uid());
  end if;
  return new;
end $$;
-- Keep an extra's price identical whether sold on a plate or on its own.
create or replace function trg_sync_extra_price() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() > 1 then return new; end if;   -- the other side's update, stop here
  if tg_table_name = 'addons' then
    update product_variants pv set price = new.price
      from products p where p.id = pv.product_id and p.addon_id = new.id and pv.price <> new.price;
  else
    update addons a set price = new.price
      from products p where p.id = new.product_id and a.id = p.addon_id and a.price <> new.price;
  end if;
  return new;
end $$;
create trigger sync_extra_price after update of price on addons
  for each row execute function trg_sync_extra_price();
create trigger sync_extra_price after update of price on product_variants
  for each row execute function trg_sync_extra_price();

create trigger price_history_variants after insert or update of price on product_variants
  for each row execute function trg_price_history();
create trigger price_history_addons after insert or update of price on addons
  for each row execute function trg_price_history();

-- No deletes on menu: deactivate instead.
create or replace function trg_no_delete() returns trigger language plpgsql as $$
begin
  raise exception '% rows cannot be deleted; deactivate or reverse instead', tg_table_name;
end $$;
create trigger no_delete before delete on products         for each row execute function trg_no_delete();
create trigger no_delete before delete on product_variants for each row execute function trg_no_delete();
create trigger no_delete before delete on addons           for each row execute function trg_no_delete();

-- ---------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------
create table orders (
  id               uuid primary key default gen_random_uuid(),
  business_date    date not null default business_date(),
  daily_number     int not null,
  channel          order_channel not null,
  order_type       order_type not null default 'pickup',
  status           order_status not null default 'new',
  customer_name    text,
  customer_phone   text,
  delivery_address text,
  note             text,
  subtotal         numeric(12,2) not null default 0,
  discount_amount  numeric(12,2) not null default 0 check (discount_amount >= 0),
  discount_reason  text,
  total            numeric(12,2) not null default 0 check (total >= 0),
  created_by       uuid not null references profiles(id),
  created_at       timestamptz not null default now(),
  preparing_at     timestamptz,
  ready_at         timestamptz,
  picked_up_at     timestamptz,
  picked_up_by     uuid references profiles(id),
  completed_at     timestamptz,
  cancelled_at     timestamptz,
  cancelled_by     uuid references profiles(id),
  cancel_reason    text,
  unique (business_date, daily_number),
  check (discount_amount = 0 or discount_reason is not null),
  check (order_type <> 'delivery' or delivery_address is not null)
);
create index orders_status_idx on orders (status) where status not in ('completed', 'cancelled');

create table order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references orders(id),
  variant_id    uuid not null references product_variants(id),
  product_id    uuid not null references products(id),
  product_name  text not null,   -- snapshot at time of sale
  variant_name  text not null,   -- snapshot
  category_name text not null,   -- snapshot
  unit_price    numeric(12,2) not null,  -- variant price + add-ons, snapshot
  quantity      int not null check (quantity > 0),
  line_total    numeric(12,2) generated always as (unit_price * quantity) stored,
  addons        jsonb not null default '[]',  -- [{addon_id,name,price}]
  note          text
);
create index order_items_order_idx on order_items (order_id);

-- ---------------------------------------------------------------------
-- Expenses: categories, withdrawals, purchases
-- ---------------------------------------------------------------------
create table expense_categories (
  id          smallint generated always as identity primary key,
  name        text not null unique,
  kind        expense_kind not null,       -- cogs, operational or fixed (see enum)
  sort_order  int not null default 0,
  is_active   boolean not null default true
);

create table withdrawals (
  id             uuid primary key default gen_random_uuid(),
  kind           withdrawal_kind not null,
  account_id     smallint not null references accounts(id),
  amount         numeric(14,2) not null check (amount > 0),      -- account currency
  rate_to_try    numeric(18,6) not null check (rate_to_try > 0),
  amount_try     numeric(14,2) not null,
  purpose        text not null check (length(trim(purpose)) >= 3), -- the "indication"
  category_id    smallint references expense_categories(id),     -- required for direct_expense
  recipient_id   uuid references profiles(id),                   -- required for advance
  receipt_path   text,
  status         withdrawal_status not null,
  business_date  date not null default business_date(),
  requested_by   uuid not null references profiles(id),
  requested_at   timestamptz not null default now(),
  decided_by     uuid references profiles(id),
  decided_at     timestamptz,
  decision_note  text,
  check (kind <> 'direct_expense' or category_id is not null),
  check (kind <> 'advance' or recipient_id is not null)
);

-- Debts: what we owe (suppliers, loans, staff) and what is owed to us.
-- Opening debts are recorded once at go-live; new ones come from supplies
-- bought on credit or money borrowed or lent. Paying or collecting a debt
-- moves money but is never revenue or an expense.
create table debts (
  id             uuid primary key default gen_random_uuid(),
  direction      debt_direction not null,
  counterparty   text not null,                    -- supplier, lender, customer, staff member
  description    text not null,
  currency       text not null check (currency ~ '^[A-Z]{3,4}$'),
  amount         numeric(14,2) not null check (amount > 0),   -- in the debt's currency
  due_date       date,
  is_opening     boolean not null default false,  -- existed before go-live
  source         text not null default 'manual' check (source in ('opening', 'manual', 'purchase_on_credit', 'loan')),
  created_by     uuid not null references profiles(id),
  created_at     timestamptz not null default now(),
  business_date  date not null default business_date(),
  is_cancelled   boolean not null default false,
  cancel_reason  text
);

create table purchases (
  id             uuid primary key default gen_random_uuid(),
  supplier       text not null,
  category_id    smallint not null references expense_categories(id),
  advance_id     uuid references withdrawals(id),   -- funded from an advance,
  account_id     smallint references accounts(id),  -- straight from an account,
  debt_id        uuid references debts(id),         -- or bought on credit (supplier is owed)
  amount         numeric(14,2) not null check (amount > 0),  -- in funding currency
  rate_to_try    numeric(18,6) not null check (rate_to_try > 0),
  amount_try     numeric(14,2) not null,
  receipt_path   text,
  note           text,
  business_date  date not null default business_date(),
  logged_by      uuid not null references profiles(id),
  logged_at      timestamptz not null default now(),
  is_reversed    boolean not null default false,
  check (num_nonnulls(advance_id, account_id, debt_id) = 1)
);

create table purchase_items (
  id           bigint generated always as identity primary key,
  purchase_id  uuid not null references purchases(id),
  description  text not null,
  quantity     numeric(12,3),
  unit         text,          -- kg, pcs, pack, L
  amount       numeric(14,2) not null check (amount >= 0)
);

-- ---------------------------------------------------------------------
-- Ledger (the single source of truth for balances)
-- ---------------------------------------------------------------------
create table account_transfers (
  id           uuid primary key default gen_random_uuid(),
  from_account smallint not null references accounts(id),
  to_account   smallint not null references accounts(id),
  note         text,
  created_by   uuid not null references profiles(id),
  created_at   timestamptz not null default now(),
  check (from_account <> to_account)
);

create table ledger_entries (
  id             bigint generated always as identity primary key,
  account_id     smallint not null references accounts(id),
  entry_type     entry_type not null,
  amount         numeric(14,2) not null check (amount <> 0), -- signed, account currency (+ in, − out)
  rate_to_try    numeric(18,6) not null check (rate_to_try > 0),
  amount_try     numeric(14,2) not null,                     -- signed TRY value
  business_date  date not null default business_date(),
  order_id       uuid references orders(id),
  withdrawal_id  uuid references withdrawals(id),
  purchase_id    uuid references purchases(id),
  transfer_id    uuid references account_transfers(id),
  reverses_id    bigint references ledger_entries(id),
  debt_id        uuid references debts(id),
  note           text,
  created_by     uuid not null references profiles(id),
  created_at     timestamptz not null default now()
);
create table debt_settlements (
  id               bigint generated always as identity primary key,
  debt_id          uuid not null references debts(id),
  ledger_entry_id  bigint not null unique references ledger_entries(id),
  covers           numeric(14,2) not null check (covers > 0)   -- in the debt's currency
);

create index ledger_account_idx on ledger_entries (account_id, business_date);
create index ledger_order_idx   on ledger_entries (order_id) where order_id is not null;
create index ledger_wd_idx      on ledger_entries (withdrawal_id) where withdrawal_id is not null;
create unique index ledger_one_reversal on ledger_entries (reverses_id) where reverses_id is not null;

create or replace function trg_ledger_immutable() returns trigger language plpgsql as $$
begin
  raise exception 'Ledger entries are permanent; post a reversal instead';
end $$;
create trigger ledger_immutable before update or delete on ledger_entries
  for each row execute function trg_ledger_immutable();
create trigger no_delete before delete on orders      for each row execute function trg_no_delete();
create trigger no_delete before delete on order_items for each row execute function trg_no_delete();
create trigger no_delete before delete on withdrawals for each row execute function trg_no_delete();
create trigger no_delete before delete on purchases   for each row execute function trg_no_delete();
create trigger no_delete before delete on debts       for each row execute function trg_no_delete();

-- ---------------------------------------------------------------------
-- Daily close and activity log
-- ---------------------------------------------------------------------
create table day_closes (
  id                bigint generated always as identity primary key,
  business_date     date not null,
  account_id        smallint not null references accounts(id),
  expected_amount   numeric(14,2) not null,
  counted_amount    numeric(14,2) not null,
  difference        numeric(14,2) generated always as (counted_amount - expected_amount) stored,
  unpaid_orders     int not null,
  open_advances     int not null,
  note              text,
  closed_by         uuid not null references profiles(id),
  closed_at         timestamptz not null default now(),
  superseded        boolean not null default false     -- admin re-close keeps history
);
create unique index day_close_current on day_closes (business_date, account_id) where not superseded;

create table activity_log (
  id          bigint generated always as identity primary key,
  actor_id    uuid default auth.uid(),
  action      text not null,         -- e.g. order.create, withdrawal.approve, product.update
  entity      text not null,
  entity_id   text,
  details     jsonb,
  at          timestamptz not null default now()
);
create index activity_log_at_idx on activity_log (at desc);

create or replace function log_activity(p_action text, p_entity text, p_id text, p_details jsonb default null)
returns void language sql security definer set search_path = public as $$
  insert into activity_log (action, entity, entity_id, details) values (p_action, p_entity, p_id, p_details);
$$;

-- Menu edits come straight from the client, so log them with a trigger.
create or replace function trg_log_menu() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform log_activity(lower(tg_table_name) || '.' || lower(tg_op), tg_table_name, new.id::text,
    case when tg_op = 'UPDATE' then jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new))
         else to_jsonb(new) end);
  return new;
end $$;
create trigger log_menu after insert or update on products         for each row execute function trg_log_menu();
create trigger log_menu after insert or update on product_variants for each row execute function trg_log_menu();
create trigger log_menu after insert or update on addons           for each row execute function trg_log_menu();

-- =====================================================================
-- Internal helpers for money
-- =====================================================================
create or replace function account_balance(p_account smallint) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(amount), 0) from ledger_entries where account_id = p_account;
$$;

-- Resolve a TRY rate for an account: TRY accounts = 1; otherwise the
-- caller-supplied rate, else today's (or latest) default rate.
create or replace function resolve_rate(p_account smallint, p_rate numeric) returns numeric
language plpgsql stable security definer set search_path = public as $$
declare cur text; r numeric;
begin
  select currency into cur from accounts where id = p_account and is_active;
  if cur is null then raise exception 'Unknown or inactive account %', p_account; end if;
  if cur = 'TRY' then return 1; end if;
  if p_rate is not null and p_rate > 0 then return p_rate; end if;
  select rate_to_try into r from fx_rates where currency = cur order by effective_date desc, id desc limit 1;
  if r is null then raise exception 'No exchange rate for %; set one first', cur; end if;
  return r;
end $$;

create or replace function post_entry(
  p_account smallint, p_type entry_type, p_amount numeric, p_rate numeric,
  p_order uuid default null, p_withdrawal uuid default null, p_purchase uuid default null,
  p_transfer uuid default null, p_reverses bigint default null, p_note text default null,
  p_amount_try numeric default null, p_debt uuid default null
) returns bigint language plpgsql security definer set search_path = public as $$
declare new_id bigint;
begin
  insert into ledger_entries (account_id, entry_type, amount, rate_to_try, amount_try,
    order_id, withdrawal_id, purchase_id, transfer_id, reverses_id, debt_id, note, created_by)
  values (p_account, p_type, round(p_amount, 2), p_rate,
    coalesce(p_amount_try, round(p_amount * p_rate, 2)),
    p_order, p_withdrawal, p_purchase, p_transfer, p_reverses, p_debt, p_note, auth.uid())
  returning id into new_id;
  return new_id;
end $$;

-- =====================================================================
-- RPC: orders
-- =====================================================================
-- p_order = {
--   "channel":"walk_in", "order_type":"pickup", "customer_name":..., "customer_phone":...,
--   "delivery_address":..., "note":..., "discount_amount":0, "discount_reason":null,
--   "items":[{"variant_id":"…","quantity":2,"addon_ids":["…"],"note":"no onions"}],
--   "payments":[{"account_id":1,"amount_try":250},                    -- TRY account
--               {"account_id":7,"amount_try":250,"amount":7500}]       -- non-TRY: amount in its currency
-- }
-- Prices always come from the database, never from the client.
create or replace function create_order(p_order jsonb) returns orders
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := require_role('operations', 'admin');
  o orders;
  it jsonb;
  v record;
  addon_list jsonb;
  addon_sum numeric;
  sub numeric := 0;
  num int;
  bdate date := business_date();
begin
  if jsonb_array_length(coalesce(p_order->'items', '[]')) = 0 then
    raise exception 'An order needs at least one item';
  end if;

  perform pg_advisory_xact_lock(hashtext('order-number-' || bdate));
  select coalesce(max(daily_number), 0) + 1 into num from orders where business_date = bdate;

  insert into orders (business_date, daily_number, channel, order_type, customer_name, customer_phone,
                      delivery_address, note, discount_amount, discount_reason, created_by)
  values (bdate, num, (p_order->>'channel')::order_channel,
          coalesce((p_order->>'order_type')::order_type, 'pickup'),
          nullif(p_order->>'customer_name', ''), nullif(p_order->>'customer_phone', ''),
          nullif(p_order->>'delivery_address', ''), nullif(p_order->>'note', ''),
          coalesce((p_order->>'discount_amount')::numeric, 0), nullif(p_order->>'discount_reason', ''), uid)
  returning * into o;

  for it in select * from jsonb_array_elements(p_order->'items') loop
    select pv.id, pv.name as variant_name, pv.price, p.id as product_id, p.name as product_name,
           pc.name as category_name
      into v
      from product_variants pv join products p on p.id = pv.product_id
      join product_categories pc on pc.id = p.category_id
     where pv.id = (it->>'variant_id')::uuid and pv.is_active and p.is_active;
    if v.id is null then raise exception 'Item is not on the active menu: %', it->>'variant_id'; end if;

    -- Only extras set up for this product (product_addons) are allowed.
    if exists (select 1 from jsonb_array_elements_text(coalesce(it->'addon_ids', '[]')) x
                where not exists (select 1 from product_addons pa join addons a on a.id = pa.addon_id
                                   where pa.product_id = v.product_id and pa.addon_id = x::uuid and a.is_active)) then
      raise exception 'An extra is not available on %', v.product_name;
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('addon_id', a.id, 'name', a.name, 'price', a.price)), '[]'),
           coalesce(sum(a.price), 0)
      into addon_list, addon_sum
      from addons a
     where a.is_active and a.id in (select jsonb_array_elements_text(coalesce(it->'addon_ids', '[]'))::uuid);

    insert into order_items (order_id, variant_id, product_id, product_name, variant_name, category_name,
                             unit_price, quantity, addons, note)
    values (o.id, v.id, v.product_id, v.product_name, v.variant_name, v.category_name,
            v.price + addon_sum, coalesce((it->>'quantity')::int, 1), addon_list, nullif(it->>'note', ''));
    sub := sub + (v.price + addon_sum) * coalesce((it->>'quantity')::int, 1);
  end loop;

  if o.discount_amount > sub then raise exception 'Discount is larger than the order'; end if;
  update orders set subtotal = sub, total = sub - discount_amount where id = o.id returning * into o;

  if p_order ? 'payments' then
    for it in select * from jsonb_array_elements(p_order->'payments') loop
      perform add_order_payment(o.id, (it->>'account_id')::smallint, (it->>'amount_try')::numeric,
                                (it->>'amount')::numeric);
    end loop;
  end if;

  perform log_activity('order.create', 'orders', o.id::text,
    jsonb_build_object('number', o.daily_number, 'total', o.total));
  return o;
end $$;

-- Record a payment against an order. amount_try = the part of the bill it covers;
-- p_amount = what was received in the account's own currency (required for non-TRY).
create or replace function add_order_payment(p_order uuid, p_account smallint, p_amount_try numeric,
                                             p_amount numeric default null) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := require_role('operations', 'admin');
  o orders; cur text; paid numeric; amt numeric; rate numeric;
begin
  select * into o from orders where id = p_order for update;
  if o.id is null then raise exception 'Order not found'; end if;
  if o.status = 'cancelled' then raise exception 'Order is cancelled'; end if;
  if p_amount_try is null or p_amount_try <= 0 then raise exception 'Payment must be more than 0'; end if;

  select coalesce(sum(amount_try), 0) into paid from ledger_entries where order_id = p_order;
  if paid + p_amount_try > o.total + 0.005 then
    raise exception 'Payment of % exceeds the % still due', p_amount_try, o.total - paid;
  end if;

  select currency into cur from accounts where id = p_account and is_active;
  if cur is null then raise exception 'Unknown account'; end if;
  if cur = 'TRY' then
    amt := p_amount_try; rate := 1;
  else
    if p_amount is null or p_amount <= 0 then
      raise exception 'Enter the amount received in %', cur;
    end if;
    amt := p_amount; rate := round(p_amount_try / p_amount, 6);
  end if;

  return post_entry(p_account, 'order_payment', amt, rate, p_order => p_order, p_amount_try => p_amount_try);
end $$;

-- Status changes. Operations: new→preparing→ready→completed (pickup/dine-in).
-- Logistics: ready→picked_up→completed (delivery). Admin: any forward move.
create or replace function set_order_status(p_order uuid, p_status order_status) returns orders
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := require_role('operations', 'logistics', 'admin');
  r user_role := app_role();
  o orders;
  allowed boolean;
begin
  select * into o from orders where id = p_order for update;
  if o.id is null then raise exception 'Order not found'; end if;
  if p_status = 'cancelled' then raise exception 'Use cancel_order to cancel'; end if;
  if o.status in ('completed', 'cancelled') then raise exception 'Order is already %', o.status; end if;

  allowed := case
    when r = 'admin' then p_status > o.status
    when r = 'operations' then (o.status, p_status) in
         (('new','preparing'), ('preparing','ready'), ('new','ready'), ('ready','completed'))
         and not (p_status = 'completed' and o.order_type = 'delivery')
    when r = 'logistics' then o.order_type = 'delivery' and (o.status, p_status) in
         (('ready','picked_up'), ('picked_up','completed'))
  end;
  if not allowed then raise exception 'Cannot move order from % to % with your role', o.status, p_status; end if;

  update orders set status = p_status,
    preparing_at = case when p_status = 'preparing' then now() else preparing_at end,
    ready_at     = case when p_status = 'ready'     then now() else ready_at end,
    picked_up_at = case when p_status = 'picked_up' then now() else picked_up_at end,
    picked_up_by = case when p_status = 'picked_up' then uid   else picked_up_by end,
    completed_at = case when p_status = 'completed' then now() else completed_at end
  where id = p_order returning * into o;
  perform log_activity('order.status', 'orders', o.id::text, jsonb_build_object('status', p_status));
  return o;
end $$;

-- Cancel. Operations: only orders with no payments. Admin: any; payments are refunded.
create or replace function cancel_order(p_order uuid, p_reason text) returns orders
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := require_role('operations', 'admin');
  o orders; paid numeric; e record;
begin
  if coalesce(length(trim(p_reason)), 0) < 3 then raise exception 'A reason is required'; end if;
  select * into o from orders where id = p_order for update;
  if o.id is null then raise exception 'Order not found'; end if;
  if o.status in ('completed', 'cancelled') and app_role() <> 'admin' then
    raise exception 'Only Admin can void a completed order';
  end if;
  if o.status = 'cancelled' then raise exception 'Order is already cancelled'; end if;

  select coalesce(sum(amount_try), 0) into paid from ledger_entries where order_id = p_order;
  if paid <> 0 then
    if app_role() <> 'admin' then raise exception 'Order has payments; ask Admin to void and refund'; end if;
    for e in select account_id, sum(amount) amt, sum(amount_try) amt_try
               from ledger_entries where order_id = p_order group by account_id
               having sum(amount) <> 0 loop
      perform post_entry(e.account_id, 'refund', -e.amt, abs(e.amt_try / e.amt),
                         p_order => p_order, p_note => 'Void: ' || p_reason, p_amount_try => -e.amt_try);
    end loop;
  end if;

  update orders set status = 'cancelled', cancelled_at = now(), cancelled_by = uid, cancel_reason = p_reason
   where id = p_order returning * into o;
  perform log_activity('order.cancel', 'orders', o.id::text, jsonb_build_object('reason', p_reason, 'refunded_try', paid));
  return o;
end $$;

-- =====================================================================
-- RPC: money out
-- =====================================================================
-- Withdraw money for operations. Advances go to a staff member who later
-- logs purchases and returns change. Direct expenses are expenses at once.
create or replace function create_withdrawal(
  p_kind withdrawal_kind, p_account smallint, p_amount numeric, p_purpose text,
  p_category smallint default null, p_recipient uuid default null,
  p_rate numeric default null, p_receipt_path text default null
) returns withdrawals
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := require_role('operations', 'admin');
  s settings; w withdrawals; rate numeric; needs_approval boolean;
begin
  select * into s from settings;
  rate := resolve_rate(p_account, p_rate);

  if p_kind = 'advance' then
    if p_recipient is null then raise exception 'Choose who receives the advance'; end if;
    if app_role() <> 'admin' and exists (
        select 1 from v_advances a where a.recipient_id = p_recipient and a.state = 'open'
           and a.business_date < business_date() - s.advance_max_age_days) then
      raise exception 'This person has an advance older than % days that is not yet accounted for',
        s.advance_max_age_days;
    end if;
  end if;

  needs_approval := app_role() <> 'admin'
    and s.withdrawal_approval_limit_try is not null
    and round(p_amount * rate, 2) > s.withdrawal_approval_limit_try;

  if account_balance(p_account) < p_amount then
    raise exception 'Not enough money in this account (balance %)', account_balance(p_account);
  end if;

  insert into withdrawals (kind, account_id, amount, rate_to_try, amount_try, purpose, category_id,
                           recipient_id, receipt_path, status, requested_by, decided_by, decided_at)
  values (p_kind, p_account, p_amount, rate, round(p_amount * rate, 2), trim(p_purpose), p_category,
          p_recipient, p_receipt_path,
          case when needs_approval then 'pending_approval' else 'approved' end::withdrawal_status,
          uid, case when needs_approval then null else uid end,
          case when needs_approval then null else now() end)
  returning * into w;

  if not needs_approval then
    perform post_entry(p_account, p_kind::text::entry_type, -p_amount, rate, p_withdrawal => w.id,
                       p_note => w.purpose);
  end if;
  perform log_activity('withdrawal.create', 'withdrawals', w.id::text,
    jsonb_build_object('kind', p_kind, 'amount', p_amount, 'status', w.status, 'purpose', w.purpose));
  return w;
end $$;

create or replace function decide_withdrawal(p_withdrawal uuid, p_approve boolean, p_note text default null)
returns withdrawals language plpgsql security definer set search_path = public as $$
declare uid uuid := require_role('admin'); w withdrawals;
begin
  select * into w from withdrawals where id = p_withdrawal for update;
  if w.status <> 'pending_approval' then raise exception 'Withdrawal is already %', w.status; end if;
  if p_approve and account_balance(w.account_id) < w.amount then
    raise exception 'Not enough money in this account';
  end if;
  update withdrawals set status = case when p_approve then 'approved' else 'rejected' end::withdrawal_status,
         decided_by = uid, decided_at = now(), decision_note = p_note
   where id = p_withdrawal returning * into w;
  if p_approve then
    perform post_entry(w.account_id, w.kind::text::entry_type, -w.amount, w.rate_to_try,
                       p_withdrawal => w.id, p_note => w.purpose);
  end if;
  perform log_activity(case when p_approve then 'withdrawal.approve' else 'withdrawal.reject' end,
                       'withdrawals', w.id::text, jsonb_build_object('note', p_note));
  return w;
end $$;

-- Logistics logs supplies bought: against their open advance, paid straight
-- from an account, or on credit (the supplier becomes a debt we owe).
-- p = {"supplier":"Metro","category_id":1,"advance_id":"…" | "account_id":2 | "on_credit":true,
--      "due_date":"2026-10-20",
--      "rate":null,"receipt_path":"receipts/…","note":"…",
--      "items":[{"description":"Chicken thighs","quantity":10,"unit":"kg","amount":1450}]}
create or replace function log_purchase(p jsonb) returns purchases
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := require_role('logistics', 'admin');
  pu purchases; adv withdrawals; total numeric; rate numeric; acct smallint; it jsonb; dbt uuid;
begin
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
            (p->>'due_date')::date, 'purchase_on_credit', uid)
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
    insert into purchase_items (purchase_id, description, quantity, unit, amount)
    values (pu.id, it->>'description', (it->>'quantity')::numeric, nullif(it->>'unit', ''),
            (it->>'amount')::numeric);
  end loop;

  if acct is not null then
    perform post_entry(acct, 'purchase_direct', -total, rate, p_purchase => pu.id, p_note => pu.supplier);
  end if;
  perform log_activity('purchase.create', 'purchases', pu.id::text,
    jsonb_build_object('supplier', pu.supplier, 'amount', total, 'advance_id', adv.id, 'on_credit', dbt is not null));
  return pu;
end $$;

-- Unspent part of an advance goes back into an account.
create or replace function return_change(p_advance uuid, p_account smallint, p_amount numeric)
returns bigint language plpgsql security definer set search_path = public as $$
declare uid uuid := require_role('logistics', 'admin'); a record; acct_cur text; adv_cur text;
begin
  select * into a from v_advances where id = p_advance;
  if a.id is null then raise exception 'Advance not found'; end if;
  if app_role() <> 'admin' and a.recipient_id <> uid then raise exception 'Not your advance'; end if;
  if p_amount <= 0 or p_amount > a.remaining + 0.005 then
    raise exception 'Amount must be between 0 and the % still held', a.remaining;
  end if;
  select currency into acct_cur from accounts where id = p_account;
  select ac.currency into adv_cur from withdrawals w join accounts ac on ac.id = w.account_id where w.id = p_advance;
  if acct_cur <> adv_cur then raise exception 'Return change into an account in %', adv_cur; end if;
  perform log_activity('advance.change_returned', 'withdrawals', p_advance::text, jsonb_build_object('amount', p_amount));
  return post_entry(p_account, 'change_returned', p_amount, a.rate_to_try, p_withdrawal => p_advance);
end $$;

-- Admin reimburses staff when purchases exceeded the advance.
create or replace function settle_advance_overspend(p_advance uuid, p_account smallint)
returns bigint language plpgsql security definer set search_path = public as $$
declare uid uuid := require_role('admin'); a record;
begin
  select * into a from v_advances where id = p_advance;
  if a.remaining >= 0 then raise exception 'Nothing is owed on this advance'; end if;
  if account_balance(p_account) < -a.remaining then raise exception 'Not enough money in this account'; end if;
  return post_entry(p_account, 'advance_topup', a.remaining, a.rate_to_try, p_withdrawal => p_advance,
                    p_note => 'Reimburse overspend');
end $$;

-- =====================================================================
-- RPC: admin money tools
-- =====================================================================
create or replace function transfer_between_accounts(p_from smallint, p_to smallint, p_amount_from numeric,
                                                     p_amount_to numeric default null, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := require_role('admin'); t uuid; rf numeric; rt numeric; try_val numeric;
begin
  if account_balance(p_from) < p_amount_from then raise exception 'Not enough money in the source account'; end if;
  rf := resolve_rate(p_from, null);
  try_val := round(p_amount_from * rf, 2);
  p_amount_to := coalesce(p_amount_to, p_amount_from);
  rt := round(try_val / p_amount_to, 6);
  insert into account_transfers (from_account, to_account, note, created_by)
  values (p_from, p_to, p_note, uid) returning id into t;
  perform post_entry(p_from, 'transfer_out', -p_amount_from, rf, p_transfer => t, p_note => p_note);
  perform post_entry(p_to, 'transfer_in', p_amount_to, rt, p_transfer => t, p_note => p_note,
                     p_amount_try => try_val);
  return t;
end $$;

create or replace function adjust_balance(p_account smallint, p_amount numeric, p_reason text,
                                          p_opening boolean default false, p_rate numeric default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare uid uuid := require_role('admin');
begin
  if coalesce(length(trim(p_reason)), 0) < 3 then raise exception 'A reason is required'; end if;
  if p_opening and exists (select 1 from ledger_entries where account_id = p_account and entry_type = 'opening_balance') then
    raise exception 'This account already has an opening balance; use an adjustment instead';
  end if;
  perform log_activity('account.adjust', 'accounts', p_account::text,
    jsonb_build_object('amount', p_amount, 'reason', p_reason, 'opening', p_opening));
  return post_entry(p_account, case when p_opening then 'opening_balance' else 'adjustment' end::entry_type,
                    p_amount, resolve_rate(p_account, p_rate), p_note => p_reason);
end $$;

-- Reverse any single ledger entry (wrong account, typo). Also reverses the
-- linked withdrawal or purchase so reports stay right.
create or replace function reverse_entry(p_entry bigint, p_reason text) returns bigint
language plpgsql security definer set search_path = public as $$
declare uid uuid := require_role('admin'); e ledger_entries; rid bigint;
begin
  select * into e from ledger_entries where id = p_entry;
  if e.id is null then raise exception 'Entry not found'; end if;
  if e.entry_type = 'reversal' then raise exception 'Cannot reverse a reversal'; end if;
  rid := post_entry(e.account_id, 'reversal', -e.amount, e.rate_to_try, p_order => e.order_id,
                    p_withdrawal => e.withdrawal_id, p_purchase => e.purchase_id, p_transfer => e.transfer_id,
                    p_reverses => e.id, p_note => p_reason, p_amount_try => -e.amount_try, p_debt => e.debt_id);
  if e.entry_type in ('advance', 'direct_expense') then
    update withdrawals set status = 'reversed', decision_note = p_reason where id = e.withdrawal_id;
  elsif e.entry_type = 'purchase_direct' then
    update purchases set is_reversed = true where id = e.purchase_id;
  end if;
  perform log_activity('ledger.reverse', 'ledger_entries', e.id::text, jsonb_build_object('reason', p_reason));
  return rid;
end $$;

-- Purchases logged against an advance have no ledger row; reverse them here.
create or replace function reverse_purchase(p_purchase uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := require_role('admin'); e bigint;
begin
  select id into e from ledger_entries where purchase_id = p_purchase and entry_type = 'purchase_direct';
  if e is not null then perform reverse_entry(e, p_reason); return; end if;
  update purchases set is_reversed = true, note = coalesce(note || ' | ', '') || 'Reversed: ' || p_reason
   where id = p_purchase;
  -- A purchase on credit also cancels the debt it created.
  update debts set is_cancelled = true, cancel_reason = 'Purchase reversed: ' || p_reason
   where id = (select debt_id from purchases where id = p_purchase);
  perform log_activity('purchase.reverse', 'purchases', p_purchase::text, jsonb_build_object('reason', p_reason));
end $$;

create or replace function set_fx_rate(p_currency text, p_rate numeric) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := require_role('admin');
begin
  insert into fx_rates (currency, rate_to_try, set_by) values (upper(p_currency), p_rate, uid)
  on conflict (currency, effective_date) do update set rate_to_try = excluded.rate_to_try, set_by = excluded.set_by;
end $$;

-- =====================================================================
-- RPC: debts
-- =====================================================================
-- Record a debt. Opening debts (before go-live) and plain IOUs move no money.
-- A loan moves money: pass p_account and we_owe = money received (borrowed),
-- owed_to_us = money paid out (lent).
create or replace function record_debt(
  p_direction debt_direction, p_counterparty text, p_description text, p_amount numeric,
  p_currency text default 'TRY', p_due_date date default null, p_opening boolean default false,
  p_account smallint default null, p_rate numeric default null
) returns debts language plpgsql security definer set search_path = public as $$
declare uid uuid := require_role('admin'); d debts; cur text; rate numeric;
begin
  if coalesce(length(trim(p_counterparty)), 0) < 2 then raise exception 'Who is the debt with?'; end if;
  if coalesce(length(trim(p_description)), 0) < 3 then raise exception 'Describe the debt'; end if;
  if p_opening and p_account is not null then raise exception 'Opening debts move no money; leave the account empty'; end if;
  if p_account is not null then
    select currency into cur from accounts where id = p_account and is_active;
    if cur is distinct from upper(p_currency) then
      raise exception 'A loan must be in the currency of the account it moves through (%)', cur;
    end if;
    if p_direction = 'owed_to_us' and account_balance(p_account) < p_amount then
      raise exception 'Not enough money in this account';
    end if;
  end if;

  insert into debts (direction, counterparty, description, currency, amount, due_date, is_opening, source, created_by)
  values (p_direction, trim(p_counterparty), trim(p_description), upper(p_currency), p_amount, p_due_date, p_opening,
          case when p_opening then 'opening' when p_account is not null then 'loan' else 'manual' end, uid)
  returning * into d;

  if p_account is not null then
    rate := resolve_rate(p_account, p_rate);
    perform post_entry(p_account, case when p_direction = 'we_owe' then 'debt_in' else 'debt_out' end::entry_type,
                       case when p_direction = 'we_owe' then p_amount else -p_amount end, rate,
                       p_debt => d.id, p_note => 'Loan: ' || d.counterparty);
  end if;
  perform log_activity('debt.create', 'debts', d.id::text,
    jsonb_build_object('direction', p_direction, 'counterparty', d.counterparty, 'amount', p_amount, 'currency', d.currency, 'opening', p_opening));
  return d;
end $$;

-- Pay (we_owe) or collect (owed_to_us) part or all of a debt.
-- p_amount = money moved, in the account's currency.
-- p_covers = how much of the debt it clears, in the debt's currency (only needed when currencies differ).
create or replace function settle_debt(p_debt uuid, p_account smallint, p_amount numeric,
                                       p_covers numeric default null, p_note text default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  uid uuid := require_role('operations', 'admin');
  d record; acur text; rate numeric; covers numeric; s settings; eid bigint;
begin
  select * into d from v_debts where id = p_debt;
  if d.id is null then raise exception 'Debt not found'; end if;
  if d.state <> 'open' then raise exception 'This debt is already %', d.state; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be more than 0'; end if;

  select currency into acur from accounts where id = p_account and is_active;
  if acur is null then raise exception 'Unknown account'; end if;
  if acur = d.currency then
    covers := p_amount;
  elsif p_covers is null or p_covers <= 0 then
    raise exception 'Say how much of the % debt this clears', d.currency;
  else
    covers := p_covers;
  end if;
  if covers > d.outstanding + 0.005 then
    raise exception 'That is more than the % % still outstanding', d.outstanding, d.currency;
  end if;

  rate := resolve_rate(p_account, null);
  if d.direction = 'we_owe' then
    if account_balance(p_account) < p_amount then raise exception 'Not enough money in this account'; end if;
    select * into s from settings;
    if app_role() <> 'admin' and s.withdrawal_approval_limit_try is not null
       and round(p_amount * rate, 2) > s.withdrawal_approval_limit_try then
      raise exception 'Payments over ₺% need Admin', s.withdrawal_approval_limit_try;
    end if;
  end if;

  eid := post_entry(p_account, case when d.direction = 'we_owe' then 'debt_out' else 'debt_in' end::entry_type,
                    case when d.direction = 'we_owe' then -p_amount else p_amount end, rate,
                    p_debt => p_debt, p_note => coalesce(p_note, d.counterparty));
  insert into debt_settlements (debt_id, ledger_entry_id, covers) values (p_debt, eid, covers);
  perform log_activity(case when d.direction = 'we_owe' then 'debt.pay' else 'debt.collect' end, 'debts', p_debt::text,
    jsonb_build_object('account', p_account, 'amount', p_amount, 'covers', covers));
  return eid;
end $$;

-- Write off or correct a debt that should not be there (Admin).
create or replace function cancel_debt(p_debt uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := require_role('admin');
begin
  if coalesce(length(trim(p_reason)), 0) < 3 then raise exception 'A reason is required'; end if;
  update debts set is_cancelled = true, cancel_reason = p_reason where id = p_debt;
  perform log_activity('debt.cancel', 'debts', p_debt::text, jsonb_build_object('reason', p_reason));
end $$;

-- =====================================================================
-- RPC: daily close
-- =====================================================================
create or replace function expected_cash(p_date date, p_account smallint) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(amount), 0) from ledger_entries where account_id = p_account and business_date <= p_date;
$$;

create or replace function close_day(p_counted numeric, p_note text default null,
                                     p_date date default business_date(), p_account smallint default null)
returns day_closes language plpgsql security definer set search_path = public as $$
declare
  uid uuid := require_role('operations', 'admin');
  acct smallint := coalesce(p_account, (select id from accounts where is_cash order by sort_order limit 1));
  c day_closes; exp numeric;
begin
  if exists (select 1 from day_closes where business_date = p_date and account_id = acct and not superseded) then
    if app_role() <> 'admin' then raise exception 'This day is already closed; ask Admin to re-close'; end if;
    update day_closes set superseded = true where business_date = p_date and account_id = acct and not superseded;
  end if;
  exp := expected_cash(p_date, acct);
  insert into day_closes (business_date, account_id, expected_amount, counted_amount, unpaid_orders,
                          open_advances, note, closed_by)
  values (p_date, acct, exp, p_counted,
          (select count(*) from v_order_payments where business_date = p_date and status <> 'cancelled' and balance_due > 0),
          (select count(*) from v_advances where state = 'open'),
          p_note, uid)
  returning * into c;
  perform log_activity('day.close', 'day_closes', c.id::text,
    jsonb_build_object('date', p_date, 'expected', exp, 'counted', p_counted));
  return c;
end $$;

-- =====================================================================
-- Views (read models for screens and reports). security_invoker = on
-- so table RLS applies to whoever queries them.
-- =====================================================================
create view v_account_balances with (security_invoker = on) as
select a.id, a.name, a.currency, a.is_cash, a.sort_order,
       coalesce(sum(l.amount), 0)::numeric(14,2) as balance,
       round(coalesce(sum(l.amount), 0) * coalesce(
         case when a.currency = 'TRY' then 1 end,
         (select rate_to_try from fx_rates f where f.currency = a.currency order by effective_date desc limit 1)
       ), 2) as balance_try_estimate
from accounts a left join ledger_entries l on l.account_id = a.id
where a.is_active
group by a.id;

create view v_order_payments with (security_invoker = on) as
select o.id, o.business_date, o.daily_number, o.status, o.total,
       coalesce(sum(l.amount_try), 0)::numeric(12,2) as paid_try,
       (o.total - coalesce(sum(l.amount_try), 0))::numeric(12,2) as balance_due,
       string_agg(distinct a.name, ', ') filter (where l.entry_type = 'order_payment') as paid_via
from orders o
left join ledger_entries l on l.order_id = o.id
left join accounts a on a.id = l.account_id
group by o.id;

create view v_advances with (security_invoker = on) as
with spent as (
  select advance_id, sum(amount) amt from purchases where advance_id is not null and not is_reversed group by advance_id
), moves as (
  select withdrawal_id,
         sum(amount) filter (where entry_type = 'change_returned') returned,
         -sum(amount) filter (where entry_type = 'advance_topup')  topped_up
  from ledger_entries where withdrawal_id is not null group by withdrawal_id
)
select w.id, w.business_date, w.account_id, w.recipient_id, p.full_name as recipient_name,
       w.purpose, w.amount, w.rate_to_try,
       coalesce(s.amt, 0) as spent,
       coalesce(m.returned, 0) as change_returned,
       coalesce(m.topped_up, 0) as reimbursed,
       (w.amount + coalesce(m.topped_up, 0) - coalesce(s.amt, 0) - coalesce(m.returned, 0))::numeric(14,2) as remaining,
       case when (w.amount + coalesce(m.topped_up, 0) - coalesce(s.amt, 0) - coalesce(m.returned, 0)) > 0.005 then 'open'
            when (w.amount + coalesce(m.topped_up, 0) - coalesce(s.amt, 0) - coalesce(m.returned, 0)) < -0.005 then 'owed_to_staff'
            else 'accounted' end as state,
       business_date() - w.business_date as age_days
from withdrawals w
join profiles p on p.id = w.recipient_id
left join spent s on s.advance_id = w.id
left join moves m on m.withdrawal_id = w.id
where w.kind = 'advance' and w.status = 'approved';

-- Items sold per day (the "how many chicken did we sell" view).
create view v_items_sold_daily with (security_invoker = on) as
select o.business_date, i.category_name, i.product_id, i.product_name, i.variant_name,
       sum(i.quantity)::int as quantity, sum(i.line_total)::numeric(14,2) as revenue
from order_items i join orders o on o.id = i.order_id
where o.status <> 'cancelled'
group by 1, 2, 3, 4, 5;

-- Extras sold per day (Swallow, Fish, Turkey...): added to a plate or sold on their own.
create view v_extras_sold_daily with (security_invoker = on) as
with sold as (
  select o.business_date, x->>'name' as extra_name, i.quantity as on_plate, 0 as standalone,
         i.quantity * (x->>'price')::numeric as revenue
  from order_items i join orders o on o.id = i.order_id, jsonb_array_elements(i.addons) x
  where o.status <> 'cancelled'
  union all
  select o.business_date, a.name, 0, i.quantity, i.line_total
  from order_items i join orders o on o.id = i.order_id
  join products p on p.id = i.product_id join addons a on a.id = p.addon_id
  where o.status <> 'cancelled'
)
select business_date, extra_name,
       sum(on_plate)::int as on_plate, sum(standalone)::int as standalone,
       sum(on_plate + standalone)::int as quantity, sum(revenue)::numeric(14,2) as revenue
from sold group by 1, 2;

create view v_sales_daily with (security_invoker = on) as
select o.business_date,
       count(*) filter (where o.status <> 'cancelled')                       as orders,
       count(*) filter (where o.status = 'cancelled')                        as cancelled_orders,
       coalesce(sum(o.subtotal) filter (where o.status <> 'cancelled'), 0)        as gross_sales,
       coalesce(sum(o.discount_amount) filter (where o.status <> 'cancelled'), 0) as discounts,
       coalesce(sum(o.total) filter (where o.status <> 'cancelled'), 0)           as net_sales
from orders o group by 1;

create view v_payments_daily with (security_invoker = on) as
select l.business_date, a.name as account, a.currency, o.channel,
       sum(l.amount) as amount, sum(l.amount_try) as amount_try
from ledger_entries l join accounts a on a.id = l.account_id
left join orders o on o.id = l.order_id
where l.entry_type in ('order_payment', 'refund') or (l.entry_type = 'reversal' and l.order_id is not null)
group by 1, 2, 3, 4;

-- All expenses with a category, in TRY (purchases + direct expenses).
create view v_expenses with (security_invoker = on) as
select p.business_date, 'purchase' as source, p.id, c.name as category, c.kind,
       p.supplier as description, p.amount_try, p.logged_by as staff_id
from purchases p join expense_categories c on c.id = p.category_id
where not p.is_reversed
union all
select w.business_date, 'direct_expense', w.id, c.name, c.kind, w.purpose, w.amount_try, w.requested_by
from withdrawals w join expense_categories c on c.id = w.category_id
where w.kind = 'direct_expense' and w.status = 'approved';

create view v_debts with (security_invoker = on) as
with paid as (
  select s.debt_id, sum(s.covers) covers
  from debt_settlements s
  where not exists (select 1 from ledger_entries r where r.reverses_id = s.ledger_entry_id)
  group by s.debt_id
)
select d.id, d.direction, d.counterparty, d.description, d.currency, d.amount, d.due_date,
       d.is_opening, d.source, d.business_date, d.created_at,
       coalesce(p.covers, 0)::numeric(14,2) as settled,
       (d.amount - coalesce(p.covers, 0))::numeric(14,2) as outstanding,
       case when d.is_cancelled then 'cancelled'
            when d.amount - coalesce(p.covers, 0) <= 0.005 then 'settled'
            else 'open' end as state,
       (d.due_date is not null and d.due_date < business_date() and d.amount - coalesce(p.covers, 0) > 0.005
        and not d.is_cancelled) as is_overdue,
       round((d.amount - coalesce(p.covers, 0)) * coalesce(
         case when d.currency = 'TRY' then 1 end,
         (select rate_to_try from fx_rates f where f.currency = d.currency order by effective_date desc limit 1)), 2)
         as outstanding_try_estimate
from debts d left join paid p on p.debt_id = d.id;

create view v_pnl_daily with (security_invoker = on) as
-- Refunds only happen when Admin voids an order, and voided orders are
-- already excluded from net_sales, so refunds are not subtracted again.
with d as (
  select business_date from v_sales_daily union select business_date from v_expenses
)
select d.business_date,
       coalesce(s.net_sales, 0) as net_revenue,
       coalesce((select sum(amount_try) from v_expenses e where e.business_date = d.business_date and e.kind = 'cogs'), 0) as cost_of_goods,
       coalesce((select sum(amount_try) from v_expenses e where e.business_date = d.business_date and e.kind = 'operational'), 0) as operational_expenses,
       coalesce((select sum(amount_try) from v_expenses e where e.business_date = d.business_date and e.kind = 'fixed'), 0) as fixed_overheads
from d left join v_sales_daily s using (business_date);

-- Profit and loss for any range, laid out like the Weekly P&L tab of the costing sheet:
--   select * from report_pnl('2026-10-05', '2026-10-11');
create or replace function report_pnl(p_from date, p_to date)
returns table (net_revenue numeric, cost_of_goods numeric, gross_profit numeric, gross_margin numeric,
               operational_expenses numeric, fixed_overheads numeric, net_profit numeric, net_margin numeric)
language sql stable security invoker set search_path = public as $$
  select sum(net_revenue), sum(cost_of_goods), sum(net_revenue - cost_of_goods),
         round(case when sum(net_revenue) > 0 then sum(net_revenue - cost_of_goods) / sum(net_revenue) end, 4),
         sum(operational_expenses), sum(fixed_overheads),
         sum(net_revenue - cost_of_goods - operational_expenses - fixed_overheads),
         round(case when sum(net_revenue) > 0
               then sum(net_revenue - cost_of_goods - operational_expenses - fixed_overheads) / sum(net_revenue) end, 4)
  from v_pnl_daily where business_date between p_from and p_to;
$$;

-- Week by week (Monday start): ingredients are bought weekly, so this is the main view.
create view v_pnl_weekly with (security_invoker = on) as
select date_trunc('week', business_date)::date as week_start,
       sum(net_revenue) as net_revenue, sum(cost_of_goods) as cost_of_goods,
       sum(net_revenue - cost_of_goods) as gross_profit,
       sum(operational_expenses) as operational_expenses, sum(fixed_overheads) as fixed_overheads,
       sum(net_revenue - cost_of_goods - operational_expenses - fixed_overheads) as net_profit
from v_pnl_daily group by 1;

-- Items sold for any range, ranked.
create or replace function report_items_sold(p_from date, p_to date)
returns table (category_name text, product_name text, variant_name text, quantity bigint, revenue numeric)
language sql stable security invoker set search_path = public as $$
  select category_name, product_name, variant_name, sum(quantity), sum(revenue)
  from v_items_sold_daily where business_date between p_from and p_to
  group by 1, 2, 3 order by 4 desc;
$$;

-- =====================================================================
-- Row-level security
-- Reads by role; writes to money/order tables only through the RPCs above.
-- =====================================================================
alter table profiles            enable row level security;
alter table settings            enable row level security;
alter table accounts            enable row level security;
alter table fx_rates            enable row level security;
alter table product_categories  enable row level security;
alter table products            enable row level security;
alter table product_variants    enable row level security;
alter table addons              enable row level security;
alter table product_addons      enable row level security;
alter table price_history       enable row level security;
alter table orders              enable row level security;
alter table order_items         enable row level security;
alter table expense_categories  enable row level security;
alter table withdrawals         enable row level security;
alter table purchases           enable row level security;
alter table purchase_items      enable row level security;
alter table account_transfers   enable row level security;
alter table ledger_entries      enable row level security;
alter table day_closes          enable row level security;
alter table activity_log        enable row level security;
alter table debts               enable row level security;
alter table debt_settlements    enable row level security;

-- Everyone signed in and active: read reference data and orders.
create policy read_all on profiles           for select to authenticated using (app_role() is not null);
create policy read_all on settings           for select to authenticated using (app_role() is not null);
create policy read_all on accounts           for select to authenticated using (app_role() is not null);
create policy read_all on fx_rates           for select to authenticated using (app_role() is not null);
create policy read_all on product_categories for select to authenticated using (app_role() is not null);
create policy read_all on products           for select to authenticated using (app_role() is not null);
create policy read_all on product_variants   for select to authenticated using (app_role() is not null);
create policy read_all on addons             for select to authenticated using (app_role() is not null);
create policy read_all on product_addons     for select to authenticated using (app_role() is not null);
create policy read_all on expense_categories for select to authenticated using (app_role() is not null);
create policy read_all on orders             for select to authenticated using (app_role() is not null);
create policy read_all on order_items        for select to authenticated using (app_role() is not null);

-- Operations + Admin: full money and report visibility.
create policy read_ops on price_history     for select to authenticated using (app_role() in ('operations','admin'));
create policy read_ops on ledger_entries    for select to authenticated using (app_role() in ('operations','admin'));
create policy read_ops on account_transfers for select to authenticated using (app_role() in ('operations','admin'));
create policy read_ops on day_closes        for select to authenticated using (app_role() in ('operations','admin'));
create policy read_admin on activity_log    for select to authenticated using (app_role() = 'admin');
create policy read_ops on debts             for select to authenticated using (app_role() in ('operations','admin'));
create policy read_ops on debt_settlements  for select to authenticated using (app_role() in ('operations','admin'));

-- Logistics sees only their own withdrawals/purchases (and the ledger rows tied to them).
create policy read_wd on withdrawals for select to authenticated using (
  app_role() in ('operations','admin') or recipient_id = auth.uid() or requested_by = auth.uid());
create policy read_pu on purchases for select to authenticated using (
  app_role() in ('operations','admin') or logged_by = auth.uid());
create policy read_pi on purchase_items for select to authenticated using (
  exists (select 1 from purchases p where p.id = purchase_id));
create policy read_own_ledger on ledger_entries for select to authenticated using (
  app_role() = 'logistics' and withdrawal_id in (select id from withdrawals where recipient_id = auth.uid()));

-- Menu: Operations + Admin may create and edit (PRD decision); changes are logged.
create policy menu_write on product_categories for all to authenticated
  using (app_role() in ('operations','admin')) with check (app_role() in ('operations','admin'));
create policy menu_write on products for all to authenticated
  using (app_role() in ('operations','admin')) with check (app_role() in ('operations','admin'));
create policy menu_write on product_variants for all to authenticated
  using (app_role() in ('operations','admin')) with check (app_role() in ('operations','admin'));
create policy menu_write on addons for all to authenticated
  using (app_role() in ('operations','admin')) with check (app_role() in ('operations','admin'));
create policy menu_write on product_addons for all to authenticated
  using (app_role() in ('operations','admin')) with check (app_role() in ('operations','admin'));

-- Admin-only configuration.
create policy admin_write on profiles for all to authenticated
  using (app_role() = 'admin') with check (app_role() = 'admin');
create policy admin_write on settings for update to authenticated
  using (app_role() = 'admin') with check (app_role() = 'admin');
create policy admin_write on accounts for all to authenticated
  using (app_role() = 'admin') with check (app_role() = 'admin');
create policy admin_write on expense_categories for all to authenticated
  using (app_role() = 'admin') with check (app_role() = 'admin');

-- Function access: signed-in users only.
revoke execute on all functions in schema public from public, anon;
grant  execute on all functions in schema public to authenticated;
-- Internal helpers are not callable from the app.
revoke execute on function post_entry(smallint, entry_type, numeric, numeric, uuid, uuid, uuid, uuid, bigint, text, numeric, uuid) from authenticated;
revoke execute on function log_activity(text, text, text, jsonb) from authenticated;
