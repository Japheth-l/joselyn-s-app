# Ntoma V2: final report

Branch `v2`, draft pull request #2 into `initial-web-app`. Nothing has been merged or deployed; the live site still
runs V1.

## 1. Existing architecture (V1)

- Next.js 15 (App Router, server actions), React 19, Tailwind 4, Prisma.
- SQLite for local development; Render PostgreSQL (created with `prisma db push`) in production.
- Single-role users: `User.role`, with CLIENT, BUSINESS, MEASURER, RIDER and ADMIN.
- Money stored as floating-point cedis; order statuses changed directly by pages; no migration history.
- Paystack payments, with a "demo" fallback when no key was set. Arkesel SMS. Photos on local disk.
- No tests. Details: `docs/V2_AUDIT.md`.

## 2. V2 architecture

- **Database:** PostgreSQL everywhere, with versioned migrations.
- **Layers:** a service layer (`src/server/services`) holds every business rule and permission check. Pages are server components that read after an access check. Forms call server actions that wrap services.
- **Money:**
  - Integer pesewas throughout.
  - An append-only ledger with idempotency keys. The invariant "ledger total = successful payments" is checked by tests and by an admin reconciliation.
- **Orders:**
  - A transition table with conditional updates, so two people can't race the same order, and an audit event for every change.
  - Payment state is kept separate from order state.
- **Inventory:** reservations made with single conditional SQL statements, plus a movement ledger.
- **Matching:** a pure, deterministic engine; the database loader uses only real prices, stock, queue sizes and reviews.
- **Payments:** a provider interface with Paystack and a sandbox. Server-side verification; idempotent webhooks.
- **Integrations:** notifications, storage and SMS/email each sit behind an interface and record their real outcome.

Details: `docs/V2_ARCHITECTURE.md`.

## 3. Features implemented

- **Accounts:**
  - Sign-up, login (rate-limited, timing-safe), email verification, password reset.
  - Revocable sessions: sign out everywhere, password change and suspension all revoke.
  - Multiple roles per account.
  - Privacy: data export and account deletion (anonymised).
- **Businesses:** organisations with owner/manager/staff, verification applications with private documents, profile, opening hours, service radius, capacity, portfolio and team.
- **Catalogue:** categories, 15 styles with configurable design options, and business-submitted designs reviewed by admins.
- **Fabric:** listings and stock with reservations, consumption and a movement history; buying fabric with pickup, delivery, or delivery to your tailor.
- **Ordering:**
  - A seven-step wizard covering style, details and reference photos, fabric source, measurements, budget and date, and tailor matching.
  - Matching shows reasons and exclusions with plain-language suggestions.
  - Quote requests to up to 5 businesses.
- **Quotes:**
  - Itemised quotes, with the service fee and measurement visit shown as separate lines, side-by-side comparison, and expiry.
  - Revisions after acceptance only with the customer's approval.
- **Measurements:** profiles per family member with revisions; saved, self-entered, home visit (with overlap prevention) or workshop; professional draft/submit and corrections; customer confirmation.
- **Production and handover:**
  - Production tracking.
  - Pickup or delivery chosen when the order is ready.
  - Delivery legs that riders accept; customer contact is shown only after acceptance.
  - Six-digit handover codes, stored hashed and rate-limited, for both pickup and delivery; failed-delivery retry.
- **Payments:**
  - Deposit and balance via Paystack or sandbox, with server-side verification and an idempotent webhook.
  - Automatic refund on cancellation (minus a visit that happened) and of payments that arrive after cancellation.
  - Admin refunds; manual Mobile Money payouts recorded against owed balances; reconciliation.
- **Communication and support:** per-order messaging with photos, in-app/SMS/email notifications with admin-editable templates, reviews (verified orders only) with business replies and moderation, disputes with evidence, internal notes and remedies, support tickets.
- **Admin portal:** permission-scoped sections (SUPER, USERS, VERIFY, CATALOGUE, ORDERS, DISPUTES, FINANCE, CONFIG, AUDIT), reports that exclude demo data by default, settings, and an audit log.
- **Scheduled jobs (`/api/cron`):**
  - Quote expiry and unpaid-order cancellation (releases stock).
  - Auto-completion, visit reminders, expiry of visits nobody accepted.
  - Payment re-verification.
- **Interface:** mobile-first; demo-mode banner and demo badges; policy pages (terms, privacy, cancellations/refunds/disputes).

## 4. Important files and modules

- `prisma/schema.prisma`, `prisma/migrations/0000_baseline`, `prisma/migrations/0001_v2`, `scripts/migrate.mjs`, `prisma/seed.ts`.
- `src/server/`:
  - `order-machine.ts`, `order-flow.ts`, `ledger.ts`, `inventory.ts`, `matching.ts`, `pricing.ts`
  - `authz.ts`, `actor.ts`, `session.ts`, `rate-limit.ts`, `files.ts`
  - `payments/*`, `notifications/*`, `storage/*`
