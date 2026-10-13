# Deploying, backing up and rolling back

The app runs on Render (web service `tailorconnect` + PostgreSQL `ntoma-db`, see `render.yaml`) and deploys from the
`initial-web-app` branch. V2 is developed on `v2` and reaches production only by merging the pull request.

V2 launches on a **new, empty, paid database** (`ntoma-db`). V1 held only demo data, so nothing is migrated. The V1
database `tailorconnect-db` is left untouched for a rollback; Render does not delete it when it leaves `render.yaml`.

## Local development

```bash
cp .env.example .env              # fill in DATABASE_URL and AUTH_SECRET
npm ci
npx prisma migrate deploy         # create/upgrade the local database
npm run db:seed                   # catalogue, admin (local-admin-password) and demo data (local databases only)
npm run dev
```

Tests (both need a local PostgreSQL; they refuse non-local URLs):

```bash
npm test                          # Vitest: unit + integration, recreates TEST_DATABASE_URL each run
npm run build && PAYMENTS_MODE=sandbox npm start &
npm run test:e2e                  # Playwright at phone size; resets and re-seeds the local dev database first
```

## What happens on each deploy

`npm run deploy:start` runs `scripts/migrate.mjs`, then starts the app. If any step fails, the app does not start
and Render keeps the previous deploy running *(Render docs)*.

1. **V1 guard.** If the database holds V1 data, it stops without changing anything, unless `ALLOW_V1_CONVERSION=true`.
   This catches a `DATABASE_URL` that still points at `tailorconnect-db`.
2. `prisma migrate deploy` applies pending migrations. It never resets or drops the database. On an empty database
   it creates the whole schema and the 10 garment categories (about 3 seconds).
3. With `SEED_ON_EMPTY=catalogue-and-admin` (set in `render.yaml`), and only if the database has **no users**: the
   15 catalogue styles and one administrator from `ADMIN_EMAIL` / `ADMIN_PASSWORD`. Both must be set, and the password
   must be at least 12 characters and not a development default. Otherwise the start fails before anything is
   written. Demo users and businesses are never seeded on deploy, and the seed refuses demo data for any database
   that isn't on the local machine. A leftover `SEED_DEMO_DATA` is ignored, with a warning in the log.

Restarts, redeploys and free-plan wake-ups run the same steps: "No pending migrations to apply", then "Database
already has users; skipping the seed". After the first start, changing `ADMIN_EMAIL` or `ADMIN_PASSWORD` changes
nothing; change the password in the app under Settings.

`0001_v2` can also convert a V1 database in place. That path is not used for this launch; it is documented and
rehearsed in `docs/MIGRATION_REHEARSAL.md`.

## Launching V2 on a new database — checklist

Nothing here has been done on Render yet. Render behaviour marked *(Render docs)* comes from Render's documentation
and has not been tested on this account.

**Before merging**

1. **File storage.** Create a private Cloudflare R2 bucket and an API token limited to it (see *File storage* below).
   Check it from a machine with this repository: `npm run storage:check` with the five `S3_*` variables and
   `STORAGE_DRIVER=s3` set. Every line must say PASS.
2. **Render → `tailorconnect` → Environment**, add or change:
   - `ADMIN_EMAIL`: a mailbox you read. Required: the first start fails without it.
   - `STORAGE_DRIVER=s3`, `S3_BUCKET`, `S3_REGION=auto`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`.
   - Delete `SEED_DEMO_DATA` (ignored by V2, but it no longer means anything).
   - If `ADMIN_PASSWORD` already exists, check that it is at least 12 characters. If it doesn't, the Blueprint
     generates it.
   Saving may redeploy V1. V1 ignores these variables.
3. Check whether the service is managed by a Blueprint (Render → Blueprints). If it isn't, the database in
   `render.yaml` won't be created on merge: create a PostgreSQL 16 database named `ntoma-db` (Basic-256mb, Frankfurt)
   yourself and set the service's `DATABASE_URL` to its **internal** connection string, along with
   `SEED_ON_EMPTY=catalogue-and-admin`. If you forget, the V1 guard stops the deploy and V1 keeps running.

**Merging**

4. Merge the pull request into `initial-web-app`. With a Blueprint, review the sync before approving it: it should
   create `ntoma-db`, add `SEED_ON_EMPTY` and `ADMIN_EMAIL`, and point `DATABASE_URL` at `ntoma-db`. It must not show
   any resource being deleted. Removing `tailorconnect-db` from the file does not delete it *(Render docs)*.
5. In the deploy log, look for: "All migrations have been successfully applied", "Catalogue: 15 styles.",
   "Administrator: <your email> (password: from ADMIN_PASSWORD)", then the Next.js "Ready" line.

**Verifying**

6. `https://<app>/api/health` returns `{"ok":true}`. The banner reads "Payments are in test mode…". `/tailors` lists no
   businesses.
