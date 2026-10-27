# SFx Burger OMS — Product Requirements

Exported 12 Oct 2026 from the shared PRD. The PRD in Claude is the master copy; re-export when it changes.

## Overview

SFx Burger OMS is a web app where staff record every order, every lira taken out and every supply bought, so sales, revenue, spending and profit come out as reports instead of manual book reviews.

**Problems today**

| Problem | Effect |
| --- | --- |
| No item-level sales records | We cannot say how many chicken meals (or any item) sold last week or this year |
| No revenue view | Monthly gross revenue and net profit need a manual pass through the books |
| No spending view | Spend on foodstuff and supplies is unknown without a deep book review |
| No live balances | We cannot see what each payment account (Cash, İşbank, Koop, SFx, etc.) holds right now |

**Goals for version 1**

- Every order is entered at the point of sale, with items, channel and payment account.
- Every withdrawal states its purpose and reduces the balance of the account it came from.
- Every supply purchase is logged with amount, category and a receipt photo.
- Daily, weekly and monthly reports are generated automatically: items sold, revenue, expenses, gross and net profit, account balances.

**Success measures (first 60 days live)**

- 100% of orders entered: the daily close shows a cash difference under ₺100 on at least 90% of days.
- Every withdrawal of the month is fully accounted for (receipts plus change returned) by month end.
- The monthly report is produced in under 1 minute, with no manual calculation.

**Out of scope for version 1:** ingredient-level stock and recipe costing, kitchen display screen, table service, customer accounts and loyalty, delivery-app integrations.

## Users, roles and permissions

Three roles; each staff member has one login and one role, and every action is stamped with who did it.

| Capability | Operations | Logistics | Admin |
| --- | --- | --- | --- |
| Add and edit menu products and prices | Yes (logged, Admin notified) | No | Yes |
| Take orders, update order status | Yes | No | Yes |
| Mark order picked up / delivered | No | Yes | Yes |
| View orders that are ready | Yes | Yes | Yes |
| Cancel an unpaid order | Yes, with reason | No | Yes |
| Void or refund a paid order | No | No | Yes |
| Withdraw money from an account (with purpose) | Yes (over ₺2,000 needs approval) | No | Yes |
| Log supplies bought (amount, category, receipt), incl. on credit | No | Yes | Yes |
| Return change from an advance | No | Yes | Yes |
| Pay or collect a debt | Yes (payments over ₺2,000 need Admin) | No | Yes |
| View debts | Yes | No | Yes |
| Daily close (count cash) | Yes | No | Yes |
| View reports | Yes | Own purchases only | Yes |
| View logistics activity | Yes | Own only | Yes |
| Opening balances, record debts, transfers, adjustments | No | No | Yes |
| Manage users, accounts, categories, settings | No | No | Yes |
| View activity log | No | No | Yes |

**Guardrails on Operations' wider powers.** You chose to let Operations both set prices and withdraw money. The system supports that, with three controls:

- Every price change is kept as history and appears in Admin's activity feed; old orders keep the price they were sold at.
- Every withdrawal needs a purpose and category; it cannot be edited after saving, only reversed by Admin.
- Approval limit is on at launch at ₺2,000 (Admin can change it). Withdrawals and debt payments by Operations above it wait for Admin; the account must still hold the money.

**Suggested addition:** Logistics can mark ready orders as picked up and delivered, so the order record shows when food left the kitchen and when it arrived.

## Money model

Each payment method is an account with its own currency and a running balance; every lira in or out is one ledger entry, so balances are never typed by hand.

**Accounts**

| Account | Currency | Notes |
| --- | --- | --- |
| Cash | TRY | Till cash; counted at daily close |
| İşbank | TRY | Bank transfer / card |
| Koop | TRY | Bank transfer / card |
| SFx | TRY | SFx Money App wallet (corrected 20 October 2026) |
| RedotPay | USD |  |
| Crypto | USD | Stablecoins, tracked in dollars |
| Naira | NGN | Nigerian account, received into and spent from; always needs a rate |

**Ledger entry types**

