# Daily close — M8 supporting layouts

The reconciliation form follows `screens/DailyClose.dc.html`: expected Cash card, a large counted
cash input, Short/Over/Balanced difference, before-close checks, note and close action. All figures
come from database previews. Whole currency amounts omit decimals; fractional amounts show two.
The form uses the existing brand colours, typography, 44px buttons, labelled fields and error copy.

The opening row carries the balance from earlier business days. An opening balance entered on
this day appears separately. Every ledger type has a labelled row, including refunds, debt money,
transfers, advance reimbursements and corrections. This keeps the complete expected amount visible.
Unpaid order cards open the order's business date and details. Advances list all currently open
amounts, including reimbursements owed to staff, in their own currency. They are review warnings;
the existing database permits closing with unpaid orders and advances outstanding.

Close history sits below the form on phones, and alongside it at desktop widths. Each record shows
date/account, expected/count/difference, staff/time, note and saved counts. Saved reconciliation
expands the exact breakdown and before-close lists captured then. Earlier records remain marked
Earlier close. Pre-M8 records retain their totals, with a notice that no breakdown was stored.
Admin can select a current history record to re-close that date; Today's close returns to today.
Money links to Close day for Admin; Operations retains its existing bottom navigation entry.

The close is saved with a request ID persisted before sending. If confirmation is interrupted,
Retry close confirmation resumes the same request after reload. New closes pause until that
confirmation completes. A stale preview asks the user to review the refreshed Cash amount.

After closing, a shared banner explains that financial changes need Admin until the next 06:00
business day. Non-Admin order save, payment/cancellation, withdrawal, purchase, returned change
and debt-settlement controls disable. Confirmed request retries remain available. Status changes
and delivery actions continue. Admin financial changes remain permitted and audited. The database
enforces this even when a different device has not refreshed its banner yet.
