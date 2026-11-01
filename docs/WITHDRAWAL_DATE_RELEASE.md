# Dated withdrawals — release steps

1. Owner runs `supabase/migrations/024_withdrawal_date.sql` in the SFx Supabase SQL
   Editor (project lnolchqycicixjikolfi). No hosted execution by the agent. Migration
   023 is a separate optional RPC-cache repair and is not required by migration 024.
2. Confirm success, then release `codex/withdrawal-date` frontend to production.
3. Take money out → Date money was taken out. Defaults to the database business day.
   Admin can choose an earlier day; Operations can enter the current day only.
4. Review the date/amount preview, then save. Check Withdrawals and actual expense
   reports for that day. Advances become expenses only through logged purchases.

The database validates and locks the effective day before account locks. Future
and Operations historical dates are rejected. Closed-day protections and Admin audit
remain. Approvals use the explicit recorded date/rate for new dated requests, with
no posting until approval. Legacy pending requests keep approval-day ledger behavior.
requested_at remains the actual entry timestamp; historical dates do not falsify it.
Idempotent replays preserve dates and post once. Already saved withdrawals are not
edited or moved by this migration. No money is posted by installing it.

Verification: 926 local database checks, 317 unit tests, typecheck/lint/build and
SQL-backed browser default/date-edit/save/ledger/report/history checks at widths
360/390/430/1280. Local data only; hosted results not inspected or changed.
