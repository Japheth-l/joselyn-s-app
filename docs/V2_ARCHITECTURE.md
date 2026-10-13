# V2 Architecture

## Guiding decisions

1. **Keep the stack.** Next.js + Prisma + PostgreSQL already supports everything V2 needs: transactions,
   row-level conditional updates and relational integrity. The specification mentions Firebase/Vite, but this
   repository does not use them, so there is nothing to migrate from. No second database or backend is introduced.
2. **PostgreSQL everywhere.** V1 used SQLite locally and PostgreSQL in production. V2 uses PostgreSQL in
   development, test and production. Reasons: one migration history (Prisma Migrate cannot share migrations
   across providers), concurrency behaviour that tests can rely on (`SELECT … FOR UPDATE`, conditional
   updates under real concurrency), and `text[]` columns. Local setup uses `docker compose up db` or any
   local Postgres.
3. **Service layer.** Business rules live in `src/server/services/*`. Each function takes an explicit
   `Actor` (`{ userId, roles, memberships, adminPermissions }`) and validates its input with zod. Server
   actions and route handlers are thin wrappers. This makes authorisation testable without a browser and
   keeps one implementation of each rule.
4. **Money in pesewas.** Every amount is an integer number of pesewas (GHS minor units). Formatting happens
   only at the UI edge (`formatMoney`). Rates are basis points (1% = 100 bps).
5. **Quantities in hundredths.** Fabric quantities are integers in hundredths of the listing's unit, so 2.5
   yards is 250. Each listing declares its unit (`YARD` or `METRE`).
6. **Africa/Accra time.** All dates are stored in UTC and displayed with `timeZone: "Africa/Accra"` (GMT, no
   daylight saving).

## Roles and permissions

| Concept | Model | Notes |
|---|---|---|
| Platform roles | `RoleAssignment(userId, role, permissions[])` | `CUSTOMER`, `MEASURER`, `RIDER`, `ADMIN`. A user can hold several. |
| Admin permissions | `RoleAssignment.permissions` for `ADMIN` | `USERS`, `VERIFY`, `CATALOGUE`, `ORDERS`, `DISPUTES`, `FINANCE`, `CONFIG`, `AUDIT`. `SUPER` grants all. |
| Businesses | `Business` (the organisation) | `kinds[]`: `TAILOR`, `SEAMSTRESS`, `COMPANY`, `FABRIC_SELLER`. A tailoring business can also sell fabric. |
| Business staff | `Membership(businessId, userId, role)` | `OWNER`, `MANAGER`, `STAFF`. Staff can update production. Only owners and managers handle quotes, prices, inventory, finance and members. |
| Verification | `VerificationApplication` | For businesses, measurement professionals and riders. Unverified parties can set up but cannot transact. |

`src/server/authz.ts` holds every check (`can.manageBusiness`, `can.viewOrder`, …). Pages call the same checks;
hiding a button is never the control.

## Order lifecycle

Order state (`Order.status`) is separate from payment state (`Order.paymentStatus`) and from delivery state
(`DeliveryAssignment.status`). Transitions are defined in one table in `src/server/order-machine.ts`:

```
DRAFT → QUOTE_REQUESTED → QUOTED → AWAITING_PAYMENT
  → AWAITING_MEASUREMENTS → MEASUREMENTS_CONFIRMED          (skipped when valid measurements are attached)
  → IN_PRODUCTION → QUALITY_CHECK → READY
  → (pickup)   COLLECTED                           → COMPLETED
  → (delivery) DELIVERY_ASSIGNED → PICKED_UP → IN_TRANSIT → DELIVERED → COMPLETED
Side exits: CANCELLED (before production), DISPUTED (from paid states), REFUNDED.
```

