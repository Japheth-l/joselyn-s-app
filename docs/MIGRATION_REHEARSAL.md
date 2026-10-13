# V1 → V2 migration and rollback: rehearsal runbook

> **Not needed for the planned launch (13 Oct 2026).** V1 held only demo data, so V2 launches on a new, empty database
> (`docs/DEPLOYMENT.md`, "Launching V2 on a new database"), and `scripts/migrate.mjs` now refuses to convert a V1
> database unless `ALLOW_V1_CONVERSION=true`. This runbook applies only if you later decide to convert a V1 database
> in place. Its commands that run `migrate.mjs` against a V1 copy need `ALLOW_V1_CONVERSION=true`
> (`scripts/rehearsal/rehearse.sh` sets it). The results below were recorded before the guard existed.

**Purpose.** Prove, before merging PR #2, that:

1. the V1 → V2 data migration is correct on a copy of the real production data; and
2. we can get back to a working V1 site from a backup.

Nothing in this runbook writes to production. The only commands that touch the production database are read-only:
`pg_dump`, `SHOW server_version` and the optional fingerprint `SELECT`s.

> **Status (12 Oct 2026).** Every step below was run end to end on a **local stand-in** for production. That stand-in
> was a V1 database produced by the real V1 app, plus clearly synthetic edge-case orders
> (`scripts/rehearsal/v1-edge-case-fixture.sql`). Section 10 lists the results.
>
> **The real Render data has not been rehearsed, and nothing has been done on Render.** Rollback counts as proven
> only for the stand-in. For production it is unproven until you complete section 8 using the real backup and the
> Render steps.

---

## 0. What actually runs on deploy (from the repository)