- `src/server/services/`: `accounts`, `businesses`, `catalogue`, `orders`, `payments`, `deliveries`, `appointments`, `measurements`, `community`, `admin`, `maintenance`, `matching-data`, `inbox`.
- `src/app/`:
  - Public pages: `/`, `/styles`, `/fabrics`, `/tailors`, `/policies`.
  - Customer pages: `/account`, `/order/new`, `/orders`, `/measurements`, `/support`, `/settings`, `/notifications`.
  - Portals: `/biz/[id]/*`, `/pro/*`, `/admin/*`.
  - Routes: `/pay/*`, `/api/*`, `/files/[id]`, `/uploads/[...key]`.
- `src/components/ui/*`, `src/middleware.ts`, `next.config.ts` (security headers).
- V1 pages and helpers were removed; they remain in git history.

## 5. Database changes and migrations

- `0000_baseline` is the exact V1 schema. On deploy, an existing V1 database is marked as already at the baseline.
- `0001_v2` (about 1,200 lines) upgrades in place and deletes no records:
  - Roles become role assignments; agents become profiles plus verification applications.
  - Businesses become organisations with an owner membership.
  - Money moves to pesewas; quantities move to hundredths.
  - Order statuses are mapped to the new lifecycle; quotations and lines are created from V1 orders.
  - Payments become legacy payments plus ledger entries; V1 payouts become ledger payouts.
  - Measurements become profiles and records; appointments and deliveries become their own tables.
  - Ratings are recomputed from real reviews.
  - Demo accounts (`@demo.gh`) are flagged as demo.
- Verified:
  - Applies cleanly to an empty database, and the schema matches with no drift.
  - Applies to a copy of V1 data: ledger total GH₵ 1,114.00 equals successful payments GH₵ 1,114.00, and partner balances are zero after payouts.
  - A deliberately failing run rolls back completely.
  - Re-running the seed is safe; `--if-empty` skips populated databases.

## 6. Tests run and their actual results

- `npm test` (Vitest): **86 passed, 0 failed** (13 Oct 2026).
  - Launch path (`tests/integration/launch.test.ts`, 15 tests). Each runs the production start script on its own
    new database: a first start creates exactly the catalogue and one administrator, with no demo data, even when
    `SEED_DEMO_DATA=true` is set. Restarts change nothing. Missing or weak administrator credentials stop the start
    before anything is written. A V1 database is refused unchanged without `ALLOW_V1_CONVERSION=true`.
  - Seed policy and storage driver unit tests: what counts as a local database, credential rules, and S3 error handling.
  - The 14 server-side required scenarios run against a real PostgreSQL database.
  - Concurrency is tested directly: 10 simultaneous fabric orders, 3 concurrent duplicate webhooks.
  - Plus maintenance jobs and unit tests for matching, money, quantities, pricing and the state machine.
- `npm run test:e2e` (Playwright, Chromium, 360 × 740): **10 passed, 0 failed.**
  - A full browser order: request, quote, accept, sandbox deposit, production, pickup, balance, a wrong code refused then the right code accepted, completion and review.
  - Access control, security headers, cron authentication.
  - No horizontal overflow on public, customer, business, professional and admin pages (scenario 15).
- Bugs found and fixed while testing:
  - A "pending" provider check blocked the later success.
  - Late payments on cancelled orders were not refunded.
  - Handover codes could be brute-forced.
  - Two-tap confirm buttons submitted on the first tap.
- The mapping of scenarios to tests is in `docs/V2_IMPLEMENTATION_PLAN.md`.

## 7. Build and type-check

- `npx tsc --noEmit`: no errors.
- `next build`: succeeds. 75 routes; shared first-load JS 103 kB; middleware 40 kB.

## 8. Security checks and outstanding risks

**Done:**
- Authorisation in services, not in the UI. Strangers get 404s rather than 403s, so records can't be probed.
- Session versioning; bcrypt; rate limits on login, reset, sign-up, uploads, messages, matching and handover codes.
- Uploads checked by content; private files behind permission checks.
- Signed webhooks with timing-safe comparison; the amount and currency are verified.
- No card or PIN data ever reaches the app.
- Customer address and phone go only to the assigned rider or professional; the customer's budget is hidden from businesses.
- Security headers (HSTS, frame-deny, nosniff, referrer, permissions policy); safe login redirects.
- Audit log of sensitive actions; logs contain no passwords, tokens or measurement values.

**Outstanding:**
- No external penetration test, and no formal accessibility audit or load test.
- Content Security Policy not yet set.
- Uploaded images aren't re-encoded (EXIF metadata, including location, is kept).
- Rate limits are per account/IP and could be tightened with a CAPTCHA.
- The Paystack integration hasn't been exercised against Paystack's live API (no key available).
- The S3 driver hasn't been tested against a real bucket.
- Verification documents are only as trustworthy as the administrators who review them.

## 9. Environment variables and integrations

