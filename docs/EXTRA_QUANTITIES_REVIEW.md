# M12 — Extra quantities review

Review preview: https://m12-review.sfx-oms.pages.dev/login
Immutable deployment: https://2c4ab252.sfx-oms.pages.dev/login

Migration `011_extra_quantities.sql` was applied manually to project `lnolchqycicixjikolfi` and confirmed by the user.
Hosted types were regenerated and include the new fields. The user approved M12 for commit and push on 2026-10-14. Individual phone check results have not been recorded; milestone approval alone does not document those checks.

## Verification

| Required command | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed, zero warnings |
| `npm test` | 286 tests passed in 12 files |
| `./scripts/db-test.sh` | All 522 database checks passed on the isolated local PostgreSQL server |
| `npm run build` | Passed; existing main bundle size warning remains |

The browser flow used real local PostgreSQL RPCs and RLS with test Auth identities, without writing hosted orders or money.
It checked widths 360, 390, 430 and 1280, independent extra controls and zero removal, invalid fractional counts,
draft reload/edit, checkout, exact snapshot amounts, confirmation, receipt, extras report and Logistics.
A deliberately lost save response followed by reload and retry produced exactly one order, one item and one payment.
No browser exceptions occurred.

An upgrade check applied 011 after existing local orders: original order/item snapshots, ledger entries and RLS policies
were identical, old generated charges stayed unchanged, and the legacy quote including its token was identical.
`supabase/schema.sql` was not edited. Role, no-delete, generated-total, snapshot consistency and closed-day checks passed.

## Done when — item by item

1. **Independent extras on a phone:** Browser verified; user phone check pending. Add 1 Vegetable Soup with 4 Swallow and
   another allowed extra. Change either count; set the second extra to 0 to remove it.
2. **Whole-line counts on a phone:** Browser and database verified; user phone check pending. Change soup quantity to 2:
   Swallow must stay 4. With the seeded prices (soup ₺350, swallow ₺50), the database quote is ₺900. Use current menu prices
   for a real order; the extra charge is added once.
3. **Reload and saved displays on a phone:** Browser verified; user phone check pending. Edit the cart, reload, then save;
   checkout, confirmation, order details, receipt and Logistics must retain the entered counts.
4. **Reports and cancellation:** Passed. The isolated saved example adds 2 soups / 4 swallow, ₺900 item revenue and ₺200
   extra revenue. Cancellations exclude the counts and refund the full charged amount.
5. **Compatibility, retries and cents:** Passed. Historical upgrade and legacy token checks passed. New and old pending
   payloads restore unchanged. Retry posts once. 3 dishes at ₺350.01 plus 2 extras at ₺50.01 save exactly ₺1,150.05.
6. **Required checks and guards:** Passed as listed above; schema.sql, security policies and guards preserved.

Phone checks completed by / date: ____________________
M12 commit/push approved by / date: user / 2026-10-14
