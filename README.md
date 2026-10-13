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
client support the project's Node 20 runtime. M0 established the brand and currency
display foundation. M1 replaces the root preview with sign-in and role navigation.

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
a dollar loan) and a full day through all three roles, then prints "All N database checks passed" or
the failing lines and exits with an error. Run it after every database change. Never point it at the live project.

## M1 — sign-in, roles and staff

The approved flow is **direct phone number + six-digit PIN**. The phone's digits
map to `<digits>@staff.sfxburger.app`; no prior Admin device sign-in is required.
The screens follow the approved light brand theme. Money/order pages remain
placeholders until their scheduled milestones.

### Manual Supabase setup

1. SQL Editor: run the entire `supabase/migrations/001_m1_auth_audit.sql` once.
   This adds server-side 12-hour access checks and login/staff audit on the Free
   plan. It adds restrictive policies and preserves existing permissions.
2. Authentication → Providers → Email: keep **Confirm email off**. The Auth
   password settings must accept the specified six-digit PIN (minimum length 6).
3. Ensure local `.env` contains the project URL and public anon key; restart Vite
   after changing it. Do not put server keys in this file.
4. Deploy the two Edge Functions from this repository's terminal:

```bash
npx supabase functions deploy admin-create-user --project-ref lnolchqycicixjikolfi
npx supabase functions deploy admin-manage-user --project-ref lnolchqycicixjikolfi
```

Keep gateway JWT verification enabled (the default). Each function additionally
verifies the caller through Auth and the database's active-session profile RPC,
then requires the admin role. Supabase supplies `SUPABASE_URL`,
`SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` inside the deployed Edge runtime.
The service-role key is never returned or imported into the browser.

### Create the first Admin by hand

If an Admin profile already exists, use that login. Otherwise:

1. Choose your phone number including its country code. Strip spaces, punctuation
   and `+` for the email: e.g. `+90 500 000 0000` → `905000000000@staff.sfxburger.app`.
   This is an example, not a seeded login.
2. Authentication → Users → Add user → Create new user. Use that synthetic email
   and your own six-digit PIN as the password; confirm the user. Never share the
   PIN in chat, commit it, or put it in SQL or environment files.
3. Copy the created user's UUID. In SQL Editor replace all three placeholders:

```sql
insert into public.profiles (id, full_name, phone, role)
values ('<AUTH_USER_UUID>', '<YOUR FULL NAME>', '+<PHONE DIGITS>', 'admin');
```

4. Sign in using that same phone number and PIN. Admin lands on `/dashboard` and
   can open Staff to create Operations and Logistics users.

### Sessions, deactivation and audit

- A session's cutoff is its **server Auth session creation time + 12 hours**.
  Refreshing tokens, reloading and opening another tab cannot extend that cutoff.
  The browser signs out at the cutoff and rechecks on focus. The database and
  Edge Functions deny expired sessions independently of the browser clock.
- On Free, Supabase Auth may still refresh a token; the app's server guards deny
  data and operations after the app-session cutoff. This does not alter or
  weaken Supabase Auth's policies.
- Deactivation first changes `profiles.is_active` (immediately denying app
  access), then bans Auth sign-in. An interrupted ban call still leaves the
  account blocked by the database. PINs are hashed by Supabase Auth.
- `record_login()` writes one `auth.login` event per verified session. Profile
  creation/role/deactivation changes are audited by a database trigger in the
  same transaction. The PIN-reset function calls a service-only audit RPC after
  Auth confirms the change. Audit events never contain the PIN.
- Auth API and profile/audit RPCs are separate transactions. Errors are surfaced;
  do not assume a failed request made no changes. Creation retries can finish a
  previously created Auth user's missing profile without deleting any records.
  For a PIN-reset error, check Auth audit logs and confirm the current PIN before
  retrying. The application never silently reports success after an audit error.

### M1 verification

Run the four required commands from CLAUDE.md. The DB suite now has **67 checks**:
the original 42 unchanged business assertions plus 25 session/role/audit checks.
Only the auth test fixtures and helper grants changed to model real JWT sessions;
the broad test helper grant no longer reopens private audit functions.

Additional Edge Function typecheck:

```bash
npx deno check --config supabase/functions/deno.json supabase/functions/admin-create-user/index.ts supabase/functions/admin-manage-user/index.ts
npx deno test --config supabase/functions/deno.json --allow-env=SUPABASE_URL,SUPABASE_ANON_KEY,SUPABASE_SERVICE_ROLE_KEY supabase/functions/_shared/staff-handler_test.ts
```

On a real phone, verify each M1 acceptance item:

- Admin can create Operations and Logistics staff from Staff; try changing a
  role, resetting a PIN and signing in with the new PIN.
- Operations lands on `/order` with five nav items; Logistics on `/deliveries`
  with three; Admin on `/dashboard` with Dashboard/New order/Orders/Money/Staff.
- A guessed disallowed URL shows “Not available for your role”.
- A deactivated user cannot sign in; a previously signed-in device loses access
  on its next profile check (at most 15 seconds when online).
