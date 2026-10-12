# V2 Audit: the existing application (V1)

Audited on branch `initial-web-app` at commit `b749f0c` ("Rename the app to Ntoma…"), the commit deployed at
`https://tailorconnect-yvz5.onrender.com/`. V2 work happens on the `v2` branch so the live deployment is not
touched until V2 is reviewed and merged.

> **Naming.** The specification calls the product *TailorConnect*. The most recent change renamed the visible
> brand to **Ntoma** (Akan for "cloth"). V2 keeps *Ntoma* as the brand and centralises it in
> `src/lib/brand.ts`, so the name can be changed in one place. Render resource names stay `tailorconnect`
> because renaming them would make Render create new resources.

## 1. Stack

| Area | V1 |
|---|---|
| Framework | Next.js 15.5 (App Router, React 19, server components and server actions), TypeScript 5.9 (strict) |
| Styling | Tailwind CSS 4 with a few `@utility` components in `src/app/globals.css`. Light theme only; no dark theme. |
| Database | Prisma 6.19. SQLite file locally; **PostgreSQL in production** via a generated copy of the schema (`scripts/postgres-schema.mjs`). |
| Migrations | **None.** Production runs `prisma db push` on every start. |
| Auth | Custom: bcrypt password hashes, HS256 JWT in an httpOnly cookie (`jose`), checked by `src/middleware.ts` and re-read from the database by `requireUser()`. No email verification, no password reset, no rate limiting, no session revocation. |
| Maps | Leaflet + OpenStreetMap tiles (no key). Distance by Haversine in application code. |
| Payments | Paystack (initialize, verify, HMAC-SHA512 webhook) with a demo checkout when no key is set. |
| SMS | Arkesel HTTP API; messages are only logged when no key is set. |
| Uploads | Local disk under `UPLOAD_DIR`, served by `/uploads/[name]`. File type checked by magic bytes. |
| Mobile | Expo SDK 54 WebView shell in `mobile/`; the site is also an installable PWA. |
| Hosting | Render Blueprint (`render.yaml`): free web service and free PostgreSQL in Frankfurt. Build `npm ci && npm run deploy:build`; start `npm run deploy:start`. |

## 2. Baseline checks (before any V2 change)

| Check | Result |
|---|---|
| `tsc --noEmit` | Passes |
| `next build` | Passes (27 routes) |
| Lint | No ESLint configuration; nothing to run |
| Automated tests | **None in the repository.** A Playwright script was run by hand during V1 development but is not committed. |
| `npm audit --omit=dev` | 3 high: `deepmerge-ts < 8` pulled in by the `prisma` CLI configuration loader (build-time tool, not served to users) |
| Source size | ~3,900 lines of TypeScript under `src/` |

## 3. Environment variables (names only)

`DATABASE_URL`, `AUTH_SECRET`, `APP_URL`, `PAYSTACK_SECRET_KEY`, `ARKESEL_API_KEY`, `SMS_SENDER_ID`,
`UPLOAD_DIR`, `ADMIN_PASSWORD` (Render only). Render also provides `RENDER_EXTERNAL_URL`. `.env` is git-ignored.

## 4. Data model (V1)

`User` (single `role` string: CLIENT, BUSINESS, MEASURER, RIDER, ADMIN), `Business` (one per owner user),
`Style`, `BusinessStyle`, `Material`, `Order`, `BusinessPhoto`, `Review`, `Notification`, `Payout`.

Problems:

- **Money is stored as `Float` cedis.** Binary floating point is unsafe for accounting.
- **Order status is a free string.** Transitions are enforced by `updateMany` guards in `src/app/actions/orders.ts`, but there is no transition table, no event history and no actor recorded.
- **Price is fixed when the order is placed**, from the business's indicative price. There are no quotations, no revisions and no way for a business to confirm the fabric quantity or deadline.
- **Stock is decremented immediately** when an order is placed. There are no reservations, no expiry and no inventory ledger. A conditional `updateMany` prevents overselling, which is good and is kept.
- **Measurements are a JSON string on the order.** There is no customer measurement profile, no reuse, no revisions and no units.
- **One business per user, one role per user.** There are no organisations, memberships or staff.
- **Payment status is a single flag on the order.** There are no payment records, refunds, deposits or webhook deduplication. A repeated webhook was idempotent only because of a status check.
- **Payouts are created at completion without a ledger.** There is no commission entry and no refund reversal.
- **No audit log**, no disputes, no messaging and no support tickets.
- Demo data is mixed with real data and is not marked as demo.

## 5. Features (V1)

| Feature | State |
|---|---|
| Sign-up/login with roles, Ghana Card field for agents | Working. No verification email, password reset or rate limit. |
| Order wizard (style → fabric design → budget/location → tailor → measurements → delivery → confirm) | Working. Prices are estimates presented as final. |
| Budget-aware recommendations with map | Working, but simple: within-budget first, then distance. No availability, deadline, skills or explanation. |
| Business portal: orders, stock, styles and prices, photos, profile/location | Working, single owner only |
| Measurement agent board | Working; sees jobs after payment |
| Rider board | Working; no proof of delivery |
| Admin: verification, payouts, style catalogue | Working; no granular permissions, no audit |
| Payments (Paystack/demo) | Working. **Demo checkout is enabled on the public deployment**, because no Paystack key is set. |
| SMS + in-app notifications | Working (SMS logged only, no key) |
| Reviews | Working; no moderation or business response |
| Fabric shop | Working; fabric seller is not a separate business type |
| Disputes, refunds, messaging, appointments, quotations, deposits, data export/deletion | **Missing** |
| Terms, privacy, policies | **Missing** |
| Tests | **Missing** |

## 6. Deployment and data risks

- **Ephemeral disk on Render free plan:** uploaded photos are lost on every restart or deploy. V2 adds an S3-compatible storage driver (Cloudflare R2, S3 or Backblaze).
- **Free PostgreSQL expires 30 days after creation**, so data is at risk. Upgrade before real users arrive.
- **`prisma db push` on start** is unsafe for type changes: Float to integer would be refused or lose data. V2 switches to `prisma migrate deploy` with a baseline migration matching the current production schema, followed by a data-preserving V2 migration. See `docs/V2_ARCHITECTURE.md` §Migrations.
- Production data: the database holds the seeded demo records plus anything created while testing. The V2 migration keeps every row and marks the seeded records (`@demo.gh` emails) as demo.

## 7. Security observations

- Server-side authorisation exists for every server action (`requireUser(role)`), not only hidden buttons. ✔
- Session cookie is httpOnly, SameSite=Lax and Secure in production. ✔
- No login or signup rate limiting. ✘
- No way to suspend a user or revoke sessions. ✘
- Thrown errors in server actions surface as a generic error page in production. ✔ No secrets are leaked.
- Uploads are validated by content, use random names and are served with `nosniff`. ✔ Every upload is public, including anything sensitive. ✘
- No security headers (HSTS, frame-ancestors, CSP). ✘
- Admin account seeded with a generated `ADMIN_PASSWORD` on Render. ✔
