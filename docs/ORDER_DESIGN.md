# M3 order and checkout layouts

The user approved M3 with Main.dc.html and Checkout.dc.html, plus supporting sheets
for item selection, customer details, discounts and saved-order confirmation.
All layouts use DESIGN.md tokens, Archivo/Bricolage, bordered surfaces, no shadows,
and controls of at least 44px at 360–430px and desktop widths.

- New order: database business-date caption and staff name, channel chips, order
  details action, search, category chips including Extras, two-column product
  grid, red quantity badges and selected borders. Simple single-variant items
  add in one tap; configurable dishes open the item sheet. The daily number is
  assigned by the database at save and shown in confirmation.
- Item sheet: variant radios and database prices, allowed-extra checkboxes with
  prices, quantity stepper and optional item note. Cart review allows edits or
  removal of unsaved lines. Deactivated products/categories/variants/extras and
  disabled links are unavailable for new selections; a stale cart shows the
  database message for review.
- Details sheet: Pickup / Delivery / Dine-in; optional customer name/phone/note,
  delivery address required for Delivery.
- Sticky cart bar: item count, database quote total, Clear, Charge, above the
  existing role navigation on phones.
- Checkout: back arrow, channel/type caption, order summary, amount/percent
  discount sheet with reason, account grid, payment entry, added payment cards,
  database amount due. Dedicated bottom actions: Save as unpaid / Send to kitchen.
  A note explains that unpaid saving excludes already drafted payments.
- Foreign payments: staff enter lira covered and currency received. Display the
  implied rate and latest Admin-set default with its effective date (explicit
  user choice). Missing defaults say Not set; confirmed amounts still work.
  Rates retain up to six decimals; currency amounts omit decimals when whole
  and show two for fractions, per the user's rule.
- Confirmation: returned daily number, business date, stored item/extra snapshots,
  discount, total, amount received and amount due, customer/delivery details,
  New order action. It reads saved order rows and v_order_payments.
- Recovery: while confirmation is uncertain, keep the same save request and
  freeze draft changes. Retry save resumes it after a page reload. Success clears
  old errors and starts a fresh cart. No background saving or automatic sync.

Drafts and pending requests are held in sessionStorage per staff member in that
browser tab. Saved money values come from the database; the browser sends only
IDs, quantities, selected extras, entered discount/payment fields and an opaque
quote token. Exchange-rate arithmetic in the payment form is guidance only.
