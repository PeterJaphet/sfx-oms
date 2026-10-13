# M10 — Parallel run

Status: the checklist was approved. On 13 October 2026, the user instructed us to continue
to M11 with the two-week parallel run deferred. No two-week matching result has been recorded.
The unchecked acceptance items below remain available for the later run.

Use this checklist alongside the paper book for two consecutive weeks. Preparing this document
does not demonstrate matching real-world totals.
The scope comes from [BUILD_PLAN.md](BUILD_PLAN.md#m10--parallel-run-2-weeks-you).

## Run details

| Field | Fill in before starting |
| --- | --- |
| First business date | |
| Person responsible for nightly comparison | |
| Operations staff | |
| Logistics staff | |
| Admin responsible for corrections | |
| Paper book / page references | |
| Folder for dated report exports and comparison evidence | |

Use the business date displayed in the app: 06:00–05:59 Europe/Nicosia. A sale after midnight
and before 06:00 belongs to the previous business date. Choose that exact date for both From
and To in reports; keep the same date in the paper book and this log.

At the start, record the existing account balances, unpaid orders, debts and advances alongside
the paper book. Identify any earlier training records or known differences so they do not become
unexplained gaps. Account openings are recorded once: `/setup` does not reset balances or erase
training records. Bring a baseline discrepancy here for review before changing balances.

## During trading — each order and money movement

- [ ] Enter every order in both the app and paper book at the point of sale. Write the business
  date and app order number in the book so the records can be matched.
- [ ] Match items, quantities, extras on a dish versus sold alone, channel, order type, discount
  and reason. Old orders retain their original prices when the menu changes.
- [ ] Record each payment's account and amount in that account's currency. For USD/NGN, also
  record the TRY amount it covers. Include split payments and later payments on unpaid orders.
- [ ] Record cancellations and refunds in both places, preserving the original order reference.
- [ ] Record withdrawals, approvals, direct expenses, advances, purchases, credit purchases,
  returned change, debt settlements, transfers and corrections in both places as they occur.
  Reference the app record in the book; pending approvals have not moved money yet.
- [ ] If confirmation is interrupted, use the app's retry confirmation in the same tab after
  reload. Check the resulting record before entering a replacement; log any uncertain result.

## Nightly comparison — repeat for each business date

1. **Finish financial entry before closing.** Confirm all orders and money movements for the
   comparison have been entered. Ask staff to pause financial entry while counting and comparing.
   Closing blocks non-Admin financial writes until the next business day begins at 06:00;
   delivery/status actions can continue. If trading must continue, complete the final close after
   those financial entries are finished.
2. **Match orders and sales.** Open Orders for the business date and Reports with From = To = that
   date. Clear search filters when comparing the whole day. Match order references, cancellations,
   quantities, gross sales, discounts and net revenue to the book. Include unpaid sales; exclude
   cancelled sales. Check item counts and extras on plates versus sold alone separately.
3. **Match payments separately.** Compare Payments by account with payments/refunds recorded in
   the book on this business date, including later collections against older orders. Compare
   TRY, USD and NGN amounts in their own currencies, plus recorded TRY coverage where relevant.
   Net revenue and money received may differ because an order is unpaid or paid on a later day.
4. **Match expenses and profit.** Compare Expense entries and the P&L's Net revenue, Cost of goods,
   Operational, Fixed and Net profit for the same date. Logged purchases, including credit
   purchases, count as expenses; advances, change returns, transfers and debt settlements do not
   create a second expense. Cost of goods means bought during the period, not ingredients used.
5. **Match account movements.** Compare each account's Opening, In, Out and Closing in Account
   movements against the paper ledger, in that account's own currency. Include refunds, transfers,
   loans, debt payments/collections and corrections. Keep foreign balances separate from their
   current TRY estimates; estimates can change when Admin changes the default exchange rate.
6. **Review outstanding amounts.** Match unpaid customer orders, supplier/other debts and staff
   advances against the book as of the comparison time. Debts, Customer balances due and Advances
   reports are explicitly **Outstanding now**, not historical date snapshots. Save a dated export
   and record its time. For advances, compare Given, Spent, Returned and remaining cash or amount
   owed to staff. An unpaid order or open advance does not itself prevent closing.
7. **Count and close.** Open Close day. Match Expected to Cash in Money at the same moment and to
   the book's expected cash. Count the actual till; enter that count, review the difference and
   add a note for discrepancies. Save once, confirm the saved close and record its reference/time.
   Closing records the difference; it does not adjust the ledger to make cash balance.
8. **Save evidence and log every gap.** Keep the relevant CSV/PDF reports, paper page references
   and saved close details. Record both numbers and their currency for each mismatch. A cash
   Short/Over figure and an app-versus-book mismatch are separate observations: compare and
   record both. Sign the daily row only after all comparisons have been reviewed.

If Admin changes financial records after close, keep the original comparison and close evidence,
record the correction, and compare again. Admin can re-close when needed; the earlier close stays
in history. Use the normal correction/reversal actions with reasons rather than deleting records
or editing permanent financial rows.

## Daily comparison record

Add more rows if needed until two consecutive weeks match. In the match column, write Yes only
when the order, sales, payment, expense, account and close comparisons agree with the book.
List all gap IDs otherwise. Keep the detailed amounts and references in the gap log below.

| Day | Business date | Book pages / exports | App expected Cash (TRY) | Book expected Cash (TRY) | Counted Cash (TRY) | Saved close difference (TRY) | Match / gap IDs | Reviewed by / time |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | | | | | | | | |
| 2 | | | | | | | | |
| 3 | | | | | | | | |
| 4 | | | | | | | | |
| 5 | | | | | | | | |
| 6 | | | | | | | | |
| 7 | | | | | | | | |
| 8 | | | | | | | | |
| 9 | | | | | | | | |
| 10 | | | | | | | | |
| 11 | | | | | | | | |
| 12 | | | | | | | | |
| 13 | | | | | | | | |
| 14 | | | | | | | | |

## Gap log — copy this block for every mismatch

```text
Gap ID:
Business date and comparison time (Europe/Nicosia):
Reporter and role:
Screen/report, exact From/To dates and any search/filter:
App order number or withdrawal/purchase/debt/close reference:
Paper book page/reference:
What happened (steps, including any interruption or retry):
Expected from the book (amount/quantity and currency):
Actual in the app (amount/quantity and currency):
Cash counted, if relevant:
Exact error message, if any:
Evidence file references:
Status: Open / Investigating / Fixed / Verified
Correction/fix reference and explanation:
Retest steps and result:
Verified by and time:
```

Keep customer details out of shared screenshots where they are unnecessary. Never include PINs,
access tokens, keys or `.env` contents. Preserve the original gap evidence after a correction.

Bring the log to this chat with:

```text
M10 fixes: here is what didn't match.
[Paste the gap blocks, comparison dates and relevant evidence.]
```

## End-of-week review

- [ ] Compare a seven-business-date custom range in Sales, P&L, Items, Extras, Expenses,
  Payments and Account movements with the same seven dates in the book; clear search filters.
- [ ] Check the nightly rows and verify every gap's correction against its evidence. Outstanding
  now exports retain their own capture times; do not treat them as past-week snapshots.
- [ ] Record the reviewed date range, reviewer and remaining gap IDs below.

| Review | From business date | To business date | Result / remaining gap IDs | Reviewer / time |
| --- | --- | --- | --- | --- |
| Week 1 | | | | |
| Week 2 | | | | |

## M10 acceptance — completed by you on real phones

- [ ] Every order in the reviewed period is in both the app and paper book.
- [ ] Every night's daily close and totals have been compared, with every gap logged.
- [ ] Gap lists have been brought here for fixes and those fixes have been verified.
- [ ] Two consecutive weeks match, supported by the daily rows and weekly reviews.

Matching date range: ____________________ to ____________________

Approved by / date: __________________________________________________

M10 needs no new Supabase SQL, Edge Function deployment or app feature. Follow-up fixes will be
scoped from actual gaps. By the user's sequencing override, we may propose M11 now; its app changes
still require an approved plan before building. WhatsApp and scheduled report delivery remain
deferred until after the project, as requested.
