# SFx Burger OMS — instructions for the AI builder

Internal order and money management app for SFx Burger, a food business in Famagusta, North Cyprus.
Staff record every order, every lira taken out and every supply bought; the app produces the reports.
Three roles: **operations** (takes orders, takes money out), **logistics** (deliveries, buys supplies),
**admin** (everything). About 5 users, a few hundred orders a week, used mostly on phones.

Read before starting any milestone:
- `docs/PRD.md` — what to build and why (requirement IDs like O-4, M-2, D-3)
- `docs/BUILD_PLAN.md` — the milestone you are on, its scope and its "done when" checks
- `docs/DESIGN.md` — colours, type, spacing, components, which design file each screen follows
- `docs/screens/*.dc.html` — the approved screen designs (HTML reference; copy layout and copy, not the markup)
- `supabase/schema.sql` — tables, the money rules and every function the app calls

## Stack (do not change without asking)

React 18 + TypeScript + Vite · Tailwind CSS + shadcn/ui · TanStack Query · supabase-js v2 ·
React Hook Form + Zod · Recharts · vite-plugin-pwa · React Router · Supabase (Postgres, Auth, Storage,
Edge Functions) · hosted on Cloudflare Pages.

## Non-negotiable rules

1. **Money and orders are written only through database functions** (`supabase.rpc(...)`):
   `create_order`, `add_order_payment`, `set_order_status`, `cancel_order`, `create_withdrawal`,
   `decide_withdrawal`, `log_purchase`, `return_change`, `settle_advance_overspend`, `record_debt`,
   `settle_debt`, `cancel_debt`, `close_day`, `transfer_between_accounts`, `adjust_balance`,
   `reverse_entry`, `reverse_purchase`, `set_fx_rate`.
   Never `.insert()`, `.update()` or `.delete()` on orders, order_items, ledger_entries, withdrawals,
   purchases, debts, debt_settlements, day_closes or activity_log. The database refuses it anyway.
2. **Never compute money totals in the browser for saving.** Prices come from the database; the client
   only sends item ids, quantities and extras. Show the totals the functions return.
3. **Reports read the views**: `v_account_balances`, `v_order_payments`, `v_advances`, `v_debts`,
   `v_items_sold_daily`, `v_extras_sold_daily`, `v_sales_daily`, `v_payments_daily`, `v_expenses`,
   `v_pnl_daily`, `v_pnl_weekly`, and the functions `report_pnl(from, to)`, `report_items_sold(from, to)`.
   Do not re-implement report maths in TypeScript.
4. **Do not edit `supabase/schema.sql`.** Database changes go in a new file
   `supabase/migrations/NNN_short_name.sql`, with matching checks added to
   `supabase/tests/10_scenario.sql`. Never loosen a row-level-security policy, never drop a
   `require_role` check, never add a delete path.
5. **Run the database checks after any database change**: `./scripts/db-test.sh` must print
   "All N database checks passed". If a check fails, fix the change, not the check — unless the PRD
   changed and the person you are working for confirms the new expected value.
6. **No secrets in the frontend.** Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` go in the app.
   The service-role key is used only inside Edge Functions. `.env` is git-ignored.
7. **Show database error messages as they are.** The functions raise plain-English messages
   ("Not enough money in this account (balance 1250.00)"); put them in a toast, don't replace them.
8. **Build only what the current milestone asks for.** If the PRD is unclear or a design is missing,
   stop and ask instead of inventing a feature.

## Conventions

- Folders: `src/features/<area>/` (menu, orders, logistics, money, debts, close, reports, admin, auth),
  shared UI in `src/components/`, `src/lib/supabase.ts`, `src/lib/format.ts`, generated types in
  `src/lib/db.types.ts` (`npx supabase gen types typescript --project-id <id> > src/lib/db.types.ts`).
- Money display: `formatMoney(amount, currency)` in `src/lib/format.ts` → `₺1,220`, `$85.00`, `₦15,000`.
  Lira shows no decimals when whole; dollars always 2 decimals; Naira no decimals.
- Dates: business day runs 06:00–05:59 Europe/Nicosia. Use the database's `business_date` column; never
  derive the business day from the browser clock.
- Routing by role after login: operations → `/order`, logistics → `/deliveries`, admin → `/dashboard`.
  Hide what a role cannot do, but remember the database is the real guard.
- Every screen works at 360–430 px wide first; admin pages also at 1280 px.
- Touch targets at least 44 px. Real `<button>`, `<label>`, `<input>`. Text contrast 4.5:1.
- Data fetching through TanStack Query; invalidate the affected queries after each successful RPC.
- Keep components small; no global state library unless a milestone needs one.

## Commands

| Task | Command |
| --- | --- |
| Dev server | `npm run dev` |
| Type check | `npm run typecheck` (`tsc --noEmit`) |
| Lint | `npm run lint` |
| Unit tests | `npm test` (Vitest) |
| Database checks | `PGURL=postgres://postgres@localhost:5432/postgres ./scripts/db-test.sh` |
| Regenerate DB types | `npx supabase gen types typescript --project-id <id> > src/lib/db.types.ts` |

Before saying a milestone is done: typecheck, lint, unit tests and database checks all pass, and the
milestone's "done when" list in `docs/BUILD_PLAN.md` is walked through and reported item by item.
