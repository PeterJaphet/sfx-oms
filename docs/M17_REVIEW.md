# M17 — reporting, order pricing and desktop review

Prepared on 20 October 2026 on `codex/reporting-pricing-desktop`.
The owner reported migration 015 succeeded on 20 October 2026 and authorized the
matching frontend release. Deployment results are recorded in the release chat.
WhatsApp remains paused and unmerged.

## Requested corrections

| Request | Implementation and evidence |
| --- | --- |
| SFx receives TL | Admin reviews and creates a new SFx TRY account using a guarded RPC. Old USD-labelled ledger entries and pending settlements remain untouched; new orders cannot choose the legacy account. The new account starts at zero, with no guessed balance conversion. |
| 10 Turkey instead of 4 | Combined Extras shows standalone plus on-plate units. Added Turkey breakdown with business date, order number, source and quantity. Local fixture and SQL prove 4 + 6 = 10; actual production records have not been queried or altered. |
| Net profit using order calculations | Range dashboard uses recipe estimates rather than purchase-based P&L. Complete saved estimates stay immutable. Missing/incomplete estimates reconstruct from current recipes, as approved, without posting money. Unknown recipes stay unknown, with affected names and orders shown. Purchase-based P&L is separately labelled. |
| Turkey cost | Owner supplied TRY 250 total per portion. Migration creates a missing Turkey recipe using that combined total, with no invented ingredient breakdown. Existing Turkey recipes are not overwritten; review any existing recipe in Costing. Published menu prices are not changed. |
| Staff discount | One-click 20% discount on review; SQL calculates the amount and keeps the reason. Replaces rather than stacks with an existing order discount. |
| Edit price during order entry | Optional unit-price override and required reason in item editing for Admin/Operations. SQL validates precision/bounds, calculates totals/profit and stores original menu unit price/reason. Extras stay independently charged; the menu is unchanged. Legacy save RPC rejects overrides without the current audit path. |
| Admin desktop and modern UI | Persistent grouped sidebar from 1024px, compact header/date controls, clear recipe KPI hierarchy and wide chart/table workspace. Phone role navigation and 44px controls retained. Admin opens to This month; Today remains available and shown separately. |
| Performance | Staff screen lazy-loaded; historical records and per-order calculations are deferred. In a 121-order local fixture, recipe summary payload was 261 bytes versus 24753 bytes including order detail (~99% smaller for that portion). Main JS reduced from 541.32 kB to about 536.8 kB; existing size warning remains. These are local measurements, not a live latency claim. |

## Verification

- Typecheck, lint, 314 unit tests and all 718 database checks passed.
- Production build passed; existing bundle-size/dependency annotation warnings remain.
- Local Chrome at 360, 390, 430, 1280 and 1536px: no horizontal page overflow or page errors.
- Browser flow used real local authenticated SQL functions: SFx transition, custom unit
  price 350 on a menu item priced 400, staff discount to 280, acceptance, then one TRY
  receipt on delivery. Original menu price and override reason persisted.
- Local fixtures verify 4 standalone + 6 on-plate Turkey units; per-order audit reconciles.
- SQL checks cover old snapshot preservation, current-recipe reconstruction, overhead
  deduction, no profit-report ledger writes, anonymous/Logistics restrictions, no guessed
  opening balance, safe currency transition retries and unchanged historical entries.
- The isolated browser API used dummy configuration and intercepted all business requests
  into disposable local PostgreSQL. No hosted business data was read or written.
- Physical phone acceptance and live count reconciliation remain owner checks after rollout.

## Rollout — owner applies database changes

1. Take a fresh backup and keep its second copy off this Mac.
2. Apply only `supabase/migrations/015_reporting_pricing.sql` in the project's SQL editor.
   It follows 014. Do not apply the paused WhatsApp migration as part of this release.
3. Report success, then release the matching frontend from this branch after approval.
4. As Admin, use **Review SFx transition** on Dashboard. Review its old entry count,
   recorded USD balance/TRY value and pending orders; select **Create SFx TL account**.
   The old account remains labelled `SFx (legacy USD; review)`; refunds and pending
   settlements retain their original currency. Reconcile it against the real wallet before
   entering any reasoned correction or opening on the new TL account. Do not copy a USD
   number into a TL balance or assume recorded TRY value proves actual money held.
5. In Costing confirm Turkey total cost is 250. If a Turkey recipe already exists,
   the migration intentionally leaves it intact; review/update it through the normal UI.
6. Select This month and reconcile Turkey's order list with your records. The new report
   does not fabricate six additional order rows. Supply any other missing recipe costs
   shown before treating the full-range profit as complete.
