# M11 — Cloudflare Pages deployment and phone acceptance

M11 code and its Pages preview have been reviewed and approved for commit/push. Real phone
installation, Supabase Pro upgrade and go-live data review need the manual checks below. Do not mark these complete until
they are actually checked. M10's two-week run is deferred by user instruction; no matching
two-week result has been recorded. WhatsApp and scheduled report delivery remain deferred.

## Hosting target

The user supplied `https://sfx-oms.peterjaphet111.workers.dev/login`, which is an existing Workers
deployment, then explicitly chose to create Cloudflare Pages as planned. Create a separate Pages
project connected to `PeterJaphet/sfx-oms`. Keep this document's Pages URL field up to date when
Cloudflare assigns it. No worker deletion or database move is required to set up Pages.

Pages project name: `sfx-oms`

Pages HTTPS URL: https://sfx-oms.pages.dev

Reviewed deployment preview: https://74531f38.sfx-oms.pages.dev

Preview branch alias: https://m11-review.sfx-oms.pages.dev

Created on 2026-10-13: the Git-integrated production build succeeded. The checked, uncommitted
M11 build was uploaded separately to `m11-review`. Its login screen and install control were
verified in Brave; login/order routes, manifest, workers and install icons return HTTP 200.
The user approved M11 for commit and push on 2026-10-13. Individual phone and go-live check
results have not been recorded; the approval does not document a Pro upgrade or opening records.

## Prepare and review the build

Use Node 22, or another compatible Node version >=20.19.0. `.node-version` selects Node 22 for
hosting. The PWA dependency requires a newer Node than the original 20.17 minimum.

```sh
cd /Users/pj/Documents/sfx-oms
npm ci
npm run typecheck
npm run lint
npm test
PGURL=postgres://postgres@localhost:5432/postgres ./scripts/db-test.sh
npm run build
npm run preview -- --host 127.0.0.1 --port 4173
```

The database check URL must point at a disposable local PostgreSQL server, not hosted Supabase.
The existing dev server at port 5173 is useful for screen review; the generated production
service worker is tested through the production preview and HTTPS deployment.

`dist/` contains the app, manifest, icons, `sw.js`, the Workbox runtime and `sw-safety.js`.
Upload/deploy the complete output together. Static shell files are precached; Auth, database
responses and private photos are not service-worker cached. The existing build size warning
does not indicate a failed build; report and PDF code stays split into on-demand bundles.

## Manual Cloudflare setup — Git integration from main

1. Sign in to Cloudflare. Open Workers & Pages, then Create application and choose **Pages**.
   Choose Import an existing Git repository / Connect to Git, rather than creating a Worker.
2. Authorize GitHub access to `PeterJaphet/sfx-oms` and select that repository.
3. Set production branch `main`, repository root (leave the directory blank), build command
   `npm run build`, and build output directory `dist`. Use the React/Vite preset if shown.
4. Add build environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` using the
   public values from local `.env`. Add `NODE_VERSION=22`. Use the same public values for an
   authorized preview when testing against this project. Never add the service-role key or
   commit `.env`. Keep credentials in local files and the provider dashboard, not in chat.
5. Save and deploy. Record the assigned `https://<name>.pages.dev` address above.
6. Check the deployment's commit. Before the approved M11 commit is pushed, Git integration
   builds the earlier `main` and cannot demonstrate M11 installation. After the approved M11
   push, wait for the build to succeed and verify that its commit matches `main`.
7. Open `/login`, a role's direct route and a refreshed nested route. Verify the app serves at
   each URL. The Pages default SPA fallback handles application routes. Verify `sw.js`,
   `sw-safety.js`, `manifest.webmanifest` and each icon return their actual files.

If M11 phone acceptance is needed before committing, use an authorized preview of the reviewed
local build in this Git-integrated project. A local Node 22+ terminal logged in with Wrangler can
deploy `dist/` to a preview branch without changing Git or production `main`:

