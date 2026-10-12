#!/usr/bin/env bash
# Runs the database checks on a throwaway database.
#
#   PGURL=postgres://postgres@localhost:5432/postgres ./scripts/db-test.sh
#
# Needs psql and any Postgres 15+ server you can create databases on
# (a local install, Docker `postgres:16`, or `supabase start`).
# Never point it at the live Supabase project.
set -euo pipefail

PGURL="${PGURL:-postgres://postgres@localhost:5432/postgres}"
DB="sfx_oms_test_$$"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# Same server, different database name (keeps any ?host=... options).
TESTURL="$(sed -E "s#/([^/?]*)(\?|$)#/$DB\2#" <<<"$PGURL")"

cleanup() { psql "$PGURL" -q -c "drop database if exists $DB" >/dev/null 2>&1 || true; }
trap cleanup EXIT

psql "$PGURL" -q -c "create database $DB" >/dev/null
# The auth stand-in creates cluster-wide roles; ignore "already exists" on reruns.
psql "$TESTURL" -q -f "$ROOT/supabase/tests/00_auth_stub.sql" >/dev/null 2>&1 || true
psql "$TESTURL" -q -v ON_ERROR_STOP=1 -f "$ROOT/supabase/schema.sql" >/dev/null
for f in "$ROOT"/supabase/migrations/*.sql; do
  [ -e "$f" ] && psql "$TESTURL" -q -v ON_ERROR_STOP=1 -f "$f" >/dev/null
done
psql "$TESTURL" -q -v ON_ERROR_STOP=1 -f "$ROOT/supabase/seed.sql" >/dev/null

OUT="$(psql "$TESTURL" -q -f "$ROOT/supabase/tests/10_scenario.sql" 2>&1 || true)"
OK=$(grep -cE '^ ok ' <<<"$OUT" || true)
BAD=$(grep -E 'FAIL|ERROR' <<<"$OUT" || true)

if [ -n "$BAD" ]; then
  echo "$BAD"
  echo "Database checks FAILED ($OK passed)."
  exit 1
fi
echo "All $OK database checks passed."
