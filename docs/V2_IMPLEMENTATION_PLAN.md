# V2 Implementation Plan and Progress

Status key: ✅ done and tested · 🟡 done, with limits noted · ⬜ not started · ⛔ blocked on an external account

| Phase | Scope | Status |
|---|---|---|
| 1 | Audit, architecture, plan | ✅ |
| 2 | PostgreSQL everywhere, V2 schema, baseline and V2 migrations, money/quantity helpers, authz, validation, audit log, test harness | ⬜ |
| 3 | Auth (verify email, reset password, rate limits, session revocation, suspension), multi-role accounts, business organisations and staff, verification applications | ⬜ |
| 4 | Catalogue (categories, styles, design options), fabric listings, inventory ledger and reservations, file storage | ⬜ |
| 5 | Matching engine, location, quotations, custom order creation | ⬜ |
| 6 | Measurement profiles and revisions, appointments, production tracking, messaging, notifications | ⬜ |
| 7 | Delivery legs and proof of delivery, pickup, payments (provider interface, Paystack, sandbox), deposits, ledger, refunds, payouts | ⬜ |
| 8 | Reviews and moderation, disputes, support tickets, admin portal with permissions, reports, settings, templates | ⬜ |
| 9 | Responsive and accessibility pass, end-to-end tests, security tests, performance | ⬜ |
| 10 | Deployment config, migration rehearsal on a V1 copy, backups, monitoring, final report | ⬜ |

Each phase ends with type-check, unit/integration tests and a production build, followed by a commit on the
`v2` branch.

## Required test scenarios (from the specification)

| # | Scenario | Test |
|---|---|---|
| 1 | Customer cannot access another customer's order | |
| 2 | Tailor cannot manage another business's inventory | |
| 3 | Unverified business cannot accept orders | |
| 4 | Customer completes the full order workflow | |
| 5 | Customer reuses measurements without a visit | |
| 6 | Measurer submits only for authorised appointments | |
| 7 | Concurrent orders cannot oversell fabric | |
| 8 | Customer cannot mark own payment confirmed | |
| 9 | Duplicate webhooks don't duplicate ledger entries | |
| 10 | Order cannot jump between states | |
| 11 | Unassigned rider cannot access a delivery | |
| 12 | Refund and ledger stay consistent | |
| 13 | Self-pickup creates no delivery assignment | |
| 14 | Admin sensitive actions are audited | |
| 15 | Mobile flows have no horizontal overflow | |

## Decisions log

- Keep Next.js/Prisma; move dev and test to PostgreSQL (see architecture §Guiding decisions).
- Brand stays **Ntoma** (latest instruction), centralised in `src/lib/brand.ts`.
- V2 is developed on branch `v2`; the live site deploys from `initial-web-app` and is untouched until merge.