- Confirm login and staff changes in `activity_log` using SQL Editor as Admin.
- Service credentials are absent under `src/` (automated source check).

No commit or push until the user approves the completed M1 review.

## M2 — menu and extras

Operations and Admin open **Menu** from the header. Products, Extras and Categories
have search, edit sheets, activation controls and no delete action. The layouts
are described in `docs/MENU_DESIGN.md`. Standalone extras appear once in Extras;
the database shares their price and active state with their linked product.
Price history shows old/new prices, the staff name and Cyprus time.

### Manual Supabase step

Run the whole `supabase/migrations/002_menu_support.sql` once after M1 in SQL Editor.
This creates invoker/RLS-protected menu save/import RPCs, soft-disabled extra links,
category/link auditing and a private `menu-photos` bucket (5 MB; JPG/PNG/WebP).
The original `schema.sql` is untouched. The order RPC adds only inactive-category
and inactive-link checks; its money rules and role checks are preserved.
The migration was applied successfully to `lnolchqycicixjikolfi` during M2,
and `src/lib/db.types.ts` was regenerated from that project. No Edge deployment
is needed for M2.

### Images and CSV

- Choose a phone image in a product or extra sheet. JPG/PNG/WebP inputs up to
  15 MB are resized to at most 1600 px and uploaded with a unique name under
  `<staff UUID>/<image UUID>.webp` (PNG fallback). The bucket remains private;
  ten-minute signed URLs refresh through TanStack Query. Replacements and removal
  from a product retain previous objects.
- Upload happens before the menu save. If upload succeeds and the save fails,
  an unreferenced private object remains; the error is shown and no menu success
  is reported. Menu rows and price history are saved together in one transaction.
- Download the template or import a CSV with exactly `category,product,variant,price`.
  Up to 500 rows / 1 MB; quotes, commas, BOM and multiline fields are supported.
  Preview every row, then press Import. Exact case-sensitive matches update only
  price; unmatched rows create categories/products/variants. Existing inactive
  states, photos, descriptions and extra assignments are retained. Standalone
  extras are edited in Extras. A failed row rolls back the whole import.

### M2 verification and phone review

The database suite has **102 checks**: original 42 business checks, 25 M1 checks
and 35 M2 transaction, price, snapshot, role, audit and Storage policy checks.
The Storage stand-in tests SQL access rules; the real upload service and camera
behavior must also be checked on a phone.

- As Operations (and then Admin), change Fish from ₺180 to ₺200. In Extras,
  confirm ₺200 and one Fish card. Open its Price history and confirm old/new
  price, your name and timestamp. The SQL tests also check the standalone
  variant price; the order screen Extras tab will be checked in M3.
- Deactivate Fish or a test dish/variant/category and change allowed extras.
  The SQL checks prove unavailable items/links cannot be ordered and old
  snapshots retain their prices. Actual disappearance and past-order display
  in the order screens are deferred to M3/M4 as agreed.
- Sign in as Logistics: no Menu link; `/menu` shows “Not available for your role”.
- Add a test product with two variants, upload a phone photo, reload and check
  the photo. Edit its price, deactivate/reactivate it and check its history.
- Preview a small CSV including an existing variant and a new product. Confirm
  the preview before importing, then check the saved prices and history.

Do not commit or push M2 until the user replies approved.

## M3 — new order and payment

Operations and Admin take orders at `/order`, then pay at `/order/pay`.
Layouts follow Main.dc.html and Checkout.dc.html; supporting layouts and the
approved rate choice are documented in `docs/ORDER_DESIGN.md`.

### Manual Supabase setup

Run these entire files once, in this order after M2:

1. `supabase/migrations/003_order_quote.sql` — read-only `quote_order`, database
   percentage discounts, atomic `create_order` and optional idempotent requests.
2. `supabase/migrations/004_order_request_privacy.sql` — converts request metadata
   to an opaque SHA-256 hash, preserving previously saved orders and retries.
   Full submitted payment payloads are not exposed through the orders table.

No RLS policy is weakened, no delete path is added, and the original schema stays
untouched. `create_order` keeps `require_role`, numbering locks, item snapshots,
`add_order_payment` and audit. Quotes write no orders, payments or audit records.
Checkout stays disabled until the required privacy column is present.
No Edge Function deployment is needed. Regenerate public database types after
both migrations are applied.

### Saving and recovery

The cart sends item/variant IDs, quantities and extra IDs; menu prices, line totals,
subtotal, discount, total and amount due come from the database. Percent discounts
are computed from the same priced snapshot as the saved items. A changed quote
is refused and refreshed for review. Each save uses an independent request UUID.
Repeating it returns the same order without posting any payment twice; changed
content cannot reuse a completed request.

Drafts and pending requests are saved per staff user in that browser tab's
sessionStorage. If an RPC response is lost, keep the page or reload it, then
press Retry save; the original request is retained. A definite database error
confirms rollback and allows editing. If local storage is unavailable, the app
asks staff to keep the page open until confirmation. Saved confirmation reads
orders, stored order_items and v_order_payments; it never uses a live menu price.

