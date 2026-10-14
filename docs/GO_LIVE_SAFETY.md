# Go-live safety — do these before trusting the app with real money

Three steps, in order. Steps 1 and 2 take about an hour once; step 3 runs for one week of trading.
Nothing here changes the app or the live data.

| Step | What | Why | Status |
| --- | --- | --- | --- |
| 1 | Upgrade Supabase to Pro | Free projects have no daily backups and pause after 7 idle days | ☐ |
| 2 | Take your own backup, then weekly | Pro keeps only 7 days, excludes photos, and restores by replacing the live project | ☐ |
| 3 | One-week parallel run | Prove the app's totals match the book before retiring it | ☐ |

## 1. Upgrade Supabase to Pro (you, 10 minutes)

1. supabase.com → your organization → **Billing** → upgrade to **Pro** (US$25/month; includes compute for one
   small project). Project: `lnolchqycicixjikolfi`.
2. Open the project → **Database → Backups** (or Platform → Backups). Within a day you should see a daily
   backup listed. Pro keeps the last 7.
3. Record below. Then also tick the "Pro upgrade" and "Daily backup" lines in `docs/DEPLOYMENT.md`.

Pro upgrade done by / date: ____________________ Daily backup seen on: ____________________

## 2. Your own backup (`scripts/backup.sh`)

What it saves to `~/SFx-Backups/<date_time>/` on this Mac: database roles, schema and all data, plus every file in
the `receipts` and `menu-photos` buckets, with a `BACKUP_INFO.txt` summary. It checks that the files are not
empty and that the key money tables (orders, ledger, withdrawals, purchases, debts, accounts, products) are in the
dump, and fails loudly otherwise.

**First time**

1. Install and open **Docker Desktop**; wait until it shows "running". (The Supabase CLI uses it to dump.)
2. Supabase → project → **Connect** → **Session pooler** → copy the connection string. Replace
   `[YOUR-PASSWORD]` with the database password (reset it under Database Settings if lost; keep it in your
   password manager, never in the project or chat).
3. In Terminal:
   ```sh
   cd ~/Documents/sfx-oms
   SUPABASE_DB_URL='postgresql://postgres.lnolchqycicixjikolfi:YOUR-PASSWORD@<pooler-host>:5432/postgres' ./scripts/backup.sh
   ```
   Put a space before the command so your shell does not save the password in history
   (`setopt HIST_IGNORE_SPACE` in zsh if needed).
4. It ends with `Backup complete: …`. Copy that folder to a second place (iCloud Drive, Google Drive or an external
   disk).
5. If the photo step says it could not copy a bucket, run `npx supabase link --project-ref lnolchqycicixjikolfi`
   once, then run the backup again. The database part is still valid either way.

**Routine:** every Monday after the weekly report, and before any database migration or risky change. Keep at
least the last 8 weekly backups.

| Date | Folder | Photos complete | Second copy where | By |
| --- | --- | --- | --- | --- |
| | | | | |

## Restoring (only if something has gone wrong)

Decide what you are recovering from before touching anything. Prefer recovering **into a new project**, so the
live app keeps running while you check the data.

1. Create a new Supabase project (same region), then from the backup folder:
   ```sh
   psql --single-transaction --variable ON_ERROR_STOP=1 \
     --file roles.sql --file schema.sql \
     --command 'SET session_replication_role = replica' \
     --file data.sql \
     --dbname 'postgresql://postgres.<NEW-REF>:<PASSWORD>@<pooler-host>:5432/postgres'
   ```
2. Upload the photo folders back into buckets of the same names (`npx supabase storage cp -r <folder> ss:///receipts --experimental`
   against the new project), deploy the Edge Functions, then point a Cloudflare **preview** at the new project
   and check balances, today's orders and debts before switching production.
3. Last resort for a broken live database: Supabase dashboard → Backups → restore a daily backup. This replaces the
   whole live project with that day's state, the app is unavailable during the restore, anything after that backup
   is lost, and photos are not part of it.

## 3. One-week parallel run

The full procedure, gap log and acceptance table are in `docs/PARALLEL_RUN.md`. Run it for **7 consecutive
business days** instead of 14. One clean week covers every weekday pattern; extend to a second week only if any
day shows an unexplained gap.

Every night (about 10 minutes), the Admin compares:

| Check | App | Book |
| --- | --- | --- |
| Number of orders, and net revenue | Reports → today | Sales page |
| Cash: expected vs counted | Close day screen | Cash count |
| Money taken out, by person | Money → today | Cash-out page |
| Supplies logged vs receipts | Logistics activity | Receipt envelope |
| Unpaid orders and open advances | Close day screen | Notes |

Any difference goes in the gap log in `PARALLEL_RUN.md` with its cause. Fix the record in the app with the normal
reasoned correction, never by editing the database.

**Pass:** 7 days with no unexplained gap. Then record the go-live date and retirement of the paper book in
`docs/DEPLOYMENT.md`, and take a backup that same night.
