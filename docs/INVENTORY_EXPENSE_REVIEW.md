# M19 review and rollout

Ready locally. Hosted migration and frontend release are pending owner confirmation.

## Included

The supplied inventory checklist contains 76 items in seven groups, with blank
quantities and no prices. The migration adds the catalogue only. No stock balances,
expenses or recipe costs are invented. Admin can create/edit/delete and restore
items; Delete removes an item from future selection and retains its history.

Log supplies → Add item now selects an inventory item and records actual quantity,
unit and total line amount. The database snapshots the catalogue name/group and
sums line amounts. Inventory shows per-item purchasing expenses for the selected
business dates in TL. It keeps different units separate and preserves unlinked
historical lines without guessing their catalogue association. Logistics sees its
own purchasing totals; Admin sees all purchases. Item expense totals cover purchase
lines, not payroll or other direct withdrawals. Use Money for non-stock expenses
and avoid recording the same receipt as both a direct expense and a purchase.

Payroll becomes an active operational category for new records. On an existing
installation, the old fixed category is renamed Payroll (legacy fixed) and retired;
its old expense classification and pending requests remain intact. A local upgrade
fixture confirmed both categories coexist with their correct kinds. Recipe-plan
payroll/fixed allocations remain independent estimates.

## Calculation review

- Revenue = gross order sales − discounts, excluding cancelled orders.
- Recipe gross profit = revenue − ingredient/packaging costs.
- Recipe net profit also deducts recipe operating costs and allocated fixed costs.
  Complete saved estimates remain immutable; incomplete records use the previously
  authorised reconstruction or stay unknown when inputs are missing.
- Actual purchase P&L is a separate accounting view: actual COGS, operational and
  fixed expenses are not deducted a second time from recipe estimates.
- Purchase amount means total line cost, not unit price. Quantity is not multiplied
  into an already totalled amount.
- FX amounts use the recorded purchase rate, not today's rate. Cumulative rounding
  allocates cents across lines so their TRY sum equals the recorded purchase total:
  three USD 0.01 lines at 1.5 TRY/USD produce TRY 0.05 total, not TRY 0.06.
- New read-only Calculation checks detect arithmetic, completed-payment, purchase,
  FX and recipe-summary discrepancies in the actual selected period. Missing recipe
  inputs report Incomplete. Checks validate recorded arithmetic; they cannot prove
  that every real-world purchase was entered or that supplied recipe costs are right.

No hosted records were read or modified by the agent. Live business values have not
been certified: review Calculation checks after release and supply missing cost inputs.

## Verification

- Typecheck, lint, 316 unit tests and production build pass.
- All 770 local database checks pass, including existing closed-day, idempotency,
  authorization, cancellation/refund and cost-snapshot checks.
- New checks cover catalogue count/groups, idempotent create, uniqueness, RLS,
  stale revisions, snapshot retention, archive/restore, invalid item/unit rejection,
  purchase totals, FX-cent allocation, reversed expense exclusion, operational
  payroll, arithmetic identities and role restrictions.
- SQL-backed browser testing with fake local data: catalogue create/edit/delete,
  actual linked purchase, exact line total, retained original name after catalogue
  rename, dashboard checks and four widths (360/390/430/1280). Desktop screenshot
  also inspected at 1536px. External/hosted API traffic was blocked.
- Existing build warnings remain: main bundle above 500 kB and Zod annotations.

## Rollout and acceptance

1. Owner applies `supabase/migrations/017_inventory_expenses.sql` in Supabase SQL
   Editor, then confirms success. Do not run the paused WhatsApp migration.
2. Publish frontend only after that confirmation.
3. Admin opens Inventory, checks the seven groups, and assigns default units where
   useful. No quantities were present in the supplied checklist.
4. Record the next real purchase once, with inventory links, correct quantities,
   units and total line amounts. Confirm Inventory matches its purchase receipt.
5. Use Money → Take money out → Direct expense → Payroll for actual payroll.
6. Dashboard → More financial details → Calculation checks: review each result for
   the live date range. Resolve missing costs or discrepancies through reviewed
   corrections; never rewrite historic ledger entries.
