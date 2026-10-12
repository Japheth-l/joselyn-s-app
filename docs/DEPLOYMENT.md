# Deploying, backing up and rolling back

The app runs on Render (web service `tailorconnect` + PostgreSQL `tailorconnect-db`, see `render.yaml`) and deploys
from the `initial-web-app` branch. V2 is developed on `v2` and reaches production only by merging the pull request.

## Local development

```bash
cp .env.example .env              # fill in DATABASE_URL and AUTH_SECRET
npm ci
npx prisma migrate deploy         # create/upgrade the local database
npm run db:seed                   # catalogue, admin (local-admin-password) and demo data
npm run dev
```

Tests (both need a local PostgreSQL; they refuse non-local URLs):

```bash
npm test                          # Vitest: unit + integration, recreates TEST_DATABASE_URL each run
npm run build && PAYMENTS_MODE=sandbox npm start &
npm run test:e2e                  # Playwright at phone size; resets and re-seeds the local dev database first
```

## What happens on each deploy

`npm run deploy:start` runs `scripts/migrate.mjs`, then starts the app:

1. If the database came from V1 (tables but no migration history), the `0000_baseline` migration (identical to V1)
   is marked as applied.
2. `prisma migrate deploy` applies pending migrations. It never resets or drops the database.
3. With `SEED_DEMO_DATA=true`, the seed runs only if the database has **no users**. It never touches a populated
   database.

`0001_v2` converts V1 data in place: roles, businesses → organisations with an owner, orders → the new status
model, payments → ledger entries, ratings recomputed from real reviews. It deletes no records. It was rehearsed on a
copy of V1 data: all migrations applied, the ledger total equalled successful payments, and partner balances were
zero after recorded payouts.

## Releasing V2 (first time) — checklist

1. **Back up first.** Render dashboard → `tailorconnect-db` → Backups (paid plans), or from your machine:
   `pg_dump --format=custom "$EXTERNAL_DATABASE_URL" > ntoma-before-v2.dump`.
   Free Render databases have no automatic backups and expire after 30 days — upgrade before real use.
2. Rehearse: restore that dump into a local database and run `DATABASE_URL=<local copy> node scripts/migrate.mjs`.
   Check `/admin/finance` → "Run reconciliation" reports a balanced ledger.
3. Review the new environment variables in `render.yaml` (Render applies them on Blueprint sync):
   `PAYMENTS_MODE=sandbox`, `SEED_DEMO_DATA`, `STORAGE_DRIVER`, `CRON_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `S3_*`.
4. Merge the pull request into `initial-web-app`. Render builds and deploys; watch the deploy log for
   "All migrations have been successfully applied".
5. Smoke test: `/api/health` returns `{"ok":true}`; log in as the administrator; open an existing order.

V1 sessions used a different cookie (`tc_session`), so everyone signs in again once. V1 passwords keep working.

## Rolling back

- **Code only (no migration ran or it failed):** Render → the service → Deploys → "Rollback" to the previous deploy.
  A failing migration is rolled back as a whole by PostgreSQL. This was tested by making `0001_v2` fail on its last
  statement against a V1 copy: no V2 table was created and the V1 tables were untouched. Prisma still records the
  attempt as failed; before retrying, run
  `DATABASE_URL=<production url> npx prisma migrate resolve --rolled-back 0001_v2`.
- **After `0001_v2` has run:** V1 code can't read the V2 schema. Restore the backup taken in step 1
  (`pg_restore --clean --no-owner -d "$EXTERNAL_DATABASE_URL" ntoma-before-v2.dump`), then roll back the code.
  Anything written after the migration is lost, so decide quickly and announce a maintenance window.

## Scheduled jobs

`POST /api/cron` with header `Authorization: Bearer $CRON_SECRET` runs: quote expiry, cancellation of unpaid orders
whose stock hold lapsed (releasing the stock), auto-completion of delivered orders after the configured days, visit
reminders, expiry of visits nobody accepted, and re-verification of payments whose webhook never arrived. Each job
is idempotent. Call it every 15 minutes, for example:

- a Render Cron Job (paid) running `curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/cron`, or
- any external scheduler that can send that request.

Without it the app still works, but unpaid orders keep their fabric reserved and delivered orders wait for the
customer to confirm.

## Going live with real money

1. Create a Paystack business account (Ghana), complete compliance, and set `PAYSTACK_SECRET_KEY`.
2. Remove `PAYMENTS_MODE` (or set it to anything but `sandbox`). The sandbox checkout then returns 404 and the
   banner disappears.
3. In Paystack → Settings → API Keys & Webhooks set the webhook URL to `https://<app>/api/payments/paystack/webhook`.
4. Test with Paystack **test** keys first: pay a deposit, refund it from `/admin/orders/<id>`, and check reconciliation.
5. Payouts to businesses and professionals are sent by Mobile Money outside the app and recorded in `/admin/finance`.
   Automatic transfers are not built; doing them would need Paystack Transfers and a review of licensing.

## Other services

| Purpose | Variables | Without it |
|---|---|---|
| SMS (Arkesel) | `ARKESEL_API_KEY`, `SMS_SENDER_ID` (sender ID must be registered with Arkesel) | In-app notifications only; each skipped SMS is recorded as SKIPPED |
| Email (Resend) | `RESEND_API_KEY`, `EMAIL_FROM` (verified domain) | No verification/reset emails in production; users can still log in |
| File storage | `STORAGE_DRIVER=s3`, `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Local disk, wiped on every Render redeploy |
| Maps | none (OpenStreetMap tiles) | — OSM's tile policy forbids heavy commercial use; switch to a paid tile provider before scaling |

## Monitoring

- Health: `/api/health` (Render health check) confirms the app and database are reachable.
- Logs are one JSON object per line (`level`, `event`, …) with no passwords, tokens or measurement values. Search for
  `"level":"error"`, `payment.amount_mismatch`, `payment.after_cancellation`, `notify.failed`, `maintenance.job_failed`.
- `/admin` shows queues (pending verifications, open disputes, failed refunds). `/admin/finance` → "Run reconciliation"
  checks that the ledger matches payments; run it daily once real money flows.
- Every sensitive admin action is in `/admin/audit`.