| Type | Direction | Created by | Counts as expense? |
| --- | --- | --- | --- |
| Order payment | In | Order taker | No (revenue) |
| Refund | Out | Admin | Reduces revenue |
| Advance (cash out to a staff member to buy supplies) | Out | Operations, Admin | No, until spent |
| Direct expense (gas, transport, rent, payroll, etc.) | Out | Operations, Admin | Yes |
| Change returned from an advance | In | Logistics, Admin | No |
| Transfer between accounts (e.g. Cash deposited to İşbank, Naira converted) | Out of one, into another | Admin | No |
| Debt paid (we owe) or loan given | Out | Operations (up to the limit), Admin | No |
| Debt collected (owed to us) or loan received | In | Operations, Admin | No |
| Opening balance (once per account), adjustment | In or out | Admin, reason required | No |

**Rules**

1. Every withdrawal (advance or direct expense) records: source account, amount, purpose in words, category, who took it, and optional receipt photo.
2. Balance of an account = sum of its ledger entries in that account's currency. A withdrawal larger than the balance is blocked.
3. Supplies bought are logged by Logistics against an open advance (or paid straight from an account). Each purchase becomes an expense when logged.
4. An advance is closed when purchases + change returned = amount advanced. Its open balance shows on the dashboard until then. If purchases exceed the advance, the difference shows as owed to that staff member.
5. Nothing is deleted. Mistakes are reversed by an opposite entry with a reason, visible in the activity log.

Money flow: Customers pay into accounts. Withdrawals leave as a direct expense (counted as expense) or as an advance to staff (not an expense). Advances are spent on supplies (counted as expense when logged) or returned as change into an account.

Only the two highlighted boxes reduce profit; advances and returned change just move money between accounts and staff.

**Currencies and exchange rates**

- Reports are in TRY. Every entry stores its amount in the account's currency plus the TRY value and the rate used.
- For non-TRY payments, the order taker confirms the rate at payment time; the form pre-fills the last rate used for that currency, and Admin can update default rates daily.
- Dollar (RedotPay, Crypto) and Naira balances are shown in their own currency, with a TRY estimate at today's default rate. The starting dollar rate is 47.90 ₺/$, taken from the Weekly P&L tab.

**Go-live: start fresh, carry over balances and debts**

- No past sales or expenses are entered. On go-live day Admin enters one opening balance per account (each account accepts only one; later corrections are adjustments with a reason).
- Every outstanding debt is entered as an opening debt: who, what for, amount, currency, due date. Opening debts move no money and never count as revenue or expense.
- Paying or collecting a debt moves money between an account and the outside world, but is not an expense or revenue. That keeps the P&L clean: the cost of supplies bought before go-live belongs to the old books.
- After go-live, debts arise three ways: supplies bought on credit (the expense counts on the day of purchase; the supplier is owed), money borrowed (e.g. from a partner or staff member; the money lands in an account), or money lent.

## Functional requirements

Eight modules; each requirement has an ID so tickets can reference it.

### 1. Products (menu)

- **P-1** Create a product: name, category (Rice & Soup, Burgers, Shawarma, Extras), price in TRY, photo (optional), active/inactive.
- **P-2** Variants per product (e.g. Single / Double, Regular / Large), each with its own price.
- **P-3** Extras with prices (Fish, Turkey, Chicken, Shaki, Ponmo, Salad, Egg, Swallow), each allowed only on the dishes it is set up for, and also sold on its own from the Extras tab at the same price.
- **P-4** Price history kept on every change (old price, new price, who, when).
- **P-5** Products are never deleted, only deactivated, so past orders still report correctly.
- **P-6** Bulk import from CSV for the first menu upload.

### 2. Orders

- **O-1** New order screen built for speed: product grid by category, tap to add, quantity stepper, variants and add-ons in one sheet. Target: a 3-item order in under 15 seconds.
- **O-2** Order fields: channel (Walk-in, WhatsApp, Instagram, Phone, Delivery app, Event), order type (Pickup, Delivery, Dine-in), customer name and phone (optional), delivery address (if delivery), note.
- **O-3** Discount per order (amount or %), reason required.
- **O-4** Payment: one or more payments per order (split), each with account, amount and, for non-TRY accounts, the rate. Order is Paid when payments = total. Pay-later allowed (Unpaid until settled).
- **O-5** Status flow: New → Preparing → Ready → Picked up (delivery only) → Completed. Cancelled with reason at any point before Completed.
- **O-6** Orders list: today by default, filter by status, channel, account, date range; search by order number or customer.
- **O-7** Each order stores item prices at time of sale (snapshot).
- **O-8** Daily order numbers restart at #001 each day; a permanent ID is kept internally.
- **O-9** Shareable receipt (WhatsApp text or image) per order.

### 3. Logistics

