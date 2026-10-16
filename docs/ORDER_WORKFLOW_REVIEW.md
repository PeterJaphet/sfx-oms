# M16 review — dated orders and simplified trading

Owner approved the workflow and confirmed selected-account automatic settlement,
recipe-snapshot daily profit totals and reference-only historical report on 16 October 2026.
Work branch: `codex/order-workflow-history`. WhatsApp remains paused and unmerged.

## Rollout

1. Review the local build and checks. Verify on a phone: delivery/pickup, earlier date,
   selected account, acceptance, delivered payment, retry, daily totals and reference history.
2. Take a fresh backup before database changes. Keep its second copy off this Mac.
3. The owner manually applies `supabase/migrations/014_simple_orders.sql` in Supabase.
   It works whether or not paused migration 013 was already applied; do not deploy WhatsApp.
4. Release the matching frontend after migration, with the owner's production approval.
   Existing clients can finish old pending requests. Old clients cannot skip automatic
   settlement on new workflow orders through the old status RPC.
5. Review opening balances before entering earlier paid orders: they increase balances.
   Use normal reasoned adjustments only after reconciling any overlap with opening balances.

The agent performed no hosted database writes or live payments. The owner reported
applying migration 014 on 16 October 2026 and authorized the matching frontend release.
The deployment result is recorded in the release chat.
The historical PDF year remains unspecified. This is a monthly reference record, not 509
invented order rows. Historical profit is unknown; no historical costs were supplied.

## Verification — 16 October 2026

| Done when | Result |
| --- | --- |
| Delivery first/default; Pickup only other new type | Passed; local browser and unit checks |
| Earlier dates, Admin guard, future-date rejection, daily date/number | Passed; SQL checks and dated entry through browser |
| Selected-account automatic payment, foreign currency, retries | Passed; real authenticated local RPCs; two overlapping delivery transactions produced one payment |
| Legacy requests/history, role/session/RLS/closed-day/no-delete guards | Existing regression checks pass; new flow rejects intermediate status/payment bypass and rolls back failed settlement |
| Daily accumulated recipe estimates; unknown costs not zero | SQL aggregate checked; daily cards visible on New order and Dashboard; local invalidation/polling verified |
| PDF historical reference only | June 16820/52, July 34820/87, August 78490/210, September 58932/160; payment mix totals 189062; Admin-only; year unspecified |
| Typecheck / lint / unit tests / database / build | Passed; 311 unit tests, 679 database checks; existing bundle-size warning |
| Screen review | Chrome at 360/390/430/1280px; no horizontal overflow or page errors. Acceptance → no payment → Delivered → one payment; earlier-date board navigation and Admin historical table tested |
| Hosted rollout and physical phone acceptance | Owner reported migration 014 applied on 16 October; frontend release authorized. Physical phone acceptance and hosted Realtime delivery remain pending |

Browser business API requests were intercepted to an isolated local PostgreSQL fixture,
with fake authentication and dummy Supabase configuration. No live orders, payments,
financial records or hosted database requests were used in these checks.
Database types for new declarations were generated from that local schema; existing
reviewed declarations were retained to avoid unrelated generator changes.
