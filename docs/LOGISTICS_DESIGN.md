# M6 — Logistics purchases and advances

Follows LogPurchase.dc.html and the dark advances card in Deliveries.dc.html, using the existing
brand tokens, Button, Input and Sheet. Supporting layouts were approved in the M6 plan. The user
explicitly chose optional receipt photos and optional credit due dates. Currency display continues
to omit decimals for whole amounts and show two for fractions.

## Purchase entry

Log supplies uses a narrow phone form with funding choices: My advance (Admin: An advance), From
an account, and On credit. The advance dropdown shows open advances with purpose, own-currency
remaining and recipient for Admin. Account funding shows active accounts and an editable foreign
rate with its dated latest default. Credit uses TRY and an optional due date.

Supplier accepts free text and suggestions from the last 100 purchases visible to the caller.
Category chips wrap and have 44px touch targets. Add item opens a sheet for description, quantity,
unit and total line amount; quantities allow three decimals, money two. Draft lines can be edited
or removed before saving. Zero-value lines are allowed, but the server requires a positive total.
No line amount is multiplied by quantity: it is the entered cost of the whole line.

An optional receipt input accepts JPG/PNG/WebP. Existing M5 image preparation uploads an immutable
private JPEG under <staff UUID>/<database business date>/<image UUID>.jpg. A note is optional.
The sticky action bar shows the database total, foreign TRY value/rate and funding left after the
purchase. Overspend on an open advance displays the amount owed to staff. Save sends item amounts,
funding IDs and the reviewed quote token; the database computes and saves totals atomically.

## Advances and returned change

Deliveries shows the caller's oldest active advance and View my advances (Admin: View all advances).
Cards use ink backgrounds, Given / Spent / You hold values, an amber Log supplies action and Return
change. They also show recipient, source account, business date, age, returned change and any
reimbursement. A negative remaining balance is labelled Owed to staff; it is never offered as
returnable change. Reimbursement remains the existing Admin database operation, outside M6 UI.

My advances shows all active assigned advances; Admin sees all staff. Accounted for is a paginated
history, 50 at a time. Return change opens a sheet with a matching-currency active account and
amount. Its server preview shows remaining after return. A fully accounted advance moves into
history, retaining its original purchase and change records.

## Purchase history and confirmation

Purchase history is available from Log supplies and My advances, 50 at a time. Logistics sees only
purchases they logged; Admin sees all. Cards show supplier, category, funding, staff, business date
and own-currency amount. Details show permanent item lines, TRY value, recorded rate, note and
receipt. Credit details confirm the supplier debt ID and due date (or no due date), without opening
the general debts list. Reversed purchases remain labelled and retain their original receipt.

## Recovery and privacy

Deliveries, purchase entry/history and advances share a per-user/tab request provider. A request
UUID and payload are saved before sending. Uncertain responses retain the request after reload;
Retry Logistics confirmation reuses it. Other Logistics writes are disabled until confirmation.
Definite database errors appear verbatim and permit editing. Storage failure prevents sending.

Read functions return correct own-advance totals, including purchases Admin logged against that
advance, without exposing those purchase details. Logistics cannot see another staff member's
advances, purchases, item lines or receipt photos. Operations cannot open the Logistics pages or
call their write functions. No existing RLS policy or role guard is weakened.
