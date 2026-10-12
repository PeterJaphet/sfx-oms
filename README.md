# SFx Burger OMS

The internal order and money system for SFx Burger. The database is built and tested; the app is
built on top of it by an AI coding agent, milestone by milestone.

**Start here:** open this folder in your AI coding agent and follow `docs/BUILD_PLAN.md`.
The agent reads `CLAUDE.md` for its rules.

## Files

| File | What it is |
| --- | --- |
| `CLAUDE.md` | Rules and context the AI builder reads first |
| `docs/BUILD_PLAN.md` | 12 milestones: a prompt to paste for each, and a checklist to verify it |
| `docs/PRD.md` | Product requirements (export of the shared PRD) |
| `docs/DESIGN.md` | Colours, type, components, screen-to-route map |
| `docs/screens/` | The approved screen designs (HTML reference) |
| `supabase/schema.sql` | Tables, ledger, business rules (as Postgres functions), report views, row-level security |
| `supabase/seed.sql` | Menu and extras, 7 payment accounts, cost categories, approval limit, $ rate |
| `supabase/storage.sql` | Private `receipts` bucket and its access rules |
| `supabase/migrations/` | Future database changes go here, never into schema.sql |
| `supabase/tests/` | A stand-in for Supabase auth plus the scenario checks |
| `scripts/db-test.sh` | Runs all database checks on a throwaway database |

## Set up (about 15 minutes)

1. Create a Supabase project (region: Frankfurt). Free plan is fine while building; move to Pro before go-live (Free pauses after 7 days idle and has no daily backups).
2. SQL editor: run `schema.sql`, then `seed.sql`, then `storage.sql`.
3. `seed.sql` loads the printed menu: 10 dishes and 8 extras (Fish, Turkey, Chicken, Shaki, Ponmo, Salad, Egg, Swallow) that can be added to rice and soup plates. It also loads the cost categories from the costing sheet's Weekly P&L tab, the 7 accounts (SFx, RedotPay and Crypto in US dollars), a ₺2,000 approval limit and the sheet's 47.90 ₺/$ rate. 
4. Authentication → Users: create Peter's user, then in the SQL editor:
   `insert into profiles (id, full_name, role) values ('<user id>', 'Peter Japhet', 'admin');`
5. Go-live, as Admin: one opening balance per account (allowed once per account), then every outstanding debt:
   `select adjust_balance(1::smallint, 2450, 'Opening balance at go-live', true);`
   `select record_debt('we_owe', 'Metro Market', 'Unpaid supplies', 4200, 'TRY', '2026-10-20', true);`
6. Set the Naira rate before the first Naira payment: `select set_fx_rate('NGN', 0.027);`

## Front end — M0

React 18 + TypeScript + Vite, Tailwind CSS 4 + shadcn/ui, TanStack Query, React Router 7,
supabase-js v2, React Hook Form + Zod, Vitest and ESLint. Vite 6 and the pinned Supabase
client support the project's Node 20 runtime. The root page is the M0 brand and currency
display preview; sign-in and role navigation begin in M1.

From the repository root, with Node.js 20.17+ and npm installed:

```bash
npm ci
cp .env.example .env
npm run dev
```

Fill in `.env` locally with the project URL and **public anon key** from the Supabase
dashboard. The only frontend environment variables are:

```dotenv
VITE_SUPABASE_URL=https://lnolchqycicixjikolfi.supabase.co
VITE_SUPABASE_ANON_KEY=<your public anon key>
```

Restart the dev server after editing `.env`. The brand page also works before these
values are set; the Supabase client remains unavailable until both are configured.
`.env`, `.env.*`, dependency folders and build output are git-ignored; `.env.example`
contains no credentials. Never put a service-role key in a `VITE_` variable or in `src/`.

Vite listens on port 5173. Open `http://localhost:5173` on the computer. For the phone
check, connect the phone to the same Wi-Fi and open the Network URL printed by Vite.

### Load the Supabase database by hand

In project `lnolchqycicixjikolfi`, open **SQL Editor**. For each step, create a new query,
paste the entire file's contents and click **Run**. Run these once, in this order:

1. `supabase/schema.sql` — tables, RLS, ledger, RPCs and report views.
2. `supabase/seed.sql` — menu, linked standalone extras, accounts, categories and settings.
3. `supabase/storage.sql` — private receipts bucket and upload/read policies.

These are initial installation scripts, not scripts to rerun on a populated project.
If already loaded, verify the counts instead of rerunning them. No database changes
or migrations are needed for M0. Leave opening balances and go-live debts for M7.

Under **Authentication → Providers → Email**, turn off **Confirm email**, as specified
by the build plan. The first admin and staff logins are configured in M1.

In Table Editor, verify **7 accounts**, **8 addons**, and **18 products**: 10 dishes
with `addon_id` empty, plus 8 standalone extras linked by `addon_id`. There are 18
Regular variants. The seed sets the USD default rate; the NGN rate is set later.

Optional read-only verification in SQL Editor:

```sql
select count(*) filter (where addon_id is null) as dishes,
       count(*) filter (where addon_id is not null) as standalone_extras
from public.products;
select count(*) as extras from public.addons;
select count(*) as accounts from public.accounts;
```

### Database types

After loading the database, log in to the Supabase CLI locally and regenerate types
from this project's public schema. Keep the login token local; it never belongs in
the frontend or Git.

