# TailorConnect Ghana

A web app that connects everyday Ghanaians with verified tailors, seamstresses and sewing companies near them.

A client picks a **style** and a **fabric design** and enters a **budget**. The app then recommends **verified tailors nearby** that fit the budget and shows them on a map. Next the client chooses how to be measured (enter their own measurements, book a **home visit from a measurement agent**, or go to the shop) and whether to have the outfit **delivered by a rider** or **pick it up**. Clients can also **buy fabric** on its own.

## User types

| Role | What they can do |
|---|---|
| **Client** | Order outfits through the step-by-step wizard, buy fabric, find tailors on a map, track orders |
| **Business** (tailor / seamstress / company) | Portal to manage fabric stock, the styles they sew and their prices, shop location, and incoming orders. Must be **verified** before clients can see them. |
| **Measurement agent** | Sees home-visit jobs nearby, takes a job, visits the client and submits measurements to the tailor. Must be verified. |
| **Delivery rider** | Sees finished orders ready for delivery nearby, picks up from the tailor and delivers. Must be verified. |
| **Admin** | Verifies or suspends businesses, agents and riders |

## Order journey

```
Placed → (tailor accepts) → Waiting for measurement* → Measurements received → Being sewn → Ready → Out for delivery* → Completed
```
\* Skipped if the client entered their own measurements, or chose to pick up.

## Running it locally

Needs [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install
cp .env.example .env          # then set AUTH_SECRET to a long random string
npm run setup                 # creates the database and loads demo data
npm run dev                   # open http://localhost:3000
```

### Demo accounts (password: `password123`)

| Email | Role |
|---|---|
| client@demo.gh | Client |
| business1@demo.gh | Auntie Ama's Stitches (verified seamstress, Accra) |
| business6@demo.gh | New Style Stitches (waiting for verification) |
| measurer@demo.gh | Measurement agent (verified) |
| rider@demo.gh | Delivery rider (verified) |
| rider2@demo.gh | Delivery rider (waiting for verification) |
| admin@demo.gh | Admin |

## Tech

- [Next.js](https://nextjs.org) (React) with TypeScript and Tailwind CSS
- [Prisma](https://www.prisma.io) database layer: SQLite locally, switch to PostgreSQL for production
- [Leaflet](https://leafletjs.com) + OpenStreetMap for maps (free, no API key)
- Browser geolocation for live location

## Not built yet

- **Payments**: Mobile Money (MTN MoMo, Telecel Cash, AirtelTigo) via Paystack or Hubtel
- **Notifications**: SMS/WhatsApp when an order changes stage
- **Photos**: real photos of styles and fabrics (they use illustrations for now)
- **Ratings and reviews** after an order is completed
- **Payouts** to tailors, agents and riders
- **Mobile app** (React Native / Expo, reusing the same backend)
