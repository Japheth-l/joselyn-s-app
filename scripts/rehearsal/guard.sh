#!/bin/sh
# Refuse to touch any database that isn't an explicitly named rehearsal database.
#   scripts/rehearsal/guard.sh "<postgres url>"
# Passes only when ALL hold:
#   • the database name starts with ntoma_rh_
#   • the host is localhost/127.0.0.1/::1, or exactly equals $REHEARSAL_REMOTE_HOST (a separate Render
#     rehearsal database you created for this purpose — never the production host)
#   • the server confirms the same database name
#   • SEED_ON_EMPTY is unset (scripts/migrate.mjs would seed an empty database)
# Never prints the URL (it may contain a password).
set -eu
url="${1:-}"
[ -n "$url" ] || { echo "guard: no database URL given" >&2; exit 2; }
case "$url" in postgres://*|postgresql://*) ;; *) echo "guard: not a postgres URL" >&2; exit 2 ;; esac
rest="${url#*://}"; rest="${rest#*@}"            # strip scheme and credentials
hostport="${rest%%/*}"; host="${hostport%%:*}"
db="${rest#*/}"; db="${db%%\?*}"
case "$db" in ntoma_rh_*) ;; *) echo "guard: database '$db' is not a rehearsal database (name must start with ntoma_rh_)" >&2; exit 3 ;; esac
case "$host" in
  localhost|127.0.0.1|::1|"[::1]") ;;
  *) if [ "${REHEARSAL_REMOTE_HOST:-}" != "$host" ]; then
       echo "guard: host '$host' is not local; set REHEARSAL_REMOTE_HOST=$host only if it is a separate rehearsal database" >&2; exit 3
     fi ;;
esac
if [ -n "${SEED_ON_EMPTY:-}" ]; then echo "guard: unset SEED_ON_EMPTY before rehearsing" >&2; exit 3; fi
actual="$(psql "$url" -X -At -c 'select current_database()')"
[ "$actual" = "$db" ] || { echo "guard: server reports database '$actual', expected '$db'" >&2; exit 3; }
echo "guard: OK (database $db on $host)"
