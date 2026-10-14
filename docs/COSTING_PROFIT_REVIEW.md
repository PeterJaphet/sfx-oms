# M14 — Costing and order profit review

Plan approved with “go” on 14 October 2026. The user approved M14 for commit and push on 14 October 2026. Individual phone-check results have not been recorded.

Review preview: https://m14-review.sfx-oms.pages.dev/login

Verified build: https://bf544f45.sfx-oms.pages.dev/login

## Manual Supabase step

The user confirmed applying `supabase/migrations/012_costing_profit.sql` after 011 in project
`lnolchqycicixjikolfi` on 14 October 2026. Read-only hosted type generation verified all four M14
tables and ten app RPC declarations. No Edge Function, storage or secret setup is needed.
Existing menu prices and older orders are not changed by the migration.

After applying it, Admin opens Costing and taps **Load workbook starting values**. This loads missing
recipes only; it does not overwrite edits or publish any prices. Review the supplied yields, costs and
placeholder weekly volumes. Enter the absent extras, Chips, Congolese Shawarma and additional variants.
Do not use test/demo ingredient costs for real products. Apply price is a separate explicit action.

## What changed

- Database-only recipe/pricing previews and workbook model. Admin can change ingredient rows, packaging,
  operational cost, yield, multiplier, rounding and planned batches, plus monthly USD rent/payroll,
  planning exchange rate, weekly fixed costs and FX scenarios. Corrected six text amounts with the user's
  approval; weekly totals and conversions calculate from inputs rather than cached/hardcoded cells.
- Price publication retains existing audit/history and extra/standalone synchronization. Recipe edits
  retain every saved version. The Admin editor is linked from Menu, Reports and workspace tools.
- Immediate Revenue / Est. gross profit / Est. net profit in the fixed order bar, full breakdown in
  order/cart, checkout, saved confirmation and internal details. Missing costing never becomes zero.
- Net estimates allocate fixed overhead in proportion to order revenue using the editable weekly forecast.
  Forecast sales follow the workbook's unrounded batch prices; published menu prices are shown separately.
  Actual P&L still uses recorded expenses; no extra ledger entries or duplicated expense recognition.
- Separate permanent order-profit snapshots. New saves require reviewed price and cost tokens; failures
  roll back the whole order/payment transaction. Original order RPCs, old pending payloads, roles/RLS,
  deletion bans, exact extra counts, closed-day guards and financial/report calculations remain intact.
- Customer name/phone and order type visible inline, required delivery address; unfinished delivery
  drafts survive reload, and incomplete delivery cannot proceed to checkout/save. Customer data is
  passed to the original order function; customer receipts and Logistics omit costs and profits.
- Forecast P&L exports reuse the branded CSV/PDF exporters; supporting design references and PRD updated.

## Required checks

| Command | Result |
| --- | --- |
| `npm run typecheck` | Passed, including final build's typecheck |
| `npm run lint` | Passed, zero warnings |
| `npm test` | 306 tests passed in 13 files |
| `./scripts/db-test.sh` | All 628 checks passed on throwaway local PostgreSQL |
| `npm run build` | Passed; existing main-bundle warning remains |

Database types for the new tables/functions were generated from the migrated local fixture; existing
production declarations were preserved. Hosted type regeneration confirmed equivalent M14 declarations
after accounting for generator differences in JSON nullability metadata and no-argument functions.

## Full-flow evidence

The browser used isolated local PostgreSQL with real authenticated-role RPCs and RLS. Every Supabase
business request was intercepted into that fixture; no hosted orders, money or costs were written.

Admin loaded presets, changed Classic Shawarma's multiplier to 2.5, saw the database's ₺560 suggestion,
saved its cost without changing its ₺370 live fixture price, then applied ₺560. Admin added a test-only
Swallow recipe, changed planning rent/rate and exported forecast CSV/PDF. The one-page PDF was rendered
and inspected with intact branding, currency symbols, values and a clear forecast label.

Operations entered customer/name/address, added 2 soups and 4 total Swallow, reloaded with an unfinished
delivery draft and retained its items/name. After filling the address, the exact ₺900 quote had ₺359
recipe COGS, ₺541 gross profit, ₺8 recipe overhead and the database's fixed allocation/net estimate.
A simulated lost paid-save response followed by reload/retry produced one order, one ₺900 payment and
one original profit snapshot. Internal details retained it; receipt text contained the customer/items
and omitted costs/profit. Operations could not open the Admin costing route.

All three costing sections and the fixed order profit bar were checked at 360/390/430/1280px without
page overflow; profit and Charge stay visible while the menu scrolls. Two simultaneous SQL retries
also produced one order and one snapshot. The 106 new database checks cover numeric boundaries,
forecasts, stale edits, price history/sync, missing costs, discounts/losses, rollback of paid saves,
historical estimates, cancellation, closed days, role isolation, immutability and zero-volume plans.

## Done when — item by item

1. **Admin inputs and workbook load:** Browser/database passed. **Phone:** load starting values; open/edit a recipe and review its ingredients, yield and weekly volume.
2. **Suggested price vs Apply price:** Passed. **Phone:** change a multiplier, save costing and verify the menu price stays unchanged; use Apply price and inspect price history. This changes a live price, so choose the intended final value.
3. **Workbook planning and exports:** Passed. **Phone:** edit weekly assumptions, check production/P&L/break-even/scenarios, select a Monday for actual overhead comparison and open CSV/PDF exports.
4. **Immediate complete/incomplete profit:** Passed. **Phone:** select food and scroll; verify all three fixed-bar figures stay visible, then inspect checkout/confirmation/internal details. Include an uncosted item to see the named missing costs.
5. **Exact extras, discounts and cancellation:** Database/browser passed, including 2 soups + 4 total extras, zero revenue and preserved cancellation history.
6. **History, retries and financial/security guards:** All local regression, role and simultaneous-retry checks passed. Older requests retain their original RPC and no historical costs are invented.
7. **Visible customer and delivery flow:** Passed. **Phone:** enter name/phone/address, reload an unfinished draft, finish/save and confirm the details reach the receipt and delivery flow. Missing delivery address must prevent checkout/save.
8. **Commands and original guards:** All required checks passed. Original schema.sql, earlier migrations, financial/report formulas and dependency manifests are unchanged. Hosted migration was confirmed by the user and verified. Phone checks remain manual.

Phone checks completed by / date: ____________________
Supabase 012 applied / confirmed: User confirmation and hosted type verification, 14 October 2026
M14 commit/push approved by / date: user / 14 October 2026

An optional formatting cleanup was rejected by automatic approval review because restoring files
from HEAD could overwrite uncommitted edits. It was not executed; all current M14 changes were retained.
