#!/usr/bin/env bash
# SFx Burger OMS — off-site backup to this Mac (database + receipt and menu photos).
#
# Supabase Pro keeps 7 days of daily backups inside Supabase, but they do not include photos,
# cannot be kept longer, and restoring one replaces the whole live project. This script keeps
# your own copy, as long as you like, outside Supabase.
#
# Run weekly (and before any risky change):
#   SUPABASE_DB_URL='postgresql://postgres.<ref>:<password>@<pooler-host>:5432/postgres' ./scripts/backup.sh
#
# Get the URL from Supabase → Connect → Session pooler. The password is never stored by this script.
# Needs: Supabase CLI (npx supabase), Docker Desktop running (the CLI uses it for db dump),
# and this folder linked to the project (npx supabase link --project-ref <ref>) for the photos.
set -euo pipefail

: "${SUPABASE_DB_URL:?Set SUPABASE_DB_URL to the Session pooler connection string (see top of this file)}"
DEST_ROOT="${SFX_BACKUP_DIR:-$HOME/SFx-Backups}"
STAMP="$(date +%Y-%m-%d_%H%M)"
DEST="$DEST_ROOT/$STAMP"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$DEST"
cd "$ROOT"

if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running. Open Docker Desktop, wait until it says running, then try again."
  exit 1
fi

echo "1/4 Roles…";   npx --yes supabase db dump --db-url "$SUPABASE_DB_URL" -f "$DEST/roles.sql" --role-only
echo "2/4 Schema…";  npx --yes supabase db dump --db-url "$SUPABASE_DB_URL" -f "$DEST/schema.sql"
echo "3/4 Data…";    npx --yes supabase db dump --db-url "$SUPABASE_DB_URL" -f "$DEST/data.sql" --use-copy --data-only \
                       -x "storage.buckets_vectors" -x "storage.vector_indexes"

echo "4/4 Photos (receipts, menu photos)…"
PHOTOS_OK=yes
for bucket in receipts menu-photos; do
  mkdir -p "$DEST/storage/$bucket"
  if ! npx --yes supabase storage cp -r "ss:///$bucket" "$DEST/storage/$bucket" --experimental --linked; then
    PHOTOS_OK=no
    echo "   Could not copy bucket '$bucket'. The database backup is still valid; see docs/GO_LIVE_SAFETY.md."
  fi
done

# Quick sanity check: the key money tables must be in the data dump.
MISSING=""
for t in orders order_items ledger_entries withdrawals purchases debts accounts products; do
  grep -q "COPY \"\?public\"\?\.\"\?$t\"\? " "$DEST/data.sql" || MISSING="$MISSING $t"
done

for f in roles.sql schema.sql data.sql; do [ -s "$DEST/$f" ] || { echo "Backup FAILED: $f is empty"; exit 1; }; done
if [ -n "$MISSING" ]; then echo "Backup FAILED: data.sql is missing tables:$MISSING"; exit 1; fi

PHOTO_COUNT=$(find "$DEST/storage" -type f 2>/dev/null | wc -l | tr -d ' ')
SIZE=$(du -sh "$DEST" | cut -f1)
cat > "$DEST/BACKUP_INFO.txt" <<INFO
SFx Burger OMS backup
Taken: $(date)
Database: roles.sql, schema.sql, data.sql
Photos copied: $PHOTO_COUNT files (complete: $PHOTOS_OK)
Restore: see docs/GO_LIVE_SAFETY.md, section "Restoring". Never restore over the live project
without deciding to; restore into a new Supabase project first.
INFO

echo
echo "Backup complete: $DEST ($SIZE, $PHOTO_COUNT photo files, photos complete: $PHOTOS_OK)"
echo "Keep a second copy off this Mac (iCloud Drive, Google Drive or an external disk)."