- **Required:** `DATABASE_URL`, `AUTH_SECRET`.
- **App:** `APP_URL`, `PAYMENTS_MODE`, `CRON_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `DEMO_PASSWORD` (local only), `SEED_ON_EMPTY`, `ALLOW_V1_CONVERSION`.
- **Payments:** Paystack (`PAYSTACK_SECRET_KEY`, plus the webhook URL set in Paystack).
- **SMS:** Arkesel (`ARKESEL_API_KEY`, `SMS_SENDER_ID`).
- **Email:** Resend (`RESEND_API_KEY`, `EMAIL_FROM`).
- **Storage:** `STORAGE_DRIVER=s3` with `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`.

Placeholders are in `.env.example`; `render.yaml` declares them all.

## 10. Running locally

See `README.md` → "Running it locally" (PostgreSQL, `.env`, `prisma migrate deploy`, `npm run db:seed`, `npm run dev`).

## 11. Deployment

See `docs/DEPLOYMENT.md`, "Launching V2 on a new database". V1 held only demo data, so V2 starts on a **new, empty,
paid** Render database (`ntoma-db`) instead of converting V1's. The web service keeps its name (`tailorconnect`), so
its URL doesn't change. The V1 database is left untouched, and rolling back means reverting the merge.

- The first start creates the schema, the 10 garment categories, the 15 catalogue styles and one administrator from
  `ADMIN_EMAIL` / `ADMIN_PASSWORD`. It fails closed (the app doesn't start) if either is missing or the password is
  weak. Demo users and businesses are never seeded outside a local database.
- `scripts/migrate.mjs` refuses to convert a V1 database unless `ALLOW_V1_CONVERSION=true`, so a `DATABASE_URL`
  still pointing at V1 stops the deploy instead of converting it.
- Uploads need S3-compatible storage (Cloudflare R2 recommended). The local disk is wiped on every Render deploy.

All of this is tested locally (`tests/integration/launch.test.ts`, plus a run of the production start command with
an upload, a restart, and the file retrieved again from an S3 emulator). Nothing has been run on Render, and no real
R2 bucket has been tested yet.

The in-place conversion path and its rollback runbook (`docs/MIGRATION_REHEARSAL.md`) remain for reference. They
were rehearsed on a local stand-in for V1 only.

## 12. Incomplete features and why

- **Real payments:** the Paystack code is written but untested against Paystack (no account or key). It stays in sandbox until tested with Paystack test keys.
- **Automatic payouts:** not built. Payouts are sent by Mobile Money and recorded. Automating them needs Paystack Transfers and a licensing review, and the spec forbids an unauthorised wallet.
- **WhatsApp notifications:** not implemented; the option is shown as unavailable.
- **SMS and email:** implemented, but nothing is sent until Arkesel/Resend keys are added. Each skip is recorded.
- **Live rider tracking on a map:** not built. Riders' live location isn't collected; only status steps are shared.
- **Multi-language interface (Twi, Ga, Ewe…):** not built. A `locale` field exists.
- **The Expo mobile app:** unchanged. It wraps the website, so it gets V2 automatically, but hasn't been retested.

## 13. Known limitations and estimated monthly costs

**Limitations:**
- OpenStreetMap tiles aren't for heavy commercial use.
- Local photo storage is wiped on every Render deploy and restart, so production needs R2 (or another S3 bucket).
- The V2 database is on a paid plan. The old free V1 database expires 30 days after it was created.
- Free web services sleep when idle (slow first load).
- Matching uses straight-line distance, not road distance.
- Delivery fees are a flat base plus a per-kilometre rate.

**Rough monthly costs:** these are estimates from public price lists as I know them, so check the current prices before budgeting.

| Item | Estimate |
|---|---|
| Render web service (Starter) | about US$7 |
| Render PostgreSQL (smallest paid plan, with backups) | about US$6–20 |
| Render cron job | about US$1 |
| Object storage (e.g. Cloudflare R2) | free up to 10 GB, then about US$0.015/GB |
| Email (Resend) | free up to about 3,000 emails/month, then about US$20 |
| SMS (Arkesel) | a few pesewas per message, prepaid |
| Domain | about US$10–15/year |
| Paystack | no monthly fee; about 1.95% per local transaction (taken from each payment) |
| Paid map tiles at scale | variable |

Expect roughly US$15–50 a month before SMS volume and transaction fees.

## 14. Recommended next steps before inviting real users

1. Get a lawyer to review the terms, privacy and refund policies (marked as unreviewed in the app). Register with Ghana's Data Protection Commission.
2. Move to paid Render plans with database backups, and set up S3/R2 storage and a scheduler for `/api/cron`.
3. Open Paystack, run the whole flow with test keys (deposit, balance, refund, webhook), then switch to live.
4. Add Arkesel and Resend keys and register the SMS sender ID.
5. Write a verification procedure for administrators (what documents, how to check Ghana Card/registration) and verify the first real businesses. The new production database has no demo businesses.
6. Run a small pilot with a few tailors and customers in one city; watch logs, reconciliation and disputes daily.
7. Add a Content Security Policy, strip image metadata on upload, and run an accessibility check with a screen reader.
