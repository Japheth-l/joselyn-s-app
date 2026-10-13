#!/bin/sh
# Rehearse the V1 → V2 migration and the rollback on a COPY of the production backup.
#
#   scripts/rehearsal/rehearse.sh <v1-backup.dump> [tag]
#
# Needs: PostgreSQL client and server (server major version ≥ the Render server's), Node 22, `npm ci` done in this
# checkout of the v2 branch, and git history containing the V1 commit (V1_COMMIT, default b749f0c).
# Uses only the backup FILE: no production credentials are needed or read.
#
# It creates fresh databases named ntoma_rh_<tag>_* on REHEARSAL_PG (default postgresql://postgres@localhost:5432),
# refuses to run if any already exists, and never drops anything. Delete them yourself afterwards.
# Evidence is written to rehearsal-evidence/<tag>/ (git-ignored). Exit code 0 only if every check passed.
set -eu

BACKUP="${1:?usage: rehearse.sh <v1-backup.dump> [tag]}"
TAG="${2:-$(date -u +%Y%m%d%H%M%S)}"
PG="${REHEARSAL_PG:-postgresql://postgres@localhost:5432}"
V1_COMMIT="${V1_COMMIT:-b749f0c}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
OUT="$ROOT/rehearsal-evidence/$TAG"
DB="ntoma_rh_${TAG}"
FAILURES=0

cd "$ROOT"
mkdir -p "$OUT"
unset SEED_DEMO_DATA SEED_ON_EMPTY || true
log() { printf '%s\n' "$*" | tee -a "$OUT/summary.txt"; }
pass() { log "PASS  $*"; }
fail() { log "FAIL  $*"; FAILURES=$((FAILURES + 1)); }
sql() { url="$1"; file="$2"; dest="$3"; psql "$url" -X -q -v ON_ERROR_STOP=1 -f "$file" > "$dest" && [ -s "$dest" ]; }
newdb() {
  name="$1"
  if [ -n "$(psql "$PG/postgres" -X -At -c "select 1 from pg_database where datname = '$name'")" ]; then
    echo "Database $name already exists. Choose another tag." >&2; exit 2
  fi
  psql "$PG/postgres" -X -q -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$name\""
  pg_restore --no-owner --no-acl --exit-on-error --dbname "$PG/$name" "$BACKUP"
}

log "Rehearsal $TAG on $(date -u +%FT%TZ); backup $(basename "$BACKUP")"
log "Server: $(psql "$PG/postgres" -X -At -c 'show server_version')  pg_restore: $(pg_restore --version)"

# 1. Backup is readable and complete.
sha256sum "$BACKUP" > "$OUT/01-backup.sha256"
pg_restore --list "$BACKUP" > "$OUT/01-backup.toc" && pass "backup archive is readable ($(grep -c 'TABLE DATA' "$OUT/01-backup.toc") tables with data)" || fail "backup archive unreadable"

# 2. Restore into an empty database; record what V1 holds.
newdb "${DB}_v1"
sql "$PG/${DB}_v1" "$HERE/table-fingerprints.sql" "$OUT/02-v1-fingerprints.txt" && pass "restored into ${DB}_v1 ($(wc -l < "$OUT/02-v1-fingerprints.txt") tables)" || fail "fingerprints of restored V1"
sql "$PG/${DB}_v1" "$HERE/v1-snapshot.sql" "$OUT/03-v1-snapshot.txt" || fail "V1 snapshot"
sql "$PG/${DB}_v1" "$HERE/v1-preflight.sql" "$OUT/04-preflight.txt" || fail "preflight query"
if grep -q '|FAIL$' "$OUT/04-preflight.txt"; then fail "preflight: $(grep '|FAIL$' "$OUT/04-preflight.txt" | tr '\n' ' ')"; else pass "preflight has no FAIL"; fi
grep -q '|REVIEW$' "$OUT/04-preflight.txt" && log "NOTE  preflight items to review: $(grep '|REVIEW$' "$OUT/04-preflight.txt" | tr '\n' ' ')" || true

