# SFx Burger OMS — build plan for an AI coding agent

Twelve milestones, each small enough for one working session. For each: paste the prompt into your
AI coding agent (for example Claude Code, opened in this folder), let it plan, read its plan, let it
build, then walk the "Done when" list yourself on a real phone. Commit after every milestone.

The database (schema, money rules, permissions, 42 checks) is already built and tested. The agent
builds the app on top of it and must not weaken it (see `CLAUDE.md`).

## How to run each session

1. Start a fresh session per milestone. First message: the milestone's prompt below.
2. Ask for a plan before code ("Plan first, then wait for my go-ahead"). Correct the plan, not the code.
3. When it says it is done, ask it to show typecheck, lint, unit tests and `./scripts/db-test.sh` output.
4. Test the "Done when" list yourself, logged in as each role it mentions. Report what fails, in
   plain words, in the same session.
5. Commit with a message naming the milestone (`M3: order screen and payment`).
6. Red flags to refuse: edits to `supabase/schema.sql`, removed or weakened checks in
   `supabase/tests/`, `.insert()`/`.update()` on money tables, the service-role key in `src/`.

## Before M0 (you, about 30 minutes)

- [ ] Node.js 20+ and Git installed; a GitHub repo for this folder.
- [ ] A Supabase project (region Frankfurt). Note the project URL, anon key and project id.
- [ ] Supabase → Authentication → Providers → Email: turn off "Confirm email"
      (staff sign in with phone + PIN; see M1).
- [ ] A local Postgres for the database checks: Postgres 16 installed, or Docker
      (`docker run -d -p 5432:5432 -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16`).
- [ ] A Cloudflare account (for M11).

---

## M0 — Project setup

**Prompt**
> Read CLAUDE.md, docs/PRD.md and docs/BUILD_PLAN.md. We are on M0. Scaffold the React + TypeScript +
> Vite app in this folder (keep supabase/, docs/ and scripts/ as they are), add Tailwind, shadcn/ui,
> TanStack Query, React Router, supabase-js, React Hook Form, Zod, Vitest and ESLint, and the npm
> scripts listed in CLAUDE.md. Add the colour tokens and fonts from docs/DESIGN.md. Create
> src/lib/supabase.ts reading VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, and src/lib/format.ts with
> formatMoney plus unit tests. Add .env.example and make sure .env is git-ignored. Then tell me exactly
> what to run in the Supabase SQL editor to load the database.

**You do:** run `supabase/schema.sql`, `supabase/seed.sql`, `supabase/storage.sql` in the SQL editor,
in that order. Put the URL and anon key in `.env`.

**Done when**
- [ ] `npm run dev` opens a page in brand colours with Archivo/Bricolage fonts.
- [ ] `npm run typecheck`, `npm run lint`, `npm test` pass; formatMoney tests cover ₺, $ and ₦.
- [ ] `./scripts/db-test.sh` prints "All 42 database checks passed".
- [ ] In Supabase, Table editor shows 10 menu items + 8 extras and 7 accounts.

## M1 — Sign-in, roles and app shell

**Prompt**
> M1. Staff sign in with phone number + 6-digit PIN. Implement it on Supabase email/password: the
> email is `<digits of phone>@staff.sfxburger.app` and the PIN is the password. Build: login screen;
> a Supabase Edge Function `admin-create-user` (checks the caller is an active admin via profiles,
> then uses the service-role key to create the auth user and the profiles row with name, phone and
> role); an admin Staff page to add, change role, reset PIN and deactivate staff; role-based routing
> and the phone layout with the bottom nav for each role from docs/DESIGN.md (pages can be empty
> placeholders). Sessions end after 12 hours. Tell me how to create the first admin by hand.

**Done when**
- [ ] You can log in as Admin, create an Operations and a Logistics user from the Staff page.
- [ ] Each role lands on its own home route with its own bottom nav; typing another role's URL shows
      "not available for your role".
- [ ] A deactivated user cannot log in.
- [ ] The service-role key appears nowhere under `src/`.

## M2 — Menu and extras

**Prompt**
> M2. Build the menu editor (PRD P-1 to P-6) for Operations and Admin: categories, products with
> variants and prices, extras with prices, which dishes each extra is allowed on, active/inactive,
> and price history per item. Extras that are sold on their own are products linked to an addon
> (products.addon_id); show them once, as extras, and edit their price in one place — the database
> keeps both prices in sync. Add CSV import for products. Writes to menu tables are allowed directly
> (RLS permits Operations and Admin). Nothing is ever deleted, only deactivated.

