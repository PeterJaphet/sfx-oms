# M20 purchase delete and inventory picker review

Owner reported successful application of migration 018 on 28 October 2026.
Frontend release authorised; deployment verified separately.

## Changes

- Log supplies → Items now shows Choose from inventory directly on the main form,
  grouped by the catalogue's seven groups. Add selected inventory item opens the
  quantity/unit/total-line-cost sheet already linked to that item. Multiple adds
  append new lines; editing updates only the selected line. Add other item remains.
- Admin opens Purchases → a purchase → Delete purchase, enters a reason and confirms
  its displayed supplier, amount and funding effect. Logistics has no delete action.
- Deleted purchases are excluded from the active list, actual expense reports and
  inventory purchase totals. Show deleted purchases reveals originals and receipts.
- Deletion invokes the existing reverse_purchase RPC. The updated function preserves
  active Admin checks, financial-day locks, closed-day audit guards and immutable
  financial history. Direct-account purchases get one recorded refund; advances get
  their remaining balance restored without inventing an account refund; unpaid
  supplier debt is cancelled. Supplier payments block deletion until reversed.
- Retrying a completed deletion makes no second refund, reversal note or purchase
  audit entry. Invalid or missing reasons and unknown purchase ids are refused.

## Verification

Typecheck, lint, 316 unit tests, all 794 local database checks and production build
passed. Existing bundle-size and Zod annotation warnings remain.

Added database scenarios cover direct-account restoration, retry safety, original
ledger/item retention, report exclusion, advance restoration without extra money,
unpaid supplier debt cancellation, refusal of paid debts, correction after payment
reversal, reason validation, missing ids and role restrictions.

SQL-backed browser with fake local data: main-form inventory selection for Rice and
Turkey; two item lines appended; editing the first line preserves two lines; a
285 TL purchase saved; Admin delete restores the exact previous account balance
with one reversal; active/history filters and retained details verified at 360,
390, 430 and 1280 px. All hosted API traffic was blocked.

## Release

Owner applies `supabase/migrations/018_purchase_reversal.sql` in Supabase SQL Editor
and confirms success before the frontend release. The migration only replaces the
RPC safeguards; applying it does not delete any purchase or post any money. No
hosted database operations were performed by the agent. WhatsApp remains paused.