| | V1 (live: branch `initial-web-app` = commit `b749f0c`) | V2 (PR #2, branch `v2`) |
|---|---|---|
| Render start command | `npm run deploy:start` = `prisma db push --schema prisma/schema.postgres.prisma --skip-generate && tsx prisma/seed.ts --if-empty && next start` | `npm run deploy:start` = `node scripts/migrate.mjs && next start` |
| Schema management | `prisma db push` (no migration history) | `prisma migrate deploy` with `prisma/migrations/` |
| Health check (`render.yaml`) | `/login` | `/api/health` |

`scripts/migrate.mjs` does three things, in order:

1. If the database holds V1 data, it stops unless `ALLOW_V1_CONVERSION=true`. With the flag, and if
   `_prisma_migrations` doesn't exist, it marks `0000_baseline` as applied. That writes the `_prisma_migrations`
   table and nothing else.
2. It runs `npx prisma migrate deploy`, which applies `0001_v2`.
3. If `SEED_ON_EMPTY=catalogue-and-admin`, it runs the seed (catalogue and administrator only). The seed exits
   immediately when any user exists. (When this runbook was rehearsed, the setting was `SEED_DEMO_DATA=true`, which
   is now ignored.)

`0000_baseline` is the V1 schema; it is never executed against production. `0001_v2` (about 1,200 lines) makes these changes:

- **Renames two tables:** `Payout` → `LegacyPayout` (rows unchanged) and `Material` → `FabricListing` (money converted to integers).
- **Adds data:** creates 36 tables and fills them from V1 data.
- **Drops V1 columns:**

  | Table | Columns dropped |
  |---|---|
  | `User` | `role`, `verificationStatus`, `ghanaCardNumber` |
  | `Business` | `kind`, `ownerId` |
  | `BusinessStyle` | `price` |
  | `Style` | `category`, `yardsNeeded` |
  | `Review` | `clientId` |
  | `Order` | 20 columns, including `total`, `paymentRef`, `paidAt`, `measurements`, `clientAddress`, `clientId` |

**Consequence: the V1 backup is the only way back to V1.** The migrated database cannot be turned back into V1 by
any script in this repository.

## Prerequisites

- **PostgreSQL client tools** (`pg_dump`, `pg_restore`, `psql`) at the same or a newer major version than the Render
  server. Check the server with `SHOW server_version` (step 1b).
- **A PostgreSQL server for the rehearsal**, local (recommended) or a separate rehearsal database, at the same or a
  newer major version than Render.
  - The pre-flight check needs PostgreSQL 16 or newer *on the rehearsal server*. It uses `pg_input_is_valid`.
- **A checkout of the `v2` branch** with `npm ci` done, Node 22, and git history that contains `b749f0c`.
- **Never put the production URL in `.env`.** Prisma reads `.env` whenever `DATABASE_URL` isn't already set in the
  environment. Keep the production URL only in a shell variable, entered without echo:

  ```bash
  read -rs PROD_URL      # paste Render's External Database URL, press Enter; nothing is shown or saved to history
  ```

- **Treat the backup file as sensitive.** It contains personal data and password hashes. Encrypt it at rest
  (e.g. `gpg -c`), never commit it, and never paste it into chat or tickets.

---

## 1. Create and validate a backup of the Render V1 database

**1a. Decide how to stop writes.**
- V1 has no maintenance mode, so anything written after the backup is taken isn't in it.
- During the real release, take the final backup immediately before merging, at a quiet time, and announce a short
  window.
- Render lets you suspend a web service, but *not verified*: whether a suspended service accepts a deploy, and
  exactly how resuming behaves. Test that in a rehearsal before relying on it.

**1b. Check the server version (read-only).**

```bash
psql "$PROD_URL" -X -At -c 'show server_version'      # your pg_dump/pg_restore must be this major version or newer
```

**1c. Take the backup (read-only for the database).**

```bash
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
pg_dump --format=custom --no-password --file "ntoma-v1-$STAMP.dump" --dbname "$PROD_URL"
```

`pg_dump` reads a consistent snapshot. It doesn't block normal reads or writes; it does block schema changes while
it runs.

- **Paid Render database:** also create a Render logical backup from the database's *Recovery* page, as a second
  independent copy.
- **Free database:** Render keeps no backups, so this file is the only copy (section 9).

**1d. Validate the file.**

```bash
sha256sum "ntoma-v1-$STAMP.dump" | tee "ntoma-v1-$STAMP.dump.sha256"    # record; re-check before any restore
pg_restore --list "ntoma-v1-$STAMP.dump" | grep 'TABLE DATA'             # expect exactly these 10 V1 tables:
# Business, BusinessPhoto, BusinessStyle, Material, Notification, Order, Payout, Review, Style, User
```

**1e. Prove the backup is complete.**
- Restore it into an empty database (section 2), then compare fingerprints:
  - fingerprint the restored copy;
  - fingerprint production with the same **read-only** query;
  - the two outputs must be identical.
- The fingerprint is a row count and an MD5 of every row of every table. If writes happened between the backup and
  the production fingerprint, re-take both.

```bash
psql "$PROD_URL" -X -q -v ON_ERROR_STOP=1 -f scripts/rehearsal/table-fingerprints.sql > prod-fingerprints.txt   # read-only SELECTs
psql "$RESTORED_URL" -X -q -v ON_ERROR_STOP=1 -f scripts/rehearsal/table-fingerprints.sql > restored-fingerprints.txt
diff prod-fingerprints.txt restored-fingerprints.txt && echo "backup complete"
```

**1f. Store the backup.** Keep two encrypted copies in two places. Record the SHA-256, time, server version and
row counts.

---

## 2. Restore the backup into a separate, empty rehearsal database

Rehearsal database names **must** start with `ntoma_rh_`. `scripts/rehearsal/guard.sh` refuses any other name, any
non-local host (unless you set `REHEARSAL_REMOTE_HOST`), and a set `SEED_ON_EMPTY`.

```bash
REH=postgresql://postgres@localhost:5432        # your local server; adjust user/port
sha256sum -c "ntoma-v1-$STAMP.dump.sha256"
createdb --maintenance-db="$REH/postgres" ntoma_rh_v1          # fails if it already exists; never reuse a database
pg_restore --no-owner --no-acl --exit-on-error --dbname "$REH/ntoma_rh_v1" "ntoma-v1-$STAMP.dump"
psql "$REH/ntoma_rh_v1" -X -q -v ON_ERROR_STOP=1 -f scripts/rehearsal/table-fingerprints.sql   # compare with 1e
```

- `--no-owner --no-acl` is needed because the Render role (`tailorconnect`) doesn't exist locally.
- `--exit-on-error` stops at the first problem instead of leaving a half-restored database.
- **To rehearse on Render instead,** create a *separate* database whose name starts with `ntoma_rh_`, and set
  `REHEARSAL_REMOTE_HOST` to its host. On the free plan this isn't possible, because only one free database is
  allowed (section 9).

**Shortcut: steps 2–5 in one go.** One command runs steps 2–5 from the backup file alone, with no production
credentials needed:

```bash
REHEARSAL_PG=$REH scripts/rehearsal/rehearse.sh "ntoma-v1-$STAMP.dump" prod1
```

- It creates `ntoma_rh_prod1_{v1,migrated,failed,recovered}` and refuses if any already exists. It never drops anything.
- It writes evidence to `rehearsal-evidence/prod1/`, which git ignores.
- It exits non-zero if any check fails.

The manual steps below are what it does, plus the app-level checks it can't do.

---

## 3. Run the migration, and make sure it can only hit the rehearsal database

The exact production migration command is the first half of `npm run deploy:start`:

```bash
node scripts/migrate.mjs
```

Run it against a **fresh** restore, never against `ntoma_rh_v1`, which stays as the pre-migration reference:

```bash
createdb --maintenance-db="$REH/postgres" ntoma_rh_migrated
pg_restore --no-owner --no-acl --exit-on-error --dbname "$REH/ntoma_rh_migrated" "ntoma-v1-$STAMP.dump"
scripts/rehearsal/guard.sh "$REH/ntoma_rh_migrated" \
  && env -u SEED_ON_EMPTY ALLOW_V1_CONVERSION=true DATABASE_URL="$REH/ntoma_rh_migrated" node scripts/migrate.mjs 2>&1 | tee migrate.log
```

How this makes sure the target is the rehearsal database:

- `DATABASE_URL` is set **inline for this one command**. Never `export` it, and never put a production URL in `.env`.
  An inline value overrides `.env`; Prisma loads `.env` only when the variable is unset.
- `guard.sh` checks the name prefix and host, and asks the server for `current_database()`.
- Prisma prints the target in its own log. Confirm `migrate.log` contains
  `Datasource "db": PostgreSQL database "ntoma_rh_migrated" … at "localhost:…"`. If it names anything else, stop.
- `SEED_ON_EMPTY` is removed for the rehearsal. The old `SEED_DEMO_DATA=true` was tested separately and added nothing
  to a populated database (section 10). The seed it triggers now also skips a populated database.

---

## 4. What to compare before and after

Capture the V1 side from `ntoma_rh_v1` and the V2 side from `ntoma_rh_migrated`. The scripts are all read-only.

| Script | Run on | What it checks |
|---|---|---|
| `scripts/rehearsal/v1-preflight.sql` | V1 copy | Data that would make the migration **fail** (`FAIL`), or migrate in a way that needs a decision (`REVIEW`) |
| `scripts/rehearsal/v1-snapshot.sql` | V1 copy | 34 `key|value` lines |
| `scripts/rehearsal/v2-compare.sql` | migrated copy | The same 34 keys, computed from the V2 tables. `diff` against the V1 snapshot **must be empty** |
| `scripts/rehearsal/v2-invariants.sql` | migrated copy | 18 checks that must all be `PASS` |
| `scripts/rehearsal/table-fingerprints.sql` | any | Row count and MD5 of every row, per table: backup completeness and recovery equality |

**The 34 comparisons** (V1 key → V2 source):

- **Counts and IDs:** the row count and an MD5 of all IDs (or of ID tuples) for users, businesses, styles, business
  styles, fabric (`Material` → `FabricListing`), orders, payouts (`Payout` → `LegacyPayout`), reviews, notifications
  and business photos. The same IDs must survive.
- **Logins:** an MD5 of every `id:email:passwordHash`. Equal means every user can log in with the same password.
  Also an MD5 of every `id:name:phone`.
- **Relationships:**
  - business → owner (V1 `Business.ownerId` = V2 `Membership(role OWNER)`)
  - order → customer (`clientId` = `customerId`)
  - order → business
  - review → order, business, customer and rating
  - payout → user, order, role and status
- **Money, in pesewas:**

  | V1 | must equal V2 |
  |---|---|
  | Number of PAID orders and the sum of `round(total×100)` | LEGACY `Payment` rows marked SUCCEEDED, and their sum |
  | Each paid order's `paymentRef` (or `LEGACY-<id>`) | the `Payment.providerRef` |
  | Sum of all payouts | sum of `LegacyPayout` |
  | Sum of payouts not yet paid | total `PARTNER_PAYABLE` in the ledger (still owed to partners) |
  | Labour prices, fabric prices and stock quantities | the V2 integer columns |

- **Measurements:** the number of orders with measurements equals the number of migrated measurement records.

**The 18 integrity checks** (`v2-invariants.sql`):

- **Migration state:** both migrations applied and none unfinished.
- **Ledger:**
  - total equals successful payments;
  - each order's paid amount equals its payments;
  - no negative held funds, partner balances or platform revenue entries;
  - every payable has a party.
- **Orders:**
  - every order has a quotation;
  - accepted quotation lines add up to the total;
  - every status is a V2 status;
  - every order has a "migrated" event;
  - measurement links are valid.
- **Users and businesses:** every user has the customer role; at least one admin; each business has exactly one owner.
- **Derived values:** ratings equal the real reviews; stock equals the opening stock movements.

**Also check by hand:**

1. **Order status mapping.** List V1 status, payment status and fulfilment next to the V2 status (query in section 10).
   Expected:

   | V1 | V2 |
   |---|---|
   | PLACED | QUOTE_REQUESTED |
   | DECLINED or CANCELLED | CANCELLED |
   | accepted but unpaid | AWAITING_PAYMENT |
   | AWAITING_MEASUREMENT (paid) | AWAITING_MEASUREMENTS |
   | MEASURED | MEASUREMENTS_CONFIRMED |
   | SEWING | IN_PRODUCTION |
   | READY, paid, delivery | DELIVERY_ASSIGNED (open delivery leg) |
   | READY (pickup) | READY |
   | OUT_FOR_DELIVERY | IN_TRANSIT |
   | COMPLETED | COMPLETED |

2. **Five real orders.** Pick five covering different states. Compare the V1 order page (on the recovered V1 app,
   section 6) with the V2 order page (V2 app on `ntoma_rh_migrated`): customer, business, items, amounts, status.
3. **Real logins.**
   - Start the V2 build on `ntoma_rh_migrated`:

     ```bash
     DATABASE_URL="$REH/ntoma_rh_migrated" npx next start -p 3101
     ```

   - Log in with accounts whose passwords you know: your admin, plus at least one customer and one business
     account you control.
   - Automated version:

     ```bash
     CHECK_BASE_URL=http://localhost:3101 CHECK_USERS="you@example.com:/orders" CHECK_PASSWORD=… \
       npx playwright test -c scripts/rehearsal/playwright.config.ts
     ```

   - Logging in proves session and password handling against the migrated rows; the login MD5 equality covers
     every other user.

**Expected differences (intended, not errors):**

- **Ratings:** recomputed from real reviews. V1 stored typed-in values, including invented demo values.
- **Cancelled and declined orders:** show a total of 0. V1's quoted figure is kept in the order's "migrated" event.
- **Demo accounts:** `@demo.gh` accounts are flagged as demo.
- **Sessions:** everyone must log in again, because V1's `tc_session` cookie isn't read by V2.
- **Timeline entries:** new "Carried over from V1" entries are added.

**Pre-flight `REVIEW` items to decide before the release:**

- `orders.paid_but_cancelled_or_declined` migrates as held customer money on a cancelled order. It needs a manual
  refund decision.
- `orders.total_not_sum_of_parts` produces an accepted quote whose lines don't add up. The invariants will also fail.
- `payouts.*` items mean a payout doesn't match its order.

---

## 5. Test a failed migration safely (disposable databases only)

Two tests, each on its own new `ntoma_rh_*` restore:

**5a. Realistic data failure.**
- Find data the pre-flight marks `FAIL` (for example a measurement like `"36in"`). If the real backup has none, create
  one on a disposable copy only:

  ```bash
  createdb --maintenance-db="$REH/postgres" ntoma_rh_failcase
  pg_restore --no-owner --no-acl --exit-on-error --dbname "$REH/ntoma_rh_failcase" "ntoma-v1-$STAMP.dump"
  psql "$REH/ntoma_rh_failcase" -X -c "UPDATE \"Order\" SET measurements = '{\"chest\":\"36in\"}' WHERE id = (SELECT id FROM \"Order\" WHERE measurements IS NOT NULL LIMIT 1)"
  psql "$REH/ntoma_rh_failcase" -X -q -v ON_ERROR_STOP=1 -f scripts/rehearsal/table-fingerprints.sql > before.txt
  scripts/rehearsal/guard.sh "$REH/ntoma_rh_failcase" && env -u SEED_ON_EMPTY ALLOW_V1_CONVERSION=true DATABASE_URL="$REH/ntoma_rh_failcase" node scripts/migrate.mjs   # must fail
  psql "$REH/ntoma_rh_failcase" -X -q -v ON_ERROR_STOP=1 -f scripts/rehearsal/table-fingerprints.sql > after.txt
  diff before.txt after.txt          # expected: only a new _prisma_migrations line
  ```

- Expected result:
  - `migrate.mjs` exits non-zero with `P3018` and the database error;
  - every V1 table is byte-identical;
  - `_prisma_migrations` shows `0000_baseline` applied and `0001_v2` unfinished.

**5b. Failure after every real statement.** `rehearse.sh` copies `prisma/` to a temporary folder, appends
`SELECT 1/0;` to the end of `0001_v2`, and applies it. This proves that even the final, column-dropping statements
roll back as a whole.

**After a failure: is V1 still OK?**
- Start V1 exactly as Render would on the failed database (section 6, `run-v1.sh`).
- Expected: `prisma db push` reports "already in sync" (it ignores `_prisma_migrations`), the seed skips, and logins
  work. This matters because a V1 instance that is still live re-runs its start command whenever it restarts.

**Recovering forward after a failure:**

1. Fix the data on a copy and prove it.
2. Mark the failed attempt as rolled back:

   ```bash
   env DATABASE_URL="$REH/ntoma_rh_failcase" npx prisma migrate resolve --rolled-back 0001_v2
   ```

3. Re-run `migrate.mjs`. All checks must pass.

In production the same `resolve` would be needed: Prisma refuses further migrations while a failed one is recorded.

---

## 6. Recover: restore the V1 backup and run V1 on it

**6a. Rehearse it (local).** Do this after a successful migration (`ntoma_rh_migrated`), with the V2 app having
written to it, so it's realistic.

```bash
sha256sum -c "ntoma-v1-$STAMP.dump.sha256"
createdb --maintenance-db="$REH/postgres" ntoma_rh_recovered
pg_restore --no-owner --no-acl --exit-on-error --dbname "$REH/ntoma_rh_recovered" "ntoma-v1-$STAMP.dump"
psql "$REH/ntoma_rh_recovered" -X -q -v ON_ERROR_STOP=1 -f scripts/rehearsal/table-fingerprints.sql > recovered.txt
diff prod-fingerprints.txt recovered.txt && echo "identical to the V1 backup"
scripts/rehearsal/run-v1.sh "$REH/ntoma_rh_recovered" 3102       # builds V1 (b749f0c) once, then `npm run deploy:start`
```

Expected:
- the log shows `The database is already in sync with the Prisma schema.` and `Database already has data; skipping demo seed.`;
- the app starts;
- log in as each role you have credentials for:
  - customer: `/orders`
  - business: `/business`
  - rider: `/rider`
  - measurer: `/measurer`
  - admin: `/admin`
- the automated version is the same `CHECK_…` command as in section 4, pointed at port 3102.

**6b. The production procedure.** This is written, not rehearsed on Render; parts depend on Render behaviour that
I could not verify (section 9).

Rules learned from the rehearsal:

- **Never** use `pg_restore --clean` over the migrated database. Tested on a disposable copy:
  - with `--single-transaction` it aborts, because V2 foreign keys block dropping V1 tables;
  - without it, it produced 38 errors and a mixed database whose V1 tables no longer matched the backup, and V2
    tables were left behind.
- **Never** run `prisma db push --force-reset` or `--accept-data-loss`. When V1 refuses to start, Prisma's error
  suggests `--force-reset`; that deletes every table.
- **Never** let V2 code start against the restored V1 database. Its start command *will migrate it again*: that is
  its job. This includes a free-plan spin-up or restart of a V2 instance.
- **Never** deploy V1 code against the migrated database (section 7).

**Production order of operations:**

1. **Stop V2 from restarting.** Turn off auto-deploy and suspend the web service. *Unverified:* the exact Render
   behaviour of suspend/resume, and whether a free instance re-runs its start command on wake-up. Assume it does.
2. **Keep a copy of the V2 state.** `pg_dump` the migrated production database, so writes made after the migration
   can be reviewed and re-entered by hand.
3. **Put the V1 data back.** Choose one of:
   - **A. New database (preferred; paid plan).** Create a new Render Postgres, or a point-in-time-recovery instance
     from before the merge (it restores into a *new* instance). If you use a new database, restore the backup into
     it as in 6a and verify the fingerprints.
   - **B. Same database, empty schema.** On the suspended production database run
     `DROP SCHEMA public CASCADE; CREATE SCHEMA public;`, then restore:

     ```bash
     pg_restore --no-owner --no-acl --single-transaction --exit-on-error --dbname "$PROD_URL" backup.dump
     ```

     This was tested on a disposable copy and is identical to the backup. It **destroys the V2 database**, so only
     do it after step 2.
     - *Unverified on Render:* that the database user owns `public` and may drop and recreate it. Test it on a
       rehearsal Render database first.
4. **Put V1 code back.** Revert the PR #2 merge on `initial-web-app`, so any deploy builds V1, or deploy commit
   `b749f0c`.
   - **Option A:** point the service's `DATABASE_URL` at the new database.
     - *Unverified:* whether Blueprint sync would reset `DATABASE_URL` back to `tailorconnect-db`
       (`render.yaml` uses `fromDatabase`).
     - Either update `render.yaml` on the V1 branch, or disable Blueprint auto-sync, first.
5. **Resume and verify.** Resume the service and deploy V1. Check:
   - the deploy log says "already in sync";
   - `/login` works;
   - the fingerprints of the production database equal the backup's.

Anything written after the backup was taken is not in V1 again until re-entered from the step 2 copy.

---

## 7. Is it safe to deploy V1 against a migrated V2 database?

**No.** This was tested on a disposable copy of the migrated database, with V1 built from `b749f0c` and Prisma
6.19.3 as pinned by V1's lockfile.

- **V1's own start command refuses to run.** `prisma db push` reports 12 changes it cannot execute, for example
  required `User.role`, `Order.clientId` and `Business.ownerId` with existing rows. The command exits 1, and
  `next start` never runs.
  - The database was byte-identical afterwards, so no data was lost: **the result is an outage, not data loss.**
  - On Render, the deploy then fails its health check. Per Render's documentation the previous instance keeps
    serving, but this is *not verified on this service or on the free plan*.
- **What V1 would need to change.** `prisma migrate diff` (it executes nothing) shows that matching V1's schema
  would take 37 `DROP TABLE` statements, payments and the ledger among them, plus dozens of dropped and added columns.
  The only way past the refusal is `--force-reset` or `--accept-data-loss`. **Both destroy V2 data. Never use them.**
- **The V1 app itself doesn't work on V2 data.** Starting V1's `next start` directly, skipping the push, serves
  pages, but every login fails: ``The column `User.role` does not exist``. The database was unchanged.

**Conclusion:** after `0001_v2` has run, rolling back the code alone is not a rollback. The database must be
restored first (section 6).

**The reverse case is fine.** V1 against a database where `0001_v2` *failed* starts and works normally (section 5).

---

## 8. Evidence you must collect before calling the migration and rollback "proven"

Use the **real Render backup**. Keep everything in `rehearsal-evidence/<tag>/`, which git ignores, and store it with
the backup.

| # | Evidence | Pass condition |
|---|---|---|
| 1 | Backup SHA-256, timestamp, server version, `pg_restore --list` table list | 10 V1 tables with data |
| 2 | Production vs restored fingerprints (`table-fingerprints.sql`) | identical (no writes in between) |
| 3 | `04-preflight.txt` | no `FAIL`; every `REVIEW` has a written decision |
| 4 | `05-migrate.log` | names the `ntoma_rh_…` database; "All migrations have been successfully applied"; duration noted |
| 5 | `06-diff.txt` (V1 snapshot vs V2 compare) | empty (all 34 match) |
| 6 | `07-invariants.txt` | all 18 `PASS` |
| 7 | Order-status mapping listing + 5 orders compared by eye | every row as in section 4 |
| 8 | V2 logins on the migrated copy (`login-check`) with your own accounts | all pass |
| 9 | `08-*` forced failure | V1 tables identical; no V2 tables |
| 10 | Realistic failure (5a) + V1 start on that database | migration fails cleanly; V1 starts "already in sync"; logins pass |
| 11 | `migrate resolve --rolled-back` + retry | succeeds; checks 5–6 pass |
| 12 | `09-recovered-fingerprints.txt` | identical to the backup |
| 13 | V1 app (`run-v1.sh`) on the recovered copy + logins for every role you can | "already in sync", seed skipped, all logins pass |
| 14 | `10-v1-push-on-v2.sql` and a V1 start attempt on a migrated copy | refuses; database unchanged |
| 15 | Render-side rehearsal of the production procedure (6b) on a **non-production** Render service and database: suspend/resume, Blueprint/`DATABASE_URL` behaviour, schema reset permissions, PITR or new-database restore | each step behaves as written |
| 16 | A dated sign-off: who ran it, on which backup (SHA-256), which commit of `v2` | — |

Until items 1–14 pass on the real backup **and** item 15 is done on Render, call rollback "rehearsed locally",
not "proven".

---

## 9. Render plan limitations

From Render's documentation as returned by web search on 12 Oct 2026. I couldn't open Render's pages directly from
this environment, so re-check each point in the dashboard before relying on it.

| Topic | What Render documents | Effect here |
|---|---|---|
| Free Postgres backups | No point-in-time recovery or backups for free databases | Your `pg_dump` file is the **only** backup. Make it before anything else. |
| Free Postgres expiry | Free databases expire **30 days after creation**, then a **14-day grace period** to upgrade, after which the database **and all data are deleted** | Check the creation date of `tailorconnect-db` in the dashboard now. If it was created around 11 Oct 2026, it expires around 10 Nov 2026. That is an estimate, not checked. |
| Number of free databases | One free database at a time per workspace/account | You can't create a second free database for a Render-side rehearsal or for recovery option A. **Needs a paid database.** |
| Point-in-time recovery | Paid instances only. Window: last **3 days** (Hobby workspace) or **7 days** (Professional+). Restores into a **new** instance (copies the IP allow list); not within 10 minutes of now | Option A in 6b needs a paid plan, and must happen within the window after the merge |
| Logical backups | On-demand exports from the *Recovery* page, kept 7 days | Paid-plan convenience; still keep your own `pg_dump` |
| Failed deploys | A new instance gets traffic only after passing health checks; otherwise the previous instance keeps serving | Expected to protect against a failed migration. **Not verified for the free plan** (a third-party source claims free deploys aren't zero-downtime). |
| Free web services | Spin down after 15 minutes idle; the next request starts the service again | Assume each wake-up re-runs the start command. For V2 that means re-running `migrate.mjs` (harmless when already migrated; dangerous after a restore, per 6b). *Re-running on wake-up is my inference, not verified.* |
| Cron jobs | Paid | Not needed for the migration |
| External access | External Database URL + access control (IP allow list) | *Not verified:* whether your database allows connections from your machine's IP. Check *Access Control* before step 1. |

**Steps that need a paid plan:**
- point-in-time recovery or a Render logical backup;
- a second database (for a Render-side rehearsal, or recovery option A);
- avoiding the free-database expiry.

**Possible on the free plan:**
- `pg_dump` / `pg_restore` over the external URL, *if* access control allows your IP;
- the whole local rehearsal (sections 1–8, items 1–14).

---

## 10. Results of the local rehearsal (stand-in data, 12 Oct 2026)

**Environment:**
- PostgreSQL 16.15 local server and client.
- V2 = branch `v2`. V1 = commit `b749f0c`, built with its own `npm run deploy:build`; same lockfile as production.

**Stand-in data:**
- **Base:** a V1 database produced by the real V1 app: 15 users, 9 businesses, 3 orders.
- **Added by `v1-edge-case-fixture.sql`:** 10 synthetic orders covering every V1 status, paid and unpaid accepted
  orders, home visits, open and in-transit deliveries, a fabric order, a fractional total (GH₵ 123.45), and paid and
  pending payouts.
- **Totals:** 13 orders, 9 paid, GH₵ 4,187.45 collected, 7 payouts.

| Step | Result |
|---|---|
| Backup → restore into new DB | `pg_restore --list`: 10 tables; fingerprints of all 10 tables identical |
| Pre-flight | no `FAIL`, no `REVIEW` |
| Migration (`node scripts/migrate.mjs`, inline `DATABASE_URL`, guard) | applied in 3–4 s; log named `ntoma_rh_…` |
| 34 V1 → V2 comparisons | all identical, including login hashes, relationships, GH₵ 4,187.45 paid = payments, GH₵ 173.50 unpaid payouts = partner payables |
| 18 invariants | all PASS (ledger 418,745 = payments 418,745 pesewas) |
| Order mapping (13 orders) | every order as expected; GH₵ 123.45 → 12,345 pesewas |
| V2 logins on migrated copy | customer, business owner, rider, measurer: pass, each sees their migrated data |
| `SEED_DEMO_DATA=true` (as `render.yaml`) | "Database already has users; skipping the seed"; comparisons still identical |
| Realistic failure (`"36in"` measurement) | pre-flight `FAIL` predicted it; migration failed with `22P02`; all V1 tables identical; only `_prisma_migrations` added |
| V1 started (`deploy:start`) on that failed database | "already in sync", seed skipped, customer and business logins pass |
| Recover forward (fix data, `resolve --rolled-back`, retry) | applied; all 18 invariants PASS |
| Forced failure after the last statement | V1 tables identical; no V2 tables |
| Restore backup into new DB after migration | identical to backup |
| V1 (`deploy:start`) on recovered DB | "already in sync", seed skipped; customer, business, rider, measurer logins pass and show their data |
| V1 start on migrated DB | refused (12 non-executable changes), exit 1, database unchanged |
| V1 `next start` on migrated DB (push skipped) | pages load; every login fails (`User.role` missing); database unchanged |
| `pg_restore --clean` over migrated copy | single transaction: aborted. Without: 38 errors, V1 tables differ from backup, V2 tables remain. **Unsafe.** |
| Empty `public` schema + restore (disposable copy) | identical to backup |
| `rehearse.sh` | good backup: all PASS, exit 0. Backup with bad data: 4 FAIL, exit 1. |

**Not covered by this rehearsal:**
- the real production data and its edge cases;
- Render behaviour: suspend, Blueprint sync, PITR, schema-reset permissions, free-plan deploys;
- the admin login (V1's admin password was generated by Render and isn't known here);
- migration duration on the real data volume;
- concurrent writes during the switchover;
- uploaded photos (stored on Render's disk, not in the database).
