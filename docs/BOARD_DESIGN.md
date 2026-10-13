# M4 supporting designs

Approved supporting layouts for Orders.dc.html and Deliveries.dc.html. Use the
existing brand tokens, Archivo/Bricolage fonts, border-only cards and 44px targets.

- Orders: heading and current business day; server sales total for unfiltered today.
  Search plus Filters; New / Cooking / Ready / All segmented controls with counts.
  Cards retain the reference's order number, time/channel, snapshot item summary,
  type, total, payment badge and next-action button. All includes completed and
  cancelled orders. Mobile is one column; desktop two. Daily numbers include the
  business date in details/receipts so numbers from different days are distinct.
- Filters sheet: inclusive From / To business dates, channel and payment account.
  Inactive accounts remain available for historical filters. An account match means
  an order has a recorded payment into that account; cancelled/refunded orders
  remain in All for audit history. Search matches number, name or phone.
- Details sheet: saved items, variants, extras, notes and line totals; discount and
  total; payment/due badge; customer details; ledger payment/refund history. Actions
  open payment, cancellation or receipt content in the same sheet, with Back.
- Payment: account buttons and the existing M3 amount/received form. Each payment
  saves immediately, using the server RPC, not a draft-payment list. A pending
  confirmation disables more payment/cancellation/status writes on this board.
  The sheet explains how to close and confirm; the board offers Retry confirmation.
- Cancellation: reason required; paid orders explicitly say Void and refund and
  explain the original accounts. Admin can void completed orders, as approved.
  Operations only cancels orders with no payments and before completion. On success,
  a dismissible confirmation shows balances read from v_account_balances.
- Receipt: selectable plain-text preview with saved item lines, total, discount,
  customer/delivery details and paid/due status. Copy supports phone selection when
  the clipboard API is unavailable over HTTP. The staff member chooses WhatsApp's
  recipient and sends the message; the app only opens a sharing link.
- Deliveries: Ready orders heading; All / Ready / Out filters; oldest-ready first,
  including unfinished work from older business days. Cards show date/number,
  ready/out age, true paid/due badge, customer/address, items/note, Call and the
  next action (Picked up / Delivered). Missing phone is stated rather than linked.
  Completed orders leave this board. Advances and their actions wait for M6.

Both boards refetch every 15 seconds and on focus. Error messages are shown as
returned by the database. A cancelled order shows Cancelled rather than asking
for its original unpaid balance. Whole currency amounts omit decimals; fractions
show two. Admin can reach Deliveries from the header without changing the approved
five-item mobile bottom navigation.