7. Log in as `ADMIN_EMAIL` with the `ADMIN_PASSWORD` value from the Environment tab. Check that
   `admin@ntoma.example` / `local-admin-password` and the demo accounts do **not** work.
8. Persistence: in `/admin/catalogue`, open a style and upload a photo. Then Manual Deploy → "Deploy latest commit"
   (or Restart). Once it is live again, the photo must still load and the admin login must still work.
9. The `ntoma-db` page should offer point-in-time recovery *(Render docs: paid plans only)*.

V1 sessions used a different cookie (`tc_session`), and V1 accounts don't exist in the new database. Nobody is
carried over.

## Rolling back

- **The first start failed** (missing admin variables, the V1 guard, a migration error): the app never started, so
  Render keeps the previous deploy (V1) live. Fix the variable and redeploy. A half-initialised `ntoma-db` is safe
  to start again: the seed runs until an administrator exists.
- **V2 is live but must be withdrawn:** revert the merge commit on `initial-web-app`. That restores V1's code and
  `render.yaml`, whose `DATABASE_URL` points at `tailorconnect-db`, which this launch never touched. `ntoma-db` and
  everything written to it stay as they are, ready for a later attempt.
  - Free Render databases expire 30 days after creation *(Render docs)*. If `tailorconnect-db` has already expired,
    V1 comes back on an empty database. V1 held only demo data, so nothing real is lost.
  - Don't point V2 at `tailorconnect-db`, and don't set `ALLOW_V1_CONVERSION`. That converts the V1 database, and V1
    can't run on it afterwards (`docs/MIGRATION_REHEARSAL.md` §6).
- Delete `tailorconnect-db` yourself once V2 has run well for long enough that you won't roll back.

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
| File storage | `STORAGE_DRIVER=s3`, `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Local disk, wiped on every Render deploy and restart: photos and verification documents disappear |
| Maps | none (OpenStreetMap tiles) | — OSM's tile policy forbids heavy commercial use; switch to a paid tile provider before scaling |

## File storage (Cloudflare R2)

Uploads are verification documents, message and dispute attachments (private, served only to people allowed to see
them) and style, fabric and portfolio photos (public, served by the app). The app streams every file itself, so the
bucket stays **private**. Don't enable public access or an r2.dev URL.

1. Cloudflare dashboard → R2 → Create bucket (for example `ntoma-uploads`). A location hint of Europe is close to
   Render's Frankfurt region.
2. R2 → Manage API tokens → Create API token: permission **Object Read & Write**, limited to that bucket. Copy the
   Access Key ID and Secret Access Key (the secret is shown once).
3. Set `S3_BUCKET` (the bucket name), `S3_REGION=auto`, and
   `S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com` (shown on the bucket's settings page; buckets created
   in the EU jurisdiction use `<ACCOUNT_ID>.eu.r2.cloudflarestorage.com`), plus `S3_ACCESS_KEY_ID`,
   `S3_SECRET_ACCESS_KEY` and `STORAGE_DRIVER=s3`.
4. `npm run storage:check`: write, read back, delete, and confirm that a missing key reads as missing. To check
   persistence across a restart: `npm run storage:check -- write launch-1` (note the sha256), restart or redeploy,
   then `npm run storage:check -- read launch-1 <sha256>`, then `npm run storage:check -- remove launch-1`.

The driver sends checksums only when an operation requires them, for compatibility with R2. A missing object returns
404. Any other storage error (wrong key, missing bucket, network) is logged as an error rather than shown as a missing
file.

## Monitoring

- Health: `/api/health` (Render health check) confirms the app and database are reachable.
- Logs are one JSON object per line (`level`, `event`, …) with no passwords, tokens or measurement values. Search for
  `"level":"error"`, `payment.amount_mismatch`, `payment.after_cancellation`, `notify.failed`, `maintenance.job_failed`.
- `/admin` shows queues (pending verifications, open disputes, failed refunds). `/admin/finance` → "Run reconciliation"
  checks that the ledger matches payments; run it daily once real money flows.
- Every sensitive admin action is in `/admin/audit`.
