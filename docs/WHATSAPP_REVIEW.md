# M15 — WhatsApp reports review

Approved plan: go on 14 October 2026. Sender +905391375702 must retain WhatsApp Business app access. Initial recipient +905338410938; multiple recipient controls and supporting design approved.

Not yet approved for commit/push. No live reports have been sent during implementation.

## Required checks

| Command | Result |
| --- | --- |
| npm run typecheck | Passed; includes imported server handler |
| npm run lint | Passed, zero warnings |
| npm test | 333 tests in 14 files passed |
| ./scripts/db-test.sh | All 701 database checks passed on throwaway local PostgreSQL |
| npm run build | Passed; existing main-bundle size warning remains |

Existing 628 checks are unchanged; 73 new checks cover recipient privacy/permission, canonical totals, schedule dates/DST, immutable snapshots, duplicate prevention, sender claims, status ordering, crashes, pause and recipient limits. New database declarations were generated from the migrated local fixture, preserving earlier declarations. Hosted type generation after user application confirmed equivalent M15 declarations.

## Full-flow evidence

Chrome at 360/390/430/1280px: Admin added two recipients, adjusted report preferences, enabled/paused automatic reports and deactivated a recipient. An explicit test used the actual server handler, real local authenticated-role database RPC/RLS and mocked Meta transport. Acceptance rendered correctly; a valid signed webhook updated the real local record and UI to Delivered. Operations was denied the route. No page errors or horizontal overflow. Two simultaneous SQL claimants produced one job and one null.

All Supabase business requests were intercepted into isolated local test databases. No hosted report, recipient or financial records were written by verification; no real WhatsApp messages were sent. The phone screenshot was inspected for branding, wrapping and controls. Meta coexistence eligibility and actual live delivery remain unverified.

## Review preview

https://m15-review.sfx-oms.pages.dev/login

Verified immutable build: https://bdb3a8c5.sfx-oms.pages.dev/login

HTTP verification confirmed the preview serves the exact tested asset entry. Production remains on approved M14.


## Done when

1. **Local checks passed; phone check pending.** Admin adds multiple numbers, individually selects daily/weekly and deactivates without losing history. Operations and Logistics cannot view/edit settings. Phone check required.
2. **Local dates/DST passed; real schedule pending.** Daily runs at 23:00 Europe/Nicosia and says so far; weekly Monday 08:00 covers previous Monday–Sunday business dates. Local summer/winter/DST checks required; real scheduled phone receipt remains manual.
3. **Local checks passed.** Revenue, gross/net profit and recorded expense categories come from original views/report_pnl; customer balances are clearly outstanding now. Empty periods and negative profits format correctly, with cents only when needed.
4. **Local database/handler checks passed.** Reports dispatch once per recipient/period; signed Meta callbacks update delivery, out-of-order notifications cannot regress Delivered/Read, uncertain sends are not blindly repeated.
5. **Local authorization checks passed; hosted secrets/deployment pending.** Server configuration is private; new endpoint authentication, active Admin role checks and webhook signatures are tested. Existing role/RLS/session/financial/no-delete guards remain unchanged.
6. **Manual prerequisites pending.** Meta coexistence, approved template, deployed functions, server secrets, Vault/Cron, delivered test and ordinary Business app access are verified on real devices. These are manual prerequisites; do not mark them complete from local mock evidence.
7. **Commands passed; phone review and approval pending.** Typecheck, lint, tests, database checks and build pass; preview is ready before milestone approval.

Phone checks completed by / date: ____________________
013 applied / verified: User confirmed 14 October 2026; read-only hosted type generation verified all four tables and eleven RPC declarations.
Meta coexistence sender ready: Pending. Brave reached developer registration; user must review/accept Meta Platform Terms and Developer Policies, then finish registration.
Template / functions / secrets / webhook ready: ____________________
Delivered real test and Business app retained: ____________________
Cron and scheduled delivery verified: ____________________
Commit/push approved by / date: ____________________
