# M9 reports and dashboard

The dashboard follows Dashboard.dc.html: period controls, KPI cards, a daily revenue chart,
ranked items, expense categories, attention items, current debts and balances. The default is
this week, Monday through Sunday. Operations uses `/reports` for read-only reports; Admin uses
`/dashboard` and can follow links to existing approval, debt and close screens. No reporting
screen writes financial records. The report selector stays compact on phones, with visible
shortcuts for BBQ Burger last week and Swallow this month.

## Data and range semantics

Business dates and all date presets come from the database. Every table reads `get_report` and
all totals come from canonical views/report functions. P&L uses the existing `report_pnl` with its
net revenue, cost of goods, gross profit/margin, operational, fixed and net profit/margin sequence.
Missing margins remain unavailable; empty money totals display zero without changing that function.
Items use price snapshots and compare the same number of days immediately preceding the range.
Extras show on-plate, standalone and total quantities. Category totals have their own exportable
report. Item revenue is before order discounts; extras on plates are already in dish revenue.

Sales use order business dates and exclude cancelled orders. Payments by account use payment
business dates and the canonical payment/refund/reversal view, so money collected can differ
from accrued sales. Expenses use purchases (including credit) and approved direct expenses;
advances, returned change, transfers and debt money do not reduce profit. Supplier breakdowns
include purchases only. Staff breakdowns identify who logged/requested the expense.

Account movements include opening before the period, in, out and closing through its end, in each
account's currency. Inactive historical accounts are retained. Current dashboard balance/debt
estimates use the views' latest default rates and explicitly flag missing rates.
Daily close history includes superseded records. Logistics purchases and advances filter their
recorded business dates; advance state is current. Delivery history uses the order business date,
with pickup/completion timestamps and durations; times display in Europe/Nicosia.

Debts, unpaid customer balances and outstanding Advances use the user-approved current scope.
They show Outstanding now, hide the period controls and retain the user's date choice for switching
back to other reports. Their filenames and PDF headers say Outstanding now. The server explicitly
returns current scope and date metadata even if a caller submits an older range. Debts show totals
each way and missing-rate warnings; customer balances have their own total. No retrospective values
are invented.

## Layout and exports

Phone KPIs use two columns and desktop uses four. Desktop charts/tables and the attention sidebar
use the reference's two-column arrangement. Wide report tables scroll within their card, keeping
the page within the viewport. Table headers, labelled inputs and buttons are real semantic HTML.
Controls use existing shadcn/Tailwind components, colours, typography and 44px touch targets.
Matching item counts and expense-kind totals are returned by the server and displayed above tables.

Every report table has CSV/PDF controls. Screen pages show up to 100 rows; exports request every
matching row in a single stable database snapshot and check completeness before downloading.
CSV files have a UTF-8 BOM, proper quote/newline escaping, raw numeric amounts and formula-neutralized
user text. PDF exports use A4 portrait/landscape as needed, bundled licensed Archivo, repeated table
headers, wrapped cells, generation time, row count and page numbers. Whole currency amounts omit
decimals; fractions use two. Libraries/font load only when PDF export is requested.

## Scope changes approved in this chat

Supporting report layouts and both CSV/PDF exports are included in M9. WhatsApp setup and automatic
delivery are deferred until after the project at the user's request. No notification migrations,
secrets, schedules or messaging Edge Functions have been created during M9.