Every transition names the allowed actors and a guard (for example "deposit paid", "full balance paid before
handover" or "proof of delivery code matches"), and writes an `OrderEvent` row recording from/to, actor, time
and note. A conditional update (`WHERE status = from`) prevents races. Fabric-only orders use the same
machine with a shorter path (seller confirms the quote, then payment, `READY`, delivery/pickup, `COMPLETED`).

**Quotations.** A custom order is sent to one or more businesses (`Quotation` rows with status `REQUESTED`).
Each business replies with itemised lines, a completion date and the confirmed fabric quantity. The customer
accepts one, and the others are closed. A later change is a new quotation version with `revisionOf`. It does
not apply until the customer approves it, so an accepted price never changes silently.

## Inventory

`FabricListing.qtyOnHand` and `qtyReserved` are in hundredths of a unit. Reserving stock runs one SQL statement:

```sql
UPDATE "FabricListing" SET "qtyReserved" = "qtyReserved" + $qty
WHERE id = $id AND "qtyOnHand" - "qtyReserved" >= $qty AND status = 'ACTIVE'
```

If no row is updated, there was not enough stock. This is safe under concurrency without application locks.
Reservations (`FabricReservation`) expire, and a sweep releases expired unpaid ones. Stock is deducted
(`qtyOnHand -= q`, `qtyReserved -= q`) when production starts for tailoring orders, or at handover for
fabric orders. Every change writes an `InventoryMovement` row (`RESTOCK`, `ADJUST`, `RESERVE`, `RELEASE`,
`DEDUCT`).

## Payments and accounting

- `PaymentProvider` interface (`src/server/payments/`): `initialize`, `verify`, `parseWebhook`, `refund`.
  Implementations: **Paystack** (live when `PAYSTACK_SECRET_KEY` is set) and **Sandbox** (only when
  `PAYMENTS_MODE=sandbox`, always labelled "Sandbox: no real money"). With neither, checkout is disabled with
  an explanation. The app never simulates real payments.
- `Payment` rows are created before redirecting to the provider and become `SUCCEEDED` only after
  server-side verification (verify API or signed webhook). `PaymentEvent(provider, eventKey)` is unique, so
  duplicate webhooks are ignored.
- **Ledger** (`LedgerEntry`, append-only, integer pesewas, unique `idempotencyKey`). Accounts:
  - `CUSTOMER_FUNDS` (money held for an order)
  - `PLATFORM_REVENUE`
  - `PARTNER_PAYABLE` (with `partyType`/`partyId`)
  - `REFUNDS`
  - `PAYOUTS`

  On payment: `+CUSTOMER_FUNDS`. On completion, funds move to partners and the platform (commission and
  customer service fee). On refund, the matching reverse entries. On payout, `PARTNER_PAYABLE → PAYOUTS`.
  A partner's balance is the sum of their entries. Tests check that each order's entries net to zero after
  settlement.
- **Deposits:** a quotation may require a deposit (default from settings, in bps). Production needs the
  deposit; handover needs the full balance.
- **Payouts** are recorded by an administrator after sending Mobile Money manually. Automatic split
  settlement (Paystack Subaccounts or Transfers) needs merchant approval and a check of Bank of Ghana
  payment-service rules. It is documented, not built. V2 holds no customer wallet and no escrow product.

### Provider choice

Paystack is kept: it is already integrated and supports Ghana mobile money (MTN, Telecel, AirtelTigo), cards,
refunds, subaccounts and transfers. Hubtel is a credible alternative with strong local mobile-money coverage.
The interface allows adding it later. Fees and onboarding terms change, so check the current published terms
before launch.

## Matching engine

`src/server/matching.ts` is a pure function with no database access. It is unit-tested and returns each
candidate with a score and human-readable reasons. The hard filters remove:

- businesses that don't offer the style
- businesses that aren't verified
- businesses whose capacity is full before the deadline
- home measurement or delivery outside the service radius (pickup at the workshop is still allowed)

The score combines price fit (estimate against budget), distance, deadline slack, review score, completed
orders and response record. Each factor is shown only when real data exists. A missing indicative price
gives "price on request", not exclusion. Estimates are labelled "Estimate" until a quotation arrives.

## Location and maps

Maps use Leaflet with a tile URL from `NEXT_PUBLIC_MAP_TILE_URL`. The default is OpenStreetMap's public tiles,
which are fine for development but whose usage policy is unsuitable for production traffic, so production
should set a MapTiler, Stadia or Mapbox tile URL.

| Option | Strengths | Weaknesses | Decision |
|---|---|---|---|
| Google Maps Platform | Best Ghana address and landmark coverage | Billing account required; per-load pricing; key must be exposed client-side (referrer-restricted) | Not now |
| Mapbox | Good tiles, generous free tier | Ghana address coverage weaker than Google | Possible later |
| Leaflet + OSM-based tiles | Already integrated, no key | Geocoding of Ghana addresses is weak | **Chosen.** Customers give a GPS pin (with consent) or pick a point on the map, plus a landmark. |

Distance uses Haversine plus a bounding-box filter, since PostGIS is not needed at current scale. Live
location is requested only when the user presses a button, and only for an appointment or delivery address.
It is never shown publicly. Riders and measurers see exact addresses only after accepting.

## Measurements and appointments

- `MeasurementProfile` (per person, owned by a customer) holds `MeasurementRecord` revisions. Each record
  stores `values` (`{ key: { value, unit } }`), source, author, revision number and status.
  Garment-specific fields come from `Style.measurementKeys`.
- An order links one record. A business can read only records linked to its orders. A professional can write
  only for an appointment assigned to them.
- `Appointment` has a time window, fee, status and assigned professional. Accepting is a conditional update,
  and overlapping accepted appointments for the same professional are rejected.

## Delivery

`DeliveryAssignment` is one row per leg (`FABRIC_TO_TAILOR`, `FABRIC_TO_CUSTOMER`, `GARMENT_TO_CUSTOMER`).
The customer receives a 4-digit handover code (only its hash is stored). The rider must enter it to mark the
leg delivered, or report a failure with a reason. Self-pickup creates no assignment.

## Messaging, notifications and files

- One `Conversation` per order. Participants are derived from the order (customer, business members, and the
  assigned professional or rider). Messages can carry image attachments.
- `notify()` writes the in-app notification, then sends through the channel providers the user has enabled:
  SMS (Arkesel), email (Resend HTTP API) and WhatsApp (interface only). Each attempt is a
  `NotificationDelivery` row with status `SENT` (accepted by provider), `FAILED` or `SKIPPED`. "Delivered" is
  never claimed.
- Files: a `StoredFile` row (owner, visibility `PUBLIC`/`PRIVATE`, purpose, size, type) and a storage driver
  (`local` disk or `s3`-compatible such as Cloudflare R2). Public images are served at `/uploads/:key`.
  Private files (verification documents, order attachments, dispute evidence) are served at `/files/:id`
  only after an authorisation check.

## Security

- Sessions: JWT with a `sessionVersion` claim compared to the database on every request, so logout-everywhere,
  suspension and password reset revoke all sessions.
- Rate limits stored in the database (`RateLimit` table) on login, signup, password reset, verification email
  and uploads.
- Origin check on all mutating route handlers. Server actions already enforce same-origin.
- Security headers in `next.config.ts`: HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy` and a
  `Permissions-Policy` that allows geolocation and camera on the app's own origin only.
- `AuditEvent` for sensitive actions: role changes, verification decisions, suspensions, refunds, payouts,
  dispute decisions, settings changes and data exports or deletions. Passwords, tokens, payment secrets and
  measurement values are never logged.

## Migrations

Production was created with `prisma db push`, so it has no `_prisma_migrations` table.

1. `0000_baseline`: the exact V1 schema, generated with `prisma migrate diff --from-empty` from the V1
   schema.
2. `0001_v2`: hand-reviewed SQL that changes V1 in place.
   - Floats are converted to pesewas with `ROUND(x*100)` and yards to hundredths.
   - Roles move into `RoleAssignment`.
   - Each business gets an `OWNER` membership.
   - Old order statuses are mapped to V2 statuses.
   - The JSON measurements on old orders become `MeasurementRecord`s.
   - `@demo.gh` records are marked `isDemo`.
   - No rows are deleted.
3. `scripts/migrate.mjs` (run by `deploy:start`): if the `User` table exists but `_prisma_migrations`
   doesn't, it marks `0000_baseline` as applied, then runs `prisma migrate deploy`.

The upgrade was tested by building a V1 database with V1 code and data, then migrating it (see the
implementation plan, Phase 10).