```bash
npx supabase login
npx supabase gen types typescript --project-id lnolchqycicixjikolfi --schema public > /tmp/sfx-db.types.ts
```

Only after the generator exits successfully and the output contains the `Database`
type, copy `/tmp/sfx-db.types.ts` to `src/lib/db.types.ts`. Using a temporary file
prevents a failed login or network request from emptying the last generated types.

### Checks

```bash
npm run typecheck
npm run lint
npm test
PGURL=postgres://postgres@localhost:5432/postgres ./scripts/db-test.sh
npm run build
```

`npm test` runs Vitest once; `npm run test:watch` is available for development.
Database tests require a local PostgreSQL server where the test role can create
and drop a throwaway database. **Never use the live Supabase project's URL.**

The user-approved display rule supersedes the older formatting text in the build
kit: **all currencies omit decimals for whole amounts and show two for fractions**.
Examples: `₺1,220`, `$85`, `₦15,000`, `₺1,220.50`, `$85.50`, `₦15,000.50`.
`formatMoney` is a display helper; saved money totals remain database-owned.

## How the app talks to the database

The app **reads** tables and views directly and **writes** money and orders only through these functions
(`supabase.rpc('<name>', {...})`). Each checks the caller's role; the database refuses anything else.

| Function | Who | Does |
| --- | --- | --- |
| `create_order(p_order jsonb)` | Ops, Admin | Creates an order; prices come from the menu, never the client; optional payments |
| `add_order_payment(p_order, p_account, p_amount_try, p_amount)` | Ops, Admin | Adds a payment; for Naira/crypto pass the amount received in that currency |
| `set_order_status(p_order, p_status)` | Ops, Logistics, Admin | new → preparing → ready → picked_up → completed (role rules apply) |
| `cancel_order(p_order, p_reason)` | Ops (unpaid only), Admin (refunds) | Cancels with a reason |
| `create_withdrawal(p_kind, p_account, p_amount, p_purpose, p_category, p_recipient, p_rate, p_receipt_path)` | Ops, Admin | Advance or direct expense; blocks if balance is short; waits for approval above the limit |
| `decide_withdrawal(p_withdrawal, p_approve, p_note)` | Admin | Approve or reject |
| `log_purchase(p jsonb)` | Logistics, Admin | Supplies bought: against an advance, straight from an account, or on credit |
| `return_change(p_advance, p_account, p_amount)` | Logistics, Admin | Unspent advance back into an account |
| `settle_advance_overspend(p_advance, p_account)` | Admin | Reimburse staff who spent more than the advance |
| `close_day(p_counted, p_note)` | Ops, Admin | Expected vs counted cash |
| `record_debt(p_direction, p_counterparty, p_description, p_amount, p_currency, p_due_date, p_opening, p_account)` | Admin | Opening debts at go-live, IOUs, or loans (pass `p_account` and money moves) |
| `settle_debt(p_debt, p_account, p_amount, p_covers, p_note)` | Ops (up to the limit), Admin | Pay what we owe or collect what is owed; never revenue or expense |
| `cancel_debt(p_debt, p_reason)` | Admin | Write off or correct a debt |
| `transfer_between_accounts`, `adjust_balance`, `reverse_entry`, `reverse_purchase`, `set_fx_rate` | Admin | Money admin tools |

Read models for screens and reports: `v_account_balances`, `v_order_payments`, `v_advances`,
`v_items_sold_daily`, `v_extras_sold_daily`, `v_sales_daily`, `v_payments_daily`, `v_expenses`, `v_debts`, `v_pnl_daily`,
`v_pnl_weekly` (Monday start, the main view since ingredients are bought weekly),
plus `report_pnl(from, to)` and `report_items_sold(from, to)`. The P&L splits costs the same way as the
costing sheet: cost of goods (ingredients + packaging), operational, and fixed overheads.

`log_purchase` also accepts `"on_credit": true` (with an optional `"due_date"`): the expense counts now and
the supplier becomes a debt we owe.

Example — "what sold last week?":

```sql
select product_name, sum(quantity) from v_items_sold_daily
where business_date between '2026-10-05' and '2026-10-11'
group by 1 order by 2 desc;
```

## Rules built into the database

- Balances are never typed: they are the sum of ledger entries. Ledger rows cannot be edited or deleted, even by Admin; mistakes are reversed.
- An advance is not an expense; purchases logged against it are. Open advances show until purchases + change returned = amount.
- Orders, products, withdrawals and purchases cannot be deleted; products are deactivated, orders cancelled.
- Every price change is kept in `price_history`; every action lands in `activity_log` (Admin only).
- Extras only go on dishes they are set up for, and can be sold on their own; one price is kept in sync for both.
- Business day runs 06:00–05:59 Europe/Nicosia, so a 01:30 sale counts for the previous day.

## Run the database checks

```bash
PGURL=postgres://postgres@localhost:5432/postgres ./scripts/db-test.sh
```

Uses any local Postgres 15+ (install, or `docker run -d -p 5432:5432 -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16`).
It builds a throwaway database from schema, migrations and seed, runs go-live (opening balances, debts,
a dollar loan) and a full day through all three roles, then prints "All 42 database checks passed" or
the failing lines and exits with an error. Run it after every database change. Never point it at the live project.