- **L-1** Ready board: orders with status Ready, oldest first, with type, address, phone and payment status.
- **L-2** Mark Picked up and Delivered (timestamps recorded).
- **L-3** My advances: open advances assigned to me, with amount, spent, change returned, remaining.
- **L-4** Log a purchase: supplier (free text, remembered), items (description, quantity, unit, line amount), category (the costing sheet's split: ingredient and packaging categories, then operational costs such as gas, electricity, transport and cleaning), total, funding (an open advance, an account, or on credit with a due date), receipt photo.
- **L-5** Return change to an account, closing the advance when fully accounted.

### 4. Money

- **M-1** Accounts screen: balance per account in its currency, TRY estimate, last 20 entries.
- **M-2** Withdraw: type (Advance or Direct expense), account, amount, purpose (required), category, recipient (for advances), receipt photo (optional). Approval limit as in Roles.
- **M-3** Transfers between accounts with rate when currencies differ (Admin).
- **M-4** Opening balances (once per account, at go-live) and adjustments with reason (Admin).
- **M-5** Default exchange rates per currency, editable by Admin, dated.

### 5. Daily close

- **C-1** End of day: system shows expected Cash (opening + cash payments + change returned − cash withdrawals − cash refunds).
- **C-2** Staff enters counted cash; difference is saved with a note. Optional check of other account balances against bank apps.
- **C-3** Unpaid orders and open advances are listed before close can be submitted.
- **C-4** Closed days are locked; changes after close need Admin and are logged.

### 6. Reports

- **R-1** Dashboard with Today, This week, This month, and custom range.
- **R-2** Report types defined in the next section; all exportable to CSV and PDF.
- **R-3** Logistics activity: purchases, advances and deliveries by staff member.

### 7. Users and audit

- **U-1** Admin creates users with name, phone, role and PIN or password. Users can be deactivated.
- **U-2** Fast login on shared devices: 6-digit PIN after the device is signed in by Admin.
- **U-3** Activity log: every create, change, cancel, reversal, price change and login, with user and time.

### 8. Debts and go-live setup

- **D-1** Go-live screen (Admin): enter the opening balance for each of the 7 accounts in its own currency, then add each outstanding debt.
- **D-2** A debt records direction (we owe / owed to us), who, description, amount, currency (₺, $ or ₦) and an optional due date.
- **D-3** Pay or collect part or all of a debt from any account; when the account's currency differs from the debt's, staff enter how much of the debt the payment clears.
- **D-4** Loans: recording money borrowed or lent moves the money into or out of the chosen account at the same time.
- **D-5** Supplies bought on credit (L-4) create a debt to the supplier automatically.
- **D-6** Debts list: open debts first, overdue ones flagged, totals for "we owe" and "owed to us" in TRY. Admin can cancel a debt with a reason (write-off or correction).
- **D-7** Customer orders left unpaid stay on the order (balance due) and are listed alongside debts owed to us.

## Reports and formulas

Every report runs for any date range and uses TRY values; the default is the current week (Monday to Sunday), matching the costing sheet, since ingredients are bought weekly. Cancelled orders are excluded everywhere.

| Report | Answers | Contents |
| --- | --- | --- |
| Sales summary | How much did we sell? | Order count, gross sales, discounts, net revenue, average order value |
| Items sold | How many BBQ Burgers sold last week / this year? | Quantity and revenue per menu item, ranked; category totals; compare to previous period |
| Revenue by account | Where did the money land? | Payments per account, in account currency and TRY |
| Revenue by channel and hour | Where and when do orders come from? | Orders and revenue by channel, by order type, by hour of day, by weekday |
| Expenses | What did we spend on? | Spend by category (cost of goods, operational, fixed), by supplier, by staff member |
| Weekly P&L | Did we make money this week? | Same layout as the costing sheet's Weekly P&L: revenue, cost of goods, gross profit, operational costs, fixed overheads, net profit and margins, using actual numbers |
| Accounts | What do we hold? | Opening balance, in, out, closing balance per account |
| Debts | Who do we owe, who owes us? | Open debts by person, due dates, overdue flags, totals each way, unpaid customer orders |
| Advances | Is all cash out accounted for? | Open advances per staff member, age in days, amount still to account for |
| Daily closes | Is cash leaking? | Expected vs counted cash per day, differences, notes |
| Logistics activity | What did logistics do? | Purchases logged, advances, change returned, deliveries and delivery times |

**Formulas**

- Gross sales = sum of order totals before discount (paid and unpaid, not cancelled)
- Net revenue = gross sales − discounts (voided orders are already excluded)
- Cost of goods = ingredients + packaging bought in the period (including on credit)
- Gross profit = net revenue − cost of goods; gross margin = gross profit ÷ net revenue
- Operational costs = electricity, water, gas, transport (market runs and deliveries), cleaning supplies
- Fixed overheads = rent, payroll, marketing, phone and internet, equipment maintenance, licences, bank fees, miscellaneous
- Net profit = gross profit − operational costs − fixed overheads
- Debt payments, collections, loans, advances and transfers never enter the P&L

**Caveat:** cost of goods is "bought in the period", not "used in the period". A big stock-up in one week makes that week look worse. Ingredient-level stock tracking (phase 4) fixes this; until then, read monthly figures rather than daily ones for profit.

**Scheduled reports:** a daily summary sent to Admin each night at 23:00 and a weekly summary each Monday at 08:00 (WhatsApp or email).

## Menu and the costing sheet

The app launches with the printed SFx Burger menu: 10 dishes in 3 categories, plus 8 extras that can be added to rice and soup plates. Where the costing sheet has a matching recipe, its full cost per plate is shown for comparison.

| Item | Category | Menu price (₺) | Sheet cost per plate or unit (₺) | Margin after full cost |
| --- | --- | --- | --- | --- |
| Native Rice + Chicken | Rice & Soup | 450 | 163.5 (Village Rice) | 63.7% |
| Jollof Rice + Chicken | Rice & Soup | 420 | 148.2 | 64.7% |
| Vegetable Soup | Rice & Soup | 350 | 159.5 | 54.4% |
| Classic Burger | Burgers | 400 | 197.3 | 50.7% |
| BBQ Burger | Burgers | 400 | 198.8 | 50.3% |
| Zinger Burger | Burgers | 400 | 182.3 | 54.4% |
| Chips | Burgers | 50 | not costed | — |
| Classic Shawarma | Shawarma | 370 | 179.0 | 51.6% |
| Suya Shawarma | Shawarma | 400 | 195.5 | 51.1% |
| Congolese Shawarma | Shawarma | 400 | not costed | — |

| Extra | Price (₺) |
| --- | --- |
| Turkey | 300 |
| Fish | 180 |
| Chicken | 150 |
| Shaki | 70 |
| Ponmo | 70 |
| Salad | 70 |
| Egg | 50 |
| Swallow | 50 |

Sheet cost is the full batch cost (ingredients, packaging, overhead) divided by plates or units per batch; margin = (menu price − sheet cost) ÷ menu price. Extras can be added to rice and soup dishes (priced into the plate) or sold on their own from an Extras tab; both share one price, and the extras report counts them together and separately ("how many Swallow did we sell?"). Fried Rice and Egusi Soup are in the sheet but not on the menu, so they are not loaded; Admin can add them any time.

**How the app uses the sheet**

- Expense categories follow the sheet's split: cost of goods (ingredients + packaging), operational costs, fixed weekly overheads. The weekly P&L report uses the same layout, with actual figures in place of planned ones.
- Rent ($550) and payroll ($700) per month are billed in dollars. They are recorded as fixed overheads when paid, at that day's rate, so the lira risk shown in the sheet's section 6 appears in the real P&L.
- The recipes (ingredient lists per batch) are the starting point for ingredient-level stock tracking in phase 4.

**Things in the sheet to check**

- **The rice plates may be under-costed.** The sheet budgets ₺60 of chicken per batch of 5 Jollof plates (₺12 a plate), yet the menu sells extra chicken at ₺150 and the photos show a full piece on every plate. If each plate gets a piece, the real cost is well above ₺148 and the 64.7% margin is overstated. The same applies to Native Rice + Chicken.
- **Classic Shawarma is under-costed.** Shawarma bread, oil, sweet pepper, garlic powder, condensed milk and lemon sauce have no cost entered.
- **Chips at ₺50 and Congolese Shawarma have no costing.** Fast-food packaging alone is about ₺30 a unit in the sheet (₺120 per batch of 4); if chips use similar packaging, little is left.
- **Native Rice + Chicken uses the Village Rice costing (confirmed).** Its chicken cost has the same gap as Jollof's.
- **Sheet prices are out of date.** Jollof (₺300 → ₺420), Zinger (₺370 → ₺400) and Classic Shawarma (₺360 → ₺370) differ from the menu. The app uses the menu.
- **The per-batch overhead is about 4× actual spend** (₺1,600 a week actual vs ₺6,600 built in), and **weekly volumes are placeholders.** The app's weekly P&L will replace both with real figures.

## Non-functional requirements

The app must be fast on a phone, impossible to quietly falsify, and cheap to run.

| Area | Requirement |
| --- | --- |
| Devices | Mobile-first web app, installable on the home screen (PWA); works on phones, tablets and laptops |
| Speed | Screens load in under 2 seconds on 4G; order save in under 1 second |
| Connectivity | If the connection drops mid-order, the order is kept on the device and synced when back online (phase 2; version 1 shows a clear offline warning) |
| Integrity | No hard deletes; money and order records are append-only with reversals; database-level permission rules, not just hidden buttons |
| Security | Passwords and PINs hashed; sessions expire after 12 hours; Admin-only actions checked on the server |
| Backups | Automatic daily database backup, plus a weekly export Admin can download |
| Time zone | All dates in Europe/Nicosia (Famagusta local time); a business day runs 06:00 to 05:59 so late-night orders count for the right day |
| Language and currency | English UI; amounts in ₺ with 2 decimals; Naira and crypto shown in their own symbols |
| Brand | SFx Burger red #D7263D and amber #F4A300 on a clean light UI |
| Cost | Under US$30 per month to run at launch |

## Recommended stack

Use React (Vite) for the app and Supabase for everything server-side; no custom backend is needed, and it runs for about US$25 a month.

| Layer | Choice | Why |
| --- | --- | --- |
| Frontend | React + TypeScript + Vite | Your existing React skills; fast builds; a plain single-page app is all an internal tool needs |
| UI | Tailwind CSS + shadcn/ui | Ready-made, accessible components (sheets, dialogs, tables); brand colours set once |
| Data fetching | TanStack Query + supabase-js | Caching and retries for spotty mobile connections |
| Forms | React Hook Form + Zod | Validation shared across order, withdrawal and purchase forms |
| Charts | Recharts | Simple charts for the reports dashboard |
| Installable app | vite-plugin-pwa | Home-screen install on staff phones, offline shell |
| Database | Supabase Postgres | Relational data and SQL views make the reports straightforward; matches your Postgres background |
| Auth and roles | Supabase Auth + row-level security | Roles enforced in the database, not only in the UI |
| Receipt photos | Supabase Storage | Private bucket, linked to purchases and withdrawals |
| Server logic | Postgres functions (RPC) | Placing an order, withdrawing and closing the day run as single transactions |
| Scheduled reports | pg\_cron + one Supabase Edge Function | Nightly and weekly summaries to WhatsApp or email |
| Hosting | Cloudflare Pages | Free tier allows business use |

**Why not your usual NestJS + TypeORM + AWS stack?** It would work, but you would spend the first weeks building auth, file upload, permissions and deployment that Supabase gives you on day one. For about 5 users and a few hundred orders a day, that time is better spent on the order screen.

**Plans and cost (checked 12 Oct 2026)**

- Supabase Free works for building and testing. Free projects pause after 7 days of inactivity and have no daily backups, so move to Supabase Pro (US$25/month) at go-live ([Supabase pricing](https://supabase.com/pricing)).
- Avoid Vercel's free Hobby plan: its terms allow personal, non-commercial use only, and Pro is US$20 per user per month ([Vercel plan comparison](https://docs.it.apps.vogels.com/docs/vercel/reference/pricing)). Cloudflare Pages' free tier has no such restriction.

**Setup in five steps**

1. Create a Supabase project (region: Frankfurt, closest to Cyprus) and run `schema.sql` in the SQL editor.
2. Create the private storage bucket `receipts`; create the Admin user and set their role to admin.
3. `npm create vite@latest sfx-oms -- --template react-ts`, then add Tailwind, shadcn/ui, supabase-js and TanStack Query.
4. Put the Supabase URL and anon key in `.env`; generate types with `supabase gen types typescript`.
5. Connect the GitHub repo to Cloudflare Pages; every push to `main` deploys.

## Delivery plan, risks and open questions

An AI coding agent builds it milestone by milestone from the build kit (CLAUDE.md and docs/BUILD\_PLAN.md in the project folder), while you review and test each step: plan on 2–3 weeks part-time to version 1, then the 2-week parallel run.

| Phase | Build-kit milestones | Scope | Done when |
| --- | --- | --- | --- |
| 0. Setup | M0–M1 | Repo, Supabase project, schema, logins and roles, app shell, brand theme | Three test users log in and each sees only their own menu |
| 1. Core (version 1) | M2–M9 | Menu and extras, orders and payments, orders board and deliveries, money and approvals, logistics purchases, debts and go-live, daily close, reports | One full day of real orders runs through the app |
| 2. Parallel run | M10 | App and paper books side by side for 2 weeks; fix gaps; train staff | Two weeks where app totals match the books |
| 3. Polish | M11 | Installable app, offline warning, CSV/PDF export, nightly and weekly summaries, deploy | Paper books retired |
| 4. Later | — | Ingredient stock and recipe costing, kitchen display, table service, second location | When the restaurant opens |

**Working with an AI builder.** The business rules (money, roles, no deletions) already live in the database and are covered by 42 automated checks, so a mistake in AI-written screens cannot corrupt balances. What still needs a human: reviewing each milestone on a real phone with Increase and Musa, and refusing any change that loosens database permissions or edits schema.sql without the checks passing.

**Risks**

| Risk | Effect | Mitigation |
| --- | --- | --- |
| Orders not entered during rush hours | Every report understates sales | Fast order screen; daily close flags cash differences; Admin reviews close daily for the first month |
| Exchange rates guessed or wrong | Naira and dollar revenue misstated | Pre-filled daily default rates set by Admin; rate stored on each payment |
| Advances never accounted for | Spending is invisible again | Open advances shown on the dashboard with age; block new advances to a staff member with one older than 3 days |
| Operations sets prices and withdraws money | Room for error or misuse | Price history, activity log, approval limit, Admin review of the weekly report |
| Supabase Free project pauses | App unavailable | Upgrade to Pro before go-live |

**Open questions**

- [x] Corrected 20 October 2026: SFx receives TRY; RedotPay and Crypto hold USD. Existing USD-labelled SFx entries require reconciliation.
- [x] Approval limit is on at launch: ₺2,000 (change in settings).
- [x] Start fresh at go-live, with opening balances for all 7 accounts and every outstanding debt entered.
- [x] Menu and prices come from the printed menu; cost categories from the costing sheet.
- [x] Naira is kept in a Nigerian account that is received into and spent from.
- [x] Debts carry no interest or instalment schedules.
- [x] Native Rice + Chicken is the sheet's Village Rice.
- [x] Extras are sold on their own as well as added to a dish.
- [x] Built with an AI coding agent, following the build kit in the project folder.


### Approved order adjustment — 14 October 2026

Extras on a main dish have independent whole-number quantities, entered as totals for that order-item line.
For example, 2 Vegetable Soup with 4 Swallow contains 4 Swallow in total, not 4 per soup. Zero removes an extra;
each included extra and the dish count can be 1–999. Changing the dish count keeps extra counts unchanged.
Prices and full line totals come from the database. Receipts, delivery instructions and extras reports show the
total extra counts. Older orders retain their original per-dish extra pricing and quantities.


### Approved brand adjustment — 14 October 2026

Use the supplied SFx Burger logos and Mini Brand Identity Design throughout the app and PDF reports.
The user confirmed League Spartan headings, Antic body copy and the guide's main red/cream/charcoal
palette; conflicting Poppins/purple template references are excluded. Use original logo artwork
proportionally, its burger symbol in compact locations, and local fonts for offline availability.
All existing order, money, role and currency-display behaviour remains unchanged.


### Approved costing adjustment — 14 October 2026

M14 adds recipe costing now; ingredient stock tracking remains a later feature. Admin edits batch ingredient costs, packaging, operational overhead, yield, price multiplier, rounding and planned weekly batches. Each variant has its own recipe; an extra has one shared recipe whether added to a dish or sold standalone. Inputs are numbers, not currency text.

Suggested price = ceiling(((ingredients + packaging + overhead) × multiplier / yield) / rounding) × rounding. Rounding defaults to ₺10. Saving a recipe changes the suggestion; Apply price explicitly publishes it and keeps existing price history. Cost and planning changes are audited and cannot be deleted.

Order revenue is its actual total after discount, including unpaid orders. Estimated COGS is recipe ingredient/packaging cost divided by yield × each dish/extra's exact count. Gross estimate = revenue − COGS. Net estimate = gross − recipe operational overhead − allocated fixed overhead. Fixed overhead allocation is the same percentage of every order's revenue: planned weekly fixed overhead / planned weekly revenue. Costs are accumulated at database precision then order cost/overhead/allocation totals are rounded to cents. The snapshot saves the exact inputs and versions; later changes do not rewrite it. Cancelled orders retain a clearly labelled original estimate, not active sales.

Forecast revenue follows the workbook: unrounded batch selling price × planned batches. Published prices, rounding and discounts can differ from that forecast; both prices are displayed. Monthly USD fixed costs are converted with the editable planning rate and divided by 52 / 12. This rate does not change account/payment rates. All workbook totals, break-even and editable FX scenarios are database calculations. The overhead comparison reads actual operational expenses for a selected Monday–Sunday week. Forecasts do not post ledger entries or change actual P&L based on purchases/expenses; neither costs nor overheads are counted twice.

The workbook's numeric input cells are authoritative starting values rather than its conflicting notes. With user approval, six Classic Shawarma text costs are normalized (₺177 total), ingredients become ₺708, full batch cost ₺893, full unit cost ₺223.25 and the default suggested price ₺450. Hardcoded weekly totals and payroll conversions are replaced with calculations. Production volumes are placeholders for Admin to review. Fried Rice and Egusi recipes can remain unlinked planning recipes until linked to a menu variant; loading costing never creates menu products or publishes prices.

Extras, Chips, Congolese Shawarma and additional variants have no supplied recipe costs: Admin must enter them. Missing costs are not zero; revenue stays visible while incomplete profit remains unavailable. If planned revenue is zero and fixed overhead is positive, net profit is unavailable; an explicitly zero fixed overhead needs no allocation denominator.

Operations and Admin can view order estimates. Only Admin edits costing and opens its planning/editor/history screens. Logistics and customer receipts do not expose recipes or profits. Customer name/phone remain optional, visible directly on New order; a delivery address is required before checkout/save. Partial delivery drafts survive reload.

## M16 — dated orders and simplified trading (owner approved 16 October 2026)

This adjustment supersedes O-2/O-4/O-5 for new orders. Delivery is first/default;
Pickup is the only other type. New orders are Accepted, then Delivered. Cancellation
remains an audited correction, not a third trading stage. Older records and in-flight
legacy requests retain their original RPCs, payments and stored statuses.

Staff select the receiving account while entering an order. TRY payment uses the
server's full order total. Foreign-currency accounts require the amount to receive;
the server derives and stores the implied rate. Accepting posts no money. Marking
Delivered confirms receipt and atomically posts the selected payment and completion,
with idempotent retries. Logistics may confirm delivery only for Delivery orders,
using the immutable payment plan, without any general payment-editing permission.
Existing closed-day, active-role, RLS, refund and no-delete guards remain.

Order date defaults to the database business day (06:00 Europe/Nicosia). Admin may
enter earlier business dates, never future dates. Numbering and sales use that date.
Historical entries use current menu prices and saved current recipe estimates, clearly
warned in the form; no invented historical prices/costs. For an earlier entry, its
completion payment is posted on that historical date by Admin. Ordinary orders paid
on a later day retain the actual payment day. Review opening balances before entering
historical paid orders so old receipts are not counted twice.

Admin Dashboard and Operations New order show today's cumulative saved order revenue,
estimated gross profit and estimated net profit. Include accepted and delivered orders,
exclude cancellations; missing snapshots/costs make the corresponding profit unavailable.
The server aggregates snapshots. Realtime order events invalidate reads, with a 10-second
fallback and server business-day rollover. Existing purchase-based P&L stays separate.

The supplied DOC-20261016-WA0154.pdf is a reference-only summer review: June–September,
58 trading days, 509 orders and TRY 189062 revenue. Its year is unstated. Preserve its
monthly totals and payment mix in Admin historical records, separate from live reports,
ledger and order items. Do not invent individual transactions, dates, expenses or profit.
WhatsApp M15 remains paused and unmerged.

## M17 — reporting corrections, order pricing and desktop refresh (20 October 2026)

Owner confirms SFx receives TRY, not USD. Preserve all existing ledger entries and old
settlements; provide an Admin-reviewed transition to a new SFx TRY account, retaining
the old USD account for reconciliation. Never relabel or convert historical amounts silently.
Display combined extras counts (on plates plus standalone), with dated order-level evidence.
Dashboard profit uses saved recipe estimates; reconstruct missing/incomplete estimates
using current recipes as explicitly authorized, without changing snapshots or money.
Missing recipe inputs remain unknown, with the affected items named. Show purchase-based
P&L separately from estimates. Admin and Operations may override an item's unit price
for this order with a reason; no global menu change. Add a 20% staff discount shortcut.
Use the owner's supplied desktop screenshot as layout reference: desktop sidebar, restrained
header, KPI cards, chart and useful tables. Preserve SFx branding, mobile role navigation,
touch targets, accessibility and all existing authorisation guards. Reduce duplicate reads
and measure bundle/load changes; no new feature areas or WhatsApp work.

Turkey cost input confirmed by owner on 20 October 2026: TRY 250 total per portion. Store as a supplied combined cost, not an invented ingredients/packaging/operating breakdown. Never overwrite an existing recipe without review.

## M18 — customer exchange rates (21 October 2026)

Admin enters the current SFXchange conversion quote for NGN → TL or USD → TL,
explicitly choosing TL per foreign unit or foreign units per TL. Apply a fixed 2%
customer surcharge: foreign currency payable for the same TL bill increases by 2%.
The database computes the six-decimal TL-per-unit default; do not multiply that
default by 1.02. The public source feed requires signed requests, so this release
uses manual entry from https://www.sfxchange.co/rate, without copying its signing
credentials or claiming automatic refresh. Preview before saving through the
existing Admin money action. Checkout offers a server-calculated foreign amount
using that saved default, with its date; staff confirm before accepting. Existing
accepted orders and ledger records retain their saved amounts and implied rates.

## M19 — inventory expenses and dashboard clarity (owner requested 27 October 2026)

Use the supplied SFx Burger Inventory Checklist as a catalogue of 76 named items in
seven groups. Its quantity and notes columns are blank; do not invent stock, units,
prices or historical expenses. Admin creates/edits/removes catalogue items; removal
means deactivation and can be restored. Logistics reads the catalogue and logs its
purchases. Posted financial records are never deleted or overwritten.

Purchase lines optionally reference catalogue items, with server-validated active
ids and immutable name/group snapshots. Capture actual quantity, unit and total line
amount; never multiply a line total by quantity again. The database sums purchases.
Summarise expenses per item and unit in TRY at the purchase's stored FX rate. Allocate
rounding across lines so their TRY amounts sum to the recorded purchase total. Keep
unknown quantities unknown and different units separate. Reversals disappear from
expense totals while originals remain available. Unlinked historical purchase lines
stay visible; do not infer catalogue matches. This scope is purchasing attribution,
not on-hand stock tracking or automatic recipe-cost replacement.

New Payroll entries are operational expenses. Preserve old fixed Payroll entries and
pending requests by retiring the old category with its original kind and adding a
new operational category. Fresh databases seed Payroll as operational. This does
not change the independently configured recipe/planning payroll allocation.

Rename displayed Net revenue to Revenue, retaining the meaning (gross sales less
discounts) and the existing API keys. Keep recipe estimates distinct from actual
purchase-based P&L to avoid double-counting. Add Admin read-only reconciliation for
revenue, order arithmetic, completed payments, purchase lines, FX conversion, item
allocation, and recipe gross/net formulas. Missing recipe costs remain incomplete,
not zero. Existing data discrepancies are flagged for review, never silently fixed.

Simplify the overview to a four-card KPI row, revenue chart, five best sellers,
today's totals, recorded expenses and compact nonzero balances. Replace period
button groups with one selector; hide deeper audit/history/calculation controls
behind More financial details. Keep exports in full reports and mobile secondary
navigation behind one Workspace tools disclosure. No new stack or WhatsApp work.

## M20 — purchase deletion and visible inventory picking

Admin may delete a mistaken purchase through `reverse_purchase`, with a reason.
Delete means an audited, retry-safe reversal: remove it from expense and item-spend
reports; restore the recorded direct-account balance or advance remaining amount;
cancel unpaid supplier debt. Preserve original lines, receipt and ledger entries.
If supplier payments exist, refuse deletion until those payments are reversed.
The RPC remains Admin-only and retains financial-day locks and closed-day guards.
Hide deleted purchases by default; Show deleted purchases reveals their history.

Log supplies shows Choose from inventory directly in the Items section, followed
by Add selected inventory item. Open the existing quantity/unit/total-line-cost
sheet with that item's catalogue id/name/default unit. Adding a prefilled item
appends a new line; editing an existing line replaces only that line. Keep an
explicit Add other item path for purchases outside the catalogue. Never infer
quantities/costs or change menu/recipe prices from purchase entry.