```sh
npx wrangler login
npx wrangler pages deploy dist --project-name <actual-pages-project-name> --branch m11-review
```

Use the preview URL printed by Wrangler for phone review. The preview and later production
origins have separate browser sessions/drafts/installations. Git integration still deploys
production from `main` after the user's milestone approval. Do not create a Direct Upload project
as a substitute; the intended project uses Git integration.

Finish or confirm all pending requests in the existing app before switching hostname. Orders
already saved in Supabase are shared by both deployments; browser drafts and retry records stay
on the origin/tab where they were created. Install the new Pages URL rather than the earlier
Workers URL. Do not submit a duplicate order to replace an uncertain earlier save.

Cloudflare references:
- [React build configuration](https://developers.cloudflare.com/pages/framework-guides/deploy-a-react-site/)
- [Git integration](https://developers.cloudflare.com/pages/get-started/git-integration/)
- [Wrangler deployment commands](https://developers.cloudflare.com/workers/wrangler/commands/#pages-deploy)

## Manual Supabase steps

No M11 SQL migration or Edge Function deployment is needed. Existing migrations 001–010 and
server-side money, session and role guards remain in place.

Before real go-live, upgrade the organization hosting project `lnolchqycicixjikolfi` to Pro in
Supabase billing. Verify the project's Database > Backups screen shows daily backups. Database
backups do not contain Storage objects; keep receipt/photo backup arrangements alongside the
database backup process. See [Supabase backups](https://supabase.com/docs/guides/platform/backups).

Pro upgrade verified by / date: ____________________

Daily backup verified by / date: ____________________

## Phone acceptance — each M11 Done when item

1. **Installable on staff phones.** Use the reviewed HTTPS Pages/preview URL on actual phones.
   iPhone: Safari Share > Add to Home Screen; Android: Chrome Install app / Add to Home screen.
   Verify name and icon, launch from the home screen, sign in as each role and check the correct
   landing page. Install help is also available in the app. Record devices and result below.
2. **Offline warning and no half-save.** Prepare an order online. Disconnect internet (disable
   mobile data too when testing Wi-Fi loss). Confirm the warning and disabled Save as unpaid /
   Send to kitchen; the order draft remains. Reconnect: the app refreshes reads and waits for a
   manual save. Verify one order, its correct items and its payments. If a save loses its response,
   reload/reconnect and use Retry save for the same request; confirm no duplicate. Check an
   Operations withdrawal, Logistics purchase/upload and Admin menu/staff save are blocked offline.
   An offline shell reload can warn while account loading waits for connection.
3. **Supabase Pro before real go-live.** Complete and record the Pro/backup checks above. Building
   or deploying the app does not upgrade the subscription.
4. **Opening balances/debts and paper retirement.** Review `/setup` as Admin against actual
   account balances and outstanding debts. Existing one-time openings cannot be entered again;
   review any training records and raise gaps before applying normal reasoned corrections. Opening
   debts do not move money or change profit. Record the go-live business date and your decision to
   retire the book only after accepting the financial records and staff workflow.

Also check a weekly P&L PDF, nested-route refresh, safe update prompt and draft retention after an
intentional update. Pending confirmations and other open app tabs must block updates. No app
update should interrupt a saving request. Supabase requires online role/session validation;
installing the app does not grant offline permission to save or bypass expired sessions.

| Check | Device / role / business date | Evidence / result | Reviewed by |
| --- | --- | --- | --- |
| Installation | | | |
| Offline order and retry | | | |
| Offline withdrawal | | | |
| Offline purchase/upload | | | |
| Offline Admin save | | | |
| Update and draft retention | | | |
| Weekly P&L PDF | | | |
| Pro and daily backup | | | |
| Opening records and go-live | | | |

Go-live business date: ____________________

Paper book retirement approved by / date: ____________________

M11 milestone commit/push approved by / date: user / 2026-10-13
