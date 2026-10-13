# M5 — Money supporting designs

Uses the approved Withdraw.dc.html layout, brand tokens and existing Button, Input and Sheet
components. The user approved the missing supporting layouts and requires a category for both
advances and direct expenses. Whole amounts omit decimals; fractions show two in every currency.

## Navigation and accounts

Money opens Accounts. Wrapped, 44px navigation links lead to Take money out, Withdrawals and
Expenses; Admin also sees Approvals with its live count and Admin tools. Accounts form a one-column
phone grid, two columns on tablet and three on desktop. Each card shows the own-currency balance,
foreign TRY estimate and dated default, then View last 20 entries. Opening a card shows a sheet
with the current balance and the newest 20 permanent entries, signed amounts, TRY values,
foreign recorded rates, business date, Cyprus time, reason and entry number. Admin can open a
reason form to reverse an eligible entry. Reversed entries remain visible.

## Take money out

A narrow phone form follows Withdraw.dc.html: advance/expense selector, seven account choices
with current balances, own-currency amount, purpose, required category, advance recipient and
optional receipt image. Only active accounts, categories and staff are offered. Foreign accounts
show the latest dated default and an editable rate. A server preview shows the balance after,
TRY value and recorded rate. Pending approvals show the unchanged balance and the balance if
approved. Advances explain that supplies become expenses when logged. The submit button shows
the amount or Request approval. Invalid or stale previews disable submission.

## History, approvals and Expenses

Withdrawal history uses status-filtered cards, 50 per page, with type, own-currency amount,
purpose, business date, source account, requester and status. A details sheet shows the category,
TRY value, recipient, decision note and private receipt preview. Admin approvals show pending
requests with Approve/Reject and an optional note. The badge and cards refresh every 15 seconds.
Expenses lists the latest 20 records directly from v_expenses, including category and kind.
Full period filters and reports follow in M9. Advances are absent until supplies are recorded.

## Admin forms

Admin tools uses four large buttons opening sheets. Transfer asks for source/destination and
amounts sent/received in their own currencies, plus an optional note; same-currency amounts must
match. Adjustment asks for a signed amount and reason, with a foreign rate/default when needed.
Reversal requires a reason and explains that an opposite entry is added; a transfer reversal
reverses the selected side only, matching the existing database behavior. Rate settings choose
USD/NGN and a positive rate with up to six decimals, dated by the database business day. Approval
settings show the TRY threshold or explicitly disable approval. Opening balances remain M7.

## Recovery, images and access

A request UUID and submitted values are saved per staff member in that browser tab before any
money write. An uncertain response keeps a prominent Retry money confirmation panel and pauses
other money writes. Reload retries the same request. Database error messages appear unchanged.
No browser calculation is sent as a money total; quote_withdrawal supplies the preview and token.

Receipts use the private receipts bucket and <staff UUID>/<business date>/<image UUID>.jpg.
JPG/PNG/WebP inputs up to 15MB are resized to 1600px maximum and JPEG-compressed below 5MB.
Signed previews expire after ten minutes and refresh after eight. Files are never overwritten or
deleted. Upload precedes the withdrawal; a failed save can leave an unreferenced private object.
Operations can use accounts/withdrawals/Expenses; Admin-only controls are hidden and routes gated.
Logistics is denied Money. Original database role checks and RLS remain the authority.