# 3. Migrate a separate copy with the exact production command.
newdb "${DB}_migrated"
"$HERE/guard.sh" "$PG/${DB}_migrated" >> "$OUT/summary.txt"
start=$(date +%s)
if ALLOW_V1_CONVERSION=true DATABASE_URL="$PG/${DB}_migrated" node scripts/migrate.mjs > "$OUT/05-migrate.log" 2>&1; then
  pass "migration applied in $(( $(date +%s) - start ))s (log names database: $(grep -m1 -o 'database "[^"]*"' "$OUT/05-migrate.log"))"
else
  fail "migration failed, see 05-migrate.log"
fi
if ! sql "$PG/${DB}_migrated" "$HERE/v2-compare.sql" "$OUT/06-v2-compare.txt"; then fail "V2 comparison query could not run"
elif diff "$OUT/03-v1-snapshot.txt" "$OUT/06-v2-compare.txt" > "$OUT/06-diff.txt"; then pass "all $(wc -l < "$OUT/03-v1-snapshot.txt") V1→V2 comparisons match"
else fail "V1→V2 differences (06-diff.txt)"; fi
if ! sql "$PG/${DB}_migrated" "$HERE/v2-invariants.sql" "$OUT/07-invariants.txt"; then fail "V2 invariants could not run"
elif grep -q '|FAIL$' "$OUT/07-invariants.txt"; then fail "invariants: $(grep '|FAIL$' "$OUT/07-invariants.txt" | tr '\n' ' ')"
else pass "$(grep -c '|PASS$' "$OUT/07-invariants.txt") V2 invariants pass"; fi

# 4. A migration that fails at its very last statement leaves V1 data untouched.
newdb "${DB}_failed"
work="$OUT/forced-failure"; rm -rf "$work"; mkdir -p "$work"; cp -r prisma "$work/"
echo 'SELECT 1/0; -- rehearsal: forced failure after every real statement' >> "$work/prisma/migrations/0001_v2/migration.sql"
"$HERE/guard.sh" "$PG/${DB}_failed" >> "$OUT/summary.txt"
DATABASE_URL="$PG/${DB}_failed" npx prisma migrate resolve --applied 0000_baseline --schema "$work/prisma/schema.prisma" > "$OUT/08-failure.log" 2>&1
if DATABASE_URL="$PG/${DB}_failed" npx prisma migrate deploy --schema "$work/prisma/schema.prisma" >> "$OUT/08-failure.log" 2>&1; then
  fail "forced failure did not fail"
else
  sql "$PG/${DB}_failed" "$HERE/table-fingerprints.sql" "$OUT/08-after-failure.txt"
  grep -v '^_prisma_migrations|' "$OUT/08-after-failure.txt" > "$OUT/08-after-failure-v1.txt"
  if diff "$OUT/02-v1-fingerprints.txt" "$OUT/08-after-failure-v1.txt" > /dev/null; then pass "failed migration rolled back completely (V1 tables identical, no V2 tables)"; else fail "failed migration changed V1 data"; fi
fi

# 5. Recovery: restore the backup into another new database; it must equal the original.
newdb "${DB}_recovered"
sql "$PG/${DB}_recovered" "$HERE/table-fingerprints.sql" "$OUT/09-recovered-fingerprints.txt"
if diff "$OUT/02-v1-fingerprints.txt" "$OUT/09-recovered-fingerprints.txt" > /dev/null; then pass "recovered database identical to the V1 backup"; else fail "recovered database differs"; fi

# 6. What V1's start command (`prisma db push`) would do to the migrated database (diff only, executes nothing).
git show "$V1_COMMIT:prisma/schema.prisma" | sed 's/provider *= *"sqlite"/provider = "postgresql"/' > "$OUT/v1-schema.prisma"
npx prisma migrate diff --from-url "$PG/${DB}_migrated" --to-schema-datamodel "$OUT/v1-schema.prisma" --script > "$OUT/10-v1-push-on-v2.sql" 2>&1 || true
log "INFO  V1 db push against the migrated database would need $(grep -c 'DROP TABLE' "$OUT/10-v1-push-on-v2.sql") DROP TABLE statements (see 10-v1-push-on-v2.sql): V1 must never start against a V2 database"

log "Databases created: ${DB}_v1 ${DB}_migrated ${DB}_failed ${DB}_recovered (not dropped)"
if [ "$FAILURES" -eq 0 ]; then log "RESULT: all database checks passed"; else log "RESULT: $FAILURES check(s) FAILED"; fi
log "Still to do by hand (runbook §6, §8): V2 logins on ${DB}_migrated, V1 app start + logins on ${DB}_recovered."
[ "$FAILURES" -eq 0 ]
