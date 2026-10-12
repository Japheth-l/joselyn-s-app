#!/bin/sh
# Drop and recreate a LOCAL development/test database. Refuses anything that isn't localhost.
set -e
url="${1:-$DATABASE_URL}"
case "$url" in
  postgresql://*@localhost*|postgresql://*@127.0.0.1*) ;;
  *) echo "Refusing to reset a non-local database: $url" >&2; exit 1 ;;
esac
db="${url##*/}"; db="${db%%\?*}"
admin="${url%/*}/postgres"
psql "$admin" -q -c "DROP DATABASE IF EXISTS \"$db\" WITH (FORCE)" -c "CREATE DATABASE \"$db\""
echo "Recreated local database $db"
