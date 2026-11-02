# Confirmed balances and account cleanup

Owner approved preserving all transactions recorded after the Go live counts.
Source amounts are the existing immutable account_openings records; no amounts
were read from hosted Supabase or supplied/invented by the agent.

## Installation and owner application

1. Owner runs `supabase/migrations/025_go_live_current_balances.sql` in project
   `lnolchqycicixjikolfi`, then confirms success. Installation alone does not
   reconcile balances, retire accounts or enter a Redot amount. Migration 023's
   separate cache repair is not a dependency.
2. Release frontend branch `codex/go-live-current-balances` after confirmation.
3. Admin → Go live → Use confirmed balances. Review each saved count, correction
   and projected current balance, and the list of accounts to retire. Press
   Apply confirmed balances & account changes. If pending orders, withdrawals or
   open advances exist on retiring accounts, resolve those obligations first.
4. RedotPay now appears in TRY. Enter its actual TL amount using Set RedotPay
   opening. No USD-to-TL conversion or balance is invented. Existing active TRY
   Redot is reused rather than duplicated.
5. Verify current balances in Go live, Money and Dashboard. Later sales/spending
   continue normally; do not rerun opening entry to erase those later movements.

## Money rules and recovery

Legacy nonzero counts are anchored at their immutable opening ledger entry. The
correction is minus the net ledger movement preceding that entry, preserving all
subsequent entries. Legacy zero counts without an entry use their recorded time.
Reversed opening entries are refused. Preview includes current balances and
obligation counts; intervening changes force a fresh review. All account row/day
locks precede mutation, and Admin historical closed-day writes stay audited.

Each account has one immutable reconciliation receipt. Retrying an applied token
returns its saved result; a fresh preview cannot correct the same count again.
New openings directly post only target minus current balance and immediately
record that receipt. Zero may need a negative correction if money was already
recorded; it creates no entry only when the current balance is already zero.

Retirement means inactive, not deleted. Historical ledger, currencies, orders,
withdrawals, debts, snapshots and historical account reports remain intact.
Current balance views and account pickers exclude inactive accounts. Redot's old
USD record is retained under a legacy name; the new account has currency TRY.
Adjustments/openings do not become revenue, COGS or operating expenses.

Local verification: 958 database checks; typecheck, lint, 317 unit tests and build;
SQL-backed browser reconciles a legacy additive count while preserving a later
movement, archives legacy/Crypto, creates Redot TL, records 300 TL and confirms
consistent Money balances at 360/390/430/1280 widths. Fake amounts only; these are
not claimed hosted balances.
