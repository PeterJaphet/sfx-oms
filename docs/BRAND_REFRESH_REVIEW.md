# M13 — Brand refresh review

Review: https://m13-review.sfx-oms.pages.dev/login
Immutable deployment: https://8d344af2.sfx-oms.pages.dev/login

Plan approved with “go” on 2026-10-14. User approved M13 for commit/push on 2026-10-14. Individual phone-check results have not been recorded.
No Supabase migration, settings change or Edge Function deployment is needed.

## What changed

- Supplied primary/black/white SVGs preserved in `public/brand/source/`; proportional display wordmarks and the original burger symbol used for the UI, PDF reports and install icons.
- Locally bundled League Spartan headings/emphasis and Antic body text, soft cream / charcoal theme, consistent shared forms and cards, visible selected navigation, responsive header and branded session states.
- Phone header keeps sign-out and the role visible with long names; the logo home link and navigation retain at least 44px targets.
- PDF exports use the supplied logo, repeated page headers, brand fonts and a fallback retaining every character supported by the previous PDF font.
- Updated all screen references and the shared brand reference. Order/money models, RPC calls, permissions, currency formatter and Supabase files were not changed.

## Required checks

| Command | Result |
| --- | --- |
| `npm run typecheck` | Passed, including the final build's typecheck |
| `npm run lint` | Passed, zero warnings |
| `npm test` | 286 tests passed in 12 files |
| `./scripts/db-test.sh` | All 522 database checks passed on isolated local PostgreSQL |
| `npm run build` | Passed; existing main bundle size warning remains |

## Browser and export evidence

All 18 Admin areas were checked at 360, 390, 430 and 1280px: dashboard, new order, orders, menu, accounts,
withdrawal, withdrawal history, expenses, approvals, Admin tools, purchases, new purchase, advances,
debts, setup, close, staff and reports. No page overflow; local fonts loaded and the theme applied throughout.
Operations and Logistics role restrictions remained intact. A complete branded order/payment save recorded
2 soups and 4 total swallow at exactly ₺900, with one order and one payment, then showed the branded confirmation.

PDFs were exported through the app from local PostgreSQL reports. Account movements preserve ₺, $, ₦,
İşbank, arrows, Greek symbols and negative fractional amounts such as −₦15,000.25. The 1,234-row sales
export contains every row across 73 pages, with report headers and logo on every page. One-page exports
and representative first, second, middle and last pages were rendered and inspected without clipping.
The sample P&L and screenshots use local test data, not the hosted business records.

Offline checks confirmed the precached fonts and logo load, the entered draft survives reload, and saving
is blocked both before and after reload. No hosted orders or money were written during verification.

Semantic text contrast ranges from 4.96:1 to 7.60:1; input borders are 3.17:1 against the cream background.
Original SVG bytes and all fitted wordmark paths/fills were compared with the supplied archive and are unchanged.
The preview's login, logo, fonts and install icon return HTTP 200 with the correct content types.

## Done when — item by item

1. **Logo and installed icon:** Browser/asset checks passed. Phone check needed: review login, app header and the home-screen icon; the logo should be clear and proportional.
2. **Whole-app consistency:** All areas and four widths passed. Phone check needed: browse order, menu, money, Logistics, debts, close, reports and staff with the relevant roles.
3. **Controls, fit and contrast:** Passed, including long-name role visibility and 44px logo/sign-out targets. Phone check needed: tap navigation and form controls; confirm readability and no sideways page scrolling.
4. **Financial behaviour and permissions:** Passed. The complete save, exact extra quote/counts, role checks and existing unit/database regressions remain correct.
5. **PDF branding and text:** Passed. Phone check suggested: export Weekly P&L and Account movements; check the logo, currency symbols and complete values.
6. **Offline branding and drafts:** Browser passed. Phone check needed: install/update the app, create a draft, disconnect, reload, and confirm its logo/fonts/draft remain available while saving is blocked. Reconnect before saving.
7. **Required commands and guards:** Passed. No database files or financial/permission models changed.

Phone checks completed by / date: ____________________
M13 commit/push approved by / date: User / 2026-10-14
