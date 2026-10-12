# V2 Implementation Plan and Progress

Status key: ✅ done and tested · 🟡 done, with limits noted · ⬜ not started · ⛔ blocked on an external account

| Phase | Scope | Status |
|---|---|---|
| 1 | Audit, architecture, plan | ✅ |
| 2 | PostgreSQL everywhere, V2 schema, baseline and V2 migrations, money/quantity helpers, authz, validation, audit log, test harness | ✅ |
| 3 | Auth (verify email, reset password, rate limits, session revocation, suspension), multi-role accounts, business organisations and staff, verification applications | 🟡 email sending needs a Resend key (links are logged in development) |
| 4 | Catalogue (categories, styles, design options), fabric listings, inventory ledger and reservations, file storage | 🟡 S3 driver written but not tested against a real bucket |
| 5 | Matching engine, location, quotations, custom order creation | ✅ |
| 6 | Measurement profiles and revisions, appointments, production tracking, messaging, notifications | 🟡 SMS/email need Arkesel/Resend keys; WhatsApp not implemented |
| 7 | Delivery legs and proof of delivery, pickup, payments (provider interface, Paystack, sandbox), deposits, ledger, refunds, payouts | 🟡 Paystack untested against the live API (no key); payouts are recorded manually |
| 8 | Reviews and moderation, disputes, support tickets, admin portal with permissions, reports, settings, templates | ✅ |
| 9 | Responsive and accessibility pass, end-to-end tests, security tests, performance | 🟡 360 px overflow, access and full-flow tests pass; no formal accessibility audit or load test |
| 10 | Deployment config, migration rehearsal on a V1 copy, backups, monitoring, final report | 🟡 rehearsed locally; production deploy awaits review |

Each phase ends with type-check, unit/integration tests and a production build, followed by a commit on the
`v2` branch.

## Required test scenarios (from the specification)

| # | Scenario | Test |
|---|---|---|
| 1 | Customer cannot access another customer's order | `tests/integration/scenarios.test.ts` §1; e2e `access.spec.ts` |
| 2 | Tailor cannot manage another business's inventory | `scenarios.test.ts` §2 |
| 3 | Unverified business cannot accept orders | `scenarios.test.ts` §3 |
| 4 | Customer completes the full order workflow | `scenarios.test.ts` §4 (service level); e2e `order-flow.spec.ts` (browser, phone size) |
| 5 | Customer reuses measurements without a visit | `scenarios.test.ts` §5 |
| 6 | Measurer submits only for authorised appointments | `scenarios.test.ts` §6 |
| 7 | Concurrent orders cannot oversell fabric | `scenarios.test.ts` §7 (10 simultaneous orders) |
| 8 | Customer cannot mark own payment confirmed | `scenarios.test.ts` §8 |
| 9 | Duplicate webhooks don't duplicate ledger entries | `scenarios.test.ts` §9 (signature, 3 concurrent duplicates, underpayment) |
| 10 | Order cannot jump between states | `scenarios.test.ts` §10; `tests/unit/order-machine.test.ts` |
| 11 | Unassigned rider cannot access a delivery | `scenarios.test.ts` §11; e2e `access.spec.ts` |
| 12 | Refund and ledger stay consistent | `scenarios.test.ts` §12; `maintenance.test.ts` (late payment refunded) |
| 13 | Self-pickup creates no delivery assignment | `scenarios.test.ts` §13 |
| 14 | Admin sensitive actions are audited | `scenarios.test.ts` §14 |
| 15 | Mobile flows have no horizontal overflow | e2e `mobile.spec.ts` (public, customer, business, professional and admin pages at 360 px) |

## Decisions log

- Keep Next.js/Prisma; move dev and test to PostgreSQL (see architecture §Guiding decisions).
- Brand stays **Ntoma** (latest instruction), centralised in `src/lib/brand.ts`.
- V2 is developed on branch `v2`; the live site deploys from `initial-web-app` and is untouched until merge.
- Payment events are recorded only for final provider results, so a "pending" check never blocks the later success.
- A payment that arrives after its order was cancelled is refunded in full automatically.
- Handover codes are rate-limited (5 attempts per hour per order/delivery) because six digits can be guessed.
- V1 ratings were typed in (and invented in demo data); the migration recomputes them from real reviews.
- Two-tap confirm buttons render the armed button as a new element; reusing the node submitted on the first tap
  (found by the end-to-end tests).
- The business portal, admin portal and professional/account pages were built in parallel by helper agents following
  `docs/UI_CONVENTIONS.md`, then reviewed, type-checked, built and tested together.