**Done when**
- [ ] Changing Fish from ₺180 to ₺200 shows ₺200 both as an extra and in the Extras tab; price
      history shows the change, who made it and when.
- [ ] Deactivated items disappear from the order screen but past orders still show them.
- [ ] Logistics cannot open the menu editor.

## M3 — New order and payment

**Prompt**
> M3. Build /order and /order/pay following docs/screens/Main.dc.html and Checkout.dc.html
> (PRD O-1 to O-4, O-7, O-8). Product grid by category with Extras tab; tapping a Rice & Soup dish
> opens a sheet to pick allowed extras and quantity; channel chips; order type (pickup, delivery
> with address, dine-in); discount with reason. Payment: choose accounts, split across several,
> for $ and ₦ accounts enter the amount received and how much of the bill it covers (show the
> implied rate and today's default). Save with create_order (items + payments in one call);
> "Save as unpaid" sends no payments. Show the daily order number returned.

**Done when**
- [ ] A 3-item order takes under 15 seconds on a phone.
- [ ] 2 × BBQ Burger + 1 × Jollof Rice + Chicken = ₺1,220; Vegetable Soup + Swallow + Fish = ₺580.
- [ ] Cash ₺780 + Naira ₦15,000 covering ₺410 leaves "₺30 due".
- [ ] Trying to pay more than is due shows the database's message.
- [ ] Fish can be ordered on its own from the Extras tab.

## M4 — Orders board and deliveries

**Prompt**
> M4. Build /orders (Orders.dc.html; PRD O-5, O-6, O-9) and /deliveries (Deliveries.dc.html;
> L-1, L-2). Status tabs with counts, order cards, the next-status button per role via
> set_order_status, add a payment to an unpaid order, cancel with reason via cancel_order (Admin
> voids paid orders, which refunds), search and filters, and a WhatsApp-shareable text receipt.
> Logistics sees ready delivery orders, calls the customer, marks Picked up and Delivered.
> Refresh the boards automatically every 15 seconds.

**Done when**
- [ ] An order moves New → Preparing → Ready on Operations, then Picked up → Completed on Logistics.
- [ ] Operations cannot cancel a paid order; Admin can, and the refund shows in the account balance.
- [ ] Unpaid orders show their amount due everywhere they appear.

## M5 — Money: accounts, withdrawals, approvals, rates

**Prompt**
> M5. Build the Money area (Withdraw.dc.html; PRD M-1 to M-5): account list with balances in own
> currency and ₺ estimate, last 20 entries per account; Take money out (advance to a staff member, or
> direct expense with category) via create_withdrawal, showing the balance after; Admin approvals
> queue (decide_withdrawal) with a badge count; Admin tools for transfers, adjustments, reversing an
> entry, and setting daily exchange rates for USD and NGN; settings for the approval limit.

**Done when**
- [ ] A ₺2,500 withdrawal by Operations waits for approval; balance changes only after Admin approves.
- [ ] Withdrawing more than an account holds is refused with the balance in the message.
- [ ] A direct expense appears under Expenses in the right category; an advance does not.

## M6 — Logistics purchases and advances

**Prompt**
> M6. Build /purchases/new (LogPurchase.dc.html; PRD L-3 to L-5) and "My advances": log supplies
> against my open advance, straight from an account, or on credit with a due date (log_purchase);
> item lines with quantity, unit and amount; category chips; receipt photo upload to the private
> receipts bucket at receipts/<my user id>/<date>/<uuid>.jpg; return change (return_change).
> Show Given / Spent / You hold for each open advance.

**Done when**
- [ ] Advance ₺1,000 → purchases ₺900 → return ₺100 shows the advance as accounted for.
- [ ] A purchase on credit creates a debt to that supplier.
- [ ] Logistics sees only their own advances, purchases and receipts.

## M7 — Debts and go-live setup

**Prompt**
> M7. Build /setup and /debts (Setup.dc.html; PRD D-1 to D-7). Go-live: one opening balance per
> account in its own currency (adjust_balance with p_opening = true), then opening debts both
> ways (record_debt with p_opening = true). Debts list: open first, overdue flagged, totals for
> "we owe" and "owed to us" in ₺, unpaid customer orders listed under "owed to us". Pay or collect
> with settle_debt (ask how much of the debt it clears when currencies differ), record loans with
> money moving, and Admin cancel with reason.

**Done when**
- [ ] A second opening balance on the same account is refused.
- [ ] Paying ₺1,500 of a ₺4,200 debt leaves ₺2,700 outstanding; the P&L does not change.
- [ ] A $100 loan into SFx raises the SFx balance by $100 and shows as a debt we owe.

## M8 — Daily close

**Prompt**
> M8. Build /close (DailyClose.dc.html; PRD C-1 to C-4): show how expected cash is made up (opening,
> cash payments, change returned, advances, cash expenses, debt payments and collections), enter
> counted cash, show the difference, list unpaid orders and open advances, note, then close_day.
> Admin can re-close a day; show the history of closes.

**Done when**
- [ ] The expected figure matches the Cash balance at that moment.
- [ ] Operations cannot close the same day twice; Admin can, and the earlier close is kept.

## M9 — Reports and dashboard

**Prompt**
> M9. Build /dashboard (Dashboard.dc.html) and the report pages in PRD "Reports and formulas",
> reading only the views and report functions. Default period: this week, Monday to Sunday; also
> today, month and custom. Weekly P&L laid out like the costing sheet. Items sold and extras sold
> (on a plate vs on its own). Expenses by category and kind. Balances, debts, advances, daily closes,
> logistics activity. CSV export on every table. Operations sees reports read-only.

**Done when**
- [ ] Net revenue, cost of goods, operational, fixed and net profit match `report_pnl` run in the
      SQL editor for the same dates.
- [ ] "How many BBQ Burgers last week" and "how many Swallow this month" are answered in two taps.

## M10 — Parallel run (2 weeks, you)

- [ ] Every order goes into the app and into the paper book.
- [ ] Each night compare the app's daily close and totals with the book; log every gap.
- [ ] Bring the gap list to an AI session: "M10 fixes: here is what didn't match".
- [ ] Done when two consecutive weeks match.

## M11 — Polish and go live

**Prompt**
> M11. Make the app installable (vite-plugin-pwa, SFx Burger icon and name), show a clear banner
> when offline and block saving until back online, add PDF export of the weekly P&L, and a Supabase
> Edge Function plus pg_cron schedule that sends the daily summary at 23:00 and the weekly summary on
> Mondays at 08:00 (Europe/Nicosia) by email. Set up deployment to Cloudflare Pages from main.

**Done when**
- [ ] Staff can install the app on their phones from the browser.
- [ ] Turning off Wi-Fi shows the offline banner and no order is half-saved.
- [ ] Supabase project upgraded to Pro (daily backups, no pausing) before real go-live.
- [ ] Go-live day: opening balances and debts entered from `/setup`; paper books retired.


## M12 — Extra quantities (approved adjustment)

**Scope**
- Give each allowed extra its own 0–999 quantity control inside the main dish sheet; zero removes it.
- Extra quantities are totals for the entire cart line: 2 vegetable soups + 4 swallow means 4 swallow total.
- Editing dish quantity keeps the entered extra counts. Repeated matching configurations add both counts.
- Quote, save, snapshots, receipts, delivery details and item/extra reports use the database's exact amounts and counts.
- Preserve historical orders, installed legacy clients and pending save payloads. Keep every existing role, RLS, no-delete, closed-day and retry guard.
- Apply `011_extra_quantities.sql` manually after `010`; no Edge Function or storage changes.

**Done when**
- [ ] On a phone, add 1 Vegetable Soup with 4 Swallow and another allowed extra; each count can be changed or removed independently.
- [ ] On a phone, change the dish quantity to 2: Swallow stays 4, and the displayed database total charges it once.
- [ ] On a phone, edit the cart, reload the draft, then save; checkout, confirmation, order details, receipt and Logistics show the entered counts.
- [ ] Item and extras reports count 2 soups / 4 swallow and include their exact revenue; cancellations exclude them.
- [ ] Historical data and legacy quotes remain unchanged; uncertain-save retries create one order/payment; cents remain exact.
- [ ] Typecheck, lint, unit tests and database checks pass; original schema and all financial/security guards remain intact.


## M13 — Brand refresh (approved adjustment)

**Scope**
- Apply the supplied SVG logos and approved League Spartan / Antic fonts across the app.
- Refresh shared theme, responsive header, navigation, cards, forms, sheets and status displays.
- Update favicon, install icons, offline font/brand caching and PDF report branding.
- Update design references and document original asset provenance. No Supabase changes.
- Preserve all existing routes, permissions, financial RPCs, calculations, snapshots and drafts.

**Done when**
- [ ] Supplied logo appears proportionally on login, desktop header, phone mark and installed app icon; review on a phone.
- [ ] Brand fonts and palette are consistent across order, menu, money, Logistics, debts, close, reports and staff screens at 360–430px and 1280px; review on a phone.
- [ ] Navigation and form controls fit, remain readable, retain 44px touch targets and accessible contrast; review on a phone.
- [ ] Extra counts, quotes, saves, permissions and financial values remain unchanged through the revised UI.
- [ ] Exported PDF reports contain the supplied logo, brand fonts, readable ₺/$/₦ and Turkish text, with no clipped headers or pagination.
- [ ] An installed app keeps its logo and fonts offline; saving remains blocked offline and drafts survive the update; check on a phone.
- [ ] Typecheck, lint, unit tests, database checks and build pass. Original database files and guards are untouched.


## M14 — Costing and order profit (approved adjustment)

**Scope**
- Admin-only recipe editor: ingredient costs, packaging, batch operational cost, yield, multiplier, rounding and planned weekly batches; link each dish variant or shared extra recipe.
- Load ten workbook recipes from the current input cells. Normalize six Classic Shawarma text costs with user approval; compute all dependent totals. No menu price or existing recipe is overwritten by loading presets.
- Database pricing previews; explicit Apply price publishes the suggestion through existing price history and extra synchronization.
- Weekly workbook model: production plan, ingredient budget, fixed overheads, monthly USD rent/payroll converted using 52 / 12 weeks, forecast P&L, break-even, actual operational comparison and editable FX scenarios. Forecast CSV/PDF export. Actual P&L remains based on recorded expenses.
- Revenue, estimated gross and net profit while ordering, checkout, confirmation and internal details. Fixed costs allocated by forecast revenue, as chosen by the user. Missing costs remain unavailable.
- Immutable order cost snapshots and private costing history. Historical orders and old pending requests retain their original behaviour. No costs in customer receipts or Logistics responses.
- Customer name/phone and order type visible in the order flow; required delivery address. Partial drafts survive reload; incomplete delivery cannot be submitted.
- Manually apply 012_costing_profit.sql after 011. No Edge Function or storage changes.

**Done when**
- [ ] Admin can load workbook starting values, edit individual ingredient costs, packaging, overhead, yields, multiplier, rounding and weekly volume; review on a phone.
- [ ] Suggested prices recalculate in the database; Save costing leaves prices alone and Apply price records history, including identical plate/standalone extra pricing; review on a phone.
- [ ] Weekly production totals, ingredient budget, fixed overheads, forecast P&L, break-even and rate scenarios recompute from inputs; actual-overhead comparisons use a matching Monday–Sunday week. CSV/PDF exports are labelled forecasts; review on a phone.
- [ ] Revenue and estimated gross/net profit appear in cart/order, checkout, confirmation and internal details. Missing dish/variant/extra costs and missing allocation denominator stay clearly unavailable; review on a phone.
- [ ] Two soups with four total extras cost four extras; discounts and zero-revenue orders retain exact costs and losses. Cancelled orders preserve but label their original estimate.
- [ ] Editing costs never rewrites an old order; stale new saves roll back, uncertain retries create one order/payment/snapshot, legacy pending requests still use the original RPC. Admin-only edits, private reads, no deletes and closed-day guards remain.
- [ ] Customer name, phone and delivery address survive draft reload and save; delivery address is required, receipt/delivery details show the customer but omit costs/profit; review on a phone.
- [ ] Typecheck, lint, unit tests, database checks and build pass. Original schema and financial/report rules are untouched.

## M16 — dated orders and simplified trading (approved 16 October 2026)

Scope: the owner's confirmed Delivery/Pickup, Accepted/Delivered, automatic selected-account
settlement, Admin earlier-order dates, daily snapshot-profit totals and reference-only PDF
history. M15 stays paused on its own branch. Migration 014 is independent of 013.

Done when:
- [x] Delivery is first/default; Pickup only other choice; date persists with drafts.
- [x] Earlier dates require Admin, future dates fail; dates drive daily numbering/sales.
- [x] Account selected at entry; foreign amounts explicit; Delivered atomically pays once.
- [x] Old requests/records retain original behaviour; closed days, role guards and no deletes pass.
- [x] Home totals aggregate daily saved estimates in SQL, exclude cancellations, expose missing costs.
- [x] June–September reference totals match PDF; no year/profit/transactions invented or balances changed.
- [x] Typecheck, lint, unit tests, database checks and production build pass.
- [ ] Phone layout/end-to-end local review completed; hosted migration and owner phone acceptance recorded.

Hosted rollout: owner takes a fresh backup, manually applies `014_simple_orders.sql`,
then approves production release. Do not apply the paused WhatsApp migration as part of this work.

## M17 — reporting, pricing and desktop refresh (20 October 2026)

- [x] Reviewed SFx TRY transition preserves historical USD entries and pending settlements.
- [x] Combined extras counts reconcile to an order-level breakdown (test 4 standalone + 6 on plates = 10).
- [x] Range recipe-profit totals use saved estimates or explicitly labelled current-recipe reconstruction; missing inputs remain unknown.
- [x] 20% staff discount and reasoned per-order unit-price overrides recalculate quotes/payments/profit in SQL.
- [x] Admin desktop sidebar/dashboard; mobile layouts/accessibility preserved; performance measured.
- [x] Typecheck, lint, 314 unit tests, 718 database checks, build and local browser checks pass.
- [ ] Hosted migration, SFx transition, actual count reconciliation and physical phone acceptance (owner).

## M18 — exchange-rate markup

Scope: Admin money rate sheet with source link, both quote directions, fixed 2%
customer surcharge calculated by SQL; foreign checkout amount calculated by SQL
from the actual order quote and latest saved default. No automatic source feed.

Done when:
- [x] Admin can preview and save USD and NGN rates with 2% customer surcharge.
- [x] Checkout offers the server-calculated amount and shows the default's date.
- [x] Existing settlements remain unchanged; no money is posted by previews.
- [x] Typecheck, lint, unit tests, build and local database checks pass.

Deployment: owner applies `supabase/migrations/016_exchange_rate_markup.sql`
manually before frontend deployment. No hosted database access by the agent.

## M19 — inventory expenses, calculation review and dashboard cleanup

Done when:
- [x] All 76 checklist items and seven groups loaded without inventing units, stock or costs.
- [x] Admin create/edit/delete (archive) and restore; roles, stale edits and history protected.
- [x] Purchase lines select catalogue items, record actual quantities/units/line totals and preserve snapshots.
- [x] Item expense totals reconcile to recorded TRY purchases across FX rounding; different units and unknown quantities remain distinct; reversed purchases excluded.
- [x] New Payroll is operational; old fixed classification retained on upgrade.
- [x] Revenue labels updated; SQL reconciliation checks and missing-cost behaviour verified.
- [x] Simplified desktop and phone overview; controls consolidated; full reports retain exports and reconciliation.
- [x] Typecheck, lint, 316 unit tests, 770 database checks, build and local browser scenarios pass.
- [ ] Owner applies migration 017, frontend deployed, live calculation results and physical-phone acceptance reviewed.

Local tests do not certify uninspected hosted data. Owner's no-hosted-database-access
restriction remains. Apply `supabase/migrations/017_inventory_expenses.sql` manually
before releasing the frontend. M15 WhatsApp stays paused and unmerged.

## M20 — purchase deletion and inventory selection

- [x] Admin purchase Delete action, reason and funding-impact confirmation.
- [x] Retry-safe account/advance/credit reversal; paid supplier debts protected; original records retained.
- [x] Deleted purchases hidden by default and available in history; affected reports/balances invalidated.
- [x] Prominent grouped inventory selection on Log supplies; prefilling appends correctly and line editing remains correct.
- [x] Typecheck, lint, 794 local database checks, 316 unit tests, build and SQL-backed browser checks pass.
- [ ] Owner applies migration 018, then frontend released and phone acceptance reviewed.

No hosted database execution by the agent. WhatsApp remains paused.
