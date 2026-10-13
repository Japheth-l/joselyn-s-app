-- SYNTHETIC TEST DATA for migration rehearsals only. Never load this into production.
-- Adds V1 orders in every V1 state the 0001_v2 migration maps, including fractional cedi amounts
-- (rounding), paid/unpaid accepted orders, home visits, deliveries and pending/paid payouts.
-- Requires the V1 demo accounts/businesses from the V1 seed (client@demo.gh, business1@demo.gh, …).
BEGIN;
CREATE TEMP TABLE fx AS SELECT
  (SELECT id FROM "User" WHERE email = 'client@demo.gh') AS client,
  (SELECT id FROM "User" WHERE email = 'measurer@demo.gh') AS measurer,
  (SELECT id FROM "User" WHERE email = 'rider@demo.gh') AS rider,
  (SELECT id FROM "User" WHERE email = 'business1@demo.gh') AS owner1,
  (SELECT b.id FROM "Business" b JOIN "User" u ON u.id = b."ownerId" WHERE u.email = 'business1@demo.gh') AS biz1,
  (SELECT m.id FROM "Material" m JOIN "Business" b ON b.id = m."businessId" JOIN "User" u ON u.id = b."ownerId" WHERE u.email = 'business1@demo.gh' ORDER BY m."createdAt" LIMIT 1) AS mat1,
  (SELECT id FROM "Style" ORDER BY name LIMIT 1) AS style1;

INSERT INTO "Order" (id, kind, status, "clientId", "businessId", "styleId", "materialId", yards, "ownFabric", notes, budget,
  "measurementMethod", "measurementTime", measurements, "measurerId", fulfilment, "riderId", "clientAddress", "clientLat", "clientLng",
  "laborPrice", "materialPrice", "measurementFee", "deliveryFee", total, "paymentStatus", "paymentRef", "paidAt", "createdAt", "updatedAt")
SELECT v.id, v.kind, v.status, fx.client, fx.biz1, CASE WHEN v.kind = 'SEW' THEN fx.style1 END, fx.mat1, v.yards, false, 'rehearsal fixture', v.budget,
  v.mm, CASE WHEN v.mm = 'HOME_VISIT' THEN now() + interval '2 days' END, v.meas,
  CASE WHEN v.with_measurer THEN fx.measurer END, v.fulfilment, CASE WHEN v.with_rider THEN fx.rider END,
  CASE WHEN v.mm = 'HOME_VISIT' OR v.fulfilment = 'DELIVERY' THEN 'Fixture address, Osu' END,
  CASE WHEN v.mm = 'HOME_VISIT' OR v.fulfilment = 'DELIVERY' THEN 5.556 END,
  CASE WHEN v.mm = 'HOME_VISIT' OR v.fulfilment = 'DELIVERY' THEN -0.182 END,
  v.labor, v.material, v.mfee, v.dfee, v.labor + v.material + v.mfee + v.dfee,
  v.paid, CASE WHEN v.paid = 'PAID' THEN 'rhfix-ref-' || v.id END, CASE WHEN v.paid = 'PAID' THEN now() - interval '3 days' END,
  now() - interval '10 days', now() - interval '1 day'
FROM fx, (VALUES
  ('rhfix_declined',      'SEW',    'DECLINED',             2.0, NULL::float8, NULL,        NULL,                                   false, 'PICKUP',   false, 200.00, 0.00,  0.00, 0.00, 'UNPAID'),
  ('rhfix_cancelled',     'SEW',    'CANCELLED',            2.0, 300.00,      'SELF',      NULL,                                   false, 'PICKUP',   false, 250.00, 0.00,  0.00, 0.00, 'UNPAID'),
  ('rhfix_await_unpaid',  'SEW',    'AWAITING_MEASUREMENT', 6.0, NULL,        'HOME_VISIT', NULL,                                  false, 'PICKUP',   false, 180.00, 330.00, 30.00, 0.00, 'UNPAID'),
  ('rhfix_await_paid',    'SEW',    'AWAITING_MEASUREMENT', 6.0, NULL,        'HOME_VISIT', NULL,                                  true,  'PICKUP',   false, 180.00, 330.00, 30.00, 0.00, 'PAID'),
  ('rhfix_sewing_frac',   'SEW',    'SEWING',               2.5, 150.00,      'SELF',      '{"chest":36.5,"waist":30.25,"hips":40}', false, 'PICKUP',   false, 100.15, 23.30, 0.00, 0.00, 'PAID'),
  ('rhfix_ready_deliv',   'SEW',    'READY',                6.0, NULL,        'AT_SHOP',   '{"chest":38,"waist":31}',              false, 'DELIVERY', false, 200.00, 330.00, 0.00, 25.00, 'PAID'),
  ('rhfix_out_for_deliv', 'SEW',    'OUT_FOR_DELIVERY',     6.0, NULL,        'SELF',      '{"chest":38,"waist":31}',              false, 'DELIVERY', true,  200.00, 330.00, 0.00, 25.00, 'PAID'),
  ('rhfix_ready_pickup',  'SEW',    'READY',                6.0, NULL,        'SELF',      '{"chest":38,"waist":31}',              false, 'PICKUP',   false, 200.00, 330.00, 0.00, 0.00, 'PAID'),
  ('rhfix_fabric_done',   'FABRIC', 'COMPLETED',            3.0, NULL,        NULL,        NULL,                                   false, 'PICKUP',   false, 0.00,   165.00, 0.00, 0.00, 'PAID'),
  ('rhfix_done_delivery', 'SEW',    'COMPLETED',            6.0, 800.00,      'HOME_VISIT', '{"chest":40,"waist":34,"hips":44}',   true,  'DELIVERY', true,  220.00, 330.00, 30.00, 25.00, 'PAID')
) AS v(id, kind, status, yards, budget, mm, meas, with_measurer, fulfilment, with_rider, labor, material, mfee, dfee, paid);

-- Payouts: one PENDING business payout with a fractional amount, and a fully settled delivery order.
INSERT INTO "Payout" (id, "userId", "orderId", role, amount, status, reference, "paidAt", "createdAt")
SELECT v.id, v.uid, v.oid, v.role, v.amount, v.status, v.ref, CASE WHEN v.status = 'PAID' THEN now() - interval '12 hours' END, now() - interval '1 day'
FROM fx, LATERAL (VALUES
  ('rhfix_po_fab',  fx.owner1,   'rhfix_fabric_done',   'BUSINESS', 148.50, 'PENDING', NULL),
  ('rhfix_po_biz',  fx.owner1,   'rhfix_done_delivery', 'BUSINESS', 495.00, 'PAID',    'MM-FIXTURE-1'),
  ('rhfix_po_meas', fx.measurer, 'rhfix_done_delivery', 'MEASURER', 30.00,  'PAID',    'MM-FIXTURE-2'),
  ('rhfix_po_ride', fx.rider,    'rhfix_done_delivery', 'RIDER',    25.00,  'PENDING', NULL)
) AS v(id, uid, oid, role, amount, status, ref);

INSERT INTO "Review" (id, "orderId", "businessId", "clientId", rating, comment, "createdAt")
SELECT 'rhfix_review', 'rhfix_done_delivery', fx.biz1, fx.client, 5, 'Fixture review', now() FROM fx;

INSERT INTO "Notification" (id, "userId", "orderId", message, link, read, "createdAt")
SELECT 'rhfix_note_' || o.id, fx.client, o.id, 'Fixture notification', '/orders/' || o.id, false, now() FROM fx, "Order" o WHERE o.id LIKE 'rhfix_%';
COMMIT;