Foreign payments use entered amount received and lira covered. Guidance shows
the latest Admin-set default dated no later than the business day, with its date.
An absent rate says Not set; no exchange rate is guessed. Defaults are managed
in M5. The confirmed implied rate is stored by the existing payment function.

### M3 verification and phone checks

The required suite now has **140 database checks**: the previous 102 unchanged
assertions plus 38 quote/discount/payment/retry/privacy checks. Browser tests use
intercepted API responses; database scenario tests exercise the real functions
in a disposable local database. Hosted end-to-end behavior needs phone review.

On the same Wi-Fi, use the Network URL printed by Vite and sign in as Operations
(and verify Admin can take orders too). Walk through each M3 Done when item:

- Time a three-item order; target under 15 seconds on the phone.
- At seeded prices: 2 × BBQ Burger + 1 × Jollof Rice + Chicken is ₺1,220. The
  Chicken is included in that rice product's price; do not add another Chicken
  extra. Vegetable Soup + Swallow + Fish is ₺580 when Fish is ₺180. If you changed
  Fish to ₺200 during M2 review, that soup total correctly becomes ₺600.
- Cash ₺780 plus Naira ₦15,000 covering ₺410 leaves ₺30 due, both before saving
  and in the saved confirmation. Confirm the daily order number and business date.
- Try adding more than is due and verify the database's message appears.
- Fish can be ordered alone from Extras. Deactivate a test item/variant/category
  and confirm it disappears; earlier confirmations retain their stored snapshot.

Also test delivery address validation, a percent discount with a reason, a dollar
payment, and Save as unpaid after drafting a payment (confirmation must show no
received money). Logistics must be denied `/order` and `/order/pay`. The orders
board, subsequent payments, cancellation and delivery status changes remain M4.

Do not commit or push M3 until the user replies approved after review.

## M4 — orders board and deliveries

Operations/Admin use `/orders`: today by database business date, status counts,
search, channel/account/date filters, snapshot details, next-status actions,
payments, cancellation and text receipt sharing. Logistics/Admin use `/deliveries`
for ready and picked-up delivery orders across business days, oldest ready first.
Both refresh every 15 seconds. Supporting layouts: `docs/BOARD_DESIGN.md`.

### Manual Supabase step

Run the complete `supabase/migrations/005_m4_order_support.sql` once after 004.
It was applied successfully to project `lnolchqycicixjikolfi` during M4 and hosted
database types were regenerated. No Edge Function deployment is needed.

Logistics cannot read order ledger rows under the existing RLS. Consequently the
invoker `v_order_payments` by itself cannot give Logistics true due amounts. The
role-checked `list_delivery_orders` RPC exposes only active delivery snapshots and
their server-read paid/due totals; it exposes no ledger, account names or request
metadata and changes no existing policy. It includes Ready and Picked up orders,
including those from prior days, and excludes completed/cancelled/non-delivery work.

The original four-argument `add_order_payment` remains compatible with M3. Its new
five-argument overload adds a per-staff request UUID, validates amounts and delegates
to the original guarded function. Retry metadata contains an opaque hash and the
returned ledger ID in an RLS-protected table with no client read/write policy.
Same request/payload returns the same entry; changed payload is refused. A trigger
audits every newly inserted order payment exactly once, including M3 payments.

Saved-order payments are immediate individual RPCs. A request is stored in the
tab's session storage before sending; blocked storage prevents sending. If a
response is uncertain, the same request can be confirmed after reload. Do not
create a fresh payment instead. Saved payments cannot be removed from the sheet.
Status/cancellation requests refetch on success or error so a lost response is
reconciled against the database. Admin voids refund original account-currency
amounts and the balance confirmation reads `v_account_balances`.

### Verification and phone acceptance

Run typecheck, lint, unit tests and `./scripts/db-test.sh`. The suite retains all
140 prior checks and adds 26 M4 checks (166 total). Browser checks use simulated
sign-in and a REST bridge to actual RPCs/RLS in an isolated local PostgreSQL
database; they never create hosted financial records. They cover lost-response
payment retry after reload, role actions, true Logistics due without ledger access,
search/filters, receipt preview/link, completed-order refunds and phone widths.

On your phone, using Admin-created Operations and Logistics test logins:

1. Create a delivery order. Operations: New → Cooking → Ready. Logistics:
   Picked up → Delivered. Confirm it leaves Deliveries and is Completed on Orders.
2. A paid/partly paid order offers no cancellation for Operations. Admin can void
   it (including after completion), enter a reason and see the original-account
   refund reflected in the balance confirmation. No duplicate refund is possible.
3. A partly paid order shows the same due on the board, details, receipt preview
   and Logistics board; adding payment updates due. A cancelled order is labelled
   Cancelled and its receipt does not request payment.

Also try search, date/channel/account filters, the customer Call button and the
WhatsApp sharing preview. Confirm deactivated menu items still appear with their
original prices on old order cards/details (the remaining M2 phone check).

No M4 commit/push until the user approves these checks.
