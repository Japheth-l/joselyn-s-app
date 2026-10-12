# UI conventions (V2)

How pages, forms and actions are written. Keep new code consistent with this.

## Layers

- `src/server/services/*` — all business rules and **all permission checks**. Every mutation goes through a service
  function that takes the `Actor` first and throws `AppError` (`NOT_FOUND`, `FORBIDDEN`, `INVALID`, `CONFLICT`,
  `UNAVAILABLE`, `RATE_LIMITED`).
- `src/app/actions/<area>.ts` — `"use server"` files. Each action has the signature
  `(prev: ActionResult, fd: FormData) => Promise<ActionResult>` and wraps its body in `run(async (actor) => { … })`
  from `@/server/action`. `run` requires a signed-in actor, converts errors into a form message, logs unexpected
  errors without details, revalidates pages, and lets `redirect()` through. Return a short success sentence.
  Read form fields with `str / optStr / optNum / bool / list` from `@/server/forms`.
- Pages are **server components** that read with Prisma (`db` from `@/lib/db`) after checking access:
  - signed-in only: `const actor = await requireActor()` (`@/server/auth`)
  - business pages: `requireMember(actor, businessId, "STAFF" | "MANAGER" | "OWNER")` from `@/server/authz`,
    wrapped so that a non-member gets `notFound()` (from `next/navigation`), never a hint that the business exists.
  - admin pages: `isAdmin(actor, "PERMISSION")` → otherwise `notFound()`.
  - professionals: `agentStatus(actor, "MEASURER" | "RIDER")`.
  Hiding a button is never the control; the service re-checks on every action.
- Never select or render more personal data than the viewer needs. Customer addresses and phone numbers are shown to
  a rider or measurement professional only after they accept the job (the services enforce this; pages must not
  query around it). Never show full measurement profiles to anyone but the owner, the order's business, and the
  assigned professional.

## Components (`src/components/ui`)

- `ActionForm` (client) — `<ActionForm action={someAction} resetOnSuccess className="…">…</ActionForm>`. Put ids in
  hidden inputs. Shows error/success messages.
- `SubmitButton` — pending-aware submit button. `ConfirmButton` — two-tap button for destructive or
  money-moving actions (cancel, refund, suspend, delete, payout). Use it for anything hard to undo.
- `basics.tsx` — `PageHeader`, `Section`, `Empty`, `Badge`, `OrderStatusBadge`, `VerificationBadge`, `DemoBadge`,
  `Dl`, `Field`, `Stars`.
- `SubNav` (client) — horizontally scrollable tabs for portal sections.
- `@/components/swatch` — `Swatch` (fabric) and `StyleImage` (style photo or emoji).
- `@/components/map` — `TailorMap` (Leaflet, client-only). `@/components/use-location` — browser geolocation hook.

CSS utilities from `globals.css`: `btn-primary`, `btn-secondary`, `btn-danger`, `card`, `label`, `input`, `badge`,
`page-title`. Colours: `brand-*` (green), `gold-*`, `clay-500`, Tailwind `stone-*` greys.

## Formatting

- Money is integer pesewas everywhere: display with `formatMoney()` (`@/lib/money`); parse cedi input in services.
- Fabric quantities are hundredths: `formatQty(centi, unit)` (`@/lib/qty`).
- Dates: `formatDate / formatDateTime` (`@/lib/time`, Africa/Accra). `datetime-local` inputs are Accra time.
- Labels for stored codes: `labelOf(MAP, code)` and the maps in `@/lib/enums`.
- The product name comes from `BRAND.name` (`@/lib/brand`); don't hard-code it.

## Mobile first

- Design for 360 px wide first. No fixed widths wider than the screen; long text uses `break-words`/`truncate`;
  tables become stacked cards on small screens (or sit in `overflow-x-auto` wrappers inside the card).
- Tap targets at least 40 px high. Forms are single-column on phones (`grid gap-4 sm:grid-cols-2`).
- Every input has a `<label>`; status is never shown by colour alone.

## Honesty rules

- Never invent ratings, distances, prices, availability or statistics. Show "No reviews yet", "Price on request".
- Demo records (`isDemo`) show `DemoBadge`. In sandbox payment mode the layout shows a banner.
- When an external service is not configured (SMS, email, payments, storage), say so plainly; don't pretend it worked.
