# M7 — Debts and go-live setup

Uses Setup.dc.html, brand tokens, Button, Input and Sheet. Missing debt-list/detail, payment,
collection, loan and cancellation layouts use the existing brand components, as approved in the
M7 plan. User decisions: Operations may read/settle debts; payments above the existing limit ask
Admin to settle directly; zero openings complete setup without a zero ledger entry.

## Navigation and debt list

Money links to Debts. Operations and Admin can open it; Logistics is denied. Money remains the
active main navigation item on Debts/Setup. Admin has Go-live setup and Record debt / loan buttons.
Two summary cards show We owe and Owed to us in TRY; Owed to us includes unpaid customer orders.
Amounts come from the server. Unknown foreign rates are explicitly flagged as partial estimates.
Direction buttons wrap at phone widths; status defaults to Open, with search and 50-row pagination.
Cards show person, outstanding amount in its currency, description, direction/state and optional
due date. Overdue flags come from the database. Open records precede settled/cancelled records.

Unpaid customer orders appear beneath debts under All/Owed to us. They retain their order ID,
business date and due amount; they are not duplicated into the debts table. Tapping a card opens
that order's date and details in Orders, using the existing payment flow.

## Details, payment and collection

Details show original amount, settled/outstanding, business date, source, due date and money
history with account-currency amounts and debt-currency covers. Reversals remain visible. Pay debt
or Collect debt opens an inline form in the sheet: account, own-currency amount, optional note and,
when currencies differ, the amount of the debt cleared. The server previews remaining debt and
account balance. Operations sees the raw above-limit error and asks Admin to settle directly.

Admin cancellation requires a reason. Copy explains that earlier money movements and expenses
remain recorded, and cancellation does not refund a loan. Fresh details remain visible after a
settlement/cancellation removes the record from the currently filtered list.

## Recording debts and loans

Admin records a Debt / IOU with person, description, direction, amount, currency and optional due
date. It moves no money. Loan mode adds a matching-currency account and foreign rate/default.
We owe means loan money received by the business; Owed to us means money lent out. The server
preview shows the resulting account balance. Plain debts without a default rate can still be
recorded; their TRY estimate says rate not set.

## Go-live setup

Setup is Admin-only. Two desktop columns become one on a phone: Opening balances, then Outstanding
debts. Each active account shows current ledger balance and a Set opening button. Its sheet asks
for amount, reason and optional foreign rate, with a server preview of the resulting balance.
Each opening saves separately and permanently. Zero is supported without creating a zero ledger
entry; no rate is invented for an unused zero foreign balance. Recorded rows show amount/date and
disable a second opening. Existing ledger entries remain; the preview explicitly shows their effect.

After every active account has an opening record, Add opening debt is available. Opening debts
move no money. Finish setup returns to the dashboard after the Admin reviews outstanding debts;
this does not deploy the application or start M11. Later corrections use the existing adjustments.

## Recovery and source of truth

A per-user/tab request UUID and payload are stored before a write. Uncertain results retain the
same request after reload; Retry debt confirmation repeats it safely. Debt/setup writes pause
while a confirmation is pending. Complete matching confirmations are required for success.
Database messages are displayed verbatim. Previews, totals, dates, rates and outstanding amounts
come from database functions/views. Existing RLS and role guards stay intact.
