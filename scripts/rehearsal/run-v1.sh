#!/bin/sh
# Start the V1 app exactly as Render starts it (`npm run deploy:start`: prisma db push, seed --if-empty, next start)
# against a REHEARSAL database, to prove V1 runs on a restored backup.
#   scripts/rehearsal/run-v1.sh <rehearsal database url> [port]
# Builds V1 from git (V1_COMMIT, default b749f0c) into rehearsal-evidence/v1-app on first use (needs `npm ci`
# network access), or set V1_APP_DIR to an existing V1 build. Runs in the foreground; Ctrl-C to stop.
set -eu
URL="${1:?usage: run-v1.sh <rehearsal database url> [port]}"
PORT="${2:-3102}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
"$HERE/guard.sh" "$URL"
APP="${V1_APP_DIR:-$ROOT/rehearsal-evidence/v1-app}"
if [ ! -d "$APP/.next" ]; then
  mkdir -p "$APP"
  git -C "$ROOT" archive "${V1_COMMIT:-b749f0c}" | tar -x -C "$APP"
  (cd "$APP" && npm ci && DATABASE_URL="$URL" npm run deploy:build)
fi
cd "$APP"
# A throwaway session secret: rehearsal sessions must not be valid anywhere else.
AUTH_SECRET="${AUTH_SECRET:-rehearsal-$(od -An -tx1 -N24 /dev/urandom | tr -d ' \n')}" DATABASE_URL="$URL" PORT="$PORT" exec npm run deploy:start
