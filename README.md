# Ntoma

A marketplace that connects people in Ghana with verified tailors, seamstresses, tailoring companies and fabric
sellers near them, with measurement professionals and delivery riders to fill the gaps.

A customer chooses a **style** and its details, says where the **fabric** comes from, how they'll be **measured**,
their **budget** and **date**. Ntoma shows verified tailors nearby with an honest estimate and the reasons behind
each match, and asks the chosen ones for **itemised quotes**. The customer accepts one, pays a deposit by Mobile
Money or card, follows production step by step, and collects the outfit or has it delivered. Handover is confirmed
with a one-time code.

## Who uses it

| Role | What they do |
|---|---|
| **Customer** | Orders outfits, buys fabric, keeps measurement profiles for the family, pays, tracks, reviews, raises disputes |
| **Business** (tailor, seamstress, company, fabric seller) | An organisation with owner, managers and staff. Quotes, production, fabric inventory with reservations, styles and prices, workshop visits, team, finance. Hidden from customers until verified |
| **Measurement professional** | Accepts home visits nearby (customer details only after accepting), records measurements |
| **Delivery rider** | Accepts deliveries, confirms handover with the customer's code |
| **Administrator** | Permission-based: verifications, users, orders, disputes, refunds, payouts, catalogue, settings, message templates, reports, audit log |

One account can hold several roles.

## Order lifecycle

```
Quote requested → Quoted → Awaiting payment → Awaiting measurements → Measurements confirmed → In production
→ Quality check → Ready → (Delivery assigned → Picked up → In transit → Delivered | Collected) → Completed
```

Side exits: Cancelled (before production, refunded per policy), Disputed (reviewed by an administrator), Refunded.
Every change is checked against a transition table and recorded in the order's timeline.

## Running it locally

Needs Node.js 22 and PostgreSQL.

```bash
cp .env.example .env            # set DATABASE_URL and AUTH_SECRET
npm ci
npx prisma migrate deploy
npm run db:seed                 # style catalogue, an admin and demo data
npm run dev                     # http://localhost:3000
```

Local accounts after seeding (local databases only: the seed refuses demo data, and the default administrator
password, for any other database):

| Email | Password | What it is |
|---|---|---|
| admin@ntoma.example | `local-admin-password` (or `ADMIN_PASSWORD`) | Administrator with every permission |
| customer@demo.ntoma.example | `demo-password` (or `DEMO_PASSWORD`) | Demo customer |
| business1@demo.ntoma.example … business5@… | same | Owners of the five demo businesses |
| measurer@demo.ntoma.example, rider@demo.ntoma.example | same | Verified demo professionals |

Demo records are flagged and shown with a "Demo listing" badge. No reviews, ratings or orders are invented.

With `PAYMENTS_MODE=sandbox`, checkout goes to a clearly-labelled test page and no real money moves.

## Tests

```bash
npm test            # Vitest: unit tests + integration tests against PostgreSQL (the 14 server-side required scenarios)
npm run test:e2e    # Playwright at phone width against a running build (see docs/DEPLOYMENT.md)
```

## Deploying

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the Render setup, environment variables, scheduled jobs,
going live with Paystack, backups and rollback.

## Documentation

- [docs/V2_AUDIT.md](docs/V2_AUDIT.md): what V1 had and what had to change
- [docs/V2_ARCHITECTURE.md](docs/V2_ARCHITECTURE.md): data model, state machine, ledger, payments, matching, security
- [docs/V2_IMPLEMENTATION_PLAN.md](docs/V2_IMPLEMENTATION_PLAN.md): progress, the test for each required scenario, decisions
- [docs/UI_CONVENTIONS.md](docs/UI_CONVENTIONS.md): how pages, forms and actions are written

## Tech

- [Next.js](https://nextjs.org) (App Router, server actions), React 19, TypeScript, Tailwind CSS
- [Prisma](https://www.prisma.io) + PostgreSQL with versioned migrations
- [Paystack](https://paystack.com/gh) payments, [Arkesel](https://arkesel.com) SMS, [Resend](https://resend.com) email, S3-compatible storage
- [Leaflet](https://leafletjs.com) with OpenStreetMap tiles
- Vitest and Playwright
- A native wrapper app in [`mobile/`](mobile/README.md) (Expo)
